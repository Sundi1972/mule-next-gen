# WS7 · Politics & Diplomacy: pacts, sabotage, elections, Governor, Sheriff, laws and taxes

**Lane:** WS7 Politics & Diplomacy · **Class:** Programme (proposed: new engine modules, a new AI hand, protocol and server named edits, more than 3 PRs) · **Status:** §0 DRAFT, sent to the PM for Heiko on 2026-10-22. **Serves Mission Goal G-4.**
**Branch:** `ws7-politics` (base `feat/strategist` 8683d21) · **Design source:** `docs/design/05-colony-politics.md`, `docs/design/00-concept.md` (Diplomacy, Sabotage, Markets: no direct trading), `docs/design/06-ai-players.md` · **Screens:** WS6's planning-hub mock is the binding scaffold (desks not mocked yet).

---

## §0 · Business Goals & Value `[handoff: goal lines and proofs]` `[review-only: who / today / value / cost]`

All three goals trace to Mission G-4: "The table plays politics: players make and break pacts, whisper, sabotage, elect a Governor and a Sheriff, and vote laws and taxes, and it changes how the game goes." Heiko, 2026-10-22: planning is where you "chat with people ..., plan sabotage, plan elections, do politics, chat privately to people; if I am the governor I can manage the colony, set taxes; the sheriff can do his stuff."

**P-1 · The table governs itself: it elects a Governor and a Sheriff, the Governor sets the sales tax, and the colony votes laws that change the rules.**
- *Who benefits:* every player at the kitchen table, and most of all the players who are behind: the council is how the table reins in a runaway leader (05-colony-politics, "Laws").
- *Today:* none of it exists. Nobody holds an office; the sales tax is a constant 5% for the whole game (`packages/engine/src/config.ts::TAX`, set once in `packages/engine/src/game.ts::createGame`); the colony fund only fills and is never spent; there are no laws and no votes. The only things to do in the 45-second planning phase are a geo drone and listing a lot (`packages/protocol/src/index.ts::MuleIntent`). Heiko on the 22 Oct playtest: planning has "no sense of what to do or why". (verified_by: read)
- *Value:* planning gets its own game: four elections, a tax that moves, a vote every month whose result everyone sees revealed at once. A leader can be voted down instead of only outbid. This is the slow, social half of the game the design promises next to the real-time half.
- **UBER-AC-1:** `pnpm sim` on both seed sets (1-40 and 101-140) with politics on prints a politics row: in every game an election runs in months 1, 4, 7 and 10 and fills both offices, a Governor sets the sales tax in every month, and at least one law passes in at least half the games. Every balance check that passes with politics off still passes with it on.
- **UBER-AC-2:** an e2e with two phones and AI seats: in month 1 both humans run for Governor and vote; the ballots reveal on every screen at the same moment after a countdown; the winner sets the sales tax, and the next sale on the auction is taxed at the new rate.

