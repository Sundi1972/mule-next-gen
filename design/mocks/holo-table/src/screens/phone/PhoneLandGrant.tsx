import { cx, HoloMap, TERRAIN_NAME } from '@mule/ui';
import { useState } from 'react';
import { MAP_H, MAP_W, ME, TILES } from '../../data';
import { cursorAt, useCountdown, useNow } from '../../proto';
import { PhoneShell } from './Shell';

/** What a plot is good for, in one line. */
const HINT: Partial<Record<string, string>> = {
  river: 'Good for Food',
  lake: 'Good for Water and Food',
  plains: 'Good for Energy',
  desert: 'Great for Energy',
  ice: 'Great for Water',
  hills: 'Good for Smithore',
  mountains: 'Smithore, more with more peaks',
  volcanic: 'Great for Energy',
  forest: 'Food, and Medicine factories',
  swamp: 'Medicine factories',
};

export function PhoneLandGrant() {
  const seconds = useCountdown(20);
  const now = useNow(100);
  const cursor = cursorAt(now);
  const [claimed, setClaimed] = useState<{ x: number; y: number; terrain: string }[]>([]);
  const left = 2 - claimed.length;
  const tiles = TILES.map((t) => (claimed.some((c) => c.x === t.x && c.y === t.y) ? { ...t, owner: ME } : t));
  const taken = claimed.some((c) => c.x === cursor.x && c.y === cursor.y);

  return (
    <PhoneShell phase="Land grant" seconds={seconds}>
      <div className="flex h-full flex-col gap-4">
        <p className="font-mono text-xs text-ink-3">PLOTS LIGHT UP AT RANDOM · TAP CLAIM WHEN YOURS IS LIT</p>
        <HoloMap width={MAP_W} height={MAP_H} tiles={tiles} cursor={cursor} />
        <div className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-4">
          <span className="label-caps">Cursor on</span>
          <span className="font-display text-2xl font-semibold">
            {TERRAIN_NAME[cursor.terrain]} <span className="font-mono text-lg text-ink-3">{cursor.x + 1}·{cursor.y + 1}</span>
          </span>
          <span className="text-ink-2">{HINT[cursor.terrain] ?? 'Hard land, cheap later'}</span>
        </div>
        <button
          type="button"
          disabled={left === 0 || taken}
          onClick={() => setClaimed((c) => [...c, { x: cursor.x, y: cursor.y, terrain: cursor.terrain }])}
          className={cx(
            'mt-auto flex h-36 shrink-0 flex-col items-center justify-center gap-1 rounded-sheet font-display transition active:scale-[0.98]',
            left === 0 ? 'border border-holo-faint bg-panel text-ink-3' : 'bg-holo text-on-holo shadow-glow hover:bg-holo-strong',
          )}
        >
          <span className="text-5xl font-bold tracking-wide">{left === 0 ? 'Done' : 'CLAIM'}</span>
          <span className="font-mono text-sm font-bold">{left} OF 2 CLAIMS LEFT</span>
        </button>
        {claimed.length > 0 && (
          <ul className="flex flex-col gap-1 font-mono text-sm text-ok">
            {claimed.map((c) => (
              <li key={`${c.x},${c.y}`}>
                ✓ CLAIMED {TERRAIN_NAME[c.terrain as keyof typeof TERRAIN_NAME].toUpperCase()} {c.x + 1}·{c.y + 1}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PhoneShell>
  );
}
