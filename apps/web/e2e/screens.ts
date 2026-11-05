/**
 * Plays one month against the real server with one phone, two AI players and
 * a big screen, and saves screenshots of every phase. The phone is held
 * sideways: each phone screen is saved as phone-land-* at 844x390 and again
 * at 932x430 (-wide), plus one shot of the turn-sideways screen when upright.
 * Then steered development (arcade PR-6), in a room of its own on a flag-on server: two phones and a TV; Heiko's
 * phone on the map, in the store hall at the corral (also at 667x375) and leading a MULE out of the door, as a laptop at 1440x900 and
 * as the small phone at 667x375, and the TV during development, each saved as *-arcade-*.
 * Run with `pnpm --filter @mule/web screens [output-dir]`.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import { check, hallPlace, launch, PHONE, PHONE_SMALL, PHONE_WIDE, pressAct, startServer, steerTo, throughDoor, TV } from './harness';
import { pressOnward, watchShow } from './production-steps';
import { voteThroughTheElection } from './politics-steps';
import { arcadeTable, installSpot } from './store-steps';

const out = resolve(process.argv[2] ?? 'screens');
mkdirSync(out, { recursive: true });

const { server, base } = await startServer();
const browser = await launch();
/** Waits out the map's fade-in before each picture. */
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, `${name}.png`) });
};
/** A phone screen at both landscape sizes. */
const phoneShot = async (page: Page, name: string) => {
  await shot(page, `phone-land-${name}`);
  await page.setViewportSize(PHONE_WIDE);
  await shot(page, `phone-land-${name}-wide`);
  await page.setViewportSize(PHONE.viewport);
};
const phase = (page: Page, p: string, timeout = 70_000) => page.locator(`[data-phase=${p}]`).first().waitFor({ timeout });

