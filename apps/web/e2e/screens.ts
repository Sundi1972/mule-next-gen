/**
 * Plays one month against the real server with one phone, two AI players and
 * a big screen, and saves screenshots of every phase.
 * Run with `pnpm --filter @mule/web screens [output-dir]`.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import { launch, PHONE, startServer, TV } from './harness';

const out = resolve(process.argv[2] ?? 'screens');
mkdirSync(out, { recursive: true });

const { server, base } = await startServer();
const browser = await launch();
/** Waits out the map's fade-in before each picture. */
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, `${name}.png`) });
};
const phase = (page: Page, p: string, timeout = 70_000) => page.locator(`[data-phase=${p}]`).first().waitFor({ timeout });

try {
  const phone = await (await browser.newContext(PHONE)).newPage();
  phone.on('pageerror', (e) => console.error('phone error:', e.message));
  await phone.goto(base);
  await shot(phone, 'phone-0-entry');
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())!.trim();

  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => console.error('tv error:', e.message));
  await tv.goto(`${base}/table?room=${code}`);
  await tv.getByTestId('room-code').waitFor();

  for (let i = 0; i < 2; i++) await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(2).waitFor();
  await phone.getByText('Big screen connected').waitFor();
  await shot(phone, 'phone-1-lobby');
  await shot(tv, 'tv-1-lobby');

  // Planning: colony, drone, chat.
  await phone.getByRole('button', { name: 'Start game' }).click();
  await phase(phone, 'planning');
  await shot(phone, 'phone-2-planning');
  await phone.getByRole('tab', { name: 'Geo drone' }).click();
  const free = phone.getByRole('button', { name: /, free/ });
  await free.nth(3).click();
  await free.nth(9).click();
  await shot(phone, 'phone-2-drone');
  await phone.getByRole('button', { name: /Send the drone/ }).click();
  await phone.getByRole('tab', { name: 'Chat' }).click();
  await phone.getByPlaceholder('Say something to everyone').fill('Anyone need Water? Cheap today.');
  await phone.getByRole('button', { name: 'Send' }).click();
  await phone.getByText('Anyone need Water?').first().waitFor();
  await shot(phone, 'phone-2-chat');
  await tv.getByText('Anyone need Water?').waitFor();
  await shot(tv, 'tv-2-planning');
  await phone.getByRole('button', { name: "I'm ready" }).click();

  // Land grant: try to claim whatever is lit.
  await phase(phone, 'landGrant');
  await shot(phone, 'phone-3-landgrant');
  await shot(tv, 'tv-3-landgrant');
  for (let i = 0; i < 12; i++) {
    const claim = phone.getByRole('button', { name: /CLAIM/ });
    if ((await claim.count()) === 0 || !(await claim.isEnabled())) break;
    await claim.click();
    await phone.waitForTimeout(700);
  }
  await shot(phone, 'phone-3-claimed');

  // Development: buy a MULE, outfit it for Food, install it, analyse, then the pub.
  await phase(phone, 'development');
  await shot(phone, 'phone-4-store');
  await shot(tv, 'tv-4-develop');
  await phone.locator('[data-shop=corral]').click();
  await phone.locator('[data-shop=food]:not([disabled])').click();
  await phone.getByRole('button', { name: /Install here|Replace MULE/ }).waitFor();
  await shot(phone, 'phone-4-map');
  await phone.getByRole('button', { name: /Install here|Replace MULE/ }).click();
  await phone.getByText('No MULE').first().waitFor();
  await phone.getByRole('button', { name: /Geo analysis/ }).click();
  await phone.getByTestId('ground').waitFor();
  await shot(phone, 'phone-4-analysed');
  await phone.getByRole('button', { name: 'Go to the pub and end your turn' }).click();
  await phone.getByText('The pub').or(phone.locator('[data-phase=production]')).first().waitFor();
  await shot(phone, 'phone-4-pub');

  // Production results.
  await phase(phone, 'production');
  await shot(phone, 'phone-5-production');
  await shot(tv, 'tv-5-production');
  await phone.getByRole('button', { name: 'On to the auction' }).click();

  // Auction: sell some Food, see it placed.
  await phase(phone, 'auction');
  await shot(phone, 'phone-6-auction');
  await shot(tv, 'tv-6-auction');
  await phone.getByRole('button', { name: /^(Sell|Buy) \d+ / }).click();
  await phone.getByRole('button', { name: /Order placed/ }).waitFor();
  await phone.getByRole('button', { name: 'Night' }).click();
  await shot(phone, 'phone-6-auction-night');
  await phone.getByRole('button', { name: 'Day' }).click();
  await phone.getByRole('button', { name: 'Done trading' }).click();

  // Upkeep and the next month.
  await phase(phone, 'upkeep');
  await shot(phone, 'phone-7-upkeep');
  await shot(tv, 'tv-7-upkeep');
  await phone.getByRole('button', { name: /On to month/ }).click();
  await phase(phone, 'planning');
  await shot(phone, 'phone-8-month2');
  console.log(`screens saved to ${out}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
