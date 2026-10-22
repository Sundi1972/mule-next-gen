/**
 * The phone lobby against the real server. B-AC-6: the host kicks a phone and an AI, a player leaves, and the host
 * closes the table. B-AC-7 (lobby): a player and the host each move their seat to another device with a one-time
 * link. Every removed phone lands on the start screen with the reason. B-AC-13: the "make your colonist" lobby at a
 * phone's and a laptop's size. B-AC-8: a picked colour follows the player into the game. B-AC-7 (in game): that
 * player then moves to another device mid-game. Run with
 * `pnpm --filter @mule/web e2e`.
 */
import { COLOUR_NAME, SPECIES, type Slot } from '@mule/ui';
import QRCode from 'qrcode';
import type { BrowserContextOptions, Locator, Page } from 'playwright';
import { PHASE_MS } from '../../server/src/mule-game.js';
import { check, claimAPlot, launch, PHONE, startServer, TV } from './harness';

const SHOWN_MS = 5_000;
/** Longer than the client's first reconnect pause, so a phone that tried to come back would be seen. */
const STAYS_GONE_MS = 1_500;
/** Time for a message a cancelled confirm wrongly sent to come back as a change. */
const CANCEL_SETTLE_MS = 500;
const KICKED = 'The host removed you from the table';
const CLOSED = 'The host closed the table';
const MOVED = "You're playing on another device now";
const EXPIRED = 'That link has expired';
const LAPTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 } };
/** The rail's width in the wide layout, which applies from a shell width of 1100 px (HC-8). */
const WIDE_RAIL_PX = 400;
const NARROWED_SHELL_PX = 1000;
/** The hero's width in the wide layout; the phone layout's is far narrower. */
const WIDE_HERO_PX = 360;
const PHASE_SCALE = 0.1;
const within = (ms: number) => ms * PHASE_SCALE + 3_000;
/** A land auction, when the month has one, runs on its own clock: PHASE_MS has no entry for it. */
const LAND_AUCTION_ALLOWANCE_MS = 20_000;
/** Just past a move code's 2 minutes (RULE-6). */
const PAST_HANDOFF_EXPIRY = '02:01';

const EVERYONE_IDS = [
  'lobby', 'hero', 'hero-name', 'hero-perk', 'species-pick', 'colour-pick', 'seats', 'guide', 'room-card', 'room-code', 'room-qr', 'now', 'now-title', 'now-steps',
  ...SPECIES.map((sp) => `species-${sp}`),
  ...[0, 1, 2, 3, 4, 5].map((c) => `colour-${c}`),
];
const HOST_IDS = ['host-tools', 'host-to-phone', 'close-room', 'add-ai', 'start-game'];

