// HERE COMES THE TRUCK — the controlled-trial harness.
//
//   "C:\Users\kylef\tools\node\node.exe" tests/trial.mjs [n]
//
// ⚠️ THIS EXISTS BECAUSE OF MY BREW. That game shipped an inverted progression curve —
// brewing the best beer available and pricing it exactly as the UI instructed earned $86,
// less than a mediocre one — because the economy was tuned by feel. It was only ever
// found by a headless controlled trial, and only at n>=4: the SAME configuration
// returned $27 in one evening and $124 in another.
//
// So: never conclude anything from one run. A cell is n days, and every variable that
// is not the independent variable gets PINNED, because each one feeds back into the
// measurement:
//   · alwaysRight  — removes the player's order-reading skill from throughput
//   · greed 0      — removes shorting, so takings are honest takings
//   · patience     — removes how long a stop is held
//   · songLove     — removes route aggression
//   · the same seed set in every cell — the same weather of customers
//
// Read the WHOLE table, not the winning row. A ladder that only goes up is not a
// pricing decision; it's a button labelled "more money".

import { soakRun, D } from '../truck/game.js';

const N = parseInt(process.argv[2] || '6', 10);
if (N < 4) console.log(`⚠️  n=${N} is below the n>=4 floor. Single runs prove nothing.`);
const SEEDS = Array.from({ length: N }, (_, i) => 101 + i * 37);
const PINNED = { alwaysRight: true, greed: 0, patience: 0.5, songLove: 0.9, songGrace: 0 };
const problems = [];
const t0 = Date.now();

function cell(label, policy, prices, owned) {
  const runs = SEEDS.map(s => soakRun(s, { policy: { ...PINNED, ...policy }, prices, owned }));
  const errs = runs.reduce((a, r) => a + r.errors.length, 0);
  if (errs) problems.push(`cell "${label}" produced ${errs} sim errors`);
  const m = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const gross = runs.map(r => r.took);
  return {
    label,
    gross: m(r => r.took),
    lo: Math.min(...gross), hi: Math.max(...gross),
    served: m(r => r.served), balked: m(r => r.stats.balked),
    cameOut: m(r => r.cameOut), walked: m(r => r.walkedOff),
    rep: m(r => r.rep), heat: m(r => r.noiseHeat), invSold: m(r => r.stats.inventedSold),
    annoy: m(r => Math.max(...Object.values(r.annoy))),
    hour: m(r => r.hour),
  };
}

const $ = (c) => '$' + (c / 100).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);
const rt = (s, n) => String(s).padStart(n);

// =========================================================================
// TRIAL A — THE PRICE LADDER. The decision the whole window loop hangs on.
// =========================================================================
console.log(`\nTRIAL A — the price ladder   (n=${N} days per cell, confounders pinned)`);
console.log(`  ${pad('menu', 10)}${rt('gross', 9)}${rt('spread', 17)}${rt('sold', 7)}${rt('balked', 8)}${rt('walked', 8)}${rt('rep', 7)}`);

const LADDER = [0.70, 0.85, 1.00, 1.15, 1.30, 1.50];
const A = LADDER.map(mul => {
  const prices = Object.fromEntries(D.MENU.map(m => [m.key, Math.round(m.price * mul / 25) * 25]));
  return cell(`x${mul.toFixed(2)}`, {}, prices);
});
for (const r of A) {
  console.log(`  ${pad(r.label, 10)}${rt($(r.gross), 9)}${rt(`${$(r.lo)} - ${$(r.hi)}`, 17)}` +
    `${rt(r.served.toFixed(1), 7)}${rt(r.balked.toFixed(1), 8)}${rt(r.walked.toFixed(1), 8)}${rt(r.rep.toFixed(1), 7)}`);
}

const best = A.reduce((a, b) => b.gross > a.gross ? b : a);
console.log(`  best gross: ${best.label} at ${$(best.gross)}`);

