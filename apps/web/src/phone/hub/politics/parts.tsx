import { POLITICS, SOCIAL_EVENTS, START, type DealCard } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { Button, Creature, cx, SLOT_COLOR } from '@mule/ui';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AiMark } from '../../../chat/Chat';
import { useEscape } from '../../dialog';
import { slotOf } from '../../../game/derive';
import { useHubIfAny } from '../Hub';
import { SeatWords } from '../../../components/SeatWords';
import { brokenMove, brokenWho, brokenWords, noNewCard } from './deals-words';

// The hub's navigation, or null outside it: Hub.tsx's, re-exported for the parts drawn both inside and outside it.
export { useHubIfAny };

export function Section({ title, children, testid }: { title: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section className="flex flex-col gap-1.5 @min-[1100px]/shell:gap-2" data-testid={testid}>
      <h3 className="label-caps flex items-center gap-1.5 @min-[1100px]/shell:text-xs!">{title}</h3>
      {children}
    </section>
  );
}

type NameView = Pick<MuleView, 'players'> & Partial<Pick<MuleView, 'politics' | 'me'>>;

/** Who on a deal card: the name, its chip, and the mark for a computer seat. */
export function CardWho(props: Parameters<typeof Who>[0]) {
  return <Who {...props} mark />;
}

export type Band = 'good' | 'fair' | 'low';

/** POLITICS.weight's thresholds: repHigh and up is a good name (+repVotes), under repLow a low one (−repVotes). */
export function bandOf(rep: number): Band {
  return rep >= POLITICS.weight.repHigh ? 'good' : rep < POLITICS.weight.repLow ? 'low' : 'fair';
}

const votes = (n: number) => `${n} ${n === 1 ? 'vote' : 'votes'}`;

/** A name's band in words, and AI seats' refusal under POLITICS.ai.deals.refuseBelow: a threshold of its own, not the band's. */
export function repWords(rep: number): string {
  const { repVotes } = POLITICS.weight;
  const band = bandOf(rep);
  const words = band === 'good' ? `Good name: +${votes(repVotes)}` : band === 'low' ? `Low name: −${votes(repVotes)}` : 'Fair name';
  const { refuseBelow } = POLITICS.ai.deals;
  if (rep >= refuseBelow) return words;
  return band === 'low' ? `${words}, and AI players turn down their cards` : `${words}, but AI players turn down cards under ${refuseBelow}`;
}

/** The player card's key to the chip: both thresholds, and the AI seats' own when it is not repLow. */
function repLegend(): string {
  const { repHigh, repLow, repVotes } = POLITICS.weight;
  const { refuseBelow } = POLITICS.ai.deals;
  const bands = `${repHigh} and up: +${votes(repVotes)}. Under ${repLow}: −${votes(repVotes)}`;
  return refuseBelow === repLow ? `${bands}, and AI players turn down their cards.` : `${bands}. Under ${refuseBelow}, AI players turn down their cards.`;
}

const STAR = 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z';
const WARN = 'M12 4l9 16H3z M12 10v4 M12 17v.01';

/** The band's mark: a star for a good name, a warning for a low one, nothing between. It says the band without colour. */
export function BandMark({ band, size }: { band: Band; size: number }) {
  if (band === 'fair') return null;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className="shrink-0" fill={band === 'good' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d={band === 'good' ? STAR : WARN} />
    </svg>
  );
}

const CHANGE_MS = 6000;

/** How much the value moved since it last changed, for CHANGE_MS; null otherwise. Nothing in the view records a move. */
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

const reputationOf = (view: Pick<MuleView, 'players'>, id: string) => view.players.find((q) => q.id === id)?.reputation ?? START.reputation;

/**
 * A player's reputation, beside their name: the number, its band's mark and edge, and for a few seconds its last move.
 * With `onOpen` it is a button (its hit area reaches past its edges); without, inside another control or on the TV, a label.
 */
