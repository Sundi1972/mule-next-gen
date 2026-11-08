import { Creature, cx, SLOT_COLOR } from '@mule/ui';
import { AiMark } from '../../../chat/Chat';
import { Grounds } from '../../../components/Grounds';
import { fmt } from '../../../game/derive';
import { league } from '../../../game/month-end';
import { usePhoneGame } from '../../game';
import { ColonyWithFacts } from '../politics/Colony';
import { StageTitle } from './parts';

/*
 * The Colony tab (the approved hub-tabs mock, D10, D16): the colony picture leads it, mounted exactly as the colony
 * desk does; then the standings on the page; then the colony desk's sections (the fund, the colony card, the build
 * site, what you need, the news, the ship, the facts), in two columns once the stage is wide enough (844).
 */

/** The league by Worth, on the page as well as behind "2nd of 4". */
function Standings() {
  const { view, self } = usePhoneGame();
  const { rows } = league(view);
  return (
    <section className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2" data-testid="colony-standings">
      <StageTitle aside="by Worth">Standings · month {view.month}</StageTitle>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const you = r.player.id === self.id;
          return (
            <li key={r.player.id} className={cx('flex min-h-9 items-center gap-1.5 border-t border-holo-faint text-xs first:border-t-0', you && 'bg-holo-soft')} data-testid={`colony-standing-${r.player.id}`}>
              <span data-num className="w-4 shrink-0 text-center font-mono text-ink-3">
                {r.rank}
              </span>
              <Creature species={r.player.species} color={SLOT_COLOR[r.slot]} size={16} />
              <span className="min-w-0 truncate font-semibold">
                {you ? `You (${r.player.name})` : r.player.name}
                {r.player.isAi && <AiMark />}
              </span>
              <span data-num className="ml-auto shrink-0 font-mono font-bold">
                {fmt(r.total)} cr
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ColonyTab() {
  const { view } = usePhoneGame();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto @container/colony" data-testid="colony-tab">
      {view.colony && (
        // The desk's 212 px box, the picture at its own 16:9 inside it, letterboxed: the standings stay on the first screen.
        <div className="flex h-53 shrink-0 justify-center overflow-hidden rounded-panel border border-holo-line bg-void [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full" data-testid="colony-picture">
          <Grounds colony={view.colony} size="phone" light={view.phase === 'upkeep' ? 'dusk' : 'day'} />
        </div>
      )}
      <Standings />
      {/* The desk's own picture gives way to the one leading the tab. */}
      <div className="gap-2 [&_[data-testid=colony-grounds]]:hidden [&>*]:mb-2 [&>*]:break-inside-avoid @min-[480px]/colony:columns-2" data-testid="colony-columns">
        <ColonyWithFacts />
      </div>
    </div>
  );
}
