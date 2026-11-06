import type { MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Results } from '../../../../apps/web/src/phone/Results';
import { ReadyCount } from '../../../../apps/web/src/phone/hub/ReadyBar';
import { monthEnd, STATE_IDS, STATES, type StateId } from './fixture';
import type { HealthVariant } from './gauges';
import { TvHeaderHealth } from './header';
import { LivePhone, TvGame } from './live';

// --- The screens --------------------------------------------------------------------------------------

/** How the header is laid out: beside the title at trunk's 760 px or widened to 950, or on its own row under it. */
type Layout = 'a760' | 'a950' | 'arow' | 'b760' | 'today' | 'todayrow';

const LAYOUT: Record<Layout, { variant: HealthVariant; row: boolean; beside: 'w-[760px]' | 'w-[950px]'; name: string }> = {
  a760: { variant: 'A', row: false, beside: 'w-[760px]', name: 'A · a fifth cell, beside the title at 760 px' },
  a950: { variant: 'A', row: false, beside: 'w-[950px]', name: 'A · a fifth cell, beside the title widened to 950 px' },
  arow: { variant: 'A', row: true, beside: 'w-[760px]', name: 'A · a fifth cell, on the gauges’ own row' },
  b760: { variant: 'B', row: false, beside: 'w-[760px]', name: 'B · paired with Happiness, beside the title at 760 px' },
  today: { variant: 'today', row: false, beside: 'w-[760px]', name: 'Today: four gauges beside the title (trunk)' },
  todayrow: { variant: 'today', row: true, beside: 'w-[760px]', name: 'Today: four gauges on their own row (trunk)' },
};

/** The beside header's title: the longest one an everyday phase puts beside the gauges. */
const BESIDE_TITLE = 'Land auction · 2 of 4';
/** Every title the gauges sit beside (TvHeader without a clock or ready chip), longest last. */
const BESIDE_TITLES = ['Production', 'Development', 'The law vote', 'Land auction · 2 of 4', 'The law vote · the result'];

const tvOf = (v: MuleView): MuleView => ({ ...v, me: null });

/**
 * The TV at its design size, 1280 × 720 (the app's Scaled shows it at 1920 × 1080: `scale` 1.5). The header is the
 * copy of TvHeader: beside the title as land auction, production and development lay it out, or on its own row as
 * planning does with its clock and ready chip. The rest of the screen is the phase's own and unchanged.
 */
function TvScreen({ s, layout, scale = 1.5, crop }: { s: StateId; layout: Layout; scale?: number; crop?: number }) {
  const v = tvOf(monthEnd(STATES[s]));
  const l = LAYOUT[layout];
  return (
    <TvGame view={v} scale={scale} {...(crop ? { crop } : {})}>
      <div className={cx('flex h-[720px] w-[1280px] flex-col bg-table text-ink', l.row ? 'gap-4 px-10 py-6' : 'gap-4 px-10 py-8')} data-testid="tv-screen">
        {l.row ? (
          <div className="flex flex-col gap-3">
            <TvHeaderHealth game={v} title="Planning" seconds={45} ready={<ReadyCount players={v.players} tv />} variant={l.variant} chatLines={0} />
          </div>
        ) : (
          <TvHeaderHealth game={v} title={BESIDE_TITLE} variant={l.variant} beside={l.beside} chatLines={0} />
        )}
        <div className="flex flex-1 items-center justify-center rounded-panel border border-dashed border-holo-faint font-mono text-sm text-ink-3" data-testid="tv-rest">
          the phase’s own screen, unchanged
        </div>
      </div>
    </TvGame>
  );
}

/** The phone with no TV at the month end: the real Results, with the ColonyPanel copy in its place (vite.config.ts). */
function Phone({ s, small, today = false }: { s: StateId; small: boolean; today?: boolean }) {
  return (
    <LivePhone start={monthEnd(STATES[s], { withHealth: !today })} boards={0} small={small}>
      <Results />
    </LivePhone>
  );
}

// --- Live measurements --------------------------------------------------------------------------------

function useTick(ms = 400) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** A title's width at TvHeader's h1 size, in design px: probes drawn off screen at scale 1. */
function TitleProbes() {
  return (
    <div className="pointer-events-none invisible absolute left-0 top-0 flex flex-col items-start" aria-hidden>
      {BESIDE_TITLES.map((t) => (
        <span key={t} className="whitespace-nowrap font-display text-5xl font-semibold leading-none" data-probe={t}>
          {t}
        </span>
      ))}
    </div>
  );
}

