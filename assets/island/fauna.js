// The island's residents. None of them mind you much, all of them would rather you
// kept your distance: crabs bury themselves, gulls lift off the jetty, butterflies rise,
// fish scatter. The turtle does not care at all.
import * as THREE from 'three';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';
import { patch, mulberry } from './shaderlib.js';
import { H, islandR } from './world.js';

const rnd = mulberry(4242);
const R = (a, b) => a + (b - a) * rnd();
const lerpA = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const std = (o) => { const m = new THREE.MeshStandardMaterial(o); patch(m, {}); return m; };

// ---------------------------------------------------------------- crabs
function crabMesh(mat, legMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), mat);
  body.scale.set(1.25, 0.5, 0.95); body.position.y = 0.07; body.castShadow = true; g.add(body);
  const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), legMat);
  for (const s of [-1, 1]) { const e = eyes.clone(); e.position.set(s * 0.035, 0.12, 0.085); g.add(e); }
  const legs = [];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.09, 0.06, -0.04 + i * 0.045);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.014, 0.014), legMat);
    leg.position.x = s * 0.06; leg.rotation.z = -s * 0.7; pivot.add(leg); g.add(pivot);
    legs.push({ pivot, s, i });
  }
  const claws = [];
  for (const s of [-1, 1]) {
    const c = new THREE.Group(); c.position.set(s * 0.1, 0.075, 0.09);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.08), mat); arm.position.z = 0.03; c.add(arm);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat); pin.scale.set(0.7, 0.6, 1.2); pin.position.set(0, 0.01, 0.08); pin.castShadow = true; c.add(pin);
    g.add(c); claws.push(c);
  }
  return { g, legs, claws };
}

// ---------------------------------------------------------------- gulls
function gullMesh(white, grey, dark) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), white);
  body.scale.set(0.75, 0.7, 2.0); body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), white); head.position.set(0, 0.06, 0.24); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.09, 5), std({ color: 0xf2b23a, roughness: 0.5 }));
  beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.05, 0.33); g.add(beak);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), white); tail.rotation.x = -Math.PI / 2; tail.scale.set(1, 1, 0.3); tail.position.set(0, 0.0, -0.3); g.add(tail);
  const wings = [];
  for (const s of [-1, 1]) {
    const inner = new THREE.Group(); inner.position.set(s * 0.06, 0.03, 0.02); g.add(inner);
    const wi = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.012, 0.17), grey); wi.position.x = s * 0.16; wi.castShadow = true; inner.add(wi);
    const outer = new THREE.Group(); outer.position.x = s * 0.32; inner.add(outer);
    const wo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.01, 0.13), grey); wo.position.set(s * 0.17, 0, -0.02); wo.castShadow = true; outer.add(wo);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.011, 0.1), dark); tip.position.set(s * 0.3, 0, -0.03); outer.add(tip);
    wings.push({ inner, outer, s });
  }
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.02), std({ color: 0xd9a04a })); legs.position.y = -0.11; legs.visible = false; g.add(legs);
  return { g, wings, legs };
}

// ---------------------------------------------------------------- butterflies
function butterflyMesh(color) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.bezierCurveTo(0.03, 0.09, 0.12, 0.08, 0.11, 0.02); shape.bezierCurveTo(0.12, -0.04, 0.05, -0.08, 0, -0.01);
  const geo = new THREE.ShapeGeometry(shape, 6); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 });
  const wings = [];
  for (const s of [-1, 1]) { const w = new THREE.Mesh(geo, mat); w.scale.x = s; const p = new THREE.Group(); p.add(w); g.add(p); wings.push(p); }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 4), new THREE.MeshBasicMaterial({ color: 0x1a120a }));
  body.rotation.x = Math.PI / 2; g.add(body);
  return { g, wings };
}

