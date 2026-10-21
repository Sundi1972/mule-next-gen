import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../src/brain/index.js';
import { KEY, type SdkModuleFake } from './brain-fakes.js';

/** The SDK module's constructor: records its options and builds nothing, so no network and no credential chain. */
const sdkModule = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdkModule));

beforeEach(() => {
  sdkModule.built = [];
  sdkModule.create = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the server test setup', () => {
  // trace-allow: positive control for the test setup that clears the key (plan Task 3.3 SAFETY), not a product promise
  it('builds no client from the shell and logs to a temp file; only a key a test stubs builds one', () => {
    const log = process.env.MULE_BRAIN_LOG ?? '';
    expect(log.startsWith(os.tmpdir())).toBe(true);
    expect(log.split(path.sep).join('/')).not.toContain('apps/server/data');

    createBrain({ gameId: 'g-setup-default' });
    expect(sdkModule.built).toEqual([]);

    vi.stubEnv('ANTHROPIC_API_KEY', KEY.ANTHROPIC_API_KEY);
    createBrain({ gameId: 'g-setup-stubbed' });
    expect(sdkModule.built).toHaveLength(1);
  });
});
