# WS5 · How the store sets its prices: a market-maker store

Class: **Standard** (Heiko, 5 Nov). Several files in two lanes' code (WS1's economy and config, WS3's auction,
game and types), two PRs, no new sole owner.
Approach: **B, the market-maker store** (Heiko, 5 Nov), with the ceiling at **12×** and Crystite **as proposed**
(σ 0.35, centre 90, φ 0.7, clamped 40–300).
Measured Today: trunk 43af74d2, the sim's own seats and loop (`simSeats` at trader, `playGameAsync`), no tuning;
200 games at 4 seats, 100 at 2 and at 6 (MULE: 100 / 50 / 50). Raw output and scripts: WS5's
`.handover/ws5-findings/store-pricing-today.txt`, `store2.mts`, `report2.py`, `mule.mts`.
Numbers are 4 seats unless marked.
The Today numbers predate #386, #393 and AM-18: every sim check in the plan compares against trunk at the time
it runs (the plan's first sim step records that base), never against these numbers.

Heiko's words, the provenance of every goal:
1. "we need to think about how the store sets its selling and buying prices based on this. also this needs to be a
   good clever algorithm." (*this*: auction rule E, buyers walking past a sold-out store, and sellers stopping at
   their own need.)
2. "i think the spread can be wider then what we are having currently … I want to get a complete design there"
3. "crystite is there for export only and the prices should vary from 40 to 300 getting more and more unlikely
   the higher they get. so a normal price should be about 90 with extremes that can go up to 300 very rare and
   lower extremes of 40"
4. His scope answers (5 Nov): Energy supply at the store in; the other export goods' off-world prices move too,
   with smaller swings than Crystite; the MULE price and the corral refill in; taxes out.

## Rework, 6 Nov: Heiko's five rules (PROPOSED, waiting for Heiko) `[handoff]`

Heiko, 6 Nov, close to his words: (1) the store knows OVERALL demand; when overall supply covers it, it sells at
the lowest, normal price. (2) If stock covers less than 2 months AND demand is bigger than production, prices
rise. (3) In a shortage they rise more dramatically. (4) In a severe shortage more again. (5) If the last trade
between players was very high, above the store's price, the store's price moves towards it. "Can be a function,
but also a function with steps." If approved, this replaces RULE-1's step and target and RULE-2's lean (AM-4).
Overall demand comes from the Colony-needs spec (`docs/specs/2026-11-06-colony-needs.md`, WS5's §1 C12): the
two specs share one demand.

### What players see at the table
- While the colony grows and stores enough of a good, its store price sits at its normal price (Food 30) and
  does not drift below it however full the shelves are. A full store simply stops buying.
- When the colony eats more than it makes and holds under two months of it, the store's price steps up the next
  month: a little when it is tight (Food 38), sharply in a shortage (60), very sharply in a severe one (120).
  Both lines move: in a shortage the store also pays more for Food (54 instead of 25), so selling to it pays.
- When players have just paid each other far more than the store asked, the store's price jumps towards that.
- Once the colony holds enough again, the price comes down a quarter a month, so a crisis is felt for a few
  months after it ends, then is forgotten.
- The hub's market strip, the auction and the TV tiles show the same store price (Task 1.1 Step 1b).

### The measures (RULE-5) — evaluated when prices are posted, each good
```
D  overall monthly demand        players' households + crews (consumption table) + their plots' Energy
                                 + colonists' full need (no wages) + a festival's Food + the export ship's take
                                 = economy.ts::monthlyDemand as Colony needs C12 makes it
S  stock                         the colony's: store shelf + players' depots (+ corral MULEs as Smithore)
                                 = economy.ts::colonySupply (existing)                         see Decision 1
P  expected production           this month's output of every worked plot making g, before Energy shortfalls
                                 and events: production.ts::rawOutput per raw plot, factoryFit(...).output per factory
M  months of cover               S ÷ D;  D = 0 → the good has no colony demand (export-only): off-world rule
```
"Shortage" and "severe shortage" are measured by M, and only count while P < D (the colony is eating into its
stock). Last month's colonist shortfall of g counts as severe, whatever M says (today's rule keeps that too).

### The bands (RULE-6, decision table, first match wins)
```
 #  when                                              band       target mid     store buys   store sells
 1  D = 0 (only the export ship wants it)             off-world  offWorld[g]    15% under    15% over   (existing)
 2  P ≥ D,  or  M ≥ 2                                 normal     N              15% under    15% over
 3  M ≥ 1                                             tight      1.25 N         15% under    20% over
 4  M ≥ 0.5  and colonists weren't short of it        shortage   2 N            10% under    25% over
 5  otherwise                                         severe     4 N            10% under    25% over
N = the good's normal price: store.refPrice[g] (existing; drifts with what players pay and, for export goods,
    towards the off-world price). Every number is a named PRICE value: normalCover 2, tightCover 1,
    shortCover 0.5, the three multipliers 1.25 / 2 / 4 and the per-band spreads.
```
Chart: target price against months of cover, while production is below demand (Food, N = 30):
```
 price
  120 |█████                                    severe   (M < 0.5)
   60 |     █████                               shortage (0.5 ≤ M < 1)
   38 |          ██████████                     tight    (1 ≤ M < 2)
   30 |                    ████████████████     normal   (M ≥ 2, or production keeps up)
      +----+----+----+----+----+----+----+---- months of cover
      0   0.5   1        2               4
```

