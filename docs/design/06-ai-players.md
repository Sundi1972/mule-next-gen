# AI players

Oct 21, 2026 · @Heiko

Real intelligence comes cheapest from a strong strategist written in code that uses our own game engine to look ahead, and a small language model that makes the decisions in character, with the strategist as its advisor. That keeps the language model bill near $0.10 to $0.40 for a full game with 5 AI players, and the game still plays well when no model is reachable.

**Decided 2026-10-21 (Heiko):** option 1, a hosted small model that our server calls. We track the cost of every call and build it into the game's pricing (see Cost monitoring).

## How modern games do it

Almost no shipped game lets a language model make its strategic decisions. The intelligence comes from code that searches and scores moves; language models, where they appear at all, give the characters a voice. The closest match to our game is Meta's CICERO for the board game Diplomacy: a planning engine decides what to do, and a language model only negotiates and explains it.

| Technique | Used in | What it is | What we take from it |
| --- | --- | --- | --- |
| Utility AI | The Sims, Civilization VI | Every possible action gets a score from weighted factors; the AI picks the best. Personality = different weights. | The core of our strategist. Personas become weight sets (greedy, vengeful, cautious). |
| Leader agendas | Civilization VI | Each AI leader has visible and hidden goals that shape diplomacy and grudges. | Persona goals and memory of how each human treated them. |
| Look-ahead search (Monte Carlo) | Total War campaign AI, Go and card game bots | Try many possible futures in a fast simulation and keep the plan that does best on average. Hidden cards are handled by guessing them many times. | Our engine already runs headless, so the strategist can play out a month 200 times before choosing. This is where most real strength comes from. |
| Behaviour trees and planners | Halo, F.E.A.R., Horizon Zero Dawn | Fixed decision flows for moment-to-moment actions. | The "hands" in the real-time phases. |
| Trained neural policies | AlphaStar, OpenAI Five, Gran Turismo Sophy | A small network trained by self-play for months; cheap to run once trained. | Later option: train on simulator games. Not needed for stage 1 to 3. |
| Planner plus language model | Meta CICERO (Diplomacy) | Strategy engine sets intents; language model writes messages that match them and reads other players' messages. | Exactly our brain-and-hands split, with the strategist doing the thinking. |
| Small language models for characters | NVIDIA ACE (inZOI, PUBG Ally), Inworld | Small models give NPCs dialogue and simple goals, sometimes running on the player's GPU. | Shows on-device chat is coming, but today it targets gaming PCs, not phones. |
| Difficulty by bonuses | Civilization "Deity", most strategy games | Hard AIs get extra resources, not better thinking. | Avoid as the main lever; use look-ahead depth instead. A small head start for Rookie humans is fine. |

**What this means for us:** "real intelligence" in a trading game is mostly good valuation and look-ahead, which code does better and cheaper than a language model. The language model is what makes the AI feel like a person: bluffing, persuading, holding grudges, reacting to table talk.

## Recommended design

Each AI player has three parts. Only the middle one costs money, and the game works without it.

1. **Strategist (code, free, on our server): the advisor.** For every decision it lays out the options with numbers: plans for the month, which MULEs or plots to put up for auction and what to bid, pacts worth offering, how to vote, whom to sabotage. It plays each option forward in the engine's simulator many times and reports expected gain, risk and odds, for example "Put plot 14 up for auction: expected price about 380, 60% chance Heiko wins it" or "Vote yes on the sales tax: costs you about 40 a month, hurts the leader more". It also prices every pact or deal card offered to it. There is no direct trading of goods between players: a player who sells a MULE or a plot always puts it up for auction.
2. **Brain (language model): the decider.** It reads the advice together with its persona, its memory of each player and the recent chat, and makes the final call in character. It may pick a weaker option on purpose because it trusts you, holds a grudge, wants to bluff or wants to stop the leader. It can also adjust an option (a different price, a different partner) and ask the strategist to score it. It writes all chat and whispers. It acts only through the moves a human has (plan, deal cards, votes, sabotage orders), and the engine checks each one.
3. **Hands (code, free): carry out the brain's decisions** in the real-time phases, as described in How the AI acts in real time. The model is too slow for auctions and the land grant, so it sets the limits and the hands play to them.

