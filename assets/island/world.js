// The island itself: one height function everyone agrees on, the trails cut through it,
// the ground it is dressed in, the sea that laps at it and the sky over it.
import * as THREE from 'three';
import { U, patch, mulberry } from './shaderlib.js';

// ---------------------------------------------------------------- noise
const rnd = mulberry(1337);
const PERM = new Uint8Array(512);
{ const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
const hash = (x, y) => PERM[(PERM[x & 255] + y) & 255] / 255;
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
export const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.03 + 7.1, y * 2.03 + 3.3) * 0.28 + vnoise(x * 4.1 + 1.7, y * 4.1 + 9.2) * 0.17;
const S = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- layout
export const HALL = { x: 0, z: -10, w: 9.4, d: 12, y: 3.0, door: { x: 0, z: -3.6 } };
export const BOUNDS = { minX: -50, maxX: 50, minZ: -42, maxZ: 42 };
export const SUN_DIR = new THREE.Vector3(-0.66, 0.44, 0.36).normalize();

// trails: polylines, the main one leaves the hall's steps and runs to the south beach,
// with branches west to the rocky point and east to the cove and its jetty
export const TRAILS = [
  [[0, -1.6], [0.5, 1.5], [-1.4, 5], [-0.6, 9], [1.7, 13], [1.0, 17.5], [0.4, 21.5]],
  [[-1.4, 5], [-5.8, 5.6], [-10, 3.6], [-14, 4.6], [-19, 2.6], [-24, 1.2], [-28.5, -0.6]],
  [[0.5, 1.5], [5, 0.9], [9, 3.0], [13, 2.4], [17, 4.4], [21, 5.4], [24.5, 6.4]],
  [[-10, 3.6], [-12, -1.5], [-11, -6], [-7.5, -9.5]],
];
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
export function trailDist(x, z) {
  let d = 1e9;
  for (const T of TRAILS) for (let i = 0; i < T.length - 1; i++) d = Math.min(d, segDist(x, z, T[i][0], T[i][1], T[i + 1][0], T[i + 1][1]));
  // gentle wobble so the edges of the trail are not ruler straight
  return d + (vnoise(x * 0.9, z * 0.9) - 0.5) * 0.35;
}

// ---------------------------------------------------------------- height
export function islandR(x, z) {
  const a = Math.atan2(z, x);
  let r = Math.hypot(x / 34, z / 25.5);
  r += 0.06 * Math.sin(3 * a + 0.5) + 0.045 * Math.sin(5 * a + 1.7) + 0.025 * Math.sin(9 * a + 0.3);
  r += (fbm(x * 0.06 + 3, z * 0.06 + 11) - 0.5) * 0.12;
  r += 0.30 * Math.exp(-((x - 28) ** 2 + (z - 6.5) ** 2) / 26);      // the east cove
  r -= 0.20 * Math.exp(-((x + 33) ** 2 + (z + 1) ** 2) / 45);        // the west point
  r -= 0.08 * Math.exp(-((x - 0) ** 2 + (z - 22) ** 2) / 120);       // the south beach bulges
  return r;
}
export function H(x, z) {
  const r = islandR(x, z);
  let h = -3.4 + 3.4 * S(1.24, 1.0, r);
  h += 0.62 * S(1.0, 0.85, r);
  h += 1.55 * S(0.86, 0.52, r);
  h += (fbm(x * 0.09, z * 0.09) - 0.45) * 2.0 * S(0.82, 0.5, r);
  // the north shoulder: the hall stands with rock at its back
  h += 3.2 * S(-11, -21, z) * S(1.06, 0.78, r) * (0.75 + 0.5 * fbm(x * 0.2, z * 0.2));
  // the west point is a jumble of rock
  h += 1.1 * Math.exp(-((x + 31) ** 2 + (z + 2) ** 2) / 30) * S(1.08, 0.9, r) * fbm(x * 0.35, z * 0.35) * 2;
  // the hall's terrace
  const dh = Math.hypot((x - HALL.x) / 1.0, (z - HALL.z) / 1.15);
  h = h + (HALL.y - 0.02 - h) * S(10.5, 7.2, dh);
  // trails sink a hand's breadth into the ground
  const td = trailDist(x, z);
  if (r < 0.9) h -= 0.06 * S(1.0, 0.4, td);
  return h;
}
export function normalAt(x, z, e = 0.25) {
  const dx = H(x + e, z) - H(x - e, z), dz = H(x, z + e) - H(x, z - e);
  return new THREE.Vector3(-dx, 2 * e, -dz).normalize();
}
// what kind of ground is this, for plants, footsteps and footprints
export function ground(x, z) {
  const h = H(x, z);
  if (h < 0.0) return 'sea';
  const w = weights(x, z, h);
  if (w.path > 0.5) return 'path';
  if (w.rock > 0.5) return 'rock';
  if (w.grass > 0.45) return 'grass';
  return h < 0.32 ? 'wet' : 'sand';
}
function weights(x, z, h) {
  const n = normalAt(x, z);
  const r = islandR(x, z);
  const slope = 1 - n.y;
  let rock = S(0.10, 0.22, slope);
  rock = Math.max(rock, S(1.4, 2.6, h) * S(-12, -17, z) * S(0.45, 0.65, fbm(x * 0.25, z * 0.25)));
  rock = Math.max(rock, Math.exp(-((x + 31) ** 2 + (z + 2) ** 2) / 26) * S(0.35, 0.55, fbm(x * 0.4 + 5, z * 0.4)));
  const beachLine = 0.62 + (fbm(x * 0.18, z * 0.18) - 0.5) * 0.7;
  let grass = S(beachLine, beachLine + 0.35, h) * (1 - rock);
  if (r > 0.97) grass = 0;
  const td = trailDist(x, z);
  const path = S(0.95, 0.5, td) * S(0.25, 0.7, h) * (1 - rock * 0.7);
  return { grass, rock, path };
}

