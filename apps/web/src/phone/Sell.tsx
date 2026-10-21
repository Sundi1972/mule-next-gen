import { isListed, LOTS, storePaysAt } from '@mule/engine';
import { Button, cx, GOOD_NAME, HoloMap, PlayerMark, TERRAIN_NAME, type MapTile, type Slot } from '@mule/ui';
import { useState } from 'react';
import { lotWhat, sellerName } from '../components/AuctionParts';
import { mapTiles, plotName, slotOf, tileAt } from '../game/derive';
import { useClient } from '../net/react';
import { usePhoneGame } from './game';
import { MapFit } from './Shell';

/* Planning's Sell tab: the month's public line-up, and a form to list one of your plots or the MULE on it. */

type Plot = { x: number; y: number };

const MINIMUM_START = 250;
const MINIMUM_STEP = 10;

type SellForm = ReturnType<typeof useSellForm>;

/** The Sell tab's form: the plot picked on the map, plot or MULE, the minimum, and what happens if nobody bids. */
export function useSellForm() {
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
  const listedHere = !!picked && isListed(view, picked.x, picked.y);
  const blocked = listedHere
    ? 'This plot is already up for auction.'
    : atLimit
      ? `You have listed ${LOTS.perPlayer} lots, the most a month.`
      : full
        ? 'The auction is full this month.'
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
export function SellRail({ sell }: { sell: SellForm }) {
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
export function SellMap({ sell }: { sell: SellForm }) {
  const { view, slot } = usePhoneGame();
  const tiles: MapTile[] = mapTiles(view).map((t) => (isListed(view, t.x, t.y) ? { ...t, flag: 'sale' } : t));
  return (
    <>
      <p className="pb-1.5 font-mono text-[11px] text-ink-3">TAP ONE OF YOUR PLOTS · LISTED PLOTS ARE MARKED FOR SALE</p>
      <MapFit width={view.width} height={view.height}>
        <HoloMap width={view.width} height={view.height} tiles={tiles} onTile={sell.pick} selected={sell.picked} focusSlot={slot} />
      </MapFit>
    </>
  );
}
