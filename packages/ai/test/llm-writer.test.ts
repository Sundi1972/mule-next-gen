import { describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, BRAIN, createGame, type LandGrantPlay, type Playbook, type Strategy } from '@mule/engine';
import { PERSONAS } from '../src/personas.js';
import type { Mind } from '../src/value.js';
import { landBrief, type LandBrief } from '../src/llm/brief.js';
import { replySchema, writePlaybook, type Cause, type PlanEdit, type ValidatePlan, type WriteComplete, type WriterPrompt } from '../src/llm/writer.js';

const state = createGame({ seed: 7, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })) });

const mindOf = (level: 'rookie' | 'trader'): Mind => ({ me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: level, level: AI_LEVELS[level], salt: 3 });

const STRATEGY: Strategy = {
  kind: 'builder',
  moneyMaker: 'food',
  monopolyTarget: null,
  cashFloor: 200,
  landTarget: { plots: 6, byMonth: 6 },
  stances: {},
  reason: 'Grow steady.',
};
const LAND: LandGrantPlay = { ranked: [{ plot: 12, value: 410 }], pressShare: { start: 0.8, end: 0.4 }, deny: [], planB: [], claims: 2 };
const DRAFT: Playbook = { v: 1, seat: 'p0', month: 1, phase: 'landGrant', strategy: STRATEGY, landGrant: LAND, by: 'engine' };

const briefOf = (level: 'rookie' | 'trader'): LandBrief => landBrief(state, mindOf(level), PERSONAS.trader, { strategy: STRATEGY, landGrant: LAND }, []);
const SYSTEM = 'The manual goes here.';
const WAIT = 4_321;

/** A validator stand-in: records what it was given and returns a playbook carrying exactly those edits. */
function fakeValidate() {
  const seen: PlanEdit[][] = [];
  const results: ReturnType<ValidatePlan>[] = [];
  const validate: ValidatePlan = (_state, seat, draft, edits) => {
    expect(seat).toBe(draft.seat);
    seen.push([...edits]);
    const result = { playbook: { ...draft, by: edits.length > 0 ? 'llm' : 'engine', edits: edits.map((e) => ({ ...e, from: null })) } as Playbook, rejected: [] };
    results.push(result);
    return result;
  };
  return { validate, seen, results };
}

/** A model stand-in that answers `text` with `stopReason`, recording each prompt and wait. */
function fakeModel(text: string, stopReason: string | null = 'end_turn') {
  const asked: { prompt: WriterPrompt; waitMs: number }[] = [];
  const complete: WriteComplete = async (prompt, waitMs) => {
    asked.push({ prompt, waitMs });
    return { text, stopReason };
  };
  return { complete, asked };
}

const strategyReply = (over: Record<string, unknown> = {}) => ({ kind: 'specialist', moneyMaker: 'smithore', cashFloor: 150, reason: 'Ore pays.', ...over });
const replyText = (over: Record<string, unknown> = {}) => JSON.stringify({ strategy: strategyReply(), edits: [{ path: '/landGrant/claims', to: 1, reason: 'One plot will do.' }], line: 'Ore, ore, ore.', ...over });

async function write(level: 'rookie' | 'trader', text: string, stopReason: string | null = 'end_turn') {
  const model = fakeModel(text, stopReason);
  const v = fakeValidate();
  const brief = briefOf(level);
  const written = await writePlaybook(model.complete, v.validate, { state, draft: DRAFT, brief, system: SYSTEM, waitMs: WAIT });
  return { written, model, v, brief };
}

const paths = (edits: readonly { path: string }[]) => edits.map((e) => e.path);

