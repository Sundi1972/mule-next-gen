import { Creature, cx, SLOT_COLOR, type Slot } from '@mule/ui';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { VIEW } from '../fixture';

/**
 * Live table chat on every screen (Heiko 2026-10-22: "Live on every screen"):
 * when anyone at the table says something, a speech bubble pops at the
 * speaker for a few seconds, and the line joins a short ticker. Phones and TV,
 * every phase.
 *
 * Where the bubble sits: at the speaker's creature when the screen draws one
 * (the auction board, the store hall, the map, the production slots, the hub's
 * offices strip); otherwise at the speaker's place in the seat row, a row of
 * everyone's creature that every screen's guide carries. A screen registers
 * its creatures as anchors; the seat row is the fallback, so no phase can drop
 * a line.
 *
 * One bubble at a time on each screen, in a queue (PM's condition on Heiko's
 * approval): bubbles never cover each other or the ticker. Each shows at least
 * BUBBLE_MIN_MS, at most BUBBLE_MAX; a line that would wait longer than
 * BUBBLE_MAX_WAIT_MS gets no bubble (it is in the ticker). A bubble for a
 * speaker the screen doesn't draw opens to the left of the guide, over the
 * stage, never over the ticker. A bubble at a creature stays inside the stage:
 * it slides sideways off an edge and opens below the creature when there is no
 * room above.
 *
 * Whispers (ChatMessage.to) show only on the two phones involved, with a lock;
 * the TV never receives them (the server's rule). A phase change clears the
 * bubbles; the ticker keeps its last lines.
 *
 * Wire shape: tabletop ChatMessage { id, from, to?, text, at }.
 * GRAFT TARGETS: apps/web/src/phone/Shell.tsx (ticker, seat row, bubble layer;
 * WS6, WS4 reviews) and apps/web/src/table/TableApp.tsx::TvHeader (TV ticker,
 * a named WS4 edit); screens with creatures pass anchors.
 * Testids: chat-ticker, chat-line-<id>, chat-bubble-<seatId>, seat-row, seat-<id>.
 */

export interface Line {
  id: number;
  from: string;
  to?: string;
  text: string;
  at: number;
}

/** How long a bubble stays at its speaker, at most. */
export const BUBBLE_MS = 4500;
/** A bubble shows at least this long before the next line's bubble takes over. */
export const BUBBLE_MIN_MS = 2000;
/** A line that would wait longer than this for its bubble gets none: the ticker carries it. */
export const BUBBLE_MAX_WAIT_MS = 4000;
/** How many lines the ticker keeps. */
const TICKER = 4;

const SCRIPT: Omit<Line, 'id' | 'at'>[] = [
  { from: 'ossa', text: 'Anyone need Water? Cheap today.' },
  { from: 'kai', text: 'Smithore is going to spike. Just saying.' },
  { from: 'ossa', to: 'lena', text: 'Psst: vote with me on the land tax?' },
  { from: 'brix', text: 'Mine.' },
  { from: 'kai', text: 'Nice plot, Lena!' },
];

/** When each line's bubble shows: one at a time, queued, each at least BUBBLE_MIN_MS (RULE-9). Pure. */
export function bubbleSchedule(lines: Line[]): { line: Line; from: number; to: number }[] {
  const out: { line: Line; from: number; to: number }[] = [];
  let free = -Infinity;
  for (const l of lines) {
    const from = Math.max(l.at, free);
    if (from - l.at > BUBBLE_MAX_WAIT_MS) continue;
    const prev = out.at(-1);
    // The one before gives way once it has had its minimum.
    if (prev && prev.to > from) prev.to = from;
    out.push({ line: l, from, to: from + BUBBLE_MS });
    free = from + BUBBLE_MIN_MS;
  }
  return out;
}

/** The mock's table: lines in a rhythm that sometimes overlaps (two within a second), round and round. */
const GAPS = [3000, 800, 2600, 3200, 900];
export function useChatSim(start = 0, me = 'lena') {
  const [now, setNow] = useState(start * 3000);
  useEffect(() => {
    const id = setInterval(() => setNow((x) => x + 100), 100);
    return () => clearInterval(id);
  }, []);
  const all: Line[] = [];
  for (let i = 0, at = 0; at <= now; at += GAPS[i % GAPS.length]!, i++) all.push({ ...SCRIPT[i % SCRIPT.length]!, id: i, at });
  // A whisper reaches only its two phones.
  const lines = all.filter((l) => !l.to || l.to === me || l.from === me);
  const showing = bubbleSchedule(lines).find((b) => b.from <= now && now < b.to);
  const bubbles: Record<string, Line> = showing ? { [showing.line.from]: showing.line } : {};
  return { ticker: lines.slice(-TICKER), bubbles, me };
}

export type Chat = ReturnType<typeof useChatSim>;
const ChatContext = createContext<Chat | null>(null);
export const ChatProvider = ChatContext.Provider;
export const useChat = () => useContext(ChatContext);

const P = Object.fromEntries(VIEW.players.map((p, i) => [p.id, { ...p, slot: i as Slot }]));

/** What a creature's bubble must stay inside: the phone's stage, or the TV. */
const BOUNDS = '[data-testid=stage],[data-testid=tv-chat]';
const EDGE = 4;

/**
 * Where a creature's bubble fits inside its bounds: slid sideways by dx (css px), and below the creature if not above.
 * Measured from the speaker (the bubble's parent) every frame while the bubble shows, because speakers walk.
 */
