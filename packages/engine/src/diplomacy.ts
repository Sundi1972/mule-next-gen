/**
 * Deal cards between players (slice 3): a pact, or a promise of one's own vote, offered and answered in planning.
 * The only writer of Politics.deals, always through politics.ts's editPolitics. A card moves no money, stock, tiles
 * or MULEs; what it earns or costs is reputation, settled elsewhere. See slice 3 spec S3-RULE-1, S3-RULE-2.
 */
import { POLITICS } from './config.js';
import { RuleError } from './errors.js';
import { player } from './game.js';
import { contested, editPolitics, nextElectionMonth, reputationShift } from './politics.js';
import { createRng, seedOf } from './rng.js';
import type { DealCard, DealOffer, GameState, Office, Politics } from './types.js';

/** The one visibility rule: a card's two parties see it, and everyone sees a broken one. The TV has no seat, so it is a non-party. */
export function partyTo(viewerId: string, card: DealCard): boolean {
  return card.status === 'broken' || card.from === viewerId || card.to === viewerId;
}

/** The cards a player is party to, newest first. */
export function dealsOf(state: GameState, playerId: string): readonly DealCard[] {
  return (state.politics?.deals ?? []).filter((d) => d.from === playerId || d.to === playerId).reverse();
}

const BASE_36 = 36; // literal-ok: the radix of an id tag, a definition
const TAG_LENGTH = 6; // literal-ok: an id tag is six characters, a format not a balance number

/** 'deal-' plus six base-36 characters, drawn from a stream seeded by the game and the card's number only; a clash redraws. */
function newId(state: GameState, taken: readonly DealCard[]): string {
  const n = taken.length + 1;
  for (let attempt = 0; ; attempt++) {
    const rng = createRng(seedOf(state.seed, n, 'deal', String(attempt)));
    const tag = Array.from({ length: TAG_LENGTH }, () => rng.int(0, BASE_36 - 1).toString(BASE_36)).join('');
    if (!taken.some((d) => d.id === `deal-${tag}`)) return `deal-${tag}`;
  }
}

/** Whether a card is between these two players, whoever offered it. */
function sameParties(card: DealCard, a: string, b: string): boolean {
  return (card.from === a && card.to === b) || (card.from === b && card.to === a);
}

function nameOf(state: GameState, id: string): string {
  return player(state, id).name;
}

function title(office: Office): string {
  return office[0]!.toUpperCase() + office.slice(1);
}

function pactWords(): string {
  const months = POLITICS.deals.pactMonths;
  return `A pact runs ${months.slice(0, -1).join(', ')} or ${months.at(-1)} months`;
}

/** The election is open to promises while it is in announce or ballot. */
function electionOpen(politics: Politics): boolean {
  const stage = politics.election?.stage;
  return stage === 'announce' || stage === 'ballot';
}

/** Who is running for an office: the ballot's own list once it is open, else the declared field. */
function candidatesFor(politics: Politics, office: Office): readonly string[] {
  return politics.election?.stage === 'ballot' ? politics.election.candidates[office] : politics.candidates[office];
}

/**
 * The last month a card binds, fixed at offer (S3-RULE-1): a pact's length capped at the game's end; an office vote's
 * next ballot; a law vote's next law ballot. A RuleError, never an until, where no ballot is left.
 */
export function dealUntil(state: GameState, _from: string, offer: DealOffer): number {
  const politics = state.politics;
  if (!politics) throw new RuleError('This game plays without deals');
  const { terms } = offer;
  if (terms.kind === 'pact') return Math.min(state.maxMonths, state.month + (offer.months ?? 0) - 1);
  if ('office' in terms) {
    if (electionOpen(politics)) return state.month;
    const next = nextElectionMonth(state);
    if (next === null) throw new RuleError('No election is left this game');
    return next;
  }
  if (politics.council?.stage === 'ballot') return state.month;
  const pending = politics.proposal;
  if (!pending) throw new RuleError('No law is up for a vote');
  // A proposal from an earlier month comes to its ballot this month, once the election (if any) is over.
  return pending.month < state.month ? state.month : state.month + 1;
}

/** Whether the ballot a vote card binds has closed (or will never be held) in the month the answer comes. */
function ballotClosed(state: GameState, card: DealCard): boolean {
  const politics = state.politics!;
  if (state.month !== card.until) return state.month > card.until;
  if (card.terms.kind === 'vote' && 'office' in card.terms) return !electionOpen(politics);
  if (politics.council) return politics.council.stage !== 'ballot';
  // No council yet: a proposal from an earlier month still gets its ballot once this month's election is over.
  const pending = politics.proposal;
  const waiting = !!pending && pending.month < state.month && !!politics.election && politics.election.stage !== 'over';
  return !waiting;
}

