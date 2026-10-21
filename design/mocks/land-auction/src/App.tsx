import { useEffect, useState, type ReactNode } from 'react';
import { INTRO, KEPT, LISTINGS, SOLD, STORE, VIEW, WALK, WON } from './fixture';
import { Game, PhoneFrame, TvFrame, useLotFlow } from './harness';
import type { LandAuctionView, LotsView } from './proto';
import { PhoneLandAuction } from './screens/PhoneLandAuction';
import { PhoneSell } from './screens/PhoneSell';
import { TvLandAuction } from './screens/TvLandAuction';

/** Routes are hash tokens (#lot, #walk), so a link opens one screen directly. */
function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

const DECISIONS = [
  'A month gets a land auction right after the land grant, only when someone listed a plot or a MULE in planning (at most 4 lots a month, 2 per player).',
  'Each lot: a 3 s intro with the plot lit on the map, a 12 s walk, then 2.5 s of sold or unsold.',
  'Everyone but the seller is a buyer, if they can pay the minimum. No Buyer/Seller/Pass choice.',
  'Buyers start under the MIN line and hold Up. The highest bid at or over the minimum wins at the bell; a tie goes to whoever got there first.',
  'Your bid stops at your money. The seller watches; there are no Up/Down buttons for them.',
  'Walk layout A, board first (Heiko, 21 Oct). The map shows in the intro on the phone and all the time on the TV.',
];

/** The Sell tab's states: an empty line-up, the usual one, and a month whose slots are all taken. */
const SELL_STATES = [
  { id: 'sell-empty', title: 'Nothing listed yet', listings: [] },
  { id: 'sell', title: 'Two lots listed', listings: LISTINGS.slice(0, 2) },
  { id: 'sell-full', title: 'Auction full', listings: [...LISTINGS, { ...LISTINGS[0]!, id: 'l4', seller: 'kai', item: { kind: 'plot' as const, x: 13, y: 1 }, minimum: 140 }] },
];

/** Every phone state, as Lena (a buyer) unless the seat says otherwise. */
const PHONE_STATES: { id: string; title: string; lot: LandAuctionView; seat?: string; view?: LotsView }[] = [
  { id: 'intro', title: 'Intro', lot: INTRO },
  { id: 'walk', title: 'Walk · Ossa leads', lot: WALK },
  { id: 'sold', title: 'Sold to someone else', lot: SOLD },
  // At the bell the winner has paid: 640 − 335.
  { id: 'won', title: 'You won it', lot: WON, view: { ...VIEW, players: VIEW.players.map((p) => (p.id === 'lena' ? { ...p, money: 305, plots: 6 } : p)) } },
  { id: 'store', title: 'Unsold · the store buys (a MULE lot)', lot: STORE },
  { id: 'kept', title: 'Unsold · the seller keeps it', lot: KEPT },
  { id: 'seller-walk', title: "Seller's view · walk", lot: WALK, seat: 'brix' },
  { id: 'seller-sold', title: "Seller's view · sold", lot: SOLD, seat: 'brix' },
  { id: 'aside', title: "Can't pay the minimum (Kai)", lot: WALK, seat: 'kai' },
];

const TV_STATES = [
  { id: 'tv-intro', title: 'Intro', lot: INTRO },
  { id: 'tv-walk', title: 'Walk', lot: WALK },
  { id: 'tv-sold', title: 'Sold', lot: SOLD },
  { id: 'tv-kept', title: 'Unsold', lot: KEPT },
];

/** The whole lot, playable: intro, then hold Up or Down (or drag on the board), then the result. */
function PlayableLot() {
  const { lot, walk, restart } = useLotFlow(INTRO, { ...WALK, seconds: 12 }, 640);
  return (
    <div className="flex flex-col gap-3">
      <PhoneFrame>
        <Game>
          <PhoneLandAuction lot={lot} walk={walk} />
        </Game>
      </PhoneFrame>
      <button type="button" className="self-start font-mono text-xs text-holo underline" onClick={restart} data-testid="restart">
        play the lot again
      </button>
      <TvFrame>
        <TvLandAuction lot={lot} />
      </TvFrame>
    </div>
  );
}

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-table p-8 text-ink">
      <a href="#" className="font-mono text-xs text-holo underline" data-testid="back">
        ← index
      </a>
      <h1 className="mb-4 mt-2 font-display text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

