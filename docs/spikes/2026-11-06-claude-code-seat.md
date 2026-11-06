# Spike: a player's own Claude Code plays a seat (6 Nov 2026)

WS2, time-boxed to one day, approved by Heiko ("Yes, spike it"). Code is on branch `ws2-spike-claude-code-seat`, not merged.

## In plain words

**Yes, it works, with three conditions.** Claude Code, logged in with Heiko's subscription and **no API key**, played a seat for a whole 12-month game, unattended, through a small MCP server of ours. It answered every one of its 24 decisions, almost always within 15 seconds and every time inside today's 30-second deadline. Its plans went through the same checks as the API's, and it stayed in character from the first month to the last, including after its memory was compacted 11 times in one game.

The three conditions:

1. **The seat runs headless, as `claude -p`, or the interactive screen still needs a test.** In a real game a seat waits minutes between two decisions. Headless, a 150-second wait came back normally and the seat played on. In Claude Code's interactive screen such a wait is moved to the background after 2 minutes, and I could not test that screen from here. Switching the background move off (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0`) is the safe setting there. See "The 2-minute wait".
2. **The seat needs a longer deadline than 30 seconds, or lighter turns.** Sending the full rules every turn made Claude compact often. Each compaction pauses it for 15 to 22 seconds, and that pause lands inside a decision; the slowest answer came in at 29.2 s. The fix is a short rules digest per turn, or a deadline of 60 s or more for these seats.
3. **Setup is technical.** A player has to install Claude Code, add our MCP server, allow its three tools and paste one command. That is fine for Heiko's friends who use Claude Code, not for everyone.

**Effort for a real build: about 2 weeks for one lane** (see the end). It goes through brainstorm → spec first.

## What was built

- **A seat bridge in the game process** (`apps/server/src/brain/spike-seat.ts`). One 4-seat game with three Classic seats. Seat ai0's plans come from Claude Code instead of the API, at the same moments `Playbooks` asks today: the month's land write at game start and each upkeep (it carries the development), and the auction's write in the production show.
  - A reply goes through `writeReply` and `Playbooks` unchanged: the writer's checks, the validator, adoption and the spoken line (ruling a′). Nothing new in the rules.
- **An MCP server** (`apps/server/spike/mcp-seat.mjs`): stdio, no dependencies. It has three tools:
  - `join(gameCode, seat)`;
  - `wait_for_my_turn()`, a long poll that returns the brief;
  - `submit_plan(ask_id, edits, line)`.
  - It also has Heiko's layers 1 and 2 (below).
- **A per-decision mode:** the bridge starts one `claude -p` per ask, with persona and rules in `--append-system-prompt`.

**Every run used the subscription login.** `ANTHROPIC_API_KEY` was unset, and Claude Code's own start-up record says `apiKeySource: none`. No API money was spent. The "cost" figures below are Claude Code's own API-equivalent estimates, printed for information; on a subscription they count against the usage window, not money. Model: Sonnet 5.5.

## Measurements

One game per run, seed 7, the seat's persona "sly" (the saboteur), the other three Classic.

| | Run 1: one long session | Run 2: Heiko's three layers | Run 3: one `claude -p` per decision |
|---|---|---|---|
| Started by | a pasted prompt | the slash command `/mcp__muleseat__play SPIKE ai0` | the game, per ask |
| Rules sent | once, on the first turn | every turn (self-contained) | every call, as system prompt |
| Finished unattended | yes, 12 months | yes, 12 months | yes, 12 months |
| Decisions answered | 24 of 24 | 24 of 24 | 24 of 24 (1 unusable reply) |
| Inside 30 s | 24 | 24 | 24 |
| Latency p50 / p90 / max | 4.6 / 5.9 / 15.8 s | 9.5 / 27.0 / 29.2 s | 10.5 / 14.8 / 15.2 s |
| Edits accepted / refused | 58 / 0 | 155 / 1 | 192 / 0 |
| Plans with Claude's edits | 11 of 22 | 28 of 31 | 31 of 32 |
| Lines in persona | 23 of 24 (one junk `x`) | 24 of 24 | 23 of 23 |
| Compactions | 0 (113 k tokens at the end) | 11 | none possible |
| API-equivalent estimate | $0.93 | $2.34 | (one session per call) |
| Seat's place | 2nd of 4 | 2nd of 4 | 2nd of 4 |

A fourth run (4a, below) repeated run 1's setup with a 150-second wait before the first decision. It also finished unattended, with 24 of 24 answered (p90 5.8 s), and that time the seat won.

On the seat's place: three of four runs ended 2nd and one 1st. The other seats are the engine's Classic play, and this is one seed, so it says nothing yet about whether Claude beats the engine. That is the tournament's job (t120s).

