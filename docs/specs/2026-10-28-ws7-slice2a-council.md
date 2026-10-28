# WS7 politics · slice 2a: the council and four laws

Programme amendment to `docs/specs/2026-10-22-ws7-politics.md` (AM-16) · WS7 · 2026-10-28 ·
**Status:** §0 passed the PM's goal gate (2026-10-28), on one condition: D2 is Heiko's and goes on the
G-5 card. This design is against D2 option A; if he picks B or C, the non-goals are amended before any
build. Spec and plan only; the build waits for Heiko's G-5 card and G-5's C20 ledger.

Ids continue after slice 1 (C1-C12, RULE-1..10) and G-5 (C20-C37, RULE-20+, UBER-AC-5..7):
changes C40+, rules RULE-40+, proofs UBER-AC-8..10, ACs B-AC-40+ / T-AC-40+.

## §0 · Business Goals & Value `[handoff: goal lines and proofs]` `[review-only: who / today / value / cost]`

Both goals trace to approved goals: P-1 (Heiko, 2026-10-22, "the colony votes laws that change the
rules"; UBER-AC-1's law clause is still unmet) and G-5 (Heiko, 2026-10-28; AM-13: "the colony budget
is a separate pot filled from taxes, fines and the like").

**S2-1 · The colony votes laws that change the rules: each month the Governor may put one law, or a
repeal, to the table, every player sees what it would cost them, and a weighted vote decides.**
- *Who benefits:* every player, most of all those behind: a land tax checks the Baron's sprawl, an
  export tax the big exporter, a pollution tax or an emission cap the polluter.
- *Today:* no law and no council vote exists (`git grep -iE '\blaws?\b|council' packages/*/src
  apps/server/src` finds nothing; verified_by: read), so UBER-AC-1's "a law passes in at least half the
  games" cannot be met. The council desk shows vote weights only; the hub mock's Law vote section is
  marked "soon, slice 2".
- *Value:* the table can rein in a leader every month by vote, not only by outbidding them; planning
  gets a vote every month instead of every three; the Governor gets their second power.
- **UBER-AC-8:** `pnpm sim` (politics on, all three seed sets): a law passes in at least half the
  games, and every WS1 check that passes with politics off still passes.
- **UBER-AC-9:** a step in the politics e2e (no new file): the human Governor proposes a land tax of
  10 cr a plot; before voting, each phone shows what it would cost that player; the votes reveal on
  every screen at once; at month end each owner pays 10 cr a plot into the fund and the month report
  shows it.

**S2-2 · The colony fund gets income from the laws the table passes, so the colony has money to build
with (G-5).**
- *Who benefits:* every player as a colonist (G-5's prestige objects are paid from the fund), and the
  Governor, who gets something to spend.
- *Today:* the sales tax is the fund's only income: it nets about 1,300-1,500 cr a game (sales tax
  about 2,100-2,400 minus office pay about 850; WS1 rows, SEAMS 2026-10-28; verified_by: executed).
  How much more 4-5 objects need is WS1's affordability study.
- *Value:* the three taxes become G-5's main income, so G-5's wave 1 can start the day Heiko answers
  the G-5 card; each tax lands in the fund by source, which Heiko's price decisions and the colony
  score read.
- **UBER-AC-10:** in the sim, every game with a tax law in force shows that tax's income in the month
  report, and on the same seeds the fund ends the game higher with the laws on than off.

**Non-goals:**
- Sabotage ban and Sheriff fines: slice 4, with the Sheriff's powers (alone, the ban does nothing;
  D2 option A).
- Windfall tax (D2 option B) and keeping the inert ban in slice 2 (option C): not chosen. Heiko rules
  D2 on the G-5 card; B or C amends these non-goals before the build.
- The Sheriff's part in law taxes and the cap (inspections, "taxed only once inspected", breach fines,
  shutting a plot): slice 4. Until then each tax is charged to every payer and the cap blocks the
  action outright.
- The other six laws: they wait for other lanes' systems (politics spec non-goals).
- Law promises in campaigns and borrowed votes: slice 3 with deal cards (moved from AM-11's "law
  promises with slice 2": a broken promise only costs something once P-2's reputation does).
- Spending the fund (budget lines, projects, prestige): G-5 waves 1-3 and slice 5. The overrule vote
  and no-confidence: slice 5.
- Balance numbers: the settings are design 05's (export 10/20/30 %, land 5/10/20 cr a plot, pollution
  10/20/40 cr an air point, cap at air 40/50/60), into config with units. Clocks and AI weights are
  placeholders; sim tuning and income targets are WS1's affordability study.
