// Keyboard + mouse input. The game reads this every frame; the screenshot
// autopilot writes into the same shape so staged shots drive the real rules.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    // Scripted input (used by ?shot= staging): { forward, back, left, right,
    // handbrake, jump, run } all 0/1, overrides the keyboard when set.
    this.script = null;
    this._seen = new Set();
    this._onKeyDown = (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => this.keys.clear();
    this._onMouseDown = (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    this._onMouseMove = (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.clientX - this.lastX;
      this.mouseDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    this._onMouseUp = () => {
      this.mouseDown = false;
      this.dragging = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  down(code) {
    return this.keys.has(code);
  }
  /** -1/0/1 forward axis (W/S or arrows). */
  forwardAxis() {
    if (this.script) return this.script.forward - this.script.back;
    let v = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) v += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) v -= 1;
    return v;
  }
  /** -1/0/1 strafe/steer axis (A/D or arrows). */
  strafeAxis() {
    if (this.script) return this.script.right - this.script.left;
    let v = 0;
    if (this.down('KeyD') || this.down('ArrowRight')) v += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) v -= 1;
    return v;
  }
  get run() {
    return this.script ? !!this.script.run : this.down('ShiftLeft') || this.down('ShiftRight');
  }
  get jump() {
    return this.script ? !!this.script.jump : this.down('Space');
  }
  get handbrake() {
    return this.script ? !!this.script.handbrake : this.down('Space');
  }
  /** Mouse drag delta since last frame; resets each read. */
  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }
  /** True once per physical press of a key (edge trigger). */
  pressed(code) {
    if (!this.down(code)) {
      this._seen.delete(code);
      return false;
    }
    if (this._seen.has(code)) return false;
    this._seen.add(code);
    return true;
  }
  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
  }
}
