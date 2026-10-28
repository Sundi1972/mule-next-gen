/**
 * WS4's steps in smoke.ts's whole game: a picked colour (B-AC-8), map zoom (B-AC-2, T-AC-9), the move to another device
 * (B-AC-7, B-AC-13) and plots you can read from the couch (B-AC-9, look A).
 */
import { GOODS, type GameState, type Stock } from '@mule/engine';
import type { MuleView, ServerEnvelope, TableView } from '@mule/protocol';
import type { Locator, Page } from 'playwright';
import { COLOUR_NAME, type Slot } from '@mule/ui';
import { check, checkLink, EXPIRED, gone, headerSlot, MOVED, onStartScreen, PHONE, qrLink, seatToken, shows, SHOWN_MS, type GameStepContext } from './harness';

/** B-AC-2: a zoomed plot is at least this wide, a thumb's width. */
const MIN_PLOT_PX = 44;
/** B-AC-9 (WS4, plot look A): a mark's width as a share of its plot's, with slack for rounding and the 2 px minimums. */
const LOOK_A = { tab: 0.46, disc: 0.62 };
const SHARE_SLACK = 0.06;
/** T-AC-9 watches the wire from the first tap to at least this long after the second. */
const QUIET_MS = 400;
const PRESS_MS = 2_000;
const READY = '[data-testid=handoff-qr][data-state=ready]';

export type Plot = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
/** A plot as drawn: its x-y, its label, its box on screen and every mark inside it with a test id. */
type DrawnPlot = { at: string; label: string; box: Box; marks: { id: string; box: Box; visible: boolean }[] };
type Game = { state: GameState; devEndsAt: Map<string, number>; phaseEndsAt: number | null; ctx: { now(): number } };

/** T-AC-9: counts the intents a page sends on its game sockets. Attach before the page loads, as watchShow. */
export function watchIntents(page: Page): () => number {
  let intents = 0;
  page.on('websocket', (ws) =>
    ws.on('framesent', ({ payload }) => {
      if (typeof payload === 'string' && (JSON.parse(payload) as { t?: string }).t === 'intent') intents++;
    }),
  );
  return () => intents;
}

/**
 * T-AC-1, month 1 on a table that plays politics: presses Done through each election stage until the server says the
 * election is over, leaving planning proper on screen with its Ready unpressed, for the steps that need planning's
 * screens. Each press is made held: the election steps only on its own clock, so the stage cannot close under the
 * press and turn it into planning's Ready, which would end planning. Returns a line for the log.
 */
export async function doneThroughTheElection(ctx: GameStepContext, timeout: number): Promise<string> {
  const started = Date.now();
  const deadline = started + timeout;
  const ready = ctx.phone.locator('[data-phase=planning] [data-testid=ready]:not([disabled])');
  const { name } = await playingAs(ctx.phone);
  const seat = gameOf(ctx).state.players.find((p) => p.name === name);
  check(seat, `T-AC-1: ${name} plays in the game`);
  const stages: string[] = [];
  for (;;) {
    const { state } = gameOf(ctx);
    check(state.phase === 'planning', `T-AC-1: the election ends inside planning, but the game is in ${state.phase}`);
    const election = state.politics?.election;
    if (!election || election.stage === 'over') return `${stages.join(' > ') || 'no election'}, over in ${((Date.now() - started) / 1_000).toFixed(2)} s`;
    check(Date.now() < deadline, `T-AC-1: the month-1 election is over within ${timeout} ms, still at ${election.stage}`);
    if (stages.at(-1) !== election.stage) stages.push(election.stage);
    const stage = election.stage;
    await ctx.held(async () => {
      const now = gameOf(ctx).state.politics?.election;
      if (now?.stage !== stage || (stage !== 'nominate' && stage !== 'ballot') || now.done.includes(seat.id)) return;
      await ready.click({ timeout: PRESS_MS });
      await until(() => gameOf(ctx).state.politics?.election?.done.includes(seat.id) === true, `T-AC-1: the server counts ${name} Done in the ${stage} stage`);
    });
    await until(() => gameOf(ctx).state.politics?.election?.stage !== stage || Date.now() >= deadline, `T-AC-1: the election moves on from ${stage}`);
  }
}

