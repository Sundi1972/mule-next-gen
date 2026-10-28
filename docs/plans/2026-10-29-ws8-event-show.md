# WS8 · The event show in the game · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Programme (Heiko, 29 Oct)

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 [spec §0] | everyone at the table | every event plays its own story on the TV; WS1's wave 1 reaches a table | UBER-AC-1 | **PR-1** |
| G-2 [spec §0] | the solo player, a table with no TV | the phone plays every event itself | UBER-AC-2 | **PR-1** |

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- Any event rule, chance or effect (WS1's event model and wave 2; pirate raid and store fire rules are WS1's AM-4).
- Redesigning anything: the gallery is the design; an implementer never designs a screen.
- Sound and stingers; events beyond the catalogue's 35; directions A and C.
- The phase screens themselves (planning hub, development, auctions, election): the show plays over them.

**Thin baseline (spec §0.1):** loop WS6's production show over every event, text cards elsewhere · about 1 day · lost
because ProductionMap's `EventKind` has 9 kinds (no ship, store or mob) and its event window is a fixed 4.8 s (checked
again at plan time, bb15a2b: true).
→ **PR-1 relationship:** the shortest slice through the chosen approach. Wave 1 fires only in production (WS1's
`EVENTS` rows on `ws1-events-roller` 605749d: every colony and player row but sickness lists `production`), so PR-1
is production alone, on the TV and the phone, through the new module, and it is WS1's table gate.

**Constraints:** spec §0.2 (HC-1 … HC-6) travel with every task.

**Architecture:** the gallery's engine is grafted into `packages/ui/src/events/**` as a pure function of the show clock.
The server owns every length (`EVENT_SHOW`) and sends each event's `playMs` in the view; production's timeline grows
to fit its events (PR-1). PR-2 widens the view to every phase, holds timed phases while their events play, and mounts
one overlay on the TV and one on the phone.

**Tech Stack:** TypeScript strict, React 18.3.1, Tailwind v4 with the @mule/ui tokens, vitest, Playwright (e2e).

**Inputs:**
- Spec: `docs/specs/2026-10-29-ws8-event-show.md`
- Binding scaffold: `design/mocks/ws8-events/` at de9d6b7, phone fixes at 522ebac4 (spec AM-1)
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1-C12), §2 (RULE-1..4), §3, §4, §6, §7, §9
- Sections declared N/A by the spec, with its reason: §5 Delivery ("Code-only; no existing state to reach")
- N/A claims I checked: §5: no persisted state reads EVENT_SHOW or the view; games re-read lengths at phase entry. True.

---

## PR decomposition

