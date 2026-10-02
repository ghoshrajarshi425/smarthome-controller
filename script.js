// =====================================================
// SMARTHOME ENGINE - MQTT OVER WEBSOCKET INTEGRATION
// =====================================================

// MQTT Broker Connection Settings
// New (required for GitHub Pages https://)
const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";

// Dynamic Client ID so each browser tab has a distinct connection
const CLIENT_ID = "SmartHome-Browser-" + Math.random().toString(16).substring(2, 8);

// Topic Dictionary Mapping Indexes (0=Light1, 1=Fan1, 2=Light2, 3=Socket1)
const DEVICE_TOPICS = [
    {
        name: "Living Room Light",
        setTopic: "smarthome/rajarshi/light1/set",
        stateTopic: "smarthome/rajarshi/light1/state"
    },
    {
        name: "Ceiling Fan",
        setTopic: "smarthome/rajarshi/fan1/set",
        stateTopic: "smarthome/rajarshi/fan1/state"
    },
    {
        name: "Bedroom Light",
        setTopic: "smarthome/rajarshi/light2/set",
        stateTopic: "smarthome/rajarshi/light2/state"
    },
    {
        name: "Smart Socket",
        setTopic: "smarthome/rajarshi/socket1/set",
        stateTopic: "smarthome/rajarshi/socket1/state"
    }
];

const STATUS_TOPIC = "smarthome/rajarshi/status";

let mqttClient = null;

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    initRoomFilters();
    connectMQTT();
});

// ================= MQTT CONNECTION & HANDLING =================
function connectMQTT() {
    console.log("Connecting to MQTT broker via WebSockets...");
    updateNetworkStatusUI(false, "Connecting to Broker...");

    mqttClient = mqtt.connect(BROKER_URL, {
        clientId: CLIENT_ID,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 3000
    });

    mqttClient.on("connect", () => {
        console.log("Connected to MQTT Broker via WebSocket: " + CLIENT_ID);
        updateNetworkStatusUI(true, "Broker Online • Waiting for ESP8266");

        // Subscribe to ESP8266 hardware status
        mqttClient.subscribe(STATUS_TOPIC, { qos: 1 });

        // Subscribe to state topics for all 4 channels
        DEVICE_TOPICS.forEach((dev) => {
            mqttClient.subscribe(dev.stateTopic, { qos: 1 });
            console.log("Subscribed to state: " + dev.stateTopic);
        });
    });

    // Handle incoming messages from ESP8266
    mqttClient.on("message", (topic, messageBuffer) => {
        const payload = messageBuffer.toString();
        console.log(`[MQTT IN] ${topic} -> ${payload}`);

        // 1. Hardware Status (LWT)
        if (topic === STATUS_TOPIC) {
            const isOnline = (payload === "ONLINE");
            updateNetworkStatusUI(isOnline, isOnline ? "Hardware Online" : "Hardware Offline");
            return;
        }

        // 2. Relay State Updates
        DEVICE_TOPICS.forEach((dev, index) => {
            if (topic === dev.stateTopic) {
                const isTurnedOn = (payload === "ON");
                applyHardwareStateToUI(index, isTurnedOn);
            }
        });
    });

    mqttClient.on("error", (err) => {
        console.error("MQTT Connection Error:", err);
        updateNetworkStatusUI(false, "Broker Error");
    });

    mqttClient.on("offline", () => {
        console.warn("MQTT Client went offline.");
        updateNetworkStatusUI(false, "Network Offline");
    });
}

// ================= UPDATE UI FROM HARDWARE TRUTH =================
function applyHardwareStateToUI(deviceIndex, isTurnedOn) {
    // 1. Sync Dashboard View Card
    const dashCards = document.querySelectorAll(".device-card");
    if (dashCards[deviceIndex]) {
        const card = dashCards[deviceIndex];
        const checkbox = card.querySelector('input[type="checkbox"]');
        const stateText = card.querySelector(".state");

        checkbox.checked = isTurnedOn;
        if (isTurnedOn) {
            card.classList.add("active");
            if (stateText) stateText.textContent = "ON";
        } else {
            card.classList.remove("active");
            if (stateText) stateText.textContent = "OFF";
        }
    }

    // 2. Sync Devices Inventory View Row
    const detailCards = document.querySelectorAll(".device-detail-card");
    if (detailCards[deviceIndex]) {
        const detailCard = detailCards[deviceIndex];
        const checkbox = detailCard.querySelector('input[type="checkbox"]');
        const statusIndicator = detailCard.querySelector(".device-status-indicator");
        const stateText = detailCard.querySelector(".device-state-text");

        checkbox.checked = isTurnedOn;
        if (isTurnedOn) {
            statusIndicator.classList.add("active");
            if (stateText) stateText.textContent = "ON";
        } else {
            statusIndicator.classList.remove("active");
            if (stateText) stateText.textContent = "OFF";
        }
    }

    updateActiveDeviceCounter();
}

