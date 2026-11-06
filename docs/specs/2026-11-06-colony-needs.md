# Colony needs: demand and hardship — design (PROPOSED, spec only)

Status: **draft, nothing built.** For Heiko: "Read it first". Lead WS7 (the colonists part);
WS5 writes the per-production-type consumption table and the store-demand step; WS1 reviews the
numbers as owner of `upkeep.ts` and `config.ts`. Folds in C27 (WS1's held draft `origin/ws1-c27`,
RULE-29 there) and touches G-5 HC-22.

Base: trunk `feat/strategist` 2eccd439. Spec class: Standard (several files, one or two PRs, no new
sole owner). Every number below is a placeholder until it is tuned (G-5 HC-25), and each is a named
config value.

## Who writes what (ids reserved so the two lanes never collide)

| Part | Lane | Ids |
|---|---|---|
| §0 goals, "what you'll see", colonists: no wages, no price cap, shortage → mood, hardship memory, unrest odds, population change; the worked example; the before/after sim | WS7 | C1–C9 · RULE-1–9 · B-AC-1–9 · T-AC-1–19 · HC-1–9 |
| Per-production-type Food/Water/Energy consumption table; the store-demand step | WS5 | C10–C19 · RULE-10–19 · B-AC-10–19 · T-AC-20–39 · HC-10–19 |
| Numbers review (upkeep.ts, config.ts) | WS1 | review only |

Each lane commits its own sections on branch `ws7-colony-needs`; one commit per section.

## What you'll see at the table

- **Colonists never pay.** The month-end line says how much the store gave them, as a share:
  "The store fed the colony's 400 colonists 19 of 20 Food and all their Water". No price, no
  wages, no money moves when they eat. A dear Food price never starves them while the shelf
  has Food.
- **A small miss is shrugged off.** Missing 1 Food of 20 (5%) changes nothing: the mood holds and
  the colony still grows. Today that same miss costs the mood and shrinks the colony by 5%.
- **A big miss bites at once, and more the bigger it is.** Short half the Food: the mood drops 8
  that month (Content 60 → Restless 52) and the colony shrinks 5%. No Food at all: the mood
  drops 20 in one month (60 → 40) and the colony shrinks 10%. Today every miss looks the same:
  −5 to the mood and −5% colonists, whether 1 unit or all of it was missing.
- **The colony remembers.** After a hungry month, feeding them again lifts the mood, but slowly:
  for a few months it aims a little lower than before. Hunger month after month piles up: half
  rations held month after month settle the mood near 49 (mid-Restless); no Food at all takes it
  into Unrest in three months and to 0 in five.
- **Hard times make trouble likelier.** While the memory of hunger lasts, the unrest-band events
  (riots, strikes, emigration waves) come up more often, up to 2.5 times their usual odds.
- **The colony's size follows the shortfall.** Fed or nearly fed (90%+), it grows 4% a month.
  Short, it shrinks by a tenth of the share missing: 2% at 20% short, 10% with nothing to eat.
  The mood adds C27's push on top: a Thriving colony draws settlers, an unhappy one loses them.

## §0 · Business Goals & Value `[handoff]` (goal lines) · `[review-only]` (Who / Today / Value)

**G-1 · Goal:** the colonists' hunger is as bad as the shortage: a small miss is shrugged off, a
deep or lasting one makes them unhappy, likelier to riot, and fewer.
- **Who benefits:** the players at the table, who read the colony's mood and size to judge how
  much Food and Water to grow and sell, and whether to cut the colonists' rations for profit.
- **Today:** any miss is all-or-nothing (`upkeep.ts::runUpkeep`: `fed` is false if one unit is
  missing; `colony.ts::moodTarget`: 8 points per good short, then the 5-point step cap). Missing 1
  Food of 20 and missing all 20 both cost −5 mood and −5% colonists. And colonists go short while
  the store has Food when its price is above their wages (`UPKEEP.colonistBudget`), a price cap
  nobody at the table can see. verified_by: read (measured counts: §Measurement).
- **Value:** feeding the colony becomes a decision with a gradient, not a cliff: the table can
  run a little short in a hard month and pay for a long famine. Heiko's words: "the worse the
  resource crisis the more likely they get unhappy and the more unhappy they get."
