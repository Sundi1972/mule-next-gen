/** What an AI seat knows of each other player: counted public facts between the two, rebuilt from the record. */
import { BRAIN, observe, type GameState, type Good, type Office, type PlayerId, type PlotIndex, type TaxPromise } from '@mule/engine';
import type { PhaseFact } from '../playbook/index.js';

/** Who of the two was the seller. */
type Side = 'me' | 'them';

export interface Relation {
  /** Auction trades between the two, oldest first. */
  trades: { month: number; good: Good; qty: number; price: number; seller: Side }[];
  /** Plots and MULEs one sold the other at the land auction, oldest first. */
  sales: { month: number; item: 'plot' | 'mule'; plot: PlotIndex; price: number; seller: Side }[];
  /** Plots near the top of the seat's own ranking that this player claimed first, oldest first. */
  tookWanted: { month: number; plot: PlotIndex }[];
  /** The deal cards between the two, by how they stand. */
  pacts: { active: number; kept: number; brokenByThem: number; brokenByMe: number };
  /** The office this player runs for now, with its tax promise; null when not running. */
  running: { office: Office; promise: TaxPromise | null } | null;
  reputation: number;
}

/** Every other player's relation to the seat, by id. */
export type Memory = Readonly<Record<PlayerId, Relation>>;

const OFFICES: readonly Office[] = ['governor', 'sheriff'];

/**
 * The seat's memory of every other player, from the public notices and the seat's own observation only: no other seat's
 * goods, no ground it has not analysed, no fact private to two others. `wanted` is the seat's land ranking by month.
 */
export function relationMemory(state: GameState, me: PlayerId, notices: readonly PhaseFact[], wanted: ReadonlyMap<number, readonly PlotIndex[]>): Memory {
  const obs = observe(state, me);
  const memory: Record<PlayerId, Relation> = {};
  for (const p of obs.players) {
    if (p.id === me) continue;
    memory[p.id] = { trades: [], sales: [], tookWanted: [], pacts: { active: 0, kept: 0, brokenByThem: 0, brokenByMe: 0 }, running: runningOf(obs, p.id), reputation: p.reputation };
  }
  const other = (a: string, b: string): Relation | undefined => (a === me ? memory[b] : b === me ? memory[a] : undefined);
  for (const n of notices) {
    if ('parties' in n && n.parties !== undefined && !n.parties.includes(me)) continue;
    if (n.kind === 'trade') {
      other(n.buyer, n.seller)?.trades.push({ month: n.month, good: n.good, qty: n.qty, price: n.price, seller: n.seller === me ? 'me' : 'them' });
    } else if (n.kind === 'sale') {
      other(n.buyer, n.seller)?.sales.push({ month: n.month, item: n.item, plot: n.plot, price: n.price, seller: n.seller === me ? 'me' : 'them' });
    } else if (n.kind === 'claim' && n.seat !== me) {
      if ((wanted.get(n.month) ?? []).slice(0, BRAIN.social.wantedPlots).includes(n.plot)) memory[n.seat]?.tookWanted.push({ month: n.month, plot: n.plot });
    }
  }
  for (const d of obs.politics?.deals ?? []) {
    const r = other(d.from, d.to);
    if (!r) continue;
    if (d.status === 'active') r.pacts.active++;
    else if (d.status === 'kept') r.pacts.kept++;
    else if (d.status === 'broken') r.pacts[d.brokenBy === me ? 'brokenByMe' : 'brokenByThem']++;
  }
  return memory;
}

function runningOf(obs: GameState, id: PlayerId): Relation['running'] {
  const pol = obs.politics;
  const office = OFFICES.find((o) => pol?.candidates[o]?.includes(id));
  if (!pol || !office) return null;
  return { office, promise: pol.promises[id] ?? null };
}
