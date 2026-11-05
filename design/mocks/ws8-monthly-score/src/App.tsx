import type { MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { GameOver } from '../../../../apps/web/src/phone/GameOver';
import { Results } from '../../../../apps/web/src/phone/Results';
import { TvGameOver, TvMonthEnd } from '../../../../apps/web/src/table/TableApp';
import { COLLAPSE, gameOver, monthEnd, MONTH_1, MONTH_7, SIX_MONTH_2, type Month } from './fixture';
import { LivePhone, TICKER_FULL, TvGame } from './live';
import { PhoneMonthEndScore, TvMonthEndScore, type TvVariant } from './screens';

// --- The pages ----------------------------------------------------------------------------------------

const tvOf = (v: MuleView): MuleView => ({ ...v, me: null });

/** A is the built TvMonthEnd (trunk + #416), mounted as is; B and C are this mock's copy. `ticker`: three chat lines up. */
function Tv({ m, variant, politics = true, scale, ticker = false }: { m: Month; variant: TvVariant; politics?: boolean; scale?: number; ticker?: boolean }) {
  const v = tvOf(monthEnd(m, { politics }));
  return (
    <TvGame view={v} {...(scale ? { scale } : {})} {...(ticker ? { chat: TICKER_FULL } : {})}>
      {variant === 'A' ? <TvMonthEnd game={v} /> : <TvMonthEndScore game={v} variant={variant} />}
    </TvGame>
  );
}

/** FitHeight's scale as the screen inside `id` reports it (data-fit), read live, so the page states what it shows. */
function FitReadout({ id }: { id: string }) {
  const [fit, setFit] = useState('…');
  useEffect(() => {
    const t = setInterval(() => setFit(document.querySelector(`[data-testid="${id}"] [data-fit]`)?.getAttribute('data-fit') ?? '…'), 300);
    return () => clearInterval(t);
  }, [id]);
  const n = Number(fit);
  return (
    <span className={cx('font-mono text-sm font-bold', Number.isNaN(n) ? 'text-ink-3' : n < 0.8 ? 'text-alert' : 'text-ok')} data-testid={`${id}-fit`}>
      scale {fit}
    </span>
  );
}

/** The six-seat month end: C (the band under the build site) beside A (the band under the league), ticker full and empty. */
function SixSeats() {
  const cells = [
    ['C', true, 'C · ticker full'],
    ['A', true, 'A · ticker full'],
    ['C', false, 'C · ticker empty'],
    ['A', false, 'A · ticker empty'],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-4" data-testid="six-seats">
      {cells.map(([k, ticker, label]) => {
        const id = `six-${k}-${ticker ? 'full' : 'empty'}`;
        return (
          <div key={id} className={cx('flex flex-col gap-1 rounded-panel border p-2', k === 'C' ? 'border-holo' : 'border-holo-line')} data-testid={id}>
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{label}</span>
              <FitReadout id={id} />
            </span>
            <Tv m={SIX_MONTH_2} variant={k} ticker={ticker} scale={0.5} />
          </div>
        );
      })}
    </div>
  );
}

function Phone({ m, boards = 1, small = false, politics = true }: { m: Month; boards?: number; small?: boolean; politics?: boolean }) {
  return (
    <LivePhone start={monthEnd(m, { politics })} boards={boards} small={small}>
      <PhoneMonthEndScore />
    </LivePhone>
  );
}

interface Page {
  id: string;
  group: string;
  title: string;
  note: string;
  render: () => ReactNode;
}

const TV = 'The TV at the month end';
const PHONE = 'The phone at the month end';
const OVER = 'Game over: unchanged';
const OFF = 'Politics off: today’s screens (HC-22)';

const SIX = 'Open: the six-seat fallback (B)';

const PAGES: Page[] = [
  {
    id: 'tv-six-band-right',
    group: SIX,
    title: 'C-fallback · at 5+ seats the band sits under the build site in the right column',
    note: 'Used only if WS4’s 5+-seat month-end fix still leaves six seats under 0.8. Six seats, month 2. The league has the left column to itself; #416’s MonthScoreColumn card sits under the build site. Beside it, the same month end as built (A). Measured here (a two-project build site): C 0.490 with the ticker empty and 0.340 with it full; A 0.520 and 0.360, the same as WS4’s read of the real six-seat month 2. C scores lower than A: at six seats the right column (colony panel and build site) is already the taller one, so the band adds to the column that sets the scale. The live scale is read on each TV.',
    render: () => <SixSeats />,
  },
  { id: 'tv-a', group: TV, title: 'A · the band under the league (WS8’s pick), month 7', note: 'C34’s band frame in the left column’s spare room: the total, “↑ +2,069 since month 6”, the sum, and scoreWords’ line. No verdict, no plaques (the build site beside it has them).', render: () => <Tv m={MONTH_7} variant="A" /> },
  { id: 'tv-b', group: TV, title: 'B · the colony as a league row, month 7', note: 'One more row in the league’s own table, under a double rule: no rank, the colony glyph, “The colony”, its score in the Worth column and its change in the change column.', render: () => <Tv m={MONTH_7} variant="B" /> },
  { id: 'tv-a-month1', group: TV, title: 'A · month 1’s end', note: 'No last month (lastScore null): the total and the sum, no change line.', render: () => <Tv m={MONTH_1} variant="A" /> },
  { id: 'tv-b-month1', group: TV, title: 'B · month 1’s end', note: 'The league has no change column in month 1, so the row has none either.', render: () => <Tv m={MONTH_1} variant="B" /> },
  { id: 'tv-a-collapse', group: TV, title: 'A · in Collapse', note: 'The CollapseBanner shows and every Worth is cut; the score is not, and the band says so in one line.', render: () => <Tv m={COLLAPSE} variant="A" /> },
  { id: 'tv-b-collapse', group: TV, title: 'B · in Collapse', note: 'The row’s “Before the cut” cell reads “not cut”.', render: () => <Tv m={COLLAPSE} variant="B" /> },
  {
    id: 'tv-today',
    group: TV,
    title: 'Today, for comparison: the real TvMonthEnd',
    note: 'The app’s own screen, mounted unchanged, on the same month 7.',
    render: () => {
      const v = tvOf(monthEnd(MONTH_7, { withScore: false }));
      return (
        <TvGame view={v}>
          <TvMonthEnd game={v} />
        </TvGame>
      );
    },
  },
  { id: 'phone-tv', group: PHONE, title: 'Beside a TV (844 × 390), month 7', note: 'One line under the league, in the footnote’s place: “Colony score 36,538 ↑ +2,069 since month 6”. The sum is on the TV.', render: () => <Phone m={MONTH_7} /> },
  { id: 'phone-tv-small', group: PHONE, title: 'Beside a TV, small phone (667 × 375)', note: 'The same line; the footnote is no taller than today’s, so the league keeps its room.', render: () => <Phone m={MONTH_7} small /> },
  { id: 'phone-alone', group: PHONE, title: 'No TV (844 × 390), month 7', note: 'The line heads the colony panel, with the sum on it: “= 26,400 + 6,200 + 2,000 × 1.06”.', render: () => <Phone m={MONTH_7} boards={0} /> },
  { id: 'phone-alone-small', group: PHONE, title: 'No TV, small phone (667 × 375)', note: 'The sum gives way below 800 px of shell; the total and the change never do.', render: () => <Phone m={MONTH_7} boards={0} small /> },
  { id: 'phone-month1', group: PHONE, title: 'Month 1’s end, beside a TV', note: 'lastScore is null: the total alone, no change line.', render: () => <Phone m={MONTH_1} /> },
  { id: 'phone-collapse', group: PHONE, title: 'In Collapse, beside a TV', note: 'The banner, the cut league, and one line: the Collapse cuts each Worth, not the colony’s score.', render: () => <Phone m={COLLAPSE} /> },
  { id: 'phone-collapse-small', group: PHONE, title: 'In Collapse, small phone with no TV', note: 'The longest month end at the smallest size.', render: () => <Phone m={COLLAPSE} boards={0} small /> },
  {
    id: 'over-tv',
    group: OVER,
    title: 'The TV at game over: the real TvGameOver',
    note: 'C34’s approved band with the verdict, mounted unchanged. The month end’s band is its sibling, never a replacement.',
    render: () => {
      const v = tvOf(gameOver());
      return (
        <TvGame view={v}>
          <TvGameOver game={v} />
        </TvGame>
      );
    },
  },
  {
    id: 'over-phone',
    group: OVER,
    title: 'The phone at game over: the real GameOver',
    note: 'C34’s PhoneColonyScore with its verdict, mounted unchanged.',
    render: () => (
      <LivePhone start={gameOver()}>
        <GameOver />
      </LivePhone>
    ),
  },
  { id: 'off-tv', group: OFF, title: 'The TV, politics off', note: 'This mock’s TvMonthEnd with no colony in the view: the branch it draws is today’s, line for line.', render: () => <Tv m={MONTH_7} variant="A" politics={false} /> },
  {
    id: 'off-tv-real',
    group: OFF,
    title: 'The TV, politics off: the real TvMonthEnd',
    note: 'For comparison with the page above.',
    render: () => {
      const v = tvOf(monthEnd(MONTH_7, { politics: false }));
      return (
        <TvGame view={v}>
          <TvMonthEnd game={v} />
        </TvGame>
      );
    },
  },
  { id: 'off-phone', group: OFF, title: 'The phone, politics off', note: 'This mock’s MonthEnd with no colony: today’s footnote.', render: () => <Phone m={MONTH_7} politics={false} /> },
  {
    id: 'off-phone-real',
    group: OFF,
    title: 'The phone, politics off: the real Results',
    note: 'For comparison with the page above.',
    render: () => (
      <LivePhone start={monthEnd(MONTH_7, { politics: false })}>
        <Results />
      </LivePhone>
    ),
  },
];

const DECISIONS = [
  'The colony score shows at every month end, on the TV and every phone, next to the league; game over keeps C34’s screens unchanged.',
  'At a month end the score has no verdict: “A colony to be proud of” stays game over’s. The band says “counted again at game over”.',
  'The change since last month is score.total − lastScore in the league’s own ChangeTag (“↑ +2,069 since month 6”); month 1 has no change line. Contract: WS7’s ws7-score-monthly.',
  'TV, WS8’s pick A: C34’s band frame under the league, in the left column’s spare room; the build site beside it keeps the plaques.',
  'Phone beside a TV: one line under the league in the footnote’s place, total and change only (the sum is on the TV); the league keeps its room on 667 × 375.',
  'Phone with no TV: the line heads the colony panel and carries the sum where the shell is 800 px or wider; below that the sum gives way, the numbers never do.',
  'Collapse: the banner as today, every Worth cut, and one line that the colony’s score is not.',
  'Politics off: no colony in the view, today’s screens line for line (HC-22).',
  'FINDING: C34’s ScoreSum and ScoreHero print RULE-25’s credit terms raw (“26400”); the mock formats them, and the graft should, at game over too.',
];

function useHash() {
  const [hash, setHash] = useState(() => location.hash.replace(/^#\/?/, ''));
  useEffect(() => {
    const on = () => setHash(location.hash.replace(/^#\/?/, ''));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const page = PAGES.find((s) => s.id === hash);
  if (page) {
    return (
      <div className="flex min-h-full flex-col items-start gap-3 bg-void p-6 text-ink">
        <a href="#/" className="text-sm text-holo underline" data-testid="back">
          ← All monthly-score screens
        </a>
        <div className="flex flex-col">
          <span className="label-caps">{page.group}</span>
          <h1 className="font-display text-2xl font-semibold">{page.title}</h1>
          <p className="max-w-3xl text-sm text-ink-2">{page.note}</p>
        </div>
        <div key={page.id}>{page.render()}</div>
      </div>
    );
  }
  const groups = [...new Set(PAGES.map((s) => s.group))];
  return (
    <div className="flex min-h-full flex-col gap-6 bg-void p-8 text-ink" data-testid="index">
      <header className="flex flex-col gap-1">
        <span className="label-caps">G-5 · WS7 + WS8 · Heiko’s decision, 5 Nov</span>
        <h1 className="font-display text-4xl font-semibold">The colony score at every month end</h1>
        <p className="font-semibold text-warn" data-testid="status">
          For review: the PM approves (design authority); Heiko may veto.
        </p>
        <p className="max-w-3xl text-base text-ink-2">The real month-end screens (TvMonthEnd, the phone’s MonthEnd, LeagueTable, ColonyPanel, BuildSite, YourWorth) with a fixture view whose colony score is filled at the month end by the engine’s own colonyScoreOf.</p>
      </header>
      <section className="flex max-w-5xl flex-col gap-2 rounded-panel border border-holo-line bg-panel p-5" data-testid="decisions">
        <h2 className="label-caps">Design decisions</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {DECISIONS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2" data-testid="variants">
        <h2 className="label-caps">The TV month end · two variants · WS8’s pick marked</h2>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ['A', 'tv-a', 'A · the band under the league'],
              ['B', 'tv-b', 'B · the colony as a league row'],
            ] as const
          ).map(([k, id, label]) => (
            <div key={k} className={cx('flex flex-col gap-2 rounded-panel border p-3', k === 'A' ? 'border-2 border-holo bg-holo-soft' : 'border-holo-line')} data-testid={`variant-${k}`}>
              <a href={`#/${id}`} className={cx('flex items-center justify-between gap-2 text-sm font-semibold underline', k === 'A' ? 'text-holo' : 'text-ink')} data-testid={`variant-link-${k}`}>
                {label}
                {k === 'A' && <span className="rounded-chip bg-holo px-1.5 font-mono text-[10px] font-bold text-on-holo no-underline">WS8’S PICK</span>}
              </a>
              <Tv m={MONTH_7} variant={k} scale={0.5} />
            </div>
          ))}
        </div>
      </section>
      <section className="flex max-w-5xl flex-col gap-1 rounded-panel border border-warn/60 bg-panel p-5" data-testid="six-seat-fallback">
        <h2 className="label-caps">Open: the six-seat fallback (B)</h2>
        <p className="text-sm">
          The PM ruled A for the common table. If WS4’s fix still leaves six seats under 0.8:{' '}
          <a href="#/tv-six-band-right" className="font-semibold text-holo underline" data-testid="link-tv-six-band-right-inline">
            C-fallback · at 5+ seats the band sits under the build site in the right column
          </a>
          , shown beside A with the ticker full and empty.
        </p>
      </section>
      <section className="flex max-w-5xl flex-col gap-1 rounded-panel border border-holo-line bg-panel p-5" data-testid="c34-link">
        <h2 className="label-caps">Game over: C34’s approved pages</h2>
        <p className="text-sm">
          Branch <code className="font-mono">ws8-colony-mocks</code> at <code className="font-mono">b0f52001</code>, workspace <code className="font-mono">design/mocks/ws8-colony</code>: pages <code className="font-mono">#/tv-gameover-a</code>, <code className="font-mono">#/phone-gameover</code> and <code className="font-mono">#/phone-gameover-failed</code>. Run it as its README says, on a free port (5318 now serves the desks mock). The real screens they became are mounted here too:{' '}
          <a href="#/over-tv" className="font-semibold text-holo underline" data-testid="link-over-tv-inline">
            TV
          </a>
          ,{' '}
          <a href="#/over-phone" className="font-semibold text-holo underline" data-testid="link-over-phone-inline">
            phone
          </a>
          .
        </p>
      </section>
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-2">
          <h2 className="label-caps">{g}</h2>
          <ul className="flex flex-col gap-1">
            {PAGES.filter((s) => s.group === g).map((s) => (
              <li key={s.id}>
                <a href={`#/${s.id}`} className="font-semibold text-holo underline" data-testid={`link-${s.id}`}>
                  {s.title}
                </a>
                {s.note && <span className="text-sm text-ink-2"> · {s.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
