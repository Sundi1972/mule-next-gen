import { GOODS, POLITICS, type DealCard, type DealOffer, type LawProposal, type Office, type Terrain } from '@mule/engine';
import type { ChatMessage, CouncilView, ElectionView, MuleIntent, MuleView, MyView, PlayerView, PoliticsView, TableView, TileView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import type { TableClient } from '../../../../apps/web/src/net/client';
import { aMuleView, aPlayer } from '../../../../apps/web/test/fixtures/views';

/**
 * Slice 3's mock table: the politics frame's month-5 table (P0), four seats, politics on, plus a small "world" the real
 * intents drive (offerDeal, withdrawDeal, answerDeal, vote, voteLaw, ready, chat). Every proposed component reads the
 * real contract that is already on trunk (MyView.deals, PlayerView.reputation, PoliticsView.brokenDeals and
 * .reputationReasons, MyPoliticsView.promised) and sends real MuleIntents. Fixture data only; no backend.
 *
 * Kai is a person here (the frame had him an AI) so the walk can show a phone that is not a party to a card: the
 * spec's "Other phones" column. Ossa is the AI seat that answers cards.
 */

// ---- Config the slice adds that is not on trunk yet (spec 2026-11-07-ws7-slice3-deals.md §3, config.ts POLITICS) ----

/** §3 `deals: { maxOpenOffers: 3, pactMonths: [1, 3, 6] }`. */
export const DEALS = { maxOpenOffers: 3, pactMonths: [1, 3, 6] } as const;
/** §3 `reputation.moves: { kept: 3, voteBroken: -10, pactBroken: -20 }`. */
export const MOVES = { kept: 3, voteBroken: -10, pactBroken: -20 } as const;
/** §3 `ai.deals.refuseBelow: 30` (S3-RULE-9 answer row 1). */
export const REFUSE_BELOW = 30;
/** S3-RULE-9: an AI seat answers "after a seeded pause" from POLITICS.ai.actMs; the mock waits this long. */
const AI_PAUSE_MS = 1600;
/** Unrest blame moves reputation by this (events.ts::applyEvents today). */
export const UNREST_MOVE = -1;

// ---- The map and the seats: the frame's (design/mocks/politics-frame/src/fixture.ts) ----

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
  '12,4': 'ossa', '13,4': 'ossa', '12,5': 'ossa', '10,2': 'ossa', '1,4': 'ossa', '2,6': 'ossa', '11,1': 'ossa',
  '9,2': 'brix', '10,3': 'brix', '11,3': 'brix', '3,2': 'brix', '4,5': 'brix', '3,5': 'brix', '8,6': 'brix',
  '9,7': 'kai', '10,7': 'kai', '3,6': 'kai', '6,7': 'kai', '13,1': 'kai',
};
const TILES: TileView[] = ROWS.flatMap((row, y) =>
  [...row].map((c, x): TileView => {
    const terrain = T[c]!;
    return { x, y, terrain, peaks: terrain === 'mountains' ? 1 + ((x + y) % 3) : 0, owner: OWNED[`${x},${y}`] ?? null, outfit: null, pollution: 0, filter: false } as TileView;
  }),
);

/** The seats a phone can be. Ossa is an AI seat: no phone. */
export type Seat = 'lena' | 'brix' | 'kai';
export const SEAT_NAME: Record<Seat, string> = { lena: 'Lena', brix: 'Brix', kai: 'Kai' };

const BASE_PLAYERS: PlayerView[] = [
  aPlayer({ id: 'lena', name: 'Lena', slot: 0, species: 'zipwing', money: 640, plots: 7, worth: 4210 }),
  aPlayer({ id: 'ossa', name: 'Ossa', slot: 1, species: 'bramblet', isAi: true, ready: true, money: 910, plots: 7, worth: 5120 }),
  aPlayer({ id: 'brix', name: 'Brix', slot: 2, species: 'gearling', money: 380, plots: 7, worth: 3880 }),
  aPlayer({ id: 'kai', name: 'Kai', slot: 3, species: 'mollox', money: 215, plots: 5, worth: 2950 }),
];
export const NAME: Record<string, string> = Object.fromEntries(BASE_PLAYERS.map((p) => [p.id, p.name]));

// ---- The world: what the mock's server holds ----

export type Stage = 'planning' | 'ballot' | 'lawBallot' | 'monthEnd';

export interface World {
  month: number;
  stage: Stage;
  cards: DealCard[];
  /** Public reputation, 0..100. */
  rep: Record<string, number>;
  /** Months each player was blamed for the unrest: a public reason. */
  unrest: Record<string, number[]>;
  chat: ChatMessage[];
  /** The phones that pressed Ready. */
  ready: string[];
  /** Each seat's secret election ballot (the engine's), and law ballot. */
  ballots: Record<string, Partial<Record<Office, string>>>;
  lawBallots: Record<string, boolean | null>;
  /** The latest refusal per seat, as the server's RuleError reaches that phone. */
  toasts: Record<string, { id: number; message: string }[]>;
  news: string[];
  /** For the month end: the month that just ended. */
  n: number;
}

