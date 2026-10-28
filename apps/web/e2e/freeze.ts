/**
 * FM-FREEZE-1, measured in a real browser. LOCAL ONLY (tier 3): not in the `e2e` script and not in CI. Run with
 *
 *   pnpm --filter @mule/web build && pnpm --filter @mule/web exec tsx e2e/freeze.ts
 *
 * A one-month game on seed 93, played on the worker path and on the forced main-thread path
 * (`window.__landscapeSync`), on a 1440×900 laptop at 2× with the TV joined, then on an 844×390 phone at 2×.
 * Each page counts its landscape paints itself (pictures put on a main-thread canvas, jobs posted to a worker) and
 * fails unless the whole month shows one picture, painted at game start: the hub, land grant, development and
 * production share it.
 * It prints the largest frame gap at each phase change, from WS6's rAF probe; FREEZE_GAP=1 also fails the worker
 * path on a gap of 200 ms or more. Last, the worker's picture must decode to the same pixels as the main thread's.
 */
import type { BrowserContextOptions, Page } from 'playwright';
import { check, launch, PHONE, startServer, TV } from './harness';

type Path = 'worker' | 'sync';
type Frame = [t: number, phase: string];
type Paint = { t: number; how: 'canvas' | 'worker'; width?: number };
type Probe = { frames: Frame[]; paints: Paint[]; marks: { pxPerTile?: number; path?: string }[] };
type Change = { from: string; to: string; gapMs: number; paints: number };

const SEED = 93;
const PHASE_SCALE = 0.1;
const GAP_LIMIT_MS = 200;
const ASSERT_GAP = process.env.FREEZE_GAP === '1';
/** The small map: three seats, the host and two AIs. */
const MAP_WIDTH = 13;
const LAPTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const PHASE_WAIT_MS = 60_000;
const PRESS_MS = 2_000;

/**
 * Installed before any page script: WS6's frame probe, which also notes the phase on screen each frame, and a
 * count of every landscape paint, whichever thread does it.
 */
function probe(sync: boolean) {
  const w = window as unknown as Record<string, unknown> & { __frames: Frame[]; __paints: Paint[] };
  if (sync) w.__landscapeSync = true;
  w.__frames = [];
  w.__paints = [];
  (function tick(now: number) {
    w.__frames.push([now, document.querySelector('[data-phase]')?.getAttribute('data-phase') ?? 'lobby']);
    requestAnimationFrame(tick);
  })(performance.now());
  const put = CanvasRenderingContext2D.prototype.putImageData;
  CanvasRenderingContext2D.prototype.putImageData = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    w.__paints.push({ t: performance.now(), how: 'canvas', width: (args[0] as ImageData).width });
    return (put as (...a: unknown[]) => void).apply(this, args);
  };
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
    w.__paints.push({ t: performance.now(), how: 'worker' });
    return (post as (...a: unknown[]) => void).apply(this, args);
  };
}

const { server, base } = await startServer({ maxMonths: 1, phaseScale: PHASE_SCALE, seed: () => SEED });
const browser = await launch();
const errors: string[] = [];
const pictures: Record<string, string> = {};
const reds: string[] = [];
try {
  for (const path of ['worker', 'sync'] as const) {
    await game(path, 'laptop 1440×900 2×', LAPTOP, true);
    await game(path, 'phone 844×390 2×', PHONE, false);
  }
  for (const device of ['laptop 1440×900 2×', 'phone 844×390 2×']) {
    const [worker, sync] = [pictures[`worker ${device}`], pictures[`sync ${device}`]];
    console.log(`picture, ${device}: worker ${worker} · sync ${sync} → ${worker === sync ? 'same pixels' : 'DIFFERENT'}`);
    if (worker !== sync) reds.push(`FM-FREEZE-1 ${device}: the worker's picture decodes to the same pixels as the main thread's`);
  }
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  check(reds.length === 0, `\n  ${reds.join('\n  ')}`);
  console.log('e2e freeze: ok');
} catch (err) {
  console.error('e2e freeze: FAILED');
  throw err;
} finally {
  await browser.close();
  await server.close();
}
// Rooms keep their phase timers running; the test is over, so stop here.
process.exit(0);

async function page(options: BrowserContextOptions, sync: boolean, name: string): Promise<Page> {
  const context = await browser.newContext(options);
  // tsx keeps function names with a helper the page doesn't have.
  await context.addInitScript({ content: 'window.__name = (f) => f;' });
  await context.addInitScript(probe, sync);
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  return p;
}

