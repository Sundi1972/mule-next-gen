import { Button, Creature, cx, SLOT_COLOR } from '@mule/ui';
import { useState } from 'react';
import { AiMark } from '../../../chat/Chat';
import { Grounds } from '../../../components/Grounds';
import { fmt } from '../../../game/derive';
import { league } from '../../../game/month-end';
import { usePhoneGame } from '../../game';
import { useHub } from '../Hub';
import { noNewCard } from '../politics/Deals';
import { PlayerCard, RepChip } from '../politics/parts';
import { ColonyWithFacts } from '../politics/Colony';
import { StageTitle } from './parts';

/*
 * The Colony tab (the approved hub-tabs mock, D10, D16): the colony picture leads it, mounted exactly as the colony
 * desk does; then the standings on the page; then the colony desk's sections (the fund, the colony card, the build
 * site, what you need, the news, the ship, the facts), in two columns once the stage is wide enough (844).
 */

/**
 * The league by Worth, on the page as well as behind "2nd of 4". While the table plays politics each name carries its
 * reputation chip, which opens the player's card, and each other row "+ Deal", the composer in Talk.
 */
function Standings() {
  const { view, me, self } = usePhoneGame();
  const { openDesk } = useHub();
  const [card, setCard] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { rows } = league(view);
  const politics = !!view.politics;
  return (
    <section ref={setAnchor} className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2" data-testid="colony-standings">
      <StageTitle aside={politics ? 'by Worth · the chip is reputation' : 'by Worth'}>Standings · month {view.month}</StageTitle>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const you = r.player.id === self.id;
          const why = politics && !you ? noNewCard(view, me, r.player.id) : null;
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
              {politics && <RepChip view={view} id={r.player.id} onOpen={() => setCard(r.player.id)} testid={`colony-standing-${r.player.id}-rep`} />}
              <span data-num className="ml-auto shrink-0 font-mono font-bold">
                {fmt(r.total)} cr
              </span>
              {politics &&
                (!you ? (
                  <Button
                    size="md"
                    variant="ghost"
                    className="h-8! shrink-0 px-1.5 text-xs text-holo"
                    disabled={!!why}
                    title={why ?? undefined}
                    onClick={() => openDesk('talk', `compose:${r.player.id}`)}
                    aria-label={`Offer ${r.player.name} a deal card`}
                    data-testid={`colony-standing-${r.player.id}-deal`}
                  >
                    + Deal
                  </Button>
                ) : (
                  // Keeps the Worth column straight on your own row.
                  <Button size="md" variant="ghost" className="invisible h-8! shrink-0 px-1.5 text-xs" tabIndex={-1} aria-hidden disabled>
                    + Deal
                  </Button>
                ))}
            </li>
          );
        })}
      </ul>
      {card && <PlayerCard view={view} id={card} me={self.id} anchor={anchor} onClose={() => setCard(null)} />}
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
          <Grounds colony={view.colony} size="phone" light={view.phase === 'upkeep' ? 'dusk' : 'day'} players={view.players.length} />
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