// ---------------------------------------------------------------- terrain
export function buildTerrain(tex, quality) {
  const W = BOUNDS.maxX - BOUNDS.minX, D = BOUNDS.maxZ - BOUNDS.minZ;
  const sx = quality.terrainSeg, sz = Math.round(sx * D / W);
  const geo = new THREE.PlaneGeometry(W, D, sx, sz);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = H(x, z);
    pos.setY(i, h);
    const w = weights(x, z, h);
    col[i * 3] = w.grass; col[i * 3 + 1] = w.rock; col[i * 3 + 2] = w.path;
  }
  geo.setAttribute('aSplat', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ map: tex.sand, normalMap: tex.sand_n, roughness: 0.92, metalness: 0 });
  patch(mat, {
    uniforms: {
      tSand: { value: tex.sand }, tWet: { value: tex.wetsand }, tGrass: { value: tex.grass },
      tRock: { value: tex.rock }, tPath: { value: tex.path },
      nSand: { value: tex.sand_n }, nGrass: { value: tex.grass_n }, nRock: { value: tex.rock_n },
    },
    extraVertex: {
      pars: 'attribute vec3 aSplat; varying vec3 vSplat;',
      main: 'vSplat = aSplat;',
    },
    extraFragment: {
      pars: /* glsl */`
        uniform sampler2D tSand, tWet, tGrass, tRock, tPath, nSand, nGrass, nRock;
        uniform float uWater;
        varying vec3 vSplat;
        float gWet, gUnder, gSand, gGrass, gRock, gPath;
        // two rotated samplings blended by a slow noise, so no tile repeats at this scale
        vec4 tri(sampler2D t, vec2 p, float s){
          float k = texture2D(uCloud, p * 0.031).r;
          vec4 a = texture2D(t, p * s);
          vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p * s * 0.71 + 0.37;
          vec4 b = texture2D(t, q);
          return mix(a, b, smoothstep(0.35, 0.65, k));
        }`,
      map: /* glsl */`
        vec2 wp2 = vWorldPos.xz;
        float hh = vWorldPos.y;
        gRock = vSplat.g; gPath = vSplat.b * (1.0 - gRock);
        gGrass = vSplat.r * (1.0 - gPath);
        gSand = max(0.0, 1.0 - gGrass - gRock - gPath);
        // wet sand: everything the swash reaches, and a little above it
        gWet = (1.0 - smoothstep(0.02, 0.42, hh - uWater)) * gSand;
        gUnder = smoothstep(0.0, 1.6, uWater - hh);
        vec3 cS = mix(tri(tSand, wp2, 0.13).rgb * vec3(1.35, 1.2, 0.95), vec3(0.80, 0.66, 0.46), 0.38);
        vec3 cW = tri(tWet, wp2, 0.17).rgb * vec3(0.86, 0.80, 0.70);
        vec3 cG = tri(tGrass, wp2, 0.19).rgb * vec3(0.82, 0.98, 0.70);
        vec3 cR = tri(tRock, wp2, 0.11).rgb;
        vec3 cP = tri(tPath, wp2, 0.33).rgb * vec3(1.08, 1.0, 0.9);
        vec3 c = cS * gSand + cG * gGrass + cR * gRock + cP * gPath;
        c = mix(c, cW, gWet * 0.85);
        // under the sea the sand goes cool and dim, light is eaten by depth
        c *= mix(vec3(1.0), vec3(0.42, 0.66, 0.70), gUnder);
        diffuseColor.rgb *= c;
      `,
      normal: /* glsl */`
        {
          vec2 wp2 = vWorldPos.xz;
          vec3 nS = tri(nSand, wp2, 0.13).xyz * 2.0 - 1.0;
          vec3 nG = tri(nGrass, wp2, 0.19).xyz * 2.0 - 1.0;
          vec3 nR = tri(nRock, wp2, 0.11).xyz * 2.0 - 1.0;
          vec3 mapN = normalize(nS * (gSand + gPath) * 1.0 + nG * gGrass + nR * gRock * 1.3 + vec3(0.0, 0.0, 0.6));
          mapN.xy *= 0.9 * (1.0 - gUnder * 0.7);
          mat3 tbnW = getTangentFrame(-vViewPosition, normal, wp2 * 0.13);
          normal = normalize(tbnW * mapN);
        }
      `,
      rough: /* glsl */`
        float roughnessFactor = mix(0.95, 0.32, gWet) * (1.0 - gRock * 0.08);
      `,
      end: /* glsl */`
        // caustics dancing on the sea floor
        {
          float under = uWater - vWorldPos.y;
          if (under > 0.0) {
            vec2 p = vWorldPos.xz * 0.75;
            float c1 = texture2D(uCloud, p * 0.21 + uTime * vec2(0.031, 0.017)).r;
            float c2 = texture2D(uCloud, p * 0.27 - uTime * vec2(0.022, 0.029)).r;
            float ca = pow(1.0 - abs(c1 - c2) * 2.6, 7.0);
            outgoingLight += vec3(0.75, 0.95, 0.9) * ca * 0.32 * smoothstep(0.0, 0.15, under) * (1.0 - smoothstep(0.4, 2.2, under)) * cloudK;
          }
        }
      `,
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- a height map for the sea shader
export function heightTexture() {
  const nx = 256, nz = Math.round(256 * (BOUNDS.maxZ - BOUNDS.minZ) / (BOUNDS.maxX - BOUNDS.minX));
  const data = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = BOUNDS.minX + (i + 0.5) / nx * (BOUNDS.maxX - BOUNDS.minX);
    const z = BOUNDS.minZ + (j + 0.5) / nz * (BOUNDS.maxZ - BOUNDS.minZ);
    const h = Math.max(-4, Math.min(1, H(x, z)));
    const v = Math.round((h + 4) / 5 * 255);
    const k = (j * nx + i) * 4; data[k] = data[k + 1] = data[k + 2] = v; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, nx, nz);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- sea
export function buildSea(hTex, sky) {
  const geo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: U.uTime, uWater: U.uWater, uCloud: U.uCloud, uSunDir: U.uSunDir, uSunColor: U.uSunColor,
      uHeight: { value: hTex },
      uHB: { value: new THREE.Vector4(BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX - BOUNDS.minX, BOUNDS.maxZ - BOUNDS.minZ) },
      uSkyTop: { value: sky.top }, uSkyHor: { value: sky.horizon }, uFog: { value: sky.fog },
      uPlayer: U.uPlayer,
      uRipples: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, -99, 0)) },
    },
    vertexShader: /* glsl */`
      uniform float uWater;
      varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += uWater;
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uWater;
      uniform sampler2D uCloud, uHeight;
      uniform vec4 uHB;
      uniform vec3 uSunDir, uSunColor, uSkyTop, uSkyHor, uFog, uPlayer;
      uniform vec4 uRipples[12];
      varying vec3 vW;
      float Hm(vec2 p){
        vec2 uv = (p - uHB.xy) / uHB.zw;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -4.0;
        return texture2D(uHeight, uv).r * 5.0 - 4.0;
      }
      float wn(vec2 q){
        return texture2D(uCloud, q * 0.045 + uTime * vec2(0.006, 0.0035)).r * 0.55
             + texture2D(uCloud, q * 0.11 - uTime * vec2(0.008, 0.012)).r * 0.30
             + texture2D(uCloud, q * 0.37 + uTime * vec2(0.021, -0.017)).r * 0.15;
      }
      void main(){
        vec2 p = vW.xz;
        float h = Hm(p);
        float depth = uWater - h;
        if (depth < -0.02) discard;
        float shore = 1.0 - smoothstep(0.0, 3.0, depth);
        // surface normal from layered noise, calmer in the shallows
        float e = 0.12;
        float n0 = wn(p), nx = wn(p + vec2(e, 0.0)), nz = wn(p + vec2(0.0, e));
        float amp = mix(2.6, 1.3, shore);
        vec3 N = normalize(vec3(-(nx - n0) / e * amp, 1.0, -(nz - n0) / e * amp));
        // ripple rings from feet, kicks and fish
        float ringFoam = 0.0;
        for (int i = 0; i < 12; i++) {
          vec4 r = uRipples[i];
          float age = uTime - r.z;
          if (age < 0.0 || age > 2.4) continue;
          float d = length(p - r.xy);
          float rad = age * (0.9 + r.w * 0.8);
          float ring = exp(-pow((d - rad) * 7.0, 2.0)) * (1.0 - age / 2.4) * (0.6 + r.w);
          N.xz += normalize(p - r.xy + 1e-4) * ring * 0.55;
          ringFoam += ring * 0.35;
        }
        N = normalize(N);
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 shallow = vec3(0.16, 0.62, 0.58);
        vec3 mid = vec3(0.03, 0.30, 0.38);
        vec3 deep = vec3(0.012, 0.075, 0.13);
        vec3 col = mix(shallow, mid, smoothstep(0.0, 1.6, depth));
        col = mix(col, deep, smoothstep(1.4, 3.6, depth));
        // scattered light in the wave faces near shore
        col += vec3(0.05, 0.16, 0.12) * shore * (n0 - 0.4);
        vec3 R = reflect(-V, N);
        vec3 refl = mix(uSkyHor, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.6));
        float cl = texture2D(uCloud, p * 0.019 + uTime * vec2(0.0075, 0.003)).r * 0.65 + texture2D(uCloud, (p * 0.019 + uTime * vec2(0.0075, 0.003)) * 2.3 + 0.37).r * 0.35;
        float cloudK = mix(1.0, 0.5, smoothstep(0.50, 0.70, cl));
        float sd = max(dot(R, uSunDir), 0.0);
        vec3 spec = uSunColor * (pow(sd, 900.0) * 30.0 + pow(sd, 90.0) * 1.4 + pow(sd, 12.0) * 0.12) * cloudK;
        // glitter: individual wavelets catching the sun
        float gl = texture2D(uCloud, p * 1.7 + uTime * vec2(0.05, 0.03)).r * texture2D(uCloud, p * 2.3 - uTime * vec2(0.04, 0.06)).r;
        spec += uSunColor * smoothstep(0.42, 0.6, gl) * pow(sd, 6.0) * 2.5 * cloudK;
        col = col * mix(0.55, 1.0, cloudK);
        col = mix(col, refl, fres * 0.75) + spec;
        // waves rolling in: bands that travel toward the beach, breaking into foam in the last metre
        float brk = texture2D(uCloud, p * 0.22 + vec2(uTime * 0.01, 0.0)).r;
        float band = sin(depth * 7.5 - uTime * 1.6 + brk * 5.0);
        float foamB = smoothstep(0.72, 0.98, band) * (1.0 - smoothstep(0.05, 0.85, depth)) * smoothstep(0.3, 0.65, brk + n0 * 0.5);
        float edge = (1.0 - smoothstep(0.0, 0.035 + 0.05 * n0, depth)) * smoothstep(0.25, 0.55, brk + n0 * 0.6);
        float lq = texture2D(uCloud, p * 0.31 + vec2(uTime * 0.012, -uTime * 0.008)).r * 0.6 + texture2D(uCloud, p * 0.53 - vec2(uTime * 0.01, uTime * 0.014)).r * 0.4;
        float lace = smoothstep(0.035, 0.0, abs(lq - 0.5)) * (1.0 - smoothstep(0.0, 0.3, depth)) * 0.8;
        float foam = clamp(edge * 0.95 + foamB * 0.8 + lace * 0.35 + ringFoam, 0.0, 1.0);
        col = mix(col, vec3(0.96, 0.95, 0.9) * mix(0.62, 1.0, cloudK), foam);
        float alpha = smoothstep(0.0, 0.6, depth) * 0.72 + fres * 0.25;
        alpha = clamp(max(alpha, foam * 0.92) + smoothstep(1.2, 3.5, depth), 0.0, 1.0);
        // haze toward the horizon
        float dist = length(cameraPosition - vW);
        float fg = smoothstep(70.0, 420.0, dist);
        col = mix(col, uFog, fg);
        alpha = mix(alpha, 1.0, fg);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- sky
export function buildSky() {
  const sky = {
    top: new THREE.Color(0.10, 0.14, 0.38),
    horizon: new THREE.Color(1.0, 0.64, 0.40),
    fog: new THREE.Color(0.80, 0.62, 0.52),
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uSunDir: U.uSunDir, uTop: { value: sky.top }, uHor: { value: sky.horizon }, uCloud: U.uCloud, uTime: U.uTime, uSunColor: U.uSunColor },
    vertexShader: /* glsl */`
      varying vec3 vD;
      void main(){ vD = normalize(position); vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uTop, uHor, uSunColor;
      uniform sampler2D uCloud;
      uniform float uTime;
      varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float y = d.y;
        float sun = max(dot(d, uSunDir), 0.0);
        vec3 col = mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.38));
        // the far side of the sky goes rose and violet
        col = mix(col, col * vec3(0.78, 0.66, 0.95), (1.0 - sun) * 0.55 * (1.0 - clamp(y * 2.0, 0.0, 1.0)));
        col += uSunColor * pow(sun, 10.0) * 0.4 + vec3(1.0, 0.55, 0.25) * pow(sun, 3.0) * 0.22 * (1.0 - clamp(y, 0.0, 1.0));
        // painted clouds: thin bands lit from their sun side
        if (y > 0.0) {
          vec2 cp = d.xz / (y + 0.12) * 0.55 + uTime * vec2(0.0025, 0.001);
          float c = texture2D(uCloud, cp * vec2(0.6, 1.6)).r * 0.6 + texture2D(uCloud, cp * 2.1).r * 0.4;
          float cm = smoothstep(0.52, 0.78, c) * smoothstep(0.0, 0.18, y) * (1.0 - smoothstep(0.5, 0.9, y));
          vec3 cc = mix(vec3(0.55, 0.36, 0.48), vec3(1.25, 0.82, 0.55), pow(sun, 3.0) * 0.8 + 0.25);
          col = mix(col, cc, cm * 0.75);
        }
        // the sun itself, a disc with a hot halo
        col += uSunColor * (smoothstep(0.9993, 0.99965, sun) * 26.0 + pow(sun, 380.0) * 3.0);
        // under the horizon: the sea's haze
        if (y < 0.0) col = mix(uHor * vec3(0.85, 0.8, 0.85), vec3(0.05, 0.12, 0.2), clamp(-y * 3.0, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, ...sky };
}
