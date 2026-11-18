// Solmarina boot and game loop: third-person on-foot play and arcade
// driving in one city, with wanted, missions, combat and a live HUD.
// ?seed=N fixes the city. ?shot=chase|street|drive|mission stages a scene
// instead of running the loop, renders it and sets window.__shotReady.
import * as THREE from 'three';
import { SEED, CITY, PLAYER, CLOCK } from './config.js';
import { Rng } from './random.js';
import { Input } from './input.js';
import { World } from './world.js';
import { Car } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat, Particles } from './combat.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { AudioEngine } from './audio.js';
import { loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e86ab });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.3), pants);
  legs.position.y = 0.4;
  legs.castShadow = true;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.36), jacket);
  torso.position.y = 1.16;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
  head.position.y = 1.74;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.52), new THREE.MeshLambertMaterial({ color: 0xe82e5a }));
  cap.position.y = 1.94;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), new THREE.MeshLambertMaterial({ color: 0xe82e5a }));
  brim.position.set(0, 1.9, 0.3);
  g.add(brim);
  return g;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.rng = new Rng(SEED);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ec9e8);
    this.scene.fog = new THREE.Fog(0xa8d0e6, 200, 760);
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 1200);
    this.ambient = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5c, 0.85);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -95;
    this.sun.shadow.camera.right = 95;
    this.sun.shadow.camera.top = 95;
    this.sun.shadow.camera.bottom = -95;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 320;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.world = new World(this.scene, SEED);
    this.traffic = new Traffic(this.scene, this.world, this.rng, 13);
    this.peds = new Pedestrians(this.scene, this.world, this.rng, 26);
    this.police = new Police(this.scene, this.world, this.rng);
    this.missions = new Missions(this.scene, this.world, this.rng);
    this.particles = new Particles(this.scene);
    this.combat = new Combat(this.scene, this.particles);
    this.hud = new Hud();
    this.minimap = new Minimap(document.getElementById('minimap'), this.world);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);

    this.state = 'title'; // title | play | pause | over
    this.elapsed = 0;
    this.now = 0;
    this.cash = 0;
    this.player = {
      x: 30, z: 30, y: 0, vy: 0, heading: Math.PI * 0.75, health: PLAYER.health,
      onGround: true, mesh: makePlayerMesh(), walkPhase: 0,
    };
    this.scene.add(this.player.mesh);
    this.playerCar = null;
    this.cameraYaw = Math.PI * 0.75;
    this.cameraPitch = 0.32;
    this.cameraDist = 9;
    this.cameraFixed = false;
    this.shake = 0;
    this.bustTimer = 0;
    this.hitCarCooldown = 0;
    this.ramCooldown = 0; // police ram damage ticks at most once per 0.8 s
    this.saveTimer = 0;
    this.prevMouseDown = false;
    this.shotMode = false;
    this.missions.onEvent = (type, data) => this.onMissionEvent(type, data);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onMissionEvent(type, data) {
    if (type === 'wanted') {
      this.police.setStars(data.stars, this.now);
      this.hud.toast(`Wanted level ${data.stars} stars — lose them!`);
    } else if (type === 'stealTarget') {
      // Make sure a sports car is parked near the target.
      let found = null;
      for (const car of this.traffic.parked) {
        if (car.model === data.model && Math.hypot(car.x - data.x, car.z - data.z) < 45) found = car;
      }
      if (!found) {
        const car = new Car(this.scene, 'sports', 0xe82e5a, data.x + 6, data.z, Math.PI / 2);
        this.traffic.parked.push(car);
      }
    } else if (type === 'rivals') {
      this.combat.spawnRivals(data.x, data.z, data.count, this.rng);
      this.hud.toast('Rivals ahead — watch your back!');
    } else if (type === 'missionComplete') {
      this.cash += data.reward;
      this.audio.chime();
      this.hud.toast(`Mission complete: ${data.mission.name} — +$${data.reward}`);
      this.saveGame();
    }
  }

  start(fromSave) {
    this.audio.ensure();
    document.getElementById('hud').classList.add('on');
    const save = fromSave ? loadSave() : null;
    this.cash = save && typeof save.cash === 'number' ? save.cash : 0;
    const missionIndex = save && typeof save.missionIndex === 'number' ? Math.min(save.missionIndex, 4) : 0;
    if (save && typeof save.x === 'number' && typeof save.z === 'number') {
      this.player.x = save.x;
      this.player.z = save.z;
    }
    this.state = 'play';
    this.hud.showScreen(null);
    this.hud.setMissionList(this.missions.defs.map((m, i) => ({ ...m, done: i < missionIndex, index: i })));
    this.missions.start(missionIndex);
    this.hud.toast('Rio Vega — welcome to Solmarina. First job: the Plaza.');
    this.hud.setSaveNote(fromSave ? 'Save loaded.' : 'New game — progress saves automatically.');
  }

  saveGame() {
    writeSave({
      cash: this.cash,
      missionIndex: this.missions.done ? 5 : this.missions.index,
      x: Math.round(this.player.x * 10) / 10,
      z: Math.round(this.player.z * 10) / 10,
    });
  }

  enterCar(car) {
    if (!car) return;
    car._wasParked = this.traffic.parked.includes(car);
    this.traffic.removeParked(car);
    car.isPlayer = true;
    this.playerCar = car;
    this.player.mesh.visible = false;
    this.police.addCrime('steal', this.now);
    this.peds.scare(car.x, car.z, 12, this.now);
    this.hud.toast(`Stole the ${car.def.name} — the PD noticed!`);
    this.audio.thud();
  }

  exitCar() {
    const car = this.playerCar;
    if (!car) return;
    car.isPlayer = false;
    this.playerCar = null;
    // Step out on the driver's side.
    const sx = car.x + Math.sin(car.heading) * 2.2;
    const sz = car.z + Math.cos(car.heading) * 2.2;
    const spot = this.world.collideCircle(sx, sz, PLAYER.radius);
    this.player.x = spot.x;
    this.player.z = spot.z;
    this.player.heading = car.heading;
    this.player.mesh.visible = true;
    if (car._wasParked) this.traffic.parked.push(car);
  }

  damagePlayer(amount) {
    this.player.health -= amount;
    this.shake = Math.max(this.shake, 0.35);
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.gameOver('WASTED', 'Rio is down. The city keeps moving without you.');
    }
  }

  gameOver(title, text) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.hud.setOver(title, text);
    this.hud.showScreen('over');
    this.audio.setEngine(0, false);
  }

  togglePause() {
    if (this.state === 'play') {
      this.state = 'pause';
      this.hud.setMissionList(this.missions.defs.map((m, i) => ({ ...m, done: i < this.missions.index || this.missions.done, index: i })));
      this.hud.showScreen('pause');
    } else if (this.state === 'pause') {
      this.state = 'play';
      this.hud.showScreen(null);
    }
  }

  update(dt) {
    this.now += dt;
    this.elapsed += dt;
    if (this.state === 'title') {
      // Attract mode: traffic and pedestrians keep the city alive.
      this.traffic.update(dt, null, this.peds);
      this.peds.update(dt, this.now, this.world);
      this.cameraYaw += dt * 0.045;
      return;
    }
    if (this.state !== 'play') return;
    const input = this.input;
    const mouse = input.takeMouseDelta();
    if (!this.cameraFixed) {
      this.cameraYaw -= mouse.x * 0.0042;
      this.cameraPitch = Math.max(-0.05, Math.min(0.85, this.cameraPitch + mouse.y * 0.003));
    }
    if (input.pressed('Escape') || input.pressed('KeyP')) this.togglePause();
    if (this.state !== 'play') return;
    if (input.pressed('KeyM')) {
      const muted = this.audio.toggleMute();
      this.hud.toast(muted ? 'Sound off' : 'Sound on');
    }
    if (input.pressed('KeyR')) this.combat.reload();

    const fwd = input.forwardAxis();
    const str = input.strafeAxis();
    if (this.playerCar) {
      const car = this.playerCar;
      const hitWall = car.drive(fwd, -str, input.handbrake, dt, this.world);
      if (hitWall && Math.abs(car.speed) > 6) this.audio.thud();
      // Skid dust + smoke when damaged.
      if (input.handbrake && Math.abs(car.speed) > 8 && Math.random() < 0.5) {
        this.particles.burst(car.x, 0.3, car.z, 2, [0.7, 0.65, 0.55], 1.5, 1);
      }
      if (car.smoke > 0) {
        car.smoke -= dt;
        this.particles.burst(car.x, 1.2, car.z, 1, [0.25, 0.25, 0.25], 0.8, 1.5);
      }
      if (car.dead) {
        this.hud.toast('Your car is wrecked!');
        this.exitCar();
      }
      // Running over pedestrians.
      for (const ped of this.peds.list) {
        if (ped.dead) continue;
        if (Math.hypot(ped.x - car.x, ped.z - car.z) < 1.9 && Math.abs(car.speed) > 3) {
          ped.health = 0;
          ped.dead = true;
          ped.mesh.visible = false;
          this.police.addCrime('hitPed', this.now);
          this.peds.scare(car.x, car.z, 18, this.now);
          this.particles.burst(ped.x, 1, ped.z, 8, [0.6, 0.6, 0.6], 3, 2);
          this.shake = Math.max(this.shake, 0.3);
          car.speed *= 0.7;
        }
      }
      // Ramming traffic.
      if (this.hitCarCooldown > 0) this.hitCarCooldown -= dt;
      for (const other of this.traffic.allCars()) {
        if (other === car || other.dead) continue;
        const d = Math.hypot(other.x - car.x, other.z - car.z);
        if (d < 3.6 && Math.abs(car.speed) > 12 && this.hitCarCooldown <= 0) {
          this.hitCarCooldown = 2;
          this.police.addCrime('hitCar', this.now);
          other.damage(12);
          car.damage(6);
          this.audio.thud();
          this.shake = Math.max(this.shake, 0.3);
          this.particles.burst(other.x, 1, other.z, 6, [1, 0.7, 0.2], 3, 2);
        }
      }
      if (input.pressed('KeyE')) this.exitCar();
    } else {
      // On foot.
      const p = this.player;
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const sin = Math.sin(this.cameraYaw);
      const cos = Math.cos(this.cameraYaw);
      // Camera forward on the ground is (cos yaw, -sin yaw); right is (sin yaw, cos yaw).
      let mx = 0;
      let mz = 0;
      if (fwd !== 0) { mx += cos * fwd; mz += -sin * fwd; }
      if (str !== 0) { mx += sin * str; mz += cos * str; }
      const ml = Math.hypot(mx, mz);
      if (ml > 0.01) {
        mx /= ml;
        mz /= ml;
        p.heading = Math.atan2(mx, mz);
        const nx = p.x + mx * speed * dt;
        const nz = p.z + mz * speed * dt;
        const hit = this.world.collideCircle(nx, nz, PLAYER.radius);
        p.x = hit.x;
        p.z = hit.z;
        p.walkPhase += dt * speed * 1.6;
      }
      // Gravity + jump.
      if (input.jump && p.onGround) {
        p.vy = PLAYER.jumpSpeed;
        p.onGround = false;
      }
      if (!p.onGround) {
        p.vy -= 22 * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) {
          p.y = 0;
          p.vy = 0;
          p.onGround = true;
        }
      }
      p.mesh.position.set(p.x, p.y + Math.abs(Math.sin(p.walkPhase)) * 0.06, p.z);
      p.mesh.rotation.y = p.heading;
      // Enter a car.
      const near = this.traffic.nearestCar(p.x, p.z, 4.2);
      if (near) this.hud.toast('Press E to steal the ' + near.def.name, 0.2);
      if (input.pressed('KeyE') && near) this.enterCar(near);
      // Melee.
      if (input.pressed('KeyF')) {
        const hit = this.combat.melee({ x: p.x, z: p.z }, p.heading, { peds: this.peds.list });
        if (hit) {
          if (hit.kind === 'ped') {
            this.police.addCrime(hit.killed ? 'kill' : 'shoot', this.now);
            this.peds.scare(p.x, p.z, 15, this.now);
          }
          this.audio.thud();
        }
      }
      // Pistol (mouse click).
      const shooting = input.mouseDown && !this.prevMouseDown;
      if (shooting) {
        this.audio.ensure();
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        const from = { x: p.x, y: p.y + 1.5, z: p.z };
        const result = this.combat.shoot(from, dir, { cars: this.traffic.allCars(), peds: this.peds.list });
        if (result) {
          this.audio.gunshot();
          this.police.addCrime('shoot', this.now);
          if (result.kind === 'ped') {
            if (result.killed) this.police.addCrime('kill', this.now);
            this.peds.scare(p.x, p.z, 18, this.now);
          }
          this.shake = Math.max(this.shake, 0.12);
        }
      }
    }
    this.prevMouseDown = input.mouseDown;

    // Police: chase, ram, bust.
    const focusX = this.playerCar ? this.playerCar.x : this.player.x;
    const focusZ = this.playerCar ? this.playerCar.z : this.player.z;
    this.police.update(dt, this.now, focusX, focusZ, this.playerCar, (unit) => {
      if (this.playerCar) {
        // Ram damage ticks at most once per 0.8 s (a unit grinding on the
        // player car must not delete 9 hp every single frame).
        if (this.ramCooldown > 0) return;
        this.ramCooldown = 0.8;
        this.playerCar.damage(9);
        this.audio.thud();
        this.shake = Math.max(this.shake, 0.35);
      } else {
        this.bustTimer += dt;
        if (this.bustTimer > 1.6) {
          this.gameOver('BUSTED', 'The Solmarina PD caught up with Rio.');
        }
      }
    });
    if (this.ramCooldown > 0) this.ramCooldown -= dt;
    if (this.playerCar || this.police.stars === 0) this.bustTimer = 0;

    // Mission: lose-the-heat step completes when the stars hit zero.
    const step = this.missions.currentStep;
    if (this.missions.active && step && step.kind === 'lose' && this.police.stars === 0) {
      this.missions.advance();
      this.hud.toast('You lost them. Clean — for now.');
    }
    // Mission progress (rewards come back through onMissionEvent).
    const reward = this.missions.update(dt, focusX, focusZ, !!this.playerCar, this.playerCar ? this.playerCar.model : null, this.now);
    if (reward) this.cash += 0; // cash is added by the missionComplete event
    this.missions.updateArrow(focusX, focusZ, this.playerCar ? 1.2 : 1.8);

    this.traffic.update(dt, this.playerCar, this.peds);
    this.peds.update(dt, this.now, this.world);
    this.combat.update(dt, this.now, { x: this.player.x, z: this.player.z }, this.player.health, (dmg) => this.damagePlayer(dmg));
    this.particles.update(dt);

    // Health regen after 10 quiet seconds is handled by the slow trickle.
    if (this.player.health < PLAYER.health && this.police.stars === 0) {
      this.player.health = Math.min(PLAYER.health, this.player.health + dt * 2);
    }

    // HUD.
    this.hud.showStars(this.police.stars);
    this.hud.showCash(this.cash);
    this.hud.showHealth(this.player.health);
    this.hud.showSpeed(this.playerCar ? Math.abs(this.playerCar.speed) * 3.6 : 0, !!this.playerCar);
    this.hud.showAmmo(this.combat.ammo, this.combat.reserve, this.combat.reloading > 0);
    this.hud.showObjective(this.missions.objectiveText);
    const hours = CLOCK.startHour + this.elapsed / CLOCK.secondsPerHour;
    this.hud.showClock(Math.floor(hours) % 24, Math.floor((hours % 1) * 60));
    this.hud.update(dt);
    this.minimap.draw({
      player: { x: this.playerCar ? this.playerCar.x : this.player.x, z: this.playerCar ? this.playerCar.z : this.player.z, heading: this.playerCar ? this.playerCar.heading : this.player.heading },
      traffic: this.traffic.cars,
      police: this.police.units,
      missionTarget: this.missions.targetPoint(),
      now: this.now,
    });

    // Audio.
    const speedNorm = this.playerCar ? Math.abs(this.playerCar.speed) / this.playerCar.def.top : 0;
    this.audio.setEngine(speedNorm, !!this.playerCar);
    this.audio.sirenTick(dt, this.police.stars);

    // Autosave.
    this.saveTimer += dt;
    if (this.saveTimer > 12) {
      this.saveTimer = 0;
      if (this.state === 'play') this.saveGame();
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.4);
  }

  updateCamera(dt) {
    const focus = new THREE.Vector3();
    if (this.state === 'title') {
      // Slow establishing orbit over downtown.
      const a = this.cameraYaw;
      focus.set(0, 0, 0);
      this.camera.position.set(Math.cos(a) * 230, 130, Math.sin(a) * 230);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    const inCar = !!this.playerCar;
    const px = inCar ? this.playerCar.x : this.player.x;
    const pz = inCar ? this.playerCar.z : this.player.z;
    const py = inCar ? 1.4 : 1.7;
    // Ease the camera behind the car while driving (look along its heading).
    if (inCar && !this.cameraFixed) {
      this.cameraYaw = angleLerp(this.cameraYaw, this.playerCar.heading, dt * 0.9);
    }
    const dist = this.cameraFixed ? this.cameraDist : (inCar ? 12 + Math.abs(this.playerCar.speed) * 0.09 : 8.5);
    const fx = Math.cos(this.cameraYaw);
    const fz = -Math.sin(this.cameraYaw);
    const height = 2.2 + this.cameraPitch * 9;
    let cx = px - fx * dist;
    let cz = pz - fz * dist;
    // Keep the camera out of buildings: lift it above the roofs nearby.
    let cy = py + height;
    for (const b of this.world.buildings) {
      if (cx > b.minX - 3 && cx < b.maxX + 3 && cz > b.minZ - 3 && cz < b.maxZ + 3) {
        cy = Math.max(cy, b.h + 3);
      }
    }
    if (this.shake > 0) {
      cx += (Math.random() - 0.5) * this.shake * 1.2;
      cy += (Math.random() - 0.5) * this.shake * 1.2;
      cz += (Math.random() - 0.5) * this.shake * 1.2;
    }
    this.camera.position.set(cx, cy, cz);
    focus.set(px + fx * 5, py, pz + fz * 5);
    this.camera.lookAt(focus);
    // The sun follows the player so shadows stay crisp.
    this.sun.position.set(px + 70, 110, pz + 40);
    this.sun.target.position.set(px, 0, pz);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (!this._last) this._last = now;
    let acc = Math.min((now - this._last) / 1000, 0.25);
    this._last = now;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      this.update(STEP);
      acc -= STEP;
      steps += 1;
    }
    this.updateCamera(1 / 60);
    this.render();
  }

  startLoop() {
    requestAnimationFrame((t) => this.frame(t));
  }
}

// ---- Boot: title screen with buttons, or a staged ?shot= scene. ----
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__game = game;

if (shot) {
  // Staged screenshot: run the scene, render it, signal readiness.
  stageShot(shot, game);
  game.hud.showScreen(null);
} else {
  const save = loadSave();
  const continueBtn = document.getElementById('continue-btn');
  if (save) {
    continueBtn.style.display = '';
    game.hud.setSaveNote(`Save found: $${save.cash || 0}, job ${Math.min((save.missionIndex || 0) + 1, 5)} of 5.`);
  }
  document.getElementById('start-btn').addEventListener('click', () => game.start(false));
  continueBtn.addEventListener('click', () => game.start(true));
  document.getElementById('resume-btn').addEventListener('click', () => game.togglePause());
  document.getElementById('restart-btn').addEventListener('click', () => window.location.reload());
  document.getElementById('over-btn').addEventListener('click', () => window.location.reload());
  document.getElementById('status').textContent = 'Solmarina. Press Start to play.';
  game.startLoop();
}
