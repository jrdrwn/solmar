// Solmar: keyboard and mouse input. Held keys are read every frame; one-shot
// presses (enter car, punch, reload, jump, pause) are queued as flags and
// taken once by the loop, so a press between frames is never lost or doubled.
export const ACT = {
  ENTER: 1,
  PUNCH: 2,
  RELOAD: 4,
  JUMP: 8,
  PAUSE: 16,
  MUTE: 32,
  PHOTO: 64,
  SHOOT: 128,
};

const KEYS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'jump',
  KeyE: 'enter',
  KeyF: 'punch',
  KeyR: 'reload',
  KeyM: 'mute',
  KeyP: 'photo',
  Escape: 'pause',
};

export function createInput(canvas) {
  const held = { forward: false, back: false, left: false, right: false, run: false };
  let actions = 0;
  let lookX = 0;
  let lookY = 0;
  let locked = false;

  function press(action) {
    actions |= action;
  }

  window.addEventListener('keydown', (event) => {
    const name = KEYS[event.code];
    if (!name) return;
    if (name === 'jump') { if (!event.repeat) press(ACT.JUMP); }
    else if (name === 'enter') { if (!event.repeat) press(ACT.ENTER); }
    else if (name === 'punch') { if (!event.repeat) press(ACT.PUNCH); }
    else if (name === 'reload') { if (!event.repeat) press(ACT.RELOAD); }
    else if (name === 'mute') { if (!event.repeat) press(ACT.MUTE); }
    else if (name === 'photo') { if (!event.repeat) press(ACT.PHOTO); }
    else if (name === 'pause') { if (!event.repeat) press(ACT.PAUSE); }
    else held[name] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const name = KEYS[event.code];
    if (name && held[name] !== undefined) held[name] = false;
  });
  window.addEventListener('blur', () => {
    held.forward = held.back = held.left = held.right = held.run = false;
  });

  canvas.addEventListener('click', () => {
    if (!locked && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    lookX += event.movementX || 0;
    lookY += event.movementY || 0;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) press(ACT.SHOOT);
  });

  return {
    held,
    get locked() { return locked; },
    /** Mouse look accumulated since the last call, in pixels; resets to zero. */
    takeLook() {
      const dx = lookX;
      const dy = lookY;
      lookX = 0;
      lookY = 0;
      return { dx, dy };
    },
    /** One-shot presses since the last call, as ACT_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Scripted input for screenshots and tests: press an action flag directly. */
    inject(action) { press(action); },
    /** Scripted input: hold or release a movement key by name. */
    setHeld(name, value) { if (held[name] !== undefined) held[name] = value; },
    /** Scripted input: add mouse-look pixels. */
    addLook(dx, dy) { lookX += dx; lookY += dy; },
    lock() {
      try {
        const p = canvas.requestPointerLock?.();
        p?.catch?.(() => { /* headless or no gesture yet: mouse look just waits */ });
      } catch { /* pointer lock unavailable */ }
    },
    unlock() { document.exitPointerLock?.(); },
  };
}
