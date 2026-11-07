# WS2 · Spec B v2: Claude plays the table: relationships, allies, influence, office

**Status:** §0 APPROVED (Heiko, "ai social goals approved", via the PM, 29 Oct), with AIs also courting other AIs.
Approach B, budget option (1) (Sonnet for the monthly social reasoning and for whisper replies) and class
**Programme** chosen by Heiko, 29 Oct, on S-B1's measured costs. Written and self-reviewed 29 Oct, for Heiko's read.
Supersedes spec B v1 (`docs/specs/2026-10-29-ws2-table-talk.md` on `ws2-spec-b-talk` @ e7a491a), whose approval
Heiko withdrew. Builds after spec A's PR-1 (`docs/specs/2026-10-28-ws2-strategy-playbook.md`).

**AM-B5 (7 Nov) · the RC slice.** For the first release candidate (18 Nov) this spec ships G-B1 and G-B2 through C1-C5,
C7, C8, C9, plus the vote seam C12 (Heiko, 7 Nov: replies that can change a vote stay in the RC) and the Claude Code
seat's social part C13 (PM ruling, 7 Nov; separable). G-B3 to G-B5, C6 beyond the vote seam, C10 and C11 come after the
RC (Heiko, 7 Nov, SEAMS:2420). Deal behaviour is an RC non-goal (PM ruling A, 7 Nov). New constraint HC-B7 (the "· AI"
mark, Heiko, 7 Nov). Details and the drift since 29 Oct: §8 AM-B5.

## What you'll see at the table `[review-only]`

- Each AI thinks once a month, as part of its strategy, about every other player, AIs included: where it stands with
  them, what it wants from them, how to win them. Then it sends up to 3 messages, to the table or as whispers.
- AIs court each other too: an AI's whisper to another AI is read by that AI at its next monthly think, and can change
  its stance or its vote.
- Whisper an AI and it answers in the same phase, in character. **At first that answer is words only:** what you say
  changes what it does at its next monthly think. WS3 has confirmed the replay side (29 Oct); once the record gains a
  `heard` marker (WS3's AM-4), a reply may also change the AI's stance or vote toward you on the spot (B-2b).
- In election months each AI decides whether to run, campaigns, asks for votes, and votes by its own reasoning.
  "Vote for me and I'll cut taxes" can move its vote, if it judges that serves its strategy. Only the Governor is
  elected until WS7's slice 4 brings back the Sheriff.

## §0 · Business Goals & Value

Source, Heiko, 29 Oct (via the PM, typos corrected by the PM): "It should be a conscious reasoning process of claude
(the ai) to whom it should talk and for what reason. The goals must be A) build relationships b) get other players to
like me c) influence other players so that i can better get my strategy implemented d) gain allies to support policy
changes e) get me voted for governor or sheriff. It needs to understand that relationships and allies are key for
winning the game and it needs to think about how to win allies and how to talk to them." Traces to Mission Goals
G-2 (Smart AIs talk in character, within budget) and G-4 (the table plays politics).

**Who benefits, for all five goals** `[review-only]`: the human players at a table with Smart AI seats, Heiko's
playtest first; through G-B3's and G-B5's tournaments, whoever tunes the AIs.

**G-B1 (A) · Each AI builds relationships: it knows where it stands with every player, from what they did and said,
and works on the ones that matter to its strategy.** `[handoff]`
- **Today** `[review-only]`: an AI keeps no view of any player. It hears the last 6 quoted lines in its next decision
  (`packages/ai/src/brain.ts::hear`, `BRAIN.talkLines`) and nothing else; reputation is 50 for all and never moves
  (`packages/engine/src/game.ts::createGame`). verified_by: read.
- **Value** `[review-only]`: a player's history with an AI matters: a fair trade or a kept promise is remembered, a
  betrayal too.
- **UBER-AC-B1:** in a full game (one human, three Smart AIs), every AI's recorded reasoning names, for each other
  player, where it stands with them and why (a past act or message), and at least once a game acts on a change it
  noticed (a message, a deal, a vote). The replay shows the same reasoning. Heiko answers "did the AIs remember how
  you treated them?" yes.
- *In the RC (AM-B5):* all of UBER-AC-B1 except "a deal" among the acts it may take on a change (deals are after the
  RC); "a vote" counts through C12. The game is played with Smart seats, and once C13 lands also with a Claude Code
  seat.

**G-B2 (B) · Each AI tries to be liked: it decides how to win each player's goodwill and does it, in character.**
`[handoff]`
- **Today** `[review-only]`: an AI speaks only right after its own move, at most 3 public lines a month, about that
  move (`apps/server/src/brain/chat.ts::chatter`, `BRAIN.linesPerMonth`); it never starts a conversation or whispers.
  verified_by: read.
- **Value** `[review-only]`: the AIs are company, and someone you might want on your side, not bots.
- **UBER-AC-B2:** in the same game, each AI's recorded reasoning names a goodwill aim for at least two players and the
  act that serves it, and sends at least 3 unprompted messages a game that are not about its own move; never past the
  caps; a muted AI sends that player nothing. Heiko answers "did at least one AI make you want to help it?" yes.
- *In the RC (AM-B5):* all of UBER-AC-B2. A muted AI's card offers stop by WS7's S3-C11 once C9's mute exists; the
  AI's own card offers are keyless in the RC (DealPort null).

**G-B3 (C) · Each AI influences other players to help its strategy: it knows what it needs from whom, asks, offers
and persuades.** `[handoff]` *After the RC (AM-B5).*
- **Today** `[review-only]`: no AI asks anything of anyone; spec A's strategy names stances ('ally' | 'neutral' |
  'rival' | 'target', `packages/engine/src/playbook.ts::Strategy`) but nothing turns a stance into a request.
  verified_by: read.
- **Value** `[review-only]`: the AIs play the social game Heiko says wins M.U.L.E.: "keep off my Crystite", "sell me
  food, I'll vote your way".
- **UBER-AC-B3:** a paired tournament, the same seeds and seats, Smart AIs with social reasoning on against the same AIs
  with it off: the social side finishes higher on average worth across the games; every request an AI made is in its
  recorded reasoning beside the strategy item it serves.

**G-B4 (D) · Each AI gathers allies for the policy it wants: tax and the offices' choices.** `[handoff]` *After the RC
(AM-B5), except the vote seam C12, which ships in the RC.*
- **Today** `[review-only]`: an AI votes and, as Governor, sets the tax from its own numbers alone
  (`packages/ai/src/hands/vote.ts::VoteHand`); it never asks anyone to vote with it. Candidates' tax promises exist
  (`packages/engine/src/types.ts::TaxPromise`, WS7 RULE-10). verified_by: read.
- **Value** `[review-only]`: tax and elections become things the table negotiates, with or without humans.
- **UBER-AC-B4:** in a game where an AI's strategy wants the tax moved, before the ballot it asks at least one player to
  back the candidate whose promise serves it, with a reason; the record shows each AI's vote, and its recorded
  reasoning says why it voted that way, including any deal it was offered.

**G-B5 (E) · Each AI campaigns for Governor or Sheriff when office serves it.** `[handoff]` *After the RC (AM-B5).*
- **Today** `[review-only]`: an AI runs by a keyless rule (`VoteHand`, `packages/engine/src/politics.ts::canRun`); it
  never campaigns. Only the Governor is elected until WS7's slice 4 (`POLITICS.offices`). verified_by: read.
- **Value** `[review-only]`: elections are contests between personalities, not dice.
- **UBER-AC-B5:** in the paired tournament of UBER-AC-B3, social AIs win office more often than the same AIs with social
  reasoning off; in every game, an AI that runs sends a campaign message (its promise and why) before the ballot.

