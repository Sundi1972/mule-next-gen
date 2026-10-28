import type { MuleView } from '@mule/protocol';
import { SeatSpeciesProvider, type Slot } from '@mule/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { seatSpecies } from '../../../../apps/web/src/game/derive';
import type { TableClient } from '../../../../apps/web/src/net/client';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { VIEW } from './fixture';

/**
 * The stand-in client's state. One object, never a fresh one per call: the app's chat reads it through
 * useSyncExternalStore (apps/web/src/chat/Chat.tsx), which loops forever on a snapshot that changes every render.
 */
const STATE = { status: 'open', role: 'player', code: 'MULE', seatId: 'lena', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };

/** A stand-in for the network client: the real screens read the view from the providers below, and intents only log. */
const client = {
  subscribe: () => () => {},
  getState: () => STATE,
  serverNow: () => Date.now(),
  intent: (i: unknown) => console.info('intent', i),
} as unknown as TableClient;

/** The real app's providers around a fixture view, as one seat's phone sees it (Lena's by default). */
export function Game({ view = VIEW, seat = 'lena', hostId = 'lena', away = [], children }: { view?: MuleView; seat?: string; hostId?: string; away?: string[]; children: ReactNode }) {
  const self = view.players.find((p) => p.id === seat)!;
  const slot = view.players.findIndex((p) => p.id === seat) as Slot;
  const seats = view.players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: p.isAi || !away.includes(p.id), color: p.slot }));
  const table = { code: 'MULE', status: 'playing' as const, hostId, seats, boards: 1, game: view };
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

/**
 * `?phone=667` (before the hash: /?phone=667#plan) puts every phone frame on the page at the small landscape phone,
 * an iPhone SE held sideways (667 × 375), instead of 844 × 390.
 */
export const SMALL_PHONE = new URLSearchParams(window.location.search).get('phone') === '667';

/**
 * A phone held sideways at the e2e harness's size (844 × 390), or at 667 × 375 with `?phone=667`. The app's rail is
 * `--rail: clamp(232px, 31vw, 300px)`; in a desktop browser 31vw is the window's, so the 844 frame keeps the 300 px
 * rail it was approved with. The small frame reads the same clamp against the frame (31cqw of the shell), so its rail
 * is the 232 px the phone itself gives it, and its stage is the phone's too.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    // A narrow window scrolls the frame, never the page.
    <div className="max-w-full overflow-x-auto">
      <div
        className={`${SMALL_PHONE ? 'h-[375px] w-[667px] [--rail:clamp(232px,31cqw,300px)]' : 'h-[390px] w-[844px]'} overflow-hidden rounded-sheet border border-holo-line shadow-map`}
        data-testid="phone-frame"
        data-phone={SMALL_PHONE ? '667' : '844'}
      >
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

/** A laptop browser window (1440 × 900), the size Heiko played at, scaled down to fit the page. */
export function LaptopFrame({ children, scale = 0.62 }: { children: ReactNode; scale?: number }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="overflow-hidden rounded-panel border border-holo-line shadow-map" style={{ width: 1440 * scale, height: 900 * scale }} data-testid="laptop-frame">
        <div className="origin-top-left" style={{ width: 1440, height: 900, transform: `scale(${scale})` }}>
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
