/**
 * Paints landscapes off the main thread, so a phase change never waits on one: the picture comes back as a PNG
 * Blob. Without a 2D OffscreenCanvas it answers with an error, and the page paints on its own thread instead.
 */
import { renderLandscape } from './landscape';
import { landscapeInput, type PainterReply, type PainterRequest } from './landscape-job';

const scope = self as unknown as { onmessage: ((e: MessageEvent<PainterRequest>) => void) | null; postMessage(reply: PainterReply): void };

scope.onmessage = async ({ data: { id, job } }) => {
  try {
    const img = renderLandscape(landscapeInput(job));
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D OffscreenCanvas');
    ctx.putImageData(img, 0, 0);
    scope.postMessage({ id, blob: await canvas.convertToBlob({ type: 'image/png' }) });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
