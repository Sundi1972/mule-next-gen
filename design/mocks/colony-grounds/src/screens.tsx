import { PRESTIGE, type PrestigeId } from '@mule/engine';
import { Button, cx, HoloMap, PlayerMark } from '@mule/ui';
import { useMemo, useState } from 'react';
import { FUND, HEIGHT, NAME, PLAYERS, SLOTS, tiles, WIDTH, type GroundsObject, type Month } from './fixture';
import { Grounds, GroundsList } from './Grounds';

export type Variant = 'A' | 'B';

/** The TV's header, as every TV screen has it (WS4's TvHeader): month and title left. */
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

/**
 * The TV in planning. A: the colony panel beside the map is the grounds, the planet map unchanged beside it.
 * B: the grounds ride the planet map's corner as a small inset, so the TV shows one picture.
 */
export function TvPlanning({ month, objects, variant }: { month: Month; objects: GroundsObject[]; variant: Variant }) {
  const map = useMemo(() => tiles(month), [month]);
  return (
    <section className="flex aspect-video w-full flex-col gap-4 rounded-panel border border-holo-line bg-void p-6" data-testid={`tv-planning-${variant}`}>
      <TvHead month={month} title="Planning" />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="relative min-w-0 flex-1" data-testid="tv-map">
          <HoloMap width={WIDTH} height={HEIGHT} tiles={map} density="tv" hideGround />
          {variant === 'B' && (
            <div className="absolute bottom-3 right-3 flex w-1/4 flex-col gap-1 rounded-panel border border-holo bg-panel/95 p-2 shadow-glow" data-testid="tv-grounds-inset">
              <span className="label-caps text-xs!">Colony grounds · {SLOTS - objects.length} free</span>
              <Grounds objects={objects} density="inset" fund={FUND[month]} />
            </div>
          )}
        </div>
        {variant === 'A' ? (
          <aside className="flex w-[34%] shrink-0 flex-col gap-3 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-colony-panel">
            <Grounds objects={objects} density="tv" fund={FUND[month]} />
          </aside>
        ) : (
          <aside className="flex w-[26%] shrink-0 flex-col gap-3 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-colony-panel">
            <span className="label-caps">The colony</span>
            <TvObjectList objects={objects} />
          </aside>
        )}
      </div>
    </section>
  );
}

/** Variant B's panel: the inset is too small for words, so the panel lists them. */
function TvObjectList({ objects }: { objects: GroundsObject[] }) {
  if (objects.length === 0) return <p className="text-xl leading-snug text-ink-2" data-testid="tv-no-objects">Nothing built yet. The Governor commissions the colony's buildings.</p>;
  return (
    <ul className="flex flex-col gap-2 text-xl" data-testid="tv-object-list">
      {[...objects]
        .sort((a, b) => a.slot - b.slot)
        .map((o) => (
          <li key={o.id} className="flex items-baseline gap-2">
            <span data-num className="font-mono text-ink-3">{o.slot}</span>
            <span className="font-semibold">{NAME[o.id]}</span>
          </li>
        ))}
    </ul>
  );
}

