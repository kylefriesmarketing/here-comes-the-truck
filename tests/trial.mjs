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

function cell(label, policy, prices) {
  const runs = SEEDS.map(s => soakRun(s, { policy: { ...PINNED, ...policy }, prices }));
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
    rep: m(r => r.rep), heat: m(r => r.noiseHeat),
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

// The gamble has to cut both ways: a few more seconds must BUY something, and leaning on
// it all stop long must COST something. Either half missing and it isn't a decision.
if (g8.cameOut <= g0.cameOut) {
  problems.push('8 s of grace pulls no extra customers — the temptation does not exist, so the discipline is not a choice');
}
if (gMax.annoy <= g0.annoy || gMax.heat <= g0.heat) {
  problems.push('leaning on the song all stop long costs nothing — the law side of the mechanic is inert');
}

// =========================================================================
console.log('');
if (problems.length) {
  console.log(`*** ${problems.length} PROBLEM(S) ***`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log(`OK trials green - pricing has an interior optimum, the jingle gamble cuts both ways.  ${Date.now() - t0} ms\n`);
