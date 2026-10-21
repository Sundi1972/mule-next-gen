/**
 * B-AC-6: in the lobby the host kicks a phone and an AI, a player leaves, and the host closes the table.
 * B-AC-7 (lobby): a player and the host each move their seat to another device with a one-time link.
 * Every removed phone lands on the start screen with the reason. Run with `pnpm --filter @mule/web e2e`.
 */
import QRCode from 'qrcode';
import type { Locator, Page } from 'playwright';
import { check, launch, PHONE, startServer, TV } from './harness';

const SHOWN_MS = 5_000;
/** Longer than the client's first reconnect pause, so a phone that tried to come back would be seen. */
const STAYS_GONE_MS = 1_500;
/** Time for a message a cancelled confirm wrongly sent to come back as a change. */
const CANCEL_SETTLE_MS = 500;
const KICKED = 'The host removed you from the table';
const CLOSED = 'The host closed the table';
const MOVED = "You're playing on another device now";
const EXPIRED = 'That link has expired';

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

  // B-AC-7 (lobby): Mia moves from her laptop to her phone.
  await mia.getByText("You're at the table").waitFor();
  await mia.getByTestId('species-glimmer').click();
  check(await shows(mia.locator('[data-testid=species-glimmer][aria-pressed=true]')), 'B-AC-7 (lobby): Mia picks the Glimmer on her first device');
  check((await mia.getByTestId('host-to-phone').count()) === 0, 'B-AC-7 (lobby): a non-host has no host-to-phone');
  check((await host.getByTestId('move-to-phone').count()) === 0, 'B-AC-7 (lobby): the host has no move-to-phone');
  const seatsBefore = await rail(host).count();

  await mia.getByTestId('move-to-phone').click();
  const miaDialog = mia.getByTestId('host-dialog');
  check(await shows(miaDialog.getByText('Move to your phone', { exact: true })), 'B-AC-7 (lobby): move-to-phone opens "Move to your phone"');
  check(await shows(miaDialog.getByText('you, Mia', { exact: true })), 'B-AC-7 (lobby): the dialog says the phone becomes "you, Mia"');
  const miaLink = await qrLink(miaDialog);
  checkLink(miaLink, code, await seatToken(mia), 'Mia');
  await miaDialog.getByRole('button', { name: 'Done' }).click();
  check(await gone(miaDialog), 'B-AC-7 (lobby): Done closes the dialog');

  const miaPhone = await phone('mia-phone');
  await miaPhone.goto(miaLink);
  check(await shows(miaPhone.getByText("You're at the table")), 'B-AC-7 (lobby): the second device opens the link and lands in the lobby');
  check(await shows(miaPhone.getByTestId('seat-mine').getByText('Mia (you)')), 'B-AC-7 (lobby): the second device is Mia');
  check(await shows(miaPhone.locator('[data-testid=species-glimmer][aria-pressed=true]')), "B-AC-7 (lobby): the second device keeps Mia's Glimmer");
  check(!miaPhone.url().includes('handoff='), `B-AC-7 (lobby): the address bar drops handoff=, got ${miaPhone.url()}`);
  check(await shows(mia.getByText(MOVED)), `B-AC-7 (lobby): the first device shows "${MOVED}"`);
  check(await onStartScreen(mia), 'B-AC-7 (lobby): the first device steps aside to the start screen');
  await host.waitForTimeout(STAYS_GONE_MS);
  check((await seat(host, 'Mia').count()) === 1 && (await rail(host).count()) === seatsBefore, "B-AC-7 (lobby): the host's rail shows Mia exactly once, and no new seat");
  check(await onStartScreen(mia), 'B-AC-7 (lobby): the first device stays out: it does not rejoin by itself');

  // A tab beside Mia's phone: it holds her saved seat for this room, and the link must still win over it.
  const again = await miaPhone.context().newPage();
  again.on('pageerror', (e) => errors.push(`again: ${e.message}`));
  await again.goto(miaLink);
  check(await shows(again.getByTestId('removed-notice').getByText(EXPIRED)), `B-AC-7 (lobby): the same link opened again shows "${EXPIRED}" on the start screen`);
  check(await onStartScreen(again), 'B-AC-7 (lobby): the used link wins over the seat saved for this room: the tab stays on the start screen');
  await host.waitForTimeout(CANCEL_SETTLE_MS);
  check(
    (await seat(host, 'Mia').count()) === 1 && (await rail(host).count()) === seatsBefore && (await miaPhone.getByText("You're at the table").count()) === 1,
    "B-AC-7 (lobby): the used link does not move the seat: the rail is unchanged and Mia's phone keeps it",
  );

  // B-AC-7 (lobby): the host moves too, and keeps the host's tools.
  await host.getByTestId('host-tools').getByTestId('host-to-phone').click();
  const hostDialog = host.getByTestId('host-dialog');
  check(await shows(hostDialog.getByText('Move the host to your phone', { exact: true })), 'B-AC-7 (lobby): host-to-phone opens "Move the host to your phone"');
  check(await shows(hostDialog.getByText('you, Heiko, the host', { exact: true })), 'B-AC-7 (lobby): the dialog says the phone becomes "you, Heiko, the host"');
  const hostLink = await qrLink(hostDialog);
  checkLink(hostLink, code, await seatToken(host), 'the host');
  const hostPhone = await phone('host-phone');
  await hostPhone.goto(hostLink);
  check(await shows(hostPhone.getByTestId('seat-mine').getByText('Heiko (you)')), "B-AC-7 (lobby): the host's new device is Heiko");
  check(await shows(hostPhone.getByTestId('host-tools')), "B-AC-7 (lobby): the host's new device has the host tools");
  check(await shows(host.getByText(MOVED)), `B-AC-7 (lobby): the host's first device shows "${MOVED}"`);
  check(await onStartScreen(host), "B-AC-7 (lobby): the host's first device steps aside to the start screen");
  check(
    (await rail(hostPhone).count()) === seatsBefore && (await hostPhone.getByTestId('seats').getByText(/^Heiko/).count()) === 1,
    'B-AC-7 (lobby): the host moved without adding a seat: Heiko is in the rail once',
  );

  await hostPhone.getByTestId('close-room').click();
  check(await shows(hostPhone.getByTestId('host-dialog').getByText('Close the room?')), 'B-AC-6: the close control asks "Close the room?" first');
  await hostPhone.getByTestId('host-dialog-cancel').click();
  check(await gone(hostPhone.getByTestId('host-dialog')), 'B-AC-6: Cancel closes the close confirm');
  await hostPhone.waitForTimeout(CANCEL_SETTLE_MS);
  check(
    (await hostPhone.getByText("You're at the table").count()) === 1 && (await miaPhone.getByText("You're at the table").count()) === 1 && (await seat(hostPhone, 'Mia').count()) === 1,
    'B-AC-6: Cancel on the close confirm keeps the room',
  );

  await hostPhone.getByTestId('close-room').click();
  await hostPhone.getByTestId('close-confirm').click();
  for (const [who, page] of [['host', hostPhone], ['Mia', miaPhone]] as const) {
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

/** The link a dialog's QR carries. The drawn cells must encode exactly that text, so a scan opens it. */
async function qrLink(dialog: Locator): Promise<string> {
  const qr = dialog.locator('svg[data-text]');
  check(await shows(qr), 'B-AC-7 (lobby): the dialog shows a QR');
  const text = (await qr.getAttribute('data-text')) ?? '';
  const drawn = await qr.evaluate((svg) => Array.from(svg.querySelectorAll('rect'), (r) => `${r.getAttribute('x')},${r.getAttribute('y')}`).join(' '));
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const encoded = Array.from(modules.data, (on, i) => (on ? `${i % modules.size},${Math.floor(i / modules.size)}` : ''))
    .filter(Boolean)
    .join(' ');
  check(text !== '' && drawn === encoded, `B-AC-7 (lobby): the QR draws its link "${text}"`);
  return text;
}

/** The seat token this device keeps for itself. */
function seatToken(page: Page): Promise<string> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('mule-seat') ?? '{}') as { token?: string }).token ?? '');
}

/** The move link names the room and a one-time code, never the device's own seat token. */
function checkLink(link: string, code: string, token: string, who: string): void {
  const url = new URL(link);
  check([...url.searchParams.keys()].sort().join(',') === 'handoff,room', `B-AC-7 (lobby): ${who}'s link carries only room and handoff, got ${url.search}`);
  check(url.searchParams.get('room') === code, `B-AC-7 (lobby): ${who}'s link names room ${code}, got ${url.search}`);
  const handoff = url.searchParams.get('handoff') ?? '';
  check(token !== '' && handoff !== '' && handoff !== token && !link.includes(token), `B-AC-7 (lobby): ${who}'s link carries a handoff code, not the seat token`);
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
