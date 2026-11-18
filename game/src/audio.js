// Solmar: procedural WebAudio sound. No audio files: every effect is
// synthesised (engine hum, siren, gunshot, punch, chime, jingle) and the
// title screen gets a soft synth pad. Created lazily on first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOscA = null;
  let sirenOscB = null;
  let sirenGain = null;
  let padNodes = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, seconds, type, volume, slideTo) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds + 0.02);
  }

  function noiseHit(seconds, volume, filterFreq) {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.stop(ctx.currentTime + seconds + 0.02);
  }

  return {
    unlock() { ensure(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shoot() { noiseHit(0.14, 0.5, 2600); blip(160, 0.08, 'square', 0.18, 60); },
    punch() { noiseHit(0.1, 0.4, 500); blip(90, 0.1, 'sine', 0.3, 50); },
    crash() { noiseHit(0.35, 0.5, 800); },
    pickup() { blip(660, 0.12, 'sine', 0.25); setTimeout(() => blip(990, 0.16, 'sine', 0.25), 90); },
    denied() { blip(180, 0.18, 'sawtooth', 0.2, 120); },
    reload() { blip(500, 0.05, 'square', 0.15); setTimeout(() => blip(700, 0.05, 'square', 0.15), 110); },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.28), i * 110));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.25), i * 140));
    },
    carDoor() { noiseHit(0.12, 0.3, 900); },
    engineStart(speed01) {
      if (!ensure()) return;
      if (engineOsc) return;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50 + speed01 * 90;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.05;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    },
    engineSet(speed01, on) {
      if (!engineOsc) return;
      engineGain.gain.value = on ? 0.04 + speed01 * 0.05 : 0;
      engineOsc.frequency.value = 50 + speed01 * 110;
    },
    engineStop() {
      if (!engineOsc) return;
      try { engineOsc.stop(); } catch { /* already stopped */ }
      engineOsc = null;
      engineGain = null;
    },
    sirenSet(on) {
      if (on && !sirenOscA) {
        if (!ensure()) return;
        sirenOscA = ctx.createOscillator();
        sirenOscB = ctx.createOscillator();
        sirenOscA.type = 'triangle';
        sirenOscB.type = 'triangle';
        sirenOscA.frequency.value = 700;
        sirenOscB.frequency.value = 950;
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.0;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.8;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.035;
        lfo.connect(lfoGain);
        lfoGain.connect(sirenGain.gain);
        sirenOscA.connect(sirenGain);
        sirenOscB.connect(sirenGain);
        sirenGain.connect(master);
        sirenGain.gain.value = 0.05;
        sirenOscA.start();
        sirenOscB.start();
        lfo.start();
        sirenOscA._lfo = lfo;
      } else if (!on && sirenOscA) {
        try { sirenOscA.stop(); sirenOscB.stop(); sirenOscA._lfo.stop(); } catch { /* already stopped */ }
        sirenOscA = null;
        sirenOscB = null;
        sirenGain = null;
      }
    },
    padStart() {
      if (!ensure() || padNodes) return;
      const freqs = [110, 164.8, 220, 277.2];
      padNodes = freqs.map((f) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const gain = ctx.createGain();
        gain.gain.value = 0.035;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        return { osc, gain };
      });
    },
    padStop() {
      if (!padNodes) return;
      padNodes.forEach(({ osc }) => { try { osc.stop(); } catch { /* already stopped */ } });
      padNodes = null;
    },
  };
}