const started = Date.now();
const { server, base } = await startServer();
// B-AC-8 plays on into the land grant, so its table runs a fast clock.
const fast = await startServer({ phaseScale: PHASE_SCALE });
const browser = await launch();
const errors: string[] = [];
/** Failed checks that need the room to take a colour (RULE-7): collected, so the checks after them still run. */
const colourRoomReds: string[] = [];
try {
  await kickLeaveAndClose();
  await colonistLobby(PHONE, '844x390', false);
  await colonistLobby(LAPTOP, '1440x900', true);
  await colourIntoTheGame();
  check(colourRoomReds.length === 0, `the room takes picked colours:\n  ${colourRoomReds.join('\n  ')}`);
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e lobby: ok (${((Date.now() - started) / 1000).toFixed(1)} s)`);
} catch (err) {
  console.error('e2e lobby: FAILED');
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  if (colourRoomReds.length > 0) console.error(`room colour checks that failed before this:\n  ${colourRoomReds.join('\n  ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
  await fast.server.close();
}
process.exit(0);

async function kickLeaveAndClose(): Promise<void> {
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

  const mia = await joinRoom(await phone('mia'), base, code, 'Mia');
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

  const jonas = await joinRoom(await phone('jonas'), base, code, 'Jonas');
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
  const miaColour = await pressedColour(mia);
  check((await mia.getByTestId('host-to-phone').count()) === 0, 'B-AC-13 (handoff): a non-host has no host-to-phone');
  check((await host.getByTestId('move-to-phone').count()) === 0, 'B-AC-13 (handoff): the host has no move-to-phone');
  const seatsBefore = await rail(host).count();

  await mia.getByTestId('move-to-phone').click();
  const miaDialog = mia.getByRole('dialog', { name: 'Move to your phone' });
  check(await shows(miaDialog.locator('[data-testid=handoff-qr][data-state=ready]')), 'B-AC-7 (lobby): move-to-phone opens "Move to your phone" with a ready code');
  check(await shows(miaDialog.getByText('you, Mia', { exact: true })), 'B-AC-7 (lobby): the dialog says the phone becomes "you, Mia"');
  const miaLink = await qrLink(miaDialog);
  checkLink(miaLink, code, await seatToken(mia), 'Mia');
  await miaDialog.getByRole('button', { name: 'Done' }).click();
  check(await gone(miaDialog), 'B-AC-7 (lobby): Done closes the dialog');

  const miaPhone = await phone('mia-phone');
  await miaPhone.goto(miaLink);
  check(await shows(miaPhone.getByText("You're at the table")), 'B-AC-7 (lobby): the second device opens the link and lands in the lobby');
  check(await shows(seat(miaPhone, 'Mia (you)')), 'B-AC-7 (lobby): the second device is Mia');
  check((await miaPhone.getByTestId('hero-name').textContent())?.trim() === 'Mia', "B-AC-7 (lobby): the second device's colonist is Mia");
  check(await shows(miaPhone.locator('[data-testid=species-glimmer][aria-pressed=true]')), "B-AC-7 (lobby): the second device keeps Mia's Glimmer");
  check(miaColour !== null && (await pressedColour(miaPhone)) === miaColour, `B-AC-7 (lobby): the second device keeps Mia's colour ${miaColour}`);
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
  await host.getByTestId('close-room').click();
  check(await shows(host.getByTestId('host-dialog').getByText('Close the room?')), 'B-AC-6: the close control asks "Close the room?" first');
  check(await host.getByTestId('host-dialog-cancel').evaluate((el) => el === document.activeElement), 'B-AC-6: the close confirm puts focus on Cancel');
  await host.getByTestId('host-dialog-cancel').click();
  check(await gone(host.getByTestId('host-dialog')), 'B-AC-6: Cancel closes the close confirm');
  await host.waitForTimeout(CANCEL_SETTLE_MS);
  check(
    (await seat(host, 'Mia').count()) === 1 && (await rail(host).count()) === seatsBefore && (await miaPhone.getByText("You're at the table").count()) === 1,
    "B-AC-7 (lobby): the used link does not move the seat: the rail is unchanged and Mia's phone keeps it",
  );

  // B-AC-7 (lobby): the host moves too, and keeps the host's tools.
  await host.getByTestId('host-tools').getByTestId('host-to-phone').click();
  const hostDialog = host.getByRole('dialog', { name: 'Move the host to your phone' });
  check(await shows(hostDialog.locator('[data-testid=handoff-qr][data-state=ready]')), 'B-AC-7 (lobby): host-to-phone opens "Move the host to your phone" with a ready code');
  check(await shows(hostDialog.getByText('you, Heiko, the host', { exact: true })), 'B-AC-7 (lobby): the dialog says the phone becomes "you, Heiko, the host"');
  const hostLink = await qrLink(hostDialog);
  checkLink(hostLink, code, await seatToken(host), 'the host');
  const hostPhone = await phone('host-phone');
  await hostPhone.goto(hostLink);
  check(await shows(seat(hostPhone, 'Heiko (you)')), "B-AC-7 (lobby): the host's new device is Heiko");
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
}

/** B-AC-13 at one size: four seats, Heiko hosting, Lena on her phone. */
async function colonistLobby(size: BrowserContextOptions, label: string, wide: boolean): Promise<void> {
  const tag = `B-AC-13 (${label})`;
  const heiko = await phone(`heiko ${label}`, size);
  const code = await hostRoom(heiko, base);
  const lenaPage = await phone(`lena ${label}`, size);
  // Lena's clock runs in real time until her move code is fast-forwarded past its 2 minutes.
  await lenaPage.clock.install();
  const lena = await joinRoom(lenaPage, base, code, 'Lena');
  await heiko.getByTestId('add-ai').click();
  await heiko.getByTestId('add-ai').click();
  await rail(lena).nth(3).waitFor({ timeout: SHOWN_MS });

  for (const [who, page] of [['Heiko', heiko], ['Lena', lena]] as const) {
    const missing = await missingIds(page, EVERYONE_IDS);
    check(missing.length === 0, `${tag}: ${who} sees the whole lobby, missing ${missing.join(', ')}`);
  }
  const hostMissing = await missingIds(heiko, [...HOST_IDS, 'kick-s2', 'kick-s3', 'kick-s4']);
  check(hostMissing.length === 0, `${tag}: the host sees the host tools and a ✕ on every other seat, missing ${hostMissing.join(', ')}`);
  const lenaHas = [];
  for (const id of [...HOST_IDS, 'host-dialog', 'kick-confirm', 'close-confirm']) if ((await lena.getByTestId(id).count()) > 0) lenaHas.push(id);
  if ((await lena.locator('[data-testid^=kick-]').count()) > 0) lenaHas.push('kick-<seat>');
  check(lenaHas.length === 0, `${tag}: a player who is not the host has none of the host's controls, has ${lenaHas.join(', ')}`);
  check(await heiko.getByTestId('host-tools').getByTestId('host-to-phone').isVisible(), `B-AC-13 (handoff, ${label}): the host's move to the phone is among the host tools`);
  check((await heiko.getByTestId('move-to-phone').count()) === 0, `B-AC-13 (handoff, ${label}): the host has no move-to-phone`);
  check(await lena.getByTestId('move-to-phone').isVisible(), `B-AC-13 (handoff, ${label}): a player who is not the host can move to her phone`);
  check((await lena.getByTestId('hero-name').textContent())?.trim() === 'Lena', `${tag}: Lena's hero is Lena`);
  check((await nowTitle(heiko)) === 'Start when everyone is here', `${tag}: the host's Now, got "${await nowTitle(heiko)}"`);
  check((await nowTitle(lena)) === 'Make your colonist', `${tag}: Lena's Now before she picks, got "${await nowTitle(lena)}"`);
  check((await lena.getByText('Waiting for Heiko to start…').count()) === 1, `${tag}: before she picks, Lena's footer says she waits for Heiko`);
  if (!wide)
    for (const [who, page] of [['the host', heiko], ['a guest', lena]] as const) {
      const where = await qrInRail(page);
      check(where.inside && where.scrollTop === 0, `B-AC-4 (${label}): with no TV, ${who} sees the whole room QR in the rail without scrolling, ${JSON.stringify(where)}`);
    }
  check((await joinCardFirst(heiko)) === !wide, `${tag}: with no TV the join card comes ${wide ? 'after' : 'before'} the seats in the markup`);

  const own = lena.getByTestId('colour-1');
  check((await own.isEnabled()) && (await own.getAttribute('aria-label')) === COLOUR_NAME[1], `${tag}: Lena's own colour is hers to keep, labelled "${await own.getAttribute('aria-label')}"`);
  const heikos = lena.getByTestId('colour-0');
  check(await heikos.isDisabled(), `${tag}: Heiko's colour is disabled for Lena`);
  check((await heikos.getAttribute('aria-label')) === `${COLOUR_NAME[0]}, taken by Heiko`, `${tag}: Heiko's colour names him, got "${await heikos.getAttribute('aria-label')}"`);
  const ai = await aiName(heiko, 's3');
  const aisColour = lena.getByTestId('colour-2');
  check(await aisColour.isEnabled(), `${tag}: an AI's colour can still be taken (RULE-7)`);
  check((await aisColour.getAttribute('aria-label')) === `${COLOUR_NAME[2]}, ${ai}'s: tap to take it`, `${tag}: an AI's colour names the AI, got "${await aisColour.getAttribute('aria-label')}"`);

  await heikos.click({ force: true });
  await lena.waitForTimeout(CANCEL_SETTLE_MS);
  check(
    (await lena.getByTestId('colour-1').getAttribute('aria-pressed')) === 'true' && (await heikos.getAttribute('aria-label')) === `${COLOUR_NAME[0]}, taken by Heiko`,
    `${tag}: Lena cannot pick Heiko's colour`,
  );

  const violet = 4 as Slot;
  await lena.getByTestId(`colour-${violet}`).click();
  colourRoom(await shows(lena.locator(`[data-testid=colour-${violet}][aria-pressed=true]`)), `${tag}: Lena picks ${COLOUR_NAME[violet]} and it is hers`);
  const lenas = heiko.locator(`[data-testid=colour-${violet}][aria-label="${COLOUR_NAME[violet]}, taken by Lena"]`);
  colourRoom((await shows(lenas)) && (await lenas.isDisabled()), `${tag}: the host sees ${COLOUR_NAME[violet]} disabled and naming Lena`);
  check(await shows(lena.getByTestId('now-title').getByText('Wait for Heiko to start', { exact: true })), `${tag}: Lena's Now after she picks, got "${await nowTitle(lena)}"`);
  check(
    (await lena.getByText('Waiting for Heiko to start…').count()) === 0 && (await lena.getByRole('button', { name: 'Leave table' }).count()) === 1,
    `${tag}: once Now says to wait, the footer keeps only Leave table`,
  );

  const kickLena = heiko.getByTestId('kick-s2');
  await kickLena.click();
  check(await shows(heiko.getByRole('dialog', { name: 'Remove Lena?' })), `${tag}: removing Lena asks first, in a dialog named by its question`);
  check(await shows(heiko.getByTestId('kick-confirm')), `${tag}: the removal waits for kick-confirm`);
  await heiko.keyboard.press('Escape');
  check(await gone(heiko.getByTestId('host-dialog')), `${tag}: Escape closes the question`);
  check(await kickLena.evaluate((el) => el === document.activeElement), `${tag}: focus goes back to Lena's ✕`);
  const closeRoom = heiko.getByTestId('close-room');
  await closeRoom.click();
  check(await shows(heiko.getByRole('dialog', { name: 'Close the room?' })), `${tag}: closing the room asks first, in a dialog named by its question`);
  check(await shows(heiko.getByTestId('close-confirm')), `${tag}: the close waits for close-confirm`);
  check(await heiko.getByTestId('host-dialog-cancel').evaluate((el) => el === document.activeElement), `${tag}: the close confirm puts focus on Cancel`);
  await heiko.getByTestId('host-dialog-cancel').click();
  check(await gone(heiko.getByTestId('host-dialog')), `${tag}: Keep it open closes the question`);
  check(await closeRoom.evaluate((el) => el === document.activeElement), `${tag}: focus goes back to Close the room`);
  await heiko.waitForTimeout(CANCEL_SETTLE_MS);
  check((await seat(heiko, 'Lena').count()) === 1 && (await lena.getByTestId('lobby').count()) === 1, `${tag}: Escape and Cancel send nothing`);

  const moveLena = lena.getByTestId('move-to-phone');
  await moveLena.click();
  const moveDialog = lena.getByRole('dialog', { name: 'Move to your phone' });
  check(await shows(moveDialog.locator('[data-testid=handoff-qr][data-state=ready]')), `B-AC-13 (handoff, ${label}): moving to the phone opens a dialog named by its title, with a ready code`);
  const firstLink = await qrLink(moveDialog);
  await lena.clock.fastForward(PAST_HANDOFF_EXPIRY);
  check(
    (await shows(moveDialog.locator('[data-testid=handoff-qr][data-state=expired]'))) && (await shows(moveDialog.getByText('This code has expired.'))),
    `B-AC-13 (handoff, ${label}): after 2 minutes the dialog says "This code has expired."`,
  );
  // Back to real time, so the next code's 2 minutes are counted against the room's clock and not 2 minutes ahead of it.
  await lena.clock.setSystemTime(Date.now());
  await moveDialog.getByTestId('handoff-renew').click();
  check(await shows(moveDialog.locator('[data-testid=handoff-qr][data-state=ready]')), `B-AC-13 (handoff, ${label}): "New code" makes the code ready again`);
  const renewed = await qrLink(moveDialog);
  check(renewed !== firstLink, `B-AC-13 (handoff, ${label}): "New code" draws a different link, got ${renewed}`);
  await lena.keyboard.press('Escape');
  check(await gone(lena.getByTestId('host-dialog')), `B-AC-13 (handoff, ${label}): Escape closes the move dialog`);
  check(await moveLena.evaluate((el) => el === document.activeElement), `B-AC-13 (handoff, ${label}): focus goes back to move-to-phone`);

  const railPx = await railWidth(heiko);
  check(wide ? railPx === WIDE_RAIL_PX : railPx < WIDE_RAIL_PX, `${tag}: the ${wide ? 'wide' : 'phone'} layout, rail ${railPx} px`);
  if (wide) {
    await shellWidth(heiko, `${NARROWED_SHELL_PX}px`);
    const narrowed = await railWidth(heiko);
    const hero = await heiko.getByTestId('hero').evaluate((el) => Math.round(el.getBoundingClientRect().width));
    const rows = await speciesRows(heiko);
    check(
      narrowed < WIDE_RAIL_PX && hero < WIDE_HERO_PX && rows === 1 && (await joinCardFirst(heiko)),
      `${tag}: HC-8, a ${NARROWED_SHELL_PX} px shell in a 1440 px window is the phone layout: rail ${narrowed} px, hero ${hero} px, species in ${rows} row(s), join card first`,
    );
    await shellWidth(heiko, '');
  }

  await lena.context().close();
  check(await shows(rail(heiko).filter({ hasText: 'Lena' }).getByText('AWAY', { exact: true })), `${tag}: the host sees Lena AWAY once her phone has gone`);
  await heiko.context().close();
}

/** B-AC-8: two phones and an AI; phone 1 takes the AI's colour, phone 2 cannot, and the game draws phone 1 in it. */
async function colourIntoTheGame(): Promise<void> {
  const heiko = await phone('heiko B-AC-8');
  const code = await hostRoom(heiko, fast.base);
  const mia = await joinRoom(await phone('mia B-AC-8'), fast.base, code, 'Mia');
  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv B-AC-8: ${e.message}`));
  await tv.goto(`${fast.base}/table?room=${code}`);
  // AIs fill colours 2..5; removing the first three leaves one AI on Rose, a colour no seat's position would give.
  for (let i = 0; i < 4; i++) await heiko.getByTestId('add-ai').click();
  await rail(heiko).nth(5).waitFor({ timeout: SHOWN_MS });
  for (const id of ['s3', 's4', 's5']) {
    await kick(heiko, id);
    await heiko.getByTestId(`kick-${id}`).waitFor({ state: 'detached', timeout: SHOWN_MS });
  }
  const rose = 5 as Slot;
  const ai = await aiName(heiko, 's6');
  check((await nowTitle(mia)) === 'Make your colonist', `B-AC-13: Mia's Now before she picks, got "${await nowTitle(mia)}"`);
  await mia.getByTestId('species-mollox').click();
  check(await shows(mia.getByTestId('now-title').getByText('Wait for Heiko to start', { exact: true })), `B-AC-13: a species pick alone moves Mia's Now on, got "${await nowTitle(mia)}"`);

  const take = heiko.getByTestId(`colour-${rose}`);
  check((await take.isEnabled()) && (await take.getAttribute('aria-label')) === `${COLOUR_NAME[rose]}, ${ai}'s: tap to take it`, `B-AC-8: phone 1 can take ${ai}'s ${COLOUR_NAME[rose]}`);
  await take.click();
  colourRoom(await shows(heiko.locator(`[data-testid=colour-${rose}][aria-pressed=true]`)), `B-AC-8: phone 1 takes ${COLOUR_NAME[rose]}`);
  const heikos = mia.locator(`[data-testid=colour-${rose}][aria-label="${COLOUR_NAME[rose]}, taken by Heiko"]`);
  colourRoom(await shows(heikos), `B-AC-8: phone 2 sees ${COLOUR_NAME[rose]} as Heiko's`);
  const aiNow: Slot[] = [];
  for (const c of [0, 1, 2, 3, 4] as Slot[]) if ((await mia.getByTestId(`colour-${c}`).getAttribute('aria-label')) === `${COLOUR_NAME[c]}, ${ai}'s: tap to take it`) aiNow.push(c);
  colourRoom(aiNow.length === 1, `B-AC-8: ${ai} shows another colour, got ${aiNow.map((c) => COLOUR_NAME[c]).join(', ') || 'none'}`);

  colourRoom((await heikos.count()) === 1 && (await heikos.isDisabled()), `B-AC-8: phone 2's ${COLOUR_NAME[rose]} is disabled`);
  await mia.getByTestId(`colour-${rose}`).click({ force: true });
  await mia.waitForTimeout(CANCEL_SETTLE_MS);
  check((await mia.getByTestId('colour-1').getAttribute('aria-pressed')) === 'true', 'B-AC-8: phone 2 is refused: it keeps its own colour');
  colourRoom((await heikos.count()) === 1, `B-AC-8: phone 2 is refused: ${COLOUR_NAME[rose]} stays Heiko's`);

  const inRose = `[data-slot="${rose}"]`;
  colourRoom(await shows(heikoOn(tv.locator('li')).locator(inRose)), `B-AC-8: the TV lobby draws Heiko's mark in ${COLOUR_NAME[rose]}`);

  await heiko.getByTestId('start-game').click();
  const roster = heikoOn(tv.locator('[data-phase=planning] li, [data-phase=landGrant] li'));
  colourRoom(await shows(roster.locator(inRose)), `B-AC-8: the TV's game roster draws Heiko in ${COLOUR_NAME[rose]}`);
  const grant = heiko.locator('[data-phase=landGrant]');
  await grant.waitFor({ timeout: within(PHASE_MS.planning) });
  await claimAPlot(heiko, within(PHASE_MS.landGrant), 'B-AC-8: phone 1 claims a plot in the land grant');
  const development = tv.locator('[data-phase=development]');
  await development.waitFor({ timeout: within(PHASE_MS.landGrant + PHASE_MS.development) + LAND_AUCTION_ALLOWANCE_MS });
  colourRoom(await shows(heikoOn(development.locator('li')).locator(inRose)), `B-AC-8: the TV's development roster draws Heiko in ${COLOUR_NAME[rose]}`);
  colourRoom(await shows(development.locator(`[aria-label*="owned by"] ${inRose}`).first()), `B-AC-8: the TV map draws Heiko's plot in ${COLOUR_NAME[rose]}`);

  // B-AC-13 (handoff, in game): the game shell's move dialog behaves like the lobby's. Opened once and cancelled.
  const moveHeiko = heiko.getByTestId('move-to-phone');
  check(await shows(moveHeiko), 'B-AC-13 (handoff, in game): the game shell has move-to-phone');
  await moveHeiko.click();
  const gameDialog = heiko.getByRole('dialog', { name: 'Move to your phone' });
  check(await shows(gameDialog.locator('[data-testid=handoff-qr][data-state=ready]')), 'B-AC-13 (handoff, in game): move-to-phone opens "Move to your phone" with a ready code');
  await heiko.keyboard.press('Escape');
  check(await gone(heiko.getByTestId('host-dialog')), 'B-AC-13 (handoff, in game): Escape closes the move dialog');
  check(await moveHeiko.evaluate((el) => el === document.activeElement), 'B-AC-13 (handoff, in game): focus goes back to move-to-phone');

  // B-AC-7 (in game): Heiko moves to another device while the game runs on.
  const was = await playingAs(heiko);
  await moveHeiko.click();
  check(await shows(gameDialog.getByText('you, Heiko', { exact: true })), 'B-AC-7 (in game): the dialog says the phone becomes "you, Heiko"');
  const link = await qrLink(gameDialog, 'B-AC-7 (in game)');
  checkLink(link, code, await seatToken(heiko), 'Heiko', 'B-AC-7 (in game)');
  const second = await phone('heiko B-AC-7 second device');
  await second.goto(link);
  check(await shows(second.getByTestId('game-shell')), 'B-AC-7 (in game): the second device opens the link into the game');
  check((await second.getByTestId('lobby').count()) === 0, 'B-AC-7 (in game): the second device is not in the lobby');
  const is = await playingAs(second);
  check(is.name === 'Heiko', `B-AC-7 (in game): the second device is Heiko, got "${is.name}"`);
  check(is.mark === was.mark, `B-AC-7 (in game): the second device keeps Heiko's species, "${was.mark}", got "${is.mark}"`);
  check(is.slot === String(rose), `B-AC-7 (in game): the second device keeps Heiko's ${COLOUR_NAME[rose]}, got slot ${is.slot}`);
  check(is.money === was.money, `B-AC-7 (in game): the second device has Heiko's money, ${was.money}, got ${is.money}`);
  check(await shows(tv.locator(`[aria-label*="owned by"] ${inRose}`).first()), `B-AC-7 (in game): the TV still draws Heiko's plot in ${COLOUR_NAME[rose]}`);
  check(await shows(heiko.getByText(MOVED)), `B-AC-7 (in game): the first device shows "${MOVED}"`);
  check(await onStartScreen(heiko), 'B-AC-7 (in game): the first device steps aside to the start screen');
  await second.context().close();
  await heiko.context().close();
  await mia.context().close();
  await tv.context().close();
}

/** Who this page plays as, from its game shell's header: name, species (the mark's label), colour (its slot) and money. */
async function playingAs(page: Page): Promise<{ name: string; mark: string; slot: string; money: string }> {
  const header = page.getByTestId('guide').locator('header');
  const mark = header.locator('[role=img][data-slot]').first();
  return {
    name: ((await mark.locator('xpath=following-sibling::span[1]').textContent()) ?? '').trim(),
    mark: (await mark.getAttribute('aria-label')) ?? '',
    slot: (await mark.getAttribute('data-slot')) ?? '',
    money: ((await page.getByTestId('money').textContent()) ?? '').trim(),
  };
}

/** Heiko's row among these: the colour is read from `data-slot` on his PlayerMark. */
function heikoOn(rows: Locator): Locator {
  return rows.filter({ hasText: 'Heiko' }).first();
}

function colourRoom(cond: boolean, message: string): void {
  if (!cond) colourRoomReds.push(message);
}

async function phone(who: string, size: BrowserContextOptions = PHONE): Promise<Page> {
  const page = await (await browser.newContext(size)).newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  return page;
}

async function hostRoom(page: Page, at: string): Promise<string> {
  await page.goto(at);
  await page.getByPlaceholder('Heiko').fill('Heiko');
  await page.getByRole('button', { name: 'Start a new game' }).click();
  await page.getByText("You're at the table").waitFor();
  return (await page.getByTestId('room-code').textContent())?.trim() ?? '';
}

async function joinRoom(page: Page, at: string, code: string, name: string): Promise<Page> {
  await page.goto(`${at}/?room=${code}`);
  await page.getByPlaceholder('Heiko').fill(name);
  await page.getByRole('button', { name: `Join game ${code}` }).click();
  await page.getByText("You're at the table").waitFor();
  return page;
}

/** An AI's name, from the host's ✕ on its seat. */
async function aiName(host: Page, seatId: string): Promise<string> {
  return ((await host.getByTestId(`kick-${seatId}`).getAttribute('aria-label')) ?? '').replace(/^Remove /, '');
}

async function missingIds(page: Page, ids: string[]): Promise<string[]> {
  const missing = [];
  for (const id of ids) if (!(await page.getByTestId(id).isVisible())) missing.push(id);
  return missing;
}

async function nowTitle(page: Page): Promise<string> {
  return ((await page.getByTestId('now-title').textContent()) ?? '').trim();
}

/** Whether the room QR lies inside the rail's visible scroll area, and how far that area is scrolled. */
function qrInRail(page: Page): Promise<{ inside: boolean; scrollTop: number; qr: number[]; body: number[] }> {
  return page.getByTestId('guide').evaluate((guide) => {
    const body = guide.firstElementChild as HTMLElement;
    const b = body.getBoundingClientRect();
    const q = guide.querySelector('[data-testid=room-qr]')!.getBoundingClientRect();
    return { inside: q.top >= b.top && q.bottom <= b.bottom, scrollTop: body.scrollTop, qr: [q.top, q.bottom], body: [b.top, b.bottom] };
  });
}

/** Whether the join card comes before the seat list in the markup (and so for a screen reader). */
function joinCardFirst(page: Page): Promise<boolean> {
  return page.getByTestId('guide').evaluate((guide) => {
    const card = guide.querySelector('[data-testid=room-card]')!;
    const seats = guide.querySelector('[data-testid=seats]')!;
    return (card.compareDocumentPosition(seats) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
}

/** How many rows the six species chips take. */
function speciesRows(page: Page): Promise<number> {
  return page.getByTestId('species-pick').evaluate((grid) => new Set([...grid.children].map((el) => Math.round(el.getBoundingClientRect().top))).size);
}

function railWidth(page: Page): Promise<number> {
  return page.getByTestId('guide').evaluate((el) => Math.round(el.getBoundingClientRect().width));
}

/** Sizes the lobby's shell, the container its layout reads, without touching the window. */
async function shellWidth(page: Page, width: string): Promise<void> {
  await page.getByTestId('lobby').evaluate((el, w) => {
    (el.parentElement as HTMLElement).style.width = w;
  }, width);
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

/** The colour this page has picked for its seat, by the pressed colour chip. */
function pressedColour(page: Page): Promise<string | null> {
  return page.getByTestId('colour-pick').locator('[aria-pressed=true]').getAttribute('data-testid');
}

/** The link a dialog's QR carries. The drawn cells must encode exactly that text, so a scan opens it. */
async function qrLink(dialog: Locator, tag = 'B-AC-7 (lobby)'): Promise<string> {
  const qr = dialog.locator('svg[data-text]').filter({ visible: true });
  check(await shows(qr), `${tag}: the dialog shows a QR`);
  const text = (await qr.getAttribute('data-text')) ?? '';
  const drawn = await qr.evaluate((svg) => Array.from(svg.querySelectorAll('rect'), (r) => `${r.getAttribute('x')},${r.getAttribute('y')}`).join(' '));
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const encoded = Array.from(modules.data, (on, i) => (on ? `${i % modules.size},${Math.floor(i / modules.size)}` : ''))
    .filter(Boolean)
    .join(' ');
  check(text !== '' && drawn === encoded, `${tag}: the QR draws its link "${text}"`);
  return text;
}

/** The seat token this device keeps for itself. */
function seatToken(page: Page): Promise<string> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('mule-seat') ?? '{}') as { token?: string }).token ?? '');
}

/** The move link names the room and a one-time code, never the device's own seat token. */
function checkLink(link: string, code: string, token: string, who: string, tag = 'B-AC-7 (lobby)'): void {
  const url = new URL(link);
  check([...url.searchParams.keys()].sort().join(',') === 'handoff,room', `${tag}: ${who}'s link carries only room and handoff, got ${url.search}`);
  check(url.searchParams.get('room') === code, `${tag}: ${who}'s link names room ${code}, got ${url.search}`);
  const handoff = url.searchParams.get('handoff') ?? '';
  check(token !== '' && handoff !== '' && handoff !== token && !link.includes(token), `${tag}: ${who}'s link carries a handoff code, not the seat token`);
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
