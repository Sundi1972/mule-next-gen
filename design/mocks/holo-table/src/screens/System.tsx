import { AuctionSlider, Button, GOOD_NAME, GoodIcon, HoloMap, Landscape, Panel, Creature, PlayerMark, SLOT_COLOR, SPECIES, SPECIES_NAME, SPECIES_PERK, Stat, TERRAIN_NAME, Ticker, Timer, useTheme, type Good, type Slot, type Terrain } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { MAP_H, MAP_W, MARKET, TILES } from '../data';

const SURFACES = ['void', 'table', 'panel', 'raised'];
const HOLO = ['holo', 'holo-strong', 'holo-soft', 'holo-line'];
const INK = ['ink', 'ink-2', 'ink-3'];
const SIGNALS = ['alert', 'warn', 'ok', 'rise', 'fall'];
const TERRAIN: Terrain[] = ['plains', 'river', 'lake', 'forest', 'swamp', 'hills', 'mountains', 'desert', 'tundra', 'ice', 'volcanic', 'crater'];
const GOODS: Good[] = ['food', 'water', 'energy', 'smithore', 'rareEarth', 'crystite', 'alloy', 'electronics', 'medicine'];
const SLOTS: Slot[] = [0, 1, 2, 3, 4, 5];

const PRINCIPLES = [
  ['The map is a living landscape', 'Rivers, forests, dunes, ranges and ice are painted at full screen resolution. A fine grid marks the plots, and owned land is edged in its owner’s colour.'],
  ['Day by default, night on request', 'The light theme reads well in a bright kitchen. Night mode turns the same map dark with glowing contour lines.'],
  ['Numbers are first-class', 'Every price, count and timer is set in JetBrains Mono with tabular figures, like a trading screen.'],
  ['Colour never works alone', 'Each player is a creature of their species, in their colour, with their name beside it. Rise and fall come with arrows. Alerts come with words.'],
  ['Public on the big screen, private on the phone', 'The board shows what everyone may know. Stock, whispers and secret orders exist only on your phone.'],
  ['Made for thumbs and for across the room', 'Phone targets are at least 44 px. Big-screen type is readable from three metres.'],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <div className="flex w-28 flex-col gap-1.5">
      <div className="h-14 rounded-control border border-holo-faint" style={{ background: `var(--color-${token})` }} />
      <span className="font-mono text-xs text-ink-2">{token}</span>
    </div>
  );
}

function TerrainCard({ terrain }: { terrain: Terrain }) {
  const theme = useTheme();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative overflow-hidden rounded-control border border-map-edge" style={{ aspectRatio: '3 / 2' }}>
        <Landscape width={3} height={2} terrain={new Array(6).fill(terrain)} theme={theme} seed={terrain.length * 13} className="absolute inset-0" />
      </div>
      <span className="font-mono text-xs text-ink-2">{TERRAIN_NAME[terrain]}</span>
    </div>
  );
}

