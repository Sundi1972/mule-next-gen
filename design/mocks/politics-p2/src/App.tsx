import { cx } from '@mule/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { DESK_STATES, viewFor, type DeskState } from './fixture';
import { P6Page } from './sabotage/P6Page';
import { P10Page } from './show/P10Page';
import { GuardMap } from './sheriff/GuardMap';
import { SheriffDeskA } from './sheriff/VariantA';
import { SheriffDeskB } from './sheriff/VariantB';

/**
 * P2 (sabotage and the Sheriff), WS8. First step: two variants of the hardest screen, the Sheriff's desk, compared on
 * content only. Where the desk sits waits for WS6's tabbed shell (Heiko, 8 Nov; WS6 by 9 Nov 02:00Z): the Sheriff will
 * likely live in the Governor tab, and Guard is ruled to be Overview's map with a "Guarding · back to Sheriff" bar.
 */

const DECISIONS: string[] = [
  'Placement held: these are the desk’s contents, drawn at two column widths; WS6’s shell decides the tab.',
  'One map (PM ruling, 8 Nov): Guard switches to Overview’s map with a “Guarding · back to Sheriff” bar, never a second map.',
  'An investigation answers on the spot: “Solved: it was Kai.” or “The trail went cold.” (half the time, Heiko 7 Nov).',
  'A solved case can be fined straight away; the fine is 50–300 in steps of 50, times the sabotage ban’s ×2 or ×3, and says where the money goes.',
  'Guards are the Sheriff’s secret: the desk says “hidden until they catch someone”; nobody else’s map shows them.',
  'Before the votes are counted the desk waits and says why; nothing on it can be pressed.',
  'No id is ever printed (ids are opaque): a case is named by what happened, to whom, and when.',
  'The trade: in A a solved case jumps from Investigate down to Fine (clear jobs, but it moves under the thumb); in B it stays put and its next step changes (calmer, but one long list). PM ruled B (8 Nov); Heiko approved B folded (651 → 294 px in the 309 px sub-tab, one tap more per action), 8 Nov 03:57Z. A stays here for the record.',
];

type Route = 'index' | 'a' | 'b' | 'p6' | 'p10';
const route = (): Route => (location.hash === '#a' ? 'a' : location.hash === '#b' ? 'b' : location.hash === '#p6' ? 'p6' : location.hash === '#p10' ? 'p10' : 'index');

/** One variant on one phone: the desk, and Overview's map in Guard mode when the Sheriff opens it. */
function Flow({ variant, state, w, h }: { variant: 'a' | 'b'; state: DeskState; w: number; h: number }) {
  const { view, me } = viewFor('sheriff', state);
  const [guards, setGuards] = useState(me.politics!.sheriff!.guards);
  const [map, setMap] = useState(false);
  const start = { ...me.politics!.sheriff!, guards };
  const Desk = variant === 'a' ? SheriffDeskA : SheriffDeskB;
  return (
    <figure className="flex flex-col gap-1" data-testid={`flow-${variant}-${w}`}>
      <figcaption className="label-caps text-[10px]! text-ink-2">
        {map ? 'Overview map, Guard mode · 667 × 375 phone' : `Desk column ≈ ${w} px · scrolls`}
      </figcaption>
      {/* A device's screen or a desk column, not a design value. */}
      <div className="@container/shell overflow-y-auto rounded-panel border border-holo-line bg-void p-2.5 text-ink" style={map ? { width: 667, height: 375 } : { width: w, height: h }}>
        {map ? (
          <GuardMap view={view} start={start} onBack={(g) => (setGuards(g), setMap(false))} />
        ) : (
          <Desk view={view} start={start} incidents={view.politics!.sabotage!.incidents} onMap={() => setMap(true)} />
        )}
      </div>
    </figure>
  );
}

