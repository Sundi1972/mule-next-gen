import type { MuleView, ProductionView } from '@mule/protocol';
import { useMemo, type ReactNode } from 'react';
import {
  Creature,
  cx,
  EventBoundary,
  EventColonyChips,
  EventPips,
  EventShow,
  EventTvLog,
  frameMs,
  GOOD_NAME,
  GoodIcon,
  goodAt,
  harvest,
  landed,
  landing,
  ProductionMap,
  productionShowProps,
  SeatSpeciesProvider,
  SHOW,
  showActAt,
  ShowRoot,
  showTime,
  showTimes,
  SLOT_COLOR,
  useEventLivingView,
  useEventReducedMotion,
  useSeatSpecies,
  type Good,
  type ShowAct,
  type ShowData,
  type ShowReason,
  type ShowPlayer,
  type Slot,
} from '@mule/ui';
import { mapTiles, seatSpecies, slotOf } from '../game/derive';
import { useServerNow } from '../net/react';
import { TvHeader } from './TableApp';

/**
 * The big screen during production, in Heiko's order C (ws6-ux AM-19, mock b65c3972 variant C): the map show; a rail
 * that names the step (the good being harvested, then Bonuses, then Losses, the month's events, then the flight); and
 * every player's silo along the foot, filling as their goods land.
 */
export function TvProduction({ game, production }: { game: MuleView; production: ProductionView }) {
  const show: ShowData = production;
  const t = showTime(game.phaseEndsAt, useServerNow(frameMs(production.lengthMs)), production.lengthMs, show);
  const tiles = useMemo(() => mapTiles(game), [game]);
  const slots = Object.fromEntries(game.players.map((p) => [p.id, (slotOf(game, p.id) ?? 0) as Slot]));
  const players = useMemo<ShowPlayer[]>(() => game.players.map((p) => ({ id: p.id, slot: (slotOf(game, p.id) ?? 0) as Slot, name: p.name })), [game]);
  const reduced = useEventReducedMotion();
  return (
    <SeatSpeciesProvider value={seatSpecies(game)}>
      <ShowRoot className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink" data-phase="production">
        {/* The header's pips, the rail and the silos read the very script the map plays: the same events, clock and pace. */}
        <EventShow {...productionShowProps(show, t, { reduced, mode: 'tv', players, tiles, width: game.width, height: game.height })}>
          <TvHeader game={game} title="Production" extra={<EventPips />} />
          {/* The map takes the height the header's ticker leaves, never more: three chat lines would push it under the silos. */}
          <div className="flex min-h-0 flex-1 gap-6 [container-type:size]">
            <div className="shrink-0 self-start" style={{ width: `min(800px, calc(100cqh * ${game.width} / ${game.height}))` }}>
              <ProductionMap width={game.width} height={game.height} tiles={tiles} production={show} t={t} slots={slots} players={players} reduced={reduced} mode="tv" tv className="w-full" />
            </div>
            <Rail game={game} show={show} t={t} />
          </div>
          <SiloBar game={game} show={show} t={t} slots={slots} />
        </EventShow>
      </ShowRoot>
    </SeatSpeciesProvider>
  );
}

const ACTS: { id: Exclude<ShowAct, 'intro' | 'hold'>; title: string; line: string }[] = [
  { id: 'harvest', title: 'Harvest', line: 'Good by good, every player’s plots at once.' },
  { id: 'bonus', title: 'Bonuses', line: 'Plots next to their own plot of the same good, and species good at it, make more. Every player at once.' },
  { id: 'loss', title: 'Losses', line: 'Plots short of Energy or Water, or on polluted ground, make less. Every player at once.' },
  { id: 'events', title: 'This month on Irata', line: 'The month’s events play over the map.' },
  { id: 'flight', title: 'Into the silos', line: 'Every plot’s goods fly home to its owner’s silo.' },
];

