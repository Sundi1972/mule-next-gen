# WS2 · Spec A: Claude writes the strategy and the playbook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Programme (ruled by the PM, 28 Oct).

**DESIGN GATE PASSED** (Heiko, "Yes to the design", via the PM, 29 Oct). Unit work may stub on the frozen v1 types;
PR-1's B-AC-A1 still needs WS1 step 2 and WS3's record append + grant execution to pass. PR-5's paid runs need the
PM's clearance with the cost stated.

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-A [spec §0] | the players at the table, Heiko's playtest first | a Smart seat plays a land grant Claude planned in character (PR-1); it knows the rules (PR-2, PR-3), checks the outcome and adjusts (PR-4); proven against engine seats (PR-5) | UBER-AC-A | **PR-1** |

UBER-AC-A as a whole (the paid 20-game result, replay, budget) is first measurable in PR-5. PR-1 to PR-4 each land
something a player at Heiko's table can see: a Claude-planned grant, rule-aware strategy, tool-checked strategy,
mid-month adjustment. The order is forced by WS1's execution layer (C7 is atomic with it) and by WS3's record.

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- the execution layer and the engine's own playbook (WS1); the land-grant execution and the game record (WS3); deal
  cards, trust, votes' rules (WS7); diplomacy, the notebook, stances and promises (spec B, WS2); memory across games;
  bring-your-own-key (parked); any model call inside a real-time phase; the MCP server itself (parked by Heiko, 29 Oct,
  until BYOK, tournaments or benchmarks need it; C9's definitions are MCP-shaped so it is a wrapper later).

**Thin baseline (spec §0.1):** the plan as a fourth `DecisionKind` through today's `LlmDecider` · 1 PR · loses because
(a) `buildPrompt` carries only `situation()`, (b) the pick lives in `Brain.log`, memory-only and capped, so a replay
cannot reproduce it, (c) it cannot set a playbook's tunable fields.
→ **PR-1 relationship:** the baseline lost for a true reason. Checked 29 Oct: `packages/ai/src/llm/prompt.ts::buildPrompt`
still reads `context.summary` from `summary.ts::situation`; `packages/ai/src/brain.ts::Brain` still keeps its log in
memory; no playbook field exists to set. PR-1 is the shortest vertical slice through the chosen approach: one phase
(the land grant), one call kind (strategy + land-grant edits), end to end into the board and the record.

**Constraints:** spec §0.2 (HC-1 … HC-9) travel with every task.

**Architecture:** the engine drafts every playbook (WS1); in untimed or slack time WS2's brain sends a brief (C1) and
the manual (C8) to Claude, which may call in-process tools (C9) and returns a strategy and field edits (C2); WS1's
validatePlan clamps them; the playbook that takes effect is appended to WS3's game record (C5); the execution layer
plays it, and the next brief carries what happened (C1, T-AC-A10).

**Tech Stack:** TypeScript (strict), pnpm workspaces, vitest; `@anthropic-ai/sdk` in `apps/server/src/brain/client.ts`
only; Haiku 5.5 with adaptive thinking (S-A1).

**Inputs:**
- Spec: `docs/specs/2026-10-28-ws2-strategy-playbook.md` (branch ws2-spec-a-playbook)
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1-C9), §2 (RULE-A1..A4), §3, §4, §5, §6, §7, §8, §9
- Sections declared N/A by the spec: none. §5 says "code-only; no existing state to reach".
- N/A claims I checked: §5 holds (no persisted state; the record starts with WS3's build).
- Amended at plan time: T-AC-A10 added (spec §8 AM-A7) — G-A's "check it against what happened" had no AC.
- Self-review: `plan-check.sh` matches only digit IDs (`G-[0-9]`, `[BT]-AC-[0-9]`), and this spec's are G-A and
  T-AC-A1, so its "no G-n rows" line is a false red and its AC count misses them. The same coverage was checked with
  the patterns fitted (12 of 12 ACs, 9 of 9 changes, 4 of 4 rules in a step; G-A first delivered in PR-1) and
  positive-controlled (T-AC-A10's step removed → red).

---

## Freeze points and upstream contracts (Phase 0)

| Contract | Owner | State 29 Oct | Consumed by | Stub allowed? |
|---|---|---|---|---|
| Playbook v1 types, `packages/engine/src/playbook.ts` | WS1 | frozen at type level, not landed | PR-1..PR-5 | yes, a local copy of the frozen v1 types in WS2 tests until WS1's file lands |
| `validatePlan(state, seat, draft, edits)` | WS1 | specced, not built | PR-1 C2 | yes for unit tests; PR-1's B-AC-A1 needs the real one |
| Engine draft playbook + 3-4 engine plans | WS1 step 2 | not built | PR-1 C1 | yes for unit tests; B-AC-A1 needs the real one |
| Land-grant execution reading `LandGrantPlay.ranked` | WS3 | not built | PR-1 B-AC-A1 | no |
| Game record: `PlaybookEntry`, append API | WS3 | types agreed, API before its freeze | PR-1 C5 | no (B-AC-A1 observes the record) |
| Move descriptors in `packages/ai/src/actions.ts` | WS1 | shape is WS1's to propose | PR-2 C8, PR-3 C9 | yes, a descriptor type stubbed in WS2 tests; WS1's coverage test gates PR-2's merge |
| Engine sim entry for one month | WS1 | not built | PR-3 whatIf | yes for the handler's unit test; T-AC-A9's state check needs the real one |
| PhaseOutcome producers (land: WS3; development, auction: WS1) | WS1, WS3 | specced in schema v1 | PR-4 T-AC-A10 | yes, a fixture PhaseOutcome |
| Execution layer reads the playbook in every phase | WS1 | not built | PR-5 C7 (atomic) | no |

## PR decomposition

**Feature branch:** `ws2-brain` (the lane's integration branch). Sub-PRs target `ws2-brain`; the lane's milestone PR
to `feat/strategist` (or `main`) needs Heiko's OK through the PM.

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-1 | `ws2-a-pr1-land` | Tasks 1.1-1.6 (C3, C1 land part, C2, C4 upkeep + game start, C5, C6 ledger part) | B-AC-A1, T-AC-A1, T-AC-A2, T-AC-A3, T-AC-A5, T-AC-A6, T-AC-A4 (ledger part) | writer reply schema; strategy call kinds in the ledger | playbook v1, validatePlan, engine draft, WS3 grant execution, WS3 record append | No |
| PR-2 | `ws2-a-pr2-manual` | Tasks 2.1-2.4 (C8) | T-AC-A7 | the manual (system block) | move descriptors, config | No |
| PR-3 | `ws2-a-pr3-tools` | Tasks 3.1-3.5 (C9, RULE-A4, C6 round lines) | T-AC-A8, T-AC-A9 | MCP-shaped tool definitions | descriptors, scoreParts, engine month sim | No |
| PR-4 | `ws2-a-pr4-adjust` | Tasks 4.1-4.3 (C1 outcomes/trend/wishlist, C4 slack + re-plan triggers) | T-AC-A10, T-AC-A1 and T-AC-A3 for the development and auction deadlines | — | PhaseOutcome, WS1 re-plan triggers | No |
| PR-5 | `ws2-a-pr5-proof` | Tasks 5.1-5.5 (C7, C5 replay, C6 trial report, paired S-A1 re-run, UBER-AC-A run) | B-AC-A2, T-AC-A4 (report part), UBER-AC-A | trial report rows | WS1 execution layer, WS3 replay | No |

### Per-PR authority

Every handoff carries this line verbatim:

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

| PR | may_edit | may_edit_content | must_not_edit |
|---|---|---|---|
| PR-1 | `apps/server/src/brain/client.ts`, `apps/server/src/brain/strategy-spike.ts` (import the moved port back), `apps/server/src/brain/playbooks.ts` (new), `apps/server/src/brain/ledger.ts`, `apps/server/src/brain/index.ts`, `packages/ai/src/llm/brief.ts` (new), `packages/ai/src/llm/writer.ts` (new), `packages/ai/src/llm/index.ts`, their tests | `packages/engine/src/config.ts` BRAIN block only (named edit, WS1 OKs); `apps/server/src/mule-game.ts` one touch point (named edit, WS3 OKs) | `packages/ai/src/llm/manual.ts` (PR-2), `packages/ai/src/llm/tools.ts` (PR-3), `packages/ai/src/actions.ts` (WS1), `packages/engine/src/playbook.ts` and `record.ts` (WS1, WS3), every hand in `packages/ai/src/hands/` (WS1, until C7) |
| PR-2 | `packages/ai/src/llm/manual.ts` (new), its test; after PR-1 merges, the one line in `writer.ts` that takes the system text | `packages/engine/src/config.ts` BRAIN block (section caps, named edit) | `client.ts`, `playbooks.ts`, `brief.ts` (PR-1/PR-4), `tools.ts` (PR-3), `actions.ts` (WS1) |
| PR-3 | `packages/ai/src/llm/tools.ts` (new), `apps/server/src/brain/client.ts` (the loop), `apps/server/src/brain/ledger.ts` (round lines), their tests | `packages/engine/src/config.ts` BRAIN block (`toolRounds`, whatIf tick limit, named edit) | `manual.ts` (PR-2), `brief.ts` (PR-4), `actions.ts` (WS1), `packages/ai/src/play.ts` (WS1; whatIf calls it, never edits it) |
| PR-4 | `packages/ai/src/llm/brief.ts`, `apps/server/src/brain/playbooks.ts`, their tests | `packages/engine/src/config.ts` BRAIN block (trend months, section caps) | `client.ts`, `tools.ts` (PR-3), `manual.ts` (PR-2), WS3's `mule-game.ts` (PR-1's touch point already carries every phase change) |
| PR-5 | `apps/server/src/brain/trial.ts`, `trial-report.ts`, `cli.ts`, `playbooks.ts`, their tests; removal of the per-move `Brain.ask` call sites WS1 names | — | the execution layer (WS1), the replay (WS3) |

### Contention

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/config.ts` (BRAIN block) | PR-1, PR-2, PR-3, PR-4 | **serialised**: each PR's config hunk lands in merge order, each a named edit WS1 OKs |
| `apps/server/src/brain/client.ts` | PR-1, PR-3 | **serialised**: PR-3 starts after PR-1 merges (the loop wraps PR-1's port) |
| `apps/server/src/brain/ledger.ts` | PR-1, PR-3 | **serialised**, same order |
| `apps/server/src/brain/playbooks.ts` | PR-1, PR-4, PR-5 | **serialised** PR-1 → PR-4 → PR-5 |
| `packages/ai/src/llm/brief.ts` | PR-1, PR-4 | **serialised** PR-1 → PR-4 |
| `packages/ai/src/llm/writer.ts` | PR-1, PR-2 (one line) | **seam moved**: PR-1's writer takes the system text as a parameter; PR-2's last task passes the manual |

### Waves

- **Wave 1: PR-1 ∥ PR-2.** Safe together: disjoint files (PR-2 builds `manual.ts` alone and wires it in its last task,
  after PR-1 merges); both consume the frozen v1 types.
- **Wave 2: PR-3 ∥ PR-4.** Safe together: PR-3 owns `client.ts`, `ledger.ts`, `tools.ts`; PR-4 owns `brief.ts`,
  `playbooks.ts`; their only shared file is config.ts, serialised by merge order.
- **Wave 3: PR-5,** after WS1's execution layer (C7 is atomic with it).
- No migrations: no migration slot needed.

---

## Phase P1 — the land grant, planned by Claude (PR-1)

### Task 1.1: per-kind client — C3

**Phase:** P1 · **Depends on:** none · **Parallelizable with:** 1.2 · **ACs verified:** T-AC-A6
**Spec sections consumed:** §1 C3, §0.2 HC-2, HC-9, §7 model rule

**Files:**
- Modify: `apps/server/src/brain/client.ts` (`createHaikuComplete`; gains the strategy port)
- Modify: `apps/server/src/brain/strategy-spike.ts` (imports the port back from client.ts)
- Modify: `packages/engine/src/config.ts` (BRAIN: per-kind model, effort, wait; named edit, WS1 OKs)
- Test: `apps/server/test/brain-client.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-A6: strategy and playbook calls send adaptive thinking with BRAIN's model and effort; move calls keep thinking off`**
  Altitude: contract (the request the SDK receives is the promise to the API). Observed at: the request a fake SDK
  records. Negative case: a move call carrying thinking → red. Trap: read model and effort from BRAIN in the test,
  never literals, or the next model change breaks a test that should not care.
- [ ] **Step 2: Run it and see it fail** — `pnpm --filter @mule/server exec vitest run test/brain-client.test.ts -t "T-AC-A6"` → FAIL (no strategy kind yet)
- [ ] **Step 3: Implement C3 per spec §1 C3** — mechanism in_place + extract: move `strategy-spike.ts::createStrategyComplete` into client.ts keyed by call kind; BRAIN gains `strategyModel`/`playbookModel`, efforts and waits (default Haiku 5.5, effort medium, per S-A1). Plan-drift: keep `BRAIN.model` for the move kinds so nothing else moves.
- [ ] **Step 4: Run T-AC-A6, the existing client tests (INV-HC3) and `MULE_FULL=1 … test/strategy-spike.test.ts`** → all PASS (the pin)
- [ ] **Step 5: Commit** — `git commit -m "feat(server): one client, per-kind model and adaptive thinking for strategy calls (C3, T-AC-A6)"`

### Task 1.2: the land brief — C1 (land part)

**Phase:** P1 · **Depends on:** WS1 v1 types (stub) · **Parallelizable with:** 1.1 · **ACs verified:** T-AC-A2
**Spec sections consumed:** §1 C1, HC-3, HC-6

**Files:**
- Create: `packages/ai/src/llm/brief.ts`; Modify: `packages/ai/src/llm/index.ts` (export)
- Test: `packages/ai/test/llm-brief.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-A2: the brief holds only public facts in a deterministic order; two seats' briefs never contain another seat's goods`**
  Altitude: unit (pure core; the leak is easiest to prove here, with a rival whose stock is distinctive). Observed
  at: brief text. Trap: build the brief from `observe(state, seat)`, never the full state, or the test proves nothing.
- [ ] **Step 2: Run it** — `pnpm --filter @mule/ai exec vitest run test/llm-brief.test.ts` → FAIL (module missing)
- [ ] **Step 3: Implement C1's land sections per spec §1 C1** — ownership and what each player makes, prices, the engine's land plans with numbers, the draft LandGrantPlay, persona card, quoted table talk; each section capped by a BRAIN value. Mechanism: sprout. Trend, wishlist and outcomes come in Task 4.2.
- [ ] **Step 4: Run T-AC-A2 and `pnpm --filter @mule/ai test`** → PASS (the purity test still passes: HC-6)
- [ ] **Step 5: Commit** — `feat(ai): the strategy brief for the land grant (C1, T-AC-A2)`

### Task 1.3: the writer — C2

**Phase:** P1 · **Depends on:** 1.2; validatePlan (stub until WS1's lands) · **ACs verified:** T-AC-A5
**Spec sections consumed:** §1 C2, §2 RULE-A3, HC-2, HC-8

**Files:**
- Create: `packages/ai/src/llm/writer.ts`; Test: `packages/ai/test/llm-writer.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-A5: a Rookie seat's edits that would corner are rejected or clamped; the same edits on a Trader seat pass`** — RULE-A3 rows 1-3. Altitude: contract (the writer's result is what C4 plays). Observed at: the validated playbook and `rejected`. Also assert the corners=false seat's reply schema offers neither 'monopolist' nor monopolyTarget.
- [ ] **Step 2: Add the writer's own checks to the same file** — one case per S-A1 cause code the schema cannot carry (`reason_too_long`, `plan_not_offered`), each a ledgerable code with no reply text (spec §1 C2). These trace to C2's MUST, not to a new AC.
- [ ] **Step 3: Run them** — `pnpm --filter @mule/ai exec vitest run test/llm-writer.test.ts` → FAIL
- [ ] **Step 4: Implement C2 per spec §1 C2** — mechanism sprout; the system text is a parameter (PR-2 supplies the manual; until then the S-A1 primer from strategy-spike.ts, moved into packages/ai). Plan-drift: none.
- [ ] **Step 5: Run and commit** — PASS; `feat(ai): the playbook writer, edits validated, Rookie never corners (C2, T-AC-A5)`

### Task 1.4: when the brain asks — C4 (upkeep and game start)

**Phase:** P1 · **Depends on:** 1.1, 1.3 · **ACs verified:** T-AC-A1, T-AC-A3
**Spec sections consumed:** §1 C4, §2 RULE-A1, RULE-A2 rows 1-2, HC-1, HC-5, §4 races

**Files:**
- Create: `apps/server/src/brain/playbooks.ts`; Modify: `apps/server/src/mule-game.ts` (one named touch point, WS3 OKs)
- Test: `apps/server/test/brain-playbooks.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-A1: RULE-A1 rows 1-4`** — examples from §2: no key → engine; reply 1 s before the land grant → llm; reply 0.2 s after → engine, late, ledgered. Altitude: contract at playbooks.ts on a manual clock. Trap: drive time with the game's clock, never real timers.
- [ ] **Step 2: Write the failing test `T-AC-A3: phases start on time with a fake model that never answers`** — Altitude: promise (the phase start players see). Observed at: phase start times in the view.
- [ ] **Step 3: Run both** → FAIL
- [ ] **Step 4: Implement C4 per spec §1 C4 and §2 RULE-A1, RULE-A2 rows 1-2** — fire-and-forget with a deadline at the land grant; asks through createBrain so `busy` (INV-one-in-flight) and the budget hold. Mechanism: sprout + one named edit.
- [ ] **Step 5: Run, then the existing brain-table tests** (`pnpm --filter @mule/server test`) → PASS; commit `feat(server): the brain asks for the land-grant playbook as upkeep opens (C4, T-AC-A1, T-AC-A3)`

### Task 1.5: the record and the slice's promise — C5, B-AC-A1

**Phase:** P1 · **Depends on:** 1.4; WS3 record append API; WS3 grant execution; WS1 validatePlan + draft (all real)
**ACs verified:** B-AC-A1
**Spec sections consumed:** §1 C5, §3 game record entry, HC-4

**Files:**
- Modify: `apps/server/src/brain/playbooks.ts` (append on take-effect)
- Test: `apps/server/test/brain-table.test.ts` (B-AC-A1 joins the brain-at-the-table suite)

- [ ] **Step 1: Write the failing test `B-AC-A1: a fake model's edited land ranking is what the seat claims in month 2, and the record holds that playbook by 'llm'`** — Altitude: promise (the board and the record). Negative case: an out-of-bounds edit → the engine ranking plays and the edit is listed in `rejected`. Trap: pick a seed where the edit and the engine ranking differ in the first claim, or the test passes without the edit.
- [ ] **Step 2: Run it** → FAIL
- [ ] **Step 3: Implement C5 per spec §1 C5** — append a PlaybookEntry through WS3's API at take-effect. Mechanism: sprout.
- [ ] **Step 4: Run it and the server suite** → PASS. Positive control: drop the append, watch B-AC-A1 go red, restore.
- [ ] **Step 5: Commit** — `feat(server): the playbook that takes effect is in the game record (C5, B-AC-A1)`

### Task 1.6: ledger kinds — C6 (ledger part)

**Phase:** P1 · **Depends on:** 1.1 · **ACs verified:** T-AC-A4 (ledger part)
**Spec sections consumed:** §1 C6, HC-5, HC-9

**Files:** Modify: `apps/server/src/brain/ledger.ts`, `apps/server/src/brain/cli.ts` (`KINDS`); Test: `apps/server/test/brain-ledger.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-A4 (ledger): strategy and playbook calls each write a ledger line with their usage and count against the game budget`** — Altitude: contract (the ledger file). Trap: write to a temp path; never `apps/server/data`.
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement the C6 ledger part per spec §1 C6** · **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat(server): ledger kinds for strategy and playbook calls (C6, T-AC-A4)`

### PR-1 merge gate

- [ ] B-AC-A1, T-AC-A1, T-AC-A2, T-AC-A3, T-AC-A5, T-AC-A6, T-AC-A4 (ledger) green, named after their IDs, failing-test commits first
- [ ] The writer reply schema is exercised from the consumer side (playbooks.ts through the fake SDK), not only in llm-writer.test.ts
- [ ] `pnpm typecheck && pnpm test` exit 0; `MULE_FULL=1` brain-trial, brain-spike, brain-budget, strategy-spike green; config-guard green; sims byte-identical (`pnpm -s sim -- --games 40 --seed 1|101`, with and without `--walking off`)
- [ ] WS1's OK on the BRAIN hunk; WS3's OK on the mule-game.ts touch point
- [ ] No new `@ts-ignore` / `eslint-disable` without a reason on the line
- [ ] CI green (check, e2e) on the head; then merge into ws2-brain under the lane rule
- [ ] Heiko's table: the PM offers a playtest of a Claude-planned land grant (G-A first delivered)

---

## Phase P2 — the manual (PR-2, wave 1 beside PR-1)

### Task 2.1: the manual's test — C8

**Phase:** P2 · **Depends on:** a descriptor type (stub until WS1's lands) · **Parallelizable with:** PR-1 · **ACs verified:** T-AC-A7
**Spec sections consumed:** §1 C8, §3 move descriptors, HC-8, §9

**Files:** Test: `packages/ai/test/llm-manual.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-A7: the manual is rendered from the descriptors and config only`** — four cases: changing `GAME.plotScore` changes the text; the default config's manual is byte-identical run to run; every AiAction appears; an advice line naming a move or playbook field that does not exist fails (AM-A9). Altitude: unit (pure renderer). Trap: read Worth's parts by calling `scoreParts` on a fixture state, never by restating the rule in the test.
- [ ] **Step 2: Run** — `pnpm --filter @mule/ai exec vitest run test/llm-manual.test.ts` → FAIL

### Task 2.2: render the manual — C8

- [ ] **Step 1: Implement C8 per spec §1 C8** — path `packages/ai/src/llm/manual.ts`, mechanism sprout; phases and rules, how the game is won as `scoreParts` computes it, every move from its `MOVES` descriptor (WS1's shape, field by field in spec §3; stub on it in the test until WS1's lands), and the manual's own advice table for when a move is smart, each line tied to a move and a playbook field; a corners=false level is told it never aims for a monopoly (HC-8).
- [ ] **Step 2: Run T-AC-A7** → PASS
- [ ] **Step 3: Commit** — `feat(ai): the manual, generated from the moves and config (C8, T-AC-A7)`

### Task 2.3: pin the cache — C8

- [ ] **Step 1: Add the snapshot pin named in spec §1 C8** — the default config's manual as a vitest snapshot; a config change moves it, never a hand edit. Positive control: change one config number, watch the snapshot go red, restore.
- [ ] **Step 2: Commit** — `test(ai): the manual's text is pinned for the default config (C8)`

### Task 2.4: wire it in — C8 (after PR-1 merges)

- [ ] **Step 1: Pass the manual as the writer's system text** — the one line in `writer.ts` (seam moved, see Contention); the S-A1 primer leaves packages/ai.
- [ ] **Step 2: Run `pnpm --filter @mule/ai test` and PR-1's writer tests** → PASS; commit `feat(ai): the writer's system block is the manual (C8)`

### PR-2 merge gate

- [ ] T-AC-A7 green and the snapshot pin in place; failing-test commit first
- [ ] WS1's coverage test (every MuleIntent has an AI move or a reviewed exclusion) is green on the base — it gates this merge (spec §7 R-A4)
- [ ] The rule text each owner wrote (WS3 grant, lots, auction; WS7 politics) is in the descriptors, as named edits they OK'd
- [ ] typecheck, tests, config-guard, sims as PR-1; CI green; merge under the lane rule

---

## Phase P3 — live tools (PR-3, wave 2)

### Task 3.1: no hidden information — C9

**Phase:** P3 · **Depends on:** PR-1 (client), PR-2 (descriptors in use) · **Parallelizable with:** PR-4 · **ACs verified:** T-AC-A9
**Spec sections consumed:** §1 C9, §3 tool definitions, HC-3, HC-9

**Files:** Create: `packages/ai/src/llm/tools.ts`; Test: `packages/ai/test/llm-tools.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-A9: no tool result carries another seat's goods or unanalysed ground; whatIf leaves the live state unchanged`** — Altitude: contract (what the model receives). Negative case: a rival's stock in worth's answer → red. Trap: give the rival a distinctive stock number so a leak is unmistakable; deep-compare the state before and after whatIf.
- [ ] **Step 2: Run** → FAIL

### Task 3.2: the handlers — C9

- [ ] **Step 1: Implement legalMoves, worth, standings per spec §1 C9** — MCP-shaped definitions (§3); worth and standings call `scoreParts`; answers from `observe()` only. Mechanism: sprout.
- [ ] **Step 2: Implement whatIf per spec §1 C9** — drives the engine's one-month sim (WS1's entry; a stub until it lands) on a copy of the observation; capped by a BRAIN tick limit, answering `is_error` past it (§4).
- [ ] **Step 3: Run T-AC-A9** → PASS; commit `feat(ai): the game's tools for Claude, public facts only (C9, T-AC-A9)`

### Task 3.3: the loop's test — C9, RULE-A4

**ACs verified:** T-AC-A8 · **Spec sections consumed:** §2 RULE-A4, §4 tool rows

**Files:** Test: `apps/server/test/brain-tools.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-A8: RULE-A4 rows 1-5`** — at most `BRAIN.toolRounds + 1` round trips; a share that runs out mid-loop stops it; a throwing handler answers `is_error` and the loop goes on; a passed deadline stops it; every round trip has a ledger line. Altitude: contract (the requests a fake SDK records, the ledger). Negative case: a handler's error text in a request → red.
- [ ] **Step 2: Run** → FAIL

### Task 3.4: the loop — C9, RULE-A4

- [ ] **Step 1: Implement the loop per spec §2 RULE-A4** — in `apps/server/src/brain/client.ts` (the only SDK importer, §9); the budget check before every round (HC-9); `BRAIN.toolRounds` and the whatIf tick limit as a named BRAIN edit (WS1 OKs). Mechanism: in_place.
- [ ] **Step 2: Run T-AC-A8 and the §9 guard test (only client.ts imports the SDK)** → PASS

### Task 3.5: round lines — C6 (round part)

- [ ] **Step 1: Extend the ledger per spec §1 C6** — one line per round trip with the round number and cause code; T-AC-A8's ledger assertions cover it.
- [ ] **Step 2: Run, then commit** — `feat(server): the tool loop, capped and budgeted per round (C9, C6, T-AC-A8)`

### PR-3 merge gate

- [ ] T-AC-A8, T-AC-A9 green; failing-test commits first; positive control: remove the per-round budget check, watch T-AC-A8 go red, restore
- [ ] The tool definitions are consumed end to end through the fake SDK (not only unit-tested)
- [ ] typecheck, tests, MULE_FULL brain set, config-guard, sims; WS1's OK on the BRAIN hunk; CI green; merge

---

## Phase P4 — check and adjust (PR-4, wave 2)

### Task 4.1: the outcome reaches the brief — C1

**Phase:** P4 · **Depends on:** PR-1 (brief.ts); PhaseOutcome (fixture until WS1/WS3 produce it) · **Parallelizable with:** PR-3
**ACs verified:** T-AC-A10 · **Spec sections consumed:** §1 C1, §6 T-AC-A10, HC-3

**Files:** Modify: `packages/ai/src/llm/brief.ts`; Test: `packages/ai/test/llm-brief.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-A10: the next brief carries this seat's last PhaseOutcome items and the rivals' public trades and claims; a seat with no outcome gets none`** — Altitude: unit (pure brief). Negative case: another seat's outcome items in this brief → red.
- [ ] **Step 2: Run** → FAIL

### Task 4.2: the rest of the brief — C1

- [ ] **Step 1: Implement C1's remaining sections per spec §1 C1** — the seat's strategy and last outcomes, prices with a 3-month trend (trend length a BRAIN value), the export wishlist; caps per section in BRAIN.
- [ ] **Step 2: Run T-AC-A10 and T-AC-A2** (still deterministic, still public only) → PASS; commit `feat(ai): the brief carries what happened and the trends (C1, T-AC-A10)`

### Task 4.3: slack-time asks — C4

**ACs verified:** T-AC-A1, T-AC-A3 (development and auction deadlines) · **Spec sections consumed:** §2 RULE-A2 rows 3-4

- [ ] **Step 1: Extend T-AC-A1 and T-AC-A3 with the development and auction deadlines** — a reply landing after development starts is late; the auction opens on time with a model that never answers.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement RULE-A2 rows 3-4 per spec §1 C4** — development and auction edits in the production show and waiting gaps; a WS1 re-plan trigger asks at once; one open call per seat still holds.
- [ ] **Step 4: Run, then commit** — `feat(server): the brain adjusts the next phase in the slack between phases (C4, T-AC-A1, T-AC-A3)`

### PR-4 merge gate

- [ ] T-AC-A10 and the widened T-AC-A1, T-AC-A3 green; failing-test commits first
- [ ] typecheck, tests, MULE_FULL brain set, config-guard, sims; WS1's OK on any BRAIN hunk; CI green; merge

---

## Phase P5 — the proof (PR-5, wave 3)

### Task 5.1: per-move calls leave — C7

**Phase:** P5 · **Depends on:** WS1's execution layer reads the playbook in every phase (atomic, spec §1 C7)
**Spec sections consumed:** §1 C7, HC-1

- [ ] **Step 1: Remove the per-move `Brain.ask` call sites WS1's execution layer replaces** — in the same release as WS1's layer, so a Smart seat never has neither.
- [ ] **Step 2: Run the pin: B-AC-3 (keyless game finishes on top picks) and the whole server suite** → PASS; commit `refactor(ai): Smart seats make no per-move calls; the playbook plays (C7)`

### Task 5.2: replay — C5, B-AC-A2

- [ ] **Step 1: Write the failing test `B-AC-A2: a game played with Claude playbooks replays from its record with the key unset to identical final scores, and no client is built`** — Altitude: promise (final scores). Trap: count client factory calls, not just scores.
- [ ] **Step 2: Run** → FAIL (or red until WS3's replay reads PlaybookEntry)
- [ ] **Step 3: Implement any C5 glue the replay needs per spec §1 C5** (WS3 owns the replay); run → PASS; commit `test(server): a Claude game replays keyless to the same scores (C5, B-AC-A2)`

### Task 5.3: the trial reports the new kinds — C6

- [ ] **Step 1: Write the failing test `T-AC-A4 (report): the trial report has rows for strategy and playbook calls, edit share, late share, tool rounds per call and cost per game within gameBudgetUsd`** — Altitude: contract (the report object). Runs under `MULE_FULL=1` (lean CI).
- [ ] **Step 2: Implement the C6 report part per spec §1 C6** in `trial.ts` and `trial-report.ts`; run → PASS; commit `feat(server): the trial measures UBER-AC-A (C6, T-AC-A4)`

### Task 5.4: Spike S-A1 re-run, paired (the model rule)

**Timebox:** one paid run, inside the cap the PM clears. **Stop condition:** confirmed Haiku (it stays) OR confirmed
Sonnet for the monthly strategy call (measurably better on accepted edits AND the measured seat share fits the game
budget ÷ Smart seats).

- [ ] **Step 1: Ask the PM for the clearance and cap** for the paired run on the real brief (C1 + C8 + C9)
- [ ] **Step 2: Run `brain:strategy-spike` paired** with the key loaded only inside that one command (`--env-file`); a 401 or 403 stops it
- [ ] **Step 3: Record the outcome in spec §7** with the ledger cost next to the estimate; set the BRAIN model per kind accordingly

### Task 5.5: the UBER-AC-A run

- [ ] **Step 1: Ask the PM for clearance and cap** for the paid 20-game run (Claude-playbook vs engine-playbook seats, same seeds)
- [ ] **Step 2: Run `brain:trial`** under the cleared cap; report UBER-AC-A's clauses from the report and the ledger (bar from WS1's tournament numbers)
- [ ] **Step 3: Lane milestone** — the PM asks Heiko for the merge to `feat/strategist` (or `main`)

### PR-5 merge gate

- [ ] B-AC-A2, T-AC-A4 (report) green; B-AC-3 pin green; failing-test commits first
- [ ] UBER-AC-A's figures in the PR body (or the run's pending clearance stated)
- [ ] typecheck, tests, MULE_FULL brain set, config-guard, sims; CI green; merge; milestone only with Heiko's OK

---

## Risk mitigations (spec §7)

- R-A1 (slack shorter than the model): RULE-A1 row 2 is T-AC-A1; the late share is a trial row (Task 5.3).
- R-A3 (the brief grows): Task 5.4 measures latency and cost on the real brief before the model choice is final.
- R-A4 (descriptors late): PR-2 stubs a descriptor type; WS1's coverage test gates PR-2's merge (PR-2 gate).
- Landmine "Configurable balance": every number added in any task is a named BRAIN value; config-guard in every gate.

## Pre-implementation checklist

- [x] **Goal gate:** Heiko approved the restated G-A with the UBER-AC-A additions ("Yes, approve it"); §0 written in verbatim, cost about 5 PRs
- [x] **Design gate:** Heiko said "Yes to the design" to the one-screen summary (via the PM, 29 Oct; spec §8 AM-A8)
- [ ] Upstream: WS1 step 2 (v1 types in `packages/engine/src/playbook.ts`, validatePlan, engine draft); WS3 record append API and grant execution reading `ranked` — PR-1's B-AC-A1 cannot pass before them
- [x] Branch policy: sub-PRs → `ws2-brain`; milestones → `feat/strategist` (or `main`) with Heiko's OK via the PM
- [x] Base `ws2-brain` @ `6805806` green (29 Oct): `pnpm typecheck` 0 · tests ui 46 · tabletop 148 · engine 266 (+1 skipped) · ai 115 (+9) · web 224 · server 225 (+52) · sims seed 1 `8b73b040`, seed 101 `9e7cb57c` · CI also runs `check` and `e2e` on lane PRs
- [x] Provider access: the key file `~/.config/mule/anthropic.env`, loaded only inside one command via `--env-file`; every paid run on the PM's clearance
- [x] Spike outcomes recorded: S-A1 in spec §7 (Haiku 5.5, adaptive, effort medium; paired re-run is Task 5.4)
- [x] Effort estimate communicated: about 5 PRs (carried to Heiko with G-A; in §0's cost line)
