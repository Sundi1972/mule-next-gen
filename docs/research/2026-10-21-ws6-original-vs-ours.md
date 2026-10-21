# The original against ours, phase by phase (WS6 UX & Gameplay)

2026-10-21 · WS6-1 · branch `ws6-ux` from feat/strategist 59be9f2 · serves G-3 (a family plays a whole game at the
kitchen table) and, through readability, G-1.

**Concepts, not copies.** Everything below takes an idea or a piece of information design from the original. None of
it takes the original's art, layout or look. Our screens keep the holo-table style WS4 already got approved.

**Sources.** Eight screenshots of a modern remake of the original that Heiko shared on 2026-10-21 (landscape phone,
four players). They are described in words in §0, because the images live only in the session transcript. "Ours" is
read from the code at 59be9f2 (files named in each section), not from the design docs. Where the docs and the code
disagree, both are named.

---

## The verdict, on one page

| # | Area | What the original does better | Verdict | Who owns the screen |
|---|---|---|---|---|
| 1 | Development | You **walk**: on the map, into the store, booth to booth, out to your plot. The walk costs time, so where you build and in what order is a decision | **Adopt, as a gameplay rule** (R1): it is already in our concept ("Distance matters") but not built. Today nobody moves and time only matters for the pub | Rule: WS1 sim + Heiko. Screens: WS6 or WS4, PM ruling |
| 2 | Store interior | A place you walk into: corral, an outfitter per good, the pub, and everyone else in the room with you | **Adapt** to 9 goods on one phone screen: **Decision D1** | WS6 (new screen) |
| 3 | Start of turn | "You eat some food and fill up your time bar": the bar fills in front of you, so Food = time is felt rather than read | **Adopt** | Same as 2 |
| 4 | Production | Every plot shows what it made, as bars in the owner's colour; events put +1 / −1 badges on the plots they hit; then the goods **fly home** into each player's slot | **Adopt**, with the reasons on each plot (no Energy, no Water, cluster, pollution). Needs per-plot output from the engine | WS6 (the show), engine edit by WS1 |
| 5 | Events | Random events hit during production, on the map | **Gap, not ours to fill:** the engine has **no event system at all** today (§3). The production show is designed so events slot in | PM: no lane owns events |
| 6 | Auction board | Two dashed lines span the board: the **lowest ask** pushed down by sellers, the **highest bid** pushed up by buyers. When they meet, units trade | **Adopt**. We have the walk, the store lines and the ship line, but not these two lines | WS3 |
| 7 | Auction board | Each creature shows its units and surplus ("16 (+16)"); the store's stock and buying price sit on the board | **Adopt** | WS3 |
| 8 | Status screen | One screen per good, before its auction: last round, produced, used/lost, total, needed, surplus, plus the store's price and stock, and you **declare buy or sell on that same screen** | We already have it (StatusTable) with one more column (Spoils). **Adapt:** add store price and stock; fold the declare into it (R2) | WS3 |
| 9 | Colony bar | An always-visible bottom bar: every player's money, plus your own stock | **Adapt:** on the TV, everyone's money (public); on the phone, your own 9 goods (private) | WS4 (shell, TV) |
| 10 | Land grant | Cursor through free plots in reading order | Already adopted (Heiko, 21 Oct). One stale line of copy on the TV still says "random order" | WS4 (copy fix) |

