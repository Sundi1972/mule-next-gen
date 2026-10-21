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

/** `count` distinct lines for one seat in one month. */
const linesOf = (seat: string, month: number, count: number, from = 1): Step[] =>
  Array.from({ length: count }, (_, i) => ({ seat, month, line: `${seat} m${month} #${from + i}` }));
const said = (steps: Step[]): Array<[string, string]> => steps.map((s) => [s.seat, s.line!]);

const record = ({ seat, month, line }: Step): DecisionRecord => ({
  id: 0,
  seat,
  kind: 'develop',
  month,
  phase: 'develop',
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
    return { name: 'a null line says nothing and uses no slot', steps: [{ seat: 'p0', month: 1, line: null }, ...kept], said: said(kept) };
  })(),
  (() => {
    const kept = linesOf('p0', 1, CAP);
    return { name: 'the cap reached says nothing more', steps: [...kept, ...linesOf('p0', 1, 2, CAP + 1)], said: said(kept) };
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
    const p0 = linesOf('p0', 1, CAP + 1);
    const p1 = linesOf('p1', 1, CAP + 1);
    return {
      name: 'two seats are counted separately',
      steps: p0.flatMap((s, i) => [s, p1[i]!]),
      said: p0.slice(0, CAP).flatMap((s, i) => [...said([s]), ...said([p1[i]!])]),
    };
  })(),
  (() => {
    const kept = linesOf('p0', 1, CAP);
    const blanks = ['', '   ', '\n\t '].map((line) => ({ seat: 'p0', month: 1, line }));
    return { name: 'a blank line says nothing and uses no slot', steps: [...blanks, ...kept], said: said(kept) };
  })(),
  (() => {
    const failing = { seat: 'p0', month: 1, line: 'p0 boom' };
    const rest = linesOf('p0', 1, CAP);
    return { name: 'a throwing say does not escape and uses its slot', steps: [failing, ...rest], sayThrowsOn: failing.line, said: said([failing, ...rest.slice(0, CAP - 1)]) };
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
  it('T-AC-5: at most BRAIN.linesPerMonth lines per seat per month reach say', () => {
    expect(CAP).toBeGreaterThan(0);
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

  it('T-AC-5: the Classic brain (no key) keeps its template lines to the same cap', () => {
    for (const row of rows) {
      const service = createBrain({ gameId: 'g-chat', env: {}, logPath: path.join(dir, 'costs.jsonl') });
      expect(service.deciderFor({ id: 'p0', persona: 'trader', level: 'rookie' }), 'Classic').toBeNull();
      expect(play(service, row), row.name).toEqual(row.said);
    }
  });
});
