import { COLONY, GOODS, PRESTIGE, type BudgetLine, type OverruleTarget, type OverruleWhy, type PrestigeId, type Terrain } from '@mule/engine';
import type { BudgetView, ColonyView, MuleView, MyView, OverruleView, PlayerView, PoliticsView, TableView, TileView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import type { TableClient } from '../../../../apps/web/src/net/client';
import { aMuleView, aPlayer } from '../../../../apps/web/test/fixtures/views';

/**
 * P3 · the Governor's budget and the overrule vote, month 5 at the politics frame's four-seat table (P0's map and
 * owners, design/mocks/politics-frame). Fixture data only, from WS7's slice-5 spec
 * (origin/ws7-politics-rc:docs/specs/2026-11-07-ws7-slice5-budget.md, "the spec" below).
 *
 * The month: Ossa governs and raised the sales tax from 5% to 10%; Brix calls an overrule vote on it; it is held as
 * planning ends. The fund holds 640 cr, so 540 above the reserve: the spec's §3 worked example (S5-RULE-3, S5-B-AC-2).
 */

// --- Numbers the spec names that trunk's config.ts does not carry yet -------------------------------------------

/** POLITICS.budget, the spec's §3.3 config row (S5-RULE-1's bounds): whole percent, in steps of 5. Placeholders. */
export const BUDGET = {
  step: 5,
  projects: { maxShare: 100, maxCredits: null },
  welfare: { maxShare: 20, maxCredits: 200 },
} as const;
/** POLITICS.overrule.revealMs, the spec's §3.3 config row: the reveal's clock, presentation only (S5-RULE-7). */
export const REVEAL_MS = 4_000;
/** The lines RC offers, in order (S5-RULE-1 rows 1–2; Security is after RC and gets no space here). */
export const LINES = ['projects', 'welfare'] as const satisfies readonly BudgetLine[];
export type RcLine = (typeof LINES)[number];
export type Shares = Record<RcLine, number>;

/** The month's sales tax: where planning opened it, and where Ossa set it (S5-UBER-AC-2: "from 5% to 10%"). */
export const TAX_START = 5;
export const TAX_RAISED = 10;
/** The fund now (the frame's 640), and what upkeep may share out: the fund above COLONY.reserve (S5-RULE-3 step 3). */
export const FUND = 640;
export const spare = (fund: number) => Math.max(0, fund - COLONY.reserve);

/** What a share pays at today's fund (budgetCredits, S5-RULE-3): floored, and capped for Welfare. */
export function creditsOf(line: RcLine, share: number, fund = FUND): number {
  const raw = Math.floor((share * spare(fund)) / 100);
  const cap = BUDGET[line].maxCredits;
  return cap === null ? raw : Math.min(raw, cap);
}

// --- The frame's table (P0), unchanged but for the vote weights and a human Governor ------------------------------

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

/** Ossa is a human Governor here (the frame had an AI), so the Governor's phone is a person's. Kai, last on Worth, is the AI. */
const BASE_PLAYERS: PlayerView[] = [
  aPlayer({ id: 'lena', name: 'Lena', slot: 0, species: 'zipwing', money: 640, plots: 7, worth: 4210, lastWorth: 4020 }),
  aPlayer({ id: 'ossa', name: 'Ossa', slot: 1, species: 'bramblet', money: 910, plots: 7, worth: 5120, lastWorth: 4890 }),
  aPlayer({ id: 'brix', name: 'Brix', slot: 2, species: 'gearling', money: 380, plots: 7, worth: 3880, lastWorth: 3950 }),
  aPlayer({ id: 'kai', name: 'Kai', slot: 3, species: 'mollox', isAi: true, ready: true, money: 215, plots: 5, worth: 2950, lastWorth: 2900 }),
];

/** ?six seats two more AI players, for measuring the TV against TV-FIT's six-seat floor (PM ruling, 6 Nov). */
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('six')) {
  BASE_PLAYERS.push(
    aPlayer({ id: 'mira', name: 'Mira', slot: 4, species: 'zipwing', isAi: true, ready: true, money: 300, plots: 5, worth: 3300, lastWorth: 3200 }),
    aPlayer({ id: 'tov', name: 'Tov', slot: 5, species: 'gearling', isAi: true, ready: true, money: 280, plots: 5, worth: 3100, lastWorth: 3150 }),
  );
}

