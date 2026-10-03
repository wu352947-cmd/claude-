// Touch (mobile CS-style layout) + keyboard/mouse input
const $ = id => document.getElementById(id);

export class Input {
  constructor(settings, hud, audio) {
    this.s = settings; this.hud = hud; this.audio = audio;
    this.move = { x: 0, y: 0 }; this.lookDX = 0; this.lookDY = 0;
    this.fire = false; this.jump = false; this.crouchToggle = false; this.crouchHold = false; this.walk = false; this.scope = false; this.reload = false; this.use = false;
    this.keys = {}; this.touches = new Map(); this.slotReq = null; this.gyro = null; this.pointerLocked = false;
    this.enabled = false;
    this.bindTouch(); this.bindKeys();
  }

  bindTouch() {
    const layer = $('touch'); this.layer = layer;
    const stick = $('stick'), knob = $('knob');
    const opts = { passive: false };
    const onStart = e => {
      if (!this.enabled) return;
      this.audio.unlock();
      for (const t of e.changedTouches) {
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const rb = el && el.closest('[data-radio]');
        if (rb) { this.radioReq = rb.dataset.radio; document.getElementById('radiomenu').classList.remove('show'); continue; }
        const btn = el && el.closest('[data-act]');
        if (btn) { this.pressButton(btn, t, true); continue; }
        if (t.clientX < window.innerWidth * 0.42 && !this.touches.has('stick')) {
          // floating joystick
          this.touches.set(t.identifier, { kind: 'stick', ox: t.clientX, oy: t.clientY });
          this.touches.set('stick', t.identifier);
          stick.style.left = t.clientX + 'px'; stick.style.top = t.clientY + 'px'; stick.classList.add('active');
          knob.style.transform = 'translate(-50%,-50%)';
        } else {
          this.touches.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
        }
      }
      e.preventDefault();
    };
    const onMove = e => {
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier); if (!s) continue;
        if (s.kind === 'stick') {
          let dx = t.clientX - s.ox, dy = t.clientY - s.oy; const R = 58; const L = Math.hypot(dx, dy);
          if (L > R) {
            // drag the base along (floating stick)
            s.ox = t.clientX - dx / L * R; s.oy = t.clientY - dy / L * R; dx = dx / L * R; dy = dy / L * R;
            stick.style.left = s.ox + 'px'; stick.style.top = s.oy + 'px';
          }
          knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
          this.move.x = dx / R; this.move.y = -dy / R;
          // push to the edge => sprint, small tilt => walk (silent)
          this.walkStick = Math.hypot(this.move.x, this.move.y) < 0.45;
        } else if (s.kind === 'look' || s.kind === 'fire') {
          this.lookDX += t.clientX - s.x; this.lookDY += t.clientY - s.y; s.x = t.clientX; s.y = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = e => {
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier); if (!s) continue;
        this.touches.delete(t.identifier);
        if (s.kind === 'stick') { this.touches.delete('stick'); this.move.x = this.move.y = 0; stick.classList.remove('active'); knob.style.transform = 'translate(-50%,-50%)'; this.walkStick = false; }
        if (s.kind === 'fire') { this.fire = false; s.el.classList.remove('down'); }
        if (s.kind === 'hold') { this[s.flag] = false; s.el.classList.remove('down'); }
      }
      e.preventDefault();
    };
    layer.addEventListener('touchstart', onStart, opts); layer.addEventListener('touchmove', onMove, opts);
    layer.addEventListener('touchend', onEnd, opts); layer.addEventListener('touchcancel', onEnd, opts);
    // mouse clicks on buttons (desktop testing)
    layer.addEventListener('mousedown', e => {
      if (!this.enabled) return; this.audio.unlock();
      const rb = e.target.closest('[data-radio]');
      if (rb) { this.radioReq = rb.dataset.radio; document.getElementById('radiomenu').classList.remove('show'); return; }
      const btn = e.target.closest('[data-act]');
      if (btn) { this.pressButton(btn, { identifier: 'mouse', clientX: e.clientX, clientY: e.clientY }, true); return; }
      if (!this.pointerLocked && this.s.desktop) { $('game-canvas').requestPointerLock?.(); }
    });
    window.addEventListener('mouseup', () => { const s = this.touches.get('mouse'); if (s) { this.touches.delete('mouse'); if (s.kind === 'fire') { this.fire = false; s.el.classList.remove('down'); } if (s.kind === 'hold') { this[s.flag] = false; s.el.classList.remove('down'); } } });
  }

  pressButton(btn, t, down) {
    const act = btn.dataset.act;
    btn.classList.add('down');
    const momentary = () => setTimeout(() => btn.classList.remove('down'), 120);
    switch (act) {
      case 'fire': this.fire = true; this.touches.set(t.identifier, { kind: 'fire', x: t.clientX, y: t.clientY, el: btn }); break;
      case 'scope': this.scope = true; momentary(); break;
      case 'jump': this.jump = true; momentary(); break;
      case 'crouch':
        if (this.s.crouchHold) { this.crouchHold = true; this.touches.set(t.identifier, { kind: 'hold', flag: 'crouchHold', el: btn }); }
        else { this.crouchToggle = !this.crouchToggle; btn.classList.toggle('on', this.crouchToggle); momentary(); }
        break;
      case 'reload': this.reload = true; momentary(); break;
      case 'use': this.use = true; this.touches.set(t.identifier, { kind: 'hold', flag: 'use', el: btn }); break;
      case 'walk': this.walk = !this.walk; btn.classList.toggle('on', this.walk); momentary(); break;
      case 'slot': this.slotReq = btn.dataset.slot; momentary(); break;
      case 'buy': this.hud.toggleBuy(); momentary(); break;
      case 'score': this.hud.toggleScore(); momentary(); break;
      case 'inspect': this.inspectReq = true; momentary(); break;
      case 'pick': this.pickReq = true; momentary(); break;
      case 'menu': this.menuReq = true; momentary(); break;
      case 'radio': document.getElementById('radiomenu').classList.toggle('show'); momentary(); break;
      default: momentary();
    }
    this.audio.play('ui_click', { volume: 0.15 });
  }

  bindKeys() {
    window.addEventListener('keydown', e => {
      if (!this.enabled) return;
      this.keys[e.code] = true; this.audio.unlock();
      if (e.code === 'Space') this.jump = true;
      if (e.code === 'KeyR') this.reload = true;
      if (e.code === 'Digit1') this.slotReq = 'primary'; if (e.code === 'Digit2') this.slotReq = 'secondary'; if (e.code === 'Digit3') this.slotReq = 'knife'; if (e.code === 'Digit4') this.slotReq = 'grenade'; if (e.code === 'Digit5') this.slotReq = 'c4';
      if (e.code === 'KeyQ') this.slotReq = 'last';
      if (e.code === 'KeyB') this.hud.toggleBuy();
      if (e.code === 'Tab') { this.hud.toggleScore(true); e.preventDefault(); }
      if (e.code === 'KeyF') this.inspectReq = true;
      if (e.code === 'KeyG') this.pickReq = true;
      if (e.code === 'Escape') this.menuReq = true;
      if (e.code === 'KeyZ') document.getElementById('radiomenu').classList.toggle('show');
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; if (e.code === 'Tab') this.hud.toggleScore(false); });
    const cv = $('game-canvas');
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === cv; });
    window.addEventListener('mousemove', e => { if (this.pointerLocked && this.enabled) { this.lookDX += e.movementX * 0.55; this.lookDY += e.movementY * 0.55; } });
    window.addEventListener('mousedown', e => { if (!this.pointerLocked || !this.enabled) return; if (e.button === 0) this.mouseFire = true; if (e.button === 2) this.scope = true; });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouseFire = false; });
    window.addEventListener('contextmenu', e => { if (this.enabled) e.preventDefault(); });
  }

  enableGyro(on) {
    if (!on) { window.removeEventListener('deviceorientation', this._gyroFn); this.gyro = null; return; }
    const req = window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission;
    const start = () => {
      this._gyroFn = e => {
        const landscape = (screen.orientation?.angle ?? window.orientation ?? 90);
        const a = landscape === 90 || landscape === -270 ? 1 : -1;
        const yaw = e.alpha, pitch = a * e.gamma, roll = e.beta;
        if (this.gyro) { let dy = yaw - this.gyro.yaw; if (dy > 180) dy -= 360; if (dy < -180) dy += 360; this.lookDX -= dy * 6 * this.s.gyroSens; let dp = pitch - this.gyro.pitch; if (Math.abs(dp) < 30) this.lookDY -= dp * 6 * this.s.gyroSens; }
        this.gyro = { yaw, pitch, roll };
      };
      window.addEventListener('deviceorientation', this._gyroFn);
    };
    if (req) req().then(r => r === 'granted' && start()).catch(() => {}); else start();
  }

  // translate input state into the agent each frame
  apply(a, dt, game) {
    const inp = a.input; const k = this.keys;
    let mx = this.move.x, mf = this.move.y;
    if (k.KeyW) mf = 1; if (k.KeyS) mf = -1; if (k.KeyA) mx = -1; if (k.KeyD) mx = 1;
    if ((k.KeyW || k.KeyS) && (k.KeyA || k.KeyD)) { mx *= 0.7071; mf *= 0.7071; }
    inp.mx = mx; inp.mf = mf;
    inp.walk = this.walk || !!k.ShiftLeft || !!this.walkStick;
    inp.crouch = this.crouchToggle || this.crouchHold || !!k.ControlLeft || !!k.KeyC;
    inp.jump = this.jump; this.jump = false;
    inp.reload = this.reload; this.reload = false;
    inp.fire2 = this.scope; this.scope = false;
    inp.use = this.use || !!k.KeyE;
    // look (with optional aim friction when the crosshair is on an enemy)
    const ws = a.ws; const zoom = game.camera.fov / (game.settings.fov || 74);
    let onEnemy = false;
    if ((this.s.aimAssist || this.s.autoFire) && ws && ws.def.type !== 'knife') {
      const eye = a.eye(); const f = a.forward();
      const wh = game.world.raycast(eye, f, 120); const maxT = wh ? wh.t : 120;
      for (const b of game.agents) { if (b.team === a.team || !b.alive) continue; if (game.rayAgent(eye, f, b, maxT)) { onEnemy = true; break; } }
    }
    const friction = onEnemy && this.s.aimAssist && !this.pointerLocked ? 0.55 : 1;
    const sens = (this.s.sens || 1) * 0.0032 * friction * (game.scoped ? zoom * (this.s.scopeSens || 1) : 1);
    a.yaw -= this.lookDX * sens; a.pitch -= this.lookDY * sens * (this.s.invertY ? -1 : 1);
    a.pitch = Math.max(-1.5, Math.min(1.5, a.pitch));
    this.lookDX = 0; this.lookDY = 0;
    const auto = this.s.autoFire && onEnemy && game.phase !== 'freeze';
    inp.fire = this.fire || this.mouseFire || auto;
    if (this.slotReq) {
      if (this.slotReq === 'last') a.switchTo(a.prevSlot);
      else if (this.slotReq === a.cur && this.slotReq === 'grenade' && a.inv.grenades.length > 1) { a.inv.grenades.push(a.inv.grenades.shift()); a.switchTo('grenade', true); game.equipVM(); }
      else a.switchTo(this.slotReq);
      this.slotReq = null;
    }
    if (this.inspectReq) { game.vm.inspect(); this.inspectReq = false; }
    if (this.pickReq) { game.pickup(a); this.pickReq = false; }
    if (this.radioReq) { game.radioCommand(this.radioReq); this.radioReq = null; }
  }

  reset() {
    this.move.x = this.move.y = 0; this.fire = this.jump = this.reload = this.scope = this.use = false; this.mouseFire = false;
    this.crouchToggle = false; this.crouchHold = false; this.touches.clear(); this.lookDX = this.lookDY = 0;
    document.querySelectorAll('#touch .down, #touch .on').forEach(e => e.classList.remove('down', 'on'));
  }
}
