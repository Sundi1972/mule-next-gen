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

## The contract (slice 4, on trunk since #662 / batch 78, e1e4794a; Heiko approved the six choices 7 Nov 12:54Z)

Files: `packages/protocol/src/index.ts` (IncidentView ~:328, MyPoliticsView.sabotage/sheriff ~:405, PoliticsView.sabotage ~:524,
ShowEventView.sabotage ~:753, intents ~:49), `packages/engine/src/types.ts:640` (SabotageTarget, SabotageOrder).
- Intents: `{type:'sabotage', target: SabotageTarget|null}` (null withdraws this month's order) · Sheriff after the
  votes: `{type:'guard', tiles:number[]}` (the whole list), `{type:'investigate', order}`, `{type:'fine', order, amount}`
  (amount = base, before the ban's multiplier).
- `SabotageTarget`: `{kind:'powerCut', tile}` | `{kind:'rumour', good, dir:'up'|'down'}`.
- `IncidentView` (public): id (opaque), month, kind, victim|null, at|null, good, dir?, worked, culprit|null (public or
  own), how: 'guard'|'caught'|'investigation'|null, investigated, fine {due, paid, toVictim, by:'sheriff'|'standard'}|null.
- `MyView.politics.sabotage` (MyPoliticsView, own phone): order (this month's pending), canOrder: true|'off'|'notPlanning', owed (crew cost at
  upkeep), mine: IncidentView & {public, outcome: 'pending'|'done'|'failed'|'caught'}.
- `MyView.politics.sheriff` (MyPoliticsView, the sitting Sheriff only): canAct: true|'off'|'notPlanning'|'votesOpen', guards (tile indices), max,
  investigationsLeft, fineable (order ids), steps (fine bases allowed), multiplier (the ban's, now).
- `MuleView.politics.sabotage` (PoliticsView, everyone): terms per kind {cost, success, detect}, incidents (public), sheriff {guards,
  investigations, investigationsLeft}. `reputationReasons[player]` gains `{kind:'caught', month}`.
- Show event: `sabotage?: {order, culprit|null, worked, guarded}`.
- Heiko's rulings: an investigation finds the culprit half the time ("Solved: it was Lena" / "The trail went cold");
  no separate sabotage switch; ids are opaque; caught costs −10 reputation, −20 more under a pact.

## Build plan (pages, in this order)

1. Hardest first, two variants: the Sheriff's desk (P7 + P8: investigate, fine, the map in Guard mode).
2. P6: Look on a rival's plot → "Sabotage this plot · Only you" → the order sheet (cost, success, detect, Order in
   secret, withdraw); the pending order and owed cost; Market's "Start a rumour".
3. P10: TV production's event show: "Caught!" (guarded / caught), "A plot went dark" (undetected), the dark plot on the
   map, the month-end line; the phones' private lines (the culprit's, the victim's, the Sheriff's).
4. P9: election day with the Sheriff row; P11: the sabotage ban in the law list and the ballot.
Real components from apps/web (hub desks, LookPanel, HoloMap flag 'sabotage', the event show) wherever they exist.

## Rulings during the build

- 8 Nov 02:53Z, Heiko via the PM: the phone hub becomes a tabbed shell (Overview, Governor, Colony, Talk; "?" explains).
  P2 keeps its components and holds their placement until WS6's shell mock (9 Nov 02:00Z). Sabotage likely starts from
  Overview's map, the Sheriff from the Governor tab.
- 8 Nov, the PM: one map, Overview's. The Sheriff's guard switches to it in Guard mode under "Guarding · back to Sheriff".
- 8 Nov, the PM: Sheriff desk **B, the case file**. A case keeps its place and only its step changes. Heiko sees it in
  the tabbed-hub card on 9 Nov (Governor › Sheriff) and may veto.
- 8 Nov, WS7 confirmed: a rumour has no victim, so its whole fine stays in the fund (S4-RULE-8; sabotage.ts::levy, S4-T-AC-5).
  The month end shows it as "Fines N" in the fund's in-column, with no "To victims" line; the ban's multiplier applies.
- Open: WS6, HoloMap `flag: 'guard'` (DS-GAP), in the shell build.

## P6 as built (8 Nov)

- Numbers from WS7's config on ws7-s4-engine 4b55602a (placeholders until WS1, HC-25): power cut 120 cr, works 60%, seen
  30%; rumour 60 cr, 80%, 15%, shift 25%; Sheriff 2 guards, 1 investigation, fines 50–300 step 50, standard fine 150
  when planning ends unfined, victim share 0.5; caught −10 reputation (−20 more under a pact), all × the ban.
- A rumour may name any of the nine goods (the engine checks GOODS). The engine refuses an order the player cannot pay
  for ("A crew costs N cr; you have M"): the build shows that refusal as today's toasts do.
- The ban's multiplier is a prop in the mock: trunk's LawId has no 'sabotageBan' yet; ws7-s4-engine adds it.

## B folded (8 Nov, WS6's finding via the PM)

Measured in WS6's hub-tabs prototype (ws6-mock-hub-tabs 83385f8d, ?beat=6-file, 667 phone): the Sheriff sub-tab is
357 × 309 px; B at 73e797fd was 651 px tall (guard box 117, fine case 195, each open case 104). Splitting guards
into their own sub-tab still leaves cases at 492 px; folding only solved or fined cases changes nothing this month
(all three live cases need action). So: every case folds to one 44 px row with its next step on a chip; a tap opens
it in place, one at a time, scrolled just into view; guards are one row. Measured at 357 wide in this mock: 294 px
folded (fits 309); fine case open 415 with its button on screen; the last case's Investigate scrolled into view.
B's rule is kept (one list, a case keeps its place, only its step changes); its first screen changes (the step's
controls are a tap away), so it went to Heiko as a change.

**APPROVED by Heiko, 8 Nov 03:57Z (board, via the PM): folded B, 651 → 294 px, one tap more per action. It replaces
the unfolded B as the approved basis.** WS6 copies it at d0a52c1a for a "Sheriff month" prototype step.
