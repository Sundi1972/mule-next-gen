import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME } from '@mule/engine';
import { chromium, errors as playwrightErrors, type Browser, type Locator, type Page } from 'playwright';
import QRCode from 'qrcode';
import { GRANT_PASS_MAX_MS, GRANT_TICK_MS } from '../../server/src/mule-game.js';
import { createMuleServer, type MuleServer } from '../../server/src/server.js';

/** CT-3: what smoke.ts hands each auction step. */
export type AuctionStepContext = { phone: Page; tv: Page; check: (cond: unknown, message: string) => void };

/**
 * CT-3: `e2e/auction-steps.ts` (WS3's file) may export these; smoke.ts calls each at its hook.
 * - `landAuction(ctx, month)`: once per month, months 1 and 2, right after that month's land grant ends.
 * - `listedSale(ctx)`: once, in month 2's planning, before the test presses "I'm ready". It must return
 *   within about 2 s, leaving the phone on the planning screen.
 * Each must return while the phase it was called in can still end on its own clock (planning is about
 * 4.5 s here), and must never press what the test presses itself: "I'm ready", the pub, the auction's Done.
 */
export type AuctionSteps = {
  landAuction?: (ctx: AuctionStepContext, month: number) => Promise<void>;
  listedSale?: (ctx: AuctionStepContext) => Promise<void>;
};

/** What the whole game hands each step: the auction step's screens and check, the room, and `held` bound to it. */
export type GameStepContext = AuctionStepContext & {
  server: MuleServer;
  code: string;
  held: <T>(step: () => Promise<T>) => Promise<T>;
};

/** Rooms inside a `held` step. Room.hold is not counted, so a nested release would end the outer hold early. */
const heldRooms = new WeakSet<object>();

/**
 * Runs `step` with room `code`'s game clock held: nothing the game scheduled (a phase's end, an AI turn, a tick) runs
 * until the step returns or fails. Screens still act and hear views, so a message can still end a phase: the last
 * Ready, the last claim, a phone dropping. Real time is not held: a development turn still runs out, refusing moves
 * once "Time is up", and the production show still plays. Throws when nested.
 */
export async function held<T>(server: MuleServer, code: string, step: () => Promise<T>): Promise<T> {
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  check(!heldRooms.has(room), `held is not nested: ${code}`);
  heldRooms.add(room);
  room.hold();
  try {
    return await step();
  } finally {
    heldRooms.delete(room);
    room.release();
  }
}

/**
 * The real game server, serving the built client from apps/web/dist on a free
 * port. Options (a short game, faster phases) go straight to the server.
 * Always Classic: clears the model key and points the brain ledger at a temp file.
 */
