import {
  banMultiplier,
  canOrder,
  canRun,
  ceremonyBeats,
  fineable,
  GOODS,
  goodWords,
  guardsMax,
  isElectionDone,
  isPublicOrder,
  LAW_NAME,
  lawImpact,
  lawOffered,
  nextElectionMonth,
  orderTerms,
  partyTo,
  PERCENT,
  POLITICS,
  promisedVotes,
  reputationReasons,
  sheriffCanAct,
  taxBounds,
  votesOpen,
  voteWeight,
  type CeremonyBeat,
  type CeremonyBeats,
  type DealCard,
  type ElectionHow,
  type GameState,
  type Good,
  type LawId,
  type LawImpact,
  type LawProposal,
  type MonthEvent,
  type NoticeEntry,
  type Office,
  type SabotageOrder,
  type SabotageTarget,
} from '@mule/engine';
import type { CeremonyView, CouncilView, ElectionView, IncidentView, MyDealsView, MyPoliticsView, NewsLine, OfficeReveal, PoliticsView } from '@mule/protocol';

/* Colony politics as the screens and the news see it: pure functions of the game state. A ballot reaches only its owner's view. */

const percent = (rate: number) => Math.round(rate * PERCENT);

/** One entry per elected office, in POLITICS.offices order: a Governor-only table sends no Sheriff entry. */
function perOffice<T>(value: (office: Office) => T): Partial<Record<Office, T>> {
  return Object.fromEntries(POLITICS.offices.map((office) => [office, value(office)]));
}

const BEATS: readonly CeremonyBeat[] = ['title', 'candidates', 'bars', 'tie', 'winner', 'end'];

/** The beats of this month's closed result, or null before the ballot closes. */
function beatsOf(state: GameState): CeremonyBeats | null {
  const result = state.politics?.election?.result;
  return result ? ceremonyBeats(state.players.map((p) => p.id), result) : null;
}

/** How far the show clock has got: the ms it stands at, or past every beat once the election is over. */
function showMs(state: GameState): number {
  const e = state.politics!.election!;
  return e.ceremony ? e.ceremony.elapsedMs : e.stage === 'over' ? Infinity : -Infinity;
}

/**
 * Each office's result as far as the ceremony has shown it, the same on every screen: its totals from its bars beat,
 * its winner and how from its winner beat, or from its tie beat when a tie was broken, whose stamp names the rule and
 * the winner; every office once the election is over. See WS7 spec RULE-64, AM-21.
 */
function revealed(state: GameState): Partial<Record<Office, OfficeReveal>> {
  const shown: Partial<Record<Office, OfficeReveal>> = {};
  const beats = beatsOf(state);
  const result = state.politics!.election!.result;
  if (!beats || !result) return shown;
  const ms = showMs(state);
  for (const { office, at } of beats.offices) {
    const race = result[office]!;
    if (ms >= (at.tie ?? at.winner)) shown[office] = structuredClone(race);
    else if (ms >= at.bars) shown[office] = { tallies: structuredClone(race.tallies) };
  }
  return shown;
}

/** The show clock in game seconds and, per office it has reached, its latest beat; nothing ahead of the clock. */
function ceremonyView(state: GameState): CeremonyView | null {
  const c = state.politics!.election!.ceremony;
  const beats = beatsOf(state);
  if (!c || !beats) return null;
  const reached: CeremonyView['reached'] = {};
  for (const { office, at } of beats.offices) {
    const beat = BEATS.filter((b) => at[b] !== null && at[b]! <= c.elapsedMs).at(-1);
    if (beat) reached[office] = { beat, at: at[beat]! / 1_000 };
  }
  return { seconds: c.elapsedMs / 1_000, total: c.totalMs / 1_000, reached };
}

/** The last month of the term that began in `start`: the month before the next election, or the game's last month. */
function termEnd(state: GameState, start: number): number {
  return (nextElectionMonth({ ...state, month: start }) ?? state.maxMonths + 1) - 1;
}

