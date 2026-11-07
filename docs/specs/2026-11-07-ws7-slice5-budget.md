# WS7 politics · slice 5: the Governor's budget, the overrule vote and the colony's projects

Programme amendment to `docs/specs/2026-10-22-ws7-politics.md` (D1 slice 5, AM-13) · WS7 design writer ·
2026-11-07 · class: **Programme** (a cross-component contract over engine, AI, protocol, server and
screens; about 9 PRs in 5 lanes). **Status:** draft for WS7's self-review and merge into the 7 Nov amendment
set (slices 3, 4 and 5); Heiko rules the four decisions in §0.3 in one sitting with the other two slices.
Base: `origin/feat/strategist` 52c54b07.

Ids carry the slice prefix so the three parallel specs never collide: goal **S5-1**, proofs
**S5-UBER-AC-1..2**, constraints **S5-HC-1..**, changes **S5-C1..**, rules **S5-RULE-1..**, ACs
**S5-B-AC-n / S5-T-AC-n**, decisions **D-S5-n**.

Composes with, and does not replace: G-5 (`docs/specs/2026-10-28-g5-colony.md`: the fund's ledger
RULE-27, the project pipeline RULE-21, the reserve, pace set C AM-19, the strike pay-off RULE-26, the mood
RULE-20) and slice 2a (`docs/specs/2026-10-28-ws7-slice2a-council.md`: the votes-open seam, the law
ballot's untimed ballot and its reveal).

---

## §0 · Business Goals & Value `[handoff: goal line and proofs]` `[review-only: who / today / value / cost]`

Provenance: Heiko's ruling of D1 on 2026-10-22 ("(5) the budget lines, the overrule vote and the inquiry"),
AM-13 on 2026-10-28 ("the colony budget is a separate pot filled from taxes, fines and the like; the
Governor spends it on community projects"), and his 2026-11-07 ruling that the first release candidate has
all of politics, slices 3, 4 and 5, "with computer players that use them". It serves Mission Goal G-4: "The
table plays politics - pacts, whispers, sabotage, elections, a Governor and a Sheriff, laws and taxes - and
it changes the game", whose proof is "sim with AI elections and laws, balance checks hold; e2e with
whispers, a deal card and a vote".

**S5-1 · The Governor decides where the colony's money goes each month, and the table can overrule a
Governor it disagrees with; computer players do both.**

- *Who benefits:* every player. The Governor gets a real spending choice (buildings, the Sheriff's
  militia, help for whoever is last); the player in last place gets help the rules guarantee, not a
  favour; the rest of the table gets a monthly way to stop a Governor without waiting up to three months for
  the next election.
- *Today:* the Governor's only spending choice is which building to commission
  (`packages/engine/src/colony.ts::commission`). Everything else is automatic: at each upkeep
  `colony.ts::runColony` pays every commissioned building all the fund holds above `COLONY.reserve`. The
  money mostly sits. Measured on trunk 52c54b07 (verified_by: executed, 40 games: seeds 1-20 and 101-120, four
  Trader seats, politics on, `playGame` + `simSeats`, summing each `MonthReport.ledger`):

  | per game | seeds 1-20 | seeds 101-120 |
  |---|---|---|
  | money into the fund (median) | 7,891 cr | 7,653 cr |
  | money out of the fund (median) | 1,504 cr | 1,405 cr |
  | fund at game end, min / median / max | 2,607 / 6,252 / 7,948 cr | 3,987 / 6,277 / 7,780 cr |
  | buildings standing at game end (mean) | 0.80 | 0.90 |
  | months with the fund under 300 cr (median) | 1 | 1 |
  | buildings still open at game end | 26, every one `commissioned` | 25, every one `commissioned` |

  Every open building at game end has its credits and waits for goods (G-5 AM-19: "goods block it"). So
  about 6,000 cr a game is idle. Heiko's "grant 200 now" (7 Nov, PR #633) takes about 600 cr a game off
  the income, which leaves about 5,400 idle. And no player can challenge the Governor's tax: a Governor who
  raises it from 5% to 10% keeps it until the next election (`politics.ts::setSalesTax`; nothing calls a
  vote on it).
- *Value:* the fund's idle money does something every month that the table can see and argue about. The
  Sheriff's job (slice 4) gets a budget behind it. The last-placed player gets a catch-up. Every month
  there is a public moment where the table can rein in the Governor, as the council reins in a runaway
  leader (05-colony-politics, "The colony can push back"). Two overrules in one term bring a snap election
  (D-S5-3).
  Rough worth: about 5,400-6,000 cr a game of idle fund put to visible use, one public vote a month, and
  a Sheriff (slice 4) whose powers scale with money the table can see.
- **S5-UBER-AC-1** (sim; G-4's "sim with AI elections and laws, balance checks hold"): `pnpm sim` with
  politics on, on every seed set WS1's politics rows use, prints a budget-and-overrule row. In at least half the games an AI
  Governor runs a budget line above 0 for at least one month. In at least a quarter of the games an AI seat
  calls an overrule vote, and at least one overrule passes in each set. Buildings standing per game stay
  within 0.2 of the same seeds run with every line's maximum at 0 (`--set POLITICS.budget.welfare.max=0
  --set POLITICS.budget.security.max=0`). The lowest colony fund is 0 or more. Every WS1 check that passes
  with politics off still passes.
- **S5-UBER-AC-2** (e2e; G-4's "e2e with … a vote"): a step in `apps/web/e2e/politics.ts` with two phones
  and AI seats. Lena, the human Governor, sets Welfare to 100 and presses Ready. Brix calls an overrule
  vote on the budget. When planning ends, both phones show the overrule ballot, and the AI seats cast
  theirs without an API key. Both humans cast. Every screen shows the totals and "Overruled" at the same
  moment. At the month end, every screen shows a Welfare line of 0 and no Welfare payment.

**Non-goals** (each needs its own spec, or waits for another system):
- **The Reserve and Environment lines** (design 05). The Reserve's emergency imports buy goods off-world
  for the fund. Heiko ruled "no import" for the fund's buildings on 2026-11-06 (G-5 AM-17), and topping
  up the store's capital is WS1's store. Environment is option B of D-S5-1. It is cheap to build
  (`packages/engine/src/pollution.ts::cleanAir` exists) but moves the colony score's environment term and
  the pollution laws' bite, so it needs its own sim row.
- **The Sheriff's inquiry and the no-confidence vote** (D-S5-4, recommended out). In RC nothing the
  Governor funds lands on anyone's plots: buildings stand on the colony's own grounds (G-5 C48), Welfare
  goes to a player chosen by rule (S5-RULE-4), and the Sheriff places the guards.
- **Design 05's protective projects** (reservoir, levee, defence battery …) and the "start a project"
  power. RC's projects are G-5's prestige buildings, commissioned through `colony.ts::commission` as
  today.
- **Overruling a commission.** Design 05 lists "Start a colony project" as overrulable. G-5 has no
  cancel for a commissioned building (RULE-22: "There is no cancel"), so an overrule would need one. In RC
  the overrule targets the tax and the budget only, and a commission is the Governor's alone, as today.
- **The Governor ordering which building is funded first.** Commission order stays (G-5 RULE-21 row 3).
- **Welfare as "a free MULE outfit"** (design 05's second form). It needs a development hook; Welfare is
  credits only.
- **The Sheriff's powers.** Slice 4 designs them. This slice hands slice 4 one number, the Security line
  (§3, "Hooks for slice 4").
- **Budget promises on deal cards and borrowed votes.** These belong to slice 3. If slice 3 adds borrowed
  votes to `politics.ts::voteWeight`, the overrule tally counts them with no change here.
- **Smart seats' budget and overrule decisions through WS2's brain port.** RC's computer players use code
  hands that need no API key.
- **Tuning.** Every number is a named placeholder. WS1's G-5 C29 tunes them at the end (G-5 HC-25), and
  the money-moving ones go to Heiko (politics D3).
- **Screens before WS6 mocks them.**

**Rough cost:** the chosen design is about 9 PRs: WS3 1 contract + 1 server, WS7 3 (engine, AI hands,
views + desks), WS1 1, WS4 1 small, plus WS6's mocks. That is about 4 build days with five lanes in
parallel after the contract commit (§10). The thin baseline is about 3 PRs (§0.1).

### §0.1 · Decision Record `[review-only]`

**Chosen: two budget lines plus "the rest to buildings", and an overrule vote held as planning ends.**
- The Governor sets Welfare and, once slice 4 elects a Sheriff, Security, in credits a month.
- The lines stand from month to month, like the tax.
- At upkeep the lines are paid after office pay and the buildings' upkeep, before any new building
  funding. Buildings get the rest.
- Any player but the Governor may call one overrule vote a month, on the tax or the budget, once either
  differs from where the month began. The call freezes both settings.
- The ballot opens when planning would end. It reuses the law ballot's shape: untimed, Ready is "cast",
  totals at a short reveal, nothing sold or spent yet. A yes majority of all vote weight puts last month's
  setting back.
- Two passed overrules in a term call a snap election for next month.

About 9 PRs (§10).

**Thin baseline: a Welfare line only, and the overrule as one more ballot when next month's planning
opens** (the law ballot's slot, `politics.ts::openCouncil`). About 3 PRs.
- *It loses because* the overrule could never undo a budget. The lines are paid at upkeep
  (`game.ts::advancePhase` 'upkeep' calls `runColony` before the next planning opens), so a vote in month
  m+1 finds month m's money already spent. A tax raised in planning m has already taxed month m's
  auctions. Design 05's promise, "the previous month's settings stay", cannot hold. Check: the order of
  the `upkeep` and `planning` branches in `advancePhase`.

**Alternative timing: the overrule ballot opens the moment it is called, mid-planning.**
- *It loses because* Ready would change meaning twice inside one planning phase: planning's Ready, then
  the ballot's Cast, then planning's Ready again. The server routes Ready on one window
  (`apps/server/src/mule-game.ts::MuleGame` case 'ready': `if (this.electionOpen()) votesDone(…)`). Slice 2a
  rejected the same shape for the law ballot for the same reason. Held at planning's end, Ready changes
  meaning once: "I am done planning", then "cast my ballot", then the phase moves on.

**Alternative: a Projects slider (a cap on what buildings get).**
- *It loses because* a cap only saves money that no rule then spends. 40 measured games end with 2,600 to
  7,900 cr unspent. The things a Governor might save for (a strike pay-off at 250, a repair at 150-500)
  are paid in planning, before the next upkeep, from the same fund.

**Larger: all five lines, the inquiry and the no-confidence vote.**
- *It loses because* the inquiry has nothing to find in RC (non-goals). Reserve imports reverse Heiko's
  6 Nov "no import". Environment is a balance question about the colony score, which goes to Heiko
  separately (D-S5-1 B).

### §0.2 · Constraints `[handoff]`

```
S5-HC-1  packages/engine stays pure: no I/O, no Date.now, no Math.random. Welfare's tie lot and every AI
         draw for the budget and the overrule come from their own seeded streams, so no election, council
         or event draw moves.                    source: CLAUDE.md, politics HC-1, slice 2a HC-41   breach: fatal
S5-HC-2  Every number lives in config.ts: the budget and the overrule in POLITICS (POLITICS.budget,
         POLITICS.overrule, POLITICS.ai.budget, POLITICS.ai.overrule), Welfare's mood weight in HAPPINESS
         (WS1's numbers). Each has its unit and a one-line meaning, and each is named a placeholder.
                                                  source: CLAUDE.md, politics HC-2, G-5 HC-20, HC-25   breach: fatal
S5-HC-3  Money moves only by rule (HC-3). Welfare goes from the fund to the player the rule names
         (S5-RULE-4), never to a player the Governor picks, and never to the Governor. A deal card can't
         move it.                                 source: politics HC-3, 00-concept "No direct trading"   breach: fatal
S5-HC-4  A seat sees only what a human in that seat would see. Overrule ballots are secret until, and
         after, the reveal (totals only). observe() hides other seats' overrule ballots.
                                                  source: politics HC-4   breach: fatal
S5-HC-5  politics:false behaves exactly as today: no budget, no overrule, no Welfare. WS1's politics-off
         sim rows stay byte-identical. With every line at 0 and no overrule called, runColony pays exactly
         what it pays today.                      source: politics HC, G-5 HC-22   breach: fatal
S5-HC-6  Every fund write goes through colony.ts (fundIn/fundOut). The lines are new FundLine values,
         never a direct write to treasury.money.  source: G-5 §9, slice 2a HC-44   breach: fatal
S5-HC-7  No decision has a clock. The overrule ballot waits for every player's Cast, or the host's Continue.
         Only its reveal is clocked.             source: AM-15, AM-18, slice 2a HC-43   breach: fatal
S5-HC-8  Rules throw RuleError in the words a player sees; the server turns them into messages.
                                                  source: CLAUDE.md, politics HC-5   breach: fatal
S5-HC-9  The lines move money: they ship with sim rows on both seed sets and go to Heiko for his OK.
                                                  source: politics D3, HC-7   breach: decision
S5-HC-10 Edits outside WS7's paths are the named edits in §1 and §3.3's table, recorded in SEAMS before the
         PR. No screen is built before Heiko approves WS6's mock.   source: programme rule, politics non-goals   breach: decision
```

### §0.3 · Decisions for Heiko `[review-only]`

Each decision leads with what the table will see. Everything else in this spec I decided as WS7's
designer; the reason is recorded where the rule is.

**D-S5-1 · Which budget lines does the release candidate have?** *At the table:* the Governor's phone
has a slider for each line, with what it buys ("Welfare 100 cr: to Kai, last on Worth"), and a line that
says buildings get the rest. The TV shows the split in planning; the month end shows what each line paid.
- **A (recommended): Welfare and Security; buildings get the rest.** Security appears only once slice 4
  elects a Sheriff, and pays the Sheriff's guards.
  - *For:* the smallest set that still gives a real three-way choice (buildings, the militia, help for the
    last player). Neither line moves a colony-score term other than the fund's own wealth. Fits a 4-day
    build.
  - *Against:* there is no direct way to spend the fund on cleaner air.
- **B: A plus Environment.** Each 100 cr lowers the air gauge by a few points
  (`pollution.ts::cleanAir`).
  - *For:* a direct trade-off between two colony-score terms, prestige and environment. Cheap to build.
  - *Against:* about 6,000 idle credits a game could pin the air near clean every month. That moves the
    colony score's environment term (100 cr a point) and blunts the emission cap and the pollution tax. It
    needs its own sim row before you see numbers.
- **C: all five lines** (plus Reserve). *Against:* Reserve imports reverse your 6 Nov "no import" ruling
  for the fund. About +2 PRs in WS1's store.

**D-S5-2 · When is the overrule vote held?** *At the table:* someone calls "Overrule the budget!". Their
name and the target show on every screen. The vote itself happens:
- **A (recommended): as planning ends.** Once everyone is Ready, every phone shows the overrule ballot,
  the TV shows who has voted, and the result is revealed on every screen at once, before the land grant.
  An overrule puts last month's setting back before anything is sold or spent.
  - *For:* design 05's "the previous month's settings stay" holds exactly. One ballot at a predictable
    moment.
  - *Against:* planning gets one more short ballot in months with a call.
- **B: when next month's planning opens,** beside the law ballot.
  - *For:* reuses the law ballot's slot with less server work.
  - *Against:* it can only restore from then on. This month's tax has already taxed the auctions, and the
    budget has already been paid.

**D-S5-3 · Does a second overrule in a term call a snap election?** *At the table:* "Overruled twice:
snap election next month" on every screen. The next planning opens with an election as in months 1, 4, 7
and 10.
- **A (recommended): yes.** A re-elected Governor continues their term: no extra term score, and the
  two-terms limit does not tick.
  - *For:* it is what makes the overrule matter to the Governor.
  - *Against:* about 1 PR of election work (politics.ts) and one more ceremony in a game.
- **B: no snap elections in RC.** An overrule only undoes the setting.

**D-S5-4 · The Sheriff's inquiry into the Governor.** *At the table:* the Sheriff could open an inquiry
once a term; a no-confidence vote follows if the Governor spent "mostly for their own plots".
- **A (recommended): out of RC.** Nothing the Governor funds in RC lands on a plot (non-goals), so an
  inquiry would always find nothing.
- **B: in,** as a no-confidence vote the Sheriff may call once a term. *Against:* a vote whose trigger
  can never be true in RC.

---

## What the table sees `[handoff]`

The screens are the hub's desks on each phone, the TV's planning panels and the month end. The laptop is
the phone app at desk width, so it shows the same desk as that player's phone. WS6 mocks every layout
below; this lists only what each screen shows and where (§1's `ux` fields say "mock: WS6, to come").

| Moment | Governor's phone | Every other phone | TV |
|---|---|---|---|
| **1 · Planning, the Governor sets the budget** (once the month's votes are over) | **P12 Governor desk** (beside the tax): a stepper per line offered (Welfare; Security once a Sheriff exists) in steps of `POLITICS.budget.step`. Each line shows what it buys now ("to Kai, last on Worth"; slice 4 adds "3 guards"). Read-only: "Buildings get the rest: about N cr at today's fund". Set. | **P13 Council desk:** the budget as set, each line marked if it changed this month ("Welfare 0 → 100"). | **P14** planning header, under the Governor's promise line (TvGovernorPromise's place): "Budget: Welfare 100 → Kai · Security 0 · buildings get the rest", changes marked. |
| **2 · A player calls an overrule** | The tax and budget controls turn read-only: "Frozen: Brix called an overrule vote on the budget, held as planning ends". | **P13:** the caller sees "You called it" and Withdraw. Everyone else sees the call. The "Call an overrule vote" button disappears (one call a month). | **P14:** a banner "Brix calls an overrule vote on the Governor's budget". The news line. |
| **3 · Planning ends: the overrule ballot** | **P13 overrule ballot**, same as every phone. The Governor's ballot starts at No. | **P13 overrule ballot:** "Undo the Governor's budget?". Last month vs now, line by line (or the tax: "5% → 10%"). Yes / No, "needs N of M votes", Cast. The caller's ballot starts at Yes. | **P14 overrule panel** in the law ballot's frame (TvCouncil): the question, last month vs now, who has voted (never how), "needs N of M votes". |
| **4 · The reveal** (`POLITICS.overrule.revealMs`) | the result | the result | **P14:** "Yes 6 · needed 5: Overruled, last month's budget stays", or "The Governor's budget stands". A second overrule adds "Snap election next month". |
| **5 · Month end** | **P15** month-end colony panel: the fund's lines this month: office pay, upkeep, "Welfare 100 → Kai", "Security 200", "Buildings 340". | same | **P15:** the same lines in the TV's colony panel. |
| **6 · Next month, after a snap election was called** | the election desk, as in an election month (candidacy open in announce) | same | the election panels, as in an election month |

Hidden throughout: who voted how on the overrule (S5-HC-4). Welfare's recipient, the lines and the call
are public, like the tax and the laws (05-colony-politics: "Everything is public").

---

## §1 · Solution Design `[handoff]`

The budget setting and the overrule live in WS7's `packages/engine/src/politics.ts`, the sole writer of
`state.politics`, beside the tax and the law ballot. Spending lives in WS7's `packages/engine/src/colony.ts`,
the sole writer of the fund, inside `runColony`. That mirrors how the tax works today: `politics.ts` sets
the rate and `economy.ts::taxSale` charges it. `game.ts` needs no change: the lines are paid inside
`runColony`, and the overrule closes inside `closeVotes`, which `advancePhase` already calls. The AI's
decisions sit in a new WS7 hand file that `VoteHand` drives, so neither the server nor the sim builds a new
hand. The repo is not prism-indexed: every call-site list below comes from grep (`git grep -n`).

```
S5-C1 · ADDED · the Governor sets a standing budget; politics keeps last month's for the overrule

today        the Governor sets the tax (politics.ts::setSalesTax, RULE-6) and may commission, repair and pay
             strikers (colony.ts::commission, ::repair, ::payStrike). There is no budget: runColony pays
             every commissioned building all it can above COLONY.reserve.
             anchors: packages/engine/src/politics.ts::setSalesTax, ::openPlanning, ::newPolitics,
             packages/engine/src/colony.ts::runColony, packages/engine/src/types.ts::Politics
             verified_by: read (52c54b07)
tomorrow     MUST let the Governor set the budget in planning once the votes are over: a whole-credit
             amount per line offered (S5-RULE-1, S5-RULE-2). It stands until changed, like the tax.
             MUST snapshot it as budgetAtStart when planning opens, beside taxAtStart.
             MUST export budgetLines(state), budgetDue(state) and securityFunds(state) for the AI, the views
             and slice 4.
             With politics off: no budget (null).
logic        → §2 S5-RULE-1, S5-RULE-2 · evaluated at the setBudget intent · writes politics.budget;
             openPlanning writes politics.budgetAtStart
seam         politics.ts — setBudget beside setSalesTax, with the same refusals in the same order (politics,
             phase and votes, Governor), and the same copy-on-write edit()
senior       junior would: put the budget on Colony and write it from colony.ts, or keep a per-month list
             of budgets. · senior does: the budget is a Governor's setting, so it lives with the tax in
             Politics. Its start-of-month copy sits beside taxAtStart, so the overrule restores both the same
             way. colony.ts only reads it when it pays, as taxSale only reads the rate.
mechanism    sprout (setBudget, budgetLines, budgetDue, securityFunds) + in_place (newPolitics, openPlanning)
call sites   setBudget: MuleGame.handle (S5-C8), applyAction in play.ts (S5-C10), BudgetHand via VoteHand
             (S5-C7). openPlanning: game.ts::createGame, game.ts::advancePhase (unchanged calls).
pin          with no setBudget call the budget is {} in every month, and runColony pays as today
             (S5-T-AC-3, politics-on rows); politics off: politics is null, no field read (S5-T-AC-12)
depends_on   none
atomicity    ships with S5-C2 (a budget nobody pays is a setting with no effect)
```

```
S5-C2 · MODIFIED · upkeep pays the budget lines after the buildings' upkeep and before new building funding; Welfare goes to the last-placed player

today        runColony: (1) standing and closed buildings pay upkeep or close, (2) buildings under way tick,
             (3) each commissioned building is funded in commission order with all the fund holds above
             COLONY.reserve, (4) the mood steps.
             anchors: packages/engine/src/colony.ts::runColony, ::fundOut, ::stillNeeds,
             packages/engine/src/game.ts::advancePhase ('upkeep': collectLawTaxes, payGrant, payOffices,
             runColony), packages/engine/src/types.ts::FundLine
             verified_by: read (52c54b07)
tomorrow     MUST, between steps (2) and (3), pay each line in force from the fund above COLONY.reserve.
             When the fund can't pay them all, every line is cut by the same share (S5-RULE-3). Welfare is
             paid to the player S5-RULE-4 names. The money paid is recorded under FundLine 'welfare' and
             'security' and in colony.welfare.
             MUST leave step (3) to fund buildings with what is left.
             MUST export welfareRecipient(state) for the views and the AI.
logic        → §2 S5-RULE-3, S5-RULE-4 · evaluated once at upkeep, inside runColony · reads politics.budget,
             treasury.money, score() · writes treasury.money (through fundOut), the recipient's money,
             colony.welfare, the ledger
seam         colony.ts::runColony — the only place that spends at upkeep after office pay; one step between
             two that exist
senior       junior would: pay the lines in game.ts beside payOffices, or at planning's close. · senior
             does: inside runColony, after the obligations (office pay, building upkeep) and before
             discretionary building money, with the same spare() and reserve, so the lines can never take
             office pay or close a standing building. At planning's close they would find the fund already
             drained to the reserve by last month's building funding (G-5 RULE-21 row 3), and the
             Governor's choice would be empty whenever a building is hungry.
mechanism    in_place (one step in runColony) + sprout (welfareRecipient)
call sites   runColony: game.ts::advancePhase 'upkeep' (one call, unchanged)
pin          G-5's RULE-21 tests and the pace tests pass unchanged with every line at 0 (S5-T-AC-3); the
             ledger invariant (Σ in − Σ out = Δ treasury.money, G-5 RULE-27) holds with the new lines
depends_on   S5-C1 (data: the budget)
atomicity    ships with S5-C1
```

```
S5-C3 · MODIFIED · the mood reads Welfare paid

today        moodTarget reads shortages, air, tax, a broken promise, prestige and the wealth gap. G-5 C23
             and D-G5-5 list "Welfare spend (0 until slice 5)".
             anchors: packages/engine/src/colony.ts::moodInputs, ::moodTarget, packages/engine/src/config.ts::HAPPINESS
             verified_by: read
tomorrow     MUST add Welfare paid this upkeep as a mood input: + HAPPINESS.weights.welfare per
             welfareUnit cr, up to welfareCap points (S5-RULE-5). 0 when nothing was paid.
logic        → §2 S5-RULE-5 · evaluated in runColony's last step, after the lines are paid
seam         colony.ts::moodInputs / ::moodTarget — the one formula G-5 RULE-20 owns
senior       junior would: count Welfare twice, once through the wealth gap it narrows and again as a big
             direct term. · senior does: a small capped direct term (the colonists see the colony care),
             with WS1's numbers. The gap term already carries the rest.
mechanism    in_place
call sites   moodInputs, moodTarget: colony.ts::runColony; WS1's sim reads moodTarget through the colony
             record only
pin          with no Welfare paid, every RULE-20 example gives the same target (G-5 RULE-20 tests)
depends_on   S5-C2 (data)
atomicity    none
```

```
S5-C4 · ADDED · any player but the Governor may call one overrule vote a month; the call freezes the tax and the budget

today        none_exists: nothing lets a player challenge the tax. setSalesTax refuses only for politics
             off, phase, an open election, and the actor.
             anchors: packages/engine/src/politics.ts::setSalesTax, ::taxBounds, ::votesOpen
             verified_by: read; git grep -n -iE "overrule" -- packages apps (nothing outside docs)
tomorrow     MUST let a player who is not the Governor call this month's overrule vote on the tax or the
             budget, in planning once the votes are over, if that setting now differs from where the month
             began (S5-RULE-6). MUST refuse a second call in the same month.
             MUST let the caller withdraw before the ballot opens.
             From the call until planning ends, MUST refuse setSalesTax and setBudget with S5-RULE-6's words.
             MUST export canOverrule(state, playerId) for the views and the AI.
logic        → §2 S5-RULE-6 · evaluated at the callOverrule intent · writes politics.overrule (stage 'called')
seam         politics.ts — beside proposeLaw: a planning act, public, pending until planning ends
senior       junior would: freeze only the called target. · senior does: freeze both. Otherwise a Governor
             overruled on the budget raises the tax a second later, and the month's one call is spent. The
             Governor's last-second change is also covered: the server clears the others' Ready on any change
             by the Governor (S5-C8), so a call is always possible before planning ends.
mechanism    sprout (callOverrule, canOverrule) + in_place (one refusal row each in setSalesTax and setBudget)
call sites   callOverrule: MuleGame.handle (S5-C8), play.ts applyAction (S5-C10), OverruleHand via VoteHand
             (S5-C7). setSalesTax: MuleGame.handle 'setTax', play.ts, VoteHand.govern.
pin          RULE-6's tax tests (bounds, Governor only, refused in the election) pass unchanged
depends_on   S5-C1 (budgetAtStart)
atomicity    ships with S5-C5 (a call needs its ballot)
```

```
S5-C5 · ADDED · the overrule ballot opens as planning would end, through the votes-open seam; a yes majority of all vote weight restores last month's setting

today        the votes-open seam (votesOpen, votesDone, isVotesDone, stepVotes, closeVotes) runs the
             election, then the law ballot, as planning opens. Planning proper ends when every human is
             Ready, or on the host's Continue (server), or when the sim's loop advances.
             anchors: packages/engine/src/politics.ts::votesOpen, ::votesDone, ::isVotesDone, ::stepVotes,
             ::closeVotes, ::castLawVote; apps/server/src/mule-game.ts::MuleGame (checkAllReady,
             continuePlanning, scheduleElectionTick); packages/ai/src/play.ts (planning case)
             verified_by: read (52c54b07)
tomorrow     MUST export openOverrule(state): boolean. When planning would end and a call is pending, it opens
             the ballot (stage 'ballot': the caller's ballot yes, the Governor's no) and returns true;
             otherwise it returns false.
             MUST route the existing seam through it: votesOpen is true while it is open, votesDone and
             isVotesDone reach it, and stepVotes tallies it once every player is Done. Then a reveal of
             POLITICS.overrule.revealMs, then over.
             MUST tally with a majority of all vote weight (S5-RULE-8). If it passes, MUST put back
             taxAtStart or budgetAtStart.
             MUST export voteOverrule (yes/no, replaceable until the ballot closes).
             MUST, in closeVotes, tally an open overrule ballot and let a pending call that never got its
             ballot lapse (AM-1's case).
logic        → §2 S5-RULE-7, S5-RULE-8 · evaluated at openOverrule, each vote and each step · weights bind
             at the ballot's close · writes politics.overrule, treasury.salesTax (restore), politics.budget
             (restore), politics.overruled
seam         politics.ts's votes-open facade (slice 2a C40). The server's Ready, away, Continue and view code
             already key on votesOpen and isVotesDone, so the ballot reaches them with no new branch there
             (S5-C8 lists the three spots that do need one).
senior       junior would: a third stage machine in the server, or a second "open" flag. · senior does: one
             more machine in politics.ts with the law ballot's untimed shape, opened by one call that both the
             server and the sim make at "planning would end now". The tally reuses voteWeight. The result
             shape matches the council's plus needed and total, so the reveal reuses TvCouncil's frame.
mechanism    sprout (openOverrule, voteOverrule, overrule tally) + in_place (votesOpen, votesDone,
             isVotesDone, stepVotes, closeVotes)
call sites   openOverrule: MuleGame.checkAllReady and .continuePlanning (S5-C8), play.ts's planning case
             (S5-C10). votesOpen/votesDone/isVotesDone/stepVotes/closeVotes: every existing caller (git grep
             -n "votesOpen\|votesDone\|isVotesDone\|stepVotes\|closeVotes" -- apps packages: mule-game.ts,
             play.ts, colony.ts, game.ts, politics-view.ts)
pin          the election and law ballot tests (packages/engine/test/politics*.test.ts) pass unchanged: no
             overrule is open unless openOverrule opened one
depends_on   S5-C4 (the call)
atomicity    ships with S5-C4
```

```
S5-C6 · MODIFIED · a second passed overrule in a term calls a snap election next month (D-S5-3 A)

today        openPlanning opens an election only in POLITICS.electionMonths. Candidacy closes as an election
             month's planning opens, except in month 1 (candidacyClosed). takeOffice starts a new term for
             every winner.
             anchors: packages/engine/src/politics.ts::openPlanning, ::nextElectionMonth, ::canRun,
             ::takeOffice
             verified_by: read
tomorrow     MUST count passed overrules since the term began (politics.overruled). On reaching
             POLITICS.overrule.snapAfter, MUST set politics.snapMonth = month + 1, unless that month is
             already an election month or past the game's end (S5-RULE-9).
             MUST open an election in snapMonth as in an election month, with candidacy open in its
             announce as in month 1.
             MUST let a re-elected sitting Governor continue their term: no new term counted and governorRun
             unchanged.
             MUST make nextElectionMonth return snapMonth when it comes first, so the views and VoteHand's
             declare-ahead see it.
logic        → §2 S5-RULE-9 · evaluated at the overrule's effect and at openPlanning
seam         politics.ts — the election's own functions; no new machine
senior       junior would: a separate "snap" election type, or a new term (and +POLITICS.termScore Worth) for
             a Governor overruled twice and re-elected. · senior does: the same election in an off month.
             Continuing the term means two overrules never earn their target Worth.
mechanism    in_place
call sites   openPlanning (unchanged callers), nextElectionMonth: politics-view.ts::termEnd and
             ::politicsView, vote.ts::VoteHand (declareAhead)
pin          every slice-1 and untimed-election test passes unchanged when snapMonth is null
depends_on   S5-C5
atomicity    none (D-S5-3 B drops this change alone)
```

```
S5-C7 · ADDED · computer players: the AI Governor splits the budget; every AI seat calls and votes on overrules (hands/budget.ts)

today        VoteHand runs for office, votes, and as Governor sets the tax, proposes a law and acts for the
             colony (strike, repair, commission at commissionShare with goodsInReach).
             anchors: packages/ai/src/hands/vote.ts::VoteHand, ::goodsInReach, ::nextTax
             verified_by: read
tomorrow     MUST add packages/ai/src/hands/budget.ts (WS7, new) with BudgetHand.split and
             OverruleHand.call and .vote (S5-RULE-11, S5-RULE-12), on WS1's valuations (§3.2).
             MUST have VoteHand drive them:
               - split as Governor, once a month after the tax and before the law proposal and colonyActs;
               - call on every tick in planning proper with no vote open, once per new Governor setting;
               - vote and press Done when the overrule ballot opens, as for the law ballot.
             MUST make colonyActs' commission check read the fund less budgetDue (S5-RULE-13).
             MUST make an AI Governor hold its tax and budget for the rest of a term in which it was
             overruled.
             Draws come from an overrule stream of the seat's own salt and the month (slice 2a INV-41), never
             the game's seed.
logic        → §2 S5-RULE-11, S5-RULE-12, S5-RULE-13
seam         packages/ai/src/hands/vote.ts::VoteHand — already ticked by the server
             (MuleGame.tickVoteHands) and the sim (play.ts). The new hands are its parts, so neither host
             constructs anything new.
senior       junior would: a fourth hand class wired into the server and the sim, or the budget logic inline
             in vote.ts. · senior does: a separate file the PM's split names ("new hands for … budget"),
             composed by the one politics hand both hosts already tick. The valuations are WS1's pure
             functions, so WS7's file holds decisions, not prices.
mechanism    sprout (budget.ts) + in_place (VoteHand.tick, .govern, .colonyActs)
call sites   VoteHand.tick: apps/server/src/mule-game.ts::MuleGame (tickVoteHands), packages/ai/src/play.ts
             (planning case); AiSeat builds the mind with its salt (packages/ai/src/seat.ts)
pin          packages/ai/test vote-hand tests for the election, the law ballot and colonyActs pass unchanged
             when every line's max is 0 and no overrule is open
depends_on   S5-C1, S5-C4, S5-C5 (contract, stubbable from §3); WS1's four valuations (§3.2; stubbable: a stub
             returning 0 makes the hand set no budget and call nothing)
atomicity    none
```

```
S5-C8 · MODIFIED · the server: three intents; the overrule ballot as planning would end; a Governor's change clears the others' Ready (WS3 named edits)

today        planning proper ends in checkAllReady when every counted seat is Ready, or by the host's
             Continue (continuePlanning → nextPhase). The election tick, once the votes close, starts planning
             proper (startPlanning).
             anchors: apps/server/src/mule-game.ts::MuleGame (handle, checkAllReady, continuePlanning,
             scheduleElectionTick, startPlanning, tickVoteHands), apps/server/src/server.ts::isIntent
             verified_by: read
tomorrow     MUST accept setBudget, callOverrule and voteOverrule (§3).
             MUST, in checkAllReady and in continuePlanning's planning-proper branch, call openOverrule(state)
             before nextPhase. If it returns true: schedule the votes tick, add the news line, and return.
             MUST, in scheduleElectionTick's votes-closed branch, go to nextPhase (not startPlanning) when
             this month's overrule is over.
             MUST give continuePlanning an overrule branch before the law-ballot branch. While the overrule
             ballot is open: every human not Done becomes Done; in its reveal: "The result is being
             announced". Today's council branch would otherwise fall through to `state.politics!.election!`,
             which is null in a month without an election.
             MUST, after a setTax or setBudget by the Governor in planning proper: clear the other humans'
             Ready, tick the vote hands once (tickVoteHands(0)) so AI seats may call, and add a news line.
             MUST add news lines for a call, a withdrawal, the result and a snap election.
logic        → §2 S5-RULE-7 (when it opens), S5-RULE-10 (who sees what)
seam         mule-game.ts's planning-end points (checkAllReady, continuePlanning) and the votes tick;
             server.ts::isIntent
senior       junior would: open the ballot from the intent handler, or run a timer at planning's end. ·
             senior does: hook the two places planning already ends, so Ready, away seats and the host's
             Continue behave as for every other vote (S5-HC-7). Clearing Ready on a Governor's change
             closes the "change it at the last second" hole without a clock.
mechanism    in_place (named edits)
call sites   the intent switch in MuleGame.handle; checkAllReady; continuePlanning; scheduleElectionTick;
             isIntent
pin          apps/server/test/politics.test.ts's election and council rows pass unchanged; a month with no
             call ends planning exactly as today
depends_on   S5-C4, S5-C5 (contract, stubbable from §3)
atomicity    the three intents ship with §3's protocol types (one contract commit)
```

```
S5-C9 · MODIFIED · the views: the budget, the overrule and Welfare (WS7's politics-view.ts and colony-view.ts)

today        politicsView carries the tax, the fund, weights, the election, the proposal, the council and
             the laws. myPoliticsView carries the viewer's ballots. colonyView carries the gauges, the
             ledger and the projects.
             anchors: apps/server/src/politics-view.ts::politicsView, ::myPoliticsView, ::councilNews,
             apps/server/src/colony-view.ts::colonyView
             verified_by: read
tomorrow     MUST add PoliticsView.budget, .overrule, .overruled and .snap, and MyPoliticsView.overruleBallot
             and .canOverrule (§3), built field by field: an overrule's ballots are read only for who has
             voted, and totals appear only from the reveal (S5-RULE-10).
             MUST add ColonyView.welfare, and the new ledger lines through the existing ledger copy.
             MUST export overruleNews(state) as councilNews is.
             MUST extend the key-list test in apps/server/test/politics.test.ts (NEW_FIELD) with the new keys.
logic        → §2 S5-RULE-10
seam         the two WS7 view files beside councilView
mechanism    in_place
call sites   MuleGame.viewFor (politicsView, myPoliticsView, colonyView), the votes tick (news)
pin          the existing view tests pass; the key list changes only by the new keys
depends_on   S5-C1, S5-C2, S5-C5
atomicity    none
```

```
S5-C10 · MODIFIED · the sim and the AI's moves play the budget and the overrule (WS1 named edits)

today        play.ts's planning case loops the votes, ticks the hands once more, then planMonth; applyAction
             knows setTax, propose, voteLaw, commission and the rest; 'done' routes to votesDone only when an
             election or a council exists. observe() hides other seats' election ballots.
             anchors: packages/ai/src/play.ts (planning case, applyAction), packages/ai/src/actions.ts::AiAction,
             packages/engine/src/observe.ts::observe, packages/ai/src/sim.ts
             verified_by: read
tomorrow     MUST add AiAction setBudget, callOverrule, voteOverrule and their applyAction cases.
             MUST route 'done' to votesDone while an overrule ballot is open.
             MUST, in the planning case after the Governor's tick, tick every hand once more (so a seat seated
             before the Governor can call). After planMonth, MUST call openOverrule and, if it opened, loop
             the votes as before.
             MUST hide other seats' overrule ballots in observe().
             MUST print S5-UBER-AC-1's row (budget months, calls, passes, snap elections, Welfare and Security
             paid, buildings standing) and check it.
             MUST add WS1's four valuations (§3.2).
seam         WS1's files
mechanism    in_place
call sites   play.ts planning case and applyAction; observe() callers (every hand, unchanged); sim.ts main
pin          politics-off rows byte-identical (S5-HC-5)
depends_on   S5-C1, S5-C4, S5-C5, S5-C7 (contract, stubbable)
atomicity    none
```

```
S5-C11 · MODIFIED · the phone desks: the Governor's budget (P12), the overrule call and its ballot (P13)

today        the Governor desk holds the tax and the law picker; the Council desk holds the vote weights,
             the laws in force and next month's vote; the law ballot is its own component.
             anchors: apps/web/src/phone/hub/politics/Governor.tsx::GovernorDesk,
             apps/web/src/phone/hub/politics/Council.tsx, apps/web/src/phone/hub/politics/LawBallot.tsx,
             apps/web/src/phone/hub/politics/words.ts
             verified_by: read
tomorrow     MUST render WS6's approved mock:
               - the budget steppers with what each line buys, "buildings get the rest", Set, and the frozen
                 state (P12);
               - "Call an overrule vote" (tax or budget, only what changed), Withdraw, the call's banner, and
                 the overrule ballot with last month vs now, needed, Yes/No and Cast (P13).
ux           mock: WS6, to come (starting from the Governor desk's tax row and LawBallot's Yes/No) · GRAFT
             TARGET: Governor.tsx, Council.tsx, new apps/web/src/phone/hub/politics/OverruleBallot.tsx, words.ts
mechanism    fill_scaffold
pin          politics-desks tests for the tax and the law ballot pass unchanged
depends_on   S5-C9 (contract), WS6's approved mock (not stubbable: an implementer never designs a screen)
atomicity    none
```

```
S5-C12 · MODIFIED · the TV: the budget strip in planning and the overrule panel and reveal (P14)

today        the TV shows the Governor's promise under the planning header and the law ballot and its
             reveal in its own panel; TableApp routes to it while the council is open.
             anchors: apps/web/src/table/TvGovernorPromise.tsx::TvGovernorPromise, apps/web/src/table/TvCouncil.tsx::TvCouncil,
             apps/web/src/table/TableApp.tsx
             verified_by: read
tomorrow     MUST render WS6's approved mock:
               - the budget line under the promise line;
               - the call banner;
               - the overrule ballot (who has voted, needed) and the reveal (totals, the verdict, a snap
                 election note).
ux           mock: WS6, to come (from TvCouncil's frame) · GRAFT TARGET: TvGovernorPromise.tsx, new
             apps/web/src/table/TvOverrule.tsx, one TableApp route line (WS4 named edit)
mechanism    fill_scaffold
pin          TvCouncil's and TV-FIT's tests pass unchanged
depends_on   S5-C9, WS6's approved mock
atomicity    none
```

```
S5-C13 · MODIFIED · the month end shows what each line paid (P15)

today        the month end's colony panel shows the air, the fund's balance and who went hungry; the ledger
             reaches the view (ColonyView.ledger) but no month-end line reads it.
             anchors: apps/web/src/components/MonthEnd.tsx::ColonyPanel, apps/web/src/game/month-end.ts,
             apps/server/src/colony-view.ts::colonyView
             verified_by: read; git grep -n "ledger" -- apps/web/src (nothing)
tomorrow     MUST render WS6's approved mock of the fund's lines this month (office pay, upkeep, Welfare →
             whom, Security, buildings), on the phone and the TV.
ux           mock: WS6, to come · GRAFT TARGET: MonthEnd.tsx's ColonyPanel (WS4) and month-end.ts (WS4)
mechanism    fill_scaffold
pin          TV-FIT's 0.7 floor at six seats (PM ruling 6 Nov) holds
depends_on   S5-C9, WS6's approved mock
atomicity    none
```

**Reuse checks** (self-review check 6; grep, since the repo is not prism-indexed):
- S5-C1, S5-C4, S5-C5. `git grep -n -iE "budget|overrule|welfare|snap ?election|militia"` over packages/*/src,
  apps/server/src and apps/web/src finds only `apps/server/src/brain/budget.ts` and `brain/client.ts`/`index.ts`.
  Those are the language-model spend budget, a different thing; the AI hand file is named
  `hands/budget.ts` in another package, and its classes are BudgetHand and OverruleHand. The nearest
  neighbours are `setSalesTax` (S5-C1 copies its refusals and its start-of-month copy) and the council
  (S5-C5 copies its machine, its seam and its reveal).
- S5-C2. `runColony` is the only place that spends at upkeep after office pay. `payOffices` pays a player
  from the fund by rule, and Welfare does the same through fundOut.
- S5-C6. The election machine, unchanged, opened in an off month. No second election type.
- S5-C7. VoteHand is the politics hand both hosts tick. A new class wired into both would duplicate its
  timing.

---

## §2 · The Logic `[handoff]`

```
S5-RULE-1 · The lines offered and their bounds                     shape: decision table (classification)

inputs    line ∈ BudgetLine ('welfare' | 'security'); POLITICS.offices (contains 'sheriff' once slice 4
          restores the Sheriff, AM-19)
  #   line       offered when                                  bounds (credits a month)
  1   welfare    politics on                                   0 ..= POLITICS.budget.welfare.max (200), multiple of POLITICS.budget.step (50)
  2   security   politics on and 'sheriff' ∈ POLITICS.offices   0 ..= POLITICS.budget.security.max (300), multiple of step
  3   (rest)     never a setting                               buildings get what runColony has left after the lines (S5-RULE-3)
budgetLines(state)  the lines offered, in this order
unknown   a line absent from politics.budget = 0. A line that is no longer offered keeps its amount in state
          but budgetDue and runColony count it as 0. A Sheriff office removed by config makes Security
          vanish without a migration.
boundaries  D-S5-1 B adds 'environment' as row 2b (air −POLITICS.budget.environment.airPer100 per 100 cr).
            That is one more union member and one more step in S5-RULE-3; nothing else changes.
```

```
S5-RULE-2 · Setting the budget (setBudget)                          shape: decision table

inputs    actor · phase · votesOpen · budget: Partial<Record<BudgetLine, number>> (the whole split; absent
          = 0) · politics.overrule (null | this month's, stage) · offered lines (S5-RULE-1)
first match wins
  #   when                                                      then
  1   politics off                                              refuse "This game plays without the colony's council"
  2   not planning, or a vote is open                           refuse "Set the budget once the votes are over"
  3   actor ≠ Governor                                          refuse "Only the Governor sets the budget"
  4   an overrule is called this month (any stage)              refuse "An overrule vote is called: the tax and the budget hold until it is settled"
  5   a key that is not an offered line                         refuse "The colony has no <line> line"
  6   an amount not whole, < 0, > max or not a multiple of step  refuse "<Line> is 0 to <max> cr, in steps of <step>"
  7   otherwise                                                 politics.budget = the split (offered lines only, zeros kept out)
same row 4 in setSalesTax   refuse "An overrule vote is called: the tax and the budget hold until it is settled"
                            (added before setSalesTax's bounds check)
no fund bound   the split is a plan for this month's upkeep, not money set aside. The fund at upkeep decides
                what is paid (S5-RULE-3, design 05 "Running out"). A bound at setting time would read a fund
                that last month's building funding already drained to the reserve.
examples  Lena (Governor) sets { welfare: 100 } → row 7 · Kai tries → row 3 · welfare 120 → row 6 ·
          security with no Sheriff office → row 5 · after Brix's call → row 4
```

```
S5-RULE-3 · Paying the lines at upkeep (inside runColony)            shape: sequence

upkeep order (G-5 RULE-27, unchanged): runUpkeep → collectLawTaxes → payGrant → payOffices → runColony
runColony:
  1  standing / closed buildings: upkeep or close                      (G-5 RULE-21 row 1, unchanged)
  2  buildings under way: tick                                          (G-5 RULE-21 row 2, unchanged)
  3  NEW · the lines:
       due    = Σ amount over the offered lines in politics.budget        (budgetDue)
       spare  = max(0, treasury.money − COLONY.reserve)                    (the existing spare())
       share  = due ≤ spare ? 1 : spare / due
       for each offered line, in budgetLines order:
         pay = floor(amount × share)
         security → fundOut('security', pay)                               (the militia's wages: a sink)
         welfare  → to = welfareRecipient(state) (S5-RULE-4);
                    to = null → pays nothing;
                    else paid = fundOut('welfare', pay); player(to).money += paid;
                    colony.welfare = { month, to, paid }
  4  commissioned buildings: funded with what spare is now left          (G-5 RULE-21 rows 3-4, unchanged)
  5  the mood steps, reading Welfare paid                                (G-5 RULE-20 + S5-RULE-5)
unknown   politics.budget = {} or every line 0 → step 3 pays nothing, and steps 4-5 run exactly as today
          (S5-HC-5's pin). No Governor → the budget still stands (it outlives a term until the next Governor
          changes it).
invariants  the fund never goes below COLONY.reserve through step 3 (it never touches office pay money), never
            below 0 (fundOut). The ledger's Σ in − Σ out = Δ treasury.money (G-5 RULE-27) with the two new
            lines. Rounding down leaves any odd credit in the fund.
outcome   the money paid is in the month's ledger out { welfare, security } and colony.welfare; the month
          end shows it (S5-C13)
examples  fund 640 after office pay and upkeep, reserve 100, welfare 100 + security 200 → spare 540 ≥ 300:
          both paid in full, 240 left for buildings ·
          fund 250, same budget → spare 150, share 0.5 → welfare 50, security 100, buildings 0 ·
          fund 90 → spare 0 → nothing paid, nothing funded, the reserve intact ·
          budget {} → buildings get all 540, as today
```

```
S5-RULE-4 · Welfare's recipient                                       shape: decision table

inputs    players · politics.governor · score(state, id) (the public Worth) · the seed and month (the lot)
evaluated  at upkeep, at S5-RULE-3 step 3 (who is last after this month's auction). The views show
           welfareRecipient(state) at any moment as "would go to X now".
first match wins
  #   when                                                     then
  1   politics off, or Welfare 0 this month                    nobody
  2   no player but the Governor                               nobody (the line pays nothing)
  3   one player not the Governor has strictly the lowest Worth  that player
  4   a tie for the lowest Worth among non-Governors            a draw among them on its own stream from (seed, month,
                                                               'welfare'), as politics.ts::drawLot draws
why not the Governor   money moves only by rule (S5-HC-3); a Governor who is last would otherwise vote
                       public money to themselves. The next-lowest gets it instead.
examples  Worths Lena (Governor) 9,000 · Kai 10,500 · Brix 14,000 → Kai · Kai and Brix tied at 10,500 → a
          seeded draw · a two-player game where the Governor is last → the other player
```

```
S5-RULE-5 · The mood reads Welfare (G-5 RULE-20, one term added)      shape: formula

  target += HAPPINESS.weights.welfare × min(welfarePaid / HAPPINESS.weights.welfareUnit, HAPPINESS.weights.welfareCap)
            placeholders: welfare 1, welfareUnit 50 cr, welfareCap 4
  welfarePaid = colony.welfare.paid when colony.welfare.month = this month, else 0
unknown   nothing paid → 0; the formula and every G-5 RULE-20 example are unchanged
examples  100 cr paid → +2 · 300 cr paid → +4 (capped) · 0 → +0
```

```
S5-RULE-6 · Calling an overrule (callOverrule)                        shape: decision table

inputs    actor · phase · votesOpen · politics.governor · target ∈ 'tax' | 'budget' | null (null = withdraw) ·
          politics.overrule (null | this month's) · changed(tax) = salesTax ≠ taxAtStart ·
          changed(budget) = budget ≠ budgetAtStart (by every offered line's amount)
first match wins
  #   when                                                      then
  1   politics off                                              refuse "This game plays without the colony's council"
  2   not planning, or a vote is open                           refuse "Call an overrule once the votes are over"
  3   target null, and actor is this month's caller, stage 'called'   withdraw: overrule = null; the month's call is free again
  4   target null otherwise                                     refuse "There is no call of yours to withdraw"
  5   no Governor                                               refuse "There is no Governor to overrule"
  6   actor = Governor                                          refuse "The Governor can't overrule themself"
  7   an overrule is already called this month                  refuse "<caller> already called this month's overrule vote"
  8   changed(target) is false                                  refuse "The <tax|budget> is as it was when the month began"
  9   otherwise                                                 overrule = { month, target, caller: actor, stage 'called' };
                                                                 the tax and the budget freeze (S5-RULE-2 row 4)
canOverrule(state, id)  per target: true, or why not: 'politicsOff' | 'notNow' | 'noGovernor' | 'governor' |
                        'called' | 'unchanged', read from rows 1-8 so the views and the AI never restate them
unknown   the month began with no Governor (month 1 before the election) → taxAtStart and budgetAtStart are the
          values when planning opened, so a new Governor's first change is overrulable like any other
examples  Lena raised the tax 5 → 10; Brix calls 'tax' → row 9 · Lena calls → row 6 · Kai calls 'budget' after
          Brix's call → row 7 · Lena never touched the budget; Kai calls 'budget' → row 8
```

```
S5-RULE-7 · The overrule ballot                                       shape: state machine

stages    called → ballot (untimed) → reveal (POLITICS.overrule.revealMs, presentation only) → over
  from     event                                                    to
  called   openOverrule(state): planning would end now (every       ballot; ballots = { caller: yes, Governor: no };
           counted human Ready, the host's Continue, or the sim's    done = []
           loop at the end of planning)
  called   the caller withdraws (S5-RULE-6 row 3)                   (no overrule this month)
  ballot   every player Done (a cast ballot is Done; 'ready' is      reveal (S5-RULE-8 fixes the result)
           Done), or the host's Continue (humans not Done abstain)
  reveal   the clock ends                                           over (the effect applies); planning ends at once
  called   the game leaves planning without openOverrule             lapses: overrule = null, nothing restored (news:
           (AM-1's case, closeVotes)                                 "The overrule vote on the <target> was never held")
  ballot / reveal   the game leaves planning (closeVotes)           tally now if still in ballot; the effect applies
ready     while the ballot is open, 'ready' is Done for it (the votes-open seam); never ends planning by itself
continue  the host's Continue in the ballot: every human not Done becomes Done, abstaining (named in the news);
          in the reveal it is refused ("The result is being announced")
away      an away human is not Done (S5-HC-7); the host's Continue moves past them
order     the overrule is the last vote of a planning: the election and the law ballot happen as planning
          opens, the overrule as it ends. They are never open at once.
examples  Lena raises the tax; Brix calls; everyone presses Ready → the ballot opens on every phone → all cast →
          reveal → over → the land grant · Brix calls, then withdraws → planning ends at the last Ready, no ballot
```

```
S5-RULE-8 · The overrule's result and its effect                      shape: decision table

inputs    ballots: voter → yes | no (absent = abstain) · weight = voteWeight(state, id).total at the close ·
          total = Σ weight of every player · needed = floor(total / 2) + 1 (more than half of all votes)
  #   when                       then
  1   Σ weight of yes ≥ needed   passed: tax → treasury.salesTax = politics.taxAtStart; budget → politics.budget =
                                 politics.budgetAtStart; politics.overruled += 1 (S5-RULE-9 reads it)
  2   otherwise                  failed: the setting stands
both      the tax and the budget stay frozen until planning ends (it ends at the reveal's close). Next month
          the Governor may set both again (the tax within maxStep of the restored rate, RULE-6).
public    { passed, yes, no, total, needed } from the reveal; who voted how never (as RULE-9, RULE-47)
why all votes   design 05: "A majority of all votes undoes it". An abstention is not a yes, so a Governor
                cannot be overruled by a handful of players while the rest look away.
negative weight   a player at 0 weight (reputation below 30 and nothing else) adds 0 to yes and to total
examples  total 9, needed 5: yes 6 → overruled · yes 4 → stands · yes 5 → overruled · a 2-player game,
          caller 1, Governor 2, total 3, needed 2 → the caller alone can't pass it
```

```
S5-RULE-9 · A snap election (D-S5-3 A)                               shape: decision table

inputs    politics.overruled (passed overrules since termStart) · POLITICS.overrule.snapAfter (2) · month ·
          maxMonths · POLITICS.electionMonths
at an overrule's effect, first match wins
  #   when                                              then
  1   overruled < snapAfter                             nothing
  2   month + 1 ∈ electionMonths, or month + 1 > maxMonths   nothing (an election is due anyway, or the game ends)
  3   otherwise                                         politics.snapMonth = month + 1; news "Overruled twice this
                                                        term: snap election in month <m+1>"
at openPlanning in month m = snapMonth
          an election opens as in an election month; candidacy stays open in its announce, as in month 1
          (candidacyClosed reads month 1 or snapMonth); snapMonth = null once it opens
takeOffice in a snap election
          termStart = month and overruled = 0 for everyone. A winner who already holds that office continues:
          terms unchanged, governorRun unchanged, the new promise holds from now. A new winner starts a term as
          usual.
every term start   overruled = 0
nextElectionMonth  min(snapMonth, the next month in electionMonths), so termEnd, the views and VoteHand's
                   declare-ahead see the snap
examples  overruled in months 2 and 3 → snap in month 4? No: month 4 is an election month (row 2) ·
          overruled in months 5 and 6 → snap in month 7? No, row 2 again · overruled in months 2 and 2 is
          impossible (one call a month) · overruled in months 7 and 8 → snap election in month 9; Lena
          re-elected → still her term 7, terms[lena] unchanged; Kai elected → Kai's new term from 9
```

```
S5-RULE-10 · Who sees what                                            shape: decision table

  item                                              owner        other phones   TV
  the budget now and at the month's start, lines    yes          yes            yes
  offered, buildings' "rest" at today's fund
  Welfare's recipient now, and who was paid         yes          yes            yes
  the call (caller, target), the frozen state       yes          yes            yes
  the overrule ballot's stage, who has voted,       yes          yes            yes
  who is Done, needed, total
  one player's overrule ballot                      the voter    no             no      (until and after the reveal)
  yes / no totals and the verdict                   from the reveal, every screen
  passed overrules this term, a snap election month  yes          yes            yes
  canOverrule (why a player may not call)           the viewer only
accepted  as for the council (AM-8 (a)): totals plus a public "who has voted" list can, at a small table,
          let players work out a ballot by arithmetic. No screen shows a ballot.
```

```
S5-RULE-11 · BudgetHand.split (the AI Governor)                       shape: decision table + greedy fill

when      the seat is Governor, in planning proper once a month, after VoteHand.govern sets the tax and before
          the law proposal and colonyActs; never while an overrule is called; never in a term in which an
          overrule against it passed (it holds the tax and the budget)
inputs    obs = observe(state, me) · offered lines and bounds (budgetLines, POLITICS.budget) · budget in force ·
          fund · open buildings' stillNeeds credits · this month's unpaid strike cost
surplus   S = max(0, fund − COLONY.reserve − Σ stillNeeds(open).credits − unpaid strike cost)
          (credits a commissioned building still needs are never offered to a line: the AI never starves a
          building it has commissioned)
fill      start each line at min(POLITICS.ai.budget.base[persona][line], max)
          then repeat: for each offered line below its max, marginal(line) =
              (lineWorth(obs, line, a + step, me) − lineWorth(obs, line, a, me)) × POLITICS.ai.budget.tilt[persona][line]
              − projectsWorth(obs, step, me)
          take the best line with marginal > 0 while Σ + step ≤ S; stop when none
          then cut the lines back, last step first, until Σ ≤ S
  #   result                                       then
  1   Rookie                                       base amounts only (no fill)
  2   the split equals the budget in force         no action (a no-op change would expose it to an overrule)
  3   otherwise                                    act setBudget(split)
```

```
S5-RULE-12 · OverruleHand.call and .vote                              shape: decision table

call      every non-Governor Classic seat, in planning proper with no vote open, once per Governor setting
          (the tax and budget it last judged); draws from the overrule stream (seat salt, month)
  #   when                                                                          then
  1   Rookie, or canOverrule(obs, me)[t] ≠ true for both targets                    no call
  2   w(t) = overruleWorth(obs, t, me) < POLITICS.ai.overrule.minGain for each t     no call
  3   t* = the target with the largest w; yesWeight = Σ voteWeight(obs, p) over players p ≠ Governor with
      overruleWorth(obs, t*, p) > 0 (me included); yesWeight ≥ needed               call t*
  4   otherwise, a draw < POLITICS.ai.overrule.longShot[persona]                    call t* (a protest)
  5   otherwise                                                                     no call
vote      when the overrule ballot opens: one ballot, then Done (as the law ballot, RULE-46)
  #   when                                                   then
  1   me = Governor                                          no
  2   me = caller                                            yes
  3   Rookie                                                 a draw < POLITICS.ai.overrule.rookieYes
  4   mood band ∈ POLITICS.ai.colony.leanIn                  yes when overruleWorth > −POLITICS.ai.overrule.unhappyTilt
  5   otherwise                                              yes when overruleWorth(obs, target, me) > 0
streams   the overrule stream hashes the seat's salt with the month and its own constant, like
          VoteHand's council stream, never state.seed (INV-41); no election or council draw moves
```

```
S5-RULE-13 · The AI's commission composes with the budget (G-5 C25, AM-19)    shape: one condition

today     an AI Governor commissions an object when PRESTIGE[id].credits × commissionShare ≤ fund and its
          goods are in reach (vote.ts::colonyActs)
tomorrow  … ≤ fund − budgetDue(obs): the lines are paid first at upkeep (S5-RULE-3), so the fund they will
          take is not there for the building
unchanged  goodsInReach, the prestige-then-credits order, payStrike and repair
```

---

## §3 · Contracts & Data Models `[handoff]`

| Contract | change_kind | Breaking | Change |
|---|---|---|---|
| engine types: `BudgetLine`, `Budget`, `OverruleTarget`, `Overrule`, `OverruleWhy`; `Politics` += `budget`, `budgetAtStart`, `overrule`, `overruled`, `snapMonth`; `FundLine` += `'welfare' \| 'security'`; `Colony` += `welfare` | ADDED | no (new fields; null or empty when unused) | S5-C1, S5-C2, S5-C4, S5-C5, S5-C6 |
| engine exports (politics.ts): `setBudget`, `budgetLines`, `budgetDue`, `securityFunds`, `callOverrule`, `canOverrule`, `openOverrule`, `voteOverrule`; colony.ts: `welfareRecipient` | ADDED | no | S5-C1..C6 |
| engine exports, changed behaviour: `votesOpen`, `votesDone`, `isVotesDone`, `stepVotes`, `closeVotes` also run the overrule; `nextElectionMonth` sees a snap; `setSalesTax` gains a refusal | MODIFIED | no (same signatures) | S5-C4, S5-C5, S5-C6 |
| `MuleIntent` += `setBudget`, `callOverrule`, `voteOverrule` | ADDED | no | S5-C8 |
| `PoliticsView` += `budget`, `overrule`, `overruled`, `snap`; `MyPoliticsView` += `overruleBallot`, `canOverrule`; `ColonyView` += `welfare` | ADDED | no (optional fields, as `council?` and `strike?` were added) | S5-C9 |
| `MonthReport.ledger.out` gains `welfare`, `security` (through `FundLine`) | MODIFIED | no | S5-C2 |
| `AiAction` += `setBudget`, `callOverrule`, `voteOverrule` (WS1's actions.ts) | ADDED | no | S5-C10 |
| config: `POLITICS.budget`, `POLITICS.overrule`, `POLITICS.ai.budget`, `POLITICS.ai.overrule`; `HAPPINESS.weights.welfare`, `.welfareUnit`, `.welfareCap` | ADDED | no | S5-C1..C7 |

**First commit (WS3, the contract freeze).** These are the shapes WS3 commits in one go: types.ts and
protocol, with the engine functions as signatures that throw `'not built'` where WS7 has not built yet.
After that, engine, server, AI, views and screens build in parallel.

```ts
// packages/engine/src/types.ts (WS3 named edit)
/** A budget line the Governor sets, in credits a month. Security only once a Sheriff is elected (S5-RULE-1). */
export type BudgetLine = 'welfare' | 'security';
/** The Governor's standing budget: credits a month per line; an absent line is 0. */
export type Budget = Partial<Record<BudgetLine, number>>;
/** What an overrule vote can undo. */
export type OverruleTarget = 'tax' | 'budget';
/** Why a player may not call an overrule on a target now (S5-RULE-6 rows 1-8). */
export type OverruleWhy = 'politicsOff' | 'notNow' | 'noGovernor' | 'governor' | 'called' | 'unchanged';

/** This month's overrule: called in planning, voted as planning ends, revealed, over. */
export interface Overrule {
  month: number;
  target: OverruleTarget;
  caller: string;
  stage: 'called' | 'ballot' | 'reveal' | 'over';
  /** Ms of the reveal shown; 0 until it starts. */
  clockMs: number;
  /** Secret: each voter's yes (undo it) or no. Only the voter may see their own. */
  ballots: Record<string, boolean>;
  done: string[];
  /** Fixed when the ballot closes. */
  result: { passed: boolean; yes: number; no: number; total: number; needed: number } | null;
}

// Politics gains (newPolitics: budget {}, budgetAtStart {}, overrule null, overruled 0, snapMonth null)
//   budget: Budget;            // in force
//   budgetAtStart: Budget;     // when this month's planning opened: what an overrule restores
//   overrule: Overrule | null; // this month's; null in a month without a call
//   overruled: number;         // overrules passed since termStart
//   snapMonth: number | null;  // a snap election's month, once called
// FundLine gains 'welfare' | 'security'.
// Colony gains: welfare: { month: number; to: string; paid: number } | null;   // the latest Welfare paid
```

```ts
// packages/engine/src/politics.ts (WS7) — signatures
export function budgetLines(state: GameState): BudgetLine[];                 // S5-RULE-1, in order
export function budgetDue(state: GameState): number;                         // Σ offered lines in force
export function securityFunds(state: GameState): number;                     // the Security line in force, 0 if not offered (slice 4's hook)
export function setBudget(state: GameState, playerId: string, budget: Budget): void;            // S5-RULE-2
export function canOverrule(state: GameState, playerId: string): Record<OverruleTarget, true | OverruleWhy>;
export function callOverrule(state: GameState, playerId: string, target: OverruleTarget | null): void; // S5-RULE-6
export function openOverrule(state: GameState): boolean;                     // S5-RULE-7: called → ballot
export function voteOverrule(state: GameState, voterId: string, yes: boolean): void;            // replaceable until close
// packages/engine/src/colony.ts (WS7)
export function welfareRecipient(state: GameState): string | null;           // S5-RULE-4
```

```ts
// packages/protocol/src/index.ts (WS3 named edit)
// MuleIntent +=
  /** Planning, once the votes are over: the Governor's whole budget split, credits a month per line. */
  | { type: 'setBudget'; budget: Budget }
  /** Planning, once the votes are over: call this month's overrule vote on the tax or the budget; null withdraws your call. */
  | { type: 'callOverrule'; target: OverruleTarget | null }
  /** The overrule ballot: yes undoes the Governor's setting; a later vote replaces it until the ballot closes. */
  | { type: 'voteOverrule'; yes: boolean }

/** The budget as every screen sees it. */
export interface BudgetView {
  /** The lines offered, in order, each with its amount now and at the month's start. */
  lines: { line: BudgetLine; amount: number; start: number; max: number; step: number }[];
  /** Σ amounts: what upkeep will try to pay. */
  due: number;
  /** About what buildings get at today's fund: max(0, fund − COLONY.reserve − due). */
  rest: number;
  /** Who Welfare would go to now (S5-RULE-4), or null. */
  welfareTo: string | null;
  /** True from an overrule call until planning ends: the tax and the budget hold. */
  frozen: boolean;
}

/** This month's overrule as every screen sees it: who has voted, never how; totals only from the reveal. */
export interface OverruleView {
  target: OverruleTarget;
  caller: string;
  stage: Overrule['stage'];
  /** What a yes restores and what stands now. */
  restores: { tax: number } | { budget: Budget };   // whole % for the tax
  stands: { tax: number } | { budget: Budget };
  voted: string[];
  done: string[];
  waitingFor: string[];
  clockMs: number;
  revealMs: number;
  /** Every player's weight now (fixed at the close), and more than half of it. */
  total: number;
  needed: number;
  result: { passed: boolean; yes: number; no: number } | null;
}

// PoliticsView +=
//   budget?: BudgetView | null;         // null with politics off
//   overrule?: OverruleView | null;     // null in a month without a call
//   overruled?: number;                 // passed this term
//   snap?: number | null;               // a snap election's month
// MyPoliticsView +=
//   overruleBallot?: boolean | null;    // own ballot while the overrule ballot is open; never anyone else's
//   canOverrule?: Record<OverruleTarget, true | OverruleWhy>;
// ColonyView +=
//   welfare?: { month: number; to: string; paid: number } | null;
```

**Worked example** (Brix's phone, month 6, the overrule ballot open; Lena governs; 4 players):
```json
"politics": { "governor": "lena", "tax": { "percent": 10, "start": 5, "low": 5, "high": 15 },
  "budget": { "lines": [{ "line": "welfare", "amount": 100, "start": 0, "max": 200, "step": 50 }],
              "due": 100, "rest": 440, "welfareTo": "kai", "frozen": true },
  "overrule": { "target": "budget", "caller": "brix", "stage": "ballot",
                "restores": { "budget": {} }, "stands": { "budget": { "welfare": 100 } },
                "voted": ["brix", "lena", "ai1"], "done": ["lena", "ai1"], "waitingFor": ["brix", "kai"],
                "clockMs": 0, "revealMs": 4000, "total": 7, "needed": 4, "result": null },
  "overruled": 0, "snap": null, … },
"me": { "politics": { "overruleBallot": true, "canOverrule": { "tax": "called", "budget": "called" }, … } }
```
Lena's and ai1's ballots are in no other player's view.

### §3.1 · Hooks for slice 4

**Hooks for slice 4** (ws7-slice4-sabotage, designed in parallel). This slice supplies; slice 4 decides:
- `securityFunds(state): number` (new in politics.ts): the Security line in force, after any overrule. It is 0
  until `'sheriff' ∈ POLITICS.offices`. Slice 4 turns it into its own numbers: guards (design 05: 1, +1
  per 100), investigations (2 at 200), detection, the escort (200). Those rates belong in slice 4's config.
- **Read it at resolve time, not when the guards are placed.** The overrule can lower the Security line as
  planning ends, after the Sheriff has placed guards. Slice 4's rule must say which guards count when
  the allowance falls; WS7 suggests the latest placed drop first.
- Slice 4 restores the Sheriff by adding `'sheriff'` back to `POLITICS.offices`. Security then appears on
  the Governor's desk with no other change here.
- The Security line is paid at upkeep through `fundOut('security')`, like office pay for work done. A
  month the fund can't pay in full is cut by S5-RULE-3's share. The guards have already worked that
  month: this slice does not claw them back.

**Engine contract with WS1's sim:** `openOverrule` is the one call the sim makes at "planning would end"
(S5-C10). `votesOpen`, `stepVotes` and `votesDone` drive the ballot exactly as they drive the law ballot.


### §3.2 · Hand decisions and the values they need (the WS7 ↔ WS1 contract) `[handoff]`

Every computer player decision this slice adds, its timing, and the WS1 valuation it calls. All run in
Classic seats with no API key. Smart seats use the same code until WS2's port takes these decisions.

| Hand · method | Runs when | Inputs | Output | Values called |
|---|---|---|---|---|
| `BudgetHand.split(obs)` (new, hands/budget.ts) | the seat is Governor; once a month in planning proper, inside VoteHand.govern after the tax, before proposeLaw and colonyActs; not after an overrule passed against it this term | observe(); budgetLines, POLITICS.budget, the budget in force, the fund, open buildings' stillNeeds, unpaid strike | `Budget` → `setBudget`, or none | `lineWorth`, `projectsWorth` |
| `OverruleHand.call(obs)` (new) | any non-Governor seat; every VoteHand tick in planning proper with no vote open, once per Governor setting it has not judged (the server ticks the hands after a Governor's change, S5-C8) | observe(); canOverrule; taxAtStart vs tax; budgetAtStart vs budget; voteWeight of every player | `OverruleTarget` → `callOverrule`, or none | `overruleWorth` (for itself and for every other player, to estimate the yes weight) |
| `OverruleHand.vote(obs, overrule)` (new) | when the overrule ballot opens; one ballot, then Done | observe(); the overrule; the mood band | `boolean` → `voteOverrule`, then `done` | `overruleWorth` |
| `VoteHand.colonyActs` (existing) | as today | + `budgetDue(obs)` | the commission check uses fund − budgetDue | none new |
| `VoteHand.govern` (existing) | as today | + whether an overrule passed against it this term | holds the tax (no `setTax`) for the rest of such a term | none new |

**WS1's valuations** (packages/ai/src/value.ts, pure functions, public facts only so a hand can evaluate
any player, as `lawImpact` lets RULE-46 do. Persona tilts are applied in the hand, not here):

```ts
/**
 * Credits this month that player `me` gains from `line` running at `amount` cr a month, against the line at 0.
 * Monotone non-decreasing in `amount`. `me` may be any player id.
 */
export function lineWorth(obs: GameState, line: BudgetLine, amount: number, me: string): number;
```
Must account for:
- **Welfare:** `amount` if `me` is `welfareRecipient(obs)` now, else 0. Plus the mood points it buys
  (S5-RULE-5) × `moodPointWorth(obs, me)`.
- **Security:** the expected sabotage loss on `me`'s plots this month that the guards and detection it buys
  would prevent. It reads slice 4's odds once slice 4 exports them, and is 0 until then (and 0 while
  Security is not offered).
- Does not count the fund's own wealth term: it belongs to nobody's Worth.

```ts
/**
 * Credits this month a point of colony happiness is worth to player `me`: for the sitting Governor, the change
 * in re-election chance it buys × POLITICS.termScore (AI voters lean against the incumbent in
 * POLITICS.ai.colony.leanIn bands); for everyone, the expected loss from the mood's social events
 * (SOCIAL_EVENTS: strikes, thefts, emigration) it avoids. ≥ 0.
 */
export function moodPointWorth(obs: GameState, me: string): number;
```

```ts
/**
 * Credits this month that player `me` gains from `credits` more reaching the colony's open buildings at this
 * upkeep: the months it brings each building forward × (its perk's value to `me`, the park, hospital and
 * stadium event modifiers, + its prestige's mood points × moodPointWorth). 0 when no building is
 * commissioned, or when every open one waits only for goods. ≥ 0.
 */
export function projectsWorth(obs: GameState, credits: number, me: string): number;
```
`projectsWorth` is the opportunity cost of every credit a line takes. Today it is mostly 0, because
buildings wait for goods (§0's measurement). It rises when goods unblock (G-5 C49, WS9's chains).

```ts
/**
 * Credits this month that player `me` gains if this month's overrule on `target` passes (negative: loses).
 * tax: (salesTax − taxAtStart) × the sales `me` is expected to make in this month's auctions (the seller pays,
 * economy.ts::taxSale), plus the fund-side value of that tax to `me` (projectsWorth of the tax it brings in,
 * the Governor's office pay already safe). budget: Σ over lines [lineWorth(start) − lineWorth(now)] −
 * projectsWorth(Δ due), so a Welfare raise that goes to `me` makes the overrule a loss for `me`.
 */
export function overruleWorth(obs: GameState, target: OverruleTarget, me: string): number;
```

Every result is in credits. No function draws randomness. WS1 may stub all four to return 0 at first:
the AI then sets only its persona's `POLITICS.ai.budget.base` and never calls an overrule. That is a
legal, playable state, so S5-C7 does not wait on WS1. The pass-chance estimate (S5-RULE-12 call row 3) is a
weighted count in the hand (WS7), not a valuation.


### §3.3 · The split by owner `[handoff]`

| File | Owner (SEAMS) | Named edit |
|---|---|---|
| packages/engine/src/types.ts | WS3 | §3's types: `BudgetLine`, `Budget`, `OverruleTarget`, `OverruleWhy`, `Overrule`; `Politics` +5 fields; `FundLine` +2; `Colony.welfare`. One commit, the contract freeze. |
| packages/protocol/src/index.ts | WS3 | three intents; `BudgetView`, `OverruleView`; optional fields on `PoliticsView`, `MyPoliticsView` and `ColonyView`. Same commit. |
| packages/engine/src/politics.ts | WS7 | S5-C1 setBudget, budgetLines, budgetDue, securityFunds; openPlanning's budgetAtStart; S5-C4 callOverrule, canOverrule, setSalesTax's row; S5-C5 openOverrule, voteOverrule, the overrule's tally, and the five votes-open functions; S5-C6 snap (openPlanning, candidacyClosed, takeOffice, nextElectionMonth); newPolitics |
| packages/engine/src/colony.ts | WS7 | S5-C2 runColony's line step and welfareRecipient; Colony.welfare in newColony; S5-C3 moodInputs and moodTarget |
| packages/engine/src/config.ts, POLITICS block | WS7 | `POLITICS.budget = { step: 50, welfare: { max: 200 }, security: { max: 300 } }`; `POLITICS.overrule = { revealMs: 4_000, snapAfter: 2 }`; `POLITICS.ai.budget = { base, tilt }` per persona per line; `POLITICS.ai.overrule = { minGain: 20, longShot, rookieYes: 0.5, unhappyTilt: 30 }`. All placeholders. |
| packages/engine/src/config.ts, HAPPINESS block | WS1's numbers (D-G5-4), WS7 named edit | `weights.welfare: 1, welfareUnit: 50, welfareCap: 4` (placeholders) |
| packages/engine/src/observe.ts | WS1 | hide other seats' overrule ballots, as the election's (S5-HC-4) |
| packages/engine/src/game.ts | WS3 | **no change** (the lines pay inside runColony, and the overrule closes inside closeVotes) |
| apps/server/src/mule-game.ts | WS3 | S5-C8: three intent cases; openOverrule in checkAllReady and continuePlanning; the overrule branch in continuePlanning; nextPhase after the overrule in the votes tick; clear Ready and tick the hands after a Governor's change; news |
| apps/server/src/server.ts | WS3 | isIntent knows the three intents |
| apps/server/src/politics-view.ts | WS7 | S5-C9 budget and overrule views, overruleNews, my view fields |
| apps/server/src/colony-view.ts | WS7 (built in G-5 W2, 0817b677) | ColonyView.welfare |
| apps/server/test/politics.test.ts | WS7 | the key list (NEW_FIELD) gains budget, overrule, overruled, snap |
| packages/ai/src/hands/budget.ts | WS7 (new; the PM's AI split: "new hands for … budget") | BudgetHand, OverruleHand (S5-RULE-11, S5-RULE-12) |
| packages/ai/src/hands/vote.ts | WS7 | VoteHand drives them; colonyActs reads budgetDue; govern holds after an overrule |
| packages/ai/src/value.ts | WS1 | lineWorth, moodPointWorth, projectsWorth, overruleWorth (§3.2) |
| packages/ai/src/actions.ts | WS1 | AiAction +3 and their MOVES descriptors |
| packages/ai/src/play.ts | WS1 | applyAction +3; 'done' routes to the overrule ballot; the planning case's extra tick and openOverrule loop |
| packages/ai/src/sim.ts | WS1 | S5-UBER-AC-1's row and check |
| apps/web/src/phone/hub/politics/{Governor,Council,words}.tsx/.ts, new OverruleBallot.tsx | WS7 (SEAMS 2026-10-22: hub/politics/**) | P12, P13 from WS6's mock |
| apps/web/src/table/TvGovernorPromise.tsx, new TvOverrule.tsx | WS7 (built by WS7: 806966f5, and TvCouncil's precedent ab5ccdcd; PM to confirm in SEAMS) | P14 |
| apps/web/src/table/TableApp.tsx | WS4 | one route: the overrule panel while it is open (the election wins, then the law ballot, then the overrule) |
| apps/web/src/components/MonthEnd.tsx, apps/web/src/game/month-end.ts | WS4 (PM ruling 6 Nov) | P15: the ledger's lines |
| apps/web/e2e/politics.ts | WS7 (SEAMS 2026-10-22) | S5-UBER-AC-2's step |
| design/mocks (WS6's mock app) | WS6 | P12-P15 mocks → Heiko |
| docs/rulebook/colony-and-politics.html, open-designs.html | WS7 | "Designed, not in the game yet" on the day Heiko rules, then built text per PR (rulebook-always-current) |

Nobody new writes `state.politics` (only politics.ts) or the fund (only colony.ts). WS8's
`components/ColonyActions.tsx` is **not** touched: commissioning stays as it is.

## §4 · Failure & Ops `[handoff]`

| Question | |
|---|---|
| Dependency unavailable? | None external. The budget, the overrule and the AI are in-process and seeded. Smart seats make no model call for them in RC. |
| Retry / poison? | A refused intent throws RuleError and reaches the player as a message. Nothing retries. A hand's refused act is not retried (VoteHand's rule). |
| Idempotency | setBudget sends the whole split (a set, not a delta). voteOverrule sets a value. A second call is refused (one a month). callOverrule null withdraws only the caller's own call. |
| Races | Intents and the votes tick share the server's one event loop. A Governor's change and a player's call race only in the order they arrive: a change after the call is refused (frozen). A call after the last Ready cannot happen: the ballot is already open (votes open: "Call an overrule once the votes are over"). |
| What still works when the overrule breaks? | The host's Continue closes any ballot. Politics off plays the whole game as today (S5-HC-5). With every line's max at 0, the budget is inert and runColony is today's. |
| How an operator knows it works | The month report's ledger (`welfare`, `security`), the news lines at a call, a result and a snap, and the sim's row. |

## §5 · Delivery `[handoff]`

Code-only. Games live in the server's memory and the sim is fresh per run, so there is no existing state
to reach. `newPolitics` gives every new game the new fields. The rulebook's open-designs page gains the slice as
"Designed, not in the game yet, WS7" the day Heiko rules, and each build PR moves its part into
colony-and-politics.html. Rollback is a revert, or the line maxima at 0 (the budget becomes inert) and no
`openOverrule` call (the overrule never opens).

---

## §6 · Acceptance Criteria `[handoff]`

| id | Given / When / Then | changes | observed_at | negative case |
|---|---|---|---|---|
| S5-B-AC-1 | Given Lena governs in month 3 with two phones and AI seats · When she sets Welfare 100 · Then every phone's desk and the TV show "Welfare 100 → Kai" (Kai last on Worth), and at the month end every screen shows a Welfare line of 100 paid to Kai, whose money rose by 100 at upkeep | S5-C1 S5-C2 S5-C9 S5-C11 S5-C12 S5-C13 | the phone, TV and month-end DOM in the e2e; Kai's money in the server view before and after upkeep | Lena last on Worth: Welfare goes to the next-lowest, never to Lena |
| S5-B-AC-2 | Given the fund holds 640 cr after office pay and upkeep, a reserve of 100, Welfare 100 and Security 200 · When upkeep runs · Then both lines are paid in full and buildings get 240; with 250 in the fund each line is paid half and buildings get 0 | S5-C2 | the month's ledger out and the projects' funded credits (engine) | budget {} → buildings get all 540, as today |
| S5-B-AC-3 | Given Lena raised the tax from 5% to 10% · When Brix calls an overrule on the tax and everyone presses Ready · Then the overrule ballot opens on every phone; when all have cast, every screen shows the totals and "Overruled" at the same moment, and the next sale is taxed at 5% | S5-C4 S5-C5 S5-C8 S5-C11 S5-C12 | the phones' and TV's DOM; the seller's money after the land auction's or the auction's first sale | yes below needed → "The Governor's tax stands", 10% applies |
| S5-B-AC-4 | Given Brix called an overrule on the budget · When Lena tries to change the tax or the budget · Then both are refused with "An overrule vote is called: the tax and the budget hold until it is settled" | S5-C4 | the RuleError message (server test) | before any call both changes succeed |
| S5-B-AC-5 | Given an overrule ballot is open · When a human has not cast · Then nothing closes, however long; the host's Continue closes it and the news names them; in the reveal Continue is refused | S5-C5 S5-C8 | server state and news (server test) | every human cast → closes with no Continue |
| S5-B-AC-6 | Given Lena was overruled once this term (month 7) · When she is overruled again in month 8 · Then every screen shows "Overruled twice this term: snap election in month 9", and month 9's planning opens with an election whose candidacy is open; if Lena wins, her term and term count are unchanged | S5-C6 | the views; Politics.terms and termStart (engine) | a second overrule in month 3 → no snap (month 4 is an election month) |
| S5-B-AC-7 | Given four AI seats and no API key · When a game plays with politics on · Then the AI Governor sets a budget, AI seats call and vote on overrules, and every overrule ballot closes without a human | S5-C7 S5-C10 | ai test on seeded games; the sim row (S5-UBER-AC-1) | Rookie seats never call |
| S5-T-AC-1 (serves B-AC-1, B-AC-4) | S5-RULE-2's seven rows and setSalesTax's freeze row, one test each, with their messages | S5-C1 S5-C4 | engine | — |
| S5-T-AC-2 (serves B-AC-2) | S5-RULE-3's four examples; the ledger invariant (Σ in − Σ out = Δ money) holds in every month of a seeded game with lines on | S5-C2 | engine | — |
| S5-T-AC-3 (serves B-AC-2) | with budget {} every G-5 RULE-21 and pace test passes unchanged; runColony's output equals today's on a fixed state | S5-C2 | engine (pin) | — |
| S5-T-AC-4 (serves B-AC-1) | S5-RULE-4's four rows; the Governor is never the recipient; a tie draws from its own stream, and that draw moves no election draw (a seeded game's election results are identical with and without Welfare) | S5-C2 | engine | — |
| S5-T-AC-5 (serves B-AC-1) | S5-RULE-5's examples; with no Welfare every G-5 RULE-20 example gives the same target | S5-C3 | engine | — |
| S5-T-AC-6 (serves B-AC-3) | S5-RULE-6's nine rows, one test each; canOverrule returns the same reason as the refusal for each | S5-C4 | engine | — |
| S5-T-AC-7 (serves B-AC-3, B-AC-5) | S5-RULE-7's transitions: openOverrule with no call returns false and opens nothing; called → ballot → reveal → over; a withdrawn call holds no ballot; leaving planning with a call never opened lapses it, an open ballot is tallied | S5-C5 | engine | — |
| S5-T-AC-8 (serves B-AC-3) | S5-RULE-8's examples (6 of 9 passes, 4 fails, 5 passes; a 2-player caller can't pass alone); a passed tax overrule restores taxAtStart, a budget one restores budgetAtStart | S5-C5 | engine | — |
| S5-T-AC-9 (serves B-AC-6) | S5-RULE-9's rows and examples; a re-elected sitting Governor keeps terms and governorRun; nextElectionMonth returns the snap month | S5-C6 | engine | snapMonth null → every slice-1 and untimed-election test passes |
| S5-T-AC-10 (serves B-AC-3, B-AC-5) | the server opens the ballot at the last Ready and at the host's Continue; after the reveal planning ends at once (no second planning proper, no second AI planMonth); a Governor's setTax or setBudget clears the other humans' Ready | S5-C8 | server test | a month with no call ends planning at the last Ready, exactly as today |
| S5-T-AC-11 (serves B-AC-3) | each screen's view follows S5-RULE-10: a ballot only in its voter's view, totals only from the reveal; the key list test lists the new keys | S5-C9 | the views a phone, the TV and the board receive (server test) | the voter's own view has their ballot |
| S5-T-AC-12 (serves all) | politics off: no budget, no overrule, no Welfare; WS1's politics-off rows byte-identical | S5-C1..C10 | sim report diff | — |
| S5-T-AC-13 (serves B-AC-7) | BudgetHand per S5-RULE-11: it never offers a line credits that open buildings still need; a split equal to the budget in force sends nothing; a Rookie sets base only; it holds after an overrule passed against it this term | S5-C7 | ai test | — |
| S5-T-AC-14 (serves B-AC-7) | OverruleHand per S5-RULE-12: call rows 1-5 and vote rows 1-5; the overrule stream leaves the election's and the council's fixtures unchanged; no hand reads state.seed (INV-41) | S5-C7 | ai test | — |
| S5-T-AC-15 (serves B-AC-7) | colonyActs commissions only when the share ≤ fund − budgetDue (S5-RULE-13) | S5-C7 | ai test | budget {} → the same commission as today |
| S5-T-AC-16 (serves S5-UBER-AC-1) | the sim prints the budget-and-overrule row and checks it on every politics seed set; buildings standing per game are within 0.2 of the max-0 run | S5-C10 | `pnpm sim` | — |
| S5-T-AC-17 (serves B-AC-3) | observe() for seat B never holds seat A's overrule ballot | S5-C10 | engine/ai test | seat A's own observe holds it |

Invariants for every test: the fund never goes below 0; step 3 of runColony never takes the fund below
COLONY.reserve; nothing writes `state.politics` but politics.ts or the fund but colony.ts; one overrule a
month at most; a ballot is never in another seat's view.

---

## §7 · Risks & Spikes `[review-only]`

- **AI seats overrule every tax raise, and the overrules cascade into snap elections.** Pace set C puts
  every AI Governor's tax target at 10% (AM-19). A raise from 5% costs every seller, so most AI seats would
  vote yes, and a second overrule calls a snap election.
  - *Mitigation:* the AI Governor holds its tax and budget for the rest of a term in which it was
    overruled (S5-RULE-11; S5-T-AC-13). In an all-AI game that caps it at one overrule per AI Governor
    term, so no snap election comes from AI play alone. WS1's row reports overrules, snap elections and the
    tax's share of fund income, so Heiko's "taxes stay the fund's largest income" (AM-19) is visible beside
    it.
- **The lines starve the buildings (G-5's 4-5 a game).**
  - *Argued from measurement (§0):* about 6,000 cr a game is idle (about 5,400 at grant 200). Every open
    building at game end already has its credits and waits for goods. The lines at their maxima take at
    most (200 + 300) × 11 = 5,500 cr a game, and the AI's split never offers a line credits that open
    buildings still need (S5-RULE-11).
  - *Mitigation:* S5-UBER-AC-1 fails if buildings per game fall by more than 0.2 against max-0 on the
    same seeds. If goods unblock later (G-5 C49, WS9), `projectsWorth` rises and the AI spends less on
    lines; the check stays.
- **Welfare becomes a kingmaker or a sink for one player.** It is capped at 200 cr a month, by rule to
  the last player, never the Governor (S5-HC-3). WS1's row reports Welfare per recipient.
- **observe() does not hide other seats' law-ballot ballots today** (`packages/engine/src/observe.ts::observe`
  hides `election.ballots` only, not `council.ballots`). It is outside this slice and reported to WS7 as a
  finding. *Mitigation here:* S5-C10 hides the overrule's ballots, and WS1 can close the council's in the
  same edit.
- **Planning gets longer in months with a call.** The ballot ends the moment everyone casts; only the
  reveal is clocked. One call a month at most.
- **Slice 4 slips.** Security never appears (S5-RULE-1 row 2), and the rest of the slice stands alone.
- **Screens wait on WS6's mock.** Engine, AI, server and views go first; the screens follow the mock
  (S5-C11..C13 depends_on).
- *Landmines from memory:*
  - shared what-if copies (FM-WS3-4): every write goes through politics.ts's and colony.ts's `edit()`;
  - seeded streams (slice 2a INV-41): the overrule stream hashes the seat salt;
  - politics-off byte-identical: S5-T-AC-12;
  - the server's Ready keyed on `votesOpen`: S5-C8's three named spots.

No spike needed.

## §8 · Amendments `[review-only]`

None yet.

## §9 · Ownership Boundaries `[handoff]`

No ownership change.
- `packages/engine/src/politics.ts` remains the sole writer of `state.politics`, now including the budget,
  the overrule and the snap month.
- `packages/engine/src/colony.ts` remains the sole writer of the fund and of `state.colony`, now including
  the two lines and `colony.welfare`.
- Welfare's write to a player's money sits in colony.ts beside fundOut, as office pay's sits in
  politics.ts::payOffices.
- Enforcement as G-5 §9 and slice 2a §9: the ledger invariant test (S5-T-AC-2) and the review rule "no
  other file writes state.politics or treasury.money".

## §10 · Sizing `[review-only]`

| PR | Owner | Contents | Days | Can start |
|---|---|---|---|---|
| PR-0 contract | WS3 (WS7 drafts from §3) | types.ts + protocol: §3's shapes; engine signatures that throw 'not built' | 0.5 | at once (12 Nov) |
| PR-1 engine | WS7 | S5-C1..C6, config, engine tests S5-T-AC-1..9 | 1.5 | after PR-0 |
| PR-2 AI hands | WS7 | S5-C7, hands/budget.ts, vote.ts wiring; S5-T-AC-13..15 on WS1 stubs | 1 | after PR-0 (stubs); finishes against PR-1 |
| PR-3 sim and values | WS1 | S5-C10, value.ts four functions, actions, play, observe, sim row; S5-T-AC-16, -17 | 1.5 | after PR-0 (against PR-1's signatures) |
| PR-4 server | WS3 | S5-C8, S5-T-AC-10 | 1 | after PR-0 |
| PR-5 views | WS7 | S5-C9, S5-T-AC-11 | 0.5 | after PR-0, beside PR-4 |
| mocks | WS6 | P12-P15 → Heiko | 1 | at once, from this section's table |
| PR-6 desks and TV | WS7 | S5-C11, S5-C12, the e2e step (S5-UBER-AC-2) | 1.5 | after the mocks are approved and PR-4/PR-5 |
| PR-7 month end and route | WS4 | S5-C13, the TableApp route | 0.5 | after the mocks are approved and PR-5 |

After the contract commit, five lanes work at once (WS7 engine and hands, WS1, WS3, WS6, then WS4).
That makes 12-16 Nov with about a day of slack. The tightest path is mock approval → PR-6 → e2e.
