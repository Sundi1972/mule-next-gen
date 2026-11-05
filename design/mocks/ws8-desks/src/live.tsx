import { GOODS, POLITICS, PRESTIGE, type Good } from '@mule/engine';
import type { MuleIntent, MuleView, TableView } from '@mule/protocol';
import { SeatSpeciesProvider, type Slot } from '@mule/ui';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toasts } from '../../../../apps/web/src/components/Toasts';
import { seatSpecies } from '../../../../apps/web/src/game/derive';
import type { ClientState, TableClient } from '../../../../apps/web/src/net/client';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { catalogue, GOVERNOR, nameOf, PLAYERS, WEIGHT } from './fixture';
import { impactOf, LAW_NAME, REPLACES_WORDS, retryWords } from './words';

/** What a page starts with, beyond its view: which variant, and what is already open. */
export interface Preset {
  donate?: 'A' | 'B';
  picker?: 'A' | 'B';
  /** Opens one project's sheet: 'donate:park', 'bid:park', 'commission'. */
  open?: string;
  /** The desk to open once the hub has drawn (the Governor's desk otherwise opens first for Lena). */
  desk?: string;
  /** Ossa's 100 cr reaches the park just before this phone's gift: the server refuses it with RULE-23 row 6, once. */
  race?: boolean;
  /** The ballot as this phone has it: picked, Done. */
  ballot?: { pick?: boolean | null; done?: boolean };
}

const PresetCtx = createContext<Preset>({});
export const usePreset = () => useContext(PresetCtx);

/** The secret ballots, held where the server holds them: never in a view. */
type Ballots = Record<string, boolean>;

const refuse = (message: string, next?: MuleView): { refused: string; next?: MuleView } => (next ? { refused: message, next } : { refused: message });

/**
 * The server's side of every intent the new desks send, on the fixture: the engine's rules and refusal words
 * (RULE-21/22/23/28, RULE-40/41/42). The real build sends the intent; the server answers with the next view.
 */