/** Waits for a condition on the in-process server's state, which no page event announces; fails with `message` after SHOWN_MS. */
async function until(ok: () => boolean, message: string): Promise<void> {
  const end = Date.now() + SHOWN_MS;
  while (!ok()) {
    check(Date.now() < end, message);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** B-AC-8: the colour smoke's phone picks. Free at a three-seat table, and no seat's default there. */
const ROSE = 5 as Slot;

/** B-AC-8, in the lobby: the phone picks Rose; held, the TV lobby draws its mark in Rose. */
export async function thePhonePicksRose(ctx: GameStepContext): Promise<void> {
  const { phone, tv } = ctx;
  const chip = phone.getByTestId(`colour-${ROSE}`);
  check(await chip.isEnabled({ timeout: SHOWN_MS }), `B-AC-8: ${COLOUR_NAME[ROSE]} is free for the phone to pick`);
  await chip.click();
  check(await shows(phone.locator(`[data-testid=colour-${ROSE}][aria-pressed=true]`)), `B-AC-8: the phone picks ${COLOUR_NAME[ROSE]}`);
  const name = ((await phone.getByTestId('hero-name').textContent()) ?? '').trim();
  await ctx.held(() => checkRoster(tv.locator('li'), name, `B-AC-8: the TV lobby draws ${name}'s mark in ${COLOUR_NAME[ROSE]}`));
}

/** B-AC-8, held: the TV's roster in `phase` draws the phone's player in Rose; in development the TV map draws every plot of theirs in Rose too. */
export async function theTvDrawsRose(ctx: GameStepContext, phase: 'planning' | 'development'): Promise<void> {
  await ctx.held(async () => {
    const { phone, tv } = ctx;
    const { name } = await playingAs(phone);
    const screen = tv.locator(`[data-phase=${phase}]`);
    check(await shows(screen), `B-AC-8: the TV shows ${phase}`);
    await checkRoster(screen.locator('li'), name, `B-AC-8: the TV's ${phase} roster draws ${name} in ${COLOUR_NAME[ROSE]}`);
    if (phase !== 'development') return;
    const { state } = gameOf(ctx);
    const seat = state.players.find((p) => p.name === name);
    check(seat, `B-AC-8: ${name} plays in the game`);
    const plots = state.tiles.filter((t) => t.owner === seat.id).length;
    const drawn = await tvPlotsIn(tv, ROSE);
    check(plots > 0 && drawn.length === plots && drawn.every((s) => s === String(ROSE)), `B-AC-8: the TV map draws ${name}'s ${plots} plots in ${COLOUR_NAME[ROSE]}, got [${drawn.join(', ')}]`);
  });
}

async function checkRoster(rows: Locator, name: string, message: string): Promise<void> {
  const slots = await rosterSlots(rows, name);
  check(slots.length > 0 && slots.every((s) => s === String(ROSE)), `${message}, got slots [${slots.join(', ')}]`);
}

/** B-AC-2 (negative), held, in the land grant before the phone's first claim: no zoom button, and a double-tap changes no plot. */
export async function noZoomBeforeYourFirstPlot(ctx: GameStepContext): Promise<void> {
  await ctx.held(async () => {
    const grant = ctx.phone.locator('[data-phase=landGrant]');
    await grant.getByTestId('map-viewport').waitFor({ timeout: PRESS_MS });
    check((await grant.getByTestId('zoom-button').count()) === 0, 'B-AC-2: with no plots there is no zoom button');
    const { width, height } = mapOf(ctx);
    const before = await boxes(plots(grant));
    check(before.length === width * height, `B-AC-2: the grant map draws ${width}×${height} plots, got ${before.length}`);
    const left = Math.min(...before.map((b) => b.x));
    const top = Math.min(...before.map((b) => b.y));
    const right = Math.max(...before.map((b) => b.x + b.width));
    const bottom = Math.max(...before.map((b) => b.y + b.height));
    await doubleTapAt(ctx.phone, (left + right) / 2, (top + bottom) / 2);
    await ctx.phone.waitForTimeout(QUIET_MS);
    const after = await boxes(plots(grant));
    const moved = after.filter((b, i) => Math.abs(b.width - before[i]!.width) > 0.5 || Math.abs(b.x - before[i]!.x) > 0.5).length;
    check(moved === 0, `B-AC-2: with no plots a double-tap changes nothing, yet ${moved} plots moved or resized`);
  });
}

/** B-AC-2, held, right after the phone's claim: the grant map now has the zoom button. The claim itself proves the wire watch sees intents. */
export async function zoomButtonOnceYouOwnAPlot(ctx: GameStepContext, intents: () => number): Promise<void> {
  await ctx.held(async () => {
    check(intents() >= 1, `T-AC-9: the frame watcher saw the claim go out, ${intents()} intents`);
    const grant = ctx.phone.locator('[data-phase=landGrant]');
    check((await grant.count()) === 1, 'B-AC-2: the land grant still shows right after the claim, to look for the zoom button');
    check((await grant.getByTestId('zoom-button').count()) === 1, 'B-AC-2: once you own a plot the grant map shows the zoom button');
  });
}

/**
 * B-AC-2 and T-AC-9 in development, unheld, on the map inside the phone's own turn: a double-tap on your plot zooms to
 * your land, selects that plot and sends nothing; the zoom survives a store trip; a second double-tap, and the corner
 * button twice, go back and forth. Returns the sizes and the turn left, for the log.
 */
export async function doubleTapZoomsToYourLand(ctx: GameStepContext, intents: () => number): Promise<string> {
  const { phone } = ctx;
  const dev = phone.locator('[data-phase=development]');
  await dev.getByTestId('map-viewport').waitFor({ timeout: PRESS_MS });
  const { width, height } = mapOf(ctx);
  const cells = width * height;
  const mine = ownedBy(await headerSlot(phone, 'B-AC-2'));
  const own = dev.getByTestId('map-viewport').getByRole('button', { name: mine });
  const labels = await plots(dev).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  const index = labels.findIndex((label) => mine.test(label));
  check(index >= 0, `B-AC-2: the phone owns a plot on its development map, matching ${mine}`);
  const target = { x: index % width, y: Math.floor(index / width) };
  const whole = await widths(own);

  const sent = intents();
  await doubleTap(phone, plots(dev).nth(index));
  const tapped = Date.now();
  const zoomed = await checkZoomedToOwnLand(dev, own, whole, 'B-AC-2: after a double-tap');
  await checkReadout(dev, target, 'T-AC-9: the double-tap selects the tapped plot');
  await phone.waitForTimeout(Math.max(0, tapped + QUIET_MS - Date.now()));
  check(intents() === sent, `T-AC-9: a double-tap sends no intent, sent ${intents() - sent}`);

  await dev.getByRole('button', { name: 'Store', exact: true }).tap({ timeout: PRESS_MS });
  await dev.getByRole('button', { name: 'Walk out to the map' }).tap({ timeout: PRESS_MS });
  const back = await checkZoomedToOwnLand(dev, own, whole, 'B-AC-2: the zoom survives a store trip:');
  check(back.every((w, i) => Math.abs(w - zoomed[i]!) < 0.5), `B-AC-2: the zoom survives a store trip: your plots are ${zoomed.map(px).join(', ')} before it, ${back.map(px).join(', ')} after`);

  await doubleTap(phone, plots(dev).nth(index));
  await checkWholeMap(dev, own, whole, cells, 'B-AC-2: after a second double-tap');
  await dev.getByTestId('zoom-button').tap({ timeout: PRESS_MS });
  await checkZoomedToOwnLand(dev, own, whole, 'B-AC-2: after the zoom button');
  await dev.getByTestId('zoom-button').tap({ timeout: PRESS_MS });
  await checkWholeMap(dev, own, whole, cells, 'B-AC-2: after the zoom button again');
  return `plot ${plotName(target)}, whole ${px(whole[0]!)}, zoomed ${px(zoomed[0]!)}; ${turnLeft(ctx)}`;
}

/**
 * B-AC-13 (handoff, in game) and B-AC-7 (in game), held in planning, outside development, whose turn runs on real
 * time: the move dialog opens with a ready code and Escape closes it; then the seat moves to `second`, a device that
 * has not loaded the game, keeping its name, species, colour, money, goods and plots. The TV still draws its plots in
 * its colour, the first device steps aside, and the used link moves nothing. `second` is the phone from here on.
 * Returns a line for the log.
 */
export async function theSeatMovesToAnotherDevice(ctx: GameStepContext, second: Page): Promise<string> {
  const started = Date.now();
  return ctx.held(async () => {
    const { phone: first, tv } = ctx;
    const game = gameOf(ctx);
    const phase = game.state.phase;
    check(phase === 'planning', `B-AC-7 (in game): the move runs held in planning, but the game is in ${phase}`);

    const move = first.getByTestId('move-to-phone');
    check(await shows(move), "B-AC-13 (handoff, in game): the host's game shell has move-to-phone");
    await move.click();
    const dialog = first.getByRole('dialog', { name: 'Move to your phone' });
    check(await shows(dialog.locator(READY)), 'B-AC-13 (handoff, in game): move-to-phone opens "Move to your phone" with a ready code');
    await first.keyboard.press('Escape');
    check(await gone(first.getByTestId('host-dialog')), 'B-AC-13 (handoff, in game): Escape closes the move dialog');
    check(await move.evaluate((el) => el === document.activeElement), 'B-AC-13 (handoff, in game): focus goes back to move-to-phone');

    const was = await playingAs(first);
    const seat = game.state.players.find((p) => p.name === was.name);
    check(seat, `B-AC-7 (in game): ${was.name} plays in the game`);
    await move.click();
    check(await shows(dialog.getByText(`you, ${was.name}`, { exact: true })), `B-AC-7 (in game): the dialog says the phone becomes "you, ${was.name}"`);
    const link = await qrLink(dialog, 'B-AC-7 (in game)');
    checkLink(link, ctx.code, await seatToken(first), was.name, 'B-AC-7 (in game)');
    const before = holdings(game.state.tiles.filter((t) => t.owner === seat.id).length, seat.stock);
    const received = latestView(second);
    await second.goto(link);
    check(await shows(second.getByTestId('game-shell')), 'B-AC-7 (in game): the second device opens the link into the game');
    check((await second.getByTestId('lobby').count()) === 0, 'B-AC-7 (in game): the second device is not in the lobby');
    const is = await playingAs(second);
    check(is.name === was.name, `B-AC-7 (in game): the second device is ${was.name}, got "${is.name}"`);
    check(is.mark === was.mark, `B-AC-7 (in game): the second device keeps ${was.name}'s species, "${was.mark}", got "${is.mark}"`);
    check(is.slot === was.slot, `B-AC-7 (in game): the second device keeps ${was.name}'s colour, slot ${was.slot}, got slot ${is.slot}`);
    check(is.money === was.money, `B-AC-7 (in game): the second device has ${was.name}'s money, ${was.money}, got ${is.money}`);
    const view = received();
    check(view?.me, 'B-AC-7 (in game): the second device received its player view');
    const me = view.me;
    const has = holdings(view.tiles.filter((t) => t.owner === me.id).length, me.stock);
    check(has.plots === before.plots, `B-AC-7 (in game): the second device has ${was.name}'s ${before.plots} plots, got ${has.plots}`);
    check(has.goods === before.goods, `B-AC-7 (in game): the second device has ${was.name}'s goods, ${before.goods}, got ${has.goods}`);

    const plots = before.plots;
    const drawn = await tvPlotsIn(tv, Number(was.slot));
    check(plots > 0 && drawn.length === plots && drawn.every((s) => s === was.slot), `B-AC-7 (in game): the TV still draws ${was.name}'s ${plots} plots in slot ${was.slot}, got [${drawn.join(', ')}]`);

    check(await shows(first.getByText(MOVED)), `B-AC-7 (in game): the first device shows "${MOVED}"`);
    check(await onStartScreen(first), 'B-AC-7 (in game): the first device steps aside to the start screen');
    const browser = second.context().browser();
    check(browser, 'B-AC-7 (in game): the second device runs in a browser that can open a third, to reuse the link');
    const reused = await (await browser.newContext(PHONE)).newPage();
    const reusedErrors: string[] = [];
    reused.on('pageerror', (e) => reusedErrors.push(e.message));
    await reused.goto(link);
    check(await shows(reused.getByTestId('removed-notice').getByText(EXPIRED)), `B-AC-7 (in game): the same link opened again shows "${EXPIRED}"`);
    check(await onStartScreen(reused), 'B-AC-7 (in game): the used link stays on the start screen');
    check(reusedErrors.length === 0, `B-AC-7 (in game): no page errors on the device that reused the link: ${reusedErrors.join('; ')}`);
    await reused.context().close();
    check(
      (await shows(second.getByTestId('game-shell'))) && (await playingAs(second)).name === was.name,
      `B-AC-7 (in game): the used link does not move the seat: the second device is still ${was.name} in the game`,
    );
    check(gameOf(ctx).state.phase === phase, `B-AC-7 (in game): the move ends no phase: the game was in ${phase}, now ${gameOf(ctx).state.phase}`);
    return `${was.name} moved in ${phase} with ${plots} plots, ${((Date.now() - started) / 1_000).toFixed(2)} s held`;
  });
}

/**
 * B-AC-13 (handoff, in game): opens the move dialog during production, held so production cannot end first. Returns its
 * link, for moveDialogOutlivedThePhase once production has ended on its own clock.
 */
export async function moveDialogOpensInProduction(ctx: GameStepContext, timeout: number): Promise<string> {
  const { phone } = ctx;
  const production = phone.locator('[data-phase=production]');
  await production.waitFor({ timeout });
  return ctx.held(async () => {
    await phone.getByTestId('move-to-phone').click({ timeout: PRESS_MS });
    const dialog = phone.getByRole('dialog', { name: 'Move to your phone' });
    check(await shows(dialog.locator(READY)), 'B-AC-13 (handoff, in game): the moved device opens the move dialog with a ready code');
    const link = await qrLink(dialog, 'B-AC-13 (handoff, in game)');
    check((await production.count()) === 1, 'B-AC-13 (handoff, in game): the move dialog is open with its code while production shows');
    return link;
  });
}

/** B-AC-13 (handoff, in game): once the phase after production shows, the dialog is still open with the same ready code; Escape closes it. */
export async function moveDialogOutlivedThePhase(ctx: GameStepContext, link: string): Promise<void> {
  const { phone } = ctx;
  const dialog = phone.getByRole('dialog', { name: 'Move to your phone' });
  const now = (await phone.locator('[data-phase]').first().getAttribute('data-phase')) ?? 'nothing';
  check(now !== 'production', 'B-AC-13 (handoff, in game): production has given way to the next phase');
  check(
    (await shows(dialog.locator(READY))) && (await qrLink(dialog, 'B-AC-13 (handoff, in game)')) === link,
    `B-AC-13 (handoff, in game): after production gives way to ${now}, the dialog is still open with the same ready code`,
  );
  await phone.keyboard.press('Escape');
  check(await gone(phone.getByTestId('host-dialog')), 'B-AC-13 (handoff, in game): Escape closes the move dialog after the phase change');
  check(await phone.getByTestId('move-to-phone').evaluate((el) => el === document.activeElement), "B-AC-13 (handoff, in game): focus goes back to the new phase's move-to-phone");
}

/** B-AC-9 (WS4, plot look A), held in development: the TV map shows who owns each plot and what is installed on it. */
export async function theTvShowsWhoOwnsEachPlot(ctx: GameStepContext): Promise<string> {
  return ctx.held(() => checkPlotLook(ctx.tv.locator('[data-phase=development]'), 'TV, development', { installed: true }));
}

/**
 * B-AC-9 (WS4, plot look A) on the phone's development map, right after the phone has selected a plot of its own and
 * installed a MULE this turn: its owners, its installed goods, and the plot its rail reads out as selected.
 */
export async function thePhoneShowsItsSelectedPlot(ctx: GameStepContext): Promise<string> {
  const dev = ctx.phone.locator('[data-phase=development]');
  const heading = (await dev.getByTestId('plot-title').textContent({ timeout: PRESS_MS })) ?? '';
  const named = heading.match(/(\d+)·(\d+)/);
  check(named, `B-AC-9 (WS4, plot look A, phone): the rail names the selected plot, got "${heading}"`);
  const selected = { x: Number(named[1]) - 1, y: Number(named[2]) - 1 };
  return checkPlotLook(dev.getByTestId('dev-map'), 'phone, development', { installed: true, selected });
}

/**
 * B-AC-9 (WS4, plot look A) on one map, measured on screen as drawn, so a zoomed or scaled map shows the same shares:
 * every owned plot holds its owner's tab at about 0.46 of the plot's width; every installed good sits on a disc of about
 * 0.62; `selected`'s ring reaches outside the plot on every side, and its pin shows. Returns a line for the log.
 */
export async function checkPlotLook(map: Locator, where: string, want: { installed: boolean; selected?: Plot }): Promise<string> {
  const id = `B-AC-9 (WS4, plot look A, ${where})`;
  const drawn = await drawnPlots(map);
  check(drawn.length > 0, `${id}: the map draws its plots as map-plot-<x>-<y>, found none`);
  const owned = drawn.filter((p) => /\bowned by player \d+\b/.test(p.label));
  check(owned.length > 0, `${id}: the map has owned plots to measure`);
  const tabs = owned.map((p) => {
    const tab = p.marks.filter((m) => m.id === `owner-${p.at}`);
    check(tab.length === 1, `${id}: the owned plot ${p.at} holds one owner's tab, found ${tab.length}`);
    return tab[0]!.box.width / p.box.width;
  });
  check(tabs.every((s) => Math.abs(s - LOOK_A.tab) <= SHARE_SLACK), `${id}: each owner's tab is ${LOOK_A.tab} ± ${SHARE_SLACK} of its plot, got ${shares(tabs)}`);
  const discs = drawn.flatMap((p) => p.marks.filter((m) => m.id === `installed-${p.at}`).map((m) => m.box.width / p.box.width));
  check(!want.installed || discs.length > 0, `${id}: the map shows an installed good`);
  check(discs.every((s) => Math.abs(s - LOOK_A.disc) <= SHARE_SLACK), `${id}: each installed good's disc is ${LOOK_A.disc} ± ${SHARE_SLACK} of its plot, got ${shares(discs)}`);
  const plot = owned[0]!.box.width;
  const read = `${where}: tabs ${shares(tabs)}, discs ${shares(discs) || 'none'} of a ${px(plot)} plot`;
  if (!want.selected) return read;

  const at = `${want.selected.x}-${want.selected.y}`;
  const rings = drawn.filter((p) => p.marks.some((m) => m.id === 'selected-ring'));
  check(rings.length === 1 && rings[0]!.at === at, `${id}: the selected plot ${at} alone shows the selected ring, found it on [${rings.map((p) => p.at).join(', ')}]`);
  const sel = rings[0]!;
  const ring = sel.marks.find((m) => m.id === 'selected-ring')!.box;
  const out = [sel.box.x - ring.x, sel.box.y - ring.y, ring.x + ring.width - (sel.box.x + sel.box.width), ring.y + ring.height - (sel.box.y + sel.box.height)];
  check(out.every((d) => d > 0), `${id}: the selected ring reaches outside plot ${at} on every side, by ${out.map(px).join(', ')} (left, top, right, bottom)`);
  const pins = sel.marks.filter((m) => m.id === 'selected-pin');
  check(pins.length === 1 && pins[0]!.visible && pins[0]!.box.width > 0 && pins[0]!.box.height > 0, `${id}: the selected plot ${at} shows its pin`);
  return `${read}; ${at} selected, its ring ${px(Math.min(...out))} or more outside`;
}

/** Every plot on the map with its marks, in one read. */
async function drawnPlots(map: Locator): Promise<DrawnPlot[]> {
  // Kept free of named functions: tsx's keepNames wraps them with `__name`, which the page lacks.
  return map.evaluate((root) =>
    [...root.querySelectorAll('[data-testid^="map-plot-"]')].map((p) => {
      const r = p.getBoundingClientRect();
      return {
        at: (p.getAttribute('data-testid') ?? '').slice('map-plot-'.length),
        label: p.getAttribute('aria-label') ?? '',
        box: { x: r.x, y: r.y, width: r.width, height: r.height },
        marks: [...p.querySelectorAll('[data-testid]')].map((m) => {
          const b = m.getBoundingClientRect();
          return { id: m.getAttribute('data-testid') ?? '', box: { x: b.x, y: b.y, width: b.width, height: b.height }, visible: m.checkVisibility({ opacityProperty: true, visibilityProperty: true }) };
        }),
      };
    }),
  );
}

function shares(list: number[]): string {
  return list.map((s) => s.toFixed(2)).join(', ');
}

/** A seat's plot count and its goods, written out good by good so two stocks compare as text. */
function holdings(plots: number, stock: Stock): { plots: number; goods: string } {
  return { plots, goods: GOODS.map((g) => `${g} ${stock[g]}`).join(', ') };
}

/** The latest game a page was sent on its game sockets. Attach before the page loads. */
function latestView(page: Page): () => MuleView | null {
  let latest: MuleView | null = null;
  page.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const msg = JSON.parse(payload) as ServerEnvelope<MuleView>;
      if (msg.t === 'view') latest = (msg.view as TableView<MuleView>).game ?? latest;
    }),
  );
  return () => latest;
}

