// HERE COMES THE TRUCK — main.js
// Boot, the fixed-step loop, input, the camera rig, the save, and window.__hct.
// This file owns the DOM and the renderer. It never reaches into sim internals except
// through game.act() and documented fields.

import * as THREE from 'three';
import { Game, D, HP, FIXED } from './game.js';
import { View } from './view.js';
import { UI } from './ui.js';
import * as sfx from './sfx.js';

// ---------------------------------------------------------------------------
// THE SAVE — `truck-save`, exactly as the house contract specifies, written from the
// first real input. The room reads `days` and counts `regulars`.
// ---------------------------------------------------------------------------
const SAVE_KEY = 'truck-save';

/** The single authoritative schema. Adding a field here makes every old save load. */
function freshSave() {
  return {
    v: D.VERSION,
    started: true,
    days: 0, bestDay: 0,
    regulars: {}, towns: { hazelpark: 1 }, endings: {}, parlor: false,
    cash: D.ECON.startCash, rep: 0, noteMisses: 0, tickets: 0,
    annoy: {}, prices: {}, owned: {}, saidMid: {}, invented: [], discovered: {},
    settings: { muted: false },
  };
}

/** ⚠️ Deep-default migration, not a version wall. FRESH CUT discards any save whose `v`
 *  doesn't match, so bumping the version wipes every player. Here the SAVE wins on every
 *  key it has and the fresh schema only fills holes. Arrays are leaves, never merged. */
function mergeDefaults(saved) {
  const fresh = freshSave();
  const merge = (dst, src) => {
    for (const k in src) {
      if (!(k in dst)) dst[k] = src[k];
      else if (dst[k] && src[k] && typeof dst[k] === 'object' && typeof src[k] === 'object'
        && !Array.isArray(dst[k])) merge(dst[k], src[k]);
    }
  };
  merge(saved, fresh);
  saved.v = D.VERSION;
  return saved;
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return mergeDefaults(JSON.parse(raw));
  } catch (_) { }
  return freshSave();
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { } }

// ---------------------------------------------------------------------------
// renderer
// ---------------------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
camera.rotation.order = 'YXZ';   // ⚠️ mandatory. Default XYZ gives gimbal roll on pitch.

