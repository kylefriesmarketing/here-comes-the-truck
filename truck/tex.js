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

function make(key, size, draw) {
  if (CACHE[key]) return CACHE[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
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

/** Hair, as a cap that sits over the top of the head sphere. */
export const HAIR = [0x2b1d16, 0x4a3324, 0x6b4a2c, 0x8a6a3e, 0xb99a63, 0x9a9a98, 0x1a1512, 0xc0562e];
