// The story: Rio Vega, driver-for-hire in Solmarina, pulled into the
// underworld by five jobs. Each mission is a chain of steps (drive to a
// marker, steal a car, lose the heat, deliver a package) with a cash reward.
import * as THREE from 'three';
import { MISSION_REWARDS } from './config.js';

const BEACON_COLOR = 0xf2d06a;

function missionDefs(world, rng) {
  // Fixed, memorable spots, all on streets or open ground (never inside a
  // building): garage, marina, plaza, beach, docks.
  const garage = { x: -216, z: -252, label: 'Garage' };
  const marina = { x: 288, z: -180, label: 'Marina' };
  const plaza = { x: -36, z: 0, label: 'Plaza' };
  const beach = { x: 300, z: 180, label: 'Beach' };
  const docks = { x: -216, z: 252, label: 'Docks' };
  return [
    {
      id: 1,
      name: 'First Fare',
      briefing: 'A client at the plaza needs a ride to the marina. Drive her there — no scratches.',
      reward: MISSION_REWARDS[0],
      steps: [
        { kind: 'goto', x: plaza.x, z: plaza.z, label: 'Pick up the client at the Plaza' },
        { kind: 'goto', x: marina.x, z: marina.z, label: 'Drive the client to the Marina', needsCar: true },
      ],
    },
    {
      id: 2,
      name: 'Hot Wheels',
      briefing: 'Marco wants a Vortex GT. Steal the sports car parked by the beach and bring it to the garage.',
      reward: MISSION_REWARDS[1],
      steps: [
        { kind: 'steal', model: 'sports', x: beach.x, z: beach.z, label: 'Steal the Vortex GT at the Beach' },
        { kind: 'goto', x: garage.x, z: garage.z, label: 'Deliver the Vortex GT to the Garage', needsCar: true },
      ],
    },
    {
      id: 3,
      name: 'Getaway',
      briefing: 'The PD is on you — three stars. Lose them. Lay low, break line of sight, stay out of trouble.',
      reward: MISSION_REWARDS[2],
      steps: [
        { kind: 'lose', label: 'Lose the 3-star wanted level' },
      ],
    },
    {
      id: 4,
      name: 'The Drop',
      briefing: 'A package for the docks. The PD is tailing you the whole way — and rivals are waiting there.',
      reward: MISSION_REWARDS[3],
      steps: [
        { kind: 'goto', x: plaza.x, z: plaza.z, label: 'Pick up the package at the Plaza' },
        { kind: 'goto', x: docks.x, z: docks.z, label: 'Deliver the package to the Docks', rivals: 2 },
      ],
    },
    {
      id: 5,
      name: 'King of Solmarina',
      briefing: 'The last job: three checkpoints across the city, then the final drop at the marina — with the whole PD behind you.',
      reward: MISSION_REWARDS[4],
      steps: [
        { kind: 'goto', x: -216, z: 180, label: 'Checkpoint 1: West Market' },
        { kind: 'goto', x: 180, z: -216, label: 'Checkpoint 2: North Gate' },
        { kind: 'goto', x: 0, z: 252, label: 'Checkpoint 3: South Plaza' },
        { kind: 'goto', x: marina.x, z: marina.z, label: 'Final delivery at the Marina', rivals: 3 },
      ],
    },
  ];
}