function apply(v: MuleView, seat: string, i: MuleIntent, ballots: Ballots, preset: Preset): MuleView | { refused: string; next?: MuleView } {
  const pol = v.politics!;
  const col = v.colony!;
  const gov = pol.governor === seat;
  const votesOpen = !!pol.council && pol.council.stage !== 'over';
  const withColony = (c: typeof col, extra: Partial<MuleView> = {}): MuleView => ({ ...v, colony: { ...c, catalogue: catalogue(c.projects, votesOpen) }, politics: { ...pol, fund: c.fund }, treasury: { ...v.treasury, money: c.fund }, ...extra });
  switch (i.type) {
    case 'commission': {
      if (votesOpen) return refuse('Commission once the votes are over');
      if (!gov) return refuse('Only the Governor commissions for the colony');
      const p = PRESTIGE[i.id];
      if (col.projects.some((q) => q.id === i.id)) return refuse(`The colony already has a ${p.name}`);
      const open = col.projects.find((q) => q.stage === 'commissioned' || q.stage === 'building');
      if (open) return refuse(`The colony is already building the ${open.name}`);
      const proj = { id: i.id, name: p.name, stage: 'commissioned' as const, cost: { credits: p.credits, goods: { ...p.goods } }, funded: { credits: 0, goods: {} }, buildMonths: p.buildMonths, monthsLeft: null, plot: null, prestige: p.prestige, upkeep: p.upkeep, repairCost: null, plaque: [], maxBid: null };
      return withColony({ ...col, projects: [proj, ...col.projects] }, { news: [...v.news, `${nameOf(seat)} commissions a ${p.name}`] });
    }
    case 'donate': {
      let c = col;
      if (preset.race) {
        // Ossa's 100 cr lands first.
        c = { ...c, projects: c.projects.map((q) => (q.id === i.id ? { ...q, funded: { ...q.funded, credits: q.funded.credits + 100 }, plaque: [...q.plaque, { playerId: 's2', value: 100 }].sort((a, b) => b.value - a.value) } : q)) };
      }
      const p = c.projects.find((q) => q.id === i.id && q.stage === 'commissioned');
      if (!p) return refuse('Nothing is being funded');
      const goods = Object.entries(i.goods ?? {}).filter(([, n]) => n) as [Good, number][];
      if (i.credits === 0 && goods.length === 0) return refuse('Give at least 1 cr or 1 unit');
      const money = v.players.find((q) => q.id === seat)!.money;
      if (i.credits > money) return refuse(`You have ${money} cr`);
      const missing = p.cost.credits - p.funded.credits;
      if (i.credits > missing) return refuse(`The ${p.name} needs only ${missing} cr more`, preset.race ? withColony(c) : undefined);
      for (const [g, n] of goods) {
        const need = (p.cost.goods[g] ?? 0) - (p.funded.goods[g] ?? 0);
        if (!p.cost.goods[g]) return refuse(`The ${p.name} needs no ${GOOD_NAME[g]}`);
        if (n > need) return refuse(`The ${p.name} still needs ${need} ${GOOD_NAME[g]}`);
        if (n > v.me!.stock[g]) return refuse(`You have ${v.me!.stock[g]} ${GOOD_NAME[g]}`);
      }
      const value = i.credits + goods.reduce((a, [g, n]) => a + n * REF[g], 0);
      const had = p.plaque.find((d) => d.playerId === seat);
      const plaque = (had ? p.plaque.map((d) => (d.playerId === seat ? { ...d, value: d.value + value } : d)) : [...p.plaque, { playerId: seat, value }]).sort((a, b) => b.value - a.value);
      const funded = { credits: p.funded.credits + i.credits, goods: { ...p.funded.goods } };
      for (const [g, n] of goods) funded.goods[g] = (funded.goods[g] ?? 0) + n;
      const stock = { ...v.me!.stock };
      for (const [g, n] of goods) stock[g] -= n;
      return withColony(
        { ...c, projects: c.projects.map((q) => (q.id === p.id ? { ...q, funded, plaque } : q)) },
        { players: v.players.map((q) => (q.id === seat ? { ...q, money: q.money - i.credits } : q)), me: { ...v.me!, stock }, news: [...v.news, `${nameOf(seat)} gives ${value} cr to the ${p.name}`] },
      );
    }
    case 'repair': {
      const p = col.projects.find((q) => q.id === i.id);
      if (!gov) return refuse('Only the Governor repairs for the colony');
      if (!p || p.stage !== 'damaged' || p.repairCost === null) return refuse('Nothing is damaged');
      if (col.fund < p.repairCost) return refuse(`The fund has ${col.fund} cr; the repair costs ${p.repairCost} cr`);
      return withColony({ ...col, fund: col.fund - p.repairCost, projects: col.projects.map((q) => (q.id === p.id ? { ...q, stage: 'standing', repairCost: null } : q)) });
    }
    case 'setSiteBid': {
      if (votesOpen) return refuse('Set the bid once the votes are over');
      if (!gov) return refuse("Only the Governor sets the colony's bid");
      const p = col.projects.find((q) => q.id === i.id && q.stage === 'commissioned');
      if (!p) return refuse('Nothing is waiting for a site');
      if (!PRESTIGE[p.id].needsPlot) return refuse(`The ${p.name} needs no plot`);
      if (p.plot !== null) return refuse(`The ${p.name} already has its site`);
      if (i.maxBid !== null && (!Number.isInteger(i.maxBid) || i.maxBid < 0)) return refuse('Bid a whole number of credits');
      return withColony({ ...col, projects: col.projects.map((q) => (q.id === p.id ? { ...q, maxBid: i.maxBid } : q)) });
    }
    case 'propose': {
      if (votesOpen) return refuse('Propose once the votes are over');
      if (!gov) return refuse('Only the Governor proposes a law');
      if (i.proposal === null) return { ...v, politics: { ...pol, proposal: null } };
      const p = i.proposal;
      const laws = pol.laws ?? {};
      const failedIn = pol.retry?.[`${p.kind}:${p.law}`];
      if (failedIn !== undefined && v.month <= failedIn + POLITICS.council.retryMonths) return refuse(retryWords(failedIn));
      if (p.kind === 'repeal' && !laws[p.law]) return refuse('That law is not in force');
      if (p.kind === 'enact') {
        if (laws[p.law]?.setting === p.setting) return refuse('That law is already in force at that setting');
        if (!laws[p.law] && Object.keys(laws).length >= POLITICS.council.maxInForce && !(p.replaces && laws[p.replaces])) return refuse(REPLACES_WORDS);
      }
      return { ...v, politics: { ...pol, proposal: { by: seat, month: v.month, proposal: p, impact: impactOf(p, laws) } }, news: [...v.news, `${nameOf(seat)} proposes: ${LAW_NAME[p.law]}`] };
    }
    case 'voteLaw': {
      const c = pol.council;
      if (!c || c.stage !== 'ballot') return refuse('The law ballot is not open');
      ballots[seat] = i.yes;
      return { ...v, me: { ...v.me!, politics: { ...v.me!.politics!, lawBallot: i.yes } }, politics: { ...pol, council: { ...c, voted: c.voted.includes(seat) ? c.voted : [...c.voted, seat] } } };
    }
    case 'ready':
    case 'continue': {
      const c = pol.council;
      if (!c || c.stage !== 'ballot') return { ...v, players: v.players.map((q) => (q.id === seat ? { ...q, ready: i.type === 'ready' ? true : q.ready } : q)) };
      const done = i.type === 'ready' ? [...new Set([...c.done, seat])] : v.players.map((q) => q.id);
      const waitingFor = PLAYERS.filter((q) => !q.isAi && !done.includes(q.id)).map((q) => q.id);
      const players = v.players.map((q) => (q.id === seat ? { ...q, ready: true } : q));
      if (waitingFor.length > 0) return { ...v, players, politics: { ...pol, council: { ...c, done, waitingFor } } };
      // RULE-42: weighed at close; abstainers count nothing; the Governor's ballot breaks a tie.
      const yes = Object.entries(ballots).filter(([, b]) => b).reduce((a, [id]) => a + WEIGHT[id]!, 0);
      const no = Object.entries(ballots).filter(([, b]) => !b).reduce((a, [id]) => a + WEIGHT[id]!, 0);
      const tie = yes === no;
      const passed = yes > no || (tie && ballots[GOVERNOR] === true);
      // The ballot's Done is spent: planning proper goes on with nobody Ready but the AI seats.
      return { ...v, players: v.players.map((q) => ({ ...q, ready: q.isAi })), politics: { ...pol, council: { ...c, done, waitingFor: [], stage: 'reveal', clockMs: 0, result: { passed, yes, no, tie } } } };
    }
    default:
      return v;
  }
}

