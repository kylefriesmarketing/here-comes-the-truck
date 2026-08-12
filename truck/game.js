// HERE COMES THE TRUCK — game.js
//
// THE ENTIRE SIM. DOM-free: importable in Node for tests/soak.mjs.
// ⚠️ No `window`, no `document`, no THREE, at module top level or anywhere below it.
// ⚠️ All sim randomness goes through this.rng (seeded LCG). View code may use Math.random.
//    The day must replay identically from the same seed and the same inputs.
// ⚠️ Every view hook is an optional guarded callback on this.cb — in Node cb is {} and
//    every call is a no-op. That is what makes a full day cost milliseconds.

import * as D from './data.js';
import * as HP from './hazel-park.js';

export { D, HP };                       // one import edge for main.js

export const FIXED = 1 / 60;            // the sim's fixed step. Driving wants 60.

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sgn = (v) => v < 0 ? -1 : v > 0 ? 1 : 0;

export class Game {
  constructor(opts = {}) {
    this.opts = opts;
    this.cb = opts.cb || {};
    this.seed = (opts.seed ?? 1) >>> 0;
    this._rs = (this.seed * 747796405 + 2891336453) >>> 0;

    this.day = opts.day || 1;
    this.t = 0;
    this.hour = D.DAY.startHour;
    this.over = false;
    this.ending = null;
    this.frame = 0;

    this.truck = {
      x: HP.SPAWN.x, z: HP.SPAWN.z, yaw: HP.SPAWN.yaw,
      v: 0, steer: 0, parked: false,
    };

    this.cold = D.COLD.full;
    this.cash = opts.cash ?? D.ECON.startCash;
    this.drawer = 0;
    this.rep = opts.rep || 0;             // STANDING. Never decays. (Victory Lap's two-track model.)
    this.noiseHeat = opts.noiseHeat || 0; // HEAT. Decays overnight.
    this.tickets = opts.tickets || 0;
    this.noteMisses = opts.noteMisses || 0;

    this.stock = {};
    this.prices = {};
    for (const m of D.MENU) { this.stock[m.key] = 20; this.prices[m.key] = m.price; }
    if (opts.prices) Object.assign(this.prices, opts.prices);

    this.song = false;
    this.windowOpen = false;

    this.houses = HP.buildHouses().map(h => ({ ...h, heard: 0, out: false, cool: 0 }));
    this.rects = HP.buildRects(this.houses);
    this.blocks = {};
    for (const b of HP.BLOCKS) {
      this.blocks[b.id] = { id: b.id, ceiling: b.ceiling, annoy: opts.annoy?.[b.id] || 0 };
    }

    this.people = [];
    this._pid = 0;
    this.serving = null;                  // the person at the window right now
    this.spots = [];                      // where you've parked today (the 24h ordinance)
    this.stop = null;                     // the current stop

    this.stats = {
      served: 0, wrong: 0, walkedOff: 0, cameOut: 0, mercy: 0,
      refused: 0, shorted: 0, shortCaught: 0, balked: 0, impossible: 0,
      bumps: 0, songSec: 0, driven: 0,
    };
  }

  // ---- rng ----------------------------------------------------------------
  rng() { this._rs = (this._rs * 1664525 + 1013904223) >>> 0; return this._rs / 4294967296; }
  ri(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }
  rr(a, b) { return a + this.rng() * (b - a); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  chance(p) { return this.rng() < p; }

  /**
   * ⚠️ Salted FNV-1a hash, NOT this.rng. For anything the VIEW reads every frame —
   * a face at the window, a house's mood — because it must be stable across every call
   * in a day and must NOT advance the sim stream. Pure function of state.
   */
  _h(...parts) {
    let h = 2166136261 >>> 0;
    const s = parts.join('|');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h >>> 0) / 4294967296;
  }

  // ---- geometry helpers ---------------------------------------------------
  // ⚠️ THE CONVENTION, and every direction bug in this codebase will trace back to it:
  //    forward = (sin yaw, cos yaw)      -- so yaw 0 drives toward +z
  //    right   = (-cos yaw, sin yaw)     -- because right = forward x up in three.js
  //    the CAMERA's yaw is the truck's yaw + PI, and rotation.order must be 'YXZ'.
  fwd() { return { x: Math.sin(this.truck.yaw), z: Math.cos(this.truck.yaw) }; }
  right() { return { x: -Math.cos(this.truck.yaw), z: Math.sin(this.truck.yaw) }; }

  /** The serving window: the truck's right, which in right-hand traffic is the kerb side.
   *  Real law: vend only from the side away from traffic. */
  windowPos() {
    const r = this.right(), t = this.truck;
    const o = D.TRUCK.wide / 2 + 0.7;
    return { x: t.x + r.x * o, z: t.z + r.z * o };
  }

  /** Truck-local coordinates of a world point: {fwd, lat}. */
  local(x, z) {
    const t = this.truck, s = Math.sin(t.yaw), c = Math.cos(t.yaw);
    const dx = x - t.x, dz = z - t.z;
    return { fwd: dx * s + dz * c, lat: dx * -c + dz * s };
  }

