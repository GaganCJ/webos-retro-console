// public/assets/js/network.js

// Shared socket declaration, but initialized specifically per role
let socket;

const isController = window.location.pathname.includes('controller');

if (isController) {
    // --- CONTROLLER-SIDE NETWORK ---
    socket = new WebSocket(`ws://${window.location.host}`);
    const brandLabel = document.getElementById('brand');
    let myPlayerIndex = 0; // Tracks internal binary origin slot

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ASSIGNMENT_CONFIRM') {
            myPlayerIndex = msg.playerIndex || 0; // Cache origin for binary encoding
            
            document.getElementById('gateway-panel').style.display = 'none';
            document.getElementById('gamepad-panel').style.display = 'flex';
            if (brandLabel) brandLabel.innerText = `LATCHED: ${msg.slot}`;
            
            const lobbyOverlay = document.getElementById('lobby-overlay');
            if (lobbyOverlay) {
                lobbyOverlay.style.display = 'flex'; // Default to lobby barrier on connect
                if (msg.slot === 'SPECTATOR') {
                    lobbyOverlay.innerHTML = '<div style="color: #ff4a5a; font-size: 14px; margin-bottom: 12px;">SPECTATOR MODE</div><div style="color: #8e92a8; font-size: 8px; line-height: 1.5;">MAX PLAYERS REACHED. INPUTS DISABLED.</div>';
                }
            }
            // Map bounding calculations after interface rendering stabilizes
            if (typeof recalculateButtonCoordinates === 'function') {
                setTimeout(recalculateButtonCoordinates, 200);
            }
        }
        
        if (msg.type === 'TV_STATE_CHANGE') {
            const lobbyOverlay = document.getElementById('lobby-overlay');
            if (msg.state === 'GAMEPLAY') {
                if (myPlayerIndex !== 0) {
                    if (lobbyOverlay) lobbyOverlay.style.display = 'none';
                }
                
                const core = msg.core ? msg.core.toUpperCase() : 'NES';
                const layout = msg.layout ? msg.layout.toUpperCase() : null;
                
                if (typeof applyDynamicLayout === 'function') {
                    applyDynamicLayout(core, layout);
                }
            } else {
                if (lobbyOverlay) lobbyOverlay.style.display = 'flex';
            }
        }
    };

    window.submitRegistration = function() {
        const nickField = document.getElementById('nickname-input');
        
        // Trigger browser full-screen mechanics safely via explicit click gesture
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();

        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => console.log("Orientation lock handled."));
        }

        if (typeof requestWakeLock === 'function') {
            requestWakeLock();
        }

        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'REGISTER_CONTROLLER', nickname: nickField ? nickField.value : '' }));
        }
    };

    window.disconnectController = function() {
        if (window.wakeLock !== null && typeof window.wakeLock !== 'undefined') {
            window.wakeLock.release().then(() => { window.wakeLock = null; });
        }
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
        }
        window.location.reload(); // Clean reset back to the gateway screen
    };

    let lastState = 0;
    
    const BIT_TO_CODE = {
        1: 1,      // UP
        2: 2,      // DOWN
        4: 3,      // LEFT
        8: 4,      // RIGHT
        16: 5,     // A
        32: 6,     // B
        64: 7,     // X
        128: 8,    // Y
        4096: 9,   // START
        8192: 10,  // SELECT
        16384: 11, // MENU
        32768: 12  // PAUSE
    };

    window.transmitState = function(state) {
        if (myPlayerIndex === 0) return; // Spectators do not flood the network

        const changed = state ^ lastState;
        if (changed !== 0) {
            for (const mask in BIT_TO_CODE) {
                const numericMask = parseInt(mask, 10);
                if (changed & numericMask) {
                    const buttonCode = BIT_TO_CODE[numericMask];
                    const isPressed = (state & numericMask) > 0;
                    const actionPhase = isPressed ? 1 : 2; // 1 = down, 2 = up

                    const payload = new Uint8Array(2);
                    payload[0] = actionPhase;
                    payload[1] = buttonCode;

                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(payload);
                    }
                }
            }
            lastState = state;
        }
    };
} else {
    // --- TV-SIDE NETWORK ---
    window.systemConnectUrl = null; // Cache for the controller URL
    window.qrCodeDataUrl = null; // Cache for the QR code

    const inputWorker = new Worker('/inputWorker.js');
    inputWorker.postMessage({
        type: 'CONNECT',
        url: `ws://${window.location.host}`
    });

    // Mock the global socket object so other scripts can still call socket.send(...)
    window.socket = {
        readyState: WebSocket.OPEN, // Mock open state
        send: function(data) {
            inputWorker.postMessage({
                type: 'SEND',
                data: data
            });
        }
    };

    let lastPlayerStates = [0, 0]; // [P1_state, P2_state]
    let lastMacroStates = [false, false]; // Tracks SELECT + START combo per player
    // Handle all messages from the worker (both JSON and binary)
    inputWorker.onmessage = (event) => {
        const data = event.data;

        // If binary frame, forward directly to handleIncomingInputPacket in gameplay.js
        if (data instanceof ArrayBuffer || (data && data.byteLength === 3)) {
            if (typeof window.handleIncomingInputPacket === 'function') {
                window.handleIncomingInputPacket(data);
            }
            return;
        }

        // Handle JSON messages forwarded from the worker connection
        try {
            const msg = JSON.parse(data);

            if (msg.type === 'SYSTEM_CONFIG') {
                window.systemConnectUrl = msg.connectUrl;
                if (msg.qrDataUrl) {
                    window.qrCodeDataUrl = msg.qrDataUrl; // Cache the QR code data
                }
            }

            if (msg.type === 'PLAYER_STATUS_UPDATE') {
                updateUIField('p1-chip', 'p1-name', msg.p1Connected, msg.p1Name, 'P1');
                updateUIField('p2-chip', 'p2-name', msg.p2Connected, msg.p2Name, 'P2');
            }
        } catch (e) {
            // Ignore JSON parse errors for non-JSON buffers
        }
    };

    window.updateUIField = function(chipId, textId, active, handle, prefix) {
        const chip = document.getElementById(chipId);
        const txt = document.getElementById(textId);
        if (chip && txt) {
            if (active) {
                chip.classList.add('online'); txt.innerText = `${prefix}: ${handle}`;
            } else {
                chip.classList.remove('online'); txt.innerText = `${prefix}: OFFLINE`;
            }
        }
    };
}
