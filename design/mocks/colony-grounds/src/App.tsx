import { Button } from '@mule/ui';
import { useState } from 'react';
import { MONTH_12, type GroundsObject, type Month } from './fixture';
import { Scene, type Look } from './Scene';
import { PhoneColony, richness, TvMonthEnd, TvPlanning, type ColonyNumbers } from './screens';

const NUMBERS: Record<Month, ColonyNumbers> = {
  1: { fund: 0, wealth: 0, prestige: 0, mood: 60, air: 8, prestigeUp: 0 },
  12: { fund: 640, wealth: 3_120, prestige: 9, mood: 72, air: 22, prestigeUp: 4 },
};

/** The growth strip: the same grounds at months 1, 4, 8 and 12, so the colony's rise reads in one look. */
const GROWTH: { month: number; objects: GroundsObject[]; n: Pick<ColonyNumbers, 'mood' | 'air'> }[] = [
  { month: 1, objects: [], n: { mood: 60, air: 8 } },
  { month: 4, objects: [{ id: 'park', stage: 'building', slot: 1, built: 0 }], n: { mood: 55, air: 12 } },
  {
    month: 8,
    objects: [
      { id: 'park', stage: 'standing', slot: 1 },
      { id: 'hospital', stage: 'standing', slot: 2 },
      { id: 'stadium', stage: 'building', slot: 5, built: 1 },
    ],
    n: { mood: 64, air: 18 },
  },
  {
    month: 12,
    objects: [
      { id: 'park', stage: 'standing', slot: 1 },
      { id: 'hospital', stage: 'standing', slot: 2 },
      { id: 'observatory', stage: 'standing', slot: 4 },
      { id: 'stadium', stage: 'standing', slot: 5 },
      { id: 'spaceport', stage: 'standing', slot: 7 },
    ],
    n: { mood: 84, air: 10 },
  },
];

export default function App() {
  const [month, setMonth] = useState<Month>(12);
  const [look, setLook] = useState<Look>('holo');
  const [governor, setGovernor] = useState(true);
  const objects = month === 1 ? [] : MONTH_12;
  // At the month end the Stadium, 2 of 3 at planning, stands.
  const monthEnd = month === 1 ? [] : MONTH_12.map((o) => (o.id === 'stadium' ? { ...o, stage: 'standing' as const, built: 3 } : o));
  const n = NUMBERS[month];
  return (
    <main className="flex min-h-screen flex-col gap-6 bg-void p-6 text-ink" data-testid="index">
      <header className="flex flex-col gap-2" data-testid="decisions">
        <h1 className="font-display text-2xl font-bold">The colony grounds · AM-16 option A (Heiko, 6 Nov): the colony's showpiece view (WS6 mock for WS7)</h1>
        <ul className="list-disc pl-5 text-sm leading-snug text-ink-2">
          <li>An isometric 2.5D model of the colony's own quarter: the town hall in the middle, 8 slots round it (WS7's rules). It is the colony's picture, not the planet map: no terrain grid, no players' plots.</li>
          <li>It grows richer as buildings rise. Month 1 is a bare dirt plaza and the hall; each standing building paves more of it, plants trees and lamps on the ring, and brings colonists out. Mood lights the windows and raises the hall's flag; bad air lays a haze. Wealth, mood and air read from the picture.</li>
          <li>Every stage on its slot: a free slot (dashed paving and its number), a site waiting for money and goods (stakes, rope, the planned outline), building (the outline, the part built, scaffolding and a crane, "2/3"), standing (lit), closed (dark and faded, SHUT), damaged (broken, smoking, HIT).</li>
          <li>The TV names each building over it, with its stage in the build site's words. The phone shows the slot's number and chip, and its rail lists the words. Slots read 1–8; ColonyView's slot is 0–7 (shown +1).</li>
          <li>The Governor places: Commission on the Colony desk, then tap a free slot's lit pad. Others watch and give. The AI Governor takes the first free slot.</li>
          <li><strong>3D later:</strong> the scene is drawn from layout.ts (cells and massing in grid units, no pixels). The 3D build reads the same data into react-three-fiber (three.js) and swaps each SVG shape for a model; placement, stages and the richness rules carry over unchanged.</li>
          <li><strong>The style choice (variants):</strong> <strong>Holo model</strong>, a glowing architect's model in the holo table's look; <strong>Lit diorama</strong>, solid illustrated buildings with coloured roofs. Same layout, same stages.</li>
          <li>DS-GAP: the scene's shapes are new SVG drawing in the mock, not @mule/ui parts (only tokens are shared); the build adds them to @mule/ui or replaces them with 3D models.</li>
        </ul>
        <div className="flex flex-wrap items-center gap-2" data-testid="controls">
          <span className="label-caps">Month</span>
          {([1, 12] as const).map((m) => (
            <Button key={m} size="md" variant={m === month ? 'holo' : 'outline'} onClick={() => setMonth(m)} data-testid={`month-${m}`}>
              {m === 1 ? 'Month 1 · bare' : 'Month 12 · busy'}
            </Button>
          ))}
          <span className="label-caps ml-4">Style</span>
          {(['holo', 'diorama'] as const).map((l) => (
            <Button key={l} size="md" variant={l === look ? 'holo' : 'outline'} onClick={() => setLook(l)} data-testid={`look-${l}`}>
              {l === 'holo' ? 'A · Holo model' : 'B · Lit diorama'}
            </Button>
          ))}
          <span className="label-caps ml-4">Phone</span>
          <Button size="md" variant={governor ? 'holo' : 'outline'} onClick={() => setGovernor(true)} data-testid="as-governor">
            You are Governor
          </Button>
          <Button size="md" variant={!governor ? 'holo' : 'outline'} onClick={() => setGovernor(false)} data-testid="as-player">
            You are not
          </Button>
        </div>
        <nav className="flex gap-4 text-sm text-holo" data-testid="links">
          <a href="#growth">Growth, months 1–12</a>
          <a href="#tv-planning">TV · planning</a>
          <a href="#tv-month-end">TV · month end</a>
          <a href="#phone">Phone · Colony desk</a>
        </nav>
      </header>
      <h2 id="growth" className="font-display text-xl font-semibold">The grounds grow: months 1, 4, 8, 12 ({look === 'holo' ? 'Holo model' : 'Lit diorama'})</h2>
      <div className="grid grid-cols-4 gap-3" data-testid="growth">
        {GROWTH.map((g) => (
          <figure key={g.month} className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2" data-testid={`growth-${g.month}`}>
            <Scene objects={g.objects} rich={richness(g.objects, { ...NUMBERS[12], ...g.n })} look={look} words={false} />
            <figcaption className="label-caps">Month {g.month}</figcaption>
          </figure>
        ))}
      </div>
      <h2 id="tv-planning" className="font-display text-xl font-semibold">TV · planning: the colony panel</h2>
      <TvPlanning month={month} objects={objects} n={n} look={look} />
      <h2 id="tv-month-end" className="font-display text-xl font-semibold">TV · the month end</h2>
      <TvMonthEnd month={month} objects={monthEnd} n={n} look={look} fresh={month === 1 ? null : 5} />
      <h2 id="phone" className="font-display text-xl font-semibold">Phone · the Colony desk, sideways ({governor ? 'Governor: try Commission, month 1' : 'not Governor'})</h2>
      <PhoneColony key={`${month}-${look}-${governor}`} month={month} initial={objects} n={n} look={look} governor={governor} />
      <a href="#index" className="text-sm text-holo">↑ back to the top</a>
    </main>
  );
}