  /**
   * ⚠️ THE MIRROR. Real law in NY/NJ/MI requires a front convex mirror for the blind
   * zone in front of the hood. Nothing bad ever happens here — toys don't bleed. The
   * truck simply will not move, and a kid waves at you from down there.
   */
  mirrorBlocker() {
    const T = D.TRUCK, nose = T.len * 0.5;
    for (const p of this.people) {
      if (p.state === 'gone') continue;
      const l = this.local(p.x, p.z);
      if (l.fwd > nose - 0.4 && l.fwd < nose + T.mirrorAhead && Math.abs(l.lat) < T.mirrorHalfW) return p;
    }
    return null;
  }

  // ---- the step -----------------------------------------------------------
  /** One fixed sim step. `input` = { throttle -1..1, brake 0..1, steer -1..1 }. */
  step(dt, input) {
    if (this.over) return;
    this.frame++;
    const i = input || {};
    this._drive(dt, i);
    this._songTick(dt);
    this._people(dt);
    this._clock(dt);
  }

  _drive(dt, input) {
    const T = D.TRUCK, tr = this.truck;

    // The wheel turns toward your input at a real rate — it does not teleport.
    const want = clamp(input.steer || 0, -1, 1) * T.maxSteer;
    const rate = Math.abs(want) > Math.abs(tr.steer) ? T.steerRate : T.steerReturn;
    tr.steer += clamp(want - tr.steer, -rate * dt, rate * dt);

    if (tr.parked) { tr.v = 0; return; }

    const th = clamp(input.throttle || 0, -1, 1);
    if (th > 0) {
      // accel tails off as you approach top speed, so it never snaps to the cap
      const f = clamp(1 - Math.max(0, (tr.v / T.topSpeed - T.accelFalloff)) / (1 - T.accelFalloff), 0.08, 1);
      tr.v += T.accel * th * f * dt;
    } else if (th < 0) {
      // Company doctrine bans backing up to make a sale — "shift into neutral and get out
      // to push it backward." Reverse exists, and it is deliberately slow and awkward.
      tr.v += T.accel * th * 0.55 * dt;
      if (tr.v < -T.topReverse) tr.v = -T.topReverse;
    }

    // deceleration: rolling + air + engine braking + whatever you're driving on
    const surf = HP.surfaceAt(tr.x, tr.z);
    const av = Math.abs(tr.v);
    let dec = T.rollDrag + T.airDrag * tr.v * tr.v;
    if (th === 0) dec += T.engineBrake;
    if (surf === 'walk') dec += T.kerbDragC + T.kerbDragK * av;
    else if (surf === 'lawn') dec += T.lawnDragC + T.lawnDragK * av;
    if (input.brake > 0) dec += T.brake * clamp(input.brake, 0, 1);
    const drop = Math.min(Math.abs(tr.v), dec * dt);
    tr.v -= sgn(tr.v) * drop;
    if (Math.abs(tr.v) < 1e-4) tr.v = 0;

    // THE BICYCLE MODEL. This one line is why you cannot turn while stopped, why it's
    // tight at walking pace and wide at speed, and why parking feels like a van.
    if (tr.v !== 0) tr.yaw += (tr.v / T.wheelbase) * Math.tan(tr.steer) * dt;

    const f = this.fwd();
    const nx = tr.x + f.x * tr.v * dt;
    const nz = tr.z + f.z * tr.v * dt;
    this.stats.driven += Math.abs(tr.v) * dt;
    tr.x = nx; tr.z = nz;
    this._collide();
  }

  /**
   * Two swept circles (front axle, rear axle) against house rects.
   * ⚠️ FRESH CUT's hardest collision lesson, inherited deliberately: the escape direction
   * is decided ONCE PER RECT, FROM THE BODY CENTRE — never per-probe. The two probes sit
   * at different depths, so letting each pick its own nearest wall makes them push in
   * opposite directions and the truck walks itself into the building.
   * ⚠️ And never approximate a building with circles: they bulge ~2 m past the ends.
   */
  _collide() {
    const T = D.TRUCK, tr = this.truck;
    const f = this.fwd();
    const probes = [
      { x: tr.x + f.x * T.axleFront, z: tr.z + f.z * T.axleFront },
      { x: tr.x + f.x * T.axleRear, z: tr.z + f.z * T.axleRear },
    ];
    let hit = false;

    for (const r of this.rects) {
      // cheap broad-phase reject
      if (Math.abs(r.x - tr.x) > r.hw + 8 || Math.abs(r.z - tr.z) > r.hd + 8) continue;

      // the escape direction for THIS rect, from the body centre, once
      const bx = clamp(tr.x, r.x - r.hw, r.x + r.hw);
      const bz = clamp(tr.z, r.z - r.hd, r.z + r.hd);
      let ex = tr.x - bx, ez = tr.z - bz;
      let el = Math.hypot(ex, ez);
      if (el < 1e-4) {
        // body centre is inside the rect: escape along the shortest axis out
        const dxr = (r.x + r.hw) - tr.x, dxl = tr.x - (r.x - r.hw);
        const dzr = (r.z + r.hd) - tr.z, dzl = tr.z - (r.z - r.hd);
        const m = Math.min(dxr, dxl, dzr, dzl);
        ex = m === dxr ? 1 : m === dxl ? -1 : 0;
        ez = m === dzr ? 1 : m === dzl ? -1 : 0;
        el = 1;
      }
      ex /= el; ez /= el;

      for (const p of probes) {
        const cx = clamp(p.x, r.x - r.hw, r.x + r.hw);
        const cz = clamp(p.z, r.z - r.hd, r.z + r.hd);
        const d = Math.hypot(p.x - cx, p.z - cz);
        if (d < T.bodyR) {
          const push = T.bodyR - d;
          tr.x += ex * push; tr.z += ez * push;
          p.x += ex * push; p.z += ez * push;
          hit = true;
        }
      }
    }

    // town bounds — a wall, but a polite one
    const B = HP.BOUNDS, R = T.bodyR + 1;
    const cx2 = clamp(tr.x, B.x0 + R, B.x1 - R), cz2 = clamp(tr.z, B.z0 + R, B.z1 - R);
    if (cx2 !== tr.x || cz2 !== tr.z) { tr.x = cx2; tr.z = cz2; hit = true; }

    if (hit) {
      const was = Math.abs(this.truck.v);
      this.truck.v *= 0.24;
      if (was > 1.4 && this._bumpT !== this.frame) {
        this._bumpT = this.frame;
        this.stats.bumps++;
        this.cb.bump && this.cb.bump(was);
      }
    }
  }

