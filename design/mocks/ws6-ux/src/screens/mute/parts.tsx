import type { ChatMessage } from '@mule/protocol';
import { Button, Creature, cx, PlayerMark, SLOT_COLOR, type Slot } from '@mule/ui';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { IntentMarker } from '../../proposed/IntentNote';
import { LINES, ME_ID, MUTE_VIEW, OFFER, type MuteState } from './fixture';
import { MUTE_NOTES } from './notes';

/**
 * Muting an AI on your phone (spec B, HC-B2; Heiko approved it 29 Oct). One switch per AI seat, kept by the phone's
 * seat for the rest of the game, reached in two places: the AI's seat in the rail's seat row (every phase) and its
 * channel on the hub's Talk desk (planning). Muted, that AI's whispers, unprompted public lines and card offers stop
 * reaching this phone; its seat, its moves and its bids never change, nor does the TV (the default) or anyone else's
 * phone.
 *
 * The chat parts here are the product's (apps/web/src/chat/Chat.tsx: seat row, ticker, fallback bubble; and
 * apps/web/src/phone/parts.tsx::Chat: the channel pills), copied class for class and given the mute. They read the
 * page's fixture instead of the client's store, so each state draws without a server.
 *
 * GRAFT TARGETS: apps/web/src/chat/Chat.tsx (SeatRow, Ticker, the bubble's line), apps/web/src/phone/parts.tsx::Chat
 * (the channel pills, the channel's head, the placeholder), apps/web/src/table/TableApp.tsx::TvTicker (only for the
 * alternative). The intent is spec B's C7 `mute` (a MuleIntent, WS3's seam).
 * Testids: seat-<id>, mute-<id> (the seat's switch), mute-<id>-talk (the channel's), muted-<id> (the mark on the seat),
 * muted-<id>-channel, muted-<id>-tv, whisper-placeholder, offer-<id>, mute-confirm, chat-ticker, tv-ticker.
 */

type Seat = { id: string; name: string; isAi: boolean; species: (typeof MUTE_VIEW.players)[number]['species']; slot: Slot };
export const SEATS: Record<string, Seat> = Object.fromEntries(
  MUTE_VIEW.players.map((p, i) => [p.id, { id: p.id, name: p.name, isAi: p.isAi, species: p.species, slot: i as Slot }]),
);
const OTHERS = MUTE_VIEW.players.filter((p) => p.id !== ME_ID).map((p) => SEATS[p.id]!);

/** How long the confirmation stays in the ticker's place after a tap. */
export const CONFIRM_MS = 4000;

interface Mute {
  muted: ReadonlySet<string>;
  toggle(id: string): void;
  /** The last tap, said in the ticker's place until CONFIRM_MS has passed. */
  confirm: { id: string; muted: boolean } | null;
  /** The mock's drawn tap, on the control it lands on, until someone taps for real. */
  tap: string | null;
  /** Lines said while their AI was muted: never replayed. */
  missed: ReadonlySet<number>;
  /** The alternative: the host's mute hides its public lines on the TV too. */
  tvHides: boolean;
}

const MuteContext = createContext<Mute | null>(null);
export function useMute(): Mute {
  const m = useContext(MuteContext);
  if (!m) throw new Error('Not inside MuteProvider');
  return m;
}

/** One Heiko: every frame on the page shares the same switches. */
export function MuteProvider({ state, children }: { state: MuteState; children: ReactNode }) {
  const [muted, setMuted] = useState<ReadonlySet<string>>(() => new Set(state.muted));
  const [missed, setMissed] = useState<ReadonlySet<number>>(() => new Set(state.missed ?? []));
  const [confirm, setConfirm] = useState(state.tap ?? null);
  const [tap, setTap] = useState(state.tap?.id ?? null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const toggle = (id: string) => {
    const on = !muted.has(id);
    const next = new Set(muted);
    if (on) next.add(id);
    else {
      next.delete(id);
      // Whatever it said while muted stays unsaid on this phone: an unmute shows only what comes next.
      setMissed(new Set([...missed, ...LINES.filter((l) => l.from === id).map((l) => l.id)]));
    }
    setMuted(next);
    setTap(null);
    setConfirm({ id, muted: on });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirm(null), CONFIRM_MS);
  };
  return <MuteContext.Provider value={{ muted, toggle, confirm, tap, missed, tvHides: !!state.tvHides }}>{children}</MuteContext.Provider>;
}

