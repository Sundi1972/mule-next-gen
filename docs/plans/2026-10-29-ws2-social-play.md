# WS2 · Spec B v2: Claude plays the table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Programme (chosen by Heiko, 29 Oct).

**SPEC APPROVED** (Heiko, "Yes, approve it", via the PM, 29 Oct, at 2486382). Standing orders from the PM: spec A's PR-1
lands first; every merge that relies on HC-B3's narrowing stays blocked until WS3 answers (asked 29 Oct); the paired
tournament (B-6) goes to the PM with its exact cost before it runs, and Heiko clears the money.

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-B1 [spec §0] (A, relationships) | the human players at a table with Smart AIs, Heiko first | each AI reasons monthly about where it stands with every player, AIs included | UBER-AC-B1 | **B-1** |
| G-B2 [spec §0] (B, be liked) | the same | goodwill aims and unprompted messages (B-1); answers to whispers (B-2); cards (B-5) | UBER-AC-B2 | **B-1** |
| G-B3 [spec §0] (C, influence) | the same; whoever tunes the AIs | requests tied to its strategy (B-1); the tournament proof (B-6) | UBER-AC-B3 | **B-1** |
| G-B4 [spec §0] (D, allies for policy) | the same | vote asks before the ballot, votes from its reasoning | UBER-AC-B4 | B-4 |
| G-B5 [spec §0] (E, office) | the same | it runs, campaigns and is elected by its reasoning | UBER-AC-B5 | B-4 |

G-B4 and G-B5 are first delivered in B-4, for a real dependency: the vote and the run must be recorded playbook values,
so they need WS1's optional `politics` section and its clamps and WS7's VoteHand reading it (spec C6, R-B4), neither
built on 29 Oct. B-1 to B-3 are each usable at Heiko's table the moment they land: monthly social reasoning and
messages (B-1), answers to whispers (B-2), mute (B-3). The proofs that need a paid tournament (UBER-AC-B3, B5) are
B-6's.

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- spec A's strategy and playbook mechanics (B v2 adds the social part of the AI's reasoning; it does not redo the
  playbook); WS7's deal cards, their keep/break rules and the reputation score (used, never rebuilt); WS6's screens,
  including the mute control's design; anything of value changing hands through a message (WS7 HC-3); lying about
  game facts or rules; storing chat text in the game record (WS3's non-goal); memory across games; voice;
  bring-your-own-key.

**Thin baseline (spec §0.1):** the monthly folded reasoning only, no in-phase replies · about 3 PRs, $0.83 at 4 AI
seats · loses because a player who whispers an AI waits up to a month for a real answer.
→ **PR-1 relationship:** the baseline lost for a true reason (checked 29 Oct: spec A asks at upkeep for the next
month, `docs/plans/2026-10-29-ws2-spec-a-playbook.md` Task 1.4b; nothing else calls the model between upkeeps). B-1 is
the shortest slice through approach B, and it coincides with the baseline's folded reasoning; B-2 adds the in-phase
replies that are approach B's reason to exist, as the very next PR.

**Constraints:** spec §0.2 (HC-B1 … HC-B6) travel with every task.

**Architecture:** spec A's monthly strategy call gains a social section (C1) built on per-player public memory (C2);
its reply sets stances and per-player notes as recorded playbook edits and returns up to 3 messages beside the recorded
reply (C3); messages go out through the fact guard and the caps (C4), and AIs hear each other's lines (C5). Whispers get
an in-phase, words-only answer through `talkerFor` (C7, C8). Mute (C9), a politics play VoteHand reads (C6), and WS7's
cards (C10) follow as their upstream lanes land; the trial and the paired tournament prove it (C11).

**Tech Stack:** TypeScript (strict), pnpm workspaces, vitest; `@anthropic-ai/sdk` in `apps/server/src/brain/client.ts`
only; Sonnet 5.5 for the monthly reasoning and replies (Heiko, option 1), Haiku 5.5 by RULE-A5 when a seat's share
runs low.

**Inputs:**
- Spec: `docs/specs/2026-10-29-ws2-social-play.md` (approved at 2486382; §8 AM-B1 added at plan time)
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1-C11), §2 (RULE-B1..B5), §3, §4, §5, §6, §7, §8, §9
- Sections declared N/A by the spec: none. §5 says "code-only; the mute starts unset".
- N/A claims I checked: §5 holds (no persisted state; memory is rebuilt from notices; the mute is a recorded intent).
- Amended at plan time: AM-B1 (§6 had no AC for C10; B-AC-B7 added).
- Self-review: `plan-check.sh` matches only digit IDs; this spec's are G-B1, B-AC-B1, RULE-B1. Coverage was checked with
  the patterns fitted and positive-controlled (see the end of the plan).

### Codebase drift since the spec (checked 29 Oct, ws2-brain @ 475c4e7 and ws2-a-pr1-land @ a970975)

- `packages/ai/src/llm/brief.ts::landBrief` and `writer.ts::replySchema` exist only on ws2-a-pr1-land; B-1 bases on
  ws2-brain after spec A's PR-1 merges.
