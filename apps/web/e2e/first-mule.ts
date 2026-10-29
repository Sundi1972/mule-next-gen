/**
 * A-1, front to back: month 1's development clock waits for every first MULE, and the host may start it without the
 * rest. Two phones (Heiko hosts, Mia joins) and a TV, no AI. Heiko installs his first MULE; Mia does nothing. Checks
 * who is offered Start the clock, its button and confirm at 844×390 and 667×375, then the press: the server's clock
 * starts, Mia's phone says so and the TV's news names her.
 * Local: `pnpm --filter @mule/web build`, then `pnpm --filter @mule/web exec tsx e2e/first-mule.ts`.
 */
import type { MuleView } from '@mule/protocol';
import type { Locator, Page } from 'playwright';
import { claimAPlot, CLAIM_MS, check, doneWithLand, launch, PHONE, PHONE_SMALL, startServer, TV } from './harness';

const PHASE_SCALE = 0.1;
const PRESS_MS = 3_000;
const LINE = 'Heiko started the clock without Mia.';
const PASSED = 'The host started the clock: your month is running.';
const WAITING = "Waiting for the others' first MULEs";
const YOU_WAIT = 'Buying, installing and analysing wait for the clock.';

type Game = { devEndsAt: number | null; state: { phase: string; month: number }; viewFor(seat: string | null): MuleView };

