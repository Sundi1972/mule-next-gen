# The goods auction trades by itself — spec amendment

**Class:** Standard amendment (WS3, owner of the auction rules and the server). **Status:** DRAFT for the PM's ruling;
nothing is built until it is ruled. **Screen:** WS6 owns it and mocks it first; this amendment fixes only the rules
and what the server sends. **Grounded on:** trunk `origin/feat/strategist` and the walking rig
`origin/arcade-pr11-walking-on` (fetched 2026-11-05).

**Supersedes:**
- the UX audit's **A-6 / G-1**, "choose how many at a store's line, letting go stops"
  (`docs/research/2026-10-29-audit-build-split.md`). A-6's one-tap price step (G-2) **stays**.
- the WS6 UX spec's **RULE-2**, rows "defaultSide" and "tapping the chosen side again → pass", and its B-AC-4
  (`docs/specs/2026-10-21-ws6-ux.md`).

---

## §0 · Business goals `[handoff]`

Heiko, after playing the walking rig on 2026-11-05, in his words:
> "the selling and buying process should start automatically when the buy and sell lanes meet. They should start
> slowly and then get faster and faster so that even large quantities can be sold. The question (How much do you
> want to sell to the store) is unnecessary, we shouldn't have this."
> "in an auction always all players should participate; a player is a buyer by default."

**G-1 · Trading at the goods auction is just walking: where the lines meet, goods change hands by themselves.**
- *Proof, UBER-AC-1:* on the rig, a player walks a seller down to the store's line and does nothing else; units
  sell one at a time, faster and faster, until they step off, run out, or the clock ends. No amount is asked, and
  nothing waits for a button.

**G-2 · Everyone is in every goods auction.**
- *Proof, UBER-AC-2:* at every good's status screen every player's creature is on the board as a buyer; there is no
  Pass button, and Sell is a tap away for anyone holding the good.

*Today* `[review-only]`: at a player-to-player meeting, trading is already automatic and speeds up (walk.ts,
`WALK.tradeStartMs` 400 ms, ×`tradeSpeedUp` 0.8 per unit, down to `tradeFloorMs` 60 ms). At the **store's or the
ship's line** nothing trades until the player picks an amount with − / + and taps "Sell N for X cr", and selling
into next month's need first asks "This sells Water you need next month". Sides start from stock against need
(surplus → Sell, short → Buy, even → Pass), and tapping your side again passes.

**Non-goals:** the land auction (its own rules, unchanged); the board's look (WS6's mock); new AI strategy beyond
playing the new flow; balancing the speed curve (named values, tuned after play).

---

## §1 · Changes `[handoff]`

```
C1 · REMOVED · the amount chosen at a house's line
today      walk.ts::chooseAtLine / stopAtLine / wants, Walker.order (LineOrder); auction.ts::lineTrade;
           protocol MuleIntent { type: 'lineTrade'; units }; server handle + replay case 'lineTrade';
           web AuctionParts LineQuestion / SellConfirm / LineAction, Auction.tsx's line-go           verified_by: read
tomorrow   a player standing at a house's line trades with it automatically, one unit at a time, exactly as two
           players do where their lines meet (RULE-1). No order, no confirm.
seam       packages/engine/src/walk.ts::stepBoard — the house deals already exist; only the `wants` gate goes
mechanism  delete (back to the walk's original house rule; G-2's one-tap step stays)
pin        player-to-player trading and the turn order at a house (nextInTurn) do not move:
           engine/test/auction.test.ts walk cases
```

```
C2 · MODIFIED · everyone starts every good as a buyer; there is no Pass
today      auction.ts::defaultSide (stock vs need → seller | buyer | pass), seedSides; declareRole accepts 'pass'
tomorrow   seedSides puts every player on the board as a buyer at the bottom edge (RULE-2). declareRole accepts
           'buyer' and 'seller' only; 'pass' is refused. Tapping your own side again does nothing.
seam       packages/engine/src/auction.ts::seedSides / declareRole
mechanism  in_place
pin        a buyer at the bottom edge never trades: the board's bottom is below the store's buying floor
           (WALK.boardMargin), so sitting still is how you sit a good out
```

