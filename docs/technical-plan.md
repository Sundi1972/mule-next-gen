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

This means the client is designed phone-first and portrait-first: big touch targets, a zoomable map, and short real-time phases that work with one thumb. A screen that only works on a laptop is a bug.

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

- **The server is authoritative.** Clients send intents ("claim this plot", "my auction price is 42"), the server validates them with the engine and broadcasts the new state. Nobody can cheat by editing their client.
- **Rooms are their own reusable layer.** `packages/tabletop` knows nothing about M.U.L.E.: it seats players, connects big screens, gives a dropped phone its seat back by a secret token, hands hosting on when the host leaves, keeps whispers private and answers clock-sync pings. A game plugs in by supplying `start`, `handle` and `viewFor(seat or null)`, where `null` is the public view a big screen gets. A second game could reuse it unchanged.
- **The engine is pure.** Every rule is a function of the game state and a seeded random number generator. Any game can be replayed from its seed and its list of actions, which makes bugs reproducible and allows replays later.
- **Phases run on server timers.** Planning phases end when the timer runs out or everyone presses Ready. Real-time phases tick on the server (about 10 times a second for the land grant cursor and the auction) and send small updates to clients.
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

Prices have no floor and no cap. A glut can push a price close to nothing, and a shortage can push it as high as anyone will pay. Stability comes from how the colony's actors behave, not from limits:

- **The store is a merchant, not a bottomless buyer.** It fills its shelves up to three months of demand, never spends more than half its fund on one good in a month, and only imports when the colony price is above what the import costs.
- **Colonists pay for their Food and Water** out of off-world wages, up to what they can afford. When the price is higher, they go short, just as when the shelves are empty.
- **MULEs cost their labour plus the Alloy inside them at today's price**, as in the original. A Smithore shortage makes MULEs dear.
- **Off-world buyers are real demand.** The export ship buys Smithore, Crystite and the processed goods, up to what its buyers want.
- **The reference price learns only from trades between players**, and only from the part of the price that the shortage alone doesn't explain. It drifts slowly back toward the off-world price, because ships keep bringing that price into the colony.

## What the simulator showed

The first runs found economy bugs that a design doc alone wouldn't have caught:

- Without price limits, the store spent its whole fund in the first month buying at shortage prices and importing. It could then no longer build MULEs, and the colony starved. The merchant rules above fixed this.
- The reference price followed the store's own shortage price upward, so prices compounded into the billions. Learning only from trades between players fixed this.
- MULE production stopped because nobody made Alloy. The store now has a small Smithore smelter, as the original's store did, and Smithore demand includes it.

With 4 AI players over 100 games, Food has a median of about 79 credits, with spikes to 2,683 when the shelves are empty. About 1 colony in 8 runs short of Food at least once, and in 17% of months no MULE is for sale. Electronics and Medicine sit at shortage prices because the simple AI doesn't build factories yet; that comes with the smarter AI.
