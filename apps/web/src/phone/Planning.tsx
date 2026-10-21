import { DEVELOPMENT } from '@mule/engine';
import { Button, cx, HoloMap, TERRAIN_NAME, type MapTile } from '@mule/ui';
import { useState } from 'react';
import { mapTiles, PHASE_NAME, plotName, secondsUntil, TERRAIN_ODDS, tileAt } from '../game/derive';
import { useClient, useClientState, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { Chat, MarketCells, NewsPanel, ShipLine, StockPanel } from './parts';
import { SellMap, SellRail, useSellForm } from './Sell';
import { MapFit, PhoneShell } from './Shell';

type Tab = 'colony' | 'drone' | 'sell' | 'chat';
type Plot = { x: number; y: number };

/** Planning: everyone at once. Look at the colony, send a geo drone, sell a lot, talk, then press ready. */
export function Planning() {
  const client = useClient();
  const { view, me, self } = usePhoneGame();
  const { chat } = useClientState();
  const now = useServerNow();
  const [tab, setTab] = useState<Tab>('colony');
  const [seenChat, setSeenChat] = useState(chat.length);
  const [picked, setPicked] = useState<Plot[]>([]);
  const sell = useSellForm();
  const unread = tab === 'chat' ? 0 : chat.length - seenChat;
  const waiting = view.players.filter((p) => !p.isAi && !p.ready && p.id !== self.id).length;
  const ordered = me.droneOrder.length > 0;
  const chosen = ordered ? me.droneOrder : picked;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'colony', label: 'Colony' },
    { id: 'drone', label: 'Geo drone' },
    { id: 'sell', label: 'Sell' },
    { id: 'chat', label: 'Chat', ...(unread > 0 ? { badge: unread } : {}) },
  ];

  return (
    <PhoneShell
      phase={PHASE_NAME.planning}
      seconds={secondsUntil(view.phaseEndsAt, now)}
      fill={tab !== 'colony'}
      rail={
        <>
          <div role="tablist" aria-label="Planning" className="grid shrink-0 grid-cols-[0.9fr_1.15fr_0.75fr_0.8fr] gap-1 rounded-control border border-holo-line bg-void p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                data-testid={`tab-${t.label.toLowerCase().replace(' ', '-')}`}
                onClick={() => {
                  setTab(t.id);
                  if (t.id === 'chat') setSeenChat(chat.length);
                }}
                className={cx('relative h-9 whitespace-nowrap rounded-[8px] text-[12px] font-semibold', tab === t.id ? 'bg-holo-soft text-holo' : 'text-ink-2')}
              >
                {t.label}
                {t.badge && <span className="absolute -right-1 -top-1 size-4 rounded-full bg-holo text-center font-mono text-[10px] font-bold leading-4 text-on-holo">{t.badge}</span>}
              </button>
            ))}
          </div>
          {tab === 'drone' && <DroneRail chosen={chosen} ordered={ordered} />}
          {tab === 'sell' && <SellRail sell={sell} />}
        </>
      }
      footer={
        <>
          {tab === 'drone' && !ordered && (
            <Button size="md" className="w-full px-2" disabled={picked.length === 0 || self.money < DEVELOPMENT.droneFee} onClick={() => client.intent({ type: 'drone', plots: picked })}>
              {picked.length === 0 ? 'Pick a free plot' : `Send the drone · ${DEVELOPMENT.droneFee} cr`}
            </Button>
          )}
          {tab === 'sell' && sell.tile && (
            <Button size="md" className="w-full px-2" disabled={!!sell.blocked} onClick={sell.list} data-testid="list">
              {sell.blocked ?? `Put it up for auction · ≥${sell.minimum}`}
            </Button>
          )}
          <Button size="lg" variant={self.ready ? 'outline' : 'holo'} className="w-full px-2" disabled={self.ready} onClick={() => client.intent({ type: 'ready' })} data-testid="ready">
            {self.ready ? `Ready · waiting for ${waiting} other${waiting === 1 ? '' : 's'}` : "I'm ready"}
          </Button>
        </>
      }
    >
      {tab === 'colony' && <Colony />}
      {tab === 'drone' && <DroneMap chosen={chosen} ordered={ordered} setPicked={setPicked} />}
      {tab === 'sell' && <SellMap sell={sell} />}
      {tab === 'chat' && <Chat />}
    </PhoneShell>
  );
}

/** Two columns: your stock, the ship and the news on the left, the market on the right. */
function Colony() {
  const { view } = usePhoneGame();
  return (
    <div className="grid grid-cols-2 items-start gap-2.5">
      <div className="flex flex-col gap-2.5">
        <StockPanel />
        <ShipLine view={view} />
        <NewsPanel news={view.news} />
      </div>
      <section className="flex flex-col gap-1.5">
        <h2 className="label-caps flex justify-between gap-2">
          Market <span>MULE {view.mulePrice} cr · {view.storeMules} left</span>
        </h2>
        <MarketCells rows={view.market} />
      </section>
    </div>
  );
}

/** Pick one or two free plots for the geo drone. Results arrive, only for you, when the land grant starts. */
function DroneMap({ chosen, ordered, setPicked }: { chosen: Plot[]; ordered: boolean; setPicked(f: (p: Plot[]) => Plot[]): void }) {
  const { view } = usePhoneGame();
  const tiles: MapTile[] = mapTiles(view).map((t) => (chosen.some((p) => p.x === t.x && p.y === t.y) ? { ...t, flag: 'survey' } : t));
  const toggle = (t: MapTile) => {
    if (ordered || t.owner !== null || t.terrain === 'store') return;
    setPicked((p) => (p.some((q) => q.x === t.x && q.y === t.y) ? p.filter((q) => q.x !== t.x || q.y !== t.y) : [...p, { x: t.x, y: t.y }].slice(-DEVELOPMENT.dronePlots)));
  };
  return (
    <MapFit width={view.width} height={view.height}>
      <HoloMap width={view.width} height={view.height} tiles={tiles} onTile={toggle} selected={chosen.at(-1) ?? null} />
    </MapFit>
  );
}

function DroneRail({ chosen, ordered }: { chosen: Plot[]; ordered: boolean }) {
  const { view } = usePhoneGame();
  const last = chosen.at(-1);
  const lastTile = last ? tileAt(view, last.x, last.y) : undefined;
  return (
    <>
      <p className="text-xs text-ink-2">
        {ordered
          ? 'Your drone is on its way. Only you will see what it finds, in time for the land grant.'
          : `Tap up to ${DEVELOPMENT.dronePlots} free plots. The drone reads their ground from orbit for ${DEVELOPMENT.droneFee} cr, before anyone claims them.`}
      </p>
      {lastTile && (
        <div className="flex flex-col gap-0.5 border-t border-holo-faint pt-2">
          <span className="label-caps flex justify-between">
            Plot {plotName(lastTile.x, lastTile.y)} <span className="text-holo">{ordered ? 'ON ITS WAY' : 'PICKED'}</span>
          </span>
          <span className="font-display text-lg font-semibold">{TERRAIN_NAME[lastTile.terrain]}</span>
          <span className="text-xs text-ink-2">{TERRAIN_ODDS[lastTile.terrain]}</span>
        </div>
      )}
    </>
  );
}