**Non-goals** `[review-only]`: spec A's strategy and playbook mechanics (B v2 adds the social part of the AI's
reasoning; it does not redo the playbook); WS7's deal cards, their keep/break rules and the reputation score (used,
never rebuilt); WS6's screens, including the mute control's design; anything of value changing hands through a message
(WS7 HC-3); lying about game facts or rules; storing chat text in the game record (WS3's non-goal); memory across
games; voice; bring-your-own-key.

**Rough cost** `[review-only]`: about 6 PRs (B-1 to B-6), after spec A's PR-1. Money, measured by S-B1 (ledger
`apps/server/data/social-spike-ledger-2026-10-29.jsonl`, $0.05704, 15 of 15 valid): option (1) is $0.236 a seat-game
($0.102 of it spec A's own calls), $0.95 a game at 4 AI seats; at 5 seats ($1.18 uncapped) RULE-A5 moves late calls to
Haiku and the table stays within $1 (RULE-B5). Thin baseline: about 3 PRs, $0.83 at 4 AI seats (§0.1).

## §0.1 · Decision Record `[review-only]`
- **Chosen (B):** Claude reasons about the table once a month inside spec A's strategy call (relationships, aims,
  stances, politics, up to 3 messages), recorded as playbook edits and notes; whispers get a capped in-phase reply,
  words only; AIs read each other's messages at their next monthly call; mute on Heiko's approved mock; courting with
  WS7's cards when they land. Sonnet for both calls (option 1). About 6 PRs.
- **Thin baseline (A):** the monthly folded reasoning only, no in-phase replies. About 3 PRs, $0.83 at 4 AI seats.
  **Loses because** a player who whispers an AI waits up to a month for a real answer (spec A asks at upkeep for the
  next month, `C4`): influence (G-B3) and pre-ballot deals (G-B4) need an answer inside the phase, and G-B2's
  "make you want to help it" fails on silence.
- **Larger, rejected (C):** a conversational agent per AI, a social call every phase, multi-turn negotiation. About 7+
  PRs; about $0.5 a seat on Sonnet, over $1 at 3 or more AI seats. Rejected on budget, and spam is its default failure.

## §0.2 · Constraints `[handoff]`
```
HC-B1  An AI may bluff about its OWN intentions, in character; WS7's keep/break reputation is what catches it. It never
       states a false game fact or rule: every price, holding, owner, score or rule a message declares matches the
       public state when it is sent, and every number in the text is a declared fact; a message that fails is dropped,
       never sent.                                                               source: Heiko, 29 Oct · fatal
HC-B2  A player can mute an AI, by Heiko's approved mock (ws6-ux 29b792c2, mute.html): the AI's seat in the rail is the
       switch; a muted AI sends that player no whispers and no card offers and its public lines are hidden on that
       phone; the host's mute does not clear the TV; an offer already on the phone stays until Ready.
                                                                                 source: Heiko, 29 Oct · fatal
HC-B3  An AI action comes only from public state, the record's notices, WS7's card rules, or Claude's RECORDED
       reasoning (a writer reply the record replays). Claude's recorded reasoning may read chat, on two conditions
       (WS3, 29 Oct): (i) whether a recorded call opens, and in which step, never depends on chat text: it opens at a
       phase change, upkeep, a notice, a state condition, or (with WS3's AM-4) a `heard` step that carries who spoke
       to whom and no words; (ii) everything the call changes in play flows through its recorded reply. Keyless or
       unrecorded logic never reads chat, a talker reply, chat counters or a talk spend. An unrecorded whisper reply
       (B-2) is words only.                                     source: PM; WS3's answer, 29 Oct · fatal
HC-B4  All AI seats of a game together stay within BRAIN.gameBudgetUsd; at 5 AI seats the total is tested to stay at
       or below it (RULE-B5). A reply never takes the money a seat needs for its next strategy call (RULE-B3).
                                                                                 source: Heiko via PM, 29 Oct · fatal
HC-B5  Only public information and what was said TO the AI reach its prompts: never another seat's goods or
       unanalysed ground; a whisper between two other players never reaches it. packages/ai stays pure.
                                                                                 source: spec A HC-3, HC-6 · fatal
HC-B6  Messages carry nothing of value and no card; a card moves only through WS7's card intent (WS7 HC-3).
                                                                                 source: WS7 spec · fatal
HC-B7  Every computer seat's chat bubble, whisper and deal card carries a quiet "· AI" mark, the same mark the Talk
       desk list already shows (apps/web/src/phone/parts.tsx:168), on every phone and on the TV. WS6 styles it and
       builds the phone side, WS4 the TV side; WS2's lines carry nothing new (the view already knows the seat is AI).
                                                                    source: Heiko, 7 Nov (AM-B5) · fatal
```

## §1 · Solution Design `[handoff]`

