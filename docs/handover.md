# Handover

This is where M.U.L.E. Next Gen stood on 21 Oct 2026. It is written so a new
Claude session, on any account, can pick up the work with only this repo.

## What we are building

The game is a modern successor to M.U.L.E. (1983). It is a web app on the
Helvetiq stack (React 18, Vite 7, Tailwind 4), wrapped later with Capacitor 8
for iOS and Android.

- **Players.** Play is online and server-authoritative, with 2 to 6 players, each on their own phone or PC.
- **AI seats.** AI players fill empty seats and chat in character.
- **Key use case.** A family at the kitchen table, each person on their own phone.
- **Big screen.** An optional TV or laptop shows the public board. The game must also work without it.
- **Pace.** One month takes about 5 minutes, so a game lasts about an hour.

- **Design:** [docs/design/](design/README.md), a copy of every tab of the design doc.
- **Code plan:** [docs/technical-plan.md](technical-plan.md).
- **Rules for code:** [CLAUDE.md](../CLAUDE.md). In short:
  - the engine is pure, with a seeded RNG and no clock or `Math.random`;
  - balancing numbers live in `config.ts`;
  - rules errors are `RuleError`;
  - run `pnpm typecheck && pnpm test` before pushing;
  - commits follow Conventional Commits.
- **Research behind the AI plan:** [docs/research/](research/).
- **Clickable walk-auction prototype:** [design/prototypes/walk-auction.html](../design/prototypes/walk-auction.html). Open it in a browser and tap to start the sound.

## Decisions Heiko has made

Most decisions are recorded in the design doc. These are the ones that steer
the next work:

- **Guiding rule.** Every feature must add freedom but stay simple.
- **Phones are landscape only.** An upright phone shows a "turn sideways" screen.
- **The goods auction is the classic walk auction.**
  - One good is auctioned at a time.
  - Sellers start at the top and buyers at the bottom, and each walks toward the other.
  - Trade ticks get faster so large quantities sell quickly.
  - Each player can pick buy or sell per good and can switch sides mid-auction.
  - A good is skipped automatically when nobody can trade it. The auction ends early when everyone presses Done.
  - The time bar goes from green to amber to red, with a ticking that speeds up and a bell ("dong dong dong") at the end.
  - Code: `packages/engine/src/walk.ts`, `WALK` in config.
- **No direct trading between players.** A player can put a plot or a MULE up for sale in planning, but it always goes to an auction, so the sale stays fair.
- **No price ceilings.** Prices come from pure supply and demand. A good is worth what people pay for it.
- **Development stays classic.** You walk into the store, buy an empty MULE, outfit it, walk to your plot and install it. The pub ends your turn. Food sets how much time you get.
- **AI players** (design doc, AI players tab, "How we build the strategist"):
  - **The strategist** is code. It uses strong scoring rules to build a shortlist of options and looks ahead only lightly, with no Monte Carlo search.
  - **A small language model picks** one of 3 to 5 near-best options in character. Personality (cautious, aggressive) comes from its prompt. The default model is Claude Haiku 5.5, hosted and called from our server, with the cost of every call logged.
  - **The hands** play the real-time phases. They walk the shortest path with purpose and never circle or wander, react at human speed and never pass the brain's price limits.
  - **If the model is slow or unreachable**, the strategist's top option plays.
  - **API key.** The model key comes from `ANTHROPIC_API_KEY` in the server environment only. Never commit it, and never put it in `.env.example`.
- **The name.** "M.U.L.E." is actively licensed by Ozark Softscape (Melanie Bunten). Heiko wants to ask her blessing for the name and the theme music. Until then the name is a working title only.

## Where the code is

PRs #1 to #8 are merged into `main` (21 Oct 2026): engine, server, design
system, stage-2 rules, the playable phone and TV screens, landscape phones,
the classic walk auction and these docs.

`feat/strategist` (draft PR #10) builds and passes its tests:

- **`packages/ai`**: the strategist (utility-scored land, development and
  auction decisions), the default dual-utility decider, personas, the
  development and auction hands, the decision log and the simulator.
- **`packages/engine/src/observe.ts`**: what one seat may see. The AI reads the game only through it.
- **Server**: AI seats are driven by `AiSeat` in planning, the land grant
  (they press Claim after a human reaction time), development (their own
  clock, real elapsed time; the phase now waits for AI players too) and the
  auction. Every AI move goes through the same rule checks as a phone.

## How the strategist values things

- A MULE's worth is its monthly net over `STRATEGIST.horizon` months: next
  month at the outlook's forecast price, later months at the price the
  outlook sees after playing the status quo forward
  `STRATEGIST.outlookMonths` (2) months. This is what lets it see a Smithore,
  Food or Water shortage coming before the price shows it.
- Food, Water or Energy that covers the seat's own shortfall is worth at
  least `STRATEGIST.selfSupply` times the reference price, because going
  short costs development time, half of every farm or half of every plot.
- The cash reserve prices a short unit at most `reservePriceCap` times the
  reference price, and a farm for a good the seat is short of doesn't need to
  keep cash back for that good. "Cash left" is only a mild preference
  (`cashLeftFloor`); the reserve itself is a hard rule.

## Latest simulator run

20 games, seeds 101 to 120, 4 strategist seats at Trader, after the fixes above:

| Check | Start of 21 Oct | Now | Target |
| --- | --- | --- | --- |
| Plots developed at the end | 28% | 49% | 70% or more |
| Colonists short of Food or Water | 88% of months | 52% | under 15% |
| Food above 3x reference | 100% of games | 55% | 33% to 50% |
| Corral sold out | 0% | 30% of months | under 10% |
| MULE price, 90th percentile | 389 | 1,466 | under 500 |
| Units traded between players a month | 0.4 | 3.0 | |

All four personas now win games. The corral running dry is the main open
problem: the store runs out of Smithore around month 7, and too few AI
players mine it, so development stalls while they still have cash.

## Known gaps

- **Smithore and the corral** (above). Next lever: let the strategist value
  Smithore by what the corral needs, or have the store keep more Smithore back.
- **Early factories.** In month 1 the AIs still build Medicine and
  Electronics works on starting stock and then can't feed them.
- **Language-model decider** not built yet (`Decider` interface is ready in `packages/ai/src/decider.ts`).
- **Tournament runner** not built; the `pnpm tournament` script was removed until it exists.
- **Land and asset auctions** do not use the walk auction yet.
- **Politics** (stage 3) is designed but not built.
- **Events, traits and super tiles** exist in the engine. Their numbers are placeholders.

## Next steps

1. Fix the Smithore and corral shortage, then re-check `pnpm sim -- --games 40`.
2. Plug in the language-model decider (Claude Haiku 5.5, `ANTHROPIC_API_KEY`
   from the server environment only), with the top option as fallback and the
   cost of every call logged.
3. Use the walk auction for the land auction and for listed plots and MULEs.
4. Build politics (stage 3).

## Working environment

The 21 Oct session in the Claude app could not reach the npm registry, so it
could not run `pnpm install`. It typechecked with a global `tsc`, ran the
simulator with a global `tsx`, and ran the tests with a small vitest
stand-in; GitHub CI runs the real suite. Claude Code sessions on this repo
have had working npm access.

## What did not come along

The old project's shared folder held these files:

- phone and TV screenshots (`screens/`);
- the research notes, now copied to `docs/research/`;
- the prototype, now copied to `design/prototypes/`.

The screenshots can be regenerated from the running app. The design doc's
diagrams were not exported. They exist only in the live Claude Doc.
