# The colony economy: build plan (store prices, colony needs, colony health)

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Approved design:** Heiko approved the colony economy explainer v3 on 6 Nov, "this explainer and all the proposed
design options and solutions" (`docs/explainers/2026-11-06-colony-economy.html` at a28b861b, all 30 decisions, the
pace option C of 14:20Z). This plan builds that design and nothing else.
**Supersedes:** `docs/plans/2026-11-05-ws5-store-pricing.md` (written before the rework; its Tasks 1.1 Step 1b and
the PR-2 off-world tasks are carried here).

**Spec class:** two Standard specs (Heiko): the store pricing spec and the colony-needs spec. Together they make 13
PRs over six lanes, so the plan carries Programme weight (PR table, per-PR authority, contention, milestone gates).
Neither spec's class changes.

## Goals — lifted from the two specs' §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 pricing spec §0 (the store's prices answer the table) | the players at the table; the AI seats | a store price that follows the colony's months of cover, a sell-out and a high trade, never below normal, never above 12× | pricing UBER-AC-1 (as AM-5) | **PR-1** |
| G-2 pricing spec §0 (a wider bid/ask spread) | the players at the table | band spreads of 30–35%, so a deal between players beats the store | pricing UBER-AC-2 | **PR-1** |
| G-2 colony-needs spec §0 (colonists have no economy) | the players at the table | no hidden wage cap: colonists eat from the shelf, free | needs UBER-AC-2 | **PR-2** |
| G-3 pricing spec §0 (off-world prices swing; Crystite 40–300 around 90) | the players at the table | export goods become a bet | pricing UBER-AC-3 | PR-4 |
| G-1 colony-needs spec §0 (hunger is as bad as the shortage) | the players at the table | feeding the colony is a gradient, not a cliff; sickness follows Medicine | needs UBER-AC-1 | PR-7 (reaches trunk with milestone B) |

**Why two goals come after PR-2 (self-review check 2).** G-1 of the colony-needs spec cannot reach the table
earlier: Heiko's decision 1 (and 23 for health) is that hardship and sickness reach trunk only together with the
supply change, tuned in one pass (needs HC-14). Milestone B is therefore one batch. G-3 has no dependency and nobody
waits on it, so it yields its place to PR-3 (Electronics demand), which WS9's chain build waits on (needs C17
atomicity). Every earlier PR is useful to the players the day its milestone lands.

**Non-goals, lifted verbatim. A task serving one is cut.**
Pricing spec §0:
- The auction board's mechanics for rule E (WS3's). This spec owns the price rule that rule feeds, and §3 names the seam.
- How the AI seats value goods (WS9's). They read the four functions in §3 through `outlook.ts`.
- Taxes, emergency shipments, the export ship's buying rule (apart from reading the new off-world price).
- Supply levers: start Food, the store's Food per player, spoilage, farm yield (Heiko's balance pass, C29).
- Live house lines that move during the walk (approach C): a follow-up once B is played.
- Off-world price walks for Food, Water and Energy: they are not export goods; their off-world price stays fixed.

