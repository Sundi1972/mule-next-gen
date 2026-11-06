import { afterEach, describe, expect, it } from 'vitest';
import { AI_PLANS, createGame, type GameState, type MonthReport, type Strategy } from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { playGame, type SeatSpec } from '../src/play.js';
import { anchorOf, type KeptPlan, type PlanAnchor } from '../src/playbook/plan.js';
import { replanReason, type ReplanTrigger } from '../src/playbook/replan.js';

const ME = 'ai0';
/** The anchor's posted price for the plan's good: a round number, so a share of it is exact. */
const ANCHOR_PRICE = 100;
/** A 12-month game of four playbook seats drafts at every draft point of every month. */
const SLOW_MS = 120_000;

/** The office holders at the table and in the anchor: a term already served. */
const OFFICES = { governor: 'ai1', sheriff: 'ai3' };

/** A month-1 table of four, politics on; its free plots, nearest the top-left first. */
function table(): { state: GameState; free: number[] } {
  const state = createGame({ seed: 7, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  state.store.posted.smithore = ANCHOR_PRICE;
  Object.assign(state.politics!, OFFICES);
  const free = state.tiles.flatMap((t, i) => (t.owner === null && t.terrain !== 'store' ? [i] : []));
  return { state, free };
}

/** A monopolist cornering Smithore, anchored on `state` as it stands: key plots `keyPlots`, one rival Smithore plot. */
function kept(state: GameState, keyPlots: number[], plan: Partial<Strategy> = {}, at: Partial<PlanAnchor> = {}): KeptPlan {
  const fields = { kind: 'monopolist' as const, moneyMaker: 'smithore' as const, monopolyTarget: 'smithore' as const, landTarget: { plots: 3, byMonth: 4 }, ...plan };
  const anchor: PlanAnchor = {
    month: state.month,
    point: 'planning',
    pricedAt: 'planning',
    posted: { smithore: ANCHOR_PRICE },
    rivalPlots: 1,
    keyPlots,
    reportedMonth: 0,
    ...OFFICES,
    ...at,
  };
  return { ...fields, anchor, trigger: null };
}

const own = (state: GameState, plot: number, seat: string, outfit: Strategy['moneyMaker'] = null) => Object.assign(state.tiles[plot]!, { owner: seat, outfit });

/** A production report since the anchor whose one event hits each of `hits` by its delta. */
function produced(state: GameState, hits: { plot: number; delta: number }[]): void {
  const plots = hits.map((h, order) => ({ index: h.plot, order, good: 'smithore' as const, delta: h.delta }));
  state.history.push({ month: state.month, before: {}, produced: {}, events: [{ key: 'cavernCollapse', kind: 'quake', title: 'Cave-in', line: '', scope: 'local', origin: { x: 0, y: 0 }, plots, result: null }] } as unknown as MonthReport);
}

describe('the five re-plan triggers (C13, RULE-8)', () => {
  type Row = [string, ReplanTrigger | null, (s: GameState, free: number[]) => void, Partial<Strategy>?, Partial<PlanAnchor>?];
  const { replan } = AI_PLANS;
  const rows: Row[] = [
    ['row 1: a key plot owned by a rival', 'lostKeyPlot', (s, f) => own(s, f[0]!, 'ai1')],
    ['row 1 under: a key plot its own, a plot past the key plots a rival’s', null, (s, f) => (own(s, f[1]!, ME), own(s, f[2]!, 'ai1'))],
    [
      'row 2: rival plots making the target at the anchor’s + replan.rivalPlots',
      'rivalProducer',
      (s, f) => {
        for (let i = 0; i < replan.rivalPlots; i++) own(s, f[3 + i]!, 'ai1', 'smithore');
      },
    ],
    [
      'row 2 under: one rival plot fewer, and its own Smithore plots',
      null,
      (s, f) => {
        for (let i = 0; i < replan.rivalPlots - 1; i++) own(s, f[3 + i]!, 'ai1', 'smithore');
        own(s, f[10]!, ME, 'smithore');
        own(s, f[11]!, ME, 'smithore');
      },
    ],
    ['row 2 skips with no target', null, (s, f) => [3, 4, 5].forEach((i) => own(s, f[i]!, 'ai2', 'smithore')), { kind: 'specialist', monopolyTarget: null }],
    ['row 3: the price down by replan.priceShock of the anchor', 'priceShock', (s) => void (s.store.posted.smithore = ANCHOR_PRICE * (1 - replan.priceShock))],
    ['row 3 under: down by one credit less', null, (s) => void (s.store.posted.smithore = ANCHOR_PRICE * (1 - replan.priceShock) + 1)],
    ['row 3 never on a rise: up by replan.priceShock and more', null, (s) => void (s.store.posted.smithore = 2 * ANCHOR_PRICE * (1 + replan.priceShock))],
    [
      'row 3 only like for like: a fall read at another draft point than the anchor’s price',
      null,
      (s) => {
        s.phase = 'auction';
        s.store.posted.smithore = ANCHOR_PRICE * (1 - replan.priceShock);
      },
    ],
    ['rows 3 and 4 skip with no money-maker', null, (s) => void (s.store.posted.smithore = ANCHOR_PRICE / 10), { kind: 'builder', moneyMaker: null, monopolyTarget: null }],
    [
      'row 4: a production cuts replan.eventPlots of its money-maker plots',
      'event',
      (s, f) => {
        const mine = Array.from({ length: replan.eventPlots }, (_, i) => f[10 + i]!);
        mine.forEach((p) => own(s, p, ME, 'smithore'));
        produced(s, mine.map((plot) => ({ plot, delta: -2 })));
      },
    ],
    [
      'row 4 under: one plot fewer cut; a cut on a rival’s plot; a gain on its own',
      null,
      (s, f) => {
        const mine = Array.from({ length: replan.eventPlots }, (_, i) => f[10 + i]!);
        mine.forEach((p) => own(s, p, ME, 'smithore'));
        own(s, f[20]!, 'ai1');
        produced(s, [...mine.slice(1).map((plot) => ({ plot, delta: -2 })), { plot: mine[0]!, delta: 2 }, { plot: f[20]!, delta: -2 }]);
      },
    ],
    [
      'row 5: a term began this month with another governor',
      'election',
      (s) => {
        s.politics!.termStart = s.month;
        s.politics!.governor = 'ai2';
      },
    ],
    [
      'row 5 under: an anchor from before any election, at the first term',
      null,
      (s) => {
        s.politics!.termStart = s.month;
        s.politics!.governor = 'ai2';
      },
      {},
      { governor: null, sheriff: null },
    ],
    [
      'row 5 under: another governor whose term began last month',
      null,
      (s) => {
        s.month = 2;
        s.politics!.termStart = 1;
        s.politics!.governor = 'ai2';
      },
    ],
    [
      'row 5 never with politics off',
      null,
      (s) => {
        s.politics = null;
      },
    ],
    ['first match wins: a lost key plot and a price shock', 'lostKeyPlot', (s, f) => (own(s, f[0]!, 'ai1'), void (s.store.posted.smithore = ANCHOR_PRICE / 10))],
  ];

  it.each(rows)("T-AC-6: RULE-8's rows 1–5, each with a value just under its threshold as the negative (%s)", (_, want, change, plan, at) => {
    const { state, free } = table();
    const plotOf = (i: number) => free[i]!;
    own(state, plotOf(30), 'ai3', 'smithore'); // the anchor's one rival Smithore plot
    const plan0 = kept(state, [plotOf(0), plotOf(1)], plan, at);
    change(state, free);

    expect(replanReason(state, plan0, ME)).toBe(want);
    if (!want) return;
    // The anchor resets: the same state read against a new one fires nothing.
    const again = { ...plan0, anchor: anchorOf(state, ME, plan0, 'development', [plotOf(0), plotOf(1), plotOf(2)]) };
    expect(replanReason(state, again, ME)).toBeNull();
  });

  it('T-AC-6: no anchor yet (a plan adopted since the last draft point) is no trigger', () => {
    const { state, free } = table();
    own(state, free[0]!, 'ai1');
    expect(replanReason(state, { ...kept(state, [free[0]!]), anchor: null }, ME)).toBeNull();
  });
});

describe('the seat keeps its plan through a game (C12, C13)', { timeout: SLOW_MS }, () => {
  const saved = structuredClone(AI_PLANS.replan);
  afterEach(() => Object.assign(AI_PLANS.replan, saved));

  const SEED = 1;
  const specs: SeatSpec[] = simSeats(4, 'trader', SEED).map((s) => ({ ...s, plays: 'playbook' }));
  const planOf = (s: Strategy) => `${s.kind}/${s.moneyMaker}/${s.monopolyTarget}`;

  it('B-AC-4: in a seeded 12-month game the plan changes only at a named trigger', () => {
    const played = playGame(SEED, specs);
    expect(played.state.maxMonths).toBe(12);

    let replans = 0;
    for (const seat of played.seats) {
      const log = seat.replanLog();
      const written = played.playbooks.filter((pb) => pb.seat === seat.id);
      for (let i = 1; i < written.length; i++) {
        const [was, now] = [written[i - 1]!, written[i]!];
        if (planOf(was.strategy) === planOf(now.strategy)) continue;
        const at = `${seat.id} month ${now.month} ${now.phase}: ${planOf(was.strategy)} → ${planOf(now.strategy)}`;
        expect(log.filter((e) => e.month === now.month && e.point === now.phase), at).toHaveLength(1);
      }
      for (const e of log) {
        // Its reason names the trigger in the playbook written there.
        const there = written.find((pb) => pb.month === e.month && pb.phase === e.point);
        expect(there?.strategy.reason, `${seat.id} ${JSON.stringify(e)}`).toMatch(REASON_OF[e.trigger]);
      }
      replans += log.length;
    }
    expect(replans, 'some plan was re-drafted in 12 months').toBeGreaterThan(0);
  });

  it('B-AC-4 (negative): every re-plan threshold out of reach, politics off: the month-1 plan holds all game', () => {
    Object.assign(AI_PLANS.replan, { keyPlots: 0, rivalPlots: Infinity, priceShock: Infinity, eventPlots: Infinity });
    const played = playGame(SEED, specs, { politics: false });

    for (const seat of played.seats) {
      const plans = new Set(played.playbooks.filter((pb) => pb.seat === seat.id).map((pb) => planOf(pb.strategy)));
      expect([...plans], seat.id).toHaveLength(1);
      expect(seat.replanLog(), seat.id).toEqual([]);
    }
  });
});

/** What a re-plan's reason says, by trigger: the words a reader looks for. */
const REASON_OF: Record<ReplanTrigger, RegExp> = {
  lostKeyPlot: /plot/i,
  rivalProducer: /rival/i,
  priceShock: /price/i,
  event: /production|output/i,
  election: /office|elect|governor|sheriff/i,
};
