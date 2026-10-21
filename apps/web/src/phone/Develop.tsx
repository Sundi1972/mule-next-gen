import { DEVELOPMENT } from '@mule/engine';
import type { TileView } from '@mule/protocol';
import { AirGauge, Button, cx, FACTORY_GOODS, FoodTime, GOOD_NAME, HoloMap, MuleIcon, OUTFIT_GOODS, Panel, PlayerMark, StoreInterior, TERRAIN_NAME, type Shop } from '@mule/ui';
import { useEffect, useState } from 'react';
import { fmt, mapTiles, PHASE_NAME, plotName, slotOf, TERRAIN_ODDS, tileAt } from '../game/derive';
import { useClient, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { GroundCard, Traits } from './ground';
import { PhoneShell } from './Shell';

const OUTFIT_NAME = (o: TileView['outfit']) => (o === null ? '' : o === 'greenBelt' ? 'Green belt' : GOOD_NAME[o]);

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
  const open: Shop[] = carry === null ? ['corral', 'pub'] : carry === 'empty' ? [...OUTFIT_GOODS, ...FACTORY_GOODS, 'greenBelt', 'pub'] : ['pub'];
  const onShop = (shop: Shop) => {
    if (shop === 'pub') client.intent({ type: 'pub' });
    else if (shop === 'corral') client.intent({ type: 'buyMule' });
    else client.intent({ type: 'outfit', outfit: shop });
  };
  const mine = tile?.owner === me.id;
  const free = tile && tile.owner === null && tile.terrain !== 'store';
  const owner = tile?.owner ? view.players.find((p) => p.id === tile.owner) : undefined;

  return (
    <PhoneShell phase={PHASE_NAME.development} seconds={seconds}>
      <div className="flex flex-col gap-3">
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
        <AirGauge level={view.air.level} band={view.air.band} />
        <ol className="grid grid-cols-3 gap-1.5 text-xs">
          {['Buy a MULE', 'Outfit it', 'Install on your plot'].map((label, i) => (
            <li
              key={label}
              className={cx(
                'flex items-center gap-1.5 rounded-control border px-2 py-1.5',
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

        <div className="flex items-center gap-3 rounded-panel border border-holo-line bg-panel px-3 py-2.5" data-testid="mule">
          <span className={cx(carry === null ? 'text-ink-3' : 'text-ink')}>
            <MuleIcon size={26} />
          </span>
          <span className="flex-1 font-display text-base font-semibold">
            {carry === null ? 'No MULE' : carry === 'empty' ? 'Empty MULE in tow' : `${OUTFIT_NAME(carry)} MULE in tow`}
          </span>
          <span data-num className="font-mono text-sm font-bold">
            {fmt(self.money)} cr
          </span>
        </div>

        {place === 'store' ? (
          <>
            <StoreInterior mules={view.storeMules} mulePrice={me.mulePrice} prices={me.outfitCosts} open={open} onShop={onShop} visitors={{}} />
            <p className="text-sm text-ink-2">
              {carry === null && 'Tap the corral to buy an empty MULE, or the pub to cash out and end your turn.'}
              {carry === 'empty' && 'Lead your MULE to an outfitter for a farm or mine, or to the works for a factory. It can make only that good.'}
              {outfitted && 'Your MULE is ready. Walk out and install it on one of your plots.'}
            </p>
            <Button size="lg" variant={outfitted ? 'holo' : 'outline'} className="w-full" onClick={() => setPlace('map')}>
              Walk out to the map
            </Button>
          </>
        ) : (
          <>
            <HoloMap
              width={view.width}
              height={view.height}
              tiles={mapTiles(view)}
              focusSlot={slot}
              selected={selected}
              onTile={(t) => (t.terrain === 'store' ? setPlace('store') : setSelected({ x: t.x, y: t.y }))}
            />
            <Button size="md" variant="outline" className="w-full" onClick={() => setPlace('store')}>
              Walk into the store
            </Button>
            {!tile && <p className="text-sm text-ink-2">Tap a plot to look at it. Tap the store to go back in.</p>}
            {tile && (
              <Panel title={`Plot ${plotName(tile.x, tile.y)}`} aside={mine ? 'YOURS' : free ? 'FREE' : 'OWNED'}>
                <span className="flex items-center gap-2 font-display text-xl font-semibold">
                  {TERRAIN_NAME[tile.terrain]}
                  {owner && !mine && (
                    <span className="flex items-center gap-1.5 text-sm font-normal text-ink-2">
                      <PlayerMark slot={slotOf(view, owner.id) ?? 0} size={14} glow={false} />
                      {owner.name}
                    </span>
                  )}
                </span>
                {tile.outfit && (
                  <span className="text-ink-2">
                    {mine ? 'Your' : 'A'} MULE here makes <strong className="text-ink">{OUTFIT_NAME(tile.outfit)}</strong>.{tile.filter && ' It has a filter.'}
                  </span>
                )}
                {!!tile.pollution && (
                  <span className="rounded-control bg-[rgb(120_96_60/0.14)] px-3 py-2 text-sm text-ink">
                    <strong>{['', 'Dusty', 'Polluted', 'Toxic'][tile.pollution]} land.</strong> Food, Water and Medicine here make {tile.pollution} less.
                  </span>
                )}
                {tile.ground ? <GroundCard ground={tile.ground} /> : <span className="text-sm text-ink-2">{TERRAIN_ODDS[tile.terrain]}</span>}
                <Traits traits={tile.traits} />
                <div className="grid grid-cols-2 gap-2">
                  <Button size="md" disabled={!outfitted || !mine} onClick={() => client.intent({ type: 'install', x: tile.x, y: tile.y })}>
                    {outfitted && mine && tile.outfit ? 'Replace MULE' : 'Install here'}
                  </Button>
                  <Button size="md" variant="outline" disabled={!!tile.ground} onClick={() => client.intent({ type: 'analyse', x: tile.x, y: tile.y })}>
                    {tile.ground ? 'Analysed' : `Geo analysis · ${DEVELOPMENT.analysisSeconds} s`}
                  </Button>
                  {mine && (
                    <Button size="md" variant="outline" className="col-span-2" disabled={tile.filter || me.stock.alloy < DEVELOPMENT.filterAlloy} onClick={() => client.intent({ type: 'filter', x: tile.x, y: tile.y })}>
                      {tile.filter ? 'Filter fitted' : `Fit a filter · ${DEVELOPMENT.filterAlloy} Alloy (you have ${me.stock.alloy})`}
                    </Button>
                  )}
                </div>
                {!mine && <span className="text-xs text-ink-3">You can analyse any plot. You can only install on your own.</span>}
              </Panel>
            )}
          </>
        )}
        <Button size="md" variant="ghost" className="w-full" onClick={() => client.intent({ type: 'pub' })}>
          Go to the pub and end your turn
        </Button>
      </div>
    </PhoneShell>
  );
}

/** Your turn is over: at the pub, or out of time. The others keep building. */
function Done({ pub }: { pub: boolean }) {
  const { view, self } = usePhoneGame();
  const won = view.news.find((n) => n.startsWith(`${self.name} went to the pub`));
  const payout = won?.match(/won (\d+)/)?.[1];
  const still = view.players.filter((p) => !p.doneDeveloping);
  return (
    <PhoneShell phase={PHASE_NAME.development}>
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="label-caps">{pub ? 'The pub' : 'Time is up'}</span>
        {pub && payout ? (
          <span data-num className="font-mono text-5xl font-bold text-ok">
            +{payout} cr
          </span>
        ) : (
          <span className="font-display text-4xl font-semibold">{pub ? 'Cheers!' : 'Out of time'}</span>
        )}
        <p className="max-w-[280px] text-ink-2">
          {pub ? 'You cashed out at the pub. Your turn is over;' : 'Your development time ran out;'} the others keep building until their time runs out.
        </p>
        {still.length > 0 && (
          <ul className="mt-2 flex flex-wrap justify-center gap-2">
            {still.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 rounded-full border border-holo-faint px-3 py-1 text-sm">
                <PlayerMark slot={slotOf(view, p.id) ?? 0} size={12} glow={false} />
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PhoneShell>
  );
}