/** Offices, tax, weights and the election as every screen sees them; null when the game plays without politics. */
export function politicsView(state: GameState): PoliticsView | null {
  const p = state.politics;
  if (!p) return null;
  const { low, high } = taxBounds(state);
  return {
    governor: p.governor,
    sheriff: p.sheriff,
    term: p.governor === null ? null : [p.termStart, termEnd(state, p.termStart)],
    next: nextElectionMonth(state),
    baron: p.baron,
    tax: { percent: percent(state.treasury.salesTax), start: percent(p.taxAtStart), low, high },
    fund: state.treasury.money,
    pay: perOffice((office) => POLITICS.pay[office]),
    weights: state.players.map(({ id }) => {
      const { total, parts } = voteWeight(state, id);
      return { id, votes: total, parts: { ...parts } };
    }),
    candidates: perOffice((office) => [...p.candidates[office]]),
    promises: structuredClone(p.promises),
    promise: p.promise && { ...p.promise },
    promiseFrom: p.promiseFrom,
    election: electionView(state),
    proposal: p.proposal && { ...structuredClone(p.proposal), impact: lawImpact(state, p.proposal.proposal) },
    council: councilView(state),
    laws: structuredClone(p.laws),
    retry: Object.fromEntries(Object.entries(p.failed).map(([key, month]) => [key, month + POLITICS.council.retryMonths + 1])),
    brokenDeals: visibleDeals(state, NO_SEAT).sort((a, b) => (b.settled ?? 0) - (a.settled ?? 0)),
    reputationReasons: Object.fromEntries(
      state.players.map(({ id }) => [id, reputationReasons(state, id).map((r) => (r.kind === 'broken' ? { kind: 'broken' as const, id: r.card.id } : { ...r }))]),
    ),
    sabotage: sabotageView(state),
  };
}

/** Built field by field: `ballots` is read only for who has voted, never how; the totals only from the reveal. See slice 2a RULE-47. */
function councilView(state: GameState): CouncilView | null {
  const c = state.politics?.council;
  if (!c) return null;
  return {
    stage: c.stage,
    proposal: structuredClone(c.proposal),
    proposer: c.proposer,
    impact: lawImpact(state, c.proposal),
    voted: Object.keys(c.ballots),
    done: [...c.done],
    waitingFor: c.stage === 'ballot' ? state.players.filter((p) => !c.done.includes(p.id)).map((p) => p.id) : [],
    clockMs: c.clockMs,
    revealMs: POLITICS.council.revealMs,
    result: c.stage === 'ballot' ? null : c.result && { ...c.result },
  };
}

/** The news line as a law ballot's result is revealed: whether it passed, by the weighted totals. */
export function councilNews(state: GameState): string | null {
  const c = state.politics?.council;
  if (!c?.result) return null;
  const { proposal, result } = c;
  const what = proposal.kind === 'repeal' ? `Repeal of the ${LAW_NAME[proposal.law].toLowerCase()}` : `${LAW_NAME[proposal.law]} at ${proposal.setting}`;
  const tie = result.tie ? ', the Governor breaking the tie' : '';
  return `${what} ${result.passed ? 'passes' : 'fails'}, ${result.yes} votes to ${result.no}${tie}.`;
}

/** Built field by field: `ballots` is read only for who has voted, never for whom. */
function electionView(state: GameState): ElectionView | null {
  const e = state.politics?.election;
  if (!e) return null;
  const waiting = e.stage === 'announce' || e.stage === 'ballot';
  return {
    stage: e.stage,
    ceremony: ceremonyView(state),
    candidates: perOffice((office) => [...e.candidates[office]]),
    promises: structuredClone(e.promises),
    voted: Object.keys(e.ballots),
    done: state.players.filter((p) => isElectionDone(state, p.id)).map((p) => p.id),
    waitingFor: waiting ? state.players.filter((p) => !isElectionDone(state, p.id)).map((p) => p.id) : [],
    result: revealed(state),
  };
}

/**
 * One player's own side of politics, for their phone only: their candidacy (the election's from the ballot until the
 * result, else Politics'), their ballot, and the tax paid and reputation that weigh their vote.
 */
