// Small things that make the island feel touched: spray, sand, leaves, footprints that the
// swash takes back, motes in the low sun. Then the lens: bloom, the tilt-shift blur that
// makes a whole island a model on a table, a warm grade, and a flare when you look up.
import * as THREE from 'three';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { ShaderPass } from './vendor/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/postprocessing/OutputPass.js';
import { U } from './shaderlib.js';

// ---------------------------------------------------------------- particles
export function particles(max = 900) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC;
      void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(d)); if (a * vC.a < 0.01) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 5;
  const P = [];
  const api = {
    obj: pts, mat,
    spawn(o) {
      if (P.length >= max) P.shift();
      P.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g ?? 9, drag: o.drag ?? 0.5, life: o.life || 1, age: 0, size: o.size || 0.06, grow: o.grow || 0, c: o.c || [1, 1, 1], a: o.a ?? 1, floor: o.floor ?? -99 });
    },
    update(dt) {
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]; p.age += dt;
        if (p.age >= p.life) { P.splice(i, 1); continue; }
        p.vy -= p.g * dt; const k = Math.exp(-p.drag * dt); p.vx *= k; p.vz *= k; p.vy *= p.drag > 2 ? k : 1;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
      }
      const n = P.length;
      for (let i = 0; i < n; i++) {
        const p = P[i], f = p.age / p.life;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 4] = p.c[0]; col[i * 4 + 1] = p.c[1]; col[i * 4 + 2] = p.c[2]; col[i * 4 + 3] = p.a * (1 - f) * Math.min(1, p.age * 20);
        size[i] = p.size * (1 + p.grow * f);
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = geo.attributes.aCol.needsUpdate = geo.attributes.aSize.needsUpdate = true;
    },
  };
  return api;
}

