/** RULE-5: what leans in at the month end, read from the views this screen has seen (spec C5). */
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

export interface SeenViews {
  phase: string;
  month: number;
  stages: Record<string, GroundsStage> | null;
  changes: GroundsChange[] | null;
}

export function firstSeen(_view: MonthEndView): SeenViews {
  throw new Error('NotImplemented: firstSeen');
}

export function seeView(_seen: SeenViews, _view: MonthEndView): SeenViews {
  throw new Error('NotImplemented: seeView');
}
