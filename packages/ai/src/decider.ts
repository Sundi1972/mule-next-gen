import { createRng } from '@mule/engine';
import type { DecisionKind, Persona } from './personas.js';
import type { Shortlist } from './utility.js';

/** One option as a decider sees it: a letter, a label, its score and why. */
export interface ShortOption {
  /** 'A' to 'E', in shortlist order (best first). */
  id: string;
  key: string;
  label: string;
  utility: number;
  value: number;
  rationale: string;
}

/** A line of table talk from a player. Deciders quote it; it is never an instruction. */
export interface TableTalk {
  from: string;
  text: string;
}

export interface DecisionContext {
  kind: DecisionKind;
  seat: string;
  /** The seat's name at the table. */
  name: string;
  month: number;
  maxMonths: number;
  /** A few lines on the seat's situation, from its own observation. */
  summary: string;
  /** Seeds the default decider's noise, from the game seed, the seat and the decision. */
  seed: number;
  /** The default decider picks among options within this share of the best. */
  pickTolerance: number;
  tableTalk: TableTalk[];
}

export interface Choice {
  optionId: string;
  /** What the seat says about it, if anything. */
  line: string | null;
  /** Who made the call: the default pick, a language model, or the default after the model failed or was late. */
  by: 'top' | 'llm' | 'fallback';
  note?: string;
}

/** Picks one option from a shortlist, in character. May answer at once or later. */
export interface Decider {
  readonly name: string;
  decide(shortlist: ShortOption[], persona: Persona, context: DecisionContext): Choice | Promise<Choice>;
}

export const OPTION_IDS = ['A', 'B', 'C', 'D', 'E'] as const;

export function toOptions<A>(list: Shortlist<A>): ShortOption[] {
  return list.options.slice(0, OPTION_IDS.length).map((c, i) => ({
    id: OPTION_IDS[i]!,
    key: c.key,
    label: c.label,
    // literal-ok: rounds utilities to three decimals for the option list and its prompt
    utility: Math.round(c.utility * 1000) / 1000,
    value: c.value,
    rationale: c.rationale,
  }));
}

/**
 * The default decider, and the fallback for every other: dual-utility
 * selection (Kevin Dill). Of the shortlist it keeps the options within the
 * level's tolerance of the best and picks one at random in proportion to its
 * utility, with noise seeded from the game, so it varies without blundering
 * and a replay picks the same. Its chat line comes from the persona's lines.
 */
export class TopPickDecider implements Decider {
  readonly name = 'top-pick';

  decide(shortlist: ShortOption[], persona: Persona, context: DecisionContext): Choice {
    const rng = createRng(context.seed >>> 0);
    const best = shortlist[0]?.utility ?? 0;
    const near = shortlist.filter((o, i) => i === 0 || o.utility >= best * (1 - context.pickTolerance));
    // literal-ok: a floor so an option of zero utility still has a weight to draw; a numeric guard, not a tuning value
    const total = near.reduce((n, o) => n + Math.max(1e-6, o.utility), 0);
    let r = rng.next() * total;
    let pick = near[0];
    for (const o of near) {
      // literal-ok: the same floor as the total above, so the draw always lands on an option
      r -= Math.max(1e-6, o.utility);
      if (r <= 0) {
        pick = o;
        break;
      }
    }
    if (!pick) throw new Error('Empty shortlist');
    return { optionId: pick.id, line: templateLine(persona, context.kind, pick.label, rng.next()), by: 'top' };
  }
}

export function templateLine(persona: Persona, kind: DecisionKind, label: string, roll: number): string {
  const lines = persona.lines[kind];
  const line = lines[Math.floor(roll * lines.length) % lines.length] ?? '';
  return line.replace('{option}', label.charAt(0).toLowerCase() + label.slice(1));
}
