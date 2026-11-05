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
  /** Each auction act a seat makes, and whether the rules took it. */
  acted: null as ((seat: unknown, state: unknown, action: unknown, ok: boolean) => void) | null,
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
      super.auctionTick(state, dt, (action) => {
        const ok = act(action);
        harness.acted?.(this, state, action, ok);
        return ok;
      });
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
    draftPlaybook: (...args: Parameters<typeof real.draftPlaybook>) => {
      if (seam.throwing === 'draft') throw new Error('draft broke');
      return real.draftPlaybook(...args);
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
  harness.acted = null;
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
  /** The units of a good a seat bought or sold in a month's auction, from play.ts's trade facts. */
  traded: (seat: string, month: number, good: Good) => number;
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
  /** Per seat, month and good, its auction acts in order, each with the stage and walk time it was made at. */
  acts: Map<string, string[]>;
}

const key = (seat: string, month: number, more = '') => `${seat}/${month}${more && `/${more}`}`;

interface TableOptions {
  seat?: (id: string) => Partial<AiSeatOptions>;
  before?: (seat: AiSeat, state: GameState, point: Point) => void;
  months?: number;
  seed?: number;
  /** At the end of each phase, before the game moves on: where a test builds its case, the same in every game it compares. */
  edit?: (state: GameState) => void;
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
  const acts = new Map<string, string[]>();
  harness.acted = (seat, s, action, ok) => {
    const a = (s as GameState).auction;
    const k = key((seat as AiSeat).id, (s as GameState).month, a?.good ?? '');
    acts.set(k, [...(acts.get(k) ?? []), stableJson({ stage: a?.stage, elapsed: a?.elapsed, action, ok })]);
  };
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
      o.edit?.(state);
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
  const traded = (seat: string, month: number, good: Good) =>
    played.facts.reduce((n, f) => n + (f.kind === 'trade' && f.month === month && f.good === good && (f.buyer === seat || f.seller === seat) ? f.qty : 0), 0);
  return { state: played.state, seats: played.seats, written, records, declared, traded, installs, ownInstalls, outcomes, final: stableJson(played.state), devStarts, auctionEnds, acts };
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

/** Runs `f` on the game as each of `phases` of `month` ends. */
const asEnds = (month: number, phases: GameState['phase'][], f: (state: GameState) => void) => (state: GameState) => {
  if (state.month === month && phases.includes(state.phase)) f(state);
};

/**
 * ME's land as `month`'s land grant ends, and its land auction if one is held, so its development opens on it: its own
 * plots taken away, then the free plots nearest the store of each terrain given (`terrain:outfit` for one already
 * outfitted), analysed unless `analysed` is false, and BUILT_MONEY. The plots go into `into`, in the order given.
 */
function landed(month: number, terrains: string[], into: number[] = [], analysed = true) {
  return asEnds(month, ['landGrant', 'landAuction'], (state) => {
    for (const t of state.tiles) if (t.owner === ME) Object.assign(t, { owner: null, outfit: null });
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    const far = (i: number) => Math.abs(state.tiles[i]!.x - store.x) + Math.abs(state.tiles[i]!.y - store.y);
    const free = state.tiles.flatMap((t, i) => (t.owner === null && t.terrain !== 'store' ? [i] : [])).sort((a, b) => far(a) - far(b) || a - b);
    into.length = 0;
    for (const spec of terrains) {
      const [terrain, outfit = null] = spec.split(':');
      const plot = free.find((i) => state.tiles[i]!.terrain === terrain && !into.includes(i))!;
      Object.assign(state.tiles[plot]!, { owner: ME, outfit });
      into.push(plot);
    }
    const me = state.players.find((p) => p.id === ME)!;
    if (analysed) me.analysed.push(...into.filter((i) => !me.analysed.includes(i)));
    me.money = BUILT_MONEY;
  });
}

/** A farm and two river plots: Food and Water grow well on a river. */
const RIVERS = ['plains:food', 'river', 'river'];
/** ME's money in a built case: more than a month's MULEs and goods cost. */
const BUILT_MONEY = 3_000;
/** The Food the store holds in a built auction case: more than any seat buys in one auction. */
const STORE_FOOD = 30;

/** ME's Food, Water and Energy in a built case: more than a month's needs, so no staple pulls its MULE picks. */
const STAPLES = 20;
/** As `month`'s land grant ends, ME holds STAPLES of Food, Water and Energy. */
const stocked = (month: number) => asEnds(month, ['landGrant'], (state) => void Object.assign(state.players.find((p) => p.id === ME)!.stock, { food: STAPLES, water: STAPLES, energy: STAPLES }));

/** As `month`'s production ends, ME holds no Food and BUILT_MONEY, and the store STORE_FOOD: it buys Food at the auction. */
const hungry = (month: number) =>
  asEnds(month, ['production'], (state) => {
    const me = state.players.find((p) => p.id === ME)!;
    me.stock.food = 0;
    me.money = BUILT_MONEY;
    state.store.stock.food = STORE_FOOD;
  });

/** C4's own-path promises are proved with AI_PLANS.ownPhases on: a test calls this first, and afterEach puts it back. See AM-26. */
function ownPhasesOn(): void {
  AI_PLANS.ownPhases = true;
}

describe('the own path plays today’s development and auction while AI_PLANS.ownPhases is off (AM-26, RULE-6)', { timeout: SLOW_MS }, () => {
  it("B-AC-6, T-AC-13 (RULE-6, AI_PLANS.ownPhases off): a Classic seat's own path plays today's development and auction and writes neither; its planning still writes and plays; an adopted part still plays", () => {
    expect(AI_PLANS.ownPhases, 'the default').toBe(false);
    // The built case: as month 1 ends every seat holds the cash to stay off the planning auction; as month 2 ends ME
    // holds none and an idle plot, so month 3's planning lists it.
    const months = 3;
    const solvent = asEnds(1, ['upkeep'], (state) => state.players.forEach((p) => void (p.money = BUILT_MONEY)));
    const broke = asEnds(2, ['upkeep'], (state) => {
      const me = state.players.find((p) => p.id === ME)!;
      me.money = 0;
      Object.assign(state.tiles.find((t) => t.owner === null && t.terrain !== 'store')!, { owner: ME, outfit: null });
    });
    const edit = (state: GameState) => {
      solvent(state);
      broke(state);
    };
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
    const own = playTable({ months, edit, before: planningLogs(ownLogs) });
    const today = playTable({ months, edit, seat: () => ({ playbook: false }) });

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
    expect(ownLogs.get(key(ME, 3)), 'a planning act played').toContain('"type":"list"');

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

    // An adopted part still plays (B-AC-6's adopted case, RULE-6 row 2): ME's own drafts, adopted at its draft points,
    // on the built case of a farm, two river plots and no Food at the auction, with Food set 'out'. It follows the route
    // and sits Food out: it stays the buyer everyone starts as and trades none of it. It writes neither.
    const built = (state: GameState) => {
      landed(1, RIVERS)(state);
      hungry(1)(state);
    };
    const base = playTable({ months: 1, edit: built, seat: () => ({ playbook: false }) });
    let adoptedRoute: NonNullable<Playbook['development']>['route'] = [];
    const first = once();
    const adopted = playTable({
      months: 1,
      edit: built,
      before: (seat, state, point) => {
        if (seat.id !== ME || point === 'planning' || !first(seat, state, point)) return;
        const draft = seat.draft(state, point);
        if (point === 'development') {
          adoptedRoute = draft.development!.route;
          return seat.adopt({ ...draft, by: 'llm' });
        }
        expect(draft.auction!.food!.role, 'the draft buys Food').toBe('buyer');
        const { playbook, rejected } = seat.validator()(state, ME, draft, [{ path: '/auction/food/role', to: 'out', reason: 'Sit this one out.' }]);
        expect(rejected).toEqual([]);
        seat.adopt({ ...playbook, by: 'llm' });
      },
    });
    const dev = adopted.outcomes.get(key(ME, 1, 'development'));
    expect(dev, 'an outcome for the adopted development part').not.toBeNull();
    expect(dev!.items.filter((i) => i.path.startsWith('/development/route/')).map((i) => i.expected)).toEqual(adoptedRoute);
    const done = adoptedRoute.flatMap((s, i) => (s.act === 'install' && dev!.items[i]!.actual === 'done' ? [s.plot] : []));
    expect(done.length, 'a route MULE installed').toBeGreaterThan(0);
    expect(adopted.installs.get(key(ME, 1))!.map((x) => x.plot), 'its installs: the adopted route’s').toEqual(done);
    expect(adopted.declared.get(key(ME, 1, 'food')), 'the declare fact: the buyer everyone starts as').toBe('buyer');
    expect(adopted.traded(ME, 1, 'food'), 'the adopted role: it trades none of it').toBe(0);
    expect(base.traded(ME, 1, 'food'), 'today’s path trades it').toBeGreaterThan(0);
    expect(adopted.outcomes.get(key(ME, 1, 'auction'))!.items.find((i) => i.path === '/auction/food/role')).toMatchObject({ expected: 'out', actual: 'out' });
    expect(adopted.written.filter((pb) => pb.phase === 'development' || pb.phase === 'auction'), 'no own development or auction playbook').toEqual([]);
    expect(adopted.records.some((r) => r.id === 0)).toBe(false);
  });

  it("B-AC-6, T-AC-13 (AM-26, AI_PLANS.ownPhases off): a good an adopted auction part lacks plays today's hand, act for act, and the seat drafts and writes nothing for it", () => {
    // ME's own auction draft, adopted at month 1's first status screen without Food, the good that is up. The built
    // case: ME opens the auction with no Food and the money to buy it, so today's hand trades it.
    const atStatus = (state: GameState) => state.auction?.good && state.auction.stage === 'status';
    const statusAt = (into: Map<string, string>) => (seat: AiSeat, state: GameState) => {
      if (seat.id === ME && atStatus(state) && !into.size) into.set(state.auction!.good!, stableJson(state));
    };
    const baseAt = new Map<string, string>();
    const edit = hungry(1);
    const base = playTable({ months: 1, edit, seat: () => ({ playbook: false }), before: statusAt(baseAt) });
    const adoptedAt = new Map<string, string>();
    let missing: Good | null = null;
    let kept: Good[] = [];
    const adopted = playTable({
      months: 1,
      edit,
      before: (seat, state, point) => {
        if (point !== 'auction') return;
        statusAt(adoptedAt)(seat, state);
        if (missing || seat.id !== ME || !atStatus(state)) return;
        missing = state.auction!.good!;
        const draft = seat.draft(state, 'auction');
        const { [missing]: _, ...rest } = draft.auction!;
        kept = Object.keys(rest) as Good[];
        const { playbook } = seat.validator()(state, ME, { ...draft, auction: rest }, []);
        expect(Object.keys(playbook.auction!), 'the gate keeps the good out').toEqual(kept);
        seat.adopt({ ...playbook, by: 'llm' });
      },
    });
    expect(missing, 'the good up at the first status screen').toBe('food');
    expect(base.traded(ME, 1, 'food'), "today's hand trades it").toBeGreaterThan(0);
    expect(kept.length, 'the adopted part plays other goods').toBeGreaterThan(0);
    expect(adoptedAt.get(missing!), 'the same game as the good comes up').toBe(baseAt.get(missing!));
    const acts = adopted.acts.get(key(ME, 1, missing!));
    expect(acts?.length, 'it acts on the good').toBeGreaterThan(0);
    expect(acts, "its acts on the good: today's").toEqual(base.acts.get(key(ME, 1, missing!)));
    expect(adopted.written.filter((pb) => pb.phase === 'auction'), 'no own auction entry').toEqual([]);
    expect(adopted.records.some((r) => r.id === 0), 'no drafted line').toBe(false);
    const items = adopted.outcomes.get(key(ME, 1, 'auction'))!.items;
    expect(items.some((i) => i.path.startsWith(`/auction/${missing}/`)), 'the outcome names no part for it').toBe(false);
    expect(items.some((i) => i.path.startsWith(`/auction/${kept[0]}/`)), 'the adopted goods are in it').toBe(true);
  });

  it("B-AC-6, T-AC-13 (AM-26, the seat's ownPhases on): a good an adopted auction part lacks is drafted and played, its one-good entry written in seat order", () => {
    // The mirror of the row above, with AI_PLANS.ownPhases still off and every seat's own ownPhases option on. ME's own
    // auction draft is adopted at month 1's first status screen without Food, the good that is up; ME opens the
    // auction with no Food and the money to buy it.
    let kept: Good[] | null = null;
    const t = playTable({
      months: 1,
      edit: hungry(1),
      seat: () => ({ ownPhases: true }),
      before: (seat, state, point) => {
        if (kept || point !== 'auction' || seat.id !== ME || state.auction?.stage !== 'status') return;
        expect(state.auction.good, 'the good up at the first status screen').toBe('food');
        const { food: _, ...rest } = seat.draft(state, 'auction').auction!;
        kept = Object.keys(rest) as Good[];
        const { playbook } = seat.validator()(state, ME, { ...seat.draft(state, 'auction'), auction: rest }, []);
        seat.adopt({ ...playbook, by: 'llm' });
      },
    });
    expect(AI_PLANS.ownPhases, 'the global switch').toBe(false);
    expect(kept!.length, 'the adopted part plays other goods').toBeGreaterThan(0);
    // At Food's status screen every seat writes, in seat order: ME a one-good entry for Food, the rest their drafts.
    const atFood = t.written.filter((pb) => pb.phase === 'auction' && pb.month === 1).slice(0, SPECS.length);
    expect(atFood.map((pb) => pb.seat), 'in seat order').toEqual(SPECS.map((_, i) => `ai${i}`));
    expect(Object.keys(atFood[0]!.auction!), "ME's entry: Food alone").toEqual(['food']);
    // The drafted play is the one it plays: its outcome names Food's part, and it buys the Food it lacks.
    const items = t.outcomes.get(key(ME, 1, 'auction'))!.items;
    expect(items.find((i) => i.path === '/auction/food/role'), "the outcome names Food's drafted part").toMatchObject({ expected: atFood[0]!.auction!.food!.role });
    expect(t.traded(ME, 1, 'food'), 'it buys Food').toBeGreaterThan(0);
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
        // It declared each good's drafted side where the good had a status screen. There is no Pass (#335): everyone
        // starts as a buyer, so a buyer, an 'out' and a seller with nothing stand as buyers, and an 'out' trades none.
        const play = (g: Good) => [...auction].reverse().find((pb) => pb.auction![g])!.auction![g]!;
        for (const g of GOODS) {
          const side = t.declared.get(key(id, month, g));
          if (side === undefined || !play(g)) continue;
          expect(play(g).role === 'seller' ? ['seller', 'buyer'] : ['buyer'], key(id, month, g)).toContain(side);
          if (play(g).role === 'out') expect(t.traded(id, month, g), key(id, month, g)).toBe(0);
        }
      }
    }
    // When several seats write at one status screen they write in seat order (AM-20).
    const auctionWrites = t.written.filter((pb) => pb.phase === 'auction' && pb.month === 1);
    const firstGood = auctionWrites.slice(0, SPECS.length).map((pb) => pb.seat);
    expect(firstGood).toEqual(SPECS.map((_, i) => `ai${i}`));
  });

