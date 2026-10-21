import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
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
