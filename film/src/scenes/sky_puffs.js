// Soft volumetric-looking cloud puffs: camera-facing instanced quads shaded as noisy sphere impostors,
// lit from a point source (flame / tower) plus a sky/ground ambient. Sorted back-to-front on the CPU.
// Used by the launch exhaust (sky.js) and the cloud deck the glyph tower pierces (word.js).
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec4 iPos;      // xyz, size (world radius)
attribute vec4 iPar;      // alpha, heat (self-glow), seed, shade (0..1 darkening)
uniform vec3 uSrcPos;
varying vec2 vUv; varying vec4 vPar; varying vec3 vSrcDir; varying float vSrcDist; varying float vDepth;
varying vec3 vCenterW;
void main(){
  vUv=position.xy*2.;
  vPar=iPar;
  float rot=iPar.z*6.2831;
  vec2 c=vec2(cos(rot),sin(rot));
  vec2 q=vec2(position.x*c.x-position.y*c.y, position.x*c.y+position.y*c.x)*2.;
  vec4 mv=viewMatrix*vec4(iPos.xyz,1.);
  mv.xy+=q*iPos.w;
  vDepth=-mv.z;
  vec3 d=uSrcPos-iPos.xyz; vSrcDist=length(d); vSrcDir=d/max(vSrcDist,1e-4);
  vCenterW=iPos.xyz;
  // rotate uv back so the noise is in the rotated frame but the normal reconstruction is camera aligned
  vUv=q;
  gl_Position=projectionMatrix*mv;
}`;

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D uNoise;
uniform vec3 uSrcCol, uSkyCol, uGroundCol, uFogCol, uAlbedo, uKeyDir, uKeyCol;
uniform float uFogDens, uSrcRange, uTime, uSoft;
uniform mat3 uViewInv;
varying vec2 vUv; varying vec4 vPar; varying vec3 vSrcDir; varying float vSrcDist; varying float vDepth;
varying vec3 vCenterW;
void main(){
  vec2 uv=vUv;
  float r=length(uv);
  if(r>1.) discard;
  vec2 nuv=uv*.33+vPar.z*vec2(7.13,3.71)+vec2(uTime*.004,0.);
  float n1=texture2D(uNoise,nuv).r, n2=texture2D(uNoise,nuv*2.3+.37).r;
  float n=n1*.65+n2*.35;
  float e=r+(n-.5)*.75;
  float a=smoothstep(1.,uSoft,e)*vPar.x;
  if(a<.004) discard;
  // impostor normal (view space) perturbed by noise gradient
  float gx=texture2D(uNoise,nuv+vec2(.012,0.)).r-n1, gy=texture2D(uNoise,nuv+vec2(0.,.012)).r-n1;
  vec3 nv=normalize(vec3(uv*.9+vec2(gx,gy)*9.,sqrt(max(1.-r*r,0.))+.25));
  vec3 N=normalize(uViewInv*nv);
  // point source (flame / tower), wrapped diffuse, distance falloff
  float att=1./(1.+pow(vSrcDist/uSrcRange,2.));
  float nds=dot(N,vSrcDir);
  float dif=pow(max(nds*.75+.25,0.),1.6);
  // occlusion: the puff's core and its lower-density folds are darker
  float occ=mix(1.,.45+.55*smoothstep(.15,.95,r+n*.35),.75)*(1.-vPar.w*.55);
  vec3 col=uAlbedo*(uSrcCol*att*dif)*mix(.6,1.,occ);
  // warm under-lit rim
  col+=uSrcCol*att*pow(1.-max(nv.z,0.),2.5)*max(nds,0.)*.6;
  // ambient: cool sky above, warm ground bounce below
  col+=uAlbedo*mix(uGroundCol,uSkyCol,N.y*.5+.5)*occ*(.45+.55*n);
  // key light (sun): sculpted, with self shadow
  col+=uAlbedo*uKeyCol*pow(max(dot(N,uKeyDir),0.),1.3)*occ;
  // inner heat (incandescent exhaust near the source)
  col+=vec3(1.,.55,.22)*vPar.y*(.6+.8*n)*(1.-r*.6);
  // fog
  float f=1.-exp(-vDepth*uFogDens);
  col=mix(col,uFogCol,f);
  gl_FragColor=vec4(col*a,a);
}`;

export function createPuffs(max, noiseTex) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const iPar = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  iPos.setUsage(THREE.DynamicDrawUsage); iPar.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iPos', iPos); g.setAttribute('iPar', iPar);
  g.instanceCount = 0;
  const v3 = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
  const uniforms = {
    uNoise: { value: noiseTex }, uSrcPos: v3(0, 0, 0), uSrcCol: v3(0, 0, 0), uSrcRange: { value: 50 },
    uSkyCol: v3(.3, .3, .3), uGroundCol: v3(.1, .1, .1), uFogCol: v3(.3, .3, .3), uFogDens: { value: 0 },
    uAlbedo: v3(.85, .85, .85), uKeyDir: v3(0, 1, 0), uKeyCol: v3(0, 0, 0), uTime: { value: 0 }, uSoft: { value: 0.35 },
    uViewInv: { value: new THREE.Matrix3() },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  const order = new Int32Array(max), depth = new Float32Array(max);
  const tmp = new THREE.Vector3();
  return {
    mesh, uniforms,
    // list: array of {x,y,z,s,a,heat,seed,shade}; sorted far → near for this camera
    set(list, camera) {
      const n = Math.min(list.length, max);
      const ve = camera.matrixWorldInverse.elements;
      for (let i = 0; i < n; i++) {
        const p = list[i];
        depth[i] = -(ve[2] * p.x + ve[6] * p.y + ve[10] * p.z + ve[14]);
        order[i] = i;
      }
      const ord = Array.from(order.subarray(0, n)).sort((a, b) => depth[b] - depth[a]);
      let k = 0;
      for (const i of ord) {
        const p = list[i];
        if (depth[i] < -p.s) continue;
        iPos.array.set([p.x, p.y, p.z, p.s], k * 4);
        iPar.array.set([p.a, p.heat || 0, p.seed, p.shade || 0], k * 4);
        k++;
      }
      g.instanceCount = k;
      iPos.needsUpdate = true; iPar.needsUpdate = true;
      uniforms.uViewInv.value.setFromMatrix4(camera.matrixWorld);
    },
  };
}
