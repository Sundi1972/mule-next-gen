import {
  canRun,
  ceremonyBeats,
  isElectionDone,
  nextElectionMonth,
  PERCENT,
  POLITICS,
  taxBounds,
  voteWeight,
  type CeremonyBeat,
  type CeremonyBeats,
  type ElectionHow,
  type GameState,
  type Office,
} from '@mule/engine';
import type { CeremonyView, ElectionView, MyPoliticsView, OfficeReveal, PoliticsView } from '@mule/protocol';

/* Colony politics as the screens and the news see it: pure functions of the game state. A ballot reaches only its owner's view. */

const percent = (rate: number) => Math.round(rate * PERCENT);

/** One entry per elected office, in POLITICS.offices order: a Governor-only table sends no Sheriff entry. */
function perOffice<T>(value: (office: Office) => T): Partial<Record<Office, T>> {
  return Object.fromEntries(POLITICS.offices.map((office) => [office, value(office)]));
}

const BEATS: readonly CeremonyBeat[] = ['title', 'candidates', 'bars', 'tie', 'winner', 'end'];

/** The beats of this month's closed result, or null before the ballot closes. */
function beatsOf(state: GameState): CeremonyBeats | null {
  const result = state.politics?.election?.result;
  return result ? ceremonyBeats(state.players.map((p) => p.id), result) : null;
}

/** How far the show clock has got: the ms it stands at, or past every beat once the election is over. */
function showMs(state: GameState): number {
  const e = state.politics!.election!;
  return e.ceremony ? e.ceremony.elapsedMs : e.stage === 'over' ? Infinity : -Infinity;
}

/**
 * Each office's result as far as the ceremony has shown it, the same on every screen: its totals from its bars beat,
 * its winner and how from its winner beat, or from its tie beat when a tie was broken, whose stamp names the rule and
 * the winner; every office once the election is over. See WS7 spec RULE-64, AM-21.
 */
function revealed(state: GameState): Partial<Record<Office, OfficeReveal>> {
  const shown: Partial<Record<Office, OfficeReveal>> = {};
  const beats = beatsOf(state);
  const result = state.politics!.election!.result;
  if (!beats || !result) return shown;
  const ms = showMs(state);
  for (const { office, at } of beats.offices) {
    const race = result[office]!;
    if (ms >= (at.tie ?? at.winner)) shown[office] = structuredClone(race);
    else if (ms >= at.bars) shown[office] = { tallies: structuredClone(race.tallies) };
  }
  return shown;
}

/** The show clock in game seconds and, per office it has reached, its latest beat; nothing ahead of the clock. */
function ceremonyView(state: GameState): CeremonyView | null {
  const c = state.politics!.election!.ceremony;
  const beats = beatsOf(state);
  if (!c || !beats) return null;
  const reached: CeremonyView['reached'] = {};
  for (const { office, at } of beats.offices) {
    const beat = BEATS.filter((b) => at[b] !== null && at[b]! <= c.elapsedMs).at(-1);
    if (beat) reached[office] = { beat, at: at[beat]! / 1_000 };
  }
  return { seconds: c.elapsedMs / 1_000, total: c.totalMs / 1_000, reached };
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
    promise: p.promise && { ...p.promise },
    election: electionView(state),
  };
}

/** Built field by field: `ballots` is read only for who has voted, never for whom. */
function electionView(state: GameState): ElectionView | null {
  const e = state.politics?.election;
  if (!e) return null;
  const waiting = e.stage === 'announce' || e.stage === 'ballot';
  return {
    stage: e.stage,
    ceremony: ceremonyView(state),
    candidates: perOffice((office) => [...e.candidates[office]]),
    promises: structuredClone(e.promises),
    voted: Object.keys(e.ballots),
    done: state.players.filter((p) => isElectionDone(state, p.id)).map((p) => p.id),
    waitingFor: waiting ? state.players.filter((p) => !isElectionDone(state, p.id)).map((p) => p.id) : [],
    result: revealed(state),
  };
}

/**
 * One player's own side of politics, for their phone only: their candidacy (the election's from the ballot until the
 * result, else Politics'), their ballot, and the tax paid and reputation that weigh their vote.
 */
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
    paid: state.treasury.paid[playerId] ?? 0,
    reputation: state.players.find((pl) => pl.id === playerId)!.reputation,
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

/**
 * The news as the show clock runs on from `beforeMs` to where it stands now: one line per office whose winner beat it
 * passed, in POLITICS.offices order. See WS7 spec C64.
 */
export function ceremonyNews(state: GameState, beforeMs: number, nameOf: (seatId: string) => string): string[] {
  const beats = beatsOf(state);
  const result = state.politics?.election?.result;
  if (!beats || !result) return [];
  const ms = showMs(state);
  return beats.offices
    .filter(({ at }) => beforeMs < at.winner && at.winner <= ms)
    .map(({ office }) => {
      const { winner, how } = result[office]!;
      return `${nameOf(winner)} is ${TITLE[office]} (${HOW[how]}).`;
    });
}
