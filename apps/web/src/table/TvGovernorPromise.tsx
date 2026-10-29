import type { MuleView } from '@mule/protocol';
import { cx, PlayerMark } from '@mule/ui';
import { toSlot } from '../game/derive';
import { termPromise } from '../phone/hub/politics/words';

/** Under the TV's planning header: "Governor Ossa · promised up to 4% · tax 4%, kept", in the phone's words; nothing with no Governor. */
export function TvGovernorPromise({ game }: { game: MuleView }) {
  const politics = game.politics;
  const governor = game.players.find((p) => p.id === politics?.governor);
  if (!politics || !governor) return null;
  const line = termPromise({ month: game.month, politics });
  return (
    <p className="mt-2 flex items-center gap-2 text-2xl text-ink-2" data-testid="tv-governor-promise">
      Governor <PlayerMark slot={toSlot(governor.slot)} size={22} />
      <strong className="font-display font-semibold text-ink">{governor.name}</strong>
      {line && (
        <>
          {' '}
          <span>· promised {line.promised} ·</span>{' '}
          <strong className={cx('font-semibold', line.tone)} data-testid="tv-promise-status">
            {line.status}
          </strong>
        </>
      )}
    </p>
  );
}