Rules that change gameplay (each needs Heiko's ruling and sim rows from WS1 before anything is built):

- **R1: walking costs development time**, on the map and inside the store. §2.
- **R2: declare buy or sell on the status screen** (one stage per good fewer). §4. This changes the flow, not the economy.
- **R3: production runs as a show of about 15 s**, with events and the fly-home inside it (today it is 5 s). §3. This changes timing, not the rules.

---

## 0. What the screenshots show

1. **Production summary, one good at a time** ("Production summary – Crystite", and one for Smithore). A row per player,
   marked by their creature: Last round · Produced · Used/Lost (red when goods were lost) · Total · Needed ·
   Surplus/Shortage. A side panel shows the store's price and stock. Two big buttons, **Buy/Hold** and **Sell**: this is
   where you pick your side.
2. **The auction ("Crystite auction #7")**: one column per player. The seller stands at the **top** ("walk down"), the
   buyers at the **bottom** ("walk up"). Two dashed lines cross the whole board: the upper one just under the seller, at
   the lowest ask; the lower one just above the buyers, at the highest bid. Bottom left: **"BUY $087"**, the price the
   **store buys at**, the floor a seller can walk down to (the store has no stock, so it sells nothing and there is no
   ceiling). Top right: **STOCK 000**, the store's stock. Under each creature, units held and surplus: "16 (+16)",
   "0 (+0)". A vertical time bar on the right edge, big **+** and **−** buttons ("hold to walk up/down (raise/lower) your
   bid"), a "go!" at the start, and "tap the top of the screen to skip the auction".
   *Correction to the first brief:* "BUY $087" is not a cap on what buyers pay. It is the store's buying price, at the
   sellers' end. The window the players trade in runs from the store's buying price at the bottom to its selling price
   at the top, when it has stock.
3. **The map in production.** Each plot is framed in its owner's colour. A flag marks a plot that is claimed but not
   developed. A picture of the installation (mine, farm, drill) marks a developed plot. The units it produced stand on
   it as small bars in the owner's colour. Assay markers (dots and a sensor) sit on some plots. The store stands in the
   middle of the map, on the river.
4. **Goods flying home.** After production the bars leave their plots and fly down into each player's slot in the
   bottom bar.
5. **Events in production.** A "+1" badge with a good's icon on the plots an event boosted, their bar stacks one
   higher.
6. **The bottom bar, always there.** Every player's money in their own slot, plus "Human" and your own stock of the four
   goods.
7. **The store interior.** Two rows of booths around an open floor. The top row is the outfitters, one per good, each
   with the good's icon and its outfit price ($100, $75, $50, $25). The bottom row is the assay office, the land office,
   the pub and the MULE corral ($170, "MULES IN STOCK 0"). Every creature in the store walks the same floor, each with its
   own time bar over its head. "+$114" floats up when the pub pays out.
8. **Start of turn.** All four creatures stand in the store, their time bars empty, then filling: "You eat some food and
   fill up your time bar".

---

## 1. Land grant

**Original.** A cursor steps through the free plots in reading order; press to claim.

**Ours** (`packages/engine/src/game.ts` newSweep, `apps/web/src/phone/LandGrant.tsx`, `apps/web/src/table/TableApp.tsx`).
Reading order since Heiko's ruling on 21 Oct (PR #23). The phone has one big CLAIM button, the TV shows the cursor.

**Verdict.** Nothing to adopt. **Finding for WS4:** `TableApp.tsx:158` still tells the table "Free plots light up one by
one, in random order". That has been wrong since PR #23.

---

## 2. Development and the store

### What the original does

Development is a **walk**. Your creature stands on the map. You walk it to the store, and when it reaches the door
**your screen changes to the inside of the store**. Inside you walk to the corral and take a MULE. You lead it to an
outfitter (the booth's price is on the wall). Then you walk out of the door, across the map to one of your plots, and
install it there. Every step costs time from a bar over your head, and the bar was filled at the start of your turn by
the Food you ate. The pub ends your turn and pays more the more time you have left.

The walk is the cost structure. Building far from the store costs seconds. Forgetting the outfitter and walking back
costs seconds. Two MULEs in one turn mean two trips. Everyone is on the same floor, so you see who gets to the corral
first when there is one MULE left.

### What we do today

- **Phone** (`apps/web/src/phone/Develop.tsx`, `packages/ui/src/components/Store.tsx` StoreInterior): the store is a
  **grid of buttons**: corral, pub, green belt, six outfitters, three factory fits. You tap the corral, tap an
  outfitter, tap "Walk out to the map", tap a plot, tap "Install here". Nobody walks. The map and the store are two tabs.
- **Time** (`apps/server/src/mule-game.ts` devEndsAt): your clock starts at your Food-based time (`game.ts`
  startDevelopment: 15 to 50 s) and runs down. **The only thing that takes time off it is a geo analysis** (8 s). Buying,
  outfitting, the walk to a plot and installing are free and instant.
- **TV** (`TableApp.tsx`, development): the map, a store panel with no visitors, and a list of players marked
  BUILDING or PUB. No creatures move. (WS4's approved mock `design/mocks/holo-table/src/screens/tv/TvDevelop.tsx` does
  show avatars on the map, and `HoloMap` already takes an `avatars` prop: the screen is designed, the game behind it is
  not.)
- **Dead perk:** the Zipwing's perk is "moves twice as fast during development" (`config.ts` SPECIES_PERK.zipwingSpeed,
  commented "the client moves the colonist"). Nothing reads it. A family that picks a Zipwing gets nothing. The same
  will hold for the concept's Old road and Outpost special fields (WS5), which only matter if walking costs time.

### What that does to the game

With no walk, **time is almost worthless**. A full-time player and a hungry one can both install the same MULE in
under two seconds, so Food buys almost nothing except a bigger pub payout. Distance from the store doesn't matter, so the
concept's "Distance matters. The colonist walks during development, so far plots cost time" is not true in the game.
And the most-watched moment of the original, everyone's creatures racing across one map, is missing from the TV.

### R1 (gameplay rule): walking costs development time

- **What.** Your creature has a position and walks at a fixed speed. On the map, a walk from the store to a plot costs
  time by distance. Inside the store, booth to booth costs a little. Zipwings walk twice as fast (the perk starts
  working). Installing takes a short moment on the plot. Leaving the store with an outfitted MULE and coming back for a
  second one is a second trip.
- **How you steer it on a phone: tap to walk.** You tap a plot or a booth and your creature walks there on its own, by
  the shortest path, while your bar runs down. No joystick: steering by joystick on a phone held sideways is fiddly and
  would make the youngest player lose for reasons that have nothing to do with the game. Tapping keeps it to one tap,
  and you still *watch* your creature cross the room, which is what carries the original's feel.
- **Placeholder numbers, for the sim to set:** the store floor crossed in about 2 s; about 0.6 s per tile on the map, so
  a far plot on the 19×11 map costs about 6 s each way out of 50 s; installing 1 s. Engineers (trait) install in half
  the time, as the concept already says. Numbers go in `config.ts` (a new block in DEVELOPMENT, WS1's block, by a named
  edit).
- **Effects to measure (WS1):** plots near the store gain value, which the strategist's plotValue should see. AI hands
  must route their walk, or they get a free advantage. The balance check "7 in 10 owned plots developed by month 12"
  could fall, because each MULE now costs a trip. Hungry players now really lose MULEs, not just pub money.
- **Who decides:** Heiko (a gameplay rule). It needs WS1 sim rows before it is built. It is the concept's own rule, not a
  new one, but nothing in the game does it today.

### The store for nine goods: Decision D1

The store needs more rooms than the original's eight: the corral, **six** raw-goods outfitters (Food, Water, Energy,
Smithore, Crystite, Rare earth), the **works** counter for the three factory fits (Alloy smelter, Electronics works,
Medicine lab, as the concept already says), the green belt, and the pub. The original's assay office and land office
have no job in our game (our geo analysis happens on the plot and the drone is ordered in planning; plots are listed for
sale in planning), so they drop out. That is ten things to reach, on a phone held sideways at 844×390, with a rail on
the right.

| Option | What it is | For | Against |
|---|---|---|---|
| **A. One hall, two rows (recommended)** | One screen. Top row: the six outfitters, grown goods left, mined goods right, each booth with its icon and outfit price. Bottom row: the corral in the middle, the works on one side, the green belt beside it, the pub by the door. The open floor between the rows is where everyone walks | Everything visible at once, so you see where you are going and who is at the corral. Six top booths are about 85 px wide on the phone (844 px less the 262 px rail), well over the 44 px tap minimum. Distances are short and almost equal, so no good is cheaper to outfit just because of where its booth stands | Smaller booths than the original's four, so less room for pictures. Six outfitters in a row need clear icons and colour, not words |
| B. A wide hall that scrolls | The original's booth size, more booths in a hall wider than the screen, the view following your creature | Big booths | You can't see where to go or who is in the room, and a scroll on a phone fights the tap to walk. Where a booth stands decides how far it is, so some goods cost more time to outfit for a reason no player can see |
| C. Three grouped booths | Crops, minerals and factories, each a booth with a picker inside | Fewest booths, biggest targets | The picker is a menu again: the walk to "your" outfitter, the heart of the original's store, is lost |
| D. A ring | The corral in the centre, the ten rooms around it | Every outfitter is exactly as far from the corral | A ring doesn't fit a wide, short screen; the door, the pub and the works crowd each other |

**Recommendation: A.** It is the only option where a player sees the whole store and every rival in it at a glance,
which is what made the original's store readable, and it fits nine goods without a scroll or a menu.

**What it costs:** the store interior becomes a new phone screen (tap to walk, creatures on a floor) and the TV gets a
small view of the same floor. Without R1 it is still a better store (you see your creature and the others), but the walk
costs nothing, so R1 and D1 are best decided together.

### Smaller adoptions in development

- **The time bar fills at the start of your turn**, with the reason in words: "You ate 4 Food: 50 s" or "Short of Food:
  you ate 2 of 4, 33 s". Food buying time is the original's cleverest rule and today it is a line of small print.
- **Everyone is in the store with you.** The store floor on your phone shows the other creatures who are inside (their
  positions are public, as on the map), each with its time bar. You see the race for the last MULE.
- **The corral shows its MULEs and its price** (we already do: keep).
- **The pub payout floats up** ("+114 cr") over your creature, and on the TV over theirs.

---

## 3. Production and events

### What the original does

Production is a short show on the map. Each developed plot grows a stack of bars in its owner's colour, one per unit.
Events hit during it: a "+1" on the plots a good event lifted, losses on the plots a bad one hit. Then all the bars fly
off the map into each player's slot in the bottom bar, and the per-good summaries follow, one per good, before that
good's auction.

### What we do today

- **Engine** (`packages/engine/src/production.ts` runProduction): production is rich (ground rating, traits, species,
  adjacency and clusters, pollution, Energy shortage halves a plot, Water shortage halves a farm, factories with inputs
  and fit). But it returns **only a total per player and good** (`produced: Record<player, Stock>`). Nothing records
  what each plot made or why.
- **Events: none.** A wide search of the engine, the server and the AI for events, meteors, pirates and quakes finds
  only comments about event *risk* on terrain. The event catalogue (`docs/design/04-event-catalogue.md`, about 40
  events) is not built, and no lane owns it.
- **Phone** (`apps/web/src/phone/Results.tsx`): "Your harvest", a list of +n per good, your stock, standings.
- **TV** (`TableApp.tsx` MonthEnd): the map and a month-end panel.
- **Time:** the production phase lasts 5 s (`mule-game.ts` PHASE_MS.production).
- **The pieces exist:** `HoloMap` has a `showOutput` prop that floats "+n" over a plot, which the app doesn't use
  because the server doesn't know per-plot output.

### What that does to the game

Players can't see **why** they made what they made. The engine's best rules (clusters, Energy and Water shortages,
factory fit, pollution) are invisible at the one moment they pay out. A family sees "+6 Food" and learns nothing about
building next to their own farms or keeping Energy. The design rule in the concept, "every new system has to be
explainable in one sentence and visible on the map", fails here.

### The production show (adopt)

On the **TV**, about 15 s (R3):

1. **Plots fill.** Each working plot grows its bars, in the owner's colour, plot by plot in reading order (the same order
   as the land grant, so the eye knows where to look).
