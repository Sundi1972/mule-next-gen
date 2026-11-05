# WS7 politics · the election is not time-bound

Amendment to `docs/specs/2026-10-22-ws7-politics.md` (AM-18) · WS7 · 2026-10-28 · class: Programme
(a contract change across engine, AI, server, protocol and screens; 3 PRs). **Status:** Heiko's ruling,
relayed by the PM on 2026-10-28. The politics spec's §0 holds: this serves P-1. Spec and plan only. The
engine and server come first; the screens wait for Heiko's approval of WS6's mock.

Ids continue after slice 2a (C40-C47, RULE-40..47, T-AC-40..51): changes C60+, rules RULE-60+, ACs
B-AC-60+ / T-AC-60+.

## §0 · Goal `[handoff]`

P-1 (approved): "The table governs itself: it elects a Governor and a Sheriff …". Heiko's ruling on how,
verbatim: "I think we shouldn't make this time bound. a) I should be able to run for office anytime.
Even in no election months; this gives me time for diplomacy and to adjust my promise etc. b) In an
election month we should announce the elections, show who is running for what, and then let everybody
vote. Once everybody has voted we dramatically reveal the results: showing the office, the candidates,
and then we let a bar grow next to them representing the votes. And then we announce the winner with
some dramatic celebration and congratulations etc. Then the next office comes, same ceremony."

- *Today:* the election runs on 20 s clocks to run and to vote, plus 6 s to show the result, inside
  planning (`packages/engine/src/config.ts::POLITICS`: nominateMs, ballotMs, revealMs). WS6's audit (ws6-ux
  `docs/research/2026-10-28-ws6-ux-audit.md` §3) measured about 40 s for a newcomer to run, against a 20 s
  stage; a player who reads the hub misses the whole election and the game appoints a Governor.
  verified_by: read (code), executed (WS6's audit, room JWKB).
- **Proof (restates UBER-AC-2):** a step in the politics e2e. In month 1 both humans run, and nothing
  closes while a phone has not voted. The ballot closes the moment the last phone votes. Every screen
  shows the Governor's ceremony (office, candidates, bars, winner), then the Sheriff's. The new
  Governor then sets the tax, and the next auction sale is taxed at the new rate.

**Non-goals:** the screens before WS6's mock is approved; whether the Sheriff is elected at all (open
with Heiko: the ceremony is generic over the offices that exist); the council's own timing (slice 2a,
see §8 note); smart seats' votes (WS2's brain port, later).

## §0.1 · Decision Record `[review-only]`

**Chosen: decisions are untimed and presentation is clocked.** Running is open in every planning
phase. An election month opens with an announcement, which is also the last call for candidates. The
ballot closes when everyone is Done. The ceremony runs office by office on short presentation clocks.
The host's Continue closes a stage for every player not Done, present or away. About 3 PRs.

**Thin baseline: lengthen the 20 s clocks.** One config change. *Loses because* Heiko ruled "not
time bound" and wants running "anytime, even in no election months"; a longer clock does neither.
Check: the ruling above.

**Alternative ceremony: the host taps "Next" between offices.** *Loses because* the TV is a shared
screen nobody holds, and a ceremony that waits on one person stalls when the host is mid-chat. The
presentation clocks hold no decision, so they do not break the ruling. They are config values Heiko can
lengthen.

**Alternative candidacy: freeze it at planning open in months 4, 7 and 10, with a last call only in
month 1.** *Loses because* month 1 needs the last call anyway (there is no earlier planning). One
behaviour in every election month is simpler, and it leaves room for late diplomacy.

## §0.2 · Constraints `[handoff]`

