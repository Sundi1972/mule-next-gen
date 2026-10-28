import {
  canRun,
  ceremonyStepMs,
  isElectionDone,
  nextElectionMonth,
  PERCENT,
  POLITICS,
  taxBounds,
  voteWeight,
  type Election,
  type ElectionHow,
  type ElectionResult,
  type GameState,
  type Office,
} from '@mule/engine';
import type { ElectionView, MyPoliticsView, OfficeReveal, PoliticsView } from '@mule/protocol';

/* Colony politics as the screens and the news see it: pure functions of the game state. A ballot reaches only its owner's view. */

const percent = (rate: number) => Math.round(rate * PERCENT);

/** One entry per elected office, in POLITICS.offices order: a Governor-only table sends no Sheriff entry. */
function perOffice<T>(value: (office: Office) => T): Partial<Record<Office, T>> {
  return Object.fromEntries(POLITICS.offices.map((office) => [office, value(office)]));
}

/**
 * Each office's result as far as the ceremony has shown it, the same on every screen: its totals from its bars
 * step, its winner and how from its winner step; every office once the election is over. See WS7 spec RULE-64.
 */
function revealed(e: Election): Partial<Record<Office, OfficeReveal>> {
  const shown: Partial<Record<Office, OfficeReveal>> = {};
  if (!e.result || (e.stage !== 'ceremony' && e.stage !== 'over')) return shown;
  const at = e.ceremony ? POLITICS.offices.indexOf(e.ceremony.office) : POLITICS.offices.length;
  POLITICS.offices.forEach((office, i) => {
    const result = e.result![office];
    if (!result || i > at) return;
    const step = i < at ? 'winner' : e.ceremony!.step;
    if (step === 'winner') shown[office] = structuredClone(result);
    else if (step === 'bars') shown[office] = { tallies: structuredClone(result.tallies) };
  });
  return shown;
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
    pay: perOffice((office) => POLITICS.pay[office]),
    weights: state.players.map(({ id }) => {
      const { total, parts } = voteWeight(state, id);
      return { id, votes: total, parts: { ...parts } };
    }),
    candidates: perOffice((office) => [...p.candidates[office]]),
    promises: structuredClone(p.promises),
    election: electionView(state),
  };
}

/** Built field by field: `ballots` is read only for who has voted, never for whom. */
function electionView(state: GameState): ElectionView | null {
  const e = state.politics?.election;
  if (!e) return null;
  const c = e.ceremony;
  const waiting = e.stage === 'announce' || e.stage === 'ballot';
  return {
    stage: e.stage,
    ceremony: c ? { office: c.office, step: c.step, seconds: Math.max(0, c.clockMs / 1_000), total: ceremonyStepMs(c.step) / 1_000 } : null,
    candidates: perOffice((office) => [...e.candidates[office]]),
    promises: structuredClone(e.promises),
    voted: Object.keys(e.ballots),
    done: state.players.filter((p) => isElectionDone(state, p.id)).map((p) => p.id),
    waitingFor: waiting ? state.players.filter((p) => !isElectionDone(state, p.id)).map((p) => p.id) : [],
    result: revealed(e),
  };
}

/** One player's own side of the election, for their phone only. Their candidacy is the election's from the ballot until the result, else Politics'. */
export function myPoliticsView(state: GameState, playerId: string): MyPoliticsView | null {
  const p = state.politics;
  if (!p) return null;
  const e = p.election;
  const running = e && (e.stage === 'ballot' || e.stage === 'ceremony') ? e.candidates : p.candidates;
  const may = canRun(state, playerId);
  return {
    running: POLITICS.offices.find((o) => running[o].includes(playerId)) ?? null,
    ballot: { ...e?.ballots[playerId] },
    canRun: perOffice((office) => may[office]),
  };
}

const HOW: Record<ElectionHow, string> = {
  votes: 'elected',
  unopposed: 'unopposed',
  appointed: 'appointed',
  baron: 'the Land Baron broke the tie',
  land: 'a tie: most plots',
  lot: 'a tie: decided by lot',
};

const TITLE: Record<Office, string> = { governor: 'Governor', sheriff: 'Sheriff' };

/** The news line when the ceremony reaches an office's winner. */
export function officeNews(office: Office, result: ElectionResult, nameOf: (seatId: string) => string): string {
  const { winner, how } = result[office]!;
  return `${nameOf(winner)} is ${TITLE[office]} (${HOW[how]}).`;
}