function resize() {
  // ⚠️ clamp: a collapsed viewport reports 0 and the canvas goes 0x0, which kills the
  // render loop permanently on some paths.
  const w = Math.max(320, innerWidth), h = Math.max(240, innerHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
let G = null, view = null, ui = null;
let running = false, accum = 0, last = performance.now() / 1000, wall = 0;
const input = { throttle: 0, brake: 0, steer: 0 };
const keys = {};

function newDay() {
  G = new Game({
    seed: (save.days * 7919 + 13) >>> 0,
    day: save.days + 1,
    cash: save.cash, rep: save.rep, noteMisses: save.noteMisses,
    tickets: save.tickets, annoy: save.annoy, prices: save.prices,
    owned: save.owned, met: save.regulars, saidMid: save.saidMid,
    invented: save.invented, discovered: save.discovered,
    cb: {
      cameOut: () => { },
      served: (p, note) => { if (note === 'right' || note === 'mercy') sfx.coin(); else sfx.nope(); },
      short: () => sfx.nope(),
      mercy: () => sfx.ding(),
      caught: () => { sfx.nope(); ui.hint('somebody counted it. they will remember that.'); },
      wrong: () => sfx.nope(),
      balk: () => { sfx.nope(); ui.hint('too dear for this street. try the clipboard.'); },
      bump: (v) => { if (v > 3) sfx.thunk(); },
      bought: (u) => { sfx.ding(); ui.hint(`${u.name}. ${u.sub}.`, 6000); },
      park: () => sfx.hatch(),
      window: () => sfx.slide(),
      seat: (on) => { sfx.hatch(); if (!on) ui.bay(false); },
      took: (k) => sfx.hatch(),
      openBay: () => ui.bay(true),
      openClip: () => ui.clipboard(true),
      churnStart: (r) => { sfx.hatch(); ui.hint('churning ' + D.flavourName(r) + '. this is costing you the afternoon.', 5000); },
      churnDone: (f) => { sfx.ding(); ui.hint(`${D.CHURN.batch} of "${f.label}" in the box. go and sell them.`, 7000); },
      legendary: (l) => { sfx.coin(); ui.hint(`— ${l.name} —  you found one of cy's.`, 9000); },
      mirror: () => sfx.waveAt(),
      song: (on) => { on ? sfx.songOn() : sfx.songOff(); },
      dayEnd: (s) => endDay(s),
    },
  });
  view = new View(renderer);
  camNow.set = false; lookPitch = -0.05;
  ui.g = () => G;
  sfx.ambStart(); sfx.engineStart();
  // ⚠️ THE FORECAST IS THE FIRST THING YOU HEAR (bible §4: the radio is the weather
  // surface). It matters because the weather now runs the day — a scorcher keeps the
  // street indoors and eats the box, so this line is planning information, not colour.
  ui.hint('📻 ' + G.weather.radio, 8500);
  if (save.days === 0) setTimeout(() => ui.hint('hold SPACE and drive. they come out when they hear you.', 7000), 9000);
}

function endDay(s) {
  sfx.songOff();
  save.days = s.day;
  save.bestDay = Math.max(save.bestDay || 0, s.took);
  save.cash = s.cash; save.rep = G.rep; save.noteMisses = s.noteMisses;
  save.tickets = G.tickets;
  save.annoy = Object.fromEntries(Object.values(G.blocks).map(b =>
    [b.id, Math.max(0, b.annoy - D.JINGLE.annoyDecayPerDay)]));   // blocks forgive overnight
  save.prices = { ...G.prices };
  save.owned = { ...G.owned };
  save.regulars = { ...G.met };          // the room COUNTS these
  save.saidMid = { ...G.saidMid };
  // the recipes you worked out are yours for good; the batch in the box is not
  save.invented = G.invented.map(f => ({ ...f }));
  save.discovered = { ...G.discovered };
  persist();
  ui.dayEnd(s, G);
}

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------
const KEYMAP = { KeyW: 'w', ArrowUp: 'w', KeyS: 's', ArrowDown: 's', KeyA: 'a', ArrowLeft: 'a', KeyD: 'd', ArrowRight: 'd' };

addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = 1; e.preventDefault(); }
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && G && !G.over) G.act('song', true); }
  if (!running || !G || G.over) return;

  if (e.code === 'KeyQ') {
    const r = G.act('window', !G.windowOpen);
    if (!r.ok) ui.hint('park first. you cannot serve out of a moving truck.');
  }
  // ⚠️ ONE INTERACT KEY, dispatched by where you are standing and what you are facing.
  if (e.code === 'KeyE') {
    const r = G.act('interact');
    if (!r.ok && r.msg) ui.hint(r.msg);
  }
  if (e.code === 'KeyF') { G.act('drop'); }
  if (e.code === 'KeyR') {
    if (sfx.radioPlaying()) { sfx.radioOff(); ui.hint('radio off.'); }
    else { sfx.radioOn(); ui.hint('📻 whzl, the porch. ' + G.weather.radio, 7000); }
  }
  if (e.code === 'Tab') { e.preventDefault(); ui.clipboard(); }
  if (e.code === 'KeyM') { save.settings.muted = !save.settings.muted; sfx.muted(save.settings.muted); persist(); }
  if (e.code === 'Enter' && G.serving) {
    const p = G.serving;
    if (p.stage === 'pay') G.act('change', D.changeDue(p.tender, p.price));
    else if (p.stage === 'short') G.act('mercy');
  }
  // ⚠️ off G.menu(), not D.MENU — the number keys have to reach what you invented too
  const n = e.code.match(/^Digit([1-9])$/);
  if (n && G.serving && G.serving.stage === 'ask') {
    const it = G.menu()[+n[1] - 1];
    if (it) G.act('serve', it.key);
  }
});
addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = 0;
  if (e.code === 'Space' && G && !G.over) G.act('song', false);
});

