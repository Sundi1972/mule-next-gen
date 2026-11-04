import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceGrant,
  advancePhase,
  AI_PLANS,
  createGame,
  createRng,
  GAME,
  grantDone,
  litPlot,
  stableJson,
  stepElection,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type LandGrantPlay,
  type Playbook,
  type PlayerId,
  type RecordedWrite,
  type Strategy,
} from '@mule/engine';
import type { DecisionRecord } from '../src/brain.js';
import type { Decider } from '../src/decider.js';
import { VoteHand } from '../src/hands/vote.js';
import { applyAction } from '../src/play.js';
import { draftPlaybook, playbookSource } from '../src/playbook/index.js';
import { AiSeat, type AiSeatOptions } from '../src/seat.js';
import { plotName } from '../src/strategist.js';

// The HC-9 seam: a draft that throws, switched on per test; otherwise the real draft.
const seam = vi.hoisted(() => ({ throwing: false }));
vi.mock('../src/playbook/draft.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/playbook/draft.js')>();
  return {
    ...real,
    draftPlaybook: (input: Parameters<typeof real.draftPlaybook>[0]) => {
      if (seam.throwing) throw new Error('draft broke');
      return real.draftPlaybook(input);
    },
  };
});

afterEach(() => {
  seam.throwing = false;
  vi.restoreAllMocks();
});

const PERSONAS: AiPersonaId[] = ['cautious', 'aggressive', 'trader', 'saboteur'];
const IDS = PERSONAS.map((_, i) => `ai${i}`);

interface TableOptions {
  level?: AiLevelId;
  politics?: boolean;
  /** Extra options for seat i. */
  seat?: (i: number) => Partial<AiSeatOptions>;
  /** At each phase's opening, before the seats play it. */
  opening?: (state: GameState, seats: AiSeat[]) => void;
  /** Between the land grant's steps. */
  between?: (state: GameState, seats: AiSeat[]) => void;
}

/**
 * Seed 11's four-persona table for `months` months, its seats driven as play.ts drives them through planning and the
 * land grant (the phases the planning draft point touches); the other phases are skipped.
 */
function playTable(months: number, o: TableOptions = {}) {
  const state = createGame({ seed: 11, players: IDS.map((id, i) => ({ id, name: `AI ${i + 1}`, isAi: true })), politics: o.politics ?? false });
  const written: Playbook[] = [];
  const records: DecisionRecord[] = [];
  const acts: string[] = [];
  const landPlans: { seat: string; month: number; plan: ReturnType<AiSeat['debug']>['landPlan'] }[] = [];
  const seats = PERSONAS.map(
    (persona, i) =>
      new AiSeat({
        id: IDS[i]!,
        name: `AI ${i + 1}`,
        persona,
        level: o.level ?? 'trader',
        seed: 100 + i,
        onPlaybook: (pb) => written.push(structuredClone(pb)),
        onDecision: (r) => records.push(r),
        ...o.seat?.(i),
      }),
  );
  const votes = seats.map((s) => new VoteHand(s.mind, createRng((s.options.seed ^ 0x165667b1) >>> 0)));
  const act = (s: AiSeat, a: Parameters<typeof applyAction>[2]) => {
    const ok = applyAction(state, s.id, a);
    acts.push(`${state.month}/${state.phase}: ${s.id} ${JSON.stringify(a)} ${ok}`);
    return ok;
  };
  while (state.phase !== 'gameOver' && state.month <= months) {
    o.opening?.(state, seats);
    if (state.phase === 'planning') {
      for (let t = 0; state.politics?.election && state.politics.election.stage !== 'over' && t < 100_000; t++) {
        seats.forEach((s, i) => votes[i]!.tick(state, WALK.tickMs, (a) => act(s, a)));
        stepElection(state, WALK.tickMs);
      }
      seats.forEach((s, i) => votes[i]!.tick(state, WALK.tickMs, (a) => act(s, a)));
      for (const s of seats) s.planMonth(state);
    }
    if (state.phase === 'landGrant') {
      for (let step = 0; !grantDone(state) && step < 2_000; step++) {
        if (step > 0) for (const s of seats) if (s.passesGrant(state)) act(s, { type: 'done', done: true });
        if (grantDone(state)) break;
        const lit = litPlot(state);
        if (lit) {
          const bids = seats
            .map((s) => ({ s, ms: s.onLit(state) }))
            .filter((b): b is { s: AiSeat; ms: number } => b.ms !== null && b.ms < GAME.grantTickMs)
            .sort((a, b) => a.ms - b.ms);
          for (const b of bids) if (act(b.s, { type: 'claim', x: lit.x, y: lit.y })) break;
        }
        if (!grantDone(state)) advanceGrant(state);
        o.between?.(state, seats);
      }
      for (const s of seats) landPlans.push({ seat: s.id, month: state.month, plan: s.debug().landPlan });
    }
    advancePhase(state);
  }
  return { state, seats, written, records, acts, landPlans };
}