// ---------------------------------------------------------------- footprints
export function footprints(max = 160) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.ellipse(32, 32, 18, 30, 0, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(0.16, 0.24); geo.rotateX(-Math.PI / 2);
  const age = new Float32Array(max).fill(99);
  geo.setAttribute('aAge', new THREE.InstancedBufferAttribute(age, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { tMap: { value: tex }, uWater: U.uWater },
    vertexShader: `attribute float aAge; varying float vA; varying vec2 vUv; varying float vY;
      void main(){ vUv = uv; vA = aAge; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D tMap; uniform float uWater; varying float vA; varying vec2 vUv; varying float vY;
      void main(){ float s = texture2D(tMap, vUv).a; float life = vY < uWater + 0.25 ? 6.0 : 26.0;
        float f = (1.0 - smoothstep(life * 0.6, life, vA)) * smoothstep(0.0, 0.15, vA); if (vY < uWater) f = 0.0;
        gl_FragColor = vec4(mix(vec3(1.0), vec3(0.72, 0.66, 0.6), s * f), 1.0); }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 1;
  const o = new THREE.Object3D(); let next = 0;
  for (let i = 0; i < max; i++) { o.position.set(0, -50, 0); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); }
  return {
    obj: mesh,
    stamp(x, y, z, yaw) {
      o.position.set(x, y + 0.012, z); o.rotation.set(0, yaw, 0); o.updateMatrix();
      mesh.setMatrixAt(next, o.matrix); age[next] = 0; next = (next + 1) % max;
      mesh.instanceMatrix.needsUpdate = true;
    },
    update(dt) { for (let i = 0; i < max; i++) age[i] += dt; geo.attributes.aAge.needsUpdate = true; },
  };
}

// ---------------------------------------------------------------- motes in the light
export function motes(n = 260) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { p[i * 3] = Math.random() * 40 - 20; p[i * 3 + 1] = Math.random() * 5; p[i * 3 + 2] = Math.random() * 40 - 20; s[i] = Math.random(); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uCenter: { value: new THREE.Vector3() }, uSunColor: U.uSunColor, uScale: { value: 400 } },
    vertexShader: `attribute float aSeed; uniform float uTime, uScale; uniform vec3 uCenter; varying float vT;
      void main(){
        vec3 q = position;
        q.x += sin(uTime * 0.2 + aSeed * 40.0) * 1.5 + uTime * 0.25;
        q.z += cos(uTime * 0.17 + aSeed * 31.0) * 1.5 + uTime * 0.1;
        q.y += sin(uTime * 0.3 + aSeed * 17.0) * 0.6;
        q.xz = mod(q.xz - uCenter.xz + 20.0, 40.0) - 20.0 + uCenter.xz;
        q.y += uCenter.y;
        vT = pow(0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 60.0), 6.0);
        vec4 mv = modelViewMatrix * vec4(q, 1.0);
        gl_PointSize = (0.03 + aSeed * 0.04) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uSunColor; varying float vT; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uSunColor * (0.25 + vT * 1.6) * a, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 6;
  return { obj: pts, mat };
}

// ---------------------------------------------------------------- ripples on the sea
export function ripples(seaMat) {
  const list = seaMat.uniforms.uRipples.value;
  let next = 0;
  return { add(x, z, strength = 0.5) { list[next].set(x, z, U.uTime.value, strength); next = (next + 1) % list.length; } };
}

// ---------------------------------------------------------------- the lens
const TiltShader = {
  uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uFocus: { value: 0.45 }, uBand: { value: 0.12 }, uMax: { value: 3.0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir, uRes; uniform float uFocus, uBand, uMax; varying vec2 vUv;
    void main(){
      float off = vUv.y - uFocus;
      float k = smoothstep(uBand, uBand + 0.32, abs(off)) * (off > 0.0 ? 1.0 : 0.75);
      float r = k * uMax;
      if (r < 0.05) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 acc = vec4(0.0); float wsum = 0.0;
      for (int i = -6; i <= 6; i++) {
        float t = float(i) / 6.0;
        float w = exp(-t * t * 2.2);
        acc += texture2D(tDiffuse, vUv + uDir * t * r * 6.0 / uRes) * w; wsum += w;
      }
      gl_FragColor = acc / wsum;
    }`,
};
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uFlare: { value: new THREE.Vector3(0.5, 0.5, 0) }, uFade: { value: 1 }, uFadeCol: { value: new THREE.Color(1.0, 0.86, 0.66) },
    uSunColor: U.uSunColor, uSat: { value: 1.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uFade, uSat; uniform vec2 uRes; uniform vec3 uFlare, uFadeCol, uSunColor; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), smoothstep(0.15, 1.4, l));
      c += vec3(0.012, 0.010, 0.03) * (1.0 - smoothstep(0.0, 0.25, l));
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      // flare: a soft veil round the sun, ghosts strung back through the centre
      if (uFlare.z > 0.001) {
        vec2 s = uFlare.xy;
        float d = length((vUv - s) * asp);
        c += uSunColor * (exp(-d * 10.0) * 0.35 + exp(-d * 3.0) * 0.06) * uFlare.z;
        vec2 axis = vec2(0.5) - s;
        for (int i = 1; i <= 4; i++) {
          vec2 gp = s + axis * (float(i) * 0.55);
          float gd = length((vUv - gp) * asp);
          float sz = 0.025 + float(i) * 0.018;
          vec3 tint = i == 2 ? vec3(0.4, 0.8, 1.0) : i == 3 ? vec3(1.0, 0.5, 0.7) : vec3(1.0, 0.8, 0.5);
          c += tint * smoothstep(sz, sz * 0.6, gd) * 0.07 * uFlare.z;
        }
        float streak = exp(-abs(vUv.y - s.y) * 160.0) * exp(-abs(vUv.x - s.x) * 3.0);
        c += uSunColor * streak * 0.25 * uFlare.z;
      }
      float v = length((vUv - 0.5) * asp * vec2(0.9, 1.05));
      c *= mix(1.0, 0.62, smoothstep(0.42, 1.05, v));
      c += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) * 0.018;
      c = mix(uFadeCol * 1.4, c, uFade);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function lens(renderer, scene, camera, quality) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 0.92);
  composer.addPass(bloom);
  const tiltH = new ShaderPass(TiltShader); tiltH.uniforms.uDir.value.set(1, 0);
  const tiltV = new ShaderPass(TiltShader); tiltV.uniforms.uDir.value.set(0, 1);
  composer.addPass(tiltH); composer.addPass(tiltV);
  const fin = new ShaderPass(FinalShader);
  composer.addPass(fin);
  composer.addPass(new OutputPass());
  const api = {
    composer, bloom, tiltH, tiltV, fin,
    resize(w, h, pr) {
      composer.setPixelRatio(pr); composer.setSize(w, h);
      const W = w * pr, Hh = h * pr;
      for (const p of [tiltH, tiltV, fin]) p.uniforms.uRes.value.set(W, Hh);
    },
    tilt(focus, band, max) {
      for (const p of [tiltH, tiltV]) { p.uniforms.uFocus.value = focus; p.uniforms.uBand.value = band; p.uniforms.uMax.value = max; }
    },
  };
  return api;
}
