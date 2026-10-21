# M.U.L.E. Next Gen: Game Design Concept

Oct 20, 2026 · @Heiko

## Vision and pillars

The successor keeps the 1983 game almost intact and adds one layer of economic depth: more goods, short supply chains, a market for land and assets, light diplomacy and sabotage. A new player should still be trading in ten minutes; an experienced player should find it noticeably harder to optimise.

**What stays from the original**

- Two to six players (human or AI; the original had four) colonising a small planet over a fixed number of months.
- Land grant, buying and outfitting MULEs, production, random events and the walk-to-the-price auction.
- Cooperation versus competition: you want to win, but if the colony fails everyone loses.
- Short sessions, simple controls, the map as the main screen.

**What gets deeper**

- Five raw resources instead of four, plus three processed goods that need inputs.
- Adjacency matters more and rewards planning clusters and placing factories next to their inputs.
- Characters with traits that change how you play, not only how much you earn.
- You can sell plots, MULEs and goods to other players, always through an auction, not just to the store.
- Pacts, contracts and a colony council, plus sabotage with a real risk of getting caught.

**Design rule:** every new system has to be explainable in one sentence and visible on the map or the auction screen. If it needs a spreadsheet to understand, it is cut or simplified.

## Core loop

One month is one round, built from three kinds of phase. In **planning** phases everyone thinks and negotiates at the same time, with no rush. In **real-time** phases all players act on the same map at once, as in the original's land grab, development and auction. **Resolve** phases play out on their own while everyone watches. Nobody ever waits for another player's turn.

1. **Planning: the council table** (simultaneous, about 90 seconds or until everyone presses Ready). Chat, propose pacts, put plots or MULEs up for auction, buy insurance, read forecasts, vote on council issues, and secretly order sabotage. Orders stay hidden until the resolve phase.
2. **Real-time: land grant.** Free plots light up one at a time in a random order, and the first player to press claims the lit plot. Every free plot lights once per sweep, but nobody can count down to the plot they want, so it is a real reaction game. Phones and the big screen draw the order from the same seed, so everyone sees the same plot lit at the same moment.
3. **Real-time: land auction.** Listed plots and colony plots go under the hammer, using the same walk-to-the-price mechanic as the goods auction.
4. **Real-time: development** (everyone at the same time, kept from the original). Everyone's colonist is on the map together, and you can see what the others are doing but can't block them.
   - **Time comes from Food.** A colonist with enough Food for the month gets the full time, about 50 seconds. Short of Food, the time shrinks with the shortfall, down to about 15 seconds with none. Feeding yourself is what buys you time to build.
   - **Buy, outfit, install.** To develop a plot you walk into the colony store and buy an empty MULE at the corral. You lead it to the outfitter for the good you want (Food, Water, Energy, Smithore, Crystite or Rare earth) and pay for the outfit. Then you walk out to one of your own plots and install it there. Leading a MULE onto a plot that isn't yours, or letting go of it on the way, makes it run off, as in the original.
   - **Few MULEs.** The corral holds only a few MULEs, built from Smithore, so there is a race to buy them.
   - **The pub.** Walking into the pub ends your turn and pays out cash: more the more time you have left, and more later in the game, as in the original.
   - **Also on the map:** geo analysis of any plot, and hunting the creature at the lair for a cash reward.
5. **Resolve: production and events.** Plots produce, factories convert goods, sabotage orders play out and are revealed if detected, and events hit. Animated on the map so everyone sees what happened and why.
6. **Real-time: trading auction.** The original auction for each good, with all players walking toward their price at once.
7. **Resolve: upkeep and score.** Consumption, spoilage, contract deliveries and the standings.

A standard month takes about 5 minutes, so a 12-month game lasts about an hour.

