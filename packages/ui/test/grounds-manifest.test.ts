import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pick, type GroundsManifest, type ManifestEntry, type PictureKind, type PictureStage } from '../src/grounds/pick';

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
