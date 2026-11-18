// Combat: pistol shots (raycast + tracer), melee swings, rival gang
// members with health bars, and a small pooled particle system for dust,
// skid smoke, sparks and muzzle flashes.
import * as THREE from 'three';
import { PLAYER } from './config.js';

export class Particles {
  constructor(scene, max = 240) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.size = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.head = 0;
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, life = 0.7) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.life[i] = life;
    this.count = Math.min(this.count + 1, this.max);
  }

  burst(x, y, z, n, color, speed = 4, up = 2) {
    const [r, g, b] = color;
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, Math.cos(a) * s, up * Math.random(), Math.sin(a) * s, r, g, b, 0.4 + Math.random() * 0.5);
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i += 1) {
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -100;
        continue;
      }
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 2 * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class Combat {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.ammo = PLAYER.pistolAmmo;
    this.reserve = PLAYER.pistolReserve;
    this.reloading = 0;
    this.cooldown = 0;
    this.rivals = [];
    // Tracer: a reusable line segment.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
    this.tracerLife = 0;
  }

  /** Spawn rival gang members at a point. */
  spawnRivals(x, z, count, rng) {
    for (let i = 0; i < count; i += 1) {
      const g = new THREE.Group();
      const jacket = new THREE.MeshLambertMaterial({ color: 0x6a1b2a });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.36), jacket);
      body.position.y = 1.15;
      body.castShadow = true;
      g.add(body);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.8, 0.3), new THREE.MeshLambertMaterial({ color: 0x222222 }));
      legs.position.y = 0.4;
      g.add(legs);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc98a5a }));
      head.position.y = 1.75;
      g.add(head);
      // Health bar above the head.
      const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14), new THREE.MeshBasicMaterial({ color: 0x330000 }));
      barBg.position.y = 2.15;
      g.add(barBg);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
      bar.position.set(0, 2.15, 0.01);
      g.add(bar);
      g.position.set(x + rng.range(-6, 6), 0, z + rng.range(-6, 6));
      this.scene.add(g);
      this.rivals.push({ mesh: g, bar, x: g.position.x, z: g.position.z, health: 100, shootTimer: rng.range(1, 2), dead: false });
    }
  }

  /** Fire the pistol from `from` along `dir`. Returns what was hit. */
  shoot(from, dir, targets) {
    if (this.cooldown > 0 || this.reloading > 0) return null;
    if (this.ammo <= 0) {
      this.reload();
      return { dry: true };
    }
    this.ammo -= 1;
    this.cooldown = 0.22;
    const end = { x: from.x + dir.x * PLAYER.gunRange, y: from.y + dir.y * PLAYER.gunRange, z: from.z + dir.z * PLAYER.gunRange };
    let bestT = 1;
    let hit = null;
    const hitPoint = { x: end.x, y: end.y, z: end.z };
    // Rivals (sphere test).
    for (const r of this.rivals) {
      if (r.dead) continue;
      const cx = r.x - from.x;
      const cy = 1.2 - from.y;
      const cz = r.z - from.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0 || t > PLAYER.gunRange) continue;
      const px = from.x + dir.x * t;
      const py = from.y + dir.y * t;
      const pz = from.z + dir.z * t;
      const d2 = (px - r.x) ** 2 + (py - 1.2) ** 2 + (pz - r.z) ** 2;
      if (d2 < 1.1 && t / PLAYER.gunRange < bestT) {
        bestT = t / PLAYER.gunRange;
        hit = { kind: 'rival', rival: r };
        hitPoint.x = px;
        hitPoint.y = py;
        hitPoint.z = pz;
      }
    }
    // Cars (circle test in XZ, height band).
    for (const car of targets.cars || []) {
      if (car.dead) continue;
      const cx = car.x - from.x;
      const cz = car.z - from.z;
      const t = cx * dir.x + cz * dir.z;
      if (t < 0 || t > PLAYER.gunRange) continue;
      const px = from.x + dir.x * t;
      const pz = from.z + dir.z * t;
      if (Math.hypot(px - car.x, pz - car.z) < car.def.len * 0.55 && t / PLAYER.gunRange < bestT) {
        bestT = t / PLAYER.gunRange;
        hit = { kind: 'car', car };
        hitPoint.x = px;
        hitPoint.y = Math.max(0.6, from.y + dir.y * t);
        hitPoint.z = pz;
      }
    }
    // Pedestrians.
    for (const ped of targets.peds || []) {
      if (ped.dead) continue;
      const cx = ped.x - from.x;
      const cz = ped.z - from.z;
      const t = cx * dir.x + cz * dir.z;
      if (t < 0 || t > PLAYER.gunRange) continue;
      const px = from.x + dir.x * t;
      const pz = from.z + dir.z * t;
      if (Math.hypot(px - ped.x, pz - ped.z) < 0.7 && t / PLAYER.gunRange < bestT) {
        bestT = t / PLAYER.gunRange;
        hit = { kind: 'ped', ped };
        hitPoint.x = px;
        hitPoint.y = 1.1;
        hitPoint.z = pz;
      }
    }
    // Tracer + muzzle flash.
    const pos = this.tracer.geometry.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = hitPoint.x; pos[4] = hitPoint.y; pos[5] = hitPoint.z;
    this.tracer.geometry.attributes.position.needsUpdate = true;
    this.tracer.material.opacity = 0.95;
    this.tracerLife = 0.07;
    this.particles.burst(from.x + dir.x, from.y + dir.y, from.z + dir.z, 3, [1, 0.85, 0.4], 2, 1);
    if (hit) {
      this.particles.burst(hitPoint.x, hitPoint.y, hitPoint.z, 8, [1, 0.6, 0.2], 3, 2);
      if (hit.kind === 'rival') {
        hit.rival.health -= PLAYER.gunDamage;
        hit.rival.bar.scale.x = Math.max(0.01, hit.rival.health / 100);
        if (hit.rival.health <= 0) {
          hit.rival.dead = true;
          hit.rival.mesh.visible = false;
        }
      } else if (hit.kind === 'car') {
        hit.car.damage(18);
      } else if (hit.kind === 'ped') {
        hit.ped.health -= PLAYER.gunDamage;
        if (hit.ped.health <= 0) {
          hit.ped.dead = true;
          hit.ped.mesh.visible = false;
          hit.killed = true;
        }
      }
    }
    return hit || { kind: 'miss', point: hitPoint };
  }

  /** Melee swing in front of `from` facing `heading`. Returns a hit or null. */
  melee(from, heading, targets) {
    const fx = Math.cos(heading);
    const fz = -Math.sin(heading);
    const cx = from.x + fx * 1.4;
    const cz = from.z + fz * 1.4;
    for (const r of this.rivals) {
      if (r.dead) continue;
      if (Math.hypot(r.x - cx, r.z - cz) < PLAYER.meleeRange) {
        r.health -= PLAYER.meleeDamage;
        r.bar.scale.x = Math.max(0.01, r.health / 100);
        if (r.health <= 0) {
          r.dead = true;
          r.mesh.visible = false;
        }
        this.particles.burst(r.x, 1.2, r.z, 6, [1, 0.8, 0.3], 3, 2);
        return { kind: 'rival', rival: r };
      }
    }
    for (const ped of targets.peds || []) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - cx, ped.z - cz) < PLAYER.meleeRange) {
        ped.health -= PLAYER.meleeDamage;
        if (ped.health <= 0) {
          ped.dead = true;
          ped.mesh.visible = false;
          return { kind: 'ped', ped, killed: true };
        }
        return { kind: 'ped', ped, killed: false };
      }
    }
    return null;
  }

  reload() {
    if (this.reloading > 0 || this.reserve <= 0 || this.ammo === PLAYER.pistolAmmo) return;
    this.reloading = 1.1;
  }

  update(dt, now, playerPos, playerHealth, onPlayerShot) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      if (this.tracerLife <= 0) this.tracer.material.opacity = 0;
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = PLAYER.pistolAmmo - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }
    // Rivals shoot back at the player.
    for (const r of this.rivals) {
      if (r.dead) continue;
      const d = Math.hypot(r.x - playerPos.x, r.z - playerPos.z);
      r.shootTimer -= dt;
      // Face the player.
      r.mesh.rotation.y = Math.atan2(-(playerPos.z - r.z), playerPos.x - r.x);
      r.bar.lookAt(playerPos.x, 2.15, playerPos.z);
      if (d < 42 && r.shootTimer <= 0) {
        r.shootTimer = 1.6 + Math.random() * 0.9;
        if (Math.random() < 0.32) {
          onPlayerShot(8);
          this.particles.burst(r.x, 1.4, r.z, 2, [1, 0.85, 0.4], 2, 1);
        }
      }
    }
  }
}
