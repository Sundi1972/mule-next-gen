/** Which picture a grounds place shows (spec RULE-1), and the art manifest it is picked from (spec §3). */
import type { PrestigeId } from '@mule/engine';

export type PictureStage = 'site' | 'build1' | 'build2' | 'standing' | 'closed' | 'damaged';
export type Light = 'day' | 'dusk';
export type PictureKind = PrestigeId | 'hall';

export interface ManifestEntry {
  day: string;
  dusk: string;
  glow: string | null;
}

/** A picture's camera frame: a place is `place` px wide, its centre at pixel `centre`. */
export interface Frame {
  width: number;
  height: number;
  place: number;
  centre: [number, number];
}

/** A kind's pictures by stage; a kind taller than the shared frame carries its own (spec AM-1). */
export type KindPictures = Partial<Record<PictureStage, ManifestEntry>> & { frame?: Frame };

/** `apps/web/public/art/colony/manifest.json`. Picture paths are relative to the art folder. */
export interface GroundsManifest {
  frame: Frame;
  pictures: Partial<Record<string, KindPictures>>;
  sizes: number[];
}

/** A place's state, as the colony view carries it. */
export interface PlaceState {
  stage: 'commissioned' | 'building' | 'standing' | 'closed' | 'damaged';
  monthsLeft: number | null;
  buildMonths: number;
}

export type Picked = { shows: 'picture'; stage: PictureStage; src: string } | { shows: 'shape'; stage: PictureStage };

export function pictureStage({ stage, monthsLeft, buildMonths }: PlaceState): PictureStage {
  if (stage === 'commissioned') return 'site';
  if (stage === 'building') {
    if (buildMonths <= 2 || monthsLeft === null) return 'build1';
    return monthsLeft > buildMonths / 2 ? 'build1' : 'build2';
  }
  return stage;
}

/** The picture for this place in this light, or the SVG shape when the manifest has none (HC-3). */
export function pick(kind: PictureKind, place: PlaceState, light: Light, manifest: GroundsManifest | null): Picked {
  const stage = pictureStage(place);
  const entry = manifest?.pictures[kind]?.[stage];
  return entry ? { shows: 'picture', stage, src: entry[light] } : { shows: 'shape', stage };
}
