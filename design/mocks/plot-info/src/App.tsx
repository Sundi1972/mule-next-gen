import { useEffect, useState, type ReactNode } from 'react';
import { DevelopAnalyse, DevelopPlots, GemMap, PlanningPlots, PlanningScan, StoreBox, useAnalyse, useScan, type Variant } from './Screens';

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

/** What you will see at the table, one line each: approach B, which Heiko picked on 5 Nov. */
const DECISIONS: ReactNode[] = [
  <>
    <strong>Scan, and see at once (G-1).</strong> In planning, the Geo drone tool: tap up to 2 free plots, then{' '}
    <em>Scan · 2 of 2 plots · 60 cr</em>. The plots pulse for a second, then the report opens: every good, 0 to 3 dots,
    and the best of it. Two ways to show the report, for Heiko to pick: <strong>A</strong> in the rail,{' '}
    <strong>B</strong> beside each plot on the map.
  </>,
  <>
    <strong>My plots, in planning (G-2).</strong> A new tool beside Look. Every plot you own is one row: where, its land,
    its MULE and every good's dots. A plot you haven't analysed says how to find out. Tap a row and the map shows it.
  </>,
  <>
    <strong>My plots, in development (G-2).</strong> A <em>Plots</em> chip on the walking screen's status bar opens the
    same list over the map; the clock keeps running. In the store, today's "Your plots" box shows the dots instead of
    words.
  </>,
  <>
    <strong>Analyse says what it found (G-3).</strong> After Analyse on any plot, not just your own, a card opens beside
    the plot for a few seconds: what it's best for, any Crystite or Rare earth, and every good's dots.
  </>,
  <>
    <strong>The gem (G-3).</strong> On your map only: a plot you've analysed shows its best good as 0–3 dots, and a gem on
    its corner if it holds Crystite or Rare earth, whatever else it's best for. The TV never shows it.
  </>,
  <>
    <strong>One scale, 0 to 3, for every good (rule 4, the screen first).</strong> Food, Water, Energy: −2/−1 → 0, 0 → 1, +1
    → 2, +2/+3 → 3. Smithore, Crystite, Rare earth: as rated, 3 and 4 both → 3. The production numbers don't change.
  </>,
];

const RECOMMENDATION = (
  <>
    <strong>Recommendation for the report: A</strong> (in the rail). It reads the same way as My plots, one block per
    plot. It never covers the map you're choosing on. It stays put while you compare the two plots. B ties each report to
    its plot, but on a sideways phone two callouts cover a sixth of the map, and both can cover other plots you want to
    compare.
  </>
);

const LINKS: { id: string; title: string }[] = [
  { id: 'scan-a', title: '1A · Planning: Scan, the report in the rail' },
  { id: 'scan-b', title: '1B · Planning: Scan, the report on the map' },
  { id: 'plots', title: '2 · Planning: My plots' },
  { id: 'dev-plots', title: '3 · Development: the Plots chip and list' },
  { id: 'store', title: '3b · Development, in the store: Your plots with dots' },
  { id: 'analyse', title: '4 · Development: Analyse says what it found' },
  { id: 'gem', title: '5 · The gem and the 0–3 pip on your map' },
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
    <Page title="Plot info: what you will see at the table">
      <p className="max-w-4xl text-ink-2">
        Approach B (Heiko, 5 Nov): Scan and see at once; My plots in planning and development; Analyse says what it found;
        the gem; one 0–3 scale. Lena's phone, month 5, held sideways (844 × 390).
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
    </Page>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl text-sm leading-snug text-ink-2">{children}</p>;
}
const Frame = ({ children }: { children: ReactNode }) => <div className="max-w-full overflow-x-auto">{children}</div>;

function ScanPage({ variant, title }: { variant: Variant; title: string }) {
  const scan = useScan();
  return (
    <Page title={title}>
      <Note>Two free plots are already picked (tap others on the map to change them). Tap Scan.</Note>
      <Frame>
        <PlanningScan variant={variant} scan={scan} />
      </Frame>
    </Page>
  );
}

function AnalysePage({ title }: { title: string }) {
  const an = useAnalyse();
  return (
    <Page title={title}>
      <Note>Lena stands on free plot 9·6, by the river. Tap ANALYSE. After the assay, the card stays about six seconds, then the map keeps its gem and pip.</Note>
      <button type="button" className="w-fit rounded-control border border-holo px-2 py-1 font-mono text-xs text-holo" onClick={an.again} data-testid="replay">
        play it again
      </button>
      <Frame>
        <DevelopAnalyse an={an} />
      </Frame>
    </Page>
  );
}

export default function App() {
  const hash = useHash();
  const link = LINKS.find((l) => l.id === hash);
  if (!link) return <Index />;
  switch (hash) {
    case 'scan-a':
      return <ScanPage key="a" variant="A" title={link.title} />;
    case 'scan-b':
      return <ScanPage key="b" variant="B" title={link.title} />;
    case 'plots':
      return (
        <Page title={link.title}>
          <Note>Tap a row: the map shows the plot. Plot 6·7 has no analysis yet and says how to get one.</Note>
          <Frame>
            <PlanningPlots />
          </Frame>
        </Page>
      );
    case 'dev-plots':
      return (
        <Page title={link.title}>
          <Note>The Plots chip on the status bar opens and closes the list. The colonist stands where it is; the clock runs.</Note>
          <Frame>
            <DevelopPlots />
          </Frame>
        </Page>
      );
    case 'store':
      return (
        <Page title={link.title}>
          <Note>In the store with an empty MULE: the side room's "Your plots" box, as built, shows dots instead of words.</Note>
          <Frame>
            <StoreBox />
          </Frame>
        </Page>
      );
    case 'analyse':
      return <AnalysePage title={link.title} />;
    default:
      return (
        <Page title={link.title}>
          <Frame>
            <GemMap />
          </Frame>
        </Page>
      );
  }
}
