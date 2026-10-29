# WS3 · the game record and its replay

WS3 · 2026-10-29 · class: Standard. Two PRs, no new sole owner outside WS3's own files. It also carries one
contract with WS1 and WS2: `PlaybookEntry` and the `notice` events, per playbook schema v1.

**Status:** §0 passed Heiko's goal gate as written (2026-10-29, through the PM: "Go to the spec and the build; it's
small and others depend on it"). This document is §0 verbatim plus the design. It is for Heiko's review of the
written spec.

**§3 FROZEN at 04406300 (2026-10-29):** WS1, WS2 and WS3 OK'd it, through AM-1 and AM-2. A change after the freeze
needs all three OKs. WS1 adds a constraint to its step-2 spec: the validator and the engine draft are deterministic
functions of the recorded reply and the game state, with no clock reads and no unseeded draws. T-AC-11 is the guard.

Ids: changes C1–C7, rules RULE-1..RULE-6, ACs B-AC-1 and T-AC-1..T-AC-11.

---

## §0 · Business goals and value `[handoff]` (agreed verbatim)

**G-1 · Any finished game can be replayed exactly from its saved record, without calling Claude.**
- **Who benefits:** `[review-only]`
  - Heiko, when a playtest game goes wrong and he wants it replayed, not retold;
  - the league, whose proof is "replaying the saved seed and moves reproduces the same score";
  - WS1 and WS2, whose AI plan record must replay without a model call.
- **Today** (read 28 Oct): `[review-only]`
  - Nothing records a game's moves. There is no record or replay in the server, engine, AI or table code; the only
    mentions are comments promising it.
  - The game depends on more than seed and intents: the clock and its timers, phones dropping and returning (an away
    seat is excused or holds the table), and Claude's answers for smart AI seats, which arrive at network-dependent
    times.
  - So no game can be reproduced today, and a smart-AI game can't even in principle.
- **Value:** `[review-only]`
  - A reported game becomes a file you can replay to the exact final state.
  - League scores become checkable.
  - The AI's decisions, and later its plans, are stored as plain data in the game's own record, the way a move is.
- **Proof (UBER-AC-1):**
  - Play a game to the end at the table with a smart AI seat (Claude key set) and a human phone dropping once; it's
    written to a file at game over.
  - Replay that file with the key unset.
  - Every seat's final score is identical, and so is the final game state.

**Non-goals:**
- keeping records across a server restart, or in a database;
- resuming a game from a record mid-game;
- a replay viewer or any screen;
- league storage;
- replaying under a different config: the record carries the config's fingerprint, and replay refuses a mismatch
  rather than migrating;
- storing chat text. Chat only matters through the AI's answers, and those are recorded.

**Rough cost:** `[review-only]`
- **Chosen:** the record is taken at MuleGame's inputs: its start (seed, options, seats), every human intent, every
  phone dropping or returning, and every Claude answer with when it arrived. Each carries the game clock and its place
  in order. The replay drives the same game code with a test clock, and stands in recorded answers for Claude. It's
  kept in memory per room and written to a file at game over. 1–2 PRs.
- **Thin baseline:** record human intents and AI moves with timestamps, and replay them in order. Under a day.

## §0.1 · Decision Record `[review-only]`

**Chosen:** the record wraps the room's seam to MuleGame. It takes the `Game` calls in and the `GameContext` calls
out, and records each step together with the clock and host values the game read during it. About 2 days for PR-1,
plus half a day for PR-2.

**Thin baseline:** record human intents and AI moves with timestamps, and replay them in order. Under a day.

**Why the baseline loses** (each point can be checked in the code):
- **The ticks compute their step from the clock.** `scheduleAuctionTick`, `scheduleLandAuctionTick`,
  `scheduleElectionTick` and `scheduleAiDevelop` each take `dt = ctx.now() - last` (`mule-game.ts`). A live timer fires
  some ms late, and the late amount varies, so `dt` differs from the ideal on every tick. A replay on an ideal clock
  walks the auction differently within the first good.
- **A Claude answer counts at a tick, not when it arrives.** It lands in `Pending.answer` through a promise and only
  takes effect at the next `Brain.resolve` (`packages/ai/src/brain.ts`). Which tick that is decides the move, so an
  answer has to be placed between the same two timer firings.
- **Same-millisecond ties.** When a timer firing and a human intent land in the same ms (the grant light against a
  claim), their order decides who gets the plot. A timestamp can't break that tie; an ordinal can.

**A finding from the design, beyond §0:** the PM has it. Recording AI moves, as the baseline does, isn't needed. AI
seats replay by themselves from the game seed and the recorded inputs. Only what can't be recomputed is recorded:
people, phones, the clock and Claude.

## §0.2 · Constraints `[handoff]`

