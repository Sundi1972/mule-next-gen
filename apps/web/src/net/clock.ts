/** Milliseconds the device clock may move apart from the monotonic clock between two readings before it counts as a jump. */
export const CLOCK_JUMP_MS = 1_000;

/** What ClockSync needs to notice the device clock jumping; without it, it never does. */
export interface ClockWatch {
  /** A clock the device can't change: performance.now(). */
  monotonic: () => number;
  /** Called once per jump, after the samples moved with the device clock. */
  onJump: () => void;
  /** Called whenever `offset` changes: a jump's shift, or a round trip that moves it. */
  onOffset: () => void;
}

/**
 * Estimates the difference between the server's clock and this screen's,
 * from ping/pong round trips. The sample with the shortest round trip wins:
 * it has the least room for the network to have skewed it.
 */
export class ClockSync {
  private samples: { rtt: number; offset: number }[] = [];
  /** The device clock minus the monotonic clock at the last reading. */
  private skew: number | null = null;
  /** The device time the last jump was noticed at. */
  private jumpedAt = -Infinity;
  /** True from a jump until the first round trip measured after it. */
  private shifted = false;

  constructor(
    private readonly keep = 8,
    private readonly watch: ClockWatch | null = null,
  ) {}

  /** Records one round trip: when the ping left, the server's time in the pong, and this screen's clock now. Notices a jump first. */
  add(sentAt: number, serverTime: number, receivedAt: number): void {
    this.follow(receivedAt);
    // Sent before the jump was noticed, so its round trip may straddle the jump.
    if (sentAt < this.jumpedAt) return;
    const rtt = receivedAt - sentAt;
    if (rtt < 0) return;
    const before = this.offset;
    // A sleep that paused the monotonic clock looks like a jump while the device clock was right, so the shift was a guess.
    if (this.shifted) {
      this.samples = [];
      this.shifted = false;
    }
    this.samples.push({ rtt, offset: serverTime - (sentAt + receivedAt) / 2 });
    if (this.samples.length > this.keep) this.samples.shift();
    if (this.offset !== before) this.watch?.onOffset();
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

  /** The server's time now, given this screen's clock now. Notices a jump first. */
  serverNow(localNow: number): number {
    this.follow(localNow);
    return localNow + this.offset;
  }

  /** When the device clock moved more than CLOCK_JUMP_MS apart from the monotonic clock since the last reading, moves the samples with it. */
  private follow(localNow: number): void {
    if (!this.watch) return;
    const skew = localNow - this.watch.monotonic();
    const jump = this.skew === null ? 0 : skew - this.skew;
    this.skew = skew;
    if (Math.abs(jump) <= CLOCK_JUMP_MS) return;
    const before = this.offset;
    for (const s of this.samples) s.offset -= jump;
    this.shifted = this.samples.length > 0;
    this.jumpedAt = localNow;
    this.watch.onJump();
    if (this.offset !== before) this.watch.onOffset();
  }
}
