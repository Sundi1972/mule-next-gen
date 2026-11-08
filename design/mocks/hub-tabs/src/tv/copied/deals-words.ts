// Copied from apps/web/src/phone/hub/politics/deals-words.ts on origin/ws7-s3-phone-pr at 3bcfdd7c: only what the TV draws
// (the break's words, its seats, this month's broken cards, the move), unchanged. The rest of the file is the phone's.
import { POLITICS, type DealCard } from '@mule/engine';
import type { MuleView } from '@mule/protocol';

type V = Pick<MuleView, 'players'> & Partial<Pick<MuleView, 'politics'>>;

const MOVES = POLITICS.reputation.moves;

export const nameOf = (view: Pick<MuleView, 'players'>, id: string, me: string | null, you = 'you') => (id === me ? you : (view.players.find((p) => p.id === id)?.name ?? 'someone'));

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
