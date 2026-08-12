# HERE COMES THE TRUCK

**an ice cream truck tycoon · Hazel Park · a DIRTY BOY DEVS game**

> One truck, twelve hours of cold, and a whole town that comes out when it hears you.

**Play:** https://kylefriesmarketing.github.io/here-comes-the-truck/

---

## Status — Phase 0, the graybox slice · 2026-08-11

The spine, built to answer one falsifiable question before any content exists:

> Is *drive a block badly → play the song → three kids come running → get the orders
> wrong → count $9 at dusk → afford a better freezer* **fun for twenty minutes in
> graybox?**

Built and measured: free-roam driving on four blocks of Hazel Park · the jingle with
HEARD and ANNOYED · people walking out to the kerb · park, kill the song, slide the window
open · orders in kid · making change · shorting a kid as a deliberate act · the mirror ·
the cold budget as the day's clock · the note · `truck-save` · a headless soak battery and
a controlled-trial harness.

**Not built yet, on purpose:** the flavour lab, the regulars, Cy, Frostline, the parlor,
the other towns, the ticket meter's enforcement car, post-processing.

> ⚠️ **This README is the milestone authority.** The bible says what the game *will* be;
> this file says what is *built and measured*. Where they disagree about the present
> tense, this file wins.

Design bible: `HERE-COMES-THE-TRUCK-BIBLE.md` in the workspace root.

## Run it

```
PLAY-TRUCK.bat          serve on :8456 and open a browser
TEST-TRUCK.bat          the soak battery + the controlled trials
DEPLOY-TRUCK.bat "msg"  commit and push
```

No build step, no npm, no CDN. Three.js r160 is vendored at `lib/three.module.js`.
Portable node lives at `C:\Users\kylef\tools\node`. **`.ps1` is silently blocked on this
machine — every piece of automation here is pure `.bat`.**

**Controls:** `W A S D` drive · `SPACE` hold for the song · `E` park / pull away ·
`Q` the window · `1`–`5` serve · `ENTER` correct change · `TAB` the clipboard · `M` mute.

## Architecture

| file | what | rule |
|---|---|---|
| `truck/data.js` | ALL tuning and content | balance changes touch **one** file |
| `truck/hazel-park.js` | the canonical town map | **zero imports** — built to lift to its own repo |
| `truck/game.js` | the entire sim + the policy bot | DOM-free, Node-importable, seeded |
| `truck/main.js` | boot, loop, input, camera, save, `window.__hct` | owns the DOM |
| `truck/view.js` `ui.js` `sfx.js` | view only | `Math.random` allowed here and nowhere else |
| `tests/soak.mjs` | full days through the real sim | ~1.4 s, real exit code |
| `tests/trial.mjs` | controlled economy cells | pinned confounders, n ≥ 4 |

**Invariants.** The song generates the customers. The cold is the clock. The truck is the
interface — no management screen floats above the world. No difficulty selection. Every
hard pressure is a visible countdown. Toys don't bleed; the mirror makes you *look*, it
never punishes. Lowercase, deadpan, warm. The loop ends on a person. Seeded rng in sim
code, `Math.random` view-only.

⚠️ **This game does NOT inherit FRESH CUT's no-fail doctrine.** That is contractual for
FRESH CUT only. What transfers is the *softness* — mercy rounding, praise-only scoring, no
ambushes — not the absence of stakes. A future session will read that bible and try to
declaw this game. Don't let it.

## The debug handle

`window.__hct` drives the whole sim from the console without touching the UI:

```js
__hct.startDay(); __hct.jingle(true); __hct.drive(6, 1, 0);
__hct.park(); __hct.jingle(false); __hct.window(true); __hct.step(15);
__hct.serve();  __hct.change();      // defaults to what they asked for / exact change
__hct.state();                       // one flat snapshot of everything
__hct.renderOnce(); __hct.shot();    // see below
```

## Measured, Phase 0

24 simulated days, seeds 1–24, the policy bot with its own personality roll:

