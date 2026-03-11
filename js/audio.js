// ============================================================
// audio.js - Procedural sound generation via Web Audio API
// All sounds are generated programmatically - no external files needed.
// Structure makes it easy to swap in real audio assets later.
// ============================================================

let audioCtx = null;
let masterGain = null;
let initialized = false;

export function initAudio() {
    if (initialized) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.35;
        masterGain.connect(audioCtx.destination);
        initialized = true;
    } catch (e) {
        console.warn('Web Audio not available:', e);
    }
}

function ensureCtx() {
    if (!initialized) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return initialized;
}

// --- Gunshot: short noise burst with pitch envelope ---
export function playGunshot(isRifle = true) {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;
    const duration = isRifle ? 0.12 : 0.08;

    // Noise source
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    // Filter for tone shaping
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isRifle ? 3000 : 4500, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + duration);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(isRifle ? 0.7 : 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(t);
    source.stop(t + duration);
}

// --- Enemy gunshot: slightly different tone ---
export function playEnemyGunshot() {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;
    const duration = 0.1;

    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 4);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2500, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + duration);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(t);
    source.stop(t + duration);
}

// --- Reload sound: metallic click ---
export function playReload() {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;

    // Click 1
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.08);

    // Click 2 (delayed)
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(600, t + 0.3);
    osc2.frequency.exponentialRampToValueAtTime(150, t + 0.35);
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.12, t + 0.3);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc2.connect(g2);
    g2.connect(masterGain);
    osc2.start(t + 0.3);
    osc2.stop(t + 0.4);
}

// --- Hit marker: short high-pitched click ---
export function playHitMarker() {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.04);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.06);
}

// --- Damage taken: low thud ---
export function playDamage() {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.2);
}

// --- Bomb beep: repeating tone ---
let bombBeepInterval = null;

export function startBombBeep() {
    if (bombBeepInterval) return;
    bombBeepInterval = setInterval(() => {
        if (!ensureCtx()) return;
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 880;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.12);
    }, 1000);
}

export function stopBombBeep() {
    if (bombBeepInterval) {
        clearInterval(bombBeepInterval);
        bombBeepInterval = null;
    }
}

// --- Plant sound: rising tone ---
export function playPlantStart() {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(600, t + 0.3);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.35);
}

// --- Explosion: big noise burst ---
export function playExplosion() {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;
    const duration = 1.5;

    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        const env = Math.pow(1 - i / bufferSize, 2);
        data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + duration);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(t);
    source.stop(t + duration);
}

// --- Defuse alert: warning beeps ---
export function playDefuseAlert() {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;
    for (let i = 0; i < 3; i++) {
        const osc = audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 500;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.12, t + i * 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.08);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(t + i * 0.15);
        osc.stop(t + i * 0.15 + 0.1);
    }
}

// --- Pickup sound ---
export function playPickup() {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
}

// --- Victory jingle ---
export function playVictory() {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.15, t + i * 0.2);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.25);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(t + i * 0.2);
        osc.stop(t + i * 0.2 + 0.3);
    });
}

// --- Defeat sound ---
export function playDefeat() {
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.8);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 1.0);
}

// --- Footstep sounds ---
let lastFootstepTime = 0;
export function playFootstep() {
    const now = performance.now();
    if (now - lastFootstepTime < 350) return;
    lastFootstepTime = now;
    if (!ensureCtx()) return;
    const t = audioCtx.currentTime;

    const bufferSize = audioCtx.sampleRate * 0.06;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 6);
    }
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600 + Math.random() * 400;
    const g = audioCtx.createGain();
    g.gain.value = 0.06;
    source.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    source.start(t);
    source.stop(t + 0.06);
}
