// HERE COMES THE TRUCK — sfx.js  (VIEW ONLY. Math.random is fine in here.)
//
// Forked from FRESH CUT's bus architecture, which is already ours and already tuned.
// Five gains: master, and four children. Every sound starts with `if (!ac()) return;` so
// any user gesture unlocks the context, and if the constructor ever throws we go silently
// dead forever rather than erroring on every call — that's what lets headless run.

let AC = null;
const buses = {};
let acDead = false;
let amb = { nodes: [], timers: [] };

export function ac() {
  if (acDead) return null;
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      // ⚠️ `jing` IS ITS OWN BUS. In FRESH CUT the jingle is a truck two streets away and
      // rides the AMBIENCE gain. Here it is the protagonist — if it shares a fader with
      // birdsong, the player turns down the ambience and silences the whole game.
      for (const b of ['master', 'eng', 'jing', 'amb', 'ui']) {
        buses[b] = AC.createGain();
        buses[b].connect(b === 'master' ? AC.destination : buses.master);
      }
      buses.master.gain.value = 0.9;
      buses.eng.gain.value = 0.55; buses.jing.gain.value = 0.9;
      buses.amb.gain.value = 0.7; buses.ui.gain.value = 0.85;
    } catch (e) { acDead = true; AC = null; return null; }
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
export function setVol(bus, v) { if (AC && buses[bus]) buses[bus].gain.value = v; }
export function muted(m) { if (ac()) buses.master.gain.value = m ? 0 : 0.9; }

// ---------------------------------------------------------------------------
// THE JINGLE. C6-E6-G6-E6-C6-A5-C6, 0.33 s apart — FRESH CUT's `jingle()`, note for
// note, because those seven notes are already ours and everyone who has played FRESH CUT
// has already heard them go past somebody's lawn.
//
// ⚠️ Two deliberate changes from the original, both required:
//   1. The lowpass moves from 1300 Hz (the "two streets over" muffle) to 5200 Hz, and the
//      gain from 0.042 to 0.20. You are IN the truck now. It is not distant any more.
//   2. It is TRACKED. The original is fire-and-forget for a car that passes once; looped
//      from a cab that would leak an oscillator every 2.3 s for the whole afternoon.
// ---------------------------------------------------------------------------
const NOTES = [1047, 1319, 1568, 1319, 1047, 880, 1047];
export const JINGLE_LEN = NOTES.length * 0.33;

let song = { on: false, timer: null, nodes: [] };

function jinglePhrase(at) {
  NOTES.forEach((f, i) => {
    const t = at + i * 0.33;
    const g = AC.createGain(); g.connect(buses.jing);
    const o = AC.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    o.connect(lp); lp.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.20, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    o.start(t); o.stop(t + 0.55);
    song.nodes.push(o);
    o.onended = () => { const i2 = song.nodes.indexOf(o); if (i2 >= 0) song.nodes.splice(i2, 1); };
  });
}

/** Hold it and it loops. This is the verb the whole game is named after. */
export function songOn() {
  if (!ac() || song.on) return;
  song.on = true;
  const loop = () => {
    if (!song.on) return;
    jinglePhrase(AC.currentTime + 0.02);
    song.timer = setTimeout(loop, JINGLE_LEN * 1000);
  };
  loop();
}
export function songOff() {
  song.on = false;
  if (song.timer) { clearTimeout(song.timer); song.timer = null; }
  for (const n of song.nodes) { try { n.stop(); } catch (_) { } }
  song.nodes = [];
}
export function songPlaying() { return song.on; }

