# WS5 store pricing: a market-maker store, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Standard (Heiko, 5 Nov).

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 spec §0 (the store's prices answer the table) | the players at the table; the AI seats | prices that move with the table: sell-out floor, glut step, ceiling, Energy on the shelf | UBER-AC-1 | **PR-1** |
| G-2 spec §0 (a wider bid/ask spread) | the players at the table | a deal between players beats the store | UBER-AC-2 | **PR-1** |
| G-3 spec §0 (off-world prices swing; Crystite 40–300 around 90) | the players at the table | export goods become a bet | UBER-AC-3 | PR-2 |

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- The auction board's mechanics for rule E (WS3's). This spec owns the price rule that rule feeds, and §3 names the seam.
- How the AI seats value goods (WS9's). They read the four functions in §3 through `outlook.ts`.
- Taxes, emergency shipments, the export ship's buying rule (apart from reading the new off-world price).
- Supply levers: start Food, the store's Food per player, spoilage, farm yield (Heiko's balance pass, C29).
- Live house lines that move during the walk (approach C): a follow-up once B is played.
- Off-world price walks for Food, Water and Energy: they are not export goods; their off-world price stays fixed.

**Thin baseline (spec §0.1):** A, a wider spread + a ceiling + an off-world draw, numbers only · about 1 day · it
cannot meet UBER-AC-1, because `economy.ts::nextPostedPrice` reads no walk outcome, so a sell-out or a glut never
moves next month's lines.
→ **PR-1 relationship:** the shortest slice through the chosen approach B that delivers G-1 and G-2 at the table
(the quote rule, the mid rule with its floor/cap/ceiling, the walk seam, the Energy target), and freezes the four
§3 signatures WS9 stubs against. PR-2 adds G-3 (the off-world walk) and the MULE factor cap.

**Constraints:** spec §0.2 (HC-1 … HC-5) travel with every task.

**Architecture:** one quote formula (`economy.ts::storeQuotes`) and one mid-price formula
(`economy.ts::nextPostedPrice`) in WS1's economy code. Every other place that priced the store with its own copy of
the spread calls them instead; WS3's auction records each good's sold-out high and dry budget for the next posting;
the off-world prices step at month opening from keyed seeded draws.

**Tech Stack:** TypeScript, pnpm workspace, vitest (packages/engine, packages/ai, apps/server), the sim
(`pnpm sim`, `packages/ai/src/sim.ts`).

**Inputs:**
- Spec: `docs/specs/2026-11-05-ws5-store-pricing.md`
- Sections present and consumed: §0, §0.1, §0.2, §1 C1–C7, §2 RULE-1..4, §3 (the AI price contract, the rule-E
  seam), §5 (delivery, rulebook), §6 B-AC-1..6 / T-AC-1..4, §9.
