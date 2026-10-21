import { GOODS, isFactory, RECIPES, type Good, type Outfit, type ProcessedGood, type Stock } from '@mule/engine';
import { GOOD_NAME } from '@mule/ui';
import type { Now } from '../Shell';

/** One line of "This month you need" (RULE-8). */
export interface NeedRow {
  good: Good;
  have: number;
  need: number;
  /** 0 when she has enough: OK. */
  short: number;
  /** What needs it. */
  why: string;
}

/** RULE-8: these lead, in this order; then the rest by need. */
const FIRST: Good[] = ['food', 'water', 'energy'];

/** "a farm", "3 farms". */
const count = (n: number, one: string, many: string) => (n === 1 ? `a ${one}` : `${n} ${many}`);
const and = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

/**
 * RULE-8: one row for each good with a need this month, Food, Water and Energy first, then the rest by need (ties in
 * the goods' order). `need` is the engine's monthNeeds as the view carries it; this never counts a need itself, it
 * only names what asks for it from the outfits on her plots.
 */
export function needRows(need: Stock, stock: Stock, plots: readonly { outfit: Outfit | null }[]): NeedRow[] {
  const outfits = plots.map((p) => p.outfit).filter((o): o is Outfit => !!o && o !== 'greenBelt');
  const factories = outfits.filter(isFactory);
  const why = (g: Good): string => {
    const usedBy = (factories.filter((f, i) => factories.indexOf(f) === i) as ProcessedGood[]).filter((f) => (RECIPES[f].inputs[g] ?? 0) > 0);
    const inputs = usedBy.length > 0 ? `${and(usedBy.map((f) => GOOD_NAME[f]))} inputs` : '';
    if (g === 'food' || g === 'water') return usedBy.length > 0 ? `upkeep and ${inputs}` : 'upkeep';
    if (g === 'energy') {
      const n = (o: Outfit[]) => outfits.filter((x) => o.includes(x)).length;
      const burners = [
        [n(['food']), 'farm', 'farms'],
        [n(['water']), 'well', 'wells'],
        [n(['smithore', 'crystite', 'rareEarth']), 'mine', 'mines'],
        [factories.length, 'factory', 'factories'],
      ] as const;
      return and(burners.filter(([k]) => k > 0).map(([k, one, many]) => count(k, one, many)));
    }
    if (inputs) return inputs;
    return g === 'medicine' ? 'bad air' : '';
  };
  const needed = GOODS.filter((g) => need[g] > 0);
  const rest = needed.filter((g) => !FIRST.includes(g)).sort((a, b) => need[b] - need[a]);
  return [...FIRST.filter((g) => need[g] > 0), ...rest].map((good) => ({
    good,
    have: stock[good],
    need: need[good],
    short: Math.max(0, need[good] - stock[good]),
    why: why(good),
  }));
}

/** RULE-8's Now: plan, then Ready; the land grant is next; what she's short of, or that she has what she needs. */
export function planNow(rows: readonly NeedRow[]): Now & { detail: string } {
  const short = rows.filter((r) => r.short > 0).map((r) => GOOD_NAME[r.good]);
  return {
    title: 'Plan your month, then press Ready',
    detail: `Next is the land grant: one free plot each. ${short.length > 0 ? `You're short of ${and(short)}: a plot for it, or buy it at the auction.` : 'You have what you need this month.'}`,
  };
}