/** A variant at the two sideways phones' desk column widths, and the map at the smaller phone's full screen. */
function Variant({ variant, state, title, blurb }: { variant: 'a' | 'b'; state: DeskState; title: string; blurb: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={`variant-${variant}`}>
      <h2 className="font-display text-lg font-semibold">
        <a href={`#${variant}`} className="text-holo underline-offset-2 hover:underline">{title}</a>
      </h2>
      <p className="max-w-2xl text-sm text-ink-2">{blurb}</p>
      <div className="flex flex-wrap items-start gap-4">
        <Flow key={`${state}-357`} variant={variant} state={state} w={357} h={309} />
        <Flow key={`${state}-300`} variant={variant} state={state} w={300} h={375} />
        <Flow key={`${state}-400`} variant={variant} state={state} w={400} h={390} />
      </div>
    </section>
  );
}

function States({ state, onPick }: { state: DeskState; onPick(s: DeskState): void }) {
  return (
    <div role="radiogroup" aria-label="Desk state" className="flex flex-wrap gap-2" data-testid="desk-states">
      {DESK_STATES.map(([id, label]) => (
        <button key={id} type="button" role="radio" aria-checked={state === id} onClick={() => onPick(id)} data-testid={`state-${id}`}
          className={cx('h-11 rounded-control border px-4 text-sm font-semibold', state === id ? 'border-holo bg-holo-soft' : 'border-holo-line text-ink-2')}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-table p-6 text-ink" data-testid="page">
      <header className="flex flex-col gap-1">
        <a href="#" className="text-sm text-holo" data-testid="back-index">← Index</a>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
      </header>
      {children}
    </main>
  );
}

const A = { title: 'A · Three jobs', blurb: 'The office’s three powers as three sections, in the order a month uses them: Guard, Investigate, Fine. Only work that can still be done is on the desk; cold and closed cases are history.' };
const B = { title: 'B · The case file, folded (approved by Heiko, 8 Nov 03:57Z)', blurb: 'Guards as one row on top, then one list of every case, each a 44 px row with its next step on a chip (Investigate, Fine Lena); a tap opens it in place, one at a time. Cold and closed cases fold under one line. Folded 8 Nov: in WS6’s Sheriff sub-tab at 667 (357 × 309) B measured 651 px; folded it is 294.' };

export default function App() {
  const [r, setR] = useState(route);
  const [state, setState] = useState<DeskState>('month');
  useEffect(() => {
    const on = () => setR(route());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  if (r === 'p10')
    return (
      <Page title="P10 · on the TV: Caught!, the dark plot, the rumour">
        <P10Page />
      </Page>
    );
  if (r === 'p6')
    return (
      <Page title="P6 · the secret order: a power cut from Look, a rumour from the market">
        <P6Page />
      </Page>
    );
  if (r !== 'index')
    return (
      <Page title={`Sheriff’s desk, variant ${r === 'a' ? A.title : B.title}`}>
        <States state={state} onPick={setState} />
        <Variant variant={r} state={state} {...(r === 'a' ? A : B)} />
      </Page>
    );
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-table p-6 text-ink" data-testid="index">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">Politics P2 · sabotage and the Sheriff</h1>
        <p className="max-w-3xl text-sm text-ink-2">
          Brix is Sheriff, month 5 planning. Five sabotages so far: two unsolved, one caught by a guard and not yet fined, one gone cold, one fined.
          Press Investigate, fine, or post a guard on the map; switch the state to see the ban, a spent month, election day and a quiet colony.
        </p>
        <ul className="flex max-w-3xl list-disc flex-col gap-0.5 pl-5 text-sm" data-testid="decisions">
          {DECISIONS.map((d) => <li key={d}>{d}</li>)}
        </ul>
      </header>
      <nav className="flex flex-wrap gap-4 text-sm" data-testid="screens">
        <a href="#b" className="text-holo underline" data-testid="link-b">P7–P8 · Sheriff’s desk, B folded (approved)</a>
        <a href="#a" className="text-holo underline" data-testid="link-a">Sheriff’s desk, A</a>
        <a href="#p6" className="text-holo underline" data-testid="link-p6">P6 · the secret order</a>
        <a href="#p10" className="text-holo underline" data-testid="link-p10">P10 · Caught! on the TV</a>
      </nav>
      <States state={state} onPick={setState} />
      <div className="flex flex-wrap items-start gap-10">
        <Variant variant="a" state={state} {...A} />
        <Variant variant="b" state={state} {...B} />
      </div>
    </main>
  );
}