```
HC-1  A replay makes no model call and no network call.             source: §0 (agreed)  breach: fatal
HC-2  The record holds no secrets: no API key, no seat tokens, no   source: §0 (agreed)  breach: fatal
      handoff or move codes, no room code.
HC-3  Recording never changes play: it appends in memory only, with  source: §0 (agreed)  breach: fatal
      no I/O until game over, and never alters a value the game
      reads (no rounding, no freezing of the clock).
HC-4  The engine stays pure: packages/engine/src/record.ts holds     source: §0 (agreed)  breach: fatal
      types and pure helpers only; the recorder and replay live in
      apps/server/src/record.ts.
HC-5  No edit to another lane's file. WS2's brain/** is wrapped from  source: SEAMS        breach: decision
      outside (BrainService is an interface), never edited.
```

---

## §1 · Solution Design `[handoff]`

The whole design rests on one fact. **MuleGame touches the world only through the room's seam:**
- **In:** `start`, `handle`, `connectionChanged`, `heard` and `seatMoved` (`packages/tabletop/src/room.ts::Game`), plus
  Claude's answers through `BrainService.deciderFor` (`apps/server/src/brain/index.ts`).
- **Out:** `now`, `schedule`, `hostId`, `changed` and `say` (`room.ts::GameContext`).

Its other inputs are already deterministic:
- the engine's seeded RNG;
- the AI seats' seeds, derived from the game seed (`mule-game.ts::start`);
- the AI's default pick, seeded per decision (`packages/ai/src/decider.ts::TopPickDecider`).

So a recorder that sits on that seam sees everything that isn't recomputable.

**What each change serves:**
- **C1–C5 deliver G-1** and its proof, in PR-1.
- **C6–C7 deliver G-1's third value line** (the AI's plans stored as plain data in the record) and the record's side of
  playbook schema v1, which WS1, WS2 and WS3 OK'd and froze on 29 Oct. They go in PR-2.

```
C1 · ADDED · the record's types and pure helpers, in the engine

today        none. verified_by: none_exists (grep "GameRecord|record.ts" in packages/: no hits, 2026-10-29)
tomorrow     packages/engine/src/record.ts exports GameRecord<Intent>, RecordEvent<Intent>, RecordStep,
             RecordedChoice, NoticeEntry and PlaybookEntry (§3), with two pure helpers: `configSnapshot()`, every
             export of config.ts as plain data, and `stableJson(value)`, which sorts keys. index.ts gets an
             `export type * from './record.js'` line plus the two helpers.
seam         packages/engine/src/record.ts (new, WS3) — the types must sit below both the server and @mule/ai, and
             `PlaybookEntry` is frozen there by schema v1.
senior       junior would: put the types in apps/server (WS1/WS2 can't import them) or import MuleIntent and
             Choice into the engine (a cycle: protocol and ai depend on engine) · senior does: Intent is a
             type parameter; RecordedChoice is the structural subset of @mule/ai's Choice; PlaybookEntry
             imports Playbook from ./playbook.ts.
mechanism    sprout
call sites   new; consumed by C2, C3, C6, C7 and later by WS1/WS2.
pin          none, because nothing exists to move.
depends_on   none
```

```
C2 · ADDED · the recorder: wraps the context, the game and the brain, and keeps the record in memory

today        none. verified_by: none_exists
tomorrow     apps/server/src/record.ts::Recorder. It MUST:
             (1) wrap the GameContext. `schedule` numbers each timer in call order, and its callback opens a
                 `fire` step; `now()` and `hostId()` append what they return to the open step's `reads` and
                 `hosts`, except while a `viewFor` runs (RULE-3). It never alters a value (HC-3).
             (2) wrap the Game. `start`, `handle`, `connectionChanged` and `seatMoved` each open a step and record
                 their input; `handle` also records a refusal's message and rethrows. `heard` is passed through
                 unrecorded (RULE-5).
             (3) wrap the BrainService. `deciderFor` notes which seats are smart, and each decider's `decide`
                 call is numbered per seat, with its outcome recorded per RULE-4.
logic        → RULE-1, RULE-2, RULE-3, RULE-4, RULE-5
seam         apps/server/src/record.ts (new, WS3) — the room seam is the only place every input passes.
senior       junior would: log inside MuleGame at each place a move is applied (misses timers, dt and answer
             timing; edits every handler) · senior does: wraps the three interfaces the game already depends on,
             so MuleGame changes by one hook (C4), and every input that exists today and later is caught.
mechanism    wrap
call sites   server.ts::createMuleServer createGame (C4); tests.
pin          T-AC-7 (recording on vs off gives the same final state hash).
depends_on   C1 (data)
```

