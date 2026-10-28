/**
 * Colony politics: the Land Baron, elections for the offices in POLITICS.offices,
 * vote weight, the Governor's sales tax and the offices' pay. The only writer of
 * GameState.politics. A tie nothing else breaks is drawn by lot on its own seeded
 * stream, so a replay from the seed draws the same and no other draw moves.
 */
import { POLITICS } from './config.js';
import { RuleError } from './errors.js';
import { player } from './game.js';
import { createRng } from './rng.js';
import { PERCENT } from './units.js';
import type { CanRun, CeremonyStep, Election, ElectionResult, GameState, Office, OfficeResult, Politics, TaxPromise } from './types.js';

/** Read-only all the way down: an election read before edit() may be shared with a what-if copy. */
type Shared<T> = { readonly [K in keyof T]: T[K] extends object ? Shared<T[K]> : T[K] };

const TITLE: Record<Office, string> = { governor: 'Governor', sheriff: 'Sheriff' };

/** Nobody running for anything: the record has a list per Office, POLITICS.offices says which are elected. */
function noCandidates(): Record<Office, string[]> {
  return { governor: [], sheriff: [] };
}

/** Politics as it stands before the first planning phase: no offices, no Baron, nobody running. */
export function newPolitics(): Politics {
  return { governor: null, sheriff: null, termStart: 1, terms: {}, governorRun: null, baron: null, taxAtStart: 0, candidates: noCandidates(), promises: {}, election: null };
}

/** A what-if copy may share politics, so every write copies it first. */
function edit(state: GameState): Politics {
  state.politics = structuredClone(state.politics!);
  return state.politics;
}

function currentElection(state: GameState): Shared<Election> | null {
  return state.politics?.election ?? null;
}

/** Plots a player owns: the count the Land Baron, vote weight and the tie rule go by. */
export function plotsOwned(state: GameState, playerId: string): number {
  return state.tiles.filter((t) => t.owner === playerId).length;
}

/** Strictly the most plots wins; a tie keeps the current Baron if they are in it, else nobody. See WS7 spec RULE-5. */
function landBaron(state: GameState, current: string | null): string | null {
  const plots = new Map(state.players.map((p) => [p.id, plotsOwned(state, p.id)]));
  const most = Math.max(...plots.values());
  if (most === 0) return null;
  const top = [...plots].filter(([, n]) => n === most).map(([id]) => id);
  if (top.length === 1) return top[0]!;
  return current !== null && top.includes(current) ? current : null;
}

/** When planning opens: fixes the month's Land Baron and starting tax, and opens the election in an election month. See WS7 spec RULE-5, RULE-61. */
export function openPlanning(state: GameState): void {
  if (!state.politics) return;
  const p = edit(state);
  p.baron = landBaron(state, p.baron);
  p.taxAtStart = state.treasury.salesTax;
  p.election = POLITICS.electionMonths.includes(state.month)
    ? { stage: 'announce', ceremony: null, candidates: noCandidates(), promises: {}, ballots: {}, done: [], result: null }
    : null;
}

/** The next election month after this one, or null if the game ends first. See WS7 spec RULE-1. */
export function nextElectionMonth(state: GameState): number | null {
  return POLITICS.electionMonths.find((m) => m > state.month && m <= state.maxMonths) ?? null;
}

export interface VoteWeight {
  total: number;
  parts: { base: number; land: number; reputation: number; baron: number; taxes: number };
}

/** A player's votes, part by part, derived from the state on every call. See WS7 spec RULE-4. */
export function voteWeight(state: GameState, playerId: string): VoteWeight {
  const { base, plotsPerVote, repHigh, repLow, repVotes, baronVotes, taxPerVote, taxCap } = POLITICS.weight;
  const { reputation } = player(state, playerId);
  const parts = {
    base,
    land: Math.floor(plotsOwned(state, playerId) / plotsPerVote),
    reputation: reputation >= repHigh ? repVotes : reputation < repLow ? -repVotes : 0,
    baron: state.politics?.baron === playerId ? baronVotes : 0,
    taxes: Math.min(taxCap, Math.floor((state.treasury.paid[playerId] ?? 0) / taxPerVote)),
  };
  return { total: parts.base + parts.land + parts.reputation + parts.baron + parts.taxes, parts };
}

/** This month's election while planning runs; a RuleError when there is none. */
function liveElection(state: GameState): Shared<Election> {
  const election = currentElection(state);
  if (state.phase !== 'planning' || !election) throw new RuleError('No election this month');
  return election;
}

function contested(election: Shared<Election>, office: Office): boolean {
  return election.candidates[office].length > 1;
}

