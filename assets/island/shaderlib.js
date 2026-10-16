// Shared shader plumbing for the island. Every lit thing on the island is a stock
// MeshStandardMaterial with a few chunks swapped, so shadows, fog, IBL and tone mapping
// stay three's problem and the island only adds what three does not have:
//   wind      plants bend in travelling gusts, parted by the automaton as it walks through
//   rustle    a per-instance shiver, kicked by the player and decaying in JS
//   clouds    one scrolling noise field darkens direct sun everywhere at once
//   leaf      sun through a leaf, the warm glow foliage gets when it is backlit
//   splat     the terrain blends five photographed grounds by vertex weights and height
import * as THREE from 'three';

export const U = {
  uTime:      { value: 0 },
  uSunDir:    { value: new THREE.Vector3(0, 1, 0) },   // world, toward the sun
  uSunView:   { value: new THREE.Vector3(0, 0, 1) },   // the same, in view space
  uSunColor:  { value: new THREE.Color(1, 0.8, 0.6) },
  uPlayer:    { value: new THREE.Vector3(0, -99, 0) },
  uPlayerVel: { value: new THREE.Vector2() },
  uWater:     { value: 0 },
  uCloud:     { value: null },
  uWindDir:   { value: new THREE.Vector2(0.94, 0.34) },
};

const COMMON_V = /* glsl */`
uniform float uTime;
uniform vec3 uPlayer;
uniform vec2 uWindDir;
varying vec3 vWorldPos;
#ifdef RUSTLE
attribute float aRustle;
#endif
#ifdef SWAY_ATTR
attribute float aSway;
#endif
uniform float uSwayAmp;
uniform float uFlutter;
uniform float uSwayH;
uniform float uPushR;
uniform float uPushAmt;
vec3 islandWind(vec3 wp, vec3 root, float w){
  float ph = dot(root.xz, vec2(0.13, 0.087));
  float gust = 0.55 + 0.45 * sin(uTime * 0.61 + ph * 1.7) * sin(uTime * 0.23 + ph * 0.6);
  float sway = sin(uTime * 1.35 + ph * 3.1) * 0.55 + 0.65;
  vec3 off = vec3(uWindDir.x, 0.0, uWindDir.y) * sway * gust * uSwayAmp * w;
  off += vec3(sin(uTime * 6.3 + wp.x * 3.7 + wp.y * 2.1),
              sin(uTime * 7.9 + wp.z * 4.3) * 0.7,
              cos(uTime * 7.1 + wp.y * 3.3 + wp.x * 1.3)) * uFlutter * w * (0.4 + gust);
  #ifdef PUSH
  vec2 d = wp.xz - uPlayer.xz;
  float dist = length(d);
  float near = 1.0 - smoothstep(0.15, uPushR, dist);
  near *= step(abs(wp.y - uPlayer.y), 2.2);
  off.xz += (d / max(dist, 1e-3)) * near * uPushAmt * w;
  off.y -= near * uPushAmt * 0.35 * w;
  #endif
  #ifdef RUSTLE
  off += vec3(sin(uTime * 31.0 + wp.y * 9.0), sin(uTime * 23.0 + wp.x * 7.0) * 0.5, cos(uTime * 27.0 + wp.z * 8.0)) * aRustle * 0.09 * w;
  #endif
  return off;
}
`;

const PROJECT_V = /* glsl */`
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 wp = modelMatrix * mvPosition;
#ifdef WIND
  vec3 root = (modelMatrix * (
  #ifdef USE_INSTANCING
    instanceMatrix *
  #endif
    vec4(0.0, 0.0, 0.0, 1.0))).xyz;
  float w = 0.0;
  #ifdef SWAY_ATTR
    w = aSway;
  #else
    w = clamp(transformed.y / uSwayH, 0.0, 1.0); w *= w;
  #endif
  wp.xyz += islandWind(wp.xyz, root, w);
#endif
vWorldPos = wp.xyz;
mvPosition = viewMatrix * wp;
gl_Position = projectionMatrix * mvPosition;
`;

const COMMON_F = /* glsl */`
uniform float uTime;
uniform sampler2D uCloud;
uniform vec3 uSunView;
uniform vec3 uSunColor;
uniform float uLeaf;
varying vec3 vWorldPos;
float islandCloud(vec3 p){
  vec2 uv = p.xz * 0.019 + uTime * vec2(0.0075, 0.003);
  float n = texture2D(uCloud, uv).r * 0.65 + texture2D(uCloud, uv * 2.3 + 0.37).r * 0.35;
  return mix(1.0, 0.52, smoothstep(0.50, 0.70, n));
}
`;