```
C3 · ADDED · the replay: drives a fresh MuleGame from a record and compares the outcome

tomorrow     apps/server/src/record.ts::replay(record): Promise<ReplayResult>. It MUST refuse a version or config
             fingerprint mismatch before it runs (RecordMismatch). It plays the steps in order through a scripted
             context and a recorded brain (RULE-6), and it throws ReplayDiverged { seq, reason } at the first
             step that doesn't match. At the end it compares every seat's score and the state hash.
logic        → RULE-6
seam         same file as C2: the replay is the recorder's inverse and shares its step model.
senior       junior would: a fake clock that fires timers by due time (Node's real order and the late `dt`
             differ, so it drifts silently) · senior does: fires the recorded timer ids in recorded order, serves
             the clock tape, and checks at every step, so a drift is named at its first step, not found in a
             score.
mechanism    sprout
call sites   C5's CLI; tests.
pin          none, because it's new.
depends_on   C1, C2 (data: it consumes C2's output)
```

```
C4 · MODIFIED · the server records each game and writes the file at game over

today        server.ts::createMuleServer createGame builds `new MuleGame(ctx, seed(), {...})` with no record.
             mule-game.ts::enterPhase handles 'gameOver' by writing the news and calling brain.finish().
             verified_by: read
tomorrow     createMuleServer takes `recordDir?: string | null`; null or absent means no recorder, so tests and
             e2e are unchanged. index.ts passes MULE_RECORD_DIR, or apps/server/data/records by default. With a
             dir, createGame builds a Recorder, hands MuleGame the wrapped ctx and brain, and returns the wrapped
             game. MuleGame gains `onGameOver?: (state: GameState) => void` in its options, called once in
             enterPhase's gameOver branch. The recorder then sets `outcome` and writes the file asynchronously
             (RULE-2).
seam         server.ts::createMuleServer (WS3) and mule-game.ts::enterPhase (WS3) — the one place a game ends.
senior       junior would: record unconditionally (every e2e run writes files, and the harness, WS4's, would
             need a named edit) · senior does: off unless a dir is given; only the real entry point gives one.
mechanism    in_place
call sites   createMuleServer: index.ts, apps/web/e2e/harness.ts::startServer (passes no recordDir, so it's
             unchanged), apps/server/test/*.test.ts (unchanged).
pin          the existing server suite stays green with recording off.
depends_on   C2 (data)
```

```
C5 · ADDED · the replay command

tomorrow     `pnpm --filter @mule/server replay <file>` runs apps/server/src/replay-cli.ts. For each seat it prints
             the recorded and replayed score, then "identical" (exit 0), the divergence { seq, reason } (exit 1), or
             the mismatch (exit 2). It deletes ANTHROPIC_API_KEY from its own env before it starts (HC-1, belt and
             braces: C3 never builds a real brain).
seam         apps/server/src/replay-cli.ts (new, WS3); one "replay" line in apps/server/package.json scripts.
mechanism    sprout
depends_on   C3
```

```
C6 · ADDED · derived notices: claims, declarations, trades and lot sales as public facts

today        none. A claim, trade or sale shows only in news lines and the state's own history.
             verified_by: read (mule-game.ts: `dealsInGood` in scheduleAuctionTick, the grant's claims in handle
             'claim' and resolveGrantBids, lot results in scheduleLandAuctionTick. apps/server/src/land-auction.ts
             is only the view helper)
tomorrow     (AM-2) MuleGame emits a notice at each claim (landGrant), each good's settled declarations (one
             `declare` notice per seat, auction), each trade (auction, the ship included as buyer `'ship'`) and
             each lot sale (landAuction). It ALWAYS keeps the open phase's notices, whether or not a recorder
             exists, readable as `phaseNotices(): readonly Notice[]` until the next phase opens, for the
             PhaseOutcome builders in every Smart game, tests and e2e included. It also passes each notice to an
             optional `notice?` option, the recorder's, which appends it as a `notice` event in the open step.
             The replay skips notices (RULE-6).
seam         mule-game.ts at the four places these facts are settled (WS3's file).
senior       junior would: recompute them later by replaying (PhaseOutcome would then need a replay) · senior does:
             record them as they settle; the replay ignores them, so they can never cause a divergence.
mechanism    in_place
call sites   PhaseOutcome builders later (WS3 land grant, WS1 auction). None today.
pin          T-AC-10
depends_on   C1, C2
```

```
C7 · ADDED · playbook entries: the append API WS1 and WS2 write through

tomorrow     The recorder exposes `playbook(entry: Omit<PlaybookEntry, 'type' | 'at' | 'seq'>)`. It stamps `at`
             and `seq` from the open step, or from the last step when called between steps. MuleGame passes a
             `recordPlaybook` callback to whoever builds playbooks (today: nobody; WS1's step-2 build). The replay
             does not take these entries as inputs: an engine draft is re-derived from the inputs, and a Claude-
             edited one from the recorded writer reply (AM-1), with no call, so schema v1 principle 5 holds.
             Each replayed playbook must equal its recorded entry, or ReplayDiverged (T-AC-11).
seam         apps/server/src/record.ts (WS3); the caller is WS1/WS2's, through MuleGame's options.
mechanism    sprout
pin          T-AC-11
depends_on   C1, C2
```