- **Proof, UBER-AC-1:** in an engine test, a colony short 1 Food of 20 keeps its mood and grows;
  short 10 of 20 it loses 8 mood and 5% of its colonists; short 20 of 20 it loses 20 and 10%; and
  the 10 seed-1 sim games report the mood-band shares before and after (§Measurement).

**G-2 · Goal:** colonists have no economy: their need comes out of the store's stock first, free,
and they go short only when the shelf is empty.
- **Who benefits:** the players, who no longer meet a hidden wage cap; Heiko's design: "Colonists
  have NO economy: no prices, no wages, no money."
- **Today:** colonists pay the store's selling price from a wage budget; it caps what they buy
  (`upkeep.ts::runUpkeep`), the store's demand (`economy.ts::colonistDemand`) and how high the
  store bids to restock (`auction.ts::comeUp` `ceiling`). verified_by: read.
- **Value:** one rule the table can see: the shelf feeds the colonists, and an empty shelf hurts.
- **Proof, UBER-AC-2:** `grep colonistBudget packages/engine/src` finds nothing; an engine test
  with Food posted at 300 and the shelf full feeds the colonists in full and moves no credits.

**Non-goals.**
- Players' and crews' consumption per production type and the store-demand step (WS5's part of
  this spec, §1 WS5).
- Colonists' Energy and Medicine: they stay demand for prices only, as today; hardship reads Food
  and Water. A later spec could add them as softer hardships.
- A new screen or gauge for the hardship memory: the table sees it through the mood, the events
  and the month-end line. A hardship marker on the colony panel would need a WS6 mock first.
- Tuning: every number is a placeholder (G-5 HC-25).

**Rough cost.** Recommended (A): one engine PR, about a day: `colony.ts` (WS7), named edits in
`upkeep.ts`, `economy.ts`, `config.ts`, `events.ts` (WS1) and `auction.ts` (WS3), one server
line (`mule-game.ts`, WS3) and one web line (`MonthEnd.tsx`). Thin (B): about half a day, the
same files less `events.ts` and the memory.

## §0.1 · Decision Record `[review-only]`

- **Chosen, A (curve + memory + shock):** about a day. Each month's shortfall share runs through a
  tolerance curve; a hardship memory of recent months lowers the mood's target and raises the
  unrest odds; the month's shortfall also lands at once, outside the 5-point step cap.
- **Thin baseline, B (curve on the target only):** about half a day. It loses because the 5-point
  step cap flattens it: every shortfall of 40% or more moves the mood the same −5 a month
  (§Curve), which is today's flat cliff moved to 40%. Heiko asked that a worse crisis make them
  "more unhappy", and B cannot show that in one month. Check: the table in §Curve, column B.
- **C (raise or drop the step cap):** rejected. The cap also governs tax, air, prestige and the
  wealth gap; lifting it makes those swing too, and a tax change would jolt the mood. A keeps the
  cap for the slow drift and lets only the hardship land at once, as events already do
  (`colony.ts::moodShift`).

## §0.2 · Constraints `[handoff]`

```
HC-1  Every number is a named config value: a HARDSHIP block in config.ts (tolerance, power,
      shock, targetPerHardship, memoryKeep, memoryCap, unrestPerHardship) and
      UPKEEP.colonistShrinkPerShortfall; each with its unit and a one-line meaning.
                                              source: G-5 HC-20, CLAUDE.md   breach: fatal
HC-2  Colonists never hold or pay money: their meal moves no credits (store.capital unchanged
      by it). The store's money is unlimited already (SEAMS 2026-10-22), so nothing replaces
      the payment.                            source: Heiko 6 Nov   breach: fatal
HC-3  The store keeps the colonists' month of Food and Water back from sale to players
      (economy.ts::storeForSale reserve, existing): their need comes out of the store first.
                                              source: Heiko 6 Nov; existing   breach: fatal
HC-4  packages/engine stays pure and draws no new random number: hardship is deterministic;
      the unrest odds change only through the existing event roll.
                                              source: G-5 HC-21   breach: fatal
HC-5  The mood, the memory and the unrest odds exist only with politics on (state.colony).
      Whether the meal and the population change (C1, C2, C4) also apply with politics off is
      decision D1.                            source: G-5 HC-22   breach: decision
```

