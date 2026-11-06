# Claude plays a seat (any Claude app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Programme (spec header: Heiko, 6 Nov)

<!-- plan-check: no-task A7 — not a change: spec C5 cites the manual pin T-AC-A7 of an earlier spec as a pattern -->

**When:** built after the MVP proof (spec status). Nothing here starts before the PM says so.

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 [spec §0] hand any computer seat to a Claude chat in any Claude app | the host; friends lending their Claude | Claude opponents for $0 to the host | UBER-AC-1 | **PR-1** (wave 1: Claude Code on the home Wi-Fi); the chat apps in PR-3 |
| G-2 [spec §0] connect a seat in under 5 minutes, without help | the friend running the seat; the host | friends join on their own | UBER-AC-2 | PR-3 — reason below |
| G-3 [spec §0] a leaving player hands their own seat to Claude | the leaving player; the table | a departure no longer stalls the table | UBER-AC-3 | PR-4 — reason below |

Why G-2 and G-3 come after PR-2: UBER-AC-2 is observed as the seat's chip saying *connected* (C6, PR-2) after following
the setup page (C9, PR-3), so it cannot be proven earlier; G-3 reuses C1, C3 and C4 and is the riskiest change (spec §7
R-4: mid-game AiSeat construction has never been done), so it goes last behind its own PR. Each earlier PR is useful on
its own: PR-1 lets the host play against his own Claude Code; PR-2 shows the table what that seat is doing.

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
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

