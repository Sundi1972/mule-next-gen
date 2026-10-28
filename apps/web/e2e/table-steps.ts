/** WS4's steps in smoke.ts's whole game: map zoom (B-AC-2, T-AC-9). Each takes smoke's GameStepContext. */
import type { GameState } from '@mule/engine';
import type { Locator, Page } from 'playwright';
import { check, type GameStepContext } from './harness';

/** B-AC-2: a zoomed plot is at least this wide, a thumb's width. */
const MIN_PLOT_PX = 44;
/** T-AC-9 watches the wire from the first tap to at least this long after the second. */
const QUIET_MS = 400;
const PRESS_MS = 2_000;

type Plot = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
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
  const { width } = mapOf(ctx);
  const mine = ownedBy(await slotOf(phone));
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
  await checkWholeMap(dev, own, whole, 'B-AC-2: after a second double-tap');
  await dev.getByTestId('zoom-button').tap({ timeout: PRESS_MS });
  await checkZoomedToOwnLand(dev, own, whole, 'B-AC-2: after the zoom button');
  await dev.getByTestId('zoom-button').tap({ timeout: PRESS_MS });
  await checkWholeMap(dev, own, whole, 'B-AC-2: after the zoom button again');
  return `plot ${plotName(target)}, whole ${px(whole[0]!)}, zoomed ${px(zoomed[0]!)}; ${turnLeft(ctx)}`;
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

/** B-AC-2: every one of the map's plots lies inside its viewport, and yours are back to their whole-map size. */
async function checkWholeMap(dev: Locator, own: Locator, whole: number[], when: string): Promise<void> {
  await settled(dev);
  const all = await boxes(plots(dev));
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

/** The colour slot the page plays in, from the mark on its game shell's header. */
async function slotOf(page: Page): Promise<number> {
  const slot = Number(await page.getByTestId('guide').locator('header [role=img][data-slot]').first().getAttribute('data-slot', { timeout: PRESS_MS }));
  check(Number.isInteger(slot), `the phone's header names its colour slot, got ${slot}`);
  return slot;
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
  check(box, 'the plot to double-tap is on screen');
  await doubleTapAt(phone, box.x + box.width / 2, box.y + box.height / 2);
}

/** Two taps at one point, sent back to back: well inside RULE-4's 300 ms. */
async function doubleTapAt(phone: Page, x: number, y: number): Promise<void> {
  await phone.touchscreen.tap(x, y);
  await phone.touchscreen.tap(x, y);
}
