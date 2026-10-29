import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
/** The device's media query, or null where there is none: a server render, or a browser without matchMedia. */
const media = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null);

/** The device's reduced-motion setting, followed live: the show's `reduced` (HC-6). Off where it cannot be read. */
export function useEventReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const q = media();
      q?.addEventListener('change', onChange);
      return () => q?.removeEventListener('change', onChange);
    },
    () => media()?.matches ?? false,
    () => false,
  );
}
