import { POLITICS, type DealCard } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { proposalWords } from './LawPicker';
import { OFFICE_NAME } from './words';

/** A deal card in words, the same on every screen. No pronouns: the game does not know a player's. */

type V = Pick<MuleView, 'players'> & Partial<Pick<MuleView, 'politics'>>;

const MOVES = POLITICS.reputation.moves;

export const nameOf = (view: Pick<MuleView, 'players'>, id: string, me: string | null, you = 'you') => (id === me ? you : (view.players.find((p) => p.id === id)?.name ?? 'someone'));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A player named in a line of words: their id, and their name as the line says it. */
export interface Named {
  id: string;
  text: string;
}
/** A line of words that keeps each named player by id, so a screen marks a computer seat from its data, never its name. */
export type Said = (string | Named)[];

/** The words alone. */
export const plain = (said: Said): string => said.map((part) => (typeof part === 'string' ? part : part.text)).join('');

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
  const whose = c.from === me ? 'Your' : `${nameOf(view, c.from, me)}’s`;
  if ('law' in t) return [`${whose} ${t.yes ? 'yes' : 'no'} on the next law`];
  return [`${whose} vote for `, who(view, t.candidate, me)];
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
  if (c.terms.kind === 'pact') return [`Kept: +${MOVES.kept} each. Broken: −${-MOVES.pactBroken} to whoever breaks it, and the table sees it.`];
  if (c.from === me) return [`Kept: +${MOVES.kept} to your name. Broken: −${-MOVES.voteBroken}, and the table sees it.`];
  const from = who(view, c.from, me);
  return ['You promise nothing. If ', from, ` breaks it: −${-MOVES.voteBroken} to `, from, ', in public.'];
}

/** The public line for a broken card (S3-RULE-11's words), each name by id. `named`: the breaker's name first (news, TV, month end). */
export function brokenSaid(view: V, c: DealCard, named = true): Said {
  const breaker = c.brokenBy ?? c.from;
  const other = breaker === c.from ? c.to : c.from;
  const lead: Said = named ? [who(view, breaker, null), ' broke'] : ['Broke'];
  const t = c.terms;
  if (t.kind === 'pact') return [...lead, ' a pact with ', who(view, other, null)];
  if ('law' in t) return [...lead, ' a promise to ', who(view, c.to, null), `: a ${t.yes ? 'yes' : 'no'} on the law`];
  return [...lead, ' a promise to ', who(view, c.to, null), ': a vote for ', who(view, t.candidate, null)];
}

/** brokenSaid as one string, for a label or a comparison. */
export const brokenWords = (view: V, c: DealCard, named = true): string => plain(brokenSaid(view, c, named));

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
      return c.terms.kind === 'pact' ? [`Pact kept · +${MOVES.kept} each`] : [`Kept · +${MOVES.kept} to `, who(view, c.from, me)];
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
