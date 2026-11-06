import { PRESTIGE, type PrestigeId } from '@mule/engine';
import { Button, cx, HoloMap, PlayerMark } from '@mule/ui';
import { useMemo, useState } from 'react';
import { HEIGHT, NAME, PLAYERS, SLOTS, tiles, WIDTH, type GroundsObject, type Month } from './fixture';
import { GroundsList, slotWords } from './Grounds';
import type { Richness } from './layout';
import { Scene, type Look } from './Scene';

/** What WS7's ColonyView gives the view each month (relayed 6 Nov): the gauges and the fund, read for the look and the line. */
export interface ColonyNumbers {
  fund: number;
  wealth: number;
  prestige: number;
  mood: number;
  air: number;
  /** Since last month (lastGauges), for the month end's "+N". */
  prestigeUp: number;
}

export function richness(objects: GroundsObject[], n: ColonyNumbers): Richness {
  return { standing: objects.filter((o) => o.stage === 'standing').length, mood: n.mood, air: n.air };
}

function TvHead({ month, title }: { month: Month; title: string }) {
  return (
    <header className="flex items-end justify-between border-b border-holo-line pb-3" data-testid="tv-header">
      <span className="flex flex-col">
        <span className="label-caps">Month {month} / 12</span>
        <span className="font-display text-4xl font-bold">{title}</span>
      </span>
    </header>
  );
}

/** The colony's numbers in one line under the scene: what the picture shows, said. */
function ColonyLine({ n, objects, size }: { n: ColonyNumbers; objects: GroundsObject[]; size: 'tv' | 'phone' }) {
  const tv = size === 'tv';
  const standing = objects.filter((o) => o.stage === 'standing').length;
  return (
    <p className={cx('flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-ink-2', tv ? 'text-lg' : 'text-[11px]')} data-testid="colony-line">
      <span>
        fund <strong className="text-ink">{n.fund.toLocaleString('en')} cr</strong>
      </span>
      <span>
        prestige <strong className="text-holo">{n.prestige}</strong>
      </span>
      <span>
        mood <strong className={n.mood >= 50 ? 'text-ok' : 'text-warn'}>{n.mood}</strong>
      </span>
      <span>
        standing <strong className="text-ink">{standing}</strong> · {objects.length} built or building · room for {SLOTS}
      </span>
    </p>
  );
}

/** TV, planning: the map on the left as today; the colony panel on the right is the grounds, the hero picture. */
export function TvPlanning({ month, objects, n, look }: { month: Month; objects: GroundsObject[]; n: ColonyNumbers; look: Look }) {
  const map = useMemo(() => tiles(month), [month]);
  return (
    <section className="flex aspect-video w-full flex-col gap-4 rounded-panel border border-holo-line bg-void p-6" data-testid="tv-planning">
      <TvHead month={month} title="Planning" />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="min-w-0 basis-[48%]" data-testid="tv-map">
          <HoloMap width={WIDTH} height={HEIGHT} tiles={map} density="tv" hideGround />
        </div>
        <aside className="flex min-w-0 flex-1 flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-colony-panel">
          <span className="label-caps">The colony grounds</span>
          <Scene objects={objects} rich={richness(objects, n)} look={look} words className="min-h-0 flex-1" />
          <TvLegend objects={objects} />
          <ColonyLine n={n} objects={objects} size="tv" />
        </aside>
      </div>
    </section>
  );
}

/** Under the TV's scene: each building's slot and stage in the build site's words, two columns. */
function TvLegend({ objects }: { objects: GroundsObject[] }) {
  if (objects.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-lg leading-snug" data-testid="tv-legend">
      {[...objects]
        .sort((a, b) => a.slot - b.slot)
        .map((o) => {
          const w = slotWords(o);
          return (
            <li key={o.id} className="flex min-w-0 items-baseline gap-2" data-testid={`legend-${o.id}`}>
              <span data-num className="font-mono text-ink-3">{o.slot + 1}</span>
              <span className="whitespace-nowrap font-semibold">{NAME[o.id]}</span>
              <span className={cx('min-w-0 truncate', w.tone)}>{w.line}</span>
            </li>
          );
        })}
    </ul>
  );
}

