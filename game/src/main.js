// Solmar: boot and the one loop. A fixed 60 Hz simulation feeds rendering at
// the display's rate; every system (city, player, cars, peds, wanted, combat,
// missions, HUD, audio, effects, save) is wired here. ?shot=name&seed=N stages
// a deterministic frame for a capture, renders it once, then freezes it and
// sets window.__shotReady. No network request is ever made.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { mulberry32, clamp } from './rng.js';
import { createInput, ACT } from './input.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPeds } from './peds.js';
import { createWanted } from './wanted.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { stageShot } from './shots.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 20261118);

const CAR_NAMES = ['Palmaro GT', 'Sol Sunrunner', 'Costa Cruiser', 'Marina LX', 'Duna 4x4', 'Vela Sport', 'Brisa Coupe', 'Tamarind Van'];

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const lowQuality = params.get('quality') === 'low';
renderer.setPixelRatio(lowQuality ? 1 : Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lowQuality;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 60, 120);

const rng = mulberry32(seed);
const input = createInput(canvas);
const audio = createAudio();
const city = createCity(scene, seed);
const fx = createEffects(scene);
const player = createPlayer(scene, city.spawn);
const vehicles = createVehicles(scene, city, rng, audio, fx);
const peds = createPeds(scene, city, rng);
const wanted = createWanted();
const combat = createCombat(scene, peds, audio, fx);
const missions = createMissions(city.landmarks);
const hud = createHud();

let screen = 'title'; // title | play | paused | busted | wasted
let cash = 40;
let inCar = false;
let carName = '';
let time = 0;
let bustedTimer = 0;
let fareCooldown = 0;
let photoMode = false;
let frozen = false;
let savedAt = 0;
const errors = [];

window.addEventListener('error', (event) => errors.push(String(event.message || event.error)));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- overlays ---
const $ = (id) => document.getElementById(id);
const titleScreen = $('titleScreen');
const pauseScreen = $('pauseScreen');
const bustedScreen = $('bustedScreen');
const wastedScreen = $('wastedScreen');
const btnNew = $('btnNew');
const btnContinue = $('btnContinue');
if (hasSave()) btnContinue.style.display = 'block';
btnNew.addEventListener('click', () => { audio.unlock(); startGame({ fresh: true }); });
btnContinue.addEventListener('click', () => { audio.unlock(); startGame({ fresh: false }); });
$('btnResume').addEventListener('click', () => setScreen('play'));
$('btnQuit').addEventListener('click', () => { saveNow(); setScreen('title'); });
$('btnBusted').addEventListener('click', () => respawn('police'));
$('btnWasted').addEventListener('click', () => respawn('hospital'));
canvas.addEventListener('click', () => { if (screen === 'play') audio.unlock(); });

// --- mission beacon: a gold light pillar over the current objective ---
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 40, 12, 1, true), beaconMat);
beacon.position.y = 20;
scene.add(beacon);
const beaconRing = new THREE.Mesh(
  new THREE.RingGeometry(2.2, 3, 24),
  new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
);
beaconRing.rotation.x = -Math.PI / 2;
beaconRing.position.y = 0.15;
scene.add(beaconRing);