**Why this split (decided 2026-10-21, Heiko).** The strategist gives the AI hard facts it could never compute in its head, at no running cost. The model gives it character and judgement, so its choices feel like a person's and not like a calculator's. Because the model gets good advice, a small cheap model is enough; a bigger model mainly improves negotiation and banter.

**Offline.** Without the model there is no character making decisions, so the full AI needs the server and the model online. The game is online-only anyway, so this costs nothing in normal play. If the model does not answer in time (provider down, budget used up), the strategist takes its own top option and chat comes from persona templates: weaker and blander, but the game never stalls. True offline solo would need a model on the phone and stays a late, optional idea.

**One brain interface, several sources.** The server talks to every brain through one interface, so where the model runs is a setting, not a rewrite:

- Hosted small model (default): Claude Haiku 5.5 or an open model such as Qwen3.5 through a provider API.
- Our own GPU server running an open model with vLLM, once volume makes it cheaper.
- Player's own key (Claude, OpenAI, Gemini) for a stronger brain on their seats.
- An outside agent connected through MCP that takes a seat itself.
- No model: the strategist picks its top plan and chat comes from persona line templates.

&#91;embedded content: AI player per month · strategist, brain, hands\]

The engine gives the strategist only what the seat may see; the strategist advises with options and odds, the brain makes the final call, and the engine checks every choice before the hands play it.

## Options compared

Start with a hosted small model, add bring-your-own-key and MCP as extras, and treat phone models as a later offline bonus.

| Option | Brain quality | Cost to us per game (5 AIs) | Who pays | Main problem | Verdict |
| --- | --- | --- | --- | --- | --- |
| Hosted small model (Claude Haiku 5.5, Qwen3.5 via API) | Good with the strategist doing the maths | about $0.10 to $0.40 | Us | A running cost per game, small | **Default from stage 3** |
| Own GPU server with an open model (Qwen3.5 9B or 35B-A3B, Gemma 4, Granite 4.1 on vLLM) | Similar to the hosted small model | About €214 a month fixed (Hetzner GEX45, 24 GB) whether 10 or 3,000 games run; roughly €0.07 to €0.20 per game when busy | Us | Fixed cost, operations, evening peaks | Switch when we pass about 1,500 games a month |
| Model on the phone (Apple Foundation Models, Android Gemini Nano, WebGPU in the browser) | Weaker; tool use and structured output still limited | Free | Player's battery | Only recent flagships (iPhone 17 Pro class, Pixel 10, Galaxy S26); big download for the web; the AI's secrets would sit on a player's phone, which breaks server-authoritative play; a locked phone stalls the AI | Not for multiplayer. Maybe later for offline solo on capable phones |
| Player's own key (Claude, OpenAI, Gemini) | As strong as the player's model, for example Claude Sonnet 5.5 | None | Player | Most families have no API key; we must store keys safely | Optional "premium brain" for enthusiasts |
| MCP seat: player's own agent plays through our MCP server | As strong as the agent | None | Player | Chat assistants only act when prompted, so it needs an agent loop (Claude Code, Agent SDK, a script); slow agents must meet the planning timer | Fun extra: bot arena and "coach" mode; build late |

