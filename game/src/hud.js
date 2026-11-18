// Solmar: the HUD. DOM panels (wanted stars, health, cash, ammo, objective,
// speed, feed, banner, hint) and a live minimap canvas drawn top-down from
// the city streets, the cars, the police and the mission marker.
import { WORLD } from './config.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const hud = $('hud');
  const starsEl = $('stars');
  const healthFill = $('healthFill');
  const cashEl = $('cash');
  const ammoEl = $('ammo');
  const objName = $('objName');
  const objText = $('objText');
  const feedEl = $('feed');
  const speedNum = $('speedNum');
  const speedBox = $('speed');
  const crosshair = $('crosshair');
  const banner = $('banner');
  const bannerBig = $('bannerBig');
  const bannerSub = $('bannerSub');
  const hintEl = $('hint');
  const map = $('minimap');
  const mapCtx = map.getContext('2d');
  let bannerTimer = 0;
  let feedCount = 0;

  function show() { hud.classList.add('on'); }
  function hide() { hud.classList.remove('on'); }

  function addFeed(text) {
    const div = document.createElement('div');
    div.textContent = text;
    feedEl.prepend(div);
    feedCount += 1;
    while (feedEl.children.length > 4) feedEl.removeChild(feedEl.lastChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 9000);
  }

  function showBanner(big, sub, ms) {
    bannerBig.textContent = big;
    bannerSub.textContent = sub || '';
    banner.classList.add('on');
    bannerTimer = (ms || 2600) / 1000;
  }

  function showHint(text) {
    if (text) {
      hintEl.textContent = text;
      hintEl.classList.add('on');
    } else {
      hintEl.classList.remove('on');
    }
  }

  function drawMinimap(s) {
    const W = map.width;
    const H = map.height;
    const minX = -WORLD.half - 30;
    const maxX = WORLD.half + 90; // docks to the east
    const minZ = -WORLD.half - 30;
    const maxZ = WORLD.beachAt + 110; // sea to the south
    const sx = W / (maxX - minX);
    const sz = H / (maxZ - minZ);
    const X = (x) => (x - minX) * sx;
    const Z = (z) => (z - minZ) * sz;
    // base
    mapCtx.fillStyle = '#12283a';
    mapCtx.fillRect(0, 0, W, H);
    // sea
    mapCtx.fillStyle = '#0e5d7d';
    mapCtx.fillRect(0, Z(WORLD.beachAt), W, H - Z(WORLD.beachAt));
    // sand
    mapCtx.fillStyle = '#c9a86a';
    mapCtx.fillRect(0, Z(WORLD.beachAt - 4), W, Z(WORLD.beachAt) - Z(WORLD.beachAt - 4));
    // land
    mapCtx.fillStyle = '#2c3a2e';
    mapCtx.fillRect(0, 0, W, Z(WORLD.beachAt));
    // blocks
    mapCtx.fillStyle = '#3a4a3e';
    const pitch = WORLD.pitch;
    for (let i = 0; i < WORLD.grid; i += 1) {
      for (let j = 0; j < WORLD.grid; j += 1) {
        const x0 = -WORLD.half + WORLD.road + i * pitch;
        const z0 = -WORLD.half + WORLD.road + j * pitch;
        mapCtx.fillRect(X(x0), Z(z0), WORLD.block * sx, WORLD.block * sz);
      }
    }
    // roads
    mapCtx.fillStyle = '#20242c';
    for (const st of s.streets) {
      mapCtx.fillRect(0, Z(st - WORLD.road / 2), W, WORLD.road * sz);
      mapCtx.fillRect(X(st - WORLD.road / 2), 0, WORLD.road * sx, H);
    }
    // docks
    mapCtx.fillStyle = '#6a5232';
    mapCtx.fillRect(X(WORLD.half + 4), Z(0), 52 * sx, 80 * sz);
    // mission marker
    if (s.marker) {
      const pulse = 6 + Math.sin(s.time * 4) * 2;
      mapCtx.fillStyle = '#ffd75e';
      mapCtx.beginPath();
      mapCtx.arc(X(s.marker.x), Z(s.marker.z), pulse, 0, Math.PI * 2);
      mapCtx.fill();
      mapCtx.strokeStyle = '#fff';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath();
      mapCtx.arc(X(s.marker.x), Z(s.marker.z), pulse + 5, 0, Math.PI * 2);
      mapCtx.stroke();
    }
    // traffic
    mapCtx.fillStyle = '#f1c40f';
    for (const c of s.traffic) {
      mapCtx.fillRect(X(c.x) - 2, Z(c.z) - 2, 4, 4);
    }
    // gang
    mapCtx.fillStyle = '#ff4040';
    for (const g of s.gang) {
      if (!g.down) mapCtx.fillRect(X(g.x) - 2, Z(g.z) - 2, 4, 4);
    }
    // police (flashing)
    const flash = Math.floor(s.time * 4) % 2 === 0;
    mapCtx.fillStyle = flash ? '#4da6ff' : '#ff4040';
    for (const c of s.police) {
      mapCtx.beginPath();
      mapCtx.arc(X(c.x), Z(c.z), 4, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // player arrow: drawn pointing down (+z on the map); rotate by -heading
    // so it points along the player's forward direction.
    mapCtx.save();
    mapCtx.translate(X(s.px), Z(s.pz));
    mapCtx.rotate(-s.heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, 9);
    mapCtx.lineTo(-6, -6);
    mapCtx.lineTo(6, -6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
    // view cone
    mapCtx.strokeStyle = 'rgba(255,255,255,0.5)';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.arc(X(s.px), Z(s.pz), 14, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  return {
    show,
    hide,
    addFeed,
    showBanner,
    showHint,
    update(dt, s) {
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) banner.classList.remove('on');
      }
      // stars
      let starHtml = '';
      for (let i = 0; i < 5; i += 1) {
        starHtml += i < s.stars ? '★' : '<span class="off">★</span>';
      }
      starsEl.innerHTML = starHtml;
      // health
      healthFill.style.width = `${Math.max(0, s.health)}%`;
      healthFill.style.background = s.health > 50
        ? 'linear-gradient(90deg,#37d67a,#a8e063)'
        : s.health > 25 ? 'linear-gradient(90deg,#f0a830,#ffd75e)' : 'linear-gradient(90deg,#e5484d,#ff7a7a)';
      cashEl.innerHTML = `$${s.cash.toLocaleString('en-US')} <small>CASH</small>`;
      ammoEl.textContent = s.inCar ? '🚗 ' + (s.carName || 'Stolen ride') : (s.reloading ? 'Reloading…' : `🔫 Pistol ${s.ammo}/12  •  F punch`);
      objName.textContent = s.missionName || 'SOLMAR — FREE ROAM';
      objText.textContent = s.missionText || 'Explore the city. Fares appear on the map — pick one up for $80.';
      if (s.missionTimer !== null && s.missionTimer !== undefined) {
        objText.textContent += `  ⏱ ${Math.max(0, Math.ceil(s.missionTimer))}s`;
      }
      if (s.inCar) {
        speedBox.style.display = 'block';
        speedNum.textContent = Math.round(Math.abs(s.speed) * 3.6);
      } else {
        speedBox.style.display = 'none';
      }
      crosshair.classList.toggle('on', !s.inCar && s.armed);
      drawMinimap(s);
    },
  };
}
