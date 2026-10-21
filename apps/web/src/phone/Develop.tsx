import { DEVELOPMENT } from '@mule/engine';
import type { TileView } from '@mule/protocol';
import { AirGauge, Button, cx, FACTORY_GOODS, FoodTime, GOOD_NAME, HoloMap, MuleIcon, OUTFIT_GOODS, PlayerMark, StoreInterior, TERRAIN_NAME, type Shop } from '@mule/ui';
import { useEffect, useState } from 'react';
import { mapTiles, PHASE_NAME, plotName, slotOf, TERRAIN_ODDS, tileAt } from '../game/derive';
import { useClient, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { GroundCard, Traits } from './ground';
import { MapFit, PhoneShell } from './Shell';

const OUTFIT_NAME = (o: TileView['outfit']) => (o === null ? '' : o === 'greenBelt' ? 'Green belt' : GOOD_NAME[o]);

/** How long the start-of-turn card stays on the store floor, and how long its bar takes to fill. */
const FILL_CARD_SECONDS = 2.2;
const FILL_RISE_SECONDS = 2;

/**
 * Development: your own clock runs. Buy a MULE in the store, outfit it, walk
 * out and install it on one of your plots. Analyse ground, fit filters, or
 * cash out at the pub.
 */
export function Develop() {
  const client = useClient();
  const { view, me, self, slot } = usePhoneGame();
  const now = useServerNow(200);
  const seconds = me.devEndsAt === null ? 0 : Math.max(0, (me.devEndsAt - now) / 1000);
  const carry = me.carriedMule;
  const [place, setPlace] = useState<'store' | 'map'>('store');
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const tile = selected ? tileAt(view, selected.x, selected.y) : undefined;
  const outfitted = carry !== null && carry !== 'empty';

  // Once the MULE is outfitted, walk out and point at a plot of yours that has no MULE yet.
  useEffect(() => {
    if (!outfitted) return;
    setPlace('map');
    setSelected((s) => {
      if (s && tileAt(view, s.x, s.y)?.owner === me.id) return s;
      const free = view.tiles.find((t) => t.owner === me.id && !t.outfit) ?? view.tiles.find((t) => t.owner === me.id);
      return free ? { x: free.x, y: free.y } : s;
    });
    // Only when the MULE changes, not on every view.
  }, [outfitted]);

  if (self.doneDeveloping || seconds <= 0) return <Done pub={self.doneDeveloping} />;

  const step = carry === null ? 1 : carry === 'empty' ? 2 : 3;
  const elapsed = Math.max(0, me.devSeconds - seconds);
  const filling = elapsed < FILL_CARD_SECONDS;
  const open: Shop[] = filling ? [] : carry === null ? ['corral', 'pub'] : carry === 'empty' ? [...OUTFIT_GOODS, ...FACTORY_GOODS, 'greenBelt', 'pub'] : ['pub'];
  const onShop = (shop: Shop) => {
    if (shop === 'pub') client.intent({ type: 'pub' });
    else if (shop === 'corral') client.intent({ type: 'buyMule' });
    else client.intent({ type: 'outfit', outfit: shop });
  };
  // The pub's own sum, from the time left now: see visitPub in the engine.
  const pubPayout = Math.round(DEVELOPMENT.pub.base + (DEVELOPMENT.pub.start + view.month * DEVELOPMENT.pub.perMonth) * Math.min(1, seconds / Math.max(me.devSeconds, 1)));
  const mine = tile?.owner === me.id;
  const free = tile && tile.owner === null && tile.terrain !== 'store';
  const owner = tile?.owner ? view.players.find((p) => p.id === tile.owner) : undefined;

  const pub = (
    <Button size="md" variant="ghost" className="flex-1 whitespace-nowrap px-2" aria-label="Go to the pub and end your turn" onClick={() => client.intent({ type: 'pub' })}>
      Pub · end turn
    </Button>
  );

  return (
    <PhoneShell
      phase={PHASE_NAME.development}
      seconds={seconds}
      fill={place === 'map'}
      rail={
        <>
          <div className="flex items-center gap-2.5" data-testid="mule">
            <span className={cx(carry === null ? 'text-ink-3' : 'text-ink')}>
              <MuleIcon size={20} />
            </span>
            <span className="flex-1 font-display text-sm font-semibold leading-tight">
              {carry === null ? 'No MULE' : carry === 'empty' ? 'Empty MULE in tow' : `${OUTFIT_NAME(carry)} MULE in tow`}
            </span>
          </div>
          {place === 'store' && (
            <>
              <ol className="grid grid-cols-3 gap-1 text-[11px]">
                {['Buy', 'Outfit', 'Install'].map((label, i) => (
                  <li
                    key={label}
                    className={cx(
                      'flex items-center gap-1 rounded-control border px-1.5 py-1',
                      i + 1 === step ? 'border-holo bg-holo-soft font-semibold text-ink' : i + 1 < step ? 'border-ok/40 text-ok' : 'border-holo-faint text-ink-3',
                    )}
                  >
                    <span data-num className="font-mono">
                      {i + 1 < step ? '✓' : i + 1}
                    </span>
                    {label}
                  </li>
                ))}
              </ol>
              <FoodTime
                seconds={seconds}
                total={Math.max(me.devSeconds, 1)}
                food={me.hungry ? 0 : 1}
                need={1}
                note={[
                  me.hungry ? 'Short of Food this month, so less time.' : `Full time: ${me.devSeconds} s.`,
                  me.sick ? 'Sickness cost you time.' : '',
                  `Geo analysis takes ${DEVELOPMENT.analysisSeconds} s.`,
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
              <p className="text-sm text-ink-2">
                {carry === null && 'Tap the corral to buy an empty MULE, or the pub to cash out and end your turn.'}
                {carry === 'empty' && 'Lead your MULE to an outfitter for a farm or mine, or to the works for a factory. It can make only that good.'}
                {outfitted && 'Your MULE is ready. Walk out and install it on one of your plots.'}
              </p>
            </>
          )}
          {place === 'map' && !tile && <p className="text-sm text-ink-2">Tap a plot to look at it. Tap the store to go back in.</p>}
          {place === 'map' && tile && (
            <section className="flex flex-col gap-2 border-t border-holo-faint pt-2.5">
              <header className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold leading-tight">
                  {TERRAIN_NAME[tile.terrain]} <span className="font-mono text-sm font-normal text-ink-3">{plotName(tile.x, tile.y)}</span>
                </h2>
                <span className="font-mono text-xs text-holo">{mine ? 'YOURS' : free ? 'FREE' : 'OWNED'}</span>
              </header>
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
              {tile.ground ? <GroundCard ground={tile.ground} /> : <span className="text-sm text-ink-2">{TERRAIN_ODDS[tile.terrain]}</span>}
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
            <Button size="md" variant={outfitted ? 'holo' : 'outline'} className="w-full" onClick={() => setPlace('map')}>
              Walk out to the map
            </Button>
            <div className="flex">{pub}</div>
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
              {pub}
            </div>
          </>
        )
      }
    >
      {place === 'store' ? (
        <div className="h-full min-h-[300px]">
          <StoreInterior
            mules={view.storeMules}
            mulePrice={me.mulePrice}
            prices={me.outfitCosts}
            pubPayout={pubPayout}
            open={open}
            onShop={onShop}
            onDoor={() => setPlace('map')}
            me={{ id: me.id, slot, leading: carry, time: seconds / DEVELOPMENT.fullSeconds }}
            overlay={filling && <FillCard elapsed={elapsed} seconds={me.devSeconds} hungry={me.hungry} ate={Math.min(me.stock.food, me.needs.food)} need={me.needs.food} />}
          />
        </div>
      ) : (
        <MapFit width={view.width} height={view.height}>
          <HoloMap
            width={view.width}
            height={view.height}
            tiles={mapTiles(view)}
            focusSlot={slot}
            selected={selected}
            onTile={(t) => (t.terrain === 'store' ? setPlace('store') : setSelected({ x: t.x, y: t.y }))}
          />
        </MapFit>
      )}
    </PhoneShell>
  );
}

/** The start of the turn: you eat, and your time bar fills to what the Food bought, short and orange when hungry. */
function FillCard({ elapsed, seconds, hungry, ate, need }: { elapsed: number; seconds: number; hungry: boolean; ate: number; need: number }) {
  const full = DEVELOPMENT.fullSeconds;
  const share = Math.min(1, elapsed / FILL_RISE_SECONDS) * Math.min(1, seconds / full);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-void/55" data-testid="fill-card">
      <div className="flex w-[64%] flex-col gap-1.5 rounded-panel border-2 border-holo bg-panel p-3 shadow-glow">
        <span className="label-caps">Start of your turn</span>
        <span className="font-display text-lg font-semibold leading-tight">
          You eat {ate} Food{hungry ? ` of the ${need} you need` : ''} and fill up your time bar.
        </span>
        <div className="relative h-3 overflow-hidden rounded-full bg-raised">
          <div className={cx('absolute inset-y-0 left-0 rounded-full', hungry ? 'bg-warn' : 'bg-holo')} style={{ width: `${share * 100}%` }} />
          {hungry && <div className="absolute inset-y-0 border-l-2 border-dashed border-ink-3" style={{ left: '100%', transform: 'translateX(-2px)' }} />}
        </div>
        <span data-num className={cx('font-mono text-sm font-bold', hungry ? 'text-warn' : 'text-holo')}>
          {Math.round(share * full)} s{hungry ? ` of ${full}: short of Food, so less time` : ': full time'}
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
