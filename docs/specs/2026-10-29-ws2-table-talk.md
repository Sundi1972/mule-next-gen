# WS2 · Spec B: the AI's table talk and diplomacy

**Status:** §0 APPROVED (Heiko, "Yes, as recommended", via the PM, 29 Oct); approach B and class **Programme** chosen
by Heiko; design sections 1-4 approved by the PM 29 Oct; written and self-reviewed 29 Oct, for Heiko's read. Builds
after spec A's PR-1 (`docs/specs/2026-10-28-ws2-strategy-playbook.md`). Source: Heiko, 28 Oct, point 2 of his AI
design message: "i wnat that the ai will message other users sometimes just to share a joke or say somethign about
the current game sometimes to really try to win allies etc". Traces to Mission Goals G-2 (Smart AIs talk in
character, within budget) and G-4 (the table plays politics).

## §0 · Business Goals & Value

**G-B1 · AI players are good company: now and then they message a player or the whole table on their own, with a
joke or a remark about the game as it stands, in character.** `[handoff]`
- **Who benefits** `[review-only]`: the human players at a table with AI seats; Heiko's playtest first.
- **Today** `[review-only]`: an AI speaks only right after its own decision: at most 3 public lines a month, one a
  phase, about the move it just made (`apps/server/src/brain/chat.ts::chatter`, `BRAIN.linesPerMonth`). It never
  starts a conversation, never whispers (the room's `packages/tabletop/src/room.ts::GameContext` `say` takes a `to`,
  but the brain never passes one), never remarks on what another player did, and hears players only as quotes in its
  next decision, the last 6 (`packages/ai/src/brain.ts::hear`, `BRAIN.talkLines`). Once spec A removes per-move calls
  (its C7), an AI speaks only when it writes its strategy. No player can mute an AI. verified_by: read.
- **Value** `[review-only]`: a table of one or two people and several AIs feels like a game night rather than a solo
  game against bots; the AIs notice and react to what others do. A few cents a game.
- **UBER-AC-B1:** in a full game with one human and three Smart AI seats, each AI sends at least 3 unprompted
  messages (public or whispered) that name something another player did that month, and never more than the rate
  cap; after the human mutes one AI, that AI sends them nothing more; no message names another seat's goods or
  unanalysed ground. Then Heiko answers "did the AIs feel like company at the table?" with yes.