/** The TV at the month end: the league as today, and the colony's column with the grounds, this month's change ringed. */
export function TvMonthEnd({ month, objects, fresh }: { month: Month; objects: GroundsObject[]; fresh: number | null }) {
  return (
    <section className="flex aspect-video w-full flex-col gap-4 rounded-panel border border-holo-line bg-void p-6" data-testid="tv-month-end">
      <TvHead month={month} title="End of the month" />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-league">
          <span className="label-caps">League table · by Worth</span>
          {PLAYERS.map((p, i) => (
            <span key={p.id} className="flex items-center gap-3 text-2xl">
              <span data-num className="w-8 font-mono text-ink-3">{i + 1}</span>
              <PlayerMark slot={p.slot} size={30} />
              <span className="flex-1 font-display font-semibold">{p.name}</span>
              <span data-num className="font-mono">{(9_400 - i * 1_150).toLocaleString('en')}</span>
            </span>
          ))}
          <span className="mt-auto text-lg text-ink-2">(today's league, unchanged; shown for the grounds' place on the screen)</span>
        </div>
        <aside className="flex w-[34%] shrink-0 flex-col gap-3 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-month-end-colony">
          <Grounds objects={objects} density="tv" fund={FUND[month]} fresh={fresh} />
          {fresh !== null && (
            <p className="text-lg leading-snug text-holo" data-testid="grounds-news">
              New this month: the Stadium stands on slot {fresh}.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

/**
 * The phone (667×375, the sideways phone the game is played on): the stage left, the rail right with the Colony desk.
 * A: a "Planet · Grounds" switch over the stage; the Colony desk opens the grounds on the stage.
 * B: the grounds sit in the planet map's corner; a tap on them opens them on the stage.
 */
export function PhonePlanning({ month, initial, variant, governor }: { month: Month; initial: GroundsObject[]; variant: Variant; governor: boolean }) {
  const [objects, setObjects] = useState(initial);
  const [view, setView] = useState<'planet' | 'grounds'>(variant === 'A' ? 'grounds' : 'planet');
  const [placing, setPlacing] = useState<PrestigeId | null>(null);
  const [placed, setPlaced] = useState<GroundsObject | null>(null);
  const map = useMemo(() => tiles(month), [month]);
  const catalogue = (Object.keys(PRESTIGE) as PrestigeId[]).filter((id) => !objects.some((o) => o.id === id));
  const startPlacing = (id: PrestigeId) => {
    setPlacing(id);
    setPlaced(null);
    setView('grounds');
  };
  const place = (slot: number) => {
    if (!placing) return;
    const o: GroundsObject = { id: placing, stage: 'commissioned', slot, funded: { credits: 0, goods: {} } };
    setObjects([...objects, o]);
    setPlaced(o);
    setPlacing(null);
  };
  return (
    <section className="flex h-[375px] w-[667px] overflow-hidden rounded-panel border border-holo-line bg-void" data-testid={`phone-${variant}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2" data-testid="phone-stage">
        {variant === 'A' && (
          <div className="flex gap-1 self-start rounded-chip border border-holo-line bg-panel p-0.5" role="tablist" aria-label="What the stage shows" data-testid="stage-switch">
            {(['planet', 'grounds'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cx('min-h-8 rounded-chip px-3 font-display text-xs font-semibold', view === v ? 'bg-holo text-on-holo' : 'text-ink-2')} data-testid={`switch-${v}`}>
                {v === 'planet' ? 'Planet' : 'Colony grounds'}
              </button>
            ))}
          </div>
        )}
        {view === 'planet' ? (
          <div className="relative min-h-0 flex-1" data-testid="phone-map">
            <HoloMap width={WIDTH} height={HEIGHT} tiles={map} density="phone" />
            {variant === 'B' && (
              <button type="button" onClick={() => setView('grounds')} className="absolute bottom-1 right-1 w-[22%] rounded-control border border-holo bg-panel/95 p-0.5 shadow-glow" aria-label={`Colony grounds, ${SLOTS - objects.length} slots free: open`} data-testid="phone-grounds-inset">
                <Grounds objects={objects} density="inset" fund={FUND[month]} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-start justify-center gap-2" data-testid="phone-grounds-stage">
            <Grounds objects={objects} density="phone" fund={FUND[month]} placing={placing ? NAME[placing] : null} onPlace={place} />
            {variant === 'B' && (
              <Button variant="outline" size="md" onClick={() => setView('planet')} data-testid="back-to-planet">
                ← Planet
              </Button>
            )}
          </div>
        )}
      </div>
      <aside className="flex w-[250px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-holo-line bg-panel p-2" data-testid="colony-desk">
        <span className="label-caps text-[10px]!">Colony desk</span>
        {placing ? (
          <div className="flex flex-col gap-1.5 rounded-panel border-2 border-holo bg-holo-soft p-2" data-testid="placing">
            <span className="font-display text-sm font-semibold">Pick a slot for the {NAME[placing]}</span>
            <span className="text-xs leading-snug text-ink-2">Tap a free slot on the grounds. Where it stands changes nothing yet.</span>
            <Button variant="ghost" size="md" onClick={() => setPlacing(null)} data-testid="cancel-placing">
              Cancel
            </Button>
          </div>
        ) : (
          placed && (
            <p className="rounded-panel border border-holo bg-holo-soft p-2 text-xs leading-snug" data-testid="placed">
              <strong className="font-semibold">{NAME[placed.id]}</strong> commissioned on slot {placed.slot}. It starts building once the fund and the players' gifts pay for it.
            </p>
          )
        )}
        <GroundsList objects={objects} />
        {governor ? (
          !placing && (
            <div className="flex flex-col gap-1" data-testid="catalogue">
              <span className="label-caps text-[10px]!">Commission · you are Governor</span>
              {catalogue.length === 0 && <span className="text-xs leading-snug text-ink-2" data-testid="all-commissioned">All five are commissioned.</span>}
              {catalogue.map((id) => (
                <span key={id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{NAME[id]}</span> <span className="text-ink-2">{PRESTIGE[id].credits} cr</span>
                  </span>
                  <Button variant="outline" size="md" className="h-8! px-2!" onClick={() => startPlacing(id)} disabled={objects.length >= SLOTS} data-testid={`commission-${id}`}>
                    Commission
                  </Button>
                </span>
              ))}
            </div>
          )
        ) : (
          <p className="text-xs leading-snug text-ink-2" data-testid="not-governor">
            Kai, the Governor, commissions the colony's buildings and picks each one's slot. You can give credits and goods to any that is waiting.
          </p>
        )}
      </aside>
    </section>
  );
}
