import { DEVELOPMENT, LOTS, storePaysAt } from '@mule/engine';
import { Button, cx, GOOD_NAME, HoloMap, PlayerMark, TERRAIN_NAME, type MapTile, type Slot } from '@mule/ui';
import { useState } from 'react';
import { lotWhat, sellerName } from '../components/AuctionParts';
import { mapTiles, PHASE_NAME, plotName, secondsUntil, slotOf, TERRAIN_ODDS, tileAt } from '../game/derive';
import { useClient, useClientState, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { Chat, MarketCells, NewsPanel, ShipLine, StockPanel } from './parts';
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

const MINIMUM_START = 250;
const MINIMUM_STEP = 10;

type SellForm = ReturnType<typeof useSellForm>;

/** The Sell tab's form: the plot picked on the map, plot or MULE, the minimum, and what happens if nobody bids. */
function useSellForm() {
  const client = useClient();
  const { view, self } = usePhoneGame();
  const [picked, setPicked] = useState<Plot | null>(null);
  const [kind, setKind] = useState<'plot' | 'mule'>('plot');
  const [minimum, setMinimum] = useState(MINIMUM_START);
  const [unsold, setUnsold] = useState<'store' | 'keep'>('store');

  const mine = view.listings.filter((l) => l.seller === self.id);
  const full = view.lotSlots.used >= view.lotSlots.max;
  const atLimit = mine.length >= LOTS.perPlayer;
  const tile = picked ? tileAt(view, picked.x, picked.y) : undefined;
  const listedHere = !!picked && view.listings.some((l) => l.item.x === picked.x && l.item.y === picked.y);
  const blocked = full
    ? 'The auction is full this month.'
    : atLimit
      ? `You have listed ${LOTS.perPlayer} lots, the most a month.`
      : listedHere
        ? 'This plot is already up for auction.'
        : null;

  const pick = (t: MapTile) => {
    if (tileAt(view, t.x, t.y)?.owner !== self.id) return;
    setPicked({ x: t.x, y: t.y });
    setKind('plot');
  };
  const list = () => {
    if (!picked || blocked) return;
    client.intent({ type: 'list', item: { kind, x: picked.x, y: picked.y }, minimum, unsold });
    setPicked(null);
  };

  return {
    picked,
    tile,
    kind,
    setKind,
    minimum,
    lowerMinimum: () => setMinimum((m) => Math.max(MINIMUM_STEP, m - MINIMUM_STEP)),
    raiseMinimum: () => setMinimum((m) => m + MINIMUM_STEP),
    unsold,
    setUnsold,
    storePays: storePaysAt(kind, view.mulePrice),
    full,
    blocked,
    pick,
    list,
    cancel: () => setPicked(null),
    unlist: (id: string) => client.intent({ type: 'unlist', id }),
  };
}

/** The month's line-up (everyone's, public) with the slots left, then the form for the plot you tapped. */
function SellRail({ sell }: { sell: SellForm }) {
  const { view, self } = usePhoneGame();
  const { tile, kind, minimum, unsold, storePays, full } = sell;
  const { listings, lotSlots } = view;
  const left = lotSlots.max - lotSlots.used;
  const hasMule = !!tile?.outfit;
  return (
    <>
      {/* While you set up a lot, the line-up shrinks to one line so the form fits a phone held sideways. */}
      {tile && (
        <span className="label-caps flex justify-between" data-testid="lineup-short">
          {listings.length} up for auction <span className={cx(full ? 'text-warn' : 'text-ink-3')}>{full ? 'FULL' : `${left} OF ${lotSlots.max} LEFT`}</span>
        </span>
      )}
      <section className={cx('flex flex-col gap-1', tile && 'hidden')} data-testid="lineup">
        <span className="label-caps flex justify-between">
          Up for auction <span data-testid="slots" className={cx(full ? 'text-warn' : 'text-ink-3')}>{full ? 'FULL' : `${left} OF ${lotSlots.max} SLOTS LEFT`}</span>
        </span>
        {listings.length === 0 && <span className="text-xs text-ink-3">Nothing yet. Lots sell right after the land grant.</span>}
        <ul className="flex flex-col gap-0.5">
          {listings.map((l) => (
            <li key={l.id} className="flex items-center gap-1.5 text-xs" data-testid={`listing-${l.id}`}>
              <PlayerMark slot={(slotOf(view, l.seller) ?? 0) as Slot} size={9} />
              <span className="min-w-0 flex-1 truncate">
                {l.item.kind === 'mule' ? lotWhat(view, l) : `Plot ${plotName(l.item.x, l.item.y)}`}
                <span className="text-ink-3"> · {l.seller === self.id ? 'you' : sellerName(view, l.seller)}</span>
              </span>
              <span data-num className="font-mono text-ink-2">≥{l.minimum}</span>
              {l.seller === self.id && (
                <button type="button" className="font-mono text-[10px] text-alert-ink underline" onClick={() => sell.unlist(l.id)} data-testid={`unlist-${l.id}`}>
                  UNLIST
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {!tile ? (
        <p className="border-t border-holo-faint pt-2 text-xs text-ink-2" data-testid="sell-hint">
          Tap one of your plots to sell it, or the MULE on it. Everyone else can bid; nobody can trade with you directly.
        </p>
      ) : (
        <section className="flex flex-col gap-1.5 border-t border-holo-faint pt-2" data-testid="sell-form">
          <span className="flex items-baseline justify-between font-display text-base font-semibold leading-tight">
            <span>
              {TERRAIN_NAME[tile.terrain]} <span className="font-mono text-sm text-ink-3">{plotName(tile.x, tile.y)}</span>
            </span>
            <button type="button" className="font-mono text-[10px] text-ink-3 underline" onClick={sell.cancel} data-testid="sell-cancel">
              CANCEL
            </button>
          </span>
          <div role="radiogroup" aria-label="What to sell" className="grid grid-cols-2 gap-1 rounded-control border border-holo-line bg-void p-1">
            {(['plot', 'mule'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                disabled={k === 'mule' && !hasMule}
                onClick={() => sell.setKind(k)}
                data-testid={`kind-${k}`}
                className={cx('h-8 rounded-[8px] text-xs font-semibold disabled:opacity-35', kind === k ? 'bg-holo-soft text-holo' : 'text-ink-2')}
              >
                {k === 'plot' ? (hasMule ? 'Plot + MULE' : 'Plot') : hasMule && tile.outfit !== 'greenBelt' && tile.outfit ? `${GOOD_NAME[tile.outfit]} MULE` : 'MULE'}
              </button>
            ))}
          </div>
          {/* DS-GAP: @mule/ui has no number stepper; composed from two Buttons and a mono value. */}
          <div className="flex items-center gap-1.5" data-testid="minimum">
            <span className="label-caps w-9">Min</span>
            <Button size="md" variant="outline" className="h-9 w-10 px-0" onClick={sell.lowerMinimum} aria-label="Lower the minimum" data-testid="minimum-down">
              −
            </Button>
            <span data-num className="flex-1 text-center font-mono text-lg font-bold">
              {minimum} cr
            </span>
            <Button size="md" variant="outline" className="h-9 w-10 px-0" onClick={sell.raiseMinimum} aria-label="Raise the minimum" data-testid="minimum-up">
              +
            </Button>
          </div>
          <div role="radiogroup" aria-label="If nobody bids" className="grid grid-cols-2 gap-1 rounded-control border border-holo-line bg-void p-1">
            {(['store', 'keep'] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unsold === u}
                onClick={() => sell.setUnsold(u)}
                data-testid={`unsold-${u}`}
                className={cx('h-8 rounded-[8px] text-xs font-semibold', unsold === u ? 'bg-holo-soft text-holo' : 'text-ink-2')}
              >
                {u === 'store' ? `Store buys · ${storePays}` : 'Keep it'}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-ink-3">
            If nobody bids {minimum}: {unsold === 'store' ? `the store pays ${storePays}${kind === 'plot' ? ' and the plot goes back to free land' : ''}.` : 'you keep it.'}
          </p>
        </section>
      )}
    </>
  );
}

/** Your plots to tap, with every listed plot marked for sale. */
function SellMap({ sell }: { sell: SellForm }) {
  const { view, slot } = usePhoneGame();
  const tiles: MapTile[] = mapTiles(view).map((t) => (view.listings.some((l) => l.item.x === t.x && l.item.y === t.y) ? { ...t, flag: 'sale' } : t));
  return (
    <>
      <p className="pb-1.5 font-mono text-[11px] text-ink-3">TAP ONE OF YOUR PLOTS · LISTED PLOTS ARE MARKED FOR SALE</p>
      <MapFit width={view.width} height={view.height}>
        <HoloMap width={view.width} height={view.height} tiles={tiles} onTile={sell.pick} selected={sell.picked} focusSlot={slot} />
      </MapFit>
    </>
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