```
C1 · MODIFIED · the strategy brief gains the social section
today        the land brief carries the public board, prices, the engine's plans, the draft, the persona card and the
             quoted table talk (packages/ai/src/llm/brief.ts::landBrief, on ws2-a-pr1-land @ a970975; talk capped by
             BRAIN.talkLines)   verified_by: read
tomorrow     MUST add a social section: per other player (AIs included) their public position, C2's relationship
             facts, the AI's last recorded standing and aims for them; the politics (offices, tax, next election,
             candidates' promises, reputation once WS7 moves it); the heard lines addressed to the AI or the table
             (BRAIN.social.heardLines); and the ask "where you stand with each, what you want from each, how you win
             them, and up to 3 messages now". Section order fixed, each part capped by a BRAIN value (spec A's T-AC-A2
             rule).
seam         packages/ai/src/llm/brief.ts::landBrief (one more section, not a second brief)
reuse        S-B1's SOCIAL section (apps/server/src/brain/social-spike.ts on ws2-social-spike, PR #188), measured at
             about 1k input tokens; spec A's tableTalkBlock for the quoted lines.
senior       junior would: a second brief for social calls · senior does: one brief, cached up to the social section,
             so the folded call pays only the social tokens (measured +$0.009 a month on Sonnet)
mechanism    in_place
pin          T-AC-A2 (fixed order, public facts only) extended, never loosened
depends_on   spec A PR-1 (the brief); C2

C2 · ADDED · relationship memory from public facts
today        none: the AI keeps the last 6 quoted lines (packages/ai/src/brain.ts::hear)   verified_by: read
tomorrow     MUST keep, per (AI, player), the counted public facts between them: trades with or against it (price, qty),
             plots it wanted that they took, sales between them, votes once public, promises in candidacies, and WS7's
             pacts kept or broken; MUST be a pure function of the record's notices and the public state, so a replay
             rebuilds it and nothing is saved.
seam         packages/ai/src/social/memory.ts (new)
reuse        searched packages/ai/src and packages/engine/src for "relationship|rivals|memory": hits are
             packages/ai/src/strategist.ts (a local `rivals` list sorted by worth, no per-player memory),
             packages/ai/src/hands/auction.ts (no memory), and the nearest,
             packages/engine/src/playbook.ts::PhaseOutcome (its `rivals` block: claims and trades per rival), a type with
             no producer yet (spec A PR-4); memory reads WS3's notices (packages/engine/src/record.ts::NoticeEntry:
             claim, declare, trade, sale) directly, and PhaseOutcome's producer may later read memory, not the reverse.
senior       junior would: a free-text notebook the model writes and the game keeps · senior does: counted public facts,
             rebuilt on replay; Claude's own notes live in the recorded playbook (C3), never in memory
mechanism    sprout
depends_on   WS3's notices (data, on feat/strategist)

C3 · MODIFIED · the writer's reply carries the social reasoning
today        the reply schema offers strategy fields (kind, moneyMaker, monopolyTarget, cashFloor, reason), land-grant
             edits and one line (packages/ai/src/llm/writer.ts::replySchema); the reply the record keeps is
             RecordedWrite { strategy?, edits, line, cause? } (packages/engine/src/record.ts::RecordedWrite, frozen)
             verified_by: read
tomorrow     MUST let the reply set `stances` per player and `rivalReads` (Claude's standing and aims per player, short
             notes; nothing plays from free text) as edits to the playbook, recorded through RecordedWrite.edits with no
             change to the record type; MUST carry up to BRAIN.social.messagesPerMonth messages
             { to: player | 'table', purpose, text, facts[] } BESIDE the recorded reply (as `refused` is), never inside
             it, so chat text never enters the record; MUST carry the politics edits of C6 when C6 lands.
seam         packages/ai/src/llm/writer.ts::replySchema and ::writeReply
reuse        the existing edits path (WS1's validatePlan clamps every edit) and RecordedWrite as frozen; S-B1's social
             schema (relationships, aims, messages, campaign) mapped onto stances, rivalReads and messages.
senior       junior would: a new recorded `social` field (a record amendment for three lanes) · senior does: what plays
             is an edit, what is noted is a playbook note, what is said is unrecorded output; the frozen record holds
             all of it that replay needs
mechanism    in_place
pin          T-AC-A5 and the writer's cause-code tests unchanged
depends_on   spec A PR-1 (the writer); WS1's validatePlan accepts /strategy/stances and /rivalReads edits (contract)

C4 · ADDED · messages go out: caps, the fact guard, delivery
today        the brain speaks only from a decision record, one public line a phase (apps/server/src/brain/chat.ts::
             chatter, wired in apps/server/src/mule-game.ts by `this.brain.chatter`)   verified_by: read
tomorrow     MUST deliver each message of an accepted writer reply by RULE-B1 and RULE-B2: through `ctx.say(from, text,
             to)`, whispers included, within the caps and the mute, after the fact guard; a message that would arrive
             after its month's planning ends is dropped.
seam         apps/server/src/brain/playbooks.ts (spec A C4, new there) right after the strategy reply takes effect;
             packages/ai/src/social/facts.ts (new) for the guard
reuse        the room's `GameContext.say` takes a `to` (packages/tabletop/src/room.ts); S-B1's judge for the message
             shape; RULE-B2's checks read the same public state spec A's brief reads.
senior       junior would: trust the model's prose and send all it wrote · senior does: declared facts checked at send
             time against public state, numbers must be declared, caps per month and per addressee in config
mechanism    sprout
depends_on   C3; spec A Task 1.4b (playbooks.ts)

C5 · MODIFIED · AIs hear each other
today        the room hands a player's chat to the game's `heard`, which passes it to the AI seats it reaches
             (apps/server/src/mule-game.ts::heard); a line an AI posts through `ctx.say` never reaches `heard`
             (packages/tabletop/src/room.ts, `say`'s contract), so no AI ever hears another   verified_by: read
tomorrow     MUST hand each line an AI sends (C4 or C7) to the other AI seats it reaches, exactly as `heard` does for a
             player's line: a whisper only to its addressee, a table line to all others.
seam         apps/server/src/mule-game.ts, beside `heard` (WS3's file: one named edit WS3 reviews)
reuse        mule-game.ts::heard's own delivery loop
senior       junior would: change the room so `say` calls `heard` (every lane's games) · senior does: MuleGame forwards
             its own AI lines; the room's contract is untouched
mechanism    in_place + one named edit
pin          brain-table.test.ts's heard cases; a whisper between two humans still never reaches the game
depends_on   C4
AM-B5        today, re-read 7 Nov: `MuleGame.heard` routes by `to` but hands the seat `{ from, text }` only
             (apps/server/src/mule-game.ts::MuleGame.heard; packages/ai/src/decider.ts::TableTalk), so an AI cannot
             tell a whisper to it from a table line. tomorrow adds: MUST hand the seat whether the line was a whisper
             to it (TableTalk gains `to?: 'me'`, WS2's type; heard passes it, one more WS3 named edit in the same place
             as C5's), so C1 quotes whispers apart and C7 knows what it answers. In the RC.

C6 · ADDED · a politics play: run, promise, vote and tax from the recorded reasoning (G-B4, G-B5)
today        an AI runs, votes and sets the tax by the keyless VoteHand from observe() (packages/ai/src/hands/
             vote.ts::VoteHand, WS7's); playbook v1 has no politics section (packages/engine/src/playbook.ts::Playbook)
             verified_by: read
tomorrow     MUST add an optional `politics` section to the playbook (run: office | null with its TaxPromise; votes per
             office; the Governor's tax target), editable by the writer and clamped by validatePlan; MUST have VoteHand
             play it when present and fall back to its keyless rule when absent; MUST send a campaign message before
             the ballot when the play runs.
seam         packages/engine/src/playbook.ts::Playbook (WS1's, additive optional field: a contract change WS1, WS3 and
             WS7 agree) and packages/ai/src/hands/vote.ts::VoteHand (WS7's, named edit WS7 reviews)
reuse        VoteHand's stage timing and nextTax bounds; WS7's canRun and taxBounds for the validator's clamps; the
             election stages (packages/engine/src/types.ts::Election)
senior       junior would: let the reply cast the vote directly · senior does: the vote is a playbook value the hand
             plays at its stage, so it is recorded, clamped, replayed, and a phase never waits for a model
mechanism    sprout (the section) + in_place (VoteHand reads it)
depends_on   C3; WS1 validatePlan clamps for /politics (contract); WS7's OK on VoteHand
AM-B5        after the RC, except its votes part, which C12 ships in the RC as the minimal vote seam. Running, the
             promise, campaigning and the Governor's tax target stay here.

C7 · ADDED · whisper replies: an answer inside the phase, words only
today        none: a whisper to an AI is quoted in its next decision only (packages/ai/src/brain.ts::hear)
             verified_by: read
tomorrow     MUST answer a whisper addressed to the AI within the phase, by RULE-B3, with one short call through
             `BrainService.talkerFor(seat)` on BRAIN.social.replyModel (Sonnet 5.5; Haiku by RULE-A5), the reply checked
             by the fact guard; MUST change no state and no playbook (HC-B3); MUST never throw (no reply, refusal,
             timeout → a persona line from packages/ai/src/personas.ts::lines, or nothing).
             With WS3's AM-4 (a `heard` step {from, to}, no text): MUST let a reply be a recorded writer call (kind
             'playbook', RecordedWrite unchanged, its words beside the reply as C3's messages are) that opens in that
             step, whose edits (a stance, a note, a politics value) take effect through validatePlan; whether it opens
             reads only from, to, timing, caps and state, never the words (HC-B3 (i)). It opens only on a
             room-delivered `heard` step (a human's line); a line an AI sent, forwarded inside the game by C5, opens
             no recorded call: its words came from an unrecorded part of a reply, so a replay never regenerates it.
seam         packages/ai/src/social/talker.ts (new) and apps/server/src/brain/index.ts::BrainService (talkerFor)
reuse        spec A's writer port shape (writerFor: never throws, wait bound, RULE-A5 inside the port, AM-A14);
             S-B1's reply mode (measured $0.0024 on Sonnet); personas.ts lines for the keyless fallback.
senior       junior would: let the reply also make deals · senior does: words only until WS3 confirms; its money is
             checked by RULE-B3 so a reply never starves a strategy call
mechanism    sprout + in_place (talkerFor)
depends_on   spec A PR-1 (the client and AM-A14's model pick); C2
AM-B5        in the RC, words-only replies and recorded replies both: WS3's `heard` step is on trunk
             (packages/engine/src/record.ts::RecordStep 'heard' {from, to}; apps/server/src/record.ts::Recorder.wrap,
             apps/server/src/replay.ts replays it with ''). A recorded reply's edits may include C12's vote edits, so a
             whisper can change the AI's vote (Heiko, 7 Nov). Spec A's PR-1 has landed (brief.ts, writer.ts on
             ws2-brain), so its depends_on is met.

C8 · MODIFIED · the recorder and the replay pass the talker through (WS3's files, named edits)
today        WS3's recorder wraps deciderFor (apps/server/src/record.ts::Recorder, feat/strategist 5eb6b27) and, on
             ws2-a-pr1-land @ a970975 pending WS3's review, writerFor; the replay answers both from the record
             (apps/server/src/replay.ts)   verified_by: read
tomorrow     record.ts `wrapBrain` passes `talkerFor` through, unrecorded and outside its call numbering; replay.ts
             returns `talkerFor: () => null`.
reuse        wrapBrain's existing per-method wrap
mechanism    in_place (named edits, reviewed by WS3 on the SHA)
atomicity    must ship with C7: a required talkerFor turns both files red until they implement it

C9 · ADDED · mute
today        no mute exists (searched apps/web/src, apps/server/src, packages/tabletop/src, packages/protocol/src for
             "mute": none)   verified_by: none_exists
tomorrow     MUST accept a `mute` intent (§3) through the room's intent path, so the record holds it; MUST stop that AI's
             whispers, replies and card offers to that player and hide its public lines on that phone, per HC-B2.
seam         packages/protocol/src/index.ts::MuleIntent and mule-game.ts's intent handling (WS3's, named edits)
ux           ws6-ux @ 29b792c2, mute.html (approved by Heiko 29 Oct): the seat in the rail is the switch; the Talk desk
             chip second; GRAFT TARGET: WS6's phone rail (WS6 builds it from the mock)
reuse        the room's generic intent path records every intent; mute is one more MuleIntent
mechanism    in_place + named edits
depends_on   WS6's control on the mock (ux)
AM-B5        in the RC. WS7's slice 3 refuses an AI seat's card offer to a player who muted it once this mute exists
             (WS7 slice-3 spec S3-C11), so C9 needs no card code of its own.

C10 · ADDED · courting with WS7's cards (G-B2, G-B3)
today        no deal cards exist yet (WS7 slice 3 unbuilt; no card, pact or deal type in packages/engine/src,
             packages/ai/src or apps/server/src at feat/strategist 5eb6b27)   verified_by: none_exists
tomorrow     MUST let the writer propose a WS7 card to a player as a playbook planning edit, recorded and clamped, sent
             through WS7's card intent with its message; answering a card is WS7's keyless AI rule (WS7 UBER-AC-3),
             unless the playbook carries Claude's recorded answer.
seam         packages/engine/src/playbook.ts::PlanningPlay (WS1's, additive) and WS7's card API (WS7's to shape)
reuse        WS7's AI answer rule; the planning play's existing `list` pattern
mechanism    sprout
depends_on   WS7 slice 3 (data, not stubbable for its AC); WS6's card screens
AM-B5        after the RC. WS7 froze the port it will use (DealPort { answerFor(card), offersFor(month) }, null → the
             keyless rule; WS7 slice-3 spec, "WS2's port"); in the RC every AI seat answers and offers cards by WS7's
             keyless DealHand (S3-RULE-9), and keeps or breaks a promised vote by S3-RULE-10 (WS7 slice 3, being built
             for the RC; packages/ai/src/hands/deal.ts and engine diplomacy.ts are not on trunk at 7ecddae5). WS6's mock draft:
             docs/specs/2026-11-08-ws2-claude-deal-behaviour-draft.md.

C11 · MODIFIED · the trial measures social play
today        the trial reports per-kind calls, budget and outcome (apps/server/src/brain/trial.ts,
             apps/server/src/brain/trial-report.ts)   verified_by: read
tomorrow     MUST report per game: messages per AI (unprompted, replies, campaign), fact-guard drops, stances changed,
             votes cast by playbook vs keyless, social usd per seat, the game's total against BRAIN.gameBudgetUsd, and
             the fallback share; MUST run a paired tournament (social on / off, same seeds) for UBER-AC-B3 and B5.
seam         apps/server/src/brain/trial.ts and trial-report.ts
mechanism    in_place
depends_on   C1-C7
AM-B5        after the RC (the proof).

C12 · ADDED · the vote seam: Claude's recorded vote reaches the ballot (AM-B5, RC part of C6)
today        an AI seat votes in the election and on the council's law by WS7's keyless VoteHand, constructed with
             (mind, rng) only (packages/ai/src/hands/vote.ts::VoteHand, its private `choose` and `lawVote`; wired in
             apps/server/src/mule-game.ts::MuleGame.start, `voteHands`); playbook v1 has no politics field
             (packages/engine/src/playbook.ts::Playbook)   verified_by: read
tomorrow     MUST let a Smart or Claude Code seat's recorded reasoning set its vote: the writer's monthly reply (C3) and
             a recorded whisper reply (C7) may edit `/politics/votes/<office>` and `/politics/law`; at each ballot
             VoteHand asks the seat's VotePort (§3) first and, on null, plays its keyless rule exactly as today; WS7's
             keep-or-break of a promised vote (S3-RULE-10) then runs with the port's choice as "own".
logic        → §2 RULE-B6 · evaluated at each ballot VoteHand casts · inputs bind from the seat's playbook in effect ·
             writes nothing but the vote intent VoteHand already sends
seam         packages/ai/src/hands/vote.ts::VoteHand (WS7: an optional third constructor argument, read in `choose`'s
             caller `vote` and in `lawVote`); packages/engine/src/playbook.ts::Playbook (WS1's file; WS3 writes the optional field as a named edit);
             apps/server/src/mule-game.ts::MuleGame.start (WS3: passes the one port to the seat's VoteHand and DealHand)
senior       junior would: let the reply cast the vote intent itself, or add a second vote path beside VoteHand ·
             senior does: one port in DealPort's style, so the vote stays where WS7's timing, ballot checks and
             keep/break already are; a recorded value replays, a phase never waits for a model, null is today's game
mechanism    extract_interface (the port) + in_place (VoteHand reads it)
call sites   VoteHand.vote (election ballot, per contested office) and VoteHand.lawVote (council ballot); the slice-3
             ownVote(obs, mind, ballot) WS7 is extracting reads the same port, so DealHand's keyless offer of its own
             vote promises what the seat will cast (WS7's call)
pin          null port → VoteHand's intents and draws identical to today (the election and council streams never
             move, slice 2a HC-41); ws7's vote tests unchanged
depends_on   C3 (the writer may edit the field); WS1's clamps (contract, stubbable); WS7's port (contract, stubbable)
atomicity    none forced: the Playbook field lands first (WS3's #683, a named edit in WS1's engine playbook.ts), WS9's
             validatorFor clamps after it on that SHA; until both are in, an edit to `/politics/...` is refused "no such
             field" and the seat votes by the keyless rule (RULE-B6 row 1). The VoteHand argument ships with its null pin
             (WS7). WS2's votePortFor and the writer's `/politics/...` edits merge only after the clamps

C13 · ADDED · the Claude Code seat plays the social core too (AM-B5; separable: may move after the RC alone)
today        a Claude Code seat (a player's own Claude Code over MCP) answers the same land and phase asks a Smart seat's
             writer gets, through three tools: join, wait_for_my_turn, submit_plan (apps/server/src/claude-seat/mcp.ts;
             ClaudeSeatWriter, apps/server/src/claude-seat/writer.ts); a whisper to it is only quoted in its next ask
             verified_by: read
tomorrow     MUST give the Claude Code seat C1's social section in its asks (it reads the same brief, so this comes with
             C1), MUST let its reply carry C3's messages and C12's vote edits, and MUST offer ONE more tool,
             `answer_whisper(code, whisper_id, text, edits?)`, with wait_for_my_turn returning an open whisper as
             `{ kind: 'whisper', whisper_id, from, text, ms_left }` within the seat's hold (BRAIN.claudeSeat.holdMs,
             45 s); the answer passes RULE-B3's caps and RULE-B2's fact guard like a Smart seat's, and its edits open as
             a recorded reply on the heard step (C7, HC-B3).
seam         apps/server/src/claude-seat/mcp.ts (the tool list), writer.ts (the open whisper beside the open ask)
senior       junior would: a second chat channel for the Claude Code seat · senior does: the same heard step, caps and
             guard as C7, one tool, and the seat code on every call as the other tools
mechanism    sprout (the tool) + in_place (the ask carries the section)
depends_on   C1, C3, C7, C12
atomicity    none: if it threatens the RC date it moves after the RC on its own (PM ruling, 7 Nov)
```

