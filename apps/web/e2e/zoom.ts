/**
 * B-AC-2 and T-AC-9: in a six-seat game on an 844×390 phone, a double-tap or the corner button zooms the map to
 * your own land and back, and the double-tap sends the server nothing. Run with `pnpm --filter @mule/web e2e`;
 * replay a red run's map with `MULE_E2E_SEED=<seed>`.
 */
import { GAME, mapSize } from '@mule/engine';
import type { Locator, Page } from 'playwright';
import { GRANT_TICK_MS, PHASE_MS } from '../../server/src/mule-game.js';
import { check, launch, PHONE, startServer } from './harness';

const PHASE_SCALE = 0.5;
const within = (ms: number) => ms * PHASE_SCALE + 3_000;
/** The land grant, a land auction if the colony lists plots, and the walk out to development. */
const REACH_DEVELOPMENT_MS = 120_000;
const SEATS = 6;
const { width: MAP_W, height: MAP_H } = mapSize(SEATS);
/** AM-11: B-AC-2 holds for holdings that span at most this many plots. */
const SPAN = { w: 10, h: 5 };
const MIN_PLOT_PX = 44;
/** RULE-4's double-tap window: a tap that selects later than this was held back to wait for a second one. */
const DOUBLE_TAP_MS = 300;
/** A selection that hasn't shown by now never will: the probe gives up rather than hang. */
const SELECT_GIVE_UP_MS = 2_000;
/** T-AC-9 watches the wire from the first tap to this long after the second. */
const QUIET_MS = 400;
const OWN = /owned by player 1\b/;

