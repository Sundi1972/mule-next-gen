import { cx, HoloMap, PlayerMark, Ticker } from '@mule/ui';
import { MAP_H, MAP_W, MARKET, NEWS, SEATS, TABLE_CHAT, TILES, seat } from '../../data';
import { useCountdown } from '../../proto';
import { TvHeader } from './TvHeader';

const READY = new Set([0, 1, 3, 5]);

const NEWS_TONE = { info: 'border-holo-line text-ink', warn: 'border-warn text-warn', alert: 'border-alert text-alert-ink' } as const;

export function TvPlanning() {
  const seconds = useCountdown(45);
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-6 bg-table p-10 text-ink">
      <TvHeader phase="Planning · council table" seconds={seconds} />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex w-[700px] shrink-0 flex-col gap-4">
          <HoloMap width={MAP_W} height={MAP_H} tiles={TILES} showOutput density="tv" hideGround />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {SEATS.map((s) => (
              <span key={s.slot} className={cx('flex items-center gap-2 font-display text-base font-semibold', !READY.has(s.slot) && 'opacity-45')}>
                <PlayerMark slot={s.slot} size={20} glow={READY.has(s.slot)} />
                {s.name}
                <span className="font-mono text-sm text-ink-3">{READY.has(s.slot) ? 'READY' : '…'}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Ticker items={MARKET.slice(0, 3)} size="lg" />
          <ul className="flex flex-col gap-2">
            {NEWS.map((n) => (
              <li key={n.text} className={cx('rounded-control border-l-4 bg-panel px-4 py-2.5 text-lg', NEWS_TONE[n.tone])}>
                {n.text}
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-3">
            {TABLE_CHAT.map((c) => (
              <li key={c.text} className="flex items-start gap-3">
                <PlayerMark slot={c.from} size={22} />
                <p className="text-lg leading-snug">
                  <span className="font-display font-semibold">{seat(c.from).name}</span>
                  {seat(c.from).ai && <span className="ml-1.5 font-mono text-xs text-ink-3">AI</span>}
                  <span className="text-ink-2"> {c.text}</span>
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center justify-between rounded-panel border border-holo-line bg-holo-soft px-4 py-3">
            <span className="font-display text-xl font-semibold">2 deals in talks</span>
            <span className="text-base text-ink-2">Terms stay on the phones</span>
          </div>
        </div>
      </div>
    </div>
  );
}
