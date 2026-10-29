/**
 * B-AC-11: the small landscape phone. One phone plays a two-month game; on each of WS4's surfaces the clock is held
 * and the screen is read box by box at PHONE_SMALL (667×375) and PHONE (844×390). Month 1's end and game over are
 * read with and without a TV, and the month end in Collapse too (C20).
 * Local tier: `pnpm --filter @mule/web build`, then `pnpm --filter @mule/web e2e:small`.
 */
import { POLLUTION } from '@mule/engine';
import type { Locator, Page } from 'playwright';
import { claimAPlot, CLAIM_MS, check, doneWithLand, held, launch, PHONE, PHONE_SMALL, SHOWN_MS, startServer, TV } from './harness';
import { ELECTION_WAIT_MS, readyThroughTheElection } from './politics-steps';
import { AUDIT_JS, MONTH_END_JS, type AuditRead, type AuditScope } from './small-phone-audit';
import { doneThroughTheElection } from './table-steps';

const PHASE_SCALE = 0.1;
const PRESS_MS = 2_000;
/** Development's one clock runs on wall time, held or not: enough for two MULEs and every read. */
const DEV_MS = 120_000;
/** Two MULEs and their outfits, whatever the seed deals. */
const DEV_MONEY = 2_000;
const NAME = 'Heiko';
/** A long AI name, so the tables are read with names that must give way. */
const LONG_NAME = 'The Big Spender';

/** The rail header, less the table chat in it (WS6's: the seat names and chat lines). */
const RAIL: AuditScope = { roots: ['[data-testid=guide] > header', '[data-testid=now]'], skip: ['[data-testid=table-chat]'] };
/** A WS4 screen: all of it, less the table chat. */
const WHOLE: AuditScope = { roots: ['[data-testid=game-shell]'], skip: ['[data-testid=table-chat]'] };
/**
 * Out on the development map: the rail header and the map. The plot card (the rail's body and its footer) is excluded:
 * it retires in arcade C14, so it is measured and printed, not asserted. The plots are the map's own grid, 13 across
 * the stage, 31.8 px at 667: not counted as taps, since the map's zoom (C11) is what makes them bigger.
 */
const DEV_MAP: AuditScope = { roots: [...RAIL.roots, '[data-testid=dev-map]'], skip: RAIL.skip, tapsNotCounted: ['[data-testid^=map-plot-]'] };
/**
 * Month end and game over: the whole screen. WS6's fidelity rulings make two texts truncate, printed, not failed: the
 * folded Now card's title is one line (M-4), and a league table's name gives way so its numbers stay in the panel
 * (D-1/D-2).
 */
const MONTH_END: AuditScope = { ...WHOLE, truncates: ['[data-testid=now-title]', '[data-testid^=name-]'] };

type Read = { screen: string; small: AuditRead; base: AuditRead; c20?: { small: string[]; base: string[] } };
/** The screens whose rail is the game shell's, with your name in its header: every phase, not the lobby. */
const GAME_RAIL = /^(planning|land grant|development|production|the goods auction|month end|game over)/;

