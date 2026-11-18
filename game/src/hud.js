// HUD: the DOM overlay — wanted stars, cash, health, speed, ammo,
// objective banner, clock, toasts, title and pause screens.
export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['stars', 'cash', 'health-fill', 'health-num', 'speed', 'speed-unit', 'ammo', 'objective', 'clock', 'toast', 'title-screen', 'pause-screen', 'over-screen', 'mission-list', 'over-title', 'over-text', 'save-note']) {
      this.el[id] = document.getElementById(id);
    }
    this.toastTimer = 0;
  }

  showStars(n) {
    const filled = '★'.repeat(n);
    const empty = '☆'.repeat(Math.max(0, 5 - n));
    this.el.stars.textContent = filled + empty;
    this.el.stars.style.color = n >= 3 ? '#ff4040' : '#ffd94a';
  }

  showCash(cash) {
    this.el.cash.textContent = `$${cash.toLocaleString('en-US')}`;
  }

  showHealth(hp) {
    const pct = Math.max(0, Math.min(100, hp));
    this.el['health-fill'].style.width = `${pct}%`;
    this.el['health-fill'].style.background = pct > 50 ? '#58c96b' : pct > 25 ? '#f2b705' : '#e84a5f';
    this.el['health-num'].textContent = `${Math.ceil(pct)}`;
  }

  showSpeed(kmh, driving) {
    this.el.speed.textContent = driving ? String(Math.round(kmh)) : '—';
    this.el['speed-unit'].textContent = driving ? 'km/h' : '';
  }

  showAmmo(ammo, reserve, reloading) {
    this.el.ammo.textContent = reloading ? 'RELOADING…' : `${ammo} / ${reserve}`;
  }

  showObjective(text) {
    this.el.objective.textContent = text;
  }

  showClock(hour, minute) {
    const h = String(hour).padStart(2, '0');
    const m = String(minute).padStart(2, '0');
    this.el.clock.textContent = `${h}:${m}`;
  }

  toast(text, seconds = 3) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = seconds;
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
  }

  showScreen(name) {
    for (const [key, el] of Object.entries(this.el)) {
      if (key.endsWith('-screen')) el.style.display = 'none';
    }
    if (name) {
      const el = this.el[`${name}-screen`];
      if (el) el.style.display = 'flex';
    }
  }

  setMissionList(missions) {
    this.el['mission-list'].innerHTML = missions
      .map((m, i) => `<div class="mission-row${m.done ? ' done' : ''}${i === missions.index ? ' current' : ''}">${m.done ? '✓' : `${m.id}.`} ${m.name} — $${m.reward}</div>`)
      .join('');
  }

  setOver(title, text) {
    this.el['over-title'].textContent = title;
    this.el['over-text'].textContent = text;
  }

  setSaveNote(text) {
    this.el['save-note'].textContent = text;
  }
}