export function RepChip({ view, id, tv = false, onOpen, testid }: { view: Pick<MuleView, 'players'>; id: string; tv?: boolean; onOpen?: () => void; testid?: string }) {
  const name = view.players.find((q) => q.id === id)?.name ?? id;
  const rep = reputationOf(view, id);
  const band = bandOf(rep);
  const change = useChange(rep);
  const s = SIZES[tv ? 'tv' : 'phone'];
  const tid = testid ?? `rep-${id}`;
  const label = `${name}: reputation ${rep}. ${repWords(rep)}.`;
  const body = (
    <>
      <BandMark band={band} size={s.mark} />
      <span data-num>{rep}</span>
      {change !== null && (
        <span className={cx('font-bold', change > 0 ? 'text-ok' : 'text-alert')} data-testid={`${tid}-change`}>
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
      <span className={cls} role="img" aria-label={label} data-testid={tid} data-band={band}>
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
      className={cx(cls, "before:absolute before:-inset-3 before:content-['']")}
      aria-label={`${label} Open ${name}'s card.`}
      data-testid={tid}
      data-band={band}
    >
      {body}
    </button>
  );
}

/**
 * A player by name, with their creature in their seat's colour; "You" for `me`. `rep` puts the chip after the name;
 * `mark` puts " · AI" between a computer seat's name and its chip; `open` makes the name and chip open the player's card.
 * Leave them off inside another control (a ballot's label) and in one-line tickers.
 */
export function Who({ view, id, size = 16, me = null, className, testid, rep = false, open = false, mark = false }: { view: NameView; id: string; size?: number; me?: string | null; className?: string; testid?: string; rep?: boolean; open?: boolean; mark?: boolean }) {
  const [card, setCard] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const p = view.players.find((q) => q.id === id);
  if (!p) return null;
  const tid = testid ?? `who-${id}`;
  const name = (
    <>
      <Creature species={p.species} color={colorOf(view, id)} size={size} />
      {id === me ? 'You' : p.name}
    </>
  );
  return (
    <span ref={anchor} className={cx('inline-flex items-center gap-1 font-semibold', className)} data-testid={testid}>
      {open ? (
        <button type="button" className="inline-flex items-center gap-1 underline decoration-holo-line decoration-dotted underline-offset-2" onClick={() => setCard(true)} data-testid={`${tid}-open`}>
          {name}
        </button>
      ) : (
        name
      )}
      {mark && p.isAi && <AiMark />}
      {rep && <RepChip view={view} id={id} {...(open ? { onOpen: () => setCard(true) } : {})} testid={`${tid}-rep`} />}
      {card && <PlayerCard view={view} id={id} me={me} anchor={anchor.current} onClose={() => setCard(false)} />}
    </span>
  );
}

/** The public reasons a player's reputation moved, in the words every screen uses, newest first. Kept cards are never one. */
export function reasonRows(view: NameView, id: string): { key: string; month: number; words: string; who: string[]; move: number }[] {
  const reasons = view.politics?.reputationReasons?.[id] ?? [];
  const broken = view.politics?.brokenDeals ?? [];
  const caught = new Map<number, number>();
  return reasons.flatMap((r) => {
    if (r.kind === 'caught') {
      // One row per incident: the reasons carry no id, so the n-th catch of its month. No figure (PM ruling): the view
      // holds the sabotage ban in force now, not the one the engine applied at the catch.
      const n = (caught.get(r.month) ?? 0) + 1;
      caught.set(r.month, n);
      return [{ key: `caught-${r.month}-${n}`, month: r.month, words: 'Caught sabotaging', who: [], move: 0 }];
    }
    if (r.kind === 'unrest') return [{ key: `unrest-${r.month}`, month: r.month, words: 'Blamed for the unrest', who: [], move: SOCIAL_EVENTS.player.blamedForUnrest.reputation }];
    const c = broken.find((x: DealCard) => x.id === r.id);
    if (!c) return [];
    return [{ key: c.id, month: c.settled ?? 0, words: brokenWords(view, c, false), who: brokenWho(c, false), move: brokenMove(c) }];
  });
}

/** Where a sheet over the phone goes: the shell, so it covers the stage and the rail at the device's size. */
export function shellOf(el: Element | null): Element | null {
  return el?.closest('[data-testid="game-shell"]') ?? null;
}

/** The first control in a dialog that can take the focus. */
export const FIRST_CONTROL = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]';

/** The open dialogs, the newest last: Escape closes only the one on top. */
const dialogs: object[] = [];

/**
 * A dialog's keyboard, as the lobby's dialogs keep it: Escape closes it when it is on top; on open the element `first`
 * finds takes the focus (by default its button marked `data-autofocus`), and on close the focus goes back to the element
 * that had it. If that element is gone (a tab switch unmounted it) or off (+ Deal after a send), the open tab takes the
 * focus instead, as ARIA tabs do. Put the returned ref on the dialog's box.
 */
export function useDialog(onClose: () => void, first = '[data-autofocus]'): RefObject<HTMLDivElement> {
  const box = useRef<HTMLDivElement>(null);
  const [self] = useState(() => ({}));
  // Both handlers see one Escape before either dialog unmounts, so the one under the top stays.
  useEscape(useCallback(() => dialogs.at(-1) === self && onClose(), [self, onClose]));
  useEffect(() => {
    dialogs.push(self);
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector?.<HTMLElement>(first)?.focus?.();
    return () => {
      dialogs.splice(dialogs.indexOf(self), 1);
      // :disabled covers a disabled fieldset around the opener too, which its own attribute would not say.
      const back = opener?.isConnected && !opener.matches(':disabled') ? opener : document.querySelector?.<HTMLElement>('[role=tab][aria-selected=true]');
      back?.focus?.();
    };
  }, [self, first]);
  return box;
}

/**
 * The player's card, from their chip or name: their reputation and its band in words, the public reasons it moved, and
 * in the hub, Whisper and + Deal.
 */
export function PlayerCard({ view, id, me, anchor, onClose }: { view: NameView; id: string; me: string | null; anchor: Element | null; onClose: () => void }) {
  const hub = useHubIfAny();
  const box = useDialog(onClose);
  const p = view.players.find((q) => q.id === id)!;
  const rep = reputationOf(view, id);
  const rows = reasonRows(view, id);
  const mine = id === me;
  // S3-RULE-2 row 5: the same check as every other "+ Deal" door; the composer refuses too.
  const waiting = view.me && !mine ? noNewCard(view, view.me, id) : null;
  const go = (focus: string) => {
    onClose();
    hub?.openDesk('talk', focus);
  };
  const sheet = (
    <div ref={box} className="absolute inset-0 z-50 grid place-items-center bg-void/70 p-3" role="dialog" aria-modal aria-label={`${p.name}'s card`} onClick={onClose} data-testid={`player-card-${id}`}>
      <div className="flex w-full max-w-[340px] flex-col gap-2 rounded-sheet border-2 border-holo bg-panel p-3 shadow-glow" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2">
          <Creature species={p.species} color={colorOf(view, id)} size={22} />
          <h2 className="font-display text-lg font-semibold leading-tight">{mine ? `You (${p.name})` : p.name}</h2>
          <RepChip view={view} id={id} testid={`player-card-${id}-rep`} />
          <Button size="md" variant="ghost" className="ml-auto -mr-2" onClick={onClose} data-autofocus data-testid={`player-card-${id}-close`}>
            Close
          </Button>
        </header>
        <p className="text-sm leading-snug" data-testid={`player-card-${id}-band`}>
          <strong className="font-semibold">Reputation {rep}</strong> · {repWords(rep)}.
        </p>
        <p className="text-[11px] leading-snug text-ink-2" data-testid={`player-card-${id}-legend`}>
          {repLegend()}
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
                    <SeatWords text={r.words} who={r.who} players={view.players} />
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
            <Button size="md" disabled={!!waiting} title={waiting ?? undefined} onClick={() => go(`compose:${id}`)} data-testid={`player-card-${id}-deal`}>
              + Deal
            </Button>
            {waiting && (
              <span className="col-span-2 text-center text-[11px] leading-snug text-ink-2" data-testid={`player-card-${id}-deal-no`}>
                {waiting}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
  const shell = shellOf(anchor);
  return shell ? createPortal(sheet, shell) : sheet;
}

/** A row of names, each Who with its chip and card. */
export function Names({ view, ids, me, children }: { view: NameView; ids: string[]; me: string | null; children?: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {children}
      {ids.map((id) => (
        <Who key={id} view={view} id={id} me={me} rep open testid={`names-${id}`} />
      ))}
    </span>
  );
}

/** A player by creature and name, on one line; "You" on your own screen. */
export function Person({ view, id, me, size = 16, className }: { view: Pick<MuleView, 'players'>; id: string; me: string | null; size?: number; className?: string }) {
  return <Who view={view} id={id} me={me} size={size} className={cx('whitespace-nowrap', className)} testid={`person-${id}`} />;
}

/** A seat's colour, for vote blocks. */
export const colorOf = (view: Pick<MuleView, 'players'>, id: string) => SLOT_COLOR[slotOf(view, id) ?? 0];

const STEPS = ['Who runs', 'Vote', 'Reveal'] as const;

/** Election day's three steps, the current one lit: no clock on any of them. */
export function Steps({ at, tv = false }: { at: 1 | 2 | 3; tv?: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5" aria-label={`Step ${at} of 3`} data-testid="election-steps">
      {STEPS.map((s, i) => {
        const n = i + 1;
        return (
          <li key={s} className="flex items-center gap-1" aria-current={n === at ? 'step' : undefined} data-testid={`election-step-${n}`}>
            {i > 0 && (
              <svg aria-hidden viewBox="0 0 24 24" width={tv ? 20 : 10} height={tv ? 20 : 10} className="text-ink-3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
            <span
              className={cx(
                'whitespace-nowrap rounded-chip font-semibold',
                tv ? 'px-3 text-2xl leading-10' : 'px-1.5 text-[11px] leading-5 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-base @min-[1100px]/shell:leading-8',
                n === at ? 'bg-holo text-on-holo' : n < at ? 'text-ok' : 'text-ink-2',
              )}
            >
              {n} {s}
              {n < at && ' ✓'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** E-3: what the elected offices are for, in one card; the Sheriff's line only while the Sheriff is elected (S4-C16). */
export function OfficesCard({ tv = false }: { tv?: boolean }) {
  const sheriff = POLITICS.offices.includes('sheriff');
  const { guards, investigations } = POLITICS.sheriff;
  return (
    <section
      className={cx('relative flex min-w-0 flex-col rounded-panel border border-holo-line bg-panel', tv ? 'gap-2 px-6 py-4' : 'gap-1 p-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-4')}
      data-testid="offices-card"
    >
      <span className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]! @min-[1100px]/shell:text-xs!')}>{sheriff ? 'What the offices do' : 'What the Governor does'}</span>
      <dl className={cx('grid grid-cols-[auto_1fr] gap-x-2 leading-snug', tv ? 'gap-y-1 text-xl' : 'gap-y-0.5 text-xs @min-[1100px]/shell:gap-y-1 @min-[1100px]/shell:text-sm')}>
        <dt className="font-semibold">Governor</dt>
        <dd data-testid="job-governor">
          Sets the sales tax each month; the tax fills the colony fund. Paid {POLITICS.pay.governor} cr a month.
        </dd>
        {sheriff && (
          <>
            <dt className="font-semibold">Sheriff</dt>
            <dd data-testid="job-sheriff">
              Posts {guards} secret guards a month, investigates {investigations === 1 ? 'one' : investigations} sabotage{investigations === 1 ? '' : 's'}, and fines the culprits. Paid {POLITICS.pay.sheriff} cr a month.
            </dd>
          </>
        )}
      </dl>
      <span className={cx('text-ink-2', tv ? 'text-lg' : 'text-[11px] @min-[1100px]/shell:text-sm')} data-testid="job-term">
        {sheriff && 'Nobody holds both. '}A term lasts until the next election and adds {POLITICS.termScore} to your final score.
      </span>
    </section>
  );
}