export async function startServer(options: Omit<NonNullable<Parameters<typeof createMuleServer>[0]>, 'staticDir'> = {}): Promise<{ server: MuleServer; base: string }> {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.MULE_BRAIN_LOG = join(tmpdir(), 'mule-e2e-brain-costs.jsonl');
  const staticDir = fileURLToPath(new URL('../dist', import.meta.url));
  const server = createMuleServer({ ...options, staticDir });
  await new Promise<void>((r) => server.server.listen(0, '127.0.0.1', r));
  const { port } = server.server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${port}` };
}

const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';

/**
 * Chromium from Playwright's own cache (`playwright install chromium`), or from
 * PLAYWRIGHT_BROWSERS_PATH when set. Sandboxes without that cache ship a plain
 * binary at /opt/pw-browsers instead.
 */
export async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (err) {
    if (!existsSync(PREINSTALLED_CHROMIUM)) throw err;
    return chromium.launch({ executablePath: PREINSTALLED_CHROMIUM });
  }
}

/** The phone is played sideways. 844x390 is a phone on its side, PHONE_SMALL an iPhone SE on its side, PHONE_WIDE a large one. */
export const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
export const PHONE_SMALL = { ...PHONE, viewport: { width: 667, height: 375 } };
export const PHONE_WIDE = { width: 932, height: 430 };
export const TV = { viewport: { width: 1920, height: 1080 } };

export function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`E2E check failed: ${message}`);
}

/**
 * Presses CLAIM until the claims counter drops, within `timeoutMs`. The lit plot moves on every
 * tick and an AI can take it first, so a press may be refused; press again. `promise` names the
 * check that fails when no claim lands in time.
 */
export async function claimAPlot(phone: Page, timeoutMs: number, promise: string): Promise<void> {
  const grant = phone.locator('[data-phase=landGrant]');
  const claim = grant.getByRole('button', { name: /CLAIM/ });
  const unclaimed = grant.getByText(`${GAME.claimsPerGrant} OF ${GAME.claimsPerGrant} CLAIMS LEFT`, { exact: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    check((await grant.count()) > 0 && Date.now() < deadline, promise);
    if ((await unclaimed.count()) === 0) return;
    try {
      // Waits until a free plot is lit, which enables the button.
      await claim.click({ timeout: Math.max(1, deadline - Date.now()) });
      await unclaimed.waitFor({ state: 'hidden', timeout: 2 * GRANT_TICK_MS });
    } catch (err) {
      if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    }
  }
}

/** How long a check waits for a screen to show what it looks for. */
export const SHOWN_MS = 5_000;

/** How long a phone has to claim a plot in the land grant: ten lit plots for the AIs to take first, and the screen. */
export const CLAIM_MS = 10 * GRANT_TICK_MS + SHOWN_MS;

/**
 * Done with land: once its claims are in, the phone presses Ready in the land grant, and this waits for the grant to
 * end. It ends once every seat has used its claims or is done; the AI seats decide on the light's real-time tick,
 * which phaseScale never shortens, so the wait is up to one pass of the light. A phone already done, or already past
 * the grant, presses nothing.
 */
export async function doneWithLand(phone: Page): Promise<void> {
  const grant = phone.locator('[data-phase=landGrant]');
  const ready = grant.getByTestId('ready');
  const over = phone.locator('[data-phase]:not([data-phase=planning]):not([data-phase=landGrant])');
  await ready.or(grant.getByTestId('you-are-ready')).or(over).first().waitFor({ timeout: SHOWN_MS });
  if (await ready.count()) {
    try {
      await ready.click({ timeout: SHOWN_MS });
    } catch (err) {
      if (!(err instanceof playwrightErrors.TimeoutError) || (await over.count()) === 0) throw err;
    }
  }
  await over.first().waitFor({ timeout: GRANT_PASS_MAX_MS + SHOWN_MS });
}
export const MOVED = "You're playing on another device now";
export const EXPIRED = 'That link has expired';

export function shows(locator: Locator): Promise<boolean> {
  return locator.waitFor({ timeout: SHOWN_MS }).then(
    () => true,
    () => false,
  );
}

export function gone(locator: Locator): Promise<boolean> {
  return locator.waitFor({ state: 'detached', timeout: SHOWN_MS }).then(
    () => true,
    () => false,
  );
}

/** The colour slot a page plays in, from the mark on its game shell's header; fails under `tag` without one. */
export async function headerSlot(page: Page, tag: string): Promise<number> {
  const mark = page.getByTestId('guide').locator('header [role=img][data-slot]').first();
  const raw = await mark.getAttribute('data-slot', { timeout: SHOWN_MS }).catch(() => null);
  const slot = Number.parseInt(raw ?? '', 10);
  check(Number.isInteger(slot), `${tag}: the phone's header names its colour slot, got ${raw}`);
  return slot;
}

/** The start screen: the name field, and no table. */
export async function onStartScreen(page: Page): Promise<boolean> {
  return (await shows(page.getByPlaceholder('Heiko'))) && (await page.getByText("You're at the table").count()) === 0;
}

/** The link a move dialog's QR carries. The drawn cells must encode exactly that text, so a scan opens it. */
export async function qrLink(dialog: Locator, tag: string): Promise<string> {
  const qr = dialog.locator('svg[data-text]').filter({ visible: true });
  check(await shows(qr), `${tag}: the dialog shows a QR`);
  const text = (await qr.getAttribute('data-text')) ?? '';
  const drawn = await qr.evaluate((svg) => Array.from(svg.querySelectorAll('rect'), (r) => `${r.getAttribute('x')},${r.getAttribute('y')}`).join(' '));
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const encoded = Array.from(modules.data, (on, i) => (on ? `${i % modules.size},${Math.floor(i / modules.size)}` : ''))
    .filter(Boolean)
    .join(' ');
  check(text !== '' && drawn === encoded, `${tag}: the QR draws its link "${text}"`);
  return text;
}

/** The seat token this device keeps for itself. */
export function seatToken(page: Page): Promise<string> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('mule-seat') ?? '{}') as { token?: string }).token ?? '');
}

/** The move link names the room and a one-time code, never the device's own seat token. */
export function checkLink(link: string, code: string, token: string, who: string, tag: string): void {
  const url = new URL(link);
  check([...url.searchParams.keys()].sort().join(',') === 'handoff,room', `${tag}: ${who}'s link carries only room and handoff, got ${url.search}`);
  check(url.searchParams.get('room') === code, `${tag}: ${who}'s link names room ${code}, got ${url.search}`);
  const handoff = url.searchParams.get('handoff') ?? '';
  check(token !== '' && handoff !== '' && handoff !== token && !link.includes(token), `${tag}: ${who}'s link carries a handoff code, not the seat token`);
}
