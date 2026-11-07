# Technical plan

How M.U.L.E. Next Gen is built. The game design lives in the design doc; this
file covers the code.

## Goals

- **Online multiplayer** for 2 to 6 players, each on their own PC or phone, with AI players filling empty seats.
- **Quasi real-time:** simultaneous planning phases and real-time action phases, with nobody waiting for another player's turn.
- **One codebase** for web and mobile.
- **A realistic economy** whose numbers can be tuned without touching rules code.

## Stack

| Part | Choice | Why |
| --- | --- | --- |
| Language | TypeScript everywhere | One language for client, server and rules |
| Web client | React 18, Vite, Tailwind 4 | Same stack as Helvetiq |
| Mobile | Capacitor wrapping the web client | Same code in the app stores |
| Map rendering | SVG first, PixiJS if large maps need it | SVG is quick to build and style; PixiJS for animation-heavy phases later |
| Game server | Node 22 with WebSockets (`ws`) | Authoritative, real-time, simple to host |
| Rules | `@mule/engine`, a pure TypeScript package | Deterministic, testable, shared by server, simulator and AI |
| AI brain | Claude models through the Anthropic API, called from the server | Strategy, negotiation and chat during planning phases |
| Tests | Vitest | Fast and works with TypeScript and Vite |
| Repo | pnpm workspace monorepo | One install, shared packages |

## Play modes

The same server and client support three ways to play, and the phone is the main device in all of them:

- **Solo:** one player against AI players. AI personas have to carry the social side of the game, so their chat, deals and grudges matter as much as their strategy.
- **Kitchen table:** everyone sits together, each with their own phone. One person creates a game and the others join by scanning a QR code or typing a 4-letter room code; no accounts needed. Public things (the map, auctions, council votes) show on every phone, and optionally on a shared TV or laptop through a `/table` view. Private things (your stock, whispers, secret sabotage orders, survey results) stay on your own phone, so you can plot against someone sitting next to you.
- **Remote online:** the same thing over the internet, with in-game table chat replacing talking across the table.

This means the client is designed phone-first and played sideways (landscape only, about 844x390 to 932x430): the colony map gets as much of the screen as possible, and the controls sit in a narrow side rail within thumb reach. Held upright, the phone shows a "Turn your phone sideways" screen; a native shell (Capacitor) can lock the orientation later. Big touch targets and short real-time phases still apply. A screen that only works on a laptop is a bug.

## Repository layout

```
packages/engine   rules, economy, map, AI "hands", balancing simulator (no I/O)
packages/tabletop game-agnostic rooms: seats, boards, reconnects, host hand-over, private views, chat, clock sync
packages/protocol M.U.L.E. moves and views sent between server and screens
apps/server       WebSocket server hosting M.U.L.E. in tabletop rooms, phase timers, AI brain (stage 1b)
apps/web          React client: lobby, map, development, auction, chat     (stage 1b)
docs/             this plan and other technical notes
```

## Architecture

- **The server is authoritative.** Clients send intents ("claim this plot", "walk up"), the server validates them with the engine and broadcasts the new state. Nobody can cheat by editing their client.
- **Rooms are their own reusable layer.** `packages/tabletop` knows nothing about M.U.L.E.: it seats players, connects big screens, gives a dropped phone its seat back by a secret token, hands hosting on when the host leaves, keeps whispers private and answers clock-sync pings. A game plugs in by supplying `start`, `handle` and `viewFor(seat or null)`, where `null` is the public view a big screen gets. A second game could reuse it unchanged.
- **The engine is pure.** Every rule is a function of the game state and a seeded random number generator. Any game can be replayed from its seed and its list of actions, which makes bugs reproducible and allows replays later.
- **Phases run on server timers.** Planning phases end when the timer runs out or everyone presses Ready. In the land grant the server moves the light to the next free plot every 650 ms, in a seeded random order; humans have the whole tick to press, and AI players get their chance just before the light moves. In development each player has their own clock, set by their Food and sickness and shortened by every geo analysis; the phase ends when everyone is at the pub or out of time.
- **The goods auction is the original's walk, run live on the server clock.** Goods come up one at a time in a fixed order (`WALK.order`, raw goods first). Each good goes status → walk: a status screen (had, used, made, now, needs, expected spoilage, surplus) where each player picks Buyer, Seller or Pass, starting from the side their surplus and need point to, then a walk of about 20 s. Sellers start at the top and walk down; buyers start at the bottom and walk up. The store's selling line sits near the top and its buying line near the bottom; the export ship adds a line while it is in port. A bid at or above an ask trades at the seller's ask, one unit at a time, faster the longer a pair stays matched (400 ms per unit, x0.8 per unit, down to 60 ms). The clock runs at a quarter speed while units change hands, and the good ends early when everyone has pressed Done or no trade is possible; a good nobody can trade is skipped and listed in one line. The server ticks the engine's pure step function (`stepAuction`, over the generic board in `walk.ts`) every 100 ms and broadcasts the board, so every phone and the `/table` view show every creature live. The board is generic over "a lot with a seller minimum", so the land and MULE auctions can reuse it. All its numbers are the `WALK` block in `config.ts`.
- **AI players are split in two.** The "hands" in `packages/engine/src/ai` act instantly in real-time phases. The "brain" runs on the server during planning, using a Claude model to set priorities, negotiate and chat. Rookie, Trader and Tycoon map to model size and thinking budget. Stage 1 ships with the hands only.
- **All balancing numbers live in `packages/engine/src/config.ts`.** The simulator (`pnpm sim`) plays hundreds of AI-only games and reports price ranges and how often colonies starve.
- **Persistence.** In memory for the prototype. Later, Postgres for accounts and finished games and Redis for live rooms, so a server restart doesn't kill a game.

