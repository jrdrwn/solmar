// Solmar — combat: bullets, punches and the rival gangsters the missions
// send at Vic. Bullets are short-lived tracers; hits are plain distance
// checks against peds, enemies, the player and building boxes.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { pointInBoxes } from './collide.js';

const BULLET_SPEED = 70;
const BULLET_LIFE = 1.2;

export function createCombat(scene, ctx) {
  const bullets = [];
  const enemies = [];
  const tracerGeo = new THREE.BoxGeometry(0.07, 0.07, 0.7);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });

  function spawnBullet(x, y, z, dir, damage, owner) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.position.set(x, y, z);
    mesh.lookAt(x + dir.x, y + dir.y, z + dir.z);
    scene.add(mesh);
    bullets.push({ mesh, x, y, z, dx: dir.x, dy: dir.y, dz: dir.z, damage, owner, life: BULLET_LIFE });
  }

  function shootFromPlayer(player, dir) {
    const ox = player.x + Math.sin(player.heading) * 0.6;
    const oz = player.z + Math.cos(player.heading) * 0.6;
    spawnBullet(ox, 1.45, oz, dir, PLAYER.pistolDamage, 'player');
    ctx.peds.scare(player.x, player.z, 40);
    ctx.wanted.onShotFired();
  }

  function shootFromEnemy(enemy) {
    const p = ctx.player;
    const dx = p.x - enemy.x;
    const dz = p.z - enemy.z;
    const dist = Math.hypot(dx, dz) || 1;
    // enemies are bad shots at range
    const spread = Math.min(0.25, 4 / dist);
    const dir = {
      x: dx / dist + (Math.random() - 0.5) * spread,
      y: (1.35 - 1.4) / dist,
      z: dz / dist + (Math.random() - 0.5) * spread,
    };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    dir.x /= len;
    dir.y /= len;
    dir.z /= len;
    spawnBullet(enemy.x, 1.4, enemy.z, dir, 12, 'enemy');
    ctx.audio?.enemyShot();
  }

  function punch(player) {
    const range = PLAYER.punchRange;
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    // peds first
    const ped = ctx.peds.nearest(player.x, player.z, range);
    if (ped) {
      const dx = ped.x - player.x;
      const dz = ped.z - player.z;
      const d = Math.hypot(dx, dz) || 1;
      if ((dx * fx + dz * fz) / d > 0.4) {
        ctx.peds.kill(ped);
        ctx.effects?.puff(ped.x, 1, ped.z);
        ctx.wanted.onKillPed();
        return;
      }
    }
    // then enemies
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - player.x;
      const dz = e.z - player.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < range && (dx * fx + dz * fz) / d > 0.4) {
        hurtEnemy(e, PLAYER.punchDamage);
        return;
      }
    }
  }

  function makeEnemyMesh() {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: 0xc22a3a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x1a1a22 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a06a });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.82, 0.28), pants);
    legs.position.y = 0.41;
    group.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.64, 0.34), shirt);
    torso.position.y = 1.14;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
    head.position.y = 1.66;
    group.add(head);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x181818 }),
    );
    gun.position.set(0.36, 1.0, 0.2);
    group.add(gun);
    return group;
  }

  function spawnEnemy(x, z, health = 60) {
    const mesh = makeEnemyMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const enemy = { mesh, x, z, health, dead: false, shootTimer: 1 + Math.random(), speed: 3.4 };
    enemies.push(enemy);
    return enemy;
  }

  function hurtEnemy(enemy, damage) {
    if (enemy.dead) return;
    enemy.health -= damage;
    ctx.effects?.puff(enemy.x, 1.2, enemy.z);
    if (enemy.health <= 0) {
      enemy.dead = true;
      enemy.mesh.rotation.x = -Math.PI / 2;
      enemy.mesh.position.y = 0.25;
      ctx.onEnemyKilled?.(enemy);
    }
  }

  function clearEnemies() {
    for (const e of enemies) scene.remove(e.mesh);
    enemies.length = 0;
  }

  function update(dt) {
    // bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt;
      b.x += b.dx * BULLET_SPEED * dt;
      b.y += b.dy * BULLET_SPEED * dt;
      b.z += b.dz * BULLET_SPEED * dt;
      b.mesh.position.set(b.x, b.y, b.z);
      let dead = b.life <= 0 || b.y < 0;
      if (!dead && pointInBoxes(b.x, b.z, ctx.colliders)) {
        ctx.effects?.spark(b.x, b.y, b.z);
        dead = true;
      }
      if (!dead && b.owner === 'player') {
        const ped = ctx.peds.nearest(b.x, b.z, 1.1);
        if (ped) {
          ctx.peds.kill(ped);
          ctx.effects?.puff(ped.x, 1, ped.z);
          ctx.wanted.onKillPed();
          dead = true;
        }
        if (!dead) {
          for (const e of enemies) {
            if (e.dead) continue;
            if (Math.hypot(e.x - b.x, e.z - b.z) < 1.1 && b.y > 0.3 && b.y < 2) {
              hurtEnemy(e, b.damage);
              dead = true;
              break;
            }
          }
        }
      }
      if (!dead && b.owner === 'enemy') {
        const p = ctx.player;
        if (!p.inCar && Math.hypot(p.x - b.x, p.z - b.z) < 0.9 && b.y > 0.3 && b.y < 2) {
          const died = p.damage(b.damage);
          ctx.effects?.puff(p.x, 1.2, p.z);
          ctx.hud?.flashDamage();
          if (died) ctx.onPlayerDown?.();
          dead = true;
        }
      }
      if (dead) {
        scene.remove(b.mesh);
        bullets.splice(i, 1);
      }
    }
    // enemy AI: close in and shoot
    const p = ctx.player;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 6 && dist < 60) {
        const nx = e.x + (dx / dist) * e.speed * dt;
        const nz = e.z + (dz / dist) * e.speed * dt;
        const probe = { x: nx, z: nz };
        if (!pointInBoxes(nx, nz, ctx.colliders)) {
          e.x = nx;
          e.z = nz;
        }
        e.mesh.rotation.y = Math.atan2(dx, dz);
      }
      e.shootTimer -= dt;
      if (dist < 45 && e.shootTimer <= 0) {
        e.shootTimer = 1.3 + Math.random() * 0.9;
        shootFromEnemy(e);
      }
      e.mesh.position.set(e.x, 0, e.z);
    }
  }

  return {
    bullets,
    enemies,
    shootFromPlayer,
    shootFromEnemy,
    punch,
    spawnEnemy,
    clearEnemies,
    update,
  };
}
