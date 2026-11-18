// Solmar: screenshot scenes behind ?shot=start|drive|chase|mission. Each one
// plays the real game forward from a fresh world for a fixed number of steps,
// steered by a scripted autopilot, so the frame is what real play looks like
// and the same seed always gives the same frame. The loop renders once after
// staging, then freezes and sets window.__shotReady.
import { WORLD } from './config.js';

const STEP = 1 / 60;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// The city loop: four intersections on the outer streets (streets sit at
// -196, -140, -84, -28, 28, 84, 140, 196 — NOT at the block centres
// between them), each leg a straight run down one street, so the autopilot
// never has to cut across a block.
const LOOP = [
  { x: 140, z: -140 }, { x: 140, z: 140 }, { x: -140, z: 140 }, { x: -140, z: -140 },
];

// Drive the player's car around the loop with pure pursuit: the autopilot
// targets a point 25 m ahead of the car along the route, so corners become
// smooth arcs that stay on the road instead of 90 degree turns into a
// building, and it reverses out when the car gets stuck.
const SEG_LEN = [];
const SEG_START = [];
let ROUTE_TOTAL = 0;
for (let i = 0; i < LOOP.length; i += 1) {
  const a = LOOP[i];
  const b = LOOP[(i + 1) % LOOP.length];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  SEG_LEN.push(len);
  SEG_START.push(ROUTE_TOTAL);
  ROUTE_TOTAL += len;
}
function routePointAt(dist) {
  const d = ((dist % ROUTE_TOTAL) + ROUTE_TOTAL) % ROUTE_TOTAL;
  for (let i = 0; i < LOOP.length; i += 1) {
    if (d <= SEG_START[i] + SEG_LEN[i]) {
      const t = (d - SEG_START[i]) / SEG_LEN[i];
      const a = LOOP[i];
      const b = LOOP[(i + 1) % LOOP.length];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
  }
  return { x: LOOP[0].x, z: LOOP[0].z };
}
function driveAutopilot(game) {
  let lastX = 0;
  let lastZ = 0;
  let lastCheck = 0;
  let reversing = 0;
  return function driveStep(stepIndex) {
    const car = game.vehicles.playerCar;
    if (!car) return;
    if (stepIndex - lastCheck >= 120) {
      const moved = Math.hypot(car.x - lastX, car.z - lastZ);
      if (moved < 1.5 && car.speed > 0.5) reversing = 90;
      lastX = car.x;
      lastZ = car.z;
      lastCheck = stepIndex;
    }
    if (reversing > 0) {
      reversing -= 1;
      game.input.setHeld('forward', false);
      game.input.setHeld('back', true);
      game.input.setHeld('left', true);
      game.input.setHeld('right', false);
      return;
    }
    // closest point on the route to the car, then look 25 m ahead of it
    let bestD = Infinity;
    let bestS = 0;
    for (let i = 0; i < LOOP.length; i += 1) {
      const a = LOOP[i];
      const b = LOOP[(i + 1) % LOOP.length];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz;
      let t = ((car.x - a.x) * abx + (car.z - a.z) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(car.x - (a.x + abx * t), car.z - (a.z + abz * t));
      if (d < bestD) { bestD = d; bestS = SEG_START[i] + t * SEG_LEN[i]; }
    }
    const target = routePointAt(bestS + 25);
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const want = Math.atan2(dx, dz);
    const diff = wrapAngle(want - car.heading);
    game.input.setHeld('left', diff > 0.08);
    game.input.setHeld('right', diff < -0.08);
    game.input.setHeld('forward', Math.abs(diff) < 1.0);
    game.input.setHeld('back', Math.abs(diff) > 1.2);
  };
}

export function stageShot(name, game) {
  const input = game.input;
  const S = (seconds) => Math.floor(seconds / STEP);
  if (name === 'drive' || name === 'chase') {
    game.startGame({ skipIntro: true });
    const car = game.vehicles.parked[0] || game.vehicles.traffic[0];
    game.enterCarAt(car);
    // start on the loop, facing down the first straight, so the whole shot
    // is one clean run along a street instead of a diagonal across blocks
    car.x = LOOP[0].x;
    car.z = LOOP[0].z;
    car.speed = 0;
    car.heading = Math.atan2(LOOP[1].x - LOOP[0].x, LOOP[1].z - LOOP[0].z);
    const pilot = driveAutopilot(game);
    const seconds = name === 'chase' ? 8 : 13;
    if (name === 'chase') game.wanted.setHeat(75, game.wanted.time);
    for (let i = 0; i < S(seconds); i += 1) {
      pilot(i);
      game.advance(STEP);
    }
    input.setHeld('forward', false);
    input.setHeld('back', false);
    input.setHeld('left', false);
    input.setHeld('right', false);
    return { screen: 'play' };
  }
  if (name === 'mission') {
    game.startGame({ skipIntro: true });
    game.missions.start(3);
    game.combat.spawnGang(game.city.landmarks.docks.x, game.city.landmarks.docks.z, 5);
    game.missions.setGangBaseline(0);
    // Vic on the open dock apron, south of the containers, facing the gang
    // as they close in — the beacon, the containers and the sea behind them
    game.player.teleport(game.city.landmarks.docks.x - 6, game.city.landmarks.docks.z + 26, Math.PI);
    game.player.setHeading(Math.atan2(
      game.city.landmarks.docks.x - game.player.x,
      game.city.landmarks.docks.z - game.player.z,
    ));
    for (let i = 0; i < S(4); i += 1) game.advance(STEP);
    return { screen: 'play' };
  }
  // start: the title screen over a living city
  game.startGame({ skipIntro: true, titleOnly: true });
  for (let i = 0; i < S(5); i += 1) game.advance(STEP);
  return { screen: 'title' };
}

export function shotList() {
  return ['start', 'drive', 'chase', 'mission'];
}
