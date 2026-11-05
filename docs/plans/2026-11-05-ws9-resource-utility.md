# Resource utility · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Standard (Heiko, 5 Nov).

## Goals (lifted from spec §0; reference, do not restate)

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 [spec §0] keep yourself supplied | every player at the table, Heiko first | no AI starves or stalls with cash in hand | UBER-AC-1 | **PR-1** |
| G-2 [spec §0] value enough, a surplus when cheap | the same players | AIs stock up while cheap, ride out a dear month | UBER-AC-2 | PR-2 |
| G-3 [spec §0] speculate (later) | Heiko; players reading the market | clever opponents | UBER-AC-3 | PR-3 |

**Why G-3 is first delivered in PR-3:** Heiko made speculation "later", phase 2 of the design (5 Nov, relayed by the PM). PR-1 (G-1) and PR-2 (G-2) are each useful to the players the moment they land, behind the switch Heiko turns on.

<!-- plan-check: no-task C29 — the G-5 colony spec's change (WS1's sim finding on Food supply), cited in a non-goal; not this spec's -->

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- **The store's supply and price formula.** WS5's widened store design owns it; Food supply is C29's finding for Heiko.
- **Balance tuning.** Every number is a config placeholder, reported and never tuned, until the balance phase.
- **Claude's strategies themselves.** This spec defines only where they plug in (§3).
- **New development strategy.** Development changes only where it reads these values.
- **Any UI.**

**Thin baseline (spec §0.1):** A, "needs first": WS1's stopgap widened to every needed good, about 1–2 days. It lost because UBER-AC-2 fails by construction (a unit beyond need keeps today's value, so cheap-Food surplus stays at 16–23% of decisions) and because it is a rule beside the values (HC-1).
→ **PR-1 relationship:** the baseline lost for a true reason. Re-checked at plan time: WS1's #386 stopgap still values a unit beyond the target at resale × keep rate × `speculate` × haircut. PR-1 is the shortest slice through B that delivers G-1: RULE-1..3 and RULE-5 with today's carry, RULE-2's Energy row on trunk's `energyOffOrder`, and C8 for plants. Carry under the price level is left to PR-2.

**Constraints:** spec §0.2, HC-1 to HC-6, travel with every task.

**Architecture:** one per-unit value (`value.ts::unitValues`, branch-by-abstraction on the switch `AI_VALUE.unit`) feeds the auction's existing "buy while value > ask" loop. A cash shadow price across the month's auctions (`strategist.ts::goodPlan`) replaces the reserve in trading. `monthlyNet` prices a plant's own-use output with the same short cost. A price belief beside `outlook` starts as `outlook.price`, and in PR-3 gains a tilt and the playbook's `GoodPlay.expect`.

**Tech Stack:** TypeScript (pnpm monorepo), vitest, the headless sim (`pnpm sim`).