## §2 · The Logic `[handoff]`

```
RULE-1 · What is a step, and what goes in it                      shape: decision table

inputs   the call the recorder sees: a Game call, a timer callback, a decider promise settling, a ctx read
first match wins

  #  when                                                  then
  1  Game.start(seats)                                     new step 'start' (seats in the record header)
  2  Game.handle(seat, intent)                             new step 'intent'; a throw → `refused` = its message
                                                           (capped at 120 chars), rethrown unchanged
  3  Game.connectionChanged(seat, connected)               new step 'connection'
  4  Game.seatMoved(seat)                                  new step 'moved'
  5  a scheduled callback runs                             new step 'fire' { timer: id }
  6  an async decide settles (resolve or reject)           new step 'answer' { seat, call, choice | error }
  7  ctx.now() / ctx.hostId() outside viewFor              value appended to the OPEN step's reads / hosts
  8  notice / playbook                                     event appended after the open step, same at and seq
  9  Game.heard(from, text, to?)                           new step 'heard' { from, to? }; the text is never
                                                           recorded (RULE-5, AM-4)
  10 Game.viewFor                                          passed through; reads inside it untaped (RULE-3)

the open step  a step stays open from its call until the next step opens. Microtasks that run after its synchronous
               part (a promise handler reading the clock) still belong to it, until an answer settles in that
               drain. An answer opens its own step mid-drain, and later microtasks belong to the answer step. The
               replay settles answers at the same points and flushes after each step, so both land in the same
               place (AM-3).
seq            the step's index in `events` among steps (0 = start). Notices and playbooks carry their step's seq.
at             ms since `t0` (the room clock when the recorder was made), read by the recorder from the
               underlying clock at the step's opening. The game never sees that read.

examples                                                              → §6
  a claim at 12,340 ms while the light's timer is due → whichever ran first is the earlier step (T-AC-1)
  a refused claim → 'intent' with refused: "Not your turn…", and the replay refuses it too (T-AC-9)
```

```
RULE-2 · When the record is written                               shape: decision table

  #  when                                          then
  1  no recordDir                                  no recorder at all
  2  onGameOver fires                              outcome = { scores (engine `score` per seat),
                                                   stateHash = sha256(stableJson(state)) };
                                                   write <dir>/game-<t0 as ISO, ':' → '-'>-s<seed>.json, async
  3  the write fails                               console.error with the path and error code; the room and
                                                   game carry on untouched; nothing retries
  4  the room is disposed before game over         nothing written; the record is dropped with the room
  5  a game error ends the room                    nothing written (see §7 R-2)

unknown  `recordDir` absent means "don't record". It is never a default folder in tests.
```

```
RULE-3 · Clock and host reads: which are taped                    shape: decision table

  #  when                                   then
  1  inside Game.viewFor (the recorder's    not taped; in replay the read returns the last taped value
     wrapper sets a flag for its duration)  (views are pure; nothing in state may depend on them)
  2  otherwise                              taped on the open step, in call order
  3  in replay, a step reads more values    ReplayDiverged { seq, reason: 'clock tape exhausted' }
     than it taped
  4  in replay, a step leaves taped values  ReplayDiverged { seq, reason: 'clock tape not consumed' }
     unread

why  The room calls viewFor on every broadcast, a join and a pong. Those calls depend on the network, not on play,
     so taping them would misalign the tape. Row 1 relies on viewFor never mutating state. Today MuleGame.viewFor reads neither clock nor host, so T-AC-6 forces a
     view that reads the clock to prove the exclusion (AM-3).
```

```
RULE-4 · A decider call and its answer                            shape: decision table

inputs  what the inner decider's decide() did: returned a Choice, threw, or returned a promise

  #  when                                  record (in the open step's `decides`, per seat, call n)  then
  1  returned a Choice (sync)              { seat, call, choice }                                   return it
  2  threw synchronously                   { seat, call, error: message ≤120 }                      rethrow
     (the real decider is `async`, so 'busy' and 'game over' arrive through row 3 as a rejected promise)
  3  returned a promise                    { seat, call, pending: true }                            return a
                                           and later, when it settles, a new                        promise that
                                           'answer' step { seat, call, choice | error }             settles the same

recorded choice  { optionId, line, by, note? }. `line` is Claude's own table talk, not a player's chat (§0
                 non-goal untouched); it only feeds `say`.
writer calls     (AM-1) the same three rows apply to a writer call, with `kind` 'strategy' or 'playbook' and
                 `write` (RecordedWrite) in place of `choice`. Call numbers count per seat across all kinds.
unknown          a promise still open at game over leaves no answer step. That's correct: the game never read it.
```