/** What each part means, in words, lit once it has shown on the map. */
const WHY: Record<string, { label: string; badge: string; tone: string; icon?: Good }> = {
  cluster: { label: 'Next to your own plot of the same good', badge: '+1', tone: 'bg-ok text-on-holo' },
  species: { label: 'Your species is good at this', badge: '+1', tone: 'bg-ok text-on-holo' },
  special: { label: 'A special field', badge: '+', tone: 'bg-ok text-on-holo' },
  pollution: { label: 'Polluted ground', badge: '−1', tone: 'bg-warn text-void' },
  noWater: { label: 'A farm with no Water makes half', badge: '½', tone: 'bg-alert text-white', icon: 'water' },
  noEnergy: { label: 'No Energy for the plot: half', badge: '½', tone: 'bg-alert text-white', icon: 'energy' },
};

function Rail({ game, show, t }: { game: MuleView; show: ShowData; t: number }) {
  const times = showTimes(show);
  const act = showActAt(show, t);
  const at = act === 'hold' ? 'flight' : act === 'intro' ? 'harvest' : act;
  const acts = ACTS.filter((a) => a.id !== 'events' || times.eventsAt !== null);
  const now = acts.findIndex((a) => a.id === at);
  const good = act === 'harvest' ? goodAt(show, t) : null;
  const reasons = [...new Set(show.lines.flatMap((l) => l.parts.map((p) => p.why)))].filter((w): w is ShowReason => w in WHY);
  const seen = new Set(show.lines.flatMap((l) => l.parts.filter((p) => t >= (p.delta > 0 ? times.bonusAt : times.lossAt)).map((p) => p.why)));
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4" data-testid="rail">
      <ol className="flex flex-col gap-1.5" data-testid="acts">
        {acts.map((a, i) => (
          <li key={a.id} className={cx('flex items-baseline gap-3 rounded-control px-3 py-1.5', i === now && 'bg-holo-soft')} data-testid={`act-${a.id}`} data-now={i === now}>
            <span className={cx('font-mono text-lg font-bold', i === now ? 'text-holo' : i < now ? 'text-ok' : 'text-ink-3')}>{i < now ? '✓' : i + 1}</span>
            <span className="flex flex-col gap-1">
              <span className={cx('font-display text-2xl font-semibold leading-none', i === now ? 'text-ink' : 'text-ink-3')}>{a.title}</span>
              {i === now && a.id !== 'events' && (
                <span className="flex items-center gap-2 text-lg leading-snug text-ink-2">
                  {good && <GoodIcon good={good} size={22} />}
                  {good ? `${GOOD_NAME[good]}: every player’s plots at once.` : a.line}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {act === 'events' ? (
        <EventBoundary>
          <EventTvLog />
        </EventBoundary>
      ) : (
        (act === 'bonus' || act === 'loss') &&
        reasons.length > 0 && (
          <ul className="flex flex-col gap-1.5" data-testid="why-legend">
            {reasons.map((w) => (
              <li key={w} className={cx('flex items-center gap-3 text-base leading-snug', seen.has(w) ? 'text-ink-2' : 'opacity-30')}>
                <span className={cx('flex w-11 shrink-0 items-center justify-center gap-0.5 rounded-chip px-1 py-0.5 font-mono text-sm font-bold', WHY[w]!.tone)}>
                  {WHY[w]!.icon && <GoodIcon good={WHY[w]!.icon!} size={12} />}
                  {WHY[w]!.badge}
                </span>
                {WHY[w]!.label}
              </li>
            ))}
          </ul>
        )
      )}
      <SpeedUp game={game} show={show} />
    </div>
  );
}

/** Who has asked to speed up, at the rail's foot; the computer players always agree, so only people are waited for. */
function SpeedUp({ game, show }: { game: MuleView; show: ShowData }) {
  const people = game.players.filter((p) => !p.isAi);
  const asked = new Set(show.hurry?.asked ?? []);
  const fast = show.hurry?.from != null;
  const n = people.filter((p) => asked.has(p.id)).length;
  if (!fast && n === 0) return <p className="mt-auto text-base text-ink-3">In a hurry? Everyone taps ⏩ on their phone to speed it up.</p>;
  const waiting = people.filter((p) => !asked.has(p.id)).map((p) => p.name);
  return (
    <div className={cx('mt-auto flex items-center gap-3 rounded-control px-3 py-2', fast ? 'bg-holo-soft' : 'bg-raised')} data-testid="speed-up">
      <span className="font-mono text-2xl text-holo">⏩</span>
      <span className="text-lg leading-snug text-ink">
        {fast ? `Everyone asked: playing ${SHOW.fast}× faster` : `${n} of ${people.length} asked to speed up. Waiting for ${waiting.join(' and ')}.`}
      </span>
    </div>
  );
}

/** Every player's silo along the foot: this month's harvest only, never what they hold. */
function SiloBar({ game, show, t, slots }: { game: MuleView; show: ShowData; t: number; slots: Record<string, Slot> }) {
  const { player, spot } = useEventLivingView();
  const most = Math.max(1, ...game.players.map((p) => Object.values(harvest(show, p.id)).reduce((n, v) => n + (v ?? 0), 0)));
  return (
    <div className="grid grid-cols-4 gap-3" data-testid="silo-bar">
      {game.players.map((p) => {
        const got = landed(show, t, p.id);
        const fill = Object.values(got).reduce((n, v) => n + (v ?? 0), 0) / most;
        return (
          <Silo key={p.id} player={p} slot={slots[p.id]!} got={got} fill={fill} glow={landing(show, t, p.id) || (player === p.id && spot > 0.5)} asked={!p.isAi && (show.hurry?.asked ?? []).includes(p.id)}>
            <EventColonyChips id={p.id} plots={show.lines} />
          </Silo>
        );
      })}
    </div>
  );
}

function Silo({ player, slot, got, fill, glow, asked, children }: { player: MuleView['players'][number]; slot: Slot; got: Partial<Record<Good, number>>; fill: number; glow: boolean; asked: boolean; children?: ReactNode }) {
  const species = useSeatSpecies(slot);
  const colour = SLOT_COLOR[slot];
  return (
    <div className={cx('flex h-[84px] items-stretch gap-3 rounded-panel border-2 bg-panel px-3 py-1.5 transition-shadow', glow && 'shadow-glow')} style={{ borderColor: colour }} data-testid={`silo-${player.id}`}>
      {/* The name on up to two lines, broken between words ("The / Accountant"), cut only past the second. */}
      <span className="flex w-24 shrink-0 flex-col items-center justify-center gap-0.5">
        <Creature species={species} color={colour} size={28} />
        <span className="line-clamp-2 max-w-full break-words text-center font-display text-sm font-semibold leading-tight" data-testid={`silo-name-${player.id}`}>
          {player.name}
        </span>
      </span>
      {/* The silo: a vessel in the player's colour that fills as their goods land. */}
      <span data-fly-target={player.id} className="relative flex min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-t-[22px] rounded-b-control border-2 bg-raised" style={{ borderColor: colour }}>
        <span className="absolute inset-x-0 bottom-0 transition-[height] duration-300" style={{ height: `${Math.round(Math.min(1, fill) * 100)}%`, background: `color-mix(in srgb, ${colour} 28%, transparent)` }} />
        <span className="relative flex flex-wrap items-end justify-center gap-x-2 gap-y-0.5 px-1 pb-1">
          {children}
          {(Object.entries(got) as [Good, number][]).map(([g, n]) => (
            <span key={g} className="flex items-center gap-0.5 font-mono text-base font-bold text-ink">
              <GoodIcon good={g} size={18} />
              <span data-num data-good={g}>
                {n}
              </span>
            </span>
          ))}
        </span>
        {asked && (
          <span className="absolute right-1 top-1 rounded-chip bg-holo-soft px-1 font-mono text-xs text-holo" title={`${player.name} asked to speed up`}>
            ⏩
          </span>
        )}
      </span>
    </div>
  );
}
