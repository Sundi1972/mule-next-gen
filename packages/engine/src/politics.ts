/**
 * Colony politics: the Land Baron, elections for Governor and Sheriff, vote
 * weight, the Governor's sales tax and the offices' pay. The only writer of
 * GameState.politics. No randomness: ties break by rule, so a replay needs no extra seed.
 */
import { POLITICS } from './config.js';
import { RuleError } from './errors.js';
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

const OFFICES: readonly Office[] = ['governor', 'sheriff'];

type ElectionResult = Record<Office, OfficeResult>;

/** This month's election while planning runs; a RuleError when there is none. */
function liveElection(state: GameState, id: string): Election {
  player(state, id);
  const election = state.politics?.election;
  if (state.phase !== 'planning' || !election) throw new RuleError('No election this month');
  return election;
}

function contested(election: Election, office: Office): boolean {
  return election.candidates[office].length >= 2;
}

/** RULE-2: runs for an office, moving any candidacy for the other one; null withdraws. Only in nominate. */
export function runFor(state: GameState, id: string, office: Office | null): void {
  const election = liveElection(state, id);
  if (election.stage !== 'nominate') throw new RuleError('Candidates are closed');
  const run = state.politics!.governorRun;
  if (office === 'governor' && run?.id === id && run.terms >= 2) throw new RuleError('Two Governor terms in a row');
  if (office && election.candidates[office].includes(id)) return;
  const { candidates } = edit(state).election!;
  for (const o of OFFICES) candidates[o] = candidates[o].filter((c) => c !== id);
  if (office) candidates[office].push(id);
}

/** Casts, changes or (with null) clears a secret ballot for a contested office. Only in the ballot stage. */
export function castVote(state: GameState, id: string, office: Office, candidate: string | null): void {
  const election = liveElection(state, id);
  if (election.stage === 'nominate') throw new RuleError('The ballot is not open yet');
  if (election.stage !== 'ballot') throw new RuleError('The ballot is closed');
  if (!contested(election, office)) throw new RuleError('There is no vote for this office');
  if (candidate !== null && !election.candidates[office].includes(candidate)) throw new RuleError('Not a candidate');
  const { ballots } = edit(state).election!;
  const ballot = (ballots[id] ??= {});
  if (candidate === null) delete ballot[office];
  else ballot[office] = candidate;
}

/** Done for the current stage (or undone); every player Done ends the stage at the next step. */
export function electionDone(state: GameState, id: string, done = true): void {
  const election = state.politics?.election;
  if (state.phase !== 'planning' || !election || (election.stage !== 'nominate' && election.stage !== 'ballot')) return;
  if (election.done.includes(id) === done) return;
  const e = edit(state).election!;
  e.done = done ? [...e.done, id] : e.done.filter((d) => d !== id);
}

/** Advances the election by dt ms of game time. Returns the result in the step the ballot closes. */
export function stepElection(state: GameState, dt: number): ElectionResult | null {
  if (state.phase !== 'planning' || !state.politics?.election || state.politics.election.stage === 'over') return null;
  const politics = edit(state);
  const election = politics.election!;
  election.clockMs -= dt;
  if (election.stage === 'reveal') {
    if (election.clockMs <= 0) takeOffice(state, politics);
    return null;
  }
  const allDone = state.players.every((p) => election.done.includes(p.id));
  if (election.clockMs > 0 && !allDone) return null;
  if (election.stage === 'nominate' && OFFICES.some((o) => contested(election, o))) {
    Object.assign(election, { stage: 'ballot', clockMs: POLITICS.ballotMs, done: [] });
    return null;
  }
  return closeBallot(state, election);
}

/** AM-1: planning is ending: an election still open closes now, from the ballots cast so far, and its winners take office. */
export function closeElection(state: GameState): void {
  if (!state.politics?.election || state.politics.election.stage === 'over') return;
  const politics = edit(state);
  if (politics.election!.stage !== 'reveal') closeBallot(state, politics.election!);
  takeOffice(state, politics);
}

