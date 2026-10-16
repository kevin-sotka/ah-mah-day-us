// The island, after the machine sings. Loaded only when the player steps outside, so the
// four rooms never pay for it. start() builds everything, runs until stop().
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { U, cloudTexture } from './shaderlib.js';
import { buildTerrain, buildSea, buildSky, heightTexture, H, HALL, SUN_DIR, islandR } from './world.js';
import { buildFlora, colliders, rustlers } from './flora.js';
import { buildHall } from './hall.js';
import { buildFauna } from './fauna.js';
import { buildPlayer, makeInput } from './player.js';
import { particles, footprints, motes, ripples, lens } from './fx.js';
import { islandSound } from './sound.js';

const BASE = new URL('./', import.meta.url).href;
const CSS = `
.isl-root{position:fixed;inset:0;z-index:60;background:#000;touch-action:none;user-select:none;-webkit-user-select:none}
.isl-root canvas{display:block;width:100%;height:100%}
.isl-load{position:absolute;inset:0;display:grid;place-items:center;color:rgba(242,184,128,.7);font:15px "Iowan Old Style",Palatino,Georgia,serif;letter-spacing:.3em;text-transform:uppercase;
  background:radial-gradient(ellipse at 50% 50%,#2a1c10,#06060c);transition:opacity 1.4s ease}
.isl-load b{display:block;width:120px;height:1px;margin:18px auto 0;background:linear-gradient(90deg,transparent,#f2b880,transparent);animation:islb 1.6s ease-in-out infinite}
@keyframes islb{0%,100%{opacity:.2;transform:scaleX(.3)}50%{opacity:1;transform:scaleX(1)}}
.isl-load.gone{opacity:0;pointer-events:none}
.isl-hint{position:absolute;left:0;right:0;bottom:calc(26px + env(safe-area-inset-bottom));text-align:center;color:rgba(255,236,206,.78);
  font:13px "Iowan Old Style",Palatino,Georgia,serif;letter-spacing:.26em;text-transform:uppercase;text-shadow:0 1px 6px rgba(0,0,0,.7);pointer-events:none;transition:opacity 1.6s ease}
.isl-hint i{font-style:normal;color:#ffd79c}
.isl-hint.gone{opacity:0}
.isl-exit{position:absolute;top:calc(18px + env(safe-area-inset-top));right:calc(20px + env(safe-area-inset-right));width:46px;height:46px;border-radius:50%;
  border:1px solid rgba(242,184,128,.55);background:rgba(20,12,6,.35);display:grid;place-items:center;cursor:pointer;opacity:.6;transition:opacity .3s}
.isl-exit:hover{opacity:1}
.isl-exit svg{width:18px;height:18px;stroke:#f6d9ad;stroke-width:2;fill:none;stroke-linecap:round}
.isl-touch{position:absolute;inset:0;pointer-events:none}
.isl-stick{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:1px solid rgba(255,230,190,.35);background:rgba(20,12,6,.18);opacity:0;transition:opacity .2s;pointer-events:none}
.isl-stick.on{opacity:1}
.isl-stick i{position:absolute;left:36px;top:36px;width:48px;height:48px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#f6dfa6,#a47a36 60%,#4a3412)}
.isl-btn{position:absolute;pointer-events:auto;border-radius:50%;border:1.5px solid rgba(232,194,122,.8);background:radial-gradient(circle at 40% 30%,rgba(120,84,30,.55),rgba(20,12,4,.55));
  display:grid;place-items:center;padding:0;touch-action:none}
.isl-btn svg{width:46%;height:46%;stroke:#ffe6b8;stroke-width:2.2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.isl-btn.on{background:radial-gradient(circle at 40% 30%,rgba(240,190,100,.8),rgba(90,60,20,.7))}
.b-jump{width:84px;height:84px;right:calc(34px + env(safe-area-inset-right));bottom:calc(40px + env(safe-area-inset-bottom))}
.b-roll{width:62px;height:62px;right:calc(130px + env(safe-area-inset-right));bottom:calc(30px + env(safe-area-inset-bottom))}
.b-kick{width:62px;height:62px;right:calc(52px + env(safe-area-inset-right));bottom:calc(136px + env(safe-area-inset-bottom))}
`;