const LAND_TAX: LawProposal = { kind: 'enact', law: 'landTax', setting: 10 };

export const CHAT: ChatMessage[] = [
  { id: 1, from: 'kai', text: 'Smithore is going to spike. Just saying.', at: 1 },
  { id: 2, from: 'brix', to: 'lena', text: 'Kai is leading. Let’s not hurt each other?', at: 2 },
  { id: 3, from: 'lena', to: 'brix', text: 'Deal. And I could use a Governor who keeps the tax low.', at: 3 },
  { id: 4, from: 'brix', to: 'lena', text: 'Then vote for me in month 8.', at: 4 },
  { id: 5, from: 'ossa', text: 'Vote Ossa: the tax stays at 8%.', at: 5 },
];

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
    news: ['The export ship calls in month 6.'],
    n: 0,
    ...over,
  };
}

/** A card as the engine would hold it. Ids are opaque (AM-2). */
export function card(c: Partial<DealCard> & Pick<DealCard, 'id' | 'from' | 'to' | 'terms'>): DealCard {
  return { offered: 5, until: 7, status: 'offered', brokenBy: null, settled: null, ...c };
}
export const PACT = { kind: 'pact' } as const;
export const VOTE_BRIX = { kind: 'vote', office: 'governor', candidate: 'brix' } as const;
export const VOTE_OSSA = { kind: 'vote', office: 'governor', candidate: 'ossa' } as const;
export const LAW_YES = { kind: 'vote', law: true, yes: true } as const;

// ---- The rules the mock plays (a subset of S3-RULE-1/2/4, enough for every state the spec walks) ----

const TAGS = ['q7k2m9', 'b3x8re', 'm1v0tz', 'k9p4wd', 'h2c6sn', 'u8f3ja', 'z5n1yq', 'e4r7lb'];
const isVote = (c: DealCard) => c.terms.kind === 'vote';
const sameBallot = (a: DealCard['terms'], b: DealCard['terms']) =>
  a.kind === 'vote' && b.kind === 'vote' && ('law' in a ? 'law' in b : 'office' in b && a.office === b.office);
const sameChoice = (a: DealCard['terms'], b: DealCard['terms']) => JSON.stringify(a) === JSON.stringify(b);

/** S3-RULE-1's until: a pact's last month; a vote's ballot month. */
export function dealUntil(month: number, offer: DealOffer): number {
  if (offer.terms.kind === 'pact') return month + (offer.months ?? 1) - 1;
  return 'law' in offer.terms ? month + 1 : 8;
}

/** offerDeal, S3-RULE-2: the rows a phone can reach, with the engine's words. */
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

/** The store the phones' clients share: the world, its listeners, and the intents. */
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
      // S3-RULE-9 row 1: a proposer below refuseBelow is declined; otherwise this AI (Ossa) takes a card that costs it nothing.
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
        case 'ready':
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

/** reputationReasons as the view carries it: broken cards and unrest, newest first (S3-RULE-7). Kept gains never. */
function reasons(w: World): PoliticsView['reputationReasons'] {
  const out: NonNullable<PoliticsView['reputationReasons']> = {};
  for (const p of BASE_PLAYERS) {
    const broken = w.cards.filter((c) => c.status === 'broken' && c.brokenBy === p.id).map((c) => ({ month: c.settled ?? 0, r: { kind: 'broken' as const, id: c.id } }));
    const unrest = (w.unrest[p.id] ?? []).map((m) => ({ month: m, r: { kind: 'unrest' as const, month: m } }));
    out[p.id] = [...broken, ...unrest].sort((a, b) => b.month - a.month).map((x) => x.r);
  }
  return out;
}

const weightOf = (rep: number) => {
  const { repHigh, repLow, repVotes } = POLITICS.weight;
  const reputation = rep >= repHigh ? repVotes : rep < repLow ? -repVotes : 0;
  return { base: 1, land: 0, reputation, baron: 0, taxes: 1 };
};

function election(w: World): ElectionView | null {
  if (w.stage !== 'ballot') return null;
  const humans = ['lena', 'brix', 'kai'];
  const voted = humans.filter((h) => w.ballots[h]?.governor !== undefined);
  return {
    stage: 'ballot', ceremony: null,
    candidates: { governor: ['brix', 'ossa'] },
    promises: { brix: { kind: 'cap', percent: 5 }, ossa: { kind: 'hold' } },
    voted: ['ossa', ...voted], done: ['ossa'], waitingFor: humans, result: {},
  };
}

