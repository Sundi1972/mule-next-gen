import { onTestFinished } from 'vitest';
import { HEALTH } from '../src/index.js';

function withHealthAs<T>(on: boolean, body: () => T): T {
  const was = HEALTH.enabled;
  HEALTH.enabled = on;
  try {
    return body();
  } finally {
    HEALTH.enabled = was;
  }
}

/** Runs `body` with colony health on, and puts back what it was whatever happens. */
export function withHealth<T>(body: () => T): T {
  return withHealthAs(true, body);
}

/** Runs `body` with colony health off, and puts back what it was whatever happens. */
export function withoutHealth<T>(body: () => T): T {
  return withHealthAs(false, body);
}

/** Colony health off for the rest of the calling test, back to what it was when the test finishes (async tests too). */
export function healthOffInTest(): void {
  const was = HEALTH.enabled;
  HEALTH.enabled = false;
  onTestFinished(() => void (HEALTH.enabled = was));
}
