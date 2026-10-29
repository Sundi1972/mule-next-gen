import { DEV_STEER, DEV_WALK, DEVELOPMENT, UPKEEP, type Good, type Outfit } from '@mule/engine';
import type { PlayerView, TileView } from '@mule/protocol';
import { AirGauge, Button, cx, GOOD_NAME, GoodIcon, hungerLevel, HoloMap, MuleIcon, paceLine, PlayerMark, SharedClock, sickReason, StoreInterior, TERRAIN_NAME, TimeBar, YourPace, ZoomMap, type Condition, type FoodEaten, type PaceRule, type Shop } from '@mule/ui';
import { useEffect, useState } from 'react';
import { mapTiles, PHASE_NAME, plotName, slotOf, TERRAIN_ODDS, tileAt } from '../game/derive';
import { speakerAt } from '../chat/Chat';
import { SpecialLine } from '../components/SpecialLine';
import { useClient, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { GroundCard, Traits } from './ground';
import { press, type Press } from './hub/ready';
import { nearest, nextStep, openShops } from './next-step';
import { MapFit, PhoneShell, useWide, type Now } from './Shell';

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
  const { table, view, me, self, slot } = usePhoneGame();
  const now = useServerNow(200);
  // Month 1's clock waits, full, for every first MULE: the turn is not over.
  const waiting = !!view.clockWaitsFor;
  const seconds = waiting ? me.devSeconds : me.devEndsAt === null ? 0 : Math.max(0, (me.devEndsAt - now) / 1000);
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
  const [confirmStart, setConfirmStart] = useState(false);
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

  const ruled = nextStep({
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
  const installedAny = installed || me.installedThisTurn;
  // Month 1 with the clock running and no first MULE of yours in on a plot of yours: the host started it without you.
  const passed = view.month === 1 && DEV_STEER.month1WaitsForFirstMule && !waiting && me.devEndsAt !== null && !installedAny && view.tiles.some((t) => t.owner === me.id);
  // Once in, you wait: a seat already in may only end its turn until the clock starts.
  const youWait = waiting && !view.clockWaitsFor!.includes(me.id);
  const guide = waiting
    ? {
        ...ruled,
        ...(youWait ? { next: [], locks: { ...ruled.locks, corral: '' } } : {}),
        now: waitingNow(ruled.now, carry, installedAny || youWait, !view.tiles.some((t) => t.owner === me.id), view.storeMules, view.clockWaitsFor!, me.id, view.players),
      }
    : passed
      ? { ...ruled, now: { ...ruled.now, detail: 'The host started the clock: your month is running.' } }
      : ruled;
  // The host, once its own first MULE is in, may start the waiting clock without the rest.
  const passing =
    waiting && self.id === table.hostId && !view.clockWaitsFor!.includes(me.id) ? view.players.filter((p) => view.clockWaitsFor!.includes(p.id)).map((p) => p.name) : [];

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
      seconds={waiting ? undefined : seconds}
      status={waiting ? <ClockWaitsChip seconds={me.devSeconds} /> : undefined}
      now={guide.now}
      fill
      rail={
        <>
          {/* The clock right after Now, your pace on its label under 1100 px; the header's timer is the one always in view. */}
          {place === 'store' && (
            <>
              {waiting ? (
                <ClockWaits seconds={me.devSeconds} mineIn={!view.clockWaitsFor!.includes(me.id)} />
              ) : (
                <SharedClock seconds={seconds} total={Math.max(me.devSeconds, 1)} pace={paceLine(condition, DEV_WALK, food)} />
              )}
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
                <Button
                  size="md"
                  variant="outline"
                  className="px-2 text-xs"
                  disabled={youWait || tile.filter || me.stock.alloy < DEVELOPMENT.filterAlloy}
                  onClick={() => client.intent({ type: 'filter', x: tile.x, y: tile.y })}
                  {...(youWait ? WAIT_HINT : {})}
                >
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
        <>
          {passing.length > 0 && <StartTheClock passing={passing} confirm={confirmStart} setConfirm={setConfirmStart} />}
          {place === 'store' ? (
          <>
            <Button size="md" variant={outfitted ? 'holo' : 'outline'} className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={walkOut}>
              Walk out to the map
            </Button>
            <div className="flex">{pub(true)}</div>
          </>
        ) : (
          <>
            {/* Once in, you wait: no plot row until the clock starts (both would be dim), so the guide keeps its room. */}
            {tile && !youWait && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="md"
                  className="whitespace-nowrap px-2"
                  disabled={!outfitted || !mine}
                  onClick={() => client.intent({ type: 'install', x: tile.x, y: tile.y })}
                >
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
          )}
        </>
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
              wrapCreature={speakerAt}
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

/** The Now card while month 1's clock waits: no rush before your first MULE; once it is in, whose are still to come. */
function waitingNow(now: Now, carry: Outfit | 'empty' | null, installed: boolean, plotless: boolean, mulesLeft: number, waitsFor: readonly string[], me: string, players: readonly PlayerView[]): Now {
  if (carry !== null) return now;
  // Row 1 or 2 with MULEs left: the start card's "the clock starts for everyone" isn't so while it waits.
  if (!installed) return now.step === 1 && mulesLeft > 0 ? { step: 1, of: 3, title: 'Buy a MULE at the corral', detail: 'Your first month: no rush. The clock starts when your first MULE is in.' } : now;
  const still = waitsFor.filter((id) => id !== me).map((id) => players.find((p) => p.id === id)?.name ?? id);
  if (plotless) return { title: `No plot this month · waiting for ${andList(still)}`, detail: <span id={WAIT_DETAIL_ID}>The clock starts when every first MULE is in.</span> };
  return { title: `Your MULE is in · waiting for ${andList(still)}`, detail: <span id={WAIT_DETAIL_ID}>{YOU_WAIT}</span> };
}

/** Once in, you wait: the guide's words, and the id the dimmed controls point at for them. */
const YOU_WAIT = 'Buying, installing and analysing wait for the clock.';
const WAIT_DETAIL_ID = 'first-month-wait';
/** Why a control a seat already in may not use is dimmed while month 1's clock waits. */
const WAIT_HINT = { title: "Waiting for the others' first MULEs", 'aria-describedby': WAIT_DETAIL_ID } as const;

/** The host's confirm, before the waiting clock starts without the players still to come. */
export function startClockQuestion(names: readonly string[]): string {
  const one = names.length === 1;
  return `Start the month's clock now? ${andList(names)} ${one ? 'has' : 'have'} no MULE in yet, and ${one ? 'loses' : 'lose'} no time until now.`;
}

const andList = (names: readonly string[]) => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The host's way past anyone still to come in month 1's wait: planning's Continue, one confirming tap. */
function StartTheClock({ passing, confirm, setConfirm }: { passing: readonly string[]; confirm: boolean; setConfirm: (open: boolean) => void }) {
  const client = useClient();
  const on = (pressed: Press) => () => {
    const next = press(confirm, pressed);
    setConfirm(next.confirm);
    if (next.intent) client.intent(next.intent);
  };
  if (!confirm)
    return (
      <Button size="md" variant="outline" className="w-full" onClick={on('continue')} data-testid="continue">
        Start the clock without {passing.length === 1 ? passing[0] : 'them'}
      </Button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-warn/60 bg-panel p-2.5 @min-[1100px]/shell:p-4" role="alertdialog" aria-label="Start the clock without them?" data-testid="continue-confirm">
      <p className="text-sm @min-[1100px]/shell:text-base">{startClockQuestion(passing)}</p>
      <div className="flex gap-2">
        {/* Two words a line at most: on a 667 phone the rail is too narrow for "Start the clock" on one. */}
        <Button size="md" className="flex-1 px-2 text-xs leading-tight @min-[1100px]/shell:text-base" onClick={on('continue-now')} data-testid="continue-now">
          Start the clock
        </Button>
        <Button size="md" variant="ghost" className="flex-1 px-2 text-xs leading-tight @min-[1100px]/shell:text-base" onClick={on('keep-waiting')} data-testid="keep-waiting">
          Keep waiting
        </Button>
      </div>
    </div>
  );
}

/** Where the header's timer goes while month 1's clock waits: paused at its full time. */
function ClockWaitsChip({ seconds }: { seconds: number }) {
  return (
    <span className="relative inline-flex h-8 items-center gap-1 rounded-chip border border-dashed border-holo-line px-2 font-mono text-xs font-bold text-holo @min-[1100px]/shell:h-11 @min-[1100px]/shell:px-4 @min-[1100px]/shell:text-lg" data-testid="clock-waits">
      <svg aria-hidden viewBox="0 0 24 24" width={12} height={12} fill="currentColor">
        <rect x={6} y={5} width={4} height={14} rx={1} />
        <rect x={14} y={5} width={4} height={14} rx={1} />
      </svg>
      0:{seconds}
    </span>
  );
}

/** Everyone's clock while it waits: the bar stands full and the label says what starts it. */
function ClockWaits({ seconds, mineIn }: { seconds: number; mineIn: boolean }) {
  return (
    <div className="flex items-center gap-2 @min-[1100px]/shell:gap-4" data-testid="shared-clock">
      <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-holo @min-[1100px]/shell:text-base" data-testid="clock-label">
        {mineIn ? 'The clock starts when every first MULE is in' : 'The clock starts when your first MULE is in'}
      </span>
      <TimeBar seconds={seconds} total={seconds} size="phone-clock" className="min-w-0 flex-1" />
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
