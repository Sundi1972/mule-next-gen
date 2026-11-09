import { cx, PlayerMark, SLOT_COLOR } from '@mule/ui';
import type { CSSProperties, ReactNode } from 'react';
import { missLine, name, segmentSummary, who, youSummary } from '../copy';
import { BEAT, frontAt, landed, sickAt, stageAt, TIER, type Segment, type ShowEvent } from '../events';
import { H, ME, ownerAt, seat, W } from '../fixture';
import { Crater, MeteorFall, OnPlot, ramp, Spotlight, Trail } from '../fx';
import { accent, Buzz, DeltaChip, EventGlyph, SignBadge } from '../glyphs';
import { cell, ColonyBar, Colonists, MapBox, PhoneLayout, SickTag, TvLayout, useShow } from '../stage';

/**
 * C · Dealt cards. Events are cards from the colony's deck, as at a kitchen table: each phase deals its cards into
 * the TV's rail, a line runs from the card to where it strikes, and a token is stamped on every plot it hits. The
 * map is never covered, and the month's cards stay in view to be read again.
 */

const MAP = { w: 820, h: 492 };
/** Where the card in play sits, in the map's own pixels: the rail starts 24 px right of the map. */
const CARD = { x: MAP.w + 24, y: 104, w: 332, h: 268 };

export function TvC() {
  const { s, t, reduced } = useShow();
  const { seg } = stageAt(s, t);
  const current = seg?.events[0];
  const personal = current?.scope === 'personal' && TIER[current.key] === 'spotlight' ? current.player : undefined;
  const spot = personal && seg ? 0.55 * ramp(t, seg.playAt - 0.4, 0.4) * (1 - ramp(t, seg.endAt - 0.4, 0.4)) : 0;
  const sick = sickAt(s, t, reduced);
  return (
    <TvLayout
      headerExtra={<span className="label-caps text-base!">The colony’s deck</span>}
      map={
        <MapBox
          tv
          under={
            <>
              {s.segments.map((g) => (
                <Layers key={g.n} seg={g} />
              ))}
              {personal && <Spotlight id={personal} amount={spot} />}
            </>
          }
          over={
            <>
              <Tokens />
              {s.phase === 'development' && <Colonists tv tag={(id) => sick.has(id) && <SickTag className="absolute -right-2 -top-2 animate-[ev-stamp_0.4s_ease-out]" />} />}
            </>
          }
        />
      }
      banner={seg && t >= seg.announceAt + 0.35 && TIER[seg.events[0]!.key] !== 'bulletin' && <Connector seg={seg} />}
      rail={<Rail />}
      bar={<ColonyBar glowFor={personal && spot > 0.3 ? personal : undefined} extra={(id) => sick.has(id) && <ConditionCard />} />}
    />
  );
}

function Layers({ seg }: { seg: Segment }) {
  const { t, reduced } = useShow();
  if (t < seg.playAt - 0.05) return null;
  return (
    <>
      {seg.events.map((ev, i) =>
        ev.key === 'dustStorm' ? (
          !reduced && <Breeze key={i} ev={ev} seg={seg} />
        ) : ev.key === 'pestSwarm' ? (
          <Trail key={i} ev={ev} seg={seg} colour={SLOT_COLOR[seat(ev.player!).slot]} width={0.08} />
        ) : ev.key === 'meteorStrike' ? (
          t < seg.endAt ? <MeteorFall key={i} ev={ev} seg={seg} tv look="drop" /> : <Crater key={i} x={ev.origin.x} y={ev.origin.y} since={9} tv />
        ) : null,
      )}
    </>
  );
}

/** A soft band of wind crosses the map ahead of the tokens: a hint of the storm, not the storm itself. */
function Breeze({ ev, seg }: { ev: ShowEvent; seg: Segment }) {
  const { t } = useShow();
  const p = frontAt(seg, t);
  if (p < 0 || p > 1.1 || ev.direction !== 'w') return null;
  return <div className="absolute inset-y-0 w-[22%]" style={{ left: `${p * 100 - 22}%`, background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-warn) 28%, transparent))' }} />;
}

