// Pedestrians: sidewalk walkers who wander between corners and flee from
// danger (a speeding car, a gunshot, a police chase).
import * as THREE from 'three';

const SHIRTS = [0xe84a5f, 0x2e86ab, 0xf2b705, 0x6a994e, 0x9b5de5, 0xe07a5f, 0x118ab2, 0xef476f];
const PANTS = [0x2e3440, 0x4a4e69, 0x6d6875, 0x22223b, 0x3d405b];

export class Pedestrians {
  constructor(scene, world, rng, count = 26) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.list = [];
    for (let i = 0; i < count; i += 1) {
      const p = world.randomSidewalkPoint(rng);
      const ped = this.makePed(rng, p.x, p.z);
      ped.target = world.randomSidewalkPoint(rng);
      ped.speed = rng.range(1.2, 2.2);
      ped.fleeUntil = 0;
      this.list.push(ped);
    }
  }

  makePed(rng, x, z) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
    const pants = new THREE.MeshLambertMaterial({ color: rng.pick(PANTS) });
    const skin = new THREE.MeshLambertMaterial({ color: rng.pick([0xf2c9a0, 0xc98a5a, 0x8a5a3a, 0xe8b88a]) });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.3), pants);
    legs.position.y = 0.4;
    legs.castShadow = true;
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.34), shirt);
    torso.position.y = 1.15;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
    head.position.y = 1.72;
    head.castShadow = true;
    g.add(head);
    g.position.set(x, 0, z);
    this.scene.add(g);
    return { mesh: g, x, z, heading: rng.range(0, Math.PI * 2), target: null, speed: 1.6, fleeUntil: 0, health: 100, dead: false, walkPhase: rng.range(0, 6) };
  }

  /** Scare every pedestrian within `radius` of (x, z): they run away. */
  scare(x, z, radius, now) {
    for (const ped of this.list) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.fleeUntil = now + 3;
        ped.fleeFrom = { x, z };
      }
    }
  }

  update(dt, now, world) {
    for (const ped of this.list) {
      if (ped.dead) continue;
      let tx;
      let tz;
      let speed = ped.speed;
      if (now < ped.fleeUntil && ped.fleeFrom) {
        // Run directly away from the threat.
        const dx = ped.x - ped.fleeFrom.x;
        const dz = ped.z - ped.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = ped.x + (dx / d) * 10;
        tz = ped.z + (dz / d) * 10;
        speed = 5.5;
      } else {
        tx = ped.target.x;
        tz = ped.target.z;
        if (Math.hypot(tx - ped.x, tz - ped.z) < 1.5) {
          ped.target = world.randomSidewalkPoint(this.rng);
          continue;
        }
      }
      const dx = tx - ped.x;
      const dz = tz - ped.z;
      const d = Math.hypot(dx, dz) || 1;
      ped.heading = Math.atan2(-dz, dx);
      ped.x += (dx / d) * speed * dt;
      ped.z += (dz / d) * speed * dt;
      const hit = world.collideCircle(ped.x, ped.z, 0.4);
      ped.x = hit.x;
      ped.z = hit.z;
      ped.walkPhase += dt * speed * 3;
      ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.05, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
  }

  /** Damage a pedestrian at a point (melee/gunshot); returns the ped or null. */
  hitAt(x, z, radius, damage) {
    for (const ped of this.list) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - x, ped.z - z) < radius) {
        ped.health -= damage;
        if (ped.health <= 0) {
          ped.dead = true;
          ped.mesh.visible = false;
          return { ped, killed: true };
        }
        return { ped, killed: false };
      }
    }
    return null;
  }
}
