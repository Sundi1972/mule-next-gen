import { cx, PlayerMark, SLOT_COLOR, type MapTile } from '@mule/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { CATALOGUE, ENTRY, PHASE_NAME, PHASES, WAVE_NAME, type CatalogueEntry, type EventKey, type Tier } from './catalogue';
import { name, segTitle } from './copy';
import { EVENT_GAPS, GAPS, isRollCall, script, stageAt, type Script, type ShowEvent } from './events';
import { ME, ownerAt, SEATS, seat, TILES, W } from './fixture';
import { EffectChip, effectIsGood, EventGlyph, SignBadge } from './glyphs';
import { EventPhoneCard, PhoneShow } from './phone';
import { drivesOf, EVENT_SCENES, OPPOSITES, sceneOf, scenesWith, TOGETHER, type Scene } from './scenarios';
import { Controls, PhoneFrame, ShowProvider, useShowClock } from './stage';

/**
 * The shared layer, before Heiko picks a direction: all 35 events with their phase, weight, glyph, copy, where they
 * land and each one's phone card; and the sets that fire together, with their running order. Every direction plays
 * these same scenes; only its TV differs.
 */

const TIER_WORD: Record<Tier, string> = { headline: 'Headline', spotlight: 'Spotlight', bulletin: 'Bulletin' };
const TIER_HINT: Record<Tier, string> = {
  headline: 'Takes the TV for a moment',
  spotlight: 'Singles out a place on the map',
  bulletin: 'Joins the phase’s roll call, never interrupts',
};

function Page({ children, back = '#catalogue', backLabel = 'All 35 events' }: { children: ReactNode; back?: string; backLabel?: string }) {
  return (
    <div className="min-h-full bg-table p-6 text-ink">
      <span className="flex gap-4 text-sm">
        <a href="#" className="text-holo underline" data-testid="back-index">
          ← Directions
        </a>
        {back !== '#' && (
          <a href={back} className="text-holo underline" data-testid="back">
            ← {backLabel}
          </a>
        )}
      </span>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </div>
  );
}