function sameBallot(a: DealCard, b: DealCard): boolean {
  if (a.terms.kind !== 'vote' || b.terms.kind !== 'vote' || a.until !== b.until) return false;
  if ('office' in a.terms) return 'office' in b.terms && a.terms.office === b.terms.office;
  return !('office' in b.terms);
}

function sameChoice(a: DealCard['terms'], b: DealCard['terms']): boolean {
  if (a.kind !== 'vote' || b.kind !== 'vote') return false;
  if ('office' in a) return 'office' in b && a.candidate === b.candidate;
  return !('office' in b) && a.yes === b.yes;
}

/** Offers a card to another player in planning; the new card's id. S3-RULE-2 offer rows 1-14, in order. */
export function offerDeal(state: GameState, from: string, offer: DealOffer): string {
  const politics = state.politics;
  if (!politics) throw new RuleError('This game plays without deals');
  if (state.phase !== 'planning') throw new RuleError('Cards are offered in planning');
  const { to, terms } = offer;
  if (to === from || !state.players.some((p) => p.id === to)) throw new RuleError('Pick another player');
  const open = politics.deals.filter((d) => d.from === from && d.status === 'offered');
  if (open.length >= POLITICS.deals.maxOpenOffers) throw new RuleError(`You have ${open.length} cards waiting for an answer`);
  if (open.some((d) => d.to === to)) throw new RuleError(`${nameOf(state, to)} has not answered your last card`);
  if (terms.kind === 'pact') {
    if (offer.months === undefined || !POLITICS.deals.pactMonths.includes(offer.months)) throw new RuleError(pactWords());
    const pending = politics.deals.some((d) => d.terms.kind === 'pact' && (d.status === 'offered' || d.status === 'active') && sameParties(d, from, to));
    if (pending) throw new RuleError(`You already have a pact with ${nameOf(state, to)}`);
  } else if ('office' in terms) {
    if (!POLITICS.offices.includes(terms.office)) throw new RuleError(`The ${title(terms.office)} is not elected yet`);
  }
  const until = dealUntil(state, from, offer);
  if (terms.kind === 'vote' && 'office' in terms) {
    if (terms.candidate === from) throw new RuleError('Promise your vote to someone else');
    if (!candidatesFor(politics, terms.office).includes(terms.candidate)) {
      throw new RuleError(`${nameOf(state, terms.candidate)} is not running for ${title(terms.office)}`);
    }
  }
  const draft: DealCard = { id: '', from, to, terms, offered: state.month, until, status: 'offered', brokenBy: null, settled: null };
  if (terms.kind === 'vote' && politics.deals.some((d) => d.from === from && (d.status === 'offered' || d.status === 'active') && sameBallot(d, draft) && !sameChoice(d.terms, terms))) {
    throw new RuleError('You already promised your vote on this ballot');
  }
  const id = newId(state, politics.deals);
  editPolitics(state).deals.push({ ...draft, id });
  return id;
}

/** The proposer takes back a card not yet answered. */
export function withdrawDeal(state: GameState, from: string, id: string): void {
  if (!state.politics) throw new RuleError('This game plays without deals');
  const found = state.politics.deals.some((d) => d.id === id && d.from === from && d.status === 'offered');
  if (!found) throw new RuleError('That card is no longer open');
  const card = editPolitics(state).deals.find((d) => d.id === id)!;
  Object.assign(card, { status: 'withdrawn', settled: state.month });
}

/** The receiver accepts or declines a card offered to them. S3-RULE-2 answer rows 1-6. */
export function answerDeal(state: GameState, to: string, id: string, accept: boolean): void {
  const politics = state.politics;
  if (!politics || state.phase !== 'planning') throw new RuleError('Cards are answered in planning');
  const open = politics.deals.find((d) => d.id === id && d.to === to && d.status === 'offered');
  if (!open) throw new RuleError('That card is no longer open');
  let status: DealCard['status'] = 'active';
  if (!accept) status = 'declined';
  else if (open.terms.kind === 'vote' && ballotClosed(state, open)) status = 'expired';
  else if (open.terms.kind === 'pact' && politics.deals.some((d) => d.terms.kind === 'pact' && d.status === 'active' && sameParties(d, open.from, open.to))) {
    throw new RuleError(`You already have a pact with ${nameOf(state, open.from)}`);
  }
  const card = editPolitics(state).deals.find((d) => d.id === id)!;
  Object.assign(card, { status, settled: status === 'active' ? null : state.month });
}

