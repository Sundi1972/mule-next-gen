/**
 * A-1, front to back: month 1's development clock waits for every first MULE, and the host may start it without the
 * rest. Three phones (Heiko hosts, Mia and Kai join) and a TV, no AI. Mia, then Heiko install a first MULE; Kai does
 * nothing. Checks the wait as a seat already in sees it (its guide in view, no plot row, the filter dimmed, the pub
 * open), who is offered Start the clock, its button and confirm at 844×390 and 667×375, then the press: the server's
 * clock starts, Kai's phone says so, the news names him and the plot row is back.
 * Local: `pnpm --filter @mule/web build`, then `pnpm --filter @mule/web exec tsx e2e/first-mule.ts`.
 */
import type { MuleView } from '@mule/protocol';
import type { Locator, Page } from 'playwright';
import { claimAPlot, CLAIM_MS, check, doneWithLand, launch, PHONE, PHONE_SMALL, startServer, TV } from './harness';

const PHASE_SCALE = 0.1;
const PRESS_MS = 3_000;
const LINE = 'Heiko started the clock without Kai.';
const PASSED = 'The host started the clock: your month is running.';
const WAITING = "Waiting for the others' first MULEs";
const YOU_WAIT = 'Buying, installing and analysing wait for the clock.';
const SIZES = [PHONE.viewport, PHONE_SMALL.viewport];

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
  const join = async (name: string) => {
    const page = await open(name);
    await page.goto(`${base}/?room=${code}`);
    await page.getByPlaceholder('Heiko').fill(name);
    await page.getByRole('button', { name: `Join game ${code}` }).click();
    await page.getByText("You're at the table").waitFor();
    return page;
  };
  const mia = await join('Mia');
  const kai = await join('Kai');
  const phones = [heiko, mia, kai];
  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  await tv.goto(`${base}/table?room=${code}`);
  await heiko.locator('[data-testid=seats] li').nth(2).waitFor();
  await heiko.getByRole('button', { name: 'Start game' }).click();
  const game = (server.registry.get(code) as unknown as { game: Game }).game;

  for (const p of phones) await p.getByTestId('ready').click({ timeout: PRESS_MS * 3 });
  for (const p of phones) await claimAPlot(p, CLAIM_MS, 'A-1: each phone claims a plot, so each has a first MULE to wait for');
  for (const p of phones) await doneWithLand(p);
  const dev = (p: Page) => p.locator('[data-phase=development]');
  await dev(heiko).waitFor({ timeout: 60_000 });
  for (const p of [mia, kai]) await dev(p).waitFor({ timeout: PRESS_MS });
  await tv.getByTestId('tv-first-mules').waitFor({ timeout: PRESS_MS });
  const plots = game.viewFor(null).players.map((p) => `${p.name} ${p.plots}`);
  check(game.viewFor(null).players.every((p) => p.plots > 0), `A-1: everyone owns a plot, got ${plots.join(', ')}`);
  check(game.devEndsAt === null, 'A-1: the server holds the clock while every first MULE is still to come');

  const button = (p: Page) => p.getByTestId('continue');
  const none = async (p: Page | Locator, who: string) => check((await p.getByTestId('continue').count()) === 0, `A-1: ${who} shows no Start the clock`);
  await none(heiko, "the host's phone before its own first MULE is in");
  await none(mia, "a non-host's phone");
  await none(tv, 'the TV');

  /** The seat buys, outfits and installs its first MULE through its phone, on the plot its guide picks. */
  const installFirst = async (page: Page, seat: string) => {
    await page.locator('[data-shop=corral]:not([disabled])').click({ timeout: PRESS_MS });
    for (let i = 0; i < 50 && game.viewFor(seat).me!.carriedMule !== 'empty'; i++) await page.waitForTimeout(100);
    check(game.viewFor(seat).me!.carriedMule === 'empty', `A-1: ${seat} leads an empty MULE from the corral; news: ${game.viewFor(null).news.join(' | ')}`);
    await page.locator('[data-shop=energy]:not([disabled])').click({ timeout: PRESS_MS * 3 });
    await dev(page).getByRole('button', { name: 'Walk out to the map' }).click({ timeout: PRESS_MS });
    await dev(page).getByRole('button', { name: 'Install here' }).click({ timeout: PRESS_MS });
  };
  const measures: string[] = [];
  /** Once in, you wait: the guide's detail in view, no plot row, the filter dimmed with its reason, the pub open. */
  const waitsOnceIn = async (page: Page, who: string, waitingFor: string, shots: boolean) => {
    const title = dev(page).getByTestId('now-title');
    await title
      .getByText(`Your MULE is in · waiting for ${waitingFor}`)
      .waitFor({ timeout: PRESS_MS * 3 })
      .catch(async (err) => {
        console.error(`${who}'s Now reads "${await title.innerText().catch(() => '(none)')}"`);
        throw err;
      });
    check((await plotRow(page)).length === 0, `A-1: ${who}: once in, the map shows no plot row during the wait, got ${JSON.stringify(await plotRow(page))}`);
    const filter = await filterButton(page);
    check(filter.length > 0 && filter.every((d) => d.disabled && d.title === WAITING && d.describedBy === 'first-month-wait'), `A-1: ${who}: once in, the filter waits: ${JSON.stringify(filter)}`);
    check(await page.locator('#first-month-wait').getByText(YOU_WAIT).count(), `A-1: ${who}: the dimmed filter points at the guide's detail`);
    check(await dev(page).getByRole('button', { name: 'Go to the pub and end your turn' }).isEnabled(), `A-1: ${who}: once in, the pub is open`);
    for (const size of SIZES) {
      await page.setViewportSize(size);
      const tag = `${size.width}×${size.height}`;
      if (shots) await shot(page, `wait-${size.width}x${size.height}${who.startsWith('Mia') ? '-two-to-come' : ''}`);
      const guide = await page.getByTestId('now').evaluate((now) => {
        const detail = now.querySelector('#first-month-wait')!.parentElement!;
        const lines = Math.round(detail.getBoundingClientRect().height / parseFloat(getComputedStyle(detail).lineHeight));
        const title = now.querySelector('[data-testid=now-title]')!;
        const titleLines = Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight));
        const d = detail.getBoundingClientRect();
        const rail = document.querySelector('[data-testid=guide] > .overflow-y-auto')!.getBoundingClientRect();
        const hidden = Math.max(rail.top - d.top, d.bottom - rail.bottom, d.bottom - window.innerHeight, 0);
        return { over: now.scrollWidth - now.clientWidth, lines, titleLines, width: Math.round(d.width), hidden };
      });
      check(guide.over <= 0, `A-1: ${who}, ${tag}: the guide doesn't overflow, ${guide.over} px`);
      check(guide.hidden <= 0.5, `A-1: ${who}, ${tag}: the wait's detail shows in full in the rail without scrolling, ${guide.hidden.toFixed(1)} px out of view`);
      check(guide.titleLines <= 2, `A-1: ${who}, ${tag}: the wait's title wraps to 2 lines at most, got ${guide.titleLines}`);
      if (size === PHONE_SMALL.viewport) check(guide.lines <= 2, `A-1: ${who}, 667: the wait's detail keeps to 2 lines at ${guide.width} px, got ${guide.lines}`);
      measures.push(`${who} ${size.width}: guide ${guide.width} px wide, title ${guide.titleLines} line(s), detail ${guide.lines} line(s), in view`);
    }
    await page.setViewportSize(PHONE.viewport);
  };

  await installFirst(mia, 's2');
  await waitsOnceIn(mia, 'Mia, not the host', 'Heiko +1', true);
  await none(mia, "a non-host's phone, its own MULE in");
  await installFirst(heiko, 's1');
  await waitsOnceIn(heiko, 'Heiko, the host', 'Kai', true);
  check(game.devEndsAt === null, "A-1: the clock still waits for Kai's first MULE");
  await tv.getByTestId('tv-first-mule-s1').getByText('MULE in ✓').waitFor({ timeout: PRESS_MS });
  await none(mia, "a non-host's phone, with the host's MULE in");
  await none(tv, 'the TV, with the host in');
  check((await button(heiko).innerText()).trim() === 'Start the clock without Kai', `A-1: the host's button names Kai, got "${await button(heiko).innerText()}"`);

  for (const size of SIZES) {
    await heiko.setViewportSize(size);
    const tag = `${size.width}×${size.height}`;
    await fits(heiko, button(heiko), tag, 'the button');
    await button(heiko).click({ timeout: PRESS_MS });
    const confirm = heiko.getByTestId('continue-confirm');
    await confirm.waitFor({ timeout: PRESS_MS });
    check((await confirm.getAttribute('role')) === 'alertdialog' && (await confirm.getAttribute('aria-label')) === 'Start the clock without them?', `A-1: ${tag}: the confirm is an alertdialog labelled for the press`);
    const question = (await confirm.locator('p').innerText()).trim();
    check(question === "Start the month's clock now? Kai has no MULE in yet, and loses no time until now.", `A-1: ${tag}: the confirm's words, got "${question}"`);
    await fits(heiko, confirm, tag, 'the confirm card');
    await shot(heiko, `confirm-${size.width}x${size.height}`);
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
  await dev(kai).getByText(PASSED).waitFor({ timeout: PRESS_MS });
  for (const [page, who] of [
    [heiko, 'Heiko'],
    [mia, 'Mia'],
  ] as const) {
    await dev(page).getByRole('button', { name: /^Geo analysis|^Analysed/ }).waitFor({ timeout: PRESS_MS });
    const row = await plotRow(page);
    check(row.some((d) => d.text.startsWith('Analyse')) && row.every((d) => d.title !== WAITING), `A-1: ${who}: once the clock runs, the plot row is back and waits no more: ${JSON.stringify(row)}`);
  }
  check(game.viewFor(null).news.includes(LINE), `A-1: the server's news names Kai after the press, got ${JSON.stringify(game.viewFor(null).news)}`);
  console.log(`first MULE: the press started the clock; Kai's phone: "${PASSED}"; the news: "${LINE}"; ${measures.join('; ')}`);
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
  const spill = await el.evaluate((e) => Math.max(e.scrollHeight - e.clientHeight, e.scrollWidth - e.clientWidth));
  check(spill <= 1, `A-1: ${tag}: ${what}'s own content stays inside it, out by ${spill} px`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(over <= 0, `A-1: ${tag}: nothing overflows the page sideways, ${over} px`);
}

type Control = { text: string; disabled: boolean; title: string | null; describedBy: string | null };

/** The plot row in the rail's footer: Install (or Replace) and Analyse. */
function plotRow(page: Page): Promise<Control[]> {
  return controls(page, '[data-testid=actions] button', '^(Install here|Replace MULE|Analyse|Analysed)');
}

/** The plot card's filter button in the rail. */
function filterButton(page: Page): Promise<Control[]> {
  return controls(page, '[data-testid=guide] button', '^(Fit a filter|Filter fitted)');
}

function controls(page: Page, selector: string, text: string): Promise<Control[]> {
  return page.evaluate(
    ([selector, text]) =>
      [...document.querySelectorAll<HTMLButtonElement>(selector!)]
        .filter((b) => new RegExp(text!).test((b.textContent ?? '').trim()))
        .map((b) => ({ text: (b.textContent ?? '').trim(), disabled: b.disabled, title: b.getAttribute('title'), describedBy: b.getAttribute('aria-describedby') })),
    [selector, text],
  );
}

/** With MULE_SHOTS set, saves the page there as <name>.png, for a reviewer's eye. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.MULE_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

async function height(el: Locator): Promise<string> {
  const box = await el.first().boundingBox();
  return box ? `${box.height.toFixed(1)} px` : 'absent';
}

