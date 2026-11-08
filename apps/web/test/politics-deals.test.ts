import { document, FakeElement } from './fake-dom';
import { POLITICS, SOCIAL_EVENTS, START, type DealCard } from '@mule/engine';
import type { ChatMessage, MuleView, MyView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ClientState, Toast } from '../src/net/client';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * Deal cards and the reputation chip on the phone (slice 3, S3-C17..C19), mounted in the fake DOM: what a tap shows and
 * which intent it sends. Taps call the handler React gave the element; the fake DOM dispatches no events.
 */

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;
let Who: typeof import('../src/phone/hub/politics/parts').Who;
let Planning: typeof import('../src/phone/Planning').Planning;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneGameProvider } = await import('../src/phone/game'));
  ({ Who } = await import('../src/phone/hub/politics/parts'));
  ({ Planning } = await import('../src/phone/Planning'));
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
  (globalThis as { MutationObserver?: unknown }).MutationObserver ??= class {
    observe() {}
    disconnect() {}
  };
  const proto = FakeElement.prototype as unknown as Record<string, unknown>;
  proto.getBoundingClientRect ??= () => ({ x: 0, y: 0, top: 0, left: 0, width: 667, height: 375, right: 667, bottom: 375 });
  proto.scrollIntoView ??= () => undefined;
  // A sheet portals into the shell it sits in: the fake DOM finds it by its test id, the one selector the code asks.
  proto.closest ??= function (this: FakeElement, selector: string) {
    const id = /^\[data-testid="(.+)"\]$/.exec(selector)?.[1];
    for (let n: FakeElement | null = this; n; n = n.parentNode instanceof FakeElement ? n.parentNode : null) if (id && n.getAttribute('data-testid') === id) return n;
    return null;
  };
});

// ---- The table: Lena and Brix play phones, Ossa a third phone, Kai a computer seat ----------------------------------

const { repHigh, repLow } = POLITICS.weight;
const LENA = 's1';
const OSSA = 's2';
const KAI = 's3';
const BRIX = 's4';
/** A person whose name holds the computer seat's: never marked as one. */
const KAI_LEE = 's5';
/** Each seat's reputation sits on one side of a threshold: 70, 69, 30, 29 as config has it today. */
const PLAYERS: PlayerView[] = [
  aPlayer({ id: LENA, name: 'Lena', slot: 0, reputation: repHigh }),
  aPlayer({ id: OSSA, name: 'Ossa', slot: 1, reputation: repHigh - 1 }),
  aPlayer({ id: KAI, name: 'Kai', slot: 2, reputation: repLow, isAi: true }),
  aPlayer({ id: BRIX, name: 'Brix', slot: 3, reputation: repLow - 1 }),
  aPlayer({ id: KAI_LEE, name: 'Kai Lee', slot: 4, reputation: START.reputation }),
];
const NO_GOODS = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

const card = (over: Partial<DealCard> & Pick<DealCard, 'id' | 'from' | 'to'>): DealCard => ({ terms: { kind: 'pact' }, offered: 2, until: 4, status: 'offered', brokenBy: null, settled: null, ...over });

function myView(id: string, cards: DealCard[] = [], over: Partial<NonNullable<MyView['deals']>> = {}): MyView {
  return {
    id,
    species: 'zipwing',
    stock: { ...NO_GOODS, food: 9 },
    carriedMule: null,
    installedThisTurn: false,
    worthParts: { money: 0, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, donated: 0, cut: 0 },
    claimsLeft: 0,
    hungry: false,
    sick: false,
    needs: { food: 5, water: 3 },
    monthNeeds: { ...NO_GOODS, food: 5, water: 3 },
    devEndsAt: null,
    devSeconds: 50,
    produced: null,
    mulePrice: 148,
    outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
    droneOrder: [],
    politics: { running: null, ballot: {}, canRun: { governor: true }, paid: 0, reputation: 50 },
    deals: { cards, offersLeft: POLITICS.deals.maxOpenOffers, pactMonths: [...POLITICS.deals.pactMonths], ...over },
  };
}