/** The reveal's clock ends: a passed law takes effect (RULE-40 row 2); a failed one waits to come back. */
export function closeReveal(v: MuleView): MuleView {
  const pol = v.politics!;
  const c = pol.council!;
  if (c.stage !== 'reveal' || !c.result) return v;
  const p = c.proposal;
  const laws = { ...(pol.laws ?? {}) };
  const retry = { ...(pol.retry ?? {}) };
  if (c.result.passed) {
    if (p.kind === 'enact') {
      laws[p.law] = { setting: p.setting, since: v.month };
      if (p.replaces) delete laws[p.replaces];
    } else delete laws[p.law];
  } else retry[`${p.kind}:${p.law}`] = v.month;
  return { ...v, politics: { ...pol, laws, retry, council: { ...c, stage: 'over', clockMs: c.revealMs } } };
}

export const GOOD_NAME: Record<Good, string> = Object.fromEntries(GOODS.map((g) => [g, g === 'rareEarth' ? 'Rare earth' : g[0]!.toUpperCase() + g.slice(1)])) as Record<Good, string>;
/** Reference prices for a plaque's goods. CONTRACT: the phone needs them for the preview; the view has none today. */
export const REF: Record<Good, number> = { food: 30, water: 25, energy: 40, smithore: 50, crystite: 100, rareEarth: 120, alloy: 140, electronics: 220, medicine: 160 };

/**
 * A fake TableClient over a live fixture view: intent() runs the rules above and moves the view in React state, so
 * every button really works; a refusal arrives as the app's own toast, as the server's does.
 */
