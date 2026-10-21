import { SeatSpeciesProvider } from '@mule/ui';
import { useEffect } from 'react';
import { player, seatSpecies, slotOf } from '../game/derive';
import { useClient, useClientState } from '../net/react';
import { Auction } from './Auction';
import { Develop } from './Develop';
import { GameOver } from './GameOver';
import { PhoneGameProvider } from './game';
import { LandAuction } from './LandAuction';
import { LandGrant } from './LandGrant';
import { Entry, Lobby } from './Lobby';
import { EmoteBubbles } from './parts';
import { Planning } from './Planning';
import { Results } from './Results';
import { TurnSideways } from './Shell';

/**
 * The phone: your private controller, played sideways. Held upright it asks to be
 * turned; the game stays mounted underneath so nothing is lost while turning.
 */
export function PhoneApp({ room }: { room: string }) {
  return (
    <>
      <div className="h-full portrait:hidden">
        <PhoneScreens room={room} />
      </div>
      <div className="h-full landscape:hidden">
        <TurnSideways />
      </div>
    </>
  );
}

/** Which screen shows follows the game's phase. */
function PhoneScreens({ room }: { room: string }) {
  const client = useClient();
  const state = useClientState();

  // After a reload, take the saved seat back by itself, unless the link is for another table.
  useEffect(() => {
    const saved = client.savedSeat();
    if (saved && (!room || room === saved.code)) client.join(saved.code, saved.name);
  }, [client, room]);

  const table = state.view;
  if (!table || state.role !== 'player' || !state.seatId) return <Entry initialCode={room} />;
  if (table.status === 'lobby' || !table.game) return <Lobby />;

  const view = table.game;
  const me = view.me;
  const self = player(view, state.seatId);
  const slot = slotOf(view, state.seatId);
  if (!me || !self || slot === null) return <Entry initialCode={room} />;

  const screen = view.finished ? (
    <GameOver />
  ) : view.phase === 'planning' ? (
    <Planning />
  ) : view.phase === 'landGrant' ? (
    <LandGrant />
  ) : view.phase === 'development' ? (
    <Develop />
  ) : view.phase === 'auction' ? (
    <Auction />
  ) : view.phase === 'landAuction' ? (
    <LandAuction />
  ) : (
    <Results />
  );

  return (
    <SeatSpeciesProvider value={seatSpecies(view)}>
      <PhoneGameProvider value={{ table, view, me, self, slot }}>
        {/* Keyed by phase so each phase starts with fresh screen state. */}
        <div key={`${view.month}-${view.phase}`} className="h-full" data-phase={view.phase}>
          {screen}
        </div>
        <EmoteBubbles view={view} />
      </PhoneGameProvider>
    </SeatSpeciesProvider>
  );
}
