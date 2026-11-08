import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../mock.css';
import '../../review-loop/select-client';
import { baseWorld, BROKEN_BY_KAI, card, DEFAULT_SHARES, GOVERNOR, MOVES, OFFER_FROM_OSSA, PROMISED_BRIX, SHERIFF, VOTE_BRIX, type World } from '../fixture';
import { brokenWords } from './copied/deals-words';
import type { Good } from '@mule/engine';
import type { MarketRow } from '@mule/protocol';
import { TV_NOTE, TvFor, TvScreenView, type TvFocus } from './TvFor';
import { tvScreen } from './world';

/*
 * MOCK PLUMBING: the TV alone, one focus per page, for this builder's own checks (TV-FIT, page errors). Served at
 * /src/tv/solo.html?focus=<focus>; the prototype itself is the phone side's index. The worlds here are stand-ins for the
 * step engine's: each holds what its step would (a card broken this month, a call, the cast ballots).
 */

const FOCI: TvFocus[] = ['planning', 'deal-offered', 'deal-broken', 'budget-set', 'overrule-called', 'overrule-reveal', 'guarding', 'waiting', 'month-end'];

/** Ossa · AI breaks its promise to Kai this month: a vote for Brix (the guided path's break). */
const OSSA_BROKE = card({ id: 'deal-o5k1ai', from: 'ossa', to: 'kai', terms: VOTE_BRIX, offered: 4, until: 5, status: 'broken', brokenBy: 'ossa', settled: 5 });

function withBreak(w: World): World {
  const rep = { ...w.rep, ossa: (w.rep.ossa ?? 0) + MOVES.voteBroken };
  const players = [{ id: 'ossa', name: 'Ossa', isAi: true }, { id: 'kai', name: 'Kai', isAi: false }, { id: 'brix', name: 'Brix', isAi: false }];
  const line = `${brokenWords({ players } as never, OSSA_BROKE)}.`;
  return { ...w, rep, cards: [OSSA_BROKE, ...w.cards], news: [line, ...w.news] };
}

function worldFor(focus: TvFocus): World {
  const opened = baseWorld({ budget: { shares: DEFAULT_SHARES, setBy: null }, cards: [PROMISED_BRIX, BROKEN_BY_KAI] });
  const set = { ...opened, budget: baseWorld().budget };
  switch (focus) {
    case 'planning':
      return opened;
    case 'deal-offered':
      return { ...opened, cards: [OFFER_FROM_OSSA, ...opened.cards] };
    case 'deal-broken':
      return withBreak(opened);
    case 'budget-set':
      return withBreak(set);
    case 'overrule-called':
      return { ...withBreak(set), call: SHERIFF };
    case 'overrule-reveal': {
      const ballots = { lena: true, kai: true, brix: false, ossa: false };
      return { ...withBreak(set), call: SHERIFF, stage: 'overrule', overruleBallots: ballots, overruleDone: Object.keys(ballots) };
    }
    case 'guarding':
      return { ...withBreak(set), call: SHERIFF };
    case 'waiting':
      return { ...withBreak(set), call: SHERIFF, ready: ['lena', GOVERNOR] };
    case 'month-end':
      return withBreak(set);
  }
}

/**
 * &market=1: the phone side's view has no market (aMuleView's empty one) and no MULEs in the corral; the real TV has
 * both, and the market's six tiles are height the planning side keeps. A stand-in market (design/mocks/ws6-ux's
 * fixture rows, plus Alloy) measures TV-FIT as the game would draw it.
 */
const row = (good: Good, price: number, storeStock: number, cover: number): MarketRow =>
  ({ good, price, storeBuys: Math.floor(price * 0.9), storeSells: storeStock > 0 ? Math.ceil(price * 1.1) : null, storeStock, cover, demand: 10, shipPays: null }) as MarketRow;
const MARKET = [row('food', 31, 12, 2.1), row('water', 27, 9, 2.6), row('energy', 26, 7, 1.4), row('smithore', 60, 2, 0.6), row('crystite', 96, 0, 4), row('alloy', 140, 1, 1.2)];

/** Every TvBody / FitHeight scale on the page, as data-fit says (the real TvFit's own readout). */
function FitReadout() {
  const [fits, setFits] = useState('');
  useEffect(() => {
    const t = setInterval(() => setFits([...document.querySelectorAll('[data-testid="tv"] [data-fit]')].map((el) => el.getAttribute('data-fit')).join(' · ')), 300);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-sm" data-testid="solo-fit">
      TV-FIT {fits}
    </span>
  );
}

function WithMarket({ focus }: { focus: TvFocus }) {
  const s = tvScreen(worldFor(focus), focus);
  const game = { ...s.game, market: MARKET, storeMules: 5, mulePrice: 148 };
  return <TvScreenView screen={{ ...s, game, table: { ...s.table, game } }} focus={focus} />;
}

const Q = new URLSearchParams(location.search);

function Solo() {
  const focus = Q.get('focus') as TvFocus | null;
  if (!focus || !FOCI.includes(focus))
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
      </ul>
    );
  return (
    <div className="flex flex-col gap-2 bg-table text-ink">
      <div className="flex items-center gap-4 px-2">
        <a className="text-holo underline" href="?" data-testid="solo-back">
          All steps
        </a>
        <span className="text-sm">{TV_NOTE[focus]}</span>
        <FitReadout />
      </div>
      {Q.get('market') === '1' ? <WithMarket focus={focus} /> : <TvFor world={worldFor(focus)} focus={focus} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Solo />
  </StrictMode>,
);
