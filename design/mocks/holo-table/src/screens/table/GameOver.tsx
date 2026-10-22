import { AirGauge, Button, cx, Panel, PlayerMark, SPECIES_NAME } from '@mule/ui';
import { ME } from '../../data';
import { COLLAPSE_SHARE, END_AIR, fmt, ranking, subtotal } from './fixtures';
import { LandShell } from './LandShell';

/**
 * The end of the game. Your phone shows what made your score and what the colony's
 * air did to it; the big screen shows everyone's total, large. Goods are private
 * (the big-screen rule), so the breakdown stays on the phone.
 */

export interface EndState {
  /** You finished first. */
  won: boolean;
  /** The colony ended in Collapse: every score is cut by a fifth. */
  collapse: boolean;
}

/** The colony verdict, in one line everyone can repeat at the table. */
function verdict(collapse: boolean) {
  return collapse
    ? { title: 'The colony failed', line: 'The air ended in Collapse. The Federation cuts every score by a fifth.' }
    : { title: 'The colony passed', line: 'The air stayed out of Collapse. Every score counts in full.' };
}

export function PhoneGameOver({ won, collapse }: EndState) {
  const ranks = ranking(won, collapse);
  const winner = ranks[0]!;
  const mineAt = ranks.findIndex((r) => r.slot === ME);
  const mine = ranks[mineAt]!;
  const p = mine.parts;
  const before = subtotal(p);
  const cut = before - mine.score;
  const v = verdict(collapse);

  return (
    <LandShell
      month={12}
      phase="Game over"
      me={{ slot: ME, name: mine.name }}
      money={p.money}
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
              <li key={r.slot} className={cx('flex items-center gap-2 rounded-control px-1.5 py-0.5', r.slot === ME && 'bg-holo-soft')}>
                <span data-num className="w-3 font-mono text-xs text-ink-3">
                  {i + 1}
                </span>
                <PlayerMark slot={r.slot} size={16} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {r.name}
                  {r.slot === ME && ' (you)'}
                </span>
                <span data-num className="font-mono text-sm font-bold">
                  {fmt(r.score)}
                </span>
              </li>
            ))}
          </ol>
        </>
      }
      footer={
        <Button size="md" variant="outline" className="w-full" data-testid="leave">
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
            <PlayerMark slot={winner.slot} size={44} />
            <span className="font-display text-xl font-semibold leading-tight">{won ? 'You' : winner.name}</span>
            <span data-num className="font-mono text-sm text-ink-2">
              {fmt(winner.score)} points
            </span>
          </div>
          <div className={cx('flex flex-col gap-1.5 rounded-panel border p-2.5', collapse ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel')} data-testid="verdict">
            <span className={cx('font-display text-base font-semibold', collapse ? 'text-alert-ink' : 'text-ok')}>{v.title}</span>
            <AirGauge level={collapse ? END_AIR.collapse : END_AIR.ok} />
            <span className="text-xs leading-snug text-ink-2">{v.line}</span>
          </div>
        </div>

        <Panel title="Your score" aside={SPECIES_NAME[mine.species].toUpperCase()} className="p-3">
          <table className="w-full text-sm" data-testid="breakdown">
            <tbody data-num className="font-mono">
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
              {collapse && (
                <tr className="border-t border-holo-faint text-alert" data-testid="part-collapse">
                  <td className="py-1 font-sans">Collapse · −{Math.round(COLLAPSE_SHARE * 100)}%</td>
                  <td className="py-1 text-right font-bold">−{fmt(cut)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-holo-line text-base" data-testid="part-total">
                <td className="pt-1.5 font-sans font-semibold text-ink">Final score</td>
                <td className="pt-1.5 text-right font-bold text-holo">{fmt(before - cut)}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>
    </LandShell>
  );
}

/** The big screen at the end: everyone's total, readable from across the room. */
export function TvGameOver({ collapse }: { collapse: boolean }) {
  const ranks = ranking(false, collapse);
  const winner = ranks[0]!;
  const v = verdict(collapse);
  return (
    <div className="flex h-full flex-col gap-6 bg-table p-10 text-ink">
      <header className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="label-caps text-base!">Month 12 of 12</span>
          <h1 className="font-display text-5xl font-semibold">Game over</h1>
        </div>
        <AirGauge level={collapse ? END_AIR.collapse : END_AIR.ok} tv />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[2fr_3fr] gap-8">
        <div className="flex flex-col items-center justify-center gap-3 rounded-panel border-2 border-holo bg-holo-soft p-6 text-center shadow-glow" data-testid="tv-winner">
          <span className="label-caps text-lg!">The colony goes to</span>
          <PlayerMark slot={winner.slot} size={140} />
          <span className="font-display text-6xl font-semibold">{winner.name}</span>
          <span data-num className="font-mono text-3xl text-ink-2">
            {fmt(winner.score)}
          </span>
        </div>

        <ol className="flex flex-col justify-center gap-3" data-testid="tv-scores">
          {ranks.map((r, i) => (
            <li key={r.slot} className={cx('flex items-center gap-5 rounded-panel px-5 py-2', i === 0 ? 'bg-holo-soft' : 'bg-panel')}>
              <span data-num className="w-8 font-mono text-3xl text-ink-3">
                {i + 1}
              </span>
              <PlayerMark slot={r.slot} size={44} />
              <span className="flex-1 font-display text-4xl font-semibold">{r.name}</span>
              <span data-num className="font-mono text-4xl font-bold">
                {fmt(r.score)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className={cx('flex items-center gap-4 rounded-panel border-2 px-6 py-4', collapse ? 'border-alert bg-alert-bg' : 'border-ok/40 bg-ok/5')} data-testid="tv-verdict">
        <span className={cx('font-display text-3xl font-semibold', collapse ? 'text-alert-ink' : 'text-ok')}>{v.title}</span>
        <span className="text-2xl text-ink-2">{v.line}</span>
      </div>
    </div>
  );
}
