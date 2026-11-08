// Copied from design/mocks/politics-deals/src/proposed/words.ts (approved/awaiting-pick mock, 7–8 Nov); changes for the tabs are marked TABS:.
import type { DealCard } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { proposalWords } from '../../../../../../apps/web/src/phone/hub/politics/LawPicker';
import { MOVES } from '../../fixture';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/politics/words.ts (WS7 path), beside OFFICE_NAME and promiseWords. Every
 * screen, phone and TV, says a card the same way. No pronouns: the game does not know a player's (finding F-3).
 */

type V = Pick<MuleView, 'players' | 'politics'>;

const nameOf = (view: V, id: string, me: string | null, you = 'you') => (id === me ? you : (view.players.find((p) => p.id === id)?.name ?? 'someone'));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "months 5 to 7", or "in month 5". */
export const monthsWords = (from: number, until: number) => (from === until ? `in month ${from}` : `months ${from} to ${until}`);

/** The law a law card binds to: the ballot open now, else the pending proposal (the ballot after it). */
export function lawUp(view: Pick<MuleView, 'politics'> & Partial<Pick<MuleView, 'month'>>): { month: number; words: string } | null {
  const p = view.politics;
  if (p?.council && p.council.stage === 'ballot') return { month: view.month ?? 0, words: proposalWords(p.council.proposal) };
  if (p?.proposal) return { month: p.proposal.month + 1, words: proposalWords(p.proposal.proposal) };
  return null;
}

/** A card's headline from where `me` sits: "Pact · 3 months", "Your vote for Brix", "Lena's yes on the next law". */
export function titleWords(view: V, c: DealCard, me: string | null): string {
  const t = c.terms;
  if (t.kind === 'pact') {
    const n = c.until - c.offered + 1;
    return `Pact · ${n} ${n === 1 ? 'month' : 'months'}`;
  }
  const whose = c.from === me ? 'Your' : `${nameOf(view, c.from, me)}’s`;
  if ('law' in t) return `${whose} ${t.yes ? 'yes' : 'no'} on the next law`;
  return `${whose} vote for ${nameOf(view, t.candidate, me)}`;
}

/** What it binds, in one sentence. */
export function bindsWords(view: V, c: DealCard, me: string | null): string {
  const t = c.terms;
  if (t.kind === 'pact') return `Neither of you sabotages the other, ${monthsWords(c.offered, c.until)}.`;
  const who = c.from === me ? 'You vote' : `${nameOf(view, c.from, me)} votes`;
  if ('law' in t) {
    const law = lawUp(view);
    return `${who} ${t.yes ? 'yes' : 'no'} in the law vote of month ${c.until}${law ? `: ${law.words}` : ''}, whatever it then proposes.`;
  }
  return `${who} for ${nameOf(view, t.candidate, me, 'you')} for Governor, month ${c.until}.`;
}

/** What keeping and breaking it cost, for the one who holds the promise. */
export function stakesWords(view: V, c: Pick<DealCard, 'from' | 'to' | 'terms'>, me: string | null): string {
  if (c.terms.kind === 'pact') return `Kept: +${MOVES.kept} each. Broken: −${-MOVES.pactBroken} to whoever breaks it, and the table sees it.`;
  if (c.from === me) return `Kept: +${MOVES.kept} to your name. Broken: −${-MOVES.voteBroken}, and the table sees it.`;
  const from = nameOf(view, c.from, me);
  return `You promise nothing. If ${from} breaks it: −${-MOVES.voteBroken} to ${from}, in public.`;
}

/** The public line for a broken card (S3-RULE-11's words). `named`: with the breaker's name first (news, TV, month end). */
export function brokenWords(view: V, c: DealCard, named = true): string {
  const breaker = c.brokenBy ?? c.from;
  const other = breaker === c.from ? c.to : c.from;
  const lead = named ? `${nameOf(view, breaker, null)} broke` : 'Broke';
  const t = c.terms;
  if (t.kind === 'pact') return `${lead} a pact with ${nameOf(view, other, null)}`;
  if ('law' in t) return `${lead} a promise to ${nameOf(view, c.to, null)}: a ${t.yes ? 'yes' : 'no'} on the law`;
  return `${lead} a promise to ${nameOf(view, c.to, null)}: a vote for ${nameOf(view, t.candidate, null)}`;
}

/** The reputation a broken card cost its breaker. */
export const brokenMove = (c: DealCard) => (c.terms.kind === 'pact' ? MOVES.pactBroken : MOVES.voteBroken);

/** Where a card stands, from where `me` sits, for My cards and the thread. */
export function statusWords(view: V, c: DealCard, me: string | null): string {
  const other = nameOf(view, c.from === me ? c.to : c.from, me);
  switch (c.status) {
    case 'offered':
      return c.from === me ? `Waiting for ${other}` : `${cap(other)} offers you this card`;
    case 'active':
      return c.terms.kind === 'pact' ? `Binds until the end of month ${c.until}` : `Binds at the ballot, month ${c.until}`;
    case 'kept':
      return c.terms.kind === 'pact' ? `Pact kept · +${MOVES.kept} each` : `Kept · +${MOVES.kept} to ${c.from === me ? 'you' : nameOf(view, c.from, me)}`;
    case 'broken':
      return `Broken by ${nameOf(view, c.brokenBy ?? c.from, me)} · −${-brokenMove(c)}, in public`;
    case 'declined':
      return `Declined by ${nameOf(view, c.to, me)}`;
    case 'withdrawn':
      return `Withdrawn by ${nameOf(view, c.from, me)}`;
    case 'expired':
      return c.terms.kind === 'vote' && c.settled !== c.offered ? 'Expired: no ballot settled it' : 'Expired: planning ended unanswered';
  }
}

export { cap, nameOf };
