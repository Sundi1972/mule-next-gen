import { Button, cx, PlayerMark, type Slot } from '@mule/ui';
import { useState } from 'react';
import { joinUrl, Qr } from '../components/Qr';
import { ThemeToggle } from '../components/ThemeToggle';
import { createRoom } from '../net/client';
import { useClient, useClientState } from '../net/react';

function Header({ code }: { code?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-holo-faint px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <span className="font-display text-lg font-bold">
        M.U.L.E. <span className="text-holo">Next Gen</span>
      </span>
      <span className="flex items-center gap-3">
        <ThemeToggle />
        {code && (
          <span className="font-mono text-sm text-ink-2">
            ROOM <span className="font-bold tracking-[0.2em] text-ink" data-testid="room-code">{code}</span>
          </span>
        )}
      </span>
    </div>
  );
}

const inputClass = 'h-12 rounded-control border border-holo-line bg-panel px-3 text-lg text-ink outline-none placeholder:text-ink-3 focus:border-holo';

/** Before you have a seat: start a new game or join one by its code. */
export function Entry({ initialCode }: { initialCode: string }) {
  const client = useClient();
  const { status } = useClientState();
  const saved = client.savedSeat();
  const [name, setName] = useState(saved?.name ?? '');
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const connecting = busy || status === 'connecting';

  const create = async () => {
    setBusy(true);
    try {
      const room = await createRoom();
      client.join(room, name);
    } catch {
      client.toast('Could not reach the game server');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-table text-ink">
      <Header />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold">{initialCode ? 'Join the table' : 'Pull up a chair'}</h1>
          <p className="text-ink-2">Everyone plays on their own phone. One of you starts a game; the others join with its code.</p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Heiko" autoComplete="nickname" className={inputClass} name="name" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Room code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
            placeholder="KRTX"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            name="code"
            className={cx(inputClass, 'font-mono tracking-[0.3em]')}
          />
        </label>
        <Button size="lg" disabled={code.length !== 4 || !name.trim() || connecting} onClick={() => client.join(code, name)}>
          Join game {code.length === 4 ? code : ''}
        </Button>
        {!initialCode && (
          <>
            <div className="flex items-center gap-3 text-ink-3">
              <span className="h-px flex-1 bg-holo-line" />
              <span className="label-caps">or</span>
              <span className="h-px flex-1 bg-holo-line" />
            </div>
            <Button size="lg" variant="outline" disabled={!name.trim() || connecting} onClick={create}>
              Start a new game
            </Button>
          </>
        )}
        <p className="mt-auto text-sm text-ink-3">
          Got a TV or laptop? Open <span className="font-mono text-ink-2">/table</span> on it for the big screen.
        </p>
      </div>
    </div>
  );
}

/** At the table, waiting for the host to start. The host adds AI players and starts. */
export function Lobby() {
  const client = useClient();
  const { view, seatId } = useClientState();
  if (!view) return null;
  const isHost = view.hostId === seatId;
  const full = view.seats.length >= 6;
  const url = joinUrl(view.code);

  return (
    <div className="flex h-full flex-col bg-table text-ink">
      <Header code={view.code} />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold">You're at the table</h1>
          <p className="text-ink-2">{isHost ? 'Others join by scanning this code. Fill empty seats with AI players, then start.' : 'Waiting for the host to start the game.'}</p>
        </div>

        <div className="flex items-center gap-4 rounded-panel border border-holo-line bg-panel p-3">
          <Qr text={url} size={112} className="shrink-0 p-2!" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="label-caps">Room code</span>
            <span className="font-mono text-4xl font-bold tracking-[0.2em] text-holo">{view.code}</span>
            <span className="truncate font-mono text-xs text-ink-3">{url.replace(/^https?:\/\//, '')}</span>
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="label-caps">At the table · {view.seats.length} of 6</h2>
          <ul className="flex flex-col overflow-hidden rounded-panel border border-holo-line" data-testid="seats">
            {view.seats.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 border-t border-holo-faint bg-panel px-3 py-2.5 first:border-t-0">
                <PlayerMark slot={(i % 6) as Slot} size={22} />
                <span className={cx('flex-1 font-semibold', !s.connected && 'text-ink-3')}>
                  {s.name}
                  {s.id === seatId && ' (you)'}
                </span>
                <span
                  className={cx(
                    'rounded-chip px-2 py-0.5 font-mono text-[11px] font-bold',
                    s.isAi ? 'bg-holo-soft text-holo' : s.id === view.hostId ? 'bg-warn/15 text-warn' : s.connected ? 'bg-ok/10 text-ok' : 'bg-raised text-ink-3',
                  )}
                >
                  {s.isAi ? 'AI' : s.id === view.hostId ? 'HOST' : s.connected ? 'READY' : 'AWAY'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className={cx('flex items-center gap-3 rounded-panel border px-3 py-3', view.boards > 0 ? 'border-ok/40 bg-ok/5' : 'border-holo-faint bg-panel')}>
          <span aria-hidden className={cx('size-2.5 shrink-0 rounded-full', view.boards > 0 ? 'bg-ok shadow-[0_0_10px_var(--color-ok)]' : 'bg-ink-3')} />
          <span className="text-sm">
            {view.boards > 0 ? (
              <>Big screen connected. Your phone is your private controller.</>
            ) : (
              <>
                No big screen yet. Open{' '}
                <a className="font-mono text-holo underline" href={`/table?room=${view.code}`} target="_blank" rel="noreferrer">
                  /table?room={view.code}
                </a>{' '}
                on a TV or laptop.
              </>
            )}
          </span>
        </div>
      </div>

      <div className="flex gap-3 border-t border-holo-faint bg-void/60 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        {isHost ? (
          <>
            <Button variant="outline" className="flex-1" disabled={full} onClick={() => client.addAi()}>
              Add AI player
            </Button>
            <Button className="flex-[1.4]" disabled={view.seats.length < 2} onClick={() => client.start()}>
              Start game
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="flex-1" onClick={() => client.leave()}>
            Leave table
          </Button>
        )}
      </div>
    </div>
  );
}
