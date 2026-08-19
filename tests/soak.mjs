// HERE COMES THE TRUCK — the soak battery.
//
//   "C:\Users\kylef\tools\node\node.exe" tests/soak.mjs [nSeeds]
//   or just double-click TEST-TRUCK.bat
//
// Drives full days through the REAL sim via the REAL act() dispatch. Target: the whole
// battery under a second, so there is no excuse not to run it on every change.
//
// ⚠️ A green check is not a balanced game. Read the DISTRIBUTIONS below the check —
// how days end, how many people came out, how much got sold. Victory Lap shipped a
// change that quietly halved every heat gain in the game and the tests stayed green.

import { Game, soakRun, D, HP, FIXED } from '../truck/game.js';

const N = parseInt(process.argv[2] || '24', 10);
const t0 = Date.now();
const problems = [];
const runs = [];

for (let s = 1; s <= N; s++) {
  let r;
  try { r = soakRun(s); }
  catch (e) { problems.push(`seed ${s} THREW outside the bot: ${e.message}\n${e.stack}`); continue; }
  runs.push(r);
  if (r.errors.length) {
    problems.push(`seed ${s}: ${r.errors.slice(0, 3).join(' | ')}`);
    console.log(`  x seed ${s}: ${r.errors[0]}`);
  }
}

// ---- aggregates ------------------------------------------------------------
const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / Math.max(1, runs.length);
const ends = {};
for (const r of runs) ends[r.why] = (ends[r.why] || 0) + 1;

console.log(`\n${runs.length} days simulated in ${Date.now() - t0} ms`);
console.log(`day ends:        ${JSON.stringify(ends)}`);
console.log(`avg took:        $${(avg(r => r.took) / 100).toFixed(2)}`);
console.log(`avg came out:    ${avg(r => r.cameOut).toFixed(1)}   served ${avg(r => r.served).toFixed(1)}   walked off ${avg(r => r.walkedOff).toFixed(1)}`);
console.log(`avg wrong item:  ${avg(r => r.wrong).toFixed(1)}   mercy ${avg(r => r.mercy).toFixed(1)}   shorted ${avg(r => r.shorted).toFixed(1)}`);
console.log(`avg noise heat:  ${avg(r => r.noiseHeat).toFixed(2)}   avg rep ${avg(r => r.rep).toFixed(1)}`);
console.log(`avg driven:      ${avg(r => r.stats.driven).toFixed(0)} m   (the loop is ~460 m)`);
console.log(`avg end hour:    ${avg(r => r.hour).toFixed(2)}   (dusk is ${D.DAY.duskHour})`);
const annoyMax = avg(r => Math.max(...Object.values(r.annoy)));
console.log(`avg worst block annoy: ${annoyMax.toFixed(2)}  (cold at ${D.JINGLE.annoyCold})`);

// ---- assertions ------------------------------------------------------------
const bad = (m) => problems.push(m);

if (runs.length !== N) bad(`only ${runs.length}/${N} runs completed`);

// P2 — THE COLD RUNS OUT. The real property isn't "which branch fired" (a lazy day can
// legitimately limp to dusk) — it's that THE BOX IS THE DAY. If days routinely finish
// with cold to spare, the gauge is decoration and a clock is secretly running the game.
const coldLeft = avg(r => r.coldLeft);
console.log(`avg cold left:   ${(coldLeft * 100).toFixed(1)}%  (ends on cold: ${ends.cold || 0}/${runs.length})`);
if (coldLeft > 0.15) bad(`days end with ${(coldLeft * 100).toFixed(0)}% of the box unspent — the cold is not the clock (pillar P2)`);
if (!ends.cold) bad(`not one day ran out of cold — the primary end condition never fires`);

// P1 — THE SONG BRINGS THEM. If nobody comes out, the game does not exist.
if (avg(r => r.cameOut) < 8) bad(`the song is not pulling people out (avg ${avg(r => r.cameOut).toFixed(1)} came out)`);
if (avg(r => r.served) < 4) bad(`almost nothing is being sold (avg ${avg(r => r.served).toFixed(1)} served)`);

// P1, the other half — DRIVING IS THE GAME. ⚠️ This assertion exists because the battery
// once ran fully green while the truck drove 57 m in an entire day: the bot diverted to
// whoever was nearest, and the song spawns customers around the truck, so it shuffled
// between two houses all afternoon. Every other number looked healthy. Never delete this.
const driven = avg(r => r.stats.driven);
if (driven < 400) bad(`the truck only drove ${driven.toFixed(0)} m in a day — it is not running a route (pillar P1)`);

