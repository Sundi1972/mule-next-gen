# G-5 · C34 · the colony screens (WS8)

**Approved by Heiko, 4 Nov 2026: "Yes, A".** The approved scaffold is the mock as of
**06b5dc88**, with game-over direction B removed afterwards. C34's build grafts these
screens. It doesn't redesign them.

- **Game over on the TV:** direction A, "the colony's line". Today's winner and table stay as
  they are, with the colony's score as a band under them, beside who gave most. Direction B (two
  scoreboards) was not chosen and is removed from the index.
- **Reviewed by WS6** for consistency with the planning hub. WS6 approved three changes to its
  own parts:
  - "The game goes to" and "You win the game!" in every game (a named edit in
    `components/MonthEnd.tsx`; WS6 approves it on the SHA);
  - the shorter, horizontal TV winner card whenever the colony band shows;
  - the colony score card in PhoneVerdict's place on a phone with a TV. It carries a failed
    colony in alert.
- **Without politics** nothing changes (HC-22): today's air gauge, tall winner card and
  PhoneVerdict stay.

## Run it

```bash
./node_modules/.bin/vite --port 5318 --strictPort
```

Option-click selects an element for review comments; a plain click uses the prototype.

## What the build waits for

- WS7's ColonyView. The mock's types (`src/colony.ts`) are WS7's §3 draft on `ws7-g5-spec`
  (a0678be1) plus two fields WS8 proposed: `projects[].buildMonths` and `lastGauges`.
- Wave 4 of WS7's plan.
- RULE-25 (C31, WS3) for the score's terms. Every number in the mock is a fixture.

## Graft targets

| Mock | Becomes |
|---|---|
| `TvHeader` gauges | `apps/web/src/table/TableApp.tsx` TvHeader (in AirGauge's place) |
| `TvMonthEnd` build site | TableApp's TvMonthEnd, under ColonyPanel |
| `TvGameOverA` | TableApp's TvGameOver |
| `PhoneColonyDesk` | `apps/web/src/phone/hub/politics/Colony.tsx` (WS7's desk; the slot is agreed with WS7) |
| `PhoneGameOver` | `apps/web/src/phone/GameOver.tsx` |
| `parts.tsx` (ColonyGauges, BuildSite, ScoreSum, PlaqueBoard) | `apps/web/src/components/` beside MonthEnd |
| `ObjectGlyph` (DS gap) | `packages/ui` beside SpecialIcon; the package owner decides where |
