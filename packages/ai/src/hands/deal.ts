import {
  createRng,
  dealUntil,
  nextElectionMonth,
  observe,
  POLITICS,
  RuleError,
  sabotagePossible,
  type AiPersonaId,
  type DealCard,
  type DealOffer,
  type DealTerms,
  type GameState,
  type LawProposal,
  type Office,
  type Rng,
} from '@mule/engine';
import type { Act } from '../actions.js';
import { cardWorth, lawWorth } from '../politics-value.js';
import type { Mind } from '../value.js';
import { ownVote, type VotePort } from './vote.js';

/**
 * WS2's port to a Claude seat's recorded reasoning for deal cards (slice 3 §3). A null answer means the keyless rule.
 * It answers from recorded state only (WS2 HC-B3), so a replay sends the same cards.
 */
export interface DealPort {
  answerFor(card: DealCard): boolean | null;
  offersFor(month: number): DealOffer[] | null;
}

/** The same object WS3 passes to the seat's VoteHand may carry the vote methods, so an offered vote is the cast vote. */
export type SeatPort = DealPort & Partial<VotePort>;

function asVotePort(port: SeatPort | undefined): VotePort | undefined {
  return port && typeof port.electionVote === 'function' && typeof port.lawVote === 'function' ? (port as VotePort) : undefined;
}

/** A card the seat is only considering, with the offer that would send it. */
interface Draft {
  card: DealCard;
  offer: DealOffer;
}

function sameTerms(a: DealTerms, b: DealTerms): boolean {
  if (a.kind === 'pact' || b.kind === 'pact') return a.kind === b.kind;
  if ('office' in a) return 'office' in b && a.office === b.office && a.candidate === b.candidate;
  return !('office' in b) && a.yes === b.yes;
}

/** The ballot a vote card binds: an office, or the law ballot. */
function ballotOf(terms: DealTerms): Office | 'law' | null {
  if (terms.kind === 'pact') return null;
  return 'office' in terms ? terms.office : 'law';
}

const WINDOW_SALT = 0x3c6ef372; // literal-ok: a hash salt, so the deal stream is its own

/**
 * The card table of an AI seat (slice 3 S3-RULE-9): answers the cards offered to it and offers its own, keyless.
 * It decides from observe() alone and draws only from its own stream, so no election or council draw moves.
 * It never withdraws a card and acts only in planning.
 */
export class DealHand {
  private month = 0;
  private rng: Rng = createRng(0);
  /** Ms left before the seat answers a card, by card id. */
  private waits = new Map<string, number>();
  private answered = new Set<string>();
  /** Ms left before the seat offers in a window, by `month:window`. */
  private pauses = new Map<string, number>();
  private offeredIn = new Set<string>();
  private sent = 0;

  constructor(
    readonly mind: Mind,
    private readonly port?: SeatPort,
  ) {}

  /** Call with the same (phaseScale-divided) dt as VoteHand.tick, after it. */
  tick(state: GameState, dt: number, act: Act): void {
    if (!this.live(state)) return;
    this.enter(state);
    const obs = observe(state, this.mind.me);
    for (const card of this.pending(obs)) {
      const left = (this.waits.get(card.id) ?? this.rng.int(...POLITICS.ai.actMs)) - dt;
      this.waits.set(card.id, left);
      if (left <= 0) this.reply(obs, card, act);
    }
    const key = this.windowKey(obs);
    if (key === null || this.offeredIn.has(key)) return;
    const left = (this.pauses.get(key) ?? this.rng.int(...POLITICS.ai.actMs)) - dt;
    this.pauses.set(key, left);
    if (left > 0) return;
    this.offeredIn.add(key);
    this.offer(state, act);
  }

  /** Answers every card waiting at once: the server before planning ends, and the sim. */
  flush(state: GameState, act: Act): void {
    if (!this.live(state)) return;
    this.enter(state);
    const obs = observe(state, this.mind.me);
    for (const card of this.pending(obs)) this.reply(obs, card, act);
  }

  /** S3-RULE-9 answer rows: whether to accept `card`, offered to this seat. */
  answer(obs: GameState, card: DealCard): boolean {
    this.enter(obs);
    if (this.reputationOf(obs, card.from) < POLITICS.ai.deals.refuseBelow) return false;
    // The engine refuses a second pact between the same two, so a decline is the only answer that can be sent.
    if (card.terms.kind === 'pact' && obs.politics!.deals.some((d) => d.terms.kind === 'pact' && d.status === 'active' && this.between(d, card))) return false;
    const asked = this.port?.answerFor(card);
    if (typeof asked === 'boolean') return asked;
    if (this.mind.levelId === 'rookie') return this.rng.chance(POLITICS.ai.deals.rookieAccept);
    return cardWorth(obs, this.mind.me, card) >= POLITICS.ai.deals.acceptMin[this.persona];
  }