try {
  const phone = await (await browser.newContext(PHONE)).newPage();
  phone.on('pageerror', (e) => console.error('phone error:', e.message));
  const phoneShow = await watchShow(phone);
  await phone.goto(base);
  await phoneShot(phone, '0-entry');
  await phone.setViewportSize({ width: PHONE.viewport.height, height: PHONE.viewport.width });
  await phone.getByTestId('turn-sideways').waitFor();
  await shot(phone, 'phone-upright-turn-sideways');
  await phone.setViewportSize(PHONE.viewport);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())!.trim();

  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => console.error('tv error:', e.message));
  const tvShow = await watchShow(tv);
  await tv.goto(`${base}/table?room=${code}`);
  await tv.getByTestId('room-code').waitFor();

  for (let i = 0; i < 2; i++) await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(2).waitFor();
  // The room card shrinks to its compact QR once the TV has joined.
  await phone.waitForFunction(() => (document.querySelector('[data-testid=room-qr]')?.getBoundingClientRect().width ?? Infinity) < 60);
  await phoneShot(phone, '1-lobby');
  await shot(tv, 'tv-1-lobby');

  // Planning: colony, drone, chat.
  await phone.getByRole('button', { name: 'Start game' }).click();
  await phase(phone, 'planning');
  // Month 1's planning opens on its election: vote through it to the hub's desks and tools.
  await phoneShot(phone, '2-election');
  await voteThroughTheElection(phone, 120_000);
  await phoneShot(phone, '2-planning');
  await phone.getByTestId('tool-drone').click();
  const free = phone.getByRole('button', { name: /, free/ });
  await free.nth(3).click();
  await free.nth(9).click();
  await phoneShot(phone, '2-drone');
  await phone.getByRole('button', { name: /Send the drone/ }).click();
  await phone.getByTestId('desk-talk').click();
  await phone.getByPlaceholder('Say something to everyone').fill('Anyone need Water? Cheap today.');
  await phone.getByRole('button', { name: 'Send' }).click();
  await phone.getByText('Anyone need Water?').first().waitFor();
  await phoneShot(phone, '2-chat');
  await tv.getByText('Anyone need Water?').waitFor();
  await shot(tv, 'tv-2-planning');
  await phone.getByRole('button', { name: "I'm ready" }).click();

  // Land grant: try to claim whatever is lit.
  await phase(phone, 'landGrant');
  await phoneShot(phone, '3-landgrant');
  await shot(tv, 'tv-3-landgrant');
  for (let i = 0; i < 12; i++) {
    const claim = phone.getByRole('button', { name: /CLAIM/ });
    if ((await claim.count()) === 0 || !(await claim.isEnabled())) break;
    await claim.click();
    await phone.waitForTimeout(700);
  }
  await phoneShot(phone, '3-claimed');

  // Development, walked: in by the door, a MULE from the corral outfitted for Food, out by the door the guide rings to
  // the plot it rings and installed, then back in to the pub.
  await phase(phone, 'development');
  await phone.getByTestId('phone-game').waitFor();
  const seat = 's1';
  const verb = (v: string) => phone.getByTestId('action-verb').filter({ hasText: new RegExp(`^\\s*${v}\\s*$`) });
  const press = async (v: string) => {
    await verb(v).waitFor({ timeout: 5_000 });
    await pressAct(phone);
  };
  await throughDoor(phone, server, code, seat);
  await steerTo(phone, server, code, seat, hallPlace('corral'));
  await press('BUY MULE');
  await phone.getByTestId('lead-chip').waitFor({ timeout: 5_000 });
  await phoneShot(phone, '4-store');
  await shot(tv, 'tv-4-develop');
  await steerTo(phone, server, code, seat, hallPlace('food'));
  await press('OUTFIT · FOOD');
  const door = phone.locator('[data-testid=guide-hall]:is([data-rooms=doorL], [data-rooms=doorR])');
  await door.waitFor({ timeout: 5_000 });
  await throughDoor(phone, server, code, seat, (await door.getAttribute('data-rooms')) as 'doorL' | 'doorR');
  const ring = phone.locator('[data-testid=guide-map][data-what=plot]');
  await ring.waitFor({ timeout: 5_000 });
  const spot = installSpot(server, code, seat, Number(await ring.getAttribute('data-x')), Number(await ring.getAttribute('data-y')));
  await steerTo(phone, server, code, seat, spot.at, spot.within === undefined ? {} : { within: spot.within });
  await verb('INSTALL · FOOD').waitFor({ timeout: 5_000 });
  await phoneShot(phone, '4-map');
  await pressAct(phone);
  await phone.getByTestId('guide-label').filter({ hasText: 'STORE · PUB' }).waitFor({ timeout: 5_000 });
  await throughDoor(phone, server, code, seat);
  await steerTo(phone, server, code, seat, hallPlace('pub'));
  await press('PUB · END TURN');
  await phone.getByTestId('over-card').or(phone.locator('[data-phase=production]')).first().waitFor();
  await phoneShot(phone, '4-pub');

  // Production results: month 1's clock waits for every first MULE, then runs its full length.
  await phase(phone, 'production', 150_000);
  await phoneShot(phone, '5-production');
  await shot(tv, 'tv-5-production');
  const midShow = () => Promise.all([phone.screenshot({ path: join(out, 'phone-land-5-production-show.png') }), tv.screenshot({ path: join(out, 'tv-5-production-show.png') })]);
  console.log(`production show: ${await pressOnward(phone, { tv: tvShow, phone: phoneShow }, midShow)}`);

  // The walk auction: the status screen with its side picker, walking, and a trade in progress.
  await phase(phone, 'auction');
  await phone.getByTestId('status-table').waitFor();
  await phoneShot(phone, '6-auction-status');
  await tv.getByTestId('status-table').waitFor();
  await shot(tv, 'tv-6-auction-status');
  // Sell what this good leaves spare, picked on the status screen (a second tap would pass): walk down from the top toward the store's buying line.
  const seller = phone.getByTestId('side-seller');
  if ((await seller.isEnabled()) && (await seller.getAttribute('aria-checked')) !== 'true') await seller.click();
  await phone.getByRole('button', { name: 'Ready' }).click();
  // The Hold buttons show while the walk is still to start; a key held before it does is dropped, so wait for them to light.
  await phone.locator('[data-testid=hold-down]:enabled').waitFor();
  await phone.keyboard.down('ArrowDown');
  await phone.waitForTimeout(1_200);
  await phoneShot(phone, '6-auction-walking');
  await shot(tv, 'tv-6-auction-walking');
  // Keep walking until units change hands, then picture the trade.
  // A trade is quick, so both screens are taken the moment units start changing hands.
  const deal = phone.getByTestId('my-deal').filter({ hasText: /[2-9] units/ });
  // With the store the only buyer, at its line units sell by themselves (the auto-trade amendment): the rail says so.
  const selling = phone.getByTestId('line-hint').filter({ hasText: /^Selling / });
  await deal.or(selling).first().waitFor({ timeout: 20_000 });
  await Promise.all([phone.screenshot({ path: join(out, 'phone-land-6-auction-trade.png') }), tv.screenshot({ path: join(out, 'tv-6-auction-trade.png') })]);
  await phone.keyboard.up('ArrowDown');
  await phone.getByRole('button', { name: 'Night' }).click();
  await phoneShot(phone, '6-auction-night');
  await phone.getByRole('button', { name: 'Day' }).click();
  // Done with every good that comes up, until the auction closes: up to nine goods, each walked on its own clock.
  for (let i = 0; i < 360 && (await phone.locator('[data-phase=auction]').count()) > 0; i++) {
    const done = phone.getByRole('button', { name: /^(Ready|Done with )/ });
    if ((await done.count()) > 0 && (await done.isEnabled())) await done.click().catch(() => {});
    await phone.waitForTimeout(500);
  }

  // Upkeep and the next month.
  await phase(phone, 'upkeep');
  await phoneShot(phone, '7-upkeep');
  await shot(tv, 'tv-7-upkeep');
  await phone.getByRole('button', { name: /On to month/ }).click();
  await phase(phone, 'planning');
  await phoneShot(phone, '8-month2');

  await arcadeScreens();
} finally {
  await browser.close();
  await server.close();
}
// Last, after the servers' own lines (the steered game logs its development as it winds down).
console.log(`screens saved to ${out}`);
process.exit(0);

