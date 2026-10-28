# WS3 game record and replay: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Standard (spec header). There are two PRs. Each is one wave with one implementer, because the files
are shared within each PR and the PRs are serial.

**Status:** waiting on Heiko's design review of the spec (through the PM, 2026-10-29). **No PR-1 build before his
yes.** WS1 and WS2 are reviewing spec §3 (`record.ts`) as the freeze candidate. Any change they ask for is a spec §8
amendment, made before Task 1.

## Goals: lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 [spec §0] | Heiko (playtests), the league, WS1/WS2 | a finished game replays exactly from its file, with no Claude call | UBER-AC-1 | **PR-1** |

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- keeping records across a server restart, or in a database;
- resuming a game from a record mid-game;
- a replay viewer or any screen;
- league storage;
- replaying under a different config: the record carries the config's fingerprint, and replay refuses a mismatch rather than migrating;
- storing chat text. Chat only matters through the AI's answers, and those are recorded.

**Thin baseline (spec §0.1):** record human intents and AI moves with timestamps and replay them in order · under a
day · it loses because ticks compute `dt = now - last` (`mule-game.ts` :665, :838, :902, :953; re-read 2026-10-29),
answers count at the next `Brain.resolve`, and ties in the same ms need an order.
→ **PR-1 relationship:** the shortest slice through the chosen approach that still delivers G-1. The baseline lost for
a true reason. I re-checked the four `dt` lines at plan time.

**Constraints:** spec §0.2 HC-1 … HC-5 travel with every task.

**Architecture:**
- A `Recorder` in `apps/server/src/record.ts` wraps the room's seam: the GameContext, the Game and the BrainService. It
  keeps one step per input, timer firing or answer, each with the clock and host values read during it.
- `replay()` drives a fresh MuleGame through a scripted context, using the recorded timer ids and the clock tape. It
  names the first divergence.
- The types live in `packages/engine/src/record.ts`.

**Tech Stack:** TypeScript, vitest (with fake timers for the Room), node:crypto sha256, node:fs/promises, tsx for
the CLI.

**Inputs:**
- Spec: `docs/specs/2026-10-29-ws3-game-record.md` (on ws3-auctions @ 446dbcda)
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1–C7), §2 (RULE-1..6), §3, §4, §5, §6 (B-AC-1, T-AC-1..11),
  §7 (R-1..R-4), §9.
- Sections declared N/A by the spec: §5 is "code-only, no existing state", and I checked it (`apps/server/data/` is
  git-ignored). §8 has no amendments yet.
- N/A claims I checked:
  - §9 says "no ownership change": SEAMS has `server.ts` and `mule-game.ts` as WS3's (:220, :233) and engine
    `index.ts` as export lines for anyone (:24), so it holds.
  - HC-5 (no edit to `brain/**`) holds: `BrainService` is an interface (`apps/server/src/brain/index.ts:16`).

---

<!-- plan-check: no-task A1 A2 — not change ids: spec A's RULE-A1 and B-AC-A2, quoted in AM-1 -->

## PR decomposition

**Feature branch:** `ws3-auctions`, the lane. Each PR is a sub-branch cut from it, and the lane goes to
feat/strategist with Heiko's OK through the PM.

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-1 | `ws3-record-pr1` | Tasks 1–6 (C1, C2, C3, C4, C5) | B-AC-1 (goal check), T-AC-1..T-AC-9 | `GameRecord`, `RecordEvent`, `RecordStep`, `RecordedChoice`, `NoticeEntry`, `PlaybookEntry` types (spec §3) | `Playbook` (engine `playbook.ts`, frozen v1) | No |
| PR-2 | `ws3-record-pr2` | Tasks 7–8 (C6, C7) | T-AC-10, T-AC-11 | the `notice` and `recordPlaybook` options on MuleGame | PR-1's types and Recorder | No |

**Per-PR authority:**

