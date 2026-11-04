import { describe, expect, it } from 'vitest';
import type { Playbook } from '@mule/engine';
import { adoptInto, pathFor, type PartKey, type PathInput } from '../src/playbook/index.js';

/** A playbook for `month` carrying `parts`, told apart by its tag. pathFor reads which parts it has, never their content. */
function pb(tag: string, month: number, parts: PartKey[]): Playbook {
  const carried = Object.fromEntries(parts.map((k) => [k, {}])) as Partial<Playbook>;
  return {
    v: 1,
    seat: 'ai0',
    month,
    phase: 'month',
    strategy: { kind: 'builder', moneyMaker: null, monopolyTarget: null, cashFloor: 0, landTarget: { plots: 0, byMonth: 0 }, stances: {}, reason: tag },
    by: 'llm',
    lessons: [tag],
    ...carried,
  };
}

const LAND = pb('land', 2, ['landGrant']);
const LAND_DEV = pb('landDev', 2, ['landGrant', 'development']);
const DEV = pb('dev', 2, ['development']);
const OLD = pb('old', 1, ['planning', 'landGrant', 'development', 'auction']);

const CLASSIC: Omit<PathInput, 'key'> = { on: true, playbook: undefined, hasDecider: false, adopted: [], month: 2 };
const SMART: Omit<PathInput, 'key'> = { ...CLASSIC, hasDecider: true };

const said = (input: PathInput) => {
  const path = pathFor(input);
  return path.by === 'adopted' ? `adopted:${path.playbook.lessons![0]}` : path.by;
};

describe('RULE-6, the path a part plays (pure)', () => {
  it('RULE-6: each row of the decision table, first match wins', () => {
    const rows: [string, PathInput, string][] = [
      ['row 1: AI_PLANS.on false', { ...CLASSIC, on: false, adopted: [LAND], key: 'landGrant' }, 'today'],
      ['row 1: AI_PLANS.on false, Smart', { ...SMART, on: false, adopted: [LAND], key: 'landGrant' }, 'today'],
      ['row 1: built with playbook false', { ...CLASSIC, playbook: false, adopted: [LAND], key: 'landGrant' }, 'today'],
      ['row 1 not met: playbook true is the default', { ...CLASSIC, playbook: true, key: 'landGrant' }, 'own'],
      ['row 2: adopted, Classic', { ...CLASSIC, adopted: [LAND], key: 'landGrant' }, 'adopted:land'],
      ['row 2: adopted, Smart', { ...SMART, adopted: [LAND], key: 'landGrant' }, 'adopted:land'],
      ['row 2: the newest that carries the part wins', { ...CLASSIC, adopted: [LAND, LAND_DEV], key: 'landGrant' }, 'adopted:landDev'],
      ['row 2: the newest, the other way round', { ...CLASSIC, adopted: [LAND_DEV, LAND], key: 'landGrant' }, 'adopted:land'],
      ['row 2: a newer one lacking the part falls through', { ...SMART, adopted: [LAND, DEV], key: 'landGrant' }, 'adopted:land'],
      ['row 2: each part its own', { ...SMART, adopted: [LAND, DEV], key: 'development' }, 'adopted:dev'],
      ['row 3: Smart, nothing adopted', { ...SMART, key: 'planning' }, 'today'],
      ['row 3: Smart, nothing adopted carries the part', { ...SMART, adopted: [LAND, DEV], key: 'auction' }, 'today'],
      ['row 4: Classic, nothing adopted', { ...CLASSIC, key: 'development' }, 'own'],
      ['row 4: Classic, nothing adopted carries the part', { ...CLASSIC, adopted: [LAND, DEV], key: 'planning' }, 'own'],
      ["unknown: an earlier month's adoption is ignored, Classic", { ...CLASSIC, adopted: [OLD], key: 'landGrant' }, 'own'],
      ["unknown: an earlier month's adoption is ignored, Smart", { ...SMART, adopted: [OLD, DEV], key: 'landGrant' }, 'today'],
    ];
    expect(rows.map(([name, input]) => [name, said(input)])).toEqual(rows.map(([name, , want]) => [name, want]));
  });

  it("RULE-7: adopt keeps every playbook of the newest month, ignores an earlier month's, and a repeat changes nothing", () => {
    const tags = (list: readonly Playbook[]) => list.map((p) => p.lessons![0]);
    const NEXT = pb('next', 3, ['auction']);
    const rows: [string, Playbook[], Playbook, string[]][] = [
      ['the first', [], LAND, ['land']],
      ['the same month, kept beside', [LAND], DEV, ['land', 'dev']],
      ['an earlier month, ignored', [LAND, DEV], OLD, ['land', 'dev']],
      ['a later month, in effect alone', [LAND, DEV], NEXT, ['next']],
      ['the same playbook again, nothing changes', [LAND, DEV], structuredClone(LAND), ['land', 'dev']],
      ['the same month, a different one', [LAND, DEV], { ...LAND, lessons: ['land2'] }, ['land', 'dev', 'land2']],
    ];
    expect(rows.map(([name, list, playbook]) => [name, tags(adoptInto(list, playbook))])).toEqual(rows.map(([name, , , want]) => [name, want]));
    // It returns a new list; the one it was given is unchanged.
    const before = [LAND];
    adoptInto(before, DEV);
    expect(tags(before)).toEqual(['land']);
  });
});