/**
 * Steered development on a flag-on server of its own, as shell.ts runs it: two phones (Heiko s1, Mia s2) and a TV, at
 * phaseScale 1 so steerTo's strides never overshoot. Month 1's clock waits for every first MULE, so nothing runs out
 * while the shots are taken. The server is closed here, whatever happens.
 */
async function arcadeScreens(): Promise<void> {
  const steered = await startServer({ maxMonths: 1, politics: false, phaseScale: 1, seed: () => 1 });
  const errors: string[] = [];
  try {
    const t = await arcadeTable(browser, steered.base, steered.server, errors, { names: ['Heiko', 'Mia'], tv: true });
    const { heiko, server, code } = t;
    const seat = 's1';
    const tv = t.tv!;
    await tv.getByTestId('tv-game').waitFor({ timeout: 5_000 });
    /** Presses the button once it says `verb`. */
    const press = async (verb: string) => {
      await heiko.getByTestId('action-verb').filter({ hasText: new RegExp(`^\\s*${verb}\\s*$`) }).waitFor({ timeout: 5_000 });
      await pressAct(heiko);
    };
    const stage = (space: 'map' | 'hall') => heiko.locator(`[data-testid=your-stage][data-space=${space}]`).waitFor({ timeout: 5_000 });

    // On the map, beside the store's door.
    await stage('map');
    await phoneShot(heiko, 'arcade-1-map');

    // In the hall, at the corral: in by the button, then by the stick to the middle of the room, where the button acts.
    await press('ENTER STORE');
    await stage('hall');
    await steerTo(heiko, server, code, seat, hallPlace('corral'));
    await press('BUY MULE');
    await heiko.getByTestId('lead-chip').waitFor({ timeout: 5_000 });
    await phoneShot(heiko, 'arcade-2-hall-corral');
    // The hall on the small phone too: its works caption and FIT badges are the tightest there.
    await heiko.setViewportSize(PHONE_SMALL.viewport);
    await heiko.locator('[data-testid=phone-game][data-size="667"]').waitFor({ timeout: 5_000 });
    await shot(heiko, 'phone-land-arcade-2-hall-corral-667');
    await heiko.setViewportSize(PHONE.viewport);
    await heiko.locator('[data-testid=phone-game][data-size="844"]').waitFor({ timeout: 5_000 });

    // Outfitted for Food and led out of the nearer door.
    await steerTo(heiko, server, code, seat, hallPlace('food'));
    await press('OUTFIT · FOOD');
    await heiko.waitForFunction(() => !/OUTFIT/.test(document.querySelector('[data-testid=action-verb]')?.textContent ?? ''), null, { timeout: 5_000 });
    await throughDoor(heiko, server, code, seat);
    await stage('map');
    await phoneShot(heiko, 'arcade-3-mule-out');
    await shot(tv, 'tv-arcade-develop');

    // The same seat as a laptop, then as the small phone on its side.
    await heiko.setViewportSize({ width: 1440, height: 900 });
    await heiko.getByTestId('laptop-game').waitFor({ timeout: 5_000 });
    // The laptop paints its own, larger land (about 3 s headless); until then the map is its base colour.
    await heiko.getByTestId('laptop-game').locator('[data-testid=holo-map] img').waitFor({ timeout: 15_000 });
    await shot(heiko, 'laptop-arcade-1440');
    await heiko.setViewportSize(PHONE_SMALL.viewport);
    await heiko.locator('[data-testid=phone-game][data-size="667"]').waitFor({ timeout: 5_000 });
    await heiko.getByTestId('phone-game').locator('[data-testid=holo-map] img').waitFor({ timeout: 15_000 });
    await shot(heiko, 'phone-land-arcade-667');
    await heiko.setViewportSize(PHONE.viewport);
  } finally {
    await steered.server.close();
  }
  check(errors.length === 0, `arcade: no page errors: ${errors.join('; ')}`);
}
