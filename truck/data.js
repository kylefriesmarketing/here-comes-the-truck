// HERE COMES THE TRUCK — data.js
//
// ALL tuning and content lives here. The data.js rule: balance changes touch ONE file.
// DOM-free and import-free, so Node (tests/) and the browser both read the same numbers.
//
// ⚠️ The formulas at the bottom are the "one function" rule from MY BREW: any number the
// UI shows must come from the SAME function the sim reads, so the readout and the
// behaviour can never drift. MY BREW shipped an inverted progression curve because a
// price tag and a purchase decision were two different models of the same question.
//
// Money is in CENTS, always, as integers. There is no float money anywhere in this game.

// ---------------------------------------------------------------------------
// THE TRUCK — arcade with weight (Kyle's call, 2026-08-11)
// A bicycle model: yaw rate = (v / wheelbase) * tan(steer). That single line is why
// you cannot turn while stopped, why it's tight at walking pace and wide at speed,
// and why parking against a kerb feels like parking a van instead of nudging a token.
// ---------------------------------------------------------------------------
export const TRUCK = {
  len: 4.6, wide: 1.95, high: 2.9,   // matches FRESH CUT's makeCar('icecream') box
  wheelbase: 2.95,
  axleFront: 1.5, axleRear: -1.45,   // local z of each axle, for the two collision circles
  bodyR: 1.15,                        // collision circle radius at each axle

  accel: 3.2,          // m/s^2 at full throttle from a standstill
  accelFalloff: 0.72,  // fraction of top speed where accel starts tailing off
  brake: 7.0,          // m/s^2
  topSpeed: 11.0,      // ~25 mph. A neighbourhood cruise, not a getaway.
  topReverse: 3.2,
  rollDrag: 0.45,      // linear, per second
  airDrag: 0.016,      // quadratic
  engineBrake: 1.1,    // deceleration with no throttle and no brake

  // maxSteer sets the turning circle through the bicycle model: R = wheelbase/tan(steer).
  // At 0.44 rad that's a 6.3 m radius — a ~13 m kerb-to-kerb circle, which is what a real
  // step van does. ⚠️ Do not raise this "so it handles better": at 0.55 the radius drops
  // to 4.8 m and a 4.6 m truck pirouettes like a shopping trolley.
  maxSteer: 0.44,      // rad, ~25 degrees at the wheel
  steerRate: 4.2,      // how fast the wheel actually turns toward your input
  steerReturn: 6.0,    // how fast it centres when you let go

  // Company doctrine: "drive at a walking speed of three miles per hour when selling."
  sellSpeed: 1.35,     // m/s — under this you count as crawling a block properly

  // ⚠️ SURFACE RESISTANCE IS MOSTLY SPEED-PROPORTIONAL, AND THE CONSTANT PART MUST STAY
  // WELL UNDER `accel`. A first pass made these flat decelerations — kerb 2.6, lawn 6.5 —
  // against an accel of 3.2. Grass was then a hole in the map: drive onto a verge and the
  // truck can never leave it, at any throttle, forever. Speed-proportional drag slams your
  // speed down hard (which is what a lawn should do) while always leaving you able to
  // creep off it. The soak asserts this relationship; don't break it by raising a C.
  kerbDragK: 1.2, kerbDragC: 0.50,   // a wheel up on the sidewalk
  lawnDragK: 2.2, lawnDragC: 0.90,   // you are on somebody's grass and they can see you

  // ⚠️ THE MIRROR (bible §7). Nothing bad ever happens — the truck simply will not move.
  // Real law in NY/NJ/MI requires the front convex mirror; Detroit cut truck injuries
  // from 48/yr to 11 by mandating this kit in 1978. This is that statute, as a ritual.
  mirrorAhead: 4.2,    // metres in front of the nose the blind zone extends
  mirrorHalfW: 2.2,    // half-width of the blind zone
};

// ---------------------------------------------------------------------------
// THE DAY — cold is the clock, not a timer (bible §6, pillar P2)
// Eutectic cold plates: you freeze them overnight on 115V and run all day on no power.
// Manufacturers guarantee a minimum 12-hour day at 90F. That's why the truck comes home
// every night — it's physics, not narrative convenience.
// ---------------------------------------------------------------------------
export const DAY = {
  startHour: 14.0,          // 2pm. Shady Pines is already waiting.
  duskHour: 20.5,           // the backstop. Cold should normally beat this.
  secondsPerHour: 90,       // 1 sim-hour = 90 real seconds -> a full day is ~9.75 min
};

