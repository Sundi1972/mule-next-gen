/**
 * Plays one month against the real server with one phone, two AI players and
 * a big screen, and saves screenshots of every phase. The phone is held
 * sideways: each phone screen is saved as phone-land-* at 844x390 and again
 * at 932x430 (-wide), plus one shot of the turn-sideways screen when upright.
 * Run with `pnpm --filter @mule/web screens [output-dir]`.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import { launch, PHONE, PHONE_WIDE, startServer, TV } from './harness';
import { pressOnwardBeforeTheClock, watchShow } from './production-steps';
import { fedPlayerFillsAFullHoloBar, outfittersOpenWithAnEmptyMule, storeIsOneHallWithTwoRows } from './store-steps';

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
  await phone.getByText('Big screen connected').waitFor();
  await phoneShot(phone, '1-lobby');
  await shot(tv, 'tv-1-lobby');

  // Planning: colony, drone, chat.
  await phone.getByRole('button', { name: 'Start game' }).click();
  await phase(phone, 'planning');
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

  // Development: buy a MULE, outfit it for Food, install it, analyse, then the pub.
  await phase(phone, 'development');
  await storeIsOneHallWithTwoRows(phone);
  // Buys the MULE through the corral while the start-of-turn card still shows.
  await fedPlayerFillsAFullHoloBar(phone);
  await phoneShot(phone, '4-store');
  await shot(tv, 'tv-4-develop');
  await outfittersOpenWithAnEmptyMule(phone);
  await phone.locator('[data-shop=food]:not([disabled])').click();
  await phone.getByRole('button', { name: 'Walk out to the map' }).click();
  await phone.getByRole('button', { name: /Install here|Replace MULE/ }).waitFor();
  await phoneShot(phone, '4-map');
  await phone.getByRole('button', { name: /Install here|Replace MULE/ }).click();
  await phone.getByText('No MULE').first().waitFor();
  // The plot may already be analysed: the drone's picks can be the plots the grant gave us.
  const analyse = phone.getByRole('button', { name: /Geo analysis/ });
  if ((await analyse.count()) > 0) await analyse.click();
  await phone.getByTestId('ground').waitFor();
  await phoneShot(phone, '4-analysed');
  await phone.getByRole('button', { name: 'Go to the pub and end your turn' }).click();
  await phone.getByText('The pub').or(phone.locator('[data-phase=production]')).first().waitFor();
  await phoneShot(phone, '4-pub');

  // Production results.
  await phase(phone, 'production');
  await phoneShot(phone, '5-production');
  await shot(tv, 'tv-5-production');
  const midShow = () => Promise.all([phone.screenshot({ path: join(out, 'phone-land-5-production-show.png') }), tv.screenshot({ path: join(out, 'tv-5-production-show.png') })]);
  console.log(`production show: ${await pressOnwardBeforeTheClock(phone, { tv: tvShow, phone: phoneShow }, midShow)}`);

  // The walk auction: the status screen, the declare, walking, and a trade in progress.
  await phase(phone, 'auction');
  await phone.getByTestId('status-table').waitFor();
  await phoneShot(phone, '6-auction-status');
  await tv.getByTestId('status-table').waitFor();
  await shot(tv, 'tv-6-auction-status');
  await phone.getByRole('button', { name: 'Ready' }).click();
  await phone.getByRole('radiogroup', { name: 'Your side' }).waitFor();
  await phoneShot(phone, '6-auction-declare');
  await shot(tv, 'tv-6-auction-declare');
  // Sell what this good leaves spare: walk down from the top toward the store's buying line.
  const seller = phone.getByRole('radio', { name: 'Seller' });
  if (await seller.isEnabled()) await seller.click();
  await phone.getByRole('button', { name: 'Done choosing' }).click();
  await phone.getByRole('button', { name: 'Hold to walk down' }).waitFor();
  await phone.keyboard.down('ArrowDown');
  await phone.waitForTimeout(1_200);
  await phoneShot(phone, '6-auction-walking');
  await shot(tv, 'tv-6-auction-walking');
  // Keep walking until units change hands, then picture the trade.
  // A trade is quick, so both screens are taken the moment units start changing hands.
  await phone.getByTestId('my-deal').filter({ hasText: /[2-9] units/ }).waitFor({ timeout: 20_000 });
  await Promise.all([phone.screenshot({ path: join(out, 'phone-land-6-auction-trade.png') }), tv.screenshot({ path: join(out, 'tv-6-auction-trade.png') })]);
  await phone.keyboard.up('ArrowDown');
  await phone.getByRole('button', { name: 'Night' }).click();
  await phoneShot(phone, '6-auction-night');
  await phone.getByRole('button', { name: 'Day' }).click();
  // Done with every good that comes up, until the auction closes.
  for (let i = 0; i < 60 && (await phone.locator('[data-phase=auction]').count()) > 0; i++) {
    const done = phone.getByRole('button', { name: /^(Ready|Done choosing|Done with )/ });
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
  console.log(`screens saved to ${out}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
