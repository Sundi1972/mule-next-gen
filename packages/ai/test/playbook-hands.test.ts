import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_PLANS,
  BRAIN,
  GOODS,
  stableJson,
  tileIndex,
  type AuctionSide,
  type GameState,
  type Good,
  type Playbook,
} from '@mule/engine';
import type { Act } from '../src/actions.js';
import type { DecisionRecord } from '../src/brain.js';
import type { Decider } from '../src/decider.js';
import { PERSONAS } from '../src/personas.js';
import { playGame, playGameAsync, type SeatSpec } from '../src/play.js';
import type { PhaseFact } from '../src/playbook/index.js';
import type { AiSeat, AiSeatOptions } from '../src/seat.js';

/*
 * C4's development and auction draft points (RULE-6, RULE-7, AM-20, AM-22), with C6's and C7's hands under them. The
 * games are play.ts's own, so the seats are driven exactly as the sim drives them; the harness below only adds options
 * to a seat as play.ts builds it, and lets a test act at a seat's own ticks (as WS2's adopt would land) and read it.
 */

type Point = 'planning' | 'development' | 'auction';
const harness = vi.hoisted(() => ({
  /** Extra options for each seat play.ts builds. */
  options: null as ((o: { id: string }) => Record<string, unknown>) | null,
  /** At a seat's own tick, before it plays it. */
  before: null as ((seat: unknown, state: unknown, point: 'planning' | 'development' | 'auction') => void) | null,
  /** At a seat's own tick, after it played it. */
  after: null as ((seat: unknown, state: unknown, point: 'planning' | 'development' | 'auction') => void) | null,
  seats: [] as unknown[],
}));
vi.mock('../src/seat.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/seat.js')>();
  class HarnessSeat extends real.AiSeat {
    constructor(options: AiSeatOptions) {
      super({ ...options, ...(harness.options?.(options) as Partial<AiSeatOptions> | undefined) });
      harness.seats.push(this);
    }
    override planMonth(state: GameState, act?: Act): void {
      if (state.phase === 'planning') harness.before?.(this, state, 'planning');
      super.planMonth(state, act);
    }
    override developTick(...args: Parameters<InstanceType<typeof real.AiSeat>['developTick']>): void {
      harness.before?.(this, args[0], 'development');
      super.developTick(...args);
      harness.after?.(this, args[0], 'development');
    }
    override developSteer(...args: Parameters<InstanceType<typeof real.AiSeat>['developSteer']>) {
      harness.before?.(this, args[0], 'development');
      const input = super.developSteer(...args);
      harness.after?.(this, args[0], 'development');
      return input;
    }
    override auctionTick(state: GameState, dt: number, act: Act): void {
      harness.before?.(this, state, 'auction');
      super.auctionTick(state, dt, act);
      harness.after?.(this, state, 'auction');
    }
  }
  return { ...real, AiSeat: HarnessSeat };
});

// The HC-9 seams: a draft or a validator that throws, switched on per test; otherwise the real ones.
const seam = vi.hoisted(() => ({ throwing: null as 'draft' | 'validator' | 'goodDraft' | null }));
vi.mock('../src/playbook/draft.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/playbook/draft.js')>();
  return {
    ...real,
    draftPlaybook: (input: Parameters<typeof real.draftPlaybook>[0]) => {
      if (seam.throwing === 'draft') throw new Error('draft broke');
      return real.draftPlaybook(input);
    },
    draftGoodPlaybook: (...args: Parameters<typeof real.draftGoodPlaybook>) => {
      if (seam.throwing === 'draft' || seam.throwing === 'goodDraft') throw new Error('draft broke');
      return real.draftGoodPlaybook(...args);
    },
  };
});
vi.mock('../src/playbook/validate.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/playbook/validate.js')>();
  return {
    ...real,
    validatePlaybook: (profile: Parameters<typeof real.validatePlaybook>[0]): ReturnType<typeof real.validatePlaybook> => {
      const gate = real.validatePlaybook(profile);
      return (state, seat, draft, edits) => {
        if (seam.throwing === 'validator') throw new Error('validator broke');
        return gate(state, seat, draft, edits);
      };
    },
  };
});

