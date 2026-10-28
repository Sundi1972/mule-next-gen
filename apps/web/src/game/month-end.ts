import { airBand, POLLUTION, POLITICS } from '@mule/engine';
import type { MuleView, PlayerView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { fmt, standings } from './derive';

/**
 * The month end's readings of the view (C20, from WS6's approved mock): the league table by Worth with each change
 * since last month, the lead, and how the colony is doing. No rules live here: Worth is the server's scoreParts().total
 * (`PlayerView.worth`), last month's is the server's record (`lastWorth`, `lastAir`), and the order is
 * derive.ts::standings.
 */

/** True while the air is in Collapse: every Worth then carries the cut. */
export const inCollapse = (view: Pick<MuleView, 'air'>) => view.air.band === 'collapse';

/** "a fifth" for the engine's 0.8, a percentage for anything else config may set. */
export function collapseCutWords(): string {
  const cut = 1 - POLLUTION.collapseScore;
  return Math.abs(cut - 0.2) < 1e-9 ? 'a fifth' : `${Math.round(cut * 100)}%`;
}

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export interface LeagueRow {
  player: PlayerView;
  slot: Slot;
  /** 1 for the leader; an equal Worth shares a rank. */
  rank: number;
  /** The Worth everyone is ranked by: in Collapse, the cut one. */
  total: number;
  /** Before the Collapse cut, the server's number (`worthBeforeCut`); equal to total out of Collapse. */
  uncut: number;
  /** This month's Worth against the one shown at last month's end; null with no last month. */
  change: number | null;
}

export interface League {
  rows: LeagueRow[];
  /** The leader, the lead over second place (0 when two or more share first), and who shares first. */
  leader: { id: string; by: number; level: string[] } | null;
}

/** The league table: every player by Worth, best first (derive.ts::standings), with the change since last month. */
export function league(view: MuleView): League {
  const collapse = inCollapse(view);
  const ranked = standings(view);
  const rows = ranked.map(({ player, slot, value }): LeagueRow => {
    const uncut = collapse ? (player.worthBeforeCut ?? value) : value;
    return {
      player,
      slot,
      rank: 1 + ranked.filter((o) => o.value > value).length,
      total: value,
      uncut,
      change: player.lastWorth === null ? null : value - player.lastWorth,
    };
  });
  const top = rows[0];
  const level = rows.filter((r) => r.rank === 1).map((r) => r.player.id);
  const second = rows.find((r) => r.rank > 1);
  return { rows, leader: top ? { id: top.player.id, by: level.length > 1 || !second ? 0 : top.total - second.total, level } : null };
}

const nameOf = (view: Pick<MuleView, 'players'>, id: string) => view.players.find((p) => p.id === id)?.name ?? id;

/** "Ossa leads by 210 cr", "Ossa and Lena are level"; for a seat also "You're 2nd, 210 behind". */
export function leaderWords(view: MuleView, lg: League, selfId?: string): { lead: string; you: string | null } {
  if (!lg.leader) return { lead: '', you: null };
  const { id, by, level } = lg.leader;
  const who = (x: string) => (x === selfId ? 'You' : nameOf(view, x));
  const lead =
    level.length > 1
      ? `${level
          .map(who)
          .sort((a, b) => (a === 'You' ? -1 : b === 'You' ? 1 : 0))
          .join(' and ')} are level`
      : `${who(id)} ${id === selfId ? 'lead' : 'leads'} by ${fmt(by)} cr`;
  const mine = selfId ? lg.rows.find((r) => r.player.id === selfId) : undefined;
  const top = lg.rows[0];
  const you = mine && top && mine.rank > 1 ? `You’re ${ordinal(mine.rank)}, ${fmt(top.total - mine.total)} behind` : null;
  return { lead, you };
}

/** At the game's end: "Ossa wins with a Worth of 5,643 cr", or a shared win. */
export function winnerWords(view: MuleView, lg: League): string {
  const top = lg.rows[0];
  if (!lg.leader || !top) return '';
  const worth = `${fmt(top.total)} cr`;
  return lg.leader.level.length > 1
    ? `${lg.leader.level.map((id) => nameOf(view, id)).join(' and ')} share the colony, each with a Worth of ${worth}`
    : `${nameOf(view, lg.leader.id)} wins with a Worth of ${worth}`;
}

/** A player who went short of Food this month: units eaten against the household's need. */
export interface Hungry {
  id: string;
  ate: number;
  need: number;
}

/**
 * Who went hungry this month, from each player's condition, which the view keeps through the month end (Q6): the
 * share of the month's Food they held, of the need the condition carries.
 */
export function hungerOf(view: MuleView): Hungry[] {
  return view.players.flatMap((p) => {
    if (!p.condition || p.condition.foodShare >= 1) return [];
    const need = p.condition.foodNeed;
    return [{ id: p.id, ate: Math.round(p.condition.foodShare * need), need }];
  });
}

export type AirTrend = 'better' | 'worse' | 'same';

export interface ColonyReport {
  /** The gauge now and at last month's end; null `last` in month 1. A higher gauge is worse air. */
  air: { level: number; band: MuleView['air']['band']; last: number | null; lastBand: MuleView['air']['band'] | null; trend: AirTrend | null };
  /** The colony fund now. Its in and out by source wait for the colony fund's month (WS7's producer). */
  fund: { balance: number };
  hungry: Hungry[];
  colonists: number;
  /** Whether that upkeep's store fed the colonists; null when the view doesn't say (outside the month end). */
  colonistsFed: boolean | null;
}

/** How the colony is doing, apart from the players: the air against last month, the fund, who went hungry. */
export function colonyReport(view: MuleView): ColonyReport {
  const last = view.lastAir;
  const delta = last === null ? null : view.air.level - last;
  return {
    air: {
      level: view.air.level,
      band: view.air.band,
      last,
      lastBand: last === null ? null : airBand(last).name,
      trend: delta === null ? null : delta > 0 ? 'worse' : delta < 0 ? 'better' : 'same',
    },
    fund: { balance: view.treasury.money },
    hungry: hungerOf(view),
    colonists: view.colonists,
    colonistsFed: view.colonistsFed,
  };
}

/** Your own lines, as your phone shows them: the parts from `me.worthParts`, with what each line counts. */
export function yourLines(view: MuleView) {
  const p = view.me!.worthParts;
  return {
    ...p,
    units: Object.values(view.me!.stock).reduce((n, u) => n + u, 0),
    terms: POLITICS.termScore > 0 ? Math.round(p.office / POLITICS.termScore) : 0,
  };
}
