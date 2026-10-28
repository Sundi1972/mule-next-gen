import { renderLandscape } from './landscape';
import { landscapeInput, type LandscapeJob, type PainterReply, type PainterRequest } from './landscape-job';
import { PictureCache } from './picture-cache';

/** Pictures kept besides the ones on screen: one session needs one per theme, so a few cover a theme switch. */
const KEEP = 3;
const cache = new PictureCache(KEEP, (url) => {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
});

/** Pictures someone waits for, in the order asked; one is painted at a time. */
const waiting = new Map<string, { job: LandscapeJob; shows: Set<(url: string) => void> }>();
let painting = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Shows the landscape for `job`: at once when it has been painted before, else once it is. Returns the call that
 * stops: a picture no screen waits for by its turn is not painted.
 */
export function requestLandscape(job: LandscapeJob, show: (url: string) => void): () => void {
  const key = `${job.width}x${job.height}:${job.seed}:${job.theme}:${job.pxPerTile}:${job.terrain.join(',')}`;
  cache.hold(key);
  let stopped = false;
  const shown = (url: string) => show(url);
  const hit = cache.get(key);
  if (hit) show(hit);
  else {
    const entry = waiting.get(key) ?? { job, shows: new Set() };
    entry.shows.add(shown);
    waiting.set(key, entry);
    next();
  }
  return () => {
    if (stopped) return;
    stopped = true;
    waiting.get(key)?.shows.delete(shown);
    cache.letGo(key);
  };
}

/** Starts the next wanted picture, a moment from now so the screen that asked for it draws first. */
function next(): void {
  if (painting || timer) return;
  timer = setTimeout(() => void paintNext(), 16);
}

async function paintNext(): Promise<void> {
  timer = null;
  for (const [key, entry] of waiting) {
    if (entry.shows.size === 0) {
      waiting.delete(key);
      continue;
    }
    painting = true;
    try {
      const url = await paint(entry.job);
      cache.put(key, url);
      for (const show of entry.shows) show(url);
    } catch (err) {
      // The map keeps its base colour.
      console.error('landscape: no picture', err);
    } finally {
      waiting.delete(key);
      painting = false;
      next();
    }
    return;
  }
}

async function paint(job: LandscapeJob): Promise<string> {
  const worker = landscapeWorker();
  if (worker) {
    try {
      return await inWorker(worker, job);
    } catch {
      // The worker can't paint here (no 2D OffscreenCanvas, say): paint on this thread from now on.
      dropWorker();
    }
  }
  return onThisThread(job);
}

/** A mark per paint, which tests and the profiler count: `performance.getEntriesByName('landscape-paint')`. */
function markPaint(job: LandscapeJob, path: 'worker' | 'sync'): void {
  performance.mark('landscape-paint', { detail: { pxPerTile: job.pxPerTile, path } });
}

/** For a browser without workers or OffscreenCanvas: holds this thread for the whole paint. */
function onThisThread(job: LandscapeJob): string {
  markPaint(job, 'sync');
  const img = renderLandscape(landscapeInput(job));
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d')?.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** One worker for the page, made when the first picture is wanted; `null` once the page can't have one. */
let worker: Worker | null | undefined;
let lastId = 0;
const replies = new Map<number, { resolve(url: string): void; reject(err: Error): void }>();

function landscapeWorker(): Worker | null {
  if (worker !== undefined) return worker;
  // Tests set this to take the main-thread path in a browser that has workers.
  const forced = (globalThis as { __landscapeSync?: unknown }).__landscapeSync === true;
  if (forced || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return (worker = null);
  try {
    worker = new Worker(new URL('./landscape.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return (worker = null);
  }
  worker.onmessage = ({ data }: MessageEvent<PainterReply>) => {
    const reply = replies.get(data.id);
    replies.delete(data.id);
    if ('blob' in data) reply?.resolve(URL.createObjectURL(data.blob));
    else reply?.reject(new Error(data.error));
  };
  worker.onerror = (e) => {
    e.preventDefault();
    for (const reply of replies.values()) reply.reject(new Error(`landscape worker: ${e.message}`));
    replies.clear();
    dropWorker();
  };
  return worker;
}

function dropWorker(): void {
  worker?.terminate();
  worker = null;
}

function inWorker(w: Worker, job: LandscapeJob): Promise<string> {
  const id = ++lastId;
  return new Promise((resolve, reject) => {
    replies.set(id, { resolve, reject });
    markPaint(job, 'worker');
    w.postMessage({ id, job } satisfies PainterRequest);
  });
}
