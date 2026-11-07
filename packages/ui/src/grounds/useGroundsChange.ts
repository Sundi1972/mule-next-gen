/** RULE-5: what leans in at the month end, read from the views this screen has seen (spec C5). */
import { useState } from 'react';
import type { GroundsColony, GroundsProject } from './ColonyGrounds';
import type { GridPlace } from './layout';

export type GroundsStage = GroundsProject['stage'];

/** A project whose stage moved since the last month end this screen saw; `from` is null for one it had not seen. */
export interface GroundsChange {
  id: GroundsProject['id'];
  name: string;
  from: GroundsStage | null;
  to: GroundsStage;
  place: GridPlace | null;
}

/** The part of a view RULE-5 reads. */
export interface MonthEndView {
  phase: string;
  month: number;
  colony?: GroundsColony | null | undefined;
}

/** What a screen keeps between views. */
export interface SeenViews {
  phase: string;
  month: number;
  /** Each project's stage at the last month end this screen saw; null before it has seen one. */
  stages: Record<string, GroundsStage> | null;
  /** At a month end this screen saw come: what changed since the one before, [] for its first; null otherwise. */
  changes: GroundsChange[] | null;
}

const MONTH_END = 'upkeep';

function stagesOf(colony: GroundsColony | null | undefined): Record<string, GroundsStage> {
  return Object.fromEntries((colony?.projects ?? []).map((p) => [p.id, p.stage]));
}

function changesSince(stages: Record<string, GroundsStage>, colony: GroundsColony | null | undefined): GroundsChange[] {
  return (colony?.projects ?? []).flatMap((p) => {
    const from = stages[p.id] ?? null;
    return from === p.stage ? [] : [{ id: p.id, name: p.name, from, to: p.stage, place: p.place ?? null }];
  });
}

/** The first view a screen gets. Joining at the month end it never saw the month end come, so nothing leans in. */
export function firstSeen(view: MonthEndView): SeenViews {
  return { phase: view.phase, month: view.month, stages: view.phase === MONTH_END ? stagesOf(view.colony) : null, changes: null };
}

/** The screen's memory after one more view; the same object while the phase and month stay. */
export function seeView(seen: SeenViews, view: MonthEndView): SeenViews {
  if (view.phase === seen.phase && view.month === seen.month) return seen;
  if (view.phase !== MONTH_END) return { phase: view.phase, month: view.month, stages: seen.stages, changes: null };
  return {
    phase: view.phase,
    month: view.month,
    stages: stagesOf(view.colony),
    changes: seen.stages ? changesSince(seen.stages, view.colony) : [],
  };
}

/**
 * RULE-5 on this screen: at a month end it saw come, the projects whose stage moved since the last month end it saw ([]
 * at its first); null in any other phase, or at a month end it joined. Call it where the screen stays mounted across
 * phases, or it forgets the month end before.
 */
export function useGroundsChange(view: MonthEndView): GroundsChange[] | null {
  const [seen, setSeen] = useState(() => firstSeen(view));
  const next = seeView(seen, view);
  // Adjusted while rendering, so the month end's first frame already knows what changed.
  if (next !== seen) setSeen(next);
  return next.changes;
}