// ---------------------------------------------------------------------------
// MOUSE LOOK. ⚠️ The mouse turns the CREW, not the camera — the camera is only ever the
// crew's eyes. And when you're in the seat it is CLAMPED: you can glance at your mirror
// or out of the side window, but you cannot end up driving down Maple facing backwards.
// ---------------------------------------------------------------------------
const SEATED_LOOK = 1.15;                 // radians either side of straight ahead
function lookBy(dx, dy) {
  if (!G || G.over) return;
  const cr = G.crew;
  cr.yaw -= dx * 0.0023;
  if (cr.seated) cr.yaw = Math.max(-SEATED_LOOK, Math.min(SEATED_LOOK, cr.yaw));
  else { while (cr.yaw > Math.PI) cr.yaw -= Math.PI * 2; while (cr.yaw < -Math.PI) cr.yaw += Math.PI * 2; }
  lookPitch = Math.max(-0.95, Math.min(0.75, lookPitch - dy * 0.0023));
}
renderer.domElement.addEventListener('mousedown', () => {
  if (running && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
});
addEventListener('mousemove', (e) => {
  if (!running) return;
  if (document.pointerLockElement === renderer.domElement) lookBy(e.movementX, e.movementY);
  else if (e.buttons & 2) lookBy(e.movementX, e.movementY);   // RMB-drag fallback, no lock
});
addEventListener('contextmenu', (e) => { if (running) e.preventDefault(); });
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; if (G && !G.over) G.act('song', false); });

// ---------------------------------------------------------------------------
// the camera
// ⚠️ CONVENTION: the truck's forward is (sin yaw, cos yaw) = local +Z, so the camera's
// yaw is the truck's yaw + PI, and the truck's RIGHT (where the window is) is local -X.
// ---------------------------------------------------------------------------
// ⚠️ ONE CAMERA: THE CREW'S OWN EYES. This was three hand-authored poses (cab, window,
// bay) blended by a float, and every new place in the truck needed another one. Now the
// truck is a space you stand in, so the camera is simply where you are standing and
// which way you are looking — the poster shot at the window is what you SEE when you walk
// to the window, not a scripted angle. Adding a place costs a station, not a camera mode.
const FLOOR_Y = 0.62;                       // must match view.js's interior floor
let lookPitch = -0.05;
const camNow = { x: 0, y: 2.2, z: 0, yaw: 0, fov: 72, set: false };