## §1 · Solution Design `[handoff]`

### Colonists (WS7)

```
C1 · MODIFIED · colonists take their Food and Water from the store, free, as far as it has them

today        they buy at the store's selling price out of a wage budget; short if the shelf is
             empty OR the price is over the budget; the price is paid into store.capital
             anchors: upkeep.ts::runUpkeep · verified_by: read
tomorrow     MUST take min(need, stock) of Food and of Water, pay nothing; MUST record each good's
             need and took in the month report; the store's reserve for them is unchanged
logic        → RULE-1 · at upkeep, after the players eat · writes store.stock, the report
seam         upkeep.ts::runUpkeep — the meal already lives here
senior       junior would: set colonistBudget to a huge number · senior does: deletes the budget
             and the payment, so no wage logic survives to confuse a later reader
mechanism    in_place
call sites   game.ts advancePhase → runUpkeep (one)
pin          players' meal, spoilage, the export ship and the MULE build unchanged: upkeep tests
owner        WS1 (upkeep.ts, named edit)
```

```
C2 · REMOVED · the colonists' wage budget as a price cap

today        UPKEEP.colonistBudget caps the colonists' demand (economy.ts::colonistDemand) and the
             store's restocking bid (auction.ts::comeUp `ceiling`) · verified_by: read
tomorrow     MUST count colonists' demand as their full need at any price; the store's restock bid
             MUST be posted × PRICE.restockPremium with no wage ceiling; colonistBudget deleted
seam         economy.ts::colonistDemand, auction.ts::comeUp
senior       junior would: leave the ceiling reading a deleted config row · senior does: removes
             the ceiling term; the store's own sell-above-buy guard (storeSell) stays
mechanism    delete
call sites   economy.ts::monthlyDemand (4 calls), auction.ts::comeUp (1)
pin          storeForSale's reserve (HC-3); storeSell ≥ storeBuy + 1 (auction tests)
owner        WS1 (economy.ts, config.ts), WS3 (auction.ts named edit)
```

```
C3 · MODIFIED · the mood reads how short the colonists went, through a curve, a memory and a shock

today        moodTarget subtracts HAPPINESS.weights.shortage (8) per good short; moodStep moves at
             most 5 · anchors: colony.ts::moodInputs, moodTarget, runColony · verified_by: read
tomorrow     MUST compute the month's severity and the hardship memory (RULE-2, RULE-3); the target
             loses targetPerHardship × memory instead of 8 per good; after the 5-point step, the
             mood loses the month's shock at once (RULE-4); the memory is stored on the colony
logic        → RULE-2, RULE-3, RULE-4 · at upkeep in runColony
seam         colony.ts::runColony — the one place the month's mood is stepped
senior       junior would: raise the shortage weight · senior does: separates "how bad this month"
             (shock, uncapped like moodShift) from "how long it has lasted" (the memory, through the
             capped drift), so a big miss shows at once and a long one keeps the target down
mechanism    in_place
call sites   game.ts → runColony(state, shortages) (one); moodInputs is also read by the AI's
             outlook if any (find-refs at build time; not prism-indexed)
pin          tax, air, broken promise, prestige and gap terms unchanged: colony mood tests
owner        WS7
```

```
C4 · MODIFIED · the colony grows or shrinks by how short it went, plus C27's mood push

today        ×1.04 if fed, ×0.95 if any unit was missing; Collapse air overrides
             anchors: upkeep.ts::runUpkeep · verified_by: read. C27's held draft adds a per-band
             offset (origin/ws1-c27 upkeep.ts::growthRate, RULE-29)
tomorrow     MUST grow ×colonistGrowth.fed when the month's severity is within tolerance, else
             shrink ×(1 − colonistShrinkPerShortfall × severity); plus HAPPINESS.migration[band]
             with a colony; never below 0; Collapse still overrides (RULE-5)
seam         upkeep.ts::growthRate (C27's draft function, extended)
senior       junior would: keep the flat 0.95 and only add C27 · senior does: makes the shrink
             proportional, so the size tells the same story as the mood
mechanism    in_place (supersedes C27's RULE-29 rows 2–3)
call sites   runUpkeep (one)
owner        WS1 (upkeep.ts, config.ts) — folds C27
```

