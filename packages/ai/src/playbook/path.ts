import type { Playbook, Strategy } from '@mule/engine';
import type { DraftPhase } from './draft.js';

/** The parts of a playbook a hand plays. */
export type PartKey = 'planning' | 'landGrant' | 'development' | 'auction';

/** What a hand plays for a part: the part, the strategy it serves, and whose it is. */
export interface PlayedPart<K extends PartKey> {
  part: NonNullable<Playbook[K]>;
  strategy: Strategy;
  by: 'adopted' | 'own';
}

/** What RULE-6 reads of a seat. */
export interface PathInput {
  /** AI_PLANS.on. */
  on: boolean;
  /** The seat's `playbook` option. */
  playbook: boolean | undefined;
  hasDecider: boolean;
  /** The seat's adopted playbooks, oldest first. */
  adopted: readonly Playbook[];
  month: number;
  key: PartKey;
}

export type PlayPath = { by: 'today' } | { by: 'adopted'; playbook: Playbook } | { by: 'own' };

/** RULE-6: who plays a month's part, first match wins. */
export function pathFor(_input: PathInput): PlayPath {
  throw new Error('NotImplemented: path-for');
}

/** RULE-7's adopt: the adopted list once `playbook` is in effect. */
export function adoptInto(_adopted: readonly Playbook[], _playbook: Playbook): Playbook[] {
  throw new Error('NotImplemented: adopt-into');
}

/** The draft phase that writes each part. */
export const DRAFT_PHASE_OF: Record<PartKey, DraftPhase> = {
  planning: 'planning',
  landGrant: 'planning',
  development: 'development',
  auction: 'auction',
};
