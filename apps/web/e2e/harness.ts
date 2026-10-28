import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME } from '@mule/engine';
import { chromium, errors as playwrightErrors, type Browser, type Page } from 'playwright';
import { GRANT_TICK_MS } from '../../server/src/mule-game.js';
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

/** The phone is played sideways. 844x390 is a small phone on its side; PHONE_WIDE is a large one. */
export const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
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
