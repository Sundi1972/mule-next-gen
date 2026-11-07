import type { MuleView } from '@mule/protocol';
import { AirGauge, cx, Timer } from '@mule/ui';
import type { ReactNode } from 'react';
import { TvTicker } from '../../../../apps/web/src/chat/Chat';
import type { GaugeLanding } from '../../../../apps/web/src/components/Colony';
import { StrikeBadge } from '../../../../apps/web/src/components/Strike';
import { ThemeToggle } from '../../../../apps/web/src/components/ThemeToggle';
import { healthOf } from './fixture';
import { ColonyGauges, type HealthVariant } from './gauges';

/**
 * COPY: apps/web/src/table/TableApp.tsx:145-199 `TvHeader` at trunk 0ece94ba, verbatim but for the gauges, marked
 * EXTEND: they are this mock's ColonyGauges copy with health, in `variant`, and the beside box's width is `beside`
 * (trunk's w-[760px] by default) so A can be measured widened. Graft target: TableApp.tsx `TvHeader` (WS4's).
 */
export function TvHeaderHealth({
  game,
  title,
  icon,
  seconds,
  extra,
  ready,
  gauges = true,
  landing,
  chatLines,
  variant,
  beside = 'w-[760px]',
}: {
  game: MuleView;
  title: string;
  icon?: ReactNode;
  seconds?: number | undefined;
  extra?: ReactNode;
  ready?: ReactNode;
  gauges?: boolean | 'none' | 'beside';
  landing?: GaugeLanding | undefined;
  chatLines?: number;
  variant: HealthVariant;
  beside?: 'w-[760px]' | 'w-[950px]';
}) {
  const crowded = seconds !== undefined || ready !== undefined || !!game.colony?.strike;
  // EXTEND (A, Heiko 7 Nov): with health the gauges always take a row of their own: five cells beside the title cut text.
  const ownRow = !!game.colony && (gauges === true || gauges === 'beside') && (crowded || (variant === 'A' && healthOf(game.colony) !== null));
  // EXTEND: the copy's ColonyGauges with health and its variant; the beside width a prop.
  const colony = game.colony && (gauges === true || gauges === 'beside') ? <ColonyGauges colony={game.colony} size="tv" className={ownRow ? 'w-full' : beside} landing={landing} health={healthOf(game.colony)} variant={variant} /> : null;
  // With a ready chip the title keeps one line and the chip its size; without one the header is as it always was: the
  // gauges give way to a long title ("Election day · the result").
  const fixed = ready !== undefined;
  return (
    <>
      <header className="flex items-end justify-between gap-6" data-testid="tv-header">
        <div className={cx('flex flex-col gap-1', fixed && 'min-w-0')} data-testid="tv-title-box">
          <span className="flex items-center gap-3">
            <span className="label-caps whitespace-nowrap text-base!">
              Month {game.month} / {game.maxMonths}
            </span>
            {gauges && <StrikeBadge strike={game.colony?.strike} />}
          </span>
          <h1 className={cx('flex items-center gap-4 font-display text-5xl font-semibold leading-none', fixed && 'whitespace-nowrap')} data-testid="tv-phase">
            {icon}
            {title}
          </h1>
        </div>
        <div className={cx('flex items-center gap-4', fixed && 'shrink-0')} data-testid="tv-header-right">
          {extra}
          <ThemeToggle />
          {ownRow || gauges === 'none' ? null : (colony ?? <AirGauge level={game.air.level} band={game.air.band} tv />)}
          {seconds !== undefined && <Timer seconds={seconds} className="h-14! px-5! text-3xl!" />}
          {ready}
        </div>
      </header>
      {ownRow && colony}
      {chatLines === 0 ? null : <TvTicker {...(chatLines === undefined ? {} : { most: chatLines })} />}
    </>
  );
}
