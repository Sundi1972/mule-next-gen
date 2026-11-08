import { POLITICS, type DealCard } from '@mule/engine';
import type { MuleView, MyView } from '@mule/protocol';
import { proposalWords } from './LawPicker';
import { OFFICE_NAME } from './words';

/** A deal card in words, the same on every screen. No pronouns: the game does not know a player's. */

type V = Pick<MuleView, 'players'> & Partial<Pick<MuleView, 'politics'>>;

const MOVES = POLITICS.reputation.moves;

export const nameOf = (view: Pick<MuleView, 'players'>, id: string, me: string | null, you = 'you') => (id === me ? you : (view.players.find((p) => p.id === id)?.name ?? 'someone'));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A player named in a line of words: their id, and their name as the line says it ("Ossa", or "Ossa’s"). */
export interface Named {
  id: string;
  text: string;
  possessive?: true;
}
/** A line of words that keeps each named player by id, for SeatWords' `who`. */
export type Said = (string | Named)[];

/** The words alone. */
export const plain = (said: Said): string => said.map((part) => (typeof part === 'string' ? part : part.text)).join('');

/**
 * The seats the words name, in order, for SeatWords. A computer seat's possessive is left out, so it carries no mark
 * ("Ossa’s vote"): the card's label names the seat. A person's possessive stays in, so SeatWords passes over it.
 */
export function whoOf(said: Said, players: Pick<MuleView, 'players'>['players']): string[] {
  return said.flatMap((part) => (typeof part === 'string' || (part.possessive && players.find((p) => p.id === part.id)?.isAi) ? [] : [part.id]));
}

/** A player in a line: by id, or the plain `you` for `me`. */
export const who = (view: Pick<MuleView, 'players'>, id: string, me: string | null, you = 'you'): string | Named => (id === me ? you : { id, text: nameOf(view, id, null) });

/** "months 5 to 7", or "in month 5". */
export const monthsWords = (from: number, until: number) => (from === until ? `in month ${from}` : `months ${from} to ${until}`);

/** The law a law card binds to: the ballot open now, else the pending proposal (the ballot after it). */
export function lawUp(view: Partial<Pick<MuleView, 'politics' | 'month'>>): { month: number; words: string } | null {
  const p = view.politics;
  if (p?.council && p.council.stage === 'ballot') return { month: view.month ?? 0, words: proposalWords(p.council.proposal) };
  if (p?.proposal) return { month: p.proposal.month + 1, words: proposalWords(p.proposal.proposal) };
  return null;
}

/** A card's headline from where `me` sits: "Pact · 3 months", "Your vote for Brix", "Lena’s yes on the next law". */
export function titleWords(view: V, c: DealCard, me: string | null): Said {
  const t = c.terms;
  if (t.kind === 'pact') {
    const n = c.until - c.offered + 1;
    return [`Pact · ${n} ${n === 1 ? 'month' : 'months'}`];
  }
  // A possessive carries no mark: the card's label names its seat.
  const whose: Said = c.from === me ? ['Your'] : [{ id: c.from, text: `${nameOf(view, c.from, me)}’s`, possessive: true }];
  if ('law' in t) return [...whose, ` ${t.yes ? 'yes' : 'no'} on the next law`];
  return [...whose, ' vote for ', who(view, t.candidate, me)];
}

/** What it binds, in one sentence. */
export function bindsWords(view: V, c: DealCard, me: string | null): Said {
  const t = c.terms;
  if (t.kind === 'pact') return [`Neither of you sabotages the other, ${monthsWords(c.offered, c.until)}.`];
  const votes: Said = c.from === me ? ['You vote'] : [who(view, c.from, me), ' votes'];
  if ('law' in t) {
    const law = lawUp(view);
    return [...votes, ` ${t.yes ? 'yes' : 'no'} in the law vote of month ${c.until}${law ? `: ${law.words}` : ''}, whatever it then proposes.`];
  }
  return [...votes, ' for ', who(view, t.candidate, me), ` for ${OFFICE_NAME[t.office]}, month ${c.until}.`];
}