const started = Date.now();
const { server, base } = await startServer({ maxMonths: 2, phaseScale: PHASE_SCALE, seed: () => 1 });
const browser = await launch();
const errors: string[] = [];
const reads: Read[] = [];
try {
  const phone = await (await browser.newContext(PHONE_SMALL)).newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  let code = '';

  /** Reads `scope` at 667×375, then 844×390, and leaves the phone at 667×375; with the clock held once in a room. */
  const both = async (screen: string, scope: AuditScope, prep?: () => Promise<unknown>) => {
    const step = async () => {
      const small = await readAt(phone, PHONE_SMALL.viewport, scope, prep);
      const wide = await readAt(phone, PHONE.viewport, scope, prep);
      await phone.setViewportSize(PHONE_SMALL.viewport);
      reads.push({ screen, small, base: wide });
    };
    await (code ? held(server, code, step) : step());
  };
  /** `both` with MONTH_END's scope, and C20's own read at each size. */
  const monthEnd = async (screen: string) => {
    const c20 = { small: [] as string[], base: [] as string[] };
    await both(screen, MONTH_END, async () => {
      const at = phone.viewportSize()?.width === PHONE_SMALL.viewport.width ? c20.small : c20.base;
      at.push(...((await phone.evaluate(`(${MONTH_END_JS})()`)) as string[]));
    });
    reads.at(-1)!.c20 = c20;
  };

  await phone.goto(base);
  await phone.getByPlaceholder(NAME).waitFor();
  await both('start', { roots: ['#root'], skip: [] });
  await phone.getByPlaceholder(NAME).fill(NAME);
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
  const openTv = async () => {
    const page = await (await browser.newContext(TV)).newPage();
    await page.goto(`${base}/table?room=${code}`);
    return page;
  };
  let tv = await openTv();
  await tv.getByTestId('room-code').waitFor();
  await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(2).waitFor();
  await both('lobby, host', { roots: ['[data-testid=lobby]'], skip: [] });
  await phone.getByRole('button', { name: 'Start game' }).click();
  await phone.locator('[data-phase=planning]').waitFor({ timeout: SHOWN_MS });
  nameAnAi(code, LONG_NAME);

  const ctx = { phone, tv, check, server, code, held: <T>(step: () => Promise<T>) => held(server, code, step) };
  await both('planning, the election', RAIL);
  await doneThroughTheElection(ctx, PHASE_SCALE * ELECTION_WAIT_MS + 10_000);
  await readyThroughTheElection(phone, SHOWN_MS);
  await phone.locator('[data-phase=landGrant]').waitFor({ timeout: SHOWN_MS });
  await both('land grant', RAIL);
  await claimAPlot(phone, CLAIM_MS, 'B-AC-11: the phone claims a plot for its plot card');
  await doneWithLand(phone);

  const dev = phone.locator('[data-phase=development]');
  await dev.waitFor({ timeout: 20_000 });
  giveDevelopment(code);
  await both('development, the store hall', WHOLE);
  await phone.locator('[data-shop=corral]:not([disabled])').click({ timeout: PRESS_MS });
  await phone.locator('[data-shop=energy]:not([disabled])').click({ timeout: PRESS_MS });
  await dev.getByRole('button', { name: 'Walk out to the map' }).click({ timeout: PRESS_MS });
  await dev.getByRole('button', { name: 'Install here' }).click({ timeout: PRESS_MS });
  await dev.getByText(/Your MULE here makes/).waitFor({ timeout: PRESS_MS });
  await dev.getByRole('button', { name: 'Store', exact: true }).click({ timeout: PRESS_MS });
  await phone.locator('[data-shop=corral]:not([disabled])').click({ timeout: PRESS_MS });
  await phone.locator('[data-shop=food]:not([disabled])').click({ timeout: PRESS_MS });
  await dev.getByRole('button', { name: 'Walk out to the map' }).click({ timeout: PRESS_MS });
  const swap = dev.getByRole('button', { name: 'Replace MULE' });
  await swap.waitFor({ timeout: PRESS_MS });
  await both('development, your plot with a MULE', DEV_MAP);
  const filter = dev.getByRole('button', { name: /^(Fit a filter|Filter fitted)/ });
  for (const size of [PHONE_SMALL.viewport, PHONE.viewport]) {
    await phone.setViewportSize(size);
    const card: string[] = [];
    for (const [what, button] of [['swap', swap], ['filter', filter]] as const) {
      await button.evaluate((e) => e.scrollIntoView({ block: 'end' }));
      const box = await button.boundingBox();
      card.push(`${what} ${box ? `${box.width.toFixed(1)}×${box.height.toFixed(1)}` : 'absent'}${(await inView(phone, button)) ? ' in full' : ' cut'}`);
    }
    console.log(`  plot card at ${size.width}×${size.height}, measured, not asserted (retires in arcade C14): ${card.join(', ')}`);
    const spill = await dev.getByRole('button', { name: 'Colony store' }).evaluate((plot) => {
      const chip = [...plot.querySelectorAll('span')].find((s) => s.textContent === 'STORE');
      if (!chip) return Infinity;
      const p = plot.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      return Math.max(p.left - c.left, c.right - p.right, p.top - c.top, c.bottom - p.bottom);
    });
    check(spill <= 0.5, `B-AC-11: at ${size.width}×${size.height} the map's STORE chip sits inside its plot, out by ${spill} px`);
  }
  await phone.setViewportSize(PHONE_SMALL.viewport);
  await phone.getByTestId('move-to-phone').click({ timeout: PRESS_MS });
  await phone.getByTestId('host-dialog').waitFor({ timeout: PRESS_MS });
  await both('the move-to-phone dialog', { roots: ['[data-testid=host-dialog]'], skip: [] });
  await phone.keyboard.press('Escape');
  await dev.getByRole('button', { name: 'Go to the pub and end your turn' }).click({ timeout: PRESS_MS });

  await phone.locator('[data-phase=production]').waitFor({ timeout: 20_000 });
  await both('production', RAIL);
  const auction = phone.locator('[data-phase=auction]');
  await auction.waitFor({ timeout: 30_000 });
  await both('the goods auction', RAIL);
  const done = auction.getByRole('button', { name: /^(Ready|Done with .+)$/ });
  const end = phone.locator('[data-phase=upkeep]');
  for (let i = 0; i < 40 && !(await end.count()); i++) {
    await done.or(end).first().waitFor({ timeout: 30_000 });
    await done.click({ timeout: PRESS_MS }).catch(() => undefined);
  }
  await end.getByTestId('league').waitFor({ timeout: 30_000 });
  await monthEnd('month end');
  const air = setAir(code, collapseAir());
  await end.getByTestId('collapse-banner').waitFor({ timeout: PRESS_MS });
  await monthEnd('month end, Collapse');
  await tv.context().close();
  await end.getByTestId('phone-only-monthend').waitFor({ timeout: PRESS_MS });
  await monthEnd('month end, Collapse, no TV');
  setAir(code, air);
  await end.getByTestId('collapse-banner').waitFor({ state: 'detached', timeout: PRESS_MS });
  await monthEnd('month end, no TV');
  tv = await openTv();
  await end.getByTestId('phone-monthend').waitFor({ timeout: SHOWN_MS });
  await end.getByTestId('ready').click({ timeout: PRESS_MS });
  await phone.locator('[data-phase=planning]').waitFor({ timeout: SHOWN_MS });

  const over = phone.locator('[data-phase=gameOver]');
  await playToTheEnd(code, over);
  await monthEnd('game over');
  await tv.context().close();
  await over.getByTestId('phone-only-gameover').waitFor({ timeout: PRESS_MS });
  await monthEnd('game over, no TV');

  report(reads);
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e small phone: ok (${((Date.now() - started) / 1_000).toFixed(1)} s)`);
} catch (err) {
  console.error(`e2e small phone: FAILED (${((Date.now() - started) / 1_000).toFixed(1)} s)`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);

async function readAt(phone: Page, size: { width: number; height: number }, scope: AuditScope, prep?: () => Promise<unknown>): Promise<AuditRead> {
  await phone.setViewportSize(size);
  // Two frames: the container queries and the map's plot size settle on the first.
  await phone.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await prep?.();
  return (await phone.evaluate(`(${AUDIT_JS})(${JSON.stringify(scope)})`)) as AuditRead;
}

async function inView(phone: Page, button: ReturnType<Page['locator']>): Promise<boolean> {
  return button.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const rail = el.closest('[data-testid=guide] > .overflow-y-auto, [data-testid=actions]')?.getBoundingClientRect();
    return !!rail && b.top >= rail.top - 1 && b.bottom <= rail.bottom + 1 && b.left >= rail.left - 1 && b.right <= rail.right + 1;
  });
}

/** Test fixture: development's clock and money for the walk-through, from now. */
function giveDevelopment(code: string): void {
  const room = server.registry.get(code) as unknown as { game: { devEndsAt: number; ctx: { now(): number; changed(): void }; state: { players: { name: string; money: number }[] } } };
  const { game } = room;
  game.devEndsAt = game.ctx.now() + DEV_MS;
  const me = game.state.players.find((p) => p.name === NAME);
  check(me, `${NAME} plays in the game`);
  me.money += DEV_MONEY;
  game.ctx.changed();
}

/** Test fixture: the last AI seat takes `name`. */
function nameAnAi(code: string, name: string): void {
  const room = server.registry.get(code) as unknown as { game: { seats: { name: string; isAi: boolean }[] } };
  const ai = room.game.seats.filter((s) => s.isAi).at(-1);
  check(ai, 'an AI seat at the table');
  ai.name = name;
}

/** The air level just inside Collapse. */
function collapseAir(): number {
  const band = POLLUTION.bands.find((b) => b.name === 'collapse');
  check(band, 'the air has a Collapse band');
  return band.from + 4;
}

/** Test fixture: sets the colony's air and shows it on every screen; returns the air it replaced. */
function setAir(code: string, air: number): number {
  const room = server.registry.get(code) as unknown as { game: { state: { air: number } }; broadcast(): void };
  const was = room.game.state.air;
  room.game.state.air = air;
  room.broadcast();
  return was;
}

/** Test fixture: the phone's seat plays month 2 through the server, Ready at each stop and off to the pub in development. */
async function playToTheEnd(code: string, over: Locator): Promise<void> {
  const room = server.registry.get(code) as unknown as { game: { handle(seat: string, intent: object): void; viewFor(seat: null): { phase: string } }; broadcast(): void };
  const deadline = Date.now() + 60_000;
  while (!(await over.count())) {
    check(Date.now() < deadline, 'month 2 reaches game over within a minute');
    try {
      room.game.handle('s1', { type: room.game.viewFor(null).phase === 'development' ? 'pub' : 'ready' });
    } catch {
      // Refused at a stop that moves on by itself.
    }
    room.broadcast();
    await new Promise((r) => setTimeout(r, 150));
  }
}

/**
 * Prints every screen's reads and fails with every broken box, named: B-AC-11 at both sizes, the rail's window at 667
 * no shorter than at 844, and the player's name shown whole in the rail header; C20's reads of month end and game
 * over at both sizes. The truncations WS6 ruled are printed.
 */
function report(all: Read[]): void {
  const fails: string[] = [];
  for (const { screen, small, base, c20 } of all) {
    console.log(`  ${screen}: rail ${small.railWindow ?? '-'} px at 667×375, ${base.railWindow ?? '-'} px at 844×390`);
    for (const [size, read, mine] of [['667×375', small, c20?.small], ['844×390', base, c20?.base]] as const) {
      for (const r of read.ruled) console.log(`    ${size}, ruled to truncate: ${r}`);
      for (const f of mine ?? []) fails.push(`C20: ${screen} at ${size}: ${f}`);
      for (const f of read.fails) fails.push(`B-AC-11: ${screen} at ${size}: ${f}`);
      if (read.name && !(read.name.text === NAME && read.name.whole)) fails.push(`B-AC-11: ${screen} at ${size}: the rail header shows "${read.name.text}" cut, not ${NAME} whole`);
    }
    if (GAME_RAIL.test(screen) && small.railWindow !== null && base.railWindow !== null && small.railWindow < base.railWindow)
      fails.push(`B-AC-11: ${screen}: the rail's window is ${small.railWindow} px at 667×375, shorter than its ${base.railWindow} px at 844×390`);
    if (GAME_RAIL.test(screen) && small.name === null) fails.push(`B-AC-11: ${screen}: the rail header names no player`);
  }
  check(fails.length === 0, `${fails.length} broken boxes:\n${fails.join('\n')}`);
}