```
HC-60  No decision has a clock: running, the last call and the ballot end only on Done or the host's
       Continue. Only the ceremony is clocked, from POLITICS.ceremony.   source: Heiko 2026-10-28  breach: fatal
HC-61  Every number in POLITICS (ceremony clocks, AI pacing, the offices list); none in rules, AI or
       server code.                                       source: PM ruling SEAMS 2026-10-28  breach: fatal
HC-62  The ceremony iterates POLITICS.offices, never a hard-coded Governor + Sheriff, so a
       Governor-only table (the open Sheriff decision) needs a config change only.
                                                          source: PM 2026-10-28            breach: fatal
HC-63  politics:false is unchanged; WS1's politics-off rows stay byte-identical.
                                                          source: politics spec            breach: fatal
HC-64  A dropped phone holds the vote, as it holds planning (AM-15); only the host's Continue moves
       past it.                                           source: AM-15                    breach: fatal
HC-65  The tie-break is AM-17's (#135): the Baron's ballot, most plots, a seeded lot.
                                                          source: PM 2026-10-28            breach: fatal
```

## §1 · Solution Design `[handoff]`

```
C60 · MODIFIED · running is open in every month's planning and lasts until the election

today        a player may run only in the election's nominate stage; candidates and promises live in
             the month's Election and vanish with it.
             anchors: packages/engine/src/politics.ts::runFor, ::canRun, packages/engine/src/types.ts::Election,
             ::Politics
             verified_by: read
tomorrow     MUST accept run, switch office, change the Governor promise and withdraw in any planning
             phase (RULE-60). Candidacy MUST live in Politics (candidates per office, promises) and
             persist across months until the ballot opens. Then it is copied into the Election and
             Politics' list starts empty for the next election. Every screen sees it (RULE-64).
logic        → §2 RULE-60 · evaluated at each run intent · writes politics.candidates, .promises
seam         packages/engine/src/politics.ts (sole writer of state.politics)
senior       junior would: keep candidacy in Election and open a "pre-election" each month · senior
             does: one candidacy record in Politics that the election snapshots, so nothing is copied
             back and forth and RULE-2's term limit is checked once, at declaration
mechanism    in_place
call sites   runFor: apps/server/src/mule-game.ts (run intent), packages/ai/src/hands/vote.ts,
             packages/ai/src/play.ts via applyAction. Repo not prism-indexed: grep-built.
pin          RULE-10's promise validation tests (packages/engine/test/politics.test.ts) unchanged
depends_on   none
```

```
C61 · MODIFIED · an election month runs announce → ballot → ceremony → over, with no decision clock

today        nominate (20 s) → ballot (20 s) → reveal (6 s) → over; a stage ends early when every
             player is Done; the server marks away seats Done every tick.
             anchors: packages/engine/src/politics.ts::openPlanning, ::stepElection, ::electionDone,
             ::closeElection, packages/engine/src/config.ts::POLITICS
             verified_by: read
tomorrow     MUST open the election at planning open in an election month in 'announce' (the last
             call: candidacy still open), move to 'ballot' when every player is Done, and close the
             ballot when every player is Done (RULE-61). A player whose ballot covers every contested
             office counts as Done. MUST NOT end a stage on a clock. AM-1's close-at-once on leaving
             planning stays.
logic        → §2 RULE-61 · evaluated at each Done and each step
seam         packages/engine/src/politics.ts
senior       junior would: set the clocks to a large number · senior does: remove the decision
             clocks from the stage machine, so no hidden timeout remains, and keep the step function
             for the ceremony and the AI's pauses
mechanism    in_place
call sites   stepElection/electionDone: apps/server/src/mule-game.ts (tick, ready, aiAct),
             packages/ai/src/play.ts; closeElection: packages/engine/src/game.ts::advancePhase
pin          RULE-3's tally tests (with AM-17) unchanged
depends_on   C60
```

```
C62 · ADDED · the reveal ceremony, one office at a time

today        the reveal shows a 3 s countdown, then every office's result at once, for 6 s.
             anchors: packages/engine/src/politics.ts::stepElection, apps/server/src/politics-view.ts::resultShown
             verified_by: read
tomorrow     MUST fix every office's result when the ballot closes (RULE-3 with AM-17). Then for each
             office in POLITICS.offices, in order, it MUST step intro → bars → winner on
             POLITICS.ceremony's clocks (RULE-62). An office with 0 or 1 candidates skips the bars.
             Winners take office when the last office's winner step ends.
logic        → §2 RULE-62 · stepped by stepElection
seam         politics.ts — the Election gains `ceremony: { office, step, clockMs } | null`
senior       junior would: animate the bars in the client with its own timer · senior does: the
             engine owns the step, so every TV and phone shows the same office at the same moment
             and a reconnecting phone lands in the right step
mechanism    sprout
call sites   the server tick; packages/ai/src/play.ts's planning loop
pin          none, because it replaces the old reveal
depends_on   C61
```

