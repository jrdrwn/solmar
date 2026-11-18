// Solmar: the player on foot. A low-poly walker (Vic Maro) with a
// third-person orbit camera: WASD moves relative to the camera, Shift runs,
// Space jumps, the mouse orbits. The same rig becomes a chase camera when
// the player is driving.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, angleLerp } from './rng.js';
import { collideCircle } from './collide.js';

function createPlayerMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2ec4b6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xe0ac69 }),
  );
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x2a1a0e }),
  );
  hair.position.y = 1.7;
  group.add(hair);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), legMat);
  legL.position.set(-0.15, 0.36, 0);
  const legR = legL.clone();
  legR.position.set(0.15, 0.36, 0);
  group.add(legL, legR);
  const armMat = new THREE.MeshLambertMaterial({ color: 0x2ec4b6 });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.18), armMat);
  armL.position.set(-0.42, 1.05, 0);
  const armR = armL.clone();
  armR.position.set(0.42, 1.05, 0);
  group.add(armL, armR);
  return { group, legL, legR, armL, armR };
}

export function createPlayer(scene, start) {
  const { group, legL, legR, armL, armR } = createPlayerMesh();
  group.position.set(start.x, 0, start.z);
  scene.add(group);
  let x = start.x;
  let z = start.z;
  let y = 0;
  let vy = 0;
  let heading = start.heading || 0;
  let camYaw = start.heading || 0;
  let camPitch = 0.32;
  let onGround = true;
  let walkPhase = 0;
  let speedNow = 0;
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();

  return {
    mesh: group,
    get x() { return x; },
    get z() { return z; },
    get y() { return y; },
    get heading() { return heading; },
    get camYaw() { return camYaw; },
    get speed() { return speedNow; },
    get onGround() { return onGround; },
    teleport(nx, nz, nHeading) {
      x = nx;
      z = nz;
      y = 0;
      vy = 0;
      if (nHeading !== undefined) {
        heading = nHeading;
        camYaw = nHeading;
      }
      group.position.set(x, 0, z);
    },
    setHeading(h) { heading = h; camYaw = h; },
    // ride in a car: the player sits where the car is, but the mouse look
    // (camYaw) is theirs — teleport would reset it every frame
    followCar(nx, nz, nHeading) {
      x = nx;
      z = nz;
      y = 0;
      vy = 0;
      heading = nHeading;
      group.position.set(x, 0, z);
      group.rotation.y = heading;
    },
    applyLook(look) {
      camYaw -= look.dx * 0.0026;
      camPitch = clamp(camPitch + look.dy * 0.0022, -0.15, 1.1);
    },
    update(dt, input, colliders, worldHalf, frozen, actions) {
      this.applyLook(input.takeLook());
      if (frozen) return { speed: 0 };
      const fwd = (input.held.forward ? 1 : 0) - (input.held.back ? 1 : 0);
      const strafe = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
      const run = input.held.run;
      const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      let mx = sin * fwd + cos * strafe;
      let mz = cos * fwd - sin * strafe;
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        mx /= len;
        mz /= len;
        const targetHeading = Math.atan2(mx, mz);
        heading = angleLerp(heading, targetHeading, clamp(12 * dt, 0, 1));
      }
      const ox = x;
      const oz = z;
      x += mx * speed * (len > 0.01 ? 1 : 0) * dt;
      z += mz * speed * (len > 0.01 ? 1 : 0) * dt;
      if (collideCircle({ x, z }, PLAYER.radius, colliders, worldHalf)) {
        // slide: try the x-only move, then the z-only move, else stay put
        if (!collideCircle({ x, z: oz }, PLAYER.radius, colliders, worldHalf)) {
          z = oz;
        } else if (!collideCircle({ x: ox, z }, PLAYER.radius, colliders, worldHalf)) {
          x = ox;
        } else {
          x = ox;
          z = oz;
        }
      }
      speedNow = len > 0.01 ? speed : 0;
      // jump + gravity
      if ((actions & 8) && onGround) { // ACT.JUMP
        vy = PLAYER.jumpSpeed;
        onGround = false;
      }
      if (!onGround) {
        vy -= 22 * dt;
        y += vy * dt;
        if (y <= 0) { y = 0; vy = 0; onGround = true; }
      }
      walkPhase += dt * speedNow * 1.6;
      const swing = Math.sin(walkPhase) * (speedNow > 0.1 ? 0.55 : 0);
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.7;
      armR.rotation.x = swing * 0.7;
      group.position.set(x, y, z);
      group.rotation.y = heading;
      return { speed: speedNow, actions };
    },
    updateCamera(dt, camera, mode, carState, shake) {
      const dist = mode === 'car' ? 8 : 7.2;
      const height = mode === 'car' ? 3.2 : 3.4;
      let yaw = camYaw;
      let tx;
      let tz;
      let ty;
      if (mode === 'car' && carState) {
        // chase camera: ease back behind the car (yaw = heading puts the
        // camera opposite the nose), slightly to one side for a 3/4 view
        // that shows the car's flank, not just its rear plate
        camYaw = angleLerp(camYaw, carState.heading + 0.35, clamp(1.8 * dt, 0, 1));
        yaw = camYaw;
        tx = carState.x;
        tz = carState.z;
        ty = 1.4;
      } else {
        tx = x;
        tz = z;
        ty = 1.5 + y;
      }
      const pitch = mode === 'car' ? 0.24 : camPitch;
      const cx = tx - Math.sin(yaw) * Math.cos(pitch) * dist;
      const cz = tz - Math.cos(yaw) * Math.cos(pitch) * dist;
      const cy = ty + Math.sin(pitch) * dist + (mode === 'car' ? 0.8 : 0);
      const target = new THREE.Vector3(cx, Math.max(1.2, cy), cz);
      camPos.lerp(target, clamp(10 * dt, 0, 1));
      camTarget.set(tx, ty, tz);
      camera.position.copy(camPos);
      if (shake) {
        camera.position.x += shake.x;
        camera.position.y += shake.y;
      }
      camera.lookAt(camTarget);
    },
    snapCamera(camera, mode, carState) {
      camPos.set(0, -999, 0); // force next updateCamera to snap
      this.updateCamera(1, camera, mode, carState, null);
    },
  };
}