  /** S3-RULE-9 offer rows a-c: the best cards by worth to this seat, within offersPerMonth and maxOpenOffers. */
  offer(state: GameState, act: Act): void {
    if (!this.live(state)) return;
    this.enter(state);
    const obs = observe(state, this.mind.me);
    const open = obs.politics!.deals.filter((d) => d.from === this.mind.me && d.status === 'offered').length;
    let slots = Math.min(POLITICS.ai.deals.offersPerMonth - this.sent, POLITICS.deals.maxOpenOffers - open);
    const asked = this.port?.offersFor(obs.month);
    const offers = asked ? asked.filter((o) => !this.runsFor(obs, o.terms)) : this.chosen(obs).map((d) => d.offer);
    for (const offer of offers) {
      if (slots <= 0) return;
      if (act({ type: 'offerDeal', offer })) {
        this.sent++;
        slots--;
      }
    }
  }

  private get persona(): AiPersonaId {
    return this.mind.personaId as AiPersonaId;
  }

  private live(state: GameState): boolean {
    return state.phase === 'planning' && !!state.politics;
  }

  /** The deal stream of this seat and month: it hashes the seat's own seed, never the game's. */
  private enter(state: GameState): void {
    if (state.month === this.month) return;
    if (this.mind.salt === undefined) throw new Error("A DealHand's mind needs the seat's salt: build it with AiSeat");
    this.month = state.month;
    const seatSeed = this.mind.salt ^ WINDOW_SALT;
    this.rng = createRng((Math.imul(seatSeed, 1_000_003) ^ Math.imul(state.month, 7_919)) >>> 0); // literal-ok: hashing constants (primes) that make one stream per seat and month
    this.sent = 0;
  }

  private pending(obs: GameState): DealCard[] {
    return obs.politics!.deals.filter((d) => d.status === 'offered' && d.to === this.mind.me && !this.answered.has(d.id));
  }

  private reply(obs: GameState, card: DealCard, act: Act): void {
    this.answered.add(card.id);
    act({ type: 'answerDeal', id: card.id, accept: this.answer(obs, card) });
  }

  private between(a: DealCard, b: DealCard): boolean {
    return (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);
  }

  private reputationOf(obs: GameState, id: string): number {
    return obs.players.find((p) => p.id === id)?.reputation ?? 0;
  }

  /**
   * The offer windows: an election's announce once the seat is Done (VoteHand presses it after its last call, so the seat's
   * candidacy is settled and AM-8 cannot break what it offers), and planning proper once the election is over or none is held.
   */
  private windowKey(obs: GameState): string | null {
    const stage = obs.politics!.election?.stage ?? 'none';
    if (stage === 'announce') return obs.politics!.election!.done.includes(this.mind.me) ? `${obs.month}:announce` : null;
    const council = obs.politics!.council;
    return stage === 'over' || stage === 'none' ? (council && council.stage !== 'over' ? null : `${obs.month}:planning`) : null;
  }

  /** Whether the seat runs for the office a vote card names (AM-8: it never promises its vote there). */
  private runsFor(obs: GameState, terms: DealTerms): boolean {
    if (terms.kind !== 'vote' || !('office' in terms)) return false;
    const { candidates, election } = obs.politics!;
    return candidates[terms.office].includes(this.mind.me) || (election?.candidates[terms.office].includes(this.mind.me) ?? false);
  }

  /** The drafts that pass every offer test, best first, trimmed to one card per partner and per ballot. */
  private chosen(obs: GameState): Draft[] {
    const me = this.mind.me;
    const mine = obs.politics!.deals.filter((d) => d.from === me && (d.status === 'offered' || d.status === 'active'));
    const usable = this.drafts(obs)
      .map((d) => ({ ...d, worth: cardWorth(obs, me, d.card) }))
      .filter((d) => d.worth > 0 && this.acceptable(obs, d))
      .sort((a, b) => b.worth - a.worth);
    const takenPartners = new Set(mine.filter((d) => d.status === 'offered').map((d) => d.to));
    const takenBallots = new Set(mine.filter((d) => d.terms.kind === 'vote').map((d) => `${d.until}:${ballotOf(d.terms)}`));
    const picked: Draft[] = [];
    for (const d of usable) {
      const { to, terms, until } = d.card;
      const ballot = ballotOf(terms) === null ? null : `${until}:${ballotOf(terms)}`;
      if (takenPartners.has(to) || (ballot !== null && takenBallots.has(ballot))) continue;
      takenPartners.add(to);
      if (ballot !== null) takenBallots.add(ballot);
      picked.push(d);
    }
    return picked;
  }