```
C5 · MODIFIED · the memory of hardship raises the unrest-band events' odds

today        a row's mood points come from its band only (events.ts::influences `mood`)
tomorrow     MUST multiply the row's restless/unhappy/unrest mood points by
             (1 + unrestPerHardship × memory); thriving/content points unchanged (RULE-6)
seam         events.ts::influences — the one place mood points are read
mechanism    in_place
call sites   events.ts chance (all rows)
pin          rows without mood points and politics-off rolls unchanged: events tests
owner        WS1 (events.ts, named edit)
```

```
C6 · MODIFIED · the month-end line says how much the colonists got

today        "The store fed the colony's N colonists" / "… went short" (MonthEnd.tsx, from
             colonistsFed via mule-game.ts::colonistsFedAt)
tomorrow     MUST say "The store fed the colony's N colonists 19 of 20 Food and all their Water",
             and the plain "fed" line when nothing was missing; red when severity is over tolerance
ux           wording only on an existing line; no layout change, so no new mock
owner        WS3 (mule-game.ts, protocol), web line by the PM's build ruling
```

### Players' and crews' consumption, store demand (WS5)

*(pending — WS5)*

## §2 · The Logic `[handoff]`

```
RULE-1 · The colonists' meal (C1)                                 shape: formula
evaluated at  upkeep, after the players eat, for good ∈ {food, water}
inputs        need_g   colonists / UPKEEP.colonistsPerUnit (+ a festival's Food), ≥ 0
              stock_g  state.store.stock[g], ≥ 0
then          took_g = min(need_g, stock_g);  store.stock[g] −= took_g;  no credits move
              s_g = need_g = 0 ? 0 : (need_g − took_g) / need_g        (0..1)
existing      the store keeps ceil(need_g) back from players at the auction (storeForSale), so
              stock_g ≥ need_g unless the store held less than that
unknown       need 0 (no colonists) → s 0: nobody to go short
```

```
RULE-2 · Severity and the hardship curve (C3)                     shape: formula
s          = max(s_food, s_water)                     the worse of the two, 0..1
g(s)       = 0                                 if s ≤ HARDSHIP.tolerance (0.10)
           = ((s − tolerance) / (1 − tolerance)) ^ HARDSHIP.power (1.5)   otherwise, 0..1
why max    a colony with all its Water and no Food is starving; an average would call it half fed
```

```
RULE-3 · The hardship memory (C3)                                 shape: formula
H_new = min(HARDSHIP.memoryCap (3), HARDSHIP.memoryKeep (0.5) × H_old + g(s))
starts 0 with the colony; politics off: none (HC-5)
reads  a fed month halves it; the same shortfall month after month settles at 2 × g(s)
```

```
RULE-4 · The month's mood (C3)                                    shape: sequence
1  target = today's target with the shortage term replaced by − HARDSHIP.targetPerHardship (12) × H_new
2  mood   = moodStep(mood, target)                    the 5-point cap, unchanged
3  mood   = mood − round(HARDSHIP.shock (15) × g(s))  at once, uncapped (as moodShift), floor 0
order    the step before the shock, so the shock is not undone by the same month's step
```

```
RULE-5 · The colony's growth (C4; folds C27 RULE-29)              shape: decision table
first match wins; then colonists = round(colonists × rate)
  #  when                      rate
  1  air band collapse         1 − POLLUTION.collapseLeave        (as today)
  2  s ≤ HARDSHIP.tolerance    UPKEEP.colonistGrowth.fed (1.04) + offset
  3  otherwise                 1 − UPKEEP.colonistShrinkPerShortfall (0.10) × s + offset
offset   colony ? HAPPINESS.migration[band] : 0, band read before the month's step (C27);
         thriving +0.02, content 0, restless −0.01, unhappy −0.03, unrest −0.05
floor    rate never below 0
examples s 0.05 Content → 1.04 · s 0.5 Content → 0.95 · s 1 Unrest → 0.85 · politics off s 0.5 → 0.95
```