/**
 * Vote weights summing to 9, so "needs 5 of 9" (S5-RULE-8: more than half of all votes; its example "total 9, needed 5").
 * Yes from Lena, Brix and Kai is 6: the spec's "Yes 6 · needed 5". Ossa, the Land Baron, weighs 3.
 */
export const VOTES: Record<string, number> = { lena: 2, ossa: 3, brix: 2, kai: 2, mira: 0, tov: 0 };
export const TOTAL_VOTES = Object.values(VOTES).reduce((a, b) => a + b, 0);
export const NEEDED = Math.floor(TOTAL_VOTES / 2) + 1;

// --- What the mock can show: a scene, and whose phone ------------------------------------------------------------

export type Seat = 'lena' | 'governor' | 'sheriff';
export const HOLDER: Record<Seat, string> = { lena: 'lena', governor: 'ossa', sheriff: 'brix' };
export const SEATS: [Seat, string][] = [['lena', 'Lena · no office'], ['governor', 'Ossa · Governor'], ['sheriff', 'Brix · Sheriff, the caller']];

/** The moments of the RC table ("What the table sees", moments 1–5). */
export type Moment = 'planning' | 'ballot' | 'reveal' | 'monthEnd';

/** The table's state as the server would hold it; each phone's view is cut from it (S5-RULE-10). */
export interface Scene {
  moment: Moment;
  tax: number;
  /** The budget in force, and the one planning opened with (budgetAtStart). setBy null is the default, Projects 100. */
  budget: { shares: Shares; setBy: string | null };
  budgetStart: Shares;
  /** This month's overrule on the tax: who called it, or null. */
  call: string | null;
  /** Every ballot (the server's; a phone sees only its own): yes undoes the tax. The caller's starts yes, the Governor's no. */
  ballots: Record<string, boolean>;
  /** Who has cast (Done). The AI casts as the ballot opens. */
  done: string[];
  /** In the reveal, who has pressed Continue. */
  continued?: string[];
}

const DEFAULT: Shares = { projects: 100, welfare: 0 };
const SET: Shares = { projects: 80, welfare: 10 };

export const SCENES = {
  /** Moment 1 before the Governor touches it: the default budget, Projects 100 (S5-RULE-1 default). */
  default: { moment: 'planning', tax: TAX_RAISED, budget: { shares: DEFAULT, setBy: null }, budgetStart: DEFAULT, call: null, ballots: {}, done: [] },
  /** Moment 1 done: Projects 80 · Welfare 10 · kept 10, set this month. */
  set: { moment: 'planning', tax: TAX_RAISED, budget: { shares: SET, setBy: 'ossa' }, budgetStart: DEFAULT, call: null, ballots: {}, done: [] },
  /** The tax as the month began: nothing to overrule (S5-RULE-6 row 8c). */
  unchanged: { moment: 'planning', tax: TAX_START, budget: { shares: SET, setBy: 'ossa' }, budgetStart: DEFAULT, call: null, ballots: {}, done: [] },
  /** Moment 2: Brix has called the vote; the tax is frozen. */
  called: { moment: 'planning', tax: TAX_RAISED, budget: { shares: SET, setBy: 'ossa' }, budgetStart: DEFAULT, call: 'brix', ballots: {}, done: [] },
  /** Moment 3: everyone pressed Ready; the ballot is open. Brix's starts Yes, Ossa's No; Kai (AI) has cast. */
  ballot: { moment: 'ballot', tax: TAX_RAISED, budget: { shares: SET, setBy: 'ossa' }, budgetStart: DEFAULT, call: 'brix', ballots: { brix: true, ossa: false, kai: true }, done: ['kai'] },
  /** Moment 3, later: Lena and Ossa have cast; Brix is still to. */
  cast: { moment: 'ballot', tax: TAX_RAISED, budget: { shares: SET, setBy: 'ossa' }, budgetStart: DEFAULT, call: 'brix', ballots: { brix: true, ossa: false, kai: true, lena: true }, done: ['kai', 'lena', 'ossa'] },
  /** Moment 4: Yes 6 of 9, needed 5. */
  passed: { moment: 'reveal', tax: TAX_RAISED, budget: { shares: SET, setBy: 'ossa' }, budgetStart: DEFAULT, call: 'brix', ballots: { brix: true, ossa: false, kai: true, lena: true }, done: ['kai', 'lena', 'ossa', 'brix'] },
  /** Moment 4, the other way: Yes 4 of 9. */
  stands: { moment: 'reveal', tax: TAX_RAISED, budget: { shares: SET, setBy: 'ossa' }, budgetStart: DEFAULT, call: 'brix', ballots: { brix: true, ossa: false, kai: false, lena: true }, done: ['kai', 'lena', 'ossa', 'brix'] },
  /** Moment 5: the month end, the budget paid at upkeep. */
  monthEnd: { moment: 'monthEnd', tax: TAX_RAISED, budget: { shares: SET, setBy: 'ossa' }, budgetStart: DEFAULT, call: null, ballots: {}, done: [] },
} satisfies Record<string, Scene>;
export type SceneId = keyof typeof SCENES;