/** Who this page plays as, from its game shell's header: name, species (the mark's label), colour (its slot) and money. */
async function playingAs(page: Page): Promise<{ name: string; mark: string; slot: string; money: string }> {
  const mark = page.getByTestId('guide').locator('header [role=img][data-slot]').first();
  return {
    name: ((await mark.locator('xpath=following-sibling::span[1]').textContent()) ?? '').trim(),
    mark: (await mark.getAttribute('aria-label')) ?? '',
    slot: (await mark.getAttribute('data-slot')) ?? '',
    money: ((await page.getByTestId('money').textContent()) ?? '').trim(),
  };
}

/** B-AC-2: each of your plots is at least MIN_PLOT_PX wide, larger than on the whole map, and inside the map's viewport. */
async function checkZoomedToOwnLand(dev: Locator, own: Locator, whole: number[], when: string): Promise<number[]> {
  await settled(dev);
  const sizes = await widths(own);
  check(sizes.every((w) => w >= MIN_PLOT_PX), `${when} each of your plots is ≥ ${MIN_PLOT_PX} px wide, got ${sizes.map(px).join(', ')}`);
  check(sizes.every((w, i) => w > whole[i]! + 0.5), `${when} your plots grew from the whole map's ${whole.map(px).join(', ')}, got ${sizes.map(px).join(', ')}`);
  const view = await viewport(dev);
  const outside = (await boxes(own)).filter((b) => !inside(b, view)).length;
  check(outside === 0, `${when} all your plots are inside the map's viewport, ${outside} are not`);
  return sizes;
}

