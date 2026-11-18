// Solmar — particles and screen shake. One pool of small meshes, reused
// for sparks, smoke puffs and muzzle flashes, so the game never allocates
// during a firefight.

import * as THREE from 'three';

export function createEffects(scene) {
  const pool = [];
  const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  const mats = {
    spark: new THREE.MeshBasicMaterial({ color: 0xffd24a }),
    smoke: new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.55 }),
    blood: new THREE.MeshBasicMaterial({ color: 0xa02020 }),
  };
  let shake = 0;

  function burst(x, y, z, kind, n, speed) {
    for (let i = 0; i < n; i++) {
      let p = pool.find((q) => !q.active);
      if (!p) {
        if (pool.length >= 120) return;
        const mesh = new THREE.Mesh(geo, mats[kind]);
        mesh.visible = false;
        scene.add(mesh);
        p = { mesh, active: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 };
        pool.push(p);
      }
      p.active = true;
      p.mesh.visible = true;
      p.mesh.material = mats[kind];
      p.mesh.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2 + 0.5;
      p.vx = Math.cos(a) * speed;
      p.vz = Math.sin(a) * speed;
      p.vy = up;
      p.life = p.maxLife = 0.4 + Math.random() * 0.5;
      p.mesh.scale.setScalar(kind === 'smoke' ? 2 : 1);
    }
  }

  function addShake(amount) {
    shake = Math.min(1, shake + amount);
  }

  function update(dt) {
    for (const p of pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vy -= 6 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const s = p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.1, s) * (p.mesh.material === mats.smoke ? 2.4 : 1));
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 2.2);
  }

  // Camera offset for this frame's shake, in world units.
  function shakeOffset() {
    if (shake <= 0.01) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * shake * 0.5,
      y: (Math.random() - 0.5) * shake * 0.35,
    };
  }

  return {
    spark(x, y, z) {
      burst(x, y, z, 'spark', 8, 5);
      addShake(0.12);
    },
    puff(x, y, z) {
      burst(x, y, z, 'smoke', 6, 1.5);
    },
    muzzle(x, y, z, yaw) {
      burst(x + Math.sin(yaw) * 0.8, y, z + Math.cos(yaw) * 0.8, 'spark', 5, 3);
      addShake(0.08);
    },
    crash(x, y, z) {
      burst(x, y, z, 'spark', 12, 6);
      burst(x, y, z, 'smoke', 8, 2);
      addShake(0.5);
    },
    update,
    shakeOffset,
  };
}
