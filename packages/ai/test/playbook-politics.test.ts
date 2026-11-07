import { describe, expect, it } from 'vitest';
import { createGame, type AiPersonaId, type GameState, type Playbook } from '@mule/engine';
import { draftPlaybook } from '../src/playbook/draft.js';
import { validatorFor, type PlanEdit } from '../src/playbook/validate.js';
import { AiSeat } from '../src/seat.js';

const PERSONAS_AT_TABLE: AiPersonaId[] = ['cautious', 'aggressive', 'trader', 'saboteur'];
const players = PERSONAS_AT_TABLE.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true }));
const mind = new AiSeat({ id: 'ai2', name: 'AI 3', persona: 'trader', level: 'trader', seed: 102 }).mind;
const edit = (path: string, to: unknown): PlanEdit => ({ path, to, reason: 'a test edit' });

/** Month 1's planning at seed 11, with ai1 and ai3 declared for Governor; `law` puts a law proposal on the next ballot. */
function table(law = false): GameState {
  const state = createGame({ seed: 11, players });
  state.politics!.candidates.governor = ['ai1', 'ai3'];
  if (law) state.politics!.proposal = { by: 'ai1', month: state.month, proposal: { kind: 'enact', law: 'landTax', setting: 1 } };
  return state;
}

function run(state: GameState, edits: PlanEdit[], draft?: Playbook) {
  const drafted = draft ?? draftPlaybook({ state, seat: 'ai2', mind, seed: 102, phase: 'planning' });
  return { draft: drafted, ...validatorFor({ mind, seed: 102 })(state, 'ai2', drafted, edits) };
}
const whyOf = (r: ReturnType<typeof run>, path: string) => r.rejected.find((x) => x.path === path)?.why ?? null;

describe("the validator clamps a seat's recorded votes (RULE-1 politics rows; AM-37, spec B C12)", () => {
  it('T-AC-1: a Governor vote plays only for a candidate on the ballot, declared or open; anything else is refused and the rest plays', () => {
    const state = table(true);
    const r = run(state, [edit('/politics/votes/governor', 'ai3'), edit('/politics/law', true)]);
    expect(r.playbook.politics).toEqual({ votes: { governor: 'ai3' }, law: true });
    expect(r.rejected).toEqual([]);
    expect(r.playbook.by).toBe('llm');

    // A player not standing, a name that is no player, and a value that is no name: each refused, the law still plays.
    for (const [to, why] of [
      ['ai0', 'not on the governor ballot'],
      ['nobody', 'no such player'],
      [7, 'no such player'],
    ] as const) {
      const bad = run(state, [edit('/politics/votes/governor', to), edit('/politics/law', false)]);
      expect(whyOf(bad, '/politics/votes/governor'), String(to)).toBe(why);
      expect(bad.playbook.politics, String(to)).toEqual({ law: false });
    }

    // Once the ballot opens the candidacy is the election's, and Politics' list is empty for the next one.
    const open = table();
    open.politics!.election = { stage: 'ballot', ceremony: null, candidates: { governor: ['ai0'], sheriff: [] }, promises: {}, ballots: {}, done: [], result: null };
    open.politics!.candidates.governor = [];
    expect(run(open, [edit('/politics/votes/governor', 'ai0')]).playbook.politics).toEqual({ votes: { governor: 'ai0' } });
  });

  it('T-AC-1: an office not elected, a law vote with no law on the ballot, and paths that are no field are refused', () => {
    const state = table();
    const r = run(state, [edit('/politics/votes/sheriff', 'ai1'), edit('/politics/votes/mayor', 'ai1'), edit('/politics/law', true), edit('/politics/votes', { governor: 'ai1' }), edit('/politics', {})]);
    expect(r.rejected.map((x) => [x.path, x.why])).toEqual([
      ['/politics/votes/sheriff', 'no such office'],
      ['/politics/votes/mayor', 'no such office'],
      ['/politics/law', 'no law on the ballot'],
      ['/politics/votes', 'no such field'],
      ['/politics', 'no such field'],
    ]);
    expect(r.playbook.politics).toBeUndefined();
    expect(r.playbook.by).toBe('engine');
    // A law vote is true or false, not a word.
    expect(whyOf(run(table(true), [edit('/politics/law', 'yes')]), '/politics/law')).toBe('not true or false');
    // In a game without politics there is no ballot at all.
    const quiet = createGame({ seed: 11, players, politics: false });
    expect(whyOf(run(quiet, [edit('/politics/votes/governor', 'ai1')]), '/politics/votes/governor')).toBe('not on the governor ballot');
  });

  it('T-AC-3: step 5 holds a carried playbook to the same rows: a stale vote is dropped, a valid one plays, and the engine draft has no politics', () => {
    const state = table(true);
    const clean = run(state, []);
    expect(clean.draft.politics).toBeUndefined();
    expect(clean.rejected).toEqual([]);
    expect(clean.playbook).toEqual(clean.draft);

    // A playbook carried from a month the candidate stood in: the vote no longer names anyone standing.
    const carried = { ...clean.draft, politics: { votes: { governor: 'ai0' }, law: true } } as Playbook;
    const r = run(state, [], carried);
    expect(r.rejected).toEqual([{ path: '/politics/votes/governor', to: 'ai0', why: 'not on the governor ballot' }]);
    expect(r.playbook.politics).toEqual({ votes: {}, law: true });
    // A politics that is not an object is dropped whole.
    const junk = run(state, [], { ...clean.draft, politics: 'vote ai1' } as unknown as Playbook);
    expect(whyOf(junk, '/politics')).toBe('not an object');
    expect(junk.playbook.politics).toBeUndefined();
  });
});
