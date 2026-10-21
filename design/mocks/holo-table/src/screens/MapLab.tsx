import { HoloMap } from '@mule/ui';
import { MAP_H, MAP_W, TILES } from '../data';

/** Map only, large, for judging the landscape. */
export function MapLab() {
  return (
    <div className="flex min-h-screen flex-col gap-6 bg-table p-6">
      <HoloMap width={MAP_W} height={MAP_H} tiles={TILES} showOutput density="tv" />
      <div className="w-[390px]">
        <HoloMap width={MAP_W} height={MAP_H} tiles={TILES} showOutput focusSlot={0} />
      </div>
    </div>
  );
}
