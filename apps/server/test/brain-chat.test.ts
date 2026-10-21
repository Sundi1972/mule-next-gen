import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BRAIN } from '@mule/engine';
import type { DecisionRecord } from '@mule/ai';
import { createBrain, type BrainSeat, type BrainService } from '../src/brain/index.js';
import { fakeSdk, KEY } from './brain-fakes.js';

const CAP = BRAIN.linesPerMonth;

interface Step {
  seat: string;
  month: number;
  phase: string;
  line: string | null;
}

interface Row {
  name: string;
  steps: Step[];
  /** say throws when handed this line. */
  sayThrowsOn?: string;
  /** Every say call, in order, as [seat, line]. */
  said: Array<[string, string]>;
}

/** `count` distinct lines for one seat in one month, each in a phase of its own. */
const linesOf = (seat: string, month: number, count: number, from = 1): Step[] =>
  Array.from({ length: count }, (_, i) => ({ seat, month, phase: `phase ${from + i}`, line: `${seat} m${month} #${from + i}` }));
const said = (steps: Step[]): Array<[string, string]> => steps.map((s) => [s.seat, s.line!]);

const record = ({ seat, month, phase, line }: Step): DecisionRecord => ({
  id: 0,
  seat,
  kind: 'develop',
  month,
  phase,
  topic: null,
  candidates: [],
  shortlist: [],
  pick: { id: 'a', key: 'a', label: 'Option a' },
  by: 'top',
  line,
  waitedMs: 0,
});

const rows: Row[] = [
  (() => {
    const kept = linesOf('p0', 1, CAP);
    return { name: 'a null line says nothing, uses no slot and leaves its phase open', steps: [{ seat: 'p0', month: 1, phase: 'phase 1', line: null }, ...kept], said: said(kept) };
  })(),
  (() => {
    const kept = linesOf('p0', 1, CAP);
    return { name: 'each new phase in the same month says, up to the cap', steps: kept, said: said(kept) };
  })(),
  (() => {
    const first = { seat: 'p0', month: 1, phase: 'phase 1', line: 'p0 first' };
    const again = { seat: 'p0', month: 1, phase: 'phase 1', line: 'p0 again' };
    const rest = linesOf('p0', 1, CAP - 1, 2);
    return { name: 'a second line in the same phase says nothing and uses no slot', steps: [first, again, ...rest], said: said([first, ...rest]) };
  })(),
  (() => {
    const kept = linesOf('p0', 1, CAP);
    return { name: 'the month cap still binds across phases', steps: [...kept, ...linesOf('p0', 1, 2, CAP + 1)], said: said(kept) };
  })(),
  (() => {
    const first = linesOf('p0', 1, CAP);
    const next = linesOf('p0', 2, CAP);
    return {
      name: 'a new month allows lines again',
      steps: [...first, ...linesOf('p0', 1, 1, CAP + 1), ...next, ...linesOf('p0', 2, 1, CAP + 1)],
      said: said([...first, ...next]),
    };
  })(),
  (() => {
    const at = (month: number, line: string): Step => ({ seat: 'p0', month, phase: 'auction', line });
    return { name: 'the phase memory resets with the month', steps: [at(1, 'm1 a'), at(1, 'm1 b'), at(2, 'm2 a'), at(2, 'm2 b')], said: said([at(1, 'm1 a'), at(2, 'm2 a')]) };
  })(),
  (() => {
    const p0 = linesOf('p0', 1, CAP + 1);
    const p1 = linesOf('p1', 1, CAP + 1);
    return {
      name: 'two seats are counted separately, in the same phases',
      steps: p0.flatMap((s, i) => [s, p1[i]!]),
      said: p0.slice(0, CAP).flatMap((s, i) => [...said([s]), ...said([p1[i]!])]),
    };
  })(),
  (() => {
    const kept = linesOf('p0', 1, CAP);
    const blanks = ['', '   ', '\n\t '].map((line) => ({ seat: 'p0', month: 1, phase: 'phase 1', line }));
    return { name: 'a blank line says nothing, uses no slot and leaves its phase open', steps: [...blanks, ...kept], said: said(kept) };
  })(),
  (() => {
    const failing = { seat: 'p0', month: 1, phase: 'phase 1', line: 'p0 boom' };
    const rest = linesOf('p0', 1, CAP);
    return {
      name: 'a throwing say does not escape, uses its slot and marks its phase said',
      steps: [failing, ...rest],
      sayThrowsOn: failing.line,
      said: said([failing, ...rest.slice(1)]),
    };
  })(),
];

/** Plays each row through fresh onDecision callbacks from `service`, one per seat, and returns the say calls. */
function play(service: BrainService, row: Row): Array<[string, string]> {
  const calls: Array<[string, string]> = [];
  const callbacks = new Map<string, (record: DecisionRecord) => void>();
  const onDecisionFor = (id: string) => {
    let cb = callbacks.get(id);
    if (!cb) {
      const seat: BrainSeat = { id, persona: 'trader', level: 'rookie' };
      cb = service.chatter(seat, (line) => {
        calls.push([id, line]);
        if (line === row.sayThrowsOn) throw new Error('unknown seat');
      });
      callbacks.set(id, cb);
    }
    return cb;
  };
  for (const step of row.steps) expect(() => onDecisionFor(step.seat)(record(step)), row.name).not.toThrow();
  return calls;
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-chat-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('table chat throttle', () => {
  it('T-AC-5: at most BRAIN.linesPerMonth lines per seat per month, and one per phase, reach say', () => {
    expect(CAP).toBeGreaterThan(1);
    for (const row of rows) {
      const service = createBrain({
        gameId: 'g-chat',
        env: KEY,
        logPath: path.join(dir, 'costs.jsonl'),
        sdkFactory: () => fakeSdk(() => Promise.reject(new Error('no call expected'))),
      });
      expect(play(service, row), row.name).toEqual(row.said);
      service.finish();
    }
  });

  it('T-AC-5: the Classic brain (no key) keeps its template lines to the same cap and one per phase', () => {
    for (const row of rows) {
      const service = createBrain({ gameId: 'g-chat', env: {}, logPath: path.join(dir, 'costs.jsonl') });
      expect(service.deciderFor({ id: 'p0', persona: 'trader', level: 'rookie' }), 'Classic').toBeNull();
      expect(play(service, row), row.name).toEqual(row.said);
    }
  });
});
