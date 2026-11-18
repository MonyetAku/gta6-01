// Traffic: cars that loop around city blocks on the street grid, and
// parked cars the player can steal.
import * as THREE from 'three';
import { CITY, CARS } from './config.js';
import { Car } from './vehicles.js';

function loopCorners(world, bi, bj) {
  const x0 = -CITY.HALF + bi * CITY.PITCH;
  const z0 = -CITY.HALF + bj * CITY.PITCH;
  const x1 = x0 + CITY.PITCH;
  const z1 = z0 + CITY.PITCH;
  const inset = 3.5; // drive in the right-hand lane
  return [
    { x: x0 + inset, z: z0 + inset },
    { x: x1 - inset, z: z0 + inset },
    { x: x1 - inset, z: z1 - inset },
    { x: x0 + inset, z: z1 - inset },
  ];
}

export class Traffic {
  constructor(scene, world, rng, count = 13) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.cars = [];
    this.parked = [];
    const models = ['sedan', 'sedan', 'taxi', 'pickup', 'sports', 'van', 'sedan'];
    for (let i = 0; i < count; i += 1) {
      const bi = rng.int(0, CITY.BLOCKS - 1);
      const bj = rng.int(0, CITY.BLOCKS - 1);
      const corners = loopCorners(world, bi, bj);
      const ci = rng.int(0, 3);
      const model = rng.pick(models);
      const color = rng.pick(CARS[model].colors);
      const car = new Car(scene, model, color, corners[ci].x, corners[ci].z, 0);
      car.speed = rng.range(7, 11);
      car.loop = corners;
      car.corner = (ci + 1) % 4;
      car.cruise = rng.range(7, 11);
      this.cars.push(car);
    }
    // Parked cars along street edges.
    for (let i = 0; i < 10; i += 1) {
      const p = world.randomStreetPoint(rng);
      const alongRoad = rng.chance(0.5);
      const off = (CITY.ROAD / 2 - 2.2) * (rng.chance(0.5) ? 1 : -1);
      const model = rng.pick(models);
      const color = rng.pick(CARS[model].colors);
      const heading = alongRoad ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
      const car = new Car(scene, model, color, p.x + (alongRoad ? 0 : off), p.z + (alongRoad ? off : 0), heading);
      this.parked.push(car);
    }
  }

  /** All cars the player can interact with (traffic + parked). */
  allCars() {
    return this.cars.concat(this.parked);
  }

  update(dt, playerCar, peds) {
    for (const car of this.cars) {
      if (car === playerCar) continue; // the player drives this one
      const target = car.loop[car.corner];
      const arrived = car.driveToward(target.x, target.z, car.cruise, dt, this.world);
      if (arrived) car.corner = (car.corner + 1) % 4;
    }
    // Gentle car-car separation so traffic does not pile up.
    const all = this.allCars();
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 30 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (5.5 - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          if (a !== playerCar) { a.x -= nx * push; a.z -= nz * push; }
          if (b !== playerCar) { b.x += nx * push; b.z += nz * push; }
        }
      }
    }
    for (const car of all) {
      if (car !== playerCar) car.syncMesh(dt);
    }
  }

  /** The nearest stealable car within `range` of a point, or null. */
  nearestCar(x, z, range) {
    let best = null;
    let bestD = range;
    for (const car of this.allCars()) {
      if (car.isPolice) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  removeParked(car) {
    const i = this.parked.indexOf(car);
    if (i >= 0) this.parked.splice(i, 1);
  }
}
