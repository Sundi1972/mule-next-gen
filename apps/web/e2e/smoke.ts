/**
 * Smoke test against the real server: a phone creates a room, adds two AI
 * players, starts, gets through planning and sees the CLAIM button in the
 * land grant. A big screen watches along. Run with `pnpm --filter @mule/web e2e`.
 */
import { check, launch, PHONE, startServer, TV } from './harness';

const { server, base } = await startServer();
const browser = await launch();
try {
  const phone = await (await browser.newContext(PHONE)).newPage();
  const errors: string[] = [];
  phone.on('pageerror', (e) => errors.push(e.message));

  await phone.goto(base);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
  check(/^[A-Z]{4}$/.test(code), `room code, got "${code}"`);

  const tv = await (await browser.newContext(TV)).newPage();
  await tv.goto(`${base}/table?room=${code}`);
  await tv.getByTestId('room-code').waitFor();

  await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(2).waitFor();
  await phone.getByText('Big screen connected').waitFor();
  await phone.getByRole('button', { name: 'Start game' }).click();

  await phone.getByRole('button', { name: "I'm ready" }).click();
  const claim = phone.getByRole('button', { name: /CLAIM/ });
  await claim.waitFor({ timeout: 5_000 });
  check(await claim.isVisible(), 'CLAIM button visible');
  await tv.getByTestId('tv-phase').filter({ hasText: 'Land grant' }).waitFor({ timeout: 3_000 });

  // Reload: the phone takes its seat back by itself.
  await phone.reload();
  // The land grant may be over by now; any game screen will do.
  await phone.locator('[data-phase]').waitFor({ timeout: 5_000 });
  check((await phone.getByText("You're at the table").count()) === 0, 'back in the game, not the lobby');

  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e smoke: ok (room ${code})`);
} finally {
  await browser.close();
  await server.close();
}
// Rooms keep their phase timers running; the test is over, so stop here.
process.exit(0);
