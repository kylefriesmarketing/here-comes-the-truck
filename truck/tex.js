// HERE COMES THE TRUCK — tex.js  (VIEW ONLY)
//
// The generated-texture kit. House style: canvas art and primitives, never asset packs.
// Everything here is drawn once at boot into an offscreen canvas and cached by key, so a
// hundred houses share six textures and the draw-call count never moves.
//
// ⚠️ Every texture is built with `repeat` in mind — set `.repeat.set()` on the RETURNED
// texture, not in here, or two surfaces that share a cache entry fight over the tiling.
// Clone with `t.clone(); t.needsUpdate = true` if you need per-surface repeat.

import * as THREE from 'three';

const CACHE = {};
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * `size` may be a number (square) or [w, h].
 * ⚠️ It has to support non-square. The livery is a 5.5 x 0.8 m panel; drawn on a square
 * canvas it occupied a 146-pixel strip at the top of 1024 and the other 86% went out to
 * the truck as blank cream — which is exactly what "the flank is still a white box"
 * looked like. Always draw across the WHOLE canvas you are going to map.
 */
function make(key, size, draw) {
  if (CACHE[key]) return CACHE[key];
  const c = document.createElement('canvas');
  const w = Array.isArray(size) ? size[0] : size;
  const h = Array.isArray(size) ? size[1] : size;
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  CACHE[key] = t;
  return t;
}

/** A repeat-safe copy, so two surfaces can tile the same art differently. */
export function tiled(tex, rx, ry) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

// ---------------------------------------------------------------------------
// GRASS — deep summer, mown in faint stripes, with clover and dry patches.
// Drawn as thousands of tiny blades rather than noise, because noise reads as carpet.
// ---------------------------------------------------------------------------
export const grass = () => make('grass', 512, (g, S) => {
  g.fillStyle = '#5d8a3a'; g.fillRect(0, 0, S, S);
  // mown stripes — the reason a lawn reads as a lawn
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.045)';
    g.fillRect(0, i * (S / 8), S, S / 8);
  }
  // soil / dry patches
  for (let i = 0; i < 26; i++) {
    const x = rnd(0, S), y = rnd(0, S), r = rnd(14, 52);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rnd(120, 150) | 0},${rnd(120, 140) | 0},70,.13)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // blades
  for (let i = 0; i < 5200; i++) {
    const x = rnd(0, S), y = rnd(0, S), h = rnd(3, 8), lean = rnd(-2.2, 2.2);
    const v = rnd(0, 1);
    g.strokeStyle = v < 0.18 ? `rgba(${rnd(150, 185) | 0},${rnd(190, 215) | 0},90,.55)`
      : v < 0.82 ? `rgba(${rnd(85, 120) | 0},${rnd(135, 165) | 0},${rnd(45, 70) | 0},.5)`
        : `rgba(${rnd(55, 80) | 0},${rnd(95, 120) | 0},40,.5)`;
    g.lineWidth = rnd(0.7, 1.5);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + lean, y - h); g.stroke();
  }
  // clover
  for (let i = 0; i < 160; i++) {
    const x = rnd(0, S), y = rnd(0, S);
    g.fillStyle = 'rgba(120,170,80,.45)';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(x + Math.cos(k * 2.1) * 2.1, y + Math.sin(k * 2.1) * 2.1, 1.5, 0, 7); g.fill();
    }
  }
});

// ---------------------------------------------------------------------------
// ASPHALT — patched, cracked, tar-seamed. Roads read as roads because they are REPAIRED.
// ---------------------------------------------------------------------------
export const road = () => make('road', 512, (g, S) => {
  g.fillStyle = '#4a4845'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 46;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // aggregate
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rnd(90, 135) | 0},${rnd(88, 130) | 0},${rnd(85, 125) | 0},${rnd(0.1, 0.4)})`;
    g.beginPath(); g.arc(rnd(0, S), rnd(0, S), rnd(0.6, 2.1), 0, 7); g.fill();
  }
  // lighter patches where it's been resurfaced
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(${rnd(60, 90) | 0},${rnd(60, 90) | 0},${rnd(58, 88) | 0},.35)`;
    g.fillRect(rnd(0, S), rnd(0, S), rnd(60, 190), rnd(40, 130));
  }
  // tar-seamed cracks
  g.strokeStyle = 'rgba(24,24,26,.55)';
  for (let i = 0; i < 16; i++) {
    g.lineWidth = rnd(1.2, 3.4);
    let x = rnd(0, S), y = rnd(0, S);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += rnd(-34, 34); y += rnd(-34, 34); g.lineTo(x, y); }
    g.stroke();
  }
});

