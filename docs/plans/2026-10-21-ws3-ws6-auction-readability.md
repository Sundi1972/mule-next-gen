# Plan · WS3's part of WS6 wave A: the auction, readable at a glance

**Spec:** `docs/specs/2026-10-21-ws6-ux.md` (WS6's, on `ws6-ux`; approved). **Mocks (binding):** `design/mocks/ws6-ux/` at **1b69e37**. Heiko approved them at ee661f1; 1a78095 (an animation per event kind) and 1b69e37 (AM-1, "Game picks your side") apply his later rulings (PM, 2026-10-21).
**Owner:** WS3 for C1, C2, C3 and C5 in this plan, and C4 in the next. C1's edit is in WS4's `packages/ui`, and C3's TV half is in WS4's `TableApp.tsx`: both are named edits WS4 reviews.
**Class:** Standard. Two PRs: WS6-PR-1 (this plan, wave A without C4) and WS6-PR-2 (C4, its own plan once this one merges).

## Inputs
- **Spec sections present:** §0 (G-1, UBER-AC-1), §0.2 (HC-1…HC-7), §1 C1–C5 (wave A), §2 RULE-1, RULE-2, §6 B-AC-1…5, T-AC-1, T-AC-2, T-AC-8.
- **Not this plan:**
  - C4 and RULE-2 (B-AC-4, T-AC-3): WS6-PR-2.
  - C6–C14 (waves B and C): WS6's, WS1's and WS4's, plus later WS3 work the PM will assign.

<!-- plan-check: no-task C4 — WS6-PR-2, its own plan after this one merges -->
<!-- plan-check: no-task C6 C7 C8 C9 C10 C11 C12 C13 C14 — waves B/C, other lanes or later WS3 work -->
<!-- plan-check: no-task B-AC-4 T-AC-3 — C4's ACs, proved in WS6-PR-2 -->
<!-- plan-check: no-task B-AC-6 B-AC-7 B-AC-8 B-AC-9 B-AC-10 B-AC-11 T-AC-4 T-AC-5 T-AC-6 T-AC-7 — waves B/C, not WS3's wave A -->

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value | Proof | First delivered in |
|---|---|---|---|---|
| G-1 (WS6) | every player at the table and the TV room | the two lines closing in are back; decisions come faster | UBER-AC-1: the lines, units and stock half here; the "no declare stage" half in WS6-PR-2 | WS6-PR-1 (lines, units, stock), WS6-PR-2 (sides on status) |

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:** the original's art, layout, names or trade dress; the event engine; R1's numbers; the assay and land office booths; a joystick; an always-visible colony bar; sound for the show.

**Thin baseline:** none of spec §0.1's thin path is in this PR. This PR is already the shortest slice that delivers the lines (G-1's visible half) on both auctions and both screens.

## Constraints that ship with every task
HC-1 (concepts, not copies) · HC-2 (the TV shows no holdings except the goods auction's status table; C2's units are covered by that exemption, spec C2) · HC-4 (the engine stays pure) · HC-5 (build from the mock, keep its data-testids). Also this repo's CLAUDE.md: numbers in config.ts, `pnpm typecheck && pnpm test` before pushing.

## PR decomposition

**Feature branch:** `ws3-auctions`. **Sub-branch:** `ws3-ws6a`.

| PR | Sub-branch | Scope | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|---|---|---|---|---|---|---|
| WS6-PR-1 | `ws3-ws6a` | Tasks A.1–A.5 (C1, C2, C3, C5) | B-AC-1, B-AC-2, B-AC-3, B-AC-5, T-AC-1, T-AC-2, T-AC-8 | `WalkBoard` props `marks`, `units`/`surplus`, `storeStock`; `bestPrices`; `WalkerView.units` | `MuleView.market` (stock), the status rows' need | Yes |

### Per-PR authority (WS6-PR-1)
> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

