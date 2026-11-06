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
- **A big miss bites at once, and more the bigger it is.** Short half the Food: the mood drops 4
  that month (Content 60 → Restless 56) and the colony shrinks 5%. No Food at all: the mood
  drops 13 in one month (60 → 47) and the colony shrinks 10%. Today every miss looks the same:
  −5 to the mood and −5% colonists, whether 1 unit or all of it was missing.
- **The colony remembers.** After a hungry month, feeding them again lifts the mood, but slowly:
  for a few months it aims a little lower than before. Hunger month after month piles up: half
  rations held month after month settle the mood near 54 (Restless); no Food at all keeps it
  falling about 3 a month: Unhappy in month 4, 25 by month 8.
- **Hard times make trouble likelier.** While the memory of hunger lasts, the unrest-band events
  (riots, strikes, emigration waves) come up more often, up to 1.5 times their usual odds.
- **The colony's size follows the shortfall.** Fed or nearly fed (90%+), it grows 4% a month.
  Short, it shrinks by a tenth of the share missing: 2% at 20% short, 10% with nothing to eat.
  The mood adds C27's push on top: a Thriving colony draws settlers, an unhappy one loses them.

## §0 · Business Goals & Value `[handoff]` (goal lines) · `[review-only]` (Who / Today / Value)

**G-1 · Goal:** the colonists' hunger is as bad as the shortage: a small miss is shrugged off, a
deep or lasting one makes them unhappy, likelier to riot, and fewer.
- **Who benefits:** the players at the table, who read the colony's mood and size to judge how
  much Food and Water to grow and sell, and whether to cut the colonists' rations for profit.
- **Today:** any miss is all-or-nothing (`packages/engine/src/upkeep.ts::runUpkeep`: `fed` is false if one unit is
  missing; `packages/engine/src/colony.ts::moodTarget`: 8 points per good short, then the 5-point step cap). Missing 1
  Food of 20 and missing all 20 both cost −5 mood and −5% colonists. And colonists go short while
  the store has Food when its price is above their wages (`UPKEEP.colonistBudget`), a price cap
  nobody at the table can see. verified_by: read (measured counts: §Measurement).
- **Value:** feeding the colony becomes a decision with a gradient, not a cliff: the table can
  run a little short in a hard month and pay for a long famine. Heiko's words: "the worse the
  resource crisis the more likely they get unhappy and the more unhappy they get."
- **Proof, UBER-AC-1:** in an engine test, a colony short 1 Food of 20 keeps its mood and grows;
  short 10 of 20 it loses 4 mood and 5% of its colonists; short 20 of 20 it loses 13 and 10%; and
  the 10 seed-1 sim games report the mood-band shares before and after (§Measurement).

**G-2 · Goal:** colonists have no economy: their need comes out of the store's stock first, free,
and they go short only when the shelf is empty.
- **Who benefits:** the players, who no longer meet a hidden wage cap; Heiko's design: "Colonists
  have NO economy: no prices, no wages, no money."
- **Today:** colonists pay the store's selling price from a wage budget; it caps what they buy
  (`packages/engine/src/upkeep.ts::runUpkeep`), the store's demand (`packages/engine/src/economy.ts::colonistDemand`) and how high the
  store bids to restock (`packages/engine/src/auction.ts::comeUp` `ceiling`). verified_by: read.
- **Value:** one rule the table can see: the shelf feeds the colonists, and an empty shelf hurts.
- **Proof, UBER-AC-2:** `grep colonistBudget packages/engine/src` finds nothing; an engine test
  with Food posted at 300 and the shelf full feeds the colonists in full and moves no credits.

**Non-goals.**
- Players' and crews' consumption per production type and the store-demand step (WS5's part of
  this spec, §1 WS5).
- Colonists' Energy: it stays demand for prices only. (Amended 6 Nov: Medicine is no longer a
  non-goal. Heiko's colony health, decisions 23-30, makes colonists take Medicine and fall sick:
  C7-C9 here, C17-C19 WS5's. Missing Medicine reaches the mood only through sickness; it is not in
  RULE-2's severity, since decisions 14 and 15 are superseded by health.)
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
  unrest odds; the month's shortfall also lands at once, outside the 5-point step cap. Its first
  numbers (shock 15, 12 per unit of memory, unrest +50%) spiralled in the sim: 8 of 10 games
  ended in Unrest. The numbers here are the softened set that did not (§Measurement, A3).
- **Thin baseline, B (curve on the target only):** about half a day. It loses because the 5-point
  step cap flattens it: every shortfall of 40% or more moves the mood the same −5 a month
  (§Curve), which is today's flat cliff moved to 40%. Heiko asked that a worse crisis make them
  "more unhappy", and B cannot show that in one month. Check: the table in §Curve, column B.
- **C (raise or drop the step cap):** rejected. The cap also governs tax, air, prestige and the
  wealth gap; lifting it makes those swing too, and a tax change would jolt the mood. A keeps the
  cap for the slow drift and lets only the hardship land at once, as events already do
  (`packages/engine/src/colony.ts::moodShift`).

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
      (packages/engine/src/economy.ts::storeForSale reserve, existing): their need comes out of the store first.
                                              source: Heiko 6 Nov; existing   breach: fatal
HC-4  packages/engine stays pure and draws no new random number: hardship is deterministic;
      the unrest odds change only through the existing event roll.
                                              source: G-5 HC-21   breach: fatal
HC-5  The mood, the memory and the unrest odds exist only with politics on (state.colony).
      Whether the meal and the population change (C1, C2, C4) also apply with politics off is
      decision D1.                            source: G-5 HC-22   breach: decision
HC-10 Every consumption number is a named value in one CONSUMPTION table in config.ts, one row
      per Outfit, in quarters; no rules code holds a crew or plot number.
                                              source: Heiko 6 Nov, CLAUDE.md   breach: fatal
HC-11 No copy of the Food/Water/Energy use formula outside production.ts: the AI and the server
      ask needsOf / needsWith / energyUseOf.  source: #390 HC-3 (same rule)   breach: fatal
HC-12 Crews eat from their owner's depot, never from the store; players eat before colonists.
                                              source: upkeep.ts today; WS5 recommendation   breach: decision
HC-13 Colony health ships switched off (HEALTH.enabled false) and is switched on by its own one-line
      config PR only when a sim of 10 seed-1 games (4 trader seats, politics on, the WS9/WS7 harness)
      shows the colonists short of Medicine in fewer than 40 of 120 months; the PR body carries the
      numbers. While it is off, every health term is inert: no sick share, no spill, no sick crews,
      Medicine demand as RULE-11 without the sick factor.
                                              source: Heiko 6 Nov, decision 23   breach: fatal
