import { Button, cx, GOOD_NAME, GoodIcon, HoloMap, MuleIcon, Panel, TERRAIN_NAME, type Good, type MapTile, type Terrain } from '@mule/ui';
import { useState } from 'react';
import { bookFor, MAP_H, MAP_W, ME, MONTH, MULE_PRICE, MY_STOCK, TILES } from '../../data';
import { FACTORIES, factoryFit, isFactory, type Factory } from '../factory';
import { useCountdown } from '../../proto';
import { AirGauge } from '../Air';
import { FoodTime, OUTFITS, StoreInterior, type Shop } from '../Store';
import { PhoneShell } from './Shell';

type Carry = null | 'empty' | Good;

const RAW: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];

/** What the terrain hints at before anyone looks underground. From the design doc's terrain odds. */
const ODDS: Partial<Record<Terrain, string>> = {
  river: 'Often good for Food and Water. Poor for mining.',
  lake: 'Often good for Water and Food. Nothing to mine.',
  plains: 'Often good for Food and Energy. Few minerals.',
  forest: 'Often good for Food. Poor for Energy.',
  swamp: 'Often good for Water. Some Rare earth.',
  hills: 'Good odds of Smithore. Some Crystite and Rare earth.',
  mountains: 'Very good odds of Smithore and Rare earth.',
  desert: 'Often good for Energy. Some Crystite and Rare earth.',
  tundra: 'Often good for Energy and Water. Some minerals.',
  ice: 'Often good for Water. Little else.',
  volcanic: 'Good odds of Rare earth and Energy.',
  crater: 'Very good odds of Crystite.',
};

/** A made-up but stable analysis result for any plot. */
function analyse(t: MapTile): Partial<Record<Good, number>> {
  const r = (k: number) => ((t.x * 31 + t.y * 17 + k * 13) % 5);
  return { food: r(1), water: r(2), energy: r(3), smithore: r(4) % 4, crystite: r(5) % 3, rareEarth: r(6) % 4 };
}

const TOTAL = 50;
const FOOD = bookFor('food').find((r) => r.slot === ME)!;

