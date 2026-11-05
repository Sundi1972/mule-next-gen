# WS8 desks mock: the Colony and Council desks on the phone, and the TV's law reveal

**Status: for review (PM rules 15:00, 5 Nov 2026).** G-5 C35 and slice 2a C46. Branch `ws8-desks-mock`, cut from
`origin/ws7-politics` and fast-forwarded to `415836b2` for `setSiteBid` and `ColonyProjectView.maxBid` (#334).

Real React composing the real hub: `Hub` with `HUB_SLOTS` and WS7's politics slots, inside the app's
`ClientProvider`, `PhoneGameProvider` and `TodayState`, on a phone held sideways (844 × 390). The client is a fake
whose `intent()` runs the engine's rules on the fixture view (`src/live.tsx`), so every button really works and every
refusal arrives as the app's own toast. The TV panel uses the real `TvHeader` in TvElection's frame (1280 × 720).

## Run it

```bash
cd design/mocks/ws8-desks
./node_modules/.bin/vite --port 5318 --strictPort --host     # node_modules is a symlink to apps/web's
./node_modules/.bin/tsc --noEmit -p .
node <creating-screen-mocks>/verify-review-loop.mjs http://localhost:5318 $(pwd)
```

Open <http://localhost:5318/>: the index has the decisions, the three open questions side by side, and every page.

## Decisions

- The Colony desk is C34's `ColonyDeskCard`: each project's buttons sit in its `action` slot under the row they act on;
  "Commission a project" heads the desk, for the Governor only.
- Every refusal and disabled state uses the engine's words (RULE-21/22/23/28, RULE-41).
- A gift always shows what it does to you: "Your plaque: 70 → 170 cr · counts toward your vote weight".
- The site bid is the Governor's line under a plotless Collecting object; once set, every phone reads "Bids up to 300 cr
  at the land auction".
- The law picker replaces WS6's "This month's law" placeholder in the Governor desk, under the sales tax, and always
  ends in RULE-45's "For each player" before Propose. Pending: Change and Withdraw.
- While a proposal is pending, every phone's "This month" carries it with its cost to you; the Council desk carries the
  laws in force as chips ("Land tax 10 cr · since month 3").
- The ballot takes the hub's stage as the election does: Yes/No (the Governor's starts at Yes), who voted (never how),
  "Your vote weighs N", and the ready bar is Done, with the host's Continue and its confirm.
- The TV council panel is TvElection's frame: the ballot (proposal, each player's cost, who voted), then the reveal
  with totals only (RULE-42/47), the laws in force along its foot.
- Pay the strike is not redrawn: the approved colony-events mock, option A (`ws8-colony-events-mock` 3aaff0ac,
  `#/phone-gov-a`).

## Open questions, and WS8's picks

| question | A | B | pick |
|---|---|---|---|
| Donate | the steppers sheet (`#/donate-a`) | quick chips, "Other…" opens A (`#/donate-b`) | **B** |
| Law picker | one list, settings as chips (`#/picker-a-0`) | two steps (`#/picker-b-0`) | **A** |
| TV reveal | the weighted bar, then the stamp (`#/tv-reveal-a`) | the stamp and two big numbers (`#/tv-reveal-b`) | **A** |

Seen in the build: the phone's rail is short at 844 × 390, so picker A with three laws in force scrolls; B is shorter.
A still shows every law's state at once, which is why it stays the pick.

## GRAFT, COPY, SEAM, CONTRACT, DS-GAP

| mark | where | target / why |
|---|---|---|
| GRAFT | `src/colony-desk.tsx` (Commission, Donate A/B, SiteBid, Repair, closed line) | `apps/web/src/phone/hub/politics/Colony.tsx` (WS7) drawing C34's `ColonyDeskCard` `action` slot in `apps/web/src/components/Colony.tsx` (WS8) |
| GRAFT | `src/law-desk.tsx` LawDesk, PickerA/B, ForEachPlayer | `apps/web/src/phone/hub/politics/Governor.tsx` (WS7) |
| GRAFT | `src/law-desk.tsx` CouncilDeskC46, LawsInForce | `apps/web/src/phone/hub/politics/Council.tsx` (WS7) |
| GRAFT | `src/law-desk.tsx` LAW_AGENDA, COUNCIL_STAGE, councilNow, councilReadyWords; `src/slots.ts` | `apps/web/src/phone/hub/politics/slots.ts` and `today.tsx` (WS7) |
| GRAFT | `src/tv.tsx` TvCouncil | a TV council panel beside `apps/web/src/table/TvElection.tsx` (WS7) |
| GRAFT | `src/words.ts` | `apps/web/src/phone/hub/politics/words.ts` (WS7) |
| COPY | `src/borrowed/ready.ts`, served in place of `apps/web/src/phone/hub/ready.ts` by `vite.config.ts`'s `readySeam` | the real file treats an open law ballot as planning proper, so Ready would read "Planning has no clock…" and the host could not continue the ballot |
| SEAM | the two marked lines in `src/borrowed/ready.ts` | WS7: `planningProper` and `hostMayContinue` must treat `council` (stage ballot/reveal) as they treat the election (C40's `votesOpen`) |
| COPY | `PhoneFrame`, `TvFrame` in `src/live.tsx` | land-auction mock's frames; harness only |
| CONTRACT | `src/fixture.ts` FACTS, `words.ts` impactOf | the view carries the impact of the **pending** proposal only; the picker's preview before Propose needs every law × setting's impact in the view (or a dry-run). The mock computes RULE-45 locally |
| CONTRACT | `src/live.tsx` REF | the donate preview values goods at reference price; the view carries none today |
| DS-GAP | `Chip` in `src/colony-desk.tsx` | `@mule/ui` has no chip or segmented control; drawn in the hub's tab/tool tokens |

Nothing else needed copying: the hub, the desks, ColonyDeskCard, ObjectGlyph (`@mule/ui`), GovernorDesk, CouncilDesk,
Toasts and TvHeader all mount as they are.

The vite config is the precedent's (`ws8-colony`) plus two plugins: `readySeam` (above) and `unstampFragments`
(sourceStamp stamps a named `<Fragment>`, which React warns about; Offices.tsx has one).

## Findings for the owners

- **Engine copy:** RULE-22 row 5 reads "The colony already has a Observatory" (no "an"). The mock shows the engine's
  words as they are.
- **Engine vs spec:** RULE-41 row 12 says "Three laws are in force…"; the engine says "3 laws are in force…". The mock
  uses the engine's.
- The brief's example prices ("Park: 600 cr") are replaced by the engine's PRESTIGE (Park 420 cr and 2 Alloy).

## Fixture

Five seats: Lena (host, Governor), Ossa (AI, Land Baron), Kai, Brix (AI), Pip. Vote weights 2, 3, 2, 2, 1. Every
number is a fixture.
