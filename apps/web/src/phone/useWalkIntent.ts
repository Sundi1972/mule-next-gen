import type { MuleIntent } from '@mule/protocol';

export type WalkDir = 'up' | 'down' | 'stop';

/** The goods auction's walk controls as Auction.tsx has them, before the shared hook. */
export class WalkIntent {
  private dir: WalkDir = 'stop';

  constructor(private readonly client: { intent(intent: MuleIntent): void }) {}

  board(_round: string | null): void {}

  walk(next: WalkDir): void {
    if (this.dir === next) return;
    this.dir = next;
    this.client.intent({ type: 'walk', dir: next });
  }
}