const CLOUD_F = /* glsl */`
#include <lights_fragment_begin>
float cloudK = islandCloud(vWorldPos);
reflectedLight.directDiffuse *= cloudK;
reflectedLight.directSpecular *= cloudK;
`;

const LEAF_F = /* glsl */`
#include <lights_fragment_end>
#ifdef LEAF
{
  // leaves step aside for the camera: a dithered fade inside arm's reach of the lens
  float cd = length(vWorldPos - cameraPosition);
  float keep = smoothstep(0.9, 2.2, cd);
  float dth = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (keep < dth) discard;
}
#endif
#ifdef LEAF
{
  vec3 toFrag = -normalize(vViewPosition);
  float back = pow(max(dot(toFrag, uSunView), 0.0), 3.0);
  float wrap = 0.08;
  totalEmissiveRadiance += diffuseColor.rgb * uSunColor * (back * 0.7 + wrap) * uLeaf * cloudK;
}
#endif
`;

// Patch a stock material. opts:
//   wind: { amp, flutter, h (height of full bend), attr (use aSway), push: { r, amt }, rustle }
//   leaf: strength of backlit glow
//   extraVertex / extraFragment: { pars, main } snippets for one-off effects
export function patch(mat, opts = {}) {
  const key = JSON.stringify(opts, (k, v) => typeof v === 'function' ? String(v) : v);
  mat.customProgramCacheKey = () => key;
  mat.defines = mat.defines || {};
  const w = opts.wind;
  if (w) {
    mat.defines.WIND = '';
    if (w.attr) mat.defines.SWAY_ATTR = '';
    if (w.push) mat.defines.PUSH = '';
    if (w.rustle) mat.defines.RUSTLE = '';
  }
  if (opts.leaf) mat.defines.LEAF = '';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uPlayer = U.uPlayer;
    sh.uniforms.uWindDir = U.uWindDir;
    sh.uniforms.uCloud = U.uCloud;
    sh.uniforms.uSunView = U.uSunView;
    sh.uniforms.uSunColor = U.uSunColor;
    sh.uniforms.uWater = U.uWater;
    sh.uniforms.uSwayAmp = { value: w ? w.amp ?? 0.1 : 0 };
    sh.uniforms.uFlutter = { value: w ? w.flutter ?? 0.01 : 0 };
    sh.uniforms.uSwayH = { value: w ? w.h ?? 1 : 1 };
    sh.uniforms.uPushR = { value: w && w.push ? w.push.r : 1 };
    sh.uniforms.uPushAmt = { value: w && w.push ? w.push.amt : 0 };
    sh.uniforms.uLeaf = { value: opts.leaf || 0 };
    if (opts.uniforms) Object.assign(sh.uniforms, opts.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON_V + (opts.extraVertex?.pars || ''))
      .replace('#include <project_vertex>', PROJECT_V + (opts.extraVertex?.main || ''))
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = wp;');
    if (sh.fragmentShader.includes('#include <lights_fragment_begin>')) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + COMMON_F + (opts.extraFragment?.pars || ''))
        .replace('#include <lights_fragment_begin>', CLOUD_F)
        .replace('#include <lights_fragment_end>', LEAF_F);
      if (opts.extraFragment?.map) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', opts.extraFragment.map);
      if (opts.extraFragment?.normal) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', opts.extraFragment.normal);
      if (opts.extraFragment?.rough) sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', opts.extraFragment.rough);
      if (opts.extraFragment?.end) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', opts.extraFragment.end + '\n#include <opaque_fragment>');
    } else {
      // depth material: needs the varying declared, nothing else
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;');
    }
  };
  return mat;
}

// A depth material for shadows that bends with the same wind as the lit one.
export function shadowTwin(mat, opts) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map || null, alphaTest: mat.alphaTest || 0, side: mat.side });
  patch(d, { wind: opts.wind });
  return d;
}

// Tileable value-noise texture for cloud shadows, built once.
export function cloudTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const g = 8, grid = [];
  const rnd = mulberry(91);
  for (let i = 0; i < g * g; i++) grid.push(rnd());
  const g2 = 21, grid2 = [];
  for (let i = 0; i < g2 * g2; i++) grid2.push(rnd());
  const smp = (gr, n, x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const at = (a, b) => gr[((b % n + n) % n) * n + ((a % n + n) % n)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = smp(grid, g, x / size * g, y / size * g) * 0.7 + smp(grid2, g2, x / size * g2, y / size * g2) * 0.3;
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.round(v * 255); data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
