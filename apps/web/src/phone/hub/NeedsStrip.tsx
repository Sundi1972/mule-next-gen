import { cx, GOOD_NAME, GoodIcon } from '@mule/ui';
import { usePhoneGame } from '../game';
import { needRows, stripRows } from './needs';

/**
 * Under the roadmap: Food, Energy and Water you need this month against what you hold, red where you are short. A
 * tap opens the Colony tab, where the full list is.
 */
export function NeedsStrip({ onOpen }: { onOpen: (el: Element) => void }) {
  const { view, me } = usePhoneGame();
  const rows = stripRows(needRows(me.monthNeeds, me.stock, view.tiles.filter((t) => t.owner === me.id)));
  if (rows.length === 0) return null;
  const short = rows.filter((n) => n.short > 0);
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      className={cx(
        // The strip's height never follows its words: the map below takes what is left, and a taller strip shrinks every plot.
        // From 3xl it keeps to one line and its label gives way first; under it, it wraps between goods, never inside one,
        // and holds two lines' height.
        'relative flex shrink-0 items-center gap-x-2 gap-y-0.5 overflow-hidden whitespace-nowrap rounded-control border bg-panel px-2 py-1 text-left text-[11px] hover:border-holo @max-3xl/shell:box-content @max-3xl/shell:h-[calc(2lh+--spacing(0.5))] @max-3xl/shell:flex-wrap @min-[1100px]/shell:gap-x-4 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-2 @min-[1100px]/shell:text-base',
        short.length > 0 ? 'border-alert/60' : 'border-holo-line',
      )}
      aria-label={`This month you need: ${rows.map((n) => `${GOOD_NAME[n.good]}, ${n.have} of ${n.need}${n.short > 0 ? `, short ${n.short}` : ''}`).join('; ')}. Opens the Colony tab.`}
      data-testid="needs-strip"
    >
      <span className="min-w-0 truncate font-semibold text-ink-2">This month you need</span>
      {rows.map((n) => {
        const ok = n.short === 0;
        return (
          <span key={n.good} className={cx('flex shrink-0 items-center gap-1', ok ? 'text-ink' : 'font-semibold text-alert')} data-testid={`strip-${n.good}`}>
            <GoodIcon good={n.good} size={14} />
            {GOOD_NAME[n.good]}
            <span data-num className="font-mono font-bold">
              {n.have} of {n.need}
            </span>
            {ok ? <span className="text-ok">✓</span> : <span>short {n.short}</span>}
          </span>
        );
      })}
      <span aria-hidden className="ml-auto shrink-0 text-holo">
        ›
      </span>
    </button>
  );
}