/** Poured concrete — sidewalks and driveways. Scored into slabs. */
export const concrete = () => make('concrete', 512, (g, S) => {
  g.fillStyle = '#b3ac9e'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${rnd(120, 165) | 0},${rnd(115, 158) | 0},${rnd(105, 145) | 0},.18)`;
    g.beginPath(); g.arc(rnd(0, S), rnd(0, S), rnd(6, 26), 0, 7); g.fill();
  }
  // control joints
  g.strokeStyle = 'rgba(90,86,78,.5)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke();
});

// ---------------------------------------------------------------------------
// SIDING — horizontal clapboard. The single biggest reason a box reads as a HOUSE.
// ---------------------------------------------------------------------------
export function siding(hex) {
  return make('siding' + hex, 256, (g, S) => {
    const c = new THREE.Color(hex);
    const base = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    const rows = 16, h = S / rows;
    for (let i = 0; i < rows; i++) {
      // each board catches a little light on top and shadows underneath
      g.fillStyle = 'rgba(255,255,255,.10)';
      g.fillRect(0, i * h, S, h * 0.42);
      g.fillStyle = 'rgba(0,0,0,.20)';
      g.fillRect(0, i * h + h - 2.5, S, 2.5);
    }
    // weathering
    for (let i = 0; i < 200; i++) {
      g.fillStyle = `rgba(${rnd(0, 40) | 0},${rnd(0, 30) | 0},0,${rnd(0.02, 0.07)})`;
      g.fillRect(rnd(0, S), rnd(0, S), rnd(2, 30), rnd(1, 5));
    }
  });
}

/** Asphalt shingles, in courses, with a bit of wear per tab. */
export function shingle(hex) {
  return make('shingle' + hex, 256, (g, S) => {
    const c = new THREE.Color(hex);
    g.fillStyle = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
    g.fillRect(0, 0, S, S);
    const rows = 12, h = S / rows, w = S / 8;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (w / 2);
      for (let k = -1; k < 9; k++) {
        const x = k * w + off, y = r * h;
        g.fillStyle = `rgba(${rnd(0, 255) < 128 ? 255 : 0},${0},${0},0)`;
        g.fillStyle = `rgba(255,255,255,${rnd(0.0, 0.09)})`;
        g.fillRect(x + 1, y + 1, w - 2, h - 2);
        g.fillStyle = 'rgba(0,0,0,.28)';
        g.fillRect(x, y + h - 2, w, 2);
        g.fillStyle = 'rgba(0,0,0,.16)';
        g.fillRect(x + w - 1.5, y, 1.5, h);
      }
    }
  });
}

/** Brick, for the odd house that isn't clapboard. */
export function brick(hex) {
  return make('brick' + hex, 256, (g, S) => {
    const c = new THREE.Color(hex);
    g.fillStyle = '#cfc6b4'; g.fillRect(0, 0, S, S);   // mortar
    const rows = 16, h = S / rows, w = S / 8;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (w / 2);
      for (let k = -1; k < 9; k++) {
        const v = rnd(0.82, 1.12);
        g.fillStyle = `rgb(${Math.min(255, c.r * 255 * v) | 0},${Math.min(255, c.g * 255 * v) | 0},${Math.min(255, c.b * 255 * v) | 0})`;
        g.fillRect(k * w + off + 1.5, r * h + 1.5, w - 3, h - 3);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// FACES. ⚠️ Kyle's note: "people need faces". A sphere with no features reads as a
// mannequin at any distance, and this is a game about people coming out to see you.
// One texture per (skin, kind) pair, mapped onto the front of the head sphere.
// ---------------------------------------------------------------------------
// ⚠️ Drawn on a TRANSPARENT canvas and applied to a small plane parked on the front of
// the head, NOT wrapped onto the head sphere. Sphere UVs put u=0.25 at +Z rather than
// u=0.5, so a wrapped face lands on the ear — and "which way does SphereGeometry wrap"
// is exactly the kind of thing that costs an hour to rediscover. A plane is unambiguous.
export function face(kind, seed) {
  return make(`face-${kind}-${seed}`, 128, (g, S) => {
    const cx = S * 0.5, eyeY = S * 0.42, dx = S * 0.135;
    const kid = kind === 'kid';

    // eyes — whites, iris, pupil, and a highlight, because the highlight is what makes
    // it read as alive rather than as two dots
    for (const s of [-1, 1]) {
      const x = cx + s * dx;
      g.fillStyle = '#fbf7f0';
      g.beginPath(); g.ellipse(x, eyeY, S * 0.052, S * 0.040, 0, 0, 7); g.fill();
      g.fillStyle = ['#4a3628', '#38566b', '#3d6b4a', '#5b4a3a'][seed % 4];
      g.beginPath(); g.arc(x, eyeY, S * 0.026, 0, 7); g.fill();
      g.fillStyle = '#15100c';
      g.beginPath(); g.arc(x, eyeY, S * 0.013, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.arc(x - S * 0.008, eyeY - S * 0.010, S * 0.007, 0, 7); g.fill();
    }
    // brows
    g.strokeStyle = 'rgba(60,40,26,.6)'; g.lineWidth = S * 0.018; g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * (dx - S * 0.045), eyeY - S * 0.072);
      g.lineTo(cx + s * (dx + S * 0.042), eyeY - S * (kid ? 0.062 : 0.082));
      g.stroke();
    }
    // nose
    g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = S * 0.012;
    g.beginPath(); g.moveTo(cx, eyeY + S * 0.03); g.lineTo(cx - S * 0.012, eyeY + S * 0.085); g.stroke();
    // mouth — kids are pleased about this, adults are polite about it
    g.strokeStyle = 'rgba(120,60,52,.75)'; g.lineWidth = S * 0.016;
    g.beginPath();
    if (kid) g.arc(cx, eyeY + S * 0.075, S * 0.058, 0.35, Math.PI - 0.35);
    else { g.moveTo(cx - S * 0.045, eyeY + S * 0.135); g.lineTo(cx + S * 0.045, eyeY + S * 0.135); }
    g.stroke();
    // cheeks
    g.fillStyle = 'rgba(214,120,110,.20)';
    for (const s of [-1, 1]) {
      g.beginPath(); g.arc(cx + s * S * 0.20, eyeY + S * 0.075, S * 0.055, 0, 7); g.fill();
    }
  });
}

/** Freckles, glasses, a cap — one small extra so faces aren't all the same face. */
export const FACE_KINDS = ['kid', 'adult'];

// ---------------------------------------------------------------------------
// THE LIVERY. ⚠️ Kyle: "the truck still looks horrible" — and the first exterior shot
// showed why: the painted flank was on the truck's LEFT, so the KERB SIDE, the only side
// the whole town ever sees, was a blank white box. Both flanks are painted now, and it is
// painted rather than built: a canvas texture carries the band, the pinstripe, the name
// and a scoop, which is both the house style and a tenth of the geometry.
// ---------------------------------------------------------------------------
export function livery(w, h, name) {
  const PX = 2048, PY = Math.max(64, Math.round(PX * h / w));
  return make(`livery${w.toFixed(2)}x${h.toFixed(2)}-${name}`, [PX, PY], (g, S, H) => {
    g.fillStyle = '#f7f3e6'; g.fillRect(0, 0, S, H);
    const y = (f) => f * H;                   // the whole canvas IS the panel

    // the coral band and its cyan pinstripe, running the length
    g.fillStyle = '#ef9ec0'; g.fillRect(0, y(0.30), S, y(0.24));
    g.fillStyle = '#63c3d8'; g.fillRect(0, y(0.56), S, y(0.055));
    g.fillStyle = '#e8b04b'; g.fillRect(0, y(0.545), S, y(0.012));

    // a painted scoop, because every one of these trucks has one
    const cx = S * 0.17, cy = y(0.42), r = y(0.115);
    g.fillStyle = '#f6d9a0';
    g.beginPath(); g.moveTo(cx - r * 0.62, cy); g.lineTo(cx + r * 0.62, cy);
    g.lineTo(cx, cy + r * 1.5); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(150,110,60,.5)'; g.lineWidth = S * 0.003;
    for (let i = -2; i <= 2; i++) {
      g.beginPath(); g.moveTo(cx + i * r * 0.22, cy + Math.abs(i) * r * 0.2);
      g.lineTo(cx + i * r * 0.1, cy + r * 1.4); g.stroke();
    }
    for (const [dx, dy, rr, c] of [[-0.42, -0.30, 0.46, '#f6e2ea'], [0.40, -0.34, 0.44, '#f2a0b4'], [0, -0.62, 0.48, '#f6e2ea']]) {
      g.fillStyle = c; g.beginPath(); g.arc(cx + dx * r, cy + dy * r, rr * r, 0, 7); g.fill();
    }

    // The name, hand-painted — the decision the bible hangs a whole arc on.
    // ⚠️ Sized off the panel HEIGHT, so it fills the band however long the truck is.
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(y(0.46))}px Georgia, serif`;
    g.fillStyle = 'rgba(60,40,30,.25)';
    g.fillText(name, S * 0.29 + y(0.03), y(0.44) + y(0.03));
    g.fillStyle = '#8a3f34';
    g.fillText(name, S * 0.29, y(0.44));
    g.font = `600 ${Math.round(y(0.16))}px Georgia, serif`;
    g.fillStyle = '#3d5866';
    g.fillText('I C E   C R E A M', S * 0.29, y(0.78));

    // rivet lines and a little honest grime along the bottom
    g.fillStyle = 'rgba(0,0,0,.10)';
    for (let x = S * 0.02; x < S; x += S * 0.045) g.fillRect(x, y(0.05), 2, 2);
    const gr = g.createLinearGradient(0, y(0.80), 0, y(1));
    gr.addColorStop(0, 'rgba(90,80,60,0)'); gr.addColorStop(1, 'rgba(90,80,60,.28)');
    g.fillStyle = gr; g.fillRect(0, y(0.80), S, y(0.2));
  });
}