// Nobody should have a shutout. A day that takes $0 means a system is jammed, not unlucky.
const broke = runs.filter(r => r.took === 0);
if (broke.length) bad(`${broke.length} day(s) took $0.00 (seeds ${broke.map(r => r.seed).join(', ')}) — something is jammed`);

// The moral engine has to actually fire, or it's decoration.
if (avg(r => r.mercy) < 0.15) bad(`the kid-is-short case never fires (avg mercy ${avg(r => r.mercy).toFixed(2)})`);

// P3 — THEY KNOW YOUR NAME. The day must be able to end on a person.
// ⚠️ This is a CAPABILITY assertion (every named regular can be served — tested
// deterministically below) plus a COVERAGE readout (how many the bot's particular route
// happens to reach, which is informational). Asserting on coverage was wrong: the bot
// completes barely one lap a day, so blocks three and four are rarely visited at all,
// and a perfectly servable regular living on Chestnut failed a test about the ROUTE.
const metAny = runs.filter(r => r.metToday.length).length;
const namesSeen = new Set(runs.flatMap(r => r.metToday));
console.log(`regulars:        met on ${metAny}/${runs.length} days · the bot's route reaches ${namesSeen.size}/${D.REGULARS.length}`);
if (metAny < runs.length * 0.5) bad(`only ${metAny}/${runs.length} days met a single named regular — the loop cannot end on a person (pillar P3)`);

// ---- determinism -----------------------------------------------------------
const a = soakRun(999), b = soakRun(999);
const detOk = a.hash === b.hash && a.took === b.took && a.served === b.served;
console.log(`determinism:     seed 999 twice -> ${detOk ? 'identical' : 'DIVERGED'}`);
if (!detOk) bad(`determinism broken: ${a.hash} vs ${b.hash}`);

const c = soakRun(1000);
if (c.hash === a.hash) bad(`seeds 999 and 1000 produced identical runs — the seed is not reaching the sim`);

// ---- save round-trip -------------------------------------------------------
{
  const g = new Game({ seed: 7 });
  for (let i = 0; i < 4000; i++) g.step(FIXED, { throttle: 0.8, steer: 0.12 });
  g.act('song', true);
  for (let i = 0; i < 4000; i++) g.step(FIXED, { throttle: 0.7, steer: -0.05 });
  const before = g.stateHash();
  const json = JSON.stringify(g.snapshot());
  const g2 = new Game({ seed: 7 }).restore(JSON.parse(json));
  g2.frame = g.frame;
  const after = g2.stateHash();
  console.log(`save round-trip: ${before === after ? 'byte-identical' : 'DIVERGED'}`);
  if (before !== after) bad(`save round-trip lost state:\n  before ${before}\n  after  ${after}`);

  // and it must keep simulating identically afterwards
  for (let i = 0; i < 1200; i++) { g.step(FIXED, { throttle: 0.5 }); g2.step(FIXED, { throttle: 0.5 }); }
  if (g.stateHash() !== g2.stateHash()) bad(`restored game diverged after 1200 further steps`);
}

