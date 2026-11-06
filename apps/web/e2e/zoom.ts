/**
 * Local only, never in CI (lean CI rule 6): B-AC-9 (WS4, plot look A) on the zoomed phone, on the land grant's map. Once
 * the phone has claimed a plot, and with the grant held on, a double-tap on that plot zooms the map to the phone's land,
 * and every owned plot's marks keep their shares of the zoomed plot as drawn on screen, not scaled twice.
 *
 * T-AC-9, "one tap on the development map selects at once", retired with that map: development became the arcade in
 * 02bb0500, and the land grant's map, the only zoomable one left, has no tap to select.
 */
import { GAME } from '@mule/engine';
import { errors as playwrightErrors, type Locator, type Page } from 'playwright';
import { check, CLAIM_MS, held, launch, PHONE, SHOWN_MS, startServer } from './harness';
import { ELECTION_WAIT_MS, readyThroughTheElection } from './politics-steps';
import { checkPlotLook, watchIntents } from './table-steps';

const PHASE_SCALE = 0.5;
const SEATS = 6;
const OWN = /owned by player 1\b/;

const SEED = seedFrom(process.env.MULE_E2E_SEED);
const { server, base } = await startServer({ maxMonths: 1, phaseScale: PHASE_SCALE, seed: () => SEED });
const browser = await launch();
const errors: string[] = [];
try {
  const phone = await (await browser.newContext(PHONE)).newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  const intents = watchIntents(phone);

  await phone.goto(base);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
  for (let i = 1; i < SEATS; i++) await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(SEATS - 1).waitFor();
  await phone.getByRole('button', { name: 'Start game' }).click();
  await readyThroughTheElection(phone, PHASE_SCALE * ELECTION_WAIT_MS + SHOWN_MS);
  const grant = phone.locator('[data-phase=landGrant]');
  await grant.getByRole('button', { name: /CLAIM/ }).waitFor({ timeout: SHOWN_MS });
  console.log(`plots, zoomed: ${await claimThenCheckZoomedPlotLook(phone, grant, code, intents)}`);

  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e zoom: ok (seed ${SEED})`);
} catch (err) {
  console.error(`e2e zoom: FAILED (seed ${SEED})`);
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
// Rooms keep their phase timers running; the test is over, so stop here.
process.exit(0);

/**
 * Claims the lit plot with the room held, so the grant can't run out or move on under the double-tap, then checks the
 * zoomed look. The hold also stops the light, so a lit plot an AI took just before the hold can't be claimed: let go,
 * wait for the next free one, and try again.
 */
async function claimThenCheckZoomedPlotLook(phone: Page, grant: Locator, code: string, intents: () => number): Promise<string> {
  const free = grant.locator('[data-testid=claim]:not([disabled])');
  const sent = intents();
  const deadline = Date.now() + CLAIM_MS;
  for (;;) {
    check(Date.now() < deadline, `B-AC-9 (WS4, plot look A, zoomed phone): no free plot could be claimed in the land grant within ${CLAIM_MS} ms`);
    await free.waitFor({ timeout: Math.max(1, deadline - Date.now()) });
    const read = await held(server, code, async () => {
      if (!(await claimLit(grant, free))) return null;
      return { line: await checkZoomedPlotLook(phone, grant, intents() - sent) };
    });
    if (read) return read.line;
  }
}

/** Presses CLAIM once; true if the claim landed. False if the lit plot went to an AI before the press reached it. */
async function claimLit(grant: Locator, free: Locator): Promise<boolean> {
  const unclaimed = grant.getByText(`${GAME.claimsPerGrant} OF ${GAME.claimsPerGrant} CLAIMS LEFT`, { exact: true });
  try {
    await free.click({ timeout: SHOWN_MS / 2 });
    await unclaimed.waitFor({ state: 'hidden', timeout: SHOWN_MS / 2 });
    return true;
  } catch (err) {
    if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    return false;
  }
}

/**
 * B-AC-9 (WS4, plot look A) on the zoomed phone: with the land grant still on, a double-tap on your plot zooms to your
 * land, and the owned plots' borders, tints and tabs (and any installed good's disc) are the same shares of the zoomed
 * plot on screen as on the whole map. The grant's map has a lit cursor but no selection, so there is no ring or pin.
 */
async function checkZoomedPlotLook(phone: Page, grant: Locator, claimIntents: number): Promise<string> {
  check(claimIntents >= 1, `land grant: the phone's claim went out on the wire as an intent, ${claimIntents} sent`);
  check((await grant.count()) > 0, 'B-AC-9 (WS4, plot look A, zoomed phone): the land grant is still on after the claim (gone means the phone\'s was the last claim)');
  const map = grant.getByTestId('map-viewport');
  const mine = map.locator('[data-testid^="map-plot-"][aria-label*="owned by player 1"]');
  await mine.first().waitFor({ timeout: SHOWN_MS });
  const label = (await mine.first().getAttribute('aria-label')) ?? '';
  check(OWN.test(label), `B-AC-9 (WS4, plot look A, zoomed phone): the phone owns a plot to double-tap, got "${label}"`);
  const box = await mine.first().boundingBox({ timeout: SHOWN_MS });
  check(box, 'B-AC-9 (WS4, plot look A, zoomed phone): the plot to double-tap is on screen');
  await phone.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await phone.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await zoomedIn(map);
  return checkPlotLook(map, 'zoomed phone, land grant', { installed: false });
}

/** Waits for the map to show zoomed and finish easing in. */
async function zoomedIn(viewport: Locator): Promise<void> {
  const map = viewport.locator('[data-testid=map][data-zoomed=yes]');
  await map.waitFor({ timeout: 2_000 });
  await map.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)), undefined, { timeout: 2_000 });
}

/** The game's seed: MULE_E2E_SEED when set, a fresh random one otherwise. */
function seedFrom(value: string | undefined): number {
  if (value === undefined) return Math.floor(Math.random() * 2 ** 31);
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(Number.isSafeInteger(n) && n >= 0)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}