**Why this split.** Real-time phases keep the original's frantic, shared-screen feeling: you see rivals grab the plot you wanted or buy the last MULE. Planning phases give room for the slower, social side of the game, like deals, pacts and plots against each other. Deals can still be offered during real-time phases, but the planning phase is where they belong. If a player disconnects, an AI takes over their colonist until they return.

## Kitchen table and solo play

The game is designed first for a family or friends around a table, each on their own phone, and second for one player against AI personas. Both must feel great.

**Getting started at the table.** One person taps New game. Everyone else scans the QR code or types a 4-letter room code, with no accounts or installs needed. Empty seats fill with AI personas. Anyone can open the table view on a TV or laptop to show the shared map, but the game works without it.

**Big screen mode.** Optionally, one shared TV, laptop or PC shows the map, the auctions and the events, and every phone becomes a private controller, like the original with joysticks. The full concept: Big screen mode

**Your phone is your private hand of cards.** Everything public, like the map, auctions, council votes and events, shows on every screen. Your own stock, geo analysis results, whispers, deal offers and secret sabotage orders stay on your phone, so you can plot against the person sitting next to you while smiling at them.

**Moments built for the table:**

- **Whispers.** Tap a player to send a private note. Their phone buzzes quietly, with no sound, so nobody else notices.
- **Deals across the table.** Tap someone's avatar to send a deal card, then argue about it out loud.
- **The vote reveal.** Council votes are cast in secret and revealed all at once, after a short countdown, so everyone sees who broke ranks at the same moment.
- **The sabotage reveal.** Detected sabotage is revealed in the resolve phase with a big "Caught!" moment and the culprit's name. Undetected sabotage leaves everyone suspecting each other.
- **The auction race.** Everyone drags their price at once, and your phone vibrates when someone undercuts you.
- **Reactions.** Quick emotes ("Traitor!", "Deal!", "Nice!") pop up on every screen.
- **The monthly news.** A short recap at the end of each month reports who got rich, who got caught and what the council did, in the style of a colony news broadcast.

**Family-friendly settings.** A short game option (6 months), a head start for younger or newer players (more money or an easier AI), large touch targets, and screens that need little reading.

**Solo play against AI personas.** AI players carry the social side: they remember how you treated them, gossip about each other in table chat, comment on your moves, form alliances against the leader, and hold grudges. At a mixed table their chat appears on every screen, just like the human players' talk across the table.

## Resources and supply chains

The game has nine goods: six raw resources mined or grown on plots, and three processed goods made in factories from those raw resources. The supply chain is never more than two steps deep, so a player can hold it in their head.

| Good | Made from | Used for | Keeps? |
| --- | --- | --- | --- |
| Food | Plot (best on river) | Upkeep; sets development time | Spoils fast |
| Water (new) | Plot (best on ice or lake tiles) | Upkeep; input for Medicine | Keeps |
| Energy | Plot (best on plains) | Every working plot and factory needs 1 | Decays slowly |
| Smithore | Plot (best on mountains) | Input for Alloy | Keeps |
| Crystite | Plot (hidden deposits) | Input for Electronics; high export value | Keeps |
| Alloy (new) | Factory: Smithore + Energy | The store builds MULEs from it; plot upgrades | Keeps |
| Electronics (new) | Factory: Rare earth + Alloy + Energy | MULE upgrades; top export good | Keeps |
| Medicine (new) | Factory: Food + Water + Energy | Protects against disease events; export | Spoils slowly |

&#91;embedded content: supply chain · 5 raw goods, 3 processed\]

Energy feeds every factory, and Alloy feeds both Electronics and the store's MULE production, so it is the good everyone fights over.

**Why it is demanding.** In the original, a Smithore shortage meant no MULEs. Here that crunch moves one step down the chain: if nobody makes Alloy, the store cannot build MULEs, and Alloy itself needs Energy. Players must decide whether to sell raw goods now or hold them for their own factories.

