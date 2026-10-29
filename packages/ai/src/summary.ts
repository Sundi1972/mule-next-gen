import { airBand, GOODS, monthNeeds, mulePrice, type GameState } from '@mule/engine';
import { GOOD_NAME, leaderOf, outfitName } from './strategist.js';
import type { Mind } from './value.js';

/** A few plain lines on the seat's situation, from its own observation, for a language model deciding in character. */
export function situation(obs: GameState, mind: Mind): string {
  const me = obs.players.find((p) => p.id === mind.me)!;
  const mine = obs.tiles.filter((t) => t.owner === mind.me);
  const outfits = new Map<string, number>();
  for (const t of mine) if (t.outfit) outfits.set(outfitName(t.outfit), (outfits.get(outfitName(t.outfit)) ?? 0) + 1);
  const need = monthNeeds(obs, mind.me);
  const stock = GOODS.filter((g) => me.stock[g] > 0 || need[g] > 0)
    .map((g) => `${GOOD_NAME[g]} ${me.stock[g]}${need[g] > 0 ? ` (needs ${need[g]})` : ''}`)
    .join(', ');
  const leader = leaderOf(obs, mind.me);
  const leaderName = leader ? obs.players.find((p) => p.id === leader)?.name : null;
  return [
    `Month ${obs.month} of ${obs.maxMonths}, phase ${obs.phase}. Air: ${airBand(obs.air).name}.`,
    `You have ${me.money} credits, ${mine.length} plots (${mine.length - [...outfits.values()].reduce((a, b) => a + b, 0)} idle${outfits.size ? `; ${[...outfits].map(([k, n]) => `${n} ${k}`).join(', ')}` : ''}).`,
    `Your goods: ${stock || 'none'}.`,
    `A MULE costs ${mulePrice(obs)}; the store has ${obs.store.mules}.`,
    leaderName ? `The richest rival looks like ${leaderName}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