/** The totals once the ballot closes (S5-RULE-8): weights of yes and no; an abstention is neither. */
export function tally(scene: Scene): { passed: boolean; yes: number; no: number } {
  const sum = (yes: boolean) => Object.entries(scene.ballots).filter(([, v]) => v === yes).reduce((n, [id]) => n + (VOTES[id] ?? 0), 0);
  const yes = sum(true);
  return { passed: yes >= NEEDED, yes, no: sum(false) };
}

// --- The views each screen receives ------------------------------------------------------------------------------

/** Who Welfare would go to now (S5-RULE-4): the lowest Worth but the Governor's; Kai here. */
export function welfareTo(players: PlayerView[], governor: string): string | null {
  const others = players.filter((p) => p.id !== governor).sort((a, b) => a.worth - b.worth);
  return others[0]?.id ?? null;
}

function budgetView(scene: Scene): BudgetView {
  const { shares } = scene.budget;
  return {
    lines: LINES.map((line) => ({ line, share: shares[line], start: scene.budgetStart[line], maxShare: BUDGET[line].maxShare, step: BUDGET.step, credits: creditsOf(line, shares[line]), maxCredits: BUDGET[line].maxCredits })),
    kept: 100 - shares.projects - shares.welfare,
    // Sent at every share, 0% included (AM-5): the Governor sees the recipient before setting one.
    welfareTo: welfareTo(BASE_PLAYERS, 'ossa'),
    setBy: scene.budget.setBy,
    // In RC a call freezes the tax only (S5-RULE-2 "in RC"): the budget never holds.
    frozen: false,
  };
}

function overruleView(scene: Scene): OverruleView | null {
  if (!scene.call || scene.moment === 'monthEnd') return null;
  const stage = scene.moment === 'planning' ? 'called' : scene.moment === 'ballot' ? 'ballot' : 'reveal';
  const players = BASE_PLAYERS.map((p) => p.id);
  return {
    target: 'tax',
    caller: scene.call,
    stage,
    restores: { tax: TAX_START },
    stands: { tax: scene.tax },
    // voted holds the preset ballots too (the caller's and the Governor's), so the screens key on done.
    voted: Object.keys(scene.ballots),
    done: scene.done,
    waitingFor: stage === 'ballot' ? players.filter((id) => !scene.done.includes(id)) : [],
    clockMs: stage === 'reveal' ? REVEAL_MS : 0,
    revealMs: REVEAL_MS,
    total: TOTAL_VOTES,
    needed: NEEDED,
    result: stage === 'reveal' ? tally(scene) : null,
  };
}

/** canOverrule for one seat (S5-RULE-6, the [RC] rows): the reason in the order the rule checks it. */
function canOverrule(scene: Scene, id: string): Record<OverruleTarget, true | OverruleWhy> {
  const tax: true | OverruleWhy = scene.moment !== 'planning' ? 'notNow' : id === 'ossa' ? 'governor' : scene.call ? 'called' : scene.tax === TAX_START ? 'unchanged' : true;
  return { tax, budget: 'notYet', confidence: 'sheriffOnly' };
}