async function game(path: Path, device: string, options: BrowserContextOptions, withTv: boolean): Promise<void> {
  const phone = await page(options, path === 'sync', device);
  await phone.goto(base);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
  const tv = withTv ? await page(TV, path === 'sync', 'tv') : null;
  if (tv) {
    await tv.goto(`${base}/table?room=${code}`);
    await tv.getByTestId('room-code').waitFor();
  }
  await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(2).waitFor();
  await phone.getByRole('button', { name: 'Start game' }).click();

  // A family looks at the hub for a moment: let the first picture arrive, then press ready.
  const planning = phone.locator('[data-phase=planning]');
  const picture = planning.locator('img[src^="blob:"], img[src^="data:image/png"]').first();
  await picture.waitFor({ timeout: 20_000 });
  const src = (await picture.getAttribute('src')) ?? '';
  await planning.getByRole('button', { name: "I'm ready" }).click({ timeout: PRESS_MS }).catch(() => undefined);
  await phone.locator('[data-phase=auction]').waitFor({ timeout: PHASE_WAIT_MS });
  await pressDoneThroughTheAuction(phone);
  await phone.locator('[data-phase=gameOver]').waitFor({ timeout: PHASE_WAIT_MS });

  const label = `${path} ${device}`;
  pictures[label] = await pictureHash(phone, src);
  report(label, await read(phone));
  if (tv) report(`${path} TV 1920×1080 1×`, await read(tv));
  await phone.context().close();
  await tv?.context().close();

  function report(name: string, probe: Probe): void {
    const changes = changesOf(probe);
    const firstGrant = probe.frames.find(([, p]) => p === 'landGrant')?.[0] ?? Infinity;
    const later = probe.paints.filter((p) => p.t >= firstGrant).length;
    const px = probe.marks.map((m) => m.pxPerTile).filter(Boolean);
    const painted = probe.paints.map((p) => (p.width ? Math.round(p.width / MAP_WIDTH) : '?'));
    console.log(
      `${name}: paints ${probe.paints.length} (${probe.paints.map((p) => p.how).join(', ') || 'none'}; px/plot ${px.length ? px.join(', ') : painted.join(', ')})` +
        ` · counter ${probe.marks.length ? `${probe.marks.length} (${probe.marks.map((m) => m.path).join(', ')})` : 'absent'}`,
    );
    console.log(`  largest frame gap per change: ${changes.map((c) => `${c.from}→${c.to} ${c.gapMs.toFixed(0)} ms${c.paints ? ` (${c.paints} paint)` : ''}`).join(' · ')}`);
    if (probe.paints.length !== 1 || later !== 0) {
      reds.push(`FM-FREEZE-1 ${name}: one paint for the whole month, at game start; got ${probe.paints.length}, ${later} from the land grant on`);
    }
    if (probe.marks.length && probe.marks.length !== probe.paints.length) {
      reds.push(`FM-FREEZE-1 ${name}: the landscape-paint counter (${probe.marks.length}) counts every paint (${probe.paints.length})`);
    }
    if (probe.marks.some((m) => m.path !== path)) reds.push(`FM-FREEZE-1 ${name}: every paint took the ${path} path`);
    if (ASSERT_GAP && path === 'worker') {
      for (const c of changes) if (c.gapMs >= GAP_LIMIT_MS) reds.push(`FREEZE_GAP ${name}: ${c.from}→${c.to} froze ${c.gapMs.toFixed(0)} ms (limit ${GAP_LIMIT_MS})`);
    }
  }
}

/** The largest gap between two frames from the last frame before each change to the last frame before the next. */
function changesOf({ frames, paints }: Probe): Change[] {
  const starts: number[] = [];
  for (let i = 1; i < frames.length; i++) if (frames[i]![1] !== frames[i - 1]![1]) starts.push(i);
  return starts.map((start, k) => {
    const end = starts[k + 1] ?? frames.length;
    let gapMs = 0;
    for (let i = start; i < end; i++) gapMs = Math.max(gapMs, frames[i]![0] - frames[i - 1]![0]);
    const from = frames[start - 1]![0];
    const to = frames[end - 1]![0];
    return { from: frames[start - 1]![1], to: frames[start]![1], gapMs, paints: paints.filter((p) => p.t >= from && p.t < to).length };
  });
}

async function read(p: Page): Promise<Probe> {
  return p.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __paints: Paint[] };
    const marks = performance.getEntriesByName('landscape-paint').map((m) => ((m as PerformanceMark).detail ?? {}) as { pxPerTile?: number; path?: string });
    return { frames: w.__frames, paints: w.__paints, marks };
  });
}

/** SHA-256 of a landscape picture's decoded pixels, taken after the game so it costs the measured frames nothing. */
async function pictureHash(p: Page, src: string): Promise<string> {
  return p.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    return `${canvas.width}×${canvas.height} ${[...digest].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }, src);
}

/** The goods auction: press its Ready / Done button at every stage until the phone leaves the auction. */
async function pressDoneThroughTheAuction(phone: Page): Promise<void> {
  const auction = phone.locator('[data-phase=auction]');
  const done = auction.getByRole('button', { name: /^(Ready|Done with .+)$/ });
  const over = phone.locator('[data-phase]:not([data-phase=auction])');
  for (let pressed = 0; pressed < 40; pressed++) {
    await done.or(over).first().waitFor({ timeout: PHASE_WAIT_MS });
    if (await over.count()) return;
    await done.click({ timeout: PRESS_MS }).catch(() => undefined);
  }
}