function politics(extra: Partial<PoliticsView> = {}): PoliticsView {
  return {
    governor: null,
    sheriff: null,
    term: null,
    next: 4,
    baron: null,
    tax: { percent: 5, start: 5, low: 0, high: 10 },
    fund: 0,
    pay: { governor: 50 },
    weights: PLAYERS.map(({ id }) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
    candidates: { governor: [] },
    promises: {},
    promise: null,
    promiseFrom: null,
    election: null,
    brokenDeals: [],
    reputationReasons: {},
    ...extra,
  };
}

const gameFor = (me: MyView, p: PoliticsView = politics(), over: Partial<MuleView> = {}): MuleView => aMuleView({ month: 2, players: PLAYERS, me, politics: p, ...over });

// ---- A phone: its client, what it sent, and its screen ---------------------------------------------------------------

const sent: unknown[] = [];
let state: ClientState;
const listeners = new Set<() => void>();
const client = {
  subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
  getState: () => state,
  serverNow: () => 0,
  intent: (intent: unknown) => void sent.push(intent),
  chat: () => undefined,
  emote: () => undefined,
  dismiss: (id: number) => setState({ toasts: state.toasts.filter((t) => t.id !== id) }),
};
function setState(over: Partial<ClientState>): void {
  state = { ...state, ...over };
  for (const l of listeners) l();
}

let root: Root | null = null;
let host: FakeElement;
let screen: (game: MuleView) => ReactElement;

const tableOf = (game: MuleView): TableView<MuleView> => ({ code: 'MULE', status: 'playing', hostId: LENA, boards: 1, game, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) });

function phoneOf(game: MuleView): ReactElement {
  const self = game.players.find((p) => p.id === game.me!.id)!;
  const value = { table: tableOf(game), view: game, me: game.me!, self, slot: self.slot as Slot };
  // The shell's box, so a sheet has its game-shell to portal into.
  const shell = createElement('div', { 'data-testid': 'game-shell' }, screen(game));
  return createElement(ClientProvider, { client: client as never, children: createElement(PhoneGameProvider, { value, children: shell }) });
}

function mount(game: MuleView, draw: (game: MuleView) => ReactElement, chat: ChatMessage[] = []): void {
  screen = draw;
  state = { status: 'open', role: 'player', code: 'MULE', seatId: game.me!.id, view: null, chat, emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null } as ClientState;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(phoneOf(game)));
}
/** The server's next view reaches the phone. */
const rerender = (game: MuleView) => act(() => root!.render(phoneOf(game)));

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
  sent.length = 0;
  listeners.clear();
});

function findTestid(testid: string, node: FakeElement = host): FakeElement | undefined {
  if (node.getAttribute('data-testid') === testid) return node;
  for (const child of node.childNodes) {
    const hit = child instanceof FakeElement ? findTestid(testid, child) : undefined;
    if (hit) return hit;
  }
  return undefined;
}
function byTestid(testid: string): FakeElement {
  const found = findTestid(testid);
  expect(found, `an element with data-testid="${testid}"`).toBeDefined();
  return found!;
}
/** Every element whose test id starts with `prefix`, in document order. */
function allTestids(prefix: string, node: FakeElement = host, out: string[] = []): string[] {
  const id = node.getAttribute('data-testid');
  if (id?.startsWith(prefix)) out.push(id);
  for (const c of node.childNodes) if (c instanceof FakeElement) allTestids(prefix, c, out);
  return out;
}
function handlers(el: FakeElement): Record<string, (e?: unknown) => void> {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  expect(key, 'a React element').toBeDefined();
  return (el as unknown as Record<string, Record<string, (e?: unknown) => void>>)[key!]!;
}
const tap = (testid: string) => act(() => handlers(byTestid(testid)).onClick!({ currentTarget: byTestid(testid), stopPropagation() {}, preventDefault() {} }));
const text = (testid: string) => byTestid(testid).textContent;