/** The colony: the Park stands; the Observatory is commissioned and waits for its credits ("toward the Observatory", AM-5). */
function colonyView(scene: Scene): ColonyView {
  const catalogue = (Object.keys(PRESTIGE) as PrestigeId[]).map((id) => {
    const p = PRESTIGE[id];
    const open = id === 'park' || id === 'observatory';
    return { id, name: p.name, credits: id === 'observatory' ? OBSERVATORY.credits : p.credits, goods: p.goods, buildMonths: p.buildMonths, prestige: p.prestige, upkeep: p.upkeep, commissionable: !open, why: open ? 'Already commissioned' : null };
  });
  const obs = { ...PRESTIGE.observatory, ...OBSERVATORY };
  const monthEnd = scene.moment === 'monthEnd';
  return {
    gauges: { wealth: 18_400, environment: 31, prestige: 2, happiness: 58, band: 'content' },
    lastGauges: { wealth: 17_900, prestige: 2, happiness: 55 },
    fund: monthEnd ? MONTH_END.balance : FUND,
    ledger: monthEnd ? { month: 5, in: MONTH_END.in, out: MONTH_END.out } : null,
    projects: [
      {
        id: 'park', name: 'Park', stage: 'standing', cost: { credits: 210, goods: { alloy: 1 } }, funded: { credits: 210, goods: { alloy: 1 } }, buildMonths: 1, monthsLeft: null,
        place: { x: 1, y: 2, w: 1, h: 1 }, prestige: 2, upkeep: 15, repairCost: null, plaque: [{ playerId: 'lena', value: 120 }],
      },
      {
        id: 'observatory', name: obs.name, stage: 'commissioned', cost: { credits: obs.credits, goods: obs.goods },
        funded: { credits: monthEnd ? MONTH_END.out.project : 0, goods: obs.goods }, buildMonths: obs.buildMonths, monthsLeft: null,
        place: null, prestige: obs.prestige, upkeep: obs.upkeep, repairCost: null, plaque: [{ playerId: 'brix', value: 70 }],
      },
    ],
    catalogue,
    score: { wealth: 18_400, environment: -310, prestige: 1_200, factor: 1, total: 19_290 },
    lastScore: 18_950,
    welfare: monthEnd ? { month: 5, to: 'kai', paid: MONTH_END.out.welfare } : null,
  };
}

/**
 * The Observatory's credits as WS7 gives them (AM-5, via the PM: 700 cr, so all of Projects' 432 goes to it). Trunk's
 * config.ts PRESTIGE.observatory says 350 cr (feat/strategist and ws7-politics-rc alike): a fixture value until they agree.
 */
export const OBSERVATORY = { credits: 700 } as const;

/**
 * Month 5's upkeep (moment 5), on §3's worked example as the planning desk shows it (AM-5): after the grant, office pay
 * and the Park's upkeep the fund holds 640, so 540 spare (S5-RULE-3); Welfare 10% is 54 → Kai, Projects 80% is 432,
 * all of it to the Observatory ("Buildings 432"); 10% stays. `start` is fixture only: no screen shows it.
 */
export const MONTH_END = {
  start: FUND - 200 + 80 + 15,
  in: { grant: 200 },
  out: { officePay: 80, upkeep: 15, welfare: 54, project: 432 },
  balance: FUND - 54 - 432,
} as const;

/** The news lines a call, a withdrawal and the result add (S5-C7), none naming a voter (§3.4). */
function newsOf(scene: Scene): string[] {
  const news = ['Ossa sets the sales tax at 10%, up from 5%.'];
  if (scene.call) news.unshift('Brix calls an overrule vote on the Governor’s tax: held as planning ends.');
  if (scene.moment === 'reveal') {
    const r = tally(scene);
    news.unshift(r.passed ? `Overruled, ${r.yes} of ${TOTAL_VOTES} votes: the tax goes back to ${TAX_START}%.` : `The Governor’s tax stands: ${r.yes} of ${TOTAL_VOTES} votes for undoing it, ${NEEDED} needed.`);
  }
  return news;
}

function politicsView(scene: Scene): PoliticsView {
  return {
    governor: 'ossa', sheriff: 'brix', term: [4, 7], next: 8, baron: 'ossa',
    tax: { percent: scene.tax, start: TAX_START, low: 0, high: 10 }, fund: scene.moment === 'monthEnd' ? MONTH_END.balance : FUND, pay: { governor: 50, sheriff: 30 },
    weights: BASE_PLAYERS.map((p) => ({ id: p.id, votes: VOTES[p.id] ?? 0, parts: {} as never })),
    candidates: {}, promises: {}, promise: { kind: 'cap', percent: 10 }, promiseFrom: 5, election: null, proposal: null, council: null, laws: {}, retry: {},
    budget: budgetView(scene),
    overrule: overruleView(scene),
  };
}

const NONE = Object.fromEntries(GOODS.map((g) => [g, 0])) as MyView['stock'];

/** Whether a seat has nothing left to do in this moment: Ready in planning (the AI always), Done in the ballot. */
function readyIn(scene: Scene, p: PlayerView): boolean {
  if (p.isAi) return true;
  if (scene.moment === 'ballot') return scene.done.includes(p.id);
  // In the reveal: who has pressed Continue (AM-5's Ready words).
  if (scene.moment === 'reveal') return (scene.continued ?? []).includes(p.id);
  return false;
}

