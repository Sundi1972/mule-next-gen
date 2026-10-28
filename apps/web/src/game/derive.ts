import { DEFAULT_SPECIES, EVENTS, MAP, TERRAIN_ODDS as ENGINE_TERRAIN_ODDS, type MINERAL_ODDS, type SpecialKind as EngineSpecialKind } from '@mule/engine';
import type { MuleView, PlayerView, TableView, TileView } from '@mule/protocol';
import { GOOD_NAME, SPECIES, type Good, type MapSpecial, type MapTile, type Slot, type SpecialKind, type Species } from '@mule/ui';

/**
 * Small, pure readings of the view for the screens. No rules live here: the
 * server decides everything, these only turn its view into what the design
 * system draws.
 */

export const PHASE_NAME: Record<MuleView['phase'], string> = {
  planning: 'Planning',
  landGrant: 'Land grant',
  landAuction: 'Land auction',
  development: 'Development',
  production: 'Production',
  auction: 'Goods auction',
  upkeep: 'Upkeep',
  gameOver: 'Game over',
};

/** A colour index from the room as the design system's slot. */
export function toSlot(colour: number): Slot {
  return (colour % 6) as Slot;
}

/** A seat's colour slot is the colour it chose in the lobby, so phones and the big screen agree. */
export function slotOf(view: Pick<MuleView, 'players'>, seatId: string | null | undefined): Slot | null {
  if (!seatId) return null;
  const p = view.players.find((q) => q.id === seatId);
  return p ? toSlot(p.slot) : null;
}

/** Each slot's species, for marks drawn by slot alone. */
export function seatSpecies(view: Pick<MuleView, 'players'>): Record<Slot, Species> {
  const out = Object.fromEntries(DEFAULT_SPECIES.map((sp, i) => [i, sp])) as Record<Slot, Species>;
  for (const p of view.players) out[toSlot(p.slot)] = p.species;
  return out;
}

type SeatView = TableView<unknown>['seats'][number];

/** In the lobby, what a seat will play as: its pick, or until it picks, its seat's default. */
export function lobbySeatSpecies(seat: SeatView, index: number): Species {
  return SPECIES.find((sp) => sp === seat.pick) ?? DEFAULT_SPECIES[index % DEFAULT_SPECIES.length]!;
}

/** The design system rates ground 0 to 4; grown goods come as -2 to +3, shown on the same pips. */
export function groundPips(good: Good, rating: number): number {
  const grown = good === 'food' || good === 'water' || good === 'energy';
  return Math.max(0, Math.min(4, grown ? rating + 1 : rating));
}

/** The view's tiles as the map draws them. */
export function mapTiles(view: MuleView): MapTile[] {
  return view.tiles.map((t) => {
    const owner = slotOf(view, t.owner);
    const good = t.outfit && t.outfit !== 'greenBelt' ? t.outfit : undefined;
    const ground = t.ground ? (Object.fromEntries(Object.entries(t.ground).map(([g, n]) => [g, groundPips(g as Good, n)])) as Partial<Record<Good, number>>) : undefined;
    return {
      x: t.x,
      y: t.y,
      terrain: t.terrain,
      owner,
      ...(good ? { good } : {}),
      ...(t.peaks ? { peaks: t.peaks } : {}),
      ...(ground ? { ground } : {}),
      ...(t.pollution ? { pollution: t.pollution } : {}),
      ...(t.special ? { special: t.special } : {}),
    };
  });
}

export function tileAt(view: MuleView, x: number, y: number): TileView | undefined {
  return view.tiles[y * view.width + x];
}

export function player(view: MuleView, id: string | null | undefined): PlayerView | undefined {
  return view.players.find((p) => p.id === id);
}

/** Public standings by money, best first. Scores replace money once the game is over. */
export function standings(view: MuleView): { player: PlayerView; slot: Slot; value: number }[] {
  return view.players
    .map((p) => ({ player: p, slot: toSlot(p.slot), value: view.scores?.find((s) => s.id === p.id)?.score ?? p.money }))
    .sort((a, b) => b.value - a.value);
}

