/**
 * B-AC-6: in the lobby the host kicks a phone and an AI, a player leaves, and the host closes the table.
 * Every removed phone lands on the start screen with the reason. Run with `pnpm --filter @mule/web e2e`.
 */
import type { Locator, Page } from 'playwright';
import { check, launch, PHONE, startServer, TV } from './harness';

const SHOWN_MS = 5_000;
/** Longer than the client's first reconnect pause, so a phone that tried to come back would be seen. */
const STAYS_GONE_MS = 1_500;
/** Time for a message a cancelled confirm wrongly sent to come back as a change. */
const CANCEL_SETTLE_MS = 500;
const KICKED = 'The host removed you from the table';
const CLOSED = 'The host closed the table';

const started = Date.now();
const { server, base } = await startServer();
const browser = await launch();
const errors: string[] = [];
try {
  const host = await phone('host');
  await host.goto(base);
  await host.getByPlaceholder('Heiko').fill('Heiko');
  await host.getByRole('button', { name: 'Start a new game' }).click();
  check(await shows(host.getByText("You're at the table")), 'B-AC-6: the host is at the table');
  const code = (await host.getByTestId('room-code').textContent())?.trim() ?? '';
  check(/^[A-Z]{4}$/.test(code), `B-AC-6: room code, got "${code}"`);
  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  await tv.goto(`${base}/table?room=${code}`);

  const mia = await joinRoom(await phone('mia'), code, 'Mia');
  check(await shows(seat(host, 'Mia')), 'B-AC-6: Mia joins the host\'s seat rail');
  check(await shows(host.getByTestId('kick-s2')), 'B-AC-6: the host has a kick control on Mia\'s seat');
  check(await shows(host.getByTestId('host-tools').getByTestId('close-room')), 'B-AC-6: the host has a close control among the host tools');
  check(await shows(seat(mia, 'Heiko')), 'B-AC-6: Mia sees the host in her seat rail');
  check((await mia.locator('[data-testid^=kick-]').count()) === 0, 'B-AC-6: a non-host phone has no kick control');
  check((await mia.getByTestId('close-room').count()) === 0 && (await mia.getByTestId('host-tools').count()) === 0, 'B-AC-6: a non-host phone has no close control and no host tools');

  await host.getByTestId('kick-s2').click();
  check(await shows(host.getByTestId('host-dialog').getByText('Remove Mia?')), 'B-AC-6: the kick control asks "Remove Mia?" first');
  check(await host.getByTestId('host-dialog-cancel').evaluate((el) => el === document.activeElement), 'B-AC-6: the confirm puts focus on Cancel');
  await host.getByTestId('host-dialog-cancel').click();
  check(await gone(host.getByTestId('host-dialog')), 'B-AC-6: Cancel closes the confirm');
  await host.waitForTimeout(CANCEL_SETTLE_MS);
  check((await seat(host, 'Mia').count()) === 1 && (await mia.getByText("You're at the table").count()) === 1, 'B-AC-6: Cancel on the kick confirm removes nobody');

  await kick(host, 's2');
  check(await shows(mia.getByText(KICKED)), `B-AC-6: the kicked phone shows "${KICKED}"`);
  check(await onStartScreen(mia), 'B-AC-6: the kicked phone is on the start screen');
  check(await gone(seat(host, 'Mia')), 'B-AC-6: the host\'s seat rail loses Mia');
  await host.waitForTimeout(STAYS_GONE_MS);
  check((await seat(host, 'Mia').count()) === 0 && (await onStartScreen(mia)), 'B-AC-6: the kicked phone stays out: it does not rejoin by itself');

  await host.getByTestId('add-ai').click();
  check(await shows(host.getByTestId('kick-s3')), 'B-AC-6: the AI joins with a kick control');
  await kick(host, 's3');
  check(await gone(host.getByTestId('kick-s3')), 'B-AC-6: the host\'s seat rail loses the AI');
  check((await rail(host).count()) === 1, `B-AC-6: only the host is left, got ${await rail(host).count()} seats`);

  const jonas = await joinRoom(await phone('jonas'), code, 'Jonas');
  check(await shows(seat(host, 'Jonas')), 'B-AC-6: Jonas joins the host\'s seat rail');
  await host.getByTestId('kick-s4').click();
  check(await shows(host.getByTestId('host-dialog').getByText('Remove Jonas?')), 'B-AC-6: the host is asked "Remove Jonas?"');
  await jonas.getByRole('button', { name: 'Leave table' }).click();
  check(await onStartScreen(jonas), 'B-AC-6: Jonas is back on the start screen after leaving');
  check(await gone(seat(host, 'Jonas')), 'B-AC-6: the seat rail loses Jonas when he leaves: no AWAY seat is left');
  check(await gone(host.getByTestId('host-dialog')), 'B-AC-6: the host\'s question about Jonas goes with his seat');
  check((await rail(host).getByText('AWAY').count()) === 0, 'B-AC-6: no AWAY seat in the host\'s rail');

  await mia.getByPlaceholder('Heiko').fill('Mia');
  await mia.getByRole('button', { name: `Join game ${code}` }).click();
  check(await shows(seat(host, 'Mia')), 'B-AC-6: a kicked player can join again by code, as a newcomer');

  await host.getByTestId('close-room').click();
  check(await shows(host.getByTestId('host-dialog').getByText('Close the room?')), 'B-AC-6: the close control asks "Close the room?" first');
  await host.getByTestId('host-dialog-cancel').click();
  check(await gone(host.getByTestId('host-dialog')), 'B-AC-6: Cancel closes the close confirm');
  await host.waitForTimeout(CANCEL_SETTLE_MS);
  check(
    (await host.getByText("You're at the table").count()) === 1 && (await mia.getByText("You're at the table").count()) === 1 && (await seat(host, 'Mia').count()) === 1,
    'B-AC-6: Cancel on the close confirm keeps the room',
  );

  await host.getByTestId('close-room').click();
  await host.getByTestId('close-confirm').click();
  for (const [who, page] of [['host', host], ['Mia', mia]] as const) {
    check(await shows(page.getByText(CLOSED)), `B-AC-6: ${who} shows "${CLOSED}"`);
    check(await onStartScreen(page), `B-AC-6: ${who} is on the start screen after the close`);
  }
  check(await shows(tv.getByText("Type the room code shown on the host's phone.")), 'B-AC-6: the TV goes back to its room picker');

  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e lobby: ok (room ${code}, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
} catch (err) {
  console.error('e2e lobby: FAILED');
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);

async function phone(who: string): Promise<Page> {
  const page = await (await browser.newContext(PHONE)).newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  return page;
}

async function joinRoom(page: Page, code: string, name: string): Promise<Page> {
  await page.goto(`${base}/?room=${code}`);
  await page.getByPlaceholder('Heiko').fill(name);
  await page.getByRole('button', { name: `Join game ${code}` }).click();
  await page.getByText("You're at the table").waitFor();
  return page;
}

function rail(page: Page): Locator {
  return page.getByTestId('seats').locator('li');
}

function seat(page: Page, name: string): Locator {
  return page.getByTestId('seats').getByText(name, { exact: true });
}

/** The host removes a seat: the kick control asks first, and only Remove sends. */
async function kick(host: Page, seatId: string): Promise<void> {
  await host.getByTestId(`kick-${seatId}`).click();
  await host.getByTestId('kick-confirm').click();
}

/** The start screen: the name field, and no table. */
async function onStartScreen(page: Page): Promise<boolean> {
  return (await shows(page.getByPlaceholder('Heiko'))) && (await page.getByText("You're at the table").count()) === 0;
}

function shows(locator: Locator): Promise<boolean> {
  return locator.waitFor({ timeout: SHOWN_MS }).then(
    () => true,
    () => false,
  );
}

function gone(locator: Locator): Promise<boolean> {
  return locator.waitFor({ state: 'detached', timeout: SHOWN_MS }).then(
    () => true,
    () => false,
  );
}
