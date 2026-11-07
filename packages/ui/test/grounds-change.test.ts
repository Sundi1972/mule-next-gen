import { describe, expect, it } from 'vitest';
import type { GroundsProject } from '../src/grounds/ColonyGrounds';
import { firstSeen, seeView, type MonthEndView } from '../src/grounds/useGroundsChange';

type Stage = GroundsProject['stage'];

const park = (stage: Stage): GroundsProject => ({ id: 'park', name: 'Park', stage, buildMonths: 1, monthsLeft: stage === 'building' ? 1 : null, place: { x: 1, y: 2, w: 1, h: 1 } });
const hospital = (stage: Stage): GroundsProject => ({ id: 'hospital', name: 'Hospital', stage, buildMonths: 2, monthsLeft: stage === 'building' ? 2 : null, place: { x: 2, y: 3, w: 1, h: 1 } });

const view = (phase: string, month: number, projects: GroundsProject[]): MonthEndView => ({ phase, month, colony: { gauges: { happiness: 60, wealth: 0 }, projects } });
const planning = (month: number, ...projects: GroundsProject[]) => view('planning', month, projects);
const monthEnd = (month: number, ...projects: GroundsProject[]) => view('upkeep', month, projects);

type Found = [string, Stage | null, Stage][] | 'no baseline' | null;

/** The views one screen sees, in order; what RULE-5 finds at the last one, as [id, from, to], or that it had no month end to diff. */
function seen(views: MonthEndView[]): Found {
  let memory = firstSeen(views[0]!);
  for (const v of views.slice(1)) memory = seeView(memory, v);
  const found = memory.changes;
  if (found === null) return null;
  return found.baseline ? found.changes.map((c) => [c.id, c.from, c.to]) : 'no baseline';
}

describe('T-AC-7: RULE-5, what leans in at the month end', () => {
  it.each<[string, MonthEndView[], Found]>([
    [
      'a stage change between two month ends leans in on that place',
      [planning(1, park('building')), monthEnd(1, park('building')), planning(2, park('building')), monthEnd(2, park('standing'))],
      [['park', 'building', 'standing']],
    ],
    [
      'a project the last month end did not have leans in too',
      [monthEnd(1, park('standing')), planning(2, park('standing'), hospital('commissioned')), monthEnd(2, park('standing'), hospital('building'))],
      [['hospital', null, 'building']],
    ],
    ['a month whose stages all stay leans in on none', [monthEnd(1, park('standing')), planning(2, park('standing')), monthEnd(2, park('standing'))], []],
    ['no baseline: the first month end this screen sees, though the Park just stood, is not a quiet month', [planning(1, park('building')), monthEnd(1, park('standing'))], 'no baseline'],
    ['no baseline: a screen that opened in planning has none at its first month end, whatever it sees', [planning(4, park('standing')), monthEnd(4, park('standing'), hospital('building'))], 'no baseline'],
    ['a first view leans in on none: a reload into the month end plays nothing', [monthEnd(2, park('standing'))], null],
    [
      'the same month end sent again (someone readies) keeps what it found',
      [monthEnd(1, park('building')), planning(2, park('building')), monthEnd(2, park('standing')), monthEnd(2, park('standing'))],
      [['park', 'building', 'standing']],
    ],
    ['outside the month end nothing leans in', [monthEnd(1, park('building')), planning(2, park('building')), monthEnd(2, park('standing')), planning(3, park('standing'))], null],
    [
      'a screen that reloaded into a month end diffs the next one against it',
      [monthEnd(1, park('building')), planning(2, park('building')), monthEnd(2, park('damaged'))],
      [['park', 'building', 'damaged']],
    ],
  ])('T-AC-7: %s', (_, views, found) => {
    expect(seen(views)).toEqual(found);
  });
});