// --- health packs: green crosses at the hospital, the garage and the docks ---
const healthPacks = [];
function makeHealthPack(x, z) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x37d67a });
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.25), mat);
  v.position.y = 1;
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), mat);
  h.position.y = 1;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.2, 20),
    new THREE.MeshBasicMaterial({ color: 0x37d67a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  group.add(v, h, ring);
  group.position.set(x, 0, z);
  scene.add(group);
  return { group, x, z, cooldown: 0 };
}
healthPacks.push(
  makeHealthPack(city.landmarks.hospital.x, city.landmarks.hospital.z + 4),
  makeHealthPack(city.landmarks.garage.x, city.landmarks.garage.z + 4),
  makeHealthPack(city.landmarks.docks.x, city.landmarks.docks.z + 4),
);

// --- events from the systems ---
vehicles.onEvent = (type, data) => {
  if (type === 'crash') {
    audio.crash();
    fx.shake(0.35);
  } else if (type === 'ram') {
    audio.crash();
    fx.shake(0.25);
  }
};
combat.onEvent = (type) => {
  if (type === 'gangDown') {
    cash += 50;
    hud.addFeed('+$50 — Viper down.');
  } else if (type === 'pedShot') {
    wanted.addCrime(40);
    hud.addFeed('Pedestrian down! The PD will hear about this.');
    peds.fleeFrom(player.x, player.z, 40);
  } else if (type === 'pedPunched') {
    wanted.addCrime(25);
    hud.addFeed('Assault! Wanted level rising.');
  } else if (type === 'carShot') {
    wanted.addCrime(12);
  } else if (type === 'wasted') {
    setScreen('wasted');
  }
};
missions.onEvent = (type, data) => {
  if (type === 'brief') {
    hud.addFeed(`MISSION: ${data.mission.name} — ${data.mission.brief}`);
    if (missions.index === 3) {
      combat.clearGang();
      combat.spawnGang(city.landmarks.docks.x, city.landmarks.docks.z, 5);
      missions.setGangBaseline(0);
    }
    if (missions.index === 4) {
      wanted.setHeat(50, wanted.time);
      hud.addFeed('The haul is hot — the PD is already looking for you.');
    }
  } else if (type === 'complete') {
    cash += data.reward;
    hud.showBanner('MISSION COMPLETE', `+$${data.reward} — ${data.mission.name}`);
    hud.addFeed(`Mission complete: ${data.mission.name} (+$${data.reward}).`);
    audio.missionDone();
    saveNow();
  } else if (type === 'fail') {
    hud.showBanner('MISSION FAILED', data.reason);
    hud.addFeed(`Mission failed: ${data.reason} Try again.`);
    audio.missionFail();
  } else if (type === 'storyDone') {
    hud.showBanner('SOLMAR IS YOURS', 'Free roam — fares pay $80 a ride.');
    hud.addFeed('All five jobs done. Solmar is yours — pick up fares around town.');
  } else if (type === 'farePicked') {
    hud.addFeed('Fare picked up — drop them at the gold marker.');
  } else if (type === 'fareDone') {
    cash += data.reward;
    hud.addFeed(`+$${data.reward} fare. Nice driving.`);
    audio.pickup();
  }
};

function saveNow() {
  saveGame({ cash, missionIndex: missions.index, px: player.x, pz: player.z, heading: player.heading, health: combat.health });
  savedAt = time;
}

function setScreen(next) {
  screen = next;
  titleScreen.classList.toggle('on', next === 'title');
  pauseScreen.classList.toggle('on', next === 'paused');
  bustedScreen.classList.toggle('on', next === 'busted');
  wastedScreen.classList.toggle('on', next === 'wasted');
  if (next === 'play') {
    hud.show();
    audio.padStop();
    input.lock();
  } else if (next === 'title') {
    hud.hide();
    audio.padStart();
    input.unlock();
  } else {
    input.unlock();
  }
  if (next === 'paused') saveNow();
}

function respawn(place) {
  const spot = place === 'police' ? city.landmarks.police : city.landmarks.hospital;
  cash = Math.max(0, cash - 100);
  combat.setHealth(100);
  wanted.clear();
  bustedTimer = 0;
  if (inCar) exitCar();
  player.teleport(spot.x, spot.z + 6, 0);
  player.snapCamera(camera, 'foot', null);
  setScreen('play');
}

function enterCarAt(car) {
  if (!car) return false;
  const wasTraffic = vehicles.traffic.includes(car);
  vehicles.enter(car);
  inCar = true;
  carName = CAR_NAMES[Math.floor(rng() * CAR_NAMES.length)];
  car.name = carName;
  player.mesh.visible = false;
  audio.engineStart(0);
  if (wasTraffic) {
    wanted.addCrime(25);
    hud.addFeed('Car stolen! The PD is onto you.');
  }
  hud.showHint('');
  return true;
}

function exitCar() {
  if (!inCar || !vehicles.playerCar) return;
  const car = vehicles.playerCar;
  vehicles.exit();
  inCar = false;
  audio.engineStop();
  const side = car.heading + Math.PI / 2;
  player.teleport(car.x + Math.sin(side) * 2.4, car.z + Math.cos(side) * 2.4, car.heading);
  player.mesh.visible = true;
  player.snapCamera(camera, 'foot', null);
}

function startGame(opts) {
  vehicles.reset();
  peds.reset();
  combat.clearGang();
  combat.setHealth(100);
  wanted.clear();
  bustedTimer = 0;
  inCar = false;
  player.mesh.visible = true;
  audio.engineStop();
  vehicles.spawnTraffic(14);
  vehicles.spawnParked(10);
  peds.spawn(26);
  if (opts.fresh) {
    cash = 40;
    player.teleport(city.spawn.x, city.spawn.z, city.spawn.heading);
    missions.start(0);
  } else {
    const save = loadGame();
    cash = save ? save.cash : 40;
    player.teleport(save ? save.px : city.spawn.x, save ? save.pz : city.spawn.z, save ? save.heading : city.spawn.heading);
    combat.setHealth(save ? save.health : 100);
    missions.start(save ? Math.min(save.missionIndex, 4) : 0);
  }
  player.snapCamera(camera, 'foot', null);
  if (opts.titleOnly) {
    setScreen('title');
  } else {
    setScreen('play');
    hud.addFeed('Welcome to Solmar. Rosa is waiting — follow the gold marker.');
  }
}

function handleActions(actions) {
  if (actions & ACT.PAUSE) {
    if (screen === 'play') setScreen('paused');
    else if (screen === 'paused') setScreen('play');
    return;
  }
  if (screen !== 'play') return;
  if (actions & ACT.MUTE) {
    const muted = audio.toggleMute();
    hud.addFeed(muted ? 'Sound off.' : 'Sound on.');
  }
  if (actions & ACT.PHOTO) {
    photoMode = !photoMode;
    if (photoMode) hud.hide();
    else hud.show();
  }
  if (actions & ACT.ENTER) {
    if (inCar) {
      exitCar();
    } else {
      const car = vehicles.nearestEnterable(player.x, player.z, 3.4);
      if (car) enterCarAt(car);
      else hud.showHint('No car in reach — get closer and press E.');
    }
  }
  if (actions & ACT.PUNCH && !inCar) {
    const result = combat.punch(player.x, player.z, player.heading);
    if (result === 'ped') peds.fleeFrom(player.x, player.z, 30);
  }
  if (actions & ACT.SHOOT && !inCar) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const len = Math.hypot(dir.x, dir.z) || 1;
    const result = combat.shoot({ x: player.x, z: player.z }, { x: dir.x / len, z: dir.z / len }, vehicles);
    if (result && result !== 'busy') {
      wanted.addCrime(12);
      if (result === 'ped') peds.fleeFrom(player.x, player.z, 40);
    }
  }
  if (actions & ACT.RELOAD && !inCar) combat.reload();
}