export function myPoliticsView(state: GameState, playerId: string, voids: readonly SabotageOrder[] = []): MyPoliticsView | null {
  const p = state.politics;
  if (!p) return null;
  const e = p.election;
  const running = e && (e.stage === 'ballot' || e.stage === 'ceremony') ? e.candidates : p.candidates;
  const may = canRun(state, playerId);
  return {
    running: POLITICS.offices.find((o) => running[o].includes(playerId)) ?? null,
    ballot: { ...e?.ballots[playerId] },
    canRun: perOffice((office) => may[office]),
    paid: state.treasury.paid[playerId] ?? 0,
    reputation: state.players.find((pl) => pl.id === playerId)!.reputation,
    lawBallot: p.council?.stage === 'ballot' ? (p.council.ballots[playerId] ?? null) : null,
    promised: structuredClone(promisedVotes(state, playerId)),
    sabotage: mySabotageView(state, playerId, voids),
    ...sheriffDesk(state, playerId),
    ...(p.governor === playerId && state.phase === 'planning' && !votesOpen(state) ? { candidates: candidates(state) } : {}),
  };
}

/** Every proposal the Governor may weigh, each with lawImpact's cost per player: every law at each setting, and a repeal of each in force. See C46. */
function candidates(state: GameState): Record<string, Record<string, LawImpact>> {
  const out: Record<string, Record<string, LawImpact>> = {};
  const add = (key: string, proposal: LawProposal) => (out[key] = lawImpact(state, proposal));
  for (const law of (Object.keys(POLITICS.laws) as LawId[]).filter(lawOffered)) {
    for (const setting of POLITICS.laws[law].settings) add(`${law}:${setting}`, { kind: 'enact', law, setting });
  }
  for (const law of Object.keys(state.politics!.laws) as LawId[]) add(`repeal:${law}`, { kind: 'repeal', law });
  return out;
}

const HOW: Record<ElectionHow, string> = {
  votes: 'elected',
  unopposed: 'unopposed',
  appointed: 'appointed',
  baron: 'the Land Baron broke the tie',
  land: 'a tie: most plots',
  lot: 'a tie: decided by lot',
};

const TITLE: Record<Office, string> = { governor: 'Governor', sheriff: 'Sheriff' };

/**
 * The news as the show clock runs on from `beforeMs` to where it stands now: one line per office whose winner beat it
 * passed, in POLITICS.offices order. See WS7 spec C64.
 */
export function ceremonyNews(state: GameState, beforeMs: number, nameOf: (seatId: string) => string): NewsLine[] {
  const beats = beatsOf(state);
  const result = state.politics?.election?.result;
  if (!beats || !result) return [];
  const ms = showMs(state);
  return beats.offices
    .filter(({ at }) => beforeMs < at.winner && at.winner <= ms)
    .map(({ office }) => {
      const { winner, how } = result[office]!;
      return { text: `${nameOf(winner)} is ${TITLE[office]} (${HOW[how]}).`, who: [winner] };
    });
}

/** No seat's id: partyTo passes a card to it only when the card is public. */
const NO_SEAT = '';

/** The cards `viewerId` may see by the one rule (partyTo), newest offer first, as copies. */
function visibleDeals(state: GameState, viewerId: string): DealCard[] {
  return [...(state.politics?.deals ?? [])].reverse().filter((card) => partyTo(viewerId, card)).map((card) => structuredClone(card));
}

/** A player's own cards for their phone: every card partyTo shows them, and how many more offers they may make now. */
export function dealsView(state: GameState, playerId: string): MyDealsView | null {
  const p = state.politics;
  if (!p) return null;
  const open = p.deals.filter((d) => d.from === playerId && d.status === 'offered').length;
  return { cards: visibleDeals(state, playerId), offersLeft: Math.max(0, POLITICS.deals.maxOpenOffers - open), pactMonths: [...POLITICS.deals.pactMonths] };
}

/** A deal notice as mule-game's notify takes it: the month and phase are its own to add. */
export type DealFact = Omit<Extract<NoticeEntry, { kind: 'deal' }>, 'type' | 'at' | 'seq' | 'month' | 'phase'>;