## §2 · The Logic `[handoff]`

```
RULE-B1 · Which messages of a writer reply are sent                 shape: decision table, per message, in order
inputs   muted: the addressee muted this AI (true | false) · guard: RULE-B2 passes (true | false) · sentMonth: this
         AI's messages sent this month · toPlayerMonth: its whispers to that addressee this month · open: the month's
         planning has not ended (true | false)
first match wins
  1  open = false                                   drop (stale)
  2  muted                                          drop for that player (a table line is still sent; that phone hides it)
  3  guard = false                                  drop; ledger cause 'fact_mismatch' (a code, never the text)
  4  sentMonth >= BRAIN.social.messagesPerMonth     drop
  5  to a player and toPlayerMonth >= BRAIN.social.whispersPerPlayerMonth   drop
  6  otherwise                                      send by ctx.say(from, text, to); C5 hands it to the AIs it reaches
unknown  an addressee no longer at the table → drop; a message with an empty text → drop
examples → §6: 3 messages, all pass → 3 sent · a fourth → dropped · a whisper to a muted player → none · a false
         price → dropped · a bluff about its own vote → sent
```

```
RULE-B2 · The fact guard (C4 and C7, at send time, against the public state)     shape: checks, all must pass
  1  every declared fact is true: price = the store's posted price or a public trade's price; owner = the tile's
     owner; score = the public worth; holding = the AI's own stock; rule = an action in packages/ai/src/actions.ts::
     AiAction (WS1's MOVES when it lands)
  2  every number in the text equals a declared fact's value, or names a month, a plot coordinate or a count of
     the AI's own intentions
  fail → drop; pass → send. A bluff about its own intentions declares no fact and passes (HC-B1)
unknown  a reply with no facts and no numbers passes (accepted risk R-B1)
```