// The day is 6.5 sim-hours x 90 s = 585 real seconds. These rates are budgeted against
// that number so a WELL-RUN day just barely spends the whole box, and a day with the
// window hanging open burns out around two thirds through. If you change DAY, re-budget:
//   base 585 s = 0.51 · window ~35% of the day = 0.27 · heat = 0.09 · ~60 sales = 0.10
export const COLD = {
  full: 1.0,
  // ⚠️ drainBase alone must very nearly spend the box over a full day. THE COLD IS THE
  // CLOCK (pillar P2) — if a lazy day comfortably reaches dusk with cold to spare, the
  // gauge is decoration and the day is really being ended by a timer. The good tension
  // falls out of this for free: a BUSY day ends EARLIER, because selling costs cold.
  drainBase: 0.00165,       // per sim-second, doing nothing
  drainWindow: 0.00130,     // ADDITIONAL, while the serving window is open
  drainMoving: -0.00012,    // moving air over the box helps a little. Yes, really.
  drainHeat: 0.00026,       // ADDITIONAL at full heat (scaled by the heat curve)
  perSaleUnit: 0.0016,      // x the item's `cold` — the hatch is open, the arm is in there

  softAt: 0.28,             // below this the load starts going soft
  softPenalty: 0.55,        // soft stock sells at this fraction of price
  // A day ends when cold hits 0. Dusk is only the backstop.
};

// ---------------------------------------------------------------------------
// THE JINGLE IS A VERB (bible §5) — the signature system
//
// Real rule, NYC Administrative Code via NYC311: "Ice cream trucks may only play music
// or jingles when they are moving." Many codes reclassify a truck parked over 5-10 min
// as a "stationary sound source" under a stricter dB cap. That is a finished game
// mechanic sitting in a municipal FAQ.
// ---------------------------------------------------------------------------
export const JINGLE = {
  radius: 46,               // metres. Everyone inside it hears you.
  falloffPow: 1.4,          // (1 - d/r)^pow — the shape of "how well can they hear it"

  heardRate: 0.30,          // per second at point-blank, scaled by falloff
  heardDecay: 0.045,        // per second, when they can't hear you
  heardOut: 1.0,            // cross this and somebody comes out to the kerb

  // Every block also accumulates ANNOYED. Lean on the song at one corner and windows
  // start closing. Noise complaints are a real economy.
  //
  // ⚠️ BUDGETED, not guessed. A block is ~144 m; cruising it at 8 m/s takes 18 s, and a
  // well-run day passes each block ~8 times = ~144 s of song. That should land near 0.3 —
  // annoying, and fully forgiven overnight. Parking with the song running is the thing
  // that actually costs you: 20 s of "just a few more seconds" is worth ~0.15.
  annoyRate: 0.0021,        // per second while the song plays anywhere in the block
  annoyParkedMul: 3.6,      // leaning on it while stationary is what annoys people
  annoyDecayPerDay: 0.34,   // blocks forgive, slowly
  annoyCold: 1.0,           // past this the block stops coming out at all
  annoyWarn: 0.55,          // and this is where you can see it happening

  // ⚠️ You must kill the song when you stop. Heat only becomes a fine if somebody with
  // a clipboard is in line of sight — so every stop is a small gamble: eight more
  // seconds of song pulls two more kids off the next block, and the code-enforcement
  // car turns onto Maple at 4:15 most Thursdays.
  noiseHeatRate: 0.085,     // per second parked with the song still running
  noiseHeatFineAt: 25,      // ~5 min of cumulative parked-song across a day = real risk
  noiseHeatDecayPerDay: 0.5,
};