- `may_edit`:
  - `packages/protocol/src/index.ts` (`WalkerView.units`)
  - `apps/server/src/mule-game.ts`, `apps/server/src/land-auction.ts`
  - `apps/server/test/auction-units.test.ts` (new)
  - `apps/web/test/best-prices.test.ts` (new; T-AC-1's unit test, importing `bestPrices` from `@mule/ui`, because `packages/ui` has no test runner: its `test` script is `echo 'no tests'`)
  - `apps/web/src/components/AuctionParts.tsx`
  - `apps/web/e2e/auction-steps.ts`
- `may_edit_content`, grafted from the mocks at 1b69e37 (data flow only; keep the composition, tokens and every `data-testid`):
  - `apps/web/src/phone/Auction.tsx`, from `src/screens/GoodsAuction.tsx`
  - `apps/web/src/phone/LandAuction.tsx` and `apps/web/src/table/TvLandAuction.tsx`, from `src/screens/LandLine.tsx`
- **Named edits in other lanes' files, which WS4 reviews:**
  - `packages/ui/src/components/WalkBoard.tsx`: C1, grafted from `src/proposed/WalkBoard.tsx`; every addition is marked `WS6:` in the mock;
  - `apps/web/src/table/TableApp.tsx::TvAuction`: C3's TV half, from `GoodsAuction.tsx::TvGoodsWalk`.
- `must_not_edit`: `packages/engine/**`, since nothing in wave A changes a rule (C4 does, in WS6-PR-2) · `packages/ai/**` · WS4's `apps/web/e2e/{smoke,harness}.ts` · `design/mocks/**`.

### Contention

| path | touched by | resolution |
|---|---|---|
| `packages/ui/src/components/WalkBoard.tsx` | A.1; WS4's own PRs | **serialised**: A.1 is reviewed by WS4 and rebased onto ws4's latest WalkBoard (PR-2c's insets) before it starts |
| `apps/web/e2e/auction-steps.ts` | A.5; PR-3 (land plan, +100 lines for the colony lot) | **serialised**: the e2e changes are all in A.5, after A.3 and A.4, and after ws3-ws6a has merged the lane with PR-3 (found in execution) |
| `apps/web/src/phone/LandAuction.tsx`, `apps/web/src/table/TvLandAuction.tsx`, `apps/web/src/components/AuctionParts.tsx` | A.3/A.4; PR-3 (COLONY_SELLER, a few lines) | small merge; it auto-merged when ws3-ws6a took the lane (found in execution) |
| `apps/web/src/components/AuctionParts.tsx` | A.3 (`boardWalkers`), A.4 (none expected) | **same task** if A.4 needs it |

### Waves
- **Wave 1:** A.1 (C1, the board) and A.2 (C2, the contract) in parallel. Their files are disjoint, and A.2's `units` field is optional to every reader.
- **Wave 2:** A.3 (goods screens) and A.4 (land line) in parallel, both after A.1. A.3 also needs A.2. Their screen files are disjoint, and both consume the frozen board props.
- **Wave 3:** A.5 (e2e + render gate) after every branch is merged into `ws3-ws6a`.
- **Status (2026-10-22):** A.1–A.4 COMPLETE and merged into ws3-ws6a, each reviewed (A.1 and A.2 after one fix round). A.1 also gained WS4's floor-inset condition: the units label clears the names strip (measured 4 px phone, 2 px TV). WS4 has approved both named edits (WalkBoard, TvAuction). ws3-ws6a has merged the lane and feat/strategist 8683d21. A.5 COMPLETE: reviewed, two fix rounds, then a scoped re-review READY. The render gate's scoped run passes 16/16; the literal run has 0 DIFFERS, and its findings are only trunk testids the mock omits. Lead rulings: on an exact tie the first walker keeps the line; zero surplus reads "3 (0)"; the land line stays on the result screen at the winning bid.
- No migration slot: no state or storage changes.

## Tasks

### Task A.1 — C1: the walk board draws the two lines, units under creatures, and the store's stock
**Depends on:** — · **ACs verified:** T-AC-1 (unit), B-AC-1/2/3/5 (render, via A.5) · **Spec:** §1 C1, §2 RULE-1
- [x] **Step 1: Write the failing test `T-AC-1: bestPrices returns the lowest seller with units and the highest buyer`**, covering each RULE-1 example and the unknown-units row. Altitude: unit (pure function). Trap: sellers with 0 units don't count; units absent means "has units".
- [x] **Step 2: Implement C1 per spec §1 C1 and §2 RULE-1.** Graft `design/mocks/ws6-ux/src/proposed/WalkBoard.tsx` at 1b69e37: diff it against the package file and take every `WS6:` hunk. Props are optional, and callers that pass none render exactly as today (the pin). Mechanism: in_place.
- [x] **Step 3: Run** `pnpm --filter @mule/ui typecheck` and the existing web/e2e suites. Expected: green, with today's callers unchanged.
- [x] **Step 4: Commit** `feat(ui): the walk board draws the two moving lines, units and the store's stock (verifies T-AC-1)`. WS4 reviews this diff before A.3/A.4 merge.

### Task A.2 — C2: walkers carry their units
**Depends on:** — · **ACs verified:** T-AC-2 · **Spec:** §1 C2
- [x] **Step 1: Write the failing server test `T-AC-2: the auction view's walkers carry units equal to the engine's stock after every traded unit`** in `apps/server/test/auction-units.test.ts`. Altitude: promise, at `viewFor`, in both a player's view and the board view (HC-2's exemption: units are public for the good that's up).
- [x] **Step 2: Implement C2:** `WalkerView.units` in the protocol, filled from `state.players[].stock[good]` where the server builds the auction's walkers. Mechanism: in_place.
- [x] **Step 3: Commit** `feat(server): auction walkers carry their units (verifies T-AC-2)`.

### Task A.3 — C3: the goods auction screens use the lines, units and stock
**Depends on:** A.1, A.2 · **ACs verified:** B-AC-1, B-AC-2, B-AC-3 (UI half, via A.5) · **Spec:** §1 C3
- [x] **Step 1: Implement C3 by grafting `design/mocks/ws6-ux/src/screens/GoodsAuction.tsx` (PhoneGoodsWalk, TvGoodsWalk, LineReadout) at 1b69e37** into `apps/web/src/phone/Auction.tsx` and, as a named edit, `TableApp.tsx::TvAuction`. Both pass `marks {ask: true, bid: true}`, units and surplus (via `AuctionParts::boardWalkers`), and `storeStock` from `view.auction.storeForSale` (PM ruling, 2026-10-22: a new view field, the engine's storeForSale, so Food and Water exclude the colonists' reserve; `view.market` keeps the real stock for the other panels; WS6 amends C3 and B-AC-3). The rail and TV panel add the words readout from `bestPrices`. Replace the mock's `SMITHORE_*` fixtures with the live view. Mechanism: fill_scaffold.
  Plan-drift correction: spec C3 says the phone rail drops a "STORE HAS" line, but today's Auction.tsx has none (grep for "store has" in apps/web/src finds nothing, 2026-10-21). There's nothing to drop; the stock appears on the board only (C1's `storeStock`), as the mock shows.
- [x] **Step 2: Run** `pnpm --filter @mule/web typecheck`, `test` and `build`. Expected: green.
- [x] **Step 3: Commit** `feat(web): the goods auction shows the two lines, everyone's units and the store's stock`.

### Task A.4 — C5: the land auction draws the highest-bid line
**Depends on:** A.1 · **ACs verified:** B-AC-5 (via A.5) · **Spec:** §1 C5
- [x] **Step 1: Implement C5.** In `LandAuction.tsx` and `TvLandAuction.tsx`, pass `marks {ask: false, bid: true}` to the board, per `design/mocks/ws6-ux/src/screens/LandLine.tsx` (#land-under, #land-walk, #land-lead). Nothing else changes.
- [x] **Step 2: Commit** `feat(web): the land auction draws the highest-bid line`.

### Task A.5 — e2e and render gate
**Depends on:** A.3, A.4 merged into `ws3-ws6a` · **ACs verified:** B-AC-1, B-AC-2, B-AC-3, B-AC-5 (browser), T-AC-8
- [x] **Step 1:** In `apps/web/e2e/auction-steps.ts`'s direct run:
  - **Month 1's goods auction:** assert `line-ask`/`line-bid` and `gap-label` on a phone and the TV during a walk and absent during a trade (B-AC-1), `units-<id>` under creatures (B-AC-2), and `limit-sells` with stock (B-AC-3; SOLD OUT if the run reaches it).
  - **Land lot:** one `line-bid` and no `line-ask` (B-AC-5).
  - Altitude: promise, in a real browser against the real server.
- [x] **Step 2: The render gate (T-AC-8):** capture the mock's #walk, #auction-start/mid/trade/soldout, #land-under/walk/lead and the built states; `render-gate.mjs` PASS (rename the `result` key as PR-1's gate did).
- [x] **Step 3: Commit** `test(web): the auction lines, units and stock front to back (verifies B-AC-1, B-AC-2, B-AC-3, B-AC-5)`.

### WS6-PR-1 merge gate
- [ ] B-AC-1/2/3/5, T-AC-1 and T-AC-2 are green and AC-named; tests precede the implementation
- [ ] Front to back: A.5 drives the change in a real browser and asserts the server's view (units after trades)
- [x] WS4 has reviewed the WalkBoard and TvAuction named edits
- [ ] The render gate passes against the mocks at 1b69e37
- [ ] `pnpm typecheck` · `pnpm test` · `pnpm e2e` · `tsx e2e/auction-steps.ts` green; the sim is unchanged (no rule changes)
- [ ] Goal check in a browser: a person reads the two lines closing in and sees a trade where they meet
- [ ] The PM has the PR link and results; Heiko's OK before the lane merges into feat/strategist

## Risks
- **The board edit collides with WS4's own WalkBoard work** (PR-2c's insets landed in #26). Mitigation: A.1 starts from the trunk's WalkBoard, and WS4 reviews it.
- **HC-2 on the TV:** units under creatures on the TV rely on spec C2's exemption. A.5 checks that the board view carries units only for the good that's up.
- **FM-A5-1, found in execution: the TV's side column overflowed** once the readout was added. With the ship in port and two or more deals, the ROOM line was pushed off the 720 px canvas. Resolution, approved by WS4 in TvAuction:
  - the help text hides while deals run;
  - the deals list gives way, hiding whole one-line rows, never half a row, with no cap;
  - the newest deal stays on top in a stable order, through a pure `AuctionParts::newestFirst`.
  Proved by `apps/web/test/deals-order.test.ts` (FM-A5-1) and measured at 1280×720: the ROOM line holds at 668–688 px with 0 to 3 deals. With 16-character names only the newest deal row shows, because the readout wraps and WS4 rules that the readout and store never shrink; the board still shows every deal.
- **Found in execution: the phone's picker hid the readout** at 844×390. The trunk's Buyer/Seller/Pass picker, which the mock lacks, now sits after the readout. Until C4 removes it from the walk, it is mostly below the fold. When C4 removes it, WS4's FM-2 smoke must change too, because it clicks "Buyer" during the walk.
- **Not on CI:** `tsx e2e/auction-steps.ts`, which carries B-AC-1/2/3/5, UBER-AC-1 and B-AC-8, runs only by hand. CI runs only smoke.ts. Raised with the PM, who decides whether to add it as a CI step.