/** What this phone shows of the talk: its whispers, everyone's public lines, none from an AI it muted. Pure. */
export function phoneLines(lines: ChatMessage[], me: string, muted: ReadonlySet<string>, missed: ReadonlySet<number>): ChatMessage[] {
  return lines.filter((l) => (!l.to || l.to === me || l.from === me) && !muted.has(l.from) && !missed.has(l.id));
}

/** What the TV shows: public lines only; a host's mute removes them only in the alternative. Pure. */
export function tvLines(lines: ChatMessage[], hostMuted: ReadonlySet<string>, tvHides: boolean): ChatMessage[] {
  return lines.filter((l) => !l.to && !(tvHides && hostMuted.has(l.from)));
}

/** The Talk desk's glyph (apps/web/src/phone/hub/today.tsx), slashed when muted. */
export function TalkGlyph({ muted, size = 12, className }: { muted: boolean; size?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 5h16v10H9l-5 4z" />
      {muted && <path d="M3 2.5l18 18" />}
    </svg>
  );
}

/** A speech bubble to the left of the guide, level with the seat row: the product's fallback Bubble, unchanged. */
function SeatBubble({ line }: { line: ChatMessage }) {
  const seat = SEATS[line.from]!;
  const whisper = !!line.to;
  const edge = whisper ? 'var(--color-holo)' : SLOT_COLOR[seat.slot];
  return (
    <span
      className={cx(
        'pointer-events-none absolute right-full top-1/2 z-30 mr-2 w-max max-w-[220px] -translate-y-1/2 animate-[show-card-in_0.25s_ease-out] rounded-panel border-2 bg-panel px-2.5 py-1 text-xs font-semibold leading-snug shadow-chip @min-[1100px]/shell:text-sm',
        whisper && 'border-dashed border-holo',
      )}
      style={whisper ? undefined : { borderColor: SLOT_COLOR[seat.slot] }}
      data-testid={`chat-bubble-${line.from}`}
      role="status"
    >
      {whisper && <span className="mr-1 font-mono text-[9px] font-bold text-holo">🔒 TO YOU</span>}
      {line.text}
      <span aria-hidden className="absolute left-full top-1/2 -translate-y-1/2 border-y-[6px] border-l-[7px] border-y-transparent" style={{ borderLeftColor: edge }} />
    </span>
  );
}

/** The drawn tap: review furniture on the control it lands on. */
function TapHint() {
  return <span aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-full border-2 border-holo animate-[mute-tap_1.1s_ease-out_infinite]" data-testid="tap-hint" />;
}

/**
 * Everyone else at the table, as the product's seat row draws them. An AI's seat is its own mute switch: the whole
 * seat (creature, name, the talk mark on its creature) is one button of at least 32 × 32. A human's seat is not.
 */
