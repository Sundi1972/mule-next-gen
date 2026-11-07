import type { MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Results } from '../../../../apps/web/src/phone/Results';
import { ReadyCount } from '../../../../apps/web/src/phone/hub/ReadyBar';
import { monthEnd, STATE_IDS, STATES, type StateId } from './fixture';
import type { HealthVariant } from './gauges';
import { TvHeaderHealth } from './header';
import { LivePhone, TvGame } from './live';
import { TvMonthEndHealth, type MonthEndLayout } from './monthend';

// --- The screens --------------------------------------------------------------------------------------

/**
 * How the header is laid out. A (chosen, Heiko 7 Nov) always puts the gauges on a row of their own: `arow` in planning
 * (its clock and ready chip did so already), `aone` in a phase whose gauges sat beside the title until now.
 */
type Layout = 'arow' | 'aone' | 'aprod' | 'b760' | 'bprime' | 'today' | 'todayrow';

const LAYOUT: Record<Layout, { variant: HealthVariant; row: boolean; beside: 'w-[760px]' | 'w-[950px]'; name: string }> = {
  arow: { variant: 'A', row: true, beside: 'w-[760px]', name: 'A (chosen) · planning: Health a fifth cell on the gauges’ own row' },
  aone: { variant: 'A', row: false, beside: 'w-[760px]', name: 'A (chosen) · production, land auction and development: the gauges move to a row of their own (production: own row, rail trimmed)' },
  aprod: { variant: 'A', row: false, beside: 'w-[760px]', name: 'Option 1, tried 7 Nov · production in one row, the title a size down, five gauges beside it: cuts text, not built' },
  bprime: { variant: 'Bp', row: false, beside: 'w-[760px]', name: 'B′ · health on the Happiness line (not chosen, for the record)' },
  b760: { variant: 'B', row: false, beside: 'w-[760px]', name: 'B · paired with Happiness (not chosen, for the record)' },
  today: { variant: 'today', row: false, beside: 'w-[760px]', name: 'Today: four gauges beside the title (trunk)' },
  todayrow: { variant: 'today', row: true, beside: 'w-[760px]', name: 'Today: four gauges on their own row (trunk)' },
};

/** The beside header's title: the longest one an everyday phase puts beside the gauges (two lines at 760). */
const BESIDE_TITLE = 'Land auction · 2 of 4';
/** A one-line title beside the gauges: there the gauges' height sets the header's. */
const ONE_LINE_TITLE = 'Production';
/** Every title the gauges sit beside (TvHeader without a clock or ready chip), longest last. */
const BESIDE_TITLES = ['Production', 'Development', 'The law vote', 'Land auction · 2 of 4', 'The law vote · the result'];

const tvOf = (v: MuleView): MuleView => ({ ...v, me: null });

/**
 * The TV at its design size, 1280 × 720 (the app's Scaled shows it at 1920 × 1080: `scale` 1.5). The header is the
 * copy of TvHeader: beside the title as land auction, production and development lay it out, or on its own row as
 * planning does with its clock and ready chip. The rest of the screen is the phase's own and unchanged.
 */
/** Production's event pips beside the title, drawn as their 34 px badges (packages/ui EventPips needs a running show). */
function PipsStandIn({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="flex items-center gap-2" data-testid="pips">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="size-[34px] rounded-full border-2 border-warn bg-panel" />
      ))}
    </span>
  );
}

/** A late game's wealth: six figures, the widest Wealth value the header has to hold. */
const BIG_WEALTH = 126_400;

