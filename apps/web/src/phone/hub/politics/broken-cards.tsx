import type { MuleView } from '@mule/protocol';
import { cx, PlayerMark } from '@mule/ui';
import { SeatWords } from '../../../components/SeatWords';
import type { Density } from '../../../components/MonthEnd';
import { toSlot } from '../../../game/derive';
import { brokenIn, brokenMove, brokenWho, brokenWords } from './deals-words';

/** The month's broken cards, in public: who broke a promise to whom, what was promised, and the drop (S3-C20). */
export function BrokenCards({ view, month, density }: { view: MuleView; month: number; density: Density }) {
  const cards = brokenIn(view, month);
  if (cards.length === 0) return null;
  const tv = density === 'tv';
  return (
    <section className={cx('flex flex-col rounded-panel border-2 border-dashed border-alert bg-panel', tv ? 'gap-2 p-5' : 'gap-1 px-2.5 py-1.5')} aria-label="Cards broken this month" data-testid="broken-cards">
      <h2 className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]!')}>Broken this month · in public</h2>
      <ul className={cx('flex flex-col', tv ? 'gap-2' : 'gap-0.5')}>
        {cards.map((c) => {
          const who = view.players.find((p) => p.id === (c.brokenBy ?? c.from))!;
          return (
            <li key={c.id} className={cx('flex items-center', tv ? 'gap-3 text-2xl' : 'gap-1.5 text-xs')} data-testid={`broken-${c.id}`}>
              <span aria-hidden className={cx('shrink-0 font-mono font-bold text-alert', tv ? 'text-2xl' : 'text-xs')}>
                ✗
              </span>
              <PlayerMark slot={toSlot(who.slot)} species={who.species} size={tv ? 28 : 14} label={who.name} />
              <span className="min-w-0 flex-1 leading-snug" data-testid={`broken-${c.id}-words`}>
                <SeatWords text={brokenWords(view, c)} who={brokenWho(c)} players={view.players} />
              </span>
              <span data-num className={cx('shrink-0 font-mono font-bold text-alert', tv ? 'text-2xl' : 'text-xs')} data-testid={`broken-${c.id}-drop`}>
                −{-brokenMove(c)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