// One fixed step of the whole simulation. Used by the live loop and by the
// screenshot staging, so a shot frame is real play, not a posed render.
function advance(dt) {
  time += dt;
  city.update(dt);
  fx.update(dt);
  const marker = missions.marker();
  if (marker) {
    beacon.visible = true;
    beaconRing.visible = true;
    beacon.position.set(marker.x, 20, marker.z);
    beaconRing.position.set(marker.x, 0.15, marker.z);
    beaconRing.scale.setScalar(1 + Math.sin(time * 3) * 0.15);
  } else {
    beacon.visible = false;
    beaconRing.visible = false;
  }
  for (const pack of healthPacks) {
    if (pack.cooldown > 0) {
      pack.cooldown -= dt;
      pack.group.visible = pack.cooldown <= 0;
    }
    pack.group.rotation.y += dt;
    if (pack.cooldown <= 0 && screen === 'play' && !inCar) {
      const d = Math.hypot(player.x - pack.x, player.z - pack.z);
      if (d < 2) {
        combat.heal(50);
        pack.cooldown = 30;
        pack.group.visible = false;
        audio.pickup();
        hud.addFeed('+50 health.');
      }
    }
  }
  if (screen === 'title') {
    // living city behind the title: traffic and peds keep moving
    vehicles.update(dt, { playerX: player.x, playerZ: player.z, playerInCar: false, wanted: 0, input, camYaw: player.camYaw });
    peds.update(dt);
    const orbit = time * 0.05;
    camera.position.set(Math.sin(orbit) * 150, 70, Math.cos(orbit) * 150);
    camera.lookAt(0, 10, 0);
    return;
  }
  if (screen !== 'play') return;

  const actions = input.takeActions();
  handleActions(actions);

  if (inCar && vehicles.playerCar) {
    const car = vehicles.playerCar;
    player.followCar(car.x, car.z, car.heading);
    player.applyLook(input.takeLook());
  } else {
    player.update(dt, input, city.colliders, WORLD.half, false, actions);
  }
  vehicles.update(dt, {
    playerX: player.x, playerZ: player.z,
    playerInCar: inCar, wanted: wanted.stars, input, camYaw: player.camYaw,
  });
  peds.update(dt);
  wanted.update(dt);
  combat.update(dt, player.x, player.z, inCar);
  missions.update(dt, {
    px: player.x, pz: player.z, inCar,
    stars: wanted.stars,
    gangDown: combat.gang.filter((g) => g.down).length,
  });

  // free-roam fares appear once the story is done
  if (missions.stage === 'idle' && !missions.fare) {
    fareCooldown -= dt;
    if (fareCooldown <= 0) {
      missions.newFare(rng, city.streets);
      fareCooldown = 45;
      hud.addFeed('A fare is waiting — gold marker on the map.');
    }
  }

  // the player's car can knock pedestrians down
  if (inCar && vehicles.playerCar && Math.abs(vehicles.playerCar.speed) > 2) {
    const result = peds.hitByCar(vehicles.playerCar.x, vehicles.playerCar.z, Math.abs(vehicles.playerCar.speed));
    if (result === 'hit') {
      wanted.addCrime(25);
      hud.addFeed('You hit a pedestrian! Wanted level rising.');
      audio.crash();
      fx.shake(0.3);
      peds.fleeFrom(player.x, player.z, 30);
    } else if (result === 'killed') {
      wanted.addCrime(40);
      hud.addFeed('Pedestrian killed! The PD is coming.');
      audio.crash();
      fx.shake(0.4);
      peds.fleeFrom(player.x, player.z, 50);
    }
  }

  // busted: police catch the player on foot (3.5 m — a cruiser stopped on
  // the player is an arrest, not a near miss)
  if (!inCar) {
    let near = false;
    for (const cop of vehicles.police) {
      if (Math.hypot(cop.x - player.x, cop.z - player.z) < 3.5) { near = true; break; }
    }
    if (near && wanted.stars > 0) {
      bustedTimer += dt;
      if (bustedTimer > 2.5) {
        setScreen('busted');
        return;
      }
    } else {
      bustedTimer = Math.max(0, bustedTimer - dt * 2);
    }
  }

  // audio: sirens follow the wanted level
  audio.sirenSet(wanted.stars > 0);

  // autosave every 30 s of play
  if (time - savedAt > 30) saveNow();

  // camera + HUD
  const shake = fx.shakeOffset;
  if (inCar && vehicles.playerCar) {
    player.updateCamera(dt, camera, 'car', vehicles.playerCar, shake);
  } else {
    player.updateCamera(dt, camera, 'foot', null, shake);
  }
  hud.update(dt, {
    stars: wanted.stars,
    health: combat.health,
    cash,
    ammo: combat.ammo,
    reloading: combat.reloading,
    inCar,
    carName,
    speed: vehicles.playerCar ? vehicles.playerCar.speed : 0,
    armed: true,
    missionName: missions.current ? `MISSION ${missions.index + 1}: ${missions.current.name}` : null,
    missionText: missions.current ? missions.current.objective : null,
    missionTimer: missions.timer,
    marker,
    streets: city.streets,
    traffic: vehicles.traffic,
    police: vehicles.police,
    gang: combat.gang,
    px: player.x,
    pz: player.z,
    heading: inCar && vehicles.playerCar ? vehicles.playerCar.heading : player.heading,
    time,
  });
}