function contestedOffices(election: Shared<Election>): Office[] {
  return POLITICS.offices.filter((o) => contested(election, o));
}

/** True from the ballot until the result: the candidacy is the election's then. */
function candidacyClosed(state: GameState): boolean {
  const stage = currentElection(state)?.stage;
  return stage === 'ballot' || stage === 'ceremony';
}

/** Per office: true, or why the player may not run now. Running for the other office is no refusal. See WS7 spec RULE-60. */
export function canRun(state: GameState, playerId: string): Record<Office, CanRun> {
  const { id } = player(state, playerId);
  if (state.phase !== 'planning' || !state.politics || candidacyClosed(state)) return { governor: 'closed', sheriff: 'closed' };
  const run = state.politics.governorRun;
  const termLimit = run?.id === id && run.terms >= POLITICS.maxGovernorTermsInRow;
  const may = (office: Office): CanRun => (!POLITICS.offices.includes(office) ? 'notElected' : office === 'governor' && termLimit ? 'termLimit' : true);
  return { governor: may('governor'), sheriff: may('sheriff') };
}

function refusal(why: Exclude<CanRun, true>, office: Office | null): string {
  if (why === 'notElected') return `The ${TITLE[office!]} is not elected yet`;
  return why === 'closed' ? 'Candidates are closed until the result' : `${POLITICS.maxGovernorTermsInRow} Governor terms in a row`;
}

/** The promise a run carries (null for Sheriff), rebuilt in its closed shape so nothing else rides along. See WS7 spec RULE-10. */
function checkPromise(office: Office, promise: TaxPromise | undefined): TaxPromise | null {
  const { min, max } = POLITICS.tax;
  if (office === 'sheriff') {
    if (promise) throw new RuleError('Sheriff candidates make no promise yet');
    return null;
  }
  switch (promise?.kind) {
    case 'lower':
    case 'hold':
      return { kind: promise.kind };
    case 'cap':
      if (!Number.isInteger(promise.percent) || promise.percent < min || promise.percent > max) throw new RuleError(`A tax promise is ${min}% to ${max}%`);
      return { kind: 'cap', percent: promise.percent };
    default:
      // None, or a kind not on RULE-10's list: callers other than the server skip its shape check.
      throw new RuleError('Pick a promise to run for Governor');
  }
}

/**
 * Runs for an office in the next election, moving any candidacy for the other one; null withdraws. In any planning
 * phase until the ballot opens. A Governor run carries a promise, which goes wherever the candidacy goes. See WS7 spec RULE-60, RULE-10.
 */
export function runFor(state: GameState, playerId: string, office: Office | null, promise?: TaxPromise): void {
  if (!state.politics) throw new RuleError('This game plays without a Governor');
  if (state.phase !== 'planning') throw new RuleError('You can run for office in planning');
  const allowed = canRun(state, playerId);
  const why = office === null ? (candidacyClosed(state) ? 'closed' : true) : allowed[office];
  if (why !== true) throw new RuleError(refusal(why, office));
  const carried = office ? checkPromise(office, promise) : null;
  const p = edit(state);
  // Running again for the same office keeps the place in the list.
  if (!office || !p.candidates[office].includes(playerId)) {
    for (const o of POLITICS.offices) p.candidates[o] = p.candidates[o].filter((c) => c !== playerId);
    if (office) p.candidates[office].push(playerId);
  }
  delete p.promises[playerId];
  if (carried) p.promises[playerId] = carried;
}

/** Casts, changes or (with null) clears a secret ballot for a contested office. Only in the ballot stage. */
export function castVote(state: GameState, voterId: string, office: Office, candidate: string | null): void {
  const voter = player(state, voterId);
  const election = liveElection(state);
  if (election.stage === 'announce') throw new RuleError('The ballot is not open yet');
  if (election.stage !== 'ballot') throw new RuleError('The ballot is closed');
  if (!contested(election, office)) throw new RuleError('There is no vote for this office');
  if (candidate !== null && !election.candidates[office].includes(candidate)) throw new RuleError('Not a candidate');
  const { ballots } = edit(state).election!;
  const ballot = (ballots[voter.id] ??= {});
  if (candidate === null) delete ballot[office];
  else ballot[office] = candidate;
  // An empty entry would still show the voter among those who have voted.
  if (Object.keys(ballot).length === 0) delete ballots[voter.id];
}

/** Presses (or takes back) Done for announce or the ballot; every player Done ends the stage at the next step. */
export function electionDone(state: GameState, playerId: string, done = true): void {
  const election = currentElection(state);
  if (state.phase !== 'planning' || !election || (election.stage !== 'announce' && election.stage !== 'ballot')) return;
  if (election.done.includes(playerId) === done) return;
  const e = edit(state).election!;
  e.done = done ? [...e.done, playerId] : e.done.filter((d) => d !== playerId);
}

