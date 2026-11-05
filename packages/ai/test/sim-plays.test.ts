import { afterEach, describe, expect, it } from 'vitest';
import { AI_PLANS, stableJson, type GameState, type Good, type PhaseOutcome } from '@mule/engine';
import type { DecisionRecord } from '../src/brain.js';
import { simSeats } from '../src/lineup.js';
import { playGame, type PlayedGame, type PlayOptions, type SeatSpec } from '../src/play.js';

/*
 * C14's seat field and harness in play.ts: `SeatSpec.plays` picks a seat's path (AM-26), play.ts collects the C8 facts
 * as the server notifies them, and `PlayOptions.edits` adopts a seat's edited draft through its own gate.
 */

const ON = AI_PLANS.on;
const OWN_PHASES = AI_PLANS.ownPhases;
afterEach(() => {
  AI_PLANS.on = ON;
  AI_PLANS.ownPhases = OWN_PHASES;
});

// Two or three months of four seats, some drafting at every draft point: a few seconds alone, more in CI's parallel run.
const SLOW = { timeout: 60_000 };
const SEED = 3;
const MONTHS = 2;

/**
 * Seed 4's fifth month is the first in which a seat runs short of cash, so it lists in planning and sells at the land
 * auction. Re-picked 6 Nov for WS1's shortfall rule: it was the third month before seats bought what keeps them whole.
 */
const [LISTS, LIST_MONTHS] = [4, 5];
/** With every seat on its playbook, seed 4's first sale by a seat is at the fourth month's land auction. */
const SELL_MONTHS = 4;

const withPlays = (plays: SeatSpec['plays'], seed = SEED): SeatSpec[] => simSeats(4, 'trader', seed).map((s) => ({ ...s, plays }));

/** One game, with its decisions, as one string to compare run against run. */
function play(specs: SeatSpec[], options: PlayOptions = {}, seed = SEED, months = MONTHS): { game: PlayedGame; print: string } {
  const records: DecisionRecord[] = [];
  const game = playGame(seed, specs, { politics: false, maxMonths: months, onDecision: (r) => records.push(r), ...options });
  return { game, print: stableJson({ state: game.state, auction: game.auction, lots: game.lots, broke: game.broke, decisions: game.decisions, records }) };
}

const devOutcomes = (g: PlayedGame) => g.outcomes.filter((o) => o.phase === 'development');

describe('a seat plays the path its spec names (C14, AM-26)', () => {
  it("T-AC-13, AM-26: a 'today' seat plays every phase as with AI_PLANS.on false; a 'playbook' seat plays its own development and auction while AI_PLANS.ownPhases is off", SLOW, () => {
    expect(AI_PLANS.ownPhases, 'the default').toBe(false);
    // 'today': today's path in every phase, planning included, act for act.
    const today = play(withPlays('today', LISTS), {}, LISTS, LIST_MONTHS);
    AI_PLANS.on = false;
    const off = play(simSeats(4, 'trader', LISTS), {}, LISTS, LIST_MONTHS);
    AI_PLANS.on = ON;
    expect(today.print).toBe(off.print);
    // Unset: the shipped default, planning by the seat's own part (a listing in month 3), development and auction by today's.
    const unset = play(simSeats(4, 'trader', LISTS), {}, LISTS, LIST_MONTHS);
    expect(unset.print, 'the default plays its planning part').not.toBe(today.print);
    expect(devOutcomes(unset.game)).toEqual([]);
    expect(unset.game.playbooks).toEqual([]);

    // 'playbook': each seat plays its own development and auction parts, with the global switch still off.
    const own = play(withPlays('playbook'));
    expect(AI_PLANS.ownPhases).toBe(false);
    const ids = ['ai0', 'ai1', 'ai2', 'ai3'];
    for (let month = 1; month <= MONTHS; month++) {
      expect(devOutcomes(own.game).filter((o) => o.month === month).map((o) => o.seat), `month ${month}`).toEqual(ids);
      for (const id of ids) {
        const phases = own.game.playbooks.filter((pb) => pb.seat === id && pb.month === month).map((pb) => pb.phase);
        expect(phases, `${id} month ${month}`).toEqual(expect.arrayContaining(['planning', 'development', 'auction']));
      }
    }
    // A pair table (RULE-15): only the even seats play theirs.
    const pair = play(simSeats(4, 'trader', SEED, null, 'pair'));
    expect([...new Set(devOutcomes(pair.game).map((o) => o.seat))]).toEqual(['ai0', 'ai2']);
    expect([...new Set(pair.game.playbooks.map((pb) => pb.seat))]).toEqual(['ai0', 'ai2']);
    // With AI_PLANS.on false (the rollback), a 'playbook' seat is back on today's path too.
    AI_PLANS.on = false;
    expect(play(withPlays('playbook', LISTS), {}, LISTS, LIST_MONTHS).print).toBe(off.print);
  });
});