// ---------------------------------------------------------------------------
// THE WINDOW (bible §7) — orders arrive in kid, and reading them is the skill
// ---------------------------------------------------------------------------
export const CUSTOMER = {
  walkSpeed: 1.45,          // m/s out to the kerb
  runSpeed: 2.35,           // kids run
  patience: 52,             // sim-seconds at the window before they drift off
  // ⚠️ SMALL. At 2.6 m this was larger than the distance from a kerb to the window, so
  // everyone "arrived" the instant they were served-eligible and never took a step —
  // the queue counter read 5 while five people stood scattered along the street and the
  // view out of the window was an empty lawn.
  reachWindow: 0.3,         // how close counts as "at the window"
  queueGap: 0.95,           // they line up back along the truck
  serveRadius: 3.4,         // how close the truck must be to their kerb point
  // ⚠️ How far somebody will walk to reach a parked truck. Houses sit 24 m apart, so this
  // is the number that decides whether ONE stop serves one household or three. At 17 m
  // two thirds of the people who came out timed out on their own kerb and the game
  // never delivered "three kids come running." Kids will absolutely walk half a block.
  willWalk: 34,
  maxQueue: 5,
  kidChance: 0.68,          // 2 in 3 of the people who come out are children
};

// ---------------------------------------------------------------------------
// THE MENU — the demand/margin inversion, straight from the trade (bible §10)
//
// The item children scream for barely makes money and you have to buy it from the
// corporate depot. The margin lives in soft serve, and adults buy that.
// SERVING KIDS BUILDS REPUTATION. SERVING ADULTS BUILDS CASH. You have to run both.
// ---------------------------------------------------------------------------
export const MENU = [
  // key      label                    price cost  cold  kid  adult   (cost/price = food cost %)
  { key: 'eyes',  label: 'the one with the eyes', price: 250, cost: 105, cold: 0.9, kid: 1.00, adult: 0.15, rep: 1.35 },
  { key: 'bomb',  label: 'a bomb pop',            price: 200, cost:  68, cold: 0.8, kid: 0.90, adult: 0.25, rep: 1.10 },
  { key: 'scoop', label: 'a scoop',               price: 300, cost:  63, cold: 1.2, kid: 0.60, adult: 0.70, rep: 1.00 },
  { key: 'cone',  label: 'a soft serve cone',     price: 350, cost:  60, cold: 1.4, kid: 0.50, adult: 1.00, rep: 0.85 },
  { key: 'pop',   label: 'a freeze pop',          price: 100, cost:  30, cold: 0.5, kid: 0.80, adult: 0.20, rep: 1.20 },
];
export const MENU_BY_KEY = Object.fromEntries(MENU.map(m => [m.key, m]));

// Orders arrive in kid. Same item, several ways of asking for it — this is the skill,
// and it is graybox-cheap because it's pure data.
export const KID_ORDERS = {
  eyes:  ['the one with the eyes', 'the eyes one', 'the one with the gumballs', 'the guy with the face'],
  bomb:  ['red. no — the OTHER red one', 'a red white and blue one', 'the rocket', 'the stripey one'],
  scoop: ['just a scoop', 'ice cream in the round thing', 'a scoop please', 'the normal one'],
  cone:  ['the swirly one', 'a soft one', 'the one that comes out the machine', 'a twist'],
  pop:   ['a freeze pop', 'the long skinny one', 'a tube one', 'the cheap one'],
};
export const ADULT_ORDERS = {
  eyes:  ['one of those character bars, for my son'],
  bomb:  ['a bomb pop, if you have it'],
  scoop: ['a single scoop'],
  cone:  ['a cone. soft serve.', 'a twist cone, please'],
  pop:   ['a freeze pop'],
};
// The one nobody has. Fires occasionally and is never fillable — that's the joke (bible §10).
export const IMPOSSIBLE_ORDERS = [
  'do you have the taco one',
  'whatever he\'s getting but not that',
  'the one from last summer',
];

// What they hand you: wadded singles and sticky coins.
// ⚠️ These are NOTES THAT COVER THE PRICE, and the sim picks the smallest that does.
// A flat random draw from a list containing 25c meant any adult could hand over a quarter
// for a $3 scoop and fall into the kid-is-short branch — which turned the game's moral
// engine into background noise. Being short is a DELIBERATE case, not a dice roll.
export const TENDERS = [100, 200, 500, 1000, 2000];
export const EXACT_CHANCE = 0.30;    // some of them counted it out on the porch first