```
C3 · MODIFIED · the speed-up is RULE-3's curve, all named config
today      WALK.tradeStartMs 400 · tradeSpeedUp 0.8 · tradeFloorMs 60 · tradeClockRate 0.25 (config.ts, WALK)
tomorrow   unchanged values, now also governing house lines; the speed-up keeps going while a house serves
           players in turns (one deal per house, as today), and starts again only when the deal breaks off
seam       config.ts WALK (WS3's block)
mechanism  in_place (no new value needed; any later tuning is a config edit, checked with `pnpm sim`)
```

```
C4 · MODIFIED · the AI hands play the new flow
today      packages/ai/src/hands/auction.ts::chooseAtLine sends lineTrade(units); declares 'pass' when it would
           sell with no stock (WS1's file, named edit)
tomorrow   the hand stands at the line while it trades and steps off (one stepWalk away) once the units still
           wanted are no more than will trade before its next react; it never declares 'pass' — to sit out, it
           stays a buyer at the bottom edge and presses Done
seam       hands/auction.ts::chooseAtLine (renamed for what it does; WS1 reviews, WS9 builds if WS1 says so)
mechanism  in_place
```

C5 · the phone screen is WS6's mock (§3 lists what the view carries and stops carrying).

---

## §2 · The logic `[handoff]`

```
RULE-1 · Who trades at a house's line                              shape: decision table   (walk.ts::stepBoard)

  #   when                                                        then
  1   a buyer stands at the store's selling line with the money   the store sells to them, one unit at a time
  2   a seller stands at or under a house's buying price, with    the best-paying house buys from them, one unit
      units                                                       at a time
  3   several players are at the same house line                  the house serves them in turns, as today
  4   the player steps off the line, switches side, runs out of   that player's trading stops at once; the next
      money / units, or the clock ends                            unit is not sold
  5   otherwise                                                   nothing trades

There is no amount, no confirm, and no "you need these" question. Selling below next month's need is allowed and
shown, not asked (the rail's words are WS6's).
```

```
RULE-2 · Sides                                                     shape: decision table   (auction.ts)

  #   when                                      then
  1   a good's status screen opens              every player is a buyer at the bottom edge
  2   player taps Sell, holding the good        seller, at the top edge (switching never trades at once, as today)
  3   player taps Sell, holding none            refused: "You have none to sell" (as today)
  4   player taps Buy as a seller               buyer, at the bottom edge
  5   'pass' arrives (old client, old record)   refused: RuleError "Everyone takes part in the auction"
  6   a player wants out of this good           they stand still and tap Done; the good ends when everyone on
                                                the board is done, nobody can trade, or the clock ends (as today)
```

```
RULE-3 · The speed-up                                              shape: formula   (walk.ts::tradeInterval)

  ms until the next unit of a running deal = max(WALK.tradeFloorMs, WALK.tradeStartMs × WALK.tradeSpeedUp^units)
  while any unit is changing hands the good's clock runs at WALK.tradeClockRate of its speed

examples (today's values)
  units sold after 1 s of standing at the line: 3 · after 2 s: 13 · after 5 s: 63
  a good's 20 s clock buys up to 80 s of trading, since it runs at a quarter speed while units move
```

Determinism: no new randomness and no wall clock. Every trade happens inside `stepBoard`, on the server's fixed tick
(`WALK.tickMs`), from the board and the recorded intents (`declare`, `walk`, `step`, `done`). A stop is a recorded
intent at a step, so its replay stops at the same unit. Up to two units can trade in one tick at the top speed
(100 ms tick, 60 ms floor); that overshoot is the same in the replay.

---

## §3 · Contracts and the record `[handoff]`

| Contract | Change | Breaking | By |
|---|---|---|---|
| protocol `MuleIntent` `{ type: 'lineTrade'; units }` | REMOVED | yes, for clients; trunk's own phone is the only sender | C1 |
| protocol `declare` side `'pass'` | REMOVED from accepted values (RULE-2 row 5) | yes, same | C2 |
| protocol `AuctionView` walker's line order (what the phone draws the "trading N of M" from) | REMOVED; the view still says which line a walker stands at and what it traded this good (the receipt) | yes, same | C1 |
| **game record** (`docs/specs/2026-10-29-ws3-game-record.md`) | shape unchanged, still `v: 1`. Its intents lose `lineTrade` and `'pass'`. The config fingerprint is unchanged by this change (no new values), but a record from before it holding `lineTrade` cannot replay on the new build: replay reports it, as for any build that changes a rule. AI playbooks (`phase: 'auction'`, AM-6) keep their shape | no for the format; old records are not portable across this build | C1 C2 |

