import { stableJson, type Playbook, type Strategy } from '@mule/engine';
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

/** RULE-6: who plays a month's part, first match wins. Of the playbooks adopted for the month, the newest carrying it. */
export function pathFor({ on, playbook, hasDecider, adopted, month, key }: PathInput): PlayPath {
  if (!on || playbook === false) return { by: 'today' };
  const carrying = adopted.filter((pb) => pb.month === month && pb[key] !== undefined).at(-1);
  if (carrying) return { by: 'adopted', playbook: carrying };
  return hasDecider ? { by: 'today' } : { by: 'own' };
}

/**
 * RULE-7's adopt, as a new list: kept beside the others of its month, alone for a later month, ignored for an earlier
 * one, and ignored when the same playbook is already in effect.
 */
export function adoptInto(adopted: readonly Playbook[], playbook: Playbook): Playbook[] {
  const newest = adopted.at(-1)?.month ?? -Infinity;
  if (playbook.month < newest) return [...adopted];
  if (playbook.month > newest) return [structuredClone(playbook)];
  const json = stableJson(playbook);
  if (adopted.some((pb) => stableJson(pb) === json)) return [...adopted];
  return [...adopted, structuredClone(playbook)];
}

/** The draft phase that writes each part. */
export const DRAFT_PHASE_OF: Record<PartKey, DraftPhase> = {
  planning: 'planning',
  landGrant: 'planning',
  development: 'development',
  auction: 'auction',
};
