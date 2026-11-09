# WS8 · Wave 2 events: plan

Spec: `docs/specs/2026-11-04-ws8-wave2-events.md` (Standard). Lane: `ws8-events`. Each PR is a sub-branch off the lane
and merges back into it; the lane PR goes to `feat/strategist` (the PM merges). Never merge trunk into the lane unless
a conflict needs it (PM, 4 Nov).

## Goals

| Goal | Beneficiary | Value | Proof | First delivered in |
|---|---|---|---|---|
| G-1 Every phase can surprise you | the players | 13 more events across the month | UBER-AC-1 | PR-A |
| G-2 You see what happened, where | the players, TV and phone | the gallery's stories | UBER-AC-2 | PR-B |

PR-A is §0.1's thin baseline (rules + the generic bulletin card); PR-B adds the stories.

## PR decomposition

| PR | Sub-branch | Scope | ACs | Contracts produced | Consumed | Frontend? |
|---|---|---|---|---|---|---|
| PR-A | `ws8-wave2-rules` | Tasks A1-A5 (C1-C4) | T-AC-1..T-AC-5, UBER-AC-1 | monthEvents, effects, becomes/muleLost, EventView fields | — | no (bulletin card already renders unknown keys) |
| PR-B | `ws8-wave2-stories` | Tasks B1-B3 (C5) | B-AC-1, B-AC-2, UBER-AC-2 | — | PR-A's contract | yes |

Authority (both PRs): `may_edit` packages/ui/src/events/**, apps/web/src/events/**, apps/server/test/events-*.test.ts,
apps/web/test/events-*.test.ts, apps/web/e2e/events.ts, packages/engine/test/wave2*.test.ts (new). Named edits
(owner OK on the SHA): spec §9's table. `may_edit_content`: none (the stories are grafted from the approved mock,
`design/mocks/ws8-events`, composition kept). `must_not_edit`: every other file.

Contention: `packages/engine/src/events.ts` and `config.ts::EVENTS` are touched only by PR-A. PR-B touches no engine
file. Serialised: PR-B starts after PR-A merges into the lane.

## Phase P-A · PR-A, the rules

- [ ] **Task A1 — C1 + C4: the month's events and the contract.** Failing tests first (engine: `monthEvents` empty at
  each month's planning and holding production's events after it; server: `phaseEvents` reads `monthEvents` — the
  existing events-view.test.ts seed 404 cases must stay green). Then types.ts, game.ts reset + upkeep's report copy,
  mule-game.ts phaseEvents/monthEventView, protocol. `pnpm typecheck`; touched tests.
- [ ] **Task A2 — C2 rows + SHAPE + targeting (RULE-2, RULE-3).** Failing test per key: forcing each row
  (`plotEvent`-style helper or a row with chance 1 via `sim --set`) builds the event with RULE-3's pick, and a
  failed only-if builds nothing. Rows in `EVENTS` with every number named (HC-1; the literal guard INV-1 must pass).
- [ ] **Task A3 — C2 effects (RULE-4) + C3 the roll sites.** Failing test per key at the server boundary (T-AC-1:
  the state change and `effects` in every seat's view), T-AC-3 (zeros), T-AC-5 (epidemic). Then
  `applyPhaseEvents` in events.ts and one call per site (game.ts, politics.ts, production.ts).
- [ ] **Task A4 — HC-3 / UBER-AC-1: the sim.** `pnpm sim` before and after: wave-1 keys' rates identical
  (T-AC-2); the report lists every wave-2 key's rate, loss per game, and the store-fire next-month line. Any balance
  check that moves → stop, write options for Heiko (to the PM), do not tune.
- [ ] **Task A5 — T-AC-4 replay.** A game record replay reproduces wave-2 events (WS3's game-record test pattern).

### PR-A merge gate
- [ ] Every claimed AC has a green, AC-named test; tests precede implementation in history
- [ ] `pnpm typecheck` 0; touched tests green; CI green on the PR (the full suite is CI's)
- [ ] One review, once CI is green (Heiko's 31 Oct rule)
- [ ] Owner OKs on the SHA: WS1 (config EVENTS, events.ts, production.ts), WS3 (types, game, protocol, mule-game),
      WS7 (politics.ts)
- [ ] The sim result in the PR body: wave-1 identical, each wave-2 rate; any broken check sent to the PM as options

## Phase P-B · PR-B, the stories

- [ ] **Task B1 — the ledger stories** (tax, grant, inheritance, pirate raid, rats, accountant, package): EffectChip
  and the gallery's ledger vignettes, grafted from `design/mocks/ws8-events/src/{vignettes,stories}.tsx`.
- [ ] **Task B2 — the map and colony stories** (MULE theft TAKEN, meteor LOST + crater, cold snap sweep, epidemic
  roll call, immigration, store fire): `hitText`'s LOST / TAKEN; the live-tile change on landing (as the CAVED IN
  chip does).
- [ ] **Task B3 — B-AC-1 and B-AC-2 front to back** in `apps/web/e2e/events.ts`, the e2e owning its stack.

### PR-B merge gate
- [ ] The render gate against the mock for each story (`review-loop/render-gate.mjs` on the data-testids)
- [ ] B-AC-1, B-AC-2 green in e2e; CI green; one review; Heiko's goal check on a rig (pirate raid, store fire)