2. **Reasons pop up** as small badges on the plots they touched: `+1 cluster`, `−½ no Energy`, `−½ no Water`,
   `−1 polluted`, `+1 Mollox`. One badge per reason, the biggest first, at most two per plot.
3. **Events** (once they exist) arrive as a card, then hit their plots with a badge, and the bars grow or shrink.
4. **Factories** draw their inputs (a short pull from the owner's slot) and grow their output bars.
5. **Fly home.** All bars fly into each player's slot on the colony bar, and the slot pulses "+6 Food, +3 Energy".

On the **phone**, your own part of the same show: your plots on your map with their bars and badges, then your goods
flying into your stock strip. Tap a plot afterwards to see its full line ("Food 4: river ground 3, cluster +1, Energy ok").

**What is public.** What each plot made is public, as in the original, and as our status screen already shows everyone's
"made" before each auction. What you **hold** stays private (the big-screen rule): the TV shows bars flying into a
player's slot and the "+n" they made, never their total stock.

**What it needs:**
- **From the engine:** `runProduction` also returns, per plot, the units made and the reasons, from the numbers it
  already computes. That is WS1's file (`production.ts`): a named additive edit, no rule change, the sim byte-identical.
- **From the server:** the production phase stays up long enough for the show (R3: 5 s → about 15 s, or until every
  phone presses Ready, as today). It adds about 10 s to a month of about 5 minutes.
- **Events:** a PM question. The show is ready for them, but there is nothing to show until someone builds the
  catalogue. When they are built, they resolve **inside production, before the fly-home**, as in the original and our
  catalogue's "resolve phase".

---

## 4. The auction

### What the original does

Per good: a summary screen where you choose Buy/Hold or Sell; then the board. Sellers start at the top and walk down,
buyers start at the bottom and walk up, and two dashed lines span the board: the lowest current ask and the highest
current bid. You watch the gap between them close; when they touch, units change hands. The store's buying price is
the floor at the bottom and its stock is on the board. Each creature shows its units and surplus.

### What we do today

(`apps/web/src/phone/Auction.tsx`, `apps/web/src/components/AuctionParts.tsx`, `packages/ui/src/components/WalkBoard.tsx`,
`packages/engine/src/walk.ts`, `auction.ts`; all WS3's except the board, which is shared UI.)

- **Three stages per good:** a status screen (StatusTable), a declare stage (Buyer / Seller / Pass), then the walk.
- **The board is already the original's:** sellers start at the top, buyers at the bottom; hold Up/Down or drag; the
  store's selling price (a ceiling for buyers while it has stock), its buying price (the sellers' floor) and the export
  ship's price are dashed lines with labels; a deal glows as a bar with "×3 @ 105". Each creature carries its ASK or BID.
- **Missing:**
  - The **best-bid and best-ask lines.** The board shows every creature's own price, but nothing shows the gap: you
    have to compare creature heights by eye.
  - **Units on the board.** Your have/need/spare is in the rail; nobody else's units are on the board, so a buyer can't
    see which seller still has stock.
  - **The store's stock** is not on the board or the status screen.
- **Doc conflict:** `docs/design/07-big-screen-mode.md` says the TV auction has "buyers at the top, sellers at the
  bottom". The code and the original both put sellers at the top. The doc is wrong (PM-owned).

### What to adopt (WS3's screens)

1. **Two moving lines**, spanning the players' columns: **lowest ask** (in the sellers' colour, labelled "ASK 105") and
   **highest bid** (in the buyers' colour, "BID 92"). The store's and ship's lines stay as they are, but solid and quieter,
   because they are limits, not moves. When the two lines meet they merge into the glowing trade bar we already draw.
   The gap between them is labelled ("13 apart") so a child can read it.
2. **Units under each creature:** "12 (+4)" for a seller, "2 (−3)" for a buyer, units held and surplus or shortage,
   counting down live as units trade.
3. **The store on the board:** "STORE BUYS 87" at the floor, "STORE SELLS 105 · 12 in stock" at the ceiling, or
   "SOLD OUT" with no ceiling line.
4. **R2: declare on the status screen**, as the original does: the status table with two big buttons, Buy and Sell (Pass
   as the default if you press nothing). One stage fewer per good, and you choose while looking at the numbers that
   decide it. With up to nine goods a month, that saves the most screen-flips of anything here.

**Phone and TV.** The TV is the auction's stage: all columns, the two lines, the store. The phone keeps a smaller
board plus the two big hold buttons and your own line.

---

## 5. The status screen before each good

**Original:** Last round · Produced · Used/Lost · Total · Needed · Surplus/Shortage, plus the store's price and stock, and
the Buy/Sell choice.

**Ours** (StatusTable): Had · Used · Made · Now · Needs · Spoils · Surplus. That is the same information plus Spoils,
which the original doesn't have. **Keep it.** Add the store's price and stock (beside it, as the original does), and the
declare (R2).

---

## 6. The colony bar

**Original:** one bar along the bottom, always there: every player's money in their colour, and your own stock.

**Ours:** the phone rail shows your money in its header; your stock appears only on some screens (StockPanel). The TV has
a player list that changes per phase.

**Adapt.** The original puts your stock on the one shared screen because it has one human. We split it:
- **TV:** a colony bar with every player's slot: creature, name, money (public in our rules, as in the original). It is
  where goods fly home after production and where the pub payout lands.
- **Phone:** a thin private strip of your nine goods with their counts, on every screen of the game, where your goods
  land after production.

WS4 owns the shell and the TV.

---

## 7. What this does to the month's length

| Change | Time |
|---|---|
| R1 walking | None: development is a fixed clock; you get less done in it |
| Production show (R3) | +10 s |
| Declare on the status screen (R2) | up to −5 s per good that comes up (WALK.declareMs is 5 s), so it saves more than the show costs on a month with three or more goods |

So the month stays near its 5 minutes.

---

## 8. Findings for other lanes

| For | Finding |
|---|---|
| WS4 | `TableApp.tsx:158` says the land grant goes "in random order"; it is reading order since PR #23 |
| WS1 | `SPECIES_PERK.zipwingSpeed` is read by nothing: the Zipwing perk does nothing today |
| PM | `07-big-screen-mode.md` has buyers and sellers the wrong way round on the TV auction |
| PM | No event system exists in the engine; no lane owns the event catalogue |
| WS5 | Old road and Outpost only matter once walking costs time (R1) |

## 9. What comes next

1. **D1 (the store layout) and R1 (walking costs time)** go to Heiko through the PM, together.
2. Mocks in `design/mocks/ws6-ux/` (phone 844×390 and TV 1280×720): the store interior, the auction with the two lines,
   the production show with the fly-home, and the start-of-turn time bar.
3. After Heiko approves the mocks: the spec and plan (`docs/specs/2026-10-21-ws6-ux.md`, `docs/plans/2026-10-21-ws6-ux.md`)
   with who builds which screen.
