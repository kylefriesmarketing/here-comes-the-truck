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

    // THE DAY'S WEATHER — salted hash of (seed, day), NOT this.rng: the radio reads it at
    // boot, before the sim has drawn anything, and it must not advance the stream.
    // `opts.weather` pins it for trial cells.
    if (opts.weather) this.weather = D.WEATHER.find(w => w.key === opts.weather) || D.WEATHER[1];
    else {
      const r = this._h(this.seed, this.day, 'wx');
      let acc = 0, pickIx = 1;
      for (let i = 0; i < D.WEATHER.length; i++) { acc += D.WEATHER_ODDS[i]; if (r < acc) { pickIx = i; break; } }
      this.weather = D.WEATHER[pickIx];
    }
    this.over = false;
    this.ending = null;
    this.frame = 0;

    this.truck = {
      x: HP.SPAWN.x, z: HP.SPAWN.z, yaw: HP.SPAWN.yaw,
      v: 0, steer: 0, parked: false,
    };

    // ⚠️ THE CREW RIDE IN TRUCK-LOCAL SPACE. x/z are inside the truck, not in the world,
    // so when the truck moves they move with it for free — no re-parenting, no drift, and
    // no chance of the player being left standing in the road at 9 m/s. `seated` means
    // they are at the wheel; standing means they are working the back.
    this.crew = { x: D.STATIONS[0].x, z: D.CREW.seatZ, yaw: 0, seated: true, hands: null };

    this.cold = D.COLD.full;
    this.cash = opts.cash ?? D.ECON.startCash;
    this.drawer = 0;
    this.rep = opts.rep || 0;             // STANDING. Never decays. (Victory Lap's two-track model.)
    this.noiseHeat = opts.noiseHeat || 0; // HEAT. Decays overnight.
    this.tickets = opts.tickets || 0;
    this.noteMisses = opts.noteMisses || 0;

    // what you own, and the single bag of modifiers it produces
    this.owned = { ...(opts.owned || {}) };
    this.mod = D.mods(this.owned);

    // the soft-serve machine's grime — carried day to day; cleaning is a chore you plan
    this.grime = opts.grime || 0;
    this.cleaning = null;

    this.stock = {};
    this.prices = {};
    // ⚠️ 11, not 20. At 20 of every line you could never run out, so the deep chest was
    // dead money and "we're out of that" never happened to anybody.
    for (const m of D.MENU) { this.stock[m.key] = 11 + this.mod.stockAdd; this.prices[m.key] = m.price; }
    if (opts.prices) Object.assign(this.prices, opts.prices);

    // THE CHURN BAY. What you have invented, what you have discovered, and what is
    // currently going round in the machine in the back.
    this.invented = (opts.invented || []).map(f => ({ ...f }));
    this.discovered = { ...(opts.discovered || {}) };
    this.churning = null;
    for (const f of this.invented) { this.stock[f.key] = 0; this.prices[f.key] = f.price; }

    // Who has met you, and who has already said their one mid-summer line.
    this.met = { ...(opts.met || {}) };
    this.saidMid = { ...(opts.saidMid || {}) };
    this.metToday = [];

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
      bumps: 0, songSec: 0, driven: 0, churned: 0, legendaries: 0, inventedSold: 0,
      cleaned: 0, tastedOff: 0,
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
    const o = D.TRUCK.wide / 2 + 1.1;    // far enough out that the head of the queue is
    return { x: t.x + r.x * o, z: t.z + r.z * o };   // leaning at your window, not in your face
  }

  /** Where the i-th person in the queue stands: a line back along the truck's flank. */
  queueSlot(i) {
    const wp = this.windowPos(), f = this.fwd(), gap = D.CUSTOMER.queueGap * i;
    return { x: wp.x - f.x * gap, z: wp.z - f.z * gap };
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
  // ---- the crew, in truck-local space ---------------------------------------
  /** Where a truck-local point is in the world right now. */
  toWorld(lx, lz) {
    const t = this.truck, s = Math.sin(t.yaw), c = Math.cos(t.yaw);
    // local +z is forward (s,c); local +x is the truck's LEFT, which is (c,-s)
    return { x: t.x + lz * s + lx * c, z: t.z + lz * c - lx * s };
  }
  /** The crew's world position and facing. The camera hangs off this. */
  crewWorld() {
    const p = this.toWorld(this.crew.x, this.crew.z);
    return { x: p.x, z: p.z, yaw: this.truck.yaw + this.crew.yaw };
  }

  /**
   * The station you could use from where you're standing — or null.
   *
   * ⚠️ DIRECTIONAL, not just nearest. The aisle is 1.44 m wide and the stations line both
   * walls, so at any point in the truck three or four of them are inside `reach` at once.
   * Picking the nearest meant reaching for the freezer and sitting down in the driver's
   * seat instead. You must be FACING a station to use it, which is both how first-person
   * interaction actually works and what makes the layout learnable.
   */
  stationNear() {
    if (this.crew.seated) return D.STATION_BY_ID.seat;
    const cr = this.crew, fs = Math.sin(cr.yaw), fc = Math.cos(cr.yaw);
    let best = null, bestScore = -Infinity;
    for (const s of D.STATIONS) {
      const dx = s.x - cr.x, dz = s.z - cr.z;
      const d = Math.hypot(dx, dz);
      // ⚠️ per-station overrides: the window is forgiving, the bins are not
      if (d > (s.reach ?? D.CREW.reach)) continue;
      const facing = d < 0.05 ? 1 : (dx * fs + dz * fc) / d;   // cos of the angle to it
      // ⚠️ HANDING OVER IGNORES FACING ENTIRELY. With something in your hands and
      // somebody at the window, you can pass it across without turning to look — which is
      // what a person does. Gating on facing failed from 9 of 20 sane spots along the
      // counter (a facing `continue` happens BEFORE any score bonus can rescue it), and
      // that fumble is pure friction: handing it over is the payoff, not the skill.
      const handing = s.kind === 'window' && cr.hands && this.serving;
      if (!handing && facing < (s.facing ?? D.CREW.facing)) continue;   // it's behind you
      let score = facing - d * 0.35;
      if (handing) score += 3;                                  // and it beats the bin beside you
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  _walk(dt, input) {
    const C = D.CREW, cr = this.crew;
    if (cr.seated) return;
    const fw = (input.walkF || 0), st = (input.walkS || 0);
    if (!fw && !st) return;
    // Move relative to where the crew is LOOKING, inside the truck's own frame.
    // ⚠️ Same convention as everything else: forward = (sin, cos); the crew's RIGHT is
    // (-cos, sin), so a positive strafe must subtract cos from x.
    //
    // ⚠️ serveMul is WIRED HERE. Since the interior became a place, "serving faster" IS
    // walking the aisle faster — the wide hatch clears the deck between window and bins.
    // The knob sat defined-but-read-by-nothing for a whole milestone (Victory Lap trap
    // 11: if a constant is referenced only from mods(), that's the smell) and the trial
    // was pricing an upgrade that did nothing.
    const spd = C.walkSpeed / (this.mod.serveMul || 1);
    const s = Math.sin(cr.yaw), c = Math.cos(cr.yaw);
    const dx = (fw * s - st * c) * spd * dt;
    const dz = (fw * c + st * s) * spd * dt;
    cr.x = Math.max(C.aisle.x0, Math.min(C.aisle.x1, cr.x + dx));
    cr.z = Math.max(C.aisle.z0, Math.min(C.aisle.z1, cr.z + dz));
  }

  /** One fixed sim step. `input` = { throttle -1..1, brake 0..1, steer -1..1 }. */
  step(dt, input) {
    if (this.over) return;
    this.frame++;
    const i = input || {};
    this._walk(dt, i);
    this._drive(dt, i);
    this._songTick(dt);
    this._people(dt);
    this._clock(dt);
  }

  _drive(dt, input) {
    const T = D.TRUCK, tr = this.truck;
    // ⚠️ You cannot drive from the back of your own truck. If nobody is in the seat the
    // controls are dead — which is what makes sitting down a real, deliberate verb.
    if (!this.crew.seated) { input = { steer: 0, throttle: 0, brake: 1 }; }

    // The wheel turns toward your input at a real rate — it does not teleport.
    // ⚠️⚠️ THE MINUS SIGN IS THE WHOLE THING. `D` / steer = +1 must turn RIGHT, and right
    // is (-cos yaw, sin yaw), which is reached by DECREASING yaw. Without this negation
    // the truck steers backwards — it drove that way for a whole build and it is the same
    // family of bug as FRESH CUT's A/D inversion, which also survived a full version.
    // Verify by hand, never by feel: from yaw 0 the truck faces +z; press D and x must go
    // NEGATIVE.
    const want = -clamp(input.steer || 0, -1, 1) * T.maxSteer;
    const rate = Math.abs(want) > Math.abs(tr.steer) ? T.steerRate : T.steerReturn;
    tr.steer += clamp(want - tr.steer, -rate * dt, rate * dt);

    if (tr.parked) { tr.v = 0; return; }

    const th = clamp(input.throttle || 0, -1, 1);
    const top = this.topSpeed();
    if (th > 0) {
      // accel tails off as you approach top speed, so it never snaps to the cap
      const f = clamp(1 - Math.max(0, (tr.v / top - T.accelFalloff)) / (1 - T.accelFalloff), 0.08, 1);
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
      if (this.song) g = D.hearAt(Math.hypot(h.x - tr.x, h.z - tr.z), this.songRadius());
      // the weather decides how readily the street answers the song (§6: a scorcher
      // keeps everyone indoors — outMul 0.62 — while a hot day is the best pull)
      if (g > 0) h.heard += D.JINGLE.heardRate * this.weather.outMul * g * dt;
      else if (h.heard > 0) h.heard = Math.max(0, h.heard - D.JINGLE.heardDecay * dt);

      const need = D.REGULAR_BY_HOUSE[h.id] ? D.JINGLE.heardOut * D.REGULAR.heardMul : D.JINGLE.heardOut;
      if (!h.out && h.cool <= 0 && h.heard >= need) {
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

    // ⚠️ A REGULAR LIVES AT A SPECIFIC HOUSE. If this is their door, it is them — not a
    // stranger. P3: THEY KNOW YOUR NAME. Four strings each, the FRESH CUT architecture.
    const reg = D.REGULAR_BY_HOUSE[h.id];
    const kid = reg ? reg.kid : this.chance(D.CUSTOMER.kidChance);

    // The one nobody has. It is never fillable, and that is the joke. Regulars are
    // exempt — they know exactly what they want and they have for years.
    const impossible = !reg && this.chance(0.055);
    // ⚠️ only ask for what is actually in the box — otherwise an invented flavour you
    // have run out of keeps getting requested and every one of those is a dead sale
    const have = this.menu().filter(m => (this.stock[m.key] || 0) > 0);
    const want = reg ? reg.wants : this._pickWant(kid, have.length ? have : D.MENU);
    const inv = !reg && this.invented.some(f => f.key === want);
    let said;
    if (impossible) { said = this.pick(D.IMPOSSIBLE_ORDERS); this.stats.impossible++; }
    else if (inv) said = this.pick(D.INVENTED_ORDERS[kid ? 'kid' : 'adult']);
    else if (reg) {
      // their one mid-summer line, once ever, on a later visit
      const useMid = this.met[reg.id] && !this.saidMid[reg.id] && this.chance(0.4);
      if (useMid) { said = reg.mid; this.saidMid[reg.id] = 1; }
      else said = reg.arrive;
    } else said = this.pick((kid ? D.KID_ORDERS : D.ADULT_ORDERS)[want]);

    // Some of them arrive short. The kid who is forty cents short is the moral engine,
    // and it is load-bearing — reputation gates the event bookings that are the only
    // genuinely profitable stream in the real trade.
    const price = this.priceOf(want) * (reg && reg.buysTwo ? 2 : 1);
    const short = reg ? !!reg.alwaysShort : (kid && this.chance(0.16));
    const exact = reg ? !!reg.exactAlways : this.chance(D.EXACT_CHANCE);
    const covers = D.TENDERS.filter(t => t >= price);
    const tender = short ? Math.max(25, price - (reg ? reg.alwaysShort : this.ri(1, 3) * 25))
      : exact ? price
        : (covers.length ? covers[Math.min(covers.length - 1, this.ri(0, 1))] : 2000);

    const p = {
      id: ++this._pid, houseId: h.id, block: h.block, kid,
      reg: reg ? reg.id : null, who: reg ? reg.who : null,
      qty: reg && reg.buysTwo ? 2 : 1,
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
    // ⚠️ A QUEUE SLOT IS ASSIGNED ON JOINING AND HELD. Deriving the position from a sort
    // of the current queue means every new arrival renumbers everybody, so all five chase
    // a slot that keeps moving and nobody ever reaches the front — the counter reads 5
    // and `serving` stays null forever.
    const inQueue = (p) => p.state === 'toWindow' || p.state === 'window';

    // ⚠️ SELF-HEAL THE LINE. Anything that removes the front of the queue WITHOUT going
    // through _finish (a patience timeout, the bot or a test kicking an impossible order,
    // any future path) orphans slot 0 — nobody behind ever advances, `serving` stays null,
    // and the whole line wedges until every last one of them times out. Measured: 3 asks
    // in 300 seconds, and the policy bot had been quietly wedging its own queue on every
    // balk in every trial to date. One line, covers every kick path forever.
    if (!this.serving && this.people.some(inQueue) && !this.people.some(p => inQueue(p) && (p.slot || 0) === 0)) this._requeue();

    for (const p of this.people) {
      p.t += dt;
      const spd = p.kid ? C.runSpeed : C.walkSpeed;
      const pat = C.patience * (p.reg ? D.REGULAR.patienceMul : 1);

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
        if (canServe && d < C.willWalk && this.queueLen() < this.maxQueue()) {
          p.state = 'toWindow';
          p.slot = this.people.filter(q => q !== p && inQueue(q)).length;   // join the back
        } else if (p.t > pat * 1.6) {
          p.state = 'leaving'; this.stats.walkedOff++;
          this.cb.leave && this.cb.leave(p, 'waited');
        }

      } else if (p.state === 'toWindow') {
        if (!canServe) { p.state = 'kerb'; this._requeue(); continue; }
        const s = this.queueSlot(p.slot || 0);
        if (this._moveTo(p, s.x, s.z, spd, dt, C.reachWindow)) { p.state = 'window'; p.t = 0; }

      } else if (p.state === 'window') {
        if (!canServe) { p.state = 'kerb'; if (this.serving === p) this.serving = null; this._requeue(); continue; }
        // the line shuffles forward as the person ahead is served
        const s = this.queueSlot(p.slot || 0);
        this._moveTo(p, s.x, s.z, spd * 0.7, dt, C.reachWindow);
        // only whoever is at the front of the line is actually at your window
        if (!this.serving && (p.slot || 0) === 0) { this.serving = p; p.t = 0; this.cb.atWindow && this.cb.atWindow(p); }
        // ⚠️ THE SECOND BEAT: after a moment at the window they stop mumbling and tell
        // you what it actually is. This is what makes "orders arrive in kid" a skill you
        // can learn rather than a guess you can only lose.
        if (this.serving === p && !p.tell && p.stage === 'ask' && p.t > C.clarifyAfter) {
          p.tell = this.tellFor(p);
          this.cb.clarify && this.cb.clarify(p);
        }
        if (p.t > pat) {
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

  /**
   * THE DEMAND SYSTEM (bible §10). What a customer asks for is drawn WEIGHTED by the
   * item's appeal to who they are — kids mostly want the low-margin depot bars, adults
   * mostly want the soft serve, which is the trade's demand/margin inversion made
   * mechanical. ⚠️ These `kid`/`adult` fields sat on every item for three milestones,
   * read by NOTHING — want-selection was uniform, so the whole "recipes are AIMED"
   * promise was decoration: a sugar-maxed invention drew exactly as many asks as plain
   * water ice. One weighted draw off this.rng (same one call `pick` made — the sim
   * stream's SHAPE is unchanged, its values shift, which re-baselines every trial).
   */
  _pickWant(kid, have) {
    const w = have.map(m => Math.max(0.05, kid ? (m.kid || 0) : (m.adult || 0)));
    let sum = 0;
    for (const x of w) sum += x;
    let r = this.rng() * sum;
    for (let i = 0; i < have.length; i++) { r -= w[i]; if (r <= 0) return have[i].key; }
    return have[have.length - 1].key;
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

  /** Close the gap after somebody leaves the line — everybody behind steps up one. */
  _requeue() {
    this.people
      .filter(p => p.state === 'toWindow' || p.state === 'window')
      .sort((a, b) => (a.slot || 0) - (b.slot || 0))
      .forEach((p, i) => { p.slot = i; });
  }

  // ---- the clock, which is the cold ---------------------------------------
  _clock(dt) {
    this.t += dt;
    this.hour = D.DAY.startHour + this.t / D.DAY.secondsPerHour;
    const heat = D.heatAt(this.hour);

    // the machine in the back runs off the same box you are selling out of
    if (this.churning) {
      this.churning.t += dt;
      this.cold = Math.max(0, this.cold - D.CHURN.coldCost * dt / D.CHURN.seconds);
      if (this.churning.t >= this.churning.dur) this._finishChurn();
    }
    if (this.cleaning) {
      this.cleaning.t += dt;
      if (this.cleaning.t >= this.cleaning.dur) {
        this.cleaning = null; this.grime = 0; this.stats.cleaned++;
        this.cb.cleaned && this.cb.cleaned();
      }
    }
    this.cold -= D.coldDrain({
      windowOpen: this.windowOpen,
      moving: Math.abs(this.truck.v) > 0.5,
      heat: heat * this.weather.heatMul,     // the scorcher eats the box (§6)
      coldMul: this.mod.coldMul,
    }) * dt;

    if (this.cold <= 0) { this.cold = 0; this._endDay('cold'); }
    else if (this.hour >= D.DAY.duskHour) this._endDay('dusk');
  }

  // ---- the menu, which is the stock list PLUS whatever you invented ---------
  /** Everything you can sell right now. The UI and the sim both iterate this. */
  menu() { return [...D.MENU, ...this.invented]; }
  itemOf(key) { return D.MENU_BY_KEY[key] || this.invented.find(f => f.key === key) || null; }

  soft() { return this.cold < D.COLD.softAt; }
  /** ⚠️ PER ITEM. A high-melt bar is still worth full price at a cold that finished the
   *  water ice an hour ago — that is what makes melt-resistance worth trading for. */
  softFor(key) {
    const it = this.itemOf(key);
    return this.cold < D.softBelow(it && it.melt !== undefined ? it.melt : 0.5);
  }

  // ---- what the upgrades actually change. ONE place each. -------------------
  songRadius() { return D.JINGLE.radius * this.mod.radiusMul; }
  maxQueue() { return D.CUSTOMER.maxQueue + this.mod.queueAdd; }
  topSpeed() { return D.TRUCK.topSpeed * this.mod.speedMul; }
  ceilingOf(block) { return this.blocks[block].ceiling + this.mod.ceilingAdd; }

  /**
   * The price a customer will actually be asked, right now.
   * ⚠️ ONE function. The sale reads it and the tag on the clipboard reads it, so the
   * number on screen can never be a second model of the number being charged. MY BREW
   * shipped an inverted progression curve precisely because those were two code paths.
   */
  priceOf(key) {
    const it = this.itemOf(key);
    const base = this.prices[key] ?? (it ? it.price : 100);
    return this.softFor(key) ? Math.round(base * D.COLD.softPenalty) : base;
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

  /**
   * ⚠️ ONE BUTTON. Overcooked runs its entire game on a movement stick and a single
   * interact key — the same button collects an ingredient, works a machine, plates the
   * dish and delivers it. What it does here depends only on WHERE YOU ARE STANDING, so
   * the skill is knowing your own truck rather than reading a menu.
   */
  _act_interact() {
    const st = this.stationNear();
    if (!st) return { ok: false, msg: 'nothing within reach' };
    const cr = this.crew;

    // ⚠️ THE SEAT IS WHERE PARKING AND PULLING AWAY LIVE. There is no park button: you
    // stop, you get out of the chair, and that IS parking. And sitting back down is
    // exactly where the mirror ritual belongs — you check it as you settle in to drive,
    // which is when a real driver checks it. One verb, in the place it actually happens.
    if (st.kind === 'seat') {
      if (cr.seated) {
        if (Math.abs(this.truck.v) > 0.6) return { ok: false, msg: 'stop the truck first' };
        if (!this.truck.parked) this._act_park();
        cr.seated = false; cr.z = D.CREW.aisle.z1 - 0.1; cr.yaw = Math.PI;
        this.cb.seat && this.cb.seat(false);
        return { ok: true, seated: false, parked: true };
      }
      if (this.cleaning) return { ok: false, msg: 'you are elbow-deep in the machine. finish the job.' };
      if (this.truck.parked) {
        const r = this._act_depart();          // the mirror can refuse this
        if (!r.ok) return r;
      }
      cr.seated = true; cr.x = st.x; cr.z = D.CREW.seatZ; cr.yaw = 0;
      this.cb.seat && this.cb.seat(true);
      return { ok: true, seated: true };
    }
    if (st.kind === 'clip') { this.cb.openClip && this.cb.openClip(); return { ok: true, open: 'clipboard' }; }
    if (st.kind === 'churn') { this.cb.openBay && this.cb.openBay(); return { ok: true, open: 'bay' }; }

    // --- picking something up. ONE PAIR OF HANDS. ---
    if (st.kind === 'take' || st.kind === 'takeNew') {
      // ⚠️ THE SPIGOT IS THE MACHINE. Window open: E pulls a cone. Window SHUT and
      // parked: E starts the clean — one button, disambiguated by the state of the
      // truck, exactly like the seat. And past `refusesAt` it will not pull at all:
      // that is the §10 gate with P4 teeth — a refusal you watched coming, not dice.
      if (st.id === 'spigot') {
        if (!this.windowOpen && this.truck.parked) return this._act_clean();
        if (this.grime >= D.SOFTSERVE.refusesAt)
          return { ok: false, msg: 'the machine whines and gives you nothing. it needs cleaning.' };
      }
      if (cr.hands) return { ok: false, msg: `your hands are full — ${this.labelOf(cr.hands)}` };
      let key = st.item;
      if (st.kind === 'takeNew') {
        const f = this.invented.find(x => (this.stock[x.key] || 0) > 0);
        if (!f) return { ok: false, msg: 'nothing in that tub yet' };
        key = f.key;
      }
      if ((this.stock[key] || 0) <= 0) return { ok: false, msg: "you're out of those" };
      cr.hands = key;
      this.cb.took && this.cb.took(key);
      return { ok: true, took: key, label: this.labelOf(key) };
    }

    // --- the window ---
    if (st.kind === 'window') {
      if (!this.windowOpen) return { ok: false, msg: 'the window is shut' };
      const p = this.serving;
      if (!p) return { ok: false, msg: 'nobody at the window' };
      if (p.stage === 'ask') {
        if (!cr.hands) return { ok: false, msg: 'you have nothing in your hands' };
        const r = this.act('serve', cr.hands);
        // it leaves your hands whether they liked it or not — you handed it over
        if (r.ok || r.wrong) cr.hands = null;
        return r;
      }
      if (p.stage === 'pay') return this.act('change', D.changeDue(p.tender, p.price));
      if (p.stage === 'short') return { ok: false, msg: 'they are short — let it go, or not', decide: true };
    }
    return { ok: false, msg: 'nothing to do here' };
  }

  /** Clean the soft-serve machine. Time, not cold; the window stays shut. */
  _act_clean() {
    if (this.cleaning) return { ok: false, msg: 'you are already elbow-deep in it' };
    if (this.churning) return { ok: false, msg: 'the churn is going — one machine at a time' };
    if (!this.truck.parked) return { ok: false, msg: 'park first' };
    if (this.windowOpen) return { ok: false, msg: 'shut the window. nobody wants to watch this part.' };
    if (this.grime < 0.15) return { ok: false, msg: 'it\'s clean enough. sell something.' };
    this.cleaning = { t: 0, dur: D.SOFTSERVE.cleanSeconds };
    this.cb.cleanStart && this.cb.cleanStart();
    return { ok: true, dur: D.SOFTSERVE.cleanSeconds };
  }

  /** Put back whatever is in your hands. */
  _act_drop() {
    if (!this.crew.hands) return { ok: false, msg: 'your hands are empty' };
    this.crew.hands = null;
    return { ok: true };
  }

  labelOf(key) { const it = this.itemOf(key); return it ? it.label : key; }

  /** The concrete clarification for what this person actually wants. */
  tellFor(p) {
    if (!p || !p.want) return "…something you haven't got. they'll settle for anything.";
    const it = this.itemOf(p.want);
    return D.TELLS[p.want] || (it ? D.TELL_INVENTED(it.label) : p.want);
  }

  /** Which station in the truck gives you this item. The UI's hint and the bot both read it. */
  stationFor(key) {
    const s = D.STATIONS.find(x => x.item === key);
    if (s) return s;
    if (this.invented.some(f => f.key === key)) return D.STATION_BY_ID.tub_new;
    return null;
  }

  /** Serve the person at the window the given item. Reading their order is the skill. */
  _act_serve(key) {
    const p = this.serving;
    if (!p) return { ok: false, msg: 'nobody at the window' };
    if (p.stage !== 'ask') return { ok: false, msg: 'they are waiting on their change' };
    const item = this.itemOf(key);
    if (!item) return { ok: false, msg: 'no such item' };
    if ((this.stock[key] || 0) <= 0) return { ok: false, msg: 'out of that' };

    if (p.want === null) {
      // the impossible order. You do not have the taco one. Nobody does.
      return { ok: false, msg: 'you do not have that. nobody does.', impossible: true };
    }

    if (key !== p.want) {
      p.wrongs = (p.wrongs || 0) + 1;
      this.stats.wrong++;
      // handing over the wrong thing buys you the tell immediately — the mistake IS how
      // you learn, which is the whole reason getting it wrong has to stay cheap
      if (!p.tell) p.tell = this.tellFor(p);
      this.cb.wrong && this.cb.wrong(p, key);
      if (p.wrongs < 2) return { ok: false, msg: 'no — ' + p.tell, wrong: true, tell: p.tell };
      // second time, they just take it. Kids do.
    }

    // ⚠️ ONE formula. This is the same call the face at the window is drawn from —
    // the readout and the behaviour cannot drift.
    // an invented flavour that is genuinely NOVEL buys headroom over the street's usual
    // ceiling — this is where the lab pays for itself
    const ceiling = this.ceilingOf(p.block) + (item.stats ? D.ceilingBonus(item.stats) : 0);
    // Mr Bell buys two. He has bought two every week since June died. He never explains
    // and you never ask — so the till, the stock and the cold all count both of them.
    const qty = p.qty || 1;
    const price = this.priceOf(key) * qty;
    if ((this.stock[key] || 0) < qty) return { ok: false, msg: 'not enough of that left' };

    // ⚠️ A REGULAR NEVER BALKS AT THEIR USUAL. That is what loyalty IS, and it is the
    // mechanical reason "they know your name" is worth anything: regulars are your
    // price-proof income. Found because Marge wants a $3.50 cone and lives on a $3.00
    // street — she could never once buy her own usual, so her character never fired.
    // Hand a regular something they did NOT ask for and the street price applies again.
    const theirUsual = p.reg && key === p.want;
    if (!theirUsual && !D.willBuy(ceiling, this.priceOf(key))) {
      this.stats.balked++;
      p.state = 'leaving'; this.serving = null;
      this.cb.balk && this.cb.balk(p, price);
      return { ok: false, msg: 'too dear for this street', balked: true };
    }

    this.stock[key] -= qty;
    if (item.invented) this.stats.inventedSold += qty;
    // every cone through the machine dirties it; past `tastesOffAt` they can tell,
    // and some of them say so (sim rng — deterministic, replays identically)
    if (key === 'cone') {
      this.grime = Math.min(1, this.grime + D.SOFTSERVE.grimePerCone);
      if (this.grime > D.SOFTSERVE.tastesOffAt) {
        this.rep -= D.SOFTSERVE.offRepLoss;
        this.stats.tastedOff++;
        if (this.chance(D.SOFTSERVE.offSayChance)) this.cb.tastesOff && this.cb.tastesOff(p);
      }
    }
    this.cold = Math.max(0, this.cold - item.cold * D.COLD.perSaleUnit * qty);
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
    const item = this.itemOf(p.gave) || { rep: 1 };   // ⚠️ itemOf, not MENU_BY_KEY — an
    //                                                  invented flavour is not in MENU

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
    this.stock[p.gave] += (p.qty || 1);            // it goes back in the box
    this.rep -= D.ECON.refuseRepLoss;
    this.stats.refused++;
    const h = this.houses.find(hh => hh.id === p.houseId);
    if (h) h.cool = 400;
    this._finish(p, 'refused');
    return { ok: true };
  }

  _finish(p, note) {
    this.stats.served++;
    // ⚠️ P3: the day has to END ON A PERSON. Remember who the last one was, by name.
    if (p.reg && note !== 'refused') {
      this.met[p.reg] = (this.met[p.reg] || 0) + 1;
      this.lastRegular = p.reg;
      if (!this.metToday.includes(p.reg)) this.metToday.push(p.reg);
    }
    p.state = 'leaving'; p.stage = 'done'; p.note = note; p.slot = undefined;
    this.serving = null;
    this._requeue();                 // everybody behind them steps up one
    this.cb.served && this.cb.served(p, note);
  }

  /**
   * THE CHURN BAY. Park, turn around, three steps.
   * ⚠️ It costs you SELLING TIME and COLD out of the same box you are selling from, and
   * the window has to be shut — that is the whole decision. Invent now and lose the
   * afternoon's next two stops, or sell now and take the depot's margins another day.
   */
  _act_churn(recipe) {
    if (this.churning) return { ok: false, msg: 'the machine is already going' };
    if (!this.truck.parked) return { ok: false, msg: 'you cannot load the hopper while driving' };
    // ⚠️ NO window-shut requirement. The machine RUNS IN PARALLEL — you load it parked,
    // then serve while it churns, and it dings when the batch lands (Overcooked's shape:
    // machines work while you do). The first design stopped the world for 38 s, and the
    // moment the queue wedge was fixed those 38 s of window time cost more than any
    // flavour earned — Trial D measured the whole bay at MINUS 7%. The cost of inventing
    // is now the walk, the cold and the ingredients, not a dead afternoon.
    if (this.cleaning) return { ok: false, msg: 'finish cleaning first — one job at a time back here' };
    if (!D.BASE_BY_KEY[recipe && recipe.base]) return { ok: false, msg: 'pick a base' };
    const mixins = (recipe.mixins || []).slice(0, D.CHURN.maxMixins);
    const r = { base: recipe.base, mixins, finish: recipe.finish || 'none' };
    this.churning = { recipe: r, t: 0, dur: D.CHURN.seconds };
    this.cb.churnStart && this.cb.churnStart(r);
    return { ok: true, name: D.flavourName(r), stats: D.recipeStats(r) };
  }

  _finishChurn() {
    const r = this.churning.recipe;
    this.churning = null;
    const stats = D.recipeStats(r);
    const name = D.flavourName(r);
    const key = 'inv:' + r.base + '|' + [...r.mixins].sort().join(',') + '|' + r.finish;

    let f = this.invented.find(x => x.key === key);
    if (!f) {
      f = {
        key, label: name, recipe: r, stats,
        price: D.suggestedPrice(stats), cost: Math.round(stats.cost),
        cold: 0.9 + (1 - stats.melt) * 0.5,
        kid: D.kidAppeal(stats), adult: D.adultAppeal(stats),
        rep: 1.0, melt: stats.melt, invented: true,
      };
      this.invented.push(f);
      this.prices[key] = f.price;
      this.stock[key] = 0;
      if (stats.legend && !this.discovered[stats.legend]) {
        this.discovered[stats.legend] = 1;
        this.stats.legendaries++;
        this.cb.legendary && this.cb.legendary(D.LEGENDARIES.find(l => l.id === stats.legend), f);
      }
    }
    this.stock[key] += D.CHURN.batch;
    this.stats.churned++;
    this.cb.churnDone && this.cb.churnDone(f);
  }

  /** Buy a thing for the truck. The first meaningful one must land inside 45 minutes. */
  _act_buy(key) {
    const u = D.UPGRADE_BY_KEY[key];
    if (!u) return { ok: false, msg: 'no such upgrade' };
    if (this.owned[key]) return { ok: false, msg: 'you already have that' };
    const purse = this.cash + this.drawer;
    if (purse < u.cost) return { ok: false, msg: "you can't afford that yet" };
    // spend the drawer first — that's the money that's actually in your hand
    const fromDrawer = Math.min(this.drawer, u.cost);
    this.drawer -= fromDrawer; this.cash -= (u.cost - fromDrawer);
    this.owned[key] = 1;
    this.mod = D.mods(this.owned);
    if (u.mod.stockAdd) for (const m of D.MENU) this.stock[m.key] += u.mod.stockAdd;
    this.cb.bought && this.cb.bought(u);
    return { ok: true, bought: u.key };
  }

  /** Set what you're charging. Price discovery by face is the loop this feeds. */
  _act_price(arg) {
    const { key, cents } = arg || {};
    if (!this.itemOf(key)) return { ok: false, msg: 'no such item' };   // invented too
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
      day: this.day, why: this.ending, weather: this.weather.key,
      grime: Math.round(this.grime * 100) / 100, cleaned: this.stats.cleaned,
      took: this.drawer, cash: this.cash, rep: Math.round(this.rep * 10) / 10,
      coldLeft: Math.round(this.cold * 1000) / 1000,
      served: this.stats.served, cameOut: this.stats.cameOut,
      walkedOff: this.stats.walkedOff, wrong: this.stats.wrong,
      mercy: this.stats.mercy, shorted: this.stats.shorted,
      noiseHeat: Math.round(this.noiseHeat * 100) / 100,
      hour: Math.round(this.hour * 10) / 10,
      noteDue: this.noteDue, notePaid: this.notePaid, noteMisses: this.noteMisses,
      lastRegular: this.lastRegular || null, metToday: [...this.metToday],
      met: { ...this.met }, owned: { ...this.owned },
      invented: this.invented.map(f => ({ ...f })), discovered: { ...this.discovered },
      churned: this.stats.churned, inventedSold: this.stats.inventedSold,
      annoy: Object.fromEntries(Object.values(this.blocks).map(b => [b.id, Math.round(b.annoy * 100) / 100])),
    };
  }

  // ---- save / determinism -------------------------------------------------
  snapshot() {
    return {
      v: D.VERSION, seed: this.seed, rs: this._rs, day: this.day, t: this.t,
      weather: this.weather.key, grime: this.grime,
      cleaning: this.cleaning ? { ...this.cleaning } : null,
      truck: { ...this.truck }, crew: { ...this.crew },
      cold: this.cold, cash: this.cash, drawer: this.drawer,
      rep: this.rep, noiseHeat: this.noiseHeat, tickets: this.tickets,
      noteMisses: this.noteMisses, song: this.song, windowOpen: this.windowOpen,
      stock: { ...this.stock }, prices: { ...this.prices }, pid: this._pid,
      owned: { ...this.owned }, met: { ...this.met }, saidMid: { ...this.saidMid },
      invented: this.invented.map(f => ({ ...f })), discovered: { ...this.discovered },
      churning: this.churning ? { ...this.churning, recipe: { ...this.churning.recipe } } : null,
      metToday: [...this.metToday], lastRegular: this.lastRegular || null,
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
    if (s.weather) this.weather = D.WEATHER.find(w => w.key === s.weather) || this.weather;
    this.grime = s.grime || 0;
    this.cleaning = s.cleaning ? { ...s.cleaning } : null;
    this.truck = { ...s.truck };
    if (s.crew) this.crew = { ...s.crew };
    this.cold = s.cold; this.cash = s.cash;
    this.drawer = s.drawer; this.rep = s.rep; this.noiseHeat = s.noiseHeat;
    this.tickets = s.tickets; this.noteMisses = s.noteMisses;
    this.song = s.song; this.windowOpen = s.windowOpen;
    this.stock = { ...s.stock }; this._pid = s.pid;
    if (s.prices) this.prices = { ...s.prices };
    this.owned = { ...(s.owned || {}) }; this.mod = D.mods(this.owned);
    this.invented = (s.invented || []).map(f => ({ ...f }));
    this.discovered = { ...(s.discovered || {}) };
    this.churning = s.churning ? { ...s.churning, recipe: { ...s.churning.recipe } } : null;
    this.met = { ...(s.met || {}) }; this.saidMid = { ...(s.saidMid || {}) };
    this.metToday = [...(s.metToday || [])]; this.lastRegular = s.lastRegular || null;
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
  // ⚠️ The cooldown is RE-ROLLED after every stop, not fixed. A constant one phase-locks
  // the bot onto a standing wave: houses sit 19.3 m apart, so a fixed 30 m gap makes it
  // stop at every OTHER house, in the same places, every seed — three of the five named
  // regulars were served zero times in 24 days purely because of where they sat in the
  // rhythm. A route driver's stops are not on a metronome.
  let guard = 0, lastT = -1, stopT = 0, stuckT = 0, sinceStop = 999, commit = null, churned = false;
  let wantKey = null, wantFor = -1;
  const pricedInv = {};
  // ⚠️ SMALL — just enough to clear the spot you're standing in. It is the AHEAD filter,
  // not this distance, that stops the bot shuffling in place. At 22-48 m the truck drove
  // past everyone who came out WHILE IT WAS PARKED (they are behind it by the time it
  // moves) and made five stops in an entire day, so most of the town and three of the
  // five named regulars were never measured at all.
  let nextGap = 8 + brng() * 12;
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
    if (!goal && sinceStop > nextGap && !tr.parked) {
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
    // ⚠️ NEGATED, because steer = +1 now means RIGHT (= decreasing yaw). A positive
    // bearing error means yaw must increase, which is a LEFT input.
    const input = { throttle: 0, brake: 0, steer: clamp(-err * 1.9, -1, 1) };
    if (tr.v < want - 0.15) input.throttle = 0.95;
    else if (tr.v > want + 0.15) input.brake = clamp((tr.v - want) * 0.6, 0.15, 1);

    // Walk the crew toward a station inside the truck. Setting crew.yaw directly is the
    // bot's "mouse" — the walk itself goes through the same input the player's keys feed.
    const walkTo = (st) => {
      const cr = g.crew;
      const dx = st.x - cr.x, dz = st.z - cr.z, d = Math.hypot(dx, dz);
      if (d > 0.02) cr.yaw = Math.atan2(dx, dz);   // ALWAYS face it — stationNear is directional
      if (d < D.CREW.reach * 0.7) return true;
      input.walkF = 1;
      return false;
    };

    if (tr.parked) {
      input.throttle = 0; input.brake = 0;
      stopT += FIXED;
      // ⚠️ Churn through the REAL act() path, at the first stop, BEFORE opening up — so
      // the trial pays the actual price of inventing (38 s of the afternoon and a bite of
      // the cold) rather than being handed a free flavour in the box.
      // ⚠️ NOT `continue` — the g.step() that advances the sim is at the BOTTOM of this
      // loop, so skipping to the next iteration freezes time, the churn never finishes,
      // and every cell dies on the guard having sold nothing.
      // ⚠️ THE BOT WALKS THE TRUCK, exactly like the player. It would be far easier to let
      // it call act('serve') from the driver's seat — and that would quietly stop the
      // trials measuring this game at all, because now that the interior is a place,
      // WALKING TIME IS A REAL ECONOMIC COST. A bot that teleports measures a truck
      // nobody plays. (Victory Lap trap 11, pointed the other way.)
      //
      // ⚠️ `leaving` has to be decided BEFORE standing up. Without it the bot stood up at
      // the top of every parked frame and tried to sit down at the bottom of the same
      // frame — it parked once, fought itself for the entire day, and departed zero times.
      const leaving = !g.cleaning && (stopT > 18 + patience * 40 || (g.queueLen() === 0 && stopT > 12));
      // ⚠️ decide the chore BEFORE the window: the bot used to open up on every parked
      // frame, and cleaning needs the window shut, so the disciplined policy could never
      // actually start the clean it was written to perform
      const wantsClean = P.clean && g.grime >= D.SOFTSERVE.tastesOffAt && !g.churning;
      if (wantsClean && !g.cleaning) {
        if (g.windowOpen) act('window', false);
        else if (walkTo(D.STATION_BY_ID.spigot)) act('interact');
      }
      if (!leaving && g.crew.seated) act('interact');     // get out of the seat and go to work

      if (P.churn && !churned && !g.churning) { act('churn', P.churn); churned = true; }
      // ⚠️ price the invention the way the bay's own readout says to: a novel flavour
      // carries headroom over the street ceiling, and a bot that ignores it measures a
      // player who can't read their own clipboard. 0.7x keeps it inside willBuy on the
      // cheapest block the route serves.
      for (const f of g.invented) {
        if (f.stats && !pricedInv[f.key] && (g.stock[f.key] || 0) > 0) {
          pricedInv[f.key] = 1;
          act('price', { key: f.key, cents: f.price + Math.round(D.ceilingBonus(f.stats) * 0.7) });
        }
      }
      // the churn runs in parallel now — only the CLEAN keeps the window shut
      if (!g.cleaning && !wantsClean && !g.windowOpen) act('window', true);
      // The law says silence the instant you're stationary — but every stop is a gamble:
      // a few more seconds of song pulls another kid off the next block. songGrace is
      // exactly how many seconds of that bribe this policy takes.
      if (g.song && stopT >= songGrace) act('song', false);
      const p = (leaving || g.cleaning) ? null : g.serving;   // serve straight through a churn
      if (p) {
        // decide ONCE per customer what we're going to hand them, then go and get it
        if (wantKey === null || wantFor !== p.id) {
          wantFor = p.id;
          wantKey = (p.want && (alwaysRight || brng() > 0.22)) ? p.want : bpick(g.menu()).key;
        }
        // ⚠️ once they've said the tell, the bot stops guessing — same as a player. A bot
        // that kept guessing through the clarification would measure a game where the
        // second beat does nothing, which is exactly the thing being tested.
        if (p.tell && wantKey !== p.want) { wantKey = p.want; }
        if (p.stage === 'ask') {
          if (g.crew.hands !== wantKey) {
            if (g.crew.hands) act('drop');
            else {
              const st = g.stationFor(wantKey);
              if (!st) wantKey = p.want;
              else if (walkTo(st)) {
                if (!act('interact').ok) {
                  // ⚠️ fall back to something else IN STOCK — retrying the same refusal
                  // (a filthy spigot, an empty bin) stalls the bot at one station until
                  // the customer's patience runs out, every customer, all afternoon
                  const alt = g.menu().find(m => m.key !== wantKey && (g.stock[m.key] || 0) > 0);
                  wantKey = alt ? alt.key : null;
                }
              }
            }
          } else if (walkTo(D.STATION_BY_ID.window)) {
            const r = act('interact');
            if (!r.ok && (r.impossible || r.balked)) { p.state = 'leaving'; g.serving = null; }
            wantKey = null;
          }
        } else if (p.stage === 'pay') {
          if (walkTo(D.STATION_BY_ID.window)) {
            const due = D.changeDue(p.tender, p.price);
            act('change', greed > 0.8 && brng() > 0.6 ? Math.max(0, due - 25) : due);
            wantKey = null;
          }
        } else if (p.stage === 'short') {
          if (walkTo(D.STATION_BY_ID.window)) { act(brng() < 0.62 ? 'mercy' : 'refuse'); wantKey = null; }
        }
      } else if (leaving) {
        act('window', false);
        // ⚠️ you have to get back in the seat before you can drive away, and sitting down
        // is what performs the depart (and runs the mirror check)
        if (!g.crew.seated) {
          if (walkTo(D.STATION_BY_ID.seat)) {
            const r = act('interact');
            if (!r.ok) bot.mirrorHeld++;
            else if (!g.truck.parked) {
              act('song', true); stopT = 0; sinceStop = 0; commit = null; bot.departs++;
              nextGap = 8 + brng() * 12;
            }
          }
        }
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