// ---- S3-C19 · the chip --------------------------------------------------------------------------------------------

describe('the reputation chip (S3-C19)', () => {
  it('S3-B-AC-6: a chip beside every name in the hub (Who) shows PlayerView.reputation with the 70/30 thresholds readable, and its tap lists the public reasons', () => {
    // Brix broke a vote card to Kai Lee in month 2 and was blamed for unrest in month 1; Ossa broke one too. Lena and Brix
    // kept a pact: a kept card moves the number, never the reasons.
    const brixBroke = card({ id: 'deal-b1', from: BRIX, to: KAI_LEE, terms: { kind: 'vote', office: 'governor', candidate: KAI }, status: 'broken', brokenBy: BRIX, settled: 2 });
    const ossaBroke = card({ id: 'deal-o1', from: OSSA, to: LENA, terms: { kind: 'pact' }, status: 'broken', brokenBy: OSSA, settled: 2 });
    const kept = card({ id: 'deal-k1', from: LENA, to: BRIX, terms: { kind: 'pact' }, offered: 1, until: 1, status: 'kept', settled: 1 });
    const p = politics({
      brokenDeals: [brixBroke, ossaBroke],
      reputationReasons: { [BRIX]: [{ kind: 'broken', id: 'deal-b1' }, { kind: 'unrest', month: 1 }], [OSSA]: [{ kind: 'broken', id: 'deal-o1' }] },
    });
    mount(gameFor(myView(LENA, [kept]), p), (game) =>
      createElement(
        'p',
        null,
        game.players.map((pl) => createElement(Who, { key: pl.id, view: game, id: pl.id, me: LENA, rep: true, open: true })),
      ),
    );

    // Each side of each threshold: the number, and the band said without colour (a data band and the label's words).
    const rows: [string, number, string, string][] = [
      [LENA, repHigh, 'good', 'Good name: +1 vote'],
      [OSSA, repHigh - 1, 'fair', 'Fair name'],
      [KAI, repLow, 'fair', 'Fair name'],
      [BRIX, repLow - 1, 'low', 'Low name: −1 vote, and AI players turn down their cards'],
    ];
    for (const [id, rep, band, words] of rows) {
      const chip = byTestid(`who-${id}-rep`);
      expect(chip.textContent, id).toBe(String(rep));
      expect(chip.getAttribute('data-band'), id).toBe(band);
      expect(chip.getAttribute('aria-label'), id).toContain(`reputation ${rep}. ${words}.`);
    }
    expect(findTestid('ai-mark'), 'a computer seat carries its mark only where asked').toBeUndefined();

    tap(`who-${BRIX}-rep`);
    expect(text(`player-card-${BRIX}-band`)).toBe(`Reputation ${repLow - 1} · Low name: −1 vote, and AI players turn down their cards.`);
    expect(text(`player-card-${BRIX}`), 'the thresholds, readable').toContain(`${repHigh} and up: +1 vote. Under ${repLow}: −1 vote, and AI players turn down their cards.`);
    expect(allTestids('reason-'), "Brix's public reasons, newest first").toEqual(['reason-deal-b1', 'reason-unrest-1']);
    // The mark follows the computer seat's id, never its name in the words: Kai Lee is a person.
    expect(text('reason-deal-b1')).toBe(`M2Broke a promise to Kai Lee: a vote for Kai · AI−${-POLITICS.reputation.moves.voteBroken}`);
    expect(text('reason-unrest-1')).toBe(`M1Blamed for the unrest−${-SOCIAL_EVENTS.player.blamedForUnrest.reputation}`);
    expect(findTestid('reason-deal-k1'), 'a kept card is never among the reasons').toBeUndefined();
    expect(findTestid('reason-deal-o1'), "Ossa's broken card is Ossa's reason, not Brix's").toBeUndefined();

    tap(`player-card-${BRIX}-close`);
    tap(`who-${LENA}-rep`);
    expect(text(`player-card-${LENA}-reasons`), 'Lena kept her pact: nothing public').toBe('What moved it, in publicNothing public. A kept card never shows here, only the number rising.');
  });
});

