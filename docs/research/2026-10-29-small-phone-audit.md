# The phone at 667×375: audit against 844×390

2026-10-29, WS6. Heiko ruled the phone landscape on every screen (it already is: `apps/web/src/phone/PhoneApp.tsx`
hides the game in portrait and shows `TurnSideways`). Every screen is designed and e2e-measured at 844×390; nothing
checked the small landscape phone (iPhone SE/8 held sideways, 667×375). This audit measured every approved phone mock
(83 routes on the :5319 build, each frame CSS-resized from 844×390 to 667×375) and the real app (trunk e9fdc6b, a
smoke-style game, seed 1, every screen with the clock held), at both sizes. Only what is worse at 667, or broken at
both, is listed. Raw data, scripts and paired screenshots:
`/private/tmp/claude-501/-Users-heiko-Projects-mule-next-gen/2ff554d3-f892-40fc-be32-e6fc9f172462/scratchpad/small-phone/`
(`shots/app/<screen>-667x375.png` and `-844x390.png`; `shots/mocks/<route>-f<i>-667x375.png`). Spot-checked by WS6
on the auction status and the arcade phone screenshots.

Why the shell itself shrinks so little: the rail is `--rail: clamp(232px, 31vw, 300px)` (`apps/web/src/index.css`),
so at 667 it is 232 px (31vw would be 207) and the stage 435. The rail's scrolling window loses 15 px everywhere.

## The real app, worse at 667

| Owner | Screen | What breaks | Element | 667 vs 844 | Severity |
|---|---|---|---|---|---|
| WS4 | every phase | your name in the rail header cut to one letter ("H") | `[data-testid=guide]` header `span.truncate` (Shell.tsx:156) | 10 of 39 px vs all | cosmetic, everywhere |
| WS4 | every phase | the rail's scrolling window 15 px shorter; Now detail, the drone instructions, "Highest bid 6 · You" fall below the fold | guide body `div.flex.min-h-0.flex-1` | e.g. auction status 53 vs 68 px | hard to use |
| WS4 | development, store hall | booth labels wrap, Rare earth clips; the side doors (the walk-out controls) and the works fits drop under 32 px | `booth-*`, `door-L`/`door-R`, `fit-*` (packages/ui Store.tsx) | doors 28.9 vs 39.2 wide; fits 31.2 vs 44.4 | hard to use |
| WS4 | lobby | four species names overflow their chips; two colour chips under 32 px; AI names truncated | `species-*`, `colour-3`/`colour-4`, `seats span.truncate` (Lobby.tsx) | Bramblet 42 in 37 px | cosmetic |
| WS4 | game over | AI names truncated ("The Accou…") | `scores span.truncate` (GameOver.tsx:41) | 101 of 108 px | cosmetic |
| WS3 | goods auction status | the table scrolls sideways; SURPLUS off the right edge | status table (components/AuctionParts.tsx) | 478 in 435 vs fits | hard to use |
| WS3 | goods auction walk | the names strip truncates "The Acc…" | `walk-names span.truncate` (packages/ui WalkBoard.tsx) | 51 of 78 px | cosmetic |
| WS7 | election, every stage | the vote-weights table is wider than the rail; Votes column hidden | `table.text-xs` in the guide (hub/politics/Council.tsx) | 266 px in 231 (47 hidden vs 18) | hard to use |
| WS7 | election, promise | "Pick a promise to run" wraps to 3 lines, cut | `promise-run` | 52 in 44 px | cosmetic |
| WS6 | planning, election month | the agenda's third card cut mid-word | `agenda div.overflow-x-auto` (hub/Hub.tsx:180) | 480 in 415 | cosmetic |
| WS6 | planning, Market desk | the market strip's good names get half the width | `market-strip span.truncate` (hub/desks.tsx:136) | 5–7 px vs 12–14 | hard to use |
| WS6 | planning, Talk desk | the "Ha!" chip under 32 px | `channels button.h-9` (hub/desks.tsx:89) | 31.8 vs 40.2 wide | cosmetic |
| WS6 | rail chat (auction on) | the last AI line truncates | `chat-line-N span.truncate` (chat/Chat.tsx) | 122 of 143 px | cosmetic |

