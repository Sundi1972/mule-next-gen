# AI opponents for an M.U.L.E. successor: research on best practice

Researched 2026-10-21. Where a source only partly confirms a claim, the claim is marked *(unverified)*.

## 1. Shipped economic and strategy games

**Original M.U.L.E. (1983).** Computer players fill empty seats and always play the Mechtron. On Tournament they get $200 more than humans, which is the only handicap. They favour Smithore, move to Crystite only on good tiles, and switch to food or energy when undersupplied. Humans exploited two habits. The AI waited to sell until the store was empty, so humans could buy the store dry and set prices. Two humans could also collude to shut the AI out of trading. Reviewers called the computer opponents "too weak." Copy the habit of producing whatever is short. Avoid a fixed selling rule that humans can predict and squeeze. Source: https://www.c64-wiki.com/wiki/M.U.L.E. , https://en.wikipedia.org/wiki/M.U.L.E.
None of the public pages describe the AI in Planet M.U.L.E., M.U.L.E. Returns or M.U.L.E. Online. The Planet M.U.L.E. and M.U.L.E. Online pages were checked; nothing was found for M.U.L.E. Returns.

**Offworld Trading Company (Soren Johnson, Mohawk).** This is the closest shipped analogue to our game.
- Architecture: "fairly simple functions" that decide from the current game state, with no search and not even A*. Johnson says Offworld was "a LOT easier to write AI for than Civ because there are no units to control," and that "the best way to make good AI is to keep it in mind when designing the game itself." He wrote all the game and AI code himself. (https://amahighlights.com/soren-johnson/ , https://bestofama.com/amas/4hhdk6)
- Why it stays hand-written: he would rather have an AI that plays badly for a reason he understands than an opaque one that "could suddenly stop working once you make a small rule change." He also says "it is not enough for the AI to perform well… [you must] understand WHY," so you can tune it. (same AMA)
- Market: "fairly simple." Buying raises the price and selling lowers it, and moves are damped so low prices get harder to push lower. The tuning was "done by feel." (AMA)
- Eliminated players become subsidiaries run by a cut-down AI that "focuses solely on making money" and skips sabotage, patents, auctions and stocks. This is a useful template for an Easy tier. (https://www.designer-notes.com/2016/05/)
- Difficulty: on the top level, Guru, "plenty of people in our community can win… but I doubt anyone (including me) on the team can." Players still asked why the AI does not get the handicap they get (https://www.stardock.com/games/article/462513/ai-difficulty-or-same-ai-with-personal-handicap). Steam threads accuse the AI of "cheat[ing] in every way conceivable," and other players reply "There is no cheating" (https://steamcommunity.com/app/271240/discussions/0/618453594760744927/). Even an honest, fast AI gets accused of cheating, so make its reasoning visible.

**Civilization IV / Old World (Johnson).** The AI deliberately plays below its best: it limits city spam and rarely rushes, because rushing "would also be a bad experience." Higher difficulties need "an artificial advantage"; in Old World the AI starts with established cities. A Competitive AI option is "for players who accept an AI that tries to win." AI attitudes are shown as a simple, visible enum with "transparent inputs that make intuitive sense," which Johnson prefers to opaque emotional AI (https://franklantz.substack.com/p/ai-games-and-civilization). His GDC 2008 talk "Playing to Lose" frames Civ's AI as sitting between "good" and "fun" (https://www.designer-notes.com/playing-to-lose-ai-and-civilization-gdc-2008/). Johnson set Deity "beyond a point that any of us could play," and added: "there is just no way to write a good AI without the reality of the players being involved" (AMA).

**Anno 1800.** AI rivals are characters with fixed strategies (culture, fleet, defence, industry). Building placement is a location-scoring utility over criteria such as warehouse coverage, nearness to related production and distance from homes. When an island is crowded the AI accepts "acceptable" spots. Difficulty comes from timing: hard AIs use new materials at once, easy ones hesitate, and settling speed is a parameter. The lesson the team stresses is that every new feature (fires, rivers and bridges, quests) breaks the AI until someone teaches it. (https://anno-union.com/turing-tested-asimov-proofed/)

**Victoria 3.** AI investment is a construction AI that "prioritizes the creation of profitable buildings," plus strategic terms such as railways where infrastructure is low. The developers still reported AI economies stalling when the workforce ran out late in the game, and countries underperforming after wars. (https://paradoxinteractive.com/games/victoria-3/news/dev-diary-71-autonomous-investment-in-1-2)

**Capitalism Lab.** Rival firms follow archetypes, for example a property developer who buys cheap rural land. Some archetypes only appear when starting capital is high, so the archetype mix itself works as a difficulty and variety lever. (https://www.capitalismlab.com/?p=429)

I found no primary sources on the AI of Settlers, Railroad Tycoon or Monopoly.

**Takeaway.** Every shipped economic game I found uses hand-written utility scoring with personalities, and none uses search. Their recurring problems are AI that stalls or goes broke when the economy shifts (Victoria 3), AI that breaks with each new feature (Anno), predictable selling that humans exploit (M.U.L.E.), and players who suspect cheating (Offworld). Our headless, deterministic engine makes simulation-based search cheap, and search adapts to rule changes automatically. That answers Johnson's brittleness concern, provided we keep the decisions explainable.

## 2. Academic and competition work

**Catan.**
- SmartSettlers (Szita, Chaslot, Spronck 2010) used MCTS with strong domain priors: settlement moves were made 10,000 times more likely in rollouts. Player trading was disabled, and the bot won 49% of 3-player games against other bots *(figure from a secondary summary, unverified)*. A skilled human could still beat it consistently. Trading is the hard part, and the papers removed it. (https://sciworthy.com/can-a-computer-learn-to-play-settlers-of-catan/ , https://repository.tilburguniversity.edu/items/89e7a75c-5229-44cc-b88c-adf3f88ce002)
- Catanatron: the strongest bot is depth-2 AlphaBeta over a hand-made value function. It beat the MCTS (n=100) and greedy-playout bots on the project's leaderboard. A good value function with shallow search beat deeper but blinder search. (https://pypi.org/project/catanatron)
- LLM agents in Catan (2025) won 0–10% against that AlphaBeta bot, even with prompt or code evolution. LLMs are not strategists. (https://arxiv.org/pdf/2506.04651)

**Hidden information: ISMCTS and determinization.**
ISMCTS (Cowling, Powley, Whitehouse 2012) builds its tree over information sets instead of states. It samples one determinization (a guess at the hidden facts) per iteration and shares statistics across them. This avoids two failures of plain determinization: strategy fusion, where the AI assumes it can play differently in worlds it cannot tell apart, and wasted effort from solving each guess separately. (https://eprints.whiterose.ac.uk/75048/)
For us, the hidden information is opponents' geo surveys, planned sabotage and production plans. That makes determinization sampling a natural fit.

**Search in multiplayer tabletop games (TAG, Queen Mary University of London).**
- In Terraforming Mars, 2–5 players, with hidden information and stochastic events, MCTS beat one-step look-ahead 75% of the time head-to-head. Settings were rollout depth 10 and a budget of 1,000 forward-model calls. The heuristic was "points if the game ended now." (https://ojs.aaai.org/index.php/AIIDE/article/download/18902/18667/22668)
- Opponent modelling (Goodman & Lucas 2020): nearly any opponent model, even an inaccurate one, helped MCTS. RHEA was badly hurt by wrong models. Modelling opponents "in-tree" is "much more robust." (https://arxiv.org/pdf/2006.08659)
- RHEA (rolling-horizon evolution) is strong under tight real-time budgets but needs heavy parameter tuning. (https://arxiv.org/pdf/1704.07075 , https://www.microsoft.com/en-us/research/?p=954033)

**MCTS pitfalls in strategy games (Roelofs, Game AI Pro 3, ch. 28; Berlin and Xenonauts 2).**
- Split compound moves hierarchically.
- Prune obvious sub-decisions with heuristics, but keep them discoverable.
- Expand one child at a time, in heuristic order.
- Use an epsilon-greedy portfolio of rollout policies, not random rollouts.
- Run rollouts on a cheaper abstract model than the full rules.
- Penalise losses heavily or rescale values so differences between actions show.
- Require about 20 visits before trusting a child.
- In multiplayer, model only the strongest opponent (best-reply search).
(http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter28_Pitfalls_and_Solutions_When_Using_Monte_Carlo_Tree_Search_for_Strategy_and_Tactical_Games.pdf)

**Diplomacy.**
- No-press SearchBot (Gray et al., ICLR 2021) works in three steps. It samples about 5 candidate orders per unit from a human-imitation policy. It runs regret matching over those candidates for all 7 players. It then rolls out 2–3 phases and scores the result with a value net; gains flattened beyond 3–4 phases. Even 2 candidates beat the pure policy, and search made it much harder for experts to exploit. Lessons: a small candidate set, a short horizon, a value function at the leaf, and an equilibrium-style treatment of opponents. (https://ar5iv.labs.arxiv.org/html/2010.02923)
- CICERO (Meta 2022): a planner predicts every player's moves and picks intents. A 2.7B dialogue model is conditioned on those intents. Filters reject candidate messages that are nonsensical, of low value or inconsistent with the intents. Planning uses piKL, which maximises expected value while staying close to a human-like policy. Supervised learning alone was "highly exploitable," and self-play alone fails in cooperative games. (https://ai.meta.com/blog/cicero-ai-negotiates-persuades-and-cooperates-with-people/)

**Poker: Pluribus, 6 players.**
- Offline: a blueprint strategy from Monte Carlo CFR self-play, about 8 days on 64 cores, under $150.
- At play time: 2 CPUs, depth-limited search.
- At the search leaves, each opponent may switch among 4 continuation strategies: the blueprint, plus versions biased to fold, call or raise. This stops the bot assuming one fixed opponent policy.
- Nash equilibrium is not meaningful with 3 or more players, so the target was empirical strength.
(https://ai.meta.com/blog/pluribus-first-ai-to-beat-pros-in-6-player-poker/)

**AI Economist (Salesforce).** Two-level reinforcement learning: agents learn in an economy while a planner learns tax policy. It is useful as a sim-to-balance tool, but it is far too expensive and opaque for in-game opponents. (https://arxiv.org/pdf/2108.02755)

**Summary for 2–6 players with a stochastic economy and partly hidden information.** What works is shallow search over a small candidate set, with sampled hidden state, a portfolio of opponent policies, and a strong evaluation function at a short horizon. Deep trees and pure learning are not needed.

## 3. Utility AI and human-feeling AI (Game AI Pro, GDC)

- **Dual-utility reasoning (Kevin Dill, Game AI Pro 2, ch. 3).** Each option has a rank (category) and a weight. Keep only the top rank, drop weights below a fraction of the best, then pick at random in proportion to weight. The AI varies without looking stupid. Shipped in Zoo Tycoon 2. (http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter03_Dual-Utility_Reasoning.pdf)
- **Infinite Axis Utility System (Dave Mark).** Considerations pass through response curves and are multiplied together, all data-driven. Talks at the GDC AI Summit in 2013 and 2015. (https://gameai.com/iaus.php , http://www.gdcvault.com/play/1018040/Architecture-Tricks-Managing-Behaviors-in)
- Also see Mike Lewis, "Choosing Effective Utility-Based Considerations" (Game AI Pro 3, ch. 13).
- **Reaction time (Steve Rabin, Game AI Pro 2, ch. 5).** About 0.2 s for a simple reaction and about 0.4 s for a choice (go/no-go). Add time for weak stimuli and complex choices, plus occasional longer, variable lapses. (http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter05_Agent_Reaction_Time_How_Fast_Should_An_AI_React.pdf)
- **Player perception (Wetzel & Anderson, Game AI Pro 3, ch. 4).**
  - Perceived difficulty correlated 0.81 with perceived realism, and the MCTS bot felt the most "realistic."
  - Players did not detect "hustling" (easing off when far ahead).
  - Players accused AIs that did not cheat of cheating.
  - Obvious blunders hurt credibility more than losses do.
  - Players rarely recognise strategy unless the AI voices its intent.
  (http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf)

## 4. Language-model and planner hybrids (2022–2026)

- **CICERO** (above): the planner decides and the language model talks about the plan. Its filters checked consistency with intents, and contradictions still slipped through.
- **PUBG Ally (KRAFTON with NVIDIA ACE, 2025).** A 2B Mistral-NeMo-Minitron, quantised to run on the player's machine and fit beside the game in 8 GB of VRAM. A behaviour tree runs reflexes at tick rate: "Reflex-level actions never have to wait for the model." The model reads state only through tools and is triggered by events. Prompts are structured for KV-cache reuse. Cloud hosting was too slow. A closed world (one map, one mode) kept the problem tractable. (https://developer.nvidia.com/blog/how-krafton-built-pubg-ally-a-co-playable-character-powered-by-nvidia-ace/)
- **Generative Agents.** The original town cost "thousands of dollars"; a 25-agent run took about 25M tokens. "Affordable Generative Agents" cut that to 31–43% by caching plans (reused when embedding similarity is at least 0.97) and compressing memory from about 2,000 tokens to about 100. (https://arxiv.org/html/2402.02053v2)
- **Voyager (Minecraft, GPT-4).** The language model writes reusable code skills into a library. That suits open worlds, not adversarial economic play. (https://arxiv.org/abs/2305.16291v2)
- **AI Diplomacy (Good Start Labs and Every, 2025).** Eighteen frontier models played Diplomacy against each other. o3 schemed and betrayed, Claude often chose peace over winning, and DeepSeek R1 sent threats. Persona and behaviour vary a lot by model, so pin the model and evaluate it. (https://every.to/diplomacy)
- **Lesson.** In every shipped or credible system, the language model chooses or explains, while code computes values and runs anything time-critical. Cost is controlled by event-triggered calls, small local models, stable prompt prefixes and caching. Never put the model on the real-time path.

## 5. Recommended architecture for the strategist

**A. Candidate generation (utility AI).** At each planning decision, enumerate 8–20 macro-options with hand-written utility considerations in IAUS style:
- which plot to claim, with the full ranked list kept for the real-time grant;
- which good to produce on each plot, with targets per good;
- factory, pact and vote choices;
- whether to sabotage, and whom.

Utility here only prunes and orders. It does not decide.

**B. Evaluation: flat Monte Carlo over determinizations, not a deep tree.** Most planning choices are effectively one-shot per month, so use a flat bandit (UCB1 or successive halving) over the candidates. This is the SearchBot and Catanatron lesson: few candidates, short rollouts, a good leaf value.
- Each simulation does three things:
  1. Sample a determinization of hidden facts: opponents' survey results drawn from a belief over plots, pending sabotage, the event deck or RNG stream.
  2. Assign each opponent a policy from a portfolio of 3–4 styles, in the spirit of Pluribus's continuation strategies, for example balanced, hoarder or speculator, cornerer, and saboteur.
  3. Fast-forward H months, then score.
- Use common random numbers: give every candidate the same set of seeds, so the comparison measures the decision rather than the dice. This sharply cuts the number of rollouts needed.
- Use ISMCTS (single-observer, with sampled determinizations) only where choices chain within a month, such as plot, then good, then outfitting. In practice a hierarchical split with heuristic completion of the rest of the move is enough (Roelofs).

**C. Horizon and leaf value.**
- Roll out H = 2–3 months, then apply a value function: cash, plus land and MULEs valued at the store price, plus inventory at the expected next clearing price, minus expected spoilage, upkeep and food or energy shortfall penalties, plus colony-score terms.
- In the last 3 months, roll out to the end of the game and score the final rank or score margin. Penalise losing or going bankrupt heavily (Roelofs).
- The value function decides how strong the AI is (Catanatron). Fit its weights offline with `pnpm sim` self-play, and run regression tests of each new version against older ones.

**D. Rollout model (keeping CPU low).**
- Do not simulate real-time phases frame by frame inside rollouts. Replace them with abstract resolvers:
  - Land grant: order players by a skill-weighted lottery.
  - Development: deterministic install, with a small failure rate.
  - Auction: clear supply against demand at a price given by each player's reservation curve.
- Clone the engine once per simulation and run rollout policies as cheap utility functions.
- Budget roughly 200–2,000 rollouts per decision per AI, run on a worker while humans plan. The search is anytime: return the best so far when the phase timer ends.
- Reuse the previous month's beliefs and best plan as a warm start, like RHEA's shift buffer.

**E. Other players' unknown plans.**
- Keep a per-opponent belief: a probability over style labels, updated from observed production, buying and voting, plus a belief over which plots each opponent surveyed.
- Sample from these beliefs in each rollout. Mixing styles keeps the AI robust when the model is wrong; per Goodman & Lucas, MCTS-style search tolerates an inaccurate model.
- Never read the true hidden state. Players accuse even honest AIs of cheating; an AI that really cheats is a lasting reputation risk.

**F. Hands (real-time phases).**
- The strategist hands down limits, never moves: a ranked plot list with a value for each plot, and per-good reservation buy and sell prices with target quantities.
- Derive reservation prices from simulation: the change in value from plus or minus k units, which gives a demand curve.
- Hands execute these with human timing: 0.2–0.4 s reactions, attention lapses, and limited path precision.
- In auctions, add randomness to when the hand starts walking and to price targets within a band. Never use a fixed rule like the original "wait until the store is empty." Watch for humans cornering a good, and buy defensively when the simulated value of the corner is high.

**G. Difficulty tiers (honest information at every tier).**
- Search budget and number of determinizations.
- Opponent-model quality: Easy uses one generic style, Hard uses learned beliefs.
- Value-function completeness: Easy ignores spoilage, events and corners.
- Choice noise: dual-utility selection among candidates within X% of the best, with X shrinking as difficulty rises.
- Hand reaction time and precision.
- Feature gates, like Offworld's subsidiary AI: Easy never sabotages or corners.
- Optional mild hustling when far ahead.
- Resource bonuses only on a clearly labelled top tier, like Civ's.

**H. Persona and language-model layer.**
- Personas are weight vectors on the utility considerations and the value function, such as risk, greed and spite. They are visible and tunable.
- The language model receives the top 3–5 options with values and a short rationale, and picks one in character. Every option must be within a value tolerance of the best, so the model can never play badly. It also writes chat.
- Calls are asynchronous and triggered by events, with a timeout that falls back to the dual-utility pick.
- Use a small model, a stable cached prompt prefix, and filters that check messages against the chosen option, as CICERO did.

## 6. Pitfalls

1. **Opaque AI that breaks when rules change** (Johnson). Log every decision with candidates, values and the winning margin, and keep a self-play regression suite.
2. **Exploitable fixed habits:** original M.U.L.E. sell timing, and AI shut out by human collusion. Include an "exploiter" style in self-play tests.
3. **Bankruptcy and stalling** (Victoria 3). Put hard constraints in candidate generation: cash floor, food and energy cover. Penalise insolvency heavily at the leaf.
4. **Strategy fusion.** Do not pick a separate best answer in each sampled world. Choose one action across all of them (information-set view).
5. **Rollout bias.** Random rollouts are useless in economic games; overly strong heuristic rollouts hide options. Use an epsilon-greedy portfolio.
6. **Too few or noisy samples.** Use common random numbers, a minimum visit count, and successive halving.
7. **Optimising only for winning.** Unbeatable or rushing AI is not fun (Civ). Tune personas and difficulty for fun and plausibility.
8. **Visible stupidity** (Wetzel). Restrict noise to near-best options; never make obviously dumb auction moves.
9. **Cheating perception.** Never read hidden information, and surface reasoning ("I bought energy because the store is low") through chat or the language model.
10. **Language model on the critical path or making the decisions.** LLMs lose to shallow search (Catan, 0–10%). Latency and cost can only be managed with caching, events and small models.
11. **Every new feature needs AI support** (Anno). Add an "AI considered?" checklist item to every feature, plus a simulation test for it.