describe("T-AC-A5: a Rookie seat's edits that would corner are refused; the same edits on a Trader seat pass", () => {
  it("T-AC-A5: a Rookie seat's reply schema offers neither 'monopolist' nor monopolyTarget; a Trader seat's offers both, and each is what the request carries", async () => {
    const rookie = replySchema(false);
    const trader = replySchema(true);
    expect(rookie.properties.strategy.properties.kind.enum).not.toContain('monopolist');
    expect(rookie.properties.strategy.properties).not.toHaveProperty('monopolyTarget');
    expect(trader.properties.strategy.properties.kind.enum).toContain('monopolist');
    expect(trader.properties.strategy.properties).toHaveProperty('monopolyTarget');
    expect(JSON.stringify(rookie)).not.toMatch(/monopol/);

    const r = await write('rookie', replyText());
    const t = await write('trader', replyText());
    expect(r.model.asked[0]!.prompt.schema).toEqual(rookie);
    expect(t.model.asked[0]!.prompt.schema).toEqual(trader);
  });

  it("T-AC-A5: a Rookie reply that still names 'monopolist' and a monopolyTarget has both edits refused 'never_corners' before validate; on a Trader seat both reach validate", async () => {
    const cornering = replyText({ strategy: strategyReply({ kind: 'monopolist', monopolyTarget: 'smithore' }) });

    const r = await write('rookie', cornering);
    expect(r.written.refused).toEqual([
      { path: '/strategy/kind', cause: 'never_corners' },
      { path: '/strategy/monopolyTarget', cause: 'never_corners' },
    ]);
    expect(paths(r.v.seen[0]!)).toEqual(['/strategy/moneyMaker', '/strategy/cashFloor', '/strategy/reason', '/landGrant/claims']);
    expect(r.written.reply.strategy).toMatchObject({ kind: 'builder', monopolyTarget: null, moneyMaker: 'smithore' });

    const t = await write('trader', cornering);
    expect(t.written.refused).toEqual([]);
    expect(t.v.seen[0]).toEqual(expect.arrayContaining([
      { path: '/strategy/kind', to: 'monopolist', reason: 'Ore pays.' },
      { path: '/strategy/monopolyTarget', to: 'smithore', reason: 'Ore pays.' },
    ]));
    expect(t.written.reply.strategy).toMatchObject({ kind: 'monopolist', monopolyTarget: 'smithore' });
  });

  it("T-AC-A5: a Rookie edit that names /strategy/monopolyTarget in its edits, around the schema, is refused 'never_corners' too", async () => {
    const around = replyText({ strategy: undefined, edits: [{ path: '/strategy/monopolyTarget', to: 'smithore', reason: 'Sneak.' }, { path: '/strategy/kind', to: 'monopolist', reason: 'Sneak.' }] });
    const r = await write('rookie', around);
    expect(r.written.refused).toEqual([
      { path: '/strategy/monopolyTarget', cause: 'never_corners' },
      { path: '/strategy/kind', cause: 'never_corners' },
    ]);
    expect(r.v.seen[0]).toEqual([]);
  });

  it("T-AC-A5: what plays is validate's result, and validate sees only the edits the writer accepted", async () => {
    const { written, v } = await write('trader', replyText());
    expect(v.seen).toHaveLength(1);
    expect(written.result).toBe(v.results[0]);
    expect(written.reply.edits).toEqual(v.seen[0]);
  });
});

/** In every reply below: no part of what the writer returns may carry it. */
const MARK = 'MARK-9z1k';
const kept = (w: Awaited<ReturnType<typeof write>>['written']) => JSON.stringify({ reply: w.reply, refused: w.refused });

