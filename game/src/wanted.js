// Solmar — the wanted level and the Solmar PD.
// Stars rise with crime and fade when the heat dies down. Police cars are
// spawned on the street graph, follow it toward the player's street at
// range, and only drive straight at the player when both share one street
// — so they never cut through a building, and an arrest can actually happen.

import { SPEED, WANTED, STREETS } from './config.js';
import { nearestNode, nodePos, route } from './collide.js';

export function createWanted(vehicles, rng) {
  let stars = 0;
  let sinceCrime = 0;
  const police = []; // { car, route, routeIndex, repath, arrest, still }

  function policeTargetCount() {
    if (stars === 0) return 0;
    if (stars === 1) return 1;
    if (stars === 2) return 2;
    return 3;
  }

  function spawnPoliceNear(x, z) {
    // a node 70-110 m away, so the sirens arrive instead of appearing
    let best = -1;
    let bestScore = -1;
    for (let id = 0; id < 64; id++) {
      const p = nodePos(id);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 60 || d > 130) continue;
      const score = Math.abs(d - 95) * -1 + rng.range(0, 20);
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (best < 0) best = nearestNode(x + 90, z);
    const p = nodePos(best);
    const car = vehicles.spawnPolice(p.x, p.z);
    police.push({ car, route: [], routeIndex: 0, repath: 0, arrest: 0, still: 0 });
    return car;
  }

  function despawnExtra() {
    while (police.length > policeTargetCount()) {
      const p = police.pop();
      vehicles.removeCar(p.car);
    }
  }

  function addStars(n) {
    stars = Math.min(WANTED.maxStars, stars + n);
    sinceCrime = 0;
  }

  function onStealCar() {
    addStars(WANTED.stealCar);
  }
  function onKillPed() {
    addStars(WANTED.killPed);
  }
  function onShotFired() {
    addStars(WANTED.shootPublic);
  }

  function clear() {
    stars = 0;
    sinceCrime = 0;
    for (const p of police) vehicles.removeCar(p.car);
    police.length = 0;
  }

  // Do the police car and the player share one street (same centreline,
  // within the asphalt)? Then a straight drive is safe: no block between.
  function sharedStreet(px, pz, qx, qz) {
    for (const s of STREETS) {
      if (Math.abs(px - s) <= 8 && Math.abs(qx - s) <= 8) return { x: s, z: qz, axis: 'x' };
      if (Math.abs(pz - s) <= 8 && Math.abs(qz - s) <= 8) return { x: qx, z: s, axis: 'z' };
    }
    return null;
  }

  function steerToward(car, tx, tz, speed, dt, maxTurn) {
    const dx = tx - car.x;
    const dz = tz - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1) return dist;
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-maxTurn * dt, Math.min(maxTurn * dt, diff));
    car.speed = speed;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    return dist;
  }

  function update(dt, player, ctx) {
    sinceCrime += dt;
    // heat fades when the player stays clean and out of sight
    if (stars > 0 && sinceCrime > WANTED.decaySeconds) {
      const near = police.some((p) => Math.hypot(p.car.x - player.x, p.car.z - player.z) < 45);
      if (!near) {
        stars -= 1;
        sinceCrime = 0;
      }
    }
    // match the number of police cars to the wanted level
    while (police.length < policeTargetCount()) spawnPoliceNear(player.x, player.z);
    despawnExtra();

    let arrestProgress = 0;
    for (const p of police) {
      const car = p.car;
      const dist = Math.hypot(car.x - player.x, car.z - player.z);
      p.repath -= dt;
      if (dist > 35) {
        // range: follow the street graph to the player's node
        if (p.repath <= 0 || p.routeIndex >= p.route.length) {
          p.route = route(nearestNode(car.x, car.z), nearestNode(player.x, player.z));
          p.routeIndex = 0;
          p.repath = 1.0;
        }
        if (p.route.length > 0 && p.routeIndex < p.route.length) {
          const target = nodePos(p.route[p.routeIndex]);
          const d = steerToward(car, target.x, target.z, SPEED.police, dt, 2.0);
          if (d < 4) p.routeIndex++;
        } else {
          steerToward(car, player.x, player.z, SPEED.police * 0.6, dt, 2.0);
        }
      } else {
        // close in: a cop on top of Vic on foot stops to cuff him (so the
        // arrest meter can actually fill); otherwise drive straight at the
        // player only on a shared street, and keep to the graph so no
        // building is ever crossed
        if (!player.inCar && dist < WANTED.arrestRange + 1.3) {
          car.speed = 0;
        } else {
          const shared = sharedStreet(car.x, car.z, player.x, player.z);
          if (shared) {
            steerToward(car, shared.x, shared.z, SPEED.police, dt, 2.6);
          } else if (p.route.length > 0 && p.routeIndex < p.route.length) {
            const target = nodePos(p.route[p.routeIndex]);
            const d = steerToward(car, target.x, target.z, SPEED.police, dt, 2.2);
            if (d < 4) p.routeIndex++;
          } else {
            p.route = route(nearestNode(car.x, car.z), nearestNode(player.x, player.z));
            p.routeIndex = 0;
          }
        }
      }
      // arrest: on foot, a cop on top of Vic fills the meter
      if (!player.inCar && dist < WANTED.arrestRange) {
        p.arrest += dt;
        arrestProgress = Math.max(arrestProgress, p.arrest / WANTED.arrestSeconds);
        if (p.arrest >= WANTED.arrestSeconds) {
          ctx.onBusted?.();
          return { arrestProgress: 1 };
        }
      } else {
        p.arrest = Math.max(0, p.arrest - dt * 2);
      }
      // in a car: boxed in and stopped means busted
      if (player.inCar && dist < WANTED.bustCarRange && Math.abs(player.car.speed) < 2) {
        p.still += dt;
        arrestProgress = Math.max(arrestProgress, p.still / WANTED.bustCarStillSeconds);
        if (p.still >= WANTED.bustCarStillSeconds) {
          ctx.onBusted?.();
          return { arrestProgress: 1 };
        }
      } else {
        p.still = Math.max(0, p.still - dt * 2);
      }
      // ramming: a police car touching Vic's car shoves and slows it
      if (player.inCar && dist < 4.6 && p.car.crashed <= 0) {
        player.car.speed *= 0.86;
        p.car.crashed = 0.5;
        const push = 1.6;
        const nx = player.car.x + ((player.car.x - car.x) / (dist || 1)) * push;
        const nz = player.car.z + ((player.car.z - car.z) / (dist || 1)) * push;
        player.car.x = nx;
        player.car.z = nz;
        ctx.audio?.thud();
      }
    }
    return { arrestProgress };
  }

  return {
    get stars() {
      return stars;
    },
    get police() {
      return police;
    },
    policeCount() {
      return police.length;
    },
    nearestPolice(x, z) {
      let best = null;
      let bestD = Infinity;
      for (const p of police) {
        const d = Math.hypot(p.car.x - x, p.car.z - z);
        if (d < bestD) {
          bestD = d;
          best = p.car;
        }
      }
      return best;
    },
    addStars,
    onStealCar,
    onKillPed,
    onShotFired,
    clear,
    update,
    // test/shot hook: spawn one police car near a point (it joins the
    // wanted system's own list, so it is driven by the same pursuit code)
    spawnNear(x, z) {
      return spawnPoliceNear(x, z);
    },
    // test/shot hook: spawn one police car AT a street point, facing
    // south (+z) by default, and join it to the pursuit list
    spawnAt(x, z, heading = 0) {
      const car = vehicles.spawnPolice(x, z);
      car.heading = heading;
      police.push({ car, route: [], routeIndex: 0, repath: 0, arrest: 0, still: 0 });
      return car;
    },
  };
}