/**
 * Whether the player is Done in announce or the ballot: they pressed Done, or in the ballot their ballot names a
 * candidate for every contested office. False in any other stage. See WS7 spec RULE-61.
 */
export function isElectionDone(state: GameState, playerId: string): boolean {
  const election = currentElection(state);
  if (state.phase !== 'planning' || !election || (election.stage !== 'announce' && election.stage !== 'ballot')) return false;
  if (election.done.includes(playerId)) return true;
  const ballot = election.ballots[playerId];
  return election.stage === 'ballot' && contestedOffices(election).every((o) => ballot?.[o] !== undefined);
}

/**
 * Advances the election by dt ms of game time; only the ceremony uses it. Announce and the ballot end at the step
 * after every player is Done. Returns the result in the step the ballot closes. See WS7 spec RULE-61, RULE-62.
 */
export function stepElection(state: GameState, dt: number): ElectionResult | null {
  const live = currentElection(state);
  if (state.phase !== 'planning' || !live || live.stage === 'over') return null;
  if (live.stage === 'ceremony') {
    stepCeremony(state, dt);
    return null;
  }
  if (!state.players.every((p) => isElectionDone(state, p.id))) return null;
  const politics = edit(state);
  if (politics.election!.stage === 'announce') {
    openBallot(politics);
    if (contestedOffices(politics.election!).length > 0) return null;
  }
  return closeBallot(state, politics.election!);
}

/** The candidacy becomes the election's, and Politics' list starts empty for the next one. */
function openBallot(politics: Politics): void {
  Object.assign(politics.election!, { stage: 'ballot', candidates: politics.candidates, promises: politics.promises, done: [] });
  politics.candidates = noCandidates();
  politics.promises = {};
}

/** How long a ceremony step shows. See WS7 spec RULE-62. */
export function ceremonyStepMs(step: CeremonyStep): number {
  return POLITICS.ceremony[`${step}Ms`];
}

/** The step after `at`, or null after the last office's winner. An office with fewer than two candidates has no bars. */
function nextStep(result: ElectionResult, at: { office: Office; step: CeremonyStep }): { office: Office; step: CeremonyStep } | null {
  if (at.step === 'intro') return { office: at.office, step: (result[at.office]?.tallies.length ?? 0) > 1 ? 'bars' : 'winner' };
  if (at.step === 'bars') return { office: at.office, step: 'winner' };
  const next = POLITICS.offices[POLITICS.offices.indexOf(at.office) + 1];
  return next ? { office: next, step: 'intro' } : null;
}

function stepCeremony(state: GameState, dt: number): void {
  const politics = edit(state);
  const election = politics.election!;
  const ceremony = election.ceremony!;
  ceremony.clockMs -= dt;
  if (ceremony.clockMs > 0) return;
  const next = nextStep(election.result!, ceremony);
  if (next) election.ceremony = { ...next, clockMs: ceremonyStepMs(next.step) };
  else takeOffice(state, politics);
}

/**
 * Planning is ending: an election still open closes now, from the candidacy and
 * ballots so far, and its winners take office. Returns the result it fixed, or
 * null if there was nothing open or the result was already fixed. See WS7 spec RULE-61.
 */
export function closeElection(state: GameState): ElectionResult | null {
  const live = currentElection(state);
  if (!live || live.stage === 'over') return null;
  const politics = edit(state);
  if (politics.election!.stage === 'announce') openBallot(politics);
  const result = politics.election!.stage === 'ceremony' ? null : closeBallot(state, politics.election!);
  takeOffice(state, politics);
  return result;
}

/** Fixes every office's result, in POLITICS.offices order, and starts the ceremony with the first office. */
function closeBallot(state: GameState, election: Election): ElectionResult {
  const result: ElectionResult = {};
  const seated: string[] = [];
  for (const office of POLITICS.offices) {
    // Decided in order and never someone already seated, so one player never holds two offices.
    const decided = decide(state, election, office, seated);
    result[office] = decided;
    seated.push(decided.winner);
  }
  const first = POLITICS.offices[0]!;
  Object.assign(election, { stage: 'ceremony', ceremony: { office: first, step: 'intro', clockMs: ceremonyStepMs('intro') }, done: [], result });
  return result;
}