```
RULE-B3 · When an AI answers a whisper (C7)                          shape: decision table, per whisper
inputs   addressed: the whisper is to this AI (true | false) · muted · repliesPhase: replies to that player this phase ·
         repliesGame: this AI's replies this game · reserve: the seat's share left minus the reply's worst case
         still covers Haiku's worst case for one strategy call (true | false) · open: the phase has not ended
first match wins
  1  addressed = false or muted                      no reply
  2  repliesPhase >= BRAIN.social.repliesPerPlayerPhase or repliesGame >= BRAIN.social.repliesPerGame   no reply
  3  reserve = false                                 a persona line (C7's fallback), no call
  4  otherwise                                       one talker call, model by RULE-A5, wait min(BRAIN.social.replyWaitMs,
                                                     time left in the phase); late → dropped
never    a reply changes state, a playbook or a stance (HC-B3)
examples → §6: "will you vote for me?" → an answer in the phase · a third whisper in a phase → none · share
         nearly spent → a persona line · muted → none
```

```
RULE-B4 · How VoteHand plays the politics section (C6)               shape: decision table, per election stage
inputs   play: the playbook in effect has `politics` (true | false) · stage: nominate | ballot | reveal | over ·
         legal: the play's value is allowed now (canRun, a candidate on the ballot, taxBounds)
first match wins
  1  play = false                                   VoteHand's keyless rule, as today (existing, pinned)
  2  legal = false                                  VoteHand's keyless rule for this stage; ledger 'politics_clamped'
  3  stage = nominate                               run as the play says (office and promise), or not
  4  stage = ballot                                 vote as the play says, per office
  5  after the election, the AI is Governor          set the tax toward the play's target within nextTax's step
unknown  a vote for a candidate who withdrew → row 2; a play written before the candidacies are known names no
         candidate → row 2 for the ballot
```

```
RULE-B5 · The game's budget at 5 AI seats                            shape: invariant + example
  At any number of Smart seats, the sum of every seat's counted spend never exceeds BRAIN.gameBudgetUsd: each call is
  allowed only within the seat's share and the table's budget left (createBudget's table check, existing), and
  RULE-A5 (inside the writer port, AM-A14) and RULE-B3 pick the cheaper model or no call before either would pass.
example  5 Smart seats, a fake model billing at S-B1's measured option-(1) prices for 12 months: the total stays at or
         below $1.00; Sonnet early, Haiku late; no call refused for lack of a reply that a phase waited on (none waits).
```

```
RULE-B6 · Which vote an AI casts (C12, AM-B5)                        shape: decision table, per ballot VoteHand casts
inputs   port: the seat has a VotePort (Smart or Claude Code seat; Classic → none) · said: the port's answer for this
         ballot: a candidate on it / yes / no, or null · promise: the seat holds an active vote card on this ballot
         (WS7 slice 3; keyless in the RC)
first match wins
  0  the seat runs for this office                  own = its own candidacy; the port is not asked (WS7 cond. 1)
  1  port absent or said = null                     own = VoteHand's keyless choice, as today (existing, pinned)
  2  said names someone not in `candidates`         own = the keyless choice, as if null; never an invalid ballot,
                                                    never a throw (WS7 cond. 2); ledger 'vote_clamped'
  3  otherwise                                      own = said
then     WS7's S3-RULE-10 runs with this own: no promise → vote own; a promise → keep or break by its rows
two reads the same port answers twice: WS7's `ownVote(obs, mind, ballot, port?)` at deal-offer time (slice 3 AM-5,
         S3-PR-4) and VoteHand at the ballot. mule-game passes the SAME VotePort to the seat's VoteHand and its
         DealHand (WS3). Both read recorded state only (Playbook.politics, recorded replies), so a replay gives both
         the same answers (WS7 cond. 3); an answer that changed between the two reads is itself recorded, and is the
         persuasion working: the seat keeps or breaks its card per S3-RULE-10
unknown  null means "Claude has recorded no vote for this ballot", not "abstain": the keyless rule votes. A vote
         recorded for an earlier ballot never carries over (the port answers per ballot, from the playbook in effect).
timing   the port is read when VoteHand casts (after its seeded pause, POLITICS.ai.actMs); a recorded reply whose edit
         takes effect after the seat cast changes nothing for that ballot (the ballot is cast once)
written  (PM ruling (a), 7 Nov, from WS9's #691 AM-37: a vote in Playbook.politics is accepted only once its candidate has
         declared) the `/politics/votes` edits come only from a reply adopted IN THE ELECTION MONTH AFTER ITS
         DECLARATIONS: that month's planning-start ask, or a recorded whisper reply opened on a heard step during
         announce (AM-B4). The ask shows the declared candidates. No ballot ask and no table wait: an AI acts 0.8-2.5 s
         into the ballot (POLITICS.ai.actMs), shorter than any write, and HC-3 allows Claude one table wait only (the
         first good's side pick). A candidate who declares later than that reply cannot get Claude's vote: that office
         falls to row 1 (keyless). Scope note: no candidacy opens once an election month's planning has started except in
         month 1 (WS7, 7 Nov: politics.ts `candidacyClosed` is true for announce when month > 1; rulebook
         colony-and-politics.html:239), so this misses only month 1's election in the RC, plus a snap election's month
         after the RC (S5-RULE-9). If
         playtests show Claude's votes landing keyless too often, the fix is a ballot ask with a capped Claude wait,
         a second table wait that is Heiko's call (not asked now)
never    the port's answer comes from chat text (HC-B3): it is a value of the recorded playbook, set by the monthly
         reply or by a recorded reply opened on a heard step
examples → §6: Claude recorded "governor: Kai", Kai on the ballot → votes Kai · recorded "Brix", Brix withdrew →
         keyless · no record → keyless, identical draws · a whisper "vote for me" answered before the ballot with a
         recorded edit → that vote · answered after the seat cast → no change
```