/** B-AC-2: the map draws all `cells` plots, every one inside its viewport, and yours are back to their whole-map size. */
async function checkWholeMap(dev: Locator, own: Locator, whole: number[], cells: number, when: string): Promise<void> {
  await settled(dev);
  const all = await boxes(plots(dev));
  check(all.length === cells, `${when} the map draws ${cells} plots, got ${all.length}`);
  const view = await viewport(dev);
  const outside = all.filter((b) => !inside(b, view)).length;
  check(outside === 0, `${when} all ${all.length} plots are inside the map's viewport, ${outside} are not`);
  const sizes = await widths(own);
  check(sizes.every((w, i) => Math.abs(w - whole[i]!) < 0.5), `${when} your plots are back to ${whole.map(px).join(', ')}, got ${sizes.map(px).join(', ')}`);
}

async function checkReadout(dev: Locator, plot: Plot, message: string): Promise<void> {
  const heading = (await dev.getByTestId('plot-title').textContent({ timeout: PRESS_MS })) ?? '';
  check(heading.includes(plotName(plot)), `${message}: the rail shows "${heading}", not plot ${plotName(plot)}`);
}

/** Waits for the map's zoom to finish easing; a map that mounted zoomed has nothing to wait for. */
async function settled(screen: Locator): Promise<void> {
  await screen.getByTestId('map').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)), undefined, { timeout: PRESS_MS });
}

