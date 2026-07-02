// public/assets/js/gameplay.js

// FSM: The Application State Arbitrator
const ApplicationState = {
    current: 'LOBBY', // 'LOBBY' | 'GAMEPLAY'
    isMenuOpen: false,
    isExiting: false,
    
    enterGameplay: async function(game) {
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

        loadROM(game);
    },

    // State Machine Tear-Down Protocol
    exitGameplay: function() {
        if (this.isExiting) return;
        this.isExiting = true;

        if (window.Module) {
            try { window.Module.retroArchSend("QUIT"); } catch (e) {}
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



// 🎮 RAW KEYBOARD EVENT ROUTER & CUSTOM MENU CONTROLLER 🎮

const BUTTON_TO_KEY = {
    1: { code: 'ArrowUp', key: 'ArrowUp', keyCode: 38 },
    2: { code: 'ArrowDown', key: 'ArrowDown', keyCode: 40 },
    3: { code: 'ArrowLeft', key: 'ArrowLeft', keyCode: 37 },
    4: { code: 'ArrowRight', key: 'ArrowRight', keyCode: 39 },
    5: { code: 'KeyZ', key: 'z', keyCode: 90 },
    6: { code: 'KeyX', key: 'x', keyCode: 88 },
    7: { code: 'KeyA', key: 'a', keyCode: 65 },
    8: { code: 'KeyS', key: 's', keyCode: 83 },
    9: { code: 'Enter', key: 'Enter', keyCode: 13 },
    10: { code: 'ShiftRight', key: 'Shift', keyCode: 16 },
    11: { code: 'Escape', key: 'Escape', keyCode: 27 },
    12: { code: 'KeyP', key: 'p', keyCode: 80 }
};

// Tracks button states per smartphone player slot (1 and 2)
const controllerStates = {
    1: Array(13).fill(false),
    2: Array(13).fill(false)
};

let isGameplayMenuOpen = false;
let activeMenuIndex = 0;
const menuOptions = ['resume', 'save', 'load', 'slot', 'restart', 'exit'];
let currentSaveSlot = 1;

function updateGameplayMenuUI() {
    const container = document.getElementById('menu-options-container');
    if (!container) return;

    const items = container.querySelectorAll('.menu-item');
    items.forEach((item, index) => {
        const option = menuOptions[index];
        if (index === activeMenuIndex) {
            item.classList.add('active');
            item.style.color = '#00a8e1';
            item.style.border = '1px solid #00a8e1';
            item.style.borderRadius = '4px';
            item.style.background = 'rgba(0, 168, 225, 0.1)';
            
            if (option === 'slot') {
                item.innerText = `> SAVE SLOT: [ ${currentSaveSlot} ] <`;
            } else if (option === 'resume') {
                item.innerText = `> RESUME GAME <`;
            } else if (option === 'save') {
                item.innerText = `> SAVE STATE <`;
            } else if (option === 'load') {
                item.innerText = `> LOAD STATE <`;
            } else if (option === 'restart') {
                item.innerText = `> RESTART GAME <`;
            } else if (option === 'exit') {
                item.innerText = `> EXIT GAME <`;
            }
        } else {
            item.classList.remove('active');
            item.style.color = option === 'exit' ? '#ff4a5a' : '#8197a4';
            item.style.border = '1px solid transparent';
            item.style.background = 'transparent';
            
            if (option === 'slot') {
                item.innerText = `SAVE SLOT: [ ${currentSaveSlot} ]`;
            } else if (option === 'resume') {
                item.innerText = `RESUME GAME`;
            } else if (option === 'save') {
                item.innerText = `SAVE STATE`;
            } else if (option === 'load') {
                item.innerText = `LOAD STATE`;
            } else if (option === 'restart') {
                item.innerText = `RESTART GAME`;
            } else if (option === 'exit') {
                item.innerText = `EXIT GAME`;
            }
        }
    });
}

function openGameplayMenu() {
    isGameplayMenuOpen = true;
    activeMenuIndex = 0;
    const overlay = document.getElementById('gameplay-menu-overlay');
    if (overlay) overlay.style.display = 'flex';
    
    // Send pause command to emulator core
    if (window.Module && typeof window.Module.retroArchSend === 'function') {
        window.Module.retroArchSend("PAUSE_TOGGLE");
    }
    updateGameplayMenuUI();
}

function closeGameplayMenu() {
    isGameplayMenuOpen = false;
    const overlay = document.getElementById('gameplay-menu-overlay');
    if (overlay) overlay.style.display = 'none';
    
    // Send unpause command to emulator core
    if (window.Module && typeof window.Module.retroArchSend === 'function') {
        window.Module.retroArchSend("PAUSE_TOGGLE");
    }
}

function executeMenuOption(option) {
    if (option === 'resume') {
        closeGameplayMenu();
    } else if (option === 'save') {
        if (window.Module && typeof window.Module.retroArchSend === 'function') {
            window.Module.retroArchSend("SAVE_STATE");
        }
        closeGameplayMenu();
    } else if (option === 'load') {
        if (window.Module && typeof window.Module.retroArchSend === 'function') {
            window.Module.retroArchSend("LOAD_STATE");
        }
        closeGameplayMenu();
    } else if (option === 'slot') {
        // Clicking slot option increments slot by default
        currentSaveSlot = (currentSaveSlot % 9) + 1;
        if (window.Module && typeof window.Module.retroArchSend === 'function') {
            window.Module.retroArchSend("STATE_SLOT_PLUS");
        }
        updateGameplayMenuUI();
    } else if (option === 'restart') {
        if (window.Module && typeof window.Module.retroArchSend === 'function') {
            window.Module.retroArchSend("RESET");
        }
        closeGameplayMenu();
    } else if (option === 'exit') {
        ApplicationState.exitGameplay();
    }
}

function dispatchRetroArchKey(type, keyInfo) {
    const ev = new KeyboardEvent(type, {
        code: keyInfo.code,
        key: keyInfo.key,
        keyCode: keyInfo.keyCode,
        which: keyInfo.keyCode,
        bubbles: true,
        cancelable: true,
        view: window
    });

    window.dispatchEvent(ev);
    document.dispatchEvent(ev);

    const canvas = document.getElementById('canvas');
    if (canvas) {
        canvas.dispatchEvent(ev);
    }
}

// Global hook called by network.js on receiving 3-byte binary packets
function handleIncomingInputPacket(data) {
    const view = new Uint8Array(data);
    if (view.length !== 3) return;

    const playerIndex = view[0];
    const actionPhase = view[1]; // 1 = DOWN, 2 = UP
    const buttonCode = view[2];  // 1 through 12

    if (playerIndex < 1 || playerIndex > 2) return;
    if (buttonCode < 1 || buttonCode > 12) return;

    const isPressed = actionPhase === 1;
    controllerStates[playerIndex][buttonCode] = isPressed;

    // --- CASE A: TV Pause Menu is Currently Open ---
    if (isGameplayMenuOpen) {
        if (isPressed) {
            if (buttonCode === 1) { // D-pad Up
                activeMenuIndex = (activeMenuIndex - 1 + menuOptions.length) % menuOptions.length;
                updateGameplayMenuUI();
            } else if (buttonCode === 2) { // D-pad Down
                activeMenuIndex = (activeMenuIndex + 1) % menuOptions.length;
                updateGameplayMenuUI();
            } else if (buttonCode === 3 || buttonCode === 4) { // D-pad Left/Right
                const activeOption = menuOptions[activeMenuIndex];
                if (activeOption === 'slot') {
                    if (buttonCode === 3) { // Left
                        currentSaveSlot = currentSaveSlot > 1 ? currentSaveSlot - 1 : 9;
                        if (window.Module && typeof window.Module.retroArchSend === 'function') {
                            window.Module.retroArchSend("STATE_SLOT_MINUS");
                        }
                    } else { // Right
                        currentSaveSlot = currentSaveSlot < 9 ? currentSaveSlot + 1 : 1;
                        if (window.Module && typeof window.Module.retroArchSend === 'function') {
                            window.Module.retroArchSend("STATE_SLOT_PLUS");
                        }
                    }
                    updateGameplayMenuUI();
                }
            } else if (buttonCode === 5) { // Button A
                const activeOption = menuOptions[activeMenuIndex];
                executeMenuOption(activeOption);
            } else if (buttonCode === 6 || buttonCode === 11 || buttonCode === 12) { // Button B, MENU, PAUSE
                closeGameplayMenu();
            }
        }
        return; // Absolute input muting while in menu
    }

    // --- CASE B: TV Pause Menu is Closed (Normal Gameplay) ---
    const isSelectHeld = controllerStates[playerIndex][10] === true;

    // Check Macro Chords
    if (isPressed) {
        // 1. SELECT + START (9) -> Save State Macro
        if (buttonCode === 9 && isSelectHeld) {
            if (window.Module && typeof window.Module.retroArchSend === 'function') {
                console.log("[RetroArch] Triggering SAVE_STATE command");
                window.Module.retroArchSend("SAVE_STATE");
            }
            return;
        }

        // 2. SELECT + MENU (11) or SELECT + PAUSE (12) -> Load State Macro
        if ((buttonCode === 11 || buttonCode === 12) && isSelectHeld) {
            if (window.Module && typeof window.Module.retroArchSend === 'function') {
                console.log("[RetroArch] Triggering LOAD_STATE command");
                window.Module.retroArchSend("LOAD_STATE");
            }
            return;
        }

        // 3. SELECT + D-Pad UP/DOWN -> Shift Save Registers (Slot +/-)
        if (buttonCode === 1 && isSelectHeld) {
            if (window.Module && typeof window.Module.retroArchSend === 'function') {
                console.log("[RetroArch] Triggering STATE_SLOT_PLUS");
                window.Module.retroArchSend("STATE_SLOT_PLUS");
            }
            currentSaveSlot = (currentSaveSlot % 9) + 1;
            return; // Mute UP movement
        }
        if (buttonCode === 2 && isSelectHeld) {
            if (window.Module && typeof window.Module.retroArchSend === 'function') {
                console.log("[RetroArch] Triggering STATE_SLOT_MINUS");
                window.Module.retroArchSend("STATE_SLOT_MINUS");
            }
            currentSaveSlot = currentSaveSlot > 1 ? currentSaveSlot - 1 : 9;
            return; // Mute DOWN movement
        }

        // 4. SELECT + D-Pad LEFT/RIGHT -> Mute movements entirely
        if ((buttonCode === 3 || buttonCode === 4) && isSelectHeld) {
            return;
        }

        // 5. Normal MENU Button (11) -> Open Gameplay Menu
        if (buttonCode === 11) {
            openGameplayMenu();
            return;
        }
    } else {
        // Release Chord Blocks
        if (buttonCode === 9 && isSelectHeld) return;
        if ((buttonCode === 11 || buttonCode === 12) && isSelectHeld) return;
        if ((buttonCode === 1 || buttonCode === 2 || buttonCode === 3 || buttonCode === 4) && isSelectHeld) return;
    }

    // Normal Keyboard Translation and Dispatching
    const keyInfo = BUTTON_TO_KEY[buttonCode];
    if (keyInfo) {
        const type = isPressed ? 'keydown' : 'keyup';
        dispatchRetroArchKey(type, keyInfo);
    }
}

// Setup Magic Remote handler
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('menu-options-container');
    if (container) {
        container.addEventListener('click', (e) => {
            const item = e.target.closest('.menu-item');
            if (!item) return;
            const option = item.getAttribute('data-option');
            executeMenuOption(option);
        });
    }
});

// --- REAL 2.4G PHYSICAL GAMEPAD CONTROLLERS SUPPORT ---
const lastGamepadStates = {
    1: Array(17).fill(false),
    2: Array(17).fill(false)
};
const lastGamepadAxes = {
    1: [0, 0], // Left Stick X, Left Stick Y
    2: [0, 0]
};

const GAMEPAD_BUTTON_MAPPING = {
    0: 5,  // A / Cross -> Code 5 (Z / RetroArch B)
    1: 6,  // B / Circle -> Code 6 (X / RetroArch A)
    2: 7,  // X / Square -> Code 7 (A / RetroArch Y)
    3: 8,  // Y / Triangle -> Code 8 (S / RetroArch X)
    4: 11, // L1 -> Code 11 (MENU)
    5: 12, // R1 -> Code 12 (PAUSE)
    8: 10, // Select -> Code 10 (SELECT)
    9: 9,  // Start -> Code 9 (START)
    12: 1, // D-pad Up -> Code 1 (UP)
    13: 2, // D-pad Down -> Code 2 (DOWN)
    14: 3, // D-pad Left -> Code 3 (LEFT)
    15: 4, // D-pad Right -> Code 4 (RIGHT)
    16: 11 // Home -> Code 11 (MENU)
};

function triggerVirtualGamepadBtn(playerIndex, actionPhase, buttonCode) {
    const payload = new Uint8Array(3);
    payload[0] = playerIndex;
    payload[1] = actionPhase;
    payload[2] = buttonCode;
    handleIncomingInputPacket(payload);
}

function processAnalogAxis(playerIndex, axisIndex, value, negativeBtnCode, positiveBtnCode) {
    const lastStates = lastGamepadAxes[playerIndex];
    let prevVal = lastStates[axisIndex]; // -1, 1, 0

    let newVal = 0;
    if (value < -0.5) newVal = -1;
    else if (value > 0.5) newVal = 1;

    if (newVal !== prevVal) {
        // Release previous state
        if (prevVal === -1) {
            triggerVirtualGamepadBtn(playerIndex, 2, negativeBtnCode);
        } else if (prevVal === 1) {
            triggerVirtualGamepadBtn(playerIndex, 2, positiveBtnCode);
        }

        // Press new state
        if (newVal === -1) {
            triggerVirtualGamepadBtn(playerIndex, 1, negativeBtnCode);
        } else if (newVal === 1) {
            triggerVirtualGamepadBtn(playerIndex, 1, positiveBtnCode);
        }

        lastStates[axisIndex] = newVal;
    }
}

function pollGamepadsLoop() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const activeGamepads = [];
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i].connected) {
            activeGamepads.push(gamepads[i]);
        }
    }

    for (let playerIndex = 1; playerIndex <= 2; playerIndex++) {
        const gamepad = activeGamepads[playerIndex - 1];
        if (gamepad) {
            // Process standard buttons
            for (const btnIndexStr in GAMEPAD_BUTTON_MAPPING) {
                const btnIndex = parseInt(btnIndexStr, 10);
                const buttonCode = GAMEPAD_BUTTON_MAPPING[btnIndex];
                
                const pressed = gamepad.buttons[btnIndex] && gamepad.buttons[btnIndex].pressed;
                const lastState = lastGamepadStates[playerIndex][btnIndex];
                
                if (pressed !== lastState) {
                    lastGamepadStates[playerIndex][btnIndex] = pressed;
                    triggerVirtualGamepadBtn(playerIndex, pressed ? 1 : 2, buttonCode);
                }
            }

            // Process Left Analog Stick axes
            if (gamepad.axes && gamepad.axes.length >= 2) {
                processAnalogAxis(playerIndex, 0, gamepad.axes[0], 3, 4); // X -> Left/Right
                processAnalogAxis(playerIndex, 1, gamepad.axes[1], 1, 2); // Y -> Up/Down
            }
        }
    }
    requestAnimationFrame(pollGamepadsLoop);
}