### How the price moves (RULE-7)
```
up       a band's target above last month's mid: the mid goes straight to it (no momentum on the way up)
down     a target below last month's mid: the mid falls at most fallStep (25%) a month, never below the target
trade    T = the highest price players paid each other for g in last month's walk (store.lastWalk[g].highTrade)
         T above last month's store selling price → mid ≥ prev + tradePull × (T − prev), tradePull 0.5
         the store sold out while they traded (soldOutHigh, existing C5) → mid ≥ soldOutHigh ÷ (1 + sell half-spread)
ceiling  mid ≤ 12 × GOOD_CONFIG[g].refPrice (5 Nov, kept); floor: mid ≥ N (rule 1: normal is the lowest)
order    band target, move, trade, ceiling, then m = max(1, round(m)): the ceiling always wins
lines    buy = floor(mid × (1 − under)), sell = max(buy + 1, ceil(mid × (1 + over))) — the band's own spread
         storeQuotes is the one formula; comeUp, the hub strip and the TV tiles read it (Task 1.1 Step 1b)
```

### A Food month in each band (4 seats, D = 14 a month, N = 30)
| Band | The colony holds | Farms make | Mid | Store buys / sells |
|---|---|---|---|---|
| normal | 30 (M 2.1) — or 17 (M 1.2) with farms making 16 | 10 / 16 | 30 | 25 / 35 |
| tight | 20 (M 1.4) | 10 | 38 | 32 / 46 |
| shortage | 10 (M 0.7) | 8 | 60 | 54 / 75 |
| severe | 4 (M 0.3), or colonists went short last month | 6 | 120 | 108 / 150 |
| shortage + a high trade | 10, and players paid each other 95 last month | 8 | 60 + ½ × 35 = 78 | 70 / 98 |
| recovering | back to 30 after a severe month | 16 | 120 → 90 → 68 → 51 → 38 → 30 | follows the mid |

### Heiko's 5 Nov picks against the new rules
- Market-maker store: kept. The bands replace RULE-2's inventory lean as what moves the mid; the spread per band
  replaces the lean's widening, and the buy line now rises with a shortage (the buy-line fix, stronger).
