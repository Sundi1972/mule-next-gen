import { COLONY, PRESTIGE } from '@mule/engine';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { topOf } from '../src/grounds/framing';
import { centreOf, extentOf, type GridPlace } from '../src/grounds/layout';
import { pick, type Frame, type GroundsManifest, type ManifestEntry, type PictureKind, type PictureStage, type PlateEntry, type PlateExtent } from '../src/grounds/pick';
import { W } from '../src/grounds/projection';

/**
 * The art manifest is the contract between the pictures WS10 renders and ColonyGrounds, which reads only it (spec §3).
 * These tests read the real manifest the web app serves, so a broken publish or a key the component never asks for
 * fails here rather than as a building that silently falls back to its shape on the TV.
 */
const ART = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/public/art/colony');
const manifest = JSON.parse(readFileSync(join(ART, 'manifest.json'), 'utf8')) as GroundsManifest;
const RULE_1_STAGES: readonly string[] = ['site', 'build1', 'build2', 'standing', 'closed', 'damaged'] satisfies PictureStage[];

const named = Object.entries(manifest.pictures).flatMap(([kind, pictures]) =>
  Object.entries(pictures ?? {})
    .filter(([key]) => key !== 'frame')
    .flatMap(([stage, entry]) => [entry as ManifestEntry].flatMap(({ day, dusk, glow }) => [day, dusk, glow]).flatMap((src) => (src ? [{ kind, stage, src }] : []))),
);
/** The base plates (AM-7), when the manifest carries them: sized like the pictures. */
const plates = Object.values(manifest.plate ?? {}).flatMap(({ day, dusk, glow }) => [day, dusk, glow]).flatMap((src) => (src ? [{ src }] : []));

describe('the colony art manifest (T-AC-2)', () => {
  it('T-AC-2: every picture and plate the manifest names exists at every size it declares', () => {
    expect(named.length).toBeGreaterThan(0);
    const missing = [...named, ...plates].flatMap(({ src }) =>
      manifest.sizes.map((w) => src.replace(/@\d+(\.\w+)$/, `@${w}$1`)).filter((file) => !existsSync(join(ART, file))),
    );
    expect(missing).toEqual([]);
  });

  it('T-AC-2: every stage the manifest keys is a RULE-1 stage, so the grounds can ask for it', () => {
    const strays = named.filter(({ stage }) => !RULE_1_STAGES.includes(stage)).map(({ kind, stage }) => `${kind}.${stage}`);
    expect([...new Set(strays)]).toEqual([]);
  });

  it('T-AC-2: the town hall the grounds draw at the centre resolves to a picture, not its shape', () => {
    const picked = pick('hall', { stage: 'standing', monthsLeft: null, buildMonths: 1 }, 'day', manifest);
    expect(picked.shows).toBe('picture');
  });

  it('T-AC-2: every stage of every kind the manifest carries resolves to a picture in both lights', () => {
    const kinds = Object.keys(manifest.pictures).filter((k) => k !== 'hall') as PictureKind[];
    expect(kinds.length).toBeGreaterThan(0);
    const states = [
      { stage: 'commissioned', monthsLeft: null, buildMonths: 1 },
      { stage: 'building', monthsLeft: 1, buildMonths: 1 },
      { stage: 'standing', monthsLeft: null, buildMonths: 1 },
      { stage: 'closed', monthsLeft: null, buildMonths: 1 },
      { stage: 'damaged', monthsLeft: null, buildMonths: 1 },
    ] as const;
    const unresolved = kinds.flatMap((kind) =>
      states.flatMap((state) =>
        (['day', 'dusk'] as const).filter((light) => pick(kind, state, light, manifest).shows !== 'picture').map((light) => `${kind}/${state.stage}/${light}`),
      ),
    );
    expect(unresolved).toEqual([]);
  });
});

const HALL_CELL = Math.floor(COLONY.grounds.size / 2);

/** Every w × h block on the grounds that leaves the hall's cell free: the blocks the engine can place a building on (RULE-32b). */
function blocksOf({ w, h }: { w: number; h: number }): GridPlace[] {
  const { size } = COLONY.grounds;
  const blocks: GridPlace[] = [];
  for (let y = 0; y + h <= size; y++) {
    for (let x = 0; x + w <= size; x++) {
      const coversHall = x <= HALL_CELL && HALL_CELL < x + w && y <= HALL_CELL && HALL_CELL < y + h;
      if (!coversHall) blocks.push({ x, y, w, h });
    }
  }
  return blocks;
}

/** A place within the hall's ring stands on plate "3" alone, or on plate "5" once another place reaches ring 2 (RULE-4). */
const platesFor = (place: GridPlace): PlateExtent[] => (extentOf([place]) <= 1 ? ['3', '5'] : ['5']);

/** The places a kind is drawn at: the hall at its own cell, a building at every block of its footprint. */
function placesOf(kind: string): GridPlace[] | null {
  if (kind === 'hall') return [{ x: HALL_CELL, y: HALL_CELL, w: 1, h: 1 }];
  const footprint = (PRESTIGE as Partial<Record<string, { footprint: { w: number; h: number } }>>)[kind]?.footprint;
  return footprint ? blocksOf(footprint) : null;
}