// ================= USER INTERACTION DISPATCHERS =================

// Triggered from Dashboard View checkbox toggles: onchange="updateSwitch(this)"
function updateSwitch(inputElement) {
    const card = inputElement.closest(".device-card");
    const allCards = Array.from(document.querySelectorAll(".device-card"));
    const deviceIndex = allCards.indexOf(card);

    dispatchCommand(deviceIndex, inputElement.checked);
}

// Triggered from Devices View checkbox toggles: onchange="handleDeviceToggle(this)"
function handleDeviceToggle(inputElement) {
    const detailCard = inputElement.closest(".device-detail-card");
    const allDetailCards = Array.from(document.querySelectorAll(".device-detail-card"));
    const deviceIndex = allDetailCards.indexOf(detailCard);

    dispatchCommand(deviceIndex, inputElement.checked);
}

// Publishes command payload to MQTT broker
function dispatchCommand(deviceIndex, isTurnedOn) {
    if (!mqttClient || !mqttClient.connected) {
        alert("MQTT Broker not connected. Please check your internet connection.");
        return;
    }

    const command = isTurnedOn ? "ON" : "OFF";
    const topic = DEVICE_TOPICS[deviceIndex].setTopic;

    console.log(`[MQTT OUT] Publishing ${command} to ${topic}`);
    mqttClient.publish(topic, command, { qos: 1 });
}

// ================= REAL-TIME SYSTEM STATUS UI =================
function updateNetworkStatusUI(isOnline, statusMessage) {
    // 1. Sidebar bottom connection indicator
    const connectionBox = document.querySelector(".connection");
    const connectionText = connectionBox ? connectionBox.querySelector("strong") : null;
    const connectionSub = connectionBox ? connectionBox.querySelector("small") : null;
    const connectionDot = document.querySelector(".connection-dot");

    if (connectionText) connectionText.textContent = isOnline ? "System Online" : "System Alert";
    if (connectionSub) connectionSub.textContent = statusMessage;
    if (connectionDot) {
        connectionDot.style.background = isOnline ? "var(--green)" : "#ff5252";
        connectionDot.style.boxShadow = isOnline ? "0 0 12px var(--green)" : "0 0 12px #ff5252";
    }

    // 2. Home Status Card Badge
    const onlineBadge = document.querySelector(".online-status strong");
    const onlineDot = document.querySelector(".online-status span");

    if (onlineBadge) {
        onlineBadge.textContent = isOnline ? "ONLINE" : "OFFLINE";
        onlineBadge.style.color = isOnline ? "var(--green)" : "#ff5252";
    }
    if (onlineDot) {
        onlineDot.style.background = isOnline ? "var(--green)" : "#ff5252";
        onlineDot.style.boxShadow = isOnline ? "0 0 10px var(--green)" : "0 0 10px #ff5252";
    }
}

function updateActiveDeviceCounter() {
    const activeCheckboxes = document.querySelectorAll('.device-card input[type="checkbox"]:checked');
    const counterDisplay = document.querySelector(".device-count");
    if (counterDisplay) {
        const count = activeCheckboxes.length;
        counterDisplay.textContent = count < 10 ? "0" + count : count;
    }
}

// ================= SPA VIEW ROUTING =================
function initNavigation() {
    const menuItems = document.querySelectorAll(".side-menu .menu-item");
    const views = document.querySelectorAll(".page-view");
    const greetingText = document.querySelector(".greeting");

    menuItems.forEach((clickedItem) => {
        clickedItem.addEventListener("click", (event) => {
            event.preventDefault();
            menuItems.forEach((item) => item.classList.remove("active"));
            clickedItem.classList.add("active");

            const targetViewId = clickedItem.dataset.view;
            views.forEach((view) => {
                view.classList.remove("active");
                if (view.id === `view-${targetViewId}`) {
                    view.classList.add("active");
                }
            });

            if (greetingText) {
                greetingText.textContent = `SMART HOME / ${targetViewId.toUpperCase()}`;
            }
        });
    });
}

// ================= ROOM FILTERS =================
function initRoomFilters() {
    const filterButtons = document.querySelectorAll(".pill-btn");
    const detailCards = document.querySelectorAll(".device-detail-card");

    filterButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            filterButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            const selectedRoom = btn.dataset.filter;
            detailCards.forEach((card) => {
                if (selectedRoom === "all" || card.dataset.room === selectedRoom) {
                    card.style.display = "flex";
                } else {
                    card.style.display = "none";
                }
            });
        });
    });
}

// ================= EMERGENCY CONTROLS =================
function emergencyMasterOff() {
    if (!mqttClient || !mqttClient.connected) return;

    DEVICE_TOPICS.forEach((dev) => {
        mqttClient.publish(dev.setTopic, "OFF", { qos: 1 });
    });
    console.log("Master Kill: Published OFF to all channels.");
}

function saveSettings() {
    alert("Configuration parameters updated.");
}