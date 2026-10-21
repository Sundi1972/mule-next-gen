import { DEVELOPMENT } from '@mule/engine';
import { Button, cx, HoloMap, Panel, TERRAIN_NAME, type MapTile } from '@mule/ui';
import { useState } from 'react';
import { mapTiles, PHASE_NAME, plotName, secondsUntil, TERRAIN_ODDS, tileAt } from '../game/derive';
import { useClient, useClientState, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { Chat, MarketCells, NewsPanel, ShipLine, StockPanel } from './parts';
import { PhoneShell } from './Shell';

type Tab = 'colony' | 'drone' | 'chat';

/** Planning: everyone at once. Look at the colony, send a geo drone, talk, then press ready. */
export function Planning() {
  const client = useClient();
  const { view, self } = usePhoneGame();
  const { chat } = useClientState();
  const now = useServerNow();
  const [tab, setTab] = useState<Tab>('colony');
  const [seenChat, setSeenChat] = useState(chat.length);
  const unread = tab === 'chat' ? 0 : chat.length - seenChat;
  const waiting = view.players.filter((p) => !p.isAi && !p.ready && p.id !== self.id).length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'colony', label: 'Colony' },
    { id: 'drone', label: 'Geo drone' },
    { id: 'chat', label: 'Chat', ...(unread > 0 ? { badge: unread } : {}) },
  ];

  return (
    <PhoneShell
      phase={PHASE_NAME.planning}
      seconds={secondsUntil(view.phaseEndsAt, now)}
      footer={
        <Button size="lg" variant={self.ready ? 'outline' : 'holo'} className="w-full" disabled={self.ready} onClick={() => client.intent({ type: 'ready' })}>
          {self.ready ? `Ready · waiting for ${waiting} other${waiting === 1 ? '' : 's'}` : "I'm ready"}
        </Button>
      }
    >
      <div role="tablist" aria-label="Planning" className="mb-4 grid grid-cols-3 gap-1 rounded-control border border-holo-line bg-void p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              if (t.id === 'chat') setSeenChat(chat.length);
            }}
            className={cx('relative h-10 rounded-[8px] text-[13px] font-semibold', tab === t.id ? 'bg-holo-soft text-holo' : 'text-ink-2')}
          >
            {t.label}
            {t.badge && <span className="absolute right-1 top-1 size-4 rounded-full bg-holo font-mono text-[10px] font-bold leading-4 text-on-holo">{t.badge}</span>}
          </button>
        ))}
      </div>
      {tab === 'colony' && <Colony />}
      {tab === 'drone' && <Drone />}
      {tab === 'chat' && <Chat />}
    </PhoneShell>
  );
}

function Colony() {
  const { view } = usePhoneGame();
  return (
    <div className="flex flex-col gap-4">
      <StockPanel />
      <section className="flex flex-col gap-2">
        <h2 className="label-caps flex justify-between">
          Colony market <span>MULE {view.mulePrice} cr · {view.storeMules} left</span>
        </h2>
        <MarketCells rows={view.market} />
      </section>
      <ShipLine view={view} />
      <NewsPanel news={view.news} />
    </div>
  );
}

/** Pick one or two free plots for the geo drone. Results arrive, only for you, when the land grant starts. */
function Drone() {
  const client = useClient();
  const { view, me, self } = usePhoneGame();
  const [picked, setPicked] = useState<{ x: number; y: number }[]>([]);
  const ordered = me.droneOrder.length > 0;
  const chosen = ordered ? me.droneOrder : picked;
  const tiles: MapTile[] = mapTiles(view).map((t) => (chosen.some((p) => p.x === t.x && p.y === t.y) ? { ...t, flag: 'survey' } : t));
  const last = chosen.at(-1);
  const lastTile = last ? tileAt(view, last.x, last.y) : undefined;

  const toggle = (t: MapTile) => {
    if (ordered || t.owner !== null || t.terrain === 'store') return;
    setPicked((p) => (p.some((q) => q.x === t.x && q.y === t.y) ? p.filter((q) => q.x !== t.x || q.y !== t.y) : [...p, { x: t.x, y: t.y }].slice(-DEVELOPMENT.dronePlots)));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        {ordered
          ? 'Your drone is on its way. Only you will see what it finds, in time for the land grant.'
          : `Tap up to ${DEVELOPMENT.dronePlots} free plots. The drone reads their ground from orbit for ${DEVELOPMENT.droneFee} cr, before anyone claims them.`}
      </p>
      <HoloMap width={view.width} height={view.height} tiles={tiles} onTile={toggle} selected={last ?? null} />
      {lastTile && (
        <Panel title={`Plot ${plotName(lastTile.x, lastTile.y)}`} aside={ordered ? 'DRONE ON ITS WAY' : 'PICKED'}>
          <span className="font-display text-xl font-semibold">{TERRAIN_NAME[lastTile.terrain]}</span>
          <span className="text-sm text-ink-2">{TERRAIN_ODDS[lastTile.terrain]}</span>
        </Panel>
      )}
      {!ordered && (
        <Button
          size="lg"
          disabled={picked.length === 0 || self.money < DEVELOPMENT.droneFee}
          onClick={() => {
            client.intent({ type: 'drone', plots: picked });
          }}
        >
          {picked.length === 0 ? 'Pick a free plot' : `Send the drone · ${DEVELOPMENT.droneFee} cr`}
        </Button>
      )}
    </div>
  );
}