export function playersIn(scene: Scene): PlayerView[] {
  return BASE_PLAYERS.map((p) => ({ ...p, ready: readyIn(scene, p) }));
}

export function gameFor(scene: Scene, me: MyView | null): MuleView {
  const players = playersIn(scene);
  const monthEnd = scene.moment === 'monthEnd';
  return aMuleView({
    players, me: me as MyView, politics: politicsView(scene),
    month: 5, phase: monthEnd ? 'upkeep' : 'planning', width: W, height: H, tiles: TILES,
    colony: colonyView(scene), news: newsOf(scene),
    treasury: { money: monthEnd ? MONTH_END.balance : FUND, salesTax: scene.tax / 100 },
    colonists: 1_240, air: { level: 31, band: 'clean' }, lastAir: { level: 33, band: 'clean' }, colonistsFed: true,
  });
}

export function viewFor(seat: Seat, scene: Scene): { view: MuleView; me: MyView; self: PlayerView; table: TableView<MuleView>; slot: Slot } {
  const id = HOLDER[seat];
  const mine = scene.ballots[id];
  const me = {
    id, monthNeeds: NONE, stock: { ...NONE, food: 4, energy: 3 }, droneOrder: [], analysed: [], droneFound: [],
    worthParts: { money: 640, goods: 310, plots: 7, land: 3_150, mules: 2, muleValue: 110, office: 0, donated: 0, cut: 0 },
    politics: {
      running: null, ballot: {}, canRun: { governor: 'notPlanning' }, paid: 120, reputation: 0,
      overruleBallot: scene.moment === 'ballot' || scene.moment === 'reveal' ? (mine ?? null) : null,
      canOverrule: canOverrule(scene, id),
    },
  } as unknown as MyView;
  const view = gameFor(scene, me);
  const self = view.players.find((p) => p.id === id)!;
  return { view, me, self, table: tableOf(view, 0), slot: self.slot as Slot };
}

/** `boards` is how many TVs watch: 0 puts the colony panel on the phone at the month end. */
export function tableOf(game: MuleView, boards: number): TableView<MuleView> {
  return { code: 'MULE', status: 'playing', hostId: 'lena', boards, seats: [], game } as unknown as TableView<MuleView>;
}

/** The in-mock server: an intent from a seat changes the scene, as the real one would. Anything else is dropped. */
export type Intent = Parameters<TableClient['intent']>[0];

/** A seat's client: a still clock, nothing said; its intents go to `send`. */
export function clientFor(seat: Seat, send: (from: string, intent: Intent) => void): TableClient {
  const state = { status: 'open', role: 'player', code: 'MULE', seatId: HOLDER[seat], view: null, chat: [], emotes: [], toasts: [], clockOffset: 0, notice: null };
  return { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, intent: (i: Intent) => send(HOLDER[seat], i) } as unknown as TableClient;
}

/** The TV's client: a board watching the room. */
export function boardClient(scene: Scene): TableClient {
  const state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: tableOf(gameFor(scene, null), 1), chat: [], emotes: [], toasts: [], clockOffset: 0, notice: null, handoffCode: null };
  return { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, intent: () => {}, watch: () => {} } as unknown as TableClient;
}

/** The in-mock server's reducer: the four intents this slice adds or uses, by the spec's rules. */
export function apply(scene: Scene, from: string, intent: Intent): Scene {
  switch (intent.type) {
    case 'setBudget':
      return from === 'ossa' && scene.moment === 'planning' ? { ...scene, budget: { shares: { projects: intent.shares.projects, welfare: intent.shares.welfare }, setBy: from } } : scene;
    case 'callOverrule':
      if (scene.moment !== 'planning') return scene;
      if (intent.target === null) return scene.call === from ? { ...scene, call: null } : scene;
      return !scene.call && from !== 'ossa' && scene.tax !== TAX_START ? { ...scene, call: from } : scene;
    case 'voteOverrule':
      return scene.moment === 'ballot' ? { ...scene, ballots: { ...scene.ballots, [from]: intent.yes } } : scene;
    case 'ready':
      if (scene.moment === 'reveal') return (scene.continued ?? []).includes(from) ? scene : { ...scene, continued: [...(scene.continued ?? []), from] };
      return scene.moment === 'ballot' && !scene.done.includes(from) ? { ...scene, done: [...scene.done, from] } : scene;
    default:
      return scene;
  }
}
