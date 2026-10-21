# Technical challenges

What the game needs from its technology, what is hard about each part, and how we plan to solve it. The stack itself is settled: TypeScript everywhere, React with Vite and Tailwind for phones and the big screen, Capacitor for the app stores, and a Node game server with WebSockets. The hard problems are not the frameworks but the things listed below.

## The five hardest problems

1. **A stable economy with no price limits.** Prices come only from supply and demand, so stability has to come from how the store, the colonists, the ships and the AI traders behave. The first simulator run without limits showed exactly this risk: the colony store spent its fund in the first month, could no longer build MULEs, and the colony starved. This is a design problem we can only solve with a simulator and many playtests.
2. **AI players that are fun, quick, cheap and safe.** A language model has to decide and chat within a 45 to 90 second planning phase, for up to 5 AI players, every month, at a cost that a commercial game can carry. It must stay family-friendly and must not be talked into giving away its Crystite by a clever kid in the chat.
3. **Fair real-time play on flaky phone networks.** Phones lock their screen, switch apps and drop Wi-Fi. The land grant and the auction are decided in fractions of a second, so a slow connection must not decide who gets a plot, and a dropped phone must rejoin in seconds without losing its place.
4. **Secrets across many screens.** Each phone may only ever receive what its player is allowed to know, and the big screen only what everyone may know. One leaked message and the sabotage or the survey result is no longer secret.
5. **Polished graphics on ordinary phones and TVs.** A 2026 look with animated avatars, production and events has to run smoothly on a three-year-old phone and on a 4K TV at the same time.

## Capabilities and how we build them

| Capability | What is hard | How we solve it | When |
| --- | --- | --- | --- |
| Rules engine | Many rules that interact (economy, events, laws, sabotage) and must give the same result every time | A pure TypeScript package with a seeded random generator. Any game can be replayed from its seed and its list of actions. | Built (stage 1a) |
| Economy simulation | No price limits, so the market must balance itself | A headless simulator plays hundreds of AI games per change and reports prices, shortages and bankruptcies. CI fails if the economy breaks. Every balancing number lives in one config file. | Built, being rebalanced now |
| Authoritative game server | Rooms, phase timers, 10 updates a second in real-time phases | Node with WebSockets. Clients only send intents; the server checks them against the engine and broadcasts the result. Nobody can cheat by changing their app. | In progress (stage 1b) |
| Fair timing | Latency between the TV, the phones and the server | The server runs on a shared clock. Phones sync their clock on connect, the land grant cursor moves on a fixed schedule, and a press counts for when it was made, inside a short grace window. | Stage 1b |
| Reconnects | Phones sleep and drop the connection | Every player has a seat token stored on the phone. Rejoining puts them back in their seat with the full state. The screen wake lock keeps phones awake during a game. AI hands play a dropped player's routine moves until they are back. | Stage 1b |
| Hidden information | Secrets on six phones and one public screen | The server builds a separate view for each player and one public view for the big screen. Hidden data never leaves the server. Automated tests check every view for leaks. | Stage 1b |
| AI brain | Speed, cost, safety, staying in character | Claude models called from the server in the planning phase only. They answer with structured actions that the engine validates. The cheap code "hands" play the real-time phases. A strict time budget applies, with a fallback to the hands if the model is slow. Each decision is recorded so games can still be replayed. | Stage 3 |
| Safe chat | Children at the table, AI players in the chat | A family-friendly filter on all chat, rate limits, and AI personas told never to break character or reveal hidden data. Player messages to AI are treated as table talk, never as instructions. | Stage 1b (filter), stage 3 (AI) |
| Big screen mode | Two layouts for one game, sound in one place | The same web app with two roles: board and controller. The board gets only the public view and plays all sound. | Stage 1b (simple), stage 2 (full) |
| Graphics | 60 frames a second on phones and TVs | SVG for the first prototype. PixiJS (WebGL) for the animated map and auction once the art arrives. Art is made for both small and very large screens. | Stage 4 |
| Mobile apps | App store rules, background behaviour | Capacitor wraps the same web app. Kitchen table play needs no install at all: the browser is enough. | Stage 4 |
| Saved games | A server restart must not end a game | Live rooms are snapshotted to Redis after every phase; finished games and accounts go to Postgres. Deploys wait for running games to finish a phase. | Stage 4 |
| Hosting | WebSockets must stay on one server per room | One region in Europe to start. Each room lives on one server, found by its room code. | Stage 4 |
| Testing | Real-time multiplayer is hard to test by hand | Engine unit tests, the economy simulator in CI, bot tests that connect six headless clients to a real server, and Playwright screenshots at phone and TV sizes. | Every stage |

## Open questions that are not technical but block launch

- **The name.** "M.U.L.E." is a trademark of the original game's rights holders. We can develop under the working title, but need a legal check or a new name before any public release.
- **Business model.** A one-off purchase, a free game with paid extras, or a subscription changes how we build accounts, payments and the AI cost budget.
- **AI cost per game.** About 5 AI players times 12 months of planning decisions and chat. We need to measure this in stage 3 and pick the model sizes for Rookie, Trader and Tycoon from real numbers.
- **Children's privacy.** Kitchen table play needs no accounts. Once accounts exist, rules for children's data (GDPR) apply.
