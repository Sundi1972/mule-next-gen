import { useState, type ReactNode } from 'react';
import { Board, LaptopFrame, PhoneFrame, TvFrame } from '../../harness';
import { IntentMarker, IntentNotes, IntentNotesProvider } from '../../proposed/IntentNote';
import { DEV_NOTES, DEV_STATES, DevAudit, type DevState } from './DevAudit';
import { devView } from './dev/fixture';
import { TvFirstMonth } from './dev/TvFirstMonth';

/**
 * The development audit's review pages: a hash route per state, each the phone held sideways (844 × 390) first, then
 * the laptop (1440 × 900), then the TV (1280 × 720) where a change shows there, with the notes beside. App.tsx
 * serves them under "For approval · UX audit": #audit-dev is the contents, #audit-dev-<state> each state.
 */

export const AUDIT_DEV_ROUTES: { id: DevState; title: string; intro: string; tv?: boolean; replay?: string }[] = [
  {
    id: 'walk',
    title: 'V-1 · Walking you can see and steer',
    intro:
      'Lena has walked out of the store with an Energy MULE; the guide has tapped Plains 4·1 for her. Her colonist stands on the map, the walk is dotted ahead of her, and the rail offers “Walk here · 4 s”: nothing at the plot is lit yet. On the phone, tap Walk here (or any plot, then Walk here): she walks a plot at a time, and Install and Analyse appear when she arrives. On the laptop the arrow keys walk her (← ← ← ↑ ↑ ↑ ↑ plays once as the page opens; click the map, then use the arrow keys yourself).',
    replay: 'play the arrow-key walk again',
  },
  {
    id: 'choose',
    title: 'V-2 · Choose what your MULE makes: your plots, and what each suits',
    intro:
      'Lena has bought a MULE and stands at the corral with it. Above the shops: her three plots, what each suits and which has a MULE; under each outfitter, the plots of hers that suit it (Tundra 3·4 dashed: it has a MULE). Tap an outfitter: she walks there (dotted, the room says WALKING), the MULE is outfitted, and the guide names the plot it picks: the best of her free plots for that good.',
  },
  {
    id: 'arrive',
    title: 'V-3 · Arrived on a plot nobody has analysed: analyse first',
    intro:
      'Lena stands on Plains 4·1 with her Energy MULE. “Analyse first · 8 s” stands beside Install. Tap it: she reads the ground for 8 s, and the readout names every good in words and what is best here (the next state shows the result).',
    replay: 'start again',
  },
  {
    id: 'arrive-read',
    title: 'V-3 · Analysed: the readout in words, and the mismatch',
    intro:
      'After the 8 s. Plains are often good for Food and Energy, but this one is best for Water: the readout says so in words, and the rail says the MULE she leads makes something else. She can still install (Energy 2 of 4 here, better than her Tundra’s 1 of 4) or walk it elsewhere.',
  },
  {
    id: 'swap',
    title: 'V-4, V-5 · A plot with a MULE: how to swap it, and where Alloy comes from',
    intro:
      'Lena stands on Tundra 3·4, where her Energy MULE went in month 1 without an analysis; the ground reads Water 3 of 4, Energy 1 of 4. The plot says how to swap the MULE, marks the rule change it would take to re-outfit it instead, and the filter says where its Alloy comes from.',
  },
  {
    id: 'pace',
    title: 'V-6, V-7 · 66 cr and hungry: your pace, and what the guide offers',
    intro:
      'Month 2, Lena has 66 cr and ate 1 of the 3 Food she needs. Everyone’s clock runs across the top of the stage; her pace and its reason stay in the rail, with what to do about it next month (open on the phone with a tap on the pace line; always open on a laptop). The corral says why it is closed, and the guide offers the pub and the doors instead.',
  },
  {
    id: 'first-month',
    title: 'V-8 · The first month: the clock waits for the first MULE',
    intro:
      'Month 1. The clock stands full until the first MULEs are in: Lena can buy, outfit and walk out without a countdown. Play it on the phone: once her MULE is in, the clock starts when every colonist’s is (Brix’s goes in at 14 s). The TV shows whose first MULE is still to come, then the clock starting.',
    tv: true,
    replay: 'start again',
  },
];

/** Where the pages link: each state's hash is prefixed, since App.tsx's #walk is the goods auction's. */
export type DevAuditLinks = { prefix?: string; back?: string };
export const DEV_PREFIX = 'audit-dev-';