afterEach(() => {
  harness.options = null;
  harness.before = null;
  harness.after = null;
  harness.seats = [];
  seam.throwing = null;
  vi.restoreAllMocks();
});

const SPECS: SeatSpec[] = (['trader', 'aggressive', 'cautious', 'saboteur'] as const).map((persona) => ({ persona, level: 'trader' }));
const SEED = 3;
const MONTHS = 2;

/** What a test reads of one game: each seat's writes and records, and each seat's view of every phase as it ended. */
interface Table {
  state: GameState;
  seats: AiSeat[];
  written: Playbook[];
  records: DecisionRecord[];
  /** Per seat and month, its declared side for each good, read from the board at the good's status screen: the server's declare fact. */
  declared: Map<string, AuctionSide>;
  /** Per seat and month, the plots its MULEs were installed on, in order, and the outfits they ended the phase with. */
  installs: Map<string, { plot: number; outfit: string | null }[]>;
  /** Per seat and month, each phase's PhaseOutcome as the phase ended (null on today's path). */
  outcomes: Map<string, ReturnType<AiSeat['outcome']>>;
  /** The game's acts and its final state, compared run against run. */
  final: string;
}

const key = (seat: string, month: number, more = '') => `${seat}/${month}${more && `/${more}`}`;

interface TableOptions {
  seat?: (id: string) => Partial<AiSeatOptions>;
  before?: (seat: AiSeat, state: GameState, point: Point) => void;
  months?: number;
  seed?: number;
}

/** One play.ts game of SPECS on SEED, each seat's view of it collected as each phase ends. */
function playTable(o: TableOptions = {}): Table {
  const written: Playbook[] = [];
  const records: DecisionRecord[] = [];
  const declared = new Map<string, AuctionSide>();
  const installs = new Map<string, { plot: number; outfit: string | null }[]>();
  const outcomes = new Map<string, ReturnType<AiSeat['outcome']>>();
  harness.options = ({ id }) => ({ onPlaybook: (pb: Playbook) => written.push(structuredClone(pb)), onDecision: (r: DecisionRecord) => records.push(structuredClone(r)), ...o.seat?.(id) });
  harness.before = o.before ? (seat, state, point) => o.before!(seat as AiSeat, state as GameState, point) : null;
  harness.after = (seat, s, point) => {
    const state = s as GameState;
    const a = state.auction;
    if (point !== 'auction' || !a?.good || a.stage !== 'status') return;
    const w = a.walkers.find((x) => x.id === (seat as AiSeat).id);
    if (w) declared.set(key(w.id, state.month, a.good), w.side);
  };
  const seats = () => harness.seats as AiSeat[];
  const played = playGame(o.seed ?? SEED, SPECS, {
    politics: false,
    maxMonths: o.months ?? MONTHS,
    onPhase: (state) => {
      if (state.phase !== 'development' && state.phase !== 'auction') return;
      for (const s of seats()) {
        outcomes.set(key(s.id, state.month, state.phase), s.outcome?.(state.phase, state, facts(state)) ?? null);
        if (state.phase !== 'development') continue;
        const plots = s
          .developLog()
          .filter((e) => e.ok && e.action.type === 'install')
          .map((e) => (e.action.type === 'install' ? tileIndex(state.width, e.action.x, e.action.y) : -1));
        installs.set(key(s.id, state.month), plots.map((plot) => ({ plot, outfit: state.tiles[plot]!.outfit })));
      }
    },
  });
  /** The declare facts this test read, for the month's auction outcome. */
  function facts(state: GameState): PhaseFact[] {
    return [...declared].flatMap(([k, side]) => {
      const [seat, month, good] = k.split('/');
      return Number(month) === state.month ? [{ kind: 'declare' as const, seat: seat!, good: good as Good, side, month: state.month, phase: 'auction' as const }] : [];
    });
  }
  return { state: played.state, seats: played.seats, written, records, declared, installs, outcomes, final: stableJson(played.state) };
}

