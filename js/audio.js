'use strict';
/* =========================================================
   SOUND — every effect is synthesized with the Web Audio API.
   No audio files needed. If Web Audio is missing, every call
   silently does nothing, so the game still works.
   ========================================================= */

const Sound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = true;
  const VOLUME = 0.55;

  /** Browsers only allow audio after a user gesture, so call this on click/keydown. */
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      master = ctx.createGain();
      master.gain.value = enabled ? VOLUME : 0;
      master.connect(comp);
      comp.connect(ctx.destination);

      // One second of white noise, reused for gunshots, hits, etc.
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
  }

  function ready() { return enabled && ctx && ctx.state === 'running'; }

  function envelope(gainNode, t, volume, attack, duration) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(volume, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  }

  /** A pitched tone (oscillator) with optional pitch sweep and filter. */
  function tone(o) {
    if (!ready()) return;
    const t = ctx.currentTime + (o.delay || 0);
    const dur = o.duration || 0.2;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + dur);

    const g = ctx.createGain();
    envelope(g, t, o.volume || 0.2, o.attack || 0.005, dur);

    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.filterFreq || 1000;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A filtered noise burst — great for gunshots, impacts and clicks. */
  function noise(o) {
    if (!ready()) return;
    const t = ctx.currentTime + (o.delay || 0);
    const dur = o.duration || 0.1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
    f.Q.value = o.q || 1;

    const g = ctx.createGain();
    envelope(g, t, o.volume || 0.3, o.attack || 0.002, dur);

    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  return {
    init,
    isEnabled: () => enabled,
    setEnabled(v) {
      enabled = v;
      if (master) master.gain.value = v ? VOLUME : 0;
    },

    shoot(rapid) {
      noise({ duration: 0.11, volume: 0.55, filter: 'bandpass', freq: rapid ? 2600 : 2000, freqEnd: 400, q: 0.8 });
      tone({ type: 'square', freq: rapid ? 200 : 150, freqEnd: 50, duration: 0.09, volume: 0.16 });
    },
    dryFire() {
      tone({ type: 'square', freq: 1400, duration: 0.03, volume: 0.08 });
      noise({ duration: 0.03, volume: 0.15, filter: 'highpass', freq: 4000 });
    },
    reloadStart() {
      noise({ duration: 0.04, volume: 0.3, filter: 'highpass', freq: 2500 });
      tone({ type: 'triangle', freq: 420, freqEnd: 300, duration: 0.06, volume: 0.12 });
    },
    reloadEnd() {
      noise({ duration: 0.035, volume: 0.35, filter: 'highpass', freq: 3000 });
      noise({ duration: 0.05, volume: 0.35, filter: 'bandpass', freq: 1800, delay: 0.08 });
      tone({ type: 'square', freq: 600, freqEnd: 900, duration: 0.05, volume: 0.08, delay: 0.08 });
    },
    zombieHit() {
      noise({ duration: 0.08, volume: 0.35, filter: 'lowpass', freq: 900, freqEnd: 200 });
      tone({ type: 'sine', freq: 140, freqEnd: 70, duration: 0.1, volume: 0.18 });
    },
    zombieDeath(type) {
      const base = type === 'tank' ? 70 : type === 'fast' ? 160 : 110;
      tone({ type: 'sawtooth', freq: base * rand(0.9, 1.1), freqEnd: base * 0.4, duration: type === 'tank' ? 0.7 : 0.45, volume: 0.15, filter: 'lowpass', filterFreq: 700 });
      noise({ duration: 0.25, volume: 0.3, filter: 'lowpass', freq: 600, freqEnd: 100 });
    },
    playerHurt() {
      tone({ type: 'square', freq: 260, freqEnd: 120, duration: 0.18, volume: 0.15, filter: 'lowpass', filterFreq: 1200 });
      noise({ duration: 0.12, volume: 0.3, filter: 'lowpass', freq: 1200, freqEnd: 200 });
    },
    pickup() {
      tone({ type: 'sine', freq: 660, duration: 0.1, volume: 0.2 });
      tone({ type: 'sine', freq: 990, duration: 0.14, volume: 0.2, delay: 0.07 });
    },
    powerUp() {
      tone({ type: 'sawtooth', freq: 220, freqEnd: 1320, duration: 0.4, volume: 0.12, filter: 'lowpass', filterFreq: 3000 });
      tone({ type: 'square', freq: 880, duration: 0.1, volume: 0.08, delay: 0.3 });
      tone({ type: 'square', freq: 1320, duration: 0.15, volume: 0.08, delay: 0.4 });
    },
    countdown(final) {
      tone({ type: 'sine', freq: final ? 1100 : 760, duration: 0.12, volume: 0.22 });
    },
    victory() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', freq: f, duration: 0.35, volume: 0.2, delay: i * 0.12 }));
      tone({ type: 'triangle', freq: 1047, duration: 0.9, volume: 0.15, delay: 0.5 });
    },
    death() {
      tone({ type: 'sawtooth', freq: 300, freqEnd: 40, duration: 1.4, volume: 0.2, filter: 'lowpass', filterFreq: 900 });
      noise({ duration: 0.8, volume: 0.3, filter: 'lowpass', freq: 500, freqEnd: 60 });
    },
    groan() {
      const f = rand(70, 110);
      tone({ type: 'sawtooth', freq: f, freqEnd: f * 0.75, duration: rand(0.5, 0.9), volume: 0.05, filter: 'lowpass', filterFreq: 450, attack: 0.15 });
    },
    click() {
      tone({ type: 'sine', freq: 520, duration: 0.05, volume: 0.1 });
    },
  };
})();
