// Solmar — the HUD: health, cash, ammo, wanted stars, mission objective,
// toasts, damage flash, arrest meter and the minimap. The minimap is a
// 2D canvas redrawn every frame from the live world snapshot main.js
// hands it; nothing here owns game state.

import { CITY, BEACH_Z0, SEA_Z0, DOCKS_X0, STREETS } from './config.js';

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const healthFill = el('healthFill');
  const cashEl = el('cash');
  const ammoEl = el('ammo');
  const weaponEl = el('weapon');
  const starsEl = el('stars');
  const objectiveEl = el('objective');
  const toastEl = el('toast');
  const flashEl = el('damageFlash');
  const arrestWrap = el('arrestWrap');
  const arrestFill = el('arrestFill');
  const speedoEl = el('speedo');
  const crosshair = el('crosshair');
  const map = el('minimap');
  const mapCtx = map.getContext('2d');

  let toastTimer = 0;
  let flash = 0;
  const toastQueue = [];

  function toast(text) {
    toastQueue.push(text);
    if (toastQueue.length === 1) showNextToast();
  }

  function showNextToast() {
    const text = toastQueue[0];
    if (!text) {
      toastEl.textContent = '';
      toastEl.classList.remove('on');
      return;
    }
    toastEl.textContent = text;
    toastEl.classList.add('on');
    toastTimer = 4;
  }

  function flashDamage() {
    flash = 0.55;
  }

  // screen name -> overlay id (paused maps to pauseScreen, not pausedScreen)
  const SCREENS = { title: 'titleScreen', paused: 'pauseScreen', busted: 'bustedScreen', wasted: 'wastedScreen' };
  function showScreen(name) {
    for (const [key, id] of Object.entries(SCREENS)) {
      el(id)?.classList.toggle('on', key === name);
    }
    el('hud')?.classList.toggle('on', name === 'play');
  }

  function drawMinimap(s) {
    const W = map.width;
    const H = map.height;
    const range = 340; // world units shown across the map
    const toMap = (x, z) => [((x + range) / (range * 2)) * W, ((z + range) / (range * 2)) * H];
    mapCtx.fillStyle = '#101418';
    mapCtx.fillRect(0, 0, W, H);
    // sea (south) + beach
    const [, seaY] = toMap(0, SEA_Z0);
    mapCtx.fillStyle = '#1e7fa8';
    mapCtx.fillRect(0, seaY, W, H - seaY);
    const [, beachY] = toMap(0, BEACH_Z0);
    mapCtx.fillStyle = '#e8d29a';
    mapCtx.fillRect(0, beachY, W, seaY - beachY);
    // docks (east)
    const [dockX] = toMap(DOCKS_X0, 0);
    mapCtx.fillStyle = '#9a9a92';
    mapCtx.fillRect(dockX, 0, W - dockX, beachY);
    // blocks
    mapCtx.fillStyle = '#3a3f46';
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const [x0, z0] = toMap(STREETS[i] + 7, STREETS[j] + 7);
        const [x1, z1] = toMap(STREETS[i + 1] - 7, STREETS[j + 1] - 7);
        mapCtx.fillRect(x0, z0, x1 - x0, z1 - z0);
      }
    }
    // streets
    mapCtx.strokeStyle = '#6a7078';
    mapCtx.lineWidth = 2;
    for (const s of STREETS) {
      const [x] = toMap(s, 0);
      const [, z] = toMap(0, s);
      mapCtx.beginPath();
      mapCtx.moveTo(x, 0);
      mapCtx.lineTo(x, H);
      mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(0, z);
      mapCtx.lineTo(W, z);
      mapCtx.stroke();
    }
    // marker (mission / taxi)
    if (s.marker) {
      const [mx, my] = toMap(s.marker.x, s.marker.z);
      mapCtx.fillStyle = '#ffd24a';
      mapCtx.beginPath();
      mapCtx.moveTo(mx, my - 6);
      mapCtx.lineTo(mx + 5, my);
      mapCtx.lineTo(mx, my + 6);
      mapCtx.lineTo(mx - 5, my);
      mapCtx.closePath();
      mapCtx.fill();
    }
    // traffic + parked cars
    mapCtx.fillStyle = '#c8c8c8';
    for (const c of s.cars || []) {
      const [cx, cy] = toMap(c.x, c.z);
      mapCtx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // enemies
    mapCtx.fillStyle = '#ff4040';
    for (const e of s.enemies || []) {
      const [ex, ey] = toMap(e.x, e.z);
      mapCtx.beginPath();
      mapCtx.arc(ex, ey, 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // police (flashing)
    const blink = Math.floor(performance.now() / 300) % 2 === 0;
    mapCtx.fillStyle = blink ? '#ff3030' : '#3060ff';
    for (const p of s.police || []) {
      const [px, py] = toMap(p.x, p.z);
      mapCtx.beginPath();
      mapCtx.arc(px, py, 3.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // player arrow: the map's y grows south like world z, so a heading of
    // θ points along (sin θ, cos θ) on the map; an up-drawn arrow rotated
    // by (π − θ) points exactly there.
    const [px, py] = toMap(s.px, s.pz);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(-s.heading + Math.PI);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 5);
    mapCtx.lineTo(0, 2);
    mapCtx.lineTo(-5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
    void CITY;
  }

  function update(dt, s) {
    // toasts
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) {
        toastQueue.shift();
        showNextToast();
      }
    }
    // damage flash decay
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 1.4);
      flashEl.style.opacity = String(flash);
    } else {
      flashEl.style.opacity = '0';
    }
    healthFill.style.width = `${Math.max(0, s.health)}%`;
    healthFill.style.background = s.health > 50 ? '#4ac85c' : s.health > 25 ? '#e8a82e' : '#d83a2e';
    cashEl.textContent = `$${s.cash}`;
    ammoEl.textContent = s.weapon === 'pistol' ? `Ammo ${s.ammo}` : 'Fists';
    weaponEl.textContent = s.weapon === 'pistol' ? 'Pistol [Q]' : 'Fists [Q]';
    starsEl.textContent = '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars);
    starsEl.classList.toggle('hot', s.stars > 0);
    objectiveEl.textContent = s.objective || '';
    speedoEl.textContent = s.inCar ? `${Math.round(s.speed * 3.6)} km/h` : '';
    speedoEl.classList.toggle('on', s.inCar);
    crosshair.classList.toggle('on', !s.inCar && s.weapon === 'pistol');
    if (s.arrest > 0.02) {
      arrestWrap.classList.add('on');
      arrestFill.style.width = `${Math.round(s.arrest * 100)}%`;
    } else {
      arrestWrap.classList.remove('on');
    }
    drawMinimap(s);
  }

  return { update, toast, flashDamage, showScreen };
}