function placeCamera(dt) {
  const w = G.crewWorld();
  const eyeY = FLOOR_Y + D.CREW.eye;
  const yaw = w.yaw + Math.PI;              // three.js looks down -Z; we face (sin,cos)
  const fov = 72 + (G.crew.seated ? Math.min(1, Math.abs(G.truck.v) / G.topSpeed()) * 6 : -4);

  if (!camNow.set) { camNow.x = w.x; camNow.z = w.z; camNow.y = eyeY; camNow.yaw = yaw; camNow.fov = fov; camNow.set = true; }
  // Position snaps (you ARE there); only the head-bob smoothing and fov ease.
  camNow.x = w.x; camNow.z = w.z;
  camNow.y += (eyeY - camNow.y) * Math.min(1, dt * 8);
  camNow.fov += (fov - camNow.fov) * Math.min(1, dt * 3);
  // ⚠️ ease the SHORT way round, or crossing the +/-PI seam spins the head through 360
  let d = yaw - camNow.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  camNow.yaw += d * Math.min(1, dt * 22);

  camera.position.set(camNow.x, camNow.y, camNow.z);
  camera.rotation.y = camNow.yaw;
  camera.rotation.x = lookPitch;
  if (Math.abs(camera.fov - camNow.fov) > 0.05) { camera.fov = camNow.fov; camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------------------
// the loop — fixed step with an accumulator, exactly like the soak's
// ---------------------------------------------------------------------------
function tick(dtWall) {
  if (!G || G.over) return;
  // ⚠️ THE SAME FOUR KEYS DRIVE OR WALK depending on whether you're in the seat. That is
  // the whole point of the seat being a station: there is no mode button, there is a
  // chair. Overcooked does its entire game on a movement stick and one interact key.
  input.throttle = 0; input.steer = 0; input.brake = 0; input.walkF = 0; input.walkS = 0;
  if (G.crew.seated) {
    input.throttle = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    input.steer = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    // S is brake first, reverse second — a van does not leap backwards off the throttle
    if (keys.s && G.truck.v > 0.4) { input.brake = 1; input.throttle = 0; }
  } else {
    input.walkF = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    input.walkS = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  }

  accum += Math.min(dtWall, 0.25);          // never let a background tab dump 40 s in one go
  let n = 0;
  while (accum >= FIXED && n++ < 8) { G.step(FIXED, input); accum -= FIXED; }

  sfx.engineSet(Math.min(1, Math.abs(G.truck.v) / D.TRUCK.topSpeed), G.cold);
}

function draw(dtWall) {
  if (!G) return;
  wall += dtWall;
  placeCamera(dtWall);
  view.frame(G, dtWall, wall);
  ui.frame(G, dtWall);
  ui.serve(G);
  if (ui.clipOpen) ui.drawClip();

  // ⚠️ THE PROMPT IS NOW DIEGETIC: it names the thing in front of you and what E does to
  // it. The truck is the interface, so the interface tells you about the truck.
  let pr = '';
  if (!G.over) {
    const st = G.stationNear();
    const hands = G.crew.hands ? `carrying ${G.labelOf(G.crew.hands)}` : '';
    if (G.crew.seated) {
      pr = Math.abs(G.truck.v) > 0.6 ? '' : 'E — get up and work the back';
    } else if (st) {
      let verb = st.verb;
      if (st.kind === 'window') {
        const p = G.serving;
        verb = !G.windowOpen ? 'Q to slide it open'
          : !p ? 'nobody at it yet'
            : p.stage === 'ask' ? (G.crew.hands ? `hand over ${G.labelOf(G.crew.hands)}` : 'you have nothing in your hands')
              : p.stage === 'pay' ? 'give them their change'
                : 'they are short — decide';
      } else if (st.kind === 'take' && G.crew.hands) verb = 'hands full — F to put it back';
      pr = `${st.label} — E · ${verb}`;
    } else pr = hands || 'W A S D to move about the truck';
  }
  ui.setPrompt(pr);

  renderer.render(view.scene, camera);
}

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - last); last = now;
  if (!running) return;
  tick(dt);
  draw(dt);
}

// ⚠️ A HIDDEN TAB SUSPENDS rAF. The sim must keep its own time or the day freezes the
// moment the player switches tabs (and headless verification sees nothing at all).
setInterval(() => {
  if (!running || !document.hidden) return;
  const now = performance.now() / 1000;
  const dt = Math.min(0.25, now - last); last = now;
  tick(dt);
}, 100);

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
ui = new UI(() => G, {
  serve: (k) => G && G.act('serve', k),
  change: (c) => G && G.act('change', c),
  act: (a) => G && G.act(a),
  price: (k, d) => { if (G) { G.act('price', { key: k, cents: G.prices[k] + d }); ui.drawClip(); } },
  buy: (k) => {
    if (!G) return;
    const r = G.act('buy', k);
    if (!r.ok) ui.hint(r.msg);
    else { save.owned = { ...G.owned }; persist(); }
    ui.drawClip();
  },
  churn: (recipe) => {
    if (!G) return;
    const r = G.act('churn', recipe);
    if (!r.ok) ui.hint(r.msg);
  },
  nextDay: () => {
    document.getElementById('dayend').classList.add('hide');
    sfx.stopAll(); newDay(); running = true;
  },
});

