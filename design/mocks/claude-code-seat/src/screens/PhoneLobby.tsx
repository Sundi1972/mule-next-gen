import { Button, COLOUR_NAME, Creature, cx, SLOT_COLOR, SPECIES, SPECIES_NAME, SPECIES_PERK } from '@mule/ui';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { joinUrl, Qr } from '../../../../../apps/web/src/components/Qr';
import { ThemeToggle } from '../../../../../apps/web/src/components/ThemeToggle';
import { NowCard, type Now } from '../../../../../apps/web/src/phone/Shell';
import { HOST, JOIN_CODES, ME, ROOM, SEATS, type LobbyLink, type MockSeat } from '../fixture';
import { Chip, ClaudeSetup, KindChoice, LOBBY_CHIP, type ChipWord, type ComputerKind } from '../parts';

/*
 * GRAFT TARGET: apps/web/src/phone/Lobby.tsx (SeatRow, the rail, the Dialog). The stage and every row that is not a
 * computer seat are Lobby.tsx's own, copied for context; what is new is the computer seat's row and what it opens.
 */

export type Variant = 'A' | 'B';
export type Viewer = 'host' | 'guest';
/** Juno, the computer seat: built-in, or Claude waiting for its chat, or connected. */
export type JunoState = 'builtin' | LobbyLink;

const kindOf = (s: JunoState): ComputerKind => (s === 'builtin' ? 'builtin' : 'claude');

function chipFor(seat: MockSeat, state: JunoState): ChipWord {
  if (seat.kind === 'phone') return seat.id === HOST ? 'HOST' : 'PHONE';
  return state === 'builtin' ? 'AI' : LOBBY_CHIP[state];
}