const writesOf = (t: Table, seat: string, month: number, phase: Playbook['phase']) => t.written.filter((pb) => pb.seat === seat && pb.month === month && pb.phase === phase);
const seatAt = (seats: unknown[], id: string) => (seats as AiSeat[]).find((s) => s.id === id)!;
/**
 * Each draft point's first tick of the month, by seat: the moment WS2's adopt lands just ahead of it. `perGood`, each
 * good's status screen is a point of its own (AM-20).
 */
function once(perGood = false): (seat: AiSeat, state: GameState, point: Point) => boolean {
  const seen = new Set<string>();
  return (seat, state, point) => {
    const k = key(seat.id, state.month, point === 'auction' && perGood ? `auction/${state.auction?.good}` : point);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };
}

/** A decider that counts what it is asked, by kind, and answers as `answer` says. */
function countingDecider(asked: string[], answer: 'throw' | 'never'): Decider {
  return {
    name: 'counting',
    decide: (_options, _persona, context) => {
      asked.push(`${context.month}/${context.kind}`);
      if (answer === 'throw') throw new Error('the decider broke');
      return new Promise(() => {});
    },
  };
}

/**
 * The budget for these tests, which play two months of four seats drafting at every draft point: about 1 s each alone,
 * and several times that in CI's parallel run, past vitest's 5 s default.
 */
const SLOW_MS = 20_000;

const ME = 'ai0';
const MONTH = 2;