HC-14 The hardship (C3-C5) and the sickness (WS7's health, C18) reach trunk in the same batch as the
      supply change (C10-C16 and the power supply), tuned in one pass; neither merges alone.
                                              source: Heiko 6 Nov, decisions 1 and 23   breach: fatal
```

## §1 · Solution Design `[handoff]`

### Colonists (WS7)

```
C1 · MODIFIED · colonists take their Food and Water from the store, free, as far as it has them

today        they buy at the store's selling price out of a wage budget; short if the shelf is
             empty OR the price is over the budget; the price is paid into store.capital
             anchors: packages/engine/src/upkeep.ts::runUpkeep · verified_by: read
tomorrow     MUST take min(need, stock) of Food and of Water, pay nothing; MUST record each good's
             need and took in the month report; the store's reserve for them is unchanged
logic        → RULE-1 · at upkeep, after the players eat · writes store.stock, the report
seam         packages/engine/src/upkeep.ts::runUpkeep — the meal already lives here
senior       junior would: set colonistBudget to a huge number · senior does: deletes the budget
             and the payment, so no wage logic survives to confuse a later reader
mechanism    in_place
call sites   game.ts advancePhase → runUpkeep (one)
pin          players' meal, spoilage, the export ship and the MULE build unchanged: upkeep tests
owner        WS1 (upkeep.ts, named edit)
```

```
C2 · REMOVED · the colonists' wage budget as a price cap

today        UPKEEP.colonistBudget caps the colonists' demand (packages/engine/src/economy.ts::colonistDemand) and the
             store's restocking bid (packages/engine/src/auction.ts::comeUp `ceiling`) · verified_by: read
tomorrow     MUST count colonists' demand as their full need at any price; MUST remove the
             colonists' wages from how high the store bids to restock; colonistBudget deleted.
             How the store prices then is WS5's store-pricing rework (#390, Heiko's decision there):
             if it is approved, its band spreads replace the restock premium and this change only
             deletes the wage ceiling from what #390 leaves; if not, the restock bid is
             posted × PRICE.restockPremium with no wage ceiling
seam         packages/engine/src/economy.ts::colonistDemand, packages/engine/src/auction.ts::comeUp
senior       junior would: leave the ceiling reading a deleted config row · senior does: removes
             the ceiling term; the store's own sell-above-buy guard (storeSell) stays
mechanism    delete
call sites   packages/engine/src/economy.ts::monthlyDemand (4 calls), packages/engine/src/auction.ts::comeUp (1)
pin          storeForSale's reserve (HC-3); storeSell ≥ storeBuy + 1 (auction tests)
owner        WS1 (economy.ts, config.ts), WS3 (auction.ts named edit)
```

```
C3 · MODIFIED · the mood reads how short the colonists went, through a curve, a memory and a shock

today        moodTarget subtracts HAPPINESS.weights.shortage (8) per good short; moodStep moves at
             most 5 · anchors: packages/engine/src/colony.ts::moodInputs, moodTarget, runColony · verified_by: read
tomorrow     MUST compute the month's severity and the hardship memory (RULE-2, RULE-3); the target
             loses targetPerHardship × memory instead of 8 per good; after the 5-point step, the
             mood loses the month's shock at once (RULE-4); the memory is stored on the colony
logic        → RULE-2, RULE-3, RULE-4 · at upkeep in runColony
seam         packages/engine/src/colony.ts::runColony — the one place the month's mood is stepped
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
             anchors: packages/engine/src/upkeep.ts::runUpkeep · verified_by: read. C27's held draft adds a per-band
             offset (on origin/ws1-c27 only: a new growthRate, RULE-29)
tomorrow     MUST grow ×colonistGrowth.fed when the month's severity is within tolerance, else
             shrink ×(1 − colonistShrinkPerShortfall × severity); plus HAPPINESS.migration[band]
             with a colony; never below 0; Collapse still overrides (RULE-5)
seam         NEW function growthRate in packages/engine/src/upkeep.ts (added by C4; exists only on C27's held
             branch origin/ws1-c27), extracted from runUpkeep's growth line
senior       junior would: keep the flat 0.95 and only add C27 · senior does: makes the shrink
             proportional, so the size tells the same story as the mood
