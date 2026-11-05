# Resource utility: what every good is worth to an AI seat

| | |
|---|---|
| Class | **Standard** (Heiko, 5 Nov) |
| Author | WS9 (AI Strategy) |
| Approach | B, one value per unit, the newsvendor per-unit model (Heiko, 5 Nov) |
| Owners | WS1 owns `value.ts` and `strategist.ts` and builds or OKs every edit there. WS9 owns `packages/ai/src/playbook/**`. WS3 owns `packages/engine/src/playbook.ts` (named edit). WS5 owns the store's and the ship's pricing (the §3 contract) |
| Order | WS1's stopgap (ruled A), then WS1's AM-13/AM-17 Energy-rule valuation commit, then WS9's built-state fixtures PR, then this spec's PR-1. PR-1 replaces the stopgap's hard rules and that valuation commit with one model |
| Measured on | trunk f6f3a275 (5 Nov), 40 games × seeds 1/101/201, `pnpm sim` defaults |

## §0 · Business Goals & Value `[handoff: goal lines and proofs; review-only: Who, Today, Value, cost]`

Heiko's words (5 Nov), relayed by the PM:

> "it needs to look at its entire shortage, it needs to understand the overall price level. It needs to get utility from having enough or even a surplus in food… it must know all resources that it needs… all the store prices and how much the current availability is. If prices are cheap and they can store things then maybe having a surplus even makes sense… This should be the base and it can be overruled later with Claude defining strategies."

He added: "later they might even speculate… buy cheap to sell more expensive later. This is what would make them clever."

At the table, after two AIs stood short of Energy with a human selling and the store stocked: "much worse than a food shortage… they were just standing there, not even bidding."

### Measured Today (`verified_by: executed`)

Method:
- 40 games × seeds 1/101/201, 4 trader seats, politics and walking on.
- A logging line in `strategist.ts::tradeDecision` and the production lines in `MonthReport.lines`, in a scratch copy, never committed.

Food and hunger:

| | seed 1 | 101 | 201 |
|---|---|---|---|
| Seat-months entering the Food auction short of next month's need | 86% | 86% | 87% |
| …refused because the next needed unit's value ≤ the store's ask | 76% | 85% | 81% |
| …that value ÷ the ask, median | 0.38 (18.9 / 49 cr) | 0.37 (18.5 / 50) | 0.36 (19.6 / 56) |
| …value below even Food's reference price (30) | 73% | 74% | 71% |
| Seats hungry at development; their median cash | 88%, 1,227 cr | 89%, 1,189 | 89%, 1,176 |
| Food at or below its reference: decisions planning any unit beyond next month's need | 22% | 23% | 16% |

Energy, under the 50% rule (to be re-measured after AM-13):

| | seed 1 | 101 | 201 |
|---|---|---|---|
| Seat-months losing production for want of Energy | 43% | 41% | 40% |
| …the month's output value lost, median (p90) | 37% (72%) | 40% (72%) | 33% (74%) |
| Energy-short seats that decided to buy yet ended the auction short (store stock median 1 unit) | 46% | 44% | 47% |

What the numbers show:
- **Food:** the AI values a needed Food unit only as the walking time hunger costs, priced at `secondValue`.
- **Energy:** it values a unit at 50–60 cr (median), against about 130–140 cr lost per halved plot.
- **WS1's 5-seed reading of 47 Energy no-buys** (store selling, seat able to pay) names three causes:
  - **Forecast risk (30 of 47):** the seat's own plots' forecast was counted as stock in hand, and 20 of the 30 sold to 0.
  - **The reserve circularity (7):** the reserve fenced off the cost of that same Energy.
  - **The decider scoring a pass higher (5).**

### Goals