document.getElementById('start').onclick = () => {
  document.getElementById('title').classList.add('hide');
  document.getElementById('hud').classList.remove('hide');
  sfx.ac(); sfx.muted(save.settings.muted);
  save.started = true; persist();
  newDay();
  running = true; last = performance.now() / 1000;
};
loop();

// ---------------------------------------------------------------------------
// ⚠️ THE DEBUG HANDLE. A first-class feature, not a leftover: a session must be able to
// drive the whole sim from the console without touching the UI, or every verification
// turns into a screenshot. Same pattern as MY BREW's window.MB and Victory Lap's window.vl.
// ---------------------------------------------------------------------------
window.__hct = {
  get g() { return G; },
  get view() { return view; },
  D, HP, THREE, camera, renderer,
  startDay: () => { document.getElementById('start').click(); return 'started'; },
  /** Advance the sim by `sec` in real fixed steps, rendering skipped. */
  step(sec = 1, inp = {}) {
    const n = Math.max(1, Math.round(sec / FIXED));
    for (let i = 0; i < n; i++) G.step(FIXED, inp);
    return `stepped ${sec}s -> ${G.hour.toFixed(2)}h`;
  },
  drive(sec = 3, throttle = 1, steer = 0) { return this.step(sec, { throttle, steer, brake: 0 }); },
  jingle(on = true) { return G.act('song', on); },
  park() { return G.act('park'); },
  depart() { return G.act('depart'); },
  window(on = true) { return G.act('window', on); },
  serve(k) { return G.act('serve', k || (G.serving && G.serving.want)); },
  change(c) { const p = G.serving; return G.act('change', c === undefined ? D.changeDue(p.tender, p.price) : c); },
  act: (n, a) => G.act(n, a),
  /** ⚠️ A CALLABLE RENDER PATH. `draw()` is driven by rAF, and a hidden Browser-pane tab
   *  suspends rAF entirely — so the camera is never placed and a screenshot photographs
   *  a default camera sitting at the world origin, at ground level, looking down -Z.
   *  (It renders as houses either side of a thin dark line with sky above AND below,
   *  which reads convincingly as "the camera is upside down". It isn't.) */
  renderOnce(dt = 0.016) {
    placeCamera(dt); wall += dt; view.frame(G, dt, wall);
    renderer.render(view.scene, camera);
    return 'rendered';
  },
  state() {
    const t = G.truck;
    return {
      day: G.day, hour: +G.hour.toFixed(2), over: G.over, why: G.ending,
      truck: { x: +t.x.toFixed(2), z: +t.z.toFixed(2), yaw: +t.yaw.toFixed(3), v: +t.v.toFixed(2), parked: t.parked },
      surface: HP.surfaceAt(t.x, t.z), block: HP.blockAt(t.x, t.z),
      cold: +G.cold.toFixed(3), drawer: G.drawer, cash: G.cash, rep: +G.rep.toFixed(1),
      song: G.song, windowOpen: G.windowOpen, noiseHeat: +G.noiseHeat.toFixed(2),
      people: G.people.length, queue: G.queueLen(),
      serving: G.serving ? { said: G.serving.said, want: G.serving.want, stage: G.serving.stage, tender: G.serving.tender } : null,
      mirror: !!G.mirrorBlocker(),
      annoy: Object.fromEntries(Object.values(G.blocks).map(b => [b.id, +b.annoy.toFixed(3)])),
      stats: G.stats, hash: G.stateHash(),
    };
  },
  save: () => save,
  wipe() { localStorage.removeItem(SAVE_KEY); save = freshSave(); return 'wiped'; },
  sfx,
  /** Photograph the page. A WebGL buffer is only cleared on COMPOSITE, so render and
   *  toDataURL in the SAME synchronous task and you get real pixels back. */
  shot(w = 1280, h = 720) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    placeCamera(0.016); view.frame(G, 0.016, wall);      // rAF may be suspended — place it ourselves
    renderer.render(view.scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    resize();
    return url;
  },
};