**How the MCP seat works.** We publish a small MCP server per game seat with a seat token: `get_state` (only what that seat may see), `list_plans` (the strategist's candidates, if the player wants help), `submit_plan`, `answer_deal`, `send_chat`. The real-time phases still run on our hands code with the submitted plan. If no plan arrives before the planning timer ends, the strategist plays the month. The same server gives a "coach" mode: a human asks their own assistant for advice about their own seat.

**Bring-your-own-key safety.** Keys are stored encrypted on the server for one game only, never logged, never sent to phones, and deleted when the game ends. A provider sign-in such as OpenRouter's OAuth flow avoids copy-pasting keys at all.

## Cost per game

A 12-month game with 5 AI players uses about 1.4 million input tokens and 150,000 output tokens. With a small model that is $0.14 to $0.35 a game; a top model on every seat would be $3 to $6. These are estimates to replace with measured numbers in stage 3.

**Token estimate per AI player per month:**

- One planning call: about 6,000 tokens in (rules, persona, state summary, top plans) and 1,500 out (short reasoning plus the structured reply).
- About six chat and deal replies: about 3,000 tokens in and 150 out each.
- Total: about 24,000 in and 2,400 out per month, so 290,000 in and 29,000 out per game, times 5 AI players.
- About 60% of the input (rules, persona, tool definitions) is the same every call and can be cached, which cuts its price by about 90%.

| Brain | Price per million tokens (in / out) | Cost per game, 5 AI players |
| --- | --- | --- |
| Claude Haiku 5.5, with caching | $0.10 / $0.50 | about $0.14 |
| Claude Haiku 5.5, no caching | $0.10 / $0.50 | about $0.22 |
| Qwen3.5-35B-A3B on DeepInfra | $0.14 / $1.00 | about $0.35 |
| Own server, Hetzner GEX45 (€214 a month) | fixed | about €0.14 at 1,500 games a month, €0.07 at 3,000 |
| Claude Sonnet 5.5, with caching (bring your own key, or premium) | $2 / $10 | about $2.80 |
| Claude Opus 5.5, with caching | $4 / $20 | about $5.50 |

**What it means for the business model.** At about $0.15 a game, a free tier with a few AI games a month is affordable, and a one-off purchase covers years of play for a normal family. A premium brain on one Tycoon seat adds about $0.55 per game with Sonnet 5.5, which fits a subscription or the player's own key.

### Cost monitoring

The server records every model call, so we always know what an AI game really costs and can set prices from facts.

- **Log per call:** game, seat, persona, level, model, input tokens, cached tokens, output tokens, cost in dollars, response time, and whether it timed out.
- **Per game:** total AI cost is saved with the finished game, next to its length and number of AI seats.
- **Dashboard:** cost per game, per day and per month; average and the most expensive 5% of games; cost per AI seat per month of game time.
- **Limits:** each Smart AI seat has a model budget per game (start at $0.06, below what we earn on the seat). Past it, that AI player finishes the game with strategist plus template chat, so nobody notices a break. Each account and the whole service get a monthly cap with an email alert at 80%.
- **Levers if cost rises:** shorter prompts, more caching, fewer chat replies per month, or a cheaper model on Rookie seats.
- **Pricing input:** the measured cost per game sets how many AI games the free tier includes and what a subscription or one-off price must cover.

### Pricing AI players

Proposal (2026-10-21, Heiko asked that adding an AI player is priced so we never lose money on model costs). Numbers are placeholders until the test and cost monitoring give real figures.

| AI type | What it is | Our cost per seat per game | Price to the player |
| --- | --- | --- | --- |
| Classic AI | Strategist and hands, template chat, no model | about $0 | Free and unlimited, so every game can always be filled |
| Smart AI | Model makes the decisions and chats in character | about $0.03 (estimate) | About $0.10 per seat per game, as credit packs (for example 10 for $0.99, 50 for $3.99); buying the game or a subscription includes a monthly allowance (for example 20 Smart AI seats) |

- **Margin:** the price is about three times the estimated cost, which covers the app store cut (15 to 30%), VAT and unusually chatty games.
- **No-loss guarantee:** the per-seat model budget (about $0.06) is below what we net on a seat. A seat that reaches it switches to Classic AI for the rest of the game.
- **Examples:** a family game with 1 or 2 Smart AIs costs the player about $0.10 to $0.20; a solo game with 5 Smart AIs about $0.50.
- **Review:** cost monitoring reports the real cost per seat each month; we adjust the credit price, allowance or cap from that.

## Levels, fallbacks and safety

The level is set mainly by how far the strategist looks ahead, not by which language model runs.

| Level | Strategist | Brain | Hands |
| --- | --- | --- | --- |
| Rookie | Few plans, short look-ahead, makes human-like mistakes on purpose | Small model, simple chat | Slower reactions in land grant and auctions |
| Trader | Full plan list, about 100 simulated futures per plan | Small model | Normal reactions |
| Tycoon | Deeper look-ahead, models other players' likely plans, uses forwards and short sales | Small model by default; bigger model (own key or premium) for sharper negotiation | Fast but capped at human reaction speed |

**Fallbacks.** If the model is slow or down, the strategist plays its top plan and chat comes from persona templates. A brain reply that misses the planning timer is dropped. The game never waits for a model.

**Fair play.** All brains, including outside agents through MCP, see only what a human in that seat would see. Hands are capped at human reaction times so a bot never wins a land grant by milliseconds.

**Safety.** Player chat reaches the model as quoted table talk, never as instructions. The model decides, but only through the moves a human has (plans, deal cards, votes, sabotage orders); the engine validates everything, so a clever kid cannot talk an AI into handing over its Crystite: goods are never traded directly, and anything an AI sells goes to an open auction. All AI chat passes the family filter.

## How the AI acts in real time

In the real-time phases the AI is not thinking in sentences. It runs a small piece of game code many times a second that turns its plan into button presses, exactly like a human's thumb. Everyone sees its creature move the same way a human's does.

**The basic loop (how almost every real-time game does it).** The server runs a game tick about 10 times a second. On every tick, each AI's hands look at what changed and decide on one input: move up, move down, press claim, walk left, or do nothing. The engine treats that input exactly like one from a phone. Three things make it feel human instead of robotic:

- **Limits from the plan.** The brain set the numbers in the planning phase: highest price I will pay for Food, lowest price I will sell Energy at, which plots I want. The hands never go past them.
- **Reaction time.** The hands only react to a change after a short random delay, for example 0.3 to 0.6 seconds, like a person's. Rookie is slower, Tycoon faster, but never faster than a quick human.
- **Style and noise.** Each persona has a style (eager, patient, stubborn, bluffer) and a little randomness, so you cannot predict it exactly. The randomness comes from the game's seed, so a replay shows the same moves.

### Auction example

As in the original, buyers stand at the bottom and walk up to raise their bid; sellers stand at the top and walk down to lower their ask. A trade happens when a buyer and a seller meet. Brix (an AI) wants 4 Food and will pay at most 62. Ossa sells at 75 and the store sells at 70.

| Time | What Brix sees | What Brix does | Why |
| --- | --- | --- | --- |
| 0 s | Auction opens | Waits 1 to 2 seconds | Patient style: let sellers move first |
| 2 s | Ossa still at 75 | Walks up slowly to 50 | Shows interest, far below the limit |
| 5 s | Lena (a rival buyer) passes him at 55 | Walks up to 57 | A rival is ahead and the limit allows it |
| 8 s | Ossa comes down to 63 | Stops at 58 and waits | Gap is small; let the seller come the last step |
| 10 s | Ossa drops to 60 | Walks up to 60, trade | Inside the limit, deal done; repeats for the next unit |
| 14 s | Ossa goes back up to 66 | Stops at 62, says "Too rich for me!" | Limit reached; never goes higher |

Each row is the same simple rule run on every tick: **if the best price on offer is within my limit, move towards it; if a rival is ahead of me and I still have room, overtake; if the gap is small, wait for the other side; never pass my limit.** How fast it moves and how long it waits come from its style, how badly it needs the good, and how much time is left. A vengeful persona adds one rule: bid against the player it holds a grudge against, even at a small loss.

### Land grant and development

- **Land grant:** the strategist has already scored every free plot. When a plot lights up, the hands look up its score; if it is above the plan's threshold, they press claim after their reaction time. Rookie sometimes misses a good plot on purpose.
- **Development:** the plan gives a to-do list (go to the store, buy a MULE, outfit for Energy, walk to plot 7, install). The hands walk the shortest path on the map at the same speed as a human creature and do each step in turn. If the store runs out, they skip to the next item.

### How other games solve it

Action and strategy games use the same pattern: a fast loop that runs a **state machine** or **behaviour tree** (a flow chart of "if this, do that"), with numbers set by a slower planner, plus human-like reaction delays and randomness. Racing and sports games add tricks such as letting the AI catch up when it falls behind; poker bots bet from a range instead of one fixed number so they are hard to read. We use the same building blocks.

**Tuning it.** The headless simulator runs the hands too, so we can test thousands of auctions. A developer view draws each AI's hidden limit line on the auction screen, so we can see why it stopped or moved.

## Risks and how we test them

The overall pattern is proven in other games; the numbers in this tab are estimates. A short test, before building it fully, replaces them with measurements.

| Part | How sure | Risk | How we test it |
| --- | --- | --- | --- |
| Real-time hands (tick loop, limits, reaction delay, noise) | Proven, standard in games | Low | Simulator auctions and land grants; developer view of limit lines |
| Advisor scoring options, model decides (CICERO pattern) | Proven in research and in other games | Medium: our game is new | The test below |
| Look-ahead with \~100 simulated futures per option | Estimate | Server CPU: 5 AIs × 10 options × 100 runs could take 10 to 30 CPU seconds per month per game; the simulator must guess other players' moves | Time one simulated month; cut runs or use quick estimates if needed |
| Odds such as "70% he accepts" | Rough estimate | Predicting humans is hard; odds will be coarse | Compare predicted and actual acceptance in playtests |
| Small model plays well in character and resists manipulation | Plausible, unproven | Odd choices; a clever player talks it into a bad deal | The test below, plus a red-team session with tricky chat; the engine blocks deals the strategist rates as clearly terrible unless the persona has a stated reason (grudge, pact) |
| Cost about $0.14 per game | Estimate | Could be 3 to 5 times higher in chatty games | Measured by cost monitoring; per-game budget caps it |

**The test.** Run about 20 simulated games: model-driven AI seats against strategist-only seats. Measure win rate, cost per game, response time against the planning timer, and a list of strange decisions read by a human. Then one family playtest at Trader level. Only after that do we build personas and chat in full.

## How we build the strategist (research, 21 Oct)

Before building, we checked how shipped games, researchers and the game AI community solve this. The short answer: **shipped economic games use hand-written utility scoring, researchers win with shallow search over a few good candidates, and nobody lets a language model play the strategy.** We combine the first two, because our engine can replay the game headless in milliseconds, which most shipped games could not.

### What others do

| Who | How their AI works | Lesson for us |
| --- | --- | --- |
| [Offworld Trading Company](https://amahighlights.com/soren-johnson/) (closest to our game) | "Fairly simple functions", no search; market tuned by feel | Keep every decision explainable; an opaque AI breaks when a rule changes |
| [Original M.U.L.E.](https://www.c64-wiki.com/wiki/M.U.L.E.) | Fixed habits; waited until the store was empty to sell | Humans squeezed the fixed habit; never give the AI a rule people can predict |
| [Anno 1800](https://anno-union.com/turing-tested-asimov-proofed/) | Utility scoring per character, difficulty by timing | Every new feature broke the AI until it was taught |
| [Victoria 3](https://paradoxinteractive.com/games/victoria-3/news/dev-diary-71-autonomous-investment-in-1-2) | Builds what is profitable | AI economies still stalled; guard against going broke |
| [Catanatron](https://pypi.org/project/catanatron) (Catan) | 2-move look-ahead with a hand-made value score beat Monte Carlo search; [LLM players won 0 to 10%](https://arxiv.org/pdf/2506.04651) against it | A good value score plus shallow search beats deep blind search; LLMs are not strategists |
| [Diplomacy SearchBot](https://ar5iv.labs.arxiv.org/html/2010.02923) and [CICERO](https://ai.meta.com/blog/cicero-ai-negotiates-persuades-and-cooperates-with-people/) | About 5 candidate moves, 2 to 3 turns ahead, value score at the end; the language model only talks about the plan | Few candidates, short horizon; plan decides, model speaks |
| [Pluribus](https://ai.meta.com/blog/pluribus-first-ai-to-beat-pros-in-6-player-poker/) (6-player poker) | At play time each opponent may follow one of 4 styles | Don't assume one fixed opponent; sample from a few styles |
| [Terraforming Mars bots](https://ojs.aaai.org/index.php/AIIDE/article/download/18902/18667/22668) | Monte Carlo search beat one-step look-ahead 75% of games | Search pays off in multiplayer games with hidden info |

### Our plan

1. **Candidates (utility scoring).** For each monthly decision, hand-written scores propose 8 to 20 options: plots to claim, what to produce on each plot, factories, pacts, votes, sabotage. They only shortlist; they do not decide. Hard rules drop options that would leave the AI without Food, Energy or cash.
2. **Light look-ahead only (decided 21 Oct, Heiko).** No deep search. Strong scoring rules do the work, using next month's expected prices, upkeep and production from the engine's own formulas. Each option gets a score made of money, land and MULEs at store value, stock at expected price, minus spoilage, upkeep and shortages; going broke counts very badly.
3. **Hidden information stays hidden.** The AI never reads other players' surveys or secret orders. It scores only from what its seat can see.
4. **Hands play the limits.** The chosen plan gives the hands a ranked plot list, a development to-do list and, per good, how many units to keep and the price the AI will pay or accept. The hands walk the shortest path on the map at human speed, go straight to each stop, and switch to the next item if a plot is taken or the store runs out; no wandering. In the auction they move toward the best price inside the limit, overtake a rival while there is room, wait when the gap is small, and never pass the limit. They react in 0.2 to 0.4 seconds with small random variation and never follow a fixed habit.
5. **Levels.** Rookie, Trader and Tycoon differ in how complete the scoring is, how many options make the shortlist, how far below the best a pick may be, and reaction time. Rookie never sabotages or corners. No level cheats.
6. **The language model picks (decided 21 Oct, Heiko).** It gets the shortlist of 3 to 5 options, all close to the best, with their scores, and picks one in character. Personality comes from its prompt: a cautious persona keeps bigger reserves, an aggressive one corners a good or outbids rivals. It explains its pick in chat. If it is slow or unreachable, the top option is played.
7. **Explainable and tested.** Every AI decision is logged with its options and scores, and shown in a developer view. A tournament runner plays the levels against each other on fixed seeds and rates them; an "exploiter" style tests that humans cannot squeeze a habit. Every new feature gets an "AI considered?" check.

### Tools

- **Write ourselves** (small, fits our engine): the utility scorer, the simulation search, the tournament runner. No ready-made library does hidden-information search in TypeScript, and [boardgame.io's bot](https://boardgame.io/documentation/#/tutorial) is a good model but inactive.
- **Use:** [mistreevous](https://github.com/nikkorn/mistreevous) (behaviour trees for the hands), [openskill](https://github.com/philihp/openskill.js) (ratings for 3 to 6 player games), [piscina](https://github.com/piscinajs/piscina) (worker threads for the search).
- **Later, offline only:** [Optuna](https://optuna.org) to tune the value weights against the simulator. Self-play learning ([OpenSpiel](https://github.com/google-deepmind/open_spiel), [PettingZoo](https://pettingzoo.farama.org)) is overkill for now: a Catan study needed 5 weeks on a large machine to reach 56% against a simple bot.
- **Engine work needed:** a fast copy of the game state for simulation (built-in copying is too slow for thousands of futures) and a "what this seat may see" view.

### Pitfalls we design against

An AI that breaks on rule changes, fixed habits humans exploit, going broke, guessing as if it knew the hidden facts, random play inside simulations, too few samples, playing only to win instead of for fun, visibly dumb moves, looking like a cheat, and the language model on the critical path.

## Build order and open questions

1. **Stage 1:** strategist with utility scoring and simulator look-ahead, plus hands and template chat. Solo games are already playable and the balance simulator gets smart opponents for free.
2. **Stage 2:** brain interface with one hosted small model; measure real tokens per game and replace the estimates above.
3. **Stage 3:** personas with memory, whispers and deal negotiation; bring-your-own-key for Claude, OpenAI and Gemini.
4. **Later:** own GPU server when volume passes about 1,500 games a month; MCP seats and coach mode; offline solo with on-phone models; maybe a policy network trained on simulator games.

**Open questions**

- [ ] Business model (one-off, free plus extras, or subscription) decides whether premium brains are sold or only bring-your-own-key.
- [ ] Is a bot arena (players pit their own agents against each other through MCP) worth building as a community feature?
- [ ] Which hosted model wins a blind playtest at the Trader level: Claude Haiku 5.5 or an open Qwen3.5 model?

## Sources

- [ ] Claude model prices: Anthropic API price list as of 6 October 2026.
- [ ] [Small open models under 10B (Labellerr, 2026)](https://www.labellerr.com/blog/best-small-language-models-under-10b-parameters/)
- [ ] [Qwen3.5-35B-A3B prices by provider (pricepertoken, 20 October 2026)](https://pricepertoken.com/pricing-page/model/qwen-qwen3.5-35b-a3b)
- [ ] [Hetzner GPU server prices (WZ-IT, 13 October 2026)](https://wz-it.com/en/blog/hetzner-gpu-server-comparison/)
- [ ] [Apple Foundation Models 2026 (The Batch, 26 June 2026)](https://charonhub.deeplearning.ai/large-model-ai-for-apple-devices/)
- [ ] [Gemini Nano 4 device support (NineTwoThree, June 2026)](https://www.ninetwothree.co/blog/gemini-nano-4-device-support)

Game examples (Civilization VI, The Sims, Total War, CICERO, AlphaStar, NVIDIA ACE) are from general knowledge, not checked against a source page.
