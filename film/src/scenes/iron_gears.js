// Act VI 铁 — the machine room inside the tower: interlocking gears, crank-driven pistons,
// steam bursts. Everything is a closed-form function of time.
import { COMMON } from './iron_common.js';
import { steelMaterial } from './iron_tower.js';

function gearShape(THREE, N, m, { spokes = 0, rimW = 0.5, hubR = 0.5, holes = 0 } = {}) {
  const r = (N * m) / 2, ra = r + m, rd = r - 1.25 * m;
  const s = new THREE.Shape();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, p = (Math.PI * 2) / N;
    const pts = [[rd, a - p * 0.5], [rd, a - p * 0.27], [ra, a - p * 0.16], [ra, a + p * 0.16], [rd, a + p * 0.27]];
    pts.forEach(([rr, aa], k) => {
      const x = rr * Math.cos(aa), y = rr * Math.sin(aa);
      if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  s.closePath();
  const ri = rd - rimW;
  if (spokes > 0 && ri > hubR + 0.3) {
    const sw = Math.min(0.5, ri * 0.12);   // half spoke width (angle-ish)
    for (let k = 0; k < spokes; k++) {
      const a0 = (k / spokes) * Math.PI * 2, a1 = ((k + 1) / spokes) * Math.PI * 2;
      const h = new THREE.Path();
      const dO = sw / ri, dI = sw / (hubR + 0.15);
      const seg = 10;
      h.moveTo((hubR + 0.15) * Math.cos(a0 + dI), (hubR + 0.15) * Math.sin(a0 + dI));
      for (let j = 0; j <= seg; j++) { const a = a0 + dO + (a1 - a0 - 2 * dO) * j / seg; h.lineTo(ri * Math.cos(a), ri * Math.sin(a)); }
      h.lineTo((hubR + 0.15) * Math.cos(a1 - dI), (hubR + 0.15) * Math.sin(a1 - dI));
      h.closePath();
      s.holes.push(h);
    }
  } else if (holes > 0) {
    const rr = (rd + hubR) / 2, hr = Math.min((rd - hubR) * 0.32, rr * Math.sin(Math.PI / holes) * 0.7);
    for (let k = 0; k < holes; k++) {
      const a = (k / holes) * Math.PI * 2;
      const h = new THREE.Path();
      h.absarc(rr * Math.cos(a), rr * Math.sin(a), hr, 0, Math.PI * 2, true);
      s.holes.push(h);
    }
  }
  // axle hole
  const ax = new THREE.Path(); ax.absarc(0, 0, hubR * 0.45, 0, Math.PI * 2, true); s.holes.push(ax);
  return s;
}

export function buildGears(THREE, U) {
  const group = new THREE.Group();
  const mat = steelMaterial(THREE, U, { instanced: false, heat: false });
  const gears = [];
  const m = 0.12;
  // spec: N, plane z, mesh-with parent + angle, or same axle as `axle`
  const spec = [
    { id: 'G0', N: 62, z: 0, at: [0, 8], w: 0.9, spokes: 12, rimW: 0.42, hubR: 0.75, omega: 0.42 },
    { id: 'G1', N: 24, z: 0, parent: 'G0', alpha: -0.42, w: 0.8, holes: 6 },
    { id: 'G2', N: 38, z: 0, parent: 'G0', alpha: 2.55, w: 0.8, spokes: 6 },
    { id: 'G8', N: 30, z: 0, parent: 'G0', alpha: -2.15, w: 0.8, holes: 5 },
    { id: 'G1b', N: 46, z: 1.0, axle: 'G1', w: 0.6, spokes: 8 },
    { id: 'G9', N: 14, z: 1.0, parent: 'G1b', alpha: 0.55, w: 0.6, holes: 0 },
    { id: 'G4', N: 26, z: 1.0, parent: 'G1b', alpha: -1.25, w: 0.6, holes: 5 },
    { id: 'G6', N: 84, z: -1.3, axle: 'G2', w: 0.7, spokes: 10, rimW: 0.4, hubR: 0.8 },
    { id: 'G7', N: 28, z: -1.3, parent: 'G6', alpha: 2.25, w: 0.7, holes: 6 },
    { id: 'G5', N: 18, z: 0, parent: 'G2', alpha: 1.45, w: 0.8, holes: 0 },
    { id: 'G10', N: 54, z: -1.3, parent: 'G7', alpha: 2.9, w: 0.7, spokes: 8 },
    { id: 'G11', N: 34, z: -1.3, parent: 'G6', alpha: 2.0, w: 0.7, spokes: 6 },
    { id: 'G12', N: 22, z: 1.0, parent: 'G4', alpha: -2.4, w: 0.6, holes: 5 },
    { id: 'G13', N: 48, z: 0, parent: 'G8', alpha: -2.6, w: 0.8, spokes: 6 },
    // foreground trains that the camera pulls back through
    { id: 'F0', N: 90, z: 9.0, at: [-12.5, 3.5], w: 0.9, spokes: 10, rimW: 0.45, hubR: 0.9, omega: -0.2 },
    { id: 'F1', N: 40, z: 9.0, parent: 'F0', alpha: 0.6, w: 0.9, spokes: 6 },
    { id: 'F2', N: 100, z: 13.0, at: [14.5, 12.0], w: 1.0, spokes: 12, rimW: 0.5, hubR: 1.0, omega: 0.15 },
    { id: 'F3', N: 36, z: 13.0, parent: 'F2', alpha: -2.3, w: 1.0, holes: 6 },
    { id: 'F4', N: 70, z: 16.0, at: [-13.0, 14.5], w: 1.0, spokes: 8, omega: 0.22 },
    { id: 'F5', N: 96, z: 19.0, at: [12.0, -1.0], w: 1.2, spokes: 14, rimW: 0.55, hubR: 1.1, omega: -0.12 },
  ];
  const byId = {};
  for (const g of spec) {
    const r = (g.N * m) / 2;
    let cx, cy, th;   // theta(t) = th[0] + th[1] t
    if (g.at) { [cx, cy] = g.at; th = [0, g.omega]; }
    else if (g.axle) { const a = byId[g.axle]; cx = a.cx; cy = a.cy; th = [a.th[0] + 0.13, a.th[1]]; }
    else {
      const p = byId[g.parent], d = p.r + r;
      cx = p.cx + d * Math.cos(g.alpha); cy = p.cy + d * Math.sin(g.alpha);
      // theta2 = alpha + pi - (N1/N2)(alpha - theta1) - pi/N2
      const k = p.N / g.N;
      th = [g.alpha + Math.PI - k * (g.alpha - p.th[0]) - Math.PI / g.N, k * p.th[1]];
    }
    const shape = gearShape(THREE, g.N, m * (g.id[0] === 'F' ? 1.0 : 1), g);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: g.w, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1, curveSegments: 6 });
    geo.translate(0, 0, -g.w / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, g.z);
    group.add(mesh);
    const G = { ...g, r, cx, cy, th, mesh };
    byId[g.id] = G; gears.push(G);
  }
  // axles / hubs
  const axGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
  axGeo.rotateX(Math.PI / 2);
  for (const g of gears) {
    const a = new THREE.Mesh(axGeo, mat);
    a.position.set(g.cx, g.cy, g.z - 0.6);
    a.scale.set(g.N > 40 ? 0.5 : 0.28, g.N > 40 ? 0.5 : 0.28, g.w + 1.8);
    group.add(a);
  }
  // frame girders of the machine (static iron beams)
  const beamGeo = new THREE.BoxGeometry(1, 1, 1);
  const beams = [
    [[-10, -0.4, -2.2], [22, 0.8, 1.2]], [[0, 15.2, -2.4], [24, 0.7, 0.9]], [[-10.6, 7, -2.4], [0.8, 16, 0.8]],
    [[9.8, 7, -2.4], [0.8, 16, 0.8]], [[5.6, 1.4, 0.2], [0.5, 3.4, 0.5]],
  ];
  for (const [p, s] of beams) { const b = new THREE.Mesh(beamGeo, mat); b.position.fromArray(p); b.scale.fromArray(s); group.add(b); }

  // pistons: crank on a gear face → connecting rod → crosshead in a cylinder
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 18);
  const pistons = [
    { gear: 'G9', crank: 0.55, L: 3.4, dir: 1, zoff: 0.75, bore: 0.55, cylLen: 2.8 },
    { gear: 'G8', crank: 0.95, L: 4.2, dir: -1, zoff: 0.75, bore: 0.8, cylLen: 3.4 },
    { gear: 'G11', crank: 0.9, L: 3.6, dir: 1, zoff: 0.55, bore: 0.65, cylLen: 3.0, vertical: true },
  ].map(p => {
    const g = byId[p.gear];
    const rod = new THREE.Mesh(cyl, mat); rod.scale.set(0.12, 1, 0.12);
    const prod = new THREE.Mesh(cyl, mat); prod.scale.set(0.09, 1, 0.09);
    const body = new THREE.Mesh(cyl, mat);
    const pin = new THREE.Mesh(axGeo, mat); pin.scale.set(0.17, 0.17, 0.5);
    group.add(rod, prod, body, pin);
    return { ...p, g, rod, prod, body, pin };
  });

  // steam bursts
  const steam = buildSteam(THREE, U, pistons);
  group.add(steam.points);

  // the furnace glow behind the main gear (bright openings between its spokes: the rose window)
  const glowMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */`
${COMMON}
varying vec2 vUv;
void main(){
  vec2 c = vUv - 0.5; float r = length(c) * 2.0;
  float f = exp(-r * r * 2.2) * (0.85 + 0.15 * sin(uTime * 7.0 + r * 9.0));
  gl_FragColor = vec4(uFurnaceCol * f * 0.55, 1.0);
}`,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), glowMat);
  glow.position.set(0, 8, -2.9);
  group.add(glow);

  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  const placeRod = (mesh, a, b) => {
    tmp.subVectors(b, a); const len = tmp.length(); tmp.normalize();
    q.setFromUnitVectors(up, tmp); mesh.quaternion.copy(q);
    mesh.position.addVectors(a, b).multiplyScalar(0.5);
    mesh.scale.y = len;
  };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  function update(t) {
    for (const g of gears) g.mesh.rotation.z = g.th[0] + g.th[1] * t;
    for (const p of pistons) {
      const th = p.g.th[0] + p.g.th[1] * t;
      const z = p.g.z + p.zoff;
      const px = Math.cos(th) * p.crank, py = Math.sin(th) * p.crank;
      A.set(p.g.cx + px, p.g.cy + py, z);
      p.pin.position.copy(A);
      if (!p.vertical) {
        const xh = p.g.cx + p.dir * (Math.sqrt(p.L * p.L - py * py)) + px;
        B.set(xh, p.g.cy, z);
        placeRod(p.rod, A, B);
        const cx0 = p.g.cx + p.dir * (p.L + p.crank + 0.6);
        C.set(cx0 + p.dir * p.cylLen * 0.5, p.g.cy, z);
        p.body.position.copy(C); p.body.rotation.set(0, 0, Math.PI / 2); p.body.scale.set(p.bore, p.cylLen, p.bore);
        C.set(cx0 + p.dir * 0.6, p.g.cy, z);
        placeRod(p.prod, B, C);
      } else {
        const yh = p.g.cy + p.dir * Math.sqrt(p.L * p.L - px * px) + py;
        B.set(p.g.cx, yh, z);
        placeRod(p.rod, A, B);
        const cy0 = p.g.cy + p.dir * (p.L + p.crank + 0.6);
        p.body.position.set(p.g.cx, cy0 + p.dir * p.cylLen * 0.5, z); p.body.rotation.set(0, 0, 0); p.body.scale.set(p.bore, p.cylLen, p.bore);
        p.prod.visible = false;
      }
    }
  }
  return { group, update, gears, byId, steam };
}