```
C63 · MODIFIED · the AI declares ahead of the election and votes at its own pace

today        VoteHand runs once in nominate and votes once in the ballot, each after a seeded pause
             of POLITICS.ai.actMs.
             anchors: packages/ai/src/hands/vote.ts::VoteHand
             verified_by: read
tomorrow     MUST decide its candidacy once per election cycle, in the planning phase
             POLITICS.ai.declareLeadMonths before the election, or at the last call if it has not
             decided yet (month 1). It MUST refresh a Governor promise at the last call (RULE-10's
             AI row against the tax then). It MUST vote after a seeded pause once the ballot opens,
             then be Done (RULE-63).
logic        → §2 RULE-63
seam         packages/ai/src/hands/vote.ts (WS7). No WS2 file: every AI seat's politics runs
             through VoteHand (apps/server/src/mule-game.ts creates one per AI seat).
senior       junior would: declare every month at random · senior does: one decision per cycle,
             so an AI candidate is stable enough for players to deal with
mechanism    in_place
pin          the slice-1 vote-hand rows (packages/ai/test/vote-hand.test.ts) are restated, not
             dropped; UBER-AC-1 (play-politics.test.ts) still fills both offices by votes
depends_on   C60, C61
```

```
C64 · MODIFIED · the server: Ready is Done, the host closes a stage for every player not Done, and away seats are no longer auto-Done

today        the tick marks away seats Done; Continue is refused while the election is open
             (`apps/server/src/mule-game.ts::MuleGame` continuePlanning). The view hides the result
             until the countdown ends.
             anchors: apps/server/src/mule-game.ts::MuleGame, apps/server/src/politics-view.ts::politicsView,
             ::electionNews
             verified_by: read
tomorrow     MUST keep ticking while the election is open (AI pauses, ceremony). Ready in announce
             or ballot is Done for the stage. MUST NOT mark away seats Done (HC-64). The host's
             Continue in announce or ballot MUST mark every human not Done as Done (abstaining),
             and the news names them ("Mia continued without Leo"). In the ceremony it is refused.
             The view MUST follow RULE-64. The news gives one line per office at its winner step.
logic        → §2 RULE-61 rows 3-4, RULE-64
seam         mule-game.ts (WS3 named edits: the tick, continuePlanning); politics-view.ts (WS7)
senior       junior would: add a second "close the vote" host button · senior does: the host's
             existing Continue means "go on without them" in every untimed wait
mechanism    in_place
pin          apps/server/test/politics.test.ts's election rows are restated (the clock rows go); the
             planning Continue rows (WS3's planning.test.ts) are unchanged outside the election
depends_on   C61, C62, C65
```

```
C65 · MODIFIED · the contract: candidacy on Politics, the election's stages and ceremony

today        Election { stage nominate|ballot|reveal|over, clockMs, candidates, promises, ballots,
             done, result }.
             anchors: packages/engine/src/types.ts::Election, ::Politics, packages/protocol/src/index.ts::MuleView
             verified_by: read
tomorrow     MUST carry §3's shapes (WS3 named edits in types.ts and protocol).
seam         types.ts, protocol (WS3)
mechanism    in_place
pin          the board key allow-list test (HC-2) updated for the new keys
depends_on   none (the contract, frozen first)
atomicity    ships with C60-C64: the stage names change for every consumer at once
```

