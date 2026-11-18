// Solmar — the story: five jobs from fixer Rosa Marin, then free-roam
// taxi fares once the story is done. Each mission is stages with a
// beacon marker; the HUD and the minimap read the current marker.

import * as THREE from 'three';
import { MISSIONS, MONEY } from './config.js';
import { LANDMARKS } from './city.js';
import { randomStreetPoint } from './collide.js';

export function createMissions(scene, ctx) {
  // -- beacon marker ---------------------------------------------------------
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd24a,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 34, 16, 1, true), beaconMat);
  beacon.position.y = 17;
  scene.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.7 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  scene.add(ring);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd24a }),
  );
  gem.position.y = 5;
  scene.add(gem);
  beacon.visible = false;
  ring.visible = false;
  gem.visible = false;

  let index = 0; // 0..4 story, 5 = story done (taxi mode)
  let stage = 0;
  let timer = 0;
  let grabHold = 0;
  let spawned = false;
  let taxi = null; // { phase: 'pickup'|'dropoff', px, pz, dx, dz, fare, timer }
  let taxiCooldown = 0;
  let marker = { x: 0, z: 0, label: '' };

  function setMarker(x, z, label) {
    marker = { x, z, label };
    beacon.position.set(x, 17, z);
    ring.position.set(x, 0.08, z);
    gem.position.set(x, 5, z);
    beacon.visible = true;
    ring.visible = true;
    gem.visible = true;
  }

  function hideMarker() {
    beacon.visible = false;
    ring.visible = false;
    gem.visible = false;
  }

  function mission() {
    return MISSIONS[index];
  }

  function objectiveText() {
    if (index >= 5) {
      if (taxi) {
        return taxi.phase === 'pickup'
          ? `Taxi: pick up the fare (${taxi.fare}$) — ${Math.ceil(taxi.timer)}s`
          : `Taxi: drop off the passenger — ${Math.ceil(taxi.timer)}s`;
      }
      return 'Free roam — taxi fares pay the bills. Find a passenger.';
    }
    const m = mission();
    const lines = {
      0: ['steal any car', 'deliver the car to Rosa\u2019s garage'],
      1: ['pick up the package downtown', 'deliver to the docks — 90s'],
      2: ['reach Solmar Plaza', 'take out the Coral Kings (0/4)'],
      3: ['reach the crate at the docks', 'grab the crate', 'bring the crate to the garage'],
      4: ['reach the Solmar Trust bank', 'hold position to grab the cash', 'lose the heat at the west hideout'],
    };
    return `${m.name}: ${lines[index][stage] || ''}`;
  }

  function toast(text) {
    ctx.hud?.toast(text);
  }

  function start() {
    index = 0;
    stage = 0;
    spawned = false;
    timer = 0;
    grabHold = 0;
    taxi = null;
    applyStage();
    toast(`${mission().giver}: ${mission().intro}`);
  }

  function applyStage() {
    const p = ctx.player;
    if (index >= 5) {
      hideMarker();
      return;
    }
    if (index === 0) {
      if (stage === 0) {
        // "Steal any car" has no destination: no beacon, just the objective.
        hideMarker();
      } else {
        setMarker(LANDMARKS.garage.x, LANDMARKS.garage.z, LANDMARKS.garage.label);
      }
    } else if (index === 1) {
      if (stage === 0) setMarker(LANDMARKS.downtown.x, LANDMARKS.downtown.z, 'Package pickup');
      else setMarker(LANDMARKS.docks.x, LANDMARKS.docks.z, 'Deliver to the docks');
    } else if (index === 2) {
      setMarker(LANDMARKS.plaza.x, LANDMARKS.plaza.z, 'Solmar Plaza');
    } else if (index === 3) {
      if (stage === 0) setMarker(260, -140, 'Crate at the docks');
      else if (stage === 1) setMarker(260, -140, 'Grab the crate');
      else setMarker(LANDMARKS.garage.x, LANDMARKS.garage.z, LANDMARKS.garage.label);
    } else if (index === 4) {
      if (stage === 0) setMarker(LANDMARKS.bank.x, LANDMARKS.bank.z, 'Solmar Trust Bank');
      else if (stage === 1) setMarker(LANDMARKS.bank.x, LANDMARKS.bank.z, 'Grab the cash…');
      else setMarker(LANDMARKS.hideout.x, LANDMARKS.hideout.z, 'West Hideout');
    }
  }

  function completeMission() {
    const m = mission();
    ctx.player.cash += m.reward;
    ctx.audio?.missionDone();
    toast(`${m.name} complete — +$${m.reward}`);
    index += 1;
    stage = 0;
    spawned = false;
    timer = 0;
    grabHold = 0;
    ctx.combat.clearEnemies();
    if (index >= 5) {
      hideMarker();
      toast('Story complete! Taxi fares now pay the bills — look for the green marker.');
      taxiCooldown = 3;
    } else {
      applyStage();
      toast(`${mission().giver}: ${mission().intro}`);
    }
    ctx.save?.write();
  }

  function failMission(reason) {
    toast(`${mission().name} failed — ${reason}. Try again.`);
    ctx.audio?.fail();
    ctx.combat.clearEnemies();
    stage = 0;
    spawned = false;
    timer = 0;
    grabHold = 0;
    applyStage();
  }

  function distToMarker() {
    const p = ctx.player;
    return Math.hypot(p.x - marker.x, p.z - marker.z);
  }

  function spawnTaxiFare() {
    const p = randomStreetPoint(ctx.rng);
    const d = randomStreetPoint(ctx.rng);
    const fare = Math.max(MONEY.taxiMin, Math.min(MONEY.taxiMax, Math.round(Math.hypot(d.x - p.x, d.z - p.z) / 6)));
    taxi = { phase: 'pickup', px: p.x, pz: p.z, dx: d.x, dz: d.z, fare, timer: 75 };
    setMarker(p.x, p.z, 'Taxi fare');
    toast('Taxi fare! Pick up the passenger.');
  }

  function update(dt, t) {
    // beacon animation
    if (beacon.visible) {
      gem.rotation.y = t * 1.5;
      gem.position.y = 5 + Math.sin(t * 2) * 0.6;
      beaconMat.opacity = 0.16 + Math.sin(t * 3) * 0.06;
    }
    const p = ctx.player;
    if (index >= 5) {
      // taxi mode
      if (!taxi) {
        taxiCooldown -= dt;
        if (taxiCooldown <= 0) spawnTaxiFare();
        return;
      }
      taxi.timer -= dt;
      if (taxi.timer <= 0) {
        toast('Fare cancelled — too slow.');
        taxi = null;
        taxiCooldown = 4;
        hideMarker();
        return;
      }
      if (taxi.phase === 'pickup') {
        const d = Math.hypot(p.x - taxi.px, p.z - taxi.pz);
        if (d < 4 && p.inCar) {
          taxi.phase = 'dropoff';
          taxi.timer = 60;
          setMarker(taxi.dx, taxi.dz, 'Drop-off');
          toast('Passenger aboard — drive where they point.');
        }
      } else {
        const d = Math.hypot(p.x - taxi.dx, p.z - taxi.dz);
        if (d < 8 && p.inCar) {
          p.cash += taxi.fare;
          ctx.audio?.pickup();
          toast(`Fare paid — +$${taxi.fare}`);
          taxi = null;
          taxiCooldown = 4;
          hideMarker();
          ctx.save?.write();
        }
      }
      return;
    }

    // story missions
    if (index === 0) {
      if (stage === 0) {
        if (p.inCar) {
          stage = 1;
          applyStage();
          toast('Nice wheels. Now bring it to the garage.');
        }
      } else if (p.inCar && distToMarker() < 8) {
        completeMission();
      }
    } else if (index === 1) {
      if (stage === 0) {
        if (distToMarker() < 4) {
          stage = 1;
          timer = 90;
          applyStage();
          toast('Package secured. Ninety seconds — go!');
        }
      } else {
        timer -= dt;
        if (timer <= 0) {
          failMission('the package is late');
        } else if (distToMarker() < 8) {
          completeMission();
        }
      }
    } else if (index === 2) {
      if (stage === 0) {
        if (distToMarker() < 12) {
          stage = 1;
          spawned = true;
          // four Coral Kings hitters around the plaza
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            ctx.combat.spawnEnemy(Math.cos(a) * 14, Math.sin(a) * 14, 60);
          }
          applyStage();
          toast('Four Kings on the plaza. Take them out.');
        }
      } else if (ctx.combat.enemies.every((e) => e.dead)) {
        completeMission();
      }
    } else if (index === 3) {
      if (stage === 0) {
        if (distToMarker() < 25 && !spawned) {
          spawned = true;
          for (let i = 0; i < 3; i++) {
            ctx.combat.spawnEnemy(260 + (i - 1) * 8, -140 + (i % 2) * 10, 60);
          }
          toast('Three Kings guard the crate.');
        }
        if (distToMarker() < 4) {
          stage = 1;
          applyStage();
        }
      } else if (stage === 1) {
        if (!p.inCar && distToMarker() < 3) {
          stage = 2;
          applyStage();
          toast('Crate in hand. Bring it to the garage.');
        }
      } else if (distToMarker() < 8) {
        completeMission();
      }
    } else if (index === 4) {
      if (stage === 0) {
        if (distToMarker() < 5) {
          stage = 1;
          applyStage();
        }
      } else if (stage === 1) {
        if (!p.inCar && distToMarker() < 5) {
          grabHold += dt;
          if (grabHold >= 3) {
            stage = 2;
            ctx.wanted.addStars(3);
            applyStage();
            toast('Cash grabbed! Three stars — lose them at the hideout!');
            ctx.audio?.alarm();
          }
        } else {
          grabHold = 0;
        }
      } else if (distToMarker() < 8) {
        completeMission();
      }
    }
  }

  return {
    get missionIndex() {
      return index;
    },
    get missionStage() {
      return stage;
    },
    get timerLeft() {
      return timer;
    },
    get grabProgress() {
      return Math.min(1, grabHold / 3);
    },
    get taxiFare() {
      return taxi;
    },
    marker() {
      // null when no beacon is showing (e.g. "steal any car" has no place)
      return beacon.visible ? { ...marker } : null;
    },
    objectiveText,
    start,
    update,
    // test hooks: jump the story for the playtest
    _setIndex(i) {
      index = i;
      stage = 0;
      spawned = false;
      applyStage();
    },
  };
}
