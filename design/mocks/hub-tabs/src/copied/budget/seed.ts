// Copied from design/mocks/politics-budget/src/seed.ts (approved/awaiting-pick mock, 7–8 Nov); changes for the tabs are marked TABS:.
import { createContext } from 'react';
import type { Shares } from '../../fixture';

/**
 * MOCK PLUMBING: lets the index open the Governor's budget mid-edit (a draft not yet Set), so that state has a link of
 * its own. The build drops it: a draft starts at the budget in force.
 */
export const DraftSeed = createContext<Shares | null>(null);
