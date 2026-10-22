import type { ReactNode } from 'react';
import { MAP, mapSize, sizeBand, type FloorGood, type ShareTerrain } from '@mule/engine';
import { GOOD_NAME, GoodIcon, TERRAIN_NAME } from '@mule/ui';
import type { Players } from './gallery';
import { pct, Section } from './ui';

const FLOOR_GOODS = Object.keys(MAP.floor) as FloorGood[];
const SHARE_TERRAINS = Object.keys(MAP.shares) as ShareTerrain[];

/** The rule numbers every map must meet, read from MAP: the numbers Heiko approved. */
export function RulesPanel({ players }: { players: Players }) {
  const band = sizeBand(players);
  const { width, height } = mapSize(players);
  const { peak } = MAP;
  return (
    <Section title="The rules every map must meet" aside={`${players} players · ${width} × ${height} plots`}>
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[auto_1fr_1fr]">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Good plots for each good</h3>
          <table className="text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="pr-4 font-medium">Good</th>
                <th className="pr-4 font-medium">Floor per player</th>
                <th className="pr-4 font-medium">Normal from</th>
                <th className="font-medium">Reach, steps</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {FLOOR_GOODS.map((g) => (
                <tr key={g}>
                  <td className="py-0.5 pr-4 font-sans">
                    <span className="inline-flex items-center gap-1.5">
                      <GoodIcon good={g} size={14} />
                      {GOOD_NAME[g]}
                    </span>
                  </td>
                  <td className="pr-4">{MAP.floor[g]}</td>
                  <td className="pr-4">{MAP.normalLo[g]}</td>
                  <td>{MAP.reach[band][g]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 max-w-[44ch] text-xs text-ink-2">
            A plot is good for Food, Water or Energy at rating {MAP.goodAt.food} or more, for Smithore, Crystite or Rare earth at {MAP.goodAt.smithore} or
            more. A good below its normal range is the map's scarce good; at most one may be. About {pct(MAP.scarceChance)} of maps should have one.
          </p>
        </div>

        <div className="space-y-3 text-sm">
          <Rule title="River">
            At least {MAP.bends[band]} bends (rows with two river plots), at least {MAP.riverMargin} columns from each side, touching the store.
          </Rule>
          <Rule title="Regions">
            Every terrain region at least {MAP.minRegion} plots; none bigger than {pct(MAP.maxRegionShare)} of non-river land; no terrain over{' '}
            {pct(MAP.maxTerrainShare)} of it.
          </Rule>
          <Rule title="Smithore seams">At least {pct(MAP.seamShare)} of good Smithore plots touch another good Smithore plot.</Rule>
          <Rule title="Crystite and Rare earth rings">
            Each mineral has {peak.count.min} to {peak.count.max} peaks. A peak is rated {peak.high}, the plots 1 step away {peak.medium}, 2 steps away{' '}
            {peak.low.min} to {peak.low.max}, and every plot further out 0.
          </Rule>
        </div>

        <div className="text-sm">
          <h3 className="mb-2 font-semibold">Terrain shares of non-river land</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {SHARE_TERRAINS.map((t) => (
              <div key={t} className="flex justify-between gap-2">
                <span>{TERRAIN_NAME[t]}</span>
                <span className="font-mono">{pct(MAP.shares[t])}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-2">Every terrain must be on the map, within {pct(MAP.jitter)} of its share either way, give or take one plot.</p>
        </div>
      </div>
    </Section>
  );
}

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <p>
      <span className="font-semibold">{title}: </span>
      <span className="text-ink-2">{children}</span>
    </p>
  );
}
