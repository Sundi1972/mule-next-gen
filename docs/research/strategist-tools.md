# AI opponents for M.U.L.E. Next Gen: tools and libraries

Researched 2026-10-21. Versions come from npm, PyPI and CDN listings; a dash means the source did not show it. Verdicts assume our setting: a pure, seeded TypeScript engine, 2–6 players, hidden information and chance, real-time phases, and a small team.

## Summary

Write a small search layer of our own in `packages/ai`, built on the engine's own `step`/`clone`. Add three dependencies for phase logic, rating and parallelism (mistreevous, openskill, piscina). Keep Python for offline tuning only (Optuna). Skip self-play RL for now. Published results on board games favour short-horizon forward search with tuned heuristics at our scale. RL has matched heuristic bots only after weeks of GPU time, and only on simplified rules (details below).

## 1. TypeScript/JavaScript game-AI libraries

| Tool | Licence / status | What it gives us | Verdict |
|---|---|---|---|
| **boardgame.io `ai`** (MCTSBot, RandomBot) [cdnjs](https://cdnjs.com/libraries/boardgame-io) | MIT; last release 0.50.2, little activity since | MCTS over the game's reducer. `enumerate()` lists the legal moves and `objectives()` gives weighted checker functions that score playouts. `iterations` and `playoutDepth` can be numbers or per-turn functions ([#472](https://github.com/boardgameio/boardgame.io/issues/472)). The playouts read the real state, so the bot sees hidden information. It is tied to boardgame.io's `G`/`ctx` model. | **Skip the library, copy the idea.** Use enumerate plus objective-weighted, depth-limited playouts. A Catan project is removing its boardgame.io/ai dependency in favour of "a Catan-owned search stack" so it can get seeded determinism and reuse the search outside the bots ([#471](https://github.com/g1ddy/catan-hex-mastery/issues/471)). |
| **multimcts** [socket.dev](https://socket.dev/npm/package/multimcts) | Licence not shown; 2.2.1, about 6 months old | Typed `GameState` base class, MCTS for 3 or more teams, tree reuse, custom evaluators, rollout hooks and an arena tool | **Maybe.** Read it as a reference, or vendor it if the licence allows. It has no ISMCTS and no simultaneous moves. |
| Other npm MCTS packages (`js-mcts` and similar) | Mostly 0.0.x and abandoned | None | **Skip** |
| **ISMCTS, written ourselves** | — | Determinize the hidden information (opponent goods, future events, auction intentions) from the seeded RNG, then run MCTS or flat Monte Carlo on each sample. About 300 lines on top of our engine. Prior art exists elsewhere: a Python ISMCTS package ([mittmcts](https://github.com/dbravender/mittmcts)) and a Rust crate ([ismcts](https://lib.rs/crates/ismcts)). | **Use (build it)** |
| **mistreevous** [npm](https://www.npmjs.com/package/mistreevous) | MIT; 4.3.1, written in TypeScript | Behaviour trees defined in JSON or a small DSL (MDSL), checked with `validateDefinition`. It supports async actions and `while`/`until` guards that abort running branches. That fits a "hand" that walks to a plot and gives up when the plot is taken or the timer runs out. | **Use** for the real-time phase controllers |
| **behaviortree** (Calamari) [npm](https://www.npmjs.com/package/behaviortree) | MIT; 3.0.0, rewritten in TypeScript, quiet | A minimal behaviour-tree library | **Skip** (mistreevous is richer) |
| **Yuka** [npm](https://npmjs.com/package/yuka) | MIT; 0.7.8; last push Feb 2025 ([ecosyste.ms](https://awesome.ecosyste.ms/projects/mugen87.github.io%2Fyuka%2F)) | Steering behaviours, A*, navmesh, goal-driven agents, fuzzy logic and perception | **Skip for the engine.** It is mutable, uses wall-clock time and is OO-heavy. Its fuzzy logic and A* are easier to write in 100 lines. Optionally use it on the client for walk animation. |
| **GamePlan-HTN** [npm](https://www.npmjs.com/package/gameplan-htn) | Licence not shown; a JavaScript port of FluidHTN | HTN planner | **Skip.** Our decisions are about valuing options, not sequencing plans. |
| GOAP / utility-AI npm packages | Small hobby packages | None | **Skip. Write the utility scorer ourselves.** It is a weighted sum of response curves over features, with weights kept in `config.ts`-style personality files. |

## 2. Training and evaluation frameworks (Python)

| Tool | Licence / status | Fit |
|---|---|---|
| **OpenSpiel** [depscope](https://depscope.dev/pkg/pypi/open_spiel) | Apache-2.0; 1.6.12 (2026) | Has ISMCTS, CFR and AlphaZero. The core is C++, with games also writable in Python. Wrapping a TypeScript engine is awkward, and its algorithms assume turn-based play. **Skip, but read its ISMCTS code** for design. Game Reasoning Arena builds LLM agents on top of it ([arXiv 2508.03368](https://arxiv.org/pdf/2508.03368)). |
| **PettingZoo** (AEC API) | MIT; 1.24.0 is the latest release on its release-notes page (Aug 2023) | The standard multi-agent environment interface. It is the right shape if we ever train: one player acts per step. **Maybe (later).** |
| **Gymnasium** | MIT; active | A single-agent interface. Use it only if we train one seat against fixed bots. **Maybe (later).** |
| **Stable-Baselines3** [releasealert](https://releasealert.dev/pypi/stable-baselines3) | MIT; 2.9.0 (Jun 2026) | Reliable PPO and MaskablePPO (in sb3-contrib), but single-agent. **Maybe**, if we train one seat. |
| **CleanRL** [ossinsight](https://ossinsight.io/analyze/vwxyzjn/cleanrl) | Licence listed as "other" (I did not check it); about 9.6k stars | Single-file PPO that is easy to adapt to self-play. **Maybe.** |
| **RLlib** | Apache-2.0; active | Multi-agent and external-environment support, but heavy to operate for a small team. **Skip.** |
| **Unity ML-Agents** | Apache-2.0 | Tied to Unity. **Skip.** |
| **TextArena** [sourcepulse](https://www.sourcepulse.org/projects/2126377) | Licence unclear; over 100 games | A Gym-style setup with text observations and text actions for LLM agents. **Skip** (useful only as a pattern). |

**Bridge, if we ever need one:** a Node subprocess that speaks JSON lines over stdin/stdout. It handles `reset(seed)`, `step(action)`, `legal_actions` and `observe(player)`, and a Python `pettingzoo.AECEnv` wraps it. Batch N environments per process to hide the cost of serialisation. WASM is not worth it, because the engine is already JavaScript; compiling it with AssemblyScript or Javy only adds friction. For speed, run several Node worker processes, one per CPU core.

**Is RL realistic? Not as the first step.** Published evidence:
- **Catan self-play RL:** a 56.5% win rate against JSettlers, on 2-player Catan with no trading, after about 5 weeks on a 32-core CPU with two 1080 Ti GPUs, using a Rust engine bound into Python ([arXiv 2008.07079](https://arxiv.org/pdf/2008.07079)).
- **Catanatron** (GPL-3.0): AlphaBeta(n=2) with a hand-tuned value function is its strongest bot. It beats its MCTS(n=100) bot by a wide margin, and its README reports no RL results (its RL attempts sit in `reinforcement.py`) ([mirror](https://gitee.com/qnas/catanatron)).
- **Monopoly:** a hybrid design works best. Deep RL handles the frequent decisions and a fixed policy handles the rare ones; it beats pure deep RL by 30% ([arXiv 2103.00683](https://arxiv.org/abs/2103.00683v2)).
- **Splendor (Rinascimento):** tuned MCTS and rolling-horizon evolution won about 92% against baselines, using very short horizons (depth 2) and no opponent model. NTBEA tuned the parameters in about 1,000 games ([arXiv 1904.01883](https://arxiv.org/pdf/1904.01883)).

For a 6-player economic game with auctions and collusion, the payoff of RL is uncertain and the infrastructure cost is real. Revisit it only to learn a value function that replaces hand-written leaf evaluation. That is a supervised regression on simulator rollouts, which Python can train and ONNX can export to Node.

## 3. LLM decider ("pick an option and say why")

- **Pattern:** the strategist produces 3–6 scored options. The LLM gets the character card, a compact state summary and the options, and returns `{option_id, line}`. The engine validates `option_id` and falls back to the top-scored option on an invalid answer or a timeout. The LLM never invents moves. Game Reasoning Arena and TextArena both use "legal actions in, structured JSON action out" ([arXiv 2508.03368](https://arxiv.org/pdf/2508.03368)).
- **Anthropic TypeScript SDK (`@anthropic-ai/sdk`):** define one `choose_option` tool with `strict: true` and an enum of option ids, so the arguments always match the schema. Alternatively, use structured outputs (`output_config.format`). On current models, forced `tool_choice` (`any`/`tool`) returns a 400 error. Use `auto` plus an instruction, or structured outputs.
- **Model:** `claude-haiku-5-5` costs $0.10 per million input tokens and $0.50 per million output tokens (up to 100K-token prompts). Set effort to `low` for this route; its default is `medium`.
- **Prompt caching:** put the frozen rules, the character card and the tool definitions first, behind a `cache_control` breakpoint. The minimum cacheable prefix is 512 tokens on current models. A cache write costs 1.25x the input price with the 5-minute TTL and 2x with the 1-hour TTL; a read costs about 0.1x. A game session easily keeps a 5-minute cache warm. Check `usage.cache_read_input_tokens` to confirm hits.
- **Rough cost:** about 2k cached tokens plus 300 fresh tokens in and about 60 out comes to well under $0.0001 per decision on Haiku.
- **Latency:** I found no published benchmark for this. Small hosted models typically return a 50-token answer in well under 2 seconds. Measure it ourselves, and design so the LLM is never on the real-time path: decide during turn transitions or in advance, and play speech asynchronously.
- **OpenAI SDK:** the equivalent is strict function calling or structured outputs. Put a thin provider interface in `apps/server` so we can swap providers. LiteLLM is the Python equivalent, used by Game Reasoning Arena.
- **LLM-driven play in Catan:** Claude 3.7, with an evolving prompt, roughly doubled the victory points of a basic LLM agent. Prompt- and code-evolving agents still did not beat the AlphaBeta bot ([arXiv 2506.04651](https://arxiv.org/pdf/2506.04651v1)). This supports our split: search plays, the LLM adds flavour and chooses among good options.
- **MCP game seats:** existing examples are toys, such as chess and tic-tac-toe servers and a Unity game driven through `move`/`get_state` tools ([classmethod](https://dev.classmethod.jp/en/articles/llm-game-playing-using-mcp-server/), [mcp-chess](https://mcp.so/server/mcp-chess)). **Maybe, later**, as a "bring your own agent" seat: an MCP server in `apps/server` exposing `get_observation`, `list_options` and `act`, rate-limited and limited to turn-based phases. It is not useful for real-time phases.

## 4. Testing and tuning

| Tool | Licence / status | Use |
|---|---|---|
| **openskill** (JavaScript) [npm](https://npmjs.com/package/openskill) | MIT; 4.1.0 | Weng-Lin / Plackett-Luce ratings for 3 or more free-for-all players, with `predictWin`. Free of TrueSkill's patent and licence concerns. **Use** to rate AI levels and personalities, and later for matchmaking. |
| TrueSkill (`ts-trueskill`) | Microsoft patent concerns | **Skip**; openskill covers it |
| Elo | — | Only for 1v1 tests. **Skip** for 6-player games. |
| **Optuna** 5.0 (Sep 2026) [release notes](https://aicybr.com/blog/optuna-5-rustuna-0-1-release-guide) | MIT; active | TPE (now multivariate by default), CMA-ES, GP and multi-objective samplers. Use the ask-and-tell API, with Python calling a Node `pnpm sim` batch. The objective is the win rate or mean rank against a reference pool over K seeds. **Use** for tuning offline. |
| **cmaes** (Python) [PyPI](https://pypi.org/project/cmaes/) | MIT | A lightweight CMA-ES library that Optuna's CmaEsSampler also uses. **Maybe.** |
| **NTBEA** | Java (in the TAG framework) | A bandit-based tuner for game-AI parameters that is efficient with few samples ([Rinascimento](https://arxiv.org/pdf/1904.01883)). **Maybe:** port it to TypeScript if the Python loop is unpopular. |
| **Tournament runner (ours)** | — | A Node CLI built on `pnpm sim`. It plays round-robin seatings of bot configs over fixed seed sets, rotates seats, uses common random numbers (the same seeds for every config) and writes JSONL. **Use (build it).** |

Use fixed seeds and paired comparisons: evaluate config A and config B on identical seeds and seatings. That cuts the number of games needed several-fold, which works because the engine replays exactly from a seed.

## 5. Performance in Node

- **Cloning:** a browser micro-benchmark puts Immer `produce`, JSON round-trip and `structuredClone` within about 1.5x of each other at roughly 100–250k ops/sec ([measurethat](https://measurethat.net/Benchmarks/Show/31626/0/structuredclone-vs-immer-vs-jsonparsestringify)). That is far too slow for millions of simulated states. Rinascimento's forward model runs at 1.74 million states per second, which shows what a purpose-built simulator can do.
  - **Recommendation:** add an engine-owned `cloneForSim(state)`. Use flat typed arrays or small plain objects for the hot state (map plots, goods, money) and plain array copies. Keep the log, chat and UI state out of the simulation state.
  - Alternatively, give the engine a mutable step with undo. That is fastest, but harder to keep honest; `pnpm test` can check it against the pure reducer.
  - Immer's structural sharing helps when applying moves to the live game, but it slows rollouts.
- **Parallelism:** use **piscina** (MIT; 5.3.2 stable, 6.0 in release candidate, Aug 2026, for Node 20 and later) ([releasealert](https://releasealert.dev/github/piscinajs/piscina)).
  - Run root-parallel MCTS: each worker searches from the same state with its own seed and the visit counts are merged. Send the state once as a compact serialised snapshot or a `SharedArrayBuffer`.
  - Keep strategist workers off the main event loop of the game server.
  - Hard-cap each search by iterations and by a time budget measured on the server side. The engine stays clock-free.
- **WASM:** skip, unless profiling shows a single hot kernel such as auction-equilibrium or production maths. Rewriting the engine would break the "one engine" rule.
- **Bun or Deno:** not needed.

## 6. Recommended toolset

| Purpose | Choice |
|---|---|
| Search | Our own flat Monte Carlo, ISMCTS and depth-limited rollout search, in TypeScript |
| Phase controllers | mistreevous |
| Option scoring | Our own utility scorer |
| Parallelism | piscina |
| Ratings | openskill |
| Tuning (offline) | Optuna, plus our own tournament runner |
| LLM decider | `@anthropic-ai/sdk` with strict tools and prompt caching |
| Later, maybe | PettingZoo with a JSON-lines bridge, a learned value function exported to ONNX, an MCP seat |

## 7. Architecture sketch

```
packages/engine        pure rules; seeded RNG; step(state, action); legalActions(state, p);
                       observe(state, p) (hidden-info view); cloneForSim(state); config.ts
packages/ai            pure TypeScript, depends only on engine
  features/            state -> feature vector (net worth, goods shortfall, plot adjacency…)
  utility/             response curves + personality weight files (data, not code)
  search/              determinize(obs, rng) -> state; flatMC, ISMCTS, rolloutPolicy (cheap heuristic)
  strategist/          per decision type: enumerate options -> search -> ScoredOption[]
                       (plots, production, auction limits, votes, sabotage)
  hands/               mistreevous trees per real-time phase: consume strategist targets
                       (e.g. auction "walk to price X, back off if Y"), emit timed intents
  humanize/            reaction-time distributions (log-normal, seeded), error/hesitation models
  sim/                 headless runner, tournament CLI, JSONL results, openskill ratings
apps/server
  ai-seat/             a bot seat that looks like a client: receives observe(p), sends actions
                       through the same validated path as humans (RuleError applies)
  ai-pool/             piscina workers running strategist searches with time/iteration budgets
  llm-decider/         provider interface -> Anthropic SDK; cached system prefix; strict
                       choose_option tool; timeout -> fallback to top score; async banter
  (later) mcp-seat/    MCP server exposing observe/list_options/act for external agents
tools/tune (Python)    Optuna ask/tell -> spawns `pnpm sim --config <json> --seeds <set>`
```

### How the pieces work together

1. At each decision point, the strategist runs in a worker. It determinizes hidden information from the bot's observation, using a seed derived from the game seed and the bot id, so replays stay deterministic. It then scores each option by rollouts and returns ranked options with feature explanations.
2. **Turn-based choices:**
   - The easy and normal levels take the top option, plus personality noise.
   - The "character" level passes the top-k options to the LLM decider, which picks one and returns a line of dialogue.
3. **Real-time phases:** the strategist sets targets ahead of time, such as an auction reservation price or a ranked list of plots. The hand's behaviour tree carries them out on server ticks with sampled human reaction delays. A cheap reactive replan runs only when the state changes materially.
4. **Determinism:** bots never read wall-clock time or `Math.random()`. The server owns time budgets, and a bot's actions enter the action log like a human's, so games still replay from the seed plus the actions. Search results that depend on time budgets get logged as actions, not recomputed during replay.
5. **Tuning:** personality weights and search budgets live in data files. Optuna and the tournament runner tune them against a fixed pool. openskill ratings label the difficulty levels, and `pnpm sim` serves as the balancing and regression gate.
