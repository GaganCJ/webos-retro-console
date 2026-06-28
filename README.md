# 🕹️ WebOS Retro Game Console Platform (Web Application)

A high-performance, low-latency retro game emulation platform designed for packaged native LG webOS smart TVs. The system runs a vanilla RetroArch WebAssembly core rendering directly onto an unadorned WebGL canvas, driven by a Node.js WebSocket proxy and an HTML5/CSS3/JS mobile controller running in smartphone browsers over local Wi-Fi.

---

## 📂 Project Architecture

```text
webos-retro-console/
└── backend/                  <-- TV Static Assets & WebSocket Proxy Server
    ├── server.js             <-- Node Express & WebSocket Bootstrapper
    ├── package.json
    ├── src/
    │   ├── config/network.js <-- Port & IP Helper functions
    │   └── network/
    │       └── websocket.js  <-- Low-Latency Refereed Binary Stream Router
    └── public/
        ├── tv.html           <-- TV Smart Display Shell
        ├── controller.html   <-- Smartphone Gamepad UI
        ├── cores/            <-- RetroArch Core WebAssembly & JS Modules
        ├── roms/             <-- Multi-System ROM Repository (NES, SNES, SEGA)
        └── assets/
            ├── css/
            │   ├── common.css     <-- Shared display rules
            │   └── controller.css <-- Mobile controller layout rules
            └── js/
                ├── network.js    <-- Bidirectional communication bridge
                ├── gameplay.js   <-- KeyboardEvent translator & custom pause menu
                └── gamepad.js    <-- Bounding-box multi-touch touch engine
```

---

## 🛠️ Step-by-Step Launch Sequence

1. Navigate into the `backend/` folder:
   ```bash
   cd backend
   ```
2. Install node dependencies:
   ```bash
   npm install
   ```
3. Start the proxy server:
   ```bash
   node server.js
   ```
4. Access the TV console on your desktop browser at `http://localhost:3000/tv.html` or build the directory as a packaged WebOS `.ipk` application.
5. Scan the QR code displayed on the TV screen or open `http://<HOST_IP>:3000/controller.html` on your mobile phone's browser to connect.

---

## 🎮 Controller Actions & Macros

### Custom Pause Menu Navigation
When in a game, press the **MENU** button on the mobile controller to pause emulation and open the custom TV gameplay overlay.
* **D-pad UP / DOWN**: Change menu option selection.
* **D-pad LEFT / RIGHT**: Toggle save slot registers (Slots 1-9) when hovering over the "SAVE SLOT" option.
* **Button A**: Select / execute the active option.
* **Button B / MENU / PAUSE**: Close the pause menu.

### Hotkey Macros (Gameplay Mode)
The following macro chords can be executed during active gameplay:
* **Hold SELECT + Press START**: Save game state instantly.
* **Hold SELECT + Press MENU or PAUSE**: Load game state instantly.
* **Hold SELECT + Press D-pad UP**: Shift save slot register up (mutes movement).
* **Hold SELECT + Press D-pad DOWN**: Shift save slot register down (mutes movement).
* **Hold SELECT + Press D-pad LEFT/RIGHT**: Mute character movements.

