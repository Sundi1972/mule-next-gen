import { Button, Creature, cx, PlayerMark, SLOT_COLOR, SPECIES, SPECIES_NAME, SPECIES_PERK, type Slot, type Species } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { ThemeToggle } from '../../App';
import { ROOM_CODE, SEATS } from '../../data';

/**
 * The lobby held sideways, with the species pick. The shell (header, room code,
 * big-screen status, seat rail, host buttons) is the real app's Lobby.tsx; only
 * the species pick is new. Two variants of where the pick lives.
 */

export type LobbyState = 'default' | 'picked' | 'duplicate';

/** Who is in this mock lobby: Heiko (host) and Mia so far, plus two AI seats. */
const AT_TABLE = SEATS.filter((s) => [0, 1, 3, 5].includes(s.slot));

function startSpecies(state: LobbyState): Species {
  if (state === 'picked') return 'mollox';
  if (state === 'duplicate') return 'bramblet';
  return 'zipwing';
}

function Header() {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-holo-faint px-4 pb-2 pt-2">
      <span className="font-display text-base font-bold">
        M.U.L.E. <span className="text-holo">Next Gen</span>
      </span>
      <ThemeToggle />
    </div>
  );
}

function RoomCard({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-panel border border-holo-line bg-panel p-2" data-testid="room-card">
      {/* The real lobby draws a QR code here; the prototype shows its footprint. */}
      <div aria-hidden className={cx('shrink-0 rounded-control bg-ink', compact ? 'size-14' : 'size-24')} data-testid="room-qr" />
      <div className="flex min-w-0 flex-col">
        <span className="label-caps">Room code</span>
        <span className={cx('font-mono font-bold tracking-[0.2em] text-holo', compact ? 'text-2xl' : 'text-4xl')} data-testid="room-code">
          {ROOM_CODE}
        </span>
        {!compact && <span className="truncate font-mono text-xs text-ink-3">mule.example/join/{ROOM_CODE}</span>}
      </div>
    </div>
  );
}

function BoardStatus() {
  return (
    <div className="flex items-center gap-3 rounded-panel border border-ok/40 bg-ok/5 px-3 py-1.5" data-testid="board-status">
      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-ok shadow-[0_0_10px_var(--color-ok)]" />
      <span className="text-sm">Big screen connected. Your phone is your private controller.</span>
    </div>
  );
}

