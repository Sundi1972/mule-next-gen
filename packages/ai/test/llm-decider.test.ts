import { describe, expect, it, vi } from 'vitest';
import { AI_HANDS, AI_LEVELS, AI_PERSONAS, BRAIN, createGame, observe } from '@mule/engine';
import { Brain, type DecisionRecord } from '../src/brain.js';
import { PERSONAS, type DecisionKind } from '../src/personas.js';
import { candidate, consider, shortlist } from '../src/utility.js';
import type { Mind } from '../src/value.js';
import type { Choice, Decider } from '../src/decider.js';
import { LlmDecider, ReplyRejected, WAIT_MS, type Complete } from '../src/llm/decider.js';
import { playGame } from '../src/play.js';
import { simSeats } from '../src/sim.js';
import type { Prompt } from '../src/llm/prompt.js';
import type { RejectOutcome } from '../src/llm/reply.js';

const mind: Mind = { me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'rookie', level: AI_LEVELS.rookie };
const state = createGame({ seed: 7, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: true })) });
const obs = observe(state, 'p0');

const actions = ['act-a', 'act-b', 'act-c'];
const list = () => shortlist(actions.map((a, i) => candidate(a, `Option ${a}`, a, 10, [consider('fit', 0.9 - i * 0.05, 1, 'fits')])), 3, 0.5);

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Drives Brain with an LlmDecider on a fake port and settles it as the hands would. */
async function run(decider: Decider, kind: DecisionKind = 'develop', waitMs = 1_500, dt = waitMs, heard?: { from: string; text: string }) {
  const records: DecisionRecord[] = [];
  const brain = new Brain(mind, PERSONAS.trader, 'The Gambler', 11, decider, (r) => records.push(r));
  if (heard) brain.hear(heard);
  const pending = brain.ask(kind, list(), obs, waitMs, null, 'summary');
  await flush();
  const settled = brain.resolve(pending, dt, obs);
  return { record: records[0]!, records, settled, brain, pending };
}

/** An LlmDecider that keeps the error it rejected with, so the test can see its type. */
function spied(port: Complete) {
  const inner = new LlmDecider(port);
  const spy = { rejection: undefined as unknown, name: inner.name } as Decider & { rejection: unknown };
  spy.decide = async (...args): Promise<Choice> => {
    try {
      return await inner.decide(...args);
    } catch (err) {
      spy.rejection = err;
      throw err;
    }
  };
  return spy;
}

const never: Complete = () => new Promise(() => {});
const replies = (text: string): Complete => async () => ({ text });

const sync = (fn: () => never): Decider => ({ name: 'sync', decide: fn });
const bigMessage = 'x'.repeat(300);

