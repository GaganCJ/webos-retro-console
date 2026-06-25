// public/assets/js/gameplay.js

// FSM: The Application State Arbitrator
const ApplicationState = {
    current: 'LOBBY', // 'LOBBY' | 'GAMEPLAY'
    isMenuOpen: false,
    isExiting: false,

    enterGameplay: async function (game) {
        this.current = 'GAMEPLAY';
        this.isMenuOpen = false;
        this.isExiting = false;

        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('gameplay-view').style.display = 'flex';

        const bgm = document.getElementById('lobby-audio');
        if (bgm) {
            bgm.muted = true;
            bgm.volume = 0;
            bgm.pause();
            bgm.removeAttribute('src'); // Completely destroy the audio source to guarantee silence
        }

        if (typeof window.socket !== 'undefined' && window.socket && window.socket.readyState === WebSocket.OPEN) {
            window.socket.send(JSON.stringify({ type: 'TV_STATE_CHANGE', state: 'GAMEPLAY', core: game.console, layout: game.layout }));
        }

        loadROM(game);
    },

    // State Machine Tear-Down Protocol
    exitGameplay: function () {
        if (this.isExiting) return;
        this.isExiting = true;

        if (window.Module) {
            try { window.Module.retroArchSend("QUIT"); } catch (e) { }
        }

        this.current = 'LOBBY';

        document.getElementById('gameplay-view').style.display = 'none';
        document.getElementById('lobby-view').style.display = 'flex';

        window.onbeforeunload = null;

        // A full page reload is the most robust and reliable method to completely
        // tear down the WebAssembly emulator core and its injected global scripts.
        // This prevents "identifier has already been declared" errors on subsequent
        // game launches by ensuring a clean execution environment.
        window.location.reload();
    }
};

// Safe Audio Helper to prevent the "Play request interrupted by pause" DOMException
function playLobbyMusic() {
    const bgm = document.getElementById('lobby-audio');
    if (!bgm) return;
    if (ApplicationState.current !== 'LOBBY') return;
    if (!bgm.hasAttribute('src')) return; // Prevent playing if the source was destroyed

    bgm.volume = 0.3; // 30% volume
    const playPromise = bgm.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            if (ApplicationState.current !== 'LOBBY') bgm.pause();
        }).catch(err => console.warn('[TV] Autoplay blocked by browser. BGM will start upon interaction.'));
    }
}