  // ---- THE SONG -----------------------------------------------------------
  // The signature system: hold the button, the song plays, it has a radius, and houses
  // inside it accumulate HEARD which converts into people walking out to the kerb.
  // You watch them come. That is the feeling the whole game is built to deliver.
  _songTick(dt) {
    const tr = this.truck;
    if (this.song) this.stats.songSec += dt;

    for (const h of this.houses) {
      if (h.cool > 0) h.cool -= dt;
      let g = 0;
      if (this.song) g = D.hearAt(Math.hypot(h.x - tr.x, h.z - tr.z));
      if (g > 0) h.heard += D.JINGLE.heardRate * g * dt;
      else if (h.heard > 0) h.heard = Math.max(0, h.heard - D.JINGLE.heardDecay * dt);

      if (!h.out && h.cool <= 0 && h.heard >= D.JINGLE.heardOut) {
        const b = this.blocks[h.block];
        if (b.annoy >= D.JINGLE.annoyCold) { h.heard = 0; continue; }  // this block has had enough
        this._comeOut(h);
      }
    }

    if (!this.song) return;

    // Every block accumulates ANNOYED. Lean on the song at one corner and windows close.
    const bid = HP.blockAt(tr.x, tr.z);
    if (bid) {
      const mul = tr.parked ? D.JINGLE.annoyParkedMul : 1;
      this.blocks[bid].annoy += D.JINGLE.annoyRate * mul * dt;
    }
    // ⚠️ The law says silence the instant you're stationary and serving. Heat only becomes
    // a fine if somebody with a clipboard is in line of sight — so every stop is a gamble:
    // eight more seconds of song pulls two more kids off the next block.
    if (tr.parked || Math.abs(tr.v) < 0.2) this.noiseHeat += D.JINGLE.noiseHeatRate * dt;
  }

  _comeOut(h) {
    h.out = true;
    this.stats.cameOut++;
    const kid = this.chance(D.CUSTOMER.kidChance);

    // The one nobody has. It is never fillable, and that is the joke.
    const impossible = this.chance(0.055);
    const want = this.pick(D.MENU).key;
    const said = impossible
      ? this.pick(D.IMPOSSIBLE_ORDERS)
      : this.pick((kid ? D.KID_ORDERS : D.ADULT_ORDERS)[want]);
    if (impossible) this.stats.impossible++;

    const price = D.MENU_BY_KEY[want].price;
    // Some of them arrive short. The kid who is forty cents short is the moral engine.
    const short = kid && this.chance(0.16);
    const tender = short ? Math.max(25, price - this.ri(1, 3) * 25) : this.pick(D.TENDERS);

    const p = {
      id: ++this._pid, houseId: h.id, block: h.block, kid,
      x: h.door.x, z: h.door.z, state: 'walk', t: 0,
      kx: h.kx, kz: h.kz,          // where they stand
      lx: h.lx, lz: h.lz,          // where a truck stops for them

      want: impossible ? null : want, said, tender,
      stage: 'ask',
    };
    this.people.push(p);
    this.cb.cameOut && this.cb.cameOut(p, h);
  }

