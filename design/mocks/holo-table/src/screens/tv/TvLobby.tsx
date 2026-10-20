import { PlayerMark } from '@mule/ui';
import { ROOM_CODE, SEATS } from '../../data';

const QR = 25;

/** A made-up QR pattern: three finder squares and deterministic noise. */
function qrCell(x: number, y: number): boolean {
  const finder = (fx: number, fy: number) => {
    const dx = x - fx;
    const dy = y - fy;
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
    const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
    return ring !== 2;
  };
  const f = finder(0, 0) ?? finder(QR - 7, 0) ?? finder(0, QR - 7);
  if (f !== null) return f;
  if ((x === 7 || y === 7) && (x < 8 || y < 8)) return false;
  return ((x * 73 + y * 151 + x * y * 7) % 11) < 5;
}

const CELLS = Array.from({ length: QR * QR }, (_, i) => qrCell(i % QR, Math.floor(i / QR)));

export function TvLobby() {
  return (
    <div className="holo-grid flex h-[720px] w-[1280px] gap-14 bg-table p-14 text-ink">
      <div className="flex w-[440px] shrink-0 flex-col items-center justify-center gap-6">
        <div className="rounded-panel border-2 border-holo-line bg-void p-5 shadow-glow">
          <div className="grid size-[320px]" style={{ gridTemplateColumns: `repeat(${QR}, minmax(0, 1fr))` }} role="img" aria-label="QR code to join this game">
            {CELLS.map((on, i) => (
              <span key={i} className={on ? 'bg-ink' : ''} />
            ))}
          </div>
        </div>
        <span className="font-display text-3xl font-semibold">Scan to join</span>
        <span className="font-mono text-xl text-ink-2">mule.game/{ROOM_CODE}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-8">
        <div className="flex flex-col gap-2">
          <span className="label-caps text-base!">Room code</span>
          <span className="font-mono text-[112px] font-bold leading-none tracking-[0.2em] text-holo">{ROOM_CODE}</span>
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {SEATS.map((s, i) => (
            <li key={s.slot} className="flex items-center gap-4 rounded-panel border border-holo-line bg-panel px-5 py-4">
              <PlayerMark slot={s.slot} size={34} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-display text-2xl font-semibold">{s.name}</span>
                <span className="truncate font-mono text-sm text-ink-3">
                  {s.ai ? `AI · ${s.ai} · ${s.persona}` : i === 0 ? 'Host' : i === 4 ? 'Joining…' : 'Ready'}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <span className="font-display text-2xl text-ink-2">Waiting for the host to start</span>
      </div>
    </div>
  );
}
