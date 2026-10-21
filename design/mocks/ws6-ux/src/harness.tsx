import type { MuleView } from '@mule/protocol';
import { SeatSpeciesProvider, type Slot } from '@mule/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { seatSpecies } from '../../../../apps/web/src/game/derive';
import type { TableClient } from '../../../../apps/web/src/net/client';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { VIEW } from './fixture';

/** A stand-in for the network client: the real screens read the view from the providers below, and intents only log. */
const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 'lena', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => Date.now(),
  intent: (i: unknown) => console.info('intent', i),
} as unknown as TableClient;

/** The real app's providers around a fixture view, as one seat's phone sees it (Lena's by default). */
export function Game({ view = VIEW, seat = 'lena', children }: { view?: MuleView; seat?: string; children: ReactNode }) {
  const self = view.players.find((p) => p.id === seat)!;
  const slot = view.players.findIndex((p) => p.id === seat) as Slot;
  const table = { code: 'MULE', status: 'playing' as const, hostId: 'lena', seats: [], boards: 1, game: view };
  return (
    <ClientProvider client={client}>
      <SeatSpeciesProvider value={seatSpecies(view)}>
        <PhoneGameProvider value={{ table, view, me: { ...view.me!, id: seat }, self, slot }}>{children}</PhoneGameProvider>
      </SeatSpeciesProvider>
    </ClientProvider>
  );
}

/** The big screen's providers: the public view, no seat. */
export function Board({ view = VIEW, children }: { view?: MuleView; children: ReactNode }) {
  return (
    <ClientProvider client={client}>
      <SeatSpeciesProvider value={seatSpecies(view)}>{children}</SeatSpeciesProvider>
    </ClientProvider>
  );
}

/** The table as the TV's header and parts expect it. */
export const TABLE = { code: 'MULE', status: 'playing' as const, hostId: 'lena', seats: [], boards: 1, game: VIEW };

/** A phone held sideways at the e2e harness's size (844 × 390). */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    // A narrow window scrolls the frame, never the page.
    <div className="max-w-full overflow-x-auto">
      <div className="h-[390px] w-[844px] overflow-hidden rounded-sheet border border-holo-line shadow-map" data-testid="phone-frame">
        {children}
      </div>
    </div>
  );
}

/** The big screen at its design size (1280 × 720), scaled down to fit the page. */
export function TvFrame({ children }: { children: ReactNode }) {
  return (
    // The inner box takes the scaled size; a narrow window scrolls it, never the page.
    <div className="max-w-full overflow-x-auto">
      <div className="overflow-hidden rounded-panel border border-holo-line" style={{ width: 960, height: 540 }} data-testid="tv-frame">
        <div className="origin-top-left scale-[0.75]" style={{ width: 1280, height: 720 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Routes are hash tokens (#auction-mid), so a link opens one screen directly. */
export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

/** A clock in seconds since mount, ticking every `ms`, that a restart sets back to zero. */
export function useClock(ms = 100): { t: number; restart: () => void } {
  const [start, setStart] = useState(() => performance.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return { t: Math.max(0, (now - start) / 1000), restart: () => setStart(performance.now()) };
}