- 12× ceiling: kept. Crystite as proposed: kept (an export-only good is row 1, the off-world walk; PR-2's C3).
- 4 Food per seat at the start: kept; month 1 will usually read "tight" (WS9's month-1 finding), which is the honest
  signal. The AI's sell-surplus behaviour: kept; the store's buy line is never below 0.85 N now.
- **Conflict 1**: rule 1 ("the lowest, normal price") against G-1's glut step (after the store stopped buying, its
  next buy line is lower; B-AC-2). Decision 4.
- **Conflict 2 (with Colony needs)**: colonists without wages leave HC-4's cap (a Food buy line under the
  colonists' budget) with nothing to measure against. Recommended: drop HC-4; the ceiling and rule 1's floor bound
  the buy line.

### Decisions for Heiko
1. **What counts as stock.** A (recommended): the colony's — store plus players' depots. B: the store's shelf only.
   A: matches "overall supply"; a colony whose players hold Food isn't in a shortage. B: literal "store stock", but
   the store usually holds under a month while depots hold the rest, so prices would sit in the shortage bands
   most months.
2. **Steps or a curve.** A (recommended): the four steps above; plain to say at the table ("Food is short"), but a
   price jumps at a band's edge (38 → 60). B: a smooth curve through the same points (N × 2 ÷ M while P < D);
   no jumps, but nothing to name. C: a monthly rise per band (+15% / +40% / +80% a month while it lasts); a long
   shortage keeps climbing, but the price depends on history and overshoots once supply returns.
3. **How fast it falls back.** A (recommended): a quarter a month (120 → 30 in five months). B: half the gap a
   month (four months). C: straight back to normal (no memory of the crisis).
4. **Below normal in a glut.** A (recommended, rule 1 as worded): never; a full store stops buying (existing),
   G-1's glut step and B-AC-2 are dropped. B: keep a surplus band at 0.8 N when M ≥ 3; players who over-produce
   feel it, but that is a second rule beside Heiko's five.
5. **How hard a high trade pulls.** A (recommended): halfway. B: all the way to the trade's price less the spread.
   C: a quarter.

### Sim: the 10 seed-1 games, before and after
*(pending: filled at the next commit)*

## §0 · Business Goals & Value

**G-1 · The store's prices answer what happens at the table** `[handoff]`
- **Goal.** The store's buy and sell prices follow what the table does: how much it holds, how scarce a good is,
  what players paid each other this month, a sold-out store being bid past, a glut, and the colony's events. It
  is one clear rule a player can learn, not a set of patches. In scope by Heiko's answer: Energy supply on the
  store's shelf, and the MULE price with the corral refill.
- **Who benefits.** The players at the table (Heiko first), and the AI seats, which read the store's prices.
- **Today** (verified_by: executed): the posted price moves by the full momentum step most months (the median
  month-on-month change is 41–50% for Food, Water and Energy). There is no ceiling: Food reaches 1,985 (3,078 at
  2 seats) and Medicine 10,389. The store has nothing for players when Food comes up in 30% of auctions, Water in
  43% and Energy in 26%. It runs out mid-walk in 20% of Water and 19% of Energy auctions. Colonists, served
  first, go short of Food in 13% of months (50% of games) and of Water in 30% (76% of games). When the store is
  sold out, players pay each other up to about 11 spreads above its last sell line (Water p90), and next month's
  line doesn't start from it. In a glut the store stops buying (Water 18% of auctions) and its line stays put. A
  MULE costs 110 / 140 / 304 (p10/p50/p90) but up to 7,087 (12,364 at 6 seats). The corral is sold out in 14% of
  months, and the longest sold-out run is 10 months.
- **Value.** A price a player can read and plan around: shortages show as a rising line, a sold-out bid-up moves
  next month's price, a glut pulls it down, and speculation becomes a skill, not a lottery. It also ends the
  four-figure prices.
- **UBER-AC-1** (sim, 200 games × 4 seats, no tuning): after any good whose store sold out with buyers still on
  the board, the store's next sell line for it is at least the highest price paid in that walk (up to the
  ceiling), every time. After any good where the store stopped buying, its next buy line is lower, every time. No
  posted price ever goes above 12× the good's configured reference price.

**G-2 · A wider bid/ask spread** `[handoff]`
- **Goal.** The store buys clearly lower and sells clearly higher than today, so a fair deal between two players
  beats a deal with the store.
- **Who benefits.** The players at the table.
- **Today** (verified_by: executed): one spread for every good, 10% each side (measured median 21% wide),
  widening only through the restock premium on a short Food or Water shelf (up to 50%). Players mostly sell to
  the store: 21,734 Food units into its shelf (net, over the auction) against 2,041 traded between players.
- **Value.** More of the month's trade happens between players, at prices they set; the store stays the fallback.
- **UBER-AC-2** (sim as above): the store's quoted spread is wider than 20% for every good in every month, and the
  share of Food, Water and Energy units traded between players rises above Today's (Food: 2,041 of 24,193, 8%).

**G-3 · Off-world prices swing; Crystite from 40 to 300, normally about 90** `[handoff]`
- **Goal.** Crystite's off-world price moves month to month: normally around 90, rarely as low as 40, very rarely
  as high as 300, each step up less likely. The other export goods (Smithore, Rare earth, Alloy, Electronics,
  Medicine) move too, with smaller swings.
- **Who benefits.** The players at the table: export goods become a bet on when to sell to the ship.
- **Today** (verified_by: read and executed): `store.offWorld` is set once at `createGame` (`offWorld: {
  ...refPrice }` in `packages/engine/src/game.ts::createGame`) and never moves, in 100% of games for every good.
  Crystite's posted price sits at 100 (p10 100, p90 102).
- **Value.** A speculative export market where knowing when to hold and when to sell is a skill.
- **UBER-AC-3** (sim, 200 games × 12 months): the off-world Crystite price's median is 85–95, it never leaves
  40–300, it is above 200 in under 5% of months, at or above 280 in under 1%, and at or below 50 in under 5%; the
  same seed gives the same path.

**Non-goals** `[review-only]`
- The auction board's mechanics for rule E (WS3's). This spec owns the price rule that rule feeds, and §3 names
  the seam.
- How the AI seats value goods (WS9's). They read the four functions in §3 through `outlook.ts`.
- Taxes, emergency shipments, the export ship's buying rule (apart from reading the new off-world price).
- Supply levers: start Food, the store's Food per player, spoilage, farm yield (Heiko's balance pass, C29).
- Live house lines that move during the walk (approach C): a follow-up once B is played.
- Off-world price walks for Food, Water and Energy: they are not export goods; their off-world price stays fixed.

**Rough cost** `[review-only]`: B about 3 days of agent time in two PRs; the thin baseline A (numbers only) about
1 day.