describe('C2: the checks the schema cannot carry, each a cause code with no reply text kept', () => {
  const whole: { cause: Cause; text: string; stop?: string }[] = [
    { cause: 'refused', text: replyText({ line: MARK }), stop: 'refusal' },
    { cause: 'cut_off', text: `{"strategy":{"reason":"${MARK}`, stop: 'max_tokens' },
    { cause: 'not_json', text: `${MARK} {"edits":` },
    { cause: 'bad_shape', text: replyText({ extra: MARK }) },
    { cause: 'bad_shape', text: replyText({ edits: MARK }) },
    { cause: 'bad_shape', text: replyText({ edits: [{ path: '/landGrant/claims', to: 1 }], line: MARK }) },
    { cause: 'bad_shape', text: replyText({ strategy: strategyReply({ reason: 7, kind: MARK }) }) },
    { cause: 'bad_shape', text: JSON.stringify([MARK]) },
    { cause: 'bad_line', text: JSON.stringify({ edits: [{ path: '/landGrant/claims', to: 1, reason: MARK }], line: 7 }) },
  ];
  it.each(whole)('C2: $cause sets the reply\'s cause; nothing is edited, validate gets the draft alone', async ({ cause, text, stop }) => {
    const { written, v } = await write('trader', text, stop ?? 'end_turn');
    expect(written.reply).toEqual({ edits: [], line: null, cause });
    expect(written.refused).toEqual([]);
    expect(v.seen).toEqual([[]]);
    expect(written.result).toBe(v.results[0]);
    expect(kept(written)).not.toContain(MARK);
  });

  it("C2: a model call that fails comes back as cause 'no_reply', never a throw, and keeps none of the error's text", async () => {
    const v = fakeValidate();
    const failing: WriteComplete = async () => {
      throw new Error(`timed out ${MARK}`);
    };
    const written = await writePlaybook(failing, v.validate, { state, draft: DRAFT, brief: briefOf('trader'), system: SYSTEM, waitMs: WAIT });
    expect(written.reply).toEqual({ edits: [], line: null, cause: 'no_reply' });
    expect(v.seen).toEqual([[]]);
    expect(kept(written)).not.toContain(MARK);
  });

  const each: { cause: Cause; edit: Record<string, unknown>; path: string | null }[] = [
    { cause: 'reason_too_long', edit: { path: '/landGrant/claims', to: 1, reason: MARK + 'x'.repeat(BRAIN.writeReasonChars) }, path: '/landGrant/claims' },
    { cause: 'plan_not_offered', edit: { path: '/landGrant/ranked', to: MARK, reason: 'Take it.' }, path: '/landGrant/ranked' },
    { cause: 'plan_not_offered', edit: { path: '/landGrant/ranked', to: 'E', reason: 'Take it.' }, path: '/landGrant/ranked' },
    { cause: 'path_not_offered', edit: { path: `/landGrant/${MARK}`, to: 1, reason: 'Take it.' }, path: null },
    { cause: 'path_not_offered', edit: { path: '/development/route', to: [], reason: 'Take it.' }, path: null },
  ];
  it.each(each)('C2: an edit with $cause is refused alone, by its path when the brief offered it; the rest reach validate', async ({ cause, edit, path }) => {
    const text = JSON.stringify({ edits: [edit, { path: '/landGrant/pressShare', to: { start: 0.7, end: 0.3 }, reason: 'Press less.' }], line: '' });
    const { written, v, brief } = await write('trader', text);
    expect(brief.plans.map((p) => p.id)).not.toContain('E');
    expect(written.refused).toEqual([{ path, cause }]);
    expect(v.seen[0]).toEqual([{ path: '/landGrant/pressShare', to: { start: 0.7, end: 0.3 }, reason: 'Press less.' }]);
    expect(written.reply.cause).toBeUndefined();
    expect(kept(written)).not.toContain(MARK);
  });

  it("C2: a path edited twice keeps the first; the second is refused 'path_repeated'", async () => {
    const text = JSON.stringify({ edits: [{ path: '/landGrant/claims', to: 1, reason: 'One.' }, { path: '/landGrant/claims', to: 2, reason: MARK }], line: '' });
    const { written, v } = await write('trader', text);
    expect(written.refused).toEqual([{ path: '/landGrant/claims', cause: 'path_repeated' }]);
    expect(v.seen[0]).toEqual([{ path: '/landGrant/claims', to: 1, reason: 'One.' }]);
    expect(kept(written)).not.toContain(MARK);
  });

  const fields: { cause: Cause; over: Record<string, unknown>; path: string }[] = [
    { cause: 'bad_kind', over: { kind: MARK }, path: '/strategy/kind' },
    { cause: 'bad_good', over: { moneyMaker: MARK }, path: '/strategy/moneyMaker' },
    { cause: 'bad_cash_floor', over: { cashFloor: 12.5 }, path: '/strategy/cashFloor' },
  ];
  it.each(fields)('C2: a strategy field with $cause is refused alone; the other fields reach validate', async ({ cause, over, path }) => {
    const { written, v, brief } = await write('trader', replyText({ strategy: strategyReply(over) }));
    expect(written.refused).toEqual([{ path, cause }]);
    // The reply's strategy is a copy: changing it later never reaches the brief's draft.
    expect(written.reply.strategy!.landTarget).toEqual(brief.strategy.landTarget);
    expect(written.reply.strategy!.landTarget).not.toBe(brief.strategy.landTarget);
    expect(paths(v.seen[0]!)).not.toContain(path);
    expect(paths(v.seen[0]!)).toContain('/strategy/reason');
    expect(kept(written)).not.toContain(MARK);
  });

  it("C2: a strategy reason past the cap refuses every strategy field, which all carry it, and keeps the land edits", async () => {
    const { written, v } = await write('trader', replyText({ strategy: strategyReply({ reason: MARK + 'x'.repeat(BRAIN.writeReasonChars) }) }));
    expect(written.refused.map((r) => r.cause)).toEqual(['reason_too_long', 'reason_too_long', 'reason_too_long', 'reason_too_long']);
    expect(paths(v.seen[0]!)).toEqual(['/landGrant/claims']);
    expect(written.reply.strategy).toBeUndefined();
    expect(kept(written)).not.toContain(MARK);
  });
});

