// Solmar — keyboard + mouse input, with scripted injection for the
// playtest and screenshot presets. The game never reads keys directly;
// it reads this module's held{} and takeActions(), so a scripted run feeds
// exactly the same input object the keyboard does.

export const ACT = {
  FORWARD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  RUN: 16,
  JUMP: 32,
  ENTER: 64,
  PUNCH: 128,
  SHOOT: 256,
  PAUSE: 512,
  WEAPON: 1024,
  HORN: 2048,
};

const KEYMAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  Space: 'jump',
  KeyE: 'enter',
  KeyF: 'punch',
  KeyQ: 'weapon',
  KeyH: 'horn',
  Escape: 'pause',
  KeyM: 'mute',
};

export function createInput(canvas, hooks) {
  const held = {
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
  };
  let actions = 0;
  let lookX = 0;
  let lookY = 0;
  let locked = false;
  let shooting = false;

  function press(action) {
    actions |= action;
  }

  function onKeyDown(event) {
    const name = KEYMAP[event.code];
    if (!name) return;
    if (name === 'jump') press(ACT.JUMP);
    else if (name === 'enter') press(ACT.ENTER);
    else if (name === 'punch') press(ACT.PUNCH);
    else if (name === 'weapon') press(ACT.WEAPON);
    else if (name === 'horn') press(ACT.HORN);
    else if (name === 'pause') press(ACT.PAUSE);
    else if (name === 'mute') {
      if (hooks.onMute) hooks.onMute();
      return;
    } else {
      held[name] = true;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    const name = KEYMAP[event.code];
    if (name && held[name] !== undefined) held[name] = false;
  }

  function onMouseMove(event) {
    if (!locked) return;
    lookX += event.movementX || 0;
    lookY += event.movementY || 0;
  }

  function onMouseDown(event) {
    if (event.button === 0) {
      shooting = true;
      press(ACT.SHOOT);
    }
    if (event.button === 2) press(ACT.PUNCH);
  }

  function onMouseUp(event) {
    if (event.button === 0) shooting = false;
  }

  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    held,
    get locked() {
      return locked;
    },
    get shooting() {
      return shooting;
    },
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
    inject(action) {
      press(action);
    },
    /** Scripted input: hold or release a movement key by name. */
    setHeld(name, value) {
      if (held[name] !== undefined) held[name] = value;
    },
    /** Scripted input: add mouse-look pixels. */
    addLook(dx, dy) {
      lookX += dx;
      lookY += dy;
    },
    lock() {
      // Pointer lock needs a user gesture; headless captures and the
      // title screen call this without one — swallow the rejection
      // instead of letting it surface as a page error.
      try {
        const p = canvas.requestPointerLock?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* no gesture yet */
      }
    },
    unlock() {
      document.exitPointerLock?.();
    },
  };
}