/**
 * What the header measures, read from the page as it renders (design px, the TV's 1280-wide canvas): the room the title
 * has beside the gauges, which beside titles fit in it on one line, the gauges' width, and any note cut short.
 */
function TvMeasure({ within }: { within: string }) {
  useTick();
  const root = document.querySelector(`[data-testid="${within}"]`);
  const inner = root?.querySelector<HTMLElement>('[data-testid="tv-frame"] > div');
  const header = root?.querySelector<HTMLElement>('[data-testid="tv-header"]');
  const right = root?.querySelector<HTMLElement>('[data-testid="tv-header-right"]');
  const title = root?.querySelector<HTMLElement>('[data-testid="tv-phase"]');
  const gauges = root?.querySelector<HTMLElement>('[data-testid="colony-gauges"]');
  if (!inner || !header || !right || !title || !gauges) return <span className="font-mono text-xs text-ink-3">measuring…</span>;
  const k = inner.getBoundingClientRect().width / 1280;
  const px = (n: number) => Math.round(n / k);
  const headerW = px(header.getBoundingClientRect().width);
  const room = headerW - px(right.getBoundingClientRect().width) - 24;
  const lines = Math.round(title.getBoundingClientRect().height / k / 48);
  const cut = [...gauges.querySelectorAll<HTMLElement>('.truncate')].filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => `${e.closest('[data-testid^="gauge-"]')?.getAttribute('data-testid')}: “${e.textContent}”`);
  // Text that runs past its cell's edge (a whitespace-nowrap value is never truncated: it spills into the next cell).
  const spill = [...gauges.children].flatMap((cell) => {
    const edge = cell.getBoundingClientRect().right;
    return [...cell.querySelectorAll<HTMLElement>('[data-num], .uppercase')].filter((e) => e.getBoundingClientRect().right > edge + 0.5).map((e) => `${cell.getAttribute('data-testid')}: “${e.textContent}” runs ${px(e.getBoundingClientRect().right - edge)} px past its cell`);
  });
  const probes = [...(root?.querySelectorAll<HTMLElement>('[data-probe]') ?? [])].map((p) => [p.dataset.probe!, Math.round(p.getBoundingClientRect().width)] as const);
  const own = !right.contains(gauges);
  return (
    <div className="flex max-w-3xl flex-col gap-0.5 font-mono text-xs" data-testid={`${within}-measure`} data-room={room} data-cut={cut.length} data-gauges={px(gauges.getBoundingClientRect().width)}>
      <span>
        gauges {px(gauges.getBoundingClientRect().width)} × {px(gauges.getBoundingClientRect().height)} px{own ? ' (own row)' : ''} · header {headerW} × {px(header.getBoundingClientRect().height)} px · title box{' '}
        <b>{room} px</b> beside the right group · this title on {lines} line{lines === 1 ? '' : 's'}
      </span>
      {!own && (
        <span>
          beside titles:{' '}
          {probes.map(([t, w]) => (
            <span key={t} className={w <= room ? 'text-ok' : 'text-alert'}>
              “{t}” {w}px {w <= room ? 'fits' : 'wraps'}
              {' · '}
            </span>
          ))}
        </span>
      )}
      <span className={cut.length ? 'text-alert' : 'text-ok'} data-testid={`${within}-cut`}>
        {cut.length ? `cut short: ${cut.join(' · ')}` : 'no gauge text cut short'}
      </span>
      <span className={spill.length ? 'text-alert' : 'text-ok'} data-testid={`${within}-spill`}>
        {spill.length ? `spills: ${spill.join(' · ')}` : 'no gauge text spills out of its cell'}
      </span>
    </div>
  );
}

/** Whether the phone's stage fits without scrolling, and where the Health block ends. */
function PhoneMeasure({ within }: { within: string }) {
  useTick();
  const stage = document.querySelector<HTMLElement>(`[data-testid="${within}"] [data-testid="stage"]`);
  const block = document.querySelector<HTMLElement>(`[data-testid="${within}"] [data-testid="colony-health"]`) ?? document.querySelector<HTMLElement>(`[data-testid="${within}"] [data-testid="colony-panel"]`);
  if (!stage || !block) return <span className="font-mono text-xs text-ink-3">measuring…</span>;
  const over = stage.scrollHeight - stage.clientHeight;
  const below = Math.round(block.getBoundingClientRect().bottom - stage.getBoundingClientRect().bottom);
  const why = block.querySelector<HTMLElement>('[data-testid="health-why"]');
  const whyLines = why ? Math.round(why.getBoundingClientRect().height / 13.75) : 0;
  return (
    <span className={cx('font-mono text-xs', over > 0 ? 'text-alert' : 'text-ok')} data-testid={`${within}-measure`} data-over={over} data-why-lines={whyLines}>
      stage {stage.clientHeight} px tall, content {stage.scrollHeight} px: {over > 0 ? `scrolls ${over} px` : 'fits, no scroll'} · {block.dataset.testid === 'colony-health' ? 'Health block' : 'the colony panel'} ends {below > 0 ? `${below} px below the fold` : `${-below} px above the stage’s bottom`} · why line on {whyLines} line{whyLines === 1 ? '' : 's'}
    </span>
  );
}

