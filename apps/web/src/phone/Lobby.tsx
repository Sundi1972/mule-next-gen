import type { TableView } from '@mule/protocol';
import { Button, COLOUR_NAME, Creature, cx, SLOT_COLOR, SPECIES, SPECIES_NAME, SPECIES_PERK, type Slot, type Species } from '@mule/ui';
import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { joinUrl, Qr } from '../components/Qr';
import { ThemeToggle } from '../components/ThemeToggle';
import { lobbySeatSpecies } from '../game/derive';
import { createRoom } from '../net/client';
import { useClient, useClientState } from '../net/react';
import { codeState, HandoffCode } from './HandoffCode';
import { NowCard, WIDE_PX, type Now } from './Shell';

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
  const { status, notice } = useClientState();
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
          {notice && (
            <p role="status" className="rounded-control border border-warn/40 bg-warn/10 px-3 py-1.5 text-sm font-semibold text-ink" data-testid="removed-notice">
              {notice}
            </p>
          )}
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

/** A seat as the lobby draws it: its species (picked or the default) and its colour. */
type Colonist = TableView<unknown>['seats'][number] & { species: Species; slot: Slot };

/** The host's two confirmations, and anyone's move to their phone. */
type LobbyDialog = { kick: string } | 'close' | 'handoff';

const COLOURS: Slot[] = [0, 1, 2, 3, 4, 5];

/** A seat's colour as a slot. RULE-7 keeps it in the palette; anything else is a broken contract, not a colour. */
function slotOf(color: number): Slot {
  if (!COLOURS.includes(color as Slot)) throw new Error(`Seat colour ${color} is outside the palette`);
  return color as Slot;
}

/**
 * Whether the shell is at least WIDE_PX wide (HC-8), measured before paint and on every resize. CSS sizes everything
 * else; this decides only where the join card sits in the markup, so screen readers meet it where it is shown.
 */
function useShellWide() {
  const [shell, setShell] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    if (!shell) return;
    setWide(shell.getBoundingClientRect().width >= WIDE_PX);
    const ro = new ResizeObserver(([e]) => flushSync(() => setWide((e?.contentRect.width ?? 0) >= WIDE_PX)));
    ro.observe(shell);
    return () => ro.disconnect();
  }, [shell]);
  return [setShell, wide] as const;
}

/**
 * At the table before the game: make your colonist (species and colour) on the stage; the rail is the table, with
 * who is here and, for the host, add AI, remove a seat, close the room and start. Wide from a shell of 1100 px (HC-8).
 */