/** What keeping and breaking it cost, for the one who holds the promise. */
export function stakesWords(view: V, c: Pick<DealCard, 'from' | 'to' | 'terms'>, me: string | null): Said {
  if (c.terms.kind === 'pact') return [`Keeping it builds your name. Breaking it costs −${-MOVES.pactBroken}, and the table sees.`];
  if (c.from === me) return [`Kept: +${MOVES.kept} to your name. Broken: −${-MOVES.voteBroken}, and the table sees it.`];
  const from = who(view, c.from, me);
  return ['You promise nothing. If ', from, ` breaks it: −${-MOVES.voteBroken} to `, from, ', in public.'];
}

/** The public line for a broken card (S3-RULE-11's words). `named`: with the breaker's name first (news, TV, month end). */
export function brokenWords(view: V, c: DealCard, named = true): string {
  const name = (id: string) => nameOf(view, id, null);
  const [breaker, other] = brokenPair(c);
  const lead = named ? `${name(breaker)} broke` : 'Broke';
  const t = c.terms;
  if (t.kind === 'pact') return `${lead} a pact with ${name(other)}`;
  if ('law' in t) return `${lead} a promise to ${name(c.to)}: a ${t.yes ? 'yes' : 'no'} on the law`;
  return `${lead} a promise to ${name(c.to)}: a vote for ${name(t.candidate)}`;
}

/** The seats brokenWords names, in its words' order, for SeatWords' `who`: breaker (when named), the other party, the candidate. */
export function brokenWho(c: DealCard, named = true): string[] {
  const [breaker, other] = brokenPair(c);
  const lead = named ? [breaker] : [];
  const t = c.terms;
  if (t.kind === 'pact') return [...lead, other];
  if ('law' in t) return [...lead, c.to];
  return [...lead, c.to, t.candidate];
}

const brokenPair = (c: DealCard): [string, string] => {
  const breaker = c.brokenBy ?? c.from;
  return [breaker, breaker === c.from ? c.to : c.from];
};

/** The cards broken in `month`: the one rule for "this month's broken cards" on the TV and at the month end. */
export const brokenIn = (view: Pick<MuleView, 'politics'>, month: number): DealCard[] => (view.politics?.brokenDeals ?? []).filter((c) => c.settled === month);

/** The reputation a broken card cost its breaker. */
export const brokenMove = (c: DealCard) => (c.terms.kind === 'pact' ? MOVES.pactBroken : MOVES.voteBroken);

/** Where a card stands, from where `me` sits, for My cards and the thread. */
export function statusWords(view: V, c: DealCard, me: string | null): Said {
  const other = who(view, c.from === me ? c.to : c.from, me);
  switch (c.status) {
    case 'offered':
      return c.from === me ? ['Waiting for ', other] : [other, ' offers you this card'];
    case 'active':
      return [c.terms.kind === 'pact' ? `Binds until the end of month ${c.until}` : `Binds at the ballot, month ${c.until}`];
    case 'kept':
      return c.terms.kind === 'pact' ? ['Pact kept'] : [`Kept · +${MOVES.kept} to `, who(view, c.from, me)];
    case 'broken':
      return ['Broken by ', who(view, c.brokenBy ?? c.from, me), ` · −${-brokenMove(c)}, in public`];
    case 'declined':
      return ['Declined by ', who(view, c.to, me)];
    case 'withdrawn':
      return ['Withdrawn by ', who(view, c.from, me)];
    case 'expired':
      return [c.terms.kind === 'vote' && c.settled !== c.offered ? 'Expired: no ballot settled it' : 'Expired: planning ended unanswered'];
  }
}

/**
 * Why `me` may not offer `to` a card now, in the engine's words, or null: one unanswered card to a player at a time
 * (S3-RULE-2 row 5). The composer asks it whichever door opened it, and every "+ Deal" door asks it too.
 */
export function noNewCard(view: Pick<MuleView, 'players'>, me: Pick<MyView, 'id' | 'deals'>, to: string): string | null {
  const waiting = (me.deals?.cards ?? []).some((c) => c.from === me.id && c.to === to && c.status === 'offered');
  return waiting ? `${nameOf(view, to, me.id)} has not answered your last card` : null;
}
