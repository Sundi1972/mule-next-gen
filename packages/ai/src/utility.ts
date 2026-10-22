/**
 * Utility scoring in the style of Dave Mark's Infinite Axis Utility System:
 * each option is scored by named considerations, each a number from 0 to 1
 * that a response curve made from one fact about the game, with a reason a
 * person can read. A persona weight raises a consideration to a power (0
 * ignores it, above 1 makes it matter more). The scores multiply, with Mark's
 * compensation so an option with many considerations isn't punished for
 * having them. Hard rules veto an option outright; vetoed options never
 * reach a shortlist.
 */

export interface Consideration {
  name: string;
  /** 0 to 1, from the response curve. */
  score: number;
  /** The persona's exponent on this consideration. */
  weight: number;
  reason: string;
}

export interface Candidate<A> {
  /** Stable within one decision, e.g. "install:food:4,2". */
  key: string;
  /** Short words for a person: "Food farm on the river plot C4". */
  label: string;
  action: A;
  /** Expected credits gained, for logs and limits. */
  value: number;
  considerations: Consideration[];
  utility: number;
  /** Set when a hard rule drops the option. */
  veto: string | null;
  /** The considerations that mattered, in words. */
  rationale: string;
}

/** Response curves. Each maps a fact to 0..1. */
export const curve = {
  /** 0.5 at zero, 0.75 at +scale, 0.25 at -scale: a gain in credits. */
  gain: (credits: number, scale: number) => 0.5 + 0.5 * Math.tanh((0.5493 * credits) / Math.max(1, scale)),
  /** 0 below lo, 1 above hi, linear between. */
  ramp: (x: number, lo: number, hi: number) => (hi <= lo ? (x >= hi ? 1 : 0) : Math.min(1, Math.max(0, (x - lo) / (hi - lo)))),
  /** Keeps a score off zero so one weak fact doesn't erase an option. */
  floor: (score: number, min: number) => min + (1 - min) * Math.min(1, Math.max(0, score)),
};

export function consider(name: string, score: number, weight: number, reason: string): Consideration {
  return { name, score: Math.min(1, Math.max(0, score)), weight, reason };
}

/** The compensated product of the weighted considerations. */
export function utilityOf(considerations: Consideration[]): number {
  if (considerations.length === 0) return 0;
  const n = considerations.length;
  const makeUp = 1 - 1 / n;
  let total = 1;
  for (const c of considerations) {
    const s = Math.pow(c.score, Math.max(0, c.weight));
    total *= s + (1 - s) * makeUp * s;
  }
  return total;
}

/** Builds a scored candidate. The rationale lists the considerations furthest from neutral first. */
export function candidate<A>(key: string, label: string, action: A, value: number, considerations: Consideration[], veto: string | null = null): Candidate<A> {
  const telling = [...considerations].filter((c) => c.weight > 0).sort((x, y) => Math.abs(y.score - 0.5) * y.weight - Math.abs(x.score - 0.5) * x.weight);
  return {
    key,
    label,
    action,
    value: Math.round(value),
    considerations,
    utility: veto ? 0 : utilityOf(considerations),
    veto,
    rationale: veto ? `Ruled out: ${veto}` : telling.slice(0, 3).map((c) => c.reason).join('; '),
  };
}

export interface Shortlist<A> {
  /** Every candidate, best first, vetoed ones last. */
  all: Candidate<A>[];
  /** The near-best options the decider chooses from, best first. */
  options: Candidate<A>[];
}

/** The best few candidates within `tolerance` of the best utility, at most `size`. Always at least one if any survives the hard rules. */
export function shortlist<A>(cands: Candidate<A>[], size: number, tolerance: number): Shortlist<A> {
  const all = [...cands].sort((x, y) => Number(!!x.veto) - Number(!!y.veto) || y.utility - x.utility || x.key.localeCompare(y.key));
  const alive = all.filter((c) => !c.veto);
  const best = alive[0]?.utility ?? 0;
  const options = alive.filter((c, i) => i === 0 || c.utility >= best * (1 - tolerance)).slice(0, Math.max(1, size));
  return { all, options };
}