export function System() {
  const [price, setPrice] = useState(84);
  return (
    <div className="holo-grid min-h-screen bg-table">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-10">
        <header className="flex flex-col gap-3">
          <a href="#all" className="font-mono text-sm text-holo hover:text-holo-strong">‹ All screens</a>
          <span className="label-caps text-holo!">Design system · @mule/ui</span>
          <h1 className="font-display text-5xl font-semibold">Holo table</h1>
          <p className="max-w-3xl text-lg text-ink-2">
            The colony map is a painted landscape under a fine plot grid, like a planning table in a colony control room. Numbers float above each
            plot, and the market reads like a live trading screen. Day is the default; switch to Night with the toggle at the top.
          </p>
        </header>

        <Section title="Principles">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map(([t, d]) => (
              <Panel key={t}>
                <h3 className="font-display text-lg font-semibold">{t}</h3>
                <p className="text-sm text-ink-2">{d}</p>
              </Panel>
            ))}
          </div>
        </Section>

        <Section title="Colour">
          {[
            ['Surfaces', SURFACES],
            ['Hologram', HOLO],
            ['Text', INK],
            ['Signals', SIGNALS],
          ].map(([label, list]) => (
            <div key={label as string} className="flex flex-col gap-2">
              <span className="label-caps">{label as string}</span>
              <div className="flex flex-wrap gap-3">{(list as string[]).map((t) => <Swatch key={t} token={t} />)}</div>
            </div>
          ))}
        </Section>

        <Section title="Terrain">
          <p className="max-w-3xl text-ink-2">Terrain sets the odds of what lies underground. Only a geo analysis shows the real ratings of a plot.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {TERRAIN.map((t) => <TerrainCard key={t} terrain={t} />)}
          </div>
        </Section>

        <Section title="Players and goods">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SPECIES.map((sp, i) => (
              <Panel key={sp} className="flex-row! items-center gap-4">
                <Creature species={sp} color={SLOT_COLOR[i as Slot]} size={64} className="shrink-0" />
                <div className="flex flex-col gap-1">
                  <h3 className="font-display text-lg font-semibold">{SPECIES_NAME[sp]}</h3>
                  <p className="text-sm text-ink-2">{SPECIES_PERK[sp]}</p>
                </div>
              </Panel>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-5">
            {SLOTS.map((s) => (
              <div key={s} className="flex flex-col items-center gap-1.5">
                <Creature species="bramblet" color={SLOT_COLOR[s]} size={36} />
                <span className="font-mono text-xs text-ink-2">p{s + 1}</span>
              </div>
            ))}
            <span className="pb-6 text-sm text-ink-3">One species in all six colours. Colour tells players apart.</span>
          </div>
          <div className="flex flex-wrap gap-4">
            {GOODS.map((g) => (
              <div key={g} className="flex flex-col gap-1 rounded-control border border-holo-faint bg-panel px-3 py-2">
                <GoodIcon good={g} size={28} />
                <span className="text-sm text-ink-2">{GOOD_NAME[g]}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <Panel>
            <span className="label-caps">Display · Space Grotesk</span>
            <span className="font-display text-5xl font-semibold">Month 4 · Land grant</span>
            <span className="label-caps mt-3">Body · Inter</span>
            <span className="text-lg text-ink-2">Pirates raided the store. Food is short, and Mia offers you 10 Food for 400 credits next month.</span>
            <span className="label-caps mt-3">Numbers · JetBrains Mono</span>
            <span data-num className="font-mono text-4xl font-bold">81 · 1,240 cr · +24%</span>
          </Panel>
        </Section>

        <Section title="Components">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Claim</Button>
            <Button variant="outline">Counter</Button>
            <Button variant="ghost">Decline</Button>
            <Button variant="danger">Order sabotage</Button>
            <Button size="md">Small</Button>
            <Timer seconds={42} />
            <Timer seconds={7} />
          </div>
          <div className="flex flex-wrap gap-10">
            <Stat label="Money" value="1,240 cr" change={12} size="lg" />
            <Stat label="Food" value="81" change={24} />
            <Stat label="Water" value="19" change={-3} />
          </div>
          <Ticker items={MARKET} />
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Panel" aside="0:18">
              <p className="text-ink-2">The default surface for anything on the table.</p>
            </Panel>
            <Panel tone="alert" title="Alert panel">
              <p>For sabotage, raids and shortages. Never for decoration.</p>
            </Panel>
          </div>
          <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-2">
              <span className="label-caps">Holo map</span>
              <HoloMap width={MAP_W} height={MAP_H} tiles={TILES} cursor={{ x: 9, y: 6 }} showOutput density="tv" />
            </div>
            <div className="flex h-96 flex-col gap-2">
              <span className="label-caps">Auction slider</span>
              <AuctionSlider value={price} min={40} max={130} storeBuys={73} storeSells={89} side="sell" onChange={setPrice} />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
