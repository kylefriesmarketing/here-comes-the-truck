// HAZEL PARK — the canonical map.
//
// ⚠️ THIS MODULE HAS ZERO IMPORTS, ON PURPOSE. It is pure data plus pure functions.
// Hazel Park is FRESH CUT's town and every future Dirty Boy Devs game set here inherits
// this file. Kyle's call 2026-08-11: it lives in this game for now and is BUILT TO LIFT —
// when a second game wants it, moving it to kylefriesmarketing/hazel-park is a file copy
// and one import line. Don't entangle it. Don't import data.js from here.
//
// FRESH CUT builds each job as an isolated lot with a procedural backdrop; there is no
// coordinate space above the lot and no streets you can drive down. This file is the
// first one. Do not contradict established canon: Maple St, Birch St, Route 9, Miller
// Creek, Water Tower Hill, the Commons, the Bakehouse, the Starlite, Cutter Field,
// Shady Pines, the Speedway, the Quarry, the world's second-largest ball of twine.
//
// ---------------------------------------------------------------------------
// THE CROSS-SECTION, reused from FRESH CUT verbatim — and MIRRORED to both sides.
//
// FRESH CUT measures from a lot's front edge going -Z, and only the player's side has a
// sidewalk (mow/street.js:8-12):
//     -0.3 … -1.9  sidewalk    -1.9 … -6.9  road    -6.9 … -9.2  lawns    -9.2  fronts
// Its road centre therefore sits 4.4 out, lanes at +/-1.2 of that. Restated from the
// CENTRELINE and mirrored so people can walk out on both sides of a street you drive
// down, every band width is preserved exactly: road 5.0, sidewalk 1.6, lawn 2.3.
// That is a mirror, not a drift. Anyone auditing this against FRESH CUT: check widths.
// ---------------------------------------------------------------------------
export const XS = {
  roadHalf: 2.5,     // road spans +/-2.5 of the centreline  (5.0 m, two lanes)
  laneOff: 1.2,      // lane centres                          (FRESH CUT LANE_NEAR/FAR)
  kerb: 2.5,
  walkOut: 4.1,      // sidewalk 2.5 -> 4.1                   (1.6 m)
  lawnOut: 6.4,      // lawn      4.1 -> 6.4                  (2.3 m)
  houseFront: 6.4,   // house fronts
  houseDepth: 4.6,
  houseWide: 8.2,
};

// ---------------------------------------------------------------------------
// PHASE 0 GRAYBOX — four blocks of the Maple/Birch neighbourhood, as a LOOP.
//
// A loop rather than a strip on purpose: the ordinance design (§8 — 500 ft from a spot
// you just vacated, no same location twice in 24 h) needs corners to be interesting,
// and a strip forces a U-turn every thirty seconds, which is the exact opposite of
// "driving is never the gap between the fun parts."
//
// Districts are per bible §2. Phase 0 only builds the suburb heart.
// ---------------------------------------------------------------------------

// Streets: axis 'x' runs east-west (centreline at constant z), 'z' runs north-south.
export const STREETS = [
  { id: 'maple',    name: 'Maple St',     axis: 'x', at:   0, from: -72, to:  72, ceiling: 300 },
  { id: 'birch',    name: 'Birch St',     axis: 'x', at:  88, from: -72, to:  72, ceiling: 250 },
  { id: 'chestnut', name: 'Chestnut Ave', axis: 'z', at: -72, from:   0, to:  88, ceiling: 285 },
  { id: 'sycamore', name: 'Sycamore Ave', axis: 'z', at:  72, from:   0, to:  88, ceiling: 340 },
];

// A BLOCK is one run of street between intersections — the unit ANNOYED accumulates on,
// and the unit the 24-hour cooldown burns. Four of them, one per street here.
// `ceiling` is the price tolerance in cents, learned by playing. Sycamore is the corner
// nearer Route 9 and absorbs more; the Birch end is the trailer end and tops out low.
export const BLOCKS = STREETS.map(s => ({
  id: s.id, name: s.name, street: s.id, ceiling: s.ceiling,
}));

/** Distance from a point to a street's centreline, and how far along it you are. */
export function onStreet(s, x, z) {
  if (s.axis === 'x') {
    const along = Math.max(s.from, Math.min(s.to, x));
    return { off: Math.abs(z - s.at), along, overrun: Math.abs(x - along) };
  }
  const along = Math.max(s.from, Math.min(s.to, z));
  return { off: Math.abs(x - s.at), along, overrun: Math.abs(z - along) };
}

