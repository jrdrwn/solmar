// Solmar — save games in localStorage. One key, one small JSON object:
// mission progress, cash, ammo, health and where Vic stands.

import { SAVE_KEY } from './config.js';

export function createSave(getState, applyState) {
  function write() {
    try {
      const s = getState();
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch {
      // storage full or unavailable (private mode): the game still plays
    }
  }

  function read() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return null;
      return data;
    } catch {
      return null;
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  function has() {
    return read() !== null;
  }

  return { write, read, clear, has, applyState };
}