- Sections declared N/A by the spec, with its stated reason: §4 (in-process engine code), §7 (no spike; one risk
  with its mitigation in B-AC-4's negative case and T-AC-4).
- N/A claims I checked: §4, true (no I/O in packages/engine, CLAUDE.md). §7, the colonist risk gets Task 1.6's sim
  re-measure.
- Amendment at plan time: spec §5 said the rulebook chapter changes in PR-2; Heiko's rulebook rule wants it in
  every PR that changes a rule → both PRs update it (spec §8 AM-1).

---

## PR decomposition

**Lane branch:** `ws5-store-pricing` from trunk `feat/strategist` (lane merges its own sub-PRs; PM merges to trunk
in a batch).

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-1 | `ws5-store-pricing-pr1` | Tasks 1.1–1.7 (C1, C2, C5, C6, C7 PRICE part) | B-AC-1, B-AC-2, B-AC-3, B-AC-4, T-AC-2, T-AC-3, T-AC-4 | the four §3 signatures (frozen); `Store.lastWalk` | none | No (views read `storeQuotes`, unchanged shape) |
| PR-2 | `ws5-store-pricing-pr2` | Tasks 2.1–2.4 (C3, C4, C7 MULE/OFF_WORLD part) | B-AC-5, B-AC-6, T-AC-1 | `expectedOffWorld` path behaviour | §3 as frozen in PR-1 | No |

**Freeze point:** the four §3 signatures land in PR-1 Task 1.1, before any behaviour change, and PR-1's merge into
the lane is when WS9's PR-3 may stop stubbing `outlook.later`.

### Authority

**PR-1** (named edits; each owner OKs on the SHA, routed through the PM)
- `may_edit`: `packages/engine/src/economy.ts` (WS1) · `packages/engine/src/config.ts` PRICE block (WS1) ·
  `packages/engine/src/upkeep.ts` (WS1) · `packages/ai/src/outlook.ts`, `strategist.ts`, `value.ts` (WS1, only
  the spread copies named in spec §1 C2) · `packages/engine/src/auction.ts` (WS3, comeUp and finishGood) ·
  `packages/engine/src/types.ts` (WS3, `Store.lastWalk` only) · tests under `packages/engine/test`,
  `packages/ai/test` · `docs/rulebook/store-and-prices.html` (WS5).
- `must_not_edit`: `packages/engine/src/game.ts` (PR-2 owns its month-opening and muleFactor lines) · `walk.ts`
  and the board (WS3/WS4, approach C is a non-goal) · `apps/web/**` (no screen change).

**PR-2**
- `may_edit`: `packages/engine/src/economy.ts` (WS1, stepOffWorld and expectedOffWorld's path) ·
  `packages/engine/src/config.ts` MULE and new OFF_WORLD blocks (WS1) · `packages/engine/src/game.ts` (WS3, month
  opening call and the muleFactor cap) · tests · `docs/rulebook/store-and-prices.html` (WS5).
- `must_not_edit`: `auction.ts`, `upkeep.ts`, `packages/ai/**` (done in PR-1; any change is a plan update).

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

### Contention

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/economy.ts` | PR-1, PR-2 | **serialised** — PR-2 branches from PR-1's merge |
| `packages/engine/src/config.ts` | PR-1 (PRICE), PR-2 (MULE, OFF_WORLD) | **serialised** |
| `docs/rulebook/store-and-prices.html` | PR-1, PR-2 | **serialised**, the last task of each PR |

PR-1 and PR-2 run one after the other (one wave each); the tasks inside PR-1 are serial because they share
`economy.ts`.

---

## PR-1 · the store's prices answer the table, with a wider spread (G-1, G-2)

### Task 1.1 — freeze the §3 contract (C2 extract, `Store.lastWalk`, `expectedOffWorld` stub)
**Depends on:** none · **ACs verified:** T-AC-2 (as a contract test) · **Spec:** §3, HC-3, HC-5
**Files:** Modify `packages/engine/src/economy.ts` (`storeQuotes`, new `expectedOffWorld`),
`packages/engine/src/types.ts` (`Store`), `packages/engine/src/auction.ts::comeUp` (calls `storeQuotes`).
Test: `packages/ai/test/store-quotes-contract.test.ts` (new).

- [ ] **Step 1: Write the failing test `T-AC-2: at upkeep, outlook's next-month price is the store's own rule on its stage`**
  Altitude: contract (the AI's view against the store's rule). Observed at: sampled at upkeep (every walk done),
  `outlook(...).price(g)` against `nextPostedPrice(stage, g)`, and the stage's `store.lastWalk` against the state's,
  every good, 20 seeded games (spec §6 T-AC-2 as amended, AM-3). Do NOT compare to the next posted price. Also asserts
  `expectedOffWorld(state, g, k)` equals `store.offWorld[g]` while off-world prices don't move yet (PR-2 changes this).
  Trap: sample at upkeep, not during the auction: a later good's walk writes lastWalk after an earlier sample.
  Also pins §3's null semantics: `sell` is null exactly when `storeForSale` is 0, `buy` exactly when `storeWants` is 0.
- [ ] **Step 2: Run it, expect FAIL (`expectedOffWorld` is not exported)** —
  `pnpm --filter @mule/ai exec vitest run test/store-quotes-contract.test.ts` → FAIL.
- [ ] **Step 3: Implement C2's extract and the §3 contract per spec**: add `expectedOffWorld` (returns today's off-world price until
  PR-2), add the optional `lastWalk` to `Store`, and make `auction.ts::comeUp` take its lines from `storeQuotes`
  with today's numbers kept (the restock premium moves inside `storeQuotes` unchanged). Mechanism: extract (spec §1
  C2). No behaviour change: the existing `packages/engine/test/store.test.ts` T-AC-13 and `auction.test.ts` stay
  green untouched.
- [ ] **Step 4: Run** the new test plus `pnpm --filter @mule/engine exec vitest run test/store.test.ts test/auction.test.ts` → PASS.
- [ ] **Step 5: Commit** `refactor(engine): one store quote formula and the AI price contract (verifies T-AC-2)`.

### Task 1.2 — C2 callers: every copy of the spread calls `storeQuotes`
**Depends on:** 1.1 · **ACs verified:** T-AC-2 (stays green) · **Spec:** §1 C2 call sites, HC-3
**Files:** Modify `packages/engine/src/economy.ts::colonistDemand`, `packages/engine/src/upkeep.ts` (colonists'
price), `packages/ai/src/outlook.ts::rollForward`, `packages/ai/src/strategist.ts::expectedPrices`,
`packages/ai/src/value.ts::cashReserve`.
- [ ] **Step 1: Write the failing test `HC-3: no copy of the store spread outside economy.ts`** — altitude: unit
  (a source scan, like `packages/ui/test/engine-imports.test.ts`): `PRICE.storeSpread` and `PRICE.restockPremium`
  appear in no file but `economy.ts` and `config.ts`. Run → FAIL (five hits).
- [ ] **Step 2: Replace each copy with the `storeQuotes` reading it means** (sell for the colonists' price and the
  shortfall cost, buy/sell for `expectedPrices` outside the good that is up, the colonists' floor in `rollForward`).
  Mechanism: in_place. Plan-drift: where a copy priced a good the store has no stock of (sell null), keep today's
  fallback `posted × (1 + half-spread)` through a small exported helper in `economy.ts`, not a new copy.
- [ ] **Step 3: Run** `pnpm --filter @mule/engine test && pnpm --filter @mule/ai test` → PASS, scan test PASS.
- [ ] **Step 4: Commit** `refactor: the AI and the colonists price the store through storeQuotes (HC-3)`.

### Task 1.3 — C2 + C6: the inventory lean and the wider spread (RULE-2), the Energy target
**Depends on:** 1.2 · **ACs verified:** B-AC-4, invariant buy < sell · **Spec:** §1 C2, C6, §2 RULE-2, HC-4
**Files:** Modify `economy.ts::storeQuotes`, `economy.ts::monthlyDemand` (energy line), `config.ts` PRICE
(`baseSpread`, `widen`, `leanShare`, `energyPerNewMule`). Test: `packages/engine/test/store.test.ts`.
- [ ] **Step 1: Write the failing tests `B-AC-4: 30% wide at target, higher and up to 50% apart when empty, lower when overstocked`**
  and `B-AC-4 negative: Food's buy line never passes the colonists' cap`. Altitude: unit at `storeQuotes` (the
  pure quote; the auction reads it, Task 1.1). Use RULE-2's three examples exactly (m 30 → 25/35, 25/44, 21/30).
  Rewrite T-AC-13 (the restock-premium test) to the lean: the same promise, that the store bids up for a short
  Food shelf, still under the colonists' cap.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine exec vitest run test/store.test.ts` → FAIL.
- [ ] **Step 3: Implement C2 (RULE-2), C6 and C7's PRICE values** per spec (C6: energyPerNewMule averages only the outfits that draw from the stock, plants excluded; no Water term, that follows AM-18 in WS1's work); remove `PRICE.storeSpread` and `restockPremium` from config
  once nothing reads them (the HC-3 scan proves it). Every number is a PRICE value with a one-line comment (HC-2).
- [ ] **Step 4: Run** engine + ai tests → PASS.
- [ ] **Step 5: Commit** `feat(engine): the store leans on its stock and quotes a wider spread (verifies B-AC-4)`.

### Task 1.4 — C5: the walk records the sold-out high and a dry budget (the rule-E seam)
**Depends on:** 1.1 · **ACs verified:** T-AC-3 · **Spec:** §1 C5, §3 the rule-E seam
**Files:** Modify `packages/engine/src/auction.ts` (where a unit trades between players, and `finishGood`).
Test: `packages/engine/test/auction.test.ts`.
- [ ] **Step 1: Write the failing test `T-AC-3: a unit traded before the shelf emptied never sets soldOutHigh`**
  plus the positive case (a unit traded at 90 while `storeForSale` is 0 sets it to 90) and `dryBudget` true exactly when
  `storeBudget` was > 0 at come-up and is 0 at finish (spec §3). Altitude: unit at the engine's auction step functions; observed at `store.lastWalk[g]`
  after `finishGood`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement C5** (sprout beside `between`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): the walk keeps each good's sold-out high and dry budget (verifies T-AC-3)`.

### Task 1.5 — C1: next month's mid (RULE-1): smaller steps, the sold-out floor, the glut cap, the 12× ceiling
**Depends on:** 1.3, 1.4 · **ACs verified:** B-AC-1, B-AC-2, B-AC-3 · **Spec:** §1 C1, §2 RULE-1
**Files:** Modify `economy.ts::nextPostedPrice`, `economy.ts::postPrices` (sets `store.lastWalk = {}` after reading),
`config.ts` PRICE (`maxRise` 0.3, `maxFall` 0.25, `ceiling` 12, `glutStep` 0.15). Test:
`packages/engine/test/store.test.ts`.
- [ ] **Step 1a: Write the failing test** `B-AC-1: after a sell-out bid to 90, next month's Food sell line is at least 90`
  (+ negative: a 90 trade while the store still had Food sets no floor).
- [ ] **Step 1b: Write the failing test** `B-AC-2: after the Water budget ran dry, next month's buy line is lower` (+ negative).
- [ ] **Step 1c: Write the failing test** `B-AC-3: no posted price above 12× its configured reference`.
  For 1a–1c: altitude: promise at the auction's `storeSell`/`storeBuy` when the next month's good comes up (B-AC-1/2), and at
  `store.posted` (B-AC-3); build the state with the engine's own functions (createGame, a staged walk), never
  hand-set `posted`. Use RULE-1's three examples as cases.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement C1 (RULE-1) and C7's PRICE values** (in_place; order step → floor → cap → export cap →
  ceiling). **Step 4: Run** engine + ai → PASS; the pinned targetPrice/driftReference tests unchanged.
- [ ] **Step 5: Commit** `feat(engine): next month's store price learns from the walk, under a 12x ceiling (verifies B-AC-1..3)`.

### Task 1.6 — sim checks for UBER-AC-1 and UBER-AC-2 (T-AC-4), and the colonist risk (§7)
**Depends on:** 1.5 · **ACs verified:** T-AC-4, UBER-AC-1, UBER-AC-2 · **Spec:** §6 T-AC-4, §7
**Files:** Modify `packages/ai/src/sim.ts` (report lines: between-player share of Food/Water/Energy units, quoted
spread p50, sold-out-floor and glut-step violations, posted above ceiling; colonists short of Food/Water).
- [ ] **Step 1: Run the sim before the change on this branch's base** (trunk as it is then, not spec §0's Today, which predates #386, #393 and AM-18) and keep its numbers on record:
  `pnpm sim -- --games 200 --players 4` → paste the report into the PR body.
- [ ] **Step 2: Add the report lines; run** `pnpm sim -- --games 200 --players 4` on PR-1's head → expect: 0
  floor/cap/ceiling violations (UBER-AC-1), quoted spread > 20% every good-month and between-player Food share
  above 8% (UBER-AC-2). Colonists short of Food/Water: report against Today (13% / 30% of months); a rise goes to
  the PM as a finding for Heiko, never a silent tune.
  Also report WS9's early-month supply finding (6 Nov): in month 1 the store's Food for sale against the short
  seats' need (WS9 saw 11 for sale against three seats needing 9 each). The lean raises the buy line but adds no
  stock; supply is Heiko's C29 pass, so this is reported, not tuned.
- [ ] **Step 3: Commit** `test(ai): the sim reports the store's spread, floors and between-player share (verifies T-AC-4)`.

### Task 1.7 — the rulebook chapter (spec §5, §8 AM-1)
**Depends on:** 1.6 · **Files:** `docs/rulebook/store-and-prices.html#store-pricing-design` (WS5).
- [ ] **Step 1:** Read `docs/rulebook/WRITING.md`; rewrite the section for what PR-1 changes (the spread, the lean,
  the sell-out floor, the glut step, the 12× ceiling, Energy), with its status pill.
- [ ] **Step 2:** Run `node docs/rulebook/build-index.mjs` → exit 0.
- [ ] **Step 3: Commit** `docs(rulebook): the store's prices after PR-1`.

### PR-1 merge gate
- [ ] Every AC in the PR-1 row has a green test named after it; failing-test commits precede their implementation.
- [ ] T-AC-2 (the AI contract) green: the consumer-side test, not only the producer's.
- [ ] `pnpm typecheck && pnpm test` exit 0 (the base numbers below or better).
- [ ] The HC-3 scan green; `PRICE.storeSpread` / `restockPremium` gone.
- [ ] `pnpm sim` report in the PR body (Task 1.6), Today vs PR-1.
- [ ] Named-edit OKs on the SHA: WS1 (economy, upkeep, config, outlook, strategist, value) and WS3 (auction,
  types), routed through the PM.
- [ ] One code review once CI is green (the PR changes rules and money figures).
- [ ] Rulebook chapter updated, build-index run.

---

## PR-2 · off-world prices swing; the MULE factor gets a cap (G-3, G-1's MULE part)

### Task 2.1 — C3: the seeded off-world walk (RULE-3)
**Depends on:** PR-1 merged · **ACs verified:** B-AC-5 (unit half), T-AC-1 · **Spec:** §1 C3, §2 RULE-3, HC-1
**Files:** Modify `economy.ts` (new `stepOffWorld`), `config.ts` (new `OFF_WORLD`), `game.ts` (call at the month's
opening, where `state.month++`). Test: `packages/engine/test/off-world.test.ts` (new).
- [ ] **Step 1: Write the failing tests** `T-AC-1: the same seed gives the same off-world path, and every other draw is unchanged`
  (compare the events, map and AI draws of one seeded game with the walk on and with `OFF_WORLD` sigma 0) and
  `B-AC-5 (rule): Crystite stays within 40–300; the others within ±50% of their reference`. Altitude: unit at the
  engine over 1,000 seeded months (a pure rule with many combinations).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement C3 (RULE-3) and C7's OFF_WORLD block** (sprout; Box–Muller from `rng.next()` of
  `createRng(seedOf(seed, month, 'offWorld', good))`; plan-drift: `seedOf` is private in
  `packages/engine/src/events.ts`; export it from there or move it to `packages/engine/src/rng.ts` beside
  `createRng`, never copy it). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): export goods' off-world prices walk from seeded draws (verifies T-AC-1)`.

