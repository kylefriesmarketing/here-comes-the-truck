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
// ⚠️ A REAL STEP VAN, not FRESH CUT's 4.6 m background prop. You now WALK AROUND INSIDE
// this thing, so it has to have an interior you can cross: 5.6 x 2.15 gives a ~5.2 m
// aisle at 1.85 m wide. Real operators call it "the cramped, freezing reality" — cramped
// is the feature, but a 4.6 m box with no floor to stand on is not a place.
export const TRUCK = {
  len: 5.6, wide: 2.15, high: 3.1,
  wheelbase: 3.40,
  axleFront: 1.90, axleRear: -1.70,  // local z of each axle, for the two collision circles
  bodyR: 1.30,                        // collision circle radius at each axle

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
// `melt` is melt-RESISTANCE: high survives a warm box. It is the same stat the churn bay
// produces, so an invented flavour and a depot line are judged by exactly one rule.
export const MENU = [
  // key      label                    price cost  cold  kid  adult  melt   (cost/price = food cost %)
  { key: 'eyes',  label: 'the one with the eyes', price: 250, cost: 105, cold: 0.9, kid: 1.00, adult: 0.15, rep: 1.35, melt: 0.75 },
  { key: 'bomb',  label: 'a bomb pop',            price: 200, cost:  68, cold: 0.8, kid: 0.90, adult: 0.25, rep: 1.10, melt: 0.55 },
  { key: 'scoop', label: 'a scoop',               price: 300, cost:  63, cold: 1.2, kid: 0.60, adult: 0.70, rep: 1.00, melt: 0.45 },
  { key: 'cone',  label: 'a soft serve cone',     price: 350, cost:  60, cold: 1.4, kid: 0.50, adult: 1.00, rep: 0.85, melt: 0.35 },
  { key: 'pop',   label: 'a freeze pop',          price: 100, cost:  30, cold: 0.5, kid: 0.80, adult: 0.20, rep: 1.20, melt: 0.65 },
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
// What they call something you invented this afternoon. They have no name for it yet.
export const INVENTED_ORDERS = {
  kid: ['the new one', 'the one you made', 'whatever that one is', 'that one. the one there.'],
  adult: ['whatever the new one is', "i'll try the new one", 'the one on the board there'],
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
// THE TRUCK IS A PLACE YOU STAND IN (bible §4 and §7).
//
// §7: "The window is a deliberately cramped topology — freezer hatch, soft-serve spigot,
// topping caddy, register, and the window itself all competing for one pair of hands.
// That's Overcooked's real lesson: THE KITCHEN IS THE ANTAGONIST."
//
// So every item is a PLACE, not a menu row. Walking to the right one IS getting the order
// right, and getting it wrong is walking to the wrong one. Overcooked does the whole game
// on one movement stick and one interact button; so does this.
//
// ⚠️ THE LAYOUT DELIBERATELY VIOLATES THE KITCHEN WORK TRIANGLE. Overcooked's levels are
// built to break it on purpose, because an efficient kitchen is not a game. The bars the
// kids want are FORWARD-left, the soft serve the adults want is BACK-left, and the window
// is between them — so a busy queue makes you walk the length of your own truck.
//
// Coordinates are TRUCK-LOCAL: +z forward, +x is the truck's LEFT (right = -localX, see
// view.js). The crew rides in this frame, so when the truck moves they move with it for
// free — no re-parenting, no drift.
// ---------------------------------------------------------------------------
export const CREW = {
  walkSpeed: 1.55,          // m/s. You are squeezing past a freezer, not jogging.
  eye: 1.62,
  reach: 0.95,              // how close you must stand to use a station
  facing: 0.35,             // and how squarely you must be looking at it (cos ~70 degrees)
  aisle: { x0: -0.72, x1: 0.72, z0: -2.30, z1: 1.55 },   // where your feet may go
  seatZ: 2.05,              // the seat is forward of the aisle; sitting teleports you there
};

export const STATIONS = [
  // the driver's seat — sitting here IS driving. It is a station like any other.
  { id: 'seat', label: "the driver's seat", verb: 'sit down and drive', x: 0.46, z: 1.95, kind: 'seat' },
  { id: 'clipboard', label: 'the clipboard', verb: 'pick up the clipboard', x: -0.40, z: 1.85, kind: 'clip' },

  // THE FREEZER CHEST — three bins, forward-left, lids you reach into. These are the
  // lines children ask for, and they are the FURTHEST from the soft serve on purpose.
  { id: 'bin_eyes', label: 'the character bars', verb: 'take one', x: 0.68, z: 1.15, kind: 'take', item: 'eyes' },
  { id: 'bin_bomb', label: 'the bomb pops', verb: 'take one', x: 0.68, z: 0.50, kind: 'take', item: 'bomb' },
  { id: 'bin_pop', label: 'the freeze pops', verb: 'take one', x: 0.68, z: -0.15, kind: 'take', item: 'pop' },

  // THE WINDOW — on the kerb side, mid-truck, between the two ends you run between.
  { id: 'window', label: 'the window', verb: 'hand it over', x: -0.68, z: -0.10, kind: 'window' },

  // the scoop tub, further back down the left wall
  { id: 'tub_scoop', label: 'the tub', verb: 'scoop one', x: 0.68, z: -0.90, kind: 'take', item: 'scoop' },
  // whatever you invented comes out of the churn barrel's own tub
  { id: 'tub_new', label: 'what you made', verb: 'take one', x: 0.68, z: -1.65, kind: 'takeNew' },
  // THE SOFT-SERVE SPIGOT — back on the window side: the best margin in the game and the
  // longest walk from the bars the children want. This is the work triangle, broken.
  { id: 'spigot', label: 'the soft serve', verb: 'pull the handle', x: -0.68, z: -1.55, kind: 'take', item: 'cone' },
  { id: 'churn', label: 'the churn machine', verb: 'work the machine', x: 0.10, z: -2.25, kind: 'churn' },
];
export const STATION_BY_ID = Object.fromEntries(STATIONS.map(s => [s.id, s]));

// ---------------------------------------------------------------------------
// THE CHURN BAY (bible §10) — the fourth pillar, "invent the treats".
// It lives in the back of the truck: park, turn around, three steps. No lab screen.
//
// Every recipe resolves to FOUR STATS and nothing else:
//   sweet — what children want
//   novel — what adults want, and what a street will pay over the odds for
//   melt  — how long it survives once the box starts losing its cold
//   cost  — what it costs you to make, in cents
//
// ⚠️ THE COMEDY AXIS IS SUGAR-MAXIMALISM AND CHILDHOOD CHAOS, never gross-out. MY BREW
// already owns "revolting thing in the product"; if this game's jokes are also that, it
// reads as a reskin of the brewery. Nothing here is disgusting. It is just too much.
// ---------------------------------------------------------------------------
export const BASES = [
  { key: 'custard', label: 'custard', sweet: 0.55, novel: 0.30, melt: 0.70, cost: 55 },
  { key: 'soft', label: 'soft serve', sweet: 0.45, novel: 0.25, melt: 0.45, cost: 42 },
  { key: 'ice', label: 'water ice', sweet: 0.35, novel: 0.35, melt: 0.30, cost: 26 },
  { key: 'bar', label: 'bar', sweet: 0.60, novel: 0.20, melt: 0.80, cost: 48 },
];
export const MIXINS = [
  { key: 'cocoa', label: 'chocolate', sweet: 0.10, novel: 0.08, melt: 0.05, cost: 14 },
  { key: 'peanut', label: 'peanut', sweet: 0.06, novel: 0.14, melt: 0.10, cost: 18 },
  { key: 'straw', label: 'strawberry', sweet: 0.12, novel: 0.06, melt: -0.04, cost: 12 },
  { key: 'banana', label: 'banana', sweet: 0.09, novel: 0.11, melt: 0.02, cost: 11 },
  { key: 'mint', label: 'mint', sweet: 0.04, novel: 0.16, melt: 0.03, cost: 10 },
  { key: 'cookie', label: 'cookie', sweet: 0.14, novel: 0.12, melt: 0.08, cost: 19 },
  { key: 'coffee', label: 'coffee', sweet: -0.06, novel: 0.22, melt: 0.02, cost: 16 },
  { key: 'gum', label: 'bubblegum', sweet: 0.20, novel: 0.18, melt: -0.02, cost: 13 },
];
export const FINISHES = [
  { key: 'none', label: 'plain', suffix: '', sweet: 0, novel: 0, melt: 0, cost: 0 },
  { key: 'shell', label: 'a chocolate shell', suffix: ', dipped', sweet: 0.06, novel: 0.10, melt: 0.16, cost: 15 },
  { key: 'sprinkles', label: 'sprinkles', suffix: ', with sprinkles', sweet: 0.10, novel: 0.12, melt: 0.00, cost: 9 },
  { key: 'sauce', label: 'sauce', suffix: ', with sauce', sweet: 0.18, novel: 0.06, melt: -0.12, cost: 12 },
];
export const BASE_BY_KEY = Object.fromEntries(BASES.map(b => [b.key, b]));
export const MIXIN_BY_KEY = Object.fromEntries(MIXINS.map(m => [m.key, m]));
export const FINISH_BY_KEY = Object.fromEntries(FINISHES.map(f => [f.key, f]));

// ⚠️ SECRET. Never listed in the UI — found by experimenting, and by Cy saying something
// that turns out not to be small talk. A Legendary is a FLOOR PLUS A BONUS, never an
// override: MY BREW's legendary branch REPLACED the score and capped it below what a
// plain two-ingredient recipe could reach, which made its entire discovery fantasy
// mechanically pointless. A deliberately dull recipe stays dull; a good one gets lifted.
export const LEGENDARIES = [
  { id: 'midnight', name: 'The Midnight', base: 'custard', mixins: ['coffee', 'cocoa'], finish: 'shell',
    floor: { novel: 0.92, melt: 0.80 }, hint: "cy: 'somebody used to do a coffee one. adults only. dipped.'" },
  { id: 'summer', name: 'The Whole Summer', base: 'ice', mixins: ['gum', 'straw'], finish: 'sprinkles',
    floor: { sweet: 0.98, novel: 0.75 }, hint: "cy: 'the pink one with the gum in it. every kid on birch, for a whole july.'" },
  { id: 'lunchbox', name: 'The Lunchbox', base: 'bar', mixins: ['peanut', 'cookie'], finish: 'sauce',
    floor: { sweet: 0.90, novel: 0.85, melt: 0.72 }, hint: "cy: 'peanut and a cookie, on a stick. the men at vance used to buy two.'" },
];

export const CHURN = {
  seconds: 38,          // sim-seconds in the bay — about half an hour of the afternoon
  coldCost: 0.030,      // the machine runs off the same box you are selling out of
  batch: 8,             // how many you get
  maxMixins: 2,
  targetFoodCost: 0.32, // what the suggested price is worked back from
  meltSpan: 1.30,       // see softFor(): melt 1.0 survives to ~0.3x the normal threshold
};

// ---------------------------------------------------------------------------
// THE TRUCK, IMPROVED (bible §19 invariant 8: the first meaningful upgrade must land
// inside 45 minutes — Death Stranding's first real upgrade arrives at hour seven and it
// is the most-cited flaw in an otherwise beloved game).
//
// The freezer is FIRST and cheapest on purpose: "afford a better freezer" is the literal
// last beat of the kill-gate sentence, so it has to be reachable on day two or three.
// ---------------------------------------------------------------------------
export const UPGRADES = [
  { key: 'plates', name: 'a second cold plate', cost: 6500, sub: 'the box holds the afternoon instead of losing it',
    mod: { coldMul: 0.76 } },
  { key: 'horn', name: 'the good speaker horn', cost: 5200, sub: 'they hear you a street earlier',
    mod: { radiusMul: 1.28 } },
  { key: 'hatch', name: 'the wide hatch', cost: 8000, sub: 'you can work two of them at once',
    mod: { queueAdd: 2, serveMul: 0.82 } },
  // ⚠️ speedMul ALONE measured at exactly 0% — the day is limited by COLD, not by
  // distance, so going faster buys you nothing you can sell. A cooler engine bay under
  // the box is the real reason to pay a mechanic, and it's physically why these trucks
  // idle badly in August. Never ship an upgrade the trial can't distinguish from nothing.
  { key: 'engine', name: 'a look at the engine', cost: 7000, sub: 'cy knows a man. the man is not cheap',
    mod: { speedMul: 1.18, coldMul: 0.93 } },
  { key: 'board', name: 'a proper menu board', cost: 4500, sub: 'nobody argues with a price that is painted on',
    mod: { ceilingAdd: 45 } },
  // ⚠️ stockAdd alone also measured 0%, because you started the day with more of every
  // item than you could possibly sell — so "more room" was room you never used. Base
  // stock is now tight enough that the popular lines actually run dry, which is what
  // makes a bigger box worth money AND what makes loading it a decision.
  { key: 'chest', name: 'the deep chest', cost: 9500, sub: 'more of everything, and it all has to sell',
    mod: { stockAdd: 9, coldMul: 0.95 } },
];
export const UPGRADE_BY_KEY = Object.fromEntries(UPGRADES.map(u => [u.key, u]));

/** ⚠️ ONE function. The sim's behaviour and the clipboard's blurb both read this, so a
 *  bought upgrade can never say one thing and do another. */
export function mods(owned) {
  const m = { coldMul: 1, radiusMul: 1, queueAdd: 0, serveMul: 1, speedMul: 1, ceilingAdd: 0, stockAdd: 0 };
  for (const u of UPGRADES) {
    if (!owned || !owned[u.key]) continue;
    for (const k in u.mod) m[k] = (k.endsWith('Mul')) ? m[k] * u.mod[k] : m[k] + u.mod[k];
  }
  return m;
}

// ---------------------------------------------------------------------------
// THE REGULARS — the emotional core (bible §9). Four strings each, the FRESH CUT
// architecture that makes forty people memorable, transposed.
//   arrive — what they say when you pull up
//   mid    — one line during the summer, once
//   reply  — the last thing you read at the end of a day
//   payoff — the day you finally do the specific thing that matters to them
// ⚠️ P3: THE LOOP ENDS ON A PERSON, NOT A NUMBER. The day-end card reads a reply.
// ---------------------------------------------------------------------------
export const REGULARS = [
  {
    id: 'bell', who: 'MR BELL', house: 'chestnut-s2', kid: false, wants: 'scoop', buysTwo: true,
    arrive: 'two, please. the same as always.',
    mid: 'she liked the orange ones. i don\'t, particularly.',
    reply: 'mr bell put the second one on the wall by the gate. it was gone by morning. it always is.',
    payoff: 'he said thank you by name today. yours, not hers. that took all summer.',
  },
  {
    id: 'marge', who: 'MARGE', house: 'maple-s1', kid: false, wants: 'cone',
    arrive: "you're too thin. are you eating properly?",
    mid: "i've got peonies coming. don't let me forget.",
    reply: 'marge waved from the porch with the light already off, which is how you know she watched you go.',
    payoff: 'there was a foil parcel on the sill of your window. you did not see her put it there.',
  },
  {
    id: 'kowalskis', who: 'THE KOWALSKI KIDS', house: 'maple-s3', kid: true, wants: 'eyes', alwaysShort: 20,
    arrive: "we've got— hang on. we've got—",
    mid: 'the little one has been saving. he wants you to know he has been saving.',
    reply: 'the kowalski kids were twenty cents short again. they will be tomorrow, too.',
    payoff: 'they had it. all of it, in a sock, counted twice. they made you count it as well.',
  },
  {
    id: 'whitfield', who: 'COACH WHITFIELD', house: 'birch-n2', kid: false, wants: 'pop', buysBench: true,
    arrive: "we won. twelve of them. what've you got that's cheap.",
    mid: 'lines. that\'s all it is. you hold your line and the rest sorts itself.',
    reply: "you can hear the score from two streets away by whether coach is out on the kerb.",
    payoff: 'he introduced you to the bench by name. all twelve of them shook your hand. it took a while.',
  },
  {
    id: 'cy', who: 'CY', house: 'maple-s5', kid: false, wants: 'bomb', exactAlways: true,
    arrive: "you're driving too fast. not for the road. for the job.",
    mid: "kowalski kids only got quarters after four. before four they got nothing and they'll stand there anyway.",
    reply: 'cy paid with exact change, the way he has for thirty-one years, and did not say how you did.',
    payoff: 'cy did not correct you today. he asked how it went, and then he waited for the answer.',
  },
];
export const REGULAR_BY_HOUSE = Object.fromEntries(REGULARS.map(r => [r.house, r]));

// ⚠️ EVERY REGULAR LIVES ON THE KERB SIDE OF THE ROUTE'S DIRECTION OF TRAVEL. The serving
// window is always on the truck's right, and the loop is one-way, so the far side of each
// street is structurally under-served — measured: a regular on the wrong side came out
// 13-16 times across 8 days and was served ZERO times, while one on the near side was
// served 16 out of 16. That is realistic (you work one side, then come back), and it is
// exactly what Cy's route sheet is FOR — but it means regular placement is not free.
// Kerb side by street: maple 's' · sycamore 'n' · birch 'n' · chestnut 's'.

// ⚠️ A REGULAR IS NOT A RANDOM HOUSE. They are listening for you, so they come out on
// half the song a stranger needs, and they will wait twice as long once they're out.
// Without this the battery measured 3 of 5 named regulars going UNMET across 24 days —
// only ~30% of the people who come out ever get served, and five specific doors out of
// forty-eight is a thin lottery. The emotional core cannot be left to chance.
export const REGULAR = {
  heardMul: 0.5,        // they hear you a street earlier than anyone else
  patienceMul: 2.2,     // and they'll stand there
  payoffAt: 5,          // visits before their payoff line replaces their usual reply
};

// CY'S ROUTE SHEET (bible §8) — one line of somebody else's handwriting per block, doing
// three jobs at once: characterising him, teaching the technique, previewing the level.
export const ROUTE_SHEET = {
  maple: "maple's the whole job. work it slow, don't lean on the song at the top end — the man at number four sleeps days.",
  birch: "birch tops out at two-fifty and always has. sell there for the goodwill, not the money.",
  chestnut: 'chestnut you drive, you do not park. nobody comes out and the corner is a ticket waiting to happen.',
  sycamore: "sycamore's the money. they'll pay what you ask and they won't remember you for it.",
};

// ---------------------------------------------------------------------------
// THE SHARED FORMULAS — the "one function" rule.
// The sim reads these. The UI reads these. They cannot drift.
// ---------------------------------------------------------------------------

/** How well a house at distance d hears the song. 0 = not at all, 1 = point blank.
 *  `radius` comes from JINGLE.radius x the speaker upgrade — pass the EFFECTIVE one. */
export function hearAt(d, radius = JINGLE.radius) {
  if (d >= radius) return 0;
  return Math.pow(1 - d / radius, JINGLE.falloffPow);
}

/** Cold drained this second, given the day's state. Read by the sim AND the gauge.
 *  `st.coldMul` is the freezer upgrade — the whole drain scales, which is why a second
 *  cold plate buys you AFTERNOON rather than a bigger number on a bar. */
export function coldDrain(st) {
  let r = COLD.drainBase;
  if (st.windowOpen) r += COLD.drainWindow;
  if (st.moving) r += COLD.drainMoving;
  r += COLD.drainHeat * (st.heat || 0);
  return Math.max(0, r) * (st.coldMul === undefined ? 1 : st.coldMul);
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

// ---------------------------------------------------------------------------
// THE RECIPE FORMULAS. ⚠️ The bay's live readout and the actual sale both read these,
// so the four bars you watch while churning cannot lie about what you are making.
// ---------------------------------------------------------------------------

/** base + up to two mix-ins + a finish -> {sweet, novel, melt, cost, legend}.
 *  `noFloor` exists ONLY so the battery can prove the legendary floor never LOWERS a
 *  stat — that is the exact bug MY BREW shipped, and it needs a test that cannot be
 *  fooled by a reimplementation of this formula drifting out of sync with it. */
export function recipeStats(recipe, noFloor) {
  const b = BASE_BY_KEY[recipe.base] || BASES[0];
  const fin = FINISH_BY_KEY[recipe.finish] || FINISHES[0];
  const mix = (recipe.mixins || []).map(k => MIXIN_BY_KEY[k]).filter(Boolean);
  const s = { sweet: b.sweet, novel: b.novel, melt: b.melt, cost: b.cost };
  for (const m of [...mix, fin]) {
    s.sweet += m.sweet; s.novel += m.novel; s.melt += m.melt; s.cost += m.cost;
  }
  // two of the same note is less interesting than two different ones
  if (mix.length === 2 && mix[0].key === mix[1].key) s.novel -= 0.10;
  s.sweet = Math.max(0, Math.min(1.2, s.sweet));
  s.novel = Math.max(0, Math.min(1.2, s.novel));
  s.melt = Math.max(0.05, Math.min(1.0, s.melt));

  // ⚠️ FLOOR, not override. A cursed recipe stays cursed; a good one gets lifted.
  const leg = noFloor ? null : legendaryFor(recipe);
  if (leg) {
    for (const k in leg.floor) s[k] = Math.max(s[k], leg.floor[k]);
    s.legend = leg.id;
  }
  return s;
}

/** Does this exact recipe match a secret? Mix-in order must not matter. */
export function legendaryFor(recipe) {
  const mine = [...(recipe.mixins || [])].sort().join('|');
  return LEGENDARIES.find(l =>
    l.base === recipe.base && l.finish === recipe.finish && [...l.mixins].sort().join('|') === mine) || null;
}

/** "chocolate-coffee custard, dipped" — composed, so every invention names itself. */
export function flavourName(recipe) {
  const leg = legendaryFor(recipe);
  if (leg) return leg.name;
  const b = BASE_BY_KEY[recipe.base] || BASES[0];
  const mix = (recipe.mixins || []).map(k => MIXIN_BY_KEY[k]).filter(Boolean);
  const fin = FINISH_BY_KEY[recipe.finish] || FINISHES[0];
  const front = mix.length ? mix.map(m => m.label).join('-') + ' ' : 'plain ';
  return front + b.label + fin.suffix;
}

/** Who wants it. These feed the same kid/adult fields the stock menu uses. */
export function kidAppeal(s) { return Math.max(0, Math.min(1.2, 0.28 + s.sweet * 0.80)); }
export function adultAppeal(s) { return Math.max(0, Math.min(1.2, 0.14 + s.novel * 0.98)); }

/** What a novel flavour lets you charge over a street's usual ceiling, in cents. */
export function ceilingBonus(s) { return Math.round(Math.max(0, s.novel - 0.45) * 190); }

/** Worked back from food cost, to the nearest quarter. The bay shows this number. */
export function suggestedPrice(s) {
  return Math.max(50, Math.round(s.cost / CHURN.targetFoodCost / 25) * 25);
}

/**
 * The cold level below which THIS item goes soft.
 * ⚠️ Per item, not global. A 0.8-melt bar is still worth full price at a cold the water
 * ice gave up on an hour ago — which is the whole reason melt-resistance is a stat you
 * would trade sweetness for, and it is what ties the flavour lab to the cold budget.
 */
export function softBelow(melt) { return COLD.softAt * (CHURN.meltSpan - melt); }

/** Heat curve across the day. Real operators report sales DECLINE above 100F — there is
 *  an optimum hot band, not "hotter is better." Peaks mid-afternoon, eases off at dusk. */
export function heatAt(hour) {
  const p = (hour - 15.0) / 4.5;
  return Math.max(0, Math.min(1, 1 - p * p));
}

export const VERSION = 1;
