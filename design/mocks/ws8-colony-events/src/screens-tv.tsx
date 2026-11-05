import type { ColonyView } from '@mule/protocol';
import {
  Creature,
  cx,
  EventColonyChips,
  EventLivingMap,
  EventPips,
  EventShow,
  EventTvLog,
  eventHitAt,
  eventSegments,
  flyAt,
  GoodIcon,
  landed,
  landing,
  PlayerMark,
  ProductionMap,
  productionShowProps,
  SHOW,
  ShowRoot,
  showEnd,
  SLOT_COLOR,
  type Good,
  type ShowData,
  useSeatSpecies,
} from '@mule/ui';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { EventDeltaChip, EventSignBadge } from '../../../../packages/ui/src/events/glyphs';
import { BuildSite } from '../../../../apps/web/src/components/Colony';
import { fmt } from '../../../../apps/web/src/game/derive';
import { cardAt } from '../../../../packages/ui/src/events/living';
import { Controls, useShowClock } from './clock';
import {
  bandOf,
  c26Words,
  colony,
  FESTIVAL,
  forShow,
  GOVERNOR,
  H,
  INTRO_MS,
  LINES,
  nameOf,
  PLAYERS,
  riot,
  SLOTS,
  STRIKE,
  STRIKE_PLANNING,
  STRIKE_PRODUCTION,
  TILES,
  TILES_PARK_HIT,
  W,
  type C26Event,
} from './fixture';
import { StrikeBadge, TvFrame, TvHeader } from './frames';
import { COUNT, countAt, FLIGHT, GaugeFlights, type Flight } from './landing';
import { NewStories, OverMap, StrikePaid } from './stories';

const GRID = { width: W, height: H };
const segOf = (ev: C26Event, mode: 'tv' | 'solo' = 'tv', start = 0) => eventSegments({ events: [forShow(ev)], introMs: INTRO_MS }, start, mode)[0]!;

/** Every show screen: its clock and the reviewer's controls over it. */
export function useScreen(end: number) {
  const clock = useShowClock(end);
  const [reduced, setReduced] = useState(false);
  return { clock, reduced, controls: (marks: { at: number; label: string }[]) => <Controls clock={clock} end={end} reduced={reduced} setReduced={setReduced} marks={marks} /> };
}

/** The TV's map and rail during a show, as TvProduction lays them out. */
function TvBody({ map, rail }: { map: ReactNode; rail: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 gap-6">
      <div className="relative w-[760px] shrink-0 self-start" data-testid="tv-map">
        {map}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4" data-testid="rail">
        {rail}
      </div>
    </div>
  );
}

