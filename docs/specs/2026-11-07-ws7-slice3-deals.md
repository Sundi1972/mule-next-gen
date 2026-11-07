# WS7 politics · slice 3: deal cards and reputation

Programme amendment to `docs/specs/2026-10-22-ws7-politics.md` (D1 slice 3) · WS7 design writer · 2026-11-07 ·
**Status:** written and self-reviewed, for WS7's merge into the politics amendment set and Heiko's ruling (design
approvals 9-12 Nov, build 12-16 Nov). Base `origin/feat/strategist` 52c54b07. **Serves Mission Goal G-4.**

Ids: changes S3-C1+, rules S3-RULE-1+, constraints S3-HC-1+, proofs S3-UBER-AC-1+, ACs S3-B-AC-n / S3-T-AC-n. Slice 4
(sabotage, the Sheriff) uses S4-, slice 5 (budget) S5-; the parent's UBER-AC-3 is reused as written, split into legs.

---

## §0 · Business Goals & Value `[handoff: goal lines and proofs]` `[review-only: who / today / value / cost]`

Provenance: Heiko, 22 Oct, ruled the politics §0 (P-2: "Players make pacts and keep or break them, and everyone can see
who is trustworthy") and D1's slice order (slice 3 = deal cards and reputation). Heiko, 7 Nov (SEAMS 2026-11-07T10:27Z):
the first release candidate has "All 3 parts + Claude's social side too", with "computer players use them"; he picked
plan A (RC 18 Nov), in which "Deal cards and reputation" ship **full**. Mission G-4's proof (program.yaml) is "set in
WS7's approved spec section 0 (sim with AI elections and laws, balance checks hold; e2e with whispers, a deal card and a
vote)": S3-UBER-AC-1 is that e2e for slice 3, S3-UBER-AC-2 its sim row.

**S3-1 (P-2) · Players make pacts and promises on deal cards, keep or break them, and everyone can see who is
trustworthy.**
- *Who benefits:* every player at the table who wants to cooperate or scheme; a solo player against AI seats, who needs
  computer players whose word means something (00-concept, "Solo play").
- *Today:* talk binds nothing. Whispers and five reactions work (`packages/tabletop/src/protocol.ts::ChatMessage` has a
  `to`; `packages/protocol/src/index.ts::EMOTES`), but no card, pact or promise exists in the engine, protocol, server or
  web (`git grep -niE 'dealcard|deal card|\bpact|offerCard|diplomacy' packages/*/src apps/server/src apps/web/src` → no
  hit). Reputation starts at 50 (`packages/engine/src/config.ts::START`) and only the "blamed for the unrest" event moves
  it, by 1 point (`packages/engine/src/events.ts::applyEvents`); the rulebook counts 21 blamings to lose a vote. A
  player's reputation shows on nobody's screen but their own ballot ("a name of 50",
  `apps/web/src/phone/hub/politics/ElectionDay.tsx`); `PlayerView` has no reputation field. The approved hub mock shows
  a deal card and "+ Deal" marked "soon, slice 3" (`design/mocks/ws6-ux/src/screens/PlanningHub.tsx`). The Governor's tax
  promise is checked every month (`packages/engine/src/colony.ts::keepPromise`) but only tilts the colony's mood.
  verified_by: read.
- *Value:* a promise across the table becomes a card one tap accepts, and breaking it costs something everyone sees: the
  "Traitor!" moment (00-concept, "Moments built for the table"), a reputation that feeds vote weight, and AI seats that
  refuse a liar. Planning gets a second social game beside the vote.
- **UBER-AC-3 (parent, as approved; legs named here):** an e2e with two phones: (A) Lena whispers Brix, attaches a
  non-aggression pact card, and Brix accepts it with one tap; both phones list the pact. (B) When Lena is later caught
  sabotaging Brix, her reputation falls by the pact-break amount on every screen. (C) An AI seat offered the same card
  answers it within the planning phase with no API key set. **Legs A and C are slice 3's. Leg B waits for slice 4's
  capture**, which calls this slice's hook (S3-C4); until then its engine half is S3-T-AC-15.
- **S3-UBER-AC-1 (G-4's "e2e with whispers, a deal card and a vote"):** a step in the politics e2e (no new file), two
  phones and AI seats, in an election month: Brix runs for Governor; Lena whispers Brix and attaches a vote promise
  ("Lena votes for Brix for Governor"); Brix accepts with one tap and both phones list it; at the ballot Lena's phone
  shows "You promised Brix your vote" and she votes for another candidate. When the result shows, every screen (both
  phones and the TV) shows Lena's reputation `POLITICS.reputation.moves.voteBroken` lower, and the TV and the news say
  Lena broke a vote promise to Brix. Nothing changed on any screen before the result showed.

**S3-2 (Heiko, 7 Nov: "computer players use them") · Computer players offer, answer, keep and break deal cards, so a
table of AI seats plays the same social game.**
- *Who benefits:* the solo player and every mixed table; Heiko's playtest first.
- *Today:* AI seats run, vote, set the tax and propose laws by code (`packages/ai/src/hands/vote.ts::VoteHand`); there
  is no `deal.ts` hand (SEAMS reserves `packages/ai/src/hands/{vote,deal}.ts` for WS7), and no AI value reads
  reputation (`git grep -niE 'trust|reputationCost|cardWorth' packages/ai/src` → no hit). verified_by: read.
- *Value:* the AI seats court, bargain and betray in code, keyless and replayable; Claude's social side (WS2) later uses
  the same cards through the same intents.
- **S3-UBER-AC-2:** `pnpm sim` on all three seed sets (1, 101, 201), politics on: AI seats accept at least one card in
  at least 80% of games; at least one vote term settles (kept or broken) in at least half of the games; each seed set has
  at least one break by an AI seat; and the reputation spread at game end (highest minus lowest) is at least
  `POLITICS.reputation.moves.kept` in at least half of the games. The politics row prints cards offered, accepted, kept,
  broken and void. Every check that passes with politics off still passes, and politics-off output is byte-identical.
- **UBER-AC-3 leg C** (above) is also S3-2's: an AI seat answers a human's card within planning, keyless.

**Non-goals** `[review-only]`:
- **Anything of value on a card** (HC-3): no money, goods, plots or MULEs, ever. Cards carry pacts and vote promises only.
- **Borrowed votes** (design 05's fifth weight source) and **campaign law promises** ("no land tax", handed to slice 3
  by AM-16): not in RC unless Heiko picks D-S3-1 option B or C (below).
- **Joint ventures** (shared adjacency): a production change, WS1's; the mock's "joint venture" wording goes.
- **The Sheriff's bribe card** and **investigating a broken deal**: slice 4 (the Sheriff's powers).
- **Releasing a partner from an active card**, and offers outside planning (00-concept allows deals in real-time
  phases; "planning is where they belong"): later.
- **Reputation moving store prices** (00-concept): a WS1 balance change after the sim shows reputation moves (parent
  non-goal).