describe('the reputation chip in the ready bar (S3-C19)', () => {
  it("S3-B-AC-6: the ready bar's waiting names on the phone carry their chips, as labels a stray tap cannot open; your own name none", () => {
    mount(gameFor(myView(LENA)), () => createElement(Planning));
    const chip = byTestid(`waiting-${OSSA}-rep`);
    expect(chip.textContent).toBe(String(repHigh - 1));
    expect(chip.tagName, 'a label, not a button').toBe('SPAN');
    expect(byTestid(`waiting-${BRIX}-rep`).getAttribute('data-band')).toBe('low');
    expect(findTestid(`waiting-${LENA}-rep`)).toBeUndefined();
  });
});

// ---- S3-C17 · the composer ---------------------------------------------------------------------------------------

/** Lena's whole planning hub. */
const hub = () => createElement(Planning);
const offers = () => sent.filter((i) => (i as { type: string }).type === 'offerDeal');

describe('the deal composer (S3-C17)', () => {
  it("S3-B-AC-1: the composer opened from Lena's whisper to Brix offers a pact of POLITICS.deals pactMonths lengths or her own vote, sends offerDeal, and shows the engine's refusal words", () => {
    // The lengths are the view's, not the phone's: a table playing other lengths gets those. Ossa and Lena are running
    // for Governor; Kai and Brix are not.
    const lengths = [2, 5];
    const game = gameFor(myView(LENA, [], { pactMonths: lengths }), politics({ candidates: { governor: [OSSA, LENA] } }));
    mount(game, hub);
    // An older refusal, from some other tap, is not this card's.
    act(() => setState({ toasts: [{ id: 1, message: 'You can run for office in planning' }] }));
    tap('desk-talk');
    tap(`chat-to-${BRIX}`);
    tap('add-deal');

    expect(text('composer-a')).toContain('Card for');
    expect(text('composer-a')).toContain('Brix');
    expect(allTestids('composer-a-months-'), 'a pact runs the lengths the view gives').toEqual(lengths.map((m) => `composer-a-months-${m}`));
    expect(findTestid('composer-a-refusal'), 'nothing refused yet').toBeUndefined();
    tap('composer-a-months-5');
    expect(text('composer-a-binds')).toBe('Neither of you sabotages the other, months 2 to 6.');
    tap('composer-a-send');
    expect(offers()).toEqual([{ type: 'offerDeal', offer: { to: BRIX, terms: { kind: 'pact' }, months: 5 } }]);

    // The server refuses: its words show in the composer, where the tap was.
    const refusal: Toast = { id: 2, message: 'Brix has not answered your last card' };
    act(() => setState({ toasts: [...state.toasts, refusal] }));
    expect(text('composer-a-refusal')).toContain(refusal.message);

    // Her own vote: only a declared candidate who is not herself, and no law is up.
    tap('composer-a-kind-vote');
    expect(allTestids('composer-a-choice-gov:')).toEqual([`composer-a-choice-gov:${OSSA}`]);
    expect(text('composer-a-ballot-law-no')).toBe('No law is up for a vote');
    expect(text('composer-a-ballot-gov')).toContain('Governor · month 4');
    tap(`composer-a-choice-gov:${OSSA}`);
    sent.length = 0;
    tap('composer-a-send');
    expect(offers()).toEqual([{ type: 'offerDeal', offer: { to: BRIX, terms: { kind: 'vote', office: 'governor', candidate: OSSA } } }]);
    expect(findTestid('composer-a-refusal'), 'a new send clears the last refusal').toBeUndefined();

    // Once the server lists the new card, the sheet has done its job.
    const listed = card({ id: 'deal-n1', from: LENA, to: BRIX, terms: { kind: 'vote', office: 'governor', candidate: OSSA } });
    rerender(gameFor(myView(LENA, [listed], { pactMonths: lengths }), politics({ candidates: { governor: [OSSA, LENA] } })));
    expect(findTestid('composer-a')).toBeUndefined();
    expect(byTestid('add-deal').getAttribute('disabled'), 'one unanswered card to Brix at a time').not.toBeNull();
  });

  it("S3-B-AC-1: the composer also opens from a name's player card and from a standings row, in planning", () => {
    mount(gameFor(myView(LENA)), hub);
    tap('standing');
    tap(`deal-standing-${OSSA}`);
    expect(findTestid('standings-sheet'), 'the standings give way to the composer').toBeUndefined();
    expect(text('composer-a')).toContain('Ossa');
    tap('composer-a-close');

    tap(`chat-to-${BRIX}`);
    tap('whisper-rep');
    tap(`player-card-${BRIX}-deal`);
    expect(findTestid(`player-card-${BRIX}`)).toBeUndefined();
    expect(text('composer-a')).toContain('Brix');
  });
});

