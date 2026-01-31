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
    isRunning: false,
    interval: null
};

const minutesDisplay = document.getElementById('minutes');
const secondsDisplay = document.getElementById('seconds');
const toggleBtn = document.getElementById('timer-toggle');
const decreaseBtn = document.getElementById('timer-decrease');
const increaseBtn = document.getElementById('timer-increase');

function updateDisplay() {
    const mins = Math.floor(timerState.remaining / 60);
    const secs = timerState.remaining % 60;
    minutesDisplay.textContent = mins.toString().padStart(2, '0');
    secondsDisplay.textContent = secs.toString().padStart(2, '0');
}

function playBell() {
    // Create a gentle bell sound using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Create multiple oscillators for a richer bell sound
    const frequencies = [528, 396, 639]; // Solfeggio frequencies

    frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = freq;
        oscillator.type = 'sine';

        const now = audioContext.currentTime;
        const startTime = now + (index * 0.1);

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3 - (index * 0.08), startTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 4);

        oscillator.start(startTime);
        oscillator.stop(startTime + 4);
    });
}

function startTimer() {
    timerState.isRunning = true;
    toggleBtn.textContent = 'Pause';

    timerState.interval = setInterval(() => {
        timerState.remaining--;
        updateDisplay();

        if (timerState.remaining <= 0) {
            stopTimer();
            playBell();
            toggleBtn.textContent = 'Start';
            timerState.remaining = timerState.duration;
            updateDisplay();
        }
    }, 1000);
}

function stopTimer() {
    timerState.isRunning = false;
    toggleBtn.textContent = 'Start';
    if (timerState.interval) {
        clearInterval(timerState.interval);
        timerState.interval = null;
    }
}

function adjustDuration(minutes) {
    if (timerState.isRunning) return;

    const newDuration = timerState.duration + (minutes * 60);
    if (newDuration >= 60 && newDuration <= 60 * 60) { // 1 min to 60 min
        timerState.duration = newDuration;
        timerState.remaining = newDuration;
        updateDisplay();
    }
}

toggleBtn.addEventListener('click', () => {
    if (timerState.isRunning) {
        stopTimer();
    } else {
        startTimer();
    }
});

decreaseBtn.addEventListener('click', () => adjustDuration(-5));
increaseBtn.addEventListener('click', () => adjustDuration(5));

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
