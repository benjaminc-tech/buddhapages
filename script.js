/**
 * Buddha Pages - Interactive functionality
 * Meditation timer and expandable content
 */

// ===== Register Service Worker for PWA =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registered'))
        .catch(err => console.log('Service Worker registration failed:', err));
}

// ===== Expandable Truth Cards =====
document.querySelectorAll('.expand-btn').forEach(button => {
    button.addEventListener('click', () => {
        const card = button.closest('.truth-card');
        const expanded = card.querySelector('.truth-expanded');
        const isExpanded = button.getAttribute('aria-expanded') === 'true';

        button.setAttribute('aria-expanded', !isExpanded);
        button.textContent = isExpanded ? 'Go Deeper' : 'Show Less';
        expanded.classList.toggle('active');
    });
});

// ===== Meditation Timer =====
const timerState = {
    duration: 10 * 60, // 10 minutes in seconds
    remaining: 10 * 60,
    endTime: null, // wall-clock timestamp when timer should finish
    isRunning: false,
    interval: null,
    silentWavUrl: null, // reusable blob URL for near-silent WAV
    keepAliveEl: null, // <audio> element keeping iOS audio session alive
    bellWavUrl: null, // pre-rendered bell sound as WAV blob URL
    bellEl: null, // pre-created Audio element for the bell
    bellReady: false // whether bell WAV has been pre-rendered
};

const minutesDisplay = document.getElementById('minutes');
const secondsDisplay = document.getElementById('seconds');
const toggleBtn = document.getElementById('timer-toggle');
const resetBtn = document.getElementById('timer-reset');
const minUpBtn = document.getElementById('min-up');
const minDownBtn = document.getElementById('min-down');
const secUpBtn = document.getElementById('sec-up');
const secDownBtn = document.getElementById('sec-down');

function updateDisplay() {
    const mins = Math.floor(timerState.remaining / 60);
    const secs = timerState.remaining % 60;
    minutesDisplay.textContent = mins.toString().padStart(2, '0');
    secondsDisplay.textContent = secs.toString().padStart(2, '0');
}

// ===== WAV Audio Helpers =====
// iOS suspends Web Audio API contexts when the screen locks, but keeps
// real <audio> elements alive as background media playback. These helpers
// generate WAV files in-browser so no server or external files are needed.

function wavWriteString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

// Create a blob URL for a short near-silent WAV (keeps iOS audio session alive)
function createSilentWavUrl() {
    const sampleRate = 8000;
    const seconds = 2;
    const numSamples = sampleRate * seconds;
    const dataSize = numSamples * 2;
    const buf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buf);

    wavWriteString(v, 0, 'RIFF');
    v.setUint32(4, 36 + dataSize, true);
    wavWriteString(v, 8, 'WAVE');
    wavWriteString(v, 12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    wavWriteString(v, 36, 'data');
    v.setUint32(40, dataSize, true);

    // Near-silent noise (not true silence so iOS doesn't ignore it)
    for (let i = 0; i < numSamples; i++) {
        v.setInt16(44 + i * 2, Math.floor((Math.random() * 2 - 1) * 10), true);
    }

    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// Convert an AudioBuffer into a WAV Blob
function audioBufferToWav(audioBuffer) {
    const ch = audioBuffer.numberOfChannels;
    const sr = audioBuffer.sampleRate;
    const len = audioBuffer.length;
    const dataSize = len * ch * 2;
    const buf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buf);

    wavWriteString(v, 0, 'RIFF');
    v.setUint32(4, 36 + dataSize, true);
    wavWriteString(v, 8, 'WAVE');
    wavWriteString(v, 12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, ch, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * ch * 2, true);
    v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true);
    wavWriteString(v, 36, 'data');
    v.setUint32(40, dataSize, true);

    const channels = [];
    for (let c = 0; c < ch; c++) channels.push(audioBuffer.getChannelData(c));

    let off = 44;
    for (let i = 0; i < len; i++) {
        for (let c = 0; c < ch; c++) {
            const s = Math.max(-1, Math.min(1, channels[c][i]));
            v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            off += 2;
        }
    }

    return new Blob([buf], { type: 'audio/wav' });
}

// Pre-render the bell sound as a WAV blob using OfflineAudioContext
function prerenderBell() {
    const sr = 44100;
    const dur = 5;
    const offline = new OfflineAudioContext(1, sr * dur, sr);

    [528, 396, 639].forEach((freq, i) => {
        const osc = offline.createOscillator();
        const gain = offline.createGain();
        osc.connect(gain);
        gain.connect(offline.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const t = i * 0.1;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3 - i * 0.08, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 4);
        osc.start(t);
        osc.stop(t + 4);
    });

    return offline.startRendering().then(buffer => {
        const wav = audioBufferToWav(buffer);
        timerState.bellWavUrl = URL.createObjectURL(wav);
        timerState.bellReady = true;
        // Pre-create Audio element so it's primed and ready to play
        timerState.bellEl = new Audio(timerState.bellWavUrl);
        timerState.bellEl.volume = 1.0;
        timerState.bellEl.load();
    });
}

// ===== Keep-Alive Audio =====
// A looping <audio> element that iOS treats as real media playback,
// preventing the page from being suspended when the screen locks.