/**
 * What changed between two lists of cards, as the record's notices: a new card is noticed as offered, and each status
 * it has moved to since as that status. Private to its two parties, but a broken card is public, so it carries none.
 */
export function dealNotices(before: readonly DealCard[], after: readonly DealCard[]): DealFact[] {
  const was = new Map(before.map((card) => [card.id, card.status]));
  const facts: DealFact[] = [];
  const fact = (event: DealCard['status'], card: DealCard): DealFact =>
    event === 'broken' ? { kind: 'deal', event, deal: structuredClone(card) } : { kind: 'deal', event, deal: structuredClone(card), parties: [card.from, card.to] };
  for (const card of after) {
    const old = was.get(card.id);
    if (old === undefined) facts.push(fact('offered', { ...card, status: 'offered', brokenBy: null, settled: null }));
    if (card.status !== (old ?? 'offered')) facts.push(fact(card.status, card));
  }
  return facts;
}

/** A reputation move as the news says it: "−10". */
const points = (move: number): string => `${move < 0 ? '−' : '+'}${Math.abs(move)}`;

/** One news line for every card that turned broken between the two lists: who broke what with whom, and what it cost. */
export function dealNews(before: readonly DealCard[], after: readonly DealCard[], nameOf: (seatId: string) => string): NewsLine[] {
  const was = new Map(before.map((card) => [card.id, card.status]));
  const { voteBroken, pactBroken } = POLITICS.reputation.moves;
  return after
    .filter((card) => card.status === 'broken' && was.get(card.id) !== 'broken')
    .map((card) => {
      const breaker = card.brokenBy ?? card.from;
      const other = breaker === card.from ? card.to : card.from;
      const { terms } = card;
      if (terms.kind === 'pact') return { text: `${nameOf(breaker)} broke a pact with ${nameOf(other)}. Reputation ${points(pactBroken)}.`, who: [breaker, other] };
      if ('office' in terms) {
        const text = `${nameOf(breaker)} broke a promise to ${nameOf(other)}: a vote for ${nameOf(terms.candidate)}. Reputation ${points(voteBroken)}.`;
        return { text, who: [breaker, other, terms.candidate] };
      }
      return { text: `${nameOf(breaker)} broke a promise to ${nameOf(other)}: a ${terms.yes ? 'yes' : 'no'} on the law. Reputation ${points(voteBroken)}.`, who: [breaker, other] };
    });
}

/* Sabotage and the Sheriff (slice 4, S4-C13). Every order and every guard reaches a view, the news or a notice through the
   three tests just below, and nowhere else (AM-2): an order's party is its `by`, the guards' party is the sitting Sheriff. */

/** What a screen may see of an order: all of it (its orderer), what is public, or nothing. */
type Sight = 'whole' | 'public' | 'none';

/** THE order-visibility test (S4-RULE-12, AM-2). `viewerId` null is the TV, the board and the record's public notices. */
function orderSight(order: SabotageOrder, viewerId: string | null): Sight {
  if (viewerId !== null && order.by === viewerId) return 'whole';
  return isPublicOrder(order) ? 'public' : 'none';
}

/** Whether the viewer is told who is behind the order: its orderer, or everyone once the culprit is public. */
function culpritSeen(order: SabotageOrder, viewerId: string | null): boolean {
  const sight = orderSight(order, viewerId);
  return sight === 'whole' || (sight === 'public' && order.culpritPublic);
}

/** Whether the viewer is the sitting Sheriff, whose are the guards. */
function guardsSeen(state: GameState, viewerId: string | null): boolean {
  return viewerId !== null && state.politics?.sheriff === viewerId;
}

/** The viewer-less audience (TV, board, public notice). */
const EVERYONE: string | null = null;

/** The sabotage event this order filed in production, if it did: this month's list, or a past month's report. */
function eventOf(state: GameState, order: SabotageOrder): MonthEvent | undefined {
  const filed = (e: MonthEvent) => e.sabotage?.order === order.id;
  return state.monthEvents.find(filed) ?? state.history.flatMap((h) => h.events ?? []).find(filed);
}

