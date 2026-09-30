/**
 * Sound Manager powered by the Web Audio API
 * Synthesizes Asteroids retro audio procedurally without external audio assets.
 */
class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = localStorage.getItem('astro_clash_muted') === 'true';
    this.thrustGain = null;
    this.thrustSource = null;
    this.thrustFilter = null;
    this.isThrusting = false;
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
    localStorage.setItem('astro_clash_muted', this.isMuted);
    if (this.isMuted) {
      this.stopThrustSound();
    }
    return this.isMuted;
  }

  // --- Retro Laser Chirp ---
  playLaser() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.13);
  }

  // --- Thruster Rumble ---
  startThrustSound() {
    if (this.isMuted || this.isThrusting) return;
    this.init();
    if (!this.ctx) return;

    try {
      this.isThrusting = true;
      const t = this.ctx.currentTime;

      // Low frequency rumble oscillator
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65, t);

      // Lowpass filter for muffled engine roar
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.08);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      this.thrustSource = osc;
      this.thrustGain = gain;
      this.thrustFilter = filter;
    } catch (e) {}
  }

  stopThrustSound() {
    if (!this.isThrusting) return;
    this.isThrusting = false;
    if (this.thrustGain && this.ctx) {
      try {
        const t = this.ctx.currentTime;
        this.thrustGain.gain.setValueAtTime(this.thrustGain.gain.value, t);
        this.thrustGain.gain.linearRampToValueAtTime(0.001, t + 0.06);
        const osc = this.thrustSource;
        setTimeout(() => {
          try {
            if (osc) {
              osc.stop();
              osc.disconnect();
            }
          } catch (e) {}
        }, 70);
      } catch (e) {}
    }
    this.thrustSource = null;
    this.thrustGain = null;
  }

  // --- Explosion Blast (Rock or Ship) ---
  playExplosion(type = 'asteroid') {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const isShip = (type === 'ship');
    const duration = isShip ? 0.45 : 0.25;

    // 1. Sub bass boom sweep
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isShip ? 200 : 140, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + duration * 0.9);

    oscGain.gain.setValueAtTime(isShip ? 0.45 : 0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);

    // 2. White noise burst for crunch
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isShip ? 600 : 900, t);
    filter.Q.setValueAtTime(1.2, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(isShip ? 0.35 : 0.25, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    whiteNoise.start(t);
    whiteNoise.stop(t + duration + 0.01);
  }

  // --- Score Ping / Item Hit ---
  playScorePing() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, t); // C6
    osc.frequency.setValueAtTime(1318.5, t + 0.04); // E6

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  // --- Respawn / Teleport Sound ---
  playRespawn() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.25);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.26);
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
