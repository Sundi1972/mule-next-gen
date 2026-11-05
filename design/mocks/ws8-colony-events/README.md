# WS8 mock: the colony's mood events in the event show (G-5 C26–C28, C37)

**Status: APPROVED at c0e2fae3 (PM, design authority, 5 Nov 2026), option A**: the Governor's strike card sits in the phone's Now slot. It keeps the map in view, uses the Now pattern Heiko already plays, and has no "Later" escape that lets the decision drift past the votes. Option B (the sheet) is not chosen. This is the binding scaffold for WS8's colony-event visuals. WS6 checks hub consistency on the build PR.

It is real React that composes the real event-show parts (`EventShow`, `EventLivingMap`, `EventTvLog`,
`EventSoloRail`, `ProductionMap` and its timeline), C34's `ColonyGauges` and `BuildSite`, the phone's `NowCard`
and `@mule/ui`'s `Button`. It is typechecked against them. It is built on WS1's frozen C26 contract (catalogue rev 22, G-5 spec
C26/RULE-26 at f06477b9).

## Run it

```bash
cd design/mocks/ws8-colony-events
./node_modules/.bin/vite --port 5318 --strictPort      # http://localhost:5318/
./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

The `node_modules` folder is a symlink to `apps/web`'s. Never install anything here. Every show page has controls for play, pause, scrub (with its key moments marked), speed and
reduced motion. ⌥-click selects an element for review.

## Decisions

- Each event plays in the show of the phase that rolled it (`MonthEvent.phase`):
  - planning: festival, generalStrike, emigrationWave, blamedForUnrest;
  - development: storeStrike;
  - production: walkout, loyalCrew;
  - upkeep: riot, volunteerCleanup.
- The strike is a state. `ColonyView.strike` drives the TV header's badge ("STRIKE · Food 20%", or "PAID · −240 cr")
  and the Governor's card. Only two things are events: the planning announcement and, if the strike is unpaid at production, production's own `generalStrike`.
- **Paid means no event and no story.** When the strike is paid, the badge turns PAID, the strikers go, the Wealth gauge's fund note drops, and one news line
  says "Kai pays the Food strikers 240 cr". There is no ledger animation.
- In planning, the strikers stand on every plot of the struck good, so the map shows the cost before anyone decides. In
  production, an unpaid strike plays like a walkout: the strikers are already on the plots, the bars drop to 20%, and each plot's chip says "STRIKE −80%".
- The gauge landing: a gauge change (mood, prestige, air) leaves the event's card as a chip, flies to its gauge in the
  header and lands there, and then the gauge's number counts up or down. If the band changes, it flips with a pulse as the count crosses the threshold.
- The riot reuses the store fire's shelf box, calmly and without the fire: a third of each shelf goes. A damaged object always shows on the
  build-site row and on the Prestige gauge. If it has a plot (the park), it also gets the map's HIT mark. The hospital has no plot.
- The month end's mood drift is not an event. Only the Happiness gauge moves, from `lastGauges.happiness` to
  `gauges.happiness` (44 → 31, Restless → Unhappy). No reasons are shown, because the wire has none.
- The Governor decides after the votes (payStrike's rule). Until then both choices show but are disabled, with an "After the votes" label.
- **Open question: the Governor's card.** It is drawn two ways, and the index shows them side by side:
  - A: in the hub's Now slot;
  - B: as a sheet over the hub, with one big tile per choice.

## Pages

| Section | Page | Phase |
|---|---|---|
| 1 | `#/tv-strike`: announcement, waiting for Kai | Planning, TV |
| 2 | `#/phone-gov-a`, `#/phone-gov-b`, `#/phone-other` | Planning, phones |
| 3 | `#/tv-strike-paid`, `#/tv-strike-unpaid` | Planning, TV |
| 4 | `#/tv-production-unpaid`, `#/tv-production-paid` | Production, TV |
| 5 | `#/tv-festival` (64 → 74), `#/tv-festival-flip` (72 → 82, Content → Thriving), `#/phone-festival` | Planning, TV and phone alone |
| 6 | `#/tv-riot-park`, `#/tv-riot-hospital` | Month end (upkeep), TV |
| 7 | `#/tv-mood-fall` | Month end, TV |
| 8 | `#/gallery`: emigration, clean-up, store strike, walkout, loyal crew, blamed | Each row's own phase |

## What is a fixture, and what the build widens

The contract's shapes are not fixtures; they are C26's. What remains:

- **Fixtures:** the map, who owns what, each plot's output, the fund (2,340 cr), the strike's cost (240 cr), the
  objects' prestige (from config.ts), the store's stock before the riot, and the head count.
- **Casts until the UI widens:**
  - `forShow()` in `src/fixture.ts` is the one place a C26 key meets today's `ShowEventKey` union. In the build, the union takes the nine keys.
  - `ShowEffect.what` gains `mood | prestige | air | reputation`.
  - `ShowEventView` gains `objects`.
- **Copy (copy.ts):** `effectWords` has no words for the four new `what`s, so they would print "undefined".
  - To prevent that, the mock gives the real log and the phone cards only the effects they can word, and draws the rest with its own chips (`c26Words`).
  - In the build, `effectWords` gains the four, and `ALL` gains lines for the colony events. Today a phone alone reads the festival as
    "Not you: Store +6 Food.", visible on `#/phone-festival`.
- **Glyphs (glyphs.tsx):** the nine keys have no glyph or accent yet, so their badges are today's plain-disc fallback. This is a
  DS-GAP.
- **Brief vs bands:** the brief's phone line "74, Thriving" conflicts with the engine's bands (Thriving starts at 80). The
  mock says "74, Content" and uses 72 → 82 to show the flip.

## Graft targets

- The stories (`src/stories.tsx`: `GeneralStrike`, `Festival`, `Riot`) go to
  `packages/ui/src/events/stories-colony.tsx` `COLONY_SCENES`. Their STORY timings (set in `src/fixture.ts`) go to `catalogue.ts`.
- The gauge landing (`src/landing.tsx`, plus the `cev-pulse` keyframe in `src/mock.css`) goes to C34's `ColonyGauges`
  (`apps/web/src/components/Colony.tsx`) and `events.css`.
- The strike badge (`src/frames.tsx` `StrikeBadge`) goes to `TableApp.tsx` `TvHeader`, read from the view.
- The Governor's card goes to WS7's hub. It is a C35-style desk action that sends `{ type: 'payStrike' }`. WS7 wires it; WS8 draws where
  it sits. Everyone else's alert line goes under Now.
- Production: `ProductionMap` has no layer slot. This is a DS-GAP: it needs an `over` prop like EventLivingMap's, so that the strikers ride its box.

## DS-GAPs (all marked `DS-GAP:` in the source)

- The strike badge and the striker's placard.
- The gauge-landing flight and the band pulse.
- Now-with-actions (variant A) and the alert line under Now.
- `ProductionMap`'s missing `over` slot.
- The changes card for gauge effects. Today the real `EffectsCard` only handles off-map motions.
- The glyphs for the nine new keys.
