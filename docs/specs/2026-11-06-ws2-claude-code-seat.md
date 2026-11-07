# WS2 · Claude plays a seat (any Claude app)

**Status:** **AMENDMENT 1 APPROVED (Heiko, 6 Nov, via the PM):** any Claude app (Code, Desktop, claude.ai, phone),
one MULE connector per person, the seat code on every call; Heiko chose D-1 b (with its condition), D-2 c, D-3 a and
D-4 b (§0.1). Applied throughout (§8). Open: spike (b)'s numbers (the hold length, UBER-AC-1's bar for chat apps).
Before the amendment: §0 AGREED (Heiko, 6 Nov, "Agree as written"); approach **B**, class **Programme** and the
side-pick wait chosen by Heiko; design sections 1 (Heiko), 2 and 3 (PM, under Heiko's design authority) approved.
Mocks: `design/mocks/claude-code-seat/` @ 526654c1 (lobby variant **B**); the setup line in them becomes Copy invite
and the connector steps (C11) before the screens are built. Plan: `docs/plans/2026-11-06-ws2-claude-seat.md`.

## What you'll see at the table `[review-only]`

**Once per person, not per game or seat:** you add the **MULE** connector to your Claude account: Settings →
Connectors → Add custom connector, one fixed address, "No sign in". It then works in Claude Desktop, claude.ai and
the Claude phone app (connectors added on the computer reach the phone at its next login); Claude Code gets the same
address with one command. Nothing else to install, no account with us, no API key.

**In the lobby** the host taps a computer seat and picks **Built-in** or **Claude**. A Claude seat shows its **seat
code** (like `K7QM-42`) and a **Copy invite** button. The invite is one ready-made message: *"Play MULE seat K7QM-42.
Keep calling wait_for_my_turn with the code and answer every decision with submit_plan until the game is over. Don't
stop to ask me."* The host sends it to whoever's Claude should play: his own, or a friend's anywhere.

**To play,** that person opens a new chat with MULE switched on and pastes the invite. That chat plays that seat; a
second chat with a second code plays a second seat. The connector never changes; only the code in the chat does.
The seat's chip goes *waiting for Claude* → *connected*.

**In play** the TV and phones show it *thinking*, *ready* or *offline*, as in the mocks. It writes its plans and speaks
its lines like a Smart seat, through the same brief and checks. **When Claude is late, or the chat has stopped, the
seat plays its built-in plan and never holds the table.** The first good's side pick still waits up to 45 s for it.

**When a chat stops.** Claude Desktop, claude.ai and the phone app end a reply at some point, unlike Claude Code,
which keeps going. How long a chat plays on its own before it stops, and whether the phone keeps playing when locked,
is what Heiko's seat test (spike (b)) measures. **[Spike (b) result goes here.]** When it stops, typing "continue" in
that chat (or pasting the invite into any chat) brings Claude back on the next decision; in between the seat played
its built-in plans.

**Taking it back.** The host switches the seat back to Built-in and the code stops working at once. A player who has
to leave hands their own seat to Claude from the phone's Move dialog: it shows an invite whose code works for 10
minutes to start.

**Where it works.** Claude Desktop, claude.ai and the phone reach the connector **from Anthropic's cloud**, so the
table must be reachable from the internet, not only from the home Wi-Fi (Anthropic's connector docs, 6 Nov). Claude
Code reaches it on the home Wi-Fi with nothing extra. How the table becomes reachable is decision D-2 in §0.1: Heiko chose a fixed address on the host's own domain that opens
only the seat connection to the internet (the game itself stays on the home network).

**The host pays nothing** for these seats, with or without an API key; each Claude runs on its owner's plan.

## §0 · Business Goals & Value

Source: Heiko, 6 Nov (session 1 transcript, verbatim): "the standard use case for the ai players is that the hosts adds
ai players (non human) and these players are being handed over to claude. It must be possible to have two session
playing two players… the play my player is a nice fallback". Traces to Mission Goal G-2 (Claude as a player).

**G-1 · The host can hand any computer seat to a Claude chat in any Claude app (Claude Code, Desktop, claude.ai or
the phone), his own or a friend's. Each chat plays its seat for the whole game on that person's own plan, with no API
key.** *(Widened from Claude Code by Amendment 1, Heiko 6 Nov.)* `[handoff]`
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
  (read as: the brain ledger has no paid line for either seat). *Amendment 1:* this bar holds for Claude Code; for
  a Desktop or phone chat the proof counts one "continue" per N minutes as untouched, N set from spike (b)
  **[N from spike (b)]**.

**G-2 · Someone who already has a Claude app connects a seat in under 5 minutes, without help.** `[handoff]`
- **Who benefits** `[review-only]`: the friend running the seat; the host, who doesn't talk them through it.
- **Today** `[review-only]`: the spike needed a hand-written config file, a local script, an environment setting and a
  pasted prompt: a developer's 15–20 minutes, no page explains it. verified_by: executed (spike).
- **Value** `[review-only]`: friends join on their own; it stays a game, not a project.
- **Proof, UBER-AC-2:** a first-timer with a Claude app installed and logged in, given only the setup page and one
  invite, adds the MULE connector and gets the seat to *connected* in under 5 minutes, timed (in Claude Desktop, and
  separately in Claude Code).

**G-3 · A player who has to leave early hands their own seat to their Claude, which plays it to the end.** (Fallback.) `[handoff]`
- **Who benefits** `[review-only]`: the leaving player; the table, which keeps a full game.
- **Today** `[review-only]`: the seat stops. `mule-game.ts::connectionChanged` puts it in `away`; planning, upkeep, the
  election and the side pick wait for it until the host presses Continue (`checkAllReady`, `continuePlanning`). verified_by: read.
- **Value** `[review-only]`: a departure no longer stalls the table or leaves a dead seat.
- **Proof, UBER-AC-3:** mid-game a player hands their seat to their Claude and closes their phone; the game reaches
  game over without the host pressing Continue for that seat.

**Non-goals** `[review-only]` (each its own spec if ever wanted):
- Logging in to Anthropic from inside our app (not allowed without Anthropic's approval). More than one connector per
  person (Amendment 1 removed the old "players without Claude Code" non-goal).
- MCP push channels until generally available; the design keeps the switch clean (one waiting tool).
- Bring-your-own API keys. Running anyone's Claude Code on our machines.
- Playing better than a Smart seat (strength is the tournament's question).
- Claude making the real-time moves (land-grant presses, walking, bidding): the seat's built-in hands play its plans.
- **Hosting the game server on the internet** (technical plan, stage 4). This spec exposes only /mcp through the
  host's own tunnel (D-2 c, C10a) and does not host the game (§7 R-1).
- The lobby's Classic/Smart picker (backlogged); the Built-in / Claude choice must sit beside it cleanly.
- Persisting games or codes across a server restart.

**Rough cost** `[review-only]`: approach B about 10–11 lane-days (WS2 most; WS4 the screens; WS3 two seams).
Thin baseline A about 6–7 days.


## §0.1 Decision Record `[review-only]`

Four decisions from Amendment 1, each with its options and the one Heiko chose (6 Nov, via the PM: "approved the four
recommendations"). The earlier choices (approach B over the thin baseline, the 45 s side-pick wait) stand and are
recorded at the end.

**D-1 · Which Claude apps the first build serves**
| Option | Cost | For | Against |
|---|---|---|---|
| a. Claude Code only (as agreed) | B as specced, ~10–11 days | measured in the spike: 24/24 in time, no stops | not what Heiko asked: most friends have the Desktop or phone app, not Claude Code |
| **b. Any Claude app, one connector (recommended)** | ~+1–2 days on B, plus D-2 | Heiko's ask; one connector per person, the same in every app | chat apps may stop between replies (D-4, spike (b)); needs the table on the internet (D-2) |

**Chosen: b** (Heiko, 6 Nov), with this condition: provided spike (b) shows a Desktop chat plays at least several months on its own; if it stops after
one or two decisions, ship **a** first and add the chat apps when Anthropic documents a longer-running mode.

**D-2 · How Desktop, claude.ai and the phone reach a table on the home Wi-Fi.** They call from Anthropic's cloud,
so the address must be public HTTPS (documented). Claude Code needs none of this.
| Option | Cost | For | Against |
|---|---|---|---|
| a. Wait for stage 4 (the game server hosted on the internet) | 0 here | no new moving parts | Desktop and phone can't play until stage 4 ships |
| b. A quick tunnel started with the game (random address each time) | ~1 day | no account, nothing to buy | the address changes every game, so everyone re-adds the connector each time: breaks "once per person" |
| **c. A fixed tunnel address on the host's own domain, only `/mcp` exposed (recommended now)** | ~1–2 days, plus a one-time Cloudflare and domain setup by the host | fixed address, so each person adds the connector once; the rest of the game server stays private | each host needs that setup; a friend who plays at two hosts adds two connectors |
| d. One public MULE relay at a fixed address; every game server dials out to it and the code routes the call | ~5–7 days plus a small hosted service we run (uptime, cost, abuse) | one connector per person for every host, no host setup | the most to build and run; it is half of stage 4 |

**Chosen: c** (Heiko, 6 Nov) for Heiko's table now, with the connector address a single config value so **d** or stage 4 replaces it
without anyone's chat changing. Reason: Heiko is the host today; d pays off only when there are other hosts.

**D-3 · The seat code, now the only credential.** Every tool call carries it; the server keeps no session (PM direction).
One finding changes the old guard: calls from Desktop, claude.ai and the phone **all arrive from Anthropic's addresses**,
so the old per-address rate limit cannot tell a guesser from a player.
| Option | For | Against |
|---|---|---|
| **a. Short code like `K7QM-42` (about 27 bits) + a game-wide limit on wrong codes only (recommended)** | readable, Heiko's ask; a right code is never slowed; at 20 wrong tries a minute, hitting any of four live codes takes about a year on average | a flood of wrong codes can't be told apart by sender; the limit only slows the flood, which is harmless to players |
| b. Long code (16+ characters), pasted only | unguessable without any limit | can't be read out across the table; the invite is pasted anyway, so it costs little in practice |

**Chosen: a** (Heiko, 6 Nov). Either way: the code dies when the host takes the seat back or the game ends, is never logged in full, and two chats
holding the same code are both that seat, with the first answer to each decision winning.

**D-4 · How a chat waits for its turn.** **Chosen: b** (Heiko, 6 Nov), the value from his seat test: **45 s for Claude Code** (it drops a call at 60 s; measured 7 Nov); the chat apps' value is still owed by the Desktop/phone half.
| Option | For | Against |
|---|---|---|
| a. Hold the call up to 110 s, then "call again" (as specced) | fewest calls; fine in Claude Code | chat apps may cut a call well before 110 s (unofficial reports: 60 s) |
| **b. Hold up to the longest wait the test shows survives, minus a margin (recommended)** | measured, not guessed; one config value | more calls a game in chat apps |
| c. Never hold: answer at once "not yet, call again in N s" | no timeout risk at all | many calls a turn; a chat may hit its own limit sooner and stop |

**Earlier choices, kept**
- **B (chosen, Heiko), ~10–11 days** before this amendment: endpoint, codes, seat status, resume, per-turn digest,
  junk-line screening, setup page. Under Amendment 1, resume is simpler: no session to rebind; pasting the invite into
  any chat carries on.
- **A (thin baseline), ~6–7 days:** endpoint, codes, a copy line, the built-in fallback, a static page. **Why it loses:**
  a real game runs 45–60 minutes; without a status, UBER-AC-2's *connected* can't be seen, and in a chat app the player
  can't tell the seat has stopped and needs "continue".
- **C (rejected), ~3 weeks:** B plus a one-command plugin and a host dashboard: no goal needs them.
- **Auction deadline:** Heiko chose "wait at the side pick, up to 45 s" over "never wait" and "ask a phase earlier".

**Rough cost with the choices (b, c, a, b):** about 12–14 lane-days (WS2 most; WS4 the screens and mocks;
WS3 two seams), against 10–11 for Claude Code only.

## §0.2 Constraints `[handoff]`

```
HC-1  A Claude seat never causes a model call on the host's key; its writer makes no API call and writes
      no paid ledger line.                                    source: G-1     breach: fatal
HC-2  A tool call acts only for the seat its code names; a chat holding one code can never act for another
      seat. The server keeps no MCP session; the code on each call is the only credential.
                                                              source: D-3 (Heiko 6 Nov)  breach: fatal
HC-3  A Claude seat never holds the table: late, stopped or offline ⇒ built-in plan; it is never `away`.
      The one wait is the first good's side pick, capped by BRAIN.claudeSeat.sidePickWaitMs.
                                                              source: Heiko 6 Nov  breach: fatal
HC-4  A plan from a Claude seat passes the same writer reply parsing, validator and adoption as a Smart
      seat's (Playbooks unchanged).                           source: section 1  breach: fatal
HC-5  A seat code is never logged in full and is shown only on the host's own phone and in the invite copied
      from it (and on the leaving player's phone for a hand-over); codes die at game over or when the host
      takes the seat back.                                    source: section 2, D-3  breach: fatal
HC-6  Every number here is a named config value in BRAIN.claudeSeat (packages/engine/src/config.ts), WS2's
      block; the public connector address is one server setting, never written into code or mocks.
                                                              source: CLAUDE.md, D-2  breach: needs decision
HC-7  Only /mcp is reachable from the internet; the tunnel exposes no other path (rooms, /ws, static files
      stay on the home network).                              source: D-2 (Heiko 6 Nov)  breach: fatal
```

## §1 · Solution Design `[handoff]`

Naming: the seat kind is `claude` (any Claude app); the module is `apps/server/src/claude-seat/`; the config block
is `BRAIN.claudeSeat`. None of these exist on trunk yet (`git grep claudeCode|claude-code|claudeSeat` on
origin/feat/strategist, 6 Nov: no hits outside `design/mocks/`).

```
C1 · MODIFIED · a computer seat has a kind, builtin or claude, the host sets it in the lobby; a claude seat holds a seat code and an invite

today        AI seats are only isAi: true with token null; addAi has no parameters ·
             anchors: packages/tabletop/src/room.ts::Room (addAi case :247, addSeat :365),
             packages/tabletop/src/protocol.ts (addAi :13, SeatView :56-66)        verified_by: read
tomorrow     MUST: a host-only, lobby-only message sets an AI seat's kind; switching to claude issues a seat code
             (format §3: 4 letters from an unambiguous alphabet, a dash, 2 digits), switching back kills it.
             MUST: the code and the invite text (§3) reach only the host's view of that seat.
             MUST: SeatView carries kind and the Claude status (C6).
logic        → §2 RULE-1
seam         room.ts::Room.receive — the lobby's other host actions live there
senior       junior would: a second seat list for Claude seats in the game server · senior does: one more
             field on the Room's own Seat, beside the token mechanism human seats already use, so kick/close/
             handoff all keep working; a code generator with a uniqueness check against live codes
mechanism    in_place
call sites   Room.receive (one new case); viewFor (:524) for the view; server.ts::parse (:193 area) shape check
pin          addAi's existing behaviour and the lobby tests in packages/tabletop/test stay green
ux           design/mocks/claude-code-seat @526654c1 · #lobby-b (states: host/other phone × builtin/waiting/connected,
             sheet open/closed) · #tv-lobby (waiting/connected) — the sheet's setup line becomes **Copy invite**
             (mock update, C11) · GRAFT TARGET apps/web/src/phone/Lobby.tsx (SeatRow), apps/web/src/table/TableApp.tsx (TvLobby)
depends_on   —
owner        WS4 (room.ts, protocol.ts, web); WS3 named edit in server.ts::parse
```

```
C2 · ADDED · the game server speaks MCP on /mcp (Streamable HTTP, stateless): join, wait_for_my_turn, submit_plan, each taking the seat code

today        none_exists on trunk; the spike's hand-written stdio server + local bridge
             (apps/server/spike/mcp-seat.mjs, class Bridge in apps/server/src/brain/spike-seat.ts, spike branch only);
             spike (b)'s throwaway authless server (scratchpad, not committed)   verified_by: read, executed
tomorrow     MUST: POST /mcp in server.ts::handleHttp hands to a new module apps/server/src/claude-seat/;
             MUST: stateless — no MCP session id is issued or read; every tool takes `code` and looks the seat up
             through a Room method on every call (HC-2); MUST: all three tools are always listed;
             MUST: server instructions + each tool's text carry the loop ("keep calling wait_for_my_turn, answer
             with submit_plan, never stop to ask the user") and the persona arrives with join/the first ask;
             MUST: wrong codes draw on one game-server-wide budget (RULE-2), never per address (D-3);
             MUST: request bodies over maxRequestBytes are refused before parsing.
logic        → §2 RULE-2 (code lookup), RULE-3 (turn loop)
seam         server.ts::handleHttp — the one place HTTP routes are added (:96-121)
senior       junior would: hand-rolled JSON-RPC as in the spike, or a session-bound server that breaks when a chat
             app reconnects from another Anthropic address · senior does: the official @modelcontextprotocol/sdk
             Streamable HTTP transport in stateless mode on the game's own port; the code-per-call design means a
             dropped chat, a second chat or a phone all "resume" by just calling with the code
mechanism    sprout
call sites   handleHttp only
pin          none, because the route is new; /ws, POST /rooms and static serving keep their tests
reuse check  git grep 'modelcontextprotocol|"mcp|fastmcp' origin/feat/strategist → none; nearest: spike Bridge
             (beaten: stdio + localhost-only, cannot serve a chat app)
depends_on   C3 (contract, stubbable)
owner        WS2 (apps/server/src/claude-seat/**, new sole owner); WS3 named edit: the route line in server.ts
```

```
C3 · ADDED · a Claude seat's plans come from whichever chat calls with its code, through a ClaudeSeatWriter

today        PlaybookWriter.write(kind, ask) is implemented only by the API client; Playbooks gets writers via
             brain.writerFor ·  anchors: apps/server/src/brain/index.ts::PlaybookWriter, ::createBrain,
             apps/server/src/brain/playbooks.ts::Playbooks                      verified_by: read
tomorrow     MUST: write() queues the ask for the seat; wait_for_my_turn hands it out with persona, the phase
             digest (C5) and the brief; submit_plan resolves it as a WriterReply through the same reply parser;
             MUST: ask.signal abort ⇒ resolves no_reply at once; MUST: no API call, no paid ledger line (HC-1);
             MUST: the first answer to an ask wins, whichever chat sends it (RULE-4).
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
C4 · MODIFIED · a claude seat gets the ClaudeSeatWriter with or without an API key; its move decider stays built-in

today        createBrain returns CLASSIC when ANTHROPIC_API_KEY is missing; writerFor/deciderFor return null for
             every seat (:131-138, :175, :219)                                  verified_by: read
tomorrow     MUST: writerFor(seat) returns the seat's ClaudeSeatWriter when the seat's kind is claude, in
             CLASSIC and keyed brains alike; deciderFor stays null for it. Builtin seats unchanged.
logic        → §2 RULE-4
seam         brain/index.ts::createBrain / writerFor — the one place a seat's writer is chosen
senior       junior would: require a key for Playbooks · senior does: the writer choice per seat kind, so a
             keyless host gets Claude seats and keyed Smart seats keep their budget logic untouched
mechanism    wrap
call sites   Playbooks constructor (playbooks.ts:108); mule-game.ts::start (:516-533) via brain
pin          the keyed and keyless trial tests (apps/server/test/brain-*.test.ts) stay green
depends_on   C3
owner        WS2 (brain/**); the seat kind reaches AiSeat construction in mule-game.ts::start (WS2's agreed spot)
```

```
C5 · ADDED · a per-phase rules digest for Claude turns instead of the whole manual each turn

today        WRITER_SYSTEM includes the full defaultManual() (~22k chars, spike doc :65); PHASES record in
             manual.ts:106 rendered by renderManual (:272)                       verified_by: read
tomorrow     MUST: a digest renderer from PHASES for land and auction; each ask carries the digest; join's result
             carries the manual once. Byte-stable like the manual (T-AC-A7 style pin).
seam         packages/ai/src/llm/manual.ts — the manual's own renderer
senior       junior would: a hand-written summary string that drifts from config · senior does: render from the
             same PHASES/config so a config change moves both
mechanism    sprout
owner        WS2
```

```
C6 · ADDED · each Claude seat has a status: waiting, connected, thinking, ready, offline — from the time of the last call with its code

today        SeatView.connected is `s.isAi || s.conn !== null`; chips AI/HOST/PHONE/AWAY        verified_by: read
tomorrow     MUST: the claude-seat module computes the status from calls with the code (§2 RULE-5; no session)
             and the Room publishes it in SeatView; lobby, TV and phones render it per the mock.
seam         room.ts::viewFor (:524) — every screen's seat data comes from it
mechanism    in_place
ux           design/mocks/claude-code-seat @526654c1 · #tv-ready, #phone-ready (stages planning / side pick first
             good / 45 s running out; thinking counts as ready except at the side pick) — labels CLAUDE · … unchanged ·
             GRAFT TARGET TableApp.tsx (TvLobby, TvGame ready list), apps/web/src/phone/hub/ReadyBar.tsx, apps/web/src/phone/Lobby.tsx::SeatRow
depends_on   C1, C2
owner        WS4 (room/protocol/web), WS2 (status computation)
```

```
C7 · MODIFIED · the side pick waits for a Claude seat's auction plan, up to 45 s

today        the auction write is asked at development→production (mule-game.ts::nextPhase :904) and aborted at
             the auction's start (playbooks.ts::takePhase :267, mule-game.ts :956); the side pick has no clock
             (WALK.statusMs null) and ends when every seat is Done or on Continue          verified_by: read
tomorrow     MUST: a claude seat is Done at the first good's side pick only when its auction plan has come
             or BRAIN.claudeSeat.sidePickWaitMs has passed since the side pick opened; its ask is aborted then,
             not at the auction's start. Later goods' side picks don't wait. Other seats unchanged.
logic        → §2 RULE-6
seam         mule-game.ts scheduleAuctionTick (:1436) / auctionDone — where the side pick's Done is known
senior       junior would: lengthen the production show for everyone · senior does: wait only where the table
             already waits for people, only for the seat that needs it, capped
mechanism    in_place
pin          the auction e2e and side-pick tests stay green with no Claude seat
depends_on   C3
owner        WS3 (mule-game.ts) — named edit, WS3's OK
```

```
C8 · ADDED · a player hands their own seat to their Claude mid-game

today        handoff issues a 2-minute one-time code that moves the seat to another phone (room.ts :272,
             moveHere :319); AiSeats are built only at start() (mule-game.ts :516)        verified_by: read
tomorrow     MUST: the Move dialog's second choice ("Hand my seat to Claude") issues a seat code and invite valid
             for BRAIN.claudeSeat.handoverCodeMs to start; the first call with it lets the phone go, turns the
             seat claude, and the game builds its AiSeat and its Playbooks entry from that month on; MUST: it stops
             being `away` at once. After the first call the code lives like any claude seat's code (RULE-1).
logic        → §2 RULE-7
seam         room.ts::moveHere (the existing hand-over) + a new game hook seatBecameComputer
senior       junior would: a new "bot replaces player" path beside the room · senior does: the room's handoff
             with a different destination, and the game's own AiSeat construction reused mid-game
mechanism    sprout (hook) + in_place (room)
ux           design/mocks/claude-code-seat @526654c1 · #move (10:00 code, last seconds, expired, Claude joined) —
             the setup line becomes **Copy invite** (C11) · GRAFT TARGET apps/web/src/phone/Shell.tsx::MoveDialog
depends_on   C1, C3, C4
owner        WS4 (room, web), WS3 (the hook in mule-game.ts), WS2 (AiSeat + Playbooks entry)
```

```
C9 · ADDED · a setup page at /claude: add the MULE connector once, per app

today        none_exists; static serving with index.html fallback in server.ts (:115-119)   verified_by: read
tomorrow     MUST: the connector steps for Claude Desktop / claude.ai (Settings → Connectors → Add custom connector,
             name MULE, the public address + /mcp, "No sign in"), the phone (comes with the account; how to check),
             and Claude Code (one `claude mcp add --transport http mule <address>` line, the home address when on
             the same Wi-Fi); then "paste the invite into a new chat with MULE on"; then "if it stops, type
             continue". The address shown is the server setting (C10a); the page never shows a code unless opened
             from the host's seat sheet.
ux           design/mocks/claude-code-seat @526654c1 · #setup — rebuilt for the connector (C11) ·
             GRAFT TARGET new: apps/web/src/setup/ClaudeSetup.tsx
depends_on   C10a
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

```
C10a · ADDED · the public connector address and the /mcp-only tunnel (D-2 c)

today        none_exists: the game server listens on the home network only; no public address setting
             (apps/server/src/index.ts reads PORT and MULE_RECORD_DIR)           verified_by: read
tomorrow     MUST: one server setting MULE_PUBLIC_MCP_URL (empty = Claude Code on the home Wi-Fi only; the setup
             page then says so). MUST: a host script `pnpm tunnel` that runs the host's named Cloudflare tunnel
             with an ingress that forwards only path ^/mcp$ to the game server and answers everything else 404
             (HC-7). MUST: a host how-to (docs/how-to/claude-seat-tunnel.md) for the one-time setup: Cloudflare
             account, domain, `cloudflared tunnel create`, the DNS route, the setting.
senior       junior would: a quick tunnel to the whole game server · senior does: a fixed address so connectors
             are added once, and an ingress that exposes only /mcp so rooms and the TV stream stay private
mechanism    sprout
pin          server tests: with the setting empty, nothing changes
depends_on   C2
owner        WS2 (script, how-to, the setting's use in claude-seat); WS3 named edit if index.ts/server.ts read the setting
```

```
C11 · MODIFIED · the mocks move from the Claude Code setup line to the invite and the connector

today        design/mocks/claude-code-seat @526654c1: lobby sheet and Move dialog show `claude mcp add` + the
             kick-off; #setup has the three Claude Code steps                       verified_by: read
tomorrow     MUST: Copy invite (the §3 invite text) in #lobby-b's sheet and #move; #setup per C9; chips unchanged.
             Approved by Heiko/the PM before C1, C8 or C9 is built (the mock is the screen's spec).
mechanism    in_place
owner        WS4 (design/mocks/**) — WS2 may draft as a named edit with WS4's OK via the PM
```

## §2 · The Logic `[handoff]`

```
RULE-1 · Seat kind and its code                                       shape: decision table
inputs   actor host|other · phase lobby|play · seat isAi · kind builtin|claude
  #  when                                          then
  1  actor ≠ host or phase ≠ lobby or !isAi        refuse (no change)
  2  set claude, kind = builtin                    kind := claude; code := new unique code; status waiting
  3  set builtin, kind = claude                    kind := builtin; code := null (dies at once); the next call with it → "seat taken back"
  4  otherwise                                     no change
game over ⇒ every code null; the next call with it → "game over". Start is allowed while a claude seat is waiting:
it plays its built-in plan until Claude calls (HC-3; mock #lobby-b note).
examples  host sets seat 3 Claude → code + invite on host phone only · non-host tries → refused
```

```
RULE-2 · Code lookup (every tool call)                                shape: decision table
inputs   wrong-code budget empty yes|no · code names a live seat yes|no · code names a dead seat of this game yes|no
  #  when                                   then
  1  wrong-code budget empty                answer "busy, call again in N s" with no lookup (for every code)
  2  code names a live seat                 act for that seat only; record lastCallAt (RULE-5)
  3  code was taken back / game over        "seat taken back" / "game over" (does not draw on the budget)
  4  otherwise                              draw one from the budget; "no such seat" (same text for wrong, expired, guessed)
budget: BRAIN.claudeSeat.wrongCodesPerMinute, one bucket for the whole game server, refilled per minute.
unknown: a call with no code is a wrong code (row 4).
why row 1 refuses every code: if a live code still passed while the budget is empty, a guesser could keep guessing
for free; refusing all costs the real seats at most a minute on built-in plans (HC-3), never the table.
```

```
RULE-3 · wait_for_my_turn                                               shape: decision table
  #  when                                    then
  1  RULE-2 refused                           return RULE-2's answer
  2  an open ask exists, not yet answered     return it (ask_id, persona, digest, brief, edits allowed, ms left); status thinking
  3  waited BRAIN.claudeSeat.holdMs           return "still waiting, call again now"
holdMs is set from spike (b): the longest hold every tested app survived, minus a margin (D-4 b).
unknown: no call for holdMs + offlineGraceMs ⇒ status offline (open asks still resolve by their own deadline).
Two chats waiting on one code: both get the ask; RULE-4 takes the first answer.
```

```
RULE-4 · submit_plan                                                     shape: decision table
  #  when                                    then
  1  RULE-2 refused                           return RULE-2's answer
  2  ask_id not this seat's open ask          refuse "unknown or closed ask"
  3  ask already answered                     refuse "one answer per ask"
  4  ask aborted (late)                       refuse "too late, played the built-in plan"
  5  the reply parser cannot use the reply     refuse "unusable: <cause>, resend"; the ask stays open (not answered)
  6  otherwise                                parse + validate as a Smart reply; resolve the write; return accepted/refused edits; status ready
```

```
RULE-5 · Status (from calls with the code; no session)                 shape: state machine
  waiting   --first call with the code-->   connected
  connected --ask handed out-->             thinking
  thinking  --plan answered-->              ready      --next ask handed out--> thinking
  thinking  --ask aborted-->                connected
  any called --no call for holdMs+offlineGraceMs--> offline --any call with the code--> connected
  any       --host switches to builtin / game over--> (no status; seat is builtin or the game ended)
```

```
RULE-6 · Side-pick Done for a claude seat (first good only)       shape: decision table
  #  when                                                    then
  1  auction plan answered                                   Done
  2  now − sidePickOpenedAt ≥ BRAIN.claudeSeat.sidePickWaitMs   abort the ask; Done (built-in plan)
  3  otherwise                                               not Done
Other goods: Done as builtin AI seats today. Host's Continue still ends the side pick (aborts the ask).
Everywhere else a thinking claude seat counts as ready (ReadyCount / WaitingFor): "thinking" is a label, never a
wait. Only this side pick lists it under "Waiting for", with the countdown (mock #tv-ready, #phone-ready).
```

```
RULE-7 · Hand-over of a human seat                                       shape: sequence
phone Move → "Hand my seat to Claude" → code + invite (valid handoverCodeMs to start) → first tool call with it
(RULE-2 row 2) → room lets the phone go (as moveHere) → seat kind claude → game hook: remove from away, build
AiSeat (persona from the seat's species/default), add to Playbooks from the next ask on. Code unused when
handoverCodeMs passes ⇒ it dies, nothing changes.
```

## §3 · Contracts & Data Models `[handoff]`

- **MCP tools** (ADDED, C2; stateless, every tool takes `code`): `join{code}` → `{seat, name, persona, manual}` (optional
  greeting; not required before the others); `wait_for_my_turn{code}` → `{kind:'ask', ask_id, phase:'land'|'auction',
  persona, digest, brief, edits_allowed, ms_left}` | `{kind:'again'}` | `{kind:'busy', retry_s}` |
  `{kind:'taken_back'}` | `{kind:'game_over'}` | `{kind:'no_such_seat'}`;
  `submit_plan{code, ask_id, edits:[{path,to,reason}], line, strategy?:{kind, moneyMaker, reason}}` (strategy: the land ask's, as the API writer's reply carries it; refused on an auction ask) → `{accepted:[…], refused:[{edit, why}]}` | the same
  refusals. Each result is text Claude reads plus the structured content. Edit shape = the API writer's
  (packages/ai/src/llm/writer.ts::WriterReply). Breaking: no (new).
- **Seat code**: 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`-style unambiguous letters, a dash, 2 digits
  (`K7QM-42`, about 26–27 bits); unique among live codes; case-insensitive on input.
- **Invite** (the text Copy invite puts on the clipboard): *"Play MULE seat {code}. Keep calling wait_for_my_turn
  with the code and answer every decision with submit_plan until the game is over. Don't stop to ask me."*
- **Tabletop protocol** (MODIFIED, C1/C6/C8): client `{t:'setSeatKind', seatId, kind}`; client `{t:'handoverToClaude'}`;
  server `handoverCode{code, invite, expiresAt}`; `SeatView` gains `kind?: 'builtin'|'claude'`, `claude?: 'waiting'|
  'connected'|'thinking'|'ready'|'offline'`, and `seatCode?: string` only in the host's own view. Optional fields:
  non-breaking for old clients.
- **Config** (ADDED, HC-6): `BRAIN.claudeSeat = { sidePickWaitMs: 45_000, holdMs: 45_000 (Claude Code, measured; the chat apps' half may lower it), offlineGraceMs:
  20_000, handoverCodeMs: 600_000, wrongCodesPerMinute: 20, maxRequestBytes: 64_000 }`; `BRAIN.minLineLetters: 2`.
  Server setting `MULE_PUBLIC_MCP_URL` (C10a).

## §4 · Failure & Ops `[handoff]`

| Question | Answer |
|---|---|
| Dependency unavailable | Chat stopped / plan exhausted / slow ⇒ asks time out ⇒ built-in plan (RULE-6, HC-3); "continue" in the chat or the invite in a new chat brings it back. Tunnel down ⇒ Desktop/web/phone seats go offline and play built-in; Claude Code on the Wi-Fi unaffected. |
| Retry / poison / page | No retries server-side; Claude calls again. Malformed MCP request ⇒ JSON-RPC error. Nothing pages. |
| Idempotency | One answer per ask (RULE-4); calls are stateless, so any call can be repeated. |
| Races | submit vs abort: whichever settles the write first wins; the other gets "too late". Two chats on one code: both are the seat; first answer wins (RULE-4). |
| What works when broken | Everything except Claude seats, which play built-in; Smart and Classic seats untouched. |
| How an operator knows | Seat chips; a per-seat line at game over in the server log: asks, answered in time, late, refused edits, wrong-code budget hits (codes never logged, HC-5). |

## §5 · Delivery `[handoff]`

Code-only; no existing state (games and codes are in memory). Adds `@modelcontextprotocol/sdk` to apps/server
(lockfile change in the PR that adds C2). The tunnel is the host's own one-time setup (C10a how-to); nothing is
deployed by us. Rollback = revert; no point of no return.

## §6 · Acceptance Criteria `[handoff]`

| id | Given / When / Then | verifies | observed_at |
|---|---|---|---|
| B-AC-1 | Given a lobby with a computer seat, When the host picks Claude, Then his phone shows the seat code and Copy invite, the chip says waiting, and no other phone or the TV shows the code. Negative: a non-host can't change the kind. | C1 | rendered phone/TV views |
| B-AC-2 | Given a Claude seat, When a chat calls with its code, Then every screen's chip says connected; when it is writing, thinking. | C2, C6 | SeatView on every client |
| B-AC-3 | Given two Claude seats played by two chats, When the game runs to game over, Then each seat's plans came only from the chat holding its code. Negative: chat A submitting B's ask_id with A's code is refused. | C2, C3 | MCP responses + game record |
| B-AC-4 | Given a Claude seat whose chat doesn't answer, When the land grant starts, Then the seat plays its built-in plan and the table never waits. | C3, C7 | game record + timing |
| B-AC-5 | Given the first good's side pick and a Claude seat with no plan yet, When 45 s pass, Then that seat is Done on its built-in plan; a plan at 20 s makes it Done at 20 s (the side pick then ends when the others are Done, as today). | C7 | side-pick end time |
| B-AC-6 | Given a chat that stopped, When the invite is pasted into a new chat (or "continue" typed), Then the seat carries on and an open ask is offered. | C2 | MCP responses |
| B-AC-7 | Given a Claude seat, When the host switches it back to Built-in, Then the next call with its code gets "seat taken back" and acts for nothing. | C1 | MCP responses |
| B-AC-8 | Given a player mid-game, When they hand their seat to Claude and close the phone, Then the game reaches game over without a Continue for that seat. | C8 | game record |
| B-AC-9 | Given no API key, When a game with a Claude seat runs, Then that seat writes plans and the ledger has no paid line for it. | C4, HC-1 | brain ledger file |
| B-AC-10 | Given the setup page and an invite, When a first-timer follows it in Claude Desktop (and separately in Claude Code), Then the seat shows connected in under 5 minutes. | C9 | timed user test (UBER-AC-2) |
| B-AC-11 | Given the tunnel running, When anything but /mcp is requested at the public address, Then it answers 404 and the game server never sees it. | C10a, HC-7 | curl against the public address |
| T-AC-1 (serves B-AC-3) | Every tool resolves the seat from its `code` argument only, on every call; no session id is issued or read; a call with seat A's code never touches seat B. | C2 | /mcp route test, real Room + MuleGame |
| T-AC-2 (serves B-AC-4, B-AC-5) | ClaudeSeatWriter.write resolves no_reply in the same tick its ask.signal aborts; a later submit gets "too late". | C3 | unit + route test |
| T-AC-3 (serves B-AC-9) | With ANTHROPIC_API_KEY unset, writerFor(claude seat) is a ClaudeSeatWriter and deciderFor is null; builtin seats null as today. | C4 | brain test |
| T-AC-4 (serves B-AC-2) | wait_for_my_turn returns "again" after holdMs; no call for holdMs+offlineGraceMs ⇒ offline; the next call ⇒ connected. Fake clock. | C2, C6 | route test |
| T-AC-5 (serves HC-5) | No log line or non-host view contains a seat code. | C1, C2 | log capture + views |
| T-AC-6 (serves B-AC-4) | The phase digest is byte-stable and moves with config, like the manual pin. | C5 | snapshot |
| T-AC-7 | A line with fewer than minLineLetters letters is not said. Negative: "OK" with min 2 is said. | C10 | chat record |
| T-AC-8 (serves B-AC-3) | After wrongCodesPerMinute wrong codes, every call (a live code too) gets "busy" until the minute refills; taken-back and game-over codes don't draw on it; bodies over maxRequestBytes rejected. | C2 | route test, fake clock |

Invariant for every test: a Claude seat is never in `away`.

## §7 · Risks & Spikes `[review-only]`

- **R-1 Reach.** Desktop, claude.ai and the phone need the public address (D-2 c): a host without the one-time tunnel
  setup gets Claude Code on the Wi-Fi only. Mitigation: the setting is one value, so a relay or stage 4 replaces it.
- **R-2 Two chats on one plan** share its usage window (the spike measured one). Mitigation: the built-in fallback
  covers a throttled seat.
- **R-3 Chat apps stop.** Desktop, claude.ai and the phone end a reply at some point (undocumented). Spike (b)
  measures how long they play and which hold survives; D-1 b's condition: if a Desktop chat stops after one or two
  decisions, the chat apps wait and Claude Code ships first (the plan orders it that way anyway).
- **R-4 Mid-game AiSeat construction (C8)** has never been done. Mitigation: build C8 last, behind its own PR, with a
  real-room test; G-3 is the fallback goal, so it may ship after G-1.
- **R-5 Exposure.** /mcp on the internet, and every chat-app call arrives from Anthropic's addresses, so callers can't
  be told apart. Mitigation: /mcp only (HC-7), codes die, one wrong-code budget for the server (RULE-2), size caps.
  Accepted cost: a wrong-code flood puts the Claude seats on built-in plans for its duration; the table never waits.
- **Spike (b)**, in two halves.
  - **Claude Code half, run 7 Nov by WS2 with Heiko's OK** (headless Claude Code 2.1.319 on his claude.ai login, no API
    key; test server log). Holds of 5, 20 and 45 s returned. Every hold of 75 s or more was dropped by the client at
    60.0 s (14 drops, 59.999–60.123 s). So Claude Code's ceiling is 60 s, and `holdMs` is 45 s. The run stalled after
    month 1 only because the test server's ladder never stepped back below a dropped hold; the server now falls back
    to the longest hold below a drop.
  - **Desktop / claude.ai / phone half: [results go here]** (Heiko; owed for wave 3 and the #setup screen).

## §8 · Amendments `[review-only]`

**Amendment 1 (6 Nov) — any Claude app, one connector, the code on every call. APPROVED.** Source: Heiko's feedback
via the PM, 6 Nov; Heiko approved the four recommendations (via the PM, 6 Nov): **D-1 b** with its condition as
written, **D-2 c**, **D-3 a**, **D-4 b** with the hold value from his seat test. Applied throughout: the status, "What
you'll see at the table", §0 (G-1, UBER-AC-1, G-2/UBER-AC-2, non-goals), §0.1, HC-2/5/6/7, C1–C9 renamed from Claude
Code to Claude, C2 stateless with the code per call, C6 status from calls, C9 the connector setup, C10a (new: public
address + /mcp-only tunnel), C11 (new: the mock update), RULE-2 code lookup with the server-wide wrong-code budget,
RULE-3 holdMs, RULE-5, §3 tools/code/invite/config, §6 B-AC-6/7/10/11 and T-AC-1/4/8, §7 R-1/R-3/R-5.
Open: the spike (b) numbers (holdMs, UBER-AC-1's bar for chat apps).

**Amendment 2 (7 Nov, WS2, inside the lane) — submit_plan carries the strategy.** Found while building PR-1b: §3's
submit_plan took only edits and a line, but the land brief offers the strategy (kind, moneyMaker, reason), and the reply
parser reads strategy only from the reply's strategy object, as the API writer sends it; so a Claude seat could never
set its strategy. §3 now adds an optional `strategy` object, parsed exactly as the API writer's (HC-4); on an auction ask
it is refused as not offered. Tested in `claude-seat-mcp.test.ts` (T-AC-1). Also: `holdMs` ships provisional at 25 s in
`BRAIN.claudeSeat` until spike (b) sets it.

**Amendment 3 (7 Nov, WS2, inside the lane, from PR-1b's review): an unusable reply is not an answer.** RULE-4 gains
row 5: a submit the reply parser cannot use (bad shape, bad line, not JSON) is refused with its cause and the ask stays
open, so the chat can resend before the phase starts; before, it counted as the answer and the seat silently played its
built-in plan. Also, from the PM's ruling of 7 Nov: RULE-2 row 3's "game over" is decided in claude-seat from the game's
own state, around the Room's lookup; the Room answers "taken back" only.

## §9 · Ownership Boundaries `[handoff]`

### Ownership: the Claude seat's MCP endpoint
- Sole owner: WS2, `apps/server/src/claude-seat/**` (new) and `apps/server/src/brain/**`; the tunnel script and how-to.
- Read contract: the Room's seat kind/code (C1) and the game's asks through Playbooks/PlaybookWriter.
- Write contract: seat status into the Room through one method (C6); plans only through submit_plan → ClaudeSeatWriter.
- Enforcement: package boundary (server-only module); named edits for WS3's server.ts route line and mule-game.ts
  (C7, C8 hook); WS4 owns room.ts/protocol.ts/web and the mocks.

### Ownership: seat kind and seat code
- Sole owner: WS4, `packages/tabletop/src/room.ts` (Seat record). WS2 reads it; never a second store of codes.
- Enforcement: the claude-seat module looks codes up through a Room method only.
