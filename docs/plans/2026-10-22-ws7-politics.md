# WS7 Politics & Diplomacy Implementation Plan: slice 1 (elections, the Governor's tax, vote weight, the Land Baron)

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Programme (recommended in the spec header; PM confirmation asked 2026-10-22).

This plan covers slice 1 only. Each later slice (D1: council laws, deal cards and reputation, sabotage and the Sheriff, budget and overrule) is designed into the spec as an §8 amendment and then planned as a new section here.

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| P-1 [spec §0] | every player, most of all those behind | the table elects, taxes and (slice 2) legislates | UBER-AC-1 (sim), UBER-AC-2 (e2e) | **PR-1 + PR-2** (UBER-AC-1 with WS1's sim row); UBER-AC-2 in **PR-4** |
| P-2 [spec §0] | players who cooperate or scheme; solo players | binding pacts, visible trust | UBER-AC-3 | slice 3 (D1 order, Heiko 2026-10-22) |
| P-3 [spec §0] | risk-takers; the Sheriff | secret sabotage and getting caught | UBER-AC-4 | slice 4 (D1 order) |

<!-- plan-check limitation: the script matches goal rows by `G-n`; this lane's goals are `P-n` so they never read as Mission goals (Mission G-4 is the one they serve; WS6 did the same with UX-n). The goals table's delivery column was checked by hand: P-1 first delivered in PR-1+PR-2, P-2/P-3 in later slices by Heiko's D1. -->

P-2 and P-3 come after PR-2 on purpose: Heiko ruled the slice order (D1, votes first). UBER-AC-2 lands in PR-4 because its screens need WS6's hub mock, which is not drawn yet (spec §1 C11 depends_on); PR-1 to PR-3 are each usable on their own: PR-1+PR-2 give Heiko the sim row, PR-3 makes politics playable over the wire for any client.

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- **Direct trading of anything of value**, including through deal cards (00-concept, 21 Oct). Deal cards carry pacts, votes and promises only.
- **Whispers and reactions as a feature:** they exist; WS7 only attaches deal cards to them. AI whispers and AI chat lines are WS2's (its chat seam).
- **Colony projects** (reservoir, levee, observatory ...) and the **Projects** budget line: they protect against events (pirates, plague, meteors, the long winter) that do not exist yet; WS1 has built ten production events only.
- **Laws that need another lane's system first:** price cap and windfall tax (the auction, WS3), strategic reserve and anti-hoarding (the store, WS1), anti-monopoly (forced sale through the land auction, WS3), eminent domain (super tiles, not built), green zone (placement rules in development). v1 has the laws that only move money or block an action (see the decision D2 below).
- **Sabotage that needs a missing system:** tipping off the pirates (no pirates), stealing a MULE (players hold no spare MULEs).
- **Joint ventures** (shared adjacency): a production change, WS1's.
- **Reputation moving store prices:** a balance change for WS1, after the sim shows reputation moves at all.
- **Smart (language-model) seats' votes and deals:** they go through WS2's brain port once it takes these decisions; WS7's AI votes and deals are code (strategist and persona), playable with no key.
- **Screens before WS6 mocks them:** every politics screen is built into WS6's planning hub from an approved mock.

Slice-1 scope cuts recorded in the spec: the Land Baron's 10% land-auction discount (RULE-5) and anything the Sheriff does besides being elected and paid.

**Thin baseline (spec §0.1):** candidacy and ballots open for all of planning, counted at its end, result in the news · ~3 PRs · lost because no moment shows the result on every screen at once, which UBER-AC-2 requires. Re-checked 2026-10-22: `advancePhase` moves planning straight into the land grant (`packages/engine/src/game.ts::advancePhase`), so a count at the phase change lands on screens already showing the grant. Still true.
→ **PR-1 relationship:** shortest slice through the chosen approach. PR-1 is the engine's election, tax, weight, pay and score in one module, because UBER-AC-1's sim row needs all of them on (WS1 rows 1-3 toggle them one at a time).

**Constraints:** spec §0.2 (HC-1 … HC-8) travel with every task.

**Architecture:** a new pure engine module `packages/engine/src/politics.ts` owns `GameState.politics` (spec §9). `game.ts` calls it when planning opens, at upkeep and in the score. The election is a clocked stage machine stepped like the land auction; the AI gets `VoteHand` (`packages/ai/src/hands/vote.ts`), shaped like `LotHand`. The server ticks the election before starting the planning timer and adds three intents and a politics view; WS1 makes the sim play it.

**Tech Stack:** TypeScript (strict), pnpm workspaces, vitest, React 18 + Tailwind 4 with `@mule/ui`, Playwright (e2e), the in-repo `@tabletop/core` server.

**Inputs:**
- Spec: `docs/specs/2026-10-22-ws7-politics.md` (§0 APPROVED; slice-1 design sent for the design gate at 427dcc2)
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1–C11), §2 (RULE-1…9), §3, §4, §5, §6 (B-AC-1…5, T-AC-1…7), §7, §9
- Sections declared N/A: none. §5 says "code-only" (games live in memory); §8 has no amendments yet.
- N/A claims I checked: §5: `apps/server/src/mule-game.ts::MuleGame` holds `GameState` in a field with no persistence. No CHANGELOG.md and no `architecture/` site in the repo (`ls`), so those gate lines are N/A.

