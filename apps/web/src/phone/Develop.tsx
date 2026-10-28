import { DEV_WALK, DEVELOPMENT, UPKEEP, type Good } from '@mule/engine';
import type { TileView } from '@mule/protocol';
import { AirGauge, Button, cx, GOOD_NAME, GoodIcon, hungerLevel, HoloMap, MuleIcon, paceLine, PlayerMark, SharedClock, sickReason, StoreInterior, TERRAIN_NAME, YourPace, ZoomMap, type Condition, type FoodEaten, type PaceRule, type Shop } from '@mule/ui';
import { useEffect, useState } from 'react';
import { mapTiles, PHASE_NAME, plotName, slotOf, TERRAIN_ODDS, tileAt } from '../game/derive';
import { SpecialLine } from '../components/SpecialLine';
import { useClient, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { GroundCard, Traits } from './ground';
import { nearest, nextStep, openShops } from './next-step';
import { MapFit, PhoneShell, useWide } from './Shell';

const OUTFIT_NAME = (o: TileView['outfit']) => (o === null ? '' : o === 'greenBelt' ? 'Green belt' : GOOD_NAME[o]);

/** How long the start-of-turn card stays on the store floor, and how long its gauge takes to fill. */
const FILL_CARD_SECONDS = 2.2;

/** Fed and well: what the screen shows should the view carry no condition. */
const WELL: Condition = { foodShare: 1, sick: false, sickBecause: null, conditionPace: 1 };

/**
 * Development: one clock runs for everyone; hunger and sickness slow your walk. Buy a MULE in the store, outfit it,
 * walk out and install it on one of your plots. Analyse ground, fit filters, or cash out at the pub.
 */
export function Develop() {
  const client = useClient();
  const { view, me, self, slot } = usePhoneGame();
  const now = useServerNow(200);
  const seconds = me.devEndsAt === null ? 0 : Math.max(0, (me.devEndsAt - now) / 1000);
  const carry = me.carriedMule;
  const [place, setPlace] = useState<'store' | 'map'>('store');
  const [cardDismissed, setCardDismissed] = useState(false);
  // Develop mounts as development starts; the card runs on wall time, whatever the server's phase scale.
  const [devStartedAt] = useState(now);
  // The thought bubble shows as the card ends, once a turn: the hall remounts on every trip back into the store.
  const [clockStartsAt] = useState(() => performance.now() + FILL_CARD_SECONDS * 1000);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  // Kept here, not in the map, so the zoom survives a trip into the store.
  const [zoomed, setZoomed] = useState(false);
  const tile = selected ? tileAt(view, selected.x, selected.y) : undefined;
  const outfitted = carry !== null && carry !== 'empty';
  // RULE-7's "installed this turn": an outfitted MULE in tow becomes none only by installing it. Worked out while
  // rendering, so the frame that loses the MULE already shows row 7, never row 2.
  const [installed, setInstalled] = useState(false);
  const [carried, setCarried] = useState(carry);
  if (carried !== carry) {
    setCarried(carry);
    if (carried !== null && carried !== 'empty' && carry === null) setInstalled(true);
  }

  if (self.doneDeveloping || seconds <= 0) return <Done pub={self.doneDeveloping} />;

  const filling = (now - devStartedAt) / 1000 < FILL_CARD_SECONDS && !cardDismissed;
  const condition = self.condition ?? WELL;
  const food: FoodEaten = { ate: Math.min(me.stock.food, me.needs.food), need: me.needs.food };
  const freePlots = view.tiles.filter((t) => t.owner === me.id && !t.outfit);
  const storeTile = view.tiles.find((t) => t.terrain === 'store') ?? { x: Math.floor(view.width / 2), y: Math.floor(view.height / 2) };
  // You walk out through a door yourself (RULE-7 row 4); with an outfitted MULE, a plot of yours is picked for you.
  const walkOut = () => {
    setCardDismissed(true);
    setPlace('map');
    if (!outfitted) return;
    setSelected((s) => {
      if (s && tileAt(view, s.x, s.y)?.owner === me.id) return s;
      const pick = nearest(freePlots, storeTile) ?? view.tiles.find((t) => t.owner === me.id);
      return pick ? { x: pick.x, y: pick.y } : s;
    });
  };
  const onShop = (shop: Shop) => {
    setCardDismissed(true);
    if (shop === 'pub') client.intent({ type: 'pub' });
    else if (shop === 'corral') client.intent({ type: 'buyMule' });
    else client.intent({ type: 'outfit', outfit: shop });
  };
  // The pub's own sum, from the time left now: see visitPub in the engine.
  const pubPayout = Math.round(DEVELOPMENT.pub.base + (DEVELOPMENT.pub.start + view.month * DEVELOPMENT.pub.perMonth) * Math.min(1, seconds / Math.max(me.devSeconds, 1)));
  const mine = tile?.owner === me.id;
  const free = tile && tile.owner === null && tile.terrain !== 'store';
  const owner = tile?.owner ? view.players.find((p) => p.id === tile.owner) : undefined;

  const guide = nextStep({
    filling,
    carry,
    place,
    atOwnPlot: place === 'map' && mine,
    installed,
    seconds,
    freePlots,
    from: storeTile,
    month: { needs: me.monthNeeds, have: me.stock },
    pace: paceLine(condition, DEV_WALK, food).title,
    devSeconds: me.devSeconds,
    mulePrice: me.mulePrice,
    mulesLeft: view.storeMules,
    pubPayout,
  });

  const tiles = mapTiles(view);
  // The payout shows where the button has the row to itself: in the store. On the map it shares the row with Store.
  const pub = (payout: boolean) => (
    <Button size="md" variant="ghost" className="flex-1 whitespace-nowrap px-2 @min-[1100px]/shell:h-12" aria-label="Go to the pub and end your turn" onClick={() => client.intent({ type: 'pub' })}>
      {payout ? `Pub · end turn · ≈${pubPayout} cr` : 'Pub · end turn'}
    </Button>
  );

  return (
    <PhoneShell
      phase={PHASE_NAME.development}
      seconds={seconds}
      now={guide.now}
      fill
      rail={
        <>
          {/* The time first, then what your condition does to it: on a small phone both on the clock, above the fold. */}
          {place === 'store' && (
            <>
              <SharedClock seconds={seconds} total={Math.max(me.devSeconds, 1)} pace={paceLine(condition, DEV_WALK, food)} />
              <div className="hidden @min-[1100px]/shell:block">
                <YourPace condition={condition} rule={DEV_WALK} food={food} />
              </div>
            </>
          )}
          <div className="flex items-center gap-2.5 @min-[1100px]/shell:text-lg" data-testid="mule">
            <span className={cx('flex items-center', carry === null ? 'text-ink-3' : 'text-ink')}>
              <MuleIcon size={22} />
              {outfitted && carry !== 'greenBelt' && <GoodIcon good={carry} size={14} />}
            </span>
            <span className="flex-1 font-display text-sm font-semibold leading-tight @min-[1100px]/shell:text-lg">
              {carry === null ? (installed ? 'No MULE in tow' : 'No MULE yet') : carry === 'empty' ? 'Empty MULE in tow' : `${OUTFIT_NAME(carry)} MULE in tow`}
            </span>
          </div>
          {place === 'store' && <YourPlots tiles={view.tiles} me={me.id} />}
          {place === 'map' && !tile && <p className="text-sm text-ink-2">Tap a plot to look at it. Tap the store to go back in.</p>}
          {place === 'map' && tile && (
            <section className="flex flex-col gap-2 border-t border-holo-faint pt-2.5">
              <header className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold leading-tight" data-testid="plot-title">
                  {TERRAIN_NAME[tile.terrain]} <span className="font-mono text-sm font-normal text-ink-3">{plotName(tile.x, tile.y)}</span>
                </h2>
                <span className="font-mono text-xs text-holo">{mine ? 'YOURS' : free ? 'FREE' : 'OWNED'}</span>
              </header>
              <SpecialLine special={tile.special} />
              <span className="flex flex-wrap items-center gap-x-2 empty:hidden">
                {owner && !mine && (
                  <span className="flex items-center gap-1.5 text-sm font-normal text-ink-2">
                    <PlayerMark slot={slotOf(view, owner.id) ?? 0} size={12} glow={false} />
                    {owner.name}
                  </span>
                )}
              </span>
              {tile.outfit && (
                <span className="text-sm text-ink-2">
                  {mine ? 'Your' : 'A'} MULE here makes <strong className="text-ink">{OUTFIT_NAME(tile.outfit)}</strong>.{tile.filter && ' It has a filter.'}
                </span>
              )}
              {!!tile.pollution && (
                <span className="rounded-control bg-[rgb(120_96_60/0.14)] px-2.5 py-1.5 text-xs text-ink">
                  <strong>{['', 'Dusty', 'Polluted', 'Toxic'][tile.pollution]} land.</strong> Food, Water and Medicine here make {tile.pollution} less.
                </span>
              )}
              {tile.ground ? (
                <GroundCard ground={tile.ground} />
              ) : (
                <span className="text-sm text-ink-2" data-testid="terrain-hint">
                  {TERRAIN_ODDS[tile.terrain]}
                </span>
              )}
              <Traits traits={tile.traits} />
              {mine && (
                <Button size="md" variant="outline" className="px-2 text-xs" disabled={tile.filter || me.stock.alloy < DEVELOPMENT.filterAlloy} onClick={() => client.intent({ type: 'filter', x: tile.x, y: tile.y })}>
                  {tile.filter ? 'Filter fitted' : `Fit a filter · ${DEVELOPMENT.filterAlloy} Alloy (have ${me.stock.alloy})`}
                </Button>
              )}
              {!mine && <span className="text-xs text-ink-3">You can analyse any plot. You can only install on your own.</span>}
            </section>
          )}
          {place === 'store' && <AirGauge level={view.air.level} band={view.air.band} className="mt-auto" />}
        </>
      }
      footer={
        place === 'store' ? (
          <>
            <Button size="md" variant={outfitted ? 'holo' : 'outline'} className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={walkOut}>
              Walk out to the map
            </Button>
            <div className="flex">{pub(true)}</div>
          </>
        ) : (
          <>
            {tile && (
              <div className="grid grid-cols-2 gap-2">
                <Button size="md" className="whitespace-nowrap px-2" disabled={!outfitted || !mine} onClick={() => client.intent({ type: 'install', x: tile.x, y: tile.y })}>
                  {outfitted && mine && tile.outfit ? 'Replace MULE' : 'Install here'}
                </Button>
                <Button
                  size="md"
                  variant="outline"
                  className="whitespace-nowrap px-2"
                  aria-label={tile.ground ? 'Analysed' : `Geo analysis, ${DEVELOPMENT.analysisSeconds} seconds`}
                  disabled={!!tile.ground}
                  onClick={() => client.intent({ type: 'analyse', x: tile.x, y: tile.y })}
                >
                  {tile.ground ? 'Analysed' : `Analyse · ${DEVELOPMENT.analysisSeconds} s`}
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="md" variant="outline" className="flex-1 whitespace-nowrap px-2" onClick={() => setPlace('store')}>
                Store
              </Button>
              {pub(false)}
            </div>
          </>
        )
      }
    >
      {/* One place at a time, at every size (AM-8): in the store the hall fills the stage; out of the door, the colony. */}
      <div className="flex min-h-0 flex-1 flex-col" data-testid="dev-stage">
        {place === 'store' ? (
          <div className="min-h-[300px] flex-1">
            <WideHall
              mules={view.storeMules}
              mulePrice={me.mulePrice}
              prices={me.outfitCosts}
              pubPayout={pubPayout}
              open={openShops(guide.locks)}
              onShop={onShop}
              onDoor={walkOut}
              next={guide.next}
              locks={guide.locks}
              me={{ id: me.id, slot, leading: carry, condition, food, clockStartsAt }}
              paceRule={DEV_WALK}
              overlay={filling && <FillCard condition={condition} rule={DEV_WALK} food={food} />}
            />
          </div>
        ) : (
          <MapFit width={view.width} height={view.height}>
            <ZoomMap width={view.width} height={view.height} tiles={tiles} slot={slot} zoomed={zoomed} onZoomedChange={setZoomed}>
              <div className="relative" data-testid="dev-map">
                <HoloMap
                  width={view.width}
                  height={view.height}
                  tiles={tiles}
                  focusSlot={slot}
                  selected={selected}
                  onTile={(t) => (t.terrain === 'store' ? setPlace('store') : setSelected({ x: t.x, y: t.y }))}
                />
                {guide.plot && (
                  <span
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-[170%] rounded-full bg-holo px-1.5 font-mono text-[10px] font-bold leading-4 text-on-holo shadow-glow"
                    style={{ left: `${((guide.plot.x + 0.5) / view.width) * 100}%`, top: `${((guide.plot.y + 0.5) / view.height) * 100}%` }}
                    data-testid="plot-tap-here"
                  >
                    TAP
                  </span>
                )}
              </div>
            </ZoomMap>
          </MapFit>
        )}
      </div>
    </PhoneShell>
  );
}

/** The hall at the shell's size: the laptop's type and creatures when wide, the phone's otherwise. */
function WideHall(props: Omit<Parameters<typeof StoreInterior>[0], 'wide' | 'tv'>) {
  return <StoreInterior {...props} wide={useWide()} />;
}

/** Your plots and what they make: why the guide suggests a good. Wide screens only. */
function YourPlots({ tiles, me }: { tiles: TileView[]; me: string }) {
  const mine = tiles.filter((t) => t.owner === me);
  const by = new Map<TileView['outfit'], number>();
  for (const t of mine) by.set(t.outfit, (by.get(t.outfit) ?? 0) + 1);
  const burn = UPKEEP.energyUse;
  return (
    <section className="hidden flex-col gap-2 border-t border-holo-faint pt-4 @min-[1100px]/shell:flex" data-testid="your-plots">
      <span className="label-caps text-xs!">Your {mine.length} plots</span>
      <ul className="flex flex-col gap-1.5 text-base">
        {[...by].map(([outfit, n]) => (
          <li key={outfit ?? 'none'} className="flex items-center gap-2">
            {outfit === null || outfit === 'greenBelt' ? <span className={cx('h-4 w-4 rounded-[4px] border border-dashed', outfit ? 'border-ok' : 'border-holo')} /> : <GoodIcon good={outfit as Good} size={16} />}
            <span className="flex-1">{outfit === null ? 'No MULE yet' : OUTFIT_NAME(outfit)}</span>
            <span data-num className="font-mono font-bold">
              {n}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-sm text-ink-2">
        Each month a farm or a well burns {burn.food} Energy, a mine {burn.smithore}, an Energy plot {burn.energy === 0 ? 'none' : burn.energy}.
      </span>
    </section>
  );
}

/**
 * The start of the turn (it blocks nothing; a tap on a room dismisses it). Everyone gets the same clock, so it says
 * what you ate and the pace that leaves you, the gauge filling to it: short of Food reads as "slower", never "less time".
 */
export function FillCard({ condition, rule, food }: { condition: Condition; rule: PaceRule; food: FoodEaten }) {
  const hungry = hungerLevel(condition, rule) > 0;
  const short = hungry || condition.sick;
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    // One frame at zero first, so the gauge visibly fills.
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    // Taps go through to the rooms underneath: the clock is already running.
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-void/55 animate-[show-card-in_0.3s_ease-out]" data-testid="fill-card">
      <div className={cx('flex w-[64%] max-w-[560px] flex-col gap-1.5 rounded-panel border-2 bg-panel p-3 shadow-glow @min-[1100px]/shell:gap-3 @min-[1100px]/shell:p-6', short ? 'border-warn' : 'border-holo')}>
        <span className="label-caps">One clock for everyone · {DEVELOPMENT.fullSeconds} s</span>
        <span className="font-display text-lg font-semibold leading-tight @min-[1100px]/shell:text-3xl">
          {hungry ? `You eat ${food.ate} of the ${food.need} Food you need.` : `You eat the ${food.need} Food you need.`}
        </span>
        {/* Sickness is rolled as development starts and slows this same turn: the card announces it. */}
        {condition.sick && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-g-medicine" data-testid="sick-strikes">
            ✚ {sickReason(condition.sickBecause)} It strikes now and slows you this turn.
          </span>
        )}
        <div className="relative h-3 overflow-hidden rounded-full bg-raised @min-[1100px]/shell:h-4" data-testid="pace-gauge">
          <div
            className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-[2000ms] ease-linear', short ? 'bg-warn' : 'bg-holo')}
            style={{ width: `${grown ? condition.conditionPace * 100 : 0}%` }}
          />
          {short && <div className="absolute inset-y-0 right-0 border-l-2 border-dashed border-ink-3" />}
        </div>
        <span data-num className={cx('font-mono text-sm font-bold @min-[1100px]/shell:text-lg', short ? 'text-warn' : 'text-holo')}>
          {paceLine(condition, rule, food).title}
        </span>
      </div>
    </div>
  );
}

/** Your turn is over: at the pub, or out of time. The others keep building. */
function Done({ pub }: { pub: boolean }) {
  const { view, self } = usePhoneGame();
  const won = view.news.find((n) => n.startsWith(`${self.name} went to the pub`));
  const payout = won?.match(/won (\d+)/)?.[1];
  const still = view.players.filter((p) => !p.doneDeveloping);
  return (
    <PhoneShell
      phase={PHASE_NAME.development}
      rail={
        <>
          <span className="label-caps">{still.length > 0 ? 'Still building' : 'Everyone is done'}</span>
          <ul className="flex flex-col gap-1.5">
            {still.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <PlayerMark slot={slotOf(view, p.id) ?? 0} size={12} glow={false} />
                {p.name}
              </li>
            ))}
          </ul>
        </>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="label-caps">{pub ? 'The pub' : 'Time is up'}</span>
        {pub && payout ? (
          <span data-num className="font-mono text-5xl font-bold text-ok">
            +{payout} cr
          </span>
        ) : (
          <span className="font-display text-4xl font-semibold">{pub ? 'Cheers!' : 'Out of time'}</span>
        )}
        <p className="max-w-sm text-ink-2">
          {pub ? 'You cashed out at the pub. Your turn is over;' : 'Your development time ran out;'} the others keep building until their time runs out.
        </p>
      </div>
    </PhoneShell>
  );
}