export function buildFauna(scene, flowers, pier, quality) {
  const crabMat = std({ color: 0xd2552a, roughness: 0.5 });
  const crabLeg = std({ color: 0x8a2c14, roughness: 0.6 });
  const crabs = [];
  for (let i = 0, tries = 0; i < quality.crabs && tries < 4000; tries++) {
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * R(18, 36), z = Math.sin(a) * R(12, 28);
    const h = H(x, z);
    if (h < 0.08 || h > 0.6) continue;
    const c = crabMesh(crabMat, crabLeg);
    c.g.position.set(x, h, z); c.g.scale.setScalar(R(0.9, 1.4));
    scene.add(c.g);
    crabs.push({ ...c, x, z, home: { x, z }, heading: rnd() * 6.28, speed: 0, state: 'idle', t: R(0.5, 3), hide: 0, phase: rnd() * 10 });
    i++;
  }

  const white = std({ color: 0xf4f1ea, roughness: 0.6 });
  const grey = std({ color: 0xa8adb3, roughness: 0.6 });
  const dark = std({ color: 0x2a2a2e, roughness: 0.6 });
  const gulls = [];
  const perches = pier ? pier.posts.filter(p => p.y > pier.y + 0.3) : [];
  for (let i = 0; i < quality.gulls; i++) {
    const m = gullMesh(white, grey, dark);
    m.g.scale.setScalar(1.25);
    scene.add(m.g);
    const g = { ...m, cx: R(-20, 20), cz: R(-12, 18), rad: R(9, 18), ang: rnd() * 6.28, alt: R(7, 11), dir: rnd() < 0.5 ? 1 : -1, flap: 0, flapT: R(0, 3), state: 'circle', perch: null, t: 0, pos: new THREE.Vector3(), phase: rnd() * 10 };
    if (i < perches.length && i < 2) { g.state = 'perched'; g.perch = perches[i]; g.pos.set(g.perch.x, g.perch.y + 0.12, g.perch.z); g.t = R(8, 20); }
    gulls.push(g);
  }

  const bflies = [];
  const bcol = [0xff8a1e, 0x3fa9f5, 0xfff2b0, 0xff5d8f];
  for (let i = 0; i < quality.butterflies && flowers.length; i++) {
    const f = flowers[(rnd() * flowers.length) | 0];
    const b = butterflyMesh(bcol[i % bcol.length]);
    b.g.position.set(f.x, f.y + 0.4, f.z);
    scene.add(b.g);
    bflies.push({ ...b, home: f, p: b.g.position, v: new THREE.Vector3(), t: rnd() * 10, flee: 0, land: 0 });
  }

  // fish: little dark shapes in the shallows, schooling
  const fishGeo = (() => { const g = new THREE.SphereGeometry(0.06, 6, 4); g.scale(0.5, 0.25, 1.4); const t = new THREE.ConeGeometry(0.04, 0.07, 3); t.rotateX(-Math.PI / 2); t.translate(0, 0, -0.1); return mergeGeometries([g.toNonIndexed(), t.toNonIndexed()]); })();
  const fishMat = new THREE.MeshBasicMaterial({ color: 0x1d3a3a, transparent: true, opacity: 0.55, depthWrite: false });
  const schools = [];
  for (let s = 0; s < quality.schools; s++) {
    let cx = 0, cz = 0;
    for (let k = 0; k < 200; k++) { const a = rnd() * 6.28; cx = Math.cos(a) * R(25, 40); cz = Math.sin(a) * R(18, 32); const h = H(cx, cz); if (h < -0.5 && h > -2.2) break; }
    const n = 9;
    const mesh = new THREE.InstancedMesh(fishGeo, fishMat, n);
    mesh.frustumCulled = false; mesh.renderOrder = 1;
    scene.add(mesh);
    const fish = Array.from({ length: n }, () => ({ p: new THREE.Vector3(cx + R(-1, 1), -0.3, cz + R(-1, 1)), v: new THREE.Vector3(R(-1, 1), 0, R(-1, 1)).multiplyScalar(0.5) }));
    schools.push({ mesh, fish, c: new THREE.Vector3(cx, -0.3, cz), goal: new THREE.Vector3(cx, -0.3, cz), t: 0 });
  }

  // the turtle, paddling slow circles off the south beach
  let turtle = null;
  {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0x5d5a32, roughness: 0.55 }));
    shell.scale.set(0.85, 0.42, 1.0); g.add(shell);
    const plates = new THREE.Mesh(new THREE.SphereGeometry(0.4, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0x3e3a1e, roughness: 0.7, flatShading: true }));
    plates.scale.set(0.86, 0.43, 1.01); plates.position.y = 0.005; g.add(plates);
    const skin = std({ color: 0x8a8a5c, roughness: 0.7 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin); head.scale.set(0.9, 0.7, 1.3); head.position.set(0, 0.02, 0.48); g.add(head);
    const flips = [];
    for (const [sx, sz, L] of [[-1, 1, 0.45], [1, 1, 0.45], [-1, -1, 0.22], [1, -1, 0.22]]) {
      const p = new THREE.Group(); p.position.set(sx * 0.3, 0, sz * 0.22); g.add(p);
      const f = new THREE.Mesh(new THREE.BoxGeometry(L, 0.03, L * 0.35), skin); f.position.x = sx * L * 0.45; p.add(f);
      flips.push({ p, sx, sz });
    }
    g.traverse(o => { o.castShadow = false; });
    scene.add(g);
    turtle = { g, flips, ang: 0, depth: -0.35 };
  }

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const events = [];

  return {
    events,
    update(dt, t, player, water) {
      events.length = 0;
      const px = player.x, pz = player.z;
      // ---- crabs
      for (const c of crabs) {
        const d = Math.hypot(c.x - px, c.z - pz);
        c.t -= dt;
        if (c.state !== 'hidden' && d < 1.4 && player.speed > 0.5) { c.state = 'hidden'; c.t = R(5, 9); events.push({ type: 'crab', x: c.x, z: c.z }); }
        if (c.state === 'hidden') {
          c.hide = Math.min(1, c.hide + dt * 4);
          if (c.t < 0 && d > 3) { c.state = 'idle'; c.t = 1; }
        } else {
          c.hide = Math.max(0, c.hide - dt * 1.5);
          if (d < 3.2) { c.state = 'flee'; c.heading = Math.atan2(c.z - pz, c.x - px); }
          else if (c.t < 0) {
            if (c.state === 'walk') { c.state = 'idle'; c.t = R(1, 4); }
            else { c.state = 'walk'; c.t = R(0.8, 2.2); const hx = c.home.x - c.x, hz = c.home.z - c.z; c.heading = Math.hypot(hx, hz) > 3 ? Math.atan2(hz, hx) : rnd() * 6.28; }
          }
          const sp = c.state === 'flee' ? 2.4 : c.state === 'walk' ? 0.55 : 0;
          c.speed += (sp - c.speed) * Math.min(1, dt * 6);
          if (c.state === 'flee' && d > 3.6) { c.state = 'idle'; c.t = R(0.5, 2); }
          const nx = c.x + Math.cos(c.heading) * c.speed * dt, nz = c.z + Math.sin(c.heading) * c.speed * dt;
          const nh = H(nx, nz);
          if (nh > water - 0.1 && nh < 0.9) { c.x = nx; c.z = nz; } else c.heading += 1.5;
        }
        // crabs walk sideways: body faces 90 degrees off their heading
        c.g.rotation.y = lerpA(c.g.rotation.y, -c.heading, Math.min(1, dt * 8));
        const h = H(c.x, c.z);
        c.g.position.set(c.x, h - c.hide * 0.16, c.z);
        const k = c.speed * 18;
        c.phase += dt * k;
        for (const L of c.legs) L.pivot.rotation.x = Math.sin(c.phase + L.i * 2.1 + (L.s > 0 ? 1.0 : 0)) * 0.5 * Math.min(1, c.speed * 2);
        for (const cl of c.claws) cl.rotation.x = -0.25 + Math.sin(t * 2 + cl.position.x * 20) * 0.12 + (c.state === 'flee' ? -0.5 : 0);
      }
      // ---- gulls
      for (const g of gulls) {
        g.t -= dt;
        let target = null, glide = true;
        if (g.state === 'perched') {
          g.pos.set(g.perch.x, g.perch.y + 0.13, g.perch.z);
          const d = Math.hypot(g.pos.x - px, g.pos.z - pz);
          g.legs.visible = true;
          for (const w of g.wings) { w.inner.rotation.z = w.s * -1.25; w.outer.rotation.z = w.s * 2.6; }
          g.g.rotation.set(0, g.g.rotation.y + Math.sin(t * 0.7 + g.phase) * dt * 0.4, 0);
          if (d < 3.2 || g.t < 0) { g.state = 'takeoff'; g.t = 1.4; g.legs.visible = false; events.push({ type: 'gull', x: g.pos.x, z: g.pos.z }); }
          g.g.position.copy(g.pos);
          continue;
        }
        if (g.state === 'takeoff') {
          g.pos.y += dt * 2.6; g.pos.x += Math.cos(g.ang) * dt * 2; g.pos.z += Math.sin(g.ang) * dt * 2;
          glide = false;
          if (g.t < 0) { g.state = 'circle'; g.cx = g.pos.x; g.cz = g.pos.z; g.t = R(25, 50); }
        } else if (g.state === 'circle') {
          g.ang += g.dir * dt * (3.2 / g.rad);
          target = new THREE.Vector3(g.cx + Math.cos(g.ang) * g.rad, g.alt + Math.sin(t * 0.3 + g.phase) * 1.2, g.cz + Math.sin(g.ang) * g.rad);
          g.cx += Math.sin(t * 0.05 + g.phase) * dt * 0.4;
          if (g.t < 0 && perches.length) {
            const p = perches[(rnd() * perches.length) | 0];
            if (!gulls.some(o => o.perch === p && o.state !== 'circle')) { g.state = 'land'; g.perch = p; }
            else g.t = R(10, 20);
          }
        } else if (g.state === 'land') {
          target = new THREE.Vector3(g.perch.x, g.perch.y + 0.13, g.perch.z);
          if (g.pos.distanceTo(target) < 0.15) { g.state = 'perched'; g.t = R(10, 25); }
          if (Math.hypot(g.perch.x - px, g.perch.z - pz) < 4) { g.state = 'circle'; g.t = R(15, 30); }
        }
        if (target) {
          const d = target.clone().sub(g.pos);
          const sp = g.state === 'land' ? Math.min(3.5, d.length() * 1.6 + 0.4) : 3.6;
          const step = d.clone().normalize().multiplyScalar(Math.min(d.length(), sp * dt));
          g.pos.add(step);
          if (step.lengthSq() > 1e-8) {
            const yaw = Math.atan2(step.x, step.z);
            g.g.rotation.y = lerpA(g.g.rotation.y, yaw, Math.min(1, dt * 3));
            g.g.rotation.z = THREE.MathUtils.lerp(g.g.rotation.z, -g.dir * 0.35, dt * 2);
          }
          glide = g.state === 'circle' && Math.sin(t * 0.4 + g.phase) > -0.3;
        }
        g.flap += dt * (glide ? 2 : 11);
        const a = glide ? Math.sin(g.flap) * 0.08 + 0.05 : Math.sin(g.flap) * 0.75;
        for (const w of g.wings) { w.inner.rotation.z = w.s * a; w.outer.rotation.z = w.s * a * 0.8; }
        g.g.position.copy(g.pos);
        if (g.state === 'circle' && rnd() < dt * 0.04) events.push({ type: 'call', x: g.pos.x, z: g.pos.z });
      }
      // ---- butterflies
      for (const b of bflies) {
        b.t += dt;
        const d = Math.hypot(b.p.x - px, b.p.z - pz);
        if (d < 1.6) b.flee = 2.5;
        b.flee = Math.max(0, b.flee - dt);
        const home = b.home;
        const goal = new THREE.Vector3(home.x + Math.sin(b.t * 0.7) * 1.4, home.y + 0.3 + Math.sin(b.t * 1.3) * 0.25 + b.flee * 1.1, home.z + Math.cos(b.t * 0.53) * 1.4);
        if (b.flee > 0) { goal.x += (b.p.x - px) * 1.5; goal.z += (b.p.z - pz) * 1.5; }
        b.v.add(goal.sub(b.p).multiplyScalar(dt * 2.2)).add(new THREE.Vector3(Math.sin(b.t * 9), Math.sin(b.t * 13) * 1.5, Math.cos(b.t * 11)).multiplyScalar(dt * 1.2));
        b.v.multiplyScalar(1 - dt * 1.8);
        b.p.addScaledVector(b.v, dt);
        b.p.y = Math.max(b.p.y, H(b.p.x, b.p.z) + 0.12);
        b.g.rotation.y = Math.atan2(b.v.x, b.v.z);
        const f = Math.sin(b.t * 26) * 0.9 + 0.3;
        b.wings[0].rotation.z = f; b.wings[1].rotation.z = -f;
      }
      // ---- fish
      for (const s of schools) {
        s.t -= dt;
        const pd = Math.hypot(s.c.x - px, s.c.z - pz);
        const scared = pd < 3 && player.inWater;
        if (s.t < 0 || scared) {
          s.t = R(3, 7);
          for (let k = 0; k < 20; k++) {
            const a = rnd() * 6.28, rr = scared ? 5 : 3;
            const gx = s.c.x + Math.cos(a) * rr, gz = s.c.z + Math.sin(a) * rr;
            const h = H(gx, gz);
            if (h < -0.4 && h > -2.5 && (!scared || Math.hypot(gx - px, gz - pz) > pd)) { s.goal.set(gx, -0.28, gz); break; }
          }
        }
        s.c.lerp(s.goal, Math.min(1, dt * (scared ? 1.6 : 0.35)));
        s.fish.forEach((f, i) => {
          const to = s.c.clone().sub(f.p);
          f.v.addScaledVector(to, dt * 2.2).add(new THREE.Vector3(Math.sin(t * 2 + i), 0, Math.cos(t * 1.7 + i * 2)).multiplyScalar(dt * 0.8));
          f.v.y = 0; f.v.clampLength(0.2, scared ? 3.5 : 1.3);
          f.p.addScaledVector(f.v, dt);
          f.p.y = water - 0.22 - (i % 3) * 0.04;
          tmpQ.setFromAxisAngle(up, Math.atan2(f.v.x, f.v.z) + Math.sin(t * 12 + i) * 0.15);
          tmpM.compose(f.p, tmpQ, tmpS);
          s.mesh.setMatrixAt(i, tmpM);
        });
        s.mesh.instanceMatrix.needsUpdate = true;
      }
      // ---- turtle
      if (turtle) {
        turtle.ang += dt * 0.035;
        const x = Math.cos(turtle.ang) * 13, z = 30 + Math.sin(turtle.ang) * 3.5;
        const surf = Math.sin(t * 0.17) > 0.7;
        turtle.depth = THREE.MathUtils.lerp(turtle.depth, surf ? -0.05 : -0.45, dt * 0.5);
        turtle.g.position.set(x, water + turtle.depth, z);
        turtle.g.rotation.y = -turtle.ang + Math.PI;
        for (const f of turtle.flips) f.p.rotation.z = f.sx * (Math.sin(t * 1.6 + (f.sz > 0 ? 0 : 1.2)) * 0.5) * (f.sz > 0 ? 1 : 0.5);
        if (surf && rnd() < dt * 0.6) events.push({ type: 'ripple', x, z, w: 0.3 });
      }
    },
  };
}
