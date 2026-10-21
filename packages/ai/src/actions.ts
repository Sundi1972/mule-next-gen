import type { AuctionSide, Office, Outfit } from '@mule/engine';

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
  /** Run for an office; null withdraws. */
  | { type: 'run'; office: Office | null }
  /** A secret ballot for a contested office; null clears it. */
  | { type: 'vote'; office: Office; candidate: string | null }
  /** The Governor's sales tax, in whole percent. */
  | { type: 'setTax'; percent: number }
  /** Done with this auction or election stage, or not done after all. */
  | { type: 'done'; done: boolean };

/** Plays one action. Returns false when the rules refused it (a RuleError), so the hands move on to the next item. */
export type Act = (action: AiAction) => boolean;
