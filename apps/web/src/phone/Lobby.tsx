import { DEFAULT_SPECIES } from '@mule/engine';
import type { TableView } from '@mule/protocol';
import { Button, Creature, cx, PlayerMark, SLOT_COLOR, SPECIES, SPECIES_NAME, SPECIES_PERK, type Slot, type Species } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { joinUrl, Qr } from '../components/Qr';
import { ThemeToggle } from '../components/ThemeToggle';
import { createRoom } from '../net/client';
import { useClient, useClientState } from '../net/react';

function Header() {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-holo-faint px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <span className="font-display text-base font-bold">
        M.U.L.E. <span className="text-holo">Next Gen</span>
      </span>
      <ThemeToggle />
    </div>
  );
}

const inputClass = 'h-11 rounded-control border border-holo-line bg-panel px-3 text-lg text-ink outline-none placeholder:text-ink-3 focus:border-holo';

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
    <Frame>
      <Header />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-6 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-semibold">{initialCode ? 'Join the table' : 'Pull up a chair'}</h1>
          <p className="text-ink-2">Everyone plays on their own phone. One of you starts a game; the others join with its code.</p>
          <p className="mt-auto text-sm text-ink-3">
            Got a TV or laptop? Open <span className="font-mono text-ink-2">/table</span> on it for the big screen.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[3fr_2fr] gap-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="label-caps">Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Heiko" autoComplete="nickname" className={inputClass} name="name" />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="label-caps">Room code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
                placeholder="KRTX"
                autoCapitalize="characters"
                autoComplete="off"
                inputMode="text"
                name="code"
                className={cx(inputClass, 'min-w-0 font-mono tracking-[0.3em]')}
              />
            </label>
          </div>
          <Button size="md" disabled={code.length !== 4 || !name.trim() || connecting} onClick={() => client.join(code, name)}>
            Join game {code.length === 4 ? code : ''}
          </Button>
          {!initialCode && (
            <>
              <div className="flex items-center gap-3 text-ink-3">
                <span className="h-px flex-1 bg-holo-line" />
                <span className="label-caps">or</span>
                <span className="h-px flex-1 bg-holo-line" />
              </div>
              <Button size="md" variant="outline" disabled={!name.trim() || connecting} onClick={create}>
                Start a new game
              </Button>
            </>
          )}
        </div>
      </div>
    </Frame>
  );
}

/** Sideways, clear of the notch and the home bar. */
function Frame({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col bg-table pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-ink">{children}</div>;
}

type SeatView = TableView<unknown>['seats'][number];

/** What a seat plays as: its pick, or until it picks, its seat's default. */
export function seatSpeciesOf(seat: SeatView, index: number): Species {
  return SPECIES.find((sp) => sp === seat.pick) ?? DEFAULT_SPECIES[index % DEFAULT_SPECIES.length]!;
}

/** One species: the creature in your colour, its name. Pressed shows the choice. */
function SpeciesChip({ sp, slot, chosen, onPick }: { sp: Species; slot: Slot; chosen: boolean; onPick: (s: Species) => void }) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={() => onPick(sp)}
      data-testid={`species-${sp}`}
      className={cx(
        'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-control border bg-panel pb-1 pt-1.5',
        chosen ? 'border-holo shadow-glow' : 'border-holo-faint hover:border-holo-line',
      )}
    >
      <Creature species={sp} color={SLOT_COLOR[slot]} size={34} />
      <span className="text-xs font-semibold">{SPECIES_NAME[sp]}</span>
    </button>
  );
}

/** The chosen species' one perk, and a word when someone else at the table has it too. */
function PerkLine({ species, twin }: { species: Species; twin: string | undefined }) {
  return (
    <p className="rounded-control bg-holo-soft px-3 py-1.5 text-sm leading-snug text-ink" data-testid="species-perk">
      <strong>{SPECIES_NAME[species]}.</strong> {SPECIES_PERK[species]}
      {twin !== undefined && <span className="text-ink-2"> {twin} is one too; your colours tell you apart.</span>}
    </p>
  );
}