```
C66 · MODIFIED · the screens: run any month, the announcement, the ballot's "waiting for", the ceremony

today        the Council desk shows the election under the Now card; the TV shows only the result.
             anchors: apps/web/src/phone/hub/politics/Council.tsx, apps/web/src/table/TvElection.tsx
             verified_by: read
tomorrow     MUST render WS6's approved mock: a candidacy card in every month's hub, the announcement,
             the ballot listing whom it waits for, and the ceremony on the TV, plus a phone-only version
             when no TV is connected. Until the mock is approved, C60-C64's PR keeps today's desks
             working on the new stage names (announce in place of nominate), with no new layout.
ux           WS6's election mock, approved by Heiko 2026-10-29, ws6-ux 23697e5b:
             design/mocks/ws6-ux/src/screens/audit/{ElectionAudit,ElectionReveal}.tsx · routes
             #audit-election, -announce, -ballot, -reveal, -governor · GRAFT TARGET: hub/politics/**,
             TvElection.tsx; the stage slot, desk tabs and ReadyBar words as named edits in WS6's
             files (AM-21). Month 1's announce takes the Council desk's RunForOffice block (AM-21).
mechanism    fill_scaffold
depends_on   C64, WS6's approved mock
```

```
C67 · MODIFIED · the sim plays the untimed election (WS1)

today        packages/ai/src/play.ts steps the election in WALK.tickMs ticks while it is open.
             anchors: packages/ai/src/play.ts
             verified_by: read
tomorrow     MUST keep stepping until the election is over (AI seats are Done after their pauses, so
             it ends). It MUST tick the vote hands in every month's planning (candidacy ahead of the
             election). WS1 re-measures its politics rows.
seam         WS1's play.ts (named edit if the loop needs one); WS1's rows
depends_on   C61, C63
```

```
C68 · ADDED · the Governor's promise holds for the term (AM-21, E-7)

today        the promise lives on the Election and is dropped with it when the next one opens.
             anchors: packages/engine/src/politics.ts::takeOffice, types.ts::Politics
             verified_by: read
tomorrow     MUST copy the winning Governor's promise to Politics when they take office and keep it
             until the next Governor does (none when appointed or unopposed without one). Every
             screen shows it beside the tax, kept or broken (the tax ≤ a cap, < the start for
             lower, = the start for hold).
seam         politics.ts (takeOffice); types.ts and protocol (WS3 named edits)
mechanism    in_place
pin          RULE-6's tax tests unchanged: the promise binds nobody, it is shown
depends_on   C62
```

```
C69 · MODIFIED · the host's Continue says which stage it moved past (AM-21, E-10)

today        one news line in every stage: "Lena continued without Kai".
             anchors: apps/server/src/mule-game.ts::MuleGame continuePlanning
             verified_by: read
tomorrow     MUST say "Lena opened the ballot without Kai" in announce, "Lena closed the ballot
             without Kai" in the ballot, and "Lena continued without Kai" in planning proper. In an
             announce with no contested office there is no ballot to open, so it says "continued"
             (PM ruling 2026-10-29).
seam         mule-game.ts (WS3 named edit)
mechanism    in_place
pin          T-AC-64's server rows, restated with the new words
depends_on   C64
```

**Reuse check (C62, the only ADDED change):** `git grep -nE 'resultShown|revealCountdown|countdown'
apps packages` → `apps/server/src/politics-view.ts::resultShown` and `apps/web/src/phone/hub/politics/words.ts`'s
revealCountdown: today's single reveal, which the ceremony replaces rather than sits beside.

## §2 · The Logic `[handoff]`

```
RULE-60 · Who may run, and when                    (replaces RULE-2 row 1)   shape: decision table

inputs    phase · the election's stage (none | announce | ballot | ceremony | over) · office ·
          governorTermsInRow · the player's candidacy
first match wins
  #   when                                                then
  1   phase ≠ planning                                    refuse "You can run for office in planning"
  2   stage ∈ { ballot, ceremony }, or stage = announce   refuse "Candidates are closed until the result"
      and month > 1 (AM-21: the field closes as an
      election month opens; month 1 has no earlier planning,
      so its announce is the time to run)
  3   office = governor and governorTermsInRow ≥ 2         refuse "Two Governor terms in a row"
  4   runs for the other office                           switch (the promise goes with Governor only)
  5   otherwise                                           runs; a Governor run carries a promise (RULE-10)
withdraw / change promise: allowed whenever row 1-2 allow.
lasts     from declaration until the next ballot opens; then it is the election's, and Politics'
          list is empty again.
examples  month 2 Ossa runs for Governor promising 8% → listed on every screen until month 4 ·
          month 3 she changes to 7% → the month 4 announcement shows 7% · month 4 ballot open →
          "Candidates are closed until the result" · month 1 announce: Lena runs → on the ballot
          (T-AC-66) · month 4 announce: Lena runs → "Candidates are closed until the result", and
          no Run button (T-AC-67)
```

