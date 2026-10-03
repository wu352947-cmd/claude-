// 输入：手机端虚拟摇杆 + 右半屏滑动转视角 + 按钮；电脑端 WASD + 鼠标指针锁定
export class Input {
  constructor(root, opts) {
    this.root = root;
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.run = false; this.runToggle = false;
    this.queue = [];
    this.keys = new Set();
    this.sens = opts.sens || 1;
    this.enabled = false;
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.stick = { id: null, ox: 0, oy: 0 };
    this.lookId = null; this.lx = 0; this.ly = 0;
    this.bindTouch(); this.bindKeys();
  }

  bindTouch() {
    const zone = this.root.querySelector('#touch');
    const base = this.root.querySelector('#stick'), knob = this.root.querySelector('#knob');
    const R = 56;
    zone.addEventListener('pointerdown', e => {
      if (!this.enabled || e.pointerType === 'mouse') return;
      const leftSide = e.clientX < window.innerWidth * 0.42;
      if (leftSide && this.stick.id === null) {
        this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
        base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px';
        base.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)';
      } else if (!leftSide && this.lookId === null) {
        this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY;
      }
      try { zone.setPointerCapture?.(e.pointerId); } catch { }
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId === this.stick.id) {
        let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        this.move.x = dx / R; this.move.y = -dy / R;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        // 摇杆推到底自动奔跑
        this.run = this.runToggle || d > R * 1.25;
      } else if (e.pointerId === this.lookId) {
        this.look.x += (e.clientX - this.lx) * 0.0052 * this.sens;
        this.look.y += (e.clientY - this.ly) * 0.0052 * this.sens;
        this.lx = e.clientX; this.ly = e.clientY;
      }
    });
    const end = e => {
      if (e.pointerId === this.stick.id) {
        this.stick.id = null; this.move.x = this.move.y = 0; base.classList.remove('on'); this.run = this.runToggle;
      }
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

    // 鼠标：点击锁定指针
    zone.addEventListener('mousedown', () => {
      if (this.enabled && !this.touch && document.pointerLockElement !== zone) zone.requestPointerLock?.();
    });
    document.addEventListener('mousemove', e => {
      if (!this.enabled || document.pointerLockElement !== zone) return;
      this.look.x += e.movementX * 0.0022 * this.sens;
      this.look.y += e.movementY * 0.0022 * this.sens;
    });

    const btn = (sel, fn) => {
      const el = this.root.querySelector(sel);
      el.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (this.enabled) fn(el); });
    };
    btn('#btnUse', () => this.queue.push('use'));
    btn('#btnLight', () => this.queue.push('light'));
    btn('#btnRun', el => { this.runToggle = !this.runToggle; this.run = this.runToggle; el.classList.toggle('on', this.runToggle); });
  }

  bindKeys() {
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'KeyE' || e.code === 'Space') this.queue.push('use');
      if (e.code === 'KeyF') this.queue.push('light');
      if (e.code === 'KeyJ' || e.code === 'Tab') { this.queue.push('journal'); e.preventDefault(); }
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  poll() {
    if (!this.touch || this.stick.id === null) {
      const k = this.keys;
      let x = 0, y = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      if (x || y || !this.touch) { const l = Math.hypot(x, y) || 1; this.move.x = x / l; this.move.y = y / l; }
      if (!this.touch) this.run = k.has('ShiftLeft') || k.has('ShiftRight') || this.runToggle;
    }
    const look = { x: this.look.x, y: this.look.y };
    this.look.x = this.look.y = 0;
    const q = this.queue; this.queue = [];
    return { move: this.move, look, run: this.run, actions: q };
  }

  reset() { this.move.x = this.move.y = 0; this.look.x = this.look.y = 0; this.queue = []; this.keys.clear(); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock?.(); }
}