describe('C2: the request and the reply', () => {
  it('C2: the request is the given system text, the brief as the user text, the seat\'s schema and the wait', async () => {
    const { model, brief } = await write('rookie', replyText());
    expect(model.asked).toEqual([{ prompt: { system: SYSTEM, user: brief.text, schema: replySchema(false) }, waitMs: WAIT }]);
  });

  it("C2: a plan letter is resolved to that plan's ranking before validate sees it", async () => {
    const { written, v, brief } = await write('trader', JSON.stringify({ edits: [{ path: '/landGrant/ranked', to: 'B', reason: 'Grow a patch.' }], line: '' }));
    const plan = brief.plans.find((p) => p.id === 'B')!;
    expect(v.seen[0]).toEqual([{ path: '/landGrant/ranked', to: plan.ranked, reason: 'Grow a patch.' }]);
    expect(written.reply.edits).toEqual(v.seen[0]);
  });

  it('C2: the line is one line within BRAIN.maxLineChars; an empty one is null', async () => {
    const long = await write('trader', replyText({ line: `a\nb ${'y'.repeat(BRAIN.maxLineChars)}` }));
    expect(long.written.reply.line).not.toContain('\n');
    expect([...long.written.reply.line!].length).toBeLessThanOrEqual(BRAIN.maxLineChars);
    expect((await write('trader', replyText({ line: '' }))).written.reply.line).toBeNull();
  });

  it('C2: a reply without a strategy keeps the draft strategy: no strategy edits, none recorded', async () => {
    const { written, v } = await write('trader', replyText({ strategy: undefined }));
    expect(written.reply.strategy).toBeUndefined();
    expect(paths(v.seen[0]!)).toEqual(['/landGrant/claims']);
  });

  it('C2: the reply schema is the same object shape for every brief of a level, so the request stays byte-stable', () => {
    expect(JSON.stringify(replySchema(true))).toBe(JSON.stringify(replySchema(true)));
    expect(JSON.stringify(replySchema(false))).toBe(JSON.stringify(replySchema(false)));
  });
});
