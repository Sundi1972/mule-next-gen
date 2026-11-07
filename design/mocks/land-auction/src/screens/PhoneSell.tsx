import { Button, cx, GOOD_NAME, HoloMap, PlayerMark, TERRAIN_NAME, type MapTile, type Slot } from '@mule/ui';
import { useState } from 'react';
import { mapTiles, plotName, slotOf, tileAt } from '../../../../../apps/web/src/game/derive';
import { MapFit, PhoneShell } from '../../../../../apps/web/src/phone/Shell';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { VIEW } from '../fixture';
import { lotWhat, sellerName } from '../parts';
import type { ListingView } from '../proto';

const TABS = ['Colony', 'Geo drone', 'Sell', 'Chat'] as const;
const STORE_PLOT = 200;
const STEP = 10;

/**
 * Planning · the Sell tab. Tap one of your plots, choose the plot or the
 * MULE on it, set the lowest price you'll take and what happens if nobody
 * bids it. The month's line-up (everyone's, public) sits above, with the
 * slots left.
 * GRAFT TARGET: apps/web/src/phone/Planning.tsx — a fourth tab, 'sell', beside Colony, Geo drone and Chat.
 */
export function PhoneSell({ startListings = VIEW.listings, max = VIEW.lotSlots.max }: { startListings?: ListingView[]; max?: number }) {
  const { self, slot } = usePhoneGame();
  const view = VIEW;
  const [listings, setListings] = useState(startListings);
  const [picked, setPicked] = useState<{ x: number; y: number } | null>(null);
  const [kind, setKind] = useState<'plot' | 'mule'>('plot');
  const [minimum, setMinimum] = useState(250);
  const [unsold, setUnsold] = useState<'store' | 'keep'>('store');

  const mine = listings.filter((l) => l.seller === self.id);
  const full = listings.length >= max;
  const atLimit = mine.length >= 2;
  const tile = picked ? tileAt(view, picked.x, picked.y) : undefined;
  const listedHere = picked && listings.some((l) => l.item.x === picked.x && l.item.y === picked.y);
  const hasMule = !!tile?.outfit;
  const storePays = kind === 'plot' ? STORE_PLOT : Math.round(view.mulePrice * 0.5);
  const blocked = full ? 'The auction is full this month.' : atLimit ? 'You have listed 2 lots, the most a month.' : listedHere ? 'This plot is already up for auction.' : null;

  const tiles: MapTile[] = mapTiles(view).map((t) =>
    listings.some((l) => l.item.x === t.x && l.item.y === t.y) ? { ...t, flag: 'sale' } : t,
  );
  const pick = (t: MapTile) => {
    if (tileAt(view, t.x, t.y)?.owner !== self.id) return;
    setPicked({ x: t.x, y: t.y });
    setKind('plot');
  };
  const list = () => {
    if (!picked || blocked) return;
    const item = kind === 'mule' && tile?.outfit ? { kind: 'mule' as const, x: picked.x, y: picked.y, outfit: tile.outfit } : { kind: 'plot' as const, x: picked.x, y: picked.y };
    setListings((ls) => [...ls, { id: `m${ls.length + 1}`, seller: self.id, item, minimum, unsold, storePays }]);
    setPicked(null);
  };

  return (
    <PhoneShell
      phase="Planning"
      seconds={31}
      fill
      rail={
        <>
          <div role="tablist" aria-label="Planning" className="grid shrink-0 grid-cols-[0.9fr_1.15fr_0.75fr_0.8fr] gap-1 rounded-control border border-holo-line bg-void p-1">
            {TABS.map((t) => (
              <button key={t} role="tab" type="button" aria-selected={t === 'Sell'} data-testid={`tab-${t.toLowerCase().replace(' ', '-')}`} className={cx('h-9 whitespace-nowrap rounded-[8px] text-[12px] font-semibold', t === 'Sell' ? 'bg-holo-soft text-holo' : 'text-ink-2')}>
                {t}
              </button>
            ))}
          </div>

          {/* While you set up a lot, the line-up shrinks to one line so the form fits a phone held sideways. */}
          {tile && (
            <span className="label-caps flex justify-between" data-testid="lineup-short">
              {listings.length} up for auction <span className={cx(full ? 'text-warn' : 'text-ink-3')}>{full ? 'FULL' : `${max - listings.length} OF ${max} LEFT`}</span>
            </span>
          )}
          <section className={cx('flex flex-col gap-1', tile && 'hidden')} data-testid="lineup">
            <span className="label-caps flex justify-between">
              Up for auction <span data-testid="slots" className={cx(full ? 'text-warn' : 'text-ink-3')}>{full ? 'FULL' : `${max - listings.length} OF ${max} SLOTS LEFT`}</span>
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
                    <button type="button" className="font-mono text-[10px] text-alert-ink underline" onClick={() => setListings((ls) => ls.filter((x) => x.id !== l.id))} data-testid={`unlist-${l.id}`}>
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
                <button type="button" className="font-mono text-[10px] text-ink-3 underline" onClick={() => setPicked(null)} data-testid="sell-cancel">
                  CANCEL
                </button>
              </span>
              <div role="radiogroup" aria-label="What to sell" className="grid grid-cols-2 gap-1 rounded-control border border-holo-line bg-void p-1">
                {(['plot', 'mule'] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={k === 'mule' && !hasMule} onClick={() => setKind(k)} data-testid={`kind-${k}`}
                    className={cx('h-8 rounded-[8px] text-xs font-semibold disabled:opacity-35', kind === k ? 'bg-holo-soft text-holo' : 'text-ink-2')}>
                    {k === 'plot' ? (hasMule ? 'Plot + MULE' : 'Plot') : hasMule && tile.outfit !== 'greenBelt' && tile.outfit ? `${GOOD_NAME[tile.outfit]} MULE` : 'MULE'}
                  </button>
                ))}
              </div>
              {/* DS-GAP: @mule/ui has no number stepper; composed from two Buttons and a mono value. */}
              <div className="flex items-center gap-1.5" data-testid="minimum">
                <span className="label-caps w-9">Min</span>
                <Button size="md" variant="outline" className="h-9 w-10 px-0" onClick={() => setMinimum((m) => Math.max(STEP, m - STEP))} aria-label="Lower the minimum" data-testid="minimum-down">−</Button>
                <span data-num className="flex-1 text-center font-mono text-lg font-bold">{minimum} cr</span>
                <Button size="md" variant="outline" className="h-9 w-10 px-0" onClick={() => setMinimum((m) => m + STEP)} aria-label="Raise the minimum" data-testid="minimum-up">+</Button>
              </div>
              <div role="radiogroup" aria-label="If nobody bids" className="grid grid-cols-2 gap-1 rounded-control border border-holo-line bg-void p-1">
                {(['store', 'keep'] as const).map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={unsold === u} onClick={() => setUnsold(u)} data-testid={`unsold-${u}`}
                    className={cx('h-8 rounded-[8px] text-xs font-semibold', unsold === u ? 'bg-holo-soft text-holo' : 'text-ink-2')}>
                    {u === 'store' ? `Store buys · ${storePays}` : 'Keep it'}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-ink-3">If nobody bids {minimum}: {unsold === 'store' ? `the store pays ${storePays}${kind === 'plot' ? ' and the plot goes back to free land' : ''}.` : 'you keep it.'}</p>
            </section>
          )}
        </>
      }
      footer={
        <>
          {tile && (
            <Button size="md" className="w-full px-2" disabled={!!blocked} onClick={list} data-testid="list">
              {blocked ?? `Put it up for auction · ≥${minimum}`}
            </Button>
          )}
          <Button size="lg" variant="holo" className="w-full px-2" data-testid="ready">
            I'm ready
          </Button>
        </>
      }
    >
      <p className="pb-1.5 font-mono text-[11px] text-ink-3">TAP ONE OF YOUR PLOTS · LISTED PLOTS ARE MARKED FOR SALE</p>
      <MapFit width={view.width} height={view.height}>
        <HoloMap width={view.width} height={view.height} tiles={tiles} onTile={pick} selected={picked} focusSlot={slot} />
      </MapFit>
    </PhoneShell>
  );
}
