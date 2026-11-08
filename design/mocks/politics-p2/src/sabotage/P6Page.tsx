import type { SabotageTarget } from '@mule/engine';
import type { MyPoliticsView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { ClientProvider } from '../../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../../apps/web/src/phone/game';
import { useToday, TodayState } from '../../../../../apps/web/src/phone/hub/state';
import { LookPanel } from '../../../../../apps/web/src/phone/hub/tools';
import { clientFor, viewFor } from '../fixture';
import { MyOrders, PowerCutOrder, RumourOrder } from './Order';

/** Plots to look at, each a different case for the order: a rival's working plot, a pact partner's, idle land, your own. */
const PLOTS: { x: number; y: number; label: string }[] = [
  { x: 12, y: 4, label: 'Ossa’s smithore' },
  { x: 9, y: 2, label: 'Brix’s food (your pact)' },
  { x: 3, y: 6, label: 'Kai’s idle plot' },
  { x: 6, y: 2, label: 'Your own plot' },
];

type Mode = 'planning' | 'ban' | 'notPlanning';
const MODES: [Mode, string][] = [['planning', 'Planning'], ['ban', 'Sabotage ban ×2'], ['notPlanning', 'Not planning']];

/** Sets Look's plot when the column opens or the reviewer picks another, as a tap on the map would. */
function Looking({ x, y }: { x: number; y: number }) {
  const { setLooked } = useToday();
  useEffect(() => setLooked({ x, y }), [x, y, setLooked]);
  return null;
}

function Column({ title, w, children, testid }: { title: string; w: number; children: ReactNode; testid: string }) {
  return (
    <figure className="flex flex-col gap-1" data-testid={testid}>
      <figcaption className="label-caps text-[10px]! text-ink-2">{title}</figcaption>
      {/* A desk column's width, not a design value. */}
      <div className="@container/shell flex flex-col gap-2 overflow-y-auto rounded-panel border border-holo-line bg-void p-2.5 text-ink" style={{ width: w, height: 420 }}>
        {children}
      </div>
    </figure>
  );
}

function Chips<T extends string>({ items, value, onPick, label }: { items: [T, string][]; value: T; onPick(v: T): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {items.map(([id, text]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onPick(id)} data-testid={`${label.toLowerCase().replace(/\W+/g, '-')}-${id}`}
          className={cx('h-11 rounded-control border px-4 text-sm font-semibold', value === id ? 'border-holo bg-holo-soft' : 'border-holo-line text-ink-2')}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function P6Page() {
  const [order, setOrder] = useState<SabotageTarget | null>(null);
  const [plot, setPlot] = useState('0');
  const [mode, setMode] = useState<Mode>('planning');
  const base = viewFor('lena', 'month', order);
  const sab: NonNullable<MyPoliticsView['sabotage']> = { ...base.me.politics!.sabotage!, canOrder: mode === 'notPlanning' ? 'notPlanning' : true };
  const me = { ...base.me, politics: { ...base.me.politics!, sabotage: sab } };
  const view = { ...base.view, me };
  const ban = mode === 'ban' ? 2 : 1;
  const p = PLOTS[Number(plot)]!;
  const tile = view.tiles[p.y * view.width + p.x]!;
  return (
    <div className="flex flex-col gap-4" data-testid="p6">
      <p className="max-w-3xl text-sm text-ink-2">
        Lena’s phone. Pick a plot to look at, as a tap on Overview’s map would; the order opens under Look. The rumour starts at the
        market. Order one, then try the other: one order a month between them.
      </p>
      <Chips label="Look at" items={PLOTS.map((q, i) => [String(i), q.label] as [string, string])} value={plot} onPick={setPlot} />
      <Chips<Mode> label="When" items={MODES} value={mode} onPick={setMode} />
      <ClientProvider client={clientFor('lena')}>
        <PhoneGameProvider value={{ ...base, view, me }}>
          <TodayState>
            <Looking x={p.x} y={p.y} />
            <div className="flex flex-wrap items-start gap-4">
              <Column title="Look, under Overview’s map ≈ 300 px" w={300} testid="p6-look">
                <LookPanel />
                <PowerCutOrder key={plot} view={view} tile={tile} meId="lena" sab={sab} ban={ban} onOrder={setOrder} onWithdraw={() => setOrder(null)} />
              </Column>
              <Column title="At the market ≈ 300 px" w={300} testid="p6-market">
                <RumourOrder view={view} sab={sab} ban={ban} onOrder={setOrder} onWithdraw={() => setOrder(null)} />
              </Column>
              <Column title="Your orders ≈ 300 px" w={300} testid="p6-mine">
                <MyOrders view={view} sab={sab} />
              </Column>
            </div>
          </TodayState>
        </PhoneGameProvider>
      </ClientProvider>
    </div>
  );
}