describe('the sim collects the public facts the server notifies (C8, C14)', () => {
  it('T-AC-9: play.ts collects claim, declare, trade and sale facts as MuleGame notifies them, and the auction outcome reads its rivals from them', SLOW, () => {
    // The owners as each planning and each land grant ends: only a claim changes them in between.
    const owners = new Map<string, (string | null)[]>();
    const onPhase = (s: GameState) => void ((s.phase === 'planning' || s.phase === 'landGrant') && owners.set(`${s.month}/${s.phase}`, s.tiles.map((t) => t.owner)));
    const { game } = play(withPlays('playbook', LISTS), { onPhase }, LISTS, SELL_MONTHS);
    const facts = game.facts;
    // A claim fact for every plot the grant gave, and none else.
    expect(facts.filter((f) => f.kind === 'claim').every((f) => f.phase === 'landGrant')).toBe(true);
    for (let month = 1; month <= SELL_MONTHS; month++) {
      const [before, after] = [owners.get(`${month}/planning`)!, owners.get(`${month}/landGrant`)!];
      const gained = after.flatMap((o, plot) => (o !== before[plot] ? [`${o}@${plot}`] : []));
      const claimed = facts.flatMap((f) => (f.kind === 'claim' && f.month === month ? [`${f.seat}@${f.plot}`] : []));
      expect(gained.length, `month ${month}`).toBeGreaterThan(0);
      expect(claimed.sort(), `month ${month}`).toEqual(gained.sort());
    }
    // One trade fact for each trade the sim counts; each declare once per seat and good a month, at the auction.
    const trades = facts.filter((f) => f.kind === 'trade');
    expect(trades.length).toBe(game.auction.between + game.auction.store + game.auction.ship);
    expect(trades.every((t) => t.phase === 'auction' && t.qty > 0 && t.price > 0)).toBe(true);
    const declares = facts.filter((f) => f.kind === 'declare');
    expect(declares.length).toBeGreaterThan(0);
    const keys = declares.map((d) => `${d.month}/${d.seat}/${d.good}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(declares.every((d) => d.phase === 'auction' && ['buyer', 'seller', 'pass'].includes(d.side))).toBe(true);
    // A sale fact for each lot sold, to a player or to the store; a kept lot has none.
    const sales = facts.filter((f) => f.kind === 'sale');
    expect(sales.filter((s) => s.buyer !== 'store').length).toBe(game.lots.sold);
    expect(sales.some((s) => s.seller.startsWith('ai')), 'an AI seller').toBe(true);
    expect(sales.every((s) => s.phase === 'landAuction')).toBe(true);
    // The facts reach AiSeat.outcome: a playbook seat's auction outcome names what its rivals traded.
    const auctions = game.outcomes.filter((o): o is PhaseOutcome => o.phase === 'auction');
    expect(auctions.some((o) => Object.values(o.rivals).some((r) => (r.traded?.length ?? 0) > 0))).toBe(true);
    for (const o of auctions) {
      for (const [id, r] of Object.entries(o.rivals)) {
        const units = trades.filter((t) => t.month === o.month && (t.buyer === id || t.seller === id)).reduce((n, t) => n + t.qty, 0);
        expect((r.traded ?? []).reduce((n, t) => n + t.qty, 0), `${o.seat} month ${o.month}: ${id}`).toBe(units);
      }
    }
  });
});

describe('the sim adopts edited playbooks through the seat’s gate (C14, B-AC-6’s harness)', () => {
  it("B-AC-6: PlayOptions.edits' edits pass the seat's validator and the adopted part plays: the edited auction role is the seat's declared side", SLOW, () => {
    const specs = simSeats(4, 'trader', SEED);
    const base = play(specs);
    // A good ai0 trades in month 1 today and by its draft: set it out.
    let out: Good | null = null;
    const edited = play(specs, {
      edits: (seat, draft, state) => {
        if (seat.id !== 'ai0' || state.month !== 1 || draft.phase !== 'auction') return null;
        const goods = Object.keys(draft.auction ?? {}) as Good[];
        out = goods.find((g) => draft.auction![g]!.role !== 'out' && declared(base.game, 'ai0', 1, g) === draft.auction![g]!.role && traded(base.game, 'ai0', 1, g) > 0) ?? null;
        return out ? [{ path: `/auction/${out}/role`, to: 'out', reason: 'Sit this one out.' }] : null;
      },
    });
    expect(out, 'a good the seat trades today and by its draft').not.toBeNull();
    // There is no Pass (#335): 'out' sits the good out as the buyer everyone starts as, trading none of it.
    expect(declared(edited.game, 'ai0', 1, out!)).toBe('buyer');
    expect(traded(edited.game, 'ai0', 1, out!), 'it trades none of it').toBe(0);
    expect(edited.game.outcomes.find((o) => o.seat === 'ai0' && o.month === 1 && o.phase === 'auction')!.items.find((i) => i.path === `/auction/${out}/role`)).toMatchObject({ expected: 'out', actual: 'out' });
    // No edits, nothing adopted: the game is the one played without the hook.
    expect(play(specs, { edits: () => null }).print).toBe(base.print);
    // A 'today' seat plays no playbook: the hook that edits ai0's auction is never asked of it, and its game is unchanged.
    const today = withPlays('today');
    const asked: string[] = [];
    const hooked = play(today, {
      edits: (seat, draft) => {
        asked.push(`${seat.id}/${draft.month}/${draft.phase}`);
        const good = (Object.keys(draft.auction ?? {}) as Good[])[0];
        return seat.id === 'ai0' && good ? [{ path: `/auction/${good}/role`, to: 'out', reason: 'Sit this one out.' }] : null;
      },
    });
    expect(asked).toEqual([]);
    expect(hooked.print).toBe(play(today).print);
  });
});

/** The units of `good` the seat bought or sold in that month's auction, from the trade facts. */
function traded(game: PlayedGame, seat: string, month: number, good: Good): number {
  return game.facts.reduce((n, f) => n + (f.kind === 'trade' && f.month === month && f.good === good && (f.buyer === seat || f.seller === seat) ? f.qty : 0), 0);
}

function declared(game: PlayedGame, seat: string, month: number, good: Good): string | undefined {
  for (const f of game.facts) if (f.kind === 'declare' && f.seat === seat && f.month === month && f.good === good) return f.side;
  return undefined;
}