/** The game behind the room on the in-process server. */
function gameOf(ctx: GameStepContext): Game {
  const room = ctx.server.registry.get(ctx.code);
  check(room, `a room ${ctx.code} on the server`);
  return (room as unknown as { game: Game }).game;
}

function mapOf(ctx: GameStepContext): { width: number; height: number } {
  const { width, height } = gameOf(ctx).state;
  return { width, height };
}

/** Seconds left of the phone's development turn: its own clock or the phase's, whichever ends first. */
function turnLeft(ctx: GameStepContext): string {
  const game = gameOf(ctx);
  const now = game.ctx.now();
  const ends = Math.min(game.devEndsAt.get('s1') ?? now, game.phaseEndsAt ?? now);
  return `${((ends - now) / 1_000).toFixed(2)} s of the development turn left`;
}

/** The colour slots drawn on the TV map's plots whose label names this colour slot as the owner. */
function tvPlotsIn(tv: Page, slot: number): Promise<string[]> {
  return tv
    .locator('[data-phase] [aria-label*="owned by"]')
    .evaluateAll((els, source) => els.filter((e) => new RegExp(source).test(e.getAttribute('aria-label') ?? '')).map((e) => e.querySelector('[data-slot]')?.getAttribute('data-slot') ?? 'none'), ownedBy(slot).source);
}