function buildSteam(THREE, U, pistons) {
  // emitters: cylinder exhaust ports (burst once per crank turn) + two vent pipes
  const em = pistons.map(p => {
    const omega = Math.abs(p.g.th[1]);
    const period = (Math.PI * 2) / omega;
    let pos, dir;
    if (!p.vertical) {
      const x = p.g.cx + p.dir * (p.L + p.crank + 0.6 + p.cylLen);
      pos = [x, p.g.cy + p.bore * 0.7, p.g.z + p.zoff]; dir = [p.dir * 1.0, 0.9, 0.5];
    } else {
      const y = p.g.cy + p.dir * (p.L + p.crank + 0.6 + p.cylLen);
      pos = [p.g.cx, y, p.g.z + p.zoff]; dir = [0.4, 1.0, 0.6];
    }
    return { pos, dir, period, phase: p.g.th[0] / omega };
  });
  em.push({ pos: [6.0, 0.5, 1.5], dir: [0.6, 0.5, 1.0], period: 2.6, phase: 1.1 });
  const N = 1500;
  const geo = new THREE.BufferGeometry();
  const aE = new Float32Array(N * 4), aR = new Float32Array(N * 4);
  const E = new Float32Array(em.length * 8);
  for (let i = 0; i < N; i++) {
    const e = i % em.length;
    aE[i * 4] = e; aE[i * 4 + 1] = (i * 0.6180339) % 1; aE[i * 4 + 2] = (i * 0.7548776) % 1; aE[i * 4 + 3] = (i * 0.5698403) % 1;
    aR[i * 4] = ((i * 0.3819) % 1) - 0.5; aR[i * 4 + 1] = ((i * 0.9128) % 1) - 0.5; aR[i * 4 + 2] = ((i * 0.2357) % 1) - 0.5; aR[i * 4 + 3] = i;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aE', new THREE.BufferAttribute(aE, 4));
  geo.setAttribute('aR', new THREE.BufferAttribute(aR, 4));
  const uni = { ...U, uEm: { value: em.map(e => new THREE.Vector4(...e.pos, e.period)) }, uEmD: { value: em.map(e => new THREE.Vector4(...e.dir, e.phase)) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
${COMMON}
uniform vec4 uEm[${em.length}];
uniform vec4 uEmD[${em.length}];
attribute vec4 aE, aR;
varying float vA; varying vec3 vC;
void main(){
  int e = int(aE.x + 0.5);
  vec4 E = uEm[e]; vec4 D = uEmD[e];
  float P = E.w;
  float t = uTime + D.w;
  float c = floor(t / P);
  float tb = c * P + aE.y * 0.28;     // burst: births packed into the first 0.28 s of each cycle
  float age = t - tb;
  if (age < 0.0) { age += P; c -= 1.0; }
  vec3 r = hash31(aR.w * 1.7 + c * 17.3) - 0.5;
  vec3 dir = normalize(D.xyz + r * 0.9);
  float sp = 3.2 + aE.z * 3.0;
  float k = 2.4;
  vec3 p = E.xyz + dir * sp * (1.0 - exp(-k * age)) / k + vec3(0.0, 0.55, 0.0) * age * age + r * age * 0.8;
  float life = 1.2 + aE.w * 1.0;
  float a = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(life * 0.35, life, age));
  vA = a * 0.07;
  // lit by the furnace when near it, cold otherwise
  float df = length(p - uFurnace);
  vC = mix(vec3(0.55, 0.62, 0.72), vec3(0.75, 0.68, 0.62), 0.5) + uFurnaceCol * 0.5 / (1.0 + df * df * 0.08);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = (0.8 + age * 3.2) * (0.7 + aE.z * 0.6);
  gl_PointSize = a > 0.0 ? min(sz * 804.0 * uPx * 1.87 / -mv.z, 120.0 * uPx) : 0.0;
}`,
    fragmentShader: /* glsl */`
varying float vA; varying vec3 vC;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0;
  float a = max(1.0 - d, 0.0); a = a * a * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vC, a);
}`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat };
}
