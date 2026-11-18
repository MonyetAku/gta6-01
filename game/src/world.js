// Solmarina city generation: a seeded grid city on a painted ground canvas,
// box buildings with lit windows, palms, streetlights, a beach and an ocean.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { Rng } from './random.js';

const TEX = 2048; // ground canvas resolution (px)
const WORLD_W = 760; // world units covered by the canvas on X (-360..+400)
const WORLD_D = 720; // world units covered on Z (-360..+360)
const ORIGIN_X = -360;
const ORIGIN_Z = -360;

function toPx(x) {
  return ((x - ORIGIN_X) / WORLD_W) * TEX;
}
function toPz(z) {
  return ((z - ORIGIN_Z) / WORLD_D) * TEX;
}

function makeWindowTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 22) {
    for (let x = 10; x < 118; x += 22) {
      g.fillStyle = Math.random() < 0.35 ? lit : 'rgba(20,30,44,0.85)';
      g.fillRect(x, y, 14, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintGround(rng) {
  const c = document.createElement('canvas');
  c.width = TEX;
  c.height = TEX;
  const g = c.getContext('2d');
  // Base: warm concrete.
  g.fillStyle = '#b9b3a4';
  g.fillRect(0, 0, TEX, TEX);
  // Beach + ocean on the east edge.
  g.fillStyle = '#e8d49a';
  g.fillRect(toPx(CITY.BEACH_X), 0, toPx(CITY.WATER_X) - toPx(CITY.BEACH_X), TEX);
  g.fillStyle = '#1e7fa8';
  g.fillRect(toPx(CITY.WATER_X), 0, TEX - toPx(CITY.WATER_X), TEX);
  for (let i = 0; i < 90; i += 1) {
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 2;
    const y = rng.range(0, TEX);
    g.beginPath();
    g.moveTo(toPx(CITY.WATER_X) + rng.range(0, 60), y);
    g.lineTo(toPx(CITY.WATER_X) + rng.range(80, 220), y + rng.range(-8, 8));
    g.stroke();
  }
  // Boardwalk strip along the beach.
  g.fillStyle = '#c9a86a';
  g.fillRect(toPx(CITY.BEACH_X - 4), 0, toPx(CITY.BEACH_X) - toPx(CITY.BEACH_X - 4), TEX);
  // City blocks: slightly varied pavement.
  const streetAt = (i) => -CITY.HALF + i * CITY.PITCH;
  for (let bi = 0; bi < CITY.BLOCKS; bi += 1) {
    for (let bj = 0; bj < CITY.BLOCKS; bj += 1) {
      const x0 = streetAt(bi) + CITY.ROAD / 2;
      const z0 = streetAt(bj) + CITY.ROAD / 2;
      const shade = rng.int(-8, 8);
      g.fillStyle = `rgb(${185 + shade},${179 + shade},${164 + shade})`;
      g.fillRect(toPx(x0), toPz(z0), toPx(x0 + CITY.BLOCK) - toPx(x0), toPz(z0 + CITY.BLOCK) - toPz(z0));
    }
  }
  // Roads: asphalt strips along every street line.
  g.fillStyle = '#3a3f46';
  for (let i = 0; i <= CITY.BLOCKS; i += 1) {
    const s = streetAt(i);
    g.fillRect(toPx(s - CITY.ROAD / 2), 0, toPx(s + CITY.ROAD / 2) - toPx(s - CITY.ROAD / 2), TEX);
    g.fillRect(0, toPz(s - CITY.ROAD / 2), TEX, toPz(s + CITY.ROAD / 2) - toPz(s - CITY.ROAD / 2));
  }
  // Lane dashes down the middle of every street.
  g.fillStyle = '#f2d06a';
  for (let i = 0; i <= CITY.BLOCKS; i += 1) {
    const s = streetAt(i);
    for (let d = -CITY.HALF; d < CITY.HALF; d += 24) {
      g.fillRect(toPx(s) - 2, toPz(d), 4, 14);
      g.fillRect(toPx(d), toPz(s) - 2, 14, 4);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(240,240,240,0.85)';
  for (let i = 0; i <= CITY.BLOCKS; i += 1) {
    for (let j = 0; j <= CITY.BLOCKS; j += 1) {
      const sx = streetAt(i);
      const sz = streetAt(j);
      for (let k = -2; k <= 2; k += 1) {
        g.fillRect(toPx(sx + k * 3) - 1.5, toPz(sz - CITY.ROAD / 2 + 1), 3, 5);
        g.fillRect(toPx(sx + k * 3) - 1.5, toPz(sz + CITY.ROAD / 2 - 6), 3, 5);
        g.fillRect(toPx(sx - CITY.ROAD / 2 + 1), toPz(sz + k * 3) - 1.5, 5, 3);
        g.fillRect(toPx(sx + CITY.ROAD / 2 - 6), toPz(sz + k * 3) - 1.5, 5, 3);
      }
    }
  }
  return c;
}

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = new Rng(seed);
    this.buildings = []; // {minX,maxX,minZ,maxZ,h}
    this.group = new THREE.Group();
    scene.add(this.group);
    this.streetLines = [];
    for (let i = 0; i <= CITY.BLOCKS; i += 1) this.streetLines.push(-CITY.HALF + i * CITY.PITCH);
    this.buildGround();
    this.buildBuildings();
    this.buildProps();
    this.buildOcean();
  }

  buildGround() {
    const canvas = paintGround(this.rng);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_D);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(ORIGIN_X + WORLD_W / 2, 0, 0);
    ground.receiveShadow = true;
    this.group.add(ground);
    this.groundCanvas = canvas;
  }

  buildBuildings() {
    const rng = this.rng;
    const winTex = [
      makeWindowTexture('#f2e3c6', '#ffe9a8'),
      makeWindowTexture('#e8b4a0', '#ffe9a8'),
      makeWindowTexture('#c6d9e8', '#bfe8ff'),
      makeWindowTexture('#f6d9a0', '#ffe9a8'),
    ];
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofGeo = new THREE.BoxGeometry(1, 0.6, 1);
    const parkBlock = { i: 3, j: 4 }; // central park block
    for (let bi = 0; bi < CITY.BLOCKS; bi += 1) {
      for (let bj = 0; bj < CITY.BLOCKS; bj += 1) {
        const bx0 = -CITY.HALF + bi * CITY.PITCH + CITY.ROAD / 2;
        const bz0 = -CITY.HALF + bj * CITY.PITCH + CITY.ROAD / 2;
        if (bi === parkBlock.i && bj === parkBlock.j) {
          this.buildPark(bx0, bz0);
          continue;
        }
        const distC = Math.hypot(bx0 + CITY.BLOCK / 2, bz0 + CITY.BLOCK / 2) / CITY.HALF;
        for (let px = 0; px < 2; px += 1) {
          for (let pz = 0; pz < 2; pz += 1) {
            if (rng.chance(0.18)) continue; // empty lot
            const w = rng.range(16, 24);
            const d = rng.range(16, 24);
            const h = Math.max(7, rng.range(9, 34) * (1.25 - distC * 0.55));
            const x = bx0 + 4 + px * (CITY.BLOCK / 2) + w / 2 + rng.range(-1, 3);
            const z = bz0 + 4 + pz * (CITY.BLOCK / 2) + d / 2 + rng.range(-1, 3);
            const mat = new THREE.MeshLambertMaterial({ map: winTex[rng.int(0, winTex.length - 1)] });
            const mesh = new THREE.Mesh(boxGeo, mat);
            mesh.scale.set(w, h, d);
            mesh.position.set(x, h / 2, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.group.add(mesh);
            const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: rng.pick(PALETTE.roof) }));
            roof.scale.set(w + 0.6, 1, d + 0.6);
            roof.position.set(x, h + 0.3, z);
            this.group.add(roof);
            this.buildings.push({ minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4, minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4, h });
          }
        }
      }
    }
  }

  buildPark(bx0, bz0) {
    const rng = this.rng;
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.BLOCK, CITY.BLOCK),
      new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(bx0 + CITY.BLOCK / 2, 0.06, bz0 + CITY.BLOCK / 2);
    lawn.receiveShadow = true;
    this.group.add(lawn);
    for (let i = 0; i < 10; i += 1) {
      const x = bx0 + rng.range(6, CITY.BLOCK - 6);
      const z = bz0 + rng.range(6, CITY.BLOCK - 6);
      this.addPalm(x, z, rng.range(0.8, 1.3));
    }
  }

  addPalm(x, z, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18 * scale, 0.3 * scale, 5 * scale, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a6a42 }),
    );
    trunk.position.y = 2.5 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8a3a });
    for (let i = 0; i < 5; i += 1) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9 * scale, 2.6 * scale, 4), frondMat);
      const a = (i / 5) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.1 * scale, 5.1 * scale, Math.sin(a) * 1.1 * scale);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      frond.castShadow = true;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    this.group.add(g);
  }

  buildProps() {
    const rng = this.rng;
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
    const bulbMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x887733 });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 6);
    const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
    for (let i = 0; i <= CITY.BLOCKS; i += 1) {
      for (let j = 0; j <= CITY.BLOCKS; j += 1) {
        if (rng.chance(0.45)) continue;
        const x = this.streetLines[i] + (rng.chance(0.5) ? 1 : -1) * (CITY.ROAD / 2 - 1);
        const z = this.streetLines[j] + (rng.chance(0.5) ? 1 : -1) * (CITY.ROAD / 2 - 1);
        const pole = new THREE.Mesh(poleGeo, lampMat);
        pole.position.set(x, 3, z);
        this.group.add(pole);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(x, 6.1, z);
        this.group.add(bulb);
      }
    }
    // Palms along the beach boardwalk and a few downtown corners.
    for (let z = -CITY.HALF; z <= CITY.HALF; z += 36) {
      this.addPalm(CITY.BEACH_X + 4, z + this.rng.range(-6, 6), 1.1);
    }
    for (let i = 0; i < 14; i += 1) {
      const bi = rng.int(0, CITY.BLOCKS - 1);
      const bj = rng.int(0, CITY.BLOCKS - 1);
      const bx0 = -CITY.HALF + bi * CITY.PITCH + CITY.ROAD / 2;
      const bz0 = -CITY.HALF + bj * CITY.PITCH + CITY.ROAD / 2;
      this.addPalm(bx0 + rng.range(4, CITY.BLOCK - 4), bz0 + rng.range(2, 5), rng.range(0.8, 1.2));
    }
  }

  buildOcean() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(240, WORLD_D),
      new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(CITY.WATER_X + 120, -0.25, 0);
    this.group.add(water);
    this.water = water;
  }

  /** Push a circle (x, z, radius) out of every building it overlaps. */
  collideCircle(x, z, r) {
    let hit = false;
    for (let i = 0; i < this.buildings.length; i += 1) {
      const b = this.buildings[i];
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          const pl = x - b.minX;
          const pr = b.maxX - x;
          const pt = z - b.minZ;
          const pb = b.maxZ - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.minX - r;
          else if (m === pr) x = b.maxX + r;
          else if (m === pt) z = b.minZ - r;
          else z = b.maxZ + r;
        }
      }
    }
    // City bounds (beach walkable to the water's edge).
    if (x < -CITY.HALF - 12) { x = -CITY.HALF - 12; hit = true; }
    if (x > CITY.WATER_X - 2) { x = CITY.WATER_X - 2; hit = true; }
    if (z < -CITY.HALF - 12) { z = -CITY.HALF - 12; hit = true; }
    if (z > CITY.HALF + 12) { z = CITY.HALF + 12; hit = true; }
    return { x, z, hit };
  }

  /** A random point on a street centreline. */
  randomStreetPoint(rng) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(this.streetLines);
    const along = rng.range(-CITY.HALF + 20, CITY.HALF - 20);
    return vertical ? { x: line, z: along } : { x: along, z: line };
  }

  /** A random point on a sidewalk (just off a street). */
  randomSidewalkPoint(rng) {
    const p = this.randomStreetPoint(rng);
    const off = (CITY.ROAD / 2 + 2) * (rng.chance(0.5) ? 1 : -1);
    if (rng.chance(0.5)) p.x += off;
    else p.z += off;
    return p;
  }
}