function useFit(on: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ dx: 0, below: false });
  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      const el = ref.current;
      const box = on ? el?.closest(BOUNDS) : null;
      if (!el?.parentElement || !box) return;
      const b = el.getBoundingClientRect();
      const at = el.parentElement.getBoundingClientRect();
      const s = box.getBoundingClientRect();
      const k = b.width / el.offsetWidth || 1; // the frames are scaled
      const left = at.left + at.width / 2 - b.width / 2;
      let dx = Math.min(0, s.right - EDGE - (left + b.width));
      dx = Math.max(dx, s.left + EDGE - left);
      const next = { dx: Math.round(dx / k), below: at.top - b.height - 8 * k < s.top + EDGE };
      setFit((f) => (f.dx === next.dx && f.below === next.below ? f : next));
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return { ref, ...fit };
}

/** A speech bubble pointing at its speaker: above it, or to its left in the guide. */
export function Bubble({ line, size = 'phone', left = false, className }: { line: Line; size?: 'phone' | 'tv'; left?: boolean; className?: string }) {
  const p = P[line.from]!;
  const whisper = !!line.to;
  const { ref, dx, below } = useFit(!left);
  const edge = whisper ? 'var(--color-holo)' : SLOT_COLOR[p.slot];
  return (
    <span
      ref={ref}
      className={cx(
        'pointer-events-none absolute z-30 w-max max-w-[220px] animate-[show-card-in_0.25s_ease-out] rounded-panel border-2 bg-panel px-2.5 py-1 font-semibold leading-snug shadow-chip',
        left ? 'right-full top-1/2 mr-2 -translate-y-1/2' : cx('left-1/2 -translate-x-1/2', below ? 'top-full mt-1.5' : 'bottom-full mb-1.5'),
        whisper ? 'border-holo border-dashed' : '',
        size === 'tv' ? 'max-w-[360px] text-xl' : 'text-xs @min-[1100px]/shell:text-sm',
        className,
      )}
      style={{ ...(whisper ? {} : { borderColor: SLOT_COLOR[p.slot] }), ...(dx ? { marginLeft: dx } : {}) }}
      data-testid={`chat-bubble-${line.from}`}
      role="status"
    >
      {whisper && <span className="mr-1 font-mono text-[10px] font-bold text-holo">🔒 TO YOU</span>}
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

/** A creature that can speak: wraps any on-screen creature so its bubble pops above it. */
export function Speaker({ id, children, size }: { id: string; children: ReactNode; size?: 'phone' | 'tv' }) {
  const chat = useChat();
  const line = chat?.bubbles[id];
  return (
    <span className="relative inline-flex" data-speaker={id}>
      {children}
      {line && <Bubble line={line} {...(size ? { size } : {})} />}
    </span>
  );
}

/** Everyone at the table, in the guide: the fallback anchor for a speaker the screen doesn't draw. */
/**
 * Everyone at the table, in the guide: the fallback anchor for a speaker the screen doesn't draw. Its parent must be
 * positioned and span the guide's width: the fallback bubble opens to the LEFT of the guide, level with the row, over
 * the stage, so it never covers the ticker below the row or the clock above it. The speaking seat lights up.
 */
export function SeatRow({ anchored = [] }: { anchored?: string[] }) {
  const chat = useChat();
  // A speaker the screen draws gets the bubble there instead.
  const fallback = Object.values(chat?.bubbles ?? {}).find((l) => !anchored.includes(l.from));
  return (
    <>
      {/* Five others fit the narrowest rail on one line: a long name gives way (its whole name is its title), the creatures never do. */}
      <div className="flex min-w-0 items-center gap-1 @min-[1100px]/shell:gap-3" data-testid="seat-row">
        {VIEW.players
          .filter((p) => p.id !== chat?.me)
          .map((p) => (
            <span
              key={p.id}
              className={cx('inline-flex min-w-0 flex-col items-center rounded-control px-0.5 transition-shadow', fallback?.from === p.id && 'ring-2')}
              style={fallback?.from === p.id ? { ['--tw-ring-color' as string]: SLOT_COLOR[P[p.id]!.slot] } : undefined}
              data-testid={`seat-${p.id}`}
              data-speaking={fallback?.from === p.id || undefined}
            >
              <Creature species={p.species} color={SLOT_COLOR[P[p.id]!.slot]} size={20} />
              <span className="max-w-full truncate font-mono text-[10px] text-ink-3" title={p.name}>
                {p.name}
              </span>
            </span>
          ))}
      </div>
      {fallback && (
        <span className="pointer-events-none absolute right-full top-0 mr-3 h-[34px]" data-fallback>
          <Bubble line={fallback} left />
        </span>
      )}
    </>
  );
}

/** The last few lines, newest first fading in. */
export function Ticker({ size = 'phone' }: { size?: 'phone' | 'tv' }) {
  const chat = useChat();
  const lines = chat?.ticker ?? [];
  const tv = size === 'tv';
  return (
    <ul className={cx('flex flex-col overflow-hidden', tv ? 'gap-1' : 'gap-0.5')} data-testid="chat-ticker" aria-label="Table chat" aria-live="polite">
      {lines
        .slice(tv ? -3 : -2)
        .reverse()
        .map((l, i) => {
          const p = P[l.from]!;
          return (
            <li
              key={l.id}
              className={cx('flex min-w-0 items-center gap-1.5 truncate', tv ? 'text-xl' : 'text-[11px] @min-[1100px]/shell:text-sm', i === 0 ? 'animate-[show-card-in_0.25s_ease-out] text-ink' : 'text-ink-3')}
              data-testid={`chat-line-${l.id}`}
            >
              <Creature species={p.species} color={SLOT_COLOR[p.slot]} size={tv ? 22 : 14} />
              <strong className="shrink-0">{p.name}{l.to ? ' 🔒' : ''}:</strong>
              <span className="truncate">{l.text}</span>
            </li>
          );
        })}
    </ul>
  );
}
