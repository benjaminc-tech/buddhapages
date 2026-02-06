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
// iOS suspends JavaScript when the screen locks, so no JS-based approach
// (setInterval, Web Audio API, timeupdate callbacks) can trigger the bell.
// Instead, the bell is baked directly into a WAV file: silence for the
// timer duration, then the bell sound. iOS plays the full audio natively
// through the speaker, even during screen lock, with zero JS needed.

const timerState = {
    duration: 10 * 60, // 10 minutes in seconds
    remaining: 10 * 60,
    endTime: null, // wall-clock timestamp when timer should finish
    isRunning: false,
    interval: null,
    timerAudio: null, // <audio> element playing the silence+bell WAV
    timerAudioUrl: null // blob URL to revoke on cleanup
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

// ===== WAV Generation =====

function wavWriteString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

// Build a WAV file: near-silence for durationSec, then a 5-second bell.
// The bell is part of the audio data itself, so iOS plays it natively
// even when JavaScript is fully suspended during screen lock.
function createTimerWav(durationSec) {
    const sr = 8000;
    const bellSec = 5;
    const totalSec = durationSec + bellSec;
    const totalSamples = Math.ceil(sr * totalSec);
    const dataSize = totalSamples * 2; // 16-bit samples
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);

    // WAV header
    wavWriteString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    wavWriteString(view, 8, 'WAVE');
    wavWriteString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    wavWriteString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Sprinkle tiny noise through silence so iOS doesn't ignore the audio
    const bellStart = Math.floor(sr * durationSec);
    const noiseGap = Math.floor(sr * 0.25); // every 0.25 seconds
    for (let i = 0; i < bellStart; i += noiseGap) {
        view.setInt16(44 + i * 2, 1, true); // smallest non-zero value
    }

    // Bell: three Solfeggio tones with staggered attack and exponential decay
    const frequencies = [528, 396, 639];
    for (let i = bellStart; i < totalSamples; i++) {
        const t = (i - bellStart) / sr;
        let sample = 0;

        frequencies.forEach((freq, idx) => {
            const noteStart = idx * 0.1;
            if (t < noteStart) return;
            const noteTime = t - noteStart;
            if (noteTime > 4) return;

            const peakGain = 0.3 - idx * 0.08;
            let gain;
            if (noteTime < 0.1) {
                // Linear attack
                gain = (noteTime / 0.1) * peakGain;
            } else {
                // Exponential decay from peak to 0.001 over 3.9 seconds
                gain = peakGain * Math.pow(0.001 / peakGain, (noteTime - 0.1) / 3.9);
            }

            sample += Math.sin(2 * Math.PI * freq * noteTime) * gain;
        });

        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }

    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// ===== Timer Logic =====

function cleanupAudio() {
    if (timerState.timerAudio) {
        timerState.timerAudio.pause();
        timerState.timerAudio = null;
    }
    if (timerState.timerAudioUrl) {
        URL.revokeObjectURL(timerState.timerAudioUrl);
        timerState.timerAudioUrl = null;
    }
}

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
        // Bell is playing from the audio file — clean up once it finishes
        if (timerState.timerAudio) {
            timerState.timerAudio.addEventListener('ended', cleanupAudio);
        }
        timerState.remaining = timerState.duration;
        updateDisplay();
    }
}

function startTimer() {
    timerState.isRunning = true;
    timerState.endTime = Date.now() + timerState.remaining * 1000;
    toggleBtn.textContent = 'Pause';

    // Generate a single WAV: silence + bell baked in
    const url = createTimerWav(timerState.remaining);
    const audio = new Audio(url);

    // timeupdate fires while audio plays — secondary heartbeat
    audio.addEventListener('timeupdate', () => {
        if (timerState.isRunning) tick();
    });

    audio.play().catch(() => {});
    timerState.timerAudio = audio;
    timerState.timerAudioUrl = url;

    // Tell iOS this is active media playback
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Meditation Timer',
            artist: 'Buddha Pages'
        });
    }

    timerState.interval = setInterval(tick, 1000);
}

function stopTimer() {
    if (timerState.isRunning && timerState.endTime) {
        timerState.remaining = Math.max(0, Math.ceil((timerState.endTime - Date.now()) / 1000));
    }
    timerState.isRunning = false;
    timerState.endTime = null;
    toggleBtn.textContent = 'Start';
    if (timerState.interval) {
        clearInterval(timerState.interval);
        timerState.interval = null;
    }
    cleanupAudio();
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
