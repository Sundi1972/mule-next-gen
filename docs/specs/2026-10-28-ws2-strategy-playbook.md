# WS2 · Spec A: Claude writes the strategy and the playbook

**Status:** DRAFT (§0–§9; §1–§9 brought current 29 Oct: schema v1, option B, S-A1), 2026-10-28. Goal gate passed (Heiko, "Yes, as recommended"); approach and class ruled by the
PM the same day (recommended approach widened to Heiko's two layers; class **Programme**). G-A's proof below is
restated for the two layers and **approved by Heiko** ("Yes, all eight", 29 Oct). Prompt and tool design: HOLD lifted (PM, 29 Oct):
Heiko chose option B, a generated manual (C8) and live tools (C9); the MCP server is parked. Build waits for WS1's step 2 (playbook
schema, `validatePlan`, engine plans, triggers) and WS3's game record. Source: Claude Doc "AI Strategy: Playing to
Win" (https://claude.ai/artifact/LCDgi74rrZ1wzDf4V5xaV3), sections "Two layers", "What Claude decides", "The AI's
mind". Spec B (diplomacy, and the shared memory module: notebook, stances, promises) is separate and follows.

## §0 · Business Goals & Value

**G-A · Smart AI players play to a strategy they write in character, check it against what happened, and adjust it;
and they play better for it.** `[handoff]`
⚠ Restated for Heiko via the PM (29 Oct, option B), awaiting his OK: **Smart AI players know every rule, every legal
move and how the game is won; they play to a strategy they write in character, check it against what happened and
adjust it; and they play better for it.** Proof added to UBER-AC-A: the manual covers every client command in
packages/protocol except a short reviewed exclusion list (WS1's coverage test green), and changing a rule's number in
config changes the manual with no hand edit.
- **Who benefits** `[review-only]`: the players at the table, Heiko's playtest first.
- **Today** `[review-only]`: Claude decides one move at a time from a five-line brief (month; own money, plots, goods;
  MULE price; the richest rival), inside the hands' 2.5–5 s waits; 95 of 2,529 asked decisions in the paid trial fell
  back as too slow. No plan, no map of who makes what, no trends, no export wishlist, no evaluation; nothing records
  its choices, so a game with model choices cannot be replayed. `verified_by: read` (packages/ai/src/summary.ts::situation,
  packages/ai/src/brain.ts::Brain.ask) + `executed` (trial 2026-10-28).
- **Value** `[review-only]`: an opponent whose play coheres across months, reads the table and learns within the game,
  at a few cents a game; the real-time phases never wait for a model.
- **UBER-AC-A** (approved 29 Oct): in a paid 20-game run on the same seeds, Claude-playbook seats beat engine-playbook seats
  (bar set with WS1's tournament numbers); ≥80% of the playbooks that take effect carry Claude's accepted edits; no
  phase waits for Claude; replaying any game from its record with the key unset gives the same final scores; all AI
  seats together stay within the $1 table budget (AM-19).

**Non-goals** `[review-only]`: the execution layer and the engine's own playbook (WS1); the land-grant execution and the
game record (WS3); deal cards, trust, votes' rules (WS7); diplomacy, the notebook, stances and promises (spec B,
WS2); memory across games; bring-your-own-key (parked); any model call inside a real-time phase; the MCP server itself (parked by Heiko, 29 Oct, until BYOK, tournaments or
benchmarks need it; C9's definitions are MCP-shaped so it is a wrapper later).

**Rough cost** `[review-only]`: 3 PRs after WS1's step 2 and WS3's record land. Thin baseline (plan as a fourth
decision kind on today's prompt): 1 PR, loses (§0.1).

## §0.1 · Decision Record `[review-only]`
- **Chosen:** the engine drafts a complete legal playbook; Claude, in slack or untimed time, returns the strategy and
  edits to the next phase's playbook with a reason each; WS1's validator clamps them; the result goes into WS3's game
  record; after each phase the engine's outcome report feeds Claude's next brief. 3 PRs.
- **Thin baseline:** the plan as a fourth `DecisionKind` picked through today's `LlmDecider`. 1 PR. **Loses because**
  (a) `buildPrompt` carries only `situation()`, without ownership, trends, wishlist or outcomes; (b) the pick lives in
  `Brain.log`, memory-only and capped at 200, so a replay cannot reproduce it; (c) it cannot set a playbook's tunable
  fields, which Heiko's two layers require.
- **Larger, rejected:** Claude writes whole playbooks free-form. Incomplete or illegal output, ~10× the output tokens,
  and nothing to fall back to mid-phase.

## §0.2 · Constraints `[handoff]`
```
HC-1  No model call inside a real-time phase (land grant, development, auctions). The execution layer never waits for
      Claude; a late reply leaves the engine's playbook in place.                     source: Heiko, two layers · fatal
HC-2  Claude edits only fields WS1's validator exposes, only to values it accepts; the validator's output, never the
      model's, is what plays.                                                          source: PM ruling 1 · fatal
HC-3  Only public information reaches the brief (no other player's goods or unanalysed ground).
                                                                                       source: doc "Fair play" · fatal
HC-4  Every playbook that takes effect is in the game record; a replay never calls the model. source: CLAUDE.md · fatal
HC-5  All AI seats of a game together stay within BRAIN.gameBudgetUsd; a seat past its share plays the engine's
      playbook quietly.                                                                source: AM-19 · fatal
HC-6  packages/ai stays pure (no I/O, no Date.now, no Math.random); the model sits behind a port.
                                                                                       source: CLAUDE.md · fatal
HC-7  Table talk follows the strategy and never lies about game facts or rules.        source: Heiko, 28 Oct · fatal
HC-8  A Rookie seat never attempts a monopoly: the validator clamps its monopolyTarget to null and any edit that
      would corner a good.                                                            source: Heiko, 29 Oct · fatal
HC-9  Every model round trip, tool rounds included, is checked against the seat's share before it is sent and
      ledgered after; a tool handler itself never calls the model or the network.     source: AM-19, PM 29 Oct · fatal
```

## §1 · Solution Design `[handoff]`

```
C1 · ADDED · the strategy brief: what Claude reads before it writes
today        situation(obs, mind) gives five lines · anchors: packages/ai/src/summary.ts::situation
             verified_by: read
tomorrow     MUST build, from the seat's observation only (HC-3): plot ownership and what each player makes; prices
             and store stock with a 3-month trend; the export wishlist; the seat's strategy and its last outcomes
             (PhaseOutcome, playbook v1); the engine's draft playbook and its 3-4 engine plans with their numbers; the
             persona card; recent table talk (quoted, as today). Deterministic, so it caches. The rules live in C8's
             manual (system block), not here: the brief carries only this seat's moment.
seam         packages/ai/src/llm/brief.ts (new) — beside prompt.ts, pure
reuse        neighbours: summary.ts::situation (five lines; stays for the move prompts until C7) and the S-A1 brief in
             apps/server/src/brain/strategy-spike.ts::collectBriefs (situation + prices + landDecision's plans). brief.ts
             grows the latter's shape into packages/ai, pure; situation() is beaten because it has no ownership,
             trends, wishlist or outcomes and cannot grow them without changing every move prompt.
senior       junior would: stuff the whole GameState into the prompt · senior does: a bounded, ordered digest from
             observe(), with the stable part first so the prompt cache holds; each section capped in config
mechanism    sprout
depends_on   WS1 playbook v1 types + engine plans (data, stubbable on the frozen v1 types)

C2 · ADDED · the playbook writer: Claude's strategy and playbook edits through the port
today        LlmDecider picks one option letter · anchors: packages/ai/src/llm/decider.ts::LlmDecider   verified_by: read
tomorrow     MUST send C1's brief with a structured-output schema of {strategy?, edits[{path,to,reason}], line?};
             MUST return the validator's result (accepted edits, rejected with why); never throws to the game.
             MUST check what the schema cannot carry before the validator sees it: string lengths (the API's schema
             takes no maxLength, S-A1) and option ids this brief offered; a failure is one cause code (the S-A1 codes,
             strategy-spike.ts::judgeReply), ledgered, never the reply text.
seam         packages/ai/src/llm/writer.ts (new) — a second consumer of the Complete port
reuse        neighbours: llm/decider.ts::LlmDecider + llm/reply.ts::parseReply (one letter from a fixed list) and the
             S-A1 judge. The writer reuses parseReply's rule (nothing off the list is accepted) and the judge's cause
             codes; LlmDecider is beaten because it returns one option, not a strategy plus field edits.
senior       junior would: parse free text into a playbook · senior does: JSON schema output, edits only, validated by
             WS1's validatePlan; the engine draft stands for every rejected or missing edit; 4 of 20 S-A1 replies
             failed on exactly the checks the schema cannot carry, so those checks are the writer's, not the model's
mechanism    sprout
depends_on   C1; WS1 validatePlan (contract, stubbable)

C3 · MODIFIED · the client takes a per-kind thinking setting
today        thinking: { type: 'disabled' } for every call · anchors: apps/server/src/brain/client.ts::createHaikuComplete
             verified_by: read
tomorrow     MUST send adaptive thinking with a config effort for 'strategy' and 'playbook' calls; moves keep thinking
             off. The model, effort and wait per kind come from config (BRAIN), never from constants or the hands;
             default Haiku 5.5, effort medium (S-A1); §7's model rule may move the strategy call to Sonnet.
seam         apps/server/src/brain/client.ts — the one file that imports the SDK (§9 guard). The S-A1 port
             strategy-spike.ts::createStrategyComplete already sends thinking {type:'adaptive'}, output_config.effort and
             the json_schema format; C3 moves that port into client.ts, keyed by call kind, and the spike imports it back.
senior       junior would: a second client file for strategy calls · senior does: one client, the per-kind settings in
             BRAIN, the S-A1 code promoted rather than rewritten
pin          INV-HC3 and the client tests keep passing for moves; strategy-spike.test.ts keeps passing on the moved port.
mechanism    in_place (client.ts) + extract (from strategy-spike.ts)

C4 · ADDED · when the brain asks, and when a playbook takes effect
today        the brain asks per move inside the phase (seat.ts::planMonth, hands/develop.ts, hands/auction.ts)
             verified_by: read
tomorrow     MUST ask for the next month's strategy + land-grant edits as upkeep opens (month 1: at game start); for
             the development and auction edits in the slack before each (production show, waiting for others); and at
             once on a WS1 re-plan trigger. A reply that lands before its phase starts takes effect; a later one is
             recorded as late and dropped. The engine playbook takes effect otherwise, by 'engine'.
seam         apps/server/src/brain/playbooks.ts (new; not "strategist", which names packages/ai/src/strategist.ts)
             driven from MuleGame's phase changes (a named edit in WS3's mule-game.ts, one touch point) and from
             playGameAsync's hooks (packages/ai/src/play.ts::playGameAsync) in the trial
reuse        neighbours: apps/server/src/brain/index.ts::createBrain (its `busy` set is INV-one-in-flight, one open call per
             seat across deciders) and its budget check; playbooks.ts asks through the same brain so both hold for
             strategy calls too, rather than a second in-flight guard.
senior       junior would: await the model in nextPhase · senior does: fire-and-forget with a deadline at the phase
             start; the phase opens on time with whatever playbook is in effect
mechanism    sprout + one named edit
depends_on   C2; WS3 phase hooks; WS1 triggers

C5 · ADDED · the record: each playbook that takes effect is appended to WS3's game record
tomorrow     MUST append a PlaybookEntry {type:'playbook', at, seq, seat, month, phase, playbook} (playbook v1,
             packages/engine/src/record.ts, WS3) when it takes effect; replay reads it and makes no call.
seam         WS3's record API (contract)
mechanism    sprout
depends_on   C4; WS3 record (data, not stubbable for the replay AC)

C6 · MODIFIED · ledger, budget and trial know the new kinds
today        kinds land | develop | trade (ledger.ts, cli.ts::KINDS, trial-report.ts, spike.ts)   verified_by: read
tomorrow     MUST log 'strategy' and 'playbook' calls with their usage, one line per model round trip (tool rounds
             included, with the round number and cause code); the trial report gets a row per kind and the UBER-AC-A
             measures (edit share, late share, tool rounds per call, the tournament result, cost per game).
mechanism    in_place

C7 · REMOVED · per-move model decisions in real-time phases
today        Brain.ask from the land, develop and trade hands with the hands' waits          verified_by: read
tomorrow     the hands play the playbook (WS1/WS3); Smart seats make no per-move calls. Removed once the execution
             layer reads the playbook, in the same release, so a Smart seat never has neither.
pin          B-AC-3 (keyless game finishes on top picks) keeps passing throughout.
atomicity    with WS1's execution layer
```

```
C8 · ADDED · the manual: every rule, phase, move and the win criteria, generated, in the cached system prompt
             (Heiko, 29 Oct: option B, "one list of moves and rules, made from the game itself")
today        PRIMER in llm/prompt.ts is hand-written: phases in prose, three decision kinds, no win criteria, no
             costs · anchors: packages/ai/src/llm/prompt.ts::PRIMER, packages/ai/src/actions.ts::AiAction
             verified_by: read. AiAction lacks protocol's drone, list, unlist, ready and continue
             (packages/protocol/src/index.ts::MuleIntent), so the AI cannot list a plot or MULE for sale.
tomorrow     MUST render, from WS1's move descriptors plus config only: each phase and its rules; how the game is won
             (Worth exactly as engine/src/game.ts::scoreParts computes it, its lines and the Collapse cut read from
             the code, never restated here: when WS4's #143 moves office under the cut, the manual follows; the
             colony score joins when the code has it, G-5); and every move: what it does, when it is legal, what it
             costs, when it is smart. Byte-stable for a given config, so it sits in the cached system block.
             The level's bounds are stated in the seat's part: a seat whose level has `corners` false is told it
             never aims for a monopoly (HC-8), so it never proposes monopolyTarget or 'monopolist'.
seam         packages/ai/src/llm/manual.ts (new) — pure; prompt.ts and the writer's system block both read it
senior       junior would: write a longer PRIMER by hand · senior does: render from the descriptors and config, so
             a rule change cannot leave it stale; the coverage test (WS1) fails before the manual can miss a move
reuse        neighbours: llm/prompt.ts::PRIMER (hand-written phases) and the S-A1 primer in strategy-spike.ts (PRIMER's
             phases + scoreParts in words). Both are beaten because they are prose a rule change leaves stale; manual.ts
             takes over the system block for strategy and playbook calls, and PRIMER stays for move prompts until C7.
mechanism    sprout
pin          the moves' system text stays byte-stable per persona (cache), held by a snapshot of the manual for the
             default config; a config change moves the snapshot, never a hand edit.
depends_on   WS1 move descriptors in actions.ts (data, stubbable on a descriptor type); rule text from each rule
             owner (WS3 grant, lots, auction; WS7 politics) as named edits

C9 · ADDED · live tools: what Claude can ask the game while it writes
today        no tools: the client sends one message and reads one JSON reply
             · anchors: apps/server/src/brain/client.ts::createHaikuComplete   verified_by: read
tomorrow     MUST offer, in-process via Claude API tool use, in strategy and playbook calls only: legalMoves (now, with
             prices), worth (my scoreParts breakdown), standings (every seat's public Worth), whatIf (a keyless engine
             sim of a playbook over one month). Each handler answers from the seat's observation (HC-3), in process,
             with no model or network call; the model round trip that carries a tool result is what costs, and it is
             checked and ledgered like any call (HC-9, RULE-A4). At most BRAIN.toolRounds round trips per call; tools
             never run inside a real-time phase (HC-1).
seam         packages/ai/src/llm/tools.ts (new, pure definitions + handlers over the observation); the loop in
             apps/server/src/brain/client.ts (the one place that talks to the API)
senior       junior would: hand the model the raw state, or loop on tools without a cap · senior does: MCP-shaped
             definitions (name, description, JSON schema) so a real MCP server later is a wrapper; a round cap and
             the budget check before every round; whatIf reuses the engine sim, never a second rules copy
reuse        neighbours: no model tool use exists in the repo (a search for tool_use across packages and apps finds
             only the web map tools, which are UI); legalMoves reads WS1's descriptors, worth and standings call
             engine/src/game.ts::scoreParts, and whatIf drives packages/ai/src/play.ts's engine loop on a copy of the
             observation, so no rule is restated.
mechanism    sprout (tools.ts) + in_place (client loop)
depends_on   C3 (the client); C8 (the move descriptors); WS1 descriptors; the engine sim entry for one month (WS1,
             contract)
```

## §2 · The Logic `[handoff]`

```
RULE-A1 · Does a written playbook take effect?                       shape: decision table
inputs   reply: none | rejected-all | some-accepted · arrivedBeforePhaseStart: true | false · seatShareLeft: true | false
first match wins
  1  seatShareLeft = false                         engine playbook (by 'engine'); no call was made
  2  reply = none or arrivedBeforePhaseStart=false engine playbook; the late reply is ledgered, not played
  3  reply = rejected-all                          engine playbook; rejections logged for the next brief
  4  otherwise                                     engine draft + accepted edits (by 'llm')
unknown  a reply whose phase has already started counts as late, whatever its content.
examples → §6: no key → engine (B-AC-3) · reply 1 s before the land grant → llm · reply 0.2 s after → engine, late
```

```
RULE-A2 · When the brain asks                                        shape: event table
  upkeep opens (month m)                → strategy + landGrant edits for month m+1, deadline: m+1's land grant
  game start                            → strategy + landGrant edits for month 1, deadline: month 1's land grant
  land grant ends / production show     → development edits (deadline: development start) and auction edits
                                          (deadline: auction start), with the land grant's PhaseOutcome
  WS1 re-plan trigger                   → strategy (+ the next phase's edits), deadline: the next phase start
  at most one open call per seat (INV-one-in-flight stays)
```

```
RULE-A3 · A seat that may not corner never plays a corner (HC-8)      shape: decision table
inputs   corners: AI_LEVELS[level].corners (true | false; false for rookie) · edit path · edit value
first match wins
  1  corners = false, path /strategy/monopolyTarget, to ≠ null   rejected, why 'level never corners'; stays null
  2  corners = false, path /strategy/kind, to 'monopolist'       rejected, same why; the draft's kind plays
  3  corners = false, any /auction/<good> edit whose hold exceeds the draft's hold   clamped to the draft's hold
  4  otherwise                                                    the validator's ordinary bounds
unknown  a seat whose level is missing reads as corners = false (the safe side).
reuse    the gate is the one goodPlan already reads (packages/ai/src/strategist.ts::goodPlan, `mind.level.corners`);
         the validator reads the same flag, no second Rookie check.
owner    the bound lives in validatePlan (WS1, §3); C2's writer also leaves 'monopolist' and monopolyTarget out of a
         corners=false seat's reply schema, so the model is never offered the move.
examples → §6: Rookie + edit monopolyTarget 'smithore' → rejected, null · Trader + same edit → accepted
```

```
RULE-A4 · The tool loop inside one strategy or playbook call (C9)     shape: decision table, evaluated per round
inputs   stop: tool_use | end_turn | max_tokens | refusal · round: 1..BRAIN.toolRounds · shareLeft: the next round's
         worst case fits the seat's share (true | false) · deadline: the phase start not yet passed (true | false)
first match wins
  1  deadline = false                     stop; the reply is late (RULE-A1 row 2); no further round
  2  stop ≠ tool_use                      stop; the reply goes to the writer (C2) as it is
  3  round = BRAIN.toolRounds             one last round with tools withheld, asking for the answer now
  4  shareLeft = false                    stop; the engine playbook plays (RULE-A1 row 1); ledgered 'budget'
  5  otherwise                            run the handlers in process, send their results, next round
unknown  a tool handler that throws answers {is_error: true} with a code, never the exception text; the loop goes on.
examples → §6: round cap 3 → at most 4 round trips · share runs out in round 2 → engine playbook · late → dropped
```

## §3 · Contracts & Data Models `[handoff]`
- **Playbook schema** (ADDED, owned by WS1, frozen with WS3 and WS2): v0.2 at
  `.handover/ws2-findings/playbook-schema-v0.md`, settled by WS3 on 29 Oct: `LandGrantPlay.pressShare: { start; end }` (a
  floor read against the pass's progress, falling start → end; the grant is one pass, `grantSweeps` 1); types in `packages/engine/src/playbook.ts` (WS1 holds the pen,
  a change after the freeze needs all three OKs). WS1, WS3 and WS2 OK'd v1 at type level (29 Oct); the validator enforces 0 ≤ end ≤ start ≤ 1. **v1 is frozen.** `PlanningPlay.list`
  (later, AM-20, mirrors protocol's `list`; WS3 OK'd) is in v1. Its execution, when built, lists only in planning before the
  land auction, and a refusal from `lots.ts::list` (full, not owned, no MULE, minimum out of bounds) is skipped and logged,
  never retried.
  This spec adopts the frozen version by reference.
- **Game record** (ADDED, WS3): types in `packages/engine/src/record.ts` (`GameRecord`, `RecordEvent`,
  `PlaybookEntry`); recorder and replay in `apps/server/src/record.ts`. Derived `notice` events (trades, claims, sales)
  feed PhaseOutcome; the replay ignores them. The append and replay API is WS3's, before its freeze.
- **`validatePlan(state, seat, draft, edits) → { playbook, rejected }`** (ADDED, WS1): bounds per field.
- **Writer reply** (ADDED, WS2, C2): JSON schema `{ strategy?: Strategy, edits: {path, to, reason}[], line?: string }`.
- **Game record entry** (ADDED, WS3): `PlaybookEntry { type: 'playbook', at, seq, seat, month, phase, playbook }` (v1;
  `at` game ms, `seq` the order among timer firings); the record holds every applied action with its game-time stamp,
  one list per game, saved at game end (PM, 28 Oct).
- **Move descriptors** (ADDED, WS1, consumed by C8 and C9): each AiAction in `packages/ai/src/actions.ts` gains
  {what it does, when it is legal, what it costs, when it is smart}, the rule text written by its rule owner. WS2
  stubs on a descriptor type until WS1's lands; the shape is WS1's to propose.
- **Tool definitions** (ADDED, WS2, C9): MCP-shaped `{ name, description, input_schema }` for legalMoves, worth,
  standings, whatIf, in `packages/ai/src/llm/tools.ts`; results are JSON from the seat's observation only. A later MCP
  server wraps these definitions unchanged.

## §4 · Failure & Ops `[handoff]`
| Question | Answer |
|---|---|
| Model unavailable, slow, refuses, junk | RULE-A1 rows 2-3: the engine playbook plays; ledgered with the outcome (C2, C4) |
| Retries | none (HC-3 of the brain spec stays); a trigger may ask again later |
| Idempotency | one playbook per seat per phase; the first to take effect wins; replay reads the record (C5) |
| Races | a reply racing the phase start: the phase start wins (RULE-A1 unknown) |
| Tool handler throws | RULE-A4 unknown: `is_error` with a code; the loop continues; ledgered (C9) |
| Tool loop runs long | RULE-A4 rows 1, 3, 4: the deadline, the round cap and the share each stop it (C9) |
| whatIf is slow | it simulates one month keyless in process, capped by a BRAIN tick limit, answering `is_error` past it (C9) |
| When broken | every game still plays on engine playbooks (C7 pin, B-AC-3) |
| Operator view | ledger kinds strategy/playbook; trial report rows; dev view shows the playbook and its edits |

## §5 · Delivery
Code-only; no existing state to reach. The record starts with WS3's build.

## §6 · Acceptance Criteria `[handoff]`
| id | Given / When / Then | observed_at | negative case | changes |
|---|---|---|---|---|
| B-AC-A1 | Given a Smart seat and a fake model that edits the land-grant ranking / When month 2's land grant runs / Then the seat claims by the edited ranking, and the record holds that playbook by 'llm'. | the claims on the board and the game record | an edit out of bounds → the engine's ranking plays, the edit listed as rejected | C1 C2 C4 C5 |
| B-AC-A2 | Given a game played with Claude playbooks / When it is replayed from its record with the key unset / Then the final scores are identical and no client is built. | final scores; client factory | — | C5 |
| T-AC-A1 (B-AC-A1) | RULE-A1 rows 1-4 with the examples above. | the playbook that takes effect | late by 0.2 s → engine | C4 |
| T-AC-A2 (B-AC-A1) | The brief holds only public facts, in a deterministic order: two seats' briefs never contain another seat's goods. | brief text | — | C1 |
| T-AC-A3 | No call is open inside a real-time phase that the phase waits on: phases start on time with a fake model that never answers. | phase start times | — | C4 C7 |
| T-AC-A5 (HC-8) | RULE-A3 rows 1-3: a Rookie seat's edits that would corner are rejected or clamped; the same edits on a Trader seat pass. | validated playbook, `rejected` | Trader → accepted | C2 |
| T-AC-A4 | Ledger and trial rows for strategy and playbook calls; cost per game within gameBudgetUsd. | ledger file, trial report | — | C6 |
| T-AC-A6 | Strategy and playbook calls send adaptive thinking with BRAIN's model and effort for their kind; move calls keep thinking off and Haiku. | the SDK request a fake records | a move call with thinking → red | C3 |
| T-AC-A7 | The manual is rendered from the descriptors and config only: changing one config number (GAME.plotScore) changes the manual's text; the default config's manual is byte-identical run to run; every AiAction appears in it. | manual text | a move missing from the descriptors → WS1's coverage test red | C8 |
| T-AC-A8 | RULE-A4 rows 1-5: at most BRAIN.toolRounds + 1 round trips; a share that runs out mid-loop stops it; a throwing handler answers is_error and the loop goes on; every round trip has its ledger line. | the fake SDK's requests, ledger lines | a handler's error text in a request → red | C9 C6 |
| T-AC-A9 (HC-3) | No tool result carries another seat's goods or unanalysed ground; whatIf leaves the live game state unchanged. | tool results; state before and after | a rival's stock in worth's answer → red | C9 |

## §7 · Risks & Spikes `[review-only]`
- **S-A1 (spike, APPROVED by Heiko 29 Oct, ~$0.10, cost from the ledger):** Haiku 5.5 + adaptive thinking vs Sonnet 5.5 on the same 20 briefs:
  latency p90 against the slack windows, accepted-edit share, cost. Blocks C3's model choice for the strategy call.
  **Result (run 2026-10-28 UTC, `brain:strategy-spike` on ws2-brain-spike-a1 @ 5da9778, seed 101, effort medium;
  ledger `apps/server/data/strategy-spike-2026-10-28.jsonl`):** 24/24 calls, ledger $0.02156 against the $0.10 cap.
  Haiku 5.5: 20 calls, p50 2.3 s, p90 3.9 s, max 4.2 s, 16/20 valid, all valid ones within bounds; $0.00023 a call,
  ~$0.0055 a seat-game at 24 calls; thought on 10 of 20 calls (mean 110 thinking tokens). Sonnet 5.5: 4 calls, p90
  4.0 s, 2/4 valid; $0.00425 a call ($0.10 a seat-game); never used thinking at effort medium. Both under the 8 s upkeep
  window. List-price estimate before the run: Haiku $0.001-0.002 and Sonnet $0.02-0.04 a call, so 4-9x too high
  (thinking stayed short or off). Invalid replies are structural (an over-long reason or an off-list plan letter);
  the spike recorded no cause, so the next run must log it. Brief ~2.5k tokens at 2.24 chars a token, below
  BRAIN.charsPerToken 2.5. **C3 decision: Haiku 5.5, adaptive thinking, effort medium**: the cheapest, under the
  window, and its validity failures are prompt-side. Sonnet stays affordable at this brief size but is unproven on
  quality; revisit with the real brief (C1, C8) and validatePlan.
  **Model rule (PM, 29 Oct, Heiko's steer: capability first, the budget as the safety net).** Haiku 5.5 with adaptive
  thinking at effort medium is the DEFAULT; the model and effort per call kind stay named BRAIN config values, never
  constants. When validatePlan (WS1) and the real brief (C1 + C8 manual + C9 tools) exist, re-run S-A1 PAIRED on the
  same tool (`brain:strategy-spike`, same briefs, both models): the monthly strategy call moves to Sonnet 5.5 if Sonnet
  is measurably better on accepted edits AND the measured seat share (all calls, tool rounds included, × the calls
  per seat-game) still fits the game budget ÷ the Smart seats. Otherwise Haiku stays. The playbook edit calls stay
  on Haiku unless the same test says otherwise for them.
- **R-A1:** slack windows shorter than the model at fast tables. Mitigation: RULE-A1 row 2; the trial measures the
  late share.
- **R-A2:** the schema freezes late. Closed 29 Oct: v1 frozen (WS1, WS3, WS2); C1-C2 stub on the v1 types until
  WS1's step 2 lands them in packages/engine/src/playbook.ts.
- **R-A3:** the manual and tool rounds make the brief several times S-A1's ~2.5k tokens, so latency and cost move.
  Mitigation: the system block is cached; the paired re-run (S-A1 model rule) measures both before the model choice
  is final; RULE-A4 caps rounds.
- **R-A4:** WS1's descriptors and coverage test land after WS2 wants to build C8. Mitigation: C8 renders from a
  descriptor type stubbed in WS2's tests; the coverage test is WS1's and gates C8's merge, not its start.
- **Landmine (memory, "Configurable balance"):** every number in C1-C9 (caps per section, toolRounds, the whatIf tick
  limit, efforts) is a named BRAIN value. Mitigation: the settings guard holds it.

## §8 · Amendments `[review-only]`
- **AM-A1 · 29 Oct · Heiko via PM:** G-A restated for two layers, approved ("Yes, all eight").
- **AM-A2 · 29 Oct · Heiko via PM:** Rookie never tries a monopoly → HC-8, RULE-A3, T-AC-A5.
- **AM-A3 · 29 Oct · PM, WS1, WS3:** playbook v1 frozen (pressShare {start, end}; PlanningPlay.list later, AM-20;
  types in engine/src/playbook.ts and record.ts) → §3, C1, C5.
- **AM-A4 · 29 Oct · Heiko via PM (option B):** a generated manual and live tools; the MCP server parked → C8, C9,
  RULE-A4, HC-9, T-AC-A7..A9, §9. G-A's line restated again, awaiting Heiko (§0 held).
- **AM-A5 · 28-29 Oct · S-A1 measured, PM:** Haiku 5.5 adaptive, effort medium is the default; model per kind in
  BRAIN; the capability-first re-run rule → C3, §7. The spike's cause codes → C2.
- **AM-A6 · 29 Oct · lead:** C4's seam renamed playbooks.ts (no clash with packages/ai's strategist.ts); C3 promotes
  the S-A1 port instead of a second client. Cost note for §0 (held): C8 and C9 add about 2 PRs, so about 5 in all.

## §9 · Ownership Boundaries `[handoff]`
- Sole owner of Claude's brief, writer and their prompts: `packages/ai/src/llm/` (WS2). The playbook schema and its
  validator: WS1. The game record: WS3. Enforcement: the settings guard and SEAMS named edits; packages/ai purity
  test (no I/O imports) as today.
- The move list: WS1's `packages/ai/src/actions.ts`, which grows descriptors (what, when legal, cost, when smart).
  Each move's rule text is written by its rule owner as a named edit: WS3 land grant, lots and auction; WS7 politics.
  WS1 owns the coverage test: every MuleIntent in packages/protocol has an AI move or sits on a short reviewed
  exclusion list. WS2 owns the manual's rendering (C8) and the tools (C9), and reads the descriptors only.
  Settled at the schema freeze with WS1 and WS3 (PM, 29 Oct).
- The tools (`packages/ai/src/llm/tools.ts`) and the manual (`llm/manual.ts`): WS2. The SDK stays imported by
  `apps/server/src/brain/client.ts` only (the existing §9 guard test); the tool loop lives there.