function updateGamepadUI() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const activeGamepads = [];
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i].connected) {
            activeGamepads.push(gamepads[i]);
        }
    }

    const p1Connected = activeGamepads.length > 0;
    const p2Connected = activeGamepads.length > 1;

    updateUIField('p1-chip', 'p1-name', p1Connected, p1Connected ? `P1: GP${activeGamepads[0].index + 1}` : 'P1: OFFLINE');
    updateUIField('p2-chip', 'p2-name', p2Connected, p2Connected ? `P2: GP${activeGamepads[1].index + 1}` : 'P2: OFFLINE');
}

function updateUIField(chipId, textId, active, label) {
    const chip = document.getElementById(chipId);
    const txt = document.getElementById(textId);
    if (chip && txt) {
        txt.innerText = label;
        if (active) {
            chip.classList.add('online');
        } else {
            chip.classList.remove('online');
        }
    }
}

window.addEventListener("gamepadconnected", (e) => {
    console.log(`🎮 Gamepad connected at index ${e.gamepad.index}: ${e.gamepad.id}`);
    updateGamepadUI();
});

window.addEventListener("gamepaddisconnected", (e) => {
    console.log(`🎮 Gamepad disconnected from index ${e.gamepad.index}: ${e.gamepad.id}`);
    updateGamepadUI();
});

