/**
 * A stand-in for WS1's move descriptors, to be deleted when `MOVES` lands in actions.ts, which WS1 owns.
 * The rule text is the refusal each check in packages/engine and apps/server sends; the numbers are read from config.
 */
import type { GameState, Phase } from '@mule/engine';
import type { AiAction } from '../actions.js';
import type { PlayerId } from '@mule/engine';

/** The phone intents' `type`s, as packages/protocol's MuleIntent has them; @mule/ai does not depend on the protocol. */
export type IntentType =
  | 'ready'
  | 'drone'
  | 'claim'
  | 'buyMule'
  | 'outfit'
  | 'install'
  | 'analyse'
  | 'filter'
  | 'pub'
  | 'declare'
  | 'walk'
  | 'list'
  | 'unlist'
  | 'run'
  | 'vote'
  | 'setTax'
  | 'continue'
  | 'steer'
  | 'act';

export interface MoveArg {
  name: string;
  kind: 'plot' | 'good' | 'outfit' | 'office' | 'player' | 'number' | 'boolean' | 'enum';
  values?: readonly string[];
}

export interface MoveDescriptor<T extends AiAction['type'] = AiAction['type']> {
  type: T;
  /** The phone command it is. */
  command: IntentType;
  /** When it can be sent. */
  phases: readonly Phase[];
  /** One plain sentence; numbers read from config at render time. */
  does: () => string;
  /** One line per rule check, each naming the refusal the server sends otherwise. */
  legalWhen: () => readonly string[];
  /** This player's cost now; null when free. */
  cost: ((state: GameState, me: PlayerId) => { credits?: number; line: string }) | null;
  args: readonly MoveArg[];
}

export type MoveTable = { readonly [T in AiAction['type']]: MoveDescriptor<T> };
