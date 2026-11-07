# WS7 politics · slice 4: sabotage and the Sheriff

Programme amendment to `docs/specs/2026-10-22-ws7-politics.md` (P-3, UBER-AC-4; AM-19 parked the Sheriff)
· WS7 · 2026-11-07 · class: Programme (a new engine module, two new AI hands, a cross-component contract, more
than 3 PRs) · **Status:** draft for WS7's merge into one amendment set with slices 3 and 5; Heiko rules on the
three in one sitting. Spec only: no code, no screen.

Ids carry the slice prefix so slices 3, 4 and 5 never collide: goals S4-1, S4-2; proofs S4-UBER-AC-n; changes
S4-C1+; rules S4-RULE-1+; constraints S4-HC-n; ACs S4-B-AC-n / S4-T-AC-n.

**Binding inputs (WS7, 7 Nov):** the frozen contract types for slices 3-5 (`SabotageTarget`, `SabotageOrder`,
`Politics.sabotage` as the whole game's orders, `Politics.guards`, `captureOdds`, the HC-4 observe rule) and slice
3's spec (`docs/specs/2026-11-07-ws7-slice3-deals.md` on `ws7-slice3-deals` @ 8ebc6857: `diplomacy.ts`'s
`pactBreach`, `pactBetween`, `sabotagePossible`, `moveReputation`, `RepCause`). This spec adopts them as written,
and §3 lists the few additive fields it asks for.

---

## §0 · Business Goals & Value `[handoff: goal lines and proofs]` `[review-only: who / today / value / cost]`

Both goals trace to approved goals. P-3 (Heiko, 22 Oct, cards: "Approve the goals"): "Players sabotage each
other in secret, and the Sheriff can guard, catch and fine them." D2 (Heiko, 22 Oct "Six simple ones"; 4 Nov
"thous four now"): the sabotage ban and the Sheriff's fines come with slice 4. Heiko, 7 Nov: the first release
candidate includes all of politics, "All 3 parts + Claude's social side", with computer players that use them
(SEAMS 2026-11-07T10:27Z). Mission goal G-4 (program.yaml): "The table plays politics - pacts, whispers,
sabotage, elections, a Governor and a Sheriff, laws and taxes - and it changes the game"; its proof is set in
WS7's §0 ("sim with AI elections and laws, balance checks hold; e2e with whispers, a deal card and a vote").
This slice adds the sabotage and Sheriff part of that proof.

**S4-1 · Players sabotage each other in secret, and the Sheriff the table elects guards plots, catches
saboteurs and fines them; the colony can vote a sabotage ban that makes getting caught cost more.** (P-3)
- *Who benefits:* players who like risk and suspicion; whoever wins the Sheriff's office, who gets a job of
  their own; every player whose plot a rival could hit, who now has an office to lean on.
