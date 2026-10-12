// Web Audio API Alarm Sound Synthesizer
// Provides unskippable, looping, pleasant yet urgent alarm tones without external audio files.

let audioCtx = null;
let alarmIntervalId = null;
let isPlaying = false;
let isMuted = false;
let masterGainNode = null;

export function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isAudioContextSuspended() {
  return Boolean(audioCtx && audioCtx.state === 'suspended');
}

export function resumeAudioContext() {
  if (audioCtx && audioCtx.state === 'suspended') {
    return audioCtx.resume().catch(() => {});
  }
  return Promise.resolve();
}

// Automatically wake up AudioContext on first user interaction anywhere
if (typeof window !== 'undefined') {
  const handleUserGesture = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  };
  ['click', 'touchstart', 'keydown', 'pointerdown'].forEach((evt) => {
    window.addEventListener(evt, handleUserGesture, { capture: true, passive: true });
  });
}

// Plays a single synthetic chime burst (dual-tone)
function playToneBurst(ctx, freq, startTime, duration = 0.15, gainLevel = 0.3) {
  if (isMuted) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    // Smooth envelope: fast ramp-up (5ms), exponential decay
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainLevel, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    if (masterGainNode) {
      gain.connect(masterGainNode);
    } else {
      gain.connect(ctx.destination);
    }

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  } catch (err) {
    console.warn('[AlarmSound] playToneBurst error:', err);
  }
}

// Single sequence: 4-pulse pattern (A5, D6, A5, E6)
function playAlarmCycle() {
  const ctx = getAudioContext();
  if (!ctx || isMuted) return;

  const now = ctx.currentTime;
  // Double-pulse 1
  playToneBurst(ctx, 880, now + 0.0, 0.12, 0.35);
  playToneBurst(ctx, 1174.66, now + 0.16, 0.18, 0.4);

  // Double-pulse 2
  playToneBurst(ctx, 880, now + 0.45, 0.12, 0.35);
  playToneBurst(ctx, 1318.51, now + 0.62, 0.22, 0.45);
}

/**
 * Start continuous looping alarm sound
 */
export function startAlarmSound() {
  if (isPlaying) {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return;
  }
  isPlaying = true;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  if (!masterGainNode) {
    masterGainNode = ctx.createGain();
    masterGainNode.gain.setValueAtTime(isMuted ? 0 : 0.8, ctx.currentTime);
    masterGainNode.connect(ctx.destination);
  } else {
    try {
      masterGainNode.gain.setValueAtTime(isMuted ? 0 : 0.8, ctx.currentTime);
    } catch {}
  }

  // Play initial cycle immediately
  playAlarmCycle();

  // Loop every 1.5 seconds
  if (alarmIntervalId) clearInterval(alarmIntervalId);
  alarmIntervalId = setInterval(() => {
    if (isPlaying) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      playAlarmCycle();
    }
  }, 1500);
}

/**
 * Stop alarm sound immediately
 */
export function stopAlarmSound() {
  isPlaying = false;
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }

  if (masterGainNode && audioCtx) {
    try {
      masterGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    } catch {}
  }
}

/**
 * Toggle Mute
 */
export function toggleMuteAlarm() {
  isMuted = !isMuted;
  if (masterGainNode && audioCtx) {
    try {
      masterGainNode.gain.setValueAtTime(isMuted ? 0 : 0.8, audioCtx.currentTime);
    } catch {}
  }
  return isMuted;
}

export function isAlarmMuted() {
  return isMuted;
}

export function isAlarmPlaying() {
  return isPlaying;
}
