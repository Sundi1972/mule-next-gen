import { beforeEach } from 'vitest';

// Many tests here play whole games synchronously. Run back to back they hold the worker's event loop, and past
// vitest's 60 s report timeout the run fails with "Timeout calling onTaskUpdate". One turn of the loop before each
// test lets the worker report in between.
beforeEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
