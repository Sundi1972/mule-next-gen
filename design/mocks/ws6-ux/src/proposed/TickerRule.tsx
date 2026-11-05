import { cx } from '@mule/ui';
import { useSyncExternalStore } from 'react';

/**
 * PROPOSAL for Heiko (WS6, 2026-10-29): ONE rail-chat rule instead of a fold per screen.
 *
 *   Below 1100 px (a phone, the shell's narrow layout) the table chat follows the rail's own content instead of
 *   sitting above it: the header keeps the phase, you and your money; the seat row and the ticker come after the
 *   screen's rail, in the same scroll.
 *
 * Every line still pops as a bubble, at the speaker or, when the screen draws no creature for them, left of the guide
 * at the top of the rail (FallbackBubble), so nothing said is missed while the ticker is out of view; the whole chat is
 * on the Talk desk and the TV. From 1100 px (a laptop) nothing changes. It replaces both Governor-desk folds (the
 * ticker's one line, the footer's names), and it is the only rule of the ones measured that clears all four rails
 * (measure-rail.mjs, part B): the chat block is 81 px and the walk at 667 is 72.5 px short, game over's standings 82.
 *
 * "one" is the one-line ticker the brief suggested first (below 1100 px only the newest line): measured, it buys
 * 18.5 px, which fixes the month end's Worth at 844 and nothing else, so it is on the switch only to compare.
 *
 * In the mock it is a switch on each affected route (?ticker=today|one|under, kept in the URL so a link opens either).
 * Default today, so every other route draws exactly as approved.
 * GRAFT TARGET, once ruled: apps/web/src/phone/Shell.tsx (where TableChat renders: the header above 1100 px, the rail's
 * foot below) and apps/web/src/chat/Chat.tsx (the fallback bubble leaves the seat row for the guide's top); the
 * Governor desk's folds (chatLines: 1, the footer's names) drop.
 */

export type TickerRule = 'today' | 'one' | 'under';

const read = (): TickerRule => {
  const v = new URLSearchParams(window.location.search).get('ticker');
  return v === 'one' || v === 'under' ? v : 'today';
};
let rule: TickerRule = read();
const subs = new Set<() => void>();

export function setTickerRule(next: TickerRule) {
  rule = next;
  const url = new URL(window.location.href);
  url.searchParams.set('ticker', next);
  window.history.replaceState(null, '', url);
  for (const s of subs) s();
}

/** The switch's position: 'under' is the proposal, 'today' the approved rails, 'one' the alternative measured. */
export function useTickerRule(): TickerRule {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => rule,
  );
}

/** The review page's switch: today against the proposal. Review furniture, never grafted. */
export function TickerRuleSwitch() {
  const now = useTickerRule();
  const options: { id: TickerRule; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'one', label: 'One-line ticker' },
    { id: 'under', label: 'Chat under the rail (proposed)' },
  ];
  return (
    <div className="flex max-w-[900px] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-panel border border-warn bg-panel px-3 py-2" data-testid="ticker-rule">
      <span className="label-caps text-warn!">For Heiko · rail chat</span>
      <div className="flex rounded-control border border-holo-line" role="radiogroup" aria-label="Rail chat rule">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={now === o.id}
            onClick={() => setTickerRule(o.id)}
            className={cx('h-8 px-3 font-display text-sm font-semibold first:rounded-l-control last:rounded-r-control', now === o.id ? 'bg-holo text-on-holo' : 'text-holo hover:bg-holo-soft')}
            data-testid={`ticker-rule-${o.id}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="min-w-0 flex-1 text-sm text-ink-2">
        {now === 'one'
          ? 'Measured, not enough: below 1100 px the ticker keeps its newest line, 18.5 px back; the key line still ends under the footer on three of the four screens.'
          : 'One rule for every phone: below 1100 px the table chat follows the rail’s own content instead of sitting above it. Every line still pops as a bubble; the whole chat is on the Talk desk and the TV.'}
      </span>
    </div>
  );
}
