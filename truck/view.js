// HERE COMES THE TRUCK — view.js  (VIEW ONLY. Math.random is fine; the sim never reads this.)
//
// Hazel Park, built from hazel-park.js with the generated texture kit in tex.js.
// Primitives and canvas art, no asset packs — but textured, varied and planted, because
// untextured boxes on a flat green plane read as a debug scene rather than a town.
//
// ⚠️ THE ORIENTATION CONVENTION, which is where every direction bug in a three.js game
// comes from. For an object with rotation.y = yaw:
//     local +Z  ->  world (sin yaw, cos yaw)   == the sim's fwd(). The truck faces +Z.
//     local +X  ->  world (cos yaw, -sin yaw)
//     "right"   =  forward x up  =  world (-cos yaw, sin yaw)  ==  local -X
// So the SERVING WINDOW, which is always on the truck's right (the kerb side, away from
// traffic), is on local -X. It looks wrong written down and it is correct.

import * as THREE from 'three';
import * as HP from './hazel-park.js';
import * as D from './data.js';
import * as TX from './tex.js';

const SIDING = [0xdcd0b4, 0xc3d0cd, 0xe2c4b6, 0xcbd2bb, 0xd8c6cf, 0xc0c8d6, 0xe6dcc2, 0xb9c7c0];
const BRICK = [0xa8654a, 0x93564a, 0xb07a58];
// ⚠️ Roof colours are LIGHTER than they look right in a swatch. The shingle texture lays
// a 28%-black shadow line under every course, so a "correct" dark asphalt grey renders
// as a black hole against a bright summer sky.
const ROOF = [0x9c8570, 0x7d7770, 0xa8836a, 0x87857f, 0x8f7059];
const TRIM = [0xf4efe2, 0xe8e0cd, 0xfdfaf2];
const SKIN = [0xf0c9a8, 0xe8b48c, 0xc98b62, 0x8d5a3b, 0x6b4326];
const SHIRT = [0xd4553f, 0x3f6fd4, 0xe8c34a, 0x4fae6a, 0xd47fb0, 0xf2f0ea, 0x7a5bb5, 0xe08a3c];
const PANTS = [0x3f4a63, 0x2f3548, 0x5a5348, 0x7a6a55, 0x445a44];

const R = (a, b) => a + Math.random() * (b - a);
const P = (a) => a[Math.floor(Math.random() * a.length)];
const lam = (o) => new THREE.MeshLambertMaterial(o);
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam({ color: c }));