```
RULE-61 · An election month                      (replaces RULE-1's stages)   shape: state machine

  from       event                                              to
  (open)     planning opens in a POLITICS.electionMonths month   announce (candidacy as RULE-60)
  announce   every player Done, or the host's Continue (the      ballot: candidacy copied in;
             humans not Done become Done)                        offices with < 2 candidates
                                                                 have no ballot
  ballot     no office has 2+ candidates                         ceremony at once
  ballot     every player Done (they pressed Cast my vote;       ceremony: results fixed
             picking alone is not Done, AM-21), or the host's    (RULE-3 + AM-17)
             Continue
  ceremony   the last office's winner step ends (RULE-62)        over: winners take office
  any open   the game leaves planning (AM-1)                     close at once, as AM-1
Done        'ready' in announce ("Ready to vote") or ballot ("Cast my vote") is Done for the stage;
            an AI is Done after it acts (VoteHand's 'done' is its Cast). A pick after Cast still
            counts until the ballot closes.
away        not Done by being away (HC-64); the host's Continue moves past them.
continue    refused in the ceremony ("The result is being announced").
examples    all four Done in announce → ballot · Leo's phone drops in the ballot → it waits; the
            host continues → closes, "Mia continued without Leo" · nobody runs → no ballot; the
            ceremony shows "appointed"
```

```
RULE-62 · The ceremony                                    (AM-21: one show clock)   shape: formula

one show clock, from 0 when the ballot closes, in game ms; every screen draws the same moment.
per office, in POLITICS.offices order, from t0 (first office: POLITICS.ceremony.leadMs):
  title     = t0                                   the office and what it does
  cands     = title + titleMs                      candidates pop in, in seat order (never ranked)
  bars      = cands + candidateMs × candidates + barsLeadMs
  blocksEnd = bars + blockMs × Σ weighted votes    one block at a time, interleaved
  tie       = blocksEnd + tieLeadMs  when how ∈ { baron, land, lot }, else none
  winner    = tie + tieMs  or  blocksEnd + winnerLeadMs     the winner, how, the celebration
  end       = winner + winnerMs                    → next office's t0
total = last end + summaryMs, the whole result held. Then over: winners take office.
An office with no ballot (0 or 1 candidates) has no blocks; its beats still run.
constants: POLITICS.ceremony, one per name above, from WS6's approved mock (ElectionReveal.tsx).
```

```
RULE-63 · VoteHand's election acts                (replaces RULE-8's timing)  shape: decision table

  #   when                                                        then
  1   planning, an election in POLITICS.ai.declareLeadMonths       decide candidacy once this cycle
      months, not decided this cycle                              (runGovernor / runSheriff chances,
                                                                   as RULE-8)
  2   announce in month 1, not decided this cycle                  decide now (AM-21: only month 1's
                                                                   announce takes a run)
  3   announce in month 1, runs for Governor                       refresh the promise (RULE-10 AI row)
  3b  announce                                                     Done (after any row 2-3 act)
  4   ballot open, after a seeded pause from POLITICS.ai.actMs     vote (RULE-8's choice) then Done
```

```
RULE-64 · Who sees what of the election          (replaces RULE-9's election rows)  shape: decision table

  item                                           who, when
  candidates and promises (Politics and Election) every screen, any time
  a ballot                                        its voter only; never anyone else
  who is Done in announce / ballot                every screen ("waiting for Leo")
  an office's totals                              every screen, from that office's bars beat (RULE-62)
  an office's winner and how                      every screen, from that office's winner beat; in a
                                                  tie (baron | land | lot), from its tie beat, where
                                                  the mock names the rule that broke it (AM-21)
  the news line naming the winner                 at the winner beat, tie or not
  the show's total length                         every screen from the ballot's close; it shows a tie
                                                  is coming 2.3 s early (accepted, AM-21)
  the Governor's promise for the term (C68)       every screen, while the term lasts
  my tax paid and my reputation (E-5)             my phone only
```