function detectQuality() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  const low = touch || small;
  return {
    touch, low,
    pr: Math.min(devicePixelRatio || 1, low ? 1.5 : 2),
    msaa: low ? 0 : 4,
    shadow: low ? 1024 : 2048,
    terrainSeg: low ? 170 : 240,
    palms: low ? 32 : 40,
    bushes: low ? 150 : 240,
    ferns: low ? 150 : 260,
    calathea: low ? 50 : 100,
    grass: low ? 9000 : 24000,
    tufts: low ? 90 : 160,
    flowers: low ? 140 : 260,
    boulders: low ? 14 : 22,
    plantShadows: !low,
    crabs: 11, gulls: 6, butterflies: low ? 8 : 14, schools: 4,
  };
}

export async function start(opts) {
  const Q = detectQuality();
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const rootEl = document.createElement('div'); rootEl.className = 'isl-root';
  rootEl.innerHTML = `<div class="isl-load">the light outside<b></b></div>`;
  document.body.appendChild(rootEl);
  const loadEl = rootEl.querySelector('.isl-load');

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Q.pr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  rootEl.prepend(renderer.domElement);

  // ---------------------------------------------------------------- assets
  const tl = new THREE.TextureLoader();
  const tex = (n, srgb = true, rep = true) => new Promise((res, rej) => tl.load(BASE + n, t => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8; res(t);
  }, undefined, rej));
  const gl = new GLTFLoader();
  const model = n => new Promise((res, rej) => gl.load(BASE + 'models/' + n, res, undefined, rej));
  const geos = g => { const out = []; g.scene.traverse(o => { if (o.isMesh) out.push(o.geometry); }); return out; };
  const [sand, sand_n, wetsand, grass, grass_n, path, rock, rock_n, brick, brick_n, blocks, slate, planks, fronds, fernTex, calTex, r07t, r09t, shellTex,
    robot, fern, cal, r07, r09, shell, songData] = await Promise.all([
    tex('sand.webp'), tex('sand_n.webp', false), tex('wetsand.webp'), tex('grass.webp'), tex('grass_n.webp', false), tex('path.webp'),
    tex('rock.webp'), tex('rock_n.webp', false), tex('brick.webp'), tex('brick_n.webp', false), tex('blocks.webp'), tex('slate.webp'), tex('planks.webp'),
    tex('fronds.webp', true, false), tex('fern.webp', true, false), tex('calathea.webp', true, false), tex('rock07.webp'), tex('rock09.webp'), tex('shell.webp'),
    model('automaton.glb'), model('fern.gltf'), model('calathea.gltf'), model('rock07.gltf'), model('rock09.gltf'), model('shell.gltf'),
    // the island's own song; the island still works if it fails to load
    fetch(BASE + 'sunshine.mp3').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null),
  ]);
  for (const t of [r07t, r09t, shellTex]) t.flipY = false;
  const A = { sand, sand_n, wetsand, grass, grass_n, path, rock, rock_n, brick, brick_n, blocks, slate, planks, fronds, fernTex, calatheaTex: calTex,
    rock07Tex: r07t, rock09Tex: r09t, shellTex, fern: geos(fern), calathea: geos(cal), rock07: geos(r07)[0], rock09: geos(r09)[0], shell: geos(shell)[0] };
  // the Poly Haven textures are authored for glTF's flipped V
  fernTex.flipY = false; calTex.flipY = false;

  // ---------------------------------------------------------------- scene
  const scene = new THREE.Scene();
  U.uCloud.value = cloudTexture();
  U.uSunDir.value.copy(SUN_DIR);
  U.uSunColor.value.setRGB(1.0, 0.86, 0.70);
  const sky = buildSky();
  scene.add(sky.mesh);
  scene.fog = new THREE.Fog(sky.fog, 90, 380);

  // image-based light from the sky itself, so brass reflects this evening and no other
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const skyCopy = sky.mesh.clone(); envScene.add(skyCopy);
    const rt = pm.fromScene(envScene, 0, 1, 1000);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.55;
    pm.dispose();
  }
  const sun = new THREE.DirectionalLight(0xffdcb4, 3.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  const SH = 26;
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 140 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9fb2e0, 0x5a5040, 0.8);
  scene.add(hemi);

  const terrain = buildTerrain(A, Q); scene.add(terrain);
  const sea = buildSea(heightTexture(), sky); scene.add(sea);
  const flora = buildFlora(A, Q); scene.add(flora.group);
  const hall = buildHall(A, Q); scene.add(hall.group);
  const { pier } = await import('./flora.js');
  const fauna = buildFauna(scene, flora.flowers, pier, Q);
  const player = buildPlayer(robot, hall, pier, colliders);
  scene.add(player.root);
  const parts = particles(); scene.add(parts.obj);
  const prints = footprints(); scene.add(prints.obj);
  const dust = motes(Q.low ? 160 : 280); scene.add(dust.obj);
  const rip = ripples(sea.material);

  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.3, 1200);
  const post = lens(renderer, scene, camera, Q);
  const input = makeInput(rootEl, Q.touch);
  const snd = islandSound(opts.ctx, opts.master);

  // "everybodies ok with the sunshine" takes over from the album while you are outside
  let song = null;
  if (opts.ctx && songData) {
    try {
      const buf = await opts.ctx.decodeAudioData(songData);
      const src = opts.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const gain = opts.ctx.createGain(); gain.gain.value = 0;
      src.connect(gain); gain.connect(opts.master); src.start();
      song = { src, gain };
    } catch (e) { /* no song, the album stays */ }
  }

  // UI: exit, control hint
  const exitEl = document.createElement('div'); exitEl.className = 'isl-exit'; exitEl.title = 'leave the island';
  exitEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  rootEl.appendChild(exitEl);
  const hintEl = document.createElement('div'); hintEl.className = 'isl-hint';
  hintEl.innerHTML = Q.touch ? 'drag to wander' : '<i>wasd</i> wander &nbsp;&middot;&nbsp; <i>space</i> jump &nbsp;&middot;&nbsp; <i>shift</i> roll &nbsp;&middot;&nbsp; <i>e</i> kick';
  rootEl.appendChild(hintEl);
  let hintGone = false;
  setTimeout(() => { hintEl.classList.add('gone'); hintGone = true; }, 11000);

  // ---------------------------------------------------------------- sizing
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    post.resize(w, h, renderer.getPixelRatio());
    const s = h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    parts.mat.uniforms.uScale.value = s; dust.mat.uniforms.uScale.value = s;
  }
  addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- camera rig
  const cam = { target: new THREE.Vector3(player.x, player.y, player.z), vel: new THREE.Vector3(), zoom: Q.touch ? 1.0 : 1.2, look: new THREE.Vector3() };
  const OFF = new THREE.Vector3(0, 13.2, 12.4);
  const sunFlat = new THREE.Vector3(SUN_DIR.x, 0, SUN_DIR.z).normalize();
  function updateCamera(dt) {
    cam.zoom = THREE.MathUtils.clamp(cam.zoom + input.zoom, 0.7, 2.1); input.zoom = 0;
    const ahead = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(Math.min(1.6, player.speed * 0.35));
    const want = new THREE.Vector3(player.x, player.y, player.z).add(ahead);
    // critically damped follow
    const k = 4.2, d = want.clone().sub(cam.target);
    cam.vel.addScaledVector(d, k * k * dt).multiplyScalar(Math.exp(-2 * k * dt));
    cam.target.addScaledVector(cam.vel, dt);
    const base = cam.target.clone().add(OFF.clone().multiplyScalar(cam.zoom));
    const baseLook = cam.target.clone().add(new THREE.Vector3(0, 0.5, 0));
    // the gaze: crane down behind the automaton and look where it looks
    const g = smoothstep(0, 1, player.gaze);
    const head = new THREE.Vector3(player.x, player.y + 0.85, player.z);
    const gpos = head.clone().addScaledVector(sunFlat, -3.1).add(new THREE.Vector3(0, 0.6, 0));
    gpos.x += -sunFlat.z * 1.0; gpos.z += sunFlat.x * 1.0;
    const gh = player.groundAt(gpos.x, gpos.z).h;
    gpos.y = Math.max(gpos.y, gh + 1.35, U.uWater.value + 0.9);
    const glook = gpos.clone().addScaledVector(sunFlat, 10).add(new THREE.Vector3(0, -0.15, 0));
    camera.position.lerpVectors(base, gpos, g);
    cam.look.lerpVectors(baseLook, glook, g);
    camera.lookAt(cam.look);
    const fov = THREE.MathUtils.lerp(32, 58, g);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    return g;
  }
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------------- events
  const tmpV = new THREE.Vector3();
  let rustleCool = 0, wakeT = 0, pulse = 0, shown = 0;
  function splash(x, z, n, power, y) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = power * (0.4 + Math.random());
      parts.spawn({ x: x + Math.cos(a) * 0.05, y: y + 0.02, z: z + Math.sin(a) * 0.05, vx: Math.cos(a) * s * 0.6, vy: 1.5 + Math.random() * 2.6 * power, vz: Math.sin(a) * s * 0.6,
        g: 9.8, drag: 0.4, life: 0.6 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.07, c: [0.95, 0.98, 1.0], a: 1, floor: y - 0.05 });
    }
  }
  function puff(x, z, y, n, col = [0.86, 0.76, 0.6]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 0.4 + Math.random() * 0.9;
      parts.spawn({ x, y: y + 0.05, z, vx: Math.cos(a) * s, vy: 0.4 + Math.random() * 0.8, vz: Math.sin(a) * s, g: 1.2, drag: 3, life: 0.7 + Math.random() * 0.6, size: 0.07 + Math.random() * 0.08, grow: 1.8, c: col, a: 0.55, floor: y });
    }
  }
  function leaves(x, z, y, n) {
    for (let i = 0; i < n; i++) {
      parts.spawn({ x: x + (Math.random() - 0.5) * 0.4, y: y + 0.4 + Math.random() * 0.4, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 0.8, vz: (Math.random() - 0.5) * 1.2,
        g: 1.2, drag: 2.2, life: 1.2 + Math.random(), size: 0.05, c: [0.35 + Math.random() * 0.2, 0.55 + Math.random() * 0.2, 0.18], a: 1, floor: y });
    }
  }
  function handle(ev, water) {
    for (const e of ev) {
      if (e.type === 'step') {
        snd && snd.step(e.kind);
        if (e.kind === 'sand' || e.kind === 'wet') prints.stamp(e.x, player.groundAt(e.x, e.z).h, e.z, e.yaw);
        if (e.kind === 'water') { splash(e.x, e.z, 5, 0.35, water); rip.add(e.x, e.z, 0.25); }
        else if (e.kind === 'sand' && player.speed > 2.7) puff(e.x, e.z, e.y, 2);
      } else if (e.type === 'jump') { snd && snd.jump(); if (player.inWater) splash(player.x, player.z, 10, 0.6, water); }
      else if (e.type === 'land') {
        snd && snd.land(e.water ? 'water' : player.surface);
        if (e.water) { splash(player.x, player.z, 22, 1, water); rip.add(player.x, player.z, 0.8); snd && snd.splash(1); }
        else if (player.surface === 'sand' || player.surface === 'wet') { puff(player.x, player.z, player.y, 8); prints.stamp(player.x - 0.08, player.y, player.z, player.yaw); prints.stamp(player.x + 0.08, player.y, player.z, player.yaw); }
      }
      else if (e.type === 'roll') { snd && snd.roll(); }
      else if (e.type === 'kick') {
        snd && snd.kick(e.water);
        const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
        if (e.water) {
          for (let i = 0; i < 70; i++) {
            const spread = (Math.random() - 0.5) * 1.2, s = 1.6 + Math.random() * 3.6;
            const dx = fx * Math.cos(spread) - fz * Math.sin(spread), dz = fz * Math.cos(spread) + fx * Math.sin(spread);
            parts.spawn({ x: e.x, y: water + 0.08, z: e.z, vx: dx * s, vy: 2.2 + Math.random() * 3.8, vz: dz * s, g: 9.8, drag: 0.5, life: 0.8 + Math.random() * 0.6, size: 0.06 + Math.random() * 0.1, c: [0.96, 0.99, 1], a: 1, floor: water - 0.05 });
          }
          for (let i = 0; i < 14; i++) {
            const s = 0.8 + Math.random() * 1.6;
            parts.spawn({ x: e.x, y: water + 0.15, z: e.z, vx: fx * s + (Math.random() - 0.5), vy: 1 + Math.random() * 1.5, vz: fz * s + (Math.random() - 0.5), g: 0.8, drag: 2.5, life: 1.0 + Math.random() * 0.5, size: 0.25 + Math.random() * 0.2, grow: 1.5, c: [1, 1, 1], a: 0.35, floor: water });
          }
          rip.add(e.x, e.z, 1.0); rip.add(e.x + fx * 1.2, e.z + fz * 1.2, 0.5);
        } else {
          puff(e.x, e.z, player.y, 12);
          const kind = player.surface;
          if (kind === 'sand' || kind === 'wet') for (let i = 0; i < 14; i++) parts.spawn({ x: e.x, y: player.y + 0.05, z: e.z, vx: fx * (1 + Math.random() * 2) + (Math.random() - 0.5), vy: 1 + Math.random() * 2, vz: fz * (1 + Math.random() * 2) + (Math.random() - 0.5), g: 9.8, drag: 0.6, life: 0.6, size: 0.025, c: [0.8, 0.7, 0.52], a: 1, floor: player.y });
        }
        // a kick into a bush shakes it hard
        kickPlants(e.x, e.z);
      }
      else if (e.type === 'bump') { snd && snd.bump(); pulse = 1; }
    }
  }
  function kickPlants(x, z) {
    for (const R of rustlers) {
      let hit = false;
      R.list.forEach((p, i) => { if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + 0.6) ** 2) { R.attr.array[i] = 1.6; hit = true; } });
      if (hit) { R.attr.needsUpdate = true; snd && snd.rustle(1.6); leaves(x, z, player.y, 6); }
    }
  }
  function updateRustle(dt) {
    rustleCool -= dt;
    const moving = player.speed > 0.4;
    let touched = 0;
    for (const R of rustlers) {
      const arr = R.attr.array; let dirty = false;
      for (let i = 0; i < R.list.length; i++) {
        const p = R.list[i];
        if (arr[i] > 0.001) { arr[i] *= Math.exp(-dt * 2.6); dirty = true; }
        if (!moving) { p.in = false; continue; }
        const dx = p.x - player.x, dz = p.z - player.z;
        if (Math.abs(dx) > 2 || Math.abs(dz) > 2) { p.in = false; continue; }
        const inside = dx * dx + dz * dz < (p.r + 0.25) ** 2;
        if (inside) { touched++; arr[i] = Math.max(arr[i], Math.min(1, player.speed / 3)); dirty = true; if (!p.in) { if (rustleCool < 0) { snd && snd.rustle(0.6 + player.speed / 5); rustleCool = 0.12; } if (Math.random() < 0.35) leaves(p.x, p.z, player.y, 2); } }
        p.in = inside;
      }
      if (dirty) R.attr.needsUpdate = true;
    }
    return touched;
  }

  // ---------------------------------------------------------------- loop
  const timer = new THREE.Timer(); timer.connect && timer.connect(document);
  let running = true, t0 = 0, fade = 0, exiting = false, raf = 0;
  let fps = 60, fpsAcc = 0, fpsN = 0, prDropped = false;
  loadEl.classList.add('gone');
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    timer.update(); let dt = Math.min(timer.getDelta(), 0.05);
    t0 += dt;
    const t = t0;
    U.uTime.value = t;
    const level = 0.055 * Math.sin(t * 0.62) + 0.028 * Math.sin(t * 1.37 + 1.3) - 0.005;
    U.uWater.value = level;
    U.uWindDir.value.set(Math.cos(0.36 + Math.sin(t * 0.05) * 0.2), Math.sin(0.36 + Math.sin(t * 0.05) * 0.2));

    const inp = input.poll();
    if (inp.mag > 0.12 && !hintGone && t > 4) { hintGone = true; setTimeout(() => hintEl.classList.add('gone'), 2500); }
    if (inp.exit) { inp.exit = false; leave(); }
    const ev = player.update(dt, exiting ? { x: 0, z: 0, mag: 0 } : inp, level, t);
    handle(ev, level);
    U.uPlayer.value.set(player.x, player.y, player.z);
    const touched = updateRustle(dt);
    // wake ripples while wading
    wakeT -= dt;
    if (player.inWater && player.speed > 0.4 && wakeT < 0) { rip.add(player.x, player.z, 0.15 + player.speed * 0.05); wakeT = 0.32; }

    fauna.update(dt, t, player, level);
    for (const e of fauna.events) {
      const dx = e.x - player.x, dz = e.z - player.z, dist = Math.hypot(dx, dz);
      if (e.type === 'call' && snd) snd.gull(dx / 12, dist);
      if (e.type === 'gull' && snd) { snd.flap(); snd.gull(dx / 12, dist * 0.5); }
      if (e.type === 'crab' && snd) snd.crab();
      if (e.type === 'ripple') rip.add(e.x, e.z, e.w);
    }
    parts.update(dt); prints.update(dt);
    pulse = Math.max(0, pulse - dt * 0.6);
    hall.update(t, pulse);

    const g = updateCamera(dt);
    // light follows the view, snapped to its own texels so shadows never crawl
    const c = cam.target;
    const texel = (SH * 2) / Q.shadow;
    const lx = Math.round(c.x / texel) * texel, lz = Math.round(c.z / texel) * texel;
    sun.target.position.set(lx, c.y, lz);
    sun.position.set(lx, c.y, lz).addScaledVector(SUN_DIR, 60);
    U.uSunView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
    dust.mat.uniforms.uCenter.value.set(c.x, c.y + 0.2, c.z);

    // lens: tilt-shift centred on the automaton, opening up as the camera cranes to the sun
    tmpV.set(player.x, player.y + 0.5, player.z).project(camera);
    const fy = THREE.MathUtils.clamp(tmpV.y * 0.5 + 0.5, 0.2, 0.8);
    post.tilt(fy, THREE.MathUtils.lerp(0.10, 0.5, g), THREE.MathUtils.lerp(Q.low ? 2.2 : 3.2, 0.25, g) / cam.zoom ** 0.5);
    tmpV.copy(camera.position).addScaledVector(SUN_DIR, 100).project(camera);
    const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.3 && Math.abs(tmpV.y) < 1.3 ? 1 : 0;
    post.fin.uniforms.uFlare.value.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5, vis * g);
    post.fin.uniforms.uTime.value = t;
    post.bloom.strength = 0.3 + g * 0.05;
    post.fin.uniforms.uSat.value = 1.0 + g * 0.18;
    renderer.toneMappingExposure = 1.05 - g * 0.28;
    fade = exiting ? Math.max(0, fade - dt * 0.9) : Math.min(1, fade + dt * 0.55);
    post.fin.uniforms.uFade.value = smoothstep(0, 1, fade);

    // sound and music: the album softens outside, swells while the automaton watches the sun
    if (snd) {
      const shoreD = Math.abs(H(player.x, player.z) - level);
      snd.update({ shore: Math.max(0, 1 - shoreD / 1.6) * 0.8 + 0.2 * Math.max(0, 1 - Math.abs(islandR(player.x, player.z) - 1) * 5), canopy: Math.min(1, touched * 0.3 + 0.3), level, gust: 0.5 + 0.5 * Math.sin(t * 0.61) * Math.sin(t * 0.23), gaze: g });
    }
    {
      const mg = opts.music && opts.music.gain, now = opts.ctx && opts.ctx.currentTime;
      // crossfade: the album out, the island song in, and back again on the way out
      if (mg) mg.setTargetAtTime(exiting ? 0.5 : song ? 0 : 0.26 + g * 0.22, now, song ? 1.2 : 0.8);
      if (song) song.gain.gain.setTargetAtTime(exiting ? 0 : 0.5 + g * 0.15, now, exiting ? 0.4 : 1.2);
    }
    if (opts.organ) {
      const dh = Math.hypot(player.x - HALL.door.x, player.z - HALL.door.z);
      opts.organ(Math.max(0, 0.045 - dh * 0.0028) + pulse * 0.05);
    }

    post.composer.render(dt);

    // adaptive resolution: if the first seconds run slow, drop the pixel ratio once
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (!prDropped && t > 3 && fps < 40 && renderer.getPixelRatio() > 1) { prDropped = true; renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.7)); resize(); } }
    shown++;
  }
  frame();

  function leave() {
    if (exiting) return;
    exiting = true;
    setTimeout(() => { stop(); opts.onExit && opts.onExit(); }, 1300);
  }
  exitEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); leave(); });

  function stop() {
    running = false; cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    input.dispose(); snd && snd.stop();
    if (song) { const sg = song; sg.gain.gain.setTargetAtTime(0, opts.ctx.currentTime, 0.2); setTimeout(() => { try { sg.src.stop(); sg.gain.disconnect(); } catch (e) {} }, 1500); }
    if (opts.organ) opts.organ(-1);
    renderer.dispose(); post.composer.dispose && post.composer.dispose();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    rootEl.remove(); style.remove();
    delete window.__ISLAND__;
  }

  // harness: read-only truth plus a few test levers
  window.__ISLAND__ = {
    ready: true,
    state: () => ({ x: +player.x.toFixed(2), z: +player.z.toFixed(2), y: +player.y.toFixed(2), yaw: +player.yaw.toFixed(2), state: player.state, speed: +player.speed.toFixed(2),
      grounded: player.grounded, inWater: player.inWater, surface: player.surface, gaze: +player.gaze.toFixed(2), fps: Math.round(fps), pr: renderer.getPixelRatio(), water: +U.uWater.value.toFixed(3) }),
    teleport(x, z, yaw = 0) { player.x = x; player.z = z; player.y = player.groundAt(x, z).h; player.yaw = yaw; player.state = 'move'; player.idleT = 0; player.gaze = 0; player.grounded = true; player.vy = 0; cam.target.set(x, player.y, z); cam.vel.set(0, 0, 0); },
    H: (x, z) => H(x, z),
    press: a => input.press(a),
    keys: input.keys,
    leave,
    info: { renderer: () => renderer.info.render },
    debug: { scene, camera, A, cam, sun, renderer },
    audio: () => ({ song: song ? +song.gain.gain.value.toFixed(3) : null, album: opts.music && opts.music.gain ? +opts.music.gain.value.toFixed(3) : null, ctx: opts.ctx ? opts.ctx.state : null }),
  };
  return { stop, leave };
}