- **PR-1:**
  - `may_edit`: `packages/engine/src/record.ts` (new), `packages/engine/src/index.ts` (export lines only),
    `apps/server/src/record.ts` (new), `apps/server/src/replay-cli.ts` (new), `apps/server/src/server.ts`
    (`createMuleServer`), `apps/server/src/index.ts`, `apps/server/src/mule-game.ts` (the options type and
    `enterPhase`'s gameOver branch only), `apps/server/package.json` (the scripts line),
    `apps/server/test/record.test.ts` (new).
  - `must_not_edit`:
    - `apps/server/src/brain/**` and `packages/ai/**`: WS2 and WS1 own them (HC-5);
    - `packages/tabletop/**`: WS4;
    - `apps/web/e2e/harness.ts`: WS4. It needs no change because recording is off without `recordDir`;
    - `packages/engine/src/playbook.ts`: WS1 holds the pen.
- **PR-2:**
  - `may_edit`: `apps/server/src/mule-game.ts` (the claim, trade and lot-sale sites, plus the options type),
    `apps/server/src/record.ts`, `apps/server/test/record.test.ts`.
  - `must_not_edit`: the same as PR-1, plus `packages/engine/src/record.ts`. That file is frozen after PR-1, and a
    change to it needs WS1's and WS2's OKs.

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

**Contention:**

| path | touched by | resolution |
|---|---|---|
| `apps/server/src/mule-game.ts` | PR-1, PR-2 | **serialised** — PR-2 is cut from the lane after PR-1 merges |
| `apps/server/src/record.ts`, `apps/server/test/record.test.ts` | PR-1, PR-2 | **serialised** — same |

**Waves:**
- **Wave 1 is PR-1.** It has one implementer, because its tasks share `record.ts` and its test file.
- **Wave 2 is PR-2.** It consumes PR-1's types and Recorder.

**Freeze point:** spec §3 is frozen when WS1 and WS2 OK it, which is before Task 1. WS1's step-2 build may stub
against `PlaybookEntry` and `recordPlaybook` from then on, before PR-2 lands.

**Migration slot:** none.

---

## Phase P1: PR-1, the record and its replay (G-1)

**MERGED into ws3-auctions as #172** (f740df32, pinned to ef3d8e57; Tier 1 green). It took a code review with a
mutation sweep (APPROVE WITH FIXES) and a fix round: the guarded game-over write, a replay.ts split, `ledgerGameId`,
and tests going from 11 to 16, with every reviewed mutant killed except one equivalent. The spec's AM-3 corrects four
claims. **B-AC-1 (Heiko's real game, keyless replay) is still open.**

### Task 1: the types: C1

**Depends on:** the §3 freeze OKs (WS1, WS2).
**ACs verified:** none directly. T-AC-1 consumes the types.
**Spec sections consumed:** §1 C1, §3.

**Files:**
- Create: `packages/engine/src/record.ts`
- Modify: `packages/engine/src/index.ts` (one `export type * from './record.js'` line, plus a value export for
  `configSnapshot` and `stableJson`)

- [x] **Step 1: Implement C1 per spec §1 C1 and §3** (sprout).
  - The types are exactly as in §3.
  - `configSnapshot()` returns every export of `./config.js` as plain data: import the namespace and drop functions.
  - `stableJson(value)` serialises with sorted object keys.
  - No I/O and no hashing in the engine: the sha256 is the server's (HC-4).
- [x] **Step 2: Typecheck.** Run `pnpm --filter @mule/engine typecheck`. Expected: exit 0.
- [x] **Step 3: Commit.** `feat(C1): the game record's types and pure helpers in the engine`

### Task 2: the failing promise test: T-AC-1 (red first)

**ACs verified:** T-AC-1 (red here, green at Task 4). **Spec sections consumed:** §6 T-AC-1, §2 RULE-1..6.

**Files:** create `apps/server/test/record.test.ts`.

- [x] **Step 1: Write `T-AC-1: a recorded game with a late Claude answer and a dropped phone replays identical`.**
  - **Altitude:** promise, at the Room boundary, as a player and Heiko receive it.
  - **The game:** drive a real `Room` from `@tabletop/core` under `vi.useFakeTimers()`.
    - Seats: two humans and one smart AI seat. The smart seat's brain is a stub `BrainService` whose decider
      answers through `setTimeout` with delays read from a fixed list, so at least one answer lands after a tick.
    - The scripted human claims, sends chat, makes one illegal intent, drops, and returns. The game runs with a
      small `maxMonths` to game over.
  - **The check:** `replay(record)` gives `identical: true` and equal per-seat scores and stateHash.
  - **Positive control** (same test file, a second row): move the first `answer` event one step later. The replay must
    throw `ReplayDiverged` or come out `identical: false`.
  - **Traps:**
    - Use the real `Room`. A hand-rolled ctx would never call `viewFor` the way the room does, so RULE-3 would go
      unproven.
    - Don't assert any score value: compare recorded against replayed only.
- [x] **Step 2: Run it and watch it fail.** Run `pnpm --filter @mule/server exec vitest run test/record.test.ts -t "T-AC-1"`.
  Expected: FAIL (`Recorder` / `replay` not exported).
- [x] **Step 3: Commit.** `test(T-AC-1): a recorded smart-AI game with a phone drop replays identical (red)`

### Task 3: the recorder: C2

**ACs verified:** T-AC-6, T-AC-7, T-AC-9 (red first, in this task). **Spec sections consumed:** §1 C2, §2 RULE-1,
RULE-3, RULE-4, RULE-5, §4 ("what still works when broken").

**Files:** create `apps/server/src/record.ts`; test in `apps/server/test/record.test.ts`.

- [x] **Step 1: Write the failing rows.**
  - **`T-AC-6:`** extra `viewFor` calls at random moments (a join, a pong) still replay identical.
  - **`T-AC-7:`** the same scripted game, recorded and unrecorded, ends with the same stateHash. A `vi.spyOn` on
    `fs/promises.writeFile` and `fs.writeFileSync` sees no call before game over.
  - **`T-AC-9:`** a refused intent is recorded with its message.
  - **`FM-REC-1`** (spec §4, "still works when broken"): a recorder whose bookkeeping throws (forced through a test
    hook) still lets the game reach game over and writes no file.
  - Altitude: promise (T-AC-6, T-AC-7, T-AC-9); failure mode (FM-REC-1).
- [x] **Step 2: Run them and watch them fail.** Run `pnpm --filter @mule/server exec vitest run test/record.test.ts`.
  Expected: FAIL.
- [x] **Step 3: Implement C2 per spec §1 C2, RULE-1, RULE-3, RULE-4 and RULE-5** (wrap).
  - **Plan-drift corrections:**
    - RULE-1 caps `refused` at 120 characters, and RULE-6 compares messages. The replay compares the capped strings.
    - `t0` and each step's `at` come from the *underlying* ctx's `now()`, read by the recorder itself and never
      taped (HC-3).
- [x] **Step 4: Run them; T-AC-6, T-AC-7, T-AC-9 and FM-REC-1 pass.**
- [x] **Step 5: Commit.** `feat(C2): the recorder wraps the room's seam (verifies T-AC-6, T-AC-7, T-AC-9)`

### Task 4: the replay: C3

**ACs verified:** T-AC-1 (green), T-AC-2, T-AC-3, T-AC-4. **Spec sections consumed:** §1 C3, §2 RULE-6, §0.2 HC-1.

- [x] **Step 1: Write the failing rows T-AC-2, T-AC-3 and T-AC-4.**
  - **`T-AC-2:`** a tampered intent → `ReplayDiverged`, with `seq` at or after the tampered step.
  - **`T-AC-3:`** a changed fingerprint → `RecordMismatch`. A spy on the MuleGame constructor counts 0.
  - **`T-AC-4:`** with `process.env.ANTHROPIC_API_KEY` set for the test and `createAnthropicSdk` mocked to throw if
    called, the replay completes. The mock counts 0 calls, and no ledger file appears in a temp `MULE_BRAIN_LOG`.
  - Altitude: contract, at `replay()`'s result and errors.
- [x] **Step 2: Run them and watch them fail.**
- [x] **Step 3: Implement C3 per spec §1 C3 and RULE-6** (sprout, same file). Serve move and writer calls by seat, call and kind
  (RULE-4 writer calls, AM-1). Writer calls occur only once WS2's writer method exists on `BrainService`; until then
  the code path is typed and covered by T-AC-11 in PR-2. The microtask flush after each step is
  `await new Promise((r) => setImmediate(r))`.
- [x] **Step 4: Run the whole file.** T-AC-1..T-AC-4, T-AC-6, T-AC-7 and T-AC-9 pass, including T-AC-1's positive
  control row (it has to go red against an answer moved one step later).
- [x] **Step 5: Commit.** `feat(C3): replay by recorded timer order and clock tape (verifies T-AC-1..T-AC-4)`

### Task 5: the server writes the file at game over: C4

**ACs verified:** T-AC-5, T-AC-8. **Spec sections consumed:** §1 C4, §2 RULE-2, §0.2 HC-2, §4.

**Files:** modify `apps/server/src/server.ts` (`createMuleServer`), `apps/server/src/index.ts` and
`apps/server/src/mule-game.ts` (the options type, and `enterPhase`'s `gameOver` branch calling `onGameOver`).

- [x] **Step 1: Write the failing rows.**
  - **`T-AC-5:`** a game through `createMuleServer({ recordDir: tmp })` to game over writes one file. Its text holds
    none of the test's seat tokens, handoff code, room code or API key.
  - **`T-AC-8:`** with `recordDir` pointing at a read-only temp dir, one `console.error` names the path, and the room
    still serves the game-over view.
  - Altitude: promise, at the file on disk and the room's view.
- [x] **Step 2: Run them and watch them fail.**
- [x] **Step 3: Implement C4 per spec §1 C4 and RULE-2** (in_place). With no `recordDir`, there is no Recorder at all.
- [x] **Step 4: Run them; they pass.** Then run the whole server suite, `pnpm --filter @mule/server test`. Expected: green,
  with the existing count unchanged plus the new rows, which pins C4 against regression.
- [x] **Step 5: Commit.** `feat(C4): the server records each game and writes it at game over (verifies T-AC-5, T-AC-8)`

### Task 6: the replay command: C5

**ACs verified:** B-AC-1 (the goal check, run by the lead with Heiko). **Spec sections consumed:** §1 C5.

- [x] **Step 1: Implement C5 per spec §1 C5.** Create `apps/server/src/replay-cli.ts`, and add
  `"replay": "tsx src/replay-cli.ts"` to `apps/server/package.json` scripts.
- [x] **Step 2: Smoke it against the file T-AC-5 wrote.** The test writes the file to a temp dir; copy the path from a
  debug run. Run `pnpm --filter @mule/server replay <file>`. Expected: one line per seat, then "identical", exit 0.
- [x] **Step 3: Commit.** `feat(C5): pnpm replay <file> prints scores and identical or the divergence`

### PR-1 merge gate

Before suggesting a merge of `ws3-record-pr1` into `ws3-auctions`:

- [x] T-AC-1..T-AC-9 and FM-REC-1 are green and named by their ids.
- [x] The red commits come before the implementation commits (Task 2's red; red-first rows in Tasks 3–5).
- [x] T-AC-1's positive control went red when tried. The commit message says so.
- [x] `pnpm typecheck && pnpm test` is green. Lean CI: only T-AC-1 sits in Tier 1, the rest stay local (spec §6). The
  implementer tags the others as local the way the server suite already does (check `apps/server/vitest.config.ts`
  before choosing).
- [x] The literal guard (`packages/engine/test/config-guard.test.ts`, which scans engine/src and ai/src) stays
  green, and `packages/engine/src/record.ts` has no numeric literals. The 120-character message cap is a named
  constant in `apps/server/src/record.ts`, as `brain.ts::NOTE_MESSAGE_CHARS` is: not a balance number, so not
  config (plan-time correction, 2026-10-29).
- [x] HC-2 is proven by T-AC-5, and HC-1 by T-AC-4.
- [x] No edit outside PR-1's `may_edit`.
- [x] Code review is clean, and so is the maintainability review.
- [ ] **Goal check, B-AC-1:** with Heiko's (or the PM's) go, Heiko plays one real game at the table with the key set
  and one phone dropped. `pnpm --filter @mule/server replay <file>`, with the key unset, prints "identical". Report
  that output. Never report the goal check from the T-AC-1 test run.

---

## Phase P2: PR-2, notices and playbook entries

**MERGED into ws3-auctions as #175** (79eb63a1, pinned to 1f882089; Tier 1 green). It went to 19 rows; the playbook
guard and the trade notice were each positive-controlled. T-AC-10 uses seed 4 over 3 months, which includes a
sale to the ship. AI claims share one `claim()` path. A seat's side is noticed at the good's status close.

### Task 7: notices: C6

**ACs verified:** T-AC-10. **Spec sections consumed:** §1 C6, §3 `NoticeEntry`, RULE-6 (notices skipped).

- [x] **Step 1: Write `T-AC-10: claims, declarations, trades (the ship included) and lot sales appear as notices, phaseNotices() holds them with recording off, and a replay without them is identical`** (red, AM-2).
  - Altitude: contract, at the record. Use T-AC-1's game, which includes a claim, an auction trade and a lot sale.
  - Use a seed whose month 1 lists a lot; pick it in a debug run and fix it in the test.
- [x] **Step 2: Implement C6 per spec §1 C6** (in_place). It goes at the three sites in `mule-game.ts` the spec names:
  handle 'claim' with resolveGrantBids, each good's settled declarations and `dealsInGood` in scheduleAuctionTick
  (a ship sale has buyer `'ship'`), and lot results in scheduleLandAuctionTick. `phaseNotices()` keeps them
  whether or not there's a recorder, and it's cleared in enterPhase (AM-2).
- [x] **Step 3: Run it; it passes.** Commit `feat(C6): claims, trades and lot sales as notice events (verifies T-AC-10)`.

### Task 8: playbook entries: C7

**ACs verified:** T-AC-11. **Spec sections consumed:** §1 C7, §3 `PlaybookEntry`.

- [x] **Step 1: Write `T-AC-11: recordPlaybook entries come out in call order with their step's at and seq, and the replay ignores them`** (red).
  - Altitude: contract.
  - Build the playbook fixture as a minimal valid `Playbook` from `@mule/engine` types, so a change to the frozen
    schema breaks compilation here.
  - **AM-1 guard:** replay a game where a stub writer returns a `RecordedWrite`. The replayed playbook must equal the
    recorded entry. **Positive control:** alter one recorded `write.edits[0].to`, and the replay must diverge.
- [x] **Step 2: Implement C7 per spec §1 C7** (sprout).
- [x] **Step 3: Run it; it passes.** Commit `feat(C7): recordPlaybook stamps at and seq (verifies T-AC-11)`.

### PR-2 merge gate

- [x] T-AC-10 and T-AC-11 are green, named, and red first.
- [x] T-AC-1..T-AC-9 are still green.
- [x] `pnpm typecheck && pnpm test` is green.
- [x] Reviews are clean.
- [x] WS1 and WS2 are told that `recordPlaybook` is live, with the SHA.

---

## Risks from spec §7

- **R-1 (memory per room):** measure it in PR-1. Task 6 Step 2 also prints the file size of T-AC-1's game, and the
  lead records it in the ledger.
- **R-2 (a crashed game leaves no file):** not built here. Heiko's ruling is pending through the PM. If he says yes, it
  becomes a PR-3 task: write with `ended: 'error'`, and the replay reproduces the throw. This plan gains that task by
  amendment.
- **R-3 (Node microtask order):** covered by T-AC-1's positive control (Task 4 Step 4).
- **R-4 (viewFor purity):** covered by T-AC-6 (Task 3).

---

## Pre-implementation checklist

- [x] The spec is approved by Heiko (design review, through the PM). No changes are pending.
- [x] WS1 and WS2 have OK'd spec §3 as the freeze, or their amendments are recorded in §8.
- [x] Upstream is available: the frozen playbook types `packages/engine/src/playbook.ts`, on trunk at 296eee2
  through #164, and in the lane.
- [x] Branch policy: sub-branches `ws3-record-pr1` and `ws3-record-pr2`, cut from `ws3-auctions` → lane →
  feat/strategist with Heiko's OK. **No spec or plan commit goes to the lane head while a lane PR is open.**
- [x] Base `ws3-auctions` @ `596169f1` green: tsc 0 (`pnpm typecheck`) · tests engine 281 (+1 skipped), ai 125,
  server 233, web 253, ui 46, tabletop 148 (`pnpm test`, local, 2026-10-29) · CI 4/4 (run 40767089177). 446dbcda adds
  only the spec. Re-run before Task 1 (SDD pre-flight).
- [x] Repo access confirmed (gh, push to ws3-*).
- [x] No spikes in spec §7.
- [x] Estimate: PR-1 about 2 days, PR-2 about half a day. The PM has both.