function TierChip({ tier }: { tier: Tier }) {
  return (
    <span className={cx('rounded-chip border px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase', tier === 'headline' ? 'border-holo bg-holo text-on-holo' : tier === 'spotlight' ? 'border-holo text-holo' : 'border-holo-line text-ink-2')} title={TIER_HINT[tier]} data-testid="tier">
      {TIER_WORD[tier]}
    </span>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-chip border border-holo-line px-1.5 py-0.5 text-[11px] text-ink-2">{children}</span>;
}

/** The player a phone card is best shown for: the one it hit, or Lena when it hit the colony or her. */
function shownFor(ev: ShowEvent): string {
  if (ev.player) return ev.player;
  const hitMe = ev.plots.some((h) => ownerAt(h.x, h.y) === ME) || (ev.effects ?? []).some((f) => f.on === ME);
  if (hitMe) return ME;
  return ev.plots.map((h) => ownerAt(h.x, h.y)).find(Boolean) ?? (ev.effects ?? []).map((f) => f.on).find((on) => SEATS.some((p) => p.id === on)) ?? ME;
}

// --- Where it lands: the fixture colony as a small grid ---------------------------------------------------------

/**
 * DS-GAP (WS8): a schematic of where an event lands, for the catalogue only (the screens use the real map). Owned
 * plots wear their owner's colour; hit plots are filled with the loss, gain or news colour and numbered in the order
 * the event reaches them; a sweep shows the edge it comes in from. Changes off the map show on the slots below.
 */
export function LandsOn({ ev, tiles = TILES, cellPx = 13 }: { ev: ShowEvent; tiles?: MapTile[]; cellPx?: number }) {
  const hit = new Map(ev.plots.map((h) => [`${h.x},${h.y}`, h]));
  const tone = (d: number, pending?: boolean) => (pending || d === 0 ? 'var(--color-holo)' : d < 0 ? 'var(--color-alert)' : 'var(--color-ok)');
  const edge = ev.direction;
  const fx = ev.effects ?? [];
  return (
    <div className="flex flex-col gap-1.5" data-testid="lands-on">
      {(ev.plots.length > 0 || ['store', 'colonists'].includes(ENTRY[ev.key].motion)) && (
        <div className="relative w-fit">
          <div className="grid gap-px rounded-control bg-map-grid p-px" style={{ gridTemplateColumns: `repeat(${W}, ${cellPx}px)` }}>
            {tiles.map((t) => {
              const h = hit.get(`${t.x},${t.y}`);
              const owner = t.owner !== null ? SLOT_COLOR[t.owner] : null;
              return (
                <span
                  key={`${t.x},${t.y}`}
                  className="relative flex items-center justify-center font-mono text-[8px] font-bold leading-none text-void"
                  style={{
                    width: cellPx,
                    height: cellPx,
                    background: h ? tone(h.delta, h.pending) : t.terrain === 'store' ? 'var(--color-holo-strong)' : t.terrain === 'river' ? 'var(--color-t-river)' : 'var(--color-map-base)',
                    boxShadow: owner ? `inset 0 0 0 2px ${owner}` : undefined,
                    opacity: h || owner || t.terrain === 'store' ? 1 : 0.55,
                  }}
                  title={`${t.x + 1}·${t.y + 1}${t.owner !== null ? `, ${SEATS[t.owner]!.name}` : ''}`}
                >
                  {h && ev.plots.length > 1 ? h.order + 1 : t.terrain === 'store' ? '' : ''}
                </span>
              );
            })}
          </div>
          {edge && (
            <span
              aria-hidden
              className="absolute rounded-full bg-warn"
              style={edge === 'w' ? { left: -5, top: 2, bottom: 2, width: 3 } : edge === 'e' ? { right: -5, top: 2, bottom: 2, width: 3 } : edge === 'n' ? { top: -5, left: 2, right: 2, height: 3 } : { bottom: -5, left: 2, right: 2, height: 3 }}
              title={`Comes in from the ${{ n: 'north', e: 'east', s: 'south', w: 'west' }[edge]}`}
            />
          )}
          {!edge && ev.plots.length > 0 && (
            <span aria-hidden className="absolute rounded-full border-2 border-ink" style={{ width: cellPx + 6, height: cellPx + 6, left: 1 + ev.origin.x * (cellPx + 1) - 3, top: 1 + ev.origin.y * (cellPx + 1) - 3 }} title="Where it starts" />
          )}
        </div>
      )}
      {fx.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="lands-off-map">
          {SEATS.filter((p) => fx.some((f) => f.on === p.id)).map((p) => (
            <span key={p.id} className="flex items-center gap-1 rounded-control border px-1 py-0.5" style={{ borderColor: SLOT_COLOR[p.slot] }}>
              <PlayerMark slot={p.slot} size={12} />
              {fx.filter((f) => f.on === p.id).map((f, i) => (
                <EffectChip key={i} f={f} size="phone" />
              ))}
            </span>
          ))}
          {fx.some((f) => f.on === 'colony' || f.on === 'store') && (
            <span className="flex items-center gap-1 rounded-control border border-holo-line px-1 py-0.5">
              <span className="label-caps text-[9px]!">{fx.some((f) => f.on === 'store') ? 'Colony · store' : 'Colony'}</span>
              {fx.filter((f) => f.on === 'colony' || f.on === 'store').map((f, i) => (
                <EffectChip key={i} f={f} size="phone" />
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// --- The catalogue ----------------------------------------------------------------------------------------------

export function CataloguePage() {
  const [only, setOnly] = useState<Tier | 'all'>('all');
  return (
    <Page back="#">
      <div className="flex flex-col gap-1">
        <span className="label-caps">WS8 · Event visuals · the shared layer</span>
        <h1 className="font-display text-4xl font-semibold">All 35 events</h1>
        <p className="max-w-4xl text-base text-ink-2">
          Every event in Heiko’s catalogue, phase by phase, on the colony he knows: its glyph and badge, how loud it is on the TV, how it moves, where it lands, and the card each player’s phone shows. This layer is the same in every direction; once a direction is picked, each event gets its TV in that look. ▶ plays an event on the phones.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="tier-filter">
        <span className="label-caps">Show</span>
        {(['all', 'headline', 'spotlight', 'bulletin'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setOnly(k)} className={cx('rounded-control border px-2.5 py-1 text-sm', only === k ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2 hover:text-ink')}>
            {k === 'all' ? 'All 35' : `${TIER_WORD[k]}s · ${CATALOGUE.filter((c) => c.tier === k).length}`}
          </button>
        ))}
        <span className="ml-4 flex flex-wrap items-center gap-4 text-sm text-ink-2">
          <span className="flex items-center gap-1.5">
            <SignBadge ev={{ key: 'drought', sign: 'bad' }} size={26} /> bad
          </span>
          <span className="flex items-center gap-1.5">
            <SignBadge ev={{ key: 'solarFlare', sign: 'good' }} size={26} /> good
          </span>
          <span className="flex items-center gap-1.5">
            <SignBadge ev={{ key: 'colonyPlot', sign: 'neutral' }} size={26} /> news
          </span>
        </span>
      </div>

      <section className="flex flex-col gap-2" data-testid="badge-sheet">
        <span className="label-caps">The 35 badges · the glyph says which event, the frame’s shape whether it is good, bad or news</span>
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {CATALOGUE.map((c) => (
            <a key={c.key} href={`#event-${c.key}`} className="flex w-[84px] flex-col items-center gap-1 text-center" title={c.title}>
              <SignBadge ev={{ key: c.key, sign: c.sign }} size={52} />
              <span className="text-[11px] leading-tight text-ink-2">{c.title}</span>
            </a>
          ))}
        </div>
      </section>

      <TogetherList />

      {PHASES.map((ph) => {
        const entries = CATALOGUE.filter((c) => c.phases[0] === ph.id && (only === 'all' || c.tier === only));
        if (!entries.length) return null;
        return (
          <section key={ph.id} className="flex flex-col gap-3" data-testid={`phase-${ph.id}`}>
            <div className="flex items-baseline gap-3 border-b border-holo-line pb-1">
              <h2 className="font-display text-2xl font-semibold">{ph.name}</h2>
              <span className="text-sm text-ink-2">{ph.rolls}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
              {entries.map((c) => (
                <EventTile key={c.key} c={c} />
              ))}
            </div>
          </section>
        );
      })}

      <section className="flex flex-col gap-2">
        <h2 className="label-caps">What the engine doesn’t send yet (for WS1, via the PM)</h2>
        <GapTable ids={GAPS.map((g) => g.id)} />
      </section>
    </Page>
  );
}

function EventTile({ c }: { c: CatalogueEntry }) {
  const scene = sceneOf(c.key);
  const ev = scene.events[0]!;
  const seg = useMemo(() => script(scene.phase, scene.events).segments[0]!, [scene]);
  const me = shownFor(ev);
  const also = scenesWith(c.key);
  return (
    <article className="flex flex-wrap gap-4 rounded-panel border border-holo-line bg-panel p-4" data-testid={`event-${c.key}`}>
      <div className="flex min-w-[340px] flex-1 flex-col gap-2">
        <div className="flex items-center gap-3">
          <SignBadge ev={ev} size={56} />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2">
              <span className="font-display text-2xl font-semibold leading-tight">{c.title}</span>
              <a href={`#event-${c.key}`} className="rounded-control bg-holo px-2 py-0.5 font-display text-sm font-semibold text-on-holo" data-testid={`play-${c.key}`}>
                ▶ Play
              </a>
            </span>
            <span className="flex flex-wrap gap-1">
              <TierChip tier={c.tier} />
              <Chip>{WAVE_NAME[c.wave]}</Chip>
              <Chip>{c.chance}</Chip>
              <Chip>{c.phases.map((p) => PHASE_NAME[p]).join(' + ')}</Chip>
            </span>
          </span>
        </div>
        <p className="text-sm text-ink">{c.does}</p>
        <p className="text-sm text-ink-2">
          <span className="font-mono text-xs uppercase text-holo">{c.motion}</span> · {c.look}
        </p>
        <LandsOn ev={ev} {...(scene.tiles ? { tiles: scene.tiles } : {})} />
        {(c.opposite || also.length > 0) && (
          <p className="flex flex-wrap gap-x-3 text-xs text-ink-3">
            {c.opposite && <span>Never in the same month as {ENTRY[c.opposite].title.toLowerCase()}.</span>}
            {also.map((s) => (
              <a key={s.id} href={`#together-${s.id}`} className="text-holo underline">
                Fires with others: {s.title}
              </a>
            ))}
          </p>
        )}
      </div>
      <div className="flex w-[268px] shrink-0 flex-col gap-2">
        <span className="label-caps flex items-center gap-1 text-[11px]!">
          <PlayerMark slot={seat(me).slot} size={12} /> {name(me)}’s phone
        </span>
        <EventPhoneCard seg={seg} me={me} at="news" />
        <EventPhoneCard seg={seg} me={me} at="you" />
        {me !== ME && (
          <>
            <span className="label-caps mt-1 flex items-center gap-1 text-[11px]!">
              <PlayerMark slot={seat(ME).slot} size={12} /> Lena’s phone
            </span>
            <EventPhoneCard seg={seg} me={ME} at="you" />
          </>
        )}
      </div>
    </article>
  );
}

function GapTable({ ids }: { ids: string[] }) {
  return (
    <table className="max-w-5xl text-left text-sm" data-testid="gaps">
      <tbody>
        {GAPS.filter((g) => ids.includes(g.id)).map((g) => (
          <tr key={g.id} className="border-t border-holo-line align-top">
            <td className="py-1.5 pr-4 font-mono text-xs text-ink">{g.field}</td>
            <td className="py-1.5 text-ink-2">{g.why}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TogetherList() {
  return (
    <section className="flex flex-col gap-2" data-testid="together">
      <div className="flex flex-col gap-1 border-b border-holo-line pb-1">
        <h2 className="font-display text-2xl font-semibold">Several in one phase</h2>
        <span className="max-w-5xl text-sm text-ink-2">
          Each event rolls its own dice, so a calm colony sees about 1.6 a month and a troubled one 3.3. Headlines and spotlights play one by one in the order they fired; every bulletin gathers into one roll call that closes the phase. Never together: {OPPOSITES.map(([a, b]) => `${ENTRY[a].title.toLowerCase()} and ${ENTRY[b].title.toLowerCase()}`).join('; ')}.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-4">
        {TOGETHER.map((s) => (
          <a key={s.id} href={`#together-${s.id}`} className="flex flex-col gap-1.5 rounded-panel border border-holo-line bg-panel p-3 hover:border-holo" data-testid={`together-${s.id}`}>
            <span className="flex items-center gap-1.5">
              {s.events.map((e, i) => (
                <SignBadge key={i} ev={e} size={30} />
              ))}
            </span>
            <span className="font-display text-lg font-semibold leading-tight text-holo underline">{s.title}</span>
            <span className="text-xs text-ink-2">{s.shows}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

// --- The running order of a phase -------------------------------------------------------------------------------

/** The phase on one line: the intro, each event's announcement and play, the roll call last, and where the clock is. */
export function RunningOrder({ s, t, seek }: { s: Script; t: number; seek: (v: number) => void }) {
  const pct = (v: number) => `${(v / s.end) * 100}%`;
  const { seg } = stageAt(s, t);
  return (
    <div className="flex flex-col gap-1" data-testid="running-order">
      <span className="label-caps">Running order · {PHASE_NAME[s.phase]} · {s.end.toFixed(0)} s</span>
      <div className="relative h-[74px] rounded-panel border border-holo-line bg-panel">
        <button type="button" onClick={() => seek(0.01)} className="absolute inset-y-0 left-0 flex items-end border-r border-holo-line p-1 text-[10px] text-ink-3" style={{ width: pct(s.segments[0]?.announceAt ?? s.end) }}>
          intro
        </button>
        {s.segments.map((g) => {
          const ev = g.events[0]!;
          const tier = ENTRY[ev.key].tier;
          return (
            <button
              type="button"
              key={g.n}
              onClick={() => seek(g.announceAt + 0.01)}
              className={cx('absolute inset-y-1 flex items-center gap-1.5 overflow-hidden rounded-control border px-1.5 text-left', g === seg ? 'border-holo shadow-glow' : 'border-holo-line')}
              style={{ left: pct(g.announceAt), width: pct(g.endAt - g.announceAt), background: `linear-gradient(90deg, var(--color-raised) 0 ${((g.playAt - g.announceAt) / (g.endAt - g.announceAt)) * 100}%, ${tier === 'headline' ? 'var(--color-holo-soft)' : 'var(--color-holo-faint)'} 0)` }}
              data-testid={`segment-${g.n}`}
            >
              <span className="flex shrink-0 -space-x-2">
                {g.events.map((e, i) => (
                  <SignBadge key={i} ev={e} size={isRollCall(g) && g.events.length > 1 ? 26 : 32} />
                ))}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-display text-sm font-semibold">{segTitle(g)}</span>
                <span className="truncate text-[11px] text-ink-2">
                  {isRollCall(g) ? `roll call · ${g.events.map((e) => name(e.player!)).join(', ')}` : `${TIER_WORD[tier].toLowerCase()} · ${(g.endAt - g.announceAt).toFixed(1)} s`}
                </span>
              </span>
            </button>
          );
        })}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink" style={{ left: pct(t) }} />
      </div>
      <span className="text-[11px] text-ink-3">Each block: announced (dark), then plays (light). Click a block to jump to it.</span>
    </div>
  );
}

// --- One scene, live ------------------------------------------------------------------------------------------------

function useReduced() {
  return useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** The players whose phones the scene is shown on: Lena, and the one the scene hits most when that isn't her. */
function phonesFor(scene: Scene): string[] {
  const score = (id: string) => scene.events.filter((e) => e.player === id || e.plots.some((h) => ownerAt(h.x, h.y) === id) || (e.effects ?? []).some((f) => f.on === id)).length;
  const other = SEATS.map((p) => p.id)
    .filter((id) => id !== ME && score(id) > 0)
    .sort((a, b) => score(b) - score(a))[0];
  return other ? [ME, other] : [ME];
}

export function ScenePage({ scene, why }: { scene: Scene; why?: string }) {
  const s = useMemo(() => script(scene.phase, scene.events), [scene]);
  const clock = useShowClock(s.end);
  const [reduced, setReduced] = useReduced();
  const marks = s.segments.map((g) => ({ at: g.announceAt, label: segTitle(g).toLowerCase() }));
  const single = scene.events.length === 1 ? ENTRY[scene.events[0]!.key] : null;
  const keys = [...new Set(scene.events.map((e) => e.key))] as EventKey[];
  return (
    <Page>
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1">
          <span className="label-caps">
            {PHASE_NAME[scene.phase]} · {single ? `${TIER_WORD[single.tier]} · ${WAVE_NAME[single.wave]}` : `${scene.events.length} events in one phase`}
          </span>
          <h1 className="flex items-center gap-3 font-display text-3xl font-semibold">
            {scene.events.slice(0, 4).map((e, i) => (
              <SignBadge key={i} ev={e} size={44} />
            ))}
            {scene.title}
          </h1>
          <p className="max-w-[860px] text-sm text-ink-2">{why ?? scene.shows}</p>
        </div>
      </div>
      <Controls clock={clock} end={s.end} reduced={reduced} setReduced={setReduced} marks={marks} />
      <RunningOrder s={s} t={clock.t} seek={clock.seek} />
      <ShowProvider value={{ s, t: clock.t, reduced }}>
        <div className="flex flex-wrap items-start gap-4" data-reduced={reduced}>
          {phonesFor(scene).map((id) => (
            <div key={id} className="flex flex-col gap-1">
              <span className="label-caps flex items-center gap-1">
                <PlayerMark slot={seat(id).slot} size={14} /> {name(id)}’s phone
              </span>
              <PhoneFrame>
                <PhoneShow me={id} {...(scene.tiles ? { tiles: scene.tiles } : {})} />
              </PhoneFrame>
            </div>
          ))}
          <TvPending />
        </div>
      </ShowProvider>
      <div className="flex flex-wrap gap-4">
        {scene.events.map((e, i) => (
          <SceneData key={i} ev={e} {...(scene.tiles ? { tiles: scene.tiles } : {})} />
        ))}
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="label-caps">Not in the engine yet</h2>
        <GapTable ids={[...new Set(keys.flatMap((k) => EVENT_GAPS[k]))]} />
      </section>
    </Page>
  );
}

/** Where the TV goes: it plays in the direction Heiko picks. */
function TvPending() {
  return (
    <div className="flex h-[200px] w-[420px] flex-col justify-center gap-1 rounded-panel border border-dashed border-holo-line p-4 text-sm text-ink-2" data-testid="tv-pending">
      <span className="label-caps">The TV</span>
      Plays in the direction Heiko picks: headline events first. The phones, the running order and the copy here are the same in every direction.
    </div>
  );
}

function SceneData({ ev, tiles }: { ev: ShowEvent; tiles?: MapTile[] }) {
  const c = ENTRY[ev.key];
  return (
    <div className="flex max-w-[640px] flex-col gap-2 rounded-panel border border-holo-line bg-panel p-3" data-testid={`data-${ev.key}`}>
      <span className="flex items-center gap-2">
        <EventGlyph k={ev.key} size={20} className="text-ink-2" />
        <span className="font-display text-lg font-semibold">{c.title}</span>
        <TierChip tier={c.tier} />
      </span>
      <span className="text-sm">
        <span className="text-ink-3">TV says: </span>“{ev.line}”
      </span>
      <span className="text-sm text-ink-2">
        <span className="font-mono text-xs uppercase text-holo">{c.motion}</span> · {c.look}
      </span>
      <LandsOn ev={ev} {...(tiles ? { tiles } : {})} />
      <span className="label-caps">What drives it</span>
      <ul className="flex list-disc flex-col gap-0.5 pl-4 text-sm text-ink-2">
        {drivesOf(ev).map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      {(ev.effects ?? []).length > 0 && (
        <span className="text-xs text-ink-3">
          Off the map: {ev.effects!.map((f) => `${f.on} ${f.what} ${f.delta > 0 ? '+' : ''}${f.delta}${f.pct ? '%' : ''}${effectIsGood(f) ? ' (good)' : ''}`).join(' · ')}
        </span>
      )}
    </div>
  );
}

/** Routes this layer owns: #catalogue, #event-<key>, #together-<id>. Null for any other hash. */
export function sharedRoute(hash: string): ReactNode | null {
  if (hash === 'catalogue') return <CataloguePage />;
  if (hash.startsWith('event-')) {
    const scene = EVENT_SCENES.find((s) => s.id === `ev-${hash.slice(6)}`);
    return scene ? <ScenePage key={hash} scene={scene} /> : null;
  }
  if (hash.startsWith('together-')) {
    const scene = TOGETHER.find((s) => s.id === hash.slice(9));
    return scene ? <ScenePage key={hash} scene={scene} why={scene.why} /> : null;
  }
  return null;
}

export const EVENT_COUNT = CATALOGUE.length;
