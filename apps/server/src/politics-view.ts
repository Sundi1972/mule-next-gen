import { canRun, electionStageMs, nextElectionMonth, POLITICS, taxBounds, voteWeight, type ElectionHow, type ElectionResult, type GameState, type Office } from '@mule/engine';
import type { ElectionView, MyPoliticsView, PoliticsView } from '@mule/protocol';

/* Colony politics as the screens and the news see it: pure functions of the game state. A ballot reaches only its owner's view. */

const OFFICES: readonly Office[] = ['governor', 'sheriff'];

const percent = (rate: number) => Math.round(rate * 100);

/** True once the reveal's countdown has run: from then on every screen gets the result, all in the same view. */
export function resultShown(state: GameState): boolean {
  const e = state.politics?.election;
  if (!e?.result) return false;
  return e.stage === 'over' || e.clockMs <= electionStageMs('reveal') - POLITICS.revealCountdownMs;
}

/** The last month of the term that began in `start`: the month before the next election, or the game's last month. */
function termEnd(state: GameState, start: number): number {
  return (nextElectionMonth({ ...state, month: start }) ?? state.maxMonths + 1) - 1;
}

/** Offices, tax, weights and the election as every screen sees them; null when the game plays without politics. */
export function politicsView(state: GameState): PoliticsView | null {
  const p = state.politics;
  if (!p) return null;
  const { low, high } = taxBounds(state);
  return {
    governor: p.governor,
    sheriff: p.sheriff,
    term: p.governor === null ? null : [p.termStart, termEnd(state, p.termStart)],
    next: nextElectionMonth(state),
    baron: p.baron,
    tax: { percent: percent(state.treasury.salesTax), start: percent(p.taxAtStart), low, high },
    fund: state.treasury.money,
    pay: { governor: POLITICS.pay.governor, sheriff: POLITICS.pay.sheriff },
    weights: state.players.map(({ id }) => {
      const { total, parts } = voteWeight(state, id);
      return { id, votes: total, parts: { ...parts } };
    }),
    election: electionView(state),
  };
}

/** Built field by field: `ballots` is read only for who has voted, never for whom. */
function electionView(state: GameState): ElectionView | null {
  const e = state.politics?.election;
  if (!e) return null;
  return {
    stage: e.stage,
    seconds: Math.max(0, e.clockMs / 1_000),
    total: electionStageMs(e.stage) / 1_000,
    candidates: { governor: [...e.candidates.governor], sheriff: [...e.candidates.sheriff] },
    promises: structuredClone(e.promises),
    voted: Object.keys(e.ballots),
    done: [...e.done],
    result: resultShown(state) ? structuredClone(e.result) : null,
  };
}

/** One player's own side of the election, for their phone only. */
export function myPoliticsView(state: GameState, playerId: string): MyPoliticsView | null {
  const p = state.politics;
  if (!p) return null;
  const e = p.election;
  return {
    running: OFFICES.find((o) => e?.candidates[o].includes(playerId)) ?? null,
    ballot: { ...e?.ballots[playerId] },
    canRun: canRun(state, playerId),
  };
}

const HOW: Record<ElectionHow, string> = {
  votes: 'elected',
  unopposed: 'unopposed',
  appointed: 'appointed',
  baron: 'the Land Baron broke the tie',
  tieRule: 'tie broken by land',
};

/** The news line when the result is revealed. */
export function electionNews(result: ElectionResult, nameOf: (seatId: string) => string): string {
  const line = (office: Office, title: string) => `${nameOf(result[office].winner)} is ${title} (${HOW[result[office].how]})`;
  return `${line('governor', 'Governor')} · ${line('sheriff', 'Sheriff')}.`;
}