### §0.1 Decision record `[review-only]`
- **Chosen, B (about 3 days):** one market-maker rule: a capped monthly mid price, floors and caps from the walk,
  an inventory lean on both lines, a spread that widens with the lean, an Energy target that counts new MULEs,
  seeded mean-reverting off-world walks, and a capped MULE factor.
- **Thin baseline A (about 1 day):** a wider spread, a ceiling and an off-world draw, changing numbers only. It
  loses because it cannot meet UBER-AC-1: with no sold-out floor and no glut step, the next month's lines ignore
  the walk. That's checkable in `packages/engine/src/economy.ts::nextPostedPrice`, which reads no walk outcome today.
- **C (about 6 days):** loses for now because it changes the walk, the board and the AI hands in four lanes, for
  an effect B gives a month later.

### §0.2 Constraints `[handoff]`
```
HC-1  Draw every random number from the seeded RNG through seedOf(seed, month, key); never Math.random, never the
      game's main rng stream (a new draw there would shift every later draw).   source: CLAUDE.md   breach: fatal
HC-2  Every number in this spec is a named config value (PRICE, MULE, OFF_WORLD); nothing inline.
      source: CLAUDE.md, configurable-balance                                   breach: fatal
HC-3  The AI reads prices only through the four functions of §3; no copy of a formula in packages/ai.
      source: WS9 spec HC (two copies drift)                                     breach: decision
HC-4  Food and Water stay colonists-first: storeForSale keeps the colonists' reserve, and the store never buys
      Food or Water above what colonists can pay after its spread.            source: Today's rule   breach: fatal
HC-5  The four §3 signatures freeze in PR-1, before any behaviour changes.     source: WS9 §3 freeze  breach: decision
```

## §1 · Solution Design `[handoff]`

**C1 · MODIFIED · the monthly mid price steps less, learns from the walk, and stops at a ceiling**
```
today        packages/engine/src/economy.ts::nextPostedPrice: target = ref × (targetCover ÷ max(cover, minCover))^k, or ∞ when short;
             step capped +50% (PRICE.maxRise, of max(prev, ref)) / −40% (PRICE.maxFall); no ceiling; no walk input.
             Called by packages/engine/src/economy.ts::postPrices (game.ts, entering the auction) and ai outlook.ts::outlook.
             verified_by: read + executed (|Δ| p50 41–50% Food/Water/Energy; Food max 1,985)
tomorrow     the step is capped by new PRICE.maxRise 0.3 / maxFall 0.25; after a sell-out with bids the mid is at
             least the walk's highest paid ÷ (1 + half-spread); after a glut it is at most last buy line × (1 − glut
             step); the result never exceeds PRICE.ceiling × GOOD_CONFIG[good].refPrice.
logic        → §2 RULE-1 · evaluated at postPrices (entering each auction) · inputs from store.lastWalk (C5) ·
             writes store.posted
seam         packages/engine/src/economy.ts::nextPostedPrice — the one function that posts and that outlook replays (HC-3)
senior       junior would: clamp posted prices in the auction where they're shown · senior does: put floors, caps
             and ceiling inside nextPostedPrice, so the AI's outlook sees the same price the store will post
mechanism    in_place
call sites   packages/engine/src/economy.ts::postPrices; packages/ai/src/outlook.ts (outlook's price/later and outlookPrices)
pin          the target formula and refDrift/worldPull stay: packages/engine/test economy tests on targetPrice
             and driftReference keep passing unchanged
depends_on   C5 (data: store.lastWalk; stubbable as "no walk": null)
```

**C2 · MODIFIED · an inventory lean and a wider spread replace the restock premium**
```
today        packages/engine/src/economy.ts::storeQuotes and packages/engine/src/auction.ts::comeUp: buy = posted × (1 − 0.1), sell = posted × (1 + 0.1);
             comeUp raises the buy line to posted × 1.5 (PRICE.restockPremium) on a short Food/Water shelf, capped at
             the colonists' budget ÷ (1 + spread)²; sell ≥ buy + 1. verified_by: read + executed (spread p50 21%)
tomorrow     one quote rule for every good: lean from the shelf against its target, both lines shifted by the lean,
             half-spread = PRICE.baseSpread + PRICE.widen × max(0, lean); the colonists' cap and sell ≥ buy + 1 kept.
logic        → §2 RULE-2 · evaluated when a good comes up (comeUp) and whenever storeQuotes is called
seam         packages/engine/src/economy.ts::storeQuotes (one formula); packages/engine/src/auction.ts::comeUp calls it instead of computing its own
senior       junior would: add a scarcity factor in comeUp beside the restock premium · senior does: one quote
             function in economy.ts that comeUp and the AI both call, and delete the second formula in comeUp
mechanism    extract (comeUp's inline quote → storeQuotes) then in_place
call sites   (git grep "storeQuotes|storeSpread|restockPremium" on 43af74d2; the repo isn't prism-indexed here, so this
             is a grep-built list) callers of storeQuotes: packages/engine/src/colony.ts (colony sell price),
             apps/server/src/mule-game.ts (the view's quotes). Copies of the spread formula that must become
             storeQuotes calls in PR-1 (HC-3): packages/engine/src/auction.ts::comeUp (store lines),
             packages/engine/src/economy.ts::colonistDemand and packages/engine/src/upkeep.ts (the colonists' price),
             packages/ai/src/outlook.ts::rollForward (colonist floor), packages/ai/src/strategist.ts::expectedPrices (storeBuy and
             storeSell outside the good that is up), packages/ai/src/value.ts::cashReserve (shortfall cost). WS1 owns economy.ts,
             upkeep.ts, outlook.ts, strategist.ts and value.ts; WS3 owns auction.ts and mule-game.ts.
pin          HC-4: a short Food shelf never gets a buy line above colonistBudget.food ÷ (1 + max half-spread)²;
             test kept/renamed from the restock-premium test
depends_on   C6 (the Energy target feeds the lean)
```

