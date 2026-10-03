// 后期处理：泛光、ACES 色调映射、胶片颗粒、暗角、色差、理智值扭曲、受伤红晕、淡入淡出
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer, quality) {
    this.r = renderer;
    this.quality = quality;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo, null); this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const rtOpt = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace };
    this.rt = new THREE.WebGLRenderTarget(4, 4, { ...rtOpt, samples: quality.msaa ? 4 : 0, depthBuffer: true });
    this.bA = new THREE.WebGLRenderTarget(4, 4, rtOpt);
    this.bB = new THREE.WebGLRenderTarget(4, 4, rtOpt);
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.85 } }, vertexShader: VERT, depthTest: false,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uThreshold; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.2126,0.7152,0.0722));
          gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.6, l), 1.0); }`
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VERT, depthTest: false,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227;
          c += texture2D(tDiffuse, vUv + uDir * 1.385).rgb * 0.316; c += texture2D(tDiffuse, vUv - uDir * 1.385).rgb * 0.316;
          c += texture2D(tDiffuse, vUv + uDir * 3.231).rgb * 0.07; c += texture2D(tDiffuse, vUv - uDir * 3.231).rgb * 0.07;
          gl_FragColor = vec4(c, 1.0); }`
    });
    this.final = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tBloom: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() },
        uBloom: { value: 0.9 }, uExposure: { value: 1.25 }, uSanity: { value: 1 }, uHurt: { value: 0 }, uFade: { value: 0 },
        uGrain: { value: 0.07 }, uVignette: { value: 1 }, uFlash: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) }
      },
      vertexShader: VERT, depthTest: false,
      fragmentShader: `
        uniform sampler2D tDiffuse, tBloom; uniform float uTime, uBloom, uExposure, uSanity, uHurt, uFade, uGrain, uVignette, uFlash;
        uniform vec2 uRes; uniform vec3 uTint; varying vec2 vUv;
        float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec2 uv = vUv;
          float insane = 1.0 - uSanity;
          // 理智低时画面像水波一样扭动
          uv += vec2(sin(uv.y*18.0 + uTime*2.3), cos(uv.x*15.0 + uTime*1.7)) * 0.004 * insane * insane;
          vec2 dc = uv - 0.5; float r2 = dot(dc, dc);
          float ab = 0.0018 + r2 * 0.012 + insane * 0.006 + uHurt * 0.012;
          vec3 col;
          col.r = texture2D(tDiffuse, uv + dc * ab).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv - dc * ab).b;
          col += texture2D(tBloom, uv).rgb * uBloom;
          col *= uExposure * uTint;
          col = aces(col);
          // 冷暗部、暖亮部
          float l = dot(col, vec3(0.299,0.587,0.114));
          col = mix(col * vec3(0.86, 0.95, 1.08), col * vec3(1.06, 1.0, 0.9), smoothstep(0.1, 0.6, l));
          col = mix(col, vec3(l), 0.18 + insane * 0.5);
          // 暗角
          float v = smoothstep(0.95, 0.18, length(dc * vec2(1.0, 0.85)) * (1.0 + insane * 0.6));
          col *= mix(1.0, v, uVignette);
          // 受伤：边缘泛红
          float edge = smoothstep(0.15, 0.75, length(dc));
          col = mix(col, vec3(0.45, 0.0, 0.0), clamp(uHurt * edge * 1.2, 0.0, 0.85));
          // 理智：边缘涌动的黑
          col *= 1.0 - insane * edge * (0.7 + 0.3*sin(uTime*3.0));
          col = toSRGB(col);
          // 胶片颗粒与扫描抖动
          float g = hash(vUv * uRes + fract(uTime * 37.0) * 100.0) - 0.5;
          col += g * (uGrain + insane * 0.08);
          col += uFlash;
          col *= 1.0 - uFade;
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    this.u = this.final.uniforms;
  }

  setSize(w, h, pr) {
    const W = Math.floor(w * pr), H = Math.floor(h * pr);
    this.rt.setSize(W, H);
    const bw = Math.max(1, W >> 2), bh = Math.max(1, H >> 2);
    this.bA.setSize(bw, bh); this.bB.setSize(bw, bh);
    this.bw = bw; this.bh = bh;
    this.u.uRes.value.set(W, H);
  }

  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam); }

  render(scene, camera, time) {
    const r = this.r;
    r.setRenderTarget(this.rt); r.render(scene, camera);
    if (this.quality.bloom) {
      this.bright.uniforms.tDiffuse.value = this.rt.texture; this.pass(this.bright, this.bA);
      for (let i = 0; i < 2; i++) {
        this.blur.uniforms.tDiffuse.value = this.bA.texture; this.blur.uniforms.uDir.value.set((1 + i) / this.bw, 0); this.pass(this.blur, this.bB);
        this.blur.uniforms.tDiffuse.value = this.bB.texture; this.blur.uniforms.uDir.value.set(0, (1 + i) / this.bh); this.pass(this.blur, this.bA);
      }
    }
    this.u.tDiffuse.value = this.rt.texture;
    this.u.tBloom.value = this.bA.texture;
    this.u.uBloom.value = this.quality.bloom ? 0.85 : 0;
    this.u.uTime.value = time;
    this.pass(this.final, null);
  }
}