**Factories.** A factory is built the same way as a farm or a mine, so there is nothing new to learn. In the development phase you buy an empty MULE at the corral and take it to the **works** counter in the store instead of a raw-goods outfitter. There you fit it as an Alloy smelter, an Electronics works or a Medicine lab. The fit costs more than a raw outfit (placeholders: 150, 200 and 150 credits). Then you lead it to one of your plots and install it. A factory turns the whole plot over to industry: the plot no longer grows or mines anything, and its ground rating doesn't matter. Each month at production time it takes its inputs from your stock. Missing inputs mean less or no output, so you buy inputs at auction or secure them by contract.

| Factory | Inputs | Output | Good places | Poor places |
| --- | --- | --- | --- | --- |
| Alloy smelter | 2 Smithore, 1 Energy | 2 Alloy | Volcanic (geothermal heat saves the Energy), hills, mountains | Swamp (soft ground), ice field, lake shore |
| Electronics works | 1 Rare earth, 1 Alloy, 1 Energy | 1 Electronics | Tundra (cold air cools the works), desert, plains | Swamp and river (damp), volcanic (quakes and ash) |
| Medicine lab | 1 Food, 1 Water, 1 Energy | 2 Medicine | Forest and swamp (herbs, +1 Medicine), river (clean water) | Desert, volcanic, crater |

Plains are a safe middle ground for every factory. A good place gives +1 output or saves an input; a poor place gives -1 output or a higher event risk. Before you install, the phone shows the plot's fit for the factory you carry, with the reasons.

**What else affects a factory.**

- **Inputs.** Output is limited by whichever input runs out first. Holding stock and signing supply contracts is how industrialists stay safe.
- **Energy.** Every factory needs Energy. In an Energy shortage, factories are served after farms and mines.
- **Neighbours.** A factory next to one of your plots that makes one of its inputs saves 1 Energy. Two factories of the same kind side by side make +1 (an industrial park). Polluters hurt their neighbours (see Pollution below).
- **Experience.** A factory that has run for 3 months in a row makes +1, so moving factories around has a cost.
- **Tile traits and events.** Unstable ground, flood plains, quakes, power cuts and strikes hit factories as they hit any plot. Factories are favourite sabotage targets.
- **Species, traits and laws.** Gearlings pay less for the fit, Industrialists get +1 output, and the Governor can pass laws such as an industry subsidy or a pollution tax.

**Pollution.** Rare earth mines and Alloy smelters pollute the plots around them and the colony's air. Polluted plots make less Food, Water and Medicine, and a dirty colony makes everyone sick, costs development time and lowers the colony's final rating. Filters, green belts, cleanup squads and laws fight it. Full rules: Pollution

All numbers are placeholders until the balance sim has run. Electronics is made from Rare earth (decided by Heiko on 21 Oct 2026); Crystite is a pure off-world luxury export.

**Export ship.** Every three months a Federation ship arrives and pays premium prices for two or three goods it announces one month ahead. This gives processed goods a market outside the colony and makes timing matter.

**Beginner mode** uses only the original four raw resources, so the classic game stays available.

How prices, demand, storage and speculation work in detail: Economy model

## Land, adjacency and terrain

Where you build matters more than in the original. The map is about three times bigger, with roughly 30 plots per player instead of 11, so there's room for real territories, clusters and borders.

| Players | Map size | Plots |
| --- | --- | --- |
| 2 to 3 | 13 by 7 | 91 |
| 4 | 15 by 9 | 135 |
| 5 to 6 | 19 by 11 | 209 |

- **Two claims per month.** On these maps each player claims two plots per land grant, and the colony auctions three or four more each month. Free land then runs out around month 10 to 12, which triggers the land rush ending.
- **Distance matters.** The colonist walks during development, so far plots cost time. Outposts (see special fields) act as a second store, and roads let colonists move faster.
- **Unexplored edges.** The outer ring of the map starts hidden. Scouting during development reveals terrain and special fields there before anyone else can claim them.
- **Classic map.** The original 9 by 5 map stays available as an option for quick games.

