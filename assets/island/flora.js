// Everything that grows on the island, and the few things that washed up on it.
// Placement is deterministic (seeded), so the island is the same island every visit.
import * as THREE from 'three';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';
import { U, patch, shadowTwin, mulberry } from './shaderlib.js';
import { H, islandR, trailDist, ground, HALL, BOUNDS, fbm } from './world.js';

const rnd = mulberry(2024);
const R = (a, b) => a + (b - a) * rnd();
const pick = a => a[(rnd() * a.length) | 0];

export const colliders = [];      // { x, z, r }
export const rustlers = [];        // { mesh, attr, list:[{x,z,r}] } for the bushes you push through
export let pier = null;            // { x0, x1, z0, z1, y }

// ---------------------------------------------------------------- palm parts
function trunkTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, '#6d5a45'); grd.addColorStop(0.5, '#9b8466'); grd.addColorStop(1, '#6d5a45');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 512);
  const r = mulberry(7);
  for (let y = 0; y < 512; y += 10 + r() * 8) {
    g.fillStyle = `rgba(${40 + r() * 30},${30 + r() * 20},${20},${0.35 + r() * 0.3})`;
    g.fillRect(0, y, 128, 2 + r() * 3);
    g.fillStyle = `rgba(220,200,170,${0.12 + r() * 0.12})`;
    g.fillRect(0, y + 3, 128, 1.5);
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() * 60},${r() * 50},${r() * 30},${r() * 0.18})`; g.fillRect(r() * 128, r() * 512, 1 + r() * 3, 1 + r() * 6); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// one frond: a strip along a drooping arc, folded into a shallow inverted V like a real palm leaf
function frond(base, az, elev, L, droop, row, tint, swayBase, seg = 10) {
  const pos = [], uv = [], col = [], sway = [], idx = [];
  const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const half = L * 0.27, fold = 0.32 + rnd() * 0.12;
  const twist = R(-0.25, 0.25);
  for (let i = 0; i <= seg; i++) {
    const s = i / seg;
    const along = L * s * Math.cos(elev * (1 - s * 0.6));
    const up = L * (Math.sin(elev) * s - droop * s * s);
    const c = base.clone().addScaledVector(dir, along); c.y += up;
    const tw = twist * s;
    const sx = side.clone().multiplyScalar(Math.cos(tw)), sy = Math.sin(tw);
    for (let k = -1; k <= 1; k++) {
      const p = c.clone().addScaledVector(sx, k * half * (0.35 + 0.65 * Math.min(1, s * 3)));
      p.y += (k === 0 ? 0 : -fold * half) + k * sy * half;
      pos.push(p.x, p.y, p.z);
      uv.push(s, row * 0.5 + (k + 1) * 0.25);
      col.push(tint[0], tint[1], tint[2]);
      sway.push(swayBase + s * s * 1.6);
    }
  }
  for (let i = 0; i < seg; i++) for (let k = 0; k < 2; k++) {
    const a = i * 3 + k, b = a + 1, c2 = a + 3, d = a + 4;
    idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function crown(top, n, Lmin, Lmax, swayBase, opts = {}) {
  const parts = [];
  const a0 = rnd() * 6.28;
  for (let i = 0; i < n; i++) {
    const az = a0 + i / n * Math.PI * 2 + R(-0.25, 0.25);
    const layer = i % 3;
    const elev = opts.bush ? R(0.55, 1.05) : [0.75, 0.32, -0.05][layer] + R(-0.12, 0.12);
    const L = R(Lmin, Lmax);
    const droop = opts.bush ? R(0.45, 0.8) : [0.7, 0.85, 0.75][layer] + R(-0.1, 0.15);
    const old = !opts.bush && layer === 2 && rnd() < 0.45;
    const g = 0.86 + rnd() * 0.22;
    const tint = old ? [0.78, 0.62, 0.38] : [g * (0.62 + rnd() * 0.12), g * 0.9, g * 0.6];
    parts.push(frond(top, az, elev, L, droop, old || rnd() < 0.15 ? 1 : 0, tint, swayBase));
  }
  if (!opts.bush) {
    // the spear: two young fronds standing almost straight up
    for (let i = 0; i < 2; i++) parts.push(frond(top, a0 + i * 2.2, 1.25, Lmin * 0.6, 0.5, 0, [1.0, 1.05, 0.85], swayBase));
  }
  return mergeGeometries(parts);
}

function trunk(h, lean, seg = 16, sides = 9) {
  const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.18, h * 0.33, 0), new THREE.Vector3(lean * 0.62, h * 0.7, 0), new THREE.Vector3(lean, h, 0)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], uv = [], nor = [], col = [], sway = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t);
    const r = (0.22 - 0.09 * t + (t < 0.08 ? (0.08 - t) * 2.2 : 0)) * (1 + 0.06 * Math.sin(t * 40));
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      const p = c.clone().addScaledVector(n, r);
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(j / sides, t * h / 1.6);
      col.push(1, 1, 1); sway.push(t * t);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  // coconuts under the crown
  const nuts = [];
  const top = curve.getPointAt(1);
  const k = 3 + ((rnd() * 3) | 0);
  for (let i = 0; i < k; i++) {
    const s = new THREE.SphereGeometry(R(0.12, 0.16), 8, 6);
    const a = i / k * 6.28 + rnd();
    s.translate(top.x + Math.cos(a) * 0.2, top.y - 0.16 - rnd() * 0.08, top.z + Math.sin(a) * 0.2);
    const n = s.attributes.position.count;
    const green = rnd() < 0.5;
    s.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => green ? [0.55, 0.62, 0.25] : [0.5, 0.33, 0.18]), 3));
    s.setAttribute('aSway', new THREE.Float32BufferAttribute(new Array(n).fill(1), 1));
    s.deleteAttribute('uv'); s.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n * 2).fill(0.02), 2));
    nuts.push(s);
  }
  return { geo: mergeGeometries([g, ...nuts]), top };
}

// ---------------------------------------------------------------- placement helpers
const pts = [];
function free(x, z, r) { for (const p of pts) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + r) ** 2) return false; return true; }
function nearHall(x, z, m) { return Math.abs(x - HALL.x) < HALL.w / 2 + 1.5 + m && z > HALL.z - HALL.d / 2 - 1 - m && z < HALL.z + HALL.d / 2 + 3.2 + m; }
function seaward(x, z) {
  const e = 0.5, dx = islandR(x + e, z) - islandR(x - e, z), dz = islandR(x, z + e) - islandR(x, z - e);
  const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l];
}
function instanced(geo, mat, list, { cast = true, receive = true, depth = null } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const o = new THREE.Object3D();
  list.forEach((p, i) => {
    o.position.set(p.x, p.y, p.z); o.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0); o.scale.setScalar(p.s || 1);
    if (p.sy) o.scale.set(p.s, p.s * p.sy, p.s);
    o.updateMatrix(); m.setMatrixAt(i, o.matrix);
  });
  m.castShadow = cast; m.receiveShadow = receive;
  if (depth) m.customDepthMaterial = depth;
  m.computeBoundingSphere();
  return m;
}

// ---------------------------------------------------------------- build
export function buildFlora(A, quality) {
  const group = new THREE.Group();
  const shadowsOn = quality.plantShadows;

  // hall footprint and the trails are kept clear
  pts.push({ x: HALL.x, z: HALL.z, r: 0.1 });

  // ---------- palms
  const frondMat = new THREE.MeshStandardMaterial({ map: A.fronds, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.62, metalness: 0 });
  const palmWind = { amp: 0.11, flutter: 0.035, attr: true };
  patch(frondMat, { wind: palmWind, leaf: 0.55 });
  const frondDepth = shadowTwin(frondMat, { wind: palmWind });
  const trunkMat = new THREE.MeshStandardMaterial({ map: trunkTexture(), vertexColors: true, roughness: 0.9 });
  patch(trunkMat, { wind: { amp: 0.11, flutter: 0.0, attr: true } });
  const trunkDepth = shadowTwin(trunkMat, { wind: { amp: 0.11, flutter: 0, attr: true } });

  const VARIANTS = 6;
  const palmVar = [];
  for (let v = 0; v < VARIANTS; v++) {
    const h = R(4.6, 7.4), lean = R(0.6, 2.4) * (v % 3 === 0 ? 0.35 : 1);
    const t = trunk(h, lean);
    palmVar.push({ trunk: t.geo, crown: crown(t.top, 11 + ((rnd() * 4) | 0), 2.6, 3.7, 1.0), h, lean, list: [] });
  }
  let palms = 0;
  for (let tries = 0; tries < 6000 && palms < quality.palms; tries++) {
    const x = R(-34, 34), z = R(-22, 26);
    const h = H(x, z), r = islandR(x, z);
    if (h < 0.55 || h > 4.2 || r > 0.97) continue;
    if (nearHall(x, z, 0.5)) continue;
    const td = trailDist(x, z);
    if (td < 1.5) continue;
    // denser along the beach crest and beside the trails, so the trails run under canopy
    // groves with clearings between them, and a ragged line of palms along the beach crest
    const f = fbm(x * 0.07 + 5, z * 0.07 + 2), grove = f < 0.42 ? 0 : f > 0.6 ? 1 : (f - 0.42) / 0.18;
    const want = (h < 1.4 ? 0.85 : 0.35 * grove) + (td < 4.5 ? 0.45 * grove : 0) + (z < -14 ? -0.25 : 0);
    if (rnd() > want) continue;
    if (!free(x, z, 2.1)) continue;
    const v = palmVar[(rnd() * VARIANTS) | 0];
    const [sx, sz] = seaward(x, z);
    const towardSea = h < 1.6 || rnd() < 0.5;
    const ang = towardSea ? Math.atan2(sz, sx) : rnd() * 6.28;
    v.list.push({ x, y: h - 0.05, z, ry: -ang, s: R(0.85, 1.12) });
    pts.push({ x, z, r: 1.4 });
    colliders.push({ x, z, r: 0.3 });
    palms++;
  }
  for (const v of palmVar) {
    if (!v.list.length) continue;
    group.add(instanced(v.trunk, trunkMat, v.list, { cast: true, depth: trunkDepth }));
    group.add(instanced(v.crown, frondMat, v.list, { cast: true, depth: frondDepth }));
  }

  // ---------- palm bushes along the trails: the fronds you push through
  const bushWind = { amp: 0.06, flutter: 0.02, attr: true, push: { r: 1.15, amt: 0.55 }, rustle: true };
  const bushMat = frondMat.clone(); bushMat.vertexColors = true;
  patch(bushMat, { wind: bushWind, leaf: 0.55 });
  const bushDepth = shadowTwin(bushMat, { wind: bushWind });
  const bushVar = [];
  for (let v = 0; v < 4; v++) bushVar.push({ geo: crown(new THREE.Vector3(0, 0.12, 0), 9 + v, 1.0, 1.5, 0.0, { bush: true }), list: [] });
  let bushes = 0;
  for (let tries = 0; tries < 9000 && bushes < quality.bushes; tries++) {
    // seed from points along the trails, pushed off to one side
    const T = pick([0, 0, 1, 1, 2, 2, 3]);
    const x0 = R(-30, 26), z0 = R(-12, 22);
    const td = trailDist(x0, z0);
    const x = x0, z = z0;
    const h = H(x, z);
    if (h < 0.7 || h > 4.5 || islandR(x, z) > 0.93) continue;
    if (nearHall(x, z, 0)) continue;
    const want = td > 1.25 && td < 2.6 ? 1 : td < 5 ? 0.06 : 0.01;
    if (rnd() > want) continue;
    if (!free(x, z, 0.55)) continue;
    const v = bushVar[(rnd() * bushVar.length) | 0];
    v.list.push({ x, y: h, z, ry: rnd() * 6.28, s: R(0.75, 1.1) });
    pts.push({ x, z, r: 0.5 });
    bushes++;
  }
  for (const v of bushVar) {
    if (!v.list.length) continue;
    const m = instanced(v.geo, bushMat, v.list, { cast: shadowsOn, depth: bushDepth });
    addRustle(m, v.list, 0.95);
    group.add(m);
  }

  // ---------- ferns and calathea, photographed plants from Poly Haven
  const plantWind = (h) => ({ amp: 0.04, flutter: 0.012, h, push: { r: 0.85, amt: 0.38 }, rustle: true });
  function plantSet(meshes, tex, count, accept, scale, h, leaf, tint = [1, 1, 1]) {
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, color: new THREE.Color(...tint) });
    patch(mat, { wind: plantWind(h), leaf });
    const depth = shadowTwin(mat, { wind: plantWind(h) });
    const lists = meshes.map(() => []);
    let n = 0;
    for (let tries = 0; tries < count * 40 && n < count; tries++) {
      const x = R(-33, 33), z = R(-20, 24);
      const hh = H(x, z);
      if (!accept(x, z, hh)) continue;
      if (nearHall(x, z, -0.6)) continue;
      if (!free(x, z, 0.35)) continue;
      const i = (rnd() * meshes.length) | 0;
      lists[i].push({ x, y: hh - 0.04, z, ry: rnd() * 6.28, s: R(scale[0], scale[1]) });
      pts.push({ x, z, r: 0.3 });
      n++;
    }
    meshes.forEach((g, i) => {
      if (!lists[i].length) return;
      const m = instanced(g, mat, lists[i], { cast: shadowsOn, depth });
      addRustle(m, lists[i], 0.6);
      group.add(m);
    });
  }
  plantSet(A.fern, A.fernTex, quality.ferns, (x, z, h) => {
    if (h < 0.8 || islandR(x, z) > 0.9) return false;
    const td = trailDist(x, z);
    if (td < 1.0) return false;
    return rnd() < (td < 2.8 ? 0.8 : 0.1) * (ground(x, z) === 'rock' ? 0.3 : 1);
  }, [1.7, 2.7], 0.45, 0.35, [1.0, 1.08, 0.95]);
  plantSet(A.calathea, A.calatheaTex, quality.calathea, (x, z, h) => {
    if (h < 1.2 || islandR(x, z) > 0.86) return false;
    const td = trailDist(x, z);
    if (td < 0.8) return false;
    return rnd() < (td < 3 ? 0.7 : 0.12);
  }, [1.8, 2.8], 0.4, 0.3, [2.4, 2.6, 2.2]);

  // ---------- grass
  {
    const blade = new THREE.PlaneGeometry(0.05, 0.42, 1, 3);
    blade.translate(0, 0.21, 0);
    const bp = blade.attributes.position;
    const bc = [];
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i) / 0.42;
      bp.setX(i, bp.getX(i) * (1 - y * 0.85) + y * y * 0.06);
      bc.push(0.2 + y * 0.35, 0.32 + y * 0.45, 0.1 + y * 0.12);
    }
    blade.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
    blade.computeVertexNormals();
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
    patch(gm, { wind: { amp: 0.09, flutter: 0.02, h: 0.42, push: { r: 0.7, amt: 0.32 } }, leaf: 0.45 });
    const list = [];
    for (let tries = 0; tries < quality.grass * 4 && list.length < quality.grass; tries++) {
      const x = R(-33, 33), z = R(-22, 25);
      const h = H(x, z);
      const g = ground(x, z);
      if (g !== 'grass') continue;
      if (nearHall(x, z, -1)) continue;
      if (trailDist(x, z) < 0.55) continue;
      const clump = fbm(x * 0.4, z * 0.4);
      if (rnd() > clump * 1.4) continue;
      list.push({ x, y: h - 0.02, z, ry: rnd() * 6.28, s: R(0.7, 1.4), sy: R(0.7, 1.5) });
    }
    group.add(instanced(blade, gm, list, { cast: false }));

    // beach grass, tufts of longer, paler blades on the dune line
    const tuftParts = [];
    for (let i = 0; i < 9; i++) {
      const b = blade.clone(); b.scale(1.3, R(1.6, 2.6), 1);
      b.rotateZ(R(-0.4, 0.4)); b.rotateY(rnd() * 6.28); b.translate(R(-0.12, 0.12), 0, R(-0.12, 0.12));
      const c = b.attributes.color; for (let k = 0; k < c.count; k++) c.setXYZ(k, c.getX(k) * 1.25 + 0.12, c.getY(k) * 1.1 + 0.06, c.getZ(k) * 0.8 + 0.05);
      tuftParts.push(b);
    }
    const tuft = mergeGeometries(tuftParts);
    const tm = gm.clone(); patch(tm, { wind: { amp: 0.12, flutter: 0.03, h: 1.0, push: { r: 0.8, amt: 0.4 } }, leaf: 0.5 });
    const tl = [];
    for (let tries = 0; tries < 4000 && tl.length < quality.tufts; tries++) {
      const x = R(-35, 35), z = R(-24, 27), h = H(x, z);
      if (h < 0.42 || h > 1.1 || ground(x, z) === 'rock') continue;
      if (trailDist(x, z) < 0.8 || !free(x, z, 0.4)) continue;
      tl.push({ x, y: h - 0.03, z, ry: rnd() * 6.28, s: R(0.8, 1.3) });
      pts.push({ x, z, r: 0.25 });
    }
    group.add(instanced(tuft, tm, tl, { cast: shadowsOn }));
  }

  // ---------- flowers: hibiscus-red, frangipani-white, a few gold, in loose drifts
  const flowers = [];
  {
    const petals = [];
    for (let i = 0; i < 5; i++) {
      const p = new THREE.CircleGeometry(0.07, 6);
      p.scale(1, 0.55, 1); p.translate(0.07, 0, 0); p.rotateZ(i / 5 * Math.PI * 2); p.rotateX(-Math.PI / 2 + 0.35);
      petals.push(p);
    }
    const head = mergeGeometries(petals); head.translate(0, 0.32, 0);
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.32, 3); stem.translate(0, 0.16, 0);
    const colorize = (g, c) => { const n = g.attributes.position.count; g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => c), 3)); return g; };
    const palette = [[0.95, 0.12, 0.16], [1.0, 0.95, 0.85], [1.0, 0.72, 0.15], [0.95, 0.35, 0.55]];
    const fm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 });
    patch(fm, { wind: { amp: 0.05, flutter: 0.02, h: 0.35, push: { r: 0.6, amt: 0.25 } }, leaf: 0.6 });
    palette.forEach((col, ci) => {
      const g = mergeGeometries([colorize(head.clone(), col), colorize(stem.clone(), [0.25, 0.45, 0.15])]);
      const list = [];
      for (let tries = 0; tries < 3000 && list.length < quality.flowers / palette.length; tries++) {
        const x = R(-32, 32), z = R(-20, 24), h = H(x, z);
        if (ground(x, z) !== 'grass' || trailDist(x, z) < 0.6 || nearHall(x, z, -1)) continue;
        if (fbm(x * 0.21 + ci * 7, z * 0.21) < 0.58) continue;
        list.push({ x, y: h - 0.02, z, ry: rnd() * 6.28, s: R(0.8, 1.3) });
        flowers.push({ x, y: h + 0.35, z });
      }
      if (list.length) group.add(instanced(g, fm, list, { cast: false }));
    });
  }

  // ---------- boulders
  {
    const rockSets = [[A.rock07, A.rock07Tex, 0.14], [A.rock09, A.rock09Tex, 0.065]];
    const placeRock = (x, z, size, sink = 0.25) => {
      const set = pick(rockSets);
      const s = size / set[2];
      return { set, p: { x, y: H(x, z) - size * sink, z, ry: rnd() * 6.28, rx: R(-0.2, 0.2), rz: R(-0.2, 0.2), s } };
    };
    const lists = new Map(rockSets.map(r => [r, []]));
    const add = (x, z, size, sink, collide = true) => {
      const { set, p } = placeRock(x, z, size, sink);
      lists.get(set).push(p);
      if (collide && H(x, z) > -0.4) colliders.push({ x, z, r: size * 0.85 });
      pts.push({ x, z, r: size });
    };
    // the north shoulder behind the hall
    for (let i = 0; i < quality.boulders; i++) {
      const a = R(-2.4, -0.7), rr = R(0.82, 1.03);
      const x = Math.cos(a) * 34 * rr, z = Math.sin(a) * 25.5 * rr;
      if (!free(x, z, 1)) continue;
      add(x, z, R(0.9, 2.6), 0.3);
    }
    // the west point
    for (let i = 0; i < 12; i++) { const x = R(-38, -27), z = R(-7, 4); if (H(x, z) > -1.5 && free(x, z, 0.8)) add(x, z, R(0.7, 2.2), 0.25); }
    // stones along the tideline, and a few in the shallows to wade round
    for (let i = 0; i < 12; i++) {
      const a = rnd() * 6.28; let x = 0, z = 0;
      for (let k = 0; k < 30; k++) { x = Math.cos(a) * R(20, 40); z = Math.sin(a) * R(14, 30); const h = H(x, z); if (h > -0.35 && h < 0.05) break; }
      if (H(x, z) > -0.4 && H(x, z) < 0.1 && free(x, z, 0.6)) add(x, z, R(0.3, 0.7), 0.4);
    }
    // a few beside the trails, mossy and half buried
    for (let i = 0; i < 10; i++) { const x = R(-28, 24), z = R(-8, 20); const td = trailDist(x, z); if (td > 1.4 && td < 3 && H(x, z) > 1 && free(x, z, 0.6)) add(x, z, R(0.4, 0.9), 0.45); }
    for (const [set, list] of lists) {
      if (!list.length) continue;
      const m = new THREE.MeshStandardMaterial({ map: set[1], roughness: 0.82, color: 0xf2e8dc });
      patch(m, {});
      group.add(instanced(set[0], m, list, { cast: true }));
    }
  }

  // ---------- shells and driftwood
  {
    const list = [];
    for (let tries = 0; tries < 2000 && list.length < 9; tries++) {
      const x = R(-34, 34), z = R(-10, 27), h = H(x, z);
      if (h < 0.18 || h > 0.55 || !free(x, z, 0.4)) continue;
      list.push({ x, y: h - 0.01, z, ry: rnd() * 6.28, s: R(1.6, 2.4) });
      pts.push({ x, z, r: 0.3 });
    }
    const m = new THREE.MeshStandardMaterial({ map: A.shellTex, roughness: 0.45 });
    patch(m, {});
    group.add(instanced(A.shell, m, list, { cast: true }));

    const wood = new THREE.MeshStandardMaterial({ map: A.planks, color: 0xc9b9a0, roughness: 0.95 });
    patch(wood, {});
    for (let i = 0, made = 0; i < 400 && made < 5; i++) {
      const x = R(-32, 32), z = R(-6, 26), h = H(x, z);
      if (h < 0.35 || h > 0.75 || !free(x, z, 1.5)) continue;
      const len = R(1.6, 3.2);
      const g = new THREE.CylinderGeometry(R(0.08, 0.13), R(0.11, 0.17), len, 7, 3);
      g.rotateZ(Math.PI / 2);
      const mm = new THREE.Mesh(g, wood);
      mm.position.set(x, h + 0.06, z); mm.rotation.y = rnd() * 6.28; mm.rotation.x = R(-0.08, 0.08);
      mm.castShadow = mm.receiveShadow = true;
      group.add(mm);
      // a stub of a branch
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.6, 5), wood);
      b.position.set(len * 0.2, 0.15, 0); b.rotation.z = -0.9; mm.add(b);
      colliders.push({ x, z, r: 0.25 });
      pts.push({ x, z, r: len / 2 });
      made++;
    }
  }

  // ---------- the jetty in the east cove
  {
    const wood = new THREE.MeshStandardMaterial({ map: A.planks, color: 0xd6c3a6, roughness: 0.9 });
    patch(wood, {});
    const x0 = 23.4, x1 = 31.5, zc = 6.6, w = 1.5, y = 0.62;
    pier = { x0, x1, z0: zc - w / 2, z1: zc + w / 2, y };
    const jg = new THREE.Group();
    const planks = Math.round((x1 - x0) / 0.3);
    for (let i = 0; i < planks; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.06, w * R(0.96, 1.04)), wood);
      p.position.set(x0 + 0.15 + i * 0.3, y - 0.03 - rnd() * 0.02, zc + R(-0.03, 0.03));
      p.rotation.y = R(-0.02, 0.02);
      p.castShadow = p.receiveShadow = true; jg.add(p);
    }
    for (const sz of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.12, 0.12), wood);
      beam.position.set((x0 + x1) / 2, y - 0.12, zc + sz * (w / 2 - 0.1)); beam.castShadow = true; jg.add(beam);
    }
    const posts = [];
    for (let px = x0 + 0.4; px <= x1 + 0.01; px += 1.6) for (const sz of [-1, 1]) {
      const top = y + (px > x1 - 1 || rnd() < 0.35 ? 0.45 : 0.08);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, top + 3, 7), wood);
      post.position.set(px, top - (top + 3) / 2, zc + sz * (w / 2 + 0.02));
      post.castShadow = true; jg.add(post);
      posts.push({ x: px, y: top, z: zc + sz * (w / 2 + 0.02) });
    }
    // rope between the tall posts at the end
    pier.posts = posts;
    group.add(jg);
  }

  return { group, flowers };
}

// per-instance rustle, kicked when the automaton brushes a plant and decayed every frame
function addRustle(mesh, list, r) {
  const arr = new Float32Array(list.length);
  const attr = new THREE.InstancedBufferAttribute(arr, 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.setAttribute('aRustle', attr);
  rustlers.push({ mesh, attr, list: list.map(p => ({ x: p.x, z: p.z, r: r * (p.s || 1) * 0.6, hot: 0 })) });
}