- `apps/server/src/brain/playbooks.ts` (C4's seam) does not exist yet: it is spec A's Task 1.4b, blocked on WS1's
  step 2. B-1 waits for it.
- `apps/server/src/brain/social-spike.ts` (C1's reuse) is on ws2-brain since #188 (475c4e7).
- `Strategy.stances` exists; the writer's `StrategyField` set does not include it yet (C3 adds it).
- Nothing B v2 adds as ADDED has landed: no `packages/ai/src/social/`, no `talkerFor`, no `Playbook.politics`, no mute.

---

## Freeze points and upstream contracts (Phase 0)

| Contract | Owner | State 29 Oct | Consumed by | Stub allowed? |
|---|---|---|---|---|
| Spec A PR-1: brief, writer, `writerFor`, playbooks.ts (Task 1.4b), recordPlaybook (1.5) | WS2 (spec A) | 1.1-1.4a on ws2-a-pr1-land @ a970975; 1.4b/1.5 wait WS1 step 2 | B-1 C1, C3, C4 | no: B-1 bases on ws2-brain after PR-1 merges (PM's order) |
| validatePlan accepts and clamps `/strategy/stances/<p>` and `/rivalReads/<p>` edits | WS1 | not asked yet | B-1 C3 | unit tests stub it; B-1's merge needs the real clamps |
| Optional `Playbook.politics` (run, votes, taxTarget) and its clamps | WS1 (types), WS3 and WS7 agree | not asked yet | B-4 C6 | unit tests stub the type locally; B-4's merge needs the real one |
| VoteHand plays `politics` when present (named edit) | WS7 | not asked yet | B-4 C6 | no |
| `PlanningPlay.offers` and WS7's card intent and AI answer rule | WS1 (types), WS7 (cards, slice 3) | not built | B-5 C10 | unit tests stub WS7's card API; B-AC-B7 needs the real one |
| MuleGame forwards AI lines to the other AIs (C5); `mute` intent (C9) | WS3 (named edits) | not asked yet | B-1 C5, B-3 C9 | no |
| record.ts passes `talkerFor`; replay.ts returns null (C8) | WS3 (named edits) | not asked yet | B-2 C8 | no |
| WS3's answer: a recorded writer call that read chat replays (HC-B3) | WS3 | asked 29 Oct, open | B-1 and B-4 merges | **no merge relies on it until answered** |
| The mute control on mock ws6-ux 29b792c2 (mute.html) | WS6 | mock approved by Heiko 29 Oct | B-3 B-AC-B4 | the server half builds without it |
| WS6's card screens | WS6 | not built | B-5 B-AC-B7 | no |

## PR decomposition

**Feature branch:** `ws2-brain` (the lane's integration branch). Sub-PRs target `ws2-brain`; the lane's milestone PRs
to `feat/strategist` need Heiko's OK through the PM: after B-3 (G-B1..G-B3 with mute, since HC-B2 is fatal) and after
B-4 (G-B4, G-B5).

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| B-1 | `ws2-b2-pr1-social` | Tasks 1.1-1.7 (C1, C2, C3 stances and notes and messages, C4, C5, RULE-B5) | B-AC-B1, B-AC-B2, B-AC-B5, T-AC-B1, T-AC-B2 (messages), T-AC-B3 (writer), T-AC-B4, T-AC-B5, T-AC-B7 | the writer reply's `messages`; stance and note edits | spec A PR-1, WS1 clamps, WS3 C5 edit, WS3's HC-B3 answer | No |
| B-2 | `ws2-b2-pr2-replies` | Tasks 2.1-2.3 (C7, C8, RULE-B3) | B-AC-B6, T-AC-B2 (replies), T-AC-B3 (replies) | `BrainService.talkerFor` | B-1; WS3 C8 edits | No |
| B-3 | `ws2-b2-pr3-mute` | Tasks 3.1-3.2 (C9) | B-AC-B4 | the `mute` intent | WS6's control on 29b792c2; WS3 C9 edits | Yes (WS6's control; driven front to back) |
| B-4 | `ws2-b2-pr4-politics` | Tasks 4.1-4.3 (C6, C3 politics edits, RULE-B4) | B-AC-B3, T-AC-B6 | `Playbook.politics` edits | WS1 type + clamps, WS7 VoteHand edit, WS3's HC-B3 answer | No |
| B-5 | `ws2-b2-pr5-cards` | Tasks 5.1-5.2 (C10) | B-AC-B7 | card proposals as planning edits | WS7 slice 3, WS6 card screens, WS1 `offers` | Yes (WS6's card screens; driven front to back) |
| B-6 | `ws2-b2-pr6-proof` | Tasks 6.1-6.3 (C11) | UBER-AC-B1..B5 | trial report social rows | B-1..B-5 | No |

### Per-PR authority

Every handoff carries this line verbatim:

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

| PR | may_edit | may_edit_content | must_not_edit |
|---|---|---|---|
| B-1 | `packages/ai/src/social/` (new: memory.ts, facts.ts, index.ts), `packages/ai/src/llm/brief.ts`, `packages/ai/src/llm/writer.ts`, `packages/ai/src/index.ts` (exports), `apps/server/src/brain/playbooks.ts` (message delivery after take-effect), their tests | `packages/engine/src/config.ts` BRAIN block (`BRAIN.social`, named edit, WS1 OKs); `apps/server/src/mule-game.ts` one touch point beside `heard` (C5, named edit, WS3 OKs) | `apps/server/src/record.ts`, `replay.ts` (B-2), `packages/protocol/` (B-3), `packages/engine/src/playbook.ts` (WS1), `packages/ai/src/hands/` (WS1, WS7), `apps/web/` (WS6), `apps/server/src/brain/client.ts` (spec A PR-3) |
| B-2 | `packages/ai/src/social/talker.ts` (new), `apps/server/src/brain/index.ts` (`talkerFor`), `apps/server/src/brain/ledger.ts` (kind 'talk'), their tests | `apps/server/src/record.ts` and `replay.ts` (C8, named edits WS3 reviews on the SHA); `config.ts` BRAIN.social reply values | `brief.ts`, `writer.ts` (B-1, B-4), `packages/protocol/` (B-3), `apps/web/` |
| B-3 | the mute check in `apps/server/src/brain/playbooks.ts` and in the talker's caller, their tests; `apps/web/e2e/mute.ts` (new; drives WS6's control, never edits it) | `packages/protocol/src/index.ts::MuleIntent` and `mule-game.ts` intent handling (named edits, WS3 reviews) | `apps/web/src/` (WS6 builds the control from mock 29b792c2) |
| B-4 | `packages/ai/src/llm/writer.ts` (politics edits), `packages/ai/src/llm/brief.ts` (election part of the social section), their tests | `packages/ai/src/hands/vote.ts` (named edit, WS7 reviews); `packages/engine/src/playbook.ts` (WS1 writes or reviews the optional `politics` type) | WS1's validatePlan body (WS1 writes the clamps); `apps/web/` |
| B-5 | the card proposal path in `writer.ts` and `playbooks.ts`, their tests; `apps/web/e2e/court.ts` (new) | `packages/engine/src/playbook.ts::PlanningPlay` (`offers`, WS1); `mule-game.ts` card-intent touch point (WS3) | WS7's card rules and answer rule; `apps/web/src/` (WS6) |
| B-6 | `apps/server/src/brain/trial.ts`, `trial-report.ts`, `cli.ts`, their tests; new ledger files under `apps/server/data/` from the paid runs | — | every earlier ledger in `apps/server/data/` |

### Contention

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/config.ts` (BRAIN block) | B-1, B-2, B-4; spec A PR-1..PR-4 | **serialised**: each PR's config hunk lands in merge order, each a named edit WS1 OKs; within B-1 every social value lands in Task 1.1 (**extracted**) |
| `packages/ai/src/llm/brief.ts` | B-1, B-4; spec A PR-1, PR-4 | **serialised**: spec A PR-1 → B-1 → B-4; spec A PR-4 rebases on whichever lands first |
| `packages/ai/src/llm/writer.ts` | B-1, B-4, B-5; spec A PR-1, PR-2 (one line) | **serialised** spec A PR-1 → B-1 → B-4 → B-5 |
| `apps/server/src/brain/playbooks.ts` | B-1, B-3, B-5; spec A PR-1 (1.4b), PR-4, PR-5 | **serialised** spec A PR-1 → B-1 → B-3 → B-5 |
| `apps/server/src/mule-game.ts` | B-1 (C5), B-3 (C9), B-5; spec A PR-1 | **serialised**, each one named touch point WS3 OKs |
| `apps/server/src/brain/index.ts`, `ledger.ts` | B-2; spec A PR-1, PR-3 | **serialised**: B-2 after spec A PR-1; spec A PR-3 rebases |

### Waves

- **Wave 1: B-1**, after spec A PR-1 merges. Tasks 1.2, 1.3 and 1.4 run in parallel: disjoint new files (memory.ts,
  facts.ts) and brief.ts, all reading the config Task 1.1 freezes. Its merge also waits for WS3's HC-B3 answer.
- **Wave 2: B-2**, after B-1. Words only, so it does not wait on the HC-B3 answer.
- **Wave 3: B-3**, when WS6's control on mock 29b792c2 lands. **Then the G-B1..G-B3 milestone PR to
  feat/strategist**, with Heiko's OK through the PM.
- **Wave 4: B-4**, when WS1's `politics` type and clamps and WS7's VoteHand OK land (and WS3's HC-B3 answer). **Then
  the G-B4/G-B5 milestone PR.**
- **Wave 5: B-5**, when WS7's slice 3 and WS6's card screens land.
- **Wave 6: B-6**, after B-1..B-4 (B-5 optional for the tournament), with the PM's clearance and the exact cost stated.
- B-3 and B-4 may swap order: whichever upstream lands first goes first; both serialise on mule-game.ts and
  playbooks.ts only through B-1's merged state.
- No migrations: no migration slot needed.

---

## Phase P1 — the monthly social reasoning (B-1)

### Task 1.1: the social settings — C1, C4 (config part)

**Phase:** P1 · **Depends on:** spec A PR-1 merged · **Parallelizable with:** none (it freezes the values 1.2-1.4 read) · **ACs verified:** none (settings; held by the guard)
**Spec sections consumed:** §1 C1, C4; §2 RULE-B1; §7 landmine

**Files:**
- Modify: `packages/engine/src/config.ts` (`BRAIN.social`: `heardLines`, the social section's caps,
  `messagesPerMonth` 3, `whispersPerPlayerMonth` 2; named edit, WS1 OKs)

- [ ] **Step 1: Add the values with their comments**, each with a `// literal-ok:` reason where the guard asks; the PENDING list does not grow.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test` → PASS, config-guard green
- [ ] **Step 3: Commit** — `feat(engine): BRAIN.social, the AI's social reasoning settings (spec B C1, C4)`

### Task 1.2: relationship memory — C2

**Phase:** P1 · **Depends on:** 1.1 · **Parallelizable with:** 1.3, 1.4 · **ACs verified:** T-AC-B7, T-AC-B5 (memory part)
**Spec sections consumed:** §1 C2, §0.2 HC-B5

**Files:**
- Create: `packages/ai/src/social/memory.ts`, `packages/ai/src/social/index.ts`
- Test: `packages/ai/test/social-memory.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-B7: memory is a pure function of the notices and public state; the same notices give an equal memory`** — Altitude: contract (memory is what reaches the prompt and what a replay rebuilds). Assert with stableJson equality over two runs and over a shuffled-then-restored notice list.
- [ ] **Step 2: Write the failing test `T-AC-B5 (memory): no rival's goods or unanalysed ground enter memory; a whisper between two other players never does`** — Negative case: plant a rival's distinctive stock → absent.
- [ ] **Step 3: Run them** — `pnpm --filter @mule/ai exec vitest run test/social-memory.test.ts` → FAIL (module missing)
- [ ] **Step 4: Implement C2 per spec §1 C2** — mechanism sprout; from WS3's notice kinds (claim, declare, trade, sale) and the public state; pacts and reputation read as none and 50 until WS7's slice 3.
- [ ] **Step 5: Run them** → PASS; commit `feat(ai): relationship memory from public notices (spec B C2, T-AC-B7, T-AC-B5)`

### Task 1.3: the fact guard — C4 (guard part), RULE-B2

**Phase:** P1 · **Depends on:** 1.1 · **Parallelizable with:** 1.2, 1.4 · **ACs verified:** T-AC-B2 (messages)
**Spec sections consumed:** §1 C4, §2 RULE-B2, §0.2 HC-B1

**Files:**
- Create: `packages/ai/src/social/facts.ts`
- Test: `packages/ai/test/social-facts.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-B2: RULE-B2 on declared facts and numbers`** — Altitude: contract (pass or drop is what HC-B1 promises). Cases: a false declared price → drop; a number with no declared fact → drop; "I'll vote for you" → pass; a prose-only false claim with no number → **pass** (R-B1, pinned); a true declared price → pass; a `rule` fact naming an `AiAction` type that does not exist → drop.
- [ ] **Step 2: Run it** → FAIL
- [ ] **Step 3: Implement RULE-B2 per spec §2** — mechanism sprout; pure, reads only the public state passed in. Plan-drift: the `rule` check uses `packages/ai/src/actions.ts::AiAction`'s types until WS1's MOVES lands.
- [ ] **Step 4: Run it** → PASS; commit `feat(ai): the fact guard, declared facts checked against public state (spec B RULE-B2, T-AC-B2)`

### Task 1.4: the social section in the brief — C1

**Phase:** P1 · **Depends on:** 1.1 · **Parallelizable with:** 1.2, 1.3 · **ACs verified:** T-AC-B5 (prompt part)
**Spec sections consumed:** §1 C1, §0.2 HC-B5

**Files:**
- Modify: `packages/ai/src/llm/brief.ts` (`landBrief` gains the social section; the memory comes in as an argument)
- Test: `packages/ai/test/llm-brief.test.ts` (extend T-AC-A2 deliberately; do not loosen it)

- [ ] **Step 1: Write the failing test `T-AC-B5 (prompt): the social section carries each other player's public position, relationship facts, the AI's last recorded standing and aims, the politics and the heard lines addressed to it or the table, in a fixed order, capped; never a rival's goods or a whisper between two others`** — Altitude: contract (the prompt is what leaves the server). Also extend `T-AC-A2`'s fixed order with the new section.
- [ ] **Step 2: Run it** → FAIL
- [ ] **Step 3: Implement C1 per spec §1 C1** — mechanism in_place; reuse S-B1's SOCIAL section builder from `apps/server/src/brain/social-spike.ts` by moving its pure part into `packages/ai/src/social/` (the spike then imports it back), not by copying it.
- [ ] **Step 4: Run `pnpm --filter @mule/ai test` and `MULE_FULL=1 pnpm --filter @mule/server exec vitest run test/social-spike.test.ts`** → PASS (the spike's pin); commit `feat(ai): the strategy brief's social section (spec B C1, T-AC-B5)`

### Task 1.5: the writer's social reply — C3 (stances, notes, messages)

**Phase:** P1 · **Depends on:** 1.4 · **Parallelizable with:** none · **ACs verified:** T-AC-B3 (writer part)
**Spec sections consumed:** §1 C3, §3 writer reply, §0.2 HC-B3

**Files:**
- Modify: `packages/ai/src/llm/writer.ts` (`replySchema` gains stances, rivalReads edits and `messages`; `writeReply` returns `messages` beside `reply`)
- Test: `packages/ai/test/llm-writer.test.ts` (extend), `apps/server/test/brain-writer-record.test.ts` (extend)

- [ ] **Step 1: Write the failing test `T-AC-B3 (writer): a reply's stances and rivalReads arrive as edits in the recorded reply; its messages are returned beside it and never appear in the record; the replay returns the same edits`** — Altitude: contract at the record (WS3's recorder and replay through `writerFor`). Negative case: a message text planted in the reply → absent from the record's JSON.
- [ ] **Step 2: Run it** → FAIL
- [ ] **Step 3: Implement C3 per spec §1 C3** — mechanism in_place; RecordedWrite unchanged. Plan-drift: until WS1's clamps for `/strategy/stances/<p>` and `/rivalReads/<p>` land, the unit tests stub validatePlan; B-1's merge gate needs the real clamps.
- [ ] **Step 4: Run `pnpm --filter @mule/ai test` and the server suite** → PASS (pins: T-AC-A5, the cause-code tests); commit `feat(ai): the writer's reply carries stances, notes and messages (spec B C3, T-AC-B3)`

### Task 1.6: messages go out, and AIs hear each other — C4, C5, RULE-B1

**Phase:** P1 · **Depends on:** 1.3, 1.5 · **Parallelizable with:** none · **ACs verified:** T-AC-B1, B-AC-B1, B-AC-B2, B-AC-B5
**Spec sections consumed:** §1 C4, C5, §2 RULE-B1, §4 races

**Files:**
- Modify: `apps/server/src/brain/playbooks.ts` (deliver an accepted reply's messages after take-effect)
- Modify (named edit, WS3 OKs): `apps/server/src/mule-game.ts` (C5: hand each AI-sent line to the other AI seats it reaches, beside `heard`)
- Test: `apps/server/test/brain-social.test.ts` (new), `apps/server/test/brain-table.test.ts` (pin)

- [ ] **Step 1: Write the failing test `T-AC-B1: RULE-B1 rows 1-6 with its examples`** — Altitude: contract (what the room delivers). Cases: 3 messages pass → 3 sent; a fourth → dropped; a whisper to a muted player → none (the mute input stubbed until B-3); a false price → dropped with cause 'fact_mismatch'; a bluff about its own vote → sent; planning over → dropped.
- [ ] **Step 2: Write the failing test `B-AC-B1: one human and three Smart AIs on a fake model, a full game: each month every AI's recorded playbook has a stance and a note for every other player, and each AI sends at least 3 unprompted messages naming another player, never past the caps`** — Altitude: promise (the record and the delivered chat). Negative case: the key unset → today's game, no messages. Trap: assert the fake model was asked each month.
- [ ] **Step 3: Write the failing test `B-AC-B2: an AI whose strategy needs a good another player sells whispers that player a request naming the strategy item, and its recorded note names the same item`** — Altitude: promise. Negative case: a player it needs nothing from → no request.
- [ ] **Step 4: Write the failing test `B-AC-B5: AI 1's whisper to AI 2 is quoted in AI 2's next monthly brief; a whisper between two humans never reaches either AI`** — Altitude: promise (AI 2's next prompt).
- [ ] **Step 5: Run them** → FAIL
- [ ] **Step 6: Implement C4 and C5 per spec §1 C4, C5 and §2 RULE-B1** — mechanism sprout (delivery) + one named edit (C5).
- [ ] **Step 7: Run the server suite and the brain-table pins** → PASS; commit `feat(server): AIs reason about the table monthly and message it; AIs hear each other (spec B C4, C5, T-AC-B1, B-AC-B1, B-AC-B2, B-AC-B5)`

### Task 1.7: the 5-seat budget — RULE-B5

**Phase:** P1 · **Depends on:** 1.6 · **Parallelizable with:** none · **ACs verified:** T-AC-B4
**Spec sections consumed:** §2 RULE-B5, §0.2 HC-B4

**Files:**
- Test: `apps/server/test/brain-budget.test.ts` (extend; `MULE_FULL=1` if it plays full games)

- [ ] **Step 1: Write the test `T-AC-B4: 5 Smart seats, a fake model billing at S-B1's option-(1) prices for 12 months: the total stays at or below BRAIN.gameBudgetUsd; Sonnet early, Haiku late`** — Altitude: contract (ledger totals and the model each request names). Negative case: 4 seats → every call Sonnet. The fake bills from S-B1's measured means (`apps/server/data/social-spike-ledger-2026-10-29.jsonl`), copied into the test as fixture numbers. Positive control: let RULE-A5 always pick Sonnet, watch the total pass $1, restore.
- [ ] **Step 2: Run it** — expected PASS on B-1's code (it proves an invariant spec A's port already holds); if it fails, it is a finding about AM-A14's port, reported before any fix.
- [ ] **Step 3: Commit** — `test(server): five Smart seats stay inside the game budget with social reasoning on (spec B RULE-B5, T-AC-B4)`

### B-1 merge gate

- [ ] B-AC-B1, B-AC-B2, B-AC-B5, T-AC-B1, T-AC-B2 (messages), T-AC-B3 (writer), T-AC-B4, T-AC-B5, T-AC-B7 green, named after their IDs, failing-test commits first
- [ ] The writer reply's `messages` is exercised from the consumer side (MuleGame through a fake SDK in brain-social.test.ts), not only in packages/ai's tests
- [ ] `pnpm typecheck && pnpm test` exit 0; `MULE_FULL=1` brain-trial, brain-spike, brain-budget, strategy-spike, social-spike, play-hooks green; config-guard green; sims byte-identical to trunk (`pnpm -s sim -- --games 40 --seed 1|101`, with and without `--walking off`)
- [ ] WS1's OK on the BRAIN hunk and its real clamps for stances and rivalReads; WS3's OK on the C5 touch point
- [ ] **WS3's HC-B3 answer received and it confirms a recorded writer call that read chat replays** (else stop: R-B2, back to Heiko)
- [ ] No new `@ts-ignore` / `eslint-disable` without a reason on the line
- [ ] CI green (check, e2e) on the head; then merge into ws2-brain under the lane rule
- [ ] Heiko's table: the PM offers a playtest at the lane rig (social reasoning and messages, no mute yet)

---

## Phase P2 — answers to whispers (B-2)

### Task 2.1: the talker — C7, RULE-B3

**Phase:** P2 · **Depends on:** B-1 merged · **ACs verified:** T-AC-B2 (replies)
**Spec sections consumed:** §1 C7, §2 RULE-B3, RULE-B2, §0.2 HC-B3, HC-B4

**Files:**
- Create: `packages/ai/src/social/talker.ts`
- Modify: `packages/engine/src/config.ts` (`BRAIN.social.replyModel`, `replyWaitMs`, `repliesPerPlayerPhase`, `repliesPerGame`; named edit, WS1 OKs)
- Test: `packages/ai/test/social-talker.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-B2 (replies): RULE-B3 rows 1-4 and RULE-B2 on the reply; a reply never throws`** — Altitude: contract. Cases: "will you vote for me?" → a reply; a third whisper in a phase → none; share nearly spent → a persona line from `packages/ai/src/personas.ts::lines`, no call; muted → none; a false declared price → dropped; the fake SDK throws, refuses or times out → a persona line or nothing.
- [ ] **Step 2: Run it** → FAIL
- [ ] **Step 3: Implement C7's talker per spec §1 C7 and §2 RULE-B3** — mechanism sprout; the port shape mirrors `writerFor` (never throws, wait bound, the model picked inside the port by RULE-A5 as AM-A14 does).
- [ ] **Step 4: Run** → PASS; commit `feat(ai): the talker, words-only answers to whispers (spec B C7, RULE-B3, T-AC-B2)`

### Task 2.2: `talkerFor` and the record passthrough — C7, C8

**Phase:** P2 · **Depends on:** 2.1 · **ACs verified:** T-AC-B3 (replies)
**Spec sections consumed:** §1 C7, C8, §3 talkerFor

**Files:**
- Modify: `apps/server/src/brain/index.ts` (`BrainService.talkerFor`), `apps/server/src/brain/ledger.ts` (kind 'talk')
- Modify (named edits, WS3 reviews on the SHA): `apps/server/src/record.ts` (`talkerFor` passed through, unrecorded, outside the call numbering), `apps/server/src/replay.ts` (`talkerFor: () => null`)
- Test: `apps/server/test/brain-service.test.ts` (extend), `apps/server/test/brain-writer-record.test.ts` (extend)

- [ ] **Step 1: Write the failing test `T-AC-B3 (replies): a game with whispers and replies, replayed with talkerFor null, reproduces every playbook, vote and score; a reply changes no state hash`** — Altitude: promise (WS3's replay result; state hashes before and after each reply). Positive control: make a reply set a stance, watch it go red, restore.
- [ ] **Step 2: Run it** → FAIL
- [ ] **Step 3: Implement** per spec §1 C7 and C8 (C8 ships in the same commit: atomic with C7). Classic and the unset key give `talkerFor` null.
- [ ] **Step 4: Run the server suite and WS3's record and replay tests** → PASS; commit `feat(server): the brain's talker, ledgered as talk; the recorder passes it through (spec B C7, C8, T-AC-B3)`

### Task 2.3: replies at the table — B-AC-B6

**Phase:** P2 · **Depends on:** 2.2 · **ACs verified:** B-AC-B6

**Files:**
- Modify (named edit, WS3 OKs): `apps/server/src/mule-game.ts` (a whisper to an AI seat goes to its talker; the reply goes out by `ctx.say`)
- Test: `apps/server/test/brain-social.test.ts` (extend)

- [ ] **Step 1: Write the failing test `B-AC-B6: a human whispers an AI "will you vote for me?"; the AI answers in the same phase, in character; nothing in the game state or playbooks changes`** — Altitude: promise (delivered chat; state and playbook hashes). Negative case: a third whisper in the phase → no reply.
- [ ] **Step 2: Run, implement, run** → PASS; commit `feat(server): AIs answer whispers in the phase (spec B C7, B-AC-B6)`

### B-2 merge gate

- [ ] B-AC-B6, T-AC-B2 (replies), T-AC-B3 (replies) green, named after their IDs, failing-test commits first
- [ ] `pnpm typecheck && pnpm test` exit 0; `MULE_FULL=1` suites green; config-guard green; sims byte-identical to trunk
- [ ] WS3's review of the record.ts and replay.ts edits on the SHA; WS1's OK on the BRAIN hunk
- [ ] CI green (check, e2e); merge into ws2-brain under the lane rule

---

## Phase P3 — mute (B-3)

### Task 3.1: the mute intent — C9 (server)

**Phase:** P3 · **Depends on:** B-1 merged (B-2 too, so replies are muted) · **ACs verified:** B-AC-B4 (server part)
**Spec sections consumed:** §1 C9, §3 mute intent, §0.2 HC-B2, §4 races

**Files:**
- Modify (named edits, WS3 reviews): `packages/protocol/src/index.ts::MuleIntent` (`mute`), `apps/server/src/mule-game.ts` (intent handling; delivery checks the mute)
- Modify: `apps/server/src/brain/playbooks.ts` and the talker's caller (RULE-B1 row 2 and RULE-B3 row 1 read the recorded mute)
- Test: `apps/server/test/brain-social.test.ts` (extend)

- [ ] **Step 1: Write the failing test `B-AC-B4 (server): after a mute, that AI's whispers, replies and card offers to that player stop and its public lines are marked hidden for that phone only; the host's mute does not clear the TV; an offer already on the phone stays until Ready`** — Altitude: promise (server delivery per phone). Race: a mute racing a send → the mute wins.
- [ ] **Step 2: Run, implement C9 per spec §1 C9, run** → PASS; commit `feat(server): a player can mute an AI (spec B C9, B-AC-B4)`

### Task 3.2: mute front to back — B-AC-B4

**Phase:** P3 · **Depends on:** 3.1; WS6's control built from mock ws6-ux 29b792c2 (mute.html) · **ACs verified:** B-AC-B4

**Files:**
- Test: `apps/web/e2e/mute.ts` (new; drives WS6's control, never edits it)

- [ ] **Step 1: Write `B-AC-B4: a player mutes an AI with its seat in the rail; its whispers, replies and offers stop and its public lines hide on that phone; other phones and the TV still show its public lines`** — Altitude: promise, a real browser, front to back; the test command owns its stack on free ports and drops it.
- [ ] **Step 2: Run it** → PASS against WS6's control; if it cannot pass without changing WS6's screen, stop and report to the lead. Commit `test(web): mute front to back (spec B B-AC-B4)`

### B-3 merge gate

- [ ] B-AC-B4 green server-side and front to back
- [ ] `pnpm typecheck && pnpm test` exit 0; the e2e green; config-guard green; sims byte-identical to trunk
- [ ] WS3's review of the protocol and mule-game.ts edits on the SHA; WS6's OK that its control is unchanged
- [ ] CI green (check, e2e); merge into ws2-brain under the lane rule
- [ ] **G-B1..G-B3 milestone:** the PM asks Heiko for the OK to take ws2-brain to feat/strategist

---

## Phase P4 — politics from the reasoning (B-4)

### Task 4.1: the politics section and its edits — C6, C3 (politics edits)

**Phase:** P4 · **Depends on:** B-1 merged; WS1's optional `Playbook.politics` type and clamps · **ACs verified:** T-AC-B6 (edits)
**Spec sections consumed:** §1 C6, C3, §3 `Playbook.politics`

**Files:**
- Modify: `packages/ai/src/llm/writer.ts` (`/politics/...` edits), `packages/ai/src/llm/brief.ts` (the election part: candidacies, promises, the next ballot)
- Test: `packages/ai/test/llm-writer.test.ts` (extend)

- [ ] **Step 1: Write the failing test `T-AC-B6 (edits): a reply's run, promise, votes and tax target arrive as /politics edits; validatePlan clamps an illegal one (a run canRun refuses; a vote for no candidate; a tax outside taxBounds)`** — Altitude: contract (the recorded reply and the clamped playbook).
- [ ] **Step 2: Run, implement per spec §1 C6 and C3, run** → PASS; commit `feat(ai): the writer sets the politics play (spec B C6, T-AC-B6)`

### Task 4.2: VoteHand plays it — C6, RULE-B4

**Phase:** P4 · **Depends on:** 4.1; WS7's OK on the named edit · **ACs verified:** T-AC-B6 (hand)

**Files:**
- Modify (named edit, WS7 reviews): `packages/ai/src/hands/vote.ts::VoteHand`
- Test: `packages/ai/test/vote-hand.test.ts` (extend the existing file; check its name before adding one)

- [ ] **Step 1: Write the failing test `T-AC-B6 (hand): RULE-B4 rows 1-5`** — Altitude: contract (the intents VoteHand sends). Pin: row 1 (no politics play → today's keyless rule) on the existing VoteHand tests, unchanged.
- [ ] **Step 2: Run, implement RULE-B4 per spec §2, run** → PASS; commit `feat(ai): VoteHand plays the recorded politics play (spec B C6, RULE-B4, T-AC-B6)`

### Task 4.3: the campaign at the table — B-AC-B3

**Phase:** P4 · **Depends on:** 4.2 · **ACs verified:** B-AC-B3
- [ ] **Step 1: Write the failing test `B-AC-B3: in an election month an AI whose play runs for Governor runs with its promise, sends a campaign message before the ballot, and each AI votes as its recorded play says`** — Altitude: promise (candidacies, tallies, delivered chat, the record). Negative case: an AI with no politics play votes by the keyless rule.
- [ ] **Step 2: Run, wire the campaign message through C4's delivery, run** → PASS; commit `feat(server): AIs campaign and vote by their reasoning (spec B C6, B-AC-B3)`

### B-4 merge gate

- [ ] B-AC-B3, T-AC-B6 green, named after their IDs, failing-test commits first
- [ ] `pnpm typecheck && pnpm test` exit 0; `MULE_FULL=1` suites green; config-guard green; sims byte-identical to trunk with Classic seats
- [ ] WS1's OK on the `politics` type and clamps; WS7's review of vote.ts on the SHA; **WS3's HC-B3 answer confirms** (votes follow reasoning that read chat)
- [ ] CI green (check, e2e); merge into ws2-brain under the lane rule
- [ ] **G-B4/G-B5 milestone:** the PM asks Heiko for the OK to take ws2-brain to feat/strategist

---

## Phase P5 — courting with cards (B-5)

### Task 5.1: card proposals as planning edits — C10

**Phase:** P5 · **Depends on:** B-1 merged; WS7 slice 3 in feat/strategist; WS1's `PlanningPlay.offers` · **ACs verified:** B-AC-B7 (unit part)
- [ ] **Step 1: Write the failing test `B-AC-B7 (unit): a reply's card proposal arrives as a /planning/offers edit, clamped by validatePlan, and goes out through WS7's card intent with its message; a muted player gets no offer`** — Altitude: contract (the intent sent). WS7's card API stubbed only until slice 3 is in.
- [ ] **Step 2: Run, implement C10 per spec §1 C10, run** → PASS; commit `feat(server): AIs propose WS7's cards from their reasoning (spec B C10, B-AC-B7)`

### Task 5.2: the card front to back — B-AC-B7
- [ ] **Step 1: Write `B-AC-B7: the AI's pact card reaches the player's phone with its message; one tap accepts; both phones list the pact; the replay reproduces it`** — Altitude: promise, two phones, front to back. Negative case: no proposal in the playbook → no card.
- [ ] **Step 2: Run it** → PASS; commit `test(web): an AI's card front to back (spec B B-AC-B7)`

### B-5 merge gate

- [ ] B-AC-B7 green unit and front to back; `pnpm typecheck && pnpm test` exit 0; the e2e green; sims byte-identical to trunk
- [ ] WS7's OK that its card rules and AI answer rule are used unchanged; WS1's OK on `offers`; WS3's on the touch point
- [ ] CI green (check, e2e); merge into ws2-brain under the lane rule

---

## Phase P6 — the proof (B-6)

### Task 6.1: social rows in the trial — C11

**Phase:** P6 · **Depends on:** B-1..B-4 merged
- [ ] **Step 1: Write the failing test `UBER-AC-B3 (measure): the trial report shows per game messages per AI, fact-guard drops, stances changed, votes by play vs keyless, social usd per seat, the total against BRAIN.gameBudgetUsd and the fallback share; a `--social off` flag runs the same seeds without it`** — Altitude: contract (the report rows). Fake client; temp ledger path.
- [ ] **Step 2: Run, implement C11 per spec §1 C11, run** → PASS; commit `feat(server): social rows and the paired run in the trial (spec B C11)`

### Task 6.2: the paired tournament — UBER-AC-B3, UBER-AC-B5 (paid)

**Cleared by:** the PM, with the exact cost stated first; Heiko clears the money.
- [ ] **Step 1: State the exact cost** from the trial's `--plan` worst case and S-B1's measured means: the 4-seed first pass (about $5.5) and the 8-seed run (about $11) at 4 AI seats; wait for the clearance in writing.
- [ ] **Step 2: Run it** with the key loaded only inside the one command (`--env-file`), ledgers to new files under `apps/server/data/`; on a 401 or 403, stop and tell the PM.
- [ ] **Step 3: Record UBER-AC-B3 (social side's mean worth vs off) and UBER-AC-B5 (offices won, campaign messages per running AI)** in the lane plan's Delivered record and send the PM the numbers.

### Task 6.3: the playtests — UBER-AC-B1, UBER-AC-B2, UBER-AC-B4
- [ ] **Step 1: The PM offers Heiko a full game with three Smart AIs at the lane rig**, including an election month; Heiko mutes one AI mid-game.
- [ ] **Step 2: Record Heiko's answers** to "did the AIs remember how you treated them?" (UBER-AC-B1) and "did at least one AI make you want to help it?" (UBER-AC-B2), and the record's evidence for UBER-AC-B4 (a vote ask before the ballot, each AI's vote and its recorded reason).

### B-6 merge gate

- [ ] UBER-AC-B3's measure green; the paid runs inside their cleared cost per their ledgers; UBER-AC-B1..B5 answered
- [ ] `pnpm typecheck && pnpm test` exit 0; CI green; merge into ws2-brain under the lane rule

---

## Named edits and contracts per lane (for the PM to route)

| Lane | What | For | When |
|---|---|---|---|
| WS1 | validatePlan clamps `/strategy/stances/<p>` and `/rivalReads/<p>`; BRAIN.social hunks | B-1 | before B-1 merges |
| WS1 | optional `Playbook.politics` type and its clamps (canRun, candidates, taxBounds); later `PlanningPlay.offers` | B-4, B-5 | before B-4 / B-5 |
| WS3 | the HC-B3 answer (a recorded writer call that read chat replays) | B-1, B-4 merges | open since 29 Oct |
| WS3 | mule-game.ts: AI lines to the other AIs (C5); whispers to the talker (B-2); the mute intent and protocol (C9); card-intent touch point (C10) | B-1, B-2, B-3, B-5 | per PR, reviewed on the SHA |
| WS3 | record.ts `talkerFor` passthrough; replay.ts `talkerFor: () => null` | B-2 | reviewed on the SHA |
| WS6 | the mute control from mock ws6-ux 29b792c2; the card screens | B-3, B-5 | when built |
| WS7 | VoteHand plays `politics` (named edit in vote.ts); slice 3's cards and AI answer rule | B-4, B-5 | before B-4 / B-5 |

---

## Pre-implementation checklist

- [x] Spec approved by Heiko (2486382); AM-B1 recorded at plan time
- [ ] Upstream: spec A PR-1 merged (B-1); WS1 clamps (B-1); WS3's HC-B3 answer (B-1, B-4 merges); WS6 mute control (B-3); WS1 + WS7 politics (B-4); WS7 slice 3 + WS6 card screens (B-5)
- [x] Branch policy: sub-PRs into ws2-brain; milestones to feat/strategist with Heiko's OK through the PM
- [ ] Base `ws2-brain` green at B-1's start, measured: typecheck 0 · tests per package · `MULE_FULL=1` suites · config-guard · sims byte-identical to trunk ← run and paste the numbers at B-1's pre-flight
- [x] Provider access: the PM's test key, loaded only inside a cleared paid command (B-6)
- [x] Spike outcomes recorded: S-B1 ($0.05704, `apps/server/data/social-spike-ledger-2026-10-29.jsonl`)
- [ ] Effort communicated: about 6 PRs; B-1 about 7 tasks
