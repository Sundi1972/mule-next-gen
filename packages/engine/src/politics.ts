/**
 * Colony politics: the Land Baron, elections for Governor and Sheriff, vote
 * weight, the Governor's sales tax and the offices' pay. The only writer of
 * GameState.politics. No randomness: ties break by rule, so a replay needs no extra seed.
 */
import { POLITICS } from './config.js';
import type { Election, GameState, Politics } from './types.js';

/** Politics as it stands before the first planning phase: no offices, no Baron. */
export function newPolitics(): Politics {
  return { governor: null, sheriff: null, termStart: 1, terms: {}, governorRun: null, baron: null, taxAtStart: 0, election: null };
}

/**
 * The politics object of this state, made its own before a write. A what-if
 * copy of the game (cloneForSim) shares the object with the real game, and
 * advancing phases on the copy must never change the real one.
 */
function edit(state: GameState): Politics {
  const p = state.politics!;
  const e = p.election;
  const election: Election | null = e && {
    ...e,
    candidates: { governor: e.candidates.governor.slice(), sheriff: e.candidates.sheriff.slice() },
    ballots: Object.fromEntries(Object.entries(e.ballots).map(([id, ballot]) => [id, { ...ballot }])),
    done: e.done.slice(),
  };
  state.politics = { ...p, terms: { ...p.terms }, governorRun: p.governorRun && { ...p.governorRun }, election };
  return state.politics;
}

/** RULE-5: strictly the most plots wins; a tie keeps the current Baron if they are in it, else nobody. */
function landBaron(state: GameState, current: string | null): string | null {
  const plots = new Map(state.players.map((p) => [p.id, 0]));
  for (const tile of state.tiles) if (tile.owner && plots.has(tile.owner)) plots.set(tile.owner, plots.get(tile.owner)! + 1);
  const most = Math.max(...plots.values());
  if (most === 0) return null;
  const top = [...plots].filter(([, n]) => n === most).map(([id]) => id);
  if (top.length === 1) return top[0]!;
  return current !== null && top.includes(current) ? current : null;
}

/** When planning opens: fixes the month's Land Baron and starting tax, and opens the election in an election month. */
export function openPlanning(state: GameState): void {
  if (!state.politics) return;
  const p = edit(state);
  p.baron = landBaron(state, p.baron);
  p.taxAtStart = state.treasury.salesTax;
  p.election = POLITICS.electionMonths.includes(state.month)
    ? { stage: 'nominate', clockMs: POLITICS.nominateMs, candidates: { governor: [], sheriff: [] }, ballots: {}, done: [], result: null }
    : null;
}