export function PhoneDevelop() {
  const seconds = useCountdown(TOTAL);
  const [place, setPlace] = useState<'map' | 'store'>('store');
  const [mules, setMules] = useState(4);
  const [pub, setPub] = useState<number | null>(null);
  const [tiles, setTiles] = useState(TILES);
  const [selected, setSelected] = useState<MapTile | null>(TILES.find((t) => t.x === 9 && t.y === 5) ?? null);
  const [carry, setCarry] = useState<Carry>(null);
  const [money, setMoney] = useState(1240);
  const [scanning, setScanning] = useState<MapTile | null>(null);

  const mine = selected && selected.owner === ME;
  const free = selected && selected.owner === null && selected.terrain !== 'store';

  const startScan = () => {
    if (!selected) return;
    const target = selected;
    setScanning(target);
    window.setTimeout(() => {
      const ground = target.ground ?? analyse(target);
      setTiles((ts) => ts.map((t) => (t.x === target.x && t.y === target.y ? { ...t, ground } : t)));
      setSelected((s) => (s && s.x === target.x && s.y === target.y ? { ...s, ground } : s));
      setScanning(null);
    }, 2400);
  };

  const pubPayout = Math.round(20 + (60 + MONTH * 20) * (seconds / TOTAL));
  const open: Shop[] = carry === null ? ['corral', 'pub'] : carry === 'empty' ? [...OUTFITS.map((o) => o.good), ...FACTORIES.map((f) => f.good), 'pub'] : ['pub'];
  const onShop = (shop: Shop) => {
    if (shop === 'pub') return setPub(pubPayout);
    if (shop === 'corral') {
      setCarry('empty');
      setMoney((m) => m - MULE_PRICE);
      setMules((n) => n - 1);
      return;
    }
    const outfit = OUTFITS.find((o) => o.good === shop) ?? FACTORIES.find((f) => f.good === shop)!;
    setCarry(shop);
    setMoney((m) => m - outfit.cost);
    // Point at an empty plot of yours, so the fit shows as soon as you walk out.
    const empty = tiles.find((t) => t.owner === ME && !t.good);
    if (empty) setSelected(empty);
  };

  const fit = selected && carry && carry !== 'empty' && isFactory(carry) ? factoryFit(carry, selected, tiles, ME, MY_STOCK) : null;

  const install = () => {
    if (!selected || !carry || carry === 'empty') return;
    const output = fit ? fit.makes : 3;
    setTiles((ts) => ts.map((t) => (t.x === selected.x && t.y === selected.y ? { ...t, owner: ME, good: carry, output } : t)));
    setSelected({ ...selected, owner: ME, good: carry, output });
    setCarry(null);
  };

  if (pub !== null) {
    return (
      <PhoneShell phase="Development" seconds={seconds}>
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <span className="label-caps">The pub</span>
          <span data-num className="font-mono text-5xl font-bold text-ok">+{pub} cr</span>
          <p className="max-w-[260px] text-ink-2">You cashed out at the pub. Your turn is over; the others keep building until their time runs out.</p>
          <Button variant="outline" onClick={() => setPub(null)}>Back (prototype only)</Button>
        </div>
      </PhoneShell>
    );
  }

  const step = carry === null ? 1 : carry === 'empty' ? 2 : 3;

  return (
    <PhoneShell phase="Development" seconds={seconds}>
      <div className="flex flex-col gap-3">
        <FoodTime seconds={seconds} total={TOTAL} food={FOOD.has} need={FOOD.needs} />
        <AirGauge />
        <p className="-mt-1 text-xs text-ink-3">The air is smoggy, so everyone loses 5 s. You have 1 Medicine, so you don't.</p>
        <ol className="grid grid-cols-3 gap-1.5 text-xs">
          {['Buy a MULE', 'Outfit it', 'Install on your plot'].map((label, i) => (
            <li
              key={label}
              className={cx(
                'flex items-center gap-1.5 rounded-control border px-2 py-1.5',
                i + 1 === step ? 'border-holo bg-holo-soft font-semibold text-ink' : i + 1 < step ? 'border-ok/40 text-ok' : 'border-holo-faint text-ink-3',
              )}
            >
              <span data-num className="font-mono">{i + 1 < step ? '✓' : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-3 rounded-panel border border-holo-line bg-panel px-3 py-2.5">
          <span className={cx(carry === null ? 'text-ink-3' : 'text-ink')}><MuleIcon size={26} /></span>
          <span className="flex-1 font-display text-base font-semibold">
            {carry === null ? 'No MULE' : carry === 'empty' ? 'Empty MULE in tow' : `${GOOD_NAME[carry]} MULE in tow`}
          </span>
          <span data-num className="font-mono text-sm font-bold">{money} cr</span>
        </div>

        {place === 'store' ? (
          <>
            <StoreInterior mules={mules} mulePrice={MULE_PRICE} pubPayout={pubPayout} open={open} onShop={onShop} visitors={{ corral: [5] }} />
            <p className="text-sm text-ink-2">
              {carry === null && 'Tap the corral to buy an empty MULE, or the pub to cash out and end your turn.'}
              {carry === 'empty' && 'Lead your MULE to an outfitter for a farm or mine, or to the works for a factory. It can make only that good.'}
              {carry && carry !== 'empty' && 'Your MULE is ready. Walk out and install it on one of your plots.'}
            </p>
            <Button size="lg" variant={carry && carry !== 'empty' ? 'holo' : 'outline'} className="w-full" onClick={() => setPlace('map')}>
              Walk out to the map
            </Button>
          </>
        ) : (
          <>
            <HoloMap width={MAP_W} height={MAP_H} tiles={tiles} focusSlot={ME} selected={selected} avatars={[{ slot: ME, x: 7.3, y: 4.3, carrying: carry ?? undefined, name: 'Heiko' }]} onTile={(t) => (t.terrain === 'store' ? setPlace('store') : setSelected(t))} showOutput />
            <Button size="md" variant="outline" className="w-full" onClick={() => setPlace('store')}>
              Walk into the store
            </Button>
        {selected && (
          <Panel title={`Plot ${selected.x + 1}·${selected.y + 1}`} aside={mine ? 'YOURS' : free ? 'FREE' : selected.terrain === 'store' ? 'STORE' : 'OWNED'}>
            <span className="font-display text-xl font-semibold">{TERRAIN_NAME[selected.terrain]}</span>
            {mine && selected.good && (
              <span className="text-ink-2">
                Making {GOOD_NAME[selected.good]}, <span className="font-mono font-bold text-ink">+{selected.output}</span> last month.
              </span>
            )}
            {!!selected.pollution && (
              <span className="rounded-control bg-[rgb(120_96_60/0.14)] px-3 py-2 text-sm text-ink">
                <strong>{['', 'Dusty', 'Polluted', 'Toxic'][selected.pollution]} land.</strong> Food, Water and Medicine here make {selected.pollution} less. It
                clears by 1 a month once no polluter is next to it.
              </span>
            )}
            {fit && carry && carry !== 'empty' && isFactory(carry) && <FitCard factory={carry} fit={fit} />}
            {!fit && selected.terrain !== 'store' && selected.ground && <GroundCard ground={selected.ground} />}
            {!fit && selected.terrain !== 'store' && !selected.ground && (
              <span className={cx('text-sm', scanning ? 'text-holo' : 'text-ink-2')}>
                {scanning ? 'Geo analysis running. Only you will see the result.' : ODDS[selected.terrain]}
              </span>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button size="md" disabled={!(carry && carry !== 'empty') || !mine} onClick={install}>
                Install here
              </Button>
              <Button size="md" variant="outline" disabled={!!scanning || !!selected.ground || selected.terrain === 'store'} onClick={startScan}>
                {selected.ground ? 'Analysed' : scanning ? 'Analysing…' : 'Geo analysis · 8 s'}
              </Button>
            </div>
            {!mine && <span className="text-xs text-ink-3">You can analyse any plot. A MULE led onto a plot that isn't yours runs off.</span>}
          </Panel>
        )}
          </>
        )}
      </div>
    </PhoneShell>
  );
}

/** The private result of a geo analysis: every raw good, rated 0 to 4. */
function GroundCard({ ground }: { ground: Partial<Record<Good, number>> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-control bg-raised p-3">
      <span className="label-caps col-span-2 flex justify-between">
        Underground <span className="text-holo">Only you</span>
      </span>
      {RAW.map((g) => {
        const n = ground[g] ?? 0;
        return (
          <span key={g} className={cx('flex items-center gap-2', n === 0 && 'opacity-50')}>
            <GoodIcon good={g} size={16} />
            <span className="flex-1 text-sm">{GOOD_NAME[g]}</span>
            <span className="flex gap-0.5" aria-label={`${n} of 4`}>
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className="size-2 rounded-full" style={{ background: i <= n ? `var(--color-g-${g})` : 'var(--color-holo-line)' }} />
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** How well a factory would do on this plot, and why, before you install it. */
function FitCard({ factory, fit }: { factory: Factory; fit: ReturnType<typeof factoryFit> }) {
  const spec = FACTORIES.find((f) => f.good === factory)!;
  return (
    <div className="flex flex-col gap-2 rounded-control bg-raised p-3">
      <span className="label-caps flex justify-between">
        {spec.name} here
        <span className={cx(fit.score > 0 ? 'text-ok' : fit.score < 0 ? 'text-alert' : 'text-ink-2')}>{fit.verdict}</span>
      </span>
      <span className="flex items-center gap-1.5 text-sm">
        {(Object.entries(spec.inputs) as [Good, number][]).map(([g, n], i) => (
          <span key={g} className="flex items-center gap-1">
            {i > 0 && <span className="text-ink-3">+</span>}
            <span data-num className="font-mono">{n}</span>
            <GoodIcon good={g} size={14} />
          </span>
        ))}
        <span className="text-ink-3">→</span>
        <span data-num className="font-mono font-bold">{fit.makes}</span>
        <GoodIcon good={factory} size={16} />
        <span className="text-ink-2">a month</span>
      </span>
      <ul className="flex flex-col gap-1 text-sm">
        {fit.lines.map((l) => (
          <li key={l.text} className="flex gap-2">
            <span className={cx('font-mono font-bold', l.tone === 'good' ? 'text-ok' : l.tone === 'bad' ? 'text-alert' : 'text-ink-3')}>
              {l.tone === 'good' ? '+' : l.tone === 'bad' ? '−' : '·'}
            </span>
            <span className="text-ink-2">{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
