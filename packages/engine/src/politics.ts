/**
 * Colony politics: the Land Baron, elections for Governor and Sheriff, vote
 * weight, the Governor's sales tax and the offices' pay. The only writer of
 * GameState.politics. No randomness: ties break by rule, so a replay needs no extra seed.
 */
import { POLITICS } from './config.js';
import { player } from './game.js';
import type { Election, GameState, Office, OfficeResult, Politics } from './types.js';

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

function plotsOf(state: GameState, id: string): number {
  return state.tiles.filter((t) => t.owner === id).length;
}

/** RULE-5: strictly the most plots wins; a tie keeps the current Baron if they are in it, else nobody. */
function landBaron(state: GameState, current: string | null): string | null {
  const plots = new Map(state.players.map((p) => [p.id, plotsOf(state, p.id)]));
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

export interface VoteWeight {
  total: number;
  parts: { base: number; land: number; reputation: number; baron: number; taxes: number };
}

/** RULE-4: a player's votes, part by part. Derived from the state on every call. */
export function voteWeight(state: GameState, id: string): VoteWeight {
  const { plotsPerVote, repHigh, repLow, taxPerVote, taxCap } = POLITICS.weight;
  const { reputation } = player(state, id);
  const parts = {
    base: 1,
    land: Math.floor(plotsOf(state, id) / plotsPerVote),
    reputation: reputation >= repHigh ? 1 : reputation < repLow ? -1 : 0,
    baron: state.politics?.baron === id ? 1 : 0,
    taxes: Math.min(taxCap, Math.floor((state.treasury.paid[id] ?? 0) / taxPerVote)),
  };
  return { total: parts.base + parts.land + parts.reputation + parts.baron + parts.taxes, parts };
}

/** RULE-2: runs for an office, moving any candidacy for the other one; null withdraws. Only in nominate. */
export function runFor(state: GameState, id: string, office: Office | null): void {
  throw new Error('NotImplemented: runFor');
}

/** Casts, changes or (with null) clears a secret ballot for a contested office. Only in the ballot stage. */
export function castVote(state: GameState, id: string, office: Office, candidate: string | null): void {
  throw new Error('NotImplemented: castVote');
}

/** Done for the current stage (or undone); every player Done ends the stage at the next step. */
export function electionDone(state: GameState, id: string, done = true): void {
  throw new Error('NotImplemented: electionDone');
}

/** Advances the election by dt ms of game time. Returns the result in the step the ballot closes. */
export function stepElection(state: GameState, dt: number): Record<Office, OfficeResult> | null {
  throw new Error('NotImplemented: stepElection');
}
