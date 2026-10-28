# WS3: Colonists Walk on One Development Clock (WS6-C13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** WS6's spec is Programme. This plan covers **one change of it, C13, which WS3 owns** (server and protocol), so it carries Sketch weight: one PR, a task list and one merge gate. The PR is stacked on WS1's R1 PR #109 (PM ruling (a), SEAMS 2026-10-28). The PM merges #109 and then this PR in consecutive merges, both with Heiko's OK, and rebuilds the rig only after both.

<!-- plan-check: no-task C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C14 C15 C16 C17 C18 C19 C20 — WS6's other changes: built by WS6, WS4 or WS1 in their own plans; this plan's change alone is WS3's -->
<!-- plan-check: no-task B-AC-1 B-AC-2 B-AC-3 B-AC-4 B-AC-5 B-AC-6 B-AC-7 B-AC-8 B-AC-10 B-AC-12 B-AC-13 B-AC-14 B-AC-15 B-AC-16 B-AC-17 B-AC-18 T-AC-1 T-AC-3 T-AC-4 T-AC-5 T-AC-6 T-AC-8 T-AC-9 T-AC-10 T-AC-11 — WS6's ACs for its other changes; this plan's two are tasked below -->
<!-- plan-check: no-task B-AC-9 T-AC-2 — named in Task 5 only as existing tests whose timing moves (WS6's B-AC-9 store-view pin; WS4's T-AC-2 in phase-scale.test.ts); their promises are other plans' -->

## Goals: lifted from WS6's spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-3 [WS6 spec §0, UX-3] | every player, and the TV watchers who see the race for the last MULE | walking costs time on the one clock, so where you build and how fed you are matter | UBER-AC-3 (server half: the seeded Zipwing test, T-AC-7) | **this plan** (the screens' half is WS6-C14) |

**Non-goals (WS6 spec §0), lifted verbatim. A task serving one is cut:**
- R1's numbers: WS1 measures walking speeds in the sim; Heiko approves them.
- The original's assay office and land office booths: our analysis happens on the plot and listings in planning.
- A joystick or free steering: tap to walk only.