  _people(dt) {
    const C = D.CUSTOMER, tr = this.truck;
    const wp = this.windowPos();
    const canServe = tr.parked && this.windowOpen;

    for (const p of this.people) {
      p.t += dt;
      const spd = p.kid ? C.runSpeed : C.walkSpeed;

      if (p.state === 'walk') {
        if (this._moveTo(p, p.kx, p.kz, spd, dt)) { p.state = 'kerb'; p.t = 0; }

      } else if (p.state === 'kerb') {
        // ⚠️ NOBODY LOITERS IN FRONT OF A TRUCK. A kid CROSSING your bumper blocks the
        // mirror for a second or two — that is the ritual, and it must stay. But a person
        // standing still there is a DEADLOCK: kerb points sit inside the blind zone, the
        // queue caps at maxQueue so the overflow waits at their kerbs, and the truck can
        // then never pull away again for the rest of the day. Anyone waiting steps aside.
        if (tr.parked) {
          const l = this.local(p.x, p.z);
          const T = D.TRUCK, nose = T.len * 0.5;
          if (l.fwd > nose - 0.4 && l.fwd < nose + T.mirrorAhead && Math.abs(l.lat) < T.mirrorHalfW + 0.6) {
            const r = this.right(), s = l.lat >= 0 ? 1 : -1, step = C.walkSpeed * dt;
            p.x += r.x * s * step; p.z += r.z * s * step;
          }
        }
        // Will they walk to the window? Only if you're parked, open, and close enough.
        const d = Math.hypot(wp.x - p.x, wp.z - p.z);
        if (canServe && d < C.willWalk && this.queueLen() < C.maxQueue) {
          p.state = 'toWindow';
        } else if (p.t > C.patience * 1.6) {
          p.state = 'leaving'; this.stats.walkedOff++;
          this.cb.leave && this.cb.leave(p, 'waited');
        }

      } else if (p.state === 'toWindow') {
        if (!canServe) { p.state = 'kerb'; continue; }
        if (this._moveTo(p, wp.x, wp.z, spd, dt, C.reachWindow)) { p.state = 'window'; p.t = 0; }

      } else if (p.state === 'window') {
        if (!canServe) { p.state = 'kerb'; if (this.serving === p) this.serving = null; continue; }
        if (!this.serving) { this.serving = p; p.t = 0; this.cb.atWindow && this.cb.atWindow(p); }
        if (p.t > C.patience) {
          if (this.serving === p) this.serving = null;
          p.state = 'leaving'; this.stats.walkedOff++;
          this.cb.leave && this.cb.leave(p, 'patience');
        }

      } else if (p.state === 'leaving') {
        const h = this.houses.find(hh => hh.id === p.houseId);
        if (!h || this._moveTo(p, h.door.x, h.door.z, spd, dt)) p.state = 'gone';
      }
    }

    // retire the gone, and let their house come out again later
    if (this.people.some(p => p.state === 'gone')) {
      for (const p of this.people) {
        if (p.state !== 'gone') continue;
        const h = this.houses.find(hh => hh.id === p.houseId);
        if (h) { h.out = false; h.heard = 0; h.cool = 95; }
      }
      this.people = this.people.filter(p => p.state !== 'gone');
    }
  }