// ---------------------------------------------------------------------------
// The engine, and the freezer.
// MY BREW's model: pitch digs DOWN under load. Here the second voice is the compressor
// losing its fight with the afternoon — you hear the day ending before you look at it.
// ---------------------------------------------------------------------------
let eng = null;
export function engineStart() {
  if (!ac() || eng) return;
  const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 62;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
  const g = AC.createGain(); g.gain.value = 0.05;
  o.connect(lp); lp.connect(g); g.connect(buses.eng); o.start();

  // the freezer hum: a second, quieter voice that sags as the cold goes
  const h = AC.createOscillator(); h.type = 'triangle'; h.frequency.value = 118;
  const hg = AC.createGain(); hg.gain.value = 0.022;
  h.connect(hg); hg.connect(buses.eng); h.start();

  eng = { o, g, lp, h, hg };
}
/** speed 0..1, cold 0..1 */
export function engineSet(speed, cold) {
  if (!eng || !AC) return;
  const t = AC.currentTime;
  eng.o.frequency.setTargetAtTime(58 + speed * 74, t, 0.12);
  eng.g.gain.setTargetAtTime(0.04 + speed * 0.055, t, 0.15);
  eng.lp.frequency.setTargetAtTime(260 + speed * 520, t, 0.15);
  // as the box warms the compressor works harder and lower
  eng.h.frequency.setTargetAtTime(96 + cold * 34, t, 0.5);
  eng.hg.gain.setTargetAtTime(0.014 + (1 - cold) * 0.020, t, 0.5);
}
export function engineStop() {
  if (!eng) return;
  for (const n of [eng.o, eng.h]) { try { n.stop(); } catch (_) { } }
  eng = null;
}

// ---------------------------------------------------------------------------
// One-shots. All tiny, all synthesised, none of them files.
// ---------------------------------------------------------------------------
function blip(freq, dur, type, vol, bus, slideTo) {
  if (!ac()) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(buses[bus] || buses.ui);
  o.start(t); o.stop(t + dur + 0.02);
}

export const coin = () => { blip(1750, 0.09, 'square', 0.07); setTimeout(() => blip(2300, 0.13, 'square', 0.055), 55); };
export const hatch = () => blip(220, 0.16, 'sine', 0.10, 'ui', 120);
export const slide = () => blip(340, 0.28, 'sawtooth', 0.045, 'ui', 700);   // the window going up
export const thunk = () => blip(90, 0.16, 'sine', 0.13, 'ui', 55);
export const ding = () => blip(1320, 0.22, 'sine', 0.07, 'ui', 1980);
export const nope = () => blip(260, 0.16, 'square', 0.05, 'ui', 190);
export const waveAt = () => { blip(880, 0.1, 'triangle', 0.05); setTimeout(() => blip(1180, 0.14, 'triangle', 0.045), 90); };

// ---------------------------------------------------------------------------
// The street bed. Tracked, and stopped on teardown — the Age of Toys leak lesson.
// ---------------------------------------------------------------------------
export function ambStart() {
  if (!ac() || amb.nodes.length) return;
  const add = (n) => { amb.nodes.push(n); return n; };
  // warm air
  const buf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  const src = add(AC.createBufferSource()); src.buffer = buf; src.loop = true;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const g = AC.createGain(); g.gain.value = 0.030;
  src.connect(lp); lp.connect(g); g.connect(buses.amb); src.start();

  // cicadas, deep summer, on and off
  const cic = () => {
    if (!amb.nodes.includes(src)) return;
    const t = AC.currentTime, dur = 1.6 + Math.random() * 2.4;
    const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 3100 + Math.random() * 700;
    // ⚠️ `Q` is an AudioParam, not a number. `bp.Q = 7` throws "which has only a getter"
    // — and because the cicadas reschedule themselves, it threw on a timer every few
    // seconds forever while the game itself carried on looking perfectly fine.
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 7;
    const cg = AC.createGain(); cg.gain.setValueAtTime(0, t);
    cg.gain.linearRampToValueAtTime(0.010, t + 0.5);
    cg.gain.setTargetAtTime(0, t + dur, 0.4);
    const lfo = AC.createOscillator(); lfo.frequency.value = 11 + Math.random() * 5;
    const lg = AC.createGain(); lg.gain.value = 0.006;
    lfo.connect(lg); lg.connect(cg.gain); lfo.start(t); lfo.stop(t + dur + 1.2);
    o.connect(bp); bp.connect(cg); cg.connect(buses.amb);
    o.start(t); o.stop(t + dur + 1.2);
    amb.timers.push(setTimeout(cic, (dur + 2 + Math.random() * 6) * 1000));
  };
  cic();
}
export function ambStop() {
  for (const t of amb.timers) clearTimeout(t);
  for (const n of amb.nodes) { try { n.stop ? n.stop() : 0; } catch (_) { } try { n.disconnect(); } catch (_) { } }
  amb = { nodes: [], timers: [] };
}
export function ambDebug() { return { nodes: amb.nodes.length, timers: amb.timers.length, song: song.nodes.length }; }
export function stopAll() { songOff(); engineStop(); ambStop(); }
