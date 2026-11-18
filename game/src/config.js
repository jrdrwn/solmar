// Solmar: world constants and palette. One place for every number the city,
// the cars and the missions share, so tuning stays in one file.
export const WORLD = {
  grid: 7, // blocks per side
  block: 42, // metres of building block per side
  road: 14, // metres of road between blocks
  get pitch() { return this.block + this.road; },
  get half() { return (this.grid * this.block + (this.grid + 1) * this.road) / 2; },
  beachAt: 0, // filled in by city.js: z where the sand starts
};

export const STREETS = []; // filled by city.js: street centre coordinates

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 8.4,
  jumpSpeed: 7.5,
  radius: 0.45,
  height: 1.8,
};

export const CAR = {
  accel: 14,
  brake: 26,
  reverseAccel: 8,
  maxSpeed: 30,
  maxReverse: 9,
  turnRate: 1.9,
  drag: 0.6,
};

export const WANTED = {
  stealCar: 25,
  hitPed: 25,
  killPed: 40,
  shoot: 12,
  hitCop: 25,
  decayDelay: 15, // seconds without a crime before heat decays
  decayRate: 2.5, // heat per second while decaying
  heatPerStar: 25,
  maxStars: 5,
};

export const PALETTE = {
  sky: 0x87bfe8,
  skyHorizon: 0xffe3a3,
  sun: 0xfff2cf,
  asphalt: 0x2e3138,
  asphaltLine: 0xd8d3c0,
  sidewalk: 0x9a938a,
  sand: 0xe8cf9a,
  sea: 0x1d7f9e,
  seaDeep: 0x0e5d7d,
  grass: 0x5d8a4a,
  building: [0xe8dcc8, 0xd8c8b0, 0xc9b8a0, 0xb8a888, 0xe0d0c0, 0xcfc0a8],
  glass: 0x3a5a78,
  roof: 0x6b5a4a,
  palmTrunk: 0x8a6a4a,
  palmLeaf: 0x3f8a3f,
};

// Named car colours, all original Solmar paint jobs.
export const CAR_COLORS = [
  0xc0392b, 0x2471a3, 0xf1c40f, 0x1e8449, 0x7d3c98, 0xe67e22,
  0x95a5a6, 0x2c3e50, 0xf8f9f9, 0x16a085, 0xd35400, 0x8e44ad,
];

export const MISSION_REWARDS = [250, 350, 300, 450, 700];
