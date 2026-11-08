import { Button, Creature, cx, SLOT_COLOR } from '@mule/ui';
import { useState } from 'react';
import { fmt } from '../../../../../../apps/web/src/game/derive';
import { league } from '../../../../../../apps/web/src/game/month-end';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { ColonyWithFacts } from '../../../../../../apps/web/src/phone/hub/politics/Colony';
import { AiMark, PlayerCard, RepChip } from '../../copied/deals/parts';
import { useHub } from '../Hub';
import { StageTitle } from '../parts';

/*
 * GRAFT TARGET: new apps/web/src/phone/hub/tabs/Colony.tsx, from the Colony desk (politics/Colony.tsx::ColonyWithFacts:
 * the fund, the colony card with its gauges and projects, the build site, what you need, the news, the ship, the facts)
 * and the standings sheet's league with the reputation chips (the deals mock, P4). Two columns once the stage is wide
 * enough for them (844), one under the other at 667. What changed: Commission leaves for Governor › Budget, under
 * Projects (the budget mock, P12); the standings are on the page, not only behind "2nd of 4".
 */

/** The league with each name's reputation chip; the chip opens the player's card, "+ Deal" the composer in Talk. */
function Standings() {
  const { view, self } = usePhoneGame();
  const { openDesk } = useHub();
  const [card, setCard] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { rows } = league(view);
  return (
    <section ref={setAnchor} className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2" data-testid="colony-standings">
      <StageTitle aside="by Worth · the chip is reputation">Standings · month {view.month}</StageTitle>
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
              <RepChip view={view} id={r.player.id} onOpen={() => setCard(r.player.id)} testid={`colony-standing-${r.player.id}-rep`} />
              <span data-num className="ml-auto shrink-0 font-mono font-bold">
                {fmt(r.total)} cr
              </span>
              {!you ? (
                <Button size="md" variant="ghost" className="h-8! shrink-0 px-1.5 text-xs text-holo" onClick={() => openDesk('talk', `compose:${r.player.id}`)} aria-label={`Offer ${r.player.name} a deal card`} data-testid={`colony-standing-${r.player.id}-deal`}>
                  + Deal
                </Button>
              ) : (
                <span className="w-12 shrink-0" />
              )}
            </li>
          );
        })}
      </ul>
      {card && <PlayerCard view={view} id={card} me={self.id} anchor={anchor} onClose={() => setCard(null)} />}
    </section>
  );
}

export function ColonyTab() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto @container/colony" data-testid="colony-tab">
      {/* MOCK: hides ColonyWithFacts' own Commission, which moves under Governor › Budget's Projects line (P12). */}
      <div className="grid grid-cols-1 items-start gap-2 [&_[data-testid=commission-open]]:hidden @min-[480px]/colony:grid-cols-2" data-testid="colony-grid">
        <div className="flex min-w-0 flex-col gap-2">
          <Standings />
        </div>
        <div className="flex min-w-0 flex-col gap-2 @min-[480px]/colony:row-span-2">
          <ColonyWithFacts />
        </div>
      </div>
    </div>
  );
}