function Links({ states, current }: { states: { id: string; title: string }[]; current?: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {states.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className={s.id === current ? 'text-ink' : 'text-holo underline'} data-testid={`link-${s.id}`}>
            {s.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  const hash = useHash();

  if (hash === 'lot')
    return (
      <Page title="One lot, start to finish · phone and TV">
        <PlayableLot />
      </Page>
    );

  const sell = SELL_STATES.find((s) => s.id === hash);
  if (sell)
    return (
      <Page title={`Planning · Sell · ${sell.title}`}>
        <div className="pb-3">
          <Links states={SELL_STATES} current={hash} />
        </div>
        <PhoneFrame>
          <Game>
            <PhoneSell key={hash} startListings={sell.listings} />
          </Game>
        </PhoneFrame>
        <p className="mt-2 max-w-[844px] text-sm text-ink-2">Tap one of your (orange) plots, then try Plot or MULE, − / +, and the unsold choice. "Put it up for auction" adds it to the line-up; UNLIST takes yours back.</p>
      </Page>
    );

  const phone = PHONE_STATES.find((s) => s.id === hash);
  if (phone)
    return (
      <Page title={`Phone · ${phone.title}`}>
        <div className="pb-3">
          <Links states={PHONE_STATES} current={hash} />
        </div>
        <PhoneFrame>
          <Game seat={phone.seat ?? 'lena'} {...(phone.view ? { view: phone.view } : {})}>
            <PhoneLandAuction lot={phone.lot} />
          </Game>
        </PhoneFrame>
      </Page>
    );

  const tv = TV_STATES.find((s) => s.id === hash);
  if (tv)
    return (
      <Page title={`Big screen · ${tv.title}`}>
        <div className="pb-3">
          <Links states={TV_STATES} current={hash} />
        </div>
        <TvFrame>
          <TvLandAuction lot={tv.lot} />
        </TvFrame>
      </Page>
    );

  return (
    <div className="min-h-full bg-table p-8 text-ink" data-testid="index">
      <h1 className="font-display text-3xl font-semibold">Land auction · mocks</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        WS3 · spec docs/specs/2026-10-21-ws3-land-auction.md · fixture: month 4, lot 2 of 3. Brix sells plot 6·4 (Plains, with its Energy MULE) at a minimum of 250. Lena (this phone) has {VIEW.players[0]!.money} cr; Ossa is an AI; Kai can't pay the minimum.
      </p>
      <h2 className="label-caps mt-6">Decided</h2>
      <ul className="mt-2 flex max-w-3xl list-disc flex-col gap-1 pl-5 text-sm text-ink-2" data-testid="decisions">
        {DECISIONS.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <h2 className="label-caps mt-8">Start here</h2>
      <p className="mt-1 text-sm">
        <a href="#lot" className="font-display text-lg font-semibold text-holo underline" data-testid="link-lot">
          One lot, start to finish (phone and TV, playable)
        </a>
      </p>
      <h2 className="label-caps mt-8">Planning · Sell tab</h2>
      <div className="mt-2">
        <Links states={SELL_STATES} />
      </div>
      <h2 className="label-caps mt-8">Phone · every state</h2>
      <div className="mt-2">
        <Links states={PHONE_STATES} />
      </div>
      <h2 className="label-caps mt-8">Big screen · every state</h2>
      <div className="mt-2">
        <Links states={TV_STATES} />
      </div>
      <p className="mt-8 text-xs text-ink-3">Layout B (map beside the board) was not chosen; it stays in git at 059b6ef.</p>
    </div>
  );
}
