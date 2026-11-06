import { PlayerMark } from '@mule/ui';
import { joinUrl, Qr } from '../../../../../apps/web/src/components/Qr';
import { ThemeToggle } from '../../../../../apps/web/src/components/ThemeToggle';
import { HOST, ROOM, SEATS, type LobbyLink, type MockSeat } from '../fixture';
import { Chip, LOBBY_CHIP } from '../parts';

/*
 * GRAFT TARGET: TvLobby in apps/web/src/table/TableApp.tsx. Only the seat's second line changes: a Claude seat
 * says so and wears its chip. The TV never shows a seat's join code: the room is watching.
 */

function kindLine(seat: MockSeat): string {
  if (seat.kind === 'builtin') return 'AI player';
  if (seat.kind === 'claude') return 'Claude';
  return seat.id === HOST ? 'Host' : 'Ready';
}

export function TvLobby({ juno }: { juno: LobbyLink }) {
  const url = joinUrl(ROOM);
  return (
    <div className="holo-grid flex h-[720px] w-[1280px] gap-14 bg-table p-14 text-ink" data-testid="tv-lobby">
      <div className="flex w-[440px] shrink-0 flex-col items-center justify-center gap-6">
        <div className="rounded-panel border-2 border-holo-line bg-void p-5 shadow-glow">
          <Qr text={url} size={300} />
        </div>
        <span className="font-display text-3xl font-semibold">Scan to join</span>
        <span className="font-mono text-xl text-ink-2">{url.replace(/^https?:\/\//, '')}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-8">
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-col gap-2">
            <span className="label-caps text-base!">Room code</span>
            <span className="font-mono text-[112px] font-bold leading-none tracking-[0.2em] text-holo" data-testid="room-code">
              {ROOM}
            </span>
          </div>
          <ThemeToggle />
        </div>
        <ul className="grid grid-cols-2 gap-3" data-testid="tv-seats">
          {SEATS.map((s) => (
            <li key={s.id} className="flex items-center gap-4 rounded-panel border border-holo-line bg-panel px-5 py-4" data-testid={`tv-seat-${s.id}`}>
              <PlayerMark slot={s.slot} species={s.species} size={34} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-display text-2xl font-semibold">{s.name}</span>
                <span className="truncate font-mono text-sm text-ink-3">{kindLine(s)}</span>
                {/* Its own line: beside the name, the chip leaves a 1280 px TV's half-width card no room for the name. */}
                {s.kind === 'claude' && <Chip word={LOBBY_CHIP[juno]} className="mt-1 self-start px-2! py-0.5 text-xs!" testid={`tv-chip-${s.id}`} />}
              </div>
            </li>
          ))}
        </ul>
        <span className="font-display text-2xl text-ink-2">Waiting for the host to start</span>
      </div>
    </div>
  );
}