// --- The pages ----------------------------------------------------------------------------------------

interface Page {
  id: string;
  group: string;
  title: string;
  note: string;
  render: () => ReactNode;
}

const NOTE: Record<StateId, string> = {
  well: 'Well: 97% (last 96), 3 in 100 sick; mood Content 64, ↑ 6.',
  sick: 'Sick spell: 78% (last 92), 22 in 100 sick, Medicine short this month; mood Restless 52, ↓ 5.',
  limit: 'At the limit: 60% (last 63), 4 in 10 sick, Medicine short 3 months; mood Unhappy 38, ↓ 5.',
};

function tvPage(layout: Layout, s: StateId): Page {
  const id = `tv-${layout}-${s}`;
  return {
    id,
    group: LAYOUT[layout].name,
    title: `${LAYOUT[layout].name} · ${STATES[s].name}`,
    note: `${NOTE[s]} The TV at 1920 × 1080 (its 1280 × 720 canvas at 1.5). ${LAYOUT[layout].row ? 'Planning’s header: the clock and the ready chip push the gauges to a row of their own.' : `The title is “${BESIDE_TITLE}”, the longest everyday title beside the gauges.`}`,
    render: () => (
      <div className="relative flex flex-col gap-2" data-testid={`${id}-shot`}>
        <TitleProbes />
        <TvMeasure within={`${id}-shot`} />
        <TvScreen s={s} layout={layout} />
      </div>
    ),
  };
}

function phonePage(small: boolean, s: StateId, today = false): Page {
  const id = `phone-${small ? 667 : 844}-${today ? 'today' : s}`;
  const size = small ? '667 × 375' : '844 × 390';
  return {
    id,
    group: today ? 'Today, for comparison: the phone with no TV as trunk draws it' : `The phone with no TV at the month end, ${size}`,
    title: today ? `Today: the phone with no TV, ${size}, no health` : `Phone with no TV, ${size} · ${STATES[s].name}`,
    note: today ? 'The same month end with no health in the view: the panel as trunk draws it, for the fit comparison.' : `${NOTE[s]} The real Results screen; its ColonyPanel is this mock’s copy with the Health block after Hunger.`,
    render: () => (
      <div className="flex flex-col gap-2" data-testid={`${id}-shot`}>
        <PhoneMeasure within={`${id}-shot`} />
        <Phone s={s} small={small} today={today} />
      </div>
    ),
  };
}

const PAGES: Page[] = [
  ...(['a760', 'a950', 'arow', 'b760'] as const).flatMap((l) => STATE_IDS.map((s) => tvPage(l, s))),
  ...[false, true].flatMap((small) => STATE_IDS.map((s) => phonePage(small, s))),
  tvPage('today', 'sick'),
  tvPage('todayrow', 'sick'),
  phonePage(false, 'sick', true),
  phonePage(true, 'sick', true),
];