- *Today:* there is no sabotage order, no guard and no fine. `grep -rni sabot packages/engine/src
  packages/protocol/src apps/server/src` finds only the persona and level weights in config.ts. The Sheriff is
  not elected: `packages/engine/src/config.ts::POLITICS` has `offices: ['governor']` since AM-19 (Heiko, 28 Oct:
  "Governor only for now", because an office with no job confused newcomers in WS6's audit). The hub mock's
  Secret and Sheriff desks are "soon, slice 4" placeholders (`design/mocks/ws6-ux/src/screens/PlanningHub.tsx`,
  `SABOTAGE`, `SheriffDesk`). The rulebook's "Sabotage and the Sheriff" section is pilled Backlog. verified_by:
  read.
- *Value:* the "Caught!" moment and the doubt when nobody is caught (00-concept, "Moments built for the
  table"); a second office worth running for, so an election month has two contests; a fifth law that changes
  how the table plays. Planning gets a secret move with real risk, next to the public ones.
- **S4-UBER-AC-1 (restates UBER-AC-4):** in a seeded engine test, a power-cut order against a plot the Sheriff
  guards fails, and the saboteur's name is in that month's production events on every screen; an unguarded
  order succeeds or fails on its seeded odds, and when it succeeds its plot makes nothing that month. When the
  Sheriff fines the culprit 150, the culprit pays 150, the victim gets 75 and the fund 75; under the sabotage
  ban at 2, the same capture costs 300 and twice the reputation.
- **S4-UBER-AC-2:** a step in the politics e2e (`apps/web/e2e/politics.ts`, no new file) with two phones and AI
  seats: Brix is Sheriff and guards his Food plot; Lena orders a power cut on it; in production every screen
  shows "Caught!" with Lena's name and her reputation falls on every screen; in the next planning Brix fines
  her and the month end shows the fine and Brix's share. Before production, no view but Lena's carried her
  order and no view but Brix's carried the guard.

**S4-2 · Computer players sabotage, run for Sheriff and do the Sheriff's job, with no API key.** (Heiko, 7 Nov:
"computer players use them"; 00-concept, "Solo play against AI personas")
- *Who benefits:* a solo player at a table of AI seats, and any table with AI seats, who would otherwise face
  opponents that never sabotage and a Sheriff's office no AI can fill.
- *Today:* the AI carries the intent without the move: a `saboteur` persona with `spite` 1.5 and a per-level
  `sabotage` switch, off for Rookie (`packages/engine/src/config.ts::AI_PERSONAS`, `::AI_LEVELS`), used only to
  bid up the leader in the auction (`packages/ai/src/strategist.ts`, `spiteBid`). `POLITICS.ai.runSheriff`
  exists and `VoteHand` already runs for Sheriff when the office is elected
  (`packages/ai/src/hands/vote.ts::VoteHand`); nothing guards, investigates or fines. verified_by: read.
- *Value:* the slice plays at every table, not only at tables of humans; the sim can measure sabotage's money
  before Heiko OKs it (D3).
- **S4-UBER-AC-3:** `pnpm sim` on all three seed sets with politics on: Classic AI seats order sabotage in at
  least half the games, at least one order is caught on each seed set, a Sheriff holds office in every term,
  and an AI Sheriff guards in every month it holds office and fines every case it may fine. Every balance check
  that passes with `--set POLITICS.sabotage.on=false` still passes with it on, and politics off stays
  byte-identical to trunk.

**Non-goals** (each needs its own spec, or waits for a system another lane builds):
- **Fake assay, tip off the pirates, steal a MULE** (00-concept's other three orders). The assay exists (a
  player's private analysis, `Player.analysed`), but planting a false card needs a per-player ground override
  through observe(), every view and the AI's yield valuation. Pirates raid every player's Crystite at once
  (`EVENTS` pirateRaid), with no per-player chance to raise. Players hold no spare MULE to steal.
- **The Sheriff's other powers in design 05:** enforce laws (inspections), collect law taxes, escort the ship,
  the inquiry into the Governor. Why each waits is in §0.1.
- **The victim's free retaliation** (00-concept, "Defence"), security fences (a plot upgrade not built),
  sabotage of super tiles (not built).
- **The Sheriff's 10% share of fines** (design 05, "Why you'd want the job"): the pay and the office score are
  the reward in RC; a share adds a third money path for one office.
- **Sheriff campaign promises.** RULE-10 row 1 keeps refusing them; a promise to one player belongs on slice
  3's deal card.
- **A Security budget line** that adds guards and detection: slice 5. Until it exists, S4-RULE-6 reads it as 0.
- **Claude's (Smart seats') sabotage and Sheriff decisions:** WS2's brain port, later. Smart seats use the
  same code hands in RC.
- **A separate lobby switch for sabotage** unless Heiko picks it (D-S4-2).
- **Screens before WS6 mocks them** and Heiko approves the mock.

**Rough cost:** the chosen design is about 9 PRs across six owners, about 4 working days of wall clock after a
half-day contract commit (§12). The thin baseline is about 3 PRs (§0.1).

### §0.1 · Decision Record `[review-only]`

**Chosen: two orders (power cut, market rumour), the Sheriff back with guard, investigate and fine, and the
ban as the fifth law.** Orders are secret and resolve when production starts, in a new
`packages/engine/src/sabotage.ts` (already a WS7 path in SEAMS). The effect rides the existing event pipeline
(a power cut is a production event that takes the plot's output to 0, as a flood does), so the production
show, the per-plot lines and the TV event layer carry it. Captures move reputation through slice 3's
`moveReputation` (diplomacy.ts, designed; cause `'caught'`) and call its `pactBreach`. Fines move through
`colony.ts`'s fund. AI seats act through two new hands called from `VoteHand`'s
planning step. About 9 PRs.

**Thin baseline: sabotage with automatic fines and no Sheriff** (`POLITICS.offices` stays Governor only; a
caught order pays a fixed fine). About 3 PRs. *Loses because* P-3 says "the Sheriff can guard, catch and fine
them", and UBER-AC-4 needs "a plot the Sheriff guards". Check: the parent spec §0, P-3 and UBER-AC-4.

**Larger: design 05's whole Sheriff table.** *Loses, power by power:* inspections need a law to break that the
cap does not already block (the emission cap refuses the outfit outright, slice 2a RULE-44; hoarding and green
zone are not built). Collecting law taxes only from inspected players changes the fund's income, which Heiko
ruled on 4 Nov (taxes charged to every payer, G-5's income). Escorting the ship needs Security at 200 (slice
5) and a pirate raid on the ship (today's raid takes everyone's Crystite). The inquiry reads budget lines,
which are slice 5's. Check: `packages/engine/src/politics.ts::collectLawTaxes`,
`::outfitBlocked`; `EVENTS` pirateRaid in config.ts.

**All five orders:** three need systems that do not exist (non-goals). WS7's slice brief (7 Nov) names the
same two.

### Decisions taken as designer (recorded so a reader can check each reason)

1. **The crew is paid at the month end, not when ordered.** Money is public (`packages/protocol/src/index.ts::PlayerView`,
   `money`): a cost taken in planning would show every phone that Lena just spent 120, so the order is no
   longer secret (HC-4). At upkeep the cost lands among the law taxes and office pay. The residual inference
   (someone doing the arithmetic on Lena's money) is accepted, as AM-8 accepted it for vote totals.
2. **A void order costs nothing:** if the plot changed owner or lost its MULE before production, the crew finds
   nothing to cut.
3. **Fines go through the fund both ways:** the culprit pays the whole fine in (`fundIn(state, 'fine', …)`),
   and the victim's half comes out (`fundOut(state, 'restitution', …)`). No player pays another directly
   (HC-3), the ledger shows both, and `colony.ts` stays the only writer of `treasury.money`.
4. **Fines do not count as taxes paid** toward vote weight (`treasury.paid`): a fine must not buy votes.
5. **The Sheriff picks the fine; if they don't, the standard fine applies** when the planning after the
   capture ends (or at the last upkeep if the game ends first). Design 05 gives the Sheriff the choice; a case
   left open would let a Sheriff spare a friend by doing nothing, which the standard fine closes.
6. **Two guards.** Design 05 says one, plus one per 100 on the Security line; WS6's hub mock shows "2 of 2".
   Until slice 5 funds Security, two stand in for a funded line (config, placeholder).
7. **Anyone may order, the Sheriff and the Governor too.** Design 05: "Corruption is possible."
8. **A pact breaks when the sabotage is revealed, not when it is ordered.** UBER-AC-3 (parent) says "when Lena
   is later caught sabotaging Brix, her reputation falls by the pact-break amount". An undetected breach costs
   nothing until someone proves it.
9. **The power-cut plot runs and makes 0** (its Energy, a factory's inputs and its experience count as usual),
   as a flood's plot does. Skipping the plot would reset its `runMonths`, a second, unannounced penalty.
10. **The rumour lasts the goods auction only.** The posted price is restored when the auction ends, so next
    month's prices move from the real price, not the rumoured one.
11. **Sabotage is never a colony event.** Its own event kind (`'sabotage'`) and titles ("Sabotage: …"); only
    sabotage enters the Sheriff's list of incidents (S4-RULE-14).

### §0.2 · Constraints `[handoff]`

```
S4-HC-1  packages/engine stays pure. Order outcomes draw from their own stream seeded from (seed, month);
         an investigation from (seed, the order's number). No election, council, event or AI draw moves.
         source: CLAUDE.md, parent HC-1, slice 2a HC-41                        breach: fatal
S4-HC-2  Every number lives in config.ts's POLITICS block: POLITICS.sabotage, POLITICS.sheriff,
         POLITICS.laws.sabotageBan, POLITICS.ai.sabotage. No literal in rules, AI, server or screens.
         source: parent HC-2, memory "configurable balance"                    breach: fatal
S4-HC-3  Nothing of value passes between players directly. A fine enters the fund (source 'fine'); the
         victim's half leaves it (line 'restitution'); a crew is paid to nobody. A deal card or an order
         never moves value.                       source: parent HC-3            breach: fatal
S4-HC-4  Secrecy per S4-RULE-12: an order and a crew cost only on the orderer's view and observe(); guards
         only on the Sheriff's; a culprit only once revealed; a failed, undetected order only on the
         orderer's view. The TV and the board get no secret.
         source: parent HC-4, 00-concept "private hand"                         breach: fatal
S4-HC-5  politics:false behaves exactly as today (sim byte-identical). POLITICS.sabotage.on = false: no
         order, no incident, no ban impact; the Sheriff is still elected.
         source: parent HC (D3), slice 2a HC-42                                  breach: fatal
S4-HC-6  Player sabotage and the colony's social events never share an event key, kind or title, and only
         sabotage incidents are investigable.     source: WS7 slice brief 7 Nov  breach: needs decision
S4-HC-7  Edits outside WS7's paths are the named edits in §1 and §11 only, recorded in SEAMS before the PR.
                                                  source: parent HC-6            breach: needs decision
S4-HC-8  No screen before WS6's slice-4 mock is approved by Heiko; the mock is the scaffold.
                                                  source: parent non-goals       breach: fatal
S4-HC-9  AI hands read only observe(); none reads state.seed (slice 2a INV-41); each new hand draws from its
         own seat-salted stream.                  source: slice 2a AM-4          breach: fatal
S4-HC-10 Crew costs, fines, restitution and the Sheriff's pay move money: sim rows on all three seed sets
         and Heiko's OK before trunk (D3).        source: parent HC-7            breach: needs decision
```

---

## What the table sees `[handoff]`

Places only; WS6 mocks every layout (S4-HC-8). "The laptop" is a player's own screen in the wide shell (the
hub's `@min-[1100px]/shell` layout): it shows exactly what that player's phone shows. A laptop opened as the
table view shows what the TV shows.

| Moment | The saboteur's phone (Lena) | The Sheriff's phone (Brix) | Every other phone | TV |
|---|---|---|---|---|
| **Planning: order (P6)** | The **Secret desk** (locked, eye-slash): two orders with cost, works % and caught %, "Pick the target on the map…" (the **Target** map tool); a warning if the target holds a pact with her (slice 3's data); her order, replaceable or withdrawn until planning ends; "Paid at the month end: 120 cr" | Nothing of Lena's order | Nothing | Nothing |
| **Planning: the Sheriff (P7, P8)** | — | The **Sheriff's desk** (only the Sheriff): "Guards · 1 of 2 placed" and the **Guard** map tool, guard marks on their own map only (P8); "Investigate · 1 this month" listing unsolved incidents; "Fine" on each revealed case with a step picker (50…300, "×2 under the sabotage ban") | The public **incidents list** (month, victim's plot or the good, "culprit unknown" or the name, fined or not), on the Colony desk or where WS6 places it | The incidents list; an investigation's result as a moment: "Solved by the Sheriff: it was Lena" or "The trail went cold" |
| **Election day (P9)** | Two offices: run for Governor (with a promise) or Sheriff (one tap, no promise), two ballot papers, the ceremony reveals Governor then Sheriff | same | same | The ceremony, two offices; the Sheriff's job line ("guards plots, investigates sabotage, fines the culprits") |
| **Council (P11)** | The **sabotage ban** in the Governor's law picker (settings ×2, ×3) and on the ballot with "For you: …" | same | same | The TV council panel names it; laws in force show "Sabotage ban ×2" |
| **Production (P10)** | Her own result if it failed unseen: "Your crew failed; nobody saw" (private) | — | — | **Worked, not caught:** the plot goes dark (the map's `OFF` flag) with "Sabotage: someone cut the power to Brix's Food plot". **Caught:** the **"Caught!"** headline with the culprit's name, the plot dark or (guarded) not. **Rumour:** "A rumour: Food opens 25% higher at the auction". Every phone's production screen shows the same public events |
| **Auction** | — | — | The store's opening line for the rumoured good, shifted | same |
| **Month end (P10)** | Her private line: "Sabotage crew: 120 cr" | Restitution: "+75 cr (half of Lena's fine)" | The news: "Lena was fined 150 for sabotage; half to Brix" | The month-end colony panel's fund in: "Fines 150", out: "To victims 75"; the news line |

How a player tells sabotage from the colony's own trouble (strikes, walkouts, MULE thefts): sabotage always
says "Sabotage" and "someone" or a name, and it is the only kind the Sheriff can investigate; a colony event is
titled by its cause (Walkout, General strike, MULE theft) and never names a person (S4-RULE-14).

---

## §1 · Solution Design `[handoff]`

The repo is not prism-indexed: call-site lists below are grep-built (`git grep -n`), a weaker claim than
find-refs.

```
S4-C1 · ADDED · secret sabotage orders and their state

today        no order, no sabotage state. Politics is one object written only by politics.ts through its
             private copy-on-write edit().
             anchors: packages/engine/src/types.ts::Politics, packages/engine/src/politics.ts::newPolitics,
             ::openPlanning
             verified_by: read
tomorrow     MUST let any player, in planning with politics and POLITICS.sabotage.on, place one order a month
             (a power cut on another player's working plot, or a rumour on a good, up or down), replace it or
             withdraw it until planning ends (S4-RULE-2). MUST keep every order of the game in
             Politics.sabotage (the frozen SabotageOrder, outcome 'pending' until production) and this
             month's guards in Politics.guards, emptied when planning opens.
logic        → §2 S4-RULE-1, S4-RULE-2 · evaluated at the intent · writes politics.sabotage (a pending
             order, replaced or removed until planning ends)
seam         packages/engine/src/sabotage.ts (new; listed for WS7 in SEAMS) with its own private edit()
             (the one-line structuredClone of politics.ts and colony.ts); packages/engine/src/politics.ts::newPolitics creates
             the empty list and ::openPlanning calls the new sabotage.ts's newSabotageMonth (guards emptied)
senior       junior would: add the orders to Player, or a GameState.sabotage beside politics · senior does:
             fields of Politics (frozen), so politics:false removes them with no new check, cloneForSim's deep copy
             of politics already covers it (FM-WS3-4), and observe() hides it in one place
mechanism    sprout
call sites   orderSabotage: apps/server/src/mule-game.ts::MuleGame (handle 'sabotage'),
             packages/ai/src/play.ts::applyAction, engine tests
pin          slice 1 and 2a tests (packages/engine/test/politics*.test.ts) pass unchanged
depends_on   S4-C20 (contract: types, stubbable from §3)
```

```
S4-C2 · ADDED · orders resolve when production starts; a power cut darkens its plot

today        production rolls its events, adds an unpaid strike's event last, then credits every plot with
             each event that reaches it applied in fired order.
             anchors: packages/engine/src/production.ts::runProduction, packages/engine/src/events.ts::strikeEvent,
             ::eventOutput, ::plotEvent; packages/engine/src/game.ts::advancePhase (production branch)
             verified_by: read
tomorrow     MUST resolve every order in seat order when production starts (S4-RULE-3): void, guarded, or
             two seeded draws (works, seen). MUST file one production event per public outcome (S4-RULE-4):
             a power cut that worked hits its plot and takes its output to 0; a caught one names the
             culprit; a failed, unseen one files nothing. MUST do nothing on a what-if copy.
logic        → §2 S4-RULE-3, S4-RULE-4 · evaluated once, before runProduction · writes each of the
             month's pending orders' outcome, victim, worked, culpritPublic; removes a void order
seam         packages/engine/src/game.ts::advancePhase production branch: one line `resolveSabotage(state)` before
             runProduction (WS3 named edit). packages/engine/src/production.ts::runProduction: one line
             `events.push(...sabotageEvents(state))` right after the strike's push (WS1 named edit), the
             same pattern as strikeEvent. events.ts: SHAPE rows for 'powerCut' and 'marketRumour',
             eventOutput `powerCut: () => 0`, and `storeEvent` exported (today's private offMapAtStore)
             for the rumour's event (WS1 named edits)
senior       junior would: skip the cut plot in runProduction, or subtract its output after the fact ·
             senior does: an event like a flood, so the plot's line shows the cut as a part
             (why 'event', event 'powerCut'), the show and the TV event layer play it with no new path,
             and the plot keeps its experience (skipping it would reset runMonths)
mechanism    sprout + two one-line in_place calls (named edits)
call sites   resolveSabotage: packages/engine/src/game.ts::advancePhase only. sabotageEvents:
             packages/engine/src/production.ts::runProduction only.
pin          production tests and WS1's sim rows: with no order every line and event is unchanged
             (S4-T-AC-11)
depends_on   S4-C1 (data)
```

```
S4-C3 · ADDED · a market rumour shifts one good's opening price for the auction

today        the auction posts prices when it opens; each good's store lines come from the posted price
             when it comes up.
             anchors: packages/engine/src/economy.ts::postPrices, ::colonyPrice;
             packages/engine/src/auction.ts::startAuction, ::endAuction; packages/engine/src/game.ts::advancePhase (auction and
             upkeep branches)
             verified_by: read
tomorrow     MUST shift store.posted for each worked rumour's good by POLITICS.sabotage.orders.rumour.shift,
             up or down, after postPrices and before startAuction, and MUST put the posted price back to
             what postPrices set when the auction ends (S4-RULE-4).
logic        → §2 S4-RULE-4 · evaluated at auction open and auction end · writes store.posted (second
             writer, §9), politics.rumoured
seam         packages/engine/src/game.ts::advancePhase: `applyRumours(state)` after postPrices, `endRumours(state)` right after
             endAuction (WS3 named edits, one line each)
senior       junior would: a rumour field read inside economy.ts's pricing, or leave the shifted price in
             place · senior does: shift the one number the auction already reads and restore it at the
             auction's end, so next month's price walks from the real price and WS1's pricing code is
             untouched
mechanism    sprout + in_place calls
call sites   applyRumours, endRumours: packages/engine/src/game.ts::advancePhase only
pin          with no rumour, posted prices before and after the auction are unchanged (S4-T-AC-6)
depends_on   S4-C2 (data: worked rumours)
```

```
S4-C4 · ADDED · a revealed saboteur loses reputation, breaks pacts and opens a case

today        reputationShift moves a player's reputation within POLITICS.reputation (used by the blamed-for-
             unrest event). Slice 3 (designed, ws7-slice3-deals @ 8ebc6857) wraps it in diplomacy.ts's
             moveReputation(state, id, delta, cause, withId?, cardId?) as the only caller, adds pacts with
             pactBreach / pactBetween, and a sabotagePossible(state) that returns false until this slice.
             anchors: packages/engine/src/politics.ts::reputationShift, ::voteWeight
             verified_by: read (trunk); slice 3's spec §3 (designed, not built)
tomorrow     MUST, at every attribution (guarded, caught on the spot, or revealed by an investigation): set
             culpritPublic, move the culprit's reputation by moveReputation(state, culprit,
             POLITICS.reputation.moves.caught × the ban's multiplier, 'caught', victim), and, when there is a
             victim, call pactBreach(state, culprit, victim, order.month) (S4-RULE-5). MUST add 'caught' to
             RepCause and POLITICS.reputation.moves. MUST replace sabotagePossible's body (S4-RULE-5).
logic        → §2 S4-RULE-5 · evaluated at resolution and at an investigation
seam         the new sabotage.ts's private reveal(), the one place every reveal goes through
senior       junior would: apply the reputation loss in three places (production, investigation, the view)
             · senior does: one reveal function, so a guard catch, a chance catch and a solved case cost the
             same, and slice 3's hook has one caller
mechanism    sprout
call sites   resolveSabotage, investigate
depends_on   S4-C2 · slice 3's diplomacy.ts (moveReputation, pactBreach; contract, stubbable if slice 3's
             engine PR lands later: pactBreach returns false, moveReputation calls reputationShift)
```

```
S4-C5 · ADDED · the Sheriff guards plots, investigates an incident and fines a revealed culprit

today        the Sheriff office exists in the types and the election code; nothing it can do.
             anchors: packages/engine/src/types.ts::Politics (sheriff), packages/engine/src/colony.ts::fundIn,
             ::fundOut
             verified_by: read
tomorrow     MUST let the sitting Sheriff, in planning once the votes are over: set up to the allowed number of
             guards (S4-RULE-6); investigate one public, unsolved incident a month on its seeded odds
             (S4-RULE-7); fine each revealed case once within the allowed steps (S4-RULE-8). MUST levy the
             standard fine on a case still unfined when the next planning ends, or at the last upkeep.
logic        → §2 S4-RULE-6, -7, -8 · writes politics.guards and an order's investigated, culpritPublic and
             fine; money through colony.ts
seam         the new sabotage.ts's setGuards, investigate, fineCulprit, closeCases (called from
             packages/engine/src/politics.ts::closeVotes, which game.ts already calls when planning ends), settleSabotage
             (S4-C8's upkeep call levies the last month's)
senior       junior would: move the fine from culprit to victim directly · senior does: in and out through
             fundIn/fundOut (HC-44 of slice 2a), so the ledger shows fines and restitution and no player
             pays another (HC-3); a payer short of money pays what they have, as a law tax
mechanism    sprout
call sites   server intents (S4-C13), SheriffHand (S4-C10), engine tests; closeCases from closeVotes
depends_on   S4-C4, S4-C6
```

```
S4-C6 · MODIFIED · the Sheriff is elected again and paid

today        POLITICS.offices = ['governor'] (AM-19). The election, appointment, pay, office score, canRun
             and the web's election screens are generic over POLITICS.offices; the Sheriff's job line is
             missing from the web's JOB words; RULE-10 refuses a Sheriff promise "yet".
             anchors: packages/engine/src/config.ts::POLITICS (offices, pay, ai.runSheriff),
             packages/engine/src/politics.ts::takeOffice, ::appointee, ::payOffices, ::canRun,
             apps/web/src/phone/hub/politics/words.ts::JOB, packages/ai/src/hands/vote.ts::nextTax
             verified_by: read
tomorrow     MUST set POLITICS.offices = ['governor', 'sheriff']: both are elected every term, a Sheriff is
             appointed when nobody runs (RULE-3 row 2: the richest player who is not the new Governor), and
             paid POLITICS.pay.sheriff (30) at upkeep (RULE-7). MUST drop "yet" from the Sheriff-promise
             refusal. MUST add the Sheriff's job line.
logic        → §2 S4-RULE-11 (existing rules, restated)
seam         config.ts POLITICS (WS7); words.ts (WS7); the refusal text in packages/engine/src/politics.ts::checkPromise (WS7)
             and the matching legalWhen line in packages/ai/src/actions.ts (WS1 named edit)
senior       junior would: re-add Sheriff branches across engine, AI and web · senior does: flip the one list
             AM-19 made the switch; everything else already reads it. The AI Governor's low-fund bump
             (nextTax) sums the offices' pay, so it now counts 80 a month: WS1's rows show it.
mechanism    in_place
call sites   every POLITICS.offices reader (`git grep -l POLITICS.offices`, tests aside): politics.ts,
             config.ts, types.ts (a comment), hands/vote.ts, llm/manual.ts and llm/moves-stub.ts (WS2),
             politics-view.ts, hub/politics/{Colony,Council,ElectionDay,Offices,Reveal,Run}.tsx, words.ts,
             TvElection.tsx, e2e/politics-steps.ts. WS2's two files read the list, so its Claude manual
             names the Sheriff once the list does: WS2 checks the wording, no edit expected.
pin          the untimed election's tests for two offices (they were written generic, AM-19); T-AC-5's fund
             floor; WS1's politics rows re-measured (money moves: Sheriff pay)
ux           mock: WS6, to come (P9: two offices on election day; WS6 dropped the second office on 28 Oct
             with "layout able to take a second office later")
depends_on   none
```

```
S4-C7 · MODIFIED · the sabotage ban is the fifth law

today        four laws in POLITICS.laws; the council's machinery, lawImpact, the AI's proposal and vote, the
             law picker and the TV council panel are generic over POLITICS.laws, with per-law words.
             anchors: packages/engine/src/config.ts::POLITICS (laws), packages/engine/src/politics.ts::LAW_NAME,
             ::lawImpact, ::proposeLaw, packages/engine/src/types.ts::LawId,
             apps/web/src/phone/hub/politics/LawPicker.tsx::settingWords, ::chipWords, ::LAW_MEANING,
             apps/web/src/table/TvCouncil.tsx
             verified_by: read
tomorrow     MUST add sabotageBan with settings [2, 3] (a multiplier on the fine and the reputation loss of a
             capture revealed while it is in force), through the existing council (propose, vote, three in
             force, retry months). MUST give it a public "For you" preview (S4-RULE-10).
logic        → §2 S4-RULE-10 · read at every attribution (reputation), every fine and every preview
seam         config.ts POLITICS.laws; LawId (WS3 named edit); politics.ts LAW_NAME and enactImpact's switch
             (WS7); words in LawPicker.tsx and TvCouncil.tsx (WS7)
senior       junior would: a separate "ban" flag beside the laws · senior does: one more law row, so propose,
             vote, retry and repeal need no new code; the multiplier is read when it applies (the reputation
             at the attribution, the fine at its levy), so no case stores it
mechanism    in_place
call sites   lawImpact: politics-view.ts, vote.ts; LAW_NAME: LawPicker.tsx, TvCouncil.tsx, politics-view.ts
pin          slice 2a's council tests (T-AC-40..51) pass unchanged
ux           mock: WS6, to come (P11)
depends_on   S4-C4 (the multiplier's reader)
```

```
S4-C8 · ADDED · crews are paid at the month end; the ledger shows fines and restitution

today        upkeep runs the month end, collects the law taxes, pays the grant and the offices.
             anchors: packages/engine/src/game.ts::advancePhase (upkeep branch),
             packages/engine/src/politics.ts::collectLawTaxes, packages/engine/src/types.ts::FundSource, ::FundLine
             verified_by: read
tomorrow     MUST charge each player's crew costs for this month's resolved orders at upkeep, what they have at most, to
             nobody (S4-RULE-9); MUST levy the standard fine on open cases at the last month's upkeep. MUST add
             fund source 'fine' and line 'restitution'.
logic        → §2 S4-RULE-8, S4-RULE-9
seam         packages/engine/src/game.ts::advancePhase upkeep branch: one line `settleSabotage(state)` after collectLawTaxes
             (WS3 named edit); FundSource/FundLine (WS3 named edit)
mechanism    sprout + one-line call
call sites   packages/engine/src/game.ts::advancePhase only
pin          with no order, upkeep's money totals are unchanged (S4-T-AC-11)
depends_on   S4-C2
```

```
S4-C9 · MODIFIED · observe() hides orders, guards and unrevealed culprits

today        observe() hides other seats' ballots, stock, analyses, the seed and the coming grant order.
             anchors: packages/engine/src/observe.ts::observe
             verified_by: read
tomorrow     MUST filter, per the frozen HC-4 rule: keep the seat's own orders whole; keep another seat's
             order only when its effect or its culprit is public (outcome 'done' or 'caught', or
             culpritPublic), with `by` set to null unless culpritPublic, and `cost` 0; drop every other
             order (pending, or failed unseen). Keep politics.guards only for the sitting Sheriff (else []).
             Keep politics.rumoured (public: the posted prices before the auction's shift).
logic        → §2 S4-RULE-12
seam         observe.ts (WS1 named edit), beside the ballot hiding
mechanism    in_place
call sites   every AI hand (observe), the strategist
pin          observe's existing tests
depends_on   S4-C1
```

```
S4-C10 · ADDED · AI seats sabotage and do the Sheriff's job; VoteHand votes on the ban

today        VoteHand runs, votes, sets the tax and, as Governor in planning proper, proposes a law and acts
             for the colony; its council draws use their own seat-salted stream.
             anchors: packages/ai/src/hands/vote.ts::VoteHand
             verified_by: read
tomorrow     MUST add SabotageHand.order and SheriffHand.guard / investigate / fine (S4-RULE-13), each with
             its own seat-salted stream, called by VoteHand in planning proper right after govern (no new
             construction site in the server or the sim). MUST vote on the ban by lawWorth (S4-RULE-13).
logic        → §2 S4-RULE-13 · once per month in planning proper · reads observe() and WS1's values
seam         packages/ai/src/hands/sabotage.ts and sheriff.ts (new, WS7: "new hands for the Sheriff,
             sabotage and budget", the PM's AI split); vote.ts calls them
senior       junior would: construct two new hands in mule-game.ts and play.ts, or draw from VoteHand's rng ·
             senior does: VoteHand owns the seat's politics turn and calls them, so WS3 and WS1 add no
             construction line, and their own streams leave every election and council draw where it was
mechanism    sprout + in_place (VoteHand's planning-proper branch)
call sites   VoteHand.tick (server: tickVoteHands; sim: play.ts's planning loop)
pin          packages/ai/test/vote-hand.test.ts and council-ai.test.ts pass unchanged
depends_on   S4-C11 (contract, stubbable), S4-C20
```

```
S4-C11 · ADDED · WS1's valuations for sabotage, the Sheriff and the ban

today        value.ts prices plots, goods, cash reserves; nothing values sabotage or guards.
             anchors: packages/ai/src/value.ts::Mind, ::cashReserve, ::yieldOf
             verified_by: read
tomorrow     MUST export sabotageGain, captureCost, guardValue, investigateValue (WS1's confirmed names) and
             value the ban in lawWorth, with the signatures and duties in §10 (Hand decisions).
seam         packages/ai/src/value.ts (WS1)
mechanism    sprout
depends_on   S4-C20 (types)
```

```
S4-C12 · MODIFIED · the sim plays sabotage and reports it (WS1)

today        play.ts applies AI actions through engine calls; actions.ts catalogues every move; sim.ts prints
             a politics row.
             anchors: packages/ai/src/play.ts::applyAction, packages/ai/src/actions.ts::AiAction,
             packages/ai/src/sim.ts
             verified_by: read
tomorrow     MUST route the four new actions (sabotage, guard, investigate, fine) in applyAction and the move
             catalogue, and print a sabotage row with S4-UBER-AC-3's checks (S4-RULE-15). MUST keep the
             per-month event budget row free of kind 'sabotage' events.
seam         WS1's play.ts, actions.ts, sim.ts
mechanism    in_place
pin          politics-off rows byte-identical (S4-HC-5)
depends_on   S4-C1..C10
```

```
S4-C13 · MODIFIED · the server takes four intents and sends the sabotage views

today        mule-game.ts handles the politics intents and builds each screen's view with
             politics-view.ts; production events reach screens through monthEventView, field by field.
             anchors: apps/server/src/mule-game.ts::MuleGame, ::monthEventView,
             apps/server/src/politics-view.ts::politicsView, ::myPoliticsView, apps/server/src/server.ts::isIntent
             verified_by: read
tomorrow     MUST accept sabotage, guard, investigate and fine; MUST add the public sabotage view, the
             orderer's and the Sheriff's private views, and copy MonthEvent.sabotage into EventView; MUST
             add news lines at production (catches, unseen cuts, rumours), at an investigation and at a fine;
             MUST emit the record's sabotage notices (S4-RULE-12, leak points) through the server's
             partyTo(viewerId, secret) helper.
logic        → §2 S4-RULE-12
seam         mule-game.ts handle cases and monthEventView's copy, server.ts isIntent, record.ts NoticeEntry
             (WS3 named edits); politics-view.ts sabotageView, mySabotageView, sabotageNews,
             sabotageNotices (WS7)
mechanism    in_place
pin          apps/server/test/politics.test.ts rows pass unchanged; the board view's privacy test gains
             the new keys
depends_on   S4-C20 (contract)
```

```
S4-C14 · ADDED · P6, the Secret desk and the Target tool

today        the hub's slot API names a Secret desk and Target tool for WS7 to add; the mock has a
             placeholder SecretDesk listing five orders.
             anchors: apps/web/src/phone/hub/slots.ts, design/mocks/ws6-ux/src/screens/PlanningHub.tsx::SecretDesk
             verified_by: read
tomorrow     MUST render WS6's approved slice-4 mock: two orders with the public terms, the target picked on the
             map, the pact warning (slice 3's data), the order's state, "paid at month end".
ux           mock: WS6, to come · GRAFT TARGET: new apps/web/src/phone/hub/politics/Secret.tsx; the desk,
             agenda item and tool entries in hub/today.tsx (WS6's file, WS7 named edit as in PR-4)
mechanism    fill_scaffold
depends_on   S4-C13 (contract), WS6's approved mock
```

```
S4-C15 · ADDED · P7 and P8, the Sheriff's desk and guard marks

ux           mock: WS6, to come (start: PlanningHub.tsx::SheriffDesk) · GRAFT TARGET: new
             apps/web/src/phone/hub/politics/Sheriff.tsx; Guard tool and the Sheriff-only marks on the hub
             map (hub/today.tsx entries, WS6's; the map's mark through packages/ui HoloMap's existing flag
             prop, WS4 reviews)
tomorrow     MUST render the approved mock: guards placed of max, the Guard tool, investigations left and
             the open incidents, the fine picker on each fineable case with the multiplier.
mechanism    fill_scaffold
depends_on   S4-C13, WS6's approved mock
```

```
S4-C16 · MODIFIED · P9, election day with the Sheriff

today        ElectionDay.tsx, TvElection.tsx and the ceremony are generic over POLITICS.offices; JOB has the
             Governor only.
tomorrow     MUST show two offices from WS6's mock: two ballot papers, two ceremonies, the Sheriff's job line.
ux           mock: WS6, to come · GRAFT TARGET: ElectionDay.tsx, words.ts, TvElection.tsx (WS7)
mechanism    in_place
depends_on   S4-C6, WS6's approved mock
```

```
S4-C17 · ADDED · P10, the sabotage show in production and the month end

today        the production show plays every production event in fired order by its weight
             (config.ts::EVENT_SHOW, WS8); the ui event catalogue has a story per event kind; HoloMap has an
             unused 'sabotage' flag drawn "OFF".
             anchors: packages/ui/src/components/HoloMap.tsx, apps/web/src/table/TvProduction.tsx,
             apps/web/src/phone/Production.tsx, apps/web/src/events/TvEventLayer.tsx
             verified_by: read
tomorrow     MUST play kind 'sabotage': the dark plot, "Sabotage: someone…", and the "Caught!" headline with
             the culprit (including a guarded, foiled one); EVENT_SHOW.weight rows for powerCut and
             marketRumour (headline). MUST show fines and restitution in the month end's colony panel and
             news.
ux           mock: WS8 (event stories, from its gallery's "Sabotage!" card) and WS6 (dark plot, month end),
             to come · GRAFT TARGET: packages/ui/src/events/** and apps/web/src/events/** (WS8);
             TvProduction.tsx, Production.tsx (WS6); components/MonthEnd.tsx or Colony.tsx (WS4)
mechanism    fill_scaffold
depends_on   S4-C13, the approved mocks
```

```
S4-C18 · MODIFIED · P11, the ban in the council

tomorrow     MUST name and explain the ban in the law picker, the ballot's "For you" and the TV council
             panel, per the approved mock.
ux           mock: WS6, to come · GRAFT TARGET: LawPicker.tsx (settingWords "×2", chipWords, LAW_MEANING),
             TvCouncil.tsx (WS7)
mechanism    in_place
depends_on   S4-C7
```

```
S4-C19 · MODIFIED · the e2e step (S4-UBER-AC-2)

seam         apps/web/e2e/politics.ts (WS7), one more month after the election step
depends_on   S4-C13..C17
```

```
S4-C20 · ADDED · the contract commit

tomorrow     MUST land first, in one commit, everything in §3: engine types (WS3), protocol and isIntent
             (WS3), the POLITICS config blocks with placeholders (WS7), and sabotage.ts with every export's
             signature: the flow functions (newSabotageMonth, resolveSabotage, applyRumours, endRumours,
             settleSabotage, closeCases) are no-ops and sabotageEvents returns [], the intent functions throw
             RuleError('Sabotage is not built yet'), and captureOdds returns 0, so every existing test passes;
             plus, if slice 3's or slice 5's engine PRs have not landed: pactBreach returning false and a
             securitySpend returning 0, with their signatures. PR-0 wires no call into game.ts or production.ts.
mechanism    sprout
depends_on   none
```

**Reuse checks (self-review check 6; `git grep`, the repo is not prism-indexed). Results as run on
52c54b07:**
- S4-C1..C5, C8: `git grep -niE 'sabot|culprit|investigat' packages/engine/src packages/ai/src
  apps/server/src` → only the persona and level weights (config.ts `AI_PERSONAS`, `AI_LEVELS`,
  `POLITICS.ai.*` per-persona rows), `strategist.ts` (spite in land and auction), `playbook/draft.ts` (the
  `spoiler` plan), `personas.ts` and `lineup.ts`. No order, guard, case or fine exists. The nearest
  neighbours, reused: the event pipeline (`packages/engine/src/events.ts::strikeEvent`'s pattern, `::plotEvent`,
  `::eventOutput`), `packages/engine/src/politics.ts::reputationShift`, `packages/engine/src/colony.ts::fundIn` / `::fundOut`, the council's law row,
  slice 2a's seat-salted stream. `packages/ui/src/components/HoloMap.tsx` already draws a `'sabotage'` flag
  ("OFF") that nothing sets: S4-C17 uses it.
- S4-C3: `git grep -niE 'rumou?r' packages/engine/src` → nothing; `git grep -n 'posted\[' packages/engine/src`
  → economy.ts (postPrices writes; storeBuyPrice, nextPostedPrice, colonyPrice read), game.ts (createGame
  writes), production.ts and upkeep.ts (read). No price modifier exists to reuse, so the rumour shifts the
  posted number and restores it (§9's second writer).
- S4-C10: `git grep -nE 'class [A-Za-z]*Hand' packages/ai/src` → AuctionHand, DevelopHand, LotHand,
  VoteHand. VoteHand is the seat's politics turn, so the two new hands hang off it.
- S4-C11: `git grep -niE 'guard|sabot|\bfine' packages/ai/src/value.ts` → nothing.

---

## §2 · The Logic `[handoff]`

```
S4-RULE-1 · The month of a sabotage                               shape: sequence

planning     orders placed, replaced, withdrawn (secret) · after the votes: the Sheriff guards,
             investigates (result public at once) and fines · planning ends: orders lock; revealed cases
             still unfined pay the standard fine (closeCases, S4-RULE-8)
land grant,  nothing (a plot may change hands or lose its MULE: the order may become void)
land auction,
development
production   resolveSabotage (S4-RULE-3) before anything is made; sabotage events file last, after the
             strike (S4-RULE-4); the reveals show in the production show
auction      worked rumours shift the posted price at open; it is restored at the auction's end
upkeep       crews paid (S4-RULE-9); in the last month, open cases pay the standard fine
next planning  guards and investigations reset (newSabotageMonth); incidents stay for the game
examples     month 3: Lena orders, Brix guards → month 3 production: caught → month 4 planning: Brix fines,
             or month 4's planning end: the standard fine
```

```
S4-RULE-2 · An order is valid                                      shape: decision table

inputs    politics (on | off) · POLITICS.sabotage.on · phase · order kind (powerCut | rumour) · target tile's
          owner (another player | the orderer | nobody) · tile outfit (makes a good | none) · good ∈ GOODS ·
          dir (up | down) · money vs the order's cost
first match wins
  #   when                                                   then
  1   politics off, or POLITICS.sabotage.on false              refuse "This game plays without sabotage"
  2   not planning                                             refuse "Orders are given in planning"
  3   order null                                               withdraw (no charge, none was due)
  4   powerCut, tile owned by nobody or by the orderer         refuse "Pick another player's plot"
  5   powerCut, tile makes no good (no MULE, or a green belt)  refuse "That plot makes nothing to cut"
  6   rumour, good not a good                                  refuse "Pick a good"
  7   money < the order's cost                                 refuse "A crew costs C cr; you have M"
  8   otherwise                                                the order (replacing any earlier one this month)
unknown   no earlier order → a new one. The order gets id 'sab-<n>' (a counter: the orders' count + 1),
          month, cost = the kind's cost now, outcome 'pending', culpritPublic false. Its victim is fixed only
          when it resolves (the frozen rule: the tile's owner then).
examples  power cut on Brix's Food plot, Lena has 300 → valid · on her own plot → row 4 · on a free plot →
          row 4 · rumour with 40 cr against cost 60 → row 7 · a second order → replaces the first
```

```
S4-RULE-3 · Resolving an order                                      shape: decision table

evaluated_at  production starts (resolveSabotage), each pending order in seat order; not on a what-if copy
draws         per order, from createRng over (seed, month, POLITICS.sabotage.streamSalt): first works =
              chance(success), then seen = chance(captureOdds(state, order)), both drawn for every non-void
              order so the stream never depends on a guard
captureOdds   the one formula (frozen export, sabotage.ts): 1 when the target tile is in politics.guards;
              else min(1, detect + floor(securitySpend / 100) × POLITICS.sheriff.securityDetect).
              securitySpend unknown until slice 5 = 0. Called on observe()'s copy it sees no guards (except
              the Sheriff's own view), so the AI's odds are the public ones (HC-4).
inputs        target (powerCut): owner now (another player | the orderer | nobody) · makes a good now
              (yes | no) · guarded (yes | no) · works (yes | no) · seen (yes | no)
first match wins                                      outcome   worked   culpritPublic   victim
  1   powerCut, owner now is the orderer or nobody,   void: the order is removed from politics.sabotage;
      or makes no good now                            no charge; the orderer's private notice "the crew
                                                      found nothing to cut"
  2   powerCut, guarded                               caught    false    true (S4-RULE-5)   owner now
  3   works and seen                                  caught    true     true               owner now / null
  4   works, not seen                                 done      true     false              owner now / null
  5   not works, seen                                 caught    false    true               owner now / null
  6   not works, not seen                             failed    false    false              owner now / null
                                                      (rumour: victim null)
charge    rows 2-6 owe the order's `cost` at this month's upkeep (S4-RULE-9); row 1 owes nothing
public    an order is public when its outcome is 'done' or 'caught', or culpritPublic: its effect or its
          culprit is known. A 'failed' order with culpritPublic false is the orderer's alone.
examples  guarded → row 2 whatever the draws · works 0.6 drawn 0.31, captureOdds 0.3 drawn 0.72 → row 4 · the
          plot bought at the land auction by the orderer → row 1 · bought by Kai → Kai is the victim
```

```
S4-RULE-4 · What an order does                                      shape: decision table

  kind       outcome                     production event (sabotageEvents)              effect
  powerCut   works                       key powerCut on the plot (plotEvent), last     the plot's output → 0
                                         in production's events; sabotage.culprit =     (eventOutput, after
                                         name if revealed, else null                    every other event)
  powerCut   fails, revealed             key powerCut at the plot, plots: [] (no hit),  none
                                         culprit, guarded = (row 2)
  rumour     works                       key marketRumour at the store (storeEvent),     at auction open: posted
                                         line names good and direction; culprit if      [good] × (1 ± shift),
                                         revealed                                       rounded, at least 1;
                                                                                        restored at its end
  rumour     fails, revealed             key marketRumour, culprit                       none
  any        fails, unrevealed           no event                                        none
several   two cuts on one plot: two events, the second's delta 0. Two rumours on one good add their
          shifts (up and down cancel).
words     titles "Sabotage: power cut" / "Sabotage: market rumour"; lines carry no name (the screens name
          sabotage.culprit): "Someone cut the power to a Food plot: it makes nothing this month." · "Caught!
          The saboteur is named." · "Caught at a guarded plot: the power stays on." · "A rumour: Food opens
          25% higher at the auction."
examples  Brix's Food plot would make 4 → makes 0, its line's last part {why 'event', event 'powerCut',
          delta -4} · Food posted 30, rumour up 0.25 → the store opens at 38 (round 37.5) → after the
          auction 30 again
```

```
S4-RULE-5 · An attribution                                          shape: sequence

on every attribution (guarded, caught on the spot, or revealed by an investigation), in this order:
  1  culpritPublic = true (on the spot, outcome 'caught'; an investigation leaves the outcome 'done')
  2  moveReputation(state, culprit, POLITICS.reputation.moves.caught × multiplier, 'caught', victim)
     (slice 3's only writer; multiplier = the ban's setting in force now, else 1)
  3  victim ≠ null → pactBreach(state, culprit, victim, order.month)  (slice 3, S3-RULE-5: breaks a pact
     that bound in the order's month, once per card; −20 pactBroken on top)
  4  the case is open for a fine (S4-RULE-8)
sabotagePossible   this slice replaces slice 3's diplomacy.ts sabotagePossible's body with:
                   state.politics !== null && POLITICS.sabotage.on   (and, if Heiko picks D-S4-2 B, the
                   host's sabotage switch). Slice 3's pact expiry earns `kept` only while it is true.
unknown   no ban in force → multiplier 1. Politics off never reaches here (no orders). A rumour has no
          victim: no pactBreach.
examples  a power cut caught, no ban, no pact: reputation 50 → 40 · under ban ×2 → 30 · caught against a pact
          partner, no ban: −10 caught, then −20 pactBroken → 20 · a rumour caught under ×3: −30, no pact check
```

```
S4-RULE-6 · The Sheriff's guards are valid                           shape: decision table

inputs    actor (the Sheriff | other) · votes open (election or law ballot: yes | no) · tiles (a list of
          tile indices) · each tile's owner (a player | nobody) · count vs max
max       POLITICS.sheriff.guards (2) + floor(security / 100) × POLITICS.sheriff.guardsPerHundred;
          security unknown until slice 5 = 0
first match wins
  #   when                                           then
  1   politics off or sabotage off                   refuse "This game plays without sabotage"
  2   not planning, or a vote is open                refuse "Guards are posted once the votes are over"
  3   actor ≠ the Sheriff                            refuse "Only the Sheriff posts guards"
  4   a tile owned by nobody                         refuse "Guards watch players' plots"
  5   more than max distinct plots                   refuse "You have N guards"
  6   otherwise                                      politics.guards = the list (replaces the earlier one)
effect    for this month's production only; cleared when the next planning opens
examples  2 plots → set · 3 plots → row 5 · the Sheriff's own plot → allowed (design 05: any owner's)
```

```
S4-RULE-7 · An investigation                                         shape: decision table

inputs    actor · votes open · investigations this month (orders with investigated = this month: 0..n) vs
          POLITICS.sheriff.investigations (1) · the order: public (yes | no), outcome, culpritPublic,
          investigated (a month | null)
first match wins
  #   when                                           then
  1   politics off, sabotage off, not planning,      refuse as S4-RULE-6 rows 1-3, "investigates"
      vote open, or actor ≠ the Sheriff
  2   no investigation left this month               refuse "One investigation a month"
  3   order unknown, or not public                   refuse "No such incident"
  4   culpritPublic already                          refuse "That one is solved"
  5   investigated ≠ null                            refuse "The trail went cold on that one"
  6   otherwise (outcome 'done', culprit unknown)    investigated = month; a draw from createRng over
                                                     (seed, the order's number n of 'sab-<n>', salt):
                                                     < POLITICS.sheriff.investigateOdds → attribution
                                                     (S4-RULE-5); else cold
public    the result, solved (with the name) or cold, is public at once (news, the incidents list, a notice)
odds      D-S4-1: 0.5 recommended; design 05 says the culprit is always revealed (1.0)
examples  month 4: Brix investigates "month 3, Kai's Food plot, culprit unknown" → drawn 0.22 → solved,
          Lena named, her reputation −10 (and −20 if she held a pact with Kai in month 3) · a second one in
          month 4 → row 2
```

```
S4-RULE-8 · Fines                                                    shape: decision table + formula

inputs    actor · the case (an order): culpritPublic (yes | no), fine (null | set), by = actor (yes | no) ·
          base ∈ POLITICS.sheriff.fine.steps (50, 100, …, 300) · multiplier (the ban in force at the levy,
          else 1) · culprit's money
first match wins (the Sheriff's fine, in planning once the votes are over)
  #   when                                           then
  1   not the Sheriff, not planning, vote open,      refuse as S4-RULE-6 rows 1-3, "fines"
      politics or sabotage off
  2   case not revealed                              refuse "Only a revealed culprit is fined"
  3   case already fined                             refuse "Already fined"
  4   culprit = the Sheriff                          refuse "You can't fine yourself" (the standard fine
                                                     applies when planning ends)
  5   base not a step                                refuse "A fine is 50 to 300 cr, in steps of 50"
  6   otherwise                                      levy base × multiplier, by 'sheriff'
standard  closeCases at planning's end: every order with culpritPublic and no fine → levy POLITICS.sheriff.fine.standard (150) × multiplier, by 'standard'. At the last
          month's upkeep (isGameOver), the same for every open case.
levy      due = base × multiplier; paid = min(culprit's money, due) → fundIn(state, 'fine', paid);
          toVictim = victim ? fundOut(state, 'restitution', round(paid × POLITICS.sheriff.victimShare)) to
          the victim : 0. Paid is not added to treasury.paid. The unpaid part is waived, not a debt.
examples  base 150, no ban, Lena has 500 → Lena −150, fund +150 −75, Brix +75 · base 150 under ×2, Lena
          has 200 → pays 200, Brix +100 · a rumour (no victim) → the whole fine stays in the fund
```

```
S4-RULE-9 · The crew's cost                                          shape: formula

at upkeep, after collectLawTaxes (settleSabotage), each player in seat order:
  due = Σ cost of the player's orders with month = this month and outcome ≠ 'pending' (void ones were
  removed); paid = min(money, due); money −= paid. The money goes to nobody (a sink).
unknown   no such order → 0. It runs once a month, so an order is never charged twice.
examples  one order, cost 120, money 500 → 380 · money 90 → 0, 30 waived
```

```
S4-RULE-10 · The sabotage ban                                        shape: decision table + formula

law       sabotageBan, settings POLITICS.laws.sabotageBan.settings = [2, 3], through slice 2a's council
          (RULE-40..42 unchanged; it takes one of the three places)
effect    the setting multiplies the reputation move at the attribution (S4-RULE-5) and the fine at its
          levy (S4-RULE-8), whichever ban is in force at that moment.
preview   lawImpact(sabotageBan at s)[player].cost = round(attributed(player) / monthsPlayed ×
          POLITICS.sheriff.fine.standard × (s − 1)), attributed = the player's orders with culpritPublic,
          from public facts only; 0 for a
          player never caught. A repeal shows the same as a saving.
words     "Sabotage ban ×2: a caught saboteur pays twice the fine and loses twice the reputation" ·
          For you: "Nothing, unless you are caught" or "About N cr a month on your record"
examples  Lena caught twice in 4 months, ban ×2 → her preview 75 cr a month; Brix never caught → 0
```

```
S4-RULE-11 · The Sheriff's office (existing rules, restated with the Sheriff back)

offices   POLITICS.offices = ['governor', 'sheriff']: RULE-61's ceremony shows Governor then Sheriff;
          RULE-2 (one office per player), RULE-3 rows 1-2 (appointments: Governor first from players not
          running for Sheriff; Sheriff never the new Governor), RULE-7 (pay 50 then 30 from the fund, as far
          as it reaches; a term counts toward the office score), RULE-10 row 1 (no Sheriff promise; the
          words drop "yet"). No rule changes; the switch changes what they cover.
pin       slice 1's and the untimed election's tests, run with both offices (AM-19: written generic)
```

```
S4-RULE-12 · Who sees what, and every leak point                     shape: decision table

  item                                       orderer   Sheriff   other phones   TV / board   observe()
  a pending order, its target, its cost      yes       no        no             no           own only
  politics.guards                            no*       yes       no             no           Sheriff only
  an order that worked (done), or caught     yes       yes       yes            yes          yes, by null
                                                                                             unless public
  its culprit, not public                    yes       no        no             no           own only
  its culprit, culpritPublic                 yes       yes       yes            yes          yes
  a failed, unseen order                     yes       no        no             no           own only
  the order terms (cost, works %, caught %)  yes       yes       yes            yes          yes
  investigations left, guards' max           yes       yes       yes            yes          yes
  an investigation's result                  yes       yes       yes            yes          yes
  a fine (due, paid, to the victim, by whom) yes       yes       yes            yes          yes
  * unless the orderer is the Sheriff.
the server   every view and notice goes through partyTo(viewerId, secret): an order's party is its `by`,
             the guards' party is the sitting Sheriff.
leak points (the frozen rule's list)
  news       lines only for public facts: a worked cut or rumour ("someone"), a catch (the name), an
             investigation's result, a fine. Never a pending order, a guard, a failed unseen order, a crew cost.
  notices    record.ts NoticeEntry gains (WS3 named edit):
             { kind: 'sabotage'; order: string; target: SabotageTarget['kind']; victim: PlayerId | null;
               outcome: 'done' | 'failed' | 'caught' | 'void'; culprit: PlayerId | null; parties?: [PlayerId] }
             (public, culprit null unless culpritPublic, for a done or caught order; private with
             parties [by] for the orderer's own failed or void order and its culprit),
             { kind: 'investigation'; order: string; solved: boolean; culprit: PlayerId | null } (public),
             { kind: 'fine'; order: string; culprit: PlayerId; due: number; paid: number; toVictim: number }
             (public). No notice for an order placed or a guard posted. Slice 3's reputation notice carries
             the 'caught' move (public).
  WS2's brain  reads notices only and MUST skip one whose `parties` excludes its seat (slice 3's rule).
  MonthReport  report.events carry MonthEvent.sabotage with the culprit only if attributed by then; a later
             investigation does not rewrite an old report (screens read culpritPublic from the view).
             report.ledger shows 'fine' and 'restitution'. No order, guard or crew cost in the report.
  the record  the intent entries hold orders and guards (needed for replay). The record is server-side; no
             reader that serves a seat (WS2's memory, the playbook outcome reader) reads intent entries of
             another seat. WS3 to confirm.
accepted  a player's money is public, so a crew cost at upkeep can be inferred by arithmetic against the
          public taxes and pay (as AM-8 accepted for vote totals). A guard is revealed only by the catch it
          makes (design 05).
```

```
S4-RULE-13 · The AI's sabotage and Sheriff acts                       shape: decision table

when      VoteHand's planning-proper step (stage over or none), once a month, after govern; each hand's
          draws from its own stream: createRng over (mind.salt ^ hand salt, month), never state.seed. Every
          input is observe(state, me) (HC-4); `me` = mind.me.
SabotageHand.order (every seat)
  gate    level.sabotage and persona.spite > 0 and sabotagePossible(obs) and no pending order of its own
  cands   powerCut on each working plot of each other player (minus obs.politics.guards: only a Sheriff
          sees any); rumour on each good, up and down. Each candidate is a SabotageOrder literal (id '',
          outcome 'pending', cost the kind's cost) for WS1's values and captureOdds.
  net(c)  spite × sabotageGain(obs, me, c) × (POLITICS.ai.sabotage.grudge if c's victim is the culprit of
          a public order against this seat, else 1) − c.cost − captureOdds(obs, c) × captureCost(obs, me, c)
          captureCost counts the pact break when pactBetween(obs, me, victim) holds, so slice 3's "S4's
          SabotageHand · pact check" row is this term (no separate breakGain call).
  1   best net ≥ POLITICS.ai.sabotage.minEdge, c.cost ≤ money − cashReserve(obs, mind), and
      chance(POLITICS.ai.sabotage.orderChance[persona])                      order the best
  2   otherwise                                                              nothing
SheriffHand (only the sitting Sheriff)
  guard        the guardsMax plots with the highest guardValue(obs, me, plot) (a tie: a draw); Rookie: a
               seeded pick among players' working plots
  investigate  if one is left: the public order with culprit unknown and never investigated with the
               highest investigateValue(obs, me, suspect), if > 0; Rookie: the newest
  fine         every case it may fine, a hand rule (no WS1 value): POLITICS.ai.sheriff.fine.leader against
               the Worth leader, .partner against a pact partner (pactBetween), else the standard fine;
               Rookie: the standard fine
VoteHand (in place)
  run          unchanged: runSheriff per persona once the office is elected (RULE-8 / RULE-63)
  law vote     sabotageBan: yes iff lawWorth(obs, me, proposal) ≥ 0, after the Governor and Rookie rows
               (lawWorth replaces lawCost for every law, WS7's ruling; the ban's duties are in §10)
  propose      unchanged rule; the ban enters the candidates through POLITICS.laws, valued by lawWorth
examples  a Tycoon Saboteur, second on Worth, the leader's Crystite plot worth 400 a month: net 1.5 × 240 −
          120 − 0.3 × 300 = 150 ≥ 0, coin 0.6 → orders · a Trader (spite 0) → never · a Rookie → never
```

```
S4-RULE-14 · Sabotage is not a colony event                           shape: decision table

  item                         player sabotage                       colony social event
  event key                    powerCut, marketRumour                generalStrike, walkout, muleTheft, …
  event kind                   'sabotage'                            'colony', 'plot', 'store', …
  title                        "Sabotage: …"                         its cause: "Walkout", "MULE theft"
  names a person               "someone", or the culprit             never
  in the incidents list        yes                                   no
  investigable                 yes                                   no
  rolls on the event table     never (an order makes it)             always
```

```
S4-RULE-15 · The sim's sabotage row (WS1)                             shape: list

per seed set, politics on: orders a game (by kind, by persona), works %, caught % (guard / chance /
investigation), plots darkened, output lost (units and cr at the month's prices), crew spend a game, fines
levied and paid a game, restitution a game, Sheriff pay a game, the fund's end against
--set POLITICS.sabotage.on=false, Worth rank of the seats that ordered against those that did not, terms by
seat for the Sheriff. Checks: S4-UBER-AC-3's four; every existing balance check; politics off
byte-identical.
```

---

## §3 · Contracts & Data Models `[handoff]`

All ADDED, none breaking (new optional fields, new union members). Every name below lands in the contract
commit (S4-C20) so engine, server, AI and screens build in parallel from day one.

**Engine types** (`packages/engine/src/types.ts`, WS3 named edit). The frozen types, as WS7 froze them:

```ts
export type SabotageTarget =
  | { kind: 'powerCut'; tile: number }                        // the victim is the tile's owner when the order resolves
  | { kind: 'rumour'; good: Good; dir: 'up' | 'down' };
export interface SabotageOrder {
  id: string;               // 'sab-<n>'
  by: string;
  month: number;
  target: SabotageTarget;
  cost: number;
  outcome: 'pending' | 'done' | 'failed' | 'caught';
  culpritPublic: boolean;   // true once caught, or later revealed by an investigation
}
// Politics.sabotage: SabotageOrder[] (the whole game). Politics.guards: number[] (this month's guarded tiles).
```

**Requested additions to the frozen types (all additive and optional, so WS1's stubs still compile; raised with
WS7 on 7 Nov):**

```ts
export interface SabotageOrder {
  // … the frozen fields, plus:
  /** Set when it resolves: the tile's owner then; null for a rumour, and while pending. Needed later: a plot
   *  changes hands, and an investigation months on must still name the victim for pactBreach and the fine. */
  victim?: string | null;
  /** Set when it resolves: whether the effect happened. 'caught' alone cannot say whether the plot went dark. */
  worked?: boolean | null;
  /** The month the Sheriff investigated it; null never. Once-only, and the month's count (S4-RULE-7). */
  investigated?: number | null;
  /** The fine levied on it, once (S4-RULE-8). */
  fine?: SabotageFine | null;
}
export interface SabotageFine { base: number; due: number; paid: number; toVictim: number; by: 'sheriff' | 'standard'; month: number }
// observe() (and only observe) sets `by` to null on another seat's public order whose culprit is not public.
// Requested: `by: string | null` on SabotageOrder for that. Fallback if WS7 keeps `by: string`: observe drops
// those orders, and the hands read the public incidents from the view-shaped list politicsIncidents(obs) instead.
// Politics gains (requested): rumoured: { good: Good; from: number }[] — worked rumours live in this auction and
// the posted price before each shift, so endRumours restores it exactly (a ratio cannot invert the rounding).
// A void order is removed from Politics.sabotage, so no 'void' outcome is needed.

// RepCause (slice 3) gains: | 'caught'          POLITICS.reputation.moves gains: caught: -10
// LawId gains:     | 'sabotageBan'
// EventKey gains:  | 'powerCut' | 'marketRumour'      EventKind gains: | 'sabotage'
// MonthEvent gains: sabotage?: { order: string; culprit: string | null; worked: boolean; guarded: boolean }
// FundSource gains: | 'fine'                           FundLine gains:  | 'restitution'
// NoticeEntry (record.ts) gains the three kinds in S4-RULE-12
```

**Engine exports** (`packages/engine/src/sabotage.ts`, WS7; re-exported from index.ts like politics.ts):
`captureOdds(state, order: SabotageOrder): number` (frozen; 0..1, S4-RULE-3) ·
`orderSabotage(state, playerId, target: SabotageTarget | null): void` · `setGuards(state, playerId, tiles:
number[]): void` · `investigate(state, playerId, orderId: string): SabotageOrder` · `fineCulprit(state,
playerId, orderId: string, base: number): void` · `resolveSabotage(state): void` · `sabotageEvents(state):
MonthEvent[]` · `applyRumours(state): void` · `endRumours(state): void` · `settleSabotage(state): void` ·
`closeCases(state): void` · `newSabotageMonth(state): void` · `orderTerms(state): Record<SabotageTarget['kind'],
{ cost: number; success: number; detect: number }>` · `canOrder(state, playerId): true | 'off' |
'notPlanning'` · `guardsMax(state): number` · `sheriffCanAct(state, playerId): true | 'off' | 'notPlanning' |
'votesOpen' | 'notSheriff'` · `fineable(state, playerId): string[]` · `banMultiplier(state): number` ·
`isPublicOrder(order): boolean` (S4-RULE-3's public).
`events.ts` (WS1) exports `storeEvent(state, key, phase, player?)` (today's private `offMapAtStore`).
`diplomacy.ts` (slice 3, WS7): this slice replaces `sabotagePossible`'s body (S4-RULE-5) and calls
`moveReputation` and `pactBreach`; `pactBetween` feeds the order screen's warning and captureCost.

**Slice 5's input (named here; slice 5 provides it):** `securitySpend(state: GameState): number`, the credits
on the Security line this month (the frozen Budget has a 'security' line that joins after slice 4). S4-RULE-3
and S4-RULE-6 read it; until slice 5 lands, 0.

**Protocol** (`packages/protocol/src/index.ts`, WS3 named edits; `apps/server/src/server.ts::isIntent`):

```ts
// MuleIntent gains (AiAction gains the same four, WS1's actions.ts):
| { type: 'sabotage'; target: SabotageTarget | null }     // planning; null withdraws
| { type: 'guard'; tiles: number[] }                      // the Sheriff, after the votes; the whole list
| { type: 'investigate'; order: string }                  // the Sheriff, after the votes
| { type: 'fine'; order: string; amount: number }         // the Sheriff; amount = base, before the ban

/** A public order as every screen sees it: an incident. */
export interface IncidentView {
  id: string; month: number; kind: SabotageTarget['kind'];
  victim: string | null; at: { x: number; y: number } | null; good: Good; dir?: 'up' | 'down';
  worked: boolean;
  culprit: string | null;                 // only when culpritPublic (or on the orderer's own list)
  how: 'guard' | 'caught' | 'investigation' | null;
  investigated: boolean;
  fine: { due: number; paid: number; toVictim: number; by: 'sheriff' | 'standard' } | null;
}
// PoliticsView gains (public, every screen and the board):
sabotage?: {
  terms: Record<SabotageTarget['kind'], { cost: number; success: number; detect: number }>;
  incidents: IncidentView[];               // public orders only
  sheriff: { guards: number; investigations: number; investigationsLeft: number };
} | null;                                   // null with sabotage off
// MyPoliticsView gains (the owner's phone only):
sabotage?: {
  order: SabotageTarget | null;            // this month's pending order
  canOrder: true | 'off' | 'notPlanning';
  owed: number;                            // crew cost due at this month's upkeep
  mine: (IncidentView & { public: boolean; outcome: SabotageOrder['outcome'] })[];  // culprit = them
} | null;
sheriff?: {                                 // only on the sitting Sheriff's view
  canAct: true | 'off' | 'notPlanning' | 'votesOpen';
  guards: number[];                        // tile indices
  max: number;
  investigationsLeft: number;
  fineable: string[];                      // order ids
  steps: number[];                         // fine bases allowed
  multiplier: number;                      // the ban in force now
} | null;
// EventView gains: sabotage?: { order: string; culprit: string | null; worked: boolean; guarded: boolean }
```

`how` is derived for the view: 'guard' from that month's production event (`guarded`), 'caught' for any other
outcome 'caught', 'investigation' when culpritPublic with outcome 'done'. Visibility is S4-RULE-12; the board's
key allow-list (the server's privacy test) gains `sabotage` with `terms`, `incidents`, `sheriff` and nothing else.

Worked example (Brix's phone, month 4 planning, Brix is Sheriff, after the votes):
`politics.sabotage: { terms: { powerCut: { cost: 120, success: 0.6, detect: 0.3 }, rumour: { cost: 60,
success: 0.8, detect: 0.15 } }, incidents: [{ id: 'sab-1', month: 3, kind: 'powerCut', victim: 'kai', at: { x:
4, y: 2 }, good: 'food', worked: true, culprit: null, how: null, investigated: false, fine: null }], sheriff: {
guards: 2, investigations: 1, investigationsLeft: 1 } }`, `me.politics.sheriff: { canAct: true, guards: [],
max: 2, investigationsLeft: 1, fineable: [], steps: [50, 100, 150, 200, 250, 300], multiplier: 1 }`,
`me.politics.sabotage: { order: null, canOrder: true, owed: 0, mine: [] }`. Lena's phone carries sab-1 in
`mine` with `culprit: 'lena'`; Brix's, Kai's and the TV's carry `culprit: null`.

**Config** (`packages/engine/src/config.ts`, the POLITICS block, WS7; placeholders until WS1 tunes, HC-25):

```ts
sabotage: {
  on: true,                                  // a sim/test switch (--set POLITICS.sabotage.on=false)
  streamSalt: 0x5ab07a6e,                    // literal-ok: the order stream's salt
  orders: {
    powerCut: { cost: 120, success: 0.6, detect: 0.3 },
    rumour:   { cost: 60,  success: 0.8, detect: 0.15, shift: 0.25 },
  },
},
sheriff: {
  guards: 2, guardsPerHundred: 1, securityDetect: 0.1,   // per 100 cr of Security (slice 5)
  investigations: 1, investigateOdds: 0.5,               // D-S4-1
  fine: { steps: [50, 100, 150, 200, 250, 300], standard: 150 },
  victimShare: 0.5,
},
reputation: { …, moves: { …slice 3's, caught: -10 } },  // × the ban's setting
laws: { …, sabotageBan: { settings: [2, 3] } },          // fine and reputation multiplier
ai: { …,
  sabotage: {
    orderChance: { trader: 0, cautious: 0, aggressive: 0.2, saboteur: 0.6 },
    minEdge: 0,                              // credits, after spite, cost and expected capture
    grudge: 2,                               // weight on a victim caught sabotaging this seat
  },
  sheriff: { fine: { leader: 300, partner: 50 } },   // the AI Sheriff's base fine; else the standard
},
```

EVENT_SHOW.weight (WS8's block) gains `powerCut: 'headline', marketRumour: 'headline'`.

---

## §4 · Failure & Ops `[handoff]`

| Question | |
|---|---|
| Dependency unavailable? | None: orders, rolls and the AI hands are in-process and seeded. Slice 3's pactBreach (false) and slice 5's securitySpend (0) are stubbed until their engine PRs land (S4-C20). |
| Retry / poison? | A refused intent throws RuleError and reaches the player as a message; nothing retries. |
| Idempotency | sabotage and guard set a value (the order, the list); investigate and fine are refused the second time (S4-RULE-7 rows 2, 5; S4-RULE-8 row 3). |
| Races | An order arriving after planning ended is refused (row 2). The server runs intents and phase changes on one loop. resolveSabotage runs once, in advancePhase's production branch. |
| What still works if sabotage breaks? | `POLITICS.sabotage.on = false` stops orders and incidents; the rest of politics plays. Politics off plays trunk. |
| How to know it works | The production show's sabotage stories, the news lines, the ledger's 'fine' and 'restitution', and the sim's sabotage row (S4-RULE-15). |

## §5 · Delivery `[handoff]`

Code-only; no existing state to reach: games live in server memory and the sim is fresh per run. Rollback is
a revert, or `POLITICS.sabotage.on = false` (and `POLITICS.offices = ['governor']` to park the Sheriff again).

## §6 · Acceptance Criteria `[handoff]`

| id | Given / When / Then | changes | observed_at | negative case |
|---|---|---|---|---|
| S4-B-AC-1 | Given Brix is Sheriff and guards his Food plot · When Lena's power cut on it resolves · Then it fails, the plot makes its normal output, and every screen's production events carry "Caught!" with Lena's name; her reputation falls by 10 on every screen | S4-C2 S4-C4 S4-C5 S4-C13 S4-C17 | the views every phone and the TV receive in production (server test; e2e step S4-UBER-AC-2) | an unguarded order with seen = no names nobody |
| S4-B-AC-2 | Given an unguarded order whose seeded draws work and are not seen · When production runs · Then the plot makes 0, the TV shows it dark with "someone", and no view but Lena's names her | S4-C2 S4-C9 S4-C13 | the plot's production line and every view's JSON | a failed, unseen order files no event and changes no output |
| S4-B-AC-3 | Given a revealed case · When the Sheriff fines 150 · Then the culprit pays 150, the victim gets 75, the fund keeps 75, the ledger shows fine 150 and restitution 75; a case left unfined pays 150 when the next planning ends | S4-C5 S4-C8 | players' money and the month report's ledger (engine test) | a fine on an unrevealed case is refused |
| S4-B-AC-4 | Given an unsolved public incident · When the Sheriff investigates · Then every screen shows "solved, it was Lena" or "the trail went cold" at once, and the incident cannot be investigated again | S4-C5 S4-C13 | the views after the intent (server test) | a second investigation that month is refused |
| S4-B-AC-5 | Given a worked rumour on Food, up · When the auction opens · Then Food's store lines come from the shifted price; after the auction the posted price is what it was | S4-C3 | store.posted and the auction's lines (engine test) | a failed rumour moves nothing |
| S4-B-AC-6 | Given Lena's order and Brix's guards in planning · When any other screen or the board gets a view · Then neither appears; Lena's money does not move before upkeep | S4-C1 S4-C9 S4-C13 | each view's JSON in planning (server test) | Lena's own view has her order; Brix's has the guards |
| S4-B-AC-7 | Given month 1 · When the election ends · Then a Governor and a Sheriff hold office, the ceremony showed both, and the Sheriff is paid 30 at upkeep | S4-C6 S4-C16 | the views and money (engine + server tests; the politics e2e's month 1) | one player never holds both offices |
| S4-B-AC-8 | Given the ban at 2 in force · When a case is revealed and fined 150 · Then the culprit owes 300 and loses 20 reputation (a fine levied before the ban passed was ×1) | S4-C7 S4-C4 | engine state | — |
| S4-B-AC-9 | Given only Classic AI seats and no API key · When a game is simulated · Then S4-UBER-AC-3 holds | S4-C10 S4-C11 S4-C12 | `pnpm sim` | Rookie and Trader personas never order |
| S4-B-AC-10 | Given two phones and AI seats, Brix the Sheriff and Lena not · When the e2e step of S4-UBER-AC-2 runs · Then Lena's Secret desk shows her order, Brix's Sheriff desk his guard on the map, the TV the "Caught!" story with Lena's name, and after Brix's fine the month end shows it; the ban shows in the law picker and on the TV council panel | S4-C14 S4-C15 S4-C17 S4-C18 S4-C19 | the phone and TV DOM in apps/web/e2e/politics.ts | Brix's phone never shows Lena's order before production |
| S4-T-AC-1 (serves S4-B-AC-6) | S4-RULE-2's eight rows, each verdict and message | S4-C1 | engine test | — |
| S4-T-AC-2 (serves S4-B-AC-1, S4-B-AC-2) | S4-RULE-3's six rows; both draws are made for every non-void order whatever the guard | S4-C2 | engine test, seeded | — |
| S4-T-AC-3 (serves S4-B-AC-2) | the cut's part is the plot line's last (why 'event', event 'powerCut'); the plot's runMonths still counts | S4-C2 | the production line | — |
| S4-T-AC-4 (serves S4-B-AC-1, S4-B-AC-8) | S4-RULE-5's order: moveReputation(culprit, caught × multiplier, 'caught', victim), then pactBreach called once with (culprit, victim, order.month), not for a rumour; an investigation months later still calls pactBreach with the order's month; sabotagePossible is true exactly when politics and POLITICS.sabotage.on | S4-C4 | engine test with a spy hook | — |
| S4-T-AC-5 (serves S4-B-AC-3, S4-B-AC-4) | S4-RULE-6, -7, -8 rows; the standard fine at planning's end and at the last upkeep; a short culprit pays what they have; fines never enter treasury.paid | S4-C5 S4-C8 | engine test | — |
| S4-T-AC-6 (serves S4-B-AC-5) | after endRumours every posted price equals postPrices's; two opposite rumours cancel | S4-C3 | engine test | — |
| S4-T-AC-7 (serves S4-B-AC-6) | observe() for each seat follows S4-RULE-12's observe column | S4-C9 | engine test | — |
| S4-T-AC-8 (serves S4-B-AC-6, S4-B-AC-10) | the TV, the board and each phone's view follow S4-RULE-12; the board's allow-list holds | S4-C13 | server test | — |
| S4-T-AC-9 (serves S4-B-AC-9) | SabotageHand and SheriffHand per S4-RULE-13's rows on seeded games; Rookie never orders | S4-C10 | ai test | — |
| S4-T-AC-10 (serves S4-B-AC-9) | the new hands' draws leave slice 1's election and slice 2a's council fixtures unchanged; no hand reads state.seed | S4-C10 | ai test (as INV-41) | — |
| S4-T-AC-11 (serves all) | politics off: byte-identical sim; POLITICS.sabotage.on false: no order accepted, no incident, production and upkeep totals unchanged | S4-C1..C8 | sim report diff; engine test | — |
| S4-T-AC-12 (serves S4-B-AC-8) | the ban's preview per S4-RULE-10 from revealed cases only | S4-C7 | engine test | an unrevealed incident adds nothing |
| S4-T-AC-13 (serves S4-B-AC-9) | the sim's sabotage row prints S4-RULE-15 and checks S4-UBER-AC-3 | S4-C12 | `pnpm sim` | — |
| S4-T-AC-14 (serves S4-B-AC-1, S4-B-AC-2) | S4-RULE-14: a sabotage event's kind is 'sabotage' and its title starts "Sabotage"; no colony event has either; only sabotage incidents are in the incidents list | S4-C2 S4-C13 | engine + server test | a walkout is not investigable |
| S4-T-AC-15 (serves S4-B-AC-7) | with both offices: RULE-3's appointment rows for the Sheriff (never the new Governor), pay 50 then 30 as far as the fund reaches, the office score counts Sheriff terms, nextTax's low-fund line counts 80 | S4-C6 | engine and ai tests | a Sheriff candidate's promise is refused "Sheriff candidates make no promise" |
| S4-T-AC-16 (serves all) | the contract commit typechecks and every existing test passes with the stubs | S4-C20 | `pnpm typecheck && pnpm test` on PR-0 | — |

Invariants, asserted by every relevant test: no player's money and never the fund below 0; nothing writes
`treasury.money` but colony.ts; nothing writes `politics.sabotage` but sabotage.ts; one player never holds both
offices; no order and no guard in any view but its owner's or the Sheriff's.

## §7 · Risks & Spikes `[review-only]`

- **AI seats never sabotage, or sabotage every month.** Mitigation: S4-UBER-AC-3's checks in the sim row
  (S4-T-AC-13); WS1 tunes POLITICS.ai.sabotage (orderChance, minEdge) in PR-3.
- **Sabotage events inflate WS1's events-per-month budget row.** Mitigation: the row counts only events the
  event table rolls; kind 'sabotage' is excluded (S4-C12).
- **The crew cost can be inferred from public money at upkeep.** Accepted, recorded in S4-RULE-12, as AM-8
  accepted for vote totals.
- **Slice 3's engine PR or slice 5's Security spend lands after this slice's.** Mitigation: stubs in PR-0
  (pactBreach false, securitySpend 0); slice 3's names are adopted as written.
- **A caught saboteur under a pact loses 30, not 20.** Slice 3's moment table (§0, "Lena is caught sabotaging
  Brix during a pact ... her chip −20") predates the 'caught' move; this spec stacks −10 caught and −20
  pactBroken. WS7 settles the merged wording.
- **Restoring the Sheriff moves WS1's politics rows** (pay 30 a month from the fund; the AI Governor's
  low-fund bump now counts 80). Mitigation: rows re-measured in PR-3, to Heiko with the sabotage rows (D3).
- **Election months get longer** (two offices in the ceremony). Mitigation: the ceremony's beats are config
  (POLITICS.ceremony); the ballot is skipped for an uncontested office.
- **Landmine (FM-WS3-4, cloneForSim shared state):** sabotage.ts writes through its own copy-on-write edit();
  cloneForSim already deep-copies politics.
- **Landmine (slice 2a AM-4, an AI hand reading state.seed):** the new hands hash the seat's salt (S4-T-AC-10).
No spike needed.

## §8 · Amendments `[review-only]`

None yet: this spec has not been agreed.

## §9 · Ownership Boundaries `[handoff]`

### Ownership: sabotage state
- Sole owner:      packages/engine/src/sabotage.ts
- Read contract:   GameState.politics.sabotage, read by observe(), politics-view.ts and the AI hands (via observe)
- Write contract:  only sabotage.ts's exports (§3), each through its own copy-on-write edit(); politics.ts
                   creates the empty record in newPolitics and never writes it after
- Enforcement:     engine tests; PR checklist grep: no `politics.sabotage` or `.sabotage.` write outside sabotage.ts

### Ownership: the store's posted price (a second writer)
- Owner today:     packages/engine/src/economy.ts::postPrices (WS1), once a month at auction open;
                   packages/engine/src/game.ts::createGame at the start
- Change:          the new sabotage.ts's applyRumours shifts it after postPrices; endRumours restores it at the
                   auction's end. Nothing else.
- Enforcement:     S4-T-AC-6 (restored exactly); WS1 reviews the two game.ts lines

### Ownership: the colony fund (unchanged)
colony.ts stays the only writer of treasury.money: fines and restitution call fundIn and fundOut (S4-HC-3).

---

## §10 · Hand decisions and the values they need `[handoff]`

Every decision a code hand makes, so WS1 can start from this list. Hands read `observe()` only (S4-HC-9).

| Hand · method | When | Inputs | Output | WS1 value it calls |
|---|---|---|---|---|
| SabotageHand.order | planning proper, once a month, after govern | observe; persona.spite, level.sabotage; orderTerms; captureOdds; public orders; pactBetween | an order or none (S4-RULE-13) | sabotageGain, captureCost; cashReserve (exists) |
| SheriffHand.guard | same, the sitting Sheriff | observe (politics.guards visible to it); guardsMax | the guard list | guardValue |
| SheriffHand.investigate | same | public orders with the culprit unknown; investigateOdds | one order or none | investigateValue |
| SheriffHand.fine | same | fineable orders; steps; pactBetween; the Worth leader | a base per case | none: a hand rule on POLITICS.ai.sheriff.fine |
| VoteHand.decide (run) | unchanged | runSheriff[persona] | run for Sheriff or not | none (config chance) |
| VoteHand.lawVote (ban) | the law ballot | the proposal | yes / no | lawWorth |
| VoteHand.proposeLaw | unchanged | the law candidates | the ban among them | lawWorth |

WS1's functions, with the names WS7 confirmed (7 Nov), in `packages/ai/src/value.ts`, pure, credits (none a
probability: the hands apply `captureOdds` and the public success odds). `me` is the seat's id; `obs` is
`observe(state, me)`. A function that needs persona weights reads them as WS1's existing values do.

```ts
/** Credits `me` expects to gain on the table if the order works, before its cost, its odds and capture: for a
 *  power cut, the victim's lost output this month at the prices `me` expects, weighted by the victim's Worth
 *  lead over `me` (more against the leader, little against a trailing player); for a rumour, `me`'s own expected
 *  trades in that good at the shifted opening price minus the same for the leader. Never negative for a cut;
 *  a rumour may be. Slice 3's pactWorth reads it as "slice 4's expected-damage value". */
export function sabotageGain(obs: GameState, me: string, order: SabotageOrder): number;

/** Credits an attribution would cost `me`, not weighted by the odds: the standard fine × the ban's multiplier in
 *  force; the 'caught' move (POLITICS.reputation.moves.caught × multiplier) through slice 3's reputationCost;
 *  and, when pactBetween(obs, me, victim, now) holds, the pactBroken move through reputationCost too. */
export function captureCost(obs: GameState, me: string, order: SabotageOrder): number;

/** Credits a guard on tile `plot` is expected to save this month: the plot's output value × the chance it is
 *  targeted, from public facts only (its owner's Worth rank, the public orders against that owner, how much the
 *  plot makes). The Sheriff's own plots count like anyone's. */
export function guardValue(obs: GameState, me: string, plot: number): number;

/** Credits solving `suspect` (a public order whose culprit `me` cannot see: by null) is worth to `me` as Sheriff,
 *  already × POLITICS.sheriff.investigateOdds: the victim's half of the standard fine if `me` is the victim, the
 *  'caught' (and possible pactBroken) loss to a rival culprit valued as votes, a deterrence term. ≤ 0: leave it.
 *  (WS1's parameter name; it is an order, not a player.) */
export function investigateValue(obs: GameState, me: string, suspect: SabotageOrder): number;

/** lawWorth(obs, me, proposal) (WS1's, replacing vote.ts's lawCost) MUST value sabotageBan at setting s as:
 *  the sabotage `me` expects against itself (the public record) × the deterrence of the higher capture cost,
 *  minus the extra fines and reputation `me` expects for its own orders (its own past orders, which observe
 *  keeps whole, × captureOdds × standard fine and the caught move × (s − 1)). ≥ 0 votes yes. A repeal is the
 *  negative. */
```

Smart seats use the same code hands in RC; WS2's brain may take these decisions later (non-goal).

## §11 · The engine / AI / screen split, with named edits per owner `[handoff]`

Owners from `.handover/SEAMS.md`'s path table and ruling log (checked 2026-11-07: WS7 row lists
`packages/engine/src/{politics,diplomacy,reputation,sabotage}.ts`, `politics-view.ts`, the POLITICS block,
`hands/{vote,deal}.ts`; events.ts is WS1's (2026-10-21); colony.ts is WS7's (2026-10-28); `hub/politics/**`,
`TvElection.tsx` and `e2e/politics.ts` are WS7's (2026-10-22); `hub/Hub.tsx` and today.tsx's frame WS6's;
`apps/web/src/events/**`, `packages/ui/src/events/**` and EVENT_SHOW are WS8's (2026-10-28); TvProduction.tsx
and phone Production.tsx take WS6's named edits per the same ruling).

| File | Owner | Named edit | Change |
|---|---|---|---|
| packages/engine/src/sabotage.ts (new) | WS7 | — | orders, resolution, events, rumours, reveal, guards, investigation, fines, settle (S4-C1..C5, C8) |
| packages/engine/src/politics.ts | WS7 | — | newPolitics's empty sabotage and guards (and rumoured); openPlanning → newSabotageMonth; closeVotes → closeCases; LAW_NAME and enactImpact for the ban; "yet" dropped (S4-C6, C7) |
| packages/engine/src/diplomacy.ts (slice 3's, new) | WS7 | — | sabotagePossible's body (S4-RULE-5) |
| packages/engine/src/record.ts | WS3 | yes | NoticeEntry's sabotage, investigation and fine kinds (S4-RULE-12) |
| packages/engine/src/config.ts, POLITICS block | WS7 | — | offices + sheriff, sabotage, sheriff, reputation.moves.caught, laws.sabotageBan, ai.sabotage, ai.sheriff |
| packages/engine/src/config.ts, EVENT_SHOW | WS8 | yes | two weight rows |
| packages/engine/src/types.ts | WS3 | yes | §3's types (S4-C20) |
| packages/engine/src/game.ts | WS3 | yes | advancePhase: resolveSabotage (production), applyRumours (auction), endRumours and settleSabotage (upkeep): four lines |
| packages/engine/src/production.ts | WS1 | yes | runProduction: `events.push(...sabotageEvents(state))` after the strike, one line |
| packages/engine/src/events.ts | WS1 | yes | SHAPE rows, eventOutput's powerCut, export storeEvent |
| packages/engine/src/observe.ts | WS1 | yes | S4-RULE-12's hiding |
| packages/engine/src/index.ts | WS3 | yes | `export * from './sabotage.js'` |
| packages/protocol/src/index.ts | WS3 | yes | four intents, IncidentView, view fields, EventView.sabotage |
| apps/server/src/server.ts | WS3 | yes | isIntent for the four |
| apps/server/src/mule-game.ts | WS3 | yes | handle's four cases; monthEventView copies `sabotage`; news hooks at production and on the Sheriff's intents |
| apps/server/src/politics-view.ts | WS7 | — | sabotage views and news (S4-C13) |
| packages/ai/src/hands/sabotage.ts, sheriff.ts (new) | WS7 | SEAMS row to add | S4-C10 |
| packages/ai/src/hands/vote.ts | WS7 | — | calls the two hands; the ban vote row |
| packages/ai/src/value.ts | WS1 | — | sabotageGain, captureCost, guardValue, investigateValue; the ban in lawWorth (S4-C11) |
| packages/ai/src/actions.ts, play.ts, sim.ts | WS1 | — | four actions, applyAction, the sabotage row, the event budget excludes 'sabotage' (S4-C12) |
| design/mocks/ws6-ux/** | WS6 | — | P6-P11 mocks for Heiko |
| apps/web/src/phone/hub/politics/{Secret,Sheriff}.tsx (new), ElectionDay.tsx, words.ts, LawPicker.tsx | WS7 | — | S4-C14..C16, C18 |
| apps/web/src/phone/hub/today.tsx | WS6 | yes | the Secret and Sheriff desks, agenda items, Guard and Target tools |
| apps/web/src/table/TvElection.tsx, TvCouncil.tsx | WS7 | — | two offices; the ban's words |
| packages/ui/src/events/**, apps/web/src/events/** | WS8 | — | kind 'sabotage' stories, "Caught!" |
| apps/web/src/table/TvProduction.tsx, apps/web/src/phone/Production.tsx | WS6 | yes | the dark plot (HoloMap's 'sabotage' flag) |
| packages/ui/src/components/HoloMap.tsx | WS4 | yes, if the mock needs a guard mark | the Sheriff's guard mark |
| apps/web/src/components/MonthEnd.tsx or Colony.tsx | WS4 | yes | fines and restitution lines, per the mock |
| apps/web/e2e/politics.ts | WS7 | — | S4-UBER-AC-2's step |

## §12 · Sizing and parallel build `[review-only]`

| PR | Owner | Days | Starts after | Contents |
|---|---|---|---|---|
| PR-0 contract | WS3 + WS7 | 0.5 | — | S4-C20: types (frozen + §3's requested fields), protocol, isIntent, NoticeEntry, config, sabotage.ts stubs |
| PR-1 engine | WS7 (+ WS3/WS1 named edits) | 2 | PR-0 | S4-C1..C8 + game.ts, production.ts, events.ts lines |
| PR-2 observe | WS1 | 0.5 | PR-0 | S4-C9 |
| PR-3 values + sim | WS1 | 2 | PR-0 (rows need PR-1, PR-4) | S4-C11, S4-C12 |
| PR-4 AI hands | WS7 | 1.5 | PR-0 (values stubbed) | S4-C10 |
| PR-5 server | WS7 (+ WS3 named edits) | 1 | PR-0 | S4-C13 |
| mocks | WS6 (+ WS8 stories) | 1.5 | §3 frozen (day 0) | P6-P11; Heiko approves |
| PR-6 desks | WS7 (+ WS6 today.tsx) | 2 | mock approval, PR-5 | S4-C14..C16, C18 |
| PR-7 show | WS8 (+ WS6, WS4 named edits) | 1.5 | mock approval, PR-0 | S4-C17 |
| PR-8 e2e + rows to Heiko | WS7, WS1 | 0.5 | all | S4-C19; sim rows; Heiko's money OK (D3) |

After PR-0 (12 Nov), PR-1, PR-2, PR-4, PR-5 and the mocks run in parallel; PR-3's rows need PR-1 and PR-4;
the screens follow Heiko's mock approval. About 4 working days of wall clock: 12-16 Nov fits if the mock is
approved by 13 Nov.

## §13 · Decisions for Heiko `[review-only]`

**D-S4-1 · Does an investigation always find the culprit?**
At the table: Brix, the Sheriff, taps Investigate on "Month 3: Kai's power line cut, culprit unknown".
- **A · Always** (design 05: "The culprit is revealed to everyone"). *For:* the Sheriff's job is satisfying;
  simple. *Against:* with one investigation a month and few incidents, nearly every unseen sabotage is solved
  within a month or two, so "undetected sabotage leaves everyone suspecting each other" (00-concept) rarely
  lasts, and sabotage rarely pays.
- **B · Half the time** (recommended; `POLITICS.sheriff.investigateOdds` 0.5). The TV shows "Solved: it was
  Lena" or "The trail went cold"; a cold case can't be reopened. *For:* the doubt survives, and the Sheriff
  still catches about half of what the guards miss. *Against:* a Sheriff may feel unlucky.
- **C · Always, but only the latest month's incidents.** *For:* certainty with a deadline. *Against:* old
  grudges can never be settled.
Recommendation: B. The number is config, so WS1's rows can move it.

**D-S4-2 · Does sabotage get its own switch in the lobby?**
At the table: the host's lobby shows one Politics switch today.
- **A · No: sabotage comes with politics** (recommended for RC). *For:* no lobby work; the sim keeps a
  `POLITICS.sabotage.on` switch for measurement. *Against:* a family table that wants elections without
  sabotage can't have them yet; 00-concept says the host can switch sabotage off.
- **B · A Sabotage switch now.** *For:* honours 00-concept's decision. *Against:* lobby, createGame and server
  options (WS4, WS3), and the Sheriff must then leave the ballot when sabotage is off (an office with no job
  again, AM-19), about one more PR.
Recommendation: A for RC, B after it.
