import type { Good } from '@mule/engine';
import type { MarketRow } from '@mule/protocol';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../mock.css';
import '../../review-loop/select-client';
import { baseWorld, BROKEN_BY_KAI, card, DEFAULT_SHARES, GOVERNOR, MOVES, NAME, OFFER_FROM_OSSA, PROMISED_BRIX, SHERIFF, VOTE_BRIX, type MockWorld } from '../fixture';
import { beatOf, BEATS } from '../steps';
import { brokenWords } from './copied/deals-words';
import { TV_NOTE, TvFor, TvScreenView, type TvFocus } from './TvFor';
import { tvScreen, type Seats } from './world';

/*
 * MOCK PLUMBING: the TV alone, for this builder's own checks (TV-FIT, page errors); the prototype itself is the phone
 * side's page. /src/tv/solo.html with
 *   ?focus=<focus>  a stand-in world for that step: from 'deal-broken' on it holds a card Ossa · AI broke this month,
 *                   its line at the head of the news, as the brief's path has it;
 *   &market=1       a full six-row market and MULEs in the corral (the phone side's view had none on 8 Nov);
 *   &seats=2|6      the table at another size (world.ts, measuring only);
 *   &folded=0|1     open the step's event as a moment, or as old news (TvFor's eventFolded);
 *   ?beat=<id>      the guided path's own world for that beat, as the prototype hands it to the TV.
 */

const FOCI: TvFocus[] = ['planning', 'deal-offered', 'deal-broken', 'budget-set', 'overrule-called', 'overrule-reveal', 'guarding', 'waiting', 'month-end'];
const Q = new URLSearchParams(location.search);

/** Ossa · AI breaks its promise to Kai this month: a vote for Brix. */
const OSSA_BROKE = card({ id: 'deal-o5k1ai', from: 'ossa', to: 'kai', terms: VOTE_BRIX, offered: 4, until: 5, status: 'broken', brokenBy: 'ossa', settled: 5 });

/** The break as the server would hold it: the card, the breaker's reputation moved, its public line first in the news. */
function withBreak(w: MockWorld): MockWorld {
  const players = Object.entries(NAME).map(([id, name]) => ({ id, name }));
  const line = `${brokenWords({ players } as Parameters<typeof brokenWords>[0], OSSA_BROKE)}.`;
  return { ...w, rep: { ...w.rep, ossa: (w.rep.ossa ?? 0) + MOVES.voteBroken }, cards: [OSSA_BROKE, ...w.cards], news: [line, ...w.news] };
}

function worldFor(focus: TvFocus): MockWorld {
  const opened = baseWorld({ budget: { shares: DEFAULT_SHARES, setBy: null }, cards: [PROMISED_BRIX, BROKEN_BY_KAI] });
  const broke = withBreak({ ...opened, budget: baseWorld().budget });
  const ballots = { lena: true, kai: true, brix: false, ossa: false };
  switch (focus) {
    case 'planning':
      return opened;
    case 'deal-offered':
      return { ...opened, cards: [OFFER_FROM_OSSA, ...opened.cards] };
    case 'deal-broken':
      return withBreak(opened);
    case 'budget-set':
    case 'guarding':
      return broke;
    case 'overrule-called':
      return { ...broke, call: SHERIFF };
    case 'overrule-reveal':
      return { ...broke, call: SHERIFF, stage: 'overruleReveal', overruleBallots: ballots, overruleDone: Object.keys(ballots) };
    case 'waiting':
      return { ...broke, ready: ['lena', GOVERNOR] };
    case 'month-end':
      return { ...broke, stage: 'monthEnd' };
  }
}

/** A stand-in market (design/mocks/ws6-ux's fixture rows, plus Alloy): six tiles, as the game draws them. */
const row = (good: Good, price: number, storeStock: number, cover: number): MarketRow =>
  ({ good, price, storeBuys: Math.floor(price * 0.9), storeSells: storeStock > 0 ? Math.ceil(price * 1.1) : null, storeStock, cover, demand: 10, shipPays: null }) as MarketRow;
const MARKET = [row('food', 31, 12, 2.1), row('water', 27, 9, 2.6), row('energy', 26, 7, 1.4), row('smithore', 60, 2, 0.6), row('crystite', 96, 0, 4), row('alloy', 140, 1, 1.2)];

/** Every TvBody / FitHeight scale on the page, as data-fit says (the real TvFit's own readout), and a moment if one shows. */
function FitReadout() {
  const [fits, setFits] = useState('');
  useEffect(() => {
    const t = setInterval(() => {
      const tv = document.querySelector('[data-testid="tv"]');
      const fit = [...(tv?.querySelectorAll('[data-fit]') ?? [])].map((el) => el.getAttribute('data-fit')).join(' · ');
      setFits(`${fit}${tv?.querySelector('[data-testid="tv-moment"]') ? ' · moment' : ''}`);
    }, 300);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-sm" data-testid="solo-fit">
      TV-FIT {fits}
    </span>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-2">
      <a className="text-holo underline" href="?" data-testid="solo-back">
        All steps
      </a>
      {children}
      <FitReadout />
    </div>
  );
}

function Focus({ focus }: { focus: TvFocus }) {
  const seats = (Number(Q.get('seats')) || 4) as Seats;
  const folded = Q.get('folded') === null ? undefined : Q.get('folded') === '1';
  const market = Q.get('market') === '1';
  const screen = useMemo(() => {
    const s = tvScreen(worldFor(focus), { seats });
    if (!market) return s;
    const game = { ...s.game, market: MARKET, storeMules: 5, mulePrice: 148 };
    return { ...s, game, table: { ...s.table, game } };
  }, [focus, seats, market]);
  return (
    <div className="flex flex-col gap-2 bg-table text-ink">
      <Bar>
        <span className="text-sm">{TV_NOTE[focus]}</span>
      </Bar>
      <TvScreenView screen={screen} focus={focus} opensOn={folded ? null : focus === 'deal-broken' ? 'break' : focus === 'overrule-called' ? 'call' : null} />
    </div>
  );
}

function Beat({ id }: { id: string }) {
  const beat = beatOf(id);
  const world = useMemo(() => beat.world(), [beat]);
  return (
    <div className="flex flex-col gap-2 bg-table text-ink">
      <Bar>
        <span className="font-mono text-sm">
          {beat.id} · {beat.tv}
        </span>
      </Bar>
      <TvFor world={world} focus={beat.tv} />
    </div>
  );
}

function Solo() {
  const beat = Q.get('beat');
  if (beat) return <Beat id={beat} />;
  const focus = Q.get('focus') as TvFocus | null;
  if (focus && FOCI.includes(focus)) return <Focus focus={focus} />;
  return (
    <ul className="flex flex-col gap-2 p-6 text-ink" data-testid="solo-index">
      {FOCI.map((f) => (
        <li key={f}>
          <a className="text-holo underline" href={`?focus=${f}`} data-testid={`solo-link-${f}`}>
            {f}
          </a>{' '}
          <span className="text-ink-2">{TV_NOTE[f]}</span>
        </li>
      ))}
      {BEATS.map((b) => (
        <li key={b.id}>
          <a className="text-holo underline" href={`?beat=${b.id}`} data-testid={`solo-beat-${b.id}`}>
            beat {b.id}
          </a>{' '}
          <span className="text-ink-2">{b.tv}</span>
        </li>
      ))}
    </ul>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Solo />
  </StrictMode>,
);