/** How the culprit became known (S4-C13): a guard's catch, any other catch, or an investigation; null while unknown. */
function howOf(state: GameState, order: SabotageOrder): IncidentView['how'] {
  if (!order.culpritPublic) return null;
  if (eventOf(state, order)?.sabotage?.guarded) return 'guard';
  return order.outcome === 'caught' ? 'caught' : 'investigation';
}

/**
 * The crop a power cut hit: the one the engine recorded when the order resolved. Only a pending order, which only its
 * orderer sees, reads the plot's outfit now. Null when it cannot be told (the plot lost its MULE since): the words and
 * the views then say "plot" and name no crop, and nothing here may throw.
 */
function cutGood(state: GameState, order: SabotageOrder): Good | null {
  if (order.good) return order.good;
  if (order.outcome !== 'pending' || order.target.kind !== 'powerCut') return null;
  const outfit = state.tiles[order.target.tile]?.outfit;
  return outfit && (GOODS as readonly string[]).includes(outfit) ? (outfit as Good) : null;
}

/** "Ossa's Food plot", or "Ossa's plot" when the crop is unknown. */
function plotWords(state: GameState, order: SabotageOrder, nameOf: (seatId: string) => string): string {
  const good = cutGood(state, order);
  return `${nameOf(order.victim!)}'s ${good ? `${capital(goodWords(good))} ` : ''}plot`;
}

/** One order as `viewerId` sees it, or null when they may see none of it. */
function incidentView(state: GameState, order: SabotageOrder, viewerId: string | null): IncidentView | null {
  if (orderSight(order, viewerId) === 'none') return null;
  const target = order.target;
  const tile = target.kind === 'powerCut' ? state.tiles[target.tile]! : null;
  return {
    id: order.id,
    month: order.month,
    kind: target.kind,
    victim: order.victim ?? null,
    at: tile && { x: tile.x, y: tile.y },
    good: target.kind === 'rumour' ? target.good : cutGood(state, order),
    ...(target.kind === 'rumour' ? { dir: target.dir } : {}),
    worked: order.worked === true,
    culprit: culpritSeen(order, viewerId) ? order.by : null,
    how: howOf(state, order),
    investigated: order.investigated != null,
    fine: order.fine ? { due: order.fine.due, paid: order.fine.paid, toVictim: order.fine.toVictim, by: order.fine.by } : null,
  };
}

/** Sabotage as every screen sees it: the terms, the public incidents newest first, the Sheriff's count. Null with sabotage off. */
export function sabotageView(state: GameState): NonNullable<PoliticsView['sabotage']> | null {
  const p = state.politics;
  if (!p || !POLITICS.sabotage.on) return null;
  const done = p.sabotage.filter((o) => o.investigated === state.month).length;
  return {
    terms: structuredClone(orderTerms(state)),
    incidents: [...p.sabotage].reverse().flatMap((o) => incidentView(state, o, EVERYONE) ?? []),
    // What he may post, never what he has posted: a guard shows only by its catch (AM-1).
    sheriff: { guards: guardsMax(state), investigations: POLITICS.sheriff.investigations, investigationsLeft: Math.max(0, POLITICS.sheriff.investigations - done) },
  };
}

/** A player's own sabotage for their phone: this month's order, what it will cost, and every order they made. */
export function mySabotageView(state: GameState, playerId: string, voids: readonly SabotageOrder[] = []): NonNullable<MyPoliticsView['sabotage']> | null {
  const p = state.politics;
  if (!p || !POLITICS.sabotage.on) return null;
  const mine = p.sabotage.filter((o) => orderSight(o, playerId) === 'whole');
  const standing = mine.find((o) => o.month === state.month && o.outcome === 'pending');
  const charged = state.phase === 'upkeep' || state.phase === 'gameOver';
  return {
    order: standing ? structuredClone(standing.target) : null,
    canOrder: canOrder(state, playerId),
    owed: charged ? 0 : mine.filter((o) => o.month === state.month).reduce((sum, o) => sum + o.cost, 0),
    // A void order is gone from the engine's list; the server keeps it (voidedOrders) and it reaches the same test as any other:
    // only its orderer sees it, and as one entry that was never public and never charged.
    mine: [
      ...mine.flatMap((o) => {
        const view = incidentView(state, o, playerId);
        return view ? [{ ...view, public: isPublicOrder(o), outcome: o.outcome }] : [];
      }),
      ...voids.filter((o) => orderSight(o, playerId) === 'whole').flatMap((o) => {
        const view = incidentView(state, o, playerId);
        return view ? [{ ...view, good: o.good ?? null, public: false, outcome: 'void' as const }] : [];
      }),
    ].sort((a, b) => a.month - b.month),
  };
}

