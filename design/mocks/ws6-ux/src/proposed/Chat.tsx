import { Creature, cx, SLOT_COLOR, type Slot } from '@mule/ui';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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

/** How long a bubble stays at its speaker. */
export const BUBBLE_MS = 4500;
/** How many lines the ticker keeps. */
const TICKER = 4;

const SCRIPT: Omit<Line, 'id' | 'at'>[] = [
  { from: 'ossa', text: 'Anyone need Water? Cheap today.' },
  { from: 'kai', text: 'Smithore is going to spike. Just saying.' },
  { from: 'ossa', to: 'lena', text: 'Psst: vote with me on the land tax?' },
  { from: 'brix', text: 'Mine.' },
  { from: 'kai', text: 'Nice plot, Lena!' },
];

/** The mock's table: a line every 3 s, round and round. Lena holds this phone. */
export function useChatSim(start = 0, me = 'lena') {
  const [n, setN] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), 3000);
    return () => clearInterval(id);
  }, []);
  const now = n * 3000;
  const lines: Line[] = Array.from({ length: n + 1 }, (_, i) => ({ ...SCRIPT[i % SCRIPT.length]!, id: i, at: i * 3000 }))
    // A whisper reaches only its two phones.
    .filter((l) => !l.to || l.to === me || l.from === me);
  const bubbles = Object.fromEntries(lines.filter((l) => now - l.at < BUBBLE_MS).map((l) => [l.from, l]));
  return { ticker: lines.slice(-TICKER), bubbles, me };
}

export type Chat = ReturnType<typeof useChatSim>;
const ChatContext = createContext<Chat | null>(null);
export const ChatProvider = ChatContext.Provider;
export const useChat = () => useContext(ChatContext);

const P = Object.fromEntries(VIEW.players.map((p, i) => [p.id, { ...p, slot: i as Slot }]));

/** A speech bubble pointing down at its speaker. */
export function Bubble({ line, size = 'phone', below = false, className }: { line: Line; size?: 'phone' | 'tv'; below?: boolean; className?: string }) {
  const p = P[line.from]!;
  const whisper = !!line.to;
  return (
    <span
      className={cx(
        'pointer-events-none absolute left-1/2 w-max max-w-[220px] -translate-x-1/2 animate-[show-card-in_0.25s_ease-out] rounded-panel border-2 bg-panel px-2.5 py-1 font-semibold leading-snug shadow-chip',
        below ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
        whisper ? 'border-holo border-dashed' : '',
        size === 'tv' ? 'max-w-[360px] text-xl' : 'text-xs @min-[1100px]/shell:text-sm',
        className,
      )}
      // The newest line sits on top when two speakers overlap; older ones are in the ticker anyway.
      style={{ zIndex: 30 + line.id, ...(whisper ? {} : { borderColor: SLOT_COLOR[p.slot] }) }}
      data-testid={`chat-bubble-${line.from}`}
      role="status"
    >
      {whisper && <span className="mr-1 font-mono text-[9px] font-bold text-holo">🔒 TO YOU</span>}
      {line.text}
      <span
        aria-hidden
        className={cx('absolute left-1/2 -translate-x-1/2 border-x-[6px] border-x-transparent', below ? 'bottom-full border-b-[7px]' : 'top-full border-t-[7px]')}
        style={below ? { borderBottomColor: whisper ? 'var(--color-holo)' : SLOT_COLOR[p.slot] } : { borderTopColor: whisper ? 'var(--color-holo)' : SLOT_COLOR[p.slot] }}
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
export function SeatRow({ anchored = [] }: { anchored?: string[] }) {
  const chat = useChat();
  return (
    <div className="flex items-center gap-2 @min-[1100px]/shell:gap-3" data-testid="seat-row">
      {VIEW.players
        .filter((p) => p.id !== chat?.me)
        .map((p) => {
          const line = chat?.bubbles[p.id];
          return (
            <span key={p.id} className="relative inline-flex flex-col items-center" data-testid={`seat-${p.id}`}>
              <Creature species={p.species} color={SLOT_COLOR[P[p.id]!.slot]} size={20} />
              <span className="font-mono text-[9px] text-ink-3 @min-[1100px]/shell:text-[10px]">{p.name}</span>
              {/* A speaker the screen draws gets the bubble there instead. */}
              {/* In the guide the bubble opens downward, over the ticker that repeats it, never over the phase and clock. */}
              {line && !anchored.includes(p.id) && <Bubble line={line} below />}
            </span>
          );
        })}
    </div>
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