function TvScreen({ s, layout, scale = 1.5, crop, title = BESIDE_TITLE, pips = 0, big = false }: { s: StateId; layout: Layout; scale?: number; crop?: number; title?: string; pips?: number; big?: boolean }) {
  const base = tvOf(monthEnd(STATES[s]));
  const v = big && base.colony ? { ...base, colony: { ...base.colony, gauges: { ...base.colony.gauges, wealth: BIG_WEALTH } } } : base;
  const l = LAYOUT[layout];
  return (
    <TvGame view={v} scale={scale} {...(crop ? { crop } : {})}>
      <div className={cx('flex h-[720px] w-[1280px] flex-col bg-table text-ink', l.row ? 'gap-4 px-10 py-6' : 'gap-4 px-10 py-8')} data-testid="tv-screen">
        {l.row ? (
          <div className="flex flex-col gap-3">
            <TvHeaderHealth game={v} title="Planning" seconds={45} ready={<ReadyCount players={v.players} tv />} variant={l.variant} chatLines={0} />
          </div>
        ) : (
          <TvHeaderHealth game={v} title={layout === 'aprod' ? 'Production' : title} variant={l.variant} beside={l.beside} chatLines={0} compact={layout === 'aprod'} extra={<PipsStandIn n={pips} />} />
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
    // The content edge: inside the cell's right padding, where the text should stop.
    const edge = cell.getBoundingClientRect().right - parseFloat(getComputedStyle(cell).paddingRight) * k;
    return [...cell.querySelectorAll<HTMLElement>('[data-num], .uppercase')].filter((e) => e.getBoundingClientRect().right > edge + 0.5).map((e) => `${cell.getAttribute('data-testid')}: “${e.textContent}” runs ${px(e.getBoundingClientRect().right - edge)} px past its cell’s padding edge`);
  });
  const probes = [...(root?.querySelectorAll<HTMLElement>('[data-probe]') ?? [])].map((p) => [p.dataset.probe!, Math.round(p.getBoundingClientRect().width)] as const);
  const own = !right.contains(gauges);
  const mood = gauges.querySelector<HTMLElement>('[data-testid="gauge-happiness"]');
  const moodH = mood ? px(mood.getBoundingClientRect().height) : null;
  return (
    <div className="flex max-w-3xl flex-col gap-0.5 font-mono text-xs" data-testid={`${within}-measure`} data-mood-h={moodH ?? ''} data-header-h={px(header.getBoundingClientRect().height)} data-room={room} data-cut={cut.length} data-gauges={px(gauges.getBoundingClientRect().width)}>
      <span>
        gauges {px(gauges.getBoundingClientRect().width)} × {px(gauges.getBoundingClientRect().height)} px{own ? ' (own row)' : ''} · Happiness cell {moodH} px tall · header {headerW} × {px(header.getBoundingClientRect().height)} px · title box{' '}
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

/** Whether the phone's stage fits without scrolling, and where health ends. */
function PhoneMeasure({ within }: { within: string }) {
  useTick();
  const stage = document.querySelector<HTMLElement>(`[data-testid="${within}"] [data-testid="stage"]`);
  const block = document.querySelector<HTMLElement>(`[data-testid="${within}"] [data-testid="colony-health"]`) ?? document.querySelector<HTMLElement>(`[data-testid="${within}"] [data-testid="colony-panel"]`);
  if (!stage || !block) return <span className="font-mono text-xs text-ink-3">measuring…</span>;
  const over = stage.scrollHeight - stage.clientHeight;
  const below = Math.round(block.getBoundingClientRect().bottom - stage.getBoundingClientRect().bottom);
  const line = document.querySelector<HTMLElement>(`[data-testid="${within}"] [data-testid="colonists"]`);
  const lines = line ? Math.round(line.getBoundingClientRect().height / 13.75) : 0;
  return (
    <span className={cx('font-mono text-xs', over > 0 ? 'text-alert' : 'text-ok')} data-testid={`${within}-measure`} data-over={over} data-colonists-lines={lines}>
      stage {stage.clientHeight} px tall, content {stage.scrollHeight} px: {over > 0 ? `scrolls ${over} px` : 'fits, no scroll'} · {block.dataset.testid === 'colony-health' ? 'health' : 'the colony panel'} ends {below > 0 ? `${below} px below the fold` : `${-below} px above the stage’s bottom`} · colonists line on {lines} line{lines === 1 ? '' : 's'}
    </span>
  );
}

/**
 * The six-seat month end's fit, read as it renders (design px): the fit box's height against each column's content,
 * and the scale FitHeight would take, about room ÷ the taller column (a first estimate: FitHeight re-measures at each
 * scale's width, so the built screen's own number is TV-FIT's e2e to give). Health's cell, and any gauge text cut.
 */
function MonthEndMeasure({ within }: { within: string }) {
  useTick();
  const root = document.querySelector(`[data-testid="${within}"]`);
  const inner = root?.querySelector<HTMLElement>('[data-testid="tv-frame"] > div');
  const box = root?.querySelector<HTMLElement>('[data-testid="fit-box"]');
  const content = root?.querySelector<HTMLElement>('[data-testid="fit-content"]');
  const gauges = root?.querySelector<HTMLElement>('[data-testid="colony-gauges"]');
  if (!inner || !box || !content || !gauges) return <span className="font-mono text-xs text-ink-3">measuring…</span>;
  const k = inner.getBoundingClientRect().width / 1280;
  const px = (n: number) => Math.round(n / k);
  // A column's content: its first child's top to its last child's foot (the grid stretches the column itself).
  const extent = (col: Element) => {
    const kids = [...col.children] as HTMLElement[];
    if (kids.length === 0) return 0;
    return px(kids.at(-1)!.getBoundingClientRect().bottom - kids[0]!.getBoundingClientRect().top);
  };
  const [left, right] = [...content.children].map(extent) as [number, number];
  const room = px(box.getBoundingClientRect().height);
  const need = Math.max(left, right);
  const scale = Math.min(1, room / need);
  const cell = gauges.querySelector<HTMLElement>('[data-testid="health-cell"]');
  const cut = [...gauges.querySelectorAll<HTMLElement>('.truncate')].filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => `“${e.textContent}”`);
  return (
    <div className="flex max-w-3xl flex-col gap-0.5 font-mono text-xs" data-testid={`${within}-measure`} data-room={room} data-left={left} data-right={right} data-scale={scale.toFixed(3)}>
      <span>
        fit box {room} px tall · league column {left} px · colony column {right} px · gauges {px(gauges.getBoundingClientRect().height)} px tall{cell ? ` (Health’s row ${px(cell.getBoundingClientRect().height)} px)` : ''}
      </span>
      <span className={scale >= 0.7 ? 'text-ok' : 'text-alert'}>
        FitHeight would scale to about <b>{scale.toFixed(3)}</b> (TV-FIT’s floor 0.7){scale === 1 ? ': it fits at full size' : ''}
      </span>
      <span className={cut.length ? 'text-alert' : 'text-ok'}>{cut.length ? `cut short: ${cut.join(' · ')}` : 'no gauge text cut short'}</span>
    </div>
  );
}

const MONTH_END_GROUP: Record<MonthEndLayout, string> = {
  grid: 'A (chosen) · the TV month end at six seats: 3 + 2, Health beside Happiness, as tall as today',
  third: 'A as the card showed it · the TV month end: Health alone on a third row (under TV-FIT’s 0.7, not built)',
  across: 'A, tried · the TV month end: five gauges on one row across the screen (under 0.7, not built)',
};

function monthEndPage(s: StateId, today = false, layout: MonthEndLayout = 'grid'): Page {
  const id = `tv-monthend-${layout === 'grid' ? '' : `${layout}-`}${today ? 'today' : s}`;
  return {
    id,
    group: today ? MONTH_END_GROUP.grid : MONTH_END_GROUP[layout],
    title: today ? 'Today: the TV month end at six seats, four gauges (trunk)' : `A · the TV month end at six seats · ${STATES[s].name}`,
    note: `${today ? 'The same month end with no health: trunk’s four gauges, two by two, for the fit comparison.' : `${NOTE[s]} ${layout === 'grid' ? 'The colony’s gauges sit at the top of the right column, three over two: Wealth, Environment and Prestige, then Happiness and Health, Health across two columns. Two rows, as tall as today’s two by two.' : layout === 'third' ? 'Two by two, as today, with Health alone on a third row across both columns: the colony column grows a row.' : 'The five gauges on one row across the screen, over the league and the colony column.'}`} Six seats, the most a table has. The real league table, colony score band and build site; the colony panel is this mock’s copy (no health on the TV: the gauges carry it).`,
    render: () => (
      <div className="relative flex flex-col gap-2" data-testid={`${id}-shot`}>
        <MonthEndMeasure within={`${id}-shot`} />
        <TvGame view={tvOf(monthEnd(STATES[s], { six: true, withHealth: !today }))} scale={1.5}>
          <TvMonthEndHealth game={tvOf(monthEnd(STATES[s], { six: true, withHealth: !today }))} today={today} layout={layout} />
        </TvGame>
      </div>
    ),
  };
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
  sick: 'Sick spell: 78% (last 92), 22 in 100 sick; mood Restless 52, ↓ 5.',
  limit: 'At the limit: 60% (last 63), 4 in 10 sick; mood Unhappy 38, ↓ 5.',
};

function tvPage(layout: Layout, s: StateId, oneLine = false): Page {
  const id = `tv-${layout}-${oneLine ? 'oneline-' : ''}${s}`;
  return {
    id,
    group: oneLine ? 'Header height beside a one-line title (“Production”)' : LAYOUT[layout].name,
    title: `${LAYOUT[layout].name}${oneLine ? ', one-line title' : ''} · ${STATES[s].name}`,
    note: `${NOTE[s]} The TV at 1920 × 1080 (its 1280 × 720 canvas at 1.5). ${LAYOUT[layout].row ? 'Planning’s header: the clock and the ready chip push the gauges to a row of their own.' : oneLine ? `The title is “${ONE_LINE_TITLE}”, one line: the gauges’ height sets the header’s.` : `The title is “${BESIDE_TITLE}”, the longest everyday title beside the gauges (two lines).`}`,
    render: () => (
      <div className="relative flex flex-col gap-2" data-testid={`${id}-shot`}>
        <TitleProbes />
        <TvMeasure within={`${id}-shot`} />
        <TvScreen s={s} layout={layout} {...(oneLine ? { title: ONE_LINE_TITLE } : {})} />
      </div>
    ),
  };
}

function productionPage(s: StateId, pips: number, big = false): Page {
  const id = `tv-aprod-${pips}pips-${big ? 'bigwealth-' : ''}${s}`;
  return {
    id,
    group: LAYOUT.aprod.name,
    title: `A · production’s header, one row · ${pips} event pip${pips === 1 ? '' : 's'}${big ? ', wealth 126,400 cr' : ''} · ${STATES[s].name}`,
    note: `${NOTE[s]} Production keeps its header to one row, as tall as today’s: the title “Production” a size down (text-4xl), then the event pips, the theme toggle and the five gauges in all the width left. The pips are drawn as their 34 px badges.${big ? ' Wealth is set to 126,400 cr, a late game’s six figures.' : ''}`,
    render: () => (
      <div className="relative flex flex-col gap-2" data-testid={`${id}-shot`}>
        <TvMeasure within={`${id}-shot`} />
        <TvScreen s={s} layout="aprod" pips={pips} big={big} />
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
    note: today ? 'The same month end with no health in the view: the panel as trunk draws it, for the fit comparison.' : `${NOTE[s]} The real Results screen; its ColonyPanel is this mock’s copy, with health on the colonists line under Hunger.`,
    render: () => (
      <div className="flex flex-col gap-2" data-testid={`${id}-shot`}>
        <PhoneMeasure within={`${id}-shot`} />
        <Phone s={s} small={small} today={today} />
      </div>
    ),
  };
}

const PAGES: Page[] = [
  ...(['arow', 'aone'] as const).flatMap((l) => STATE_IDS.map((s) => tvPage(l, s))),
  ...STATE_IDS.map((s) => productionPage(s, 1)),
  productionPage('sick', 0),
  productionPage('sick', 2),
  productionPage('sick', 3),
  productionPage('limit', 2, true),
  ...STATE_IDS.map((s) => monthEndPage(s)),
  monthEndPage('sick', true),
  monthEndPage('sick', false, 'third'),
  monthEndPage('sick', false, 'across'),
  tvPage('aone', 'sick', true),
  tvPage('today', 'sick', true),
  ...[false, true].flatMap((small) => STATE_IDS.map((s) => phonePage(small, s))),
  tvPage('today', 'sick'),
  tvPage('todayrow', 'sick'),
  phonePage(false, 'sick', true),
  phonePage(true, 'sick', true),
  ...(['bprime', 'b760'] as const).map((l) => tvPage(l, 'sick')),
];

const DECISIONS: [string, ReactNode][] = [
  ['chosen', 'Chosen by Heiko, 7 Nov: A, Health in its own cell. Health is a fifth gauge after Happiness: the well share (“78%”), a bar 0 to 100 with ticks at 60 and 80, its band word under the bar and the month’s move (or “4 in 10 sick” at the limit).'],
  ['header', 'The TV header: wherever it shows the colony’s gauges, they take a row of their own under the title, five cells across 1,200 px, nothing cut. Planning already did so (its clock and ready chip); land auction, production and development now do too, since five cells beside the title cut text (measured 6 Nov: at 760 px the Wealth figure spills 24 px and both notes are cut). The cells are today’s 74 px.'],
  ['monthend', 'The TV month end: the gauges stay at the top of the colony column, now three over two: Wealth, Environment, Prestige, then Happiness and Health, Health across two columns. Two rows, as tall as today’s two by two, so the colony column does not grow. Each cell is about 191 px wide, wider than today’s header cells (184). Health alone on a third row, as the card showed it, grows the column by 82 px (pages below, for the record).'],
  ['fit', 'TV-FIT at six seats, measured 7 Nov in the real app (e2e/colony.ts, seed 1317659056, trunk c7f9ede4 with A patched in; trunk alone in brackets): month end 0.764 (0.764), planning ballot 0.831 (0.903), land grant 0.857 (0.994), development 0.853 (1.000), auction 0.849 (0.842), production 0.613 (0.742). Production falls under the 0.7 floor with its gauges moved off the title’s line, so production is “own row, rail trimmed” (PM ruling 7 Nov, option 3): its gauges take their own row like every other screen, and WS4 frees about 80 canvas px in production’s rail (only the current act shows its description line). WS4 measures ≥ 0.7 at build time. The month end with Health on a third row: about 0.675 from the same run’s parts (right column 623 + 82 in a 476 px box).'],
  ['option1', 'Option 1 for production, tried 7 Nov (PM): one row, the title a size down (text-4xl), the pips, the toggle and the five gauges beside it. The header stays 74 px, but the gauges get only 928 px with no event pip, 878 with one, 836 with two, 794 with three, and five cells need 1,000 px in a Sick spell (950 with the notes cut to “↓ 14”; 900 when Well, 750 with short notes). So text is cut: at 928 the Wealth figure spills 3 px and the Health note is cut; with pips the Wealth figure spills 13 to 30 px and both mood notes are cut. Fails “nothing cut”; not built.'],
  ['bands', 'WS5 approved 6 Nov: 90 and up “Well” (ok), 61 to 89 “Sick spell” (warn), 60 “At the limit” (alert).'],
  ['ticks', 'The Health bar fills 0 to 100 by the well share, with 1 px ticks at 60, the floor health never goes below, and at 80, below which crews start falling sick (decision 25).'],
  ['phone', 'The phone shows health only with no TV, on the colonists line under Hunger: “The store fed the colony’s 412 colonists · health 78% · Sick spell”, the figure toned by its band, the band word only when it is not Well. No added scroll (667 × 375 scrolls 15 px, as today; 844 × 390 fits, as today). Beside a TV the phones do not change.'],
  ['unchanged', 'No change in phases without colony gauges: the goods auction and game over keep the air gauge alone. With politics off there is no colony and no health (MuleView.colonyHealth null): today’s four gauges and colonists line.'],
  ['seam', 'SEAM: health is not in the view yet (WS5/WS7, MuleView.colonyHealth). The fixture extends the view locally with { well, lastWell, sick }. The mock’s own fit readouts are first estimates on an older trunk (0ece94ba) and a heavier fixture; the numbers above are the real app’s.'],
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

/** The sick-spell header in a phase whose gauges sat beside the title: today, and A with the gauges on their own row. */
function SideBySide() {
  return (
    <section className="flex flex-col gap-2" data-testid="side-by-side">
      <h2 className="label-caps">Today beside A · sick spell · “Production”’s header (top of the TV, 0.6 size)</h2>
      <div className="flex flex-wrap gap-4">
        {(
          [
            ['today', 'today', 'Today: four gauges beside the title'],
            ['A', 'aone', 'A (chosen): five gauges on a row of their own'],
          ] as const
        ).map(([k, layout, label]) => (
          <div key={k} className="relative flex flex-col gap-2 rounded-panel border border-holo-line p-3" data-testid={`variant-${k}`}>
            <a href={`#/tv-${layout}-oneline-sick`} className="text-sm font-semibold text-holo underline" data-testid={`variant-link-${k}`}>
              {label}
            </a>
            <TvScreen s="sick" layout={layout} scale={0.6} crop={200} title={ONE_LINE_TITLE} />
            <TitleProbes />
            <TvMeasure within={`variant-${k}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** A against today, measured live: the header's height, with planning's clock and in a phase whose gauges sat beside the title. */
function AMeasured() {
  const rows = [
    ['today-1', 'today', 'sick', ONE_LINE_TITLE, 'Today · “Production” · gauges beside the title'],
    ['a-1', 'aone', 'sick', ONE_LINE_TITLE, 'A · “Production” · gauges on their own row'],
    ['today-row', 'todayrow', 'sick', ONE_LINE_TITLE, 'Today · planning · gauges on their own row'],
    ['a-row-well', 'arow', 'well', ONE_LINE_TITLE, 'A · planning · Well'],
    ['a-row-sick', 'arow', 'sick', ONE_LINE_TITLE, 'A · planning · Sick spell'],
    ['a-row-limit', 'arow', 'limit', ONE_LINE_TITLE, 'A · planning · At the limit'],
  ] as const;
  return (
    <section className="flex flex-col gap-2" data-testid="a-measured">
      <h2 className="label-caps">A measured against today · the TV header (canvas px; ×1.5 at 1920)</h2>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {rows.map(([id, layout, st, title, label]) => (
          <div key={id} className="relative flex flex-col gap-1 rounded-panel border border-holo-line p-2" data-testid={`measured-${id}`}>
            <span className="text-sm font-semibold">{label}</span>
            <TvScreen s={st} layout={layout} scale={0.5} crop={220} title={title} />
            <TitleProbes />
            <TvMeasure within={`measured-${id}`} />
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
        <span className="label-caps">WS8 · WS5’s rule, approved by Heiko 6 Nov · A chosen by Heiko 7 Nov</span>
        <h1 className="font-display text-4xl font-semibold">Colony health, in its own cell</h1>
        <p className="font-semibold text-warn" data-testid="status">
          Chosen: A (Heiko 7 Nov). Production: own row, rail trimmed (PM ruling 7 Nov; WS4 frees ~80 px in its rail and measures ≥ 0.7 at build).
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
      <AMeasured />
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-2">
          <h2 className="label-caps">{g}</h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {PAGES.filter((s) => s.group === g).map((s) => (
              <li key={s.id}>
                <a href={`#/${s.id}`} className="font-semibold text-holo underline" data-testid={`link-${s.id}`}>
                  {s.id.startsWith('tv-aprod-') ? s.title.split(' one row · ')[1] : s.id === 'tv-monthend-today' ? 'Today, four gauges' : s.id.endsWith('today') ? (s.id.includes('667') ? '667 × 375' : '844 × 390') : s.id.includes('oneline') ? LAYOUT[s.id.split('-')[1] as Layout].name.split(',')[0] : s.id.endsWith('well') ? 'Well' : s.id.endsWith('sick') ? 'Sick spell' : 'At the limit'}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
