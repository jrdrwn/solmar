// Solmar — shared constants for the open-world crime game.
// One place for every number the world agrees on: street layout, speeds,
// money, police behaviour and the save key. No game logic lives here.

export const STREETS = [-196, -140, -84, -28, 28, 84, 140, 196];
export const STREET_W = 14; // asphalt width
export const HALF_STREET = STREET_W / 2;
export const STREET_GAP = 56; // centre-to-centre distance of streets
export const CITY = 224; // city half-extent; blocks live inside +/-CITY
export const BEACH_Z0 = 224; // sand starts here (south edge of the city)
export const SEA_Z0 = 282; // water starts here
export const DOCKS_X0 = 224; // container port starts here (east edge)
export const PIER_X = 0; // pier runs south from the beach into the sea
export const PIER_Z0 = 282;
export const PIER_Z1 = 348;

export const SAVE_KEY = 'solmar.save.v1';

export const SPEED = {
  walk: 5.2,
  run: 9.0,
  carMax: 38, // player car, m/s
  carAccel: 24,
  carBrake: 34,
  carReverseMax: 12,
  traffic: 11,
  police: 43,
  pedWalk: 1.6,
};

export const MONEY = {
  startCash: 40,
  bail: 100,
  missionReward: [250, 350, 400, 500, 1000],
  taxiMin: 30,
  taxiMax: 80,
  pistolPrice: 150,
  ammoPrice: 40,
};

export const WANTED = {
  maxStars: 5,
  stealCar: 1,
  killPed: 1,
  shootPublic: 1,
  decaySeconds: 14, // one star fades after this long with no crime and no police in sight
  arrestRange: 4.2, // metres; police within this of the player on foot fill the arrest meter
  arrestSeconds: 2.6,
  bustCarRange: 6,
  bustCarStillSeconds: 4,
};

export const PLAYER = {
  health: 100,
  radius: 0.6,
  punchRange: 2.2,
  punchDamage: 25,
  pistolDamage: 34,
  pistolAmmoStart: 24,
  jumpSpeed: 7.5,
  gravity: 20,
};

export const CAR = {
  radius: 2.1,
  length: 4.6,
  width: 2.0,
};

// Colours of the sun-soaked city. Every mesh in the game picks from here,
// so the palette stays coherent: warm sand, pale concrete, teal sea,
// terracotta roofs and pastel walls.
export const PALETTE = {
  sky: 0x8ec9e8,
  fog: 0xa8d0e0,
  asphalt: 0x3a3f46,
  asphaltLine: 0xd8d3c0,
  sidewalk: 0xb8b2a4,
  sand: 0xe8d29a,
  sea: 0x1e7fa8,
  seaDeep: 0x155e80,
  dockConcrete: 0x9a9a92,
  building: [0xe8c9a0, 0xd8b48c, 0xc9a06a, 0xe0d0b8, 0xb8c4c8, 0xd8a08c, 0xf0e0c0, 0xc8b8a0],
  roof: [0xb85c38, 0x8c5a3c, 0x6a7a8c, 0x9c8c6a],
  glass: 0x7fb8d8,
  palmTrunk: 0x8a6a48,
  palmLeaf: 0x3e8c4a,
  container: [0xc8542e, 0x2e7a9c, 0x8c9c2e, 0xb89c2e, 0x7a4a9c],
  carPaint: [0xc83a2e, 0x2e6ac8, 0xe8c82e, 0x38a85c, 0xe8e8e8, 0x2a2a30, 0xc87a2e, 0x7a4ac8],
  policeWhite: 0xf0f0ea,
  policeBlack: 0x1a1a22,
  taxiYellow: 0xf0c020,
};

// Mission catalogue: names, who sends them, what Rosa says, rewards.
// The stage logic itself lives in missions.js; this is only the data.
export const MISSIONS = [
  {
    id: 'hot-wheels',
    name: 'Hot Wheels',
    giver: 'Rosa Marin',
    reward: 250,
    brief: 'Rosa needs a clean ride. Steal any car and bring it to her garage on Marina Row.',
    intro: 'Vic, baby, I need wheels. Any car, no questions. Bring it to my garage, east side.',
  },
  {
    id: 'package-run',
    name: 'Package Run',
    giver: 'Rosa Marin',
    reward: 350,
    brief: 'Pick up the package downtown and deliver it to the docks. 90 seconds. No cops.',
    intro: 'Package waiting downtown. Docks, ninety seconds. Drive like the tide is chasing you.',
  },
  {
    id: 'street-heat',
    name: 'Street Heat',
    giver: 'Rosa Marin',
    reward: 400,
    brief: 'The Coral Kings are muscling in on Solmar Plaza. Send their four hitters packing.',
    intro: 'Coral Kings think the plaza is theirs. Four of them, on foot. Make them regret it.',
  },
  {
    id: 'dockside',
    name: 'Dockside',
    giver: 'Rosa Marin',
    reward: 500,
    brief: 'A crate came in at the docks and the Kings want it. Grab it and bring it to the garage.',
    intro: 'Crate at the docks, three Kings guarding it. Take it, bring it home. Watch the cranes.',
  },
  {
    id: 'big-score',
    name: 'The Big Score',
    giver: 'Rosa Marin',
    reward: 1000,
    brief: 'The Solmar Trust bank, downtown. Grab the cash and lose the heat at the west hideout.',
    intro: 'This is the one, Vic. The Trust bank. Grab the bag, then vanish. Three stars, minimum.',
  },
];

export const DIALOGUE = {
  missionDone: [
    'Clean. Rosa is impressed.',
    'That is how it is done in Solmar.',
    'Money in the pocket. Next job when you are ready.',
  ],
  busted: 'BUSTED — the Solmar PD took you in. $100 bail, and they kept your heat.',
  wasted: 'WASTED — you woke up at the clinic, $100 lighter.',
  taxi: 'Fare! Pick up the passenger and drive them where they point.',
};