/** TV, the month end: the league as today beside the grounds, this month's change ringed and said. */
export function TvMonthEnd({ month, objects, n, look, fresh }: { month: Month; objects: GroundsObject[]; n: ColonyNumbers; look: Look; fresh: number | null }) {
  const news = fresh !== null ? objects.find((o) => o.slot === fresh) : undefined;
  return (
    <section className="flex aspect-video w-full flex-col gap-4 rounded-panel border border-holo-line bg-void p-6" data-testid="tv-month-end">
      <TvHead month={month} title="End of the month" />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex basis-[38%] flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-league">
          <span className="label-caps">League table · by Worth</span>
          {PLAYERS.map((p, i) => (
            <span key={p.id} className="flex items-center gap-3 text-2xl">
              <span data-num className="w-8 font-mono text-ink-3">{i + 1}</span>
              <PlayerMark slot={p.slot} size={30} />
              <span className="flex-1 font-display font-semibold">{p.name}</span>
              <span data-num className="font-mono">{(9_400 - i * 1_150).toLocaleString('en')}</span>
            </span>
          ))}
          <span className="mt-auto text-base text-ink-3">(today's league, as it is; shown for the grounds' place)</span>
        </div>
        <aside className="flex min-w-0 flex-1 flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-month-end-colony">
          <span className="label-caps">The colony grounds</span>
          <Scene objects={objects} rich={richness(objects, n)} look={look} words fresh={fresh} className="min-h-0 flex-1" />
          <TvLegend objects={objects} />
          {news ? (
            <p className="font-display text-2xl font-semibold text-holo" data-testid="grounds-news">
              New this month: the {NAME[news.id]} stands. Prestige +{n.prestigeUp}.
            </p>
          ) : (
            <p className="text-xl text-ink-2" data-testid="grounds-news">
              The grounds are bare: the Governor commissions the colony's first building from the Colony desk.
            </p>
          )}
          <ColonyLine n={n} objects={objects} size="tv" />
        </aside>
      </div>
    </section>
  );
}

/**
 * Phone (667×375, sideways): the Colony desk. The stage switches Planet · Colony grounds; the rail lists each
 * building's words (the scene is too small for them). The Governor commissions; the building goes up at the next place.
 */
export function PhoneColony({ month, initial, n, look, governor }: { month: Month; initial: GroundsObject[]; n: ColonyNumbers; look: Look; governor: boolean }) {
  const [objects, setObjects] = useState(initial);
  const [view, setView] = useState<'planet' | 'grounds'>('grounds');
  const [placed, setPlaced] = useState<GroundsObject | null>(null);
  const map = useMemo(() => tiles(month), [month]);
  const catalogue = (Object.keys(PRESTIGE) as PrestigeId[]).filter((id) => !objects.some((o) => o.id === id));
  const commission = (id: PrestigeId) => {
    const o: GroundsObject = { id, stage: 'commissioned', slot: objects.length, funded: { credits: 0, goods: {} } };
    setObjects([...objects, o]);
    setPlaced(o);
    setView('grounds');
  };
  return (
    <section className="flex h-[375px] w-[667px] overflow-hidden rounded-panel border border-holo-line bg-void" data-testid="phone-colony">
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2" data-testid="phone-stage">
        <div className="flex gap-1 self-start rounded-chip border border-holo-line bg-panel p-0.5" role="tablist" aria-label="What the stage shows" data-testid="stage-switch">
          {(['planet', 'grounds'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cx('min-h-8 rounded-chip px-3 font-display text-xs font-semibold', view === v ? 'bg-holo text-on-holo' : 'text-ink-2')} data-testid={`switch-${v}`}>
              {v === 'planet' ? 'Planet' : 'Colony grounds'}
            </button>
          ))}
        </div>
        {view === 'planet' ? (
          <div className="min-h-0 flex-1" data-testid="phone-map">
            <HoloMap width={WIDTH} height={HEIGHT} tiles={map} density="phone" />
          </div>
        ) : (
          <>
            <Scene objects={objects} rich={richness(objects, n)} look={look} words={false} fresh={placed?.slot ?? null} className="min-h-0 flex-1" />
            <ColonyLine n={n} objects={objects} size="phone" />
          </>
        )}
      </div>
      <aside className="flex w-[250px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-holo-line bg-panel p-2" data-testid="colony-desk">
        <span className="label-caps text-[10px]!">Colony desk</span>
        {placed && (
          <p className="rounded-panel border border-holo bg-holo-soft p-2 text-xs leading-snug" data-testid="placed">
            <strong className="font-semibold">{NAME[placed.id]}</strong> commissioned: its site is marked at the next place on the grounds ({placed.slot + 1}). It starts building once the fund and the players' gifts pay for it.
          </p>
        )}
        <GroundsList objects={objects} />
        {governor ? (
          (
            <div className="flex flex-col gap-1" data-testid="catalogue">
              <span className="label-caps text-[10px]!">Commission · you are Governor</span>
              {catalogue.length === 0 && <span className="text-xs leading-snug text-ink-2" data-testid="all-commissioned">All five are commissioned.</span>}
              {catalogue.map((id) => (
                <span key={id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{NAME[id]}</span> <span className="text-ink-2">{PRESTIGE[id].credits} cr</span>
                  </span>
                  <Button
                    variant="outline"
                    size="md"
                    className="h-8! px-2! text-xs!"
                    onClick={() => commission(id)}
                    disabled={objects.length >= SLOTS}
                    data-testid={`commission-${id}`}
                  >
                    Commission
                  </Button>
                </span>
              ))}
            </div>
          )
        ) : (
          <p className="text-xs leading-snug text-ink-2" data-testid="not-governor">
            Kai, the Governor, commissions the colony's buildings; each goes up at the next place. You can give credits and goods to any that is waiting.
          </p>
        )}
      </aside>
    </section>
  );
}