- **Claude seats issuing cards from their reasoning** (WS2 C10, B-AC-B7): after RC (Heiko's plan A); this spec freezes
  the contract WS2 builds on (§3, "WS2's port").
- **A pact channel** (00-concept's shared chat for pact partners): WS2/WS4 chat work, not in RC.
- **Screens before WS6 mocks them** (HC-46 carries over).

**Rough cost:** chosen about 10 PRs (PR-0 to PR-9), about 12 lane-days including WS6's mocks, about 4.5 days elapsed
from Heiko's ruling (Sizing). Thin baseline about 5 PRs (§0.1).

## What the table sees `[review-only]`

Places only; WS6 mocks every layout (`ux: mock: WS6, to come`). "Laptop" is the phone app at wide width (the shell's
1100 px layout), so it shows what the phone shows.

| Moment | The two parties' phones | Other phones | TV |
|---|---|---|---|
| Lena whispers Brix and taps **+ Deal** | Lena: the Talk desk's whisper to Brix opens the card composer (P1): a pact (1, 3 or 6 months) and/or a vote promise (who promises, which ballot: the next Governor election or the law up for a vote, and the choice) | nothing | nothing |
| The card arrives | Brix: the card in the whisper thread and on the agenda ("1 deal offer"), with Lena's and his own reputation, **Accept / Decline** (P2). Lena: "Waiting for Brix", **Withdraw** | nothing | nothing |
| Brix accepts | both: the card in **My cards** as active, with what each owes and until when (P3) | nothing | nothing |
| Planning ends with the card unanswered | both: the card shows "lapsed" | nothing | nothing |
| The ballot opens and Lena holds a vote promise | Lena: "You promised Brix your vote", Brix preselected; she still casts | nothing | nothing |
| The result shows: Lena **kept** it | Lena's chip +3 beside her name everywhere; tapping it reads "kept a promise" | the same chip change, no partner named | the chip on the players strip changes |
| The result shows: Lena **broke** it | Lena's chip −10; My cards marks it broken | the chip change, a public line "Lena broke a vote promise to Brix" (D-S3-2) | a break banner and the news line (P5) |
| Lena is caught sabotaging Brix during a pact (slice 4) | the "Caught!" moment says "… and broke her pact with Brix", her chip −20 | same | same |
| A pact runs out unbroken | both: "Pact kept", +3 each (only in a game where sabotage is on) | the chip change | the chip change |
| The Governor breaks the tax promise (first time in a term) | — | every phone: the line and the chip −10 | banner and news |
| Every moment | a reputation chip beside every player's name: phone standings, hub names, TV players strip (P4) | same | same |
| The month end | — | the month's public reputation moves, breaks first | the same list on the TV's month end |
| An AI seat | its offers arrive like a human's ("Ossa"); it answers yours within seconds, before planning can end | — | — |

## Decisions for Heiko `[review-only]`

**D-S3-1 · Which cards ship in the release candidate.** *What you will see at the table:* a "+ Deal" button on a
whisper that offers a pact, a vote promise, or both on one card ("a pact for 3 months, and you vote yes on the land
tax"); the Governor's tax promise now costs reputation when broken.
- **A (recommended): pact + vote promise** (either party promises one vote on the next Governor election or on the law
  up for a vote; both may, so a card can swap votes), plus reputation on the existing campaign tax promise. About 12
  lane-days (Sizing). *For:* the PM's thin form plus the swap, which is the card the hub mock already sketches as "soon,
  slice 3" ("Non-aggression pact · 3 months + Vote together on the land tax"); every break is checkable by the engine alone. *Against:* defers the law
  promises you asked for on 22 Oct (AM-11: "law promises with slice 2", moved to slice 3 by AM-16).
- **B: A + a campaign law promise** on a Governor's candidacy ("I won't propose a land tax"; broken the moment they
  propose it). About +1 day, most of it WS6's: it changes the election picker you approved "as shown" (AM-11), and WS6 is
  the RC's bottleneck (~17 serial days, SEAMS 2026-11-07T10:29Z). *For:* honours AM-11 in RC.
- **C: B + borrowed votes** (another player's whole vote weight for one month). About +2-3 days: a second weight path in
  `voteWeight`, the weight panel, the ceremony's blocks and the council's tallies. *Against:* a vote promise on the one
  ballot that matters already does what a loan does, without one player casting two weights.
- *Recommendation:* **A**, with B straight after RC (its engine half is one RULE row).

**D-S3-2 · What the table learns when a vote promise is broken.** *What you will see:* when the result shows, either
"Lena broke a vote promise to Brix" on the TV, or only Lena's reputation dropping.
- **(a) Recommended: public, naming the breaker, the partner and the kind** ("a vote promise"), never the choice. *For:*
  the design's "Traitor!" moment and "breaking a promise made on a deal card costs reputation"; a break nobody can name
  deters nobody. *Against:* it tells the table one thing about Lena's secret ballot (that she did not vote as promised).
  She accepted that check when she signed; no other ballot is ever revealed (RULE-9's one accepted exception stays
  the Baron's).
- **(b) Public that Lena broke "a promise", partner and kind told to Brix only.** Keeps more of the ballot secret; the
  table sees a drop with no story.
- **(c) Private: only Brix is told; the reputation number still drops for all.** The ballot stays fully secret; the
  drop is unexplained on every other screen.

Decided here, as WS7's designer (recorded, not Heiko's unless he wants them): pacts break only on an attributed sabotage
(S3-RULE-5); abstaining on a promised ballot is a break (S3-RULE-4); votes never fall below 1 (S3-RULE-8); kept
reputation is capped per partner per term (S3-RULE-3); AI seats refuse cards from players below 30 (S3-RULE-9, design
00: "AI players who refuse to deal with you"); offers lapse when planning ends (the mock: "expires at Ready").

## §0.1 · Decision Record `[review-only]`

- **Chosen (~10 PRs, ~12 lane-days).** One new engine module, `packages/engine/src/diplomacy.ts` (a WS7 path in SEAMS),
  owns a new `GameState.diplomacy` (cards and a public reputation log) and is the only writer of reputation. Cards are
  offered, answered and withdrawn by three intents in planning; a vote term settles when its ballot's result takes
  effect (politics.ts calls in), a pact at its last upkeep or on slice 4's attributed sabotage. A new `DealHand` offers
  and answers for every AI seat on its own seeded stream; `VoteHand` keeps or breaks a promise at its vote; WS1 supplies
  six pure valuations. The views add a public reputation chip and log, and each player's own cards.
- **Thin baseline (~5 PRs): a pact card and a one-way vote promise; AI seats only answer (accept if the card costs them
  nothing), never offer or break; reputation shown on the owner's phone and the ballot only.** *Loses because* S3-2 and
  Heiko's 7 Nov condition need computer players that *use* cards, and an AI that never offers or breaks a card never
  starts a deal at an AI-only table (check: SEAMS 2026-11-07T10:27Z, "computer players use them"); and P-2's "everyone
  can see who is trustworthy" needs reputation on every screen, which `PlayerView` lacks today (check:
  `packages/protocol/src/index.ts::PlayerView`).
- **Larger (D-S3-1 C, +2-3 days):** borrowed votes and campaign law promises. Not chosen; see D-S3-1.
- **Rejected seam: cards inside `Politics`.** `politics.ts` is the sole writer of `state.politics` (parent §9), so a
  deal module writing it would make two writers; a separate field lets `observe()` hide one object (the parent C1's
  reason) and leaves the election code untouched.
- **Rejected: preset ballots for promised votes.** Setting Lena's ballot when it opens would put her in the public
  "voted" list at once, telling the table she holds a promise (HC-4). The phone preselects locally instead (S3-C21).

## §0.2 · Constraints `[handoff]`

```
S3-HC-1  No card moves money, goods, plots or MULEs. offerCard/answerCard/withdrawCard and every settlement leave every
         player's money, stock, tiles and carried MULE unchanged.   source: parent HC-3, 00-concept 21 Oct   breach: fatal
S3-HC-2  A card, its terms and its kept/void outcome are seen only by its two parties (phones, observe(), notices).
         Public: reputation numbers, every reputation move with its cause, and a broken term's breaker, partner and
         kind (D-S3-2). Never the choice a broken vote term named, never a card id off the parties' screens.
                                                               source: parent HC-4                     breach: fatal
S3-HC-3  packages/engine stays pure; cards draw no randomness. AI deal draws come from DealHand's own stream hashed from
         the seat's salt and the month (slice 2a INV-41), so no election, council or game draw moves.
                                                               source: CLAUDE.md, slice 2a HC-41       breach: fatal
S3-HC-4  Politics off: diplomacy is null, the three intents are refused, no reputation moves from cards, and WS1's
         politics-off sim output stays byte-identical.          source: parent HC, slice 2a HC-42       breach: fatal
S3-HC-5  Every number is a named value in config.ts's POLITICS block (POLITICS.deals, POLITICS.reputation,
         POLITICS.ai.deals, POLITICS.weight.minVotes); hashing salts carry `// literal-ok:` (WS1's INV-1 guard).
                                                               source: CLAUDE.md, parent HC-2           breach: fatal
S3-HC-6  A reputation change from a ballot shows when that ballot's result shows (the ceremony's end, the law reveal's
         end), never at ballot close: earlier, the chips would leak the result.   source: RULE-62/64     breach: fatal
S3-HC-7  Rules throw RuleError with the words a player sees.    source: CLAUDE.md                       breach: fatal
S3-HC-8  Edits outside WS7's paths are the named edits in the split table, recorded in SEAMS before the PR.
                                                               source: programme rule                  breach: decision
S3-HC-9  No screen before WS6's slice-3 mock is approved by Heiko; the mock is the scaffold.
                                                               source: parent non-goals, HC-46          breach: fatal
```

## §1 · Solution Design `[handoff]`

The repo is not prism-indexed: call-site lists are grep-built (`git grep -n`), a weaker claim than find-refs.

```
S3-C1 · ADDED · the diplomacy state: cards and the reputation log, null with politics off

today        no deal state. Reputation is Player.reputation, written by politics.ts::reputationShift (its only
             caller: packages/engine/src/events.ts::applyEvents, blamedForUnrest).
             anchors: packages/engine/src/types.ts::GameState, ::Player, packages/engine/src/game.ts::createGame,
             packages/engine/src/politics.ts::reputationShift
             verified_by: read
tomorrow     MUST add GameState.diplomacy: Diplomacy | null (§3), set by createGame to newDiplomacy() when politics
             is on and null when off. MUST add packages/engine/src/diplomacy.ts, the only writer of
             state.diplomacy, every write through a copy-on-write edit() like politics.ts's.
logic        → §2 S3-RULE-1 (a card's life)
seam         types.ts (WS3 named edit) + game.ts::createGame one line beside `politics:` (WS3 named edit); diplomacy.ts
             (new, WS7 path per SEAMS row 232)
senior       junior would: put cards on Politics or on Player. · senior does: one field, so observe() filters one
             object, cloneForSim copies one, and politics.ts stays the sole writer of state.politics (parent §9).
mechanism    sprout
call sites   createGame: apps/server/src/mule-game.ts::MuleGame (start), packages/ai/src/play.ts::playGame, tests
reuse check  `git grep -niE 'dealcard|deal card|\bpact|diplomacy' packages/*/src apps/server/src` → none. Nearest:
             packages/engine/src/types.ts::Deal is the auction's buyer-seller pair (a name clash: the new type is DealCard);
             politics.ts::edit is the copy-on-write pattern reused.
depends_on   none
```

```
S3-C2 · ADDED · offer, withdraw and answer a card in planning

today        none.
tomorrow     MUST let a player offer one other player a card of terms (a pact, and/or one vote term per party) in
             planning, withdraw it until answered, and let the other accept or decline it with one call; MUST refuse
             everything S3-RULE-2 refuses, with its words; MUST resolve each vote term to the exact ballot it binds at
             offer time. MUST export resolveTerms(state, from, to, offers) so the AI hand and the views resolve a
             ballot exactly as offerCard does.
logic        → §2 S3-RULE-1, S3-RULE-2 · evaluated at each intent · writes state.diplomacy.cards
seam         diplomacy.ts (new): offerCard, withdrawCard, answerCard, resolveTerms, cardsOf
senior       junior would: let the phone name the ballot by month, or store free text. · senior does: the phone sends
             {kind:'election', office} or {kind:'law'}; the engine pins the month and the proposal, so a later proposal
             or a later election can never satisfy an old promise.
mechanism    sprout
call sites   server intents (S3-C11), DealHand (S3-C13), play.ts applyAction (S3-C16), engine tests
reuse check  `git grep -niE 'offer|accept|decline' packages/engine/src` → only the auction's walk sides and lots
             (no answerable object). Nearest shape: lots.ts listings (an owned thing with withdraw = unlistLot);
             not reused, the lifecycle differs (an answer by another player).
depends_on   S3-C1 (data)
```

```
S3-C3 · ADDED · a vote term settles when its ballot's result takes effect

today        the election seats winners at the ceremony's end (takeOffice); a law takes effect at its reveal's end
             (takeEffect); AM-1's closeVotes runs both when planning ends early.
             anchors: packages/engine/src/politics.ts::takeOffice, ::takeEffect, ::closeVotes, ::stepVotes
             verified_by: read
tomorrow     MUST, as takeOffice runs, judge every open vote term bound to this month's election by S3-RULE-4 from the
             closed ballots and apply the reputation moves; MUST do the same for law terms as takeEffect runs; MUST
             void, when planning closes, any vote term whose ballot month has come and gone unsettled.
logic        → §2 S3-RULE-4, S3-RULE-3 · reads election.ballots / council.ballots (secret, engine-only) · writes
             cards' outcomes and the log (through diplomacy.ts)
seam         politics.ts::takeOffice and ::takeEffect each gain one call to diplomacy.ts's settleVotes(state, 'election'
             | 'law') (WS7's own file); the void sweep is in closePlanningDeals (S3-C8)
senior       junior would: judge at ballot close. · senior does: at the result's take-effect, so the chips never move
             during the ceremony (S3-HC-6); weights for the tally are taken at close as today, so a break never changes
             the ballot it broke.
mechanism    sprout + in_place (two one-line calls)
call sites   takeOffice: stepElection (ceremony end), closeElection; takeEffect: stepVotes, closeVotes. All in
             politics.ts.
pin          the election and council tests (packages/engine/test/politics*.test.ts) pass unchanged with no cards
depends_on   S3-C1, S3-C2 (data)
```

```
S3-C4 · ADDED · pacts run, expire kept, and break on an attributed sabotage (slice 4's hook)

today        no sabotage exists (slice 4 designs it in parallel); no pact.
tomorrow     MUST end a pact's terms kept at the upkeep of its last month. MUST export
             pactBreach(state, saboteurId, victimId, sabotageMonth): boolean, which slice 4 calls whenever a sabotage
             is attributed to a player (caught on the spot, or later revealed by an investigation), and which breaks the
             saboteur's pact term with the victim if a pact bound them in that month (S3-RULE-5). MUST export
             pactBetween(state, a, b, month?) for slice 4's order screen and SabotageHand, and sabotagePossible(state),
             false until slice 4 replaces its body (S4's named edit in this WS7 file).
logic        → §2 S3-RULE-5, S3-RULE-3
seam         diplomacy.ts: pactBreach, pactBetween, sabotagePossible; the upkeep call is S3-C8
senior       junior would: forbid sabotage against a pact partner. · senior does: a pact is breakable; breaking it is
             the drama, and only an attributed sabotage breaks it publicly, so an undetected one leaves the doubt the
             design wants (00-concept, "The sabotage reveal").
mechanism    sprout
call sites   slice 4's capture and investigation (S4's spec names them); monthEndDeals (S3-C8)
reuse check  `git grep -ni sabot packages/engine/src` → only persona names in config.ts (slice 4 unbuilt); the AI's
             AI_LEVELS[…].sabotage switch exists and pactWorth reads it.
depends_on   S3-C1, S3-C2 (data). UBER-AC-3 leg B: slice 4's capture (contract stubbable; its e2e is not)
```

```
S3-C5 · MODIFIED · reputation moves through one function and every move is logged in public

today        reputationShift(state, id, delta) clamps to POLITICS.reputation and writes Player.reputation; nothing
             records why. packages/engine/src/events.ts::applyEvents calls it for blamedForUnrest and reads the change itself.
             anchors: packages/engine/src/politics.ts::reputationShift, packages/engine/src/events.ts::applyEvents
             verified_by: read
tomorrow     MUST add diplomacy.ts's moveReputation(state, playerId, delta, cause, withId, cardId): number — the
             applied (clamped) change, logged as a RepMove when non-zero. MUST be the only caller of reputationShift
             after this slice; events.ts's blamedForUnrest calls moveReputation(…, 'unrest') instead.
logic        → §2 S3-RULE-3
seam         diplomacy.ts (new function, wraps reputationShift); events.ts one line (WS1 named edit)
senior       junior would: keep a second "reputation history" beside the number in the web. · senior does: one
             engine writer with a cause, so every screen, the AI and WS2's memory read the same story.
mechanism    wrap
call sites   packages/engine/src/events.ts::applyEvents (blamedForUnrest); diplomacy.ts settlement paths; slice 4's caught (S4's)
pin          the blamedForUnrest event tests (packages/engine/test) pass unchanged: the same −1, the same change line
depends_on   S3-C1
```

```
S3-C6 · MODIFIED · the Governor's tax promise moves reputation

today        keepPromise records each month whether the sitting Governor's promise held (colony.promises) and the mood
             reads a broken month; nothing touches the Governor's reputation.
             anchors: packages/engine/src/colony.ts::keepPromise, ::moodInputs, packages/engine/src/politics.ts::takeOffice
             verified_by: read
tomorrow     MUST, when keepPromise records a broken month and the Governor has not lost reputation for this promise
             this term, apply moves.taxBroken once. MUST, as takeOffice ends a term, and at game over, apply
             moves.taxKept to the outgoing Governor whose term recorded at least one month and no broken one.
logic        → §2 S3-RULE-6
seam         colony.ts::keepPromise (WS7's file since G-5) one call to diplomacy.ts's settleTaxPromise; takeOffice and
             monthEndDeals (game over) call diplomacy.ts's settleTerm
senior       junior would: a penalty every broken month. · senior does: once a term, so a Governor who breaks in
             month 1 is not pushed below 30 by month 3 for the same promise; the mood still counts every month.
mechanism    in_place
call sites   game.ts::advancePhase (planning branch) → keepPromise; politics.ts::takeOffice
pin          G-5's mood tests pass unchanged (colony.promises is written exactly as today)
depends_on   S3-C5
```

```
S3-C7 · MODIFIED · votes never fall below POLITICS.weight.minVotes

today        voteWeight sums its parts; with reputation below 30 and nothing else a player has 0 votes. The parent's
             RULE-4 left it "a slice-3 question".
             anchors: packages/engine/src/politics.ts::voteWeight
             verified_by: read
tomorrow     MUST return total = max(POLITICS.weight.minVotes, sum of parts); parts unchanged (the panel still shows
             the −1).
logic        → §2 S3-RULE-8
seam         politics.ts::voteWeight (WS7)
senior       junior would: clamp the reputation part at 0. · senior does: clamp the total, so a player with land or
             taxes still feels the −1 and nobody loses their voice.
mechanism    in_place
call sites   politics.ts (tally, decide), apps/server/src/politics-view.ts::politicsView, VoteHand via observe
pin          every existing election/council test: reputation is 50 there, the floor never binds
depends_on   none
```

```
S3-C8 · MODIFIED · the month's clock: offers lapse when planning closes; pacts settle at upkeep

today        advancePhase's planning branch calls keepPromise then closeVotes; its upkeep branch collects law taxes,
             pays the grant and the offices, runs the colony, then may end the game.
             anchors: packages/engine/src/game.ts::advancePhase
             verified_by: read
tomorrow     MUST call diplomacy.ts's closePlanningDeals(state) right after closeVotes (offers lapse; stale vote terms
             void), and diplomacy.ts's monthEndDeals(state, gameOver) in the upkeep branch just before the gameOver check
             (pacts whose last month this is settle kept; at game over open pact terms settle kept as at expiry,
             open vote terms void, and the sitting Governor's term is settled, S3-RULE-6).
logic        → §2 S3-RULE-1, S3-RULE-5, S3-RULE-6
seam         game.ts::advancePhase, two one-line calls (WS3 named edit)
mechanism    in_place
pin          politics-off sim byte-identical (both calls return at once when diplomacy is null)
depends_on   S3-C1
```

```
S3-C9 · MODIFIED · observe() hides other players' cards; cloneForSim copies diplomacy; law ballots hidden too

today        observe() hides other seats' election ballots; it does NOT hide the council's ballots
             (structuredClone(politics) keeps council.ballots whole). cloneForSim deep-copies politics.
             anchors: packages/engine/src/observe.ts::observe, ::cloneForSim
             verified_by: read
tomorrow     MUST keep in observe(state, me) only the cards where me is a party, and null every log entry's card id
             not on such a card; MUST hide other seats' council ballots as it hides election ballots (a slice-2a gap
             found while writing this: with vote promises, a seat reading others' law ballots would know of a break
             before the table does). cloneForSim MUST structuredClone diplomacy.
logic        → §2 S3-RULE-7
seam         observe.ts (WS1 named edit)
mechanism    in_place
pin          T-AC-7 of the parent (no seat sees another's election ballot) still passes
depends_on   S3-C1
```

```
S3-C10 · MODIFIED · the protocol: three intents, the deals view, a public reputation

today        MuleIntent has no card intent; PlayerView has no reputation; MyPoliticsView.reputation is the owner's
             only.
             anchors: packages/protocol/src/index.ts::MuleIntent, ::PlayerView, ::MyView, ::MyPoliticsView,
             ::PoliticsView, apps/server/src/server.ts::isIntent
             verified_by: read
tomorrow     MUST add the intents offerCard, withdrawCard, answerCard; PlayerView.reputation (public);
             PoliticsView.reputation (public moves of this month and the last); MyView.deals (the player's own cards);
             MyPoliticsView.promised (their promised votes on the open or next ballots). Exact shapes: §3.
seam         protocol index.ts and server.ts::isIntent (WS3 named edits): the contract commit, first
mechanism    in_place
depends_on   S3-C1 (types)
atomicity    the contract commit carries every §3 type at once, so engine, server, screens and AI build in parallel
```

```
S3-C11 · MODIFIED · the server plays cards: intents, views, the break news, the planning tick, a flush before Ready ends

today        MuleGame.handle routes run/vote/propose…; VoteHands tick only while votes are open (and once at
             planning start); viewFor builds politicsView / myPoliticsView.
             anchors: apps/server/src/mule-game.ts::MuleGame, apps/server/src/politics-view.ts::politicsView,
             ::myPoliticsView, ::councilNews
             verified_by: read
tomorrow     MUST route the three intents to diplomacy.ts. MUST build PlayerView.reputation, PoliticsView.reputation,
             MyView.deals and MyPoliticsView.promised (politics-view.ts: dealsView, reputationView, promisedView).
             MUST tick every AI seat's DealHand through all of planning (votes and planning proper) on WALK.tickMs, and
             MUST, before planning ends by Ready or the host's Continue, flush every DealHand (answer every open offer
             to it at once), so an AI always answers within planning (UBER-AC-3 leg C). MUST add one news line per new
             public broken move (politics-view.ts's dealNews (new)) and notify S3-C12's notices. MUST refuse an AI seat's
             offer to a player who muted it, once WS2's mute exists.
logic        → §2 S3-RULE-7, S3-RULE-11
seam         mule-game.ts (WS3 named edits: handle cases, a dealHands map beside voteHands, the planning tick, the
             flush in checkAllReady/continuePlanning, noteDeals after each intent/tick/phase); politics-view.ts (WS7)
senior       junior would: diff reputation numbers to find breaks. · senior does: read the engine's log, the one
             record of why, and keep a reference to the last diplomacy object (copy-on-write makes it a snapshot).
mechanism    in_place
call sites   MuleGame.handle, .aiAct, the election tick, startPlanning, checkAllReady, continuePlanning, nextPhase,
             viewFor
pin          apps/server/test/politics*.test.ts election and council rows pass unchanged
depends_on   S3-C10 (contract, stubbable), S3-C2 (engine)
```

```
S3-C12 · MODIFIED · the record's notices gain card and reputation facts, private ones marked

today        NoticeEntry is "a public fact as it settled": claim, declare, trade, sale; WS2's memory reads them.
             anchors: packages/engine/src/record.ts::NoticeEntry, apps/server/src/mule-game.ts::MuleGame (notify)
             verified_by: read
tomorrow     MUST add three kinds (§3): card (lifecycle, private: carries `parties`), term (kept/void private, broken
             public), reputation (public). MUST state on the type: a notice with `parties` is private to those seats;
             any consumer that builds one seat's view (WS2's memory and brief, packages/ai/src/playbook/outcome.ts)
             MUST skip it for other seats.
seam         record.ts (WS3 named edit); mule-game.ts::notify, fed by politics-view.ts's dealNotices (new)(before, after)
mechanism    in_place
call sites   notify's listener: apps/server/src/record.ts (Recorder.notice); readers: packages/ai/src/playbook/outcome.ts
depends_on   S3-C10, S3-C11
```

```
S3-C13 · ADDED · DealHand: every AI seat answers and offers cards (packages/ai/src/hands/deal.ts)

today        none (SEAMS reserves the path for WS7).
tomorrow     MUST, for every AI seat with no API key needed: answer each card offered to it after a seeded pause, or at
             once on flush (S3-RULE-9 answer rows); offer at most POLITICS.ai.deals.offersPerMonth cards per month in
             two windows, an election's announce and planning proper (S3-RULE-9 offer rows); read only observe();
             draw only from its own stream (S3-HC-3). MUST take an optional DealPort (WS2's) whose recorded answer or
             offers replace the keyless rule when present.
logic        → §2 S3-RULE-9 · values from WS1 (Hand decisions)
seam         packages/ai/src/hands/deal.ts (new, WS7): class DealHand(mind, port?) { tick, flush, offer, answer }
senior       junior would: decide inside VoteHand or the strategist. · senior does: one hand for the card table,
             constructed and ticked like VoteHand, so the server and the sim drive it the same way.
mechanism    sprout
call sites   mule-game.ts (S3-C11), play.ts (S3-C16)
reuse check  `ls packages/ai/src/hands` → auction, develop, floor-walker, lot, vote: no deal hand; VoteHand's
             council() stream is the pattern reused for the deal stream.
depends_on   S3-C2 (engine), S3-C15 (values, stubbable: WS1's signatures in Hand decisions)
```

```
S3-C14 · MODIFIED · VoteHand keeps or breaks a promised vote

today        VoteHand votes by RULE-8/RULE-63 (itself, else the fewest plots, leaning against an unloved Governor)
             and on laws by RULE-46.
             anchors: packages/ai/src/hands/vote.ts::VoteHand
             verified_by: read
tomorrow     MUST, when it holds an open vote term for the ballot it is voting on, keep it unless S3-RULE-10 says break;
             with no promise, MUST vote exactly as today.
logic        → §2 S3-RULE-10
seam         vote.ts (WS7): one check in vote() and lawVote() through a private keepOrBreak
senior       junior would: always keep (no betrayal) or draw a coin. · senior does: a deterministic comparison of
             breakGain against the reputation cost scaled by the persona's honesty, so no seeded stream moves.
mechanism    in_place
pin          packages/ai/test vote-hand and council-ai tests pass unchanged (no cards there)
depends_on   S3-C2, S3-C15
```

```
S3-C15 · ADDED · WS1's valuations for cards (packages/ai/src/value.ts)

today        value.ts prices land, goods, outfits and cash; nothing prices a vote, a pact or reputation.
             anchors: packages/ai/src/value.ts::Mind
             verified_by: read
tomorrow     MUST add six pure functions (Hand decisions): trust, reputationCost, voteWorth, pactWorth, cardWorth,
             breakGain, each reading observe() only.
seam         value.ts (WS1)
mechanism    sprout
reuse check  `git grep -niE 'trust|reputationCost|cardWorth' packages/ai/src` → none. Nearest: lawImpact
             (politics.ts) for a law's cost per player, which voteWorth MUST reuse for law ballots.
depends_on   S3-C1 (types)
```

```
S3-C16 · MODIFIED · the sim plays cards and prints a deals row (WS1)

today        play.ts's planning loop ticks VoteHands while votes are open, then plans the month; actions.ts has no
             card action; sim.ts prints a politics row.
             anchors: packages/ai/src/play.ts::applyAction, packages/ai/src/actions.ts::AiAction
             verified_by: read
tomorrow     MUST add the three AiActions and route them in applyAction; MUST, in each planning window (an election's
             announce, then planning proper), run every seat's DealHand.offer, then every seat's DealHand.flush; MUST
             print cards offered/accepted/kept/broken/void and the reputation spread, with S3-UBER-AC-2's checks.
seam         WS1's play.ts, actions.ts, sim.ts
mechanism    in_place
pin          politics-off rows byte-identical (S3-HC-4)
depends_on   S3-C13, S3-C15
```

```
S3-C17 · ADDED · P1: "+ Deal" on a whisper opens the card composer
ux           mock: WS6, to come (from PlanningHub.tsx's `add-deal` and `deal-card` placeholders at c312e7cb) ·
             GRAFT TARGET: new apps/web/src/phone/hub/politics/Deals.tsx (CardComposer), mounted from
             apps/web/src/chat/Chat.tsx's whisper input
tomorrow     MUST offer a pact (POLITICS.deals.pactMonths) and/or one vote term per party (the next election per
             elected office with its declared candidates, or the law up for a vote with yes/no), send offerCard, and
             show the engine's refusal words.
seam         Deals.tsx (WS7 path); Chat.tsx one mount (WS4 named edit)
mechanism    fill_scaffold
depends_on   S3-C10 (contract), WS6's approved mock (not stubbable)
```

```
S3-C18 · ADDED · P2 and P3: the incoming card and My cards
ux           mock: WS6, to come · GRAFT TARGET: Deals.tsx (IncomingCard, MyCards); the thread mount in Chat.tsx (WS4);
             the agenda entry "N deal offers" in apps/web/src/phone/hub/today.tsx (WS6, the mock's `deals` row)
tomorrow     MUST show an offered card in the pair's whisper thread and on the agenda with both reputations and
             Accept / Decline (one tap each); MUST list every card of mine: offered (Withdraw), incoming, active (who
             owes what, until when), ended (kept, broken, void, declined, withdrawn, lapsed).
seam         Deals.tsx (WS7); Chat.tsx, today.tsx, desks.tsx (named edits to their owners)
mechanism    fill_scaffold
depends_on   S3-C10, WS6's mock
```

```
S3-C19 · MODIFIED · P4: a reputation chip beside every player's name
ux           mock: WS6, to come · GRAFT TARGET: apps/web/src/phone/hub/politics/parts.tsx::Who (WS7),
             apps/web/src/phone/hub/Standings.tsx (WS4), the TV players strip in apps/web/src/table/TableApp.tsx (WS4)
tomorrow     MUST show PlayerView.reputation beside each name, with its 70/30 thresholds readable, and on tap the
             player's public moves (PoliticsView.reputation).
mechanism    fill_scaffold
depends_on   S3-C10, WS6's mock
```

```
S3-C20 · ADDED · P5: the public break line on the TV and at the month end
ux           mock: WS6, to come · GRAFT TARGET: new apps/web/src/table/TvDeals.tsx (owner: WS7, as TvElection.tsx;
             PM to confirm), its route line in TableApp.tsx (WS4), apps/web/src/components/MonthEnd.tsx (WS4)
tomorrow     MUST show a banner on the TV when a broken move appears (breaker, partner, kind, the drop) and list the
             month's public moves at the month end, breaks first.
mechanism    sprout
depends_on   S3-C10, S3-C11 (news), WS6's mock
```

```
S3-C21 · MODIFIED · the ballots show "You promised"
today        the election ballot and the law ballot show the choices and the voter's weight.
             anchors: apps/web/src/phone/hub/politics/ElectionDay.tsx, apps/web/src/phone/hub/politics/LawBallot.tsx
             verified_by: read
tomorrow     MUST, when MyPoliticsView.promised names this ballot, say to whom and preselect the promised choice
             locally (no intent until the player casts: S3-HC-2, §0.1's rejected preset).
ux           mock: WS6, to come
mechanism    in_place
depends_on   S3-C10, WS6's mock
```

### Who edits what (owners from the SEAMS path table and rulings)

| File | Owner | Named edit (what that owner does) | C |
|---|---|---|---|
| `packages/engine/src/diplomacy.ts` (new) | WS7 | the module: newDiplomacy, offerCard, withdrawCard, answerCard, resolveTerms, cardsOf, promisedVotes, settleVotes, closePlanningDeals, monthEndDeals, pactBreach, pactBetween, sabotagePossible, moveReputation, settleTaxPromise, settleTerm | C1-C6, C8 |
| `packages/engine/src/politics.ts` | WS7 | voteWeight floor; takeOffice → settleVotes('election') + settleTerm; takeEffect → settleVotes('law') | C3, C6, C7 |
| `packages/engine/src/colony.ts` | WS7 (G-5) | keepPromise → settleTaxPromise | C6 |
| `packages/engine/src/config.ts` POLITICS block | WS7 | deals, reputation.moves, reputation.keptPerPartnerPerTerm, weight.minVotes, ai.deals | all |
| `packages/engine/src/types.ts` | WS3 | §3's engine types; GameState.diplomacy | C1 |
| `packages/engine/src/game.ts` | WS3 | createGame: `diplomacy:`; advancePhase: closePlanningDeals after closeVotes, monthEndDeals before the gameOver check | C1, C8 |
| `packages/engine/src/record.ts` | WS3 | NoticeEntry's three kinds and the `parties` rule | C12 |
| `packages/engine/src/events.ts` | WS1 | blamedForUnrest → moveReputation(…, 'unrest') | C5 |
| `packages/engine/src/observe.ts` | WS1 | hide others' cards and card ids; hide others' council ballots; cloneForSim copies diplomacy | C9 |
| `packages/engine/src/index.ts`, `packages/ai/src/index.ts` | anyone (export lines) | export diplomacy.ts, deal.ts | C1, C13 |
| `packages/protocol/src/index.ts` | WS3 | three intents, CardTermOffer re-export, PlayerView.reputation, PoliticsView.reputation, MyView.deals, MyPoliticsView.promised, CardView, MyDealsView, RepMoveView | C10 |
| `apps/server/src/server.ts` | WS3 | isIntent accepts the three intents | C10 |
| `apps/server/src/mule-game.ts` | WS3 | handle cases; dealHands beside voteHands; planning tick; flush before planning ends; noteDeals; mute refusal (when WS2's mute lands) | C11, C12 |
| `apps/server/src/politics-view.ts` | WS7 | dealsView, reputationView, promisedView, dealNews, dealNotices; PlayerView.reputation's value | C11, C12 |
| `packages/ai/src/hands/deal.ts` (new) | WS7 | DealHand | C13 |
| `packages/ai/src/hands/vote.ts` | WS7 | keepOrBreak in vote() and lawVote() | C14 |
| `packages/ai/src/value.ts` | WS1 | trust, reputationCost, voteWorth, pactWorth, cardWorth, breakGain | C15 |
| `packages/ai/src/{actions,play,sim}.ts` | WS1 | three AiActions; DealHand in the planning windows; the deals row | C16 |
| `apps/web/src/phone/hub/politics/{Deals,parts,ElectionDay,LawBallot}.tsx` | WS7 path (build lane: PM's piece list) | composer, incoming card, My cards, Who chip, "You promised" | C17-C19, C21 |
| `apps/web/src/chat/Chat.tsx` | WS4 | mount the composer on a whisper and the card in the thread | C17, C18 |
| `apps/web/src/phone/hub/{desks,today}.tsx` | WS6 | the Talk desk's card list; the agenda's "N deal offers" | C18 |
| `apps/web/src/phone/hub/Standings.tsx`, `apps/web/src/table/TableApp.tsx`, `apps/web/src/components/MonthEnd.tsx` | WS4 | the chip; the TV strip's chip and TvDeals route; the month end's moves | C19, C20 |
| `apps/web/src/table/TvDeals.tsx` (new) | WS7 (PM to confirm, as TvElection.tsx) | the break banner | C20 |
| `apps/web/e2e/politics.ts` | WS7 | S3-UBER-AC-1's step and UBER-AC-3 legs A and C | ACs |
| `docs/rulebook/colony-and-politics.html` (#reputation-deals) | WS7 | the chapter, "Designed, not in the game yet" until built | — |
| `design/mocks/ws6-ux/**` | WS6 | P1-P5 and the ballot line | C17-C21 |

### Hand decisions and the values they need

Every decision is keyless code; a Smart seat plays the same code until WS2's port (DealPort) carries Claude's recorded
choice. All values read `observe(state, me)` only and are pure.

| Hand · method | When it runs | Inputs | Output | WS1 value(s) it calls |
|---|---|---|---|---|
| DealHand · `answer(obs, card)` | a card offered to it: after a pause from `POLITICS.ai.actMs` on the deal stream; at once on `flush` (server before planning ends; sim) | the card, the proposer's reputation, its own open promises, its candidacy | accept / decline (S3-RULE-9 answer rows) | `cardWorth(obs, card, me, mind)` |
| DealHand · `offer(state, act)` | once per window: an election's announce, and planning proper (after its own VoteHand's governing step) | its candidacy, the next ballots, the pending proposal and `lawImpact`, the other players' reputations, open offers | 0..`offersPerMonth` offerCard actions (S3-RULE-9 offer rows) | `cardWorth` for itself and, as an estimate, for the partner; `pactWorth`; `voteWorth` |
| VoteHand · `keepOrBreak` (in `vote`, `lawVote`) | as it casts a ballot it has a promise on | the promise, its own choice by today's rule | keep (vote as promised) / break (vote its own choice) (S3-RULE-10) | `breakGain(obs, card, i, me, mind)`, `reputationCost(obs, me, moves.voteBroken, mind)` |
| S4's SabotageHand · pact check (slice 4 owns the hand) | before ordering sabotage against a pact partner | `pactBetween(obs, me, target)` | order / hold | `breakGain` (the sabotage's gain), `reputationCost(obs, me, moves.pactBroken, mind)` × S4's caught chance |

WS1's signatures (`packages/ai/src/value.ts`, all ADDED, pure, credits unless stated):

```ts
import type { BallotRef, CardTerm, DealCard, GameState } from '@mule/engine';

/** 0..1: the chance `playerId` keeps a term. From public facts only: reputation (PlayerView's number) and their public
 *  broken moves this game. MUST be monotonic in reputation; MUST NOT read cards the caller is not party to. */
export function trust(obs: GameState, playerId: string): number;

/** What a reputation change of `delta` points (negative = a loss) costs `me` over the game left; positive for a loss,
 *  negative for a gain. MUST account for: crossing POLITICS.weight.repHigh/repLow (one vote × the ballots left: the
 *  elections in POLITICS.electionMonths after now and one law ballot a month), AI seats refusing below
 *  POLITICS.ai.deals.refuseBelow (the cards it would lose), and the months left (0 in the last month). */
export function reputationCost(obs: GameState, me: string, delta: number, mind: Mind): number;

/** What `choice` winning `ballot` is worth to `me`, times the chance that `voter`'s weight decides it.
 *  Law ballots: −lawImpact(obs, proposal)[me].cost × months left (yes) against 0 (no), the repeal sign reversed.
 *  Elections: the candidate's promise against the persona's tax target, and `me` itself winning (office pay ×
 *  months of the term + POLITICS.termScore). Swing: from the public weights and declared candidates. */
export function voteWorth(obs: GameState, me: string, voter: string, ballot: BallotRef, choice: string | boolean, mind: Mind): number;

/** What a pact with `other` for `months` is worth to `me`: the sabotage `other` would not do to me less the sabotage I
 *  give up against them, from slice 4's expected-damage value and the persona's spite. MUST return 0 while
 *  sabotagePossible(obs) is false or mind.level.sabotage is false. */
export function pactWorth(obs: GameState, me: string, other: string, months: number, mind: Mind): number;

/** What accepting `card` is worth to `seat`: each term by the other party, valued with voteWorth/pactWorth and scaled
 *  by trust(other); minus each term by `seat`, the cost of keeping it (voteWorth of its own best choice minus the
 *  promised one); plus −reputationCost of moves.kept per term `seat` would keep. For the partner, the caller passes
 *  the partner's id with its own Mind: an estimate from public facts. */
export function cardWorth(obs: GameState, card: Pick<DealCard, 'from' | 'to' | 'terms'>, seat: string, mind: Mind): number;

/** What `me` gains by breaking term `i` of `card` now rather than keeping it, before any reputation cost: for a vote
 *  term voteWorth(own choice) − voteWorth(promised choice) with `me` as voter; for a pact, slice 4's sabotage gain. */
export function breakGain(obs: GameState, card: DealCard, i: number, me: string, mind: Mind): number;
```

## §2 · The Logic `[handoff]`

```
S3-RULE-1 · A card's life                                              shape: state machine

card stages   offered → active → ended;  offered → ended
  from      event                                                to
  offered   the receiver accepts (S3-RULE-2 accept rows)          active (since = month; a pact: until = min(maxMonths,
                                                                  month + months − 1))
  offered   the receiver declines                                 ended · declined
  offered   the proposer withdraws                                ended · withdrawn
  offered   planning ends (closePlanningDeals)                    ended · lapsed
  active    every term is kept, broken or void                    ended · settled
term outcomes  open → kept | broken | void      (vote: S3-RULE-4 · pact: S3-RULE-5)
ids        'card-<n>', n = ++diplomacy.seq: the same game replays the same ids.
unknown    a card never offered in this game → every call naming it refuses "That card is no longer open".
examples   Lena offers, Brix accepts in month 3 a 3-month pact → active, until 5 · Brix never answers, Ready → lapsed
```

```
S3-RULE-2 · Offer, accept, decline, withdraw                            shape: decision table

inputs  politics on/off · phase (planning | other) · from, to ∈ players · open offers by `from` (0..maxOpenOffers)
        · an offered card from→to (yes|no) · terms: pact (0|1), vote terms by each party (0|1 each)
        · months ∈ POLITICS.deals.pactMonths? · an active pact between them (yes|no)
        · each vote term: ballot kind (election | law), office ∈ POLITICS.offices?, candidate declared?, a ballot ahead?
        · the promiser's open vote term on the same ballot (none | same choice | other choice)

offerCard(from, to, terms) — first match wins
  #   when                                                          then
  1   politics off                                                  refuse "This game plays without deals"
  2   phase ≠ planning                                              refuse "Cards are offered in planning"
  3   to = from, or to is not a player                              refuse "Pick another player"
  4   open offers by from ≥ POLITICS.deals.maxOpenOffers            refuse "You have N cards waiting for an answer"
  5   an offered card from → to exists                              refuse "<To> has not answered your last card"
  6   no term                                                       refuse "Put a pact or a vote on the card"
  7   pact months ∉ pactMonths                                      refuse "A pact runs 1, 3 or 6 months" (from config)
  8   pact and an active pact between them                          refuse "You have a pact with <To> until month M"
  9   a vote term by someone not on the card, or two by one party   refuse "Each of you can promise one vote"
  10  election term, office ∉ POLITICS.offices                      refuse "The Sheriff is not elected yet"
  11  election term, no ballot ahead (this month's ballot closed    refuse "No election is left this game"
      or none, and nextElectionMonth null)
  12  election term, choice not a declared candidate for office     refuse "<Name> is not running for <Office>"
  13  law term, no pending proposal and no open law ballot          refuse "No law is up for a vote"
  14  law term, choice not true/false                               refuse "Vote yes or no"
  15  from's own vote term and from holds an open term on the same  refuse "You already promised your vote on this ballot"
      ballot with another choice
  16  otherwise                                                     offered (terms resolved, below)

answerCard(to, id, accept) — first match wins
  1   politics off / phase ≠ planning                               refuse "Cards are answered in planning"
  2   no card id offered to this player                             refuse "That card is no longer open"
  3   accept = false                                                ended · declined
  4   a vote term's ballot has closed since the offer               ended · lapsed (no error: both phones show "lapsed:
                                                                    the ballot closed"; a RuleError would undo nothing)
  5   pact and an active pact between them now                      refuse "You have a pact with <From> until month M"
  6   to's own vote term, and to holds an open term on the same     refuse "You already promised your vote on this ballot"
      ballot with another choice
  7   otherwise                                                     active

withdrawCard(from, id): the proposer's own offered card → ended · withdrawn; else refuse "That card is no longer open".

resolve  election {office} → this month's election if its stage is announce or ballot, else nextElectionMonth;
         candidates read from election.candidates in the ballot stage, else politics.candidates.
         law → the open council's proposal (month = this month), else politics.proposal (month = its month + 1).
privacy  rows 15 and 6 check only the acting player's own promises: no refusal ever tells a player about a card
         between two others (S3-HC-2).
invariant  no row moves money, stock, tiles or MULEs (S3-HC-1).
examples  Lena offers Brix a 3-month pact → offered · a 2-month pact → row 7 · Lena's fourth open offer → row 4 ·
          a vote for Kai who has not declared → row 12 · Brix accepts after the ballot closed → answer row 4, lapsed
```

```
S3-RULE-3 · Reputation moves                                            shape: decision table

the only writer  diplomacy.ts's moveReputation → politics.ts::reputationShift (clamped to POLITICS.reputation min..max,
                 whole points); a move is logged with the applied delta, and not logged when that is 0.
  cause        when                                                    delta (POLITICS.reputation.moves)   public with
  kept         a vote term kept (S3-RULE-4); a pact side kept           +kept (3)                          cause only
               (S3-RULE-5) only where sabotagePossible
  voteBroken   a vote term broken (S3-RULE-4)                          voteBroken (−10)                   partner + kind (D-S3-2)
  pactBroken   pactBreach (S3-RULE-5)                                  pactBroken (−20)                   partner + kind
  taxBroken    S3-RULE-6 row 1                                         taxBroken (−10)                    cause only
  taxKept      S3-RULE-6 row 2                                         taxKept (+5)                       cause only
  unrest       the blamedForUnrest event (unchanged amount, WS1's)     SOCIAL_EVENTS…reputation (−1)      cause only
  caught       slice 4 (S4 adds the cause and its amount)              S4's                               S4's
limit    a player gains `kept` from the same partner at most POLITICS.reputation.keptPerPartnerPerTerm (1) times per
         term (since politics.termStart); further kept terms settle kept with no move.
timing   ballot moves apply when the result takes effect (S3-HC-6); pact moves at upkeep or at the breach.
unknown  politics off → no move, no log. A cause slice 4 adds later is a new union member, not a new writer.
examples Lena 50 keeps a vote term → 53 · keeps a second card with Brix in the same term → still 53, card kept ·
         breaks a pact at 15 → 0 (logged −15)
```

```
S3-RULE-4 · A vote term at its ballot                                   shape: decision table

evaluated_at  election terms: politics.ts::takeOffice (the ceremony's end; closeElection's early close too) ·
              law terms: politics.ts::takeEffect (the reveal's end; closeVotes too) · then closePlanningDeals voids the rest
inputs   the term's ballot (election office O in month M | law in month M on proposal P) · that ballot held (yes|no)
         · the choice on the ballot (candidate on it | the same proposal) · the promiser's ballot at close
         (the promised choice | another | none)
election — first match wins
  #   when                                                          then
  1   no ballot was held for O this month (uncontested, appointed)  void
  2   the promised candidate is not on the ballot (withdrew, moved) void
  3   the promiser's ballot names the promised candidate            kept
  4   otherwise (another candidate, or no ballot cast)              broken
law
  1   the council this month carries a different proposal or none  void (the proposal was dropped or replaced)
  2   the promiser's ballot = the promised yes/no                   kept
  3   otherwise (the other way, or no ballot cast)                  broken
sweep   closePlanningDeals: any term still open whose ballot month ≤ this month → void.
unknown  "no ballot cast" includes a phone that dropped and a host's Continue: the promise was to vote, and the phone
         showed it (S3-C21). A Governor's law ballot starts yes (slice 2a): it counts as cast.
examples Lena promised Brix, votes Brix → kept, +3 · votes Kai → broken, −10, public line · Brix withdrew before the
         ballot → void · the land tax proposal's proposer lost the election → its ballot never opens → void
```

```
S3-RULE-5 · Pacts: run, expire, breach                                  shape: decision table

a pact     two pact terms, one per party, the same months; binds months since..until inclusive.
expiry     monthEndDeals at the upkeep of `until`, for each open pact term: kept; the move `kept` only if
           sabotagePossible(state) (a pact nobody could break earns nothing: no reputation farming before slice 4,
           nor in a game with sabotage off).
breach     pactBreach(state, saboteur, victim, m), called by slice 4 for every attributed sabotage — first match wins
  #   when                                                          then
  1   politics off, or no pact between them with since ≤ m ≤ until  false, nothing changes
  2   the saboteur's term on that card is already broken            false (once per card)
  3   otherwise                                                     the saboteur's term broken (also if it had expired
                                                                    kept: kept → broken; an earlier kept move stays);
                                                                    move pactBroken with `with` = victim; the victim's
                                                                    term kept (move `kept` if sabotagePossible); the card
                                                                    settles; true
game over  monthEndDeals(state, true): open pact terms settle kept as at expiry.
examples   pact 3-5, Lena caught in month 4 → broken, −20 · caught for month 6's sabotage → row 1 · a Sheriff's
           investigation in month 8 reveals month 4's sabotage → row 3, the expired kept pact becomes broken
```

```
S3-RULE-6 · The Governor's tax promise and reputation                   shape: decision table

inputs   the record keepPromise just pushed (kept | broken) · a taxBroken move for this Governor since termStart (yes|no)
         · at term end: the outgoing Governor's colony.promises records this term (none | all kept | any broken)
  #   when                                                          then
  1   keepPromise records broken, no taxBroken this term yet        move taxBroken (−10), public line
  2   term ends (takeOffice) or game over, records ≥ 1, all kept    move taxKept (+5) to the outgoing Governor
  3   otherwise                                                     nothing
unknown  an appointed Governor has no promise (politics.promise null): no record, no move. A term with no record (the
         election ran to planning's close) → row 3.
examples Lena promised "no higher than 8%", sets 10% in month 2 → −10; 10% again in month 3 → nothing more ·
         Kai holds his "hold" all term → +5 when month 4's ceremony ends
```

```
S3-RULE-7 · Who sees what                                               shape: decision table

  item                                                   the two parties   other phones   TV    other AI seats
  an offered or active card, its terms                   yes               no             no    no (observe)
  a kept or void outcome                                 yes               no             no    no
  a broken term: breaker, partner, kind                  yes               yes            yes   yes
  a broken vote term's choice                            yes               no             no    no
  reputation number                                      yes               yes            yes   yes
  reputation moves: player, delta, cause, month          yes               yes            yes   yes
  a move's `with` (breaks only) / card id                with: all · card id: parties only (views send none)
  open-offer counts, "waiting for an answer"             the proposer      no             no    no
  another seat's law ballot (S3-C9, slice 2a gap)        —                 no             no    no (now hidden)
accepted  a kept move tells the table the player had a card with someone, not with whom (as AM-8's accepted
          inference). A broken vote term tells the table the breaker did not vote as promised (D-S3-2 (a)).
```

```
S3-RULE-8 · Vote weight (MODIFIES the parent's RULE-4)                  shape: formula

votes = max(POLITICS.weight.minVotes, 1 + land + reputation part + Baron + taxes)       minVotes = 1
parts  unchanged and still reported one by one (the −1 shows on the panel).
answers  RULE-4's "whether votes may fall to 0": no; the reputation part bites a player with 2+ votes.
example  reputation 20, no land, no taxes → 1 vote (parts: base 1, reputation −1) · with 10 plots → 1 + 1 − 1 = 1
```

```
S3-RULE-9 · DealHand (every AI seat, keyless)                           shape: decision table

stream   createRng from the seat's salt XOR a deal salt and the month (VoteHand.council's pattern; S3-HC-3).
answer — per card offered to it, first match wins (a DealPort answer, when present, replaces rows 3-7)
  #   when                                                          then
  1   the proposer's reputation < POLITICS.ai.deals.refuseBelow     decline
  2   its own vote term conflicts with one of its open promises     decline
  3   its own election term names another while it runs for O     decline
  4   Rookie                                                        accept if stream.chance(POLITICS.ai.deals.rookieAccept)
  5   cardWorth(obs, card, me, mind) ≥ POLITICS.ai.deals.acceptMin[persona]   accept
  6   otherwise                                                     decline
offer — once per window (an election's announce; planning proper); candidates, each needing
        cardWorth(me) > 0 and cardWorth(partner, estimate) ≥ 0, partner reputation ≥ refuseBelow, and no card
        of the same kind declined by that partner this month:
  a   it runs for O, a ballot ahead: to each other non-candidate, "you vote for me for O", plus, when a law is up
      and its own lawImpact cost is within POLITICS.ai.council.minGap of 0, "I vote your way on the law" (the
      partner's side by its lawImpact), else, when sabotagePossible, a pact of the middle pactMonths
  b   it is Governor with a pending proposal: to each other player whose lawImpact cost ≤ 0, "you vote yes"
  c   sabotagePossible and pactWorth(me, P, middle months) > 0: "a pact" to the player it gains most from
  sends the best by cardWorth(me), at most POLITICS.ai.deals.offersPerMonth a month, within maxOpenOffers.
never    withdraws (offers lapse); never offers outside planning.
```

```
S3-RULE-10 · VoteHand keeps or breaks a promise                          shape: decision table

at each ballot it casts (election vote(), law lawVote()), with own = today's rule's choice
  #   when                                                          then
  1   no open vote term of its own on this ballot                    vote own (today's behaviour)
  2   own = the promised choice                                     keep
  3   Rookie                                                        keep
  4   breakGain(obs, card, i, me, mind) >                           break: vote own
      POLITICS.ai.deals.honesty[persona] × reputationCost(obs, me, moves.voteBroken, mind)
  5   otherwise                                                     keep: vote the promised choice
no draw  the rule is deterministic: the election and council streams never move (slice 2a HC-41).
```

```
S3-RULE-11 · Notices and news                                           shape: sequence

after each intent, AI action, election/council tick and phase change, the server compares the diplomacy object it
saw last with the current one (dealNotices): a new card → card·offered; a stage change → accepted / declined /
withdrawn / lapsed; a term outcome change → term (kept / void private to the parties; broken public); each new log
move → reputation (public). Each new public broken move adds one news line (dealNews):
  voteBroken  "<Breaker> broke a vote promise to <Partner>: reputation −10."
  pactBroken  "<Breaker> broke a pact with <Partner>: reputation −20."
  taxBroken   "Governor <Name> broke the tax promise: reputation −10."
order    the engine settles; the view and the news follow in the same tick, so the TV banner and the chip move together.
```

## §3 · Contracts & Data Models `[handoff]`

All ADDED unless marked; none breaking (new fields are nullable or optional, new union members only). **The contract
commit (WS3, first) carries all of it**; engine, server, AI and screens then build against it in parallel.

| Contract | change_kind | Breaking | Change |
|---|---|---|---|
| engine types below; `GameState.diplomacy` | ADDED | no (null with politics off) | S3-C1 |
| `MuleIntent` += offerCard, withdrawCard, answerCard | ADDED | no | S3-C10 |
| `PlayerView.reputation`, `PoliticsView.reputation?`, `MyView.deals?`, `MyPoliticsView.promised?` | ADDED | no | S3-C10 |
| `NoticeEntry` += card, term, reputation | MODIFIED | no (new members; consumers that switch on kind skip unknown ones) | S3-C12 |
| `AiAction` += the three (WS1's actions.ts) | ADDED | no | S3-C16 |
| config `POLITICS.deals`, `.reputation.moves`, `.reputation.keptPerPartnerPerTerm`, `.weight.minVotes`, `.ai.deals` | ADDED | no | all |

```ts
// packages/engine/src/types.ts (WS3 named edit)

/** The ballot a vote term binds: an elected office's election in a month, or the law ballot of a month on one proposal. */
export type BallotRef =
  | { kind: 'election'; office: Office; month: number }
  | { kind: 'law'; month: number; proposer: string; proposal: LawProposal };

/** One party's promise. A pact is always two pact terms, one per party, with the same months. */
export type CardTerm =
  | { kind: 'pact'; by: string; months: number }
  | { kind: 'vote'; by: string; ballot: BallotRef; choice: string | boolean };   // a candidate id, or yes/no

/** A term as a phone or a hand writes it; the engine resolves the ballot (S3-RULE-2 resolve). */
export type CardTermOffer =
  | { kind: 'pact'; months: number }                                             // binds both parties
  | { kind: 'vote'; by: string; ballot: { kind: 'election'; office: Office } | { kind: 'law' }; choice: string | boolean };

export type TermOutcome = 'open' | 'kept' | 'broken' | 'void';

/** A deal card. Not the auction's Deal (a buyer-seller pair). */
export interface DealCard {
  id: string;                        // 'card-<n>'
  from: string;
  to: string;
  terms: CardTerm[];
  outcomes: TermOutcome[];           // one per term, same order
  stage: 'offered' | 'active' | 'ended';
  end: 'declined' | 'withdrawn' | 'lapsed' | 'settled' | null;
  offeredIn: number;                 // month
  since: number | null;              // month accepted
  until: number | null;              // a pact's last month, inclusive; null without a pact
}

/** Why a reputation moved. Slice 4 adds 'caught'. */
export type RepCause = 'kept' | 'voteBroken' | 'pactBroken' | 'taxKept' | 'taxBroken' | 'unrest';

export interface RepMove {
  month: number;
  player: string;
  delta: number;                     // applied, after clamping; never 0
  cause: RepCause;
  with: string | null;               // the partner, on voteBroken and pactBroken only
  card: string | null;               // the card, for the engine's limits; never in any view
}

/** Deal cards and the reputation log. Written only by diplomacy.ts, copy-on-write: re-read it, don't hold a reference. */
export interface Diplomacy {
  seq: number;
  cards: DealCard[];                 // every card this game, in offer order
  log: RepMove[];                    // every reputation move this game, in order
}

// GameState gains:
  /** Deal cards and reputation's log; null when the host switched politics off. Written only by diplomacy.ts. */
  diplomacy: Diplomacy | null;
```

```ts
// packages/engine/src/diplomacy.ts (WS7, new) — exported API, each throwing RuleError per S3-RULE-2
newDiplomacy(): Diplomacy
offerCard(state, from: string, to: string, terms: CardTermOffer[]): string          // the new card's id
withdrawCard(state, from: string, cardId: string): void
answerCard(state, to: string, cardId: string, accept: boolean): void
resolveTerms(state, from: string, to: string, terms: CardTermOffer[]): CardTerm[]    // offerCard's resolution, no write
cardsOf(state, playerId: string): readonly DealCard[]                                // the player's cards, newest first
promisedVotes(state, playerId: string): { election: Partial<Record<Office, { choice: string; to: string[] }>>; law: { choice: boolean; to: string[] } | null }
settleVotes(state, ballot: 'election' | 'law'): void                                // politics.ts calls it
closePlanningDeals(state): void                                                      // game.ts, after closeVotes
monthEndDeals(state, gameOver: boolean): void                                        // game.ts, upkeep
pactBreach(state, saboteurId: string, victimId: string, sabotageMonth: number): boolean   // slice 4 calls it
pactBetween(state, a: string, b: string, month?: number): DealCard | null
sabotagePossible(state): boolean                                                     // false until slice 4
moveReputation(state, playerId: string, delta: number, cause: RepCause, withId?: string | null, cardId?: string | null): number
settleTaxPromise(state): void                                                        // colony.ts::keepPromise calls it
settleTerm(state, governorId: string): void                                          // takeOffice and game over
```

```ts
// packages/protocol/src/index.ts (WS3 named edit)
MuleIntent +=
  /** Planning: offer another player a deal card (a pact and/or one vote promise per party). */
  | { type: 'offerCard'; to: string; terms: CardTermOffer[] }
  /** Planning: take back a card not yet answered. */
  | { type: 'withdrawCard'; card: string }
  /** Planning: accept or decline a card offered to you. */
  | { type: 'answerCard'; card: string; accept: boolean }

PlayerView +=
  /** 0..100, public on every screen, the TV's too (S3-RULE-7). */
  reputation: number;

PoliticsView +=
  /** Every public reputation move of this month and the last, newest first. Optional only for older fixtures. */
  reputation?: RepMoveView[];
export type RepMoveView = Omit<RepMove, 'card'>;

MyView +=
  /** This player's own cards; null with politics off. Optional only for older fixtures: the server always sends it. */
  deals?: MyDealsView | null;
export interface CardView {
  id: string; from: string; to: string;
  terms: (CardTerm & { outcome: TermOutcome })[];
  stage: DealCard['stage']; end: DealCard['end'];
  offeredIn: number; since: number | null; until: number | null;
}
export interface MyDealsView {
  /** Every card this player is a party to, newest first. Never anyone else's. */
  cards: CardView[];
  /** Offers this player may still make now: POLITICS.deals.maxOpenOffers minus their open ones. */
  offersLeft: number;
  /** The lengths a pact may run (POLITICS.deals.pactMonths). */
  pactMonths: number[];
}

MyPoliticsView +=
  /** This player's promised votes (promisedVotes), for the ballot's "You promised". Optional only for older fixtures. */
  promised?: { election: Partial<Record<Office, { choice: string; to: string[] }>>; law: { choice: boolean; to: string[] } | null };
```

```ts
// packages/engine/src/record.ts (WS3 named edit) — NoticeEntry += (a notice with `parties` is private to them)
| { kind: 'card'; event: 'offered' | 'accepted' | 'declined' | 'withdrawn' | 'lapsed'; card: string; from: PlayerId; to: PlayerId; terms: CardTerm[]; parties: [PlayerId, PlayerId] }
| { kind: 'term'; card: string; by: PlayerId; with: PlayerId; term: CardTerm['kind']; outcome: 'kept' | 'broken' | 'void'; parties?: [PlayerId, PlayerId] }   // parties absent only when broken
| { kind: 'reputation'; seat: PlayerId; delta: number; cause: RepCause; with: PlayerId | null }
```

```ts
// packages/engine/src/config.ts POLITICS (WS7) — placeholders until WS1's sim rows; tuned at the end (G-5 HC-25)
weight: { …, /** The fewest votes a player can have, whatever their reputation. */ minVotes: 1 },
reputation: {
  min: 0, max: 100,
  /** Points each cause moves a player's reputation (signed). Slice 4 adds caught. */
  moves: { kept: 3, voteBroken: -10, pactBroken: -20, taxKept: 5, taxBroken: -10 },
  /** Kept moves a player can earn from one partner in one term. */
  keptPerPartnerPerTerm: 1,
},
deals: {
  /** A player's offers waiting for an answer at once. */
  maxOpenOffers: 3,
  /** The lengths a pact may run, in months. */
  pactMonths: [1, 3, 6],
},
ai: { …,
  deals: {
    /** Cards from a proposer below this reputation are declined (design 00). */
    refuseBelow: 30,
    /** Offers a seat makes in a month, at most. */
    offersPerMonth: 2,
    /** The card's worth to the seat, in credits, at or above which it accepts. */
    acceptMin: { trader: 0, cautious: 20, aggressive: 10, saboteur: 0 } satisfies Record<AiPersonaId, number>,
    /** How much a seat weighs its reputation against a gain before breaking a promise: higher keeps more. */
    honesty: { trader: 1, cautious: 2, aggressive: 0.8, saboteur: 0.5 } satisfies Record<AiPersonaId, number>,
    /** A Rookie's chance of accepting a card. */
    rookieAccept: 0.5,
  },
},
```

**WS2's port (consumed after RC; frozen now so WS2 builds on it).**
- *Card intent a Claude seat issues:* the same `offerCard` / `answerCard` / `withdrawCard` intents (as AiActions through
  the server's `aiAct`, the checks a phone gets). WS2 C10's `PlanningPlay.offers?` takes `{ to: PlayerId; terms:
  CardTermOffer[] }[]` (a playbook.ts change: WS1, WS2, WS3 OK, playbook v1 rule).
- *DealPort* (packages/ai/src/hands/deal.ts): `interface DealPort { answerFor(card: DealCard): boolean | null;
  offersFor(month: number): { to: string; terms: CardTermOffer[] }[] | null }`; null → the keyless rule. WS2 supplies it
  from Claude's recorded reasoning (HC-B3: recorded or keyless only).
- *Notices WS2's memory reads:* card offered / accepted / declined / withdrawn / lapsed (the seat's own, `parties`),
  term kept / void (own) and broken (public), reputation (public). WS2 MUST skip a notice whose `parties` excludes the
  seat (HC-B5).
- *Brief fields (WS2's social section):* per other player: `reputation` and their public moves (PoliticsView.reputation);
  the seat's own cards with them (observe → cardsOf: stage, terms, outcomes); `trust(obs, id)` (WS1); the seat's own
  open promises (promisedVotes). Never another pair's card.
- *HC-B1's catch:* an AI bluffs about its intentions; a broken card is what the table sees (S3-RULE-11).

**Worked example** (Brix's view, month 3 planning, after accepting): `me.deals.cards[0] = { id: 'card-4', from: 'lena',
to: 'brix', terms: [{ kind: 'pact', by: 'lena', months: 3, outcome: 'open' }, { kind: 'pact', by: 'brix', months: 3,
outcome: 'open' }, { kind: 'vote', by: 'lena', ballot: { kind: 'election', office: 'governor', month: 4 }, choice:
'brix', outcome: 'open' }], stage: 'active', end: null, offeredIn: 3, since: 3, until: 5 }`; Ossa's view has no
`card-4` anywhere; every view has `players[lena].reputation: 50`. In month 4 Lena votes Kai; at the ceremony's end every
view has `reputation: 40` for Lena and `politics.reputation[0] = { month: 4, player: 'lena', delta: -10, cause:
'voteBroken', with: 'brix' }`, and the news reads "Lena broke a vote promise to Brix: reputation −10."

## §4 · Failure & Ops `[handoff]`

| Question | Answer |
|---|---|
| Dependency unavailable? | None external: cards, reputation and the AI are in-process and seeded. A Smart seat with no key plays DealHand's keyless rule (S3-C13). |
| Retry / poison? | A refused intent throws RuleError and reaches the player (S3-HC-7); nothing retries. An AI's refused card is not re-sent (the hand moves on, as `Act` returns false). |
| Idempotency | answer and withdraw act once (a second call finds the card ended and refuses); a repeated offer to the same player is refused (S3-RULE-2 row 5). Settlement runs once per term (outcome leaves `open` once). |
| Races | Intents, ticks and phase changes run on the server's one loop. An answer that arrives after planning ended finds the card lapsed. The flush before Ready ends planning answers every AI's open offer first (S3-C11). |
| What still works when deals break? | The host switches politics off (S3-HC-4). With politics on and a deals fault, elections and laws still run: settleVotes is the only call politics.ts makes into diplomacy.ts. |
| How to know it works, and is used | The sim's deals row (S3-C16); the news line at each break; the record's card notices. |

## §5 · Delivery `[handoff]`

Code-only; no existing state to reach: games live in server memory and the sim is fresh per run. A recorded game from
before this slice replays without cards (diplomacy starts empty; no recorded intent names a card). Rollback is a revert;
politics off removes the feature at the table.

## §6 · Acceptance Criteria `[handoff]`

| AC | Given / When / Then | Changes | observed_at | negative case |
|---|---|---|---|---|
| S3-B-AC-1 (UBER-AC-3 leg A) | Given month 2 planning, two phones and AI seats · When Lena whispers Brix, attaches a 3-month pact and Brix taps Accept · Then both phones list the pact as active until month 4, and neither Ossa's phone nor the TV receives any card | C2 C10 C11 C17 C18 | both phones' DOM (e2e); Ossa's and the TV's view JSON (server test) | Brix taps Decline → both phones show it declined; nothing active |
| S3-B-AC-2 (S3-UBER-AC-1) | Given Brix runs for Governor and Lena holds an accepted vote promise for Brix · When Lena votes for another candidate and the ceremony ends · Then every screen shows Lena's reputation 10 lower, the TV banner and the news say "Lena broke a vote promise to Brix", and during the ceremony no screen had changed | C3 C11 C20 C21 | both phones and the TV (e2e); the views during and after the ceremony (server test) | Lena votes Brix → +3, no banner, no news line |
| S3-B-AC-3 (UBER-AC-3 leg C) | Given an AI seat is offered a card by a phone, no API key set · When every human presses Ready at once · Then the AI's answer reaches the proposer's phone before planning ends | C11 C13 | the proposer's view before the phase changes (server test); e2e step | a proposer below 30 reputation → declined (S3-RULE-9 row 1) |
| S3-B-AC-4 (UBER-AC-3 leg B; waits for slice 4) | Given Lena and Brix hold a pact · When slice 4 catches Lena sabotaging Brix · Then her reputation falls by 20 on every screen and the line names the broken pact | C4 C11 C20 | phones and TV (S4's e2e) | caught after the pact ended → no pact move |
| S3-B-AC-5 | Given Governor Lena promised "no higher than 8%" · When she sets 10% in month 2 and again in month 3 · Then her reputation falls by 10 once, with the public line, and not again that term; a Governor who kept every month gains 5 when the term ends | C6 C11 | engine state; views (server test) | appointed Governor → no move |
| S3-B-AC-6 | Given any planning screen · When reputation changes · Then a chip beside every player's name shows the new number on phone standings, hub names and the TV strip, and its tap lists the public moves | C10 C19 | phone and TV DOM (e2e) | a kept move never names the partner |
| S3-B-AC-7 (S3-UBER-AC-2) | Given `pnpm sim` on the three seed sets, politics on · Then S3-UBER-AC-2's thresholds hold and politics-off output is byte-identical | C13-C16 | the sim report | — |
| S3-T-AC-1 (serves B-AC-1) | every S3-RULE-2 row's verdict and words, for offer, answer, withdraw; every call leaves money, stock, tiles, MULEs unchanged (S3-HC-1) | C2 | engine test | row 15 never fires on a third party's card |
| S3-T-AC-2 (serves B-AC-2) | every S3-RULE-4 row, election and law; the sweep voids stale terms | C3 C8 | engine test | — |
| S3-T-AC-3 (serves B-AC-2) | the move applies at takeOffice/takeEffect, not at ballot close; the tally's weights are taken at close before any move | C3 | engine test; server views during the ceremony | — |
| S3-T-AC-4 (serves B-AC-2, B-AC-6) | S3-RULE-3: deltas, the kept limit per partner per term, clamping at 0 and 100, zero moves not logged | C5 | engine test | the unrest event still moves −1 with its change line |
| S3-T-AC-5 (serves B-AC-1) | S3-RULE-7: a third phone's and the TV's views and a third seat's observe() hold no card, no card id, no kept partner; observe() hides others' council ballots | C9 C11 | view JSON (server test); observe (engine test) | the parties' own views hold the card |
| S3-T-AC-6 (serves B-AC-7) | politics off: diplomacy null, the three intents refused, sim output byte-identical | C1 C8 | engine test; WS1's sim row 0 | — |
| S3-T-AC-7 (serves B-AC-2) | voteWeight floors at 1: reputation 20, no land, no taxes → 1 | C7 | engine test | reputation 20 and 10 plots → 1 (1+1−1) |
| S3-T-AC-8 (serves B-AC-3) | DealHand's S3-RULE-9 rows; its draws leave the election and council fixtures unchanged | C13 | ai test on a seeded game | Rookie answers, never refused |
| S3-T-AC-9 (serves B-AC-7) | VoteHand's S3-RULE-10 rows; no draw | C14 | ai test | no promise → today's vote |
| S3-T-AC-10 (serves B-AC-3) | the server flushes DealHands before planning ends by Ready and by Continue; a muted AI's offer is refused once mute exists | C11 | server test | — |
| S3-T-AC-11 (serves B-AC-1) | each lifecycle event emits exactly one notice; private ones carry `parties`; a broken term's notice does not | C12 | the record (server test) | — |
| S3-T-AC-12 (serves all) | a recorded game with cards replays to the same state hash | C1-C3 | WS3's replay test | — |
| S3-T-AC-13 (serves B-AC-5) | S3-RULE-6 rows | C6 | engine test | — |
| S3-T-AC-14 (serves B-AC-4) | S3-RULE-5: expiry kept with and without sabotagePossible (no move without); breach rows 1-3, once per card, kept → broken | C4 | engine test (calls pactBreach directly) | breach for a month outside the pact → false |
| S3-T-AC-15 (serves B-AC-4, UBER-AC-3 leg B's engine half) | pactBreach in month 4 of a 3-5 pact → the saboteur −20 with `with` = victim, the victim's term kept, true | C4 | engine test | — |

Invariants for every test: no card moves money, goods, plots or MULEs; reputation stays in 0..100; a view of a seat that
is not a party never holds a card id; one RepMove per applied non-zero change.

## §7 · Risks & Spikes `[review-only]`

- **Slice 4 slips past RC: pacts never break.** Mitigation: pacts still work as signed promises, and earn no kept
  reputation without sabotage (S3-RULE-5), so nothing is farmed; vote promises carry G-4's e2e alone (S3-UBER-AC-1).
- **Reputation farming between friends** (vote promises they would keep anyway). Mitigation: the kept limit per
  partner per term (S3-RULE-3); WS1's row reports the reputation spread; one config value tightens it.
- **AI seats never offer, so S3-UBER-AC-2 fails.** Mitigation: offer rows a and b need no sabotage (a candidate asks
  for votes; a Governor asks for yes votes); WS1 tunes `POLITICS.ai.deals` in its PR, the sim row is the gate.
- **The TV and the chips leak a ballot result early.** Mitigation: moves apply at take-effect (S3-HC-6, S3-T-AC-3).
- **A third party learns of a card through a refusal or the voted list.** Mitigation: refusals check only the actor's
  own promises (S3-RULE-2 privacy); no preset ballots (§0.1).
- **Landmine (WS1, FM-WS3-4):** a what-if copy sharing state. Mitigation: diplomacy.ts copy-on-write plus cloneForSim's
  structuredClone (S3-C9), as politics (AM-4).
- **Landmine (slice 2a AM-4):** an AI stream seeded from `state.seed`. Mitigation: the deal stream hashes the seat's salt
  (S3-HC-3), as INV-41.
- **WS6 is the RC bottleneck.** Mitigation: engine, server and AI PRs need no screen; the screens are five small places
  in existing desks, and the mock already sketches P1/P2.
No spike needed.

## Sizing `[review-only]`

| PR | Owner | Days | Runs after |
|---|---|---|---|
| 0 · contract commit: §3 types, intents, views, notices, config keys (values as above) | WS3 (+ WS7 config) | 0.5 | Heiko's ruling |
| 1 · engine: diplomacy.ts, politics.ts/colony.ts hooks, voteWeight floor | WS7 | 1.5 | PR-0 |
| 2 · engine named edits: game.ts calls, events.ts, observe.ts | WS3, WS1 | 0.5 | PR-0 (stub diplomacy.ts) |
| 3 · server: intents, DealHand tick and flush, notices, news; politics-view.ts views | WS3 + WS7 | 1.5 | PR-0 |
| 4 · AI: deal.ts, vote.ts keepOrBreak | WS7 | 1 | PR-0 (WS1 values stubbed) |
| 5 · values + sim: value.ts six functions, actions/play/sim, deals row | WS1 | 2 | PR-0 |
| 6 · mocks P1-P5 + ballot line | WS6 | 1.5 | Heiko's ruling (parallel to PR-0) |
| 7 · phone: Deals.tsx (P1-P3), Who chip, ballots (C21); Chat/desks/today named edits | WS7 path, PM's build lane | 2 | PR-0, PR-6 |
| 8 · TV and month end: TvDeals, TableApp strip chip, MonthEnd, Standings | WS4 (+ WS7 file) | 1 | PR-0, PR-6 |
| 9 · e2e (S3-UBER-AC-1, UBER-AC-3 A and C) + rulebook | WS7 | 0.5 | PR-1, 3, 7, 8 |

About 12 lane-days in all, WS6's mocks 1.5 of them; after PR-0, PRs 1-6 run in parallel; the critical
path is PR-0 → PR-6 → PR-7 → PR-9, about 4.5 days, so a 9 Nov ruling lands it 13-14 Nov.

## §8 · Amendments `[review-only]`

None yet.

## §9 · Ownership Boundaries `[handoff]`

### Ownership: deal cards and reputation
- Sole owner:      packages/engine/src/diplomacy.ts
- Read contract:   GameState.diplomacy (observe(), politics-view.ts, DealHand, VoteHand); Player.reputation (anyone)
- Write contract:  only diplomacy.ts writes state.diplomacy, each write through copy-on-write edit(); only
                   diplomacy.ts's moveReputation writes Player.reputation (through politics.ts::reputationShift, which no
                   other module calls once events.ts is switched, S3-C5). politics.ts and colony.ts call settleVotes,
                   settleTerm and settleTaxPromise; slice 4 calls pactBreach; game.ts calls closePlanningDeals and
                   monthEndDeals.
- Enforcement:     engine tests; the PR checklist greps `diplomacy\s*=|\.reputation\s*[+-]?=` outside diplomacy.ts and
                   politics.ts (reputationShift) and `reputationShift(` outside diplomacy.ts.

### Ownership: Player.reputation (a second writer today)
- Owner today:     politics.ts::reputationShift, called by events.ts (blamedForUnrest).
- Change:          diplomacy.ts's moveReputation becomes the only caller; events.ts calls it (WS1 named edit).
- Enforcement:     S3-T-AC-4 and the grep above.