/** The Sheriff's desk: only on the sitting Sheriff's view, and only with sabotage on. */
function sheriffDesk(state: GameState, playerId: string): Pick<MyPoliticsView, 'sheriff'> {
  if (!POLITICS.sabotage.on || !guardsSeen(state, playerId)) return {};
  // guardsSeen is the one gate: the sitting Sheriff is the viewer, so 'notSheriff' cannot come back.
  const can = sheriffCanAct(state, playerId) as Exclude<ReturnType<typeof sheriffCanAct>, 'notSheriff'>;
  const done = state.politics!.sabotage.filter((o) => o.investigated === state.month).length;
  return {
    sheriff: {
      canAct: can,
      guards: [...state.politics!.guards],
      max: guardsMax(state),
      investigationsLeft: Math.max(0, POLITICS.sheriff.investigations - done),
      fineable: fineable(state, playerId),
      steps: [...POLITICS.sheriff.fine.steps],
      multiplier: banMultiplier(state),
    },
  };
}

type Capture<K extends NoticeEntry['kind']> = Omit<Extract<NoticeEntry, { kind: K }>, 'type' | 'at' | 'seq' | 'month' | 'phase'>;
/** A sabotage notice as mule-game's notify takes it: the month and phase are its own to add. */
export type SabotageFact = Capture<'sabotage'> | Capture<'investigation'> | Capture<'fine'>;

/** What happened to the orders between two lists, in the list's order; the one place both the notices and the news read from. */
type Change =
  | { what: 'resolved'; order: SabotageOrder }
  | { what: 'void'; was: SabotageOrder }
  | { what: 'investigated'; order: SabotageOrder }
  | { what: 'fined'; order: SabotageOrder };

function changes(state: GameState, before: readonly SabotageOrder[], after: readonly SabotageOrder[]): Change[] {
  const was = new Map(before.map((o) => [o.id, o]));
  const out: Change[] = [];
  for (const order of after) {
    const old = was.get(order.id);
    if (old?.outcome === 'pending' && order.outcome !== 'pending') out.push({ what: 'resolved', order });
    if (old && old.investigated == null && order.investigated != null) out.push({ what: 'investigated', order });
    if (old && !old.fine && order.fine) out.push({ what: 'fined', order });
  }
  // A pending order gone from the list outside planning was void; in planning it was withdrawn, which is nobody's business.
  if (state.phase !== 'planning') {
    const kept = new Set(after.map((o) => o.id));
    for (const old of before) if (old.outcome === 'pending' && !kept.has(old.id)) out.push({ what: 'void', was: old });
  }
  return out;
}

/**
 * The record's notices for what changed between two lists of orders (S4-RULE-12). A done or caught order, an
 * investigation and a fine are public; the orderer's own failed or void order is private to them, with its culprit.
 */
export function sabotageNotices(state: GameState, before: readonly SabotageOrder[], after: readonly SabotageOrder[]): SabotageFact[] {
  return changes(state, before, after).map((change): SabotageFact => {
    if (change.what === 'void') {
      const { id, target, by } = change.was;
      return { kind: 'sabotage', order: id, target: target.kind, victim: null, outcome: 'void', culprit: by, parties: [by!] };
    }
    const o = change.order;
    if (change.what === 'investigated') return { kind: 'investigation', order: o.id, solved: o.culpritPublic, culprit: culpritSeen(o, EVERYONE) ? o.by : null };
    if (change.what === 'fined') return { kind: 'fine', order: o.id, culprit: o.by!, due: o.fine!.due, paid: o.fine!.paid, toVictim: o.fine!.toVictim };
    const base = { kind: 'sabotage' as const, order: o.id, target: o.target.kind, victim: o.victim ?? null };
    if (orderSight(o, EVERYONE) === 'none') return { ...base, outcome: 'failed', culprit: o.by, parties: [o.by!] };
    return { ...base, outcome: o.outcome as 'done' | 'caught', culprit: culpritSeen(o, EVERYONE) ? o.by : null };
  });
}