describe('the standings door (S3-C17)', () => {
  it('S3-B-AC-1: with one card to Ossa unanswered, the standings row offers Ossa no second card and says why; Brix still gets one', () => {
    const waiting = card({ id: 'deal-w1', from: LENA, to: OSSA });
    mount(gameFor(myView(LENA, [waiting])), hub);
    tap('standing');
    const ossa = byTestid(`deal-standing-${OSSA}`);
    expect(ossa.getAttribute('disabled'), 'S3-RULE-2 row 5: one unanswered card to a player at a time').not.toBeNull();
    expect(ossa.getAttribute('title')).toBe('Ossa has not answered your last card');
    expect(byTestid(`deal-standing-${BRIX}`).getAttribute('disabled')).toBeNull();
  });
});

// ---- S3-C18 · the incoming card and My cards ----------------------------------------------------------------------

/** Brix's cards in month 2: Lena's pact offered to him, his vote offered to Ossa, a pact with Kai, two settled. */
const LENAS = card({ id: 'deal-in1', from: LENA, to: BRIX, terms: { kind: 'pact' }, offered: 2, until: 4 });
const BRIX_CARDS: DealCard[] = [
  LENAS,
  card({ id: 'deal-out1', from: BRIX, to: OSSA, terms: { kind: 'vote', office: 'governor', candidate: OSSA }, offered: 2, until: 4 }),
  card({ id: 'deal-act1', from: KAI, to: BRIX, terms: { kind: 'pact' }, offered: 1, until: 3, status: 'active' }),
  card({ id: 'deal-wd1', from: BRIX, to: KAI, terms: { kind: 'vote', law: true, yes: true }, offered: 1, until: 2, status: 'withdrawn', settled: 1 }),
];
const brixGame = (cards: DealCard[] = BRIX_CARDS) => gameFor(myView(BRIX, cards), politics({ candidates: { governor: [OSSA] } }));
const lenasAnswer = (status: DealCard['status']) => ({ ...LENAS, status, settled: status === 'active' ? null : 2 });

