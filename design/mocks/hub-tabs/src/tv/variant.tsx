import { createContext, useContext, useState, type ReactNode } from 'react';

/*
 * The planning TV's two placements, for the TV-FIT comparison (both measured: TV_FIT in measured.ts):
 *   A: as the approved mocks place them: the budget line and the break banner under the Governor's promise, in the
 *      header column, which takes its height from the body;
 *   B: the budget line on the promise's own row, and the break banner first in the side column, beside the map, where
 *      the news gives way before the body scales (the overrule call's place, the budget mock's own reasoning).
 * MOCK PLUMBING: the build has one placement, whichever WS4 / the PM rule.
 */
export type TvVariant = 'a' | 'b';

const Ctx = createContext<{ variant: TvVariant; set(v: TvVariant): void }>({ variant: 'a', set: () => {} });

export function TvVariantProvider({ initial = 'a', children }: { initial?: TvVariant; children: ReactNode }) {
  const [variant, set] = useState<TvVariant>(initial);
  return <Ctx.Provider value={{ variant, set }}>{children}</Ctx.Provider>;
}

export const useTvVariant = () => useContext(Ctx);
