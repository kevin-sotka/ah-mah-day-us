// The automaton: a small brass figure the machine woke when it sang. It walks, runs,
// jumps, rolls, kicks the surf, and when you leave it alone it turns to the sun and
// looks up. Leave it longer and it sits down to watch.
import * as THREE from 'three';
import { H, ground, SUN_DIR } from './world.js';

const TAU = Math.PI * 2;
const angLerp = (a, b, t) => { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };
const smooth = t => t * t * (3 - 2 * t);

export function buildPlayer(gltf, hall, pier, colliders) {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const scale = 1.15 / height;
  model.scale.multiplyScalar(scale);

  // re-skin the robot as the island's brass: polished body, verdigris joints, dark iron
  const brass = new THREE.MeshStandardMaterial({ color: 0xe0b058, metalness: 1, roughness: 0.26, envMapIntensity: 1.8 });
  const verd = new THREE.MeshStandardMaterial({ color: 0x6aa48e, metalness: 0.55, roughness: 0.4, envMapIntensity: 1.4 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x1b1712, metalness: 0.6, roughness: 0.4, emissive: 0x000000 });
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const swap = m => m.name === 'Main' ? brass : m.name === 'Grey' ? verd : m.name === 'Black' ? iron : m;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    o.frustumCulled = false;
  });

  const root = new THREE.Group();
  const pivot = new THREE.Group(); pivot.position.y = 0.45; root.add(pivot);
  model.position.y = -0.45; pivot.add(model);

  const bones = {};
  model.traverse(o => { if (o.isBone) bones[o.name] = o; });
  
  const mixer = new THREE.AnimationMixer(model);
  const acts = {};
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip); acts[clip.name] = a;
    if (['Jump', 'Sitting', 'Standing', 'Wave', 'No', 'Yes', 'ThumbsUp', 'Death', 'Punch', 'WalkJump'].includes(clip.name)) { a.clampWhenFinished = true; a.loop = THREE.LoopOnce; }
  }
  let cur = null;
  function play(name, fade = 0.2, ts = 1) {
    const a = acts[name]; if (!a) return;
    a.timeScale = ts;
    if (cur === a) return;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.fadeIn(fade); a.play();
    if (cur) cur.fadeOut(fade);
    cur = a;
  }

  // ---------------------------------------------------------------- ground and walls
  function inRect(x, z, r, m = 0) { return x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m; }
  function groundAt(x, z) {
    let h = H(x, z), kind = null;
    if (inRect(x, z, hall.plinth)) { h = Math.max(h, hall.plinth.y); kind = 'stone'; }
    for (const s of hall.steps) if (inRect(x, z, s)) { h = Math.max(h, s.y); kind = 'stone'; }
    if (pier && inRect(x, z, { x0: pier.x0, x1: pier.x1, z0: pier.z0, z1: pier.z1 })) { if (pier.y > h) { h = pier.y; kind = 'wood'; } }
    return { h, kind };
  }
  const RAD = 0.28;
  function blocked(x, z, y) {
    if (inRect(x, z, hall.body, RAD)) return 'hall';
    for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + RAD) ** 2) return 'thing';
    for (const c of hall.lampPosts) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + RAD) ** 2) return 'thing';
    const g = groundAt(x, z);
    if (g.h < -0.48) return 'deep';
    if (g.h - y > 0.34) return 'step';
    return null;
  }

  // ---------------------------------------------------------------- state
  const P = {
    root, model, mixer,
    x: hall.door.x, z: hall.door.z + 1.5, y: 0, vy: 0, yaw: 0, speed: 0,
    grounded: true, state: 'wake', stateT: 0, idleT: 0, gaze: 0, sit: false,
    inWater: false, depth: 0, surface: 'stone', strideAcc: 0, foot: 1,
    rollDir: 0, kickT: 0, bumpT: 0, lastLand: 0, events: [],
    look: 0,
  };
  P.y = groundAt(P.x, P.z).h;
  root.position.set(P.x, P.y, P.z);
  play('Idle', 0);
  setTimeout(() => { if (P.state === 'wake') { play('Wave', 0.3); } }, 900);

  const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), axis = new THREE.Vector3();
  function bendBone(b, ax, ang) {
    if (!b) return;
    b.parent.updateWorldMatrix(true, false);
    b.getWorldQuaternion(tmpQ);
    tmpQ2.setFromAxisAngle(ax, ang).multiply(tmpQ);
    b.parent.getWorldQuaternion(tmpQ);
    b.quaternion.copy(tmpQ.invert().multiply(tmpQ2));
    b.updateWorldMatrix(false, true);
  }

  P.update = function (dt, input, water, t) {
    const ev = P.events; ev.length = 0;
    P.stateT += dt;
    const g0 = groundAt(P.x, P.z);
    P.inWater = g0.h < water - 0.04;
    P.depth = Math.max(0, water - g0.h);
    P.surface = P.inWater ? 'water' : g0.kind || ground(P.x, P.z);

    const hasInput = input.mag > 0.12 || input.jump || input.roll || input.kick;
    // wake: the wave plays out before control is given
    if (P.state === 'wake') { if (P.stateT > 2.8 || (hasInput && P.stateT > 0.6)) { P.state = 'move'; play('Idle', 0.3); } }

    // sitting or gazing gives way to any input
    if (hasInput && (P.state === 'gaze' || P.state === 'sit')) {
      if (P.state === 'sit') { P.state = 'stand'; P.stateT = 0; play('Standing', 0.25, 1.4); }
      else P.state = 'move';
      P.idleT = 0;
    }
    if (P.state === 'stand' && P.stateT > 0.85) { P.state = 'move'; }

    const free = P.state === 'move' || P.state === 'jump';
    // ---- actions
    if (free && P.grounded && input.jump) {
      P.vy = 6.9; P.grounded = false; P.state = 'jump'; P.stateT = 0;
      play(P.speed > 1.5 ? 'WalkJump' : 'Jump', 0.1, 1.5);
      ev.push({ type: 'jump' });
    }
    if (free && P.grounded && input.roll && P.state !== 'roll') {
      P.state = 'roll'; P.stateT = 0;
      P.rollDir = input.mag > 0.12 ? Math.atan2(input.x, input.z) : P.yaw;
      P.yaw = P.rollDir;
      play('Jump', 0.08, 0.0001); acts.Jump && (acts.Jump.time = 0.35);
      ev.push({ type: 'roll' });
    }
    if (free && P.grounded && input.kick && P.state !== 'kick') {
      P.state = 'kick'; P.stateT = 0; P.kickT = 0;
      play('Idle', 0.1);
      ev.push({ type: 'kickStart' });
    }

    // ---- locomotion
    let tx = 0, tz = 0, maxSp = 0;
    if (P.state === 'move' || P.state === 'jump') {
      const wade = P.inWater ? THREE.MathUtils.lerp(0.75, 0.45, Math.min(1, P.depth / 0.45)) : 1;
      maxSp = input.mag * 4.3 * wade * (input.slow ? 0.45 : 1);
      if (input.mag > 0.12) { tx = input.x / input.mag; tz = input.z / input.mag; P.yaw = angLerp(P.yaw, Math.atan2(tx, tz), Math.min(1, dt * 12)); }
    }
    if (P.state === 'roll') {
      maxSp = 6.4 * (P.inWater ? 0.6 : 1); tx = Math.sin(P.rollDir); tz = Math.cos(P.rollDir);
    }
    if (P.state === 'kick') maxSp = 0;
    const accel = P.state === 'roll' ? 40 : maxSp > P.speed ? 12 : 9;
    P.speed += (maxSp - P.speed) * Math.min(1, dt * accel);
    if (P.state === 'move' && input.mag < 0.12) P.speed *= Math.exp(-dt * 10);
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    const mx = (P.state === 'roll' ? tx : fx) * P.speed * dt, mz = (P.state === 'roll' ? tz : fz) * P.speed * dt;
    if (mx || mz) {
      let hit = blocked(P.x + mx, P.z + mz, P.y);
      if (!hit) { P.x += mx; P.z += mz; }
      else {
        if (hit === 'hall' && P.z > hall.door.z - 0.2 && Math.abs(P.x - hall.door.x) < hall.door.w / 2 && mz < 0) {
          if (t - P.bumpT > 2.2) { P.bumpT = t; ev.push({ type: 'bump' }); if (P.state === 'move') { P.state = 'bumped'; P.stateT = 0; play('No', 0.2, 1.1); } }
        }
        if (!blocked(P.x + mx, P.z, P.y)) P.x += mx;
        else if (!blocked(P.x, P.z + mz, P.y)) P.z += mz;
        else if (P.state === 'move') P.speed *= 0.5;
      }
    }
    if (P.state === 'bumped' && P.stateT > 1.6) P.state = 'move';

    // ---- vertical
    const g = groundAt(P.x, P.z);
    if (!P.grounded) {
      P.vy -= 19 * dt;
      P.y += P.vy * dt;
      if (P.y <= g.h && P.vy < 0) {
        P.y = g.h; P.vy = 0; P.grounded = true;
        if (P.state === 'jump') { P.state = 'move'; }
        ev.push({ type: 'land', water: g.h < water - 0.04 });
      }
    } else {
      // walk down steps and slopes; drop off ledges
      if (g.h < P.y - 0.36) { P.grounded = false; P.vy = 0; }
      else P.y += (g.h - P.y) * Math.min(1, dt * 18);
    }

    // ---- timed states
    if (P.state === 'roll') {
      const T = 0.62;
      const k = Math.min(1, P.stateT / T);
      pivot.rotation.x = smooth(k) * TAU;
      pivot.position.y = 0.45 - Math.sin(k * Math.PI) * 0.12;
      pivot.scale.set(1, 1 - Math.sin(k * Math.PI) * 0.12, 1);
      if (P.stateT > T) { P.state = 'move'; pivot.rotation.x = 0; pivot.position.y = 0.45; pivot.scale.set(1, 1, 1); ev.push({ type: 'rollEnd' }); }
    }
    if (P.state === 'kick') {
      P.kickT += dt;
      if (P.kickT > 0.16 && !P.kicked) { P.kicked = true; ev.push({ type: 'kick', water: P.inWater, x: P.x + fx * 0.45, z: P.z + fz * 0.45 }); }
      if (P.kickT > 0.5) { P.state = 'move'; P.kicked = false; }
    }

    // ---- idle: look at the sun, then sit with it
    const resting = P.state === 'move' && P.grounded && P.speed < 0.1 && !hasInput;
    P.idleT = resting || P.state === 'gaze' || P.state === 'sit' ? P.idleT + dt : 0;
    if (P.state === 'move' && P.idleT > 3.2) { P.state = 'gaze'; P.stateT = 0; }
    if (P.state === 'gaze' && P.idleT > 15) { P.state = 'sit'; P.stateT = 0; play('Sitting', 0.6, 0.9); }
    const gazing = P.state === 'gaze' || P.state === 'sit';
    P.gaze += ((gazing ? 1 : 0) - P.gaze) * Math.min(1, dt * (gazing ? 0.55 : 2.4));
    if (gazing) P.yaw = angLerp(P.yaw, Math.atan2(SUN_DIR.x, SUN_DIR.z), Math.min(1, dt * 1.6));

    // ---- animation
    if (P.state === 'move' || P.state === 'gaze') {
      if (!P.grounded) {}
      else if (P.speed < 0.25) play('Idle', 0.3);
      else if (P.speed < 2.7) play('Walking', 0.25, Math.max(0.6, P.speed / 1.7));
      else play('Running', 0.25, P.speed / 4.1);
    }
    if (P.state === 'kick') play('Idle', 0.08);
    mixer.update(dt);

    // procedural layers on top of the clips
    root.position.set(P.x, P.y, P.z);
    root.rotation.y = P.yaw;
    root.updateMatrixWorld(true);
    axis.set(Math.sin(P.yaw), 0, Math.cos(P.yaw)).cross(new THREE.Vector3(0, 1, 0)).normalize();  // forward x up
    if (P.state === 'kick') {
      const k = P.kickT;
      const swing = k < 0.13 ? -0.7 * smooth(k / 0.13) : k < 0.24 ? -0.7 + 2.3 * smooth((k - 0.13) / 0.11) : 1.6 * (1 - smooth(Math.min(1, (k - 0.24) / 0.26)));
      bendBone(bones['UpperLeg.R'], axis, swing);
      bendBone(bones['LowerLeg.R'], axis, -(k < 0.13 ? 0.9 * smooth(k / 0.13) : 0.9 * (1 - smooth(Math.min(1, (k - 0.13) / 0.12)))));
      bendBone(bones.Torso, axis, swing * 0.15);
      for (const s of ['UpperArm.L', 'UpperArm.R']) bendBone(bones[s], new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)), (s.endsWith('L') ? 1 : -1) * 0.5 * Math.sin(Math.min(1, k / 0.3) * Math.PI));
    }
    // look up at the sun: the head and chest share the tilt
    const elev = Math.asin(SUN_DIR.y) + 0.35;
    const look = smooth(Math.min(1, P.gaze * 1.25)) * elev;
    if (look > 0.001) {
      bendBone(bones.Torso, axis, look * 0.35);
      bendBone(bones.Head, axis, look * 0.75);
    }
    P.look = look;

    // ---- footsteps
    if (P.grounded && P.speed > 0.3 && P.state !== 'roll') {
      P.strideAcc += P.speed * dt;
      const stride = P.speed > 2.7 ? 0.62 : 0.42;
      if (P.strideAcc > stride) {
        P.strideAcc = 0; P.foot = -P.foot;
        const sx = Math.cos(P.yaw) * 0.09 * P.foot, sz = -Math.sin(P.yaw) * 0.09 * P.foot;
        ev.push({ type: 'step', kind: P.surface, x: P.x + sx, z: P.z + sz, y: P.y, yaw: P.yaw });
      }
    }
    return ev;
  };

  P.groundAt = groundAt;
  return P;
}

