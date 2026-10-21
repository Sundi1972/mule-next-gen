import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { createMuleServer, type MuleServer } from '../../server/src/server.js';

/** The real game server, serving the built client from apps/web/dist on a free port. */
export async function startServer(): Promise<{ server: MuleServer; base: string }> {
  const staticDir = fileURLToPath(new URL('../dist', import.meta.url));
  const server = createMuleServer({ staticDir });
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
