// Solmar: pedestrians. Low-poly walkers who stroll the sidewalks, cross at
// intersections, flee from gunfire and crashes, and get knocked down when a
// car hits them. They are the city's life — and its witnesses.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { range, pick, clamp } from './rng.js';
import { collideCircle } from './collide.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xecf0f1, 0xe67e22, 0x1abc9c];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

function createPedMesh(shirt, skin) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.75, 0.32),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), legMat);
  legL.position.set(-0.14, 0.35, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), legMat);
  legR.position.set(0.14, 0.35, 0);
  group.add(legL, legR);
  return { group, legL, legR };
}

export function createPeds(scene, city, rng) {
  const peds = [];
  const colliders = city.colliders;
  let onEvent = () => {};

  function sidewalkSpot() {
    const street = pick(rng, city.streets);
    const along = range(rng, -WORLD.half + 10, WORLD.half - 10);
    const side = rng() < 0.5 ? -8.6 : 8.6;
    if (rng() < 0.5) return { x: along, z: street + side, heading: rng() < 0.5 ? 0 : Math.PI };
    return { x: street + side, z: along, heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }

  function spawn(count) {
    for (let i = 0; i < count; i += 1) {
      const spot = sidewalkSpot();
      const { group, legL, legR } = createPedMesh(pick(rng, SHIRTS), pick(rng, SKINS));
      group.position.set(spot.x, 0, spot.z);
      group.rotation.y = spot.heading;
      scene.add(group);
      peds.push({
        mesh: group, legL, legR,
        x: spot.x, z: spot.z, heading: spot.heading,
        speed: range(rng, 1.0, 1.7), state: 'walk', stateT: 0,
        hp: 100, walkPhase: rng() * 6, down: false,
      });
    }
  }

  function fleeFrom(x, z, radius) {
    for (const p of peds) {
      if (p.down) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.state = 'flee';
        p.stateT = range(rng, 2, 4);
        p.heading = Math.atan2(p.x - x, p.z - z);
      }
    }
  }

  // A car hit a pedestrian. Returns 'hit' | 'killed' | null.
  function hitByCar(carX, carZ, speed) {
    for (const p of peds) {
      if (p.down) continue;
      const d = Math.hypot(p.x - carX, p.z - carZ);
      if (d < 1.8) {
        p.down = true;
        p.state = 'down';
        p.stateT = speed > 20 ? 9999 : range(rng, 4, 7);
        p.mesh.rotation.x = -Math.PI / 2;
        p.mesh.position.y = 0.3;
        return speed > 20 ? 'killed' : 'hit';
      }
    }
    return null;
  }

  // A bullet hit a pedestrian. Returns the ped or null.
  function hitByShot(origin, dir, maxDist) {
    let best = null;
    let bestT = maxDist;
    for (const p of peds) {
      if (p.down) continue;
      const dx = p.x - origin.x;
      const dz = p.z - origin.z;
      const t = dx * dir.x + dz * dir.z;
      if (t < 0 || t > bestT) continue;
      const perp = Math.abs(-dx * dir.z + dz * dir.x);
      if (perp < 0.9) { best = p; bestT = t; }
    }
    if (best) {
      best.down = true;
      best.state = 'down';
      best.stateT = 9999;
      best.mesh.rotation.x = -Math.PI / 2;
      best.mesh.position.y = 0.3;
    }
    return best;
  }

  function update(dt) {
    for (const p of peds) {
      if (p.state === 'down') {
        if (p.stateT < 9000) {
          p.stateT -= dt;
          if (p.stateT <= 0) {
            p.down = false;
            p.state = 'flee';
            p.stateT = 3;
            p.mesh.rotation.x = 0;
            p.mesh.position.y = 0;
          }
        }
        continue;
      }
      let speed = p.speed;
      if (p.state === 'flee') {
        speed = 4.2;
        p.stateT -= dt;
        if (p.stateT <= 0) p.state = 'walk';
      }
      const nx = p.x + Math.sin(p.heading) * speed * dt;
      const nz = p.z + Math.cos(p.heading) * speed * dt;
      const oldX = p.x;
      const oldZ = p.z;
      p.x = nx;
      p.z = nz;
      if (collideCircle(p, 0.4, colliders, WORLD.half)) {
        // bumped a building: turn around
        p.heading += Math.PI / 2 + (rng() - 0.5);
        p.x = oldX;
        p.z = oldZ;
      }
      // at an intersection, sometimes turn
      const onStreetX = city.streets.some((s) => Math.abs(p.x - s) < 1.2);
      const onStreetZ = city.streets.some((s) => Math.abs(p.z - s) < 1.2);
      if ((onStreetX || onStreetZ) && rng() < dt * 0.25) {
        p.heading += (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
      p.walkPhase += dt * speed * 3;
      const swing = Math.sin(p.walkPhase) * 0.5;
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  return {
    peds,
    set onEvent(fn) { onEvent = fn; },
    spawn,
    fleeFrom,
    hitByCar,
    hitByShot,
    update,
    reset() {
      while (peds.length) scene.remove(peds.pop().mesh);
    },
  };
}
