import { SeatSpeciesProvider, type Slot } from '@mule/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { seatSpecies } from '../../../../apps/web/src/game/derive';
import type { TableClient } from '../../../../apps/web/src/net/client';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { VIEW } from './fixture';
import type { LandAuctionView, LotsView } from './proto';

/** A stand-in for the network client: the real screens read the view from the providers below, and intents only log. */
const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 'lena', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => Date.now(),
  intent: (i: unknown) => console.info('intent', i),
} as unknown as TableClient;

/** The real app's providers around a fixture view, as Lena's phone sees it. */
export function Game({ view = VIEW, children }: { view?: LotsView; children: ReactNode }) {
  const self = view.players.find((p) => p.id === 'lena')!;
  const table = { code: 'MULE', status: 'playing' as const, hostId: 'lena', seats: [], boards: 1, game: view };
  return (
    <ClientProvider client={client}>
      <SeatSpeciesProvider value={seatSpecies(view)}>
        <PhoneGameProvider value={{ table, view, me: view.me!, self, slot: 0 as Slot }}>{children}</PhoneGameProvider>
      </SeatSpeciesProvider>
    </ClientProvider>
  );
}

/** A phone held sideways at the e2e harness's size (844 × 390). */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-[390px] w-[844px] overflow-hidden rounded-sheet border border-holo-line shadow-map" data-testid="phone-frame">
      {children}
    </div>
  );
}

/** The big screen at its design size (1280 × 720), scaled down to fit the page. */
export function TvFrame({ children }: { children: ReactNode }) {
  return (
    <div className="origin-top-left scale-[0.75] overflow-hidden rounded-panel border border-holo-line" style={{ width: 1280, height: 720 }} data-testid="tv-frame">
      {children}
    </div>
  );
}

/**
 * Makes the walk playable in the mock: hold Up or Down and your creature
 * walks at the board's speed, the bid is capped at your money, Ossa answers
 * any lead you take after a moment, and the clock runs down.
 */
export function useLotWalk(start: LandAuctionView, money: number) {
  const [lot, setLot] = useState(start);
  const dir = useRef<-1 | 0 | 1>(0);
  useEffect(() => {
    const id = setInterval(() => {
      setLot((l) => {
        if (l.stage !== 'walk') return l;
        const step = (l.speed * 0.1) * dir.current;
        const walkers = l.walkers.map((w) => {
          if (w.side !== 'buyer') return w;
          if (w.id === 'lena') {
            const at = Math.max(l.lo, Math.min(money, w.at + step));
            return { ...w, at, price: Math.round(at), dir: dir.current };
          }
          // Ossa: overtakes while its limit (420) allows.
          const me = l.walkers.find((x) => x.id === 'lena')!;
          const target = Math.min(420, Math.max(w.at, me.price + 1));
          const at = w.at < target ? Math.min(target, w.at + l.speed * 0.06) : w.at;
          return { ...w, at, price: Math.round(at) };
        });
        const bids = walkers.filter((w) => w.side === 'buyer' && w.price >= l.lot.minimum).sort((a, b) => b.price - a.price);
        const top = bids[0];
        const seconds = Math.max(0, l.seconds - 0.1);
        if (seconds === 0) return { ...l, walkers, seconds, stage: 'result', result: top ? { kind: 'sold', buyer: top.id, price: top.price } : { kind: 'kept' } };
        return { ...l, walkers, seconds, leader: top ? { id: top.id, bid: top.price } : null };
      });
    }, 100);
    return () => clearInterval(id);
  }, [money]);
  return { lot, walk: (d: -1 | 0 | 1) => (dir.current = d), restart: () => setLot(start) };
}
