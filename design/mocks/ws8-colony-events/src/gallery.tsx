import { cx, EventEffectChip, EventLivingMap, EventShow, eventSegments, MuleIcon, PlayerMark, type ShowEffect } from '@mule/ui';
import { EventDeltaChip, EventSignBadge } from '../../../../packages/ui/src/events/glyphs';
import { ColonyGauges } from '../../../../apps/web/src/components/Colony';
import { c26Words, colony, forShow, GALLERY, H, INTRO_MS, isSaid, nameOf, PLAYERS, SLOTS, TILES, W, type C26Event } from './fixture';
import { useScreen } from './screens-tv';

/**
 * The other rows of the catalogue, each by an existing motion: its card, its chip and its result frame. No new
 * stories. The result frames run on the page's clock, each as its own one-event show settling.
 */

const PHASE: Record<string, string> = { planning: 'Planning', development: 'Development', production: 'Production', upkeep: 'Month end' };

/** The chip each row leaves, in the words C26's effect gives it. */
function Chip({ ev }: { ev: C26Event }) {
  if (ev.key === 'storeStrike') return <EventDeltaChip delta={-1} text="NO MULES this turn" size="tv" />;
  if (ev.key === 'walkout') return <EventDeltaChip delta={-1} good="energy" text="WALKOUT −80%" size="tv" />;
  if (ev.key === 'loyalCrew') return <EventDeltaChip delta={1} good="food" text="+1" size="tv" />;
  return (
    <>
      {(ev.effects ?? []).map((f, i) =>
        isSaid(f) ? <EventEffectChip key={i} f={f as ShowEffect} size="tv" /> : <EventDeltaChip key={i} delta={f.what === 'air' ? (f.delta < 0 ? 1 : -1) : f.delta} text={c26Words(f)} size="tv" />,
      )}
    </>
  );
}

/** The frame a row settles on: the map for a row on plots, the gauge or the store or the seat for the rest. */
function Result({ ev, t, reduced }: { ev: C26Event; t: number; reduced: boolean }) {
  const shown = [forShow(ev)];
  const seg = eventSegments({ events: shown, introMs: INTRO_MS }, 0, 'tv')[0]!;
  const local = t >= 0.2 ? seg.playAt + Math.min(t, 1) * (seg.endAt - 0.2 - seg.playAt) : seg.playAt;
  switch (ev.key) {
    case 'walkout':
    case 'loyalCrew':
      return (
        <div className="w-[300px]" data-testid={`result-${ev.key}`}>
          <EventShow events={shown} introMs={INTRO_MS} t={local} reduced={reduced} width={W} height={H} tiles={TILES} players={PLAYERS}>
            <EventLivingMap size="phone" />
          </EventShow>
        </div>
      );
    case 'volunteerCleanup':
      return (
        <div className="w-[300px]" data-testid={`result-${ev.key}`}>
          <ColonyGauges colony={colony({ environment: t >= 0.6 ? 17 : 22 })} size="phone" className="grid-cols-2!" />
        </div>
      );
    case 'storeStrike':
      return (
        <div className="flex w-[300px] items-center gap-2 rounded-control border border-warn bg-panel p-2" data-testid={`result-${ev.key}`}>
          <span className="label-caps text-[10px]!">Store · MULEs</span>
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex size-7 items-center justify-center rounded-[18%] bg-raised" style={{ filter: t >= 0.6 ? 'grayscale(1) brightness(0.45)' : undefined }}>
              <MuleIcon size={18} className="text-mule-metal" />
            </span>
          ))}
          {t >= 0.6 && <EventDeltaChip delta={-1} text="NO MULES" size="phone" className="ml-auto" />}
        </div>
      );
    case 'blamedForUnrest':
      return (
        <div className="flex w-[300px] items-center gap-2 rounded-panel border-2 bg-panel px-3 py-2" style={{ borderColor: 'var(--color-holo-line)' }} data-testid={`result-${ev.key}`}>
          <PlayerMark slot={SLOTS[ev.player!]!} size={28} />
          <span className="font-display text-base font-semibold">{nameOf(ev.player!)}</span>
          <span className="ml-auto text-xs text-ink-2">votes</span>
          <span data-num className="font-mono text-sm font-bold">{t >= 0.6 ? 3 : 4}</span>
          {t >= 0.6 && <EventDeltaChip delta={-1} text="Reputation −1" size="phone" />}
        </div>
      );
    default:
      return (
        <div className="flex w-[300px] items-center gap-2 rounded-panel border border-holo-line bg-panel px-3 py-2" data-testid={`result-${ev.key}`}>
          <span className="label-caps text-[10px]!">The colony</span>
          <span data-num className="font-mono text-sm font-bold">{t >= 0.6 ? 108 : 120} colonists</span>
          {t >= 0.6 && <EventEffectChip f={ev.effects![0] as ShowEffect} size="phone" className="ml-auto" />}
        </div>
      );
  }
}

export function Gallery() {
  const { clock, reduced, controls } = useScreen(1.5);
  return (
    <>
      {controls([
        { at: 0.2, label: 'lands' },
        { at: 1, label: 'settled' },
      ])}
      <ul className="grid w-full max-w-[1280px] grid-cols-2 gap-4" data-testid="gallery" data-reduced={reduced}>
        {GALLERY.map(({ ev, reuses }) => (
          <li key={ev.key} className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4" data-testid={`row-${ev.key}`}>
            <span className="flex items-center gap-3">
              {/* DS-GAP: glyphs.tsx has no glyph or accent for the nine C26 keys; the badge is today's plain-disc fallback. */}
              <EventSignBadge ev={forShow(ev)} size={44} />
              <span className="flex min-w-0 flex-col">
                <span className={cx('label-caps', ev.sign === 'good' ? 'text-ok!' : 'text-alert-ink!')}>
                  {ev.sign === 'good' ? 'Good news' : 'Bad news'} · {PHASE[ev.phase]} · {ev.scope === 'personal' ? nameOf(ev.player!) : 'the colony'}
                </span>
                <span className="font-display text-2xl font-bold leading-tight">{ev.title}</span>
              </span>
              <span className="ml-auto flex gap-1">
                <Chip ev={ev} />
              </span>
            </span>
            <span className="text-sm text-ink-2">{ev.line}</span>
            <Result ev={ev} t={clock.t} reduced={reduced} />
            <span className="text-xs text-ink-3" data-testid={`reuses-${ev.key}`}>
              Reuses {reuses}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
