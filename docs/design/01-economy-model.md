# Economy model

Prices are never set by hand. They come from supply and demand inside the colony, inside a self-contained colony. Nothing is imported; the only outlet is the export ship. Holding goods to sell later is allowed, but storing them costs space, energy and spoilage, so every speculation is a real bet.

## How goods flow

&#91;embedded content: how goods and prices flow through the colony\]

Players produce, store and trade. What the whole colony holds sets the store's prices, and the export ship takes goods out of the colony, which moves those prices. Nothing comes in.

## Demand

Demand comes from four places. Players see a monthly market report with each one, so they can plan.

| Source | Wants | What drives it |
| --- | --- | --- |
| Colonists (non-player population) | Food, Water, Energy, Medicine | Population size. It grows when Food and Water are cheap and plentiful, shrinks in shortages, and jumps with immigration events |
| Players | Food, Water, Energy (upkeep) | Number of plots and buildings; Food also sets development time |
| Industry | Smithore, Crystite, Alloy, Energy | Factories need their inputs and Energy; the store needs 1 Smithore for every MULE it builds |
| Off-world | Every good, at its off-world price | An off-world price index per good that drifts each month, plus trends and events (recession, demand spike) |

**Internal demand** (colonists, players, industry) is what the colony itself needs. Much of it is essential: when Food runs short people still have to eat, so prices shoot up instead of demand falling.

**External demand** is the off-world market. It is reached through the export ship every three months. The ship has limited cargo space, and every extra unit of the same good sells for a little less, so flooding the ship with one good lowers what each unit earns.

## How prices form

The colony store is the colony's merchant. Before every auction it posts a buy price and a sell price for each good. Those are only its offer: players can always trade with each other at any price they agree on.

**The target price** comes from cover: how many months of demand the colony's whole supply would last. Supply is everything the colony holds, on the store's shelves and in every player's depot, as in the original. Little cover means a high target, lots of cover a low one.

```latex
P_{\text{target}} = P_{\text{ref}} \cdot \left( \frac{T}{\max(C,\ 0.25)} \right)^{k}
```

- **P ref** is the good's reference price. It learns from what players pay each other (25% of the gap each month) and drifts 10% a month back toward the off-world price, because ships keep bringing that price into the colony.
- **C** is cover: colony supply divided by next month's expected demand. Demand includes the players' own upkeep, the colonists, industry and the average export ship. MULEs in the corral count as the Smithore they were built from. **T** is the target cover, 2 months.
- **k** is sensitivity. Essentials react strongly, because people can't stop eating: Food and Water 1.5, Energy and Smithore 1.2, Medicine 1.0, Rare earth and Alloy 0.8, Crystite and Electronics 0.5.

**Prices move with momentum, and there is no ceiling.** The posted price moves toward the target each month. It can rise by half of the price, or by half of the reference price when the good has become cheap, and fall by at most 40%. A shortage builds up over two or three months, and that is the speculator's window. When cover drops below a quarter of a month, or the store couldn't feed its colonists last month, the price stops aiming at a target and climbs the full step every month until supply comes back. A good that is really short reaches ridiculous prices: in the simulator Energy has hit 800 and Food 1,700. The only limit is on goods that only off-world buyers want, such as Crystite: the store never pays more for them than the ship does.

**Sold out means sold out.** A store with an empty shelf posts no sell price. Buyers then have to find a seller at the auction, and that price is pure supply and demand between players, with no limit. The store keeps back the Food and Water its colonists will buy at the end of the month, so in a shortage the shelf runs empty for players first. A store whose shelves are full, or whose capital is low, posts no buy price.

**The spread.** The store sells at 10% above the posted price and buys at 10% below it, so selling to another player is usually better than selling to the store. When several buyers reach the store's price, it sells in turns, one unit each per round.

**What players see.** For every good: store stock and cover, the store's buy and sell price (or "sold out" / "not buying"), last month's trades, a trend arrow, next month's expected demand and the export ship's wishlist.

## The MULE price

- **Cost.** A MULE costs its labour (120) plus the 1 Smithore it is built from, at the store's posted price. So Smithore sets the MULE price, as in the original.
- **The corral.** Each month the store builds enough MULEs from its Smithore for every plot the next land grant can hand out, plus 2 spare. If it doesn't have the Smithore, the corral holds fewer.
- **Scarcity.** If the corral sold out last month, MULEs cost 15% more this month. If half or more were left over, they cost 10% less. This repeats, so a long MULE shortage gets steadily dearer. The price for the month is shown before development starts.
- **Why it matters.** Whoever mines Smithore sets the pace of the whole colony, and starving the store of Smithore is a strategy with a cost for everyone.

## The store and the colony fund

The colony has two separate pots of money, and neither can spend the other's.

