import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AirGauge, airBandStyle } from '../src/components/AirGauge';

// A colony whose air runs to 200, its bands moved: the gauge must follow config, never its own copy (PM ruling A, 6 Nov).
vi.mock('@mule/engine', async (actual) => {
  const engine = await actual<typeof import('@mule/engine')>();
  return {
    ...engine,
    POLLUTION: {
      ...engine.POLLUTION,
      airMax: 200,
      bands: [
        { name: 'clean', from: 0, sickens: false },
        { name: 'smoggy', from: 50, sickens: true },
        { name: 'toxic', from: 120, sickens: true },
        { name: 'collapse', from: 170, sickens: true },
      ],
    },
  };
});

describe('AIR-BANDS: the air gauge draws its bands from POLLUTION, not a copy of its numbers', () => {
  it('AIR-BANDS-1: a level takes the band config puts it in, edge by edge', () => {
    const at = (level: number) => airBandStyle(level).name;
    expect([0, 49, 50, 119, 120, 169, 170, 200].map(at)).toEqual(['clean', 'clean', 'smoggy', 'smoggy', 'toxic', 'toxic', 'collapse', 'collapse']);
    // The server's band name, when sent, still wins over the level.
    expect(airBandStyle(10, 'toxic').name).toBe('toxic');
  });

  it('AIR-BANDS-2: the gauge says the band config gives, marks each band edge, and fills to its share of airMax', () => {
    const html = renderToStaticMarkup(h(AirGauge, { level: 100 }));
    expect(html).toContain('100 · SMOGGY');
    const ticks = [...html.matchAll(/w-px[^"]*" style="left:([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(ticks, 'one mark at each band edge past clean, as a share of 200').toEqual([25, 60, 85]);
    expect(html).toMatch(/rounded-full bg-warn" style="width:50%"/);
  });
});