function openQrModal() {
    const qrContainer = document.getElementById("qrcode-container");
    if (qrContainer && typeof qrCodeDataUrl !== 'undefined' && qrCodeDataUrl) {
        qrContainer.innerHTML = `<img src="${qrCodeDataUrl}" alt="Controller URL" style="display: block;">`;
    }
    const overlay = document.getElementById('qr-modal-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

// 🎮 NATIVE HTML5 GAMEPAD MOCKING 🎮
// Bypass browser KeyboardEvent security by spoofing physical hardware gamepads
const virtualGamepads = [null, null, null, null];

Object.defineProperty(navigator, 'getGamepads', {
    value: () => virtualGamepads,
    configurable: true
});

const gamepadMap = {
    'B': 0, 'A': 1, 'Y': 2, 'X': 3,
    'L1': 4, 'R1': 5, 'L2': 6, 'R2': 7,
    'SELECT': 8, 'START': 9,
    'UP': 12, 'DOWN': 13, 'LEFT': 14, 'RIGHT': 15
};

function getOrCreateGamepad(index) {
    if (!virtualGamepads[index]) {
        virtualGamepads[index] = {
            id: `Standard Gamepad (Virtual Controller ${index + 1})`,
            index: index,
            connected: true,
            timestamp: performance.now(),
            mapping: 'standard',
            axes: [0, 0, 0, 0],
            buttons: Array(18).fill(null).map(() => ({ pressed: false, touched: false, value: 0 }))
        };
        const ev = new Event('gamepadconnected');
        ev.gamepad = virtualGamepads[index];
        window.dispatchEvent(ev);
    }
    return virtualGamepads[index];
}

function removeGamepad(index) {
    if (virtualGamepads[index]) {
        const ev = new Event('gamepaddisconnected');
        ev.gamepad = virtualGamepads[index];
        window.dispatchEvent(ev);
        virtualGamepads[index] = null;
    }
}

function processControllerInput(player, button, action) {
    if (ApplicationState.current !== 'GAMEPLAY') return;

    const gamepadIndex = player - 1;
    const pad = getOrCreateGamepad(gamepadIndex);
    const isSelectPressed = pad && pad.buttons[gamepadMap['SELECT']] && pad.buttons[gamepadMap['SELECT']].pressed;
    const isStartPressed = pad && pad.buttons[gamepadMap['START']] && pad.buttons[gamepadMap['START']].pressed;

    // 1. MENU Button Logic (Toggle Quick Menu)
    if (button === 'MENU' && action === 'DOWN') {
        if (isSelectPressed) {
            return; // Skip normal menu toggle if SELECT is held (since SELECT+MENU is LOAD_STATE macro)
        }

        if (window.Module && typeof window.Module.retroArchSend === 'function') {
            ApplicationState.isMenuOpen = !ApplicationState.isMenuOpen;
            console.log("[RetroArch] Triggering MENU_TOGGLE. Menu open:", ApplicationState.isMenuOpen);
            window.Module.retroArchSend("MENU_TOGGLE");
            if (!ApplicationState.isMenuOpen) {
                setTimeout(() => {
                    const canvas = document.getElementById('canvas');
                    if (canvas) canvas.focus();
                }, 50);
            }
        }
        return; // Prevent the menu key from being forwarded to the emulator core
    }

    // 2. PAUSE Button Logic (Toggles Pause, Fast Forward, or Reset based on modifiers)
    if (button === 'PAUSE' && action === 'DOWN') {
        if (window.Module && typeof window.Module.retroArchSend === 'function') {
            if (isSelectPressed) {
                console.log("[RetroArch] Triggering FAST_FORWARD_TOGGLE");
                window.Module.retroArchSend("FAST_FORWARD_TOGGLE");
            } else if (isStartPressed) {
                console.log("[RetroArch] Triggering RESET");
                window.Module.retroArchSend("RESET");
            } else {
                console.log("[RetroArch] Triggering PAUSE_TOGGLE");
                window.Module.retroArchSend("PAUSE_TOGGLE");
            }
        }
        return;
    }

    // 3. Save/Load State Macros (Forwarded from socket network.js macros)
    if (button === 'SAVE_STATE' && action === 'DOWN') {
        if (window.Module && typeof window.Module.retroArchSend === 'function') {
            console.log("[RetroArch] Triggering SAVE_STATE command");
            window.Module.retroArchSend("SAVE_STATE");
        }
        return;
    }

    if (button === 'LOAD_STATE' && action === 'DOWN') {
        if (window.Module && typeof window.Module.retroArchSend === 'function') {
            console.log("[RetroArch] Triggering LOAD_STATE command");
            window.Module.retroArchSend("LOAD_STATE");
        }
        return;
    }

    // 4. Save Slot Switching (SELECT + D-pad UP/DOWN)
    if (isSelectPressed && action === 'DOWN') {
        if (button === 'UP') {
            if (window.Module && typeof window.Module.retroArchSend === 'function') {
                console.log("[RetroArch] Triggering STATE_SLOT_PLUS");
                window.Module.retroArchSend("STATE_SLOT_PLUS");
            }
            return; // Block standard UP input
        }
        if (button === 'DOWN') {
            if (window.Module && typeof window.Module.retroArchSend === 'function') {
                console.log("[RetroArch] Triggering STATE_SLOT_MINUS");
                window.Module.retroArchSend("STATE_SLOT_MINUS");
            }
            return; // Block standard DOWN input
        }
    }

    // STEP 4: Mobile Input Bridge -> Route to Native Gamepads
    const btnIndex = gamepadMap[button];

    if (btnIndex !== undefined) {
        // Block normal START press to emulator if it is part of the macro combo
        if (button === 'START' && action === 'DOWN') {
            if (pad.buttons[gamepadMap['SELECT']].pressed) {
                return;
            }
        }

        const isPressed = action === 'DOWN';
        pad.buttons[btnIndex].pressed = isPressed;
        pad.buttons[btnIndex].value = isPressed ? 1 : 0;
        pad.timestamp = performance.now();
    }
}

// BrowserFS File System Persistent Store Bridge
let afs = null;

function initBrowserFS() {
    return new Promise((resolve) => {
        if (afs) {
            resolve(afs);
            return;
        }

        const BrowserFS = window.BrowserFS;
        const imfs = new BrowserFS.FileSystem.InMemory();

        if (BrowserFS.FileSystem.IndexedDB.isAvailable()) {
            afs = new BrowserFS.FileSystem.AsyncMirror(imfs,
                new BrowserFS.FileSystem.IndexedDB((err, fs) => {
                    if (err) {
                        console.error("[RetroArch] IndexedDB failure, falling back to InMemory filesystem:", err);
                        afs = new BrowserFS.FileSystem.InMemory();
                        completeFSInitialization(afs).then(resolve);
                    } else {
                        afs.initialize((initErr) => {
                            if (initErr) {
                                console.error("[RetroArch] AsyncMirror initialization failed, fallback to InMemory:", initErr);
                                afs = new BrowserFS.FileSystem.InMemory();
                                completeFSInitialization(afs).then(resolve);
                            } else {
                                console.log("[RetroArch] BrowserFS Sync Mirror initialized successfully");
                                completeFSInitialization(afs).then(resolve);
                            }
                        });
                    }
                }, "RetroArch")
            );
        } else {
            console.warn("[RetroArch] IndexedDB is not supported on this browser. Fallback to InMemory.");
            afs = new BrowserFS.FileSystem.InMemory();
            completeFSInitialization(afs).then(resolve);
        }
    });
}

function completeFSInitialization(afsInstance) {
    return new Promise((resolve) => {
        const BrowserFS = window.BrowserFS;
        const mfs = new BrowserFS.FileSystem.MountableFileSystem();

        // Safe fallback in case afsInstance is null or undefined
        const safeAfs = afsInstance || new BrowserFS.FileSystem.InMemory();

        // Mount the root '/' to an InMemory filesystem to act as a fallback root.
        // This ensures that any path lookup for directories like '/' or '/home'
        // succeeds and returns a valid filesystem instead of throwing undefined errors.
        mfs.mount('/', new BrowserFS.FileSystem.InMemory());
        mfs.mount('/home/web_user/retroarch', new BrowserFS.FileSystem.InMemory());
        mfs.mount('/home/web_user/retroarch/userdata', safeAfs);

        BrowserFS.initialize(mfs);

        // Create required directory structures using Node-like API
        const fs = BrowserFS.BFSRequire('fs');
        try { fs.mkdirSync('/home'); } catch (e) { }
        try { fs.mkdirSync('/home/web_user'); } catch (e) { }
        try { fs.mkdirSync('/home/web_user/retroarch'); } catch (e) { }
        try { fs.mkdirSync('/home/web_user/retroarch/cores'); } catch (e) { }
        try { fs.mkdirSync('/home/web_user/retroarch/userdata'); } catch (e) { }
        try { fs.mkdirSync('/home/web_user/retroarch/userdata/saves'); } catch (e) { }
        try { fs.mkdirSync('/home/web_user/retroarch/userdata/states'); } catch (e) { }

        resolve(safeAfs);
    });
}

function bindEmscriptenFS(Module) {
    const BrowserFS = window.BrowserFS;
    const BFS = new BrowserFS.EmscriptenFS(Module.FS, Module.PATH, Module.ERRNO_CODES);

    // Auto-bind node_ops methods to preserve context 'this' under strict mode / ES6 module imports
    const nodeProto = Object.getPrototypeOf(BFS.node_ops);
    for (const key of Object.getOwnPropertyNames(nodeProto)) {
        if (typeof nodeProto[key] === 'function' && key !== 'constructor') {
            BFS.node_ops[key] = nodeProto[key].bind(BFS.node_ops);
        }
    }

    // Auto-bind stream_ops methods to preserve context 'this' under strict mode / ES6 module imports
    const streamProto = Object.getPrototypeOf(BFS.stream_ops);
    for (const key of Object.getOwnPropertyNames(streamProto)) {
        if (typeof streamProto[key] === 'function' && key !== 'constructor') {
            BFS.stream_ops[key] = streamProto[key].bind(BFS.stream_ops);
        }
    }

    Module.FS.mount(BFS, { root: '/home' }, '/home');
}

function writeConfig(consoleType) {
    const BrowserFS = window.BrowserFS;
    const fs = BrowserFS.BFSRequire('fs');
    const BufferClass = BrowserFS.BFSRequire('buffer').Buffer;

    // WebOS TV-optimized configurations for 2D Sprite consoles (NES, SNES, Genesis)
    const cfgContent = `
savefile_directory = "/home/web_user/retroarch/userdata/saves"
savestate_directory = "/home/web_user/retroarch/userdata/states"
core_options_path = "/home/web_user/retroarch/userdata/retroarch-core-options.cfg"
video_vsync = "false"
video_threaded = "true"
audio_enable = "true"
audio_latency = "128"
menu_driver = "rgui"
video_font_enable = "false"
video_smooth = "false"
rewind_enable = "false"
run_ahead_enabled = "false"
video_max_swapchain_images = "2"
video_aspect_ratio_auto = "true"
video_scale_integer = "true"
    `;

    const optionsContent = `
fceumm_aspect = "4:3"
fceumm_palette = "default"
fceumm_nospritelimit = "disabled"
snes9x2010_sound_quality = "32000Hz"
snes9x2010_overclock = "disabled"
picodrive_audio_filter = "disabled"
picodrive_overclock = "disabled"
picodrive_drc = "enabled"
    `;

    const encoded = new TextEncoder().encode(cfgContent.trim());
    fs.writeFileSync('/home/web_user/retroarch/userdata/retroarch.cfg', BufferClass(encoded));

    const encodedOptions = new TextEncoder().encode(optionsContent.trim());
    fs.writeFileSync('/home/web_user/retroarch/userdata/retroarch-core-options.cfg', BufferClass(encodedOptions));
}

function writeROM(filename, arrayBuffer) {
    const BrowserFS = window.BrowserFS;
    const fs = BrowserFS.BFSRequire('fs');
    const BufferClass = BrowserFS.BFSRequire('buffer').Buffer;
    const romPath = `/home/web_user/retroarch/${filename}`;
    fs.writeFileSync(romPath, BufferClass(new Uint8Array(arrayBuffer)));
    return romPath;
}

async function loadROM(game) {
    const gamePanel = document.getElementById('game-panel');
    if (!gamePanel) return;

    // Display Retro console styled clean loading indicator
    gamePanel.innerHTML = `
        <div id="retroarch-loader" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0b0e14; color: #00a8e1; font-family: 'Press Start 2P', monospace; font-size: 12px; gap: 20px;">
            <div style="font-size: 16px; animation: pulse 1.5s infinite;">LOADING GAME...</div>
        </div>
    `;

    try {
        const coreMap = {
            'NES': 'fceumm',
            'SNES': 'snes9x2010',
            'SEGA': 'picodrive'
        };
        const core = coreMap[game.console.toUpperCase()] || 'fceumm';
        window.currentCore = core;

        // Step 1: Initialize BrowserFS
        const afsInstance = await initBrowserFS();

        // Step 2: Fetch ROM array buffer
        const res = await fetch(game.path);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const buffer = await res.arrayBuffer();

        // Step 3: Write ROM & Config
        // Extract filename or fallback
        const ext = game.path.split('.').pop().split('?')[0].toLowerCase() || 'rom';
        const filename = game.filename || `${game.title ? game.title.replace(/\s+/g, '_') : 'game'}.${ext}`;
        const romPath = writeROM(filename, buffer);
        writeConfig(game.console.toUpperCase());

        // Write the core placeholder file
        const fs = BrowserFS.BFSRequire('fs');
        const BufferClass = BrowserFS.BFSRequire('buffer').Buffer;
        try {
            fs.writeFileSync(`/home/web_user/retroarch/cores/${core}_libretro.core`, BufferClass(new Uint8Array(0)));
        } catch (e) {
            console.error("[RetroArch] Failed to write core placeholder:", e);
        }

        // Step 4: Load Core Script (with cache-busting query parameter)
        const coreScriptUrl = `/cores/${core}_libretro.js?cb=${Date.now()}`;
        const scriptModule = await import(coreScriptUrl);
        const factory = scriptModule.default;

        // Step 5: Setup canvas and instantiate
        gamePanel.innerHTML = '<canvas id="canvas" style="width: 100%; height: 100%; display: block; border: 0; outline: none; background: #000;"></canvas>';
        const canvas = document.getElementById("canvas");

        const localModule = {
            noInitialRun: true,
            retroArchSend: function (msg) {
                if (typeof this.EmscriptenSendCommand === 'function') {
                    this.EmscriptenSendCommand(msg);
                } else {
                    console.warn("[RetroArch] EmscriptenSendCommand is not compiled in this core");
                }
            },
            retroArchRecv: function () {
                return this.EmscriptenReceiveCommandReply ? this.EmscriptenReceiveCommandReply() : null;
            },
            retroArchExit: function (core, content) {
                ApplicationState.exitGameplay();
            },
            onRuntimeInitialized: function () {
                // runtime ready
            },
            print: function (text) {
                // suppress RetroArch stdout logs for performance
            },
            printErr: function (text) {
                // suppress RetroArch stderr logs for performance
            },
            canvas: canvas,
            parent: canvas.parentNode,
            arguments: [romPath, "-c", "/home/web_user/retroarch/userdata/retroarch.cfg"],
            corePath: `/home/web_user/retroarch/cores/${core}_libretro.core`,
            preRun: [function (mod) {
                mod.ENV["LIBRARY_PATH"] = `/home/web_user/retroarch/cores/${core}_libretro.core`;
            }],
            locateFile: function (path, prefix) {
                if (path.endsWith(".wasm")) {
                    return `/cores/${path}?cb=${Date.now()}`;
                }
                return prefix + path;
            }
        };

        const mod = await factory(localModule);
        window.Module = mod;
        window.retroArchRunning = true;

        setTimeout(() => {
            try {
                console.log("[RetroArch Debug] mod object keys:", mod ? Object.keys(mod) : "null");
                console.log("[RetroArch Debug] mod.FS:", mod ? mod.FS : "undefined");
                console.log("[RetroArch Debug] mod.PATH:", mod ? mod.PATH : "undefined");
                console.log("[RetroArch Debug] mod.ERRNO_CODES:", mod ? mod.ERRNO_CODES : "undefined");
                bindEmscriptenFS(mod);
                mod.callMain(mod.arguments);
                // Force focus on canvas for gamepad keyboard mappings
                canvas.focus();
            } catch (e) {
                console.error("[RetroArch] Boot error during main execution:", e);
                if (e.stack) {
                    console.error("[RetroArch] Error Stack Trace:", e.stack);
                }
                alert("Failed to boot emulator core: " + e.message + (e.stack ? "\n\nStack:\n" + e.stack : ""));
                ApplicationState.exitGameplay();
            }
        }, 50);

    } catch (err) {
        console.error("[RetroArch] System failure during loading process:", err);
        alert("Boot Failure: " + err.message);
        ApplicationState.exitGameplay();
    }
}

// Fallback: Some modern browsers block audio auto-play until the user interacts with the page.
// This listener ensures the music starts playing the moment you click anywhere on the screen!
document.body.addEventListener('click', () => {
    playLobbyMusic();
}, { once: true });

// Expose globals for other scripts
window.ApplicationState = ApplicationState;
window.playLobbyMusic = playLobbyMusic;
window.openQrModal = openQrModal;
window.getOrCreateGamepad = getOrCreateGamepad;
window.removeGamepad = removeGamepad;
window.processControllerInput = processControllerInput;
window.loadROM = loadROM;
