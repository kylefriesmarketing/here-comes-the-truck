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
    // ⚠️⚠️ EVERYTHING OUT HERE IS PLACED AGAINST `YARD`, NOT AGAINST `front + <guess>`.
    // The first version measured `runOut` from the house CENTRE to the kerb and then
    // added it to `front`, which is ALREADY the centre-to-front offset — double-counting
    // 2.3 m. Measured result: trees standing 0.2-1.9 m from the street centreline (the
    // road is +/-2.5), hedges on the pavement, and every mailbox in the middle of the
    // road. Kyle spotted it as "there are trees in the road".
    // The front lawn is the ONLY strip yard props may occupy. The soak asserts it.
    const YARD = HP.yardBand(d);
    const front = YARD.face;                              // local z of this house's face
    const inYard = (t) => YARD.near + (YARD.far - YARD.near) * t;   // t in 0..1

    // a hedge along the front, or shrubs by the door
    if (Math.random() < 0.45) {
      const hw = w * R(0.6, 1.0);
      const hedge = box(hw, R(0.7, 1.1), 0.6, P([0x3f6b32, 0x4a7a38, 0x36602c]));
      hedge.position.set(R(-1, 1), 0.5, inYard(R(0.55, 0.9)));
      hedge.castShadow = true; g.add(hedge);
    } else {
      for (const s of [-1, 1]) {
        if (Math.random() < 0.6) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(R(0.4, 0.75), 8, 6),
            lam({ color: P([0x3f6b32, 0x4a7a38, 0x2f5a2a]) }));
          b.position.set(s * R(1.1, 2.0), 0.45, inYard(R(0.02, 0.2)));
          b.scale.y = 0.8; b.castShadow = true; g.add(b);
        }
      }
    }
    // a tree, on most of them — on the VERGE, which is the far end of the lawn
    if (Math.random() < 0.62) this._tree(g, R(-w / 2 - 1.5, w / 2 + 1.5), inYard(R(0.6, 0.95)));
    // flowers by the step
    if (Math.random() < 0.4) {
      for (let i = 0; i < 7; i++) {
        const f = box(0.12, 0.12, 0.12, P([0xe8637a, 0xf0c14a, 0xe8f0f4, 0xc47ae0]));
        f.position.set(R(-1.6, 1.6), 0.3, inYard(R(0.0, 0.14))); g.add(f);
      }
    }

    // the concrete path, from the doorstep out to the kerb and no further
    const runOut = YARD.kerb - front;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.15, runOut),
      lam({ map: TX.tiled(TX.concrete(), 0.4, runOut / 3) }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.035, front + runOut / 2);
    path.receiveShadow = true; g.add(path);

    // a driveway on some, with a car on some of those
    if (Math.random() < 0.5) {
      const dx = (w / 2 + 1.4) * (Math.random() < 0.5 ? -1 : 1);
      const dr = new THREE.Mesh(new THREE.PlaneGeometry(2.7, runOut),
        lam({ map: TX.tiled(TX.concrete(), 0.9, runOut / 3) }));
      dr.rotation.x = -Math.PI / 2;
      dr.position.set(dx, 0.03, front + runOut / 2);
      dr.receiveShadow = true; g.add(dr);
      if (Math.random() < 0.5) this._parkedCar(g, dx, inYard(R(0.1, 0.5)));
    }

    // the mailbox, standing ON the verge beside the path — not in the road
    const mbz = YARD.far;
    const post = box(0.1, 1.0, 0.1, 0x6b5a44);
    post.position.set(w / 2 + 0.9, 0.5, mbz); g.add(post);
    const mb = box(0.24, 0.24, 0.42, P([0x455a6b, 0x6b4a45, 0x3f4a3f, 0xa8a29a]));
    mb.position.set(w / 2 + 0.9, 1.08, mbz);
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
   * THE TRUCK — a step van you stand inside, not a box with a cone on it.
   *
   * Real trucks: heavy gear over the axles, freezers at reach height because you are
   * reaching into them all day, storage / prep / serving separated, and a service window
   * built for fast handoff. Operators call it "the cramped, freezing reality" — cramped
   * is the feature, but it has to be a SPACE.
   *
   * ⚠️ Everything inside is placed at the STATION coordinates from data.js, so the thing
   * you walk up to and the thing you see are the same thing by construction. Move a
   * station in data and the furniture moves with it.
   */
  _truck() {
    const g = this._truckShell();
    this._truckInterior(g);
    return g;
  }

  _truckShell() {
    const T = D.TRUCK;
    const g = new THREE.Group();
    const cream = 0xf6f2e4;

    // ---- the box: tall, flat-sided, sitting high on a chassis. A step van. ----
    const FLOOR = 0.62, ROOF = 2.98;                 // interior floor and ceiling heights
    const body = new THREE.Mesh(new THREE.BoxGeometry(T.wide, ROOF - FLOOR, T.len),
      lam({ color: cream, emissive: 0x33302a }));   // see the brighten() note below
    body.position.y = (ROOF + FLOOR) / 2; body.castShadow = true; g.add(body);

    // ⚠️ THE LIVERY GOES ON BOTH FLANKS, and the important one is the KERB side. The
    // first version painted only the truck's left, so the side the entire town looks at
    // was a blank white box — which is most of what "the truck looks horrible" meant.
    // It sits BELOW the serving window, which is where a real truck carries it, and it is
    // one continuous panel per side so the hand-painted name never tiles.
    const LIVY0 = FLOOR + 0.02, LIVY1 = 1.50;
    for (const sx of [-1, 1]) {
      const skin = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, LIVY1 - LIVY0, T.len - 0.12),
        // ⚠️ a little self-coloured emissive, FRESH CUT's brighten() trick: the sun is
        // aimed across the street, so an unlit flank renders as a grey slab and the whole
        // truck reads dirty. This lifts the shaded side without flattening it.
        lam({ map: TX.livery(T.len - 0.12, LIVY1 - LIVY0, "CY'S"), emissive: 0x2a2724 }));
      skin.position.set(sx * (T.wide / 2 + 0.026), (LIVY0 + LIVY1) / 2, 0);
      g.add(skin);
    }

    // the chassis and skirt under it, so it isn't a box floating on four discs
    const skirt = box(T.wide - 0.06, 0.34, T.len - 0.5, 0xcfc7b4);
    skirt.position.y = FLOOR - 0.15; g.add(skirt);
    const chassis = box(T.wide - 0.5, 0.18, T.len - 0.9, 0x4a4640);
    chassis.position.y = FLOOR - 0.38; g.add(chassis);

    // The raked snout, sticking out IN FRONT of the box — a short step-van nose.
    // ⚠️ It must sit forward of the cab bulkhead (z = len/2 - 0.05). Tucked inside it, the
    // driver looks straight at the back of their own bonnet: a big cream slab across the
    // bottom-right of the windscreen that reads as a rendering fault.
    const nose = box(T.wide - 0.10, 0.88, 0.55, cream);
    nose.position.set(0, FLOOR + 0.40, T.len / 2 + 0.24);
    nose.castShadow = true; g.add(nose);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, T.wide - 0.10, 12, 1, false, 0, Math.PI),
      lam({ color: cream }));
    cap.rotation.z = Math.PI / 2; cap.rotation.y = Math.PI / 2;
    cap.position.set(0, FLOOR + 0.84, T.len / 2 + 0.24); cap.castShadow = true; g.add(cap);

    // bumper, lamps, grille — the face of the thing
    const bump = box(T.wide + 0.08, 0.20, 0.24, 0x8f8a80);
    bump.position.set(0, FLOOR - 0.12, T.len / 2 + 0.06); g.add(bump);
    const grille = box(T.wide - 0.5, 0.26, 0.1, 0x5a564f);
    grille.position.set(0, FLOOR + 0.30, T.len / 2 + 0.02); g.add(grille);
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12),
        lam({ color: 0xfff6d8, emissive: 0x3a3428 }));
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(sx * (T.wide / 2 - 0.3), FLOOR + 0.36, T.len / 2 + 0.04); g.add(lamp);
      const ind = box(0.16, 0.1, 0.08, 0xe8903a);
      ind.position.set(sx * (T.wide / 2 - 0.08), FLOOR + 0.30, T.len / 2 + 0.02); g.add(ind);
      // wing mirrors on stalks
      const stalk = box(0.02, 0.02, 0.26, 0x6f6862);
      stalk.position.set(sx * (T.wide / 2 + 0.12), 2.05, T.len / 2 - 0.62); g.add(stalk);
      const wm = box(0.05, 0.30, 0.16, 0x3a3a38);
      wm.position.set(sx * (T.wide / 2 + 0.22), 2.05, T.len / 2 - 0.68); g.add(wm);
    }
    // ---- the rear: doors, the safety sign, the stop arm, the flashers ----
    const rbump = box(T.wide + 0.06, 0.18, 0.2, 0x8f8a80);
    rbump.position.set(0, FLOOR - 0.12, -T.len / 2 - 0.04); g.add(rbump);
    for (const sx of [-1, 1]) {
      const tl = box(0.16, 0.26, 0.08, 0xb03a30);
      tl.position.set(sx * (T.wide / 2 - 0.24), FLOOR + 0.45, -T.len / 2 - 0.02); g.add(tl);
      // rear door seams + handles, so the back reads as doors rather than a blank slab
      const seam = box(0.02, ROOF - FLOOR - 0.5, 0.03, 0xcfc7b4);
      seam.position.set(sx * 0.02, (ROOF + FLOOR) / 2 - 0.1, -T.len / 2 - 0.015); g.add(seam);
      const handle = box(0.16, 0.05, 0.05, 0x8f8a80);
      handle.position.set(sx * 0.28, 1.55, -T.len / 2 - 0.04); g.add(handle);
      const hinge1 = box(0.06, 0.14, 0.04, 0x9a948a);
      hinge1.position.set(sx * (T.wide / 2 - 0.10), 1.1, -T.len / 2 - 0.02); g.add(hinge1);
      const hinge2 = box(0.06, 0.14, 0.04, 0x9a948a);
      hinge2.position.set(sx * (T.wide / 2 - 0.10), 2.3, -T.len / 2 - 0.02); g.add(hinge2);
    }
    // ⚠️ THE SLOW-CHILDREN SIGN — the same 1978 Detroit statute the mirror comes from,
    // worn on the back where following traffic reads it. Not decoration: it is why the
    // mirror mechanic makes sense the first time you see the truck from outside.
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.72),
      new THREE.MeshBasicMaterial({ map: TX.slowSign() }));
    sign.position.set(0, 2.15, -T.len / 2 - 0.04);
    sign.rotation.y = Math.PI; g.add(sign);
    // the flashers either side of it — lit amber, swapped on when the window is open
    this.flashers = [];
    for (const sx of [-1, 1]) {
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10),
        lam({ color: 0xe8a63a, emissive: 0x000000 }));
      fl.rotation.x = Math.PI / 2;
      fl.position.set(sx * (T.wide / 2 - 0.28), 2.6, -T.len / 2 - 0.03);
      g.add(fl); this.flashers.push(fl);
    }
    // THE STOP ARM — swings out from the rear kerb-side corner while you serve
    this.stopArm = new THREE.Group();
    this.stopArm.position.set(-(T.wide / 2 + 0.02), 1.7, -T.len / 2 + 0.3);
    const armPole = box(0.04, 0.04, 0.55, 0x8f8a80);
    armPole.position.z = 0.28; this.stopArm.add(armPole);
    const oct = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 8),
      lam({ color: 0xb03a30 }));
    oct.rotation.z = Math.PI / 2; oct.position.set(0, 0, 0.6); this.stopArm.add(oct);
    const octW = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.035, 8),
      lam({ color: 0xf2ece2 }));
    octW.rotation.z = Math.PI / 2; octW.position.set(0.005, 0, 0.6); this.stopArm.add(octW);
    this.stopArm.rotation.y = 0;                     // 0 = folded flat along the body
    g.add(this.stopArm);

    // the SERVED HERE decal beside the window, for the queue to read
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.68),
      new THREE.MeshBasicMaterial({ map: TX.windowDecal() }));
    decal.position.set(-(T.wide / 2 + 0.032), 1.95, 1.45);
    decal.rotation.y = -Math.PI / 2; g.add(decal);

    // ---- THE CAB APERTURE ----
    // ⚠️ NO TINTED PANE. A translucent slab in front of a first-person camera is a smear
    // you look through all game, and no opacity value makes it good. The FRAME reads as a
    // windscreen and the HOLE reads as glass. Sized by the angle it subtends from the
    // driver's eye, not by what looks right in the model.
    const pillarC = 0xe6e0cf, GY = 1.92, GTOP = 2.74;
    const bulk = box(T.wide - 0.06, GY - FLOOR, 0.08, pillarC);
    bulk.position.set(0, (GY + FLOOR) / 2, T.len / 2 - 0.05); g.add(bulk);
    for (const sx of [-1, 1]) {
      const pil = box(0.08, GTOP - GY, 0.10, pillarC);
      pil.position.set(sx * (T.wide / 2 - 0.05), (GY + GTOP) / 2, T.len / 2 - 0.05); g.add(pil);
    }
    const header = box(T.wide, ROOF - GTOP, 0.12, pillarC);
    header.position.set(0, (GTOP + ROOF) / 2, T.len / 2 - 0.05); g.add(header);

    // a cyan waistline above the livery, wrapping the whole van
    for (const sx of [-1, 1]) {
      const belt = box(0.04, 0.10, T.len - 0.1, 0x63c3d8);
      belt.position.set(sx * (T.wide / 2 + 0.028), LIVY1 + 0.09, 0); g.add(belt);
    }
    // the painted menu strip above the waistline — what the truck sells, worn on the
    // truck, on the OFF side (the kerb side's upper flank is the window and awning)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.62, T.len - 1.6),
      lam({ map: TX.menuStrip(T.len - 1.6, 0.62), emissive: 0x2a2724 }));
    strip.position.set(T.wide / 2 + 0.028, 2.12, -0.4); g.add(strip);
    const beltF = box(T.wide + 0.05, 0.10, 0.04, 0x63c3d8);
    beltF.position.set(0, LIVY1 + 0.09, -T.len / 2 - 0.02); g.add(beltF);

    // ---- THE SERVING WINDOW, on the kerb side (local -X) ----
    // ⚠️ A FRAME WITH A HOLE, never a pane: the window camera sits inside it and looks
    // out, so a solid box of any colour there renders the poster shot completely black.
    const X = -(T.wide / 2 + 0.01), WY0 = 1.52, WY1 = 2.46, WZ0 = -1.05, WZ1 = 0.95;
    const barY = (y, h) => { const m = box(0.07, h, WZ1 - WZ0, 0x3a3a38); m.position.set(X, y, (WZ0 + WZ1) / 2); g.add(m); };
    const barZ = (z) => { const m = box(0.07, WY1 - WY0, 0.10, 0x3a3a38); m.position.set(X, (WY0 + WY1) / 2, z); g.add(m); };
    barY(WY1 + 0.05, 0.10); barZ(WZ0 - 0.05); barZ(WZ1 + 0.05);
    const sill = box(0.42, 0.10, WZ1 - WZ0 + 0.2, 0xe9e2cf);
    sill.position.set(-(T.wide / 2 + 0.06), WY0 - 0.05, (WZ0 + WZ1) / 2); g.add(sill);
    this.hatch = box(0.08, WY1 - WY0, WZ1 - WZ0, cream);
    this.hatch.position.set(X - 0.05, (WY0 + WY1) / 2, (WZ0 + WZ1) / 2); g.add(this.hatch);
    // ⚠️ The open/closed heights live ON THE MESH, derived from the opening it covers.
    // They were hardcoded numbers in frame() and went stale the moment the window moved —
    // "open" then still covered two thirds of the aperture, so the poster shot was a grey
    // slab with a child's head peeking under it.
    this.hatch.userData.shut = (WY0 + WY1) / 2;
    this.hatch.userData.open = WY1 + (WY1 - WY0) / 2 + 0.04;
    // the awning over it — the single most "ice cream truck" silhouette there is
    const awn = box(0.55, 0.06, WZ1 - WZ0 + 0.5, 0xef9ec0);
    awn.position.set(-(T.wide / 2 + 0.26), WY1 + 0.22, (WZ0 + WZ1) / 2);
    awn.rotation.z = -0.22; awn.castShadow = true; g.add(awn);
    for (let i = 0; i < 6; i++) {
      const scallop = box(0.55, 0.10, 0.20, i % 2 ? 0xf6f2e4 : 0xef9ec0);
      scallop.position.set(-(T.wide / 2 + 0.26), WY1 + 0.14, WZ0 - 0.2 + i * 0.48);
      scallop.rotation.z = -0.22; g.add(scallop);
    }

    // ---- THE SHELL YOU STAND INSIDE ----
    // ⚠️ Full-length walls are fine NOW and were not before: the old truck was 1.95 m wide
    // with the camera jammed 1.15 m forward, so a side wall 0.5 m from the eye ate a third
    // of the frame and the windscreen became a letterbox. At 2.15 m wide with the seat set
    // back it reads as sitting in a van, which is what it is.
    const inC = 0xdcd6c6;
    const floorM = new THREE.Mesh(new THREE.BoxGeometry(T.wide - 0.10, 0.06, T.len - 0.2),
      lam({ map: TX.tiled(TX.chequer(), 3, 7) }));      // the chequer plate every van has
    floorM.position.set(0, FLOOR, 0); g.add(floorM);
    const ceilM = box(T.wide - 0.10, 0.06, T.len - 0.2, 0xe6e0d0);
    ceilM.position.set(0, ROOF - 0.06, 0); g.add(ceilM);
    const backM = box(T.wide - 0.12, ROOF - FLOOR, 0.06, inC);
    backM.position.set(0, (ROOF + FLOOR) / 2, -T.len / 2 + 0.06); g.add(backM);
    // ⚠️ THE DRIVER'S SIDE WINDOW. The seat sits 0.56 m from this wall, so a solid slab
    // there fills the whole left of the windscreen view and the cab feels like a coffin.
    // Real vans have a door window exactly here; leaving the aperture open is what makes
    // the driving view breathe.
    const DW0 = 1.60, DW1 = T.len / 2 - 0.1, DWY0 = 1.95, DWY1 = 2.62;
    for (const seg of [[-T.len / 2 + 0.1, DW0], [DW1, T.len / 2 - 0.1]]) {
      if (seg[1] - seg[0] < 0.05) continue;
      const w = box(0.05, ROOF - FLOOR, seg[1] - seg[0], inC);
      w.position.set(T.wide / 2 - 0.05, (ROOF + FLOOR) / 2, (seg[0] + seg[1]) / 2); g.add(w);
    }
    const dwBelow = box(0.05, DWY0 - FLOOR, DW1 - DW0, inC);
    dwBelow.position.set(T.wide / 2 - 0.05, (DWY0 + FLOOR) / 2, (DW0 + DW1) / 2); g.add(dwBelow);
    const dwAbove = box(0.05, ROOF - DWY1, DW1 - DW0, inC);
    dwAbove.position.set(T.wide / 2 - 0.05, (ROOF + DWY1) / 2, (DW0 + DW1) / 2); g.add(dwAbove);
    // the kerb side is walled either side of the serving opening
    for (const seg of [[-T.len / 2 + 0.1, WZ0 - 0.05], [WZ1 + 0.05, T.len / 2 - 0.5]]) {
      const w = box(0.05, ROOF - FLOOR, seg[1] - seg[0], inC);
      w.position.set(-(T.wide / 2 - 0.05), (ROOF + FLOOR) / 2, (seg[0] + seg[1]) / 2); g.add(w);
    }
    // and the panels above and below the opening
    const belowW = box(0.05, WY0 - FLOOR, WZ1 - WZ0, inC);
    belowW.position.set(-(T.wide / 2 - 0.05), (WY0 + FLOOR) / 2, (WZ0 + WZ1) / 2); g.add(belowW);
    const aboveW = box(0.05, ROOF - WY1, WZ1 - WZ0, inC);
    aboveW.position.set(-(T.wide / 2 - 0.05), (ROOF + WY1) / 2, (WZ0 + WZ1) / 2); g.add(aboveW);

    // the freezer chest you actually sell out of, lids and all
    const chest = box(0.62, 0.62, 1.7, 0xdfe4e7);
    chest.position.set(T.wide / 2 - 0.36, 0.63, 0.55); g.add(chest);
    for (const lz of [0.15, 0.95]) {
      const lid = box(0.60, 0.06, 0.72, 0xb0c4cc);
      lid.position.set(T.wide / 2 - 0.36, 0.97, lz); g.add(lid);
    }

    // the cone on the roof, which is the whole reason anyone looks up
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 14), lam({ color: 0xf6d9a0 }));
    cone.position.set(0, ROOF + 0.5, -0.4); cone.rotation.x = Math.PI; cone.castShadow = true; g.add(cone);
    for (let i = 0; i < 3; i++) {     // a swirl, so it reads as soft serve and not a hat
      const sw = new THREE.Mesh(new THREE.SphereGeometry(0.30 - i * 0.06, 12, 9), lam({ color: 0xf6e2ea }));
      sw.position.set(0, ROOF + 1.02 + i * 0.20, -0.4); sw.castShadow = true; g.add(sw);
    }
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.46, 10), lam({ color: 0x9a938a }));
    horn.position.set(0, ROOF + 0.16, T.len / 2 - 0.9); horn.rotation.x = -Math.PI / 2; g.add(horn);

    this.wheels = [];
    for (const z of [T.axleFront, T.axleRear]) for (const x of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.30, 16), lam({ color: 0x1b1b1e }));
      w.rotation.z = Math.PI / 2;
      // ⚠️ OUTBOARD of the interior floor, or the tyres poke up through it and you are
      // standing in the back of your own truck next to a wheel.
      w.position.set(x * (T.wide / 2 + 0.02), 0.46, z);
      w.castShadow = true; g.add(w); this.wheels.push(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 12), lam({ color: 0xb9b3aa }));
      hub.rotation.z = Math.PI / 2; hub.position.copy(w.position); g.add(hub);
      // ⚠️ A WHEEL ARCH IS A HOLE, NOT A LUMP. The first pass put a cream box beside each
      // tyre, which read as four white bricks glued to the sides. A dark well behind the
      // wheel plus a curved fender over it reads as an arch cut into the bodywork.
      const well = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.62, 0.16, 14, 1, false, 0, Math.PI),
        lam({ color: 0x2a2724 }));
      well.rotation.z = Math.PI / 2; well.rotation.y = Math.PI / 2;
      well.position.set(x * (T.wide / 2 - 0.05), FLOOR - 0.18, z); g.add(well);
      const fender = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.055, 6, 14, Math.PI), lam({ color: cream }));
      fender.rotation.y = Math.PI / 2;
      fender.position.set(x * (T.wide / 2 + 0.02), FLOOR - 0.18, z); g.add(fender);
    }

    // ⚠️ THE MIRROR — sized by the angle it subtends from the driver's eye, not by what
    // looks right in the model. At r 0.3, 1.5 m out, it fills a fifth of the screen.
    const arm = box(0.045, 0.045, 0.5, 0x8e8880);
    arm.position.set(0, 2.36, T.len / 2 + 0.34); g.add(arm);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 18), lam({ color: 0x6f6862 }));
    rim.position.set(0, 2.40, T.len / 2 + 0.62); rim.rotation.x = -0.5; g.add(rim);
    this.mirror = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      lam({ color: 0xdfe9ee, emissive: 0x33454f }));
    this.mirror.position.set(0, 2.40, T.len / 2 + 0.62);
    this.mirror.rotation.x = Math.PI * 0.66; g.add(this.mirror);

    g.userData.FLOOR = FLOOR; g.userData.ROOF = ROOF;
    return g;
  }

  /**
   * THE FURNITURE — built AT the station coordinates from data.js, so the thing you walk
   * up to and the thing you see are the same thing by construction. Move a station in
   * data and its furniture moves with it; there is no second list to keep in sync.
   */
  _truckInterior(g) {
    const T = D.TRUCK, FLOOR = g.userData.FLOOR;
    const at = (id) => D.STATION_BY_ID[id];
    const inward = (x) => x > 0 ? -1 : 1;          // which way a wall unit faces

    // the chest freezer: one long unit down the left wall with three lids you reach into
    const bins = ['bin_eyes', 'bin_bomb', 'bin_pop'].map(at);
    const z0 = Math.min(...bins.map(b => b.z)) - 0.32, z1 = Math.max(...bins.map(b => b.z)) + 0.32;
    const chest = box(0.52, 0.92, z1 - z0, 0xdfe4e7);
    chest.position.set(T.wide / 2 - 0.30, FLOOR + 0.46, (z0 + z1) / 2); g.add(chest);
    this.lids = {};
    for (const b of bins) {
      const lid = box(0.50, 0.05, 0.56, 0xb0c4cc);
      lid.position.set(T.wide / 2 - 0.30, FLOOR + 0.94, b.z); g.add(lid);
      this.lids[b.id] = lid;
      const tag = box(0.02, 0.10, 0.30, 0xe8b04b);
      tag.position.set(T.wide / 2 - 0.57, FLOOR + 0.78, b.z); g.add(tag);
    }

    // the scoop tub and the tub of whatever you invented, further back down the same wall
    for (const [id, col] of [['tub_scoop', 0xf2e6cf], ['tub_new', 0xd8a8e0]]) {
      const s = at(id);
      const unit = box(0.46, 0.86, 0.62, 0xdfe4e7);
      unit.position.set(T.wide / 2 - 0.28, FLOOR + 0.43, s.z); g.add(unit);
      const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.18, 0.16, 14), lam({ color: col }));
      tub.position.set(T.wide / 2 - 0.28, FLOOR + 0.90, s.z); g.add(tub);
    }

    // THE SOFT-SERVE MACHINE — back on the kerb side, the longest walk from the bars
    const sp = at('spigot');
    const smBody = box(0.42, 1.35, 0.70, 0xc9ced2);
    smBody.position.set(-(T.wide / 2 - 0.26), FLOOR + 0.68, sp.z); g.add(smBody);
    const smHop = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.34, 14), lam({ color: 0xdfe4e7 }));
    smHop.position.set(-(T.wide / 2 - 0.26), FLOOR + 1.50, sp.z); g.add(smHop);
    this.spigotLever = box(0.06, 0.28, 0.05, 0x8a3f34);
    this.spigotLever.position.set(-(T.wide / 2 - 0.52), FLOOR + 1.10, sp.z); g.add(this.spigotLever);
    const nozzle = box(0.10, 0.14, 0.10, 0x9aa0a4);
    nozzle.position.set(-(T.wide / 2 - 0.50), FLOOR + 0.92, sp.z); g.add(nozzle);

    // the counter under the serving window, with the register on it
    const win = at('window');
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 2.1),
      lam({ map: TX.tiled(TX.steel(), 1, 4) }));
    counter.position.set(-(T.wide / 2 - 0.27), FLOOR + 0.86, win.z); g.add(counter);

    // ⚠️ THE MENU BOARD — the tycoon UI, made diegetic. The prices you charge hang on a
    // board in your own truck where the customer can read them too, instead of living in
    // a DOM panel over the world. `this.board` is repainted whenever a price or the stock
    // changes; see refreshBoard().
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1),
      new THREE.MeshBasicMaterial({ map: TX.menuBoard([]) }));
    this.board.position.set(T.wide / 2 - 0.09, FLOOR + 1.55, win.z - 0.15);
    this.board.rotation.y = -Math.PI / 2; g.add(this.board);
    this._boardKey = '';
    const cFront = box(0.06, 0.80, 2.1, 0xe4ded0);
    cFront.position.set(-(T.wide / 2 - 0.50), FLOOR + 0.44, win.z); g.add(cFront);
    const till = box(0.30, 0.20, 0.42, 0x5a564f);
    till.position.set(-(T.wide / 2 - 0.28), FLOOR + 1.00, win.z + 0.72); g.add(till);

    // THE CHURN MACHINE, right at the back
    const ch = at('churn');
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.86, 16), lam({ color: 0xc9ced2 }));
    barrel.position.set(ch.x, FLOOR + 0.92, ch.z + 0.18); g.add(barrel);
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.15, 0.32, 16), lam({ color: 0xdfe4e7 }));
    hopper.position.set(ch.x, FLOOR + 1.50, ch.z + 0.18); g.add(hopper);
    this.churnLever = box(0.05, 0.30, 0.05, 0x8a3f34);
    this.churnLever.position.set(ch.x + 0.30, FLOOR + 0.85, ch.z + 0.18); g.add(this.churnLever);
    // topping tubs on a shelf above it, in the mix-in colours
    const shelf = box(0.28, 0.05, 1.3, 0xb5aa96);
    shelf.position.set(T.wide / 2 - 0.20, FLOOR + 1.42, ch.z + 0.75); g.add(shelf);
    [0x6b4632, 0xd8a05a, 0xe86b86, 0xf0e07a, 0x8fd8c0].forEach((c, i) => {
      const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.072, 0.13, 10), lam({ color: c }));
      tub.position.set(T.wide / 2 - 0.20, FLOOR + 1.50, ch.z + 0.25 + i * 0.25); g.add(tub);
    });

    // ---- THE CAB, furnished. A seat is not a box and a dash is not a shelf. ----
    const seat = at('seat');
    // sprung bench seat: cushion, piped backrest, headrest, pedestal
    const cush = box(0.48, 0.14, 0.46, 0x7a4a3a);
    cush.position.set(seat.x, FLOOR + 0.50, seat.z); g.add(cush);
    const pipe1 = box(0.48, 0.03, 0.48, 0x5a352a);
    pipe1.position.set(seat.x, FLOOR + 0.58, seat.z); g.add(pipe1);
    const backr = box(0.48, 0.62, 0.14, 0x7a4a3a);
    backr.position.set(seat.x, FLOOR + 0.90, seat.z - 0.26); backr.rotation.x = -0.08; g.add(backr);
    const head = box(0.30, 0.16, 0.10, 0x5a352a);
    head.position.set(seat.x, FLOOR + 1.30, seat.z - 0.30); g.add(head);
    const ped = box(0.34, 0.36, 0.34, 0x3a3632);
    ped.position.set(seat.x, FLOOR + 0.20, seat.z); g.add(ped);

    // the dash carries INSTRUMENTS now, not just a slab: binnacle, gauges, radio, vents
    const dash = box(T.wide - 0.10, 0.24, 0.40, 0x4a4038);
    dash.position.set(0, 1.78, T.len / 2 - 0.32); g.add(dash);
    const binn = box(0.5, 0.16, 0.12, 0x3a3632);
    binn.position.set(seat.x, 1.94, T.len / 2 - 0.30); binn.rotation.x = -0.35; g.add(binn);
    for (const [gx, gc] of [[-0.13, 0xdfe9ee], [0.02, 0xdfe9ee], [0.15, 0xe8a63a]]) {
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12),
        lam({ color: gc, emissive: 0x1f2a30 }));
      dial.rotation.x = Math.PI / 2 - 0.35;
      dial.position.set(seat.x + gx, 1.97, T.len / 2 - 0.24); g.add(dial);
    }
    // THE RADIO — the bible's business surface (weather + Frostline chatter, later)
    const radio = box(0.34, 0.12, 0.08, 0x2f2a24);
    radio.position.set(0, 1.86, T.len / 2 - 0.26); g.add(radio);
    const dialR = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10),
      lam({ color: 0xe8b04b }));
    dialR.rotation.x = Math.PI / 2; dialR.position.set(0.10, 1.86, T.len / 2 - 0.235); g.add(dialR);
    for (const vx of [-0.75, 0.75]) {
      const vent = box(0.16, 0.07, 0.03, 0x3a3632);
      vent.position.set(vx, 1.90, T.len / 2 - 0.26); g.add(vent);
    }
    // steering column + wheel with a horn cap, pedals, gear lever, sun visor
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 8), lam({ color: 0x3a3632 }));
    col.rotation.x = 1.2; col.position.set(seat.x, 1.80, T.len / 2 - 0.44); g.add(col);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.03, 8, 20), lam({ color: 0x59504a }));
    wheel.position.set(seat.x, 1.98, T.len / 2 - 0.52); wheel.rotation.x = 1.2; g.add(wheel);
    const hornCap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), lam({ color: 0x8a3f34 }));
    hornCap.rotation.x = 1.2; hornCap.position.set(seat.x, 1.98, T.len / 2 - 0.52); g.add(hornCap);
    for (const px of [-0.10, 0.08]) {
      const pedal = box(0.10, 0.03, 0.14, 0x2f2a24);
      pedal.position.set(seat.x + px, FLOOR + 0.10, T.len / 2 - 0.50);
      pedal.rotation.x = -0.5; g.add(pedal);
    }
    const lever = box(0.03, 0.30, 0.03, 0x3a3632);
    lever.position.set(seat.x - 0.34, FLOOR + 0.62, seat.z + 0.30); lever.rotation.z = 0.25; g.add(lever);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lam({ color: 0xe8dfc6 }));
    knob.position.set(seat.x - 0.38, FLOOR + 0.78, seat.z + 0.30); g.add(knob);
    const visor = box(0.55, 0.02, 0.16, 0x5a544c);
    visor.position.set(seat.x, 2.68, T.len / 2 - 0.18); visor.rotation.x = 0.35; g.add(visor);
    // the rear-view mirror — you can't see behind, but a cab without one reads wrong
    const rvm = box(0.30, 0.09, 0.03, 0x2f2a24);
    rvm.position.set(0, 2.58, T.len / 2 - 0.22); g.add(rvm);

    const clipS = at('clipboard');
    const clip = box(0.28, 0.02, 0.36, 0xe8dfc6);
    clip.position.set(clipS.x, 1.92, T.len / 2 - 0.36); clip.rotation.x = -0.16; g.add(clip);
    // a coffee ring and a pencil on the clipboard — FRESH CUT's notebook, transposed
    const pencil = box(0.015, 0.015, 0.16, 0x8a3f34);
    pencil.position.set(clipS.x + 0.09, 1.935, T.len / 2 - 0.34); pencil.rotation.y = 0.5; g.add(pencil);

    // ⚠️ THE INTERIOR NEEDS ITS OWN LIGHT. The hemisphere light gives downward-facing
    // faces the GROUND colour, so the ceiling of an enclosed box renders near-black and
    // the whole bay looks like a cave. One cheap point light is the difference between
    // "inside a truck" and "inside a cave".
    const bulb = new THREE.PointLight(0xfff2da, 1.5, 8.5, 1.2);
    bulb.position.set(0, D.TRUCK.high - 0.35, -0.6); g.add(bulb);
    const bulb2 = new THREE.PointLight(0xfff2da, 1.0, 6.5, 1.2);
    bulb2.position.set(0, D.TRUCK.high - 0.35, 1.4); g.add(bulb2);
    // and a strip over the serving counter, so the window is a lit shop and not a hole
    const bulb3 = new THREE.PointLight(0xfff6e4, 0.9, 4.0, 1.3);
    bulb3.position.set(-0.35, 2.35, D.STATION_BY_ID.window.z); g.add(bulb3);
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

    const hu = this.hatch.userData;
    const want = sim.windowOpen ? hu.open : hu.shut;
    this.hatch.position.y += (want - this.hatch.position.y) * Math.min(1, dt * 6);

    this._refreshBoard(sim);
    this._holdItem(sim);

    // ⚠️ THE SAFETY KIT WORKS WHILE YOU SERVE — the same statute as the mirror. The stop
    // arm swings out and the flashers blink amber whenever you're parked with the window
    // open, and fold away when you pull off. View-only; the sim never reads them.
    const serving = sim.truck.parked && sim.windowOpen;
    // ⚠️ MINUS. The arm hangs on the kerb-side (local -x) corner and rotation.y maps its
    // pole (local +z) to (sin θ, 0, cos θ) — so +π/2 swings it INTO the bodywork and out
    // through the far side. -π/2 is "out over the kerb", where a stop arm goes.
    const armWant = serving ? -Math.PI / 2 : 0;
    this.stopArm.rotation.y += (armWant - this.stopArm.rotation.y) * Math.min(1, dt * 4);
    const blink = serving && (t % 0.9 < 0.45);
    for (const fl of this.flashers) fl.material.emissive.setHex(blink ? 0xcc7a10 : 0x000000);

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

  /** Repaint the menu board only when something on it actually changed. */
  _refreshBoard(sim) {
    if (!this.board) return;
    const rows = sim.menu().map(m => ({
      label: m.label, price: '$' + (sim.priceOf(m.key) / 100).toFixed(2),
      out: (sim.stock[m.key] || 0) <= 0,
    }));
    const key = rows.map(r => r.label + r.price + r.out).join('|');
    if (key === this._boardKey) return;
    this._boardKey = key;
    if (this.board.material.map) this.board.material.map.dispose();
    this.board.material.map = TX.menuBoard(rows);
    this.board.material.needsUpdate = true;
  }

  /**
   * ⚠️ WHAT IS IN YOUR HANDS HAS TO BE VISIBLE. Carrying was a line of text in a panel,
   * which is the same mistake as the menu buttons: the truck is the interface, so the
   * cone you are holding belongs in front of your face, not in the HUD. Parented to the
   * TRUCK, positioned in truck-local space at the crew's own position — so it rides along
   * exactly like the person holding it.
   */
  _holdItem(sim) {
    const key = sim.crew.hands;
    if (key !== this._heldKey) {
      this._heldKey = key;
      if (this.held) { this.truck.remove(this.held); this.held = null; }
      if (key) this.held = this._makeTreat(sim.itemOf(key));
      if (this.held) this.truck.add(this.held);
    }
    if (!this.held) return;
    const cr = sim.crew;
    // ⚠️ In your RIGHT hand, in frame. `right` is (-cos, sin), so a POSITIVE lat is the
    // right hand; negative put it out past the left edge of the screen where you could
    // only half see it. Held low enough to read as carried, high enough to stay on screen.
    const s = Math.sin(cr.yaw), c = Math.cos(cr.yaw);
    const fwd = 0.52, lat = 0.24;
    this.held.position.set(cr.x + s * fwd - c * lat, 0.62 + D.CREW.eye - 0.26, cr.z + c * fwd + s * lat);
    this.held.rotation.y = cr.yaw;
  }

  /** A little mesh for whatever you're carrying, built from what kind of thing it is. */
  _makeTreat(item) {
    if (!item) return null;
    const g = new THREE.Group();
    const k = item.key;
    const cone = () => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 10), lam({ color: 0xe8c98a }));
      c.rotation.x = Math.PI; c.position.y = -0.05; g.add(c);
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.052 - i * 0.009, 10, 8),
          lam({ color: 0xf6ece0 }));
        s.position.y = 0.045 + i * 0.035; g.add(s);
      }
    };
    const stick = (col) => {
      const b = box(0.05, 0.16, 0.025, col); b.position.y = 0.03; g.add(b);
      const st = box(0.012, 0.07, 0.012, 0xd8c9a0); st.position.y = -0.08; g.add(st);
    };
    if (k === 'cone') cone();
    else if (k === 'scoop') {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.07, 12), lam({ color: 0xf2ece0 }));
      g.add(cup);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lam({ color: 0xf6d9c0 }));
      s.position.y = 0.05; g.add(s);
    }
    else if (k === 'eyes') stick(0x6b4632);
    else if (k === 'bomb') {
      stick(0xd8453a);
      const w = box(0.052, 0.05, 0.027, 0xf2f0ea); w.position.y = 0.03; g.add(w);
      const b2 = box(0.052, 0.05, 0.027, 0x3f6fd4); b2.position.y = -0.02; g.add(b2);
    }
    else if (k === 'pop') { const t = box(0.03, 0.20, 0.03, 0xe86b86); t.position.y = 0.02; g.add(t); }
    else if (item.invented) {
      // whatever you made takes the shape of the base it was churned from
      const base = item.recipe && item.recipe.base;
      if (base === 'bar') stick(0x8a5a3a);
      else if (base === 'ice') { const t = box(0.03, 0.20, 0.03, 0x8fd8c0); t.position.y = 0.02; g.add(t); }
      else cone();
    } else cone();
    return g;
  }

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
