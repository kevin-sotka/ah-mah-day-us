# Ah Mah Day Us

## Brief (from the prompt)
- **Concept:** A high-graphic mechanism island where four linked scenes, dials, organ pipes, and a water clock, interlock into one grand machine. Solve each piece, feed its output into the whole, and the machine sings.
- **Quality bar:** polished
- **Scope:** L
- **Budget:** default (600k), Fable to confirm headroom given the asset/scene density before Build starts
- **Track:** "ah mah day us.wav", 0:50, loops seamlessly
- **Stack:** single-file HTML5 canvas, mobile-first
- **Why this stack:** four static node-based scenes with in-place manipulable mechanisms (no camera movement, no physics simulation beyond simple rotations and value interpolation) is squarely a canvas 2D job, layered parallax and light shafts are cheap draw-order tricks, and a single file keeps the four richly-illustrated scenes bundled together with no external asset-loading complexity beyond images.

## Core Concept
Myst-style navigation through four fixed-node scenes on a mechanism island: a Dial Chamber, a Pipe Room, a Water Clock Court, and a Keystone Hall. Each of the first three scenes hosts one self-contained mechanism the player manipulates in place; solving it produces one "output" (a glyph sequence, a pipe route confirmation, a target flow rate hit) that's remembered globally. Reaching the fourth scene with all three outputs solved reveals a keyed sequence built from those three results, which the player enters to complete the grand machine. No inventory, no combat, no timer pressure, just three independent locks and one final combination lock that only makes sense once you've read the machine's language. On completion, the whole island's mechanism visibly and audibly engages: the organ plays, the water clock chimes, the dials lock, together.

## Core Loop
Arrive at a scene → read its mechanism visually (dials, pipes, or weights) → manipulate it directly (rotate, place, hang) → watch immediate visual/audio feedback as it moves toward or away from a solved state → reach the solved state, banking that scene's output → tap a screen-edge arrow to move to the next scene → repeat for all three, then enter the Keystone Hall to combine outputs into the finale.

## Win / Lose
No lose state, no timer, no failure condition: this is a contemplative puzzle, not a challenge with stakes. Win = correctly setting all three mechanism scenes, then correctly entering the combined keyed sequence in the Keystone Hall, which triggers the finale (the machine sings: synchronized visual and audio payoff across all four scenes, cross-cut or represented as one grand overlay). A completion card offers to revisit any scene freely afterward, no reset penalty, no "you failed" branch anywhere in the mechanic.

