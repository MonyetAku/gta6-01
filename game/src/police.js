// Wanted system: heat from crimes, 1-5 stars, police cars that spawn,
// chase and ram, and a cooldown that lets the player lay low.
import { WANTED } from './config.js';
import { Car } from './vehicles.js';

export class Police {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.heat = 0;
    this.stars = 0;
    this.lastCrimeAt = -100;
    this.units = [];
    this.bustTimer = 0;
  }

  starsForHeat(heat) {
    let stars = 0;
    for (let i = 0; i < WANTED.heatPerStar.length; i += 1) {
      if (heat >= WANTED.heatPerStar[i]) stars = i;
    }
    return stars;
  }

  addCrime(kind, now) {
    const amount = WANTED.crimeHeat[kind] || 0;
    this.heat = Math.min(WANTED.maxHeat, this.heat + amount);
    this.lastCrimeAt = now;
    this.stars = this.starsForHeat(this.heat);
  }

  setStars(n, now) {
    this.heat = WANTED.heatPerStar[Math.max(0, Math.min(5, n))];
    this.stars = n;
    this.lastCrimeAt = now;
  }

  /** True when the player is hidden: no police unit close by. */
  isHidden(px, pz) {
    for (const u of this.units) {
      if (Math.hypot(u.x - px, u.z - pz) < 42) return false;
    }
    return true;
  }

  /** Spawn one police unit at an exact spot (used by screenshot staging). */
  spawnUnitAt(x, z, speed = 14) {
    const unit = new Car(this.scene, 'police', 0x1a1a1a, x, z, 0);
    unit.speed = speed;
    this.units.push(unit);
    return unit;
  }

  update(dt, now, px, pz, playerCar, onRam) {
    // Heat decay after a quiet spell while hidden.
    if (this.heat > 0 && now - this.lastCrimeAt > WANTED.decayDelay && this.isHidden(px, pz)) {
      this.heat = Math.max(0, this.heat - WANTED.decayRate * dt);
      this.stars = this.starsForHeat(this.heat);
    }
    const want = WANTED.policePerStar[this.stars];
    // Spawn units on streets some distance away from the player.
    while (this.units.length < want) {
      let p;
      let tries = 0;
      do {
        p = this.world.randomStreetPoint(this.rng);
        tries += 1;
      } while (tries < 12 && Math.hypot(p.x - px, p.z - pz) < 55);
      const unit = new Car(this.scene, 'police', 0x1a1a1a, p.x, p.z, 0);
      unit.speed = 12;
      this.units.push(unit);
    }
    // Despawn extras when the heat drops: drop the farthest unit first.
    while (this.units.length > want) {
      let far = 0;
      let farD = -1;
      for (let i = 0; i < this.units.length; i += 1) {
        const d = Math.hypot(this.units[i].x - px, this.units[i].z - pz);
        if (d > farD) {
          farD = d;
          far = i;
        }
      }
      const [unit] = this.units.splice(far, 1);
      unit.dispose(this.scene);
    }
    // Chase: steer at the player (with a little prediction), ram on contact.
    for (const unit of this.units) {
      const speed = Math.min(31 + this.stars, 36);
      const lead = 0.35;
      const tx = px + (playerCar ? Math.cos(playerCar.heading) * playerCar.speed * lead : 0);
      const tz = pz + (playerCar ? -Math.sin(playerCar.heading) * playerCar.speed * lead : 0);
      unit.driveToward(tx, tz, speed, dt, this.world);
      const d = Math.hypot(unit.x - px, unit.z - pz);
      if (d < 3.4) {
        onRam(unit, d);
        // Bounce the unit back a little so it does not sit inside the player.
        const push = 3.4 - d;
        const nx = (unit.x - px) / (d || 1);
        const nz = (unit.z - pz) / (d || 1);
        unit.x += nx * push;
        unit.z += nz * push;
      }
      // Give up on a unit that is far away for a long time.
      if (d > 170) {
        unit.farTimer = (unit.farTimer || 0) + dt;
        if (unit.farTimer > 12) {
          const p = this.world.randomStreetPoint(this.rng);
          unit.x = p.x;
          unit.z = p.z;
          unit.farTimer = 0;
        }
      } else {
        unit.farTimer = 0;
      }
    }
  }

  clear() {
    for (const unit of this.units) unit.dispose(this.scene);
    this.units = [];
    this.heat = 0;
    this.stars = 0;
  }
}
