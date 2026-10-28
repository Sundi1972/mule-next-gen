/** Milliseconds the device clock may move apart from the monotonic clock between two samples before it counts as a jump. */
export const CLOCK_JUMP_MS = 1_000;

/**
 * Estimates the difference between the server's clock and this screen's,
 * from ping/pong round trips. The sample with the shortest round trip wins:
 * it has the least room for the network to have skewed it.
 */
export class ClockSync {
  private samples: { rtt: number; offset: number }[] = [];

  constructor(private readonly keep = 8) {}

  /** Records one round trip: when the ping left, the server's time in the pong, and when the pong arrived. */
  add(sentAt: number, serverTime: number, receivedAt: number): void {
    const rtt = receivedAt - sentAt;
    if (rtt < 0) return;
    this.samples.push({ rtt, offset: serverTime - (sentAt + receivedAt) / 2 });
    if (this.samples.length > this.keep) this.samples.shift();
  }

  /** Milliseconds to add to this screen's clock to get the server's. Zero until the first pong. */
  get offset(): number {
    let best: { rtt: number; offset: number } | undefined;
    for (const s of this.samples) if (!best || s.rtt < best.rtt) best = s;
    return best ? Math.round(best.offset) : 0;
  }

  get synced(): boolean {
    return this.samples.length > 0;
  }

  /** The server's time now. */
  serverNow(localNow: number): number {
    return localNow + this.offset;
  }
}