|  | Store capital | Colony fund |
| --- | --- | --- |
| What it is | The merchant's working money | The colony government's money |
| Filled by | Selling goods to players, colonists and the export ship; MULEs and outfits | Taxes, the Sheriff's fines, donations |
| Spent on | Buying goods from players, building MULEs | The five budget lines, Governor and Sheriff pay |
| Starts with | 4,000 | 0 |
| When it runs low | The store buys less. The Governor can top it up from the Reserve line | Every budget line is cut by the same share |
| Counts toward a score | No | No |

## Taxes

Every tax has one payer and goes into the colony fund. Prices on screen are what the buyer pays; the seller sees what they keep after tax.

| Tax | Set by | Paid by | Rate |
| --- | --- | --- | --- |
| Sales tax | The Governor, 0 to 15%, at most 5 points up or down a month; starts at 5% | The seller, on every sale to a player, the store or the export ship | 0 to 15% |
| Export tax (law) | Colony vote | The seller, on export ship sales, on top of the sales tax | 10%, 20% or 30% |
| Land tax (law) | Colony vote | Every owner, per plot, at month end | 5, 10 or 20 credits |
| Windfall tax (law) | Colony vote | The seller, on the part of a sale price above twice the reference price | 25% or 50% |
| Pollution tax (law) | Colony vote | Each polluter, per air point caused, collected by the Sheriff | 10, 20 or 40 credits |
| Fines | The Sheriff | The culprit; half to the victim, half to the fund | 50 to 300 credits |

Colonists and the store's own dealings with off-world pay no tax: only players' sales are taxed. Taxes paid earn extra votes (see Colony politics).

## No imports, and the export ship

- **No imports: the colony is self-contained** (decided by Heiko on 21 Oct 2026). Every unit of Food, Water and Energy has to be grown by a player. A shortage is the players' own doing, and fixing it is their business.
- **Emergency purchase, the one exception.** When a good is down to less than half a month of cover, the Governor can order an emergency shipment in the planning phase, paid from the Reserve budget line. It costs 3 times the off-world price per unit, and the ship carries at most 2 units per player. The goods arrive in time for that month's auction and go on the store's shelf; what they sell for flows back into the colony fund. The fund loses the gap, so a rescue hits the budget hard and can't become a habit.
- **The export ship** calls every 3 months and announces two or three goods it wants one month ahead. While it is in port it is an extra buyer at the auction: it pays the off-world price for the first unit and 2% less for each further unit as its cargo fills, plus 10% from a clean colony. Players sell to it directly; the store sells its surplus last.

## Colony stock and warehouses

**The colony store** keeps the colony stock and runs on its own capital, never on the colony fund. It aims for about 2 months of cover for each good:

- Above 2 months of cover, it sells the surplus on the next export ship, as far as off-world buyers want it.
- If its capital runs out, the store can't buy from players, so sellers have nobody to sell to but each other. The Governor can top it up from the Reserve budget line.

**Player storage.** Every player has a home depot holding 10 units of each good. Anything above that spoils at the end of the month and is lost. Selling it in time is the player's own decision. Holding more needs a storage building, which uses up a plot that could otherwise produce.

| Building | Stores | Capacity | Build cost | Running cost | Spoilage effect |
| --- | --- | --- | --- | --- | --- |
| Warehouse | Smithore, Crystite, Alloy, Electronics | +30 | 2 Alloy | None | These goods don't spoil anyway |
| Silo | Food, Water | +30 | 2 Alloy | None | Spoilage halved |
| Cold store | Food, Medicine | +20 | 3 Alloy, 1 Electronics | 1 Energy per 10 units stored | Food 10%, Medicine 5% |
| Tank | Water | +30 | 2 Alloy | None | No evaporation |
| Battery bank | Energy | +20 | 2 Alloy, 1 Electronics | None | Energy loss 5% |
| Vault | Crystite, Electronics | +20 | 2 Alloy, 1 Electronics | None | Can't be raided by pirates |

**Spoilage per month** without the right building: Food 50%, Medicine 20%, Energy 25%, Water 5%. Smithore, Crystite, Alloy and Electronics keep forever.

**Power matters.** A cold store without Energy works like an ordinary depot: Food spoils at 50% again. A grid failure or a dust storm can ruin a Food speculation overnight.

**Renting space.** Players can rent storage to each other through a deal card, for example "10 units of cold storage for 3 months at 5 per month". The colony store also rents space when it has spare room, at a price set by the Governor.

## Trading and speculation

There are only three tools, so speculation stays easy to learn:

1. **Buy, hold, sell.** Buy at the auction or from the store, store the goods, and sell later.
2. **Forward contract.** Agree today on a price for delivery in a later month (already in the deals system).
3. **Short sale.** Sell forward goods you don't have yet, betting the price will fall before delivery. It needs a 20% deposit, and if you can't deliver you buy at the market price plus a penalty.

**Every bet has a carrying cost:** spoilage, the energy for cold storage, a plot that produces nothing while it holds a building, and the risk of events. A cheap speculation in Water and an expensive one in Food are very different decisions.