  _moveTo(p, tx, tz, spd, dt, reach = 0.55) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d <= reach) return true;
    const s = Math.min(d, spd * dt);
    p.x += dx / d * s; p.z += dz / d * s;
    p.face = Math.atan2(dx, dz);
    return false;
  }

  queueLen() { return this.people.filter(p => p.state === 'window' || p.state === 'toWindow').length; }

  // ---- the clock, which is the cold ---------------------------------------
  _clock(dt) {
    this.t += dt;
    this.hour = D.DAY.startHour + this.t / D.DAY.secondsPerHour;
    const heat = D.heatAt(this.hour);
    this.cold -= D.coldDrain({
      windowOpen: this.windowOpen,
      moving: Math.abs(this.truck.v) > 0.5,
      heat,
    }) * dt;

    if (this.cold <= 0) { this.cold = 0; this._endDay('cold'); }
    else if (this.hour >= D.DAY.duskHour) this._endDay('dusk');
  }

  soft() { return this.cold < D.COLD.softAt; }

  /**
   * The price a customer will actually be asked, right now.
   * ⚠️ ONE function. The sale reads it and the tag on the clipboard reads it, so the
   * number on screen can never be a second model of the number being charged. MY BREW
   * shipped an inverted progression curve precisely because those were two code paths.
   */
  priceOf(key) {
    const base = this.prices[key] ?? D.MENU_BY_KEY[key].price;
    return this.soft() ? Math.round(base * D.COLD.softPenalty) : base;
  }

  // ---- actions — ONE dispatch, shared by the UI and the soak bot -----------
  act(name, arg) {
    if (this.over && name !== 'none') return { ok: false, msg: 'the day is over' };
    const fn = this[`_act_${name}`];
    if (!fn) return { ok: false, msg: `no such action: ${name}` };
    return fn.call(this, arg);
  }

  _act_song(on) {
    this.song = !!on;
    this.cb.song && this.cb.song(this.song);
    return { ok: true };
  }

  _act_park() {
    const tr = this.truck;
    if (tr.parked) return { ok: false, msg: 'already parked' };
    if (Math.abs(tr.v) > 0.6) return { ok: false, msg: 'still rolling' };
    tr.v = 0; tr.parked = true;

    const bid = HP.blockAt(tr.x, tr.z);
    // ⚠️ The ordinance layer (bible §8): cannot occupy the same location twice within
    // 24 h, cannot stop within 500 ft of a location you recently vacated. Phase 0
    // RECORDS this and exposes `legal`; the code-enforcement car is Phase 1.
    const burned = this.spots.find(s => Math.hypot(s.x - tr.x, s.z - tr.z) < D.LAW.vacatedRadius);
    this.stop = {
      x: tr.x, z: tr.z, block: bid, at: this.t,
      legal: !burned, burnedBy: burned ? burned.block : null,
    };
    this.cb.park && this.cb.park(this.stop);
    return { ok: true, stop: this.stop };
  }

  _act_depart() {
    const tr = this.truck;
    if (!tr.parked) return { ok: false, msg: 'not parked' };
    // ⚠️ THE MIRROR. A one-second ritual that becomes muscle memory. Nothing bad ever
    // happens — the truck simply will not move.
    const kid = this.mirrorBlocker();
    if (kid) { this.cb.mirror && this.cb.mirror(kid); return { ok: false, msg: 'check your mirror', blocker: kid }; }

    if (this.windowOpen) this._act_window(false);
    if (this.stop) this.spots.push({ ...this.stop });
    this.stop = null;
    tr.parked = false;
    this.cb.depart && this.cb.depart();
    return { ok: true };
  }

  _act_window(on) {
    if (on && !this.truck.parked) return { ok: false, msg: 'park first' };
    this.windowOpen = !!on;
    if (!this.windowOpen && this.serving) { this.serving.state = 'kerb'; this.serving = null; }
    this.cb.window && this.cb.window(this.windowOpen);
    return { ok: true };
  }

  /** Serve the person at the window the given item. Reading their order is the skill. */
  _act_serve(key) {
    const p = this.serving;
    if (!p) return { ok: false, msg: 'nobody at the window' };
    if (p.stage !== 'ask') return { ok: false, msg: 'they are waiting on their change' };
    const item = D.MENU_BY_KEY[key];
    if (!item) return { ok: false, msg: 'no such item' };
    if ((this.stock[key] || 0) <= 0) return { ok: false, msg: 'out of that' };

    if (p.want === null) {
      // the impossible order. You do not have the taco one. Nobody does.
      return { ok: false, msg: 'you do not have that. nobody does.', impossible: true };
    }

    if (key !== p.want) {
      p.wrongs = (p.wrongs || 0) + 1;
      this.stats.wrong++;
      this.cb.wrong && this.cb.wrong(p, key);
      if (p.wrongs < 2) return { ok: false, msg: 'no — the OTHER one', wrong: true };
      // second time, they just take it. Kids do.
    }

    // ⚠️ ONE formula. This is the same call the face at the window is drawn from —
    // the readout and the behaviour cannot drift.
    const ceiling = this.blocks[p.block].ceiling;
    const price = this.priceOf(key);

    if (!D.willBuy(ceiling, price)) {
      this.stats.balked++;
      p.state = 'leaving'; this.serving = null;
      this.cb.balk && this.cb.balk(p, price);
      return { ok: false, msg: 'too dear for this street', balked: true };
    }

    this.stock[key]--;
    this.cold = Math.max(0, this.cold - item.cold * D.COLD.perSaleUnit);
    p.gave = key; p.price = price;

    if (p.tender < price) {
      // the kid who is short. The moral engine, and it is load-bearing.
      p.stage = 'short';
      this.cb.short && this.cb.short(p, price - p.tender);
      return { ok: true, short: price - p.tender, price };
    }
    p.stage = 'pay';
    return { ok: true, price, tender: p.tender, due: D.changeDue(p.tender, price) };
  }

  /** Hand back `cents`. Correct is the default; shorting them is a deliberate act. */
  _act_change(cents) {
    const p = this.serving;
    if (!p || p.stage !== 'pay') return { ok: false, msg: 'nobody owed change' };
    const due = D.changeDue(p.tender, p.price);
    const give = Math.max(0, Math.round(cents));
    const item = D.MENU_BY_KEY[p.gave];

    this.drawer += p.tender - give;
    let note = 'right';

    if (give < due) {
      // ⚠️ Kyle's call 2026-08-11: IN, as a deliberate act. It can never be a misclick —
      // the UI hands back correct by default and shorting is a separate button.
      note = 'short';
      this.stats.shorted++;
      if (this.chance(D.ECON.shortNoticeChance)) {
        this.stats.shortCaught++;
        this.rep -= D.ECON.shortRepLoss;
        const h = this.houses.find(hh => hh.id === p.houseId);
        if (h) h.cool = 400;                       // that household stops coming out
        this.cb.caught && this.cb.caught(p, due - give);
      }
    } else if (give > due) {
      note = 'over';
    } else {
      this.rep += item.rep * (p.kid ? 1.25 : 1.0);  // serving kids builds reputation
    }

    this._finish(p, note);
    return { ok: true, note, due, gave: give };
  }

  /** Eat the difference. Small loss, reputation gain, and they remember it all summer. */
  _act_mercy() {
    const p = this.serving;
    if (!p || p.stage !== 'short') return { ok: false, msg: 'nobody is short' };
    this.drawer += p.tender;
    this.rep += D.ECON.mercyRepGain;
    this.stats.mercy++;
    this.cb.mercy && this.cb.mercy(p);
    this._finish(p, 'mercy');
    return { ok: true, ate: p.price - p.tender };
  }

  /** Cash preserved, reputation lost, and that household stops coming out. */
  _act_refuse() {
    const p = this.serving;
    if (!p || p.stage !== 'short') return { ok: false, msg: 'nobody is short' };
    this.stock[p.gave]++;                          // it goes back in the box
    this.rep -= D.ECON.refuseRepLoss;
    this.stats.refused++;
    const h = this.houses.find(hh => hh.id === p.houseId);
    if (h) h.cool = 400;
    this._finish(p, 'refused');
    return { ok: true };
  }

  _finish(p, note) {
    this.stats.served++;
    p.state = 'leaving'; p.stage = 'done'; p.note = note;
    this.serving = null;
    this.cb.served && this.cb.served(p, note);
  }

  /** Set what you're charging. Price discovery by face is the loop this feeds. */
  _act_price(arg) {
    const { key, cents } = arg || {};
    if (!D.MENU_BY_KEY[key]) return { ok: false, msg: 'no such item' };
    this.prices[key] = Math.max(25, Math.round(cents / 25) * 25);   // to the nearest quarter
    return { ok: true, price: this.prices[key] };
  }

  _act_endDay() { this._endDay('called it'); return { ok: true }; }

  _endDay(why) {
    if (this.over) return;
    this.over = true;
    this.ending = why;
    this.cash += this.drawer;

    // THE NOTE. Fixed, due whether or not it rained on Saturday. A bank, not a loan
    // shark. Soft fail with repo teeth — never a game-over card.
    this.noteDue = (this.day % D.ECON.noteEveryDays === 0);
    this.notePaid = false;
    if (this.noteDue) {
      if (this.cash >= D.ECON.noteAmount) { this.cash -= D.ECON.noteAmount; this.notePaid = true; }
      else this.noteMisses++;
    }
    this.cb.dayEnd && this.cb.dayEnd(this.summary());
  }

  summary() {
    return {
      day: this.day, why: this.ending,
      took: this.drawer, cash: this.cash, rep: Math.round(this.rep * 10) / 10,
      coldLeft: Math.round(this.cold * 1000) / 1000,
      served: this.stats.served, cameOut: this.stats.cameOut,
      walkedOff: this.stats.walkedOff, wrong: this.stats.wrong,
      mercy: this.stats.mercy, shorted: this.stats.shorted,
      noiseHeat: Math.round(this.noiseHeat * 100) / 100,
      hour: Math.round(this.hour * 10) / 10,
      noteDue: this.noteDue, notePaid: this.notePaid, noteMisses: this.noteMisses,
      annoy: Object.fromEntries(Object.values(this.blocks).map(b => [b.id, Math.round(b.annoy * 100) / 100])),
    };
  }

  // ---- save / determinism -------------------------------------------------
  snapshot() {
    return {
      v: D.VERSION, seed: this.seed, rs: this._rs, day: this.day, t: this.t,
      truck: { ...this.truck }, cold: this.cold, cash: this.cash, drawer: this.drawer,
      rep: this.rep, noiseHeat: this.noiseHeat, tickets: this.tickets,
      noteMisses: this.noteMisses, song: this.song, windowOpen: this.windowOpen,
      stock: { ...this.stock }, prices: { ...this.prices }, pid: this._pid,
      blocks: Object.fromEntries(Object.entries(this.blocks).map(([k, b]) => [k, b.annoy])),
      houses: this.houses.map(h => [h.heard, h.out ? 1 : 0, h.cool]),
      // copies, never the live arrays — an aliased snapshot restored in place iterates
      // an array it is growing (FRESH CUT hung on exactly this)
      people: this.people.map(p => ({ ...p })),
      servingId: this.serving ? this.serving.id : null,
      spots: this.spots.map(s => ({ ...s })),
      stop: this.stop ? { ...this.stop } : null,
      stats: { ...this.stats },
    };
  }

  restore(s) {
    this._rs = s.rs >>> 0; this.day = s.day; this.t = s.t;
    this.truck = { ...s.truck }; this.cold = s.cold; this.cash = s.cash;
    this.drawer = s.drawer; this.rep = s.rep; this.noiseHeat = s.noiseHeat;
    this.tickets = s.tickets; this.noteMisses = s.noteMisses;
    this.song = s.song; this.windowOpen = s.windowOpen;
    this.stock = { ...s.stock }; this._pid = s.pid;
    if (s.prices) this.prices = { ...s.prices };
    for (const [k, a] of Object.entries(s.blocks)) if (this.blocks[k]) this.blocks[k].annoy = a;
    s.houses.forEach((h, i) => {
      if (!this.houses[i]) return;
      this.houses[i].heard = h[0]; this.houses[i].out = !!h[1]; this.houses[i].cool = h[2];
    });
    this.people = s.people.map(p => ({ ...p }));
    this.serving = s.servingId ? this.people.find(p => p.id === s.servingId) || null : null;
    this.spots = s.spots.map(x => ({ ...x }));
    this.stop = s.stop ? { ...s.stop } : null;
    this.stats = { ...s.stats };
    this.hour = D.DAY.startHour + this.t / D.DAY.secondsPerHour;
    return this;
  }

  /** A cheap fingerprint of everything that matters. Same seed + same inputs => same hash. */
  stateHash() {
    const t = this.truck;
    const r = (n) => Math.round(n * 1000) / 1000;
    return [
      this.frame, r(t.x), r(t.z), r(t.yaw), r(t.v), r(this.cold), this.drawer, this.cash,
      r(this.rep), r(this.noiseHeat), this.people.length, this.stats.served,
      this.stats.cameOut, this._rs,
    ].join('|');
  }
}

