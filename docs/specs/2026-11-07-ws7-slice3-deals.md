# WS7 politics · slice 3: deal cards and reputation

Programme amendment to `docs/specs/2026-10-22-ws7-politics.md` (D1 slice 3) · WS7 design writer · 2026-11-07 ·
**Status:** written and self-reviewed; reworked onto WS7's frozen contract types (7 Nov, binding on slices 3-5: §8 AM-1).
For WS7's merge into the politics amendment set and Heiko's ruling (design approvals 9-12 Nov, build 12-16 Nov). Base
`origin/feat/strategist` 52c54b07. **Serves Mission Goal G-4.** Heiko's plan A (7 Nov): RC 18 Nov, this slice in full.

Ids: changes S3-C1+, rules S3-RULE-1+, constraints S3-HC-1+, proofs S3-UBER-AC-1+, ACs S3-B-AC-n / S3-T-AC-n. Slice 4
uses S4-, slice 5 S5-. The parent's UBER-AC-3 is reused as written, split into legs. Ids withdrawn by AM-1 stay listed as
withdrawn so the merged set's numbering does not move.

---

## §0 · Business Goals & Value `[handoff: goal lines and proofs]` `[review-only: who / today / value / cost]`

Provenance: Heiko, 22 Oct, ruled the politics §0 (P-2: "Players make pacts and keep or break them, and everyone can see
who is trustworthy") and D1's slice order (slice 3 = deal cards and reputation). Heiko, 7 Nov (SEAMS 2026-11-07T10:27Z):
the first release candidate has "All 3 parts + Claude's social side too", with "computer players use them"; he picked
plan A (RC 18 Nov), in which deal cards and reputation ship in full. Mission G-4's proof (program.yaml) is "set in WS7's
approved spec section 0 (sim with AI elections and laws, balance checks hold; e2e with whispers, a deal card and a
vote)": S3-UBER-AC-1 is that e2e for slice 3, S3-UBER-AC-2 its sim row.

**S3-1 (P-2) · Players make pacts and vote promises on deal cards, keep or break them, and everyone can see who is
trustworthy.**
- *Who benefits:* every player at the table who wants to cooperate or scheme; a solo player against AI seats, who needs
  computer players whose word means something (00-concept, "Solo play").
- *Today:* talk binds nothing. Whispers and five reactions work (`packages/tabletop/src/protocol.ts::ChatMessage` has a
  `to`; `packages/protocol/src/index.ts::EMOTES`), but no card, pact or promise exists in the engine, protocol, server or
  web (`git grep -niE 'dealcard|deal card|\bpact|offerCard|diplomacy' packages/*/src apps/server/src apps/web/src` → no
  hit). Reputation starts at 50 (`packages/engine/src/config.ts::START`) and only the "blamed for the unrest" event moves
  it, by 1 point (`packages/engine/src/events.ts::applyEvents`); the rulebook counts 21 blamings to lose a vote. A
  player's reputation shows on nobody's screen but their own ballot ("a name of 50",
  `apps/web/src/phone/hub/politics/ElectionDay.tsx`); `PlayerView` has no reputation field. The hub mock shows a deal
  card and "+ Deal" marked "soon, slice 3" (`design/mocks/ws6-ux/src/screens/PlanningHub.tsx`). verified_by: read.
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
  phones and the TV) shows Lena's reputation `|POLITICS.reputation.moves.voteBroken|` lower, and the TV and the news say
  Lena broke her vote promise to Brix. Nothing changed on any screen before the result showed.

**S3-2 (Heiko, 7 Nov: "computer players use them") · Computer players offer, answer, keep and break deal cards, so a
table of AI seats plays the same social game.**
- *Who benefits:* the solo player and every mixed table; Heiko's playtest first.
- *Today:* AI seats run, vote, set the tax and propose laws by code (`packages/ai/src/hands/vote.ts::VoteHand`); there
  is no `deal.ts` hand (SEAMS reserves `packages/ai/src/hands/{vote,deal}.ts` for WS7), and no AI value reads
  reputation (`git grep -niE 'trust|reputationCost|cardWorth' packages/ai/src` → no hit). verified_by: read.
- *Value:* the AI seats court, bargain and betray in code, keyless and replayable; Claude's social side (WS2) later uses
  the same cards through the same intents.
- **S3-UBER-AC-2:** `pnpm sim` on all three seed sets (1, 101, 201), politics on: AI seats accept at least one card in
  at least 80% of games; at least one vote card settles kept or broken in at least half of the games; each seed set has
  at least one break by an AI seat; and the reputation spread at game end (highest minus lowest) is at least
  `POLITICS.reputation.moves.kept` in at least half of the games. The politics row prints cards offered, accepted, kept,
  broken and expired. Every check that passes with politics off still passes, and politics-off output is byte-identical.
- **UBER-AC-3 leg C** (above) is also S3-2's: an AI seat answers a human's card within planning, keyless.

**Non-goals** `[review-only]`:
- **Anything of value on a card** (HC-3): no money, goods, plots or MULEs, ever. Cards carry a pact or a vote promise.
- **The Governor's tax promise as a card, or reputation for keeping or breaking it** (frozen contract: it stays as it is,
  `Politics.promise` with its record in `Colony.promises`, feeding the mood). A later option, one rule row.
