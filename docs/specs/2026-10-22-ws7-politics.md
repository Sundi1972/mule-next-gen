# WS7 · Politics & Diplomacy: pacts, sabotage, elections, Governor, Sheriff, laws and taxes

**Lane:** WS7 Politics & Diplomacy · **Class:** Programme (proposed: new engine modules, a new AI hand, protocol and server named edits, more than 3 PRs) · **Status:** §0 APPROVED (Heiko, cards relayed by the PM, 2026-10-22: goals as written, D1 votes first, D2 six simple laws, D3 host option on). Design in progress. **Serves Mission Goal G-4.**
**Branch:** `ws7-politics` (base `feat/strategist` 8683d21) · **Design source:** `docs/design/05-colony-politics.md`, `docs/design/00-concept.md` (Diplomacy, Sabotage, Markets: no direct trading), `docs/design/06-ai-players.md` · **Screens:** WS6's planning-hub mock is the binding scaffold (desks not mocked yet).

---

## §0 · Business Goals & Value `[handoff: goal lines and proofs]` `[review-only: who / today / value / cost]`

All three goals trace to Mission G-4: "The table plays politics: players make and break pacts, whisper, sabotage, elect a Governor and a Sheriff, and vote laws and taxes, and it changes how the game goes." Heiko, 2026-10-22: planning is where you "chat with people ..., plan sabotage, plan elections, do politics, chat privately to people; if I am the governor I can manage the colony, set taxes; the sheriff can do his stuff."

**P-1 · The table governs itself: it elects a Governor and a Sheriff, the Governor sets the sales tax, and the colony votes laws that change the rules.**
- *Who benefits:* every player at the kitchen table, and most of all the players who are behind: the council is how the table reins in a runaway leader (05-colony-politics, "Laws").
- *Today:* none of it exists. Nobody holds an office; the sales tax is a constant 5% for the whole game (`packages/engine/src/config.ts::TAX`, set once in `packages/engine/src/game.ts::createGame`); the colony fund only fills and is never spent; there are no laws and no votes. The only things to do in the 45-second planning phase are a geo drone and listing a lot (`packages/protocol/src/index.ts::MuleIntent`). Heiko on the 22 Oct playtest: planning has "no sense of what to do or why". (verified_by: read)
- *Value:* planning gets its own game: four elections, a tax that moves, a vote every month whose result everyone sees revealed at once. A leader can be voted down instead of only outbid. This is the slow, social half of the game the design promises next to the real-time half.
- **UBER-AC-1:** `pnpm sim` on both seed sets (1-40 and 101-140) with politics on prints a politics row: in every game an election runs in months 1, 4, 7 and 10 and fills both offices, a Governor sets the sales tax in every month, and at least one law passes in at least half the games. Every balance check that passes with politics off still passes with it on.
- **UBER-AC-2:** an e2e with two phones and AI seats: in month 1 both humans run for Governor and vote; the ballots reveal on every screen at the same moment after a countdown; the winner sets the sales tax, and the next sale on the auction is taxed at the new rate.

