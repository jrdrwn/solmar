// Solmar: cars. Arcade driving physics for the player's car, traffic that
// follows the street grid, parked cars to steal, and police cruisers that
// chase the player when the wanted level rises. Cars are box-built meshes:
// body, cabin, four wheels, headlights and taillights.
import * as THREE from 'three';
import { CAR, CAR_COLORS, WORLD } from './config.js';
import { range, pick, clamp, angleLerp } from './rng.js';
import { collideCircle } from './collide.js';

const BODY_GEO = new THREE.BoxGeometry(1.9, 0.62, 4.3);
const CABIN_GEO = new THREE.BoxGeometry(1.7, 0.55, 2.1);
const WHEEL_GEO = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const LIGHT_GEO = new THREE.BoxGeometry(0.34, 0.16, 0.1);
const GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x16242f });
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x141414 });
const HEAD_MAT = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
const TAIL_MAT = new THREE.MeshBasicMaterial({ color: 0xd21f1f });

export function createCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f2f2 : color });
  const body = new THREE.Mesh(BODY_GEO, bodyMat);
  body.position.y = 0.58;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(CABIN_GEO, GLASS_MAT);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.35], [0.88, 1.35], [-0.88, -1.35], [0.88, -1.35]]) {
    const wheel = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  for (const hx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(LIGHT_GEO, HEAD_MAT);
    head.position.set(hx, 0.62, 2.16);
    group.add(head);
    const tail = new THREE.Mesh(LIGHT_GEO, TAIL_MAT);
    tail.position.set(hx, 0.62, -2.16);
    group.add(tail);
  }
  let lightRed = null;
  let lightBlue = null;
  if (isPolice) {
    lightRed = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    lightBlue = new THREE.MeshBasicMaterial({ color: 0x2060ff });
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), lightRed);
    barR.position.set(-0.45, 1.48, -0.2);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), lightBlue);
    barB.position.set(0.45, 1.48, -0.2);
    group.add(barR, barB);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.3, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x1e3a5f }),
    );
    door.position.set(0.96, 0.62, 0);
    group.add(door);
  }
  return { group, wheels, lightRed, lightBlue };
}

function makeCar(scene, x, z, heading, color, kind, isPolice) {
  const { group, wheels, lightRed, lightBlue } = createCarMesh(color, isPolice);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return {
    mesh: group, wheels, lightRed, lightBlue,
    x, z, heading, speed: 0, kind, isPolice: !!isPolice,
    node: -1, next: -1, from: -1, edgeT: 0, targetSpeed: 0,
    flash: 0, stopped: 0,
  };
}

