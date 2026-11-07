import {
  canRun,
  ceremonyBeats,
  isElectionDone,
  LAW_NAME,
  lawImpact,
  nextElectionMonth,
  partyTo,
  PERCENT,
  POLITICS,
  promisedVotes,
  reputationReasons,
  taxBounds,
  votesOpen,
  voteWeight,
  type CeremonyBeat,
  type CeremonyBeats,
  type DealCard,
  type ElectionHow,
  type GameState,
  type LawId,
  type LawImpact,
  type LawProposal,
  type NoticeEntry,
  type Office,
} from '@mule/engine';
import type { CeremonyView, CouncilView, ElectionView, MyDealsView, MyPoliticsView, OfficeReveal, PoliticsView } from '@mule/protocol';

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
    promiseFrom: p.promiseFrom,
    election: electionView(state),
    proposal: p.proposal && { ...structuredClone(p.proposal), impact: lawImpact(state, p.proposal.proposal) },
    council: councilView(state),
    laws: structuredClone(p.laws),
    retry: Object.fromEntries(Object.entries(p.failed).map(([key, month]) => [key, month + POLITICS.council.retryMonths + 1])),
    brokenDeals: visibleDeals(state, NO_SEAT).sort((a, b) => (b.settled ?? 0) - (a.settled ?? 0)),
    reputationReasons: Object.fromEntries(
      state.players.map(({ id }) => [id, reputationReasons(state, id).map((r) => (r.kind === 'broken' ? { kind: 'broken' as const, id: r.card.id } : { ...r }))]),
    ),
  };
}

/** Built field by field: `ballots` is read only for who has voted, never how; the totals only from the reveal. See slice 2a RULE-47. */
function councilView(state: GameState): CouncilView | null {
  const c = state.politics?.council;
  if (!c) return null;
  return {
    stage: c.stage,
    proposal: structuredClone(c.proposal),
    proposer: c.proposer,
    impact: lawImpact(state, c.proposal),
    voted: Object.keys(c.ballots),
    done: [...c.done],
    waitingFor: c.stage === 'ballot' ? state.players.filter((p) => !c.done.includes(p.id)).map((p) => p.id) : [],
    clockMs: c.clockMs,
    revealMs: POLITICS.council.revealMs,
    result: c.stage === 'ballot' ? null : c.result && { ...c.result },
  };
}

/** The news line as a law ballot's result is revealed: whether it passed, by the weighted totals. */
export function councilNews(state: GameState): string | null {
  const c = state.politics?.council;
  if (!c?.result) return null;
  const { proposal, result } = c;
  const what = proposal.kind === 'repeal' ? `Repeal of the ${LAW_NAME[proposal.law].toLowerCase()}` : `${LAW_NAME[proposal.law]} at ${proposal.setting}`;
  const tie = result.tie ? ', the Governor breaking the tie' : '';
  return `${what} ${result.passed ? 'passes' : 'fails'}, ${result.yes} votes to ${result.no}${tie}.`;
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
    lawBallot: p.council?.stage === 'ballot' ? (p.council.ballots[playerId] ?? null) : null,
    promised: structuredClone(promisedVotes(state, playerId)),
    ...(p.governor === playerId && state.phase === 'planning' && !votesOpen(state) ? { candidates: candidates(state) } : {}),
  };
}

/** Every proposal the Governor may weigh, each with lawImpact's cost per player: every law at each setting, and a repeal of each in force. See C46. */
function candidates(state: GameState): Record<string, Record<string, LawImpact>> {
  const out: Record<string, Record<string, LawImpact>> = {};
  const add = (key: string, proposal: LawProposal) => (out[key] = lawImpact(state, proposal));
  for (const law of Object.keys(POLITICS.laws) as LawId[]) {
    for (const setting of POLITICS.laws[law].settings) add(`${law}:${setting}`, { kind: 'enact', law, setting });
  }
  for (const law of Object.keys(state.politics!.laws) as LawId[]) add(`repeal:${law}`, { kind: 'repeal', law });
  return out;
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

/** No seat's id: partyTo passes a card to it only when the card is public. */
const NO_SEAT = '';

/** The cards `viewerId` may see by the one rule (partyTo), newest offer first, as copies. */
function visibleDeals(state: GameState, viewerId: string): DealCard[] {
  return [...(state.politics?.deals ?? [])].reverse().filter((card) => partyTo(viewerId, card)).map((card) => structuredClone(card));
}

/** A player's own cards for their phone: every card partyTo shows them, and how many more offers they may make now. */
export function dealsView(state: GameState, playerId: string): MyDealsView | null {
  const p = state.politics;
  if (!p) return null;
  const open = p.deals.filter((d) => d.from === playerId && d.status === 'offered').length;
  return { cards: visibleDeals(state, playerId), offersLeft: Math.max(0, POLITICS.deals.maxOpenOffers - open), pactMonths: [...POLITICS.deals.pactMonths] };
}

/** A deal notice as mule-game's notify takes it: the month and phase are its own to add. */
export type DealFact = Omit<Extract<NoticeEntry, { kind: 'deal' }>, 'type' | 'at' | 'seq' | 'month' | 'phase'>;

/**
 * What changed between two lists of cards, as the record's notices: a new card is noticed as offered, and each status
 * it has moved to since as that status. Private to its two parties, but a broken card is public, so it carries none.
 */
export function dealNotices(before: readonly DealCard[], after: readonly DealCard[]): DealFact[] {
  const was = new Map(before.map((card) => [card.id, card.status]));
  const facts: DealFact[] = [];
  const fact = (event: DealCard['status'], card: DealCard): DealFact =>
    event === 'broken' ? { kind: 'deal', event, deal: structuredClone(card) } : { kind: 'deal', event, deal: structuredClone(card), parties: [card.from, card.to] };
  for (const card of after) {
    const old = was.get(card.id);
    if (old === undefined) facts.push(fact('offered', { ...card, status: 'offered', brokenBy: null, settled: null }));
    if (card.status !== (old ?? 'offered')) facts.push(fact(card.status, card));
  }
  return facts;
}

/** A reputation move as the news says it: "−10". */
const points = (move: number): string => `${move < 0 ? '−' : '+'}${Math.abs(move)}`;

/** One news line for every card that turned broken between the two lists: who broke what with whom, and what it cost. */
export function dealNews(before: readonly DealCard[], after: readonly DealCard[], nameOf: (seatId: string) => string): string[] {
  const was = new Map(before.map((card) => [card.id, card.status]));
  const { voteBroken, pactBroken } = POLITICS.reputation.moves;
  return after
    .filter((card) => card.status === 'broken' && was.get(card.id) !== 'broken')
    .map((card) => {
      const breaker = card.brokenBy ?? card.from;
      const other = breaker === card.from ? card.to : card.from;
      const { terms } = card;
      if (terms.kind === 'pact') return `${nameOf(breaker)} broke a pact with ${nameOf(other)}. Reputation ${points(pactBroken)}.`;
      const what = 'office' in terms ? `a vote for ${nameOf(terms.candidate)}` : `a ${terms.yes ? 'yes' : 'no'} on the law`;
      return `${nameOf(breaker)} broke a promise to ${nameOf(other)}: ${what}. Reputation ${points(voteBroken)}.`;
    });
}
