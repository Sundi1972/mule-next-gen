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