**G-1 · An AI seat keeps itself supplied.**
- **Goal:** it looks at its whole month's shortage of every resource it needs (Food, Water, Energy, its factories' inputs, Medicine) and buys what it is short of when it can pay, instead of going without. A production-stopping shortage counts at its true weight: Energy short means a seat's next month's output is at stake.
- **Who benefits:** every player at the table, Heiko first. The AI opponents play like sensible colonists.
- **Today:**
  - A seat short of Food refuses in 76–85% of the cases where the store has it, and is hungry at 88–89% of developments holding about 1,200 cr.
  - 40–43% of seat-months lose production for want of Energy, about a third of the month's output when it bites.
- **Value:**
  - No AI starves or stalls with cash in hand, which is the thing Heiko saw.
  - The balance sim's shortage checks measure the economy, not this AI flaw.
- **Proof, UBER-AC-1:** on the sim's three seed sets, measured under AM-13:
  - (a) Take the seat-months where a seat enters a good's auction short of what it needs, the store holds that good, and the seat has cash for the whole shortfall at the store's ask. Fewer than 5% of them end the auction still short.
  - (b) Seat-months with production lost for want of Energy, while the store held Energy and the seat could pay, are under 5%.

**G-2 · It values having enough, and a surplus when that pays.**
- **Goal:** it knows every store price and how much the store holds, judges a price against the price level, and holds more than next month's need when goods are cheap and storable.
- **Who benefits:** the same players. AIs stock up while Food is cheap and ride out a dear month.
- **Today:**
  - A needed unit's value does not move with the price level.
  - Storage counts only as a cut-off.
  - With Food at or below its reference, only 16–23% of decisions plan any surplus.
- **Value:** an opponent that visibly thinks ahead.
- **Proof, UBER-AC-2:** the sim reports each seat's Food held after the auction ÷ next month's need, by price band. On all three seed sets, the median seat holds more than 1.0 when the ask ≤ reference, and no more than 1.0 when the ask ≥ 2× reference.

