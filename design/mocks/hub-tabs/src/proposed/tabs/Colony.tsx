import { Button, Creature, cx, SLOT_COLOR } from '@mule/ui';
import { useState } from 'react';
import { fmt } from '../../../../../../apps/web/src/game/derive';
import { league } from '../../../../../../apps/web/src/game/month-end';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { Grounds } from '../../../../../../apps/web/src/components/Grounds';
import { ColonyWithFacts } from '../../../../../../apps/web/src/phone/hub/politics/Colony';
import { AiMark, PlayerCard, RepChip } from '../../copied/deals/parts';
import { useHub } from '../Hub';
import { StageTitle } from '../parts';

/*
 * GRAFT TARGET: new apps/web/src/phone/hub/tabs/Colony.tsx, from the Colony desk (politics/Colony.tsx::ColonyWithFacts:
 * the fund, the colony card with its gauges and projects, the build site, what you need, the news, the ship, the facts)
 * and the standings sheet's league with the reputation chips (the deals mock, P4). Two columns once the stage is wide
 * enough for them (844), one under the other at 667; the standings span the stage above them. The colony picture leads the
 * tab (PM ruling 8 Nov, per WS10): WS10's rendered grounds, mounted exactly as the phone colony desk does (politics/Colony.tsx:20),
 * the real buildings at their stage on their plate, lit by wealth; screens never draw buildings. What changed: Commission leaves for Governor › Budget, under
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
                // Keeps the Worth column straight on your own row.
                <Button size="md" variant="ghost" className="invisible h-8! shrink-0 px-1.5 text-xs" tabIndex={-1} aria-hidden disabled>
                  + Deal
                </Button>
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
  const { view } = usePhoneGame();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto @container/colony" data-testid="colony-tab">
      {view.colony && (
        // The desk's box: 212 px tall (h-53), the picture at its own 16:9 inside it, letterboxed on the void. Wider stages
        // (844, the bottom bar) would draw it up to 560 × 315 at full width, the whole first screen; capped, the standings stay on it.
        <div className="flex h-53 shrink-0 justify-center overflow-hidden rounded-panel border border-holo-line bg-void [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full" data-testid="colony-picture">
          <Grounds colony={view.colony} size="phone" light={view.phase === 'upkeep' ? 'dusk' : 'day'} />
        </div>
      )}
      <Standings />
      {/* The colony desk's sections flow in two columns once the stage is wide enough (844), one under the other at 667. */}
      {/* MOCK: hides ColonyWithFacts' own Commission, which moves under Governor › Budget's Projects line (P12), and its own grounds, which lead the tab. */}
      <div className="gap-2 [&_[data-testid=commission-open]]:hidden [&_[data-testid=colony-grounds]]:hidden [&>*]:mb-2 [&>*]:break-inside-avoid @min-[480px]/colony:columns-2" data-testid="colony-columns">
        <ColonyWithFacts />
      </div>
    </div>
  );
}
