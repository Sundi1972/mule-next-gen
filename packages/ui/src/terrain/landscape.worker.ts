/**
 * Paints landscapes off the main thread, so a phase change never waits on one: the picture comes back as a PNG
 * Blob. Without a 2D OffscreenCanvas it answers with an error, and the page paints on its own thread instead.
 */
import { renderLandscape } from './landscape';
import { landscapeInput, type PainterReply, type PainterRequest } from './landscape-job';

const scope = self as unknown as { onmessage: ((e: MessageEvent<PainterRequest>) => void) | null; postMessage(reply: PainterReply): void };

scope.onmessage = async ({ data: { id, job } }) => {
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  try {
    ctx = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
  } catch {
    // Some browsers throw rather than answer null; either way this worker can never paint.
  }
  if (!ctx) {
    scope.postMessage({ id, error: 'no 2D OffscreenCanvas in a worker', incapable: true });
    return;
  }
  try {
    const img = renderLandscape(landscapeInput(job));
    ctx.canvas.width = img.width;
    ctx.canvas.height = img.height;
    ctx.putImageData(img, 0, 0);
    scope.postMessage({ id, blob: await ctx.canvas.convertToBlob({ type: 'image/png' }) });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err), incapable: false });
  }
};
