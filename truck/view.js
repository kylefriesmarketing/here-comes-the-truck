// HERE COMES THE TRUCK — view.js  (VIEW ONLY. Math.random is fine; the sim never reads this.)
//
// Graybox Hazel Park, built from hazel-park.js. Primitives and generated colour, no assets.
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

const C = {
  grass: 0x7ba447, grassDark: 0x5f8636, road: 0x54514c, walk: 0xa8a296,
  kerb: 0x8f8a7e, line: 0xd6cf9e,
  house: [0xd9c9a8, 0xc8d3cf, 0xe0c3b4, 0xcdd4bb, 0xd6c2cc, 0xc3c9d8],
  roof: [0x7d5f4c, 0x6a5b52, 0x8a6b52, 0x5f5a53],
  truck: 0xf4f1e6, pink: 0xef9ec0, cyan: 0x63c3d8, glass: 0x39505c,
  skin: [0xe8b48c, 0xc98b62, 0x8d5a3b, 0xf0c9a8],
  shirt: [0xd4553f, 0x3f6fd4, 0xe8c34a, 0x4fae6a, 0xd47fb0, 0xffffff],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const mat = (c, rough = 0.92) => new THREE.MeshLambertMaterial({ color: c });
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));

export class View {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.people = [];        // pooled figures
    this.byId = new Map();
    this._build();
  }

  _build() {
    const S = this.scene;
    S.background = new THREE.Color(0xbfe0ee);
    S.fog = new THREE.Fog(0xbfe0ee, 90, 260);

    this.amb = new THREE.AmbientLight(0xcfd8e8, 0.62); S.add(this.amb);
    this.sun = new THREE.DirectionalLight(0xfff2d4, 1.05);
    this.sun.position.set(60, 90, 40); S.add(this.sun);
    this.rim = new THREE.DirectionalLight(0xbfd8ff, 0.22);
    this.rim.position.set(-50, 30, -60); S.add(this.rim);

    // ground
    const B = HP.BOUNDS;
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(B.x1 - B.x0 + 120, B.z1 - B.z0 + 120), mat(C.grass));
    g.rotation.x = -Math.PI / 2;
    g.position.set((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2);
    S.add(g);

    // streets: road, both sidewalks, both kerbs, centre dashes
    for (const s of HP.STREETS) {
      const len = s.to - s.from + HP.XS.roadHalf * 2;
      const mid = (s.from + s.to) / 2;
      const along = s.axis === 'x';
      const put = (m, w, d, off, y) => {
        m.rotation.x = -Math.PI / 2;
        m.position.set(along ? mid : s.at + off, y, along ? s.at + off : mid);
        S.add(m);
      };
      const plane = (w, d, c) => new THREE.Mesh(
        new THREE.PlaneGeometry(along ? len : w, along ? w : len), mat(c));

      put(plane(HP.XS.roadHalf * 2, 0, C.road), 0, 0, 0, 0.02);
      for (const side of [-1, 1]) {
        const wWalk = HP.XS.walkOut - HP.XS.kerb;
        put(plane(wWalk, 0, C.walk), 0, 0, side * (HP.XS.kerb + wWalk / 2), 0.05);
        const kb = box(along ? len : 0.22, 0.14, along ? 0.22 : len, C.kerb);
        kb.position.set(along ? mid : s.at + side * HP.XS.kerb, 0.07, along ? s.at + side * HP.XS.kerb : mid);
        S.add(kb);
      }
      // centre line, dashed
      const n = Math.floor((s.to - s.from) / 8);
      for (let i = 0; i < n; i++) {
        const t = s.from + 4 + i * 8;
        const dash = box(along ? 3.2 : 0.16, 0.02, along ? 0.16 : 3.2, C.line);
        dash.position.set(along ? t : s.at, 0.04, along ? s.at : t);
        S.add(dash);
      }
    }

    // houses + a driveway apron each
    this.houses = HP.buildHouses();
    for (const h of this.houses) {
      const st = HP.STREETS.find(s => s.id === h.block);
      const alongX = st.axis === 'x';
      const w = alongX ? HP.XS.houseWide : HP.XS.houseDepth;
      const d = alongX ? HP.XS.houseDepth : HP.XS.houseWide;
      const body = box(w, 4.0, d, pick(C.house));
      body.position.set(h.x, 2.0, h.z); S.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.1, 4), mat(pick(C.roof)));
      roof.position.set(h.x, 5.05, h.z);
      roof.rotation.y = Math.PI / 4 + (alongX ? 0 : Math.PI / 2);
      S.add(roof);
      // a door, so you can see where they come out of
      const door = box(alongX ? 1.0 : 0.12, 1.9, alongX ? 0.12 : 1.0, 0x6b4f3a);
      door.position.set(h.door.x, 0.95, h.door.z); S.add(door);
      // the path from the door to the kerb
      const pathLen = Math.hypot(h.kx - h.door.x, h.kz - h.door.z);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, pathLen), mat(C.walk));
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = -Math.atan2(h.kx - h.door.x, h.kz - h.door.z);
      p.position.set((h.kx + h.door.x) / 2, 0.03, (h.kz + h.door.z) / 2);
      S.add(p);
    }

    this.truck = this._truck();
    S.add(this.truck);
  }

  /**
   * The truck. FRESH CUT's makeCar('icecream') silhouette — a 4.6 m cream box with a
   * pink panel, a cyan stripe and a cone on the roof — rebuilt facing +Z, with the two
   * things a background prop never needed: a cab you sit in and a window that opens.
   */
  _truck() {
    const T = D.TRUCK;
    const g = new THREE.Group();
    const body = box(T.wide, 2.05, T.len, C.truck);
    body.position.y = 1.28; g.add(body);

    // ⚠️ THE WINDSCREEN MUST BE TRANSPARENT. The camera sits inside the cab, behind this
    // pane — as an opaque box it fills the entire first-person view with a dark navy
    // rectangle and the game looks broken while every sim number reads perfectly.
    const ws = new THREE.Mesh(new THREE.BoxGeometry(T.wide * 0.94, 0.86, 0.06),
      new THREE.MeshLambertMaterial({ color: 0xbfd8e0, transparent: true, opacity: 0.17, depthWrite: false }));
    ws.position.set(0, 1.76, T.len / 2 - 0.05); ws.renderOrder = 3; g.add(ws);

    // The dash, so the cab reads as a place you are sitting rather than a floating camera.
    // ⚠️ SIDES. local +X is the truck's LEFT (because right = -localX, see the header), so
    // the driver — and the wheel — sit at +X. Put the wheel at -X and it appears on the
    // passenger side while the camera looks from the driver's seat, which reads as a bug.
    const dash = box(T.wide * 0.94, 0.26, 0.42, 0x4a4038);
    dash.position.set(0, 1.18, T.len / 2 - 0.30); g.add(dash);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 8, 18), mat(0x2e2823));
    wheel.position.set(0.42, 1.42, T.len / 2 - 0.58); wheel.rotation.x = 1.2; g.add(wheel);
    // the clipboard, on the dash on the passenger side, where the tycoon UI actually lives
    const clip = box(0.28, 0.02, 0.36, 0xe8dfc6);
    clip.position.set(-0.46, 1.33, T.len / 2 - 0.36); clip.rotation.x = -0.16; g.add(clip);

    // the painted flank + stripe, on the LEFT side (local +X) — see the header note:
    // the truck's RIGHT, where the serving window goes, is local -X.
    for (const sx of [1]) {
      const panel = box(0.06, 0.72, 2.3, C.pink);
      panel.position.set(sx * (T.wide / 2 + 0.02), 1.5, -0.35); g.add(panel);
      const stripe = box(0.06, 0.18, 2.3, C.cyan);
      stripe.position.set(sx * (T.wide / 2 + 0.02), 1.02, -0.35); g.add(stripe);
    }

    // THE SERVING WINDOW, on local -X. The hatch slides up.
    // ⚠️ THIS MUST BE A FRAME WITH A HOLE IN IT, not a pane. The window camera sits just
    // inside it and looks OUT — a solid box here (of any colour) fills the entire poster
    // shot, and because every sim number still reads perfectly it looks like the renderer
    // has died rather than like a missing hole. Four bars around an opening.
    const X = -(T.wide / 2 + 0.02);
    const bar = (h, d, y, z) => { const m = box(0.08, h, d, 0x3a3a38); m.position.set(X, y, z); g.add(m); };
    bar(0.10, 2.10, 2.12, -0.1);        // header
    bar(0.90, 0.10, 1.62, 0.90);        // forward jamb
    bar(0.90, 0.10, 1.62, -1.10);       // rear jamb
    // the sill you lean on, and hand things across
    const sill = box(0.40, 0.10, 2.10, 0xe9e2cf);
    sill.position.set(-(T.wide / 2 + 0.10), 1.14, -0.1); g.add(sill);

    // the hatch, which slides up out of the way when you open the window
    this.hatch = box(0.09, 0.90, 1.94, C.truck);
    this.hatch.position.set(X - 0.05, 1.62, -0.1); g.add(this.hatch);

    // the cone on the roof, which is the whole reason anyone looks up
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 10), mat(0xf6d9a0));
    cone.position.set(0, 2.72, -0.6); cone.rotation.x = Math.PI; g.add(cone);
    const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(0xf2a0b4));
    scoop.position.set(0, 3.1, -0.6); g.add(scoop);

    // the speaker horn the song comes out of
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 8), mat(0x9a938a));
    horn.position.set(0, 2.5, 1.1); horn.rotation.x = -Math.PI / 2; g.add(horn);

    this.wheels = [];
    for (const z of [T.axleFront, T.axleRear]) for (const x of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 12), mat(0x1b1b1e));
      w.rotation.z = Math.PI / 2;
      w.position.set(x * (T.wide / 2 - 0.06), 0.42, z);
      g.add(w); this.wheels.push(w);
    }

    // ⚠️ THE MIRROR itself, up on the nose. It is the reason you look, so it has to be
    // somewhere you can actually see from the cab.
    // It has to be BRIGHT and it has to be where you are already looking, or the ritual
    // never forms. A dark stick in the corner is not a mirror you check.
    // ⚠️ SIZE IT BY THE ANGLE IT SUBTENDS FROM THE CAB, not by what looks right in the
    // model. At r 0.3 and 1.5 m from the driver's eye it fills a fifth of the screen and
    // blocks the road. At r 0.16 and ~1.8 m out it sits small and high, where a real one is.
    const arm = box(0.045, 0.045, 0.5, 0x8e8880);
    arm.position.set(0, 2.06, T.len / 2 + 0.34); g.add(arm);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 18), mat(0x6f6862));
    rim.position.set(0, 2.10, T.len / 2 + 0.62); rim.rotation.x = -0.5; g.add(rim);
    this.mirror = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0xdfe9ee, emissive: 0x33454f }));
    this.mirror.position.set(0, 2.10, T.len / 2 + 0.62);
    this.mirror.rotation.x = Math.PI * 0.66; g.add(this.mirror);

    return g;
  }

  _person(kid) {
    const g = new THREE.Group();
    const h = kid ? 1.15 : 1.75;
    const shirt = box(0.38, h * 0.34, 0.24, pick(C.shirt));
    shirt.position.y = h * 0.62; g.add(shirt);
    const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.115, 10, 8), mat(pick(C.skin)));
    head.position.y = h * 0.90; g.add(head);
    g.legs = [];
    for (const x of [-0.11, 0.11]) {
      const l = box(0.13, h * 0.44, 0.14, 0x3f4a63);
      l.position.set(x, h * 0.22, 0); g.add(l); g.legs.push(l);
    }
    g.arms = [];
    for (const x of [-0.25, 0.25]) {
      const a = box(0.1, h * 0.3, 0.1, shirt.material.color.getHex());
      a.position.set(x, h * 0.62, 0); g.add(a); g.arms.push(a);
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

    // the hatch slides up when the window opens
    const want = sim.windowOpen ? 2.56 : 1.62;
    this.hatch.position.y += (want - this.hatch.position.y) * Math.min(1, dt * 6);

    // people
    const seen = new Set();
    for (const p of sim.people) {
      seen.add(p.id);
      let v = this.byId.get(p.id);
      if (!v) { v = this._person(p.kid); this.scene.add(v); this.byId.set(p.id, v); }
      v.position.set(p.x, 0, p.z);
      if (p.face !== undefined) v.rotation.y = p.face;
      const moving = p.state === 'walk' || p.state === 'toWindow' || p.state === 'leaving';
      const ph = t * (p.kid ? 9 : 6.5);
      v.legs[0].rotation.x = moving ? Math.sin(ph) * 0.6 : 0;
      v.legs[1].rotation.x = moving ? -Math.sin(ph) * 0.6 : 0;
      // ⚠️ a kid in the mirror WAVES. Nothing bad happens; this is the whole point.
      const inMirror = sim.mirrorBlocker() === p;
      v.arms[0].rotation.z = inMirror ? Math.sin(t * 9) * 0.5 - 2.3 : (moving ? -Math.sin(ph) * 0.4 : 0);
      v.arms[1].rotation.z = moving ? Math.sin(ph) * 0.4 : 0;
    }
    for (const [id, v] of this.byId) {
      if (seen.has(id)) continue;
      this.scene.remove(v); this.byId.delete(id);
    }

    this._light(sim);
  }

  /**
   * ⚠️ THE LIGHT RUNS OFF THE CLOCK, NOT OFF PROGRESS. FRESH CUT drives its golden hour
   * from `grass.pct()` so the arc always lands however long you take — correct for a game
   * with no clock, and exactly wrong here. This day ends at dusk whether you sold out or
   * sold nothing, and the sky has to agree with the freezer.
   */
  _light(sim) {
    const f = Math.max(0, Math.min(1, (sim.hour - D.DAY.startHour) / (D.DAY.duskHour - D.DAY.startHour)));
    const e = f * f;                              // the last hour does most of the work
    const sky = new THREE.Color(0xbfe0ee).lerp(new THREE.Color(0xf0a86a), e * 0.9);
    this.scene.background = sky;
    this.scene.fog.color = sky;
    this.sun.color.setHex(0xfff2d4).lerp(new THREE.Color(0xff9a4a), e);
    this.sun.intensity = 1.05 - e * 0.45;
    this.sun.position.set(60 - f * 120, 90 - e * 66, 40);
    this.amb.intensity = 0.62 - e * 0.16;
  }
}