describe('the incoming card and My cards (S3-C18)', () => {
  it("S3-B-AC-1: Brix's whisper thread and agenda show Lena's card with both reputations and Accept / Decline; My cards lists offered (Withdraw), incoming, active (what it binds, until when) and settled cards", () => {
    mount(brixGame(), hub);
    expect(text('agenda-deals')).toContain('1 deal offer');
    expect(text('agenda-deals')).toContain('From Lena');

    // The agenda's door opens the card over the rail, and lands the Talk desk on the pair's whisper.
    tap('agenda-deals');
    const face = 'sheet-card-deal-in1';
    expect(text(`${face}-label`)).toBe('Card from Lena');
    expect(text(`${face}-title`)).toBe('Pact · 3 months');
    expect(text(`${face}-binds`)).toBe('Neither of you sabotages the other, months 2 to 4.');
    expect(text(`${face}-from-rep`), "Lena's reputation").toBe(String(repHigh));
    expect(text(`${face}-to-rep`), "Brix's own").toBe(String(repLow - 1));
    expect(findTestid(`${face}-accept`)).toBeDefined();
    expect(findTestid(`${face}-decline`)).toBeDefined();
    tap('incoming-sheet-close');

    const thread = `thread-deals-${LENA}`;
    expect(text('whisper-line')).toContain('LENA');
    expect(findTestid(thread), "the card sits at the foot of Brix's whisper with Lena").toBeDefined();
    expect(text('incoming-deal-in1-from-rep')).toBe(String(repHigh));
    expect(text('incoming-deal-in1-to-rep')).toBe(String(repLow - 1));
    tap('incoming-deal-in1-accept');
    expect(sent).toEqual([{ type: 'answerDeal', id: 'deal-in1', accept: true }]);

    // The server's answer: the pact is active, until month 4; the thread says so in a line.
    rerender(brixGame([lenasAnswer('active'), ...BRIX_CARDS.slice(1)]));
    expect(findTestid('incoming-deal-in1')).toBeUndefined();
    expect(text('thread-line-deal-in1')).toContain('Binds until the end of month 4');

    tap('talk-cards');
    expect(allTestids('my-deals-').filter((id) => /^my-deals-[a-z]+$/.test(id))).toEqual(['my-deals-waiting', 'my-deals-active', 'my-deals-settled']);
    expect(text('my-deals-waiting')).toContain('Waiting for Ossa');
    tap('outgoing-deal-out1-withdraw');
    expect(sent.at(-1)).toEqual({ type: 'withdrawDeal', id: 'deal-out1' });
    expect(text('my-deal-deal-in1-binds')).toBe('· Neither of you sabotages the other, months 2 to 4.');
    expect(text('my-deal-deal-in1-line')).toContain('Binds until the end of month 4');
    expect(text('my-deal-deal-act1-line')).toContain('Binds until the end of month 3');
    expect(text('my-deal-deal-wd1-line')).toContain('Withdrawn by you');
    expect(byTestid('my-deal-deal-wd1').getAttribute('data-status')).toBe('withdrawn');
  });

  it('S3-B-AC-1: My cards lists a card offered to me under For you to answer, and a second offer makes the agenda open My cards', () => {
    const second = card({ id: 'deal-in2', from: OSSA, to: BRIX, terms: { kind: 'vote', office: 'governor', candidate: OSSA }, offered: 2, until: 4 });
    mount(brixGame([second, ...BRIX_CARDS]), hub);
    expect(text('agenda-deals')).toContain('2 deal offers');
    tap('agenda-deals');
    expect(findTestid('incoming-sheet'), 'two offers: no single card to open').toBeUndefined();
    expect(allTestids('incoming-deal-')).toEqual(expect.arrayContaining(['incoming-deal-in2', 'incoming-deal-in1']));
    expect(text('my-deals-incoming')).toContain('For you to answer');
    expect(text('talk-cards-badge')).toBe('2');
  });

  it('S3-B-AC-1 (negative): Brix taps Decline, and the card shows as declined, with nothing active from it', () => {
    mount(brixGame(), hub);
    tap('agenda-deals');
    tap('sheet-card-deal-in1-decline');
    expect(sent).toEqual([{ type: 'answerDeal', id: 'deal-in1', accept: false }]);
    rerender(brixGame([lenasAnswer('declined'), ...BRIX_CARDS.slice(1)]));
    expect(findTestid('incoming-sheet'), 'answered: the sheet closes itself').toBeUndefined();
    expect(findTestid('agenda-deals'), 'nothing left to answer').toBeUndefined();
    expect(text('thread-line-deal-in1')).toContain('Declined by you');
    tap('talk-cards');
    expect(byTestid('my-deal-deal-in1').getAttribute('data-status')).toBe('declined');
    expect(text('my-deals-settled')).toContain('Declined by you');
    expect(text('my-deals-active')).not.toContain('Pact · 3 months · Binds until the end of month 4');
  });
});

// ---- The break words' seats, for SeatWords on every screen ----------------------------------------------------------

