// public/assets/js/gamepad.js

let structuralButtons = {};
let macroComboTriggered = false;
let currentButtonState = 0;
let previousButtonState = -1; // Initialize to a different value to guarantee first send
let wakeLock = null;

// MODULE 1: 16-Bit Bitmask for Controller State
const BUTTON_MASKS = {
    UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8,
    A: 16, B: 32, X: 64, Y: 128,
    L1: 256, R1: 512, L2: 1024, R2: 2048,
    START: 4096, SELECT: 8192,
    MENU: 16384, PAUSE: 32768
};

// Request the browser to keep the screen awake
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock acquired');
        } catch (err) {
            console.error(`Wake Lock error: ${err.name}, ${err.message}`);
        }
    }
}

document.addEventListener('visibilitychange', () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock(); // Re-request when returning to the app
    }
});

function applyDynamicLayout(core, layoutCode) {
    const triggerDeck = document.getElementById('trigger-deck');
    const actionDeck = document.getElementById('action-deck');
    if (!actionDeck) return;
    const activeLayoutUpper = (layoutCode || core || 'NES').toUpperCase();

    if (activeLayoutUpper.includes('SNES') || activeLayoutUpper.includes('GBA')) {
        if (triggerDeck) triggerDeck.style.display = 'flex';
        actionDeck.innerHTML = `
            <div class="act-row top-row" style="display: flex;">
                <button class="act-btn" data-btn="Y">Y</button>
                <button class="act-btn" data-btn="X">X</button>
            </div>
            <div class="act-row bottom-row">
                <button class="act-btn" data-btn="B">B</button>
                <button class="act-btn" data-btn="A">A</button>
            </div>
        `;
    } else if (activeLayoutUpper.includes('SEGA') || activeLayoutUpper.includes('MD') || activeLayoutUpper.includes('GENESIS')) {
        if (triggerDeck) triggerDeck.style.display = 'none';
        actionDeck.innerHTML = `
            <div class="act-row top-row" style="display: flex; margin-right: 20px;">
                <button class="act-btn" data-btn="Y" style="width:65px; height:65px; font-size:16px;">X</button>
                <button class="act-btn" data-btn="X" style="width:65px; height:65px; font-size:16px;">Y</button>
                <button class="act-btn" data-btn="L1" style="width:65px; height:65px; font-size:16px;">Z</button>
            </div>
            <div class="act-row bottom-row" style="margin-left: 20px;">
                <button class="act-btn" data-btn="B" style="width:65px; height:65px; font-size:16px;">A</button>
                <button class="act-btn" data-btn="A" style="width:65px; height:65px; font-size:16px;">B</button>
                <button class="act-btn" data-btn="R1" style="width:65px; height:65px; font-size:16px;">C</button>
            </div>
        `;
    } else {
        // Default / NES 2-Button Base
        if (triggerDeck) triggerDeck.style.display = 'none';
        actionDeck.innerHTML = `
            <div class="act-row bottom-row">
                <button class="act-btn" data-btn="B">B</button>
                <button class="act-btn" data-btn="A">A</button>
            </div>
        `;
    }
    
    // CRITICAL: Force recalculation of multi-touch bounding boxes mapped to the new geometric layout
    setTimeout(recalculateButtonCoordinates, 300); // Increased timeout to guarantee DOM reflow on mobile WebKit engines
}

function recalculateButtonCoordinates() {
    structuralButtons = {};
    document.querySelectorAll('#gamepad-panel button').forEach(btn => {
        const name = btn.getAttribute('data-btn');
        if (!name) return; // Safely ignore non-gamepad UI elements like the disconnect button
        const rect = btn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return; // Natively ignore hidden elements
        
        structuralButtons[name] = {
            rect: rect,
            pressed: false,
            element: btn
        };
    });
    console.log('[Gamepad] Recalculated coordinates for buttons:', Object.keys(structuralButtons));
}