```
RULE-5 · Who spoke to whom is an input; what they said never is     shape: invariant (AM-4)

A delivered line to the AI seats (`Game.heard`) is recorded as a step `{ from, to? }`, **without its text** (the §0
non-goal "storing chat text" holds). The replay calls `game.heard(from, '', to)`. So:
  - a brain call may open because a line arrived (from whom, to whom, when), and it replays identically;
  - nothing in play, and no call's opening, may depend on the words. Words reach an outcome only through a recorded
    reply (RULE-4), which the replay serves without reading the prompt;
  - a line an AI seat sent, forwarded inside the game (spec B's C5), is not a heard step and may open no call: the
    room never calls `Game.heard` for it, and its words come from an unrecorded part of a reply, so the replay would
    never regenerate it (WS2's review of AM-4; mirrored in spec B AM-B4).
Pinned by T-AC-12 here (a game with chat replays identical, and the file holds no chat text). Spec B's T-AC-B8 is
the brain side: a replay with every heard text blanked is identical, positive-controlled by a reply that opens on a
word.
```

```
RULE-6 · Replay, step by step                                     shape: sequence + checks

0  refuse unless record.v === 1 and configFingerprint === sha256(stableJson(configSnapshot())) → RecordMismatch
1  build the scripted ctx: schedule() numbers timers like the recorder and keeps the live ones in a map; now() and
   hostId() serve the open step's tape (RULE-3); changed() and say() do nothing
2  build the recorded brain: deciderFor(seat) is a recorded decider for a smart seat, null otherwise;
   chatter → a no-op; finish → a no-op. No real brain, no SDK, no env read (HC-1)
3  new MuleGame(ctx, seed, { ...options, brain, onGameOver }) and, for each event in order:
     start      game.start(seats)
     fire       the live timer with that id; missing or cancelled → ReplayDiverged 'timer <id> not live'
     intent     game.handle(); throw vs record.refused must agree (message equal) → else ReplayDiverged
     connection game.connectionChanged()
     moved      game.seatMoved()
     heard      game.heard(from, '', to)   (the text was never recorded; AM-4)
     answer     settle that call's promise with the recorded choice, write reply or error (by seat, call and kind)
     notice, playbook  skipped
   after each step: flush microtasks, check the tape was consumed, and check the step's brain calls (move and writer) match
   `decides` in seat, call, kind and order
4  at the end: onGameOver must have fired iff the record has an outcome; scores equal per seat; stateHash equal.
   Result { identical: boolean, scores: { seat, recorded, replayed }[], stateHash: { recorded, replayed } }
```

## §3 · Contracts & Data Models `[handoff]`

**ADDED, not breaking: `packages/engine/src/record.ts`.** It's produced by C1 and consumed by WS3 (C2, C3, C6, C7)
and by WS1/WS2 (`PlaybookEntry`, `NoticeEntry`). It is the freeze candidate for WS1 and WS2.

```ts
import type { AuctionSide, Good, Phase } from './types.js';
import type { Playbook, PlayerId, PlotIndex, Strategy } from './playbook.js';

/** Claude's answer as play used it: the structural subset of @mule/ai's Choice. */
export interface RecordedChoice { optionId: string; line: string | null; by: 'top' | 'llm' | 'fallback'; note?: string }

/** A brain call: a move pick (an option letter) or a playbook writer call (spec A). Numbered per seat across kinds. */
export type CallKind = 'move' | 'strategy' | 'playbook';

/**
 * The writer's checked reply, before validatePlan; never raw model text. It's what `writerFor`'s writer returns, after
 * WS2's own checks. `cause` is the writer's code when the reply was unusable. The replay returns it from the recorded
 * writer as it is, without running the writer's checks again; validatePlan and the engine draft then re-derive the
 * playbook (AM-1).
 */
export interface RecordedWrite {
  strategy?: Strategy;
  edits: { path: string; to: unknown; reason: string }[];
  line: string | null;
  cause?: string;
}

/** What every step carries: when, its place in order, and what the game read during it. */
export interface RecordStep {
  at: number;                       // ms since GameRecord.t0
  seq: number;                      // index of this step among the record's steps
  reads?: number[];                 // ctx.now() values the game read, ms since t0, in order
  hosts?: (PlayerId | null)[];      // ctx.hostId() values, in order
  decides?: { seat: PlayerId; call: number; kind: CallKind; choice?: RecordedChoice; write?: RecordedWrite; error?: string; pending?: true }[];
}

export type RecordEvent<Intent> =
  | (RecordStep & { type: 'start' })
  | (RecordStep & { type: 'fire'; timer: number })
  | (RecordStep & { type: 'intent'; seat: PlayerId; intent: Intent; refused?: string })
  | (RecordStep & { type: 'connection'; seat: PlayerId; connected: boolean })
  | (RecordStep & { type: 'moved'; seat: PlayerId })
  | (RecordStep & { type: 'heard'; from: PlayerId; to?: PlayerId })   // AM-4: who to whom, never the words
  | (RecordStep & { type: 'answer'; seat: PlayerId; call: number; kind: CallKind; choice?: RecordedChoice; write?: RecordedWrite; error?: string })
  | NoticeEntry
  | PlaybookEntry;

/** A public fact as it settled; derived, so the replay ignores it. */
export type NoticeEntry = { type: 'notice'; at: number; seq: number; month: number; phase: Phase } & (
  | { kind: 'claim'; seat: PlayerId; plot: PlotIndex }
  | { kind: 'declare'; seat: PlayerId; good: Good; side: AuctionSide }
  | { kind: 'trade'; good: Good; buyer: PlayerId | 'store' | 'ship'; seller: PlayerId | 'store'; price: number; qty: number }
  | { kind: 'sale'; item: 'plot' | 'mule'; plot: PlotIndex; seller: PlayerId; buyer: PlayerId | 'store'; price: number }
);

/** As frozen in playbook schema v1. */
export type PlaybookEntry = { type: 'playbook'; at: number; seq: number; seat: PlayerId; month: number; phase: Playbook['phase']; playbook: Playbook };

export interface GameRecord<Intent> {
  v: 1;
  seed: number;
  configFingerprint: string;        // sha256 of stableJson(configSnapshot()), hex
  options: { maxMonths?: number; phaseScale?: number; politics: boolean };
  seats: { id: PlayerId; name: string; isAi: boolean; color: number; pick?: string; smart: boolean }[];
  t0: number;                       // the room clock when recording began, epoch ms
  events: RecordEvent<Intent>[];
  outcome?: { scores: Record<PlayerId, number>; stateHash: string };
}
```