describe('the seat plays its development and auction parts (C4, RULE-6, RULE-7)', { timeout: SLOW_MS }, () => {
  it("B-AC-7: a keyless seat writes its validated development and auction drafts, by 'engine', and plays them", () => {
    const t = playTable();
    for (const id of SPECS.map((_, i) => `ai${i}`)) {
      for (let month = 1; month <= MONTHS; month++) {
        const dev = writesOf(t, id, month, 'development');
        const auction = writesOf(t, id, month, 'auction');
        expect(dev, key(id, month)).toHaveLength(1);
        expect(auction.length, key(id, month)).toBeGreaterThanOrEqual(1);
        for (const pb of [...dev, ...auction]) {
          expect(pb).toMatchObject({ v: 1, seat: id, month, by: 'engine' });
          expect(pb.edits).toBeUndefined();
          expect(pb.rejected).toBeUndefined();
        }
        // It played the route it wrote: its installs, in order, are the route's own where they were done.
        const out = t.outcomes.get(key(id, month, 'development'))!;
        expect(out, key(id, month)).not.toBeNull();
        const route = dev[0]!.development!.route;
        expect(out!.items.filter((i) => i.path.startsWith('/development/route/')).map((i) => i.expected)).toEqual(route);
        const done = route.flatMap((s, i) => (s.act === 'install' && out!.items[i]!.actual === 'done' ? [s.plot] : []));
        expect(t.installs.get(key(id, month))!.map((x) => x.plot), key(id, month)).toEqual(done);
        // AM-20: the month's draft carries every good; each later good's own entry carries only that good.
        for (const pb of auction.slice(1)) expect(Object.keys(pb.auction!), key(id, month)).toHaveLength(1);
        // It declared each good's drafted side where the good had a status screen (a seller with nothing declares pass).
        const play = (g: Good) => [...auction].reverse().find((pb) => pb.auction![g])!.auction![g]!;
        for (const g of GOODS) {
          const side = t.declared.get(key(id, month, g));
          if (side === undefined || !play(g)) continue;
          const role = play(g).role === 'out' ? 'pass' : play(g).role;
          expect([role, 'pass'], key(id, month, g)).toContain(side);
        }
      }
    }
    // When several seats write at one status screen they write in seat order (AM-20).
    const auctionWrites = t.written.filter((pb) => pb.phase === 'auction' && pb.month === 1);
    const firstGood = auctionWrites.slice(0, SPECS.length).map((pb) => pb.seat);
    expect(firstGood).toEqual(SPECS.map((_, i) => `ai${i}`));
  });

  it('B-AC-6: an adopted playbook that differs in moneyMaker, an auction role or the route is followed, or the outcome names the fallback', () => {
    // (a) moneyMaker. WS2 edits the money-maker through the seat's gate, which re-drafts the route under it; adopted just
    // ahead of the month's first development tick, its MULEs that month are outfitted for the edited good.
    let edited: Good | null = null;
    const first = once();
    const base = playTable();
    const a = playTable({
      before: (seat, state, point) => {
        if (seat.id !== ME || state.month !== MONTH || point !== 'development' || !first(seat, state, point)) return;
        const draft = seat.draft(state, 'development');
        edited = (['smithore', 'energy', 'food'] as const).find((g) => g !== draft.strategy.moneyMaker)!;
        const { playbook, rejected } = seat.validator()(state, ME, draft, [{ path: '/strategy/moneyMaker', to: edited, reason: 'Ore pays.' }]);
        expect(rejected).toEqual([]);
        seat.adopt(playbook);
      },
    });
    const mine = a.installs.get(key(ME, MONTH))!;
    expect(mine.length, 'it installed MULEs that month').toBeGreaterThan(0);
    expect(mine.map((m) => m.outfit), 'outfitted for the edited money-maker').toEqual(mine.map(() => edited));
    expect(base.installs.get(key(ME, MONTH))!.map((m) => m.outfit), 'the draft alone outfits otherwise').not.toEqual(mine.map(() => edited));
    expect(a.written.filter((pb) => pb.seat === ME && pb.month === MONTH && pb.phase === 'development'), 'an adopted part is written by its writer, not the seat').toEqual([]);

    // (b) an auction role. The seat's own draft for a good it would trade, edited to 'out' and adopted ahead of the
    // auction's first status screen: its declare fact for that good is a pass, and its outcome says so.
    let good: Good | null = null;
    const firstB = once();
    const b = playTable({
      before: (seat, state, point) => {
        if (seat.id !== ME || state.month !== MONTH || point !== 'auction' || !firstB(seat, state, point)) return;
        const draft = seat.draft(state, 'auction');
        good = (Object.keys(draft.auction!) as Good[]).find((g) => draft.auction![g]!.role !== 'out' && base.declared.get(key(ME, MONTH, g)) === draft.auction![g]!.role)!;
        expect(good, 'a good the seat trades by its draft').toBeDefined();
        const { playbook, rejected } = seat.validator()(state, ME, draft, [{ path: `/auction/${good}/role`, to: 'out', reason: 'Sit this one out.' }]);
        expect(rejected).toEqual([]);
        seat.adopt(playbook);
      },
    });
    expect(base.declared.get(key(ME, MONTH, good!)), 'the draft alone trades it').not.toBe('pass');
    expect(b.declared.get(key(ME, MONTH, good!)), 'the declare fact: the edited role').toBe('pass');
    const roleItem = b.outcomes.get(key(ME, MONTH, 'auction'))!.items.find((i) => i.path === `/auction/${good}/role`)!;
    expect(roleItem).toMatchObject({ expected: 'out', actual: 'out' });

    // (c) the route. Two MULEs' plots swapped: its installs fall on the edited route's plots, in order, each with the
    // outfit the edited route gives it; any step that could not play is named in the outcome with why.
    let route: Playbook['development'] | null = null;
    const firstC = once();
    const c = playTable({
      before: (seat, state, point) => {
        if (seat.id !== ME || state.month !== MONTH || point !== 'development' || !firstC(seat, state, point)) return;
        const draft = seat.draft(state, 'development');
        const at = draft.development!.route.flatMap((s, i) => (s.act === 'install' ? [i] : []));
        expect(at.length, 'a route with two MULEs to swap').toBeGreaterThanOrEqual(2);
        const [i, j] = [at[0]!, at[1]!];
        const plotOf = (k: number) => draft.development!.route[k]!.plot!;
        const { playbook, rejected } = seat.validator()(state, ME, draft, [
          { path: `/development/route/${i}/plot`, to: plotOf(j), reason: 'That one first.' },
          { path: `/development/route/${j}/plot`, to: plotOf(i), reason: 'And this one second.' },
        ]);
        expect(rejected).toEqual([]);
        route = playbook.development!;
        seat.adopt(playbook);
      },
    });
    const out = c.outcomes.get(key(ME, MONTH, 'development'))!;
    expect(out, 'an outcome for the adopted part').not.toBeNull();
    const steps = route!.route;
    const wanted = steps.flatMap((s, i) => (s.act === 'install' ? [{ i, plot: s.plot!, outfit: steps[i - 1]!.outfit! }] : []));
    const playedOut = wanted.filter((w) => out!.items[w.i]!.actual === 'done');
    expect(c.installs.get(key(ME, MONTH)), 'its installs: the edited route, in order').toEqual(playedOut.map((w) => ({ plot: w.plot, outfit: w.outfit })));
    expect(playedOut.length, 'the swapped MULEs were installed').toBeGreaterThanOrEqual(2);
    for (const item of out!.items.filter((x) => x.path.startsWith('/development/route/') && x.actual !== 'done' && x.actual !== 'not reached')) expect(item.note, item.path).toBeTruthy();

    // An edit the gate refuses: the draft's route plays, and rejected names it.
    const firstD = once();
    let refused: NonNullable<Playbook['rejected']> = [];
    const d = playTable({
      before: (seat, state, point) => {
        if (seat.id !== ME || state.month !== MONTH || point !== 'development' || !firstD(seat, state, point)) return;
        const draft = seat.draft(state, 'development');
        const i = draft.development!.route.findIndex((s) => s.act === 'install');
        const theirs = state.tiles.findIndex((tile) => tile.owner !== null && tile.owner !== ME);
        const { playbook, rejected } = seat.validator()(state, ME, draft, [{ path: `/development/route/${i}/plot`, to: theirs, reason: 'Theirs.' }]);
        refused = rejected;
        seat.adopt(playbook);
      },
    });
    expect(refused.map((r) => r.path)).toEqual([expect.stringMatching(/^\/development\/route/)]);
    expect(d.installs.get(key(ME, MONTH)), 'the draft’s installs play').toEqual(base.installs.get(key(ME, MONTH)));
  });

  it('T-AC-12: one DecisionRecord per drafted development and auction playbook', () => {
    const t = playTable();
    for (const id of SPECS.map((_, i) => `ai${i}`)) {
      const persona = PERSONAS[t.seats.find((s) => s.id === id)!.mind.personaId as keyof typeof PERSONAS];
      for (let month = 1; month <= MONTHS; month++) {
        const lines = t.records.filter((r) => r.seat === id && r.month === month && r.id === 0);
        const dev = writesOf(t, id, month, 'development');
        const auction = writesOf(t, id, month, 'auction');
        expect(dev, key(id, month)).toHaveLength(1);
        expect(auction.length, key(id, month)).toBeGreaterThanOrEqual(1);
        // One line per playbook it drafted and wrote, in the phase it was drafted in; each later good's its own (AM-20).
        expect(lines.map((r) => `${r.kind}/${r.phase}`), key(id, month)).toEqual([...dev.map(() => 'develop/development'), ...auction.map(() => 'trade/auction')]);
        auction.forEach((pb, i) => expect(lines[dev.length + i]!.topic, key(id, month)).toBe(Object.keys(pb.auction!)[0]));
        for (const r of lines) {
          // AM-22: built by the seat, no candidates, the part's label for its pick, by 'top', and a line of the persona's.
          expect(r).toMatchObject({ candidates: [], by: 'top', waitedMs: 0 });
          const said = persona.lines[r.kind].map((l) => l.replace('{option}', r.pick.label.charAt(0).toLowerCase() + r.pick.label.slice(1)));
          expect(said, `${key(id, month)} ${r.line}`).toContain(r.line);
        }
        // So the table hears a line in each phase it heard one today: the land grant, development and the auction.
        const phases = new Set(t.records.filter((r) => r.seat === id && r.month === month && r.line).map((r) => r.phase));
        expect(phases.size, key(id, month)).toBeGreaterThanOrEqual(BRAIN.linesPerMonth);
      }
      // AM-22 (the seed pin): the seat's lines never advance the Brain's counter, so every Brain decision keeps the id,
      // and so the seed, it has on today's path: one after another, with none skipped, and none of the lines in its log.
      const brainIds = t.records.filter((r) => r.seat === id && r.id !== 0).map((r) => r.id);
      expect(brainIds, id).toEqual(brainIds.map((_, i) => i + 1));
      expect(t.seats.find((s) => s.id === id)!.brain.log.some((r) => r.id === 0), id).toBe(false);
    }

    // The negative: a seat on today's path emits exactly as today, as with AI_PLANS.on false.
    const today = playTable({ seat: () => ({ playbook: false }) });
    expect(today.records.some((r) => r.id === 0)).toBe(false);
    expect(today.written).toEqual([]);
    const saved = AI_PLANS.on;
    AI_PLANS.on = false;
    try {
      const off = playTable();
      expect(stableJson(today.records)).toBe(stableJson(off.records));
      expect(today.final).toBe(off.final);
    } finally {
      AI_PLANS.on = saved;
    }
  });

  it('T-AC-12 (AM-22): a Smart seat with only its development part adopted keeps its Brain ids, and so its seeds, unbroken', () => {
    const asked: string[] = [];
    const first = once();
    const t = playTable({
      seat: (id) => (id === ME ? { decider: countingDecider(asked, 'throw') } : {}),
      before: (seat, state, point) => {
        if (seat.id !== ME || point !== 'development' || !first(seat, state, point)) return;
        seat.adopt({ ...seat.draft(state, 'development'), by: 'llm' });
      },
    });
    const mine = t.records.filter((r) => r.seat === ME);
    // Adopted, it drafts no line of its own; its auction is today's asks (RULE-6 row 3), numbered straight on.
    expect(mine.some((r) => r.id === 0)).toBe(false);
    expect(mine.some((r) => r.kind === 'trade')).toBe(true);
    expect(mine.some((r) => r.kind === 'develop')).toBe(false);
    expect(mine.map((r) => r.id)).toEqual(mine.map((_, i) => i + 1));
  });

  it('T-AC-17: a decider that throws is called 0 times on the playbook path', () => {
    const run = (adopt: boolean) => {
      const asked: string[] = [];
      const first = once();
      const t = playTable({
        seat: (id) => (id === ME ? { decider: countingDecider(asked, 'throw') } : {}),
        before: (seat, state, point) => {
          if (!adopt || seat.id !== ME || point === 'planning' || !first(seat, state, point)) return;
          seat.adopt({ ...seat.draft(state, point), by: 'llm' });
        },
      });
      return { t, asked };
    };
    const { t, asked } = run(true);
    expect(asked.filter((a) => !a.endsWith('/land')), 'asked in development or the auction').toEqual([]);
    for (let month = 1; month <= MONTHS; month++) {
      // Both hands finished their parts: every route step met its fate, and every good shown it declared for.
      const dev = t.outcomes.get(key(ME, month, 'development'))!;
      expect(dev, `development ${month}`).not.toBeNull();
      const route = dev!.items.filter((i) => i.path.startsWith('/development/route/'));
      expect(route.length).toBeGreaterThan(0);
      expect(route.filter((i) => i.actual === 'not reached'), `development ${month}`).toEqual([]);
      const auction = t.outcomes.get(key(ME, month, 'auction'))!;
      expect(auction, `auction ${month}`).not.toBeNull();
      for (const g of GOODS) {
        if (!t.declared.has(key(ME, month, g))) continue;
        expect(auction!.items.find((i) => i.path === `/auction/${g}/role`)?.actual, `${month}/${g}`).not.toBe('skipped');
      }
    }
    // The negative: the same seat with no playbook asks it (today's path), and plays on with its default picks.
    const today = run(false);
    expect(today.asked.filter((a) => a.endsWith('/trade')).length).toBeGreaterThan(0);
    expect(today.t.outcomes.get(key(ME, 1, 'auction'))).toBeNull();
  });

  // trace-allow: HC-9, the spec's own failure-mode id for a draft or validator error (spec §4, "Retry, poison, page?"); trace-check reads no HC- ids
  it('HC-9: a development or auction draft or validator that throws is logged, writes nothing, and the seat plays today’s path', () => {
    const today = playTable({ seat: () => ({ playbook: false }) });
    for (const broke of ['draft', 'validator'] as const) {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      seam.throwing = broke;
      const t = playTable();
      seam.throwing = null;
      expect(t.written.filter((pb) => pb.phase === 'development' || pb.phase === 'auction'), broke).toEqual([]);
      const said = logged.mock.calls.map((c) => c.join(' '));
      expect(said.filter((s) => s.includes('development')).length, broke).toBe(SPECS.length * MONTHS);
      expect(said.some((s) => s.includes('auction') && s.includes(`${broke} broke`)), broke).toBe(true);
      // Every draft point fell back, the planning one included, so the whole game is today's.
      expect(t.final, broke).toBe(today.final);
      for (const s of t.seats) expect(s.outcome?.('development', t.state, []) ?? null).toBeNull();
      logged.mockRestore();
    }
    // A later good's one-good draft that throws: that good, and the rest of the auction, play today's path.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    seam.throwing = 'goodDraft';
    const t = playTable();
    seam.throwing = null;
    for (const id of SPECS.map((_, i) => `ai${i}`)) for (let m = 1; m <= MONTHS; m++) expect(writesOf(t, id, m, 'auction'), key(id, m)).toHaveLength(1);
    expect(logged.mock.calls.some((c) => c.join(' ').includes('draft broke'))).toBe(true);
    logged.mockRestore();
  });
});

