// Solmar — bootstrap and the game loop. Wires every module together,
// runs the state machine (title / play / paused / busted / wasted),
// drives the chase camera and exposes window.__solmar, the scripted
// interface the playtest and the screenshot presets drive.

import * as THREE from 'three';
import { SPEED, MONEY } from './config.js';
import { makeRng } from './rng.js';
import { createInput, ACT } from './input.js';
import { buildCity } from './city.js';
import { createVehicles } from './vehicles.js';
import { createPeds } from './peds.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { createWanted } from './wanted.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createSave } from './save.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed') || 20261118);
const LOW_QUALITY = params.get('quality') === 'low';
const SHOT = params.get('shot');

const rng = makeRng(SEED);
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW_QUALITY });
renderer.setPixelRatio(LOW_QUALITY ? 1 : Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// -- world -------------------------------------------------------------------
const city = buildCity(scene, rng);
const colliders = city.colliders;
const vehicles = createVehicles(scene, rng, colliders);
vehicles.spawnTraffic(14);
vehicles.spawnParked(10);
const peds = createPeds(scene, rng, colliders);
peds.spawn(26);
const player = createPlayer(scene);
player.place(28, 28, 0);
const audio = createAudio();
const effects = createEffects(scene);
const hud = createHud(document);

let screen = 'title';
let simTime = 0;
let arrestProgress = 0;
let shotReadyAt = Infinity;

const input = createInput(canvas, {
  onMute: () => {
    const muted = audio.toggleMute();
    hud.toast(muted ? 'Sound off' : 'Sound on');
  },
});

const wanted = createWanted(vehicles, rng);
const combat = createCombat(scene, {
  peds,
  player,
  wanted,
  audio,
  effects,
  colliders,
  hud,
  onEnemyKilled: () => {},
  onPlayerDown: () => wasted(),
});
const missionsCtx = { player, combat, wanted, hud, audio, rng, save: null };
const missions = createMissions(scene, missionsCtx);
const save = createSave(
  () => ({
    missionIndex: missions.missionIndex,
    cash: player.cash,
    ammo: player.ammo,
    health: player.health,
    x: player.x,
    z: player.z,
    heading: player.heading,
    weapon: player.weapon,
  }),
  (data) => {
    player.cash = data.cash ?? MONEY.startCash;
    player.ammo = data.ammo ?? 24;
    player.health = data.health ?? 100;
    player.weapon = data.weapon ?? 'fists';
    player.gun.visible = player.weapon === 'pistol';
    player.place(data.x ?? 28, data.z ?? 28, data.heading ?? 0);
    missions._setIndex(Math.min(4, Math.max(0, data.missionIndex ?? 0)));
  },
);
// missions closed over missionsCtx, so the save slot is live now
missionsCtx.save = save;

// -- screens -------------------------------------------------------------------
function setScreen(next) {
  screen = next;
  hud.showScreen(next);
  if (next === 'play') {
    input.lock();
    audio.unlock();
    audio.stopPad();
  } else {
    input.unlock();
  }
  if (next === 'title') audio.startPad();
}

function newGame() {
  player.healFull();
  player.cash = MONEY.startCash;
  player.ammo = 24;
  player.weapon = 'fists';
  player.gun.visible = false;
  if (player.inCar) {
    const car = player.car;
    car.kind = car.prevKind || 'parked';
    player.exitCar();
  }
  player.place(28, 28, 0);
  wanted.clear();
  combat.clearEnemies();
  missions.start();
  save.clear();
  setScreen('play');
  hud.toast('Welcome to Solmar. Rosa has work for you — check the objective.');
}

function continueGame() {
  const data = save.read();
  if (!data) return;
  player.healFull();
  wanted.clear();
  combat.clearEnemies();
  save.applyState(data);
  setScreen('play');
  hud.toast('Back in Solmar. Rosa is waiting.');
}

function busted() {
  if (screen !== 'play') return;
  if (player.inCar) {
    const car = player.car;
    car.kind = car.prevKind || 'parked';
    player.exitCar();
  }
  player.cash = Math.max(0, player.cash - MONEY.bail);
  wanted.clear();
  player.place(28, 28, 0);
  audio.busted();
  audio.setSiren(false);
  audio.setEngine(0, false);
  save.write();
  setScreen('busted');
  hud.toast('BUSTED — $100 bail.');
}

function wasted() {
  if (screen !== 'play') return;
  if (player.inCar) {
    const car = player.car;
    car.kind = car.prevKind || 'parked';
    player.exitCar();
  }
  player.cash = Math.max(0, player.cash - MONEY.bail);
  wanted.clear();
  player.healFull();
  player.place(28, 28, 0);
  audio.wasted();
  audio.setSiren(false);
  audio.setEngine(0, false);
  save.write();
  setScreen('wasted');
  hud.toast('WASTED — the clinic patched you up. $100.');
}

// buttons
document.getElementById('btnNew')?.addEventListener('click', () => {
  audio.unlock();
  newGame();
});
document.getElementById('btnContinue')?.addEventListener('click', () => {
  audio.unlock();
  continueGame();
});
document.getElementById('btnResume')?.addEventListener('click', () => setScreen('play'));
document.getElementById('btnBusted')?.addEventListener('click', () => setScreen('play'));
document.getElementById('btnWasted')?.addEventListener('click', () => setScreen('play'));
document.getElementById('btnTitle')?.addEventListener('click', () => setScreen('title'));
if (!save.has()) {
  const btn = document.getElementById('btnContinue');
  if (btn) btn.style.display = 'none';
}

// -- camera --------------------------------------------------------------------
const cam = { yaw: 0, pitch: 0.25, lookYaw: 0 };
const shootDir = new THREE.Vector3(0, 0, 1);
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();

function angleLerp(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}

function updateCamera(dt) {
  const look = input.takeLook();
  if (screen === 'title') {
    const a = simTime * 0.045;
    camPos.set(Math.sin(a) * 190, 62, Math.cos(a) * 190 + 30);
    camTarget.set(0, 8, 40);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    return;
  }
  if (player.inCar) {
    cam.lookYaw += look.dx * 0.003;
    cam.lookYaw = Math.max(-1.1, Math.min(1.1, cam.lookYaw));
    cam.lookYaw -= cam.lookYaw * Math.min(1, dt * 1.1); // drift back behind the car
    const wantYaw = player.car.heading + cam.lookYaw;
    cam.yaw = angleLerp(cam.yaw, wantYaw, dt * 5);
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    camTarget.set(player.car.x + fx * 5, 1.4, player.car.z + fz * 5);
    camPos.set(player.car.x - fx * 9, 3.4, player.car.z - fz * 9);
  } else {
    cam.yaw -= look.dx * 0.003;
    cam.pitch = Math.max(-0.15, Math.min(0.7, cam.pitch + look.dy * 0.002));
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    camTarget.set(player.x + fx * 2, 1.6, player.z + fz * 2);
    const dist = 6.5;
    const height = 2.4 + cam.pitch * 3.4;
    camPos.set(player.x - fx * dist, height, player.z - fz * dist);
  }
  const shake = effects.shakeOffset();
  camera.position.set(camPos.x + shake.x, camPos.y + shake.y, camPos.z);
  camera.lookAt(camTarget);
  camera.getWorldDirection(shootDir);
}

// -- enter / exit car ------------------------------------------------------------
function tryEnterCar() {
  const car = vehicles.nearestCar(player.x, player.z, 4, ['parked', 'traffic']);
  if (!car) return;
  if (car.kind === 'traffic') {
    wanted.onStealCar();
    hud.toast('Car stolen! The PD noticed.');
    audio.alarm();
  }
  car.prevKind = car.kind;
  car.kind = 'player';
  player.enterCar(car);
  audio.setEngine(0, true);
}

function exitCar() {
  const car = player.car;
  if (!car) return;
  car.kind = car.prevKind || 'parked';
  if (car.kind === 'traffic') vehicles.retarget(car);
  car.speed = 0;
  player.exitCar();
  audio.setEngine(0, false);
}

// -- main loop -------------------------------------------------------------------
const clock = new THREE.Clock();
let hudSnapshot = null;

function hudState() {
  return {
    health: player.health,
    cash: player.cash,
    ammo: player.ammo,
    weapon: player.weapon,
    stars: wanted.stars,
    speed: player.inCar ? Math.abs(player.car.speed) : 0,
    inCar: player.inCar,
    objective: missions.objectiveText(),
    arrest: arrestProgress,
    grab: missions.grabProgress,
    screen,
    px: player.x,
    pz: player.z,
    heading: player.inCar ? player.car.heading : player.heading,
    cars: vehicles.cars.map((c) => ({ x: c.x, z: c.z, kind: c.kind })),
    police: wanted.police.map((p) => ({ x: p.car.x, z: p.car.z })),
    enemies: combat.enemies.filter((e) => !e.dead).map((e) => ({ x: e.x, z: e.z })),
    marker: missions.marker(),
  };
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  simTime += dt;

  if (screen === 'play') {
    const actions = input.takeActions();
    if (actions & ACT.PAUSE) {
      setScreen('paused');
    } else if (player.inCar) {
      if (actions & ACT.ENTER) {
        // E exits the car: the car is null after exitCar(), so nothing
        // below may touch player.car this frame.
        exitCar();
      } else {
        const { crashed } = vehicles.drivePlayer(player.car, dt, input, colliders, actions);
        if (crashed) {
          effects.crash(player.car.x, 1, player.car.z);
          audio.thud();
        }
        player.x = player.car.x;
        player.z = player.car.z;
        player.heading = player.car.heading;
        audio.setEngine(Math.abs(player.car.speed) / SPEED.carMax, true);
      }
    } else {
      if (actions & ACT.ENTER) tryEnterCar();
      player.updateFoot(dt, actions, input, cam.yaw, {
        colliders,
        combat,
        audio,
        effects,
        shootDir,
      });
      audio.setEngine(0, false);
    }
    const w = wanted.update(dt, player, { onBusted: busted, audio });
    arrestProgress = w.arrestProgress;
    missions.update(dt, simTime);
    combat.update(dt);
    peds.update(dt);
    vehicles.update(dt, simTime, player.car);
    effects.update(dt);
    city.update(dt, simTime);
    audio.setSiren(wanted.stars > 0);
    hudSnapshot = hudState();
    hud.update(dt, hudSnapshot);
  } else if (screen === 'title') {
    vehicles.update(dt, simTime, null);
    peds.update(dt);
    effects.update(dt);
    city.update(dt, simTime);
    audio.setSiren(false);
  } else {
    // paused / busted / wasted: frozen frame, HUD stays as it was
    if (hudSnapshot) hud.update(dt, hudSnapshot);
  }

  updateCamera(dt);
  renderer.render(scene, camera);
  if (simTime >= shotReadyAt) {
    window.__solmarShotReady = true;
    shotReadyAt = Infinity;
  }
}

// -- debug API for the playtest and the screenshot presets -------------------------
const G = {
  player,
  vehicles,
  wanted,
  missions,
  combat,
  input,
  camera: cam,
  newGame,
  setScreen,
  get simTime() {
    return simTime;
  },
};
window.__solmar = {
  ACT,
  get screen() {
    return screen;
  },
  get missionIndex() {
    return missions.missionIndex;
  },
  get missionStage() {
    return missions.missionStage;
  },
  get cash() {
    return player.cash;
  },
  get stars() {
    return wanted.stars;
  },
  get health() {
    return player.health;
  },
  get ammo() {
    return player.ammo;
  },
  get px() {
    return player.x;
  },
  get pz() {
    return player.z;
  },
  get simTime() {
    return simTime;
  },
  get speed() {
    return player.inCar ? Math.abs(player.car.speed) : 0;
  },
  get inCar() {
    return player.inCar;
  },
  get police() {
    return wanted.policeCount();
  },
  get traffic() {
    return vehicles.list('traffic').length;
  },
  get peds() {
    return peds.aliveCount();
  },
  get weapon() {
    return player.weapon;
  },
  teleport(x, z, heading) {
    if (player.inCar) {
      player.car.x = x;
      player.car.z = z;
      player.x = x;
      player.z = z;
      if (heading !== undefined) {
        player.car.heading = heading;
        player.heading = heading;
      }
    } else {
      player.place(x, z, heading !== undefined ? heading : player.heading);
    }
  },
  teleportCar(x, z) {
    if (!player.inCar) return;
    player.car.x = x;
    player.car.z = z;
    player.car.speed = 0;
    player.x = x;
    player.z = z;
  },
  parked() {
    return vehicles.list('parked').map((c) => ({ x: c.x, z: c.z }));
  },
  trafficList() {
    return vehicles.list('traffic').map((c) => ({ x: c.x, z: c.z }));
  },
  policeList() {
    return wanted.police.map((p) => ({ x: p.car.x, z: p.car.z }));
  },
  enemies() {
    return combat.enemies.map((e) => ({ x: e.x, z: e.z, dead: e.dead }));
  },
  marker() {
    return missions.marker();
  },
  setMission(i) {
    missions._setIndex(i);
  },
  inject(action) {
    input.inject(action);
  },
  setHeld(name, value) {
    input.setHeld(name, value);
  },
  addLook(dx, dy) {
    input.addLook(dx, dy);
  },
};

// -- start -------------------------------------------------------------------------
setScreen('title');
if (SHOT) {
  shotReadyAt = simTime + applyShot(SHOT, G);
}
frame();
