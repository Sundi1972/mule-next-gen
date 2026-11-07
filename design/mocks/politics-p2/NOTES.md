# Politics P2 mock: sabotage and the Sheriff (WS8)

Assigned by the PM, 7 Nov: WS8 drafts it within WS6's P0 frame, WS6 reviews for fit. Due to the PM by 10 Nov; then
WS8 builds it with two builders on WS3's frozen protocol. Start from WS7's slice-4 contract section (due 8 Nov 06:00Z).

## The pieces (WS7, via the PM)

| id | piece |
|---|---|
| P6 | Secret Sabotage sheet in planning: target, order (power-line cut or market rumour), cost, odds. In Talk or a new "Shadows" tab, per P0 |
| P7 | The Sheriff's desk: guard plots on the map, investigate a past incident, fine a revealed culprit |
| P8 | Guard marks on the map, seen by the Sheriff only |
| P9 | The Sheriff's office on election day |
| P10 | TV production: the "Caught!" reveal, the dark plot, a month-end line. An undetected order shows only "a plot went dark" |
| P11 | The 5th law: the sabotage ban |

## Grounding: what already exists (trunk c7f9ede4)

- Design: `docs/design/05-colony-politics.md` "The Sheriff" (guard, investigate, fine; guards hidden until they catch
  someone), `docs/design/00-concept.md:300` "Sabotage and events" (secret order in planning, carried out later;
  success chance and a separate detection chance).
- Rulebook: `colony-and-politics.html` "Sabotage and the Sheriff" (Backlog), "The Sheriff and the Land Baron".
- WS6's hub mock: `design/mocks/ws6-ux/src/screens/PlanningHub.tsx` has desks `secret` and `sheriff` and map tools
  `guard` and `target`. The live hub's `apps/web/src/phone/hub/slots.ts` names the Secret and Sheriff desks and the
  Guard and Target tools.
- `packages/ui/src/components/HoloMap.tsx` already has a plot `flag: 'sabotage'`.
- Older precedent: `design/mocks/holo-table` (PhonePlanning Sabotage panel, Council "As Sheriff", TvEvent "Sabotage!").
- The live politics phone screens: `apps/web/src/phone/hub/politics/*` (Offices, ElectionDay, Run, Reveal, LawBallot,
  LawPicker, Council, Governor).
- The event show (WS8's): `packages/ui/src/events/*`, `apps/web/src/events/*`. P10 is a new event kind on it.

## Workspace

`design/mocks/politics-p2` on branch `ws8-politics-p2-mock` (worktree `/private/tmp/claude-501/ws8-p2-mock`).
Never merged. The review loop is verified.

## The frame: P0 option A, approved by Heiko 7 Nov 11:02Z (WS6's #648, ws6-politics-frame a5bb185c)

Draw inside `design/mocks/politics-frame` (`src/slots.tsx`, `src/App.tsx`). No new tab, at most five sections per phone.
- **P6, the power-line cut:** starts from the target plot. Look on a rival's plot gains “Sabotage this plot · Only you”,
  which opens the secret order in the Look panel (power-line cut, cost, odds, “Order in secret”). One order a month. The
  TV never shows it.
- **P6, the market rumour:** “Start a rumour · Only you” under the Market desk, against a good, not a plot. It shares the
  month's one order with the cut.
- **P7, the Sheriff's desk:** like the Governor's desk, the holder's alone and first in line: investigate one case a
  month, fine a revealed culprit.
- **P8, guarding:** opening the Sheriff's desk turns the map to Guard: tap a plot to guard it this month. The marks show
  on the Sheriff's map only. Guard is a desk-only tool with no button in the tools column (WS6 builds the slot model in
  Hub).
- **P9:** election day's rows, as built (the Sheriff row comes back).
- **P10:** production's event show (WS8's visuals), the dark plot on the map, a month-end line.
- **P11:** the fifth law, the sabotage ban, in the Governor's law list and the law ballot.
