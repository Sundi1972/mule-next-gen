/** The TV's month end as the table sees it since PR-5: the grounds opener first (politics on), then TvMonthEnd. */
import type { Locator, Page } from 'playwright';
import { OPENER_MS } from '../../../packages/ui/src/grounds/opener';
import { PRESS_MS } from './politics-steps';

/** Past the opener's own length: the TV notices the event show's end on a 200 ms poll, and a loaded machine is slower. */
const OPENER_MARGIN_MS = 2_000;
/** The month end's event show plays before the opener, on the server clock; its length depends on the events fired. */
const EVENT_SHOW_MS = 30_000;

/**
 * Waits for TvMonthEnd on the TV and returns it. When the grounds opener comes up first, it waits out any event show
 * over it and then the opener's longest run. `arrive` bounds how long the TV may take to reach the month end at all.
 */
export async function theTvMonthEnd(tv: Page, arrive = PRESS_MS): Promise<Locator> {
  const opener = tv.getByTestId('tv-grounds-opener');
  const end = tv.getByTestId('tv-monthend');
  await opener.or(end).first().waitFor({ timeout: arrive });
  if ((await opener.count()) > 0) {
    await tv.getByTestId('tv-event-overlay').waitFor({ state: 'hidden', timeout: EVENT_SHOW_MS });
    await opener.waitFor({ state: 'detached', timeout: Math.max(OPENER_MS.full, OPENER_MS.still) + OPENER_MARGIN_MS });
  }
  await end.waitFor({ timeout: PRESS_MS });
  return end;
}
