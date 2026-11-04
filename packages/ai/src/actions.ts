import type { AuctionSide, GameState, Office, Outfit, Phase, TaxPromise } from '@mule/engine';

/**
 * The moves an AI seat makes: exactly the ones a human's phone can send. The
 * server turns each into the same intent a phone sends and runs it through
 * the same checks; the simulator applies it with the same engine calls.
 */
export type AiAction =
  | { type: 'claim'; x: number; y: number }
  | { type: 'buyMule' }
  | { type: 'outfit'; outfit: Outfit }
  | { type: 'install'; x: number; y: number }
  | { type: 'analyse'; x: number; y: number }
  | { type: 'filter'; x: number; y: number }
  | { type: 'pub' }
  | { type: 'declare'; side: AuctionSide }
  | { type: 'walk'; dir: -1 | 0 | 1 }
  /** At the store's or the ship's line in the goods walk: trade this many units with it, then stop (A-6). */
  | { type: 'lineTrade'; units: number }
  /** Run for an office; null withdraws. A Governor run carries a promise (RULE-10). */
  | { type: 'run'; office: Office | null; promise?: TaxPromise }
  /** A secret ballot for a contested office; null clears it. */
  | { type: 'vote'; office: Office; candidate: string | null }
  /** The Governor's sales tax, in whole percent. */
  | { type: 'setTax'; percent: number }
  /** Done with this auction or election stage, or not done after all. */
  | { type: 'done'; done: boolean }
  /** Planning: send the geo drone over one or two free or listed plots. */
  | { type: 'drone'; plots: { x: number; y: number }[] }
  /** Planning: put a plot, or the MULE on one, up for the land auction. */
  | { type: 'list'; item: { kind: 'plot' | 'mule'; x: number; y: number }; minimum: number; unsold: 'store' | 'keep' }
  /** Planning: take one of its listings back. */
  | { type: 'unlist'; id: string };

/** Plays one action. Returns false when the rules refused it (a RuleError), so the hands move on to the next item. */
export type Act = (action: AiAction) => boolean;

/** What a move takes from the seat. */
export interface MoveCost {
  money?: number;
  /** Credits by outfit, for a move whose price is the outfit chosen. */
  moneyByOutfit?: Partial<Record<Outfit, number>>;
  /** Development seconds. */
  seconds?: number;
  alloy?: number;
}

/** One move, described for a reader of the rules: what it is and when the engine refuses it, never when it is smart. */
export interface MoveDescriptor {
  type: AiAction['type'];
  /** The phone command it is. */
  command: string;
  phases: readonly Phase[];
  does(): string;
  /** One line per check, each the refusal text the engine throws. `{phase}` and the like stand for a value it fills in. */
  legalWhen(): readonly string[];
  /** Null when it takes nothing. */
  cost: ((state: GameState, me: string) => MoveCost) | null;
  /** Each field of the move besides its type, in plain words. */
  args: Readonly<Record<string, string>>;
}

export const MOVES: Record<AiAction['type'], MoveDescriptor> = {} as Record<AiAction['type'], MoveDescriptor>;