/** One token per hit, stamped on the plot with the event's glyph; for a player's event, ringed in their colour. */
function Tokens() {
  const { s, t, reduced } = useShow();
  return (
    <>
      {landed(s, t, reduced).map(({ hit, at, ev }) => {
        const ring = ev.player ? SLOT_COLOR[seat(ev.player).slot] : accent(ev.key);
        return (
          <div key={`${hit.x},${hit.y},${at}`}>
            <div className="absolute" style={cell(hit.x, hit.y)} data-testid={`token-${hit.x}-${hit.y}`}>
              <span className="absolute inset-[16%] z-[7] flex items-center justify-center rounded-full bg-map-chip shadow-chip animate-[ev-stamp_0.4s_ease-out]" style={{ boxShadow: `0 0 0 3px ${ring}, var(--shadow-chip)`, color: accent(ev.key) }}>
                <EventGlyph k={ev.key} size={24} />
              </span>
            </div>
            <OnPlot x={hit.x} y={hit.y} className="animate-[ev-pop_0.35s_ease-out_0.2s_both]">
              <DeltaChip delta={hit.delta} good={hit.good} lost={hit.muleLost} />
            </OnPlot>
          </div>
        );
      })}
    </>
  );
}

/** A line from the card in play to where its event strikes, drawn as the card lands. */
function Connector({ seg }: { seg: Segment }) {
  const { t, reduced } = useShow();
  const ev = seg.events[0]!;
  const to = { x: ((ev.origin.x + 0.5) / W) * MAP.w, y: ((ev.origin.y + 0.5) / H) * MAP.h };
  const from = { x: CARD.x, y: CARD.y + CARD.h / 2 };
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const k = reduced ? 1 : ramp(t, seg.announceAt + 0.35, 0.5);
  const fade = 1 - ramp(t, seg.endAt - 0.4, 0.4);
  const colour = ev.player ? SLOT_COLOR[seat(ev.player).slot] : accent(ev.key);
  return (
    <svg className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible" width={CARD.x} height={MAP.h} style={{ opacity: fade }} aria-hidden data-testid="connector">
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={colour} strokeWidth={3} strokeDasharray={`${len}`} strokeDashoffset={len * (1 - k)} strokeLinecap="round" />
      {k >= 1 && <circle cx={to.x} cy={to.y} r={10} fill="none" stroke={colour} strokeWidth={3} />}
    </svg>
  );
}