---

## §6 · Acceptance criteria `[handoff]`

| AC | Given · When · Then | Changes | Negative |
|---|---|---|---|
| B-AC-1 | Brix has 12 Smithore and walks down to the store's line · Then units sell one at a time with no question, the gap between them shrinking from 400 ms to 60 ms, until he taps ▲ once | C1 C3 | after the tap, no further unit sells |
| B-AC-2 | Lena walks up to the store's selling line with 300 cr · Then she buys one unit at a time until she steps off or her money runs out | C1 | a buyer below the line buys nothing |
| B-AC-3 | Any good's status screen opens · Then every player, AIs included, is a buyer at the bottom edge, and the phone has Buy and Sell but no Pass | C2 | Sell refused with no stock; `declare 'pass'` refused |
| B-AC-4 | Two players stand at the store's line together · Then the store serves them in turns and the speed-up carries on across them | C1 C3 | — |
| T-AC-1 | A recorded game with house-line selling and a mid-run stop replays identical | C1 | a replay that drops the stop is not identical |
| T-AC-2 | `pnpm sim -- --games 40 --seed 101`, before and after, sent to WS1: money and stock per seat, goods sold to the store, game time per month; every game ends | C4 | — |

Front to back: `apps/web/e2e/auction-steps.ts` (WS3's) drives a sale at the store's line with no amount step.

---

## §8 · What this changes in existing tests `[review-only]`

**Rewritten (they assert the removed flow):** `engine/test/store-line.test.ts`, `server/test/store-line.test.ts`,
`ai/test/store-line.test.ts`, `web/test/auction-store-line.test.ts` (WS3's, except the AI one: WS1's).
**Edited for the default side and no Pass:** `engine/test/auction.test.ts`, `server/test/{auction-units,
mule-game, events-hold, dropped-phone, record, brain-trial}.test.ts`, `ai/test/moves.test.ts`; the e2e
`auction-steps.ts` (WS3), `chat.ts` (WS6), `politics.ts` (WS7), `screens.ts` (named edits, owners' OK by SHA).
**Checked, expected unchanged:** `engine/test/lots-auction.test.ts` and `server/test/land-auction.test.ts` (the land
auction keeps Pass; it is not a goods auction). **WS6's spec:** RULE-2 and B-AC-4 rewritten to RULE-2 above.
**WS9's PR-3:** the auction playbook rows (T-AC-10/11) keep their shape; their expected trades change.

---

## §9 · Ownership `[handoff]`

No ownership change. WS3: engine `walk.ts` and `auction.ts`, protocol, `mule-game.ts`, WALK, the auction e2e.
WS6: the phone screen and its mock (AuctionParts / Auction.tsx rail and footer, built by whoever the PM routes,
WS3 by today's split). WS1: `ai/src/hands/auction.ts` (named edit) and the sim. WS4: the TV's words, if any change.

---

## §10 · Amendment AM-1: stop at your need, switch sides, rest zones, bid past a sold-out store `[handoff]`

**Status:** Heiko has seen WS6's mock (`design/mocks/auction-rules`, cde3ff61) and chose **A: hold ▼ for one
second** to sell into a shortage (via the PM, 2026-11-05). WS6's three open questions are settled under RULE-4, RULE-6
and RULE-7. The build goes ahead of the MULE swap only if he says so. **Screens:** WS6 draws them (mock first); this section fixes the rules,
what the AI does and what the server sends. **Grounded on:** trunk `origin/feat/strategist` f6f3a275 (walk.ts,
auction.ts read). **Out of scope:** the store's own price setting (another lane), and the trade pace, which is a value
ruling already built (#376: `WALK.tradeStartMs` 1000, `tradeFloorMs` 200, `tradeSpeedUp` 0.8; RULE-3's examples above
are at the old values).

Heiko at the table, selling a Water surplus, in his words (shortened): *"When I am selling it should auto-stop when I
reached my equilibrium, it should get me up the store lane. If I still want to sell (in shortage) it must be a
conscious decision … I sold too much and now I am having a shortage. It should be possible to flip sides (buy / sell)
within the auction. Below the store buying lane and above the store selling lane there should be safe or rest areas,
an absolute minimum I can go further down and I can't go further up, so that I am not participating in the auction
accidentally. When the store has no more goods to sell, buyers can walk up and drive the prices up further, trying to
convince a seller to sell. The sell lane of the store is representing the latest bid price of the buyers."*

**What the code does today** `[review-only]` (measured by reading):
- *B:* nothing stops a seller at their need. RULE-1 above sells "past its need, with nothing asked".
- *C:* the engine already lets a player switch sides during the walk (`declareRole` in stage `walk`; the walker
  jumps to the new side's start edge, so switching never trades at once, and it takes back a Done). The phone offers
  Buy / Sell only on the status screen.
- *D:* buyers walking up stop at the store's selling line (`stepBoard`, `sellLine`), and sellers walking down stop at
  the best buying house's line (`sellerFloor`). But buyers walk down to 0 and sellers up without limit; and once the
  store's buying budget is spent and the ship is out, `sellerFloor` falls to the board's bottom + 1, so a seller can
  walk into the buyers' area and trade with a buyer resting there.
- *E:* with the store sold out, `storeSellLine` is null, so buyers already walk past the old line, and a buyer walking
  up into a resting seller meets them and trades at once. No line shows the bids.

### The lines and zones, named once

```
price ▲
  hi ─────────── the board's top edge: sellers' hard edge (D)
      sellers' rest zone   (nobody trades here unless a seller walks down)
  S ──────────── the store's selling line (storeSell at the good's start); when the store is sold out it shows the
                 highest bid instead (E)
      the trading floor
  B ──────────── the best house's buying line (the store's storeBuy, or the ship's price, if higher)
      buyers' rest zone    (nobody trades here unless a buyer walks up)
  lo ─────────── the board's bottom edge: buyers' hard edge (D)
```

`S` and `B` are fixed for the good when its walk starts (`storeSell`, the higher of `storeBuy` and the ship's price);
the zones keep their bounds even after the store's budget is spent, the ship leaves, or the store sells out (E moves
only the line `S` shows).

### RULE-4 · Stop at your need (B)                                              shape: decision table   (walk.ts)

```
inputs
  units(w)   the seller's units of this good now
  need(w)    next month's need of this good (the status row's `need`, auction.ts::monthNeeds), fixed at the walk's start
  held(w)    false | true: this seller was stopped at their need this good
  conscious  after held became true, the seller holds ▼ (a `walk` down intent, not released) for WALK.shortHoldMs
             (1000 ms) of the board's time (Heiko's choice A). A tap (`walkStep` down) or a shorter hold does not
             count: it moves nothing while held, so a thumb resting on ▼ never sells short by accident

several rows match → first match wins

  #   when                                                        then
  1   need(w) = 0                                                  no stop: sells all it holds (today's rule)
  2   held(w) and conscious                                        sells on into shortage, for the rest of this good;
                                                                   the speed-up starts again from the first unit
  3   a unit would take units(w) below need(w), and not held(w)    that unit does not sell. The seller stops (dir 0), is
                                                                   put ONE price step above the line it was trading at
                                                                   (off every line), stays a seller, and held(w)
                                                                   becomes true
  4   otherwise                                                    RULE-1 as above

unknown
  need is never unknown in an auction: monthNeeds gives 0 for a good nobody consumes (Smithore, Crystite, …), so row 1
  applies to those. A seller who starts the walk already at or below need is stopped at the first unit (row 3): even
  their first sale into shortage takes the second, conscious press.
```

- **WS6's question 2, settled: one step, not three.** The engine puts the seller one price step off the line, the
  least that stops every trade. The phone and the TV show that the seller is holding (the KEEPS mark) from the view's
  `held: true`, not from the distance. A gap of three steps would only be a drawing choice, and it would differ by
  good.
- While held, a hold of ▼ shorter than 1 s moves nothing and sells nothing; the rail says "To sell more, hold ▼: you'd
  be short next month" (WS6's words). The 1 s counts from the hold's start on the server, in the board's own time, so
  a replay counts it the same way. The hold then walks and sells on as RULE-1 and RULE-3.
- It applies to every sale, at a house's line and to another player, since either can push a seller into shortage.
- The stop is a state the server holds (`held`), so a replay stops at the same unit: the conscious act is a
  recorded intent.
- Switching to buyer and back (C) does not reset `held` for this good.
- **AI:** the hand sells only what its strategist wants (today's `chooseAtLine` target). When it is held, it presses
  down again only if its target is more than its surplus, so selling into shortage is a decision it already made, and
  never an accident of the walk. WS1 reviews (named edit, `hands/auction.ts`).

### RULE-5 · Switch sides during the walk (C)                                   shape: decision table   (auction.ts)

```
  #   when                                                        then
  1   a player taps Sell during the walk, holding the good         seller, at the top edge, standing still; any trade
                                                                   they were in stops at once (RULE-1 row 4); their Done
                                                                   is taken back
  2   a player taps Buy during the walk as a seller                buyer, at the bottom edge, standing still; as row 1
  3   taps Sell holding none                                        refused, "You have none to sell" (today's)
  4   taps their own side again                                    nothing (today's)
  5   the good has closed                                           refused, "This good has closed" (today's)
```

- This is today's engine rule (`declareRole`, `takeSide`). The change is that the phone offers it during the walk (WS6's
  screen) and that the spec states it.
- `held` (RULE-4) and the receipt carry over a switch.
- **AI:** unchanged: it picks its side on the status screen and does not switch mid-walk.

### RULE-6 · Rest zones and hard edges (D)                                       shape: decision table   (walk.ts)

```
  #   when                                                        then
  1   a buyer walks or taps down                                  stops at lo (the bottom edge); never below
  2   a seller walks or taps up                                   stops at hi (the top edge); never above
  3   a seller walks or taps down                                 stops at B, whether or not any house still buys
                                                                  (replaces sellerFloor's fall to lo + 1)
  4   a buyer walks or taps up while the store sells              stops at S (today's)
  5   a buyer walks or taps up while the store is sold out        RULE-7
```

- **WS6's question 1, settled: no detent.** The hard edges can't be crossed at all, so they need no detent: lo and hi,
  B for sellers, S for buyers while the store sells. A line a player may cross (a buyer walking down past B into their
  own zone, a seller walking down past S toward the trading floor) is crossed by a deliberate hold, and the one
  crossing that costs something, selling below your need, is caught by RULE-4's stop. A detent would make every
  ordinary sale take two holds.
- Standing anywhere in your own rest zone, you can't trade: the other side can't reach you.
- In the buyers' zone: sellers stop at B, and the zone lies below B.
- In the sellers' zone: buyers stop at S while the store sells (row 4), and under RULE-7 they stop one step short of
  any seller there.
- With no house buying (budget spent, no ship), a seller at B trades only with a buyer who walks up to B.
- **AI:** its walk targets are clamped by these rows like a phone's. Its "sit this good out" (stand at the edge,
  press Done) is unchanged.

### RULE-7 · Bidding past a sold-out store (E)                                   shape: decision table   (walk.ts, auction.ts)

```
  #   when                                                        then
  1   the store has none of this good left to sell                buyers may walk and tap above S, up to hi − one step
  2   a buyer walks up toward a seller standing in the sellers'   the buyer stops one price step below that seller's
      zone (above S)                                              ask: walking up never trades with a resting seller
  3   a seller walks down onto a buyer's bid                       they trade, at the meeting price, one unit at a time
                                                                   (RULE-1, RULE-3); this is how a seller is convinced
  4   any time row 1 holds                                         the store's selling line shows the highest active
                                                                   bid on the board (a buyer who can pay it), or S if
                                                                   no buyer is above S; the store sells nothing
  5   the store has units again (not in one good's walk today)     n/a: the store's stock for a good does not rise
                                                                   during its walk
```

- **WS6's question 3, settled: yes.** Sold out, the line stays at the old S until a bid passes it, then follows the
  top bid (row 4), and every seller above the line still rests. Row 2 means a buyer can never walk past a resting
  seller, so the top bid is always below every resting ask: no seller is ever left between the old S and the line.
- Row 4 is shown, not traded. The line reads "Highest bid N" (WS6's words), so a seller sees what a walk down would
  fetch. It also moves the sellers' rest zone's bottom up to that bid: a seller above it is resting.
- On the trading floor below S, walking up into a seller still meets and trades, as today. Row 2 protects only the
  sellers' zone.
- **AI:** a buyer short of the good may walk up to its own price limit (today's valuation). A seller walks down onto
  the highest bid when that bid is at or over its own reservation price. WS1 reviews these as a named edit, and
  `pnpm sim` is run before and after.

### What the server sends (§3 additions)

| Contract | Change | Breaking | Rule |
|---|---|---|---|
| `AuctionView` walker `held?: true` | ADDED: this seller was stopped at their need (the phone says how to sell on) | no | RULE-4 |
| `AuctionView`'s store selling line | MODIFIED: while sold out it is the highest active bid, flagged `bid: true`, so a screen can label it | no (optional flag) | RULE-7 |
| `AuctionView` `zones: { buyersTop: B, sellersBottom: S, lo, hi }` | ADDED: the zones' bounds for the screens | no | RULE-6 |
| game record | shape unchanged; `held` is derived on replay from the recorded intents | no | all |

Config (WALK, named, for `pnpm sim -- --set`): `needStop: true` (RULE-4 off for a sweep), `soldOutBidding: true`
(RULE-7 off), `shortHoldMs: 1000` (the hold that sells into shortage, Heiko's A). "One price step" is today's walk
step.

### Acceptance criteria

| AC | Given · When · Then | Negative |
|---|---|---|
| B-AC-B1 | Heiko holds 12 Water and needs 4. He walks down to the store's line and stands. Then 8 sell, the next does not, and his walker stands one step above the line. Nothing more sells over the next 5 s | — |
| B-AC-B2 | then he holds ▼ for one second · Then he sells on, one unit at a time, below his need | a tap of ▼, or a hold shorter than 1 s, sells nothing and moves nothing |
| B-AC-B3 | Brix holds 6 Smithore (need 0) and walks to the store's line · Then all 6 sell with no stop | — |
| B-AC-C1 | Lena is a seller trading at the store's line mid-walk · She taps Buy · Then her trading stops at once, she is a buyer at the bottom edge, and walking up she buys from the store | tapping Sell with none is refused |
| B-AC-D1 | A buyer holds ▼ · Then they stop at the bottom edge. A seller holds ▲ · Then they stop at the top edge. Neither trades | — |
| B-AC-D2 | The store's buying budget is spent and no ship is in · A seller holds ▼ · Then they stop at the old buying line, and a buyer resting below it never trades | — |
| B-AC-E1 | The store is sold out of Water · Lena walks up past the old selling line · Then every screen's store line shows her bid; Brix, resting above, does not trade; he walks down to her bid · Then they trade at it | Lena walking up never trades with Brix standing still |
| T-AC-E2 | a buyer walking up stops one step below the lowest resting ask in the sellers' zone, on every tick length | — |
| T-AC-1′ | a recorded game with a need stop and a conscious press on replays identical | dropping the press is not identical |
| T-AC-2′ | `pnpm sim -- --games 40 --seed 101` before and after, with `--set WALK.needStop=false` and `soldOutBidding=false` as controls: money, stock and shortages per seat, units sold to the store; sent to WS1 | — |

Front to back: `apps/web/e2e/auction-steps.ts` drives B-AC-B1 and B2, and B-AC-E1, on the phones and the TV.

### Owners

| Area | Owner |
|---|---|
| RULE-4, RULE-6, RULE-7 in `walk.ts` and `auction.ts`, the view fields, WALK | WS3 |
| The phone and TV screens (the held words, Buy/Sell during the walk, the zones, "Highest bid") | WS6 (mock first) |
| The AI hand's rows (`hands/auction.ts`) and the sim | WS1 (named edit) |

### Open for Heiko

1. **Does the stop at your need apply to player-to-player sales too, or only to the store's line?** Recommended:
   both, since either can leave you short.
2. **Should a buyer have the mirror stop at their need (stop buying once they have enough)?** Not asked for.
   Recommended: not now.
