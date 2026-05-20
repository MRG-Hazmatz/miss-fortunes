// SFX — synthesized sounds via Web Audio API
// One shared AudioContext, lazy-initialized on first user interaction.

export const SFX = {
  ctx: null,
  lastPeg: 0,

  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  // Short randomized-pitch click. Throttled to 50ms so rapid bounces don't overwhelm.
  pegHit() {
    const now = performance.now();
    if (now - this.lastPeg < 50) return;
    this.lastPeg = now;
    this.ensure();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.value = 600 + Math.random() * 600;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.start(t);
    osc.stop(t + 0.06);
  },

  // Chime whose pitch and duration scale with win tier. Two-tone for 5x+.
  slotHit(mult) {
    this.ensure();
    const t = this.ctx.currentTime;
    const freq = mult >= 5 ? 880 : mult >= 2 ? 660 : 440;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.35);

    if (mult >= 5) {
      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      osc2.connect(g2);
      g2.connect(this.ctx.destination);
      osc2.frequency.value = freq * 1.5;
      osc2.type = 'sine';
      g2.gain.setValueAtTime(0.1, t + 0.08);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc2.start(t + 0.08);
      osc2.stop(t + 0.45);
    }
  },

  // === Bookie / CRT room ===

  // Brief highpassed white-noise burst — CRT flicking on, static spike
  crtFlicker(intensity = 0.15, duration = 0.12) {
    this.ensure();
    const t = this.ctx.currentTime;
    const bufferSize = Math.max(1, Math.floor(duration * this.ctx.sampleRate));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const gain = this.ctx.createGain();
    src.connect(hp); hp.connect(gain); gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(intensity, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.start(t);
    src.stop(t + duration + 0.02);
  },

  // Starting gate bell — single bright ring
  raceStart() {
    this.ensure();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.connect(g); g.connect(this.ctx.destination);
    osc.type = 'triangle';
    osc.frequency.value = 1760;
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.start(t);
    osc.stop(t + 0.95);
  },

  // Finish-line bell — two-tone
  finishBell() {
    this.ensure();
    const t = this.ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.connect(g); g.connect(this.ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.09, t + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.9);
      osc.start(t + i * 0.11);
      osc.stop(t + i * 0.11 + 0.95);
    });
  },

  // === Roulette ===

  // Whoosh of wheel starting — slow pitch-down noise, filtered.
  wheelSpin() {
    this.ensure();
    const t = this.ctx.currentTime;
    const duration = 1.2;
    const bufferSize = Math.floor(duration * this.ctx.sampleRate);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(800, t);
    bp.frequency.exponentialRampToValueAtTime(180, t + duration);
    bp.Q.value = 4;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.005, t + duration);
    src.connect(bp); bp.connect(gain); gain.connect(this.ctx.destination);
    src.start(t); src.stop(t + duration + 0.05);
  },

  // Short pop when the ball settles into the pocket.
  ballLand() {
    this.ensure();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.connect(g); g.connect(this.ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.start(t); osc.stop(t + 0.15);
  },

  // Dry tick for ball bouncing between pockets before it settles.
  ballBounce() {
    this.ensure();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.connect(g); g.connect(this.ctx.destination);
    osc.type = 'square';
    osc.frequency.value = 800 + Math.random() * 400;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.start(t); osc.stop(t + 0.05);
  },

  // Soft chip-on-felt click for bet placement.
  chipPlace() {
    this.ensure();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.connect(g); g.connect(this.ctx.destination);
    osc.type = 'triangle';
    osc.frequency.value = 260 + Math.random() * 60;
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.start(t); osc.stop(t + 0.08);
  },

  // Big-win siren — detuned dyad that warbles. For Hangman's Echo-tier wins.
  bigWin() {
    this.ensure();
    const t = this.ctx.currentTime;
    [660, 990, 1320].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.connect(g); g.connect(this.ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 0.98, t);
      osc.frequency.linearRampToValueAtTime(f * 1.02, t + 0.25);
      osc.frequency.linearRampToValueAtTime(f * 0.98, t + 0.5);
      g.gain.setValueAtTime(0.06, t + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      osc.start(t + i * 0.05);
      osc.stop(t + 1.25);
    });
  }
};