| | |
|---|---|
| takings | **$41.12/day** avg (the bible's kill-gate line is "count $9 at dusk" — a fumbling first day) |
| came out / served / walked off | 73.8 / 23.6 / 37.8 |
| driven | 631 m (the loop is ~460 m) |
| day ends | **24/24 on cold**, avg 0.0% of the box left, avg 18:20 |
| worst block annoy | 0.13 of 1.0 — a well-run day is forgiven overnight |
| battery | 1.4 s · determinism holds · save round-trips byte-identical |

**Price ladder** (n=6, confounders pinned): x0.85 of list is optimal at $51.16; x1.00 gives
$36.94; x1.50 collapses to $24.61 as balks and walk-aways climb. There is a real interior
optimum, so pricing is a decision rather than a slider you max.

⚠️ **Day-to-day spread inside a single cell is 41–156% of the mean.** Two cells closer
together than that are indistinguishable at n=6. Never conclude anything from one day.

## Watch items (measured, not yet acted on)

1. **The grace-period bribe is masked by the queue cap.** Trial B measures 8 s of extra
   song as +0.5 people out — it was +5.0 before the queue worked, because `maxQueue` 5
   saturates and extra arrivals can't be served. The mechanic is sound; the ceiling hides
   it. Revisit when a second serving hatch or a faster window exists.
2. **Days end around 18:20, ~2 h before dusk.** That's the designed tension (a busy day
   costs more cold, so it ends earlier) but it's the *bot's* efficiency. Re-measure against
   a human before touching `COLD.drainBase`.
3. **Pricing below the ceiling is flat.** x0.70 and x0.85 are inside the noise floor of
   each other. There is currently no reward for pricing *high* on a tolerant block, because
   trials move the whole menu at once. Per-block pricing is the interesting version.

---

# ⚠️ TRAPS — every one of these actually bit, in this order

Kept because a green test suite is not a working game, and three of these ran fully green.

### The battery reported GREEN while the game was broken
1. **The truck drove 57 m in an entire day and every other stat looked healthy.** The
   policy bot diverted to the *nearest* waiting customer; the song spawns customers
   around the truck, so there is always somebody nearer than the next corner. It shuffled
   between two houses all afternoon. `soak.mjs` now asserts distance driven — **never
   delete that assertion.**
2. **A shutout is a jam, not bad luck.** 10 of 24 days took $0.00 and the suite was green
   until an explicit "no day takes $0" assertion was added.
3. **Seeds 1–10 all played identically.** The bot's rng was seeded `seed * 2654435761`
   with no pre-hash, so ten consecutive seeds produced a near-identical *first* draw — and
   the first draw picked the personality. Pre-hash the seed the way the sim's LCG does.
4. **The bot needs its own rng stream.** If its coin flips come off `g.rng()`, changing the
   bot's *policy* changes which customers appear — and a controlled trial that moves its
   own confounders measures nothing.

### The sim
5. **`lawnDrag` was a flat 6.5 m/s² against `accel` 3.2, so grass was a hole in the map.**
   Drive onto a verge and the truck can never leave, at any throttle, forever. Surface
   resistance is now mostly speed-proportional with a small constant, and the soak asserts
   no surface's constant part approaches `accel`.
