import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os'; // Native system utility module

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// 1. Core State Tracking
let tvSocket = null;
let p1Socket = null;
let p2Socket = null;

// 2. Automate Local Network IP Discovery
function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            // Target active, non-internal IPv4 configurations
            if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '127.0.0.1'; // Fallback link
}

const PORT = 3000;
const SYSTEM_IP = getLocalIPAddress();
const CONTROLLER_URL = `http://${SYSTEM_IP}:${PORT}/controller.html`;

// 3. Broadcast Player Connection Changes Down to the TV
function dispatchPlayerStatusToTV() {
    if (tvSocket && tvSocket.readyState === 1) {
        tvSocket.send(JSON.stringify({
            type: 'PLAYER_STATUS_UPDATE',
            p1Connected: p1Socket !== null,
            p2Connected: p2Socket !== null
        }));
    }
}

wss.on('connection', (socket) => {
    socket.on('message', (message) => {
        const data = JSON.parse(message);

        // Frame Handling: Main TV Unit Registry
        if (data.type === 'REGISTER_TV') {
            tvSocket = socket;
            console.log('📺 Retro Mainframe Monitor actively latched to bridge.');
            
            // Push system address configurations up to the TV view instantly
            tvSocket.send(JSON.stringify({
                type: 'SYSTEM_CONFIG',
                connectUrl: CONTROLLER_URL
            }));
            
            // Immediately sync current status states
            dispatchPlayerStatusToTV();
        }

        // Frame Handling: Controller Node Registry
        if (data.type === 'REGISTER_CONTROLLER') {
            if (!p1Socket) {
                p1Socket = socket;
                socket.playerSlot = 'P1';
                socket.send(JSON.stringify({ type: 'ASSIGNMENT_CONFIRM', slot: 'PLAYER 1' }));
                console.log('📱 Phone registered successfully as Player 1.');
            } else if (!p2Socket) {
                p2Socket = socket;
                socket.playerSlot = 'P2';
                socket.send(JSON.stringify({ type: 'ASSIGNMENT_CONFIRM', slot: 'PLAYER 2' }));
                console.log('📱 Phone registered successfully as Player 2.');
            } else {
                socket.send(JSON.stringify({ type: 'ASSIGNMENT_CONFIRM', slot: 'SPECTATOR' }));
            }
            dispatchPlayerStatusToTV();
        }

        // Frame Handling: Input Signal Routing
        if (data.type === 'CONTROLLER_INPUT' && tvSocket) {
            // Determine which player is sending the command frame
            const executionSlot = socket.p1Socket === socket ? 1 : (p2Socket === socket ? 2 : 1);
            tvSocket.send(JSON.stringify({
                player: executionSlot,
                button: data.button,
                action: data.action
            }));
        }
    });

    socket.on('close', () => {
        if (socket === tvSocket) tvSocket = null;
        if (socket === p1Socket) { p1Socket = null; console.log('❌ Player 1 Terminal severed connection.'); }
        if (socket === p2Socket) { p2Socket = null; console.log('❌ Player 2 Terminal severed connection.'); }
        dispatchPlayerStatusToTV();
    });
});

server.listen(PORT, () => {
    console.log(`\n🕹️  ================================================ 🕹️`);
    console.log(`🚀 RUNNING ACTIVE NETWORK MAPPINGS:`);
    console.log(`🖥️  Console Main Frame View:  http://localhost:${PORT}/tv.html`);
    console.log(`📱 Target Mobile URL Target:  ${CONTROLLER_URL}`);
    console.log(`🕹️  ================================================ 🕹️\n`);
});