// Solmarina configuration: city layout, tuning, car models, palettes.
// Every number that shapes the city or the feel lives here so the game can
// be tuned without touching the systems that use them.
export const SEED = 20261117;

// City grid: BLOCKS x BLOCKS blocks, each BLOCK wide, separated by ROAD-wide
// streets. Streets run along both axes at multiples of PITCH from -HALF.
export const CITY = {
  BLOCKS: 8,
  BLOCK: 56,
  ROAD: 16,
  PITCH: 72,
  HALF: 288, // city spans -288 .. +288 on each axis
  SIDEWALK: 5,
  BEACH_X: 296, // sand strip starts here (east edge)
  WATER_X: 330, // ocean starts here
};

// Sun-soaked coastal palette: warm plaster, pastel storefronts, deep sea.
export const PALETTE = {
  sky: 0x8ec9e8,
  fog: 0xa8d0e6,
  sun: 0xfff2d0,
  asphalt: 0x3a3f46,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d49a,
  water: 0x1e7fa8,
  grass: 0x7fae62,
  building: [0xf2e3c6, 0xe8b4a0, 0xf6d9a0, 0xc6d9e8, 0xe8c6d9, 0xd9e8c6, 0xf0c8a0, 0xbcd3e8],
  roof: [0x8a6f5c, 0x6f7d8a, 0x9a7a5c, 0x5c6f7d],
  glass: 0x9fc8e8,
};

// Car models: size, top speed (units/s), acceleration, handling, value.
export const CARS = {
  sedan:  { name: 'Solmarina Sedan',  len: 4.6, wid: 1.9, top: 27, accel: 15, brake: 26, grip: 2.6, colors: [0xc23b2e, 0x2e5aa8, 0xd8d8d8, 0x3a3f46] },
  taxi:   { name: 'Solmarina Taxi',   len: 4.6, wid: 1.9, top: 25, accel: 14, brake: 26, grip: 2.6, colors: [0xf2b705] },
  pickup: { name: 'Marina Pickup',    len: 5.0, wid: 2.0, top: 25, accel: 13, brake: 24, grip: 2.4, colors: [0x4a7a3a, 0x8a5a2e, 0x5c6f7d] },
  sports: { name: 'Vortex GT',        len: 4.4, wid: 2.0, top: 35, accel: 19, brake: 30, grip: 3.2, colors: [0xe82e5a, 0x111111, 0xf2f2f2, 0x2e8a6a] },
  van:    { name: 'Solmarina Van',    len: 5.4, wid: 2.1, top: 21, accel: 11, brake: 22, grip: 2.1, colors: [0xd8d8d8, 0x3a5a8a, 0x8a3a3a] },
  police: { name: 'Solmarina PD',     len: 4.7, wid: 1.95, top: 31, accel: 17, brake: 28, grip: 3.0, colors: [0x1a1a1a] },
};

// Wanted thresholds: heat points needed for each star level.
export const WANTED = {
  heatPerStar: [0, 12, 28, 48, 70, 95],
  maxHeat: 100,
  decayDelay: 8, // seconds without a crime before heat decays
  decayRate: 2.2, // heat per second while hidden
  crimeHeat: { steal: 14, hitPed: 16, hitCar: 6, shoot: 10, kill: 20 },
  policePerStar: [0, 2, 3, 4, 5, 6],
};

// Player tuning.
export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  jumpSpeed: 8.5,
  radius: 0.55,
  health: 100,
  pistolAmmo: 12,
  pistolReserve: 48,
  meleeDamage: 34,
  meleeRange: 2.4,
  gunDamage: 34,
  gunRange: 90,
};

// Mission cash rewards.
export const MISSION_REWARDS = [150, 300, 450, 600, 1200];

// In-game clock: one game hour per 45 real seconds, starting at 09:00.
export const CLOCK = { startHour: 9, secondsPerHour: 45 };