/** The colony verdict at game over, in one line everyone can repeat at the table. Air in Collapse fails it. */
export function colonyVerdict(air: MuleView['air']): { failed: boolean; title: string; line: string } {
  return air.band === 'collapse'
    ? { failed: true, title: 'The colony failed', line: 'The air ended in Collapse. The Federation cuts every score by a fifth.' }
    : { failed: false, title: 'The colony passed', line: 'The air stayed out of Collapse. Every score counts in full.' };
}

/** Seconds until an epoch-ms deadline by the server's clock. */
export function secondsUntil(endsAt: number | null | undefined, serverNow: number): number | undefined {
  return endsAt == null ? undefined : Math.max(0, (endsAt - serverNow) / 1000);
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en');

export function plotName(x: number, y: number): string {
  return `${x + 1}·${y + 1}`;
}

type TerrainOdds = (typeof ENGINE_TERRAIN_ODDS)[keyof typeof ENGINE_TERRAIN_ODDS];
type SmithoreOdds = keyof typeof MINERAL_ODDS;

const SMITHORE_HINT: Record<SmithoreOdds, string> = {
  none: 'No Smithore.',
  low: 'Little Smithore.',
  medium: 'Some Smithore.',
  high: 'Good odds of Smithore.',
  veryHigh: 'Very good odds of Smithore.',
};

/** Smithore odds this good are the plot's point, so its hint leads with them. */
const SMITHORE_LEADS: readonly SmithoreOdds[] = ['high', 'veryHigh'];

/** "Food", "Food and Water", "Food, Water and Energy". */
function listGoods(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]!;
}

function terrainHint({ grown, mined }: TerrainOdds): string {
  const rated = (level: 'good' | 'poor') =>
    Object.entries(grown)
      .filter(([, l]) => l === level)
      .map(([g]) => GOOD_NAME[g as Good]);
  const good = rated('good');
  const poor = rated('poor');
  const grownSentences = [good.length ? `Often good for ${listGoods(good)}.` : '', poor.length ? `Poor for ${listGoods(poor)}.` : ''];
  const smithore = SMITHORE_HINT[mined.smithore];
  const sentences = SMITHORE_LEADS.includes(mined.smithore) ? [smithore, ...grownSentences] : [...grownSentences, smithore];
  return sentences.filter(Boolean).join(' ');
}

/** What a plot is good for, in one line, from the engine's terrain odds. Crystite and Rare earth turn up anywhere, so no line names them. */
export const TERRAIN_ODDS: Partial<Record<TileView['terrain'], string>> = Object.fromEntries(
  Object.entries(ENGINE_TERRAIN_ODDS).map(([terrain, odds]) => [terrain, terrainHint(odds)]),
);

/** Fails to compile if the engine's special kinds and the design system's drift apart. */
type SameKinds = [SpecialKind] extends [EngineSpecialKind] ? ([EngineSpecialKind] extends [SpecialKind] ? true : never) : never;
export const SPECIAL_KINDS_MATCH: SameKinds = true;

const FX = MAP.specialEffect;
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** What a kind does, in general. The numbers are the engine's, MAP.specialEffect and the cavern's EVENTS row. */
export const SPECIAL_EFFECT: Record<SpecialKind, string> = {
  ruins: `pays its first owner ${FX.salvage.alloy} Alloy or ${FX.salvage.electronics} Electronics, once, then is gone.`,
  crystalCavern: `+${FX.crystalCavern} Crystite when mined. Each month it's mined, a ${pct(EVENTS.colony.cavernCollapse.phases.production)} chance it caves in.`,
  geyser: `+${FX.geyser} Water or Energy.`,
  oasis: `+${FX.oasis} Food.`,
  relic: `+${FX.relic} to every working plot touching it, anyone's.`,
};

/** What this plot's special field does, without its name. A ruin says which salvage it holds, since the map drew it. */
export function specialEffect(s: MapSpecial): string {
  if (s.kind === 'ruins' && s.salvage) return `the first owner salvages ${FX.salvage[s.salvage]} ${GOOD_NAME[s.salvage]}, once.`;
  return SPECIAL_EFFECT[s.kind];
}
