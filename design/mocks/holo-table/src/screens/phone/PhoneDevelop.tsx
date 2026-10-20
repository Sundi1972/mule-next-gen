import { Button, cx, GOOD_NAME, GoodIcon, GoodTag, HoloMap, Panel, TERRAIN_NAME, type Good, type MapTile, type Terrain } from '@mule/ui';
import { useState } from 'react';
import { MAP_H, MAP_W, ME, MULE_PRICE, TILES } from '../../data';
import { useCountdown } from '../../proto';
import { PhoneShell } from './Shell';

const OUTFITS: { good: Good; cost: number }[] = [
  { good: 'food', cost: 25 },
  { good: 'water', cost: 25 },
  { good: 'energy', cost: 50 },
  { good: 'smithore', cost: 75 },
  { good: 'crystite', cost: 100 },
  { good: 'rareEarth', cost: 100 },
];

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

export function PhoneDevelop() {
  const seconds = useCountdown(45);
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

  const install = () => {
    if (!selected || !carry || carry === 'empty') return;
    setTiles((ts) => ts.map((t) => (t.x === selected.x && t.y === selected.y ? { ...t, owner: ME, good: carry, output: 3 } : t)));
    setSelected({ ...selected, owner: ME, good: carry, output: 3 });
    setCarry(null);
  };

  return (
    <PhoneShell phase="Development" seconds={seconds}>
      <div className="flex flex-col gap-4">
        <HoloMap width={MAP_W} height={MAP_H} tiles={tiles} focusSlot={ME} selected={selected} onTile={setSelected} showOutput />
        <div className="flex items-center gap-3 rounded-panel border border-holo-line bg-panel px-4 py-3">
          <span className="label-caps">Carrying</span>
          <span className="flex-1 font-display text-lg font-semibold">
            {carry === null ? 'Nothing' : carry === 'empty' ? 'An empty MULE' : `A MULE for ${GOOD_NAME[carry]}`}
          </span>
          <span data-num className="font-mono text-sm font-bold">{money} cr</span>
        </div>

        {carry === null && (
          <Button size="lg" className="w-full" onClick={() => { setCarry('empty'); setMoney((m) => m - MULE_PRICE); }}>
            Buy a MULE · <span data-num className="font-mono">{MULE_PRICE} cr</span>
          </Button>
        )}

        {carry === 'empty' && (
          <Panel title="Outfit your MULE at the store">
            <div className="grid grid-cols-3 gap-2">
              {OUTFITS.map((o) => (
                <button key={o.good} type="button" onClick={() => { setCarry(o.good); setMoney((m) => m - o.cost); }} className="flex h-16 flex-col items-center justify-center gap-1 rounded-control border border-holo-line bg-void hover:border-holo">
                  <GoodTag good={o.good} name />
                  <span data-num className="font-mono text-xs text-ink-3">{o.cost} cr</span>
                </button>
              ))}
            </div>
          </Panel>
        )}

        {selected && (
          <Panel title={`Plot ${selected.x + 1}·${selected.y + 1}`} aside={mine ? 'YOURS' : free ? 'FREE' : selected.terrain === 'store' ? 'STORE' : 'OWNED'}>
            <span className="font-display text-xl font-semibold">{TERRAIN_NAME[selected.terrain]}</span>
            {mine && selected.good && (
              <span className="text-ink-2">
                Making {GOOD_NAME[selected.good]}, <span className="font-mono font-bold text-ink">+{selected.output}</span> last month.
              </span>
            )}
            {selected.terrain !== 'store' && selected.ground && <GroundCard ground={selected.ground} />}
            {selected.terrain !== 'store' && !selected.ground && (
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
            {!mine && <span className="text-xs text-ink-3">You can analyse any plot. To install, tap one of your own.</span>}
          </Panel>
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
