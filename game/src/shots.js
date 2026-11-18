// Solmar — screenshot presets. `?shot=<name>&seed=<n>` in the URL sets
// up a staged moment of the game (title, driving, police chase, mission)
// so the capture script can screenshot the open world at its best. Every
// waypoint sits on a real street; nothing here teleports onto a block.

import { LANDMARKS } from './city.js';

export function applyShot(name, G) {
  const P = G.player;
  const V = G.vehicles;
  const W = G.wanted;
  const M = G.missions;

  function putPlayerInCar(x, z, heading, speed) {
    const car = V.nearestCar(x, z, 60, ['parked', 'traffic']);
    if (!car) return null;
    // move the chosen car onto the street point and put Vic in it
    car.x = x;
    car.z = z;
    car.heading = heading;
    car.speed = speed;
    car.kind = 'parked';
    P.place(x, z, heading);
    P.enterCar(car);
    return car;
  }

  if (name === 'start') {
    // title screen over the city; main.js orbits the camera itself
    G.setScreen('title');
    return 1.0;
  }

  G.newGame();
  if (name === 'drive') {
    // Vic driving south down Marina Row (street x=28) at full speed —
    // hold W so the car stays at speed instead of coasting down.
    // Ready at 2.0 s of game time: the car is mid-city with traffic and
    // pedestrians in frame, and the road renders cleanly at this range.
    putPlayerInCar(28, -168, 0, 26);
    G.input.setHeld('forward', true);
    G.camera.yaw = 0;
    G.camera.lookYaw = 0;
    return 2.0;
  }
  if (name === 'chase') {
    // wanted 3 stars, two police cars closing in from behind on the same
    // street (x=28), so the pursuit is straight down the road at Vic
    putPlayerInCar(28, -84, 0, 30);
    G.input.setHeld('forward', true);
    W.addStars(3);
    W.spawnAt(28, -102, 0);
    W.spawnAt(28, -120, 0);
    G.camera.yaw = 0;
    G.camera.lookYaw = 0;
    return 4.6;
  }
  if (name === 'mission') {
    // on foot at the docks, Dockside mission live, guards in sight
    M._setIndex(3);
    P.place(248, -128, Math.atan2(260 - 248, -140 - -128));
    P.weapon = 'pistol';
    P.gun.visible = true;
    G.camera.yaw = Math.atan2(260 - 248, -140 - -128);
    G.camera.lookYaw = 0;
    return 4.2;
  }
  return 1.0;
}

export const SHOT_NAMES = ['start', 'drive', 'chase', 'mission'];
export const SHOT_FILES = {
  start: '4-start.jpg',
  drive: '2-drive.jpg',
  chase: '1-chase.jpg',
  mission: '3-mission.jpg',
};
