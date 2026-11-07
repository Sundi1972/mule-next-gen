import { POLITICS } from '@mule/engine';
import type { DealCard } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { Button, Creature, cx } from '@mule/ui';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useHub, type HubNav } from '../../../../../apps/web/src/phone/hub/Hub';
import { colorOf } from '../../../../../apps/web/src/phone/hub/politics/parts';
import { MOVES, UNREST_MOVE } from '../fixture';
import { brokenWords } from './words';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/politics/parts.tsx (WS7 path). P4: the reputation chip, and Who with it.
 * Who gains `rep` (the chip after the name) and `open` (the name and chip open the player's card). The player's card is
 * also where a deal starts from a name (P1's "from the avatar or name", S3-C17).
 */

// ---- Heiko's AI-mark ruling (#684): a computer seat's name on a deal card carries "· AI" ----------------------------------

/**
 * Stand-in for chat/Chat.tsx's AiMark (team-lead: landing on trunk shortly); the build imports that one. Exactly the
 * Talk list's mark (apps/web/src/phone/parts.tsx:168).
 */
export function AiMark() {
  return (
    <span className="text-holo" data-testid="ai-mark">
      {' '}
      · AI
    </span>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A card's words with the mark after each computer seat's name. Not after a possessive ("Ossa’s vote"): there the
 * card's label carries it ("Card from Ossa · AI").
 */
export function Marked({ text, view }: { text: string; view: Pick<MuleView, 'players'> }) {
  const ai = view.players.filter((p) => p.isAi).map((p) => escapeRe(p.name));
  if (ai.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`\\b(${ai.join('|')})\\b(?![’']s)`, 'g'));
  return <>{parts.map((p, i) => (i % 2 === 1 ? <Fragment key={i}>{p}<AiMark /></Fragment> : p))}</>;
}

/** Who on a card: the name, its chip, and the mark for a computer seat. */
export function CardWho(props: Parameters<typeof Who>[0]) {
  return <Who {...props} mark />;
}

// ---- P4 · the chip ------------------------------------------------------------------------------------------

export type Band = 'good' | 'fair' | 'low';

/** POLITICS.weight's thresholds: 70 and up is a good name (+1 vote), under 30 a low one (−1 vote, AI seats refuse). */
export function bandOf(rep: number): Band {
  return rep >= POLITICS.weight.repHigh ? 'good' : rep < POLITICS.weight.repLow ? 'low' : 'fair';
}

export const BAND_WORDS: Record<Band, string> = {
  good: 'Good name: +1 vote',
  fair: 'Fair name',
  low: 'Low name: −1 vote, and AI players turn down their cards',
};

const STAR = 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z';
const WARN = 'M12 4l9 16H3z M12 10v4 M12 17v.01';

/** The band's mark: a star at 70+, a warning under 30, nothing between. It says the band without colour. */
export function BandMark({ band, size }: { band: Band; size: number }) {
  if (band === 'fair') return null;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className="shrink-0" fill={band === 'good' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d={band === 'good' ? STAR : WARN} />
    </svg>
  );
}

/**
 * The reputation shown a moment ago, so the chip can say what just changed (+3, −10) for a few seconds. Derived on the
 * phone from the views it already had: nothing in the contract records a move (S3-RULE-7).
 */
const CHANGE_MS = 6000;
function useChange(value: number): number | null {
  const last = useRef(value);
  const [change, setChange] = useState<number | null>(null);
  useEffect(() => {
    if (value === last.current) return;
    setChange(value - last.current);
    last.current = value;
    const t = setTimeout(() => setChange(null), CHANGE_MS);
    return () => clearTimeout(t);
  }, [value]);
  return change;
}

const SIZES = {
  phone: { box: 'h-4 gap-0.5 px-1 text-[10px] leading-4', mark: 9 },
  tv: { box: 'h-8 gap-1 px-2 text-xl leading-8', mark: 18 },
} as const;

/**
 * P4: a player's reputation, beside their name. The number always; a star at 70+ and a dashed edge with a warning under
 * 30, so the band reads without colour. `onOpen`: the chip is a button that opens the player's card (its hit area
 * reaches past its edges); without it, inside another control or on the TV, it is a plain label.
 */
export function RepChip({ view, id, tv = false, onOpen, testid }: { view: Pick<MuleView, 'players'>; id: string; tv?: boolean; onOpen?: () => void; testid?: string }) {
  const p = view.players.find((q) => q.id === id);
  const rep = p?.reputation ?? 50;
  const band = bandOf(rep);
  const change = useChange(rep);
  const s = SIZES[tv ? 'tv' : 'phone'];
  const label = `${p?.name ?? id}: reputation ${rep}. ${BAND_WORDS[band]}.`;
  const body = (
    <>
      <BandMark band={band} size={s.mark} />
      <span data-num>{rep}</span>
      {change !== null && (
        <span className={cx('font-bold', change > 0 ? 'text-ok' : 'text-alert')} data-testid={`${testid ?? `rep-${id}`}-change`}>
          {change > 0 ? `+${change}` : `−${-change}`}
        </span>
      )}
    </>
  );
  const cls = cx(
    'relative inline-flex shrink-0 items-center whitespace-nowrap rounded-chip border font-mono font-bold',
    s.box,
    band === 'good' && 'border-ok text-ok',
    band === 'fair' && 'border-holo-line text-ink-2',
    band === 'low' && 'border-dashed border-alert text-alert',
    change !== null && 'animate-[show-card-in_0.4s_ease-out]',
  );
  if (!onOpen)
    return (
      <span className={cls} role="img" aria-label={label} data-testid={testid ?? `rep-${id}`} data-band={band}>
        {body}
      </span>
    );
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      // The chip is small; its hit area is not: 12 px past each edge.
      className={cx(cls, "before:absolute before:-inset-3 before:content-['']")}
      aria-label={`${label} Open ${p?.name ?? id}'s card.`}
      data-testid={testid ?? `rep-${id}`}
      data-band={band}
    >
      {body}
    </button>
  );
}

// ---- Who, with the chip ---------------------------------------------------------------------------------------

/**
 * A player by name, with their creature in their seat's colour; "You" for `me`. As parts.tsx::Who today, plus: `rep`
 * puts the chip after the name; `mark` puts " · AI" between a computer seat's name and its chip; `open` makes the name a button to the player's card (whisper, deal, reasons). Leave
 * both off inside another control (a ballot's label) and in one-line tickers (P0's rule).
 */
export function Who({ view, id, size = 16, me = null, className, testid, rep = false, open = false, mark = false }: { view: Pick<MuleView, 'players' | 'politics'>; id: string; size?: number; me?: string | null; className?: string; testid?: string; rep?: boolean; open?: boolean; mark?: boolean }) {
  const [card, setCard] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const p = view.players.find((q) => q.id === id);
  if (!p) return null;
  const name = (
    <>
      <Creature species={p.species} color={colorOf(view, id)} size={size} />
      {id === me ? 'You' : p.name}
    </>
  );
  return (
    <span ref={anchor} className={cx('inline-flex items-center gap-1 font-semibold', className)} data-testid={testid}>
      {open ? (
        <button type="button" className="inline-flex items-center gap-1 underline decoration-holo-line decoration-dotted underline-offset-2" onClick={() => setCard(true)} data-testid={`${testid ?? `who-${id}`}-open`}>
          {name}
        </button>
      ) : (
        name
      )}
      {/* The AI-mark ruling: after the name, before the chip. */}
      {mark && p.isAi && <AiMark />}
      {rep && <RepChip view={view} id={id} {...(open ? { onOpen: () => setCard(true) } : {})} testid={`${testid ?? `who-${id}`}-rep`} />}
      {card && <PlayerCard view={view} id={id} me={me} anchor={anchor.current} onClose={() => setCard(false)} />}
    </span>
  );
}

// ---- The player's card: the chip's tap, and a deal from a name ------------------------------------------------

/** The hub's navigation when inside it; null elsewhere (the month end, a sheet outside the hub). */
export function useHubIfAny(): HubNav | null {
  // Hub.tsx exports useHub only, which throws outside the hub. The build adds a non-throwing twin beside it.
  try {
    return useHub();
  } catch {
    return null;
  }
}

/** The month a reason happened and what it cost, in the words every screen uses. */
export function reasonRows(view: Pick<MuleView, 'players' | 'politics'>, id: string): { key: string; month: number; words: string; move: number }[] {
  const reasons = view.politics?.reputationReasons?.[id] ?? [];
  const broken = view.politics?.brokenDeals ?? [];
  return reasons.flatMap((r) => {
    if (r.kind === 'unrest') return [{ key: `unrest-${r.month}`, month: r.month, words: 'Blamed for the unrest', move: UNREST_MOVE }];
    if (r.kind === 'caught') return [{ key: `caught-${r.month}`, month: r.month, words: 'Caught sabotaging', move: 0 }];
    const c = broken.find((x: DealCard) => x.id === r.id);
    if (!c) return [];
    return [{ key: c.id, month: c.settled ?? 0, words: brokenWords(view, c, false), move: c.terms.kind === 'pact' ? MOVES.pactBroken : MOVES.voteBroken }];
  });
}

/** Where a sheet over the phone goes: the shell itself, so it covers the stage and the rail at the device's size. */
export function shellOf(el: Element | null): Element | null {
  return el?.closest('[data-testid="game-shell"]') ?? null;
}

/**
 * The player's card (P4's tap, P1's entry from a name): their reputation and its band in words, the public reasons it
 * moved (broken cards, unrest; a kept card never shows, only the number rising), and, in planning, Whisper and + Deal.
 */
export function PlayerCard({ view, id, me, anchor, onClose }: { view: Pick<MuleView, 'players' | 'politics'>; id: string; me: string | null; anchor: Element | null; onClose: () => void }) {
  const hub = useHubIfAny();
  const p = view.players.find((q) => q.id === id)!;
  const rep = p.reputation ?? 50;
  const band = bandOf(rep);
  const rows = reasonRows(view, id);
  const mine = id === me;
  const go = (focus: string) => {
    onClose();
    hub?.openDesk('talk', focus);
  };
  const sheet = (
    <div className="absolute inset-0 z-50 grid place-items-center bg-void/70 p-3" role="dialog" aria-modal aria-label={`${p.name}'s card`} onClick={onClose} data-testid={`player-card-${id}`}>
      <div className="flex w-full max-w-[340px] flex-col gap-2 rounded-sheet border-2 border-holo bg-panel p-3 shadow-glow" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2">
          <Creature species={p.species} color={colorOf(view, id)} size={22} />
          <h2 className="font-display text-lg font-semibold leading-tight">{mine ? `You (${p.name})` : p.name}</h2>
          <RepChip view={view} id={id} testid={`player-card-${id}-rep`} />
          <Button size="md" variant="ghost" className="ml-auto -mr-2" onClick={onClose} data-testid={`player-card-${id}-close`}>
            Close
          </Button>
        </header>
        <p className="text-sm leading-snug" data-testid={`player-card-${id}-band`}>
          <strong className="font-semibold">Reputation {rep}</strong> · {BAND_WORDS[band]}.
        </p>
        <p className="text-[11px] leading-snug text-ink-2">
          {POLITICS.weight.repHigh} and up: +1 vote. Under {POLITICS.weight.repLow}: −1 vote, and AI players turn down their cards.
        </p>
        <section className="flex flex-col gap-1" data-testid={`player-card-${id}-reasons`}>
          <span className="label-caps text-[10px]!">What moved it, in public</span>
          {rows.length === 0 ? (
            <span className="text-xs text-ink-3">Nothing public. A kept card never shows here, only the number rising.</span>
          ) : (
            <ul className="flex flex-col gap-0.5 text-xs">
              {rows.map((r) => (
                <li key={r.key} className="flex items-baseline gap-2" data-testid={`reason-${r.key}`}>
                  <span className="shrink-0 font-mono text-[10px] text-ink-3">M{r.month}</span>
                  <span className="min-w-0 flex-1">
                    <Marked text={r.words} view={view} />
                  </span>
                  {r.move !== 0 && (
                    <span data-num className="shrink-0 font-mono font-bold text-alert">
                      −{-r.move}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {hub && !mine && (
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="md" variant="outline" onClick={() => go(`whisper:${id}`)} data-testid={`player-card-${id}-whisper`}>
              Whisper
            </Button>
            <Button size="md" onClick={() => go(`compose:${id}`)} data-testid={`player-card-${id}-deal`}>
              + Deal
            </Button>
          </div>
        )}
      </div>
    </div>
  );
  const shell = shellOf(anchor);
  return shell ? createPortal(sheet, shell) : sheet;
}

/** A one-off row of names for a specimen: each Who with its chip. */
export function Names({ view, ids, me, children }: { view: Pick<MuleView, 'players' | 'politics'>; ids: string[]; me: string | null; children?: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {children}
      {ids.map((id) => (
        <Who key={id} view={view} id={id} me={me} rep open testid={`names-${id}`} />
      ))}
    </span>
  );
}
