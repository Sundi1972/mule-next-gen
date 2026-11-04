import { airBand, GAME, GOODS, POLITICS, POLLUTION, type Good, type Stock } from '@mule/engine';
import type { MuleView, PlayerView, ScorePartsView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { toSlot } from '../../../../../apps/web/src/game/derive';
import { ME, VIEW } from '../fixture';

/**
 * Worth: the one number a player is ranked by, in credits, the same every month and at the game's end (Heiko agreed
 * the model 2026-10-28, via the PM). Pure functions over a view, for the month-end screen (#monthend) and, later, the
 * planning hub's "2nd of 4" (HubAudit's standings, with that story's office terms).
 *
 *   Worth = cash + goods at the store's posted price + land (GAME.plotScore a plot) + installed MULEs (the store's
 *           MULE price each) + office terms (POLITICS.termScore a term) [+ colony donations 1:1, with G-5]
 *   In Collapse: (cash + goods + land + MULEs + offices) × POLLUTION.collapseScore, rounded: the cut takes every line,
 *   offices too (Heiko, WS4's AM-31).
 *
 * This is the engine's final score, line by line: scoreParts() in packages/engine/src/game.ts already adds exactly
 * these lines, in this order, with this rounding. So the month-end Worth and the game-over score are one function;
 * WS3's job is to send `scores` every month, not only at game over (MuleView.scores, ScorePartsView on your own row
 * only), plus last month's totals. Every number below comes from @mule/engine's config except the two G-5 constants.
 *
 * GRAFT TARGET: none on the client. The server computes Worth with scoreParts(); apps/web reads view.scores. This
 * file stands in for the server so the mock's numbers add up.
 */

// --- Constants config does not have yet ----------------------------------------------------------

/**
 * WS1 sets this. Heiko agreed (2026-10-28) that colony donations count 1:1 in a player's Worth: one credit given to
 * the colony fund is one credit of Worth. Donations do not exist yet (G-5); the breakdown shows a greyed line.
 */
export const DONATION_WORTH = 1;

/**
 * WS1 sets this. The colony score (G-5, not built) is scaled by the colonists' mood: about 0.8× in unrest up to 1.2×
 * thriving. Shown only as the greyed slot's explanation until G-5 lands.
 */
export const MOOD_SCALE = { unrest: 0.8, thriving: 1.2 } as const;

/** The colony score's parts before the mood scales them (G-5): what the greyed slot names. */
export const COLONY_SCORE_PARTS = ['colony wealth', 'air', 'prestige'] as const;

/** The share Collapse takes off, from the engine's collapseScore (0.8 keeps four fifths). */
export const COLLAPSE_CUT = 1 - POLLUTION.collapseScore;
/** "a fifth" for 0.2; a percentage for anything WS1 might change it to. */
export const collapseCutWords = () => (Math.abs(COLLAPSE_CUT - 0.2) < 1e-9 ? 'a fifth' : `${Math.round(COLLAPSE_CUT * 100)}%`);

// --- Mock-only stand-ins for what the server knows ------------------------------------------------

/**
 * MOCK ONLY: the fixture's market lists five goods; the real view lists all nine. Lena holds 1 Alloy, so it needs a
 * posted price. Never a rule number.
 */
const FIXTURE_PRICE_GAPS: Partial<Record<Good, number>> = { alloy: 140 };

/**
 * MOCK ONLY. The server values every player's goods from their real stock (scoreParts' stockValue) and sends each
 * OTHER player's Worth as a total, never their goods or this line. The fixture view carries only Lena's stock, so the
 * others' goods values are fixed here. Lena's comes from her stock, so the TV and her phone agree.
 */
export const SERVER_GOODS_VALUE: Record<string, number> = {
  lena: stockValue(ME.stock, VIEW),
  ossa: 545,
  brix: 662,
  kai: 318,
};

/**
 * MOCK ONLY: terms served so far (the engine's politics.terms; not in the view: WS3 adds it). Ossa governed months
 * 1–3; Lena won month 4's election (the election mock's result, ElectionAudit), Governor only (Heiko 2026-10-28).
 */
export const TERMS_SERVED: Record<string, number> = { ossa: 1, lena: 1 };

// --- The model ------------------------------------------------------------------------------------

/** A good's posted price this month, as the store posted it (MarketRow.price; the engine's state.store.posted). */
export function postedPrice(view: Pick<MuleView, 'market'>, good: Good): number {
  return view.market.find((r) => r.good === good)?.price ?? FIXTURE_PRICE_GAPS[good] ?? 0;
}

/** Goods at the store's posted price. */
export function stockValue(stock: Stock, view: Pick<MuleView, 'market'>): number {
  return GOODS.reduce((sum, g) => sum + stock[g] * postedPrice(view, g), 0);
}

/** True when the air is in Collapse: Worth then shows the cut (engine colonyFailed). */
export const inCollapse = (view: Pick<MuleView, 'air'>) => view.air.band === 'collapse';

/** Your own lines: the protocol's ScorePartsView, plus the terms behind the office line and the coming donations. */
export type WorthParts = ScorePartsView & {
  terms: number;
  /** Units of goods held, for the line's label. */
  units: number;
  /** Always 0 until G-5 builds donations. */
  donations: number;
};

export interface Worth {
  id: string;
  /** The number everyone is ranked by: in Collapse, with the cut on every line. */
  total: number;
  /** Before the Collapse cut. Equal to total out of Collapse. */
  uncut: number;
  /** What Collapse takes off: 0 out of Collapse. */
  cut: number;
  /** Line by line, ONLY for the viewer's own row; null for everyone else and on the TV (goods are private). */
  parts: WorthParts | null;
}

/**
 * A player's Worth in this view. The viewer's own row carries its parts; anyone else's is a total only, as the server
 * would send it. Mirrors scoreParts(): keep its order of addition and its rounding.
 */
export function worthOf(view: MuleView, id: string, termsServed: Record<string, number> = TERMS_SERVED): Worth {
  const p = view.players.find((x) => x.id === id);
  if (!p) throw new Error(`worthOf: no player ${id}`);
  const own = view.me?.id === id;
  const goods = own ? stockValue(view.me!.stock, view) : (SERVER_GOODS_VALUE[id] ?? 0);
  const land = p.plots * GAME.plotScore;
  const mules = view.tiles.filter((t) => t.owner === id && t.outfit !== null).length;
  const muleValue = mules * view.mulePrice;
  const raw = p.money + goods + (land + muleValue);
  const before = Math.round(raw);
  const terms = termsServed[id] ?? 0;
  const office = terms * POLITICS.termScore;
  const total = inCollapse(view) ? Math.round((raw + office) * POLLUTION.collapseScore) : before + office;
  const money = Math.round(p.money);
  const parts: WorthParts | null = own
    ? {
        money,
        goods: before - money - land - muleValue,
        units: GOODS.reduce((n, g) => n + view.me!.stock[g], 0),
        plots: p.plots,
        land,
        mules,
        muleValue,
        office,
        terms,
        cut: before + office - total,
        donations: 0,
      }
    : null;
  return { id, total, uncut: before + office, cut: before + office - total, parts };
}

export interface LeagueRow extends Worth {
  player: PlayerView;
  slot: Slot;
  /** 1 for the leader; equal Worth shares a rank. */
  rank: number;
  /** Since last month's end, in the number shown then and now; null with no last month (month 1). */
  change: number | null;
}

export interface League {
  rows: LeagueRow[];
  /** The leader and their lead over second place; `by` 0 when two or more share first. */
  leader: { id: string; by: number; level: string[] } | null;
}

/**
 * The league table: every player by Worth, highest first, with the change since last month. `lastMonth` is each
 * player's Worth as it showed at last month's end (cut then if the air was in Collapse then): WS3 sends it.
 */
export function league(view: MuleView, lastMonth: Record<string, number> | null, termsServed: Record<string, number> = TERMS_SERVED): League {
  const sorted = view.players
    .map((player) => ({ player, slot: toSlot(player.slot), w: worthOf(view, player.id, termsServed) }))
    .sort((a, b) => b.w.total - a.w.total || a.player.slot - b.player.slot);
  const rows: LeagueRow[] = sorted.map(({ player, slot, w }) => ({
    ...w,
    player,
    slot,
    rank: 1 + sorted.filter((o) => o.w.total > w.total).length,
    change: lastMonth && lastMonth[player.id] !== undefined ? w.total - lastMonth[player.id]! : null,
  }));
  const top = rows[0];
  const level = rows.filter((r) => r.rank === 1).map((r) => r.player.id);
  const second = rows.find((r) => r.rank > 1);
  const leader = top ? { id: top.player.id, by: level.length > 1 || !second ? 0 : top.total - second.total, level } : null;
  return { rows, leader };
}

// --- The colony panel's numbers -------------------------------------------------------------------

/**
 * What the month-end needs beyond today's view. WS3 adds these view fields; the engine already records most of them:
 * MonthReport.air and .colonyFund per month (the history), needsOf() and upkeep's eating per player.
 */
export interface MonthFacts {
  /** Each player's Worth at last month's end, as shown then. */
  lastWorth: Record<string, number>;
  /** The air gauge at last month's end (MonthReport.air). */
  lastAir: number;
  /** Money into the colony fund this month, by source. Sales tax only until slice 5 adds the others. */
  fundIn: { what: string; cr: number }[];
  /** The offices paid at upkeep, from POLITICS.pay, as far as the fund reached. */
  paid: { office: keyof typeof POLITICS.pay; to: string }[];
  /** Players short of Food at upkeep: units eaten against their household's need. Public at month end (a rule change). */
  hungry: { id: string; ate: number; need: number }[];
  /** False when the colonists went short of Food or Water (MonthReport.colonistsHungry). */
  colonistsFed: boolean;
}

export type AirTrend = 'better' | 'worse' | 'same';

export interface ColonyReport {
  air: { level: number; band: MuleView['air']['band']; last: number; lastBand: MuleView['air']['band']; delta: number; trend: AirTrend };
  fund: { balance: number; start: number; in: number; out: number; inLines: { what: string; cr: number }[]; outLines: { what: string; to: string; cr: number }[] };
  hungry: MonthFacts['hungry'];
  colonists: number;
  colonistsFed: boolean;
}

const OFFICE_NAME: Record<keyof typeof POLITICS.pay, string> = { governor: 'Governor', sheriff: 'Sheriff' };

/** The colony panel: air against last month (a higher gauge is worse air), the fund's month, and who went hungry. */
export function colonyReport(view: MuleView, facts: MonthFacts): ColonyReport {
  const delta = view.air.level - facts.lastAir;
  const inLines = facts.fundIn;
  const outLines = facts.paid.map((p) => ({ what: `the ${OFFICE_NAME[p.office]}'s pay`, to: p.to, cr: POLITICS.pay[p.office] }));
  const fin = inLines.reduce((s, l) => s + l.cr, 0);
  const fout = outLines.reduce((s, l) => s + l.cr, 0);
  return {
    air: { level: view.air.level, band: view.air.band, last: facts.lastAir, lastBand: airBand(facts.lastAir).name, delta, trend: delta > 0 ? 'worse' : delta < 0 ? 'better' : 'same' },
    fund: { balance: view.treasury.money, start: view.treasury.money - fin + fout, in: fin, out: fout, inLines, outLines },
    hungry: facts.hungry,
    colonists: view.colonists,
    colonistsFed: facts.colonistsFed,
  };
}