// ---------------------------------------------------------------------------
// THE MONEY — two debts, one honest and one not (bible §11)
// ---------------------------------------------------------------------------
export const ECON = {
  startCash: 4200,          // $42.00. You just signed for the truck.
  restockPerDay: 1800,      // what a day's load costs you at the depot

  // THE NOTE. Fixed, monthly, due whether or not it rained on Saturday. A bank, not a
  // loan shark — deliberately impersonal. Soft fail with repo teeth, never a game-over.
  noteAmount: 9000,         // $90.00
  noteEveryDays: 7,
  noteGraceMisses: 3,       // they take the good freezer at 3. You can see it coming.

  // Shorting change on a kid who can't count (Kyle's call, 2026-08-11: IN, as a
  // deliberate act). Correct change is the default; shorting is a second, separate
  // action. It can never happen by misclick — it's a moral texture, not an ambush.
  shortRepLoss: 2.4,        // per offence, and the household remembers
  shortNoticeChance: 0.34,  // some of them count it. Some of them count it later.

  // The kid who is short forty cents is the moral engine, and it's load-bearing:
  // reputation gates event bookings, the only genuinely profitable stream in the real
  // trade. The player who optimises purely for per-cone margin locks themselves out.
  mercyRepGain: 3.0,
  refuseRepLoss: 1.8,
};

// ---------------------------------------------------------------------------
// THE ROUTE — ordinances as level design (bible §8)
// From Montclair NJ Ch. 337 and NJ/NY/CA state law. The single best route in the game
// is mechanically illegal to repeat, which is the design that declines to give players
// the opportunity to optimise the fun out of it.
// ---------------------------------------------------------------------------
export const LAW = {
  maxStopMinutes: 15,           // in a residential zone
  sameSpotCooldownDays: 1,      // cannot occupy the same location twice in 24 hours
  vacatedRadius: 152,           // 500 feet from a location you recently vacated
  schoolRadius: 152,            // 500 feet, during school hours
  schoolHours: [8.0, 15.5],
  ticketNoise: 5000, ticketSchool: 10000, ticketSpot: 5000,
  impoundAt: 40000,             // the ticket-judgment meter. Visible for twenty days.
};

// ---------------------------------------------------------------------------
// THE SHARED FORMULAS — the "one function" rule.
// The sim reads these. The UI reads these. They cannot drift.
// ---------------------------------------------------------------------------

/** How well a house at distance d hears the song. 0 = not at all, 1 = point blank. */
export function hearAt(d) {
  if (d >= JINGLE.radius) return 0;
  const f = 1 - d / JINGLE.radius;
  return Math.pow(f, JINGLE.falloffPow);
}

/** Cold drained this second, given the day's state. Read by the sim AND the gauge. */
export function coldDrain(st) {
  let r = COLD.drainBase;
  if (st.windowOpen) r += COLD.drainWindow;
  if (st.moving) r += COLD.drainMoving;
  r += COLD.drainHeat * (st.heat || 0);
  return Math.max(0, r);
}

/**
 * Price reaction, in one place. > 0 = happy, ~0 = borderline, < 0 = too dear.
 * The customer's buy decision reads this. The face at the window reads this.
 * Route 9 tourists absorb $7; the trailer end of Birch tops out at $2.50 and the same
 * bar there earns REPUTATION instead of margin.
 */
export function priceReaction(ceilingCents, priceCents) {
  const c = Math.max(1, ceilingCents);
  return (c - priceCents) / c;
}

/** The face, derived from the same number. Never a second model. */
export function faceOf(r) {
  return r > 0.24 ? 'glad' : r > -0.01 ? 'fine' : r > -0.22 ? 'wince' : 'no';
}

/** Would they actually buy? Deterministic predicate — the expected-value answer. */
export function willBuy(ceilingCents, priceCents) {
  return priceReaction(ceilingCents, priceCents) > -0.12;
}

/** What you owe them back. Integer cents; negative means they're short. */
export function changeDue(tenderCents, priceCents) { return tenderCents - priceCents; }

/** Heat curve across the day. Real operators report sales DECLINE above 100F — there is
 *  an optimum hot band, not "hotter is better." Peaks mid-afternoon, eases off at dusk. */
export function heatAt(hour) {
  const p = (hour - 15.0) / 4.5;
  return Math.max(0, Math.min(1, 1 - p * p));
}

export const VERSION = 1;
