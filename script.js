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
    audioContext: null,
    keepAliveAudio: null, // silent audio loop to prevent iOS from sleeping
    scheduledBell: null // pre-scheduled bell oscillators
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

function initAudio() {
    if (!timerState.audioContext) {
        timerState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (timerState.audioContext.state === 'suspended') {
        timerState.audioContext.resume();
    }
}

// Creates a near-silent audio loop that keeps iOS from suspending the page.
// iOS keeps the browser process alive when an <audio> element is playing.
function startKeepAlive() {
    if (timerState.keepAliveAudio) return;

    const ctx = timerState.audioContext;
    if (!ctx) return;

    // Create a short buffer of near-silence (not true silence so iOS doesn't ignore it)
    const sampleRate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, sampleRate * 2, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        // Tiny noise - inaudible but enough to keep the audio session alive
        data[i] = (Math.random() * 2 - 1) * 0.0001;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Route through a gain node at very low volume as extra safety
    const gain = ctx.createGain();
    gain.gain.value = 0.01;
    source.connect(gain);
    gain.connect(ctx.destination);

    source.start(0);
    timerState.keepAliveAudio = { source, gain };
}

function stopKeepAlive() {
    if (timerState.keepAliveAudio) {
        try {
            timerState.keepAliveAudio.source.stop();
        } catch (e) {}
        timerState.keepAliveAudio = null;
    }
}

// Pre-schedule the bell in the AudioContext's clock.
// The AudioContext clock runs independently from JS timers,
// so the bell fires even if setInterval is throttled.
function scheduleBell() {
    const ctx = timerState.audioContext;
    if (!ctx) return;

    cancelScheduledBell();

    const bellTime = ctx.currentTime + timerState.remaining;
    const frequencies = [528, 396, 639]; // Solfeggio frequencies
    const oscillators = [];

    frequencies.forEach((freq, index) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = freq;
        oscillator.type = 'sine';

        const startTime = bellTime + (index * 0.1);

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3 - (index * 0.08), startTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 4);

        oscillator.start(startTime);
        oscillator.stop(startTime + 4);
        oscillators.push(oscillator);
    });

    timerState.scheduledBell = oscillators;
}

function cancelScheduledBell() {
    if (timerState.scheduledBell) {
        timerState.scheduledBell.forEach(osc => {
            try { osc.stop(); } catch (e) {}
        });
        timerState.scheduledBell = null;
    }
}

function playBellNow() {
    const ctx = timerState.audioContext;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        ctx.resume().then(() => _playBellTones(ctx));
        return;
    }
    _playBellTones(ctx);
}

function _playBellTones(ctx) {
    const frequencies = [528, 396, 639];

    frequencies.forEach((freq, index) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = freq;
        oscillator.type = 'sine';

        const now = ctx.currentTime;
        const startTime = now + (index * 0.1);

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3 - (index * 0.08), startTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 4);

        oscillator.start(startTime);
        oscillator.stop(startTime + 4);
    });
}

function tick() {
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
        // Bell was pre-scheduled via AudioContext, but play again as fallback
        // in case AudioContext was suspended during sleep
        playBellNow();
        timerState.scheduledBell = null;
        timerState.remaining = timerState.duration;
        updateDisplay();
    }
}

function startTimer() {
    initAudio();

    timerState.isRunning = true;
    timerState.endTime = Date.now() + timerState.remaining * 1000;
    toggleBtn.textContent = 'Pause';

    // Keep iOS audio session alive so the page isn't suspended
    startKeepAlive();

    // Pre-schedule the bell in the AudioContext clock
    scheduleBell();

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
    cancelScheduledBell();
    stopKeepAlive();
}

// When page becomes visible again, recalculate and catch up
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && timerState.isRunning) {
        initAudio();
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