The store's MULE stock grows with the number of players, so the race for MULEs stays tight.

**Adjacency.** The original rewarded owning several plots of the same type. The successor makes it spatial:

- A plot next to at least one of your own plots producing the same good gets +1.
- A connected cluster of four or more gets +2 per plot instead.
- A factory next to a plot that produces one of its inputs saves that plot's energy cost.
- Partners in a joint venture (see Diplomacy) count each other's plots for adjacency.

**Terrain.** Every plot has one terrain type: plains, river, lake, forest, swamp, hills, mountains, desert, tundra, ice field, volcanic or crater. Terrain only sets the odds of what each plot can grow or yield, plus its event risk. The real ratings are hidden underground until someone runs a geo analysis. The odds per terrain, the ground ratings and how analysis works are in the **Terrain and geology** tab.

**Special fields.** Each map has a handful of unique fields, placed at random, many of them in the unexplored edges. Owning one gives a lasting advantage, so they are the most fought-over plots in the land auction.

| Special field | Effect |
| --- | --- |
| Ruins | One-off salvage of Alloy or Electronics, then a normal plot |
| Crystal cavern | Crystite +4, but each month there is a small chance it collapses |
| Geyser | Water +2 and Energy +2 |
| Oasis | Food +3 in the middle of the desert |
| Alien relic | +1 to every adjacent plot, whoever owns it |
| Outpost | A second store: buy and outfit MULEs here; the owner earns a small fee on each sale |
| Spaceport pad | The owner pays no fee on exports and sees the export ship's demand a month earlier |
| Federation beacon | The owner gets event forecasts without an observatory |
| Old road | Colonists move twice as fast along it, so plots near it are worth more |
| Creature lair | A homage to the original's Wampus: hunt it during development for a cash reward |

**Plot upgrades.** Paid in Alloy and installed during development: irrigation (+1 Food), solar array (+1 Energy), deep shaft (+1 Smithore or Crystite), and security fence (lowers sabotage success on that plot).

**Tile traits.** Output ratings come from the ground (see **Terrain and geology**). On top of that, a tile can have zero to two hidden traits that change its risks or upkeep. A geo analysis reveals them too.

| Trait | Effect | Kind |
| --- | --- | --- |
| Bedrock | Immune to quakes | Positive |
| Sheltered | Immune to dust storms | Positive |
| Hot spring | Energy +2, but Water -1 | Mixed |
| Thin vein | Mining output drops by 1 every 3 months | Negative |
| Toxic soil | Food -2 until cleaned with Medicine | Negative |
| Unstable ground | Double quake risk; MULEs here can be lost | Negative |
| Infested | Pest swarms start here | Negative |
| Flood plain | Double flood risk | Negative |

**Geo analysis.** During development a colonist can stand on any plot, owned or free, and run a geo analysis (about 8 seconds). It shows the plot's real rating for every good and names its traits. A geo drone bought at the store analyses two free plots from orbit instead. Details are in the **Terrain and geology** tab.

What you learn is private, shown only on your own map. You can share it, sell it, or lie about it in chat. The "fake assay" sabotage plants false analysis results, so trusting someone else's report is a risk.

**Super tiles.** Each map hides two or three super tiles with a game-changing effect. A geo analysis gives clues about a super tile nearby, and late-game events can reveal them.

| Super tile | Effect for the owner |
| --- | --- |
| Mother lode | Crystite +8 per month, the biggest export source on the map |
| Ancient reactor | None of your plots or factories need Energy |
| Terraforming engine | Every plot of yours within two tiles gets +2 on its main good |
| Gene vault | Your Food and Medicine output doubles |

**Keeping super tiles in check.** Once claimed, a super tile glows on every player's map, which makes its owner a target:

- **Shutdown sabotage:** a special sabotage order that switches the super tile off for one month. It costs more than normal sabotage and is easier to detect.
- **Cheaper sabotage:** all sabotage against a super tile's owner costs half.
- **Council seizure:** by passing the Eminent domain law, the council takes the super tile under colony control for three months and shares its output.
- **Upkeep:** each month a super tile needs Alloy and Electronics, or its effect halves.
- **Guarding:** the owner can put security on it to lower the chance of sabotage, but never to zero.

## Characters and traits

Each player picks a species and two traits at the start. Species give one ability and a starting bonus, like the original races did. Traits push a play style, and each has a drawback so no pick is strictly best.

| Trait | Benefit | Drawback |
| --- | --- | --- |
| Farmer | +1 Food on river plots | Mining plots -1 in the first 3 months |
| Engineer | Installing a MULE takes half the time | Pays 10% more for MULEs |
| Haggler | Sees the other bidders' limits in the auction | Store sells to them 10% higher |
| Industrialist | Factories produce +1 | Consumes 1 extra Energy per month |
| Prospector | Assays are free and cannot be faked | Starts with less money |
| Diplomat | One extra deal slot; reputation recovers faster | Sabotage always gets detected |
| Schemer | Sabotage is cheaper and harder to detect | Starts with low reputation |
| Hoarder | Goods spoil at half the rate | Selling to the store pays 10% less |

**Species.** Six new species replace the original races. On the map and in every list, a player is shown as a small creature of their species, drawn in their colour. Colour is the main way to tell players apart, and the player's name sits beside the creature wherever there is room. Two players may pick the same species. Each species has one clear perk; the numbers are placeholders until the balance sim has run.

| Species | Look | Perk |
| --- | --- | --- |
| Zipwing | Small winged flyer with antennae | Fast flyer: moves twice as fast during development |
| Bramblet | Round sprout with a leaf on its head | Green thumb: farms yield +1 Food |
| Gearling | Boxy tinker robot with one big eye | Tinkerer: MULEs and outfits cost a quarter less |
| Mollox | Mole-like burrower with claws | Burrower: mines yield +1, and geo analysis takes half the time |
| Glimmer | Floating jelly with three eyes | Seer: sees next month's event one month early |
| Quibbit | Frog-like trader holding a coin | Born trader: first in line when the store hands out units in turns |

## Markets and trading

Everything a player owns can be sold: goods, plots and MULEs. Every sale goes through an auction, so every player gets a fair chance to bid. There is no direct trading between two players. Trades happen in two places, each kept to one screen.

**The auction (kept).** The original walk-to-the-price auction runs for each good every month. Buyers and sellers move toward each other, and the store posts a buy and a sell price from its stock (only a buy price when it is sold out). Prices follow supply and demand, so a shortage still causes the price spikes that made the original exciting.

**What the auction shows.** For the good being traded, everyone sees how many units the store has, and how many each player holds and needs this month (their spare or shortfall). On the big screen, each player's creature on the price chart also shows how much they want or offer.

**The store sells in turns.** When several buyers reach the store's price at the same moment, the store does not give everything to whoever got there first. It hands out one unit to each waiting buyer, round by round, until it is empty or every buyer has what they asked for. Example: the store has 8 Food and Ossa wants 4, Lena 3 and Brix 3. They get 3, 3 and 2. The order within a round goes to whoever reached the price first, except that a Quibbit always goes first. Selling to the store works the same way when the store can only take a limited amount.

**The asset auction (decided 21 Oct).** In the planning phase, a player can put a plot or a MULE up for sale. It always goes to auction, in the land auction right after planning, with the same walk-to-the-price mechanic as the goods auction. The seller sets a minimum price and every other player can bid.

- A plot, empty or with its MULE and upgrades on it, sold as one package.
- A spare MULE, empty or outfitted.
- If nobody bids the minimum, the colony store buys it (plots at a fixed base value, MULEs at half price) or the seller keeps it, chosen when listing. So land and MULEs are never completely illiquid.