function takeOffice(state: GameState, politics: Politics): void {
  const election = politics.election!;
  const result = election.result!;
  Object.assign(election, { stage: 'over', ceremony: null });
  politics.termStart = state.month;
  for (const office of POLITICS.offices) {
    const winner = result[office]?.winner;
    if (winner === undefined) continue;
    politics[office] = winner;
    politics.terms[winner] = (politics.terms[winner] ?? 0) + 1;
  }
  const governor = result.governor?.winner;
  if (governor === undefined) return;
  const run = politics.governorRun;
  politics.governorRun = { id: governor, terms: run?.id === governor ? run.terms + 1 : 1 };
}

/** The winner of one office, with weights taken now, as the ballot closes. See WS7 spec RULE-3. */
function decide(state: GameState, election: Shared<Election>, office: Office, seated: readonly string[]): OfficeResult {
  const seat = (id: string) => state.players.findIndex((p) => p.id === id);
  const candidates = election.candidates[office].filter((c) => !seated.includes(c));
  if (candidates.length === 0) return { winner: appointee(state, election, office, seated), how: 'appointed', tallies: [] };
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
  const most = Math.max(...tied.map((id) => plotsOwned(state, id)));
  const landed = tied.filter((id) => plotsOwned(state, id) === most);
  if (landed.length === 1) return { winner: landed[0]!, how: 'land', tallies };
  return { winner: drawLot(state, office, landed), how: 'lot', tallies };
}

/**
 * The last resort among players still tied: a draw in which each has the same
 * chance. Its stream is seeded from the game, the month and the office, so no
 * other draw moves. See WS7 spec RULE-3, AM-17.
 */
function drawLot(state: GameState, office: Office, tied: readonly string[]): string {
  if (tied.length === 1) return tied[0]!;
  const salt = POLITICS.offices.indexOf(office) + 1;
  // literal-ok: rng salts, reshuffle replays only
  return createRng((state.seed * 7_481 + state.month * 9_337 + salt * 1_013) >>> 0).pick(tied);
}

/**
 * The richest eligible player, by lot on a tie: never someone seated in an earlier office, and not someone running
 * for a later one unless that leaves nobody. With both offices: the Governor from the players not running for
 * Sheriff, the Sheriff never the new Governor. See WS7 spec RULE-3.
 */
function appointee(state: GameState, election: Shared<Election>, office: Office, seated: readonly string[]): string {
  const later = POLITICS.offices.slice(POLITICS.offices.indexOf(office) + 1).flatMap((o) => election.candidates[o]);
  const free = state.players.filter((p) => !seated.includes(p.id));
  const pool = free.filter((p) => !later.includes(p.id));
  const eligible = pool.length > 0 ? pool : free.length > 0 ? free : state.players;
  const richest = Math.max(...eligible.map((p) => p.money));
  return drawLot(state, office, eligible.filter((p) => p.money === richest).map((p) => p.id));
}

/** The whole-percent range the Governor may set this month, around the month's starting rate. See WS7 spec RULE-6. */
export function taxBounds(state: GameState): { low: number; high: number } {
  const { min, max, maxStep } = POLITICS.tax;
  const start = Math.round((state.politics?.taxAtStart ?? state.treasury.salesTax) * PERCENT);
  return { low: Math.max(min, start - maxStep), high: Math.min(max, start + maxStep) };
}

/** The Governor sets the sales tax in whole percent, within taxBounds. See WS7 spec RULE-6. */
export function setSalesTax(state: GameState, playerId: string, percent: number): void {
  const { id } = player(state, playerId);
  const politics = state.politics;
  if (!politics) throw new RuleError('This game plays without a Governor');
  if (state.phase !== 'planning') throw new RuleError('The tax is set in planning');
  if (politics.election && politics.election.stage !== 'over') throw new RuleError('Wait for the election to end');
  if (politics.governor !== id) throw new RuleError('Only the Governor sets the tax');
  const { low, high } = taxBounds(state);
  if (!Number.isInteger(percent) || percent < low || percent > high) throw new RuleError(`The tax can be ${low}% to ${high}% this month`);
  state.treasury.salesTax = percent / PERCENT;
}

/** At upkeep: each elected office's pay, in POLITICS.offices order, each only as far as the colony fund reaches. See WS7 spec RULE-7. */
export function payOffices(state: GameState): void {
  if (!state.politics) return;
  for (const office of POLITICS.offices) {
    const id = state.politics[office];
    if (id === null) continue;
    const paid = Math.max(0, Math.min(state.treasury.money, POLITICS.pay[office]));
    state.treasury.money -= paid;
    player(state, id).money += paid;
  }
}

/** The final score's office line: POLITICS.termScore per term served. See WS7 spec RULE-7. */
export function officeScore(state: GameState, playerId: string): number {
  return POLITICS.termScore * (state.politics?.terms[playerId] ?? 0);
}