const SEED = seedFrom(process.env.MULE_E2E_SEED);
const { server, base } = await startServer({ maxMonths: 1, phaseScale: PHASE_SCALE, seed: () => SEED });
const browser = await launch();
const errors: string[] = [];
let intents = 0;
try {
  const phone = await (await browser.newContext(PHONE)).newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  phone.on('websocket', (ws) =>
    ws.on('framesent', ({ payload }) => {
      if (typeof payload === 'string' && (JSON.parse(payload) as { t?: string }).t === 'intent') intents++;
    }),
  );

  await phone.goto(base);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  for (let i = 1; i < SEATS; i++) await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(SEATS - 1).waitFor();
  await phone.getByRole('button', { name: 'Start game' }).click();
  await phone.getByRole('button', { name: "I'm ready" }).click({ timeout: 5_000 });

  const grant = phone.locator('[data-phase=landGrant]');
  await grant.getByRole('button', { name: /CLAIM/ }).waitFor({ timeout: 5_000 });
  await checkNoZoomWithoutLand(phone, grant);
  const claimed = await claimACompactBlock(phone, grant);
  check(intents >= GAME.claimsPerGrant, `T-AC-9: the frame watcher saw the claims go out, ${intents} intents`);

  const dev = phone.locator('[data-phase=development]');
  await dev.getByRole('button', { name: 'Walk out to the map' }).click({ timeout: REACH_DEVELOPMENT_MS });
  await dev.getByRole('button', { name: /, free\b/ }).first().waitFor({ timeout: 3_000 });
  const own = dev.getByRole('button', { name: OWN });
  check((await own.count()) === claimed.length, `B-AC-2: development shows the ${claimed.length} plots claimed, got ${await own.count()}`);

  const whole = await widths(own);
  check(Math.max(...whole) < MIN_PLOT_PX, `B-AC-2: before zoom your plots are under ${MIN_PLOT_PX} px, got ${whole.join(', ')}`);

  await checkASingleTapSelectsAtOnce(phone, dev, whole);

  const target = claimed[0]!;
  const sent = intents;
  await doubleTap(phone, tilePlot(dev, target));
  await phone.waitForTimeout(QUIET_MS);
  check(intents === sent, `T-AC-9: a double-tap sends no intent, sent ${intents - sent}`);
  await checkReadout(dev, target, 'T-AC-9: the double-tap selects the tapped plot');
  const zoomed = await checkZoomedToOwnLand(phone, dev, 'B-AC-2: after a double-tap');

  await dev.getByRole('button', { name: 'Store', exact: true }).tap({ timeout: 2_000 });
  await dev.getByRole('button', { name: 'Walk out to the map' }).tap({ timeout: 2_000 });
  await checkZoomedToOwnLand(phone, dev, 'B-AC-2: zoom survives a store trip:');

  await doubleTap(phone, tilePlot(dev, target));
  await checkWholeMap(phone, dev, 'B-AC-2: after a second double-tap');

  await dev.getByTestId('zoom-button').tap({ timeout: 2_000 });
  await checkZoomedToOwnLand(phone, dev, 'B-AC-2: after the zoom button');
  await dev.getByTestId('zoom-button').tap({ timeout: 2_000 });
  await checkWholeMap(phone, dev, 'B-AC-2: after the zoom button again');

  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e zoom: ok (seed ${SEED}, plots ${claimed.map((p) => `${p.x + 1}·${p.y + 1}`).join(' ')}, whole ${whole[0]?.toFixed(1)} px, zoomed ${zoomed[0]?.toFixed(1)} px)`);
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

type Plot = { x: number; y: number };

/** Negative of B-AC-2: before your first claim the grant map has no zoom button, and a double-tap changes no plot. */
async function checkNoZoomWithoutLand(phone: Page, grant: Locator): Promise<void> {
  check((await grant.getByTestId('zoom-button').count()) === 0, 'B-AC-2: with no plots there is no zoom button');
  const before = await boxes(plots(grant));
  check(before.length === MAP_W * MAP_H, `B-AC-2: the grant map draws ${MAP_W}×${MAP_H} plots, got ${before.length}`);
  const left = Math.min(...before.map((b) => b.x));
  const top = Math.min(...before.map((b) => b.y));
  const right = Math.max(...before.map((b) => b.x + b.width));
  const bottom = Math.max(...before.map((b) => b.y + b.height));
  await doubleTapAt(phone, (left + right) / 2, (top + bottom) / 2);
  await phone.waitForTimeout(QUIET_MS);
  const after = await boxes(plots(grant));
  const moved = after.filter((b, i) => Math.abs(b.width - before[i]!.width) > 0.5 || Math.abs(b.x - before[i]!.x) > 0.5).length;
  check(moved === 0, `B-AC-2: with no plots a double-tap changes nothing, yet ${moved} plots moved or resized`);
}

/**
 * Claims GAME.claimsPerGrant plots inside an AM-11 span. The light sweeps row by row, so the next free plot
 * after a claim is usually its neighbour. Read and pressed in one turn of the page, so the light can't move between.
 */
async function claimACompactBlock(phone: Page, grant: Locator): Promise<Plot[]> {
  const claimed: Plot[] = [];
  const deadline = Date.now() + within(PHASE_MS.landGrant);
  while (claimed.length < GAME.claimsPerGrant) {
    check(Date.now() < deadline && (await grant.count()) > 0, `B-AC-2: the phone claims ${GAME.claimsPerGrant} plots within ${SPAN.w}×${SPAN.h}, got ${claimed.length}`);
    const pressed = await grant.evaluate(
      (el, { first, span }) => {
        const lit = el.querySelector('[data-testid=lit]')?.textContent?.match(/(\d+)·(\d+)/);
        const claim = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('CLAIM'));
        if (!lit || !claim || claim.disabled) return null;
        const at = { x: Number(lit[1]) - 1, y: Number(lit[2]) - 1 };
        if (first && (Math.abs(at.x - first.x) >= span.w || Math.abs(at.y - first.y) >= span.h)) return null;
        claim.click();
        return at;
      },
      { first: claimed[0] ?? null, span: SPAN },
    );
    if (!pressed) {
      await phone.waitForTimeout(40);
      continue;
    }
    const left = GAME.claimsPerGrant - claimed.length - 1;
    try {
      await grant.getByText(`${left} OF ${GAME.claimsPerGrant} CLAIMS LEFT`, { exact: true }).waitFor({ timeout: 2 * GRANT_TICK_MS });
    } catch {
      // An AI claimed it first; the light moves on.
      continue;
    }
    claimed.push(pressed);
    if (claimed.length === 1) check((await grant.getByTestId('zoom-button').count()) === 1, 'B-AC-2: once you own a plot the grant map shows the zoom button');
  }
  return claimed;
}

/** T-AC-9 negative: one tap selects a plot within the double-tap window, and doesn't zoom. */
async function checkASingleTapSelectsAtOnce(phone: Page, dev: Locator, whole: number[]): Promise<void> {
  const labels = await plots(dev).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  const index = labels.flatMap((label, i) => (/, free\b/.test(label) ? [i] : [])).at(-1) ?? -1;
  check(index >= 0, 'T-AC-9: the map has a free plot to tap');
  const target = { x: index % MAP_W, y: Math.floor(index / MAP_W) };
  const sent = intents;
  const lag = dev.evaluate(
    (el, { name, giveUpMs }) =>
      new Promise<number>((resolve) => {
        setTimeout(() => resolve(Infinity), giveUpMs);
        let up = 0;
        document.addEventListener('pointerup', () => (up = performance.now()), { capture: true, once: true });
        // No named functions in here: tsx wraps them with a `__name` helper the page lacks.
        const watch = new MutationObserver(() => {
          if (up && el.querySelector('aside h2')?.textContent?.includes(name)) {
            watch.disconnect();
            resolve(performance.now() - up);
          }
        });
        watch.observe(el, { subtree: true, childList: true, characterData: true });
      }),
    { name: plotName(target), giveUpMs: SELECT_GIVE_UP_MS },
  );
  const tile = tilePlot(dev, target);
  await tile.tap({ timeout: 2_000 });
  const ms = await lag;
  check(ms < DOUBLE_TAP_MS, `T-AC-9: a single tap selects at once, it took ${ms.toFixed(0)} ms`);
  await phone.waitForTimeout(QUIET_MS);
  check(intents === sent, `T-AC-9: a single tap sends no intent, sent ${intents - sent}`);
  const now = await widths(dev.getByRole('button', { name: OWN }));
  check(now.every((w, i) => Math.abs(w - whole[i]!) < 0.5), `T-AC-9: a single tap doesn't zoom, plots ${whole.join(', ')} → ${now.join(', ')}`);
}