const FULL = !!process.env.MULE_FULL;

describe.runIf(FULL)('the playbook path never waits (UBER-AC-2)', { timeout: 120_000 }, () => {
  /** Each development's and each auction's length in game ms, by month, from playGameAsync's own steps. */
  async function phaseEnds(o: TableOptions): Promise<Record<string, number>> {
    harness.options = ({ id }) => ({ ...o.seat?.(id) });
    harness.before = o.before ? (seat, state, point) => o.before!(seat as AiSeat, state as GameState, point) : null;
    const ends: Record<string, number> = {};
    let state: GameState | null = null;
    const played = await playGameAsync(SEED, SPECS, {
      politics: false,
      maxMonths: FULL_MONTHS,
      onPhase: (s) => void (state = s),
      between: () => {
        const s = state as GameState | null;
        if (s && (s.phase === 'development' || s.phase === 'auction')) ends[`${s.month}/${s.phase}`] = (ends[`${s.month}/${s.phase}`] ?? 0) + 1;
      },
    });
    expect(played.state.phase).toBe('gameOver');
    return ends;
  }
  const FULL_MONTHS = 4;

  it('B-AC-8: development and the auction end at the keyless game time when the decider never answers', async () => {
    const keyless = await phaseEnds({});
    const asked: string[] = [];
    const first = once(true);
    // WS2's stand-in: the seat's own draft for each phase, adopted just ahead of its draft point, each good's included.
    const adopted = await phaseEnds({
      seat: (id) => (id === ME ? { decider: countingDecider(asked, 'never') } : {}),
      before: (seat, state, point) => {
        if (seat.id !== ME || !first(seat, state, point)) return;
        seat.adopt({ ...seat.draft(state, point), by: 'llm' });
      },
    });
    expect(Object.keys(keyless).length).toBeGreaterThan(0);
    expect(adopted).toEqual(keyless);
    expect(asked.filter((a) => !a.endsWith('/land'))).toEqual([]);
    // The negative: the same seat with no playbook waits out its asks (today's 2.5 s), and the auction ends later.
    const waiting = await phaseEnds({ seat: (id) => (id === ME ? { decider: countingDecider([], 'never') } : {}) });
    const auctionMs = (e: Record<string, number>) => Object.entries(e).filter(([k]) => k.endsWith('/auction')).reduce((n, [, v]) => n + v, 0);
    expect(auctionMs(waiting)).toBeGreaterThan(auctionMs(keyless));
  });
});