/** Which block are you in? Nearest centreline you're actually beside. null if nowhere. */
export function blockAt(x, z) {
  let best = null, bestD = Infinity;
  for (const s of STREETS) {
    const r = onStreet(s, x, z);
    if (r.overrun > 6) continue;               // past the end of the street
    if (r.off < bestD) { bestD = r.off; best = s.id; }
  }
  return bestD <= XS.lawnOut + 4 ? best : null;
}

/** What surface are you on? Drives the drag model, not a wall. A truck can mount a kerb. */
export function surfaceAt(x, z) {
  let bestOff = Infinity, bestOverrun = Infinity;
  for (const s of STREETS) {
    const r = onStreet(s, x, z);
    // Inside an intersection both streets read as road, which is what you want.
    if (r.overrun > 0.1) continue;
    if (r.off < bestOff) { bestOff = r.off; bestOverrun = r.overrun; }
  }
  if (bestOff === Infinity) return 'lawn';
  if (bestOff <= XS.roadHalf) return 'road';
  if (bestOff <= XS.walkOut) return 'walk';
  return 'lawn';
}

// ---------------------------------------------------------------------------
// THE HOUSES — six a side, both sides, every block. 48 in Phase 0.
// Each one accumulates HEARD and sends somebody out to the kerb.
// Generated deterministically from the street table so the map is data, not a fixture.
// ---------------------------------------------------------------------------
export function buildHouses() {
  const out = [];
  const PER_SIDE = 6;
  for (const s of STREETS) {
    const span = s.to - s.from;
    for (let i = 0; i < PER_SIDE; i++) {
      const t = s.from + span * ((i + 0.5) / PER_SIDE);
      for (const side of [-1, 1]) {
        const hx = s.axis === 'x' ? t : s.at + side * (XS.houseFront + XS.houseDepth / 2);
        const hz = s.axis === 'x' ? s.at + side * (XS.houseFront + XS.houseDepth / 2) : t;
        // where they stand when they come out: the kerb, on their own side
        const kx = s.axis === 'x' ? t : s.at + side * XS.kerb;
        const kz = s.axis === 'x' ? s.at + side * XS.kerb : t;
        out.push({
          id: `${s.id}-${side < 0 ? 'n' : 's'}${i}`,
          block: s.id, side,
          x: hx, z: hz,        // the house itself
          kx, kz,              // the kerb point out front
          door: {              // the front door, where a person appears from
            x: hx - (s.axis === 'x' ? 0 : side * XS.houseDepth / 2),
            z: hz - (s.axis === 'x' ? side * XS.houseDepth / 2 : 0),
          },
        });
      }
    }
  }
  return out;
}

/** Solid rects for collision. Houses are hard; kerbs and lawns are drag, not walls. */
export function buildRects(houses) {
  return houses.map(h => {
    const st = STREETS.find(s => s.id === h.block);
    const alongX = st.axis === 'x';
    return {
      id: h.id,
      x: h.x, z: h.z,
      hw: (alongX ? XS.houseWide : XS.houseDepth) / 2,
      hd: (alongX ? XS.houseDepth : XS.houseWide) / 2,
    };
  });
}

/** The drivable bounds — a generous box around the loop, so you can't leave town. */
export const BOUNDS = { x0: -96, x1: 96, z0: -24, z1: 112 };

/** Where the truck starts the day: Maple St, nose east, in the correct lane.
 *  ⚠️ Driving east, forward = (sin yaw, cos yaw) = (1,0), so right = (-cos, sin) = (0,+1).
 *  Right-hand traffic keeps you on your right, so east-bound sits at z = +laneOff, and
 *  the serving window (always the truck's right) then faces the kerb. Get this sign
 *  wrong and you vend into oncoming traffic. */
export const SPAWN = { x: -60, z: +XS.laneOff, yaw: Math.PI / 2 };

// The school. The highest-demand point on the map, and you are legally forbidden to park
// near it (bible §8). Mastery is finding the profitable ring just OUTSIDE the keep-out
// radius, on the path kids actually walk home. Placed off the loop's north-east corner.
export const SCHOOL = { name: 'Hazel Park Elementary', x: 96, z: 44 };