---

## Branching and PR decomposition

**Integration branch:** `ws7-politics` (base `feat/strategist` 8683d21). Sub-branches are cut from `ws7-politics` and merge back with `--no-ff` once review is clean and CI is green (lane rule). The lane PR **`ws7-politics` → `feat/strategist`** goes after slice 1 with WS1's sim rows, Heiko's OK through the PM.

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-1 | `ws7-pr1-engine` | Tasks 1.1–1.7 (C1, C2, C3, C4, C5, C6, C7) | B-AC-3, B-AC-4, T-AC-1, T-AC-2, T-AC-3, T-AC-5 | `GameState.politics`, `Politics`, `Election`, `Office`; `createGame({politics})`; politics.ts functions; POLITICS block | (none) | No |
| WS1 | WS1's own sub-branch into `ws7-politics` | C10 (play.ts, actions.ts, sim.ts, observe.ts) | T-AC-4, T-AC-7 | `AiAction` run/vote/setTax; `--politics off` | PR-1's contracts; VoteHand interface (frozen below) | No |
| PR-2 | `ws7-pr2-votehand` | Tasks 2.1–2.3 (C8) | T-AC-6 | `VoteHand` | PR-1's contracts; `AiAction` run/vote/setTax | No |
| PR-3 | `ws7-pr3-server` | Tasks 3.1–3.4 (C9) | B-AC-2, B-AC-5 | `MuleIntent` run/vote/setTax; `MuleView.politics`, `MyView.politics` | PR-1's contracts; VoteHand interface | No |
| PR-4 | `ws7-pr4-desks` | Tasks 4.1–4.3 (C11) | B-AC-1, UBER-AC-2 | (none) | PR-3's view; WS6's approved hub mock | Yes |

**Freeze point (wave 2):** VoteHand's interface is fixed here so PR-2, PR-3 and WS1's C10 run at once: `new VoteHand(mind: Mind, rng: Rng)`, `tick(state: GameState, dt: number, act: Act): void`, exactly `LotHand`'s shape (`packages/ai/src/hands/lot.ts::LotHand`). AiAction additions (WS1's actions.ts): `{type:'run'; office: Office | null}`, `{type:'vote'; office: Office; candidate: string | null}`, `{type:'setTax'; percent: number}`, and the existing `{type:'done'; done}` meaning Done for an election stage. WS1 owns the AiAction edit; PR-2 consumes it (if WS1's branch hasn't merged, PR-2 adds the three members as the same named edit and WS1 reviews).

**Waves:**
- Wave 1: PR-1 alone (everything consumes its contracts).
- Wave 2: PR-2, PR-3 and WS1's C10 in parallel. Safe together: disjoint files (below), all consuming PR-1's frozen types and the VoteHand interface frozen above.
- Wave 3: PR-4, once WS6's hub mock with the politics slots is approved and PR-3 is merged.
- Then WS1 runs sim rows 1-3 on `ws7-politics`; the money rows (2: AI tax, 3: pay) go to Heiko through the PM before the lane PR.

### Per-PR authority

Every handoff carries the standing authority line, verbatim:

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