/** The rail: the deck, the card in play, and the cards already played this phase. */
function Rail() {
  const { s, t } = useShow();
  const { seg } = stageAt(s, t);
  const left = s.segments.filter((g) => t < g.announceAt).length;
  const played = s.segments.filter((g) => t >= g.endAt);
  return (
    <div className="flex flex-col gap-3" data-testid="rail">
      <div className="flex h-[92px] items-center gap-4">
        <span className="relative h-[84px] w-[62px]">
          {Array.from({ length: Math.max(1, left) }, (_, i) => (
            <span key={i} className="absolute inset-0 rounded-control border-2 border-holo-line shadow-chip" style={{ transform: `translate(${i * 4}px, ${-i * 4}px)`, background: 'repeating-linear-gradient(45deg, var(--color-raised) 0 6px, var(--color-panel) 6px 12px)', opacity: left === 0 ? 0.35 : 1 }} />
          ))}
        </span>
        <span className="flex flex-col">
          <span className="font-display text-2xl font-bold leading-tight">{t < BEAT.intro ? deal(s.segments.length, s.events) : left ? `${left} still to come` : 'All dealt'}</span>
          <span className="text-base text-ink-2">{s.phase === 'production' ? 'Production' : 'Development'} · month 5</span>
        </span>
      </div>
      <div className="relative h-[268px]">{seg && <BigCard key={seg.n} seg={seg} />}</div>
      <div className="flex flex-col">
        {played.map((g, i) => (
          <div key={g.n} className="flex items-center gap-3 rounded-control border-2 bg-panel px-3 py-2 shadow-chip animate-[ev-drop_0.35s_ease-out]" style={{ borderColor: g.events[0]!.player && TIER[g.events[0]!.key] === 'spotlight' ? SLOT_COLOR[seat(g.events[0]!.player).slot] : 'var(--color-holo-line)', marginTop: i ? -6 : 0, transform: `rotate(${(i % 2 ? 1 : -1) * 0.6}deg)` }}>
            <SignBadge ev={g.events[0]!} size={34} />
            <span className="flex min-w-0 flex-col">
              <span className="font-display text-lg font-semibold leading-tight">{g.events.length > 1 ? `${g.events[0]!.title} ×${g.events.length}` : g.events[0]!.title}</span>
              <span className="truncate text-sm text-ink-2">{segmentSummary(g)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const deal = (n: number, events: ShowEvent[]) => (events.every((e) => TIER[e.key] === 'bulletin') ? `${events.length} condition cards` : `${n} card${n === 1 ? '' : 's'} this month`);

/** The card in play, flipped off the deck: the event's glyph big on a patterned band, what it is, who it hits. */
function BigCard({ seg }: { seg: Segment }) {
  const { t } = useShow();
  const ev = seg.events[0]!;
  const out = ramp(t, seg.endAt - 0.4, 0.4);
  if (t < seg.announceAt) return null;
  return (
    <div className="absolute inset-0 animate-[ev-flip_0.5s_ease-out]" style={{ transform: `translateY(${out * 120}px) scale(${1 - out * 0.3})`, opacity: 1 - out }}>
      <CardFace seg={seg} size="tv" />
    </div>
  );
}

/** The face shared by the TV's card, the phone's, and the played pile. */
function CardFace({ seg, size, footer }: { seg: Segment; size: 'tv' | 'phone'; footer?: ReactNode }) {
  const ev = seg.events[0]!;
  const tv = size === 'tv';
  const p = ev.player && TIER[ev.key] === 'spotlight' ? seat(ev.player) : null;
  const edge = p ? SLOT_COLOR[p.slot] : accent(ev.key);
  const bulletin = TIER[ev.key] === 'bulletin';
  const bandStyle: CSSProperties = {
    background:
      ev.sign === 'good'
        ? `radial-gradient(circle, color-mix(in srgb, ${accent(ev.key)} 30%, var(--color-panel)), var(--color-panel))`
        : `repeating-linear-gradient(135deg, color-mix(in srgb, ${accent(ev.key)} 22%, var(--color-panel)) 0 12px, color-mix(in srgb, ${accent(ev.key)} 10%, var(--color-panel)) 12px 24px)`,
  };
  return (
    <div className={cx('flex h-full flex-col overflow-hidden border-2 bg-panel shadow-map', tv ? 'rounded-sheet' : 'rounded-panel')} style={{ borderColor: edge }} data-testid={`card-${size}`}>
      <div className={cx('relative flex items-center justify-center', tv ? 'h-[96px]' : 'h-[54px]')} style={bandStyle}>
        <SignBadge ev={ev} size={tv ? 40 : 26} className={cx('absolute', tv ? 'left-3 top-3' : 'left-1.5 top-1.5')} />
        <span style={{ color: accent(ev.key) }}>
          <EventGlyph k={ev.key} size={tv ? 70 : 40} />
        </span>
        {seg.count > 1 && <span className={cx('absolute font-mono font-bold text-ink-2', tv ? 'right-3 top-3 text-base' : 'right-2 top-1.5 text-[10px]')}>{seg.n}/{seg.count}</span>}
      </div>
      <div className={cx('flex flex-1 flex-col', tv ? 'gap-1.5 p-4' : 'gap-1 p-2')}>
        <span className={cx('font-display font-bold leading-none', tv ? 'text-4xl' : 'text-lg')}>{bulletin ? 'Sick this turn' : ev.title}</span>
        {bulletin ? (
          <span className={cx('flex flex-wrap', tv ? 'gap-3' : 'gap-2')}>
            {seg.events.map((e) => (
              <span key={e.player} className={cx('flex items-center gap-1.5 font-display font-semibold', tv ? 'text-xl' : 'text-xs')}>
                <PlayerMark slot={seat(e.player!).slot} size={tv ? 30 : 16} />
                {name(e.player!)}
              </span>
            ))}
          </span>
        ) : (
          <span className={cx('flex items-center gap-1.5 font-display font-semibold', tv ? 'text-xl' : 'text-xs')}>
            {p && <PlayerMark slot={p.slot} size={tv ? 30 : 16} />}
            {who(ev)}
          </span>
        )}
        <span className={cx('leading-snug text-ink-2', tv ? 'text-lg' : 'text-[11px]')}>{bulletin ? 'Sickness halves their walking pace.' : ev.line}</span>
        {footer}
      </div>
    </div>
  );
}

/** A small condition card dealt onto a sick player's slot. */
function ConditionCard() {
  return (
    <span className="flex h-[46px] w-[34px] flex-col items-center justify-center gap-0.5 rounded-[6px] border-2 bg-panel shadow-chip animate-[ev-flip_0.45s_ease-out]" style={{ borderColor: 'var(--color-g-medicine)' }} data-testid="condition-card">
      <SickTag className="scale-75" />
      <span className="font-mono text-[10px] font-bold">50%</span>
    </span>
  );
}

// --- Lena's phone ---------------------------------------------------------------------------------------------------

/** The phone is your hand: the same card is dealt to you, and its foot says what it did to you. */
export function PhoneC() {
  const { s, t, reduced } = useShow();
  const { seg: now, stage } = stageAt(s, t);
  // At the end the last card stays in your hand.
  const seg = now ?? (stage === 'outro' ? (s.segments.at(-1) ?? null) : null);
  const mine = landed(s, t, reduced).filter((l) => ownerAt(l.hit.x, l.hit.y) === ME);
  const played = s.segments.filter((g) => t >= g.endAt && g !== seg);
  const sick = sickAt(s, t, reduced);
  return (
    <PhoneLayout
      map={
        <MapBox
          tv={false}
          focusSlot={0}
          over={
            <>
            {s.phase === 'development' && <Colonists tv={false} only={ME} tag={(id) => sick.has(id) && <SickTag size="phone" className="absolute -right-1.5 -top-1.5 animate-[ev-stamp_0.4s_ease-out]" />} />}
            {mine.map((l) => (
            <div key={`${l.hit.x},${l.hit.y}`}>
              <div className="absolute" style={cell(l.hit.x, l.hit.y)}>
                <span className="absolute inset-[18%] z-[7] flex items-center justify-center rounded-full bg-map-chip" style={{ boxShadow: `0 0 0 2px ${accent(l.ev.key)}`, color: accent(l.ev.key) }}>
                  <EventGlyph k={l.ev.key} size={11} />
                </span>
              </div>
              <OnPlot x={l.hit.x} y={l.hit.y}>
                <DeltaChip delta={l.hit.delta} good={l.hit.good} size="phone" />
              </OnPlot>
            </div>
          ))}
            </>
          }
        />
      }
      rail={
        <>
          <span className="flex items-center justify-between">
            <span className="label-caps">Your hand · this month</span>
            {seg && <Buzz on={t - seg.announceAt < 1.2} />}
          </span>
          <div className="h-[196px]">{seg && t >= seg.announceAt && <PhoneCard key={seg.n} seg={seg} />}</div>
          {played.map((g) => {
            const you = youSummary(g, ME);
            return (
              <div key={g.n} className="flex items-center gap-2 rounded-control border border-holo-line bg-raised px-2 py-1">
                <SignBadge ev={g.events[0]!} size={22} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{g.events[0]!.title}</span>
                <span className={cx('text-xs', you ? 'font-bold text-alert-ink' : 'text-ink-3')}>{you ? you.headline.replace(' for you', '') : 'missed you'}</span>
              </div>
            );
          })}
        </>
      }
    />
  );
}

function PhoneCard({ seg }: { seg: Segment }) {
  const { t } = useShow();
  const after = t >= seg.settleAt - 0.2;
  const you = youSummary(seg, ME);
  return (
    <div className="h-full animate-[ev-flip_0.45s_ease-out]" data-testid="phone-card">
      <CardFace
        seg={seg}
        size="phone"
        footer={
          after && (
            <span className={cx('mt-auto rounded-chip px-1.5 py-1 text-[11px] font-bold leading-snug animate-[ev-pop_0.3s_ease-out]', you ? 'bg-alert-bg text-alert-ink' : 'bg-raised text-ink-2')} data-testid={you ? 'phone-you' : 'phone-miss'}>
              {you ? (
                <span className="flex items-center gap-1">
                  {you.sick && <SickTag size="phone" />}
                  You: {you.headline.replace(' for you', '')}
                </span>
              ) : (
                missLine(seg)
              )}
            </span>
          )
        }
      />
    </div>
  );
}