// ---------------------------------------------------------------------------
// THE POLICY BOT — one bot for the Node soak AND the in-page __hct.soak().
// It plays the REAL Game through the REAL act() dispatch. Not random input: a scripted
// driver with a personality rolled off the seed, so the seed also picks a playstyle.
// ---------------------------------------------------------------------------
export function soakRun(seed, opts = {}) {
  const g = new Game({ seed, ...opts });

  // ⚠️ THE BOT GETS ITS OWN RNG STREAM, deliberately separate from g.rng().
  // The bot is not the sim. If its coin flips came off the sim's stream, then changing
  // the bot's POLICY would change which customers came out and what they wanted — and a
  // controlled trial that moves its own confounders measures nothing.
  // ⚠️ Pre-hash the seed exactly like the sim's LCG does. Without it, seeds 1..10 all
  // produced a near-identical FIRST draw — and since the first draw picked the bot's
  // personality, ten consecutive seeds played the same way and all took $0.00.
  let _bs = ((seed >>> 0) * 747796405 + 2891336453) >>> 0;
  _bs = (Math.imul(_bs ^ (_bs >>> 15), 2246822519)) >>> 0;
  const brng = () => { _bs = (_bs * 1664525 + 1013904223) >>> 0; return _bs / 4294967296; };
  const bpick = (a) => a[Math.floor(brng() * a.length)];

  // Personality, off the bot's stream. A policy pins any of it for a trial cell.
  // ⚠️ `songLove` is EAGERNESS TO STOP, not whether to play at all. It used to gate the
  // song itself, which meant a quarter of all seeds drove around in silence taking $0 —
  // measuring a game nobody would ever play. The song is the game; it stays on.
  const P = opts.policy || {};
  const songLove = P.songLove !== undefined ? P.songLove : brng();
  const greed = P.greed !== undefined ? P.greed : brng();
  const patience = P.patience !== undefined ? P.patience : 0.4 + brng() * 0.5;
  const alwaysRight = !!P.alwaysRight;      // pin out order-reading skill
  // How many seconds of song a policy allows itself AFTER parking. 0 = obeys the law.
  const songGrace = P.songGrace !== undefined ? P.songGrace : 0;
  const errors = [];

  const act = (n, a) => {
    try { return g.act(n, a); }
    catch (e) { errors.push(`${n}: ${e.message}\n${e.stack}`); g.over = true; return { ok: false }; }
  };

  // The route: drive the loop, and divert to anybody standing at a kerb.
  // The waypoints are the map's own ROUTE — the same one Cy's route sheet is built on.
  let target = 0;
  const WP = HP.ROUTE;

  const divertR = 26 + songLove * 22;      // how far off the route they'll chase a sale
  let guard = 0, lastT = -1, stopT = 0, stuckT = 0, sinceStop = 999, commit = null;
  // What the BOT did, as opposed to what the sim did. Kept in the return because "the
  // truck barely moved" is invisible in sim stats and cost several rounds to find.
  const bot = { parks: 0, departs: 0, mirrorHeld: 0, stuckFrames: 0, parkedFrames: 0, laps: 0 };
  act('song', true);

  while (!g.over && guard++ < 60000) {
    const tr = g.truck;
    // ⚠️ A DISTANCE cooldown after each stop, not a time one. The song keeps pulling
    // people out AROUND the truck, so there is always a fresh customer within range the
    // moment a timer expires — the bot chain-diverts, works one cluster all afternoon and
    // covers half a lap in a day. Making it drive a real distance first is what turns it
    // back into a route driver.
    if (!tr.parked) sinceStop += Math.abs(tr.v) * FIXED;

    // --- pick a goal: a customer AHEAD on the route, else the next waypoint ---
    // ⚠️ Three things here are load-bearing, and each one was a bug first:
    //  1. AHEAD (fwd > 3) — divert to whoever is NEAREST and, because the song spawns
    //     customers around the truck, there is always somebody nearer than the next
    //     corner. The bot shuffles between two houses and drives 57 m in a whole day.
    //     Every other number looked healthy and the battery reported GREEN.
    //  2. COMMIT — but "ahead" alone drops the customer the instant you close to within
    //     3 m of them, so the goal flips back to the waypoint and the bot accelerates
    //     past every single person. Nothing sold, all day, every seed.
    //  3. The post-departure cooldown, so you actually leave the spot you just worked.
    // A real route driver never turns back for one kid. That IS the route.
    let goal = null;
    if (commit) {
      const p = g.people.find(q => q.id === commit && q.state === 'kerb');
      if (p) goal = { x: p.lx, z: p.lz, cust: true, d: Math.hypot(p.lx - tr.x, p.lz - tr.z) };
      else commit = null;
    }
    if (!goal && sinceStop > 55 && !tr.parked) {
      let bd = Infinity, pick = null;
      for (const p of g.people) {
        if (p.state !== 'kerb') continue;
        if (g.local(p.lx, p.lz).fwd < 3) continue;      // behind us. Keep going.
        const d = Math.hypot(p.lx - tr.x, p.lz - tr.z);
        if (d < divertR && d < bd) { bd = d; pick = p; }
      }
      if (pick) { commit = pick.id; goal = { x: pick.lx, z: pick.lz, cust: true, d: bd }; }
    }
    if (!goal) {
      const w = WP[target % WP.length];
      const d = Math.hypot(w.x - tr.x, w.z - tr.z);
      if (d < 10) { target++; }
      goal = { x: w.x, z: w.z, cust: false, d };
    }

    // steer toward it: the signed angle between heading and bearing
    const bearing = Math.atan2(goal.x - tr.x, goal.z - tr.z);
    let err = bearing - tr.yaw;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;

    // ⚠️ A SPEED CONTROLLER, not a throttle multiplier. Scaling throttle down for corners
    // and approaches drove it below what rolling resistance demands (0.45 m/s^2 needs
    // throttle >= 0.14) and the truck simply stalled in the street, at v=0.00, for the
    // rest of the day — with every other stat looking plausible. Ask for a SPEED.
    // ⚠️ Distance-PROPORTIONAL, not banded. Bands deadlock: the truck brakes to a halt at
    // the edge of the "stop" band, lands just outside the park threshold, and sits there
    // at v=0.00 for the rest of the day with want stuck at 0. It must creep the last few
    // metres, so the target speed has to go smoothly to zero AT the goal, not before it.
    let want = goal.cust ? clamp(goal.d * 0.4 - 0.6, 0, 6.5) : 9.0;
    want *= Math.max(0.28, 1 - Math.abs(err) / 1.15);   // and slow for the corner
    const input = { throttle: 0, brake: 0, steer: clamp(err * 1.9, -1, 1) };
    if (tr.v < want - 0.15) input.throttle = 0.95;
    else if (tr.v > want + 0.15) input.brake = clamp((tr.v - want) * 0.6, 0.15, 1);

    if (tr.parked) {
      input.throttle = 0; input.brake = 0;
      stopT += FIXED;
      if (!g.windowOpen) act('window', true);
      // The law says silence the instant you're stationary — but every stop is a gamble:
      // a few more seconds of song pulls another kid off the next block. songGrace is
      // exactly how many seconds of that bribe this policy takes.
      if (g.song && stopT >= songGrace) act('song', false);
      const p = g.serving;
      if (p) {
        if (p.stage === 'ask') {
          // sometimes hand over the wrong thing — the order was in kid
          const key = (p.want && (alwaysRight || brng() > 0.22)) ? p.want : bpick(D.MENU).key;
          const r = act('serve', key);
          if (!r.ok && (r.impossible || r.balked)) { p.state = 'leaving'; g.serving = null; }
        } else if (p.stage === 'pay') {
          const due = D.changeDue(p.tender, p.price);
          act('change', greed > 0.8 && brng() > 0.6 ? Math.max(0, due - 25) : due);
        } else if (p.stage === 'short') {
          act(brng() < 0.62 ? 'mercy' : 'refuse');
        }
      } else if (stopT > 18 + patience * 40 || (g.queueLen() === 0 && stopT > 12)) {
        act('window', false);
        if (act('depart').ok) { act('song', true); stopT = 0; sinceStop = 0; commit = null; bot.departs++; }
        else bot.mirrorHeld++;
        // else: the mirror is holding it. Wait for them to move. Nothing bad happens.
      }
    } else {
      if (goal.cust && goal.d < 5 && Math.abs(tr.v) < 0.6) { act('park'); stopT = 0; commit = null; bot.parks++; }
      // stuck against a hedge? back out and try the next leg.
      if (Math.abs(tr.v) < 0.4) { stuckT += FIXED; bot.stuckFrames++; } else stuckT = 0;
      if (stuckT > 1.6) { input.throttle = -1; input.brake = 0; input.steer = -input.steer; }
      if (stuckT > 4.0) { stuckT = 0; target++; }
    }

    if (tr.parked) bot.parkedFrames++;
    bot.laps = target;
    g.step(FIXED, input);

    // invariants, checked every single loop
    if (g.t <= lastT) errors.push(`clock stalled at t=${g.t}`);
    lastT = g.t;
    if (Number.isNaN(g.truck.x) || Number.isNaN(g.truck.v) || Number.isNaN(g.cold))
      { errors.push(`NaN leak: x=${g.truck.x} v=${g.truck.v} cold=${g.cold}`); break; }
    if (g.cold < 0 || g.cold > 1.0001) errors.push(`cold out of bounds: ${g.cold}`);
    if (g.drawer < 0) errors.push(`negative drawer: ${g.drawer}`);
  }

  if (!g.over) errors.push(`day never ended (guard=${guard})`);
  return { seed, ...g.summary(), stats: g.stats, bot, hash: g.stateHash(), errors, frames: g.frame };
}
