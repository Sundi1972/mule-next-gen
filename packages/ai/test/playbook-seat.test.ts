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

// The HC-9 seams: a draft or a validator that throws, switched on per test; otherwise the real ones.
const seam = vi.hoisted(() => ({ throwing: null as 'draft' | 'validator' | null }));
vi.mock('../src/playbook/draft.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/playbook/draft.js')>();
  return {
    ...real,
    draftPlaybook: (input: Parameters<typeof real.draftPlaybook>[0]) => {
      if (seam.throwing === 'draft') throw new Error('draft broke');
      return real.draftPlaybook(input);
    },
  };
});
vi.mock('../src/playbook/validate.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/playbook/validate.js')>();
  return {
    ...real,
    validatePlaybook: (profile: Parameters<typeof real.validatePlaybook>[0]): ReturnType<typeof real.validatePlaybook> => {
      if (seam.throwing === 'validator') {
        return () => {
          throw new Error('validator broke');
        };
      }
      return real.validatePlaybook(profile);
    },
  };
});

afterEach(() => {
  seam.throwing = null;
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

/**
 * The budget for these tests, which play months of four seats drafting, or reading their parts, at their draft points:
 * up to about 1 s each alone, and four to five times that in CI's parallel run, past vitest's 5 s default.
 */
const SLOW_MS = 20_000;

const KEYS = ['planning', 'landGrant', 'development', 'auction'] as const;
/** Each part from its seat's own draft: the draft phase that writes it. */
const OWN_FROM = { planning: 'planning', landGrant: 'planning', development: 'development', auction: 'auction' } as const;

describe('the seat drafts, validates and writes its planning playbook (C4, RULE-6, RULE-7)', { timeout: SLOW_MS }, () => {
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
    for (const key of KEYS) expect(smart.seats[1]!.part(smart.state, key), key).toBeNull();

    // Row 2: a playbook adopted for a month carries the planning part, so the Classic seat does not write its own that
    // month, and writes again the month after. Adopted ahead in month 1: month 2's, then month 1's, which is older than
    // the newest adopted and so ignored (RULE-6's unknown).
    const adopted = playTable(3, {
      opening: (state, seats) => {
        if (state.phase !== 'planning' || state.month !== 1) return;
        const pb = draftPlaybook({ state, seat: 'ai1', mind: seats[1]!.mind, seed: 1, phase: 'planning' });
        seats[1]!.adopt({ ...pb, month: 2, by: 'llm' });
        seats[1]!.adopt({ ...pb, by: 'llm' });
      },
    });
    expect(adopted.written.map((pb) => `${pb.seat}/${pb.month}`)).toEqual(['ai0/1', 'ai1/1', 'ai2/1', 'ai3/1', 'ai0/2', 'ai2/2', 'ai3/2', 'ai0/3', 'ai1/3', 'ai2/3', 'ai3/3']);

    // At the seat, as each hand reads it: Smart ai1 adopts a landGrant-only playbook, then a development-only one, for
    // month 1; Classic ai0 adopts nothing.
    const landOnly: Playbook[] = [];
    const devOnly: Playbook[] = [];
    const read: Record<string, unknown> = {};
    playTable(1, {
      seat: (i) => (i === 1 ? { decider: countingDecider([]) } : {}),
      opening: (state, seats) => {
        const [classic, smartSeat] = [seats[0]!, seats[1]!];
        if (state.phase === 'planning') {
          const { planning: _, ...land } = smartSeat.draft(state, 'planning');
          landOnly.push({ ...land, phase: 'landGrant', by: 'llm', strategy: { ...land.strategy, kind: 'landBaron', reason: 'Land first.' } });
          const dev = smartSeat.draft(state, 'development');
          devOnly.push({ ...dev, by: 'llm', strategy: { ...dev.strategy, kind: 'builder', reason: 'Build.' } });
          smartSeat.adopt(landOnly[0]!);
          smartSeat.adopt(devOnly[0]!);
        }
        if (!['planning', 'landGrant', 'development', 'auction'].includes(state.phase)) return;
        for (const key of KEYS) {
          const got = smartSeat.part(state, key);
          read[`smart/${state.phase}/${key}`] = structuredClone(got);
          // A hand that changes what it read changes nothing the seat keeps: the next phase reads it as adopted.
          if (got) got.strategy.reason = 'A hand changed it.';
          const own = classic.draft(state, OWN_FROM[key]);
          expect(classic.part(state, key), `${state.phase}/${key}`).toEqual({ part: own[key], strategy: own.strategy, by: 'own' });
        }
      },
    });
    for (const phase of ['planning', 'landGrant', 'development', 'auction']) {
      expect(read[`smart/${phase}/landGrant`], phase).toEqual({ part: landOnly[0]!.landGrant, strategy: landOnly[0]!.strategy, by: 'adopted' });
      expect(read[`smart/${phase}/development`], phase).toEqual({ part: devOnly[0]!.development, strategy: devOnly[0]!.strategy, by: 'adopted' });
      // Row 3: nothing adopted carries these, and a Smart seat drafts none of its own.
      expect(read[`smart/${phase}/planning`], phase).toBeNull();
      expect(read[`smart/${phase}/auction`], phase).toBeNull();
    }
  });

  it('T-AC-13 (C4 pin): a seat built with playbook false, or with AI_PLANS.on false, writes nothing and acts as the default seat does', () => {
    const base = playTable(3);
    const off = playTable(3, { seat: () => ({ playbook: false }) });
    expect(off.written).toEqual([]);
    expect(playOf(off)).toEqual(playOf(base));
    for (const key of KEYS) expect(off.seats[0]!.part(off.state, key), key).toBeNull();

    const saved = AI_PLANS.on;
    AI_PLANS.on = false;
    try {
      const allOff = playTable(3);
      expect(allOff.written).toEqual([]);
      expect(playOf(allOff)).toEqual(playOf(base));
      for (const key of KEYS) expect(allOff.seats[0]!.part(allOff.state, key), key).toBeNull();
    } finally {
      AI_PLANS.on = saved;
    }
  });

  // trace-allow: HC-9, the spec's own failure-mode id for a draft or validator error (spec §4, "Retry, poison, page?"); trace-check reads no HC- ids
  it('HC-9: a draft or a validator that throws is logged, writes nothing, and the seat plays today’s path', () => {
    const base = playTable(2);
    for (const broke of ['draft', 'validator'] as const) {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      seam.throwing = broke;
      const broken = playTable(2);
      const own = broken.seats[0]!.part(broken.state, 'development');
      seam.throwing = null;

      expect(own, broke).toBeNull();

      expect(broken.written, broke).toEqual([]);
      expect(logged, broke).toHaveBeenCalledTimes(IDS.length * 2 + 1);
      expect(String(logged.mock.calls[0]!.join(' ')), broke).toContain(`${broke} broke`);
      expect(playOf(broken), broke).toEqual(playOf(base));
      logged.mockRestore();
    }
  });

  /** The phases whose opening a seat drafts at (RULE-7): the only states T-AC-4 needs to draft from. */
  const DRAFT_POINTS = new Set(['planning', 'development', 'auction']);

  /**
   * A month-1 game whose every seat reads each part at each draft point and once a grant mid-grant, after its first
   * step has settled the land pick; `full`, it reads each twice and also drafts each phase twice there. Returns what it read.
   */
  const pokedGame = (full: boolean) => {
    const read = new Map<string, string>();
    const readTwice = (s: AiSeat, state: GameState, at: string) => {
      const kept = stableJson(s.debug());
      for (const key of KEYS) {
        const once = stableJson(s.part(state, key));
        if (full) expect(stableJson(s.part(state, key))).toBe(once);
        read.set(`${s.id}/${at}/part:${key}`, once);
      }
      expect(stableJson(s.debug())).toBe(kept);
    };
    const poke = (state: GameState, seats: AiSeat[], at: string) => {
      const before = stableJson(state);
      for (const s of seats) {
        for (const phase of full ? (['planning', 'development', 'auction'] as const) : []) {
          const once = stableJson(s.draft(state, phase));
          expect(stableJson(s.draft(state, phase))).toBe(once);
          read.set(`${s.id}/${at}/${phase}`, once);
        }
        readTwice(s, state, at);
      }
      expect(stableJson(state)).toBe(before);
    };
    const pokedIn = new Set<number>();
    const t = playTable(1, {
      opening: (state, seats) => DRAFT_POINTS.has(state.phase) && poke(state, seats, `${state.month}/${state.phase}`),
      between: (state, seats) => {
        if (pokedIn.has(state.month)) return;
        pokedIn.add(state.month);
        poke(state, seats, `${state.month}/grant`);
      },
    });
    return { t, read };
  };

  it('T-AC-4: the same state drafted or read twice gives the same playbook and parts, and neither changes the seat’s acts, records or kept state', () => {
    const base = playTable(1);
    const poked = pokedGame(true);

    expect([...poked.read.keys()].filter((k) => k.includes('/part:')).length).toBeGreaterThan(0);
    expect(playOf(poked.t)).toEqual(playOf(base));
    expect(poked.t.written).toEqual(base.written);
  });

  it('T-AC-4 (HC-3): a replay reads every part at the same steps and gets stableJson-identical results', () => {
    const once = pokedGame(false).read;
    expect([...once.values()].some((v) => v.includes('"by":"own"'))).toBe(true);
    expect(pokedGame(false).read).toEqual(once);
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
    // After the grant it plans next month's, and the seat holds no pick for that month: a fresh month-2 draft with none.
    const next = at('development');
    const fresh = draftPlaybook({ state: next.state, seat: 'ai2', mind: t.seats[2]!.mind, seed: t.seats[2]!.options.seed, phase: 'planning', land: null, month: 2 });
    const { planning: _, ...freshGrant } = fresh;
    expect(next.playbook).toEqual({ ...freshGrant, phase: 'landGrant' });
    // Its gate re-drafts that land part for month 2 the same way, with no pick of this month's.
    const kind = next.playbook.strategy.kind === 'builder' ? 'landBaron' : 'builder';
    const replanned = source!.validate(next.state, 'ai2', next.playbook, [{ path: '/strategy/kind', to: kind, reason: 'Land, now.' }]);
    expect(replanned.playbook.strategy.kind).toBe(kind);
    expect(replanned.playbook.landGrant).toEqual(fresh.landGrant);

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
