import { Button, Creature, cx, SLOT_COLOR, SPECIES, SPECIES_NAME, SPECIES_PERK, type Slot, type Species } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { Qr } from '../../../../../apps/web/src/components/Qr';
import { ThemeToggle } from '../../../../../apps/web/src/components/ThemeToggle';
import { NowCard, type Now } from '../proposed/GameShell';

/**
 * Responsive redesign: the lobby as "make your colonist" (Heiko 2026-10-22:
 * "a narrow form on a huge empty page"; "use the space"; pick a colour as well
 * as a species; host functions).
 *
 * The stage is you: your creature large, in your colour, with what your
 * species is good at. Below it the six species, each with its perk visible
 * (no need to tap one to learn it), and the six colours, a taken colour
 * showing whose it is. The rail is the table: who is here, and for the host
 * add AI, remove a player, close the room and move the host to their phone.
 *
 * WS4 builds the colour pick, remove, close and host hand-off; this mock only
 * places them. Graft target: apps/web/src/phone/Lobby.tsx.
 */

interface Seat {
  id: string;
  name: string;
  species: Species;
  colour: Slot;
  ai: boolean;
  away?: boolean;
}

const SEATS: Seat[] = [
  { id: 'heiko', name: 'Heiko', species: 'zipwing', colour: 0, ai: false },
  { id: 'acc', name: 'The Accountant', species: 'gearling', colour: 1, ai: true },
  { id: 'lena', name: 'Lena', species: 'bramblet', colour: 2, ai: false },
  { id: 'baron', name: 'The Baron', species: 'mollox', colour: 3, ai: true },
];
const CODE = 'MTWR';
/** Names for the six player colours (theme --color-p1..p6). DS-GAP: the names belong beside SLOT_COLOR in @mule/ui. */
const COLOUR_NAME: Record<Slot, string> = { 0: 'Ember', 1: 'Cobalt', 2: 'Jade', 3: 'Sun', 4: 'Violet', 5: 'Rose' };

export type LobbyState = 'guest' | 'host' | 'handoff' | 'kick' | 'close';