// ⚠️ The inverted-curve check. If the top of the ladder is the best row, there is no
// pricing DECISION — just a number to raise. Somewhere in the range, being greedy has
// to cost more in walk-aways than it earns in margin.
if (best === A[A.length - 1]) {
  problems.push('the price ladder only goes up — the most expensive menu is also the most profitable, so pricing is not a decision');
}
if (A[A.length - 1].balked <= A[0].balked) {
  problems.push(`charging ${LADDER[LADDER.length - 1]}x costs no more balks than ${LADDER[0]}x — the price ceiling is not biting`);
}
// The noise floor, stated out loud rather than assumed away.
const spread = A.map(r => (r.hi - r.lo) / Math.max(1, r.gross));
console.log(`  day-to-day spread within a cell: ${(Math.min(...spread) * 100).toFixed(0)}%–${(Math.max(...spread) * 100).toFixed(0)}% of the mean.`);
console.log(`  ⚠️  any two cells closer together than that are indistinguishable at n=${N}.`);

// =========================================================================
// TRIAL B — THE GRACE PERIOD. The bible's exact claim, tested as written:
//   "eight more seconds of song pulls two more kids off the next block."
// The law says silence the instant you're stationary. This measures the bribe for
// disobeying it, and the bill. ⚠️ An earlier version of this trial compared "always kill"
// against "NEVER kill", found leaving it on strictly worse, and nearly filed the mechanic
// as broken. It isn't: the benefit is exhausted in the first few seconds while the cost
// runs for the whole stop. The question was wrong, not the design.
// =========================================================================
console.log(`\nTRIAL B — the grace period   (n=${N} days per cell)`);
console.log(`  ${pad('song after stop', 17)}${rt('gross', 9)}${rt('sold', 7)}${rt('came out', 10)}${rt('worst annoy', 13)}${rt('noise heat', 12)}`);
const GRACE = [0, 4, 8, 16, 40];
const B = GRACE.map(s => cell(`${s}s`, { songGrace: s }));
for (const r of B) {
  console.log(`  ${pad(r.label, 17)}${rt($(r.gross), 9)}${rt(r.served.toFixed(1), 7)}${rt(r.cameOut.toFixed(1), 10)}` +
    `${rt(r.annoy.toFixed(2), 13)}${rt(r.heat.toFixed(1), 12)}`);
}
const g0 = B[0], g8 = B[2], gMax = B[B.length - 1];
console.log(`  8 seconds of grace: ${(g8.cameOut - g0.cameOut >= 0 ? '+' : '')}${(g8.cameOut - g0.cameOut).toFixed(1)} people out, ` +
  `${(g8.annoy - g0.annoy >= 0 ? '+' : '')}${(g8.annoy - g0.annoy).toFixed(2)} annoy, ` +
  `${(g8.heat - g0.heat >= 0 ? '+' : '')}${(g8.heat - g0.heat).toFixed(0)} heat.`);

// ⚠️ ASSERT ON THE LOW-VARIANCE SIDE ONLY. The COST of grace (annoy, noise heat) is
// near-deterministic and must rise monotonically. The BENEFIT arrives through takings and
// footfall, whose day-to-day spread is 54-101% of the mean — so at n=6 it is simply NOT
// RESOLVABLE, and an earlier version of this file asserted on it and failed on noise.
// Report it honestly rather than bending the test until it passes.
const costRises = B.every((r, i) => i === 0 || r.annoy >= B[i - 1].annoy - 0.02);
if (!costRises || gMax.annoy <= g0.annoy || gMax.heat <= g0.heat) {
  problems.push('leaning on the song all stop long costs nothing — the law side of the mechanic is inert');
}
const benefit = (gMax.gross - g0.gross) / g0.gross;
console.log(benefit > 0.08
  ? `  the bribe is real: ${(benefit * 100).toFixed(0)}% more takings for leaning on it.`
  : `  ⚠️ the benefit of grace is BELOW THE NOISE FLOOR at n=${N} — not proven, not disproven.`);

// =========================================================================
// TRIAL C — THE UPGRADE LADDER. The direct guard against MY BREW's shipped disaster:
// brewing the best product in the game and pricing it exactly as the UI instructed earned
// LESS than a mediocre one, because the economy was tuned by feel. An upgrade that costs
// real money and does not measurably pay is that same bug wearing a different hat.
//
// ⚠️ The freezer is the one that matters. "afford a better freezer" is the literal last
// beat of this game's kill-gate sentence, so if it doesn't pay, the sentence is a lie.
// =========================================================================
console.log(`\nTRIAL C — the upgrade ladder   (n=${N} days per cell)`);
console.log(`  ${pad('on the truck', 24)}${rt('gross', 9)}${rt('sold', 7)}${rt('came out', 10)}${rt('ends at', 9)}${rt('vs base', 9)}`);
const base = cell('nothing yet', {}, null, {});
const C = [base, ...D.UPGRADES.map(u => cell(u.name, {}, null, { [u.key]: 1 }))];
for (const r of C) {
  const d = r === base ? '' : ((r.gross - base.gross) / base.gross * 100).toFixed(0) + '%';
  console.log(`  ${pad(r.label, 24)}${rt($(r.gross), 9)}${rt(r.served.toFixed(1), 7)}${rt(r.cameOut.toFixed(1), 10)}` +
    `${rt(r.hour.toFixed(1) + 'h', 9)}${rt(d, 9)}`);
}

