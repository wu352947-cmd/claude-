import * as THREE from 'three';

// GPU instanced billboard particles (one draw call per texture)
const VS = `
attribute vec3 iPos; attribute vec4 iColor; attribute vec3 iData; attribute vec3 iDir;
varying vec2 vUv; varying vec4 vColor;
void main(){
  vUv = uv; vColor = iColor;
  float size = iData.x, rot = iData.y, stretch = iData.z;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy;
  if (stretch > 0.0) {
    // velocity-aligned billboard (tracers, sparks)
    vec3 d = (modelViewMatrix * vec4(iDir, 0.0)).xyz;
    vec2 ax = normalize(d.xy + vec2(1e-5));
    vec2 nx = vec2(-ax.y, ax.x);
    mv.xy += ax * c.y * stretch + nx * c.x * size;
  } else {
    float cs = cos(rot), sn = sin(rot);
    mv.xy += vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
  }
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D map; uniform float boost; varying vec2 vUv; varying vec4 vColor;
void main(){ vec4 t = texture2D(map, vUv); float a = min(1.0, t.a * vColor.a * max(t.r, max(t.g, t.b)) * boost);
  gl_FragColor = vec4(vColor.rgb * mix(1.0, t.r, 0.35), a);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

class ParticleSystem {
  constructor(tex, max, additive, scene, renderOrder = 10, boost = 1) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.dat = new Float32Array(max * 3); this.dir = new Float32Array(max * 3);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3); this.aCol = new THREE.InstancedBufferAttribute(this.col, 4);
    this.aDat = new THREE.InstancedBufferAttribute(this.dat, 3); this.aDir = new THREE.InstancedBufferAttribute(this.dir, 3);
    for (const a of [this.aPos, this.aCol, this.aDat, this.aDir]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iColor', this.aCol); g.setAttribute('iData', this.aDat); g.setAttribute('iDir', this.aDir);
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, boost: { value: boost } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder;
    scene.add(this.mesh);
    this.parts = [];
  }
  // p: {x,y,z, vx,vy,vz, life, size, grow, rot, spin, r,g,b,a, fade, drag, grav, stretch}
  add(p) {
    if (this.parts.length >= this.max) this.parts.shift();
    p.t = 0; p.rot = p.rot ?? Math.random() * 6.28; p.spin = p.spin ?? 0; p.grow = p.grow ?? 0; p.drag = p.drag ?? 0; p.grav = p.grav ?? 0;
    p.vx = p.vx || 0; p.vy = p.vy || 0; p.vz = p.vz || 0; p.a0 = p.a ?? 1; p.fadeIn = p.fadeIn || 0;
    this.parts.push(p); return p;
  }
  update(dt) {
    const P = this.parts; let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i]; p.t += dt; if (p.t >= p.life) continue;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy = p.vy * dr - p.grav * dt; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.size += p.grow * dt; p.rot += p.spin * dt;
      const k = p.t / p.life;
      let a = p.a0 * (p.fade === 'in-out' ? Math.min(1, p.t / Math.max(0.01, p.fadeIn || p.life * 0.15)) * Math.min(1, (1 - k) * 3) : (1 - k));
      if (p.flicker) a *= 0.6 + Math.random() * 0.4;
      P[w++] = p;
    }
    P.length = w;
    for (let i = 0; i < w; i++) {
      const p = P[i]; const k = p.t / p.life;
      let a = p.a0 * (p.fade === 'in-out' ? Math.min(1, p.t / Math.max(0.01, p.fadeIn || p.life * 0.15)) * Math.min(1, (1 - k) * 3) : (p.fade === 'late' ? Math.min(1, (1 - k) * 4) : 1 - k));
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 4] = p.r ?? 1; this.col[i * 4 + 1] = p.g ?? 1; this.col[i * 4 + 2] = p.b ?? 1; this.col[i * 4 + 3] = a;
      this.dat[i * 3] = p.size; this.dat[i * 3 + 1] = p.rot; this.dat[i * 3 + 2] = p.stretch ? p.stretch : 0;
      this.dir[i * 3] = p.dx ?? p.vx; this.dir[i * 3 + 1] = p.dy ?? p.vy; this.dir[i * 3 + 2] = p.dz ?? p.vz;
    }
    this.mesh.geometry.instanceCount = w;
    if (w) { this.aPos.needsUpdate = this.aCol.needsUpdate = this.aDat.needsUpdate = this.aDir.needsUpdate = true; }
  }
  clear() { this.parts.length = 0; this.mesh.geometry.instanceCount = 0; }
}

class DecalPool {
  constructor(tex, max, scene, color = 0x000000, opacity = 0.85, size = 0.14) {
    const g = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color, opacity, polygonOffset: true, polygonOffsetFactor: -4, alphaTest: 0.02 });
    // use the texture brightness as alpha
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `vec4 tx = texture2D(map, vMapUv); diffuseColor.a *= max(tx.r, tx.a * tx.r);`); };
    this.mesh = new THREE.InstancedMesh(g, m, max); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.max = max; this.i = 0; this.size = size; scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._n = new THREE.Vector3();
  }
  add(x, y, z, nx, ny, nz, size) {
    const s = size ?? this.size * (0.8 + Math.random() * 0.5);
    this._n.set(nx, ny, nz);
    this._q.setFromUnitVectors(Z, this._n);
    this._q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.random() * 6.28));
    this._p.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    this._m.compose(this._p, this._q, this._s.set(s, s, s));
    this.mesh.setMatrixAt(this.i, this._m); this.i = (this.i + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1); this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.mesh.count = 0; this.i = 0; }
}
const Z = new THREE.Vector3(0, 0, 1);

export class Effects {
  constructor(scene, assets, audio) {
    const F = assets.fx; this.scene = scene; this.audio = audio;
    this.smoke = new ParticleSystem(F.smoke_04, 600, false, scene, 12);
    this.bigSmoke = new ParticleSystem(F.smoke_01, 520, false, scene, 13, 2.2);
    this.dirt = new ParticleSystem(F.dirt_01, 300, false, scene, 11);
    this.blood = new ParticleSystem(F.smoke_07, 200, false, scene, 11);
    this.spark = new ParticleSystem(F.spark_01, 300, true, scene, 14);
    this.flash = new ParticleSystem(F.muzzle_02, 64, true, scene, 15);
    this.fire = new ParticleSystem(F.fire_01, 120, true, scene, 15);
    this.flare = new ParticleSystem(F.flare_01, 60, true, scene, 16);
    this.tracer = new ParticleSystem(F.trace_01, 120, true, scene, 15);
    this.ring = new ParticleSystem(F.circle_05, 8, true, scene, 16);
    this.holes = new DecalPool(F.scorch_01, 160, scene, 0x0a0806, 0.9, 0.12);
    this.bloodDecals = new DecalPool(F.dirt_03, 60, scene, 0x3a0404, 0.85, 0.9);
    this.scorch = new DecalPool(F.scorch_03, 12, scene, 0x050403, 0.9, 4);
    this.systems = [this.smoke, this.bigSmoke, this.dirt, this.blood, this.spark, this.flash, this.fire, this.flare, this.tracer, this.ring];
    // casings
    const cg = new THREE.CylinderGeometry(0.0055, 0.0055, 0.032, 6); cg.rotateZ(Math.PI / 2);
    this.casingMesh = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.9, roughness: 0.3 }), 48);
    this.casingMesh.count = 0; this.casingMesh.frustumCulled = false; scene.add(this.casingMesh);
    this.casings = [];
    // dynamic light for muzzle flashes / explosions (always present to avoid shader recompiles)
    this.light = new THREE.PointLight(0xffc070, 0, 9, 2); scene.add(this.light); this.lightT = 0;
    this.smokeVolumes = [];   // {x,y,z,r,t,life}
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }

  muzzle(x, y, z, dx, dy, dz, big = 1) {
    this.flash.add({ x: x + dx * 0.05, y: y + dy * 0.05, z: z + dz * 0.05, life: 0.05, size: 0.45 * big, r: 1, g: 0.85, b: 0.55, a: 1 });
    this.flash.add({ x: x + dx * 0.18, y: y + dy * 0.18, z: z + dz * 0.18, life: 0.04, size: 0.3 * big, r: 1, g: 0.7, b: 0.4, a: 0.9 });
    this.smoke.add({ x, y, z, vx: dx * 1.2, vy: 0.4, vz: dz * 1.2, life: 0.7, size: 0.18, grow: 0.7, r: 0.75, g: 0.72, b: 0.68, a: 0.22, drag: 2 });
    this.light.position.set(x, y, z); this.light.intensity = 6 * big; this.lightT = 0.05;
  }

  tracerLine(x, y, z, tx, ty, tz) {
    const dx = tx - x, dy = ty - y, dz = tz - z; const L = Math.hypot(dx, dy, dz); if (L < 1.5) return;
    const sp = 380; const life = Math.min(0.25, L / sp);
    this.tracer.add({ x: x + dx / L * 1.2, y: y + dy / L * 1.2, z: z + dz / L * 1.2, vx: dx / L * sp, vy: dy / L * sp, vz: dz / L * sp, life, size: 0.035, stretch: 1.6, r: 1, g: 0.85, b: 0.55, a: 0.9, fade: 'late' });
  }

  impact(x, y, z, nx, ny, nz, mat, decal = true) {
    const metal = mat === 'metal' || mat === 'tin' || mat === 'car';
    const wood = mat === 'wood' || mat === 'crate';
    const sand = !metal && !wood;
    const c = sand ? [0.82, 0.72, 0.56] : wood ? [0.55, 0.42, 0.28] : [0.6, 0.6, 0.6];
    for (let i = 0; i < 2; i++) this.smoke.add({ x, y, z, vx: nx * (1.2 + Math.random()) + (Math.random() - 0.5), vy: ny * 1.2 + Math.random() * 0.8, vz: nz * (1.2 + Math.random()) + (Math.random() - 0.5), life: 0.9 + Math.random() * 0.5, size: 0.22, grow: 0.9, r: c[0], g: c[1], b: c[2], a: 0.5, drag: 3 });
    for (let i = 0; i < 4; i++) this.dirt.add({ x, y, z, vx: nx * 3 + (Math.random() - 0.5) * 4, vy: ny * 3 + Math.random() * 3, vz: nz * 3 + (Math.random() - 0.5) * 4, life: 0.5, size: 0.06, grav: 12, r: c[0] * 0.7, g: c[1] * 0.7, b: c[2] * 0.7, a: 1 });
    if (metal || Math.random() < 0.25) for (let i = 0; i < (metal ? 6 : 2); i++) this.spark.add({ x, y, z, vx: nx * 4 + (Math.random() - 0.5) * 8, vy: ny * 4 + Math.random() * 5, vz: nz * 4 + (Math.random() - 0.5) * 8, life: 0.25, size: 0.03, stretch: 0.08, grav: 15, r: 1, g: 0.8, b: 0.4, a: 1 });
    if (decal) this.holes.add(x, y, z, nx, ny, nz);
    this.audio.play(metal ? 'imp_metal' : wood ? 'imp_wood' : 'imp_stone', { pos: { x, y, z }, volume: 0.45, ref: 3, pitchVar: 0.15, maxDist: 60 });
  }

  bloodHit(x, y, z, dx, dy, dz, head, world) {
    const n = head ? 6 : 3;
    for (let i = 0; i < n; i++) this.blood.add({ x, y, z, vx: dx * 2 + (Math.random() - 0.5) * 2, vy: 0.5 + Math.random() * 1.5, vz: dz * 2 + (Math.random() - 0.5) * 2, life: 0.45 + Math.random() * 0.3, size: head ? 0.35 : 0.25, grow: 1.2, r: 0.45, g: 0.02, b: 0.02, a: 0.85, drag: 4, grav: 2 });
    if (head) for (let i = 0; i < 5; i++) this.dirt.add({ x, y, z, vx: dx * 4 + (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: dz * 4 + (Math.random() - 0.5) * 3, life: 0.6, size: 0.05, grav: 12, r: 0.35, g: 0.0, b: 0.0, a: 1 });
    // blood splat on wall/floor behind victim
    if (world) {
      const h = world.raycast({ x, y, z }, { x: dx, y: dy - 0.3, z: dz }, 3);
      if (h) { const t = h.t; const n = h.normal; this.bloodDecals.add(x + dx * t, y + (dy - 0.3) * t, z + dz * t, n[0], n[1], n[2], 0.5 + Math.random() * 0.6); }
    }
  }

  casing(pos, right, up, fwd) {
    const v = this._v;
    if (this.casings.length > 40) this.casings.shift();
    this.casings.push({
      p: pos.clone(), v: new THREE.Vector3().copy(right).multiplyScalar(2 + Math.random()).addScaledVector(up, 1.5 + Math.random()).addScaledVector(fwd, (Math.random() - 0.5) * 0.6),
      r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30), t: 0, bounced: 0,
    });
  }

  explosion(x, y, z, big = 1) {
    // core fireball
    for (let i = 0; i < 22 * big; i++) this.fire.add({ x: x + (Math.random() - 0.5) * 1.6, y: y + 0.3 + Math.random() * 1.6, z: z + (Math.random() - 0.5) * 1.6, vx: (Math.random() - 0.5) * 9, vy: 2 + Math.random() * 7, vz: (Math.random() - 0.5) * 9, life: 0.35 + Math.random() * 0.45, size: (2.4 + Math.random() * 2.4) * big, grow: 5, spin: (Math.random() - 0.5) * 3, r: 1, g: 0.55 + Math.random() * 0.2, b: 0.2, a: 1, drag: 4 });
    // rising dark smoke column
    for (let i = 0; i < 26 * big; i++) this.bigSmoke.add({ x: x + (Math.random() - 0.5) * 2, y: y + 0.6 + Math.random() * 1.5, z: z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 8, vy: 1.5 + Math.random() * 4.5, vz: (Math.random() - 0.5) * 8, life: 3 + Math.random() * 2.5, size: 2.2 * big, grow: 2.4, spin: (Math.random() - 0.5) * 0.6, r: 0.2, g: 0.18, b: 0.16, a: 0.8, drag: 1.6, fade: 'in-out', fadeIn: 0.12 });
    // dust ring along the ground
    for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283; this.smoke.add({ x, y: y + 0.2, z, vx: Math.cos(a) * 11, vy: 0.4, vz: Math.sin(a) * 11, life: 1.4, size: 1.0, grow: 2.2, r: 0.75, g: 0.65, b: 0.5, a: 0.55, drag: 3.5 }); }
    for (let i = 0; i < 40; i++) this.spark.add({ x, y: y + 0.4, z, vx: (Math.random() - 0.5) * 26, vy: Math.random() * 16, vz: (Math.random() - 0.5) * 26, life: 0.6 + Math.random() * 0.7, size: 0.06, stretch: 0.3, grav: 14, r: 1, g: 0.75, b: 0.35, a: 1 });
    for (let i = 0; i < 18; i++) this.dirt.add({ x, y: y + 0.2, z, vx: (Math.random() - 0.5) * 14, vy: 4 + Math.random() * 9, vz: (Math.random() - 0.5) * 14, life: 1.4, size: 0.14, grav: 14, r: 0.3, g: 0.26, b: 0.2, a: 1 });
    this.flare.add({ x, y: y + 0.8, z, life: 0.22, size: 16 * big, r: 1, g: 0.85, b: 0.55, a: 1 });
    this.flare.add({ x, y: y + 0.8, z, life: 0.6, size: 8 * big, grow: 6, r: 1, g: 0.5, b: 0.2, a: 0.7 });
    this.ring.add({ x, y: y + 0.6, z, life: 0.45, size: 2, grow: 40, r: 1, g: 0.9, b: 0.7, a: 0.5 });
    this.scorch.add(x, 0.01, z, 0, 1, 0, 4 + Math.random());
    this.light.position.set(x, y + 1.5, z); this.light.intensity = 120; this.light.distance = 32; this.lightT = 0.35;
  }

  smokeGrenade(x, y, z) {
    const vol = { x, y: y + 1.2, z, r: 0.5, t: 0, life: 17 };
    this.smokeVolumes.push(vol);
    vol.emit = 0;
    return vol;
  }

  flashBurst(x, y, z) {
    this.flare.add({ x, y: y + 0.3, z, life: 0.3, size: 12, r: 1, g: 1, b: 1, a: 1 });
    this.light.position.set(x, y + 0.5, z); this.light.intensity = 80; this.light.distance = 30; this.lightT = 0.2;
  }

  // is point inside any active smoke? (blocks line of sight)
  smokeBlocks(a, b) {
    for (const s of this.smokeVolumes) {
      if (s.r < 1) continue;
      // segment-sphere distance
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const L2 = dx * dx + dy * dy + dz * dz;
      let t = ((s.x - a.x) * dx + (s.y - a.y) * dy + (s.z - a.z) * dz) / (L2 || 1); t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t - s.x, py = a.y + dy * t - s.y, pz = a.z + dz * t - s.z;
      if (px * px + py * py * 2 + pz * pz < (s.r * 0.85) ** 2) return true;
    }
    return false;
  }

  update(dt, world) {
    for (const s of this.systems) s.update(dt);
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) { this.light.intensity = 0; this.light.distance = 9; } else this.light.intensity *= 0.7; }
    // smoke volumes
    for (let i = this.smokeVolumes.length - 1; i >= 0; i--) {
      const s = this.smokeVolumes[i]; s.t += dt;
      const target = s.t < 1.5 ? s.t / 1.5 * 4.6 : (s.t > s.life - 2 ? Math.max(0, (s.life - s.t) / 2) * 4.6 : 4.6);
      s.r = target;
      if (s.t < s.life - 3) {
        s.emit -= dt;
        if (!s.burst) {
          s.burst = true;
          for (let k = 0; k < 26; k++) { const a = Math.random() * 6.28, sp = 2 + Math.random() * 4; this.bigSmoke.add({ x: s.x, y: s.y - 0.6 + Math.random() * 1.2, z: s.z, vx: Math.cos(a) * sp, vy: 0.4 + Math.random() * 1.2, vz: Math.sin(a) * sp, life: s.life - 2 + Math.random() * 2, size: 2.6 + Math.random() * 1.5, grow: 0.35, spin: (Math.random() - 0.5) * 0.25, r: 0.8, g: 0.79, b: 0.76, a: 0.95, fade: 'in-out', fadeIn: 0.4, drag: 1.2 }); }
        }
        if (s.emit <= 0) {
          s.emit = s.t < 3 ? 0.05 : 0.14;
          const a = Math.random() * 6.28, rr = Math.random() * Math.max(0.5, s.r * 0.85);
          this.bigSmoke.add({ x: s.x + Math.cos(a) * rr, y: s.y - 0.9 + Math.random() * 2.8, z: s.z + Math.sin(a) * rr, vx: Math.cos(a) * 0.25, vy: 0.04, vz: Math.sin(a) * 0.25, life: 5 + Math.random() * 3, size: 3.6 + Math.random() * 1.8, grow: 0.2, spin: (Math.random() - 0.5) * 0.2, r: 0.8, g: 0.79, b: 0.76, a: 0.92, fade: 'in-out', fadeIn: 0.6, drag: 0.5 });
        }
      }
      if (s.t >= s.life) this.smokeVolumes.splice(i, 1);
    }
    // casings
    const C = this.casings; let n = 0;
    for (const c of C) {
      c.t += dt;
      c.v.y -= 14 * dt; c.p.addScaledVector(c.v, dt); c.r.addScaledVector(c.w, dt);
      const g = world ? world.groundAt(c.p.x, c.p.z, 0.02, c.p.y + 0.05) : 0;
      if (c.p.y < g + 0.006) {
        c.p.y = g + 0.006;
        if (c.v.y < -1) { c.v.y *= -0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.5); if (c.bounced++ < 2 && c.near) this.audio.play('casing', { pos: c.p, volume: 0.25, rate: 1.4 + Math.random() * 0.4, maxDist: 12 }); }
        else { c.v.set(0, 0, 0); c.w.set(0, 0, 0); }
      }
      this._q.setFromEuler(this._e.set(c.r.x, c.r.y, c.r.z));
      this._m.compose(c.p, this._q, this._s);
      this.casingMesh.setMatrixAt(n++, this._m);
    }
    while (C.length && C[0].t > 12) C.shift();
    this.casingMesh.count = n; this.casingMesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const s of this.systems) s.clear();
    this.holes.clear(); this.bloodDecals.clear(); this.scorch.clear();
    this.smokeVolumes.length = 0; this.casings.length = 0;
  }
}