export function LobbyColonist({ state }: { state: LobbyState }) {
  const host = state !== 'guest';
  const meId = host ? 'heiko' : 'lena';
  const [seats, setSeats] = useState(SEATS);
  const [dialog, setDialog] = useState<null | 'handoff' | 'close' | { kick: string }>(state === 'handoff' ? 'handoff' : state === 'close' ? 'close' : state === 'kick' ? { kick: 'lena' } : null);
  const me = seats.find((s) => s.id === meId)!;
  const set = (patch: Partial<Seat>) => setSeats((all) => all.map((s) => (s.id === meId ? { ...s, ...patch } : s)));
  const takenBy = (c: Slot) => seats.find((s) => s.colour === c && s.id !== meId);
  const humans = seats.filter((s) => !s.ai).length;
  const now: Now = host
    ? {
        step: 2,
        of: 2,
        title: seats.length < 2 ? 'Wait for players, or add an AI' : 'Start when everyone is here',
        detail: `${seats.length} at the table, ${humans} on phones. Others join with the code ${CODE} or the QR. Everyone can change their colonist until you start.`,
      }
    : { step: 1, of: 2, title: 'Make your colonist', detail: 'Pick a species and a colour. Heiko, the host, starts the game when everyone is here.' };

  return (
    <div className="h-full @container/shell">
      <div className="relative flex h-full bg-table text-ink" data-testid="lobby">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5 @min-[1100px]/shell:gap-6 @min-[1100px]/shell:p-8">
          <header className="flex items-center gap-3">
            <span className="font-display text-sm font-semibold @min-[1100px]/shell:text-lg">
              M.U.L.E. <span className="text-holo">Next Gen</span>
            </span>
            <span className="ml-auto font-mono text-xs text-ink-3 @min-[1100px]/shell:text-sm">ROOM {CODE}</span>
            <ThemeToggle />
          </header>
          <div className="flex min-h-0 flex-1 gap-3 @min-[1100px]/shell:gap-8">
            <ColonistHero seat={me} />
            <div className="flex min-w-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-6">
              <Picker label="Species">
                <div className="grid grid-cols-6 gap-1 @min-[1100px]/shell:grid-cols-3 @min-[1100px]/shell:gap-3" data-testid="species-pick">
                  {SPECIES.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      aria-pressed={sp === me.species}
                      onClick={() => set({ species: sp })}
                      className={cx(
                        'flex flex-col items-center gap-0.5 rounded-control border bg-panel px-1 py-1 text-center @min-[1100px]/shell:flex-row @min-[1100px]/shell:items-start @min-[1100px]/shell:gap-3 @min-[1100px]/shell:p-3 @min-[1100px]/shell:text-left',
                        sp === me.species ? 'border-2 border-holo bg-holo-soft shadow-glow' : 'border-holo-line hover:border-holo',
                      )}
                      data-testid={`species-${sp}`}
                    >
                      <Creature species={sp} color={SLOT_COLOR[me.colour]} size={30} className="@min-[1100px]/shell:hidden" />
                      <Creature species={sp} color={SLOT_COLOR[me.colour]} size={56} className="hidden shrink-0 @min-[1100px]/shell:block" />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[11px] font-semibold @min-[1100px]/shell:font-display @min-[1100px]/shell:text-lg">{SPECIES_NAME[sp]}</span>
                        <span className="hidden text-sm leading-snug text-ink-2 @min-[1100px]/shell:block">{SPECIES_PERK[sp]}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </Picker>
              <Picker label="Colour">
                <div className="flex flex-wrap gap-1.5 @min-[1100px]/shell:gap-3" data-testid="colour-pick">
                  {([0, 1, 2, 3, 4, 5] as Slot[]).map((c) => {
                    const owner = takenBy(c);
                    const mine = c === me.colour;
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={mine}
                        aria-label={owner ? `${COLOUR_NAME[c]}, taken by ${owner.name}` : COLOUR_NAME[c]}
                        disabled={!!owner}
                        onClick={() => set({ colour: c })}
                        className={cx(
                          'flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:py-1 @min-[1100px]/shell:pl-1 @min-[1100px]/shell:pr-3',
                          mine ? 'border-2 border-holo bg-holo-soft' : owner ? 'border-holo-faint opacity-60' : 'border-holo-line hover:border-holo',
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
              </Picker>
            </div>
          </div>
        </main>
        <aside className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40 @min-[1100px]/shell:w-[400px]" data-testid="guide">
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5 @min-[1100px]/shell:gap-4 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-5">
            <NowCard now={now} />
            <section className="flex flex-col gap-1.5">
              <h2 className="label-caps @min-[1100px]/shell:text-xs!">At the table · {seats.length} of 6</h2>
              <ul className="flex flex-col overflow-hidden rounded-panel border border-holo-line" data-testid="seats">
                {seats.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 border-t border-holo-faint bg-panel px-2 py-1 first:border-t-0 @min-[1100px]/shell:gap-3 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2">
                    <Creature species={s.species} color={SLOT_COLOR[s.colour]} size={22} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold @min-[1100px]/shell:text-base">
                      {s.name}
                      {s.id === meId && ' (you)'}
                    </span>
                    <span className={cx('rounded-chip px-1.5 font-mono text-[10px] font-bold', s.ai ? 'bg-holo-soft text-holo' : s.id === 'heiko' ? 'bg-warn/15 text-warn' : 'bg-ok/10 text-ok')}>
                      {s.ai ? 'AI' : s.id === 'heiko' ? 'HOST' : 'PHONE'}
                    </span>
                    {host && s.id !== meId && (
                      <button
                        type="button"
                        className="grid size-7 place-items-center rounded-control text-ink-3 hover:bg-alert/10 hover:text-alert"
                        aria-label={`Remove ${s.name}`}
                        onClick={() => setDialog({ kick: s.id })}
                        data-testid={`kick-${s.id}`}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <JoinCard />
            {!host && (
              <button type="button" className="text-left text-sm text-holo underline-offset-2 hover:underline" onClick={() => setDialog('handoff')} data-testid="move-to-phone">
                Playing on a laptop? Move to my phone…
              </button>
            )}
            {host && (
              <section className="flex flex-col gap-1 border-t border-holo-faint pt-2 @min-[1100px]/shell:pt-3" data-testid="host-tools">
                <span className="label-caps @min-[1100px]/shell:text-xs!">You host this table</span>
                <button type="button" className="text-left text-sm text-holo underline-offset-2 hover:underline" onClick={() => setDialog('handoff')} data-testid="host-to-phone">
                  Move the host to my phone…
                </button>
                <button type="button" className="text-left text-sm text-alert underline-offset-2 hover:underline" onClick={() => setDialog('close')} data-testid="close-room">
                  Close the room…
                </button>
              </section>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 py-2.5 @min-[1100px]/shell:px-5 @min-[1100px]/shell:py-4">
            {host ? (
              <>
                <Button size="md" variant="outline" disabled={seats.length >= 6} data-testid="add-ai">
                  Add AI player
                </Button>
                <Button size="md" className="@min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" disabled={seats.length < 2} data-testid="start-game">
                  Start game · {seats.length} players
                </Button>
              </>
            ) : (
              <>
                <span className="text-center text-sm text-ink-2">Waiting for Heiko to start…</span>
                <Button size="md" variant="ghost">
                  Leave table
                </Button>
              </>
            )}
          </div>
        </aside>
        {dialog && <Dialog dialog={dialog} seats={seats} me={me} host={host} onClose={() => setDialog(null)} onKick={(id) => (setSeats((all) => all.filter((s) => s.id !== id)), setDialog(null))} />}
      </div>
    </div>
  );
}

/** You, large: the stage of the lobby. On a phone it is a narrow column; on a laptop the hero of the page. */
function ColonistHero({ seat }: { seat: Seat }) {
  return (
    <section className="flex w-[150px] shrink-0 flex-col items-center justify-center gap-1 rounded-sheet border border-holo-line bg-panel p-2 text-center @min-[1100px]/shell:w-[360px] @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-8" data-testid="hero">
      <span className="grid place-items-center rounded-full" style={{ background: `radial-gradient(circle, ${SLOT_COLOR[seat.colour]}33 0%, transparent 70%)` }}>
        <Creature species={seat.species} color={SLOT_COLOR[seat.colour]} size={72} className="@min-[1100px]/shell:hidden" />
        <Creature species={seat.species} color={SLOT_COLOR[seat.colour]} size={200} className="hidden @min-[1100px]/shell:block" />
      </span>
      <span className="font-display text-lg font-semibold leading-tight @min-[1100px]/shell:text-4xl" data-testid="hero-name">
        {seat.name}
      </span>
      <span className="label-caps text-[10px]! @min-[1100px]/shell:text-sm!">
        {SPECIES_NAME[seat.species]} · {COLOUR_NAME[seat.colour]}
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

/** How the others join: the room's QR and code. */
function JoinCard() {
  return (
    <section className="flex items-center gap-2 rounded-panel border border-holo-line bg-panel p-1.5 @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-3" data-testid="room-card">
      <Qr text={`https://mule.example/join/${CODE}`} size={44} className="p-1! @min-[1100px]/shell:hidden" />
      <span className="hidden @min-[1100px]/shell:block">
        <Qr text={`https://mule.example/join/${CODE}`} size={96} className="p-2!" />
      </span>
      <span className="flex flex-col">
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Join with</span>
        <span className="font-mono text-xl font-bold tracking-[0.2em] text-holo @min-[1100px]/shell:text-4xl" data-testid="room-code">
          {CODE}
        </span>
      </span>
    </section>
  );
}

/** The host's three confirmations, over the whole screen. */
function Dialog({
  dialog,
  seats,
  me,
  host,
  onClose,
  onKick,
}: {
  dialog: 'handoff' | 'close' | { kick: string };
  seats: Seat[];
  me: Seat;
  host: boolean;
  onClose: () => void;
  onKick: (id: string) => void;
}) {
  let body: ReactNode;
  if (dialog === 'handoff')
    body = (
      <>
        <h2 className="font-display text-xl font-semibold @min-[1100px]/shell:text-3xl">{host ? 'Move the host to your phone' : 'Move to your phone'}</h2>
        <div className="flex items-center gap-4">
          <Qr text={`https://mule.example/host/${CODE}/heiko-7f3a`} size={120} className="p-2! @min-[1100px]/shell:hidden" />
          <span className="hidden @min-[1100px]/shell:block">
            <Qr text={`https://mule.example/host/${CODE}/heiko-7f3a`} size={220} className="p-3!" />
          </span>
          <p className="text-sm text-ink-2 @min-[1100px]/shell:text-lg">
            Scan this with your phone. It becomes <strong className="text-ink">you, {me.name}{host ? ', the host' : ''}</strong>, with your colonist. This screen then steps aside. The code works once, for 2 minutes.
          </p>
        </div>
        <Button size="md" variant="outline" onClick={onClose}>
          Done
        </Button>
      </>
    );
  else if (dialog === 'close')
    body = (
      <>
        <h2 className="font-display text-xl font-semibold @min-[1100px]/shell:text-3xl">Close the room?</h2>
        <p className="text-sm text-ink-2 @min-[1100px]/shell:text-lg">Everyone at the table goes back to the start screen. The code {CODE} stops working.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button size="md" variant="outline" onClick={onClose}>
            Keep it open
          </Button>
          <Button size="md" variant="danger" onClick={onClose} data-testid="close-confirm">
            Close the room
          </Button>
        </div>
      </>
    );
  else {
    const s = seats.find((x) => x.id === dialog.kick)!;
    body = (
      <>
        <h2 className="font-display text-xl font-semibold @min-[1100px]/shell:text-3xl">Remove {s.name}?</h2>
        <p className="text-sm text-ink-2 @min-[1100px]/shell:text-lg">{s.ai ? 'The AI leaves the table.' : `${s.name}'s phone goes back to the start screen. They can join again with the code.`}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button size="md" variant="outline" onClick={onClose}>
            Keep {s.ai ? 'it' : s.name}
          </Button>
          <Button size="md" variant="danger" onClick={() => onKick(s.id)} data-testid="kick-confirm">
            Remove
          </Button>
        </div>
      </>
    );
  }
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-void/70 p-4" role="dialog" aria-modal data-testid="host-dialog">
      <div className="flex max-w-[560px] flex-col gap-3 rounded-sheet border-2 border-holo bg-panel p-4 shadow-glow @min-[1100px]/shell:max-w-[720px] @min-[1100px]/shell:gap-5 @min-[1100px]/shell:p-8">{body}</div>
    </div>
  );
}
