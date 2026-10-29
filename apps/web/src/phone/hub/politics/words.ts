import { POLITICS, type CanRun, type ElectionHow, type Office, type TaxPromise } from '@mule/engine';
import type { MuleView, PoliticsView } from '@mule/protocol';

export const OFFICE_NAME: Record<Office, string> = { governor: 'Governor', sheriff: 'Sheriff' };

/** What an office is for, in a few words (E-3); the Sheriff has no powers yet. */
export const JOB: Partial<Record<Office, string>> = { governor: 'sets the sales tax each month' };

/** The elected offices' names, in POLITICS.offices order. */
export function officeNames(): string[] {
  return POLITICS.offices.map((office) => OFFICE_NAME[office]);
}

/** Why the run button for an office is refused, from the view's canRun. */
export function whyNot(reason: Exclude<CanRun, true>): string {
  switch (reason) {
    case 'notPlanning':
      return 'You can run for office in planning';
    case 'closed':
      return 'Candidates are closed until the result';
    case 'termLimit':
      return `${POLITICS.maxGovernorTermsInRow} Governor terms in a row`;
    case 'notElected':
      return 'Not elected yet';
  }
}

/** E-4: a promise as a change from today's tax. Long beside a name, short on a button ("Run · up to 4%"). */
export function promiseWords(p: TaxPromise | undefined | null, tax: number, long = true): string | null {
  if (!p) return null;
  if (p.kind === 'lower') return 'lower it';
  if (p.kind === 'hold') return `keep it at ${tax}%`;
  return long ? `up to ${p.percent}% (it's ${tax}% now)` : `up to ${p.percent}%`;
}

/** A promise as the Governor is reminded of it: "no higher than 4%", "lower it", "keep it at 5%". */
export function promisedWords(p: TaxPromise, tax: number): string {
  return p.kind === 'cap' ? `no higher than ${p.percent}%` : promiseWords(p, tax)!;
}

/** "You promised no higher than 4%.", "You promised to lower it." */
export function youPromised(p: TaxPromise, tax: number): string {
  return `You promised ${p.kind === 'cap' ? '' : 'to '}${promisedWords(p, tax)}.`;
}

/** The tax a Governor's lower or hold is judged against: the tax when the term began, else the month's start. */
export function promiseBase(politics: Pick<PoliticsView, 'tax' | 'promiseFrom'>): number {
  return politics.promiseFrom ?? politics.tax.start;
}

/** Whether the tax keeps the Governor's promise (C68): at most a cap, under the term's start for lower, at it for hold. */
export function promiseKept(p: TaxPromise, politics: Pick<PoliticsView, 'tax' | 'promiseFrom'>, percent = politics.tax.percent): boolean {
  if (p.kind === 'cap') return percent <= p.percent;
  return p.kind === 'lower' ? percent < promiseBase(politics) : percent === promiseBase(politics);
}

/** A player's name by id, from the view's players. */
export function namer(view: Pick<MuleView, 'players'>): (id: string) => string {
  return (id) => view.players.find((p) => p.id === id)?.name ?? id;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Kai", "Ossa and Kai", "you, Ossa and Kai": the viewer is "you" and comes first. */
export function listNames(ids: readonly string[], me: string | null, name: (id: string) => string): string {
  const names = [...ids.filter((i) => i === me), ...ids.filter((i) => i !== me)].map((i) => (i === me ? 'you' : name(i)));
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export interface Race {
  winner: string;
  how: ElectionHow;
  /** Highest first, as the engine sorts them. */
  tallies: { id: string; votes: number }[];
}

type Room = Pick<MuleView, 'players'> & { politics: Pick<PoliticsView, 'baron'> | null };

/** E-6: how an office was won, in the words of the rule that decided it. */
export function howWords(r: Race, me: string | null, view: Room): string {
  const [a, b] = r.tallies;
  if (r.how === 'appointed') return 'Nobody ran, so the richest player is appointed.';
  if (r.how === 'unopposed' || !a || !b) return 'Elected unopposed: nobody ran against them.';
  if (r.how === 'votes') return `Won on votes, ${a.votes} to ${b.votes}.`;
  const each = `${a.votes} ${a.votes === 1 ? 'vote' : 'votes'} each`;
  if (r.how === 'baron') return `A tie, ${each}, broken by the Land Baron's vote.`;
  const name = namer(view);
  const who = (id: string) => (id === me ? 'you' : name(id));
  const won = r.winner === me;
  if (r.how === 'lot') return `A tie, ${each}, and the same plots, so it was decided by lot: ${who(r.winner)} ${won ? 'win' : 'wins'}.`;
  const plots = (id: string) => view.players.find((p) => p.id === id)?.plots ?? 0;
  const loser = r.tallies.find((t) => t.id !== r.winner)!.id;
  const most = `the most plots wins: ${who(r.winner)} ${won ? 'have' : 'has'} ${plots(r.winner)}, ${who(loser)} ${plots(loser)}.`;
  // A Land Baron who voted for neither of the tied is no tie-break, and "nobody is Land Baron" would be false.
  return view.politics?.baron ? `A tie, ${each}, so ${most}` : `A tie, ${each}. Nobody is Land Baron to break it, so ${most}`;
}

/** E-8: the Land Baron named, or who shares the most plots when nobody holds them alone. */
export function baronWords(view: Pick<MuleView, 'players'>, baron: string | null, me: string | null): { head: string; rule: string } {
  const name = namer(view);
  const rule = 'Whoever owns the most plots gets +1 vote and breaks ties.';
  if (baron) return { head: `Land Baron: ${capital(baron === me ? 'you' : name(baron))}`, rule };
  const most = Math.max(0, ...view.players.map((p) => p.plots));
  const top = view.players.filter((p) => p.plots === most).map((p) => p.id);
  const share = most > 0 && top.length > 1 ? `${capital(listNames(top, me, name))} share the most plots (${most}). ` : '';
  return { head: 'Land Baron: nobody yet', rule: `${share}${rule}` };
}

/** The last month of a term that ends before the next election, or with the game. */
export function termEnd(next: number | null, maxMonths: number): number {
  return next === null ? maxMonths : next - 1;
}
