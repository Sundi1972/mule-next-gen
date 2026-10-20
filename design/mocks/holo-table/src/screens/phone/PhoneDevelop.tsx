import { Button, cx, GOOD_NAME, GoodTag, HoloMap, Panel, TERRAIN_NAME, type Good, type MapTile } from '@mule/ui';
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
  { good: 'alloy', cost: 125 },
];

type Carry = null | 'empty' | Good;

export function PhoneDevelop() {
  const seconds = useCountdown(45);
  const [tiles, setTiles] = useState(TILES);
  const [selected, setSelected] = useState<MapTile | null>(TILES.find((t) => t.x === 8 && t.y === 4) ?? null);
  const [carry, setCarry] = useState<Carry>(null);
  const [money, setMoney] = useState(1240);
  const [surveying, setSurveying] = useState(false);

  const mine = selected && selected.owner === ME;
  const free = selected && selected.owner === null && selected.terrain !== 'store';

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
            <span className={cx('text-sm', surveying ? 'text-holo' : 'text-ink-3')}>
              {surveying ? 'Survey running · 12 s left · results arrive privately' : 'Hidden traits unknown. A survey reveals them.'}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <Button size="md" disabled={!(carry && carry !== 'empty') || !mine} onClick={install}>
                Install here
              </Button>
              <Button size="md" variant="outline" disabled={surveying || !mine} onClick={() => setSurveying(true)}>
                Survey · 15 s
              </Button>
            </div>
            {!mine && <span className="text-xs text-ink-3">Tap one of your glowing plots to work on it.</span>}
          </Panel>
        )}
      </div>
    </PhoneShell>
  );
}