**G-B2 · AI players try to win allies: they message players to propose pacts and vote deals, remember how each
player treated them, and act on it, without spamming, lying about the game or overspending.** `[handoff]`
- **Who benefits** `[review-only]`: the human players (Mission G-4's politics): pacts and votes matter at a table
  with AIs.
- **Today** `[review-only]`: AIs offer nothing. There are no deal cards yet (WS7's slice 3, `docs/specs/2026-10-22-ws7-politics.md`
  P-2); reputation is 50 for everyone and never changes (`packages/engine/src/game.ts::createGame`); an AI keeps no
  memory of a player beyond the last 6 quoted lines. WS7's P-2 has an AI answer a pact card; no AI ever proposes
  one. verified_by: read.
- **Value** `[review-only]`: AI tables get negotiators (pact and vote offers, apologies, grudges), so alliances and
  the election matter even with one human; the sim can test diplomacy keyless on template offers.
- **UBER-AC-B2:** an e2e with one AI seat and a fake model: the AI whispers a pact card to a human, who accepts with
  one tap, and both phones list the pact; no third whisper to that player that month; a muted AI sends none; with
  the key unset the same flow runs on template wording. A paid run keeps all AI seats together within the $1 game
  budget.

**Non-goals** `[review-only]`: spec A's work (the strategy, the playbook, the manual and tools, the line an AI says
when it writes its strategy); WS7's deal cards, their keep/break rules and the reputation score (used, never
rebuilt); whispers and reactions as a feature (they exist; WS7's spec hands "AI whispers and AI chat lines" to WS2);
WS6's chat and card screens, including the mute control's design; anything of value changing hands through a
message (WS7 HC-3); AIs lying about game facts or rules; storing player chat text in the game record (WS3's agreed
non-goal); AI-to-AI private talks; memory across games; voice; bring-your-own-key.

**Rough cost** `[review-only]`: about 4 PRs (B-1 to B-4). Money at the interim default (a): talk's own slice, about
$0.04-0.05 a seat-game inside the $1 game budget. Thin baseline (template talk, no model): about 2 PRs, $0 (§0.1).

## §0.1 · Decision Record `[review-only]`
- **Chosen (B):** a keyless rule decides when an AI talks, to whom and about what, and every AI action; the model
  writes only the words, from spec A's brief, the persona and a memory built from public facts; a fact guard drops a
  message that states a false game fact; templates are the keyless fallback. About 4 PRs.
- **Thin baseline (A):** the same keyless rule with per-persona templates and no model. About 2 PRs, $0. **Loses
  because** it cannot answer what a player actually wrote (a whisper "will you vote for me?" gets a canned line, not a
  reply), and a fixed pool repeats inside one 12-month game, which is what UBER-AC-B1's "felt like company" judges.
  It is kept as B's keyless fallback.
- **Larger, rejected (C):** a conversational agent per AI, replying to every message, negotiating over several turns,
  talking to other AIs. About 7 PRs; cost scales with how much humans write; spam becomes the default failure; AI-to-AI
  talk is a non-goal.

## §0.2 · Constraints `[handoff]`
```
HC-B1  An AI may bluff about its OWN intentions, in character (promise a vote, then break it); WS7's keep/break
       reputation is what catches it. An AI never states a false game fact or rule: every price, holding, owner,
       score or rule a message states matches the public game state when it is sent; a message that would state
       one is dropped, never sent.                                              source: Heiko, 29 Oct · fatal
HC-B2  A player can mute an AI; a muted AI sends that player no whispers, no card offers, and its public lines are
       hidden on that player's phone. The control is a WS6 surface with a mock first; the TV is unaffected
       (default; Heiko sees the question with WS6's mock).                       source: Heiko, 29 Oct · fatal
HC-B3  Talk never drives an AI action. Heard lines, the model's text, whether a message was sent, and talk's own
       spend shape only OUTPUT (whether to talk, to whom, about what). Every AI action (a card proposal, a card
       answer, a vote) comes only from public state, the record's notices, spec A's stances and WS7's card rules,
       on its own keyless cadence and caps: never the chat counters and never a budget read. The record stores
       neither heard lines nor talker replies (WS3's RULE-5), so anything they drove would diverge on replay.
       In plain words, for players: chat can't sway an AI's actions; deal cards, public play and how a player
       treats it can. "Vote for me and I'll cut taxes" in chat may get a reply in character, but it does not move
       the AI's vote. The manual and the AI's own replies never imply otherwise.
                                                              source: WS3's record review, PM, 29 Oct · fatal
HC-B4  Talk spends only its own slice: BRAIN.talkShare of a seat's share of BRAIN.gameBudgetUsd, ledgered against
       that slice; play's part is never available to talk.                       source: PM, 29 Oct · fatal
HC-B5  Spec A's HC-3 and HC-6 hold: only public information reaches a talk prompt; packages/ai stays pure.
                                                                                 source: spec A §0.2 · fatal
```

## §1 · Solution Design `[handoff]`

```
C1 · ADDED · the talk moment: when an AI speaks, to whom, about what
today        the brain speaks only from a decision record, one line a phase (apps/server/src/brain/chat.ts::chatter)
             verified_by: read
tomorrow     MUST evaluate RULE-B1 at each notice, each heard line and each phase change, and return a moment
             { to: player | 'table', about: event, purpose: 'remark' | 'answer' | 'court' } or nothing; MUST enforce
             the caps, the mute and talk's slice (HC-B2, HC-B4); MUST be keyless and pure, so the sim tests it.
seam         packages/ai/src/talk/moment.ts (new)
reuse        neighbours: apps/server/src/brain/chat.ts::chatter (one line a phase from a decision record; it has no event input, no
             addressee and no caps per player, so it is replaced, not grown); the seeded RNG every hand uses.
senior       junior would: ask the model whether to speak on every event · senior does: a keyless table decides
             when, with the caps in config, so the model is called only for a moment that will be sent
mechanism    sprout
depends_on   WS3's notice hook (data, not stubbable for B-AC-B1); spec A's stances (data, stubbable)

C2 · ADDED · memory: what an AI remembers of each player, from public facts only
today        none: the AI keeps the last 6 quoted lines (packages/ai/src/brain.ts::hear)   verified_by: read
tomorrow     MUST keep one record per (AI, player): trades with or against it, plots it wanted that they took,
             pacts kept or broken and their reputation (WS7, once it moves), the last thing it said to them; MUST be
             a pure function of the game's public events, so a replay rebuilds it and nothing is saved.
seam         packages/ai/src/talk/memory.ts (new)
reuse        neighbours: Brain.hear's quoted talk (kept for the prompt, not used as memory: HC-B3); spec A's
             PhaseOutcome rivals block (claims, trades), which memory reads rather than recomputes.
senior       junior would: keep a free-text notebook the model writes · senior does: counted public facts only,
             rebuilt on replay, so memory can never hold a lie or a private fact
mechanism    sprout
depends_on   WS3's notices (data); WS7's pacts and reputation (data, stubbable until slice 3)

C3 · ADDED · the talker: the words for a moment, and the fact guard
today        the brain's line comes with a decision reply (LlmDecider's `line`)   verified_by: read
tomorrow     MUST build the talk prompt (system: spec A's manual + persona; user: the moment, spec A's public brief,
             the AI's current strategy, its memory of the addressee, the quoted talk, and the contract "declare every
             game fact you state"); MUST ask for { text ≤ BRAIN.maxLineChars, facts[] } (§3); MUST run RULE-B2 and
             drop a failing message; MUST never throw: no reply, a refusal or a cut-off → a template (C6).
seam         packages/ai/src/talk/talker.ts (new), consuming spec A's Complete-shaped port
reuse        neighbours: spec A's writer (its structured-output schema and cause codes; the talker mirrors the
             shape, with its own codes) and llm/reply.ts's line cleaning.
senior       junior would: trust the model's prose · senior does: facts declared and checked against public state
             before sending; what cannot be checked is named as an accepted risk (R-B1)
mechanism    sprout
depends_on   C1; spec A PR-1 (the client, the brief, the manual's system block)

C4 · MODIFIED · the brain gains a talker, its own slice of the budget, and a ledger kind
today        BrainService offers deciderFor and chatter (apps/server/src/brain/index.ts::BrainService); the budget
             checks seat share and table (apps/server/src/brain/budget.ts::createBudget)   verified_by: read
tomorrow     MUST add `talkerFor(seat)` (§3); MUST check every talk call against talk's slice (BRAIN.talkShare of the
             seat's share) before sending and ledger it after under kind 'talk' (HC-B4); MUST pick the model by
             BRAIN.talkModel (default Sonnet 5.5) with the Haiku fallback, as spec A's RULE-A5 does for its calls.
reuse        createBudget's seat-share check and the ledger's per-kind rows (spec A's LedgerKind) take talk as one more
             kind; spec A's model pick (RULE-A5) and priceTable price it. No second budget or ledger.
call sites   BrainService is built in apps/server/src/brain/index.ts (Classic and the real brain); consumed by
             apps/server/src/mule-game.ts and apps/server/src/brain/trial.ts; WS3's record.ts and replay.ts implement
             it (C9).
pin          brain-budget.test.ts and brain-service.test.ts keep passing; play's share is unchanged by talk (T-AC-B4).
mechanism    in_place
depends_on   C3

C5 · MODIFIED · MuleGame feeds the talk moment and delivers its messages
today        MuleGame wires chatter to `ctx.say` (apps/server/src/mule-game.ts::chatter) and passes heard lines to the
             AI seats (apps/server/src/mule-game.ts::heard)   verified_by: read
tomorrow     MUST pass notices, heard lines and phase changes to C1, and deliver a sent message by `ctx.say(from,
             text, to)`, whispers included; one named touch point in WS3's mule-game.ts.
reuse        the room's `GameContext.say` already takes a `to` (whispers exist; the brain never passed one), and
             `heard` already reaches the AI seats.
call sites   mule-game.ts (chatter wiring, heard); trial.ts routes chatter for its report
pin          brain-table.test.ts (B-AC-1, B-AC-2, B-AC-5) keeps passing until chatter's lines move to C1
mechanism    in_place + one named edit
depends_on   C1, C4; WS3's notice hook

C6 · MODIFIED · the persona's template lines cover talk moments: the keyless words
today        each persona has template lines per decision kind (packages/ai/src/personas.ts::lines, a
             Record<DecisionKind, string[]>)   verified_by: read
tomorrow     MUST add lines per talk purpose ('remark' | 'answer' | 'court') with slots filled only from public state,
             and fill a moment from them when the key is unset, past talk's slice, or on a talker failure, under
             their own cap.
seam         packages/ai/src/personas.ts::lines (found by the reuse check; no new templates file)
senior       junior would: a second template table beside the personas · senior does: one persona owns its voice,
             decision lines and talk lines together
pin          the existing decision lines and their tests are unchanged
mechanism    in_place

C7 · ADDED · mute
today        no mute exists (searched apps/web/src, apps/server/src, packages/tabletop/src, packages/protocol/src:
             none)   verified_by: none_exists
tomorrow     MUST accept a `mute` intent from a player (§3) through the room's generic intent path, so the record
             holds it; MUST stop that AI's whispers and card offers to that player and hide its public lines on that
             player's phone (HC-B2); the phone control is WS6's, from its mock.
seam         packages/protocol/src/index.ts::MuleIntent and mule-game.ts's handle: both WS3's (SEAMS), named edits WS3
             reviews
reuse        the room's generic intent path records every intent already; mute is one more MuleIntent, so replay gets
             it free.
mechanism    in_place + named edits
depends_on   WS6's mute mock (ux)

C8 · ADDED · courting: AI deal-card proposals and answers (G-B2)
today        no deal cards exist yet (WS7 slice 3 unbuilt; no card, pact or deal type in packages/engine/src,
             packages/ai/src or apps/server/src at feat/strategist 296eee2)   verified_by: none_exists
tomorrow     MUST propose a WS7 card to a player spec A's stances mark as ally or target, or answer one, by RULE-B3's
             keyless cadence and caps (HC-B3); the card's text rides in the card intent, so the record holds it; the
             words around it come from C3 or C6.
seam         packages/ai/src/talk/court.ts (new), calling WS7's card API (contract, WS7's to shape)
reuse        answering a card is WS7's keyless AI rule, specced in WS7's politics spec (UBER-AC-3: "An AI seat offered
             the same card answers it within the planning phase with no API key set") and built in WS7 slice 3;
             C8 only proposes, and calls WS7's answer as is. Never a second answer rule.
mechanism    sprout
depends_on   WS7 slice 3 (data, not stubbable for B-AC-B3); WS6's card screens

C9 · MODIFIED · the recorder and the replay pass the talker through (WS3's files, named edits)
today        not on ws2-brain: WS3's recorder (#175) adds apps/server/src/record.ts, whose `wrapBrain` wraps deciderFor,
             and replay.ts (origin/ws3-auctions 2a409d6)   verified_by: read
tomorrow     WS3's apps/server/src/record.ts `wrapBrain` passes `talkerFor: (seat) => inner.talkerFor(seat)` through,
             unrecorded and outside its call numbering; WS3's replay.ts returns `talkerFor: () => null`.
reuse        wrapBrain's existing per-method wrap; talkerFor is a plain passthrough beside it.
mechanism    in_place (named edits, reviewed by WS3 on the SHA)
depends_on   WS3's recorder (#175) in feat/strategist (data, not stubbable: the files must exist)
atomicity    must ship with C4: adding talkerFor to BrainService turns both files red until they implement it
```

## §2 · The Logic `[handoff]`

```
RULE-B1 · A talk moment                                              shape: decision table, per event
inputs   muted: the addressee muted this AI (true | false) · talkLeft: talk's slice covers the call's worst case
         (true | false) · whispered: a player whispered this AI and it is unanswered · stanceChanged: spec A's
         stance for a player became ally or target, or an election or council vote is next phase · notable: a public
         event names another player (a claim next to its land, a trade of at least BRAIN.talk.bigTrade units, an
         election result) · counts: this month's unprompted messages, this phase's, and whispers to that player
first match wins
  1  muted                                  nothing to that player
  2  talkLeft = false                       template wording only (C6), or nothing past the template cap
  3  whispered                              'answer' that player in-phase, at most BRAIN.talk.answersPerMonth to them
  4  stanceChanged                          'court': one whisper to that player, at most
                                            BRAIN.talk.whispersPerPlayerMonth (2) to them a month
  5  notable                                'remark' to the table, or a whisper to the player it names
  6  otherwise                              nothing
also     rows 3-5 need fewer than BRAIN.talk.perMonth (3) unprompted messages this month and none yet this phase;
         a remark picks among notable events by a salience score with the seeded RNG
unknown  a missing stance reads as 'neutral' (no courting); an event naming no other player is not notable
timing   fire-and-forget in any phase; a reply that lands after its moment has passed (phase over, event stale) is
         dropped; an answer waits at most BRAIN.talk.answerWaitMs
examples → §6: whisper "vote for me?" → an answer in-phase · a third whisper to one player in a month → none ·
         muted → nothing · key unset → template · talk's slice spent → template · a whispered free-text promise →
         a reply, and the AI's vote unchanged (HC-B3)
```

```
RULE-B2 · The fact guard (C3, at send time, against the public state)     shape: checks, all must pass
  1  every declared fact is true: price = the store's posted price; owner = the tile's owner; score = the public
     Worth; holding = the AI's own stock; rule = a move present in MOVES
  2  every number in the text equals a declared fact's value
  fail → drop the message; ledger cause 'fact_mismatch' (a code, never the text); send nothing instead
  pass → send. A bluff about the AI's own intentions declares no fact and passes (HC-B1)
unknown  a reply with no facts and no numbers passes (R-B1)
examples → §6: false declared price → dropped · a number with no declared fact → dropped · "I'll vote for you" →
         sent · a prose-only false claim → sent (pinned accepted risk)
```

```
RULE-B3 · When an AI proposes or answers a deal card (C8)          shape: decision table, per planning phase
inputs   stance (spec A, from the playbook in effect) · reputation (WS7) · open cards to/from this AI · cardsThisMonth
first match wins
  1  a card is offered to this AI                    answer by WS7's AI rule (accept or decline), keyless
  2  stance = ally and no open card to them, cardsThisMonth < BRAIN.court.cardsPerMonth   propose a pact
  3  a contested vote is next phase and stance = ally or target, cardsThisMonth < cap      propose a vote deal
  4  otherwise                                       no card
unknown  reputation before WS7's slice 3 moves it reads as 50 for everyone
never    reads heard lines, the model's text, chat counters or any budget (HC-B3)
```

## §3 · Contracts & Data Models `[handoff]`
- **`BrainService.talkerFor(seat): Talker | null`** (ADDED, WS2, C4); `Talker.talk(moment, request) →
  Promise<{ sent: string | null; to: player | 'table'; cause?: string }>`, never throws. Null for a Classic seat, with
  the key unset, and in the replay's brain.
- **Talk reply** (ADDED, WS2, C3): `{ text: string, facts: ({ price: Good; value } | { owner: PlotIndex; player } |
  { score: PlayerId; value } | { holding: Good; value } | { rule: AiAction['type'] })[] }`. Not recorded (§3 of WS3's record:
  chat is a non-goal); nothing in game state reads it (HC-B3).
- **`mute` intent** (ADDED, protocol, C7): `{ type: 'mute'; seat: PlayerId; muted: boolean }` in
  `packages/protocol/src/index.ts::MuleIntent`; recorded as an `intent` event by WS3's recorder.
- **WS3's record** (consumed, frozen at ws3-auctions 6b541f9 with AM-1): the `notice` hook feeds C1 and C2; no
  amendment (WS3, 29 Oct: points 1, 3, 4, 5 of WS2's check hold; point 2 met by HC-B3).
- **WS7's deal cards and reputation** (consumed, WS7 slice 3, shape WS7's): propose, answer, list; reputation per
  player.
- **WS6's screens** (consumed): the mute control (mock first; its requirements were routed by the PM 29 Oct) and the
  card screens.

## §4 · Failure & Ops `[handoff]`
| Question | Answer |
|---|---|
| Model unavailable, slow, refuses | a template within its cap, or nothing; the game is untouched (C3, C6) |
| Retries | none; the next moment may talk again |
| Idempotency | one message per moment; a late reply is dropped (RULE-B1 timing) |
| Races | a reply racing its moment's end: the end wins; a mute racing a send: the mute wins at delivery (C7) |
| When broken | play is unaffected: talk drives no action (HC-B3); a game with the talker off replays identically |
| Operator view | ledger kind 'talk' with model, usd and outcome; the trial report gets talk rows (B-4) |

## §5 · Delivery
Code-only; no existing state to reach. The mute starts unset for every player.

## §6 · Acceptance Criteria `[handoff]`
| id | Given / When / Then | observed_at | negative case | changes |
|---|---|---|---|---|
| B-AC-B1 (G-B1) | Given one human and three Smart AIs on a fake model / When a full game plays / Then each AI sends at least 3 unprompted messages naming another player's action, never past the caps. | the delivered chat | a game with no notable event → no remarks | C1 C3 C5 |
| B-AC-B2 (HC-B2) | Given a human mutes one AI / When the game goes on / Then that AI's whispers, card offers and public lines stop on that player's phone. | the player's phone (browser, front to back) and server delivery | other phones and the TV still show its public lines | C7 |
| B-AC-B3 (G-B2) | Given one AI and a fake model / When the AI's stance marks a human as ally / Then it whispers a pact card, the human accepts with one tap, and both phones list the pact; no third whisper that month; key unset → the same flow on template wording. | both phones, WS7's card list | a neutral stance → no card | C8 C1 C6 |
| T-AC-B1 (B-AC-B1) | RULE-B1 rows 1-6 with its examples, including the whispered free-text promise that gets a reply and leaves the vote unchanged. | the moment returned; the AI's vote | — | C1 |
| T-AC-B2 (HC-B1) | RULE-B2's four fake-model cases; the prose-only false claim is pinned as sent (R-B1), and every talk prompt carries the contract clause. | sent or dropped; ledger cause | a true declared price → sent | C3 |
| T-AC-B3 (HC-B3) | A replay of a game with talk and card proposals, talkerFor null, reproduces every card, vote and score. | WS3's replay result | — | C8 C9 |
| T-AC-B4 (HC-B4) | Talk is ledgered against talkShare; play's part is never spent on talk; past talkShare, templates or nothing. | ledger lines; budget checks | — | C4 |
| T-AC-B5 (B-AC-B1) | With the key unset, templates fill the moments and no client is built. | delivered chat; client factory | — | C6 C4 |
| T-AC-B6 (HC-B5) | No talk prompt or message carries another seat's goods or unanalysed ground. | prompt and message text | a rival's distinctive stock in a prompt → red | C3 C2 |

## §7 · Risks & Spikes `[review-only]`
- **R-B1 (accepted risk, scored, not a gate):** a false claim in prose that carries no number and declares no fact
  ("the store is out of food") is not caught mechanically. Mitigation: the prompt's contract requires every fact to
  be declared; T-AC-B2 pins the case so it cannot change silently.
- **R-B2:** at the interim default (a), talkShare 0.2 of a $0.20-0.25 share is about $0.04-0.05, about 10-15 Sonnet
  messages a game against caps that allow about 24; talk falls back to templates in the later months. Mitigation:
  B-4's paid run measures the talk prompt's real cost; then the PM puts the choice to Heiko: (a) as is, (b)
  talkShare about 0.4, (c) Haiku for talk. **Open item for Heiko after B-4's measurement.**
- **R-B3:** WS7's slice 3 (cards, reputation) and WS6's card and mute screens arrive late. Mitigation: B-1 (G-B1)
  needs neither; C8 stubs WS7's card API in unit tests; B-3 starts when they land.
- **R-B4:** players may expect to talk an AI into a vote. Mitigation: HC-B3 states the rule in plain words; the
  manual and talk prompt say it; Heiko has been told and may object (then it comes back here).
- **Landmine (memory, "Configurable balance"):** every number (caps, bigTrade, answerWaitMs, talkShare, the
  templates' cap) is a named BRAIN value; the settings guard holds it.
- No spike: B-4's paid run is the measurement, cleared by the PM with its cost stated, inside the $1 game budget.

## §8 · Amendments `[review-only]`
(none yet)

## §9 · Ownership Boundaries `[handoff]`
- **Sole owner of AI talk and its memory: WS2**, `packages/ai/src/talk/` and the talker in
  `apps/server/src/brain/`. Read contract: `BrainService.talkerFor`. Write contract: only C1's moment decides a
  message; only C8's rule makes a card proposal. Enforcement: packages/ai's purity test as today; the §9 SDK guard
  (only `apps/server/src/brain/client.ts` imports the SDK); HC-B3's replay test (T-AC-B3) fails if talk ever drives an
  action.
- Not WS2's: deal cards, keep/break and reputation (WS7); the record and replay (WS3; C9 is named edits there);
  the chat, mute and card screens (WS6); the protocol and mule-game.ts (WS3's per SEAMS; named edits in C5 and C7).