/** At the table, waiting for the host to start. Everyone picks a species; the host adds AI players and starts. */
export function Lobby() {
  const client = useClient();
  const { view, seatId } = useClientState();
  if (!view) return null;
  const url = joinUrl(view.code);
  const mine = view.seats.findIndex((s) => s.id === seatId);
  const species = view.seats.map(seatSpeciesOf);
  const mySpecies = species[mine];
  const twin = view.seats.find((_, i) => i !== mine && species[i] === mySpecies)?.name;

  return (
    <Frame>
      <Header />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold">You're at the table</h1>
            <span className="text-sm text-ink-3">Change it until the host starts.</span>
          </div>
          {mySpecies && (
            <fieldset className="flex flex-col gap-1.5" data-testid="species-pick">
              <legend className="label-caps mb-1">Pick your species</legend>
              <div className="grid grid-cols-6 gap-1.5">
                {SPECIES.map((sp) => (
                  <SpeciesChip key={sp} sp={sp} slot={(mine % 6) as Slot} chosen={sp === mySpecies} onPick={(p) => client.pick(p)} />
                ))}
              </div>
              <PerkLine species={mySpecies} twin={twin} />
            </fieldset>
          )}
          <div className="mt-auto grid grid-cols-[auto_1fr] items-center gap-2">
            <div className="flex items-center gap-3 rounded-panel border border-holo-line bg-panel p-2" data-testid="room-card">
              <div className="shrink-0" data-testid="room-qr">
                <Qr text={url} size={44} className="p-1.5!" />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="label-caps">Room code</span>
                <span className="font-mono text-2xl font-bold tracking-[0.2em] text-holo" data-testid="room-code">
                  {view.code}
                </span>
              </div>
            </div>
            <BoardStatus code={view.code} boards={view.boards} />
          </div>
        </div>
        <SeatRail table={view} mine={mine} species={species} />
      </div>
    </Frame>
  );
}

/** Whether a big screen shows this table, and how to open one if not. */
function BoardStatus({ code, boards }: { code: string; boards: number }) {
  return (
    <div className={cx('flex items-center gap-3 rounded-panel border px-3 py-1.5', boards > 0 ? 'border-ok/40 bg-ok/5' : 'border-holo-faint bg-panel')} data-testid="board-status">
      <span aria-hidden className={cx('size-2.5 shrink-0 rounded-full', boards > 0 ? 'bg-ok shadow-[0_0_10px_var(--color-ok)]' : 'bg-ink-3')} />
      <span className="text-sm">
        {boards > 0 ? (
          <>Big screen connected. Your phone is your private controller.</>
        ) : (
          <>
            No big screen yet. Open{' '}
            <a className="font-mono text-holo underline" href={`/table?room=${code}`} target="_blank" rel="noreferrer">
              /table?room={code}
            </a>{' '}
            on a TV or laptop.
          </>
        )}
      </span>
    </div>
  );
}

/** The seat rail: everyone at the table as the creature they play, yours among them. The host adds AI players and starts. */
function SeatRail({ table, mine, species }: { table: TableView<unknown>; mine: number; species: Species[] }) {
  const client = useClient();
  const { seatId } = useClientState();
  const isHost = table.hostId === seatId;
  return (
    <div className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40">
      <section className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3">
        <h2 className="label-caps">At the table · {table.seats.length} of 6</h2>
        <ul className="flex flex-col overflow-hidden rounded-panel border border-holo-line" data-testid="seats">
          {table.seats.map((s, i) => {
            const isMine = i === mine;
            return (
              <li key={s.id} className="border-t border-holo-faint bg-panel first:border-t-0">
                <div className="flex items-center gap-2.5 px-2.5 py-1.5" data-testid={isMine ? 'seat-mine' : `seat-${i}`}>
                  <PlayerMark slot={(i % 6) as Slot} species={species[i]} size={isMine ? 22 : 18} />
                  <span className={cx('min-w-0 flex-1 truncate text-left text-sm font-semibold', !s.connected && 'text-ink-3')}>
                    {s.name}
                    {isMine && ' (you)'}
                  </span>
                  <span
                    className={cx(
                      'rounded-chip px-2 py-0.5 font-mono text-[11px] font-bold',
                      s.isAi ? 'bg-holo-soft text-holo' : s.id === table.hostId ? 'bg-warn/15 text-warn' : s.connected ? 'bg-ok/10 text-ok' : 'bg-raised text-ink-3',
                    )}
                  >
                    {s.isAi ? 'AI' : s.id === table.hostId ? 'HOST' : s.connected ? 'READY' : 'AWAY'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 py-2.5">
        {isHost ? (
          <>
            <Button size="md" variant="outline" disabled={table.seats.length >= 6} onClick={() => client.addAi()} data-testid="add-ai">
              Add AI player
            </Button>
            <Button size="md" disabled={table.seats.length < 2} onClick={() => client.start()} data-testid="start-game">
              Start game
            </Button>
          </>
        ) : (
          <Button size="md" variant="ghost" onClick={() => client.leave()}>
            Leave table
          </Button>
        )}
      </div>
    </div>
  );
}
