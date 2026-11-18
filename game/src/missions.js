// Solmar: missions and story. Five jobs for Rosa Marín, fixer of the Palmaro
// docks, then free-roam taxi fares. Each mission has a name, a brief, a live
// objective line, a map marker and a completion check; failing a timed job
// lets the player retry it. All original Solmar story.
import { MISSION_REWARDS } from './config.js';

const MISSIONS = [
  {
    name: 'Hot Wheels',
    brief: "Rosa needs wheels. Steal any car and bring it to her garage on Palmaro Row.",
    objective: 'Steal a car and deliver it to Rosa\'s garage',
    reward: MISSION_REWARDS[0],
  },
  {
    name: 'Package Run',
    brief: "A package for the docks. Ninety seconds. Don't ask what's in it.",
    objective: 'Drive the package to the docks before the timer runs out',
    reward: MISSION_REWARDS[1],
    timeLimit: 90,
  },
  {
    name: 'Street Heat',
    brief: 'The PD is sniffing around Rosa. Make some noise — two stars — then shake them off.',
    objective: 'Reach 2 stars, then lose the heat completely',
    reward: MISSION_REWARDS[2],
  },
  {
    name: 'Dockside',
    brief: 'The Vipers hold the east docks. Clear all five of them out.',
    objective: 'Defeat the 5 dock gang members',
    reward: MISSION_REWARDS[3],
  },
  {
    name: 'The Big Score',
    brief: 'The haul is in the trunk. Get three stars on you and run it to the pier. No stopping.',
    objective: 'Reach 3 stars, then deliver the haul to the pier',
    reward: MISSION_REWARDS[4],
  },
];

export function createMissions(landmarks) {
  let index = 0;
  let stage = 'idle'; // idle | active | done
  let timer = null;
  let sawTwoStars = false;
  let sawThreeStars = false;
  let gangDownAtStart = 0;
  let gangDownNeeded = 0;
  let onEvent = () => {};
  let fare = null; // free-roam taxi fare: {pickup:{x,z}, drop:{x,z}, state}

  function marker() {
    if (stage !== 'active') return fare ? fareMarker() : null;
    switch (index) {
      case 0: return { x: landmarks.garage.x, z: landmarks.garage.z, label: "Rosa's Garage" };
      case 1: return { x: landmarks.docks.x, z: landmarks.docks.z, label: 'Docks' };
      case 2: return null; // no marker: lose the heat anywhere
      case 3: return { x: landmarks.docks.x, z: landmarks.docks.z, label: 'Docks' };
      case 4: return { x: landmarks.pier.x, z: landmarks.pier.z, label: 'Pier' };
      default: return null;
    }
  }

  function fareMarker() {
    if (!fare) return null;
    const target = fare.state === 'pickup' ? fare.pickup : fare.drop;
    return { x: target.x, z: target.z, label: fare.state === 'pickup' ? 'Fare pickup' : 'Fare drop-off' };
  }

  function newFare(rng, streets) {
    const pick = () => ({
      x: streets[Math.floor(rng() * streets.length)] + (rng() < 0.5 ? -8 : 8),
      z: (Math.random() - 0.5) * 300,
    });
    fare = { pickup: pick(), drop: pick(), state: 'pickup' };
  }

  function start(i) {
    index = i;
    stage = 'active';
    const m = MISSIONS[i];
    timer = m.timeLimit || null;
    sawTwoStars = false;
    sawThreeStars = false;
    gangDownAtStart = 0;
    gangDownNeeded = 0;
    onEvent('brief', { mission: m });
  }

  function complete() {
    const m = MISSIONS[index];
    stage = 'done';
    timer = null;
    onEvent('complete', { mission: m, reward: m.reward });
    if (index + 1 < MISSIONS.length) {
      start(index + 1);
    } else {
      stage = 'idle';
      onEvent('storyDone', {});
    }
  }

  function fail(reason) {
    stage = 'active';
    timer = MISSIONS[index].timeLimit || null;
    sawTwoStars = false;
    sawThreeStars = false;
    onEvent('fail', { mission: MISSIONS[index], reason });
  }

  return {
    get index() { return index; },
    get stage() { return stage; },
    get done() { return index >= MISSIONS.length; },
    get current() { return MISSIONS[index] || null; },
    get timer() { return timer; },
    get fare() { return fare; },
    set onEvent(fn) { onEvent = fn; },
    marker,
    start,
    newFare,
    setGangBaseline(downCount) {
      gangDownAtStart = downCount;
      gangDownNeeded = 5;
    },
    update(dt, s) {
      if (stage !== 'active') {
        // free-roam fare logic
        if (fare) {
          const target = fare.state === 'pickup' ? fare.pickup : fare.drop;
          const d = Math.hypot(s.px - target.x, s.pz - target.z);
          if (fare.state === 'pickup' && d < 6) {
            fare.state = 'drop';
            onEvent('farePicked', { fare });
          } else if (fare.state === 'drop' && d < 6 && s.inCar) {
            onEvent('fareDone', { fare, reward: 80 });
            fare = null;
          }
        }
        return;
      }
      const m = MISSIONS[index];
      if (timer !== null) {
        timer -= dt;
        if (timer <= 0) {
          fail('Out of time.');
          return;
        }
      }
      switch (index) {
        case 0: {
          const d = Math.hypot(s.px - landmarks.garage.x, s.pz - landmarks.garage.z);
          if (s.inCar && d < 10) complete();
          break;
        }
        case 1: {
          const d = Math.hypot(s.px - landmarks.docks.x, s.pz - landmarks.docks.z);
          if (s.inCar && d < 10) complete();
          break;
        }
        case 2: {
          if (s.stars >= 2) sawTwoStars = true;
          if (sawTwoStars && s.stars === 0) complete();
          break;
        }
        case 3: {
          if (s.gangDown - gangDownAtStart >= gangDownNeeded) complete();
          break;
        }
        case 4: {
          if (s.stars >= 3) sawThreeStars = true;
          const d = Math.hypot(s.px - landmarks.pier.x, s.pz - landmarks.pier.z);
          if (sawThreeStars && s.inCar && d < 10) complete();
          break;
        }
        default: break;
      }
    },
  };
}