// Start polling gamepads loop
requestAnimationFrame(pollGamepadsLoop);

// Initial check on load
document.addEventListener('DOMContentLoaded', () => {
    updateGamepadUI();
});

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
        try { fs.mkdirSync('/home'); } catch (e) {}
        try { fs.mkdirSync('/home/web_user'); } catch (e) {}
        try { fs.mkdirSync('/home/web_user/retroarch'); } catch (e) {}
        try { fs.mkdirSync('/home/web_user/retroarch/cores'); } catch (e) {}
        try { fs.mkdirSync('/home/web_user/retroarch/userdata'); } catch (e) {}
        try { fs.mkdirSync('/home/web_user/retroarch/userdata/saves'); } catch (e) {}
        try { fs.mkdirSync('/home/web_user/retroarch/userdata/states'); } catch (e) {}

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
            retroArchSend: function(msg) {
                if (typeof this.EmscriptenSendCommand === 'function') {
                    this.EmscriptenSendCommand(msg);
                } else {
                    console.warn("[RetroArch] EmscriptenSendCommand is not compiled in this core");
                }
            },
            retroArchRecv: function() {
                return this.EmscriptenReceiveCommandReply ? this.EmscriptenReceiveCommandReply() : null;
            },
            retroArchExit: function(core, content) {
                ApplicationState.exitGameplay();
            },
            onRuntimeInitialized: function() {
                // runtime ready
            },
            print: function(text) {
                // suppress RetroArch stdout logs for performance
            },
            printErr: function(text) {
                // suppress RetroArch stderr logs for performance
            },
            canvas: canvas,
            parent: canvas.parentNode,
            arguments: [romPath, "-c", "/home/web_user/retroarch/userdata/retroarch.cfg"],
            corePath: `/home/web_user/retroarch/cores/${core}_libretro.core`,
            preRun: [function(mod) {
                mod.ENV["LIBRARY_PATH"] = `/home/web_user/retroarch/cores/${core}_libretro.core`;
            }],
            locateFile: function(path, prefix) {
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
window.loadROM = loadROM;
