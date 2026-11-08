import { cx } from '@mule/ui';
import { OnlyYou } from '../../../../../apps/web/src/phone/hub/OnlyYou';
import { ordersOf, type World } from '../fixture';
import { fineNews, monthEndNews, ownMonthEnd } from '../sheriff-words';

/**
 * The Sheriff path's lines on the phone's month end (the spec's month-end row; #750's sabotageNews renders the news in
 * the build's ColonyPanel, WS4's named edit): everyone's news for this month's sabotage and fines, then this phone's own
 * lines, "Only you": the crew it paid, a fine it paid, restitution it got. Nothing when the month had none.
 */
export function SabotageMonthEnd({ world, seat }: { world: World; seat: string }) {
  const orders = ordersOf(world);
  const news = [
    ...orders.filter((o) => o.month === world.month && o.outcome !== 'pending').map((o) => ({ id: `news-${o.id}`, line: monthEndNews(o) })),
    ...orders.filter((o) => o.fine && o.finedMonth === world.month).map((o) => ({ id: `fine-news-${o.id}`, line: fineNews(o) })),
  ];
  const own = ownMonthEnd(orders, world.month, seat);
  if (news.length === 0 && own.length === 0) return null;
  return (
    <section className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel px-2.5 py-1.5" data-testid="phone-sabotage">
      <span className="label-caps text-[10px]!">Sabotage</span>
      {news.map((n) => (
        <p key={n.id} className="text-xs" data-testid={`phone-sabotage-${n.id}`}>
          {n.line}
        </p>
      ))}
      {own.map((l) => (
        <span key={l.id} className="flex items-center justify-between gap-2 border-t border-holo-faint pt-1 text-xs" data-testid={`phone-sabotage-${l.id}`}>
          <span className="flex items-center gap-1">
            {l.label} <OnlyYou text="" />
          </span>
          <span data-num className={cx('font-mono font-bold', l.tone === 'ok' ? 'text-ok' : 'text-alert')}>
            {l.amount}
          </span>
        </span>
      ))}
    </section>
  );
}
