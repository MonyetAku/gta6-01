// Live minimap: streets, blocks, beach and water painted from the ground
// canvas, with the player arrow, police dots, traffic dots and the mission
// marker on top. North is up.
import { CITY } from './config.js';

const WORLD_MIN = -CITY.HALF - 12;
const WORLD_MAX = CITY.WATER_X + 120;

export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.size = canvas.width;
  }

  toMap(x, z) {
    const s = this.size / (WORLD_MAX - WORLD_MIN);
    return { x: (x - WORLD_MIN) * s, y: (z - WORLD_MIN) * s };
  }

  draw(state) {
    const ctx = this.ctx;
    const S = this.size;
    ctx.clearRect(0, 0, S, S);
    // Paint the ground canvas scaled down (roads, beach, water).
    ctx.drawImage(this.world.groundCanvas, 0, 0, S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, S, S);
    // Mission marker.
    if (state.missionTarget) {
      const p = this.toMap(state.missionTarget.x, state.missionTarget.z);
      const pulse = 5 + Math.sin(state.now * 4) * 1.5;
      ctx.fillStyle = '#f2d06a';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - pulse - 3);
      ctx.lineTo(p.x + pulse * 0.7, p.y + pulse * 0.5);
      ctx.lineTo(p.x - pulse * 0.7, p.y + pulse * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7a5c00';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Traffic (white dots).
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const c of state.traffic || []) {
      const p = this.toMap(c.x, c.z);
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    // Police (red dots with a ring).
    for (const u of state.police || []) {
      const p = this.toMap(u.x, u.z);
      ctx.fillStyle = '#ff3030';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Player arrow (green, pointing along heading).
    const pp = this.toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(-state.player.heading + Math.PI / 2);
    ctx.fillStyle = '#58c96b';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', 6, 13);
    // Border.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
  }
}
