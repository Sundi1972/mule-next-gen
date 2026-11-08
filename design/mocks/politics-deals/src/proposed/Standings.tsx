import { GAME, POLITICS } from '@mule/engine';
import { Button, Creature, cx, SLOT_COLOR } from '@mule/ui';
import { useRef, useState } from 'react';
import { fmt } from '../../../../../apps/web/src/game/derive';
import { league, yourLines } from '../../../../../apps/web/src/game/month-end';
import { useEscape } from '../../../../../apps/web/src/phone/dialog';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { OnlyYou } from '../../../../../apps/web/src/phone/hub/OnlyYou';
import { PlayerCard, RepChip, useHubIfAny } from './parts';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/Standings.tsx::StandingsSheet (WS4; S3-C17, S3-C19). As today (the Collapse
 * lines left out of this copy, unchanged), with two changes, marked CHANGE:
 *   1. each name carries its reputation chip; the chip opens the player's card (reasons, Whisper, + Deal);
 *   2. in planning, each other player's row ends in "+ Deal": the standings row is one of P1's doors (S3-C17).
 */
export function StandingsSheet({ onClose }: { onClose: () => void }) {
  const { view, self } = usePhoneGame();
  const hub = useHubIfAny();
  const root = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<string | null>(null);
  useEscape(onClose);
  const { rows } = league(view);
  const mine = rows.find((r) => r.player.id === self.id);
  const p = view.me ? yourLines(view) : null;
  const donations = !!view.colony;
  const planning = view.phase === 'planning' && !!hub;
  const line = 'flex justify-between gap-3';
  return (
    <div ref={root} className="absolute inset-0 z-40 grid place-items-center bg-void/70 p-3" role="dialog" aria-modal aria-labelledby="standings-title" data-testid="standings-sheet">
      <div className="relative flex w-full max-w-[600px] flex-col gap-2 rounded-sheet border-2 border-holo bg-panel p-3 shadow-glow @min-[1100px]/shell:max-w-[760px] @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-6">
        <header className="flex items-center justify-between gap-2">
          <h2 id="standings-title" className="font-display text-lg font-semibold @min-[1100px]/shell:text-3xl">
            Standings · month {view.month}
          </h2>
          <Button size="md" variant="ghost" onClick={onClose} data-testid="standings-close">
            Close
          </Button>
        </header>
        <div className="grid grid-cols-[1fr_auto] items-start gap-3 @min-[1100px]/shell:gap-6">
          <table className="w-full text-left text-sm @min-[1100px]/shell:text-lg" data-testid="standings-table">
            <thead className="text-xs text-ink-3 @min-[1100px]/shell:text-sm">
              <tr>
                <th className="w-6 font-normal">#</th>
                <th className="font-normal">Player</th>
                <th className="text-right font-semibold text-ink">Worth</th>
                {planning && <th className="w-0" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const you = r.player.id === self.id;
                return (
                  <tr key={r.player.id} className={cx('border-t border-holo-faint', you && 'bg-holo-soft')} data-testid={`standing-${r.player.id}`}>
                    <td data-num className="py-1 font-mono text-ink-3 @min-[1100px]/shell:py-2">
                      {r.rank}
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Creature species={r.player.species} color={SLOT_COLOR[r.slot]} size={18} />
                        {you ? `You (${r.player.name})` : r.player.name}
                        {/* CHANGE 1 */}
                        <RepChip view={view} id={r.player.id} onOpen={() => setCard(r.player.id)} testid={`standing-${r.player.id}-rep`} />
                      </span>
                    </td>
                    <td data-num className="text-right font-mono font-bold">
                      {fmt(r.total)} cr
                    </td>
                    {planning && (
                      <td className="pl-1.5 text-right">
                        {/* CHANGE 2 */}
                        {!you && (
                          <Button
                            size="md"
                            variant="ghost"
                            className="h-8 whitespace-nowrap px-1.5 text-xs text-holo"
                            onClick={() => {
                              onClose();
                              hub!.openDesk('talk', `compose:${r.player.id}`);
                            }}
                            aria-label={`Offer ${r.player.name} a deal card`}
                            data-testid={`standing-${r.player.id}-deal`}
                          >
                            + Deal
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {p && mine && (
            <div className="flex min-w-[170px] flex-col gap-0.5 rounded-panel border border-holo-line p-2 text-xs @min-[1100px]/shell:min-w-[240px] @min-[1100px]/shell:text-base" data-testid="standings-mine">
              <span className="mb-0.5 flex items-center justify-between gap-2">
                <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Your worth</span>
                <OnlyYou />
              </span>
              <span className={line}>
                <span>Cash</span>
                <span data-num className="font-mono">
                  {fmt(p.money)}
                </span>
              </span>
              <span className={line}>
                <span>Goods · {p.units} units</span>
                <span data-num className="font-mono">
                  {fmt(p.goods)}
                </span>
              </span>
              <span className={line}>
                <span>
                  Land · {p.plots} × {GAME.plotScore}
                </span>
                <span data-num className="font-mono">
                  {fmt(p.land)}
                </span>
              </span>
              <span className={line}>
                <span>
                  MULEs · {p.mules} × {fmt(view.mulePrice)}
                </span>
                <span data-num className="font-mono">
                  {fmt(p.muleValue)}
                </span>
              </span>
              <span className={line}>
                <span>
                  Offices · {p.terms} {p.terms === 1 ? 'term' : 'terms'} × {POLITICS.termScore}
                </span>
                <span data-num className="font-mono">
                  {fmt(p.office)}
                </span>
              </span>
              {donations && (
                <span className={line}>
                  <span>Donations</span>
                  <span data-num className="font-mono">
                    {fmt(p.donated)}
                  </span>
                </span>
              )}
              <span className={cx(line, 'mt-0.5 border-t border-holo-faint pt-0.5 font-semibold')}>
                <span>Your worth</span>
                <span data-num className="font-mono font-bold">
                  {fmt(mine.total)}
                </span>
              </span>
            </div>
          )}
        </div>
        <p className="text-xs leading-snug text-ink-2 @min-[1100px]/shell:text-base" data-testid="standings-rule">
          Worth, in credits: cash, goods at the store&apos;s price, land at {GAME.plotScore} cr a plot, MULEs at the store&apos;s price, {POLITICS.termScore} cr a term in office{donations ? ', and donations to the colony' : ''}. Everyone sees each other&apos;s total; nobody sees which goods anyone holds.
        </p>
      </div>
      {card && <PlayerCard view={view} id={card} me={self.id} anchor={root.current} onClose={() => setCard(null)} />}
    </div>
  );
}
