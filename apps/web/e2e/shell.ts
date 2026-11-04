/**
 * B-AC-12: the shell fills the stage at 1440×900, 844×390 and 667×375 (shell-steps.ts), in a game of its own at full-length
 * phases. In smoke's month-2 planning the step had about two seconds left after the other planning steps, ran on
 * through the land grant and the land auction, and the steps waiting on those missed them.
 * B-AC-19's six-seat TV case runs here too, in a room of its own (hub-steps.ts), and E-11's Governor's desk beside the
 * table chat, a room per phone size.
 * Steered development (arcade PR-6) runs last, on a server of its own with the floor on (devSteer, phaseScale 1 so
 * frames come at the tick's 20 Hz): two phones and a TV meet the server's floor (step 1), then B-AC-3, B-AC-4 and
 * B-AC-8. `MULE_E2E_ARCADE=0` leaves it out.
 * Run with `pnpm --filter @mule/web e2e`.
 */
import { check, launch, PHONE, startServer } from './harness';
import { governorsDeskFits, sixSeatsOnTheTv } from './hub-steps';
import { shellFillsTheStage } from './shell-steps';
import { aDroppedPhoneStops, arcadeTable, laptopKeysAndMouse, phoneFitsAndCoversNothing, thePiecesMeet } from './store-steps';

const started = Date.now();
const { server, base } = await startServer({ maxMonths: 1 });
const browser = await launch();
const errors: string[] = [];
try {
  const phone = await (await browser.newContext(PHONE)).newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.goto(base);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  // A full table: the rail's seat row holds five others, the longest it gets, so the small phone's checks see its worst.
  for (let ai = 0; ai < 5; ai++) await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.getByRole('button', { name: 'Start game' }).click();
  await phone.locator('[data-phase=planning]').waitFor({ timeout: 5_000 });

  console.log(`shell: ${await shellFillsTheStage(phone)}`);
  console.log(`✓ B-AC-19: ${await sixSeatsOnTheTv({ browser, base, server })}`);
  console.log(`✓ E-11: ${await governorsDeskFits({ browser, base, server })}`);
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  if (process.env.MULE_E2E_ARCADE !== '0') await arcade();
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e shell: ok (${((Date.now() - started) / 1000).toFixed(1)} s)`);
} catch (err) {
  console.error('e2e shell: FAILED');
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);

/** Steered development on a flag-on server of its own; the flag-off server above never sees it. */
async function arcade(): Promise<void> {
  const steered = await startServer({ maxMonths: 1, politics: false, devSteer: true, seed: () => 1 });
  try {
    const table = await arcadeTable(browser, steered.base, steered.server, errors);
    console.log(`✓ step 1, the pieces meet: ${await thePiecesMeet(table)}`);
    console.log(`✓ B-AC-3: ${await laptopKeysAndMouse(table)}`);
    console.log(`✓ B-AC-4: ${await phoneFitsAndCoversNothing(table)}`);
    console.log(`✓ B-AC-8: ${await aDroppedPhoneStops(table)}`);
  } finally {
    await steered.server.close();
  }
}