**Broken at both sizes** (taps under 32 px; text under 10 px):
- WS4 (Shell): the Night toggle 54×22, `move-to-phone` 28×28; rail seat names 9 px; the map STORE chip 8 px.
- WS4 (Store): "needs a MULE" and door labels 7 px, booth caps 8 px.
- WS4 (Lobby): `close-room`/`host-to-phone` 20 px tall, `kick-*` 28×28.
- WS6 (hub): `tool-look`/`tool-drone` 28 px tall.
- WS7 (Council): ballot and promise radios 13×13, `withdraw` 16 px tall; `run-governor`/`run-sheriff` wrap to 2–3 lines.
- WS3 (auction): `limit-*`, `units-*`, `status-store` 9 px; walker "BID" 8 px.

No page-level scroll and nothing off screen on any app screen at either size.

## The approved mocks, worse at 667

| Owner | Route | What breaks | 667 vs 844 | Severity |
|---|---|---|---|---|
| WS6 | `#arcade`, `#arcade-phone`, `-wolves`, `-glint`, `-scramble` | the landscape game is laid out for 844: the right status column runs over the map and is cut, 15 px cut at the bottom | 744×388 in 665×373 | hard to use |
| WS6 | `#arcade-phone-portrait` | the portrait comparison variant (retired direction) loses its controls below the frame | 77.5 px below at 375×667 | blocks play (comparison route only) |
| WS6 | `#audit-hub*` | the needs strip overflows; map tools under 28 px | 508 in 343 | hard to use |
| WS6 | `#plan`, `#plan-drone` | "News & chat" tab wraps to 3 lines, cut; "Geo drone · 40 cr" wraps | 54 in 28 px | hard to use |
| WS6 | `#monthend-gameover` | the verdict card 68.8 px below the frame | 443 in 373 | hard to use |
| WS6 | `#monthend*` | "Colony score" truncated | 23 of 71 px | cosmetic |
| WS4 (Develop/Store) | `#dev*`, `#store*`, `#chat`, `#audit-dev-*` | the store hall: booths wrap and clip, doors and fits under 32 px | doors 22–24 vs 36.4 | hard to use |
| WS4 (Develop) | `#audit-dev-swap` | the plot card clipped on two sides, swap and "Fit a filter" hidden, no scroll | 472 in 197 | blocks play (swap) |
| WS4 (Develop) | `#audit-dev-walk`, `-arrive*` | plot card clipped right; readout names "F…" | 203–212 in 164 | hard to use |
| WS4 | `#lobby*` | species chips half width, names spill | 27.2 vs 56.7 wide | hard to use |
| WS3 | `#status`, `#audit-auction-status` | status table scrolls sideways, SURPLUS cut (as in the app) | 403 in 365 | hard to use |
| WS3 | `#audit-auction-walk*` | names strip cuts "The Accountant" | 28–68 of 79 px | cosmetic |
| WS7 | `#audit-election-announce` | the announce card 15 px past the frame | 15 px off | cosmetic |

Fine at 667 (no change beyond the 15 px shorter rail window): every `#hub-*`, `#plan-wait*`, `#game-handoff*`,
`#audit-election`, the election ballot, reveal and Governor, `#walk`, `#tv-election`, `#production`, `#auction-*`,
`#land-*`, `#dev-map*`; in the app the hub's Colony and Council desks, the land grant, the land auction, the
development map, production, month end and the ballot.

## Not reached

The app's Governor and Sheriff desks (AIs won both offices), the month-2 goods walk, a month-1 land auction, the
planning wait screen, buying and outfitting in the store, the move-to-phone dialog, a Talk desk with messages, the
production event show. Animated text (thought bubbles, "+1" chips) was not judged. Those are measured in the mocks.

## What WS6 recommends

1. One shell decision first (WS4, reviewed by WS6): the rail's 15 px and the header name. Everything else is per
   screen; each owner fixes its own rows.
2. Add 667×375 to the shell e2e's measured sizes (it already measures 844, 844+notch and 1099/1100), so the small
   phone stays checked: one line in `apps/web/e2e/shell.ts` (WS6's).
3. WS6's own rows: the arcade phone at 667 goes into the arcade build spec (the map scales to the frame, status
   overlays the map's top edge when the side room is too narrow); hub, plan and month-end mock rows fixed in the mocks.
