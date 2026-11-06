/** The colony grounds as the screens mount them, with the art manifest fetched once for the whole app. */
import { ART_BASE, ColonyGrounds, type ColonyGroundsProps, type GroundsManifest } from '@mule/ui';
import { useSyncExternalStore } from 'react';

let manifest: GroundsManifest | null = null;
let loading: Promise<GroundsManifest | null> | null = null;
const listeners = new Set<() => void>();

function isManifest(m: unknown): m is GroundsManifest {
  const { frame, pictures, sizes } = (m ?? {}) as Partial<Record<keyof GroundsManifest, unknown>>;
  return typeof frame === 'object' && frame !== null && typeof pictures === 'object' && pictures !== null && Array.isArray(sizes);
}

/** Fetches the manifest once; resolves null, never rejects, when it is missing or malformed (HC-3). */
export function loadGroundsManifest(): Promise<GroundsManifest | null> {
  loading ??= fetch(`${ART_BASE}manifest.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((m: unknown) => (isManifest(m) ? m : null))
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