```
RULE-6 · Hardship raises the unrest odds (C5)                     shape: formula
a row's mood points in band b = row.mood[b] × (b ∈ {restless, unhappy, unrest} ? 1 + HARDSHIP.unrestPerHardship (0.5) × H : 1)
H at its cap (3) → ×2.5. Rows with no mood points, and politics off, are unchanged.
```

## The curve: shortfall → mood change in one month

From a Content colony at 60 with its target at 60 and no memory, Water fed, Food short by the
share shown. A = recommended, B = thin, "today" = trunk.

| Food short | g(s) | A: step + shock | A: mood | B (step only) | today | colonists A / today |
|---|---|---|---|---|---|---|
| 0–10% | 0 | 0 + 0 | 60 | 60 | 55 | ×1.04 / ×0.95 |
| 20% | 0.04 | 0 − 1 | 59 | 59 | 55 | ×0.98 / ×0.95 |
| 30% | 0.10 | −1 − 2 | 57 | 56 | 55 | ×0.97 / ×0.95 |
| 40% | 0.19 | −2 − 3 | 55 | 55 | 55 | ×0.96 / ×0.95 |
| 50% | 0.30 | −4 − 4 | 52 | 55 | 55 | ×0.95 / ×0.95 |
| 60% | 0.41 | −5 − 6 | 49 | 55 | 55 | ×0.94 / ×0.95 |
| 70% | 0.54 | −5 − 8 | 47 | 55 | 55 | ×0.93 / ×0.95 |
| 80% | 0.69 | −5 − 10 | 45 | 55 | 55 | ×0.92 / ×0.95 |
| 90% | 0.84 | −5 − 13 | 42 | 55 | 55 | ×0.91 / ×0.95 |
| 100% | 1 | −5 − 15 | 40 | 55 | 55 | ×0.90 / ×0.95 |

