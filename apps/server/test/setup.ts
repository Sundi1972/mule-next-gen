/** Runs before every server test file: no Anthropic credential from the shell, and the cost ledger in a temp dir. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach } from 'vitest';

// Plain deletes, not vi.stubEnv: a test file's vi.unstubAllEnvs() would put the shell's key back.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mule-brain-log-'));
process.env.MULE_BRAIN_LOG = path.join(ledgerDir, 'brain-costs.jsonl');
afterAll(() => fs.rmSync(ledgerDir, { recursive: true, force: true }));

// Many tests here play whole games synchronously. Run back to back they hold the worker's event loop, and past
// vitest's 60 s report timeout the run fails with "Timeout calling onTaskUpdate". One turn of the loop before each
// test lets the worker report in between.
beforeEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