// --- boot: a living city behind the title screen ---
vehicles.spawnTraffic(14);
vehicles.spawnParked(10);
peds.spawn(26);
audio.padStart();

const game = {
  input,
  vehicles,
  peds,
  wanted,
  combat,
  missions,
  city,
  player,
  fx,
  audio,
  hud,
  startGame,
  enterCarAt,
  advance,
  get screen() { return screen; },
  get cash() { return cash; },
};

window.__solmar = {
  get screen() { return screen; },
  get cash() { return cash; },
  get stars() { return wanted.stars; },
  get health() { return combat.health; },
  get ammo() { return combat.ammo; },
  get px() { return player.x; },
  get pz() { return player.z; },
  get inCar() { return inCar; },
  get speed() { return vehicles.playerCar ? vehicles.playerCar.speed : 0; },
  get missionIndex() { return missions.index; },
  get missionStage() { return missions.stage; },
  get gangDown() { return combat.gang.filter((g) => g.down).length; },
  get traffic() { return vehicles.traffic.length; },
  get police() { return vehicles.police.length; },
  get peds() { return peds.peds.length; },
  get errors() { return errors; },
  get simTime() { return time; },
  camPos() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z }; },
  carMesh() {
    const c = vehicles.playerCar;
    return c ? { x: c.mesh.position.x, z: c.mesh.position.z, heading: c.heading } : null;
  },
  // scripted-input hooks for the playtest (and nothing else): they drive the
  // same input object the keyboard does, so a test is real input, not a cheat
  ACT,
  setHeld(name, value) { input.setHeld(name, value); },
  inject(action) { input.inject(action); },
  teleport(x, z) { player.teleport(x, z, 0); },
  teleportCar(x, z) {
    if (vehicles.playerCar) {
      vehicles.playerCar.x = x;
      vehicles.playerCar.z = z;
      vehicles.playerCar.speed = 0;
    }
  },
  parked() { return vehicles.parked.map((c) => ({ x: c.x, z: c.z })); },
  trafficList() { return vehicles.traffic.map((c) => ({ x: c.x, z: c.z })); },
  policeList() { return vehicles.police.map((c) => ({ x: c.x, z: c.z, speed: c.speed, node: c.node })); },
  get bustedTimer() { return bustedTimer; },
  marker() { return missions.marker(); },
  startGame,
  enterCarAt,
  advance,
};

// --- the loop ---
let last = performance.now();
let acc = 0;
let shotStaged = false;
function loop(now) {
  requestAnimationFrame(loop);
  const frameDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }
  if (shotName && !shotStaged) {
    shotStaged = true;
    const staged = stageShot(shotName, game);
    setScreen(staged.screen);
    if (staged.screen === 'play') hud.show();
    renderer.render(scene, camera);
    frozen = true;
    window.__shotReady = true;
    return;
  }
  acc += frameDt;
  let steps = 0;
  while (acc >= FIXED_STEP && steps < 5) {
    advance(FIXED_STEP);
    acc -= FIXED_STEP;
    steps += 1;
  }
  if (steps === 5) acc = 0;
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
