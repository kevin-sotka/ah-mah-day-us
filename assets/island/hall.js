// The Keystone Hall from outside. You were just in there; now the doors are shut and the
// machine is singing behind them. Amber light at every window, a seam of it under the door,
// and the armillary on the dome turning in the sun.
import * as THREE from 'three';
import { U, patch } from './shaderlib.js';
import { HALL } from './world.js';

// world-space triplanar texturing, so stone runs continuously across every block and
// nothing needs hand UVs
function stone(tex, ntex, scale, tint, rough = 0.85) {
  const m = new THREE.MeshStandardMaterial({ map: tex, normalMap: ntex || null, color: tint, roughness: rough });
  patch(m, {
    uniforms: { tTri: { value: tex }, nTri: { value: ntex || tex }, uTriS: { value: scale } },
    extraVertex: { pars: 'varying vec3 vWN;', main: 'vWN = normalize(mat3(modelMatrix) * objectNormal);' },
    extraFragment: {
      pars: `uniform sampler2D tTri, nTri; uniform float uTriS; varying vec3 vWN;
        vec3 triW(){ vec3 b = pow(abs(normalize(vWN)), vec3(6.0)); return b / (b.x + b.y + b.z); }`,
      map: `{
        vec3 b = triW(); vec3 p = vWorldPos * uTriS;
        vec4 c = texture2D(tTri, p.zy) * b.x + texture2D(tTri, p.xz) * b.y + texture2D(tTri, p.xy) * b.z;
        diffuseColor *= c;
      }`,
      normal: ntex ? `{
        vec3 b = triW(); vec3 p = vWorldPos * uTriS;
        vec3 nn = (texture2D(nTri, p.zy).xyz * b.x + texture2D(nTri, p.xz).xyz * b.y + texture2D(nTri, p.xy).xyz * b.z) * 2.0 - 1.0;
        nn.xy *= 0.8;
        vec2 uvp = abs(vWN.x) > 0.5 ? p.zy : abs(vWN.y) > 0.5 ? p.xz : p.xy;
        mat3 tb = getTangentFrame(-vViewPosition, normal, uvp);
        normal = normalize(tb * nn);
      }` : undefined,
    },
  });
  return m;
}

function archShape(w, h, x = 0, y = 0) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(x - r, y); s.lineTo(x - r, y + h - r);
  s.absarc(x, y + h - r, r, Math.PI, 0, true);
  s.lineTo(x + r, y); s.lineTo(x - r, y);
  return s;
}
function archPath(w, h, x = 0, y = 0) {
  const p = new THREE.Path(); const r = w / 2;
  p.moveTo(x - r, y); p.lineTo(x + r, y); p.lineTo(x + r, y + h - r);
  p.absarc(x, y + h - r, r, 0, Math.PI, false);
  p.lineTo(x - r, y);
  return p;
}