### Task 2.2 — `expectedOffWorld` follows the walk (§3)
**Depends on:** 2.1 · **ACs verified:** T-AC-2 (updated) · **Files:** `economy.ts::expectedOffWorld`; the T-AC-2 test.
- [ ] **Step 1:** Change T-AC-2's off-world half to spec §3's example (160 → 134 in 1 month, 109 in 3) → FAIL.
- [ ] **Step 2:** Implement the expected path (pure, never draws) → PASS. **Step 3: Commit** `feat(engine): the AI reads the off-world walk's expected path`.

### Task 2.3 — C4: the MULE factor cap (RULE-4)
**Depends on:** PR-1 · **ACs verified:** B-AC-6 · **Files:** `game.ts` (the muleFactor step), `config.ts`
(`MULE.maxFactor` 2.0). Test: `packages/engine/test/store.test.ts`.
- [ ] **Step 1: Write the failing test `B-AC-6: after many sold-out months the factor is at most 2.0 and Smithore at most its ceiling`**
  (altitude: promise at `mulePrice` after real month transitions with an empty corral) → FAIL.
- [ ] **Step 2: Implement C4 (RULE-4) and C7's MULE.maxFactor** (in_place, one cap) → PASS. **Step 3: Commit** `feat(engine): the MULE sell-out surcharge stops at 2x (verifies B-AC-6)`.

