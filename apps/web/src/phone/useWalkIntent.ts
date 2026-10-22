import type { MuleIntent } from '@mule/protocol';
import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useClient } from '../net/react';

export type WalkDir = 'up' | 'down' | 'stop';

/** The board's -1 / 0 / 1 as a walk direction. */
export const stepDir = (d: -1 | 0 | 1): WalkDir => (d > 0 ? 'up' : d < 0 ? 'down' : 'stop');

/**
 * What one phone sends for its walker: a direction only when it changes, and
 * nothing while this phone isn't walking. `board` names the round being
 * walked (a good, a lot), or null off the board.
 */
export class WalkIntent {
  private round: string | null = null;
  private dir: WalkDir = 'stop';

  constructor(private readonly client: { intent(intent: MuleIntent): void }) {}

  board(round: string | null): void {
    if (round === this.round) return;
    // Between rounds the engine has already stopped this walker: forget the held direction
    // without telling it, so the next round's first press always goes out.
    this.round = round;
    this.dir = 'stop';
  }

  walk(next: WalkDir): void {
    if (this.round === null || this.dir === next) return;
    this.dir = next;
    this.client.intent({ type: 'walk', dir: next });
  }

  /** An arrow key pressed, on a laptop. */
  keyDown(key: string, doc: { querySelector(selectors: string): unknown }): void {
    // The arrows belong to an open dialog; a key let go still stops, so nothing walks on unseen.
    if (doc.querySelector('[aria-modal="true"]')) return;
    if (key === 'ArrowUp') this.walk('up');
    if (key === 'ArrowDown') this.walk('down');
  }

  /** An arrow key let go. */
  keyUp(key: string): void {
    if (key === 'ArrowUp' || key === 'ArrowDown') this.walk('stop');
  }
}

/**
 * The walk controls both auctions share: the returned `walk` for Hold and the
 * board, and the arrow keys on a laptop. `round` changes with each good or lot,
 * so a direction held across the bell never carries into the next one.
 */
export function useWalkIntent(onBoard: boolean, round: string): (next: WalkDir) => void {
  const client = useClient();
  const intent = useMemo(() => new WalkIntent(client), [client]);
  // Before paint, so a press on the freshly drawn board already counts as the round's first.
  useLayoutEffect(() => intent.board(onBoard ? round : null), [intent, onBoard, round]);
  const walk = useCallback((next: WalkDir) => intent.walk(next), [intent]);

  useEffect(() => {
    if (!onBoard) return;
    const down = (e: KeyboardEvent) => intent.keyDown(e.key, document);
    const up = (e: KeyboardEvent) => intent.keyUp(e.key);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [onBoard, intent]);

  return walk;
}
