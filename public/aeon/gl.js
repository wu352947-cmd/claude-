/* ÆON — two small WebGL scenes, no library:
   silk()  the hero: a folded silk surface lit by a light that follows the cursor
   water() the Great Wave: the print as a water surface that ripples under the cursor */
(function () {
  'use strict';

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  function program(canvas, frag, alpha) {
    var gl = canvas.getContext('webgl', { antialias: false, alpha: !!alpha, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) return null;
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    var pr = gl.createProgram();
    gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var cache = {};
    return {
      gl: gl,
      u: function (n) { return n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(pr, n)); },
      draw: function () { gl.drawArrays(gl.TRIANGLES, 0, 3); }
    };
  }

  function visible(el, cb) {
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    new IntersectionObserver(function (es) { cb(es[0].isIntersecting); }, { rootMargin: '120px' }).observe(el);
  }

  var NOISE = [
    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}'
  ].join('\n');

  /* —— silk —— */
  var SILK = [
    'precision highp float;',
    'uniform vec2 uRes;uniform float uTime;uniform vec2 uLight;uniform float uFade;uniform float uFold;',
    NOISE,
    'float field(vec2 p){',
    ' float t=uTime*.05;',
    ' vec2 q=p+.28*vec2(fbm(p*1.1+vec2(t,0.)),fbm(p*1.1+vec2(0.,t)+4.));',
    ' float a=q.x*.82+q.y*.57,b=-q.x*.57+q.y*.82;',
    ' float f=.5*sin(a*8.+1.9*sin(b*2.1+t*1.3)+t*1.5);',
    ' f+=.22*sin(a*15.2+2.4*sin(b*1.6-t)-t);',
    ' f*=.55+.45*sin(b*1.4+t*.7+a*.8);',
    ' return f*uFold;',
    '}',
    'void main(){',
    ' vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y;',
    ' float e=1.5/uRes.y;',
    ' float h=field(p);',
    ' vec2 g=vec2(field(p+vec2(e,0.))-h,field(p+vec2(0.,e))-h)/e;',
    ' vec3 n=normalize(vec3(-g*.16,1.));',
    ' vec3 L=normalize(vec3(uLight,.45)-vec3(p,0.));',
    ' vec3 H=normalize(L+vec3(0.,0.,1.));',
    ' float d=length(uLight-p);',
    ' float att=1./(1.+d*d*1.2);',
    ' float dif=max(dot(n,L),0.);',
    ' float nh=max(dot(n,H),0.);',
    ' float spe=pow(nh,70.);',
    ' float sheen=pow(nh,6.);',
    ' float fres=pow(1.-n.z,2.);',
    ' vec3 ink=vec3(.014,.016,.028);',
    ' vec3 lapis=vec3(.08,.12,.27);',
    ' vec3 gold=vec3(1.,.75,.42);',
    ' vec3 cinn=vec3(.6,.18,.1);',
    ' vec3 col=ink+lapis*dif*dif*att*1.4;',
    ' col+=cinn*fres*att*1.4;',
    ' col+=gold*(spe*.6+sheen*.01)*att;',
    ' float vig=smoothstep(1.3,.2,length(p*vec2(.82,1.)));',
    ' col*=mix(.3,1.,vig);',
    ' col=pow(col,vec3(.9));',
    ' col+=(hash(gl_FragCoord.xy+fract(uTime*7.))-.5)*.014;',
    ' gl_FragColor=vec4(col*uFade,1.);',
    '}'
  ].join('\n');

  function silk(canvas, opts) {
    opts = opts || {};
    var P = program(canvas, SILK, false);
    if (!P) return null;
    var gl = P.gl;
    var scale = opts.scale || 0.6;
    var light = { x: 0.25, y: 0.18 }, target = { x: 0.25, y: 0.18 };
    var fade = 1, fold = 1, mouseAt = -1, running = false, onScreen = true, t0 = performance.now(), raf = 0;

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.max(2, Math.round(w * dpr * scale));
      canvas.height = Math.max(2, Math.round(h * dpr * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    function frame(now) {
      raf = 0;
      var t = (now - t0) / 1000;
      if (now - mouseAt > 2600) { // drift on its own when nobody is steering
        target.x = Math.sin(t * .23) * .55;
        target.y = Math.cos(t * .17) * .22 + .08;
      }
      light.x += (target.x - light.x) * .045;
      light.y += (target.y - light.y) * .045;
      gl.uniform2f(P.u('uRes'), canvas.width, canvas.height);
      gl.uniform1f(P.u('uTime'), opts.still ? 12 : t + 12);
      gl.uniform2f(P.u('uLight'), light.x, light.y);
      gl.uniform1f(P.u('uFade'), fade);
      gl.uniform1f(P.u('uFold'), fold);
      P.draw();
      if (running && !opts.still) raf = requestAnimationFrame(frame);
    }
    function play() { if (!running && onScreen) { running = true; if (!raf) raf = requestAnimationFrame(frame); } }
    function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    size();
    window.addEventListener('resize', function () { size(); if (!running) requestAnimationFrame(frame); });
    visible(canvas, function (v) { onScreen = v; v ? play() : pause(); });
    play();

    return {
      pointer: function (cx, cy) { // client px -> scene units
        var r = canvas.getBoundingClientRect();
        target.x = (cx - r.left - r.width / 2) / r.height;
        target.y = -(cy - r.top - r.height / 2) / r.height;
        mouseAt = performance.now();
      },
      fade: function (v) { fade = v; if (!running) requestAnimationFrame(frame); },
      fold: function (v) { fold = v; }
    };
  }

  /* —— water —— */
  var WATER = [
    'precision highp float;',
    'uniform sampler2D uTex;uniform vec2 uRes;uniform vec2 uImg;uniform float uTime;',
    'uniform vec2 uMouse;uniform float uAmp;uniform float uZoom;uniform float uReveal;uniform vec2 uFocus;',
    NOISE,
    'vec2 cover(vec2 uv){',
    ' float rs=uRes.x/uRes.y,ri=uImg.x/uImg.y;',
    ' vec2 s=rs>ri?vec2(1.,ri/rs):vec2(rs/ri,1.);',
    ' vec2 o=(1.-s)*uFocus;',
    ' return (uv*s+o-.5)/uZoom+.5;',
    '}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes;',
    ' vec2 asp=vec2(uRes.x/uRes.y,1.);',
    ' vec2 dv=(uv-uMouse)*asp;',
    ' float dist=length(dv);',
    ' float ring=sin(dist*42.-uTime*6.)*exp(-dist*5.)*uAmp;',
    ' vec2 off=dv/(dist+1e-4)*ring*.014/asp;',
    ' off+=vec2(sin(uv.y*10.+uTime*.7),cos(uv.x*8.-uTime*.55))*.0012;',
    ' vec2 t=cover(uv+off);',
    ' t.y=1.-t.y;',
    ' float ca=.0007+.006*abs(ring);',
    ' vec3 col;',
    ' col.r=texture2D(uTex,t+vec2(ca,0.)).r;',
    ' col.g=texture2D(uTex,t).g;',
    ' col.b=texture2D(uTex,t-vec2(ca,0.)).b;',
    ' col+=vec3(.9,.95,1.)*max(ring,0.)*.12;',
    ' float n=fbm(uv*3.2+vec2(uTime*.03,0.))*.85+ (1.-uv.y)*.25;',
    ' float m=smoothstep(uReveal*1.35-.25,uReveal*1.35-.05,n);',
    ' m=1.-m;',
    ' gl_FragColor=vec4(col*m,m);',
    '}'
  ].join('\n');

  function water(canvas, src, opts) {
    opts = opts || {};
    var P = program(canvas, WATER, true);
    if (!P) return null;
    var gl = P.gl;
    var img = new Image();
    var ready = false, running = false, onScreen = false, raf = 0, t0 = performance.now();
    var mouse = { x: .5, y: .5 }, target = { x: .5, y: .5 }, amp = 0, ampTarget = 0, zoom = 1.18, reveal = 0;
    var last = null;

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    function frame(now) {
      raf = 0;
      var t = (now - t0) / 1000;
      mouse.x += (target.x - mouse.x) * .08;
      mouse.y += (target.y - mouse.y) * .08;
      amp += (ampTarget - amp) * .06;
      ampTarget *= .965;
      gl.uniform2f(P.u('uRes'), canvas.width, canvas.height);
      gl.uniform2f(P.u('uImg'), img.naturalWidth, img.naturalHeight);
      gl.uniform1f(P.u('uTime'), t);
      gl.uniform2f(P.u('uMouse'), mouse.x, mouse.y);
      gl.uniform1f(P.u('uAmp'), opts.still ? 0 : amp);
      gl.uniform1f(P.u('uZoom'), zoom);
      gl.uniform1f(P.u('uReveal'), reveal);
      gl.uniform2f(P.u('uFocus'), .42, .5);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      P.draw();
      if (running) raf = requestAnimationFrame(frame);
    }
    function play() { if (ready && onScreen && !running) { running = true; raf = requestAnimationFrame(frame); } }
    function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    img.onload = function () {
      try {
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('texture');
      } catch (e) { return; } // file:// or a tainted image: keep the <img> fallback
      ready = true;
      size();
      if (opts.onReady) opts.onReady();
      play();
    };
    img.src = src;

    window.addEventListener('resize', function () { if (ready) size(); });
    visible(canvas, function (v) { onScreen = v; v ? play() : pause(); });

    return {
      pointer: function (cx, cy) {
        var r = canvas.getBoundingClientRect();
        var x = (cx - r.left) / r.width, y = 1 - (cy - r.top) / r.height;
        if (last) {
          var sp = Math.hypot(x - last.x, y - last.y);
          ampTarget = Math.min(1.2, ampTarget + sp * 9);
        }
        last = { x: x, y: y };
        target.x = x; target.y = y;
      },
      splash: function (cx, cy) {
        var r = canvas.getBoundingClientRect();
        target.x = mouse.x = (cx - r.left) / r.width;
        target.y = mouse.y = 1 - (cy - r.top) / r.height;
        ampTarget = 1.4;
      },
      zoom: function (v) { zoom = v; },
      reveal: function (v) { reveal = v; }
    };
  }

  window.AeonGL = { silk: silk, water: water };
})();