/**
 * THE MENU BOARD — the price list, painted on a board beside the window.
 * ⚠️ This is the tycoon UI being DIEGETIC. The prices you charge live on a board in your
 * own truck, where the customer can see them too, rather than in a DOM panel floating
 * over the world. Redrawn whenever a price or the stock changes.
 */
export function menuBoard(rows) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#2f2a24'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#e8b04b'; g.lineWidth = 6; g.strokeRect(10, 10, 492, 492);
  g.fillStyle = '#f6efdd'; g.font = '700 44px Georgia, serif'; g.textAlign = 'center';
  g.fillText('TO-DAY', 256, 66);
  g.strokeStyle = 'rgba(246,239,221,.3)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(40, 84); g.lineTo(472, 84); g.stroke();
  g.textAlign = 'left'; g.font = '400 30px Georgia, serif';
  rows.slice(0, 9).forEach((r, i) => {
    const y = 132 + i * 42;
    g.fillStyle = r.out ? 'rgba(246,239,221,.32)' : '#f6efdd';
    const label = r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label;
    g.fillText(label, 40, y);
    g.textAlign = 'right';
    g.fillStyle = r.out ? 'rgba(246,239,221,.32)' : '#e8b04b';
    g.fillText(r.out ? '—' : r.price, 472, y);
    g.textAlign = 'left';
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The upper-flank strip: a painted row of the actual menu — bars, pops, cones — the way
 * every real truck wears decal stickers of what it sells above the waistline.
 */
export function menuStrip(len, h) {
  const PX = 2048, PY = Math.max(64, Math.round(PX * h / len));
  return make(`mstrip${len.toFixed(1)}x${h.toFixed(1)}`, [PX, PY], (g, S, H) => {
    g.fillStyle = '#f7f3e6'; g.fillRect(0, 0, S, H);
    const y0 = H * 0.14, hh = H * 0.72;
    const items = 7;
    for (let i = 0; i < items; i++) {
      const cx = S * (0.5 + i) / items, w = hh * 0.42;
      const kind = i % 4;
      if (kind === 0) {            // striped bomb pop
        const cols = ['#d8453a', '#f2f0ea', '#3f6fd4'];
        cols.forEach((c, j) => { g.fillStyle = c; g.fillRect(cx - w / 2, y0 + hh * j / 3.6, w, hh / 3.6); });
        g.fillStyle = '#d8c9a0'; g.fillRect(cx - w * 0.08, y0 + hh * 0.86, w * 0.16, hh * 0.14);
      } else if (kind === 1) {     // cone with a swirl
        g.fillStyle = '#e8c98a';
        g.beginPath(); g.moveTo(cx - w / 2, y0 + hh * 0.45); g.lineTo(cx + w / 2, y0 + hh * 0.45);
        g.lineTo(cx, y0 + hh); g.closePath(); g.fill();
        g.fillStyle = '#f6ece0';
        for (let s2 = 0; s2 < 3; s2++) {
          g.beginPath(); g.arc(cx, y0 + hh * (0.34 - s2 * 0.115), w * (0.52 - s2 * 0.11), 0, 7); g.fill();
        }
      } else if (kind === 2) {     // chocolate bar with a bite
        g.fillStyle = '#6b4632'; g.fillRect(cx - w / 2, y0 + hh * 0.08, w, hh * 0.72);
        g.fillStyle = '#f7f3e6';
        g.beginPath(); g.arc(cx + w / 2 - 2, y0 + hh * 0.16, w * 0.26, 0, 7); g.fill();
        g.fillStyle = '#d8c9a0'; g.fillRect(cx - w * 0.08, y0 + hh * 0.80, w * 0.16, hh * 0.2);
      } else {                     // pink round pop with gumball eyes
        g.fillStyle = '#f2a0b4';
        g.beginPath(); g.arc(cx, y0 + hh * 0.36, w * 0.55, 0, 7); g.fill();
        for (const s2 of [-1, 1]) {
          g.fillStyle = '#f2f0ea'; g.beginPath(); g.arc(cx + s2 * w * 0.2, y0 + hh * 0.3, w * 0.14, 0, 7); g.fill();
          g.fillStyle = '#2f2a24'; g.beginPath(); g.arc(cx + s2 * w * 0.2, y0 + hh * 0.31, w * 0.06, 0, 7); g.fill();
        }
        g.fillStyle = '#d8c9a0'; g.fillRect(cx - w * 0.08, y0 + hh * 0.82, w * 0.16, hh * 0.18);
      }
    }
  });
}

/**
 * The rear safety sign. ⚠️ Not decoration — bible §7: NY, NJ and Michigan law requires a
 * stop arm, flashing lamps and the front convex mirror on these trucks, and Detroit cut
 * ice-cream-truck injuries from 48 a year to 11 by mandating the kit in 1978. The mirror
 * is already a mechanic; this is the rest of the same statute, worn on the back.
 */
export const slowSign = () => make('slowsign', [512, 320], (g, S, H) => {
  g.fillStyle = '#e8a63a'; g.fillRect(0, 0, S, H);
  g.strokeStyle = '#2f2a24'; g.lineWidth = 14; g.strokeRect(12, 12, S - 24, H - 24);
  g.fillStyle = '#2f2a24'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 96px Georgia, serif'; g.fillText('SLOW', S / 2, 92);
  g.font = '700 62px Georgia, serif'; g.fillText('CHILDREN', S / 2, 176);
  g.font = '700 52px Georgia, serif'; g.fillText('CROSSING', S / 2, 240);
});

/** The little price decal beside the serving window, so the queue can read it too. */
export const windowDecal = () => make('windecal', [320, 512], (g, S, H) => {
  g.fillStyle = '#f6efdd'; g.fillRect(0, 0, S, H);
  g.strokeStyle = '#ef9ec0'; g.lineWidth = 10; g.strokeRect(8, 8, S - 16, H - 16);
  g.fillStyle = '#8a3f34'; g.textAlign = 'center'; g.font = '700 46px Georgia, serif';
  g.fillText('SERVED', S / 2, 66);
  g.fillText('HERE', S / 2, 116);
  // a painted cone
  g.fillStyle = '#f6d9a0';
  g.beginPath(); g.moveTo(S / 2 - 46, 210); g.lineTo(S / 2 + 46, 210); g.lineTo(S / 2, 330); g.closePath(); g.fill();
  for (const [dx, dy, r, c] of [[-30, -22, 36, '#f6e2ea'], [30, -26, 34, '#f2a0b4'], [0, -60, 38, '#f6e2ea']]) {
    g.fillStyle = c; g.beginPath(); g.arc(S / 2 + dx, 210 + dy, r, 0, 7); g.fill();
  }
  g.fillStyle = '#3d5866'; g.font = '400 30px Georgia, serif';
  g.fillText('mind the step', S / 2, 400);
  g.fillText('· thank you ·', S / 2, 444);
});

/** Brushed stainless, for the machines and the counter. */
export const steel = () => make('steel', 256, (g, S) => {
  g.fillStyle = '#c6ccd0'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = `rgba(${rnd(150, 255) | 0},${rnd(150, 255) | 0},${rnd(155, 255) | 0},${rnd(0.03, 0.14)})`;
    g.lineWidth = rnd(0.5, 1.6);
    const y = rnd(0, S);
    g.beginPath(); g.moveTo(0, y); g.lineTo(S, y + rnd(-1, 1)); g.stroke();
  }
});

/** The chequer-plate floor every one of these trucks has. */
export const chequer = () => make('chequer', 256, (g, S) => {
  g.fillStyle = '#6f675c'; g.fillRect(0, 0, S, S);
  const n = 8, c = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i + j) % 2) { g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(i * c, j * c, c, c); }
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; g.strokeRect(i * c, j * c, c, c);
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd(0.02, 0.09)})`;
    g.beginPath(); g.arc(rnd(0, S), rnd(0, S), rnd(1, 4), 0, 7); g.fill();
  }
});

/** Hair, as a cap that sits over the top of the head sphere. */
export const HAIR = [0x2b1d16, 0x4a3324, 0x6b4a2c, 0x8a6a3e, 0xb99a63, 0x9a9a98, 0x1a1512, 0xc0562e];
