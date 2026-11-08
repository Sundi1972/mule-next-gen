# WS7 politics · slice 5: the Governor's budget, the overrule vote and the colony's projects

Programme amendment to `docs/specs/2026-10-22-ws7-politics.md` (D1 slice 5, AM-13) · WS7 design writer ·
2026-11-07 · class: **Programme** (a cross-component contract over engine, AI, protocol, server and
screens; about 9 PRs for the RC cut, 5 more after). **Status:** draft for WS7's merge into the 7 Nov
amendment set (slices 3, 4, 5). The 7 Nov frozen contract types (WS7, binding) are adopted as written
(§3). Heiko's plan A (7 Nov) fixes the cut: **RC on 18 Nov carries the overrule on the tax only, plus the
Projects and Welfare lines. The full part (the budget overrule, the Security line, the inquiry) follows
right after RC.** This spec designs the whole slice and tags every change, rule and AC **[RC]** or
**[after RC]**, so the plan can split them. Base: `origin/feat/strategist` 52c54b07.

Ids carry the slice prefix so the three parallel specs never collide: goal **S5-1**, proofs
**S5-UBER-AC-1..3**, constraints **S5-HC-n**, changes **S5-C1..C18**, rules **S5-RULE-1..16**, ACs
**S5-B-AC-n / S5-T-AC-n**, decisions **D-S5-n**.

This slice builds on G-5 and slice 2a rather than replacing them:
- G-5 (`docs/specs/2026-10-28-g5-colony.md`): the fund's ledger (RULE-27), the project pipeline (RULE-21),
  the reserve, pace set C (AM-19), the strike pay-off (RULE-26) and the mood (RULE-20).
- Slice 2a (`docs/specs/2026-10-28-ws7-slice2a-council.md`): the votes-open seam, and the law ballot's
  untimed ballot and its reveal.

### The RC cut at a glance `[handoff]`

| | RC (18 Nov) | after RC (full part 3) |
|---|---|---|
| Budget lines | Projects, Welfare (S5-C1..C3) | + Security, once slice 4's Sheriff is in (S5-C13) |
| Overrule | on the **tax** (S5-C4, S5-C5) | + on the **budget** (S5-C14) |
| Snap election after two overrules | — | S5-C15 (D-S5-3) |
| Sheriff's inquiry and the no-confidence vote | — | S5-C16 (D-S5-4) |
| Computer players | budget split (Projects, Welfare); tax overrule call and vote (S5-C6) | Security share, budget overrule, inquiry, no-confidence vote (S5-C17) |
| Server, views, sim, screens | S5-C7..C12 | S5-C18 |
| Proofs | S5-UBER-AC-1, S5-UBER-AC-2 | S5-UBER-AC-3 |

The RC cut stands on its own. Nothing in it reads a field that only the after-RC work writes. Every
after-RC change adds a union member, a rule row or a new function. None changes an RC signature.

---

## §0 · Business Goals & Value `[handoff: goal line and proofs]` `[review-only: who / today / value / cost]`

Provenance:
- Heiko's ruling of D1 on 2026-10-22: "(5) the budget lines, the overrule vote and the inquiry".
- AM-13 on 2026-10-28: "the colony budget is a separate pot filled from taxes, fines and the like; the
  Governor spends it on community projects".
- His 2026-11-07 rulings: all of politics in the release candidate, "with computer players that use them",
  and plan A for the cut.

It serves Mission Goal G-4: "The table plays politics - pacts, whispers, sabotage, elections, a Governor
and a Sheriff, laws and taxes - and it changes the game". G-4's proof is "sim with AI elections and laws,
balance checks hold; e2e with whispers, a deal card and a vote".

**S5-1 · The Governor decides where the colony's money goes each month, and the table can overrule a
Governor it disagrees with; computer players do both.**

- *Who benefits:* every player.
  - The Governor gets a real spending choice: buildings, help for whoever is last, and, after RC, the
    Sheriff's militia.
  - The player in last place gets help the rules guarantee, not a favour.
  - The rest of the table gets a monthly way to stop a Governor, without waiting up to three months for
    the next election.