**Feature branch:** `ws8-events` (the lane branch; to `feat/strategist` only with Heiko's OK via the PM)

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-1 | `ws8-show-pr1` | Tasks 0-6 and 3b (C1-C7, AM-5) | B-AC-1, B-AC-2, T-AC-1..6, T-AC-9 | EVENT_SHOW; ProductionEventView + phase, weight, playMs | MonthEvent.phase (WS1 0582373) | Yes |
| PR-2 | `ws8-show-pr2` | Tasks 9-13 (C8-C12) | B-AC-3, B-AC-4, T-AC-7, T-AC-8, T-AC-10 | EventView, MuleView.events | WS1 wave-2 rows, MonthEvent.effects / becomes / muleLost / pending | Yes |

PR-1 is one wave: its tasks run in order (C2/C3 atomic; C5-C7 share the timeline). PR-2 starts only after WS1's
wave-2 rows land (freeze point: the payload agreed with WS1 on 29 Oct).

### PR-1 authority

- `may_edit`: `packages/ui/src/events/**`, `packages/engine/src/config.ts` (the EVENT_SHOW block only),
  `apps/server/test/events-view.test.ts`, `apps/web/test/events-*.test.tsx`, `packages/ui/test/events*.test.ts`, `apps/web/e2e/events.ts`
- `may_edit` (named edits, owner reviews): `apps/server/src/mule-game.ts::startPhaseTimer`, `::productionView` (WS3);
  `packages/protocol/src/index.ts::ProductionEventView` (WS3); `packages/ui/src/components/ProductionMap.tsx` (WS6);
  `apps/server/test/production-view.test.ts` fixtures (WS6); `packages/ui/src/index.ts` export line,
  `packages/ui/src/theme.css` @import line (WS4)
- `may_edit_content`: `apps/web/src/table/TvProduction.tsx`, `apps/web/src/phone/Production.tsx` (WS6's files; the
  gallery's composition is binding: wire data and timing, never change composition, route or tokens)
- `must_not_edit`: every other config block; `packages/engine/**` except the EVENT_SHOW block (HC-2; WS1, WS3, WS5);
  `apps/web/src/table/TableApp.tsx`, `apps/web/src/phone/PhoneApp.tsx` (PR-2's lines); `design/mocks/**` (the approved
  scaffold, read only); `apps/web/e2e/**` except `events.ts` (WS4's harness and runner: named edits only)

### PR-2 authority

- `may_edit`: as PR-1's, plus `apps/web/src/events/**`
- `may_edit` (named edits): `apps/server/src/mule-game.ts::enterPhase` and the view builder, `packages/protocol/src/index.ts`
  (EventView, MuleView.events) (WS3); `apps/web/src/table/TableApp.tsx::TvGame`, `apps/web/src/phone/PhoneApp.tsx` (one
  line each, WS4)
- `must_not_edit`: the phase screens (`phone/hub/**`, `Develop.tsx`, `Auction.tsx`, `LandGrant.tsx`, `LandAuction.tsx`,
  `TvElection.tsx`, `TvLandAuction.tsx`); `packages/engine/**` except EVENT_SHOW

Standing authority line, in every handoff:

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

### Contention

| path | touched by | resolution |
|---|---|---|
| `apps/server/src/mule-game.ts` | PR-1 (C2, C3), PR-2 (C8, C9) | **serialised** — PR-2 branches from PR-1's merge |
| `packages/protocol/src/index.ts` | PR-1 (C3), PR-2 (C8) | **serialised** |
| `packages/ui/src/events/**` | PR-1 (C4), PR-2 (C12) | **serialised** |
| `apps/web/src/table/TvProduction.tsx` | PR-1 (C6), WS6's #139 | **serialised** — sync with trunk after #139 merges, before Task 4 (spec §7 R-2) |

---

## Phase P1 · PR-1 (wave 1, production)

### Task 0: Base and sub-branch

- [ ] **Step 1:** `git switch -c ws8-show-pr1 ws8-events` (ws8-events contains the mock at de9d6b7 and trunk b3774fa)
- [ ] **Step 2:** if WS6's #139 has merged into `feat/strategist`, merge it in now (spec §7 R-2); run `pnpm typecheck && pnpm test`, expect exit 0

### Task 1: The show's lengths and production's length — C1, C2, C3

**Depends on:** — · **ACs verified:** T-AC-1, T-AC-2 · **Spec sections consumed:** §1 C1-C3, §2 RULE-1, §3

**Files:**
- Modify: `packages/engine/src/config.ts` (new EVENT_SHOW block, beside `PHASES`)
- Modify: `apps/server/src/mule-game.ts::startPhaseTimer`, `::productionView`
- Modify: `packages/protocol/src/index.ts::ProductionEventView`
- Modify: `apps/server/test/production-view.test.ts` (fixture lines only)
- Test: `apps/server/test/events-view.test.ts` (new)

- [ ] **Step 1: Write the failing test `T-AC-1: production runs long enough for its events (RULE-1)`**
  Altitude: promise — `MuleGame`'s view with the fake context (`apps/server/test/fake-context.ts`): assert
  `phaseEndsAt − now` and `production.lengthMs`. Cases from RULE-1's examples, plus phaseScale 0.1. Report events are
  injected through the month report (the engine's `runProduction` is WS1's; do not edit it). Negative: upkeep's length
  is unchanged.
- [ ] **Step 2: Write the failing test `T-AC-2: the production view lists every event in fired order with phase, weight and playMs`**
  Altitude: contract — the view a screen receives. Negative: a quiet month lists none.
- [ ] **Step 3: Run both; expect FAIL** — `pnpm --filter @mule/server exec vitest run test/events-view.test.ts` → FAIL (EVENT_SHOW not exported)
- [ ] **Step 4: Implement C1 per spec §1 C1 and §3 EVENT_SHOW.** Mechanism: sprout. Values from the gallery's TV beats
  (`design/mocks/ws8-events/src/events.ts::BEAT`, `::playLength`, `src/story.ts::STORY`), in ms; `productionWindowMs: 4_800`.
- [ ] **Step 5: Implement C2 and C3 per spec §1 C2, C3 and §2 RULE-1.** Mechanism: in_place. Plan-drift corrections: none.
- [ ] **Step 6: Run** `pnpm --filter @mule/server exec vitest run` → PASS, including `production-view.test.ts` and `phase-scale.test.ts` unchanged except the fixture lines
- [ ] **Step 7: Commit** — red then green: `test(server): T-AC-1, T-AC-2 …` then `feat(server): C1-C3 events set production's length and reach the view (verifies T-AC-1, T-AC-2)`

### Task 2: The show module, wave-1 looks — C4

**Depends on:** Task 1 (contract) · **ACs verified:** (T-AC-4, T-AC-6 with Tasks 3-6) · **Spec sections consumed:** §1 C4, §0.2 HC-1, HC-6

**Files:**
- Create: `packages/ui/src/events/**` (+ `events.css`)
- Modify: `packages/ui/src/index.ts` (one export line), `packages/ui/src/theme.css` (one @import line)
- Test: `packages/ui/test/events-segments.test.ts` (new)

- [ ] **Step 1: Write the failing test `T-AC-4: a segment per event, in fired order, of the view's playMs`**
  Altitude: unit — the module's pure timing core (many combinations; the rendered check is in Task 3). Negative: no
  events → no segments.
- [ ] **Step 2: Run** `pnpm --filter @mule/ui exec vitest run test/events-segments.test.ts` → FAIL (module missing)
- [ ] **Step 3: Implement C4 per spec §1 C4.** Mechanism: fill_scaffold. Graft from `design/mocks/ws8-events/src` at
  de9d6b7: `living.tsx`, `events.ts` (timing only), `glyphs.tsx`, `copy.ts`, `catalogue.ts` (display data), `fx.tsx`,
  `phone.tsx`, the wave-1 parts of `scene.tsx`/`stories-plots.tsx` (bumper harvest). Replace: the mock's fixtures
  (`scenarios.ts`, `fixture.ts`), `stage.tsx`'s show context (the caller passes `t`), the borrowed `PlotMap` (use
  `HoloMap`). Keep every `data-testid`. Plan-drift corrections: segment lengths come from the view's `playMs`, never
  from `STORY`/`BEAT` at runtime (HC-3).
- [ ] **Step 4: Run** the test → PASS; `pnpm --filter @mule/ui typecheck` → 0
- [ ] **Step 5: Commit** — `test(ui): T-AC-4 …` then `feat(ui): C4 the event show module, wave-1 looks`

### Task 3: The production show plays every event — C5

**Depends on:** Task 2 · **ACs verified:** T-AC-3, T-AC-4 · **Spec sections consumed:** §1 C5, §2 RULE-1, RULE-2

**Files:**
- Modify: `packages/ui/src/components/ProductionMap.tsx` (`::ProductionMap`, `::finalUnits`, `::landed`, `::SHOW` use, `::showTime`)
- Test: `apps/web/test/events-production.test.tsx` (new)

- [ ] **Step 1: Write the failing tests `T-AC-3: a plot adds every event's delta in order, never below 0` and `T-AC-4: the map shows the event that is playing; the goods fly after the last`**
  Altitude: promise for T-AC-4 (rendered `data-event`, bar counts); unit for T-AC-3's RULE-2 example (1 → 0 → 0).
  Trap: a quiet month must render exactly as today — keep `apps/web/test/production-show.test.ts` unedited and green.
- [ ] **Step 2: Run** `pnpm --filter @mule/web exec vitest run test/events-production.test.tsx` → FAIL
- [ ] **Step 3: Implement C5 per spec §1 C5 and §2 RULE-1, RULE-2.** Mechanism: in_place.
- [ ] **Step 4: Run** `pnpm --filter @mule/web exec vitest run` → PASS (production-show.test.ts unchanged)
- [ ] **Step 5: Commit** red then green; send WS6 the ProductionMap.tsx hunk for review

### Task 3b: The intro has its own length — C1, C3, C4, C5 (spec AM-5)

**Depends on:** Task 3 (shares ProductionMap's timeline) · **ACs verified:** T-AC-1, T-AC-4 · **Spec sections consumed:** §8 AM-5, §2 RULE-1

**Files:**
- Modify: `packages/engine/src/config.ts` (EVENT_SHOW.introMs), `apps/server/src/mule-game.ts::eventShow`, `::productionView`, `packages/protocol/src/index.ts::ProductionView` (introMs), `packages/ui/src/events/timing.ts`, `packages/ui/src/components/ProductionMap.tsx` (the window includes the intro)
- Test: `apps/server/test/events-view.test.ts`, `packages/ui/test/events-segments.test.ts`

- [ ] **Step 1: Strengthen `T-AC-1` (one dust storm → 19 000 ms; the cap includes the intro; a quiet month still 15 000) and `T-AC-4` (first and later events of equal weight play at equal pace; the intro occupies [start, start + introMs/1000) before the first segment)** → run → FAIL
- [ ] **Step 2: Implement AM-5 per spec §8 AM-5 and §2 RULE-1.** Mechanism: in_place.
- [ ] **Step 3: Run** server events-view + production-view + phase-scale, ui vitest, web events-production + production-show → PASS
- [ ] **Step 4: Commit** red then green; send WS3 the protocol and mule-game hunks, WS6 the ProductionMap hunk

### Task 4: The TV's production screen — C6

**Depends on:** Task 3 · **ACs verified:** B-AC-1 · **Spec sections consumed:** §1 C6, §0.2 HC-1

**Files:**
- Modify: `apps/web/src/table/TvProduction.tsx` (`may_edit_content`)
- Test: `apps/web/test/events-tv.test.tsx` (new)

- [ ] **Step 1: Write the failing test `B-AC-1: the TV plays a drought then a pest swarm in order, each card listing the report's figures`**
  Altitude: promise — rendered TvProduction from a fixture view, read through the gallery's data-testids. Negative: a
  quiet month shows no event card. Invariant: no figure that the fixture report does not hold.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement C6 per spec §1 C6.** Mechanism: in_place. Composition from `design/mocks/ws8-events` (#event-dustStorm, #together-tg-storm), unchanged.
- [ ] **Step 4: Run** `pnpm --filter @mule/web exec vitest run` → PASS
- [ ] **Step 5: Commit** red then green; send WS6 the hunk

### Task 5: The phone plays the show alone — C7

**Depends on:** Task 3 · **ACs verified:** B-AC-2, T-AC-5 · **Spec sections consumed:** §1 C7, §2 RULE-3, §0.2 HC-6

**Files:**
- Modify: `apps/web/src/phone/Production.tsx` (`may_edit_content`)
- Test: `apps/web/test/events-phone.test.tsx` (new)

- [ ] **Step 1: Write the failing tests `B-AC-2: alone, the phone plays each event and a tap skips to the result` and `T-AC-5: RULE-3's four rows`**
  Altitude: promise — rendered phone Production under `PhoneGameProvider` with `table.boards` 0 and 1, reduced motion
  on and off (matchMedia stub), a real click on `data-testid="skip"`. Both landscape sizes, 844×390 and 667×375 (spec AM-1). Negative: boards 1 → no map show, card only.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement C7 per spec §1 C7 and §2 RULE-3.** Mechanism: in_place. Pin: `data-testid="harvest"` unchanged.
- [ ] **Step 4: Run** `pnpm --filter @mule/web exec vitest run` → PASS
- [ ] **Step 5: Commit** red then green; send WS6 the hunk

### Task 6: Proof against the mock and front to back — T-AC-6, T-AC-9, spec §7 R-3

**Depends on:** Tasks 4, 5 · **ACs verified:** T-AC-6, T-AC-9 (and B-AC-1/B-AC-2 front to back)

- [ ] **Step 1: `T-AC-6`:** run `review-loop/render-gate.mjs` (creating-screen-mocks skill) mock vs build for the TV
  and phone production views; expect every mock `data-testid` present. Positive-control it: rename one testid, see red, restore.
- [ ] **Step 2: `T-AC-9`:** `pnpm sim -- --games 4 --players 4` on `ws8-events` and on this branch; `diff` the outputs → identical
- [ ] **Step 3: Front to back (`B-AC-1`, `B-AC-2`):** a Playwright step that starts a seeded game whose production
  fires two events and asserts the TV's `data-event` sequence and the phone-alone skip. The test command owns its stack
  (the existing e2e harness, `apps/web/e2e/harness.ts`). The step file is `apps/web/e2e/events.ts`, WS8's (PM
  ruling); an edit to WS4's harness or runner files is a named edit WS4 reviews. CI tier: local only; a regression-tier
  step only if proposed with its runtime and it proves UBER-AC-1 cheaply (lean CI).
- [ ] **Step 4 (R-3):** screenshots at 844×390 and 1280×720 of a two-event production, reviewed by WS8 against the gallery
- [ ] **Step 5: Commit**

### Gate: End of Phase P1 (PR-1 merge gate)

Before suggesting merge of `ws8-show-pr1` into `ws8-events`:

- [ ] B-AC-1, B-AC-2, T-AC-1..6, T-AC-9 green; tests named after their AC IDs; each failing-test commit precedes its passing commit
- [ ] ProductionEventView exercised on the consumer side (Tasks 3-5 render from it)
- [ ] Front-to-back step green locally (Task 6 Step 3)
- [ ] `pnpm typecheck` 0 · `pnpm test` 0 · CI green on the PR
- [ ] No new `@ts-ignore` / `eslint-disable` without a reason on the same line
- [ ] Owner OKs on our SHAs: WS3 (mule-game.ts, protocol, events-view.test.ts), WS6 (ProductionMap, TvProduction, Production, production-view fixtures), WS4 (packages/ui additions, index.ts, theme.css)
- [ ] Re-graft onto WS1's real report once Task 6 of its plan lands (spec §7 R-1): T-AC-1/T-AC-2 re-run on a real two-event month
- [ ] Then WS1's table gate can tick "the phone and TV show every event of a phase"; ws8-events → feat/strategist only with Heiko's OK via the PM

---

## Phase P2 · PR-2 (every phase, wave 2) — starts when WS1's wave-2 rows land

### Task 9: The events of every phase in the view — C8

**Depends on:** PR-1 merged; WS1 wave-2 payload · **ACs verified:** T-AC-10 · **Spec sections consumed:** §1 C8, §3

- [ ] **Step 1: Write the failing test `T-AC-10: the view carries the phase's events with startsAt and effects`** — contract, `events-view.test.ts`; negative: a phase with no events → empty
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement C8 per spec §1 C8 and §3.** Mechanism: extract_interface. Files: `packages/protocol/src/index.ts`, `apps/server/src/mule-game.ts`.
- [ ] **Step 4: Run** server tests → PASS · **Step 5: Commit** red then green; send WS3 the hunks

### Task 10: The hold — C9

**Depends on:** Task 9 · **ACs verified:** T-AC-7, T-AC-8, T-AC-9 · **Spec sections consumed:** §1 C9, §2 RULE-4, §0.2 HC-4

- [ ] **Step 1: Write the failing tests `T-AC-7: an AI press during the auction's show is not applied; a human bid gets RuleError` and `T-AC-8: five events hold only capMs; planning is not held`**
  Altitude: promise — `MuleGame` with the fake context, advancing its clock. Negative: after the hold the same press applies.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement C9 per spec §1 C9 and §2 RULE-4.** Mechanism: wrap. Path: `apps/server/src/mule-game.ts::enterPhase`.
- [ ] **Step 4: Run** server tests → PASS (mule-game.test.ts, phase-scale.test.ts unchanged); re-run T-AC-9 (sim byte-identical)
- [ ] **Step 5: Commit** red then green; send WS3 the hunk

### Task 11: The overlays — C10

**Depends on:** Task 9 · **ACs verified:** B-AC-3 (with Task 13), B-AC-4 · **Spec sections consumed:** §1 C10, §2 RULE-3

- [ ] **Step 1: Write the failing test `B-AC-4: alone, the phone plays an auction-phase event; with a board, the light card`** — rendered PhoneApp with a fixture view
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement C10 per spec §1 C10.** Create `apps/web/src/events/**`; one line in `TableApp.tsx::TvGame`, one in `PhoneApp.tsx` beside `EmoteBubbles` (`ShellLayer`).
- [ ] **Step 4: Run** web tests → PASS · **Step 5: Commit**; send WS4 the two lines

### Task 12: Sickness in the roll call — C11

**Depends on:** Tasks 9, 11 · **ACs verified:** T-AC-10 (the sick bulletin case)

- [ ] **Step 1: Extend `T-AC-10` with a development case: a player who fell sick is listed as a bulletin with its reason**, and RULE-1's roll call: one sick player plays rollCallMs (4 000); two share it (2 000 each) and production's or the hold's length counts it once → run → FAIL (kills the bulletin mutants the Task 1 review found surviving)
- [ ] **Step 2: Implement C11 per spec §1 C11.** Pin: `phone/Develop.tsx`'s sick status line untouched.
- [ ] **Step 3: Run** → PASS · **Step 4: Commit**

### Task 13: The wave-2 stories — C12

**Depends on:** each WS1 wave-2 row as it lands; Task 11 · **ACs verified:** B-AC-3

- [ ] **Step 1: Write the failing test `B-AC-3: the auction opens on the pirate ship; nobody bids until it ends`** — promise: TV overlay rendered from the view + the server refusing a bid during the hold (T-AC-7's harness)
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement C12 per spec §1 C12**, one story per landed row, grafted from `stories.tsx`, `stories-plots.tsx`, `vignettes.tsx`, `scene.tsx` (pirate raid and store fire first, Heiko's two)
- [ ] **Step 4: Run** → PASS; render gate (T-AC-6) on `#event-pirateRaid[/phone]`, `#event-storeFire[/phone]`
- [ ] **Step 5: Commit**

### Gate: End of Phase P2 (PR-2 merge gate)

- [ ] B-AC-3, B-AC-4, T-AC-7, T-AC-8, T-AC-10 green, AC-named, red before green; T-AC-9 still identical
- [ ] Front-to-back step for an auction-phase event (same e2e ruling as Task 6)
- [ ] `pnpm typecheck` 0 · `pnpm test` 0 · CI green
- [ ] Owner OKs: WS3 (view, hold), WS4 (two mount lines), WS6 (none expected)

<!-- plan-check: no-task UBER-AC-1 UBER-AC-2 — goal proofs, run after ship by the PM; B-AC-1/B-AC-2 and Task 6 Step 3 carry them in tests -->
<!-- plan-check: no-task B-AC-7 — WS6's AC (its production show), retired into this spec's T-AC-4 by AM-6; not ours to test -->

## Pre-implementation checklist

- [x] Spec approved: goal gate passed (Heiko via the PM, 29 Oct, "Yes, as recommended"); class Programme
- [ ] The written spec reviewed by Heiko via the PM
- [ ] Upstream: WS1's event-model Task 6 (several production events in the real report) — PR-1 builds against fixtures until then (spec §7 R-1)
- [x] Branch policy: sub-branches off `ws8-events`; `ws8-events` → `feat/strategist` only with Heiko's OK via the PM
- [x] Base `ws8-events` @ `bb15a2b` green (measured 29 Oct, after `pnpm install --frozen-lockfile` for the trunk's new
      `@anthropic-ai/sdk`): typecheck 0 · ui 46 · tabletop 148 · engine 266 (+1 skipped) · ai 113 (+9) · web 224 ·
      server 216 (+24) · test exit 0
- [x] The PM's ruling on the e2e step: `apps/web/e2e/events.ts` is WS8's; local only
- [x] No spike: the gallery is the measured prototype (spec §7)
- [x] Effort: PR-1 about 2 agent-days, PR-2 1-2 (spec §0)
