import type { ColonyView } from '@mule/protocol';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ColonyGauges } from '../src/components/Colony';

// Air that runs to 200: the Environment gauge fills to its share of POLLUTION.airMax, never as if the air ran to 100.
vi.mock('@mule/engine', async (actual) => {
  const engine = await actual<typeof import('@mule/engine')>();
  return { ...engine, POLLUTION: { ...engine.POLLUTION, airMax: 200 } };
});

const colony = (environment: number): ColonyView => ({
  gauges: { wealth: 26_400, environment, prestige: 2, happiness: 64, band: 'content' },
  lastGauges: { wealth: 24_900, prestige: 2, happiness: 58 },
  fund: 2_340,
  ledger: null,
  projects: [],
  catalogue: [],
  score: null,
});

/** The Environment gauge's bar, as its width in percent. */
const fill = (environment: number) => {
  const html = renderToStaticMarkup(h(ColonyGauges, { colony: colony(environment), size: 'tv' }));
  const gauge = html.slice(html.indexOf('data-testid="gauge-environment"'), html.indexOf('data-testid="gauge-prestige"'));
  return Number(gauge.match(/style="width:([\d.]+)%"/)?.[1]);
};

describe('AIR-BANDS-3: the header’s Environment gauge fills to its share of POLLUTION.airMax', () => {
  it('AIR-BANDS-3: air at 100 of 200 fills half the bar, 200 fills it, 0 leaves it empty', () => {
    expect([0, 100, 200].map(fill)).toEqual([0, 50, 100]);
  });
});
