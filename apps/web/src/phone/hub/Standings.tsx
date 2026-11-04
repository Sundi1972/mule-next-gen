import { GAME, POLITICS } from '@mule/engine';
import { Button, Creature, cx, SLOT_COLOR } from '@mule/ui';
import { fmt } from '../../game/derive';
import { collapseCutWords, inCollapse, league, yourLines } from '../../game/month-end';
import { useEscape } from '../dialog';
import { usePhoneGame } from '../game';
import { OnlyYou } from './OnlyYou';
import { standingOf } from './standing';

/** Your place, for the shell's header: "2nd of 4" under your money, by Worth. */
export function useStanding(onOpen: () => void): { label: string; aria: string; onOpen: () => void } {
  const { view, self } = usePhoneGame();
  const { label } = standingOf(view, self.id);
  return { label, aria: `You're ${label}. Open the standings.`, onOpen };
}

/**
 * The standings: every player's Worth, best first, and beside it your own Worth line by line. The others' rows are a
 * total each, the one number everyone sees; your lines come from your own view's parts, which no one else receives.
 */
export function StandingsSheet({ onClose }: { onClose: () => void }) {
  const { view, self } = usePhoneGame();
  useEscape(onClose);
  const { rows } = league(view);
  const mine = rows.find((r) => r.player.id === self.id);
  const p = view.me ? yourLines(view) : null;
  // Your lines as the month end's YourWorth gives them: in Collapse the cut line before the offices, so they add up.
  const collapse = inCollapse(view);
  const line = 'flex justify-between gap-3';
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-void/70 p-3" role="dialog" aria-modal aria-labelledby="standings-title" data-testid="standings-sheet">
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
                      </span>
                    </td>
                    <td data-num className="text-right font-mono font-bold">
                      {fmt(r.total)} cr
                    </td>
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
              {collapse && (
                <span className={line}>
                  <span>Collapse cut · {collapseCutWords()}</span>
                  <span data-num className="font-mono text-alert" data-testid="standings-cut">
                    −{fmt(p.cut)}
                  </span>
                </span>
              )}
              <span className={line}>
                <span>
                  Offices · {p.terms} {p.terms === 1 ? 'term' : 'terms'} × {POLITICS.termScore}
                  {collapse && ', cut too'}
                </span>
                <span data-num className="font-mono">
                  {fmt(p.office)}
                </span>
              </span>
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
          Worth, in credits: cash, goods at the store&apos;s price, land at {GAME.plotScore} cr a plot, MULEs at the store&apos;s price, and {POLITICS.termScore} cr a term in office. Everyone sees each other&apos;s total; nobody sees which goods anyone holds.
          {collapse && ` Every Worth is cut by ${collapseCutWords()}, offices too: the scores if the game ended now.`}
        </p>
      </div>
    </div>
  );
}