**Inputs:**
- Spec: `docs/specs/2026-11-05-ws9-resource-utility.md` (#385, at 674e7767 or later).
- Sections present and consumed: §0, §0.1, §0.2, §1 C1–C8, §2 RULE-1..6, §3 (`GoodPlay.expect`; WS5's price contract), §6, §7, §8 AM-1.
- Sections declared N/A by the spec: §4 ("no external dependency: in-process and seeded"); §5 ("code-only; the switch is the rollback"); §9 ("no ownership change").
- N/A claims checked:
  - §4 holds: nothing here calls the network or the model.
  - §5 holds: no stored state carries values, and the record stores playbooks only, where `expect` is optional.
  - §9 holds: SEAMS's 4 Nov ruling gives `playbook/**` to WS9 and the rest to WS1 and WS3, as the spec says.

---

## Upstream and order (PM ruling, 5 Nov)

1. **WS1's stopgap #386** (`ws1-food-short`) ships first. It exports `strategist.ts::wholeNextMonth`, which RULE-3 reuses.
2. **WS1's AM-17 #393** is merged: `energyOffOrder(state, playerId, cold)` is on trunk at 2bc6c032.
3. **AM-18** (Water as a base resource; WS1) is not built yet. PR-1 builds Water on today's rule behind the same export (spec §7). Its row follows when it lands.
4. **PR-0** is WS9's built-state fixtures PR, after WS1's combined re-pick of #366. It is outside this spec's changes and listed here for order.
5. Then PR-1, PR-2 and PR-3, serialised (they share `value.ts` and `strategist.ts`).

## PR decomposition

Every PR targets `feat/strategist`. The PM batches trunk merges; `main` is never touched without Heiko's OK.

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-0 | `ws9-built-fixtures` | Tasks 0.1–0.3 (not spec changes: fixtures, #379's minors, two validator/draft gaps) | none new (existing tests strengthened) | — | `wholeNextMonth` | No |
| PR-1 | `ws9-util-pr1` | Tasks 1.1–1.9 (C7, C1 RULE-1..3, C3 rows 1-less, C2, C4, C8, C6 rows for G-1) | B-AC-1, B-AC-2, B-AC-5, T-AC-1..6, T-AC-9, T-AC-11, T-AC-12 | `AI_VALUE` | `energyOffOrder`, `wholeNextMonth`, `outlook.price` | No |
| PR-2 | `ws9-util-pr2` | Tasks 2.1–2.3 (C1 RULE-4, C6 band row) | B-AC-3, T-AC-7 | — | WS5's `nextPostedPrice` (through `outlook`) | No |
| PR-3 | `ws9-util-pr3` | Tasks 3.1–3.5 (C5, C3 rows 1–2, C6 speculation row) | B-AC-4, T-AC-8, T-AC-10 | `GoodPlay.expect` | WS5's `expectedOffWorld` | No |

### Per-PR authority

The standing authority line goes with every handoff:

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

| PR | may_edit | may_edit_content | must_not_edit |
|----|----------|------------------|---------------|
| PR-0 | `packages/ai/src/playbook/**`; the tests in `packages/ai/test/playbook-*.test.ts`, `develop-route.test.ts`, `playbook-outcome.test.ts`, `sim-plays.test.ts` (WS1's test files are named edits, one commit each, WS1 OKs the SHA); the spec's AM-27 line | — | `packages/engine/**` (WS1/WS3/WS5); `value.ts`, `strategist.ts` (WS1: PR-0 changes no value) |
| PR-1 | `packages/ai/src/playbook/**`. **Named edits** (one commit per file, owner OKs the SHA): WS1's `value.ts`, `strategist.ts`, `outlook.ts`, `sim.ts`, `config.ts` (the new `AI_VALUE` block) and `packages/ai/test/**`; the rulebook section `computer-players.html#resource-utility` | — | `packages/engine/src/production.ts`, `economy.ts` (WS1/WS5: read their exports, never copy, HC-5); `packages/ai/src/personas.ts` (WS2); `engine/src/playbook.ts` (WS3, PR-3) |
| PR-2 | as PR-1 | — | as PR-1 |
| PR-3 | as PR-1, plus **WS3's named edit** to `packages/engine/src/playbook.ts` (`GoodPlay.expect` only) | — | `economy.ts` (WS5's) |

### Contention

| path | touched by | resolution |
|---|---|---|
| `packages/ai/src/value.ts` | PR-1, PR-2, PR-3; WS1's #386 | **serialised**: PR-1 bases on trunk after #386 merges; PR-2 after PR-1; PR-3 after PR-2 |
| `packages/ai/src/strategist.ts` | PR-1, PR-3; WS1's #386 | **serialised**, as above |
| `packages/ai/src/sim.ts` | PR-1, PR-2, PR-3 | **serialised** |
| `packages/engine/src/config.ts` (`AI_VALUE`) | PR-1 (creates it), PR-2, PR-3 (add keys) | **serialised** |
| `packages/ai/test/playbook-*.test.ts` | PR-0; WS1's re-pick of #366 | **serialised**: PR-0 after the re-pick |

### Waves

- **Wave 0, PR-0:** one lane, test-only plus two small fixes in my own files. Safe alone: it changes no value.
- **Waves 1–3, PR-1 to PR-3:** one PR each, serialised on `value.ts` and `strategist.ts`.
- **Freeze points:**
  - `wholeNextMonth` (from #386) before PR-1;
  - WS5's §3 functions before PR-3. PR-3 stubs `expectedOffWorld` on `outlook.later` if #390's PR-1 has not landed (spec C3 `depends_on`).
- **Migration slot:** none.
- **Generated or shared files, once at the end of each PR:**
  - `docs/rulebook/search-index.js` (`node docs/rulebook/build-index.mjs`);
  - the rulebook section's status pill.

## Gates (discovered on trunk 2bc6c032; the same in every dispatch)

- `pnpm typecheck` must exit 0; it covers every package's config.
- **config-guard:** `cd packages/engine && npx vitest run test/config-guard.test.ts`. 2 pass (INV-1). Every number goes in `config.ts` (HC-2); a `literal-ok:` needs its reason.
- **Tests:** CI runs the full suite. Locally, run only the test files the task touched: `cd packages/ai && npx vitest run test/<file>`. Never run bare `npx vitest` at the repo root.
  - Long synchronous tests need a `SLOW_MS` describe budget with its reason. The setup file already yields between tests (the worker RPC is 60 s).
- **trace-check** (from `test-driven-development`): run over each PR's `BASE..HEAD`. Every test names an AC, INV or FM id.
- **T-AC-9 sims** (the pin, every PR): 40 games × seeds 1/101/201, compared ignoring `^>` and `^config:`. The default sim, `--plays today` and `--politics off` must each be byte-identical to trunk with the switch off.
- **Measurement rows** (reported, never tuned): `pnpm sim -- --games 40 --seed S --set AI_VALUE.unit=true` on 1/101/201, quoted in the PR body beside the colony's Food/Water shortage (HC-6), with the sim's wall time against trunk (spec §7).
- **Smoke:** there is no smoke tier. Run the touched files, and CI does the rest.

---

## PR-0 · Built-state fixtures (prerequisite, outside the spec's changes)

### Task 0.1: Move the 7 sim-searched playbook fixtures to built states

**Depends on:** WS1's combined re-pick of #366, on trunk.
**Files:** `packages/ai/test/playbook-hands.test.ts`, `playbook-planning.test.ts`, `playbook-validate.test.ts`, `sim-plays.test.ts` (WS1's file, a named edit).

- [ ] **Step 1:** For each fixture that searches a seeded game for a matching seat, build the state it needs directly (the seat, its plots and stock, the month), with assertions unchanged.
  - The 7: playbook-planning T-AC-10; playbook-validate T-AC-1 (P11–P17); the playbook-hands B-AC-6 route and moneyMaker cases, and B-AC-6/T-AC-13 with ownPhases off; sim-plays T-AC-13/AM-26 and its B-AC-6 edits.
  - Trap: keep the test's promise altitude (the seat's played result), not a unit of the helper.
- [ ] **Step 2:** Positive-control each moved test once. Break the behaviour it guards, watch it go red, restore.
- [ ] **Step 3:** Run the four files. All green. Commit one commit per file (WS1's file separately, for its OK).

### Task 0.2: #379's review minors

- [ ] **Step 1:** Strengthen tests so the reviewer's surviving mutants die:
  - Minor 1: the leading row on both runners, and a filter after the MULE in RULE-9 row 2;
  - Minor 2: T-AC-9 with a Sell-declared rival that buys and is not idle;
  - Minor 3: the ownPhases-on mirror of T-AC-13.
  Re-run O2, D-a, D-d, S-a and S-b, and record each as killed.
- [ ] **Step 2:** The fixes:
  - Minor 4: log a replanned edit's left-out picks at the adopt point;
  - Minor 5: the engine doc in `engine/src/playbook.ts` says "declared Sell" (a WS3 named edit, one line);
  - Minor 6: AM-26(a) "on trunk";
  - Minor 7: AM-27 says "any carried MULE counts" (WS1's ruling);
  - Minor 8: a 'stop' re-pick is logged 'skipped';
  - Minor 9: drop the history in comments;
  - Minor 10: delete `unitsAt`'s unreachable bluff guard.
  Each goes red first where it changes behaviour (4 and 8).

### Task 0.3: The two gaps WS1 found in WS9's files

- [ ] **Step 1:** Write the failing test. A seller's hold under the stopgap's target is refused, because `validate.ts::stapleFloor` reads `wholeNextMonth`. Then fix it.
- [ ] **Step 2:** Write the failing test. On the playbook path, Water's and Energy's walk-away is capped by the money, not the budget, because `draft.ts` goodPart's `essential` honours `mustHold`. Then fix it.
- [ ] **Step 3:** Run the gates. Open PR-0, with one review once CI is green, then WS1's OK on its named edits.

### Task 0.4: `leaderOf` reads the engine's Worth (its own small PR, `ws9-leader-worth`, after PR-0)

A finding from #408's review, outside this spec's changes. `strategist.ts::leaderOf` hand-sums money, land and MULEs, so it misses goods, office and donations. It ships separately because it changes today's spite and cornering, so the sim moves, which PR-0's and PR-1's byte-identical gates can't carry.

**FM-leader-worth** (the failure mode the tests name): the seat's leader is not the rival with the highest Worth it can see. Two ways it happens:
- a hand sum that misses score lines (office, donations once #408 lands);
- ranking by the market panel's even split of goods, whose remainder goes to rivals in seat order.

- [ ] **Step 1:** Write the failing tests for FM-leader-worth: a rival ahead only by office terms is the leader; the even goods split doesn't rank rivals by seat order (only the status screen's good is a real holding). Observed at `leaderOf(obs, self)`. Altitude: unit, because the leader is a pure read of the observation.
- [ ] **Step 2:** `leaderOf` ranks rivals by the engine's `scoreParts` on the seat's observation, less the goods line, plus the status screen's good. It is public by construction (`engine/observe.ts`). A WS1 named edit. PASS.
- [ ] **Step 3:** Report the sim delta on 1/101/201 in the PR body, never tuned. Then one review, WS1's OK, and the head to the PM. PR-1's T-AC-9 base is re-recorded on the trunk that carries it.

### PR-0 merge gate

- [ ] Every moved fixture asserts what it did before, and each is positive-controlled once.
- [ ] typecheck 0 · config-guard green · CI green · trace-check PASS.
- [ ] T-AC-9's sims byte-identical to trunk (PR-0 changes no value).
- [ ] One review, then WS1's OK on the named-edit SHAs, then the head to the PM.

---

## PR-1 · G-1: keep yourself supplied (behind `AI_VALUE.unit`)

### Task 1.1: C7, the `AI_VALUE` block

**ACs verified:** T-AC-9 (with the switch false nothing moves).
**Files:** `packages/engine/src/config.ts` (named edit, WS1).

- [ ] **Step 1: Add C7 per spec §1 C7.** The keys are `unit` (false), `forecastRisk` and `shortFloorMarkup`, each with its unit and meaning (HC-2). The belief keys come in PR-3.
- [ ] **Step 2:** Run config-guard. 2 pass. `pnpm sim -- --games 2 --set AI_VALUE.unit=true` is accepted (positive control: `--set AI_VALUE.unit=maybe` is refused). Commit.

### Task 1.2: The T-AC-9 pin

**ACs verified:** T-AC-9.

- [ ] **Step 1:** Record trunk's base reports (default, `--plays today`, `--politics off`) on 1/101/201 in the scratch dir. Every later task of PR-1 re-runs the comparison at its commit.

### Task 1.3: C1, needs and short cost (RULE-1, RULE-2, RULE-3) with today's carry

**Depends on:** 1.1; `wholeNextMonth` (#386); `energyOffOrder` (trunk).
**ACs verified:** T-AC-3, T-AC-6.
**Spec sections consumed:** §1 C1, §2 RULE-1..3.
**Files:**
- `packages/ai/src/value.ts::unitValues` (named edit, WS1);
- test: `packages/ai/test/value-unit.test.ts` (new, WS1's test tree, named edit).

- [ ] **Step 1: Write the failing test `T-AC-6: S(k) follows energyOffOrder's turn-off order`.**
  - Altitude: unit, because RULE-2's rows are a pure table.
  - Observed at: `unitValues(...).keep` with the switch on. Use RULE-2's example: plots ranked [factory 2 Energy, farm 1, farm 1]; S(0..1) = (1 − offOutputShare) × the factory's run; S(2) = (1 − offOutputShare) × the farm's output.
  - Negative case: no plot needs Energy, so S = replace.
  - Trap: pass `cold` explicitly, as next month's (#393). The default reads the month just produced.
- [ ] **Step 2: Write the failing test `T-AC-3: the target covers spoilage and own output counts only as net`.**
  - Food's target is eat + ⌈eat/keep⌉. Energy has ownNet 8 against a use of 8 while holding 2: it keeps its 2 (q > 0), and its keep values are never 0 below the target.
  - Negative case: a seat with no plots buys no Energy.
  - Trap: the target comes from `wholeNextMonth`; assert against its value, never a re-derived number (HC-5).
- [ ] **Step 3:** Run both. Each fails, because the switch path doesn't exist.
- [ ] **Step 4: Implement C1 per spec §1 C1 and RULE-1..3, branch-by-abstraction on `AI_VALUE.unit`.**
  - Path: `packages/ai/src/value.ts::unitValues`. With the switch false, today's body is unchanged.
  - Plan-drift corrections to fold in:
    - in PR-1, Ck (RULE-1's carry) is today's resale and resaleBuy, and RULE-4 comes in PR-2;
    - RULE-2's Water row runs on today's irrigated-plot rule until AM-18 lands (spec §7);
    - RULE-3's target reads `wholeNextMonth` (strategist.ts), so value.ts imports it from there; if that import cycles, ask WS1 to move it into value.ts in #386 rather than copying it.
- [ ] **Step 5:** Run both tests: PASS. Check the invariants: keep and buy are non-increasing, and a q = 1 unit is never valued below S. Re-run T-AC-9's sims: identical. Commit (named edit, WS1).

### Task 1.4: C3, the belief (row 3 only)

**ACs verified:** none on its own; consumed by 1.3 and 1.5.
**Files:** `packages/ai/src/outlook.ts` (named edit, WS1).

- [ ] **Step 1: Implement C3 per spec §1 C3 and RULE-6, row 3 only** (`outlook.price`; `outlook.final` gives the posted price). Rows 1 and 2 come in PR-3. Wire RULE-2's replace and RULE-5's later asks to it. Commit.

### Task 1.5: C2, the cash shadow price (RULE-5)

**Depends on:** 1.3, 1.4.
**ACs verified:** T-AC-2, T-AC-4.
**Files:**
- `packages/ai/src/strategist.ts::goodPlan` and `::tradeDecision`, and `value.ts::cashReserve` (named edits, WS1);
- test: `value-unit.test.ts`, `packages/ai/test/auction-play.test.ts`.

- [ ] **Step 1: Write the failing test `T-AC-2: 80 cr goes to Energy's 2 units before Food's`.**
  - Altitude: promise, the Energy auction's end stock on a built state, plus goodPlan's Food budget.
  - Use RULE-5's example: Food short 2 (v 40, ask 30), Energy short 2 (v 120, ask 35). Food's budget is 0, and 70 cr is kept for Energy.
  - Negative case: with every need funded, the budget is today's share.
- [ ] **Step 2: Write the failing test `T-AC-4: WS1's reserve example buys`.** Value 411, ask 214, 1,355 cr, old reserve 1,157. Observed at the stock after the auction.
- [ ] **Step 3:** Run both. They fail.
- [ ] **Step 4: Implement C2 per spec §1 C2 and RULE-5.**
  - The allocation spans the goods still to come in `AUCTION.order`.
  - 'Cash left' scores against the cash allocated to later goods.
  - `cashReserve` is derived from the same allocation for its 6 non-auction callers, all with the switch on only. The callers are strategist.ts :159, :285, :342, :385, :493, plus hands/lot.ts:72 and playbook/draft.ts:175.
  - Plan-drift correction: none.
- [ ] **Step 5:** PASS. Re-run the T-AC-9 sims. Commit.

### Task 1.6: C4, a pass carries its shortfall

**ACs verified:** T-AC-5.
**Files:** `strategist.ts::tradeDecision` (named edit, WS1); test: `value-unit.test.ts`.

- [ ] **Step 1: Write the failing test `T-AC-5: short and funded, the pass candidate's gain is below the buy's; no veto`.** Observed at `tradeDecision`'s shortlist. Negative case: unfunded, the pass gain is 0.
- [ ] **Step 2: Implement C4 per spec §1 C4.** PASS. Commit.

### Task 1.7: C8, plants and wells valued at what they save

**ACs verified:** B-AC-5.
**Files:** `value.ts::monthlyNet` (named edit, WS1); test: `packages/ai/test/resource-utility.test.ts` (new, WS1's tree, named edit).

- [ ] **Step 1: Write the failing test `B-AC-5: an Energy-short seat installs a plant; with a cheap, stocked store and a better Food plot it outfits Food`.**
  - Altitude: promise, the plot's outfit after development, on a built state played through the develop hand.
  - Negative case: no idle plot, so nothing is installed.
  - Trap: build the dear-Energy state by store stock and price, not by mocking `monthlyNet`.
- [ ] **Step 2: Implement C8 per spec §1 C8.** Own-use units are valued at RULE-2's S(k) and the rest at today's carry (RULE-4 in PR-2), with the switch on only. PASS. Commit.

### Task 1.8: The promise tests B-AC-1 and B-AC-2, and replay

**ACs verified:** B-AC-1, B-AC-2, T-AC-11.
**Files:** `resource-utility.test.ts`; `apps/server/test/playbook-record.test.ts` or the record replay test (WS3's test tree, named edit).

- [ ] **Step 1: Write `B-AC-1: a seat with 0 Food, eating 5, 1,200 cr, the store selling at 72, is not hungry at the next development`.**
  - Altitude: promise. A built state is played on through the auction, upkeep and spoilage, and `hungry` is read at the next development (`packages/engine/src/game.ts:224`).
  - Trap (spec): "holds ≥ 5 after the auction" is the wrong check. Upkeep eats, then spoils half.
  - Negative case: the store holds no Food, so the seat is hungry.
- [ ] **Step 2: Write `B-AC-2: a seat with plots needing 6 Energy, holding 1, cash enough, the store selling 6, has no energyOff part at production`.** Observed at production's lines. Negative case: cash below one unit, so the plots turn off in `energyOffOrder`'s order.
- [ ] **Step 3: Write `T-AC-11: a game with AI_VALUE.unit true replays from seed + actions to the same state hash`.** Reuse WS3's record replay, as #303's tests do.
- [ ] **Step 4:** Run all three, switch on: PASS. With the switch off, B-AC-1 is red (the positive control: today's AI goes hungry). Commit.

### Task 1.9: C6 rows for G-1, and the measurement

**ACs verified:** T-AC-1, T-AC-12.
**Files:** `packages/ai/src/sim.ts` (named edit, WS1).

- [ ] **Step 1: Implement C6's PR-1 rows per spec §1 C6.** UBER-AC-1 (a) and (b), and plants and wells built per seat-game, each beside the colony's Food/Water shortage (HC-6), printed only with the switch on.
- [ ] **Step 2: Measure `T-AC-1` and `T-AC-12`.**
  - Run `pnpm sim -- --games 40 --seed S --set AI_VALUE.unit=true` on 1/101/201, and quote the rows and the sim's wall time against trunk in the PR body.
  - The rows are reported, never tuned. UBER-AC-1's under-5% is a result for Heiko; the PR merges behind the switch either way.
- [ ] **Step 3:** T-AC-9's sims are byte-identical with the switch off. Commit.
- [ ] **Step 4:** Rulebook: `computer-players.html#resource-utility` gets the measured numbers; the pill stays "Designed" because the switch is off. Run `node docs/rulebook/build-index.mjs`. Commit.

### PR-1 merge gate

- [ ] B-AC-1, B-AC-2, B-AC-5, T-AC-2..6 and T-AC-11 green and named after their AC ids; T-AC-1, T-AC-9 and T-AC-12 measured and quoted.
- [ ] Each failing-test commit precedes its implementation commit.
- [ ] typecheck 0 · config-guard green · CI green · trace-check PASS · no new `@ts-ignore` without a reason.
- [ ] Each named edit is its own commit, and WS1 OKs its SHAs (WS3 too, if a record test moved).
- [ ] One review once CI is green, with a mutant sweep over RULE-2/3/5.
- [ ] The head goes to the PM. Switching the default on is Heiko's ruling on the measured numbers.

---

## PR-2 · G-2: a surplus when cheap

### Task 2.1: C1, RULE-4's carry

**Depends on:** PR-1 on trunk.
**ACs verified:** T-AC-7.

- [ ] **Step 1: Write the failing test `T-AC-7: Ck at RULE-4's example is about 29.8`** (belief 40, spoilage 0.1, tax 8%, spread 0.1). Negative case: spoilage 1, so Ck is 0. Altitude: unit, `value-unit.test.ts`.
- [ ] **Step 2: Implement C1's RULE-4 per spec §2 RULE-4,** in `value.ts::unitValues` (and `monthlyNet`'s carry for C8), switch on only. The colony-shelf cap in `goodPlan` stays as it is. PASS. Commit.

### Task 2.2: B-AC-3 at promise altitude

**ACs verified:** B-AC-3.

- [ ] **Step 1: Write `B-AC-3: with Food's ask at or below its reference and a belief above it after spoilage and tax, the seat holds more than next month's need; at 2× reference, no more`.**
  - Observed at the stock after the auction, on a built state.
  - Negative case: a good that spoils fully gets no surplus.
- [ ] **Step 2:** Run it: PASS with the switch on. Commit.

### Task 2.3: C6's band row, and the measurement

**ACs verified:** UBER-AC-2's report row.

- [ ] **Step 1: Implement C6's PR-2 row per spec §1 C6** (Food held ÷ need, by price band, beside HC-6's colony row). Measure it on 1/101/201 with the switch on, and quote it in the PR body. T-AC-9 identical with the switch off. Update the rulebook section and rebuild the index. Commit.

### PR-2 merge gate

- [ ] B-AC-3 and T-AC-7 green; the band row measured; T-AC-9 identical.
- [ ] typecheck · config-guard · CI · trace-check · one review · WS1's OKs · the head to the PM.

---

## PR-3 · G-3: speculation under a belief

### Task 3.1: C5, `GoodPlay.expect` (the §3 contract)

**ACs verified:** T-AC-8.
**Files:**
- `packages/engine/src/playbook.ts::GoodPlay` (WS3 named edit, the field only);
- `packages/ai/src/playbook/draft.ts`, `validate.ts` (WS9's);
- test: `packages/ai/test/playbook-validate.test.ts`.

- [ ] **Step 1: Write the failing test `T-AC-8: expect within bounds is the belief, rounded to whole credits; beyond them clamped and listed; NaN and ±Infinity refused and the key dropped; a draft with no belief has no expect key`.** Observed at the validator result and the drafted GoodPlay's JSON (`'expect' in play` is false). The case 72.4 → 72.
- [ ] **Step 2: Implement C5 per spec §1 C5 and §3** (WS3's two conditions). Add `AI_VALUE.belief.min` and `.max` to C7. PASS. Commit: the engine field as its own commit for WS3.

### Task 3.2: C3, RULE-6 rows 1 and 2

**Depends on:** 3.1; WS5's `expectedOffWorld` (#390 PR-1), or the `outlook.later` stub.

- [ ] **Step 1: Implement C3 rows 1–2 per spec §2 RULE-6.**
  - Row 1 reads the playbook's `expect`.
  - Row 2 tilts `outlook.price` by the trend, `MonthReport.warnings`, the rivals' output and `expectedOffWorld`, with the persona's risk and greed. The weights are new `AI_VALUE` keys.
  - RULE-4's buy side is read at the tilted belief.
  - Plan-drift correction: if #390 hasn't landed, stub `expectedOffWorld` as `outlook.later` behind one function, so the swap is one line.

### Task 3.3: B-AC-4 at promise altitude

**ACs verified:** B-AC-4.

- [ ] **Step 1: Write `B-AC-4: a playbook setting expect on Food above the ask makes the seat buy beyond its need; without expect it doesn't`.** Observed at the stock after the auction. Negative case: expect beyond the bound is clamped and listed in `rejected`. PASS. Commit.

### Task 3.4: C6's speculation row, T-AC-10

**ACs verified:** T-AC-10.

- [ ] **Step 1: Implement C6's PR-3 row per spec §1 C6** (units bought beyond need, and their realised margin after spoilage, storage and tax). Measure it on 1/101/201, quote it, and keep T-AC-9 identical. Commit.

### Task 3.5: Rulebook

- [ ] **Step 1:** The section's speculation paragraph gets the measured row. The pill flips to "In the game" only once Heiko switches the default on (his ruling). Rebuild the index. Commit.

### PR-3 merge gate

- [ ] B-AC-4, T-AC-8 and T-AC-10 green or measured; T-AC-9 identical.
- [ ] WS3's OK on the `GoodPlay.expect` SHA; WS1's OKs on its files.
- [ ] typecheck · config-guard · CI · trace-check · one review · the head to the PM.

---

## Risk mitigations (spec §7) mapped to tasks

| Risk | Where |
|---|---|
| The colony competes for the store's Food | Task 1.9 and 2.3 print the colony row beside every result (HC-6) |
| The Energy turn-off order | on trunk (#393). Task 1.3 passes `cold` explicitly |
| Water's AM-18 is not built | Task 1.3's drift correction; the Water row follows AM-18 |
| WS5's price paths | Task 3.2's stub on `outlook.later` |
| Sim-searched fixtures | PR-0 before PR-1 |
| Sim speed | Task 1.9 reports wall time against trunk |
| Heavy tests | the T-AC-1, T-AC-10 and T-AC-12 sim rows are report lines, never vitest |
| Plants under-built under AM-17 | Task 1.7 (C8) and T-AC-12 |

## Pre-implementation checklist

- [x] Spec approved by the user: Heiko, "Yes, build it" (#385, 0e895b38; AM-1 at 674e7767 renames the switch only).
- [ ] Upstream dependencies merged: #386 (`wholeNextMonth`) for PR-1; WS1's #366 re-pick for PR-0. #393 (`energyOffOrder`) is on trunk.
- [x] Branch policy: every PR targets `feat/strategist`; the PM batches; `main` needs Heiko's OK.
- [ ] Base `feat/strategist` @ 2bc6c032 green: `pnpm typecheck` 0 · config-guard 2/2 · CI green on #398's batch merge. Re-measured at each PR's pre-flight.
- [x] No spikes (spec §7).
- [ ] Effort sent to the PM: PR-0 about 0.5 day; PR-1 about 3–4 days; PR-2 about 1 day; PR-3 about 2–3 days.
