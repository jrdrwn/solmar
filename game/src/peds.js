// Solmar — pedestrians. They walk the sidewalks, cross at corners, flee
// when shots ring out, and fall when hit. They are the city's life, and
// the reason stealing a car in front of a crowd is a bad idea.

import * as THREE from 'three';
import { SPEED, STREETS, HALF_STREET } from './config.js';
import { randomStreetPoint } from './collide.js';

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c84a, 0xd88a4a, 0x8a4ad8, 0xe8e8e8, 0x4ad8d8];
const PANTS = [0x2a2a30, 0x3a4a6a, 0x6a5a3a, 0x4a3a2a];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

function makePedMesh(rng) {
  const group = new THREE.Group();
  const skin = rng.pick(SKINS);
  const shirt = rng.pick(SHIRTS);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.8, 0.26),
    new THREE.MeshLambertMaterial({ color: rng.pick(PANTS) }),
  );
  legs.position.y = 0.4;
  group.add(legs);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.62, 0.32),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  torso.position.y = 1.1;
  group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  group.add(head);
  // arms swing while walking (rotated in update)
  const armGeo = new THREE.BoxGeometry(0.12, 0.55, 0.12);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.34, 1.1, 0);
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.34, 1.1, 0);
  group.add(armL);
  group.add(armR);
  return { group, armL, armR };
}

export function createPeds(scene, rng, colliders) {
  const peds = [];
  let nextId = 1;

  function spawnOne(x, z) {
    const { group, armL, armR } = makePedMesh(rng);
    group.position.set(x, 0, z);
    scene.add(group);
    const ped = {
      id: nextId++,
      mesh: group,
      armL,
      armR,
      x,
      z,
      heading: rng.range(0, Math.PI * 2),
      speed: SPEED.pedWalk * rng.range(0.7, 1.3),
      target: null,
      flee: 0,
      dead: false,
      deadTimer: 0,
      walkPhase: rng.range(0, 6),
    };
    peds.push(ped);
    return ped;
  }

  function spawn(count) {
    for (let i = 0; i < count; i++) {
      const p = randomStreetPoint(rng);
      // push onto the sidewalk edge of the street
      const onVertical = STREETS.some((s) => Math.abs(p.x - s) < 0.5);
      if (onVertical) p.x += rng.chance(0.5) ? HALF_STREET + 2 : -(HALF_STREET + 2);
      else p.z += rng.chance(0.5) ? HALF_STREET + 2 : -(HALF_STREET + 2);
      spawnOne(p.x, p.z);
    }
  }

  function pickTarget(ped) {
    const p = randomStreetPoint(rng);
    ped.target = p;
  }

  // A gunshot nearby sends every ped in earshot running.
  function scare(x, z, radius) {
    for (const ped of peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.flee = 4;
        ped.heading = Math.atan2(ped.x - x, ped.z - z) + (Math.random() - 0.5);
      }
    }
  }

  function kill(ped) {
    if (ped.dead) return;
    ped.dead = true;
    ped.deadTimer = 0;
    ped.mesh.rotation.x = -Math.PI / 2; // fall flat
    ped.mesh.position.y = 0.25;
  }

  function update(dt) {
    for (const ped of peds) {
      if (ped.dead) {
        ped.deadTimer += dt;
        // fade out after a while so the street does not fill with bodies
        if (ped.deadTimer > 20) {
          ped.mesh.visible = false;
        }
        continue;
      }
      if (ped.flee > 0) ped.flee -= dt;
      if (!ped.target) pickTarget(ped);
      const dx = ped.target.x - ped.x;
      const dz = ped.target.z - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2) {
        pickTarget(ped);
      } else {
        const want = Math.atan2(dx, dz);
        let diff = want - ped.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
        const speed = ped.flee > 0 ? ped.speed * 2.6 : ped.speed;
        ped.x += Math.sin(ped.heading) * speed * dt;
        ped.z += Math.cos(ped.heading) * speed * dt;
        ped.walkPhase += dt * speed * 3;
      }
      ped.mesh.position.set(ped.x, ped.dead ? 0.25 : 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      ped.armL.rotation.x = swing;
      ped.armR.rotation.x = -swing;
    }
    void colliders;
  }

  function nearest(x, z, maxDist, aliveOnly = true) {
    let best = null;
    let bestD = maxDist;
    for (const ped of peds) {
      if (aliveOnly && ped.dead) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    return best;
  }

  return {
    peds,
    spawn,
    spawnOne,
    update,
    scare,
    kill,
    nearest,
    aliveCount() {
      return peds.filter((p) => !p.dead).length;
    },
  };
}
