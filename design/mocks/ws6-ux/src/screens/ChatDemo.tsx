import { Creature, HoloMap, SLOT_COLOR, type Slot } from '@mule/ui';
import { mapTiles } from '../../../../../apps/web/src/game/derive';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { H, VIEW, W } from '../fixture';
import { Speaker, Ticker } from '../proposed/Chat';

/**
 * The TV during development, with live table chat: the ticker runs under the
 * header, and each speaker's bubble pops at their creature on the map. The TV
 * never receives whispers, so Ossa's whisper to Lena never shows here.
 */

const ON_MAP: { id: string; x: number; y: number }[] = [
  { id: 'ossa', x: 9, y: 2 },
  { id: 'kai', x: 8, y: 6 },
  { id: 'brix', x: 6, y: 4 },
  { id: 'lena', x: 5, y: 6 },
];

export function TvChat() {
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink" data-testid="tv-chat">
      <TvHeader game={{ ...VIEW, phase: 'development' }} title="Development" seconds={31} />
      <div className="rounded-panel border border-holo-line bg-panel/60 px-4 py-2">
        <Ticker size="tv" />
      </div>
      <div className="relative mx-auto w-[900px]">
        <HoloMap width={W} height={H} tiles={mapTiles(VIEW)} density="tv" hideGround className="w-full" />
        {ON_MAP.map((c) => {
          const p = VIEW.players.find((x) => x.id === c.id)!;
          const slot = VIEW.players.indexOf(p) as Slot;
          return (
            <span key={c.id} className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${((c.x + 0.5) / W) * 100}%`, top: `${((c.y + 0.5) / H) * 100}%` }}>
              <Speaker id={c.id} size="tv">
                <Creature species={p.species} color={SLOT_COLOR[slot]} size={48} />
              </Speaker>
            </span>
          );
        })}
      </div>
    </div>
  );
}
