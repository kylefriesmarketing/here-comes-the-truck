# HERE COMES THE TRUCK

**an ice cream truck tycoon · Hazel Park · a DIRTY BOY DEVS game**

> One truck, twelve hours of cold, and a whole town that comes out when it hears you.

**Phase 0 — the graybox slice.** Building the spine to answer one question:

> Is *drive a block badly → play the song → three kids come running → get the orders
> wrong → count $9 at dusk → afford a better freezer* **fun for twenty minutes in
> graybox?**

Design bible: `HERE-COMES-THE-TRUCK-BIBLE.md` in the workspace root. **This README is
the milestone authority** — where the bible and this file disagree about what is
*built*, this file wins.

## Run it

```
PLAY-TRUCK.bat          serve on :8456 and open a browser
TEST-TRUCK.bat          the soak battery + the controlled trials
DEPLOY-TRUCK.bat "msg"  commit and push
```

No build step. No npm. No CDN. Three.js r160 is vendored at `lib/three.module.js`.

*a DIRTY BOY DEVS game*
