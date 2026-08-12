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
let camMode = 'cab';   // 'cab' while driving, 'window' when you slide it open
let camBlend = 0;

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
      window: (on) => { sfx.slide(); camMode = on ? 'window' : 'cab'; },
      churnStart: (r) => { sfx.hatch(); ui.hint('churning ' + D.flavourName(r) + '. this is costing you the afternoon.', 5000); },
      churnDone: (f) => { sfx.ding(); ui.hint(`${D.CHURN.batch} of "${f.label}" in the box. go and sell them.`, 7000); },
      legendary: (l) => { sfx.coin(); ui.hint(`— ${l.name} —  you found one of cy's.`, 9000); },
      mirror: () => sfx.waveAt(),
      song: (on) => { on ? sfx.songOn() : sfx.songOff(); },
      dayEnd: (s) => endDay(s),
    },
  });
  view = new View(renderer);
  camBlend = 0; camMode = 'cab';
  ui.g = () => G;
  sfx.ambStart(); sfx.engineStart();
  ui.hint('hold SPACE and drive. they come out when they hear you.', 7000);
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

  if (e.code === 'KeyE') {
    const r = G.truck.parked ? G.act('depart') : G.act('park');
    if (!r.ok && r.blocker) ui.hint('somebody small is right in front of you. wait for them.');
    else if (!r.ok && r.msg === 'still rolling') ui.hint('you have to actually stop first.');
  }
  if (e.code === 'KeyQ') {
    const r = G.act('window', !G.windowOpen);
    if (!r.ok) ui.hint('park first. you cannot serve out of a moving truck.');
  }
  if (e.code === 'KeyB') {
    if (!G.truck.parked) ui.hint('park first — the bay is in the back.');
    else if (G.windowOpen) ui.hint('shut the window. you cannot serve and churn at once.');
    else { camMode = camMode === 'bay' ? 'cab' : 'bay'; ui.bay(camMode === 'bay'); }
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
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; if (G && !G.over) G.act('song', false); });

// ---------------------------------------------------------------------------
// the camera
// ⚠️ CONVENTION: the truck's forward is (sin yaw, cos yaw) = local +Z, so the camera's
// yaw is the truck's yaw + PI, and the truck's RIGHT (where the window is) is local -X.
// ---------------------------------------------------------------------------
// ⚠️ THREE POSITIONS, one easing rig. This used to be a two-way blend between the cab and
// the window driven by a single 0..1 float; adding the churn bay as a third made that
// unrepresentable. Compute the TARGET pose for whatever mode is current, then ease the
// live pose toward it — adding a fourth position later costs one entry, not a rewrite.
const camNow = { x: 0, y: 1.84, z: 0, yaw: 0, pitch: 0, fov: 72, set: false };

function camTarget() {
  const t = G.truck;
  const f = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
  const r = { x: -Math.cos(t.yaw), z: Math.sin(t.yaw) };

  if (camMode === 'window') {
    // You step across and you are looking OUT at them. Kids at your window, from inside
    // your truck, in four o'clock light — this shot is the game's whole poster.
    // ⚠️ INSIDE the frame (half-width is 0.975), so your own sill and jambs edge the shot.
    const o = D.TRUCK.wide / 2 - 0.30;
    const p = { x: t.x + r.x * o - f.x * 0.1, y: 1.62, z: t.z + r.z * o - f.z * 0.1 };
    // ⚠️ Look at whoever is actually TALKING. A fixed perpendicular yaw is close but not
    // right — the head of the queue stops anywhere within reachWindow of the mark, which
    // puts them ~20 degrees off centre and the poster shot has a person at its edge.
    const q = G.serving || G.queueSlot(0);
    return { ...p, yaw: Math.atan2(-(q.x - p.x), -(q.z - p.z)), pitch: -0.10, fov: 64 };
  }
  if (camMode === 'bay') {
    // Park, turn around, three steps. You are standing in the back facing the machine.
    return {
      x: t.x + f.x * 0.62, y: 1.58, z: t.z + f.z * 0.62,
      yaw: t.yaw, pitch: -0.14, fov: 70,      // yaw = t.yaw looks along -forward
    };
  }
  // the cab: behind the windscreen, a little left of centre because that's the seat.
  // ⚠️ SIT BACK. At 1.15 m forward the driver's nose is against the glass and the
  // A-pillars and header eat most of the frame.
  return {
    x: t.x + f.x * 0.95 + r.x * -0.40, y: 1.84, z: t.z + f.z * 0.95 + r.z * -0.40,
    yaw: t.yaw + Math.PI, pitch: -0.06,
    fov: 72 + Math.min(1, Math.abs(t.v) / G.topSpeed()) * 6,   // a breath of FOV for speed
  };
}

function placeCamera(dt) {
  const tg = camTarget();
  if (!camNow.set) { Object.assign(camNow, tg); camNow.set = true; }
  const k = Math.min(1, dt * 5.0);
  camNow.x += (tg.x - camNow.x) * k;
  camNow.y += (tg.y - camNow.y) * k;
  camNow.z += (tg.z - camNow.z) * k;
  camNow.pitch += (tg.pitch - camNow.pitch) * k;
  camNow.fov += (tg.fov - camNow.fov) * Math.min(1, dt * 3);
  // ⚠️ always ease the SHORT way round, or a mode change across the +/-PI seam spins the
  // camera the long way through the whole world
  let d = tg.yaw - camNow.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  camNow.yaw += d * k;

  camera.position.set(camNow.x, camNow.y, camNow.z);
  camera.rotation.y = camNow.yaw;
  camera.rotation.x = camNow.pitch;
  if (Math.abs(camera.fov - camNow.fov) > 0.05) { camera.fov = camNow.fov; camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------------------
// the loop — fixed step with an accumulator, exactly like the soak's
// ---------------------------------------------------------------------------
function tick(dtWall) {
  if (!G || G.over) return;
  input.throttle = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
  input.steer = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  input.brake = 0;
  // S is brake first, reverse second — a van does not leap backwards off the throttle
  if (keys.s && G.truck.v > 0.4) { input.brake = 1; input.throttle = 0; }

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

  // the contextual prompt. The truck is the interface, so it tells you what it wants.
  let pr = '';
  if (G.over) pr = '';
  else if (G.truck.parked && !G.windowOpen) pr = 'Q — slide the window open';
  else if (G.truck.parked && G.windowOpen && !G.serving) pr = 'Q to close up · E to pull away';
  else if (G.truck.parked && camMode === 'bay') pr = 'B — back to the cab';
  else if (G.truck.parked) pr = 'Q — the window · B — the churn bay in the back';
  else if (!G.truck.parked && G.people.some(p => p.state === 'kerb')) pr = 'somebody is waiting — stop and E to park';
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
