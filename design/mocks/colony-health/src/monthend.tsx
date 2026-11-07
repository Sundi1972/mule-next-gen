import { GAME, POLITICS } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { BuildSite, MonthScoreColumn } from '../../../../apps/web/src/components/Colony';
import { CollapseBanner, LeagueTable } from '../../../../apps/web/src/components/MonthEnd';
import { inCollapse } from '../../../../apps/web/src/game/month-end';
import { ReadyCount } from '../../../../apps/web/src/phone/hub/ReadyBar';
import { healthOf } from './fixture';
import { ColonyGauges } from './gauges';
import { TvHeaderHealth } from './header';
import { ColonyPanel } from './panel';

/**
 * COPY: apps/web/src/table/TableApp.tsx:774-807 `TvMonthEnd` at trunk 0ece94ba, verbatim but for two parts, marked
 * EXTEND: the gauges are this mock's ColonyGauges with health in A (Health on a third row of its own, across both
 * columns), and `FitHeight` (not exported) is a plain box marked data-fit whose fill the page measures instead of
 * scaling: the scale FitHeight would take is about the box's height over the content's (TV-FIT's floor is 0.7). The
 * built screen's real scale is WS4's TV-FIT e2e to measure. Graft target: TableApp.tsx `TvMonthEnd` (WS4's).
 */
/** Where the month end's five gauges sit: `grid` 3 + 2 at the top of the colony column (chosen: as tall as today's two
 * by two), `third` two by two with Health alone on a third row (as the card showed it), `across` one row over both columns. */
export type MonthEndLayout = 'grid' | 'third' | 'across';

export function TvMonthEndHealth({ game, today = false, layout = 'grid' }: { game: MuleView; today?: boolean; layout?: MonthEndLayout }) {
  const across = layout === 'across' && !today;
  // EXTEND: the gauges with health in A, in `layout`; `today` draws trunk's four, two by two.
  const gauges = (wide: boolean) =>
    game.colony ? <ColonyGauges colony={game.colony} size="tv" className={wide ? 'w-full' : today || layout === 'third' ? 'grid-cols-2!' : 'grid-cols-3!'} health={healthOf(game.colony)} variant={today ? 'today' : 'A'} /> : null;
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-3 bg-table px-10 py-8 text-ink" data-phase={game.phase} data-testid="tv-monthend">
      <div className="flex flex-col gap-3">
        <TvHeaderHealth game={game} title="End of the month" ready={<ReadyCount players={game.players} tv />} gauges={game.colony ? 'none' : true} chatLines={1} variant={today ? 'today' : 'A'} />
      </div>
      {inCollapse(game) && <CollapseBanner density="tv" donations={!!game.colony} />}
      {across && gauges(true)}
      {/* EXTEND: FitHeight's box, unscaled, so the page can measure how far the content runs past it. */}
      <div className="flex min-h-0 flex-1 flex-col" data-fit data-testid="fit-box">
        {game.colony ? (
          <div className="grid flex-1 grid-cols-[minmax(0,6fr)_minmax(0,6fr)] gap-6" data-testid="fit-content">
            <MonthScoreColumn view={game}>
              <LeagueTable view={game} density="tv" />
            </MonthScoreColumn>
            <div className="flex flex-col gap-4" data-testid="monthend-right">
              {/* EXTEND: health in A; `today` draws trunk's four. */}
              {!across && gauges(false)}
              <ColonyPanel view={game} density="tv" />
              <BuildSite colony={game.colony} players={game.players} size="tv" />
            </div>
          </div>
        ) : null}
      </div>
      <p className="truncate text-base leading-snug text-ink-2" data-testid="worth-rule">
        Worth: cash + goods at the store’s price + land at {GAME.plotScore} cr a plot + MULEs at {game.mulePrice} cr + {POLITICS.termScore} cr a term in office{game.colony ? ' + donations' : ''}. Your own lines are on your phone.
      </p>
    </div>
  );
}