**C3 · ADDED · seeded, mean-reverting off-world prices for the export goods**
```
today        store.offWorld set once in game.ts::createGame, never moves (100% of games). verified_by: executed
tomorrow     at each month's opening, each export good's offWorld steps: log p' = log c + φ (log p − log c) + s·z,
             z ~ N(0,1) from seedOf(seed, month, 'offWorld', good), clamped; Crystite c 90 φ 0.7 σ 0.35 clamp 40–300;
             the others c = GOOD_CONFIG refPrice, φ 0.7, σ 0.18, clamp ±50%; s = σ √(1 − φ²). seedOf is private
             in packages/engine/src/events.ts today: it is exported from there or moved to packages/engine/src/rng.ts
             beside createRng, never copied (the owners pick at PR-2).
logic        → §2 RULE-3 · evaluated at the month's opening (game.ts, where state.month++) · writes store.offWorld
seam         economy.ts (new stepOffWorld) called from game.ts at month opening
senior       junior would: draw a fresh price each month from the main rng · senior does: a mean-reverting walk
             from a per-month keyed seed (HC-1), so prices trend and old replays keep their other draws
mechanism    sprout
reuse check  grep "offWorld" packages/engine/src: read in packages/engine/src/economy.ts::shipPrice, nextPostedPrice (target cap),
             driftReference (worldPull), upkeep.ts (ship surplus); no existing walk or Gaussian draw in rng.ts
             (createRng has next/int/pick/chance/weighted/shuffle) → a Box–Muller normal from rng.next() in
             stepOffWorld, not a new rng method
call sites   game.ts month opening (one)
pin          shipPrice's clean bonus and step-down unchanged (export-ship tests)
depends_on   none
```

**C4 · MODIFIED · the MULE price inherits the ceiling and its sell-out factor gets a cap**
```
today        packages/engine/src/economy.ts::mulePrice = (labour + smithorePerMule × posted.smithore) × muleFactor; game.ts raises
             muleFactor × 1.15 each sold-out month with no cap (MULE.scarcityUp), down × 0.9 to min 0.6.
             verified_by: read + executed (p90 304, max 7,087)
tomorrow     muleFactor never exceeds new MULE.maxFactor 2.0; Smithore's posted price is ceiling-bound by C1, so the
             MULE price is too. The corral refill (upkeep.ts) is unchanged; a short Smithore shelf now leans its buy
             line up (C2), which is how the store gets Smithore to refill.
logic        → §2 RULE-4
seam         game.ts where muleFactor steps (one line: Math.min with MULE.maxFactor)
senior       junior would: cap mulePrice's output · senior does: cap the factor, so the price stays labour +
             Smithore at the store's price, as the economy doc says
mechanism    in_place
call sites   game.ts (the production transition)
pin          mulePrice formula unchanged (economy tests)
```

**C5 · ADDED · the walk records each good's sold-out high and whether the store's budget ran dry (the rule-E seam)**
```
today        packages/engine/src/auction.ts::learnFromGood passes only between-player units and value to driftReference; nothing keeps
             the walk's high or a dry budget past the good. verified_by: read
tomorrow     when a good finishes, the store keeps for it: soldOutHigh (the highest unit price paid between players
             while storeForSale was 0 at the time of that unit, or null) and dryBudget (true exactly when
             storeBudget was > 0 when the good came up and is 0 when it finishes); C1 reads them at the next
             postPrices, which then sets store.lastWalk = {}.
logic        → §2 RULE-1 inputs · written at packages/engine/src/auction.ts::finishGood (with learnFromGood) · read by nextPostedPrice
seam         packages/engine/src/auction.ts::learnFromGood — where the walk already teaches the market; WS3 records where rule E runs
senior       junior would: rebuild the high from receipts at month end · senior does: note it unit by unit where
             the store's sold-out state is known, so a unit sold before the shelf emptied never counts
mechanism    sprout
reuse check  grep "between" auction.ts: LiveAuction.between {units, value} is per good and reset each good; it
             has no max and no sold-out flag, so it is extended beside, not replaced
call sites   packages/engine/src/auction.ts::finishGood (one); types.ts Store gains lastWalk
depends_on   rule E (WS3's amendment E) for the "buyers walk past a sold-out store" units; without it the high is
             simply null more often (stubbable)
```