const DECISIONS: [string, ReactNode][] = [
  ['where', 'Where Health sits: A, a fifth gauge after Happiness, or B, Happiness and Health as one two-row cell. WS8 to pick. Measured (design px, the 1280 canvas): A fits only on the gauges’ own row; beside the title at 760 the Wealth value spills 24 px into Environment and both moods’ notes are cut, and widened to 950 the title keeps 156 px, too little even for “Production”. B fits at 760 with nothing cut and the title keeps today’s 346 px, but its cell is 117 px tall against 74, so a header with a one-line title grows about 41 px.'],
  ['words', 'The gauge: label “Health”, value the well share (“97%”), its band word under the bar, and a note: the month’s move (“↓ 14 this month”), or “4 in 10 sick” at the limit.'],
  ['bands', 'PROPOSAL (WS5 to rule): display bands. 90 and up “Well” (ok), 61 to 89 “Sick spell” (warn), 60 “At the limit” (alert).'],
  ['floor', 'The bar fills 0 to 100 by the well share, with a 1 px tick at 60: the floor, which health never goes below (at most 4 in 10 are ever sick).'],
  ['b-note', 'B’s cell has one note: the larger of the two moves this month, named (“health ↓ 14 this month”), or none; at the limit the row’s band word carries it.'],
  ['phone', 'The phone shows Health only with no TV: a block after Hunger in the colony panel, the value and band word, then the cause and what it does. Beside a TV the phone has no health; the TV header carries it.'],
  ['fit', 'Measured on the phone with no TV: the Health block sits below the fold. At 844 × 390 the stage scrolls 18 to 33 px (today it fits); at 667 × 375 it scrolls 62 to 75 px (today 15 px), so Health is out of sight until the player scrolls.'],
  ['unchanged', 'No TV header change in phases without colony gauges: the goods auction and game over keep the air gauge alone, and with politics off there is no colony and no health.'],
  ['seam', 'SEAM: health is not in ColonyGaugesView yet (WS5/WS7). The fixture extends the view locally with { well, lastWell, sick } and a shortMonths the phone’s cause line needs.'],
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

/** The sick-spell header, A beside B at the same size, cut to the header's height. */
function SideBySide() {
  return (
    <section className="flex flex-col gap-2" data-testid="side-by-side">
      <h2 className="label-caps">A beside B · sick spell · the header at 760 px (top of the TV, half size)</h2>
      <div className="flex flex-wrap gap-4">
        {(
          [
            ['A', 'a760', 'A · a fifth cell'],
            ['B', 'b760', 'B · paired with Happiness'],
          ] as const
        ).map(([k, layout, label]) => (
          <div key={k} className="relative flex flex-col gap-2 rounded-panel border border-holo-line p-3" data-testid={`variant-${k}`}>
            <a href={`#/tv-${layout}-sick`} className="text-sm font-semibold text-holo underline" data-testid={`variant-link-${k}`}>
              {label}
            </a>
            <TvScreen s="sick" layout={layout} scale={0.6} crop={170} />
            <TitleProbes />
            <TvMeasure within={`variant-${k}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const hash = useHash();
  const page = PAGES.find((s) => s.id === hash);
  if (page) {
    return (
      <div className="flex min-h-full flex-col items-start gap-3 bg-void p-6 text-ink">
        <a href="#/" className="text-sm text-holo underline" data-testid="back">
          ← All colony health screens
        </a>
        <div className="flex flex-col">
          <span className="label-caps">{page.group}</span>
          <h1 className="font-display text-2xl font-semibold">{page.title}</h1>
          <p className="max-w-4xl text-sm text-ink-2">{page.note}</p>
        </div>
        <div key={page.id}>{page.render()}</div>
      </div>
    );
  }
  const groups = [...new Set(PAGES.map((s) => s.group))];
  return (
    <div className="flex min-h-full flex-col gap-6 bg-void p-8 text-ink" data-testid="index">
      <header className="flex flex-col gap-1">
        <span className="label-caps">WS8 · WS5’s rule, approved by Heiko 6 Nov</span>
        <h1 className="font-display text-4xl font-semibold">Colony health, beside the colony’s mood</h1>
        <p className="font-semibold text-warn" data-testid="status">
          For review: WS8 leads the design; the display bands are WS5’s to rule.
        </p>
        <p className="max-w-4xl text-base text-ink-2">Colony health is the share of colonists who are well. It never goes below 60, because at most 4 in 10 are ever sick; a colony that is fed and has its Medicine settles at about 97. Sickness raises the colonists’ Medicine need, takes from the mood’s aim and slows growth.</p>
      </header>
      <section className="flex max-w-5xl flex-col gap-2 rounded-panel border border-holo-line bg-panel p-5" data-testid="decisions">
        <h2 className="label-caps">Design decisions</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {DECISIONS.map(([k, d]) => (
            <li key={k} data-testid={`decision-${k}`}>
              {d}
            </li>
          ))}
        </ul>
      </section>
      <SideBySide />
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-2">
          <h2 className="label-caps">{g}</h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {PAGES.filter((s) => s.group === g).map((s) => (
              <li key={s.id}>
                <a href={`#/${s.id}`} className="font-semibold text-holo underline" data-testid={`link-${s.id}`}>
                  {s.id.endsWith('today') ? (s.id.includes('667') ? '667 × 375' : '844 × 390') : s.id.endsWith('well') ? 'Well' : s.id.endsWith('sick') ? 'Sick spell' : 'At the limit'}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