/** One public reason a player's reputation moved: a card they broke, or a month they were blamed for unrest. Slice 4 adds 'caught'. */
export type ReputationReason = { kind: 'broken'; card: DealCard } | { kind: 'unrest'; month: number } | { kind: 'caught'; month: number };

/** A player's active vote promises: per office the candidate and who was promised, and the law ballot's yes or no. */
export interface PromisedVotes {
  election: Partial<Record<Office, { candidate: string; to: string[] }>>;
  law: { yes: boolean; to: string[] } | null;
}

type Verdict = 'kept' | 'broken' | 'expired';

/**
 * S3-RULE-4: what the ballot made of an active vote card. An election card is judged on the closed election's own
 * ballots and field; a law card on the council's ballots, where the Governor's opening yes counts as cast.
 */
function judge(state: GameState, card: DealCard): Verdict {
  const politics = state.politics!;
  const { terms } = card;
  if (terms.kind !== 'vote') return 'expired';
  if ('office' in terms) {
    const election = politics.election;
    // A ballot needs two candidates at least: fewer is an uncontested or appointed office.
    if (!election || !contested(election, terms.office) || !election.candidates[terms.office].includes(terms.candidate)) return 'expired';
    return election.ballots[card.from]?.[terms.office] === terms.candidate ? 'kept' : 'broken';
  }
  return politics.council?.ballots[card.from] === terms.yes ? 'kept' : 'broken';
}

/**
 * Whether `playerId` still gains from a kept card with `otherId` this term: the cards between them settled kept since
 * politics.termStart, that paid the player, are fewer than the limit (S3-RULE-3). A pact pays only where sabotage can happen.
 */
function earnsKept(possible: boolean, politics: Politics, playerId: string, otherId: string): boolean {
  const paid = politics.deals.filter(
    (d) =>
      d.status === 'kept' &&
      d.settled !== null &&
      d.settled >= politics.termStart &&
      sameParties(d, playerId, otherId) &&
      (d.terms.kind === 'pact' ? possible : d.from === playerId),
  );
  return paid.length < POLITICS.reputation.keptPerPartnerPerTerm;
}

/** A player's gain from a card kept with `other`, within the limit. Call before the card itself is marked kept. */
function rewardKept(state: GameState, politics: Politics, playerId: string, otherId: string, possible: boolean): void {
  if (earnsKept(possible, politics, playerId, otherId)) reputationShift(state, playerId, POLITICS.reputation.moves.kept);
}

/** Settles a vote card on the editable politics, and moves the promiser's reputation. */
function settleCard(state: GameState, politics: Politics, card: DealCard, verdict: Verdict): void {
  if (verdict === 'kept') rewardKept(state, politics, card.from, card.to, sabotagePossible(state));
  if (verdict === 'broken') reputationShift(state, card.from, POLITICS.reputation.moves.voteBroken);
  Object.assign(card, { status: verdict, brokenBy: verdict === 'broken' ? card.from : null, settled: state.month });
}

/**
 * The ballot's result is taking effect: every active vote card bound to it settles (S3-RULE-4). politics.ts calls it
 * after its last write, since it copies Politics (editPolitics) and so replaces the object the caller holds.
 */
export function settleVotes(state: GameState, ballot: 'election' | 'law'): void {
  const politics = state.politics;
  if (!politics) return;
  const due = politics.deals.filter((d) => d.status === 'active' && d.terms.kind === 'vote' && ('office' in d.terms) === (ballot === 'election') && d.until === state.month);
  if (due.length === 0) return;
  const verdicts = due.map((d) => [d.id, judge(state, d)] as const);
  const editable = editPolitics(state);
  for (const [id, verdict] of verdicts) settleCard(state, editable, editable.deals.find((d) => d.id === id)!, verdict);
}

/** Planning is closing: offered cards expire, and so does every active vote card whose until has come (S3-RULE-1). */
export function closePlanningDeals(state: GameState): void {
  const open = (d: DealCard): boolean => d.status === 'offered' || (d.status === 'active' && d.terms.kind === 'vote' && d.until <= state.month);
  if (!state.politics?.deals.some(open)) return;
  for (const card of editPolitics(state).deals.filter(open)) Object.assign(card, { status: 'expired', settled: state.month });
}

/** Whether a sabotage can happen in this game, so a pact can be broken: politics is on and so is POLITICS.sabotage.on (S4-RULE-5, D-S4-2 A: no lobby switch). */
export function sabotagePossible(state: GameState): boolean {
  return state.politics !== null && POLITICS.sabotage.on;
}