**PR-1**
- `may_edit`: `packages/engine/src/politics.ts` (new) · `packages/engine/test/politics.test.ts` (new) · `packages/engine/src/config.ts` (a new POLITICS block only) · `packages/engine/src/index.ts` (one export line)
- named edits (WS3 reviews): `packages/engine/src/types.ts` (`GameState.politics` and the §3 types only) · `packages/engine/src/game.ts` (createGame option + openPlanning call; advancePhase's planning and upkeep calls; scoreParts' `office` line) · `packages/engine/test/score-parts.test.ts` (one case for the office line)
- `must_not_edit`: `packages/engine/src/{observe,economy,lots,auction}.ts` (WS1/WS3; observe and cloneForSim are WS1's C10) · `packages/ai/**` · `apps/**`

**PR-2**
- `may_edit`: `packages/ai/src/hands/vote.ts` (new) · `packages/ai/test/vote-hand.test.ts` (new file in WS1's test dir, named) · `packages/ai/src/index.ts` (one export line) · `packages/engine/src/config.ts` (POLITICS.ai sub-block only)
- `must_not_edit`: `packages/ai/src/{play,actions,sim,seat,strategist}.ts` (WS1; C10) · `packages/engine/src/**` except the config sub-block · `apps/**`

**PR-3**
- named edits (WS3 reviews): `packages/protocol/src/index.ts` (three MuleIntent members; `MuleView.politics`, `MyView.politics`) · `apps/server/src/server.ts` (`isIntent` cases run/vote/setTax) · `apps/server/src/mule-game.ts` (election tick, intents, VoteHand construction, politics view)
- `may_edit`: `apps/server/test/politics.test.ts` (new)
- `must_not_edit`: `packages/engine/**`, `packages/ai/**`, `apps/web/**`

**PR-4**
- `may_edit_content`: the politics desks in WS6's hub, grafted from WS6's approved mock at its pinned SHA: wire data, handlers and intents; keep composition, layout, tokens and every `data-testid`.
- `may_edit`: `apps/web/e2e/politics.ts` (new e2e)
- `must_not_edit`: the hub frame (WS6's PR-9), `apps/web/src/phone/{PhoneApp,Shell}.tsx` and `apps/web/src/table/TableApp.tsx` except one route/slot line each (WS4 reviews)

### Contention

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/config.ts` | PR-1 (POLITICS), PR-2 (POLITICS.ai) | **serialised** — PR-2 branches after PR-1 merges |
| `packages/engine/src/types.ts` | PR-1; WS1 C10 reads only | **serialised** — PR-1 first |
| `packages/ai/src/index.ts` | PR-2; WS1 C10 may add exports | **seam moved** — one export line each; whoever merges second rebases |
| `apps/server/src/mule-game.ts` | PR-3; other lanes' named edits | **serialised** — PR-3 rebases on `ws7-politics` (synced from trunk) before review |

---

## Tasks

### Task 1.1: POLITICS block and types — C1

**Phase:** P1 · **Depends on:** none · **ACs verified:** (contract) · **Spec sections consumed:** §1 C1, §3

**Files:** Modify `packages/engine/src/config.ts` (new POLITICS block after TAX), `packages/engine/src/types.ts` (`GameState.politics` + §3 types), `packages/engine/src/index.ts`. Create `packages/engine/src/politics.ts` (empty exports for now).

- [ ] **Step 1:** Add the POLITICS block with every number §2 names: `electionMonths [1,4,7,10]`, `nominateMs 20_000`, `ballotMs 20_000`, `revealMs 6_000`, `revealCountdownMs 3_000`, `weight {plotsPerVote 10, repHigh 70, repLow 30, taxPerVote 300, taxCap 2}`, `tax {min 0, max 15, maxStep 5}`, `pay {governor 50, sheriff 30}`, `termScore` (placeholder 100). Each with a one-line doc comment in the file's style.
- [ ] **Step 2:** Add `politics: Politics | null` to `GameState` and the §3 types (`Office`, `Politics`, `Election`).
- [ ] **Step 3:** `pnpm --filter @mule/engine typecheck` — Expected: errors only at `createGame` (missing field). Fixed in 1.2.
- [ ] **Step 4:** Commit `feat(engine): POLITICS config and politics state types (C1)`.

### Task 1.2: createGame option and openPlanning — C1, C2

**Depends on:** 1.1 · **ACs verified:** T-AC-5 (off-path half) · **Spec:** §1 C1, C2, §2 RULE-1, RULE-5

**Files:** Modify `packages/engine/src/game.ts` (`createGame`, `advancePhase`), `packages/engine/src/politics.ts`. Test `packages/engine/test/politics.test.ts`.

- [ ] **Step 1: Write failing tests** `RULE-5: the Land Baron` (three rows of RULE-5's table) and `C1: politics off leaves the game as before` (createGame({politics:false}).politics === null and treasury.salesTax === TAX.salesTax; a month played via advancePhase leaves politics null). Altitude: unit (pure engine rules). Observed at: GameState after createGame/advancePhase.
- [ ] **Step 2:** `pnpm --filter @mule/engine test -- politics` — Expected: FAIL (openPlanning not defined).
- [ ] **Step 3: Implement C1 and C2** per spec §1 C1, C2 and §2 RULE-1, RULE-5. Path: `politics.ts` (`openPlanning`), call sites at the end of `createGame` and after `state.month++` in `advancePhase`. Mechanism: sprout.
- [ ] **Step 4:** Run tests — Expected: PASS; `pnpm --filter @mule/engine test` all green (no existing test moves).
- [ ] **Step 5:** Commit `feat(engine): politics opens with each planning phase; host option (C1, C2)`.

### Task 1.3: Vote weight — C4

**Depends on:** 1.2 · **Spec:** §1 C4, §2 RULE-4

- [ ] **Step 1: Write failing test** `RULE-4: vote weight parts` — a player with 23 plots, the Baron, 650 paid → base 1, land 2, reputation 0, baron 1, taxes 2 = 6; a player with 900 paid → taxes capped at 2; no entry in `treasury.paid` → taxes 0. Altitude: unit.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement C4** (`voteWeight(state, id)` returning total and parts) per §2 RULE-4. Path: `politics.ts`.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): vote weight with its parts (C4)`.

### Task 1.4: The election stage machine — C3

**Depends on:** 1.3 · **ACs verified:** T-AC-1, T-AC-2, B-AC-3, B-AC-4 · **Spec:** §1 C3, §2 RULE-1, RULE-2, RULE-3

- [ ] **Step 1: Write failing tests T-AC-1, T-AC-2, B-AC-3, B-AC-4 and RULE-1/RULE-2**, named after the ACs:
  - `T-AC-1: the election steps nominate → ballot → reveal → over on its clocks`, and `T-AC-1: a stage ends early when every player is Done`, and `T-AC-1: a vote after the ballot closed throws RuleError`.
  - `RULE-1 row 2: no contested office skips the ballot`.
  - `AM-1: leaving planning closes an open election and seats the winners`.
  - `RULE-2` one test per row (closed, two terms in a row, switching office, withdraw).
  - `T-AC-2` / `B-AC-3` / `B-AC-4`: one test per RULE-3 row (appointed governor, appointed sheriff excludes the new Governor, unopposed, votes, baron tie-break, tie rule by plots then seat).
  - Invariant in each: nobody holds both offices.
  Altitude: unit — the engine is the boundary where the result is fixed; the screens only show it (B-AC-1 is proven at the screen in PR-4). Trap: weights are read when the ballot closes, not when the vote is cast — assert with a plot that changes hands in between only if setup allows; otherwise note it in the test name.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement C3** per §1 C3 and §2 RULE-1–3: `runFor`, `castVote`, `electionDone`, `stepElection(state, dt)` (returns the result on entering reveal, else null), seating winners when the reveal ends and counting terms. Path: `politics.ts`. No RNG anywhere (HC-1, WS1 agreement).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): election with nominate, ballot and reveal (C3)`.

### Task 1.5: The Governor sets the sales tax — C5

**Depends on:** 1.4 · **ACs verified:** T-AC-3 · **Spec:** §1 C5, §2 RULE-6

- [ ] **Step 1: Write failing tests** `T-AC-3: tax bounds from the month's starting rate` (start 5 → 0 and 10 allowed, 11 refused; start 15 → 10..15), `T-AC-3: only the Governor, only in planning, not during the election` (each refusal a RuleError), and `C5: a sale after setTax is taxed at the new rate` (call `taxSale` and check the fund's change). Altitude: unit; the sale check is the contract with `taxSale`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement C5** (`setSalesTax(state, id, percent)`) per §2 RULE-6. Path: `politics.ts`. Mechanism: in_place (writes `treasury.salesTax`; `taxSale` unchanged).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): the Governor sets the sales tax (C5)`.

### Task 1.6: Office pay and the term score — C6, C7

**Depends on:** 1.5 · **ACs verified:** T-AC-5 · **Spec:** §1 C6, C7, §2 RULE-7

**Files:** also `packages/engine/test/score-parts.test.ts` (one case).

- [ ] **Step 1: Write failing tests** `T-AC-5: pay never takes the fund below 0` (fund 20 → Governor 20, Sheriff 0; fund 100 → 50 and 30), `T-AC-5: the office score line is 0 with politics off`, and in score-parts.test.ts `C7: office line = termScore × terms served; the other lines unchanged`. Altitude: unit.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement C6** (`payOffices`, called in advancePhase's upkeep branch right after `runUpkeep` and before the report reads `colonyFund`) **and C7** (`office` in `ScoreParts`, added after `raw` is rounded — the pin in spec §1 C7). Paths: `politics.ts`, `game.ts::advancePhase`, `game.ts::scoreParts`.
- [ ] **Step 4:** `pnpm --filter @mule/engine test` — Expected: all PASS, including every existing score test unchanged.
- [ ] **Step 5:** Commit `feat(engine): office pay from the fund and the term score (C6, C7)`.

### Task 1.7: PR-1 integration check

- [ ] **Step 1:** `pnpm typecheck && pnpm test` — Expected: exit 0 in every package. (The server and AI compile against the new optional field without change.)
- [ ] **Step 2:** `pnpm sim -- --games 20 --players 4` — Expected: runs; with no VoteHand yet, every election appoints (no candidates) and the tax stays 5%. Record the output; WS1's row 0 later proves the off path byte-identical.
- [ ] **Step 3:** Open PR `ws7-pr1-engine` → `ws7-politics`; request WS3's review of the types.ts/game.ts named edits.

### PR-1 merge gate

- [ ] Every AC in the PR's "ACs verified" column has a green test, named after the AC
- [ ] Failing-test commits precede implementation in history
- [ ] `packages/engine` has no I/O, `Date.now()` or `Math.random()` (HC-1): `grep -n -e "Date.now" -e "Math.random" packages/engine/src/politics.ts` is empty
- [ ] Every number is in POLITICS (HC-2): no numeric literal in politics.ts but 0, 1 and 100 for percent
- [ ] Nothing but politics.ts writes `state.politics` (spec §9): `grep -rn "politics\." packages/engine/src | grep -v politics.ts | grep "="` shows only reads
- [ ] WS3 reviewed the named edits; CI (`check`, `e2e`) green
- [ ] No new `@ts-ignore` / `eslint-disable`

### Task 2.1: VoteHand runs and votes — C8

**Phase:** P2 · **Depends on:** PR-1; AiAction run/vote/setTax (WS1 C10, or the same named edit here) · **ACs verified:** T-AC-6 · **Spec:** §1 C8, §2 RULE-8

**Files:** Create `packages/ai/src/hands/vote.ts`, `packages/ai/test/vote-hand.test.ts`. Modify `packages/ai/src/index.ts` (export), `packages/engine/src/config.ts` (POLITICS.ai: `actMs`, `runGovernor`/`runSheriff` per persona, `taxTarget` per persona, `taxFundBump 2`, `fundMonths 3`).

- [ ] **Step 1: Write failing tests** `T-AC-6: every Classic seat acts and presses Done within each stage's clock` (a seeded 4-AI game: tick VoteHand + stepElection until over; every seat is in `done` before each stage's clock runs out, and every refused action count is 0), `RULE-8: a non-candidate votes for the candidate with the fewest plots`, `RULE-8: Rookie votes for some candidate and is never refused`. Altitude: contract — the hand acts only through `applyAction`-shaped `act`, as the server and sim will call it. Trap: use `observe()` inside the hand, never `state` directly, so the hand can't read another seat's ballot.
- [ ] **Step 2:** `pnpm --filter @mule/ai test -- vote-hand` — Expected: FAIL.
- [ ] **Step 3: Implement C8** run/vote/done per §2 RULE-8, the interface frozen above. Mechanism: sprout. Seed from the caller (the server and play.ts derive it from the seat seed XOR a constant of its own, like LotHand).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(ai): VoteHand runs for office and votes (C8)`.

### Task 2.2: VoteHand governs the tax — C8

**ACs verified:** T-AC-6 (tax half)

- [ ] **Step 1: Write failing tests** `T-AC-6: a Governor seat sets a tax inside RULE-6` and `RULE-8: steps toward the persona target by at most maxStep; +taxFundBump when the fund is under fundMonths of office pay; clamped`. Altitude: unit on the policy, contract on the act.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement** the tax step per §2 RULE-8 (once per planning, after the election is over, deterministic).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(ai): an AI Governor sets the tax (C8)`.

