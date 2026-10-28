import { POLITICS, type CanRun, type ElectionHow, type Office, type TaxPromise } from '@mule/engine';

export const OFFICE_NAME: Record<Office, string> = { governor: 'Governor', sheriff: 'Sheriff' };

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

/** A Governor candidate's tax promise, as the ballot and the TV quote it. */
export function promiseText(p: TaxPromise): string {
  return p.kind === 'cap' ? `Tax no higher than ${p.percent}%` : p.kind === 'lower' ? 'Lower the tax' : 'Hold the tax';
}

/** How an office was won, as the reveal says it. `baron` is the Land Baron's name. */
export function howWon(office: Office, how: ElectionHow, baron: string | null): string {
  switch (how) {
    case 'votes':
      return 'Won on votes.';
    case 'unopposed':
      return 'Elected unopposed: no ballot for this office.';
    case 'appointed':
      return office === 'sheriff'
        ? 'Nobody ran: the richest player who isn’t Governor is appointed, by lot if several are.'
        : 'Nobody ran: the richest player is appointed, by lot if several are.';
    case 'baron':
      return baron ? `A tie: ${baron}, the Land Baron, broke it.` : 'A tie: the Land Baron broke it.';
    case 'land':
      return 'A tie: the most plots won it.';
    case 'lot':
      return 'A tie: decided by lot.';
  }
}

/** A change in percentage points: "+3", "-2", "±0". */
export function change(points: number): string {
  return points === 0 ? '±0' : points > 0 ? `+${points}` : `${points}`;
}

/** The last month of a term that ends before the next election, or with the game. */
export function termEnd(next: number | null, maxMonths: number): number {
  return next === null ? maxMonths : next - 1;
}
