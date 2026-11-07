/**
 * WS4's steps in smoke.ts's whole game: a picked colour (B-AC-8), map zoom (B-AC-2, T-AC-9), the move to another device
 * (B-AC-7, B-AC-13) and plots you can read from the couch (B-AC-9, look A).
 */
import { GOODS, type GameState, type Stock } from '@mule/engine';
import type { MuleView, ServerEnvelope, TableView } from '@mule/protocol';
import type { Locator, Page } from 'playwright';
import { COLOUR_NAME, SLOT_COLOR, type Slot } from '@mule/ui';
import { check, checkLink, EXPIRED, gone, MOVED, onStartScreen, PHONE, PHONE_SMALL, qrLink, seatToken, shows, SHOWN_MS, type GameStepContext } from './harness';

/** B-AC-9 (WS4, plot look A): a mark's width as a share of its plot's, with slack for rounding and the 2 px minimums. */
const LOOK_A = { tab: 0.46, disc: 0.62 };
const SHARE_SLACK = 0.06;
/** B-AC-9 (WS4, plot look A): an owned plot's inset border, a share of its width, and its tint's share of the owner's colour. */
const BORDER = { share: 1 / 12, slack: 0.025, minPx: 2 };
const TINT = { alpha: 0.3, slack: 0.05 };
/** PM ruling X on #562: how far a mark may touch a dot, for rounding. */
const SLACK_PX = 0.5;
/** T-AC-9 watches the wire from the first tap to at least this long after the second. */
const QUIET_MS = 400;
const PRESS_MS = 2_000;
const READY = '[data-testid=handoff-qr][data-state=ready]';

type Box = { x: number; y: number; width: number; height: number };
/**
 * A plot as drawn: its x-y, its label, its box on screen, what each of its layers paints (computed box-shadow and
 * background), and every mark inside it with a test id.
 */
type DrawnPlot = {
  at: string;
  label: string;
  box: Box;
  paint: { boxShadow: string; background: string }[];
  marks: { id: string; box: Box }[];
};
/** A map as drawn: its plots, how much a zoom or a scaled screen magnifies it, and each colour slot's colour as computed. */
type DrawnMap = { scale: number; colours: string[]; plots: DrawnPlot[] };
type Rgba = { r: number; g: number; b: number; a: number };
type Shadow = { colour: Rgba | null; spread: number; inset: boolean };
type Game = { state: GameState; devEndsAt: number | null; phaseEndsAt: number | null; ctx: { now(): number } };

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
      if (now?.stage !== stage || (stage !== 'announce' && stage !== 'ballot') || now.done.includes(seat.id)) return;
      // Cast my vote waits for a pick on every ballot paper: abstain.
      for (const box of await ctx.phone.locator('[data-testid=ballot-card] [data-testid$="-abstain"] input').all()) await box.check({ timeout: PRESS_MS });
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

/**
 * B-AC-8, held: the TV's roster in `phase` draws the phone's player in Rose; in development the TV map draws every plot
 * of theirs in Rose too. The player is read from the phone's header, or given as `player`: the arcade screen, which
 * development is with walking on, has no such header. Returns the player's name.
 */
