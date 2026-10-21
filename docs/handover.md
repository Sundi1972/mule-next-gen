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

| Branch | State | PR |
| --- | --- | --- |
| `main` | Engine, server, design system and stage-2 rules (PRs #1 to #4 merged) | |
| `feat/play-screens` | Phone and TV screens wired to the server | #5 into `main`, green, waiting for Heiko's OK to merge |
| `feat/phone-landscape` | Landscape-only phone with a side rail | #6, stacked on #5, green |
| `feat/walk-auction` | Classic walk auction | #7, stacked on #6, green |
| `feat/strategist` | **Unfinished.** New `packages/ai` (strategist, utility scoring, hands, decider, personas), `packages/engine/src/observe.ts` (what a seat may see), sim moved into `packages/ai`, old simple bot deleted | No PR. **Does not build yet** |

Merge #5, then #6, then #7, in that order. Each one needs Heiko's OK first.

The git stash "abandoned sim bot tuning" lives only in the old cloud container
and will be lost with it. That is fine, because Heiko called that work throwaway.

## Known gaps

- **Sim numbers are rough.** The simple bot plays badly, with AI players going broke, food spikes and hunger. The numbers only become meaningful once the strategist replaces it.
- **Land and asset auctions** do not use the walk auction yet.
- **Politics** (stage 3) is designed but not built: Governor, Sheriff, Land Baron, laws, budget and projects.
- **Events, traits and super tiles** exist in the engine. Their numbers are placeholders.

## Next steps

1. Finish `feat/strategist` and get it building and passing tests:
   - scoring and shortlist;
   - the hands, with A* paths on the map and the auction walk;
   - the language model decider, with a fallback to the top option.
   Then check balance with `pnpm sim`.
2. Use the walk auction for the land auction and for listed plots and MULEs.
3. Build politics (stage 3).
4. Merge #5 to #7 when Heiko says so.

## What did not come along

The old project's shared folder held these files:

- phone and TV screenshots (`screens/`);
- the research notes, now copied to `docs/research/`;
- the prototype, now copied to `design/prototypes/`.

The screenshots can be regenerated from the running app. The design doc's
diagrams were not exported. They exist only in the live Claude Doc.