function Page({ title, back, children }: { title: string; back: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-table p-8 text-ink">
      <span className="flex gap-4 font-mono text-xs">
        <a href={back} className="text-holo underline" data-testid="back">
          ← development audit
        </a>
        <a href="/" className="text-ink-3 underline" data-testid="back-index">
          all mocks
        </a>
      </span>
      <h1 className="mb-4 mt-2 font-display text-2xl font-semibold">{title}</h1>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Links({ current, prefix = DEV_PREFIX }: { current?: string; prefix?: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="audit-dev-links">
      {AUDIT_DEV_ROUTES.map((s) => (
        <li key={s.id}>
          <a href={`#${prefix}${s.id}`} className={s.id === current ? 'text-ink' : 'text-holo underline'} data-testid={`link-${s.id}`}>
            {s.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** One state: the phone, the laptop, the TV where it changes, and the notes for the changes it shows. */
export function AuditDevPage({ state, prefix = DEV_PREFIX, back = '#audit-dev' }: { state: (typeof AUDIT_DEV_ROUTES)[number] } & DevAuditLinks) {
  const [run, setRun] = useState(0);
  const notes = DEV_STATES[state.id].notes.map((id) => DEV_NOTES[id]);
  const elsewhere = AUDIT_DEV_ROUTES.filter((r) => r.id !== state.id && !DEV_STATES[r.id].notes.every((id) => DEV_STATES[state.id].notes.includes(id)));
  return (
    <Page title={`For approval · UX audit · Development · ${state.title}`} back={back}>
      <Links current={state.id} prefix={prefix} />
      <p className="max-w-[900px] text-sm text-ink-2" data-testid="intro">
        {state.intro} Each number on a screen marks one change; the notes beside say which player intent it serves and why it was made.{' '}
        {state.replay && (
          <button type="button" className="font-mono text-xs text-holo underline" onClick={() => setRun((r) => r + 1)} data-testid="replay">
            {state.replay}
          </button>
        )}
      </p>
      <IntentNotesProvider>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-col gap-4">
            <PhoneFrame>
              <DevAudit key={`${state.id}-p-${run}`} state={state.id} />
            </PhoneFrame>
            <LaptopFrame>
              <DevAudit key={`${state.id}-l-${run}`} state={state.id} />
            </LaptopFrame>
            {state.tv && (
              <TvFrame>
                <Board view={devView(1, 300)}>
                  <TvFirstMonth key={`tv-${run}`} mark={<IntentMarker note={DEV_NOTES.V8} part="tv" at="tr" />} />
                </Board>
              </TvFrame>
            )}
          </div>
          <div className="flex w-[420px] max-w-full flex-col gap-3">
            <IntentNotes
              title={notes.length === 1 ? 'One change, and why' : `${notes.length} changes on these screens, and why`}
              intro="One card per change. Hover one and its numbers light up on every screen. “Serves intent” quotes the player intent from the audit; “Why” is what the audit found."
              notes={notes}
            />
            <nav className="flex flex-col gap-1 rounded-panel border border-holo-faint p-3 text-sm" aria-label="The other changes" data-testid="other-changes">
              <span className="label-caps">The other changes</span>
              {elsewhere.map((r) => (
                <a key={r.id} href={`#${prefix}${r.id}`} className="text-holo underline">
                  {r.title}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </IntentNotesProvider>
    </Page>
  );
}

/** The contents: every state, what each shows, and the eight proposals in one line each. */
export function DevAuditContents() {
  return (
    <div className="min-h-full bg-table p-8 text-ink" data-testid="contents">
      <a href="/" className="font-mono text-xs text-holo underline" data-testid="back-index">
        ← all mocks
      </a>
      <h1 className="mb-1 mt-2 font-display text-2xl font-semibold">For approval · UX audit · Development</h1>
      <p className="max-w-3xl text-sm text-ink-2">
        Development (the store hall, and walking out to the map to install a MULE) redesigned from the UX audit (docs/research/2026-10-28-ws6-ux-audit.md §6): every change numbered on the screen, with the player intent it serves and why. Month 2, Lena: Plains 4·1 (no MULE), Tundra 3·4 (an Energy MULE on ground best for Water), Crater 15·1 (no MULE); she ate 1 of the 3 Food she needs, so her pace is 47%.
      </p>
      <h2 className="label-caps mt-6">The states</h2>
      <div className="mt-2">
        <Links />
      </div>
      <h2 className="label-caps mt-6">The eight changes</h2>
      <ol className="mt-2 flex max-w-3xl flex-col gap-1 text-sm" data-testid="contents-notes">
        {Object.values(DEV_NOTES).map((n) => (
          <li key={n.id}>
            <strong className="font-semibold">
              {n.n} · {n.title}
            </strong>{' '}
            <span className="text-ink-2">(intent {n.serves})</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