**Thin baseline (spec §0.1):** A · ~6–7 days · lost because a real game runs 45–60 minutes; without a status UBER-AC-2's
*connected* can't be seen, and in a chat app the player can't tell the seat has stopped and needs "continue".
→ **PR-1 relationship:** the reason is true (re-checked on trunk 03d048b7: `SeatView` has no Claude status field,
`packages/tabletop/src/protocol.ts`), so PR-1 is the shortest vertical slice through B that delivers G-1 for Claude Code
on the home Wi-Fi: seat kind + code (C1), the stateless /mcp (C2), the writer (C3, C4) and the side-pick wait (C7, without
which most auction plans are late and UBER-AC-1's 90% fails). It is also most of A; A's status-less page is not built.

**Constraints:** spec §0.2 HC-1 … HC-7 travel with every task (HC-1 no paid call, HC-2 a code acts for its seat only,
HC-3 never hold the table, HC-5 codes never logged, HC-7 only /mcp public are fatal).

**Architecture:** a new server module `apps/server/src/claude-seat/` speaks stateless MCP on the game's own port; every
tool takes the seat code and looks it up through a Room method; asks reach it through a new `PlaybookWriter`
(`ClaudeSeatWriter`), so Playbooks, the validator and adoption are unchanged. The Room owns seat kind and code; screens
read kind and status from `SeatView`. A host's named Cloudflare tunnel exposes only `/mcp` for the chat apps.

**Tech Stack:** TypeScript pnpm monorepo: `packages/tabletop` (Room, protocol), `apps/server` (game server, brain,
vitest), `apps/web` (phone/TV screens, Playwright e2e that own their server), `packages/ai` (manual, reply),
`packages/engine/src/config.ts` (BRAIN block), `@modelcontextprotocol/sdk` (new), `cloudflared` (host-side, not a dependency).

**Inputs:**
- Spec: `docs/specs/2026-11-06-ws2-claude-code-seat.md` (#472, amended by Amendment 1, approved by Heiko 6 Nov; PR #537)
- Binding mock: `design/mocks/claude-code-seat/` @ 526654c1, updated by C11 (PR-0) before any screen is built
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1–C11, C10a), §2 (RULE-1..7), §3, §4, §5, §6 (B-AC-1..11,
  T-AC-1..8), §7 (R-1..R-5, spike (b)), §8, §9
- Sections declared N/A by the spec: none
- N/A claims I checked: none to check; §5 says code-only with no existing state: holds (games and codes in memory)
- Drift check on trunk 03d048b7 (6 Nov): every §1 anchor resolves (anchor-check PASS, 20 seams); nothing built yet
  (`git grep claudeCode|claude-code|claudeSeat|modelcontextprotocol` outside `design/mocks/`: no hits);
  `docs/how-to/` and `apps/web/src/setup/` don't exist yet (both ADDED by the spec).

---

## PR decomposition

**Integration:** sub-PRs merge into `ws2-brain` (WS2's lane PRs) or the owning lane's branch; the PM batches each wave to
`feat/strategist`. A wave's PRs merge in one batch.

| PR | Sub-branch | Owner | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------|-------------------------|--------------|--------------------|--------------------|-------------------|
| S1 | — (Heiko's seat test, 6 Nov) | WS2 + Heiko | Spike (b) | — | holdMs value, UBER-AC-1 chat-app bar | — | No |
| PR-0 | `ws4-claude-seat-mock` | WS4 (WS2 may draft, named edit) | Task 0.1 (C11) | — | the approved mock | — | mock only |
| PR-1a | `ws4-claude-seat-kind` | WS4 (+ WS3 named edit: server.ts::parse) | Tasks 1.1–1.3 (C1) | B-AC-1, T-AC-5 (views) | protocol `setSeatKind`, `SeatView.kind/seatCode`, Room code lookup | PR-0 mock | Yes |
| PR-1b | `ws2-claude-seat-mcp` | WS2 (+ WS3 named edits: server.ts route line, mule-game.ts::start) | Tasks 1.4–1.9 (C2, C3, C4) | B-AC-3, B-AC-4, B-AC-6, B-AC-7, B-AC-9, T-AC-1, T-AC-2, T-AC-3, T-AC-5 (logs), T-AC-8 | MCP tools (§3), `BRAIN.claudeSeat` | Room code lookup | No |
| PR-1c | `ws3-side-pick-wait` | WS3 | Task 1.10 (C7) | B-AC-5 | — | `BRAIN.claudeSeat.sidePickWaitMs`, ClaudeSeatWriter ask | No |
| PR-2a | `ws4-claude-seat-chips` | WS4 | Task 2.1 (C6 view + chips) | B-AC-2 | `SeatView.claude` | status method (stub) | Yes |
| PR-2b | `ws2-claude-seat-status` | WS2 | Tasks 2.2–2.4 (C6 status, C5, C10) | T-AC-4, T-AC-6, T-AC-7 | status method | `SeatView.claude` | No |
| PR-3a | `ws2-claude-seat-reach` | WS2 | Tasks 3.1–3.2 (C10a) | B-AC-11 | `MULE_PUBLIC_MCP_URL`, `pnpm tunnel` | MCP route | No |
| PR-3b | `ws4-claude-setup-page` | WS4 | Task 3.3 (C9) | B-AC-10 | — | `MULE_PUBLIC_MCP_URL` | Yes |
| PR-4 | `ws2-claude-handover` | WS4 (room, web) + WS3 (hook) + WS2 (AiSeat) | Tasks 4.1–4.3 (C8) | B-AC-8 | `handoverToClaude`, `seatBecameComputer` hook | C1, C3, C4 | Yes |

**Waves:** S1 → PR-0 → **wave 1** (PR-1a, PR-1b, PR-1c) → **wave 2** (PR-2a, PR-2b) → **wave 3** (PR-3a, PR-3b) →
**wave 4** (PR-4). Main merges: after wave 1 (G-1 for Claude Code), after wave 3 (G-1 chat apps, G-2), after wave 4 (G-3),
each with Heiko's OK via the PM.

- Wave 1 is safe together: PR-1a owns the Room/protocol/web; PR-1b owns `claude-seat/**` and `brain/**` and consumes the
  Room lookup frozen in Task 1.1's first commit; PR-1c owns its function in mule-game.ts and consumes the config block
  frozen in Task 1.4's first commit.
- Wave 2 is safe together: PR-2a renders `SeatView.claude` (frozen in §3) from a stub status; PR-2b fills it.
- Wave 3 is safe together: PR-3b reads only the setting PR-3a adds (frozen in §3).
- **D-1 b's condition** gates wave 3: if S1 shows a Desktop chat stops after one or two decisions, wave 3's chat-app
  part waits (PR-3a's tunnel, PR-3b's chat-app steps) and the setup page ships with the Claude Code steps only.
- No migrations (no database).

### Per-PR authority

Every handoff carries, verbatim:

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

| PR | may_edit | may_edit_content | must_not_edit |
|----|----------|------------------|---------------|
| PR-0 | `design/mocks/claude-code-seat/src/**` | — | everything else |
| PR-1a | `packages/tabletop/src/room.ts`, `packages/tabletop/src/protocol.ts`, `packages/tabletop/test/**`, `apps/server/src/server.ts` (`parse` only) | `apps/web/src/phone/Lobby.tsx` (SeatRow), `apps/web/src/table/TableApp.tsx` (TvLobby) per the PR-0 mock | `apps/server/src/claude-seat/**`, `brain/**`, mule-game.ts (PR-1b/1c, same wave) |
| PR-1b | `apps/server/src/claude-seat/**` (new), `apps/server/src/brain/**`, `apps/server/test/claude-seat-*.test.ts`, `packages/engine/src/config.ts` (BRAIN block), `apps/server/package.json` + lockfile, `apps/server/src/server.ts` (route line in `handleHttp` only), `apps/server/src/mule-game.ts` (`start` only) | — | room.ts, protocol.ts, web (PR-1a); mule-game.ts outside `start` (PR-1c) |
| PR-1c | `apps/server/src/mule-game.ts` (side pick: `scheduleAuctionTick`, `auctionDone`), its tests | — | `start` (PR-1b); config.ts (PR-1b) |
| PR-2a | `packages/tabletop/src/protocol.ts`, `room.ts` (`viewFor`), tests | `TableApp.tsx` (TvLobby, TvGame ready list), `apps/web/src/phone/hub/ReadyBar.tsx`, `Lobby.tsx::SeatRow` per the mock | `claude-seat/**` (PR-2b) |
| PR-2b | `apps/server/src/claude-seat/**`, `packages/ai/src/llm/manual.ts` (digest), `packages/ai/src/llm/reply.ts` (`cleanLine`), `packages/engine/src/config.ts` (BRAIN block), tests | — | room.ts, protocol.ts, web (PR-2a) |
| PR-3a | `scripts/tunnel/**` (new), `docs/how-to/claude-seat-tunnel.md` (new), `apps/server/src/claude-seat/**`, root `package.json` (`tunnel` script) | — | `apps/web/**` (PR-3b) |
| PR-3b | `apps/web/src/setup/**` (new), web router entry | `apps/web/src/setup/ClaudeSetup.tsx` per the mock `#setup` | `claude-seat/**` (PR-3a) |
| PR-4 | room.ts (`moveHere` path), protocol.ts, mule-game.ts (new hook only), `apps/server/src/brain/**` | `apps/web/src/phone/Shell.tsx::MoveDialog` per the mock `#move` | — (alone in its wave) |

### Contention

| path | touched by | resolution |
|---|---|---|
| `apps/server/src/server.ts` | PR-1a (`parse`), PR-1b (route line) | **serialised** — PR-1a merges into the wave branch first; PR-1b rebases |
| `apps/server/src/mule-game.ts` | PR-1b (`start`), PR-1c (side pick), PR-4 (hook) | **serialised** — PR-1b, then PR-1c in wave 1; PR-4 in wave 4 |
| `packages/engine/src/config.ts` | PR-1b, PR-2b | **serialised** (different waves); PR-1b adds the whole `BRAIN.claudeSeat` block in Task 1.4's first commit |
| `packages/tabletop/src/room.ts`, `protocol.ts` | PR-1a, PR-2a, PR-4 | **serialised** (one per wave) |
| `apps/server/src/claude-seat/**` | PR-1b, PR-2b, PR-3a | **serialised** (one per wave) |
| `apps/web/src/phone/Lobby.tsx`, `TableApp.tsx` | PR-1a, PR-2a | **serialised** (different waves) |

---

## Spike S1: the seat test in Claude Desktop and the phone (spike (b), spec §7)

**Phase:** P0 (must complete before wave 1 sets `holdMs`, and before wave 3)
**Timebox:** the one ~20-minute test Heiko runs on 6 Nov, plus 1 hour to read the log
**Stop condition:** the hold that survived in every tested app is known, and whether a Desktop chat plays several
months on its own (D-1 b's condition) is answered yes or no.

- [ ] **Step 1:** Heiko runs the test from `seat-test-instructions.md` against the throwaway server (scratchpad `seat-test/server.mjs`, PID recorded in STATUS) through his own tunnel.
- [ ] **Step 2:** Read `log.jsonl`: which holds (5/20/45/75/110/150/200 s) returned, `client_closed` events, calls per reply, months played before the chat stopped, phone locked vs unlocked.
- [ ] **Step 3:** Stop the test server by PID (cwd checked) and confirm it is gone; confirm Heiko closed the tunnel.
- [ ] **Step 4:** Write the numbers into spec §7 (spike (b)), §0 UBER-AC-1 ([N from spike (b)]), §0.1 D-4 and §3 `holdMs`; record in §8.

Yes (a Desktop chat plays several months) → waves proceed as planned. No → wave 3 ships Claude Code only (D-1 b's
condition); tell the PM, since it narrows G-1's reach.

## Phase 0 — the mock

### Task 0.1: the mock moves to the invite and the connector — C11

**Phase:** P0 · **Depends on:** S1 (the setup page says what to do when a chat stops) · **ACs verified:** — (approval)
**Spec sections consumed:** §1 C11, C9, §3 (invite text)

**Files:** Modify: `design/mocks/claude-code-seat/src/screens/PhoneLobby.tsx`, the Move and setup screens in the same folder.

- [ ] **Step 1: Implement C11 per spec §1 C11** — Copy invite (the §3 invite text) replaces the setup line in `#lobby-b`'s sheet and `#move`; `#setup` shows the connector steps per app (C9); chips unchanged.
- [ ] **Step 2: Typecheck the mock** — Run: `design/mocks/claude-code-seat/node_modules/.bin/tsc --noEmit -p design/mocks/claude-code-seat` · Expected: exit 0. Then `verify-review-loop.mjs` exits 0.
- [ ] **Step 3: Approval** — the PM gets Heiko's (or its own, under design authority) OK at a SHA; that SHA replaces 526654c1 in the spec's `ux` lines (§8 note).

### Gate: End of Phase P0
- [ ] S1 numbers written into the spec; the mock approved at a named SHA; base `feat/strategist` green (pre-implementation checklist).

## Phase 1 — wave 1: Claude Code plays a seat on the home Wi-Fi (G-1)

### Task 1.1: Room seat kind and code — C1

**Depends on:** — · **ACs verified:** T-AC-5 (views) · **Spec:** §1 C1, §2 RULE-1, §3 (protocol, seat code)
**Files:** Modify `packages/tabletop/src/room.ts` (`Room.receive`, `viewFor`), `packages/tabletop/src/protocol.ts`; Test `packages/tabletop/test/room.test.ts`

- [ ] **Step 1: Freeze the contract first** — commit the §3 protocol fields and a Room method `seatForCode(code)` (signature only, returns null) so PR-1b can branch from it.
- [ ] **Step 2: Write the failing test `T-AC-5: no non-host view contains a seat code`** — Altitude: contract (the views every client receives). Observed at: `viewFor` for host, other phone and TV. Negative: a non-host `setSeatKind` is refused (RULE-1 row 1).
- [ ] **Step 3: Run it** — `pnpm --filter @mule/tabletop test -- -t "T-AC-5"` · Expected: FAIL.
- [ ] **Step 4: Implement C1 per spec §1 C1 and §2 RULE-1** — mechanism in_place; the code format and uniqueness per §3.
- [ ] **Step 5: Run** — Expected: PASS; the existing room tests stay green (C1's pin).
- [ ] **Step 6: Commit** — `git commit -m "feat(C1): seat kind and seat code in the Room (verifies T-AC-5)"`

### Task 1.2: server.ts parses setSeatKind — C1

- [ ] **Step 1:** Add the `setSeatKind` shape check in `apps/server/src/server.ts::parse` (WS3 named edit, OK via the PM); covered by Task 1.3's e2e.

### Task 1.3: the lobby shows Built-in / Claude, the code and Copy invite — C1

**ACs verified:** B-AC-1 · **ux:** the PR-0 mock `#lobby-b`, `#tv-lobby` · GRAFT TARGET `Lobby.tsx::SeatRow`, `TableApp.tsx::TvLobby`
- [ ] **Step 1: Write the failing test `B-AC-1: host picks Claude, sees code and Copy invite; others don't`** — Altitude: promise, front to back (Playwright in `apps/web/e2e/lobby.ts`, the test owns its server). Asserts the host phone shows the code and invite, the chip says waiting, another phone and the TV show no code; negative: a non-host can't change the kind.
- [ ] **Step 2: Run** — `pnpm --filter @mule/web build && pnpm --filter @mule/web exec tsx e2e/lobby.ts` · Expected: FAIL.
- [ ] **Step 3: Implement C1's screens per the PR-0 mock** (may_edit_content).
- [ ] **Step 4: Run** — Expected: PASS. **Step 5: Commit** `feat(C1): lobby seat kind and Copy invite (verifies B-AC-1)`.

### PR-1a merge gate
- [ ] B-AC-1 and T-AC-5 (views) green and named; failing-test commits first; `pnpm typecheck && pnpm test` green; e2e lobby green; rulebook chapter `computer-players.html#claude-code-seat` still true.

### Task 1.4: the config block and the SDK — C2

**Files:** Modify `packages/engine/src/config.ts` (BRAIN block), `apps/server/package.json` + lockfile
- [ ] **Step 1:** Add `BRAIN.claudeSeat` per §3 (holdMs from S1) and `BRAIN.minLineLetters`; add `@modelcontextprotocol/sdk`. Commit first so PR-1c can branch (`chore(C2): BRAIN.claudeSeat and the MCP SDK`).

### Task 1.5: the writer — C3

**ACs verified:** T-AC-2 · **Spec:** §1 C3, §2 RULE-3, RULE-4
**Files:** Create `apps/server/src/claude-seat/writer.ts`; Test `apps/server/test/claude-seat-writer.test.ts`
- [ ] **Step 1: Write the failing test `T-AC-2: write resolves no_reply in the tick its signal aborts; a later submit is too late`** — Altitude: unit (a race the route can't time reliably). Trap: assert in the same tick, not after a timer.
- [ ] **Step 2: Run** — `pnpm --filter @mule/server test -- -t "T-AC-2"` · Expected: FAIL (module not found).
- [ ] **Step 3: Implement C3 per spec §1 C3** — mechanism: new PlaybookWriter implementer; first answer wins.
- [ ] **Step 4: Run** — PASS; Playbooks tests unchanged (C3's pin). **Step 5: Commit** `feat(C3): ClaudeSeatWriter (verifies T-AC-2)`.

### Task 1.6: writer chosen per seat kind, with or without a key — C4

**ACs verified:** T-AC-3, B-AC-9 · **Files:** Modify `apps/server/src/brain/index.ts` (`createBrain`, `writerFor`), `apps/server/src/mule-game.ts::start` (seat kind to AiSeat; WS3 named edit)
- [ ] **Step 1: Write the failing test `T-AC-3: keyless writerFor(claude seat) is a ClaudeSeatWriter; deciderFor null`** — Altitude: contract (brain test, `apps/server/test/claude-seat-brain.test.ts`); unset `ANTHROPIC_API_KEY` in the test.
- [ ] **Step 2: Write the failing test `B-AC-9: a keyless game with a Claude seat writes plans and no paid ledger line`** — Altitude: promise (a real game through the fake MCP client of Task 1.7; read the ledger file).
- [ ] **Step 3: Run both** — Expected: FAIL.
- [ ] **Step 4: Implement C4 per spec §1 C4** — mechanism wrap.
- [ ] **Step 5: Run** — PASS; keyed and keyless trial tests green (C4's pin). **Step 6: Commit** `feat(C4): writer per seat kind (verifies T-AC-3, B-AC-9)`.

### Task 1.7: the /mcp route, stateless, code per call — C2

**ACs verified:** T-AC-1, B-AC-3, B-AC-6, B-AC-7, T-AC-8, T-AC-5 (logs) · **Spec:** §1 C2, §2 RULE-2, RULE-3, RULE-4, §3 tools
**Files:** Create `apps/server/src/claude-seat/mcp.ts`; Modify `apps/server/src/server.ts::handleHttp` (route line, WS3 named edit); Test `apps/server/test/claude-seat-mcp.test.ts` (a fake MCP client over real HTTP against a real Room + MuleGame)
- [ ] **Step 1: Write the failing test `T-AC-1: every tool resolves the seat from its code only; no session id issued or read`** — Altitude: contract. Negative: seat A's code never touches seat B; a response never carries `Mcp-Session-Id`.
- [ ] **Step 2: Write the failing test `B-AC-3: two seats, two clients, each seat's plans only from its own code`** — Altitude: promise (game record). Negative: client A submitting B's ask_id with A's code is refused.
- [ ] **Step 3: Write the failing test `B-AC-6: a new client with the same code carries on and gets the open ask`**.
- [ ] **Step 4: Write the failing test `B-AC-7: after switching to Built-in, the next call gets "seat taken back"`**.
- [ ] **Step 5: Write the failing test `T-AC-8: after wrongCodesPerMinute wrong codes every call gets busy until refill; taken-back codes don't draw; big bodies refused`** — fake clock.
- [ ] **Step 6: Write the failing test `T-AC-5: no server log line contains a seat code`** — capture the logger during the B-AC-3 game.
- [ ] **Step 7: Run** — `pnpm --filter @mule/server test -- claude-seat-mcp` · Expected: FAIL.
- [ ] **Step 8: Implement C2 per spec §1 C2, §2 RULE-2..4, §3** — mechanism sprout; SDK Streamable HTTP in stateless mode.
- [ ] **Step 9: Run** — PASS; /ws, POST /rooms and static tests green. **Step 10: Commit** `feat(C2): stateless /mcp with the seat code per call (verifies T-AC-1, B-AC-3, B-AC-6, B-AC-7, T-AC-8, T-AC-5)`.

### Task 1.8: a late seat never holds the table — C3, C7 boundary

**ACs verified:** B-AC-4
- [ ] **Step 1: Write the failing test `B-AC-4: a Claude seat whose client never answers plays its built-in plan; the land grant starts on time`** — Altitude: promise (game record + timing); invariant: the seat is never `away`.
- [ ] **Step 2: Run, implement any gap per HC-3, run, commit** `test(C3): late Claude seat never holds the table (verifies B-AC-4)`.

### Task 1.9: risk check R-2/R-3 — manual

- [ ] **Step 1:** One full game on the Wi-Fi with Heiko's own Claude Code (`claude mcp add --transport http mule http://<host>:8787/mcp`), the invite pasted; record answered-in-time share per seat in the PR body.

### PR-1b merge gate
- [ ] T-AC-1, T-AC-2, T-AC-3, T-AC-5, T-AC-8, B-AC-3, B-AC-4, B-AC-6, B-AC-7, B-AC-9 green and named; failing tests first; consumer-side contract: the fake MCP client is the consumer of §3's tools; `pnpm typecheck && pnpm test` green; one review (independent reviewer, `Review: APPROVE at <sha>`).

### Task 1.10: the side pick waits up to 45 s for a Claude seat — C7

**ACs verified:** B-AC-5 · **Spec:** §1 C7, §2 RULE-6 · **Files:** Modify `apps/server/src/mule-game.ts` (`scheduleAuctionTick`, `auctionDone`), Test `apps/server/test/claude-seat-side-pick.test.ts`
- [ ] **Step 1: Write the failing test `B-AC-5: no plan → Done at 45 s on the built-in plan; a plan at 20 s → Done at 20 s`** — Altitude: promise (side-pick end time, fake clock); later goods don't wait; Continue still ends it.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement C7 per spec §1 C7 and §2 RULE-6** (in_place). **Step 4: Run** — PASS; auction e2e and side-pick tests green with no Claude seat (C7's pin). **Step 5: Commit** `feat(C7): side pick waits for a Claude seat (verifies B-AC-5)`.

### PR-1c merge gate
- [ ] B-AC-5 green; failing test first; `pnpm typecheck && pnpm test` and `pnpm e2e` green; one review.

### Gate: End of Phase P1 (wave 1)
- [ ] UBER-AC-1 for Claude Code: one game, two Claude seats, two Claude Code sessions on plans with `ANTHROPIC_API_KEY` unset, nobody touching them; per seat ≥90% answered in time, cross-seat refusals 0, ledger paid lines 0 (WS2 runs it; numbers in the PR body). Then main merge with Heiko's OK via the PM.

## Phase 2 — wave 2: the table sees what the seat is doing

### Task 2.1: SeatView carries the status; chips render it — C6 (WS4 half)

**ACs verified:** B-AC-2 · **ux:** mock `#tv-ready`, `#phone-ready`, `#lobby-b` · GRAFT TARGET TableApp.tsx (TvLobby, TvGame ready list), `apps/web/src/phone/hub/ReadyBar.tsx`, `Lobby.tsx::SeatRow`
- [ ] **Step 1: Write the failing test `B-AC-2: after a call with the code every screen says connected; while writing, thinking`** — Altitude: promise, front to back (Playwright; the fake MCP client makes the calls).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement C6's view and chips per the mock** against a stub status. **Step 4: Run** — PASS. **Step 5: Commit** `feat(C6): Claude status chips (verifies B-AC-2)`.

### Task 2.2: status from the last call — C6 (WS2 half)

**ACs verified:** T-AC-4 · **Spec:** §2 RULE-5
- [ ] **Step 1: Write the failing test `T-AC-4: again after holdMs; offline after holdMs+offlineGraceMs without a call; next call connected`** — fake clock, route test.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement C6's status per spec §2 RULE-5.** **Step 4: Run** — PASS. **Step 5: Commit** `feat(C6): status from calls (verifies T-AC-4)`.

### Task 2.3: the per-phase digest — C5

**ACs verified:** T-AC-6 · **Files:** `packages/ai/src/llm/manual.ts`, Test `packages/ai/test/llm-manual.test.ts`
- [ ] **Step 1: Write the failing test `T-AC-6: the land and auction digests are byte-stable and move with config`** — snapshot, like the manual pin.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement C5 per spec §1 C5** (render from PHASES). **Step 4: Run** — PASS. **Step 5: Commit** `feat(C5): per-phase digest (verifies T-AC-6)`.

### Task 2.4: junk lines dropped — C10

**ACs verified:** T-AC-7 · **Files:** `packages/ai/src/llm/reply.ts::cleanLine`, Test `packages/ai/test/llm-reply.test.ts`
- [ ] **Step 1: Write the failing test `T-AC-7: a line under minLineLetters letters is not said; "OK" with min 2 is said`** (chat record).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement C10** (in_place). **Step 4: Run** — PASS; existing cleanLine tests green. **Step 5: Commit** `feat(C10): drop junk lines (verifies T-AC-7)`.

### Gate: End of Phase P2
- [ ] B-AC-2, T-AC-4, T-AC-6, T-AC-7 green; `pnpm typecheck && pnpm test && pnpm e2e` green; one review per PR; rulebook chapter re-checked.

## Phase 3 — wave 3: every Claude app, set up in five minutes (G-1 chat apps, G-2)

Gated by S1's answer (D-1 b's condition, above).

### Task 3.1: the public address setting and the /mcp-only tunnel — C10a

**ACs verified:** B-AC-11 · **Spec:** §1 C10a, HC-7
**Files:** Create `scripts/tunnel/` (cloudflared config template with ingress `^/mcp$` → the game server, else 404), root `package.json` `tunnel` script, `docs/how-to/claude-seat-tunnel.md`
- [ ] **Step 1: Write the failing check `B-AC-11: at the public address, anything but /mcp answers 404 and never reaches the game server`** — Altitude: promise; a script run against Heiko's tunnel with the game server's request log open (manual, recorded in the PR body), plus a unit test that the generated ingress has exactly the /mcp rule and a 404 catch-all.
- [ ] **Step 2: Run the unit test** — FAIL. **Step 3: Implement C10a per spec §1 C10a.** **Step 4: Run** — PASS; with `MULE_PUBLIC_MCP_URL` empty nothing changes. **Step 5: Commit** `feat(C10a): /mcp-only tunnel and public address (verifies B-AC-11)`.

### Task 3.2: risk check R-1/R-5 — the how-to followed once

- [ ] **Step 1:** Heiko follows `docs/how-to/claude-seat-tunnel.md` once on his domain; time it and fix the steps that stalled.

### Task 3.3: the setup page — C9

**ACs verified:** B-AC-10 · **ux:** the PR-0 mock `#setup` · GRAFT TARGET new `apps/web/src/setup/ClaudeSetup.tsx`
- [ ] **Step 1: Write the failing test `B-AC-10 (render): the setup page shows the connector steps per app with the public address, and no code unless opened from the host's seat`** — Altitude: promise (Playwright render).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement C9 per the mock** (may_edit_content). **Step 4: Run** — PASS. **Step 5: Commit** `feat(C9): setup page (verifies B-AC-10 render)`.
- [ ] **Step 6: B-AC-10 timed test (UBER-AC-2)** — a first-timer in Claude Desktop, and separately in Claude Code, from the setup page and one invite to *connected*, under 5 minutes; times in the PR body.

### Gate: End of Phase P3
- [ ] UBER-AC-1 for a chat app with the bar set in S1; UBER-AC-2 timed; main merge with Heiko's OK via the PM.

## Phase 4 — wave 4: hand my seat to Claude (G-3)

### Task 4.1: the hand-over code and invite — C8 (room, web)

**ACs verified:** B-AC-8 (with 4.2, 4.3) · **ux:** mock `#move` · GRAFT TARGET `apps/web/src/phone/Shell.tsx::MoveDialog`
- [ ] **Step 1: Write the failing test `B-AC-8: a player hands their seat to Claude, closes the phone, and the game reaches game over without a Continue for that seat`** — Altitude: promise, front to back (Playwright + the fake MCP client); invariant: never `away` after the first call.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement C8's room and dialog per spec §1 C8 and §2 RULE-7** (WS4).

### Task 4.2: the game hook seatBecameComputer — C8 (WS3)

- [ ] **Step 1:** Add the hook in `apps/server/src/mule-game.ts` per §1 C8 (WS3 named edit); remove from `away`; covered by B-AC-8.

### Task 4.3: AiSeat and Playbooks entry mid-game — C8 (WS2)

- [ ] **Step 1:** Build the AiSeat and its Playbooks entry from the next ask per §1 C8 (R-4: a real-room test first). **Step 2:** Run B-AC-8 — PASS. **Step 3: Commit** `feat(C8): hand my seat to Claude (verifies B-AC-8)`.

### Gate: End of Phase P4
- [ ] B-AC-8 green; UBER-AC-3 run once live; main merge with Heiko's OK via the PM.

---

## Pre-implementation checklist

- [ ] Spec approved by Heiko (Amendment 1, 6 Nov); no open changes pending except S1's numbers
- [ ] Upstream: the MVP proof done (spec status); mock approved at a SHA (PR-0)
- [ ] Branch policy: sub-PRs into `ws2-brain` / the owning lane's branch; the PM batches to `feat/strategist`; main only with Heiko's OK
- [ ] Base `feat/strategist` @ `<sha>` green: `pnpm typecheck` 0 · `pnpm test` all green · `pnpm e2e` green ← run these at kick-off and paste the numbers
- [ ] WS3 named-edit OKs (server.ts `parse` and route line, mule-game.ts `start`, side pick, hook) and WS4 ownership of PR-0/1a/2a/3b/4 confirmed via the PM
- [ ] Spike outcomes recorded: S1
- [ ] Effort (~12–14 lane-days) communicated to the PM