**A worked example** (abridged): a 2-seat game, one human (`p1`) and one smart AI (`p2`).

```json
{ "v": 1, "seed": 93, "configFingerprint": "9f2c…", "options": { "politics": true }, "t0": 1761720000000,
  "seats": [{ "id": "p1", "name": "Lena", "isAi": false, "color": 0, "smart": false },
            { "id": "p2", "name": "The Big Spender", "isAi": true, "color": 1, "smart": true }],
  "events": [
    { "type": "start", "at": 0, "seq": 0, "reads": [0, 0] },
    { "type": "intent", "at": 4120, "seq": 1, "seat": "p1", "intent": { "type": "ready" }, "reads": [4120] },
    { "type": "fire", "at": 4121, "seq": 2, "timer": 7, "reads": [4121], "decides": [{ "seat": "p2", "call": 1, "pending": true }] },
    { "type": "fire", "at": 4774, "seq": 3, "timer": 9, "reads": [4774] },
    { "type": "answer", "at": 4890, "seq": 4, "seat": "p2", "call": 1, "choice": { "optionId": "B", "line": "Mine.", "by": "llm" } },
    { "type": "notice", "at": 4890, "seq": 4, "month": 1, "phase": "landGrant", "kind": "claim", "seat": "p2", "plot": 41 },
    { "type": "connection", "at": 9001, "seq": 5, "seat": "p1", "connected": false } ],
  "outcome": { "scores": { "p1": 41250, "p2": 39800 }, "stateHash": "c71e…" } }
```

**MODIFIED, not breaking: `createMuleServer` options** gain `recordDir?: string | null` (C4). **`MuleGame`'s
options** gain `onGameOver?`, `notice?` and `recordPlaybook?`, all optional (C4, C6, C7). **The file on disk** is
JSON, one record per file, versioned by `v`. A replay reads only `v: 1`.

## §4 · Failure & Ops `[handoff]`

| Question | |
|---|---|
| A dependency unavailable or degraded? | The disk at game over, the only I/O. RULE-2 row 3: log and carry on, no retry, nothing written. The game has ended either way. (C4) |
| Retry, poison, page a human? | None retry. A write failure is a log line. A divergence or mismatch is the replay's answer: it exits 1 or 2 and names the step. Nothing pages. (C3, C5) |
| Idempotency / delivery? | The file is written once per game, from `onGameOver`, which fires once (enterPhase returns early on gameOver). Its name carries t0 and the seed, so two games never share a file. (C4) |
| What can race? | A decider promise against timers: ordered by RULE-1's step model, and checked in replay (RULE-6 step 3). Two games write different files. (C2, C3) |
| What still works when it's broken? | Play. Recording is wrappers and in-memory appends. A recorder bug that throws inside a wrapper would end the room, so every wrapper, and the game-over file write scheduled after it (AM-3), does its own bookkeeping in try/catch, logs, marks the record `broken` and still calls the game. A broken record is not written. (C2) |
| How does an operator know it works? | A file per finished game in MULE_RECORD_DIR (default apps/server/data/records), and `pnpm --filter @mule/server replay <file>` prints "identical". |

