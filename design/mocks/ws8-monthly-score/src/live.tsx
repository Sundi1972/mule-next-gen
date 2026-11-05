import type { MuleIntent, MuleView, TableView } from '@mule/protocol';
import { cx, SeatSpeciesProvider, type Slot } from '@mule/ui';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { seatSpecies } from '../../../../apps/web/src/game/derive';
import type { ClientState, TableClient } from '../../../../apps/web/src/net/client';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { SELF } from './fixture';

/**
 * The real app's providers around a fixture view, as apps/web/test/colony-screens.test.ts mounts them: ClientProvider
 * with a fake client, PhoneGameProvider with the seat's view. The month end's one intent is Ready ("On to month N"),
 * and the host's Continue: the fake client marks the seat ready, so the footer walks its real states.
 */
function usePhoneClient(start: MuleView) {
  const [view, setView] = useState(start);
  const state = useRef({ status: 'open', role: 'player', code: 'MULE', seatId: SELF, view: null, chat: [], emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null } as unknown as ClientState);
  const client = useMemo(
    () =>
      ({
        subscribe: () => () => {},
        getState: () => state.current,
        serverNow: () => Date.now(),
        dismiss: () => {},
        intent: (i: MuleIntent) => {
          console.info('intent', i);
          if (i.type === 'ready') setView((v) => ({ ...v, players: v.players.map((p) => (p.id === SELF ? { ...p, ready: true } : p)) }));
          if (i.type === 'continue') setView((v) => ({ ...v, players: v.players.map((p) => ({ ...p, ready: true })) }));
        },
      }) as unknown as TableClient,
    [],
  );
  return { client, view };
}

/** One seat's phone: Heiko, the host. `boards` 0 is a table with no TV, where the phone carries the colony panel. */
export function LivePhone({ start, boards = 1, small = false, children }: { start: MuleView; boards?: number; small?: boolean; children: ReactNode }) {
  const { client, view } = usePhoneClient(start);
  const self = view.players.find((p) => p.id === SELF)!;
  const slot = view.players.findIndex((p) => p.id === SELF) as Slot;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: SELF, seats: view.players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })), boards, game: view } as TableView<MuleView>;
  return (
    <ClientProvider client={client}>
      <SeatSpeciesProvider value={seatSpecies(view)}>
        <PhoneGameProvider value={{ table, view, me: view.me!, self, slot }}>
          <PhoneFrame small={small}>{children}</PhoneFrame>
        </PhoneGameProvider>
      </SeatSpeciesProvider>
    </ClientProvider>
  );
}

/** A phone held sideways: the e2e harness's 844 × 390, or the smallest the shell supports, 667 × 375. COPY: land-auction's PhoneFrame. */
export function PhoneFrame({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className={cx('transform-gpu overflow-hidden rounded-sheet border border-holo-line shadow-map', small ? 'h-[375px] w-[667px]' : 'h-[390px] w-[844px]')} data-testid="phone-frame">
        {children}
      </div>
    </div>
  );
}

/** The big screen at its design size (1280 × 720), at `scale`. COPY: land-auction's TvFrame, with the scale a prop for the side-by-side index. */
export function TvFrame({ children, scale = 0.75 }: { children: ReactNode; scale?: number }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="overflow-hidden rounded-panel border border-holo-line" style={{ width: 1280 * scale, height: 720 * scale }} data-testid="tv-frame">
        <div className="origin-top-left" style={{ width: 1280, height: 720, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The TV's providers: the client is only read, never written. */
export function TvGame({ view, scale, children }: { view: MuleView; scale?: number; children: ReactNode }) {
  const client = useMemo(
    () => ({ subscribe: () => () => {}, getState: () => ({ status: 'open', role: 'board', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }), serverNow: () => Date.now(), intent: () => {} }) as unknown as TableClient,
    [],
  );
  return (
    <ClientProvider client={client}>
      <SeatSpeciesProvider value={seatSpecies(view)}>
        <TvFrame {...(scale ? { scale } : {})}>{children}</TvFrame>
      </SeatSpeciesProvider>
    </ClientProvider>
  );
}