  // Five one-month games: a few seconds alone, more in CI's parallel run.
  it('B-AC-6: an adopted playbook that differs in moneyMaker, an auction role or the route is followed, or the outcome names the fallback', () => {
    ownPhasesOn();
    // The built case, in every game here: ME opens month 1's development with a farm and two river plots, analysed,
    // and opens its auction with no Food and the money to buy it.
    const plots: number[] = [];
    const edit = (state: GameState) => {
      landed(1, RIVERS, plots)(state);
      hungry(1)(state);
    };
    const base = playTable({ months: 1, edit });
    const outfits = (pb: Playbook) => pb.development!.route.flatMap((s) => (s.act === 'outfit' ? [s.outfit] : []));

    // (a) moneyMaker. WS2 edits the money-maker through the seat's gate, which re-drafts the route under it (RULE-1's
    // re-plan); adopted just ahead of the month's first development tick, its MULEs that month are the re-drafted
    // route's, outfitted for the edited good where it says so. The edited good is the first whose re-draft outfits a
    // MULE for it that the seat's own draft does not: which goods a re-draft leans to is developDecision's, not the hand's.
    const first = once();
    let edited: { good: Good; route: NonNullable<Playbook['development']>['route'] } | null = null;
    const a = playTable({
      months: 1,
      edit,
      before: (seat, state, point) => {
        if (seat.id !== ME || point !== 'development' || !first(seat, state, point)) return;
        const draft = seat.draft(state, 'development');
        const count = (pb: Playbook, g: Good) => outfits(pb).filter((o) => o === g).length;
        for (const good of GOODS.filter((g) => g !== draft.strategy.moneyMaker)) {
          const { playbook, rejected } = seat.validator()(state, ME, draft, [{ path: '/strategy/moneyMaker', to: good, reason: 'This pays.' }]);
          if (rejected.length > 0 || count(playbook, good) <= count(draft, good)) continue;
          edited = { good, route: playbook.development!.route };
          seat.adopt(playbook);
          return;
        }
      },
    });
    expect(edited, 'a money-maker whose re-draft outfits a MULE for it').not.toBeNull();
    const { good: maker, route: redrafted } = edited!;
    const mine = a.installs.get(key(ME, 1))!;
    const routed = redrafted.flatMap((s, i) => (s.act === 'install' ? [{ plot: s.plot!, outfit: redrafted[i - 1]!.outfit! }] : []));
    expect(mine, 'its installs: the re-drafted route’s, in order, with its outfits').toEqual(routed);
    expect(mine.filter((m) => m.outfit === maker).length, 'outfitted for the edited money-maker').toBeGreaterThan(0);
    expect(base.installs.get(key(ME, 1)), 'the draft alone installs otherwise').not.toEqual(mine);
    expect(a.written.filter((pb) => pb.seat === ME && pb.month === 1 && pb.phase === 'development'), 'an adopted part is written by its writer, not the seat').toEqual([]);

    // (b) an auction role. The seat's own draft buys Food, and today it buys it; edited to 'out' and adopted ahead of
    // the auction's first status screen, it sits Food out: its declare fact is the buyer everyone starts as, it trades
    // none of it, and its outcome says 'out'.
    const firstB = once();
    const b = playTable({
      months: 1,
      edit,
      before: (seat, state, point) => {
        if (seat.id !== ME || point !== 'auction' || !firstB(seat, state, point)) return;
        const draft = seat.draft(state, 'auction');
        expect(draft.auction!.food!.role, 'the draft buys Food').toBe('buyer');
        const { playbook, rejected } = seat.validator()(state, ME, draft, [{ path: '/auction/food/role', to: 'out', reason: 'Sit this one out.' }]);
        expect(rejected).toEqual([]);
        seat.adopt(playbook);
      },
    });
    expect(base.declared.get(key(ME, 1, 'food')), 'the draft alone buys it').toBe('buyer');
    expect(base.traded(ME, 1, 'food'), 'the draft alone trades it').toBeGreaterThan(0);
    expect(b.declared.get(key(ME, 1, 'food')), 'the declare fact: the buyer everyone starts as').toBe('buyer');
    expect(b.traded(ME, 1, 'food'), 'the edited role: it trades none of it').toBe(0);
    const roleItem = b.outcomes.get(key(ME, 1, 'auction'))!.items.find((i) => i.path === '/auction/food/role')!;
    expect(roleItem).toMatchObject({ expected: 'out', actual: 'out' });

    // (c) the route. The two MULEs' plots swapped: its installs fall on the edited route's plots, in order, each with
    // the outfit the edited route gives it; any step that could not play is named in the outcome with why.
    let route: NonNullable<Playbook['development']> | null = null;
    const firstC = once();
    const c = playTable({
      months: 1,
      edit,
      before: (seat, state, point) => {
        if (seat.id !== ME || point !== 'development' || !firstC(seat, state, point)) return;
        const draft = seat.draft(state, 'development');
        const at = draft.development!.route.flatMap((s, i) => (s.act === 'install' ? [i] : []));
        expect(at.length, 'the draft leads two MULEs out').toBeGreaterThanOrEqual(2);
        expect(draft.development!.route.some((s) => s.act === 'analyse'), 'its land is analysed: nothing is picked again').toBe(false);
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
    expect(route, 'the swapped route was adopted').not.toBeNull();
    expect(base.installs.get(key(ME, 1))!.length, 'the draft alone installs both').toBeGreaterThanOrEqual(2);
    expect(c.installs.get(key(ME, 1)), 'the draft alone installs otherwise').not.toEqual(base.installs.get(key(ME, 1)));
    const out = c.outcomes.get(key(ME, 1, 'development'))!;
    expect(out, 'an outcome for the adopted part').not.toBeNull();
    const steps = route!.route;
    const wanted = steps.flatMap((s, i) => (s.act === 'install' ? [{ i, plot: s.plot!, outfit: steps[i - 1]!.outfit! }] : []));
    const playedOut = wanted.filter((w) => out!.items[w.i]!.actual === 'done');
    expect(c.installs.get(key(ME, 1)), 'its installs: the edited route, in order').toEqual(playedOut.map((w) => ({ plot: w.plot, outfit: w.outfit })));
    expect(playedOut.length, 'the swapped MULEs were installed').toBeGreaterThanOrEqual(2);
    for (const item of out!.items.filter((x) => x.path.startsWith('/development/route/') && x.actual !== 'done' && x.actual !== 'not reached')) expect(item.note, item.path).toBeTruthy();

    // An edit the gate refuses: the draft's route plays, and rejected names it. Its installs are the draft route's own
    // where they were done.
    const firstD = once();
    let refused: NonNullable<Playbook['rejected']> = [];
    let draftRoute: NonNullable<Playbook['development']>['route'] = [];
    const d = playTable({
      months: 1,
      edit,
      before: (seat, state, point) => {
        if (seat.id !== ME || point !== 'development' || !firstD(seat, state, point)) return;
        const draft = seat.draft(state, 'development');
        const i = draft.development!.route.findIndex((s) => s.act === 'install');
        const theirs = state.tiles.findIndex((tile) => tile.owner !== null && tile.owner !== ME);
        const { playbook, rejected } = seat.validator()(state, ME, draft, [{ path: `/development/route/${i}/plot`, to: theirs, reason: 'Theirs.' }]);
        refused = rejected;
        draftRoute = draft.development!.route;
        expect(playbook.development, 'the refused edit leaves the draft’s route').toEqual(draft.development);
        seat.adopt(playbook);
      },
    });
    expect(refused.map((r) => r.path)).toEqual([expect.stringMatching(/^\/development\/route/)]);
    const dOut = d.outcomes.get(key(ME, 1, 'development'))!;
    expect(dOut, 'an outcome for the adopted part').not.toBeNull();
    const dDone = draftRoute.flatMap((s, i) => (s.act === 'install' && dOut!.items[i]!.actual === 'done' ? [s.plot] : []));
    expect(dDone.length, 'a draft MULE installed').toBeGreaterThan(0);
    expect(d.installs.get(key(ME, 1))!.map((x) => x.plot), 'the draft’s installs play').toEqual(dDone);
  });

  it('B-AC-6 (AM-27): an adopted route with analyses plays as adopted, its installs the route’s, while the own route in the same state is picked again', () => {
    ownPhasesOn();
    // G-2: an adopted playbook (WS2's writer, Claude's edits) reaches the board as adopted; the hand's own picks after
    // the analyses are for the seat's own draft only. The built case: ME opens month 1's development with a farm, a
    // well and a plant, an unanalysed volcanic plot and an unanalysed river plot, and a month's staples in stock. Its
    // own route analyses the volcanic plot before its MULE, and its own play replaces that MULE on the analysed ground.
    // The same route, adopted at the same tick, plays as it stands.
    const edit = (state: GameState) => {
      landed(1, ['plains:food', 'river:water', 'plains:energy', 'volcanic', 'river'], [], false)(state);
      stocked(1)(state);
    };
    const scoutsFirst = (pb: Playbook) => {
      const route = pb.development!.route;
      const buy = route.findIndex((s) => s.act === 'buyMule');
      return buy > 0 && route.slice(0, buy).some((s) => s.act === 'analyse');
    };
    const routeItems = (t: Table) => t.outcomes.get(key(ME, 1, 'development'))!.items.filter((i) => i.path.startsWith('/development/route/'));
    const own = playTable({ months: 1, edit });
    const theCase = own.written.find((pb) => pb.phase === 'development' && pb.seat === ME)!;
    expect(scoutsFirst(theCase), 'its own route analyses before its MULE').toBe(true);
    expect(routeItems(own).some((i) => i.actual === 'replaced' && i.note === 'ground analysed'), 'its own route was picked again after its analyses').toBe(true);
    const route = theCase.development!.route;

    const first = once();
    let adopted: Playbook | null = null;
    const t = playTable({
      months: 1,
      edit,
      before: (seat, state, point) => {
        if (seat.id !== ME || point !== 'development' || !first(seat, state, point)) return;
        adopted = seat.draft(state, 'development');
        seat.adopt(adopted);
      },
    });
    expect(adopted!.development!.route, 'the same route as the own path drafted').toEqual(route);
    const items = routeItems(t);
    const log = JSON.stringify(items);
    expect(items.filter((i) => i.note === 'ground analysed'), log).toEqual([]);
    expect(t.ownInstalls.get(key(ME, 1)), 'no MULE the hand picked itself').toEqual([]);
    // The promise: its installs, in order, are the adopted route's where they were done, each with the route's outfit.
    const wanted = route.flatMap((s, i) => (s.act === 'install' && items[i]!.actual === 'done' ? [{ plot: s.plot!, outfit: route[i - 1]!.outfit! }] : []));
    expect(wanted.length, log).toBeGreaterThan(0);
    expect(t.installs.get(key(ME, 1)), log).toEqual(wanted);
    expect(own.installs.get(key(ME, 1)), 'the own path installed otherwise').not.toEqual(wanted);
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
    const failed = logged.mock.calls.flatMap((c) => [...c.join(' ').matchAll(/^AI seat (ai\d): no auction playbook for month (\d+), .*draft broke$/g)].map((x) => ({ id: x[1]!, m: Number(x[2]) })));
    expect(failed.length).toBeGreaterThan(0);
    // Its auction outcome is read against the goods its part played, the first, not the stale parts of the goods after.
    for (const { id, m } of failed) {
      const first = Object.keys(writesOf(t, id, m, 'auction')[0]!.auction!)[0];
      const goods = new Set(t.outcomes.get(key(id, m, 'auction'))!.items.map((i) => i.path.split('/')[2]));
      expect([...goods], key(id, m)).toEqual([first]);
    }
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
    // keyless seat plays today's, and the adopted drafts make another game. See AM-26.
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