- *Today:* the Governor's only spending choice is which building to commission
  (`packages/engine/src/colony.ts::commission`). At each upkeep, `colony.ts::runColony` pays every
  commissioned building all the fund holds above `COLONY.reserve`. Mostly, the money just sits.

  Measured on trunk 52c54b07 (verified_by: executed): 40 games on seeds 1-20 and 101-120, four Trader
  seats, politics on, `playGame` + `simSeats`, each `MonthReport.ledger` summed.

  | per game | seeds 1-20 | seeds 101-120 |
  |---|---|---|
  | money into the fund (median) | 7,891 cr | 7,653 cr |
  | money out of the fund (median) | 1,504 cr | 1,405 cr |
  | fund at game end, min / median / max | 2,607 / 6,252 / 7,948 cr | 3,987 / 6,277 / 7,780 cr |
  | buildings standing at game end (mean) | 0.80 | 0.90 |
  | months with the fund under 300 cr (median) | 1 | 1 |
  | buildings still open at game end | 26, every one `commissioned` | 25, every one `commissioned` |

  Every building still open at game end has its credits and is waiting for goods (G-5 AM-19: "goods block
  it"). So about 6,000 cr a game sits idle.

  The measurement used `COLONY.grant.perMonth` 250, as it stood on trunk. Heiko ruled 200 on 7 Nov
  (#633). That cuts about 600 cr a game from the income and leaves about 5,400 idle. The conclusion still
  holds at 200: the lines are shares of the fund, so they shrink with it, and every open building waits
  on goods, not credits.

  No player can challenge the Governor's tax. A Governor who raises it from 5% to 10% keeps it until the
  next election (`politics.ts::setSalesTax`; nothing calls a vote on it).
- *Value:*
  - The fund's idle money does something every month that the table can see and argue about.
  - The last-placed player gets a catch-up.
  - Every month there is a public moment where the table can rein in the Governor, as the council reins
    in a runaway leader (05-colony-politics, "The colony can push back").
  - After RC: the Sheriff's job gets a budget behind it, and an inquiry and a snap election give the push
    back teeth.
  - Rough worth: about 5,400-6,000 cr a game of idle fund put to visible use, and one public vote a month.
- **S5-UBER-AC-1** [RC] (sim; G-4's "sim with AI elections and laws, balance checks hold"). `pnpm sim`
  with politics on, on every seed set WS1's politics rows use, prints a budget-and-overrule row. It
  passes when all of these hold:
  - In at least half the games an AI Governor runs a Welfare share above 0 in at least one month.
  - In at least a quarter of the games an AI seat calls a tax overrule, and at least one passes in each
    set.
  - Buildings standing per game stay within 0.2 of the same seeds run with
    `--set POLITICS.budget.welfare.maxShare=0`.
  - The lowest colony fund is 0 or more.
  - Every WS1 check that passes with politics off still passes.
- **S5-UBER-AC-2** [RC] (e2e; G-4's "e2e with … a vote"). A step in `apps/web/e2e/politics.ts` with two
  phones and AI seats:
  1. Lena, the human Governor, raises the tax from 5% to 10% and presses Ready.
  2. Brix calls an overrule vote on the tax.
  3. When planning ends, both phones show the overrule ballot. The AI seats cast theirs with no API key.
  4. Both humans cast.
  5. Every screen shows the totals and "Overruled" at the same moment.
  6. The first sale of the month is taxed at 5%.
- **S5-UBER-AC-3** [after RC]. The sim row adds:
  - Security shares;
  - budget overrules (called and passed);
  - inquiries opened and their findings;
  - no-confidence votes;
  - snap elections.

  Each fires in at least one game per set, with the same balance checks as S5-UBER-AC-1. The e2e adds a
  step: a budget overrule passes and the month end shows last month's shares paid.

**Non-goals** (each needs its own spec, or waits for another system):
- **The Reserve and Environment lines** (design 05).
  - Reserve's emergency imports buy goods off-world for the fund. Heiko ruled "no import" for the fund's
    buildings on 2026-11-06 (G-5 AM-17), and topping up the store's capital is WS1's store.
  - Environment would move the colony score's environment term and blunt the pollution laws, so it needs
    its own sim row. Plan A did not take it.
- **Design 05's protective projects** (reservoir, levee, defence battery …). RC's projects are G-5's
  prestige buildings, commissioned through `colony.ts::commission` as today.
- **Overruling a commission.** Design 05 lists "Start a colony project" as overrulable. G-5 has no cancel
  for a commissioned building (RULE-22: "There is no cancel"), so an overrule would need one. The overrule
  targets the tax and (after RC) the budget only.
- **The Governor ordering which building is funded first.** Commission order stays (G-5 RULE-21 row 3).
- **Welfare as "a free MULE outfit"** (design 05's second form). It needs a development hook. Welfare is
  credits only.
- **The Sheriff's powers.** Slice 4 designs them. This slice supplies the Security line (§3.1).
- **Budget promises on deal cards.** These belong to slice 3; its frozen `DealTerms` carry pacts and votes
  only. Borrowed votes are slice 3's too: if they enter `politics.ts::voteWeight`, the overrule tally
  counts them with no change here.
- **Smart seats' budget and overrule decisions through WS2's brain port.** RC's computer players are code
  hands and need no API key.
- **Tuning.** Every number is a named placeholder. WS1's G-5 C29 tunes at the end (G-5 HC-25), and the
  money-moving numbers go to Heiko (politics D3).
- **Screens before WS6 mocks them.**

**Rough cost:**
- RC cut: about 9 PRs (WS3 contract + server, WS7 engine, AI hands and views + desks, WS1 one, WS4 one
  small, WS6 mocks), about 4 build days with five lanes in parallel after the contract commit (§10).
- After RC: about 5 PRs, about 2.5 days.
- Thin baseline: about 3 PRs (§0.1).

### §0.1 · Decision Record `[review-only]`

**Chosen: three budget shares, and an overrule vote held as planning ends.**
- The Governor sets a standing budget in whole-percent shares of the fund above the reserve: Projects,
  Welfare, and Security after RC. The shares sum to at most 100, and the rest stays in the fund (the
  frozen `Budget`).
- At upkeep, after office pay and the buildings' upkeep, Welfare is paid (capped in credits a month).
  Projects caps what new building funding may take. The default budget is Projects 100, which is exactly
  today's runColony.
- Any player except the Governor may call one overrule vote a month on the tax. After RC, the budget can be
  a target too. Either can be called only once it differs from where the month began.
- The ballot opens when planning would end. It reuses the law ballot's untimed shape and its reveal. A
  majority of all vote weight puts back `taxAtStart` (or `budgetAtStart`).

The RC cut is about 9 PRs (§10).

**Thin baseline: a Welfare line only, with the overrule as one more ballot when next month's planning
opens** (the law ballot's slot, `politics.ts::openCouncil`). About 3 PRs.
- *It loses because* the overrule could undo nothing that already happened.
- The tax raised in planning m has already taxed month m's auctions.
- The budget has already been paid at upkeep m: `game.ts::advancePhase` 'upkeep' calls `runColony` before
  the next planning opens.
- So design 05's "the previous month's settings stay" cannot hold. Check: the order of the `upkeep` and
  `planning` branches in `advancePhase`.

**Alternative timing: the overrule ballot opens the moment it is called, mid-planning.**
- *It loses because* Ready would change meaning twice in one planning phase: planning's Ready, then the
  ballot's Cast, then planning's Ready again.
- The server routes Ready on one window (`apps/server/src/mule-game.ts::MuleGame` case 'ready':
  `if (this.electionOpen()) votesDone(…)`). Slice 2a rejected the same shape for the law ballot for the
  same reason.
- Held at the end of planning, Ready changes meaning once.

**Larger: all five lines now.**
- *It loses because* Reserve imports reverse Heiko's 6 Nov "no import" ruling, and plan A did not take
  Environment.

### §0.2 · Constraints `[handoff]`

```
S5-HC-1  packages/engine stays pure: no I/O, no Date.now, no Math.random. Welfare's tie lot and every AI
         draw for the budget, the overrule, the inquiry and the no-confidence vote come from their own seeded
         streams, so no election, council or event draw moves.
                                                  source: CLAUDE.md, politics HC-1, slice 2a HC-41   breach: fatal
S5-HC-2  Every number lives in config.ts: the budget, the overrule and the inquiry in POLITICS
         (POLITICS.budget, .overrule, .inquiry, .ai.budget, .ai.overrule, .ai.inquiry); Welfare's mood
         weight in HAPPINESS (WS1's numbers). Each has its unit and a one-line meaning, and is named as a
         placeholder.                             source: CLAUDE.md, politics HC-2, G-5 HC-20, HC-25   breach: fatal
S5-HC-3  Money moves only by rule (HC-3). Welfare goes from the fund to the player the rule names
         (S5-RULE-4), never to a player the Governor picks, and never to the Governor.
                                                  source: politics HC-3, 00-concept "No direct trading"   breach: fatal
S5-HC-4  A seat decides only on what it can see. The hands read observe(state, me), never raw GameState
         (the PM's rule, 7 Nov). observe() hides other seats' overrule and no-confidence ballots, and the
         views, news, notices, MonthReport and record never name how anyone voted (§3.4).
                                                  source: politics HC-4, frozen types "Every slice: HC-4"   breach: fatal
S5-HC-5  politics:false behaves exactly as today: no budget, no overrule, no Welfare, no inquiry, and WS1's
         politics-off sim rows stay byte-identical. With politics on, the default budget (null:
         Projects 100) and no overrule called, runColony pays exactly what it pays today.
                                                  source: politics HC, G-5 HC-22   breach: fatal
S5-HC-6  Every fund write goes through colony.ts (fundIn/fundOut). The lines are new FundLine values,
         never a direct write to treasury.money.  source: G-5 §9, slice 2a HC-44   breach: fatal
S5-HC-7  No decision has a clock. The overrule and no-confidence ballots wait for every player's Cast, or
         the host's Continue; only the reveals are clocked.     source: AM-15, AM-18, slice 2a HC-43   breach: fatal
S5-HC-8  Rules throw RuleError in the words a player sees; the server turns them into messages.
                                                  source: CLAUDE.md, politics HC-5   breach: fatal
S5-HC-9  The lines move money. They ship with sim rows on both seed sets and go to Heiko for his OK.
                                                  source: politics D3, HC-7   breach: decision
S5-HC-10 Edits outside WS7's paths are the named edits in §1 and §3.3, recorded in SEAMS before the PR.
         No screen is built before Heiko approves WS6's mock.   source: programme rule   breach: decision
S5-HC-11 The RC cut reads no field that only after-RC work writes. After-RC work adds union members, rows
         and functions, and changes no RC signature.   source: Heiko's plan A (7 Nov)   breach: decision
```

### §0.3 · Decisions for Heiko `[review-only]`

**Already ruled (plan A, 7 Nov):** the RC lines are Projects and Welfare; Security comes after RC, with
slice 4; there is no Environment or Reserve line. The RC overrule targets the tax only. The inquiry is in
the full part. Each decision below leads with what the table will see; I decided the rest as WS7's
designer, with the reason given at the rule.

**D-S5-2 · When is the overrule vote held?** [RC] *At the table:* someone calls "Overrule the tax!". Their
name and the target show on every screen. The vote itself happens:
- **A (recommended): as planning ends.** Once everyone is Ready, every phone shows the overrule ballot, the
  TV shows who has voted, and the result is revealed on every screen at once, before the land grant. A
  passed overrule puts the month's starting tax back before anything is sold.
  - *For:* design 05's "the previous month's settings stay" holds exactly.
  - *Against:* one more short ballot in months with a call.
- **B: when next month's planning opens,** beside the law ballot.
  - *For:* less server work.
  - *Against:* it restores only from then on. This month's auctions were already taxed at the Governor's
    rate.

**Ruled 2026-11-07 12:54Z (Heiko, board: "Approve all six as recommended"):** A, the overrule vote is held as planning ends.

**D-S5-3 · Does a second overrule in a term call a snap election?** [after RC] *At the table:* "Overruled
twice: snap election next month" on every screen. The next planning opens with an election, as in months
1, 4, 7 and 10.
- **A (recommended): yes.** A re-elected Governor continues their term: no extra term score, and the
  two-terms limit does not tick.
  - *For:* it makes the overrule matter to the Governor, and the inquiry's no-confidence vote needs the
    same snap election anyway.
  - *Against:* one more ceremony in a game.
- **B: no snap after overrules.** Only a no-confidence vote calls one.

**Ruled 2026-11-07 12:54Z (Heiko, board: "Approve all six as recommended"):** A, a second overrule in a term calls a snap election (after RC).

**D-S5-4 · What does the Sheriff's inquiry look into?** [after RC] *At the table:* once a term the Sheriff
can open an inquiry into the Governor. Every screen shows the Governor's record for the term, and
"Inquiry finds: …" or "Inquiry dismissed". A finding opens a no-confidence vote as planning ends; a
majority calls a snap election. Design 05's test, "spent a line mostly for their own plots", can never be
true here: buildings stand on the colony's own grounds (G-5 C48), Welfare can't go to the Governor, and the
Sheriff places the guards.
- **A (recommended): the Governor's breaches this term.** A month the tax promise broke (Colony.promises),
  a deal card the Governor broke (slice 3's `DealCard.brokenBy`), or an overrule passed against them. A
  dismissed inquiry costs the Sheriff reputation.
  - *For:* every input is already public. It ties slices 3, 4 and 5 together.
  - *Against:* it is not the design doc's wording.
- **B: drop the inquiry.** *Against:* it is in plan A's full part.

**Ruled 2026-11-07 12:54Z (Heiko, board: "Approve all six as recommended"):** A, the inquiry looks into the Governor's public breaches this term (after RC).

---

## What the table sees `[handoff]`

The frame is **Heiko's politics layout P0 option A (7 Nov, 11:02Z)**:
- No new tab, and at most five sections per phone.
- The Sheriff gets a desk like the Governor's.
- An action starts where its target is.

So:
- The budget lives in the Governor desk (the existing Governor.tsx).
- "Call an overrule" starts at the tax line, wherever the table sees the tax. For everyone but the
  Governor that is the fund card in the Colony section (hub/politics/Colony.tsx, "the N% sales tax on
  every sale"). After RC, the call also starts at the budget line.
- The overrule ballot uses the council's ballot place (LawBallot.tsx's CouncilBallot).

The screens are the hub's desks on each phone, the TV's planning panels and the month end. The laptop is
the phone app at desk width, so it shows the same desk as that player's phone. WS6 mocks every layout; this
table lists only what each screen shows and where. Each screen change in §1 has `ux: mock: WS6, to come`.

| Moment | Governor's phone | Every other phone | TV |
|---|---|---|---|
| **1 · Planning: the Governor sets the budget** [RC] (once the month's votes are over) | **P12 Governor desk**, beside the tax: a share per line in steps of `POLITICS.budget.step` %. Each line shows what it pays at today's fund ("Welfare 10%: 54 cr to Kai, last on Worth"; "Projects 80%: up to 432 cr · the Observatory still needs 350 cr and 2 Crystite": §3's worked example, a spare of 540 cr; AM-5, AM-7), plus "Kept in the fund 10%, and what the buildings don't take". Set. | **P13 Council desk:** the budget as set, each line marked if it changed this month ("Welfare 0% → 10%"). | **P14** planning header, under the Governor's promise line (TvGovernorPromise's place): "Budget: Projects 80% · Welfare 10% → Kai · kept 10%", with changes marked. |
| **2 · A player calls an overrule** [RC: tax; after RC: or budget] | The called setting turns read-only: "Frozen: Brix called an overrule vote on the tax, held as planning ends". | **P13:** "Call an overrule vote" starts at the tax line in the fund card (after RC, also at the budget line). Once someone calls, the caller sees "You called it" and Withdraw. Everyone else sees the call, and the button is gone (one call a month). | **P14:** a banner "Brix calls an overrule vote on the Governor's tax", plus the news line. |
| **3 · Planning ends: the overrule ballot** [RC] | **P13 overrule ballot**, in the council's ballot place, the same as every phone. The Governor's ballot starts at No. | **P13 overrule ballot**, in the council's ballot place: "Undo the Governor's tax? 5% at the month's start → 10% now", Yes / No, "needs N of M votes", Cast. The caller's ballot starts at Yes. | **P14 overrule panel**, in the law ballot's frame (TvCouncil): the question, start vs now, who has voted (never how), "needs N of M votes". |
| **4 · The reveal** (`POLITICS.overrule.revealMs`) [RC] | the result | the result | **P14:** "Yes 6 · needed 5: Overruled, the tax goes back to 5%", or "The Governor's tax stands". After RC, a second overrule adds "Snap election next month". |
| *Ready words* (AM-5) [RC] | while the overrule ballot is open and you have not cast: "Vote on the overrule"; cast, others still voting: "Waiting for the overrule vote"; during the reveal: "Continue". WS6 may reword them in the mock; they always say what the table is waiting for | same | — |
| **5 · Month end** [RC] | **P15** month-end colony panel: the fund's lines this month: office pay, upkeep, "Welfare 120 → Kai", "Buildings 430", and, after RC, "Security 200". | same | **P15:** the same lines in the TV's colony panel. |
| **6 · The Sheriff opens an inquiry** [after RC] | **P13:** the record shown, and "Inquiry finds: … — no-confidence vote as planning ends". | the Sheriff's phone, **P16 Sheriff desk** (slice 4's desk): "Open an inquiry" (once a term). Every phone shows the record and the finding. | **P14:** "Sheriff Ossa opens an inquiry into Governor Lena", the record, then the finding or "dismissed". |
| **7 · No-confidence ballot and reveal** [after RC] | as moment 3, with the question "No confidence in Governor Lena?" | as moment 3 | as moments 3-4; a pass shows "Snap election next month". |
| **8 · Next month, after a snap election was called** [after RC] | the election desk, as in an election month (candidacy open in announce) | same | the election panels |

Hidden throughout: who voted how (S5-HC-4). Welfare's recipient, the shares, the calls, the inquiry's
record and its finding are public, like the tax and the laws (05-colony-politics: "Everything is public").

---

## §1 · Solution Design `[handoff]`

The budget setting, the overrule, the snap election and the inquiry live in WS7's
`packages/engine/src/politics.ts`, the sole writer of `state.politics`, beside the tax and the law ballot.
Spending lives in WS7's `packages/engine/src/colony.ts`, the sole writer of the fund, inside `runColony`.
This mirrors the tax today: politics.ts sets the rate, and `economy.ts::taxSale` charges it.

`game.ts` needs no change. The lines are paid inside runColony, and the overrule closes inside
`closeVotes`, which `advancePhase` already calls.

The AI's decisions go in a new WS7 hand file that `VoteHand` drives, so neither the server nor the sim
builds a new hand.

The repo is not prism-indexed, so every call-site list comes from `git grep -n`.

### RC changes

```
S5-C1 · ADDED · [RC] the Governor sets a standing budget in shares; politics keeps the month's start for the overrule

today        the Governor sets the tax (politics.ts::setSalesTax, RULE-6) and may commission, repair and pay
             strikers (colony.ts::commission, ::repair, ::payStrike). There is no budget: runColony pays
             every commissioned building all it can above COLONY.reserve.
             anchors: packages/engine/src/politics.ts::setSalesTax, ::openPlanning, ::newPolitics,
             packages/engine/src/colony.ts::runColony, packages/engine/src/types.ts::Politics
             verified_by: read (52c54b07)
tomorrow     MUST let the Governor set the budget in planning once the votes are over: a whole-percent
             share per offered line, summing to at most 100 (S5-RULE-1, S5-RULE-2). The budget stands until
             changed, like the tax. null means the default, POLITICS.budget.default (Projects 100).
             MUST snapshot it as budgetAtStart when planning opens, beside taxAtStart.
             MUST export budgetLines, budgetShares and budgetCredits (S5-RULE-3's credits at today's fund)
             for the AI, the views and the screens.
logic        → §2 S5-RULE-1, S5-RULE-2 · evaluated at the setBudget intent · writes politics.budget;
             openPlanning writes politics.budgetAtStart
seam         politics.ts — setBudget beside setSalesTax, with the same refusals in the same order and the
             same copy-on-write edit()
senior       junior would: put the budget on Colony and write it from colony.ts, or default to all-zero
             shares ("the rest stays in the fund"), which would stop every building from being funded.
             · senior does: the budget is a Governor's setting, so it sits with the tax in Politics, with its
             start-of-month copy beside taxAtStart. Its default is Projects 100, which is exactly today's
             runColony. colony.ts only reads it when it pays.
mechanism    sprout (setBudget, budgetLines, budgetShares, budgetCredits) + in_place (newPolitics, openPlanning)
call sites   setBudget: MuleGame.handle (S5-C7), applyAction in play.ts (S5-C9), BudgetHand via VoteHand
             (S5-C6). openPlanning: game.ts::createGame and ::advancePhase (unchanged calls).
pin          budget null in every month → runColony pays as today (S5-T-AC-3); politics off → politics null
             (S5-T-AC-12)
depends_on   none
atomicity    ships with S5-C2
```

```
S5-C2 · MODIFIED · [RC] upkeep pays Welfare and caps new building funding by the Projects share

today        runColony runs four steps in order:
               (1) standing and closed buildings pay their upkeep, or close;
               (2) buildings under way tick;
               (3) each commissioned building is funded, in commission order, with all the fund holds
                   above COLONY.reserve (credits, then goods bought at the store);
               (4) the mood steps.
             anchors: packages/engine/src/colony.ts::runColony, ::fundOut, ::stillNeeds,
             packages/engine/src/game.ts::advancePhase ('upkeep': collectLawTaxes, payGrant, payOffices,
             runColony), packages/engine/src/types.ts::FundLine
             verified_by: read (52c54b07)
tomorrow     MUST fix spare0 = max(0, fund − COLONY.reserve) once, between steps (2) and (3).
             MUST pay Welfare = min(floor(welfare% × spare0), POLITICS.budget.welfare.maxCredits) to the
               player S5-RULE-4 names, recorded under FundLine 'welfare' and in colony.welfare.
             MUST cap step (3) at floor(projects% × spare0) in all, credits and goods together.
             Whatever no line takes stays in the fund (S5-RULE-3).
             MUST export welfareRecipient(state).
logic        → §2 S5-RULE-3, S5-RULE-4 · evaluated once at upkeep, inside runColony · reads politics.budget,
             treasury.money, score() · writes treasury.money (through fundOut), the recipient's money,
             colony.welfare, the ledger
seam         colony.ts::runColony — the only place that spends at upkeep after office pay; one step plus one
             cap on fund()
senior       junior would: pay the lines in game.ts beside payOffices, or at planning's close. · senior
             does: inside runColony, after the obligations (office pay, building upkeep) and on the same
             spare. At planning's close the fund has already been drained to the reserve by last month's
             building funding (G-5 RULE-21 row 3). Shares of one spare0 can never overspend, so design 05's
             "every line cut by the same share" is never needed. A credit cap stops Welfare from growing with
             the idle fund (5% of 6,000 would be 300 cr a month).
mechanism    in_place (a step and a cap in runColony; fund() takes a remaining-credits limit) + sprout
             (welfareRecipient)
call sites   runColony: game.ts::advancePhase 'upkeep' (one call, unchanged); fund: runColony only
pin          with budget null, G-5's RULE-21 and pace tests pass unchanged (S5-T-AC-3); the ledger invariant
             (Σ in − Σ out = Δ treasury.money, G-5 RULE-27) holds with the new line
depends_on   S5-C1 (data)
atomicity    ships with S5-C1
```

```
S5-C3 · MODIFIED · [RC] the mood reads Welfare paid

today        moodTarget reads shortages, air, tax, a broken promise, prestige and the wealth gap. G-5 C23 and
             D-G5-5 list "Welfare spend (0 until slice 5)".
             anchors: packages/engine/src/colony.ts::moodInputs, ::moodTarget, packages/engine/src/config.ts::HAPPINESS
             verified_by: read
tomorrow     MUST add Welfare paid this upkeep: + HAPPINESS.weights.welfare per welfareUnit cr, up to
             welfareCap points (S5-RULE-5).
logic        → §2 S5-RULE-5 · evaluated in runColony's last step
seam         colony.ts::moodInputs / ::moodTarget, the one formula G-5 RULE-20 owns
senior       junior would: a big direct term on top of the gap term that Welfare already narrows. ·
             senior does: a small capped term; the gap term carries the rest.
mechanism    in_place
call sites   colony.ts::runColony
pin          with no Welfare paid, every G-5 RULE-20 example gives the same target
depends_on   S5-C2
atomicity    none
```

```
S5-C4 · ADDED · [RC] any player but the Governor may call one tax overrule a month; the call freezes the tax

today        none_exists: nothing lets a player challenge the tax. setSalesTax refuses only for politics
             off, the phase, an open election, and the actor.
             anchors: packages/engine/src/politics.ts::setSalesTax, ::taxBounds, ::votesOpen
             verified_by: read; git grep -n -iE "overrule" -- packages apps finds nothing outside docs
tomorrow     MUST let a player who is not the Governor call this month's overrule on the tax, in planning
             once the votes are over, if the tax now differs from taxAtStart (S5-RULE-6, the [RC] rows).
             MUST refuse a second call in the month, and let the caller withdraw before the ballot opens.
             MUST refuse setSalesTax from the call until planning ends.
             MUST export canOverrule(state, playerId) for the views and the AI.
             The overrule's target is the union OverruleTarget ('tax' | 'budget'). RC accepts 'tax' only and
             refuses 'budget' with "Only the tax can be overruled in this version"; S5-C14 lifts that.
logic        → §2 S5-RULE-6 · evaluated at the callOverrule intent · writes politics.overrule (stage 'called')
seam         politics.ts — beside proposeLaw: a planning act, public, pending until planning ends
senior       junior would: let a call happen at any moment and settle it at once. · senior does: a pending
             call, frozen and public. The Governor's last-second change is covered too: the server clears the
             other humans' Ready on any change by the Governor (S5-C7), so there is always a moment to call
             before planning ends.
mechanism    sprout (callOverrule, canOverrule) + in_place (one refusal row in setSalesTax)
call sites   callOverrule: MuleGame.handle (S5-C7), play.ts applyAction (S5-C9), OverruleHand via VoteHand
             (S5-C6). setSalesTax: MuleGame.handle 'setTax', play.ts, VoteHand.govern.
pin          RULE-6's tax tests (bounds, Governor only, refused in the election) pass unchanged
depends_on   none
atomicity    ships with S5-C5
```

```
S5-C5 · ADDED · [RC] the overrule ballot opens as planning would end, through the votes-open seam; a majority of all vote weight restores the start of the month

today        the votes-open seam (votesOpen, votesDone, isVotesDone, stepVotes, closeVotes) runs the
             election, then the law ballot, as planning opens. Planning proper ends when every human is Ready,
             or on the host's Continue (server), or when the sim's loop moves on.
             anchors: packages/engine/src/politics.ts::votesOpen, ::votesDone, ::isVotesDone, ::stepVotes,
             ::closeVotes, ::castLawVote; apps/server/src/mule-game.ts::MuleGame (checkAllReady,
             continuePlanning, scheduleElectionTick); packages/ai/src/play.ts (planning case)
             verified_by: read (52c54b07)
tomorrow     MUST export openOverrule(state): boolean. When planning would end and a call is pending, it
             opens the ballot (the caller's ballot yes, the Governor's no) and returns true; otherwise it
             returns false.
             MUST route the seam through the ballot: votesOpen is true while it is open; votesDone and
             isVotesDone reach it; stepVotes tallies it once every player is Done, then runs a reveal of
             POLITICS.overrule.revealMs, then marks it over.
             MUST tally on a majority of all vote weight (S5-RULE-8). If it passes, MUST restore taxAtStart.
             MUST export voteOverrule (yes or no, replaceable until the ballot closes).
             MUST, in closeVotes, tally an open ballot, and let a pending call that never got its ballot
             lapse (AM-1's case).
             The Overrule record and its result are generic over the target, so S5-C14 and S5-C16 reuse
             them unchanged.
logic        → §2 S5-RULE-7, S5-RULE-8 · evaluated at openOverrule, at each vote and at each step · weights
             bind when the ballot closes · writes politics.overrule, treasury.salesTax (the restore)
seam         politics.ts's votes-open facade (slice 2a C40). The server's Ready, away, Continue and view code
             already keys on votesOpen and isVotesDone, so the ballot reaches all of it with no new branch,
             except the three spots S5-C7 names.
senior       junior would: a third stage machine in the server, or a second "open" flag. · senior does: one
             more machine in politics.ts with the law ballot's untimed shape, opened by one call that the
             server and the sim both make at "planning would end now". The tally reuses voteWeight, and the
             result shape is the council's plus needed and total, so the reveal reuses TvCouncil's frame.
mechanism    sprout (openOverrule, voteOverrule, the tally) + in_place (votesOpen, votesDone, isVotesDone,
             stepVotes, closeVotes)
call sites   openOverrule: MuleGame.checkAllReady and .continuePlanning (S5-C7), play.ts's planning case
             (S5-C9). The five seam functions, every caller (git grep -n "votesOpen\|votesDone\|isVotesDone\|
             stepVotes\|closeVotes" -- apps packages): mule-game.ts, play.ts, colony.ts, game.ts,
             politics-view.ts.
pin          the election and law-ballot tests (packages/engine/test/politics*.test.ts) pass unchanged: no
             overrule opens unless openOverrule opened it
depends_on   S5-C4
atomicity    ships with S5-C4
```

```
S5-C6 · ADDED · [RC] computer players: the AI Governor splits the budget; every AI seat calls and votes on tax overrules (hands/budget.ts)

today        VoteHand runs for office and votes. As Governor it also sets the tax, proposes a law and acts
             for the colony: the strike, repairs, and a commission at commissionShare with goodsInReach.
             anchors: packages/ai/src/hands/vote.ts::VoteHand, ::goodsInReach, ::nextTax
             verified_by: read
tomorrow     MUST add packages/ai/src/hands/budget.ts (WS7, new) with BudgetHand.split and OverruleHand.call
             and .vote (S5-RULE-11, S5-RULE-12, the [RC] rows), on WS1's lineWorth and overruleWorth (§3.2).
             MUST have VoteHand drive them:
               - split as Governor, once a month after the tax and before the law proposal and colonyActs;
               - call on every tick in planning proper with no vote open, once per new tax it has not
                 judged;
               - vote and press Done when the overrule ballot opens.
             MUST make colonyActs' commission check read the Projects credits this month (S5-RULE-13).
             MUST make an AI Governor hold its tax for the rest of a term in which a tax overrule passed
             against it.
             Every input comes from observe(state, me) (S5-HC-4). Draws come from an overrule stream built
             from the seat's own salt and the month (slice 2a INV-41), never the game's seed.
logic        → §2 S5-RULE-11, S5-RULE-12, S5-RULE-13
seam         packages/ai/src/hands/vote.ts::VoteHand — already ticked by the server (MuleGame.tickVoteHands)
             and by the sim (play.ts). The new hands are its parts, so neither host constructs anything new.
senior       junior would: a fourth hand class wired into the server and the sim, or the budget logic inline
             in vote.ts. · senior does: a separate file, as the PM's split names it ("new hands for …
             budget"), composed by the one politics hand both hosts already tick. The valuations are WS1's,
             so WS7's file holds decisions, not prices.
mechanism    sprout (budget.ts) + in_place (VoteHand.tick, .govern, .colonyActs)
call sites   VoteHand.tick: apps/server/src/mule-game.ts::MuleGame (tickVoteHands), packages/ai/src/play.ts
             (planning case). The seat's salt comes from AiSeat (packages/ai/src/seat.ts).
pin          packages/ai/test vote-hand tests (election, law ballot, colonyActs) pass unchanged when
             POLITICS.budget.welfare.maxShare is 0 and no overrule is open
depends_on   S5-C1, S5-C4, S5-C5 (contract, stubbable from §3); WS1's two valuations (stubbable: 0 gives a
             base-only budget and no calls)
atomicity    none
```

```
S5-C7 · MODIFIED · [RC] the server: three intents; the overrule ballot as planning would end; a Governor's change clears the others' Ready (WS3 named edits)

today        planning proper ends in checkAllReady, when every counted seat is Ready, or on the host's
             Continue (continuePlanning → nextPhase). Once the votes close, the election tick starts
             planning proper (startPlanning).
             anchors: apps/server/src/mule-game.ts::MuleGame (handle, checkAllReady, continuePlanning,
             scheduleElectionTick, startPlanning, tickVoteHands), apps/server/src/server.ts::isIntent
             verified_by: read
tomorrow     MUST accept setBudget, callOverrule and voteOverrule (§3).
             MUST call openOverrule(state) in checkAllReady, and in continuePlanning's planning-proper
             branch, before nextPhase. If it returns true: schedule the votes tick, add the news line,
             and return.
             MUST, in the votes tick's votes-closed branch, call nextPhase (not startPlanning) when this
             month's overrule is over.
             MUST give continuePlanning an overrule branch before its law-ballot branch: the ballot closes
             for every human not Done; in the reveal, Continue is refused with "The result is being
             announced". Without it, the council branch falls through to `state.politics!.election!`, which
             is null in a month with no election.
             MUST, after the Governor's setTax or setBudget in planning proper: clear the other humans'
             Ready, tick the vote hands once (tickVoteHands(0)), and add a news line.
             MUST add news lines for a call, a withdrawal and the result, naming no voter (§3.4).
logic        → §2 S5-RULE-7, S5-RULE-10
seam         the two points in mule-game.ts where planning already ends, plus the votes tick;
             server.ts::isIntent
senior       junior would: open the ballot from the intent handler, or run a timer at planning's end. ·
             senior does: hook the two places planning already ends, so Ready, away seats and the host's
             Continue behave as for every other vote (S5-HC-7). Clearing Ready closes the "change it at the
             last second" hole without a clock.
mechanism    in_place (named edits)
call sites   MuleGame.handle's intent switch; checkAllReady; continuePlanning; scheduleElectionTick; isIntent
pin          apps/server/test/politics.test.ts's election and council rows pass unchanged; a month with no
             call ends planning exactly as today
depends_on   S5-C4, S5-C5 (contract, stubbable)
atomicity    the three intents ship with §3's protocol types, in one contract commit
```

```
S5-C8 · MODIFIED · [RC] the views: the budget, the overrule and Welfare (WS7's politics-view.ts and colony-view.ts)

today        politicsView carries the tax, the fund, the vote weights, the election, the proposal, the council
             and the laws. myPoliticsView carries the viewer's own ballots. colonyView carries the gauges, the
             ledger and the projects.
             anchors: apps/server/src/politics-view.ts::politicsView, ::myPoliticsView, ::councilNews,
             apps/server/src/colony-view.ts::colonyView
             verified_by: read
tomorrow     MUST add PoliticsView.budget and .overrule, and MyPoliticsView.overruleBallot and .canOverrule
             (§3). Build each field by field: an overrule's ballots are read only for who has voted, and the
             totals only from the reveal (S5-RULE-10).
             MUST add ColonyView.welfare.
             MUST export overruleNews(state), as councilNews is exported.
             MUST extend the key-list test in apps/server/test/politics.test.ts (NEW_FIELD).
logic        → §2 S5-RULE-10
seam         the two WS7 view files, beside councilView
mechanism    in_place
call sites   MuleGame.viewFor (politicsView, myPoliticsView, colonyView); the votes tick (news)
pin          the existing view tests pass; the key list changes only by the new keys
depends_on   S5-C1, S5-C2, S5-C5
atomicity    none
```

```
S5-C9 · MODIFIED · [RC] the sim, the AI's moves and observe() (WS1 named edits)

today        play.ts's planning case loops the votes, ticks the hands once more, then runs planMonth.
             applyAction knows setTax, propose, voteLaw, commission and the rest. 'done' routes to votesDone
             only when an election or a council exists. observe() hides other seats' election ballots, but
             not their law-ballot ballots.
             anchors: packages/ai/src/play.ts (planning case, applyAction), packages/ai/src/actions.ts::AiAction,
             packages/engine/src/observe.ts::observe, packages/ai/src/sim.ts
             verified_by: read
tomorrow     MUST add AiAction setBudget, callOverrule and voteOverrule, with their applyAction cases.
             MUST route 'done' to votesDone while an overrule ballot is open.
             MUST, in the planning case after the Governor's tick, tick every hand once more, so a seat seated
             before the Governor can call. After planMonth, MUST call openOverrule and, if it opened, loop the
             votes as before.
             MUST hide other seats' overrule ballots in observe(). The law ballot's ballots are hidden by
             WS1's prerequisite PR (separate, already under way), not by this change.
             MUST print S5-UBER-AC-1's row and check it.
             MUST add lineWorth and overruleWorth (§3.2).
seam         WS1's files
mechanism    in_place
call sites   play.ts planning case and applyAction; observe() and its callers (every hand, unchanged);
             sim.ts main
pin          politics-off rows byte-identical (S5-HC-5)
depends_on   S5-C1, S5-C4, S5-C5, S5-C6 (contract, stubbable)
atomicity    none
```

```
S5-C10 · MODIFIED · [RC] the phone desks: the Governor's budget (P12), the tax overrule call and its ballot (P13)

today        the Governor desk holds the tax and the law picker. The Council desk holds the vote weights, the
             laws in force and next month's vote. The law ballot is its own component.
             anchors: apps/web/src/phone/hub/politics/Governor.tsx::GovernorDesk,
             apps/web/src/phone/hub/politics/Council.tsx, apps/web/src/phone/hub/politics/LawBallot.tsx,
             apps/web/src/phone/hub/politics/words.ts
             verified_by: read
tomorrow     MUST render WS6's approved mock:
               P12: the share steppers, with what each pays at today's fund and "kept in the fund", plus
                    Set and the frozen state;
               P13: "Call an overrule vote" at the tax line where each player sees it (the fund card), with
                    Withdraw and the call's banner; the overrule ballot (start vs now, needed, Yes/No,
                    Cast) in the council's ballot place.
             All of it sits inside Heiko's politics layout P0 option A (7 Nov): no new tab, at most five
             sections, and an action starts where its target is.
ux           mock: WS6, to come (start from the Governor desk's tax row and LawBallot's Yes/No) · GRAFT
             TARGET: Governor.tsx (P12), Colony.tsx's fund card (the call at the tax line), the council's ballot
             place in LawBallot.tsx (or a new OverruleBallot.tsx mounted there), words.ts
mechanism    fill_scaffold
pin          politics-desks tests for the tax and the law ballot pass unchanged
depends_on   S5-C8 (contract), WS6's approved mock (not stubbable: an implementer never designs a screen)
atomicity    none
```

```
S5-C11 · MODIFIED · [RC] the TV: the budget strip in planning, and the overrule panel and its reveal (P14)

today        the TV shows the Governor's promise under the planning header, and the law ballot and its reveal
             in their own panel. TableApp routes to that panel while the council is open.
             anchors: apps/web/src/table/TvGovernorPromise.tsx::TvGovernorPromise, apps/web/src/table/TvCouncil.tsx::TvCouncil,
             apps/web/src/table/TableApp.tsx
             verified_by: read
tomorrow     MUST render WS6's approved mock: the budget line under the promise line, the call banner, the
             overrule ballot (who has voted, and how many votes it needs), and the reveal.
ux           mock: WS6, to come (from TvCouncil's frame) · GRAFT TARGET: TvGovernorPromise.tsx, new
             apps/web/src/table/TvOverrule.tsx, one TableApp route line (WS4 named edit)
mechanism    fill_scaffold
pin          TvCouncil's tests and the TV-FIT tests pass unchanged
depends_on   S5-C8, WS6's approved mock
atomicity    none
```

```
S5-C12 · MODIFIED · [RC] the month end shows what each line paid (P15)

today        the month end's colony panel shows the air, the fund's balance and who went hungry. The ledger
             reaches the view (ColonyView.ledger), but no month-end line reads it.
             anchors: apps/web/src/components/MonthEnd.tsx::ColonyPanel, apps/web/src/game/month-end.ts,
             apps/server/src/colony-view.ts::colonyView
             verified_by: read; git grep -n "ledger" -- apps/web/src returns nothing
tomorrow     MUST render WS6's approved mock of the fund's lines this month on the phone and the TV:
             office pay, upkeep, Welfare and whom it went to, buildings, and Security after RC.
ux           mock: WS6, to come · GRAFT TARGET: MonthEnd.tsx's ColonyPanel (WS4), month-end.ts (WS4)
mechanism    fill_scaffold
pin          TV-FIT's 0.7 floor at six seats (PM ruling, 6 Nov) holds
depends_on   S5-C8, WS6's approved mock
atomicity    none
```

### After-RC changes (full part 3)

```
S5-C13 · MODIFIED · [after RC] the Security line, offered once slice 4 elects a Sheriff; its credits are slice 4's hook

today        (after the RC cut) Budget.shares carries a security key, which is always 0, because S5-RULE-1
             row 3 refuses it while 'sheriff' is not in POLITICS.offices (AM-19).
             anchors: packages/engine/src/config.ts::POLITICS (offices), packages/engine/src/politics.ts::setSalesTax
             verified_by: read
tomorrow     MUST offer Security when 'sheriff' is in POLITICS.offices.
             MUST pay it at upkeep from spare0, after Welfare and before Projects, as
             min(floor(security% × spare0), POLITICS.budget.security.maxCredits), under FundLine 'security'
             (a sink: the militia's wages).
             MUST export securitySpend(state): number, the Security line's credits this month: what its
             share pays at today's fund, after any overrule. Slice 4 reads it when orders resolve (§3.1).
logic        → §2 S5-RULE-1 row 3, S5-RULE-3
seam         the same runColony step as Welfare
senior       junior would: give Security its own timing to match the guards. · senior does: pay it like
             office pay, for work done this month, and let slice 4 read the allowance when sabotage resolves.
mechanism    in_place
call sites   runColony; the views; slice 4's sabotage resolution
pin          with no Sheriff office, S5-T-AC-3's runColony output is unchanged
depends_on   S5-C2; slice 4 restores 'sheriff' in POLITICS.offices (data, not stubbable for play;
             stubbable in tests)
atomicity    none
```

```
S5-C14 · MODIFIED · [after RC] the budget can be overruled too; any call freezes both the tax and the budget

today        (after the RC cut) callOverrule refuses 'budget', and a call freezes the tax only.
             anchors: packages/engine/src/politics.ts::setSalesTax (and RC's callOverrule)
             verified_by: none_exists until the RC cut is built
tomorrow     MUST accept target 'budget' when the shares differ from budgetAtStart. A passed budget
             overrule restores budgetAtStart.
             MUST freeze both settings from any call: setSalesTax and setBudget are both refused until
             planning ends.
logic        → §2 S5-RULE-6 rows 8b and 9, S5-RULE-8 row 1 (budget)
seam         RC's callOverrule and the tally's effect: one union member and one restore
senior       junior would: freeze only the target that was called. · senior does: freeze both. Otherwise a
             Governor who is overruled on the budget raises the tax a second later, after the month's one
             call is spent.
mechanism    in_place
call sites   as S5-C4
pin          RC's S5-T-AC-6 rows for the tax pass unchanged
depends_on   S5-C4, S5-C5
atomicity    ships with S5-C17's budget call and vote, and S5-C18's budget ballot screens
```

```
S5-C15 · MODIFIED · [after RC] a second passed overrule in a term calls a snap election next month (D-S5-3 A)

today        openPlanning opens an election only in POLITICS.electionMonths. Candidacy closes as an election
             month's planning opens, except in month 1 (candidacyClosed). takeOffice starts a new term for
             every winner.
             anchors: packages/engine/src/politics.ts::openPlanning, ::nextElectionMonth, ::canRun, ::takeOffice
             verified_by: read
tomorrow     MUST count passed overrules since the term began (politics.overruled).
             On reaching POLITICS.overrule.snapAfter, MUST set politics.snapMonth = month + 1, unless that
             month is an election month or comes after the game's end (S5-RULE-9).
             MUST open an election in snapMonth, with candidacy open in its announce, as in month 1.
             MUST let a re-elected sitting Governor continue their term: no new term counted, and governorRun
             unchanged.
             MUST make nextElectionMonth see snapMonth, so termEnd, the views and VoteHand's declare-ahead
             follow it.
             S5-C16's no-confidence vote sets snapMonth through the same function.
logic        → §2 S5-RULE-9
seam         the election's own functions in politics.ts; no new machine
senior       junior would: a separate "snap" election type, or a new term (+POLITICS.termScore Worth) for a
             Governor who was overruled twice and re-elected. · senior does: the same election held in an off
             month, with the term continuing, so being overruled twice never earns Worth.
mechanism    in_place
call sites   openPlanning (unchanged callers); nextElectionMonth: politics-view.ts::termEnd and
             ::politicsView, vote.ts::VoteHand (declareAhead)
pin          every slice-1 and untimed-election test passes unchanged while snapMonth is null
depends_on   S5-C5
atomicity    none (D-S5-3 B drops it; S5-C16 then calls the snap alone)
```

```
S5-C16 · ADDED · [after RC] the Sheriff's inquiry into the Governor, and the no-confidence vote it can open (D-S5-4 A)

today        none_exists: there is no Sheriff (AM-19) and no inquiry.
             anchors: packages/engine/src/colony.ts::keepPromise (the promise record),
             packages/engine/src/politics.ts::reputationShift
             verified_by: read; git grep -n -iE "inquiry|confidence" -- packages apps finds nothing
tomorrow     MUST let the Sheriff open one inquiry a term into the sitting Governor, in planning proper with no
             vote open and no overrule called this month (S5-RULE-14).
             MUST compute the term's public record: broken promise months, deal cards broken by the
             Governor, and overrules passed.
             MUST publish the record and the finding.
             A finding opens a no-confidence motion as this month's overrule, with target 'confidence',
             caller the Sheriff, held as planning ends by S5-RULE-7. A dismissed inquiry moves the Sheriff's
             reputation by POLITICS.inquiry.dismissedRep.
             A passed no-confidence vote sets snapMonth = month + 1, with S5-RULE-9 row 2's exceptions
             (S5-RULE-15).
logic        → §2 S5-RULE-14, S5-RULE-15
seam         politics.ts: the inquiry is a Sheriff's act beside callOverrule. The motion IS an Overrule whose
             target is 'confidence', so the ballot, the seam, the views and the screens are the overrule's.
senior       junior would: a second ballot machine for no-confidence, or the inquiry hunting design 05's
             "spent on their own plots", which cannot happen here. · senior does: one more target on the
             existing Overrule, and a finding built only from records that are already public.
mechanism    sprout (openInquiry, inquiryRecord) + in_place (the Overrule target union, the tally's effect)
call sites   MuleGame.handle (S5-C18), play.ts (S5-C18), the Sheriff's hand (S5-C17)
pin          the RC overrule tests pass unchanged
depends_on   S5-C5, S5-C15; slice 4 (the Sheriff); slice 3's DealCard (stubbable: no cards → that part of the
             record is empty)
atomicity    none
```

```
S5-C17 · MODIFIED · [after RC] computer players: the Security share, the budget overrule, the Sheriff's inquiry and the no-confidence vote

today        (after the RC cut) BudgetHand splits Projects and Welfare; OverruleHand calls and votes on the
             tax.
             anchors: packages/ai/src/hands/vote.ts::VoteHand (and RC's hands/budget.ts)
             verified_by: none_exists until the RC cut is built
tomorrow     MUST add Security to BudgetHand's fill.
             MUST let OverruleHand call and vote on 'budget'.
             MUST add InquiryHand.open for an AI Sheriff, and a no-confidence vote rule in OverruleHand.vote
             (S5-RULE-11, -12, -16, the [after RC] rows). All read observe(state, me).
             MUST make an AI Governor hold the budget, as well as the tax, after any overrule passed against it
             this term.
logic        → §2 S5-RULE-11, S5-RULE-12, S5-RULE-16
seam         hands/budget.ts, driven by VoteHand
mechanism    in_place + sprout (InquiryHand)
call sites   VoteHand.tick
pin          RC's S5-T-AC-13 and S5-T-AC-14 rows pass unchanged
depends_on   S5-C13, S5-C14, S5-C16
atomicity    none
```

```
S5-C18 · MODIFIED · [after RC] the server, the views, the sim and the screens for the full part

tomorrow     MUST let the server accept the openInquiry intent, and route its news.
             MUST let the views add the inquiry record and the 'confidence' target (§3), and P13/P14 the budget
             ballot's "start vs now" by line.
             MUST give the Sheriff's desk (P16, slice 4's) the Open-an-inquiry button.
             MUST let the sim (WS1) print S5-UBER-AC-3's counters.
ux           mock: WS6, to come (the RC panels plus the inquiry record) · GRAFT TARGET: the RC files plus
             slice 4's Sheriff desk
seam         the RC seams (S5-C7..C12), plus slice 4's desk
mechanism    in_place / fill_scaffold
depends_on   S5-C14, S5-C15, S5-C16, S5-C17; WS6's mock; slice 4's Sheriff desk
atomicity    none
```

**Reuse checks** (self-review check 6; grep, since the repo is not prism-indexed):
- S5-C1, S5-C4, S5-C5, S5-C16. `git grep -n -iE "budget|overrule|welfare|inquiry|confidence|snap ?election|militia"`
  over packages/*/src, apps/server/src and apps/web/src finds only `apps/server/src/brain/budget.ts`,
  `brain/client.ts` and `brain/index.ts`. Those are the language model's spend budget, which is a different
  thing. The AI hand file `hands/budget.ts` is in another package, and its classes are BudgetHand,
  OverruleHand and InquiryHand. The nearest neighbours are `setSalesTax` (S5-C1 copies its refusals and its
  start-of-month copy) and the council (S5-C5 copies its machine, its seam and its reveal).
- S5-C2. `runColony` is the only place that spends at upkeep after office pay. `payOffices` already pays a
  player from the fund by rule, and Welfare does the same through fundOut.
- S5-C15. The election machine is reused unchanged, opened in an off month. There is no second election
  type.
- S5-C16. The no-confidence motion is an Overrule target, so there is no second ballot machine.
- S5-C6, S5-C17. VoteHand is the politics hand both hosts tick. A new class wired into both would duplicate
  its timing.

---

## §2 · The Logic `[handoff]`

```
S5-RULE-1 · The lines offered and their bounds                     shape: decision table (classification)

inputs    line ∈ BudgetLine ('projects' | 'welfare' | 'security'); 'sheriff' ∈ POLITICS.offices
  #   line       offered when                                   share bounds (whole %)                       credit cap a month
  1   projects   politics on                         [RC]       0 ..= 100, multiple of POLITICS.budget.step (5)   none (the open buildings' needs cap it)
  2   welfare    politics on                         [RC]       0 ..= POLITICS.budget.welfare.maxShare (20)      POLITICS.budget.welfare.maxCredits (200)
  3   security   S5-C13 built and 'sheriff' ∈ POLITICS.offices [after RC] 0 ..= POLITICS.budget.security.maxShare (30)     POLITICS.budget.security.maxCredits (300)
  4   (kept)     never a setting                                100 − Σ shares stays in the fund
default    politics.budget = null means POLITICS.budget.default = { projects: 100, welfare: 0, security: 0 }:
           exactly today's runColony (S5-HC-5)
budgetLines(state)  the offered lines, in this order
unknown   a line that is not offered keeps its share in state, but budgetShares reads it as 0 (Security is
          inert until the Sheriff exists). shares is a full Record (frozen type), with a 0 for any line not
          offered.
```

```
S5-RULE-2 · Setting the budget (setBudget)                          shape: decision table

inputs    actor · phase · votesOpen · shares: Record<BudgetLine, number> · politics.overrule (this month's,
          any stage) · the offered lines and bounds (S5-RULE-1)
first match wins
  #   when                                                      then
  1   politics off                                              refuse "This game plays without the colony's council"
  2   not planning, or a vote is open                           refuse "Set the budget once the votes are over"
  3   actor ≠ Governor                                          refuse "Only the Governor sets the budget"
  4   [after RC] an overrule is called this month               refuse "An overrule vote is called: the tax and the budget hold until it is settled"
  5   a share above 0 on a line not offered                     refuse "The colony has no <line> line yet"
  6   a share not whole, < 0, above its max, or not a multiple of step   refuse "<Line> is 0% to <max>%, in steps of <step>"
  7   Σ shares > 100                                            refuse "The shares add up to <Σ>%: at most 100%"
  8   otherwise                                                 politics.budget = { month, setBy: actor, shares }
in RC     row 4 is absent: a tax overrule freezes the tax only (setSalesTax's row, S5-RULE-6). The budget
          can't be overruled in RC, so changing it after a tax call is harmless.
setSalesTax's row (RC)   an overrule on the tax is called this month → refuse "An overrule vote on the tax is
          called: it holds until it is settled". After RC, the message is row 4's, for any call.
no fund bound   shares of tomorrow's spare can never overspend, so there is nothing to check against the
                fund now.
examples  Lena sets { projects 80, welfare 10, security 0 } → row 8 · welfare 25 → row 6 · security 10
          before a Sheriff exists → row 5 · projects 95 + welfare 10 → row 7 · Kai tries → row 3
```

```
S5-RULE-3 · Paying the lines at upkeep (inside runColony)            shape: sequence

upkeep order (G-5 RULE-27, unchanged): runUpkeep → collectLawTaxes → payGrant → payOffices → runColony
runColony:
  1  standing / closed buildings pay their upkeep or close           (G-5 RULE-21 row 1, unchanged)
  2  buildings under way tick                                        (G-5 RULE-21 row 2, unchanged)
  3  NEW: spare0 = max(0, treasury.money − COLONY.reserve), fixed once; shares = budgetShares(state)
     a  [RC] welfare: to = welfareRecipient(state) (S5-RULE-4)
                      want = min(floor(shares.welfare × spare0 / 100), POLITICS.budget.welfare.maxCredits)
                      to null or want 0 → nothing; else paid = fundOut('welfare', want); money(to) += paid;
                      colony.welfare = { month, to, paid }
     b  [after RC] security: want = min(floor(shares.security × spare0 / 100), maxCredits);
                      fundOut('security', want)
     c  [RC] projects: limit = floor(shares.projects × spare0 / 100); the commissioned buildings are funded
                      in commission order, as today, but credits and goods together take at most `limit`
                      (AM-7) the limit is a ceiling, not a payment: each building takes only what it still
                      needs (credits, then goods the store can sell), and the next commissioned building may
                      take from what is left of the same limit. What no building takes stays in the fund: there
                      is no Projects balance, and it is in next month's spare0.
  4  the mood steps, reading Welfare paid                            (G-5 RULE-20 + S5-RULE-5)
why it never overspends   Σ shares ≤ 100 and each payment is floored, so a + b + c ≤ spare0. The reserve is
          never touched, and design 05's "cut every line by the same share" can never apply.
unknown   budget null → shares = POLITICS.budget.default (projects 100) → step 3c's limit = spare0, which is
          exactly today's fund() (S5-HC-5's pin). No Governor → the budget stands until the next Governor
          changes it.
invariants  the fund never falls below COLONY.reserve in step 3, nor below 0 anywhere (fundOut); the ledger's
            Σ in − Σ out = Δ treasury.money (G-5 RULE-27)
examples  fund 640 after office pay and upkeep, reserve 100 → spare0 540;
          shares projects 80 / welfare 10:
            welfare min(54, 200) = 54 to Kai; buildings take at most 432; 54 at least stays in the fund
          shares projects 100 / welfare 0 (the default): buildings take up to 540, as today
          shares projects 80 / welfare 10, the Observatory (config: 350 cr, 2 Crystite) the only open building,
          nothing funded yet, the store with no Crystite (it starts with none): it takes 350 of its 432;
          the other 82, with the 54 kept, stay in the fund (AM-7)
          spare0 6,000 with welfare 10%: min(600, 200) = 200 (the cap)
          fund 90 → spare0 0 → nothing paid, nothing funded
```

```
S5-RULE-4 · Welfare's recipient [RC]                                  shape: decision table

inputs    players · politics.governor · score(state, id) (the public Worth) · seed and month (the lot)
evaluated  at upkeep, at S5-RULE-3 step 3a (who is last after this month's auction). The views show
           welfareRecipient(state) at any moment, as "would go to X now".
first match wins
  #   when                                                     then
  1   politics off                                             nobody (AM-8: a 0% share still names who it
                                                               would go to; step 3a pays nothing at 0%)
  2   no player but the Governor                               nobody
  3   one non-Governor has strictly the lowest Worth           that player
  4   a tie for the lowest Worth among non-Governors           a draw among them, on its own stream from (seed, month,
                                                               'welfare'), drawn as politics.ts::drawLot draws
why not the Governor   money moves only by rule (S5-HC-3). A Governor in last place would otherwise vote
                       public money to themselves, so the next-lowest player gets it.
examples  Lena (Governor) 9,000 · Kai 10,500 · Brix 14,000 → Kai · Kai and Brix tied → a seeded draw ·
          a two-player game with the Governor last → the other player
```

```
S5-RULE-5 · The mood reads Welfare [RC] (G-5 RULE-20, one term added)        shape: formula

  target += HAPPINESS.weights.welfare × min(welfarePaid / HAPPINESS.weights.welfareUnit, HAPPINESS.weights.welfareCap)
            placeholders: welfare 1, welfareUnit 50 cr, welfareCap 4
  welfarePaid = colony.welfare.paid when colony.welfare.month = this month, else 0
examples  100 cr → +2 · 200 cr → +4 · nothing paid → +0 (every G-5 RULE-20 example unchanged)
```

```
S5-RULE-6 · Calling an overrule (callOverrule)                        shape: decision table

inputs    actor · phase · votesOpen · politics.governor · target ∈ OverruleTarget | null (null withdraws) ·
          politics.overrule · changed(tax) = salesTax ≠ taxAtStart ·
          changed(budget) = budgetShares now ≠ budgetShares at budgetAtStart (line by line)
first match wins
  #   when                                                      then
  1   politics off                                              refuse "This game plays without the colony's council"
  2   not planning, or a vote is open                           refuse "Call an overrule once the votes are over"
  3   target null; the actor is this month's caller; stage 'called'   withdraw: overrule = null; this month's call is free again
  4   target null, otherwise                                    refuse "There is no call of yours to withdraw"
  5   no Governor                                               refuse "There is no Governor to overrule"
  6   actor = Governor                                          refuse "The Governor can't overrule themself"
  7   an overrule is already called this month (any target, inquiry included)   refuse "<caller> already called this month's vote"
  8a  [RC] target 'budget'                                      refuse "Only the tax can be overruled in this version"
  8b  [after RC] target 'confidence'                            refuse "Only the Sheriff's inquiry opens a no-confidence vote"
  8c  the target hasn't changed since the month began           refuse "The <tax|budget> is as it was when the month began"
  9   otherwise                                                 overrule = { month, target, caller: actor, stage 'called', … }; it freezes
                                                                the tax ([RC]), and after RC both the tax and the budget (S5-RULE-2 row 4)
canOverrule(state, id)  per target: true, or the reason why not (OverruleWhy) from rows 1-8c, so the views and
                        the AI never restate the rules
unknown   no Governor when the month began (month 1 before the election) → taxAtStart and budgetAtStart are
          their values when planning opened, so a new Governor's first change can be overruled like any other
examples  Lena raised the tax 5 → 10; Brix calls 'tax' → row 9 · Lena calls → row 6 · a second call in the same month
          → row 7 · the tax unchanged → row 8c · in RC, 'budget' → row 8a
```

```
S5-RULE-7 · The overrule ballot [RC]                                  shape: state machine

stages    called → ballot (untimed) → reveal (POLITICS.overrule.revealMs, presentation only) → over
  from     event                                                    to
  called   openOverrule(state): planning would end now (every       ballot; ballots = { caller: yes, Governor: no }; done = []
           counted human Ready, the host's Continue, or the sim's
           loop at the end of planning)
  called   the caller withdraws (S5-RULE-6 row 3)                   no overrule this month
  ballot   every player Done (a cast ballot is Done; 'ready' is      reveal; S5-RULE-8 fixes the result
           Done), or the host's Continue (humans not Done abstain)
  reveal   the clock ends                                           over; the effect applies; planning ends at once
  called   the game leaves planning without openOverrule            lapses: overrule = null, nothing restored; news
           (AM-1's case, closeVotes)                                "The overrule vote on the <target> was never held"
  ballot / reveal   the game leaves planning (closeVotes)           tallied now if still in the ballot; the effect applies
ready     while the ballot is open, 'ready' is Done for it (the votes-open seam); it never ends planning by itself
continue  in the ballot: every human not Done becomes Done (abstaining), named in the news; in the reveal:
          refused with "The result is being announced"
away      an away human is not Done (S5-HC-7); the host's Continue moves past them
order     the overrule is the last vote of a planning phase: the election and the law ballot come as planning
          opens, the overrule as it ends. They are never open at once.
examples  Lena raises the tax; Brix calls; everyone presses Ready → the ballot opens on every phone → all
          cast → reveal → over → the land grant · Brix calls, then withdraws → planning ends at the last Ready
```

```
S5-RULE-8 · The overrule's result and its effect                      shape: decision table

inputs    ballots: voter → yes | no (absent = abstain) · weight = voteWeight(state, id).total at the close ·
          total = Σ weight of every player · needed = floor(total / 2) + 1 (more than half of all votes)
  #   when                       then
  1   Σ weight of yes ≥ needed   passed:
                                   [RC] tax → treasury.salesTax = politics.taxAtStart
                                   [after RC] budget → politics.budget = politics.budgetAtStart
                                   [after RC] confidence → S5-RULE-15
                                 [after RC] politics.overruled += 1 for 'tax' and 'budget' (S5-RULE-9)
  2   otherwise                  failed: the setting stands
both      the frozen setting stays frozen until planning ends, at the reveal's close. Next month the Governor may
          set again: the tax within maxStep of the restored rate (RULE-6).
public    { passed, yes, no, total, needed } from the reveal on; who voted how, never (as RULE-9, RULE-47)
why all votes   design 05: "A majority of all votes undoes it". An abstention is not a yes, so a few players can't
                overrule the Governor while the rest look away.
examples  total 9, needed 5: yes 6 → overruled · yes 4 → stands · yes 5 → overruled · two players, caller 1,
          Governor 2: total 3, needed 2 → the caller alone can't pass it
```

```
S5-RULE-9 · A snap election [after RC] (D-S5-3 A)                    shape: decision table

inputs    politics.overruled (passed tax or budget overrules since termStart) · POLITICS.overrule.snapAfter (2) ·
          month · maxMonths · POLITICS.electionMonths
callSnap(state), at an overrule's effect, first match wins:
  #   when                                                    then
  1   overruled < snapAfter (a no-confidence pass skips this row)   nothing
  2   month + 1 ∈ electionMonths, or month + 1 > maxMonths    nothing: an election is due anyway, or the game ends
  3   otherwise                                               politics.snapMonth = month + 1; news "Snap election in month <m+1>"
at openPlanning, when month = snapMonth
          an election opens as in an election month. Candidacy stays open in its announce, as in month 1
          (candidacyClosed reads month 1 or snapMonth). snapMonth = null once it opens.
takeOffice in a snap election
          termStart = month; overruled = 0. A winner who already holds the office continues: terms unchanged,
          governorRun unchanged, the new promise holds from now. A new winner starts a term as usual.
every term start   overruled = 0
nextElectionMonth  min(snapMonth, the next month in electionMonths)
examples  overruled in months 2 and 3 → none (4 is an election month) · in months 7 and 8 → a snap election in
          month 9; Lena re-elected → still her term from 7, terms[lena] unchanged; Kai elected → a new term from 9
```

```
S5-RULE-10 · Who sees what                                            shape: decision table

  item                                                   owner         other phones   TV
  the budget's shares now and at the month's start,      yes           yes            yes
  their credits at today's fund, the amount kept
  Welfare's recipient now, and who was paid              yes           yes            yes
  the call (caller, target), the frozen state            yes           yes            yes
  the ballot's stage, who has cast (done; AM-5),          yes           yes            yes
  needed, total
  one player's ballot                                    the voter     no             no      (before and after the reveal)
  yes / no totals and the verdict                        every screen, from the reveal
  [after RC] passed overrules this term, a snap month,   yes           yes            yes
  the inquiry's record and its finding
  canOverrule (why a player may not call)                the viewer only
accepted  as for the council (AM-8 (a)): totals plus a public "who has voted" list can let players at a small
          table work out a ballot by arithmetic. No screen shows a ballot.
```

```
S5-RULE-11 · BudgetHand.split (the AI Governor)                       shape: greedy fill

when      the seat is Governor; in planning proper, once a month, after VoteHand.govern sets the tax and before
          the law proposal and colonyActs. Never while an overrule on the budget is called. Never in a term in
          which an overrule passed against it (it holds).
inputs    obs = observe(state, me) · budgetLines, POLITICS.budget · the budget in force · spare =
          max(0, fund − COLONY.reserve) · open buildings' stillNeeds credits
fill      projects starts at the share whose credits at today's spare cover the open buildings' still-needed
          credits, rounded up to a step (100 when none is open; at most 100)
          welfare starts at POLITICS.ai.budget.base[persona].welfare; [after RC] security at base[persona].security
          then repeat, one step at a time: for each non-projects line below its max,
            gain(line) = (lineWorth(obs, me, line, credits(a + step)) − lineWorth(obs, me, line, credits(a)))
                         × POLITICS.ai.budget.tilt[persona][line]
            cost       = lineWorth(obs, me, 'projects', credits(p)) − lineWorth(obs, me, 'projects', credits(p − step))
                         (0 when projects would stay above its covering share)
          take the line with the best gain − cost > 0, while Σ ≤ 100 (taking from projects only above its
          covering share, or from "kept"); stop when none qualifies
          credits(s) = min(floor(s × spare / 100), the line's maxCredits)
  #   result                                      then
  1   Rookie                                      base shares only, no fill
  2   the split equals the budget in force        no action (a no-op change would invite an overrule)
  3   otherwise                                   setBudget(split)
guard     the AI never gives a line the share that covers its own open buildings' credits
```

```
S5-RULE-12 · OverruleHand.call and .vote                              shape: decision table

call      every non-Governor Classic seat, in planning proper with no vote open, once per Governor setting it
          has not yet judged; draws come from the overrule stream (the seat's salt and the month)
  #   when                                                                              then
  1   Rookie, or canOverrule(obs, me)[t] ≠ true for every target t it may call          no call
      ([RC] t = 'tax'; [after RC] also 'budget')
  2   w = overruleWorth(obs, me) for the target (RC: the tax) < POLITICS.ai.overrule.minGain   no call
  3   yesWeight = Σ voteWeight(obs, p) over the players the seat judges would gain (see §3.2) ≥ needed   call it
  4   otherwise, a draw < POLITICS.ai.overrule.longShot[persona]                         call it (a protest)
  5   otherwise                                                                          no call
vote      when the overrule ballot opens: one ballot, then Done (as the law ballot, RULE-46)
  #   when                                                   then
  1   me = Governor                                          no
  2   me = caller                                            yes
  3   Rookie                                                 a draw < POLITICS.ai.overrule.rookieYes
  4   [after RC] target 'confidence'                         S5-RULE-16's vote rows
  5   mood band ∈ POLITICS.ai.colony.leanIn                  yes when overruleWorth(obs, me) > −POLITICS.ai.overrule.unhappyTilt
  6   otherwise                                              yes when overruleWorth(obs, me) > 0
streams   the overrule stream hashes the seat's salt with the month and its own constant, like VoteHand's council
          stream, and never reads state.seed (INV-41)
```

```
S5-RULE-13 · The AI's commission composes with the budget [RC] (G-5 C25, AM-19)    shape: one condition

today     an AI Governor commissions an object when PRESTIGE[id].credits × commissionShare ≤ fund, and its goods
          are in reach (vote.ts::colonyActs)
tomorrow  … ≤ the Projects share's credits at today's fund (budgetCredits(obs).projects), since that share is
          all upkeep will give to buildings
unchanged goodsInReach, the prestige-then-credits order, payStrike and repair
```

```
S5-RULE-14 · The Sheriff's inquiry [after RC] (D-S5-4 A)                shape: decision table

inputs    actor · phase · votesOpen · politics.sheriff · politics.governor · the inquiry already opened this term ·
          politics.overrule (this month's) · the record: inquiryRecord(state) =
            { brokenPromises: Colony.promises with governor = G, month ≥ termStart, kept false (months),
              brokenDeals: Politics.deals with brokenBy = G and settled ≥ termStart (ids; slice 3),
              overruled: politics.overruled }
first match wins
  #   when                                                       then
  1   politics off, or no Sheriff office                         refuse "This game plays without a Sheriff"
  2   not planning, or a vote is open                            refuse "Open an inquiry once the votes are over"
  3   actor ≠ Sheriff                                            refuse "Only the Sheriff opens an inquiry"
  4   no Governor                                                refuse "There is no Governor to look into"
  5   an inquiry already opened this term                        refuse "The Sheriff has looked into this term already"
  6   an overrule is called this month                           refuse "<caller> already called this month's vote"
  7   the record holds at least one breach                       finding: a no-confidence motion as this month's overrule
                                                                 (target 'confidence', caller the Sheriff, stage 'called');
                                                                 news "Inquiry finds: <record>"
  8   otherwise                                                  dismissed: reputationShift(Sheriff, POLITICS.inquiry.dismissedRep);
                                                                 news "Inquiry into <G> dismissed"
both      the record is public on every screen from the moment it is opened
examples  Lena broke her cap promise in month 8 → row 7 · a clean term → row 8, Sheriff −5 (placeholder) ·
          a second inquiry in the same term → row 5
```

```
S5-RULE-15 · The no-confidence vote [after RC]                        shape: reuse

ballot    S5-RULE-7 exactly (the Sheriff is the caller, so their ballot starts yes; the Governor's starts no)
result    S5-RULE-8 (more than half of all vote weight)
effect    passed → callSnap (S5-RULE-9, skipping row 1); politics.overruled is unchanged · failed → nothing
examples  passed in month 8 → a snap election in month 9 · passed in month 9 → none (10 is an election month)
```

```
S5-RULE-16 · The AI Sheriff's inquiry and the no-confidence vote [after RC]     shape: decision table

open (InquiryHand.open: the AI Sheriff, in planning proper, at most once a term, from observe(state, me))
  #   when                                                                  then
  1   Rookie, or the record holds no breach                                 no inquiry (it never risks a dismissal)
  2   an active pact card binds it with the Governor (slice 3)              no inquiry
  3   a draw < POLITICS.ai.inquiry.opens[persona]                            open it
vote ('confidence', in OverruleHand.vote)
  1   me = Governor → no · me = Sheriff → yes · Rookie → a draw < rookieYes
  2   the Governor broke a deal card with me this term                      yes
  3   mood band ∈ POLITICS.ai.colony.leanIn                                 yes
  4   otherwise                                                             yes when the Governor leads the table on Worth, else no
```

---

## §3 · Contracts & Data Models `[handoff]`

The 7 Nov frozen types are binding and adopted unchanged: `BudgetLine`, `Budget`, `Politics.budget`,
`Politics.budgetAtStart`, and observe() as every hand's input. Everything below adds to them.

| Contract | change_kind | Breaking | Cut | Change |
|---|---|---|---|---|
| frozen: `BudgetLine`, `Budget { month; setBy; shares }`, `Politics.budget / .budgetAtStart: Budget \| null` | ADDED | no | RC | S5-C1 |
| `OverruleTarget = 'tax' \| 'budget' \| 'confidence'`, `OverruleWhy`, `Overrule`, `Politics.overrule` | ADDED | no | RC (the union is complete; RC refuses 'budget' and 'confidence' by rule) | S5-C4, S5-C5 |
| `Politics.overruled: number`, `Politics.snapMonth: number \| null`, `Politics.inquiry: { term: number; record: InquiryRecord; finding: boolean } \| null` | ADDED | no | RC adds the fields at their zero values; after RC writes them | S5-C15, S5-C16 |
| `FundLine` += `'welfare'` (RC), `'security'` (after RC; added in the RC commit, written later) | ADDED | no | RC | S5-C2, S5-C13 |
| `Colony.welfare: { month: number; to: string; paid: number } \| null` | ADDED | no | RC | S5-C2 |
| engine exports, politics.ts: `setBudget`, `budgetLines`, `budgetShares`, `budgetCredits`, `callOverrule`, `canOverrule`, `openOverrule`, `voteOverrule` (RC); `securitySpend`, `openInquiry`, `inquiryRecord` (after RC). colony.ts: `welfareRecipient` (RC) | ADDED | no | as listed | S5-C1..C5, C13, C16 |
| changed behaviour, same signatures: `votesOpen`, `votesDone`, `isVotesDone`, `stepVotes`, `closeVotes`; `setSalesTax` gains a refusal; `nextElectionMonth` sees a snap (after RC) | MODIFIED | no | RC / after RC | S5-C4, C5, C15 |
| `MuleIntent` += `setBudget`, `callOverrule`, `voteOverrule` (RC); `openInquiry` (after RC) | ADDED | no | as listed | S5-C7, C18 |
| `PoliticsView` += `budget`, `overrule` (RC); `overruled`, `snap`, `inquiry` (after RC). `MyPoliticsView` += `overruleBallot`, `canOverrule`. `ColonyView` += `welfare` | ADDED | no (optional fields, as `council?` and `strike?` were added) | as listed | S5-C8, C18 |
| `AiAction` += `setBudget`, `callOverrule`, `voteOverrule` (RC); `openInquiry` (after RC) (WS1's actions.ts) | ADDED | no | as listed | S5-C9, C18 |
| config: `POLITICS.budget`, `POLITICS.overrule`, `POLITICS.ai.budget`, `POLITICS.ai.overrule` (RC); `POLITICS.inquiry`, `POLITICS.ai.inquiry` (after RC); `HAPPINESS.weights.welfare`, `.welfareUnit`, `.welfareCap` (RC) | ADDED | no | as listed | S5-C1..C6, C16 |

**First commit (WS3, the contract freeze).** It contains every type below, the after-RC union members and
fields included, so the after-RC work never reopens types.ts or the protocol. The engine functions are
signatures that throw `'not built'` until WS7 builds them.

```ts
// packages/engine/src/types.ts (WS3 named edit). The frozen part, verbatim:
export type BudgetLine = 'projects' | 'welfare' | 'security';
export interface Budget {
  month: number;
  setBy: string | null;     // the Governor, or null for the default
  shares: Record<BudgetLine, number>;   // whole percent of the fund above COLONY.reserve; sum <= 100; the rest stays in the fund
}
// Politics.budget: Budget | null (null = POLITICS.budget.default); Politics.budgetAtStart: Budget | null.

// Slice 5's own additions:
/** What a vote of this kind can undo; 'confidence' is the Sheriff's inquiry's no-confidence motion (after RC). */
export type OverruleTarget = 'tax' | 'budget' | 'confidence';
/** Why a player may not call an overrule on a target now (S5-RULE-6). */
export type OverruleWhy = 'politicsOff' | 'notNow' | 'noGovernor' | 'governor' | 'called' | 'notYet' | 'sheriffOnly' | 'unchanged';
/** This month's overrule or no-confidence motion: called in planning, voted as planning ends, revealed, over. */
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
/** The Governor's public record for the term, as the inquiry reads it (S5-RULE-14). */
export interface InquiryRecord {
  brokenPromises: number[];   // months
  brokenDeals: string[];      // DealCard ids (slice 3)
  overruled: number;
}
// Politics gains (newPolitics: budget null, budgetAtStart null, overrule null, overruled 0, snapMonth null, inquiry null):
//   overrule: Overrule | null;
//   overruled: number;              // tax and budget overrules passed since termStart (after RC writes it)
//   snapMonth: number | null;       // after RC
//   inquiry: { term: number; record: InquiryRecord; finding: boolean } | null;   // this term's, after RC
// FundLine gains 'welfare' | 'security'. Colony gains welfare: { month: number; to: string; paid: number } | null.
```

```ts
// packages/engine/src/politics.ts (WS7) — signatures
export function budgetLines(state: GameState): BudgetLine[];                          // S5-RULE-1, in order
export function budgetShares(state: GameState): Record<BudgetLine, number>;           // in force, default applied, unoffered = 0
export function budgetCredits(state: GameState): Record<BudgetLine, number>;          // what each share pays at today's fund (S5-RULE-3)
export function setBudget(state: GameState, playerId: string, shares: Record<BudgetLine, number>): void;  // S5-RULE-2
export function canOverrule(state: GameState, playerId: string): Record<OverruleTarget, true | OverruleWhy>;
export function callOverrule(state: GameState, playerId: string, target: OverruleTarget | null): void;     // S5-RULE-6
export function openOverrule(state: GameState): boolean;                              // S5-RULE-7: called → ballot
export function voteOverrule(state: GameState, voterId: string, yes: boolean): void;
// after RC
export function securitySpend(state: GameState): number;                              // slice 4's hook (§3.1)
export function inquiryRecord(state: GameState): InquiryRecord;
export function openInquiry(state: GameState, playerId: string): void;                // S5-RULE-14
// packages/engine/src/colony.ts (WS7)
export function welfareRecipient(state: GameState): string | null;                    // S5-RULE-4
```

```ts
// packages/protocol/src/index.ts (WS3 named edit)
// MuleIntent +=
  /** Planning, once the votes are over: the Governor's whole budget, whole-percent shares per line. */
  | { type: 'setBudget'; shares: Record<BudgetLine, number> }
  /** Planning, once the votes are over: call this month's overrule vote; null withdraws your call. */
  | { type: 'callOverrule'; target: OverruleTarget | null }
  /** The overrule (or no-confidence) ballot: yes undoes it; a later vote replaces it until the ballot closes. */
  | { type: 'voteOverrule'; yes: boolean }
  /** After RC. Planning: the Sheriff opens this term's inquiry into the Governor. */
  | { type: 'openInquiry' }

export interface BudgetView {
  /** The lines offered, in order: the share now and at the month's start, the bounds, and the credits it pays at today's fund. */
  lines: { line: BudgetLine; share: number; start: number; maxShare: number; step: number; credits: number; maxCredits: number | null }[];
  /** 100 − Σ shares: stays in the fund. */
  kept: number;
  /** Who Welfare would go to now (S5-RULE-4), sent at every share, 0% included, so the Governor sees it before setting one; null only when S5-RULE-4 names nobody (AM-5). */
  welfareTo: string | null;
  /** The Governor who set it, or null for the default. */
  setBy: string | null;
  /** True from a call until planning ends, when the budget holds (after RC: any call; in RC: never). */
  frozen: boolean;
}

export interface OverruleView {
  target: OverruleTarget;
  caller: string;
  stage: Overrule['stage'];
  /** What a yes restores and what stands now; for 'confidence', the Governor in question. */
  restores: { tax: number } | { shares: Record<BudgetLine, number> } | { governor: string };
  stands: { tax: number } | { shares: Record<BudgetLine, number> } | { governor: string };
  voted: string[];
  done: string[];
  waitingFor: string[];
  clockMs: number;
  revealMs: number;
  total: number;
  needed: number;
  result: { passed: boolean; yes: number; no: number } | null;
}

// PoliticsView +=  budget?: BudgetView | null; overrule?: OverruleView | null;                       (RC)
//                  overruled?: number; snap?: number | null;
//                  inquiry?: { record: InquiryRecord; finding: boolean } | null;                       (after RC)
// MyPoliticsView += overruleBallot?: boolean | null; canOverrule?: Record<OverruleTarget, true | OverruleWhy>;
// ColonyView +=     welfare?: { month: number; to: string; paid: number } | null;
```

**Worked example** (Brix's phone, month 6, RC; the tax overrule ballot is open; Lena governs; four players):
```json
"politics": { "governor": "lena", "tax": { "percent": 10, "start": 5, "low": 5, "high": 15 },
  "budget": { "lines": [
      { "line": "projects", "share": 80, "start": 80, "maxShare": 100, "step": 5, "credits": 432, "maxCredits": null },
      { "line": "welfare",  "share": 10, "start": 10, "maxShare": 20,  "step": 5, "credits": 54,  "maxCredits": 200 } ],
    "kept": 10, "welfareTo": "kai", "setBy": "lena", "frozen": false },
  "overrule": { "target": "tax", "caller": "brix", "stage": "ballot",
                "restores": { "tax": 5 }, "stands": { "tax": 10 },
                "voted": ["brix", "lena", "ai1"], "done": ["lena", "ai1"], "waitingFor": ["brix", "kai"],
                "clockMs": 0, "revealMs": 4000, "total": 7, "needed": 4, "result": null }, … },
"me": { "politics": { "overruleBallot": true, "canOverrule": { "tax": "called", "budget": "notYet", "confidence": "sheriffOnly" }, … } }
```
No other player's view holds Lena's or ai1's ballot.

### §3.1 · Hooks for slice 4 [after RC]

This slice supplies, and slice 4 (ws7-slice4-sabotage) decides:
- `securitySpend(state): number`, new in politics.ts, the name slice 4 calls. It is the Security line's
  credits this month: what its share pays at today's fund, after any overrule. Slice 4 reads it when the
  sabotage orders resolve. It is 0 while `'sheriff'` is not in `POLITICS.offices`, and 0 in RC whatever
  the offices (AM-3): S5-PR-1 exports it returning 0, and S5-C13 gives it its body after RC. Slice 4 turns it into its own
  numbers: guards, investigations, detection and the escort, in slice 4's config. Design 05 gives 1 guard
  plus 1 per 100 cr, 2 investigations at 200 cr, and the escort at 200 cr.
- **Read it when sabotage resolves, not when the guards are placed.** The fund moves between planning and
  upkeep, and after RC a budget overrule as planning ends can lower the Security share after the Sheriff
  has placed guards. Slice 4's rule must say which guards count when the allowance falls. WS7 suggests the
  latest placed drop first.
- Slice 4 restores the Sheriff by putting `'sheriff'` back in `POLITICS.offices`, in RC (plan A). Security
  and the inquiry still wait for their after-RC changes, S5-C13 and S5-C16 (AM-3).
- The inquiry needs `Politics.sheriff`, and slice 4's Sheriff desk for its button (P16).

### §3.2 · Hand decisions and the values they need (the WS7 ↔ WS1 contract) `[handoff]`

Every hand reads `observe(state, me)` (S5-HC-4). Classic seats need no API key; Smart seats run the same
code until WS2's port takes these decisions.

| Hand · method | Cut | Runs when | Inputs (all from obs) | Output | Values called |
|---|---|---|---|---|---|
| `BudgetHand.split(obs)` (new, hands/budget.ts) | RC: projects, welfare; after RC: + security | the seat is Governor; once a month in planning proper, inside VoteHand.govern after the tax, before proposeLaw and colonyActs; not after an overrule passed against it this term | budgetLines, POLITICS.budget, the budget in force, the fund, open buildings' stillNeeds | shares → `setBudget`, or none | `lineWorth` |
| `OverruleHand.call(obs)` (new) | RC: tax; after RC: + budget | any non-Governor seat; every VoteHand tick in planning proper with no vote open, once per Governor setting it has not judged (the server ticks the hands after a Governor's change, S5-C7) | canOverrule, taxAtStart vs tax (budgetAtStart vs budget), voteWeight of every player | target → `callOverrule`, or none | `overruleWorth` |
| `OverruleHand.vote(obs)` (new) | RC; after RC: + 'confidence' rows | when the overrule ballot opens: one ballot, then Done | the open overrule, the mood band; after RC the record and deal cards | yes/no → `voteOverrule`, then `done` | `overruleWorth` |
| `InquiryHand.open(obs)` (new) | after RC | the seat is Sheriff; planning proper; at most once a term | inquiryRecord, its own deal cards | → `openInquiry`, or none | none (S5-RULE-16 is a rule over public facts) |
| `VoteHand.colonyActs` (existing) | RC | as today | + `budgetCredits(obs).projects` | the commission check (S5-RULE-13) | none new |
| `VoteHand.govern` (existing) | RC | as today | + whether an overrule passed against it this term | holds the tax (and, after RC, the budget) | none new |

**WS1's valuations** (packages/ai/src/value.ts; pure functions, in credits, no randomness). The signatures
are **proposed; WS1 owns the final shape**.

```ts
/**
 * Credits this month that player `me` gains from `line` paying `amount` cr at this upkeep, against the line
 * paying 0. Non-decreasing in `amount`.
 */
export function lineWorth(obs: GameState, me: string, line: BudgetLine, amount: number): number;
```
It must account for:
- **projects:** what `amount` more toward the open buildings is worth to `me`: the months it brings each
  one forward × (its perk's value to `me`, i.e. the park, hospital and stadium event modifiers, + its
  prestige's mood points × the value of a mood point to `me`). 0 when no building is commissioned, or when
  every open one waits only for goods (§0's measurement: today it is mostly 0).
- **welfare:** `amount` if `me` is `welfareRecipient(obs)` now, else 0. Plus the mood points it buys
  (S5-RULE-5) × the value of a mood point to `me`.
- **security** [after RC]: the expected sabotage loss on `me`'s plots this month that the guards and
  detection it buys would prevent. It reads slice 4's `captureOdds` (frozen export) and is 0 until then.
- **The value of a mood point to `me`** is internal to WS1. For the sitting Governor it is the change in
  re-election chance × POLITICS.termScore (AI voters lean against the incumbent in
  POLITICS.ai.colony.leanIn bands). For everyone it is the expected loss from the mood's social events it
  avoids.
- It does not count the fund's own wealth term, which is no player's Worth.

```ts
/**
 * Credits this month that player `me` gains if this month's overrule passes (negative: `me` loses).
 * The overrule is the one called in obs (obs.politics.overrule); with none called, the tax.
 */
export function overruleWorth(obs: GameState, me: string, target?: OverruleTarget): number;
// target is optional: it defaults to the called target (obs.politics.overrule), else 'tax'.
// Computed only from facts in obs (WS7, 7 Nov).
```
It must account for:
- **tax:** (taxAtStart − salesTax) × the sales `me` is expected to make in this month's auctions (the
  seller pays, economy.ts::taxSale), minus the share of the lost tax income that would have reached `me`
  through the budget's lines (lineWorth).
- **budget** [after RC]: Σ over lines of [lineWorth(at budgetAtStart's credits) − lineWorth(at now's
  credits)].
- **confidence** [after RC]: not used. S5-RULE-16's vote rows are rules.

**What the hands need beyond these two:**
1. **Weighing other players.** The call's yes-weight estimate calls `overruleWorth(obs, p)` for other
   players `p` on the seat's own obs. WS1 must therefore compute it from facts public in obs. For the tax,
   other players' expected sales use what observe() implies about their stock, as the market panel does.
2. **A hypothetical target.** To judge a call before one exists, the hand passes `target`. In RC the
   only target it passes is 'tax'; after RC it also passes 'budget'. WS7 agreed this on 7 Nov.

WS1 may stub both functions to 0 at first. The AI then sets only its persona's base shares and never calls
an overrule. That is a legal, playable state, so S5-C6 does not wait on WS1.

### §3.3 · The split by owner `[handoff]`

| File | Owner (SEAMS) | Cut | Named edit |
|---|---|---|---|
| packages/engine/src/types.ts | WS3 | RC (all of §3's types, after-RC members included) | the frozen types plus §3's additions: one commit, the contract freeze |
| packages/protocol/src/index.ts | WS3 | RC (all of it) | four intents; `BudgetView`, `OverruleView`; optional view fields. Same commit |
| packages/engine/src/politics.ts | WS7 | RC: S5-C1, C4, C5; after RC: C13 (securitySpend), C14, C15, C16 | setBudget and the budget reads; openPlanning's budgetAtStart; callOverrule, canOverrule, setSalesTax's row; openOverrule, voteOverrule, the tally, the five votes-open functions; snap; inquiry |
| packages/engine/src/colony.ts | WS7 | RC: S5-C2, C3; after RC: C13 | runColony's line step and the projects cap on fund(); welfareRecipient; Colony.welfare; the mood term; Security's payment |
| packages/engine/src/config.ts, POLITICS block | WS7 | RC / after RC | `POLITICS.budget = { step: 5, default: { projects: 100, welfare: 0, security: 0 }, projects: { maxShare: 100 }, welfare: { maxShare: 20, maxCredits: 200 }, security: { maxShare: 30, maxCredits: 300 } }`; `POLITICS.overrule = { revealMs: 4_000, snapAfter: 2 }`; `POLITICS.ai.budget = { base, tilt }` per persona per line; `POLITICS.ai.overrule = { minGain: 20, longShot, rookieYes: 0.5, unhappyTilt: 30 }`; after RC `POLITICS.inquiry = { dismissedRep: -5 }`, `POLITICS.ai.inquiry = { opens }`. All placeholders |
| packages/engine/src/config.ts, HAPPINESS block | WS1's numbers (D-G5-4), WS7 named edit | RC | `weights.welfare: 1, welfareUnit: 50, welfareCap: 4` |
| packages/engine/src/observe.ts | WS1 | RC | hide other seats' overrule ballots (S5-HC-4). The council's ballots come from WS1's prerequisite PR. |
| packages/engine/src/game.ts | WS3 | — | **no change** |
| apps/server/src/mule-game.ts | WS3 | RC: S5-C7; after RC: openInquiry | the intents; openOverrule at planning's end; the overrule branch in continuePlanning; nextPhase after the overrule; clear Ready and tick the hands after a Governor's change; news |
| apps/server/src/server.ts | WS3 | RC / after RC | isIntent |
| apps/server/src/politics-view.ts | WS7 | RC / after RC | S5-C8's views, overruleNews; the inquiry view |
| apps/server/src/colony-view.ts | WS7 (built in G-5 W2, 0817b677; PM to confirm in SEAMS) | RC | ColonyView.welfare |
| apps/server/test/politics.test.ts | WS7 | RC / after RC | the NEW_FIELD key list |
| packages/ai/src/hands/budget.ts | WS7 (new; the PM's AI split) | RC / after RC | BudgetHand, OverruleHand; InquiryHand after RC |
| packages/ai/src/hands/vote.ts | WS7 | RC | VoteHand drives the new hands; colonyActs; govern holds |
| packages/ai/src/value.ts | WS1 | RC (projects, welfare, tax) / after RC (security, budget) | lineWorth, overruleWorth |
| packages/ai/src/actions.ts | WS1 | RC / after RC | AiAction +3 (+1) and their MOVES descriptors |
| packages/ai/src/play.ts | WS1 | RC / after RC | applyAction; 'done' routing; the extra tick and the openOverrule loop |
| packages/ai/src/sim.ts | WS1 | RC / after RC | S5-UBER-AC-1's row; S5-UBER-AC-3's counters |
| apps/web/src/phone/hub/politics/{Governor.tsx, Council.tsx, words.ts}, new OverruleBallot.tsx | WS7 (SEAMS 2026-10-22: hub/politics/**) | RC / after RC | P12, P13 |
| apps/web/src/table/TvGovernorPromise.tsx, new TvOverrule.tsx | WS7 (TvGovernorPromise built by WS7, 806966f5; TvCouncil's precedent, ab5ccdcd; PM to confirm in SEAMS) | RC | P14 |
| apps/web/src/table/TableApp.tsx | WS4 | RC | one route: the overrule panel while it is open (the election first, then the law ballot, then the overrule) |
| apps/web/src/components/MonthEnd.tsx, apps/web/src/game/month-end.ts | WS4 (PM ruling, 6 Nov) | RC | P15 |
| the Sheriff desk (P16) | slice 4's owner | after RC | the Open-an-inquiry button |
| apps/web/e2e/politics.ts | WS7 (SEAMS 2026-10-22) | RC / after RC | S5-UBER-AC-2's step; the after-RC step |
| design/mocks (WS6's mock app) | WS6 | RC / after RC | P12-P16 mocks → Heiko |
| docs/rulebook/colony-and-politics.html, open-designs.html | WS7 | both | "Designed, not in the game yet" on the day Heiko rules, then built text in each PR |

Nobody new writes `state.politics` (only politics.ts) or the fund (only colony.ts). WS8's
`components/ColonyActions.tsx` is not touched: commissioning stays as it is.

### §3.4 · Leak points `[handoff]`

The frozen HC-4 rule lists four leak points. For this slice the only secret is a ballot (who voted how);
everything else here is public by design (S5-RULE-10).

| Leak point | Rule |
|---|---|
| observe() (WS1) | other seats' `overrule.ballots` are removed, as the election's are. The council's ballots are hidden by WS1's separate prerequisite PR. |
| server views (WS7's politics-view.ts) | `OverruleView` is built field by field: `voted` = the ballot keys, never the values. `MyPoliticsView.overruleBallot` holds the viewer's own ballot only. With WS3's `partyTo(viewerId, secret)` helper, a ballot's party is its voter. |
| news and notices (WS3's mule-game.ts, WS2's brain chat notices) | a call, a withdrawal, the result (totals) and, after RC, the inquiry and the snap: none ever names how anyone voted. The brain's notices carry the same lines as the news. |
| MonthReport | it carries the ledger (public money) and nothing about ballots. `Colony.welfare` is public. |
| the record (apps/server/src/record.ts, WS3) | it keeps every intent, `voteOverrule` included, because replay needs them. It is a server file written at game over, never a player's view. Any future screen that shows a record must apply partyTo to ballot intents. |

---

## §4 · Failure & Ops `[handoff]`

| Question | |
|---|---|
| Dependency unavailable? | None external. The budget, the overrule, the inquiry and the AI are all in-process and seeded. Smart seats make no model call for them in RC. |
| Retry / poison? | A refused intent throws RuleError and reaches the player as a message. Nothing retries, and a hand's refused act is not retried (VoteHand's rule). |
| Idempotency | setBudget sends the whole set of shares, as a set rather than a delta. voteOverrule sets a value. A second call is refused (one a month). callOverrule null withdraws only the caller's own call. |
| Races | Intents and the votes tick share the server's one event loop. A frozen setting refuses a change. A call after the last Ready can't happen: the ballot is already open, so a call then is refused with "once the votes are over". |
| What still works when the overrule breaks? | The host's Continue closes any ballot. With politics off, the whole game plays as today (S5-HC-5). With the default budget (null), runColony is today's. |
| How an operator knows it works | The month report's ledger (`welfare`, then `security`), the news lines and the sim's row. |

## §5 · Delivery `[handoff]`

Code-only, with no existing state to reach: games live in the server's memory, and the sim starts fresh
each run. `newPolitics` gives every new game the new fields.

The rulebook's open-designs page gains the slice as "Designed, not in the game yet, WS7" the day Heiko
rules. Each build PR then moves its part into colony-and-politics.html, with the after-RC parts staying in
open designs until they are built.

Rollback is a revert. Without one: set the welfare maxShare to 0 (the budget's Welfare goes inert), and
with no `openOverrule` call the overrule never opens.

## §6 · Acceptance Criteria `[handoff]`

| id | Cut | Given / When / Then | changes | observed_at | negative case |
|---|---|---|---|---|---|
| S5-B-AC-1 | RC | Given Lena governs in month 3 with two phones and AI seats · When she sets Projects 80, Welfare 10 · Then every phone's desk and the TV show "Welfare 10% → Kai" with its credits at today's fund; at the month end every screen shows the Welfare line paid to Kai, and Kai's money rose by that much at upkeep | S5-C1 C2 C8 C10 C11 C12 | the phone, TV and month-end DOM in the e2e; Kai's money in the server view before and after upkeep | Lena last on Worth: Welfare goes to the next-lowest, never to Lena |
| S5-B-AC-2 | RC | Given 540 spare at upkeep, shares Projects 80 / Welfare 10 · When upkeep runs · Then Welfare pays 54, buildings take at most 432, and the rest stays; when the only open building, the Observatory, still needs 350 cr and the store has no Crystite, it takes 350 and 82 more stay (AM-7); with 6,000 spare Welfare pays its 200 cap | S5-C2 | the month's ledger out and the projects' funded credits (engine) | budget null → buildings may take all 540, as today |
| S5-B-AC-3 | RC | Given Lena raised the tax from 5% to 10% · When Brix calls a tax overrule and everyone presses Ready · Then the overrule ballot opens on every phone; once all have cast, every screen shows the totals and "Overruled" at once, and the next sale is taxed at 5% | S5-C4 C5 C7 C10 C11 | the phones' and TV's DOM; the seller's money after the first sale that month | yes below needed → "The Governor's tax stands", 10% applies |
| S5-B-AC-4 | RC | Given Brix called a tax overrule · When Lena tries to change the tax · Then it is refused with "An overrule vote on the tax is called: it holds until it is settled" | S5-C4 | the RuleError message (server test) | with no call, the change succeeds |
| S5-B-AC-5 | RC | Given an overrule ballot is open · When a human has not cast · Then nothing closes, however long; the host's Continue closes it and the news names them; in the reveal, Continue is refused | S5-C5 C7 | server state and news (server test) | every human has cast → it closes with no Continue |
| S5-B-AC-6 | RC | Given four AI seats and no API key · When a game plays with politics on · Then the AI Governor sets a budget, AI seats call and vote on tax overrules, and every overrule ballot closes without a human | S5-C6 C9 | ai test on seeded games; the sim row (S5-UBER-AC-1) | Rookie seats never call |
| S5-B-AC-7 | after RC | Given a Sheriff and the Security share at 20% · When upkeep runs · Then Security pays its credits under 'security', and slice 4 reads securitySpend | S5-C13 | ledger; securitySpend (engine) | no Sheriff office → Security refused (S5-RULE-2 row 5) |
| S5-B-AC-8 | after RC | Given Brix called a budget overrule · When it passes · Then budgetAtStart's shares are paid at upkeep, and the month end shows them | S5-C14 | ledger; the views | Lena changing the tax after the call → refused (both frozen) |
| S5-B-AC-9 | after RC | Given Lena was overruled in month 7 · When she is overruled again in month 8 · Then every screen shows "Snap election in month 9", and month 9 opens an election with candidacy open; if Lena wins, her term and term count are unchanged | S5-C15 | the views; Politics.terms and termStart (engine) | a second overrule in month 3 → no snap (4 is an election month) |
| S5-B-AC-10 | after RC | Given Lena broke her cap promise in month 8 · When Sheriff Ossa opens an inquiry · Then every screen shows the record and "Inquiry finds", the no-confidence ballot opens as planning ends, and a pass calls a snap election | S5-C16 | the views; politics.snapMonth | a clean term → "dismissed", and the Sheriff's reputation drops by dismissedRep |
| S5-T-AC-1 | RC | (serves B-AC-1, B-AC-4) S5-RULE-2's rows 1-3 and 5-8, and setSalesTax's freeze row, one test each, with their messages | S5-C1 C4 | engine | — |
| S5-T-AC-2 | RC | (serves B-AC-2) S5-RULE-3's examples; the ledger invariant holds in every month of a seeded game with shares set | S5-C2 | engine | — |
| S5-T-AC-3 | RC | (serves B-AC-2) with budget null, every G-5 RULE-21 and pace test passes unchanged, and runColony's output on a fixed state equals today's | S5-C2 | engine (pin) | — |
| S5-T-AC-4 | RC | (serves B-AC-1) S5-RULE-4's rows; the Governor is never the recipient; a tie draws from its own stream, and a seeded game's elections are identical with and without Welfare | S5-C2 | engine | — |
| S5-T-AC-5 | RC | (serves B-AC-1) S5-RULE-5's examples | S5-C3 | engine | — |
| S5-T-AC-6 | RC | (serves B-AC-3) S5-RULE-6 rows 1-8a, 8c and 9 for the tax; canOverrule gives the same reason as each refusal | S5-C4 | engine | — |
| S5-T-AC-7 | RC | (serves B-AC-3, B-AC-5) S5-RULE-7's transitions: openOverrule with no call returns false; called → ballot → reveal → over; a withdrawn call holds no ballot; a call never opened lapses on leaving planning; an open ballot is tallied | S5-C5 | engine | — |
| S5-T-AC-8 | RC | (serves B-AC-3) S5-RULE-8's examples; a passed tax overrule restores taxAtStart | S5-C5 | engine | — |
| S5-T-AC-10 | RC | (serves B-AC-3, B-AC-5) the server opens the ballot at the last Ready and at the host's Continue; after the reveal, planning ends at once (no second planning proper, no second AI planMonth); a Governor's setTax or setBudget clears the other humans' Ready | S5-C7 | server test | a month with no call ends planning at the last Ready, as today |
| S5-T-AC-11 | RC | (serves B-AC-3) each screen's view follows S5-RULE-10 and §3.4; the key-list test lists the new keys | S5-C8 | the views a phone, the TV and the board receive (server test) | the voter's own view holds their ballot |
| S5-T-AC-12 | RC | (serves all) politics off: no budget, no overrule, no Welfare; WS1's politics-off rows are byte-identical | S5-C1..C9 | sim report diff | — |
| S5-T-AC-13 | RC | (serves B-AC-6) BudgetHand per S5-RULE-11: it never takes the share that covers its own open buildings; a split equal to the budget in force sends nothing; a Rookie sets base only; it holds after an overrule passed against it this term | S5-C6 | ai test | — |
| S5-T-AC-14 | RC | (serves B-AC-6) OverruleHand per S5-RULE-12 (call rows 1-5 and vote rows 1-3, 5, 6 for the tax); the overrule stream leaves the election's and council's fixtures unchanged; no hand reads state.seed; every hand input is observe(state, me) | S5-C6 | ai test | — |
| S5-T-AC-15 | RC | (serves B-AC-6) colonyActs commissions only when the share ≤ budgetCredits(obs).projects (S5-RULE-13) | S5-C6 | ai test | budget null → the same commission as today |
| S5-T-AC-16 | RC | (serves S5-UBER-AC-1) the sim prints the row and checks it on every politics seed set | S5-C9 | `pnpm sim` | — |
| S5-T-AC-17 | RC | (serves B-AC-3) observe() for seat B never holds seat A's overrule ballot | S5-C9 | engine/ai test | seat A's own observe holds it |
| S5-T-AC-18 | after RC | (serves B-AC-7) S5-RULE-1 row 3 and S5-RULE-3 step 3b; securitySpend after an overrule | S5-C13 | engine | — |
| S5-T-AC-19 | after RC | (serves B-AC-8) S5-RULE-6 rows 8b, 8c and 9 for the budget; S5-RULE-2 row 4; a passed budget overrule restores budgetAtStart | S5-C14 | engine | — |
| S5-T-AC-9 | after RC | (serves B-AC-9) S5-RULE-9's rows and examples; a re-elected sitting Governor keeps terms and governorRun; nextElectionMonth returns the snap month | S5-C15 | engine | snapMonth null → every slice-1 and untimed-election test passes |
| S5-T-AC-20 | after RC | (serves B-AC-10) S5-RULE-14's rows; S5-RULE-15's effect | S5-C16 | engine | — |
| S5-T-AC-21 | after RC | (serves B-AC-7..10) the hands per S5-RULE-11/12/16's after-RC rows; S5-UBER-AC-3's counters print | S5-C17 C18 | ai test; `pnpm sim` | — |

Invariants for every test:
- the fund never goes below 0;
- runColony's step 3 never takes the fund below COLONY.reserve;
- nothing writes `state.politics` except politics.ts, and nothing writes the fund except colony.ts;
- at most one overrule (or no-confidence motion) a month;
- a ballot is never in another seat's view.

## §7 · Risks & Spikes `[review-only]`

- **AI seats overrule every tax raise.** Pace set C puts every AI Governor's tax target at 10% (AM-19). A
  raise from 5% costs every seller, so most AI seats would vote yes.
  - *Mitigation:* an AI Governor holds its tax for the rest of a term in which it was overruled
    (S5-RULE-11; S5-T-AC-13). That caps an all-AI game at one tax overrule per AI Governor term.
  - After RC, the same hold keeps AI play from reaching a snap election on its own.
  - WS1's row reports overrules and the tax's share of the fund's income, so Heiko's "taxes stay the
    fund's largest income" (AM-19) stays visible. A passed overrule halves that month's tax income at most.
- **The lines starve the buildings (G-5's 4-5 a game).**
  - *Argued from measurement (§0):* about 6,000 cr a game is idle (about 5,400 at grant 200), and every
    building still open at game end already has its credits.
  - Shares can never overspend. Welfare is capped at 200 cr a month, so at most 2,200 a game; Security
    after RC adds at most 3,300.
  - The AI never gives Welfare the share that covers its open buildings (S5-RULE-11).
  - *Gate:* S5-UBER-AC-1 fails if buildings per game fall by more than 0.2 against welfare maxShare 0 on
    the same seeds.
- **A human Governor sets Projects low and starves the buildings.** That is the Governor's choice, and it
  is visible: the TV's budget strip and the month end show it. The budget overrule (after RC) is the
  table's answer.
- **Welfare becomes a kingmaker.** It is capped, goes to the last player by rule, and never to the Governor
  (S5-HC-3). WS1's row reports Welfare per recipient.
- **The observe() HC-4 gap.** `packages/engine/src/observe.ts::observe` hides `election.ballots` but not
  `council.ballots`. WS1's separate prerequisite PR closes that. S5-C9's observe edit hides the overrule
  ballots only (S5-T-AC-17).
- **Planning gets longer in months with a call.** The ballot ends the moment everyone casts; only the
  reveal is clocked. At most one call a month.
- **Slice 4 slips.** Security and the inquiry never appear (S5-RULE-1 row 3, S5-RULE-14 row 1). The RC cut
  doesn't depend on slice 4.
- **The screens wait on WS6's mock.** Engine, AI, server and views go first; the screens follow the mock.
- *Landmines from memory:*
  - shared what-if copies (FM-WS3-4): every write goes through politics.ts's and colony.ts's `edit()`;
  - seeded streams (slice 2a INV-41): the overrule stream hashes the seat's salt;
  - politics-off byte-identical: S5-T-AC-12;
  - Ready keyed on `votesOpen`: S5-C7's three named spots.

No spike needed.

## §8 · Amendments `[review-only]`

```
AM-1 · 2026-11-07 · WS7 (binding frozen types + Heiko's plan A) · before build

target    §0, §0.1, §0.3, §1, §2, §3, §6, §10
said      lines in credits a month (Welfare, Security), buildings get "the rest"; overrule on tax and budget in
          one cut; inquiry recommended out
did       adopted the frozen Budget: whole-percent shares of the fund above the reserve for projects,
          welfare and security, summing to at most 100, with the rest kept. Welfare and Security get a
          monthly credit cap in config. The default budget is Projects 100, today's behaviour. The RC cut
          is Projects + Welfare and the tax overrule. Security, the budget overrule, the snap election and
          the inquiry are designed in full and tagged after RC. The inquiry's finding is the term's public
          breach record (D-S5-4), since "own plots" can't occur. The no-confidence vote reuses the overrule
          machine as target 'confidence'. WS1's confirmed signatures are lineWorth(obs, me, line, amount) and
          overruleWorth(obs, me).
because   S5-1: the frozen contract lets five lanes build in parallel; plan A's cut ships S5-1's two halves
          (a spending choice and a push-back vote) by 18 Nov
goal      S5-1 — unchanged
```

```
AM-2 · 2026-11-07 · WS7 (final, after crossed messages) · before build

target    §0 Today, What the table sees, §1 S5-C9, C10, C13, §3.1, §3.2, §3.3, §3.4, §6 S5-T-AC-17, §7
said      securityFunds; WS1's signatures "confirmed"; overruleWorth(obs, me); observe() hides both kinds of
          ballot; no layout cited
did       the design of 3c1f030c is kept as it was (the frozen BudgetLine with 'projects', Projects as a real
          capping line, the RC / after-RC tags). Changes:
          - the hook is securitySpend(state), the name slice 4 calls;
          - the grant note: measured at 250, ruled 200 (#633), and why the conclusion holds;
          - Heiko's politics layout P0 option A is cited: the budget lives in the Governor desk, "Call an
            overrule" starts at the tax line, and the ballot uses the council's place, with no new tab;
          - WS1's signatures are marked proposed, and overruleWorth gains an optional target;
          - observe() hides overrule ballots only; the council's ballots come from WS1's prerequisite PR.
          WS7 confirmed: Politics.budget null = POLITICS.budget.default (Projects 100), and the per-line
          credit caps.
because   S5-1: the names and places must match the lanes and the approved layout they build against
goal      S5-1 — unchanged
```

```
AM-3 · 2026-11-07 · WS7 (plan time: the slice 5 plan writer's finding) · before build

target    S5-RULE-1 row 3, §3.1
said      Security is offered whenever 'sheriff' is in POLITICS.offices; slice 4 restoring the Sheriff makes
          Security appear "with no other change here"
did       Slice 4 restores the Sheriff in RC (Heiko's plan A, 7 Nov), and plan A puts Security after RC. Row 3
          now also needs S5-C13 built, so RC's budgetLines are Projects and Welfare whatever the offices.
          securitySpend is exported in S5-PR-1 returning 0 (slice 4 reads it in RC); S5-C13 gives it its body.
because   without it the RC cut would offer a Security line plan A left out
goal      S5-1 — unchanged
```

```
AM-4 · 2026-11-07 · Heiko (board, 12:54Z, via PM): "Approve all six as recommended"

target    the decisions for Heiko
did       D-S5-2 → A (as planning ends), D-S5-3 → A (snap election after two overrules, after RC), D-S5-4 → A (the Governor's public breaches, after RC). The build builds the spec as written.
goal      S5-1 — unchanged
```

```
AM-5 · 2026-11-07 · WS7, answering WS6's four questions while drawing P3 (#689), via PM

target    What the table sees (P12 row, the Ready words), §3 BudgetView.welfareTo, S5-RULE-10, OverruleView.voted
did       (1) P12's example numbers now come from §3's worked example (80% = 432 cr, 10% = 54 cr: one spare of
          540 cr); the old "about 120" and "about 430" could not come from one fund. (2) welfareTo is sent at every
          share, 0% included, so the Governor sees the recipient before setting a share; null only when S5-RULE-4
          names nobody. (3) "Who has voted" on every screen is `done` (who has cast). `voted` holds the ballot
          keys, which include the preset ballots (the caller's yes, the Governor's no), so no screen shows it
          as "has voted"; the frozen type keeps the field. (4) The overrule ballot and its reveal get their own
          Ready words.
because   WS6 found the four drawing the mock; the screen must not say a preset ballot was cast
goal      S5-1 — unchanged
```

```
AM-6 · 2026-11-07 · WS7 (build: S5-PR-1 group B; the plan's drift item 7) · the promise is checked on the tax that stands

target    §1 S5-C5 (the tally's effect), the tax promise check (colony.ts::keepPromise)
said      nothing: game.ts::advancePhase calls keepPromise before closeVotes. When planning ends normally the overrule
          is tallied at the end of its reveal, so the promise is checked on the tax put back; when the host's
          Continue closes a still-open overrule ballot, closeVotes tallies it after the promise was checked
did       on every path the Governor's promise is checked against the tax that stands as planning ends: a passed
          overrule's restored tax. keepPromise reads the pending overrule's outcome through politics.ts's pure
          tally, so the Continue path agrees with the normal one; game.ts (WS3) is not edited. Example: Lena
          promised a cap of 10%, set 12%; the overrule passes → the tax is 10% again and the promise counts as
          kept, on either path.
because   two paths through the same month must not give two answers; the colony judges the tax it pays, and
          the restore is what the overrule is for
goal      S5-1 — unchanged
```

```
AM-7 · 2026-11-07 · WS6's finding while drawing P12 (#689), via PM · a share the buildings don't need stays in the fund

target    What the table sees (P12's Projects line and "Kept"), §2 S5-RULE-3 step 3c and its examples, §6 S5-B-AC-2
said      "Projects 80%: 432 cr toward the Observatory", but config's Observatory costs 350 cr and 2 Crystite: it
          can never take 432, and the spec did not say where the rest goes or what the line then reads
did       the Projects share is a ceiling: each open building takes only what it still needs, in commission order,
          the next one from what is left of the same limit; what no building takes stays in the fund (no Projects
          balance; it is in next month's spare). P12 reads "Projects 80%: up to 432 cr", then each open building
          and what it still needs ("· the Observatory still needs 350 cr and 2 Crystite"), from the colony view's
          cost and funded the phone already holds; "Kept in the fund 10%, and what the buildings don't take".
          `BudgetView.lines[].credits` stays the share's limit (budgetCredits, as built): no contract change. The
          worked example now uses config's numbers: 350 of 432 taken, 82 more stay.
because   a line that promised 432 toward a building that needs 350 would tell the Governor the wrong amount; "up
          to" is true at every need, and the need is already on the phone
goal      S5-1 — unchanged
```

```
AM-8 · 2026-11-07 · WS7 (build: #701's boundary review, Important 2) · Welfare's recipient is named at 0% too

target    §2 S5-RULE-4 row 1; colony.ts::welfareRecipient
said      row 1 named nobody when the Welfare share is 0, while AM-5 sends welfareTo "at every share, 0% included"
did       row 1 is "politics off" only: welfareRecipient names the player rows 2-4 pick at any share, so the
          Governor's desk shows who Welfare would go to before a share is set. Paying is unchanged: S5-RULE-3
          step 3a pays nothing when the want is 0.
because   AM-5 is the later decision, made for the Governor's screen; the server cannot rebuild rows 2-4 itself
          (the tie stream is the engine's)
goal      S5-1 — unchanged
```

```
AM-10 · 2026-11-08 · WS7 (build: S5-PR-2; the lead's ruling) · the engine counts passed tax overrules from the RC

target    S5-C6's hold; S5-C15's count (politics.overruled)
said      the count was after-RC (S5-C15), but the RC's hold needs to see an earlier month's pass
did       the engine counts passed tax overrules from the RC, in politics.overruled, and a new term (every election,
          a re-elected Governor's included) resets it to 0. No snap election: S5-C15's snap stays after RC. The AI
          Governor reads the count (obs.politics.overruled > 0) and holds its tax and budget
because   the implementer found openPlanning clears `overrule` each month, so a hand could only remember a pass in
          memory, which is lost if it is rebuilt
goal      S5-1 — unchanged
```

```
AM-11 · 2026-11-08 · WS7 (build: S5-PR-2's logic review, I1 and I2) · the AI Governor keeps no share back; Projects takes the rest

target    §2 S5-RULE-11 (fill), S5-T-AC-13
said      projects "starts at the share that covers the open buildings", and a fill step costs nothing "while projects would stay above its covering share", which read as if the AI kept the rest in the fund
did       Projects takes every share the base and the fill leave, and never less than its covering share: projects = max(cover, 100 − the other lines). There is no "kept" from the AI. Each fill step comes from Projects, and its cost is the drop in lineWorth(projects). WS1's §3.2 contract makes that drop flat above the covering share (what Projects is worth is the months it brings forward), so the cost is 0 there, as the old wording meant. Each other line takes min(its base, its maxShare, what is left after the covering share and the lines before it), so the split is always exactly 100
because   under AM-7 the Projects share is a ceiling, so a share no building needs stays in the fund anyway. Giving it to Projects means a building opened later in the month is not short. That serves S5-UBER-AC-1 (buildings per game)
goal      S5-1, unchanged
```

## §9 · Ownership Boundaries `[handoff]`

No ownership change:
- `packages/engine/src/politics.ts` remains the sole writer of `state.politics`, now including the budget,
  the overrule, the snap month and the inquiry. The merged set's two other writers each own fields of their
  own, and none of this slice's: diplomacy.ts writes `Politics.deals` (slice 3 §9), sabotage.ts writes
  `Politics.sabotage`, `guards` and `rumoured` (slice 4 §9).
- `packages/engine/src/colony.ts` remains the sole writer of the fund and of `state.colony`, now including
  the lines and `colony.welfare`. Welfare's write to a player's money sits in colony.ts beside fundOut, as
  office pay's sits in politics.ts::payOffices.
- Enforcement, as in G-5 §9 and slice 2a §9: the ledger invariant test (S5-T-AC-2), and the review rule
  "no other file writes state.politics (beyond the two field owners above) or treasury.money".

## §10 · Sizing `[review-only]`

**RC cut (12-16 Nov, for RC on 18 Nov):**

| PR | Owner | Contents | Days | Can start |
|---|---|---|---|---|
| PR-0 contract | WS3 (WS7 drafts from §3) | types.ts + protocol: every §3 type, after-RC members included; engine signatures that throw 'not built' | 0.5 | at once |
| PR-1 engine | WS7 | S5-C1..C5, config, S5-T-AC-1..8 | 1.5 | after PR-0 |
| PR-2 AI hands | WS7 | S5-C6; S5-T-AC-13..15 on WS1 stubs | 1 | after PR-0; finishes against PR-1 |
| PR-3 sim and values | WS1 | S5-C9: lineWorth and overruleWorth (projects, welfare, tax), actions, play, observe, sim row; S5-T-AC-16, -17 | 1.5 | after PR-0 |
| PR-4 server | WS3 | S5-C7, S5-T-AC-10 | 1 | after PR-0 |
| PR-5 views | WS7 | S5-C8, S5-T-AC-11 | 0.5 | after PR-0, beside PR-4 |
| mocks | WS6 | P12-P15 → Heiko | 1 | at once |
| PR-6 desks and TV | WS7 | S5-C10, C11, the e2e step (S5-UBER-AC-2) | 1.5 | after the mocks are approved and PR-4/PR-5 |
| PR-7 month end and route | WS4 | S5-C12, the TableApp route | 0.5 | after the mocks and PR-5 |

After the contract commit, five lanes run at once (WS7, WS1, WS3, WS6, then WS4). The tightest path is
mock approval → PR-6 → e2e, which leaves about a day of slack.

**After RC (full part 3, right after 18 Nov):**

| PR | Owner | Contents | Days |
|---|---|---|---|
| PR-8 engine | WS7 | S5-C13, C14, C15, C16; S5-T-AC-9, 18-20 | 1 |
| PR-9 AI | WS7 | S5-C17 | 0.5 |
| PR-10 values and sim | WS1 | security and budget valuations, the target parameter (§3.2), S5-UBER-AC-3's counters | 1 |
| PR-11 server and views | WS3 + WS7 | openInquiry intent, news, the inquiry view | 0.5 |
| PR-12 screens | WS7 (+ slice 4's desk owner) | P13, P14 for the budget ballot and the inquiry, P16's button; the e2e step | 1 |

No types or protocol commit is needed after RC: PR-0 carries every type.