// ---- unit checks on a fresh Game -------------------------------------------
{
  const g = new Game({ seed: 3 });

  // ⚠️⚠️ D TURNS RIGHT. This shipped inverted and only a human playing it caught it —
  // every automated number looked perfect because the bot steers by its own convention,
  // so it was self-consistently wrong. Assert against WORLD SPACE, not against the bot.
  // From yaw 0 the truck faces +z; steering right must send x NEGATIVE.
  {
    const s = new Game({ seed: 2 });
    s.truck.x = 0; s.truck.z = 0; s.truck.yaw = 0; s.truck.v = 0;
    for (let i = 0; i < 60 * 4; i++) s.step(FIXED, { throttle: 1, steer: 1 });
    console.log(`steering:        D from yaw 0 -> x ${s.truck.x.toFixed(2)} (must be negative = right)`);
    if (s.truck.x > -0.5) bad(`STEERING IS INVERTED — pressing D from yaw 0 moved x to ${s.truck.x.toFixed(2)}; right is -x`);
  }

  // the truck cannot turn while stopped — the bicycle model, not a tank
  const yaw0 = g.truck.yaw;
  for (let i = 0; i < 120; i++) g.step(FIXED, { throttle: 0, steer: 1 });
  if (Math.abs(g.truck.yaw - yaw0) > 1e-9) bad(`the truck rotated while stationary (${g.truck.yaw - yaw0})`);

  // It accelerates, and it respects the top speed.
  // ⚠️ 12 s, not 30. Maple St is 144 m and the town bounds are a wall — at 30 s the truck
  // drives off the east end, pins against the bound, and reports v = 0. That measures the
  // map, not the engine. (This test was wrong before the code was.)
  const x0 = g.truck.x;
  for (let i = 0; i < 60 * 12; i++) g.step(FIXED, { throttle: 1 });
  const travelled = Math.abs(g.truck.x - x0);
  if (g.truck.v < 4) bad(`the truck barely accelerates (v=${g.truck.v.toFixed(2)} after 12 s of full throttle)`);
  if (g.truck.v > D.TRUCK.topSpeed + 0.2) bad(`the truck exceeded top speed (${g.truck.v.toFixed(2)})`);
  console.log(`top speed:       ${g.truck.v.toFixed(2)} m/s after 12 s, ${travelled.toFixed(0)} m covered (cap ${D.TRUCK.topSpeed})`);
}
{
  // The turning circle must match the bicycle model's promise: R = wheelbase / tan(steer).
  // ⚠️ Measure the INSTANTANEOUS radius (v / yawRate), not the traced path. Two earlier
  // versions of this test measured the map instead of the model: with rects in play the
  // truck clips a hedge mid-circle, and even with rects cleared the circle leaves the
  // road, picks up lawnDrag, and crawls to a halt before closing — both read ~4.7 m.
  const g = new Game({ seed: 4 });
  g.rects = [];
  for (let i = 0; i < 60 * 6; i++) g.step(FIXED, { throttle: 0.6 });
  for (let i = 0; i < 30; i++) g.step(FIXED, { throttle: 0.6, steer: 1 });   // let the wheel arrive
  const yA = g.truck.yaw, vA = g.truck.v;
  g.step(FIXED, { throttle: 0.6, steer: 1 });
  const yawRate = (g.truck.yaw - yA) / FIXED;
  const radius = Math.abs(vA / yawRate);
  const want = D.TRUCK.wheelbase / Math.tan(D.TRUCK.maxSteer);
  console.log(`turning radius:  ${radius.toFixed(2)} m at ${vA.toFixed(1)} m/s (model says ${want.toFixed(2)}, ~${(radius * 2).toFixed(0)} m kerb to kerb)`);
  if (Math.abs(radius - want) > 0.35) bad(`turning radius ${radius.toFixed(2)} m does not match the model's ${want.toFixed(2)} m`);
}
{
  // ⚠️ NO SURFACE MAY BE A HOLE IN THE MAP. Surface resistance has a constant part and a
  // speed-proportional part; if any constant part reaches `accel`, a truck that wanders
  // onto that surface can never leave it at any throttle, forever. This shipped once:
  // lawnDrag was a flat 6.5 against an accel of 3.2, so grass ate the truck.
  const T = D.TRUCK;
  for (const [name, c] of [['sidewalk', T.kerbDragC], ['lawn', T.lawnDragC]]) {
    const floor = T.rollDrag + c;
    if (floor >= T.accel * 0.9) bad(`${name} drag floor ${floor.toFixed(2)} is too close to accel ${T.accel} — the truck can get stuck there forever`);
  }
  // and prove it by driving out of one
  const g = new Game({ seed: 21 });
  g.truck.x = HP.STREETS[0].at + 0; g.truck.z = HP.XS.walkOut + 1.2;   // parked on the grass
  g.truck.yaw = Math.PI / 2; g.truck.v = 0;
  const z0 = g.truck.z, x0 = g.truck.x;
  for (let i = 0; i < 60 * 8; i++) g.step(FIXED, { throttle: 1 });
  const escaped = Math.hypot(g.truck.x - x0, g.truck.z - z0);
  console.log(`off-road:        crawled ${escaped.toFixed(1)} m off the grass in 8 s at full throttle`);
  if (escaped < 3) bad(`the truck could not get off a lawn (${escaped.toFixed(1)} m in 8 s) — grass is a hole in the map`);
}
{
  // ⚠️ THE MIRROR. The single warmest mechanic in the game, and it must never fail open.
  const g = new Game({ seed: 5 });
  g.act('park');
  g.people.push({
    id: 1, houseId: g.houses[0].id, block: g.houses[0].block, kid: true,
    x: g.truck.x + Math.sin(g.truck.yaw) * 3.4, z: g.truck.z + Math.cos(g.truck.yaw) * 3.4,
    state: 'kerb', t: 0, kx: 0, kz: 0, want: 'pop', said: 'x', tender: 500, stage: 'ask',
  });
  const blocked = g.act('depart');
  if (blocked.ok) bad(`THE MIRROR FAILED OPEN — the truck pulled away with somebody in the blind zone`);
  g.people[0].z += 30; g.people[0].x += 30;
  if (!g.act('depart').ok) bad(`the mirror stayed blocked after the blind zone cleared`);

  // ⚠️ AND IT MUST ALWAYS CLEAR ITSELF. Kerb points lie inside the blind zone, so a
  // customer waiting their turn used to root there and the truck could never leave again
  // — a permanent, unrecoverable deadlock on a busy stop. Waiting people step aside.
  const h = new Game({ seed: 6 });
  h.act('park');
  const f = h.fwd();
  h.people.push({
    id: 9, houseId: h.houses[0].id, block: h.houses[0].block, kid: true,
    x: h.truck.x + f.x * 3.6, z: h.truck.z + f.z * 3.6,
    state: 'kerb', t: 0, kx: h.truck.x + f.x * 3.6, kz: h.truck.z + f.z * 3.6,
    lx: 0, lz: 0, want: 'pop', said: 'x', tender: 500, stage: 'ask',
  });
  let freed = -1;
  for (let i = 0; i < 60 * 12; i++) {
    h.step(FIXED, {});
    if (!h.mirrorBlocker()) { freed = i / 60; break; }
  }
  if (freed < 0) bad(`THE MIRROR DEADLOCKED — a waiting customer sat in the blind zone for 12 s and the truck could never leave`);
  else console.log(`the mirror:      holds when occupied, releases when clear, self-clears a loiterer in ${freed.toFixed(1)} s`);
}
{
  // the song has to be what pulls them out — not time, not proximity
  const quiet = new Game({ seed: 11 });
  for (let i = 0; i < 60 * 120; i++) quiet.step(FIXED, { throttle: 0.6 });
  if (quiet.stats.cameOut !== 0) bad(`${quiet.stats.cameOut} people came out with the song OFF`);

  const loud = new Game({ seed: 11 });
  loud.act('song', true);
  for (let i = 0; i < 60 * 120; i++) loud.step(FIXED, { throttle: 0.6 });
  if (loud.stats.cameOut < 3) bad(`only ${loud.stats.cameOut} came out over 2 min of song — P1 is not working`);
  console.log(`the song:        0 out silent, ${loud.stats.cameOut} out over 2 min of song`);
}
{
  // leaning on the song at one corner has to actually cost you a block
  const g = new Game({ seed: 13 });
  g.act('park'); g.act('song', true);
  for (let i = 0; i < 60 * 300; i++) g.step(FIXED, {});
  const worst = Math.max(...Object.values(g.blocks).map(b => b.annoy));
  if (worst < D.JINGLE.annoyCold) bad(`5 min of parked song only reached annoy ${worst.toFixed(2)} — a block can never go cold`);
  if (g.noiseHeat <= 0) bad(`parked with the song running accrued no noise heat`);
  console.log(`annoyed:         5 min parked & playing -> annoy ${worst.toFixed(2)}, heat ${g.noiseHeat.toFixed(1)}`);
}