**Size, measured on paper:** the 100 ms ticks dominate (auction, land auction, election, AI development). That's
about 3k steps a month, with one or two reads each, so a 12-month game is about 40k steps and 1–3 MB of JSON in memory
per room. That's acceptable for a playtest server; §7 R-1 covers it.

## §5 · Delivery

Code-only; there's no existing state to reach. Records start with the first game after the deploy. `data/` is
already git-ignored.

## §6 · Acceptance Criteria `[handoff]`

| AC | Promise | Observed at | Change |
|---|---|---|---|
| **B-AC-1** | UBER-AC-1 as written. Heiko plays a game to the end at the table with the key set and one phone dropped once. `replay <file>` with the key unset prints "identical" for every seat and the state hash | the CLI's output on the real file | C2–C5 |
| **T-AC-1** | A server-level game in a real `Room` reaches game over under vitest's fake timers. It has a smart AI seat whose stub SDK answers after a varying delay (one answer lands after a tick), a human who claims, chats, drops and returns, and a refused intent. `replay` returns identical scores and state hash. **Positive control:** move one `answer` step one step later and the replay diverges or differs | `replay()` result | C2, C3, RULE-1..6 |
| **T-AC-2** | A tampered intent (another plot) → ReplayDiverged, naming that step's seq or a later one, never a silent pass | thrown error | C3 |
| **T-AC-3** | A record with one config value changed in its fingerprint → RecordMismatch before any step runs | thrown error, game never built | C3 |
| **T-AC-4** | HC-1: a replay with ANTHROPIC_API_KEY set and an SDK factory that throws if called completes, with no call and no ledger line | spy counts 0 | C3, C5 |
| **T-AC-5** | HC-2: the written file contains no seat token, no handoff code, no room code and no API key (searched for the test's own values) | file text | C2, C4 |
| **T-AC-6** | RULE-3: a game whose views are fetched at random extra moments (joins, pongs) still replays identical | `replay()` result | C2 |
| **T-AC-7** | HC-3: the same scripted game with recording on and off ends in the same state hash, and nothing is written before game over (fs spy) | hash and fs spy | C2, C4 |
| **T-AC-8** | RULE-2 row 3: an unwritable recordDir at game over → one console.error, and the room still shows game over and stays reachable | room view, log spy | C4 |
| **T-AC-9** | A refused intent is recorded with its message, and the replay refuses it with the same message | record + replay | C2, C3 |
| **T-AC-10** | Claims, declarations, trades (a sale to the ship included) and lot sales appear as `notice` events with month and phase, and `phaseNotices()` holds the same notices with recording off. A replay of the record with every notice removed is still identical | record, `phaseNotices()`, `replay()` | C6 |
| **T-AC-12** | AM-4: a game whose humans chat publicly and whisper to an AI records one `heard` step per delivered line, with `from` and `to` and no text. The file holds none of the chat's words, and `replay` is identical | record file + `replay()` | C2, C3 |
| **T-AC-11** | `recordPlaybook` entries come out in call order with their step's at and seq. The replay skips them as inputs, but each replayed playbook must equal its recorded entry, or ReplayDiverged (AM-1) | record + `replay()` | C7 |

All T-ACs are server tests (`apps/server/test/record.test.ts`). Only T-AC-1 belongs in Tier 1 CI (lean CI); the rest
stay local.

## §7 · Risks & Spikes `[review-only]`

- **R-1, memory per room.** 1–3 MB per running game is fine at playtest scale. If rooms ever number in the hundreds,
  stream the steps to a file. That's a non-goal now.
- **R-2, a crashed game leaves no file.** When a game error ends the room, nothing is written (RULE-2 row 5). That's
  exactly the game Heiko would most want replayed. It costs little to write the record with `ended: 'error'`, and the
  replay would reproduce the throw. It's outside §0's proof, so it's offered as a follow-up for the PM and Heiko to
  rule on, not built here.
- **R-3, Node timer and promise semantics.** RULE-1 assumes a settled decider promise runs its handlers before the
  next timer callback, which holds in Node: microtasks drain between macrotasks. T-AC-1's positive control is the
  check. No spike needed.
- **R-4, viewFor purity.** RULE-3 relies on views never mutating state. T-AC-6 proves the clock exclusion with a view forced to read the clock (AM-3); view purity itself rests on review.

## §8 · Amendments `[review-only]`

- **AM-1 (2026-10-29, WS2's review of §3, adopted by WS3):** writer calls are recorded inputs.
  - **The finding:** spec A's strategy and playbook writer calls are model calls through the brain, like move calls,
    but their reply is `{ strategy?, edits, line }`, not an option letter. Without recording them, a keyless replay of
    a game with a Claude seat plays the engine's draft playbook and diverges. That breaks G-1 and spec A's B-AC-A2.
  - **The change:**
    - §3 gains `CallKind` and `RecordedWrite`; `decides` and `answer` carry `kind`, and `write` where it applies.
    - RULE-4 applies to writer calls exactly as to move calls. The recorder wraps whatever writer method WS2 adds to
      `BrainService`, from outside (HC-5). Until that method exists, only `kind: 'move'` occurs.
    - A reply that arrives after its phase started is still recorded at its own `at`, so the replay drops it the same
      way (spec A RULE-A1 row 2).
    - RULE-6 keeps skipping `playbook` entries as inputs, because validatePlan and the draft are deterministic.
      T-AC-11 adds a guard: each replayed playbook must equal its recorded entry.
  - **Rejected alternative:** treat `by: 'llm'` playbook entries as replay inputs. That breaks "inputs only" and skips
    re-validation on replay.
  - **Also:** the §3 example seat is renamed "The Big Spender" (AM-18).
- **AM-2 (2026-10-29, WS1's review of §3, adopted by WS3):**
  - (1) The `trade` notice's buyer may be `'ship'`: the export ship buys in the auction (`auction.ts::SHIP_ID`).
  - (2) There is a new `declare` notice per seat and good. Nothing else keeps sides after the auction, and frozen v1's
    `PhaseOutcome.rivals.declaredButIdle` needs them.
  - (3) C7 no longer says "ignores". A Claude-edited playbook replays from the recorded writer reply (AM-1), without
    a call, which keeps schema v1 principle 5 and HC-1. Each replayed playbook is checked against its entry.
  - (4) The notices no longer depend on recording. MuleGame keeps the open phase's notices (`phaseNotices()`) for
    the PhaseOutcome builders in every game; the recorder is only one listener. I chose a kept list over several
    listeners: the builders run inside MuleGame at the phase's end, so a list they read needs no wiring.
- **AM-3 (2026-10-29, PR-1's code review):** four claims were false as built, and are now corrected. None changes the
  design.
  - (1) RULE-4 row 2: the real decider is `async`, so 'busy' and 'game over' arrive as rejections (row 3). The
    behaviour was already right; T-AC-1 now covers a rejection.
  - (2) RULE-1, the open step: an answer that settles mid-drain opens its own step, and the drain's later microtasks
    go to it. The replay matches. T-AC-5 now replays its real-brain file to pin this.
  - (3) RULE-3 and §7 R-4: no test could go red on the view exclusion, because views read no clock. T-AC-6 now forces
    a view that reads the clock.
  - (4) §4: the game-over write ran outside the guard, where a throw would end the whole server process. It now runs
    inside the guard, and FM-REC-1 covers it.

- **AM-4 (2026-10-29, WS2's spec B v2, social Claude; AGREED: WS2 and WS1 OK'd it at a25de0c4, along with WS3):** `heard` becomes a recorded
  input, without its words.
  - **Why:** Heiko vetoed spec B's first design. He wants Claude to react when it's whispered to, so a brain call may
    open because a line arrived. That trigger must replay, so it must be recorded.
  - **§3:** RecordEvent gains `{ type: 'heard'; from; to? }` (a step). No new reply fields and no new CallKind:
    social replies are writer calls of kind 'playbook', and what plays goes in as playbook edits, e.g.
    `/strategy/stances/<player>`, `/rivalReads/<player>` (WS2's check).
  - **Rules:** RULE-1 row 9, RULE-5 and RULE-6 are restated above.
  - **The §0 non-goal "storing chat text" holds.** The record has who spoke to whom and when, never what.
  - **Versioning:** still `v: 1`. The addition is additive: an older record has no `heard` steps, and before AM-4
    `heard` changed nothing in play.
  - **Build:** a small WS3 PR. `wrap` opens a step in `heard`, with reads taped like any step, and the replay calls
    `game.heard(from, '', to)`. T-AC-12 covers it. It lands before WS2's B-2b, which records social replies.
  - **Spec B HC-B3 carries the two conditions:** (i) whether and where a recorded call opens never depends on chat
    text; (ii) every effect flows through the recorded reply.
  - **Playbook fields WS1 may add** (`Playbook.politics?`, `PlanningPlay.offers?`) reach the record only inside
    PlaybookEntry, additively. The T-AC-11 stableJson comparison is unaffected, because absent fields serialise as
    absent.

## §9 · Ownership Boundaries `[handoff]`

No ownership change.
- WS3 owns the new files: `packages/engine/src/record.ts`, `apps/server/src/record.ts`,
  `apps/server/src/replay-cli.ts` and `apps/server/test/record.test.ts`.
- WS3 already owns `server.ts`, `mule-game.ts` and `apps/server/package.json`.
- `packages/engine/src/index.ts` takes export lines only, which anyone may add.
- WS2's `brain/**` and WS1's `packages/ai/**` are not edited (HC-5).
- After this spec is reviewed, WS1 and WS2 write `PlaybookEntry` only through `recordPlaybook`.