A buyer gets the plot with its adjacency bonuses, which makes the plot that completes someone's cluster worth far more to them than to anyone else.

**No direct trading (decided 21 Oct).** Players cannot swap goods, money, plots or MULEs between themselves, and there are no supply contracts. Anything of value changes hands in an auction, so it stays fair for everyone at the table. Deal cards remain for pacts and council votes (see Diplomacy).

## Diplomacy

Diplomacy runs on one visible number per player, **reputation** (0 to 100), plus a few kinds of agreement. Reputation rises when you keep deals and falls when you break them or get caught sabotaging. Low reputation means worse prices from the store and AI players who refuse to deal with you.

**Agreements**

- **Non-aggression pact:** neither side may sabotage the other for a set number of months. Breaking it costs a lot of reputation.
- **Joint venture:** two players pool neighbouring plots so they count as one cluster for adjacency. Output is split by who owns which plot.

**Colony politics.** Every planning phase the council votes on laws that change the rules for everyone. There are three roles with privileges: an elected Governor and Sheriff, and the Land Baron, a title earned by owning the most land. The full rules are in Colony politics.

**AI players** have personalities (cooperative, greedy, vengeful, opportunist) that decide which deals they accept and how they react to betrayal. This keeps diplomacy meaningful in solo games.

**Chat.** Chat is how diplomacy happens, and humans and AI players use it the same way.

- **Table chat:** everyone in the game sees it. Good for public offers, threats and council debates.
- **Private chat:** one-to-one whispers for secret deals, pacts and plots. AI players whisper too, and may propose a secret alliance against the leader.
- **Pact channel:** a shared chat for players with a pact or joint venture.
- **During real-time phases**, chat shrinks to a small overlay with quick phrases and emotes ("Nice!", "Traitor!", "Deal?"), so nobody has to type while racing for a MULE.
- **Deal cards in chat:** any offer can be attached to a message as a deal card the other side accepts with one tap.
- **AI players** may bluff about their plans, but they never lie about the rules or game facts. Their messages are rate-limited so they don't flood the chat.
- **Safety:** mute, block and report for every player, plus a filter that can be switched to family-friendly.

## AI players

AI players are driven by real AI language models. They make their own strategy, negotiate in chat, hold grudges and have a personality. They play by the same rules as humans and see only what a human in their seat would see.

**A brain and hands.** A language model takes a few seconds to answer, which is too slow for the real-time phases. Each AI player is therefore split in two:

- **The brain** (the language model) works in the planning phase. It reads the game state, sets a plan for the month (which plots to want, what to pay for MULEs, price limits in the auction), makes and answers deals, and decides on sabotage.
- **The hands** (fast game code) carry out that plan in the real-time phases: pressing for land, racing to the store and walking in the auction. Between months the brain reviews what happened and adjusts.

**Talking to players.** AI players chat in their own voice during planning: offering deals, bluffing, complaining about a broken pact, or teasing after a lucky auction. A deal proposed in chat always appears as a normal deal card that the human accepts or rejects in the interface, so nothing becomes binding from text alone. Chat is moderated, with a family-friendly setting.

**Tuning intelligence.** The host sets each AI player's level when setting up the game:

| Level | Model | Thinking | Hands | Mistakes |
| --- | --- | --- | --- | --- |
| Rookie | Small, fast model | None | Slow reactions | Misreads forecasts, overpays |
| Trader | Mid-size model | Short | Average reactions | Occasional mistakes |
| Tycoon | Largest model | Long, plans several months ahead | Fast reactions | Rare mistakes; spots your weak plots |

**Personalities.** Each AI player has a persona: a name, a species, two traits from the trait table, a temperament and a way of speaking. They remember how each player treated them during the game. Example personas:

| Persona | Temperament | Plays like | Talks like |
| --- | --- | --- | --- |
| The Accountant | Cautious | Insures everything, hoards Food, never sabotages first | Dry and precise; quotes prices |
| The Baron | Greedy | Buys land aggressively, corners one good | Charming, then ruthless |
| The Grudge | Vengeful | Fair until betrayed, then sabotages you every month | Polite, with a long memory |
| The Gambler | Opportunist | Speculates on land, sells at the top, breaks pacts when it pays | Jokes and bluffs |
| The Good Neighbour | Cooperative | Forms joint ventures, keeps every deal | Warm; pushes for colony goals |

**Cost.** Each AI player needs about one model call per planning phase plus its chat replies, so a 12-month game needs a few dozen calls per AI player. Rookie AI players are the cheapest.

How the AI gets its intelligence, where the model runs and what a game costs: AI players

## Sabotage and events

Sabotage is a secret order given in the planning phase and carried out in the resolve phase. It costs money, works only some of the time, and can be traced back to you. Each action has a success chance and a separate detection chance.

| Action | Effect on the target | Risk if caught |
| --- | --- | --- |
| Cut the power line | One plot produces nothing next month | Fine and reputation loss |
| Fake assay report | A plot shows false Crystite values until re-assayed | Large reputation loss |
| Market rumour | Opening auction price for one good shifts up or down | Small reputation loss |
| Tip off the pirates | Raises the chance that pirates raid the target's stock | Fine and large reputation loss |
| Steal a MULE | Take an empty MULE from the target's stock; low success | Heavy fine; the MULE is returned |

**Defence.** Security fences on plots, a Medicine and food reserve, and non-aggression pacts all lower the damage. A detected saboteur gives the victim one free retaliation that cannot be detected.

**Random events (kept).** Pirates, meteorites, planet quakes, pests, sunspot activity and the store fire stay. New events tie into the economy: a disease outbreak that only Medicine stops, a drought that hits Water, and a Federation inspection that rewards high colony output. Personal events still favour the player in last place to keep games close.

The full list of events, with their effects and how to hedge against each one: Event catalogue

## Winning and keeping it simple

The winner is still the richest player at the end, counting money, land, MULEs and goods. The colony also has to reach a minimum total; if it falls short, the Federation's verdict is that everyone loses. A few optional colony goals per game (for example, ship 20 Electronics by month 9) add a bonus for every player.

**When the game ends (land rush).** The game ends three months after the last free plot is claimed, or after month 12, whichever comes first. Once the land runs out, the only way to grow is the land market, which makes the final months a scramble for the plots that complete clusters. A quick game caps at 6 months and a long one at 18.

**Staying easy to play**

- Three difficulty levels: Beginner (the original four resources, no council), Standard, and Tournament (everything on, tougher events).
- A guided first month that introduces one system at a time.
- Every number on screen explains itself on hover or long press, including why a plot produced what it did.
- A game takes about 60 to 90 minutes at Standard, about the same as the original.

The game runs in the browser and works with a mouse or touch. Multiplayer is online, with each player on their own PC or phone, and AI players fill empty seats.

## Decisions

- [ ] **Platform first:** Decided: web, built with React (React 18, Vite and Tailwind, the same stack as Helvetiq). Capacitor, which Helvetiq uses for its iOS and Android apps, can wrap the same code for the app stores later.
- [ ] **Multiplayer:** Decided: online only. Each player joins from their own PC or phone, and AI players fill empty seats. There is no shared-screen mode.
- [ ] **Development phase:** Decided: the game runs almost in real time. Planning phases are simultaneous, and action phases are real-time with all players on the map at once (see Core loop).
- [ ] **Sabotage:** Decided: on by default in every mode. The host can switch it off when setting up a game.
- [ ] **Resource count:** Decided: five raw goods and three processed goods.
- [ ] **Name and setting:** the working title is M.U.L.E. Next Gen. Before a public release, check who holds the rights to the M.U.L.E. name and get permission, or rename. The species get new names either way
- [ ] **Art style:** Decided: clean, modern and polished. Retro touches are fine as homage, but it is not pixel art.