async function checkReadout(dev: Locator, plot: Plot, message: string): Promise<void> {
  const heading = (await dev.locator('aside h2').textContent()) ?? '';
  check(heading.includes(plotName(plot)), `${message}: the rail shows "${heading}", not plot ${plotName(plot)}`);
}

/** B-AC-2: each of your plots is at least 44 px wide and inside the map's viewport. */
async function checkZoomedToOwnLand(phone: Page, dev: Locator, when: string): Promise<number[]> {
  const own = dev.getByRole('button', { name: OWN });
  await settle(phone, own);
  const sizes = await widths(own);
  check(sizes.every((w) => w >= MIN_PLOT_PX), `${when} each of your plots is ≥ ${MIN_PLOT_PX} px wide, got ${sizes.map((w) => w.toFixed(1)).join(', ')}`);
  const view = await viewport(dev);
  const outside = (await boxes(own)).filter((b) => !inside(b, view)).length;
  check(outside === 0, `${when} all your plots are inside the map's viewport, ${outside} are not`);
  return sizes;
}

/** B-AC-2: every one of the map's plots lies inside its viewport. */
async function checkWholeMap(phone: Page, dev: Locator, when: string): Promise<void> {
  await settle(phone, dev.getByRole('button', { name: OWN }));
  const all = await boxes(plots(dev));
  check(all.length === MAP_W * MAP_H, `${when} the map draws ${MAP_W}×${MAP_H} plots, got ${all.length}`);
  const view = await viewport(dev);
  const outside = all.filter((b) => !inside(b, view)).length;
  check(outside === 0, `${when} all ${MAP_W}×${MAP_H} plots are inside the map's viewport, ${outside} are not`);
}

/** Every plot on the map, row by row: each is labelled with its terrain; player marks are images. */
function plots(screen: Locator): Locator {
  return screen.locator('main [aria-label]:not([role=img]):not([data-testid=zoom-button])');
}

function tilePlot(dev: Locator, plot: Plot): Locator {
  return plots(dev).nth(plot.y * MAP_W + plot.x);
}

function plotName(plot: Plot): string {
  return `${plot.x + 1}·${plot.y + 1}`;
}

async function viewport(screen: Locator): Promise<Box> {
  const box = await screen.getByTestId('map-viewport').boundingBox({ timeout: 2_000 });
  check(box, "B-AC-2: the map has a viewport");
  return box;
}

type Box = { x: number; y: number; width: number; height: number };

function inside(b: Box, v: Box): boolean {
  return b.x >= v.x - 0.5 && b.y >= v.y - 0.5 && b.x + b.width <= v.x + v.width + 0.5 && b.y + b.height <= v.y + v.height + 0.5;
}

async function boxes(list: Locator): Promise<Box[]> {
  return list.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map(({ x, y, width, height }) => ({ x, y, width, height })));
}

async function widths(list: Locator): Promise<number[]> {
  return (await boxes(list)).map((b) => b.width);
}

/** Waits until the plots stop moving: the zoom eases over a few hundred milliseconds. */
async function settle(phone: Page, list: Locator): Promise<void> {
  let last = '';
  for (let i = 0; i < 40; i++) {
    await phone.waitForTimeout(60);
    const now = JSON.stringify(await boxes(list));
    if (now === last) return;
    last = now;
  }
}

async function doubleTap(phone: Page, plot: Locator): Promise<void> {
  const box = await plot.boundingBox({ timeout: 2_000 });
  check(box, 'the plot to double-tap is on screen');
  await doubleTapAt(phone, box.x + box.width / 2, box.y + box.height / 2);
}

/** Two taps at one point, sent back to back: well inside RULE-4's 300 ms. */
async function doubleTapAt(phone: Page, x: number, y: number): Promise<void> {
  await phone.touchscreen.tap(x, y);
  await phone.touchscreen.tap(x, y);
}

/** The game's seed: MULE_E2E_SEED when set, a fresh random one otherwise. */
function seedFrom(value: string | undefined): number {
  if (value === undefined) return Math.floor(Math.random() * 2 ** 31);
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(Number.isSafeInteger(n) && n >= 0)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}
