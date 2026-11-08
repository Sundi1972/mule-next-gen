import { COLONY, GOODS, POLITICS, PRESTIGE, type BudgetLine, type DealCard, type DealOffer, type LawProposal, type Office, type OverruleTarget, type OverruleWhy, type PrestigeId, type Terrain } from '@mule/engine';
import type { BudgetView, ChatMessage, MarketRow, ColonyView, CouncilView, ElectionView, ListingView, MuleIntent, MuleView, MyView, OverruleView, PlayerView, PoliticsView, TableView, TileView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import type { TableClient } from '../../../../apps/web/src/net/client';
import { aMuleView, aPlayer } from '../../../../apps/web/test/fixtures/views';
import { SABOTAGE, sheriffOf } from './copied/sheriff/fixture';

/**
 * The hub-tabs mock's one table. Merged from the two mocks it re-hosts, so every tab draws from the same month:
 * - design/mocks/politics-deals/src/fixture.ts (the MockTable store, deal cards, reputation, the ballots' "You promised");
 * - design/mocks/politics-budget/src/fixture.ts (the budget, the overrule call and ballot, the colony and its fund).
 * Fixture data only; no backend. The intents are the real MuleIntents, and the store answers them as the server would.
 *
 * The cast differs from both, because this mock needs a human Governor's phone AND an AI seat that offers a card:
 * - Lena, no office: the phone most states are drawn on.
 * - Brix, the Governor (term months 4–7, promised "up to 10%"), raised the tax from 5% to 10%; runs again in month 8.
 * - Kai, the Sheriff: the seat that calls the overrule vote.
 * - Ossa · AI, the Land Baron: runs for Governor; offers Lena a pact card.
 */

// ---- Config the slices add that is not on trunk yet (copied from the two fixtures above) ----

/** Slice 3 §3 `deals: { maxOpenOffers: 3, pactMonths: [1, 3, 6] }`. */
export const DEALS = { maxOpenOffers: 3, pactMonths: [1, 3, 6] } as const;
/** Slice 3 §3 `reputation.moves`. */
export const MOVES = { kept: 3, voteBroken: -10, pactBroken: -20 } as const;
/** Slice 3 §3 `ai.deals.refuseBelow` (S3-RULE-9). */
export const REFUSE_BELOW = 30;
const AI_PAUSE_MS = 1600;
/** Slice 5 §3.3 POLITICS.budget (placeholders). */
export const BUDGET = { step: 5, projects: { maxShare: 100, maxCredits: null }, welfare: { maxShare: 20, maxCredits: 200 } } as const;
export const REVEAL_MS = 4_000;
export const LINES = ['projects', 'welfare'] as const satisfies readonly BudgetLine[];
export type RcLine = (typeof LINES)[number];
export type Shares = Record<RcLine, number>;
export const TAX_START = 5;
export const TAX_RAISED = 10;
export const FUND = 640;
export const spare = (fund: number) => Math.max(0, fund - COLONY.reserve);
export function creditsOf(line: RcLine, share: number, fund = FUND): number {
  const raw = Math.floor((share * spare(fund)) / 100);
  const cap = BUDGET[line].maxCredits;
  return cap === null ? raw : Math.min(raw, cap);
}

// ---- The map: the politics frame's (design/mocks/politics-frame/src/fixture.ts) ----

export const W = 15;
export const H = 9;
const ROWS = [
  'mmhppfrrpsdddtt',
  'mhppffrrppsddti',
  'hppplfrrppcsdti',
  'pppllprrpphhdii',
  'ppfpppSrrpphhmm',
  'fppvpprrpppdmmm',
  'ffppprrpplpdhmm',
  'sfpppprpplldhhm',
  'ssfpprrppplddhh',
];
const T: Record<string, Terrain> = {
  m: 'mountains', h: 'hills', p: 'plains', f: 'forest', r: 'river', s: 'swamp', d: 'desert', t: 'tundra', i: 'ice',
  l: 'lake', c: 'crater', v: 'volcanic', S: 'store',
};
const OWNED: Record<string, string> = {
  '6,2': 'lena', '7,2': 'lena', '7,3': 'lena', '6,5': 'lena', '5,5': 'lena', '4,3': 'lena', '5,6': 'lena',
  '12,4': 'ossa', '13,4': 'ossa', '12,5': 'ossa', '10,2': 'ossa', '1,4': 'ossa', '2,6': 'ossa', '11,1': 'ossa', '12,6': 'ossa',
  '9,2': 'brix', '10,3': 'brix', '11,3': 'brix', '3,2': 'brix', '4,5': 'brix', '3,5': 'brix', '8,6': 'brix',
  '9,7': 'kai', '10,7': 'kai', '3,6': 'kai', '6,7': 'kai', '13,1': 'kai',
};
const TILES: TileView[] = ROWS.flatMap((row, y) =>
  [...row].map((c, x): TileView => {
    const terrain = T[c]!;
    return { x, y, terrain, peaks: terrain === 'mountains' ? 1 + ((x + y) % 3) : 0, owner: OWNED[`${x},${y}`] ?? null, outfit: null, pollution: 0, filter: false } as TileView;
  }),
);

// ---- The seats ----

/** The phones this mock draws. Ossa is an AI seat: no phone. */
export type Seat = 'lena' | 'brix' | 'kai';
export const SEAT_LABEL: Record<Seat, string> = { lena: 'Lena · no office', brix: 'Brix · Governor', kai: 'Kai · Sheriff' };
export const GOVERNOR = 'brix';
export const SHERIFF = 'kai';
export const BARON = 'ossa';

const BASE_PLAYERS: PlayerView[] = [
  aPlayer({ id: 'lena', name: 'Lena', slot: 0, species: 'zipwing', money: 640, plots: 7, worth: 4210, lastWorth: 4020 }),
  aPlayer({ id: 'ossa', name: 'Ossa', slot: 1, species: 'bramblet', isAi: true, ready: true, money: 910, plots: 8, worth: 5120, lastWorth: 4890 }),
  aPlayer({ id: 'brix', name: 'Brix', slot: 2, species: 'gearling', money: 380, plots: 7, worth: 3880, lastWorth: 3950 }),
  aPlayer({ id: 'kai', name: 'Kai', slot: 3, species: 'mollox', money: 215, plots: 5, worth: 2950, lastWorth: 2900 }),
];
export const NAME: Record<string, string> = Object.fromEntries(BASE_PLAYERS.map((p) => [p.id, p.name]));

/** Vote weights summing to 9, so "needs 5 of 9" (S5-RULE-8). Ossa, the Land Baron, weighs 3. */
export const VOTES: Record<string, number> = { lena: 2, ossa: 3, brix: 2, kai: 2 };
export const TOTAL_VOTES = Object.values(VOTES).reduce((a, b) => a + b, 0);
export const NEEDED = Math.floor(TOTAL_VOTES / 2) + 1;

// ---- The world: what the mock's server holds ----

/**
 * planning: the month's hub. election: month 8's Governor ballot (Brix against Ossa · AI). lawBallot: Brix's land tax
 * up for the Council's vote. overrule: Kai's call on the tax, its ballot open as planning ends. overruleReveal: that
 * ballot's result, on every screen. monthEnd: the month's end (upkeep), with what the fund paid out and the cards broken.
 */
export type Stage = 'planning' | 'election' | 'lawBallot' | 'overrule' | 'overruleReveal' | 'monthEnd';

export interface World {
  month: number;
  stage: Stage;
  cards: DealCard[];
  rep: Record<string, number>;
  unrest: Record<string, number[]>;
  chat: ChatMessage[];
  ready: string[];
  ballots: Record<string, Partial<Record<Office, string>>>;
  lawBallots: Record<string, boolean | null>;
  toasts: Record<string, { id: number; message: string }[]>;
  news: string[];
  tax: number;
  budget: { shares: Shares; setBy: string | null };
  /** Who called this month's overrule on the tax, or null. */
  call: string | null;
  overruleBallots: Record<string, boolean>;
  overruleDone: string[];
  /** Food, Energy, Water this seat needs this month: Lena is short one Energy. */
  short: boolean;
  /** Lena’s needs and holdings set outright (the Overview height check); when set, it wins over `short`. */
  needs?: { need: Partial<MyView['stock']>; have: Partial<MyView['stock']> };
  /** No law pending and no election to come (the Overview height check's bare table): This month loses both rows. */
  bare?: boolean;
  /** Who pressed Continue in the overrule's reveal. */
  continued: string[];
  /** Buildings the Governor commissioned this month (the Commission intent), beyond the fixture's Observatory. */
  commissioned: PrestigeId[];
  /** Tile indices (y * W + x) the Sheriff guards this month: the `guard {tiles}` intent, MyPoliticsView.sheriff.guards. Never on the TV. */
  guards: number[];
  /** Plots and MULEs listed for the auction after planning (the list / unlist intents). */
  listings: ListingView[];
}

/**
 * The mock table's world, as the TV pane (src/tv/**, mock-hub-tv) receives it. STABLE: its name and shape stay as
 * they are from 8 Nov 03:40Z; fields may be added, never renamed or removed. Build a screen's view with viewFor
 * (a phone) or boardViewFor (the TV).
 */
export type MockWorld = World;

const LAND_TAX: LawProposal = { kind: 'enact', law: 'landTax', setting: 10 };
const IMPACT = { lena: { cost: 70 }, ossa: { cost: 80 }, brix: { cost: 70 }, kai: { cost: 50 } };

export const CHAT: ChatMessage[] = [
  { id: 1, from: 'kai', text: 'Smithore is going to spike. Just saying.', at: 1 },
  { id: 2, from: 'brix', to: 'lena', text: 'Ossa is leading. Let’s not hurt each other?', at: 2 },
  { id: 3, from: 'lena', to: 'brix', text: 'Deal. And I could use a Governor who keeps the tax low.', at: 3 },
  { id: 4, from: 'brix', to: 'lena', text: 'Then vote for me in month 8.', at: 4 },
  { id: 5, from: 'ossa', text: 'Vote Ossa: the tax goes back to 5%.', at: 5 },
];

export const DEFAULT_SHARES: Shares = { projects: 100, welfare: 0 };
export const SET_SHARES: Shares = { projects: 80, welfare: 10 };

export function baseWorld(over: Partial<World> = {}): World {
  return {
    month: 5,
    stage: 'planning',
    cards: [],
    rep: { lena: 50, ossa: 72, brix: 61, kai: 44 },
    unrest: { kai: [3] },
    chat: CHAT,
    ready: [],
    ballots: {},
    lawBallots: {},
    toasts: {},
    news: ['Brix sets the sales tax at 10%, up from 5%.', 'The export ship calls in month 6.'],
    tax: TAX_RAISED,
    budget: { shares: SET_SHARES, setBy: GOVERNOR },
    call: null,
    overruleBallots: {},
    overruleDone: [],
    short: true,
    continued: [],
    commissioned: [],
    guards: [6 + 5 * 15],
    listings: [],
    ...over,
  };
}

export function card(c: Partial<DealCard> & Pick<DealCard, 'id' | 'from' | 'to' | 'terms'>): DealCard {
  return { offered: 5, until: 7, status: 'offered', brokenBy: null, settled: null, ...c };
}
export const PACT = { kind: 'pact' } as const;
export const VOTE_BRIX = { kind: 'vote', office: 'governor', candidate: 'brix' } as const;

/** Brix offers Lena a one-month pact; Ossa · AI offers her a three-month pact. Both wait for Lena. */
export const OFFER_FROM_BRIX = card({ id: 'deal-q7k2m9', from: 'brix', to: 'lena', terms: PACT, until: 5 });
export const OFFER_FROM_OSSA = card({ id: 'deal-b3x8re', from: 'ossa', to: 'lena', terms: PACT, until: 7 });
/** Lena's promise, active: her vote for Brix in month 8. */
export const PROMISED_BRIX = card({ id: 'deal-m1v0tz', from: 'lena', to: 'brix', terms: VOTE_BRIX, offered: 4, until: 8, status: 'active' });
/** Ossa · AI's vote card to Kai (its vote for Brix), broken by Ossa this month: the TV's break moment and the month end's "✗ −10". */
export const OSSA_BROKE = card({ id: 'deal-e4r7lb', from: 'ossa', to: 'kai', terms: VOTE_BRIX, offered: 4, until: 5, status: 'broken', brokenBy: 'ossa', settled: 5 });
/** Kai's pact with Lena, broken by Kai at month 4's end (Kai's plot outbid Lena's at the auction it promised to leave). */
export const BROKEN_BY_KAI = card({ id: 'deal-k9p4wd', from: 'lena', to: 'kai', terms: PACT, offered: 3, until: 5, status: 'broken', brokenBy: 'kai', settled: 4 });

// ---- The rules the mock plays (deals: S3-RULE-1/2/4; budget and overrule: S5-RULE-1/6/8) ----

const TAGS = ['h2c6sn', 'u8f3ja', 'z5n1yq', 'e4r7lb', 'r2d7ka', 'w9t3pm'];
const sameBallot = (a: DealCard['terms'], b: DealCard['terms']) => a.kind === 'vote' && b.kind === 'vote' && ('law' in a ? 'law' in b : 'office' in b && a.office === b.office);
const sameChoice = (a: DealCard['terms'], b: DealCard['terms']) => JSON.stringify(a) === JSON.stringify(b);

export function dealUntil(month: number, offer: DealOffer): number {
  if (offer.terms.kind === 'pact') return month + (offer.months ?? 1) - 1;
  return 'law' in offer.terms ? month + 1 : 8;
}

function offer(w: World, from: string, o: DealOffer): World | string {
  const to = NAME[o.to] ?? 'them';
  const mine = w.cards.filter((c) => c.from === from && c.status === 'offered');
  if (mine.length >= DEALS.maxOpenOffers) return `You have ${mine.length} cards waiting for an answer`;
  if (mine.some((c) => c.to === o.to)) return `${to} has not answered your last card`;
  if (o.terms.kind === 'pact' && w.cards.some((c) => c.terms.kind === 'pact' && (c.status === 'offered' || c.status === 'active') && [c.from, c.to].includes(from) && [c.from, c.to].includes(o.to)))
    return `You already have a pact with ${to}`;
  if (o.terms.kind === 'vote' && 'candidate' in o.terms && o.terms.candidate === from) return 'Promise your vote to someone else';
  if (w.cards.some((c) => c.from === from && (c.status === 'offered' || c.status === 'active') && sameBallot(c.terms, o.terms) && !sameChoice(c.terms, o.terms)))
    return 'You already promised your vote on this ballot';
  const id = `deal-${TAGS[w.cards.length % TAGS.length]}`;
  return { ...w, cards: [card({ id, from, to: o.to, terms: o.terms, offered: w.month, until: dealUntil(w.month, o) }), ...w.cards] };
}

function settle(w: World, id: string, status: DealCard['status']): World {
  return { ...w, cards: w.cards.map((c) => (c.id === id ? { ...c, status, settled: status === 'active' ? null : w.month } : c)) };
}

export interface MockTable {
  get(): World;
  set(w: World): void;
  subscribe(l: () => void): () => void;
  act(seat: string, intent: MuleIntent): void;
  say(seat: string, text: string, to?: string): void;
  dismiss(seat: string, id: number): void;
}

export function mockTable(start: World): MockTable {
  let world = start;
  let toastId = 1;
  const listeners = new Set<() => void>();
  const set = (w: World) => {
    world = w;
    for (const l of listeners) l();
  };
  const refuse = (seat: string, message: string) => set({ ...world, toasts: { ...world.toasts, [seat]: [{ id: toastId++, message }] } });
  const aiAnswers = (id: string) =>
    setTimeout(() => {
      const c = world.cards.find((x) => x.id === id);
      if (!c || c.status !== 'offered') return;
      set(settle(world, id, (world.rep[c.from] ?? 50) < REFUSE_BELOW ? 'declined' : 'active'));
    }, AI_PAUSE_MS);
  return {
    get: () => world,
    set,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    act(seat, intent) {
      switch (intent.type) {
        case 'offerDeal': {
          const next = offer(world, seat, intent.offer);
          if (typeof next === 'string') return refuse(seat, next);
          set(next);
          if (BASE_PLAYERS.find((p) => p.id === intent.offer.to)?.isAi) aiAnswers(next.cards[0]!.id);
          return;
        }
        case 'withdrawDeal': {
          const c = world.cards.find((x) => x.id === intent.id);
          if (!c || c.status !== 'offered' || c.from !== seat) return refuse(seat, 'That card is no longer open');
          return set(settle(world, intent.id, 'withdrawn'));
        }
        case 'answerDeal': {
          const c = world.cards.find((x) => x.id === intent.id);
          if (!c || c.status !== 'offered' || c.to !== seat) return refuse(seat, 'That card is no longer open');
          return set(settle(world, intent.id, intent.accept ? 'active' : 'declined'));
        }
        case 'vote':
          return set({ ...world, ballots: { ...world.ballots, [seat]: { ...world.ballots[seat], [intent.office]: intent.candidate ?? '' } } });
        case 'voteLaw':
          return set({ ...world, lawBallots: { ...world.lawBallots, [seat]: intent.yes } });
        case 'setTax':
          return seat === GOVERNOR && world.stage === 'planning' ? set({ ...world, tax: intent.percent }) : undefined;
        case 'setBudget':
          return seat === GOVERNOR && world.stage === 'planning' ? set({ ...world, budget: { shares: { projects: intent.shares.projects, welfare: intent.shares.welfare }, setBy: seat } }) : undefined;
        case 'callOverrule':
          if (world.stage !== 'planning') return;
          if (intent.target === null) return world.call === seat ? set({ ...world, call: null }) : undefined;
          return !world.call && seat !== GOVERNOR && world.tax !== TAX_START ? set({ ...world, call: seat }) : undefined;
        case 'voteOverrule':
          return world.stage === 'overrule' ? set({ ...world, overruleBallots: { ...world.overruleBallots, [seat]: intent.yes } }) : undefined;
        case 'commission':
          return seat === GOVERNOR && !world.commissioned.includes(intent.id) ? set({ ...world, commissioned: [...world.commissioned, intent.id] }) : undefined;
        case 'list':
          return set({ ...world, listings: [...world.listings, { id: `lot-${world.listings.length + 1}`, seller: seat, item: intent.item.kind === 'plot' ? { kind: 'plot', x: intent.item.x, y: intent.item.y } : { kind: 'mule', x: intent.item.x, y: intent.item.y, outfit: 'food' }, minimum: intent.minimum, unsold: intent.unsold, storePays: Math.floor(intent.minimum / 2) }] });
        case 'unlist':
          return set({ ...world, listings: world.listings.filter((l) => l.id !== intent.id || l.seller !== seat) });
        case 'guard':
          return seat === SHERIFF ? set({ ...world, guards: intent.tiles }) : undefined;
        case 'ready':
          if (world.stage === 'overruleReveal') return set({ ...world, continued: world.continued.includes(seat) ? world.continued : [...world.continued, seat] });
          if (world.stage === 'overrule') return set({ ...world, overruleDone: world.overruleDone.includes(seat) ? world.overruleDone : [...world.overruleDone, seat] });
          return set({ ...world, ready: world.ready.includes(seat) ? world.ready : [...world.ready, seat] });
        default:
          return;
      }
    },
    say(seat, text, to) {
      set({ ...world, chat: [...world.chat, { id: world.chat.length + 100, from: seat, ...(to ? { to } : {}), text, at: world.chat.length + 100 }] });
    },
    dismiss(seat, id) {
      set({ ...world, toasts: { ...world.toasts, [seat]: (world.toasts[seat] ?? []).filter((t) => t.id !== id) } });
    },
  };
}

// ---- The views the server would send each seat ----

const NONE = Object.fromEntries(GOODS.map((g) => [g, 0])) as MyView['stock'];

/** The store's month-5 prices and stock, as the real game draws them (the ws6-ux fixture's rows, plus Alloy). */
const row = (good: MarketRow['good'], price: number, storeStock: number, cover: number): MarketRow =>
  ({ good, price, storeBuys: Math.floor(price * 0.9), storeSells: storeStock > 0 ? Math.ceil(price * 1.1) : null, storeStock, cover, demand: 10, shipPays: null }) as MarketRow;
export const MARKET: MarketRow[] = [row('food', 31, 12, 2.1), row('water', 27, 9, 2.6), row('energy', 26, 7, 1.4), row('smithore', 60, 2, 0.6), row('crystite', 96, 0, 4), row('alloy', 140, 1, 1.2)];
export const STORE_MULES = 5;
export const MULE_PRICE = 148;

function reasons(w: World): PoliticsView['reputationReasons'] {
  const out: NonNullable<PoliticsView['reputationReasons']> = {};
  for (const p of BASE_PLAYERS) {
    const broken = w.cards.filter((c) => c.status === 'broken' && c.brokenBy === p.id).map((c) => ({ month: c.settled ?? 0, r: { kind: 'broken' as const, id: c.id } }));
    const unrest = (w.unrest[p.id] ?? []).map((m) => ({ month: m, r: { kind: 'unrest' as const, month: m } }));
    out[p.id] = [...broken, ...unrest].sort((a, b) => b.month - a.month).map((x) => x.r);
  }
  return out;
}

function election(w: World): ElectionView | null {
  if (w.stage !== 'election') return null;
  const humans = ['lena', 'brix', 'kai'];
  const voted = humans.filter((h) => w.ballots[h]?.governor !== undefined);
  return {
    stage: 'ballot', ceremony: null,
    candidates: { governor: ['brix', 'ossa'] },
    promises: { brix: { kind: 'cap', percent: 10 }, ossa: { kind: 'cap', percent: 5 } },
    voted: ['ossa', ...voted], done: ['ossa'], waitingFor: humans, result: {},
  };
}

function council(w: World): CouncilView | null {
  if (w.stage !== 'lawBallot') return null;
  const voted = ['lena', 'brix', 'kai'].filter((h) => w.lawBallots[h] !== undefined && w.lawBallots[h] !== null);
  return { stage: 'ballot', proposal: LAND_TAX, proposer: GOVERNOR, impact: IMPACT, voted: ['ossa', ...voted], done: ['ossa'], waitingFor: ['lena', 'brix', 'kai'], clockMs: 0, revealMs: REVEAL_MS, result: null };
}

function promised(w: World, id: string): NonNullable<MyView['politics']>['promised'] {
  const out: NonNullable<NonNullable<MyView['politics']>['promised']> = { election: {}, law: null };
  for (const c of w.cards) {
    if (c.from !== id || c.status !== 'active' || c.terms.kind !== 'vote') continue;
    if ('law' in c.terms) out.law = { yes: c.terms.yes, to: [...(out.law?.to ?? []), c.to] };
    else out.election[c.terms.office] = { candidate: c.terms.candidate, to: [...(out.election[c.terms.office]?.to ?? []), c.to] };
  }
  return out;
}

/** Who Welfare would go to now (S5-RULE-4): the lowest Worth but the Governor's; Kai here. */
function welfareTo(governor: string): string | null {
  return BASE_PLAYERS.filter((p) => p.id !== governor).sort((a, b) => a.worth - b.worth)[0]?.id ?? null;
}

function budgetView(w: World): BudgetView {
  const { shares } = w.budget;
  return {
    lines: LINES.map((line) => ({ line, share: shares[line], start: DEFAULT_SHARES[line], maxShare: BUDGET[line].maxShare, step: BUDGET.step, credits: creditsOf(line, shares[line]), maxCredits: BUDGET[line].maxCredits })),
    kept: 100 - shares.projects - shares.welfare,
    welfareTo: welfareTo(GOVERNOR),
    setBy: w.budget.setBy,
    frozen: false,
  };
}

function tally(w: World): { passed: boolean; yes: number; no: number } {
  const sum = (yes: boolean) => Object.entries(w.overruleBallots).filter(([, v]) => v === yes).reduce((n, [id]) => n + (VOTES[id] ?? 0), 0);
  const yes = sum(true);
  return { passed: yes >= NEEDED, yes, no: sum(false) };
}

function overruleView(w: World): OverruleView | null {
  if (!w.call || w.stage === 'monthEnd') return null;
  const stage = w.stage === 'overrule' ? 'ballot' : w.stage === 'overruleReveal' ? 'reveal' : 'called';
  const players = BASE_PLAYERS.map((p) => p.id);
  return {
    target: 'tax', caller: w.call, stage,
    restores: { tax: TAX_START }, stands: { tax: w.tax },
    voted: Object.keys(w.overruleBallots), done: w.overruleDone,
    waitingFor: stage === 'ballot' ? players.filter((id) => !w.overruleDone.includes(id)) : [],
    clockMs: stage === 'reveal' ? REVEAL_MS : 0, revealMs: REVEAL_MS, total: TOTAL_VOTES, needed: NEEDED,
    result: stage === 'reveal' ? tally(w) : null,
  } satisfies OverruleView;
}
export { tally };

function canOverrule(w: World, id: string): Record<OverruleTarget, true | OverruleWhy> {
  const tax: true | OverruleWhy = w.stage !== 'planning' ? 'notNow' : id === GOVERNOR ? 'governor' : w.call ? 'called' : w.tax === TAX_START ? 'unchanged' : true;
  return { tax, budget: 'notYet', confidence: 'sheriffOnly' };
}

/**
 * Month 5's upkeep, by S5-RULE-3 on the budget spec's worked example (copied from design/mocks/politics-budget's
 * fixture): the fund holds 640, so 540 spare. Welfare 10% pays 54 to Kai; Projects 80% is a ceiling of 432, of which
 * the Observatory takes the 350 cr it still needs.
 */
export function upkeepOf(w: World) {
  const officePay = 80;
  const parkUpkeep = PRESTIGE.park.upkeep;
  const welfare = creditsOf('welfare', w.budget.shares.welfare);
  const limit = creditsOf('projects', w.budget.shares.projects);
  const project = Math.min(limit, PRESTIGE.observatory.credits);
  return { in: { grant: 200 }, out: { officePay, upkeep: parkUpkeep, welfare, project }, limit, balance: FUND - welfare - project };
}

function colonyView(w: World): ColonyView {
  const open = new Set<PrestigeId>(['park', 'observatory', ...w.commissioned]);
  const catalogue = (Object.keys(PRESTIGE) as PrestigeId[]).map((id) => {
    const p = PRESTIGE[id];
    return { id, name: p.name, credits: p.credits, goods: p.goods, buildMonths: p.buildMonths, prestige: p.prestige, upkeep: p.upkeep, commissionable: !open.has(id), why: open.has(id) ? 'Already commissioned' : null };
  });
  const obs = PRESTIGE.observatory;
  const monthEnd = w.stage === 'monthEnd';
  const up = upkeepOf(w);
  const commissioned = w.commissioned.map((id) => {
    const p = PRESTIGE[id];
    return { id, name: p.name, stage: 'commissioned' as const, cost: { credits: p.credits, goods: p.goods }, funded: { credits: 0, goods: {} }, buildMonths: p.buildMonths, monthsLeft: null, place: null, prestige: p.prestige, upkeep: p.upkeep, repairCost: null, plaque: [] };
  });
  return {
    gauges: { wealth: 18_400, environment: 31, prestige: 2, happiness: 58, band: 'content' },
    lastGauges: { wealth: 17_900, prestige: 2, happiness: 55 },
    fund: monthEnd ? up.balance : FUND,
    ledger: monthEnd ? { month: w.month, in: up.in, out: up.out } : null,
    projects: [
      {
        id: 'park', name: 'Park', stage: 'standing', cost: { credits: 210, goods: { alloy: 1 } }, funded: { credits: 210, goods: { alloy: 1 } }, buildMonths: 1, monthsLeft: null,
        place: { x: 1, y: 2, w: 1, h: 1 }, prestige: 2, upkeep: 15, repairCost: null, plaque: [{ playerId: 'lena', value: 120 }],
      },
      {
        id: 'observatory', name: obs.name, stage: 'commissioned', cost: { credits: obs.credits, goods: obs.goods }, funded: { credits: monthEnd ? up.out.project : 0, goods: {} }, buildMonths: obs.buildMonths, monthsLeft: null,
        place: null, prestige: obs.prestige, upkeep: obs.upkeep, repairCost: null, plaque: [{ playerId: 'brix', value: 70 }],
      },
      ...commissioned,
    ] as ColonyView['projects'],
    catalogue,
    score: { wealth: 18_400, environment: -310, prestige: 1_200, factor: 1, total: 19_290 },
    lastScore: 18_950,
    welfare: monthEnd ? { month: w.month, to: welfareTo(GOVERNOR) ?? 'kai', paid: up.out.welfare } : null,
  };
}

export interface SeatView {
  view: MuleView;
  me: MyView;
  self: PlayerView;
  table: TableView<MuleView>;
  slot: Slot;
}

/** Whether a seat has nothing left to do in this moment: Ready in planning, Done in the ballot, Continue in the reveal. */
function readyIn(w: World, p: PlayerView): boolean {
  if (p.isAi) return true;
  if (w.stage === 'overrule') return w.overruleDone.includes(p.id);
  if (w.stage === 'overruleReveal') return w.continued.includes(p.id);
  return w.ready.includes(p.id);
}

/** The public half of every view: what the server sends everyone, the TV included. */
function gameOf(w: World, me: MyView | null): MuleView {
  const players = BASE_PLAYERS.map((p) => ({ ...p, reputation: w.rep[p.id] ?? 50, ready: readyIn(w, p) }));
  const votesOpen = w.stage === 'election' || w.stage === 'lawBallot';
  const monthEnd = w.stage === 'monthEnd';
  const politics: PoliticsView = {
    governor: GOVERNOR, sheriff: SHERIFF, term: [4, 7], next: w.bare ? null : 8, baron: BARON,
    tax: { percent: w.tax, start: TAX_START, low: 0, high: 10 }, fund: monthEnd ? upkeepOf(w).balance : FUND, pay: { governor: 50, sheriff: 30 },
    weights: players.map((p) => ({ id: p.id, votes: VOTES[p.id] ?? 1, parts: { base: 1, land: 0, reputation: 0, baron: p.id === BARON ? 1 : 0, taxes: (VOTES[p.id] ?? 1) - 1 - (p.id === BARON ? 1 : 0) } })),
    candidates: w.stage === 'election' ? {} : { governor: ['brix', 'ossa'] },
    promises: { brix: { kind: 'cap', percent: 10 }, ossa: { kind: 'cap', percent: 5 } },
    promise: { kind: 'cap', percent: 10 }, promiseFrom: TAX_START,
    election: election(w),
    proposal: w.stage === 'planning' && !votesOpen && !w.bare ? { by: GOVERNOR, month: w.month, proposal: LAND_TAX, impact: IMPACT } : null,
    council: council(w),
    laws: { exportTax: { setting: 10, since: 3 } } as PoliticsView['laws'],
    retry: {},
    brokenDeals: w.cards.filter((c) => c.status === 'broken'),
    reputationReasons: reasons(w),
    budget: budgetView(w),
    overrule: overruleView(w),
    // Slice 4 (WS8's P2 fixture): the colony's sabotage cases, public; the Sheriff's own desk is on the Sheriff's MyView.
    sabotage: SABOTAGE,
  } as PoliticsView;
  return aMuleView({
    players, me: me as MyView, politics, news: w.news,
    month: w.month, phase: monthEnd ? 'upkeep' : 'planning', width: W, height: H, tiles: TILES,
    colony: colonyView(w),
    treasury: { money: politics.fund, salesTax: w.tax / 100 },
    colonists: 1_240, air: { level: 31, band: 'clean' }, lastAir: { level: 33, band: 'clean' }, colonistsFed: true,
    ship: { inPort: false, arrives: 6 } as MuleView['ship'],
    listings: w.listings,
    market: MARKET,
    storeMules: STORE_MULES,
    mulePrice: MULE_PRICE,
  });
}

/** What the server sends this seat for this world: partyTo decides every card (S3-RULE-7). */
export function viewFor(seat: Seat, w: World): SeatView {
  const id = seat;
  const mine = w.cards.filter((c) => c.from === seat || c.to === seat);
  const open = mine.filter((c) => c.from === seat && c.status === 'offered').length;
  const mineBallot = w.overruleBallots[id];
  const me = {
    id,
    monthNeeds: w.needs && id === 'lena' ? { ...NONE, ...w.needs.need } : w.short && id === 'lena' ? { ...NONE, food: 4, energy: 4, water: 2 } : NONE,
    stock: w.needs && id === 'lena' ? { ...NONE, ...w.needs.have } : { ...NONE, food: 4, energy: 3, water: 2 },
    droneOrder: [], analysed: [], droneFound: [],
    politics: {
      running: id === 'brix' ? 'governor' : null, ballot: w.ballots[id] ?? {}, canRun: { governor: id === 'brix' ? 'running' : true }, paid: 320,
      reputation: w.rep[id] ?? 50, lawBallot: w.lawBallots[id] ?? null, promised: promised(w, id),
      overruleBallot: w.stage === 'overrule' || w.stage === 'overruleReveal' ? (mineBallot ?? null) : null,
      canOverrule: canOverrule(w, id),
      sheriff: id === SHERIFF ? { ...sheriffOf(w.guards), canAct: w.stage === 'planning' ? true : 'notPlanning' } : null,
      sabotage: { order: null, canOrder: true, owed: 0, mine: [] },
    },
    deals: { cards: mine, offersLeft: DEALS.maxOpenOffers - open, pactMonths: [...DEALS.pactMonths] },
    worthParts: { money: 640, goods: 180, plots: 7, land: 3500, mules: 0, muleValue: 0, office: 0, donated: 0, cut: 0 },
  } as unknown as MyView;
  const view = gameOf(w, me);
  const self = view.players.find((p) => p.id === id)!;
  const table = { code: 'MULE', status: 'playing', hostId: 'lena', boards: 1, seats: [], game: view } as unknown as TableView<MuleView>;
  return { view, me, self, table, slot: self.slot as Slot };
}

/** What the TV (a board, no seat) receives for this world: the public view, no `me`, no card but the broken ones. */
export function boardViewFor(w: World): { view: MuleView; table: TableView<MuleView> } {
  const view = gameOf(w, null);
  const table = { code: 'MULE', status: 'playing', hostId: 'lena', boards: 1, seats: [], game: view } as unknown as TableView<MuleView>;
  return { view, table };
}

/** A phone's client on the mock table: its chat (whispers to it only), its refusals, and the intents it sends. */
export function clientFor(store: MockTable, seat: Seat): TableClient {
  let seen: World | null = null;
  let state: unknown = null;
  const getState = () => {
    const w = store.get();
    if (w !== seen) {
      seen = w;
      const chat = w.chat.filter((m) => !m.to || m.to === seat || m.from === seat);
      state = { status: 'open', role: 'player', code: 'MULE', seatId: seat, view: viewFor(seat, w).table, chat, emotes: [], toasts: w.toasts[seat] ?? [], notice: null, clockOffset: 0, handoffCode: null };
    }
    return state;
  };
  return {
    subscribe: (l: () => void) => store.subscribe(l),
    getState,
    serverNow: () => 0,
    intent: (i: MuleIntent) => store.act(seat, i),
    chat: (text: string, to?: string) => store.say(seat, text, to),
    emote: () => {},
    dismiss: (id: number) => store.dismiss(seat, id),
    watch: () => {},
  } as unknown as TableClient;
}

export { POLITICS };

/** Unrest blame moves reputation by this (events.ts::applyEvents today). */
export const UNREST_MOVE = -1;
