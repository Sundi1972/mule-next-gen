/**
 * Colony politics: the Land Baron, elections for the offices in POLITICS.offices,
 * vote weight, the Governor's sales tax and the offices' pay. The only writer of
 * GameState.politics. A tie nothing else breaks is drawn by lot on its own seeded
 * stream, so a replay from the seed draws the same and no other draw moves.
 */
import { fundIn, fundOut } from './colony.js';
import { POLITICS } from './config.js';
import { RuleError } from './errors.js';
import { player } from './game.js';
import { createRng } from './rng.js';
import { PERCENT } from './units.js';
import type { CanRun, CeremonyBeat, Council, Election, ElectionResult, GameState, LawId, LawProposal, Office, OfficeResult, Outfit, Politics, TaxPromise } from './types.js';

/** Read-only all the way down: an election read before edit() may be shared with a what-if copy. */
type Shared<T> = { readonly [K in keyof T]: T[K] extends object ? Shared<T[K]> : T[K] };

const TITLE: Record<Office, string> = { governor: 'Governor', sheriff: 'Sheriff' };

/** Nobody running for anything: the record has a list per Office, POLITICS.offices says which are elected. */
function noCandidates(): Record<Office, string[]> {
  return { governor: [], sheriff: [] };
}

/** Politics as it stands before the first planning phase: no offices, no Baron, nobody running. */
export function newPolitics(): Politics {
  return { governor: null, sheriff: null, termStart: 1, terms: {}, governorRun: null, baron: null, taxAtStart: 0, candidates: noCandidates(), promises: {}, promise: null, promiseFrom: null, election: null, proposal: null, council: null, laws: {}, failed: {} };
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
  p.council = null;
  if (!p.election) openCouncil(state, p);
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

/** Whether this month's election will hold a ballot: in announce, whether any office has two or more candidates so far. */
export function ballotAhead(state: GameState): boolean {
  const election = currentElection(state);
  if (!election || election.stage === 'ceremony' || election.stage === 'over') return false;
  if (election.stage === 'ballot') return contestedOffices(election).length > 0;
  return POLITICS.offices.some((o) => (state.politics!.candidates[o]?.length ?? 0) > 1);
}

/**
 * True from the ballot until the result, and in an election month's announce after month 1: the field closes as the
 * month opens, but month 1 has no planning before it, so its announce is the time to run.
 */
function candidacyClosed(state: GameState): boolean {
  const stage = currentElection(state)?.stage;
  // literal-ok: month 1 is the game's first planning phase, a definition
  return stage === 'ballot' || stage === 'ceremony' || (stage === 'announce' && state.month > 1);
}

/** Per office: true, or why the player may not run now. Running for the other office is no refusal. See WS7 spec RULE-60. */
export function canRun(state: GameState, playerId: string): Record<Office, CanRun> {
  const { id } = player(state, playerId);
  if (state.phase !== 'planning' || !state.politics) return { governor: 'notPlanning', sheriff: 'notPlanning' };
  if (candidacyClosed(state)) return { governor: 'closed', sheriff: 'closed' };
  const run = state.politics.governorRun;
  const termLimit = run?.id === id && run.terms >= POLITICS.maxGovernorTermsInRow;
  const may = (office: Office): CanRun => (!POLITICS.offices.includes(office) ? 'notElected' : office === 'governor' && termLimit ? 'termLimit' : true);
  return { governor: may('governor'), sheriff: may('sheriff') };
}

function refusal(why: Exclude<CanRun, true>, office: Office | null): string {
  switch (why) {
    case 'notPlanning':
      return 'You can run for office in planning';
    case 'closed':
      return 'Candidates are closed until the result';
    case 'termLimit':
      return `${POLITICS.maxGovernorTermsInRow} Governor terms in a row`;
    case 'notElected':
      return `The ${TITLE[office!]} is not elected yet`;
  }
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
 * phase until the field closes. A Governor run carries a promise, which goes wherever the candidacy goes. See WS7 spec RULE-60, RULE-10.
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

/** Picks, changes or (with null) clears a secret ballot for a contested office. Only in the ballot stage; a pick after Cast still counts. */
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

/** Presses (or takes back) Done for announce, or Cast my vote in the ballot; every player Done ends the stage at the next step. */
export function electionDone(state: GameState, playerId: string, done = true): void {
  const election = currentElection(state);
  if (state.phase !== 'planning' || !election || (election.stage !== 'announce' && election.stage !== 'ballot')) return;
  if (election.done.includes(playerId) === done) return;
  const e = edit(state).election!;
  e.done = done ? [...e.done, playerId] : e.done.filter((d) => d !== playerId);
}

/** Whether the player is Done in announce or the ballot: they pressed it; picking alone is not. False in any other stage. See WS7 spec RULE-61. */
export function isElectionDone(state: GameState, playerId: string): boolean {
  const election = currentElection(state);
  if (state.phase !== 'planning' || !election || (election.stage !== 'announce' && election.stage !== 'ballot')) return false;
  return election.done.includes(playerId);
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

/** One office's part of the ceremony: who stands on the stage, the vote blocks in the order they appear, and when each beat starts. */
export interface OfficeBeats {
  office: Office;
  /** In seat order, never ranked, so the order gives nothing away. */
  candidates: string[];
  /** One candidate id per weighted vote: a round of one block for each candidate who still has votes to show. */
  blocks: string[];
  /** Ms of the show clock at which each beat starts; tie is null when no tie was broken. */
  at: Omit<Record<CeremonyBeat, number>, 'tie'> & { tie: number | null };
}

export interface CeremonyBeats {
  /** In POLITICS.offices order, one per office the result decided. */
  offices: OfficeBeats[];
  /** When the whole result is held, after the last office. */
  summary: number;
  /** The show's length: then the winners take office. */
  total: number;
}

const TIE_BROKEN: readonly string[] = ['baron', 'land', 'lot'];

/** When each beat of the ceremony starts, from the closed result, with `seats` the player ids in seat order. Pure. See WS7 spec RULE-62. */
export function ceremonyBeats(seats: readonly string[], result: ElectionResult): CeremonyBeats {
  const c = POLITICS.ceremony;
  let t = c.leadMs;
  const offices: OfficeBeats[] = [];
  for (const office of POLITICS.offices) {
    const race = result[office];
    if (!race) continue;
    const candidates = race.tallies.map((x) => x.id).sort((a, b) => seats.indexOf(a) - seats.indexOf(b));
    const blocks: string[] = [];
    // An office with no ballot shows no blocks, even when it kept one candidate with votes.
    if (candidates.length > 1) {
      const votes = (id: string) => race.tallies.find((x) => x.id === id)!.votes;
      const rounds = Math.max(...candidates.map(votes));
      for (let round = 0; round < rounds; round++) for (const id of candidates) if (votes(id) > round) blocks.push(id);
    }
    const title = t;
    const candidatesAt = title + c.titleMs;
    const bars = candidatesAt + c.candidateMs * candidates.length + c.barsLeadMs;
    const blocksEnd = bars + c.blockMs * blocks.length;
    const tie = TIE_BROKEN.includes(race.how) ? blocksEnd + c.tieLeadMs : null;
    const winner = tie !== null ? tie + c.tieMs : blocksEnd + c.winnerLeadMs;
    const end = winner + c.winnerMs;
    offices.push({ office, candidates, blocks, at: { title, candidates: candidatesAt, bars, tie, winner, end } });
    t = end;
  }
  return { offices, summary: t, total: t + c.summaryMs };
}

/** Runs the show clock on; at its end the winners take office. */
function stepCeremony(state: GameState, dt: number): void {
  const politics = edit(state);
  const ceremony = politics.election!.ceremony!;
  ceremony.elapsedMs = Math.min(ceremony.totalMs, ceremony.elapsedMs + dt);
  if (ceremony.elapsedMs >= ceremony.totalMs) takeOffice(state, politics);
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

/** Fixes every office's result, in POLITICS.offices order, and starts the ceremony's show clock. */
function closeBallot(state: GameState, election: Election): ElectionResult {
  const result: ElectionResult = {};
  const seated: string[] = [];
  for (const office of POLITICS.offices) {
    // Decided in order and never someone already seated, so one player never holds two offices.
    const decided = decide(state, election, office, seated);
    result[office] = decided;
    seated.push(decided.winner);
  }
  const { total } = ceremonyBeats(state.players.map((p) => p.id), result);
  Object.assign(election, { stage: 'ceremony', ceremony: { elapsedMs: 0, totalMs: total }, done: [], result });
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
  // The promise holds for the term; an appointed Governor made none.
  politics.promise = result.governor!.how === 'appointed' ? null : (election.promises[governor] ?? null);
  politics.promiseFrom = Math.round(state.treasury.salesTax * PERCENT);
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
    player(state, id).money += fundOut(state, 'officePay', POLITICS.pay[office]);
  }
}

/** The final score's office line: POLITICS.termScore per term served. See WS7 spec RULE-7. */
export function officeScore(state: GameState, playerId: string): number {
  return POLITICS.termScore * (state.politics?.terms[playerId] ?? 0);
}

// ---- The council: laws proposed by the Governor, voted at the next planning, after the election. See WS7 slice 2a.

export const LAW_NAME: Record<LawId, string> = { exportTax: 'Export tax', landTax: 'Land tax', pollutionTax: 'Pollution tax', emissionCap: 'Emission cap' };

function electionLive(state: GameState): boolean {
  const election = state.politics?.election;
  return !!election && election.stage !== 'over';
}

function councilLive(state: GameState): boolean {
  const council = state.politics?.council;
  return !!council && council.stage !== 'over';
}

/** Whether the colony is voting: the election or the law ballot is open in planning. See slice 2a RULE-40. */
export function votesOpen(state: GameState): boolean {
  return state.phase === 'planning' && (electionLive(state) || councilLive(state));
}

function inWords(settings: readonly number[]): string {
  return settings.length === 1 ? `${settings[0]}` : `${settings.slice(0, -1).join(', ')} or ${settings.at(-1)}`;
}

/** The Governor puts a law, a new setting or a repeal to the next planning's ballot; null withdraws it. See slice 2a RULE-41. */
export function proposeLaw(state: GameState, playerId: string, proposal: LawProposal | null): void {
  const politics = state.politics;
  if (!politics) throw new RuleError('This game plays without a Governor');
  if (state.phase !== 'planning' || votesOpen(state)) throw new RuleError('Propose once the votes are over');
  if (politics.governor !== playerId) throw new RuleError('Only the Governor proposes a law');
  if (proposal === null) {
    edit(state).proposal = null;
    return;
  }
  if (!Object.hasOwn(POLITICS.laws, proposal.law)) throw new RuleError("That law is not in the colony's book");
  const { retryMonths, maxInForce } = POLITICS.council;
  const failedIn = politics.failed[`${proposal.kind}:${proposal.law}`];
  if (failedIn !== undefined && state.month <= failedIn + retryMonths) {
    throw new RuleError(`That proposal failed in month ${failedIn}; it can come back in month ${failedIn + retryMonths + 1}`);
  }
  const inForce = politics.laws[proposal.law];
  if (proposal.kind === 'repeal') {
    if (!inForce) throw new RuleError('That law is not in force');
  } else {
    const { settings } = POLITICS.laws[proposal.law];
    if (!settings.includes(proposal.setting)) throw new RuleError(`${LAW_NAME[proposal.law]} is set to ${inWords(settings)}`);
    if (inForce?.setting === proposal.setting) throw new RuleError('That law is already in force at that setting');
    const replacing = proposal.replaces !== undefined && politics.laws[proposal.replaces] !== undefined;
    if (!inForce && Object.keys(politics.laws).length >= maxInForce && !replacing) {
      throw new RuleError(`${maxInForce} laws are in force: pick the one this replaces`);
    }
  }
  edit(state).proposal = { by: playerId, month: state.month, proposal };
}

/** A proposal from an earlier month comes to its ballot, if its proposer still governs; otherwise it is dropped. */
function openCouncil(state: GameState, politics: Politics): void {
  const pending = politics.proposal;
  if (!pending || pending.month >= state.month) return;
  politics.proposal = null;
  if (politics.governor !== pending.by) return;
  politics.council = { stage: 'ballot', clockMs: 0, proposal: pending.proposal, proposer: pending.by, ballots: { [pending.by]: true }, done: [], result: null };
}

function liveCouncil(state: GameState): Shared<Council> {
  const council = state.politics?.council;
  if (state.phase !== 'planning' || !council || council.stage !== 'ballot') throw new RuleError('The law ballot is not open');
  return council;
}

/** Yes or no on the open law ballot; a later vote replaces it until the ballot closes. The Governor's starts as yes. */
export function castLawVote(state: GameState, voterId: string, yes: boolean): void {
  const voter = player(state, voterId);
  liveCouncil(state);
  const council = edit(state).council!;
  council.ballots[voter.id] = yes;
  if (!council.done.includes(voter.id)) council.done = [...council.done, voter.id];
}

/** Presses (or takes back) Done on the law ballot. */
export function councilDone(state: GameState, playerId: string, done = true): void {
  const council = state.politics?.council;
  if (state.phase !== 'planning' || !council || council.stage !== 'ballot' || council.done.includes(playerId) === done) return;
  const c = edit(state).council!;
  c.done = done ? [...c.done, playerId] : c.done.filter((d) => d !== playerId);
}

function isCouncilDone(state: GameState, playerId: string): boolean {
  const council = state.politics?.council;
  return state.phase === 'planning' && !!council && council.stage === 'ballot' && council.done.includes(playerId);
}

/** Presses Done on whichever vote is open: the election first, then the law ballot. */
export function votesDone(state: GameState, playerId: string, done = true): void {
  if (electionLive(state)) electionDone(state, playerId, done);
  else councilDone(state, playerId, done);
}

/** Whether the player is Done on the vote that is open. */
export function isVotesDone(state: GameState, playerId: string): boolean {
  return electionLive(state) ? isElectionDone(state, playerId) : isCouncilDone(state, playerId);
}

/** The weighted tally at the ballot's close: the Governor's ballot breaks a tie. See slice 2a RULE-42. */
function tally(state: GameState, council: Council): void {
  let yes = 0;
  let no = 0;
  for (const [id, ballot] of Object.entries(council.ballots)) {
    if (ballot) yes += voteWeight(state, id).total;
    else no += voteWeight(state, id).total;
  }
  const tie = yes === no;
  const passed = yes > no || (tie && council.ballots[state.politics!.governor ?? ''] === true);
  council.result = { passed, yes, no, tie };
  council.stage = 'reveal';
  council.clockMs = 0;
}

/** A passed law takes effect when its reveal ends; a failed one waits its retry months. */
function takeEffect(state: GameState, politics: Politics): void {
  const council = politics.council!;
  const { proposal, result } = council;
  council.stage = 'over';
  if (!result!.passed) {
    politics.failed[`${proposal.kind}:${proposal.law}`] = state.month;
    return;
  }
  if (proposal.kind === 'repeal') {
    delete politics.laws[proposal.law];
    return;
  }
  if (!politics.laws[proposal.law] && proposal.replaces) delete politics.laws[proposal.replaces];
  politics.laws[proposal.law] = { setting: proposal.setting, since: state.month };
}

/**
 * Advances whichever vote is open by dt ms: the election (returning its result in the step its ballot closes), then
 * the law ballot, which opens once the election is over and closes at the step after every player is Done; only its
 * reveal has a clock. See slice 2a RULE-40.
 */
export function stepVotes(state: GameState, dt: number): ElectionResult | null {
  if (state.phase !== 'planning' || !state.politics) return null;
  if (electionLive(state)) {
    const result = stepElection(state, dt);
    if (!electionLive(state) && state.politics.proposal) openCouncil(state, edit(state));
    return result;
  }
  const council = state.politics.council;
  if (!council || council.stage === 'over') return null;
  if (council.stage === 'ballot') {
    if (state.players.every((p) => isCouncilDone(state, p.id))) tally(state, edit(state).council!);
    return null;
  }
  const politics = edit(state);
  politics.council!.clockMs += dt;
  if (politics.council!.clockMs >= POLITICS.council.revealMs) takeEffect(state, politics);
  return null;
}

/** Leaving planning: closes the election, then tallies an open law ballot and lets its result take effect. See slice 2a RULE-40. */
export function closeVotes(state: GameState): ElectionResult | null {
  const result = closeElection(state);
  if (councilLive(state)) {
    const politics = edit(state);
    if (politics.council!.stage === 'ballot') tally(state, politics.council!);
    takeEffect(state, politics);
  }
  // A proposal from an earlier month had this planning for its ballot; one that never got it is dropped.
  const pending = state.politics?.proposal;
  if (pending && pending.month < state.month) edit(state).proposal = null;
  return result;
}

/** Charges a law tax: what the payer has, at most, into the fund under its source; it counts as taxes paid. */
function lawCharge(state: GameState, payerId: string, source: 'landTax' | 'pollutionTax', due: number): void {
  const payer = player(state, payerId);
  const paid = Math.max(0, Math.min(payer.money, due));
  if (paid === 0) return;
  payer.money -= paid;
  fundIn(state, source, paid);
  state.treasury.paid[payerId] = (state.treasury.paid[payerId] ?? 0) + paid;
}

/** The export tax on one unit a player sells to the export ship, after the sales tax and out of the sale; returns what it took. See slice 2a RULE-43. */
export function chargeExportTax(state: GameState, sellerId: string, price: number): number {
  const law = state.politics?.laws.exportTax;
  if (!law) return 0;
  const tax = Math.round((price * law.setting) / PERCENT);
  fundIn(state, 'exportTax', tax);
  state.treasury.paid[sellerId] = (state.treasury.paid[sellerId] ?? 0) + tax;
  return tax;
}

/** At upkeep, before the grant and the offices: the land tax, then the pollution tax, each payer in seat order. See slice 2a RULE-43. */
export function collectLawTaxes(state: GameState): void {
  const laws = state.politics?.laws;
  if (!laws) return;
  if (laws.landTax) for (const p of state.players) lawCharge(state, p.id, 'landTax', laws.landTax.setting * plotsOwned(state, p.id));
  const report = state.history.at(-1);
  const pollutionBy = report?.month === state.month ? report.pollutionBy : {};
  if (laws.pollutionTax) {
    for (const p of state.players) lawCharge(state, p.id, 'pollutionTax', Math.round(laws.pollutionTax.setting * (pollutionBy[p.id] ?? 0)));
  }
}

const CAPPED_NAME: Partial<Record<Outfit, string>> = { rareEarth: 'Rare earth mines', alloy: 'smelters' };

/** The emission cap's level and the air when the cap stops this outfit now; null when it doesn't. See slice 2a RULE-44. */
export function emissionCapped(state: GameState, outfit: Outfit): { level: number; air: number } | null {
  const cap = state.politics?.laws.emissionCap;
  if (!cap || !POLITICS.laws.emissionCap.blocks.includes(outfit) || state.air <= cap.setting) return null;
  return { level: cap.setting, air: Math.round(state.air) };
}

/** Why the emission cap refuses outfitting a MULE for this now, or null. */
export function outfitBlocked(state: GameState, outfit: Outfit): string | null {
  const capped = emissionCapped(state, outfit);
  return capped && `The emission cap stops new ${CAPPED_NAME[outfit] ?? outfit} while the air is above ${capped.level} (now ${capped.air})`;
}

/** What a law would cost one player a month, from public facts; a negative cost is a saving. See slice 2a RULE-45. */
export interface LawImpact {
  cost: number;
  /** For the emission cap: whether it would stop outfits now, and how many of the player's plots it covers. */
  capped?: { blocksNow: boolean; plots: number };
}

function enactImpact(state: GameState, law: LawId, setting: number, playerId: string): LawImpact {
  switch (law) {
    case 'landTax':
      return { cost: setting * plotsOwned(state, playerId) };
    case 'pollutionTax':
      return { cost: Math.round(setting * (state.history.at(-1)?.pollutionBy[playerId] ?? 0)) };
    case 'exportTax': {
      const { stock } = player(state, playerId);
      const wanted = (Object.keys(state.ship.hold) as (keyof typeof stock)[]).filter((g) => (state.ship.hold[g] ?? 0) > 0);
      const worth = wanted.reduce((sum, g) => sum + stock[g] * state.store.offWorld[g], 0);
      return { cost: Math.round((setting * worth) / PERCENT) };
    }
    case 'emissionCap': {
      const blocks = POLITICS.laws.emissionCap.blocks;
      const plots = state.tiles.filter((t) => t.owner === playerId && t.outfit !== null && blocks.includes(t.outfit)).length;
      const blocksNow = state.air > setting;
      return { cost: blocksNow ? plots * POLITICS.ai.council.capPlotCost : 0, capped: { blocksNow, plots } };
    }
  }
}

/** Each player's monthly cost of a proposal, for every phone's "For you" and the AI's vote; a repeal is the law in force's cost, saved. */
export function lawImpact(state: GameState, proposal: LawProposal): Record<string, LawImpact> {
  const out: Record<string, LawImpact> = {};
  for (const p of state.players) {
    if (proposal.kind === 'enact') {
      out[p.id] = enactImpact(state, proposal.law, proposal.setting, p.id);
      continue;
    }
    const inForce = state.politics?.laws[proposal.law];
    const impact = inForce ? enactImpact(state, proposal.law, inForce.setting, p.id) : { cost: 0 };
    out[p.id] = { ...impact, cost: impact.cost === 0 ? 0 : -impact.cost };
  }
  return out;
}