{
  // ⚠️ EVERY NAMED REGULAR MUST BE SERVABLE. Park at their door, play the song, open the
  // window, serve them — and get their name, their line and their quirk back. This is the
  // emotional core; if one of them is unreachable the game quietly loses a character.
  const missed = [];
  for (const r of D.REGULARS) {
    const h = HP.buildHouses().find(x => x.id === r.house);
    if (!h) { missed.push(`${r.id} (no house "${r.house}")`); continue; }
    const st = HP.STREETS.find(s => s.id === h.block);
    const g = new Game({ seed: 31 });
    g.truck.x = h.lx; g.truck.z = h.lz; g.truck.v = 0;
    g.truck.yaw = st.axis === 'x' ? (h.side < 0 ? -Math.PI / 2 : Math.PI / 2) : (h.side < 0 ? Math.PI : 0);
    g.act('song', true);
    for (let i = 0; i < 60 * 45 && !g.people.some(p => p.reg === r.id); i++) g.step(FIXED, {});
    g.act('song', false); g.act('park'); g.act('window', true);
    for (let i = 0; i < 60 * 150 && !(g.met[r.id] > 0); i++) {
      g.step(FIXED, {});
      const p = g.serving;
      if (!p) continue;
      if (p.stage === 'ask') { const res = g.act('serve', p.want || 'pop'); if (!res.ok) { p.state = 'leaving'; g.serving = null; } }
      else if (p.stage === 'pay') g.act('change', D.changeDue(p.tender, p.price));
      else if (p.stage === 'short') g.act('mercy');
    }
    if (!(g.met[r.id] > 0)) missed.push(r.id);
  }
  console.log(`every regular:   ${D.REGULARS.length - missed.length}/${D.REGULARS.length} servable at their own door`);
  if (missed.length) bad(`UNSERVABLE regular(s): ${missed.join(', ')} — a named character cannot be reached at all`);
}