  /** The offer tests about the partner: worth to it at least 0, its reputation, and the same card not declined this month. */
  private acceptable(obs: GameState, d: Draft): boolean {
    const me = this.mind.me;
    return (
      cardWorth(obs, d.card.to, d.card) >= 0 &&
      this.reputationOf(obs, d.card.to) >= POLITICS.ai.deals.refuseBelow &&
      !obs.politics!.deals.some((c) => c.from === me && c.to === d.card.to && c.status === 'declined' && c.settled === obs.month && sameTerms(c.terms, d.card.terms))
    );
  }

  /** Rows a, b and c as cards not yet sent. */
  private drafts(obs: GameState): Draft[] {
    const drafts: (Draft | null)[] = [];
    for (const office of POLITICS.offices) drafts.push(this.voteForCandidate(obs, office));
    drafts.push(this.voteOnLaw(obs));
    drafts.push(this.pact(obs));
    return drafts.filter((d): d is Draft => d !== null);
  }

  private draft(obs: GameState, offer: DealOffer): Draft | null {
    try {
      const until = dealUntil(obs, this.mind.me, offer);
      const card: DealCard = { id: 'draft', from: this.mind.me, to: offer.to, terms: offer.terms, offered: obs.month, until, status: 'offered', brokenBy: null, settled: null };
      return { card, offer };
    } catch (err) {
      if (err instanceof RuleError) return null;
      throw err;
    }
  }

  /** Row a: an election ahead for an office it does not run for, its vote to the candidate ownVote names. */
  private voteForCandidate(obs: GameState, office: Office): Draft | null {
    const politics = obs.politics!;
    const ahead = politics.election?.stage === 'announce' || nextElectionMonth(obs) !== null;
    const candidates = politics.candidates[office];
    // literal-ok: an office is contested only with two or more candidates, a definition
    if (!ahead || candidates.length < 2 || this.runsFor(obs, { kind: 'vote', office, candidate: this.mind.me })) return null;
    const pick = ownVote(obs, this.mind, { office, candidates }, asVotePort(this.port));
    return pick === null ? null : this.draft(obs, { to: pick, terms: { kind: 'vote', office, candidate: pick } });
  }

  /** Row b: a law up for a vote, its vote to the proposer if yes, else to the player the law costs most. */
  private voteOnLaw(obs: GameState): Draft | null {
    const { council, proposal: pending } = obs.politics!;
    const live = council && council.stage !== 'over' ? { proposal: council.proposal, by: council.proposer } : pending ? { proposal: pending.proposal, by: pending.by } : null;
    if (!live) return null;
    const yes = ownVote(obs, this.mind, { proposal: live.proposal }, asVotePort(this.port));
    if (yes === null) return null;
    const to = yes ? live.by : this.dearestTo(obs, live.proposal);
    return to === null || to === this.mind.me ? null : this.draft(obs, { to, terms: { kind: 'vote', law: true, yes } });
  }

  /** The other player the proposal costs most a month; the first in seat order on a tie. */
  private dearestTo(obs: GameState, proposal: LawProposal): string | null {
    const cost = (id: string): number => -lawWorth(obs, id, proposal);
    return obs.players.filter((p) => p.id !== this.mind.me).reduce<string | null>((best, p) => (best === null || cost(p.id) > cost(best) ? p.id : best), null);
  }

  /** Row c: where sabotage can happen, a pact of the middle length to the player it is worth most with. */
  private pact(obs: GameState): Draft | null {
    if (!sabotagePossible(obs)) return null;
    const { pactMonths } = POLITICS.deals;
    const months = pactMonths[Math.floor(pactMonths.length / 2)]!;
    const open = obs.politics!.deals.filter((d) => d.terms.kind === 'pact' && (d.status === 'offered' || d.status === 'active'));
    // every offer test comes before the pick, so a best partner that fails one gives way to the next best
    const holding = new Set(obs.politics!.deals.filter((d) => d.from === this.mind.me && d.status === 'offered').map((d) => d.to));
    const worth = (d: Draft): number => cardWorth(obs, this.mind.me, d.card);
    const options = obs.players
      .filter((p) => p.id !== this.mind.me && !holding.has(p.id) && !open.some((d) => (d.from === p.id && d.to === this.mind.me) || (d.from === this.mind.me && d.to === p.id)))
      .map((p) => this.draft(obs, { to: p.id, terms: { kind: 'pact' }, months }))
      .filter((d): d is Draft => d !== null && worth(d) > 0 && this.acceptable(obs, d));
    return options.reduce<Draft | null>((best, d) => (best === null || worth(d) > worth(best) ? d : best), null);
  }
}
