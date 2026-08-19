# HERE COMES THE TRUCK

**an ice cream truck tycoon · Hazel Park · a DIRTY BOY DEVS game**

> One truck, twelve hours of cold, and a whole town that comes out when it hears you.

**Play:** https://kylefriesmarketing.github.io/here-comes-the-truck/

---

## Status — M6, the machine and the great un-wedging · 2026-08-18

**The soft-serve machine is a real chore (§10, with P4 teeth — no dice):** grime climbs
per cone, past 55% the cones taste of yesterday (a rep drip, and they say so), past 95%
**the spigot refuses** until you shut the window, stand at it, and give it its 60 seconds.
Grime survives the night. E at the spigot pulls a cone with the window open and starts
the clean with it shut — one button, disambiguated by the truck, like the seat.

**And the machine test caught the biggest bug in the game:** any customer kicked or timing
out at the window left without `_requeue()` — slot 0 orphaned, `serving` null, the whole
line wedged until everyone's patience expired. **The policy bot had been wedging its own
queue on every balk in every trial ever run.** Fixed with a self-healing line. Baseline
gross jumped $41→$65/day and the trial noise floor collapsed from 54–101% to **13–29%**
— the wedge WAS most of the noise. Everything measured before M6 needs re-reading.

Post-fix corrections the cleaner measurements forced: the **churn runs in parallel** now
(stop-the-world cost more than any flavour earned once window time was worth something);
**heat rebudgeted** into a first-order enemy (the scorcher now takes 39% less AND ends
0.5 h earlier); the **cone listed above every street ceiling but one** and never sold at
default prices; and the **wide hatch's `serveMul` was a dead knob** — wiring it exposed
`queueAdd` as actively harmful (−20%), so the hatch now honestly sells walking speed.
Watch items: the bay pays ~0% at n=6 (want-selection is uniform — the appeal stats don't
drive demand yet; that's the next system), and the hatch reads −0%.

## Status — M5, the weather and the radio · 2026-08-17

**Per-day weather** (§6): mild / warm / hot / **scorcher**, rolled from a salted hash of
(seed, day). `outMul` scales how readily the song pulls people out; `heatMul` scales what
the day does to the box. Measured (Trial E, n=6): **the scorcher takes 35% less than the
warm band** — "hotter is better" is structurally false, which is what makes a stay-home
day thinkable. **The radio works** (R key): WHZL, The Porch — a tracked lo-fi synth pad —
and the forecast is the first thing you hear each morning, because it is planning
information now, not colour. The off flank wears a painted row of the actual menu.
⚠️ Trials pin `weather:'warm'` — the moment weather entered the sim, every existing cell
silently inherited a fresh confounder. Watch item: MILD edges warm at n=6 (slower drain =
longer day); borderline vs the noise floor, not tuned.

## Status — M3/M4, the truck is a place · 2026-08-12→17

**M3 — walkable interior (Kyle's call: "the truck should be a moveable space").** The crew
lives in **truck-local space** (moves with the truck for free). WASD walks when you're out
of the seat, mouse looks, **E uses whatever you're facing**, F puts it back. One pair of
hands. Stations replace menus — the §7 "cramped topology", laid out to break the kitchen
work triangle on purpose: kids' bars forward-left, soft serve back on the kerb side, the
window between them. **The seat is a station**: getting up parks you; sitting back down is
where the mirror check lives. Menu buttons are DELETED — you fetch what they ask for.
The camera collapsed to one thing: the crew's own eyes.

**M4 — the truck looks like the truck.** Painted livery on BOTH flanks (canvas art: band,
pinstripe, scoop, CY'S), step-van shell with chassis/skirt/fenders/wheel wells, snout,
bumpers, grille, wing mirrors, scalloped awning, swirl cone. Interior: chequer-plate
floor, steel counter, **a diegetic chalkboard menu** carrying your real prices (repainted
on change — the tycoon UI made physical), interior lights, and a visible held item shaped
by what it is. Cab furnished: sprung seat, binnacle + gauges, radio, vents, pedals, gear
lever, visor, rear-view, horn cap, pencil on the clipboard. Rear: door seams + hinges,
**the SLOW CHILDREN CROSSING sign**, amber flashers that blink while serving, and **a
stop arm that swings out over the kerb** — the same 1978 Detroit statute as the mirror.
Yards fixed: `yardBand()` in the map module + a battery assertion, because trees stood in
the road (see trap 41).

## Phase 2, the churn bay · 2026-08-11

**The fourth pillar, "invent the treats" — and the last unbuilt item in the bible's own
v0.1 slice.** Park, turn around, three steps: a modelled bay in the back of the truck with
a churn machine, a counter, topping tubs and the freezer chest.

Pick a base, up to two mix-ins and a finish. Every recipe resolves to **four stats** —
sweet (what children want), novel (what adults want, and what buys headroom over a
street's price ceiling), melt (how long it survives a warming box), cost. The flavour
**names itself** from its ingredients ("cookie-bubblegum custard, with sprinkles"), joins
the menu, and can be sold the same afternoon. Three **secret Legendaries**, never listed,
found by experiment and by Cy saying something that turns out not to be small talk.

Churning costs 38 s of your afternoon and a bite of the cold, out of the same box you're
selling from, with the window shut. That's the whole decision.

| what you churned | takings | vs not churning |
|---|---|---|
| nothing — sell the depot lines | $41.00 | — |
| plain water ice | $37.63 | **−8%** |
| cookie-bubblegum custard | $45.34 | +11% |
| The Midnight *(legendary)* | $46.16 | **+13%** |

Inventing badly loses money, inventing well pays, and the Legendary is best. Not inverted.

## Phase 1, a reason to come back · 2026-08-11

On top of Phase 0: **six truck upgrades** bought from the clipboard on the dash (the
second cold plate measures **+1.3 h of afternoon and +23% takings** — the kill-gate's
"afford a better freezer" pays) · **five named regulars** from the bible with four strings
each, so the day ends on somebody's name · **Cy's route sheet** in his handwriting on the
back of the clipboard · multi-day carry of cash, standing, prices, upgrades and who has
met you · and a third trial that guards the progression curve.

**Kyle's playtest fixes (same day):** the steering was **inverted** — a real bug, now
asserted against world space, not against the bot's own convention. Plus the whole visual
pass below.

### The visual pass
A generated texture kit (`truck/tex.js`): grass with mown stripes and clover, patched
asphalt, scored concrete, clapboard siding, brick, asphalt shingle, and **faces**.
Houses now roll footprint, storeys, siding-vs-brick, roof pitch and colour, a window grid
with frames and sills that light up at dusk, a door with a step, a porch, a chimney, a
driveway with a car, hedges, trees, flowers and a mailbox. People have faces (eyes with
highlights, brows, cheeks, a mouth that differs kid-to-adult), hair, hands and shoes.
Real shadows, a shadow camera that follows the truck, and the windscreen is a **frame**
rather than a tinted pane.

## Phase 0 — the graybox slice

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

### Phase 1 — found by playtest and by the battery
23. **⚠️⚠️ THE STEERING SHIPPED INVERTED, and only a human caught it.** Every automated
    number looked perfect because the policy bot steers by its own convention — it was
    *self-consistently wrong*. `D` must turn right, and right is `(-cos yaw, sin yaw)`,
    which is reached by **decreasing** yaw. The soak now asserts against WORLD SPACE
    (from yaw 0, pressing D must send x negative). Never test a convention against
    something that shares the convention.
24. **Every roof in town rendered pure black, for TWO independent reasons**, and fixing
    either one alone left it black: the hand-built gable had its **winding** backwards
    (normals pointing down and inward) *and* had **no `uv` attribute at all**, so a
    mapped material sampled undefined coordinates. If a custom BufferGeometry renders
    black, check both — `geometry.attributes.uv` being undefined is the one people miss.
25. **The hair cap swallowed every face.** `SphereGeometry` with `thetaLength 0.62π`
    sweeps 112° from the top pole — past the equator — so it wrapped straight over the
    face plane. Faces were built, correct, and invisible. 0.45π.
26. **People at the window presented the back of their heads.** `p.face` is set by
    `_moveTo` and goes stale the instant somebody stops, and queue slots are *beside* the
    truck — so the one camera meant to see their faces never did. They now look at you.
27. **Faces go on a PLANE parked on the front of the head, never wrapped onto the sphere.**
    Sphere UVs put u=0.25 at +Z, not u=0.5, so a wrapped face lands on the ear.
28. **Roof colours must be lighter than they look in a swatch** — the shingle texture lays
    a 28%-black line under every course.
29. **Don't box the cab in.** A modelled floor, ceiling and door wall was tried: at 0.5 m
    from the eye the wall alone eats a third of the frame and the windscreen becomes a
    letterbox. Pillars + header + dash are enough. Also size A-pillars and the mirror by
    the **angle they subtend from the driver's eye**, not by what looks right in the model.
30. **Three of five named regulars went unmet across 24 days**, for three stacked reasons:
    the serving window is always on the truck's right and the loop is one-way, so the far
    side of every street is structurally under-served (13–16 come-outs, **zero** serves,
    vs 16/16 for one on the near side); the bot's post-stop cooldown phase-locked it onto
    every other house; and that cooldown made it drive past everyone who came out *while
    it was parked*. Regulars now live on the kerb side, and the assertion was rewritten
    from "the bot's route reaches them" (which tests the bot) to **"every regular is
    servable at their own door"** (which tests the game).
31. **Marge could never buy her own usual** — a $3.50 cone on a $3.00 street. A regular
    now never balks at their usual, which is what loyalty IS and is the mechanical reason
    "they know your name" is worth money.
32. **Two upgrades measured at exactly 0%.** `speedMul` bought nothing because the day is
    limited by cold, not distance; `stockAdd` bought nothing because you started with more
    of every line than you could sell. Dead money is the same bug as an inverted curve —
    Trial C exists to catch it, and base stock is now tight enough to run dry.
33. **Assert on the low-variance side.** Trial B's *cost* (annoy, heat) is near
    deterministic; its *benefit* arrives through takings whose spread is 54–101% of the
    mean, so at n=6 it is simply not resolvable. The trial now says so out loud instead
    of being bent until it passes.

### Phase 2 — the churn bay
34. **`continue` in the policy bot's loop froze time.** The `g.step()` that advances the
    sim is at the BOTTOM of the loop, so skipping an iteration while the machine churned
    meant the churn never finished, every trial cell died on the guard, and all four read
    exactly $0.00. Gate the work, don't skip the tick.
35. **A camera position is not a location.** The bay's camera pose existed before any bay
    geometry did, so turning round showed you the empty street *behind* the truck — the
    body box is front-face culled, so there was nothing to stop you seeing through it.
36. **Side walls only in the REAR section.** The bay needs walls or you stand inside your
    own truck looking at somebody's front garden. But walls running the full length are
    exactly what boxed the cab in (trap 29). They stop behind the driver's seat, and the
    window side is walled only *behind* the serving hatch so the opening stays open.
37. **Wheels must sit outboard of the bay floor**, or the tyres poke up through it and
    you are standing in the back of the truck next to a wheel.
38. **Three lookups still went through `D.MENU_BY_KEY`** after the menu became dynamic —
    `_act_change`, `_act_price` and the number keys. An invented flavour is not in `MENU`,
    so serving one threw on `item.rep` at the moment of taking the money. Anything that
    resolves an item key must go through `itemOf()`.
39. **"Does somebody happen to ask for it" is a coin flip, not a test.** With six items on
    the menu and a handful of fresh come-outs at one parked spot, the churn-sale assertion
    failed on an unlucky seed while the mechanism was perfectly fine. Split it: assert the
    invention is *in the order pool*, then force one real sale through.
40. **A legendary floor must actually raise something.** A floor sitting under what the
    ingredients already reach is a decorative label, not a discovery worth hunting — the
    battery now asserts each one lifts at least one stat, as well as lowering none.

### M3/M4 — the truck as a place
41. **Trees stood in the road.** Yard props were placed at `front + <metres>` while the
    run-out was ALSO measured from the house centre — double-counting 2.3 m. Trees landed
    0.2–1.9 m from the street centreline; every mailbox sat on the white line. Placement
    now lives in `hazel-park.js` as `yardBand()` (it is geometry, so it belongs with the
    geometry) and the soak asserts no band reaches the road.
42. **The bot fought itself out of the seat.** It stood up at the top of every parked
    frame and sat back down at the bottom of the same frame — parked once, departed zero
    times, sat there for 489 s of a 545 s day. `leaving` must be decided BEFORE standing.
43. **Nearest-station interact sat you down when you reached for the freezer.** The aisle
    is 1.44 m wide with stations on both walls, so several sit inside reach at once.
    Interaction is DIRECTIONAL (facing cos ≥ 0.35) — also how first-person actually works.
44. **The hatch's open/closed heights were hardcoded** and went stale when the window
    moved; "open" still covered two thirds of the aperture. They live on the mesh now,
    derived from the opening it covers.
45. **The livery drew into a 146-px strip.** `make()` assumed a square canvas; a 5.5×0.8 m
    panel mapped from 1024² left 86% blank cream — the flank looked untouched after being
    painted. `make()` takes [w,h]; always draw across the WHOLE canvas you will map.
46. **The kerb side was a blank white box** — the painted flank was on the truck's LEFT,
    and the serving side, the only side the town ever sees, had nothing. Review a vehicle
    from OUTSIDE, from the side the game is about.
47. **A wheel arch is a hole, not a lump** — cream boxes beside the tyres read as bricks
    glued on. Dark half-cylinder well + torus fender over it.
48. **An enclosed interior needs its own light.** The hemisphere light gives downward
    faces the ground colour, so the ceiling rendered near-black and the bay was a cave.
49. **The stop arm swings MINUS π/2.** It hangs on the kerb-side (local −x) corner and
    rotation.y maps its pole to (sin θ, 0, cos θ) — +π/2 swings it through the bodywork.
50. **The bot must WALK the truck.** Letting it serve from the seat would quietly stop
    the trials measuring the game: walking time is now a real economic cost. A bot that
    teleports measures a truck nobody plays.

### M6 — the machine and the un-wedging
51. **⚠️⚠️ THE QUEUE WEDGED ON EVERY KICK.** A window-timeout or an external kick
    (impossible order, balk) set `state='leaving'` without `_requeue()` — slot 0 orphaned,
    nobody advanced, `serving` stayed null until every queued customer timed out. Measured:
    3 asks in 300 s. The bot had done this on every balk in EVERY trial. The fix is a
    self-heal in `_people` (queue non-empty + no slot 0 → requeue), one line, covers every
    kick path forever. **After any systemic fix, re-baseline every measurement**: gross
    went $41→$65 and the noise floor 54–101% → 13–29%. The wedge WAS the noise.
52. **The cone listed above every street ceiling but Sycamore's** — the best-margin item
    balked at default prices nearly everywhere, found only because a test forced cones on
    Maple. Check every default price against every ceiling.
53. **A multiplier on a term worth 4% of the day is decoration.** The scorcher's 1.9×
    heatMul multiplied drainHeat 0.00026 and Trial E caught the day not shortening.
    Budget moved from base into heat; same warm-day total.
54. **Wiring a dead knob can reveal its neighbour is harmful.** `serveMul` was read by
    nothing (the trap-11 smell); wiring it into walk speed exposed the hatch's `queueAdd`
    at −20% — a deeper queue is people committed to a line the stop ends before serving.
55. **A stop-the-world verb's cost scales with everything else you fix.** The 38 s
    window-shut churn was fine when the queue wedged anyway; un-wedged, it cost more than
    any flavour earned (Trial D at −7%). The machine runs in parallel now; the clean
    stays blocking because being elbow-deep IS the chore.
56. **Test the failure path of the failure path**: the machine test only worked once its
    kicks matched sim reality — and that mismatch is precisely what surfaced trap 51.

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