const started = Date.now();
const { server, base } = await startServer({ maxMonths: 2, phaseScale: PHASE_SCALE, politics: false, seed: () => 1 });
const browser = await launch();
const errors: string[] = [];
try {
  const open = async (name: string) => {
    const page = await (await browser.newContext(PHONE)).newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    return page;
  };
  const heiko = await open('Heiko');
  await heiko.goto(base);
  await heiko.getByPlaceholder('Heiko').fill('Heiko');
  await heiko.getByRole('button', { name: 'Start a new game' }).click();
  await heiko.getByText("You're at the table").waitFor();
  const code = (await heiko.getByTestId('room-code').textContent())?.trim() ?? '';
  const mia = await open('Mia');
  await mia.goto(`${base}/?room=${code}`);
  await mia.getByPlaceholder('Heiko').fill('Mia');
  await mia.getByRole('button', { name: `Join game ${code}` }).click();
  await mia.getByText("You're at the table").waitFor();
  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  await tv.goto(`${base}/table?room=${code}`);
  await heiko.locator('[data-testid=seats] li').nth(1).waitFor();
  await heiko.getByRole('button', { name: 'Start game' }).click();
  const game = (server.registry.get(code) as unknown as { game: Game }).game;

  for (const p of [heiko, mia]) await p.getByTestId('ready').click({ timeout: PRESS_MS * 3 });
  for (const p of [heiko, mia]) await claimAPlot(p, CLAIM_MS, 'A-1: each phone claims a plot, so each has a first MULE to wait for');
  for (const p of [heiko, mia]) await doneWithLand(p);
  const dev = (p: Page) => p.locator('[data-phase=development]');
  await dev(heiko).waitFor({ timeout: 60_000 });
  await dev(mia).waitFor({ timeout: PRESS_MS });
  await tv.getByTestId('tv-first-mules').waitFor({ timeout: PRESS_MS });
  const plots = game.viewFor(null).players.map((p) => `${p.name} ${p.plots}`);
  check(game.viewFor(null).players.every((p) => p.plots > 0), `A-1: both own a plot, got ${plots.join(', ')}`);
  check(game.devEndsAt === null, 'A-1: the server holds the clock while both first MULEs are still to come');

  const button = (p: Page) => p.getByTestId('continue');
  const none = async (p: Page | Locator, who: string) => check((await p.getByTestId('continue').count()) === 0, `A-1: ${who} shows no Start the clock`);
  await none(heiko, "the host's phone before its own first MULE is in");
  await none(mia, "a non-host's phone");
  await none(tv, 'the TV');

  await heiko.locator('[data-shop=corral]:not([disabled])').click({ timeout: PRESS_MS });
  for (let i = 0; i < 50 && game.viewFor('s1').me!.carriedMule !== 'empty'; i++) await heiko.waitForTimeout(100);
  check(game.viewFor('s1').me!.carriedMule === 'empty', `A-1: Heiko leads an empty MULE from the corral; news: ${game.viewFor(null).news.join(' | ')}`);
  await heiko.locator('[data-shop=energy]:not([disabled])').click({ timeout: PRESS_MS * 3 });
  await dev(heiko).getByRole('button', { name: 'Walk out to the map' }).click({ timeout: PRESS_MS });
  await dev(heiko).getByRole('button', { name: 'Install here' }).click({ timeout: PRESS_MS });
  const title = dev(heiko).getByTestId('now-title');
  await title.getByText('Your MULE is in · waiting for Mia').waitFor({ timeout: PRESS_MS * 3 }).catch(async (err) => {
    console.error(`the host's Now reads "${await title.innerText().catch(() => '(none)')}"`);
    throw err;
  });
  check(game.devEndsAt === null, "A-1: the clock still waits for Mia's first MULE");
  const measures: string[] = [];
  // Once in, you wait: install, analyse and filter dimmed with the reason, the pub open.
  const dimmed = () => dimmedOnPlot(heiko);
  check((await dimmed()).every((d) => d.disabled && d.title === WAITING && d.describedBy === 'first-month-wait'), `A-1: once in, the plot's controls wait: ${JSON.stringify(await dimmed())}`);
  check(await heiko.locator('#first-month-wait').getByText(YOU_WAIT).count(), 'A-1: the dimmed controls point at the guide\'s detail');
  check(await dev(heiko).getByRole('button', { name: 'Go to the pub and end your turn' }).isEnabled(), 'A-1: once in, the pub is open');
  for (const size of [PHONE.viewport, PHONE_SMALL.viewport]) {
    await heiko.setViewportSize(size);
    const guide = await heiko.getByTestId('now').evaluate((now) => {
      const detail = now.querySelector('#first-month-wait')!.parentElement!;
      const lines = Math.round(detail.getBoundingClientRect().height / parseFloat(getComputedStyle(detail).lineHeight));
      const title = now.querySelector('[data-testid=now-title]')!;
      const titleLines = Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight));
      return { over: now.scrollWidth - now.clientWidth, lines, titleLines, width: Math.round(detail.getBoundingClientRect().width) };
    });
    check(guide.over <= 0, `A-1: ${size.width}×${size.height}: the guide doesn't overflow, ${guide.over} px`);
    measures.push(`${size.width}: guide ${guide.width} px wide, title ${guide.titleLines} line(s), wait detail ${guide.lines} line(s)`);
    check(guide.titleLines <= 2, `A-1: ${size.width}×${size.height}: the wait's title wraps to 2 lines at most, got ${guide.titleLines}`);
    if (size === PHONE_SMALL.viewport) check(guide.lines <= 2, `A-1: 667: the wait's detail keeps to 2 lines at ${guide.width} px, got ${guide.lines}`);
  }
  await heiko.setViewportSize(PHONE.viewport);
  await tv.getByTestId('tv-first-mule-s1').getByText('✓ in').waitFor({ timeout: PRESS_MS });
  await none(mia, "a non-host's phone, with the host's MULE in");
  await none(tv, 'the TV, with the host in');
  check((await button(heiko).innerText()).trim() === 'Start the clock without Mia', `A-1: the host's button names Mia, got "${await button(heiko).innerText()}"`);

  for (const size of [PHONE.viewport, PHONE_SMALL.viewport]) {
    await heiko.setViewportSize(size);
    const tag = `${size.width}×${size.height}`;
    await fits(heiko, button(heiko), tag, 'the button');
    await button(heiko).click({ timeout: PRESS_MS });
    const confirm = heiko.getByTestId('continue-confirm');
    await confirm.waitFor({ timeout: PRESS_MS });
    check((await confirm.getAttribute('role')) === 'alertdialog' && (await confirm.getAttribute('aria-label')) === 'Start the clock without them?', `A-1: ${tag}: the confirm is an alertdialog labelled for the press`);
    const question = (await confirm.locator('p').innerText()).trim();
    check(question === "Start the month's clock now? Mia has no MULE in yet, and loses no time until now.", `A-1: ${tag}: the confirm's words, got "${question}"`);
    await fits(heiko, confirm, tag, 'the confirm card');
    for (const id of ['continue-now', 'keep-waiting']) await fits(heiko, heiko.getByTestId(id), tag, id);
    const low = await heiko.evaluate(() =>
      [...document.querySelectorAll('[data-testid=actions] button')]
        .map((b) => ({ text: (b.textContent ?? '').trim(), bottom: b.getBoundingClientRect().bottom }))
        .filter((b) => b.bottom > window.innerHeight + 0.5),
    );
    check(low.length === 0, `A-1: ${tag}: with the confirm open, the footer's own buttons stay in the frame; below it: ${JSON.stringify(low)}`);
    measures.push(`${tag}: button ${await height(button(heiko).or(heiko.getByTestId('continue-now')))}`);
    if (size === PHONE.viewport) {
      await heiko.getByTestId('keep-waiting').click({ timeout: PRESS_MS });
      await button(heiko).waitFor({ timeout: PRESS_MS });
      check(game.devEndsAt === null, 'A-1: Keep waiting leaves the clock waiting');
    }
  }
  await heiko.getByTestId('continue-now').click({ timeout: PRESS_MS });
  await heiko.getByTestId('clock-waits').waitFor({ state: 'hidden', timeout: PRESS_MS });
  check(typeof game.devEndsAt === 'number', 'A-1: the server started the clock on the press');
  await none(heiko, "the host's phone once the clock runs");
  await dev(mia).getByText(PASSED).waitFor({ timeout: PRESS_MS });
  const after = await dimmedOnPlot(heiko);
  check(after.every((d) => d.title !== WAITING) && after.some((d) => d.text.startsWith('Analyse') && !d.disabled), `A-1: once the clock runs the plot's controls wait no more: ${JSON.stringify(after)}`);

  check(game.viewFor(null).news.includes(LINE), `A-1: the server's news names Mia after the press, got ${JSON.stringify(game.viewFor(null).news)}`);
  console.log(`first MULE: the press started the clock; Mia's phone: "${PASSED}"; the news: "${LINE}"; ${measures.join('; ')}`);
  check(errors.length === 0, `no page errors: ${errors.join(' | ')}`);
  console.log(`e2e first MULE: ok (${((Date.now() - started) / 1_000).toFixed(1)} s)`);
} finally {
  await browser.close();
  await server.close();
}

