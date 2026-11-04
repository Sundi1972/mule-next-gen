# The UX audit's approved changes: the build split, by owner

2026-10-29, WS6, for the PM's owner ruling. Heiko approved every audit change ("all ux audit changed are apprvoed")
and the seven questions ("Yes, all as recommended"). The binding design is the audit mocks on ws6-ux
(`design/mocks/ws6-ux/src/screens/audit/`, served on :5316; the hub, the goods auction, month end), read with
Heiko's answers. Grounded on ws6-ux 077c54bc, which contains trunk 6d30b699. Each file's owner is checked against
SEAMS.md (main checkout; `S<n>` is a line of its table, `R<n>` a line of its ruling log) and the file's git
origin. Spot-checked by WS6: `Offices.tsx:13` ("NEXT ELECTION M"), `config.ts:675` (`WALK.statusMs` 8 s),
`config.ts:771` (`PHASES.upkeepMs` 8 s), `observe.ts:23` (others' hunger already public to the AI), and
`protocol/src/index.ts:84` (`PlayerView.condition`).

**Left out:** Q5 (#152), #129 (the Talk desk P0), #139, #152, #155, the election (WS7's PR-3), and development
(below: it lands in the arcade build).

## One finding first: Q6 is not a rule change

Hunger and sickness are already public: `PlayerView.condition` (`packages/protocol/src/index.ts:84`, "Public: every
screen shows it", Heiko's variant B, AM-14), and the AI already sees them (`packages/engine/src/observe.ts:23`,
"their hunger and sickness are public, Heiko's ruling"). The field is null outside development, so month end cannot
show it. Q6 is therefore a **view change** (keep the month's condition, or the month's food share, in the view at
upkeep), and **needs no sim**: no AI input changes, and no AI code reads others' hunger today.

## The proposed PRs

| # | Owner | Changes | Mock routes | Files (owner; own or named edit) | WS1's sim first? |
|---|-------|---------|-------------|----------------------------------|------------------|
| A-1 | **WS3** | **Q3** month 1's development clock waits for every first MULE; the host's Continue; an away seat counts as in (arcade AM-6: on today's walk, now) | #audit-dev-first-month | `apps/server/src/mule-game.ts` (WS3, S12) clock and checkDevelopmentOver; `packages/engine/src/config.ts` `DEV_WALK.month1WaitsForFirstMule` (the DEV_WALK block, WS1's, R363: **named edit**, WS1 reviews); `apps/web/src/phone/hub/ready.ts::hostMayContinue` (WS6's, R505: **named edit**, WS6 reviews); the TV's first-month list in `apps/web/src/table/TableApp.tsx` (WS4, S23: **named edit**) | **Yes**: month 1's development time on today's walk, AI-only and with one idle human plus the host's Continue |
| A-2 | **WS6** | **The hub:** H-1 roadmap, H-2 needs strip, H-3 drone words, H-4 standings (sheet and the TV's rank), H-6 the hub's own plain words, H-7 the Now card folds | #audit-hub, #audit-hub-drone, #audit-hub-standings | own: `apps/web/src/phone/hub/{Hub.tsx, slots.ts, today.tsx, tools.tsx, needs.ts, desks.tsx, ready.ts}` (R235, R505, git 5bd0ab34), `e2e/hub-steps.ts` (R649, git aea169a0), `test/hub-*.test.ts`; **named edits**: `phone/Shell.tsx` header (the rank under the money; WS4, S23), `table/TableApp.tsx` ready list (the rank; WS4), `phone/LandGrant.tsx` ("Your drone: …"; WS3, S12) | No |
| A-3 | **WS7** | **The politics parts of the hub:** H-5 the colony fund card first, H-6 the offices' plain words ("Next election: month 4", "Governor: Leo, until month 3"), H-1's offices line folded into the roadmap | #audit-hub | own: `phone/hub/politics/{Offices.tsx, Colony.tsx, words.ts}` (R277, git 408e9143, 7843c74a), `test/politics-desks.test.ts` | No |
| A-4 | **WS3** | **The auction's words, no rule:** G-2 "Hold" said once (the label; the one-tap step is in A-6), G-3 the hint names the line, G-4 prices from your side and the lines explained on the phone, G-6 the ship on the board and "wants N", G-8 plain words | #audit-auction-walk, -store-line, -ship, -status | own: `phone/Auction.tsx`, `components/AuctionParts.tsx` (S12, git 9f5819b8); **named edits**: `packages/ui/src/components/WalkBoard.tsx` caption (WS4, S13; the R55 precedent), the TV's line words in `table/TableApp.tsx` (WS4) | No |
| A-5 | **WS3** | **G-5 / Q1 the receipt:** a 2.5 s close stage after each good, "Food: you bought 5 for 150 cr" with the tax line, the month's total in the header | #audit-auction-receipt | own: `packages/engine/src/auction.ts::stepAuction`, `types.ts` (S12), `WALK.closeMs` (the WALK block, S17), `protocol` AuctionView stage and receipt, `mule-game.ts::scheduleAuctionTick` (S12), `Auction.tsx`; **named edits**: `phone/Shell.tsx` header total (WS4), the TV (WS4), `ai/src/hands/auction.ts`, `ai/src/play.ts` (WS1, S10) | **Yes**: game and real time, up to 9 × 2.5 s a month (`play.ts:331` counts `auction.ms`); no money |
| A-6 | **WS3** | **G-1** choose how many at a store's line, letting go stops; **G-2's one-tap step** | #audit-auction-store-line | own: `packages/engine/src/walk.ts::stepBoard` (S12, git 5d94c76f), a new intent in `protocol` and `mule-game.ts::handle`, `Auction.tsx`; `useWalkIntent.ts` (owner unclear, below); **named edits**: `ai/src/hands/auction.ts`, `play.ts::applyAction`, `actions.ts` (WS1, S10), `e2e/auction-steps.ts` (WS3's, R51) | **Yes**: money and stock (the AI relies on standing at the line, `walk.ts:144`) |
| A-7 | **WS3** | **G-7** the side-pick waits for everyone; the host moves on for someone away | #audit-auction-status | own: `engine/auction.ts`, `WALK.statusMs` → none (S17), `mule-game.ts::continuePlanning/checkAllReady`, `Auction.tsx`; **named edits**: the TV (WS4), `phone/hub/ready.ts` Continue words (WS6), tests that wait on the 8 s: `mule-game.test.ts:173` (WS3), `auction-steps.ts:627` (WS3), `politics.ts:225-237` (WS7), `chat.ts:62` (WS6) | **Liveness only**: the AIs press Done (`hands/auction.ts:92`); WS1 checks no seat can hold the table (the `play.ts:324` guard) and WS2's decider timing (`hands/auction.ts:81`) |
| A-8 | **WS4** (R557) | **Month end:** the league table (lead line, change since last month, your own lines, the colony panel, credits at game over); **Q4** it holds until everyone taps "On to month N", the host's Continue; **Q6** who went hungry; **Q7** Collapse: Worth against last month, your own line naming the cut | #monthend, -phone-only, -hungry, -collapse, -gameover | own: `phone/Results.tsx`, `table/TableApp.tsx::MonthEnd`, `phone/GameOver.tsx` (S13, git b29cd15c; "points" at `GameOver.tsx:69`), `worth-*.test.ts`; **named edits in WS3's files** (R557): `protocol` (`lastWorth`, the month's condition at upkeep for Q6, last month's air, fund in and out by source), `mule-game.ts::viewFor` and `checkAllReady`/`continuePlanning` for Q4; `PHASES.upkeepMs` → none (owner unclear, below); `phone/hub/ready.ts::hostMayContinue` (WS6, **named edit**); e2e waiting on the 8 s: `smoke.ts:160` (WS4), `auction-steps.ts:163, :781` (WS3) | Q4: **real time only**, no game time (the engine has no upkeep clock; `play.ts` does not model it). Q6, Q7: no |
| — | arcade | **Development** V-2 (your plots and what each suits), V-3 (analyse in words), V-5 (the filter's Alloy hint), V-6 and V-7 (your pace and why; never send you where you can't go); **V-4 → Q2**; **V-8 → Q3** | #audit-dev-* | V-4 is arcade AM-2 (PR-7, PR-8); V-8 is A-1. The rest land in the arcade screens (C11, PR-6), since Develop.tsx retires at C14 | see the decision below |

## Order and contention

- **Hub.tsx, slots.ts, today.tsx, ready.ts:** A-2 and WS7's election PR-3 (its named edits there, R756), and
  ready.ts also in A-1, A-7, A-8. **Serialised:** WS7's PR-3 first (Heiko approved the election mock), then A-2;
  A-1, A-7 and A-8 each take ready.ts as a WS6-reviewed named edit, one at a time.
- **Offices.tsx:** A-2 (the roadmap reads the offices line) and A-3. **Seam:** A-3 owns the words; A-2 reads
  `Offices`' line as a slot and moves it, with no edit to Offices.tsx.
- **phone/Shell.tsx header:** A-2 (rank) and A-5 (month total). **Serialised**, both WS4-reviewed named edits.
- **table/TableApp.tsx:** A-1, A-2, A-4, A-5, A-7, A-8. **Serialised**, WS4 reviewing each.
- **phone/Auction.tsx, AuctionParts.tsx, protocol, mule-game.ts, engine/auction.ts, walk.ts:** A-4 to A-7, all
  WS3's: one owner, so WS3 sequences them; A-4 first (words only, no rule), then A-5, A-7, A-6 as the sims clear.
- **protocol and mule-game.ts:** A-8's named edits beside A-5 and A-7: **serialised** with WS3.
- **config.ts:** WALK (A-5, A-7; WS3's block), PHASES (A-8), DEV_WALK (A-1). Disjoint blocks; one line each.
- **ai hands/auction.ts, play.ts (WS1):** A-5, A-6, A-7: WS1 reviews each named edit; one at a time.
- **e2e:** `auction-steps.ts` (A-4 to A-8), `smoke.ts` (A-8, A-5), `politics.ts` and `chat.ts` (A-7).

## Owners to rule (SEAMS and git disagree, or neither says)

1. **`apps/web/src/phone/useWalkIntent.ts`** (A-6): SEAMS S13 gives it to WS4 (apps/web except WS3's files; not
   in S12's list). Git: WS3 (f007f975, "sync ws3-fu1 with the WS3 lane"). WS6 suggests WS3, its only user.
2. **`config.ts` PHASES** (A-8, `upkeepMs`): S17 says WS1 ("everything else balance"); R599 calls PHASES a WS3 block
   and git agrees (c7ee48f16, #107 ws3-config-phases). WS6 suggests WS3.
3. **`phone/hub/{desks,tools,today,needs,slots,state}`**: R235 ("WS6 frame + today's parts") and git (5bd0ab34) say
   WS6; R505 names only Hub.tsx, ready.ts and ReadyBar.tsx as WS6's, against the split-file default (they were split
   from WS3's Planning.tsx). WS6 suggests WS6, as R235 and git say; A-2 assumes it.
4. **`e2e/hub-steps.ts`**: S13 makes e2e WS4's by default, R759's carve-outs don't list it; R505 gives WS6 "its
   step", R649 says "hub-steps.ts, WS6's"; git says WS6 (aea169a0). WS6 suggests WS6.
5. **Who builds month end:** R557 says WS4 (screens) with named edits in WS3's protocol and server; the audit §9 and
   the mock's header say "WS3 adds each of those to the view". A-8 follows R557.
6. **The colony panel's fund in and out by source** (A-8) overlaps WS7's slice-2a UBER-AC-10 (tax income by source
   in reports, R490): one producer for that field. WS6 suggests WS7's slice-2a produces it, and A-8 draws it.

## A decision for the PM: development's audit items

Heiko approved both the arcade mock (the binding development design) and the development audit mocks
(`#audit-dev-*`, drawn on today's tap-to-walk screen). V-1 and V-8 are superseded or placed (V-1 by the arcade, V-8
as A-1); V-4 is arcade AM-2. V-2, V-3, V-5, V-6 and V-7 still mean something on the arcade screen, but neither mock
draws them there.
- **A. Add them to the arcade mock first** (WS6, a mock addendum), then PR-6 builds them. The arcade screen stays
  one design. Costs a mock round before PR-6.
- **B. Build them on today's Develop.tsx now.** They reach players sooner, but Develop.tsx retires at C14, so the
  work is thrown away.
- **WS6 recommends A**, because B builds on a screen already ruled for removal.

## WS1's sim, first

| Change | What to measure | Why |
|---|---|---|
| A-1 (Q3) | month 1's development time, median and max over 40 games, AI-only and with one idle human plus the host's Continue | adds development time in month 1 |
| A-5 (G-5, Q1) | game time per month with 9 × 2.5 s close stages | adds game time per good |
| A-6 (G-1) | money and stock per seat when the AI chooses an amount at the line and letting go stops | changes trades |
| A-7 (G-7) | liveness: no seat can hold the table; WS2's decider timing | removes the side-pick clock |
| Arcade AM-2 (Q2) | in the arcade plan (PR-8) | — |

Not needed: Q4 (real time only), Q6 (no AI input changes), Q7 (display only).

## Ruled (the PM, 2026-10-29)

- **Owners:** useWalkIntent.ts WS3 (born in f007f975); PHASES WS3 (R599, git); `phone/hub/{desks,tools,today,
  needs,slots,state}` WS6 (R235; R505 did not narrow it); `e2e/hub-steps.ts` WS6 (R649, git); month end WS4 builds
  (R557), WS3 reviewing its named edits in protocol and mule-game.ts; fund in and out by source produced once by
  WS7 (slice 2a, R490), drawn by A-8.
- **Development:** (A). V-2, V-3, V-5, V-6 and V-7 are drawn in the arcade mock first and PR-6 builds them; nothing
  new on Develop.tsx.
- **Q6:** a view change, no sim.
- **Order:** A-4 and A-3 now; A-1, A-5, A-6, A-7 after WS1's sims (A-1's is done, with WS1's fix: a seat counts as in
  once it owns no plot or has ended its turn); A-2 after WS7's PR-3; A-8 when WS4 is free. The PM routes each PR.