export function Lobby() {
  const client = useClient();
  const { view, seatId } = useClientState();
  const [asked, setAsked] = useState<LobbyDialog | null>(null);
  // The room keeps no record of a colour being chosen, only the colour itself.
  const [pickedColour, setPickedColour] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const [shellRef, wide] = useShellWide();
  const me = view?.seats.find((s) => s.id === seatId);
  if (!view || !me) return null;
  const seats: Colonist[] = view.seats.map((s, i) => ({ ...s, species: lobbySeatSpecies(s, i), slot: slotOf(s.color) }));
  const mine = seats.find((s) => s.id === me.id)!;
  const host = view.hostId === me.id;
  const hostName = seats.find((s) => s.id === view.hostId)?.name ?? 'The host';
  const tv = view.boards > 0;
  // Only the host confirms a removal; a seat that left while the host was deciding has nothing left to remove.
  const dialog = asked === null || asked === 'handoff' || (host && (asked === 'close' || seats.some((s) => s.id === asked.kick))) ? asked : null;
  const ask = (d: LobbyDialog, from: HTMLElement) => {
    opener.current = from;
    setAsked(d);
  };
  const closeDialog = () => {
    setAsked(null);
    opener.current?.focus();
  };
  const humans = seats.filter((s) => !s.isAi).length;
  const waiting = !host && (me.pick !== undefined || pickedColour);
  const now: Now = host
    ? {
        step: 2,
        of: 2,
        title: seats.length < 2 ? 'Wait for players, or add an AI' : 'Start when everyone is here',
        detail: (
          <>
            <span className="@min-[1100px]/shell:hidden">
              {seats.length} at the table. Others join with the code {view.code} or the QR below.
            </span>
            <span className="hidden @min-[1100px]/shell:inline">
              {seats.length} at the table, {humans} on phones. Others join with the code {view.code} or the QR. Everyone can change their colonist until you start.
            </span>
          </>
        ),
      }
    : waiting
      ? { step: 2, of: 2, title: `Wait for ${hostName} to start`, detail: `You can change your colonist until ${hostName} starts the game.` }
      : { step: 1, of: 2, title: 'Make your colonist', detail: `Pick a species and a colour. ${hostName}, the host, starts the game when everyone is here.` };
  const joinCard = <JoinCard code={view.code} compact={tv} />;
  // With no big screen the card is the only way in, so on a phone it comes first, under Now.
  const joinFirst = !tv && !wide;

  return (
    <div ref={shellRef} className="h-full @container/shell">
      <div className="relative flex h-full bg-table pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-ink" data-testid="lobby">
        <h1 className="sr-only">You're at the table</h1>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5 @min-[1100px]/shell:gap-6 @min-[1100px]/shell:p-8">
          <header className="flex items-center gap-3">
            <span className="font-display text-sm font-semibold @min-[1100px]/shell:text-lg">
              M.U.L.E. <span className="text-holo">Next Gen</span>
            </span>
            <span className="ml-auto font-mono text-xs text-ink-3 @min-[1100px]/shell:text-sm">ROOM {view.code}</span>
            <ThemeToggle />
          </header>
          <div className="flex min-h-0 flex-1 gap-3 @min-[1100px]/shell:gap-8">
            <ColonistHero seat={mine} />
            <div className="flex min-w-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-6">
              <Picker label="Species">
                <SpeciesPick me={mine} onPick={(sp) => client.pick(sp)} />
              </Picker>
              <Picker label="Colour">
                <ColourPick
                  seats={seats}
                  me={mine}
                  onPick={(c) => {
                    setPickedColour(true);
                    client.color(c);
                  }}
                />
              </Picker>
            </div>
          </div>
        </main>
        <aside className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40 @min-[1100px]/shell:w-[400px]" data-testid="guide">
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5 @min-[1100px]/shell:gap-4 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-5">
            <NowCard now={now} />
            {joinFirst && joinCard}
            <section className="flex flex-col gap-1.5">
              <h2 className="label-caps @min-[1100px]/shell:text-xs!">At the table · {seats.length} of 6</h2>
              <ul className="flex flex-col overflow-hidden rounded-panel border border-holo-line" data-testid="seats">
                {seats.map((s) => (
                  <SeatRow key={s.id} seat={s} me={s.id === me.id} host={s.id === view.hostId} onKick={host && s.id !== me.id ? (e) => ask({ kick: s.id }, e.currentTarget) : undefined} />
                ))}
              </ul>
            </section>
            {!joinFirst && joinCard}
            {!host && (
              <button type="button" className="text-left text-sm text-holo underline-offset-2 hover:underline" onClick={(e) => ask('handoff', e.currentTarget)} data-testid="move-to-phone">
                Playing on a laptop? Move to my phone…
              </button>
            )}
            {host && (
              <section className="flex flex-col gap-1 border-t border-holo-faint pt-2 @min-[1100px]/shell:pt-3" data-testid="host-tools">
                <span className="label-caps @min-[1100px]/shell:text-xs!">You host this table</span>
                <button type="button" className="text-left text-sm text-holo underline-offset-2 hover:underline" onClick={(e) => ask('handoff', e.currentTarget)} data-testid="host-to-phone">
                  Move the host to my phone…
                </button>
                <button type="button" className="text-left text-sm text-alert underline-offset-2 hover:underline" onClick={(e) => ask('close', e.currentTarget)} data-testid="close-room">
                  Close the room…
                </button>
              </section>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 py-2.5 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-4">
            {host ? (
              <>
                <Button size="md" variant="outline" disabled={seats.length >= 6} onClick={() => client.addAi()} data-testid="add-ai">
                  Add AI player
                </Button>
                <Button size="md" className="@min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" disabled={seats.length < 2} onClick={() => client.start()} data-testid="start-game">
                  Start game · {seats.length} players
                </Button>
              </>
            ) : (
              <>
                {!waiting && <span className="text-center text-sm text-ink-2">Waiting for {hostName} to start…</span>}
                <Button size="md" variant="ghost" onClick={() => client.leave()}>
                  Leave table
                </Button>
              </>
            )}
          </div>
        </aside>
        {dialog && (
          <Dialog
            dialog={dialog}
            seats={seats}
            me={mine}
            host={host}
            code={view.code}
            onCancel={closeDialog}
            onConfirm={() => {
              closeDialog();
              if (dialog === 'close') client.closeTable();
              else if (dialog !== 'handoff') client.kick(dialog.kick);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** You, large: the stage of the lobby. On a phone it is a narrow column; on a laptop the hero of the page. */
function ColonistHero({ seat }: { seat: Colonist }) {
  return (
    <section className="flex w-[150px] shrink-0 flex-col items-center justify-center gap-1 rounded-sheet border border-holo-line bg-panel p-2 text-center @min-[1100px]/shell:w-[360px] @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-8" data-testid="hero">
      <span className="grid place-items-center rounded-full" style={{ background: `radial-gradient(circle, ${SLOT_COLOR[seat.slot]}33 0%, transparent 70%)` }}>
        <Creature species={seat.species} color={SLOT_COLOR[seat.slot]} size={72} className="@min-[1100px]/shell:hidden" />
        <Creature species={seat.species} color={SLOT_COLOR[seat.slot]} size={200} className="hidden @min-[1100px]/shell:block" />
      </span>
      <span className="font-display text-lg font-semibold leading-tight @min-[1100px]/shell:text-4xl" data-testid="hero-name">
        {seat.name}
      </span>
      <span className="label-caps text-[10px]! @min-[1100px]/shell:text-sm!">
        {SPECIES_NAME[seat.species]} · {COLOUR_NAME[seat.slot]}
      </span>
      <p className="text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:text-lg" data-testid="hero-perk">
        {SPECIES_PERK[seat.species]}
      </p>
    </section>
  );
}

function Picker({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1 @min-[1100px]/shell:gap-3">
      <legend className="label-caps mb-1 @min-[1100px]/shell:text-sm!">{label}</legend>
      {children}
    </fieldset>
  );
}

/** The six species, each with its perk visible on a laptop, drawn in your colour. */
function SpeciesPick({ me, onPick }: { me: Colonist; onPick: (sp: Species) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1 @min-[1100px]/shell:grid-cols-3 @min-[1100px]/shell:gap-3" data-testid="species-pick">
      {SPECIES.map((sp) => (
        <button
          key={sp}
          type="button"
          aria-pressed={sp === me.species}
          onClick={() => onPick(sp)}
          className={cx(
            'flex flex-col items-center gap-0.5 rounded-control border bg-panel px-1 py-1 text-center @min-[1100px]/shell:flex-row @min-[1100px]/shell:items-start @min-[1100px]/shell:gap-3 @min-[1100px]/shell:p-3 @min-[1100px]/shell:text-left',
            sp === me.species ? 'border-2 border-holo bg-holo-soft shadow-glow' : 'border-holo-line hover:border-holo',
          )}
          data-testid={`species-${sp}`}
        >
          <Creature species={sp} color={SLOT_COLOR[me.slot]} size={30} className="@min-[1100px]/shell:hidden" />
          <Creature species={sp} color={SLOT_COLOR[me.slot]} size={56} className="hidden shrink-0 @min-[1100px]/shell:block" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] font-semibold @min-[1100px]/shell:font-display @min-[1100px]/shell:text-lg">{SPECIES_NAME[sp]}</span>
            <span className="hidden text-sm leading-snug text-ink-2 @min-[1100px]/shell:block">{SPECIES_PERK[sp]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** The six colours. A person's colour is theirs; an AI's you can take, and the AI moves to another (RULE-7). */
function ColourPick({ seats, me, onPick }: { seats: Colonist[]; me: Colonist; onPick: (c: Slot) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 @min-[1100px]/shell:gap-3" data-testid="colour-pick">
      {COLOURS.map((c) => {
        const owner = seats.find((s) => s.slot === c && s.id !== me.id);
        const mine = c === me.slot;
        const locked = !!owner && !owner.isAi;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={mine}
            aria-label={!owner ? COLOUR_NAME[c] : locked ? `${COLOUR_NAME[c]}, taken by ${owner.name}` : `${COLOUR_NAME[c]}, ${owner.name}'s: tap to take it`}
            disabled={locked}
            onClick={() => onPick(c)}
            className={cx(
              'flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:py-1 @min-[1100px]/shell:pl-1 @min-[1100px]/shell:pr-3',
              mine ? 'border-2 border-holo bg-holo-soft' : locked ? 'border-holo-faint opacity-60' : 'border-holo-line hover:border-holo',
            )}
            data-testid={`colour-${c}`}
          >
            <span className="grid size-6 place-items-center rounded-full @min-[1100px]/shell:size-9" style={{ background: SLOT_COLOR[c] }}>
              {owner && <Creature species={owner.species} color="#ffffff" size={18} />}
              {mine && <span className="font-bold text-white">✓</span>}
            </span>
            <span className="text-[11px] font-semibold @min-[1100px]/shell:text-base">{COLOUR_NAME[c]}</span>
            {owner && <span className="hidden text-sm text-ink-3 @min-[1100px]/shell:inline">{owner.name}</span>}
          </button>
        );
      })}
    </div>
  );
}

const CHIP_CLASS = { AI: 'bg-holo-soft text-holo', HOST: 'bg-warn/15 text-warn', PHONE: 'bg-ok/10 text-ok', AWAY: 'bg-warn/15 text-warn' } as const;

/** One seat in the rail: its creature in its colour, its name, what it is (AWAY when its phone has gone), and the host's ✕. */
function SeatRow({ seat, me, host, onKick }: { seat: Colonist; me: boolean; host: boolean; onKick: ((e: MouseEvent<HTMLButtonElement>) => void) | undefined }) {
  const kind = seat.isAi ? 'AI' : host ? 'HOST' : seat.connected ? 'PHONE' : 'AWAY';
  return (
    <li className="flex items-center gap-2 border-t border-holo-faint bg-panel px-2 py-1 first:border-t-0 @min-[1100px]/shell:gap-3 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2">
      <span role="img" aria-label={SPECIES_NAME[seat.species]} className="shrink-0">
        <Creature species={seat.species} color={SLOT_COLOR[seat.slot]} size={22} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold @min-[1100px]/shell:text-base">
        {seat.name}
        {me && ' (you)'}
      </span>
      <span className={cx('rounded-chip px-1.5 font-mono text-[10px] font-bold', CHIP_CLASS[kind])}>{kind}</span>
      {onKick && (
        <button
          type="button"
          className="grid size-7 place-items-center rounded-control text-ink-3 hover:bg-alert/10 hover:text-alert"
          aria-label={`Remove ${seat.name}`}
          onClick={onKick}
          data-testid={`kick-${seat.id}`}
        >
          ✕
        </button>
      )}
    </li>
  );
}

// The QR's footprint with its padding: 52 px beside a big screen, 104 px without one (B-AC-4 asks for at least 100), 112 px on a laptop.
const COMPACT_QR = 44;
const BIG_QR = 88;
const WIDE_QR = 96;

/** How the others join: the room's QR and code. With no big screen it is the only QR at the table, so it is drawn big. */
function JoinCard({ code, compact }: { code: string; compact: boolean }) {
  const url = joinUrl(code);
  return (
    <section className="flex items-center gap-2 rounded-panel border border-holo-line bg-panel p-1.5 @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-3" data-testid="room-card">
      <span className="shrink-0" data-testid="room-qr">
        <Qr text={url} size={compact ? COMPACT_QR : BIG_QR} className={cx(compact ? 'p-1!' : 'p-2!', '@min-[1100px]/shell:hidden')} />
        <span className="hidden @min-[1100px]/shell:block">
          <Qr text={url} size={WIDE_QR} className="p-2!" />
        </span>
      </span>
      <span className="flex flex-col">
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Join with</span>
        <span className="font-mono text-xl font-bold tracking-[0.2em] text-holo @min-[1100px]/shell:text-4xl" data-testid="room-code">
          {code}
        </span>
      </span>
    </section>
  );
}

/** The lobby's dialog, over the whole screen: the host's confirmations, which send nothing until confirmed, or the move to a phone. */
function Dialog({
  dialog,
  seats,
  me,
  host,
  code,
  onConfirm,
  onCancel,
}: {
  dialog: LobbyDialog;
  seats: Colonist[];
  me: Colonist;
  host: boolean;
  code: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  let body: ReactNode;
  if (dialog === 'handoff') body = <Handoff titleId={titleId} name={me.name} host={host} code={code} onDone={onCancel} />;
  else if (dialog === 'close')
    body = (
      <>
        <h2 id={titleId} className="font-display text-xl font-semibold @min-[1100px]/shell:text-3xl">
          Close the room?
        </h2>
        <p className="text-sm text-ink-2 @min-[1100px]/shell:text-lg">Everyone at the table goes back to the start screen. The code {code} stops working.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button size="md" variant="outline" autoFocus onClick={onCancel} data-testid="host-dialog-cancel">
            Keep it open
          </Button>
          <Button size="md" variant="danger" onClick={onConfirm} data-testid="close-confirm">
            Close the room
          </Button>
        </div>
      </>
    );
  else {
    const s = seats.find((x) => x.id === dialog.kick)!;
    body = (
      <>
        <h2 id={titleId} className="font-display text-xl font-semibold @min-[1100px]/shell:text-3xl">
          Remove {s.name}?
        </h2>
        <p className="text-sm text-ink-2 @min-[1100px]/shell:text-lg">{s.isAi ? 'The AI leaves the table.' : `${s.name}'s phone goes back to the start screen. They can join again with the code.`}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button size="md" variant="outline" autoFocus onClick={onCancel} data-testid="host-dialog-cancel">
            Keep {s.isAi ? 'it' : s.name}
          </Button>
          <Button size="md" variant="danger" onClick={onConfirm} data-testid="kick-confirm">
            Remove
          </Button>
        </div>
      </>
    );
  }
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-void/70 p-4" role="dialog" aria-modal aria-labelledby={titleId} data-testid="host-dialog">
      <div className="flex max-w-[560px] flex-col gap-3 rounded-sheet border-2 border-holo bg-panel p-4 shadow-glow @min-[1100px]/shell:max-w-[720px] @min-[1100px]/shell:gap-5 @min-[1100px]/shell:p-8">{body}</div>
    </div>
  );
}

/**
 * The one-time link that moves this seat to another device. The code lives as long as this body: asked for when it
 * opens, forgotten however it goes (Done, Escape, or the lobby leaving).
 */
function Handoff({ titleId, name, host, code, onDone }: { titleId: string; name: string; host: boolean; code: string; onDone: () => void }) {
  const client = useClient();
  const { handoffCode } = useClientState();
  useEffect(() => {
    client.handoff();
    return () => client.closeHandoff();
  }, [client]);
  return (
    <>
      <h2 id={titleId} className="font-display text-xl font-semibold @min-[1100px]/shell:text-3xl">
        {host ? 'Move the host to your phone' : 'Move to your phone'}
      </h2>
      <div className="flex items-center gap-4">
        <HandoffCode url={handoffCode ? joinUrl(code, handoffCode.code) : ''} state={codeState(handoffCode)} onRenew={() => client.handoff()} />
        <p className="text-sm text-ink-2 @min-[1100px]/shell:text-lg">
          Scan this with your phone. It becomes{' '}
          <strong className="text-ink">
            you, {name}
            {host ? ', the host' : ''}
          </strong>
          , with your colonist. This screen then steps aside. The code works once, for 2 minutes.
        </p>
      </div>
      <Button size="md" variant="outline" autoFocus onClick={onDone}>
        Done
      </Button>
    </>
  );
}
