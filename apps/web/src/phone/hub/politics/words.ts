import { POLITICS, type CanRun, type ElectionHow, type Office } from '@mule/engine';
import type { ElectionView } from '@mule/protocol';

/** The offices in the order every screen lists them. */
export const OFFICES: readonly Office[] = ['governor', 'sheriff'];

export const OFFICE_NAME: Record<Office, string> = { governor: 'Governor', sheriff: 'Sheriff' };

/** Why the run button for an office is refused, from the view's canRun. */
export function whyNot(reason: Exclude<CanRun, true>): string {
  return reason === 'closed' ? 'Candidates are closed' : `${POLITICS.maxGovernorTermsInRow} Governor terms in a row`;
}

/** How an office was won, as the reveal says it. `baron` is the Land Baron's name. */
export function howWon(office: Office, how: ElectionHow, baron: string | null): string {
  switch (how) {
    case 'votes':
      return 'Won on votes.';
    case 'unopposed':
      return 'Elected unopposed: no ballot for this office.';
    case 'appointed':
      return office === 'sheriff' ? 'Nobody ran: the richest player who isn’t Governor is appointed.' : 'Nobody ran: the richest player is appointed.';
    case 'baron':
      return baron ? `A tie: ${baron}, the Land Baron, broke it.` : 'A tie: the Land Baron broke it.';
    case 'tieRule':
      return 'Tied: most plots wins, then seat order.';
  }
}

/** Whole seconds left on the reveal's countdown, while the view still withholds the result. */
export function revealCountdown(election: Pick<ElectionView, 'seconds'>): number {
  return Math.max(0, Math.ceil(election.seconds - (POLITICS.revealMs - POLITICS.revealCountdownMs) / 1_000));
}

/** "0:14". */
export function clock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A change in percentage points: "+3", "-2", "±0". */
export function change(points: number): string {
  return points === 0 ? '±0' : points > 0 ? `+${points}` : `${points}`;
}

/** The last month of a term that ends before the next election, or with the game. */
export function termEnd(next: number | null, maxMonths: number): number {
  return next === null ? maxMonths : next - 1;
}
