// Solmar: save and load. One localStorage slot holds cash, mission progress,
// the player's spot and health. The title screen offers Continue when a save
// exists. Nothing leaves the browser.
const KEY = 'solmar.save.v1';

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      px: state.px,
      pz: state.pz,
      heading: state.heading,
      health: state.health,
      savedAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.px !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* no storage */ }
}