function startKeepAlive() {
    if (timerState.keepAliveEl) return;

    if (!timerState.silentWavUrl) {
        timerState.silentWavUrl = createSilentWavUrl();
    }

    const audio = new Audio(timerState.silentWavUrl);
    audio.loop = true;
    audio.volume = 0.01;

    // timeupdate fires ~4x/sec while audio plays — use as a heartbeat
    // in case setInterval is throttled by the OS
    audio.addEventListener('timeupdate', () => {
        if (timerState.isRunning) tick();
    });

    audio.play().catch(() => {});
    timerState.keepAliveEl = audio;

    // Register media session so iOS shows this as active media
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Meditation Timer',
            artist: 'Buddha Pages'
        });
    }
}

function stopKeepAlive() {
    if (timerState.keepAliveEl) {
        timerState.keepAliveEl.pause();
        timerState.keepAliveEl.removeAttribute('src');
        timerState.keepAliveEl.load();
        timerState.keepAliveEl = null;
    }
}

// ===== Bell Playback =====

function playBell() {
    // Primary: play the pre-created bell audio element
    if (timerState.bellEl) {
        timerState.bellEl.play().catch(() => {});
        timerState.bellEl = null;
        return;
    }
    // Secondary: create new element from pre-rendered WAV URL
    if (timerState.bellWavUrl) {
        const a = new Audio(timerState.bellWavUrl);
        a.volume = 1.0;
        a.play().catch(() => {});
        return;
    }
    // Fallback: Web Audio API (works when AudioContext isn't suspended)
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [528, 396, 639].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            const t = ctx.currentTime + i * 0.1;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.3 - i * 0.08, t + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 4);
            osc.start(t);
            osc.stop(t + 4);
        });
    } catch (e) {}
}

// ===== Timer Logic =====

function tick() {
    if (!timerState.isRunning) return;

    const now = Date.now();
    timerState.remaining = Math.max(0, Math.ceil((timerState.endTime - now) / 1000));
    updateDisplay();

    if (timerState.remaining <= 0) {
        timerState.isRunning = false;
        toggleBtn.textContent = 'Start';
        if (timerState.interval) {
            clearInterval(timerState.interval);
            timerState.interval = null;
        }
        stopKeepAlive();
        playBell();
        timerState.remaining = timerState.duration;
        updateDisplay();
    }
}

function startTimer() {
    timerState.isRunning = true;
    timerState.endTime = Date.now() + timerState.remaining * 1000;
    toggleBtn.textContent = 'Pause';

    // Start <audio> keep-alive so iOS doesn't suspend the page
    startKeepAlive();

    // Pre-render bell sound as WAV, or re-create audio element if already rendered
    if (!timerState.bellReady) {
        prerenderBell();
    } else if (timerState.bellWavUrl) {
        timerState.bellEl = new Audio(timerState.bellWavUrl);
        timerState.bellEl.volume = 1.0;
        timerState.bellEl.load();
    }

    timerState.interval = setInterval(tick, 1000);
}

function stopTimer() {
    timerState.isRunning = false;
    timerState.endTime = null;
    toggleBtn.textContent = 'Start';
    if (timerState.interval) {
        clearInterval(timerState.interval);
        timerState.interval = null;
    }
    stopKeepAlive();
    timerState.bellEl = null;
}

// When page becomes visible again, recalculate and catch up
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && timerState.isRunning) {
        tick();
    }
});

function adjustTime(type, delta) {
    if (timerState.isRunning) return;

    let mins = Math.floor(timerState.duration / 60);
    let secs = timerState.duration % 60;

    if (type === 'min') {
        mins = Math.max(0, Math.min(60, mins + delta));
    } else {
        secs = secs + delta;
        if (secs >= 60) {
            secs = 0;
            mins = Math.min(60, mins + 1);
        } else if (secs < 0) {
            secs = 55;
            mins = Math.max(0, mins - 1);
        }
    }

    // Ensure at least 5 seconds
    const newDuration = mins * 60 + secs;
    if (newDuration >= 5) {
        timerState.duration = newDuration;
        timerState.remaining = newDuration;
        updateDisplay();
    }
}

function resetTimer() {
    stopTimer();
    timerState.remaining = timerState.duration;
    updateDisplay();
}

toggleBtn.addEventListener('click', () => {
    if (timerState.isRunning) {
        stopTimer();
    } else {
        startTimer();
    }
});

resetBtn.addEventListener('click', resetTimer);
minUpBtn.addEventListener('click', () => adjustTime('min', 1));
minDownBtn.addEventListener('click', () => adjustTime('min', -1));
secUpBtn.addEventListener('click', () => adjustTime('sec', 5));
secDownBtn.addEventListener('click', () => adjustTime('sec', -5));

// ===== Smooth Scroll Enhancement =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const navHeight = document.querySelector('.nav').offsetHeight;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;

            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// ===== Intersection Observer for Fade-in Animation =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Apply to elements that should animate on scroll
document.querySelectorAll('.wheel-section').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// ===== Console Message for Fellow Seekers =====
console.log(`
    ╭─────────────────────────────────────╮
    │                                     │
    │   "Peace comes from within.         │
    │    Do not seek it without."         │
    │                                     │
    │              — Buddha               │
    │                                     │
    ╰─────────────────────────────────────╯

    If you're reading this, you're curious.
    That's the first step.
`);