describe('LlmDecider behind Brain', () => {
  const rows: {
    name: string;
    decider: () => Decider & { rejection?: unknown };
    by: 'llm' | 'fallback';
    note?: string;
    exactNote?: string;
    outcome?: RejectOutcome;
    pick?: string;
    line?: string;
  }[] = [
    { name: 'the port never resolves', decider: () => new LlmDecider(never), by: 'fallback', note: 'decider too slow' },
    { name: 'the port rejects', decider: () => new LlmDecider(() => Promise.reject(new Error('budget spent'))), by: 'fallback', exactNote: 'decider failed: budget spent' },
    { name: 'the reply names an option off the list', decider: () => spied(replies('{"option":"F","line":"x"}')), by: 'fallback', note: 'named F, not on the list', outcome: 'off_list' },
    { name: 'the reply is junk', decider: () => spied(replies('not json at all')), by: 'fallback', note: 'unreadable reply', outcome: 'unreadable' },
    { name: 'the reply is good and in time', decider: () => new LlmDecider(replies('{"option":"B","line":"Mine."}')), by: 'llm', pick: 'B', line: 'Mine.' },
    { name: 'a decider throws synchronously', decider: () => sync(() => { throw new Error('boom'); }), by: 'fallback', exactNote: 'decider failed: boom' },
    { name: 'the port rejects with a non-Error', decider: () => new LlmDecider(() => Promise.reject({})), by: 'fallback', exactNote: 'decider failed: unknown error' },
    { name: 'the port rejects with an empty Error', decider: () => new LlmDecider(() => Promise.reject(new Error(''))), by: 'fallback', exactNote: 'decider failed: unknown error' },
    { name: 'the port rejects with a 300-char message', decider: () => new LlmDecider(() => Promise.reject(new Error(bigMessage))), by: 'fallback', exactNote: `decider failed: ${'x'.repeat(80)}` },
  ];

  for (const row of rows) {
    it(`T-AC-3: ${row.name}, so the seat plays ${row.by === 'llm' ? "the model's pick" : 'a shortlist action with its reason noted'}`, async () => {
      const decider = row.decider();
      const { record, settled, pending } = await run(decider);
      expect(record.by).toBe(row.by);
      if (row.by === 'fallback') expect(record.pick.id).toBe(pending.fallback.optionId);
      if (row.exactNote) expect(record.note).toBe(row.exactNote);
      else if (row.note) expect(record.note).toContain(row.note);
      else expect(record.note).toBeUndefined();
      if (row.outcome) {
        expect(decider.rejection).toBeInstanceOf(ReplyRejected);
        expect((decider.rejection as ReplyRejected).outcome).toBe(row.outcome);
        expect(record.note).toBe(`decider failed: ${(decider.rejection as ReplyRejected).message}`);
      }
      if (row.pick) {
        expect(record.pick.id).toBe(row.pick);
        expect(record.line).toBe(row.line);
      }
      expect(actions).toContain(settled!.action);
    });
  }

  it('T-AC-3: the port answers after resolve gave up, and there is still exactly one record: the top pick, too slow', async () => {
    let answer!: (r: { text: string }) => void;
    const late: Complete = () => new Promise((r) => (answer = r));
    const { records, settled, brain, pending } = await run(new LlmDecider(late), 'develop', 1_500, 1_500);
    expect(records).toHaveLength(1);
    expect(records[0]!.note).toBe('decider too slow');
    expect(records[0]!.by).toBe('fallback');
    expect(records[0]!.pick.id).toBe(pending.fallback.optionId);
    answer({ text: '{"option":"C","line":"too late"}' });
    await flush();
    expect(brain.resolve(pending, 10, obs)).toBe(settled);
    expect(records).toHaveLength(1);
    expect(brain.log).toHaveLength(1);
    expect(settled!.choice.optionId).toBe(pending.fallback.optionId);
  });

  it("INV-HC3: the decider's timeout per kind equals the wait the hands pass", () => {
    const spy = vi.spyOn(Brain.prototype, 'ask');
    try {
      playGame(7, simSeats(4, 'trader', 7));
      const waits = spy.mock.calls.map(([kind, , , waitMs]) => ({ kind, waitMs }));
      for (const kind of ['develop', 'trade'] as const) {
        const ofKind = waits.filter((w) => w.kind === kind);
        expect(ofKind.length).toBeGreaterThan(0);
        for (const w of ofKind) expect(w.waitMs).toBe(WAIT_MS[kind]);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('T-AC-3 (AM-2): the port gets this decision\'s prompt and the hands wait for the kind: develop, trade, land', async () => {
    const seen: Record<string, { waitMs: number; prompt: Prompt }> = {};
    for (const kind of ['develop', 'trade', 'land'] as const) {
      const port: Complete = async (prompt, waitMs) => {
        seen[kind] = { waitMs, prompt };
        return { text: '{"option":"A","line":null}' };
      };
      const { settled } = await run(new LlmDecider(port), kind, 1, 1, { from: 'Ann', text: 'sell me your smithore' });
      expect(actions).toContain(settled!.action);
    }
    expect(Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.waitMs]))).toEqual({
      develop: AI_HANDS.develop.decideWaitMs,
      trade: AI_HANDS.auction.decideWaitMs,
      land: BRAIN.landTimeoutMs,
    });
    for (const { prompt } of Object.values(seen)) {
      for (const a of actions) expect(prompt.user).toContain(`Option ${a}`);
      expect(prompt.system).toContain(PERSONAS.trader.card);
      const talk = prompt.user.slice(prompt.user.indexOf('<table_talk>'), prompt.user.indexOf('</table_talk>'));
      expect(talk).toContain('sell me your smithore');
    }
  });
});
