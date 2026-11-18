// Car models and arcade driving physics. Every car is a group of boxes
// (body, cabin, wheels, lights) so models stay cheap and readable.
import * as THREE from 'three';
import { CARS } from './config.js';

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
const tireMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2c3c });
const lightFrontMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0x887755 });
const lightRearMat = new THREE.MeshLambertMaterial({ color: 0xc02020, emissive: 0x550000 });
const bumperMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

/** Build the mesh for a car of `model` in `color`. Returns the group. */
export function makeCarMesh(model, color) {
  const def = CARS[model];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const L = def.len;
  const W = def.wid;
  const body = box(L, 0.62, W, bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabinH = model === 'van' ? 0.95 : 0.55;
  const cabinL = model === 'van' ? L * 0.72 : L * 0.48;
  const cabin = box(cabinL, cabinH, W * 0.86, model === 'van' ? bodyMat : glassMat);
  cabin.position.set(model === 'van' ? -0.2 : -L * 0.06, 0.86 + cabinH / 2 - 0.28, 0);
  g.add(cabin);
  if (model === 'pickup') {
    const bed = box(L * 0.34, 0.42, W * 0.9, bodyMat);
    bed.position.set(-L * 0.28, 0.95, 0);
    g.add(bed);
  }
  if (model === 'taxi') {
    const sign = box(0.7, 0.22, 0.5, new THREE.MeshLambertMaterial({ color: 0xf2b705, emissive: 0x664400 }));
    sign.position.set(0, 1.5, 0);
    g.add(sign);
  }
  if (model === 'police') {
    const bar = box(0.5, 0.16, 1.1, new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(-0.1, 1.42, 0);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xaa0000 }));
    red.position.set(-0.1, 1.56, -0.28);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0x2040ff, emissive: 0x0000aa }));
    blue.position.set(-0.1, 1.56, 0.28);
    g.add(blue);
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
  }
  // Headlights / taillights.
  for (const side of [-1, 1]) {
    const hf = box(0.08, 0.16, 0.34, lightFrontMat);
    hf.position.set(L / 2, 0.62, side * (W / 2 - 0.35));
    g.add(hf);
    const hr = box(0.08, 0.16, 0.34, lightRearMat);
    hr.position.set(-L / 2, 0.62, side * (W / 2 - 0.35));
    g.add(hr);
  }
  const fb = box(0.18, 0.2, W, bumperMat);
  fb.position.set(L / 2, 0.34, 0);
  g.add(fb);
  const rb = box(0.18, 0.2, W, bumperMat);
  rb.position.set(-L / 2, 0.34, 0);
  g.add(rb);
  // Wheels.
  const wheels = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, tireMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(sx * (L / 2 - 0.75), 0.36, sz * (W / 2 - 0.05));
      w.castShadow = true;
      g.add(w);
      wheels.push(w);
    }
  }
  g.userData.wheels = wheels;
  g.userData.bodyMat = bodyMat;
  return g;
}

export class Car {
  constructor(scene, model, color, x, z, heading) {
    this.model = model;
    this.def = CARS[model];
    this.color = color;
    this.mesh = makeCarMesh(model, color);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.smoke = 0; // seconds of smoke emission left
    this.isPlayer = false;
    this.isPolice = model === 'police';
    this.dead = false;
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  /** Arcade drive step. throttle -1..1, steer -1..1, handbrake bool. */
  drive(throttle, steer, handbrake, dt, world) {
    const def = this.def;
    const maxSteer = 0.55 * (1 - Math.min(0.6, Math.abs(this.speed) / def.top * 0.6));
    const targetSteer = steer * maxSteer;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (throttle > 0) this.speed += def.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed += def.brake * throttle * dt;
      else this.speed += def.accel * 0.55 * throttle * dt; // reverse
    }
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
    // Drag + rolling resistance.
    this.speed -= this.speed * 0.35 * dt;
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    this.speed = Math.max(-9, Math.min(def.top, this.speed));
    const grip = handbrake ? def.grip * 0.45 : def.grip;
    this.heading += this.steer * (this.speed / def.top) * grip * dt * (this.speed < 0 ? -1 : 1);
    const fx = Math.cos(this.heading);
    const fz = -Math.sin(this.heading);
    let nx = this.x + fx * this.speed * dt;
    let nz = this.z + fz * this.speed * dt;
    const hit = world.collideCircle(nx, nz, def.len * 0.42);
    if (hit.hit) {
      if (Math.abs(this.speed) > 8) {
        this.health -= Math.abs(this.speed) * 0.35;
        this.smoke = Math.max(this.smoke, 0.5);
      }
      this.speed *= 0.45;
    }
    this.x = hit.x;
    this.z = hit.z;
    this.syncMesh(dt);
    return hit.hit;
  }

  /** Steer toward a point; returns true when close to it. */
  driveToward(tx, tz, desiredSpeed, dt, world) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dz, dx);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    const throttle = this.speed < desiredSpeed ? 1 : 0.2;
    this.drive(throttle, steer, false, dt, world);
    return dist < 3;
  }

  damage(amount) {
    this.health -= amount;
    if (this.health < 40) this.smoke = Math.max(this.smoke, 0.8);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed / 0.36) * dt;
    for (const w of this.mesh.userData.wheels) w.rotation.y += spin;
    // Police lightbar flash.
    if (this.isPolice) {
      const phase = Math.floor(performance.now() / 280) % 2 === 0;
      const red = this.mesh.userData.lightRed;
      const blue = this.mesh.userData.lightBlue;
      if (red && blue) {
        red.material.emissive.setHex(phase ? 0xff0000 : 0x220000);
        blue.material.emissive.setHex(phase ? 0x220000 : 0x0000ff);
      }
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }
}