**Information is the edge.** Everyone sees a public market report each month: colony stock and cover per good, last month's production, next month's expected demand and the export ship's wishlist. Observatory forecasts and deep surveys are private, so better-informed players speculate better.

**Example: betting on a drought.** The observatory forecasts a drought. Food sells at 30, and the store holds 2 months of cover.

| Month | What happens | Cash |
| --- | --- | --- |
| 3 | Buy 20 Food at 30. Store it in your cold store (already built) | -600 |
| 3 | Running the cold store costs 2 Energy (about 50) | -50 |
| 4 | Drought. Spoilage leaves 18 Food. Colony cover falls to 0.8 months, nothing can be imported, the store sells out, and hungry players bid Food up to about 120 at the auction | 0 |
| 4 | Sell 18 Food at 120 at the auction | +2,160 |
|  | Profit | +1,510 |

What could go wrong: a dust storm cuts your Energy, so half the Food spoils; the council passes a Food price cap; or the forecast was wrong, and you sell at a loss.

## Starting numbers and balancing

These are first guesses for the prototype. Playtesting will change them.

| Good | Reference price | Sensitivity (k) | Spoilage per month | Typical output per plot |
| --- | --- | --- | --- | --- |
| Food | 30 | 1.5 | 50% | 4 on river, 2 elsewhere |
| Water | 25 | 1.5 | 5% | 4 on ice or lake, 1 elsewhere |
| Energy | 25 | 1.2 | 25% | 4 on plains or desert, 2 elsewhere |
| Smithore | 50 | 1.2 | None | 2 to 4 on hills or mountains |
| Crystite | 100 | 0.5 | None | 0 to 4, depending on the hidden deposit |
| Alloy | 90 | 0.8 | None | 2 per factory (needs 2 Smithore and 2 Energy) |
| Electronics | 220 | 0.5 | None | 1 per factory (needs 1 Rare earth, 1 Alloy and 1 Energy) |
| Medicine | 120 | 1.0 | 20% | 2 per factory (needs 1 Food, 1 Water and 1 Energy) |

**Upkeep grows with what you own.** Every plot has a crew: 1 on a farm, mine or power plant, 2 in a factory, none on a green belt. Each player needs 2 Food plus 1 for every 4 crew, and 1 Water plus 1 for every 6 crew. With 6 farms and mines that is 4 Food and 2 Water a month; with 12 plots including 3 factories it is 6 Food and 4 Water. Short of Food, you get less development time. Energy depends on what a plot does:

| Plot | Energy a month | Crew |
| --- | --- | --- |
| Food or Water farm | 1 | 1 |
| Energy plant | 0 | 1 |
| Smithore, Crystite or Rare earth mine | 2 | 1 |
| Alloy smelter | 2 (1 with a Smithore mine beside it) | 2 |
| Electronics or Medicine works | 1 | 2 |
| Green belt | 0 | 0 |

Without its Energy a farm or mine makes half and a factory makes nothing. Short of Water, your Food farms make half, because they can't irrigate (decided by Heiko on 21 Oct 2026). Both shortfalls stack: a farm without Energy or Water makes a quarter.

**Colonists** start at 100 and need 1 Food and 1 Water per 20 colonists each month. They buy it from the store out of their wages and pay at most 150 for Food, 120 for Water, 100 for Energy and 400 for Medicine. Above that they buy less and go short. Players and colonists start with enough Food and Water for about 3 months; the store starts with 30 Food and 36 Water. A MULE costs its labour plus 1 Smithore, and more when the corral keeps selling out (see The MULE price above).

**How we balance it.** Every number lives in one config file rather than in code. A headless simulator plays thousands of games between AI players and checks four things:

- **MULEs:** median price 150 to 300, under 500 in 9 months out of 10, and the corral empty in fewer than 1 month in 10.
- **Food:** a real shortage (price above 3 times the reference) in a third to a half of games, but colonists going short in fewer than 15% of months. The 3 times is only what the test looks for: prices themselves have no ceiling.
- **No dead prices:** the store posts a sell price only for goods it has.
- **Players:** by month 12 at least 7 in 10 owned plots are developed, and no AI player stays broke (under 100 credits with idle land) for 3 months in a row.
- **Money:** store capital never below 500, and the colony fund never negative.
- **Pollution:** without politics, at most 1 game in 10 ends in Collapse.
- **Strategy:** no single strategy wins too often, and speculation pays off sometimes but not always.

**Latest simulator run** (21 Oct 2026, 40 games, 4 AI players): 8 of 10 checks pass. MULEs cost 151 at the median and 179 in 9 months out of 10, the corral never sold out, 95% of plots were developed, colonists went short in 13% of months, and 8% of games ended in Collapse. Two misses: a real Food shortage happened in only 15% of games, and an AI player stayed broke for 3 months in 13% of games, usually after betting on Crystite while the market for it was already full.