**Thin baseline (WS6 spec §0.1):** the two moving lines and units on the auction board, and a static per-plot list with reasons. It lost because Heiko ruled for the walk-in store (D1 "One hall, two rows", R1 "Yes, sim first").
→ **This plan's relationship:** the shortest slice through the chosen approach on the server. The engine's walking rule exists (WS1-C15 `walkSeconds` in #109); this plan makes the server charge it.

**Constraints:** WS6 spec §0.2:
- **HC-3:** walking only after Heiko approves WS1's numbers. Met: AM-12 and AM-13.
- **HC-4:** the engine stays pure.
- **The repo's CLAUDE.md:** rule errors throw `RuleError`; balance numbers live in config.ts.

**Architecture:**
- **One clock:** the server keeps one development clock for every seat (WS6 AM-14; PM ruling of 2026-10-28) instead of one per player. Every development time is converted once, real ms ↔ game seconds, through `phaseScale`.
- **Each colonist** has a place (`DevPlace`) and may be busy walking or assaying. A tap names where to go and what to do there; the action applies on arrival through the same engine call as today.
- **Arrivals** are applied in order of arrival time, then seat order.
- **The rule mirrors WS1's sim referee** (WS1-C20, `packages/ai/src/play.ts::applyAction`/`arrive`/`walkTarget` at #109), so the sim measures what the server plays.

**Tech stack:** TypeScript, vitest server tests on a fake game clock (`apps/server/test/fake-context.ts`), Playwright e2e through tsx.

**Inputs:**
- **The spec:** WS6's `docs/specs/2026-10-21-ws6-ux.md` at `origin/ws6-ux`: §1 C13, §2 RULE-5, §4 "Races?", §6 B-AC-11 and T-AC-7, §8 AM-14. WS1's `docs/specs/2026-10-21-ws1-balance.md` at `origin/ws1-balance`: §3 (the `walkSeconds` contract), §8 AM-12 and AM-13 (WS1-C15, C18, C20).
- **Sections present and consumed:**
  - WS6's §1 C13, §2 RULE-5, §4 (the race row), §6 (B-AC-11, T-AC-7) and §8 AM-14;
  - WS1's §3.
- **N/A for this change:** §5 Delivery (no data and no migration) and §9 (no new owned entity; the files are WS3's per SEAMS).
- **N/A claims checked:** §3. WS6's spec declares no shape for "places are public", so this plan locks one (Contract below) and asks WS6 to record it in their §3.

**Plan-drift corrections**, from rulings made after the spec's text:
- **B-AC-11 "the walk's time gone from her clock" and UBER-AC-3's "gone from your clock":** read "the clock ran on while she walked". There is one clock (AM-14).
- **T-AC-7 "half a Mollox's time":** read `1 / SPECIES_PERK.zipwingSpeed` (1.5) of it. RULE-5 at AM-13 sets the Zipwing's pace to 1.5. Assert against `walkSeconds`, never a literal.
- **B-AC-11 "a tap while walking is ignored":** the server refuses it with `RuleError('Still walking')` and changes nothing. That is "ignored" at the server's state, where the AC observes it. Whether the phone shows the message is WS6-C14's call.
- **`PHASES.developmentGraceMs` goes** (PM OK, 2026-10-28): the phase ends with the one visible bar.

## Contract (locked before Task 4 consumes it; WS6-C14 is its consumer)

`PlayerView` (packages/protocol, WS3's) gains `colonist`, public:
- `colonist: null` outside development;
- in development, `{ at, walk, assayUntil }`:
  - `at: DevPlace`, where it stands, or where it's walking to;
  - `walk: { from: DevPlace; startedAt: number; arrivesAt: number } | null`;
  - `assayUntil: number | null`.

Times are the server's ms, like `phaseEndsAt`. `MyView.devEndsAt` keeps its name and becomes the one clock's end, the same for every seat. WS6's `condition` (#109) sits beside it, unchanged.
- [ ] **Step C.1 (the lead):** send the shape to WS6 and get its OK before Task 4. If WS6 needs a different shape, update this block first.

## Authority

- **`may_edit`:**
  - `apps/server/src/mule-game.ts`, the development section, `viewFor` and `scheduleAiDevelop`;
  - `packages/protocol/src/index.ts`, `PlayerView.colonist` only;
  - `packages/engine/src/config.ts`, the `PHASES` block only (remove `developmentGraceMs`);
  - `apps/server/test/**`. New `dev-walking.test.ts`, plus timing fixtures in WS3's server tests.
- **Named edits, each told to its owner with its SHA:**
  - `apps/server/test/phase-scale.test.ts` T-AC-2 (WS4);
  - `apps/server/test/broadcast.test.ts` FM-1 (WS4);
  - `apps/server/test/handoff.test.ts` (WS4), if it breaks;
  - `apps/server/test/store-view.test.ts` (WS6's B-AC-9), timing only, if it breaks;
  - `apps/web/e2e/store-steps.ts::gameOf` and `giveStoreTime` (WS6's hunk in WS4's e2e). The private `devEndsAt` map becomes one number: `game.devEndsAt = game.ctx.now() + STORE_WALK_SECONDS * 1_000`, and the check `instanceof Map` becomes `typeof … === 'number'`.
- **`must_not_edit`:**
  - `packages/engine/src/dev-walk.ts` and `DEV_WALK` (WS1's, §9);
  - `packages/ai/**` (WS1 and WS2; the hands already take `walk?: { at, busy }` in #109);
  - `apps/web/src/**` (WS6-C14's screens; `Develop.tsx` keeps reading `me.devEndsAt`);
  - `packages/engine/src/game.ts` (R1 changes `startDevelopment` inside #109).

Standing authority line, for every handoff:

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

**Contention:**
- `apps/server/src/mule-game.ts` and `packages/protocol/src/index.ts` are also touched by WS6's `condition` hunk, which lands inside #109. **Serialised:** this branch starts from #109's head and rebases onto it if #109 moves.
- `apps/web/e2e/store-steps.ts` is also touched by WS6's B-AC-9 step inside #109. **Serialised** the same way.

## Tasks

### Task 0: base pre-flight (the lead)

- [ ] **Step 0.1: branch `ws3-dev-walking` from `origin/ws1-balance` (#109's head), install, measure the base:**

  ```bash
  pnpm install --frozen-lockfile --offline && pnpm typecheck && pnpm test
  ```

  Record every package's count in the lane ledger. A red base test that belongs to #109 (WS1 named `store-view.test.ts:33` until its fix lands) is #109's to fix. Note it, and don't fix it here.

### Task 1: RED tests: C13, RULE-5, B-AC-11, T-AC-7, and the §4 race

**ACs verified:** B-AC-11 (server half), T-AC-7, UBER-AC-3 (server half); WS6 §4 "Races?"; and WS3 failure modes FM-one-clock, FM-scaled-clock and FM-pub-late.
**Files:** create `apps/server/test/dev-walking.test.ts`. Reuse `fake-context.ts`'s game clock and the `toDevelopment`-style helpers in `installed-this-turn.test.ts` or `mule-game.test.ts`; don't copy them into a third place.

- [ ] **Step 1.1: write the failing rows,** at server altitude: drive `MuleGame.handle` on the fake clock, and observe `viewFor(seat)`, `viewFor(null)` and the game state.
  - `T-AC-7` (serves B-AC-11):
    - a Zipwing and a Mollox tap the same plot from the store, and arrive at `walkSeconds(...)` for each; the Zipwing's time is `1 / zipwingSpeed` of the Mollox's;
    - an install applies only at arrival: one tick before, the plot isn't theirs; at arrival, it is;
    - negative: a walk whose arrival is after the clock's end is refused and changes nothing.
  - `B-AC-11` (server half):
    - Lena taps the corral and is busy walking; her MULE is hers only at arrival, `walkSeconds(…, 'store', 'corral')` later;
    - while walking, any tap is refused "Still walking" and her state is unchanged;
    - every other phone's view and the TV's show her `colonist.walk` to `'corral'` with `arrivesAt`.
  - `WS6 §4 Races?`: two colonists head for the corral with one MULE left. The earlier arrival gets it; at the same arrival ms, the lower seat gets it. The other keeps its money, isn't charged, and a news line says so.
  - `FM-one-clock`:
    - every seat's `me.devEndsAt` is the same: development's start + `fullSeconds × 1_000 × phaseScale`, with no grace;
    - the phase ends there;
    - the pub ends only its seat's turn; the phase ends early once every seat is done or away.
  - `FM-pub-late`:
    - a pub tap with less time left than its walk is never refused, and pays the payout for the game seconds left at arrival, floored at 0;
    - at the clock's end, a colonist still walking to the pub is paid with 0 left;
    - an action whose walk ends exactly at the clock's end still applies.
  - `FM-scaled-clock`, a past bug: the assay charge (`mule-game.ts` analyse) and the pub share were measured in real seconds.
    - At phaseScale 0.1 and at 1, an assay keeps the colonist busy `seconds × 1_000 × phaseScale` ms;
    - a pub at the clock's halfway point pays the same at both scales.

  **Traps:**
  - Read times from `walkSeconds` and `DEVELOPMENT`, never literals.
  - Advance the fake clock past an arrival before asserting it applied, and stop one tick short to assert it hadn't.
  - Pick seats and plots so walks are at least 2 steps; a 0-step walk proves nothing.

- [ ] **Step 1.2: run them and see each fail for the reason in its title:**

  ```bash
  pnpm --filter @mule/server exec vitest run test/dev-walking.test.ts
  ```

- [ ] **Step 1.3: commit as RED:** `test(server): colonists walk on one development clock: C13, B-AC-11, T-AC-7, the corral race (red)`.

### Task 2: one clock and game seconds (FM-one-clock, FM-scaled-clock)

**Spec sections consumed:** WS6 AM-14; the PM ruling of 2026-10-28.

- [ ] **Step 2.1: implement in `apps/server/src/mule-game.ts`:**
  - **Per-player clocks go:** the per-player `devEndsAt` map and its per-seat schedules are replaced by one development end in the same field name, `devEndsAt: number | null`. The phase-end timer follows the field if it moves, so a test fixture may extend it.
  - **One unit helper:** a single helper turns real ms into game seconds and back through `phaseScale`. `requireTime`, the analyse charge, the pub's `secondsLeft` and the AI tick all use it.
  - **`doneDeveloping`** reads the one clock.
- [ ] **Step 2.2: remove `PHASES.developmentGraceMs`** (config.ts). `PHASE_MS.development` becomes `DEVELOPMENT.fullSeconds * 1_000`.
- [ ] **Step 2.3:** FM-one-clock and FM-scaled-clock go green. Commit: `fix(server): one development clock for every seat, timed in game seconds`.

### Task 3: colonists walk; the action applies on arrival (C13, RULE-5, the race)

**Spec sections consumed:** WS6 §1 C13, §2 RULE-5, §4 "Races?"; WS1 §3 `walkSeconds`.
**Depends on:** Task 2; Step C.1 (the contract).

- [ ] **Step 3.1: implement in `apps/server/src/mule-game.ts`,** mirroring `packages/ai/src/play.ts::walkTarget`, `applyAction`, `arrive` and `applyRule` at #109:
  - **Start:** every colonist starts development in `'store'`.
  - **Where each action goes:**
    - `buyMule` walks to `'corral'`;
    - `pub` walks to `'store'`;
    - `install`, `analyse` and `filter` walk to `tileIndex(state.width, x, y)`;
    - `outfit` applies where the colonist stands, as in the sim.
  - **At the tap:**
    - a tap while busy is refused: "Still walking", or "Still assaying";
    - a walk arriving after the clock's end is refused, except to the pub.
  - **Arrival:** the colonist is busy until its arrival, `walkSeconds × 1_000 × phaseScale` ms after the tap. Pending arrivals are applied in order of arrival time, then seat order, through the same engine calls as today. A RuleError at arrival (e.g. the MULEs ran out) changes nothing for that seat and adds a news line.
  - **Assay:** an analyse, on arrival, keeps the colonist busy for its seconds where it stands.
  - **Pub:** pays the game seconds left at arrival, floored at 0. At the clock's end, a colonist still walking to the pub is paid with 0.
- [ ] **Step 3.2:** fill `PlayerView.colonist` per the Contract, and add the field to the protocol type.
- [ ] **Step 3.3:** T-AC-7, B-AC-11, the race, and FM-pub-late go green. Commit: `feat(server): colonists walk; the action applies on arrival (C13, RULE-5)`.

### Task 4: AI seats walk on the server (C13: "AI hands walk too")

**Depends on:** Task 3.

- [ ] **Step 4.1: write the failing row in `dev-walking.test.ts`:**
  - `C13: AI seats walk too`. At phaseScale 1, an AI seat in a walking game buys, outfits and installs a MULE. It never draws a "Still walking" refusal (count the refused AI moves), and its install lands at its arrival.
  - Commit RED.
- [ ] **Step 4.2: implement in `scheduleAiDevelop`:**
  - pass `developTick` the game ms that passed, `dt / phaseScale`, and the clock's game seconds left;
  - pass `walk = { at, busy }` from the colonist's place;
  - the AI's moves go through the same walking path as a phone's.

  Green. Commit: `feat(server): AI seats walk on the server, told where they stand and whether they are busy`.

### Task 5: existing tests that assumed instant moves or per-player clocks

These are fixture changes only. Each changed assertion must still assert its own promise; strengthen, never delete. List each in the commit message.

- [ ] **Step 5.1: run `pnpm --filter @mule/server test` and fix each red file's timing,** advancing the clock to the arrival. Expected:
  - `mule-game.test.ts` :116–120, where the assay shortened the seat's clock, becomes "the assay keeps the colonist busy";
  - `mule-game.test.ts` :163;
  - `phase-scale.test.ts` T-AC-2 :62–66, which reads `devEndsAt`, the one end now (WS4 named edit);
  - `broadcast.test.ts` FM-1 :19–20, the AI's and humans' ends, now one (WS4 named edit);
  - `installed-this-turn.test.ts`, `land-auction*.test.ts` and `score-view.test.ts`: walk, then advance.
- [ ] **Step 5.2: the `store-steps.ts` named edit** (see Authority). Then run the web build and `MULE_E2E_SEED=1 pnpm --filter @mule/web e2e:core`.
- [ ] **Step 5.3:** commit `test(server): fixtures walk to arrival on the one clock`. Commit the store-steps edit separately, so its owner reviews one hunk.

### PR merge gate

- [ ] T-AC-7, B-AC-11 (server half), the §4 race, FM-one-clock, FM-scaled-clock, FM-pub-late and "AI seats walk too" are green, named so, and each RED commit comes first.
- [ ] `pnpm typecheck` · `pnpm test` · `MULE_TIER2=1 pnpm --filter @mule/server exec vitest run test/land-auction-sim.test.ts` are green.
- [ ] The web build, then `MULE_E2E_SEED=1 pnpm --filter @mule/web e2e:core` and `pnpm --filter @mule/web e2e:regression`, are green. This PR lands on trunk, so Tier 2 runs.
- [ ] `trace-check` over the branch is PASS.
- [ ] The named edits' owners have the SHAs (WS4: phase-scale and broadcast; WS6: store-steps, and store-view if touched). WS6 has OK'd the Contract.
- [ ] A code review has come back clean, with a mutation sweep on the arrival queue, the busy check and the unit helper.
- [ ] The PR targets `ws1-balance` while #109 is open. It's retargeted to `feat/strategist` the moment #109 merges, then the PM merges it next, with Heiko's OK.

## Pre-implementation checklist

- [ ] The spec is approved: WS6's C13 and RULE-5 (AM-13 and AM-14, Heiko's rulings), and WS1's AM-12 and AM-13; the PM ruling (a) on landing.
- [ ] Base `ws1-balance @ <sha>`: tsc 0 · tabletop · ui · engine · ai · server · web counts. ← run Task 0 and paste the numbers