function closeBallot(state: GameState, election: Election): ElectionResult {
  const governor = decide(state, election, 'governor', null);
  // Decided after the Governor and never the Governor, so one player never holds both offices.
  const sheriff = decide(state, election, 'sheriff', governor.winner);
  Object.assign(election, { stage: 'reveal', clockMs: POLITICS.revealMs, done: [], result: { governor, sheriff } });
  return election.result!;
}

function takeOffice(state: GameState, politics: Politics): void {
  const election = politics.election!;
  const { governor, sheriff } = election.result!;
  election.stage = 'over';
  politics.governor = governor.winner;
  politics.sheriff = sheriff.winner;
  politics.termStart = state.month;
  for (const id of [governor.winner, sheriff.winner]) politics.terms[id] = (politics.terms[id] ?? 0) + 1;
  const run = politics.governorRun;
  politics.governorRun = { id: governor.winner, terms: run?.id === governor.winner ? run.terms + 1 : 1 };
}

/** RULE-3 for one office. Weights are taken now, as the ballot closes. */
function decide(state: GameState, election: Election, office: Office, governor: string | null): OfficeResult {
  const seat = (id: string) => state.players.findIndex((p) => p.id === id);
  const candidates = election.candidates[office].filter((c) => c !== governor);
  if (candidates.length === 0) {
    const others = state.players.filter((p) => p.id !== governor);
    const richest = others.reduce((best, p) => (p.money > best.money ? p : best));
    return { winner: richest.id, how: 'appointed', tallies: [] };
  }
  const tallies = candidates.map((id) => ({ id, votes: 0 }));
  for (const [voter, ballot] of Object.entries(election.ballots)) {
    const line = tallies.find((t) => t.id === ballot[office]);
    if (line) line.votes += voteWeight(state, voter).total;
  }
  tallies.sort((a, b) => b.votes - a.votes || seat(a.id) - seat(b.id));
  if (tallies.length === 1) return { winner: tallies[0]!.id, how: 'unopposed', tallies };
  const tied = tallies.filter((t) => t.votes === tallies[0]!.votes).map((t) => t.id);
  if (tied.length === 1) return { winner: tied[0]!, how: 'votes', tallies };
  const baron = state.politics!.baron;
  const baronPick = baron === null ? undefined : election.ballots[baron]?.[office];
  if (baronPick !== undefined && tied.includes(baronPick)) return { winner: baronPick, how: 'baron', tallies };
  const most = tied.reduce((best, id) => (plotsOf(state, id) > plotsOf(state, best) ? id : best));
  return { winner: most, how: 'tieRule', tallies };
}

/** RULE-6: the Governor sets the sales tax in whole percent, within maxStep of the month's starting rate. */
export function setSalesTax(state: GameState, id: string, percent: number): void {
  player(state, id);
  const politics = state.politics;
  if (!politics) throw new RuleError('This game plays without a Governor');
  if (state.phase !== 'planning') throw new RuleError('The tax is set in planning');
  if (politics.election && politics.election.stage !== 'over') throw new RuleError('Wait for the election to end');
  if (politics.governor !== id) throw new RuleError('Only the Governor sets the tax');
  const { min, max, maxStep } = POLITICS.tax;
  const start = Math.round(politics.taxAtStart * 100);
  const low = Math.max(min, start - maxStep);
  const high = Math.min(max, start + maxStep);
  if (!Number.isInteger(percent) || percent < low || percent > high) throw new RuleError(`The tax can be ${low}% to ${high}% this month`);
  state.treasury.salesTax = percent / 100;
}

/** RULE-7, at upkeep: the Governor's pay, then the Sheriff's, each only as far as the colony fund reaches. */
export function payOffices(state: GameState): void {
  if (!state.politics) return;
  const { governor, sheriff } = state.politics;
  for (const [id, pay] of [[governor, POLITICS.pay.governor], [sheriff, POLITICS.pay.sheriff]] as const) {
    if (id === null) continue;
    const paid = Math.max(0, Math.min(state.treasury.money, pay));
    state.treasury.money -= paid;
    player(state, id).money += paid;
  }
}

/** RULE-7: the final score's office line, POLITICS.termScore per term served. */
export function officeScore(state: GameState, id: string): number {
  return POLITICS.termScore * (state.politics?.terms[id] ?? 0);
}
