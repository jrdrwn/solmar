// Solmar: the wanted system. Crimes add heat; heat decays after a quiet
// spell; stars are heat in steps of 25. The police count follows the stars,
// and the HUD reads the stars from here.
import { WANTED } from './config.js';

export function createWanted() {
  let heat = 0;
  let lastCrimeAt = -999;
  let time = 0;

  return {
    get heat() { return heat; },
    get stars() {
      return Math.min(WANTED.maxStars, Math.floor(heat / WANTED.heatPerStar));
    },
    get time() { return time; },
    addCrime(amount) {
      heat = Math.min(WANTED.maxStars * WANTED.heatPerStar, heat + amount);
      lastCrimeAt = time;
    },
    clear() {
      heat = 0;
    },
    setHeat(value, atTime) {
      heat = value;
      lastCrimeAt = atTime;
    },
    update(dt) {
      time += dt;
      if (time - lastCrimeAt > WANTED.decayDelay && heat > 0) {
        heat = Math.max(0, heat - WANTED.decayRate * dt);
      }
    },
  };
}