### Task 2.4 — UBER-AC-3 by sim, and the rulebook
**Depends on:** 2.1–2.3 · **ACs verified:** B-AC-5, UBER-AC-3
- [ ] **Step 1:** Run the sim on PR-2's base first (trunk then, not spec §0's numbers), then add the sim report line (off-world Crystite median, share above 200, ≥ 280, ≤ 50; MULE price
  p50/p90/max) and run `pnpm sim -- --games 200 --players 4` → median 85–95, never outside 40–300, above 200 under
  5%, ≥ 280 under 1%, ≤ 50 under 5%. Paste into the PR body.
- [ ] **Step 2:** Rulebook: Crystite's and the export goods' ship prices, the MULE cap; `node docs/rulebook/build-index.mjs`.
- [ ] **Step 3: Commit** `test(ai): the sim reports off-world prices and the MULE price (verifies UBER-AC-3)`.

### PR-2 merge gate
- [ ] B-AC-5, B-AC-6, T-AC-1 green and named; test commits first.
- [ ] `pnpm typecheck && pnpm test` exit 0; the sim report in the PR body.
- [ ] Named-edit OKs on the SHA: WS1 (economy, config), WS3 (game.ts); WS1 (events.ts, if seedOf is exported there).
- [ ] One code review once CI is green. Rulebook updated, build-index run.

---

<!-- plan-check: no-task C29 — named in spec §0 Non-goals and §1 C7's prose as Heiko's balance pass, not this spec -->

## Pre-implementation checklist
- [ ] Spec reviewed by Heiko through the PM (§0 and approach agreed; the written spec read).
- [ ] PR #387 (the rulebook) is on trunk, or Tasks 1.7/2.4 wait for it.
- [ ] Rule E (WS3's amendment E) status known: without it Task 1.4's high is null more often (spec §1 C5, stubbable).
- [ ] Branch policy: lane branch `ws5-store-pricing` from `feat/strategist`; sub-PRs into it; PM batches to trunk.
- [ ] Base `feat/strategist` @ `43af74d2` green (measured 5 Nov): `pnpm typecheck` 0 · `pnpm test` 0 — engine 564 (+1 skipped), ai 336 (+10), server 477 (+47), web 857, ui 148, tabletop 158. Re-run at PR-1 start (trunk will have moved).
- [ ] Owner OK routing through the PM confirmed (WS1, WS3).
- [ ] Estimate: PR-1 about 2 days, PR-2 about 1 day (spec §0 rough cost).
