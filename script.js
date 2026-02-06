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
// Uses the Screen Wake Lock API to keep the screen on while the timer
// runs. iOS suspends all JavaScript when the screen locks, so there is
// no web-based way to trigger audio during sleep. Keeping the screen
// awake sidesteps the problem entirely.

const timerState = {
    duration: 10 * 60,
    remaining: 10 * 60,
    endTime: null,
    isRunning: false,
    interval: null,
    audioContext: null,
    wakeLock: null
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

// ===== Wake Lock =====
// Keeps the screen on during meditation so JS stays active and the
// bell can fire. Released automatically when the timer finishes.

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        timerState.wakeLock = await navigator.wakeLock.request('screen');
        timerState.wakeLock.addEventListener('release', () => {
            timerState.wakeLock = null;
        });
    } catch (e) {
        // Wake Lock unavailable (low battery, unsupported browser, etc.)
    }
}

function releaseWakeLock() {
    if (timerState.wakeLock) {
        timerState.wakeLock.release();
        timerState.wakeLock = null;
    }
}

// ===== Audio =====

function initAudio() {
    if (!timerState.audioContext) {
        timerState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (timerState.audioContext.state === 'suspended') {
        timerState.audioContext.resume();
    }
}

function playBell() {
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
        releaseWakeLock();
        playBell();
        timerState.remaining = timerState.duration;
        updateDisplay();
    }
}

function startTimer() {
    initAudio();
    timerState.isRunning = true;
    timerState.endTime = Date.now() + timerState.remaining * 1000;
    toggleBtn.textContent = 'Pause';

    // Keep the screen on so JS stays active and the bell can play
    requestWakeLock();

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
    releaseWakeLock();
}

// Re-acquire wake lock when page becomes visible again
// (wake lock is released automatically when the user switches tabs)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && timerState.isRunning) {
        requestWakeLock();
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