// ---------------------------------------------------------------- input
export function makeInput(el, isTouch) {
  const keys = new Set();
  const I = { x: 0, z: 0, mag: 0, jump: false, roll: false, kick: false, slow: false, any: 0, exit: false, zoom: 0 };
  const pressed = { jump: false, roll: false, kick: false };
  const onKey = (e, down) => {
    const k = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(k)) e.preventDefault();
    if (down) keys.add(k); else keys.delete(k);
    if (down && !e.repeat) {
      if (k === 'Space') pressed.jump = true;
      if (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'KeyC') pressed.roll = true;
      if (k === 'KeyE' || k === 'KeyF' || k === 'KeyK') pressed.kick = true;
      if (k === 'Escape') I.exit = true;
    }
    I.any = performance.now();
  };
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  const wheel = e => { I.zoom += Math.sign(e.deltaY) * 0.08; };
  el.addEventListener('wheel', wheel, { passive: true });

  // touch: a floating stick on the left half, three buttons on the right
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const ui = document.createElement('div');
  ui.className = 'isl-touch';
  ui.innerHTML = `<div class="isl-stick"><i></i></div>
    <button class="isl-btn b-jump" data-a="jump" aria-label="jump"><svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg></button>
    <button class="isl-btn b-roll" data-a="roll" aria-label="roll"><svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4"/></svg></button>
    <button class="isl-btn b-kick" data-a="kick" aria-label="kick"><svg viewBox="0 0 24 24"><path d="M5 17c4 0 6-2 8-6l5 2M14 5l2 6"/></svg></button>`;
  if (isTouch) el.appendChild(ui);
  const stickEl = ui.querySelector('.isl-stick'), knob = stickEl.querySelector('i');
  ui.querySelectorAll('.isl-btn').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); pressed[b.dataset.a] = true; I.any = performance.now(); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 160); }));
  const pd = e => {
    if (e.target.closest && e.target.closest('.isl-btn, .isl-exit')) return;
    if (e.pointerType === 'mouse') return;
    if (e.clientX > innerWidth * 0.55 || stick.id !== null) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
    stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.classList.add('on');
    I.any = performance.now();
  };
  const pm = e => {
    if (e.pointerId !== stick.id) return;
    const R = Math.min(70, innerHeight * 0.12);
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
    stick.x = dx / R; stick.y = dy / R;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    I.any = performance.now();
  };
  const pu = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; stickEl.classList.remove('on'); };
  el.addEventListener('pointerdown', pd); addEventListener('pointermove', pm); addEventListener('pointerup', pu); addEventListener('pointercancel', pu);
  // pinch zoom
  const touches = new Map(); let pinch0 = 0;
  const ts = e => { for (const t of e.changedTouches) touches.set(t.identifier, t); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } };
  const tm = e => { for (const t of e.changedTouches) touches.set(t.identifier, t); if (touches.size === 2 && pinch0 && stick.id === null) { const [a, b] = [...touches.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); I.zoom -= (d - pinch0) / 300; pinch0 = d; } };
  const te = e => { for (const t of e.changedTouches) touches.delete(t.identifier); if (touches.size < 2) pinch0 = 0; };
  el.addEventListener('touchstart', ts, { passive: true }); el.addEventListener('touchmove', tm, { passive: true }); el.addEventListener('touchend', te, { passive: true });

  I.poll = () => {
    let x = 0, z = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) z -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) z += 1;
    if (stick.id !== null) { x += stick.x; z += stick.y; }
    I.slow = keys.has('AltLeft') || keys.has('AltRight');
    // gamepad
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
    if (gp) {
      const ax = gp.axes[0] || 0, az = gp.axes[1] || 0;
      if (Math.hypot(ax, az) > 0.15) { x += ax; z += az; I.any = performance.now(); }
      const btn = i => gp.buttons[i] && gp.buttons[i].pressed;
      if (btn(0) && !I._g0) pressed.jump = true; I._g0 = btn(0);
      if (btn(1) && !I._g1) pressed.roll = true; I._g1 = btn(1);
      if ((btn(2) || btn(3)) && !I._g2) pressed.kick = true; I._g2 = btn(2) || btn(3);
      if (btn(9) && !I._g9) I.exit = true; I._g9 = btn(9);
    }
    const m = Math.hypot(x, z);
    if (m > 1) { x /= m; z /= m; }
    I.x = x; I.z = z; I.mag = Math.min(1, m);
    I.jump = pressed.jump; I.roll = pressed.roll; I.kick = pressed.kick;
    pressed.jump = pressed.roll = pressed.kick = false;
    return I;
  };
  I.press = a => { pressed[a] = true; I.any = performance.now(); };
  I.dispose = () => {
    removeEventListener('keydown', kd); removeEventListener('keyup', ku);
    removeEventListener('pointermove', pm); removeEventListener('pointerup', pu); removeEventListener('pointercancel', pu);
    el.removeEventListener('wheel', wheel); el.removeEventListener('pointerdown', pd);
    ui.remove();
  };
  // test hook: hold a direction for the playtest driver
  I.keys = keys;
  return I;
}