export class Missions {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.defs = missionDefs(world, rng);
    this.index = 0;
    this.step = 0;
    this.active = false;
    this.done = false;
    this.beacon = null;
    this.arrow = null;
    this.onEvent = null; // (type, data) => void — set by the game
    this.buildMarker();
  }

  buildMarker() {
    const geo = new THREE.CylinderGeometry(2.6, 2.6, 26, 20, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: BEACON_COLOR, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3, 24),
      new THREE.MeshBasicMaterial({ color: BEACON_COLOR, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    this.beacon.add(ring);
    // Floating waypoint arrow above the player, pointing at the target.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.95, 4),
      new THREE.MeshBasicMaterial({ color: BEACON_COLOR, transparent: true, opacity: 0.85 }),
    );
    cone.rotation.x = Math.PI / 2;
    this.arrow = new THREE.Group();
    this.arrow.add(cone);
    this.arrow.visible = false;
    this.scene.add(this.arrow);
  }

  get current() {
    return this.defs[this.index] || null;
  }
  get currentStep() {
    const m = this.current;
    return m ? m.steps[this.step] : null;
  }

  get objectiveText() {
    if (this.done) return 'All jobs done — Solmarina is yours, Rio.';
    const m = this.current;
    if (!m) return '';
    const s = this.currentStep;
    return `Mission ${m.id}: ${m.name} — ${s ? s.label : ''}`;
  }

  start(index = 0) {
    this.index = index;
    this.step = 0;
    this.active = true;
    this.done = false;
    this.enterStep();
  }

  enterStep() {
    const step = this.currentStep;
    if (!step) {
      this.completeMission();
      return;
    }
    if (step.kind === 'lose') {
      this.beacon.visible = false;
      this.arrow.visible = false;
      if (this.onEvent) this.onEvent('wanted', { stars: 3 });
    } else if (step.kind === 'steal') {
      this.beacon.visible = true;
      this.beacon.position.set(step.x, 13, step.z);
      this.arrow.visible = true;
      if (this.onEvent) this.onEvent('stealTarget', { model: step.model, x: step.x, z: step.z });
    } else {
      this.beacon.visible = true;
      this.beacon.position.set(step.x, 13, step.z);
      this.arrow.visible = true;
      if (step.rivals && this.onEvent) this.onEvent('rivals', { count: step.rivals, x: step.x, z: step.z });
    }
  }

  /** Advance one step; returns the reward when a mission completes. */
  advance() {
    const m = this.current;
    if (!m) return 0;
    this.step += 1;
    if (this.step >= m.steps.length) {
      const reward = m.reward;
      if (this.onEvent) this.onEvent('missionComplete', { mission: m, reward });
      this.index += 1;
      this.step = 0;
      if (this.index >= this.defs.length) {
        this.done = true;
        this.active = false;
        this.beacon.visible = false;
        this.arrow.visible = false;
        return reward;
      }
      this.enterStep();
      return reward;
    }
    this.enterStep();
    return 0;
  }

  completeMission() {
    this.advance();
  }

  /** Called every frame: returns the active target point for the HUD/minimap. */
  targetPoint() {
    const step = this.currentStep;
    if (!step || step.kind === 'lose') return null;
    return { x: step.x, z: step.z };
  }

  update(dt, px, pz, inCar, carModel, now) {
    if (!this.active || this.done) return 0;
    const step = this.currentStep;
    if (!step) return 0;
    // Beacon pulse.
    if (this.beacon.visible) {
      this.beacon.material.opacity = 0.22 + 0.1 * Math.sin(now * 3);
      this.beacon.rotation.y += dt * 0.8;
    }
    if (step.kind === 'lose') {
      return 0; // the game completes this step when stars hit 0
    }
    if (step.kind === 'steal') {
      if (inCar && carModel === step.model) return this.advance();
      return 0;
    }
    // goto steps: within the radius, and in a car when the step needs one.
    const d = Math.hypot(px - step.x, pz - step.z);
    const radius = 7;
    if (d < radius && (!step.needsCar || inCar)) return this.advance();
    return 0;
  }

  /** Point the floating arrow at the target from the player position. */
  updateArrow(px, pz, py) {
    const target = this.targetPoint();
    if (!target || !this.arrow.visible) {
      this.arrow.visible = false;
      return;
    }
    this.arrow.visible = true;
    this.arrow.position.set(px, py + 3.4, pz);
    // The cone points along local +Z; rotate it to face the target.
    this.arrow.rotation.y = Math.atan2(target.x - px, target.z - pz);
    this.arrow.children[0].position.x = 0;
  }
}