## §3 · Contracts & Data Models `[handoff]`

- **Engine (MODIFIED, breaking for every consumer; C65; WS3 named edit in types.ts):** `Politics` gains
  `candidates: Record<Office, string[]>` and `promises: Record<string, TaxPromise>`. `Election.stage`
  becomes `'announce' | 'ballot' | 'ceremony' | 'over'`. `clockMs` moves into `ceremony: { office:
  Office; step: 'intro' | 'bars' | 'winner'; clockMs: number } | null`. candidates, promises, ballots,
  done stay; `result` becomes `Partial<Record<Office, OfficeResult>>`, keyed by POLITICS.offices (the
  Sheriff is decided after the Governor and never the Governor, as today, when both exist).
- **Config (MODIFIED; HC-61):** POLITICS loses nominateMs, ballotMs, revealMs and revealCountdownMs. It gains
  `offices: ['governor', 'sheriff']`, `ceremony: { introMs, barsMs, winnerMs }` and
  `ai.declareLeadMonths`.
- **AM-21 (MODIFIED; WS3 named edits):** `Politics` gains `promise: TaxPromise | null` (the Governor's,
  for the term). `Election.ceremony` becomes `{ elapsedMs: number; totalMs: number } | null`, one show
  clock (RULE-62); the view sends `{ seconds, total }` and the offices whose beats it has reached.
  `MyView.politics` gains `paid` (tax paid, cr) and `reputation`. POLITICS.ceremony's three clocks become
  RULE-62's named beats.
- **Protocol (MODIFIED; WS3 named edits):** the politics view gains `candidates` and `promises`; the
  election view swaps `seconds/total` for `ceremony` and adds `waitingFor` (RULE-64). The run intent
  is unchanged. The board's key allow-list follows.

## §4 · Failure & Ops `[handoff]`

In-process and seeded. The one new failure is a vote that never ends (a player away). HC-64 and the
host's Continue cover it; AM-1 covers a game that leaves planning another way. An operator sees the
stage and whom it waits for in the view, and one news line per office.

## §5 · Delivery `[handoff]`

Code-only; games live in server memory.

## §6 · Acceptance Criteria `[handoff]`

| id | Given / When / Then | changes | observed_at |
|---|---|---|---|
| B-AC-60 | Given month 2 · When Ossa runs for Governor promising 8 %, then in month 3 changes it to 7 % · Then every screen lists her from month 2, and month 4's announcement shows 7 % | C60, C64 | the views (server test) |
| B-AC-61 | Given an election month's ballot · When one human has not voted · Then nothing closes, however long; it closes the moment they vote; or the host's Continue closes it and the news names them | C61, C64 | server state and news (server test) |
| B-AC-62 | Given the ballot closes · Then every screen shows the Governor's intro, bars and winner, then the Sheriff's, and never shows an office's totals before its bars step or its winner before its winner step | C62, C64 | the views over time (server test) |
| B-AC-63 | the §0 proof: a step in e2e/politics.ts | C60-C66 | phones and TV (e2e) |
| T-AC-60 (serves B-AC-60) | RULE-60's rows | C60 | engine |
| T-AC-61 (serves B-AC-61) | RULE-61's transitions; no stage ends on a clock; AM-1 still closes | C61 | engine |
| T-AC-62 (serves B-AC-62) | RULE-62's sequence; a Governor-only POLITICS.offices runs one office | C62 | engine |
| T-AC-63 (serves B-AC-63) | RULE-63's rows; AI-only games still fill every office (UBER-AC-1) | C63 | ai |
| T-AC-64 (serves B-AC-61) | away seats are not Done; Continue is refused in the ceremony | C64 | server |
| T-AC-65 (serves all) | politics off unchanged; WS1's rows re-measured, all checks pass | C67 | `pnpm sim` |
| T-AC-66 (serves B-AC-63) | month 1's announce takes a run, and that candidate is on the ballot | C60 | engine, and the phone's Run in announce (render) |
| T-AC-67 (serves B-AC-60) | from month 4, announce refuses a run and shows no Run button | C60, C66 | engine; render |
| T-AC-68 (serves B-AC-61) | picking alone is not Done; Cast my vote is; an AI-only ballot closes by itself | C61, C63 | engine; ai |
| T-AC-69 (serves B-AC-62) | each office's beats follow RULE-62's formula from the tally; totals and winner reach the view only at their beats | C62, C64 | engine; server views |
| T-AC-70 (serves B-AC-63) | the Governor's promise holds for the term on every phone and the Governor's desk, with kept or broken (the TV: follow-up, AM-21 note) | C68 | engine; server view; render |
| T-AC-71 (serves B-AC-61) | the host's Continue news names the stage it moved past | C69 | server |

