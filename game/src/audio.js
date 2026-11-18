// Synthesized WebAudio: engine hum, sirens, gunshots, chimes and a small
// radio-style music loop. No audio files — everything is oscillators and
// filtered noise, created lazily on the first user gesture.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOn = false;
    this.sirenTimer = 0;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.nextNoteAt = 0;
  }

  /** Call from a user gesture (start button, first key). Safe to call twice. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startMusic();
    } catch {
      this.ctx = null; // Audio unavailable: the game stays silent, never crashes.
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  startEngine() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master);
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineOsc.connect(this.engineGain);
    this.engineOsc.start();
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 30;
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc2.connect(g2);
    g2.connect(this.engineGain);
    this.engineOsc2.start();
  }

  /** Engine pitch follows speed (0..1) and whether the player is driving. */
  setEngine(speedNorm, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speedNorm * 0.1 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    const freq = 55 + speedNorm * 130;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq / 2, t, 0.08);
  }

  beep(freq, dur, type = 'sine', vol = 0.25, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol = 0.4, lowpass = 1200) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start();
  }

  gunshot() {
    this.noiseBurst(0.16, 0.5, 2400);
    this.beep(90, 0.12, 'square', 0.2);
  }

  chime() {
    this.beep(880, 0.12, 'sine', 0.22);
    this.beep(1318, 0.18, 'sine', 0.2, 0.09);
  }

  thud() {
    this.beep(70, 0.2, 'sine', 0.35);
    this.noiseBurst(0.1, 0.25, 500);
  }

  sirenTick(dt, wanted) {
    if (!this.ctx) return;
    this.sirenOn = wanted > 0;
    if (!this.sirenOn) return;
    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      this.sirenTimer = 0.55;
      this.beep(720, 0.5, 'sine', 0.06);
      this.beep(540, 0.5, 'sine', 0.06, 0.28);
    }
  }

  // A lazy two-bar loop: a bass line under soft pad chords (A minor → F → C → G).
  startMusic() {
    const bass = [110, 110, 130.8, 98, 110, 110, 146.8, 98];
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
    const stepDur = 0.42;
    const tick = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (now >= this.nextNoteAt - 0.05) {
        const i = this.musicStep % 8;
        const bar = Math.floor(this.musicStep / 8) % 4;
        this.beepAt(bass[i], stepDur * 0.9, 'triangle', 0.1, this.nextNoteAt);
        if (i % 4 === 0) {
          for (const f of chords[bar]) this.beepAt(f, stepDur * 3.6, 'sine', 0.035, this.nextNoteAt);
        }
        this.musicStep += 1;
        this.nextNoteAt += stepDur;
      }
      this.musicTimer = setTimeout(tick, 120);
    };
    this.nextNoteAt = this.ctx.currentTime + 0.1;
    tick();
  }

  beepAt(freq, dur, type, vol, when) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(when);
    o.stop(when + dur + 0.02);
  }
}
