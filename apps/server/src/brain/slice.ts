/**
 * A pause for work played in steps on the server's one thread: it lets the steps run for `sliceMs`, then yields to the
 * event loop once (timers and sockets of every room run) and starts the next slice. Between slices it answers
 * nothing, so a step costs no extra turn of the loop.
 */
export function timeSlicer(
  sliceMs: number,
  now: () => number = () => performance.now(),
  yieldNow: () => Promise<void> = () => new Promise((resolve) => setImmediate(resolve)),
): () => Promise<void> | undefined {
  let start = now();
  return () => {
    if (now() - start < sliceMs) return undefined;
    return yieldNow().then(() => {
      start = now();
    });
  };
}
