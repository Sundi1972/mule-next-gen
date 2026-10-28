/**
 * The 35 events of Heiko's catalogue (the "M.U.L.E. Event Catalogue" Claude Doc, 28 Oct 2026), as the screens need
 * them. Direction-independent: what each event is, when it rolls, how loud it is, how it moves, and what drives it.
 * The scenes on WS6's fixture colony are in scenarios.ts; how a direction draws them is in directions/.
 */

export type Phase = 'planning' | 'landGrant' | 'development' | 'production' | 'auction' | 'upkeep';

export const PHASES: { id: Phase; name: string; rolls: string }[] = [
  { id: 'planning', name: 'Planning', rolls: 'Social and Federation events, rolled before anyone acts, so the council and the Governor can respond the same month.' },
  { id: 'landGrant', name: 'Land grant', rolls: 'One land event, as in the game today.' },
  { id: 'development', name: 'Development', rolls: 'Rolled as the walking turn starts, so sickness and theft hit the turn they are rolled in.' },
  { id: 'production', name: 'Production', rolls: 'Today’s ten events, each on its own dice, plus the new ones: two can strike together.' },
  { id: 'auction', name: 'Goods auction', rolls: 'Rolled before trading opens, so a raid or a store fire changes what is worth selling that month.' },
  { id: 'upkeep', name: 'Upkeep', rolls: 'Small personal events, and the colony’s riot and clean-up, which move the mood and the air for next month.' },
];
export const PHASE_NAME = Object.fromEntries(PHASES.map((p) => [p.id, p.name])) as Record<Phase, string>;

export type EventKey =
  | 'federationTax' | 'federationGrant' | 'immigrationWave' | 'emigrationWave' | 'festival' | 'generalStrike' | 'inheritance' | 'blamedForUnrest'
  | 'colonyPlot'
  | 'sickness' | 'muleTheft' | 'epidemic' | 'storeStrike'
  | 'dustStorm' | 'drought' | 'acidRain' | 'solarFlare' | 'cometPass' | 'flood' | 'volcanicAsh' | 'coldSnap' | 'meteorStrike'
  | 'pestSwarm' | 'wildfire' | 'bumperHarvest' | 'cavernCollapse' | 'walkout' | 'loyalCrew'
  | 'pirateRaid' | 'storeFire'
  | 'ratsInSilo' | 'crookedAccountant' | 'packageFromHome' | 'riot' | 'volunteerCleanup';

/**
 * How loud an event is on the TV. A headline takes the screen for a moment; a spotlight singles out a place on the
 * map (a player's land, one plot); bulletins never interrupt: every bulletin of a phase gathers into one roll call.
 */
export type Tier = 'headline' | 'spotlight' | 'bulletin';

/** When it ships: in the game today, wave 1 (sickness), wave 2 (the thirteen cheap new ones), or with Goal 5's mood. */
export type Wave = 'today' | 'wave1' | 'wave2' | 'goal5';
export const WAVE_NAME: Record<Wave, string> = { today: 'In the game today', wave1: 'Wave 1', wave2: 'Wave 2', goal5: 'With Goal 5' };

/**
 * PROPOSED EventKind: the motion family a direction draws. Today's engine has nine kinds; several events share one.
 * Each direction renders a kind in its own style; the event only says which, and where.
 */
export type Motion =
  | 'sweep' // a front crosses the map from an edge, plot by plot (dust, drought, acid rain, flare, comet, cold)
  | 'spread' // from one plot to the plots joined to it (pests, fire)
  | 'source' // out from a map feature (the river's flood, the volcano's ash)
  | 'strike' // from the sky onto one tile (meteor)
  | 'plot' // on one plot, no travel (bumper harvest, cavern, theft, crew, colony plot)
  | 'plots' // on every plot of one good at once (walkout, general strike)
  | 'colonists' // on the colonists at the store (sickness, epidemic)
  | 'store' // at the store (store strike, store fire, riot)
  | 'ledger' // money or goods moving between slots, the colony fund and the store, no map (taxes, grants, rats...)
  | 'colony'; // a colony gauge moves: mood, air, colonists (festival, clean-up, migration)

export interface CatalogueEntry {
  key: EventKey;
  title: string;
  /** Where it rolls. MULE theft rolls in two phases, at most once a month. */
  phases: Phase[];
  sign: 'good' | 'bad' | 'neutral';
  who: 'colony' | 'area' | 'tile' | 'player' | 'cavern';
  /** The catalogue's base chance, as written there. */
  chance: string;
  /** The catalogue's effect, in its words. */
  does: string;
  wave: Wave;
  tier: Tier;
  motion: Motion;
  /** How it moves, independent of direction. */
  look: string;
  /** Drought and flood, dust storm and solar flare, festival and general strike never fall in one month. */
  opposite?: EventKey;
}