**C6 · MODIFIED · the store's Energy target counts the MULEs players will add this month**
```
today        storeWants(energy) fills to PRICE.storeMaxCover × demand.energy, where demand counts installed plots'
             use (playersUse) and colonists' share. verified_by: read; Energy sold out at come-up 26%, mid-walk 19%
tomorrow     the Energy target adds newLandMules(players) × PRICE.energyPerNewMule, the mean energyUse of a new MULE
             over the outfits that draw Energy from the stock: plants are excluded, because under AM-17 ruling A a
             plant's own use is not demand on the stock. The lean (C2) then pulls Energy in before the new MULEs need
             it. Water: the same new-MULE term follows AM-18 (WS1 adds it there, not this spec).
logic        → §2 RULE-2 (target shelf)
seam         packages/engine/src/economy.ts::monthlyDemand's energy line (the one demand every store function reads)
senior       junior would: give the store free Energy each month · senior does: raise the target and let the
             lean buy it from players (the colony stays self-contained)
mechanism    in_place
call sites   monthlyDemand readers (storeWants, cover, scarcity, outlook)
pin          Food/Water demand unchanged
```

**C7 · MODIFIED · the configuration: new PRICE, MULE and OFF_WORLD values** — in `packages/engine/src/config.ts`:
`PRICE.maxRise 0.3, maxFall 0.25, ceiling 12, baseSpread 0.15, widen 0.10, leanShare 0.15, glutStep 0.15,
energyPerNewMule (from energyUse)`; `PRICE.storeSpread` and `restockPremium` removed once nothing reads them;
`MULE.maxFactor 2.0`; new `OFF_WORLD = { crystite: { centre 90, phi 0.7, sigma 0.35, min 40, max 300 }, others: {
phi 0.7, sigma 0.18, band 0.5 } }`. Every value carries a one-line doc comment. `pnpm sim` checks the result
(CLAUDE.md).

## §2 · The Logic `[handoff]`

**RULE-1 · Next month's mid price** (shape: formula with floors and caps; existing parts marked)
```
inputs   prev = store.posted[g] · target (existing: ref × (T ÷ max(cover, minCover))^k, or ∞ when short)
         walk = store.lastWalk[g] | null       null = the good didn't come up last auction: no floor, no cap
         halfSpread(g) at last month's lean (RULE-2)
step     m = min(prev + maxRise × max(prev, ref), max(prev × (1 − maxFall), target))        (existing shape)
floor    walk.soldOutHigh ≠ null  →  m = max(m, walk.soldOutHigh ÷ (1 + halfSpread))
cap      walk.dryBudget            →  m = min(m, lastBuy × (1 − glutStep) ÷ (1 − halfSpread))
         export-only good           →  m = min(m, offWorld[g])                                 (existing)
ceiling  m = min(m, ceiling × GOOD_CONFIG[g].refPrice);  m = max(1, round(m))
order    step, floor, cap, export cap, ceiling: the ceiling always wins; a floor above the ceiling is the ceiling
examples Food prev 40, sold out, highest paid 90, half-spread 0.2 → m ≥ 75
         Water prev 30, budget ran dry, last buy 24 → m ≤ 24 × 0.85 ÷ 0.85 = 24 (buy line 20.4 → 20)
         Food target ∞ (short) prev 300 → step to 390, ceiling 360 → 360
```

**RULE-2 · The store's quotes** (shape: formula)
```
inputs   m = posted · shelf = store.stock[g] · targetShelf = targetCover × demand[g] (Energy: C6)
lean     L = clamp((targetShelf − shelf) ÷ max(1, targetShelf), −1, 1)    targetShelf 0 → L = 0 (nothing wanted)
centre   c = m × (1 + leanShare × L)
half     h = baseSpread + widen × max(0, L)
lines    buy = max(1, floor(c × (1 − h))), sell = max(buy + 1, ceil(c × (1 + h)))
caps     Food/Water buy ≤ colonistBudget[g] ÷ (1 + h)² (HC-4); buy null when storeWants = 0; sell null when
         storeForSale = 0 (existing)
examples shelf at target: m 30 → 25 / 35 (30% wide); shelf empty (L 1): m 30 → c 34.5, h 0.25 → 25 / 44 (wide, up);
         shelf double target (L −1): m 30 → c 25.5, h 0.15 → 21 / 30 (down)
```

