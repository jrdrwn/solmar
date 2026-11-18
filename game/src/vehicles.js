// Solmar — cars: meshes, traffic AI, parked cars, police cars and the
// player's arcade driving. Every car is a circle on the street graph;
// nothing here drives through a building.

import * as THREE from 'three';
import { SPEED, CAR, PALETTE, HALF_STREET, STREETS } from './config.js';
import { resolveCircle, nearestNode, nodePos, route, randomStreetPoint } from './collide.js';

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function makeCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyColor = kind === 'police' ? PALETTE.policeWhite : color;
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.width, 0.7, CAR.length), lambert(bodyColor));
  body.position.y = 0.55;
  group.add(body);
  const cabinColor = kind === 'police' ? PALETTE.policeBlack : 0x223038;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), lambert(cabinColor));
  cabin.position.set(0, 1.15, -0.2);
  group.add(cabin);
  // headlights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.08), lightMat);
    hl.position.set(sx, 0.55, CAR.length / 2 + 0.01);
    group.add(hl);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = lambert(0x181818);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    group.add(w);
    wheels.push(w);
  }
  // taxi sign
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), lambert(0x202020));
    sign.position.set(0, 1.55, -0.2);
    group.add(sign);
  }
  // police light bar: two meshes with their OWN materials, toggled by
  // setting each mesh's material colour. (Never call .material on a
  // material: the bar's meshes are what we hold.)
  let lights = null;
  if (kind === 'police') {
    const a = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    );
    a.position.set(-0.45, 1.52, -0.2);
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.34),
      new THREE.MeshBasicMaterial({ color: 0x2040ff }),
    );
    b.position.set(0.45, 1.52, -0.2);
    group.add(a);
    group.add(b);
    lights = { a, b };
  }
  return { group, wheels, lights };
}

