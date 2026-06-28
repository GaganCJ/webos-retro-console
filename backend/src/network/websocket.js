import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { PORT, getLocalIPAddress } from '../config/network.js';

let tvSocket = null;
let p1Socket = null;
let p2Socket = null;
let tvState = 'LOBBY';
let tvCore = 'NES';
let tvLayout = null;

const SYSTEM_IP = getLocalIPAddress();
const CONTROLLER_URL = `http://${SYSTEM_IP}:${PORT}/controller.html`;

function dispatchPlayerStatusToTV() {
    if (tvSocket && tvSocket.readyState === 1) {
        tvSocket.send(JSON.stringify({
            type: 'PLAYER_STATUS_UPDATE',
            p1Connected: p1Socket !== null,
            p1Name: p1Socket ? 'PLAYER 1' : 'OFFLINE',
            p2Connected: p2Socket !== null,
            p2Name: p2Socket ? 'PLAYER 2' : 'OFFLINE'
        }));
    }
}

export function initializeWebSocket(server) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (socket, req) => {
        // Enforce immediate, unbuffered packet streaming
        req.socket.setNoDelay(true);
        console.log(`⚡ [WEBSOCKET] New client connection established.`);

        socket.on('message', async (message) => {
            // Check if the message is a 2-byte raw binary array buffer/Buffer from a controller
            const isBinary = (message instanceof ArrayBuffer && message.byteLength === 2) ||
                             (Buffer.isBuffer(message) && message.length === 2);

            if (isBinary) {
                // If a binary packet is received but playerIndex is not yet assigned, dynamically assign slots
                if (!socket.playerIndex) {
                    if (!p1Socket) {
                        p1Socket = socket;
                        socket.playerIndex = 1;
                        console.log(`📱 Smartphone registered strictly as Player 1.`);
                        dispatchPlayerStatusToTV();
                    } else if (!p2Socket) {
                        p2Socket = socket;
                        socket.playerIndex = 2;
                        console.log(`📱 Smartphone registered strictly as Player 2.`);
                        dispatchPlayerStatusToTV();
                    } else {
                        socket.playerIndex = 0; // Spectator
                        console.log(`📱 Smartphone registered as Spectator (Slots occupied).`);
                        return;
                    }
                }

                // If this is P1 or P2, prepend the playerIndex to create a 3-byte frame
                if (socket.playerIndex > 0 && tvSocket && tvSocket.readyState === 1) {
                    const view = new Uint8Array(message);
                    const unifiedFrame = new Uint8Array(3);
                    unifiedFrame[0] = socket.playerIndex;
                    unifiedFrame[1] = view[0]; // actionPhase (1=down, 2=up)
                    unifiedFrame[2] = view[1]; // buttonIntegerCode (1-12)
                    
                    tvSocket.send(unifiedFrame);
                }
                return;
            }

            // Otherwise, it's a JSON text frame (e.g. TV registration or configuration change)
            try {
                const textContent = message.toString('utf-8');
                const data = JSON.parse(textContent);

                if (data.type === 'REGISTER_TV') {
                    console.log(`📺 [WEBSOCKET] TV Display registered.`);
                    tvSocket = socket;
                    
                    // Clear assignments if TV socket was previously flagged as controller
                    if (socket.playerIndex === 1) p1Socket = null;
                    if (socket.playerIndex === 2) p2Socket = null;
                    socket.playerIndex = undefined;

                    try {
                        const qrDataUrl = await QRCode.toDataURL(CONTROLLER_URL, { width: 130, margin: 2 });
                        tvSocket.send(JSON.stringify({ type: 'SYSTEM_CONFIG', connectUrl: CONTROLLER_URL, qrDataUrl }));
                    } catch (err) {
                        console.error("QR Code Generation Error:", err);
                    }
                    dispatchPlayerStatusToTV();
                }

                if (data.type === 'REGISTER_CONTROLLER') {
                    const chosenName = data.nickname ? data.nickname.trim().toUpperCase() : '';
                    
                    if (!p1Socket) {
                        p1Socket = socket;
                        socket.playerIndex = 1;
                        socket.nickname = chosenName || 'PLAYER 1';
                        socket.send(JSON.stringify({ type: 'ASSIGNMENT_CONFIRM', slot: socket.nickname, playerIndex: 1 }));
                        socket.send(JSON.stringify({ type: 'TV_STATE_CHANGE', state: tvState, core: tvCore, layout: tvLayout }));
                        console.log(`📱 ${socket.nickname} claimed Player 1 Slot (Web).`);
                        dispatchPlayerStatusToTV();
                    } else if (!p2Socket) {
                        p2Socket = socket;
                        socket.playerIndex = 2;
                        socket.nickname = chosenName || 'PLAYER 2';
                        socket.send(JSON.stringify({ type: 'ASSIGNMENT_CONFIRM', slot: socket.nickname, playerIndex: 2 }));
                        socket.send(JSON.stringify({ type: 'TV_STATE_CHANGE', state: tvState, core: tvCore, layout: tvLayout }));
                        console.log(`📱 ${socket.nickname} claimed Player 2 Slot (Web).`);
                        dispatchPlayerStatusToTV();
                    } else {
                        socket.send(JSON.stringify({ type: 'ASSIGNMENT_CONFIRM', slot: 'SPECTATOR', playerIndex: 0 }));
                        socket.send(JSON.stringify({ type: 'TV_STATE_CHANGE', state: tvState, core: tvCore, layout: tvLayout }));
                    }
                }

                if (data.type === 'TV_STATE_CHANGE' && socket === tvSocket) {
                    tvState = data.state;
                    if (data.core) tvCore = data.core;
                    tvLayout = data.layout || null;
                    
                    const stateMsg = JSON.stringify({ type: 'TV_STATE_CHANGE', state: tvState, core: tvCore, layout: tvLayout });
                    if (p1Socket) p1Socket.send(stateMsg);
                    if (p2Socket) p2Socket.send(stateMsg);
                }
            } catch (e) {
                console.error("WebSocket Message Handling Error:", e);
            }
        });

        socket.on('close', () => {
            if (socket === tvSocket) {
                console.log(`🔌 [WEBSOCKET] TV Display disconnected.`);
                tvSocket = null;
            } else if (socket.playerIndex === 1) {
                console.log(`🔌 [WEBSOCKET] Player 1 smartphone disconnected.`);
                p1Socket = null;
                dispatchPlayerStatusToTV();
            } else if (socket.playerIndex === 2) {
                console.log(`🔌 [WEBSOCKET] Player 2 smartphone disconnected.`);
                p2Socket = null;
                dispatchPlayerStatusToTV();
            }
        });
    });
}