**RULE-3 · Off-world walk** (shape: formula) — as C3; Crystite's distribution from a 20,000-game sim of the rule:
median 90, p10–p90 57–142, above 200 in 1.1% of months, 280 or more 0.06%, 50 or less 4.7%, usual month-to-month
move 18%. The first month starts at the centre.

**RULE-4 · MULE factor** (existing, one new cap): sold out → factor × (1 + scarcityUp), at most maxFactor; surplus →
× (1 − surplusDown), at least minFactor; else unchanged.

## §3 · Contracts & Data Models `[handoff]`

**The AI price contract (WS9's freeze point; HC-3, HC-5).** Frozen in PR-1, ADDED/MODIFIED as marked, not breaking:
| Function (packages/engine/src/economy.ts) | Kind | Returns |
|---|---|---|
| `nextPostedPrice(state, good, demand?, lastShortages?, off?)` | MODIFIED behaviour, same signature | next month's mid (RULE-1) |
| `storeQuotes(state, good)` | MODIFIED behaviour, same signature | `{ buy: number \| null; sell: number \| null }` (RULE-2) |
| `storeWants(state, good, demand?)` | MODIFIED behaviour, same signature | units the store will buy (Energy per C6) |
| `expectedOffWorld(state, good, monthsAhead)` | ADDED, pure | `centre × (offWorld ÷ centre)^(φ^monthsAhead)`, never draws |
Example: Crystite offWorld 160, centre 90, φ 0.7 → in 1 month 134, in 3 months 109.
Null semantics (a consumer dependency, WS9 RULE-2): `storeQuotes(…).sell === null` means exactly "the store won't
sell this good now" (storeForSale = 0), and `buy === null` exactly "the store won't buy" (storeWants = 0). Neither
is ever null for any other reason; no price rule here (lean, ceiling, floors) makes a line null. A test pins it
(T-AC-2's contract test).

**The rule-E seam (WS3).** `Store.lastWalk: Partial<Record<Good, { soldOutHigh: number | null; dryBudget: boolean
}>>` in `packages/engine/src/types.ts` (ADDED, optional, so older records load). WS3 writes it at
`packages/engine/src/auction.ts::finishGood`: `soldOutHigh` as C5 says, and `dryBudget` true exactly when the
store's budget was > 0 when the good came up and is 0 when it finishes. RULE-1 reads it at the next `postPrices`,
which then sets `store.lastWalk = {}`.

## §4 · Failure & Ops
No external dependency — the whole rule is in-process engine code.

## §5 · Delivery `[handoff]`
Code and config only. A game record from before this change replays with the old prices only if it carries its
config snapshot (`record.ts::configSnapshot`); the new off-world draws use their own keyed seeds (HC-1), so no other
draw in an old game moves. The rulebook chapter `docs/rulebook/store-and-prices.html#store-pricing-design` is
rewritten in PR-2 with its status pill, and `node docs/rulebook/build-index.mjs` runs (Heiko's rulebook rule).

## §6 · Acceptance Criteria `[handoff]`
| B-AC-1 | Given a month where the store sold out of Food and two players bought from each other at 90 | When the next month's auction opens | Then the store's Food sell line is at least 90 (or the ceiling). observed_at: the auction's storeSell for Food. negative: a month where the store still had Food when the 90 trade happened sets no floor. → C1, C5 |
| B-AC-2 | Given the store stopped buying Water because its shelf was full | When the next auction opens | Then its Water buy line is lower than last month's. observed_at: storeBuy. negative: a month where its budget never ran dry. → C1, C5 |
| B-AC-3 | Given any game | When any month's prices are posted | Then no posted price is above 12× its configured reference (Food 360). observed_at: store.posted. → C1, C7 |
| B-AC-4 | Given a good at its target shelf | When it comes up | Then the store buys 15% under and sells 15% over its price (30% wide); with an empty shelf both lines are higher and up to 50% apart. observed_at: storeBuy/storeSell. negative: Food's buy line never passes the colonists' cap. → C2 |
| B-AC-5 | Given 200 sim games × 12 months | When the off-world Crystite price is read each month | Then the median is 85–95, it never leaves 40–300, above 200 in under 5%, ≥ 280 under 1%, ≤ 50 under 5%; the other export goods stay within ±50% of their reference. → C3 |
| B-AC-6 | Given the corral sold out several months running | When the MULE price is posted | Then the factor is at most 2.0 and Smithore's price at most its ceiling. → C4 |
| T-AC-1 (serves B-AC-5) | the same seed gives the same off-world path; a game with the walk and one without draw every other random number identically (events, map, AI). → C3, HC-1 |
| T-AC-2 (serves all) | Sampled at upkeep, once every good's walk has finished this month (so `store.lastWalk` is complete): for every good, `outlook.ts`'s next-month price equals `nextPostedPrice` on outlook's own rolled-forward stage, and that stage carries the real state's `store.lastWalk`, so the AI's forecast applies the same floors, caps and ceiling as the store. Over 20 seeded games. observed_at: outlook.price(g) vs nextPostedPrice(stage, g), and stage.store.lastWalk vs state.store.lastWalk. Not asserted: equality with the posted price itself, because production between upkeep and the next auction can differ from the outlook's roll. → C1, HC-3 |
| T-AC-3 (serves B-AC-1) | a unit traded between players before the store's shelf emptied never sets soldOutHigh. → C5 |
| T-AC-4 (serves UBER-AC-2) | `pnpm sim` (4 seats, 200 games) reports the between-player share of Food/Water/Energy units and the quoted spread; both above Today's. → C2, C7 |
Invariant (every test above): `storeQuotes` buy < sell whenever both are non-null.

## §7 · Risks & Spikes `[review-only]`
No spike needed. Risk: a wider spread and a lean can starve colonists if the store buys less Food. Mitigation: HC-4
and B-AC-4's negative case; WS1's colonist-shortage numbers are re-measured in PR-2's sim (T-AC-4) and a rise goes to
Heiko as a finding, not a silent tune.

## §8 · Amendments `[review-only]`
```
AM-1 · 2026-11-05 · lead (WS5) · at plan time
target    §5 Delivery (rulebook)
said      the rulebook chapter is rewritten in PR-2
did       both PRs update docs/rulebook/store-and-prices.html#store-pricing-design and run build-index
because   Heiko's rulebook rule: every PR that changes a rule or a number updates its chapter in the same PR
goal      G-1, G-2, G-3 unchanged
folded    plan Tasks 1.7 and 2.4
```
```
AM-2 · 2026-11-05 · lead (WS5) · WS3's read of #390
target    §1 C3, C5; §3 the rule-E seam
said      dryBudget "reached 0 this walk"; lastWalk "then they reset"; seedOf unnamed as to where it lives
did       dryBudget = budget > 0 at come-up and 0 at finish; postPrices sets lastWalk = {} after reading;
          seedOf exported from events.ts or moved to rng.ts, never copied
because   WS3's three line changes: each makes the seam exact for the code that writes it
goal      G-1 (the glut cap reads dryBudget), G-3 (the walk's seed) unchanged
folded    C3, C5, §3; plan Tasks 1.4, 1.5, 2.1
```
```
AM-3 · 2026-11-05 · lead (WS5) · WS1's read of #390
target    §6 T-AC-2; §1 C6; the header's Today note
said      T-AC-2: outlook's price equals what postPrices posts, every good; C6: the mean energyUse of a MULE
did       T-AC-2 sampled at upkeep (all walks done), asserting outlook = nextPostedPrice on its stage and that the
          stage carries lastWalk; C6 averages only over stock-drawing outfits (plants out, AM-17 ruling A), Water
          follows AM-18; sim checks compare against trunk at run time
because   RULE-1 reads lastWalk, which later goods' walks write this month, so the old T-AC-2 could not hold;
          a plant's own Energy is not stock demand
goal      G-1 unchanged (the AI and the store apply one rule, HC-3)
folded    §6 T-AC-2, §1 C6, header; plan Tasks 1.1, 1.3, 1.6, 2.4
```

AM-4 · 2026-11-06 · lead (WS5) · Heiko's five rules, relayed by the PM (PROPOSED until he approves)

target    §2 RULE-1 (step, target), RULE-2 (lean); §0 G-1's glut clause; §0.2 HC-4; §1 C5
said      a power-law target with momentum, a shelf lean on both lines, a glut step down, HC-4's colonist cap
did       "Rework, 6 Nov" above: RULE-5 measures, RULE-6 bands, RULE-7 moves; C5's walk also keeps highTrade
because   G-1 (prices answer the table) and G-2 (a wider spread) — Heiko's own rules for how they answer
goal      G-1, G-2 — still met; G-1's glut clause goes if Decision 4 is A
folded    on approval: RULE-1/RULE-2 rewritten to RULE-5..7, C1/C2/C5 and B-AC-2/B-AC-4 updated, plan Tasks 1.3-1.5

## §9 · Ownership Boundaries `[handoff]`
No ownership change. WS1 remains sole owner of `economy.ts`, `upkeep.ts` and its `config.ts` blocks (PRICE, MULE,
the new OFF_WORLD), and of `packages/ai/src/outlook.ts`, `strategist.ts` and `value.ts`, whose copies of the spread
become `storeQuotes` calls; WS3 of `auction.ts`, `game.ts`, `types.ts` and `apps/server/src/mule-game.ts`. WS5 owns this design and writes the PRs as named edits
the owners OK on the SHA. The AI reads prices only through §3 (WS9).