/** A Smart seat's decider: it takes the first option, and counts what it is asked. */
function countingDecider(asked: string[]): Decider {
  return {
    name: 'counting',
    decide: (options, _persona, context) => {
      asked.push(`${context.seat}/${context.month}/${context.kind}`);
      return { optionId: options[0]!.id, line: null, by: 'llm' };
    },
  };
}

const playOf = (t: ReturnType<typeof playTable>) => ({ acts: t.acts, records: stableJson(t.records) });

/** The head of the plan the seat's land hand settled on and played, as its dev view shows it (the top five plots). */
function playedHead(t: ReturnType<typeof playTable>, seat: string, month: number) {
  const plan = t.landPlans.find((p) => p.seat === seat && p.month === month)!.plan!;
  return plan.top.map((p) => ({ label: p.label, value: Math.max(0, Math.round(p.value)) }));
}

/** A written land part's ranking, as many as the dev view shows, by the plots' names. */
const headOf = (land: LandGrantPlay, state: GameState) => land.ranked.slice(0, 5).map((r) => ({ label: plotName(state.tiles[r.plot]!), value: r.value }));

describe('the seat drafts, validates and writes its planning playbook (C4, RULE-6, RULE-7)', () => {
  it("B-AC-7: a keyless seat writes its validated planning draft, by 'engine'", () => {
    const t = playTable(3);

    // One playbook per seat per month, at planning, in the seats' order.
    expect(t.written.map((pb) => `${pb.seat}/${pb.month}/${pb.phase}`)).toEqual([1, 2, 3].flatMap((m) => IDS.map((id) => `${id}/${m}/planning`)));
    for (const pb of t.written) {
      expect(pb.by).toBe('engine');
      expect(pb.edits).toBeUndefined();
      expect(pb.rejected).toBeUndefined();
      expect(pb.planning).toEqual({});
      // Its ranking is the one the land hand played that month: the settled plan its dev view shows.
      expect(headOf(pb.landGrant!, t.state)).toEqual(playedHead(t, pb.seat, pb.month));
    }
  });

  it("RULE-6 (B-AC-7's negative): a Smart seat with nothing adopted writes nothing and plays today's asks", () => {
    const asked: string[] = [];
    const smart = playTable(2, { seat: () => ({ decider: countingDecider(asked) }) });
    const today: string[] = [];
    const onToday = playTable(2, { seat: () => ({ decider: countingDecider(today), playbook: false }) });
    expect(smart.written).toEqual([]);
    // Its decider is asked exactly what today's path asks it, the land plan among them.
    expect(asked).toEqual(today);
    expect(asked.filter((a) => a.endsWith('/land')).length).toBeGreaterThanOrEqual(IDS.length);
    expect(playOf(smart)).toEqual(playOf(onToday));

    // Row 2: a playbook adopted for the month carries the planning part, so the Classic seat does not write its own.
    const adopted = playTable(2, {
      opening: (state, seats) => {
        if (state.phase !== 'planning' || state.month !== 2) return;
        const pb = draftPlaybook({ state, seat: 'ai1', mind: seats[1]!.mind, seed: 1, phase: 'planning' });
        seats[1]!.adopt({ ...pb, by: 'llm' });
      },
    });
    expect(adopted.written.map((pb) => `${pb.seat}/${pb.month}`)).toEqual(['ai0/1', 'ai1/1', 'ai2/1', 'ai3/1', 'ai0/2', 'ai2/2', 'ai3/2']);
  });

  it('T-AC-13 (C4 pin): a seat built with playbook false, or with AI_PLANS.on false, writes nothing and acts as the default seat does', () => {
    const base = playTable(3);
    const off = playTable(3, { seat: () => ({ playbook: false }) });
    expect(off.written).toEqual([]);
    expect(playOf(off)).toEqual(playOf(base));

    const saved = AI_PLANS.on;
    AI_PLANS.on = false;
    try {
      const allOff = playTable(3);
      expect(allOff.written).toEqual([]);
      expect(playOf(allOff)).toEqual(playOf(base));
    } finally {
      AI_PLANS.on = saved;
    }
  });

  // trace-allow: HC-9, the spec's own failure-mode id (spec §4, "Retry, poison, page?"); trace-check reads no HC- ids
  it('HC-9: a draft that throws is logged, writes nothing, and the seat plays today’s path', () => {
    const base = playTable(2);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    seam.throwing = true;
    const broken = playTable(2);
    seam.throwing = false;

    expect(broken.written).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(IDS.length * 2);
    expect(String(logged.mock.calls[0]!.join(' '))).toContain('draft broke');
    expect(playOf(broken)).toEqual(playOf(base));
  });

  /** The phases whose opening a seat drafts at (RULE-7): the only states T-AC-4 needs to draft from. */
  const DRAFT_POINTS = new Set(['planning', 'development', 'auction']);

  it('T-AC-4: the same state drafted twice gives the same playbook, and drafting changes none of the seat’s acts or records', () => {
    const base = playTable(1);
    const drafted = new Map<string, string>();
    const draftAll = (state: GameState, seats: AiSeat[]) => {
      if (!DRAFT_POINTS.has(state.phase)) return;
      const before = stableJson(state);
      for (const s of seats) {
        for (const phase of ['planning', 'development', 'auction'] as const) {
          const once = stableJson(s.draft(state, phase));
          expect(stableJson(s.draft(state, phase))).toBe(once);
          drafted.set(`${s.id}/${state.month}/${state.phase}/${phase}`, once);
        }
      }
      expect(stableJson(state)).toBe(before);
    };
    const pokedIn = new Set<number>();
    const poked = playTable(1, {
      opening: draftAll,
      // Once a grant, after its first step has settled the land pick.
      between: (state, seats) => {
        if (pokedIn.has(state.month)) return;
        pokedIn.add(state.month);
        drafted.set(`${state.month}/grant`, stableJson(seats.map((s) => s.draft(state, 'planning'))));
      },
    });

    expect(drafted.size).toBeGreaterThan(0);
    expect(playOf(poked)).toEqual(playOf(base));
    expect(poked.written).toEqual(base.written);
  });

  it('B-AC-5: four personas draft four kinds; Rookie drafts no monopolist or spoiler', () => {
    const kinds = (level: AiLevelId) => playTable(1, { level, politics: true }).written.map((pb) => pb.strategy.kind);

    const trader = kinds('trader');
    expect(trader).toHaveLength(4);
    expect([trader[0], trader[1], trader[3]]).toEqual(['builder', 'landBaron', 'spoiler']);
    expect(['specialist', 'monopolist']).toContain(trader[2]);

    const rookie = kinds('rookie');
    expect(rookie).toHaveLength(4);
    expect(rookie).not.toContain('monopolist');
    expect(rookie).not.toContain('spoiler');
  });
});