- **Borrowed votes** (design 05's fifth weight source): a later option, a second path into `voteWeight`.
- **Campaign law promises** ("no land tax", AM-11 / AM-16): a later option, D-S3-1.
- **A card with two terms** (a pact plus a vote, or a vote swap; the hub mock's sketch "pact + vote together on the land
  tax"): one term per card in RC (frozen `DealTerms`); two cards do the same.
- **Asking for a vote on a card**: a vote promise is always the proposer's own vote (frozen); a candidate asks in a
  whisper and the voter sends the card.
- **Joint ventures** (shared adjacency): a production change, WS1's; the mock's "joint venture" wording goes.
- **The Sheriff's bribe card** and **investigating a broken deal**: slice 4.
- **Releasing a partner from an active card**, and offers outside planning: later.
- **Reputation moving store prices** (00-concept): a WS1 balance change after the sim shows reputation moves.
- **Claude seats issuing cards from their reasoning** (WS2 C10, B-AC-B7): after RC (plan A); §3 freezes WS2's port.
- **A pact channel** (00-concept's shared chat for pact partners): chat work, not in RC.
- **Screens before WS6 mocks them** (HC-46 carries over).

**Rough cost:** chosen about 10 PRs (PR-0 to PR-9), about 11.5 lane-days including WS6's mocks, about 4.5 days elapsed
from Heiko's ruling (Sizing). Thin baseline about 5 PRs (§0.1).

## What the table sees `[review-only]`

Places only; WS6 mocks every layout (`ux: mock: WS6, to come`), within politics layout P0 option A (Heiko 7 Nov): no new
tab, at most five sections per phone screen, an action starts where its target is. "Laptop" is the phone app at wide width (the shell's
1100 px layout), so it shows what the phone shows.

| Moment | The two parties' phones | Other phones | TV |
|---|---|---|---|
| Lena whispers Brix and taps **+ Deal** | Lena: the card composer (P1) opens from its target player: her whisper to Brix, or Brix's avatar or name: a pact (1, 3 or 6 months), or her vote promise (for a candidate in the next election for an office, or yes/no on the next law ballot) | nothing | nothing |
| The card arrives | Brix: the card in the whisper thread and on the agenda ("1 deal offer"), with Lena's and his own reputation, **Accept / Decline** (P2). Lena: "Waiting for Brix", **Withdraw** | nothing | nothing |
| Brix accepts | both: the card in **My cards** (one section of the Talk desk, no new tab) as active, with what it binds and until when (P3) | nothing | nothing |
| Planning ends with the card unanswered | both: "expired" | nothing | nothing |
| A candidate wants a vote | Brix asks in a whisper; Lena, if willing, sends the vote card (a card is always its proposer's own promise) | — | — |
| The ballot opens and Lena holds a vote promise | Lena: "You promised Brix your vote", Brix preselected; she still casts | nothing | nothing |
| The result shows: Lena **kept** it | Lena's chip +3 beside her name everywhere; My cards: kept | the chip change only | the chip change on the players strip |
| The result shows: Lena **broke** it | Lena's chip −10; My cards: broken | the chip change and the broken card in public: "Lena broke her promise to Brix: to vote for Brix" | a break banner and the news line (P5) |
| Lena is caught sabotaging Brix during a pact (slice 4) | "Caught!" adds "… and broke her pact with Brix"; her chip −30 (−10 caught, slice 4; −20 pactBroken) | same | same |
| A pact runs out unbroken | both: "Pact kept", +3 each (only where sabotage is on) | the chip change | the chip change |
| Every moment | a reputation chip beside every player's name: phone standings, hub names, TV players strip (P4); tapping it lists the public reasons (broken cards, unrest) | same | same |
| The month end | — | the month's broken cards | the same on the TV's month end |
| An AI seat | its offers arrive like a human's; it answers yours within seconds, before planning can end | — | — |

## Decisions for Heiko `[review-only]`

**D-S3-1 · Campaign law promises in the release candidate?** *What you will see at the table:* RC has two cards, a pact
and "I vote for X / I vote yes (or no) on the next law" (WS7's frozen contract). On 22 Oct you asked for law promises in
campaigns ("law promises with slice 2", AM-11; AM-16 moved them to slice 3); they are not in RC as designed.
- **A (recommended): after RC.** The two cards, as frozen; law promises the first thing after RC. *For:* no change to the
  election picker you approved "as shown", and WS6 is the RC's bottleneck (~17 serial days, SEAMS 2026-11-07T10:29Z).
  *Against:* defers your 22 Oct ask a second time.
- **B: in RC.** A Governor candidate also picks one law promise ("I won't propose a land tax"), broken the moment they
  propose it, at the same reputation cost as a broken vote promise. About +1 day, most of it WS6 reworking the picker.
- *Borrowed votes and the tax promise's reputation* are later options too (non-goals), not asked now.

**Ruled 2026-11-07 12:54Z (Heiko, board: "Approve all six as recommended"):** A, campaign law promises after RC.

*Recorded, implemented by the frozen contract (Heiko may overrule):* a broken card is public, whole: who promised what
to whom ("Lena broke her promise to Brix: to vote for Brix"). It tells the table one thing about Lena's secret ballot
(she did not vote as promised), never what she voted instead. She accepted that check when she signed; no other ballot
is revealed. Overruling it (only the drop shows, or only Brix learns) changes `observe()`'s filter and the views, not the
card types.

Decided here, as WS7's designer: pacts break only on an attributed sabotage (S3-RULE-5); not voting on a promised
ballot is a break (S3-RULE-4); votes never fall below 1 (S3-RULE-8); kept reputation is capped per partner per term
(S3-RULE-3); AI seats refuse cards from players below 30 (S3-RULE-9, design 00: "AI players who refuse to deal with
you"); offers expire when planning ends (the mock: "expires at Ready").

## §0.1 · Decision Record `[review-only]`

- **Chosen (~10 PRs, ~11.5 lane-days).** Cards live in `Politics.deals` (frozen), every card kept for the whole game. A new
  engine module, `packages/engine/src/diplomacy.ts` (a WS7 path in SEAMS), is the only code that writes `Politics.deals`,
  through politics.ts's copy-on-write `edit` (§9). Cards are offered, answered and withdrawn by three intents in
  planning; a vote card settles when its ballot's result takes effect (politics.ts calls in), a pact at its last upkeep or
  on slice 4's attributed sabotage. A new `DealHand` offers and answers for every AI seat on its own seeded stream;
  `VoteHand` keeps or breaks a promise at its vote; WS1 supplies four pure valuations. The views add a public reputation
  chip, the public broken cards, and each player's own cards.
- **Thin baseline (~5 PRs): a pact card and a vote promise; AI seats only answer (accept if the card costs them
  nothing), never offer or break; reputation shown on the owner's phone and the ballot only.** *Loses because* S3-2 and
  Heiko's 7 Nov condition need computer players that *use* cards, and an AI that never offers or breaks a card never
  starts a deal at an AI-only table (check: SEAMS 2026-11-07T10:27Z, "computer players use them"); and P-2's "everyone
  can see who is trustworthy" needs reputation on every screen, which `PlayerView` lacks today (check:
  `packages/protocol/src/index.ts::PlayerView`).
- **Larger:** two terms per card (swaps), borrowed votes, campaign law promises. Not chosen: the frozen contract has one
  term per card; the rest are later options (D-S3-1, non-goals).
- **Rejected: preset ballots for promised votes.** Setting Lena's ballot when it opens would put her in the public
  "voted" list at once, telling the table she holds a promise (HC-4). The phone preselects locally instead (S3-C21).
- **Rejected: a public reputation history.** A log of every move would tell the table who kept a card with whom; the
  chip's public reasons are derived from what is already public (broken cards, the unrest events), and a kept gain shows
  only as the number rising (S3-RULE-7).

## §0.2 · Constraints `[handoff]`

```
S3-HC-1  No card moves money, goods, plots or MULEs. offerDeal/answerDeal/withdrawDeal and every settlement leave every
         player's money, stock, tiles and carried MULE unchanged.   source: parent HC-3, 00-concept 21 Oct   breach: fatal
S3-HC-2  An offered, active, declined, withdrawn, expired or kept card is seen only by its two parties: phones,
         observe(), notices, news, the record's reading by WS2. A broken card is public. Every server path decides with
         the one helper partyTo(viewerId, card) (frozen rule); the hands read observe(state, me), never raw state.
                                                               source: parent HC-4, frozen contract     breach: fatal
S3-HC-3  packages/engine stays pure; cards draw no randomness. AI deal draws come from DealHand's own stream hashed from
         the seat's salt and the month (slice 2a INV-41), so no election, council or game draw moves.
                                                               source: CLAUDE.md, slice 2a HC-41       breach: fatal
S3-HC-4  Politics off: politics is null, so no deals; the three intents are refused; WS1's politics-off sim output stays
         byte-identical.                                       source: parent HC, slice 2a HC-42       breach: fatal
S3-HC-5  Every number is a named value in config.ts's POLITICS block (POLITICS.deals, POLITICS.reputation.moves,
         POLITICS.weight.minVotes, POLITICS.ai.deals); hashing salts carry `// literal-ok:` (WS1's INV-1 guard).
                                                               source: CLAUDE.md, parent HC-2           breach: fatal
S3-HC-6  A reputation change from a ballot shows when that ballot's result shows (the ceremony's end, the law reveal's
         end), never at ballot close: earlier, the chips would leak the result.   source: RULE-62/64     breach: fatal
S3-HC-7  Rules throw RuleError with the words a player sees.    source: CLAUDE.md                       breach: fatal
S3-HC-8  Edits outside WS7's paths are the named edits in the split table, recorded in SEAMS before the PR.
                                                               source: programme rule                  breach: decision
S3-HC-9  No screen before WS6's slice-3 mock is approved by Heiko; the mock is the scaffold.
                                                               source: parent non-goals, HC-46          breach: fatal
S3-HC-10 The types in §3 marked FROZEN are WS7's 7 Nov contract, word for word; a rule that needs a change to them goes to
         WS7 first, never into a PR.                           source: WS7 (frozen-types, 7 Nov)        breach: fatal
```

## §1 · Solution Design `[handoff]`

The repo is not prism-indexed: call-site lists are grep-built (`git grep -n`), a weaker claim than find-refs.

```
S3-C1 · ADDED · Politics.deals: every deal card of the game, and diplomacy.ts that writes it

today        no deal state. politics.ts is the sole writer of state.politics, every write through its private
             copy-on-write edit(); newPolitics builds the empty object.
             anchors: packages/engine/src/types.ts::Politics, packages/engine/src/politics.ts::newPolitics,
             packages/engine/src/politics.ts::edit
             verified_by: read
tomorrow     MUST add the FROZEN DealTerms, DealCard and Politics.deals (§3); newPolitics MUST start deals as [].
             MUST add packages/engine/src/diplomacy.ts as the only code that writes Politics.deals, through politics.ts's
             edit(), which politics.ts exports as editPolitics for it (one export line; §9).
logic        → §2 S3-RULE-1 (a card's life)
seam         types.ts (WS3 named edit); politics.ts::newPolitics and the editPolitics export (WS7); diplomacy.ts (new,
             WS7 path per SEAMS row 232)
senior       junior would: write politics.deals from diplomacy.ts with its own structuredClone, or keep cards on Player.
             · senior does: one copy-on-write path for the whole Politics object, so a what-if copy that shares it can
             never see a card change (AM-4), and cloneForSim's existing structuredClone(politics) copies the cards.
mechanism    sprout
call sites   newPolitics: game.ts::createGame. editPolitics: diplomacy.ts only.
reuse check  `git grep -niE 'dealcard|deal card|\bpact|diplomacy' packages/*/src apps/server/src` → none. Nearest:
             packages/engine/src/types.ts::Deal is the auction's buyer-seller pair (hence DealCard); politics.ts::edit is
             the copy-on-write pattern reused.
depends_on   none
```

```
S3-C2 · ADDED · offer, withdraw and answer a card in planning

today        none.
tomorrow     MUST let a player offer one other player one card (a pact for a set number of months, or their own vote
             promise) in planning, withdraw it until answered, and let the receiver accept or decline it with one call;
             MUST refuse everything S3-RULE-2 refuses, with its words; MUST fix the card's `until` at offer (the pact's
             last month, or the month of the ballot the vote binds).
logic        → §2 S3-RULE-1, S3-RULE-2 · evaluated at each intent · writes politics.deals
seam         diplomacy.ts (new): offerDeal, withdrawDeal, answerDeal, dealUntil, dealsOf
senior       junior would: let the phone send `until`. · senior does: the engine computes it from the terms (the next
             election month for the office, the next law ballot's month), so a later ballot can never satisfy an old
             promise and a phone cannot stretch a pact.
mechanism    sprout
call sites   server intents (S3-C11), DealHand (S3-C13), play.ts applyAction (S3-C16), engine tests
reuse check  `git grep -niE 'offer|accept|decline' packages/engine/src` → only the auction's walk sides and lots
             (no answerable object). Nearest shape: lots.ts listings (an owned thing withdrawn by unlistLot); not reused,
             the lifecycle differs (an answer by another player).
depends_on   S3-C1 (data)
```

```
S3-C3 · ADDED · a vote card settles when its ballot's result takes effect

today        the election seats winners at the ceremony's end (takeOffice); a law takes effect at its reveal's end
             (takeEffect); AM-1's closeVotes runs both when planning ends early.
             anchors: packages/engine/src/politics.ts::takeOffice, ::takeEffect, ::closeVotes, ::stepVotes
             verified_by: read
tomorrow     MUST, as takeOffice runs, judge every active vote card bound to this month's election by S3-RULE-4 from the
             closed ballots and move reputation; MUST do the same for law cards as takeEffect runs; MUST expire, when
             planning closes, any active vote card whose `until` has come without a ballot that settled it.
logic        → §2 S3-RULE-4, S3-RULE-3 · reads election.ballots / council.ballots (secret, engine-only) · writes cards'
             status, brokenBy, settled and the promiser's reputation
seam         politics.ts::takeOffice and ::takeEffect each gain one call to diplomacy.ts's settleVotes(state, 'election'
             | 'law') (WS7's own file); the expiry sweep is in closePlanningDeals (S3-C8)
senior       junior would: judge at ballot close. · senior does: at the result's take-effect, so the chips never move
             during the ceremony (S3-HC-6); weights for the tally are taken at close as today, so a break never changes
             the ballot it broke.
mechanism    sprout + in_place (two one-line calls)
call sites   takeOffice: stepElection (ceremony end), closeElection; takeEffect: stepVotes, closeVotes. All in politics.ts.
pin          the election and council tests (packages/engine/test/politics*.test.ts) pass unchanged with no cards
depends_on   S3-C1, S3-C2 (data)
```

```
S3-C4 · ADDED · pacts run, end kept, and break on an attributed sabotage (slice 4's hook)

today        no sabotage exists (slice 4 designs it in parallel: Politics.sabotage, SabotageOrder, frozen); no pact.
tomorrow     MUST settle a pact kept at the upkeep of its `until`. MUST export
             pactBreach(state, saboteurId, victimId, sabotageMonth): boolean, which slice 4 calls whenever an order's
             culprit becomes public (caught on the spot, or later revealed by an investigation: culpritPublic turning
             true), and which breaks the pact that bound the two in that month (S3-RULE-5). MUST export
             pactBetween(state, a, b, month?) for slice 4's order screen and SabotageHand, and sabotagePossible(state),
             false until slice 4 replaces its body (S4's named edit in this WS7 file).
logic        → §2 S3-RULE-5, S3-RULE-3
seam         diplomacy.ts: pactBreach, pactBetween, sabotagePossible; the upkeep call is S3-C8
senior       junior would: forbid sabotage against a pact partner. · senior does: a pact is breakable; breaking it is
             the drama, and only an attributed sabotage breaks it publicly, so an undetected one leaves the doubt the
             design wants (00-concept, "The sabotage reveal").
mechanism    sprout
call sites   slice 4's capture and investigation (S4's spec names them); monthEndDeals (S3-C8)
reuse check  `git grep -ni sabot packages/engine/src` → only persona names in config.ts (slice 4 unbuilt); the
             AI_LEVELS[…].sabotage switch exists and cardWorth reads it.
depends_on   S3-C1, S3-C2 (data). UBER-AC-3 leg B: slice 4's capture (contract stubbable; its e2e is not)
```

```
S3-C5 · MODIFIED · cards move reputation through reputationShift, by named amounts; the chip's public reasons

today        reputationShift(state, id, delta) clamps to POLITICS.reputation and writes Player.reputation; its only
             caller is the blamedForUnrest event.
             anchors: packages/engine/src/politics.ts::reputationShift, packages/engine/src/events.ts::applyEvents
             verified_by: read
tomorrow     MUST move reputation for cards only through reputationShift, by POLITICS.reputation.moves (S3-RULE-3).
             MUST export a pure reputationReasons(state, playerId) for the views: the player's public broken cards and
             their unrest events this game, newest first (S3-RULE-7). No history of moves is stored.
logic        → §2 S3-RULE-3, S3-RULE-7
seam         diplomacy.ts (calls reputationShift; reputationReasons)
senior       junior would: store every move with its cause. · senior does: derive the public reasons from what is public
             already, so no stored record can tell the table who kept a card with whom.
mechanism    in_place (reuse) + sprout (reputationReasons)
call sites   diplomacy.ts settlement paths; events.ts unchanged
pin          the blamedForUnrest event tests pass unchanged
depends_on   S3-C1
```

```
S3-C6 · WITHDRAWN (AM-1) · the Governor's tax promise moving reputation: a later option (non-goals)
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
S3-C8 · MODIFIED · the month's clock: offers expire when planning closes; pacts settle at upkeep

today        advancePhase's planning branch calls keepPromise then closeVotes; its upkeep branch collects law taxes,
             pays the grant and the offices, runs the colony, then may end the game.
             anchors: packages/engine/src/game.ts::advancePhase
             verified_by: read
tomorrow     MUST call diplomacy.ts's closePlanningDeals(state) right after closeVotes (offered cards expire; active
             vote cards whose `until` has come expire), and diplomacy.ts's monthEndDeals(state, gameOver) in the upkeep
             branch just before the gameOver check (pacts whose `until` is this month settle kept; at game over active
             pacts settle kept as at their end and active vote cards expire).
logic        → §2 S3-RULE-1, S3-RULE-4, S3-RULE-5
seam         game.ts::advancePhase, two one-line calls (WS3 named edit)
mechanism    in_place
pin          politics-off sim byte-identical (both calls return at once when politics is null)
depends_on   S3-C1
```

```
S3-C9 · MODIFIED · observe() filters the cards; law ballots hidden too

today        observe() hides other seats' election ballots; it does NOT hide the council's ballots
             (structuredClone(politics) keeps council.ballots whole). cloneForSim structuredClones politics.
             anchors: packages/engine/src/observe.ts::observe, ::cloneForSim
             verified_by: read
tomorrow     MUST keep in observe(state, me).politics.deals only the cards where me is `from` or `to`, plus every card
             with status 'broken' (public). cloneForSim needs no change (it copies politics whole).
             Also required, but WS1 is fixing it separately first, PR outside this slice (do not build it here): observe()
             hides other seats' council ballots as it hides election ballots (a slice 2a gap found while writing this:
             with vote promises, a seat reading others' law ballots would know of a break before the table does).
logic        → §2 S3-RULE-7
seam         observe.ts (WS1 named edit), the same filter as the server's partyTo
mechanism    in_place
pin          T-AC-7 of the parent (no seat sees another's election ballot) still passes
depends_on   S3-C1
```

```
S3-C10 · MODIFIED · the protocol: three intents, the deals views, a public reputation

today        MuleIntent has no deal intent; PlayerView has no reputation; MyPoliticsView.reputation is the owner's only.
             anchors: packages/protocol/src/index.ts::MuleIntent, ::PlayerView, ::MyView, ::MyPoliticsView,
             ::PoliticsView, apps/server/src/server.ts::isIntent
             verified_by: read
tomorrow     MUST add the intents offerDeal, withdrawDeal, answerDeal; PlayerView.reputation (public);
             PoliticsView.brokenDeals and PoliticsView.reputationReasons (public); MyView.deals (the player's own cards);
             MyPoliticsView.promised (their promised votes). Exact shapes: §3.
seam         protocol index.ts and server.ts::isIntent (WS3 named edits): the contract commit, first
mechanism    in_place
depends_on   S3-C1 (types)
atomicity    the contract commit carries every §3 type at once, so engine, server, screens and AI build in parallel
```

```
S3-C11 · MODIFIED · the server plays cards: intents, views, the break news, the planning tick, a flush before planning ends

today        MuleGame.handle routes run/vote/propose…; VoteHands tick only while votes are open (and once at planning
             start); viewFor builds politicsView / myPoliticsView.
             anchors: apps/server/src/mule-game.ts::MuleGame, apps/server/src/politics-view.ts::politicsView,
             ::myPoliticsView, ::councilNews
             verified_by: read
tomorrow     MUST route the three intents to diplomacy.ts. MUST build every deals field through one helper
             partyTo(viewerId, card) (frozen rule: a party, or the card is broken) in politics-view.ts. MUST tick every AI
             seat's DealHand through all of planning on WALK.tickMs, and MUST, before planning ends by Ready or the
             host's Continue, flush every DealHand (answer every open offer to it at once), so an AI always answers
             within planning (UBER-AC-3 leg C). MUST add one news line per card that turns broken
             (politics-view.ts's dealNews, new) and pass S3-C12's notices. MUST refuse an AI seat's offer to a player who
             muted it, once WS2's mute exists.
logic        → §2 S3-RULE-7, S3-RULE-11
seam         mule-game.ts (WS3 named edits: handle cases, a dealHands map beside voteHands, the planning tick, the flush
             in checkAllReady and continuePlanning, noteDeals after each intent, tick and phase change); politics-view.ts
             (WS7: partyTo, dealsView, promisedView, dealNews, dealNotices)
senior       junior would: diff reputation numbers to find breaks, or filter in each view by hand. · senior does: diff
             the cards (copy-on-write makes the last politics object a snapshot) and decide every visibility through
             partyTo, the same rule observe() applies.
mechanism    in_place
call sites   MuleGame.handle, .aiAct, the election tick, startPlanning, checkAllReady, continuePlanning, nextPhase,
             viewFor
pin          apps/server/test/politics*.test.ts election and council rows pass unchanged
depends_on   S3-C10 (contract, stubbable), S3-C2 (engine)
```

```
S3-C12 · MODIFIED · the record's notices gain the deal facts, private ones marked

today        NoticeEntry is "a public fact as it settled": claim, declare, trade, sale; WS2's memory reads them.
             anchors: packages/engine/src/record.ts::NoticeEntry, apps/server/src/mule-game.ts::MuleGame (notify)
             verified_by: read
tomorrow     MUST add one kind, `deal` (§3), with the card as it now stands and `parties` on every event but 'broken'.
             MUST state on the type: a notice with `parties` is private to those seats; any consumer that builds one
             seat's view (WS2's memory and brief, packages/ai/src/playbook/outcome.ts) MUST skip it for other seats.
seam         record.ts (WS3 named edit); mule-game.ts's notify, fed by politics-view.ts's dealNotices(before, after)
mechanism    in_place
call sites   notify's listener: apps/server/src/record.ts (Recorder.notice); readers: packages/ai/src/playbook/outcome.ts
depends_on   S3-C10, S3-C11
```

```
S3-C13 · ADDED · DealHand: every AI seat answers and offers cards (packages/ai/src/hands/deal.ts)

today        none (SEAMS reserves the path for WS7).
tomorrow     MUST, for every AI seat with no API key needed: answer each card offered to it after a seeded pause, or at
             once on flush (S3-RULE-9 answer rows); offer at most POLITICS.ai.deals.offersPerMonth cards a month in two
             windows, an election's announce and planning proper (S3-RULE-9 offer rows); decide only on
             observe(state, me) (S3-HC-2); draw only from its own stream (S3-HC-3). MUST take an optional DealPort
             (WS2's) whose recorded answer or offers replace the keyless rule when present.
logic        → §2 S3-RULE-9 · values from WS1 (Hand decisions)
seam         packages/ai/src/hands/deal.ts (new, WS7): class DealHand(mind, port?) { tick, flush, offer, answer }
senior       junior would: decide inside VoteHand or the strategist. · senior does: one hand for the card table,
             constructed and ticked like VoteHand, so the server and the sim drive it the same way.
mechanism    sprout
call sites   mule-game.ts (S3-C11), play.ts (S3-C16)
reuse check  `ls packages/ai/src/hands` → auction, develop, floor-walker, lot, vote: no deal hand; VoteHand's council()
             stream is the pattern reused for the deal stream.
depends_on   S3-C2 (engine), S3-C15 (values, stubbable: WS1's confirmed signatures)
```

```
S3-C14 · MODIFIED · VoteHand keeps or breaks a promised vote

today        VoteHand votes by RULE-8/RULE-63 (itself, else the fewest plots, leaning against an unloved Governor) and
             on laws by RULE-46.
             anchors: packages/ai/src/hands/vote.ts::VoteHand
             verified_by: read
tomorrow     MUST, when it holds an active vote card for the ballot it is voting on, keep it unless S3-RULE-10 says
             break; with no promise, MUST vote exactly as today. MUST export a deterministic ownVote(obs, mind, ballot)
             (today's choice with no tie draw; null on a tie) that DealHand's offer rows read.
logic        → §2 S3-RULE-10
seam         vote.ts (WS7): one check in vote() and lawVote() through a private keepOrBreak; ownVote extracted
senior       junior would: always keep (no betrayal) or draw a coin. · senior does: a deterministic comparison of
             breakGain against the reputation cost scaled by the persona's honesty, so no seeded stream moves.
mechanism    in_place
pin          packages/ai/test vote-hand and council-ai tests pass unchanged (no cards there)
depends_on   S3-C2, S3-C15
```

```
S3-C15 · ADDED · WS1's valuations for cards (packages/ai/src/value.ts)

today        value.ts prices land, goods, outfits and cash; nothing prices a card, a vote or reputation.
             anchors: packages/ai/src/value.ts::Mind
             verified_by: read
tomorrow     MUST add WS1's four confirmed pure functions (Hand decisions): cardWorth, trust, reputationCost, breakGain,
             each reading obs (observe's output) only.
seam         value.ts (WS1)
mechanism    sprout
reuse check  `git grep -niE 'trust|reputationCost|cardWorth' packages/ai/src` → none. Nearest: politics.ts::lawImpact
             for a law's cost per player, which cardWorth and breakGain MUST reuse for law cards.
depends_on   S3-C1 (types)
```

```
S3-C16 · MODIFIED · the sim plays cards and prints a deals row (WS1)

today        play.ts's planning loop ticks VoteHands while votes are open, then plans the month; actions.ts has no
             deal action; sim.ts prints a politics row.
             anchors: packages/ai/src/play.ts::applyAction, packages/ai/src/actions.ts::AiAction
             verified_by: read
tomorrow     MUST add the three AiActions and route them in applyAction; MUST, in each planning window (an election's
             announce, then planning proper), run every seat's DealHand.offer, then every seat's DealHand.flush; MUST
             print cards offered/accepted/kept/broken/expired and the reputation spread, with S3-UBER-AC-2's checks.
seam         WS1's play.ts, actions.ts, sim.ts
mechanism    in_place
pin          politics-off rows byte-identical (S3-HC-4)
depends_on   S3-C13, S3-C15
```

```
S3-C17 · ADDED · P1: "+ Deal" on a whisper opens the card composer
ux           mock: WS6, to come (from PlanningHub.tsx's `add-deal` and `deal-card` placeholders at c312e7cb) ·
             GRAFT TARGET: new apps/web/src/phone/hub/politics/Deals.tsx (DealComposer), opened from its target player
             (politics layout P0 option A, Heiko 7 Nov): apps/web/src/chat/Chat.tsx's whisper input, and the player's
             avatar or name (apps/web/src/phone/hub/politics/parts.tsx::Who, the standings row)
tomorrow     MUST offer a pact (POLITICS.deals.pactMonths) or the player's own vote (a candidate for each elected
             office's next election, from the declared candidates; or yes/no on the next law ballot when one is up), send
             offerDeal, and show the engine's refusal words.
seam         Deals.tsx (WS7 path); Chat.tsx one mount (WS4 named edit); the Who and standings entry (WS7; WS4 named edit)
mechanism    fill_scaffold
depends_on   S3-C10 (contract), WS6's approved mock (not stubbable)
```

```
S3-C18 · ADDED · P2 and P3: the incoming card and My cards
ux           mock: WS6, to come · GRAFT TARGET: Deals.tsx (IncomingDeal, MyDeals); My cards is one section inside the
             Talk desk, no new tab (politics layout P0 option A, Heiko 7 Nov); the thread mount in Chat.tsx (WS4);
             the agenda entry "N deal offers" in apps/web/src/phone/hub/today.tsx (WS6, the mock's `deals` row)
tomorrow     MUST show an offered card in the pair's whisper thread and on the agenda with both reputations and Accept /
             Decline (one tap each); MUST list every card of mine: offered (Withdraw), incoming, active (what it binds,
             until when), and settled (kept, broken, declined, withdrawn, expired).
seam         Deals.tsx (WS7); Chat.tsx, today.tsx, desks.tsx (named edits to their owners)
mechanism    fill_scaffold
depends_on   S3-C10, WS6's mock
```

```
S3-C19 · MODIFIED · P4: a reputation chip beside every player's name
ux           mock: WS6, to come · GRAFT TARGET: apps/web/src/phone/hub/politics/parts.tsx::Who (WS7),
             apps/web/src/phone/hub/Standings.tsx (WS4), the TV players strip in apps/web/src/table/TableApp.tsx (WS4)
tomorrow     MUST show PlayerView.reputation beside each name, with its 70/30 thresholds readable, and on tap the
             player's public reasons (PoliticsView.reputationReasons).
mechanism    fill_scaffold
depends_on   S3-C10, WS6's mock
```

```
S3-C20 · ADDED · P5: the public break line on the TV and at the month end
ux           mock: WS6, to come · GRAFT TARGET: new apps/web/src/table/TvDeals.tsx (owner: WS7, as TvElection.tsx; PM
             to confirm), its route line in TableApp.tsx (WS4), apps/web/src/components/MonthEnd.tsx (WS4)
tomorrow     MUST show a banner on the TV when a card turns broken (who, to whom, what was promised, the drop) and list
             the month's broken cards at the month end.
mechanism    sprout
depends_on   S3-C10, S3-C11 (news), WS6's mock
```

```
S3-C21 · MODIFIED · the ballots show "You promised"
today        the election ballot and the law ballot show the choices and the voter's weight.
             anchors: apps/web/src/phone/hub/politics/ElectionDay.tsx, apps/web/src/phone/hub/politics/LawBallot.tsx
             verified_by: read
tomorrow     MUST, when MyPoliticsView.promised names this ballot, say to whom and preselect the promised choice locally
             (no intent until the player casts: S3-HC-2, §0.1's rejected preset).
ux           mock: WS6, to come
mechanism    in_place
depends_on   S3-C10, WS6's mock
```

### Who edits what (owners from the SEAMS path table and rulings)

| File | Owner | Named edit (what that owner does) | C |
|---|---|---|---|
| `packages/engine/src/diplomacy.ts` (new) | WS7 | offerDeal, withdrawDeal, answerDeal, dealUntil, dealsOf, promisedVotes, settleVotes, closePlanningDeals, monthEndDeals, pactBreach, pactBetween, sabotagePossible, reputationReasons, partyTo | C1-C5, C8 |
| `packages/engine/src/politics.ts` | WS7 | newPolitics `deals: []`; export editPolitics; voteWeight floor; takeOffice → settleVotes('election'); takeEffect → settleVotes('law') | C1, C3, C7 |
| `packages/engine/src/config.ts` POLITICS block | WS7 | deals, reputation.moves, reputation.keptPerPartnerPerTerm, weight.minVotes, ai.deals | all |
| `packages/engine/src/types.ts` | WS3 | the FROZEN DealTerms, DealCard, Politics.deals; DealOffer | C1 |
| `packages/engine/src/game.ts` | WS3 | advancePhase: closePlanningDeals after closeVotes, monthEndDeals before the gameOver check | C8 |
| `packages/engine/src/record.ts` | WS3 | NoticeEntry's `deal` kind and the `parties` rule | C12 |
| `packages/engine/src/observe.ts` | WS1 | filter politics.deals (party or broken); the council-ballot hiding is WS1's separate PR, first, outside this slice | C9 |
| `packages/engine/src/index.ts`, `packages/ai/src/index.ts` | anyone (export lines) | export diplomacy.ts, deal.ts | C1, C13 |
| `packages/protocol/src/index.ts` | WS3 | three intents, PlayerView.reputation, PoliticsView.brokenDeals and .reputationReasons, MyView.deals, MyPoliticsView.promised | C10 |
| `apps/server/src/server.ts` | WS3 | isIntent accepts the three intents | C10 |
| `apps/server/src/mule-game.ts` | WS3 | handle cases; dealHands beside voteHands; planning tick; flush before planning ends; noteDeals; mute refusal (when WS2's mute lands) | C11, C12 |
| `apps/server/src/politics-view.ts` | WS7 | partyTo use, dealsView, promisedView, dealNews, dealNotices; PlayerView.reputation's value | C11, C12 |
| `packages/ai/src/hands/deal.ts` (new) | WS7 | DealHand | C13 |
| `packages/ai/src/hands/vote.ts` | WS7 | keepOrBreak in vote() and lawVote(); ownVote | C14 |
| `packages/ai/src/value.ts` | WS1 | cardWorth, trust, reputationCost, breakGain | C15 |
| `packages/ai/src/{actions,play,sim}.ts` | WS1 | three AiActions; DealHand in the planning windows; the deals row | C16 |
| `apps/web/src/phone/hub/politics/{Deals,parts,ElectionDay,LawBallot}.tsx` | WS7 path (build lane: PM's piece list) | composer, incoming card, My cards, Who chip, "You promised" | C17-C19, C21 |
| `apps/web/src/chat/Chat.tsx` | WS4 | mount the composer on a whisper and the card in the thread | C17, C18 |
| `apps/web/src/phone/hub/{desks,today}.tsx` | WS6 | My cards as one section of the Talk desk (no new tab, P0 option A); the agenda's "N deal offers" | C18 |
| `apps/web/src/phone/hub/Standings.tsx`, `apps/web/src/table/TableApp.tsx`, `apps/web/src/components/MonthEnd.tsx` | WS4 | the chip; the TV strip's chip and TvDeals route; the month end's broken cards | C19, C20 |
| `apps/web/src/table/TvDeals.tsx` (new) | WS7 (PM to confirm, as TvElection.tsx) | the break banner | C20 |
| `apps/web/e2e/politics.ts` | WS7 | S3-UBER-AC-1's step and UBER-AC-3 legs A and C | ACs |
| `docs/rulebook/colony-and-politics.html` (#reputation-deals) | WS7 | the chapter, "Designed, not in the game yet" until built | — |
| `design/mocks/ws6-ux/**` | WS6 | P1-P5 and the ballot line | C17-C21 |

### Hand decisions and the values they need

Every decision is keyless code that reads only `obs = observe(state, me)` (frozen HC-4 rule); a Smart seat plays the
same code until WS2's port (DealPort) carries Claude's recorded choice. A card the hand is only considering (an offer)
is passed as a draft `DealCard` (`id: 'draft'`, `status: 'offered'`, `until` from diplomacy.ts's dealUntil).

| Hand · method | When it runs | Inputs (all from obs) | Output | WS1 value(s) it calls |
|---|---|---|---|---|
| DealHand · `answer(obs, card)` | a card offered to it: after a pause from `POLITICS.ai.actMs` on the deal stream; at once on `flush` (server before planning ends; sim) | the card, the proposer's reputation | accept / decline (S3-RULE-9 answer rows) | `cardWorth(obs, me, card)`, `trust(obs, me, card.from)` (inside cardWorth or beside it, WS1's choice) |
| DealHand · `offer(state, act)` | once per window: an election's announce, and planning proper (after its own VoteHand's governing step) | its own vote (`ownVote`), the ballots ahead, the pending proposal and `lawImpact`, the others' reputations, its open offers | 0..`offersPerMonth` offerDeal actions (S3-RULE-9 offer rows) | `cardWorth(obs, me, draft)`, and `cardWorth(obs, partner, draft)` as an estimate of the partner's view |
| VoteHand · `keepOrBreak` (in `vote`, `lawVote`) | as it casts a ballot it holds an active vote card on | the card, its own choice by today's rule | keep (vote as promised) / break (vote its own choice) (S3-RULE-10) | `breakGain(obs, me, card)`, `reputationCost(obs, me, POLITICS.reputation.moves.voteBroken)` |
| S4's SabotageHand · pact check (slice 4 owns the hand) | before ordering sabotage against a pact partner | `pactBetween(obs, me, target)` | order / hold | `breakGain(obs, me, pact)` (the sabotage's gain), `reputationCost(obs, me, moves.pactBroken)` × S4's `captureOdds` |

WS1's signatures (`packages/ai/src/value.ts`, ADDED, pure, credits unless stated): **proposed; WS1 owns the final shape**
(parameter lists, e.g. whether `mind` is passed). What each MUST account for is the binding part:

```ts
import type { DealCard, GameState } from '@mule/engine';

/** What `card` is worth to `me` if it binds, over its life (`card.until`). From obs only.
 *  MUST account for: a pact — the sabotage the other party would not do to me, less the sabotage I give up against
 *  them (slice 4's expected damage and the persona's spite; 0 while sabotagePossible(obs) is false or me's level has
 *  sabotage off); a vote card where me = from — the cost of voting as promised against my own choice (law ballots:
 *  politics.ts::lawImpact × months left; elections: the candidate's tax promise against the persona's target, and
 *  office pay × the term + POLITICS.termScore when the choice is between me and another), plus the kept reputation
 *  (−reputationCost(obs, me, moves.kept)); a vote card where me = to — the promised vote's value to me times the
 *  chance one vote of `from`'s weight decides the ballot, scaled by trust(obs, me, from). */
export function cardWorth(obs: GameState, me: string, card: DealCard): number;

/** 0..1: the chance `proposer` keeps a card, as `me` judges it. From public facts only: the proposer's reputation and
 *  their public broken cards this game; `me`'s own kept and broken cards with them (obs shows those to me).
 *  MUST be monotonic in reputation. */
export function trust(obs: GameState, me: string, proposer: string): number;

/** What a reputation change of `delta` points (negative = a loss) costs `me` over the game left: positive for a loss,
 *  negative for a gain. MUST account for crossing POLITICS.weight.repHigh/repLow (one vote × the ballots left: the
 *  elections after now and one law ballot a month, floored by POLITICS.weight.minVotes), AI seats refusing below
 *  POLITICS.ai.deals.refuseBelow (the cards it would lose), and the months left (0 in the last month). */
export function reputationCost(obs: GameState, me: string, delta: number): number;

/** What `me` gains by breaking `card` now rather than keeping it, before any reputation cost: for a vote card, the
 *  value of me's own choice minus the promised one, with me's weight as the swing; for a pact, slice 4's sabotage gain
 *  against the partner. */
export function breakGain(obs: GameState, me: string, card: DealCard): number;
```

## §2 · The Logic `[handoff]`

```
S3-RULE-1 · A card's life                                              shape: state machine (FROZEN status union)

  from      event                                                      to                         settled
  offered   the receiver accepts (S3-RULE-2)                           active                     null
  offered   the receiver declines                                      declined                   month
  offered   the proposer withdraws                                     withdrawn                  month
  offered   planning ends (closePlanningDeals), or its ballot closed   expired                    month
  active    pact: the upkeep of `until` passes unbroken                kept                       month
  active    pact: pactBreach (S3-RULE-5)                               broken, brokenBy = breaker month
  active    vote: its ballot's result takes effect (S3-RULE-4)         kept | broken | expired    month
  active    vote: planning of `until` closes with no ballot settling it expired                   month
  kept      pact: a later pactBreach for a month it bound              broken, brokenBy = breaker month (updated)
ids        'deal-<tag>': tag = 6 base-36 characters drawn from createRng over a hash of (state.seed, n, 'deal'),
           n = politics.deals.length + 1 (a collision with an existing id redraws with n's next salt). The same game
           replays the same ids; a seat can't recover n, because observe() hides the seed, so an id says nothing about
           how many cards other pairs hold (AM-2, WS1's #669 question 4).
until      pact: min(maxMonths, month + months − 1) · vote for an office: that office's next ballot month (this month
           while its election is in announce or ballot, else nextElectionMonth) · law: this month while a law ballot is
           open, else month + 1 (the pending proposal's ballot). Fixed at offer.
unknown    an id that is not on the list, or names a settled card → "That card is no longer open".
examples   Lena offers, Brix accepts in month 3 a 3-month pact → active, until 5 · Brix never answers, Ready → expired
```

```
S3-RULE-2 · Offer, accept, decline, withdraw                            shape: decision table

inputs  politics on/off · phase (planning | other) · from, to ∈ players · open offers by `from` (0..maxOpenOffers)
        · an offered card from → to (yes | no) · terms ∈ {pact, vote for a candidate, vote on the next law ballot}
        · months ∈ POLITICS.deals.pactMonths? · an offered or active pact between them (yes | no)
        · vote for a candidate: office ∈ POLITICS.offices?, candidate declared for it?, candidate = from?, a ballot ahead?
        · vote on a law: a law ballot open now or a proposal pending (yes | no)
        · from's own active or offered vote card on the same ballot (none | same choice | other choice)

offerDeal(from, to, terms, months?) — first match wins
  #   when                                                          then
  1   politics off                                                  refuse "This game plays without deals"
  2   phase ≠ planning                                              refuse "Cards are offered in planning"
  3   to = from, or to is not a player                              refuse "Pick another player"
  4   open offers by from ≥ POLITICS.deals.maxOpenOffers            refuse "You have N cards waiting for an answer"
  5   an offered card from → to exists                              refuse "<To> has not answered your last card"
  6   pact, months ∉ pactMonths                                     refuse "A pact runs 1, 3 or 6 months" (from config)
  7   pact, an offered or active pact between them                  refuse "You already have a pact with <To>"
  8   vote for a candidate, office ∉ POLITICS.offices               refuse "The Sheriff is not elected yet"
  9   vote for a candidate, no ballot ahead (this month's closed    refuse "No election is left this game"
      or none, and nextElectionMonth null)
  10  vote for a candidate, candidate = from                        refuse "Promise your vote to someone else"
  11  vote for a candidate, not declared for that office            refuse "<Name> is not running for <Office>"
  12  vote on a law, no ballot open and no proposal pending         refuse "No law is up for a vote"
  13  from holds an active or offered vote card on the same ballot  refuse "You already promised your vote on this ballot"
      with another choice
  14  otherwise                                                     offered; until per S3-RULE-1

answerDeal(to, id, accept) — first match wins
  1   politics off, or phase ≠ planning                             refuse "Cards are answered in planning"
  2   no offered card with this id to this player                   refuse "That card is no longer open"
  3   accept = false                                                declined
  4   vote card whose ballot has closed since the offer             expired (no error: both phones show "expired:
                                                                    the ballot closed")
  5   pact, an active pact between them now                         refuse "You already have a pact with <From>"
  6   otherwise                                                     active

withdrawDeal(from, id): the proposer's own offered card → withdrawn; else refuse "That card is no longer open".

candidates  read from election.candidates in the ballot stage, else politics.candidates.
privacy     row 13 checks only the acting player's own cards: no refusal ever tells a player about a card between two
            others (S3-HC-2). The receiver of a vote card takes on no promise.
invariant   no row moves money, stock, tiles or MULEs (S3-HC-1).
examples    Lena offers Brix a 3-month pact → offered · a 2-month pact → row 6 · Lena's fourth open offer → row 4 ·
            a vote for Kai who has not declared → row 11 · Brix accepts after the ballot closed → answer row 4, expired
```

```
S3-RULE-3 · Reputation from cards                                       shape: decision table

the only writer  politics.ts::reputationShift (clamped to POLITICS.reputation min..max, whole points)
  event                                                        who            delta (POLITICS.reputation.moves)
  a vote card kept (S3-RULE-4)                                 from           kept (+3)
  a pact kept (S3-RULE-5), only where sabotagePossible         from and to    kept (+3) each
  a vote card broken (S3-RULE-4)                               from           voteBroken (−10)
  a pact broken (S3-RULE-5)                                    brokenBy       pactBroken (−20)
  the victim of a broken pact, where sabotagePossible          the other      kept (+3)
  slice 4's caught (S4 adds the amount and the call)           S4's           S4's
limit    a player gains `kept` from cards with the same other party at most POLITICS.reputation.keptPerPartnerPerTerm (1)
         times per term: counted over the cards with that pair settled kept since politics.termStart, in list order;
         a later kept card still settles kept, with no gain.
timing   vote cards when the ballot's result takes effect (S3-HC-6); pacts at upkeep or at the breach.
unknown  politics off → nothing.
examples Lena 50 keeps a vote card → 53 · keeps a second card with Brix in the same term → still 53 · breaks a pact at 15 → 0
```

```
S3-RULE-4 · A vote card at its ballot                                   shape: decision table

evaluated_at  election cards: politics.ts::takeOffice (the ceremony's end; closeElection's early close too) · law cards:
              politics.ts::takeEffect (the reveal's end; closeVotes too) · closePlanningDeals expires the rest
inputs   the card's ballot (an office's election in month `until` | the first law ballot held in offered..until)
         · that ballot held (yes | no) · the candidate on it (yes | no) · from's ballot at close (the promised choice |
         another | none)
election — first match wins
  #   when                                                          then
  1   no ballot was held for the office this month (uncontested,    expired
      appointed)
  2   the promised candidate is not on the ballot (withdrew, moved) expired
  3   from's ballot names the promised candidate                    kept
  4   otherwise (another candidate, or no ballot cast)              broken, brokenBy = from
law
  1   from's ballot = the promised yes/no                           kept
  2   otherwise (the other way, or no ballot cast)                  broken, brokenBy = from
  the card binds whatever proposal that ballot carries (frozen: "the next law ballot"); a receiver accepts knowing
  the proposal pending at the time, which may be replaced before the ballot.
sweep    closePlanningDeals: every active vote card with until ≤ this month still active → expired.
unknown  "no ballot cast" includes a phone that dropped and a host's Continue: the promise was to vote, and the phone
         showed it (S3-C21). A Governor's law ballot starts yes (slice 2a): it counts as cast.
examples Lena promised to vote Brix, votes Brix → kept, +3 · votes Kai → broken, −10, public · Brix withdrew before the
         ballot → expired · the pending proposal's proposer lost the election, no law ballot next month → expired
```

```
S3-RULE-5 · Pacts: run, end, breach                                     shape: decision table

a pact     mutual: neither party sabotages the other in offered..until (inclusive) once active.
end        monthEndDeals at the upkeep of `until`: active → kept; reputation per S3-RULE-3 only if sabotagePossible
           (a pact nobody could break earns nothing: no farming before slice 4, nor in a game with sabotage off).
breach     pactBreach(state, saboteur, victim, m), called by slice 4 when an order's culprit becomes public — first match wins
  #   when                                                          then
  1   politics off, or no pact (active or kept) between them whose  false, nothing changes
      months bound m
  2   that pact is already broken                                   false (once per card)
  3   otherwise                                                     broken, brokenBy = saboteur, settled = this month
                                                                    (also when it had ended kept: an earlier gain stays);
                                                                    moves per S3-RULE-3; true
game over  monthEndDeals(state, true): active pacts settle kept as at their end.
examples   pact 3-5, Lena caught in month 4 → broken, −20 · caught for month 6's sabotage → row 1 · an investigation in
           month 8 reveals month 4's sabotage → row 3, the kept pact turns broken
```

```
S3-RULE-6 · WITHDRAWN (AM-1): the tax promise and reputation. A later option (non-goals).
```

```
S3-RULE-7 · Who sees what                                               shape: decision table

the one rule   partyTo(viewerId, card) = viewerId ∈ {card.from, card.to} or card.status = 'broken' (frozen). observe(),
               every view, the news, the notices and WS2's readings apply it; nothing else decides.
  item                                                   the two parties   other phones   TV    other AI seats (observe)
  an offered, active, declined, withdrawn, expired or    yes               no             no    no
  kept card
  a broken card (who promised what to whom, brokenBy)    yes               yes            yes   yes
  what a breaker voted instead                           no one (secret ballot)
  reputation number                                      yes               yes            yes   yes
  reputation reasons (broken cards, unrest events)       yes               yes            yes   yes
  open-offer counts, "waiting for an answer"             the proposer      no             no    no
  another seat's law ballot (WS1's separate fix, first)  —                 no             no    no
accepted  a kept card's gain shows as the number rising, no reason given; the table may infer that a card existed, not
          with whom (as AM-8's accepted inference). A broken vote card tells the table the breaker did not vote as
          promised.
leak points  news: only broken cards (dealNews) · notices: parties on every event but broken (S3-C12) · WS2's brain:
             reads only through observe and party-filtered notices · MonthReport: no deal field (nothing to leak) ·
             the record: stores the intents and the parties-marked notices; replay is server-side.
```

```
S3-RULE-8 · Vote weight (MODIFIES the parent's RULE-4)                  shape: formula

votes = max(POLITICS.weight.minVotes, 1 + land + reputation part + Baron + taxes)       minVotes = 1
parts  unchanged and still reported one by one (the −1 shows on the panel).
answers  RULE-4's "whether votes may fall to 0": no; the reputation part bites a player with 2+ votes.
example  reputation 20, no land, no taxes → 1 vote (parts: base 1, reputation −1) · with 10 plots → 1 + 1 − 1 = 1
```

```
S3-RULE-9 · DealHand (every AI seat, keyless, on observe(state, me))    shape: decision table

stream   createRng from the seat's salt XOR a deal salt and the month (VoteHand.council's pattern; S3-HC-3).
answer — per card offered to it, first match wins (a DealPort answer, when present, replaces rows 2-4)
  #   when                                                          then
  1   the proposer's reputation < POLITICS.ai.deals.refuseBelow     decline
  2   Rookie                                                        accept if stream.chance(POLITICS.ai.deals.rookieAccept)
  3   cardWorth(obs, me, card) ≥ POLITICS.ai.deals.acceptMin[persona]   accept
  4   otherwise                                                     decline
offer — once per window (an election's announce; planning proper). Each candidate draft needs cardWorth(obs, me, draft)
        > 0, cardWorth(obs, partner, draft) ≥ 0, the partner's reputation ≥ refuseBelow, and no card of the same terms
        declined by that partner this month:
  a   an election ahead for an office it does not run for, and ownVote names a candidate C: its vote for C, to C
  b   a law up for a vote and ownVote gives yes/no: its vote, to the proposer if yes, else to the player whose
      lawImpact cost is highest (not itself)
  c   sabotagePossible: a pact of the middle pactMonths to the player with the highest cardWorth(obs, me, draft)
  sends the best by cardWorth(obs, me, draft), at most POLITICS.ai.deals.offersPerMonth a month, within maxOpenOffers.
never    withdraws (offers expire); never offers outside planning; never asks for a vote (a card is its own promise).
```

```
S3-RULE-10 · VoteHand keeps or breaks a promise                          shape: decision table

at each ballot it casts (election vote(), law lawVote()), with own = today's rule's choice
  #   when                                                          then
  1   no active vote card of its own on this ballot                 vote own (today's behaviour)
  2   own = the promised choice                                     keep
  3   Rookie                                                        keep
  4   breakGain(obs, me, card) >                                    break: vote own
      POLITICS.ai.deals.honesty[persona] × reputationCost(obs, me, POLITICS.reputation.moves.voteBroken)
  5   otherwise                                                     keep: vote the promised choice
no draw  deterministic: the election and council streams never move (slice 2a HC-41).
```

```
S3-RULE-11 · Notices and news                                           shape: sequence

after each intent, AI action, election/council tick and phase change, the server compares the politics.deals it saw last
with the current list (dealNotices): a new card → deal·offered; each status change → deal·<new status>. Every event
but 'broken' carries parties = [from, to]; 'broken' carries none (public). Each card that turns broken adds one news line
(dealNews):
  vote for a candidate  "<Breaker> broke a promise to <To>: a vote for <Candidate>. Reputation −10."
  vote on a law         "<Breaker> broke a promise to <To>: a <yes|no> on the law. Reputation −10."
  pact                  "<Breaker> broke a pact with <Other>. Reputation −20."
order    the engine settles; the view and the news follow in the same tick, so the TV banner and the chip move together.
```

## §3 · Contracts & Data Models `[handoff]`

All ADDED unless marked; none breaking (new fields are optional or empty, new union members only). **The contract
commit (WS3, first) carries all of it**; engine, server, AI and screens then build against it in parallel.

| Contract | change_kind | Breaking | Change |
|---|---|---|---|
| FROZEN `DealTerms`, `DealCard`, `Politics.deals` | ADDED | no (empty list; politics null when off) | S3-C1 |
| `DealOffer` (an intent's payload) | ADDED | no | S3-C2 |
| `MuleIntent` += offerDeal, withdrawDeal, answerDeal | ADDED | no | S3-C10 |
| `PlayerView.reputation`, `PoliticsView.brokenDeals?`, `PoliticsView.reputationReasons?`, `MyView.deals?`, `MyPoliticsView.promised?` | ADDED | no | S3-C10 |
| `NoticeEntry` += deal | MODIFIED | no (a new member; consumers that switch on kind skip unknown ones) | S3-C12 |
| `AiAction` += the three (WS1's actions.ts) | ADDED | no | S3-C16 |
| config `POLITICS.deals`, `.reputation.moves`, `.reputation.keptPerPartnerPerTerm`, `.weight.minVotes`, `.ai.deals` | ADDED | no | all |

```ts
// packages/engine/src/types.ts (WS3 named edit) — FROZEN by WS7, 7 Nov: word for word, no field added or renamed
export type DealTerms =
  | { kind: 'pact' }                                          // mutual: neither party sabotages the other while it binds
  | { kind: 'vote'; office: Office; candidate: string }       // `from` votes for `candidate` in the next election for `office`
  | { kind: 'vote'; law: true; yes: boolean };                // `from` votes yes or no on the next law ballot
export interface DealCard {
  id: string;               // 'deal-<tag>', opaque, seeded from the card's number (deterministic, replayable)
  from: string;             // proposer
  to: string;               // receiver
  terms: DealTerms;
  offered: number;          // month offered
  until: number;            // last month it binds, inclusive
  status: 'offered' | 'active' | 'declined' | 'withdrawn' | 'expired' | 'kept' | 'broken';
  brokenBy: string | null;
  settled: number | null;   // month it was kept, broken, declined, withdrawn or expired
}
// Politics gains: deals: DealCard[] — every card of the game, settled ones included. The counter is deals.length.

// ADDED beside them (not part of the frozen set; the offer's payload, so a pact's length can travel):
/** An offer as a phone or a hand sends it: the terms, and for a pact its months (one of POLITICS.deals.pactMonths). */
export interface DealOffer { to: string; terms: DealTerms; months?: number }
```

```ts
// packages/engine/src/diplomacy.ts (WS7, new) — exported API; each throws RuleError per S3-RULE-2
offerDeal(state, from: string, offer: DealOffer): string                  // the new card's id
withdrawDeal(state, from: string, id: string): void
answerDeal(state, to: string, id: string, accept: boolean): void
dealUntil(state, from: string, offer: DealOffer): number                  // offerDeal's `until`, no write (hands, drafts)
dealsOf(state, playerId: string): readonly DealCard[]                     // the player's cards, newest first
partyTo(viewerId: string, card: DealCard): boolean                        // the one visibility rule (S3-RULE-7)
promisedVotes(state, playerId: string): { election: Partial<Record<Office, { candidate: string; to: string[] }>>; law: { yes: boolean; to: string[] } | null }
settleVotes(state, ballot: 'election' | 'law'): void                      // politics.ts calls it
closePlanningDeals(state): void                                           // game.ts, after closeVotes
monthEndDeals(state, gameOver: boolean): void                             // game.ts, upkeep
pactBreach(state, saboteurId: string, victimId: string, sabotageMonth: number): boolean   // slice 4 calls it
pactBetween(state, a: string, b: string, month?: number): DealCard | null
sabotagePossible(state): boolean                                          // false until slice 4
reputationReasons(state, playerId: string): ({ kind: 'broken'; card: DealCard } | { kind: 'unrest'; month: number } | { kind: 'caught'; month: number })[]   // 'caught': slice 4
```

```ts
// packages/protocol/src/index.ts (WS3 named edit)
MuleIntent +=
  /** Planning: offer another player a deal card: a pact (with its months) or your own vote promise. */
  | { type: 'offerDeal'; offer: DealOffer }
  /** Planning: take back a card not yet answered. */
  | { type: 'withdrawDeal'; id: string }
  /** Planning: accept or decline a card offered to you. */
  | { type: 'answerDeal'; id: string; accept: boolean }

PlayerView +=
  /** 0..100, public on every screen, the TV's too (S3-RULE-7). */
  reputation: number;

PoliticsView +=
  /** Every broken card of the game, newest first: public (partyTo). Optional only for older fixtures. */
  brokenDeals?: DealCard[];
  /** Per player, the public reasons their reputation moved (reputationReasons), for the chip's tap. Optional only for older fixtures. */
  reputationReasons?: Record<string, ({ kind: 'broken'; id: string } | { kind: 'unrest'; month: number } | { kind: 'caught'; month: number })[]>;   // 'caught': slice 4

MyView +=
  /** This player's own cards; null with politics off. Optional only for older fixtures: the server always sends it. */
  deals?: MyDealsView | null;
export interface MyDealsView {
  /** Every card this player is a party to, newest first (partyTo). Never a card between two others unless broken. */
  cards: DealCard[];
  /** Offers this player may still make now: POLITICS.deals.maxOpenOffers minus their open ones. */
  offersLeft: number;
  /** The lengths a pact may run (POLITICS.deals.pactMonths). */
  pactMonths: number[];
}

MyPoliticsView +=
  /** This player's promised votes (promisedVotes), for the ballot's "You promised". Optional only for older fixtures. */
  promised?: { election: Partial<Record<Office, { candidate: string; to: string[] }>>; law: { yes: boolean; to: string[] } | null };
```

```ts
// packages/engine/src/record.ts (WS3 named edit) — NoticeEntry += (a notice with `parties` is private to them)
| { kind: 'deal'; event: DealCard['status']; deal: DealCard; parties?: [PlayerId, PlayerId] }   // parties absent only on 'broken'
```

```ts
// packages/engine/src/config.ts POLITICS (WS7) — placeholders until WS1's sim rows; tuned at the end (G-5 HC-25)
weight: { …, /** The fewest votes a player can have, whatever their reputation. */ minVotes: 1 },
reputation: {
  min: 0, max: 100,
  /** Points a card moves a player's reputation (signed). Slice 4 adds caught. */
  moves: { kept: 3, voteBroken: -10, pactBroken: -20 },
  /** Kept gains a player can earn from cards with one other party in one term. */
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
- *Card intent a Claude seat issues:* the same `offerDeal` / `answerDeal` / `withdrawDeal` intents (as AiActions through
  the server's `aiAct`, the checks a phone gets). WS2 C10's `PlanningPlay.offers?` takes `DealOffer[]` (a playbook.ts
  change: WS1, WS2, WS3 OK, playbook v1 rule).
- *DealPort* (packages/ai/src/hands/deal.ts): `interface DealPort { answerFor(card: DealCard): boolean | null;
  offersFor(month: number): DealOffer[] | null }`; null → the keyless rule. WS2 supplies it from Claude's recorded
  reasoning (HC-B3: recorded or keyless only).
- *Notices WS2's memory reads:* `deal` events; it MUST skip one whose `parties` excludes the seat (HC-B5); 'broken' is
  public.
- *Brief fields (WS2's social section), all through observe:* per other player their reputation and public reasons;
  the seat's own cards with them (stage, terms, until, outcome); `trust(obs, me, id)` (WS1); the seat's own promised
  votes (promisedVotes). Never another pair's card unless broken.
- *HC-B1's catch:* an AI bluffs about its intentions; a broken card is what the table sees (S3-RULE-11).

**Worked example** (month 3 planning). Lena offers `{ to: 'brix', terms: { kind: 'vote', office: 'governor', candidate:
'brix' } }`; Brix accepts. Brix's `me.deals.cards[0] = { id: 'deal-q7k2m9', from: 'lena', to: 'brix', terms: { kind: 'vote',
office: 'governor', candidate: 'brix' }, offered: 3, until: 4, status: 'active', brokenBy: null, settled: null }`; Ossa's
view and observe have no `deal-q7k2m9`; every view has Lena's `reputation: 50`. In month 4 Lena votes Kai; at the ceremony's
end every view has Lena's `reputation: 40`, `politics.brokenDeals[0]` is deal-q7k2m9 with `status: 'broken', brokenBy:
'lena', settled: 4`, and the news reads "Lena broke a promise to Brix: a vote for Brix. Reputation −10."

## §4 · Failure & Ops `[handoff]`

| Question | Answer |
|---|---|
| Dependency unavailable? | None external: cards, reputation and the AI are in-process and seeded. A Smart seat with no key plays DealHand's keyless rule (S3-C13). |
| Retry / poison? | A refused intent throws RuleError and reaches the player (S3-HC-7); nothing retries. An AI's refused card is not re-sent (the hand moves on, as `Act` returns false). |
| Idempotency | answer and withdraw act once (a second call finds the card settled and refuses); a repeated offer to the same player is refused (S3-RULE-2 row 5). A card leaves `active` once (a kept pact may later turn broken, once). |
| Races | Intents, ticks and phase changes run on the server's one loop. An answer that arrives after planning ended finds the card expired. The flush before Ready ends planning answers every AI's open offer first (S3-C11). |
| What still works when deals break? | The host switches politics off (S3-HC-4). With politics on and a deals fault, elections and laws still run: settleVotes is the only call politics.ts makes into diplomacy.ts. |
| How to know it works, and is used | The sim's deals row (S3-C16); the news line at each break; the record's deal notices. |

## §5 · Delivery `[handoff]`

Code-only; no existing state to reach: games live in server memory and the sim is fresh per run. A recorded game from
before this slice replays with `deals: []` (no recorded intent names a card). Rollback is a revert; politics off removes
the feature at the table.

## §6 · Acceptance Criteria `[handoff]`

| AC | Given / When / Then | Changes | observed_at | negative case |
|---|---|---|---|---|
| S3-B-AC-1 (UBER-AC-3 leg A) | Given month 2 planning, two phones and AI seats · When Lena whispers Brix, attaches a 3-month pact and Brix taps Accept · Then both phones list the pact as active until month 4, and neither Ossa's phone nor the TV receives any card | C2 C10 C11 C17 C18 | both phones' DOM (e2e); Ossa's and the TV's view JSON (server test) | Brix taps Decline → both phones show it declined; nothing active |
| S3-B-AC-2 (S3-UBER-AC-1) | Given Brix runs for Governor and Lena's accepted card promises her vote for Brix · When Lena votes for another candidate and the ceremony ends · Then every screen shows Lena's reputation 10 lower, the TV banner and the news say she broke her promise to Brix, and during the ceremony no screen had changed | C3 C11 C20 C21 | both phones and the TV (e2e); the views during and after the ceremony (server test) | Lena votes Brix → +3, no banner, no news line, no public card |
| S3-B-AC-3 (UBER-AC-3 leg C) | Given an AI seat is offered a card by a phone, no API key set · When every human presses Ready at once · Then the AI's answer reaches the proposer's phone before planning ends | C11 C13 | the proposer's view before the phase changes (server test); e2e step | a proposer below 30 reputation → declined (S3-RULE-9 row 1) |
| S3-B-AC-4 (UBER-AC-3 leg B; waits for slice 4) | Given Lena and Brix hold a pact · When slice 4 catches Lena sabotaging Brix · Then her reputation falls by 20 on every screen and the line names the broken pact | C4 C11 C20 | phones and TV (S4's e2e) | caught for a month outside the pact → no change |
| S3-B-AC-5 | WITHDRAWN (AM-1): the tax promise's reputation | — | — | — |
| S3-B-AC-6 | Given any planning screen · When reputation changes · Then a chip beside every player's name shows the new number on phone standings, hub names and the TV strip, and its tap lists the public reasons | C10 C19 | phone and TV DOM (e2e) | a kept card is never among the reasons |
| S3-B-AC-7 (S3-UBER-AC-2) | Given `pnpm sim` on the three seed sets, politics on · Then S3-UBER-AC-2's thresholds hold and politics-off output is byte-identical | C13-C16 | the sim report | — |
| S3-T-AC-1 (serves B-AC-1) | every S3-RULE-2 row's verdict and words, for offer, answer, withdraw; every call leaves money, stock, tiles, MULEs unchanged (S3-HC-1); ids are opaque `deal-<tag>`, unique, and the same on a replay | C2 | engine test | row 13 never fires on a third party's card |
| S3-T-AC-2 (serves B-AC-2) | every S3-RULE-4 row, election and law; the sweep expires stale cards; S3-RULE-1's until for each terms kind | C3 C8 | engine test | — |
| S3-T-AC-3 (serves B-AC-2) | the move applies at takeOffice/takeEffect, not at ballot close; the tally's weights are taken at close before any move | C3 | engine test; server views during the ceremony | — |
| S3-T-AC-4 (serves B-AC-2, B-AC-6) | S3-RULE-3: deltas, the kept limit per partner per term, clamping at 0 and 100; reputationReasons lists broken cards and unrest only | C5 | engine test | the unrest event still moves −1 with its change line |
| S3-T-AC-5 (serves B-AC-1) | S3-RULE-7: partyTo decides; a third phone's and the TV's views, a third seat's observe() and the news hold no unbroken card of others; observe() hides others' council ballots | C9 C11 | view JSON (server test); observe (engine test) | the parties' own views hold the card; a broken card is in every view |
| S3-T-AC-6 (serves B-AC-7) | politics off: no deals, the three intents refused, sim output byte-identical | C1 C8 | engine test; WS1's sim row 0 | — |
| S3-T-AC-7 (serves B-AC-2) | voteWeight floors at 1: reputation 20, no land, no taxes → 1 | C7 | engine test | reputation 20 and 10 plots → 1 (1+1−1) |
| S3-T-AC-8 (serves B-AC-3) | DealHand's S3-RULE-9 rows, deciding on observe(state, me); its draws leave the election and council fixtures unchanged | C13 | ai test on a seeded game | Rookie answers, never refused |
| S3-T-AC-9 (serves B-AC-7) | VoteHand's S3-RULE-10 rows; no draw | C14 | ai test | no promise → today's vote |
| S3-T-AC-10 (serves B-AC-3) | the server flushes DealHands before planning ends by Ready and by Continue; a muted AI's offer is refused once mute exists | C11 | server test | — |
| S3-T-AC-11 (serves B-AC-1) | each status change emits exactly one deal notice; every event but 'broken' carries parties | C12 | the record (server test) | — |
| S3-T-AC-12 (serves all) | a recorded game with cards replays to the same state hash | C1-C3 | WS3's replay test | — |
| S3-T-AC-13 | WITHDRAWN (AM-1) | — | — | — |
| S3-T-AC-14 (serves B-AC-4) | S3-RULE-5: end kept with and without sabotagePossible (no gain without); breach rows 1-3, once per card, kept → broken | C4 | engine test (calls pactBreach directly) | breach for a month outside the pact → false |
| S3-T-AC-15 (serves B-AC-4, UBER-AC-3 leg B's engine half) | pactBreach in month 4 of a 3-5 pact → broken, brokenBy = the saboteur, −20, the victim +3 where sabotagePossible, true | C4 | engine test | — |

Invariants for every test: no card moves money, goods, plots or MULEs; reputation stays in 0..100; a view, observe() or
news line for a seat that is not a party never holds an unbroken card; `politics.deals` never shrinks.

## §7 · Risks & Spikes `[review-only]`

- **Slice 4 slips past RC: pacts never break.** Mitigation: pacts still work as signed promises, and earn no kept
  reputation without sabotage (S3-RULE-5), so nothing is farmed; vote cards carry G-4's e2e alone (S3-UBER-AC-1).
- **Reputation farming between friends** (vote promises they would keep anyway). Mitigation: the kept limit per partner
  per term (S3-RULE-3); WS1's row reports the reputation spread; one config value tightens it.
- **AI seats never offer, so S3-UBER-AC-2 fails.** Mitigation: offer rows a and b need no sabotage (a voter promises the
  vote it would cast anyway, for the kept gain); WS1 tunes `POLITICS.ai.deals` in its PR, the sim row is the gate.
- **A law card binds "the next law ballot", whatever proposal it carries** (frozen terms). Mitigation: the composer and
  the card show the proposal pending at offer; a replaced proposal is a risk the receiver accepted. If playtests show
  surprise, a later contract change can pin the proposal.
- **The TV and the chips leak a ballot result early.** Mitigation: moves apply at take-effect (S3-HC-6, S3-T-AC-3).
- **A third party learns of a card through a refusal or the voted list.** Mitigation: refusals check only the actor's
  own cards (S3-RULE-2 privacy); no preset ballots (§0.1).
- **Landmine (WS1, FM-WS3-4):** a what-if copy sharing state. Mitigation: deals live in Politics, written only through
  its copy-on-write edit (S3-C1), and cloneForSim already copies politics whole.
- **Landmine (slice 2a AM-4):** an AI stream seeded from `state.seed`. Mitigation: the deal stream hashes the seat's salt
  (S3-HC-3), as INV-41; observe() zeroes the seed anyway.
- **WS6 is the RC bottleneck.** Mitigation: engine, server and AI PRs need no screen; the screens are five small places
  in existing desks, and the mock already sketches P1/P2.
No spike needed.

## Sizing `[review-only]`

| PR | Owner | Days | Runs after |
|---|---|---|---|
| 0 · contract commit: frozen types, DealOffer, intents, views, notice, config keys (values as above) | WS3 (+ WS7 config) | 0.5 | Heiko's ruling |
| 1 · engine: diplomacy.ts, politics.ts hooks and voteWeight floor | WS7 | 1.5 | PR-0 |
| 2 · engine named edits: game.ts calls, observe.ts filter | WS3, WS1 | 0.5 | PR-0 (stub diplomacy.ts) |
| 3 · server: intents, DealHand tick and flush, notices, news; politics-view.ts views | WS3 + WS7 | 1.5 | PR-0 |
| 4 · AI: deal.ts, vote.ts keepOrBreak and ownVote | WS7 | 1 | PR-0 (WS1 values stubbed) |
| 5 · values + sim: value.ts four functions, actions/play/sim, deals row | WS1 | 1.5 | PR-0 |
| 6 · mocks P1-P5 + ballot line | WS6 | 1.5 | Heiko's ruling (parallel to PR-0) |
| 7 · phone: Deals.tsx (P1-P3), Who chip, ballots (C21); Chat/desks/today named edits | WS7 path, PM's build lane | 2 | PR-0, PR-6 |
| 8 · TV and month end: TvDeals, TableApp strip chip, MonthEnd, Standings | WS4 (+ WS7 file) | 1 | PR-0, PR-6 |
| 9 · e2e (S3-UBER-AC-1, UBER-AC-3 A and C) + rulebook | WS7 | 0.5 | PR-1, 3, 7, 8 |

About 11.5 lane-days in all, WS6's mocks 1.5 of them; after PR-0, PRs 1-6 run in parallel; the critical path is PR-0 →
PR-6 → PR-7 → PR-9, about 4.5 days, so a 9 Nov ruling lands it 13-14 Nov.

## §8 · Amendments `[review-only]`

```
AM-1 · 2026-11-07 · WS7 (frozen contract types for slices 3-5, binding) · before the merge into the amendment set

target    §0 non-goals, D-S3-1, §0.1; §1 C1, C2, C5, C6, C9-C16; §2 S3-RULE-1..7, 9-11; §3; §6; §9
said      a card of up to three terms (a pact, a vote term by either party), in a new GameState.diplomacy with a public
          reputation log; reputation for the tax promise; WS1's six values with a Mind parameter
did       WS7 froze DealTerms and DealCard (one term per card: a pact, or the proposer's own vote for a candidate or on
          the next law ballot; the statuses offered, active, declined, withdrawn, expired, kept, broken) in
          Politics.deals, every card kept; broken cards public; the hands read observe(state, me) only, with one server
          helper partyTo; the tax promise stays as it is (C6, RULE-6, B-AC-5, T-AC-13 withdrawn); borrowed votes a later
          option; WS1's four values cardWorth(obs, me, card), trust(obs, me, proposer), reputationCost(obs, me, delta),
          breakGain(obs, me, card). The spec now follows them: no reputation log (the chip's public reasons are derived),
          void → expired, the counter is deals.length, diplomacy.ts writes Politics.deals through politics.ts's edit
          (§9), and DealOffer is added beside the frozen types to carry a pact's months.
because   S3-1, S3-2: five lanes build in parallel from one contract
goal      S3-1, S3-2 — still met; swaps and asking for a vote move to later (two cards do a swap)
folded    the sections above; D-S3-2 (what a break reveals) is now implemented by the frozen rule, recorded under the
          decisions for Heiko to overrule if he wants
```

```
AM-2 · 2026-11-07 · WS7 (WS1's #669 question 4, via PM) · opaque card ids

target    §2 the card lifecycle's ids line; §3 DealCard.id's comment; the worked example; S3-T-AC-1
said      'deal-<n>', n = politics.deals.length + 1
did       'deal-<tag>', six base-36 characters from createRng over a hash of (state.seed, n, 'deal'). The counter
          stays inside the engine; the id carries none of it. The type is unchanged (id: string).
because   a sequential id told any seat how many cards other pairs had made, which observe() otherwise hides
          (the frozen HC-4 rule). Humans' views carry the same ids, so this closes it for both
goal      S3-1, S3-2 — still met
```

```
AM-3 · 2026-11-07 · WS7 (plan time: §0.1 re-checked against trunk e1e4794a) · before build

target    §0.1's thin baseline, its second reason
said      "reputation on every screen ... PlayerView lacks today (packages/protocol/src/index.ts::PlayerView)"
did       Now false: the contract (#662) added PlayerView.reputation (optional) and viewFor fills it. The first
          reason stands (S3-2 needs AI seats that offer and break cards; the baseline's never do), so the
          baseline still loses and the plan keeps the chosen design.
because   the self-review checks each rejection reason before planning against it
goal      S3-1, S3-2 — unchanged
```

```
AM-4 · 2026-11-07 · Heiko (board, 12:54Z, via PM): "Approve all six as recommended"

target    the decisions for Heiko
did       D-S3-1 → A (campaign law promises after RC). The recorded reveal rule stands: Heiko did not overrule it, so a broken card is public in full and never shows the vote cast. The build builds the spec as written.
goal      S3-1, S3-2 — unchanged
```

## §9 · Ownership Boundaries `[handoff]`

### Ownership: deal cards (a second writer inside Politics)
- Sole owner:      packages/engine/src/diplomacy.ts for `Politics.deals`; politics.ts stays the sole writer of every
                   other Politics field except slice 4's sabotage, guards and rumoured (sabotage.ts, slice 4 §9).
- Read contract:   `state.politics.deals` through observe(state, me) (hands), partyTo (server views, news, notices).
- Write contract:  only diplomacy.ts writes `politics.deals`, and only through politics.ts's copy-on-write edit (exported
                   as editPolitics for diplomacy.ts alone). politics.ts calls settleVotes; game.ts calls
                   closePlanningDeals and monthEndDeals; slice 4 calls pactBreach.
- Enforcement:     engine tests; the PR checklist greps `\.deals\s*=|deals\.push|editPolitics` outside diplomacy.ts and
                   politics.ts, and `partyTo` as the only visibility test in politics-view.ts.

### Ownership: Player.reputation
- No ownership change: politics.ts::reputationShift remains its only writer; diplomacy.ts and events.ts call it.
