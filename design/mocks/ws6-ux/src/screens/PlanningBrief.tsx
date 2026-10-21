import type { Good } from '@mule/engine';
import { Button, cx, GOOD_NAME, GoodIcon, HoloMap, TERRAIN_NAME, type MapTile } from '@mule/ui';
import { useState } from 'react';
import { mapTiles, plotName, TERRAIN_ODDS, tileAt } from '../../../../../apps/web/src/game/derive';
import { MapFit } from '../../../../../apps/web/src/phone/Shell';
import { H, MARKET, ME, VIEW, W } from '../fixture';
import { GameShell, type Now } from '../proposed/GameShell';

/**
 * Responsive redesign: planning as a briefing (Heiko 2026-10-22: "not good from
 * a UX perspective"; stock, market and news dumped in boxes, "no sense of what
 * to do or why").
 *
 * The stage is the colony map, the thing you plan about; today planning does
 * not show it at all. The geo drone and selling a plot are modes of that map,
 * not separate tabs. The rail opens with Now (what this phase is for and what
 * comes next), then "This month": each good you need against what you hold,
 * as a bar that says SHORT or OK, so the question "what should I go for?" is
 * answered before the land grant. The market sits under the map on a laptop
 * (one row of nine) and behind a "Market" tab on a phone; news and chat share
 * the rail.
 *
 * Graft target: apps/web/src/phone/Planning.tsx (Colony becomes the map + this rail).
 */

type Mode = 'look' | 'drone';
type PhoneTab = 'map' | 'market' | 'talk';

/** This month's needs (fixture), as the engine's monthNeeds counts them: upkeep for Food and Water; Energy 1 per farm or well, 2 per mine. */
const NEEDS: { good: Good; have: number; need: number; why: string }[] = [
  { good: 'food', have: ME.stock.food, need: ME.needs.food, why: 'upkeep' },
  { good: 'water', have: ME.stock.water, need: ME.needs.water, why: 'upkeep' },
  { good: 'energy', have: ME.stock.energy, need: 4, why: '3 farms and a well' },
];

export function PlanningBrief({ mode: start = 'look' }: { mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(start);
  const [tab, setTab] = useState<PhoneTab>('map');
  const [picked, setPicked] = useState<{ x: number; y: number }[]>(start === 'drone' ? [{ x: 9, y: 4 }] : []);
  const short = NEEDS.filter((n) => n.have < n.need);
  const now: Now =
    mode === 'drone'
      ? { title: 'Scout free land with the geo drone', detail: 'Tap up to 2 free plots. The drone reads what is under them for 40 cr; only you see the result, in time for the land grant.' }
      : {
          title: 'Plan your month, then press Ready',
          detail: (
            <>
              Next is the <strong className="text-ink">land grant</strong>: one free plot each. {short.length > 0 ? `You're short of ${short.map((n) => GOOD_NAME[n.good]).join(' and ')}: a plot for it, or buy it at the auction.` : 'You have what you need this month.'}
            </>
          ),
        };
  const tiles: MapTile[] = mapTiles(VIEW).map((t) => (picked.some((p) => p.x === t.x && p.y === t.y) ? { ...t, flag: 'survey' } : t));
  const last = picked.at(-1);
  const lastTile = last ? tileAt(VIEW, last.x, last.y) : undefined;
  const onTile = (t: MapTile) => {
    if (mode !== 'drone' || t.owner !== null || t.terrain === 'store') return;
    setPicked((p) => (p.some((q) => q.x === t.x && q.y === t.y) ? p.filter((q) => q.x !== t.x || q.y !== t.y) : [...p, { x: t.x, y: t.y }].slice(-2)));
  };

  return (
    <GameShell
      phase="Planning"
      seconds={38}
      now={now}
      rail={
        <>
          <ThisMonth />
          {mode === 'drone' && lastTile && (
            <div className="flex flex-col gap-0.5 rounded-control border border-holo-line bg-panel p-2 @min-[1100px]:p-3" data-testid="drone-pick">
              <span className="label-caps flex justify-between">
                Plot {plotName(lastTile.x, lastTile.y)} <span className="text-holo">PICKED</span>
              </span>
              <span className="font-display text-lg font-semibold">{TERRAIN_NAME[lastTile.terrain]}</span>
              <span className="text-xs text-ink-2 @min-[1100px]:text-sm">{TERRAIN_ODDS[lastTile.terrain]}</span>
            </div>
          )}
          <section className="hidden min-h-[220px] flex-col gap-2 @min-[1100px]:flex" data-testid="talk">
            <News />
            <div className="flex min-h-[180px] flex-col">
              <Chat />
            </div>
          </section>
        </>
      }
      footer={
        <>
          {mode === 'drone' && (
            <Button size="md" className="w-full" disabled={picked.length === 0}>
              {picked.length === 0 ? 'Pick a free plot' : `Send the drone · 40 cr`}
            </Button>
          )}
          <Button size="lg" className="w-full @min-[1100px]:h-14 @min-[1100px]:text-lg" data-testid="ready">
            I'm ready
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]:gap-4">
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Show" className="flex gap-1 rounded-control border border-holo-line bg-void p-1 @min-[1100px]:hidden">
            {(['map', 'market', 'talk'] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('h-7 rounded-[8px] px-2.5 text-[12px] font-semibold', tab === t ? 'bg-holo-soft text-holo' : 'text-ink-2')}>
                {t === 'map' ? 'Map' : t === 'market' ? 'Market' : 'News & chat'}
              </button>
            ))}
          </div>
          <span className="label-caps hidden text-sm! @min-[1100px]:inline">The colony</span>
          <div role="group" aria-label="Map mode" className={cx('ml-auto flex gap-1 rounded-control border border-holo-line bg-void p-1', tab !== 'map' && 'max-[0px]:hidden')}>
            {(['look', 'drone'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cx('h-7 rounded-[8px] px-2.5 text-[12px] font-semibold @min-[1100px]:h-9 @min-[1100px]:px-4 @min-[1100px]:text-sm', mode === m ? 'bg-holo-soft text-holo' : 'text-ink-2')}
                data-testid={`mode-${m}`}
              >
                {m === 'look' ? 'Look' : 'Geo drone · 40 cr'}
              </button>
            ))}
          </div>
        </div>
        <div className={cx('min-h-0 flex-1 flex-col', tab === 'map' ? 'flex' : 'hidden @min-[1100px]:flex')} data-testid="plan-map">
          <MapFit width={W} height={H}>
            <HoloMap width={W} height={H} tiles={tiles} onTile={onTile} selected={last ?? null} focusSlot={0} />
          </MapFit>
        </div>
        <div className={cx(tab === 'market' ? 'block' : 'hidden @min-[1100px]:block')}>
          <MarketStrip />
        </div>
        <div className={cx('min-h-0 flex-1 flex-col gap-2 @min-[1100px]:hidden', tab === 'talk' ? 'flex' : 'hidden')}>
          <News />
          <Chat />
        </div>
      </div>
    </GameShell>
  );
}

