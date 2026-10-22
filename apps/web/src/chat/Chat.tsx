import type { ChatMessage, PlayerView } from '@mule/protocol';
import { Creature, cx, SLOT_COLOR, type CreatureWrap, type Slot } from '@mule/ui';
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { toSlot } from '../game/derive';
import { useClient } from '../net/react';
import { useAnchor, useTableChat } from './store';

/**
 * Live table chat on every screen (spec C20): a line pops a speech bubble at its speaker and joins a short ticker.
 * The bubble sits at the speaker's creature when the screen draws one (a Speaker), otherwise at the speaker's place
 * in the guide's seat row. One bubble at a time per screen (RULE-9, the store), so bubbles never cover each other.
 */

type Seat = { player: PlayerView; slot: Slot };

/** The players at this screen's table, by seat, and the seat this screen is (null on the TV). */
function useSeats(): { seats: Map<string, Seat>; me: string | null } {
  const client = useClient();
  const { view, seatId } = useSyncExternalStore(client.subscribe, client.getState, client.getState);
  const players = view?.game?.players;
  const seats = useMemo(() => new Map((players ?? []).map((player) => [player.id, { player, slot: toSlot(player.slot) }])), [players]);
  return { seats, me: seatId };
}

/** What a creature's bubble must stay inside: the nearest of these around it. */
const BOUNDS = '[data-testid=store-hall],[data-testid=walk-board],[data-testid=stage],[data-phase]';
const EDGE = 4;

/**
 * Where a creature's bubble fits inside its bounds: slid sideways by dx (css px), and below the creature if not above.
 * Measured from the speaker (the bubble's parent) every frame while the bubble shows, because speakers move.
 */