mechanism    in_place (supersedes C27's RULE-29 rows 2–3)
call sites   runUpkeep (one)
owner        WS1 (upkeep.ts, config.ts) — folds C27
```

```
C5 · MODIFIED · the memory of hardship raises the unrest-band events' odds

today        a row's mood points come from its band only (packages/engine/src/events.ts::influences `mood`)
tomorrow     MUST multiply the row's restless/unhappy/unrest mood points by
             (1 + unrestPerHardship × memory); thriving/content points unchanged (RULE-6)
seam         packages/engine/src/events.ts::influences — the one place mood points are read
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

```
C7 · ADDED · colonist sickness: a sick share h with a ceiling, where recovery beats contagion (decisions 28-30)

tomorrow     MUST keep h (0..HEALTH.cap 0.4) on the colony; at upkeep, after the colonists' meal (Food,
             Water and now Medicine taken free, as C1), update it by RULE-7; MUST start h at 0. While
             health is off (WS5 HC-13: it switches on with the Medicine supply), h stays 0
logic        → RULE-7 · upkeep, in runColony before the mood steps
seam         packages/engine/src/colony.ts::runColony — the colony's one monthly writer
senior       junior would: a sick count per colonist · senior does: one share on the colony, so
             contagion, crews (WS5 C18) and the view (WS5 C19) read one number
owner        WS7 (colony.ts); config HEALTH block (WS1 named edit)
```

```
C8 · ADDED · health weighs on the mood, the colony's growth and its Medicine need

tomorrow     MUST lower the mood's target by HEALTH.moodPerSick (10) × h; MUST lower the growth rate
             (RULE-5) by HEALTH.growthPerSick (0.05) × h; MUST raise the colonists' Medicine need by
             × (1 + h_old) (WS5 reads it in demand, RULE-13's neighbour). No immediate hit
logic        → RULE-8
seam         colony.ts::moodTarget's inputs; NEW function growthRate in upkeep.ts (C4)
owner        WS7 (colony.ts); upkeep.ts and economy.ts named edits (WS1)
```

```
C9 · ADDED · Electronics are a comfort: a mood bonus when met, never a penalty

tomorrow     MUST give the colonists min(colonists / UPKEEP.colonistsPerElectronics (50), store
             stock) Electronics at upkeep, free; MUST raise the mood's target by
             HEALTH.electronicsBonus (4) × the share met; MUST NOT lower it when unmet. The store's
             demand for them is WS5's C17
logic        → RULE-9
owner        WS7 (colony.ts)
```

### Players' and crews' consumption, store demand (WS5)

Heiko, 6 Nov: "the key demand comes from players supporting production and their crews, so more crews means more
Food demand", and each production type consumes different amounts of Food, Water and Energy. WS5's part: one
consumption table, read through the two functions every reader already calls, and the store's demand built from it.

**The consumption table** (per worked plot, per month; a player's household still eats 2 Food and drinks 1 Water):

| Plot makes | Food | Water | Energy | Character |
|---|---|---|---|---|
| Food (farm) | ¼ | ½ | 1 | a farm drinks: irrigation |
| Water (well) | ¼ | 0 | 1 | a well's crew drinks at the well |
| Energy (plant) | ¼ | ½ | 1 (from its own output, AM-17) | a plant needs cooling water |
| Smithore (mine) | ½ | ¼ | 2 | miners eat twice a farmhand's Food |
| Crystite (mine) | ¾ | ½ | 2 | deep, hot shafts: the hungriest crew |
| Rare earth (mine) | ½ | ¼ | 2 | as Smithore |
| Alloy (works) | ½ | ½ | recipe + 1 | a smelter's quench water and furnace |
| Electronics (works) | ½ | ¼ | recipe + 2 | clean rooms burn the most |
| Medicine (lab) | ½ | ½ | recipe + 1 | |
| Green belt | 0 | ½ | 0 | a park is watered |

Today, for comparison: a raw plot's crew of 1 adds ¼ Food and ⅙ Water, a factory's crew of 2 adds ½ and ⅓, a green
belt nothing (`UPKEEP.crew`, `crewPerFood` 4, `crewPerWater` 6), each rounded up per player; Energy is
`UPKEEP.energyUse` for raw plots and the recipe's Energy for factories. Raw plots' Energy and every recipe stay as
they are; the table adds a factory's running draw on top of its recipe.

Per player: Food = 2 + ⌈Σ table Food⌉, Water = 1 + ⌈Σ table Water⌉ (RULE-10). Three estates, today → tomorrow:
| Estate | Food | Water | Energy from the store |
|---|---|---|---|
| 3 farms + 1 well | 3 → 3 | 2 → 3 | 4 → 4 |
| 2 Smithore + 1 Crystite + 1 plant | 3 → 4 | 2 → 3 | 6 → 6 |
| 1 Alloy + 1 Electronics + 2 Smithore (alloy makes 2, electronics 1) | 4 → 4 | 2 → 3 | 7 → 10 |

**Do crews keep eating from their owner's depot?** Yes, recommended. The store sees crews only as demand: their
owner must buy the Food (at auction or from the store) or grow it. Crews eating from the store directly would
take the player's choice away (feed the crew or sell the Food) and turn a player's estate into the colonists'
problem. `packages/engine/src/upkeep.ts::runUpkeep` keeps its order: players eat from their depots first, then the colonists from the
store (WS7's C1).

```
C10 · MODIFIED · each kind of plot's crew eats and drinks its own amount

today        needsOf: Food = baseFood + ⌈crew ÷ crewPerFood⌉, Water = baseWater + ⌈crew ÷ crewPerWater⌉;
             crew 1 per raw plot, 2 per factory, 0 on a green belt · anchors: packages/engine/src/production.ts::crewOf,
             packages/engine/src/production.ts::needsOf, packages/engine/src/config.ts::UPKEEP · verified_by: read
tomorrow     MUST read Food and Water per plot from one CONSUMPTION table in config.ts (RULE-10);
             MUST keep the household base; crewOf, UPKEEP.crew, crewPerFood and crewPerWater go once
             nothing reads them
logic        → RULE-10 · evaluated wherever needsOf is (upkeep, auction status, hunger, irrigation, walking pace)
seam         packages/engine/src/production.ts::needsOf — every reader of a player's Food and Water need already calls it
senior       junior would: lower crewPerFood to 3, or multiply the crew by a per-type factor beside crewOf ·
             senior does: one table read by the existing seam; the ¼ steps sum before one round-up, so a
             player with three farms doesn't pay three round-ups
mechanism    in_place
call sites   (grep-built; the repo isn't prism-indexed) needsOf: engine upkeep.ts, auction.ts (2), economy.ts
             ::playersUse, game.ts (hungry flag), dev-walk.ts (walking pace), production.ts (irrigation dry
             check, monthNeeds); server mule-game.ts (2, the view); ai value.ts (4). crewOf: production.ts
             ::needsOf, ai value.ts. UPKEEP.crew* copies: ai value.ts (C12), ai llm/manual.ts (the text)
pin          baseFood 2 and baseWater 1 unchanged; the irrigation rule (an owner short of Water makes half)
             now counts the farm's own Water, by design; engine tests that pin the old crew sums change, named
             in the PR
owner        WS1 (production.ts, config.ts UPKEEP)
```

```
C11 · MODIFIED · a factory burns a running draw on top of its recipe

today        energyUseOf: raw plot → UPKEEP.energyUse[good]; factory → factoryFit(...).energy (the recipe's
             Energy) · anchor: packages/engine/src/production.ts::energyUseOf · verified_by: read
tomorrow     MUST read a raw plot's Energy from CONSUMPTION (same values as energyUse today); a factory's is
             the recipe's Energy plus CONSUMPTION[good].energy; a green belt 0; UPKEEP.energyUse goes
logic        → RULE-10
seam         packages/engine/src/production.ts::energyUseOf — AM-17's turn-off order, monthNeeds and playersUse read it; the
             factory run in packages/engine/src/production.ts::runProduction draws fit.energy × cold directly today and MUST
             draw energyUseOf × cold instead, or the draw is counted but never taken (found by the prototype)
senior       junior would: raise the recipes' Energy inputs · senior does: leaves the recipes (factory output
             and the turn-off share read them) and adds the draw where use is summed
mechanism    in_place
call sites   production.ts (turn-off list, the factory run and its second-pass shortness check, monthNeeds),
             packages/engine/src/economy.ts::playersUse, ai value.ts (the factory yield's Energy)
pin          an Energy plant still pays its own use from its own output (AM-17 R2); recipes unchanged
owner        WS1
```

```
C12 · MODIFIED · the AI plans with the same table

today        ai value.ts copies the crew formula: a plot's crew cost (y.crew × (P(food) ÷ crewPerFood +
             P(water) ÷ crewPerWater)) and the needs with one more factory (baseFood + ⌈crew ÷ crewPerFood⌉)
             · anchors: packages/ai/src/value.ts (the yield's crew, cashReserve's needs) · verified_by: read
tomorrow     MUST price a plot's upkeep from CONSUMPTION[outfit] and take "needs with one more plot" from
             one exported engine helper (needsWith(state, playerId, outfit)), never a copy (HC-11)
seam         packages/engine/src/production.ts::needsOf, extended by needsWith beside it
senior       junior would: update the copy's constants · senior does: deletes the copy; the AI asks the engine
mechanism    extract (needsWith) then in_place
call sites   value.ts (the yield, cashReserve), llm/manual.ts's sentence about crews (text only)
pin          the AI's other reads of needsOf unchanged
owner        WS1 (value.ts), WS2 (manual.ts text)
```

```
C13 · MODIFIED · the store's demand estimate is players + crews + colonists, with no wage cap

today        monthlyDemand: players' needsOf + plots' Energy (playersUse) + colonistDemand(...) (wage-capped)
             + a festival + the export ship · anchor: packages/engine/src/economy.ts::monthlyDemand · verified_by: read
tomorrow     MUST be RULE-11: playersUse (now through C10, C11) + the colonists' full need (WS7's C2) +
             festival + export; nothing else changes in the function
logic        → RULE-11 · evaluated wherever monthlyDemand is (prices, the store's shelf targets, the AI)
seam         packages/engine/src/economy.ts::monthlyDemand — the one demand; #390's months of cover (its RULE-5 D) reads it
senior       junior would: add a second "overall demand" beside monthlyDemand for the new pricing · senior
             does: one demand, which the store's price, its shelf target and the AI all read
mechanism    in_place (no new code beyond C2, C10, C11: this change is the rule that names the sum)
pin          the export ship's take and the festival's Food unchanged
depends_on   C2 (data: no wage cap), C10, C11
owner        WS1 (economy.ts)
```

**Measured: the 10 seed-1 games, before and after** (trunk 2eccd439, a throwaway prototype of C10–C13; 4 trader
seats, rotating personas, walking on, full 12 months; demand sampled when the goods auction opens; "sold out" = the
store had none to sell players at some point in that good's auction; "hungry" = the game's own flag, a seat holding
less Food than its need; "+ meal" adds a stand-in for WS7's C1, colonists taking their need from the store free).

| | politics off: today | table + full colonist demand | + meal | politics on: today | table + demand | + meal |
|---|---|---|---|---|---|---|
| Store demand Food / Water / Energy, a month | 18.0 / 12.9 / 18.0 | 19.3 / 16.8 / 19.1 | 19.3 / 16.8 / 18.7 | 18.1 / 12.8 / 17.4 | 19.2 / 16.3 / 18.6 | 19.3 / 16.6 / 18.6 |
| … in month 12 | 19.1 / 12.5 / 25.2 | 21.5 / 20.5 / 27.7 | 21.5 / 21.0 / 26.7 | 19.4 / 12.5 / 25.8 | 21.2 / 19.1 / 25.9 | 21.5 / 19.8 / 26.3 |
| Players' own need F / W / E | 14.6 / 9.3 / 16.4 | 14.7 / 12.2 / 16.8 | 14.6 / 12.1 / 16.3 | 14.6 / 9.2 / 15.8 | 14.7 / 11.9 / 16.3 | 14.7 / 12.0 / 16.4 |
| Months the store sold out F / W / E (of 120) | 108 / 94 / 101 | 109 / 95 / 101 | 110 / 96 / 98 | 106 / 89 / 101 | 109 / 87 / 101 | 107 / 91 / 99 |
| Months colonists went short F / W (of 120) | 50 / 62 | 56 / 69 | 54 / 67 | 55 / 63 | 50 / 56 | 52 / 59 |
| Hungry seat-months (of 480) | 403 | 406 | 410 | 399 | 401 | 399 |

What it says:
- **Water is where demand moves**: about +30% a month, rising to about 20 by month 12 as farms and plants spread.
  Players' own Food need is unchanged on average (the table keeps today's rate of a quarter Food per crew);
  the +1 Food a month in store demand is the colonists' full need now counted (WS7's C2).
- **The colony is already short of everything, today**: the store runs out for players in 9 of 10 months and seats
  are hungry in 83–85% of seat-months, before and after. The table neither causes nor cures that: supply does
  (Heiko's C29 pass). It matters for the store's pricing (#390's rework reads this demand).
- Politics on and off move the same way; the meal stand-in changes the colonists' own hunger, which is WS7's.

**Decision for Heiko (WS5): how hungry are crews?**
- **A (recommended for now): the table above.** Every type has its own character, Water rises about 30%, Food
  stays at today's rate. Pro: no new hunger on a colony that is already short. Con: "more crews, more Food" holds
  at today's rate, not a steeper one.
- **B: hungrier crews** (mines ¾, Crystite 1, factories ¾ Food): about +1½ Food a seat a month by mid-game. Pro: crews
  are clearly the key demand. Con: without more Food supply (C29) it deepens a shortage that already reaches 9 months
  in 10; best decided with C29's supply numbers.

```
C14 · MODIFIED · a crew left short works slower next month (replaces the dry-farm halving)

today        crews have no state; a farm makes half when its owner holds less Water than needsOf before
             production (packages/engine/src/production.ts::runProduction, `dry`, UPKEEP.irrigated,
             UPKEEP.shortOutputShare) · verified_by: read + executed (59% of farm-months cut)
tomorrow     MUST record, at upkeep after the household eats, each player's crew shortfall for Food and Water
             (missing ÷ crews' table need); MUST scale every plot of that player but Energy plants by RULE-12's
             factor in the next production, before AM-17's Energy turn-off; the dry-farm halving goes
logic        → RULE-12 · written at upkeep, read at production
seam         packages/engine/src/upkeep.ts::runUpkeep (writes) · packages/engine/src/production.ts::runProduction (reads)
senior       junior would: judge crews at production from the stock in hand · senior does: last month's meal,
             because production runs before the month's market, so stock in hand reads nearly everyone short
mechanism    in_place · the curve is WS7's RULE-2 function, imported, never copied
pin          Energy plants unchanged (AM-17 R2); output rounding half up as offOutputShare
owner        WS1 (upkeep.ts, production.ts, config.ts), WS3 (types.ts: Player.crewShort)
measured     10 seed-1 games, politics on: colony Food 10.2 → 14.8 a month, colonists short of Food 74 → 61,
             colonists at the end 72 → 74; Water short 34 → 53 (the next lever is power, not this rule)
```

```
C15 · MODIFIED · a player is hungry when their household went short at the last month's end

today        packages/engine/src/game.ts::startDevelopment sets hungry when stock < max(1, needsOf.food), read
             after upkeep's 50% Food spoilage: 83% of seat-months, 214 of 258 seats that ate in full (WS1)
tomorrow     MUST set hungry from the household's last meal (short of UPKEEP.baseFood at upkeep)
seam         packages/engine/src/upkeep.ts::runUpkeep (records) · packages/engine/src/game.ts::startDevelopment (reads)
mechanism    in_place
owner        WS1 / WS3 (game.ts named edit) · decision for Heiko ("When is a player hungry?")
```

```
C16 · MODIFIED (config) · Food spoils a quarter a month in a player's stock, not half — decision for Heiko

today        GOOD_CONFIG.food.spoilage 0.5 (the store's follows it at PRICE.storeSpoilage)
tomorrow     0.25, set in the supply pass with the power supply (D6), never alone
measured     with C14: hungry seat-months 391 → 354, colonists at the end 74 → 80, the best of six rules tried
owner        WS1 (config.ts)
```

**Measured, and not proposed:** doubling the crews' table (colony Food 14.8 → 4.8 a month; 64 colonists at the end)
and switching farms and wells off last (no gain: the power is short whichever plots wait). Power supply is the
first lever (WS1's measurement): plants from month 1; the supply pass (WS1, WS9 for the computer players) owns it.


### Colony health and Electronics: the store, players and crews (WS5, approved 6 Nov)

Heiko approved the colony economy explainer v3 on 6 Nov (`docs/explainers/2026-11-06-colony-economy.html`, a28b861b):
decisions 23 (health on with the Medicine supply), 24 (sickness reaches players as an addition), 25 (sick crews from
a fifth; the computer players learn one Medicine cures them) and 27 (the colonists' Electronics want reaches its
inputs; the price is the signal, the ceiling a safety rail). WS7 writes the colonists' side (the sick share, its
mood, growth and Medicine need, the Electronics bonus) in its own ids; this section reads WS7's sick share `h`
(0..HEALTH.max 0.4) and never computes it.

```
C17 · MODIFIED · the colonists' Electronics want is store demand, and reaches Rare earth and Alloy

today        demand.electronics = 0 (+ the export ship); demand.rareEarth and demand.alloy = one per standing
             Electronics works · anchor: packages/engine/src/economy.ts::monthlyDemand · verified_by: read (trunk 38070ffb)
tomorrow     MUST add E = colonists ÷ UPKEEP.colonistsPerElectronics (new, 50) to demand.electronics, and E ×
             RECIPES.electronics.inputs[g] to demand.rareEarth and demand.alloy, on top of today's terms (RULE-13)
logic        → RULE-13 · evaluated wherever monthlyDemand is
seam         packages/engine/src/economy.ts::monthlyDemand — the one demand every price and the AI read
senior       junior would: count the want once someone makes Electronics · senior does: counts it from month 1,
             so the price rises before the first works stands (Heiko: the price is the signal), and passes it
             to the inputs through the recipe, so mines and smelters see it too
mechanism    in_place
call sites   monthlyDemand's readers: postPrices → nextPostedPrice, storeWants, cover, ai outlook.ts
pin          the export ship's take; Smithore's demand (decision 27 names Rare earth and Alloy only)
depends_on   store pricing's RULE-6 bands (docs/specs/2026-11-05-ws5-store-pricing.md, data, not stubbable):
             under today's pricing the same demand ran the price to 80,738
atomicity    lands before, or in the same batch as, WS9's chain build (AM-32): without it Electronics has no
             colony demand and sits at its off-world price (pricing RULE-6 row 1)
owner        WS1 (economy.ts, config.ts UPKEEP, named edit); WS7's +4 bonus reads the same colonistsPerElectronics
```

```
C18 · ADDED · the colony's sickness reaches players (an addition) and crews (from a fifth)

today        a player's sickness odds read the air and their pollution only (EVENTS.player.sickness through
             packages/engine/src/events.ts::eventChance); crews are never sick · verified_by: read (trunk 38070ffb)
tomorrow     MUST add HEALTH.playerSpill (0.10) × h ÷ HEALTH.max to the player sickness row's chance, within
             its cap (RULE-14); MUST make a player's crews sick at production when h ≥ HEALTH.crewSickFrom (0.2)
             unless the player's depot gives 1 Medicine, and cut that player's output by RULE-15; MUST add that
             1 Medicine to the player's needs (needsOf), so the AI and the auction see it without a copy
logic        → RULE-14 (eventChance, development) · RULE-15 (runProduction, after RULE-12, before AM-17's turn-off)
seam         packages/engine/src/events.ts::eventChance (the row's chance) · packages/engine/src/production.ts::runProduction
             (the crew cut beside C14's) · packages/engine/src/production.ts::needsOf (the cure's Medicine)
senior       junior would: multiply the odds (×1 to ×4: players sick in 387 of 480 dirty-air months, measured)
             and teach the AI the cure in value.ts · senior does: an addition bounded by the row's cap, and the
             cure as a need in needsOf, which every reader already asks (HC-11's pattern)
mechanism    in_place
call sites   eventChance: game.ts startDevelopment (rollPlayerEvent 'sickness'); runProduction: game.ts (one);
             needsOf: as C10's list
pin          with HEALTH.enabled false every term is 0 (HC-13); Energy plants are never cut (AM-17 R2, as C14)
depends_on   WS7's sick share h (data, stubbable as h = 0)
owner        WS1 (events.ts, production.ts, config.ts HEALTH named edits)
```

```
C19 · ADDED · the view carries colony health, whether Medicine ran short, and for how many months

today        MuleView carries colonistsFed only (packages/protocol/src/index.ts::MuleView, from
             apps/server/src/mule-game.ts::colonistsFedAt) · verified_by: read
tomorrow     MUST carry colonyHealth: { health, medicineShort, shortMonths } | null (§3), null while health is off or politics is off;
             the engine MUST keep the run of months Medicine ran short beside WS7's sick share, written at upkeep
             after the colonists' meal
seam         packages/protocol/src/index.ts::MuleView (the contract) · apps/server/src/mule-game.ts (the view)
             · packages/engine/src/upkeep.ts::runUpkeep (the count)
senior       junior would: let the phone derive the months from past views · senior does: the engine counts it,
             so a reconnecting phone and the TV read the same number
mechanism    sprout
ux           WS8's colony-health mock (design/mocks at de672e61, the phone's gauge and cause line, SEAM shortMonths);
             display bands ruled by WS5 6 Nov: Well ≥ 90 · Sick spell 61–89 · At the limit 60
depends_on   WS7's sick share and the colonists' Medicine meal (data, stubbable)
owner        WS3 (protocol, mule-game.ts named edit); WS1 (upkeep.ts named edit); WS8 builds the phone from the mock
```
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
H_new = min(HARDSHIP.memoryCap (2), HARDSHIP.memoryKeep (0.5) × H_old + g(s))
starts 0 with the colony; politics off: none (HC-5)
reads  a fed month halves it; the same shortfall month after month settles at 2 × g(s), so g ≤ 1
       keeps H ≤ 2 and the cap only guards a later change to memoryKeep (measured: H reached 2.0)
```

```
RULE-4 · The month's mood (C3)                                    shape: sequence
1  target = today's target with the shortage term replaced by − HARDSHIP.targetPerHardship (6) × H_new
2  mood   = moodStep(mood, target)                    the 5-point cap, unchanged
3  mood   = mood − round(HARDSHIP.shock (8) × g(s))   at once, uncapped (as moodShift), floor 0
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
a row's mood points in band b = row.mood[b] × (b ∈ {restless, unhappy, unrest} ? 1 + HARDSHIP.unrestPerHardship (0.25) × H : 1)
H at its cap (2) → ×1.5. Rows with no mood points, and politics off, are unchanged.
```

```
RULE-7 · The sick share (C7)                                      shape: formula
p        = HEALTH.base (0.01) + HEALTH.perHunger (0.2) × g(s) + HEALTH.perMedicine (0.2) × g(s_med)
           + HEALTH.contagion (0.15) × h_old         g: RULE-2's curve; s: RULE-2's severity (Food, Water)
newSick  = (1 − h_old) × p
recover  = h_old × HEALTH.recovery (0.5) × (1 − HEALTH.medicineCut (0.3) × s_med)
h        = min(HEALTH.cap (0.4), max(0, h_old + newSick − recover))
reads    recovery (0.5, at least 0.35) is always above contagion (0.15): fed and treated, h settles
         near 0.03 whatever it was. With no Medicine it settles near 0.44, so it sits at the cap
         (m26 on WS5's baseline: 95 of 120 months): why health ships with the Medicine supply
unknown  health off → h = 0; no colony (politics off) → none
```

```
RULE-8 · Health's effects (C8)                                    shape: formula
mood target −= HEALTH.moodPerSick (10) × h   · growth rate −= HEALTH.growthPerSick (0.05) × h
Medicine need ×= (1 + h_old)                 · crews: WS5 RULE-14 reads h (sick from HEALTH.crewSickFrom 0.2)
```

```
RULE-9 · The Electronics comfort (C9)                             shape: formula
want = colonists / UPKEEP.colonistsPerElectronics (50) · took = min(want, store stock)
mood target += HEALTH.electronicsBonus (4) × (took / want); want 0 → 0; never negative
```

### WS5's rules

```
RULE-10 · A player's Food, Water and Energy need (C10, C11)            shape: formula
inputs        plots   the player's tiles with an outfit (Outfit = a good or greenBelt); none → household only
              CONSUMPTION[outfit] = { food, water, energy }, quarters, ≥ 0
then          food   = UPKEEP.baseFood  + ⌈Σ CONSUMPTION[o].food − ε⌉      (ε 1e-9: the sums are exact quarters)
              water  = UPKEEP.baseWater + ⌈Σ CONSUMPTION[o].water − ε⌉
              energy(tile) = raw: CONSUMPTION[o].energy · factory: recipe Energy (factoryFit) + CONSUMPTION[o].energy
                             · greenBelt: 0 · an Energy plant's comes from its own output (AM-17 R2, existing)
examples      no plots → 2 / 1 · 3 farms + well → 2 + ⌈1⌉ = 3 / 1 + ⌈1½⌉ = 3 · 2 Smithore + Crystite + plant →
              2 + ⌈2⌉ = 4 / 1 + ⌈1½⌉ = 3 · a lone green belt → 2 / 1 + ⌈½⌉ = 2
```

```
RULE-11 · The store's monthly demand for a colony good (C13)           shape: formula
D_g     = Σ players RULE-10 food/water (household + crews)            g ∈ {food, water}
        + Σ worked plots' energy (RULE-10), but Energy plants          g = energy
        + colonists' need: colonists ÷ colonistsPerUnit (Food, Water), × colonistEnergyShare (Energy),
          ÷ colonistsPerMedicine × sickness (Medicine) — full need at any price (WS7 C2)
        + a festival's Food (existing) + the export ship's take (existing)
unknown   none: every term is a count in state
example   4 seats of "3 farms + well", 100 colonists: Food 4 × 3 + 5 = 17 (today 4 × 3 + 5 × wage share)
```


```
RULE-12 · A crew's working share (C14)                                 shape: formula
inputs        sF, sW  the player's crew shortfall at last upkeep, ∈ [0, 1]; month 1 → 0; crews' need 0 → 0
then          f = (1 − crewDrop × g(sF)) × (1 − crewDrop × g(sW)),  g = WS7 RULE-2 (tolerance 0.1, power 1.5),
              crewDrop 0.5 (named, config); output = round-half-up(output × f), Energy plants excepted
examples      sF 0.1 → f 1 · sF 0.5 → 1 − 0.5 × 0.296 = 0.85 · sF 1 → 0.5 · sF 1 and sW 1 → 0.25
```


```
RULE-13 · The colonists' Electronics want (C17)                      shape: formula
E            = colonists ÷ UPKEEP.colonistsPerElectronics (50)        ≥ 0, not rounded (demand is a rate)
electronics += E · rareEarth += E × RECIPES.electronics.inputs.rareEarth · alloy += E × RECIPES.electronics.inputs.alloy
unknown      none: colonists is a count in state
example      200 colonists → Electronics +4, Rare earth +4, Alloy +4 a month; 0 colonists → nothing
```

```
RULE-14 · A player's sickness odds with a sick colony (C18)            shape: formula
chance' = min(row.cap, chance + HEALTH.playerSpill × h ÷ HEALTH.max)     chance = today's eventChance
examples h 0 → unchanged · h 0.4, clean air (0.03) → 0.13 · h 0.2 → +0.05
```

```
RULE-15 · Sick crews (C18)                                             shape: decision table, then formula
evaluated at production, per player; first match wins
  #  when                                     then
  1  HEALTH.enabled false, or h < crewSickFrom  no sick crews
  2  the player holds ≥ 1 Medicine              they take 1 Medicine; no sick crews this month
  3  otherwise                                  sick share k = min(1, HEALTH.crewSpill (1) × h)
output   every plot of that player but Energy plants: round-half-up(output × (1 − HEALTH.crewSickDrop (0.5) × k)),
         applied after RULE-12's factor and before AM-17's Energy turn-off
examples h 0.19 → none · h 0.3, no Medicine, a farm making 4 → 4 × 0.85 = 3.4 → 3 · h 0.3, 1 Medicine → 4, Medicine −1
```
## The curve: shortfall → mood change in one month

From a Content colony at 60 with its target at 60 and no memory, Water fed, Food short by the
share shown. A = recommended, B = thin, "today" = trunk.

| Food short | g(s) | A: step + shock | A: mood | B (step only) | today | colonists A / today |
|---|---|---|---|---|---|---|
| 0–10% | 0 | 0 + 0 | 60 | 60 | 55 | ×1.04 / ×0.95 |
| 20% | 0.04 | 0 + 0 | 60 | 59 | 55 | ×0.98 / ×0.95 |
| 30% | 0.10 | −1 − 1 | 58 | 56 | 55 | ×0.97 / ×0.95 |
| 40% | 0.19 | −1 − 2 | 57 | 55 | 55 | ×0.96 / ×0.95 |
| 50% | 0.30 | −2 − 2 | 56 | 55 | 55 | ×0.95 / ×0.95 |
| 60% | 0.41 | −2 − 3 | 55 | 55 | 55 | ×0.94 / ×0.95 |
| 70% | 0.54 | −3 − 4 | 53 | 55 | 55 | ×0.93 / ×0.95 |
| 80% | 0.69 | −4 − 5 | 51 | 55 | 55 | ×0.92 / ×0.95 |
| 90% | 0.84 | −5 − 7 | 48 | 55 | 55 | ×0.91 / ×0.95 |
| 100% | 1 | −5 − 8 | 47 | 55 | 55 | ×0.90 / ×0.95 |

In one month A is gentler than today up to about 60% short and harsher beyond it; today's −5
falls on a 5% miss and a famine alike. The same shortfall held month after month (A): the memory
settles at 2 × g(s), so the target settles at 60 − 12 g(s) and the shock repeats. 20% short
holds 60; 50% short settles at about 54 (Restless); 100% short runs 47, 43, 40, 37 (Unhappy), 34,
31, 28, 25: about 3 a month, since the shock (8) outweighs the step back up (5).

## Worked example: three months (WS7)

Colony of 400, need 20 Food and 20 Water a month; Water fed throughout; mood 60 (Content), no
memory; nothing else moves the mood. Population rounded each month.

| Month | Food | s | g(s) | memory H | target | mood: step, shock → | band | colonists A | today: mood, colonists |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 19 of 20 | 0.05 | 0 | 0 | 60 | 60, 0 → **60** | Content | 400 × 1.04 = **416** | 55, 380 |
| 2 | 10 of 20 | 0.50 | 0.30 | 0.30 | 58.2 | 58, −2 → **56** | Restless | 416 × 0.95 = **395** | 52, 361 |
| 3 | 20 of 20 | 0 | 0 | 0.15 | 59.1 | 59, 0 → **59** | Restless | 395 × (1.04 − 0.01) = **407** | 57, 375 |

- Month 1: a 5% miss is inside the tolerance. Nothing happens; the colony grows. Today it costs
  −5 mood and −5% colonists.
- Month 2: half rations. The step takes 2 (the target fell 1.8) and the shock 2 more. The colony
  shrinks 5%, and the unrest-band events' odds rise ×1.07.
- Month 3: fed. The mood climbs 3 but stays Restless, because the memory still holds the target
  0.9 below 60; the colony grows 4% less C27's Restless 1%. In month 4 (fed) the memory halves to
  0.07 and the mood is back at 60, Content.

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

**D4 · Starting numbers** (all placeholders, HC-25): tolerance 10%, power 1.5, shock 8,
6 target per point of memory, memory keeps 0.5 a month and caps at 2, unrest odds +25% per point
of memory, shrink 0.10 × shortfall. These are the measured A3 set; the first set (shock 15, 12,
+50%) sent 8 of 10 sim games into Unrest. Heiko may want a gentler or harsher curve; the §Curve
table is what each shortfall costs.

**D6 · Ship the hardship rule with the supply fix, not before it.** Today's sim colony is short of
Food or Water in 91 of 120 months, more than half short in 79 (WS5's section: the store runs out
for players about 9 months in 10). Any rule that counts how short they went makes that colony
unhappier than today's −5 cap does (§Measurement). Recommended: build C1–C6 in the same milestone
as WS5's C10–C13 and tune them together in C29, so the table first meets hardship in a colony that
can be fed. The alternative, ship it alone now, shows the hardship honestly but on a colony that
is underfed by today's supply, and most months would read Unhappy.

**D5 · The store's lost income.** Colonists' payments stop. The store's money is already
unlimited and never shown (Heiko, 22 Oct), so nothing is needed. The measurement reports the
payments that disappear.

## Measurement: mood bands before and after, 10 seed-1 games (WS7)

Same 10 games (seeds 1–10, 4 AI traders, politics on), 120 month ends per row; mood band after
each month's step; trunk 2eccd439. Script and per-month rows:
`ws7-politics/.handover/ws7-findings/m18/` (m18-*, m18b-*). The trunk row was checked against
unpatched trunk: identical at every month end.

| Variant | Restless | Unhappy | Unrest | games ending in Unrest | mood at m12 (mean) | colonists at end (mean) |
|---|---|---|---|---|---|---|
| T · today | 68.3% | 31.7% | 0% | 0 | 36.4 | 71.7 |
| TC · today + C27 | 68.3% | 31.7% | 0% | 0 | 37.3 | 60.1 |
| B2 · thin, wage ceiling gone | 51.7% | 42.5% | 5.8% | 2 | 28.2 | 70.2 |
| A2 · recommended shape, first numbers | 27.5% | 15.8% | 56.7% | 8 | 11.4 | 36.2 |
| **A3 · recommended shape, softened numbers** | 36.7% | 55.0% | 8.3% | 3 | 24.2 | 49.2 |

Thriving and Content are 0% in every row: the colony starts at 60, its base target is 60 (the
Content line), and something is always short.

| Social events over 10 games | T | TC | B2 | A2 | A3 |
|---|---|---|---|---|---|
| general strike | 10 | 9 | 11 | 31 | 13 |
| MULE theft | 9 | 9 | 13 | 40 | 19 |
| blamed for unrest | 5 | 5 | 7 | 31 | 15 |
| walkout | 6 | 6 | 6 | 20 | 9 |
| emigration wave | 5 | 5 | 7 | 14 | 8 |
| riot | 2 | 2 | 2 | 5 | 4 |

What it says:
- **The colony is underfed today.** Colonists went short in 91 of 120 trunk months, more than
  half short in 79; the Water shelf was empty in 54. Only 30 of those months were short because
  of the wage cap alone (all in months 6–12, during price spikes: Food at 1,234–1,851 in game 2).
  Supply is the root, and it is WS5's part and C29's tuning (D6).
- **The first numbers spiral.** A2's unrest raises strikes and thefts about 3.5×, which cuts supply
  further; 8 of 10 games end in Unrest, the first by month 4–7. Moving the shock after the step
  (A to A2) changed little.
- **The softened numbers hold.** A3: 3 of 10 games touch Unrest, events about 1.5× today, mostly
  Unhappy months, 22 colonists fewer than today at the end.
- **The thin option looks gentler here, for the reason it loses.** B2 keeps the 5-point cap on
  every shortfall, so a colony more than half short most months pays the same −5 it pays today.
  That flatness is what Heiko asked to remove; on a fed colony (D6) the two differ only in deep
  shortfalls.
- **C27 alone costs about 12 colonists** (T to TC), the migration offsets in Restless and Unhappy.
- **Taking the wages out of the store's restock bid is worth about 12 colonists by itself** (B to
  B2: months more than half short fall from 71 to 57), because the store restocks Food and Water
  in price spikes instead of stopping at what colonists could pay.
- **The store's lost income:** colonists paid it 51,951 cr over the 10 games. Its capital was
  already below 0 in 7 of 10 trunk games, and nothing reads it before buying
  (`packages/engine/src/economy.ts::storeWants`), so D5 needs nothing.

## §3 · Contracts & Data Models `[handoff]` (WS5's part)

**colonyHealth on MuleView** (C19; ADDED, optional, not breaking). In `packages/protocol/src/index.ts::MuleView`:
`colonyHealth: { health: number; medicineShort: boolean; shortMonths: number } | null`.
- `health` = round(100 × (1 − h)), 60..100 (h is WS7's sick share, capped at 0.4).
- `medicineShort` = the colonists took less Medicine than their need at the last upkeep.
- `shortMonths` = consecutive upkeeps with `medicineShort`, 0 when it is false.
- null exactly while HEALTH.enabled is false (HC-13) or the game has no colony (politics off: no h, WS7 T-AC-11);
  never null for another reason.
Example: h 0.12, short at the last three upkeeps → `{ health: 88, medicineShort: true, shortMonths: 3 }`.
The phone's cause line ("Medicine ran short", WS8's mock) reads the last two; the gauge reads `health` in WS5's bands.

## §6 · Acceptance Criteria `[handoff]`

| AC | Given · When · Then | Changes | Proof |
|---|---|---|---|
| B-AC-1 | Given a politics game whose colonists need 20 Food and the store holds 19 · When upkeep ends · Then the mood is unchanged, the colonists grow 4%, and the month-end line says "19 of 20 Food" | C1, C3, C4, C6 | engine test on GameState + server view test of the line |
| B-AC-2 | Given the same colony at mood 60 short 10 of 20 Food · When upkeep ends · Then the mood is 56 and the colonists shrink 5% | C3, C4 | engine test |
| B-AC-3 | Given the colony of B-AC-2 fed in full the next month · When upkeep ends · Then the mood is 59, not 60, and the colonists grow 3% (Restless) | C3, C4 | engine test |
| B-AC-4 | Given Food posted at 300 and the shelf holding the colonists' need · When upkeep ends · Then they are fed in full and store.capital is unchanged by their meal | C1, C2 | engine test |
| B-AC-5 | Given a politics-off game short 10 of 20 Food · When upkeep ends · Then the colonists shrink 5% and there is no mood (D1 a) | C1, C4 | engine test |
| T-AC-1 (B-AC-1..3) | RULE-2: g at s = 0, 0.10, 0.11, 0.5, 1 is 0, 0, ≈0.001, 0.296, 1; s is the worse of Food and Water | C3 | engine unit |
| T-AC-2 (B-AC-3) | RULE-3: H from 0 by g 0.3 → 0.3; fed → 0.15; g 1 every month → 1, 1.5, 1.75 … toward 2; memoryCap 2 holds under a test override of memoryKeep | C3 | engine unit |
| T-AC-3 (B-AC-2) | RULE-4: the step comes before the shock; shock 8 × g, rounded, floor 0 | C3 | engine unit |
| T-AC-4 (B-AC-1,2,5) | RULE-5: every row and example, incl. the floor at 0 under a test override | C4 | engine unit |
| T-AC-5 (serves G-1) | RULE-6: an unrest row's points ×(1 + 0.25 H); a thriving row's unchanged; politics off unchanged | C5 | engine unit |
| T-AC-6 (B-AC-4) | RULE-1: need 0 → s 0; stock 0 → s 1; no credits move | C1 | engine unit |
| T-AC-7 (UBER-AC-2) | `colonistBudget` no longer exists in packages/engine/src; the store's restock bid (today's premium, or #390's bands if approved) reads no colonist wage | C2 | grep + auction test |
| B-AC-6 | Given health on, a colony at h 0.3, fed and with all its Medicine · When upkeep ends · Then h falls (0.3 → about 0.19) and the mood's target is about 1.9 lower than with h 0 | C7, C8 | engine test on GameState |
| B-AC-7 | Given health on and no Medicine on the shelf for months · When upkeeps pass · Then h never exceeds 0.4 and the phone's colonyHealth (WS5 C19) shows health 60 | C7, C8 | engine test + server view test |
| B-AC-8 | Given 400 colonists and 8 Electronics in the store · When upkeep ends · Then the colonists take 8, and the mood's target is 4 higher; with none in the store it is unchanged | C9 | engine test |
| T-AC-8 (B-AC-6, 7) | RULE-7 rows: fed and treated settles near 0.03; no Medicine stays at the cap; recovery > contagion for every s_med | C7 | engine unit |
| T-AC-9 (B-AC-6) | RULE-8: mood −10h, growth −0.05h, Medicine need ×(1 + h_old) | C8 | engine unit |
| T-AC-10 (B-AC-8) | RULE-9: bonus 4 × share; want 0 → 0; never negative | C9 | engine unit |
| T-AC-11 (WS5 HC-13) | health off: h stays 0 and nothing else moves; politics off: no h | C7 | engine unit |
| B-AC-10 | Given two seats, one with 2 Smithore mines + 1 Crystite mine + 1 plant, one with 3 farms + 1 well · When upkeep ends · Then the miner's household ate 4 Food and drank 3 Water, the farmer's ate 3 and drank 3 (RULE-10's examples). observed_at: each player's depot before and after upkeep. negative: a seat with no plots eats 2 and drinks 1 | C10 | engine test on GameState |
| B-AC-11 | Given an Electronics works that runs this month · When production ends · Then its owner's Energy fell by the recipe's Energy plus 2. observed_at: the owner's depot. negative: a works turned off for want of Energy draws only its share (AM-17) | C11 | engine test |
| B-AC-12 | Given 4 seats of "3 farms + well" and 100 colonists, Food posted at 300 · When prices are next posted · Then the store's Food demand is 17, not less (RULE-11's example). observed_at: monthlyDemand as the store's price reads it. negative: a festival month adds its Food on top | C13 | engine test |
| T-AC-20 (B-AC-10, 11) | RULE-10's examples, every row of CONSUMPTION summed exactly in quarters (ε), a lone green belt; HC-10's config guard passes | C10, C11 | engine unit |
| T-AC-21 (B-AC-10) | HC-11: no `crewPerFood`, `crewPerWater`, `UPKEEP.crew` or `energyUse` outside config history; value.ts asks needsWith | C12 | source scan, like engine-imports.test.ts |
| T-AC-22 (B-AC-11) | the factory run draws energyUseOf × cold: an Alloy works with 3 Energy in stock and use 3 runs; with 2 it is turned off (AM-17) | C11 | engine unit |
| T-AC-23 (B-AC-12) | `pnpm sim -- --games 10 --seed 1`, politics off and on: Water demand's 12-month mean rises from about 13 to about 16-17; hungry seat-months do not rise by more than 3% | C10-C13 | sim, against trunk at run time |
| B-AC-13 | Given a player whose crews got half their Food at last month's end · When production runs · Then each of their plots but Energy plants makes 85% of its output, rounded half up (RULE-12). observed_at: the month report's production lines. negative: a crew 10% short loses nothing | C14 | engine test |
| B-AC-14 | Given a player whose household ate in full and whose stock then spoiled below their need · When development starts · Then they are not hungry. observed_at: the player's walking pace. negative: a household short at upkeep is hungry | C15 | engine test |
| T-AC-24 (B-AC-13) | RULE-12's examples; no farm halving remains (grep UPKEEP.irrigated, shortOutputShare); the curve is imported from WS7's function | C14 | engine unit + scan |
| B-AC-15 | Given 200 colonists and no Electronics works · When prices are next posted · Then monthlyDemand's Electronics, Rare earth and Alloy are each 4 more than today's terms, and Electronics' band is not off-world. observed_at: monthlyDemand as postPrices reads it. negative: 0 colonists adds nothing | C17 | engine test |
| B-AC-16 | Given health on and h 0.4 · When a player's development sickness is rolled · Then its chance is today's + 0.10, within the row's cap. observed_at: eventChance for EVENTS.player.sickness. negative: h 0 leaves it unchanged | C18 | engine test |
| B-AC-17 | Given health on, h 0.3 and a player with a farm making 4 and no Medicine · When production runs · Then the farm makes 3; with 1 Medicine in the depot it makes 4 and the depot holds 1 less. observed_at: the month report's production lines and the depot. negative: h 0.19 cuts nothing | C18 | engine test |
| B-AC-18 | Given health on and the colonists short of Medicine at the last 3 upkeeps · When the phone's view is built · Then colonyHealth is { health, medicineShort true, shortMonths 3 }; after a month they get their Medicine it is { medicineShort false, shortMonths 0 }; with health off, or politics off, it is null. observed_at: the view the server sends | C19 | server view test |
| T-AC-25 (B-AC-15) | RULE-13's examples; the recipe is read, not copied (Rare earth and Alloy follow RECIPES.electronics.inputs under a test override) | C17 | engine unit |
| T-AC-26 (B-AC-16, 17) | RULE-14 and RULE-15's every row and example; needsOf's Medicine is +1 exactly when RULE-15 row 3 would apply; no copy of the cure in packages/ai (source scan, like T-AC-21) | C18 | engine unit + scan |
| T-AC-27 (HC-13) | with HEALTH.enabled false, 10 seed-1 sim games give the same final state as the same games on the base commit (every number), so health off is inert | C17-C19 | sim, against the base at run time |
| T-AC-28 (HC-13) | the switch-on PR's body reports, for 10 seed-1 games, months the colonists were short of Medicine (must be < 40 of 120), the mean sick share, months at the cap, colonists at the end, and player-sick months | C18 | sim report |

## §8 · Amendments

```
AM-1 · 2026-11-06 · WS5 · Heiko approved explainer v3 (a28b861b), all its options
target    §0.2 HC-13, HC-14; §1 C17-C19; §2 RULE-13-15; §3 (new, WS5's part); §6 B-AC-15-18, T-AC-25-28
said      health and Electronics lived in the explainer only
did       wrote WS5's side of decisions 23, 24, 25, 27 and the WS8 view contract into the spec; RULE-11's Medicine
          "× sickness" is WS7's health factor (up to +40% at the cap), replacing POLLUTION.sickMedicineDemand
because   the build plan (docs/plans/2026-11-06-ws5-colony-economy-build.md) needs every change it builds in a spec
goal      G-1, G-2 unchanged; WS7's colonist health ids are WS7's to add
```

## §9 · Ownership Boundaries

No ownership change. `colony.ts` stays the sole writer of the colony (the memory lives there);
`upkeep.ts` reads the band and writes the colonist count as today. Named edits: WS1 (upkeep.ts,
economy.ts, config.ts, events.ts), WS3 (auction.ts, mule-game.ts, protocol). C27's held branch
`origin/ws1-c27` is superseded by C4/RULE-5 if D1–D2 are approved; WS1 builds RULE-5 in its place.