/** Inside the frame, no wider than the page, and a tap at least 32 px high. */
async function fits(page: Page, el: Locator, tag: string, what: string): Promise<void> {
  const box = await el.boundingBox();
  check(box, `A-1: ${tag}: ${what} is drawn`);
  const vp = page.viewportSize()!;
  check(box.height >= 32, `A-1: ${tag}: ${what} is a tap of at least 32 px, got ${box.height.toFixed(1)}`);
  check(box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5, `A-1: ${tag}: ${what} sits in the frame`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(over <= 0, `A-1: ${tag}: nothing overflows the page sideways, ${over} px`);
}

/** The plot's install, analyse and filter buttons on the map: disabled, and the reason they carry. */
async function dimmedOnPlot(page: Page): Promise<{ text: string; disabled: boolean; title: string | null; describedBy: string | null }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => /^(Install here|Replace MULE|Analyse|Analysed|Fit a filter|Filter fitted)/.test((b.textContent ?? '').trim()))
      .map((b) => ({ text: (b.textContent ?? '').trim(), disabled: b.disabled, title: b.getAttribute('title'), describedBy: b.getAttribute('aria-describedby') })),
  );
}

async function height(el: Locator): Promise<string> {
  const box = await el.first().boundingBox();
  return box ? `${box.height.toFixed(1)} px` : 'absent';
}

