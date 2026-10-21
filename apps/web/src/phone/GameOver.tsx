import { POLLUTION } from '@mule/engine';
import { AirGauge, Button, cx, Panel, PlayerMark, SPECIES_NAME } from '@mule/ui';
import { colonyVerdict, fmt, PHASE_NAME, standings } from '../game/derive';
import { useClient } from '../net/react';
import { usePhoneGame } from './game';
import { PhoneShell } from './Shell';

/**
 * The end of the game. Your phone shows what made your score and what the colony's
 * air did to it; the big screen shows only totals, since goods are private.
 */
export function GameOver() {
  const client = useClient();
  const { view, self } = usePhoneGame();
  const ranks = standings(view);
  const winner = ranks[0];
  const mineAt = ranks.findIndex((r) => r.player.id === self.id);
  const mine = view.scores?.find((s) => s.id === self.id);
  const p = mine?.parts;
  const won = winner?.player.id === self.id;
  const v = colonyVerdict(view.air);

  return (
    <PhoneShell
      phase={PHASE_NAME.gameOver}
      rail={
        <>
          <div className="flex items-baseline justify-between">
            <span className="label-caps">Final scores</span>
            <span className="font-mono text-xs font-bold text-holo" data-testid="my-rank">
              YOU ARE #{mineAt + 1}
            </span>
          </div>
          <ol className="flex flex-col gap-1.5" data-testid="scores">
            {ranks.map((r, i) => (
              <li key={r.player.id} className={cx('flex items-center gap-2 rounded-control px-1.5 py-0.5', r.player.id === self.id && 'bg-holo-soft')}>
                <span data-num className="w-3 font-mono text-xs text-ink-3">
                  {i + 1}
                </span>
                <PlayerMark slot={r.slot} size={16} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {r.player.name}
                  {r.player.id === self.id && ' (you)'}
                </span>
                <span data-num className="font-mono text-sm font-bold">
                  {fmt(r.value)}
                </span>
              </li>
            ))}
          </ol>
        </>
      }
      footer={
        <Button size="md" variant="outline" className="w-full" data-testid="leave" onClick={() => client.leave()}>
          Leave the table
        </Button>
      }
    >
      <div className="grid h-full grid-cols-[5fr_6fr] gap-2.5">
        <div className="flex min-h-0 flex-col gap-2.5">
          <div
            className={cx('flex flex-1 flex-col items-center justify-center gap-1 rounded-panel border-2 p-3 text-center', won ? 'border-holo bg-holo-soft shadow-glow' : 'border-holo-line bg-panel')}
            data-testid="winner"
          >
            <span className="label-caps">{won ? 'You win the colony!' : 'The colony goes to'}</span>
            {winner && <PlayerMark slot={winner.slot} size={44} />}
            <span className="font-display text-xl font-semibold leading-tight">{won ? 'You' : winner?.player.name}</span>
            <span data-num className="font-mono text-sm text-ink-2">
              {fmt(winner?.value ?? 0)} points
            </span>
          </div>
          <div className={cx('flex flex-col gap-1.5 rounded-panel border p-2.5', v.failed ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel')} data-testid="verdict">
            <span className={cx('font-display text-base font-semibold', v.failed ? 'text-alert-ink' : 'text-ok')}>{v.title}</span>
            <AirGauge level={view.air.level} band={view.air.band} />
            <span className="text-xs leading-snug text-ink-2">{v.line}</span>
          </div>
        </div>

        <Panel title="Your score" aside={SPECIES_NAME[self.species].toUpperCase()} className="p-3">
          <table className="w-full text-sm" data-testid="breakdown">
            <tbody data-num className="font-mono">
              {p && (
                <>
                  <tr data-testid="part-money">
                    <td className="py-1 font-sans text-ink-2">Money</td>
                    <td className="py-1 text-right font-bold">{fmt(p.money)}</td>
                  </tr>
                  <tr className="border-t border-holo-faint" data-testid="part-goods">
                    <td className="py-1 font-sans text-ink-2">Goods at final prices</td>
                    <td className="py-1 text-right font-bold">{fmt(p.goods)}</td>
                  </tr>
                  <tr className="border-t border-holo-faint" data-testid="part-land">
                    <td className="py-1 font-sans text-ink-2">Land · {p.plots} plots</td>
                    <td className="py-1 text-right font-bold">{fmt(p.land)}</td>
                  </tr>
                  <tr className="border-t border-holo-faint" data-testid="part-mules">
                    <td className="py-1 font-sans text-ink-2">MULEs · {p.mules} working</td>
                    <td className="py-1 text-right font-bold">{fmt(p.muleValue)}</td>
                  </tr>
                  {p.cut > 0 && (
                    <tr className="border-t border-holo-faint text-alert" data-testid="part-collapse">
                      <td className="py-1 font-sans">Collapse · −{Math.round((1 - POLLUTION.collapseScore) * 100)}%</td>
                      <td className="py-1 text-right font-bold">−{fmt(p.cut)}</td>
                    </tr>
                  )}
                </>
              )}
              <tr className="border-t-2 border-holo-line text-base" data-testid="part-total">
                <td className="pt-1.5 font-sans font-semibold text-ink">Final score</td>
                <td className="pt-1.5 text-right font-bold text-holo">{fmt(mine?.score ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>
    </PhoneShell>
  );
}
