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
    annoy: {}, prices: {},
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
renderer.toneMappingExposure = 1.0;
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
    cb: {
      cameOut: () => { },
      served: (p, note) => { if (note === 'right' || note === 'mercy') sfx.coin(); else sfx.nope(); },
      short: () => sfx.nope(),
      mercy: () => sfx.ding(),
      caught: () => { sfx.nope(); ui.hint('somebody counted it. they will remember that.'); },
      wrong: () => sfx.nope(),
      balk: () => { sfx.nope(); ui.hint('too dear for this street. try the clipboard.'); },
      bump: (v) => { if (v > 3) sfx.thunk(); },
      park: () => sfx.hatch(),
      window: (on) => { sfx.slide(); camMode = on ? 'window' : 'cab'; },
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
  if (e.code === 'Tab') { e.preventDefault(); ui.clipboard(); }
  if (e.code === 'KeyM') { save.settings.muted = !save.settings.muted; sfx.muted(save.settings.muted); persist(); }
  if (e.code === 'Enter' && G.serving) {
    const p = G.serving;
    if (p.stage === 'pay') G.act('change', D.changeDue(p.tender, p.price));
    else if (p.stage === 'short') G.act('mercy');
  }
  const n = e.code.match(/^Digit([1-5])$/);
  if (n && G.serving && G.serving.stage === 'ask') G.act('serve', D.MENU[+n[1] - 1].key);
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
function placeCamera(dt) {
  const t = G.truck;
  const target = camMode === 'window' ? 1 : 0;
  camBlend += (target - camBlend) * Math.min(1, dt * 4.5);

  const f = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
  const r = { x: -Math.cos(t.yaw), z: Math.sin(t.yaw) };

  // the cab: behind the windscreen, a little left of centre because that's where the seat is
  const cab = { x: t.x + f.x * 1.15 + r.x * -0.42, y: 1.86, z: t.z + f.z * 1.15 + r.z * -0.42 };
  // The window: you step across and you are looking OUT at them. Kids at your window,
  // from inside your truck, in four o'clock light — this shot is the game's whole poster.
  // ⚠️ It must sit AT the opening, past the truck's own skin (half-width is 0.975). At
  // 0.55 out the camera is still inside the bodywork and the poster shot is a black frame.
  // INSIDE the frame, looking out through the opening — so your own sill and jambs edge
  // the shot and it reads as your truck rather than a floating camera on the pavement.
  const o = D.TRUCK.wide / 2 - 0.30;
  const win = { x: t.x + r.x * o - f.x * 0.1, y: 1.62, z: t.z + r.z * o - f.z * 0.1 };

  const b = camBlend * camBlend * (3 - 2 * camBlend);   // smoothstep
  camera.position.set(cab.x + (win.x - cab.x) * b, cab.y + (win.y - cab.y) * b, cab.z + (win.z - cab.z) * b);

  // Facing: forward from the cab, and at whoever is actually talking when you're at the
  // window. ⚠️ A fixed "perpendicular to the truck" yaw is close but not right — the head
  // of the queue stops anywhere within reachWindow of the mark, which at this range puts
  // them ~20 degrees off frame centre and the poster shot has a person at its edge.
  const yawCab = t.yaw + Math.PI;
  const q0 = G.serving || G.queueSlot(0);         // look at whoever is actually talking
  let yawWin = Math.atan2(-(q0.x - win.x), -(q0.z - win.z));
  while (yawWin - yawCab > Math.PI) yawWin -= Math.PI * 2;     // take the short way round
  while (yawWin - yawCab < -Math.PI) yawWin += Math.PI * 2;
  camera.rotation.y = yawCab + (yawWin - yawCab) * b;
  camera.rotation.x = -0.06 - b * 0.04;   // barely down — a grown-up's face is at your eye line

  // a breath of FOV under throttle, so speed reads
  const wantFov = 72 + Math.min(1, Math.abs(t.v) / D.TRUCK.topSpeed) * 6 - b * 8;
  if (Math.abs(camera.fov - wantFov) > 0.05) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
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