### Task 2.3: PR-2 integration check

- [ ] **Step 1:** `pnpm typecheck && pnpm test` — Expected: exit 0.
- [ ] **Step 2:** Open PR `ws7-pr2-votehand` → `ws7-politics`; tell WS1 the hand is ready for play.ts (C10).

### PR-2 merge gate

- [ ] T-AC-6 green, tests named after their ACs, failing tests first
- [ ] The hand reads only `observe()` (HC-4): `grep -n "state\.\(players\|politics\)" packages/ai/src/hands/vote.ts` shows no ballot read
- [ ] No model call and no key read (HC-8)
- [ ] CI green; WS1 told

### Task 3.1: Protocol and wire — C9

**Phase:** P2 · **Depends on:** PR-1 · **ACs verified:** (contract) · **Spec:** §1 C9, §3

**Files:** Modify `packages/protocol/src/index.ts`, `apps/server/src/server.ts` (`isIntent`). Test `apps/server/test/politics.test.ts` (new).

- [ ] **Step 1: Write failing test** `C9: the wire accepts run, vote and setTax and refuses malformed ones` (office not in the two; percent not an integer). Altitude: contract at `isIntent`.
- [ ] **Step 2:** Run `pnpm --filter @mule/server test -- politics` — Expected: FAIL.
- [ ] **Step 3:** Add the three intents and the `MuleView.politics` / `MyView.politics` shapes per spec §3's worked example; `isIntent` cases.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(protocol): politics intents and view (C9)`.

