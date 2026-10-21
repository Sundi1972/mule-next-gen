import { useEffect, useState, type ReactNode } from 'react';
import { LISTINGS, VIEW, WALK } from './fixture';
import { Game, PhoneFrame, useLotWalk } from './harness';
import { PhoneSell } from './screens/PhoneSell';
import { PhoneWalkA } from './screens/PhoneWalkA';
import { PhoneWalkB } from './screens/PhoneWalkB';

/** Routes are hash tokens (#walk-a), so a link opens one screen directly. */
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
  'A month gets a land auction right after the land grant, only when someone listed a plot or a MULE in planning (at most 4 lots a month).',
  'Each lot: a short intro with the plot lit on the map, a 12 s walk, then sold or unsold.',
  'Everyone but the seller is a buyer, if they can pay the minimum. No Buyer/Seller/Pass choice.',
  'Buyers start under the MIN line and hold Up. The highest bid at or over the minimum wins at the bell; a tie goes to whoever got there first.',
  'Your bid stops at your money. The seller watches; their plot is never on their own board.',
];

/** The Sell tab's states: an empty line-up, the usual one, and a month whose slots are all taken. */
const SELL_STATES = [
  { id: 'sell-empty', title: 'Nothing listed yet', listings: [] },
  { id: 'sell', title: 'Two lots listed', listings: LISTINGS.slice(0, 2) },
  { id: 'sell-full', title: 'Auction full', listings: [...LISTINGS, { ...LISTINGS[0]!, id: 'l4', seller: 'kai', item: { kind: 'plot' as const, x: 13, y: 1 }, minimum: 140 }] },
];

/** One walk, playable: hold Up or Down (or drag on the board). */
function Walk({ variant }: { variant: 'a' | 'b' }) {
  const { lot, walk, restart } = useLotWalk(WALK, 640);
  const Screen = variant === 'a' ? PhoneWalkA : PhoneWalkB;
  return (
    <div className="flex flex-col gap-2">
      <PhoneFrame>
        <Game>
          <Screen lot={lot} walk={walk} />
        </Game>
      </PhoneFrame>
      <div className="flex items-center gap-3 font-mono text-xs text-ink-3">
        <span>
          {lot.stage === 'result' && lot.result?.kind === 'sold' ? `SOLD to ${lot.result.buyer} for ${lot.result.price}` : `${lot.seconds.toFixed(1)} s left`}
        </span>
        <button type="button" className="text-holo underline" onClick={restart} data-testid="restart">
          restart the walk
        </button>
      </div>
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

export default function App() {
  const hash = useHash();
  if (hash === 'walk-a')
    return (
      <Page title="Walk · variant A · board first">
        <Walk variant="a" />
      </Page>
    );
  if (hash === 'walk-b')
    return (
      <Page title="Walk · variant B · map beside the board">
        <Walk variant="b" />
      </Page>
    );
  if (hash.startsWith('sell'))
    return (
      <Page title={SELL_STATES.find((s) => s.id === hash)?.title ?? 'Planning · Sell'}>
        <div className="flex gap-3 pb-3 font-mono text-xs">
          {SELL_STATES.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={hash === s.id ? 'text-ink' : 'text-holo underline'} data-testid={`state-${s.id}`}>
              {s.title}
            </a>
          ))}
        </div>
        <PhoneFrame>
          <Game>
            <PhoneSell key={hash} startListings={SELL_STATES.find((s) => s.id === hash)?.listings ?? VIEW.listings} />
          </Game>
        </PhoneFrame>
        <p className="mt-2 max-w-[844px] text-sm text-ink-2">Tap one of your (orange) plots, then try Plot or MULE, − / +, and the unsold choice. "Put it up for auction" adds it to the line-up; UNLIST takes yours back.</p>
      </Page>
    );
  return (
    <div className="min-h-full bg-table p-8 text-ink" data-testid="index">
      <h1 className="font-display text-3xl font-semibold">Land auction · mocks</h1>
      <p className="mt-1 text-sm text-ink-2">WS3 · spec docs/specs/2026-10-21-ws3-land-auction.md · fixture: month 4, lot 2 of 3, Brix sells plot 6·4 (Plains, with its Energy MULE), minimum 250.</p>
      <h2 className="label-caps mt-6">Decided (D1–D8, ruled 21 Oct)</h2>
      <ul className="mt-2 flex max-w-3xl list-disc flex-col gap-1 pl-5 text-sm text-ink-2" data-testid="decisions">
        {DECISIONS.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <h2 className="label-caps mt-8">Step 1 · Pick the walk's layout (the hardest screen)</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        Both are live: hold Up or Down, or drag on the board. Ossa (AI) answers your lead up to its limit. Your phone, Lena's, has 640 cr.
      </p>
      <div className="mt-4 flex flex-wrap gap-10">
        <section className="flex flex-col gap-2" data-testid="variant-a">
          <a href="#walk-a" className="font-display text-lg font-semibold text-holo underline">
            A · Board first
          </a>
          <p className="max-w-[844px] text-sm text-ink-2">The board gets the whole main area, as at the goods auction. The rail shows the lot, your ground reading and who leads. The map shows only in the lot's intro.</p>
          <Walk variant="a" />
        </section>
        <section className="flex flex-col gap-2" data-testid="variant-b">
          <a href="#walk-b" className="font-display text-lg font-semibold text-holo underline">
            B · Map beside the board
          </a>
          <p className="max-w-[844px] text-sm text-ink-2">The plot stays lit on a small map for the whole walk, so you see the cluster it would complete. The board gets narrower; the rail drops the ground reading.</p>
          <Walk variant="b" />
        </section>
      </div>
      <h2 className="label-caps mt-8">Step 2 · Planning · Sell tab</h2>
      <ul className="mt-2 flex gap-4 text-sm">
        {SELL_STATES.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="text-holo underline" data-testid={`link-${s.id}`}>
              {s.title}
            </a>
          </li>
        ))}
      </ul>
      <h2 className="label-caps mt-8">Next, built to the chosen walk layout</h2>
      <p className="mt-1 text-sm text-ink-3">Lot intro · sold / unsold · the seller's own view · big screen (/table) for intro, walk and result.</p>
    </div>
  );
}