negative cases: a run in development (RULE-60 row 1); a run while the ballot is open (row 2);
Continue in the ceremony. Invariant: no stage of a decision ends on a clock.

## §7 · Risks & Spikes `[review-only]`

- **A table waits forever on a quiet player.** Mitigation: "waiting for <names>" on every screen and
  the host's Continue (B-AC-61).
- **Other lanes' e2e rely on the old clocks.** Mitigation: they call `readyThroughTheElection`
  (politics-steps.ts, WS7), which presses Ready in announce and ballot; the ceremony ends on its clocks.
  The PR runs Tier 2 locally.
- **AI candidacy ahead of time shifts the seeded streams.** Mitigation: WS1 re-measures (T-AC-65);
  the tie-break draw has its own stream (AM-17).
No spike needed.

## §8 · Amendments `[review-only]`

Note for slice 2a: its council was designed "built like the election", with clocks. To follow this
ruling, I propose the Governor proposes a law at any time in planning, and the next month's planning
opens with the law ballot (untimed, closes when everyone has voted, host's Continue for every player not Done),
then a short clocked reveal. CONFIRMED by the PM (2026-10-28; Heiko may overrule): folded as slice 2a's AM-1 (C40, RULE-40,
RULE-41, HC-43, §3, B-AC-43).

```
AM-21 · 2026-10-29 · Heiko approved WS6's election mock (ws6-ux 23697e5b); PM rulings (a)-(c), month 1 (A)

target    RULE-60 row 2, RULE-61 ballot Done, RULE-62, RULE-63 rows 2-3, RULE-64; C66 ux; C68, C69 added; §3; §6
said      AM-18: announce is a last call to run; a full ballot is Done; the ceremony steps
          intro/bars/winner on fixed clocks; the promise ends with the election
did       Follow the mock: (a) Cast my vote is the ballot's Done, picking alone is not; (b) the
          field closes as an election month opens, except month 1, whose announce is the time to
          run (no earlier planning; composed from the approved RunForOffice block, WS6 reviews);
          (c) one show clock, each office's length from its tally (RULE-62's formula, constants
          named in POLITICS.ceremony); E-7 the promise holds for the term; E-10 the Continue's news
          names its stage; E-5 my tax paid and reputation on my phone. In a tie the winner and rule
          reach the views at the tie beat, as the mock stamps them (RULE-64); the news stays at the
          winner beat. Ties read "decided by lot"
          (AM-17; WS6 fixed the mock in 23697e5b).
because   P-1: Heiko approved the mock: "Yes, all as recommended"; "all ux audit changes are approved"
goal      P-1 — still met; UBER-AC-2 keeps month 1's run (B-AC-63)
folded    RULE-60, RULE-61, RULE-62, RULE-63, RULE-64, C63, C66, C68, C69, §3, T-AC-66..71; `pnpm sim` before and
          after (E-7 and (b) change the AI's field), WS1 reviews
note      PM 2026-10-29: T-AC-70 is proven on the phones and the Governor's desk only. No mock draws
          the promise on the TV's planning screen (WS4's TableApp); WS6 designs a TV state, and it lands
          as its own small PR with a one-line WS4 named edit. PR-3 does not wait for it.
```

## §9 · Ownership Boundaries `[handoff]`

No ownership change: politics.ts remains the sole writer of state.politics, now including candidacy.
