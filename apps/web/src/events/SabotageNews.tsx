import type { MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { sabotageNews } from './sabotage';

/**
 * The month's public sabotage, one line each, as a phone's month end shows them (S4-C17; PM ruling 8 Nov, Heiko's pick:
 * the TV counts them with its SABOTAGE ×N tag, every phone shows the lines). The words are sabotageNews's, read from
 * the public incidents only, so a line names a culprit only when the public incident does. Nothing in a month without.
 */
export function SabotageNews({ view, className }: { view: MuleView; className?: string }) {
  const lines = sabotageNews(view);
  if (lines.length === 0) return null;
  return (
    <div className={cx('flex flex-col gap-0.5', className)} data-testid="sabotage-news">
      {lines.map((l, i) => (
        <span key={i} className="text-[11px] leading-tight text-ink" data-testid="sabotage-line">
          {l}
        </span>
      ))}
    </div>
  );
}
