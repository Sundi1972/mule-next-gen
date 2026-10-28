import type { MuleView, ProductionView } from '@mule/protocol';
import { useMemo } from 'react';
import { Creature, cx, EventCard, frameMs, GoodIcon, landed, landing, ProductionMap, SeatSpeciesProvider, SHOW, ShowRoot, showTime, SLOT_COLOR, useSeatSpecies, type Good, type Slot } from '@mule/ui';
import { fmt, mapTiles, seatSpecies, slotOf } from '../game/derive';
import { useServerNow } from '../net/react';
import { TvHeader } from './TableApp';

/** The big screen during production: the map show, the event, and every player's slot where their goods land. */
export function TvProduction({ game, production }: { game: MuleView; production: ProductionView }) {
  const t = showTime(game.phaseEndsAt, useServerNow(frameMs(production.lengthMs)), production.lengthMs, production);
  const tiles = useMemo(() => mapTiles(game), [game]);
  const ev = production.events[0] ?? null;
  const slots = Object.fromEntries(game.players.map((p) => [p.id, (slotOf(game, p.id) ?? 0) as Slot]));
  return (
    <SeatSpeciesProvider value={seatSpecies(game)}>
      <ShowRoot className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink" data-phase="production">
        <TvHeader game={game} title="Production" />
        <div className="flex min-h-0 flex-1 gap-6">
          <ProductionMap width={game.width} height={game.height} tiles={tiles} production={production} t={t} slots={slots} tv className="w-[820px] shrink-0 self-start" />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <EventCard ev={ev} t={t} tv />
            {(!ev || t < SHOW.cardAt) && (
              <>
                <span className="label-caps text-base!">Why each plot made what it made</span>
                <WhyLegend />
              </>
            )}
            <p className="mt-auto font-display text-xl leading-snug text-ink-2">
              {t < SHOW.cardAt ? 'Every plot shows what it made.' : t < SHOW.flyStart ? (ev ? `${ev.title}: watch the map.` : 'A quiet month: no event.') : 'The goods fly home.'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3" data-testid="colony-bar">
          {game.players.map((p) => (
            <PlayerSlot key={p.id} player={p} slot={slots[p.id]!} got={landed(production, t, p.id)} glow={landing(production, t, p.id)} />
          ))}
        </div>
      </ShowRoot>
    </SeatSpeciesProvider>
  );
}

/** What the badges mean, in words. */
function WhyLegend() {
  const rows: [string, string, Good | undefined, string][] = [
    ['+1', 'bg-ok text-on-holo', undefined, 'Next to your own plot of the same good'],
    ['½', 'bg-alert text-white', 'water', 'A farm with no Water makes half'],
    ['½', 'bg-alert text-white', 'energy', 'No Energy for the plot: half'],
    ['−1', 'bg-warn text-void', undefined, 'Polluted ground'],
  ];
  return (
    <ul className="flex flex-col gap-2" data-testid="why-legend">
      {rows.map(([badge, tone, icon, text]) => (
        <li key={text} className="flex items-center gap-3 text-lg leading-snug text-ink-2">
          <span className={cx('flex w-12 shrink-0 items-center justify-center gap-0.5 rounded-chip px-1 py-0.5 font-mono text-base font-bold', tone)}>
            {icon && <GoodIcon good={icon} size={14} />}
            {badge}
          </span>
          {text}
        </li>
      ))}
    </ul>
  );
}

/** One player's slot on the colony bar: public money, and only what has flown home this month, never what they hold. */
function PlayerSlot({ player, slot, got, glow }: { player: MuleView['players'][number]; slot: Slot; got: Partial<Record<Good, number>>; glow: boolean }) {
  const species = useSeatSpecies(slot);
  return (
    <div
      data-fly-target={player.id}
      className={cx('flex h-[64px] items-center gap-3 rounded-panel border-2 bg-panel px-3 transition-shadow', glow ? 'shadow-glow' : '')}
      style={{ borderColor: SLOT_COLOR[slot] }}
      data-testid={`slot-${player.id}`}
    >
      <Creature species={species} color={SLOT_COLOR[slot]} size={40} />
      <span className="flex shrink-0 flex-col">
        <span className="font-display text-lg font-semibold leading-tight">{player.name}</span>
        <span data-num className="font-mono text-base text-ink-2">
          {fmt(player.money)} cr
        </span>
      </span>
      <span className="ml-auto flex min-w-0 flex-wrap justify-end gap-x-1.5 gap-y-0.5">
        {(Object.entries(got) as [Good, number][]).map(([g, n]) => (
          <span key={g} data-num className="flex items-center gap-0.5 font-mono text-sm font-bold text-ok">
            <span data-good={g}>+{n}</span>
            <GoodIcon good={g} size={16} />
          </span>
        ))}
      </span>
    </div>
  );
}
