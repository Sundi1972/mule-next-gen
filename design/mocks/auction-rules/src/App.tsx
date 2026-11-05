import { useEffect, useState, type ReactNode } from 'react';
import { PhoneRest, PhoneSale, PhoneSoldOut, PhoneSwitch, TvSale, TvSoldOut, useSale, useSoldOut, useSwitch, type Variant } from './Screens';

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

/** What the table will see, one line each: the decisions this mock asks the PM and Heiko to check. */
const DECISIONS: ReactNode[] = [
  <>
    <strong>Rest bands (D).</strong> The board gets a hatched band above the store’s selling line, where sellers wait, and
    one below its buying line, where buyers wait. Each has a solid edge at the store’s line. Nobody trades inside a band,
    and it says so: “SELLERS WAIT · NO TRADE”. Everyone starts the walk in their side’s band.
  </>,
  <>
    <strong>The pace.</strong> Units trade at about one a second at first, then faster, up to five a second (WS3’s
    values, being set now). The phone shows “2.4 a second · rising to 5” under the hint, and the TV adds it beside the
    deal’s chevrons.
  </>,
  <>
    <strong>Stop at the need (B).</strong> A seller’s sale stops by itself when she is down to next month’s need. Her
    creature steps up off the line and gets a green <em>KEEPS 5</em> mark; the rail says “Stopped at 5 Food: what you need
    next month”. The TV says “Lena keeps 5 Food”.
  </>,
  <>
    <strong>Selling into a shortage is an act (B).</strong> Two ways to show it, for Heiko to pick:{' '}
    <strong>A</strong>, on the walk pad: the ▼ button turns amber, “▼ Hold: sell short”, and you hold it for a second
    as it fills; letting go early does nothing. <strong>B</strong>, in the rail: a card, “Keep 5 for next month, or sell
    them too and be short?”, with a “Sell into a shortage” button. Either way she walks back down, the sale starts slow
    again, her mark turns amber, <em>SHORT 2</em>, and the TV says “Lena sells short”.
  </>,
  <>
    <strong>Switching side (C).</strong> Buy | Sell stays in the rail all through the walk. A switch takes you straight
    into your new side’s band, Sell up and Buy down, and passing the others on the way trades nothing. So a switch
    never trades by itself.
  </>,
  <>
    <strong>Store sold out (E).</strong> The store’s selling line becomes “SOLD OUT · TOP BID 43 ↑” and rides on the
    highest bid, so buyers can bid past its old price. The sellers’ band shrinks with it, and a seller has to come down to
    meet the bid. The rail and the TV both say “Store sold out”.
  </>,
];

const RECOMMENDATION = (
  <>
    <strong>Recommendation: A</strong> (hold ▼ to sell short). The act happens where her thumb already is, on the
    control that moves her. A one-second hold can’t happen by accident, even mid-walk. It needs no new box in a rail
    that has no row to spare on a phone held sideways (390 px tall). B’s words are plainer for a first game, but it costs
    a card and a second place to look. With A the rail’s hint carries those words, “To sell more, hold ▼: you’d be short
    next month”.
  </>
);

const QUESTIONS = [
  'Settled by WS3 (a33879c4): no detent. The board’s own top and bottom are the hard edges; a store line is crossed by a deliberate hold, and selling below your need is caught by the stop at the need.',
  'Settled: the seller steps one price step off the line, and the KEEPS mark comes from the view’s held, not from the distance.',
  'Settled: sold out, the line stays at the old price until a bid passes it, then follows the top bid; every seller above it still rests.',
];

const LINKS: { id: string; title: string }[] = [
  { id: 'rest', title: '1 · D: the rest bands, at the start of the walk' },
  { id: 'sale-a', title: '2A · B: stops at the need; hold ▼ to sell short' },
  { id: 'sale-b', title: '2B · B: stops at the need; a card to sell short' },
  { id: 'tv-sale', title: 'TV · the same sale on the big screen' },
  { id: 'switch', title: '3 · C: Buy | Sell during the walk' },
  { id: 'soldout', title: '4 · E: the store sold out, bids past its old price' },
  { id: 'tv-soldout', title: 'TV · sold out on the big screen' },
];

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-full bg-table p-6 text-ink">
      <a href="#" className="label-caps text-holo">
        ← All screens
      </a>
      <h1 className="mt-2 font-display text-3xl font-semibold">{title}</h1>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </main>
  );
}

