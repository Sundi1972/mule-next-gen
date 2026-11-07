/** Which picture a grounds place shows (spec RULE-1), and the art manifest it is picked from (spec §3). */
import type { ObjectKind } from '../components/ObjectGlyph';

export type PictureStage = 'site' | 'build1' | 'build2' | 'standing' | 'closed' | 'damaged';
export type Light = 'day' | 'dusk';
export type PictureKind = ObjectKind | 'hall';

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

/** A base plate's camera frame, at the pictures' scale: its size and the hall's centre pixel. */
export interface PlateFrame {
  width: number;
  height: number;
  hall: [number, number];
}

/** One base plate (spec AM-7): the ground, paths, planting and vignette under every building, in each light. */
export interface PlateEntry extends ManifestEntry {
  frame: PlateFrame;
}

/** RULE-4's extent as a plate key: "3" covers the hall's ring, "5" the whole grid. */
export type PlateExtent = '3' | '5';

/** `apps/web/public/art/colony/manifest.json`. Picture and plate paths are relative to the art folder. */
export interface GroundsManifest {
  frame: Frame;
  pictures: Partial<Record<string, KindPictures>>;
  sizes: number[];
  /** Without it the grounds draw their SVG ground. */
  plate?: Record<PlateExtent, PlateEntry>;
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
