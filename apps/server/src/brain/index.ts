import type { AiLevelId, AiPersonaId, GameState } from '@mule/engine';
import type { Decider, DecisionRecord } from '@mule/ai';
import type { HaikuSdk } from './client.js';

/** The seat a decider is built for: its id, persona and level. */
export interface BrainSeat {
  id: string;
  persona: AiPersonaId;
  level: AiLevelId;
}

/** What the game sees of the brain (§9 read contract). */
export interface BrainService {
  deciderFor(seat: BrainSeat): Decider | null;
  chatter(seat: BrainSeat, say: (line: string) => void): (record: DecisionRecord) => void;
  finish(state?: GameState): void;
}

export interface BrainOptions {
  gameId: string;
  env?: Readonly<Record<string, string | undefined>>;
  logPath?: string;
  sdkFactory?: (apiKey: string) => HaikuSdk;
  now?: () => number;
}

export function createBrain(_options: BrainOptions): BrainService {
  throw new Error('NotImplemented: create-brain');
}