function Index() {
  return (
    <Page title="Goods auction: four rule changes from the table">
      <p className="max-w-4xl text-ink-2">
        Heiko asked for these at the table on 5 Nov; WS3 writes the rules. The board and the phone are drawn as built
        today, plus #374’s headline. Only the changes below are new.
      </p>
      <ol className="flex max-w-4xl list-decimal flex-col gap-2 pl-5 text-base leading-snug text-ink-2" data-testid="decisions">
        {DECISIONS.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ol>
      <p className="max-w-4xl rounded-panel border border-holo bg-holo-soft p-3 leading-snug" data-testid="recommendation">
        {RECOMMENDATION}
      </p>
      <ul className="flex flex-col gap-2" data-testid="screens">
        {LINKS.map((l) => (
          <li key={l.id}>
            <a className="text-holo underline-offset-4 hover:underline" href={`#${l.id}`}>
              {l.title}
            </a>
          </li>
        ))}
      </ul>
      <h2 className="mt-2 font-display text-xl font-semibold">WS3’s rules, settled</h2>
      <ul className="flex max-w-4xl list-disc flex-col gap-1.5 pl-5 text-sm leading-snug text-ink-2" data-testid="questions">
        {QUESTIONS.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
    </Page>
  );
}

function Replay({ onClick, children = 'play it again' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className="w-fit rounded-control border border-holo px-2 py-1 font-mono text-xs text-holo" onClick={onClick} data-testid="replay">
      {children}
    </button>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl text-sm leading-snug text-ink-2">{children}</p>;
}

function SalePage({ variant, title }: { variant: Variant; title: string }) {
  const live = useSale();
  return (
    <Page title={title}>
      <Note>
        Lena has 12 Food and needs 5. She walks down to the store’s line and sells: slow, then faster. At 5 left it stops by
        itself and she steps up. Then{' '}
        {variant === 'A' ? 'hold the amber ▼ for a second to sell into a shortage.' : 'tap “Sell into a shortage” in the rail.'} Tap ▲ to stop
        while it sells.
      </Note>
      <Replay onClick={live.replay} />
      <span className="label-caps">Lena’s phone, sideways (844 × 390)</span>
      <div className="max-w-full overflow-x-auto">
        <PhoneSale variant={variant} live={live} />
      </div>
    </Page>
  );
}

function Tv({ children }: { children: ReactNode }) {
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

function TvSalePage() {
  const live = useSale();
  return (
    <Page title="TV · Lena sells, stops at her need, then sells short">
      <div className="flex gap-2">
        <Replay onClick={live.replay} />
        <button type="button" className="rounded-control border border-warn px-2 py-1 font-mono text-xs text-warn" onClick={live.sellShort} data-testid="tv-sell-short">
          Lena sells short (once stopped)
        </button>
      </div>
      <Tv>
        <TvSale live={live} />
      </Tv>
    </Page>
  );
}

function SwitchPage() {
  const sw = useSwitch();
  return (
    <Page title="3 · C: Buy | Sell during the walk">
      <Note>Tap Sell or Buy in the rail. Lena glides into her new side’s band, past Kai’s ask and Brix’s bid, and nothing trades.</Note>
      <span className="label-caps">Lena’s phone, sideways (844 × 390)</span>
      <div className="max-w-full overflow-x-auto">
        <PhoneSwitch sw={sw} />
      </div>
    </Page>
  );
}

function SoldOutPage() {
  const so = useSoldOut();
  return (
    <Page title="4 · E: the store sold out, bids past its old price">
      <Note>
        Energy: the store sold out at 34. Lena (short 3) and Kai bid past it, and the store’s line rides on the top bid. Brix
        walks down out of the sellers’ band to meet Lena at 43.
      </Note>
      <Replay onClick={so.replay} />
      <span className="label-caps">Lena’s phone, sideways (844 × 390)</span>
      <div className="max-w-full overflow-x-auto">
        <PhoneSoldOut so={so} />
      </div>
    </Page>
  );
}

function TvSoldOutPage() {
  const so = useSoldOut();
  return (
    <Page title="TV · the store sold out">
      <Replay onClick={so.replay} />
      <Tv>
        <TvSoldOut so={so} />
      </Tv>
    </Page>
  );
}

export default function App() {
  const hash = useHash();
  const link = LINKS.find((l) => l.id === hash);
  if (!link) return <Index />;
  switch (hash) {
    case 'rest':
      return (
        <Page title={link.title}>
          <Note>The start of the walk: Lena sells, waiting in the top band; Ossa and Kai wait in the bottom band; Brix has walked up into the trading zone.</Note>
          <div className="max-w-full overflow-x-auto">
            <PhoneRest />
          </div>
        </Page>
      );
    case 'sale-a':
      return <SalePage key="a" variant="A" title={link.title} />;
    case 'sale-b':
      return <SalePage key="b" variant="B" title={link.title} />;
    case 'tv-sale':
      return <TvSalePage />;
    case 'switch':
      return <SwitchPage />;
    case 'soldout':
      return <SoldOutPage />;
    default:
      return <TvSoldOutPage />;
  }
}
