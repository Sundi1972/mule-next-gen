import type { ChatMessage, PlayerView } from '@mule/protocol';
import { Creature, cx, SLOT_COLOR, type CreatureWrap, type Slot } from '@mule/ui';
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { toSlot } from '../game/derive';
import { useClient } from '../net/react';
import { BOUNDS, EDGE, GAP, placeBubble, type Box, type Fit, type Place } from './place';
import { useAnchor, useTableChat } from './store';

/**
 * Live table chat on every screen (spec C20): a line pops a speech bubble at its speaker and joins a short ticker.
 * The bubble sits at the speaker's creature when the screen draws one (a Speaker), otherwise at the speaker's place
 * in the guide's seat row. One bubble at a time per screen (RULE-9, the store), so bubbles never cover each other.
 * On a phone (the shell under 1100 px) the seat row and the ticker follow the rail's own content, in the same scroll
 * (Heiko's "chat at the bottom"): the bubble for a speaker the screen doesn't draw then opens at the rail's top.
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


const boxOf = (r: DOMRect): Box => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });

/**
 * The text a bubble should not cover inside its frame: every visible line of text there but the bubbles' own
 * (AM-22). The chat e2e measures the same way.
 */
function labelsIn(frame: Element): Box[] {
  const now = performance.now();
  const kept = measured.get(frame);
  if (kept && now - kept.at < LABELS_EVERY_MS) return kept.labels;
  const out: Box[] = [];
  const range = document.createRange();
  const walk = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent?.trim() || !el || el.closest('[data-testid^=chat-bubble-]')) continue;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) out.push(boxOf(r));
  }
  measured.set(frame, { at: now, labels: out });
  return out;
}

/** The labels are walked at most this often per frame, shared by its bubbles; the bubble itself is placed every frame. */
const LABELS_EVERY_MS = 33;
const measured = new WeakMap<Element, { at: number; labels: Box[] }>();

/**
 * Where a creature's bubble goes (placeBubble): above it unless that covers a name or caption, sliding to stay inside
 * its bounds (dx, dy in css px). Measured from the speaker (the bubble's parent) every frame while the bubble shows,
 * because speakers and labels move.
 */
