/**
 * WS7's frozen contract types for politics slices 3-5 (7 Nov), held here only until WS3's contract commit puts them in
 * packages/engine/src/types.ts. Then this file is deleted and every import moves to '@mule/engine'. Do not extend it.
 */
import type { Good, Office } from '@mule/engine';

export type DealTerms = { kind: 'pact' } | { kind: 'vote'; office: Office; candidate: string } | { kind: 'vote'; law: true; yes: boolean };

export interface DealCard {
  id: string;
  from: string;
  to: string;
  terms: DealTerms;
  offered: number;
  until: number;
  status: 'offered' | 'active' | 'declined' | 'withdrawn' | 'expired' | 'kept' | 'broken';
  brokenBy: string | null;
  settled: number | null;
}

export type SabotageTarget = { kind: 'powerCut'; tile: number } | { kind: 'rumour'; good: Good; dir: 'up' | 'down' };

export interface SabotageOrder {
  id: string;
  by: string;
  month: number;
  target: SabotageTarget;
  cost: number;
  outcome: 'pending' | 'done' | 'failed' | 'caught';
  culpritPublic: boolean;
}

export type BudgetLine = 'projects' | 'welfare' | 'security';

export interface Budget {
  month: number;
  setBy: string | null;
  shares: Record<BudgetLine, number>;
}
