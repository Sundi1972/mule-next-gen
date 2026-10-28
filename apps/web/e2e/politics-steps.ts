/**
 * Steps shared by the e2e scripts on a table that plays politics. Scripts import these; only scripts run.
 */
import { ceremonyBeats, GAME, POLITICS, type ElectionResult } from '@mule/engine';
import { errors as playwrightErrors, type Page } from 'playwright';

/** How long a press may take to land. */
export const PRESS_MS = 2_000;

/** The most votes a voter can carry in month 1, from POLITICS.weight; its election comes before any land is owned. */
const { base, repVotes, baronVotes, taxCap } = POLITICS.weight;
const MONTH_1_MAX_WEIGHT = base + repVotes + baronVotes + taxCap;

/**
 * The longest month 1's election runs, in game ms, when every phone is Ready as each stage opens: an AI seat's
 * longest pause in announce and again in the ballot, then the longest ceremony a full table can have: every seat
 * running for every office, every voter at a weight no month 1 voter reaches, and every office tied.
 */
export const ELECTION_WAIT_MS = (() => {
  const seats = Array.from({ length: GAME.maxPlayers }, (_, i) => `s${i}`);
  // One voter per seat, each at that weight, split evenly: every block the office can show, and a tie.
  const race = { winner: seats[0]!, how: 'lot' as const, tallies: seats.map((id) => ({ id, votes: MONTH_1_MAX_WEIGHT })) };
  const result: ElectionResult = Object.fromEntries(POLITICS.offices.map((office) => [office, race]));
  return 2 * POLITICS.ai.actMs[1] + ceremonyBeats(seats, result).total;
})();

/**
 * Month 1's "I'm ready" on a table that plays politics: presses ready, which is Done in announce and the ballot,
 * through the ceremony, until the phone leaves planning. Used by smoke.ts and zoom.ts, whose phones only want to get
 * to the land grant.
 */
export async function readyThroughTheElection(phone: Page, timeout: number): Promise<void> {
  const ready = phone.locator('[data-phase=planning] [data-testid=ready]:not([disabled])');
  const over = phone.locator('[data-phase]:not([data-phase=planning])');
  const deadline = Date.now() + timeout;
  for (;;) {
    await ready.or(over).first().waitFor({ timeout: Math.max(1, deadline - Date.now()) });
    if (await over.count()) return;
    try {
      await ready.click({ timeout: PRESS_MS });
      // Done keeps the button enabled for the next stage; Ready after the election disables it.
      await ready.waitFor({ state: 'hidden', timeout: PRESS_MS / 4 });
    } catch (err) {
      if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    }
  }
}