/** The orders that went void between two lists, as they stood while pending: the server's own record of them (S4-RULE-3 row 1). */
export function voidedOrders(state: GameState, before: readonly SabotageOrder[], after: readonly SabotageOrder[]): SabotageOrder[] {
  // Frozen at the void: its crop is read now (into `good`), and the view reads only that, so a MULE put back on the plot
  // later cannot rewrite the orderer's entry.
  return changes(state, before, after).flatMap((change) => {
    if (change.what !== 'void') return [];
    const good = cutGood(state, change.was);
    const { good: _was, ...order } = structuredClone(change.was);
    return [{ ...order, ...(good ? { good } : {}) }];
  });
}

const capital = (words: string): string => words[0]!.toUpperCase() + words.slice(1);

/** The plot or the rumour an order was about, in words: "the power cut on Ossa's Food plot". */
function aboutOrder(state: GameState, o: SabotageOrder, nameOf: (seatId: string) => string): string {
  const t: SabotageTarget = o.target;
  if (t.kind === 'rumour') return `the ${goodWords(t.good)} rumour`;
  return `the power cut on ${plotWords(state, o, nameOf)}`;
}

/**
 * The news for what changed between two lists of orders (S4-RULE-12's leak points): lines only for public facts, so a
 * failed unseen or void order says nothing. A worked unseen order says "someone"; a catch, a solved case and a fine name
 * the culprit.
 */
export function sabotageNews(state: GameState, before: readonly SabotageOrder[], after: readonly SabotageOrder[], nameOf: (seatId: string) => string): NewsLine[] {
  const lines: NewsLine[] = [];
  for (const change of changes(state, before, after)) {
    if (change.what === 'void') continue;
    const o = change.order;
    if (orderSight(o, EVERYONE) === 'none') continue;
    const culprit = culpritSeen(o, EVERYONE) ? nameOf(o.by!) : null;
    const who = [...(culprit ? [o.by!] : []), ...(o.victim ? [o.victim] : [])];
    const target = o.target;
    if (change.what === 'investigated') {
      const text = culprit ? `Solved by the Sheriff: it was ${culprit}, behind ${aboutOrder(state, o, nameOf)}.` : `The trail went cold on ${aboutOrder(state, o, nameOf)}.`;
      lines.push({ text, who });
    } else if (change.what === 'fined') {
      const { paid, toVictim } = o.fine!;
      lines.push({ text: `${nameOf(o.by!)} was fined ${paid} for sabotage${o.victim && toVictim > 0 ? `; ${toVictim} to ${nameOf(o.victim)}` : ''}.`, who });
    } else if (target.kind === 'powerCut') {
      const plot = plotWords(state, o, nameOf);
      if (!culprit) lines.push({ text: `Sabotage: someone cut the power to ${plot}.`, who });
      else if (eventOf(state, o)?.sabotage?.guarded) lines.push({ text: `Caught! ${culprit} tried to cut the power to ${plot}; a guard stopped it.`, who });
      else lines.push({ text: `Caught! ${culprit} ${o.worked ? 'cut' : 'tried to cut'} the power to ${plot}.`, who });
    } else if (!culprit) {
      lines.push({ text: eventOf(state, o)?.line ?? `A rumour: ${capital(goodWords(target.good))} moves ${target.dir === 'up' ? 'higher' : 'lower'} at the auction.`, who });
    } else {
      lines.push({ text: `Caught! ${culprit} spread a rumour that ${goodWords(target.good)} would go ${target.dir}.`, who });
    }
  }
  return lines;
}