function SeatRow({ speaking }: { speaking: string | null }) {
  const { muted, toggle, tap } = useMute();
  return (
    <div className="flex min-w-0 items-center gap-1 @min-[1100px]/shell:gap-3" data-testid="seat-row">
      {OTHERS.map((s) => {
        const off = muted.has(s.id);
        const body = (
          <>
            <span className="relative inline-flex">
              <Creature species={s.species} color={SLOT_COLOR[s.slot]} size={20} />
              {s.isAi && (
                <span
                  className={cx('absolute -right-2 -top-1 grid size-3.5 place-items-center rounded-full bg-panel ring-1', off ? 'text-warn ring-warn/70' : 'text-ink-3 ring-holo-line')}
                  {...(off ? { 'data-testid': `muted-${s.id}` } : {})}
                >
                  <TalkGlyph muted={off} size={9} />
                </span>
              )}
            </span>
            <span className={cx('max-w-full truncate font-mono text-[9px] @min-[1100px]/shell:text-[10px]', off ? 'text-warn' : 'text-ink-3')} title={s.name}>
              {s.name}
            </span>
          </>
        );
        const ring = speaking === s.id ? { ['--tw-ring-color' as string]: SLOT_COLOR[s.slot] } : undefined;
        return (
          <span key={s.id} className="relative inline-flex min-w-0" data-testid={`seat-${s.id}`} data-speaking={speaking === s.id || undefined} data-muted={off || undefined}>
            {s.id === 'baron' && <IntentMarker note={MUTE_NOTES.M1} at="tl" />}
            {s.isAi ? (
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-pressed={off}
                aria-label={off ? `Unmute ${s.name} on your phone` : `Mute ${s.name} on your phone`}
                title={off ? `${s.name} is muted on your phone. Tap to unmute.` : `Tap to mute ${s.name} on your phone`}
                className={cx(
                  'relative inline-flex min-h-8 min-w-8 max-w-full flex-col items-center justify-center rounded-control px-1 transition-shadow hover:bg-holo-soft',
                  speaking === s.id && 'ring-2',
                  off && 'bg-warn/10',
                )}
                style={ring}
                data-testid={`mute-${s.id}`}
              >
                {body}
                {tap === s.id && <TapHint />}
              </button>
            ) : (
              <span className={cx('inline-flex min-h-8 min-w-6 flex-col items-center justify-center rounded-control px-0.5', speaking === s.id && 'ring-2')} style={ring}>
                {body}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** The product's ticker: the last 2 lines this phone may show, newest first. */
function PhoneTicker({ lines }: { lines: ChatMessage[] }) {
  return (
    <ul className="flex flex-col gap-0.5 overflow-hidden" data-testid="chat-ticker" aria-label="Table chat" aria-live="polite">
      {lines
        .slice(-2)
        .reverse()
        .map((l, i) => {
          const s = SEATS[l.from]!;
          return (
            <li key={l.id} className={cx('flex min-w-0 items-center gap-1.5 truncate text-[11px] @min-[1100px]/shell:text-sm', i === 0 ? 'text-ink' : 'text-ink-3')} data-testid={`chat-line-${l.id}`}>
              <Creature species={s.species} color={SLOT_COLOR[s.slot]} size={14} />
              <strong className="shrink-0">
                {s.name}
                {l.to ? ' 🔒' : ''}:
              </strong>
              <span className="truncate">{l.text}</span>
            </li>
          );
        })}
    </ul>
  );
}

/** The tap's answer, in the ticker's place and its height, so nothing under it moves. */
function Confirm({ id, muted }: { id: string; muted: boolean }) {
  const { toggle } = useMute();
  const s = SEATS[id]!;
  return (
    <div role="status" className="flex h-8 min-w-0 items-center gap-1.5 text-[11px] @min-[1100px]/shell:text-sm" data-testid="mute-confirm" data-muted={muted}>
      <TalkGlyph muted={muted} size={14} className={cx('shrink-0', muted ? 'text-warn' : 'text-holo')} />
      <span className="min-w-0 flex-1 truncate">
        <strong>{s.name}</strong> {muted ? 'muted on your phone' : 'unmuted: new lines show'}
      </span>
      {muted && (
        <button type="button" onClick={() => toggle(id)} className="h-8 shrink-0 rounded-chip border border-holo-line px-2 font-semibold text-holo hover:border-holo" data-testid="mute-undo">
          Undo
        </button>
      )}
    </div>
  );
}

/** The guide's chat block (the product's TableChat): the seat row with its switches, then the ticker or the tap's answer. */
export function MuteTableChat() {
  const { muted, missed, confirm } = useMute();
  const lines = phoneLines(LINES, ME_ID, muted, missed);
  // The newest line pops at its seat, unless it is a muted AI's: then nothing pops (an older line never re-pops).
  const newest = phoneLines(LINES, ME_ID, new Set(), missed).at(-1) ?? null;
  const bubble = newest && newest.from !== ME_ID && !muted.has(newest.from) ? newest : null;
  return (
    <div className="relative flex flex-col gap-1 border-t border-holo-faint pt-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:pt-2.5" data-testid="table-chat">
      <SeatRow speaking={bubble?.from ?? null} />
      {bubble && (
        <span className="pointer-events-none absolute right-full top-0 mr-3 h-[34px] @min-[1100px]/shell:mr-5" data-fallback>
          <SeatBubble line={bubble} />
        </span>
      )}
      <div className="relative">
        <IntentMarker note={MUTE_NOTES.M4} part="ticker" at="left" />
        {confirm ? <Confirm {...confirm} /> : <PhoneTicker lines={lines} />}
      </div>
    </div>
  );
}

/** The product's channel pill (apps/web/src/phone/parts.tsx::Chat), with an AI's talk mark; 32 px tall under 1100 px, 36 from there. */
function Pill({ active, onClick, children, testid }: { active: boolean; onClick(): void; children: ReactNode; testid: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx('flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-semibold @min-[1100px]/shell:h-9 @min-[1100px]/shell:gap-1.5 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-sm', active ? 'border-holo bg-holo-soft text-holo' : 'border-holo-faint text-ink-2')}
      data-testid={testid}
    >
      {children}
    </button>
  );
}

/** A line in a channel: the product's ChatLine. */
function ChannelLine({ line }: { line: ChatMessage }) {
  const s = SEATS[line.from]!;
  return (
    <li className="flex gap-2.5">
      <PlayerMark slot={s.slot} size={14} />
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-ink-2">
          {s.name}
          {s.isAi && <span className="text-holo"> · AI</span>}
        </span>
        <span className="leading-snug">{line.text}</span>
      </div>
    </li>
  );
}

/**
 * The AI's card offer. Its shape is WS7's deal card as the approved planning mock draws it (PlanningHub.tsx's Talk
 * desk: "Deal card from Ossa"), since spec B has the AI propose WS7's cards. Shape to confirm with WS2's spec B.
 */
function OfferCard({ id }: { id: string }) {
  const s = SEATS[OFFER.from]!;
  return (
    <li className="relative flex flex-col gap-1.5 rounded-panel border-2 border-holo bg-holo-soft p-2" data-testid={`offer-${id}`}>
      <IntentMarker note={MUTE_NOTES.M6} at="tr" />
      <span className="label-caps flex justify-between gap-2 text-[10px]! @min-[1100px]/shell:text-xs!">
        Deal card from {s.name} <span className="text-ink-3">expires at Ready</span>
      </span>
      <span className="font-display font-semibold @min-[1100px]/shell:text-lg">{OFFER.title}</span>
      <span className="text-xs text-ink-2 @min-[1100px]/shell:text-sm">{OFFER.terms}</span>
      <span className="font-display text-sm font-semibold @min-[1100px]/shell:text-lg">{OFFER.extra}</span>
      <span className="grid grid-cols-2 gap-1.5">
        <Button size="md">Accept</Button>
        <Button size="md" variant="outline">
          No
        </Button>
      </span>
    </li>
  );
}

/**
 * The hub's Talk desk (the product's TalkDesk around parts.tsx::Chat): Whole table, then a whisper channel per seat.
 * An AI's channel carries the same switch as its seat, at the head of the channel, and when muted the channel says so
 * in one quiet line where its whispers would be.
 */
export function MuteTalkDesk({ initial = 'baron' }: { initial?: string }) {
  const { muted, missed, toggle, tap } = useMute();
  const [to, setTo] = useState<string | null>(initial);
  const lines = phoneLines(LINES, ME_ID, muted, missed).filter((m) => (to === null ? !m.to : (m.to === to && m.from === ME_ID) || (m.from === to && m.to === ME_ID)));
  const target = to ? SEATS[to] : undefined;
  const off = !!target && muted.has(target.id);
  return (
    <div className="flex flex-col gap-2" data-testid="channels">
      {/* Wrapped, not scrolled sideways as the product's are: on a 232 px rail a scrolled row hides the AI channels past the second. */}
      <div className="flex shrink-0 flex-wrap gap-1 @min-[1100px]/shell:gap-2" role="tablist" aria-label="Talk">
        <Pill active={to === null} onClick={() => setTo(null)} testid="channel-all">
          Whole table
        </Pill>
        {OTHERS.map((p) => (
          <Pill key={p.id} active={to === p.id} onClick={() => setTo(p.id)} testid={`channel-${p.id}`}>
            <PlayerMark slot={p.slot} size={10} glow={false} />
            {p.name}
            {p.isAi && muted.has(p.id) && (
              <span className="text-warn" data-testid={`muted-${p.id}-channel`} role="img" aria-label="muted">
                <TalkGlyph muted size={12} />
              </span>
            )}
          </Pill>
        ))}
      </div>
      {target && (
        <div className="flex min-h-8 items-center justify-between gap-2">
          <p className="min-w-0 font-mono text-[10px] text-ink-3 @min-[1100px]/shell:text-xs">WHISPER · ONLY YOU AND {target.name.toUpperCase()}</p>
          {target.isAi && (
            <span className="relative shrink-0">
              <IntentMarker note={MUTE_NOTES.M2} at="tl" />
              <button
                type="button"
                onClick={() => toggle(target.id)}
                aria-pressed={off}
                className={cx(
                  'relative flex h-8 items-center gap-1 rounded-chip border px-2 text-xs font-semibold @min-[1100px]/shell:text-sm',
                  off ? 'border-warn/70 bg-warn/10 text-warn' : 'border-holo-line text-ink-2 hover:border-holo hover:text-holo',
                )}
                data-testid={`mute-${target.id}-talk`}
              >
                <TalkGlyph muted={!off} size={13} />
                {off ? 'Unmute' : 'Mute'}
                {tap === `${target.id}-talk` && <TapHint />}
              </button>
            </span>
          )}
        </div>
      )}
      {off && target ? (
        <>
          <div className="relative flex min-h-8 items-center gap-1.5 rounded-control border border-dashed border-holo-line px-2 py-1 text-xs text-ink-2 @min-[1100px]/shell:text-sm" data-testid="whisper-placeholder">
            <IntentMarker note={MUTE_NOTES.M3} at="tl" />
            <TalkGlyph muted size={13} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1">
              {target.name} is muted · its moves and bids still show
            </span>
            <button type="button" onClick={() => toggle(target.id)} className="h-8 shrink-0 rounded-chip border border-holo-line px-2 font-semibold text-holo hover:border-holo" data-testid={`unmute-${target.id}`}>
              Unmute
            </button>
          </div>
          {target.id === OFFER.from && (
            <ul className="flex flex-col gap-1.5">
              <OfferCard id={OFFER.id} />
            </ul>
          )}
        </>
      ) : (
        <ul className="flex flex-col gap-2.5 rounded-control border border-holo-faint bg-panel/50 p-2.5 text-sm">
          {lines.length === 0 && !(target?.id === OFFER.from) && <li className="text-sm text-ink-3">{target ? `Nothing whispered with ${target.name} yet.` : 'Nobody has said anything yet.'}</li>}
          {lines.map((l) => (
            <ChannelLine key={l.id} line={l} />
          ))}
          {target?.id === OFFER.from && <OfferCard id={OFFER.id} />}
        </ul>
      )}
      {!off && (
        <form className="flex shrink-0 gap-2" onSubmit={(e) => e.preventDefault()}>
          <input
            maxLength={280}
            placeholder={target ? `Whisper to ${target.name}` : 'Say something to everyone'}
            className="h-11 min-w-0 flex-1 rounded-control border border-holo-line bg-panel px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-holo"
          />
          <Button size="md" type="submit" disabled>
            Send
          </Button>
        </form>
      )}
    </div>
  );
}

/** The AIs' play, public and untouched by a mute: who is done planning (the product's ready flags). */
export function PlayStrip() {
  return (
    <div className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs @min-[1100px]/shell:text-sm" data-testid="play-strip">
      <IntentMarker note={MUTE_NOTES.M4} part="play" at="left" />
      <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Planning · month {MUTE_VIEW.month}</span>
      {MUTE_VIEW.players.map((p) => {
        const s = SEATS[p.id]!;
        return (
          <span key={p.id} className="inline-flex items-center gap-1" data-testid={`play-${p.id}`}>
            <Creature species={s.species} color={SLOT_COLOR[s.slot]} size={14} />
            <span className="font-semibold">{p.id === ME_ID ? 'You' : p.name}</span>
            <span className={cx('font-mono text-[10px]', p.ready ? 'text-ok' : 'text-ink-3')}>{p.ready ? 'READY' : 'PLANNING'}</span>
          </span>
        );
      })}
    </div>
  );
}

/** The TV's ticker (the product's TvTicker and Ticker at size tv): the last 3 public lines. */
export function MuteTvTicker() {
  const { muted, tvHides } = useMute();
  const lines = tvLines(LINES, muted, tvHides);
  return (
    <div className="relative rounded-panel border border-holo-line bg-panel/60 px-4 py-2" data-testid="tv-ticker" data-hides={tvHides || undefined}>
      <IntentMarker note={MUTE_NOTES.M5} at="tl" />
      <ul className="flex flex-col gap-1 overflow-hidden" aria-label="Table chat" aria-live="polite">
        {lines
          .slice(-3)
          .reverse()
          .map((l, i) => {
            const s = SEATS[l.from]!;
            return (
              <li key={l.id} className={cx('flex min-w-0 items-center gap-1.5 truncate text-xl', i === 0 ? 'text-ink' : 'text-ink-3')} data-testid={`tv-line-${l.id}`}>
                <Creature species={s.species} color={SLOT_COLOR[s.slot]} size={22} />
                <strong className="shrink-0">{s.name}:</strong>
                <span className="truncate">{l.text}</span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