export function createVehicles(scene, city, rng, audio, fx) {
  const traffic = [];
  const police = [];
  const parked = [];
  let playerCar = null;
  const colliders = city.colliders;
  const nodes = city.nodes;
  const neighbours = city.neighbours;
  let onEvent = () => {};

  function randomNodeNear(x, z, minDist, maxDist) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < 40; i += 1) {
      const n = Math.floor(rng() * nodes.length);
      const d = Math.hypot(nodes[n].x - x, nodes[n].z - z);
      if (d < minDist || d > maxDist) continue;
      const score = rng();
      if (score > bestScore) { bestScore = score; best = n; }
    }
    return best === -1 ? Math.floor(rng() * nodes.length) : best;
  }

  function edgePoint(car, t) {
    const a = nodes[car.node];
    const b = nodes[car.next];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const rx = -dz / len;
    const rz = dx / len;
    return { x: a.x + dx * t + rx * 2.6, z: a.z + dz * t + rz * 2.6, heading: Math.atan2(dx, dz) };
  }

  function startEdge(car, node) {
    const options = neighbours[node].filter((n) => n !== car.from);
    const next = options.length ? pick(rng, options) : pick(rng, neighbours[node]);
    car.from = node;
    car.node = node;
    car.next = next;
    car.edgeT = 0;
  }

  function spawnTraffic(count, nearX, nearZ) {
    for (let i = 0; i < count; i += 1) {
      const node = nearX === undefined ? Math.floor(rng() * nodes.length) : randomNodeNear(nearX, nearZ, 30, 200);
      const car = makeCar(scene, 0, 0, 0, pick(rng, CAR_COLORS), 'traffic', false);
      startEdge(car, node);
      const p = edgePoint(car, rng());
      car.x = p.x;
      car.z = p.z;
      car.heading = p.heading;
      car.targetSpeed = range(rng, 7, 11);
      car.speed = car.targetSpeed;
      traffic.push(car);
    }
  }

  function spawnParked(count) {
    for (let i = 0; i < count; i += 1) {
      const street = pick(rng, city.streets);
      const along = range(rng, -WORLD.half + 20, WORLD.half - 20);
      const side = rng() < 0.5 ? -1 : 1;
      const horizontal = rng() < 0.5;
      const x = horizontal ? along : street + side * 4.6;
      const z = horizontal ? street + side * 4.6 : along;
      const heading = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
      const car = makeCar(scene, x, z, heading, pick(rng, CAR_COLORS), 'parked', false);
      parked.push(car);
    }
  }

  // take a car out of a list (entering it, for example) — the mesh stays in
  // the scene, because the car is still right there on the street
  function removeCar(list, car) {
    const i = list.indexOf(car);
    if (i !== -1) list.splice(i, 1);
  }

  function nearestEnterable(x, z, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of traffic) {
      const d = (car.x - x) ** 2 + (car.z - z) ** 2;
      if (d < bestD) { bestD = d; best = car; }
    }
    for (const car of parked) {
      const d = (car.x - x) ** 2 + (car.z - z) ** 2;
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enter(car) {
    removeCar(traffic, car);
    removeCar(parked, car);
    car.kind = 'player';
    car.speed = 0;
    playerCar = car;
    audio.carDoor();
    return car;
  }

  function exit() {
    if (!playerCar) return null;
    const car = playerCar;
    playerCar = null;
    car.kind = 'parked';
    car.speed = 0;
    parked.push(car);
    audio.carDoor();
    return car;
  }

  function carAhead(car, list, dist) {
    const fxv = Math.sin(car.heading);
    const fzv = Math.cos(car.heading);
    for (const other of list) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d > dist || d < 0.01) continue;
      const along = (dx * fxv + dz * fzv) / d;
      if (along > 0.7) return true;
    }
    return false;
  }

  function updateTraffic(dt) {
    const all = [...traffic, ...police];
    for (const car of traffic) {
      const a = nodes[car.node];
      const b = nodes[car.next];
      const edgeLen = Math.hypot(b.x - a.x, b.z - a.z);
      const blocked = carAhead(car, all, 8) || (playerCar && carAhead(car, [playerCar], 8));
      const want = blocked ? 0 : car.targetSpeed;
      car.speed += clamp(want - car.speed, -10 * dt, 6 * dt);
      car.edgeT += (car.speed * dt) / edgeLen;
      if (car.edgeT >= 1) {
        startEdge(car, car.next);
      }
      const p = edgePoint(car, Math.min(1, car.edgeT));
      car.x = p.x;
      car.z = p.z;
      car.heading = p.heading;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.36;
      for (const w of car.wheels) w.rotation.x += spin;
    }
  }

  // index of the street node closest to a point
  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = (nodes[i].x - x) * (nodes[i].x - x) + (nodes[i].z - z) * (nodes[i].z - z);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // At an intersection, the neighbour that gets the car closest to the player.
  function pickPursuitNext(car, px, pz) {
    let best = -1;
    let bestD = Infinity;
    for (const n of neighbours[car.node]) {
      if (n === car.from) continue;
      const d = (nodes[n].x - px) * (nodes[n].x - px) + (nodes[n].z - pz) * (nodes[n].z - pz);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best === -1) best = neighbours[car.node][0];
    car.from = car.node;
    car.next = best;
    car.edgeT = 0;
  }

  function updatePolice(dt, px, pz, playerInCar, wanted) {
    // spawn to match the wanted level
    while (police.length < wanted && police.length < 5) {
      const node = randomNodeNear(px, pz, 50, 120);
      const car = makeCar(scene, nodes[node].x, nodes[node].z, 0, 0xffffff, 'police', true);
      car.targetSpeed = 31;
      police.push(car);
    }
    while (police.length > wanted) {
      const car = police.pop();
      scene.remove(car.mesh);
    }
    for (const car of police) {
      const dx = px - car.x;
      const dz = pz - car.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > 25) {
        // far away: chase along the street grid, which is how a cruiser
        // actually reaches a suspect — a straight line runs into buildings
        if (car.node === -1) {
          car.node = nearestNode(car.x, car.z);
          car.from = -1;
          pickPursuitNext(car, px, pz);
        }
        const a = nodes[car.node];
        const b = nodes[car.next];
        const edgeLen = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        car.speed += clamp(31 - car.speed, -14 * dt, 10 * dt);
        car.edgeT += (car.speed * dt) / edgeLen;
        if (car.edgeT >= 1) {
          car.node = car.next;
          pickPursuitNext(car, px, pz);
        }
        const p = edgePoint(car, Math.min(1, car.edgeT));
        car.x = p.x;
        car.z = p.z;
        car.heading = p.heading;
      } else {
        // close: steer straight at the player and ease onto them — a
        // proportional approach speed, so the cruiser parks on the suspect
        // instead of screaming past and turning around forever
        car.node = -1;
        const wantHeading = Math.atan2(dx, dz);
        car.heading = angleLerp(car.heading, wantHeading, clamp(3.5 * dt, 0, 1));
        const wantSpeed = clamp(dist * 0.8, 0, 12);
        car.speed += clamp(wantSpeed - car.speed, -20 * dt, 8 * dt);
        const oldX = car.x;
        const oldZ = car.z;
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        if (collideCircle(car, 1.7, colliders, WORLD.half)) {
          car.x = oldX;
          car.z = oldZ;
          car.speed *= 0.4;
          car.heading += 0.9 * dt * (rng() < 0.5 ? 1 : -1);
        }
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.36;
      for (const w of car.wheels) w.rotation.x += spin;
      // light bar flash — lightRed/lightBlue ARE the bar materials
      car.flash += dt;
      const phase = Math.floor(car.flash * 6) % 2 === 0;
      car.lightRed.color.setHex(phase ? 0xff2020 : 0x550000);
      car.lightBlue.color.setHex(phase ? 0x000088 : 0x2060ff);
      // ram the player's car: grind its speed down
      if (playerInCar && playerCar && dist < 3.4) {
        playerCar.speed *= 1 - 1.4 * dt;
        if (car.speed > 12) onEvent('ram', { speed: car.speed });
      }
    }
  }

  function updatePlayerCar(dt, input, camYaw) {
    if (!playerCar) return;
    const car = playerCar;
    const fwd = input.held.forward ? 1 : 0;
    const back = input.held.back ? 1 : 0;
    const steer = (input.held.left ? 1 : 0) - (input.held.right ? 1 : 0);
    if (fwd) car.speed += CAR.accel * dt;
    if (back) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    }
    if (!fwd && !back) car.speed -= car.speed * CAR.drag * dt;
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    const turnSign = car.speed >= 0 ? 1 : -1;
    const turnAuthority = clamp(Math.abs(car.speed) / 9, 0, 1);
    car.heading += steer * CAR.turnRate * turnAuthority * turnSign * dt;
    const oldX = car.x;
    const oldZ = car.z;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    if (collideCircle(car, 1.7, colliders, WORLD.half)) {
      if (Math.abs(car.speed) > 9) {
        onEvent('crash', { speed: Math.abs(car.speed) });
        fx.burst(car.x, 1, car.z, 0xffc040, 14);
      }
      car.x = oldX;
      car.z = oldZ;
      car.speed *= 0.45;
    }
    // car-car bumps
    for (const other of [...traffic, ...police, ...parked]) {
      if (other === car) continue;
      const dx = car.x - other.x;
      const dz = car.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        car.x += (dx / d) * push;
        car.z += (dz / d) * push;
        if (Math.abs(car.speed) > 6) {
          onEvent('crash', { speed: Math.abs(car.speed) });
          fx.burst(car.x, 1, car.z, 0xffc040, 10);
        }
        car.speed *= 0.7;
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const spin = (car.speed * dt) / 0.36;
    for (let i = 0; i < car.wheels.length; i += 1) {
      car.wheels[i].rotation.x += spin;
      if (i < 2) car.wheels[i].rotation.y = steer * 0.35;
    }
    audio.engineSet(Math.abs(car.speed) / CAR.maxSpeed, true);
  }

  return {
    traffic,
    police,
    parked,
    get playerCar() { return playerCar; },
    set onEvent(fn) { onEvent = fn; },
    spawnTraffic,
    spawnParked,
    nearestEnterable,
    enter,
    exit,
    update(dt, world) {
      updateTraffic(dt);
      updatePolice(dt, world.playerX, world.playerZ, world.playerInCar, world.wanted);
      updatePlayerCar(dt, world.input, world.camYaw);
      if (!playerCar) audio.engineSet(0, false);
    },
    reset() {
      for (const list of [traffic, police, parked]) {
        while (list.length) scene.remove(list.pop().mesh);
      }
      if (playerCar) scene.remove(playerCar.mesh);
      playerCar = null;
    },
  };
}