6. **THE MIRROR COULD DEADLOCK THE GAME.** Kerb points lie inside the blind zone and
   `maxQueue` sends the overflow back to their kerbs — so a waiting customer rooted in
   front of the bumper and the truck could never pull away again. A kid *crossing* still
   blocks you for a second (that's the ritual); anyone *waiting* now steps aside. The soak
   asserts it self-clears.
7. **Corner houses stuck out across the neighbouring street's sidewalk.** With houses
   spread evenly along a street, the first one on a cross street lands ~7 m from the other
   street's centreline — and it is 8.2 m wide. Trucks turning that corner wedged into the
   side of it. `CORNER = 14` setback in `hazel-park.js`.
8. **A route must be dense enough that consecutive waypoints are joined by actual road.**
   Jumping from the end of Maple to the middle of Sycamore aims the truck diagonally
   across a garden.
9. **Queue slots are assigned on joining and held.** Deriving position from a sort of the
   current queue renumbers everyone on each arrival, so all five chase a moving slot,
   nobody reaches the front, and `serving` stays null while the counter reads 5.
10. **`reachWindow` was larger than the distance from a kerb to the window**, so customers
    "arrived" without taking a step and the view out of the window was an empty lawn.
11. **Random tenders included a quarter**, so any adult could hand over $0.25 for a $3
    scoop and fall into the kid-is-short branch — turning the game's moral engine into
    background noise. Tenders are now notes that *cover* the price; being short is a
    deliberate case.
12. **Band-based approach speeds deadlock.** The bot braked to a halt at the edge of its
    "stop" band, landed just outside the park threshold, and sat at v=0.00 all day. Target
    speed must go smoothly to zero *at* the goal.
13. **Ask for a SPEED, not a throttle.** Scaling throttle down for corners drove it below
    what rolling resistance demands (0.45 m/s² needs throttle ≥ 0.14) and the truck simply
    stalled in the street.
14. **Escape-if-inside is decided once per rect, from the body centre** — never per probe.
    The two axle probes sit at different depths and each picking its own nearest wall
    pushes them opposite ways. (Inherited from FRESH CUT's README v1.10; also: never
    approximate a building with circles, they bulge ~2 m past the ends.)

### The view
15. **A hidden Browser-pane tab suspends rAF**, so `draw()` never runs, the camera is never
    placed, and a screenshot photographs a default camera at the world origin at ground
    level. It renders as houses either side of a thin dark line with sky above *and* below,
    which reads convincingly as "the camera is upside down". It isn't. Use
    `__hct.renderOnce()`; `__hct.shot()` calls it for you.
16. **The windscreen must be transparent.** As an opaque box in front of the cab camera it
    fills the entire first-person view with a dark rectangle while every sim number reads
    perfectly.
17. **The window must be a FRAME WITH A HOLE, not a pane**, and there must be no dark
    "interior" filler across it — the window camera sits inside it and looks out. A solid
    box of any colour there renders a completely black screen.
18. **local +X is the truck's LEFT.** `right = forward × up = (-cos yaw, sin yaw) = -localX`,
    because the truck faces +Z while a three.js camera faces −Z. The serving window, the
    kerb side and the driver's seat all depend on this. The camera's yaw is the truck's
    yaw + π and `rotation.order` must be `'YXZ'`.
19. **Size the mirror by the angle it subtends from the driver's eye**, not by what looks
    right in the model. At r 0.3, 1.5 m out, it fills a fifth of the screen and blocks
    the road.

### Tooling
20. **`serve.mjs` must build ROOT with `fileURLToPath`, never `URL.pathname`.** This
    workspace path contains a space ("New folder") and pathname keeps it as `%20`, which
    404s every file *while the server looks perfectly healthy.*
21. **The shot receiver lives in this repo** (`tools/shot-receiver.mjs`, port as argv[2]).
    The workspace-root one hardcodes 8399 and concurrent sessions fight over it — one of
    them silently creates a directory named after the port.
22. **Never pipe a base64 screenshot back through a tool result.** POST it to the receiver
    and `Read` the PNG.

---

## The house contract

- **Save key:** `truck-save` → `{ started, days, bestDay, regulars, towns, endings, parlor }`,
  written from first real input. The room reads `days` and counts `regulars`.
  Deep-default migration against one `freshSave()` schema — **never a version wall**, or
  bumping `v` wipes every player.
- **Collectible:** the chrome jingle box — the little music box out of the truck's dash.
  Earn: finish a season with every named regular still on the route.
- **Doorway hint:** `"the truck — the song is how they find you. it's also how the neighbors find you."`
- **Winter variant:** `"the truck — under a tarp in the drive. it'll be back."`
- **Doorway object:** an ice cream truck at the near kerb in the front yard.
- The "the house" link and `a DIRTY BOY DEVS game` both ship.

*a DIRTY BOY DEVS game · Hazel Park · the song is how they find you*
