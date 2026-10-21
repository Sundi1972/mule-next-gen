import { describe, expect, it } from 'vitest';
import { AI_HANDS, AI_LEVELS, AI_PERSONAS, BRAIN, createGame, observe } from '@mule/engine';
import { Brain, type DecisionRecord } from '../src/brain.js';
import { PERSONAS, type DecisionKind } from '../src/personas.js';
import { candidate, consider, shortlist } from '../src/utility.js';
import type { Mind } from '../src/value.js';
import { LlmDecider, type Complete } from '../src/llm/decider.js';

const mind: Mind = { me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'rookie', level: AI_LEVELS.rookie };
const state = createGame({ seed: 7, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: true })) });
const obs = observe(state, 'p0');

const actions = ['act-a', 'act-b', 'act-c'];
const list = () => shortlist(actions.map((a, i) => candidate(a, `Option ${a}`, a, 10, [consider('fit', 0.9 - i * 0.05, 1, 'fits')])), 3, 0.5);

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Drives Brain with an LlmDecider on a fake port and settles it as the hands would. */
async function run(port: Complete, kind: DecisionKind = 'develop', waitMs = 1_500, dt = waitMs) {
  const records: DecisionRecord[] = [];
  const brain = new Brain(mind, PERSONAS.trader, 'The Gambler', 11, new LlmDecider(port), (r) => records.push(r));
  const pending = brain.ask(kind, list(), obs, waitMs, null, 'summary');
  await flush();
  const settled = brain.resolve(pending, dt, obs);
  return { record: records[0]!, settled };
}

const never: Complete = () => new Promise(() => {});
const replies = (text: string): Complete => async () => ({ text });

describe('LlmDecider behind Brain', () => {
  const rows: { name: string; port: Complete; by: 'llm' | 'fallback'; note?: string; pick?: string; line?: string }[] = [
    { name: 'the port never resolves', port: never, by: 'fallback', note: 'decider too slow' },
    { name: 'the port rejects', port: () => Promise.reject(new Error('budget spent')), by: 'fallback', note: 'decider failed: budget spent' },
    { name: 'the reply names an option off the list', port: replies('{"option":"F","line":"x"}'), by: 'fallback', note: 'named F, not on the list' },
    { name: 'the reply is junk', port: replies('not json at all'), by: 'fallback', note: 'unreadable reply' },
    { name: 'the reply is good and in time', port: replies('{"option":"B","line":"Mine."}'), by: 'llm', pick: 'B', line: 'Mine.' },
  ];

  for (const row of rows) {
    it(`T-AC-3: ${row.name}, so the seat plays ${row.by === 'llm' ? "the model's pick" : 'a shortlist action with its reason noted'}`, async () => {
      const { record, settled } = await run(row.port);
      expect(record.by).toBe(row.by);
      if (row.note) expect(record.note).toContain(row.note);
      else expect(record.note).toBeUndefined();
      if (row.pick) {
        expect(record.pick.id).toBe(row.pick);
        expect(record.line).toBe(row.line);
      }
      expect(actions).toContain(settled!.action);
    });
  }

  it('T-AC-3 (AM-2): the port is given the hands wait for the kind: develop 1500, trade 2500, land 5000', async () => {
    const waits: Record<string, number> = {};
    for (const kind of ['develop', 'trade', 'land'] as const) {
      const port: Complete = async (_p, waitMs) => {
        waits[kind] = waitMs;
        return { text: '{"option":"A","line":null}' };
      };
      const { settled } = await run(port, kind, 1);
      expect(actions).toContain(settled!.action);
    }
    expect(waits).toEqual({ develop: AI_HANDS.develop.decideWaitMs, trade: AI_HANDS.auction.decideWaitMs, land: BRAIN.landTimeoutMs });
    expect(waits).toEqual({ develop: 1_500, trade: 2_500, land: 5_000 });
  });
});