Colony-needs spec §0:
- Players' and crews' consumption per production type and the store-demand step (WS5's part of this spec, §1 WS5).
- Colonists' Energy and Medicine: they stay demand for prices only, as today; hardship reads Food and Water. A later spec could add them as softer hardships.
- A new screen or gauge for the hardship memory: the table sees it through the mood, the events and the month-end line. A hardship marker on the colony panel would need a WS6 mock first.
- Tuning: every number is a placeholder (G-5 HC-25).

(The first colony-needs non-goal is WS7's view of WS5's half; this plan builds that half. The second is overtaken
for Medicine by Heiko's health decisions 23–30, see "Spec contradictions found" below; Energy stays as written,
decision 16. The tuning non-goal holds: the tuning pass, PR-12, is WS1's G-5 C29, not either spec's.)

**Thin baseline:**
- Pricing spec §0.1: A, a wider spread + a ceiling + an off-world draw, numbers only · about 1 day · it cannot meet
  UBER-AC-1, because `economy.ts::nextPostedPrice` reads no walk outcome. Checked at plan time on trunk 38070ffb:
  still true (no `lastWalk`, `soldOutHigh` or `highTrade` anywhere in `packages/engine/src`).
  → **PR-1 relationship:** the shortest slice through the chosen approach (B as reworked by Heiko's five rules) that
  delivers G-1 and G-2 at the table: the bands, the moves, the walk seam, one selling price on every screen.
- Colony-needs spec §0.1: B, the curve on the mood's target only · about half a day · it loses because the 5-point
  step cap flattens every shortfall over 40% to the same −5. Checked: `colony.ts::moodStep` still caps at
  `HAPPINESS.maxStep` 5 on trunk. → PR-7 builds A (curve, memory, shock), WS7's.

**Constraints:** both specs' §0.2 travel with every task: pricing HC-1 … HC-5 (HC-4 as amended by AM-5) and
colony-needs HC-1 … HC-5 (WS7) and HC-10 … HC-14 (WS5).

**Architecture.** One demand (`economy.ts::monthlyDemand`) feeds one price rule (`economy.ts::nextPostedPrice` with
RULE-5..7) and one quote (`economy.ts::storeQuotes`) that every screen and the AI read. Consumption comes from one
CONSUMPTION table through `production.ts::needsOf` / `energyUseOf`. The colonists' side (meal, hardship, sick share)
lives in WS7's `colony.ts`; its effects on players, crews and the store go through the existing seams (`eventChance`,
`runProduction`, `needsOf`), and health is a switch that stays off until Medicine can be had (HC-13).

**Tech Stack:** TypeScript, pnpm workspace, vitest (packages/engine, packages/ai, apps/server, apps/web), the sim
(`pnpm sim`, `packages/ai/src/sim.ts`), the colony-economy report (Task 1.0, new).

**Inputs:**
- Specs: `docs/specs/2026-11-05-ws5-store-pricing.md` (on trunk; amended here as AM-5) and
  `docs/specs/2026-11-06-colony-needs.md` (branch `ws7-colony-needs` at dee0b961, WS7 leads; WS5's health side added
  there as AM-1 today, WS7's at 8c9c3957).
- Approved source: explainer v3 a28b861b; WS8's colony-health mock (de672e61) for C19's screen.
- Sections present and consumed: pricing §0, §0.1, §0.2, §1 C1–C7, §2 RULE-3..7, §3, §5, §6, §8, §9; needs §0,
  §0.1, §0.2, §1 C1–C6 (WS7), C10–C19 (WS5), §2 RULE-1..6, RULE-10..15, §3 (WS5's part), §6, §8, §9.
- Sections declared N/A by the specs: pricing §4 (in-process engine code), §7 (no spike); needs §4, §5, §7 absent.
- N/A claims I checked: pricing §4, true (no I/O in packages/engine). Pricing §7 "no spike": true for pricing; the
  supply pass needs two (S1, S2, in WS1's PR-5). Needs §3 was missing although C6 and C19 cross the server↔web
  boundary: added for C19 (AM-1); C6 changes only the wording of an existing view line, no shape.

**Spec contradictions found while planning (self-review check 5), each fixed in the spec, not worked around:**
1. The pricing spec recorded Heiko's approval but its §1/§2/§6 still described the power-law target, the lean and
   the glut step → **AM-5** folds the approved rework in (C1, C2, C5, C7, HC-4, B-AC-2 dropped, B-AC-4 rewritten,
   B-AC-7..9, T-AC-5, T-AC-6 added).
2. The colony-needs spec had no health or Electronics changes although Heiko approved them → **AM-1** (WS5's side:
   C17–C19, RULE-13..15, HC-13, HC-14, §3, B-AC-15..18, T-AC-25..28); WS7 added its colonist side at 8c9c3957 (C7–C9,
   RULE-7..9, B-AC-6..8, T-AC-8..11).
3. The colony-needs non-goal "Colonists' … Medicine … stay demand for prices only" contradicted decisions 23–30:
   WS7 amended it at 8c9c3957 (the non-goal above is lifted from before that commit).
4. C19's view was null only with health off, but WS7's T-AC-11 has no sick share with politics off → C19 and §3 now
   read null with politics off too (dee0b961).

**Plan decision P-1 — OK'd by WS7 through the PM, 6 Nov.** The colonists' free meal (needs C1, C2,
C6) ships in milestone A, not with the hardship. Reason: it counts no shortfall (decision 1's concern is "any rule
that counts how short they went"); the pricing rework was measured with colonists eating free from the store; and
under the bands the severe Food selling line (150) equals the colonists' Food wage (150), so a wage-paying colony
would go hungry beside a stocked shelf as soon as a trade pulls the price up. If WS7 declines, PR-2 moves unchanged
into milestone B after PR-6, and PR-1's colonist cap (pricing HC-4) simply stays until then. (WS7 agreed; its note:
C2 also removes the wage ceiling on the store's restock bid, which PR-1's bands replace.)

---

## PR decomposition

**Integration branch:** `ws5-colony-economy`, cut from trunk `feat/strategist` (WS5 owns it; every sub-PR below
targets it, whichever lane builds it; WS5 merges a sub-PR once its gate is green and its owners have OK'd the SHA).
Trunk is reached only by the PM's batch merges: **milestone A** (PR-1..PR-4) as one batch, **milestone B**
(PR-5..PR-12) as one batch (needs HC-14), PR-13 on its own once T-AC-28 passes. Never `main`.

| PR | Sub-branch | Builds · OKs on the SHA | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-1 | `ws5-econ-pr1-bands` | WS5 · WS1, WS3, WS4 | Tasks 1.0–1.7 (pricing C1, C2, C5, C6, C7 PRICE) | pricing B-AC-1, 3, 4, 7, 8, 9; T-AC-2..6 | the four pricing §3 signatures (frozen); `Store.lastWalk` with `highTrade` | none | Yes: the TV's market tiles show the selling price (Step 1b) |
| PR-2 | `ws7-econ-pr2-meal` | WS7 · WS1, WS3 | Tasks 2.1–2.3 (needs C1, C2, C6) | needs B-AC-4, T-AC-6, T-AC-7, B-AC-1 (the line) | the month-end line's wording | `storeQuotes` (PR-1) | Yes: one line's words (no mock, needs C6) |
| PR-3 | `ws5-econ-pr3-electronics` | WS5 · WS1 | Tasks 3.1–3.2 (needs C17) | needs B-AC-15, T-AC-25 | `UPKEEP.colonistsPerElectronics` | RULE-6 bands (PR-1) | No |
| PR-4 | `ws5-econ-pr4-offworld` | WS5 · WS1, WS3 | Tasks 4.1–4.4 (pricing C3, C4, C7 MULE/OFF_WORLD) | pricing B-AC-5, B-AC-6, T-AC-1 | `expectedOffWorld`'s path | pricing §3 | No |
| PR-5 | `ws1-econ-pr5-supply` | WS1 (with WS9 for the AI) · WS5 reads | G-5 C29's supply part, planned by WS1: Spikes S1, S2, Task 5.1 | the supply gates (Gate A→B) | the supply numbers | none | No |
| PR-6 | `ws5-econ-pr6-consumption` | WS5 · WS1, WS2 | Tasks 6.0–6.5 (needs C10, C11, C12, C13) | needs B-AC-10, 11, 12; T-AC-20..23 | `CONSUMPTION`, `needsWith` | none | No |
| PR-7 | `ws7-econ-pr7-hardship` | WS7 · WS1 | Tasks 7.1–7.3 (needs C3, C4, C5, C6's red) | needs B-AC-1..3, B-AC-5, T-AC-1..5 | the curve `g` (exported from colony.ts) | PR-2's meal record | No (C6's red is a style on an existing line) |
| PR-8 | `ws5-econ-pr8-crews` | WS5 · WS1, WS3 | Tasks 8.1–8.3 (needs C14, C15, C16) | needs B-AC-13, B-AC-14, T-AC-24 | `Player.crewShort` | the curve `g` (PR-7) | No |
| PR-9 | `ws7-econ-pr9-health` | WS7 · WS1 | Task 9.1 (needs C7, C8, C9) | needs B-AC-6..8 (engine), T-AC-8..11 | the sick share `h`, `HEALTH` (enabled false) | PR-2's meal, PR-7's curve | No |
| PR-10 | `ws5-econ-pr10-health-reach` | WS5 · WS1, WS3 | Tasks 10.1–10.4 (needs C18, C19, C13's Medicine line) | needs B-AC-16..18, T-AC-26, T-AC-27 | `MuleView.colonyHealth` (needs §3) | `h` (PR-9) | No (the field only) |
| PR-11 | `ws8-econ-pr11-health-gauge` | WS8 · WS5 | Task 11.1 (needs C19's ux, from the mock) | needs B-AC-18 on the phone | none | `MuleView.colonyHealth` | Yes: from WS8's approved mock |
| PR-12 | `ws1-econ-pr12-tune` | WS1 · WS5, WS7 | Task 12.1 (one tuning pass, G-5 C29) | needs UBER-AC-1's sim part; Gate B | tuned config | all of the above | No |
| PR-13 | `ws5-econ-pr13-health-on` | WS5 · WS1, WS7 | Task 13.1 (needs HC-13's switch) | needs T-AC-28 | none | all of the above | No |

**Freeze points.** The pricing §3 signatures freeze in Task 1.1, before any behaviour change (pricing HC-5; WS9
stubs against them). `MuleView.colonyHealth` freezes in Task 10.1; WS8 starts PR-11 from that commit. The curve
`g` is exported by PR-7 and imported by PR-8 and PR-9, never copied (needs C14).

### Authority

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

Every file outside the builder's own lane is a named edit its owner OKs on the SHA through the PM. Owners:
WS1 `economy.ts`, `upkeep.ts`, `production.ts`, `events.ts`, `config.ts` (PRICE, MULE, OFF_WORLD, UPKEEP, HEALTH's
numbers), `packages/ai/src/{outlook,strategist,value}.ts`; WS3 `auction.ts`, `game.ts`, `types.ts`,
`apps/server/src/mule-game.ts`, `packages/protocol/src/index.ts`; WS4 `apps/web/src/table/TableApp.tsx`; WS7
`colony.ts`, `HARDSHIP`; WS2 `packages/ai/src/llm/manual.ts`; WS8 the phone's colony desk.

- **PR-1** `may_edit`: `economy.ts` (storeQuotes, nextPostedPrice, postPrices, monthlyDemand's Energy line,
  colonistDemand's price, new expectedOffWorld stub) · `config.ts` PRICE · `upkeep.ts` (the colonists' price only) ·
  `outlook.ts`, `strategist.ts`, `value.ts` (only the spread copies of pricing C2) · `auction.ts` (comeUp, the
  between-player trade, finishGood) · `types.ts` (`Store.lastWalk` only) · `TableApp.tsx::MarketTiles` (the number
  shown) · tests · `tools/colony-economy/` (new) · `docs/rulebook/store-and-prices.html`,
  `docs/rulebook/table-and-phones.html`. `must_not_edit`: `game.ts` (PR-4) · `colony.ts` (WS7; the fund's price
  change is named to WS7 in the PR body) · `walk.ts` and the board (approach C is a non-goal) · the rest of `apps/web`.
- **PR-2** `may_edit`: `upkeep.ts::runUpkeep` (the colonists' meal) · `economy.ts::colonistDemand` (delete the wage
  cap) · `economy.ts::storeQuotes` (delete the colonists' cap, pricing HC-4 as amended) · `config.ts`
  (`UPKEEP.colonistBudget` removed) · `auction.ts` (any read of colonistBudget) · `packages/ai/src/outlook.ts` (its
  colonistBudget read) · `mule-game.ts` + `MonthEnd.tsx` (the line's words) · tests ·
  `docs/rulebook/colony-and-politics.html`. `must_not_edit`: `colony.ts`'s mood (PR-7) · the price rule (PR-1's).
- **PR-3** `may_edit`: `economy.ts::monthlyDemand` (Electronics, Rare earth, Alloy lines) · `config.ts`
  (`UPKEEP.colonistsPerElectronics`) · tests · `tools/colony-economy/` · `docs/rulebook/store-and-prices.html`.
  `must_not_edit`: `packages/ai/**` (WS9's chain build reads the demand; any AI change is WS9's).
- **PR-4** `may_edit`: `economy.ts` (stepOffWorld, expectedOffWorld's path) · `config.ts` MULE, OFF_WORLD · `game.ts`
  (the month-opening call, the muleFactor cap) · `events.ts` or `rng.ts` (seedOf exported, never copied) · tests ·
  `docs/rulebook/store-and-prices.html`. `must_not_edit`: `auction.ts`, `upkeep.ts`, `packages/ai/**`.
- **PR-5** WS1's own plan (G-5 C29); this plan fixes only its exit gate (Gate A→B) and its spikes' stop conditions.
- **PR-6** `may_edit`: `production.ts` (needsOf, crewOf, energyUseOf, runProduction's factory draw, new needsWith) ·
  `config.ts` (new CONSUMPTION; UPKEEP.crew, crewPerFood, crewPerWater, energyUse removed once unread) ·
  `economy.ts::monthlyDemand`, `playersUse` · `packages/ai/src/value.ts` (the crew copy → needsWith) ·
  `packages/ai/src/llm/manual.ts` (the crew sentence) · tests · `docs/rulebook/production.html`.
  `must_not_edit`: `upkeep.ts` (PR-8) · `colony.ts`.
- **PR-7** WS7's lane: `colony.ts` (curve, memory, shock), `upkeep.ts` (new growthRate), `events.ts::influences`
  (mood points), `config.ts` (HARDSHIP, UPKEEP.colonistShrinkPerShortfall), `MonthEnd.tsx` (red), tests,
  `docs/rulebook/colony-and-politics.html`. `must_not_edit`: `production.ts`, `economy.ts`.
- **PR-8** `may_edit`: `upkeep.ts::runUpkeep` (crew shortfall and the household's last meal, recorded) ·
  `production.ts::runProduction` (the crew factor; the dry halving deleted) · `game.ts::startDevelopment` (hunger) ·
  `types.ts` (`Player.crewShort`, the last-meal flag) · `config.ts` (`UPKEEP.crewDrop`, `GOOD_CONFIG.food.spoilage`;
  `UPKEEP.irrigated`, `shortOutputShare` removed) · `packages/ai/src/value.ts`, `llm/manual.ts` (their reads of the
  removed values) · tests · `docs/rulebook/production.html`, `development.html`. `must_not_edit`: `colony.ts` (import
  `g`, never copy).
- **PR-9** WS7's lane: `colony.ts` (the sick share, its mood, growth and Medicine need, the Electronics bonus),
  `upkeep.ts` (the colonists' Medicine and Electronics meal), `config.ts` (new HEALTH, `enabled: false`), tests,
  `docs/rulebook/colony-and-politics.html`. `must_not_edit`: `events.ts`, `production.ts`, `economy.ts` (PR-10).
- **PR-10** `may_edit`: `events.ts::eventChance` (RULE-14) · `production.ts::runProduction`, `needsOf` (RULE-15) ·
  `economy.ts::monthlyDemand` (Medicine reads WS7's health factor) · `upkeep.ts` (the Medicine-short run) ·
  `config.ts` HEALTH (playerSpill, crewSickFrom, crewSpill, crewSickDrop) · `packages/protocol/src/index.ts`
  (`MuleView.colonyHealth`) · `apps/server/src/mule-game.ts` (the view) · tests · `docs/rulebook/colony-and-politics.html`,
  `production.html`. `must_not_edit`: `colony.ts` (read `h` only) · `apps/web` (PR-11).
- **PR-11** WS8's lane: the phone's colony desk from the mock. `may_edit_content`: the approved mock's scaffold
  (`design/mocks/` at de672e61, data flow only; composition, route and tokens as approved). `must_not_edit`:
  `packages/protocol` (frozen in Task 10.1), engine, server.
- **PR-12** WS1's lane: `config.ts` numbers only; any rule change found is a finding to the PM, not a tune.
- **PR-13** `may_edit`: `config.ts` (`HEALTH.enabled` true) · `docs/rulebook/*` pills. Nothing else.

### Contention

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/economy.ts` | PR-1, 2, 3, 4, 6, 10 | **serialised**: one PR per wave, in PR order |
| `packages/engine/src/config.ts` | every PR but PR-11 | **serialised**; each PR edits only its own block |
| `packages/engine/src/upkeep.ts` | PR-1, 2, 7, 8, 9, 10 | **serialised** |
| `packages/engine/src/production.ts` | PR-6, 8, 10 | **serialised** |
| `packages/engine/src/events.ts` | PR-4 (seedOf), 7, 10 | **serialised** |
| `packages/ai/src/value.ts` | PR-1, 6, 8 | **serialised** |
| `packages/protocol/src/index.ts` | PR-2 (maybe, the line), PR-10 | **serialised** |
| `docs/rulebook/*.html`, `search-index.js` | every PR | **serialised**: the last task of each PR, then `node docs/rulebook/build-index.mjs` |
| `economy.ts::monthlyDemand` | open PR #525 (WS7, C49: a waiting building's goods) | **serialised**: PR-1 rebases on trunk once #525 is in |

Each PR is its own wave; the waves run in PR order. Nothing here is parallel except WS1's and WS9's own split
inside PR-5. The one parallel opportunity, PR-11 beside PR-10, is given up because PR-11 consumes the field PR-10
freezes; WS8 starts at Task 10.1's commit and merges after PR-10.

**Batch rule for WS9's chain build (needs C17 atomicity).** If WS9's chain build (AM-33) reaches a trunk batch before
milestone A does, PR-3 rides in that batch (it needs only PR-1 under it, so PR-1 rides too). The PM decides; WS5
flags it the day WS9 reports the chain build ready.

---

## Milestone A · the store reads the colony (PR-1 … PR-4, one batch to trunk)

## PR-1 · the store's prices answer the colony, with one selling price everywhere (pricing G-1, G-2)

### Task 1.0 — the colony-economy report, and the base measured
**Depends on:** none · **Files:** Create `tools/colony-economy/report.ts` (WS5's, not in CI) from the harness at
`ws5-health-proto` e3ea0a3c (`tools/ws5-health-sim/measure-health.ts`), without its prototype switches.
- [ ] **Step 1: Build the report**: the same 10 seed-1 games as `pnpm sim -- --games 10 --seed 1` (4 trader seats,
  rotating personas, walking on), politics off and on. Rows: posted price min/median/max per good; months at the 12×
  ceiling; store sold out (Food, Water, Energy, Electronics); colonists short of Food / Water / Medicine; hungry
  seat-months; colonists at the end; farm-months switched off for Energy; the between-player share of Food, Water
  and Energy units; the quoted spread p50; Electronics works built and Rare earth / Alloy made. Later PRs add their
  rows (Tasks 3.2, 6.5, 10.4).
- [ ] **Step 2: Run it on PR-1's base** (`node --import tsx tools/colony-economy/report.ts base > base.txt`, or
  `pnpm --filter @mule/ai exec tsx ../../tools/colony-economy/report.ts base`), and check it reproduces WS5's last
  measured trunk numbers where trunk hasn't moved (colonists at the end about 72). Paste the table into PR-1's body
  and STATUS. Every later sim check compares against this base or a newer one, never the specs' Today numbers.
- [ ] **Step 3: Commit** `chore(tools): the colony-economy report, measured on the base`.

### Task 1.1 — freeze the pricing §3 contract; one selling price on every screen
**Depends on:** 1.0 · **ACs verified:** pricing T-AC-2 (contract), pricing T-AC-6 · **Spec:** pricing §3, HC-3,
HC-5, §1 C2, §6 T-AC-6
**Files:** Modify `packages/engine/src/economy.ts` (`storeQuotes`, new `expectedOffWorld`),
`packages/engine/src/types.ts` (`Store.lastWalk` with `highTrade`), `packages/engine/src/auction.ts::comeUp` (its
lines from `storeQuotes`), `apps/web/src/table/TableApp.tsx::MarketTiles` (WS4 named edit). Tests:
`packages/ai/test/store-quotes-contract.test.ts` (new), `packages/engine/test/store.test.ts`, one under `apps/web/test/`.
- [ ] **Step 1: Write the failing test `price T-AC-2: at upkeep, outlook's next-month price is the store's own rule on its stage`**
  Altitude: contract (the AI's view against the store's rule). Observed at upkeep (every walk done):
  `outlook(...).price(g)` against `nextPostedPrice(stage, g)`, and the stage's `store.lastWalk` against the state's,
  every good, 20 seeded games. Never compare with the next posted price (production moves between). Also pins §3's
  null semantics (`sell` null exactly when `storeForSale` is 0, `buy` exactly when `storeWants` is 0) and that
  `expectedOffWorld(state, g, k)` equals `store.offWorld[g]` until PR-4.
- [ ] **Step 2: Write the failing test `price T-AC-6: one selling price: storeQuotes equals comeUp's lines`**
  Altitude: engine, `packages/engine/test/store.test.ts`. Observed at the state each good comes up in, 20 seeded
  games; assert the sample holds at least one short Food or Water shelf (no vacuous pass). The TV half (altitude:
  screen, `apps/web/test/`): one `MuleView` with a short Food shelf rendered as the TV's planning screen and as the
  phone's MarketStrip shows the same Food selling price, `storeSells`, not the posted price (`—` when null).
- [ ] **Step 3: Run both** — `pnpm --filter @mule/ai exec vitest run test/store-quotes-contract.test.ts`,
  `pnpm --filter @mule/engine exec vitest run test/store.test.ts`, `pnpm --filter @mule/web exec vitest run <the new test>`
  → FAIL (`expectedOffWorld` not exported; the short-shelf lines differ; the TV shows posted).
- [ ] **Step 4: Implement pricing C2's extract and the §3 contract** per pricing spec §1 C2 and §3. Mechanism:
  extract (comeUp's inline quote moves into `storeQuotes`, today's numbers kept, so the existing auction tests stay
  green untouched). The TV tiles show `r.storeSells`; the tile layout is unchanged (no mock). Two readers change on a
  short shelf, by design: the hub strip and the colony fund (`colony.ts::fund`, WS7's): name it to WS7 in the body.
- [ ] **Step 5: Run** the three tests plus `pnpm --filter @mule/engine exec vitest run test/store.test.ts test/auction.test.ts` → PASS.
- [ ] **Step 6: Commit** `refactor(engine): one store quote and the AI price contract; the TV shows the selling price (verifies T-AC-2, T-AC-6)`.

### Task 1.2 — every copy of the spread calls `storeQuotes` (pricing HC-3)
**Depends on:** 1.1 · **Spec:** pricing §1 C2 call sites, HC-3
**Files:** `economy.ts::colonistDemand`, `upkeep.ts` (the colonists' price), `packages/ai/src/outlook.ts::rollForward`,
`strategist.ts::expectedPrices`, `value.ts::cashReserve`.
- [ ] **Step 1: Write the failing test `price HC-3: no copy of the store spread outside economy.ts`** — a source
  scan like `packages/ui/test/engine-imports.test.ts`: `PRICE.storeSpread` and `PRICE.restockPremium` appear in no
  file but `economy.ts` and `config.ts`. Run → FAIL.
- [ ] **Step 2: Replace each copy with the `storeQuotes` reading it means** (pricing §1 C2's list). Plan-drift:
  where a copy priced a good the store has none of (sell null), keep today's fallback through one exported helper in
  `economy.ts`, never a new copy.
- [ ] **Step 3: Run** `pnpm --filter @mule/engine test && pnpm --filter @mule/ai test` → PASS.
- [ ] **Step 4: Commit** `refactor: the AI and the colonists price the store through storeQuotes (pricing HC-3)`.

### Task 1.3 — pricing C5: the walk keeps each good's sold-out high, highest trade and dry budget
**Depends on:** 1.1 · **ACs verified:** pricing T-AC-3 · **Spec:** pricing §1 C5 (AM-5), §3 the rule-E seam
**Files:** `packages/engine/src/auction.ts` (where a unit trades between players; `finishGood`). Test:
`packages/engine/test/auction.test.ts`.
- [ ] **Step 1: Write the failing test `price T-AC-3: a unit traded before the shelf emptied never sets soldOutHigh`**
  plus: a unit at 90 while `storeForSale` is 0 sets `soldOutHigh` 90; `highTrade` is the walk's highest
  between-player unit price whatever the shelf; `dryBudget` exactly as §3. Altitude: unit at the auction's step
  functions; observed at `store.lastWalk[g]` after `finishGood`. Rule E (#503, WS3) may not be on trunk: then build
  the sold-out units by hand in the test, not by the board.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine exec vitest run test/auction.test.ts` → FAIL.
- [ ] **Step 3: Implement pricing C5** (sprout beside `between`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): the walk keeps each good's sold-out high and highest trade (verifies T-AC-3)`.

### Task 1.4 — pricing C1 and C2: the bands, the moves and the band spreads (RULE-5, RULE-6, RULE-7)
**Depends on:** 1.2, 1.3 · **ACs verified:** pricing B-AC-1, B-AC-3, B-AC-4, B-AC-7, B-AC-8, B-AC-9, T-AC-5 ·
**Spec:** pricing "Rework, 6 Nov" (RULE-5..7, the Food month table), §1 C1, C2, C7 (AM-5), HC-2, HC-4
**Files:** `economy.ts::nextPostedPrice`, `postPrices` (reads then clears `lastWalk`), `storeQuotes` (band spread),
`config.ts` PRICE. Tests: `packages/engine/test/store.test.ts`, new `packages/engine/test/price-bands.test.ts`.
- [ ] **Step 1: Write the failing test `price T-AC-5: RULE-6 as a decision table`** — altitude: unit (a pure
  classification with many combinations): every row, first match wins; D = 0 → off-world; colonists short at the
  last upkeep → severe whatever M; P ≥ D → normal with M < 2; stock = `colonySupply` (shelf plus depots).
- [ ] **Step 2: Write the failing tests price B-AC-7, B-AC-8, B-AC-9, B-AC-1, B-AC-3 and B-AC-4:** `price B-AC-7`
  (each band's mid from the Food month table), `price B-AC-8` (120 → 90, 68, 51, 38, 30, never below N), `price B-AC-9` (shortage 60 and a trade at 95 → 78; negative: a trade at
  or under the store's selling line pulls nothing), `price B-AC-1` (sold out and bid to 90 → next Food sell line ≥ 90;
  negative: a 90 trade while the store still had Food sets no floor), `price B-AC-3` (nothing posted above 12× its
  reference; Food ≤ 360) and `price B-AC-4` (Food lines 25/35, 32/46, 54/75, 108/150; negative: while
  `colonistBudget` exists the Food buy line stays under the colonists' cap).** Altitude: promise at
  `store.posted` and at comeUp's `storeBuy` / `storeSell` when the good next comes up; build every state with the
  engine's own functions (createGame, players' depots, a staged walk), never by hand-setting `posted`.
- [ ] **Step 3: Run** `pnpm --filter @mule/engine exec vitest run test/price-bands.test.ts test/store.test.ts` → FAIL.
- [ ] **Step 4: Implement pricing C1 (RULE-5..7) and C2's band spreads, and C7's PRICE values** per the pricing
  spec's rework section and AM-5. Mechanism: in_place. Order inside `nextPostedPrice`: band target, move (up
  straight, down by `fallStep`, floor N), trade pull, sold-out floor, ceiling, round. P is the plots' expected output
  (`production.ts::rawOutput`, `factoryFit(...).output`), never re-derived. Plan-drift: the restock-premium test
  (T-AC-13 in store.test.ts) is rewritten to the band lines; its promise (the store bids up for a short shelf) stays.
  `PRICE.storeSpread` and `restockPremium` go once the HC-3 scan shows nothing reads them.
- [ ] **Step 5: Run** `pnpm --filter @mule/engine test && pnpm --filter @mule/ai test` → PASS; T-AC-2 still green.
- [ ] **Step 6: Commit** `feat(engine): the store prices by the colony's months of cover, in four bands (verifies B-AC-1, B-AC-3, B-AC-4, B-AC-7..9, T-AC-5)`.

### Task 1.5 — pricing C6: the store's Energy target counts the MULEs players will add
**Depends on:** 1.4 · **Spec:** pricing §1 C6 (AM-3)
**Files:** `economy.ts::monthlyDemand` (the Energy line), `config.ts` (`PRICE.energyPerNewMule`). Test: `store.test.ts`.
- [ ] **Step 1: Write the failing test `price C6: a month with two new land MULEs raises the Energy target by 2 × energyPerNewMule`**
  (altitude: unit at `storeWants`; plants excluded from the mean, AM-17 ruling A) → FAIL.
- [ ] **Step 2: Implement pricing C6** (in_place) → PASS. **Step 3: Commit** `feat(engine): the store's Energy target counts new MULEs`.

### Task 1.6 — the sim checks (pricing T-AC-4, UBER-AC-1, UBER-AC-2) and the colonist risk
**Depends on:** 1.5 · **ACs verified:** pricing T-AC-4
- [ ] **Step 1: Run `pricing T-AC-4`**: `pnpm sim -- --games 200 --players 4` on the base and on PR-1's head, plus
  the report (Task 1.0) → expect: 0 posted prices above the ceiling and 0 sold-out-floor violations (UBER-AC-1); the
  quoted spread wider than 20% every good-month and the between-player share of Food, Water and Energy above the
  base (UBER-AC-2). Report colonists short of Food and Water against the base: a rise goes to the PM as a finding
  for Heiko (pricing §7), never a silent tune. Paste both tables into the PR body.
- [ ] **Step 2: Commit** the report rows if any were added `test(tools): the report's price rows (verifies T-AC-4)`.

### Task 1.7 — the rulebook (Heiko's rulebook rule; pricing §5, AM-1)
- [ ] **Step 1:** Read `docs/rulebook/WRITING.md`; in `store-and-prices.html#store-pricing-design` turn the
  "Designed, not in the game yet, WS5" entries PR-1 builds into "In the game" (the bands, the moves, the spreads, the
  sell-out floor, the trade pull, the ceiling, one selling price); `table-and-phones.html`: the tiles show the
  selling price. Run `node docs/rulebook/build-index.mjs` → exit 0.
- [ ] **Step 2: Commit** `docs(rulebook): the store's prices as built in PR-1`.

### PR-1 merge gate
- [ ] Every AC in the PR-1 row has a green test named after it; each failing-test commit precedes its implementation.
- [ ] Pricing T-AC-2 green on the consumer side (packages/ai), not only the producer's.
- [ ] The TV test drives the planning screen from a view and asserts the selling price (Step 1b's front half; the
  back half is T-AC-6's engine equality).
- [ ] `pnpm typecheck && pnpm test` exit 0, counts at or above the base line (checklist).
- [ ] The HC-3 scan green; `PRICE.storeSpread` and `restockPremium` gone.
- [ ] The sim and report tables, base vs PR-1, in the PR body.
- [ ] Named-edit OKs on the SHA through the PM: WS1, WS3, WS4.
- [ ] One review by an independent reviewer agent once CI is green (rules and money figures); its verdict line in the
  body worded exactly `Review: APPROVE at <sha>`.
- [ ] Rulebook updated, build-index run.

## PR-2 · colonists eat free; no wages (needs G-2) — WS7 builds; P-1 needs WS7's OK first

### Task 2.1 — needs C1: the colonists' meal takes from the shelf and pays nothing
**Depends on:** PR-1 merged into the integration branch · **ACs verified:** needs B-AC-4, T-AC-6 · **Spec:** needs
§1 C1, RULE-1, HC-2, HC-3
**Files:** `upkeep.ts::runUpkeep`. Tests: `packages/engine/test/upkeep.test.ts`.
- [ ] **Step 1: Write the failing tests `needs T-AC-6: RULE-1's cases (need 0 → s 0; stock 0 → s 1; no credits move)`**
  (altitude: unit) **and `needs B-AC-4: Food posted at 300 and the shelf holding their need, they are fed in full and store.capital is unchanged by their meal`**
  (altitude: promise at GameState after `runUpkeep`). Run → FAIL.
- [ ] **Step 2: Implement needs C1** (in_place; record need and took per good in the month report). Run → PASS.
- [ ] **Step 3: Commit** `feat(engine): colonists take their Food and Water from the store, free (verifies needs B-AC-4, T-AC-6)`.

### Task 2.2 — needs C2: the wage budget goes, and with it pricing HC-4's cap
**Depends on:** 2.1 · **ACs verified:** needs T-AC-7 · **Spec:** needs §1 C2, pricing HC-4 (AM-5)
- [ ] **Step 1: Write the failing test `needs T-AC-7: colonistBudget exists nowhere in packages/engine/src, and the store's lines read no colonist wage`**
  (a source scan plus an auction test: a short Food shelf's buy line is the band's, with no wage ceiling) → FAIL.
- [ ] **Step 2: Implement needs C2** (delete; `economy.ts::colonistDemand` counts the full need; `storeQuotes`
  drops the colonists' cap; `outlook.ts`'s read goes). Run engine + ai tests → PASS; the price-bands tests' HC-4
  negative case is deleted with the cap it guarded (pricing AM-5).
- [ ] **Step 3: Commit** `feat(engine): colonists have no wages; the store's bid has no wage cap (verifies needs T-AC-7)`.

### Task 2.3 — needs C6: the month-end line says how much they got
**ACs verified:** needs B-AC-1 (the line half; its mood and growth half is PR-7's)
- [ ] **Step 1: Write the failing test `needs B-AC-1 (line): colonists given 19 of 20 Food read "19 of 20 Food" on the month-end line`**
  (altitude: server view + `MonthEnd.tsx` render) → FAIL. **Step 2: Implement needs C6's wording** → PASS.
- [ ] **Step 3:** Rulebook `colony-and-politics.html` (the meal, no wages) + build-index. **Step 4: Commit** `feat: the month-end line says how much the colonists got`.

### PR-2 merge gate
- [ ] needs B-AC-4, T-AC-6, T-AC-7, B-AC-1 (line) green and named; tests first; typecheck + test exit 0.
- [ ] The report (Task 1.0) on PR-2's head vs PR-1's: colonists short of Food/Water and colonists at the end, in the body.
- [ ] OKs: WS1, WS3. One independent review, `Review: APPROVE at <sha>`. Rulebook updated.

## PR-3 · the colonists' Electronics want reaches its inputs (decision 27, needs C17)

### Task 3.1 — needs C17 (RULE-13)
**Depends on:** PR-1 (the bands; without them the price runs away) · **ACs verified:** needs B-AC-15, T-AC-25 ·
**Spec:** needs §1 C17, RULE-13
**Files:** `economy.ts::monthlyDemand`, `config.ts` (`UPKEEP.colonistsPerElectronics` 50). Test:
`packages/engine/test/demand.test.ts` (new or the existing demand test file).
- [ ] **Step 1: Write the failing tests `needs B-AC-15: 200 colonists add 4 Electronics, 4 Rare earth and 4 Alloy to the demand, and Electronics leaves the off-world band`**
  (altitude: promise at `monthlyDemand` as `postPrices` reads it, and the band `postPrices` picks) and
  `needs T-AC-25: the inputs follow RECIPES.electronics.inputs under a test override` (unit). Run → FAIL.
- [ ] **Step 2: Implement needs C17** (in_place) → PASS.
- [ ] **Step 3: Commit** `feat(engine): the colonists' Electronics want is store demand, down to its inputs (verifies needs B-AC-15, T-AC-25)`.

### Task 3.2 — what the signal does, measured
- [ ] **Step 1:** Add the report rows (Electronics price by month, works built, Rare earth and Alloy made) and run it
  on PR-3's head. Expected: Electronics in the severe band (880) while nobody makes it, never at 2,640. If no seat
  builds a works in 10 games, that is WS9's chain finding, sent to the PM with the numbers (Heiko's ruling: the price
  is the signal), not a tune here.
- [ ] **Step 2:** Rulebook `store-and-prices.html`: the Electronics demand, "In the game"; build-index.
- [ ] **Step 3: Commit** `docs(rulebook): Electronics demand as built`.

### PR-3 merge gate
- [ ] needs B-AC-15, T-AC-25 green; typecheck + test exit 0; the Electronics rows in the body; OK WS1; one
  independent review (`Review: APPROVE at <sha>`); WS9 told through the PM the day it merges (their chain build waits on it).

## PR-4 · off-world prices swing; the MULE factor gets a cap (pricing G-3) — carried from the old plan's PR-2

### Task 4.1 — pricing C3: the seeded off-world walk (RULE-3)
**Depends on:** PR-3 · **ACs verified:** pricing T-AC-1, B-AC-5 (rule half) · **Spec:** pricing §1 C3, RULE-3, HC-1
**Files:** `economy.ts` (new `stepOffWorld`), `config.ts` (new OFF_WORLD), `game.ts` (the call where `state.month++`).
Test: `packages/engine/test/off-world.test.ts` (new).
- [ ] **Step 1: Write the failing tests `price T-AC-1: the same seed gives the same off-world path, and every other draw is unchanged`**
  (one seeded game with the walk on and with OFF_WORLD sigma 0: the events, map and AI draws are equal) and
  `price B-AC-5 (rule): Crystite stays in 40–300; the others within ±50% of their reference` (unit, 1,000 seeded
  months). Run → FAIL.
- [ ] **Step 2: Implement pricing C3 and C7's OFF_WORLD block** (sprout; Box–Muller from `createRng(seedOf(seed,
  month, 'offWorld', good)).next()`; plan-drift: `seedOf` is private in `events.ts` today: export it there or move it
  to `rng.ts`, never copy it). Run → PASS.
- [ ] **Step 3: Commit** `feat(engine): export goods' off-world prices walk from seeded draws (verifies price T-AC-1)`.

### Task 4.2 — `expectedOffWorld` follows the walk
- [ ] **Step 1:** Change pricing T-AC-2's off-world half to §3's example (160 → 134 in one month, 109 in three) → FAIL.
- [ ] **Step 2:** Implement the expected path (pure, never draws) → PASS. **Step 3: Commit** `feat(engine): the AI reads the off-world walk's expected path`.

### Task 4.3 — pricing C4: the MULE factor cap (RULE-4)
**Files:** `game.ts` (the muleFactor step, game.ts:552 on trunk), `config.ts` (`MULE.maxFactor` 2.0).
- [ ] **Step 1: Write the failing test `price B-AC-6: after many sold-out months the factor is at most 2.0 and Smithore at most its ceiling`**
  (altitude: promise at `mulePrice` after real month transitions with an empty corral) → FAIL.
- [ ] **Step 2: Implement pricing C4** → PASS. **Step 3: Commit** `feat(engine): the MULE sell-out surcharge stops at 2x (verifies price B-AC-6)`.

### Task 4.4 — pricing UBER-AC-3 by sim, and the rulebook
- [ ] **Step 1: Run `price B-AC-5` at its sim altitude**: add the report row (Crystite median, share above 200,
  ≥ 280, ≤ 50; MULE price p50/p90/max) and run `pnpm sim -- --games 200 --players 4` → median 85–95, never outside
  40–300, above 200 under 5%, ≥ 280 under 1%, ≤ 50 under 5%. Paste into the body.
- [ ] **Step 2:** Rulebook: the ship's prices move, the MULE cap; build-index. **Step 3: Commit** `docs(rulebook): off-world prices and the MULE cap as built`.

### PR-4 merge gate
- [ ] pricing B-AC-5, B-AC-6, T-AC-1 green and named; typecheck + test exit 0; the sim table in the body.
- [ ] OKs: WS1 (economy, config, events if seedOf is exported there), WS3 (game.ts). One independent review. Rulebook.

### Gate: end of milestone A (the PM's batch to trunk)
**Done 7 Nov:** milestone A is on trunk, batch 79 (#673, 7ecddae5), from #630 at 326696a1. That head had `Review: APPROVE at 326696a1` from a fresh integration review, and full CI green (check, e2e, e2e-regression, sim). The gate's 40-game table is in #630's body. Heiko kept C6 and picked the MULE at 4× with a 25% climb (AM-8). WS9 was told C17 is on trunk, and WS1 re-measures the MULE price.
- [x] PR-1 … PR-4 merged into `ws5-colony-economy`, each through its gate.
- [x] `pnpm typecheck && pnpm test` exit 0 on the integration branch; CI green on the batch (check, e2e,
  e2e-regression, sim).
- [x] The report on the integration head vs the base (Task 1.0) in the batch body: prices, sold-out months,
  colonists short, colonists at the end, Electronics.
- [x] PR-1 never reaches trunk without PR-2 (PM, 6 Nov): with the real PR-2 merged, the same 10 seed-1 games, politics
  on, against Task 1.6's table: colonists at the end, months short of Food or Water, hungry seat-months, mood, and
  AI Food sold (WS9's watch row). Run it twice, with and without pricing C6 (Task 1.5's three commits reverted
  locally): on 40 games, C6 cut farm-months without power from 40.4% to 31.8% but colonists at the end fell from
  77.5 to 71.7 (politics on, PR-1 without PR-2). Both runs on 40 games, seed 1, politics off and on, with the
  colony score median beside the colony rows (PM, 6 Nov). Heiko keeps or drops C6 from that pair.
- [x] The MULE price (WS1, 6 Nov; WS1 re-measures after the batch lands): on 40 games, seed 1, base vs head, the
  MULE price p90 (the sim's target is under 500; the base gives 679 on trunk 773f96b5); a MULE's Worth price at
  the game's end (month 12, after the auction re-posts Smithore: what a MULE counts in the final score) ÷ the
  month-1 development price (the base median is 9.99×, 18 of 40 games at 10× or more, max 83×; not the last
  development price, which reads 6.0×); and the MULEs' share of a seat's Worth, month 1 vs month 12 (base 10% →
  46%). Definitions: WS1's `.handover/ws1-findings/2026-11-07-mule-value.md`, "Month-12 to month-1 ratio". The cap comes from
  PR-1's Smithore ceiling (12× reference) and PR-4's `MULE.maxFactor` together: 2.0 as built, 4.0 with `MULE.scarcityUp` 0.25 since AM-8 (Heiko's pick, #637).
- [x] Every rulebook chapter the milestone touched reads "In the game" for what it built.
- [x] The PM batches it to trunk; WS5 tells WS9 that C17 is on trunk.

---

## Milestone B · supply, hardship and health, tuned in one pass (PR-5 … PR-12, one batch; needs HC-14)

Nothing in milestone B merges to trunk alone. Each PR still has its own gate into the integration branch.

## PR-5 · the supply pass's first job: power from month 1, and a Medicine supply (WS1, G-5 C29)

WS1 plans and builds PR-5 under its own G-5 C29 work (decision 2: power first; plants from month 1 through the
starting Energy and the computer players' first plot; WS9 builds the AI half). This plan fixes the two spikes' stop
conditions and the gate milestone B needs from it.

### Spike S1 — a power supply from month 1
**Timebox:** 0.5 day · **Owner:** WS1 (WS9 for the AI's first plot)
**Stop condition:** confirmed yes: a lever (starting Energy, the AI's first plot a plant, or both) under which the
10 seed-1 games switch farms off for Energy in under 15% of farm-months (44% on trunk, WS5's measurement) → Task 5.1
proceeds · confirmed no → the PM takes it to Heiko with the numbers (decision 2's premise fails).
- [ ] **Step 1:** WS1 tries the levers in a throwaway branch with the report (Task 1.0) and records farm-months off
  for Energy, colony Food a month, hungry seat-months, colonists at the end.
- [ ] **Step 2:** Record the outcome in WS1's plan and in this plan's STATUS line, with the chosen lever.

### Spike S2 — a Medicine supply that covers the colonists
**Timebox:** 0.5 day · **Owner:** WS1 with WS9 · **Runs after:** S1 (on its lever)
**Stop condition:** confirmed yes: a lever under which, with the health rule AND the Electronics want on in the
prototype harness (`ws5-health-proto` e3ea0a3c, mode `healthE`) and WS9's chain fix applied on the same base, the
colonists are short of Medicine in fewer than 40 of 120 months (110 with health on and today's supply, WS5; 106 in
WS7's m26 on the same base) → health can switch on after PR-12 (HC-13) · confirmed no → milestone B ships with health
built and OFF, and the PM takes decision 23's premise to Heiko.
**Measured risk R1 (WS9, via the PM, 6 Nov).** WS9's chain fix moves seats from Medicine works to the Electronics
chain: seat-months working a Medicine works fall from 207 to about 30 under `healthE`. That hits this gate head on, so
S2, Task 10.4's health-on run and T-AC-28 are always measured with the chain fix and `healthE` together, never one
without the other. If the chain fix leaves no lever under 40, the trade (Electronics chain vs Medicine) goes to Heiko
through the PM as a decision, with both tables.
**Measured risk R2 (WS9).** Electronics gets dear only in months 9–12, when a MULE costs 300–7,357 and Smithore is
short, so the chain loses money anyway. PR-4's MULE factor cap (2.0) and PR-1's ceiling bound the MULE price; Task
3.2 and S2 report the MULE price p50/p90/max beside the Electronics rows, so WS9's table and ours read the same months.
- [ ] **Step 1:** WS1/WS9 try the levers (labs from early months, the AI valuing Medicine, starting Medicine) and record
  Medicine-short months, the mean sick share, months at the cap.
- [ ] **Step 2:** Record the outcome as S1's.

### Task 5.1 — WS1 builds the chosen levers (its plan's tasks)
- [ ] **Step 1:** WS1's PR-5 lands in `ws5-colony-economy` with its own tests and the report table in the body. This
  plan's only requirement: Gate A→B below is met on PR-5's head.

### Gate A→B (PR-5's exit; before PR-6 merges)
- [ ] Farm-months switched off for Energy under 15% in the 10 seed-1 games (S1's line), measured on PR-5's head.
- [ ] S2's outcome recorded (yes or no), so PR-13's fate is known before tuning starts.

## PR-6 · each kind of plot eats and drinks its own amount; the store's demand from it (needs C10–C13)

### Task 6.0 — settle the Water column with WS1 before building it
**Depends on:** PR-5 · the open question noted at `docs/rulebook/production.html#plot-consumption`: the table's Water
against WS1's 5 Nov Water-use design.
- [ ] **Step 1:** Put both to WS1 through the PM with the measured Water rows (needs §1 WS5's measurement: Water
  demand +30%). Stop: an agreed column in writing, or a PM ruling. Record it as needs §8 AM-2 on `ws7-colony-needs`
  (WS5's section). Only config numbers may change; the rule (RULE-10) does not.

### Task 6.1 — needs C10, C11: one CONSUMPTION table read through needsOf and energyUseOf
**ACs verified:** needs B-AC-10, B-AC-11, T-AC-20, T-AC-22 · **Spec:** needs §1 C10, C11, RULE-10, HC-10
**Files:** `production.ts` (needsOf, crewOf, energyUseOf, runProduction's factory draw), `config.ts` (CONSUMPTION).
Tests: `packages/engine/test/consumption.test.ts` (new), `production.test.ts`.
- [ ] **Step 1: Write the failing tests `needs T-AC-20` (RULE-10's examples, every CONSUMPTION row summed exactly in
  quarters, a lone green belt, HC-10's config guard) and `needs T-AC-22` (an Alloy works with 3 Energy in stock and
  use 3 runs; with 2 it is turned off, AM-17)** (unit), and **`needs B-AC-10` (the miner's household eats 4 and drinks
  3, the farmer's 3 and 3; a seat with no plots 2 and 1) and `needs B-AC-11` (an Electronics works' owner loses the
  recipe's Energy plus 2; turned off, only its share)** (promise at the depots around upkeep / production). Run → FAIL.
- [ ] **Step 2: Implement needs C10 and C11** (in_place; the factory run draws `energyUseOf × cold`, needs C11's
  prototype finding). Plan-drift: engine tests that pin the old crew sums change; name each in the PR body. Run → PASS.
- [ ] **Step 3: Commit** `feat(engine): each kind of plot eats, drinks and burns its own amount (verifies needs B-AC-10, B-AC-11, T-AC-20, T-AC-22)`.

### Task 6.2 — needs C12: the AI asks the engine (needsWith)
- [ ] **Step 1: Write the failing test `needs T-AC-21: no crewPerFood, crewPerWater, UPKEEP.crew or energyUse outside config history; value.ts asks needsWith`**
  (source scan) → FAIL.
- [ ] **Step 2: Implement needs C12** (extract `needsWith` beside `needsOf`; `value.ts` and `manual.ts`'s sentence
  use it) → PASS; `pnpm --filter @mule/ai test` green. **Step 3: Commit** `refactor(ai): the AI plans crews' upkeep through needsWith (verifies needs T-AC-21)`.

### Task 6.3 — needs C13: the store's demand is players + crews + colonists (RULE-11)
- [ ] **Step 1: Write the failing test `needs B-AC-12: 4 seats of "3 farms + well" and 100 colonists, Food posted at 300 → the store's Food demand is 17; a festival adds on top`**
  (promise at `monthlyDemand` as `postPrices` reads it) → FAIL.
- [ ] **Step 2: Implement needs C13** (in_place; the Medicine line keeps today's factor until PR-10) → PASS.
- [ ] **Step 3: Commit** `feat(engine): the store's demand counts every plot's crew and the colonists' full need (verifies needs B-AC-12)`.

### Task 6.4 — the rulebook
- [ ] **Step 1:** `production.html#plot-consumption` → "In the game" with the settled Water column; build-index.
  **Step 2: Commit** `docs(rulebook): consumption per kind of plot as built`.

### Task 6.5 — `needs T-AC-23` by sim
- [ ] **Step 1: Run `needs T-AC-23`**: `pnpm sim -- --games 10 --seed 1`, politics off and on, and the report:
  Water demand's 12-month mean rises from about 13 to 16–17 (or as Task 6.0 settled); hungry seat-months rise no more
  than 3%. Paste into the body. **Step 2: Commit** any report rows.

### PR-6 merge gate
- [ ] needs B-AC-10..12, T-AC-20..23 green and named; tests first; typecheck + test exit 0.
- [ ] OKs: WS1 (production, config, economy, value.ts), WS2 (manual.ts). One independent review. Rulebook.

## PR-7 · the colonists' hardship: curve, memory and an immediate blow (needs C3–C5) — WS7 builds

### Task 7.1 — needs C3: the mood reads how short they went (RULE-2..4)
**ACs verified:** needs T-AC-1, T-AC-2, T-AC-3, B-AC-2, B-AC-3 · **Spec:** needs §1 C3, RULE-2..4, HC-1, HC-4, HC-5
- [ ] **Step 1: Write the failing tests `needs T-AC-1` (the curve g), `needs T-AC-2` (the memory), `needs T-AC-3`
  (the step before the shock)** (unit) **and `needs B-AC-2` (mood 60 short 10 of 20 → 56), `needs B-AC-3` (fed
  the next month → 59)** (promise at GameState after upkeep). Run → FAIL.
- [ ] **Step 2: Implement needs C3**; export the curve `g` from `colony.ts` (PR-8 and PR-9 import it). Run → PASS.
- [ ] **Step 3: Commit** `feat(engine): hardship moves the mood by how short the colony went (verifies needs B-AC-2, B-AC-3, T-AC-1..3)`.

### Task 7.2 — needs C4 and C5: growth by shortfall, unrest odds by memory
- [ ] **Step 1: Write the failing tests `needs T-AC-4` (RULE-5's rows and examples), `needs T-AC-5` (RULE-6),
  `needs B-AC-1` (19 of 20: mood unchanged, +4%) and `needs B-AC-5` (politics off short 10 of 20: −5%, no mood)** → FAIL.
- [ ] **Step 2: Implement needs C4 (growthRate in upkeep.ts, folds C27) and C5 (events.ts::influences)** → PASS.
- [ ] **Step 3: Commit** `feat(engine): the colony grows or shrinks by its shortfall; hardship raises the unrest odds (verifies needs B-AC-1, B-AC-5, T-AC-4, T-AC-5)`.

### Task 7.3 — needs C6's red, the rulebook
- [ ] **Step 1:** The month-end line turns red past tolerance (the style on PR-2's line); rulebook
  `colony-and-politics.html` → "In the game"; build-index. **Step 2: Commit**.

### PR-7 merge gate
- [ ] needs B-AC-1..3, B-AC-5, T-AC-1..5 green; typecheck + test exit 0; OK WS1 (upkeep, events, config); one
  independent review; rulebook. Not merged to trunk alone (HC-14).

## PR-8 · crews work slower when short; hunger from the last meal; Food spoils a quarter (needs C14–C16)

### Task 8.1 — needs C14: a crew left short works slower (RULE-12)
**ACs verified:** needs B-AC-13, T-AC-24 · **Spec:** needs §1 C14, RULE-12
**Files:** `upkeep.ts::runUpkeep` (record the crew shortfall), `production.ts::runProduction` (the factor; the dry
halving goes), `types.ts` (`Player.crewShort`), `config.ts` (`UPKEEP.crewDrop` 0.5; `irrigated`, `shortOutputShare`
removed). Tests: `production.test.ts`.
- [ ] **Step 1: Write the failing tests `needs T-AC-24` (RULE-12's examples; no farm halving left: a scan for
  UPKEEP.irrigated and shortOutputShare; the curve imported from colony.ts)** (unit + scan) **and `needs B-AC-13`
  (crews given half their Food → every plot but Energy plants makes 85%, rounded half up; 10% short → nothing)**
  (promise at the month report's production lines). Run → FAIL.
- [ ] **Step 2: Implement needs C14** (in_place, before AM-17's Energy turn-off) → PASS.
- [ ] **Step 3: Commit** `feat(engine): a crew left short works slower; the dry halving goes (verifies needs B-AC-13, T-AC-24)`.

### Task 8.2 — needs C15: hungry from the household's last meal
- [ ] **Step 1: Write the failing test `needs B-AC-14: a household that ate in full and then spoiled below its need is not hungry; one short at upkeep is`**
  (promise at the player's walking pace) → FAIL.
- [ ] **Step 2: Implement needs C15** (in_place: upkeep records the household's meal; `startDevelopment` reads it) → PASS.
- [ ] **Step 3: Commit** `feat(engine): a player is hungry when their household went short (verifies needs B-AC-14)`.

### Task 8.3 — needs C16: Food spoils a quarter a month in a player's stock
- [ ] **Step 1: Implement needs C16** (`GOOD_CONFIG.food.spoilage` 0.25; the store's follows through
  `PRICE.storeSpoilage` as today) with the spoilage test's expected value updated; run the report: hungry
  seat-months and colonists at the end against PR-7's head (measured package: 354 and 80 on the old power).
- [ ] **Step 2:** Rulebook `production.html#food-spoilage-quarter`, `development.html#hunger-last-meal` → "In the
  game"; build-index. **Step 3: Commit**.

### PR-8 merge gate
- [ ] needs B-AC-13, B-AC-14, T-AC-24 green; typecheck + test exit 0; OKs WS1, WS3; one independent review; rulebook.

## PR-9 · colony health: the colonists' side (WS7 builds; decisions 28, 29, 30)

### Task 9.1 — needs C7, C8, C9: the sick share, its mood, growth and Medicine need; the Electronics comfort
**Depends on:** PR-7 (the curve) · **ACs verified:** needs T-AC-8..11, B-AC-6, B-AC-8, B-AC-7 (engine half) ·
**Spec:** needs §1 C7–C9, RULE-7..9 (WS7, 8c9c3957)
- [ ] **Step 1: Write the failing tests needs T-AC-8, T-AC-9, T-AC-10, T-AC-11 (RULE-7..9's rows; health off and politics off inert)**
  (unit) **and needs B-AC-6, B-AC-7 (h never above 0.4; its view half is PR-10's), B-AC-8** (promise at GameState
  after upkeep). The Electronics comfort reads `UPKEEP.colonistsPerElectronics` (PR-3), never a second number. → FAIL.
- [ ] **Step 2: Implement needs C7, C8 and C9** in `colony.ts` / `upkeep.ts`; `HEALTH` lands in `config.ts` with
  `enabled: false` and the names WS5's C18 reads (crewSickFrom 0.2). → PASS.
- [ ] **Step 3:** Rulebook `colony-and-politics.html#colony-health-gauge` stays "Designed" (health is off) with a
  line "built, switched off until Medicine can be had (HC-13)"; build-index. Commit.

### PR-9 merge gate
- [ ] needs T-AC-8..11, B-AC-6..8 (engine) green and named; typecheck + test exit 0; OK WS1 (upkeep, config); one independent review.

## PR-10 · colony health reaches the store, players and crews; the view carries it (needs C18, C19)

### Task 10.1 — freeze `MuleView.colonyHealth` (needs §3)
- [ ] **Step 1: Write the failing tests needs B-AC-18 and B-AC-7 (view half): three Medicine-short upkeeps → { health, medicineShort true, shortMonths 3 }; a month with Medicine → false, 0; health off or politics off → null; at the cap, health 60**
  (altitude: server view test, `apps/server/test/`) → FAIL.
- [ ] **Step 2: Implement needs C19**: the protocol field, the run of short months at upkeep beside WS7's sick share,
  the view in `mule-game.ts` → PASS. **Step 3: Commit** `feat: the view carries colony health and the Medicine-short run (verifies needs B-AC-18)` — WS8 starts PR-11 from this SHA.

### Task 10.2 — needs C18: sickness reaches players and crews (RULE-14, RULE-15)
- [ ] **Step 1: Write the failing tests `needs T-AC-26` (RULE-14 and RULE-15 rows and examples; needsOf's Medicine
  +1 exactly on RULE-15 row 3; no cure copy in packages/ai, scan)** (unit + scan) **and `needs B-AC-16` (h 0.4 →
  the player's sickness chance + 0.10 within the cap; h 0 unchanged) and `needs B-AC-17` (h 0.3, a farm making 4, no
  Medicine → 3; with 1 Medicine → 4 and one Medicine less; h 0.19 → nothing)** (promise at `eventChance` and at the
  month report / depot). Run → FAIL.
- [ ] **Step 2: Implement needs C18** → PASS. **Step 3: Commit** `feat(engine): a sick colony reaches players and crews (verifies needs B-AC-16, B-AC-17, T-AC-26)`.

### Task 10.3 — needs C13's Medicine line reads WS7's health factor
- [ ] **Step 1:** Extend `needs B-AC-12`'s demand test with the Medicine case (h at the cap → the colonists' Medicine
  need +40%; health off → today's) → FAIL. **Step 2:** Replace `POLLUTION.sickMedicineDemand`'s factor with WS7's
  exported factor (needs AM-1) → PASS. **Step 3: Commit**.

### Task 10.4 — `needs T-AC-27`: health off is inert
- [ ] **Step 1: Run `needs T-AC-27`**: the report's 10 seed-1 games with `HEALTH.enabled` false on PR-10's head and
  on PR-8's head → every number equal. Then the same games with health on (a local override, not committed), for the
  body: mean sick share, months at the cap, Medicine-short months, player-sick months, crews sick.
- [ ] **Step 2:** Rulebook (players' and crews' sickness, "built, switched off"); build-index. **Step 3: Commit**.

### PR-10 merge gate
- [ ] needs B-AC-16..18, T-AC-26, T-AC-27 green; typecheck + test exit 0; OKs WS1 (events, production, economy,
  upkeep, config), WS3 (protocol, mule-game); one independent review; rulebook.

## PR-11 · the colony-health gauge on the phone (WS8 builds, from its approved mock)

### Task 11.1 — the gauge and the cause line, from `design/mocks/` at de672e61
**Depends on:** Task 10.1's SHA · **ux:** needs C19 (the mock's states; bands Well ≥ 90 · Sick spell 61–89 · At the
limit 60, WS5's ruling 6 Nov)
- [ ] **Step 1:** WS8 writes a failing front-to-back test of `needs B-AC-18` on the phone: a game whose view carries
  `{ health 88, medicineShort true, shortMonths 3 }` shows "Sick spell" and the cause line; `null` shows no gauge.
  The test command starts its own server and web on free ports and stops them (never the rig).
- [ ] **Step 2:** WS8 grafts the mock's scaffold (`may_edit_content`), wires `colonyHealth` → PASS. Commit.

### PR-11 merge gate
- [ ] The front-to-back test green; WS8's own gate; OK WS5 (the view contract); one independent review.

## PR-12 · one tuning pass (WS1, G-5 C29) — Gate B

### Task 12.1 — tune the milestone's numbers together
- [ ] **Step 1:** WS1 runs the report on the integration head, politics on and off, and tunes config values only
  (CONSUMPTION, HARDSHIP, the supply levers; health stays off) until Gate B holds. Any rule that seems wrong is a
  finding to the PM with the numbers, never a rule change here. The tuned table goes to Heiko through the PM (G-5 HC-25).
- [ ] **Step 2:** Commit `chore(config): the colony economy's first tuned numbers` with the table in the body.

### Gate B: end of milestone B (the PM's batch to trunk)
- [ ] PR-5 … PR-12 merged into `ws5-colony-economy`, each through its gate.
- [ ] needs UBER-AC-1's sim half: the 10 seed-1 games report the mood-band shares before (the base of Task 1.0) and
  after; a colony short 1 of 20 Food keeps its mood (engine test, PR-7).
- [ ] Measured on the integration head, against the base: hungry seat-months below the base and at most 354 of 480
  (the measured package); colonists at the end at least 80 (of 100); farm-months off for Energy under 15%; games
  ending in Unrest no more than the base's.
- [ ] `pnpm typecheck && pnpm test` exit 0; CI green on the batch (check, e2e, e2e-regression, sim).
- [ ] Every rulebook chapter the milestone touched reads "In the game" (health: "built, switched off").
- [ ] The PM batches it to trunk and asks Heiko about main, as for every milestone.

## PR-13 · health on (needs HC-13)

### Task 13.1 — switch health on only if Medicine can be had
**Depends on:** milestone B on trunk; S2 confirmed yes.
- [ ] **Step 1: Run `needs T-AC-28`** on trunk with `HEALTH.enabled` true (a local override) and WS9's chain build
  in (risk R1: measured together, never apart): Medicine-short months < 40 of 120 in the 10 seed-1 games; report the mean sick share, months at the cap, colonists at the end and
  player-sick months. Not below 40 → stop: health stays off; the PM takes the numbers to Heiko.
- [ ] **Step 2:** Set `HEALTH.enabled: true`; rulebook pills for colony health, players' and crews' sickness →
  "In the game"; build-index. **Step 3: Commit** `feat(config): colony health on (verifies needs T-AC-28)`; T-AC-28's
  table in the body. OKs WS1, WS7; one independent review; the PM batches it.

---

<!-- plan-check: no-task B-AC-2 — pricing spec: dropped by AM-5 (Heiko's decision 12, never below normal) -->
<!-- plan-check: no-task C26 C27 C29 C33 C49 A2 A3 — named in the specs' prose as other specs' changes (G-5 C26/C27/C29, C49) or WS7's measured variants A2/A3; not changes of these specs -->

## Pre-implementation checklist
- [ ] Spec approved by the user: explainer v3 approved by Heiko 6 Nov (a28b861b); the pricing spec's AM-5 and the
  colony-needs spec's AM-1 record it. Heiko reads this plan through the PM before PR-1 starts.
- [x] P-1 (the free meal in milestone A) OK'd by WS7 through the PM, 6 Nov.
- [x] WS7 added its colony-health ids (C7–C9) and amended its Medicine non-goal (8c9c3957).
- [ ] The colony-needs spec reaches trunk (it lives on `ws7-colony-needs`) before PR-2 merges.
- [ ] Heiko read the plan summary (PM, 6 Nov; no gate): PR-1 starts unless he objects.
- [ ] Open PRs that touch the same seams known: #503 (rule E, WS3; PR-1's soldOutHigh, stubbable), #525 (C49, WS7;
  `monthlyDemand`), #532 (the grant 450, now 250 by pace option C: not this plan's), WS9's chain build (PR-3's
  atomicity), #457 (WS9, in batch 58).
- [ ] Branch policy: integration branch `ws5-colony-economy` from `feat/strategist`; sub-PRs into it from every lane;
  the PM batches milestone A and milestone B to trunk; never `main`.
- [ ] Base `feat/strategist` @ `38070ffb` green, measured from its CI run 42232416177 (6 Nov 14:22Z): typecheck
  exit 0 · tests exit 0: engine 674 (+1 skipped), ai 574 (+11 skipped), server 577 (+91 skipped), web 993, ui 168,
  tabletop 160 · e2e green · e2e-regression green · sim (4 games × 4 seats) green. Re-measured at PR-1's start
  (Task 1.0), since trunk will have moved.
- [ ] Spike outcomes recorded: S1, S2 (PR-5).
- [ ] Estimate (agent days): PR-1 2 · PR-2 0.5 · PR-3 0.5 · PR-4 1 · PR-5 WS1's · PR-6 1 · PR-7 1 · PR-8 1 · PR-9 1 ·
  PR-10 1 · PR-11 1 · PR-12 1 · PR-13 0.25. Milestone A about 4 days; milestone B about 7 plus WS1's supply work.