The same shortfall held month after month (A): the memory settles at 2 × g(s), so the target
settles at 60 − 24 g(s) and the shock repeats. 20% short settles at about 58 (Restless, just under
Content's 60); 50% short at about 49 (Restless); 100% short runs 40, 27, 17 (Unrest), 7, 0.

## Worked example: three months (WS7)

Colony of 400, need 20 Food and 20 Water a month; Water fed throughout; mood 60 (Content), no
memory; nothing else moves the mood. Population rounded each month.

| Month | Food | s | g(s) | memory H | target | mood: step, shock → | band | colonists A | today: mood, colonists |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 19 of 20 | 0.05 | 0 | 0 | 60 | 60, 0 → **60** | Content | 400 × 1.04 = **416** | 55, 380 |
| 2 | 10 of 20 | 0.50 | 0.30 | 0.30 | 56.4 | 56, −4 → **52** | Restless | 416 × 0.95 = **395** | 52, 361 |
| 3 | 20 of 20 | 0 | 0 | 0.15 | 58.2 | 57, 0 → **57** | Restless | 395 × (1.04 − 0.01) = **407** | 57, 375 |

- Month 1: a 5% miss is inside the tolerance. Nothing happens; the colony grows. Today it costs
  −5 mood and −5% colonists.
- Month 2: half rations. The step takes 4 (the target fell 3.6) and the shock 4 more. The colony
  shrinks 5%, and the unrest-band events' odds rise ×1.15.
- Month 3: fed. The mood climbs 5 but stays Restless, because the memory still holds the target
  1.8 below 60; the colony grows 4% less C27's Restless 1%. In month 4 (fed) the memory halves to
  0.07 and the mood reaches 59; month 5, 60 and Content.

## Options and decisions for Heiko

**D1 · Do colonists eat free in every game, or only with politics on?** Colonists eat in every
game; the mood exists only with politics on.
- **(a) Every game (recommended).** One economy: no wages, no price cap, growth by shortfall
  everywhere; the mood, memory and unrest odds stay politics-only. Pro: one rule to learn and to
  test; the AI's price reasoning sees one demand. Con: G-5's HC-22 ("politics off exactly as
  today; its sim rows byte-identical") is narrowed to "politics off has no mood, prestige or
  social events"; the politics-off sim rows are re-baselined once, in this PR.
- **(b) Politics on only.** Pro: HC-22 holds as written. Con: two colonist economies, with wages
  and without, in one codebase and in the AI's demand model; a player moving between modes meets
  different hunger rules.

**D2 · The mood mechanism.** A (recommended), B or C, as §0.1. The table in §Curve is the
comparison.

**D3 · Keep the 5-point monthly step?** Yes, for the slow drift (tax, air, prestige, gap). The
hardship's own shock lands outside it, like an event's. Without that, a bigger crisis cannot hurt
more in one month (§Curve column B).

**D4 · Starting numbers** (all placeholders, HC-25): tolerance 10%, power 1.5, shock 15,
12 target per point of memory, memory keeps 0.5 a month and caps at 3, unrest odds +50% per point
of memory, shrink 0.10 × shortfall. Heiko may want a gentler or harsher curve; the §Curve table is
what each shortfall costs.

**D5 · The store's lost income.** Colonists' payments stop. The store's money is already
unlimited and never shown (Heiko, 22 Oct), so nothing is needed. The measurement reports the
payments that disappear.

## Measurement: mood bands before and after, 10 seed-1 games (WS7)

*(pending: m18 running)*

## §6 · Acceptance Criteria `[handoff]`

| AC | Given · When · Then | Changes | Proof |
|---|---|---|---|
| B-AC-1 | Given a politics game whose colonists need 20 Food and the store holds 19 · When upkeep ends · Then the mood is unchanged, the colonists grow 4%, and the month-end line says "19 of 20 Food" | C1, C3, C4, C6 | engine test on GameState + server view test of the line |
| B-AC-2 | Given the same colony at mood 60 short 10 of 20 Food · When upkeep ends · Then the mood is 52 and the colonists shrink 5% | C3, C4 | engine test |
| B-AC-3 | Given the colony of B-AC-2 fed in full the next month · When upkeep ends · Then the mood is 57, not 60, and the colonists grow 3% (Restless) | C3, C4 | engine test |
| B-AC-4 | Given Food posted at 300 and the shelf holding the colonists' need · When upkeep ends · Then they are fed in full and store.capital is unchanged by their meal | C1, C2 | engine test |
| B-AC-5 | Given a politics-off game short 10 of 20 Food · When upkeep ends · Then the colonists shrink 5% and there is no mood (D1 a) | C1, C4 | engine test |
| T-AC-1 (B-AC-1..3) | RULE-2: g at s = 0, 0.10, 0.11, 0.5, 1 is 0, 0, ≈0.001, 0.296, 1; s is the worse of Food and Water | C3 | engine unit |
| T-AC-2 (B-AC-3) | RULE-3: H from 0 by g 0.3 → 0.3; fed → 0.15; g 1 every month → 1, 1.5, 1.75 …, capped at 3 | C3 | engine unit |
| T-AC-3 (B-AC-2) | RULE-4: the step comes before the shock; shock 15 × g, rounded, floor 0 | C3 | engine unit |
| T-AC-4 (B-AC-1,2,5) | RULE-5: every row and example, incl. the floor at 0 under a test override | C4 | engine unit |
| T-AC-5 (serves G-1) | RULE-6: an unrest row's points ×(1 + 0.5 H); a thriving row's unchanged; politics off unchanged | C5 | engine unit |
| T-AC-6 (B-AC-4) | RULE-1: need 0 → s 0; stock 0 → s 1; no credits move | C1 | engine unit |
| T-AC-7 (UBER-AC-2) | `colonistBudget` no longer exists in packages/engine/src; the store's restock bid has no wage ceiling | C2 | grep + auction test |

## §8 · Amendments

*(none)*

## §9 · Ownership Boundaries

No ownership change. `colony.ts` stays the sole writer of the colony (the memory lives there);
`upkeep.ts` reads the band and writes the colonist count as today. Named edits: WS1 (upkeep.ts,
economy.ts, config.ts, events.ts), WS3 (auction.ts, mule-game.ts, protocol). C27's held branch
`origin/ws1-c27` is superseded by C4/RULE-5 if D1–D2 are approved; WS1 builds RULE-5 in its place.