"Unusable" is the one reply in run 3 whose JSON did not have the right shape. That seat played its own plan for that decision, exactly as with a late API reply.

## Heiko's three layers (run 2)

1. **MCP server `instructions`** carry the loop protocol and the "how to play" digest, which is the manual's month and how the game is won. They hold up:
   - To prove they reach the session and survive compaction, they alone carried a codeword. The seat's last answer, after 11 compactions, ended with it: `HARVEST-MOON-7`.
2. **A kick-off prompt:** the server's `play` prompt becomes the slash command `/mcp__muleseat__play <code> <seat>`. Claude Code listed it, and the whole run started from that one command. It loads the persona, the loop and the full rules.
3. **A self-contained turn:** every `wait_for_my_turn` carried the persona, the full rules (the same `WRITER_SYSTEM` the API path sends) and the brief.
   - After every compaction the seat still played legal plans: 1 edit refused out of 156.
   - It still spoke in persona: all 24 lines are the sly one's digs at "the leaders", before and after.
   - The price is time, not play: each compaction pauses 15 to 22 s inside a decision.

**What I'd keep for a real build:** layers 1 and 2 as tested. For layer 3, send the persona, the rules for this decision and the brief, but not the whole 22 k-character manual every time. Run 1 shows the manual once is enough while no compaction happens. Layer 1 is what survives a compaction, and the brief carries what this decision needs.

The optional skill in a plugin bundle was not tried: the three layers already carried everything, and the time went to the runs.

## The 2-minute wait

In a real game the wait between two of a seat's decisions is minutes of real time. Claude Code's docs say a tool call still running after 2 minutes moves to a background task, and in a `claude -p` run a backgrounded result is lost. If that happened, the seat's loop would break at its first long wait.

**Test 4a:** the same seat, headless (`claude -p`), with auto-background left at its default (on). The bridge held the first ask for 150 s before `wait_for_my_turn` could see it.
- **Result:** the wait came back normally after the hold. The stream shows no background event; the session simply took 150 s longer (275 s against 136 s).
- The seat played the rest of the game: 24 of 24 decisions, p90 5.8 s. It came 1st of 4.
- Its final reply named the codeword from the server instructions.
- **So headless, the 2-minute background move did not happen** and a long wait is safe. The repeat with auto-background off (planned as 4b) would have shown nothing new, so I skipped it to save the subscription's window.

**Not tested: the interactive screen.** That is where the docs' background move applies. There the result should arrive as a notification and Claude should continue, but I could not check that from here. Until someone does, a player should set `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0`, or run the seat headless. The MCP call timeout (about 28 h by default) is far above a game's length.

## What a player has to do (today's prototype)

1. Install Claude Code and log in with their Pro or Max plan.
2. Add our MCP server:
   - Today it is a local `node` script.
   - In a real build it would be one HTTP address, which is simpler: `claude mcp add --transport http mule https://…`.
3. Allow its three tools, so Claude never stops to ask: `mcp__mule__*` in their permissions.
4. Start the seat with the slash command, for example `/mcp__mule__play ABCD ai2`, and leave the window open.
   - For the long-session mode, switch off auto-background first. For the one-shot mode, our side runs `claude -p` and the player only keeps Claude Code installed. That fits a player's own machine, not our server.

## Not tested

- **The interactive Claude Code screen.** I can't drive it from here. Runs 1, 2 and 4a are the same session as headless runs (`claude -p`), without the screen. The one thing the screen changes is the 2-minute background move, above.
- **A real table with people**, where a seat's next decision comes minutes later in real time. The hold test stands in for that.
- **Usage limits.** One full game took about 50 to 60 model turns. The subscription sent one rate-limit status event in each long run, and none limited us. Several games a day on one Pro plan were not tried.

## Channels

Channels (MCP push) are out of scope: they are a research preview and need Anthropic's allowlist. The design would switch cleanly, though. `wait_for_my_turn` is the only pull; with push, the same brief would arrive as a notification, and `submit_plan` stays as it is.

## Effort for a real build

About 2 weeks for one lane, after a spec:

- **An HTTP MCP server inside the game server** (the official SDK), with a per-seat join token issued in the lobby. It replaces the local script, and the long poll is the same. About 3 days.
- **A "Claude Code seat" in `MuleGame`:** a `PlaybookWriter` whose port is the seat's pending ask, reusing `Playbooks` as the spike does. Plus a deadline per phase, which for these seats should be the phase's real slack, and a fallback that is exactly today's late reply. About 3 days.
- **Lobby and screens:** choose "Claude Code" for a seat, show its join command, and show whether it is connected. These need a mock first. About 2 days.
- **Line screening** (the junk `x` in run 1) and the per-turn rules digest. About 1 day.
- **Tests and docs**, including a player's setup page. About 2 days.
