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

/** Chromium from the preinstalled browsers; falls back to the plain binary if the versions don't match. */
export async function launch(): Promise<Browser> {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
}

/** The phone is played sideways. 844x390 is a small phone on its side; PHONE_WIDE is a large one. */
export const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
export const PHONE_WIDE = { width: 932, height: 430 };
export const TV = { viewport: { width: 1920, height: 1080 } };

export function check(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`E2E check failed: ${message}`);
}
