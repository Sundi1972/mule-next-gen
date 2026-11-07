/** The colony grounds as the screens mount them, with the art manifest fetched once for the whole app. */
import { ART_BASE, ColonyGrounds, type ColonyGroundsProps, type GroundsManifest } from '@mule/ui';
import { useSyncExternalStore } from 'react';

let manifest: GroundsManifest | null = null;
let loading: Promise<GroundsManifest | null> | null = null;
const listeners = new Set<() => void>();

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function isFrame(f: unknown): boolean {
  return isObject(f) && isNumber(f.width) && isNumber(f.height) && isNumber(f.place) && Array.isArray(f.centre) && f.centre.length === 2 && f.centre.every(isNumber);
}

function isEntry(e: unknown): boolean {
  return isObject(e) && typeof e.day === 'string' && typeof e.dusk === 'string' && (e.glow === null || typeof e.glow === 'string');
}

function isPlateFrame(f: unknown): boolean {
  return isObject(f) && isNumber(f.width) && isNumber(f.height) && Array.isArray(f.hall) && f.hall.length === 2 && f.hall.every(isNumber);
}

/** Both extents' plates and nothing else, each with its pictures and its frame. */
function isPlate(p: unknown): boolean {
  return isObject(p) && Object.keys(p).sort().join() === '3,5' && Object.values(p).every((e) => isEntry(e) && isPlateFrame((e as Record<string, unknown>).frame));
}

/** A bad plate costs the plate alone: the pictures stand on the SVG ground instead (HC-3). */
function withSoundPlate(m: GroundsManifest): GroundsManifest {
  if (m.plate === undefined || isPlate(m.plate)) return m;
  const { plate, ...pictures } = m;
  return pictures;
}

/** Every part the grounds compute with: a bad frame draws blank places, a missing picture name throws (HC-3). */
function isManifest(m: unknown): m is GroundsManifest {
  if (!isObject(m) || !isFrame(m.frame) || !Array.isArray(m.sizes) || !m.sizes.every(isNumber) || !isObject(m.pictures)) return false;
  return Object.values(m.pictures).every(
    (kind) => isObject(kind) && Object.entries(kind).every(([key, value]) => (key === 'frame' ? isFrame(value) : isEntry(value))),
  );
}

/** Fetches the manifest once; resolves null, never rejects, when it is missing or malformed (HC-3). */
export function loadGroundsManifest(): Promise<GroundsManifest | null> {
  loading ??= fetch(`${ART_BASE}manifest.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((m: unknown) => (isManifest(m) ? withSoundPlate(m) : null))
    .catch(() => null)
    .then((m) => {
      manifest = m;
      // A failed load is tried again at the next mount, so one dropped request does not leave the shapes all game.
      if (!m) loading = null;
      for (const fn of listeners) fn();
      return m;
    });
  return loading;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  void loadGroundsManifest();
  return () => listeners.delete(fn);
}

const current = () => manifest;

/** `ColonyGrounds` with the app's manifest; its SVG shapes until the manifest arrives. */
export function Grounds(props: Omit<ColonyGroundsProps, 'manifest'>) {
  return <ColonyGrounds {...props} manifest={useSyncExternalStore(subscribe, current, current)} />;
}