**P-2 · Players make pacts and keep or break them, and everyone can see who is trustworthy.**
- *Who benefits:* players who want to cooperate or scheme, and a solo player at a table of AI seats, who need AI players that remember how they were treated (00-concept, "Solo play").
- *Today:* whispers and five reactions already work (`packages/tabletop/src/protocol.ts::ChatMessage` has a `to`, `packages/protocol/src/index.ts::EMOTES`, the phone's `apps/web/src/phone/parts.tsx::Chat` picks a recipient). But talk binds nothing: there are no deal cards, and `reputation` is set to 50 at the start and never changes (`packages/engine/src/game.ts::createGame`). (verified_by: read)
- *Value:* an agreement becomes a card one tap accepts, with a cost for breaking it, so a promise across the table means something; a reputation number on every screen shows who keeps their word, and it feeds vote weight.
- **UBER-AC-3:** an e2e with two phones: Lena whispers Brix, attaches a non-aggression pact card, and Brix accepts it with one tap; both phones list the pact. When Lena is later caught sabotaging Brix, her reputation falls by the pact-break amount on every screen. An AI seat offered the same card answers it within the planning phase with no API key set.

**P-3 · Players sabotage each other in secret, and the Sheriff can guard, catch and fine them.**
- *Who benefits:* players who like risk and suspicion, and whoever is elected Sheriff, who gets a job of their own.
- *Today:* players have no sabotage order, no guards and no fines. The AI already carries the intent without the move: a `saboteur` persona with a `spite` weight and a per-level `sabotage` switch, off for Rookie (`packages/engine/src/config.ts::AI_PERSONAS`, `::AI_LEVELS`), used today only to bid up the leader in the auction (`packages/ai/src/strategist.ts`). (verified_by: read; `grep -rni -e sabot -e sheriff -e governor packages/*/src apps/*/src`)
- *Value:* the "Caught!" moment and the doubt when nobody is caught (00-concept, "Moments built for the table"), and a reason to elect a Sheriff you trust.
- **UBER-AC-4:** in a seeded engine test, a sabotage order against a plot the Sheriff guards fails, and the saboteur's name is revealed in that month's report; an unguarded order succeeds or fails on its seeded odds, and its target plot makes nothing that month. In the sim, AI seats order sabotage in some months and the balance checks still pass.

**Non-goals** (each needs its own spec, or waits for a system another lane builds):
- **Direct trading of anything of value**, including through deal cards (00-concept, 21 Oct). Deal cards carry pacts, votes and promises only.
- **Whispers and reactions as a feature:** they exist; WS7 only attaches deal cards to them. AI whispers and AI chat lines are WS2's (its chat seam).
- **Colony projects** (reservoir, levee, observatory ...) and the **Projects** budget line: they protect against events (pirates, plague, meteors, the long winter) that do not exist yet; WS1 has built ten production events only.
- **Laws that need another lane's system first:** price cap and windfall tax (the auction, WS3), strategic reserve and anti-hoarding (the store, WS1), anti-monopoly (forced sale through the land auction, WS3), eminent domain (super tiles, not built), green zone (placement rules in development). v1 has the laws that only move money or block an action (see the decision D2 below).
- **Sabotage that needs a missing system:** tipping off the pirates (no pirates), stealing a MULE (players hold no spare MULEs).
- **Joint ventures** (shared adjacency): a production change, WS1's.
- **Reputation moving store prices:** a balance change for WS1, after the sim shows reputation moves at all.
- **Smart (language-model) seats' votes and deals:** they go through WS2's brain port once it takes these decisions; WS7's AI votes and deals are code (strategist and persona), playable with no key.
- **Screens before WS6 mocks them:** every politics screen is built into WS6's planning hub from an approved mock.

**Rough cost:** the chosen approach is about 9 PRs in five slices (engine + AI hand + server/protocol named edits + a screen per slice, plus sim rows). The thin baseline (elections and the Governor's sales tax only) is about 3 PRs (§0.1).

### Decisions with this §0 (ruled by Heiko, 2026-10-22: all three as recommended)

- **D1 · Slice order.** Recommended: (1) elections, Governor and sales tax, vote weight and the Land Baron; (2) the council and its laws; (3) deal cards and reputation; (4) sabotage and the Sheriff; (5) the budget lines, the overrule vote and the inquiry. Votes come first because deal cards are mostly about votes, and the election reveal is the most visible table moment. The alternative is the spawn doc's order (diplomacy first), which builds deal cards before there is a vote to promise. *(AM-13, 2026-10-28: slice 5 also has the Governor spend the fund on community projects; prestige objects come later; the colony's success score is WS6's.)*
- **D2 · Laws in v1.** Recommended: the six laws that only move money or block an action: export tax, land tax, pollution tax, emission cap, sabotage ban, and (from slice 4) the Sheriff's fines under it. The other six wait for the systems named in the non-goals. Alternative: all twelve, which puts named edits into WS1's store and WS3's auction now and roughly doubles slice 2.
- **D3 · Balance.** Taxes, fines, pay and Welfare move money, so each slice that touches money ships with sim rows on both seed sets and needs Heiko's OK, with WS1 measuring. Recommended: politics is a host option, on by default (as sabotage is), so the sim and Beginner mode can run with it off.

*Count note (2026-10-22, WS7; AM-16: designed as option A, D2 still Heiko's on the G-5 card):* D2's "six" counts five laws (export tax, land tax, pollution tax, emission cap, sabotage ban) plus the Sheriff's fines under the ban as the sixth item. Raised with the PM; windfall tax would be the natural sixth law if Heiko wants six laws.

### §0.1 · Decision Record `[review-only]`

The spec designs one slice at a time: slice 1 below in full; each later slice is designed and added (§1 changes, §2 rules, §6 ACs) before it is built, as an amendment in §8.

- **Chosen for slice 1 (approach 2), ~4 WS7 PRs + 1 WS1 PR.** The election is a clocked stage machine inside the planning phase (nominate → ballot → reveal → over) in a new `packages/engine/src/politics.ts`, stepped like the land auction (`stepLandAuction` in `packages/engine/src/lots.ts`): the server on a tick, the sim in a loop. Normal planning, with its own timer, starts when the election is over. The ballot tally is a function the council reuses in slice 2.
- **Thin baseline (approach 1), ~3 PRs.** No stages: candidacy and ballots are open for the whole planning phase, counted when planning ends, and the result goes into the news. **It loses because** a candidate who declares late gets the votes of nobody who already voted, and there is no moment when the result appears on every screen at once: UBER-AC-2 requires "the ballots reveal on every screen at the same moment after a countdown", which a count at the phase change into the land grant cannot show (the screen has already moved on to the grant).
- **Large (approach 3), ~6 PRs for slice 1.** A general "council session" engine for every vote type (elections, laws, overrule, no-confidence, snap elections) built now. Rejected: slices 2 and 5 are not designed yet, and the shared part they need (a weighted tally with a reveal) is one function slice 1 already exports.

### §0.2 · Constraints `[handoff]`

```
HC-1  packages/engine stays pure: no I/O, no Date.now(), no Math.random(). Seeded RNG only, so a
      game replays from seed + actions, ballots and sabotage rolls included.
      source: CLAUDE.md                                                breach: fatal
HC-2  Every politics number lives in config.ts's POLITICS block, never inline.
      source: CLAUDE.md, SEAMS.md                                       breach: fatal
HC-3  Nothing of value changes hands outside an auction. A deal card never moves money, goods,
      plots or MULEs between players.
      source: 00-concept "No direct trading" (21 Oct)                   breach: fatal
HC-4  A seat sees only what a human in that seat would see: secret ballots, sabotage orders,
      guards and deal cards between two others stay out of every other seat's view and the TV.
      source: 06-ai-players "Fair play", 00-concept "private hand"      breach: fatal
HC-5  Rules errors throw RuleError; the server turns them into messages for the player.
      source: CLAUDE.md                                                 breach: fatal
HC-6  Edit only WS7's owned paths plus named edits recorded in SEAMS first.
      source: SEAMS.md                                                  breach: needs decision
HC-7  Any change that moves money (taxes, fines, pay, welfare) ships with sim rows on both seed
      sets and Heiko's OK.  source: spawn doc, SEAMS WS7               breach: needs decision
HC-8  The language-model key is never WS7's: Smart seats decide through WS2's brain port.
      source: SEAMS WS2 -> server contract                              breach: fatal
```

---

## §1 · Solution Design, slice 1: elections, the Governor's tax, vote weight, the Land Baron `[handoff]`

All politics rules live in one new engine module, `packages/engine/src/politics.ts`, over one new `GameState.politics` object (null when the host switched politics off). `game.ts` only calls into it at three points of the month (planning opens, upkeep, score). The server steps the election on a tick as it steps the land auction; the AI gets one more hand, `VoteHand`, built like `LotHand`. Screens are built from WS6's hub mock once it is approved.

```
C1 · ADDED · politics is a host option, with its own state and config block
today        no politics state; TAX.salesTax is copied into the treasury once.
             anchors: packages/engine/src/game.ts::createGame, packages/engine/src/config.ts::TAX,
             packages/engine/src/types.ts::GameState
             verified_by: read
tomorrow     MUST add GameState.politics: Politics | null (null = off) and createGame option
             `politics?: boolean`, default true. MUST put every politics number in a new POLITICS
             block in config.ts. With politics off, MUST change nothing else: the game plays as
             trunk does today, byte for byte in the sim.
logic        → §2 RULE-1 (calendar)
seam         types.ts::GameState (named edit, WS3 reviews) + game.ts::createGame (named edit)
senior       junior would: scatter fields over Player and Treasury (isGovernor, ballot...). ·
             senior does: one Politics object, so cloneForSim deep-copies one field (FM-WS3-4: a
             shared array leaked what-if changes into the real game) and observe() hides one
             field's secrets.
mechanism    sprout
call sites   createGame: apps/server/src/mule-game.ts::MuleGame.start, packages/ai/src/play.ts::playGame,
             engine and server tests
reuse check  grep -rni -e politic -e governor -e election packages/*/src apps/*/src → only the TAX
             comment "The Governor sets it later" (config.ts) and the AI's spite/sabotage weights.
```

```
C2 · ADDED · planning opens the month's politics: the Land Baron, the starting tax, the election
today        advancePhase only bumps the month when planning starts.
             anchors: packages/engine/src/game.ts::advancePhase
             verified_by: read
tomorrow     MUST, when planning opens (createGame for month 1, advancePhase into planning
             after), call politics.ts (new): openPlanning: re-check the Land Baron (RULE-5), record the
             month's starting tax, and open an election in POLITICS.electionMonths (RULE-1).
logic        → §2 RULE-1, RULE-5
seam         game.ts::advancePhase `if (next === 'planning')` and the end of createGame — one call
             each (named edit, WS3 reviews)
senior       junior would: compute the Baron on every view. · senior does: fix it once per month,
             so a plot bought in the land auction doesn't flip a tie mid-ballot.
mechanism    sprout
call sites   the two sites above
```

```
C3 · ADDED · the election: run, vote, done, step, result
today        none.
tomorrow     MUST let a player run for one office or withdraw during nominate, cast or change
             one secret vote per office during ballot, and press Done in either stage. MUST end a
             stage on its clock or when every player is done, close the ballot into a result per
             office, and seat the winners for their term. MUST throw RuleError for anything the
             rules refuse.
logic        → §2 RULE-1 (stages), RULE-2 (who may run), RULE-3 (tally and winner)
seam         politics.ts (new): runFor / castVote / electionDone / stepElection / canRun (AM-3) — the same shape as
             lots.ts::lotDone / stepLandAuction, which the server and sim already drive
senior       junior would: count at the end of planning (approach 1). · senior does: a clocked
             stage machine with a reveal, ending early when all are done, and no RNG (ties
             break by RULE-3), so a replay needs no extra seed.
mechanism    sprout
call sites   server intents (C9), VoteHand (C8), play.ts (C10)
```

```
C4 · ADDED · vote weight
today        none. treasury.paid already sums each player's tax.
             anchors: packages/engine/src/economy.ts::taxSale, packages/engine/src/types.ts::Treasury
             verified_by: read
tomorrow     MUST compute every player's votes with their parts (RULE-4), public to every seat.
logic        → §2 RULE-4
seam         politics.ts (new): voteWeight(state, id) — reads tiles, reputation, the Baron, treasury.paid
senior       junior would: store weights on Player and update them. · senior does: derive them
             from the state each time, so nothing can drift.
mechanism    sprout
call sites   RULE-3's tally, the view (C9), VoteHand (C8)
```

```
C5 · MODIFIED · the Governor sets the sales tax
today        treasury.salesTax is TAX.salesTax for the whole game; taxSale charges it.
             anchors: packages/engine/src/economy.ts::taxSale, packages/engine/src/game.ts::createGame
             verified_by: read
tomorrow     MUST let the Governor set the sales tax in planning, outside the election stages, in
             whole percent within RULE-6's bounds; the new rate applies to every sale from then
             on (taxSale unchanged). With politics off the tax stays TAX.salesTax.
logic        → §2 RULE-6
seam         politics.ts (new): setSalesTax writes treasury.salesTax; taxSale stays the one reader
senior       junior would: add a second tax field. · senior does: keep treasury.salesTax as the
             one rate, so the auctions, the land auction and every screen's after-tax line
             (apps/web/src/phone/LandAuction.tsx) follow without change.
mechanism    in_place
call sites   taxSale callers: packages/engine/src/auction.ts, packages/engine/src/lots.ts::resolve
pin          the off row: sim with --politics off equals trunk's output (WS1 row 0)
```

```
C6 · ADDED · office pay from the colony fund
today        the fund only fills.
tomorrow     MUST pay POLITICS.pay.governor then POLITICS.pay.sheriff at upkeep, each only up to
             what the fund holds (never below 0).
logic        → §2 RULE-7
seam         politics.ts (new): payOffices, called once from advancePhase's upkeep branch before the
             report's colonyFund is read (named edit, WS3 reviews)
mechanism    sprout
call sites   game.ts::advancePhase
```

```
C7 · MODIFIED · terms served count toward the final score
today        scoreParts = money + goods + land + MULEs, minus the Collapse cut.
             anchors: packages/engine/src/game.ts::scoreParts
             verified_by: read
tomorrow     MUST add an `office` line: POLITICS.termScore per term served (a term counts when
             it has started). 0 with politics off.
             The Collapse cut does not reduce the office line: it is a reward for service, not
             colony wealth (AM-3).
logic        → §2 RULE-7
seam         scoreParts (named edit, WS3 reviews; WS1 checks the sim's score report)
pin          scoreParts' addition-order comment: the office line is added after `raw` is
             rounded, so existing totals don't move at .5 edges. Held by the engine score tests.
mechanism    in_place
call sites   score(); apps/server/src/mule-game.ts (game over); packages/ai/src/sim.ts
```

```
C8 · ADDED · AI seats run, vote and govern (VoteHand)
today        AI seats act in planning only through planMonth (the land plan).
             anchors: packages/ai/src/seat.ts::AiSeat.planMonth, packages/ai/src/hands/lot.ts::LotHand
             verified_by: read
tomorrow     MUST, for Classic seats with no API key: decide whether to run and for which office,
             vote, press Done after a short seeded human delay, and as Governor set the tax.
             MUST read only what its seat may see (observe()).
logic        → §2 RULE-8
seam         packages/ai/src/hands/vote.ts (new): VoteHand(mind, rng) with tick(state, dt, act) — the
             LotHand shape the server and play.ts already construct and tick
senior       junior would: call the engine directly from the seat. · senior does: act only
             through AiAction and the same checks a phone gets, so a refused move is a refused
             move for AI and human alike.
mechanism    sprout
call sites   mule-game.ts (C9), play.ts (C10)
```

```
C9 · MODIFIED · the server runs the election first, then planning; three new intents; a politics view
today        planning is one 45 s timer; AI seats plan once on entering it.
             anchors: apps/server/src/mule-game.ts::PHASE_MS, ::MuleGame.enterPhase, ::MuleGame.handle,
             ::MuleGame.viewFor, packages/protocol/src/index.ts::MuleIntent, ::MuleView,
             apps/server/src/server.ts::isIntent
             verified_by: read
tomorrow     MUST, in an election month, tick the election (stepElection + VoteHand) with no
             phase timer, mark away seats done, and start planning proper and the AI land plan
             only once the election is over. 'ready' during an election means Done for the stage.
             Planning proper has no clock: every human's Ready, or the host's Continue, ends it (AM-15). MUST accept the intents run, vote and setTax, and send each screen a
             politics view (§3) that hides other seats' ballots (RULE-9).
logic        → §2 RULE-1, RULE-9
seam         named edits in mule-game.ts, protocol and server.ts (WS3 reviews); the election
             tick copies scheduleLandAuctionTick
mechanism    in_place
call sites   MuleGame.enterPhase, .handle, .viewFor; server.ts::isIntent
```

```
C10 · MODIFIED · the sim plays politics (built by WS1)
tomorrow     play.ts's planning case loops VoteHand ticks and stepElection until the election
             is over, then planMonth; AiAction gains run, vote, setTax; sim.ts prints a politics
             row and takes --politics off; observe() hides other seats' ballots; cloneForSim
             deep-copies politics.
seam         WS1's files: packages/ai/src/{play,actions,sim}.ts, packages/engine/src/observe.ts
depends_on   C1 (data, not stubbable), C3 (contract), C8 (contract)
```

```
C11 · ADDED · the desks on phone and TV
tomorrow     MUST build the offices strip, the election desk with its reveal, the Governor's
             tax desk, the vote weight panel and the Land Baron badge into WS6's planning hub.
ux           WS6's hub mock at ws6-ux b28ee91 (awaiting Heiko's approval):
             design/mocks/ws6-ux/src/screens/PlanningHub.tsx and Election.tsx · routes #hub,
             #hub-nominate, #hub-council, #hub-governor, #tv-election · testids offices,
             election-stage, run-governor, run-sheriff, withdraw, candidates, voted, vote-weight,
             ballot-countdown, ballot-reveal, result-<office>-<id>, how-<office>, gov-tax, tax-down,
             tax-value, tax-up, tax-confirm, tax-readonly, vote-weights, land-baron.
             GRAFT TARGET: the hub's politics slots (WS6's PR-9 frame).
depends_on   C9 (contract), WS6 mock approval (not stubbable: an implementer never designs a screen)
```

```
C12 · ADDED · a Governor candidate's tax promise (AM-11)
today        a candidate is a name; the approved mock shows a quoted promise under each one on
             the ballot and the TV, and nothing in engine, protocol or web carries it.
             verified_by: read (Council.tsx, TvElection.tsx, politics.ts at 7fb9063)
tomorrow     MUST let a Governor candidate pick one promise from RULE-10's list when running;
             MUST show it under the candidate on every phone's ballot and the TV's result;
             MUST let an AI Governor candidate pick by RULE-10's AI row. No Sheriff promise
             until slice 4, no law promise until slice 2, no free text.
logic        → §2 RULE-10
seam         packages/engine/src/politics.ts::runFor (the candidacy) — the promise lives with
             the candidacy, so switching office or withdrawing drops it with no second store
senior       junior would: a free-text field, or a promise list in the web only · senior does:
             a closed union validated by the engine, public in the view like the candidates,
             so slice 3 can check a kept promise against the tax actually set
mechanism    in_place
call sites   runFor: MuleGame.handle('run'), VoteHand run step, engine tests
pin          RULE-2's rows hold; T-AC-1's stage machine unchanged
ux           WS6's mock at ws6-ux bd899fd, approved by Heiko ("Approve as shown"):
             design/mocks/ws6-ux/src/screens/PlanningHub.tsx (picker, Ballot, Now copy) and
             Election.tsx (TV result rows) · route #hub-promise · testids promise-pick,
             promise-cap, promise-cap-minus, promise-cap-plus, promise-cap-value, promise-lower
             (disabled at 0% with its reason), promise-hold, promise-run, promise-cancel,
             running, promise-<seatId> · GRAFT TARGET: apps/web/src/phone/hub/politics/
             Council.tsx (and words.ts for the wording), apps/web/src/table/TvElection.tsx
depends_on   C3 (engine), C9 (contract), WS6 picker mock (not stubbable)
atomicity    the engine field, the intent and the view ship together (one contract)
```

## §2 · The Logic `[handoff]`

```
RULE-1 · Election calendar and stages                               shape: state machine

calendar   an election opens when planning opens in a month in POLITICS.electionMonths
           ([1, 4, 7, 10]) and politics is on. Terms run from that month until the next
           election month (1-3, 4-6, 7-9, 10-end).
stages     nominate (POLITICS.nominateMs) → ballot (POLITICS.ballotMs) → reveal
           (POLITICS.revealMs: countdown, then the result) → over
  #   in stage    when                                         then
  1   nominate    clock runs out, or every player is Done       → ballot, done cleared
  2   ballot      no office has 2+ candidates                   skip straight to reveal
  3   ballot      clock runs out, or every player is Done       → reveal, the result is fixed
  4   reveal      clock runs out                                → over; winners take office
  5   over        —                                             normal planning; the Governor
                                                                may set the tax
outcome   the result is computed once, entering reveal, and never changes. Screens show a
          countdown for POLITICS.revealCountdownMs of the reveal, then the result.
unknown   a player who is away is marked Done by the server; one who never votes abstains.
closing   leaving planning with the election not over closes it at once (AM-1): the stages
          left are skipped, the result is tallied from the ballots cast, and winners take office.
examples  all Done in nominate after 4 s → ballot opens at once · nobody runs → no ballot,
          reveal shows "appointed" · month 2 → no election, planning as today
```

```
RULE-2 · Who may run                                                 shape: decision table

inputs    office ∈ {governor, sheriff}; the player's current candidacy (none | governor |
          sheriff); governorTermsInRow (0..n) = terms in a row the player has just served as
          Governor
first match wins
  #   when                                                    then
  1   stage ≠ nominate                                        refuse "Candidates are closed"
  2   office = governor and governorTermsInRow ≥ 2            refuse "Two Governor terms in a row"
  3   the player already runs for the other office            switch: their candidacy moves
  4   otherwise                                               they run for that office
withdraw  run(null) during nominate removes the candidacy.
promise   running for Governor carries a tax promise, checked by RULE-10; running for Sheriff
          carries none (C12, AM-11). Switching office or withdrawing drops the promise.
note      A sitting Sheriff may run for Governor and vice versa: one person never holds both
          because a player runs for one office per election.
```

```
RULE-3 · Tally and winner, per office                                shape: decision table

inputs    candidates (0, 1, 2+); ballots: voter → candidate | none; weight = RULE-4 at the
          moment the ballot closes
first match wins
  #   when                                       then                          how
  1   0 candidates, office governor              the richest player who does   appointed
                                                 not run for Sheriff (money;
                                                 tie → round the table, AM-12); if every
                                                 player runs for Sheriff, the
                                                 richest player (AM-2)
  2   0 candidates, office sheriff               the richest player who is     appointed
                                                 not the new Governor
  3   1 candidate                                that candidate                unopposed
  4   one candidate has the most weighted votes  that candidate                votes
  5   tie, and the Land Baron's ballot names     that candidate                baron
      one of the tied candidates
  6   tie otherwise                              the tied candidate with the   tieRule
                                                 most plots, then round the
                                                 table (AM-12)
round the table (AM-12)  among players still tied, the first in seat order starting from
           seat (seed + k) mod n, where seed is the game's seed, k this election's index in
           POLITICS.electionMonths (0 for month 1) and n the number of players. No RNG draw:
           the same game gives the same offices; the start moves between elections (k) and
           between games (seed), since most ties come in month 1.
visibility  the result shows each candidate's weighted total, never who voted for whom.
examples   3 vs 2 votes → the 3; 2 vs 2, Baron voted the second → the second; nobody runs
           for Sheriff → the richest non-Governor
```

```
RULE-4 · Vote weight                                                 shape: formula

votes = 1
      + floor(plots owned / POLITICS.weight.plotsPerVote)                     (10)
      + (reputation ≥ POLITICS.weight.repHigh ? 1 : reputation < POLITICS.weight.repLow ? -1 : 0)
                                                                              (70, 30)
      + (Land Baron ? 1 : 0)
      + min(POLITICS.weight.taxCap, floor(treasury.paid[id] / POLITICS.weight.taxPerVote))
                                                                              (2, 300)
parts     each term is reported on its own, for the weight panel.
unknown   treasury.paid without the player = 0. Reputation is 50 for everyone until slice 3,
          so the reputation term is 0 in slice 1. Whether votes may fall to 0 (reputation
          below 30 with nothing else) is a slice-3 question.
```

```
RULE-5 · The Land Baron                                              shape: decision table
evaluated_at  planning opens (C2), once a month
  #   when                                                    then
  1   one player owns strictly the most plots                 they are the Baron
  2   tie for most, and the current Baron is among them       the current Baron keeps it
  3   otherwise (tie without the holder, or nobody owns any)  no Baron
perks in slice 1   +1 vote (RULE-4), breaks tied elections (RULE-3). The 10% land-auction
                   discount is not in slice 1 (money moves; needs its own sim row and OK).
```

```
RULE-6 · Sales tax bounds                                            shape: formula
the Governor sets percent ∈ integers, with
  max(POLITICS.tax.min, start − POLITICS.tax.maxStep) ≤ percent ≤ min(POLITICS.tax.max, start + POLITICS.tax.maxStep)
  where start = the rate when this month's planning opened, and (min, max, maxStep) = (0, 15, 5)
refuse    not the Governor · not planning · election not over · out of bounds (RuleError)
effect    treasury.salesTax = percent / 100, at once; later changes in the same planning allowed
examples  start 5 → 0..10 allowed, 11 refused · start 15 → 10..15
```

```
RULE-7 · Office pay and the term score                               shape: sequence
at upkeep, after runUpkeep:  pay = min(fund, POLITICS.pay.governor) to the Governor, then
                             min(fund, POLITICS.pay.sheriff) to the Sheriff        (50, 30)
score:   office = POLITICS.termScore × terms served (Governor or Sheriff; a term counts once
         it starts)
invariant  the fund never goes below 0.
```

```
RULE-8 · VoteHand (Classic AI seats)                                 shape: decision table
run       in nominate, once, after a seeded delay in POLITICS.ai.actMs:
          governor if a seeded draw < POLITICS.ai.runGovernor[persona], else sheriff if a
          seeded draw < POLITICS.ai.runSheriff[persona], else none; never against RULE-2.
          Running for Governor, it promises by RULE-10's AI row (C12).
vote      in ballot, per contested office: itself if it runs; otherwise the candidate with
          the fewest plots, so the table leans against the biggest landowner (the design's
          "council reins in the runaway leader"); ties → a seeded draw among the tied (AM-10).
          A Rookie that does not
          run votes for a seeded random candidate instead of the fewest-plots rule; a Rookie
          candidate votes for itself like any candidate (AM-7).
done      Done right after acting in each stage.
tax       as Governor, once per planning after the election: step toward the persona's target
          (POLITICS.ai.taxTarget: trader 5, cautious 4, aggressive 8, saboteur 10) by at most
          maxStep; plus POLITICS.ai.taxFundBump (2) when the fund is under 3 months of office
          pay, from month 2 on (AM-9: the fund starts empty); clamped to RULE-6.
Smart seats  the same code in slice 1 (no model call); WS2's brain takes these decisions later.
```

```
RULE-10 · A Governor candidate's tax promise (C12, AM-11)            shape: decision table

inputs    office; promise ∈ { cap N (whole percent) | lower | hold } | none
first match wins
  #   when                                             then
  1   office = sheriff and a promise is given          refuse "Sheriff candidates make no promise yet"
  2   office = governor and no promise                 refuse "Pick a promise to run for Governor"
  3   cap N with N outside 0..15                       refuse "A tax promise is 0% to 15%"
  4   otherwise                                        the candidacy carries the promise
words     cap N → "Tax no higher than N%" · lower → "Lower the tax" · hold → "Hold the tax"
public    a candidate's promise is public like the candidacy (phones and TV)
AI row    persona target T against the tax at nominate C: T > C → cap T; T < C → lower;
          T = C → hold
kept      not checked in slice 1; slice 3's reputation may read it against the tax set
examples  Lena runs promising cap 8 → every ballot and the TV show "Tax no higher than 8%" ·
          cap 16 refused · a trader AI at 5% with target 5 promises "Hold the tax"
```

```
RULE-9 · Who sees what                                               shape: decision table
  item                                         owner's phone   other phones   TV
  candidates, stage, clock, who has voted,     yes             yes            yes
  who pressed Done
  a ballot (who someone voted for)             yes             no             no
  the result (totals per candidate, how)       yes             yes            yes
  offices, terms, Baron, tax, fund, weights    yes             yes            yes
accepted  `how: 'baron'` tells the table the Land Baron's ballot named the winner of a tie, and
          'tieRule' that it named neither tied candidate. Breaking ties is the Baron's public
          act (05-colony-politics), so this one disclosure is by design (AM-3); no other ballot
          is ever revealed.
```

## §3 · Contracts & Data Models `[handoff]`

| Contract | change_kind | Breaking | Change |
|---|---|---|---|
| `GameState.politics: Politics \| null` (engine types) | ADDED | no (new field; null when off) | C1 |
| `createGame({ politics?: boolean })` | ADDED | no (default on) | C1 |
| `MuleIntent` += `{type:'run'; office: 'governor'\|'sheriff'\|null}`, `{type:'vote'; office; candidate: string\|null}`, `{type:'setTax'; percent: number}` | ADDED | no | C9 |
| `MuleView.politics: PoliticsView \| null` and `MyView.politics: { running, ballot, canRun } \| null` | ADDED | no | C9 |
| `AiAction` += run, vote, setTax (WS1's actions.ts) | ADDED | no | C10 |

```ts
// packages/engine/src/types.ts (named edit), shape for review
type Office = 'governor' | 'sheriff';
interface Politics {
  governor: string | null; sheriff: string | null;
  termStart: number;                       // month the current terms began
  terms: Record<string, number>;           // terms served per player
  governorRun: { id: string; terms: number } | null;  // for the two-in-a-row rule
  baron: string | null;
  taxAtStart: number;                      // salesTax when this month's planning opened
  election: Election | null;               // the live or just-finished election this month
}
interface Election {
  stage: 'nominate' | 'ballot' | 'reveal' | 'over';
  clockMs: number;
  candidates: Record<Office, string[]>;
  ballots: Record<string, Partial<Record<Office, string>>>;  // secret: hidden by observe() and the view
  done: string[];
  result: Record<Office, { winner: string; how: 'votes' | 'unopposed' | 'appointed' | 'baron' | 'tieRule';
                           tallies: { id: string; votes: number }[] }> | null;
}
```

As built in PR-3 (AM-8): `tax` is `{ percent, start, low, high }`, `pay` is `{ governor, sheriff }`, `election` carries `done`, there is no `tax.setBy`, and `election.result` is null until the reveal's countdown ends.

C12 (AM-11), ADDED, not breaking: `type TaxPromise = { kind: 'cap'; percent: number } | { kind: 'lower' } | { kind: 'hold' }`; the engine's `Election` gains `promises: Record<string, TaxPromise>` (Governor candidates only); the `run` intent gains an optional `promise` (required for Governor by RULE-10); the view's `election` gains `promises`, public on every screen and added to the board's key allow-list.

Reason and outcome enums the screens show: `canRun[office]: true | 'closed' | 'termLimit'` (running for the other office is not a refusal: it switches the candidacy, RULE-2 row 3); `result[office].how: 'votes' | 'unopposed' | 'appointed' | 'baron' | 'tieRule'`.

Worked example (view, Brix's phone, ballot stage, month 4): `politics: { governor: 'lena', sheriff: 'ai1', term: [1,3], next: 7, baron: 'lena', tax: { percent: 8, start: 5, setBy: 'lena' }, fund: 412, weights: [{ id: 'lena', votes: 3, parts: { base: 1, land: 1, reputation: 0, baron: 1, taxes: 0 } }, …], election: { stage: 'ballot', seconds: 14, total: 20, candidates: { governor: ['lena','brix'], sheriff: ['ai1'] }, voted: ['lena'], result: null } }`, `me.politics: { running: 'governor', ballot: { governor: 'brix' }, canRun: { governor: true, sheriff: true } }`. Lena's ballot is not in Brix's view.

## §4 · Failure & Ops `[handoff]`

| Question | |
|---|---|
| Dependency unavailable? | No external dependency: the election is in-process and AI votes are code. A Smart seat makes no model call for politics in slice 1. |
| Retry / poison? | An intent the rules refuse throws RuleError and reaches the player as a message (CLAUDE.md); nothing retries. |
| Idempotency | run, vote and setTax set a value (not toggle), so a repeated intent is harmless. |
| Races | A vote that arrives after the ballot closed is refused (stage check). The server steps the election and handles intents on one thread. |
| What still works when politics breaks? | The host switches it off (C1): the game plays as trunk today. |
| How to know it works | The sim's politics row (C10) and the news line on every reveal. |

## §5 · Delivery `[handoff]`

Code-only; no existing state to reach: games live in the server's memory and a restart ends them. Politics is on by default from the release that ships it. Rollback is a revert, or `createGame({ politics: false })`.

## §6 · Acceptance Criteria, slice 1 `[handoff]`

| AC | Given / When / Then | Changes | observed_at | negative case |
|---|---|---|---|---|
| B-AC-1 | Given month 1 with two humans and AI seats · When both humans run for Governor, vote and press Done · Then after the countdown every screen shows the same totals and winner at the same moment, and the winner's phone opens the tax desk | C3 C9 C11 | the phone and TV views in an e2e (UBER-AC-2) | month 2 opens no election |
| B-AC-2 | Given Lena is Governor and the tax started the month at 5% · When she sets 8% · Then the next sale in the auction is taxed at 8% and every screen shows "8% (+3)" | C5 C9 | the seller's money after the trade, in the server view | 11% is refused with a message |
| B-AC-3 | Given nobody runs for either office · When the election ends · Then the richest player is Governor and the richest other player is Sheriff, shown as "appointed" | C3 | the view's result | one candidate → "unopposed", no ballot |
| B-AC-4 | Given a 2-2 tie and the Land Baron voted for the second candidate · When the ballot closes · Then the second candidate wins, shown as broken by the Baron | C3 C4 | engine result | Baron voted for neither → most plots, then seat |
| B-AC-5 | Given Brix voted for Lena · When Ossa's phone or the TV receives a view · Then neither contains Brix's choice | C9 | the server's view JSON | Brix's own view has it |
| T-AC-1 (serves B-AC-1) | stepElection moves nominate → ballot → reveal → over on its clocks and early when all players are Done; the result is fixed entering reveal | C3 | engine test | a late vote after close throws RuleError |
| T-AC-2 (serves B-AC-3, B-AC-4) | RULE-3's six rows, one test each | C3 | engine test | — |
| T-AC-3 (serves B-AC-2) | RULE-6 bounds: start 5 → 0..10 allowed, 11 refused; non-Governor refused; refused during the election | C5 | engine test | — |
| T-AC-4 (serves UBER-AC-1) | With politics off, the sim's output equals trunk's, byte for byte, apart from the new report line | C1 C10 | WS1's sim row 0 | — |
| T-AC-5 (serves UBER-AC-1) | Pay never takes the fund below 0; the office score line is 0 with politics off | C6 C7 | engine test, sim's "lowest colony fund" check | fund 20 → Governor gets 20, Sheriff 0 |
| T-AC-6 (serves B-AC-1) | VoteHand: each Classic seat runs (or not), votes and presses Done within the stage's clock with no API key; a Governor seat sets a tax inside RULE-6 | C8 | ai test on a seeded game | Rookie votes, never refused |
| B-AC-6 | Given Lena runs for Governor promising "Tax no higher than 8%" · When the ballot opens and later the result shows · Then every phone's ballot and the TV's result show that promise under her name (C12, AM-11) | C12 | the phone and TV DOM in an e2e | a Sheriff candidate shows no promise |
| T-AC-8 (serves B-AC-6) | RULE-10's four rows, one test each; switching office or withdrawing drops the promise | C12 | engine test | — |
| T-AC-9 (serves B-AC-6) | VoteHand running for Governor promises by RULE-10's AI row; never refused | C12 | ai test on a seeded game | — |
| T-AC-7 (serves B-AC-5) | observe() for seat B and cloneForSim never expose or share seat A's ballot | C10 | ai/engine test | — |

Invariant for every test: one player never holds both offices; the fund is never negative.

## §7 · Risks & Spikes `[review-only]`

- **Planning grows by up to a minute in election months** (20 + 20 + 6 s before the 45 s). Mitigation: every stage ends early when all are done (RULE-1 rows 1, 3), and the ballot is skipped when no office is contested (row 2). Measured in the e2e and the rig.
- **AI elections may be dull:** if every AI seat runs and votes for itself, weight alone decides. Mitigation: RULE-8's run chances per persona and the anti-leader vote. WS1's row 1 reports the winners' spread.
- **Screens wait on WS6's mock.** Mitigation: engine, AI and server PRs go first; screens follow the approved mock (C11 depends_on).
- **Landmine (WS1, FM-WS3-4):** cloneForSim shared new state with the real game. Mitigation: one `politics` object deep-copied by WS1, with T-AC-7.

## §8 · Amendments `[review-only]`

```
AM-1 · 2026-10-22 · lead · before PR-1

target    §1 C3 tomorrow, §2 RULE-1
said      the election ends on its clocks or when everyone is Done
did       also: when the game leaves planning while an election is still open (the server's
          planning timer, a sim that doesn't step it, a client that never sends Done), the
          election closes at once: the ballots cast so far are tallied (RULE-3) and winners
          take office. One call in advancePhase when planning ends (game.ts named edit).
because   P-1: the table must always end up with a Governor and a Sheriff; without it a stuck
          election leaves the colony with no offices for three months, and PR-1 alone (no
          VoteHand, no server tick) would never fill an office in the sim (UBER-AC-1).
goal      P-1, more robustly than as specified
folded    C3 tomorrow + RULE-1 note below; plan Task 1.4 step 1 adds the test
```

```
AM-2 · 2026-10-22 · lead · PR-1 fix round 1

target    §2 RULE-3 row 1
said      0 candidates for Governor → the richest player is appointed
did       the richest player who does not run for Sheriff; only if every player runs for
          Sheriff, the richest player (who then can't be Sheriff: row 2's exclusion holds)
because   P-1: the implementer found that RULE-3 as written makes the richest player both
          Governor (row 1) and Sheriff (row 3) when they run unopposed for Sheriff and nobody
          runs for Governor, breaking "one player never holds both offices". Respecting the
          candidacy a player chose keeps the table's choices meaningful.
goal      P-1 — still met
folded    RULE-3 row 1; test `AM-2: …` in PR-1
```

```
AM-3 · 2026-10-22 · lead · PR-1 code review

target    §1 C3 seam, §1 C7, §2 RULE-9; plan PR-1 scope
did       (a) politics.ts exports canRun(state, id) → Record<Office, CanRun>, and runFor uses it,
          so the server's MyView.politics.canRun (§3) reads the engine's RULE-2 instead of
          restating it in PR-3 (which may not edit the engine). (b) Recorded that Collapse does
          not cut the office line. (c) Accepted that how: 'baron' / 'tieRule' disclose the Baron's
          tie vote. (d) A cleared ballot leaves no entry, so "who has voted" can't show a voter
          who cleared theirs.
because   P-1: the reviewer found PR-3 had no engine source for canRun (a plan gap) and named
          two rules the spec implied but never stated.
goal      P-1 — still met
folded    C3 seam, C7 tomorrow, RULE-9 note; plan Task 1.4 adds canRun
```

```
AM-4 · 2026-10-22 · lead · PR-1 maintainability review

target    §1 C1 senior, §9 politics ownership; PR-1 exports
did       (a) Every politics write first replaces state.politics with a structuredClone (edit()),
          so a what-if copy that shares the object can never leak into the real game. WS1's C10
          deep copy in cloneForSim is kept as well: copy-on-write protects any copy of the game,
          the deep copy keeps observe()'s hiding simple. Reads of a possibly shared election are
          Readonly in the type system. (b) politics.ts exports what PR-2 and PR-3 need so neither
          restates a rule (both may not edit the engine): canRun (AM-3), taxBounds (RULE-6),
          nextElectionMonth and the stage lengths (RULE-1), plotsOwned (RULE-3/RULE-8's plot
          count), the ElectionResult type; closeElection returns its result like stepElection.
because   P-1: one source for each rule. The reviewer found RULE-6 and RULE-1 would otherwise be
          copied into the AI hand and the server, and the copy-on-write choice was unrecorded.
goal      P-1 — still met
folded    §9 write contract lists closeElection; C1 senior notes copy-on-write
```

```
AM-5 · 2026-10-22 · lead · PR-3

target    §1 C1 / C9 (where the host option's default lives on the server)
said      createGame({ politics }) defaults on
did       the engine's createGame still defaults on (the sim plays politics). The server's
          MuleGame takes politics?: boolean defaulting OFF, and createMuleServer, which every
          real table goes through, passes politics: true. Existing server tests that build
          MuleGame directly (WS1/WS3/WS4 files) keep today's planning timing untouched.
because   P-1: the election first in month 1 changes planning's timing, and seven server test
          files of other lanes assume 45 s planning; editing them all is churn in files WS7
          may not touch, while the product default (what a table plays) stays on.
goal      P-1 — still met (a table plays politics by default; test C1 proves it)
folded    C9 tomorrow; plan Task 3.2 adds `C1: the server a player joins plays politics by default`
```

```
AM-6 · 2026-10-22 · lead · PR-3

target    AM-5 (the server's default); §5 Delivery
said      createMuleServer passes politics: true
did       createMuleServer takes politics?: boolean defaulting OFF until PR-4 ships the desks;
          PR-4 flips the default on together with its election e2e. The engine (sim) stays on.
because   P-1: without the desks, a real month 1 would run an election no phone can see (20 s
          of nominate, a reveal, then a second "I'm ready"), and WS4's smoke e2e times out on
          exactly that. A feature switched on before its screens exist serves no player.
goal      P-1 — met when PR-4 lands; nothing politics-on reaches trunk before then anyway
folded    C9 tomorrow; plan Task 3.2's C1 test; PR-4 adds the flip and its test
```

```
AM-7 · 2026-10-22 · lead · PR-2 review

target    §2 RULE-8 (run draw, Rookie vote)
did       the run draw reads "a seeded draw < p" (the engine's rng.chance convention; p = 0
          means never); a Rookie candidate votes for itself, only a non-candidate Rookie picks
          at random
because   P-1: the review found RULE-8 ambiguous on both points; the chosen readings keep a
          candidate's own vote certain at every level
goal      P-1 — still met
folded    RULE-8 text; PR-2 test row for the Rookie candidate
```

```
AM-8 · 2026-10-22 · lead · PR-3 review

target    §2 RULE-9, §3 PoliticsView, §1 C9 scope
did       (a) Accepted: weighted totals per candidate, public vote weights and the public
          "who has voted" list can, on a small table, let players work out a ballot by
          arithmetic (e.g. two voters, one votes for themself). No screen ever shows a ballot;
          the totals are what Heiko approved for the reveal ("TV reveal with totals only",
          WS6 hub mocks, 2026-10-22). Any published count has this property.
          (b) §3's view as built: tax { percent, start, low, high }, pay { governor, sheriff },
          election.done (public, like the auction's Done) added; tax.setBy dropped (the
          Governor is in the view). The result stays null until the reveal's countdown ends.
          (c) apps/server/src/politics-view.ts is a WS7 file (beside land-auction.ts); WS3
          reviews it with mule-game.ts; SEAMS row to be updated by the PM.
          (d) A phone that reconnects during an election gets its Done for the stage back.
because   P-1 / HC-4: the review named the arithmetic inference and the view drift; recording
          them keeps the contract WS6 builds against and the privacy promise exact.
goal      P-1 — still met
folded    RULE-9 row; §3 note below; plan PR-3 authority
```

```
AM-9 · 2026-10-22 · lead · WS1 money rows

target    §2 RULE-8 (tax)
did       The low-fund bump applies from month 2 on. The colony fund starts at 0, so in
          month 1 every AI Governor saw a "low" fund and added the bump on top of its step:
          the tax opened at a median 10% on all three seed sets (WS1, ws7-politics 1b800a3).
          An empty fund before any tax is collected or any pay is due is not a fund drained
          by pay, which is what the bump answers.
because   P-1: the Governor's tax should follow the persona's aim and the fund's real state;
          a bump every first month is an artefact of the starting balance.
goal      P-1 — still met
folded    RULE-8 text; nextTax takes the month; PR-2's T-AC-6 trader row (fund 0 holds 5%
          in month 1); WS1 re-measures rows 2 and 3
```

```
AM-10 · 2026-10-22 · PM ruling · WS1 money rows

target    §2 RULE-8 (vote)
did       An AI that does not run votes for the fewest-plots candidate, ties broken by a
          seeded draw instead of the lower seat. In month 1 nobody owns land, so every such
          AI voted for the lowest seat: terms by seat ran ai0 30-33% to ai3 18-21% (WS1).
          RULE-3 row 6 (the engine's last tie rule) stays deterministic: no RNG in elections.
because   fairness: a seat number must not decide offices
goal      P-1 — still met
folded    RULE-8 text; WS1 re-measures terms by seat
```

```
AM-11 · 2026-10-22 · Heiko (card: "Tax promises now (Recommended)") · WS6 render gate

target    §1 C12 (new), §2 RULE-2, RULE-8, RULE-10 (new), §3, §6 B-AC-6, T-AC-8, T-AC-9
did       The approved mock shows a promise under each candidate; slice 1 had none. Heiko
          chose: Governor candidates pick from a short tax list (no higher than N%, lower,
          hold); no Sheriff promise until slice 4; law promises with slice 2; no free text.
          A follow-up PR before the lane milestone.
because   P-1: the approved election screen, honoured where slice 1 can back it up
goal      P-1 — still met
folded    C12, RULE-10, ACs; plan task PR-6
```

```
AM-12 · 2026-10-22 · lead (PM fairness ruling, AM-10's follow-up) · WS1 terms by seat

target    §2 RULE-3 rows 1, 2 and 6
did       After AM-10, WS1 measured ai0 still at 27.7% of terms (960 terms, three seed sets,
          about 1.9 standard errors over 25%). The residual came from the engine's own seat
          order: Governor by tieRule 55 offices, ai0 28 / ai1 19 / ai2 7 / ai3 1; Sheriff
          appointed 188, ai0 61 / ai3 31 (equal money in month 1). Both last resorts now go
          round the table from a seat that moves each election.
          Amended at build: a start of k mod n alone left month 1 (k = 0 in every game) at
          seat 0, and month 1 is where most ties fall (WS1's howwon.ts on 3b7727a: Governor
          tieRule ai3 0/0/1 across the sets). The start is (seed + k) mod n. Measured after:
          Governor tieRule ai0 11 / ai1 16 / ai2 16 / ai3 15 of 58; Sheriff appointed 41 / 38 /
          59 / 48 of 186, ai2's lean being money (the gearling seat), not a tie.
because   fairness: a seat number must not decide offices; no RNG, so the rule stays
          explainable and replays from seed + actions
goal      P-1 — still met
folded    RULE-3 text; T-AC-2's row-6 and appointment tests; WS1 re-measures terms by seat
```

```
AM-13 · 2026-10-28 · Heiko (via PM) · planning direction for slices 2+

target    §0 D1 slice 5 (budget), later slices; no slice-1 change
did       Heiko: the colony budget is a separate pot filled from taxes, fines and the like;
          the Governor spends it on community projects; the colony's success is measured by
          how wealthy the colony is and how good its environment is, and later by prestige
          (the colony can buy prestige objects). Slice 1 already keeps the fund apart (design
          01; taxes pay into treasury.money, office pay comes out of it). Folded into the
          later slices:
          - slice 5 (budget lines) gains the Governor spending the fund on community
            projects: design 03's colony projects and design 05's five budget lines;
          - a later slice adds prestige objects the colony buys (not in the design yet:
            needs its own design and Heiko's approval);
          - the colony's success score at game end is WS6's design. The fund records today:
            balance (treasury.money), taxes paid per player (treasury.paid) and the
            month-end balance in each MonthReport (colonyFund, beside air). Slice 5 adds a
            per-month ledger in the MonthReport: money in by source (sales tax, later the
            other taxes, fines, donations) and money out by line (office pay, each budget
            line, projects), so the score can read wealth, spending and projects built.
because   G-4: the colony, not only each player, has something to win or lose
goal      P-1 — still met; slice 5's scope grows by projects, the colony score is WS6's
folded    D1 note below; slice 2+ planning
```

```
AM-14 · 2026-10-28 · lead · follow-up e2e (Baron tie-break)

target    §1 C11 ux testids
did       C11 listed a `tie-break` testid; the approved mock (Election.tsx) and the built
          TvElection.tsx name how an office was decided with `how-<office>` ("A tie: Ossa, the
          Land Baron, broke it."). The mock is binding, so the list now says how-<office>.
because   P-1: the spec must match the approved screen it points at
goal      P-1 — still met
folded    C11 testid list; e2e/politics-tie.ts asserts on how-governor
```

```
AM-15 · 2026-10-28 · Heiko (playtest ruling, via PM) · WS3's #122 named edits

target    §1 C9 tomorrow; AM-1's server case
said      the normal planning timer starts once the election is over
did       Heiko: planning has no clock. The election keeps its own stage clocks; planning
          proper, after it, waits until every human is Ready or the host presses Continue
          for an absent player (a dropped phone holds planning). WS3 built it in #122
          (PHASES.planningMs null) and restated C9's rows in politics.test.ts and the claim
          wait in e2e/politics.ts as named edits; WS7 reviewed them. On the server, planning
          can no longer end while an election is open: Ready is Done for the stage, and
          checkAllReady waits while the election runs. AM-1's close-at-once stays as the
          engine guard for a game or sim that leaves planning another way. The host's
          Continue exists for planning proper only: while the election is open it is refused
          (RuleError) and changes nothing, since away seats are already Done on every
          election tick (WS3's continuePlanning).
because   G-4 / P-1: Heiko's play-test; the election's timing is unchanged
goal      P-1 — still met
folded    C9 tomorrow; politics.test.ts row FM-planning-untimed (WS3's ee5318f)
```

```
AM-16 · 2026-10-28 · PM goal gate · slice 2a designed

target    §0 D2 and its count note; D1 slice 2; non-goals
did       Slice 2a's §0 passed the PM's goal gate: the council and four laws (export, land and
          pollution tax, emission cap), designed in docs/specs/2026-10-28-ws7-slice2a-council.md
          (ids C40+, RULE-40+, UBER-AC-8..10). This is D2's note as option A: the sabotage ban and the
          Sheriff's fines move to slice 4 with the Sheriff's powers; B (A plus the windfall tax) and C
          (keep the inert ban in slice 2) stay in that spec's decision record. D2 is Heiko's and goes
          on the G-5 card; B or C amends slice 2a's non-goals before any build. Law promises in
          campaigns move from slice 2 (AM-11) to slice 3, with deal cards.
because   P-1: "the colony votes laws" (UBER-AC-1's law clause) is the unmet half of P-1; G-5: the law
          taxes are the fund's main income
goal      P-1 — still met; G-5's income
folded    D2 count note below; slice 2a spec
```

```
AM-18 · 2026-10-28 · Heiko (via PM) · the election is not time-bound

target    §2 RULE-1 stages, RULE-2 row 1, RULE-8 timing, RULE-9 election rows; §3 Election
said      nominate 20 s → ballot 20 s → reveal 6 s inside planning; run only in nominate
did       Heiko: "we shouldn't make this time bound": run for office in any month's planning, and in
          an election month announce, let everybody vote, then reveal office by office with growing
          bars and a celebration. Designed in docs/specs/2026-10-28-ws7-untimed-election.md (C60-C67,
          RULE-60..64): candidacy lives on Politics; announce (last call) → ballot (closes when all
          are Done) → ceremony (presentation clocks only) → over; away seats are not Done; the host's
          Continue closes a stage for absent players. Replaces E-1.
because   P-1: the table governs itself only if a newcomer can take part; 20 s stages shut them out
          (WS6 audit §3)
goal      P-1 — still met
folded    RULE-1, RULE-2, RULE-8, RULE-9 superseded by RULE-60..64 for the election; UBER-AC-2 restated
```

## §9 · Ownership Boundaries `[handoff]`

### Ownership: politics state
- Sole owner:      packages/engine/src/politics.ts
- Read contract:   GameState.politics, read by observe(), the server's view and VoteHand
- Write contract:  only politics.ts's functions (openPlanning, runFor, castVote, electionDone, stepElection, closeElection, setSalesTax, payOffices), each through copy-on-write edit() (AM-4)
- Enforcement:     engine tests; review rule "no other file writes state.politics" (grep in the PR checklist)

### Ownership: the sales tax rate (a second writer)
- Owner today:     createGame writes treasury.salesTax once; taxSale reads it.
- Change:          politics.ts (new): setSalesTax becomes the only writer after createGame.
- Enforcement:     T-AC-3, and the off row T-AC-4 proves nothing else writes it.
