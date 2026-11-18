// Solmar — all sound is procedural WebAudio: no audio files, nothing
// over the network. Engine hum, sirens, gunshots, punches, pickups and a
// slow title pad, all synthesized when the player first interacts.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let padNodes = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // engine: sawtooth through a lowpass, pitch follows speed
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    // siren: triangle that wails between two tones
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenLfo.start();
  }

  function blip(freq, dur, type = 'sine', vol = 0.25, slideTo = null) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    setEngine(speed01, on) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.09 : 0, t, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.1);
    },
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
    },
    shot() {
      noiseBurst(0.12, 0.5, 2400);
      blip(160, 0.08, 'square', 0.2, 60);
    },
    enemyShot() {
      noiseBurst(0.1, 0.22, 1800);
    },
    punch() {
      noiseBurst(0.09, 0.4, 500);
      blip(90, 0.1, 'sine', 0.3, 45);
    },
    jump() {
      blip(240, 0.12, 'sine', 0.12, 420);
    },
    click() {
      blip(700, 0.05, 'square', 0.12);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.25);
      setTimeout(() => blip(990, 0.14, 'sine', 0.25), 90);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.25), i * 110));
    },
    fail() {
      blip(320, 0.3, 'sawtooth', 0.2, 160);
    },
    alarm() {
      blip(880, 0.15, 'square', 0.2, 880);
      setTimeout(() => blip(880, 0.15, 'square', 0.2, 880), 200);
    },
    thud() {
      noiseBurst(0.15, 0.35, 300);
    },
    busted() {
      [440, 349, 293].forEach((f, i) => setTimeout(() => blip(f, 0.35, 'triangle', 0.25), i * 200));
    },
    wasted() {
      [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.4, 'sawtooth', 0.2), i * 220));
    },
    startPad() {
      if (!ctx || padNodes) return;
      // slow warm pad: two detuned saws through a lowpass, a fifth apart
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 110;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = 164.8;
      const o3 = ctx.createOscillator();
      o3.type = 'sine';
      o3.frequency.value = 55;
      o1.connect(f);
      o2.connect(f);
      o3.connect(f);
      f.connect(g);
      g.connect(master);
      o1.start();
      o2.start();
      o3.start();
      padNodes = { g, o1, o2, o3 };
    },
    stopPad() {
      if (!padNodes || !ctx) return;
      const { g, o1, o2, o3 } = padNodes;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(() => {
        try {
          o1.stop();
          o2.stop();
          o3.stop();
        } catch {
          /* already stopped */
        }
      }, 1200);
      padNodes = null;
    },
  };
}
