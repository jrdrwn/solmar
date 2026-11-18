// Solmar: effects. A pooled particle burst system (one THREE.Points cloud,
// 400 particles) for crashes, muzzle flashes, hits and pickups, plus a
// screen-shake value the camera reads each frame.
import * as THREE from 'three';

const MAX = 400;

export function createEffects(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  for (let i = 0; i < MAX; i += 1) positions[i * 3 + 1] = -999;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;
  let shakeAmount = 0;
  let shakeTime = 0;

  const tmpColor = new THREE.Color();

  return {
    burst(x, y, z, color, count, speed) {
      tmpColor.setHex(color);
      const spread = speed || 4;
      for (let n = 0; n < count; n += 1) {
        const i = cursor;
        cursor = (cursor + 1) % MAX;
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        const a = Math.random() * Math.PI * 2;
        const up = Math.random() * 2 - 0.4;
        const s = spread * (0.4 + Math.random() * 0.8);
        vel[i * 3] = Math.cos(a) * s;
        vel[i * 3 + 1] = up * s;
        vel[i * 3 + 2] = Math.sin(a) * s;
        colors[i * 3] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
        life[i] = maxLife[i] = 0.4 + Math.random() * 0.5;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    shake(amount) {
      shakeAmount = Math.max(shakeAmount, amount);
      shakeTime = 0.35;
    },
    get shakeOffset() {
      if (shakeTime <= 0) return { x: 0, y: 0 };
      const s = shakeAmount * (shakeTime / 0.35);
      return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < MAX; i += 1) {
        if (life[i] <= 0) continue;
        any = true;
        life[i] -= dt;
        if (life[i] <= 0) {
          positions[i * 3 + 1] = -999;
          continue;
        }
        vel[i * 3 + 1] -= 9 * dt;
        positions[i * 3] += vel[i * 3] * dt;
        positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < 0.05) {
          positions[i * 3 + 1] = 0.05;
          vel[i * 3 + 1] *= -0.4;
        }
      }
      if (any) geo.attributes.position.needsUpdate = true;
      if (shakeTime > 0) shakeTime -= dt;
      if (shakeTime <= 0) shakeAmount = 0;
    },
  };
}
