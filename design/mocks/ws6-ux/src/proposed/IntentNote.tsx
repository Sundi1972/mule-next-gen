import { cx } from '@mule/ui';
import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Review furniture for the UX audit's mocks (docs/research/2026-10-28-ws6-ux-audit.md): a numbered marker on each
 * element a proposal changed, and beside the frames a panel that says, per number, what changed, which player intent
 * it serves (in the audit table's words) and why (the finding). Never part of the screen: the graft drops every
 * IntentMarker, and the notes panel lives on the review page, outside the phone.
 *
 * Hover or focus a note and its markers light up on every frame; "Show the numbers" hides them all, to see the
 * screen as a player would.
 */

export interface IntentNoteData {
  /** The proposal's id without the dash, as the testids use it: H1 for H-1. */
  id: string;
  /** Its number on the screens: ① for 1. */
  n: number;
  title: string;
  /** What changed, in one sentence. */
  what: string;
  /** "1", "1 and 2", or "cross-cutting" with the intents it helps. */
  serves: string;
  /** The intent's words from the audit table. */
  intent: string;
  /** The finding that made it, one sentence. */
  why: string;
  /** Where this mock departs from the audit's wording, and why. */
  differs?: string;
  /** Part of the proposal that lands on another screen, so is not drawn here. */
  elsewhere?: string;
  /** A question for Heiko the mock cannot settle. */
  open?: string;
  /** A change to the game's rules, not only its screens: what WS7 would build. Off unless given. */
  rule?: string;
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
export const circled = (n: number) => CIRCLED[n - 1] ?? `(${n})`;

const Focus = createContext<{ focus: string | null; setFocus: (id: string | null) => void; show: boolean; setShow: (on: boolean) => void }>({
  focus: null,
  setFocus: () => {},
  show: true,
  setShow: () => {},
});

/** Around the frames and the notes panel of one review page. */
export function IntentNotesProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [show, setShow] = useState(true);
  return <Focus.Provider value={{ focus, setFocus, show, setShow }}>{children}</Focus.Provider>;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br' | 'tl-in' | 'tr-in' | 'br-in' | 'left';
const CORNER: Record<Corner, string> = {
  tl: '-left-1.5 -top-1.5',
  tr: '-right-1.5 -top-1.5',
  bl: '-bottom-1.5 -left-1.5',
  br: '-bottom-1.5 -right-1.5',
  'tl-in': 'left-0.5 top-0.5',
  'tr-in': 'right-0.5 top-0.5',
  'br-in': 'bottom-0.5 right-0.5',
  /** Just outside the left edge, centred: for a line of text the number must not cover. */
  left: '-left-5 top-1/2 -translate-y-1/2 @min-[1100px]/shell:-left-7',
};

/**
 * The number on a changed element. Its parent must be `relative`. Plain clicks pass through it to the prototype, so
 * the screen still works under the markers. `part` tells two markers of one proposal apart (H3, H3-tool).
 */
export function IntentMarker({ note, part, at = 'tl' }: { note: Pick<IntentNoteData, 'id' | 'n' | 'title'>; part?: string; at?: Corner }) {
  const { focus, show } = useContext(Focus);
  if (!show) return null;
  const lit = focus === note.id;
  return (
    <span
      role="note"
      aria-label={`Change ${note.n}: ${note.title}`}
      className={cx(
        'pointer-events-none absolute z-30 grid size-4 place-items-center rounded-full bg-ink font-mono text-[10px] font-bold leading-none text-void shadow-chip ring-2 ring-table transition-transform @min-[1100px]/shell:size-6 @min-[1100px]/shell:text-sm',
        CORNER[at],
        lit && 'scale-150 bg-holo text-on-holo ring-holo-soft',
      )}
      data-testid={`intent-marker-${note.id}${part ? `-${part}` : ''}`}
    >
      {note.n}
    </span>
  );
}

/** The notes panel: one card per proposal, readable without the audit. */
export function IntentNotes({ title, intro, notes, className }: { title: string; intro: ReactNode; notes: IntentNoteData[]; className?: string }) {
  const { focus, setFocus, show, setShow } = useContext(Focus);
  return (
    <aside className={cx('flex flex-col gap-3 rounded-panel border border-holo-line bg-panel p-4', className)} aria-label="What changed and why" data-testid="intent-notes">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="text-sm text-ink-2">{intro}</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-[var(--color-holo)]" data-testid="intent-show" />
          Show the numbers on the screens
        </label>
      </header>
      <ol className="flex flex-col gap-2">
        {notes.map((n) => (
          <li
            key={n.id}
            tabIndex={0}
            onMouseEnter={() => setFocus(n.id)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(n.id)}
            onBlur={() => setFocus(null)}
            className={cx('flex flex-col gap-1 rounded-control border p-2.5 text-sm outline-none', focus === n.id ? 'border-holo bg-holo-soft' : 'border-holo-faint')}
            data-testid={`intent-note-${n.id}`}
          >
            <span className="flex items-baseline gap-2">
              <span className="font-display text-xl leading-none text-holo" aria-hidden>
                {circled(n.n)}
              </span>
              <span className="font-display font-semibold">
                {n.title} <span className="font-mono text-xs font-normal text-ink-3">{n.id.slice(0, 1)}-{n.id.slice(1)}</span>
              </span>
            </span>
            <span className="text-ink">{n.what}</span>
            <span className="text-ink-2" data-testid={`intent-serves-${n.id}`}>
              <strong className="font-semibold text-ink">Serves intent {n.serves}:</strong> “{n.intent}”
            </span>
            <span className="text-ink-2" data-testid={`intent-why-${n.id}`}>
              <strong className="font-semibold text-ink">Why:</strong> {n.why}
            </span>
            {n.differs && (
              <span className="text-ink-2">
                <strong className="font-semibold text-ink">Not as the audit wrote it:</strong> {n.differs}
              </span>
            )}
            {n.elsewhere && (
              <span className="text-ink-3">
                <strong className="font-semibold">On another screen, not drawn here:</strong> {n.elsewhere}
              </span>
            )}
            {n.rule && (
              <span className="rounded-chip border border-holo/60 px-1.5 py-0.5 text-ink-2" data-testid={`intent-rule-${n.id}`}>
                <strong className="font-semibold text-holo">A rule change: Heiko's decision.</strong> {n.rule}
              </span>
            )}
            {n.open && (
              <span className="rounded-chip border border-warn/50 px-1.5 py-0.5 text-warn" data-testid={`intent-open-${n.id}`}>
                <strong className="font-semibold">For you to decide:</strong> {n.open}
              </span>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
