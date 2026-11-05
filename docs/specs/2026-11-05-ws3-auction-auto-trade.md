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
