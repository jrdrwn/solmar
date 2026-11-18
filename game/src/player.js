// Solmar — Vic Maro on foot: walk/run/jump, punch, pistol, and getting
// in and out of cars. The camera yaw lives in main.js; this module only
// moves the body relative to it.

import * as THREE from 'three';
import { SPEED, PLAYER } from './config.js';
import { ACT } from './input.js';
import { resolveCircle } from './collide.js';

function makeVicMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x8c2a2a });
  const shirt = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a34 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.82, 0.28), pants);
  legs.position.y = 0.41;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.64, 0.34), jacket);
  torso.position.y = 1.14;
  group.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.05), shirt);
  chest.position.set(0, 1.16, 0.19);
  group.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.66;
  group.add(head);
  const armGeo = new THREE.BoxGeometry(0.13, 0.56, 0.13);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.36, 1.12, 0);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.36, 1.12, 0);
  group.add(armL);
  group.add(armR);
  // pistol, hidden until Vic draws it
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x181818 }),
  );
  gun.position.set(0.36, 0.82, 0.22);
  gun.visible = false;
  group.add(gun);
  return { group, armL, armR, gun };
}

export function createPlayer(scene) {
  const { group, armL, armR, gun } = makeVicMesh();
  scene.add(group);
  const player = {
    mesh: group,
    armL,
    armR,
    gun,
    x: 0,
    y: 0,
    z: 0,
    vy: 0,
    heading: 0, // facing, radians; forward = (sin h, cos h)
    health: PLAYER.health,
    cash: 40,
    ammo: PLAYER.pistolAmmoStart,
    weapon: 'fists', // or 'pistol'
    inCar: false,
    car: null,
    shootCooldown: 0,
    walkPhase: 0,
    dead: false,
  };

  function place(x, z, heading = 0) {
    player.x = x;
    player.z = z;
    player.y = 0;
    player.vy = 0;
    player.heading = heading;
    player.mesh.position.set(x, 0, z);
    player.mesh.rotation.y = heading;
  }

  // On-foot step. camYaw is the camera's yaw; forward = (sin, cos).
  function updateFoot(dt, actions, input, camYaw, ctx) {
    if (player.dead) return;
    const held = input.held;
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw);
    const rz = Math.sin(camYaw);
    let mx = 0;
    let mz = 0;
    if (held.forward) {
      mx += fx;
      mz += fz;
    }
    if (held.back) {
      mx -= fx;
      mz -= fz;
    }
    if (held.right) {
      mx += rx;
      mz += rz;
    }
    if (held.left) {
      mx -= rx;
      mz -= rz;
    }
    const moving = mx !== 0 || mz !== 0;
    const speed = held.run ? SPEED.run : SPEED.walk;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      player.x += mx * speed * dt;
      player.z += mz * speed * dt;
      const wantHeading = Math.atan2(mx, mz);
      let diff = wantHeading - player.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.heading += Math.max(-10 * dt, Math.min(10 * dt, diff));
      player.walkPhase += dt * speed * 2.2;
    }
    // gravity + jump
    if (actions & ACT.JUMP && player.y <= 0.01) {
      player.vy = PLAYER.jumpSpeed;
      ctx.audio?.jump();
    }
    player.vy -= PLAYER.gravity * dt;
    player.y += player.vy * dt;
    if (player.y < 0) {
      player.y = 0;
      player.vy = 0;
    }
    // buildings block the walk
    const probe = { x: player.x, z: player.z };
    if (resolveCircle(probe, PLAYER.radius, ctx.colliders)) {
      player.x = probe.x;
      player.z = probe.z;
    }
    // weapon switch
    if (actions & ACT.WEAPON) {
      player.weapon = player.weapon === 'fists' ? 'pistol' : 'fists';
      player.gun.visible = player.weapon === 'pistol';
      ctx.audio?.click();
    }
    // punch
    if (actions & ACT.PUNCH) {
      ctx.combat.punch(player);
      ctx.audio?.punch();
    }
    // shooting: one-shot press or held mouse
    player.shootCooldown -= dt;
    const wantShoot = (actions & ACT.SHOOT) !== 0 || input.shooting;
    if (wantShoot && player.weapon === 'pistol' && player.shootCooldown <= 0 && player.ammo > 0) {
      player.shootCooldown = 0.22;
      player.ammo -= 1;
      // face where the camera looks while shooting; the shot flies along
      // the camera's view direction (ctx.shootDir, kept by main.js)
      player.heading = camYaw;
      ctx.combat.shootFromPlayer(player, ctx.shootDir);
      ctx.audio?.shot();
      ctx.effects?.muzzle(player.x, 1.4, player.z, camYaw);
    } else if (wantShoot && player.weapon === 'fists') {
      ctx.combat.punch(player);
    }
    // mesh sync + walk swing
    player.mesh.position.set(player.x, player.y, player.z);
    player.mesh.rotation.y = player.heading;
    const swing = moving ? Math.sin(player.walkPhase) * 0.55 : 0;
    player.armL.rotation.x = swing;
    player.armR.rotation.x = -swing;
  }

  function enterCar(car) {
    player.inCar = true;
    player.car = car;
    player.mesh.visible = false; // Vic sits inside the car; the car stays in the scene
  }

  function exitCar() {
    const car = player.car;
    player.inCar = false;
    player.car = null;
    player.mesh.visible = true;
    // step out on the driver's side
    const sideX = car.x - Math.cos(car.heading) * 2.4;
    const sideZ = car.z + Math.sin(car.heading) * 2.4;
    place(sideX, sideZ, car.heading);
  }

  function damage(amount) {
    if (player.dead) return false;
    player.health -= amount;
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      return true;
    }
    return false;
  }

  function healFull() {
    player.health = PLAYER.health;
    player.dead = false;
  }

  // Attach the methods to the live state object (never spread it: the
  // fields must stay live for the HUD, the minimap and the playtest).
  player.place = place;
  player.updateFoot = updateFoot;
  player.enterCar = enterCar;
  player.exitCar = exitCar;
  player.damage = damage;
  player.healFull = healFull;
  return player;
}