const E = (e: CatalogueEntry) => e;

export const CATALOGUE: CatalogueEntry[] = [
  // --- Planning ---
  E({ key: 'federationTax', title: 'Federation tax', phases: ['planning'], sign: 'bad', who: 'colony', chance: '2%', does: '10% of each player’s cash goes to the colony fund.', wave: 'wave2', tier: 'headline', motion: 'ledger', look: 'A Federation seal stamps the colony bar; a tenth of every player’s credits lifts off their slot into the colony fund.' }),
  E({ key: 'federationGrant', title: 'Federation grant', phases: ['planning'], sign: 'good', who: 'colony', chance: '2%', does: 'The two poorest players get 150 each.', wave: 'wave2', tier: 'headline', motion: 'ledger', look: 'Credits drop from the Federation seal into the two poorest players’ slots.' }),
  E({ key: 'immigrationWave', title: 'Immigration wave', phases: ['planning'], sign: 'good', who: 'colony', chance: '2%', does: '10% more colonists for good: the store buys more Food, Water and Energy.', wave: 'wave2', tier: 'headline', motion: 'colony', look: 'A shuttle sets down at the store and colonists file out; the colony’s head count ticks up.' }),
  E({ key: 'emigrationWave', title: 'Emigration wave', phases: ['planning'], sign: 'bad', who: 'colony', chance: '0%', does: '10% fewer colonists for good: the store buys less.', wave: 'goal5', tier: 'headline', motion: 'colony', look: 'Colonists file into a shuttle at the store, and it lifts off; the head count ticks down.' }),
  E({ key: 'festival', title: 'Festival', phases: ['planning'], sign: 'good', who: 'colony', chance: '1%', does: 'Mood +10, prestige +2, Food demand +25% this month.', wave: 'goal5', tier: 'headline', motion: 'colony', look: 'Bunting strings across the store and fireworks burst over it; the mood gauge climbs.', opposite: 'generalStrike' }),
  E({ key: 'generalStrike', title: 'General strike', phases: ['planning'], sign: 'bad', who: 'colony', chance: '0%', does: 'Announced now: this month every plot of one good makes 20%, unless the Governor pays the strikers from the colony fund.', wave: 'goal5', tier: 'headline', motion: 'plots', look: 'A placard goes up on every plot of the struck good at once; the Governor’s choice to pay is shown with the fund.', opposite: 'festival' }),
  E({ key: 'inheritance', title: 'Inheritance', phases: ['planning'], sign: 'good', who: 'player', chance: '1.5%', does: '100–300 credits, more for the poorer player.', wave: 'wave2', tier: 'bulletin', motion: 'ledger', look: 'A sealed letter drops into the player’s slot and opens into credits.' }),
  E({ key: 'blamedForUnrest', title: 'Blamed for the unrest', phases: ['planning'], sign: 'bad', who: 'player', chance: '0%', does: 'Reputation −1, so fewer votes.', wave: 'goal5', tier: 'bulletin', motion: 'ledger', look: 'Speech bubbles point at the player’s slot; one reputation pip goes out.' }),
  // --- Land grant ---
  E({ key: 'colonyPlot', title: 'Colony plot offered', phases: ['landGrant'], sign: 'neutral', who: 'tile', chance: '10%', does: 'After the grant, the colony puts one free plot up for auction.', wave: 'today', tier: 'spotlight', motion: 'plot', look: 'A flag goes up on one free plot and it pulses, marked for the auction.' }),
  // --- Development ---
  E({ key: 'sickness', title: 'Sickness', phases: ['development'], sign: 'bad', who: 'player', chance: '3%', does: 'You walk at half speed this turn; hungry and sick together can drop you to 10%.', wave: 'wave1', tier: 'bulletin', motion: 'colonists', look: 'The sick tag pops onto the colonist and their slot; one roll call names everyone sick.' }),
  E({ key: 'muleTheft', title: 'MULE theft', phases: ['development', 'upkeep'], sign: 'bad', who: 'player', chance: '1% here and 1% in upkeep', does: 'One MULE is taken off one of your plots, which stands idle until you outfit it again.', wave: 'wave2', tier: 'spotlight', motion: 'plot', look: 'A shadow crosses one plot and its MULE is gone; the plot greys to idle.' }),
  E({ key: 'epidemic', title: 'Epidemic', phases: ['development'], sign: 'bad', who: 'colony', chance: '0.5%', does: 'Everyone without Medicine is sick this turn and next.', wave: 'wave2', tier: 'headline', motion: 'colonists', look: 'A pink haze rolls out from the store over the colonists; the sick tag lands on everyone without Medicine, marked “2 turns”.' }),
  E({ key: 'storeStrike', title: 'Store strike', phases: ['development'], sign: 'bad', who: 'colony', chance: '0%', does: 'The store sells no MULEs this turn.', wave: 'goal5', tier: 'headline', motion: 'store', look: 'The store’s corral gate slams shut with a placard on it.' }),
  // --- Production ---
  E({ key: 'dustStorm', title: 'Dust storm', phases: ['production'], sign: 'bad', who: 'colony', chance: '5%', does: 'Every Energy plot loses half its output.', wave: 'today', tier: 'headline', motion: 'sweep', look: 'A wall of dust blows in from one edge and takes half of each Energy plot as it passes.', opposite: 'solarFlare' }),
  E({ key: 'drought', title: 'Drought', phases: ['production'], sign: 'bad', who: 'colony', chance: '5%', does: 'Every Food and Water plot makes 1 less.', wave: 'today', tier: 'headline', motion: 'sweep', look: 'Heat shimmer crosses the map; the ground cracks under each Food and Water plot.', opposite: 'flood' }),
  E({ key: 'acidRain', title: 'Acid rain', phases: ['production'], sign: 'bad', who: 'colony', chance: '1%', does: 'Every Energy and Food plot makes 1 less.', wave: 'today', tier: 'headline', motion: 'sweep', look: 'A sickly green rain front crosses the map; Energy and Food plots hiss as it passes.' }),
  E({ key: 'solarFlare', title: 'Solar flare', phases: ['production'], sign: 'good', who: 'colony', chance: '5%', does: 'Every Energy plot makes 2 more.', wave: 'today', tier: 'headline', motion: 'sweep', look: 'A golden wash crosses the map from the sun’s side; each Energy plot flares as it’s reached.', opposite: 'dustStorm' }),
  E({ key: 'cometPass', title: 'Comet pass', phases: ['production'], sign: 'good', who: 'colony', chance: '5%', does: 'Every Water plot makes 2 more.', wave: 'today', tier: 'headline', motion: 'sweep', look: 'A comet streaks across the sky; each Water plot glints as its tail passes.' }),
  E({ key: 'flood', title: 'Flood season', phases: ['production'], sign: 'bad', who: 'area', chance: '5%', does: 'River Food plots make nothing.', wave: 'today', tier: 'headline', motion: 'source', look: 'The river swells from its source and spills over the Food plots on its banks.', opposite: 'drought' }),
  E({ key: 'volcanicAsh', title: 'Volcanic ash', phases: ['production'], sign: 'bad', who: 'area', chance: '4%', does: 'Plots within 2 steps of a volcano or mountain make 1 less.', wave: 'today', tier: 'headline', motion: 'source', look: 'The volcano puffs a plume; grey ash settles on the plots within 2 steps, nearest first.' }),
  E({ key: 'coldSnap', title: 'Cold snap', phases: ['production'], sign: 'bad', who: 'colony', chance: '2%', does: 'Every plot needs twice its Energy this month.', wave: 'wave2', tier: 'headline', motion: 'sweep', look: 'Frost creeps in from the north over every plot; plots left short of Energy dim and lose output.' }),
  E({ key: 'meteorStrike', title: 'Meteor strike', phases: ['production'], sign: 'bad', who: 'tile', chance: '2%', does: 'Hits any tile at random; an installation on it is destroyed. The tile becomes a crater with Crystite at the top of the scale.', wave: 'wave2', tier: 'headline', motion: 'strike', look: 'A fireball falls onto one tile; the screen shakes, the MULE is lost, and a crater is left.' }),
  E({ key: 'pestSwarm', title: 'Pest swarm', phases: ['production'], sign: 'bad', who: 'player', chance: '1.5%', does: 'Starts on one of your Food plots; up to 4 joined Food plots lose half.', wave: 'today', tier: 'spotlight', motion: 'spread', look: 'A swarm crawls from farm to farm across the player’s joined Food plots.' }),
  E({ key: 'wildfire', title: 'Wildfire', phases: ['production'], sign: 'bad', who: 'player', chance: '1.5%', does: 'One of your Food plots burns; the rest of its cluster makes 1 less.', wave: 'today', tier: 'spotlight', motion: 'spread', look: 'One farm flares up and burns out; embers drift onto the farms joined to it.' }),
  E({ key: 'bumperHarvest', title: 'Bumper harvest', phases: ['production'], sign: 'good', who: 'player', chance: '1.5%', does: 'One of your plots makes double.', wave: 'today', tier: 'spotlight', motion: 'plot', look: 'One plot glows and its bars double.' }),
  E({ key: 'cavernCollapse', title: 'Cavern collapse', phases: ['production'], sign: 'bad', who: 'cavern', chance: '6%', does: 'A cavern that produced Crystite this month caves in and becomes a plain plot.', wave: 'today', tier: 'spotlight', motion: 'plot', look: 'The cavern badge cracks and sinks; dust puffs up and the plot is plain.' }),
  E({ key: 'walkout', title: 'Walkout', phases: ['production'], sign: 'bad', who: 'player', chance: '0%', does: 'Your plots of one good make 20% this month.', wave: 'goal5', tier: 'spotlight', motion: 'plots', look: 'Placards go up on all the player’s plots of one good at once; their bars drop to a fifth.' }),
  E({ key: 'loyalCrew', title: 'Loyal crew', phases: ['production'], sign: 'good', who: 'player', chance: '0%', does: 'One of your plots makes 1 more this month.', wave: 'goal5', tier: 'spotlight', motion: 'plot', look: 'A hard hat pops onto one plot and it gains a bar.' }),
  // --- Goods auction ---
  E({ key: 'pirateRaid', title: 'Pirate raid', phases: ['auction'], sign: 'bad', who: 'colony', chance: '1%', does: 'Pirates take all the Crystite the players hold, before the auction opens.', wave: 'wave2', tier: 'headline', motion: 'ledger', look: 'A pirate ship crosses the top of the screen; every player’s Crystite is pulled up out of their slot.' }),
  E({ key: 'storeFire', title: 'Store fire', phases: ['auction'], sign: 'bad', who: 'colony', chance: '1%', does: 'The store loses its whole stock of one good; that good’s price jumps until it is restocked.', wave: 'wave2', tier: 'headline', motion: 'store', look: 'Flames lick the store; one good’s stock burns to 0 and its price jumps.' }),
  // --- Upkeep ---
  E({ key: 'ratsInSilo', title: 'Rats in the silo', phases: ['upkeep'], sign: 'bad', who: 'player', chance: '1.5%', does: 'You lose half your stored Food.', wave: 'wave2', tier: 'bulletin', motion: 'ledger', look: 'Rats scurry across the player’s slot; half the Food chip goes.' }),
  E({ key: 'crookedAccountant', title: 'Crooked accountant', phases: ['upkeep'], sign: 'bad', who: 'player', chance: '1%', does: 'You lose 10% of your cash.', wave: 'wave2', tier: 'bulletin', motion: 'ledger', look: 'The ledger snaps shut and a tenth of the player’s credits slips away.' }),
  E({ key: 'packageFromHome', title: 'Package from home', phases: ['upkeep'], sign: 'good', who: 'player', chance: '1.5%', does: '+3 Food.', wave: 'wave2', tier: 'bulletin', motion: 'ledger', look: 'A parcel drops into the player’s slot and opens: +3 Food.' }),
  E({ key: 'riot', title: 'Riot', phases: ['upkeep'], sign: 'bad', who: 'colony', chance: '0%', does: 'One prestige object is damaged (no prestige until repaired); the store loses a third of its stock.', wave: 'goal5', tier: 'headline', motion: 'store', look: 'Smoke rises over the store and a prestige object cracks; the store’s stock drops by a third.' }),
  E({ key: 'volunteerCleanup', title: 'Volunteer clean-up', phases: ['upkeep'], sign: 'good', who: 'colony', chance: '1%', does: 'The air gauge drops by 5.', wave: 'goal5', tier: 'headline', motion: 'colony', look: 'Colonists sweep out from the store; the haze lifts and the air gauge drops.' }),
];

export const ENTRY = Object.fromEntries(CATALOGUE.map((e) => [e.key, e])) as Record<EventKey, CatalogueEntry>;
export const TIER = Object.fromEntries(CATALOGUE.map((e) => [e.key, e.tier])) as Record<EventKey, Tier>;