- Screens before WS6 mocks them: the hub mock's Law vote and This month's law sections are "soon"
  placeholders; WS6 mocks slice 2a's desks and Heiko approves them before any desk is built.

**Rough cost:** chosen about 4 WS7 PRs + 1 WS1 PR (+ WS6's mock). Thin baseline about 2-3 PRs (§0.1).

## §0.1 · Decision Record `[review-only]`

**Chosen (AM-1, untimed like the election, AM-18): the Governor proposes at any time in planning, and
the next month's planning opens with the law ballot, after the election.** The ballot is untimed and
closes when everyone is Done; the host's Continue moves past absent players; a short presentation
clock reveals the result. Built in `politics.ts` beside the election, weighted with slice 1's
`voteWeight`, stepped by the same server tick and sim loop through one "votes open" seam. Four laws take effect at three
seams: the auction's ship sale (export tax), upkeep (land and pollution tax) and the outfitter
(emission cap). About 4 WS7 PRs + 1 WS1 PR.

**Thin baseline: the Governor sets the law taxes alone, like the sales tax; no vote.** About 2-3 PRs.
*Loses because* P-1 says the colony votes laws and UBER-AC-1's law clause needs a passed vote. Check:
politics spec §0 P-1.

**Alternative timing: the Governor proposes at any moment of planning proper, and the ballot runs
mid-planning.** *Loses because* Ready would change meaning twice inside one planning phase (planning
Ready, then Done for the ballot, then planning Ready again), and the server's ready, away and Continue
handling keys on one window at the start of planning (`apps/server/src/mule-game.ts::MuleGame`,
`electionOpen`). Check: every `electionOpen()` call site in that file.

**Larger: a general council engine for every vote type** (laws, overrule, no-confidence, snap
elections). Rejected again (as in slice 1): slice 5's votes are not designed.

**D2 (Heiko's, on the G-5 card):** A, the three taxes and the emission cap, recommended; B, A plus the
windfall tax (only moves money; one more RULE-43 row and a ship-free seam in the auction); C, keep the
inert ban in slice 2.

## §0.2 · Constraints `[handoff]`

```
HC-40  Every number lives in packages/engine/src/config.ts's POLITICS block, with unit and meaning:
       POLITICS.council (clocks, cap on laws in force, retry months), POLITICS.laws (the catalogue:
       each law's settings, unit and effect data), POLITICS.ai.council (AI weights). No literal in
       rules, AI or server code.                source: PM ruling SEAMS 2026-10-28   breach: fatal
HC-41  packages/engine stays pure. The AI's council draws use their own seeded stream, so no slice-1
       draw moves: slice 1's election fixtures and WS1's politics rows stay as they are until laws
       pass.                                     source: CLAUDE.md, replay           breach: fatal
HC-42  politics:false behaves exactly as today: no council, no laws, no law tax; WS1's politics-off
       sim rows stay byte-identical.             source: politics spec HC            breach: fatal
HC-43  No decision has a clock (AM-18): while the election or the law ballot is open, Ready is Done
       for the stage and only the host's Continue moves past absent players; a reveal is refused
       Continue and runs on its presentation clock.          source: AM-15, AM-18    breach: fatal
HC-44  Every law tax enters the fund through G-5's colony.ts fundIn; nothing else writes
       treasury.money.                           source: G-5 spec §9                 breach: fatal
HC-45  Edits outside WS7's paths are the named edits in §1 only, recorded in SEAMS before the PR.
                                                 source: programme rule              breach: decision
HC-46  No screen before WS6's slice-2a mock is approved by Heiko; the mock is the scaffold.
                                                 source: politics spec non-goals     breach: fatal
```

## §1 · Solution Design `[handoff]`

```
C40 · ADDED · the council: the Governor proposes any time in planning; the next planning opens with the law ballot

today        no council. Planning opens with the election in election months (stage machine
             nominate → ballot → reveal → over); planning proper follows it.
             anchors: packages/engine/src/politics.ts::openPlanning, ::stepElection, ::electionDone,
             ::closeElection, ::voteWeight; packages/engine/src/types.ts::Politics, ::Election;
             packages/engine/src/game.ts::advancePhase
             verified_by: read
tomorrow     MUST accept one pending proposal (enact a law at a setting, change a law's setting, or
             repeal) from the Governor at any time in planning while no vote is open, replaceable or
             withdrawn until the next planning opens (RULE-41). MUST open the law ballot when the
             next planning opens, after the election, if the proposer still governs; it closes when
             every player is Done, then a short reveal (RULE-40). MUST fix the result at ballot
             close (RULE-42); the law takes effect when the reveal ends. MUST export one
             "votes open" view of both votes (votesOpen, votesDone, stepVotes, closeVotes) so the
             server and the sim handle the election and the council through one seam.
logic        → §2 RULE-40, RULE-41, RULE-42 · evaluated at each step and intent · weights bind at
             ballot close · writes state.politics.council, .laws, .failed
seam         packages/engine/src/politics.ts — the sole writer of state.politics (§9 of the
             politics spec); the council reuses its edit() copy-on-write and voteWeight
senior       junior would: a second stage machine in the server, or a council.ts beside politics.ts
             writing state.politics · senior does: one more machine in politics.ts with the
             election's untimed shape (AM-18), and a votes-open facade so the server's
             ready/away/Continue code changes in one place; AM-1's close-at-once covers it too
mechanism    sprout (new functions in politics.ts) + in_place (openPlanning, takeOffice opens the
             council; game.ts advancePhase calls closeVotes for closeElection: WS3 named edit)
call sites   openPlanning: game.ts::createGame, ::advancePhase. closeElection: game.ts::advancePhase
             (→ closeVotes). stepElection/electionDone: apps/server/src/mule-game.ts::MuleGame,
             packages/ai/src/play.ts (→ stepVotes/votesDone). Repo not prism-indexed: grep-built.
pin          slice 1's election tests (packages/engine/test/politics*.test.ts) pass unchanged: the
             election runs exactly as before and the council only opens after it
depends_on   none
atomicity    none
```

```
C41 · ADDED · the three tax laws charge their payers into the fund

today        the sales tax is the only tax: economy.ts::taxSale charges every player sale, at the
             goods auction (packages/engine/src/auction.ts::goodsMarket (its trade)) and the land auction (lots.ts). Upkeep
             pays the offices from the fund (politics.ts::payOffices). Each month's report keeps
             pollutionBy per player and the fund's month-end balance.
             anchors: packages/engine/src/economy.ts::taxSale, packages/engine/src/auction.ts::goodsMarket,
             packages/engine/src/game.ts::advancePhase, packages/engine/src/types.ts::MonthReport,
             packages/engine/src/pollution.ts::runPollution
             verified_by: read
tomorrow     MUST charge the export tax on each unit a player sells to the export ship in the goods
             auction, on top of the sales tax (RULE-43 rows 1-3). MUST charge the land and pollution
             taxes at upkeep, before the offices are paid (RULE-43 rows 4-7). Every charge enters
             the fund through colony.ts fundIn with its source, and counts in treasury.paid.
logic        → §2 RULE-43 · export: at each ship sale · land, pollution: once at upkeep · reads
             POLITICS.laws, state.politics.laws, plotsOwned, this month's report's pollutionBy
seam         politics.ts gains chargeExportTax(state, sellerId, price) and collectLawTaxes(state);
             packages/engine/src/auction.ts::goodsMarket (its trade) calls the first when the buyer is the ship (WS3 named
             edit, one line); game.ts::advancePhase calls the second between runUpkeep and
             payOffices (WS3 named edit, one line)
senior       junior would: a second taxSale variant in economy.ts, or tax code inline in auction.ts
             and upkeep.ts · senior does: the law owns its charge in politics.ts; the two foreign
             files gain one call each; a payer short of money pays what they have and the rest is
             waived (money never goes negative, as in payOffices)
mechanism    sprout + one-line in_place calls (named edits)
call sites   packages/engine/src/auction.ts::goodsMarket (its trade) (ship buyer only); game.ts::advancePhase 'upkeep'.
             lots.ts land sales and the store's surplus to the ship are not exports: no call.
pin          T-AC-44: with no law in force (and politics off) every money total is unchanged
depends_on   C40 (data: laws in force) · G-5 C20 (contract fundIn, stubbable: the sources union
             gains 'exportTax' | 'landTax' | 'pollutionTax')
atomicity    none
```

```
C42 · ADDED · the emission cap refuses new Rare earth mines and smelters while the air is above it

today        any player may outfit any MULE they can pay for; POLLUTION.sources makes rareEarth (4)
             and alloy (3, the smelter) the two outfits that also foul the plots around them.
             anchors: packages/engine/src/game.ts::outfitMule, packages/engine/src/config.ts::POLLUTION
             verified_by: read
tomorrow     MUST refuse outfitting a MULE for an outfit in POLITICS.laws.emissionCap.blocks while
             the cap is in force and the air is above its level, before any money moves (RULE-44).
             MUST export outfitBlocked(state, outfit) so the AI never queues a refused outfit.
logic        → §2 RULE-44 · evaluated at outfitMule · reads state.air, state.politics.laws
seam         new in politics.ts: outfitBlocked; game.ts::outfitMule throws its reason as a RuleError
             (WS3 named edit, two lines); the strategist's outfit loop skips blocked outfits as it
             already skips factories it can't feed (packages/ai/src/strategist.ts, the `canFeed`
             check; WS1 named edit)
senior       junior would: check at installMule, after the player has paid for the outfit, or let
             the AI hit the RuleError · senior does: refuse before payment; air only moves at
             production, so the check at outfit time holds through the install; the strategist asks
             the same predicate where it already drops outfits a hard rule forbids, so the AI never
             plans a refused MULE
mechanism    sprout + in_place guard
call sites   outfitMule: packages/ai/src/play.ts (applyAction 'outfit'), apps/server/src/mule-game.ts
             (the phone's outfit intent)
pin          with no cap in force every outfit behaves as today (existing development tests)
depends_on   C40 (data)
atomicity    none
```

```
C43 · ADDED · what a law would cost each player, before the vote

today        nothing previews a rule change.
             anchors: packages/engine/src/politics.ts::plotsOwned, packages/engine/src/economy.ts::exportDemand
             verified_by: read
tomorrow     MUST compute, for a proposal, each player's estimated monthly cost or effect (RULE-45),
             from public facts only (plots, last month's pollution, stock against the ship's wishlist,
             the air). The view shows it on every phone ("For you: …") and the AI votes on it.
logic        → §2 RULE-45 · evaluated when the proposal is made · recomputed each view
seam         new in politics.ts: lawImpact(state, proposal) → Record<playerId, LawImpact>
senior       junior would: compute costs in the phone and again in the AI · senior does: one engine
             function both read, so the AI votes on exactly what the players see
mechanism    sprout
call sites   apps/server/src/politics-view.ts (view), packages/ai/src/hands/vote.ts (AI)
pin          none, because it is new and read-only
depends_on   C40
atomicity    none
```

```
C44 · MODIFIED · the AI Governor proposes, and every AI seat votes on laws

today        VoteHand runs, votes and sets the tax, keyed on the election's stage; one rng stream.
             anchors: packages/ai/src/hands/vote.ts::VoteHand
             verified_by: read
tomorrow     MUST, as Governor in planning proper (once a month), propose the law that costs the leader most
             against itself, or repeal one, or pass (RULE-46); MUST vote on every law ballot
             (RULE-46); council draws come from a second seeded stream (HC-41).
logic        → §2 RULE-46 · after the seeded pause, once per stage, then Done
seam         packages/ai/src/hands/vote.ts::VoteHand (WS7) — it already owns the AI's politics acts
senior       junior would: draw the proposal from the hand's existing rng and so shift every later
             election draw · senior does: a council rng from (seed, month, seat) so slice 1's
             replays and WS1's rows hold; it reads lawImpact, never its own cost model
mechanism    in_place (VoteHand.tick keys on both votes' stages)
call sites   apps/server/src/mule-game.ts tickVoteHands; packages/ai/src/play.ts planning loop
pin          packages/ai/test vote-hand tests for the election pass unchanged
depends_on   C40, C43 (data)
atomicity    none
```

```
C45 · MODIFIED · the server runs the election and then the council on one tick; two new intents; the view

today        the server ticks the election while electionOpen(); Ready is Done for its stage; away
             seats are marked Done each tick; when it ends, planning proper starts (AM-15: no
             clock). Intents run, vote, setTax.
             anchors: apps/server/src/mule-game.ts::MuleGame, packages/protocol/src/index.ts::MuleIntent,
             ::MuleView, apps/server/src/server.ts::isIntent, apps/server/src/politics-view.ts::politicsView
             verified_by: read
tomorrow     MUST tick both votes through the engine's votesOpen/stepVotes/votesDone (so Ready,
             away seats, checkAllReady and the host's Continue treat the council exactly as the
             election: HC-43). MUST accept intents propose and voteLaw. MUST send the council in
             the politics view: stage, clock, proposal, every player's impact, the viewer's own
             ballot only, totals at the reveal, laws in force and the retry months (RULE-47).
logic        → §2 RULE-40, RULE-47
seam         mule-game.ts's electionOpen() body becomes votesOpen(state) and the tick calls
             stepVotes/votesDone (WS3 named edits); intents in protocol and server.ts (WS3 named
             edits); politics-view.ts (WS7)
senior       junior would: a second tick and a second "open" flag in the server · senior does: the
             engine owns "is the colony voting", so WS3's Continue refusal and Ready routing cover
             the council with no new branch
mechanism    in_place
call sites   every electionOpen() use in mule-game.ts (ready, connectionChanged, checkAllReady,
             enterPhase, the tick, aiAct's done, viewFor's isReady); WS3's continuePlanning
pin          apps/server/test/politics.test.ts's election rows pass unchanged
depends_on   C40, C43 (contract, stubbable from §3)
atomicity    none
```

```
C46 · MODIFIED · the Governor's law picker, the law ballot and the TV reveal

today        the Governor desk sets the tax; the council desk shows vote weights; the TV shows the
             election. The hub mock has "soon, slice 2" placeholders: law-vote (Council) and
             gov-law (Governor).
             anchors: apps/web/src/phone/hub/politics/Governor.tsx, apps/web/src/phone/hub/politics/Council.tsx,
             apps/web/src/table/TvElection.tsx, design/mocks/ws6-ux/src/screens/PlanningHub.tsx
             verified_by: read
tomorrow     MUST render WS6's approved slice-2a mock: the picker (law, setting, replaces when three
             are in force, repeal), the ballot with "For you" and Yes/No, laws in force, the TV
             reveal with totals.
ux           mock: WS6 to make (starting from PlanningHub.tsx's law-vote and gov-law sections at
             ws6-ux 02752f7) · GRAFT TARGET: Governor.tsx, Council.tsx, a TV council panel beside
             TvElection.tsx
seam         the hub's politics desks (WS7)
mechanism    fill_scaffold
pin          politics-desks.test.ts's slice-1 rows pass unchanged
depends_on   C45 (contract), WS6's approved mock
atomicity    none
```

```
C47 · MODIFIED · the sim plays the council and reports laws and their income (WS1)

today        play.ts loops stepElection while the election is open, then plans the month.
             anchors: packages/ai/src/play.ts, packages/ai/src/actions.ts
             verified_by: read
tomorrow     MUST loop stepVotes while votesOpen, route propose/voteLaw actions, and add to the
             politics row: laws passed per game and the fund's income by tax (C20's ledger), with
             UBER-AC-8 and UBER-AC-10's checks.
seam         WS1's play.ts, actions.ts, sim report (WS1 PR)
mechanism    in_place
pin          politics-off rows byte-identical (HC-42)
depends_on   C40, C44, G-5 C20
atomicity    none
```

**Reuse checks (self-review check 6, grep; the repo is not prism-indexed):**
- C40, C41: `git grep -niE '\blaws?\b|council' packages/*/src apps/server/src` → nothing. Nearest
  neighbours: the election machine (C40 reuses its shape, edit() and voteWeight) and
  `economy.ts::taxSale` (WS1's; C41 calls its own charge beside it instead of a taxSale variant, so the
  law owns its rule).
- C42: `git grep -niE 'outfitAllowed|canOutfit|blocked|forbid' packages/engine/src packages/ai/src` →
  only strategist.ts's "drops the ones a hard rule forbids": its outfit loop is where C42's AI check
  goes. No engine-side outfit guard exists.
- C43: `git grep -niE 'preview|impact|wouldCost' packages/engine/src apps/server/src packages/ai/src` →
  nothing.

## §2 · The Logic `[handoff]`

```
RULE-40 · The law ballot (AM-1: untimed, AM-18)                 shape: state machine

proposal  pending from the moment the Governor proposes (RULE-41) until the next planning opens;
          public, with RULE-45's preview, all that time. A new Governor drops the old one's.
opens     when the next planning opens, after the election (if any) is over, if a proposal is
          pending and its proposer still governs; politics on. Otherwise council = null.
stages    ballot (untimed) → reveal (POLITICS.council.revealMs, presentation only) → over

  from      event                                        to
  ballot    every player Done (a cast ballot is Done),   reveal (RULE-42 fixes the result; the
            or the host's Continue                       humans not Done abstain, named in the news)
  reveal    the clock ends                                over (a passed law takes effect)
  any open  the game leaves planning (AM-1's case)         ballot: tally now; reveal: take effect

Done      'ready' while the ballot is open is Done for it; the Governor's ballot starts as yes.
away      not Done by being away (HC-43); the host's Continue moves past them.
continue  refused in the reveal ("The result is being announced").
examples  month 2: Lena (Governor) proposes land tax 10 → month 3 planning opens with its ballot →
          all vote → reveal → in force · month 3: Lena proposes, month 4's election makes Kai
          Governor → the proposal is dropped · Leo's phone drops in the ballot → the host continues
```

```
RULE-41 · A proposal is valid                                   shape: decision table

inputs    actor (Governor | other) · stage (propose | other) · kind (enact | repeal)
          law ∈ POLITICS.laws keys (exportTax, landTax, pollutionTax, emissionCap)
          setting ∈ that law's settings · inForce (law's current setting | none)
          count (laws in force, 0..maxInForce) · replaces (law id | none)
          retry: state.politics.failed[kind:law] = month it failed | none
first match wins
  #   when                                                     then
  1   a vote is open (election or law ballot), or not planning refuse "Propose once the votes are over"
  2   actor ≠ Governor                                         refuse "Only the Governor proposes a law"
  3   law not a key of POLITICS.laws                           refuse "That law is not in the colony's book"
  4   failed[kind:law] = m and month ≤ m + retryMonths         refuse "That proposal failed in month m; it can come back in month m+retryMonths+1"
  5   repeal, inForce none                                     refuse "That law is not in force"
  6   repeal                                                   valid
  7   enact, setting not in settings                           refuse "<Law> is set to <settings>"
  8   enact, inForce = setting                                 refuse "That law is already in force at that setting"
  9   enact, inForce ≠ none (a new setting)                    valid (replaces ignored; count unchanged)
  10  enact, count < maxInForce                                valid
  11  enact, count = maxInForce, replaces in force             valid
  12  otherwise                                                refuse "Three laws are in force: pick the one this replaces"
unknown   failed has no entry → never failed (no retry wait). No Governor → no proposal.
pending   a valid proposal replaces the pending one; propose(null) withdraws it.
examples  land tax 10 at 0 laws → valid · land tax 15 → row 7 · repeal of a law not in force → row 5 ·
          a fourth law without replaces → row 12 · land tax failed in month 2, proposed in month 4
          with retryMonths 2 → row 4 ("can come back in month 5")
```

```
RULE-42 · The ballot's result                                   shape: decision table

inputs    each player's ballot ∈ yes | no | none (none = abstain); weights from voteWeight at close
          yes = Σ weight of yes · no = Σ weight of no · the Governor's ballot (starts yes)
  #   when                                then
  1   yes > no                            passes
  2   yes < no                            fails
  3   yes = no, Governor's ballot yes     passes (the Governor breaks ties)
  4   yes = no, Governor's ballot no      fails
outcome   passes: enact → laws[law] = { setting, since: month }, replaces removed; repeal → law removed.
          fails: failed[kind:law] = month. The result (passed, yes, no, tie) is public at the reveal;
          who voted how stays secret (as RULE-9: totals only).
examples  4 yes vs 3 no → passes · 3-3, Governor yes → passes · 2 yes vs 5 no → fails, retry month+3
```

```
RULE-43 · The law taxes                                         shape: decision table (per payer)

inputs    laws in force (POLITICS.laws settings) · the sale (seller, price, buyer) · plotsOwned ·
          this month's report's pollutionBy[payer] (0 if absent) · payer's money
  #   law             when                                   charge (into fund, source, + treasury.paid)
  1   exportTax r %   a player sells a unit to the export ship  round(price × r / PERCENT), after the sales tax, from the sale
  2   exportTax       a sale to the store or another player   none
  3   exportTax       the store's surplus to the ship (upkeep) none (no player sells)
  4   landTax s       upkeep                                 min(money, s × plotsOwned)
  5   pollutionTax s  upkeep                                 min(money, round(s × pollutionBy))
  6   any             politics off or law not in force       none
  7   upkeep order    land, then pollution, seat order, after runUpkeep and before payOffices
unknown   no report this month → pollutionBy 0. The unpaid part of rows 4-5 is waived, not a debt.
examples  land tax 10, Ossa owns 7 plots and has 500 → pays 70 · has 40 → pays 40, 30 waived ·
          export tax 20 %, a 100 cr unit to the ship with 5 % sales tax → seller gets 75
```

```
RULE-44 · The emission cap                                      shape: decision table

inputs    cap in force at level L (40 | 50 | 60) | none · state.air (0..POLLUTION.airMax) ·
          outfit ∈ Outfit · blocks = POLITICS.laws.emissionCap.blocks (rareEarth, alloy)
  #   when                                       then
  1   no cap in force                            allowed
  2   outfit not in blocks                       allowed
  3   air ≤ L                                    allowed
  4   air > L                                    refused before payment: "The emission cap stops new
                                                 <Rare earth mines | smelters> while the air is above L (now A)"
examples  cap 50, air 55, rareEarth → refused, money unchanged · air 50 → allowed · cap 50, air 55,
          food → allowed
```

```
RULE-45 · What a law would cost (the preview)                    shape: formula per law

landTax s       s × plotsOwned(player)                                   cr a month
pollutionTax s  s × last report's pollutionBy[player] (0 before month 1's production)  about, cr a month
exportTax r     r % × Σ over goods the ship wants (ship.hold > 0): stock[g] × offWorld[g]   cr, if sold to the ship
emissionCap L   { blocks now: air > L; the player's plots outfitted rareEarth or alloy } → cost =
                that count × POLITICS.ai.council.capPlotCost (cr-equivalent, for the AI only)
repeal          the same numbers as savings
```

```
RULE-46 · The AI's council acts                                  shape: decision table

propose (the AI Governor, once a month in planning proper, after a seeded pause from the council stream)
  candidates  enact each law not in force at its middle setting and not waiting (RULE-41 row 4),
              plus repeal each law in force; leader = the other player with the highest score()
  gain(c)     cost(leader) − cost(self) for enact; cost(self) − cost(leader) for repeal (RULE-45)
  1   best gain ≥ POLITICS.ai.council.minGap and chance(proposeChance[persona])   propose the best
  2   otherwise                                                                 Done (no law)
  a fourth law names as replaces the law in force that costs self the most
vote (every AI seat with a ballot)
  1   self is the Governor                        yes (keeps its proposal)
  2   enact landTax and self is the Land Baron     no (design 05: the Baron always fights a land tax)
  3   Rookie                                      seeded coin from the council stream
  4   enact: cost(self) ≤ median cost of all players   yes, else no
  5   repeal: cost(self) > median cost              yes, else no
```

```
RULE-47 · Who sees what of the council                           shape: decision table

  item                        who
  stage, clock, proposal      every screen
  each player's impact         every screen (public facts)
  a ballot                    its voter only, until the reveal; never afterwards
  yes / no totals, passed     every screen, from the reveal
  laws in force, retry months  every screen (board key allow-list, as HC-2)
```

## §3 · Contracts & Data Models `[handoff]`

- **Engine (ADDED, not breaking; C40):** `type LawId = 'exportTax' | 'landTax' | 'pollutionTax' |
  'emissionCap'`; `type LawProposal = { kind: 'enact'; law: LawId; setting: number; replaces?: LawId }
  | { kind: 'repeal'; law: LawId }`; `interface Council { stage: 'ballot' | 'reveal' |
  'over'; clockMs: number /* the reveal's only */; proposal: LawProposal; ballots: Record<string, boolean>; done:
  string[]; result: { passed: boolean; yes: number; no: number; tie: boolean } | null }`; `Politics`
  gains `proposal: { by: string; month: number; proposal: LawProposal } | null` (pending),
  `council: Council | null`, `laws: Partial<Record<LawId, { setting: number; since: number }>>`,
  `failed: Record<string, number>` (key `kind:law`). `types.ts` is WS3's: named edit.
- **Fund sources (MODIFIED, G-5 C20's union):** + `'exportTax' | 'landTax' | 'pollutionTax'`.
- **Protocol (ADDED, not breaking; C45; WS3 named edits):** intents `{ type: 'propose'; proposal:
  LawProposal }` and `{ type: 'voteLaw'; yes: boolean }`; the politics view gains `council` (RULE-47
  shape, ballots replaced by `myBallot`) and `laws`, `retry`; the board's key allow-list gains them.
  Example: `{ type: 'propose', proposal: { kind: 'enact', law: 'landTax', setting: 10 } }`.
- **Config (ADDED; HC-40):** `POLITICS.council = { revealMs /* presentation */, maxInForce: 3,
  retryMonths: 2 }`; `POLITICS.laws = { exportTax: { settings: [10, 20, 30] /* % of a ship sale */ },
  landTax: { settings: [5, 10, 20] /* cr a plot a month */ }, pollutionTax: { settings: [10, 20, 40]
  /* cr an air point */ }, emissionCap: { settings: [40, 50, 60] /* air level */, blocks: ['rareEarth',
  'alloy'] } }`; `POLITICS.ai.council = { minGap, proposeChance per persona, capPlotCost }`.

## §4 · Failure & Ops `[handoff]`

No external dependency: the council, the laws and the AI are in-process and seeded. Races: intents and
the tick run on the server's one event loop, as the election's do. Idempotency: a second proposal is
refused (RULE-41 row 1); a second ballot replaces the first until the stage ends. When the council is
broken, politics:false still plays the whole game (HC-42). An operator sees it work in the month
report's ledger (law income by source) and the news line at each reveal.

## §5 · Delivery `[handoff]`

Code-only; no existing state to reach: games live in server memory and the sim is fresh per run.

## §6 · Acceptance Criteria `[handoff]`

| id | Given / When / Then | changes | observed_at |
|---|---|---|---|
| B-AC-40 | Given Lena is Governor in month 2 with two phones and AI seats · When she proposes a land tax of 10 · Then every phone shows its own cost before voting, the ballots close, and every screen shows the totals and the law in force at the same moment | C40, C43, C45, C46 | the phones and the TV (a step in e2e/politics.ts, UBER-AC-9) |
| B-AC-41 | Given a land tax of 10 in force · When the month ends · Then each owner pays 10 a plot (what they have, at most) into the fund and the report shows the land tax income | C41 | players' money and the report's ledger (engine test; e2e step) |
| B-AC-42 | Given an emission cap of 50 and air 55 · When a player outfits a Rare earth MULE · Then it is refused with the cap's message and their money is unchanged; at air 50 it is allowed | C42 | the RuleError message and player state (engine test) |
| B-AC-43 | Given an open law ballot · When a human has not voted · Then nothing closes, however long; the host's Continue closes it and the news names them; in the reveal Continue is refused | C45 | server state and news (server test) |
| T-AC-40 (serves B-AC-40) | each RULE-41 row's verdict and message | C40 | engine |
| T-AC-41 (serves B-AC-40) | each RULE-42 row; ties go to the Governor's ballot | C40 | engine |
| T-AC-42 (serves B-AC-41) | a ship sale pays sales + export tax; a store sale pays sales tax only (RULE-43 rows 1-2) | C41 | the seller's money after the auction trade |
| T-AC-43 (serves B-AC-41) | the pollution tax uses this month's pollutionBy; a short payer pays what they have and never goes below 0 | C41 | engine |
| T-AC-44 (serves all) | politics off: no council, no law tax, WS1's politics-off rows byte-identical | C40-C42 | sim report diff |
| T-AC-45 (serves B-AC-40) | the AI's council draws leave slice 1's election fixtures unchanged | C44 | ai tests |
| T-AC-46 (serves B-AC-40) | the game leaves planning with the council open: a ballot is tallied, a proposal-less council ends with no law | C40 | engine |
| T-AC-47 (serves UBER-AC-8, -10) | the sim's politics row prints laws passed and law income by source and checks both proofs | C47 | `pnpm sim` |
| T-AC-48 (serves B-AC-42) | the strategist never plans a blocked outfit | C42 | ai test |
| T-AC-49 (serves B-AC-40) | lawImpact gives RULE-45's number for each law and for a repeal, from public facts only | C43 | engine |
| T-AC-50 (serves UBER-AC-8) | the AI Governor proposes and every AI seat votes per RULE-46's rows (the Baron against a land tax; the median rule) | C44 | ai test |
| T-AC-51 (serves B-AC-40) | each screen's view follows RULE-47: a ballot only to its voter, totals from the reveal, laws in force on the board | C45 | the views a phone, the TV and the board receive (server test) |

negative cases: a non-Governor proposal (T-AC-40 row 2); a store sale under the export tax (T-AC-42);
food under the cap (B-AC-42). Invariant: money never goes below 0 from a law tax; nothing writes
treasury.money but colony.ts.

## §7 · Risks & Spikes `[review-only]`

- **AI seats never pass a law, so UBER-AC-8 fails.** Mitigation: RULE-46 makes the AI Governor
  propose when it gains; WS1 tunes POLITICS.ai.council in its PR (T-AC-47 is the gate).
- **Election months get long** (election + law ballot). Mitigation: both ballots end the moment
  everyone is Done; only the reveals are clocked, and briefly.
- **The AI loops on a refused outfit.** Mitigation: outfitBlocked shared with the strategist's
  outfit loop (C42, T-AC-48).
- **Seeded draws shift WS1's rows.** Mitigation: HC-41's own council stream (T-AC-45).
No spike needed.

## §8 · Amendments `[review-only]`

```
AM-1 · 2026-10-28 · PM (confirming the untimed election's §8 note; Heiko may overrule) · before build

target    §0.1 chosen, §0.2 HC-43, §1 C40, §2 RULE-40, RULE-41 row 1, §3, §6 B-AC-43
said      a clocked council at planning open: propose (clock) → ballot (clock) → reveal
did       Heiko's "not time bound" (AM-18) applied to law votes: the Governor proposes at any time
          in planning (pending, public, replaceable); the next planning opens with the law ballot,
          after the election, untimed (closes when everyone is Done; the host's Continue for absent
          players), then a short presentation reveal. proposeMs and ballotMs leave POLITICS.council.
because   S2-1: the table votes laws only if everyone can take part; the same reason as AM-18
goal      S2-1 — still met; a month for diplomacy on each proposal
folded    §0.1, HC-43, C40, RULE-40, RULE-41, §3, B-AC-43; RULE-46's propose rows now run in
          planning proper (once a month, after the seeded pause), not in a propose stage
```

## §9 · Ownership Boundaries `[handoff]`

No ownership change: `packages/engine/src/politics.ts` remains the sole writer of `state.politics`,
now including the council, the laws and the retry months; G-5's `colony.ts` remains the sole fund
writer (law taxes call fundIn). The named edits in §1 add calls, not writers.