/** A line in the rail beside the log, in the log's own row style: who the table waits for, or the news of what they did. */
function RailLine({ slot, title, line, tone = 'news', testid }: { slot?: number; title: string; line: string; tone?: 'news' | 'ok' | 'bad'; testid: string }) {
  return (
    <div className={cx('flex items-center gap-3 rounded-panel border p-3 animate-[ev-drop_0.35s_ease-out]', tone === 'ok' ? 'border-ok bg-holo-soft' : tone === 'bad' ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel')} data-testid={testid}>
      {slot !== undefined && <PlayerMark slot={slot as 0} size={40} />}
      <span className="flex min-w-0 flex-col">
        <span className="font-display text-xl font-semibold leading-tight">{title}</span>
        <span className="text-base leading-snug text-ink-2">{line}</span>
      </span>
    </div>
  );
}

// --- 1 + 3 · General strike in planning, and the Governor's decision ------------------------------------------------

export type StrikeOutcome = 'waiting' | 'paid' | 'unpaid';

/**
 * Planning on the TV: the strike is announced (its story: strikers walk out to every Food plot), then the table waits
 * for the Governor. Paid is no event and no story (C26): the badge turns PAID from ColonyView.strike.paid, the fund
 * note drops, the strikers are gone and the news line says who paid. Not paid: the strikers stay.
 */
export function TvStrikePlanning({ outcome }: { outcome: StrikeOutcome }) {
  const seg = segOf(STRIKE_PLANNING);
  const decideAt = seg.endAt + 2;
  const end = decideAt + 3;
  const { clock, reduced, controls } = useScreen(end);
  const t = clock.t;
  const ev = useMemo(() => [forShow(STRIKE_PLANNING)], []);
  const announced = t >= eventHitAt(seg, ev[0]!, ev[0]!.hits[0]!, reduced, GRID);
  const decided = outcome !== 'waiting' && t >= decideAt;
  const paid = outcome === 'paid' && decided;
  const view: ColonyView = colony({ strike: announced ? { good: STRIKE.good, cost: STRIKE.cost, paid } : null, fund: paid ? STRIKE.fund - STRIKE.cost : STRIKE.fund });
  return (
    <>
      {controls([
        { at: seg.announceAt, label: 'announced' },
        { at: seg.playAt + 2.6, label: 'strikers arrive' },
        { at: seg.endAt, label: 'waiting' },
        ...(outcome !== 'waiting' ? [{ at: decideAt, label: outcome === 'paid' ? 'Kai pays' : 'planning ends' }] : []),
      ])}
      <TvFrame reduced={reduced} testid="tv-strike-planning">
        <StrikePaid.Provider value={paid}>
          <EventShow events={ev} introMs={INTRO_MS} t={t} reduced={reduced} width={W} height={H} tiles={TILES} players={PLAYERS}>
            <TvHeader title="Planning" colony={view} seconds={Math.max(0, 45 - t)} badge={<StrikeBadge strike={view.strike} />} />
            <TvBody
              map={<EventLivingMap size="tv" over={<NewStories size="tv" />} />}
              rail={
                <>
                  <EventTvLog />
                  {t >= seg.endAt && !decided && <RailLine testid="waiting-governor" slot={SLOTS[GOVERNOR]} title={`Waiting for ${nameOf(GOVERNOR)}, the Governor`} line={`Pay the strikers ${STRIKE.cost} cr from the fund, or let them strike. After the votes.`} />}
                  {paid && <RailLine testid="news-paid" tone="ok" slot={SLOTS[GOVERNOR]} title={`${nameOf(GOVERNOR)} pays the Food strikers ${STRIKE.cost} cr`} line={`The strike is off. Fund ${fmt(STRIKE.fund)} → ${fmt(STRIKE.fund - STRIKE.cost)} cr.`} />}
                  {outcome === 'unpaid' && decided && <RailLine testid="news-unpaid" tone="bad" slot={SLOTS[GOVERNOR]} title="The strike holds" line="Kai let them strike: every Food plot makes 20% this month." />}
                </>
              }
            />
          </EventShow>
        </StrikePaid.Provider>
      </TvFrame>
    </>
  );
}

// --- 4 · Production, the events step ---------------------------------------------------------------------------------

/** One player's slot on the colony bar (TvProduction.tsx PlayerSlot), so the goods have somewhere to fly. */
function PlayerSlot({ id, got, glow, children }: { id: string; got: Partial<Record<Good, number>>; glow: boolean; children?: ReactNode }) {
  const slot = SLOTS[id]!;
  return (
    <div data-fly-target={id} className={cx('flex h-[64px] items-center gap-3 rounded-panel border-2 bg-panel px-3 transition-shadow', glow && 'shadow-glow')} style={{ borderColor: SLOT_COLOR[slot] }} data-testid={`slot-${id}`}>
      <Creature species={useSeatSpecies(slot)} color={SLOT_COLOR[slot]} size={40} />
      <span className="font-display text-lg font-semibold leading-tight">{nameOf(id)}</span>
      <span className="ml-auto flex min-w-0 flex-wrap justify-end gap-x-1.5 gap-y-0.5">
        {children}
        {(Object.entries(got) as [Good, number][]).map(([g, n]) => (
          <span key={g} data-num className="flex items-center gap-0.5 font-mono text-sm font-bold text-ok">
            +{n}
            <GoodIcon good={g} size={16} />
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * TvProduction (graft target: apps/web/src/table/TvProduction.tsx) with the real ProductionMap, its real timeline and
 * a fixture production. Unpaid: production's own generalStrike MonthEvent lands on every Food plot in the events step,
 * animated like a walkout, its bars drop to 20%, then the goods fly. Paid: no event, no story.
 */
export function TvProductionStrike({ paid }: { paid: boolean }) {
  const production: ShowData = useMemo(() => {
    const events = paid ? [] : [forShow(STRIKE_PRODUCTION)];
    return { lines: LINES, events, introMs: events.length ? INTRO_MS : 0, lengthMs: 0 };
  }, [paid]);
  const end = showEnd(production);
  const { clock, reduced, controls } = useScreen(end);
  const t = clock.t;
  const view = colony({ strike: { good: STRIKE.good, cost: STRIKE.cost, paid }, fund: paid ? STRIKE.fund - STRIKE.cost : STRIKE.fund });
  const seg = paid ? null : eventSegments(production, SHOW.eventAt, 'tv')[0]!;
  return (
    <>
      {controls([
        { at: SHOW.fillStart, label: 'plots fill' },
        ...(seg ? [{ at: seg.announceAt, label: 'strike' }, { at: seg.playAt + 2.6, label: 'bars drop' }] : []),
        { at: flyAt(0, production), label: 'goods fly' },
      ])}
      <TvFrame reduced={reduced} testid={paid ? 'tv-production-paid' : 'tv-production-unpaid'}>
        <ShowRoot className="flex min-h-0 flex-1 flex-col gap-4">
          <EventShow {...productionShowProps(production, t, { reduced, mode: 'tv', players: PLAYERS, tiles: TILES, width: W, height: H })}>
            <TvHeader title="Production" colony={view} extra={<EventPips />} badge={<StrikeBadge strike={view.strike} />} />
            <TvBody
              map={
                <>
                  <ProductionMap width={W} height={H} tiles={TILES} production={production} t={t} slots={SLOTS} players={PLAYERS} reduced={reduced} mode="tv" tv className="w-full" />
                  {/* The strikers and their chips over the map's box: ProductionMap has no layer slot (DS-GAP: an `over` prop, as EventLivingMap's). */}
                  <OverMap>
                    <NewStories size="tv" />
                  </OverMap>
                </>
              }
              rail={
                <>
                  {t >= SHOW.cardAt && <EventTvLog />}
                  {paid && <RailLine testid="paid-note" tone="ok" slot={SLOTS[GOVERNOR]} title="No strike this month" line={`${nameOf(GOVERNOR)} paid the Food strikers ${STRIKE.cost} cr in planning.`} />}
                  <p className="mt-auto font-display text-xl leading-snug text-ink-2">{t < SHOW.cardAt ? 'Every plot shows what it made.' : t >= flyAt(0, production) ? 'The goods fly home.' : ''}</p>
                </>
              }
            />
            <div className="grid grid-cols-4 gap-3" data-testid="colony-bar">
              {PLAYERS.map((p) => (
                <PlayerSlot key={p.id} id={p.id} got={landed(production, t, p.id)} glow={landing(production, t, p.id)}>
                  <EventColonyChips id={p.id} plots={production.lines} />
                </PlayerSlot>
              ))}
            </div>
          </EventShow>
        </ShowRoot>
      </TvFrame>
    </>
  );
}

// --- 5 · Festival on the TV: the landing on the gauges ----------------------------------------------------------------

/** The pulse round a gauge whose band flips, or whose number a chip has just landed on (DS-GAP: cev-pulse in mock.css). */
const pulse = (testid: string, on: boolean) => (on ? `[&_[data-testid=${testid}]]:animate-[cev-pulse_0.8s_ease-out]` : '');

/**
 * The card of what the festival changed, over the map from its reveal (cards.tsx EffectsCard's look). DS-GAP: the real
 * EffectsCard draws only off-map motions and words them with effectWords, which has no mood, prestige or air yet; in
 * the build both widen and this card is the real one. A chip that has left for its gauge leaves its place empty.
 */
function ChangesCard({ ev, flights, t, reduced, show }: { ev: C26Event; flights: Flight[]; t: number; reduced: boolean; show: boolean }) {
  if (!show) return null;
  const gauge = flights.map((l) => l);
  const store = (ev.effects ?? []).filter((f) => f.on === 'store');
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center" data-testid="changes-card">
      <div className={cx('flex w-[520px] flex-col gap-3 rounded-panel border-2 bg-panel/95 p-5 shadow-chip', !reduced && 'animate-[ev-pop_0.35s_ease-out]', ev.sign === 'good' ? 'border-ok' : 'border-alert')}>
        <span className="flex items-center gap-2">
          <EventSignBadge ev={forShow(ev)} size={44} />
          <span className="font-display text-3xl font-bold">{ev.title}</span>
        </span>
        <span className="flex items-center justify-between gap-3">
          <span className="label-caps whitespace-nowrap text-base!">The colony</span>
          <span className="flex gap-1.5">
            {gauge.map((l) => (
              <span key={l.from} data-testid={l.from} style={{ opacity: t >= l.leaves ? 0.15 : 1 }}>
                <EventDeltaChip delta={1} text={c26Words(l.f)} size="tv" className="text-xl!" />
              </span>
            ))}
          </span>
        </span>
        {store.map((f) => (
          <span key={f.what} className="flex items-center justify-between gap-3" data-testid="fx-store">
            <span className="label-caps whitespace-nowrap text-base!">The store</span>
            <EventDeltaChip delta={1} good={f.what as Good} text="Food demand +25%" size="tv" className="text-xl!" />
          </span>
        ))}
      </div>
    </div>
  );
}

export function TvFestival({ from, to }: { from: number; to: number }) {
  const seg = segOf(FESTIVAL);
  const card = cardAt(seg);
  const flights: Flight[] = [
    { f: FESTIVAL.effects![0]!, from: 'fx-mood', to: 'gauge-happiness', leaves: card + 0.7 },
    { f: FESTIVAL.effects![1]!, from: 'fx-prestige', to: 'gauge-prestige', leaves: card + 1.1 },
  ];
  const end = seg.endAt + 1.5;
  const { clock, reduced, controls } = useScreen(end);
  const t = clock.t;
  const root = useRef<HTMLDivElement>(null);
  const ev = useMemo(() => [forShow(FESTIVAL)], []);
  const moodLands = flights[0]!.leaves + FLIGHT;
  const prestigeLands = flights[1]!.leaves + FLIGHT;
  const happiness = countAt(t, from, to, moodLands, reduced);
  const prestige = countAt(t, 5, 7, prestigeLands, reduced);
  const flips = bandOf(from) !== bandOf(to);
  // The band flips as the count crosses its threshold.
  const crossAt = flips ? moodLands + COUNT * ((80 - from) / (to - from)) : Infinity;
  const view = colony({ happiness, prestige, lastHappiness: from });
  return (
    <>
      {controls([
        { at: seg.announceAt, label: 'announced' },
        { at: seg.playAt + 1, label: 'bunting' },
        { at: card, label: 'changes' },
        { at: moodLands, label: 'mood' },
        { at: prestigeLands + 0.3, label: 'prestige' },
      ])}
      <TvFrame ref={root} reduced={reduced} testid={flips ? 'tv-festival-flip' : 'tv-festival'}>
        <EventShow events={ev} introMs={INTRO_MS} t={t} reduced={reduced} width={W} height={H} tiles={TILES} players={PLAYERS}>
          <TvHeader
            title="Planning"
            colony={view}
            seconds={Math.max(0, 45 - t)}
            gaugeClass={cx(pulse('gauge-happiness', !reduced && t >= crossAt && t < crossAt + 0.8), !flips && pulse('gauge-happiness', !reduced && t >= moodLands && t < moodLands + 0.8), pulse('gauge-prestige', !reduced && t >= prestigeLands && t < prestigeLands + 0.8))}
          />
          <TvBody
            map={
              <>
                <EventLivingMap size="tv" over={<NewStories size="tv" />} />
                <ChangesCard ev={FESTIVAL} flights={flights} t={t} reduced={reduced} show={t >= card && t < seg.endAt} />
              </>
            }
            rail={
              <>
                <EventTvLog />
                {t >= moodLands + COUNT && <RailLine testid="mood-line" tone="ok" title={`The colony’s mood: ${to}, ${bandOf(to) === 'thriving' ? 'Thriving' : 'Content'}`} line="Prestige 7 · the store buys a quarter more Food this month." />}
              </>
            }
          />
        </EventShow>
        <GaugeFlights root={root} flights={flights} t={t} reduced={reduced} />
      </TvFrame>
    </>
  );
}

// --- 6 · Riot at the month end ---------------------------------------------------------------------------------------

/**
 * The month end's show (upkeep): a crowd at the store, a third of each shelf goes, the damaged object counts 0. With a
 * plot (the park) the map's HIT mark goes up as it is hit; without one (the hospital) only the build site row and the
 * Prestige gauge say it, which they do in both.
 */
export function TvRiot({ object }: { object: 'park' | 'hospital' }) {
  const ev = useMemo(() => riot(object), [object]);
  const shown = useMemo(() => [forShow(ev)], [ev]);
  const seg = segOf(ev);
  const end = seg.endAt + 1.5;
  const { clock, reduced, controls } = useScreen(end);
  const t = clock.t;
  const hitAt = eventHitAt(seg, shown[0]!, shown[0]!.hits[0] ?? null, reduced, GRID);
  const hit = t >= hitAt;
  const worth = object === 'park' ? 2 : 3;
  const prestige = countAt(t, 5, 5 - worth, hitAt, reduced);
  const view = colony({ prestige, damaged: hit ? object : null });
  return (
    <>
      {controls([
        { at: seg.announceAt, label: 'announced' },
        { at: seg.playAt + 0.6, label: 'crowd' },
        { at: seg.playAt + 2, label: 'shelves' },
        { at: hitAt, label: `${object} hit` },
      ])}
      <TvFrame reduced={reduced} testid={`tv-riot-${object}`}>
        <EventShow events={shown} introMs={INTRO_MS} t={t} reduced={reduced} width={W} height={H} tiles={hit && object === 'park' ? TILES_PARK_HIT : TILES} players={PLAYERS}>
          <TvHeader title="End of the month" colony={view} extra={<EventPips />} gaugeClass={pulse('gauge-prestige', !reduced && hit && t < hitAt + 0.8)} />
          <TvBody
            map={<EventLivingMap size="tv" over={<NewStories size="tv" />} />}
            rail={
              <>
                <EventTvLog />
                <BuildSite colony={view} players={[]} size="tv" className="mt-auto [&_li]:py-2" />
              </>
            }
          />
        </EventShow>
      </TvFrame>
    </>
  );
}

// --- 7 · The month end's mood fall ------------------------------------------------------------------------------------

/**
 * Not an event (RULE-20's drift): at the month end the Happiness gauge moves from lastGauges.happiness to
 * gauges.happiness, 44 → 31, and its band flips Restless → Unhappy with a pulse. The wire carries no reasons, so none
 * are shown.
 */
export function TvMoodFall() {
  const end = 5;
  const { clock, reduced, controls } = useScreen(end);
  const t = clock.t;
  const from = 44;
  const to = 31;
  const at = 1.2;
  const happiness = countAt(t, from, to, at, reduced);
  const crossAt = at + COUNT * ((from - 40) / (from - to));
  const view = colony({ happiness, lastHappiness: from });
  return (
    <>
      {controls([
        { at: 0.1, label: 'month end' },
        { at, label: 'mood falls' },
        { at: crossAt, label: 'band flips' },
      ])}
      <TvFrame reduced={reduced} testid="tv-mood-fall">
        <TvHeader title="End of the month" colony={view} gaugeClass={pulse('gauge-happiness', !reduced && t >= crossAt && t < crossAt + 0.8)} />
        <div className="grid flex-1 place-items-center rounded-panel border border-dashed border-holo-line text-xl text-ink-3" data-testid="monthend-body">
          The month end’s table and colony report, as today (TvMonthEnd)
        </div>
      </TvFrame>
    </>
  );
}