function useFit(on: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const placed = useRef<Place>('above');
  const [fit, setFit] = useState<Fit>({ place: 'above', dx: 0, dy: 0 });
  useLayoutEffect(() => {
    if (!on) return;
    let raf = 0;
    const measure = () => {
      raf = requestAnimationFrame(measure);
      const el = ref.current;
      const frame = el?.closest(BOUNDS);
      if (!el?.parentElement || !frame) return;
      const b = el.getBoundingClientRect();
      const k = b.width / el.offsetWidth || 1; // the TV is scaled
      const at = placeBubble({
        at: boxOf(el.parentElement.getBoundingClientRect()),
        w: b.width,
        h: b.height,
        within: boxOf(frame.getBoundingClientRect()),
        labels: labelsIn(frame),
        gap: GAP * k,
        edge: EDGE,
        current: placed.current,
      });
      placed.current = at.place;
      const next = { place: at.place, dx: Math.round(at.dx / k), dy: Math.round(at.dy / k) };
      setFit((f) => (f.place === next.place && f.dx === next.dx && f.dy === next.dy ? f : next));
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return { ref, ...fit };
}

/** Each place's offset from its speaker is GAP (8 px), as placeBubble reckons it; the bubble fades in where it stays. */
const AT: Record<Place, string> = {
  above: 'left-1/2 -translate-x-1/2 bottom-full mb-2',
  below: 'left-1/2 -translate-x-1/2 top-full mt-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
};
const TAIL: Record<Place, string> = {
  above: 'top-full -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent',
  below: 'bottom-full -translate-x-1/2 border-x-[6px] border-b-[7px] border-x-transparent',
  right: 'right-full -translate-y-1/2 border-y-[6px] border-r-[7px] border-y-transparent',
  left: 'left-full -translate-y-1/2 border-y-[6px] border-l-[7px] border-y-transparent',
};
const TAIL_COLOR: Record<Place, 'borderTopColor' | 'borderBottomColor' | 'borderRightColor' | 'borderLeftColor'> = {
  above: 'borderTopColor',
  below: 'borderBottomColor',
  right: 'borderRightColor',
  left: 'borderLeftColor',
};

/**
 * A speech bubble pointing at its speaker: above it, or below or beside it where above would cover a label (or cross
 * the top); `guide` puts it to the guide's left, always.
 */
function Bubble({ line, seat, me, size = 'phone', guide = false }: { line: ChatMessage; seat: Seat; me: string | null; size?: 'phone' | 'tv'; guide?: boolean }) {
  const { seats } = useSeats();
  const whisper = !!line.to;
  const fit = useFit(!guide);
  const { ref } = fit;
  const { place, dx, dy } = guide ? { place: 'left' as const, dx: 0, dy: 0 } : fit;
  const side = place === 'left' || place === 'right';
  const edge = whisper ? 'var(--color-holo)' : SLOT_COLOR[seat.slot];
  const to = line.to === me ? 'YOU' : (seats.get(line.to ?? '')?.player.name.toUpperCase() ?? '');
  return (
    <span
      ref={ref}
      className={cx(
        'pointer-events-none absolute z-30 w-max max-w-[220px] animate-[fade-in_0.25s_ease-out] rounded-panel border-2 bg-panel px-2.5 py-1 font-semibold leading-snug shadow-chip',
        AT[place],
        whisper ? 'border-holo border-dashed' : '',
        size === 'tv' ? 'max-w-[360px] text-xl' : 'text-xs @min-[1100px]/shell:text-sm',
      )}
      style={{ ...(whisper ? {} : { borderColor: SLOT_COLOR[seat.slot] }), ...(dx ? { marginLeft: dx } : {}), ...(dy ? { marginTop: dy } : {}) }}
      data-testid={`chat-bubble-${line.from}`}
      data-line={line.id}
      data-place={place}
      role="status"
    >
      {whisper && <span className="mr-1 font-mono text-[10px] font-bold text-holo">🔒 TO {to}</span>}
      {line.text}
      {/* The tail still points at the speaker when the bubble has slid. */}
      <span aria-hidden className={cx('absolute', TAIL[place])} style={{ ...(side ? { top: `calc(50% - ${dy}px)` } : { left: `calc(50% - ${dx}px)` }), [TAIL_COLOR[place]]: edge }} />
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

/** The line whose bubble shows now when the screen draws no creature for its speaker, and that speaker's seat. */
function useFallback(): { line: ChatMessage; seat: Seat; me: string | null } | null {
  const { showing, anchors } = useTableChat();
  const { seats, me } = useSeats();
  const seat = showing && !anchors.has(showing.from) ? seats.get(showing.from) : undefined;
  return showing && seat ? { line: showing, seat, me } : null;
}

/** The bubble for a speaker the screen doesn't draw: to the LEFT of the guide, level with its parent's top, over the stage. */
function FallbackAt({ line, seat, me }: { line: ChatMessage; seat: Seat; me: string | null }) {
  return (
    <span className="pointer-events-none absolute right-full top-0 mr-3 h-[34px] @min-[1100px]/shell:mr-5" data-fallback>
      <Bubble line={line} seat={seat} me={me} guide />
    </span>
  );
}

/**
 * Everyone else at the table, in the guide: the fallback anchor for a speaker the screen doesn't draw. With `bubble`,
 * its parent must be positioned and span the guide's width: the fallback bubble opens to the LEFT of the guide, level
 * with the row, over the stage, so it never covers the ticker below the row. Without it, the rail places that bubble
 * itself (FallbackBubble). The speaking seat lights up.
 */
function SeatRow({ bubble = true }: { bubble?: boolean }) {
  const { seats, me } = useSeats();
  const said = useFallback();
  const fallback = said?.line ?? null;
  return (
    <>
      {/* Five others fit the narrowest rail on one line: a long name gives way (its whole name is its title), the creatures never do. */}
      <div className="flex min-w-0 items-center gap-1 @min-[1100px]/shell:gap-3" data-testid="seat-row">
        {[...seats.values()]
          .filter(({ player }) => player.id !== me)
          .map(({ player, slot }) => (
            <span
              key={player.id}
              className={cx('inline-flex min-w-6 flex-col items-center rounded-control px-0.5 transition-shadow', fallback?.from === player.id && 'ring-2')}
              style={fallback?.from === player.id ? { ['--tw-ring-color' as string]: SLOT_COLOR[slot] } : undefined}
              data-testid={`seat-${player.id}`}
              data-speaking={fallback?.from === player.id || undefined}
            >
              <Creature species={player.species} color={SLOT_COLOR[slot]} size={20} />
              <span className="max-w-full truncate font-mono text-[10px] text-ink-3" title={player.name}>
                {player.name}
              </span>
            </span>
          ))}
      </div>
      {bubble && said && <FallbackAt {...said} />}
    </>
  );
}

/**
 * The fallback bubble on its own, for a rail whose seat row is under its content (a phone): it opens to the left of the
 * guide, level with this zero-height anchor at the foot of the rail's header, so it shows while the seat row is
 * scrolled away. Its negative margin takes back the header's gap above it (gap-1, short: gap-0.5), so it costs the
 * rail nothing.
 */
export function FallbackBubble() {
  const said = useFallback();
  return <div className="relative -mt-1 h-0 short:-mt-0.5">{said && <FallbackAt {...said} />}</div>;
}

/**
 * The last few lines, newest first: `lines` of them, or the phone 2 and the TV 3. Each line is cut to one row, or with
 * `wrap` (a narrow column) runs on as one sentence, speaker and words together, over at most three rows. `wide` sets the
 * phone's lines in text-sm for a holder outside the shell's /shell container, where its own 1100 px step never fires.
 * A line never gives up its rows: a holder short of room cuts the oldest first, at its foot.
 */
export function Ticker({ size = 'phone', lines: keep, wrap = false, wide = false }: { size?: 'phone' | 'tv'; lines?: number; wrap?: boolean; wide?: boolean }) {
  const { lines } = useTableChat();
  const { seats } = useSeats();
  const tv = size === 'tv';
  const said = lines.filter((l) => seats.has(l.from));
  return (
    <ul className={cx('flex min-w-0 flex-col overflow-hidden', tv ? 'gap-1' : 'gap-0.5')} data-testid="chat-ticker" aria-label="Table chat" aria-live="polite">
      {said
        // From the end, by count: slice(-0) would keep them all, so none is an empty slice.
        .slice(Math.max(0, said.length - (keep ?? (tv ? 3 : 2))))
        .reverse()
        .map((l, i) => {
          const { player, slot } = seats.get(l.from)!;
          return (
            <li
              key={l.id}
              className={cx(
                'min-w-0 shrink-0',
                wrap ? 'line-clamp-3 leading-tight' : 'flex items-center gap-1.5 truncate',
                tv ? 'text-xl' : wide ? 'text-sm' : 'text-[11px] @min-[1100px]/shell:text-sm',
                i === 0 ? 'animate-[show-card-in_0.25s_ease-out] text-ink' : 'text-ink-3',
              )}
              data-testid={`chat-line-${l.id}`}
            >
              <span className={wrap ? 'mr-1 inline-block align-[-3px]' : 'contents'}>
                <Creature species={player.species} color={SLOT_COLOR[slot]} size={tv ? 22 : 14} />
              </span>
              <strong className={wrap ? undefined : 'shrink-0'}>
                {player.name}
                {l.to ? ' 🔒' : ''}:
              </strong>
              <span className={wrap ? undefined : 'truncate'}>
                {wrap ? ' ' : ''}
                {l.text}
              </span>
            </li>
          );
        })}
    </ul>
  );
}

/**
 * The guide's chat block: everyone's seat, the bubble's fallback anchor, and the last lines. `under`: the block that
 * follows the rail's content on a phone, its fallback bubble placed by FallbackBubble at the rail's top instead.
 */
export function TableChat({ under = false }: { under?: boolean }) {
  if (under)
    return (
      <div className="flex flex-col gap-1 border-t border-holo-faint pt-1.5" data-testid="table-chat">
        <SeatRow bubble={false} />
        <Ticker />
      </div>
    );
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