## Objects & Entities
- 4 static scene backgrounds (Dial Chamber, Pipe Room, Water Clock Court, Keystone Hall), each with layered parallax planes and light-shaft overlays.
- Screen-edge navigation arrows (left/right, sometimes only one direction available depending on scene adjacency).
- Dial Chamber: 3 concentric rotatable dial rings, each bearing glyphs, plus a fixed "target" glyph marker.
- Pipe Room: a grid of rotatable pipe tiles connecting a bellows source to an organ intake.
- Water Clock Court: a set of hangable weights and a flow-rate gauge with a target zone.
- Keystone Hall: 3 output-indicator lamps (lit once each linked scene is solved) plus a sequence-entry mechanism (a set of tappable keyed symbols derived from the other three scenes' solved states).
- Global solved-state tracker (3 booleans + their derived output values, persisted across scene navigation).
- Ambient SFX bed per scene (looping background texture, distinct per scene).
- Finale overlay (full-machine payoff sequence).

## Mechanics (cause → effect rules)

### Navigation (all scenes)
- Tap a screen-edge arrow (left third or right third of screen, rendered as a subtle glowing chevron when hoverable/near) → camera cuts (with a 400ms crossfade + slight parallax push) to the adjacent node in that direction. Scene adjacency is fixed: Dial Chamber ↔ Pipe Room ↔ Water Clock Court ↔ Keystone Hall, a simple linear chain, with Keystone Hall also directly reachable once all 3 are solved as a "return here" shortcut arrow.
- Global state (which scenes are solved, and their derived output values) persists across every navigation, held in memory for the session.

### Scene A: Dial Chamber (three concentric dials)
- Three concentric dial rings (inner, middle, outer), each divided into 8 glyph segments (45° per segment). Dragging horizontally anywhere on a ring's annular region rotates that specific ring; rotation snaps to the nearest 45° increment on release (eases to the snap point over 200ms).
- A fixed target marker (a notch at the 12 o'clock position) shows where all three rings' "key glyphs" must align.
- Each ring has exactly one "key glyph" among its 8. When all three rings are rotated such that their key glyphs simultaneously sit at the 12 o'clock marker → the dials lock with a satisfying mechanical clunk, a soft golden glow spreads across all three rings, and this scene's output is recorded as a 3-digit code (the ring positions at lock, expressed as segment indices 0 to 7 each, e.g. "3-6-1") used later in the Keystone Hall.
- Once locked, the rings no longer respond to drag (visually fixed in their solved position) unless the player explicitly long-presses (600ms) to unlock and re-attempt, which resets the "solved" boolean for this scene until re-aligned.

### Scene B: Pipe Room (rotate tiles to route pipes)
- A grid of pipe tiles (recommend 4x4 for v1) sits between a fixed bellows source (left edge) and a fixed organ intake (right edge). Each tile shows a pipe segment (straight, corner, or T-junction) and can be tapped to rotate it 90° clockwise (200ms eased rotation animation) per tap.
- On every tile rotation → the game re-evaluates connectivity from source to intake using the tiles' current pipe-opening directions (a simple flood-fill/graph check across the grid). If a continuous connected path exists from bellows to organ intake → air visibly flows through the connected pipes (an animated flow-highlight travels along the solved path over 800ms, looping softly), a low organ drone begins to hum, and this scene's output is recorded as "connected" (boolean true, no numeric value needed for the Keystone Hall beyond a lit/unlit lamp) plus the specific path length in tiles (used as a minor flavor stat, not required for the finale).
- If connectivity breaks (player rotates a tile mid-solved-state) → the flow-highlight and organ drone stop immediately, output reverts to unsolved, no penalty, tiles remain freely rotatable at any time.

### Scene C: Water Clock Court (hang weights to hit a target flow rate)
- A central water clock has a flow-rate gauge (a needle on an arc, range 0 to 100 "units") and 4 available weights of different mass (values 5, 10, 15, 25) that can be dragged onto either of 2 hanging hooks on either side of the clock's balance arm.
- Current flow rate = a base rate of 40 plus (weight on right hook − weight on left hook) × 1.2, clamped to the 0 to 100 gauge range. Placing or removing a weight recalculates instantly and the needle eases to its new position over 500ms.
- A target zone is marked on the gauge (a highlighted arc segment, e.g. 68 to 74 units). When the needle rests within the target zone for a continuous 1.5 seconds → the water clock locks in with a satisfying chime cascade (rising arpeggio matching the clock's ticking motif), the flow visibly steadies (ripple animation slows to a calm, even pulse), and this scene's output is recorded as the exact weight combination used (which two weights, which hooks) rendered as a simple 2-symbol code for the Keystone Hall.
- If a weight is removed or swapped after locking → the lock releases immediately (no lockout timer to reset, just recalculate and re-check against the 1.5s hold rule).

### Scene D: Keystone Hall (combine outputs into a keyed sequence)

> **Changed 2026-09-26 (orchestration review, see giga-foundry run PLAN.md).** The Keystone
> Hall derivation below was replaced because a player could not read it without text. Now
> every solved room lights a seal on its machine with one glyph, drawn fresh each session,
> in that room's accent colour. The hall's three lamps share those colours, left to right in
> island order; tap the three seals' glyphs in lamp order. Also shipped as `index.html` plus
> `assets/`, not a single file, and photographic rather than painterly (see the run plan).

- Three lamps, one per prior scene, are lit permanently (not togglable) once that scene's "solved" boolean is true, checked on every scene entry so partial progress is always visible here even before all three are done.
- Once all three lamps are lit → a sequence-entry mechanism appears: a row of tappable keyed symbols is generated by combining the three scenes' recorded outputs (concretely: the Dial Chamber's 3-digit code sets which 3 of 9 available symbols are "correct," the Pipe Room's path-length stat sets how many total taps are required in the correct sequence, and the Water Clock's weight-combination code sets the required tap ORDER of those 3 symbols). This keeps the finale meaningfully derived from all three mechanisms rather than an arbitrary bolt-on password.
- Tapping symbols in the correct derived order → each correct tap locks that symbol in place with a glow and a rising tone; an incorrect tap gently shakes the whole row (200ms, no punishment beyond visual feedback) and resets the current attempt's progress (not the other scenes) so the player can immediately retry.
- Completing the correct sequence → triggers the finale: a synchronized payoff where the Dial Chamber's rings, the Pipe Room's organ, and the Water Clock's chime motif all sound together (represented in this scene as a rich layered audio swell plus a full-screen light-bloom and machine-assembly visual), a completion card appears with a "revisit any scene" option and no replay-required framing (the machine stays solved).

## Physics Spec
This is a manipulation puzzle, not a dynamics simulation, so "physics" here means simple, deterministic value interpolation rather than forces:
- Dial rotation: drag delta (px) maps linearly to rotation delta (degrees) at a fixed sensitivity (e.g. 0.5° per px of horizontal drag), with a snap-to-nearest-45° ease (cubic ease-out, 200ms) applied on release, no momentum/inertia carried between drags.
- Pipe tile rotation: discrete 90° steps only, animated with a 200ms eased rotation tween per tap, no free-drag rotation and no physical simulation of the tile itself.
- Water clock needle: the needle's target angle is a pure function of current weight placement (see formula above); the needle eases toward that target at a constant angular speed cap (no more than 90°/second) so rapid weight changes never look like a teleport, always a smooth glide.
- No gravity, no collision, no velocity-based motion anywhere in this game; every moving element interpolates toward a computed target state.

## Visual Direction
- Palette anchors: warm brass-gold mechanism `#c89b3c`, deep verdigris copper `#4c7d6e`, rich indigo island-dusk sky `#241b3f`, warm lantern-light amber `#f2b880`, pale water-clock aqua `#a9d8d4`.
- Lighting: each scene uses layered parallax (background sky/island silhouette, mid-ground architecture, foreground mechanism) with visible light shafts cutting through dust or mist, consistent with a single warm key light per scene (a lantern, a window, or filtered daylight depending on scene).
- Really cool colors: the Dial Chamber's key-glyph glow is warm gold, the Pipe Room's air-flow highlight is a cool verdigris-teal that pulses along the solved path, the Water Clock's target-zone arc glows pale aqua when active and deepens to a rich teal on lock, giving each scene a distinct accent color within the shared warm-brass-and-indigo island palette.
- Overall feel: Myst/Riven-grade craftsmanship fantasy, ornate brass-and-stone machinery against a moody island dusk, meant to feel expensive and considered even in a 50-second-loop game.

## Adobe Asset Shopping List
1. "steampunk brass mechanism dial illustration ornate" (Dial Chamber background + dial ring art), fallback: procedurally drawn concentric rings (arcs with a metallic gradient stroke) with glyphs drawn as simple geometric symbols (circle, triangle, cross, etc.) at each 45° segment.
2. "pipe organ pipes brass illustration fantasy" (Pipe Room background + organ intake art), fallback: a column of rectangles of varying height with a gradient brass fill, simple dark slot details for pipe openings.
3. "water clock ancient mechanism illustration fantasy" (Water Clock Court background + clock body art), fallback: a drawn cylindrical vessel shape with a curved gauge arc overlaid, needle as a simple rotated line.
4. "mysterious island dusk sky illustration painterly" (shared sky backdrop across all 4 scenes, tinted per scene), fallback: a vertical gradient fill from `#241b3f` to a lighter dusk horizon tone, with a few soft-edged cloud shapes.
5. "ornate stone archway fantasy illustration" (Keystone Hall background), fallback: a drawn arch shape (two curved side pillars plus a rounded top) rendered in the palette's stone/brass tones.
6. "light shaft god rays overlay png fantasy" (parallax light-shaft layer, all scenes), fallback: procedural triangular gradient shapes from a fixed light-source point, low opacity, slow drift animation.
7. "brass gear cog illustration ornate" (mechanism detail accents, all scenes), fallback: drawn polygon "gears" (a circle with small rectangular teeth around the rim), static decorative elements, non-interactive.
8. "mist fog overlay texture png subtle" (foreground atmosphere layer, Water Clock Court + Keystone Hall), fallback: a few large soft-edged low-opacity ellipses drifting slowly across the lower third of the scene.

## Audio
- Track: "ah mah day us.wav" loaded into an `<audio>` element with `loop = true`, playback begins on the first user tap (title/intro card satisfies autoplay rules), loops underneath all 4 scenes continuously regardless of navigation.
- Ambient SFX bed per scene (looped separately, mixed under the main track): Dial Chamber gets a soft mechanical tick-and-hum bed, Pipe Room gets a low bellows-breath drone, Water Clock Court gets a gentle trickling-water bed, Keystone Hall gets a resonant, spacious stone-hall tone. All WebAudio-synthesized (filtered noise/oscillator drones) is acceptable if sourcing loops isn't practical.
- SFX list:
  - Dial ring rotate/snap: soft mechanical click (~80ms), triggered on every 45° snap.
  - Dial Chamber solved: a satisfying "clunk" plus a warm rising chord swell (~600ms), triggered on triple-glyph alignment.
  - Pipe tile rotate: a short metallic clink (~100ms), triggered on every tap-rotation.
  - Pipe path connected: a low organ drone fade-in (~1s attack), triggered the instant flood-fill confirms connectivity; drone fades out over 400ms if connectivity later breaks.
  - Weight placed/removed on water clock: a soft clink plus a water-ripple swell (~200ms), triggered on drop.
  - Water clock locked: a rising arpeggio chime cascade (~800ms), triggered after the 1.5s target-zone hold completes.
  - Keystone symbol correct tap: a rising tone matching sequence position (~150ms), triggered per correct tap.
  - Keystone symbol incorrect tap: a soft low buzz/shake tone (~200ms), triggered per wrong tap.
  - Finale: full layered audio swell combining all three scene motifs plus a triumphant resolving chord (~3s), triggered on sequence completion.

## Juice List
- Crossfade + parallax push on every scene-to-scene navigation (never a hard cut).
- Golden glow bloom on Dial Chamber lock, spreading outward from the aligned rings.
- Traveling flow-highlight animation along the solved pipe path, looping softly for as long as the connection holds.
- Needle-ease and ripple-slow animation on the Water Clock as it approaches and holds its target zone.
- Lamp light-up animation (soft glow pulse, not an instant on/off) in Keystone Hall as each prerequisite scene is solved.
- Screen-space light bloom and layered audio swell for the finale, the single biggest "juice" moment in the whole game, worth the most polish budget.
- No screen shake anywhere in this game: the tone is stately and mechanical, not kinetic, and shake would undercut the craftsmanship feel.

## Mobile Considerations
- Landscape orientation is the call: Myst-style node scenes with wide architectural framing and screen-edge navigation arrows read naturally in landscape, and it matches genre convention.
- Thumb zones: screen-edge navigation arrows sit inset from the true edge (roughly 8% margin) so they're reachable by thumbs in a two-handed landscape hold without being so close to the bezel that they're hard to hit on notched devices.
- All interaction is direct-manipulation drag/tap (dial drag, pipe tile tap, weight drag-and-drop, keystone symbol tap), no hover-only affordances, and no reliance on mouse-only cursor states for any mechanism feedback.
- Weight drag-and-drop targets (the two hooks) use generous snap-to-hook radii (at least 50px) so imprecise touch drops still register correctly.
- Each scene's mechanism elements keep a safe margin from screen edges so nothing critical sits under a phone's rounded corners or camera notch in landscape.

## v1 Scope vs [later]
- [v1] All 4 scenes fully built and connected: Dial Chamber (3-ring alignment), Pipe Room (4x4 tile routing), Water Clock Court (weight-balance target), Keystone Hall (derived 3-symbol sequence lock), shared global state, screen-edge navigation, layered parallax + light shafts per scene, ambient SFX beds, full finale payoff, revisit-freely completion state.
- [later] A fifth "observatory" scene adding a 4th mechanism and a richer finale combination, hint system for players stuck on a mechanism, alternate finale audio/visual variants unlocked by solving scenes in different orders, a photo-mode freeze-frame of the completed machine.