### Task 3.2: The server runs the election before planning — C9

**ACs verified:** B-AC-1 (server half) · **Spec:** §1 C9, §2 RULE-1

- [ ] **Step 1: Write failing tests** `C9: in month 1 the planning timer starts only after the election is over` (phaseEndsAt null during the election; set once over), `C9: ready during an election marks Done for the stage`, `C9: an away seat is marked Done`, `C9: month 2 has no election`. Altitude: contract at `MuleGame` with a fake clock, as the land-auction server tests do.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement** the election tick in `enterPhase` for planning (copy `scheduleLandAuctionTick`'s shape: stepElection + each AI seat's VoteHand tick; when over, start the PHASE_MS.planning timer and `seat.planMonth`), `ready` → `electionDone` during the election, run/vote/setTax in `handle`, VoteHand constructed beside LotHand in `start`, AI moves through `aiAct`.
- [ ] **Step 4:** Run — Expected: PASS; `pnpm --filter @mule/server test` all green.
- [ ] **Step 5:** Commit `feat(server): elections run first in planning (C9)`.

### Task 3.3: The politics view hides ballots — C9

**ACs verified:** B-AC-5, B-AC-2 · **Spec:** §2 RULE-9

- [ ] **Step 1: Write failing tests** `B-AC-5: another phone and the TV never receive Brix's ballot` (serialize `viewFor('ossa')` and `viewFor(null)`; Brix's choice absent; `viewFor('brix')` has it), plus an exact-keys allow-list on the board's `politics` view and its `election` (the `expectBoardKeys` pattern in `apps/server/test/auction-units.test.ts`, HC-2 since #47), so a new field must be checked before it reaches the TV, and `B-AC-2: after the Governor sets 8%, the next auction sale is taxed at 8%` (drive one sale through the server's auction tick; assert the seller's money in the view). Altitude: promise at the server's view — what each screen receives.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3: Implement** the politics view per spec §3 (public part on every view; `me.politics` only on the owner's), and the news line on each reveal.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(server): politics view, ballots private (C9)`.

### Task 3.4: PR-3 integration check

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm e2e` — Expected: exit 0; the existing smoke e2e still reaches the land grant (the election appoints when nobody runs and skips the ballot, so the smoke is at most nominate's 20 s longer at its phaseScale).
- [ ] **Step 2:** Open PR `ws7-pr3-server` → `ws7-politics`; WS3 reviews the named edits.

### PR-3 merge gate

- [ ] B-AC-2, B-AC-5 green at the server's view; tests named after ACs; failing tests first
- [ ] The existing smoke e2e passes unchanged
- [ ] WS3 reviewed; CI green

### Task 4.1: Graft the desks — C11

**Phase:** P3 · **Depends on:** PR-3 merged; WS6's hub mock approved (drawn at ws6-ux b28ee91; the approved SHA is pinned here when Heiko rules) · **ACs verified:** B-AC-1 · **Spec:** §1 C11

- [ ] **Step 1:** Write the failing e2e `B-AC-1: both humans run, vote, and see the same result at the same moment` in `apps/web/e2e/politics.ts` (two phone pages and the TV; month 1; both run for Governor; each votes; after the countdown all three show the same totals and winner at once (the result's testid appears on all three within one tick of each other); the winner's phone shows the tax desk). Altitude: promise, front to back. The test command owns its stack (harness `startServer`), never the rig.
- [ ] **Step 2:** `pnpm e2e -- politics` — Expected: FAIL (no desk).
- [ ] **Step 3:** Graft the mock's offices strip, election desk, reveal, tax desk, weight panel and Baron badge: `may_edit_content` only; keep every `data-testid`.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): politics desks in the planning hub (C11)`.

### Task 4.2: UBER-AC-2 end to end

- [ ] **Step 1:** Extend the e2e: the winner sets 8%; the next sale at the auction is taxed at 8% (assert the seller's money in their phone's view). This is UBER-AC-2 verbatim.
- [ ] **Step 2:** Run — Expected: PASS.
- [ ] **Step 3:** Commit `test(e2e): UBER-AC-2 election to taxed sale`.

### Task 4.3: PR-4 integration check

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm e2e` — Expected: exit 0. WS6 runs its render gate against the mock.
- [ ] **Step 2:** Open PR `ws7-pr4-desks` → `ws7-politics`; WS4 reviews the route/slot lines.

### PR-4 merge gate

- [ ] B-AC-1 and UBER-AC-2 green in a real browser, front to back
- [ ] WS6's render gate passes (every mock `data-testid` present)
- [ ] CI green; WS4/WS6 reviewed

### Gate: end of slice 1 (before the lane PR)

- [ ] WS1's sim rows on both seed sets (1-40, 101-140): row 0 equals trunk byte for byte (T-AC-4); row 1 checks identical to row 0; rows 2 and 3 checks reported. UBER-AC-1 line by line: elections in months 1/4/7/10 fill both offices in every game; the Governor sets a tax every month; the law line reads "slice 2" (UBER-AC-1's law clause is proven in slice 2).
- [ ] T-AC-4 and T-AC-7 green in WS1's C10 PR (row 0 byte-identical; observe() and cloneForSim never expose or share another seat's ballot); WS7 reviews that PR
- [ ] Money rows (2, 3) and the term score sent to Heiko through the PM; his OK recorded in SEAMS
- [ ] `pnpm typecheck && pnpm test` and CI `e2e` green on `ws7-politics`
- [ ] Spec §8 updated with any amendment made in execution

---

## Pre-implementation checklist

- [ ] Spec slice-1 design approved through the PM (sent 2026-10-22, 427dcc2)
- [ ] WS1 agreed to build C10 (2026-10-22, by message) and to the VoteHand freeze above
- [ ] Branch policy: sub-PRs → `ws7-politics` (lane may merge after clean review + green CI); `ws7-politics` → `feat/strategist` only with Heiko's OK via the PM
- [x] Base `ws7-politics` @ 8683d21 green, measured 2026-10-22: typecheck 0 (every package) · test 0: 218 green (engine 114, server 49, web 18, tabletop 17, ai 12, ui 8) · sim `--games 20 --players 4` exit 0, 7/10 checks ok (MISS: MULE p90 820, corral 22%, hungry 32%; WS1's known misses, waiting for WS5 maps). CI's e2e job not run locally.
- [ ] WS6 hub mock with politics slots: drawn at ws6-ux b28ee91 (`design/mocks/ws6-ux/src/screens/{PlanningHub,Election}.tsx`, routes #hub, #hub-nominate, #hub-council, #hub-governor, #tv-election), with Heiko for approval (blocks PR-4 only)
- [ ] No spikes in spec §7