/** Each good you need this month against what you hold: SHORT or OK, with the reason. */
function ThisMonth() {
  return (
    <section className="flex flex-col gap-1.5 @min-[1100px]:gap-2.5" data-testid="this-month">
      <span className="label-caps @min-[1100px]:text-xs!">This month you need</span>
      {NEEDS.map((n) => {
        const ok = n.have >= n.need;
        return (
          <div key={n.good} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5" data-testid={`need-${n.good}`}>
            <GoodIcon good={n.good} size={16} />
            <span className="text-sm font-semibold @min-[1100px]:text-base">
              {GOOD_NAME[n.good]} <span className="font-normal text-ink-3 text-xs @min-[1100px]:text-sm">· {n.why}</span>
            </span>
            <span data-num className={cx('font-mono text-xs font-bold @min-[1100px]:text-sm', ok ? 'text-ok' : 'text-alert')}>
              {ok ? 'OK' : `SHORT ${n.need - n.have}`}
            </span>
            <div className="relative col-span-3 h-2 overflow-hidden rounded-full bg-raised">
              <div className={cx('absolute inset-y-0 left-0 rounded-full', ok ? 'bg-ok' : 'bg-alert')} style={{ width: `${Math.min(1, n.have / Math.max(n.need, n.have)) * 100}%` }} />
              <div className="absolute inset-y-0 border-l-2 border-ink" style={{ left: `${(n.need / Math.max(n.need, n.have)) * 100}%` }} title={`need ${n.need}`} />
            </div>
            <span className="col-span-3 font-mono text-[10px] text-ink-3 @min-[1100px]:text-xs">
              HAVE {n.have} · NEED {n.need}
            </span>
          </div>
        );
      })}
    </section>
  );
}

/** The store's prices and stock in one row of goods: what buying or selling would cost. */
function MarketStrip() {
  return (
    <section className="flex flex-col gap-1" data-testid="market-strip">
      <span className="label-caps flex justify-between @min-[1100px]:text-xs!">
        Store prices <span>MULE {VIEW.mulePrice} cr · {VIEW.storeMules} left · export ship in month {VIEW.ship.arrives}</span>
      </span>
      <div className="grid grid-cols-3 gap-1 @min-[1100px]:grid-cols-5 @min-[1100px]:gap-2">
        {MARKET.map((r) => (
          <div key={r.good} className="flex items-center gap-2 rounded-control border border-holo-faint bg-panel px-2 py-1 @min-[1100px]:px-3 @min-[1100px]:py-2">
            <GoodIcon good={r.good} size={18} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-semibold @min-[1100px]:text-sm">{GOOD_NAME[r.good]}</span>
              <span data-num className="font-mono text-sm font-bold @min-[1100px]:text-lg">
                {r.storeSells ?? '—'} <span className="text-[10px] font-normal text-ink-3">cr</span>
              </span>
            </span>
            <span className={cx('ml-auto font-mono text-[10px] @min-[1100px]:text-xs', r.storeStock === 0 ? 'text-alert' : 'text-ink-3')}>{r.storeStock === 0 ? 'SOLD OUT' : `${r.storeStock} left`}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Table talk (fixture). The app's Chat panel keeps its behaviour; this stands in for it in the mock. */
function Chat() {
  const lines = [
    { who: 'Ossa', text: 'Anyone need Water? Cheap today.' },
    { who: 'Kai', text: 'Smithore is going to spike. Just saying.' },
  ];
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-1.5" data-testid="chat">
      <span className="label-caps @min-[1100px]:text-xs!">Chat</span>
      <ul className="flex flex-col gap-1 text-sm">
        {lines.map((l) => (
          <li key={l.text}>
            <strong>{l.who}:</strong> {l.text}
          </li>
        ))}
      </ul>
      <input className="mt-auto h-9 rounded-control border border-holo-line bg-panel px-2 text-sm" placeholder="Say something to everyone" />
    </section>
  );
}

function News() {
  return (
    <section className="flex flex-col gap-1" data-testid="news">
      <span className="label-caps @min-[1100px]:text-xs!">News</span>
      <ul className="flex flex-col gap-1 text-sm">
        {[...VIEW.news, 'A Smithore shortage is expected: the store has only 2 left.'].map((n) => (
          <li key={n} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-holo" />
            {n}
          </li>
        ))}
      </ul>
    </section>
  );
}