**G-3 · Later, phase 2: it speculates.**
- **Goal:** under a price belief (from store stock, the trend, events, rivals' output and the off-world prices), it buys cheap to sell dearer later, after spoilage, storage and tax. Persona risk and greed shape the belief, and a Claude playbook can set it.
- **Who benefits:** Heiko ("this is what would make them clever"), and players who get a market worth reading.
- **Today:**
  - Beyond its need, a unit's buy value is the forecast × `speculate` × a risk haircut.
  - Nothing forms a belief.
  - No sim row reports a speculative buy.
- **Value:** clever opponents, and a market the humans can play against.
- **Proof, UBER-AC-3:** the sim reports units bought beyond the seat's need and their realised margin after spoilage, storage and tax. On all three seed sets, seats with a bullish belief make a positive median margin. A playbook that sets the belief changes those buys (T-AC-10).

### Non-goals

- **The store's supply and price formula.** WS5's widened store design owns it; Food supply is C29's finding for Heiko.
- **Balance tuning.** Every number is a config placeholder, reported and never tuned, until the balance phase.
- **Claude's strategies themselves.** This spec defines only where they plug in (§3).
- **New development strategy.** Development changes only where it reads these values.
- **Any UI.**

### Rough cost

- **B (chosen):** about 1–2 weeks over 3 PRs.
- **A (the thin baseline):** about 1–2 days.

## §0.1 Decision Record `[review-only]`

**Chosen, B · one value per unit** (~1–2 weeks, 3 PRs).
- The k-th unit a seat could hold is worth: the chance it's needed × the cost of going short, plus the chance it isn't × what it fetches later.
- One cash shadow price ranks every needed unit across the month's auctions.
- The price belief starts from the engine's own look-ahead.
- A playbook overrides through the belief and per-good targets.

**Thin baseline, A · "needs first"** (~1–2 days): WS1's stopgap widened to every needed good. A seat short of a good buys its shortfall at the store's ask when its cash covers it.

**Why A loses**, falsifiable:
1. UBER-AC-2 fails by construction. Under A, a unit beyond next month's need keeps today's value, resale × keep rate × `speculate` × haircut. With Food at or below its reference, that buys a surplus in only 16–23% of decisions today (measured), and A changes nothing there.
2. A is a rule beside the values. A playbook can switch it off but cannot trade it off against price, which breaks HC-1.

**Larger, C · a month-ahead planner** (~3–4 weeks), lost:
- A 40-game sim makes about 12,000 trade decisions (measured: 11,980 on seed 1). Each would run several multi-month rollouts instead of one `outlook`.
- It duplicates the thinking layer Claude's playbooks are meant to be.

## §0.2 Constraints `[handoff]`

```
HC-1  One value model. A playbook overrides only through §3's named inputs (the
      belief, the hold target, walkAway); no second valuation path, no rule beside
      the values that a playbook can't trade off.
      source: Heiko "the base, overruled later by Claude"        breach: fatal
HC-2  Every number is a named value in packages/engine/src/config.ts (the new
      AI_VALUE block, WS1's); placeholders until the balance phase; `pnpm sim --set`
      sweeps them; config-guard stays green.           source: CLAUDE.md   breach: fatal
HC-3  AI only. No engine rule changes; packages/engine stays pure; a game replays
      from seed + actions.                             source: CLAUDE.md   breach: fatal
HC-4  Behind AI_VALUE.model ('today' | 'unit'), default 'today' until Heiko rules on
      PR-1's measurement. With 'today' the sim is byte-identical to trunk.
      source: PM ruling 5 Nov                                       breach: fatal
HC-5  The engine is the only source of a rule the value reads: needs (monthNeeds,
      needsOf), the Energy turn-off order (AM-13), spoilage, the depot, prices
      (outlook). Never a copy of a formula.   source: two copies drift   breach: decision
HC-6  Every PR's sim report shows the colony's Food/Water shortage beside UBER-AC-1.
      source: PM ruling 5 Nov (colonists buy only from the store)   breach: decision
```

## §1 · Solution Design `[handoff]`

```
C1 · MODIFIED · a unit's value is its expected worth: needed share × short cost + rest × carry

today        value.ts::unitValues: a block of next month's units valued at a per-good
             "use" (Food: walk seconds × 0.67 × secondValue ÷ block; Energy: the
             plots' half output ÷ need; inputs: a factory run share; Medicine: sickness),
             the rest at resale × keepRate (× speculate × haircut for buy), 0 past the
             depot; Energy need is netted against own plots' forecast as if certain.
             verified_by: executed (the §0 measurement) + read
tomorrow     MUST value the k-th unit (k = 0, 1, …) as RULE-1 (keep[k] and buy[k], same
             UnitValues shape), with short cost per RULE-2, need risk per RULE-3, carry
             per RULE-4, reading the belief of C3.
             MUST keep UnitValues' fields (keep, buy, block, need, floorUnits): every
             caller reads them.
logic        → RULE-1, RULE-2, RULE-3, RULE-4 · evaluated at goodPlan and at the draft
             · inputs bind from the observation (obs), the outlook, mind
seam         packages/ai/src/value.ts::unitValues: every trade value and the
             playbook's floorUnits already flow through it.
senior       junior would: add a "short → buy" branch in tradeDecision (WS1's stopgap,
             widened) · senior does: one per-unit value whose short cost floors at the
             replacement price, so tradeDecision's existing "buy while value > ask" loop
             buys the shortfall; reads AM-13's turn-off order from the engine, not a copy.
mechanism    branch_by_abstraction: unitValues dispatches on AI_VALUE.model
             ('today' → today's body unchanged; 'unit' → the new model)
call sites   strategist.ts::goodPlan (strategist.ts:484) ·
             playbook/validate.ts::validatePlaybook's floorUnits (validate.ts:353)
pin          AI_VALUE.model 'today': default, `--plays today` and politics-off sims
             byte-identical to trunk on 1/101/201 (T-AC-9)
depends_on   C3 (the belief; stubbable: outlook.price) · AM-13 engine export of the
             Energy turn-off order (WS1; data, not stubbable for Energy's RULE-2 row)
```

```
C2 · MODIFIED · one cash shadow price across the month's auctions replaces the reserve in trading

today        strategist.ts::goodPlan: budget = min(money × budgetShare, money −
             cashReserve), where cashReserve (value.ts::cashReserve) prices next month's
             Food, Water and Energy shortfall × persona reserve, including the good
             being bought (the circularity); tradeDecision's 'Cash left' consideration
             scores against that reserve, so a pass can outscore a needed buy.
             verified_by: read + WS1's 5-seed reading (7 + 5 of 47)
tomorrow     MUST allocate the seat's cash per RULE-5 across every needed unit of the
             goods still to be auctioned this month (AUCTION.order from the current
             good), and give goodPlan the current good's allocation as its budget.
             MUST score 'Cash left' against the cash still allocated to later goods,
             never against the units of the good being bought.
             MUST derive cashReserve, for its non-auction callers, from the same
             allocation: the cash the month's needed units take at the belief's prices.
logic        → RULE-5
seam         packages/ai/src/strategist.ts::goodPlan and ::tradeDecision; value.ts::cashReserve
senior       junior would: exempt the shortfall from the reserve (the stopgap's rule) ·
             senior does: one λ ranks units across goods, so the 80-cr seat buys its most
             vital units first and the reserve can't fence off the unit it protects.
mechanism    branch_by_abstraction on AI_VALUE.model
call sites   cashReserve: strategist.ts:159 (landDecision), :285 (sellWanted), :342 and
             :385 (developDecision), :493 (goodPlan); hands/lot.ts:72; playbook/draft.ts:175
             (cashFloor) · goodPlan: hands/auction.ts:101, playbook/draft.ts:364 ·
             tradeDecision: hands/auction.ts:104, playbook/draft.ts:365
pin          as C1 (T-AC-9)
depends_on   C1
```

```
C3 · ADDED · the price belief: what the seat expects a good to cost next month

today        outlook.ts::outlook gives the engine's status-quo forecast (price, later);
             unitValues reads it as `P(g)`; nothing tilts it or lets a playbook set it.
             verified_by: read
tomorrow     MUST give, per good, the expected posted price next month per RULE-6: the
             playbook's override if it sets one (§3), else outlook.price (PR-1, PR-2).
             PR-3 MUST add the trend, the announced events (MonthReport.warnings), the
             rivals' output and WS5's price paths, and the persona tilt.
logic        → RULE-6
seam         a function beside outlook in packages/ai/src/outlook.ts (WS1's file, named
             edit), read by C1 and C2 only
senior       junior would: a second forecaster with its own price formula · senior does:
             reads the engine's pricing through outlook (HC-5) and WS5's published paths
             (§3), so a store change reaches the AI with no AI edit.
mechanism    sprout
reuse check  grep "price(\|later(" packages/ai/src → outlook.ts::Outlook.price/later
             (the neighbour, reused as the phase-1 belief); no other forecaster exists.
call sites   C1, C2 (new)
pin          none: new, and with AI_VALUE.model 'today' nothing calls it
depends_on   §3 WS5 price-path contract (PR-3 only; stubbable: outlook.later)
```

```
C4 · MODIFIED · a pass that leaves a fundable shortfall carries its cost

today        strategist.ts::tradeDecision: the 'pass' candidate has gain 0 and full
             'Cash left'; a needed buy can score below it (WS1: 5 of 47).
             verified_by: read + WS1's reading
tomorrow     MUST give every candidate that leaves a needed unit unbought while it is
             funded by RULE-5 a gain of minus that unit's (v − ask), so the Gain
             consideration ranks the buy above the pass; no veto (HC-1).
logic        → RULE-5's outcome
seam         strategist.ts::tradeDecision
senior       junior would: veto pass while short · senior does: the pass's own gain
             carries the shortfall it leaves, so a playbook can still choose it knowingly.
mechanism    in_place, gated on AI_VALUE.model
call sites   hands/auction.ts:104, playbook/draft.ts:365
pin          as C1
depends_on   C1, C2
```

```
C5 · MODIFIED · a playbook sets the belief and the target per good

today        engine/src/playbook.ts::GoodPlay carries role, hold, walkAway, start,
             concedeCrPerS, bluff, vsRival, market; the draft fills them from goodPlan;
             the validator bounds them.   verified_by: read
tomorrow     MUST add GoodPlay.expect?: number, the believed posted price next month
             (§3), drafted from the base belief (C3), bounded by the validator per §3, and
             read by C3 as the override. `hold` stays the target.
seam         packages/engine/src/playbook.ts::GoodPlay (WS3, named edit);
             packages/ai/src/playbook/draft.ts and ::validatePlaybook (WS9)
senior       junior would: let a playbook overwrite unit values · senior does: the
             playbook sets one input (expect) and the base model values everything from it,
             so an override stays inside one model (HC-1).
mechanism    in_place
call sites   draft.ts:364–365 (the good's draft), validate.ts (new bound), C3
pin          playbook v1 shape otherwise unchanged; the record's AM-20 format unchanged
             (optional field)
depends_on   C3
```

```
C6 · MODIFIED · the sim reports the goals' proofs and the colony beside them

today        packages/ai/src/sim.ts: "short of Food or Water" and "hungry 3 months
             running" rows; no per-auction short-and-could-pay row, no surplus band, no
             speculation row.   verified_by: executed
tomorrow     MUST print UBER-AC-1's (a) and (b) rows (PR-1), UBER-AC-2's band row (PR-2),
             UBER-AC-3's speculation row (PR-3), each next to the colony's Food/Water
             shortage (HC-6).
seam         packages/ai/src/sim.ts (WS1, named edit), beside its "short of Food or
             Water" row
mechanism    in_place
call sites   pnpm sim
pin          the new rows print only under AI_VALUE.model 'unit', so with 'today' the
             whole report stays byte-identical to trunk (T-AC-9)
depends_on   C1, C2 (PR-1) · C1 RULE-4 (PR-2) · C3 PR-3
```

```
C7 · ADDED · AI_VALUE, the config block

tomorrow     MUST hold model ('today' | 'unit'), forecastRisk, shortFloorMarkup,
             holdMonths, the belief's tilt weights and bounds (§3), each with unit and
             meaning. Placeholders (HC-2).
seam         packages/engine/src/config.ts, a new block beside STRATEGIST (WS1's)
reuse check  grep "AI_PLANS\|STRATEGIST\|AI_HANDS" config.ts: STRATEGIST holds the
             strategist's weights; a model switch beside them keeps "one block per
             feature" (SEAMS line 17-18). Not folded into STRATEGIST so the switch and
             its placeholders are reviewable as one block.
mechanism    in_place
depends_on   —
```

## §2 · The Logic `[handoff]`

```
RULE-1 · A unit's value                                    shape: formula

inputs     k        the unit's position in what the seat holds after the auction, 0-based
           q(k)     RULE-3: the chance the month needs a k-th unit (0..1)
           S(k)     RULE-2: what going without the k-th unit costs (cr)
           Ck(k)    RULE-4: what the k-th unit is worth if not needed (cr)
formula    v(k) = q(k) · S(k) + (1 − q(k)) · Ck(k)
           keep[k] = v(k) with Ck at the sell side (what it would fetch)
           buy[k]  = v(k) with Ck at the buy side (RULE-4's speculate weight)
           floorUnits = units with q(k) = 1 for Food and Energy (never sold)
boundaries keep and buy are non-increasing in k (sorted, as today)
examples   Food, need 5, 0 held, belief 72, ask 72: q(0..4) = 1, S ≥ 72 → v ≥ 72 → the
           seat buys 5 (today it values them at 32 and buys none) ·
           need 5, k = 7, belief 40 and ask 30, keep rate 0.9: q = 0, Ck = 40 × 0.9 ×
           (1 − tax) − holding → a surplus unit when that beats 30 (G-2)
```

```
RULE-2 · What going without a unit costs                   shape: decision table

inputs     good · k · belief (RULE-6) · the seat's plots and recipes · AM-13's order
first match wins
  #  good                  S(k)
  1  energy                max(replace, 0.8 × output value of the plot AM-13's order
                           turns off at the k-th missing unit, or a factory's whole run)
  2  a factory input       max(replace, the factory run's output value ÷ its input units)
  3  food                  max(replace, today's hunger walking cost)
  4  water                 max(replace, today's half-a-farm share)
  5  medicine              max(replace, today's sickness cost)
  6  any other good        0 (no need)
replace    = belief(good) × (1 + PRICE.storeSpread) × AI_VALUE.shortFloorMarkup: buying it
           back next month, never valued below that
unknown    the order is empty (no plot needs Energy) → row 1 gives replace only;
           the belief is unknown (game ends) → the store's posted price today (outlook.final)
outcome    → C1
examples   Energy, 3 short, plots ranked [factory 2 Energy, farm 1, farm 1]: S(0..1) =
           the factory's run, S(2) = 0.8 × the farm's output
```

```
RULE-3 · The chance the month needs the k-th unit          shape: decision table

inputs     need   monthNeeds(state, seat)[good] (household, plots, inputs, Energy rule)
           held   units it holds now · own   the seat's own forecast output of the good
           risk   persona.risk · AI_VALUE.forecastRisk (0..1)
first match wins
  #  when                          q(k)
  1  k < need − own                1        (a shortfall stock or forecast can't cover)
  2  k < need                      min(1, AI_VALUE.forecastRisk × risk)
                                            (covered only by its own forecast output)
  3  otherwise                     0
unknown    own forecast unknown (outlook off, Rookie) → own = 0: every needed unit is q = 1
outcome    → C1. Answers WS1's 30-of-47: forecast-covered units keep a share of S(k), so
           the seat never sells them for less than q × S
examples   need 8, own 10, k = 3: row 2 → q = forecastRisk × risk; today q = 0 and the
           seat sold to 0
```

```
RULE-4 · What an unneeded unit is worth (carry)             shape: formula

inputs     belief (RULE-6) · keep = 1 − GOOD_CONFIG[good].spoilage · tax · depot limit
formula    sell side: Ck = afterTax(belief × (1 − PRICE.storeSpread)) × keep^holdMonths
           for k within the depot (UPKEEP.depotCapacity, as today), else 0
           buy side:  Ck × min(1, persona.speculate) in PR-1/PR-2;
                      PR-3: Ck at the tilted belief (RULE-6 row 2)
boundaries Food and Water past the colony's shelf: the existing goodPlan cap stays
           (keep ≤ what the store pays now − 1), unchanged
examples   belief 40, spoilage 0.1, tax 8%, spread 0.1: Ck = 40 × 0.9 × 0.92 × 0.9 ≈ 29.8
           → bought at an ask below that (G-2)
```

```
RULE-5 · The cash shadow price                              shape: algorithm

inputs     money · every needed unit (q(k) > 0) of each good still to be auctioned this
           month, in AUCTION.order from the current good · its v(k) and expected ask
           (expectedPrices.buy, or belief × (1 + spread) for a later good)
steps      1 rank all those units by v(k) ÷ ask, highest first (ties: AUCTION.order)
           2 fund them in that order while money covers the ask
           3 λ = (v ÷ ask − 1) of the last funded unit, 0 if all are funded
           4 the current good's budget = its funded units' asks + what is left after
             every funded unit (for surplus units, each bought only if v − ask > λ × ask)
unknown    no needed unit → budget = money × STRATEGIST.budgetShare (today's share)
outcome    → C2 budget, C2 'Cash left' (cash allocated to later goods), C4 pass gain,
             cashReserve (Σ asks of the next month's funded units)
examples   80 cr, Food short 2 (v 40, ask 30), Energy short 2 (v 120, ask 35): fund Energy
           ×2 (70), Food 0 → Food's budget 0 at the Food auction, so it keeps 70 for Energy
```

```
RULE-6 · The belief                                         shape: decision table

inputs     the playbook's GoodPlay.expect · outlook.price · PR-3: trend, warnings,
           rivals' output, WS5's price path, persona risk and greed
first match wins
  #  when                                       belief(good)
  1  the seat's playbook sets expect            expect (validator-bounded, §3)
  2  AI_VALUE.model 'unit', PR-3 built          outlook.price tilted by the PR-3 signals
                                                and persona (weights in AI_VALUE)
  3  otherwise                                  outlook.price (outlook.final → posted)
outcome    → RULE-2 replace, RULE-4 carry, RULE-5 later goods' asks
```

## §3 · Contracts & Data Models `[handoff]`

**`GoodPlay.expect?: number`** (C5): change_kind ADDED. Not breaking: the field is optional, and playbook v1 stays v1.
- **Meaning:** the posted price the seat believes a good will have next month, in credits.
- **Bound:** the validator clamps it to [`AI_VALUE.belief.min` × reference, `AI_VALUE.belief.max` × reference] and lists a clamp in `rejected`. It is the engine's draft value when absent.
- **Owner:** WS3 (`engine/src/playbook.ts`, named edit); the validator is WS9's.
- **Example:** `{ role: 'buyer', hold: 9, walkAway: 60, …, expect: 85 }`. The seat values Food as if it will cost 85 next month, so it buys a surplus at an ask of 50.

**WS5's price-path contract** (PR-3): a freeze point. WS5's widened store design has no spec yet.
- **What the belief reads:** through `outlook.ts` only, the store's next posted price per good, with `extra` units (`Outlook.price`, as today), and the ship's offer per export good for the next months.
- **Who publishes it:** WS5, as an engine function the AI calls. The AI copies no formula (HC-5).
- **Until WS5 freezes it:** PR-3 stubs on `outlook.later`.

## §4 · Failure & Ops

No external dependency: the model runs in-process and seeded.

## §5 · Delivery

Code-only; no existing state to reach. `AI_VALUE.model` defaults to 'today' (HC-4). Rollback is the switch.

## §6 · Acceptance Criteria `[handoff]`

Every test runs with `AI_VALUE.model = 'unit'`, except T-AC-9.

| AC | Given · When · Then | Changes | observed_at | negative case |
|---|---|---|---|---|
| **B-AC-1** (G-1) | Given a seat with 0 Food, needing 5, holding 1,200 cr, and the store selling Food at 72 · When the Food auction plays · Then it ends holding at least 5 | C1, C2 | the seat's stock after the auction hand runs (built state, `AuctionHand`) | the store holds no Food: no trade, no refusal |
| **B-AC-2** (G-1, Energy) | Given a seat whose plots need 6 Energy, holding 1 Energy and enough cash, the store selling 6 · When the Energy auction and production play · Then no plot is turned off for want of Energy | C1, C2 | production's lines for the seat (no `noEnergy` part) | cash below one unit: plots turn off in AM-13's order |
| **B-AC-3** (G-2) | Given Food's ask at or below its reference, a belief above the ask after spoilage and tax, and depot room · When the Food auction plays · Then the seat holds more than next month's need; with the ask ≥ 2× reference, no more than its need | C1, C3 | the seat's stock after the auction | a good that spoils fully: no surplus |
| **B-AC-4** (G-3) | Given a playbook setting `expect` on Food above the ask · When the auction plays · Then the seat buys beyond its need; with no `expect`, it doesn't | C3, C5 | the stock after the auction | `expect` beyond the bound: clamped and listed in `rejected` |
| **T-AC-1** (UBER-AC-1, serves B-AC-1, B-AC-2) | `pnpm sim`, 40 games × 1/101/201, prints UBER-AC-1 (a) and (b) beside the colony's Food/Water shortage | C6 | the sim report | — |
| **T-AC-2** (serves B-AC-1) | RULE-5's example: 80 cr, Food short 2 (v 40, ask 30), Energy short 2 (v 120, ask 35) → Food's budget 0, and 70 cr kept for Energy | C2 | goodPlan's budget and the Energy auction's stock | all needs funded: budget is today's share |
| **T-AC-3** (serves B-AC-2) | RULE-3 row 2: own Energy plots forecast 10, need 8, holding 2 → the seat does not sell below 2 + the units its forecast alone covers × q > 0 | C1 | the stock after the Energy auction | Rookie (no outlook): q = 1 for every needed unit |
| **T-AC-4** (serves B-AC-2) | WS1's reserve example (value 411, ask 214, 1,355 cr, old reserve 1,157) → it buys | C2 | the stock after the auction | — |
| **T-AC-5** (serves B-AC-1) | Short and funded: the pass candidate's gain is below the buy's; no veto | C4 | tradeDecision's shortlist | not funded: pass gain 0 |
| **T-AC-6** (serves B-AC-2) | RULE-2 row 1's example: S(k) follows AM-13's turn-off order | C1 | unitValues' keep | no plot needing Energy: S = replace |
| **T-AC-7** (serves B-AC-3) | RULE-4's example: Ck ≈ 29.8 | C1 | unitValues | spoilage 1 → Ck 0 |
| **T-AC-8** (serves B-AC-4) | `expect` within bounds is the belief; beyond them, clamped and listed in `rejected` | C3, C5 | the validator result and the belief | — |
| **T-AC-9** (HC-4) | `AI_VALUE.model` 'today': default, `--plays today` and politics-off sims byte-identical to trunk on 1/101/201 | C1–C6 | the sim report | — |
| **T-AC-10** (UBER-AC-3, serves B-AC-4, PR-3) | The sim's speculation row: units beyond need, their realised margin after spoilage, storage and tax; bullish-belief seats positive on all 3 seed sets | C3, C6 | the sim report | — |
| **T-AC-11** (HC-3) | A game with `AI_VALUE.model` 'unit' replays from seed + actions to the same state hash | C1–C5 | the record replay | — |

**Invariants**, asserted by every relevant test:
- keep and buy are non-increasing in k;
- a unit with q = 1 is never sold below S(k);
- money never goes negative.

**Altitude:**
- The B-ACs are proven at the auction hand's result (built states), not at `unitValues`.
- The T-AC rule rows test the pure functions, where the table is too combinatorial for the boundary.

## §7 · Risks & Spikes `[review-only]`

- **AI buyers compete with the colony for the store's Food.** WS1's stopgap raised colonists short of Food or Water to 55–61%.
  - Mitigation: HC-6 puts the colony's row beside every UBER-AC-1. Supply itself is C29's finding.
- **AM-13's turn-off order isn't on trunk yet.**
  - Mitigation: Energy's RULE-2 row is the only consumer. PR-1 waits on WS1's AM-13/AM-17 commit, which the PM ordered first.
- **WS5's price paths aren't specced.**
  - Mitigation: PR-3 only. It stubs on `outlook.later` until WS5 freezes §3's contract.
- **Sim-searched fixtures break on every AI change.**
  - Mitigation: WS9's built-state fixtures PR lands before PR-1.
- **Sim speed.** RULE-5 adds one ranking per goodPlan. It reuses the outlook goodPlan already builds, with no new rollout.
  - Mitigation: PR-1 reports the sim's wall time against trunk.
- **Heavy tests.** T-AC-1 and T-AC-10 are `pnpm sim` report rows, measured at each PR and quoted in its body, never vitest tests. The B-ACs use built states, which keeps CI lean (the standing lean-CI rule) and clear of the vitest worker's 60 s RPC timeout on long synchronous tests.
- No spike is needed: every input exists in the engine, or in AM-13 (ordered first).

## §8 · Amendments `[review-only]`

(none yet)

## §9 · Ownership Boundaries

No ownership change.
- `value.ts`, `strategist.ts`, `outlook.ts`, `sim.ts` and `config.ts`'s AI blocks remain WS1's; WS9 edits them as named edits.
- `engine/src/playbook.ts` remains WS3's.
- `packages/ai/src/playbook/**` remains WS9's.