function council(w: World): CouncilView | null {
  if (w.stage !== 'lawBallot') return null;
  const voted = ['lena', 'brix', 'kai'].filter((h) => w.lawBallots[h] !== undefined && w.lawBallots[h] !== null);
  return {
    stage: 'ballot', proposal: LAND_TAX, proposer: 'ossa',
    impact: { lena: { cost: 70 }, ossa: { cost: 70 }, brix: { cost: 70 }, kai: { cost: 50 } },
    voted: ['ossa', ...voted], done: ['ossa'], waitingFor: ['lena', 'brix', 'kai'], clockMs: 0, revealMs: 4000, result: null,
  };
}

/** promisedVotes for one seat: its active vote cards, by ballot (MyPoliticsView.promised). */
function promised(w: World, id: string): NonNullable<MyView['politics']>['promised'] {
  const out: NonNullable<NonNullable<MyView['politics']>['promised']> = { election: {}, law: null };
  for (const c of w.cards) {
    if (c.from !== id || c.status !== 'active' || c.terms.kind !== 'vote') continue;
    if ('law' in c.terms) out.law = { yes: c.terms.yes, to: [...(out.law?.to ?? []), c.to] };
    else out.election[c.terms.office] = { candidate: c.terms.candidate, to: [...(out.election[c.terms.office]?.to ?? []), c.to] };
  }
  return out;
}

export interface SeatView {
  view: MuleView;
  me: MyView;
  self: PlayerView;
  table: TableView<MuleView>;
  slot: Slot;
}

/** What the server sends this seat (`null`: the TV) for this world: partyTo decides every card (S3-RULE-7). */
export function viewFor(seat: Seat | null, w: World): SeatView {
  const id = seat ?? 'lena';
  const players = BASE_PLAYERS.map((p) => ({ ...p, reputation: w.rep[p.id] ?? 50, ready: p.isAi || w.ready.includes(p.id) }));
  const partyTo = (c: DealCard) => seat !== null && (c.from === seat || c.to === seat);
  const mine = w.cards.filter(partyTo);
  const open = mine.filter((c) => c.from === seat && c.status === 'offered').length;
  const politics: PoliticsView = {
    governor: 'ossa', sheriff: 'brix', term: [4, 7], next: 8, baron: 'ossa',
    tax: { percent: 8, start: 8, low: 3, high: 13 }, fund: 640, pay: { governor: 40, sheriff: 30 },
    weights: players.map((p) => {
      const parts = weightOf(p.reputation ?? 50);
      return { id: p.id, votes: Math.max(1, parts.base + parts.land + parts.reputation + parts.baron + parts.taxes), parts };
    }),
    candidates: w.stage === 'ballot' ? {} : { governor: ['brix', 'ossa'] },
    promises: { brix: { kind: 'cap', percent: 5 }, ossa: { kind: 'hold' } },
    promise: null, promiseFrom: 8,
    election: election(w),
    proposal: w.stage === 'planning' && w.month === 5 ? { by: 'ossa', month: 5, proposal: LAND_TAX, impact: { lena: { cost: 70 }, ossa: { cost: 70 }, brix: { cost: 70 }, kai: { cost: 50 } } } : null,
    council: council(w),
    laws: {}, retry: {},
    brokenDeals: w.cards.filter((c) => c.status === 'broken'),
    reputationReasons: reasons(w),
  };
  const me = {
    id, monthNeeds: NONE, stock: { ...NONE, food: 4, energy: 3 }, droneOrder: [], analysed: [], droneFound: [],
    politics: {
      running: id === 'brix' ? 'governor' : null, ballot: w.ballots[id] ?? {}, canRun: { governor: true }, paid: 320,
      reputation: w.rep[id] ?? 50, lawBallot: w.lawBallots[id] ?? null, promised: promised(w, id),
    },
    deals: seat === null ? null : { cards: mine, offersLeft: DEALS.maxOpenOffers - open, pactMonths: [...DEALS.pactMonths] },
    worthParts: { money: 640, goods: 180, plots: 7, land: 3500, mules: 0, muleValue: 0, office: 0, donated: 0, cut: 0 },
  } as unknown as MyView;
  const view = aMuleView({
    players, me, politics, news: w.news,
    month: w.month, phase: w.stage === 'monthEnd' ? 'upkeep' : 'planning', width: W, height: H, tiles: TILES,
  });
  const self = players.find((p) => p.id === id)!;
  const table = { code: 'MULE', status: 'playing', hostId: 'lena', boards: 1, seats: [], game: view } as unknown as TableView<MuleView>;
  return { view, me, self, table, slot: self.slot as Slot };
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

/** The TV's client: no seat, the public view. */
export function boardClient(store: MockTable): TableClient {
  let seen: World | null = null;
  let state: unknown = null;
  const getState = () => {
    const w = store.get();
    if (w !== seen) {
      seen = w;
      state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: viewFor(null, w).table, chat: w.chat.filter((m) => !m.to), emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null };
    }
    return state;
  };
  return { subscribe: (l: () => void) => store.subscribe(l), getState, serverNow: () => 0, intent: () => {}, watch: () => {} } as unknown as TableClient;
}

export const isVoteCard = isVote;
