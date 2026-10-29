import { beforeAll, describe, expect, it } from 'vitest';

/** The worker's global scope, standing in for a browser's: what the worker posts back is collected. */
const posted: unknown[] = [];
const scope: { onmessage: ((e: { data: unknown }) => unknown) | null; postMessage(m: unknown): void } = {
  onmessage: null,
  postMessage: (m) => posted.push(m),
};

beforeAll(async () => {
  Object.assign(globalThis, {
    self: scope,
    ImageData: class {
      readonly data: Uint8ClampedArray;
      constructor(
        readonly width: number,
        readonly height: number,
      ) {
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    },
  });
  await import('../src/terrain/landscape.worker');
});

const JOB = { width: 2, height: 1, pxPerTile: 4, theme: 'light', seed: 1, terrain: ['plains', 'plains'] };
const PNG = new Blob(['png'], { type: 'image/png' });

/** An OffscreenCanvas whose 2D context is `ctx`, or whose getContext throws `ctx` when it is an Error. */
function offscreen(ctx: null | Error | { convertToBlob(): Promise<Blob> }) {
  return class {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      if (ctx instanceof Error) throw ctx;
      return ctx && { canvas: { ...ctx, width: 0, height: 0 }, putImageData() {} };
    }
  };
}

const ROWS: [string, unknown, unknown][] = [
  ['no OffscreenCanvas at all', undefined, { id: 7, error: expect.any(String), incapable: true }],
  ['a 2D context the browser refuses', offscreen(null), { id: 7, error: expect.any(String), incapable: true }],
  ['a 2D context that throws', offscreen(new Error('2d is not supported here')), { id: 7, error: expect.any(String), incapable: true }],
  ['an encoder that fails this once', offscreen({ convertToBlob: () => Promise.reject(new Error('out of memory')) }), { id: 7, error: 'out of memory', incapable: false }],
  ['a working canvas', offscreen({ convertToBlob: () => Promise.resolve(PNG) }), { id: 7, blob: PNG }],
];

describe('FM-FREEZE-3: the landscape worker says whether it can ever paint', () => {
  it.each(ROWS)('FM-FREEZE-3: with %s', async (_label, OffscreenCanvas, reply) => {
    posted.length = 0;
    if (OffscreenCanvas) Object.assign(globalThis, { OffscreenCanvas });
    else delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;

    await Promise.resolve(scope.onmessage?.({ data: { id: 7, job: JOB } })).catch(() => undefined);

    expect(posted).toEqual([reply]);
  });
});