// Bounding-Box Multi-Touch Parser Loop Engine
function parseTouchEngine(e) {
    e.preventDefault();
    let nextButtonState = 0;

    // Intercept positions for all fingers currently touching the display panel
    for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        
        for (const name in structuralButtons) {
            const btn = structuralButtons[name];
            if (t.clientX >= btn.rect.left && t.clientX <= btn.rect.right &&
                t.clientY >= btn.rect.top && t.clientY <= btn.rect.bottom) {
                
                // Update the visual state immediately for responsive feedback
                if (!btn.pressed) {
                    btn.pressed = true;
                    btn.element.classList.add('pressed-state');
                    if (navigator.vibrate) navigator.vibrate(15);
                }
                
                // Add the corresponding bit to our state mask for this frame
                if (BUTTON_MASKS[name]) {
                    nextButtonState |= BUTTON_MASKS[name];
                }
            }
        }
    }

    // Transmit the new state ONLY if it has changed since the last frame.
    if (nextButtonState !== currentButtonState) {
        currentButtonState = nextButtonState;
        console.log(`[Gamepad] Touch State Transmit: ${currentButtonState}`);
        if (typeof window.transmitState === 'function') {
            window.transmitState(currentButtonState);
        }
    }

    // Reset visual state for any buttons that are no longer being touched
    for (const name in structuralButtons) {
        const btn = structuralButtons[name];
        if (btn.pressed && !(currentButtonState & BUTTON_MASKS[name])) {
            btn.pressed = false;
            btn.element.classList.remove('pressed-state');
        }
    }
}

// Bounding-Box Mouse Parser Fallback Engine (for desktop testing)
function parseMouseEngine(e) {
    e.preventDefault();
    let nextButtonState = 0;

    // Only parse if the left mouse button is pressed
    if (e.buttons === 1) {
        for (const name in structuralButtons) {
            const btn = structuralButtons[name];
            if (e.clientX >= btn.rect.left && e.clientX <= btn.rect.right &&
                e.clientY >= btn.rect.top && e.clientY <= btn.rect.bottom) {
                
                if (!btn.pressed) {
                    btn.pressed = true;
                    btn.element.classList.add('pressed-state');
                }
                
                if (BUTTON_MASKS[name]) {
                    nextButtonState |= BUTTON_MASKS[name];
                }
            }
        }
    }

    if (nextButtonState !== currentButtonState) {
        currentButtonState = nextButtonState;
        console.log(`[Gamepad] Mouse State Transmit: ${currentButtonState}`);
        if (typeof window.transmitState === 'function') {
            window.transmitState(currentButtonState);
        }
    }

    // Reset visual state for any buttons that are no longer pressed
    for (const name in structuralButtons) {
        const btn = structuralButtons[name];
        if (btn.pressed && !(currentButtonState & BUTTON_MASKS[name])) {
            btn.pressed = false;
            btn.element.classList.remove('pressed-state');
        }
    }
}

function resetAllButtons() {
    let nextButtonState = 0;
    if (nextButtonState !== currentButtonState) {
        currentButtonState = nextButtonState;
        console.log(`[Gamepad] Reset State Transmit: ${currentButtonState}`);
        if (typeof window.transmitState === 'function') {
            window.transmitState(currentButtonState);
        }
    }
    for (const name in structuralButtons) {
        const btn = structuralButtons[name];
        if (btn.pressed) {
            btn.pressed = false;
            btn.element.classList.remove('pressed-state');
        }
    }
}

// Bind touch and mouse events to the gamepad panel
const pad = document.getElementById('gamepad-panel');
if (pad) {
    pad.addEventListener('touchstart', parseTouchEngine, { passive: false });
    pad.addEventListener('touchmove', parseTouchEngine, { passive: false });
    pad.addEventListener('touchend', parseTouchEngine, { passive: false });
    pad.addEventListener('touchcancel', parseTouchEngine, { passive: false });

    // Desktop Mouse Fallback
    pad.addEventListener('mousedown', parseMouseEngine);
    pad.addEventListener('mousemove', parseMouseEngine);
    window.addEventListener('mouseup', resetAllButtons);
}

window.addEventListener('resize', () => setTimeout(recalculateButtonCoordinates, 200));
window.addEventListener('orientationchange', () => setTimeout(recalculateButtonCoordinates, 300));

// Expose globals for other scripts
window.requestWakeLock = requestWakeLock;
window.applyDynamicLayout = applyDynamicLayout;
window.recalculateButtonCoordinates = recalculateButtonCoordinates;
window.parseTouchEngine = parseTouchEngine;
Object.defineProperty(window, 'wakeLock', {
    get: () => wakeLock,
    set: (val) => { wakeLock = val; },
    configurable: true
});