**P-2 · Players make pacts and keep or break them, and everyone can see who is trustworthy.**
- *Who benefits:* players who want to cooperate or scheme, and a solo player at a table of AI seats, who need AI players that remember how they were treated (00-concept, "Solo play").
- *Today:* whispers and five reactions already work (`packages/tabletop/src/protocol.ts::ChatMessage` has a `to`, `packages/protocol/src/index.ts::EMOTES`, the phone's `apps/web/src/phone/parts.tsx::Chat` picks a recipient). But talk binds nothing: there are no deal cards, and `reputation` is set to 50 at the start and never changes (`packages/engine/src/game.ts::createGame`). (verified_by: read)
- *Value:* an agreement becomes a card one tap accepts, with a cost for breaking it, so a promise across the table means something; a reputation number on every screen shows who keeps their word, and it feeds vote weight.
- **UBER-AC-3:** an e2e with two phones: Lena whispers Brix, attaches a non-aggression pact card, and Brix accepts it with one tap; both phones list the pact. When Lena is later caught sabotaging Brix, her reputation falls by the pact-break amount on every screen. An AI seat offered the same card answers it within the planning phase with no API key set.

**P-3 · Players sabotage each other in secret, and the Sheriff can guard, catch and fine them.**
- *Who benefits:* players who like risk and suspicion, and whoever is elected Sheriff, who gets a job of their own.
- *Today:* players have no sabotage order, no guards and no fines. The AI already carries the intent without the move: a `saboteur` persona with a `spite` weight and a per-level `sabotage` switch, off for Rookie (`packages/engine/src/config.ts::AI_PERSONAS`, `::AI_LEVELS`), used today only to bid up the leader in the auction (`packages/ai/src/strategist.ts`). (verified_by: read; `grep -rni -e sabot -e sheriff -e governor packages/*/src apps/*/src`)
- *Value:* the "Caught!" moment and the doubt when nobody is caught (00-concept, "Moments built for the table"), and a reason to elect a Sheriff you trust.
- **UBER-AC-4:** in a seeded engine test, a sabotage order against a plot the Sheriff guards fails, and the saboteur's name is revealed in that month's report; an unguarded order succeeds or fails on its seeded odds, and its target plot makes nothing that month. In the sim, AI seats order sabotage in some months and the balance checks still pass.

**Non-goals** (each needs its own spec, or waits for a system another lane builds):
- **Direct trading of anything of value**, including through deal cards (00-concept, 21 Oct). Deal cards carry pacts, votes and promises only.
- **Whispers and reactions as a feature:** they exist; WS7 only attaches deal cards to them. AI whispers and AI chat lines are WS2's (its chat seam).
- **Colony projects** (reservoir, levee, observatory ...) and the **Projects** budget line: they protect against events (pirates, plague, meteors, the long winter) that do not exist yet; WS1 has built ten production events only.
- **Laws that need another lane's system first:** price cap and windfall tax (the auction, WS3), strategic reserve and anti-hoarding (the store, WS1), anti-monopoly (forced sale through the land auction, WS3), eminent domain (super tiles, not built), green zone (placement rules in development). v1 has the laws that only move money or block an action (see the decision D2 below).
- **Sabotage that needs a missing system:** tipping off the pirates (no pirates), stealing a MULE (players hold no spare MULEs).
- **Joint ventures** (shared adjacency): a production change, WS1's.
- **Reputation moving store prices:** a balance change for WS1, after the sim shows reputation moves at all.
- **Smart (language-model) seats' votes and deals:** they go through WS2's brain port once it takes these decisions; WS7's AI votes and deals are code (strategist and persona), playable with no key.
- **Screens before WS6 mocks them:** every politics screen is built into WS6's planning hub from an approved mock.

**Rough cost:** the chosen approach is about 9 PRs in five slices (engine + AI hand + server/protocol named edits + a screen per slice, plus sim rows). The thin baseline (elections and the Governor's sales tax only) is about 3 PRs (§0.1).

### Decisions for Heiko with this §0

- **D1 · Slice order.** Recommended: (1) elections, Governor and sales tax, vote weight and the Land Baron; (2) the council and its laws; (3) deal cards and reputation; (4) sabotage and the Sheriff; (5) the budget lines, the overrule vote and the inquiry. Votes come first because deal cards are mostly about votes, and the election reveal is the most visible table moment. The alternative is the spawn doc's order (diplomacy first), which builds deal cards before there is a vote to promise.
- **D2 · Laws in v1.** Recommended: the six laws that only move money or block an action: export tax, land tax, pollution tax, emission cap, sabotage ban, and (from slice 4) the Sheriff's fines under it. The other six wait for the systems named in the non-goals. Alternative: all twelve, which puts named edits into WS1's store and WS3's auction now and roughly doubles slice 2.
- **D3 · Balance.** Taxes, fines, pay and Welfare move money, so each slice that touches money ships with sim rows on both seed sets and needs Heiko's OK, with WS1 measuring. Recommended: politics is a host option, on by default (as sabotage is), so the sim and Beginner mode can run with it off.

### §0.1 · Decision Record `[review-only]`

*(Written after §0 is approved, with the approaches.)*

### §0.2 · Constraints `[handoff]`

```
HC-1  packages/engine stays pure: no I/O, no Date.now(), no Math.random(). Seeded RNG only, so a
      game replays from seed + actions, ballots and sabotage rolls included.
      source: CLAUDE.md                                                breach: fatal
HC-2  Every politics number lives in config.ts's POLITICS block, never inline.
      source: CLAUDE.md, SEAMS.md                                       breach: fatal
HC-3  Nothing of value changes hands outside an auction. A deal card never moves money, goods,
      plots or MULEs between players.
      source: 00-concept "No direct trading" (21 Oct)                   breach: fatal
HC-4  A seat sees only what a human in that seat would see: secret ballots, sabotage orders,
      guards and deal cards between two others stay out of every other seat's view and the TV.
      source: 06-ai-players "Fair play", 00-concept "private hand"      breach: fatal
HC-5  Rules errors throw RuleError; the server turns them into messages for the player.
      source: CLAUDE.md                                                 breach: fatal
HC-6  Edit only WS7's owned paths plus named edits recorded in SEAMS first.
      source: SEAMS.md                                                  breach: needs decision
HC-7  Any change that moves money (taxes, fines, pay, welfare) ships with sim rows on both seed
      sets and Heiko's OK.  source: spawn doc, SEAMS WS7               breach: needs decision
HC-8  The language-model key is never WS7's: Smart seats decide through WS2's brain port.
      source: SEAMS WS2 -> server contract                              breach: fatal
```
