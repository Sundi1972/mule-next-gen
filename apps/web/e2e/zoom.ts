/** Local only, never in CI (lean CI rule 6, a wall-clock check): T-AC-9, one tap on the development map selects at once. */
import { mapSize } from '@mule/engine';
import type { Locator, Page } from 'playwright';
import { PHASE_MS } from '../../server/src/mule-game.js';
import { check, claimAPlot, launch, PHONE, startServer } from './harness';
import { readyThroughTheElection } from './politics-steps';
import { watchIntents } from './table-steps';

const PHASE_SCALE = 0.5;
const within = (ms: number) => ms * PHASE_SCALE + 3_000;
/** The land grant, a land auction if the colony lists plots, and the walk out to development. */
const REACH_DEVELOPMENT_MS = 120_000;
const SEATS = 6;
const { width: MAP_W } = mapSize(SEATS);
/** RULE-4's double-tap window: a tap that selects later than this was held back to wait for a second one. */
const DOUBLE_TAP_MS = 300;
/** A selection that hasn't shown by now never will: the probe gives up rather than hang. */
const SELECT_GIVE_UP_MS = 2_000;
/** T-AC-9 watches the wire for this long after the tap. */
const QUIET_MS = 400;
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
  for (let i = 1; i < SEATS; i++) await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(SEATS - 1).waitFor();
  await phone.getByRole('button', { name: 'Start game' }).click();
  await readyThroughTheElection(phone, 10_000);
  await phone.locator('[data-phase=landGrant]').getByRole('button', { name: /CLAIM/ }).waitFor({ timeout: 5_000 });
  await claimAPlot(phone, within(PHASE_MS.landGrant), 'T-AC-9: the phone claims a plot in the land grant');
  check(intents() >= 1, `T-AC-9: the frame watcher saw the claim go out, ${intents()} intents`);

  const dev = phone.locator('[data-phase=development]');
  await dev.getByRole('button', { name: 'Walk out to the map' }).click({ timeout: REACH_DEVELOPMENT_MS });
  await dev.getByRole('button', { name: /, free\b/ }).first().waitFor({ timeout: 3_000 });
  const whole = await widths(dev.getByRole('button', { name: OWN }));
  check(whole.length > 0, 'T-AC-9: development shows the plot claimed');
  await checkASingleTapSelectsAtOnce(phone, dev, whole, intents);

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

/** T-AC-9 negative: one tap selects a plot within the double-tap window, and doesn't zoom. */
async function checkASingleTapSelectsAtOnce(phone: Page, dev: Locator, whole: number[], intents: () => number): Promise<void> {
  const labels = await plots(dev).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  const index = labels.flatMap((label, i) => (/, free\b/.test(label) ? [i] : [])).at(-1) ?? -1;
  check(index >= 0, 'T-AC-9: the map has a free plot to tap');
  const target = { x: index % MAP_W, y: Math.floor(index / MAP_W) };
  const sent = intents();
  const lag = dev.evaluate(
    (el, { name, giveUpMs }) =>
      new Promise<number>((resolve) => {
        setTimeout(() => resolve(Infinity), giveUpMs);
        let up = 0;
        document.addEventListener('pointerup', () => (up = performance.now()), { capture: true, once: true });
        // No named functions in here: tsx wraps them with a `__name` helper the page lacks.
        const watch = new MutationObserver(() => {
          if (up && el.querySelector('[data-testid=plot-title]')?.textContent?.includes(name)) {
            watch.disconnect();
            resolve(performance.now() - up);
          }
        });
        watch.observe(el, { subtree: true, childList: true, characterData: true });
      }),
    { name: `${target.x + 1}·${target.y + 1}`, giveUpMs: SELECT_GIVE_UP_MS },
  );
  await plots(dev).nth(index).tap({ timeout: 2_000 });
  const ms = await lag;
  check(ms < DOUBLE_TAP_MS, `T-AC-9: a single tap selects at once, it took ${ms.toFixed(0)} ms`);
  await phone.waitForTimeout(QUIET_MS);
  check(intents() === sent, `T-AC-9: a single tap sends no intent, sent ${intents() - sent}`);
  const now = await widths(dev.getByRole('button', { name: OWN }));
  check(now.every((w, i) => Math.abs(w - whole[i]!) < 0.5), `T-AC-9: a single tap doesn't zoom, plots ${whole.join(', ')} → ${now.join(', ')}`);
}

/** Every plot on the map, row by row: each is labelled with its terrain; player marks are images. */
function plots(screen: Locator): Locator {
  return screen.locator('main [aria-label]:not([role=img]):not([data-testid=zoom-button])');
}

async function widths(list: Locator): Promise<number[]> {
  return list.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
}

/** The game's seed: MULE_E2E_SEED when set, a fresh random one otherwise. */
function seedFrom(value: string | undefined): number {
  if (value === undefined) return Math.floor(Math.random() * 2 ** 31);
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(Number.isSafeInteger(n) && n >= 0)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}