describe("the break words' seats (S3-C20)", () => {
  it('S3-B-AC-2: brokenWho gives the seats brokenWords names, in its words’ order, for each kind of card, with and without the breaker', async () => {
    const { brokenWho, brokenWords } = await import('../src/phone/hub/politics/deals-words');
    const view = { players: PLAYERS };
    const broken = (over: Partial<DealCard> & Pick<DealCard, 'id' | 'from' | 'to'>) => card({ status: 'broken', settled: 2, ...over });
    const rows: [DealCard, boolean, string, string[]][] = [
      [broken({ id: 'p1', from: LENA, to: BRIX, brokenBy: BRIX }), true, 'Brix broke a pact with Lena', [BRIX, LENA]],
      [broken({ id: 'p2', from: LENA, to: BRIX, brokenBy: LENA }), false, 'Broke a pact with Brix', [BRIX]],
      [broken({ id: 'v1', from: BRIX, to: KAI_LEE, terms: { kind: 'vote', office: 'governor', candidate: KAI }, brokenBy: BRIX }), true, 'Brix broke a promise to Kai Lee: a vote for Kai', [BRIX, KAI_LEE, KAI]],
      [broken({ id: 'l1', from: OSSA, to: LENA, terms: { kind: 'vote', law: true, yes: false }, brokenBy: OSSA }), true, 'Ossa broke a promise to Lena: a no on the law', [OSSA, LENA]],
    ];
    for (const [c, named, words, who] of rows) {
      expect(brokenWords(view, c, named), c.id).toBe(words);
      expect(brokenWho(c, named), c.id).toEqual(who);
    }
  });
});

// ---- S3-C20 · the month's broken cards on the phone's month end -----------------------------------------------------

describe("the phone's month end (S3-C20)", () => {
  it("S3-B-AC-2: the phone's month end lists the month's broken cards in public (who broke a promise to whom, what was promised, the drop), from brokenIn; none for a kept card or one broken in an earlier month", async () => {
    const { Results } = await import('../src/phone/Results');
    const broke = (over: Partial<DealCard> & Pick<DealCard, 'id' | 'from' | 'to'>) => card({ status: 'broken', settled: 2, ...over });
    const vote = broke({ id: 'deal-v2', from: BRIX, to: KAI_LEE, terms: { kind: 'vote', office: 'governor', candidate: KAI }, brokenBy: BRIX });
    const pact = broke({ id: 'deal-p2', from: LENA, to: KAI, brokenBy: KAI });
    const earlier = broke({ id: 'deal-p1', from: OSSA, to: LENA, brokenBy: OSSA, settled: 1 });
    const kept = card({ id: 'deal-k2', from: LENA, to: BRIX, offered: 2, until: 2, status: 'kept', settled: 2 });
    const monthEnd = (brokenDeals: DealCard[]) => gameFor(myView(LENA, [kept]), politics({ brokenDeals }), { phase: 'upkeep' });
    mount(monthEnd([vote, pact, earlier]), () => createElement(Results));

    expect(text('broken-cards')).toContain('Broken this month · in public');
    expect(allTestids('broken-deal-').filter((id) => !/-(words|drop)$/.test(id)), "month 2's broken cards, and only those").toEqual(['broken-deal-v2', 'broken-deal-p2']);
    expect(text('broken-deal-v2-words')).toBe('Brix broke a promise to Kai Lee: a vote for Kai · AI');
    expect(text('broken-deal-v2-drop')).toBe(`−${-POLITICS.reputation.moves.voteBroken}`);
    expect(text('broken-deal-p2-words'), 'the computer seat that broke it is marked').toBe('Kai · AI broke a pact with Lena');
    expect(text('broken-deal-p2-drop')).toBe(`−${-POLITICS.reputation.moves.pactBroken}`);
    expect(findTestid('broken-deal-k2'), 'a kept card is never listed').toBeUndefined();

    rerender(monthEnd([earlier]));
    expect(findTestid('broken-cards'), 'nothing broke this month: no list').toBeUndefined();
  });
});