/** A plate's top and bottom in scene units, at the pictures' scale, its hall pixel on the hall's centre (as ColonyGrounds draws it). */
function plateSpan({ frame }: PlateEntry, shared: Frame): { top: number; bottom: number } {
  const k = W / shared.place;
  return { top: -frame.hall[1] * k, bottom: (frame.height - frame.hall[1]) * k };
}

/**
 * Every way a picture of a `w×h` kind is cut by a plate it can stand on: its frame's top above the plate's or its
 * bottom below it, at any place, stage and plate RULE-4 can give it. Empty when the manifest carries no plate.
 */
function cutsByPlate(manifest: GroundsManifest, size: '1×1' | '2×2'): string[] {
  const { plate } = manifest;
  if (!plate) return [];
  return Object.entries(manifest.pictures).flatMap(([kind, pictures]) => {
    const places = placesOf(kind);
    if (!places) return [`${kind}: no footprint in PRESTIGE`];
    const frame = pictures?.frame ?? manifest.frame;
    const stages = Object.keys(pictures ?? {}).filter((key) => key !== 'frame');
    return places
      .filter(({ w, h }) => `${w}×${h}` === size)
      .flatMap((place) => {
        const { col, row } = centreOf(place);
        const top = topOf(kind as PictureKind, col, row, manifest);
        const bottom = top + (frame.height * W) / frame.place;
        return platesFor(place).flatMap((extent) => {
          const span = plateSpan(plate[extent], manifest.frame);
          const edges = [top < span.top - 1e-9 && 'top', bottom > span.bottom + 1e-9 && 'bottom'].filter(Boolean);
          return stages.flatMap((stage) => edges.map((edge) => `${kind}/${stage} at (${place.x},${place.y}) on plate ${extent}: ${edge} cut`));
        });
      });
  });
}

describe('the plate frames every picture it carries (T-AC-10)', () => {
  it("T-AC-10: every 2×2 block's tallest picture fits inside plate 5's frame", () => {
    expect(cutsByPlate(manifest, '2×2')).toEqual([]);
  });

  it("T-AC-10: every 1×1 place's picture fits inside each plate RULE-4 can draw under it", () => {
    expect(cutsByPlate(manifest, '1×1')).toEqual([]);
  });
});

describe('the plate-fit check itself, on fixture plates (T-AC-10)', () => {
  const SHARED: Frame = { width: 1600, height: 1600, place: 1293, centre: [800, 1000] };
  const STAGES = { standing: { day: 'd', dusk: 'k', glow: null }, site: { day: 'd', dusk: 'k', glow: null } };
  /** The shipped kinds' frames: the shared one, and the 2×2 kinds' taller ones. */
  const PICTURES: GroundsManifest['pictures'] = {
    hall: { standing: STAGES.standing },
    park: STAGES,
    stadium: { ...STAGES, frame: { width: 3200, height: 2600, place: 1293, centre: [1600, 1900] } },
    spaceport: { ...STAGES, frame: { width: 3200, height: 3500, place: 1293, centre: [1600, 2800] } },
  };
  const PLATE_3: PlateEntry = { day: 'd', dusk: 'k', glow: null, frame: { width: 6144, height: 3456, hall: [3072, 2074] } };
  const withPlate5 = (frame: PlateEntry['frame']): GroundsManifest => ({
    frame: SHARED,
    sizes: [800],
    pictures: PICTURES,
    plate: { '3': PLATE_3, '5': { day: 'd', dusk: 'k', glow: null, frame } },
  });

  it("T-AC-10: a plate 5 too short for the 2×2 kinds at the back blocks fails, naming each cut", () => {
    const cuts = cutsByPlate(withPlate5({ width: 8960, height: 5040, hall: [4480, 2640] }), '2×2');
    expect(cuts).toContain('spaceport/standing at (0,0) on plate 5: top cut');
    expect(cuts).toContain('stadium/site at (0,0) on plate 5: top cut');
    expect(cuts.every((cut) => cut.endsWith(': top cut'))).toBe(true);
  });

  it("T-AC-10: a plate 5 that ends above the nearest 1×1 place's frame bottom fails at the bottom", () => {
    const cuts = cutsByPlate(withPlate5({ width: 10240, height: 5600, hall: [5120, 3800] }), '1×1');
    expect(cuts).toEqual(['park/standing at (4,4) on plate 5: bottom cut', 'park/site at (4,4) on plate 5: bottom cut']);
  });

  it('T-AC-10: a plate 5 tall enough above and below passes for every block and place', () => {
    const tall = withPlate5({ width: 10240, height: 5760, hall: [5120, 3800] });
    expect(cutsByPlate(tall, '2×2')).toEqual([]);
    expect(cutsByPlate(tall, '1×1')).toEqual([]);
  });

  it('T-AC-10: without a plate there is nothing to cut', () => {
    expect(cutsByPlate({ frame: SHARED, sizes: [800], pictures: PICTURES }, '2×2')).toEqual([]);
  });
});