export function createVehicles(scene, rng, colliders) {
  const cars = [];
  let nextId = 1;

  function addCar(kind, x, z, heading, color) {
    const paint = color ?? rng.pick(PALETTE.carPaint);
    const { group, wheels, lights } = makeCarMesh(paint, kind);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    scene.add(group);
    const car = {
      id: nextId++,
      kind,
      mesh: group,
      wheels,
      lights,
      x,
      z,
      heading,
      speed: 0,
      steer: 0,
      route: [],
      routeIndex: 0,
      waitAtNode: 0,
      colour: paint,
      crashed: 0,
    };
    cars.push(car);
    return car;
  }

  function spawnTraffic(count) {
    for (let i = 0; i < count; i++) {
      const p = randomStreetPoint(rng);
      // A street point sits on one centreline: vertical (x fixed, drive
      // along z) or horizontal (z fixed, drive along x).
      const onVertical = STREETS.some((s) => Math.abs(p.x - s) < 0.5);
      const heading = onVertical
        ? rng.chance(0.5)
          ? 0
          : Math.PI
        : rng.chance(0.5)
          ? Math.PI / 2
          : -Math.PI / 2;
      const car = addCar('traffic', p.x, p.z, heading, rng.pick(PALETTE.carPaint));
      car.speed = SPEED.traffic;
      retarget(car);
    }
  }

  function spawnParked(count) {
    const spots = [];
    for (let i = 0; i < count; i++) {
      const vertical = rng.chance(0.5);
      const street = rng.pick([-196, -140, -84, -28, 28, 84, 140, 196]);
      const along = rng.range(-196, 196);
      const side = rng.chance(0.5) ? 1 : -1;
      const x = vertical ? street + side * (HALF_STREET + 1.0) : along;
      const z = vertical ? along : street + side * (HALF_STREET + 1.0);
      // Parked parallel to its street: a car on a vertical street (x
      // fixed) faces along z; on a horizontal street it faces along x.
      // Facing across the street would drive it straight into a block.
      const heading = vertical
        ? rng.chance(0.5)
          ? 0
          : Math.PI
        : rng.chance(0.5)
          ? Math.PI / 2
          : -Math.PI / 2;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 10)) continue;
      spots.push({ x, z });
      addCar('parked', x, z, heading, rng.pick(PALETTE.carPaint));
    }
  }

  function spawnPolice(x, z) {
    const car = addCar('police', x, z, 0, PALETTE.policeWhite);
    car.speed = 0;
    return car;
  }

  function spawnTaxi(x, z, heading) {
    const car = addCar('taxi', x, z, heading, PALETTE.taxiYellow);
    car.speed = 0;
    return car;
  }

  function retarget(car) {
    const dest = Math.floor(rng.range(0, 64));
    car.route = route(nearestNode(car.x, car.z), dest);
    car.routeIndex = 0;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  // Drive one AI car one step along its route. The route is node-to-node
  // on the street graph, so the car is always on a street.
  function driveAi(car, dt) {
    if (car.routeIndex >= car.route.length) {
      retarget(car);
      return;
    }
    const target = nodePos(car.route[car.routeIndex]);
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3) {
      car.routeIndex++;
      return;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    car.heading += turn;
    car.speed = SPEED.traffic;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
  }

  function update(dt, t, playerCar) {
    for (const car of cars) {
      if (car.kind === 'traffic') driveAi(car, dt);
      // police cars are steered by wanted.js through car.driveTo()
      // wheel spin + mesh sync
      const spin = (car.speed * dt) / 0.36;
      for (const w of car.wheels) w.rotation.x += spin;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      if (car.lights) {
        const phase = Math.floor(t * 5) % 2 === 0;
        car.lights.a.material.color.setHex(phase ? 0xff2020 : 0x501010);
        car.lights.b.material.color.setHex(phase ? 0x101050 : 0x2040ff);
      }
      if (car.crashed > 0) car.crashed -= dt;
    }
    // soft car-car separation so traffic never stacks into one blob
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 4.4;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          if (a !== playerCar) {
            a.x -= nx * push;
            a.z -= nz * push;
          }
          if (b !== playerCar) {
            b.x += nx * push;
            b.z += nz * push;
          }
        }
      }
    }
  }

  // Arcade player driving. `actions` is the frame's one-shot flags, passed
  // in by the caller (main.js takes them once per frame). Returns
  // { crashed } for the HUD shake.
  function drivePlayer(car, dt, input, collidersList, actions) {
    const held = input.held;
    let crashed = false;
    if (held.forward) car.speed += SPEED.carAccel * dt;
    else if (held.back) {
      if (car.speed > 0.5) car.speed -= SPEED.carBrake * dt;
      else car.speed -= SPEED.carAccel * 0.5 * dt;
    } else {
      // drag
      car.speed -= car.speed * 0.6 * dt;
      if (Math.abs(car.speed) < 0.2) car.speed = 0;
    }
    if (actions & 32) {
      // Space = handbrake
      car.speed -= car.speed * 4 * dt;
    }
    car.speed = Math.max(-SPEED.carReverseMax, Math.min(SPEED.carMax, car.speed));
    const steerInput = (held.left ? 1 : 0) - (held.right ? 1 : 0);
    const steerAuthority = Math.min(1, Math.abs(car.speed) / 8);
    car.steer += (steerInput - car.steer) * Math.min(1, dt * 8);
    const dir = car.speed >= 0 ? 1 : -1;
    car.heading += car.steer * 1.7 * steerAuthority * dir * dt;
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const probe = { x: nx, z: nz };
    if (resolveCircle(probe, CAR.radius, collidersList)) {
      car.speed *= 0.35;
      crashed = true;
      car.crashed = 0.4;
    } else {
      car.x = nx;
      car.z = nz;
    }
    return { crashed };
  }

  function nearestCar(x, z, maxDist, kinds) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  return {
    cars,
    addCar,
    spawnTraffic,
    spawnParked,
    spawnPolice,
    spawnTaxi,
    removeCar,
    retarget,
    update,
    drivePlayer,
    nearestCar,
    list(kind) {
      return cars.filter((c) => c.kind === kind);
    },
  };
}
