# Ah Mah Day Us

A Myst-style mechanism island. Four linked rooms of dials, organ pipes and a water clock
interlock into one grand machine that sings when solved.

**Play it:** https://kevin-sotka.github.io/ah-mah-day-us/

**State: iterated.** All four rooms are built, connected and playable from cold load to
finale. See `gdd.md` for the design and
`../../../giga-foundry/runs/ah-mah-day-us/PLAN.md` for the run and its polish backlog.

## Run it

It is a static page, but it must be served over http rather than opened as a file, because
the music is loaded with `fetch` and decoded through WebAudio.

```bash
cd Foundry/games/ah-mah-day-us && python3 -m http.server 8000
```

Then open http://localhost:8000 . Landscape. Works with a mouse or a thumb. Sound on.

## How to play

There is no fail state, no timer, and almost nothing to read. The machine is meant to
explain itself.

1. **The Dial Chamber.** Turn each of the three brass rings until its mark meets the notch
   at the top. When all three line up, the dials lock and a seal burns gold on the hub.
2. **The Pipe Room.** Tap pipes to turn them until the bellows' breath reaches the organ.
   When the air runs through, the organ sounds and its seal burns green.
3. **The Water Clock Court.** Drag the bell weights onto the two pans. The balance tips,
   the water runs faster or slower, and the clock's hand follows. Rest the hand in the pale
   arc and the clock keeps time. Its seal burns aqua.
4. **The Keystone Hall.** Three lamps, one per room, left to right in island order. Once
   all three are lit, tap the three seals' marks in lamp order. The machine sings.

5. **The island.** When the machine sings, the card says the island is yours to wander.
   **Step outside** and you are on it: a miniature of the whole island at golden hour, seen
   from above like a model on a table. You are a small brass automaton the machine woke,
   standing outside the Keystone Hall's shut doors. The hall stays shut; you can knock.

The seals are drawn fresh every visit, so the answer has to be read, not remembered. Use the
arrows at the screen edges to walk between rooms (arrow keys on a keyboard). Once all three
machines run, the three lights in the top right corner take you straight to the hall.

## The island

Reached from the finale card (**Step outside**), or directly with `?scene=island` for
testing (tap the title card once, for audio).

| | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Wander | WASD or arrows | drag anywhere on the left half | left stick |
| Jump | Space | the big button | A |
| Roll | Shift (or C) | the curled arrow | B |
| Kick | E (or F, K) | the kick button | X or Y |
| Zoom | mouse wheel | pinch | |
| Leave | Esc or the x | the x | Start |

Narrow trails run from the hall steps to the south beach, the rocky west point and the
jetty in the east cove, under palms and through bushes that part and shiver as you push
through them. Wade into the shallows; kick the surf. Stand still and the automaton turns
to the sun and looks up, and the camera comes down behind it to look with it. Stand still
longer and it sits down to watch. Crabs bury themselves when you get close, gulls lift off
the jetty posts, butterflies rise out of the flowers, fish scatter from your feet, and a
turtle paddles slow circles offshore, paying you no attention at all.

Outside, the album gives way to "everybodies ok with the sunshine" (`assets/island/sunshine.mp3`),
which fades in as the island appears, swells a little while the automaton watches the sun, and
hands back to the album when you leave.

It is a Three.js scene in `assets/island/`, imported only when you step outside, so the
four rooms load exactly as before. Three.js is vendored in `assets/island/vendor/`, no
CDN. Modules:

- `island.js` entry, quality tier, loop, camera, events, UI, the `window.__ISLAND__` harness
- `world.js` the height field, trails, splat-blended terrain, the lapping sea, the sky
- `flora.js` procedural palms dressed in the licensed frond photos, trail bushes, Poly Haven ferns and calathea, grass, flowers, boulders, shells, driftwood, the jetty
- `hall.js` the Keystone Hall from outside
- `fauna.js` crabs, gulls, butterflies, fish, the turtle
- `player.js` the automaton, its collision, and keyboard, touch and gamepad input
- `fx.js` particles, footprints, motes, ripples, and the lens (bloom, tilt-shift, grade, flare)
- `sound.js` surf, wind, gulls, footsteps, rustle, splash, all synthesised
- `shaderlib.js` the shared shader patches: wind, push, rustle, cloud shadows, leaf light

Touch devices get a lighter tier (fewer plants, smaller shadow map, no MSAA) and the
renderer drops its pixel ratio once if the first seconds run under 40fps. The island adds
about 9.6MB including its song, loaded only on entry.

## What it is made of

One `index.html` with no dependencies, plus `assets/`. Photographic source licensed from
Adobe Stock, cut apart, and colour graded to one palette (see `CREDITS.md`). The pipes, the
bellows, the organ, the balance, the weights and the lamps are drawn in code on top of
those plates.

Every moving thing is a GPU-composited transform on a DOM layer. The rooms are four
sections on one fixed 1600x900 stage that scales to fit the screen; only the room you stand
in is visible to the compositor. Audio is the album track plus synthesised room beds, organ,
chimes and the finale swell, all WebAudio.

Total payload is about 3MB, music included.

## Testing

Real playthroughs, not code review. `../../../giga-foundry/runs/ah-mah-day-us/tools/playtest.mjs`
plays the whole game from the title card to the finale with real input: mouse arcs on the
rings, taps on the pipes, drag-and-drop on the weights (one dropped sloppily on purpose), a
wrong keystone tap, then the right sequence. On mobile it sends genuine touch events at an
iPhone landscape viewport. It reads the harness to know where things are; it never sets
solved state.

```bash
cd ../../../giga-foundry/runs/ah-mah-day-us
node tools/playtest.mjs                  # desktop, 1600x900
node tools/playtest.mjs --mobile         # iPhone 13 landscape, real touch
node tools/playtest.mjs --seed 42        # pin a session
node tools/shoot_scenes.mjs shots/DIR    # stills of every room, unsolved and solved
```

30/30 on desktop across four seeds and on mobile at last run.

The island has its own capture tools, which drive it with real key presses and CDP touch:

```bash
node tools/_island_shot.mjs shots/DIR full   # trail, beach, wade, kick, jump, roll, door, gaze, sit, jetty
MOBILE=1 node tools/_island_shot.mjs shots/DIR basic
node tools/_island_flow.mjs shots/DIR        # title, solve, keystone, card, step outside, leave, return
```

## Debug harness

`window.__AMD__` exposes `state()`, `probe()` (client-space geometry for driving input),
`goto(scene)`, `seed`, and, for captures only, `solve(scene)` and `setRing(i, seg)`.
`?seed=N` pins the session, `?scene=pipes` starts in a room, `?scene=island` goes straight
outside. On the island, `window.__ISLAND__` exposes `state()`, `teleport(x, z, yaw)`,
`press(action)` and `leave()`.