## §3 · Contracts & Data Models `[handoff]`
- **Writer reply** (MODIFIED, WS2, C3): `{ reply: RecordedWrite; refused; messages: Message[] }`;
  `Message = { to: PlayerId | 'table'; purpose: string; text: string; facts: Fact[] }`;
  `Fact = { price: Good; value } | { owner: PlotIndex; player } | { score: PlayerId; value } | { holding: Good; value }
  | { rule: AiAction['type'] }`. `messages` is never recorded. Non-breaking for WS3: RecordedWrite is unchanged.
- **Playbook edits** (MODIFIED, WS1's validatePlan, C3, C6): `/strategy/stances/<player>`, `/rivalReads/<player>` and,
  with C6, `/politics/...`. Each is clamped or refused by validatePlan, as every edit is.
- **`Playbook.politics?: PoliticsPlay`** (ADDED, additive; engine playbook.ts is WS1's, WS3 writes the type as a named edit with WS1's OK by SHA; WS9's clamps; WS1 OK'd the
  shape, AM-B5; the ONE politics field: RC carries `votes` and `law` for C12, WS9's later politics part extends it; C6):
  `{ run: { office: Office; promise?: TaxPromise } | null; votes: Partial<Record<Office, PlayerId | null>>;
  taxTarget?: number }`. Playbook stays `v: 1` (optional field); a playbook without it plays as today.
- **`PlanningPlay.offers?`** (ADDED, additive, WS1's types; C10): the card proposals, shape WS7's card intent's.
- **`BrainService.talkerFor(seat): Talker | null`** (ADDED, WS2, C7): `talk(whisper, ask) → Promise<{ text: string |
  null; cause?: string }>`, never throws; null for Classic, with the key unset, and in the replay's brain.
- **`mute` intent** (ADDED, protocol, C9): `{ type: 'mute'; seat: PlayerId; muted: boolean }` in
  `packages/protocol/src/index.ts::MuleIntent`; recorded as an intent by WS3's recorder.
- **WS3's record** (consumed): writer replies replay as recorded (AM-1); chat text is not stored. The playbook's new
  optional fields (`politics`, `offers`) reach the record only inside recorded playbooks (PlaybookEntry), additively.
- **`heard` record event** (ADDED, WS3's AM-4, with WS1, WS2 and WS3 OKs; C7's recorded replies): a whisper or table
  line reaching an AI seat opens a step carrying `{ from, to }`, never the words; the replay calls
  `game.heard(from, '', to)`. RULE-5 restated: the record holds who spoke to whom, never what.
- **WS7's cards and reputation** (consumed, slice 3); **WS6's mute control and card screens** (consumed).
- **`VotePort`** (ADDED, AM-B5, C12; WS7's type in `packages/ai/src/hands/vote.ts`, in the style of WS7's frozen
  DealPort; non-breaking: VoteHand's constructor gains an optional third argument):
  `interface VotePort { electionVote(office: Office, candidates: readonly PlayerId[]): PlayerId | null;
  lawVote(proposal: LawProposal): boolean | null }`; null → the keyless rule (RULE-B6). WS2 supplies it
  (`votePortFor(seat)`, ADDED, new file `packages/ai/src/social/votes.ts`) from the seat's playbook in effect.
- **`Playbook.politics?`** (MODIFIED by AM-B5: the RC carries only its votes; ADDED, additive, WS1's types):
  `{ votes?: Partial<Record<Office, PlayerId>>; law?: boolean }` in the RC; C6 adds `run` and `taxTarget` after the RC.
  Edits `/politics/votes/<office>` and `/politics/law`, clamped by WS1's validator (`packages/ai/src/playbook/
  validate.ts::validatorFor`): an office or a candidate that does not exist → refused. Playbook stays `v: 1`.
- **`TableTalk.to?: 'me'`** (ADDED, AM-B5, C5; WS2's type in `packages/ai/src/decider.ts`): set when the line was a
  whisper to this seat.
- **Claude Code seat tool `answer_whisper`** (ADDED, AM-B5, C13): `{ code, whisper_id, text, edits? }` →
  `{ kind: 'accepted' | 'unusable' | 'too_late' | ... }` as submit_plan's results; wait_for_my_turn's result gains
  `{ kind: 'whisper', whisper_id, from, text, ms_left }`. The seat code is checked on every call (claude-seat RULE-2).

## §4 · Failure & Ops `[handoff]`
| Question | Answer |
|---|---|
| Model unavailable, slow, refuses | the strategy call fails as spec A says (the engine playbook plays, no messages that month); a reply falls back to a persona line or nothing (C4, C7) |
| Retries | none; the next month's call reasons again |
| Idempotency | one strategy reply per seat a month; messages sent once, at take-effect; a late reply sends nothing (RULE-B1 row 1) |
| Races | a reply racing its phase's end: the end wins; a mute racing a send: the mute wins at delivery (C9); a vote stage closing before the playbook takes effect: VoteHand's keyless rule plays (RULE-B4 row 1) |
| When broken | play goes on: the engine playbook and VoteHand's keyless rule play every phase; a game with the key unset is today's game |
| Operator view | ledger kinds strategy, playbook and talk with model, usd, outcome, 'fallback' and 'fact_mismatch'; the trial report's social rows (C11) |

## §5 · Delivery
Code-only; no existing state to reach. The mute starts unset for every player.

## §6 · Acceptance Criteria `[handoff]`
| id | Given / When / Then | observed_at | negative case | changes |
|---|---|---|---|---|
| B-AC-B1 (G-B1, G-B2) | Given one human and three Smart AIs on a fake model / When a full game plays / Then each month each AI's recorded playbook carries a standing and an aim for every other player, and each AI sends at least 3 unprompted messages a game naming another player, never past the caps. | the recorded playbooks; the delivered chat | the key unset → no social reasoning, today's game | C1 C2 C3 C4 |
| B-AC-B2 (G-B3) | Given an AI whose strategy needs a good another player sells / When its monthly reasoning runs / Then it whispers that player a request naming the strategy item, and its recorded aim names the same item. | delivered chat; recorded rivalReads | a player its strategy needs nothing from → no request | C1 C3 C4 |
| B-AC-B3 (G-B4, G-B5) | Given an election month and an AI whose play runs for Governor / When nominate and ballot open / Then it runs with its promise, sends a campaign message before the ballot, and each AI votes as its recorded play says. | the election's candidacies and tallies; delivered chat; the record | an AI with no politics play votes by VoteHand's keyless rule | C6 C4 |
| B-AC-B4 (HC-B2) | Given a human mutes an AI from the rail switch / When the game goes on / Then that AI's whispers, replies and card offers stop on that phone and its public lines are hidden there; the TV and other phones still show its public lines. | the player's phone (browser, front to back) and server delivery | the host's mute does not clear the TV | C9 |
| B-AC-B5 (G-B1, AI to AI) | Given two Smart AIs / When AI 1 whispers AI 2 a request / Then AI 2's next monthly brief quotes it, and a whisper between two humans never reaches either AI. | AI 2's next brief | the humans' whisper → absent | C5 |
| B-AC-B6 (G-B2) | Given a human whispers an AI "will you vote for me?" / When the phase is open / Then the AI answers in the same phase, in character, and nothing in the game state or playbooks changes. | delivered chat; state and playbook hashes before and after | a third whisper in the phase → no reply | C7 |
| B-AC-B7 (G-B2, G-B3) | Given an AI whose recorded playbook proposes a pact card to a player / When planning opens / Then the card reaches that player's phone through WS7's card intent with its message, one tap accepts it, both phones list the pact, and the replay reproduces it. | both phones; WS7's card list; WS3's replay | a muted AI's offer → not sent; no proposal in the playbook → no card | C10 |
| T-AC-B1 (B-AC-B1) | RULE-B1 rows 1-6 with its examples. | messages sent or dropped | — | C4 |
| T-AC-B2 (HC-B1) | RULE-B2: a false declared price → dropped; a number with no declared fact → dropped; "I'll vote for you" → sent; a prose-only false claim → sent (R-B1, pinned). | sent or dropped; ledger cause | a true declared price → sent | C4 C7 |
| T-AC-B3 (HC-B3) | A game with social reasoning and replies, replayed from its record with the key unset, reproduces every playbook, vote and score; a reply's call changes no state hash. | WS3's replay result; state hashes | — | C3 C7 C8 |
| T-AC-B8 (HC-B3) | A game with recorded replies, replayed with every heard text blanked, comes out identical: every playbook, vote and score. | WS3's replay result | a reply call that opens on a word in the text → red; an AI's whisper to another AI opens no recorded call | C7 C8 |
| T-AC-B4 (HC-B4) | RULE-B5's example: 5 Smart seats, fake model at S-B1's option-(1) prices, 12 months: the total ≤ BRAIN.gameBudgetUsd; late calls on Haiku; RULE-B3's reserve holds. | ledger totals and models | the same at 4 seats → all Sonnet | C7 C11 |
| T-AC-B5 (HC-B5) | No prompt carries another seat's goods or unanalysed ground, or a whisper between two other players. | prompt text | a planted rival stock → red | C1 C2 C7 |
| T-AC-B6 (B-AC-B3) | RULE-B4 rows 1-5; validatePlan clamps an illegal politics edit. | VoteHand's intents; the clamped playbook | no politics play → keyless rule, unchanged | C6 |
| T-AC-B7 (B-AC-B1) | C2 memory is a pure function: the same notices give an equal memory (stableJson); a replay rebuilds it. | memory values | — | C2 |
| B-AC-B8 (G-B2, Heiko 7 Nov; AM-B5) | Given an election month, a human whispers a Smart AI "vote for me, I'll keep taxes low" before the ballot / When the AI's recorded reply sets its Governor vote to that human / Then the AI's ballot names that human, and the replay with every heard text blanked casts the same vote. | the election's ballots (server); WS3's replay | no recorded vote → the keyless choice, draws unchanged; a reply after the AI cast → its vote unchanged | C7 C12 |
| B-AC-B9 (HC-B7) | Given a table with a human and a computer seat / When the computer seat posts a table line and whispers the human / Then both show the "· AI" mark on the human's phone and the table line shows it on the TV; a human's line never does. | the phone and TV (browser, front to back) | a human's whisper → no mark | WS6, WS4 (C4 sends the lines) |
| T-AC-B9 (B-AC-B8) | RULE-B6 rows 1-3 with its examples; a null port gives VoteHand's intents and draws byte-identical to today's on a seeded game. | VoteHand's intents; the election and council streams | a port naming a withdrawn candidate → keyless + 'vote_clamped' | C12 |
| T-AC-B10 (B-AC-B6, C13) | A Claude Code seat whispered by a human gets the whisper from wait_for_my_turn, answers with answer_whisper inside its hold, and the answer reaches the human in the same phase through RULE-B3's caps and RULE-B2's guard; a wrong code is refused (claude-seat RULE-2). | delivered chat; the MCP results | a third whisper in the phase → no whisper result; a false declared price → dropped | C13 C7 |

## §7 · Risks & Spikes `[review-only]`
- **R-B1 (accepted, pinned):** a false claim in prose with no number and no declared fact ("the store is out of
  food") is not caught. Mitigation: the prompt requires every fact declared; T-AC-B2 pins the case.
- **R-B2 · resolved 29 Oct:** WS3 confirmed a recorded writer call that read chat replays, on HC-B3's two
  conditions (AM-B2).
- **R-B3 · the paired tournament costs money.** UBER-AC-B3 and B5 need it: about 8 seeds × 2 arms, roughly $7.6 for
  the social arm at 4 AI seats plus $3.3 for the off arm, about $11. Mitigation: B-6's paid runs go to the PM with the
  cost stated first; a smaller first pass (4 seeds, about $5.5) shows direction before the full run.
- **R-B4 · upstream contracts:** WS3 (writes the playbook's optional `politics` and `offers` in WS1's engine playbook.ts, named edits), WS9
  (validatorFor clamps for stances, rivalReads, politics), WS1 (the shapes' OK; values), WS7 (VoteHand plays the politics section; cards in slice 3), WS6 (the mute control, card
  screens), WS3 (C5's and C9's named edits in mule-game.ts and protocol, C8's in record.ts and replay.ts).
  Mitigation: B-1 needs only WS1's stances/rivalReads clamps; the rest gate later PRs.
- **R-B5 · Haiku late in 5-seat games** gives weaker reasoning in the last months (S-B1: Haiku invents details more
  often and declares more facts, so the guard drops more). Mitigation: RULE-B5's test; the trial reports the fallback
  share; Heiko sees it in the 5-seat playtest.
- **Landmine (memory, "Configurable balance"):** every number here (messagesPerMonth, whispersPerPlayerMonth,
  repliesPerPlayerPhase, repliesPerGame, replyWaitMs, heardLines, the brief's social caps, replyModel) is a named
  BRAIN value, and the settings guard holds it.
- **Spike:** S-B1 done (measured, $0.05704). No further spike; B-6's paid runs are the measurement.

## §8 · Amendments `[review-only]`
- **AM-B1 · 29 Oct · lead, at plan time:** §6 had no AC for C10 (courting with WS7's cards); B-AC-B7 added, lifted
  from v1's card AC and UBER-AC-B2's card part. Goal G-B2/G-B3 unchanged.
- **AM-B2 · 29 Oct · lead, on WS3's answer:** HC-B3's narrowing is confirmed: a recorded writer call whose brief quotes
  chat replays keylessly, provided (i) whether and where it opens never depends on chat text and (ii) every effect
  flows through its recorded reply. HC-B3 rewritten with both; R-B2 resolved; B-1's and B-4's HC-B3 gates are met.
  Goals unchanged.
- **AM-B3 · 29 Oct · lead, on WS3's answer:** WS3 prefers a `heard` step to an AI seat carrying `{ from, to }` and no
  words (its AM-4, needing WS1, WS2 and WS3 OKs), so a whisper reply can itself be a recorded call that acts. C7
  gains recorded replies (B-2b, after B-2's words-only replies); §3 gains the `heard` event; T-AC-B8 (replay with
  blanked heard text is identical) added. Goal G-B3 ("influence") and G-B4 served sooner; no goal changes.
- **AM-B4 · 29 Oct · lead, on reviewing WS3's AM-4 (OK'd at ws3-auctions a25de0c4):** a recorded reply opens only on a
  room-delivered `heard` step; an AI's line forwarded by C5 is never a heard step and opens no recorded call (its words
  are unrecorded, so a replay could not re-open it). AI 2 still reads AI 1's message at its next monthly call
  (B-AC-B5). C7 and T-AC-B8's negative case carry it. Goals unchanged.
- **AM-B5 · 7 Nov · lead, on Heiko's RC split and the PM's rulings: the RC slice.**
  ```
  target    the spec's scope for the first release candidate (18 Nov); §0 G-B3..G-B5 and UBER-AC-B1/B2; §0.2; §1 C5,
            C6, C7, C9, C10, C11 (notes) and new C12, C13; §2 RULE-B6; §3; §6 B-AC-B8, B-AC-B9, T-AC-B9, T-AC-B10; §9
  said      six PRs B-1..B-6 to build all five goals; deals through C10; votes only through C6's politics play
  did       RC = G-B1 and G-B2 through C1-C5, C7 (words-only and recorded replies), C8, C9, plus C12 (the vote seam)
            and C13 (the Claude Code seat; separable). After the RC: G-B3, G-B4 (but C12), G-B5, C6 beyond its votes,
            C10, C11. Deal behaviour is an RC non-goal: in the RC every AI seat answers, offers, keeps and breaks
            cards by WS7's keyless rules (DealPort null). New HC-B7: the "· AI" mark.
  because   Heiko, 7 Nov (SEAMS:2420): "Claude social core: reasoning, whisper replies, vote replies if seam allows,
            mute; after RC: full budget, Claude deal cards + politics from reasoning + social proof". Heiko, 7 Nov
            (via the PM): keep "replies that can change a vote" in the RC (+~2 lane-days) and put a quiet "· AI" mark
            on every computer seat's bubble, whisper and card. PM ruling, 7 Nov: the social core for both seats.
            PM ruling A, 7 Nov: deal behaviour after the RC.
  goal      G-B1, G-B2 met in the RC; G-B3..G-B5 unchanged, delivered after it. No goal added or changed.
  folded    status line; §0 G-B3..G-B5 marked after the RC; UBER-AC-B1/B2 RC notes; §0.2 HC-B7; §1 AM-B5 notes on
            C5, C6, C7, C9, C10, C11; C12, C13 added; §2 RULE-B6; §3 VotePort, Playbook.politics (RC subset),
            TableTalk.to, answer_whisper; §6 four ACs; §9 note; plan PR table marked RC / after RC.
  ```
  **The vote seam (C12) and who builds it.** The smallest shape that keeps HC-B3: Claude's vote is a recorded playbook
  value (`politics.votes`, `politics.law`), and VoteHand asks a port for it at the ballot, in WS7's DealPort style, null
  meaning the keyless rule. Lane split (PM, 7 Nov: WS1 OK'd the shape; owners corrected to the files' owners):
  - **WS3** (about 0.25 day): `Playbook.politics?` with `votes?` and `law?` (packages/engine/src/playbook.ts, WS1's file:
    a named edit with WS1's OK by SHA; additive,
    playbook v1 rule). No new values.
  - **WS9** (about 0.25 day): their clamps in the validator (packages/ai/src/playbook/validate.ts::validatorFor).
  - **WS7** (about 0.5 day, OK'd 7 Nov; built in S3-PR-4 as slice 3 AM-5): `VotePort` in
    packages/ai/src/hands/vote.ts; VoteHand's optional third constructor argument, read in `vote` (election, per
    contested office) and `lawVote` before the keyless rule; `ownVote(obs, mind, ballot, port?)` reads it too; the
    null-port pin (T-AC-B9); RULE-B6 rows 0 and 2 (WS7's conditions 1-2).
  - **WS3** (as well, about 0.25 day): mule-game.ts named edits: pass the seat's ONE port to both its VoteHand and
    its DealHand where `voteHands` are built
    (MuleGame.start), and `to` into the TableTalk heard hands an AI seat (C5's edit).
  - **WS2** (about 1 day): the brief's ballot lines (C1: candidates, promises, the open law, its own promised votes via
    WS7's promisedVotes once slice 3 lands: not on trunk at 7ecddae5, through observe); the writer's `/politics/...` edits (C3); `votePortFor(seat)` from the
    playbook in effect; a recorded whisper reply may carry the vote edits (C7); RULE-B6's tests; for C13, the same
    through answer_whisper.
  - About 2.25 lane-days in all, against Heiko's ~2 (unproven estimate). Out: running, promises, campaigning and the
    Governor's tax target (C6, after the RC); asking for a vote on a card (WS7 slice 3 non-goal).

  **Drift since 29 Oct, re-read 7 Nov at ws2-brain 67edd812:**
  - Ruling a′ (5 Nov): a plan's line is said as its phase starts, through the seat's chat
    (apps/server/src/mule-game.ts::MuleGame.start, Playbooks' `speak`; apps/server/src/brain/chat.ts::chatter). G-B2's
    "Today" still holds: lines are about its own move, public, at most 3 a month; it never whispers.
  - WS3's `heard` step is on trunk (packages/engine/src/record.ts 'heard' {from, to}; apps/server/src/replay.ts
    replays it with ''), so C7's recorded replies (B-2b) are unblocked.
  - `MuleGame.heard` drops `to` from what the AI seat gets: an AI cannot tell a whisper from a table line (C5's note).
  - WS7's slice 3 froze DealPort (consumed after the RC), S3-C11 refuses an AI offer to a player who muted it once C9
    exists, deal notices carry `parties` and WS2's memory skips other pairs' cards (HC-B5), and the brief's deal fields
    come through observe (WS7 slice-3 spec, "WS2's port").
  - **Finding, not a WS2 goal: the family filter is not wired.** The room's `moderate` defaults to the identity
    (packages/tabletop/src/room.ts, `moderate: options.moderate ?? ((text) => text)`) and the server passes none; AI
    lines go through the same `moderate` (`say` follows a player's "trim, cap, moderation and whisper rules"). The
    concept (docs/design/00-concept.md:265, "a filter that can be switched to family-friendly") and
    docs/design/06-ai-players.md:127 ("All AI chat passes the family filter") assume one. Owner proposal: WS3 passes a
    filter into the room from apps/server/src/server.ts (WS4's room already takes it); every AI line then passes it
    with no WS2 change. For the PM.
  - The rulebook's "Claude's own lines at the table" still said "Being built" and pointed at PR #384 waiting; fixed in
    the same PR as this amendment.

## §9 · Ownership Boundaries `[handoff]`
- **Sole owner of AI social reasoning, its memory and its messages: WS2**: `packages/ai/src/social/`, the social parts
  of `packages/ai/src/llm/brief.ts` and `writer.ts`, and the talker in `apps/server/src/brain/`. Read contract:
  `BrainService.writerFor` and `talkerFor`. Write contract: only an accepted writer reply sends a message or changes a
  stance or a politics play; only RULE-B3 sends a reply. Enforcement: packages/ai's purity test; the SDK guard (only
  `apps/server/src/brain/client.ts` imports the SDK); T-AC-B3's replay test fails if a reply or unrecorded logic ever
  drives an action.
- **Not WS2's:** the playbook types and validatePlan (WS1; C3's and C6's edits are a contract WS1 agrees); VoteHand,
  cards, keep/break and reputation (WS7); the record and replay (WS3; C8 is named edits); mule-game.ts and the
  protocol (WS3, named edits in C5 and C9); the mute control and card screens (WS6).
- *AM-B5:* `VotePort` is WS7's type and VoteHand reads it (WS7); WS2 only supplies it (`votePortFor`). The "· AI" mark
  is WS6's (phone) and WS4's (TV). The Claude Code seat's tools stay WS2's (`apps/server/src/claude-seat/`).
