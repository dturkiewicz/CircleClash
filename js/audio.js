/**
 * Sound Manager powered by the Web Audio API
 * Synthesizes all game audio procedurally without external audio assets.
 */
class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = localStorage.getItem('circle_clash_muted') === 'true';
    this.activeExpandNodes = new Map(); // playerId -> { osc, gain }
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('circle_clash_muted', this.isMuted);
    if (this.isMuted) {
      this.stopAllExpands();
    }
    return this.isMuted;
  }

  // --- Expand Hum (Frequency increases as circle grows) ---
  startExpandSound(playerId, initialFreq = 160) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    this.stopExpandSound(playerId);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(initialFreq, this.ctx.currentTime);
    // Smooth pitch glide upward simulating expansion tension
    osc.frequency.exponentialRampToValueAtTime(560, this.ctx.currentTime + 3.0);

    gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();

    this.activeExpandNodes.set(playerId, { osc, gain });
  }

  stopExpandSound(playerId) {
    const node = this.activeExpandNodes.get(playerId);
    if (node && this.ctx) {
      try {
        node.gain.gain.setValueAtTime(node.gain.gain.value, this.ctx.currentTime);
        node.gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
        setTimeout(() => {
          try {
            node.osc.stop();
            node.osc.disconnect();
            node.gain.disconnect();
          } catch (e) {}
        }, 60);
      } catch (e) {}
      this.activeExpandNodes.delete(playerId);
    }
  }

  stopAllExpands() {
    for (const playerId of this.activeExpandNodes.keys()) {
      this.stopExpandSound(playerId);
    }
  }

  // --- Pop Blast (Synthesized noise & downward bass sweep) ---
  playPop() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 1. Bass thump sweep
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.18);
    oscGain.gain.setValueAtTime(0.35, t);
    oscGain.gain.linearRampToValueAtTime(0.001, t + 0.2);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);

    // 2. White noise burst for snap/pop
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.Q.setValueAtTime(1.5, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    whiteNoise.start(t);
    whiteNoise.stop(t + 0.12);
  }

  // --- Territory Lock Chime (Pleasing harmonic placement chime) ---
  playClaim(radius = 50) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // Frequency inversely related to size (larger circles sound deeper)
    const baseFreq = Math.max(180, 520 - radius * 1.5);

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc2.type = 'triangle';

    osc.frequency.setValueAtTime(baseFreq, t);
    osc2.frequency.setValueAtTime(baseFreq * 1.5, t); // perfect fifth

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc2.start(t);
    osc.stop(t + 0.36);
    osc2.stop(t + 0.36);
  }

  // --- Countdown Beep ---
  playBeep(isFinal = false) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinal ? 880 : 440, t);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (isFinal ? 0.45 : 0.18));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + (isFinal ? 0.5 : 0.2));
  }

  // --- Victory Fanfare ---
  playVictory() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [392, 523.25, 659.25, 783.99, 1046.50]; // G4, C5, E5, G5, C6
    const startTime = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const t = startTime + idx * 0.1;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      const duration = (idx === notes.length - 1) ? 0.8 : 0.18;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + duration + 0.05);
    });
  }
}

// Global audio instance
window.soundManager = new SoundManager();