function useFit(on: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ dx: 0, below: false });
  useLayoutEffect(() => {
    if (!on) return;
    let raf = 0;
    const measure = () => {
      raf = requestAnimationFrame(measure);
      const el = ref.current;
      const box = el?.closest(BOUNDS);
      if (!el?.parentElement || !box) return;
      const b = el.getBoundingClientRect();
      const at = el.parentElement.getBoundingClientRect();
      const s = box.getBoundingClientRect();
      const k = b.width / el.offsetWidth || 1; // the TV is scaled
      const left = at.left + at.width / 2 - b.width / 2;
      let dx = Math.min(0, s.right - EDGE - (left + b.width));
      dx = Math.max(dx, s.left + EDGE - left);
      const next = { dx: Math.round(dx / k), below: at.top - b.height - 8 * k < s.top + EDGE };
      setFit((f) => (f.dx === next.dx && f.below === next.below ? f : next));
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return { ref, ...fit };
}

/** A speech bubble pointing at its speaker: above it (or below, near the top), or to its left in the guide. */
function Bubble({ line, seat, me, size = 'phone', left = false }: { line: ChatMessage; seat: Seat; me: string | null; size?: 'phone' | 'tv'; left?: boolean }) {
  const { seats } = useSeats();
  const whisper = !!line.to;
  const { ref, dx, below } = useFit(!left);
  const edge = whisper ? 'var(--color-holo)' : SLOT_COLOR[seat.slot];
  const to = line.to === me ? 'YOU' : (seats.get(line.to ?? '')?.player.name.toUpperCase() ?? '');
  return (
    <span
      ref={ref}
      className={cx(
        'pointer-events-none absolute z-30 w-max max-w-[220px] animate-[show-card-in_0.25s_ease-out] rounded-panel border-2 bg-panel px-2.5 py-1 font-semibold leading-snug shadow-chip',
        left ? 'right-full top-1/2 mr-2 -translate-y-1/2' : cx('left-1/2 -translate-x-1/2', below ? 'top-full mt-1.5' : 'bottom-full mb-1.5'),
        whisper ? 'border-holo border-dashed' : '',
        size === 'tv' ? 'max-w-[360px] text-xl' : 'text-xs @min-[1100px]/shell:text-sm',
      )}
      style={{ ...(whisper ? {} : { borderColor: SLOT_COLOR[seat.slot] }), ...(dx ? { marginLeft: dx } : {}) }}
      data-testid={`chat-bubble-${line.from}`}
      data-line={line.id}
      role="status"
    >
      {whisper && <span className="mr-1 font-mono text-[9px] font-bold text-holo">🔒 TO {to}</span>}
      {line.text}
      {/* The tail still points at the speaker when the bubble has slid. */}
      <span
        aria-hidden
        className={cx(
          'absolute',
          left
            ? 'left-full top-1/2 -translate-y-1/2 border-y-[6px] border-l-[7px] border-y-transparent'
            : cx('-translate-x-1/2 border-x-[6px] border-x-transparent', below ? 'bottom-full border-b-[7px]' : 'top-full border-t-[7px]'),
        )}
        style={left ? { borderLeftColor: edge } : { left: `calc(50% - ${dx}px)`, ...(below ? { borderBottomColor: edge } : { borderTopColor: edge }) }}
      />
    </span>
  );
}

/** A creature that can speak: wraps a drawn creature so its seat's bubble pops at it, not in the seat row. */
export function Speaker({ id, children, size }: { id: string; children: ReactNode; size?: 'phone' | 'tv' }) {
  const holds = useAnchor(id);
  const { showing } = useTableChat();
  const { seats, me } = useSeats();
  const seat = seats.get(id);
  return (
    <span className="relative inline-flex" data-speaker={id}>
      {children}
      {holds && seat && showing?.from === id && <Bubble line={showing} seat={seat} me={me} {...(size ? { size } : {})} />}
    </span>
  );
}

/** For a board or hall that draws creatures: each one speaks. */
export const speakerAt: CreatureWrap = (id, creature) => <Speaker id={id}>{creature}</Speaker>;
export const tvSpeakerAt: CreatureWrap = (id, creature) => (
  <Speaker id={id} size="tv">
    {creature}
  </Speaker>
);

/**
 * Everyone else at the table, in the guide: the fallback anchor for a speaker the screen doesn't draw. Its parent must
 * be positioned and span the guide's width: the fallback bubble opens to the LEFT of the guide, level with the row,
 * over the stage, so it never covers the ticker below the row. The speaking seat lights up.
 */
function SeatRow() {
  const { showing, anchors } = useTableChat();
  const { seats, me } = useSeats();
  const fallback = showing && !anchors.has(showing.from) ? showing : null;
  const speaker = fallback ? seats.get(fallback.from) : undefined;
  return (
    <>
      <div className="flex items-center gap-2 @min-[1100px]/shell:gap-3" data-testid="seat-row">
        {[...seats.values()]
          .filter(({ player }) => player.id !== me)
          .map(({ player, slot }) => (
            <span
              key={player.id}
              className={cx('inline-flex flex-col items-center rounded-control px-0.5 transition-shadow', fallback?.from === player.id && 'ring-2')}
              style={fallback?.from === player.id ? { ['--tw-ring-color' as string]: SLOT_COLOR[slot] } : undefined}
              data-testid={`seat-${player.id}`}
              data-speaking={fallback?.from === player.id || undefined}
            >
              <Creature species={player.species} color={SLOT_COLOR[slot]} size={20} />
              <span className="font-mono text-[9px] text-ink-3 @min-[1100px]/shell:text-[10px]">{player.name}</span>
            </span>
          ))}
      </div>
      {fallback && speaker && (
        <span className="pointer-events-none absolute right-full top-0 mr-3 h-[34px] @min-[1100px]/shell:mr-5" data-fallback>
          <Bubble line={fallback} seat={speaker} me={me} left />
        </span>
      )}
    </>
  );
}

/** The last few lines, newest first: the phone keeps 2, the TV 3. */
function Ticker({ size = 'phone' }: { size?: 'phone' | 'tv' }) {
  const { lines } = useTableChat();
  const { seats } = useSeats();
  const tv = size === 'tv';
  const said = lines.filter((l) => seats.has(l.from));
  return (
    <ul className={cx('flex flex-col overflow-hidden', tv ? 'gap-1' : 'gap-0.5')} data-testid="chat-ticker" aria-label="Table chat" aria-live="polite">
      {said
        .slice(tv ? -3 : -2)
        .reverse()
        .map((l, i) => {
          const { player, slot } = seats.get(l.from)!;
          return (
            <li
              key={l.id}
              className={cx('flex min-w-0 items-center gap-1.5 truncate', tv ? 'text-xl' : 'text-[11px] @min-[1100px]/shell:text-sm', i === 0 ? 'animate-[show-card-in_0.25s_ease-out] text-ink' : 'text-ink-3')}
              data-testid={`chat-line-${l.id}`}
            >
              <Creature species={player.species} color={SLOT_COLOR[slot]} size={tv ? 22 : 14} />
              <strong className="shrink-0">
                {player.name}
                {l.to ? ' 🔒' : ''}:
              </strong>
              <span className="truncate">{l.text}</span>
            </li>
          );
        })}
    </ul>
  );
}

/** The guide's chat block: everyone's seat, the bubble's fallback anchor, and the last lines. */
export function TableChat() {
  return (
    <div className="relative flex flex-col gap-1 border-t border-holo-faint pt-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:pt-2.5" data-testid="table-chat">
      <SeatRow />
      <Ticker />
    </div>
  );
}

/** The TV's ticker, under its header. Nothing shows until someone speaks. */
export function TvTicker() {
  const { lines } = useTableChat();
  if (lines.length === 0) return null;
  return (
    <div className="rounded-panel border border-holo-line bg-panel/60 px-4 py-2">
      <Ticker size="tv" />
    </div>
  );
}