/** The colour slots the marks on `name`'s rows draw, among the rows that carry a mark. */
async function rosterSlots(rows: Locator, name: string): Promise<string[]> {
  const mine = rows.filter({ has: rows.page().locator('[role=img][data-slot]'), hasText: name });
  await mine.first().waitFor({ timeout: SHOWN_MS }).catch(() => undefined);
  return mine.evaluateAll((els) => els.map((e) => e.querySelector('[role=img][data-slot]')?.getAttribute('data-slot') ?? 'none'));
}

/** Every plot on the map, row by row: each is labelled with its terrain; player marks are images. */
function plots(screen: Locator): Locator {
  return screen.getByTestId('map-viewport').locator('[aria-label]:not([role=img]):not([data-testid=zoom-button])');
}

/** A plot's label names its owner by colour slot, counted from 1. */
function ownedBy(slot: number): RegExp {
  return new RegExp(`owned by player ${slot + 1}\\b`);
}

function plotName(plot: Plot): string {
  return `${plot.x + 1}·${plot.y + 1}`;
}

function px(width: number): string {
  return `${width.toFixed(1)} px`;
}

async function viewport(screen: Locator): Promise<Box> {
  const box = await screen.getByTestId('map-viewport').boundingBox({ timeout: PRESS_MS });
  check(box, 'B-AC-2: the map has a viewport');
  return box;
}

function inside(b: Box, v: Box): boolean {
  return b.x >= v.x - 0.5 && b.y >= v.y - 0.5 && b.x + b.width <= v.x + v.width + 0.5 && b.y + b.height <= v.y + v.height + 0.5;
}

async function boxes(list: Locator): Promise<Box[]> {
  return list.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map(({ x, y, width, height }) => ({ x, y, width, height })));
}

async function widths(list: Locator): Promise<number[]> {
  return (await boxes(list)).map((b) => b.width);
}

async function doubleTap(phone: Page, plot: Locator): Promise<void> {
  const box = await plot.boundingBox({ timeout: PRESS_MS });
  check(box, 'B-AC-2: the plot to double-tap is on screen');
  await doubleTapAt(phone, box.x + box.width / 2, box.y + box.height / 2);
}

/** Two taps at one point, sent back to back: well inside RULE-4's 300 ms. */
async function doubleTapAt(phone: Page, x: number, y: number): Promise<void> {
  await phone.touchscreen.tap(x, y);
  await phone.touchscreen.tap(x, y);
}