## Delivery stages

| Stage | Contents |
| --- | --- |
| 1a (this PR) | Engine: map generation for 2 to 6 players, terrain and traits, production with adjacency and the Energy rule, factories, the colony price formula (pure supply and demand, no floor or cap), the auction, upkeep, spoilage, depots, the store's imports, export ship and MULE building, land rush ending, simple AI, simulator, tests |
| 1b | Game server and phone-first web client: room codes and QR join, one full month with friends and AI players, the optional `/table` view, chat |
| 2 | Events and hedging, tile surveys, special fields and super tiles, storage buildings, speculation tools |
| 3 | Politics: council, Governor, Sheriff, Land Baron, laws, taxes and colony projects; LLM AI brain and personas |
| 4 | Polish: art, sound, onboarding, Capacitor builds, accounts, hosting |

## How the economy stays stable without price limits

Prices have no floor and no ceiling. A glut can push a price close to nothing, and a real shortage keeps pushing it up by half every month for as long as it lasts. Stability comes from how the colony's actors behave, not from limits:

- **Prices follow the colony's whole supply**, the store's shelves plus every player's depot, against demand that includes the players' own upkeep. MULEs in the corral count as the Smithore they were built from.
- **Momentum.** The posted price moves toward its target by at most +50% (of the price, or of the reference price when the good is cheap) or -40% a month. When cover is under a quarter of a month, or colonists went short last month, the price climbs the full step every month.
- **The store is a merchant, not a bottomless buyer.** It fills its shelves up to three months of demand plus a ship's load of export goods, and never spends more than half its capital on one good in a month. It keeps back the Food and Water its colonists will buy. Goods only off-world buyers want are worth no more to it than the ship pays.
- **Colonists pay for their Food and Water** out of off-world wages, up to what they can afford. When the price is higher, they go short, just as when the shelves are empty.
- **MULEs cost their labour plus 1 Smithore at today's price**, as in the original. A Smithore shortage makes MULEs dear.
- **Upkeep grows with what you own:** Food and Water with each player's crew, Energy by what each plot does.
- **The reference price learns only from trades between players**, and only from the part of the price that the shortage alone doesn't explain. It drifts slowly back toward the off-world price.

## What the simulator showed

The runs found economy bugs that a design doc alone wouldn't have caught:

- Without price limits, the store once spent its whole fund buying at shortage prices. The merchant rules above fixed this.
- The reference price followed the store's own shortage price upward and compounded into the billions. Learning only from trades between players fixed this.
- Pricing on the store's shelf alone made the store's own MULE building look like a permanent Smithore shortage, and made Food look short while players' depots were full. Counting the colony's whole supply fixed both.
- Goods nobody in the colony uses (Rare earth, Crystite) priced at their reference forever, so simple AIs mined them and polluted the air into Collapse. Counting the average export ship as demand fixed this.
- A good that crashed early (Water at 5) took six months to recover at +50% a month, so colonists went hungry in the middle of every game. Letting a cheap good rise by half its reference price fixed this.

Latest run (40 games, 4 AI players): MULE median 151, 90th percentile 179, corral never sold out, 95% of plots developed, colonists short in 13% of months, 8% of games in Collapse. Still missing: a real Food shortage in only 15% of games (target a third to a half), and an AI player broke for 3 months in 13% of games, usually after a Crystite bet in a full market. Both are AI behaviour more than rules, and the smarter AI is the place to fix them.
