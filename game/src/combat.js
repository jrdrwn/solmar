// Solmar: combat. The player's fists and pistol, gang members who fight
// back, and the player's health. Shooting is a cone test from the camera:
// the nearest gang member, pedestrian or car inside a narrow cone takes the
// hit. Every shot in the city is heard — it adds wanted heat.
import * as THREE from 'three';
import { clamp } from './rng.js';

const GANG_SHIRTS = [0x8a1f1f, 0x5a1f6e, 0x1f3a5f];

function createGangMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.8, 0.34),
    new THREE.MeshLambertMaterial({ color: GANG_SHIRTS[Math.floor(Math.random() * GANG_SHIRTS.length)] }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xc68642 }),
  );
  head.position.y = 1.62;
  group.add(head);
  // red bandana
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.1, 0.46),
    new THREE.MeshLambertMaterial({ color: 0xd21f1f }),
  );
  band.position.y = 1.72;
  group.add(band);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), legMat);
  legL.position.set(-0.14, 0.35, 0);
  const legR = legL.clone();
  legR.position.set(0.14, 0.35, 0);
  group.add(legL, legR);
  return { group, legL, legR };
}

export function createCombat(scene, peds, audio, fx) {
  const gang = [];
  let health = 100;
  let ammo = 12;
  let reloading = 0;
  let punchCd = 0;
  let shootCd = 0;
  let lastDamageAt = -999;
  let time = 0;
  let onEvent = () => {};

  function spawnGang(x, z, count) {
    for (let i = 0; i < count; i += 1) {
      const gx = x + (Math.random() - 0.5) * 14;
      const gz = z + (Math.random() - 0.5) * 14;
      const { group, legL, legR } = createGangMesh();
      group.position.set(gx, 0, gz);
      scene.add(group);
      gang.push({
        mesh: group, legL, legR,
        x: gx, z: gz, heading: 0, hp: 100, speed: 3.4,
        attackCd: 0, down: false, phase: Math.random() * 6,
      });
    }
  }

  function coneHit(origin, dir, targets, maxDist, radius) {
    let best = null;
    let bestT = maxDist;
    for (const t of targets) {
      if (t.down) continue;
      const dx = t.x - origin.x;
      const dz = t.z - origin.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0.5 || along > bestT) continue;
      const perp = Math.abs(-dx * dir.z + dz * dir.x);
      if (perp < radius + along * 0.03) { best = t; bestT = along; }
    }
    return best ? { target: best, dist: bestT } : null;
  }

  function shoot(origin, dir, vehicles) {
    if (shootCd > 0 || reloading > 0) return 'busy';
    if (ammo <= 0) {
      audio.denied();
      return 'empty';
    }
    ammo -= 1;
    shootCd = 0.22;
    audio.shoot();
    fx.burst(origin.x + dir.x * 1.2, 1.5, origin.z + dir.z * 1.2, 0xffd75e, 6, 2);
    const gangHit = coneHit(origin, dir, gang, 70, 0.9);
    if (gangHit) {
      gangHit.target.hp -= 34;
      fx.burst(gangHit.target.x, 1.4, gangHit.target.z, 0xff4040, 10, 3);
      if (gangHit.target.hp <= 0) {
        gangHit.target.down = true;
        gangHit.target.mesh.rotation.x = -Math.PI / 2;
        gangHit.target.mesh.position.y = 0.3;
        onEvent('gangDown', { x: gangHit.target.x, z: gangHit.target.z });
      }
      return 'gang';
    }
    const ped = peds.hitByShot(origin, dir, 70);
    if (ped) {
      onEvent('pedShot', { x: ped.x, z: ped.z });
      return 'ped';
    }
    // cars: a shot that clips a car sparks off it
    const cars = [...vehicles.traffic, ...vehicles.police, ...vehicles.parked];
    if (vehicles.playerCar) cars.push(vehicles.playerCar);
    const carHit = coneHit(origin, dir, cars, 70, 1.6);
    if (carHit) {
      fx.burst(carHit.target.x, 1, carHit.target.z, 0xffc040, 8, 3);
      onEvent('carShot', { police: carHit.target.isPolice });
      return 'car';
    }
    return 'miss';
  }

  function punch(playerX, playerZ, heading) {
    if (punchCd > 0) return null;
    punchCd = 0.4;
    audio.punch();
    const dirX = Math.sin(heading);
    const dirZ = Math.cos(heading);
    let hit = null;
    for (const g of gang) {
      if (g.down) continue;
      const dx = g.x - playerX;
      const dz = g.z - playerZ;
      const d = Math.hypot(dx, dz);
      if (d < 2.3 && (dx * dirX + dz * dirZ) / (d || 1) > 0.3) {
        g.hp -= 25;
        fx.burst(g.x, 1.4, g.z, 0xffd75e, 8, 3);
        if (g.hp <= 0) {
          g.down = true;
          g.mesh.rotation.x = -Math.PI / 2;
          g.mesh.position.y = 0.3;
          onEvent('gangDown', { x: g.x, z: g.z });
        }
        hit = g;
        break;
      }
    }
    if (!hit) {
      const ped = peds.hitByShot({ x: playerX, z: playerZ }, { x: dirX, z: dirZ }, 2.3);
      if (ped) {
        onEvent('pedPunched', { x: ped.x, z: ped.z });
        return 'ped';
      }
    }
    return hit ? 'gang' : 'miss';
  }

  function damagePlayer(amount) {
    health = Math.max(0, health - amount);
    lastDamageAt = time;
    if (health <= 0) onEvent('wasted', {});
  }

  function update(dt, playerX, playerZ, playerInCar) {
    time += dt;
    shootCd = Math.max(0, shootCd - dt);
    punchCd = Math.max(0, punchCd - dt);
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) ammo = 12;
    }
    if (time - lastDamageAt > 5 && health > 0 && health < 100) {
      health = Math.min(100, health + 6 * dt);
    }
    for (const g of gang) {
      if (g.down) continue;
      const dx = playerX - g.x;
      const dz = playerZ - g.z;
      const d = Math.hypot(dx, dz) || 1;
      g.heading = Math.atan2(dx, dz);
      g.attackCd -= dt;
      if (d > 1.9) {
        g.x += (dx / d) * g.speed * dt;
        g.z += (dz / d) * g.speed * dt;
        g.phase += dt * 8;
        g.legL.rotation.x = Math.sin(g.phase) * 0.5;
        g.legR.rotation.x = -Math.sin(g.phase) * 0.5;
      } else if (g.attackCd <= 0 && !playerInCar) {
        g.attackCd = 0.9;
        damagePlayer(10);
        audio.punch();
        fx.burst(playerX, 1.4, playerZ, 0xff4040, 6, 2);
      }
      g.mesh.position.set(g.x, 0, g.z);
      g.mesh.rotation.y = g.heading;
    }
  }

  return {
    gang,
    get health() { return health; },
    get ammo() { return ammo; },
    get reloading() { return reloading > 0; },
    set onEvent(fn) { onEvent = fn; },
    spawnGang,
    shoot,
    punch,
    damagePlayer,
    reload() {
      if (ammo < 12 && reloading <= 0) {
        reloading = 1.2;
        audio.reload();
      }
    },
    heal(amount) { health = clamp(health + amount, 0, 100); },
    setHealth(value) { health = clamp(value, 0, 100); },
    clearGang() {
      while (gang.length) scene.remove(gang.pop().mesh);
    },
    update,
  };
}