// Copied verbatim from ws2-brain: PlaybookSource from apps/server/src/brain/playbooks.ts, LandDraft from
// packages/ai/src/llm/brief.ts, PlanEdit and ValidatePlan from packages/ai/src/llm/writer.ts. If playbookSource's shape
// drifts from what WS2 consumes, the assignment below stops compiling.
type PlanEdit = RecordedWrite['edits'][number];
type ValidatePlan = (
  state: GameState,
  seat: PlayerId,
  draft: Playbook,
  edits: readonly PlanEdit[],
) => { playbook: Playbook; rejected: NonNullable<Playbook['rejected']> };
interface LandDraft {
  strategy: Strategy;
  landGrant: LandGrantPlay;
}
interface PlaybookSource {
  draft(state: GameState, seat: PlayerId): { playbook: Playbook; land: LandDraft };
  validate: ValidatePlan;
}

describe("playbookSource, WS2's PlaybookSource (AM-1)", () => {
  // trace-allow: AM-1, the plan's amendment agreed with WS2 on 4 Nov; the spec gives the contract no AC id yet
  it("AM-1: playbookSource returns WS2's PlaybookSource shape", () => {
    type Seen = { phase: string; state: GameState; playbook: Playbook; land: LandDraft; free: Set<number> };
    const seen: Seen[] = [];
    let source: PlaybookSource | null = null;
    // A Smart seat whose decider takes the last land plan offered, where the draft's own pick would take the top one.
    const lastPlan: Decider = { name: 'last', decide: (options) => ({ optionId: options.at(-1)!.id, line: null, by: 'llm' }) };
    const t = playTable(1, {
      seat: (i) => (i === 2 ? { decider: lastPlan } : {}),
      opening: (state, seats) => {
        source ??= playbookSource(seats);
        const { playbook, land } = source.draft(state, 'ai2');
        const free = new Set(state.tiles.flatMap((tile, i) => (tile.owner === null && tile.terrain !== 'store' ? [i] : [])));
        seen.push({ phase: state.phase, state: structuredClone(state), playbook, land, free });
      },
    });
    const at = (phase: string) => seen.find((s) => s.phase === phase)!;

    for (const s of seen) {
      expect(s.playbook).toMatchObject({ v: 1, seat: 'ai2', phase: 'landGrant', by: 'engine' });
      expect(s.playbook.planning).toBeUndefined();
      expect(s.playbook.rejected).toBeUndefined();
      expect(s.land).toEqual({ strategy: s.playbook.strategy, landGrant: s.playbook.landGrant });
      // Drafted from the live state, it ranks only what is free now.
      expect(s.playbook.landGrant!.ranked.every((r) => s.free.has(r.plot))).toBe(true);
    }
    // The month stamp: this month's grant until it has run, then next month's.
    expect(at('planning').playbook.month).toBe(1);
    expect(at('landGrant').playbook.month).toBe(1);
    expect(at('development').playbook.month).toBe(2);
    expect(at('upkeep').playbook.month).toBe(2);
    // At the grant it plans the pending pick the land hand then plays, the decider's, not a pick of its own.
    expect(headOf(at('landGrant').playbook.landGrant!, t.state)).toEqual(playedHead(t, 'ai2', 1));
    expect(headOf(at('planning').playbook.landGrant!, t.state)).not.toEqual(playedHead(t, 'ai2', 1));

    // An in-bounds edit plays, by 'llm'.
    const grant = at('landGrant');
    const edit: PlanEdit = { path: '/landGrant/claims', to: 0, reason: 'Save my money this month.' };
    const { state } = grant;
    const { playbook, rejected } = source!.validate(state, 'ai2', grant.playbook, [edit]);
    expect(rejected).toEqual([]);
    expect(playbook.by).toBe('llm');
    expect(playbook.landGrant!.claims).toBe(0);
    expect(playbook.edits).toEqual([{ path: '/landGrant/claims', from: GAME.claimsPerGrant, to: 0, reason: edit.reason }]);

    // An unknown seat: validate refuses every edit and never throws; draft throws, which WS2 catches.
    const unknown = source!.validate(state, 'ai9', grant.playbook, [edit]);
    expect(unknown.playbook).toEqual(grant.playbook);
    expect(unknown.rejected.map((r) => r.path)).toEqual(['/landGrant/claims']);
    expect(() => source!.draft(state, 'ai9')).toThrow();
  });
});
