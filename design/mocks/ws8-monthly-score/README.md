# G-5 · the colony score at every month end (WS7 + WS8)

**Status: for review.** The PM approves (design authority), and Heiko may veto.
Heiko decided on 5 Nov that the colony score shows at every month end, next to the league, on
the TV and on the phones, not only at game over. This mock decides where it goes and how it
looks.

## Decisions

- The score shows at every month end, on the TV and on every phone, next to the league. Game over
  keeps C34's approved screens unchanged.
- There's no verdict at a month end. "A colony to be proud of" stays with game over. The TV band
  says "counted again at game over".
- The change since last month is `score.total − lastScore`, shown with the league's own
  `ChangeTag`, for example "↑ +2,069 since month 6". Month 1 has no change line.
- **TV, variant A, the band (WS8's pick):** C34's band frame goes in the left column's spare room,
  under the league. It shows the total, the change, the sum (terms formatted) and the
  `scoreWords` line. It has no plaques, because the build site beside it already shows them.
- **TV, variant B, a league row:** "The colony" is one more row in the league's own table, under a
  double rule. It has no rank and uses the colony glyph. Its score sits in the Worth column and
  its change in the change column. In Collapse its "Before the cut" cell reads "not cut".
- **Phone beside a TV:** one line under the league, in the footnote's place: "Colony score 36,538
  ↑ +2,069 since month 6", plus one short line. It's no taller than today's two-line footnote, so
  the league keeps its room on a 667 × 375 phone. The sum is on the TV.
- **Phone with no TV:** the line heads the colony panel. It carries the sum when the shell is
  800 px or wider. Below that the sum gives way, but the total and the change never do.
- **Collapse:** the banner shows as today and every Worth is cut. One line says the colony's score
  isn't cut.
- **Politics off:** there's no colony in the view, so the screens are today's line for line
  (HC-22). The pages mount this mock's copies and the real screens side by side.

**Why A:** it costs the TV nothing. `FitHeight` measures 0.560 for both A and B at month 7, which
is the same as today's real screen. The build-site column is what sets the scale. In Collapse A
measures 0.459 and B 0.466. A keeps the sum and the words, which B has no room for, and A doesn't
put a 36,538 beside Worths of around 6,000 as if they ranked together.

## Open: the six-seat fallback (B), `#/tv-six-band-right`

The PM ruled variant A for the common table. This page is the fallback, used only if WS4's fix to
the 5+-seat month end still leaves six seats under 0.8. In variant C the league has the left
column to itself, and #416's `MonthScoreColumn` card sits under the build site on the right. The
page shows it beside A (the built `TvMonthEnd`, trunk + #416), for six seats at month 2, with the
ticker full (three lines) and empty.

FitHeight's scale, measured on this page (the page also reads it live):

| | ticker empty | ticker full |
|---|---|---|
| A, the band under the league (built) | 0.520 | 0.360 |
| C, the band under the build site | 0.490 | 0.340 |

A's numbers match WS4's read of the real six-seat month 2 TV, 0.520 and 0.360. **C is lower than
A, so it is no fallback at this table.** At six seats the right column (the colony panel and the
build site, with two projects here) is already taller than the six-row league. Moving the band
there lengthens the column that sets the scale. The build site grows with each project, so C only
gets worse later in a game.

To rebase onto trunk, `origin/feat/strategist` (5eb20a81, with #381) and #416's
`origin/ws8-monthly-score` (852ca404, still open) are merged into this branch. That puts
`MonthScoreColumn` under the mock: #416 is not on trunk yet. The copied `TvMonthEnd` and
`FitHeight` now follow trunk's versions.

## CONTRACT: ws7-score-monthly (WS7, settled 5 Nov)

Neither field is in the protocol on this base (`origin/ws7-politics`) yet. Both are being built
on WS7's `ws7-score-monthly`, and the mock extends the type locally (`ColonyViewNext` in
`src/fixture.ts`).

- `ColonyView.score` keeps the shape `{wealth, environment, prestige, factor, total}`, and the
  server fills it in every phase. The screens show it at the month end. The verdict
  (`scoreVerdict`) shows only at game over.
- `ColonyView.lastScore?: number | null` is the previous month end's total, and null in month 1.

The fixture's scores come from the engine's own `colonyScoreOf` (RULE-25), so the sums add up.

## FINDING (Colony.tsx, WS8's), fixed in #416

C34's `ScoreSum` and `ScoreHero` print the terms and the total raw ("31200", "55718"), as the
`over-tv` page shows. C34's fixture used two-digit numbers, but RULE-25's terms are credits. The
graft should format them with `fmt()`, at game over too. This mock's `ScoreSumTv` is that copy.

## DS-GAPs

- A league row that isn't a player (variant B). No `PlayerMark` fits and no colony mark exists,
  so it borrows `ObjectGlyph`'s spaceport. The double rule above it is also a new mark.

## Graft targets

| Mock | Becomes | Owner |
|---|---|---|
| `src/screens.tsx` `TvMonthEndScore` (COPY of TvMonthEnd, additions marked GRAFT) | `apps/web/src/table/TableApp.tsx` `TvMonthEnd` | WS4 |
| `src/screens.tsx` `PhoneMonthEndScore` (COPY of MonthEnd; MonthEndFooter copied verbatim) | `apps/web/src/phone/Results.tsx` `MonthEnd` | WS4 (SEAMS: apps/web/** is WS4's) |
| `src/score.tsx` `MonthScoreBand`, `PhoneMonthScore`, `ScoreSumTv` | `apps/web/src/components/Colony.tsx`, beside `ScoreHero` and `PhoneColonyScore` | WS8 |
| `src/score.tsx` `ColonyLeagueRow` (B only; a portal SEAM into the real table) | a `footer` prop on `components/MonthEnd.tsx` `LeagueTable` | WS4 |

Copies (flagged `COPY:` in the source): `TvMonthEnd`, `FitHeight` and the phone's `MonthEnd` and
`MonthEndFooter` aren't exported, or have no slot for the score, so they are copied. Every other
part is the real component: `LeagueTable`, `ColonyPanel`, `BuildSite`, `CollapseBanner`,
`YourWorth`, `PhoneShell`, `TvHeader`, `ReadyCount`, `ChangeTag`, `scoreWords`, `moodOf`,
`TvGameOver`, `GameOver` and `Results`.

`src/borrowed/ready.ts` is a pass-through. It exists only because the precedent's
`vite.config.ts` (ws8-desks, copied exactly) serves `phone/hub/ready.ts` from that path.

## Game over

Game over is unchanged. C34's approved pages are on branch `ws8-colony-mocks` at `b0f52001`,
workspace `design/mocks/ws8-colony`: `#/tv-gameover-a`, `#/phone-gameover` and
`#/phone-gameover-failed`. The real screens they became are mounted here as `#/over-tv` and
`#/over-phone`.

## Run it

```bash
cd design/mocks/ws8-monthly-score
./node_modules/.bin/vite --port <free port> --strictPort --host
```

Don't use 5318, which serves the desks mock. `node_modules` is a symlink to `apps/web`'s. Option-click
selects an element for review, and a plain click uses the prototype.
