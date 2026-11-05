import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_PLANS,
  BRAIN,
  GOODS,
  stableJson,
  TERRAIN_ODDS,
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

const OWN_PHASES = AI_PLANS.ownPhases;
afterEach(() => {
  AI_PLANS.ownPhases = OWN_PHASES;
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
  /** Per seat and month, the plots of those installs that were the hand's own picks, off its route (AM-27). */
  ownInstalls: Map<string, number[]>;
  /** Per seat and month, each phase's PhaseOutcome as the phase ended (null on today's path). */
  outcomes: Map<string, ReturnType<AiSeat['outcome']>>;
  /** The game's acts and its final state, compared run against run. */
  final: string;
  /** Per month, the game at its first development tick, before any seat plays it. */
  devStarts: Map<number, string>;
  /** Per month, the game as its auction ended. */
  auctionEnds: Map<number, string>;
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
  const ownInstalls = new Map<string, number[]>();
  const outcomes = new Map<string, ReturnType<AiSeat['outcome']>>();
  harness.options = ({ id }) => ({ onPlaybook: (pb: Playbook) => written.push(structuredClone(pb)), onDecision: (r: DecisionRecord) => records.push(structuredClone(r)), ...o.seat?.(id) });
  const devStarts = new Map<number, string>();
  const auctionEnds = new Map<number, string>();
  harness.before = (seat, s, point) => {
    const state = s as GameState;
    if (point === 'development' && !devStarts.has(state.month)) devStarts.set(state.month, stableJson(state));
    o.before?.(seat as AiSeat, state, point);
  };
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
      if (state.phase === 'auction') auctionEnds.set(state.month, stableJson(state));
      for (const s of seats()) {
        outcomes.set(key(s.id, state.month, state.phase), s.outcome?.(state.phase, state, facts(state)) ?? null);
        if (state.phase !== 'development') continue;
        const done = s.developLog().filter((e) => e.ok && e.action.type === 'install');
        const plotOf = (e: (typeof done)[number]) => (e.action.type === 'install' ? tileIndex(state.width, e.action.x, e.action.y) : -1);
        installs.set(key(s.id, state.month), done.map(plotOf).map((plot) => ({ plot, outfit: state.tiles[plot]!.outfit })));
        ownInstalls.set(key(s.id, state.month), done.filter((e) => e.route === undefined).map(plotOf));
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
  return { state: played.state, seats: played.seats, written, records, declared, installs, ownInstalls, outcomes, final: stableJson(played.state), devStarts, auctionEnds };
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

/**
 * The own path's development and auction parts play only with AI_PLANS.ownPhases on (AM-26). C4's promises for them
 * are proved with it on, the path a later PM ruling switches on: a test calls this first, and afterEach puts it back.
 */
function ownPhasesOn(): void {
  AI_PLANS.ownPhases = true;
}

describe('the own path plays today’s development and auction while AI_PLANS.ownPhases is off (AM-26, RULE-6)', { timeout: SLOW_MS }, () => {
  it("B-AC-6, T-AC-13 (RULE-6, AI_PLANS.ownPhases off): a Classic seat's own path plays today's development and auction and writes neither; its planning still writes and plays; an adopted part still plays", () => {
    expect(AI_PLANS.ownPhases, 'the default').toBe(false);
    // Seed 4's third month is the first in which a seat runs short of cash, so it lists in planning.
    const [seed, months] = [4, 3];
    /** Per seat and month, the planning acts it played, read at its first development tick. */
    const planningLogs = (into: Map<string, string>) => {
      const first = once();
      return (seat: AiSeat, state: GameState, point: Point) => {
        if (point === 'development' && first(seat, state, point)) into.set(key(seat.id, state.month), stableJson(seat.planningLog()));
      };
    };
    /** Per month, the game at its first development tick and as its auction ended, and that span's records. */
    const phases = (t: Table, starts: Map<number, string>) =>
      [...starts].map(([month, start]) => ({ month, start, end: t.auctionEnds.get(month)!, records: stableJson(t.records.filter((r) => r.month === month && (r.phase === 'development' || r.phase === 'auction'))) }));

    const ownLogs = new Map<string, string>();
    const own = playTable({ seed, months, before: planningLogs(ownLogs) });
    const today = playTable({ seed, months, seat: () => ({ playbook: false }) });

    // Writes: its planning playbook each month, and no development or auction one; and it says no drafted line.
    for (const id of SPECS.map((_, i) => `ai${i}`)) {
      for (let month = 1; month <= months; month++) {
        expect(writesOf(own, id, month, 'planning'), key(id, month)).toHaveLength(1);
        expect(own.outcomes.get(key(id, month, 'development')), key(id, month)).toBeNull();
        expect(own.outcomes.get(key(id, month, 'auction')), key(id, month)).toBeNull();
      }
    }
    expect(own.written.filter((pb) => pb.phase !== 'planning')).toEqual([]);
    expect(own.records.some((r) => r.id === 0)).toBe(false);
    // Its planning part plays: the seat short of cash lists in it.
    expect([...ownLogs.values()].some((log) => log.includes('"type":"list"')), 'a planning act played').toBe(true);

    // Each month whose development opens on the same game as today's plays its development and auction as today's:
    // the same records and the same game as the auction ends. Months 1 and 2 at least; from a month whose planning
    // listed, the two games differ by the listing, so it is not compared.
    const compared = phases(own, own.devStarts).filter((p) => p.start === today.devStarts.get(p.month));
    expect(compared.map((p) => p.month)).toEqual(expect.arrayContaining([1, 2]));
    for (const p of compared) {
      const t = phases(today, today.devStarts).find((x) => x.month === p.month)!;
      expect(p.records, `month ${p.month}: development and auction records`).toBe(t.records);
      expect(p.end, `month ${p.month}: the game as the auction ends`).toBe(t.end);
    }

    // An adopted part still plays (B-AC-6's adopted case, RULE-6 row 2): ME's own drafts, adopted at its draft points
    // with one good it trades today set 'out'. It follows the route and declares the edited role; it writes neither.
    const base = playTable({ seat: () => ({ playbook: false }) });
    let out: Good | null = null;
    let adoptedRoute: NonNullable<Playbook['development']>['route'] = [];
    const first = once();
    const adopted = playTable({
      before: (seat, state, point) => {
        if (seat.id !== ME || state.month !== MONTH || point === 'planning' || !first(seat, state, point)) return;
        const draft = seat.draft(state, point);
        if (point === 'development') {
          adoptedRoute = draft.development!.route;
          return seat.adopt({ ...draft, by: 'llm' });
        }
        out = (Object.keys(draft.auction!) as Good[]).find((g) => draft.auction![g]!.role !== 'out' && base.declared.get(key(ME, MONTH, g)) === draft.auction![g]!.role) ?? null;
        expect(out, 'a good the seat trades today and by its draft').not.toBeNull();
        const { playbook, rejected } = seat.validator()(state, ME, draft, [{ path: `/auction/${out}/role`, to: 'out', reason: 'Sit this one out.' }]);
        expect(rejected).toEqual([]);
        seat.adopt({ ...playbook, by: 'llm' });
      },
    });
    const dev = adopted.outcomes.get(key(ME, MONTH, 'development'));
    expect(dev, 'an outcome for the adopted development part').not.toBeNull();
    expect(dev!.items.filter((i) => i.path.startsWith('/development/route/')).map((i) => i.expected)).toEqual(adoptedRoute);
    const done = adoptedRoute.flatMap((s, i) => (s.act === 'install' && dev!.items[i]!.actual === 'done' ? [s.plot] : []));
    expect(adopted.installs.get(key(ME, MONTH))!.map((x) => x.plot), 'its installs: the adopted route’s').toEqual(done);
    expect(adopted.declared.get(key(ME, MONTH, out!)), 'the declare fact: the adopted role').toBe('pass');
    expect(base.declared.get(key(ME, MONTH, out!)), 'today’s path trades it').not.toBe('pass');
    expect(adopted.outcomes.get(key(ME, MONTH, 'auction'))!.items.find((i) => i.path === `/auction/${out}/role`)).toMatchObject({ expected: 'out', actual: 'out' });
    expect(adopted.written.filter((pb) => pb.phase === 'development' || pb.phase === 'auction'), 'no own development or auction playbook').toEqual([]);
    expect(adopted.records.some((r) => r.id === 0)).toBe(false);
  });
});

// The own-path promises switch AI_PLANS.ownPhases on (ownPhasesOn); the adopted-path ones play with the default.
describe('the seat plays its development and auction parts (C4, RULE-6, RULE-7)', { timeout: SLOW_MS }, () => {
  it("B-AC-7: a keyless seat writes its validated development and auction drafts, by 'engine', and plays them", () => {
    ownPhasesOn();
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
        // It played the route it wrote: its installs, in order, are the route's own where they were done, and besides
        // them only its own picks after an analysis (AM-27), each in place of a route MULE or added after the last.
        const out = t.outcomes.get(key(id, month, 'development'))!;
        expect(out, key(id, month)).not.toBeNull();
        const route = dev[0]!.development!.route;
        expect(out!.items.filter((i) => i.path.startsWith('/development/route/')).map((i) => i.expected)).toEqual(route);
        const done = route.flatMap((s, i) => (s.act === 'install' && out!.items[i]!.actual === 'done' ? [s.plot] : []));
        const own = t.ownInstalls.get(key(id, month))!;
        expect(t.installs.get(key(id, month))!.map((x) => x.plot).filter((p) => !own.includes(p)), key(id, month)).toEqual(done);
        if (own.length > 0) expect(route.some((s) => s.act === 'analyse'), key(id, month)).toBe(true);
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
    ownPhasesOn();
    // (a) moneyMaker. WS2 edits the money-maker through the seat's gate, which re-drafts the route under it (RULE-1's
    // re-plan); adopted just ahead of the month's first development tick, its MULEs that month are outfitted for the
    // edited good. The first seat and month whose re-drafted route outfits every MULE for the edited good, on plots that
    // grow it well (TERRAIN_ODDS 'good': where a plot can make it), is the one edited.
    // Measured 5 Nov (seeds 1-8, months 1-4, edits to a good the drafted plots grow well): the re-draft does so for 29
    // of 117, part of its MULEs for 37,
    // none for 51; developDecision's lean (C5, AI_PLANS.moneyMaker) decides that, not the hand, and it is reported.
    let edited: { seat: string; month: number; good: Good } | null = null;
    const first = once();
    const base = playTable();
    const a = playTable({
      before: (seat, state, point) => {
        if (edited || point !== 'development' || !first(seat, state, point)) return;
        const draft = seat.draft(state, 'development');
        const outfits = (pb: Playbook) => pb.development!.route.flatMap((s) => (s.act === 'outfit' ? [s.outfit] : []));
        const plots = (pb: Playbook) => pb.development!.route.flatMap((s) => (s.act === 'install' ? [state.tiles[s.plot!]!] : []));
        const grows = (pb: Playbook, g: Good) => plots(pb).every((t) => t.terrain !== 'store' && TERRAIN_ODDS[t.terrain].grown[g as keyof (typeof TERRAIN_ODDS)['plains']['grown']] === 'good');
        for (const good of GOODS.filter((g) => g !== draft.strategy.moneyMaker)) {
          const { playbook, rejected } = seat.validator()(state, seat.id, draft, [{ path: '/strategy/moneyMaker', to: good, reason: 'This pays.' }]);
          const all = outfits(playbook);
          const mine = outfits(draft);
          if (rejected.length > 0 || all.length === 0 || !grows(playbook, good) || all.some((o) => o !== good) || (mine.length > 0 && mine.every((o) => o === good))) continue;
          edited = { seat: seat.id, month: state.month, good };
          seat.adopt(playbook);
          return;
        }
      },
    });
    expect(edited, 'a seat whose gate re-drafts its MULEs for the edited money-maker').not.toBeNull();
    const { seat: who, month: when, good: maker } = edited!;
    const mine = a.installs.get(key(who, when))!;
    expect(mine.length, 'it installed MULEs that month').toBeGreaterThan(0);
    expect(mine.map((m) => m.outfit), 'outfitted for the edited money-maker').toEqual(mine.map(() => maker));
    expect(base.installs.get(key(who, when))!.map((m) => m.outfit), 'the draft alone outfits otherwise').not.toEqual(mine.map(() => maker));
    expect(a.written.filter((pb) => pb.seat === who && pb.month === when && pb.phase === 'development'), 'an adopted part is written by its writer, not the seat').toEqual([]);

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
    // The first seat and month whose draft leads two MULEs out is the one edited.
    let route: { seat: string; month: number; part: NonNullable<Playbook['development']> } | null = null;
    const firstC = once();
    const c = playTable({
      before: (seat, state, point) => {
        if (route || point !== 'development' || !firstC(seat, state, point)) return;
        const draft = seat.draft(state, 'development');
        const at = draft.development!.route.flatMap((s, i) => (s.act === 'install' ? [i] : []));
        // A route MULE after an analysis is picked again as it is reached (AM-27), so the swap is read where none is.
        if (at.length < 2 || draft.development!.route.slice(0, at[1]).some((s) => s.act === 'analyse')) return;
        const [i, j] = [at[0]!, at[1]!];
        const plotOf = (k: number) => draft.development!.route[k]!.plot!;
        const { playbook, rejected } = seat.validator()(state, seat.id, draft, [
          { path: `/development/route/${i}/plot`, to: plotOf(j), reason: 'That one first.' },
          { path: `/development/route/${j}/plot`, to: plotOf(i), reason: 'And this one second.' },
        ]);
        expect(rejected).toEqual([]);
        route = { seat: seat.id, month: state.month, part: playbook.development! };
        seat.adopt(playbook);
      },
    });
    expect(route, 'a seat whose draft leads two MULEs out').not.toBeNull();
    const { seat: swapped, month: then } = route!;
    expect(c.installs.get(key(swapped, then)), 'the draft alone installs otherwise').not.toEqual(base.installs.get(key(swapped, then)));
    const out = c.outcomes.get(key(swapped, then, 'development'))!;
    expect(out, 'an outcome for the adopted part').not.toBeNull();
    const steps = route!.part.route;
    const wanted = steps.flatMap((s, i) => (s.act === 'install' ? [{ i, plot: s.plot!, outfit: steps[i - 1]!.outfit! }] : []));
    const playedOut = wanted.filter((w) => out!.items[w.i]!.actual === 'done');
    expect(c.installs.get(key(swapped, then)), 'its installs: the edited route, in order').toEqual(playedOut.map((w) => ({ plot: w.plot, outfit: w.outfit })));
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

  it('B-AC-6 (AM-27): an adopted route with analyses plays as adopted, its installs the route’s, while the own route in the same state is picked again', () => {
    ownPhasesOn();
    // G-2: an adopted playbook (WS2's writer, Claude's edits) reaches the board as adopted; the hand's own picks after
    // the analyses are for the seat's own draft only. The case: the first seat-month on seed 11 whose own route
    // analyses before its MULEs and whose own play replaced a route MULE on the analysed ground, so the route's MULE
    // differs from the seat's own pick there. The same route, adopted at the same tick, plays as it stands.
    const SEED_11 = 11;
    const MONTHS_3 = 3;
    const scoutsFirst = (pb: Playbook) => {
      const route = pb.development!.route;
      const buy = route.findIndex((s) => s.act === 'buyMule');
      return buy > 0 && route.slice(0, buy).some((s) => s.act === 'analyse');
    };
    const routeItems = (t: Table, seat: string, month: number) => t.outcomes.get(key(seat, month, 'development'))!.items.filter((i) => i.path.startsWith('/development/route/'));
    const own = playTable({ seed: SEED_11, months: MONTHS_3 });
    const theCase = own.written.find(
      (pb) => pb.phase === 'development' && scoutsFirst(pb) && routeItems(own, pb.seat, pb.month).some((i) => i.actual === 'replaced' && i.note === 'ground analysed'),
    );
    expect(theCase, 'a seat-month whose own route was picked again after its analyses').toBeDefined();
    const { seat: who, month: when } = theCase!;
    const route = theCase!.development!.route;

    const first = once();
    let adopted: Playbook | null = null;
    const t = playTable({
      seed: SEED_11,
      months: MONTHS_3,
      before: (seat, state, point) => {
        if (seat.id !== who || state.month !== when || point !== 'development' || !first(seat, state, point)) return;
        adopted = seat.draft(state, 'development');
        seat.adopt(adopted);
      },
    });
    expect(adopted!.development!.route, 'the same route as the own path drafted').toEqual(route);
    const items = routeItems(t, who, when);
    const log = JSON.stringify(items);
    expect(items.filter((i) => i.note === 'ground analysed'), log).toEqual([]);
    expect(t.ownInstalls.get(key(who, when)), 'no MULE the hand picked itself').toEqual([]);
    // The promise: its installs, in order, are the adopted route's where they were done, each with the route's outfit.
    const wanted = route.flatMap((s, i) => (s.act === 'install' && items[i]!.actual === 'done' ? [{ plot: s.plot!, outfit: route[i - 1]!.outfit! }] : []));
    expect(wanted.length, log).toBeGreaterThan(0);
    expect(t.installs.get(key(who, when)), log).toEqual(wanted);
    expect(own.installs.get(key(who, when)), 'the own path installed otherwise').not.toEqual(wanted);
  });

  it('T-AC-12: one DecisionRecord per drafted development and auction playbook', () => {
    ownPhasesOn();
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
    ownPhasesOn();
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
    // Its keyless game is the own path's, so the seat's own drafts adopted play it exactly: with the switch off the
    // keyless seat plays today's, and the adopted drafts make another game (measured 5 Nov, AM-26).
    ownPhasesOn();
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
