# Arcade walking in development — build spec

**Class:** Programme (PM, 2026-10-29). **Author:** WS6 (design lead). **Owners:** proposed in §9 and the file list;
the PM rules them before any build. **Design:** the approved mock, `design/mocks/ws6-ux/src/screens/arcade/` at
**ceedd23f** (Heiko: "Yes, build this", 2026-10-29), all four slices at today's tunables. **Supersedes:** the WS6 UX
spec's non-goal "A joystick or free steering: tap to walk only" (`docs/specs/2026-10-21-ws6-ux.md` §0) and its
RULE-5 (tap-to-walk timing), and `docs/plans/2026-10-28-ws3-dev-walking.md`'s same non-goal. Grounded on trunk
`origin/feat/strategist` **8b52627b**.

---

## §0 · Business Goals & Value

The goal gate Heiko passed on 2026-10-28 ("Yes, start the mock"; SEAMS 2026-10-28), checked against the gate by the PM
on 2026-10-29. The goal lines and proofs are the gate's; bullets marked *from the mock design gate* are design detail
Heiko approved by playing the mock (ceedd23f), bound in §1 and §2. Heiko's playtest verdict on today's walking: "this is not at all what i
wanted… i can really walk my character… like in an arcade game".

**G-1 · You steer your colonist like an arcade game, everyone at once.** `[handoff]`
- Computer: ARROW KEYS to move, SPACE as the action button, the MOUSE as the alternative ("arrow keys and space for
  clicking, alternative the mouse"). Phone: a thumb joystick plus one action button.
- The loop, with no menus: walk to the store, in through the door; walk to the corral and buy a MULE; walk INTO one
  of the four outfitters (Food, Energy, Smithore, Crystite) to outfit it; walk out with the MULE following on a lead;
  walk to your own plot; install with the action button. The TV shows every colonist walking live.
- *Who benefits* `[review-only]`: every player at the table, Heiko first (the playtester who rejected today's walk).
- *Today* `[review-only]`: a colonist walks by a tap on a plot or a room; the server works out an arrival time
  (`packages/engine/src/dev-walk.ts::walkSeconds`, grid steps × 0.4 s) and the action lands then. Nobody steers, the
  phone never draws your colonist (`Develop.tsx` never reads `colonist`), the TV draws no positions, and the laptop
  has no development keys. verified_by: read + played (Heiko's playtest, 28 Oct).
- *Value* `[review-only]`: development becomes the game's physical, shared moment — the thing Heiko asked for in
  his own words, and the gate for the rest of the arcade.
- **UBER-AC-1:** On the rig, a first-time player with only a phone held sideways (no TV) plays a whole development turn with
  the stick and the button — store, corral, outfitter, out with the MULE on its lead, own plot, install, pub — with
  no menu opened; and on the TV in the same room every colonist is seen moving while they do it.

**G-2 · Terrain slows you, and the AI walks by the same rules.** `[handoff]`
- Mountains and swamp slower, plains normal, plus today's hunger/sickness pace. Every speed a named config value.
- *Today* `[review-only]`: terrain never affects speed (`walkSeconds` reads only x and y); the pace is hunger ×
  sickness × the Zipwing perk (`dev-walk.ts::pace`).
- *Value* `[review-only]`: where your plots are starts to matter; the map is felt, not read.
- **UBER-AC-2:** On the rig, a colonist held to the right for 2 s crosses about 2.5 tiles of plains and about 1 of
  mountains (the config's 1.25 tiles/s × 1 and × 0.4, × pace); and the same holds for the AI: in a seeded AI-only
  turn, an AI colonist's walk of the same length takes measurably longer over mountains than over plains (the same
  2.5× ratio, read from the server's frames).

**G-3 · Arcade moments and light competition in development; the AI plays them all and the TV shows the drama.**
`[handoff]`
- *From the mock design gate:* each moment 5–15 s, played with the stick and the one button only. WOLVES (forest, hills or tundra): RUN, or FIGHT a ~10 s dodge-and-strike; win pelts the store buys; lose and your
  MULE bolts, and you catch it. GLINT RACE: a Crystite sparkle on a random tile for ~8 s, on every phone and the TV;
  the first there wins. CORRAL SCRAMBLE: when the store is down to its last MULEs the TV announces it and you see
  everyone racing. Every reward, cost and frequency a tunable.
- *Today* `[review-only]`: development has no moments of its own, only errands (none_exists).
- *Value* `[review-only]`: stories at the table; reasons to look up at the TV.
- **UBER-AC-3:** In a seeded 12-month AI game on the server, each of the three moments happens at least once and
  each reward or cost lands in the game state (pelts sold, a bolted MULE caught or lost to the clock, a glint's
  Crystite in stock, a colonist left without a MULE by the scramble); and on the TV in that game the table sees at
  least one wolf encounter and at least one glint race, with an AI colonist taking part in each.

**Non-goals** `[review-only]`: the Wampus; a MULE running away on its own (it only bolts after a lost fight);
colonists colliding; walking in other phases; balancing beyond the numbers Heiko ruled (WS1's sim sweeps them after
the build). The game record is not this spec's: WS3's (`docs/specs/2026-10-29-ws3-game-record.md` on ws3-auctions,
Heiko's OK 28 Oct, §3 frozen at 04406300) records development through the seam in HC-9 and HC-10.

**Rough cost** `[review-only]`: chosen approach ≈ 6–8 PRs over 3 waves (engine + config; server + protocol +
tabletop stream; AI + sim; phone/laptop/TV screens; moments; switch-over and removal). Thin baseline ≈ 3 PRs
(see §0.1).

## §0.1 · Decision Record `[review-only]`

**Chosen: the engine steps every colonist at a fixed server tick from players' steering inputs; the server streams
positions; phones predict their own colonist.** One pure step (`packages/engine`) is called by the server, the sim
and the phone's prediction alike, so the AI, the sim and the screens cannot disagree, and a game stays a function of
seed + per-tick inputs. Cost ≈ 6–8 PRs.

**Thin baseline: keep today's event-time walk and only animate it.** Taps stay; the phone and TV interpolate the
`walk.{from,startedAt,arrivesAt}` they already receive (`ColonistView`), terrain changes `walkSeconds`' cost per
tile, the moments are timed events. ≈ 3 PRs. **It loses because it does not deliver G-1:** a tap-to-go walk cannot
be steered — Heiko rejected exactly that ("i can really walk my character"), and a wolf you RUN from with the stick,
or a glint you race to, needs a position the player controls every moment, which an arrival time does not have.
Falsifiable: try to write "RUN: push the stick away from the wolves" against `walkTarget`'s one target per tap.

**Rejected also: positions only on the client, the server checking reach on actions.** Cheaper on the wire, but
the TV and the other phones could not show anyone live (G-1's TV clause) without the server relaying positions it
does not own, the AI could not race on the same rules, and a cheating or lagging phone could stand anywhere.

## §0.2 · Constraints `[handoff]`

```
HC-1  packages/engine stays pure: no Date.now(), no Math.random(); time enters as the tick's dt, randomness through
      the seeded rng (seedOf(...)). The server's clock maps to ticks; the engine never reads it.
                                                        source: CLAUDE.md (project)          breach: fatal
HC-2  Every number is a named value in packages/engine/src/config.ts (DEV_STEER, WOLVES, GLINT, SCRAMBLE), never
      inline; `pnpm sim --set` can move each one.        source: CLAUDE.md, memory "configurable balance"  breach: fatal
HC-3  Never stall a game: development ends on its one clock whatever a phone does (dropped, silent, flooding);
      an away seat's colonist stands still and counts as done, as today. The one exception (AM-3): in month 1 the
      clock stands full until every present seat's first MULE is in; the host's Continue starts it past anyone not
      in, and an away seat counts as in. The clock is the only thing that waits: the tick, the moments and the AI run.
                                                        source: ws2-brain G-2b; mule-game.ts::checkDevelopmentOver  breach: fatal
HC-4  The server, the sim and the phone's prediction call the SAME engine step with the SAME tick length; a seeded
      AI-only game in the sim and on the server ends in the same state.
                                                        source: play-walk.test.ts T-AC-27 (parity today)  breach: fatal
HC-5  A socket sends at most RATE_LIMIT (20) messages a second (server.ts drops the rest silently): steering sends
      on change only, ≤ 10 a second.                    source: apps/server/src/server.ts::RATE_LIMIT  breach: fatal
HC-6  The mock at ceedd23f is the binding scaffold for every screen here; an implementer never designs a screen.
      Keep its data-testids.                            source: Heiko's design gate          breach: needs decision
HC-7  Rules errors throw RuleError; the server turns them into messages.   source: CLAUDE.md   breach: fatal
HC-8  Lean CI: no new e2e files; development's browser checks extend shell.ts / store-steps.ts / auction-steps.ts.
                                                        source: memory "lean CI"             breach: needs decision
HC-9  The dev tick runs only through ctx.schedule and reads time only through ctx.now(): no setInterval, Date.now or
      performance.now in apps/server. Steer and act are MuleIntent members, so WS3's recorder takes them as intents;
      the tick is a recorded `fire` step with its now() reads taped.
                                                        source: WS3, game record §3 (04406300), via the PM  breach: fatal
HC-10 The frame is output and is not recorded: it leaves through a GameContext output and returns nothing to the
      game. A ctx method that returns a value to the game is a new input and needs a record amendment with WS1, WS2
      and WS3 OKs.                                      source: WS3, game record §3, via the PM  breach: needs decision
```

---

## §1 · Solution Design `[handoff]`

The shape: **engine** (pure: the dev floor — positions, steering, terrain, reach, the hall, the three moments) →
**server** (a fixed development tick feeding players' latest inputs into the engine step; a light position stream;
full views on change) → **phones / laptop / TV** (draw the stream; your own colonist predicted with the same step).
The AI produces the same inputs a phone does. The game rules that change money and stock (`game.ts::buyMule`,
`outfitMule`, `installMule`, `analysePlot`, `fitFilter`, `visitPub`) stay as they are and are called on an action.

```
C1 · ADDED · the dev floor: where every colonist is, and one pure step that moves them

today        positions live only in the server (`apps/server/src/mule-game.ts::MuleGame` `colonists` Map of
             `apps/server/src/dev-walking.ts::Colonist` {at, walk, assayUntil}) and, separately, in the sim referee
             (`packages/ai/src/play.ts::DevClock`); a walk is a tap's arrival time, never a position in between.
             SEAMS: "types.ts and game.ts are untouched" by walking.      verified_by: read
tomorrow     MUST: a `DevFloor` state {colonists: x, y (tiles, float), space 'map'|'hall', facing, lead (the MULE on
               its rope, with its own x, y), condition-derived pace, encounter, pelts, flags} held beside GameState
               (not inside it), created at development start from GameState.
             MUST: `stepFloor(floor, state, inputs, dtMs, cfg) → floor`, pure, fixed dt (DEV_STEER.tickMs); continuous
               movement, diagonals normalised; blocked by lakes (per cfg), the map edge, the store's walls (only its
               door); speed per RULE-2.
             MUST: the store's hall is part of the floor: its rooms and doors as one floor plan (C2).
logic        → §2 RULE-1 (the tick), RULE-2 (speed)  · evaluated_at: every tick · inputs bind from: the latest
             input per seat (server) / the AI hand (sim, server) / the local stick (prediction) · writes: DevFloor only
seam         new `packages/engine/src/floor/` (floor.ts, step.ts, speed.ts) — beside dev-walk.ts, which it replaces
senior       junior would: port the mock's sim.ts wholesale into the server, or keep positions in mule-game.ts and a
             second copy in play.ts (today's split). senior does: one engine module the server, the sim and the
             phone all import; the mock's `design/mocks/ws6-ux/src/screens/arcade/sim.ts::step`, `design/mocks/ws6-ux/src/screens/arcade/sim.ts::moveColonist`, `design/mocks/ws6-ux/src/screens/arcade/sim.ts::speedOf`, `design/mocks/ws6-ux/src/screens/arcade/sim.ts::tileOpen` are the reference
             behaviour, rewritten to engine conventions (config.ts numbers, rng streams, RuleError), with the mock's
             tunables mapped 1:1 to config names.
mechanism    sprout (new module) + strangler (dev-walk.ts's callers move over in C14)
call sites   new; consumed by C6 (server tick), C9 (AI hand), C10 (sim), C11 (phone prediction)
pin          none, because ADDED; today's walk is pinned until C14 removes it
ux           design/mocks/ws6-ux/src/screens/arcade/sim.ts (reference behaviour, not code to copy)
depends_on   C5 (config, data, not stubbable)
```

```
C2 · ADDED · one floor plan for the store's hall, shared by the engine and the drawing

today        the hall's rooms are % positions inside the drawing only (`packages/ui/src/components/Store.tsx`
             `SPOT`, `spotFor`); the visitor stands at "the room it used last" ("Before R1 a tap acts at once");
             the mock had to mirror Store.tsx's geometry (its DS-GAP 1).      verified_by: read
tomorrow     MUST: the hall's rooms (corral, pub, the outfitters, Green belt, the works, both doors) as rectangles in
               one exported plan in the engine (`floor/hall.ts`), which the engine uses for reach and walls and
               `StoreInterior` uses to draw; the drawing takes free visitor positions on that plan.
seam         new `packages/engine/src/floor/hall.ts`; named edit in `packages/ui/src/components/Store.tsx`
             (StoreInterior reads the plan; `Visitor` gains x, y; `spotFor` goes)
senior       junior would: a second copy of the room coordinates in the engine. senior does: one plan, drawing reads it.
mechanism    extract_interface (the drawing's SPOT becomes the engine's plan) + in_place in Store.tsx
call sites   Store.tsx::StoreInterior (Develop.tsx today; C11's hall stage tomorrow; TableApp's TV store)
pin          the store hall's look (Heiko-approved, WS6 PR-4/PR-10): store-steps.ts::storeIsOneHallWithTwoRows,
             store-view.test.ts B-AC-10 / T-AC-12 keep passing
ux           design/mocks/ws6-ux/src/screens/arcade/views.tsx::HallStage at ceedd23f · GRAFT TARGET: Store.tsx (named edit)
depends_on   —
```

```
C3 · ADDED · the action button: what one press does where you stand

today        each action is its own intent and its own button (MuleIntent buyMule | outfit | install{x,y} |
             analyse{x,y} | filter{x,y} | pub; Develop.tsx's onShop, footer buttons); the target comes from the tap.
             verified_by: read
tomorrow     MUST: `reachOf(floor, state, seat) → Reach` (pure): the one thing a press does now — ENTER, BUY MULE ·
               price, OUTFIT · good · cost, LEAVE, INSTALL · good, ANALYSE, FIT FILTER, SELL n PELTS, CATCH MULE,
               GRAB THE GLINT, FIGHT, PUB · END TURN — or nothing (dim), per RULE-3.
             MUST: an `act` input applies that Reach by calling today's game.ts rule (buyMule, outfitMule,
               installMule, analysePlot, fitFilter, visitPub) — money and stock rules are unchanged.
             MUST: the button's words come from Reach, so the screen never says what the server would refuse.
logic        → §2 RULE-3
seam         new `packages/engine/src/floor/reach.ts`
senior       junior would: keep the six intents and add a "where am I" check to each. senior does: one `act` input;
             Reach is computed from position, so a press can never name a plot you aren't on.
mechanism    sprout
call sites   C6 (server applies), C9 (AI chooses), C11 (button label)
pin          the rules' own tests (packages/engine/test/rules.test.ts T-AC-23, mule-game.test.ts) keep passing
ux           design/mocks/ws6-ux/src/screens/arcade/views.tsx::ActionButton, design/mocks/ws6-ux/src/screens/arcade/sim.ts::reachOf
depends_on   C1, C2
```

```
C4 · ADDED · wolves, the glint race and the corral scramble as engine moments

today        none_exists (development has no moments)
tomorrow     MUST: three pure modules under `packages/engine/src/floor/` — wolves.ts (the roll on wolf land, the
               pack, the choose/chase/fight encounter, pelts, the bolted MULE), glint.ts (the roll, the tile, the
               race, the prize), scramble.ts (the call at SCRAMBLE.mulesLeft, the race, the left-out line) — each
               a step function the C1 step calls, each seeded (seedOf(state.seed, month, 'wolves'|…, id)), each
               emitting `beats` (short public lines the TV and phones show).
             MUST: rewards and costs land in GameState through game.ts named edits: pelts sold → money; the glint's
               prize → stock.crystite (or money, per GLINT.prize); a bolted MULE leads again only once caught.
logic        → §2 RULE-4 (wolves), RULE-5 (glint), RULE-6 (scramble)
seam         new packages/engine/src/floor/{wolves,glint,scramble}.ts; game.ts named edits for the payouts
senior       junior would: timers in the server for each moment. senior does: seeded engine steps, so the sim
             plays the moments too (UBER-AC-3 runs headless) and WS3's record replays the wolves from the intents.
mechanism    sprout
pin          none, because ADDED
ux           mock wolves.ts, glint.ts, scramble.ts, WolfLayer.tsx, GlintLayer.tsx, ScrambleLayer.tsx
depends_on   C1, C3, C5
```

```
C5 · MODIFIED · the walking numbers, named in config

today        config.ts::DEV_WALK {tileSeconds 0.4, floorSeconds 1, hungerPaceMin 0.2, sickPace 0.5, hungerLevels},
             DEVELOPMENT {fullSeconds 50, …}, SPECIES_PERK.zipwingSpeed 1.25, AI_HANDS.devTickMs 100.  verified_by: read
tomorrow     MUST: new blocks DEV_STEER, WOLVES, GLINT, SCRAMBLE with Heiko's values (RULE-7's table); DEV_WALK's
               pace numbers stay and are read by C1; tileSeconds and floorSeconds go when C14 lands.
seam         packages/engine/src/config.ts
mechanism    in_place
pin          DEVELOPMENT.fullSeconds 50 and the hunger/sickness pace numbers do not move (Heiko-approved)
depends_on   —
```

```
C6 · MODIFIED · the server runs development as a fixed tick

today        development is event-time: `MuleGame::develop` computes `arrivesAt` from walkSeconds once and
             schedules `settle`; a 100 ms tick exists only when AI seats exist (`scheduleAiDevelop`); views broadcast
             after intents, arrivals and AI ticks (`room.ts::broadcast`, coalesced per microtask).  verified_by: read
tomorrow     MUST: at development start the server builds the DevFloor (C1) and runs one tick every DEV_STEER.tickMs
               for the whole phase, AI or not: take each seat's latest input, call stepFloor, apply any `act` via C3,
               stream positions (C8), and broadcast a full view only when the game state changed.
             MUST: the end conditions stay: the one clock (devEndsAt), everyone at the pub, or everyone Ready; away
               seats count as done (HC-3).
             MUST: a dropped phone's input is zeroed at once (its colonist stops where it is) and restored on
               reconnect; an encounter it is in resolves by the rules with no input (wolves: a stand-still).
logic        → §2 RULE-1
seam         apps/server/src/mule-game.ts (startDevelopment, handle, the tick; develop/arrive/settleArrivals go in
             C14); new apps/server/src/dev-steer.ts (the input buffer and the tick) beside dev-walking.ts
senior       junior would: broadcast the full view every tick. senior does: a light position frame every tick and the
             full view on change; the tick never waits on a socket; inputs are latest-wins, so a flood cannot slow it.
mechanism    branch_by_abstraction (DEV_STEER.on picks the tick or today's event-time walk, until C14)
call sites   MuleGame.handle, startDevelopment, connectionChanged, checkAllReady, checkDevelopmentOver,
             finishDevelopment (all in mule-game.ts)
pin          FM-one-clock and B-AC-11 rows in apps/server/test/dev-walking.test.ts hold while DEV_STEER.on is false;
             their steering twins (C15) replace them
depends_on   C1, C3, C7, C8
atomicity    ships with C7 and C8 (the tick needs the intents and the stream)
```

```
C7 · MODIFIED · the protocol: steering in, positions out

today        MuleIntent's development variants are taps (buyMule … pub); the only steering intent is the auction's
             {type:'walk'; dir:'up'|'down'|'stop'}. PlayerView.colonist is ColonistView {at, walk{from,startedAt,
             arrivesAt}|null, assayUntil}.                    verified_by: read
tomorrow     MUST: intents {type:'steer'; x; y} (a direction, each component quantised to 1/8, |v| ≤ 1) and
               {type:'act'}; the tap intents stay accepted while DEV_STEER.on is false.
             MUST: ColonistView v2 {x, y, space, facing, moving, lead {good, x, y}|null, pace, encounter summary,
               pelts} (public, like every place today); MyView gains `reach` (C3's Reach) and the moments' banners.
             MUST: a `DevFrame` {tick, at, colonists: [{id, x, y, space, facing, moving, lead}], beats} carried by C8.
seam         packages/protocol/src/index.ts
mechanism    in_place (additive; ColonistView's old fields go in C14)
pin          every protocol consumer typechecks (pnpm typecheck)
depends_on   —
```

```
C8 · ADDED · a light frame channel beside the full view

today        the room sends only full views (`room.ts::broadcast` → each seat's viewFor, boards viewFor(null)),
             plus chat and emote messages to everyone (`room.ts` everyone()).      verified_by: read
tomorrow     MUST: the room's Game may emit a transient frame to everyone (`ctx.frame(payload)`), sent as one
               message per tick to every connection, never queued behind a full view, dropped (not buffered) for a
               connection that is behind. `frame` returns void: an output the record does not tape (HC-10); WS3
               confirmed (29 Oct) it needs no change to the record's §3.
             MUST (AM-8): WS3's recorder and replay pass `frame` through: recording, to the room; on replay, a no-op
               (record.ts, replay.ts, two lines, WS3's, WS6 reviewing), or a recorded game loses its frames silently.
               Test row: a recorded game's frames still reach a client.
seam         packages/tabletop/src/room.ts (+ protocol.ts message type)
senior       junior would: put positions in viewFor and broadcast it 20×/s. senior does: a frame of ~200 bytes per
             tick, full views stay event-driven (S-1 measures both).
mechanism    sprout (a new message kind, like emote)
pin          tabletop room tests (packages/tabletop/test) keep passing
depends_on   —
```

```
C9 · MODIFIED · the AI walks by the same rules

today        `packages/ai/src/hands/develop.ts::DevelopHand.tick` works a to-do list of taps (analyse, buy, outfit,
             install, filters, pub), waiting while `walk.busy`; the strategist prices walks with walkSeconds
             (strategist.ts, value.ts).                       verified_by: read
tomorrow     MUST: the hand turns the same to-do list into steering inputs every tick: a goal (corral, outfitter,
               plot, pub) → a path over the tile grid weighted by terrain cost (the engine's `floor/path.ts`) → a
               direction; `act` when Reach matches the goal.
             MUST: the moments: run or fight by a share and by AI level (rookie/regular/veteran, RULE-4); race a
               glint or the scramble only with time to spare (RULE-8, the PM's ruling).
             MUST: the strategist's walk-time estimate reads the same speed (RULE-2) instead of walkSeconds.
seam         packages/ai/src/hands/develop.ts, seat.ts::developTick, strategist.ts, value.ts; new
             packages/engine/src/floor/path.ts (shared by the AI and the guide ring)
senior       junior would: give the AI a teleport or its own movement code. senior does: the AI emits inputs; the one
             engine step moves it, so HC-4 holds by construction.
mechanism    in_place
pin          packages/ai/test/ai.test.ts "replay exactly from the seed" keeps passing (with DEV_STEER.on both ways)
ux           design/mocks/ws6-ux/src/screens/arcade/sim.ts::botGoal, design/mocks/ws6-ux/src/screens/arcade/sim.ts::botInput, design/mocks/ws6-ux/src/screens/arcade/sim.ts::pathTo; design/mocks/ws6-ux/src/screens/arcade/spare.ts::fitsDetour
depends_on   C1, C3, C4
```

```
C10 · MODIFIED · the sim plays the same floor

today        `packages/ai/src/play.ts` referees development event-time (`walkTarget`, `applyAction`, `arrive`,
             DevClock), mirroring the server; parity pinned by play-walk.test.ts T-AC-27.   verified_by: read
tomorrow     MUST: play.ts's development builds the DevFloor and steps it at DEV_STEER.tickMs with every seat's AI
               inputs; `pnpm sim` reports MULEs installed, pub times, packs met, glints raced, scrambles (RULE-8's
               numbers) per turn.
seam         packages/ai/src/play.ts, packages/ai/src/sim.ts (report lines)
mechanism    in_place (walkTarget/arrive go in C14)
pin          ai.test.ts replay; T-AC-27 becomes the floor's server==sim parity (T-AC-4)
depends_on   C1, C9
```

```
C11 · ADDED · the phone and the laptop: steer, act, see the whole map

today        `apps/web/src/phone/Develop.tsx` is tap-to-act (onShop, footer Install/Analyse, a client-only
             store/map `place`); it never draws positions; no development keys on the laptop
             (useWalkIntent.ts is the auctions'). PhoneApp.tsx routes development to <Develop/>.   verified_by: read
tomorrow     MUST: the development screen is the mock's: landscape, the whole map filling the phone by height, status
               in the side room, the stick (left thumb) and the action button (right thumb) translucent over the
               map's bottom corners, the next step ringed and named (the guide, RULE-9), the hall filling the screen
               inside the store; at 667×375 it fits (the map scales to the frame; status overlays the map's top edge
               when the side room is under its minimum) — the mock's 667 overflow (small-phone audit) is fixed here.
             MUST: the laptop: arrow keys (two at once for a diagonal) and SPACE; the mouse: hold a spot to walk
               toward it, click the highlighted thing to act; keys never scroll the page.
             MUST: the phone sends `steer` on change (≤ 10/s, HC-5) and `act` on press; it draws its own colonist
               from its own prediction (the engine step on its inputs) and corrects to the server frame
               (RULE-10); everyone else from the frames, interpolated.
             MUST: the moments' layers (wolves' ring and choice, the glint's sparkle and pointer, the scramble's
               banner), each covering 0 px² of the store, your plots and the controls.
seam         new apps/web/src/phone/arcade/ (Develop screen, controls, prediction, layers); PhoneApp.tsx's
             development route (named edit); the shell's ShellLayer for emotes
senior       junior would: rebuild the screen from the spec's words, or move the mock's sim into the browser as the
             truth. senior does: graft the mock's components (design/mocks/ws6-ux/src/screens/arcade/Phone.tsx::PhoneLandscape, views.tsx, GuideLayer,
             Wolf/Glint/ScrambleLayer) onto real data; the server is the truth, the phone only predicts.
mechanism    fill_scaffold (graft) + strangler (Develop.tsx retires in C14)
ux           design/mocks/ws6-ux · routes #arcade-phone, #arcade (phone half), #arcade-computer, #arcade-wolves,
             #arcade-glint, #arcade-scramble · states: map, hall, leading, wolves choose/chase/fight, glint lit,
             scramble, left out, pub · fixtures to replace: fixture.ts's world and seats → the server's view and
             frames · GRAFT TARGET: new apps/web/src/phone/arcade/Develop.tsx (+ its parts)
depends_on   C1, C3, C7, C8
```

```
C12 · ADDED · the TV: every colonist live

today        TableApp's development branch draws StoreInterior with no visitors, a PaceList roster and a HoloMap
             with no avatars; the TV draws no positions.        verified_by: read
tomorrow     MUST: the TV draws the whole map and the hall with every colonist from the frames (interpolated), the
               moments' banners and beats, the shared clock and the pace list; the chat ticker stays (C20).
seam         new apps/web/src/table/TvDevelop.tsx; TableApp.tsx's development branch routes to it (named edit)
mechanism    fill_scaffold
ux           design/mocks/ws6-ux/src/screens/arcade/Tv.tsx::TvArcade · routes #arcade (TV half), #arcade-tv · GRAFT TARGET: new TvDevelop.tsx
depends_on   C7, C8
```

```
C13 · MODIFIED · the map draws live positions without lag

today        `packages/ui/src/components/HoloMap.tsx::MapAvatar` avatars ease over 700 ms
             (`transition-[left,top] duration-700`); no caller passes avatars today.     verified_by: read
tomorrow     MUST: live positions draw in a layer of their own over the map, positioned every frame with no CSS
               easing (the mock's MapStage); HoloMap's ring/selected styles reused for the target ring.
seam         packages/ui (a new map-overlay component, or HoloMap's avatars with easing off — the implementer picks,
             WS4 reviews)
mechanism    sprout
ux           design/mocks/ws6-ux/src/screens/arcade/views.tsx::MapStage, GuideLayer.tsx
depends_on   —
```

```
C14 · REMOVED · tap-to-walk

today        dev-walk.ts::walkSeconds (engine), dev-walking.ts::walkTarget/dueArrivals/colonistView and
             MuleGame::develop/arrive/settleArrivals (server), play.ts::walkTarget/arrive (sim), the tap intents,
             Develop.tsx's tap flow and next-step.ts's store/map guide.          verified_by: read
tomorrow     MUST: after the switch (§5), all of it goes, with DEV_STEER.on and the ColonistView v1 fields.
call sites   from the grounding: dev-walk.ts read at packages/ai/src/value.ts, Develop.tsx, phone/parts.tsx,
             TableApp.tsx; walkSeconds in strategist.ts, value.ts, balance.test.ts; tapThere in
             apps/server/test/fake-context.ts (dev-walking, installed-this-turn, land-auction, land-auction-ai,
             score-view tests)
pin          the tests listed in §6's migration table move to their steering twins first
mechanism    delete
depends_on   C6, C9, C10, C11, C15
```

```
C15 · MODIFIED · the tests that walk today, walk by steering

today        development is driven by taps in: apps/server/test/dev-walking.test.ts (T-AC-7, B-AC-11, FM-*),
             mule-game.test.ts FM-one-clock, installed-this-turn.test.ts, phase-scale.test.ts, broadcast.test.ts;
             packages/ai/test/play-walk.test.ts T-AC-27, balance.test.ts; apps/web/test/next-step.test.ts,
             store-view.test.ts; e2e auction-steps.ts::goToThePub, smoke.ts::checkOwnsAPlot/goToThePub,
             store-steps.ts (fedPlayerSeesNoHunger … theLedMuleLightsUp, giveStoreTime), table-steps.ts,
             screens.ts:93-112, zoom.ts, specials.ts.                                  verified_by: read
tomorrow     MUST: a test helper that steers a seat to a goal and presses act (server: through the tick with a fake
               clock; e2e: through the phone's keyboard), so each test above keeps its promise with steering.
             MUST: shell.ts measures 667×375 too (the small-phone audit's recommendation).
seam         apps/server/test/fake-context.ts (a `steerTo` beside tapThere), apps/web/e2e/harness.ts (a steering
             step), each test file above
mechanism    in_place
depends_on   C6, C11
```

### Reuse checks for the ADDED changes (self-review check 6, trunk 6d30b69, `git grep`)

- **C1 / C9 path.ts:** `git grep -iE "a\*|astar|dijkstra|pathTo|shortestPath"` → only `node:url`'s pathToFileURL; no
  pathfinding exists. The movement neighbours are dev-walk.ts (event-time, replaced), dev-walking.ts and play.ts's
  DevClock (two copies of place, replaced by one floor). The AI already turns a goal into steering inputs in the
  auctions: `packages/ai/src/hands/auction.ts::steer` — C9 follows that pattern.
- **C2:** `packages/ui/src/components/Store.tsx` `SPOT` is the hall's only geometry → extracted, not copied.
- **C3:** the six tap intents are the neighbour → one `act` beside them until C14.
- **C4:** `git grep -iE "wolf|wolves|glint|scramble|pelt"` → only `packages/ui/src/terrain/landscape.ts`'s crystal
  `glint` colour (reuse it for the sparkle); no moments exist.
- **C8:** the room's chat/emote messages to everyone are the neighbour; a frame is the same kind of transient
  message, with drop-not-queue.
- **C11 / C12 / C13:** Develop.tsx, TableApp's development branch and HoloMap's MapAvatar are the neighbours;
  C11/C12 graft the approved mock over them (strangler), C13 reuses HoloMap's ring styles.

## §2 · The Logic `[handoff]`

```
RULE-1 · The development tick                                   shape: sequence (existing contracts marked)

at development start each colonist stands just outside a store door, seats alternating doorL / doorR, the other door
when one door's outside is a lake (AM-9).
every DEV_STEER.tickMs (50 ms) of game time, while phase = development:
  1  inputs ← for each seat: away → IDLE; else its latest steer (latest-wins) and any act pressed since the last tick
  2  ai     ← each AI seat's hand reads (floor, state) and returns an input (C9)
  3  floor  ← stepFloor(floor, state, inputs, tickMs, cfg)      // C1, then C4's moments inside it
  4  acts   ← for each act: Reach (C3) at the stepped position → apply the game.ts rule; a refused rule throws
              RuleError to that seat only (HC-7)
  5  frame  → ctx.frame(DevFrame)                                // C8, every tick
  6  view   → broadcast full views only if GameState changed (money, stock, plots, done, the moments' outcomes)
  7  end    ← existing: devEndsAt reached, or every seat away-or-done, or everyone Ready (checkAllReady /
              checkDevelopmentOver), now with no walks to settle (nothing is in flight between ticks)
order        seats in seat order within a tick, rotating the first seat each tick (as play.ts does today), so no seat
             always acts first
time         game ms = tick × tickMs; the server maps its clock to ticks (phaseScale applies, as realMs does today);
             a late timer runs the missed ticks, at most DEV_STEER.catchUpTicks, then resyncs (mule-game.ts's
             existing dt clamp, AI_DEV_TICK_MS × 10, is the precedent)
determinism  (seed, the per-tick inputs) → the same floor and state, in the engine, the sim and the server (HC-4).
             The record seam: steer/act reach the game as intents and the tick as a scheduled `fire` (HC-9), so WS3's
             game record (ws3-auctions, §3 frozen at 04406300) replays development with no change to its format;
             the frame (step 5) is output and is not recorded (HC-10).
unknown      a seat with no input yet → IDLE (stands still). A steer with |v| > 1 → normalised. An act while nothing is
             in reach → ignored (no RuleError: the button was dim).
```

```
RULE-2 · Speed                                                   shape: formula

speed (tiles/s) on the map = DEV_STEER.mapTilesPerSecond × terrain[t] × pace × lead × bitten × bot
  terrain[t]   DEV_STEER.terrain (plains 1 … mountains 0.4, swamp 0.5, lake 0 or wading speed per cfg)
  pace         existing dev-walk.ts::pace: hungerPace × sickPace × (Zipwing ? zipwingSpeed : 1)
  lead         DEV_STEER.leadPace (0.9) while leading a MULE, else 1
  bitten       WOLVES.bittenPace (0.5) until the store or an own plot, else 1
  bot          1 for people; DEV_STEER.botSpeed for AI seats (1 by default)
in the hall  speed = the door-to-corral distance / DEV_STEER.floorSeconds × pace × lead (no terrain; floorSeconds 3, AM-7)
movement     position += unit(input) × |input| × speed × dt; diagonals normalised; a blocked step slides along the
             free axis
unknown      a tile with no terrain entry → 1 (and a typecheck error: DEV_STEER.terrain is keyed by Terrain)
examples     plains, fed Zipwing, no MULE: 1.25 × 1 × 1.25 = 1.5625 tiles/s · mountains 0.625 · swamp 0.78 ·
             leading a MULE on plains 1.41 · bitten 0.78                     → T-AC-2
```

```
RULE-3 · What a press does (Reach)                               shape: decision table, first match wins

  #  where / state                                            reach
  1  in an encounter (wolves choose)                          FIGHT (stick = RUN)
  2  in a fight, a wolf open                                  STRIKE
  3  a glint within GLINT.grabReach                           GRAB THE GLINT
  4  your bolted MULE within reach                            CATCH MULE
  5  on the map at the store's door                           ENTER
  6  in the hall, at a door, carrying pelts                   SELL n PELTS · n × WOLVES.peltPrice
  7  in the hall, at the corral, no MULE, MULEs left, money   BUY MULE · mulePrice
  8  in the hall, at an outfitter, an unfitted MULE, money    OUTFIT · good · cost (all six shopfronts: Food,
                                                              Water, Energy, Smithore, Crystite, Rare earth; AM-9)
  8b in the hall, at one of the works' three fitting bays,     OUTFIT · Alloy | Electronics | Medicine · cost
     an unfitted MULE, money                                  (where you stand picks the good; AM-9)
  8c in the hall, at the Green belt, an unfitted MULE, money   OUTFIT · Green belt · cost (AM-9)
  8a in the hall, at an outfitter, leading a MULE fitted for   RE-OUTFIT · good · DEV_STEER.reoutfitCost(good)
     another good (one taken off a plot, row 11a), money      (AM-2; the outfit price by default)
  9  in the hall, at a door                                   LEAVE
 10  on the map on an own plot, leading a fitted MULE         INSTALL · good (or a lake plot from its shore,
                                                                per cfg lakeMode); on a plot that has a MULE:
                                                                SWAP · your <good> MULE runs away (today's rule,
                                                                V-4's words; AM-9)
 11  on the map on an own plot, leading no MULE, not analysed  ANALYSE (a plot with a MULE installed too; AM-9)
 12  on an own plot with a MULE and no filter, Alloy held     FIT FILTER
 11a on an own plot with a MULE, leading none                 TAKE MULE (it follows on its lead; the plot makes
                                                              nothing until a MULE is installed again; AM-2;
                                                              after 11 and 12, so analysing and the filter stay
                                                              reachable: AM-9)
 13  in the hall at the pub                                   PUB · END TURN · +payout, from game.ts's pure
                                                              pubPayoutFor(state, id, secondsLeft) (AM-9); reachOf
                                                              takes secondsLeft (the lead refund is 0 today)
 14  otherwise                                                none (the button dims and says where to go)
unknown      money short → the row's words with the shortfall, disabled; the corral empty → NO MULES LEFT
examples     → B-AC-1's loop, T-AC-3
```

```
RULE-4 · Wolves                          shape: state machine per colonist        values: RULE-7

  none ──(on forest|hills|tundra, roll WOLVES.chancePerSecond × dt, cooldown passed)──> choose (WOLVES.chooseSeconds)
  choose ──(stick pushed)──> chase      choose ──(press | time out)──> fight
  chase ──(caught: wolf within reach)──> bitten (pace × bittenPace until store or own plot) ──> none
  chase ──(giveUpSeconds or giveUpTiles from the start)──> none ("got away")
  fight: every lungeEverySeconds a wolf crouches (warnSeconds), then lunges at a spot; standing on it = a bite;
         a wolf that missed stands open; a press then = a strike
  fight ──(strikesToWin)──> won: +pelts            fight ──(bitesToLose)──> lost: the lead MULE bolts
                                                     (boltTiles at boltSpeed; CATCH MULE to lead it again),
                                                     no MULE → stunned stunSeconds
AI           run or fight by WOLVES.botFightShare; dodge chance and strike delay by level (rookie 0.4 / 0.5 s,
             regular 0.6 / 0.35 s, veteran 0.9 / 0.15 s); a share of bot legs routes through wolf land
unknown      a colonist in the hall → no roll; the clock ends mid-encounter → the encounter ends, nothing paid
open         pelts not sold by the turn's end are lost (as built) — flagged for Heiko with the second-MULE item
examples     rookie wins ≈ 1 in 4 (17 of 60 headless) · forest runs escape 13 of 20 (11 of 20 leading a MULE)  → T-AC-6
```

```
RULE-5 · The glint race                                           shape: sequence

  roll: none in the turn's first GLINT.firstAfterSeconds (6) and GLINT.pauseSeconds (5) after one ends; mean gap
        GLINT.meanGapSeconds (20); a tile not a lake, not the store, not impassable (owned plots allowed per cfg)
  lit:  GLINT.showSeconds (8) on every screen; beats "A Crystite glint at x·y! First there wins"
  won:  the first colonist onto the tile, racing or not → prize (1 Crystite, or GLINT.credits per GLINT.prize);
        beat "X got the glint: +1 Crystite"
  else: "The glint faded"
AI    races with GLINT.botShare and within GLINT.botCareTiles, only with time to spare (RULE-8)
examples  Lena wins if she sets off within ~0.7 s on #arcade-glint's layout                      → T-AC-7
```

```
RULE-6 · The corral scramble                                      shape: sequence

  call:  a sale leaves the corral with SCRAMBLE.mulesLeft (2) or fewer and at least one seat still needs a MULE
  race:  beats "2 MULEs left! Race to the corral"; the corral counts down; buying is the normal BUY MULE
  each:  "X got one: 1 left" · the last: "X got the last one: the corral is empty"
  left:  "No MULE this turn for Y"; Y's phone: the pub pays now (its payout falling with the clock)
AI    races only with time to spare (RULE-8), SCRAMBLE.botShare
unknown  no seat needs a MULE → no call                                                          → T-AC-8
```

```
RULE-7 · Heiko's starting values (config)                         shape: table

  DEV_STEER.mapTilesPerSecond 1.25 (half of 1 / DEV_WALK.tileSeconds) · .floorSeconds 3 (door to corral; Heiko, S-2: "3 is fine") · .leadPace 0.9 ·
    .terrain plains 1, desert 0.9, tundra 0.85, forest 0.75, ice 0.75, crater 0.8, hills 0.7, volcanic 0.6,
    river 0.6, swamp 0.5, mountains 0.4, lake 0 (lakeMode 'shore', wading 0.3) · .tickMs 50 · .catchUpTicks 10 ·
    .steerMaxPerSecond 10 · .botSpeed 1 · .botCounterPauseSeconds 0.5 · .trespass true · .mountainsImpassable false ·
    .pubLeadRefund 0 · .reoutfitCost = the outfitter's price (AM-2) ·
    .month1WaitsForFirstMule true (AM-3)
  WOLVES.on true · chancePerSecond 0.1 · packSize 3 · cooldownSeconds 20 · chooseSeconds 3 · chaseSpeed 1.1 ·
    giveUpSeconds 5 · giveUpTiles 4 · bittenPace 0.5 · fightSeconds 10 · lungeEverySeconds 1.6 · warnSeconds 0.8 ·
    strikesToWin 3 · bitesToLose 3 · pelts 2 · peltPrice 20 · stunSeconds 4 · boltTiles 4 · boltSpeed 3.5 ·
    botFightShare 0.5 · botWolfLandShare 0.5 · levels {rookie 0.4/0.5, regular 0.6/0.35, veteran 0.9/0.15}
  GLINT.on true · meanGapSeconds 20 · showSeconds 8 · firstAfterSeconds 6 · pauseSeconds 5 · onOwnedPlots true ·
    prize 'crystite' · crystite 1 · credits 60 · botShare 0.75 · botCareTiles 8
  SCRAMBLE.on true · mulesLeft 2 · maxSeconds 15 · botShare 0.9 · botCareTiles 10
source       the mock's DEFAULT_TUNABLES at ceedd23f (sim.ts), Heiko's rulings of 29 Oct (half speed, 0.9 with a
             MULE, wolves 0.1/s, rookie 1 in 4, "Yes, all five"); names may be adjusted to config.ts style, values not
```

```
RULE-8 · Bots race only with time to spare                        shape: invariant (the PM's ruling, 29 Oct)

  a bot joins a glint race or the scramble only if, after the detour, its errand (RULE-3's remaining steps at
  RULE-2's speed) still fits the time left; DEV_STEER.botsSpareTime (true) — a design note for the real AI hands,
  WS1's execution layer owns the rule.
examples     Kai (sick, rookie) finishes 20/20 turns with it, 15/20 without; 12 of 19 glints still see a bot race
             (63%)                                                                     → T-AC-5
```

```
RULE-9 · The next-step ring (the guide)                           shape: decision table, first match

  1 no MULE, MULEs left, money        → the store, then the corral
  2 an unfitted MULE                  → the outfitters you can pay
  3 leading a MULE taken off a plot   → the outfitters you can pay, its own good dimmed (AM-2)
  3a leading a fitted MULE            → the door on your plot's side, then your nearest own plot that takes it
  4 otherwise                         → the store, then the pub
open (default as built)  after one install the ring goes to the pub even when a second MULE is affordable —
             "should the ring offer a second MULE?" is Heiko's call; flagged
unknown      no own plot free → the pub                                                           → B-AC-1
```

```
RULE-10 · Your own colonist on your phone                        shape: sequence

  each input the phone sends carries the tick it applies at (`steer.tick`, `act.tick`): the phone runs ahead of the
  server by half the round trip plus one tick, applies the input to its own copy at that tick, and the server buffers
  each seat's inputs by tick and applies each at its tick (an input that arrives after its tick applies at the next,
  and the phone's copy corrects as below) (S-2, AM-7);
  on each frame it compares its copy at that tick: within DEV_STEER.snapTiles (0.25) → ease towards the server's
  over DEV_STEER.correctMs (150); beyond → snap. Other colonists draw DEV_STEER.interpolateMs (100) behind the
  newest frame, interpolated between frames. The button's Reach comes from the server's view.
unknown      no frame for > DEV_STEER.staleMs (1000) → the phone shows "reconnecting" and stops predicting
```

## §3 · Contracts & Data Models `[handoff]`

| Contract | change_kind | breaking | produced by | consumers |
|---|---|---|---|---|
| `MuleIntent` += `{type:'steer'; x: number; y: number; tick?: number}` (x, y ∈ [-1, 1] in 1/8 steps, \|v\| ≤ 1; `tick`, the development tick the phone applied it at, AM-7), `{type:'act'}` | ADDED | no | C7 (#176) | server C6, phone C11, AI C9 |
| `ColonistView` v2: `{x, y, space: 'map'\|'hall', facing: 'left'\|'right', moving, lead: {good: Outfit\|null, x, y}\|null, pace, pelts, encounter: 'choose'\|'chase'\|'fight'\|null}` | MODIFIED (v1 fields `at`, `walk`, `assayUntil` go in C14) | yes, at C14 | C7 | phone, TV |
| `MyView.reach: {verb, detail, enabled}`; `MyView.banners` (the moments' lines for you) | ADDED | no | C7 | phone C11 |
| `DevFrame {tick, at, colonists: [{id, x, y, space, facing, moving, lead}], beats: string[]}` via the tabletop's frame message `{t:'frame'; payload}` | ADDED | no | C7, C8 | phone, TV |
| `DevFloor` (engine, not on the wire) | ADDED | — | C1 | server, sim, phone prediction |
| config `DEV_STEER`, `WOLVES`, `GLINT`, `SCRAMBLE` | ADDED | no | C5 | engine, AI, sim |

Example frame (4 seats, one beat): `{"t":"frame","payload":{"tick":412,"at":20600,"colonists":[{"id":"s1","x":5.42,
"y":3.08,"space":"map","facing":"right","moving":true,"lead":null}, …],"beats":["2 MULEs left! Race to the
corral"]}}` — about 200–300 bytes; at 20 frames a second to 5 connections ≈ 30 kB/s on the table's Wi-Fi (S-1
measures it).

## §4 · Failure & Ops `[handoff]`

| Question | Answer |
|---|---|
| A dependency unavailable? | A phone drops: its input zeroes at once (C6), its colonist stands; away seats count as done (existing). The TV drops: nothing in the game waits on it. A late server timer: missed ticks run, capped at catchUpTicks, then resync (RULE-1). |
| Retry / poison / page? | Steering is latest-wins, never retried; a refused act throws RuleError to that seat only (HC-7); a socket over RATE_LIMIT has its extra messages dropped (existing, server.ts) — the phone sends ≤ 10 steers/s so it never reaches it. Nothing pages. |
| Idempotency / delivery? | `steer` is a state (the latest wins), so a duplicate is harmless; `act` is applied at most once per tick per seat; frames are fire-and-forget, the next one supersedes; full views are the source of truth for money, stock and plots. |
| What can race? | Two colonists pressing BUY on the last MULE in one tick: seat order with the rotating first seat (RULE-1) decides, deterministically; two onto a glint tile in one tick: the same. |
| What still works if this breaks? | Behind DEV_STEER.on = false, today's tap-to-walk until C14; after C14, development still ends on its clock (HC-3) even if the tick misbehaves, because the end timer is independent of the tick. |
| How does an operator know? | The server logs per development phase: ticks run, catch-up ticks, frames sent, acts applied/refused; `pnpm sim` reports per turn: installs, pub times, packs, glints raced, scrambles (C10). |

## §5 · Delivery `[handoff]`

Code-only; no stored state (games are in memory). Rollout is **branch by abstraction**: `DEV_STEER.on` (false on
trunk) selects the tick (C6) or today's walk, so every PR lands green and the rig keeps today's game until the
switch. **The switch:** when C6–C12 are on trunk and the steering tests (C15) are green, the PM asks Heiko to play the
rig with DEV_STEER.on; on his OK, one PR sets it true. **Removal:** C14 follows in the next PR. Rollback before C14:
set the flag false. Point of no return: C14's merge.

**What replaces today's click-to-go timer, and when:** the one development clock (DEVELOPMENT.fullSeconds 50, the
shared clock on every screen) stays exactly as it is; what changes is how time is spent — by walking at RULE-2's
speed instead of a tap's computed arrival. It is replaced at the switch PR (Heiko's OK), and the tap code goes at
C14.

## §6 · Acceptance Criteria `[handoff]`

| ID | Given / When / Then | observed_at | negative case | verifies |
|---|---|---|---|---|
| **B-AC-1** (MUST) | Given a development turn on the rig and one phone held sideways with no TV · When the player uses only the stick and the button · Then they reach the store, buy at the corral, outfit, leave with the MULE on its lead, install on their own plot and end at the pub, the button saying each step before it | the phone in a real browser (e2e, the steering step), and the server's GameState (money, the plot's outfit) | a press with nothing in reach changes nothing | C1, C3, C6, C11 |
| **B-AC-2** (MUST) | Given four seats and the TV · When colonists move · Then the TV draws each where the server has it, within one frame | TV page vs the server's floor in the e2e | an away seat's colonist stands still on the TV | C8, C12 |
| **B-AC-3** (MUST) | Given a laptop · When the player holds arrow keys and presses SPACE, or holds the mouse on a spot · Then the colonist walks there and the press acts; the page never scrolls | laptop page in the e2e | keys with the page unfocused do nothing | C11 |
| **B-AC-4** (MUST) | Given a phone at 667×375 and at 844×390 · When the development screen shows the map and the hall · Then nothing overflows its frame and the controls cover 0 px² of the store, own plots and the target | shell.ts measurements | — | C11, C15 |
| **B-AC-5** (MUST) | Given a colonist on forest with wolves due · When the player runs or fights · Then the outcomes of RULE-4 land: bitten and slowed, got away, pelts sold at the store, or the MULE bolted and caught | phone + server state in the e2e (wolves forced by a seeded test option) | no wolves in the hall | C4, C11 |
| **B-AC-6** (MUST) | Given a glint lit · Then every phone and the TV show it at once and the first colonist onto it gets the prize | phones, TV, server stock | after showSeconds it fades and nobody gets it | C4, C11, C12 |
| **B-AC-7** (MUST) | Given 3 MULEs left and 4 seats needing one · When the first sale leaves 2 · Then the TV and phones call the scramble and the one left out is told, with the pub's payout | TV, phones, server | no call when no seat needs a MULE | C4 |
| **B-AC-8** (MUST) | Given a phone that drops mid-turn · Then its colonist stops, the turn still ends on the clock, and on reconnect the player steers again | server + phone | — | C6 |
| T-AC-1 (serves B-AC-1, B-AC-2) | Given a seed and a per-tick input script · When stepFloor runs twice · Then the floors are identical; and the server's floor after a scripted turn equals the sim's (HC-4) | engine unit + server test | a changed input at one tick changes the result | C1, C6, C10 |
| T-AC-2 (serves G-2) | speeds per RULE-2's examples (plains 1.5625, mountains 0.625, swamp 0.78, leading 1.41, bitten 0.78 tiles/s) | engine unit | lake 0 blocks | C1, C5 |
| T-AC-3 (serves B-AC-1) | Reach per RULE-3's table, one row each | engine unit | money short → disabled, not hidden | C3 |
| T-AC-4 (serves B-AC-2) | Given the tick · Then one frame per tick reaches every connection, frames are dropped not queued for a slow one, full views go only on change | server + tabletop test | no full view on a tick where nothing changed | C6, C8 |
| T-AC-5 (serves G-2, RULE-8) | In 20 seeded AI-only turns at the defaults every AI colonist reaches the pub within 50 s, and a bot races in most glints | sim (`pnpm sim` report) | with botsSpareTime off, Kai misses turns | C9, C10 |
| T-AC-6 (serves B-AC-5) | Wolves: the rookie wins ≈ 1 in 4 over 60 seeded fights; a forest run escapes ≈ 13 of 20 | engine headless | — | C4, C9 |
| T-AC-7 (serves B-AC-6) | Glint timing per RULE-5 (none in the first 6 s, 8 s shown, the first onto it wins) | engine unit | a non-racing colonist on the tile wins too | C4 |
| T-AC-8 (serves B-AC-7) | Scramble per RULE-6, the beats in order, the last sale's single line | engine unit | — | C4 |
| T-AC-9 (serves B-AC-8, HC-3) | A seat away for the whole turn: development still ends at devEndsAt; a phone flooding steers at 100/s: the tick keeps its rate | server test | — | C6 |
| T-AC-10 (serves B-AC-1) | The phone's prediction stays within snapTiles of the server over a scripted turn at 100 ms simulated latency | web unit | beyond snapTiles it snaps | C11 |

**Invariants** (asserted by every relevant test): the floor never places a colonist on a lake (shore mode) or
inside a wall; money and stock change only through game.ts rules; development ends by its clock at the latest.

**Migration table:** each test in C15's `today` keeps its promise through `steerTo` (server) or the steering step
(e2e) before C14 deletes `tapThere` and the tap paths; the plan lists them one to one.

## §7 · Risks & Spikes `[review-only]`

- **S-1 · The wire (timebox ½ day, blocks C8's shape).** Measure: viewFor's size in development today; a 20 Hz
  frame to 4 phones + TV over the rig's Wi-Fi; latency phone→server→TV. Stop when: frames ≤ 1 kB at 20 Hz and full
  views on change fit, or the numbers say 10 Hz. Mitigation built in: tickMs and the frame rate are config.
- **S-2 · Feel (timebox ½ day, blocks C11's prediction).** A phone over Wi-Fi steering with RULE-10's prediction:
  does it feel like the mock (which has zero latency)? Stop when Heiko or the PM plays it on the rig. Mitigation:
  snapTiles, correctMs, interpolateMs are config.
- **R-1 · The rate limit.** A joystick can produce many changes a second; HC-5 caps steers at 10/s below
  RATE_LIMIT 20. Mitigation: T-AC-9's flood case; quantised steering (C7, §3: 1/8 steps) makes most stick movements no-change.
- **R-2 · Two copies of the game rules.** The engine floor must call game.ts's rules, never re-implement them.
  Mitigation: C3's MUST; reviewers check no money/stock math in floor/.
- **R-3 · Develop.tsx has no single owner** (the grounding found WS6's PR-10/C18 work and WS4's apps/web default,
  no file-level ruling). Mitigation: C11 retires it for a new owned folder; the PM rules.
- **R-4 · SEAMS.md is not on trunk** (untracked in the main checkout). Ownership claims here come from that file.
  Mitigation: the PM's ruling on the file list below is the record.
- **W-1 · The record's size (watch item, WS3 measures).** The 50 ms tick roughly triples the development steps in
  WS3's game record, about 0.5 MB more per 12-month game in memory (WS3's estimate). WS3 measures it once the tick
  exists; tickMs is config if it needs to come down.
- **Landmines** (memory): positive-control every gate (anchor-check, the 0 px² overlap); a render check by text
  length cannot see numbers change (diff the text); count console errors over the whole run, not the first second
  (the scramble's 181); the shared Docker engine and dev servers: tests own their stack (HC: ephemeral rigs).

## §8 · Amendments `[review-only]`

- **AM-9 (2026-10-29, WS1's readings at PR-1 Task 1.5, ruled by WS6).** RULE-3: row 8 is all six shopfronts; new
  rows 8b (each of the works' three fitting bays is its own place, so where you stand picks Alloy, Electronics or
  Medicine) and 8c (the Green belt): a spec gap, since today's game sells all of them and the mock's slice 1 opened
  four outfitters only as a simplification. Row 10 on a plot that has a MULE keeps today's rule, a swap, in V-4's
  approved words ("SWAP · your Energy MULE runs away"); the mock's dimmed "PLOT HAS A MULE" was not a ruling and goes.
  Row 11 reads "leading no MULE", so a plot with a MULE can be analysed; rows order ANALYSE, FIT FILTER (no filter
  yet), then TAKE MULE, so first-match-wins never hides the filter. Row 13's payout comes from a pure
  `pubPayoutFor(state, id, secondsLeft)` WS3 adds to game.ts (visitPub calls it); reachOf takes secondsLeft. RULE-1:
  start positions just outside a store door, alternating, the other door past a lake.
- **AM-7 (2026-10-29, S-2 played by Heiko).** "tested phone sterring ok. but too fast in store", then "3 is fine".
  Steering passes with the phone stamping each input with its tick and the server applying it at that tick
  (RULE-10, §3's `steer.tick`, already frozen in #176; WS3's PR-3 buffers inputs by tick). The store floor is 3 s from
  the door to the corral (RULE-2, RULE-7; was DEV_WALK's 1 s). Record: `docs/research/2026-10-29-arcade-s2-feel.md`.
- **AM-8 (2026-10-29, WS3 accepts ctx.frame, option A).** A void `ctx.frame(payload)` is unrecorded output, no change
  to the record's §3. Coupling into C8: WS3's recorder and replay pass `frame` through (to the room when recording, a
  no-op on replay), two WS3 lines in C8's wave that WS6 reviews, with a test row that a recorded game's frames still
  reach a client. S-1 still settles 20 Hz against 10 Hz.
- **AM-6 (2026-10-29, PM ruling).** AM-3's month-1 clock does not wait for the arcade switch: Heiko approved it for
  the game now. It is a clock rule in mule-game.ts, not the tick, so it applies with `DEV_STEER.on` false, on
  today's walk. It is built as its own small WS3 PR in the audit build split, after WS1 measures month 1's
  development time on today's walk with the existing sim (AI-only, and with one idle human plus the host's
  Continue). The arcade tick inherits it; T-AC-9's month-1 case pins that. C7 is also frozen first, as a types-only
  PR (the plan's PR-0), so the screens build in parallel with the engine and the server.
- **AM-4 (2026-10-29, the PM's owner ruling).** WS1 is the new sole owner of floor/** with the config blocks, the AI
  hands, play/sim, dev-walk.ts's removal and the play-walk/balance tests. WS3: game.ts as its own edit, dev-steer.ts,
  the mule-game.ts tick, dev-walking.ts's removal, the protocol, the server tests with fake-context, goToThePub. WS4:
  tabletop room/protocol and Store.tsx as its own edits (WS6 reviews Store.tsx; one writer: WS4's small-phone size
  table lands first), harness.ts, smoke, table-steps, zoom. WS6: arcade/**, TvDevelop.tsx, the new packages/ui
  pieces by build ruling (WS4 reviews), shell.ts, screens.ts, store-steps.ts, the next-step/store-view tests, and the
  PhoneApp.tsx/TableApp.tsx route lines as WS6 named edits WS4 reviews. WS5: specials.ts and special-steps.ts. R-3
  closed: Develop.tsx is WS4's by default (born in b29cd15c), next-step.ts WS6's (d4411d6d); WS6 removes both in the
  removal PR, Develop.tsx's deletion a named edit WS4 reviews. Heiko's OK to build: "Yes, build it" (via the PM,
  29 Oct), experiments first, the four open items as built.
- **AM-5 (2026-10-29, plan time).** AM-2 and AM-3 said "WS1's sim first", but the sim cannot play a rule the floor
  does not have yet: it plays the floor from C10. So both sim checks run as soon as the sim plays the floor and gate
  the rule's switch-on, not its code: AM-3's month-1 timing in the AI-and-sim PR, behind
  `month1WaitsForFirstMule`; AM-2's re-outfit sweep before its rows are built, in the moments wave. Each lands behind
  DEV_STEER.on = false, so nobody plays either before the measurement.
- **AM-2 (2026-10-29, Heiko's Q2 "yes", via the PM).** Re-outfitting a MULE is a rule: walk onto your own plot
  with no MULE in tow and TAKE MULE (RULE-3 row 11a), lead it into another outfitter and RE-OUTFIT for the outfit
  price (row 8a, `DEV_STEER.reoutfitCost`), then install it on an own plot (row 10, unchanged). The ring follows
  (RULE-9 row 3). Defaults, as built: a taken MULE still on its lead when the clock ends goes back to its plot with
  its old outfit, nothing lost; re-outfitting for the same good is dimmed; moving it to another own plot unchanged
  is allowed, since leading it there is row 10. **WS1's sim checks it first** (the AI hands may re-outfit; money and
  production per seat over 40 games, `pnpm sim --set DEV_STEER.reoutfitCost=…`), before C3 builds it. Replaces the
  audit mock's dashed "Or re-outfit it at the store" (#audit-dev-swap, V-4). Serves G-1 (no menus) and lands in C3
  and C11; T-AC-3 gains rows 8a and 11a; game.ts's outfit rule gains the re-outfit as a named edit (WS3 owns game.ts
  edits, per the ruling).
- **AM-3 (2026-10-29, Heiko's Q3 "yes", via the PM).** Month 1's development clock stands full until every present
  seat's first MULE is installed; the host's Continue (the approved planning pattern: host only, one confirming tap,
  a news line naming who was passed) starts it past anyone not in, and an away seat counts as in. HC-3 carries the
  exception; the tick, the moments and the AI run while the clock waits. The TV shows whose first MULE is still to
  come (the audit mock #audit-dev-first-month, V-8). `DEV_STEER.month1WaitsForFirstMule` (true; AM-6 puts it in force now, on today's walk). It lengthens month
  1's development, so **WS1's sim measures month 1's time first** (median and max over 40 games, AI-only and with
  one human left idle and the host's Continue). C6's clock and checkDevelopmentOver carry it (WS3); T-AC-9 gains a
  month-1 case: one seat away, the clock still starts once the others are in.
- **AM-1 (2026-10-29, PM's check of 7a0eaf76).** §0 brought back to the gate: "a first-time player" (UBER-AC-1);
  mountains slow the AI too (UBER-AC-2); the TV shows a wolf encounter and a glint race with the AI in both
  (UBER-AC-3); the goal lines restored to the gate's, the 5–15 s detail marked as from the mock design gate. The
  game-record non-goal was false (WS3's record is approved and in build on ws3-auctions; WS6's grep covered trunk
  only): removed, with RULE-1's note, for the record seam HC-9, HC-10 and watch item W-1. WS3 confirms its §3 needs
  no amendment.

## §9 · Ownership Boundaries `[handoff]`

### Ownership: the dev floor (colonist motion and the development moments)
- **Sole owner (proposed):** WS1 — `packages/engine/src/floor/**` (new). WS1 already owns dev-walk.ts, the walking
  config and the AI hands (.handover/SEAMS.md:9 and :363), so motion, its numbers and its AI stay in one lane.
- **Read contract:** `stepFloor`, `reachOf`, `pathTo`, the hall plan, the moments' step functions; DevFloor is read
  by the server, the sim and the phone's prediction, never written by them except through stepFloor.
- **Write contract:** only `floor/**`; money and stock change only by calling game.ts's rules (WS3's).
- **Enforcement:** a package-boundary test in packages/engine (floor/ imports nothing from apps/ or packages/ai,
  and nothing outside floor/ assigns DevFloor fields), plus the PR review rule R-2.

### The file list, with owners (ruled by the PM, 2026-10-29, AM-4)

| File | New / edit | Proposed owner | Reviewers | Change |
|---|---|---|---|---|
| packages/engine/src/floor/floor.ts, step.ts, speed.ts | new | WS1 | WS3, WS6 | C1 |
| packages/engine/src/floor/hall.ts | new | WS1 | WS4, WS6 | C2 |
| packages/engine/src/floor/reach.ts | new | WS1 | WS3, WS6 | C3 |
| packages/engine/src/floor/path.ts | new | WS1 | WS6 | C9, RULE-9 |
| packages/engine/src/floor/wolves.ts, glint.ts, scramble.ts | new | WS1 | WS6 | C4 |
| packages/engine/src/config.ts (DEV_STEER, WOLVES, GLINT, SCRAMBLE) | edit | WS1 | WS6 | C5 |
| packages/engine/src/game.ts (pelts, glint prize, the bolted MULE's lead; AM-2's take and re-outfit) | edit (WS3's own) | WS3 | WS1 | C4, AM-2 |
| packages/engine/src/dev-walk.ts | remove (C14) | WS1 | — | C14 |
| apps/server/src/dev-steer.ts | new | WS3 | WS1 | C6 |
| apps/server/src/mule-game.ts (the tick, end conditions, away) | edit | WS3 | WS1, WS6 | C6, C14 |
| apps/server/src/dev-walking.ts | remove (C14) | WS3 | — | C14 |
| packages/protocol/src/index.ts | edit | WS3 | WS6 | C7 |
| packages/tabletop/src/room.ts, protocol.ts (frame message) | edit (WS4's own) | WS4 | WS3 | C8 |
| packages/ai/src/hands/develop.ts, seat.ts, strategist.ts, value.ts | edit | WS1 | WS2 | C9 |
| packages/ai/src/play.ts, sim.ts | edit | WS1 | WS3 | C10 |
| apps/web/src/phone/arcade/** (Develop screen, controls, prediction, layers, guide ring) | new | WS6 | WS4 | C11 |
| apps/web/src/phone/PhoneApp.tsx (the development route) | named edit by WS6 | WS4's file | WS4 | C11 |
| apps/web/src/phone/Develop.tsx (WS4's by default) | remove (C14), a named edit by WS6 | WS6 removes | WS4 | C14 |
| apps/web/src/phone/next-step.ts (WS6's, born in C18/C19) | remove (C14) | WS6 | WS4 | C14 |
| apps/web/src/table/TvDevelop.tsx | new | WS6 | WS4 | C12 |
| apps/web/src/table/TableApp.tsx (the development branch) | named edit by WS6 | WS4's file | WS4 | C12 |
| packages/ui/src/components/Store.tsx (plan, free visitor positions) | edit (WS4's own), after WS4's small-phone size table | WS4 | WS6 | C2 |
| packages/ui (live map overlay; Joystick, ActionButton, Wolf/Glint sprites) | new components, by build ruling (as PR-2's ProductionMap) | WS6 | WS4 | C11, C13 |
| apps/server/test/fake-context.ts (steerTo), dev-walking.test.ts and the C15 server tests | edit | WS3 | WS1 | C15 |
| packages/ai/test/play-walk.test.ts, balance.test.ts | edit | WS1 | WS3 | C15 |
| apps/web/e2e/harness.ts (steering step), smoke.ts, table-steps.ts, zoom.ts | edit | WS4 | WS6 | C15 |
| apps/web/e2e/store-steps.ts, screens.ts | edit | WS6 | WS4 | C15 |
| apps/web/e2e/specials.ts, special-steps.ts | edit | WS5 | WS6 | C15 |
| apps/web/e2e/auction-steps.ts::goToThePub | named edit | WS3 | WS6 | C15 |
| apps/web/e2e/shell.ts (667×375) | edit | WS6 | WS4 | C15 |
| apps/web/test/next-step.test.ts, store-view.test.ts | edit / remove | WS6 | WS4 | C15 |

**Open items for Heiko** (defaults as built): (1) the ring offering a second MULE when you can afford one
(RULE-9); (2) pelts not sold by the turn's end are lost (RULE-4); (3) chat during development: the mock's phone
shows no ticker — default: the existing chat ticker (C20) sits along the map's top edge on the phone, as the TV keeps
it; (4) the left side room's small status text at 844×390.