export class View {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.byId = new Map();
    this.windowPanes = [];     // house windows that light up at dusk
    this._build();
  }

  _build() {
    const S = this.scene;
    S.background = new THREE.Color(0xa9d6ea);
    S.fog = new THREE.Fog(0xbcd9e6, 110, 300);

    this.amb = new THREE.HemisphereLight(0xcfe4f2, 0x5a6b3e, 0.85); S.add(this.amb);
    this.sun = new THREE.DirectionalLight(0xfff4dc, 1.15);
    this.sun.position.set(70, 95, 45);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    S.add(this.sun); S.add(this.sun.target);
    this.rim = new THREE.DirectionalLight(0xbfd8ff, 0.22);
    this.rim.position.set(-60, 35, -70); S.add(this.rim);

    this._ground();
    this._streets();
    this._houses();
    this.truck = this._truck();
    S.add(this.truck);
  }

  _ground() {
    const B = HP.BOUNDS;
    const w = B.x1 - B.x0 + 200, d = B.z1 - B.z0 + 200;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      lam({ map: TX.tiled(TX.grass(), w / 9, d / 9) }));
    g.rotation.x = -Math.PI / 2;
    g.position.set((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2);
    g.receiveShadow = true;
    this.scene.add(g);
  }

  _streets() {
    const S = this.scene;
    for (const s of HP.STREETS) {
      const len = s.to - s.from + HP.XS.roadHalf * 2;
      const mid = (s.from + s.to) / 2;
      const along = s.axis === 'x';
      const lay = (m, off, y) => {
        m.rotation.x = -Math.PI / 2;
        m.position.set(along ? mid : s.at + off, y, along ? s.at + off : mid);
        m.receiveShadow = true; S.add(m);
      };
      const plane = (across, tex) => new THREE.Mesh(
        new THREE.PlaneGeometry(along ? len : across, along ? across : len),
        lam({ map: TX.tiled(tex, along ? len / 8 : across / 8, along ? across / 8 : len / 8) }));

      lay(plane(HP.XS.roadHalf * 2, TX.road()), 0, 0.02);
      const wWalk = HP.XS.walkOut - HP.XS.kerb;
      for (const side of [-1, 1]) {
        lay(plane(wWalk, TX.concrete()), side * (HP.XS.kerb + wWalk / 2), 0.06);
        const kb = box(along ? len : 0.24, 0.16, along ? 0.24 : len, 0x9a948a);
        kb.position.set(along ? mid : s.at + side * HP.XS.kerb, 0.08, along ? s.at + side * HP.XS.kerb : mid);
        kb.receiveShadow = true; S.add(kb);
      }
      // centre line, dashed and worn
      const n = Math.floor((s.to - s.from) / 8);
      for (let i = 0; i < n; i++) {
        const t = s.from + 4 + i * 8;
        const dash = new THREE.Mesh(
          new THREE.PlaneGeometry(along ? 3.2 : 0.18, along ? 0.18 : 3.2),
          lam({ color: 0xd8cf9a, transparent: true, opacity: R(0.55, 0.92) }));
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(along ? t : s.at, 0.045, along ? s.at : t);
        S.add(dash);
      }
    }
  }

  // -------------------------------------------------------------------------
  // A HOUSE. ⚠️ Kyle: "the houses have no variety or textures". Every one of these is
  // rolled: footprint, height, siding vs brick, roof pitch and colour, window grid,
  // porch, chimney, garage, and what's planted in the yard. Same six textures throughout.
  // -------------------------------------------------------------------------
  _houses() {
    this.houses = HP.buildHouses();
    for (const h of this.houses) {
      const st = HP.STREETS.find(s => s.id === h.block);
      const alongX = st.axis === 'x';
      const g = new THREE.Group();
      g.position.set(h.x, 0, h.z);
      // face the house at the street: its +Z points back toward the road
      g.rotation.y = alongX ? (h.side < 0 ? 0 : Math.PI) : (h.side < 0 ? Math.PI / 2 : -Math.PI / 2);
      this.scene.add(g);
      this._house(g, h);
    }
  }

  _house(g, h) {
    const w = R(7.0, 9.2), d = R(4.2, 5.4);
    const storeys = Math.random() < 0.30 ? 2 : 1;
    const wallH = storeys === 2 ? R(5.4, 6.2) : R(3.1, 3.7);
    const isBrick = Math.random() < 0.22;
    const bodyCol = isBrick ? P(BRICK) : P(SIDING);
    const roofCol = P(ROOF), trimCol = P(TRIM);

    const wallTex = isBrick ? TX.brick(bodyCol) : TX.siding(bodyCol);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d),
      lam({ map: TX.tiled(wallTex, w / 3.4, wallH / 3.0) }));
    body.position.y = wallH / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    // GABLE ROOF — a real prism, not a cone on a box. This is most of the read.
    const rise = R(1.5, 2.4), over = 0.42;
    const roof = this._gable(w + over * 2, rise, d + over * 2, roofCol);
    roof.position.y = wallH;
    roof.castShadow = true;
    g.add(roof);
    // fascia
    const fa = box(w + over * 2 + 0.06, 0.16, d + over * 2 + 0.06, trimCol);
    fa.position.y = wallH + 0.02; g.add(fa);

    // WINDOWS — a grid on the street face, framed, and they light up at dusk
    const cols = w > 8.2 ? 3 : 2;
    for (let s = 0; s < storeys; s++) {
      for (let c = 0; c < cols; c++) {
        if (s === 0 && c === Math.floor(cols / 2)) continue;      // the door goes there
        const x = (c - (cols - 1) / 2) * (w / (cols + 0.4));
        const y = 1.05 + s * (wallH / storeys) + (storeys === 2 ? 0.5 : 0);
        this._window(g, x, y, d / 2, trimCol);
      }
    }

    // THE DOOR, with a step and a light beside it
    const doorC = P([0x6b4f3a, 0x3f5a4a, 0x7a3f38, 0x2f4358, 0x8a6a3e]);
    const door = box(1.02, 2.1, 0.12, doorC);
    door.position.set(0, 1.05, d / 2 + 0.02); g.add(door);
    const knob = box(0.09, 0.09, 0.08, 0xd8bb62);
    knob.position.set(0.34, 1.02, d / 2 + 0.09); g.add(knob);
    const step = box(1.7, 0.16, 0.7, 0xbdb5a5);
    step.position.set(0, 0.08, d / 2 + 0.42); g.add(step);

    // A PORCH on about half of them — the single most "American street" silhouette
    if (Math.random() < 0.55) {
      const pw = w * R(0.55, 0.95), pd = R(1.5, 2.2);
      const deck = box(pw, 0.16, pd, 0xb5a68e);
      deck.position.set(0, 0.22, d / 2 + pd / 2); deck.receiveShadow = true; g.add(deck);
      const proof = box(pw + 0.3, 0.16, pd + 0.3, roofCol);
      proof.position.set(0, 2.62, d / 2 + pd / 2); proof.castShadow = true; g.add(proof);
      for (const px of [-pw / 2 + 0.2, pw / 2 - 0.2]) {
        const post = box(0.14, 2.4, 0.14, trimCol);
        post.position.set(px, 1.42, d / 2 + pd - 0.2); g.add(post);
      }
      if (Math.random() < 0.5) {   // a chair nobody is sitting in
        const ch = box(0.5, 0.5, 0.5, P([0x8a6a4a, 0x4a6a7a, 0x7a5a5a]));
        ch.position.set(R(-pw / 3, pw / 3), 0.55, d / 2 + pd * 0.5); g.add(ch);
      }
    }

    // a chimney, sometimes
    if (Math.random() < 0.4) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, R(1.2, 2.0), 0.7),
        lam({ map: TX.tiled(TX.brick(0x9d6450), 0.7, 0.7) }));
      ch.position.set(R(-w / 3, w / 3), wallH + rise * 0.55, R(-d / 5, d / 5));
      ch.castShadow = true; g.add(ch);
    }

    // ---- the yard ----
    // ⚠️ Kyle: "the yards need grass". The ground plane is grass-textured, so what a yard
    // actually needs is THINGS ON IT — otherwise it reads as a lawn nobody lives on.
    const front = d / 2;
    // a hedge along the front, or shrubs by the door
    if (Math.random() < 0.45) {
      const hw = w * R(0.6, 1.0);
      const hedge = box(hw, R(0.7, 1.1), 0.6, P([0x3f6b32, 0x4a7a38, 0x36602c]));
      hedge.position.set(R(-1, 1), 0.5, front + R(3.0, 4.2));
      hedge.castShadow = true; g.add(hedge);
    } else {
      for (const s of [-1, 1]) {
        if (Math.random() < 0.6) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(R(0.4, 0.75), 8, 6),
            lam({ color: P([0x3f6b32, 0x4a7a38, 0x2f5a2a]) }));
          b.position.set(s * R(1.1, 2.0), 0.45, front + R(0.7, 1.4));
          b.scale.y = 0.8; b.castShadow = true; g.add(b);
        }
      }
    }
    // a tree, on most of them
    if (Math.random() < 0.62) this._tree(g, R(-w / 2 - 1.5, w / 2 + 1.5), front + R(4.5, 6.2));
    // flowers by the step
    if (Math.random() < 0.4) {
      for (let i = 0; i < 7; i++) {
        const f = box(0.12, 0.12, 0.12, P([0xe8637a, 0xf0c14a, 0xe8f0f4, 0xc47ae0]));
        f.position.set(R(-1.6, 1.6), 0.3, front + R(0.6, 1.2)); g.add(f);
      }
    }

    // the concrete path out to the kerb — replaces the flat grey plane
    const runOut = HP.XS.houseFront + HP.XS.houseDepth / 2 - HP.XS.kerb;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.15, runOut),
      lam({ map: TX.tiled(TX.concrete(), 0.4, runOut / 3) }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.035, front + runOut / 2);
    path.receiveShadow = true; g.add(path);

    // a driveway on some, with a car on some of those
    if (Math.random() < 0.5) {
      const dx = (w / 2 + 1.4) * (Math.random() < 0.5 ? -1 : 1);
      const dr = new THREE.Mesh(new THREE.PlaneGeometry(2.7, runOut + 1),
        lam({ map: TX.tiled(TX.concrete(), 0.9, runOut / 3) }));
      dr.rotation.x = -Math.PI / 2;
      dr.position.set(dx, 0.03, front + runOut / 2);
      dr.receiveShadow = true; g.add(dr);
      if (Math.random() < 0.5) this._parkedCar(g, dx, front + R(1.4, 3.0));
    }

    // the mailbox at the kerb
    const post = box(0.1, 1.0, 0.1, 0x6b5a44);
    post.position.set(w / 2 + 0.9, 0.5, front + runOut - 0.5); g.add(post);
    const mb = box(0.24, 0.24, 0.42, P([0x455a6b, 0x6b4a45, 0x3f4a3f, 0xa8a29a]));
    mb.position.set(w / 2 + 0.9, 1.08, front + runOut - 0.5);
    mb.castShadow = true; g.add(mb);
  }

  /**
   * A gable roof: a triangular prism, ridge along X, built non-indexed with explicit UVs.
   *
   * ⚠️ TWO SEPARATE BUGS LIVED HERE, and both rendered as "every roof in town is pure
   * black against a bright sky", which looks like a lighting problem and is not:
   *   1. WINDING — the first version wound every face backwards, so computeVertexNormals
   *      pointed all the normals down and inward. Check by hand: for the back slope,
   *      (b-a) x (c-a) must have a POSITIVE y.
   *   2. NO UVs — a hand-built BufferGeometry has no `uv` attribute unless you write one,
   *      and a material with a `map` then samples undefined coordinates. Fixing the
   *      winding alone left it just as black. If a custom geometry renders black, check
   *      BOTH; `geometry.attributes.uv` being undefined is the one people miss.
   * Non-indexed also gives flat shading, so the ridge and eaves stay crisp instead of
   * being smoothed into a tent by averaged vertex normals.
   */
  _gable(w, h, d, col) {
    const hw = w / 2, hd = d / 2;
    const pos = [], uv = [];
    const quad = (a, b, c, e, ur, vr) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...e);
      uv.push(0, 0, 0, vr, ur, vr, 0, 0, ur, vr, ur, 0);
    };
    const tri = (a, b, c) => { pos.push(...a, ...b, ...c); uv.push(0, 0, 1, 0, 0.5, 1); };

    quad([-hw, 0, -hd], [-hw, h, 0], [hw, h, 0], [hw, 0, -hd], w / 1.6, 1);   // back slope
    quad([hw, 0, hd], [hw, h, 0], [-hw, h, 0], [-hw, 0, hd], w / 1.6, 1);     // front slope
    tri([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, 0]);                            // left end
    tri([hw, 0, hd], [hw, 0, -hd], [hw, h, 0]);                               // right end

    const gm = new THREE.BufferGeometry();
    gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gm.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    gm.computeVertexNormals();
    return new THREE.Mesh(gm, lam({ map: TX.tiled(TX.shingle(col), 1, 1) }));
  }

  _window(g, x, y, front, trimCol) {
    const w = 0.92, h = 1.15;
    const frame = box(w + 0.16, h + 0.16, 0.1, trimCol);
    frame.position.set(x, y, front + 0.03); g.add(frame);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06),
      lam({ color: 0x3d5866, emissive: 0x000000 }));
    pane.position.set(x, y, front + 0.07); g.add(pane);
    this.windowPanes.push(pane);
    // muntins — two bars is all it takes to stop reading as a dark rectangle
    const mv = box(0.05, h, 0.02, trimCol); mv.position.set(x, y, front + 0.11); g.add(mv);
    const mh = box(w, 0.05, 0.02, trimCol); mh.position.set(x, y, front + 0.11); g.add(mh);
    // a sill
    const sill = box(w + 0.26, 0.08, 0.2, trimCol);
    sill.position.set(x, y - h / 2 - 0.1, front + 0.07); g.add(sill);
  }

  _tree(g, x, z) {
    const h = R(3.2, 5.4);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 7),
      lam({ color: P([0x5a4433, 0x6b5240, 0x4a3a2c]) }));
    tr.position.set(x, h / 2, z); tr.castShadow = true; g.add(tr);
    const leaf = P([0x3f6b32, 0x4a7a38, 0x35602c, 0x5a8a3a]);
    for (let i = 0; i < 3; i++) {
      const r = R(1.3, 2.1);
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), lam({ color: leaf }));
      b.position.set(x + R(-0.8, 0.8), h + R(-0.5, 0.7), z + R(-0.8, 0.8));
      b.scale.y = R(0.7, 0.95);
      b.castShadow = true; g.add(b);
    }
  }

  _parkedCar(g, x, z) {
    const c = new THREE.Group(); c.position.set(x, 0, z);
    const col = P([0x2f4a5e, 0x6b3f38, 0x4a4438, 0x8a8f95, 0x2f3a2f, 0xa8a49a]);
    const b = box(1.85, 0.62, 4.3, col); b.position.y = 0.66; b.castShadow = true; c.add(b);
    const cab = box(1.68, 0.56, 2.1, col); cab.position.set(0, 1.22, -0.15); cab.castShadow = true; c.add(cab);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 2.0), lam({ color: 0x37505e }));
    gl.position.set(0, 1.26, -0.15); c.add(gl);
    for (const wz of [-1.4, 1.4]) for (const wx of [-0.86, 0.86]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10), lam({ color: 0x1b1b1e }));
      t.rotation.z = Math.PI / 2; t.position.set(wx, 0.34, wz); c.add(t);
    }
    g.add(c);
  }

  /**
   * The truck. FRESH CUT's makeCar('icecream') silhouette — a 4.6 m cream box with a
   * pink panel, a cyan stripe and a cone on the roof — rebuilt facing +Z, with the two
   * things a background prop never needed: a cab you sit in and a window that opens.
   */
  _truck() {
    const T = D.TRUCK;
    const g = new THREE.Group();
    const cream = 0xf6f2e4;

    const body = box(T.wide, 2.05, T.len, cream);
    body.position.y = 1.28; body.castShadow = true; g.add(body);
    // a rounded nose cap so it isn't a shoebox
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, T.wide, 10, 1, false, 0, Math.PI),
      lam({ color: cream }));
    nose.rotation.z = Math.PI / 2; nose.rotation.y = Math.PI / 2;
    nose.position.set(0, 1.9, T.len / 2 - 0.5); nose.castShadow = true; g.add(nose);

    // ⚠️ NO TINTED PANE ACROSS THE CAB. Kyle: "the windshield looks horrible" — a
    // translucent slab in front of a first-person camera is a smear you look THROUGH all
    // game, and no opacity value makes it good. You get A-pillars, a header and a roof
    // edge instead: the frame reads as a windscreen, the hole reads as glass.
    // ⚠️ A-pillars and header are sized by the angle they subtend from the driver's eye.
    // At 1.09 m from the camera even an honest 11 cm pillar eats a tenth of the screen —
    // thin them AND sit further back in the cab, or the frame is most of what you see.
    const pillarC = 0xe6e0cf;
    for (const sx of [-1, 1]) {
      const pil = box(0.075, 1.05, 0.10, pillarC);
      pil.position.set(sx * (T.wide / 2 - 0.05), 1.86, T.len / 2 - 0.06); g.add(pil);
    }
    const header = box(T.wide, 0.10, 0.12, pillarC);
    header.position.set(0, 2.43, T.len / 2 - 0.06); g.add(header);

    // ⚠️ NO INTERIOR PANELS. Boxing the cab in with a floor, ceiling and side wall was
    // tried and is much worse: at 0.5 m from the eye the door wall alone eats a third of
    // the frame and the windscreen becomes a letterbox. The body box is front-face culled,
    // so you see out through the sides — which nobody notices, because the pillars, the
    // header and the dash already say "you are sitting in a truck". Most driving games
    // don't model the door interior for exactly this reason.

    // the dash, so the cab reads as a place you are sitting rather than a floating camera.
    // ⚠️ SIDES: local +X is the truck's LEFT (right = -localX), so the driver sits at +X.
    const dash = box(T.wide * 0.94, 0.26, 0.42, 0x4a4038);
    dash.position.set(0, 1.18, T.len / 2 - 0.30); g.add(dash);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.028, 8, 20), lam({ color: 0x59504a }));
    wheel.position.set(0.42, 1.44, T.len / 2 - 0.42); wheel.rotation.x = 1.2; g.add(wheel);
    const clip = box(0.28, 0.02, 0.36, 0xe8dfc6);
    clip.position.set(-0.46, 1.33, T.len / 2 - 0.36); clip.rotation.x = -0.16; g.add(clip);

    // the painted flank + stripe, on the LEFT side (local +X)
    const panel = box(0.06, 0.72, 2.3, 0xef9ec0);
    panel.position.set(T.wide / 2 + 0.02, 1.5, -0.35); g.add(panel);
    const stripe = box(0.06, 0.18, 2.3, 0x63c3d8);
    stripe.position.set(T.wide / 2 + 0.02, 1.02, -0.35); g.add(stripe);

    // ⚠️ THE SERVING WINDOW is a FRAME WITH A HOLE, not a pane — the window camera sits
    // inside it and looks out. A solid box of any colour there renders a black screen.
    const X = -(T.wide / 2 + 0.02);
    const bar = (h, d, y, z) => { const m = box(0.08, h, d, 0x3a3a38); m.position.set(X, y, z); g.add(m); };
    bar(0.10, 2.10, 2.12, -0.1);
    bar(0.90, 0.10, 1.62, 0.90);
    bar(0.90, 0.10, 1.62, -1.10);
    const sill = box(0.40, 0.10, 2.10, 0xe9e2cf);
    sill.position.set(-(T.wide / 2 + 0.10), 1.14, -0.1); g.add(sill);
    this.hatch = box(0.09, 0.90, 1.94, cream);
    this.hatch.position.set(X - 0.05, 1.62, -0.1); g.add(this.hatch);

    // ---- THE CHURN BAY, in the back. Park, turn around, three steps. ----
    // ⚠️ The camera position for this existed before any of this geometry did, so turning
    // round showed you the empty street BEHIND the truck (the body box is front-face
    // culled). A camera pointed at nothing is not a location.
    // Only a back wall and a floor — no side panels, because those are what boxed the cab
    // in and turned the windscreen into a letterbox.
    const bayBack = box(T.wide - 0.10, 1.95, 0.06, 0xd8d2c2);
    bayBack.position.set(0, 1.30, -T.len / 2 + 0.05); g.add(bayBack);
    const bayFloor = box(T.wide - 0.10, 0.05, T.len - 0.3, 0x6b6258);
    bayFloor.position.set(0, 0.30, -0.2); g.add(bayFloor);
    const bayCeil = box(T.wide - 0.10, 0.05, 2.9, 0xe6e0d0);
    bayCeil.position.set(0, 2.28, -0.85); g.add(bayCeil);

    // ⚠️ SIDE WALLS ONLY IN THE REAR SECTION (z < +0.5). Without them you stand in the
    // bay looking at somebody's front garden straight through your own bodywork, because
    // the body box is front-face culled — and the whole location falls apart. But walls
    // that run the FULL length are what boxed the cab in and turned the windscreen into
    // a letterbox, so they stop well behind the driver's seat.
    const wallL = box(0.05, 1.95, 2.9, 0xd8d2c2);
    wallL.position.set(T.wide / 2 - 0.05, 1.30, -0.85); g.add(wallL);
    // the window side is walled only BEHIND the serving hatch, so the opening stays open
    const wallR = box(0.05, 1.95, 1.15, 0xd8d2c2);
    wallR.position.set(-(T.wide / 2 - 0.05), 1.30, -1.72); g.add(wallR);

    // the counter, down the window side so you can hand things straight across
    const counter = box(0.52, 0.08, 2.4, 0xb9bec2);
    counter.position.set(-(T.wide / 2 - 0.32), 0.95, -0.7); g.add(counter);
    const cFront = box(0.06, 0.62, 2.4, 0xe4ded0);
    cFront.position.set(-(T.wide / 2 - 0.58), 0.63, -0.7); g.add(cFront);

    // THE MACHINE — a churn barrel with a hopper, a spout and a lever you pull
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.86, 16),
      lam({ color: 0xc9ced2 }));
    barrel.position.set(-0.30, 1.42, -1.62); g.add(barrel);
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.16, 0.34, 16),
      lam({ color: 0xdfe4e7 }));
    hopper.position.set(-0.30, 2.00, -1.62); g.add(hopper);
    const spout = box(0.12, 0.20, 0.12, 0x9aa0a4);
    spout.position.set(-0.30, 0.94, -1.36); g.add(spout);
    this.churnLever = box(0.05, 0.30, 0.05, 0x8a3f34);
    this.churnLever.position.set(-0.05, 1.30, -1.38); g.add(this.churnLever);
    const motor = box(0.34, 0.26, 0.30, 0x7a8084);
    motor.position.set(-0.30, 2.28, -1.62); g.add(motor);

    // topping tubs on a shelf, in the mix-in colours
    const shelf = box(0.30, 0.05, 1.5, 0xb5aa96);
    shelf.position.set(T.wide / 2 - 0.22, 1.32, -1.25); g.add(shelf);
    const tubCols = [0x6b4632, 0xd8a05a, 0xe86b86, 0xf0e07a, 0x8fd8c0, 0xf4f0e2];
    tubCols.forEach((c, i) => {
      const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.078, 0.13, 10), lam({ color: c }));
      tub.position.set(T.wide / 2 - 0.22, 1.40, -1.88 + i * 0.25); g.add(tub);
    });

    // the freezer chest you actually sell out of, lids and all
    const chest = box(0.62, 0.62, 1.7, 0xdfe4e7);
    chest.position.set(T.wide / 2 - 0.36, 0.63, 0.55); g.add(chest);
    for (const lz of [0.15, 0.95]) {
      const lid = box(0.60, 0.06, 0.72, 0xb0c4cc);
      lid.position.set(T.wide / 2 - 0.36, 0.97, lz); g.add(lid);
    }

    // the cone on the roof, which is the whole reason anyone looks up
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 12), lam({ color: 0xf6d9a0 }));
    cone.position.set(0, 2.72, -0.6); cone.rotation.x = Math.PI; cone.castShadow = true; g.add(cone);
    const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), lam({ color: 0xf2a0b4 }));
    scoop.position.set(0, 3.1, -0.6); scoop.castShadow = true; g.add(scoop);

    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 8), lam({ color: 0x9a938a }));
    horn.position.set(0, 2.5, 1.1); horn.rotation.x = -Math.PI / 2; g.add(horn);

    this.wheels = [];
    for (const z of [T.axleFront, T.axleRear]) for (const x of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 14), lam({ color: 0x1b1b1e }));
      w.rotation.z = Math.PI / 2;
      // ⚠️ OUTBOARD of the bay floor (which spans +/-0.925), or the tyres poke up through
      // the floor and you are standing in the back of the truck next to a wheel.
      w.position.set(x * (T.wide / 2 + 0.03), 0.42, z);
      w.castShadow = true; g.add(w); this.wheels.push(w);
    }

    // ⚠️ THE MIRROR — sized by the angle it subtends from the driver's eye, not by what
    // looks right in the model. At r 0.3, 1.5 m out, it fills a fifth of the screen.
    const arm = box(0.045, 0.045, 0.5, 0x8e8880);
    arm.position.set(0, 2.06, T.len / 2 + 0.34); g.add(arm);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 18), lam({ color: 0x6f6862 }));
    rim.position.set(0, 2.10, T.len / 2 + 0.62); rim.rotation.x = -0.5; g.add(rim);
    this.mirror = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      lam({ color: 0xdfe9ee, emissive: 0x33454f }));
    this.mirror.position.set(0, 2.10, T.len / 2 + 0.62);
    this.mirror.rotation.x = Math.PI * 0.66; g.add(this.mirror);

    return g;
  }

  // -------------------------------------------------------------------------
  // A PERSON. ⚠️ Kyle: "the people look horrible / people need faces". A featureless
  // sphere on a box is a mannequin at any distance, and this is a game about people
  // coming out to see you. Face plane on the front of the head, hair, hands, shoes.
  // -------------------------------------------------------------------------
  _person(kid, seed) {
    const g = new THREE.Group();
    const h = kid ? R(1.05, 1.28) : R(1.62, 1.86);
    const skin = P(SKIN), shirt = P(SHIRT), pants = P(PANTS);
    const headR = h * (kid ? 0.108 : 0.098);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(h * 0.23, h * 0.30, h * 0.14),
      lam({ color: shirt }));
    torso.position.y = h * 0.64; torso.castShadow = true; g.add(torso);
    const hips = box(h * 0.21, h * 0.10, h * 0.135, pants);
    hips.position.y = h * 0.47; g.add(hips);

    // neck + head
    const neck = box(h * 0.06, h * 0.05, h * 0.06, skin);
    neck.position.y = h * 0.80; g.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 14, 11), lam({ color: skin }));
    head.position.y = h * 0.87; head.scale.set(1, 1.08, 0.94);
    head.castShadow = true; g.add(head);

    // THE FACE — a plane on the front of the head, so there is no guessing about which
    // way SphereGeometry wraps its UVs.
    const f = new THREE.Mesh(new THREE.PlaneGeometry(headR * 1.85, headR * 1.85),
      new THREE.MeshBasicMaterial({
        map: TX.face(kid ? 'kid' : 'adult', seed % 6),
        transparent: true, depthWrite: false,
      }));
    f.position.set(0, h * 0.875, headR * 0.90);
    f.renderOrder = 2; g.add(f);

    // Hair, as a cap over the top and back.
    // ⚠️ thetaLength 0.45π, NOT 0.62π. 0.62π sweeps 112 degrees from the top pole — past
    // the equator — so the "cap" wrapped straight over the face plane and every single
    // person rendered as a featureless brown head. Faces were built and were invisible.
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(headR * 1.05, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.45),
      lam({ color: P(TX.HAIR) }));
    hair.position.y = h * 0.875; hair.scale.set(1, 1.06, 1.02);
    hair.rotation.x = -0.30; g.add(hair);     // tipped back off the forehead

    g.legs = []; g.arms = [];
    for (const x of [-h * 0.062, h * 0.062]) {
      const leg = new THREE.Group(); leg.position.set(x, h * 0.45, 0); g.add(leg);
      const l = box(h * 0.075, h * 0.42, h * 0.08, pants);
      l.position.y = -h * 0.21; l.castShadow = true; leg.add(l);
      const shoe = box(h * 0.085, h * 0.05, h * 0.13, 0x2a2622);
      shoe.position.set(0, -h * 0.43, h * 0.025); leg.add(shoe);
      g.legs.push(leg);
    }
    for (const x of [-h * 0.145, h * 0.145]) {
      const arm = new THREE.Group(); arm.position.set(x, h * 0.76, 0); g.add(arm);
      const a = box(h * 0.058, h * 0.28, h * 0.058, shirt);
      a.position.y = -h * 0.14; arm.add(a);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(h * 0.036, 8, 6), lam({ color: skin }));
      hand.position.y = -h * 0.29; arm.add(hand);
      g.arms.push(arm);
    }
    g.userData.h = h;
    return g;
  }

  /** One frame of view. Never touches sim state. */
  frame(sim, dt, t) {
    const tr = sim.truck;
    this.truck.position.set(tr.x, 0, tr.z);
    this.truck.rotation.y = tr.yaw;
    const spin = tr.v * dt / 0.42;
    for (const w of this.wheels) w.rotation.x -= spin;

    // the sun's shadow camera follows the truck, or a 2048 map over a whole town is mush
    this.sun.position.set(tr.x + this.sunOff.x, this.sunOff.y, tr.z + this.sunOff.z);
    this.sun.target.position.set(tr.x, 0, tr.z);
    this.sun.target.updateMatrixWorld();

    const want = sim.windowOpen ? 2.56 : 1.62;
    this.hatch.position.y += (want - this.hatch.position.y) * Math.min(1, dt * 6);

    // the machine is visibly going while it churns — the lever swings
    if (this.churnLever) this.churnLever.rotation.x = sim.churning ? Math.sin(t * 7) * 0.55 : 0;

    const seen = new Set();
    for (const p of sim.people) {
      seen.add(p.id);
      let v = this.byId.get(p.id);
      if (!v) { v = this._person(p.kid, p.id); this.scene.add(v); this.byId.set(p.id, v); }
      v.position.set(p.x, 0, p.z);
      // ⚠️ At the window they look AT YOU, not wherever they last happened to be walking.
      // `p.face` is set by _moveTo and goes stale the moment somebody stops — and people
      // in the queue walk to a slot BESIDE the truck, so they ended up presenting the
      // back of their heads to the one camera that is meant to see their faces.
      if (p.state === 'window' || p.state === 'toWindow') {
        v.rotation.y = Math.atan2(tr.x - p.x, tr.z - p.z);
      } else if (p.face !== undefined) v.rotation.y = p.face;
      const moving = p.state === 'walk' || p.state === 'toWindow' || p.state === 'leaving';
      const ph = t * (p.kid ? 9 : 6.5);
      const sw = moving ? 0.62 : 0;
      v.legs[0].rotation.x = Math.sin(ph) * sw;
      v.legs[1].rotation.x = -Math.sin(ph) * sw;
      // ⚠️ a kid in the mirror WAVES. Nothing bad happens; this is the whole point.
      const inMirror = sim.mirrorBlocker() === p;
      v.arms[0].rotation.x = inMirror ? 0 : -Math.sin(ph) * sw * 0.7;
      v.arms[0].rotation.z = inMirror ? -2.5 + Math.sin(t * 9) * 0.45 : 0;
      v.arms[1].rotation.x = Math.sin(ph) * sw * 0.7;
      v.arms[1].rotation.z = 0;
    }
    for (const [id, v] of this.byId) {
      if (seen.has(id)) continue;
      this.scene.remove(v); this.byId.delete(id);
    }

    this._light(sim);
  }

  sunOff = { x: 48, y: 78, z: 34 };

  /**
   * ⚠️ THE LIGHT RUNS OFF THE CLOCK, NOT OFF PROGRESS. FRESH CUT drives its golden hour
   * from `grass.pct()` so the arc always lands however long you take — correct for a game
   * with no clock, and exactly wrong here. This day ends at dusk whether you sold out or
   * sold nothing, and the sky has to agree with the freezer.
   */
  _light(sim) {
    const f = Math.max(0, Math.min(1, (sim.hour - D.DAY.startHour) / (D.DAY.duskHour - D.DAY.startHour)));
    const e = f * f;
    const sky = new THREE.Color(0xa9d6ea).lerp(new THREE.Color(0xf0a468), e * 0.92);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky).lerp(new THREE.Color(0xffffff), 0.12);
    this.sun.color.setHex(0xfff4dc).lerp(new THREE.Color(0xff9040), e);
    this.sun.intensity = 1.15 - e * 0.55;
    this.sunOff = { x: 48 - f * 96, y: 78 - e * 56, z: 34 - f * 18 };
    this.amb.intensity = 0.85 - e * 0.22;
    this.amb.color.setHex(0xcfe4f2).lerp(new THREE.Color(0xffc79a), e);

    // the windows come on as the light goes
    const glow = Math.max(0, e - 0.35) * 1.5;
    if (Math.abs(glow - (this._glow || 0)) > 0.02) {
      this._glow = glow;
      const c = new THREE.Color(0xffca70).multiplyScalar(glow * 0.9);
      for (const p of this.windowPanes) p.material.emissive.copy(c);
    }
  }
}