function useLiveClient(start: MuleView, seat: string, preset: Preset) {
  const [view, setView] = useState(start);
  const ballots = useRef<Ballots>({ s2: true, s4: false, ...(start.politics?.council ? { [GOVERNOR]: true } : {}), ...(preset.ballot?.pick != null ? { [seat]: preset.ballot.pick } : {}) });
  const listeners = useRef(new Set<() => void>());
  const state = useRef<ClientState>({ status: 'open', role: 'player', code: 'MULE', seatId: seat, view: null, chat: [], emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null } as unknown as ClientState);
  const raced = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const client = useMemo(() => {
    const emit = () => listeners.current.forEach((l) => l());
    let toastId = 0;
    return {
      subscribe: (l: () => void) => {
        listeners.current.add(l);
        return () => listeners.current.delete(l);
      },
      getState: () => state.current,
      serverNow: () => Date.now(),
      dismiss: (id: number) => {
        state.current = { ...state.current, toasts: state.current.toasts.filter((t) => t.id !== id) };
        emit();
      },
      intent: (i: MuleIntent) => {
        console.info('intent', i);
        const out = apply(structuredClone(viewRef.current), seat, i, ballots.current, { ...preset, race: !!preset.race && !raced.current && i.type === 'donate' });
        if (i.type === 'donate') raced.current = true;
        if ('refused' in out) {
          const id = ++toastId;
          state.current = { ...state.current, toasts: [...state.current.toasts, { id, message: out.refused }] };
          emit();
          setTimeout(() => client.dismiss(id), 4_000);
          // A refused race still shows the gift that beat it.
          if (out.next) setView(out.next);
          return;
        }
        setView(out);
      },
    } as unknown as TableClient;
  }, [seat]);
  // The reveal runs its clock, then the law takes effect.
  useEffect(() => {
    if (view.politics?.council?.stage !== 'reveal') return;
    const t = setTimeout(() => setView(closeReveal), view.politics.council.revealMs);
    return () => clearTimeout(t);
  }, [view.politics?.council?.stage]);
  return { client, view, setView };
}

/** The real app's providers around a live fixture view, as one seat's phone sees it. */
export function LivePhone({ start, seat = GOVERNOR, preset = {}, children }: { start: MuleView; seat?: string; preset?: Preset; children: ReactNode }) {
  const { client, view } = useLiveClient(start, seat, preset);
  const self = view.players.find((p) => p.id === seat)!;
  const slot = view.players.findIndex((p) => p.id === seat) as Slot;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: GOVERNOR, seats: view.players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })), boards: 1, game: view };
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!preset.desk) return;
    // The hub keeps its open desk to itself: open the page's desk as a tap on its tab would.
    // The Governor's desk asks first and settles in over a render or two: tap until ours has stayed open a while.
    let tries = 0;
    let held = 0;
    const id = setInterval(() => {
      const f = frame.current;
      if (!f || ++tries > 50) return clearInterval(id);
      if (f.querySelector(`[data-testid="desk-body-${preset.desk}"]`)) {
        if (++held >= 5) clearInterval(id);
        return;
      }
      held = 0;
      f.querySelector<HTMLButtonElement>(`[data-testid="desk-${preset.desk}"]`)?.click();
    }, 100);
    return () => clearInterval(id);
  }, []);
  return (
    <PresetCtx.Provider value={preset}>
      <ClientProvider client={client}>
        <SeatSpeciesProvider value={seatSpecies(view)}>
          <PhoneGameProvider value={{ table, view, me: view.me!, self, slot }}>
            <PhoneFrame frameRef={frame}>
              {children}
              <Toasts />
            </PhoneFrame>
          </PhoneGameProvider>
        </SeatSpeciesProvider>
      </ClientProvider>
    </PresetCtx.Provider>
  );
}

/** A phone held sideways at the e2e harness's size (844 × 390). COPY: land-auction's PhoneFrame; transform-gpu keeps the toasts inside it. */
export function PhoneFrame({ children, frameRef }: { children: ReactNode; frameRef?: React.RefObject<HTMLDivElement> }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div ref={frameRef} className="h-[390px] w-[844px] transform-gpu overflow-hidden rounded-sheet border border-holo-line shadow-map" data-testid="phone-frame">
        {children}
      </div>
    </div>
  );
}

/** The big screen at its design size (1280 × 720), scaled to 75 %. COPY: land-auction's TvFrame. */
export function TvFrame({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="overflow-hidden rounded-panel border border-holo-line" style={{ width: 960, height: 540 }} data-testid="tv-frame">
        <div className="origin-top-left scale-[0.75]" style={{ width: 1280, height: 720 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The TV's providers: the client is only read, never written. */
export function TvGame({ view, children }: { view: MuleView; children: ReactNode }) {
  const client = useMemo(
    () => ({ subscribe: () => () => {}, getState: () => ({ status: 'open', role: 'board', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }), serverNow: () => Date.now(), intent: () => {} }) as unknown as TableClient,
    [],
  );
  return (
    <ClientProvider client={client}>
      <SeatSpeciesProvider value={seatSpecies(view)}>
        <TvFrame>{children}</TvFrame>
      </SeatSpeciesProvider>
    </ClientProvider>
  );
}