export function PhoneLobby({
  variant,
  viewer,
  juno,
  onJuno,
  sheetOpen = false,
}: {
  variant: Variant;
  viewer: Viewer;
  juno: JunoState;
  onJuno: (s: JunoState) => void;
  sheetOpen?: boolean;
}) {
  const host = viewer === 'host';
  const me = host ? SEATS.find((s) => s.id === ME)! : SEATS.find((s) => s.id === 'kai')!;
  // Brix, the other computer seat, keeps its own state here; Juno's is the page's state switcher.
  const [brix, setBrix] = useState<JunoState>('builtin');
  const stateOf = (id: string): JunoState => (id === 'juno' ? juno : brix);
  const [expanded, setExpanded] = useState<string | null>(juno === 'waiting' ? 'juno' : null);
  const [sheet, setSheet] = useState<string | null>(sheetOpen ? 'juno' : null);
  useEffect(() => {
    if (juno === 'waiting') setExpanded('juno');
  }, [juno]);
  const now: Now = host
    ? { step: 2, of: 2, title: 'Start when everyone is here', detail: `${SEATS.length} at the table. Others join with the code ${ROOM} or the QR below.` }
    : { step: 1, of: 2, title: 'Make your colonist', detail: 'Pick a species and a colour. Lena, the host, starts the game when everyone is here.' };
  const pick = (id: string) => (k: ComputerKind) => {
    const next: JunoState = k === 'builtin' ? 'builtin' : 'waiting';
    if (id === 'juno') onJuno(next);
    else setBrix(next);
    setExpanded(id);
  };

  return (
    <div className="h-full @container/shell">
      <div className="relative flex h-full bg-table text-ink" data-testid="lobby" data-variant={variant} data-viewer={viewer}>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
          <header className="flex items-center gap-3">
            <span className="font-display text-sm font-semibold">
              M.U.L.E. <span className="text-holo">Next Gen</span>
            </span>
            <span className="ml-auto font-mono text-xs text-ink-3">ROOM {ROOM}</span>
            <ThemeToggle iconUntilWide />
          </header>
          <div className="flex min-h-0 flex-1 gap-3">
            <ColonistHero seat={me} />
            <SpeciesStage seat={me} />
          </div>
        </main>
        <aside className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40" data-testid="guide">
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5">
            <NowCard now={now} />
            <section className="flex flex-col gap-1.5">
              <h2 className="label-caps">At the table · {SEATS.length} of 6</h2>
              <ul className="flex flex-col overflow-hidden rounded-panel border border-holo-line" data-testid="seats">
                {SEATS.map((s) =>
                  s.kind === 'phone' ? (
                    <PersonRow key={s.id} seat={s} me={s.id === me.id} chip={chipFor(s, 'builtin')} kick={host && s.id !== me.id} />
                  ) : variant === 'A' ? (
                    <ComputerRowA
                      key={s.id}
                      seat={s}
                      juno={stateOf(s.id)}
                      host={host}
                      open={expanded === s.id}
                      onToggle={() => setExpanded((e) => (e === s.id ? null : s.id))}
                      onPick={pick(s.id)}
                    />
                  ) : (
                    <ComputerRowB key={s.id} seat={s} juno={stateOf(s.id)} host={host} onOpen={() => setSheet(s.id)} />
                  ),
                )}
              </ul>
            </section>
            <JoinCard />
            {host && (
              <section className="flex flex-col gap-1 border-t border-holo-faint pt-2" data-testid="host-tools">
                <span className="label-caps">You host this table</span>
                <button type="button" className="min-h-8 text-left text-sm text-holo underline-offset-2 hover:underline" data-testid="host-to-phone">
                  Move the host to my phone…
                </button>
                <button type="button" className="min-h-8 text-left text-sm text-alert underline-offset-2 hover:underline" data-testid="close-room">
                  Close the room…
                </button>
              </section>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 py-2.5">
            {host ? (
              <>
                <Button size="md" variant="outline" data-testid="add-ai">
                  Add AI player
                </Button>
                <Button size="md" data-testid="start-game">
                  Start game · {SEATS.length} players
                </Button>
              </>
            ) : (
              <>
                <span className="text-center text-sm text-ink-2">Waiting for Lena to start…</span>
                <Button size="md" variant="ghost" data-testid="leave-table">
                  Leave table
                </Button>
              </>
            )}
          </div>
        </aside>
        {variant === 'B' && host && sheet && <SeatSheet seat={SEATS.find((s) => s.id === sheet)!} juno={stateOf(sheet)} onPick={pick(sheet)} onClose={() => setSheet(null)} />}
      </div>
    </div>
  );
}

function PersonRow({ seat, me, chip, kick }: { seat: MockSeat; me: boolean; chip: ChipWord; kick: boolean }) {
  return (
    <li className="flex items-center gap-2 border-t border-holo-faint bg-panel px-2 py-1 first:border-t-0" data-testid={`seat-${seat.id}`}>
      <SeatCreature seat={seat} />
      <span className="min-w-0 flex-1 text-sm font-semibold break-words">
        {seat.name}
        {me && ' (you)'}
      </span>
      <Chip word={chip} testid={`chip-${seat.id}`} />
      {kick && <KickButton seat={seat} />}
    </li>
  );
}

function SeatCreature({ seat }: { seat: MockSeat }) {
  return (
    <span role="img" aria-label={SPECIES_NAME[seat.species]} className="shrink-0">
      <Creature species={seat.species} color={SLOT_COLOR[seat.slot]} size={22} />
    </span>
  );
}

function KickButton({ seat }: { seat: MockSeat }) {
  return (
    <button type="button" className="grid size-8 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-alert/10 hover:text-alert" aria-label={`Remove ${seat.name}`} data-testid={`kick-${seat.id}`}>
      ✕
    </button>
  );
}

/** "Claude" under a Claude seat's name, for everyone at the table; a built-in seat keeps today's row. */
function Plays({ juno, host }: { juno: JunoState; host: boolean }) {
  if (juno === 'builtin') return null;
  return (
    <>
      <span className="block text-[10px] font-normal leading-tight text-ink-3">Claude</span>
      {/* Start stays enabled while the seat waits; the host is told what happens if they start now. */}
      {host && juno === 'waiting' && (
        <span className="block text-[10px] font-normal leading-tight text-ink-2" data-testid="waiting-note">
          Plays its built-in plan until Claude joins
        </span>
      )}
    </>
  );
}

/**
 * Variant A: the host taps the seat and it opens in place, in the rail. Waiting opens it, since the code is what the
 * host needs next; once Claude is connected it stays shut until tapped.
 */
function ComputerRowA({ seat, juno, host, open, onToggle, onPick }: { seat: MockSeat; juno: JunoState; host: boolean; open: boolean; onToggle: () => void; onPick: (k: ComputerKind) => void }) {
  const chip = <Chip word={chipFor(seat, juno)} testid={`chip-${seat.id}`} />;
  if (!host)
    return (
      <li className="flex items-center gap-2 border-t border-holo-faint bg-panel px-2 py-1 first:border-t-0" data-testid={`seat-${seat.id}`}>
        <SeatCreature seat={seat} />
        <span className="min-w-0 flex-1 text-sm font-semibold break-words">
          {seat.name}
          <Plays juno={juno} host={host} />
        </span>
        {chip}
        {host && <KickButton seat={seat} />}
      </li>
    );
  return (
    <li className={cx('flex flex-col border-t border-holo-faint first:border-t-0', open ? 'bg-holo-soft' : 'bg-panel')} data-testid={`seat-${seat.id}`}>
      <div className="flex items-center gap-2 px-2 py-1">
        <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left" data-testid={`seat-${seat.id}-toggle`}>
          <SeatCreature seat={seat} />
          <span className="min-w-0 flex-1 text-sm font-semibold break-words">
            {seat.name}
            <Plays juno={juno} host={host} />
          </span>
          {chip}
          <svg aria-hidden viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={cx('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <KickButton seat={seat} />
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t border-holo-faint px-2 pb-2 pt-1.5" data-testid={`seat-${seat.id}-panel`}>
          {juno === 'builtin' ? (
            <KindChoice value="builtin" onChange={onPick} testid={`kind-${seat.id}`} />
          ) : (
            <>
              <ClaudeSetup code={JOIN_CODES[seat.id]!} testid={`setup-${seat.id}`} />
              <SwitchToBuiltin seat={seat} onPress={() => onPick('builtin')} />
            </>
          )}
        </div>
      )}
    </li>
  );
}

function SwitchToBuiltin({ seat, onPress }: { seat: MockSeat; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} className="min-h-8 self-start text-left text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline" data-testid={`switch-builtin-${seat.id}`}>
      Switch {seat.name} to Built-in <span className="text-ink-3">· this code stops working</span>
    </button>
  );
}

/** Variant B: the row stays one line; the host's Code button opens the seat's sheet. */
function ComputerRowB({ seat, juno, host, onOpen }: { seat: MockSeat; juno: JunoState; host: boolean; onOpen: () => void }) {
  return (
    <li className="flex items-center gap-2 border-t border-holo-faint bg-panel px-2 py-1 first:border-t-0" data-testid={`seat-${seat.id}`}>
      <SeatCreature seat={seat} />
      <span className="min-w-0 flex-1 text-sm font-semibold break-words">
        {seat.name}
        <Plays juno={juno} host={host} />
      </span>
      <Chip word={chipFor(seat, juno)} testid={`chip-${seat.id}`} />
      {host && (
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          className="grid h-8 shrink-0 place-items-center rounded-chip border border-holo-line px-2 text-xs font-semibold text-holo hover:border-holo"
          data-testid={`seat-${seat.id}-open`}
        >
          {juno === 'builtin' ? 'Change' : 'Code'}
        </button>
      )}
      {host && <KickButton seat={seat} />}
    </li>
  );
}

/** Variant B's sheet, over the whole lobby as Lobby.tsx's own dialog is. */
function SeatSheet({ seat, juno, onPick, onClose }: { seat: MockSeat; juno: JunoState; onPick: (k: ComputerKind) => void; onClose: () => void }) {
  const titleId = useId();
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-void/70 p-4" role="dialog" aria-modal aria-labelledby={titleId} data-testid="seat-sheet">
      <div className="flex w-full max-w-[640px] flex-col gap-3 rounded-sheet border-2 border-holo bg-panel p-4 shadow-glow">
        <header className="flex items-center gap-2">
          <SeatCreature seat={seat} />
          <h2 id={titleId} className="font-display text-xl font-semibold">
            {juno === 'builtin' ? `Who plays ${seat.name}?` : `${seat.name} plays with Claude`}
          </h2>
          {juno !== 'builtin' && <Chip word={LOBBY_CHIP[juno]} className="ml-auto" testid="sheet-chip" />}
        </header>
        {juno === 'builtin' ? (
          <KindChoice value="builtin" onChange={onPick} testid="sheet-kind" />
        ) : (
          <>
            <p className="text-sm text-ink-2">Send the invite to whoever's Claude should play: yours, or a friend's. The code is this seat's for the whole game.</p>
            <ClaudeSetup code={JOIN_CODES[seat.id]!} testid="sheet-setup" />
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          {juno !== 'builtin' ? (
            <Button size="md" variant="ghost" onClick={() => onPick('builtin')} data-testid="sheet-switch-builtin">
              Switch to Built-in
            </Button>
          ) : (
            <span />
          )}
          <Button size="md" variant="outline" autoFocus onClick={onClose} data-testid="sheet-done">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function ColonistHero({ seat }: { seat: MockSeat }) {
  return (
    <section className="flex w-[150px] shrink-0 flex-col items-center justify-center gap-1 rounded-sheet border border-holo-line bg-panel p-2 text-center" data-testid="hero">
      <Creature species={seat.species} color={SLOT_COLOR[seat.slot]} size={72} />
      <span className="font-display text-lg font-semibold leading-tight">{seat.name}</span>
      <span className="label-caps text-[10px]!">
        {SPECIES_NAME[seat.species]} · {COLOUR_NAME[seat.slot]}
      </span>
      <p className="text-[11px] leading-snug text-ink-2">{SPECIES_PERK[seat.species]}</p>
    </section>
  );
}

function SpeciesStage({ seat }: { seat: MockSeat }) {
  return (
    <fieldset className="flex min-w-0 flex-1 flex-col gap-1" data-testid="species-pick">
      <legend className="label-caps mb-1">Species</legend>
      <div className="grid grid-cols-3 gap-1">
        {SPECIES.map((sp) => (
          <Tile key={sp} on={sp === seat.species} testid={`species-${sp}`}>
            <Creature species={sp} color={SLOT_COLOR[seat.slot]} size={30} />
            <span className="text-[11px] font-semibold">{SPECIES_NAME[sp]}</span>
          </Tile>
        ))}
      </div>
    </fieldset>
  );
}

function Tile({ on, testid, children }: { on: boolean; testid: string; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} data-testid={testid} className={cx('flex flex-col items-center gap-0.5 rounded-control border bg-panel px-1 py-1', on ? 'border-2 border-holo bg-holo-soft shadow-glow' : 'border-holo-line')}>
      {children}
    </button>
  );
}

function JoinCard() {
  return (
    <section className="flex items-center gap-2 rounded-panel border border-holo-line bg-panel p-1.5" data-testid="room-card">
      <Qr text={joinUrl(ROOM)} size={44} className="p-1!" />
      <span className="flex flex-col">
        <span className="label-caps text-[10px]!">Join with</span>
        <span className="font-mono text-xl font-bold tracking-[0.2em] text-holo" data-testid="room-code">
          {ROOM}
        </span>
      </span>
    </section>
  );
}
