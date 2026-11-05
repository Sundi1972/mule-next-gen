import { useEffect, useState, type ReactNode } from 'react';
import { ME } from './auction';
import { PhoneAuction, TvAuction, useDeal, type Variant } from './Screens';
import type { State } from './auction';

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
  'Everyone is in every goods auction (Heiko, 5 Nov): each good opens with every player a buyer at the foot of the board, computer players too. There is no Pass. Sitting a good out is standing still at the bottom, which is below the store’s buying line, so it trades nothing.',
  'Your side is one switch, Buy | Sell, on the status screen and all through the walk. Sell puts you at the top, Buy at the bottom, so a switch never trades by itself. Sell is greyed when you hold none.',
  'Trading starts by itself where the lines meet, with another player or at the store’s line. There is no “how many?” question, no “Sell 7 for 189 cr” button and no “you need these” confirm. You stop by stepping off (one tap of ▲ for a seller, ▼ for a buyer).',
  'It starts slow and gets faster: the first unit after 0.4 s, each one after it 20% quicker, down to 0.06 s. Twelve units take about 2 s, and the good’s clock runs at a quarter speed while units move.',
  'Selling below what you need next month is shown, not asked: your HAVE turns amber and the rail says “You keep 3 of the 5 Food you need”. (WS3 is asking the PM whether it should pause at the need instead.)',
  'The question for Heiko: how the speed-up shows on the phone. A, on the board: the deal’s counter carries ›››› chevrons that light up as it speeds up, and the glowing bar pulses faster. B, in the rail: a big meter (units sold, money in, a SLOW→FAST bar). The TV always shows it on the board and in words.',
];

const LINKS: { id: string; title: string }[] = [
  { id: 'status', title: '1 · Status: everyone starts as a buyer' },
  { id: 'walk', title: '2 · The walk, as a buyer' },
  { id: 'switched', title: '3 · Switched to Sell: at the top' },
  { id: 'store-a', title: '4A · Selling to the store: speed on the board' },
  { id: 'store-b', title: '4B · Selling to the store: speed meter in the rail' },
  { id: 'players-a', title: '5 · Selling to another player (A)' },
  { id: 'tv', title: 'TV · the same sale on the big screen' },
];

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-full bg-table p-6 text-ink">
      <a href="#" className="label-caps text-holo">← All screens</a>
      <h1 className="mt-2 font-display text-3xl font-semibold">{title}</h1>
      <div className="mt-4 flex flex-col gap-6">{children}</div>
    </main>
  );
}

function Index() {
  return (
    <Page title="Goods auction: trades by itself">
      <ol className="flex max-w-4xl list-decimal flex-col gap-2 pl-5 text-base leading-snug text-ink-2" data-testid="decisions">
        {DECISIONS.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ol>
      <ul className="flex flex-col gap-2" data-testid="screens">
        {LINKS.map((l) => (
          <li key={l.id}>
            <a className="text-holo underline-offset-4 hover:underline" href={`#${l.id}`}>
              {l.title}
            </a>
          </li>
        ))}
      </ul>
    </Page>
  );
}

function PhoneState({ state, variant, title }: { state: State; variant: Variant; title: string }) {
  const live = state === 'store' || state === 'players';
  const deal = useDeal(ME.have, live);
  return (
    <Page title={title}>
      {live && (
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs" data-testid="controls">
          <button type="button" className="rounded-control border border-holo px-2 py-1 text-holo" onClick={deal.replay}>
            play the sale again
          </button>
          <span className="text-ink-3">Tap ▲ Up on the phone to step off: the sale stops at once.</span>
        </div>
      )}
      <span className="label-caps">Lena’s phone, sideways (844 × 390)</span>
      <div className="max-w-full overflow-x-auto">
        <div className="h-[390px] w-[844px] overflow-hidden rounded-sheet border border-holo-line shadow-map" data-testid="phone-frame">
          <PhoneAuction state={state} variant={variant} deal={deal} />
        </div>
      </div>
    </Page>
  );
}

function TvState() {
  const deal = useDeal(ME.have, true);
  return (
    <Page title="TV · Lena sells to the store">
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
        <button type="button" className="rounded-control border border-holo px-2 py-1 text-holo" onClick={deal.replay}>
          play the sale again
        </button>
        <button type="button" className="rounded-control border border-holo-line px-2 py-1" onClick={deal.stop}>
          Lena steps off
        </button>
      </div>
      <div className="max-w-full overflow-x-auto">
        <div className="overflow-hidden rounded-panel border border-holo-line" style={{ width: 960, height: 540 }} data-testid="tv-frame">
          <div className="origin-top-left scale-[0.75]" style={{ width: 1280, height: 720 }}>
            <TvAuction deal={deal} />
          </div>
        </div>
      </div>
    </Page>
  );
}

export default function App() {
  const hash = useHash();
  const link = LINKS.find((l) => l.id === hash);
  if (!link) return <Index />;
  if (hash === 'tv') return <TvState />;
  const [state, v] = hash.split('-') as [State, string | undefined];
  return <PhoneState key={hash} state={state} variant={v === 'b' ? 'B' : 'A'} title={link.title} />;
}