/** The seat rail. Your own row shows your creature as you pick; in V2 it is also the way in to the pick. */
function SeatRail({ species, onMine, mineOpen }: { species: Species; onMine?: () => void; mineOpen?: boolean }) {
  return (
    <div className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40">
      <section className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3">
        <h2 className="label-caps">At the table · {AT_TABLE.length} of 6</h2>
        <ul className="flex flex-col overflow-hidden rounded-panel border border-holo-line" data-testid="seats">
          {AT_TABLE.map((s) => {
            const mine = s.slot === 0;
            const row = (
              <>
                <PlayerMark slot={s.slot} species={mine ? species : s.species} size={mine ? 22 : 18} />
                <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
                  {s.name}
                  {mine && ' (you)'}
                </span>
                {mine && onMine ? (
                  <span className="rounded-chip border border-holo-line px-2 py-0.5 font-mono text-[11px] font-bold text-holo">{mineOpen ? 'PICKING' : 'CHANGE'}</span>
                ) : (
                  <span className={cx('rounded-chip px-2 py-0.5 font-mono text-[11px] font-bold', s.ai ? 'bg-holo-soft text-holo' : mine ? 'bg-warn/15 text-warn' : 'bg-ok/10 text-ok')}>
                    {s.ai ? 'AI' : mine ? 'HOST' : 'READY'}
                  </span>
                )}
              </>
            );
            return (
              <li key={s.slot} className="border-t border-holo-faint bg-panel first:border-t-0">
                {mine && onMine ? (
                  <button type="button" onClick={onMine} aria-expanded={mineOpen} className="flex min-h-11 w-full items-center gap-2.5 px-2.5 py-1.5 hover:bg-holo-soft" data-testid="seat-mine">
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center gap-2.5 px-2.5 py-1.5" data-testid={mine ? 'seat-mine' : `seat-${s.slot}`}>
                    {row}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 py-2.5">
        <Button size="md" variant="outline" data-testid="add-ai">
          Add AI player
        </Button>
        <Button size="md" data-testid="start-game">
          Start game
        </Button>
      </div>
    </div>
  );
}

/** One species: the creature in your colour, its name. Pressed shows the choice. */
function SpeciesChip({ sp, slot, chosen, onPick, big }: { sp: Species; slot: Slot; chosen: boolean; onPick: (s: Species) => void; big?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={() => onPick(sp)}
      data-testid={`species-${sp}`}
      className={cx(
        'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-control border bg-panel',
        big ? 'pb-1.5 pt-2' : 'pb-1 pt-1.5',
        chosen ? 'border-holo shadow-glow' : 'border-holo-faint hover:border-holo-line',
      )}
    >
      <Creature species={sp} color={SLOT_COLOR[slot]} size={big ? 40 : 34} />
      <span className={cx('font-semibold', big ? 'text-sm' : 'text-xs')}>{SPECIES_NAME[sp]}</span>
    </button>
  );
}

/** The chosen species' one perk, and a word when someone else at the table has it too. */
function PerkLine({ species }: { species: Species }) {
  const twin = AT_TABLE.find((s) => s.slot !== 0 && s.species === species);
  return (
    <p className="rounded-control bg-holo-soft px-3 py-1.5 text-sm leading-snug text-ink" data-testid="species-perk">
      <strong>{SPECIES_NAME[species]}.</strong> {SPECIES_PERK[species]}
      {twin && <span className="text-ink-2"> {twin.name} is one too; your colours tell you apart.</span>}
    </p>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col bg-table text-ink">{children}</div>;
}

/** V1 · The pick is always on screen: a row of six under the title. The room card shrinks to make room. */
export function LobbyV1({ state }: { state: LobbyState }) {
  const [species, setSpecies] = useState<Species>(startSpecies(state));
  return (
    <Frame>
      <Header />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold">You're at the table</h1>
            <span className="text-sm text-ink-3">Change it until the host starts.</span>
          </div>
          <fieldset className="flex flex-col gap-1.5" data-testid="species-pick">
            <legend className="label-caps mb-1">Pick your species</legend>
            <div className="grid grid-cols-6 gap-1.5">
              {SPECIES.map((sp) => (
                <SpeciesChip key={sp} sp={sp} slot={0} chosen={sp === species} onPick={setSpecies} />
              ))}
            </div>
            <PerkLine species={species} />
          </fieldset>
          <div className="mt-auto grid grid-cols-[auto_1fr] items-center gap-2">
            <RoomCard compact />
            <BoardStatus />
          </div>
        </div>
        <SeatRail species={species} />
      </div>
    </Frame>
  );
}

/** V2 · The lobby stays as it is today. Tap your own seat to open the pick; the left side becomes a 3×2 grid. */
export function LobbyV2({ open: startOpen }: { open: boolean }) {
  const [species, setSpecies] = useState<Species>('zipwing');
  const [open, setOpen] = useState(startOpen);
  return (
    <Frame>
      <Header />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-2.5">
          {open ? (
            <fieldset className="flex min-h-0 flex-1 flex-col gap-2" data-testid="species-pick">
              <div className="flex items-center justify-between gap-3">
                <legend className="font-display text-xl font-semibold">Pick your species</legend>
                <Button size="md" variant="outline" className="h-11" onClick={() => setOpen(false)} data-testid="species-done">
                  Done
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SPECIES.map((sp) => (
                  <SpeciesChip key={sp} sp={sp} slot={0} chosen={sp === species} onPick={setSpecies} big />
                ))}
              </div>
              <PerkLine species={species} />
            </fieldset>
          ) : (
            <>
              <div className="flex flex-col gap-0.5">
                <h1 className="font-display text-2xl font-semibold">You're at the table</h1>
                <p className="text-sm text-ink-2">
                  You play as a <strong className="text-ink">{SPECIES_NAME[species]}</strong>. Tap your seat on the right to pick another species.
                </p>
              </div>
              <RoomCard />
              <BoardStatus />
            </>
          )}
        </div>
        <SeatRail species={species} onMine={() => setOpen((o) => !o)} mineOpen={open} />
      </div>
    </Frame>
  );
}
