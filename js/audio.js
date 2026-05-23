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
  },

  // === Slots room ===

  // Mechanical lever creak — filtered noise sweeping from bright to dull.
  // Plays the moment the SPIN button fires.
  leverPull() {
    this.ensure();
    const t = this.ctx.currentTime;
    const duration = 0.42;
    const bufSize = Math.floor(duration * this.ctx.sampleRate);
    const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.8;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(160, t + duration);
    bp.Q.value = 6;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.linearRampToValueAtTime(0.09, t + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(bp); bp.connect(gain); gain.connect(this.ctx.destination);
    src.start(t); src.stop(t + duration + 0.02);
  },

  // Per-reel clack — heavier for higher reel index. idx 0-4, gets progressively
  // lower-pitched + longer for the suspense of the 5th reel landing.
  reelStop(idx) {
    this.ensure();
    const t = this.ctx.currentTime;
    const baseFreq = 320 - idx * 38;            // 320, 282, 244, 206, 168
    const duration = 0.07 + idx * 0.018;

    // Noise body — low-passed thud
    const bufSize = Math.floor(duration * this.ctx.sampleRate);
    const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.55;
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = buffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480 + idx * 60;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.045 + idx * 0.015, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    noiseSrc.connect(lp); lp.connect(noiseGain); noiseGain.connect(this.ctx.destination);
    noiseSrc.start(t); noiseSrc.stop(t + duration + 0.02);

    // Square-wave pluck — descending pitch gives the metal-on-metal feel
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.connect(oscGain); oscGain.connect(this.ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, t + duration);
    oscGain.gain.setValueAtTime(0.05 + idx * 0.012, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t); osc.stop(t + duration + 0.02);
  },

  // Slot-specific win chime — tier scales with the effective bet multiplier.
  // Tier 1-1.9: single sine. Tier 2-4.9: + perfect 5th. Tier 5+: + octave.
  slotWinTier(tier) {
    this.ensure();
    const t = this.ctx.currentTime;
    const baseF = tier < 5 ? 660 : tier < 10 ? 880 : 1100;

    const osc1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    osc1.connect(g1); g1.connect(this.ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.value = baseF;
    g1.gain.setValueAtTime(0.14, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc1.start(t); osc1.stop(t + 0.65);

    if (tier >= 2) {
      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      osc2.connect(g2); g2.connect(this.ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.value = baseF * 1.5;
      g2.gain.setValueAtTime(0.1, t + 0.1);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc2.start(t + 0.1); osc2.stop(t + 0.7);
    }

    if (tier >= 5) {
      const osc3 = this.ctx.createOscillator();
      const g3 = this.ctx.createGain();
      osc3.connect(g3); g3.connect(this.ctx.destination);
      osc3.type = 'sine';
      osc3.frequency.value = baseF * 2;
      g3.gain.setValueAtTime(0.11, t + 0.2);
      g3.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
      osc3.start(t + 0.2); osc3.stop(t + 0.8);
    }
  },

  // Three-witch's-marks trigger — eerie diminished-triad chord with a low rumble.
  // Plays when the bonus round begins, before the urns fade in.
  scatterAwaken() {
    this.ensure();
    const t = this.ctx.currentTime;
    // Diminished triad A3, D#4, A#4 — classically unsettling
    const freqs = [220, 311, 466];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.connect(g); g.connect(this.ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 0.98, t);
      osc.frequency.linearRampToValueAtTime(f * 1.02, t + 0.8);
      g.gain.setValueAtTime(0.0, t + i * 0.06);
      g.gain.linearRampToValueAtTime(0.055, t + i * 0.06 + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      osc.start(t + i * 0.06); osc.stop(t + 1.55);
    });
    // Sub-bass rumble
    const rumble = this.ctx.createOscillator();
    const rg = this.ctx.createGain();
    rumble.connect(rg); rg.connect(this.ctx.destination);
    rumble.type = 'sine';
    rumble.frequency.value = 55;
    rg.gain.setValueAtTime(0.08, t);
    rg.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    rumble.start(t); rumble.stop(t + 1.65);
  },

  // Urn pick reveal — three flavors. 'jackpot' = rising triumphant chime,
  // 'cursed' = dissonant descending tone + noise hiss, 'reward' = soft single chime.
  urnReveal(outcome) {
    this.ensure();
    const t = this.ctx.currentTime;
    if (outcome === 'jackpot') {
      const freqs = [523, 659, 880]; // C5 E5 A5 — ascending major triad
      freqs.forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.connect(g); g.connect(this.ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.13, t + i * 0.13);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.13 + 0.55);
        osc.start(t + i * 0.13); osc.stop(t + i * 0.13 + 0.6);
      });
    } else if (outcome === 'cursed') {
      // Sawtooth descending pitch — feels wrong
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.connect(g); g.connect(this.ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(95, t + 0.65);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.start(t); osc.stop(t + 0.75);
      // Hiss layer
      const dur = 0.45;
      const bufSize = Math.floor(dur * this.ctx.sampleRate);
      const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const hiss = this.ctx.createGain();
      src.connect(hiss); hiss.connect(this.ctx.destination);
      hiss.gain.setValueAtTime(0.045, t);
      hiss.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.start(t); src.stop(t + dur + 0.02);
    } else {
      // 'reward' — pleasant single chime
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.connect(g); g.connect(this.ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 660;
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.start(t); osc.stop(t + 0.45);
    }
  }
};