export async function theTvDrawsRose(ctx: GameStepContext, phase: 'planning' | 'development', player?: string): Promise<string> {
  return ctx.held(async () => {
    const { phone, tv } = ctx;
    const name = player ?? (await playingAs(phone)).name;
    const screen = tv.locator(`[data-phase=${phase}]`);
    check(await shows(screen), `B-AC-8: the TV shows ${phase}`);
    await checkRoster(screen.locator('li'), name, `B-AC-8: the TV's ${phase} roster draws ${name} in ${COLOUR_NAME[ROSE]}`);
    if (phase !== 'development') return name;
    const { state } = gameOf(ctx);
    const seat = state.players.find((p) => p.name === name);
    check(seat, `B-AC-8: ${name} plays in the game`);
    const plots = state.tiles.filter((t) => t.owner === seat.id).length;
    const drawn = await tvPlotsIn(tv, ROSE);
    check(plots > 0 && drawn.length === plots && drawn.every((s) => s === String(ROSE)), `B-AC-8: the TV map draws ${name}'s ${plots} plots in ${COLOUR_NAME[ROSE]}, got [${drawn.join(', ')}]`);
    return name;
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

/**
 * B-AC-9 (WS4, plot look A), held in development: the TV map shows who owns each plot and what is installed on it. The
 * MULE goes in on the server just before; the TV draws it a broadcast later, so the read waits for its disc (CI read the
 * map first once, 6 Nov, and failed "the map shows an installed good").
 */
export async function theTvShowsWhoOwnsEachPlot(ctx: GameStepContext): Promise<string> {
  return ctx.held(async () => {
    const map = ctx.tv.locator('[data-phase=development]');
    await map.locator('[data-testid^=installed-]').first().waitFor({ state: 'attached', timeout: 3_000 });
    return checkPlotLook(map, 'TV, development', { installed: true });
  });
}

type Rect = { left: number; top: number; right: number; bottom: number };
/** Each selector's matches inside `map`, as boxes on screen, in document order. */
async function rectsOf(map: Locator, selectors: string[]): Promise<Rect[][]> {
  // Kept free of named functions: tsx's keepNames wraps them with `__name`, which the page lacks.
  return map.evaluate(
    (el, sels) =>
      sels.map((sel) =>
        [...el.querySelectorAll(sel)].map((q) => {
          const r = q.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }),
      ),
    selectors,
  );
}
/** The special badge's hexagon, in its 24-unit viewBox (SpecialIcon.tsx's path), clockwise on screen. */
const HEXAGON = [[12, 1.2], [21.4, 6.6], [21.4, 17.4], [12, 22.8], [2.6, 17.4], [2.6, 6.6]] as const;
/** Whether the point lies inside the hexagon drawn in `badge`'s box. */
function inHexagon(x: number, y: number, badge: Rect): boolean {
  const corners = HEXAGON.map(([vx, vy]) => [badge.left + (vx / 24) * (badge.right - badge.left), badge.top + (vy / 24) * (badge.bottom - badge.top)] as const);
  return corners.every(([x1, y1], i) => {
    const [x2, y2] = corners[(i + 1) % corners.length]!;
    return (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) >= 0;
  });
}
/** Whether two boxes overlap by more than SLACK_PX. */
const covers = (a: Rect, b: Rect) => a.left < b.right - SLACK_PX && b.left < a.right - SLACK_PX && a.top < b.bottom - SLACK_PX && b.top < a.bottom - SLACK_PX;

/**
 * T-AC-3 and B-AC-9 (WS4; PM ruling X on #562), on the hub's Look map at the phone's 844×390, where a 3-seat plot is
 * about 25 px: (a) on every analysed special plot with nothing installed, the right column's and its corner's included,
 * the third dot's centre lies outside the plot's own badge and its box clears the badge's; (b) on an owned plot with a
 * gem, the owner's tab and the gem are clear of the dots; (c) a plot Look-selected under a plot showing its dots draws no
 * pin, and its ring's painted band keeps off those dots, and its glow at half strength stays clear of them, at 844×390
 * and at the small phone's 667×375 (hub plots 12.8 to 15 px). At 667×375 (WS6 ruling, 7 Nov): (d) every analysed plot's dots chip
 * lies inside its plot and (e) no two chips overlap, on the plots above and staged around the selection. Each "clear" is
 * within SLACK_PX, the glow's within 0. The ground is seeded on the server for the seat, as makeHungry seeds hunger, and
 * undone inside the hold, before anything due runs.
 */
export async function theMarksStayClearOfTheDots(ctx: GameStepContext, seat = 's1'): Promise<string> {
  const id = 'T-AC-3 / B-AC-9 (WS4, plot marks at 25 and 12.8 px, PM rulings X, a and c on #562, WS6 small dots and PM glow rulings)';
  type Room = { game: { state: GameState }; viewFor(seat: string): { game?: MuleView }; broadcast(): void };
  const room = ctx.server.registry.get(ctx.code) as unknown as Room | undefined;
  check(room, `${id}: a room ${ctx.code} on the server`);
  const state = room.game.state;
  const me = state.players.find((p) => p.id === seat);
  check(me, `${id}: seat ${seat} in the game`);
  try {
    return await ctx.held(async () => {
      const undo: (() => void)[] = [];
      try {
        check(state.phase === 'planning', `${id}: the step runs in planning, not in ${state.phase}`);
        const index = (t: { x: number; y: number }) => t.y * state.width + t.x;
        const at = (x: number, y: number) => state.tiles.find((t) => t.x === x && t.y === y);
        // No colony building stands on a map plot (G-5 C48): every plot but the store's is open.
        const open = (t: GameState['tiles'][number]) => t.terrain !== 'store';
        const known = [...me.analysed];
        undo.push(() => me.analysed.splice(0, me.analysed.length, ...known));
        const analyse = (t: { x: number; y: number }) => {
          if (!me.analysed.includes(index(t))) me.analysed.push(index(t));
        };

        // (a): every special plot the map holds with nothing installed on it, so its dots show under its badge. A map with
        // none is given an oasis on a free plot inside it for the step.
        let specials = state.tiles.filter((t) => t.special && open(t) && !t.outfit);
        if (specials.length === 0) {
          const plain = state.tiles.find((t) => t.owner === null && open(t) && !t.outfit && !t.special && t.x < state.width - 1 && t.y < state.height - 1);
          check(plain, `${id}: a free plot inside the map to give a special`);
          undo.push(() => delete plain.special);
          plain.special = { kind: 'oasis' };
          specials = [plain];
        }
        // The right column, where the badge sits inside the plot, and its bottom corner: given a special when the map has
        // none there. A corner the store or a colony building holds gives way to the next free right-column plot.
        const rightColumn = state.tiles.filter((t) => t.x === state.width - 1 && open(t) && !t.special).sort((p, q) => q.y - p.y);
        const corner = at(state.width - 1, state.height - 1);
        const staged: GameState['tiles'][number][] = [];
        if (!specials.some((t) => t.x === state.width - 1 && t.y < state.height - 1)) {
          const edge = rightColumn.find((t) => t.y > 0 && t.y < state.height - 1);
          check(edge, `${id}: a free plot in the map's right column to give a special`);
          staged.push(edge);
        }
        if (!specials.some((t) => t.x === state.width - 1 && t.y === state.height - 1)) {
          const edge = corner && open(corner) ? corner : rightColumn.find((t) => !staged.includes(t));
          check(edge, `${id}: the map's bottom-right corner, or another free right-column plot, to give a special`);
          staged.push(edge);
        }
        for (const edge of staged) {
          const was = { special: edge.special, outfit: edge.outfit };
          undo.push(() => {
            if (was.special) edge.special = was.special;
            else delete edge.special;
            edge.outfit = was.outfit;
          });
          edge.special = edge.special ?? { kind: 'oasis' };
          edge.outfit = null;
          specials.push(edge);
        }
        specials.forEach(analyse);
        // (b): an owned plot without a special, given a gem. One with nothing installed is taken first; else a MULE is lifted off one for the step.
        const owned = state.tiles.find((t) => t.owner !== null && open(t) && !t.special && !t.outfit) ?? state.tiles.find((t) => t.owner !== null && open(t) && !t.special);
        check(owned, `${id}: the map has an owned plot without a special`);
        const { outfit, ground } = owned;
        const crystite = ground.crystite;
        undo.push(() => Object.assign(owned, { outfit }), () => Object.assign(owned.ground, { crystite }));
        owned.outfit = null;
        owned.ground.crystite = Math.max(crystite, 2);
        analyse(owned);
        // (c): a plot inside the map, so its ring reaches out on every side, under a plot that can show its dots. For (d)
        // and (e) that plot's left, right and upper neighbours show their dots too; a MULE on any of them is lifted for the step.
        const around = (t: { x: number; y: number }) => [at(t.x, t.y - 1), at(t.x - 1, t.y - 1), at(t.x + 1, t.y - 1), at(t.x, t.y - 2)];
        // (f) also needs a special plot that shows no dots left of one that does: two left of the plot above the selection.
        const hiddenOf = (t: { x: number; y: number }) => at(t.x - 2, t.y - 1);
        const selected = state.tiles.find((t) => {
          const hidden = hiddenOf(t);
          return t.x > 1 && t.x < state.width - 1 && t.y > 1 && t.y < state.height - 1 && open(t) && around(t).every((n) => !!n && open(n)) && !!hidden && open(hidden) && !specials.includes(hidden) && hidden !== owned;
        });
        check(selected, `${id}: a plot inside the map whose upper neighbour, and that one's left, right and upper neighbours, can show their dots, with a plot two left of the upper one to stage a special without dots`);
        const { x, y } = selected;
        const neighbours = around(selected) as GameState['tiles'][number][];
        for (const n of neighbours) {
          const was = n.outfit;
          undo.push(() => Object.assign(n, { outfit: was }));
          n.outfit = null;
          analyse(n);
        }
        // (f): a special plot nobody here has analysed, so it shows its badge and no dots, left of a plot showing its dots.
        const hidden = hiddenOf(selected)!;
        const hiddenWas = hidden.special;
        undo.push(() => {
          if (hiddenWas) hidden.special = hiddenWas;
          else delete hidden.special;
        });
        hidden.special = hidden.special ?? { kind: 'oasis' };
        me.analysed.splice(0, me.analysed.length, ...me.analysed.filter((i) => i !== index(hidden)));
        // (h): the plot above the selection, which the drone flags between two plots showing their dots.
        const flagged = neighbours[0]!;
        room.broadcast();

        const planning = ctx.phone.locator('[data-phase=planning]');
        await planning.getByTestId('tool-look').click({ timeout: PRESS_MS });
        const map = planning.getByTestId('hub-map');
        for (const t of [...specials, owned, ...neighbours]) await map.getByTestId(`map-dots-${t.x}-${t.y}`).waitFor({ timeout: PRESS_MS });
        await map.getByTestId(`gem-crystite`).first().waitFor({ timeout: PRESS_MS });
        const specialAt = specials.map((t) => `${t.x}-${t.y}`);
        const ownedAt = `${owned.x}-${owned.y}`;
        const [[ownedPlot] = [], ownedPips, [tab] = [], gems, ...perSpecial] = await rectsOf(map, [
          `[data-testid=map-plot-${ownedAt}]`,
          `[data-testid=map-dots-${ownedAt}] span.rounded-full`,
          `[data-testid=owner-${ownedAt}]`,
          `[data-testid=map-gem-${ownedAt}] [data-testid^=gem-]`,
          ...specialAt.flatMap((at) => [`[data-testid=map-dots-${at}] span.rounded-full`, `[data-testid=special-glyph-${at}] > span`]),
        ]);
        const marks = {
          plot: ownedPlot,
          specials: specialAt.map((at, i) => ({ at, third: perSpecial[2 * i]?.[2], badge: perSpecial[2 * i + 1]?.[0] })),
          owned: { pips: (ownedPips ?? []).slice(0, 3), tab, gems: gems ?? [] },
        };
        check(marks.plot, `${id}: plot ${owned.x}-${owned.y} is drawn`);
        for (const sp of marks.specials) {
          check(sp.third && sp.badge, `${id}: special plot ${sp.at} draws its third dot and its badge`);
          const [d, b] = [sp.third, sp.badge];
          check(!inHexagon((d.left + d.right) / 2, (d.top + d.bottom) / 2, b), `${id}: on special plot ${sp.at} the third dot's centre lies outside the plot's badge`);
          check(!covers(d, b), `${id}: on special plot ${sp.at} the third dot (${px(d.left)}–${px(d.right)}, ${px(d.top)}–${px(d.bottom)}) is clear of the ${px(b.right - b.left)} badge (${px(b.left)}–${px(b.right)}, ${px(b.top)}–${px(b.bottom)})`);
        }
        const o = marks.owned;
        check(o.pips.length === 3 && o.tab && o.gems.length > 0, `${id}: owned plot ${owned.x}-${owned.y} draws 3 dots, its tab and a gem`);
        check(!o.pips.some((d) => covers(d, o.tab!)), `${id}: on owned plot ${owned.x}-${owned.y} the owner's tab (foot at ${px(o.tab.bottom)}) is clear of the dots (top at ${px(o.pips[0]!.top)})`);
        check(!o.pips.some((d) => o.gems.some((g) => covers(d, g))), `${id}: on owned plot ${owned.x}-${owned.y} the gem is clear of the dots`);

        const phone = await selectionUnderDots(map, x, y, id);
        await ctx.phone.setViewportSize(PHONE_SMALL.viewport);
        let small: Awaited<ReturnType<typeof selectionUnderDots>>;
        let fit: Awaited<ReturnType<typeof dotsFitTheirPlots>>;
        let strip: Awaited<ReturnType<typeof marksClearOfTheChips>>;
        let flag: string;
        try {
          const where = `${id}, ${PHONE_SMALL.viewport.width}×${PHONE_SMALL.viewport.height}`;
          small = await selectionUnderDots(map, x, y, where);
          fit = await dotsFitTheirPlots(map, [...specials, owned, ...neighbours].map((t) => `${t.x}-${t.y}`), where);
          strip = await marksClearOfTheChips(map, where);
          // Free only for (h), so the drone may pick it: (b)'s owned plot may be this one.
          const owner = flagged.owner;
          flagged.owner = null;
          room.broadcast();
          try {
            flag = await aFlagTakesTheChipsPlace(planning, flagged, where);
          } finally {
            flagged.owner = owner;
            room.broadcast();
          }
        } finally {
          await ctx.phone.setViewportSize(PHONE.viewport);
        }
        const third = (sp: (typeof marks.specials)[number]) => `${sp.at} ${px(Math.max(sp.badge!.left - sp.third!.right, sp.badge!.top - sp.third!.bottom))}`;
        const gap = (over: number) => (over > 0 ? `${px(over)} into` : `${px(-over)} under`);
        const c = (r: typeof phone) => `on a ${px(r.plot)} plot no pin, the ring's band ${gap(r.bandOver)} the dots, the glow's half-strength edge ${gap(r.glowOver)}`;
        return `on a ${px(marks.plot.right - marks.plot.left)} plot: (a) the third dot clear of its ${px(marks.specials[0]!.badge!.right - marks.specials[0]!.badge!.left)} badge on ${marks.specials.map(third).join(', ')}; (b) on ${owned.x}-${owned.y} the tab's foot ${px(o.pips[0]!.top - o.tab.bottom)} above the dots, the gem's ${px(o.pips[0]!.top - Math.max(...o.gems.map((g) => g.bottom)))}; (c) ${x}-${y} selected under ${x}-${y - 1}: at ${PHONE.viewport.width}×${PHONE.viewport.height} ${c(phone)}, at ${PHONE_SMALL.viewport.width}×${PHONE_SMALL.viewport.height} ${c(small)}; at ${PHONE_SMALL.viewport.width}×${PHONE_SMALL.viewport.height} (d) ${fit.chips} chips of at most ${px(fit.width)}×${px(fit.height)}, at most ${px(fit.out)} out of their plots, (e) none overlapping${fit.pairs ? `: ${fit.pairs} pairs touching, at most ${px(fit.overlap)} into each other` : ', none touching'}; (f) no mark of ${strip.marks} meets any of the ${fit.chips} chips, (g) the ${strip.strip} tabs, gems and badges in the small strip at least ${px(strip.smallest)}; (h) ${flag}`;
      } finally {
        for (const step of undo.reverse()) step();
      }
    });
  } finally {
    room.broadcast();
  }
}

/**
 * (c) of theMarksStayClearOfTheDots: Look-selects plot x-y, under a plot showing its dots, at the phone's size now; it
 * draws no pin, its ring's painted band stops within SLACK_PX of those dots, and its glow at half strength stops clear of
 * them. Deselects it after.
 */
async function selectionUnderDots(map: Locator, x: number, y: number, id: string): Promise<{ plot: number; bandOver: number; glowOver: number }> {
  // Once the resize has reached the map's marks: two frames, the ResizeObserver's and the one it paints in.
  await map.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const plot = map.getByTestId(`map-plot-${x}-${y}`);
  await plot.click({ timeout: PRESS_MS });
  await map.locator(`[data-testid=map-plot-${x}-${y}][data-selected]`).waitFor({ timeout: PRESS_MS });
  const [[box] = [], [pin] = [], [ringBox] = [], [glowBox] = [], dots = []] = await rectsOf(map, [
    `[data-testid=map-plot-${x}-${y}]`,
    `[data-testid=map-plot-${x}-${y}] [data-testid=selected-pin]`,
    `[data-testid=map-plot-${x}-${y}] [data-testid=selected-ring]`,
    `[data-testid=map-plot-${x}-${y}] [data-testid=selected-glow]`,
    `[data-testid=map-dots-${x}-${y - 1}] span.rounded-full`,
  ]);
  // The ring's band is painted as outset box-shadows: its outer edge lies the largest spread outside the ring's box.
  const spread = shadowsOf(await map.getByTestId('selected-ring').evaluate((ring) => getComputedStyle(ring).boxShadow)).filter((s) => !s.inset);
  // The glow is a Gaussian blur of σ = blur / 2 (12 px blur: σ 6) across its spread edge, 4 px outside its box. A blurred
  // edge is at half strength on the edge itself, so the glow's half-strength edge lies its spread outside the box: the
  // blur widens the glow around that edge (to about 2% at 12 px out), but moves no part of it past half strength.
  const glow = shadowsOf(await map.getByTestId('selected-glow').evaluate((g) => getComputedStyle(g).boxShadow)).filter((s) => !s.inset);
  check(box && ringBox && glowBox && dots.length >= 3, `${id}: the selected plot ${x}-${y} draws its ring and its glow, and ${x}-${y - 1} its 3 dots`);
  check(!pin, `${id}: the plot ${x}-${y}, selected under the dots of ${x}-${y - 1}, draws no pin`);
  const foot = Math.max(...dots.slice(0, 3).map((d) => d.bottom));
  const bandOver = foot - (ringBox.top - Math.max(0, ...spread.map((s) => s.spread)));
  check(bandOver <= SLACK_PX, `${id}: the ring on ${x}-${y}, as painted, keeps off the dots of ${x}-${y - 1}: its band reaches ${px(bandOver)} into their row on a ${px(box.right - box.left)} plot`);
  const glowOver = foot - (glowBox.top - Math.max(0, ...glow.map((s) => s.spread)));
  // SA-1372 (WS6 ruling, 7 Nov): under 24 px the ring and its glow are drawn inside the plot, so no neighbour's dot is under them.
  if (box.right - box.left < 24) {
    check(spread.length === 0 && glow.length === 0 && !covers(ringBox, { left: box.right, right: box.right + 99, top: box.top, bottom: box.bottom }) && !covers(ringBox, { left: box.left - 99, right: box.left, top: box.top, bottom: box.bottom }), `${id}: on a ${px(box.right - box.left)} plot the ring and its glow on ${x}-${y} are drawn inside it, painting nothing outward`);
    const others = await rectsOf(map, [`[data-testid^=map-dots-]:not([data-testid=map-dots-${x}-${y}]) span.rounded-full`]).then(([r = []]) => r);
    check(!others.some((d) => covers(d, ringBox) || covers(d, glowBox)), `${id}: the inside ring on ${x}-${y} covers no neighbour's dot`);
  }
  check(glowOver <= 0, `${id}: the glow on ${x}-${y}, at half strength, stays clear of the dots of ${x}-${y - 1}: it reaches ${px(glowOver)} into their row on a ${px(box.right - box.left)} plot`);
  await plot.click({ timeout: PRESS_MS });
  return { plot: box.right - box.left, bandOver, glowOver };
}

/**
 * (d) and (e) of theMarksStayClearOfTheDots, at the phone's size now: the dots chip of each plot in `analysed` lies
 * inside its plot, and no two chips on the map overlap, each within SLACK_PX. Returns the chips' count and largest size,
 * the farthest a chip reaches out of its plot, and how many pairs touch (within 1 px) and the deepest of them.
 */
async function dotsFitTheirPlots(map: Locator, analysed: string[], id: string): Promise<{ chips: number; width: number; height: number; out: number; pairs: number; overlap: number }> {
  const ats = [...new Set(analysed)];
  const rects = await rectsOf(map, ats.flatMap((at) => [`[data-testid=map-plot-${at}]`, `[data-testid=map-dots-${at}]`]));
  let out = 0;
  for (const [i, at] of ats.entries()) {
    const [[p] = [], [c] = []] = [rects[2 * i] ?? [], rects[2 * i + 1] ?? []];
    check(p && c, `${id}: the analysed plot ${at} draws its dots chip`);
    const reach = Math.max(p.left - c.left, c.right - p.right, p.top - c.top, c.bottom - p.bottom);
    check(reach <= SLACK_PX, `${id}: the dots chip of ${at} (${px(c.left)}–${px(c.right)}, ${px(c.top)}–${px(c.bottom)}) lies inside its plot (${px(p.left)}–${px(p.right)}, ${px(p.top)}–${px(p.bottom)}): it reaches ${px(reach)} out`);
    out = Math.max(out, reach);
  }
  const all = await rectsOf(map, ['[data-testid^=map-dots-]']).then(([r = []]) => r);
  let pairs = 0;
  let overlap = -Infinity;
  for (const [i, a] of all.entries())
    for (const b of all.slice(i + 1)) {
      const depth = Math.min(a.right - b.left, b.right - a.left, a.bottom - b.top, b.bottom - a.top);
      const next = a.left - b.right < 1 && b.left - a.right < 1 && a.top - b.bottom < 1 && b.top - a.bottom < 1;
      check(!covers(a, b), `${id}: two neighbouring dots chips overlap by ${px(depth)} (${px(a.left)}–${px(a.right)}, ${px(a.top)}–${px(a.bottom)} and ${px(b.left)}–${px(b.right)}, ${px(b.top)}–${px(b.bottom)})`);
      if (next) {
        pairs++;
        overlap = Math.max(overlap, depth);
      }
    }
  return { chips: all.length, width: Math.max(...all.map((r) => r.right - r.left)), height: Math.max(...all.map((r) => r.bottom - r.top)), out, pairs, overlap };
}

/**
 * (f) and (g) of theMarksStayClearOfTheDots, SA-1372 (WS6 ruling, 7 Nov), at the phone's size now: no mark on the map
 * (a tab, a gem, a badge, a flag, a MULE's disc, a building's chip) meets any dots chip, only the owner's
 * border; and every tab, gem and badge in a small plot's strip is drawn at 3 px or more. Returns the counts and the smallest.
 */
async function marksClearOfTheChips(map: Locator, id: string): Promise<{ marks: number; strip: number; smallest: number }> {
  // The store's sign is not among the ruling's marks: its size on the small phone is with the PM (it reaches into its neighbours).
  const MARKS = ['[data-testid^=owner-]', '[data-testid^=gem-]', '[data-testid^=special-glyph-] > span', '[data-testid^=map-flag-]', '[data-testid^=installed-]', '[data-testid^=plot-object-] [data-num]'];
  const STRIP = ['[data-testid^=owner-]', '[data-testid^=gem-]', '[data-testid^=special-glyph-] > span'].map((m) => `[data-testid^=map-strip-] ${m}`);
  const [chips = [], marks = [], strip = []] = await rectsOf(map, ['[data-testid^=map-dots-]', MARKS.join(', '), STRIP.join(', ')]);
  check(chips.length > 0 && strip.length > 0, `${id}: the map draws dots chips (${chips.length}) and a small strip's marks (${strip.length})`);
  for (const c of chips)
    for (const m of marks) check(!covers(c, m), `${id}: a mark (${px(m.left)}–${px(m.right)}, ${px(m.top)}–${px(m.bottom)}) meets the dots chip at ${px(c.left)}–${px(c.right)}, ${px(c.top)}–${px(c.bottom)}`);
  const sides = strip.map((m) => Math.min(m.right - m.left, m.bottom - m.top));
  for (const [i, side] of sides.entries()) check(side >= 3 - 0.05, `${id}: a tab, gem or badge in the small strip is drawn at ${px(side)}, under a dot's 3 px (${px(strip[i]!.left)}, ${px(strip[i]!.top)})`);
  return { marks: marks.length, strip: strip.length, smallest: Math.min(...sides) };
}

/**
 * (h) of theMarksStayClearOfTheDots, SA-1372 (WS6 ruling, 7 Nov), at the phone's size now: the drone flags `plot`, which
 * shows its dots between two plots showing theirs; its SCAN flag takes its chip's place and meets no other chip. Unpicks
 * it and goes back to Look after.
 */
async function aFlagTakesTheChipsPlace(planning: Locator, plot: { x: number; y: number }, id: string): Promise<string> {
  const at = `${plot.x}-${plot.y}`;
  const map = planning.getByTestId('hub-map');
  await planning.getByTestId('tool-drone').click({ timeout: PRESS_MS });
  try {
    await map.getByTestId(`map-plot-${at}`).click({ timeout: PRESS_MS });
    await map.getByTestId(`map-flag-${at}`).waitFor({ timeout: PRESS_MS });
    check(await gone(map.getByTestId(`map-dots-${at}`)), `${id}: the flagged plot ${at} draws no dots chip while its SCAN flag shows`);
    const [[flag] = [], chips = []] = await rectsOf(map, [`[data-testid=map-flag-${at}]`, '[data-testid^=map-dots-]']);
    check(flag, `${id}: the flag on ${at} is drawn`);
    for (const c of chips) check(!covers(c, flag), `${id}: the SCAN flag on ${at} (${px(flag.left)}–${px(flag.right)}, ${px(flag.top)}–${px(flag.bottom)}) meets a neighbour's dots chip (${px(c.left)}–${px(c.right)}, ${px(c.top)}–${px(c.bottom)})`);
    // PM ruling A, WS6's glyphs: a 7×7 glyph chip, its word in the plot's label.
    check(Math.abs(flag.right - flag.left - 7) <= SLACK_PX && Math.abs(flag.bottom - flag.top - 7) <= SLACK_PX && (await map.locator(`[data-testid=map-flag-${at}] svg`).count()) === 1, `${id}: the flag on ${at} is a 7×7 glyph chip, got ${px(flag.right - flag.left)}×${px(flag.bottom - flag.top)}`);
    const label = (await map.getByTestId(`map-plot-${at}`).getAttribute('aria-label')) ?? '';
    check(label.includes('drone scan'), `${id}: the flagged plot's label says "drone scan", got "${label}"`);
    await map.getByTestId(`map-plot-${at}`).click({ timeout: PRESS_MS });
    await map.getByTestId(`map-flag-${at}`).waitFor({ state: 'detached', timeout: PRESS_MS });
    return `the SCAN flag on ${at}, a ${px(flag.right - flag.left)}×${px(flag.bottom - flag.top)} glyph chip, takes its chip's place, clear of ${chips.length} chips`;
  } finally {
    await planning.getByTestId('tool-look').click({ timeout: PRESS_MS });
  }
}

/** readPlotLook's read, failing with every check that failed. Returns a line for the log. */
export async function checkPlotLook(map: Locator, where: string, want: LookWanted): Promise<string> {
  const { read, fails } = await readPlotLook(map, where, want);
  check(fails.length === 0, fails.join('\n'));
  return read;
}

type LookWanted = { installed: boolean };

/**
 * B-AC-9 (WS4, plot look A) on one map, measured on screen as drawn, so a zoomed or scaled map shows the same shares:
 * every owned plot paints an inset border of about a twelfth of its width (at least 2 px) in its owner's colour, a tint
 * of 30% of that colour, and holds its owner's tab at about 0.46 of its width; every installed good sits on a disc of
 * about 0.62. Returns a line for the log and every check that failed.
 */
export async function readPlotLook(map: Locator, where: string, want: LookWanted): Promise<{ read: string; fails: string[] }> {
  const id = `B-AC-9 (WS4, plot look A, ${where})`;
  const fails: string[] = [];
  const fail = (ok: boolean, message: string) => {
    if (!ok) fails.push(`${id}: ${message}`);
  };
  const { scale, colours, plots: drawn } = await drawnMap(map, id);
  check(drawn.length > 0, `${id}: the map draws its plots as map-plot-<x>-<y>, found none`);
  const owned = drawn.filter((p) => /\bowned by player \d+\b/.test(p.label));
  check(owned.length > 0, `${id}: the map has owned plots to measure`);
  const tabs = owned.map((p) => {
    const tab = p.marks.filter((m) => m.id === `owner-${p.at}`);
    check(tab.length === 1, `${id}: the owned plot ${p.at} holds one owner's tab, found ${tab.length}`);
    return tab[0]!.box.width / p.box.width;
  });
  fail(tabs.every((s) => Math.abs(s - LOOK_A.tab) <= SHARE_SLACK), `each owner's tab is ${LOOK_A.tab} ± ${SHARE_SLACK} of its plot, got ${shares(tabs)}`);
  // The border and the tint are painted, not boxes: read them from the layer whose inset shadow is in the owner's colour.
  const painted = owned.map((p) => {
    const colour = rgbaOf(colours[Number(p.label.match(/\bowned by player (\d+)\b/)![1]) - 1] ?? '');
    const layer = p.paint.find((c) => shadowsOf(c.boxShadow).some((s) => s.inset && sameColour(s.colour, colour)));
    const border = layer && shadowsOf(layer.boxShadow).find((s) => s.inset && sameColour(s.colour, colour));
    const tint = layer ? rgbaOf(layer.background) : null;
    return { at: p.at, border: border ? border.spread : null, share: border ? (border.spread * scale) / p.box.width : null, tint, tinted: !!tint && sameColour(tint, colour) && Math.abs(tint.a - TINT.alpha) <= TINT.slack };
  });
  const unbordered = painted.filter((p) => p.border === null).map((p) => p.at);
  fail(unbordered.length === 0, `each owned plot paints an inset border in its owner's colour, none on [${unbordered.join(', ')}]`);
  const bordered = painted.filter((p) => p.share !== null);
  fail(
    bordered.every((p) => p.border! >= BORDER.minPx && Math.abs(p.share! - BORDER.share) <= BORDER.slack),
    `each owner's border is a twelfth ± ${BORDER.slack} of its plot and at least ${BORDER.minPx} px, got ${bordered.map((p) => `${p.at} ${p.border} px ${p.share!.toFixed(3)}`).join(', ')}`,
  );
  const untinted = painted.filter((p) => p.border !== null && !p.tinted);
  fail(untinted.length === 0, `each owned plot is tinted ${TINT.alpha * 100}% of its owner's colour, got ${untinted.map((p) => `${p.at} ${p.tint ? `rgb ${[p.tint.r, p.tint.g, p.tint.b].map(Math.round).join(' ')} at ${p.tint.a.toFixed(2)}` : 'none'}`).join(', ')}`);
  const discs = drawn.flatMap((p) => p.marks.filter((m) => m.id === `installed-${p.at}`).map((m) => m.box.width / p.box.width));
  fail(!want.installed || discs.length > 0, 'the map shows an installed good');
  fail(discs.every((s) => Math.abs(s - LOOK_A.disc) <= SHARE_SLACK), `each installed good's disc is ${LOOK_A.disc} ± ${SHARE_SLACK} of its plot, got ${shares(discs)}`);
  const borders = shares(bordered.map((p) => p.share!));
  const read = `${where}: borders ${borders}, tabs ${shares(tabs)}, discs ${shares(discs) || 'none'} of a ${px(owned[0]!.box.width)} plot`;
  return { read, fails };
}

/** Every plot on the map with its marks and paint, in one read. Fails when the map has no root. */
async function drawnMap(map: Locator, id: string): Promise<DrawnMap> {
  const slots = ([0, 1, 2, 3, 4, 5] as Slot[]).map((s) => SLOT_COLOR[s]);
  // Kept free of named functions: tsx's keepNames wraps them with `__name`, which the page lacks.
  const drawn = await map.evaluate((el, slotColours) => {
    const root = el.querySelector<HTMLElement>('[data-testid=holo-map]');
    if (!root) return null;
    // How much a zoom or a scaled screen magnifies the map: its width on screen over its layout width.
    const scale = root.getBoundingClientRect().width / root.offsetWidth;
    // Each slot's colour as the page computes it, through the theme's variables.
    const probe = document.body.appendChild(document.createElement('span'));
    const colours = slotColours.map((c) => {
      probe.style.color = c;
      return getComputedStyle(probe).color;
    });
    probe.remove();
    const plots = [...root.querySelectorAll('[data-testid^="map-plot-"]')].map((t) => {
      const b = t.getBoundingClientRect();
      return {
        at: (t.getAttribute('data-testid') ?? '').slice('map-plot-'.length),
        label: t.getAttribute('aria-label') ?? '',
        box: { x: b.x, y: b.y, width: b.width, height: b.height },
        paint: [...t.children].map((c) => ({ boxShadow: getComputedStyle(c).boxShadow, background: getComputedStyle(c).backgroundColor })),
        marks: [...t.querySelectorAll('[data-testid]')].map((m) => {
          const k = m.getBoundingClientRect();
          return { id: m.getAttribute('data-testid') ?? '', box: { x: k.x, y: k.y, width: k.width, height: k.height } };
        }),
      };
    });
    return { scale, colours, plots };
  }, slots);
  check(drawn, `${id}: map root not found (data-testid=holo-map)`);
  return drawn;
}

/** A computed colour as Chromium writes it, rgb(), rgba() or color(srgb …), in 0-255 channels; null if it is none of those. */
function rgbaOf(css: string): Rgba | null {
  const legacy = css.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (legacy) return { r: Number(legacy[1]), g: Number(legacy[2]), b: Number(legacy[3]), a: legacy[4] === undefined ? 1 : Number(legacy[4]) };
  const srgb = css.match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)/);
  if (srgb) return { r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255, a: srgb[4] === undefined ? 1 : Number(srgb[4]) };
  return null;
}

/** A computed box-shadow's layers: each one's colour, its spread in css px, and whether it is inset. */
function shadowsOf(css: string): Shadow[] {
  if (!css || css === 'none') return [];
  // Layers are split on the commas outside a colour's parentheses.
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '(') depth++;
    else if (css[i] === ')') depth--;
    else if (css[i] === ',' && depth === 0) {
      layers.push(css.slice(start, i));
      start = i + 1;
    }
  }
  layers.push(css.slice(start));
  return layers.map((layer) => {
    const lengths = layer.replace(/[a-z-]+\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? [];
    return { colour: rgbaOf(layer), spread: lengths.length >= 4 ? parseFloat(lengths[3]!) : 0, inset: /\binset\b/.test(layer) };
  });
}

/** The same colour, give or take rounding; the alpha is not compared. */
function sameColour(a: Rgba | null, b: Rgba | null): boolean {
  return !!a && !!b && Math.abs(a.r - b.r) <= 2 && Math.abs(a.g - b.g) <= 2 && Math.abs(a.b - b.b) <= 2;
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

function px(width: number): string {
  return `${width.toFixed(1)} px`;
}

/** Every plot on the map, row by row: each is labelled with its terrain; player marks are images. */
function plots(screen: Locator): Locator {
  return screen.getByTestId('map-viewport').locator('[aria-label]:not([role=img]):not([data-testid=zoom-button])');
}

/** A plot's label names its owner by colour slot, counted from 1. */
function ownedBy(slot: number): RegExp {
  return new RegExp(`owned by player ${slot + 1}\\b`);
}

async function boxes(list: Locator): Promise<Box[]> {
  return list.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map(({ x, y, width, height }) => ({ x, y, width, height })));
}

/** Two taps at one point, sent back to back: well inside RULE-4's 300 ms. */
async function doubleTapAt(phone: Page, x: number, y: number): Promise<void> {
  await phone.touchscreen.tap(x, y);
  await phone.touchscreen.tap(x, y);
}