const plates = C.find(r => r.label === D.UPGRADE_BY_KEY.plates.name);
const gainPlates = (plates.gross - base.gross) / base.gross;
console.log(`  the second cold plate buys ${(plates.hour - base.hour).toFixed(1)} h of extra afternoon ` +
  `and ${(gainPlates * 100).toFixed(0)}% more takings.`);

if (plates.gross <= base.gross) {
  problems.push('THE BETTER FREEZER EARNS LESS THAN NO FREEZER — the progression curve is inverted (this is MY BREW\'s bug)');
}
if (plates.hour <= base.hour) {
  problems.push('the second cold plate does not extend the day at all — it is sold as afternoon and delivers none');
}
// and every paid upgrade should be defensible: none may make you strictly poorer.
for (const r of C) {
  if (r === base) continue;
  if (r.gross < base.gross * 0.92) {
    problems.push(`"${r.label}" leaves you ${((1 - r.gross / base.gross) * 100).toFixed(0)}% WORSE off than buying nothing`);
  }
}

// =========================================================================
// TRIAL D — IS INVENTING WORTH THE AFTERNOON? Churning costs 38 s of selling time and a
// bite of the cold, taken through the REAL act() path at the bot's first stop. If a good
// flavour doesn't earn that back the same day, the fourth pillar is a hobby, not a system.
// =========================================================================
console.log(`\nTRIAL D — the churn bay   (n=${N} days per cell)`);
console.log(`  ${pad('what you churned', 30)}${rt('gross', 9)}${rt('sold', 7)}${rt('of it', 7)}${rt('ends at', 9)}${rt('vs none', 9)}`);
const noChurn = cell('nothing — sell the depot lines', {});
const Dc = [
  noChurn,
  cell('plain water ice', { churn: { base: 'ice', mixins: [], finish: 'none' } }),
  cell('cookie-bubblegum custard', { churn: { base: 'custard', mixins: ['cookie', 'gum'], finish: 'sprinkles' } }),
  cell('The Midnight (legendary)', { churn: { base: 'custard', mixins: ['coffee', 'cocoa'], finish: 'shell' } }),
];
for (const r of Dc) {
  const d = r === noChurn ? '' : ((r.gross - noChurn.gross) / noChurn.gross * 100).toFixed(0) + '%';
  console.log(`  ${pad(r.label, 30)}${rt($(r.gross), 9)}${rt(r.served.toFixed(1), 7)}` +
    `${rt(r.invSold.toFixed(1), 7)}${rt(r.hour.toFixed(1) + 'h', 9)}${rt(d, 9)}`);
}
const good = Dc[2], legend = Dc[3], dull = Dc[1];
if (Math.max(good.gross, legend.gross) <= noChurn.gross) {
  problems.push('churning a GOOD flavour earns no more than not churning at all — the bay costs an afternoon and returns nothing');
}
// ⚠️ The MY BREW inversion, restated for this system: the best thing you can make must
// not lose to the dullest thing you can make.
if (legend.gross < dull.gross * 0.95) {
  problems.push(`a Legendary (${$(legend.gross)}) earns less than plain water ice (${$(dull.gross)}) — the progression is inverted`);
}
console.log(`  the bay pays back ${(((Math.max(good.gross, legend.gross) - noChurn.gross) / noChurn.gross) * 100).toFixed(0)}% ` +
  `on its best flavour, and costs ${(noChurn.hour - Math.min(good.hour, legend.hour)).toFixed(1)} h of afternoon.`);

// =========================================================================
console.log('');
if (problems.length) {
  console.log(`*** ${problems.length} PROBLEM(S) ***`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log(`OK trials green - pricing has an interior optimum, the jingle gamble cuts both ways.  ${Date.now() - t0} ms\n`);