/** The pact that binds these two players in a month (default: this one), active or already ended kept; null when none. */
export function pactBetween(state: GameState, a: string, b: string, month: number = state.month): DealCard | null {
  const found = state.politics?.deals.find((d) => d.terms.kind === 'pact' && (d.status === 'active' || d.status === 'kept') && sameParties(d, a, b) && d.offered <= month && month <= d.until);
  return found ?? null;
}

/**
 * Slice 4 calls this when a sabotage's culprit becomes public: the pact that bound the two in the sabotage's month
 * breaks, once per card (S3-RULE-5). The saboteur loses pactBroken; the victim gains kept where sabotage was possible
 * and the pact was still running, since a pact that ended kept already paid. `possible` is the seam for sabotagePossible.
 */
export function pactBreach(state: GameState, saboteurId: string, victimId: string, sabotageMonth: number, possible: boolean = sabotagePossible(state)): boolean {
  const pact = pactBetween(state, saboteurId, victimId, sabotageMonth);
  if (!pact) return false;
  const running = pact.status === 'active';
  const politics = editPolitics(state);
  const card = politics.deals.find((d) => d.id === pact.id)!;
  reputationShift(state, saboteurId, POLITICS.reputation.moves.pactBroken);
  if (running && possible) rewardKept(state, politics, victimId, saboteurId, possible);
  Object.assign(card, { status: 'broken', brokenBy: saboteurId, settled: state.month });
  return true;
}

/**
 * The upkeep: a pact whose until has come settles kept, and pays both parties only where sabotage was possible. At
 * game over every active pact settles kept as at its end and every active vote card expires (S3-RULE-5).
 */
export function monthEndDeals(state: GameState, gameOver: boolean, possible: boolean = sabotagePossible(state)): void {
  const ending = (d: DealCard): boolean => d.status === 'active' && (d.terms.kind === 'pact' ? gameOver || d.until <= state.month : gameOver);
  if (!state.politics?.deals.some(ending)) return;
  const politics = editPolitics(state);
  for (const card of politics.deals.filter(ending)) {
    if (card.terms.kind === 'vote') {
      Object.assign(card, { status: 'expired', settled: state.month });
      continue;
    }
    if (possible) {
      rewardKept(state, politics, card.from, card.to, possible);
      rewardKept(state, politics, card.to, card.from, possible);
    }
    Object.assign(card, { status: 'kept', settled: state.month });
  }
}

/** The months a player was blamed for unrest: the reports' events, and this month's list, which repeats the report's at upkeep. */
function unrestMonths(state: GameState, playerId: string): Set<number> {
  const blamed = (e: { key: string; player?: string }): boolean => e.key === 'blamedForUnrest' && e.player === playerId;
  const months = new Set<number>();
  for (const report of state.history) if (report.events?.some(blamed)) months.add(report.month);
  if (state.monthEvents.some(blamed)) months.add(state.month);
  return months;
}

/**
 * Why a player's reputation fell, from what is already public (S3-RULE-7): the cards they broke, the months an order of theirs
 * was attributed (slice 4) and the months they were blamed for unrest, newest first (a card's month is the month it broke; on a tie the card first). Nothing is stored.
 */
export function reputationReasons(state: GameState, playerId: string): ReputationReason[] {
  const broken = (state.politics?.deals ?? []).filter((d) => d.status === 'broken' && d.brokenBy === playerId);
  const reasons: [number, ReputationReason][] = [
    ...broken.map((card): [number, ReputationReason] => [card.settled!, { kind: 'broken', card }]),
    ...(state.politics?.sabotage ?? []).filter((o) => o.by === playerId && o.culpritPublic).map((o): [number, ReputationReason] => [o.month, { kind: 'caught', month: o.month }]),
    ...[...unrestMonths(state, playerId)].map((month): [number, ReputationReason] => [month, { kind: 'unrest', month }]),
  ];
  return reasons.sort(([a], [b]) => b - a).map(([, reason]) => reason);
}

/** The vote promises a player has made that still bind: active vote cards only, an unanswered offer is no promise. */
export function promisedVotes(state: GameState, playerId: string): PromisedVotes {
  const promised: PromisedVotes = { election: {}, law: null };
  for (const d of state.politics?.deals ?? []) {
    if (d.status !== 'active' || d.from !== playerId || d.terms.kind !== 'vote') continue;
    if ('office' in d.terms) (promised.election[d.terms.office] ??= { candidate: d.terms.candidate, to: [] }).to.push(d.to);
    else (promised.law ??= { yes: d.terms.yes, to: [] }).to.push(d.to);
  }
  return promised;
}