export function buildHall(A, quality) {
  const g = new THREE.Group();
  g.position.set(HALL.x, HALL.y, HALL.z);
  const brick = stone(A.brick, A.brick_n, 0.42, 0xffffff, 0.86);
  const blocks = stone(A.blocks, null, 0.28, 0xe8dcc8, 0.9);
  const copper = new THREE.MeshStandardMaterial({ map: A.slate, color: 0x8fc4ad, metalness: 0.35, roughness: 0.55 });
  patch(copper, {});
  const brass = new THREE.MeshStandardMaterial({ color: 0xd2a650, metalness: 1, roughness: 0.28 });
  patch(brass, {});
  const glow = new THREE.MeshStandardMaterial({ color: 0x2a1406, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 0.3 });
  const woodDark = new THREE.MeshStandardMaterial({ map: A.planks, color: 0x6a4a30, roughness: 0.75 });
  patch(woodDark, {});

  const add = (geo, mat, x, y, z, o = {}) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    if (o.ry) m.rotation.y = o.ry; if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz;
    m.castShadow = o.cast !== false; m.receiveShadow = true; g.add(m); return m;
  };
  const W = HALL.w, D = HALL.d;   // the hall body
  const PH = 0.55;                // plinth height
  const WH = 5.0;                 // wall height above plinth
  const front = D / 2;            // local z of the front face (south)

  // ---- terrace: a broad plinth with a front apron and three steps
  add(new THREE.BoxGeometry(W + 3.2, PH + 0.6, D + 3.6), blocks, 0, PH / 2 - 0.3, 0.6);
  for (let i = 0; i < 3; i++) {
    const sd = 0.42, sh = PH / 3;
    add(new THREE.BoxGeometry(4.6 + (2 - i) * 0.5, sh * (3 - i) + 0.3, sd), blocks, 0, (sh * (3 - i) - 0.3) / 2, front + 2.4 + i * sd + sd / 2);
  }
  // kerb stones along the plinth edge
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.35, 0.12, D + 3.6), blocks, sx * (W / 2 + 1.42), PH + 0.06, 0.6);

  // ---- walls: back and sides solid, the front built as a pierced facade
  const wallT = 0.6;
  add(new THREE.BoxGeometry(W, WH, wallT), brick, 0, PH + WH / 2, -D / 2 + wallT / 2);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(wallT, WH, D), brick, sx * (W / 2 - wallT / 2), PH + WH / 2, 0);
  // the dark interior, so nothing reads as hollow through the windows
  add(new THREE.BoxGeometry(W - 1.1, WH - 0.1, D - 1.1), new THREE.MeshBasicMaterial({ color: 0x120a05 }), 0, PH + WH / 2, 0, { cast: false });

  // front facade with the door and the rose window cut through it, up into the gable
  const roofH = 2.7;
  const fs = new THREE.Shape();
  fs.moveTo(-W / 2, 0); fs.lineTo(W / 2, 0); fs.lineTo(W / 2, WH + 0.2); fs.lineTo(0, WH + roofH + 0.55); fs.lineTo(-W / 2, WH + 0.2); fs.lineTo(-W / 2, 0);
  fs.holes.push(archPath(2.4, 3.5, 0, 0));
  const rose = new THREE.Path(); rose.absarc(0, WH + 0.25, 0.95, 0, Math.PI * 2, true); fs.holes.push(rose);
  const facade = new THREE.ExtrudeGeometry(fs, { depth: wallT, bevelEnabled: false });
  add(facade, brick, 0, PH, front - wallT);

  // the arch surround, proud of the wall
  {
    const s2 = archShape(3.4, 4.2, 0, 0); s2.holes.push(archPath(2.4, 3.5, 0, 0));
    add(new THREE.ExtrudeGeometry(s2, { depth: 0.22, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }), blocks, 0, PH, front - 0.02);
  }
  // the doors: two leaves of dark oak, shut, studded in brass
  const doorZ = front - 0.38;
  const leafW = 1.16;
  for (const sx of [-1, 1]) {
    const ls = new THREE.Shape();
    const r = 1.2;
    if (sx < 0) { ls.moveTo(-r, 0); ls.lineTo(-r, 3.5 - r); ls.absarc(0, 3.5 - r, r, Math.PI, Math.PI / 2, true); ls.lineTo(-0.02, 0); }
    else { ls.moveTo(0.02, 0); ls.lineTo(0.02, 3.5); ls.absarc(0, 3.5 - r, r, Math.PI / 2, 0, true); ls.lineTo(r, 0); }
    add(new THREE.ExtrudeGeometry(ls, { depth: 0.14, bevelEnabled: false }), woodDark, 0, PH, doorZ);
    // iron straps and studs
    for (const y of [0.6, 1.7, 2.7]) {
      add(new THREE.BoxGeometry(leafW - 0.12, 0.08, 0.03), brass, sx * leafW / 2, PH + y, doorZ + 0.155);
      for (let k = 0; k < 4; k++) add(new THREE.SphereGeometry(0.035, 6, 4), brass, sx * (0.12 + k * 0.28), PH + y, doorZ + 0.17, { cast: false });
    }
    const ring = add(new THREE.TorusGeometry(0.11, 0.022, 6, 14), brass, sx * 0.24, PH + 1.55, doorZ + 0.2);
    ring.rotation.x = 0.15;
  }
  // light leaking round the shut door: the seam, the threshold, the rim of the arch
  const seam = add(new THREE.BoxGeometry(0.035, 3.3, 0.02), glow, 0, PH + 1.65, doorZ + 0.145, { cast: false });
  const sill = add(new THREE.BoxGeometry(2.3, 0.04, 0.05), glow, 0, PH + 0.02, doorZ + 0.18, { cast: false });
  const leaks = [seam, sill];

  // ---- the rose window: glowing glass behind stone tracery
  const roseGlass = add(new THREE.CircleGeometry(0.96, 32), glow, 0, PH + WH + 0.25, front - wallT + 0.12, { cast: false });
  const tr = new THREE.Group(); tr.position.set(0, PH + WH + 0.25, front - 0.02); g.add(tr);
  const ringT = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 6, 32), blocks); tr.add(ringT);
  const ringI = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 20), blocks); tr.add(ringI);
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.08), blocks);
    const a = i / 8 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.65, Math.sin(a) * 0.65, 0); sp.rotation.z = a + Math.PI / 2; tr.add(sp);
  }
  tr.children.forEach(c => { c.castShadow = true; });

  // ---- side windows: tall lancets glowing amber, in stone frames
  const panes = [roseGlass];
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = -D / 2 + 2.6 + i * 3.4;
    const pane = add(new THREE.ShapeGeometry(archShape(0.9, 2.4)), glow, sx * (W / 2 + 0.005), PH + 1.5, z, { ry: sx * Math.PI / 2, cast: false });
    panes.push(pane);
    const fr = new THREE.Shape(); const outer = archShape(1.25, 2.7, 0, -0.15); outer.holes.push(archPath(0.9, 2.4));
    add(new THREE.ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: false }), blocks, sx * (W / 2 - 0.02), PH + 1.5, z, { ry: sx * Math.PI / 2 });
    add(new THREE.BoxGeometry(0.05, 2.3, 0.05), blocks, sx * (W / 2 + 0.03), PH + 1.5 + 1.15, z, { cast: false });
  }

  // ---- buttresses at the corners and along the flanks
  for (const sx of [-1, 1]) for (const z of [-D / 2 + 0.2, D / 2 - 0.2, -D / 2 + 4.3, -D / 2 + 7.7]) {
    const corner = Math.abs(z) > D / 2 - 0.5;
    const b1 = add(new THREE.BoxGeometry(0.8, WH + 0.3, corner ? 0.8 : 0.6), blocks, sx * (W / 2 + 0.2), PH + (WH + 0.3) / 2, z);
    const cap = add(new THREE.BoxGeometry(0.95, 0.18, corner ? 0.95 : 0.75), blocks, sx * (W / 2 + 0.2), PH + WH + 0.39, z);
    const ped = add(new THREE.BoxGeometry(1.05, 0.9, corner ? 1.05 : 0.85), blocks, sx * (W / 2 + 0.24), PH + 0.45, z);
  }
  // cornice
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.3, 0.22, D + 0.5), blocks, sx * (W / 2 + 0.05), PH + WH - 0.05, 0);
  add(new THREE.BoxGeometry(W + 0.5, 0.22, 0.3), blocks, 0, PH + WH - 0.05, -D / 2 - 0.05);

  // ---- roof: verdigris copper over slate, a low gable along the length
  const rs = new THREE.Shape();
  rs.moveTo(-W / 2 - 0.45, -0.05); rs.lineTo(W / 2 + 0.45, -0.05); rs.lineTo(0, roofH + 0.25); rs.lineTo(-W / 2 - 0.45, -0.05);
  const roofD = D - wallT + 0.3;
  const roof = new THREE.ExtrudeGeometry(rs, { depth: roofD, bevelEnabled: false });
  roof.translate(0, 0, -D / 2 - 0.3);
  // UVs for the slate along the slope
  { const p = roof.attributes.position, uv = roof.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * 0.35, (p.getY(i) + Math.abs(p.getX(i))) * 0.35); }
  add(roof, copper, 0, PH + WH + 0.02, 0);
  // ridge cap
  add(new THREE.CylinderGeometry(0.11, 0.11, roofD, 8), copper, 0, PH + WH + roofH + 0.24, -D / 2 - 0.3 + roofD / 2, { rx: Math.PI / 2 });

  // ---- the lantern drum and dome, with the armillary turning on top
  const drumY = PH + WH + roofH - 0.6;
  add(new THREE.CylinderGeometry(1.35, 1.45, 1.6, 16), blocks, 0, drumY + 0.8, -1.2);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const w2 = add(new THREE.ShapeGeometry(archShape(0.34, 0.85)), glow, Math.sin(a) * 1.395, drumY + 0.45, -1.2 + Math.cos(a) * 1.395, { ry: a, cast: false });
    panes.push(w2);
  }
  add(new THREE.SphereGeometry(1.48, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), copper, 0, drumY + 1.6, -1.2);
  add(new THREE.CylinderGeometry(0.05, 0.08, 1.4, 6), brass, 0, drumY + 1.6 + 1.48 + 0.6, -1.2);
  const arm = new THREE.Group(); arm.position.set(0, drumY + 1.6 + 1.48 + 1.25, -1.2); g.add(arm);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.55 - i * 0.1, 0.035, 8, 40), brass);
    r.castShadow = true; arm.add(r); rings.push(r);
  }
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: 0x331a08, emissive: 0xffb050, emissiveIntensity: 3 }));
  arm.add(orb);

  // ---- lanterns either side of the steps
  const flames = [];
  for (const sx of [-1, 1]) {
    const x = sx * 2.9, z = front + 2.2;
    add(new THREE.CylinderGeometry(0.07, 0.1, 1.9, 8), brass, x, PH + 0.95, z);
    add(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 8), brass, x, PH + 0.06, z);
    const cage = add(new THREE.CylinderGeometry(0.2, 0.15, 0.42, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 1.6, transparent: true, opacity: 0.85, side: THREE.DoubleSide }), x, PH + 2.1, z, { cast: false });
    add(new THREE.ConeGeometry(0.28, 0.24, 6), brass, x, PH + 2.43, z);
    flames.push(cage);
  }
  const doorLight = new THREE.PointLight(0xffa850, 7, 9, 1.6);
  doorLight.position.set(0, PH + 1.8, front + 1.6);
  g.add(doorLight);

  // bounds for the player: the plinth is a step you climb, the hall body is a wall
  const world = (x, z) => ({ x: x + HALL.x, z: z + HALL.z });
  const plinth = { x0: HALL.x - (W + 3.2) / 2, x1: HALL.x + (W + 3.2) / 2, z0: HALL.z + 0.6 - (D + 3.6) / 2, z1: HALL.z + 0.6 + (D + 3.6) / 2, y: HALL.y + PH };
  const steps = [0, 1, 2].map(i => ({ x0: HALL.x - (4.6 + (2 - i) * 0.5) / 2, x1: HALL.x + (4.6 + (2 - i) * 0.5) / 2, z0: HALL.z + front + 2.4 + i * 0.42, z1: HALL.z + front + 2.4 + (i + 1) * 0.42, y: HALL.y + PH / 3 * (3 - i) }));
  const body = { x0: HALL.x - W / 2 - 0.75, x1: HALL.x + W / 2 + 0.75, z0: HALL.z - D / 2 - 0.6, z1: HALL.z + D / 2 + 0.02 };
  const door = { x: HALL.x, z: HALL.z + front + 0.05, w: 2.4 };
  const lampPosts = [-1, 1].map(sx => ({ ...world(sx * 2.9, front + 2.2), r: 0.25 }));

  return {
    group: g, plinth, steps, body, door, lampPosts,
    update(t, pulse) {
      arm.rotation.y = t * 0.12;
      rings[0].rotation.x = Math.PI / 2 + Math.sin(t * 0.21) * 0.25;
      rings[1].rotation.set(t * 0.33, 0, 0.4);
      rings[2].rotation.set(0.9, t * 0.47, 0);
      const k = 1.9 + Math.sin(t * 1.3) * 0.25 + pulse * 1.6;
      glow.emissiveIntensity = k;
      doorLight.intensity = 6 + Math.sin(t * 9.1) * 0.5 + Math.sin(t * 5.3) * 0.6 + pulse * 6;
      for (const f of flames) f.material.emissiveIntensity = 1.5 + Math.sin(t * 11 + f.position.x) * 0.25 + Math.sin(t * 17.3) * 0.15;
    },
  };
}
