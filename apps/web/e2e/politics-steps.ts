/**
 * Steps shared by the e2e scripts on a table that plays politics. Scripts import these; only scripts run.
 */
import { POLITICS } from '@mule/engine';
import { errors as playwrightErrors, type Page } from 'playwright';

/** How long a press may take to land. */
export const PRESS_MS = 2_000;

/**
 * The longest month 1's election runs, in game ms, when every phone is Ready as each stage opens: an AI seat's
 * longest pause in announce and again in the ballot, then the whole ceremony, every office with its bars.
 */
export const ELECTION_WAIT_MS =
  2 * POLITICS.ai.actMs[1] + POLITICS.offices.length * (POLITICS.ceremony.introMs + POLITICS.ceremony.barsMs + POLITICS.ceremony.winnerMs);

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
