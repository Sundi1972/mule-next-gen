import { renderLandscape } from './landscape';
import { landscapeInput, type LandscapeJob, type PainterReply, type PainterRequest } from './landscape-job';
import { PictureCache } from './picture-cache';

/** Up to 3 pictures in all, never releasing one on screen: a session needs one per theme, so 3 cover a theme switch. */
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
    } catch (err) {
      // One failed job (memory pressure, say) keeps the worker; a worker that can't paint at all is given up.
      if (err instanceof WorkerGone) dropWorker();
    }
  }
  return onThisThread(job);
}

/** A mark per paint, which tests and the profiler count: `performance.getEntriesByName('landscape-paint')`. */
function markPaint(job: LandscapeJob, path: 'worker' | 'sync'): void {
  performance.mark('landscape-paint', { detail: { pxPerTile: job.pxPerTile, path } });
}

/**
 * For a browser without workers or OffscreenCanvas: the paint holds this thread, the PNG encoding need not, since
 * `toBlob` encodes in the background where the browser can.
 */
function onThisThread(job: LandscapeJob): Promise<string> {
  markPaint(job, 'sync');
  const img = renderLandscape(landscapeInput(job));
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d')?.putImageData(img, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('the canvas gave no PNG'))), 'image/png'),
  );
}

/** The worker can't paint for this page at all: it has no 2D OffscreenCanvas, it crashed, or it stopped answering. */
class WorkerGone extends Error {}

/**
 * How long a worker may take over one picture, while the page shows, before it counts as hung. The largest
 * picture, a 19×11 map at 180 px a plot (6.8 million pixels), takes about 4 s on a 2024 laptop; a phone four to
 * six times slower takes 16-24 s. Giving up on a working worker repaints on the main thread, the freeze itself,
 * so the bound stays clear of that; a hung worker costs a map its picture for this long, once a page.
 */
const WORKER_TIMEOUT_MS = 30_000;

/** One worker for the page, made when the first picture is wanted; `null` once the page can't have one. */
let worker: Worker | null | undefined;
let lastId = 0;
const replies = new Map<number, { resolve(url: string): void; reject(err: Error): void }>();

function landscapeWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return (worker = null);
  try {
    worker = new Worker(new URL('./landscape.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return (worker = null);
  }
  worker.onmessage = ({ data }: MessageEvent<PainterReply>) => {
    const reply = replies.get(data.id);
    if ('blob' in data) reply?.resolve(URL.createObjectURL(data.blob));
    else reply?.reject(data.incapable ? new WorkerGone(data.error) : new Error(data.error));
  };
  // A worker that errors is gone, with a job in hand or between jobs.
  worker.onerror = (e) => {
    e.preventDefault();
    dropWorker();
  };
  return worker;
}

function dropWorker(): void {
  worker?.terminate();
  worker = null;
  for (const reply of [...replies.values()]) reply.reject(new WorkerGone('landscape worker dropped'));
}

function inWorker(w: Worker, job: LandscapeJob): Promise<string> {
  const id = ++lastId;
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // The wait runs only while the page shows, and starts over when it comes back: a phone locked mid-paint may
    // have paused its worker, and giving up on it would repaint on the main thread.
    const arm = () => {
      clearTimeout(timeout);
      timeout = document.hidden ? undefined : setTimeout(() => (document.hidden ? arm() : settle(giveUp)), WORKER_TIMEOUT_MS);
    };
    const giveUp = () => reject(new WorkerGone(`no picture from the worker in ${WORKER_TIMEOUT_MS / 1000} s`));
    const settle = (fn: () => void) => {
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', arm);
      replies.delete(id);
      fn();
    };
    replies.set(id, { resolve: (url) => settle(() => resolve(url)), reject: (err) => settle(() => reject(err)) });
    document.addEventListener('visibilitychange', arm);
    arm();
    markPaint(job, 'worker');
    w.postMessage({ id, job } satisfies PainterRequest);
  });
}