{
  // THE CHURN BAY — invent something and sell it the same day (the bible's v0.1 item 5).
  const g = new Game({ seed: 41 });
  g.act('park');
  g.act('song', true);          // or nobody comes out and "cannot sell it" means "nobody asked"
  const before = g.menu().length;
  const r = g.act('churn', { base: 'custard', mixins: ['cookie', 'gum'], finish: 'sprinkles' });
  if (!r.ok) bad(`could not start a churn: ${r.msg}`);
  const coldBefore = g.cold;
  for (let i = 0; i < 60 * (D.CHURN.seconds + 2); i++) g.step(FIXED, {});
  if (!(coldBefore - g.cold > 0)) bad('churning cost no cold at all — the machine is free');
  g.act('song', false);
  const made = g.invented[0];
  console.log(`the bay:         churned "${made ? made.label : 'NOTHING'}" -> ${made ? g.stock[made.key] : 0} in the box`);
  if (!made) bad('the churn produced nothing');
  else {
    if (g.menu().length !== before + 1) bad(`the invention did not join the menu`);
    if ((g.stock[made.key] || 0) !== D.CHURN.batch) bad(`wrong batch size: ${g.stock[made.key]}`);
    if (!(g.priceOf(made.key) > 0)) bad('the invention has no price');
    // ⚠️ TWO CRISP ASSERTIONS, not one flaky one. "Does somebody happen to ask for it"
    // is a coin flip at one parked spot with six items on the menu — it failed on an
    // unlucky seed while the mechanism was perfectly fine. Assert (a) it is in the pool
    // people draw their orders from, and (b) a real sale of it completes.
    const pool = g.menu().filter(m => (g.stock[m.key] || 0) > 0).map(m => m.key);
    if (!pool.includes(made.key)) bad('the invention is not in the pool customers order from');

    g.act('song', true); g.act('window', true);
    let sold = 0;
    for (let i = 0; i < 60 * 240 && !sold; i++) {
      g.step(FIXED, {});
      const p = g.serving; if (!p) continue;
      if (p.stage === 'ask') {
        const rr = g.act('serve', made.key);          // hand them the new thing
        if (!rr.ok && !rr.wrong) { p.state = 'leaving'; g.serving = null; }
      } else if (p.stage === 'pay') { g.act('change', D.changeDue(p.tender, p.price)); sold = g.stats.inventedSold; }
      else if (p.stage === 'short') { g.act('mercy'); sold = g.stats.inventedSold; }
    }
    if (!sold) bad('an invented flavour could not be sold the same day');
    else console.log(`                 in the order pool, and sold the same afternoon (drawer $${(g.drawer / 100).toFixed(2)})`);
  }
}
{
  // ⚠️ A LEGENDARY IS A FLOOR PLUS A BONUS, NEVER AN OVERRIDE. MY BREW's legendary branch
  // REPLACED the score and capped it BELOW what a plain two-ingredient recipe reached,
  // which made its whole discovery fantasy mechanically pointless. Prove every floor
  // only ever raises a stat, using the same formula rather than a reimplementation of it.
  const lifts = [];
  for (const l of D.LEGENDARIES) {
    const rec = { base: l.base, mixins: l.mixins, finish: l.finish };
    const on = D.recipeStats(rec), off = D.recipeStats(rec, true);
    let lift = 0;
    for (const k of ['sweet', 'novel', 'melt']) {
      if (on[k] < off[k] - 1e-9) bad(`legendary "${l.id}" LOWERS ${k} (${off[k].toFixed(2)} -> ${on[k].toFixed(2)}) — that is an override, not a floor`);
      lift = Math.max(lift, on[k] - off[k]);
    }
    // ⚠️ and it must actually DO something. A floor sitting under what the ingredients
    // already give is a decorative label, not a discovery worth hunting for.
    if (lift < 0.05) bad(`legendary "${l.id}" raises nothing — its floors are below what the ingredients already reach`);
    lifts.push(`${l.id} +${lift.toFixed(2)}`);
    if (!D.legendaryFor({ base: l.base, mixins: [...l.mixins].reverse(), finish: l.finish }))
      bad(`legendary "${l.id}" does not match when its mix-ins are in the other order`);
  }
  console.log(`legendaries:     ${D.LEGENDARIES.length}, all floors and all lift something (${lifts.join(', ')}), order-independent`);
}
{
  // ⚠️ THE TRUCK IS A PLACE. Every station must be standable-at, reachable, and
  // UNAMBIGUOUS — the aisle is 1.44 m wide with stations down both walls, so several sit
  // inside `reach` at once and picking the nearest made you sit in the driver's seat when
  // you meant to open the freezer. Facing decides it. Prove every station can be selected.
  const g = new Game({ seed: 51 });
  g.act('interact');                     // stand up out of the seat
  if (g.crew.seated) bad('could not get out of the driver\'s seat');
  const unreachable = [];
  for (const st of D.STATIONS) {
    const c = new Game({ seed: 51 });
    c.crew.seated = false;
    // stand in the aisle beside it, facing it
    c.crew.x = Math.max(D.CREW.aisle.x0, Math.min(D.CREW.aisle.x1, st.x));
    c.crew.z = Math.max(D.CREW.aisle.z0, Math.min(D.CREW.aisle.z1, st.z));
    c.crew.yaw = Math.atan2(st.x - c.crew.x, st.z - c.crew.z);
    const got = c.stationNear();
    if (!got || got.id !== st.id) unreachable.push(`${st.id}${got ? ' -> ' + got.id : ' -> none'}`);
  }
  console.log(`the stations:    ${D.STATIONS.length - unreachable.length}/${D.STATIONS.length} selectable by standing at them and looking`);
  if (unreachable.length) bad(`stations you cannot select: ${unreachable.join(', ')}`);

  // ONE PAIR OF HANDS — you carry exactly one thing
  const h = new Game({ seed: 52 });
  h.act('interact');
  const bin = D.STATION_BY_ID.bin_bomb;
  h.crew.x = D.CREW.aisle.x1; h.crew.z = bin.z; h.crew.yaw = Math.atan2(bin.x - h.crew.x, 0);
  if (!h.act('interact').ok) bad('could not take a bomb pop from its bin');
  if (h.crew.hands !== 'bomb') bad(`took the wrong thing: ${h.crew.hands}`);
  const second = h.act('interact');
  if (second.ok) bad('picked up a SECOND item — there is only one pair of hands');
  console.log(`your hands:      one item at a time (took ${h.crew.hands}, second grab refused)`);

  // ⚠️ AND YOU CANNOT DRIVE FROM THE BACK OF YOUR OWN TRUCK
  const dcheck = new Game({ seed: 53 });
  dcheck.act('interact');                // out of the seat
  const x0 = dcheck.truck.x;
  for (let i = 0; i < 60 * 5; i++) dcheck.step(FIXED, { throttle: 1, steer: 0 });
  if (Math.abs(dcheck.truck.x - x0) > 0.5) bad('the truck drove itself with nobody in the seat');
  else console.log(`the seat:        controls are dead while you are in the back`);
}
{
  // ⚠️ NO YARD PROP MAY STAND IN THE ROAD. Kyle's report was literally "there are trees
  // in the road": placement double-counted the house's centre-to-face offset, so trees
  // landed 0.2 m from the street centreline and every mailbox sat on the white line.
  for (const depth of [4.2, 4.6, 5.4]) {
    const b = HP.yardBand(depth);
    const nearestToStreet = b.centre - b.far;      // metres from the street centreline
    if (nearestToStreet <= HP.XS.walkOut) bad(`yard band reaches the pavement at depth ${depth} (${nearestToStreet.toFixed(2)} m from centreline, pavement starts at ${HP.XS.walkOut})`);
    if (nearestToStreet <= HP.XS.roadHalf) bad(`YARD PROPS WOULD STAND IN THE ROAD at depth ${depth} — ${nearestToStreet.toFixed(2)} m from the centreline, road is +/-${HP.XS.roadHalf}`);
    if (b.near >= b.far) bad(`yard band is inverted at depth ${depth}`);
    if (b.centre - b.kerb !== HP.XS.kerb) bad(`the path would not end at the kerb at depth ${depth}`);
  }
  const bb = HP.yardBand();
  console.log(`the yard:        props sit ${(bb.centre - bb.far).toFixed(1)}-${(bb.centre - bb.near).toFixed(1)} m from the centreline (road ends at ${HP.XS.roadHalf}, pavement at ${HP.XS.walkOut})`);
}
{
  // THE WEATHER: deterministic per (seed, day), all four kinds reachable, and a pinned
  // day must restore to the same weather after a save round-trip.
  const kinds = {};
  for (let s = 1; s <= 40; s++) { const g = new Game({ seed: s, day: (s % 9) + 1 }); kinds[g.weather.key] = (kinds[g.weather.key] || 0) + 1; }
  console.log(`the weather:     40 rolled days -> ${JSON.stringify(kinds)}`);
  if (Object.keys(kinds).length < 4) bad(`only ${Object.keys(kinds).length}/4 weather kinds ever roll`);
  const a = new Game({ seed: 9, day: 3 }), b = new Game({ seed: 9, day: 3 });
  if (a.weather.key !== b.weather.key) bad('weather is not deterministic for the same seed+day');
  const g2 = new Game({ seed: 9, day: 3, weather: 'scorcher' });
  const g3 = new Game({ seed: 9, day: 3 }).restore(JSON.parse(JSON.stringify(g2.snapshot())));
  if (g3.weather.key !== 'scorcher') bad('pinned weather does not survive a save round-trip');
}
{
  // THE SOFT-SERVE MACHINE (§10 with P4 teeth): grime climbs per cone, the customers
  // start saying so, the spigot eventually REFUSES — never dice — and the clean resets
  // it. All through the real act() paths, and the grime survives a save round-trip.
  const g = new Game({ seed: 61, grime: 0.90 });
  g.act('interact');                                   // out of the seat -> parked
  const sp = D.STATION_BY_ID.spigot;
  const stand = (gg) => { gg.crew.x = -0.4; gg.crew.z = sp.z; gg.crew.yaw = Math.atan2(sp.x + 0.4, 0); };
  // push it past the refusal line by selling cones through the real serve path
  g.act('song', true); g.act('window', true);
  let refusals = 0, served = 0;
  for (let i = 0; i < 60 * 300 && refusals === 0; i++) {
    g.step(FIXED, {});
    const p = g.serving; if (!p) continue;
    if (p.stage === 'ask') {
      stand(g);
      const r = g.act('interact');                     // try to pull a cone
      if (!r.ok && /needs cleaning/.test(r.msg || '')) { refusals++; break; }
      if (r.ok) {
        g.crew.x = -0.5; g.crew.z = D.STATION_BY_ID.window.z; g.crew.yaw = Math.atan2(-0.18, 0);
        const s2 = g.act('serve', 'cone'); if (s2.ok) served++;
        else { p.state = 'leaving'; g.serving = null; }
        g.crew.hands = null;
      }
    } else if (p.stage === 'pay') g.act('change', D.changeDue(p.tender, p.price));
    else if (p.stage === 'short') g.act('mercy');
  }
  console.log(`the machine:     started at 90% grime, served ${served} cones -> tastedOff ${g.stats.tastedOff}, refused after ${served}`);
  if (refusals === 0) bad('the spigot never refused — the machine can be ignored forever (the §10 gate is open)');
  if (g.stats.tastedOff === 0) bad('no cone ever tasted off on a filthy machine — the middle stage is inert');

  // the clean: window shut, at the spigot, E — takes real time, then resets
  g.act('window', false);
  stand(g);
  const c = g.act('interact');
  if (!c.ok) bad(`could not start the clean: ${c.msg}`);
  const sitDenied = (() => { const seat = D.STATION_BY_ID.seat; g.crew.x = seat.x; g.crew.z = seat.z - 0.5; g.crew.yaw = 0; return g.act('interact'); })();
  if (sitDenied.ok) bad('you drove off elbow-deep in the machine — cleaning must block the seat');
  for (let i = 0; i < 60 * (D.SOFTSERVE.cleanSeconds + 2); i++) g.step(FIXED, {});
  if (g.grime !== 0) bad(`the clean finished but grime is ${g.grime}`);
  else console.log(`                 refused the seat mid-clean, then reset to 0 after ${D.SOFTSERVE.cleanSeconds}s`);

  // and grime must survive a save round-trip mid-filth
  const h = new Game({ seed: 62, grime: 0.7 });
  const h2 = new Game({ seed: 62 }).restore(JSON.parse(JSON.stringify(h.snapshot())));
  if (Math.abs(h2.grime - 0.7) > 1e-9) bad('grime does not survive a save round-trip');
}
{
  // ⚠️ THE LINE SELF-HEALS. A kick that bypasses _finish (impossible order, a balk, any
  // external path) used to orphan slot 0 — nobody behind advanced, `serving` stayed null,
  // the whole queue timed out one by one. Kick the front rudely; the line must recover.
  const g = new Game({ seed: 63 });
  g.act('interact'); g.act('song', true); g.act('window', true);
  for (let i = 0; i < 60 * 90 && !g.serving; i++) g.step(FIXED, {});
  if (!g.serving) bad('queue-heal test: nobody ever reached the window');
  else {
    g.serving.state = 'leaving'; g.serving = null;      // the rude kick, no _requeue
    let healed = 0;
    for (let i = 0; i < 60 * 30; i++) { g.step(FIXED, {}); if (g.serving) { healed = i / 60; break; } }
    if (!g.serving) bad('THE LINE WEDGED — a kicked front customer orphaned slot 0 and nobody ever advanced');
    else console.log(`the line:        kicked the front rudely -> next customer at the window in ${healed.toFixed(1)}s`);
  }
}
{
  // THE DEMAND SYSTEM (§10): kids' asks must skew to the kid items and adults' to the
  // adult items, through the REAL come-out path. Uniform want-selection shipped for three
  // milestones while the appeal stats decorated the data file — "recipes are aimed" was
  // a lie the whole time, and only the bay's ~0% payback ever hinted at it.
  const asks = { kid: {}, adult: {} };
  for (let s = 71; s <= 76; s++) {
    soakRun(s, {
      cb: { cameOut: (p) => { if (p.want) { const b = asks[p.kid ? 'kid' : 'adult']; b[p.want] = (b[p.want] || 0) + 1; } } },
    });
  }
  const share = (bag, keys) => {
    let hit = 0, all = 0;
    for (const [k, n] of Object.entries(bag)) { all += n; if (keys.includes(k)) hit += n; }
    return all ? hit / all : 0;
  };
  const kidShare = share(asks.kid, ['eyes', 'bomb', 'pop']);
  const adultShare = share(asks.adult, ['cone', 'scoop']);
  console.log(`the demand:      kids ask for bars/pops ${(kidShare * 100).toFixed(0)}% of the time · adults ask for cones/scoops ${(adultShare * 100).toFixed(0)}%`);
  if (kidShare < 0.6) bad(`kid demand barely skews to kid items (${(kidShare * 100).toFixed(0)}%) — the weighted draw is not biting`);
  if (adultShare < 0.6) bad(`adult demand barely skews to adult items (${(adultShare * 100).toFixed(0)}%)`);
  if (Object.keys(asks.kid).length < 3) bad('kids only ever ask for one or two things — the tail died');
}
{
  // per-item melt: a tough bar must outlast a soft one as the box warms
  const tough = D.softBelow(0.85), weak = D.softBelow(0.30);
  console.log(`melt:            a 0.85-melt item softens at cold ${tough.toFixed(3)}, a 0.30-melt at ${weak.toFixed(3)}`);
  if (!(tough < weak)) bad('melt-resistance does not delay softening — the stat is inert');
}

// ---- verdict ---------------------------------------------------------------
if (problems.length) {
  console.log(`\n*** ${problems.length} PROBLEM(S) ***`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log(`\nOK soak green - ${runs.length} days, determinism holds, save round-trips, the mirror holds.  ${Date.now() - t0} ms\n`);
