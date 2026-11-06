# WS2 · Claude Code plays a seat

**Status:** §0 AGREED (Heiko, 6 Nov, "Agree as written"). Approach **B** and class **Programme** chosen by Heiko (6 Nov).
Side-pick wait chosen by Heiko (6 Nov). Design sections 1 (Heiko), 2 and 3 (PM, under Heiko's design authority, 6 Nov)
approved. Written and self-reviewed 6 Nov by WS2-2, for Heiko's "Read it first". Built after the MVP proof.
Spike: `docs/spikes/2026-11-06-claude-code-seat.md` on `ws2-spike-claude-code-seat` (b88bcbc7, not merged).
Mocks: `design/mocks/claude-code-seat/` @ 526654c1 (PR #471 into ws2-brain; WS4's OK asked via the PM). Lobby: variant **B** recommended (compact row + sheet); variant A's inline row crushes inside the seat list.

## What you'll see at the table `[review-only]`

- In the lobby the host taps a computer seat and picks **Built-in** or **Claude Code**. A Claude Code seat shows a join
  code, a Copy button and one setup line. The host sends the code to whoever's Claude Code should play it: his own, or a
  friend's anywhere. Its chip goes from *waiting for Claude* to *connected*.
- Two Claude Code seats are two codes and two Claude Code sessions. Neither can ever act for the other seat.
- In play the TV and phones show it *thinking*, *ready* or *offline*. It writes its plans and speaks its lines like a
  Smart seat, through the same brief and checks. **When it is late or offline it plays its built-in plan for that
  decision and never holds the table**, unlike a dropped phone.
- The first good's side-pick screen waits up to **45 s** for its auction plan, as it waits for a slow person.
- A dropped laptop pastes the same code again and the seat carries on. Taking the seat back kills the code.
- A player who has to leave hands their own seat to their Claude Code from the phone's Move dialog (a 10-minute code).
- The host pays nothing for these seats, with or without an API key.

## §0 · Business Goals & Value

Source: Heiko, 6 Nov (session 1 transcript, verbatim): "the standard use case for the ai players is that the hosts adds
ai players (non human) and these players are being handed over to claude. It must be possible to have two session
playing two players… the play my player is a nice fallback". Traces to Mission Goal G-2 (Claude as a player).

**G-1 · The host can hand any computer seat to a Claude Code session, his own or a friend's. Each session plays its
seat for the whole game on that person's Pro or Max plan, with no API key.** `[handoff]`
- **Who benefits** `[review-only]`: the host, with Claude opponents and no bill; friends who lend their Claude to the table.
- **Today** `[review-only]`: the only Claude seats are Smart seats on the host's API key, about $0.20 a seat-game on
  Sonnet (uber17s, 5 Nov: $0.397 a game for two seats). Without a key every seat is Classic
  (`apps/server/src/brain/index.ts::createBrain`). A player's own plan can't be used: a third-party app may not offer a
  claude.ai login without Anthropic's approval. verified_by: read; the spike executed the allowed route, one session,
  24/24 in time in four runs.
- **Value** `[review-only]`: Claude opponents for $0 to the host, as many as there are plans behind them, on the route
  Anthropic allows.
- **Proof, UBER-AC-1:** one game where two computer seats are handed to two Claude Code sessions, each logged in on a
  Pro or Max plan with `ANTHROPIC_API_KEY` unset (one may be the host's). Nobody touches either seat until game over,
  and then: for each seat at least 90% of its decisions were answered by Claude within the deadline and the rest played
  by its built-in plan; neither session ever acts for the other seat; the host's cost ledger shows $0 for both seats
  (read as: the brain ledger has no paid line for either seat).

**G-2 · Someone who already has Claude Code connects a seat in under 5 minutes, without help.** `[handoff]`
- **Who benefits** `[review-only]`: the friend running the seat; the host, who doesn't talk them through it.
- **Today** `[review-only]`: the spike needed a hand-written config file, a local script, an environment setting and a
  pasted prompt: a developer's 15–20 minutes, no page explains it. verified_by: executed (spike).
- **Value** `[review-only]`: friends join on their own; it stays a game, not a project.
- **Proof, UBER-AC-2:** a first-timer with Claude Code installed and logged in, given only the setup page and one join
  code, gets the seat to *connected* in under 5 minutes, timed.

**G-3 · A player who has to leave early hands their own seat to their Claude Code, which plays it to the end.** (Fallback.) `[handoff]`
- **Who benefits** `[review-only]`: the leaving player; the table, which keeps a full game.
- **Today** `[review-only]`: the seat stops. `mule-game.ts::connectionChanged` puts it in `away`; planning, upkeep, the
  election and the side pick wait for it until the host presses Continue (`checkAllReady`, `continuePlanning`). verified_by: read.
- **Value** `[review-only]`: a departure no longer stalls the table or leaves a dead seat.
- **Proof, UBER-AC-3:** mid-game a player hands their seat to their Claude Code and closes their phone; the game reaches
  game over without the host pressing Continue for that seat.

**Non-goals** `[review-only]` (each its own spec if ever wanted):
- Players without Claude Code (claude.ai web or desktop, Free plan): needs Anthropic's login approval or channels.
- MCP push channels until generally available; the design keeps the switch clean (one waiting tool).
- Bring-your-own API keys. Running anyone's Claude Code on our machines.
- Playing better than a Smart seat (strength is the tournament's question).
- Claude making the real-time moves (land-grant presses, walking, bidding): the seat's built-in hands play its plans.
- **Hosting the game server on the internet** (technical plan, stage 4). Friends outside the host's network need it;
  this spec rides on it and does not build it (§7 R-1).
- The lobby's Classic/Smart picker (backlogged); the Built-in / Claude Code choice must sit beside it cleanly.
- Persisting games or codes across a server restart.

**Rough cost** `[review-only]`: approach B about 10–11 lane-days (WS2 most; WS4 the screens; WS3 two seams).
Thin baseline A about 6–7 days.

## §0.1 Decision Record `[review-only]`

- **B (chosen), ~10–11 days:** the MCP endpoint and join codes, plus seat status, resume after a dropped session, a
  per-turn rules digest, junk-line screening and a setup page.
- **A (thin baseline), ~6–7 days:** endpoint, join codes, a copy line in the lobby, the built-in fallback, a static page.
  **Why it loses:** a real game runs 45–60 minutes against the spike's 2–6. Without resume one dropped session puts its
  seat on the built-in plan for the rest of the game, which fails UBER-AC-1's 90%; without a status, UBER-AC-2's
  "the seat shows connected" cannot be observed. Both falsifiable by one game with a laptop closed for 3 minutes.
- **C (rejected), ~3 weeks:** B plus a one-command Claude Code plugin and a host dashboard: no goal needs them.
- **Auction deadline:** the production show (~11 s) is the auction write's real deadline today; slow answers took up to
  30 s in the spike. Heiko chose "wait at the side pick, up to 45 s" over "never wait" and "ask a phase earlier".
- **Heartbeat:** `wait_for_my_turn` returns "call again" every 110 s so Claude Code's interactive screen never moves the
  call to the background (2-minute rule, untested in the spike); chosen over a player setting (PM, for G-2).

## §0.2 Constraints `[handoff]`

```
HC-1  A Claude Code seat never causes a model call on the host's key; its writer makes no API call
      and writes no paid ledger line.                         source: G-1     breach: fatal
HC-2  An MCP session acts for exactly one seat, the one its join code named; every tool call after join
      is checked against that binding.                        source: G-1     breach: fatal
HC-3  A Claude Code seat never holds the table: late or offline ⇒ built-in plan; it is never `away`.
      The one wait is the side pick, capped by BRAIN.claudeCode.sidePickWaitMs.  source: Heiko 6 Nov  breach: fatal
HC-4  A plan from Claude Code passes the same writer reply parsing, validator and adoption as a Smart
      seat's (Playbooks unchanged).                           source: section 1  breach: fatal
HC-5  A join code is never logged or shown in full except to the host's own phone and the setup line
      copied from it; codes die at game over or when the host takes the seat back.  source: section 2  breach: fatal
HC-6  Every number here is a named config value in BRAIN.claudeCode (packages/engine/src/config.ts), WS2's block.
                                                              source: CLAUDE.md  breach: needs decision
```

## §1 · Solution Design `[handoff]`

```
C1 · MODIFIED · a computer seat has a kind, builtin or claudeCode, the host sets it in the lobby; a claudeCode seat holds a join code

today        AI seats are only isAi: true with token null; addAi has no parameters ·
             anchors: packages/tabletop/src/room.ts::Room (addAi case :247, addSeat :365),
             packages/tabletop/src/protocol.ts (addAi :13, SeatView :56-66)        verified_by: read
tomorrow     MUST: a host-only, lobby-only message sets an AI seat's kind; switching to claudeCode issues a
             join code (newToken), switching back kills it. MUST: the code reaches only the host's view of
             that seat. MUST: SeatView carries kind and the Claude Code status (C6).
logic        → §2 RULE-1
seam         room.ts::Room.receive — the lobby's other host actions live there
senior       junior would: a second seat list for Claude seats in the game server · senior does: one more
             field on the Room's own Seat, the token mechanism human seats already use, so kick/close/
             handoff all keep working
mechanism    in_place
call sites   Room.receive (one new case); viewFor (:524) for the view; server.ts::parse (:193 area) shape check
pin          addAi's existing behaviour and the lobby tests in packages/tabletop/test stay green
ux           design/mocks/claude-code-seat @526654c1 · #lobby-b (states: host/other phone × builtin/waiting/connected,
             sheet open/closed) · #tv-lobby (waiting/connected) ·
             GRAFT TARGET apps/web/src/phone/Lobby.tsx (SeatRow), apps/web/src/table/TableApp.tsx (TvLobby)
depends_on   —
owner        WS4 (room.ts, protocol.ts, web); WS3 named edit in server.ts::parse
```

```
C2 · ADDED · the game server speaks MCP on /mcp (Streamable HTTP): join, wait_for_my_turn, submit_plan, a play prompt and instructions

today        none_exists on trunk; the spike's hand-written stdio server + local bridge
             (apps/server/spike/mcp-seat.mjs, class Bridge in apps/server/src/brain/spike-seat.ts, spike branch only)   verified_by: read
tomorrow     MUST: POST/GET /mcp in server.ts::handleHttp hands to a new module apps/server/src/claude-code/;
             MUST: before join only `join` is listed; join(code) binds the MCP session to the seat (HC-2);
             MUST: instructions + `play` prompt carry the loop and persona (spike layers 1–2).
logic        → §2 RULE-2 (binding), RULE-3 (turn loop)
seam         server.ts::handleHttp — the one place HTTP routes are added (:96-121)
senior       junior would: a second HTTP server/port, or hand-rolled JSON-RPC as in the spike · senior does:
             the official @modelcontextprotocol/sdk Streamable HTTP transport mounted on the game's own port
             (one setup line, one TLS story when hosted); size caps and per-address join rate limit
mechanism    sprout
call sites   handleHttp only
pin          none, because the route is new; /ws, POST /rooms and static serving keep their tests
reuse check  git grep 'modelcontextprotocol|"mcp|fastmcp' origin/feat/strategist → none; nearest: spike Bridge
             (beaten: stdio + localhost-only, cannot serve a friend's machine)
depends_on   C3 (contract, stubbable)
owner        WS2 (apps/server/src/claude-code/**, new sole owner); WS3 named edit: the route line in server.ts
```

```
C3 · ADDED · a Claude Code seat's plans come from its MCP session through a ClaudeCodeWriter

today        PlaybookWriter.write(kind, ask) is implemented only by the API client; Playbooks gets writers via
             brain.writerFor ·  anchors: apps/server/src/brain/index.ts::PlaybookWriter, ::createBrain,
             apps/server/src/brain/playbooks.ts::Playbooks                      verified_by: read
tomorrow     MUST: write() queues the ask for the seat; wait_for_my_turn hands it out with persona, the phase
             digest (C5) and the brief; submit_plan resolves it as a WriterReply through the same reply parser;
             MUST: ask.signal abort ⇒ resolves no_reply at once; MUST: no API call, no paid ledger line (HC-1).
logic        → §2 RULE-3, RULE-4
seam         brain/index.ts::PlaybookWriter — Playbooks already takes any writer, with late() and signal
senior       junior would: a parallel "remote seat" game path with its own validator · senior does: one more
             PlaybookWriter, so validation, adoption, saysPlan and the a′ spoken line stay today's (HC-4)
mechanism    extract_interface (already extracted) · new implementer
pin          Playbooks tests unchanged
depends_on   —
owner        WS2
```

```
C4 · MODIFIED · a claudeCode seat gets the ClaudeCodeWriter with or without an API key; its move decider stays built-in

today        createBrain returns CLASSIC when ANTHROPIC_API_KEY is missing; writerFor/deciderFor return null for
             every seat (:131-138, :175, :219)                                  verified_by: read
tomorrow     MUST: writerFor(seat) returns the seat's ClaudeCodeWriter when the seat's kind is claudeCode, in
             CLASSIC and keyed brains alike; deciderFor stays null for it. Builtin seats unchanged.
logic        → §2 RULE-4
seam         brain/index.ts::createBrain / writerFor — the one place a seat's writer is chosen
senior       junior would: require a key for Playbooks · senior does: the writer choice per seat kind, so a
             keyless host gets Claude Code seats and keyed Smart seats keep their budget logic untouched
mechanism    wrap
call sites   Playbooks constructor (playbooks.ts:108); mule-game.ts::start (:516-533) via brain
pin          the keyed and keyless trial tests (apps/server/test/brain-*.test.ts) stay green
depends_on   C3
owner        WS2 (brain/**); the seat kind reaches AiSeat construction in mule-game.ts::start (WS2's agreed spot)
```

```
C5 · ADDED · a per-phase rules digest for Claude Code turns instead of the whole manual each turn

today        WRITER_SYSTEM includes the full defaultManual() (~22k chars, spike doc :65); PHASES record in
             manual.ts:106 rendered by renderManual (:272)                       verified_by: read
tomorrow     MUST: a digest renderer from PHASES for land and auction; the turn carries the digest, the
             instructions carry the manual once. Byte-stable like the manual (T-AC-A7 style pin).
seam         packages/ai/src/llm/manual.ts — the manual's own renderer
senior       junior would: a hand-written summary string that drifts from config · senior does: render from the
             same PHASES/config so a config change moves both
mechanism    sprout
owner        WS2
```

```
C6 · ADDED · each Claude Code seat has a status: waiting, connected, thinking, ready, offline

today        SeatView.connected is `s.isAi || s.conn !== null`; chips AI/HOST/PHONE/AWAY        verified_by: read
tomorrow     MUST: the claude-code module computes the status (§2 RULE-5) and the Room publishes it in SeatView;
             lobby, TV and phones render it per the mock.
seam         room.ts::viewFor (:524) — every screen's seat data comes from it
mechanism    in_place
ux           design/mocks/claude-code-seat @526654c1 · #tv-ready, #phone-ready (stages planning / side pick first
             good / 45 s running out; thinking counts as ready except at the side pick) ·
             GRAFT TARGET TableApp.tsx (TvLobby, TvGame ready list), apps/web/src/phone/hub/ReadyBar.tsx, apps/web/src/phone/Lobby.tsx::SeatRow
depends_on   C1, C2
owner        WS4 (room/protocol/web), WS2 (status computation)
```

```
C7 · MODIFIED · the side pick waits for a Claude Code seat's auction plan, up to 45 s

today        the auction write is asked at development→production (mule-game.ts::nextPhase :904) and aborted at
             the auction's start (playbooks.ts::takePhase :267, mule-game.ts :956); the side pick has no clock
             (WALK.statusMs null) and ends when every seat is Done or on Continue          verified_by: read
tomorrow     MUST: a claudeCode seat is Done at the first good's side pick only when its auction plan has come
             or BRAIN.claudeCode.sidePickWaitMs has passed since the side pick opened; its ask is aborted then,
             not at the auction's start. Later goods' side picks don't wait. Other seats unchanged.
logic        → §2 RULE-6
seam         mule-game.ts scheduleAuctionTick (:1436) / auctionDone — where the side pick's Done is known
senior       junior would: lengthen the production show for everyone · senior does: wait only where the table
             already waits for people, only for the seat that needs it, capped
mechanism    in_place
pin          the auction e2e and side-pick tests stay green with no Claude Code seat
depends_on   C3
owner        WS3 (mule-game.ts) — named edit, WS3's OK
```

```
C8 · ADDED · a player hands their own seat to their Claude Code mid-game

today        handoff issues a 2-minute one-time code that moves the seat to another phone (room.ts :272,
             moveHere :319); AiSeats are built only at start() (mule-game.ts :516)        verified_by: read
tomorrow     MUST: the Move dialog's second choice issues a hand-over code with BRAIN.claudeCode.handoverCodeMs;
             a join with it lets the phone go, turns the seat claudeCode, and the game builds its AiSeat and its
             Playbooks entry from that month on; MUST: it stops being `away` at once.
logic        → §2 RULE-7
seam         room.ts::moveHere (the existing hand-over) + a new game hook seatBecameComputer
senior       junior would: a new "bot replaces player" path beside the room · senior does: the room's handoff
             with a different destination, and the game's own AiSeat construction reused mid-game
mechanism    sprout (hook) + in_place (room)
ux           design/mocks/claude-code-seat @526654c1 · #move (10:00 code, last seconds, expired, Claude joined) · GRAFT TARGET apps/web/src/phone/Shell.tsx::MoveDialog
depends_on   C1, C3, C4
owner        WS4 (room, web), WS3 (the hook in mule-game.ts), WS2 (AiSeat + Playbooks entry)
```

```
C9 · ADDED · a setup page at /claude-code

today        none_exists; static serving with index.html fallback in server.ts (:115-119)   verified_by: read
tomorrow     MUST: three steps (the `claude mcp add` line, the `/mcp__mule__play <code>` kick-off, leave it
             running or run headless) and the resume line, per the mock.
ux           design/mocks/claude-code-seat @526654c1 · #setup (direct; from a seat with the code filled in) · GRAFT TARGET new: apps/web/src/setup/ClaudeCodeSetup.tsx
owner        WS4
```

```
C10 · MODIFIED · junk lines are dropped

today        reply.ts::cleanLine (:34): one line, quotes stripped, cap BRAIN.maxLineChars 140; no junk filter
             (the spike's line "x" reached the table)                                verified_by: read
tomorrow     MUST: a line with fewer than BRAIN.minLineLetters letters is dropped (no line said); all seats.
seam         packages/ai/src/llm/reply.ts::cleanLine — every Claude line passes it
mechanism    in_place
pin          existing cleanLine tests
owner        WS2
```

## §2 · The Logic `[handoff]`

```
RULE-1 · Seat kind and its code                                       shape: decision table
inputs   actor host|other · phase lobby|play · seat isAi · kind builtin|claudeCode
  #  when                                          then
  1  actor ≠ host or phase ≠ lobby or !isAi        refuse (no change)
  2  set claudeCode, kind = builtin                kind := claudeCode; code := newToken(); status waiting
  3  set builtin, kind = claudeCode                kind := builtin; code := null (dies at once); bound session told "seat taken back"
  4  otherwise                                     no change
game over ⇒ every code null. Start is allowed while a claudeCode seat is waiting: it plays its built-in plan until
Claude joins (HC-3; mock #lobby-b note).
examples  host sets seat 3 Claude Code → code shown on host phone only · non-host tries → refused
```

```
RULE-2 · Join binding                                                  shape: decision table
inputs   code matches a live seat code yes|no · rate limit exceeded yes|no · seat already bound yes|no
  #  when                         then
  1  rate limit exceeded          refuse "too many tries" (no lookup)
  2  no match                     refuse "no such seat" (same text for wrong, expired, guessed)
  3  match, already bound         bind the new session; old session's next call → "seat taken over"; open ask re-offered
  4  match, not bound             bind; status connected
After binding, every call carries the session id; a call for any other seat is impossible (no seat parameter).
```

```
RULE-3 · wait_for_my_turn                                               shape: decision table
  #  when                                    then
  1  seat taken back / game over              return that, end
  2  an open ask exists, not yet answered     return it (ask_id, persona, digest, brief, edits allowed, ms left); status thinking
  3  waited BRAIN.claudeCode.heartbeatMs      return "still waiting, call again"
unknown: no call for heartbeatMs + offlineGraceMs ⇒ status offline (open asks still resolve by their own deadline).
```

```
RULE-4 · submit_plan                                                     shape: decision table
  #  when                                    then
  1  ask_id not this seat's open ask           refuse "unknown or closed ask"
  2  ask already answered                      refuse "one answer per ask"
  3  ask aborted (late)                        refuse "too late, played the built-in plan"
  4  otherwise                                 parse + validate as a Smart reply; resolve the write; return accepted/refused edits; status ready
```

```
RULE-5 · Status                                                          shape: state machine
  waiting   --join-->            connected
  connected --ask handed out-->  thinking
  thinking  --plan answered-->   ready      --next ask handed out--> thinking
  thinking  --ask aborted-->     connected
  any bound --no call for heartbeatMs+offlineGraceMs--> offline --join or next call--> connected
  any       --host switches to builtin / game over--> (no status; seat is builtin or the game ended)
```

```
RULE-6 · Side-pick Done for a claudeCode seat (first good only)       shape: decision table
  #  when                                                    then
  1  auction plan answered                                   Done
  2  now − sidePickOpenedAt ≥ BRAIN.claudeCode.sidePickWaitMs   abort the ask; Done (built-in plan)
  3  otherwise                                               not Done
Other goods: Done as builtin AI seats today. Host's Continue still ends the side pick (aborts the ask).
Everywhere else a thinking claudeCode seat counts as ready (ReadyCount / WaitingFor): "thinking" is a label, never a
wait. Only this side pick lists it under "Waiting for", with the countdown (mock #tv-ready, #phone-ready).
```

```
RULE-7 · Hand-over of a human seat                                       shape: sequence
phone Move → "Hand my seat to Claude Code" → hand-over code (handoverCodeMs) → join(code) in RULE-2 →
room lets the phone go (as moveHere) → seat kind claudeCode, isAi stays false in the record of who joined →
game hook: remove from away, build AiSeat (persona from the seat's species/default), add to Playbooks from the
next ask on. Code expires unused ⇒ nothing changes.
```

## §3 · Contracts & Data Models `[handoff]`

- **MCP tools** (ADDED, C2): `join{code:string}` → `{seat, name, persona, game}` | error;
  `wait_for_my_turn{}` → `{kind:'ask', ask_id, phase:'land'|'auction', persona, digest, brief, edits_allowed, ms_left}` |
  `{kind:'again'}` | `{kind:'taken_back'}` | `{kind:'taken_over'}` | `{kind:'game_over'}`;
  `submit_plan{ask_id, edits:[{path,to,reason}], line}` → `{accepted:[…], refused:[{edit, why}]}` | error.
  Prompt `play{code}`. Edit shape = the API writer's (packages/ai/src/llm/writer.ts::WriterReply). Breaking: no (new).
- **Tabletop protocol** (MODIFIED, C1/C6/C8): client `{t:'setSeatKind', seatId, kind}`; client `{t:'handoverToClaude'}`;
  server `handoverCode{code, expiresAt}`; `SeatView` gains `kind?: 'builtin'|'claudeCode'`, `claude?: 'waiting'|
  'connected'|'thinking'|'ready'|'offline'`, and `joinCode?: string` only in the host's own view. Optional fields:
  non-breaking for old clients.
- **Config** (ADDED, HC-6): `BRAIN.claudeCode = { sidePickWaitMs: 45_000, heartbeatMs: 110_000, offlineGraceMs:
  20_000, handoverCodeMs: 600_000, joinsPerMinutePerAddress: 10, maxRequestBytes: 64_000 }`; `BRAIN.minLineLetters: 2`.

## §4 · Failure & Ops `[handoff]`

| Question | Answer |
|---|---|
| Dependency unavailable | Claude Code session gone / plan exhausted / slow ⇒ asks time out ⇒ built-in plan (RULE-6, HC-3). Hosting absent ⇒ only same-network friends (§7 R-1). |
| Retry / poison / page | No retries server-side; Claude Code calls again. Malformed MCP request ⇒ JSON-RPC error, session kept. Nothing pages. |
| Idempotency | One answer per ask (RULE-4); join is idempotent per code (rebinding = resume). |
| Races | submit vs abort: whichever settles the write first wins; the other gets "too late". Two sessions on one code: the latest join wins (RULE-2 #3). |
| What works when broken | Everything except Claude Code seats, which play built-in; Smart and Classic seats untouched. |
| How an operator knows | Seat chips; a per-seat line at game over in the server log: asks, answered in time, late, refused edits (codes never logged, HC-5). |

## §5 · Delivery `[handoff]`

Code-only; no existing state (games and codes are in memory). Adds `@modelcontextprotocol/sdk` to apps/server
(lockfile change in the PR that adds C2). Rollback = revert; no point of no return.

## §6 · Acceptance Criteria `[handoff]`

| id | Given / When / Then | verifies | observed_at |
|---|---|---|---|
| B-AC-1 | Given a lobby with a computer seat, When the host picks Claude Code, Then his phone shows a join code, Copy and the setup line, the chip says waiting, and no other phone or the TV shows the code. Negative: a non-host can't change the kind. | C1 | rendered phone/TV views |
| B-AC-2 | Given a Claude Code seat, When a session joins with its code, Then every screen's chip says connected; when it is writing, thinking. | C2, C6 | SeatView on every client |
| B-AC-3 | Given two Claude Code seats joined by two sessions, When the game runs to game over, Then each seat's plans came only from its own session and neither session can reach the other seat. Negative: session A submitting B's ask_id is refused. | C2, C3 | MCP responses + game record |
| B-AC-4 | Given a Claude Code seat whose session doesn't answer, When the land grant starts, Then the seat plays its built-in plan and the table never waits. | C3, C7 | game record + timing |
| B-AC-5 | Given the first good's side pick and a Claude Code seat with no plan yet, When 45 s pass, Then that seat is Done on its built-in plan; a plan at 20 s makes it Done at 20 s (the side pick then ends when the others are Done, as today). | C7 | side-pick end time |
| B-AC-6 | Given a bound session that drops, When the same code joins again, Then the seat carries on and an open ask is offered again. | C2 | MCP responses |
| B-AC-7 | Given a Claude Code seat, When the host switches it back to Built-in, Then its code is refused at once and the bound session is told "seat taken back". | C1 | MCP responses |
| B-AC-8 | Given a player mid-game, When they hand their seat to Claude Code and close the phone, Then the game reaches game over without a Continue for that seat. | C8 | game record |
| B-AC-9 | Given no API key, When a game with a Claude Code seat runs, Then that seat writes plans and the ledger has no paid line for it. | C4, HC-1 | brain ledger file |
| B-AC-10 | Given the setup page and a code, When a first-timer follows it, Then the seat shows connected in under 5 minutes. | C9 | timed user test (UBER-AC-2) |
| T-AC-1 (serves B-AC-3) | Every tool call after join resolves the seat from the session binding only; no tool takes a seat parameter. | C2 | /mcp route test, real Room + MuleGame |
| T-AC-2 (serves B-AC-4, B-AC-5) | ClaudeCodeWriter.write resolves no_reply in the same tick its ask.signal aborts; a later submit gets "too late". | C3 | unit + route test |
| T-AC-3 (serves B-AC-9) | With ANTHROPIC_API_KEY unset, writerFor(claudeCode seat) is a ClaudeCodeWriter and deciderFor is null; builtin seats null as today. | C4 | brain test |
| T-AC-4 (serves B-AC-2) | wait_for_my_turn returns "again" after heartbeatMs; no call for heartbeatMs+offlineGraceMs ⇒ offline. Fake clock. | C2, C6 | route test |
| T-AC-5 (serves HC-5) | No log line or non-host view contains a join code. | C1, C2 | log capture + views |
| T-AC-6 (serves B-AC-4) | The phase digest is byte-stable and moves with config, like the manual pin. | C5 | snapshot |
| T-AC-7 | A line with fewer than minLineLetters letters is not said. Negative: "OK" with min 2 is said. | C10 | chat record |
| T-AC-8 (serves B-AC-3) | Joins over joinsPerMinutePerAddress are refused; bodies over maxRequestBytes rejected. | C2 | route test |

Invariant for every test: a Claude Code seat is never in `away`.

## §7 · Risks & Spikes `[review-only]`

- **R-1 Hosting.** Friends anywhere need the game server on the internet (HTTPS). Not built here. Mitigation: UBER-AC-1
  is run with the host's own second session or a friend on the same network until stage 4; the spec names it as the
  dependency for "anywhere".
- **R-2 Two sessions on one plan** share its usage window (spike measured one). Mitigation: UBER-AC-1 runs two sessions,
  one possibly the host's; the built-in fallback covers a throttled seat.
- **R-3 Interactive screen's background move** untested. Mitigation: the 110 s heartbeat (RULE-3); one interactive
  test in the UBER-AC-2 run.
- **R-4 Mid-game AiSeat construction (C8)** has never been done. Mitigation: build C8 last, behind its own PR, with a
  real-room test; G-3 is the fallback goal, so it may ship after G-1.
- **R-5 Exposure**: an open /mcp route on the internet. Mitigation: no tools before join, 122-bit codes, rate limits,
  size caps, codes die (HC-5, T-AC-8).
No spike needed beyond what was done (6 Nov).

## §8 · Amendments `[review-only]`

None yet.

## §9 · Ownership Boundaries `[handoff]`

### Ownership: the Claude Code seat's MCP endpoint and sessions
- Sole owner: WS2, `apps/server/src/claude-code/**` (new) and `apps/server/src/brain/**`.
- Read contract: the Room's seat kind/code (C1) and the game's asks through Playbooks/PlaybookWriter.
- Write contract: seat status into the Room through one method (C6); plans only through submit_plan → ClaudeCodeWriter.
- Enforcement: package boundary (server-only module); named edits for WS3's server.ts route line and mule-game.ts
  (C7, C8 hook); WS4 owns room.ts/protocol.ts/web and the mocks.

### Ownership: seat kind and join code
- Sole owner: WS4, `packages/tabletop/src/room.ts` (Seat record). WS2 reads it; never a second store of codes.
- Enforcement: the claude-code module looks codes up through a Room method only.
