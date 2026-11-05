import type { CouncilView, MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Hub } from '../../../../apps/web/src/phone/hub/Hub';
import { TodayState } from '../../../../apps/web/src/phone/hub/state';
import { colony, council, FAILED, game, GOVERNOR, HOSPITAL_CLOSED, HOSPITAL_STANDING, LAND_TAX_10, OBSERVATORY_DAMAGED, ONE_LAW, PARK_COLLECTING, PASSED, PLAYERS, politics, THREE_LAWS, TIE, type Laws } from './fixture';
import { LivePhone, TvGame, type Preset } from './live';
import { MOCK_SLOTS } from './slots';
import { TvCouncil, type RevealVariant } from './tv';
import { impactOf } from './words';

// --- The fixtures each page starts from -----------------------------------------------------------------

const KAI = 's3';
const plain = (projects: Parameters<typeof colony>[0], fund?: number, laws: Laws = ONE_LAW) => game({ col: colony(projects, fund), pol: politics({ laws }) });
const withSeat = (v: MuleView, seat: string): MuleView => game({ seat, col: v.colony!, pol: v.politics! });
const pendingPol = (laws: Laws = ONE_LAW) => politics({ laws: {}, proposal: { by: GOVERNOR, month: 5, proposal: LAND_TAX_10, impact: impactOf(LAND_TAX_10, laws) } });

/** Month 6's planning opens with the ballot on month 5's land tax. `done` pressed Done; AI seats always are. */
function ballotGame(seat: string, { voted = [], done = [], lawBallot = null, stage = 'ballot', result = null }: { voted?: string[]; done?: string[]; lawBallot?: boolean | null; stage?: CouncilView['stage']; result?: CouncilView['result'] } = {}): MuleView {
  const allDone = [...new Set(['s2', 's4', ...done])];
  const c = council(stage, {
    impact: impactOf(LAND_TAX_10, {}),
    voted: [...new Set(['s1', 's2', 's4', ...voted])],
    done: allDone,
    waitingFor: stage === 'ballot' ? PLAYERS.filter((p) => !p.isAi && !allDone.includes(p.id)).map((p) => p.id) : [],
    result,
  });
  const v = game({ seat, month: 6, col: colony([PARK_COLLECTING, HOSPITAL_STANDING], 2_340, true), pol: politics({ laws: {}, council: c }), lawBallot: seat === GOVERNOR && lawBallot === null ? true : lawBallot });
  return { ...v, players: v.players.map((p) => ({ ...p, ready: p.isAi || (stage === 'ballot' && allDone.includes(p.id)) })) };
}

const tvBallot = () => ballotGame(GOVERNOR, { voted: [KAI] });
const tvReveal = (result: NonNullable<CouncilView['result']>) => ballotGame(GOVERNOR, { stage: 'reveal', result, done: ['s1', 's3', 's5'], voted: ['s3', 's5'] });

// --- The pages, in the brief's order ------------------------------------------------------------------

interface Page {
  id: string;
  group: string;
  title: string;
  note: string;
  render: () => ReactNode;
}

const phone = (start: MuleView, seat: string, preset: Preset = {}) => () => (
  <LivePhone start={start} seat={seat} preset={preset}>
    <TodayState>
      <Hub slots={MOCK_SLOTS} />
    </TodayState>
  </LivePhone>
);

function TvPage({ view, variant }: { view: MuleView; variant?: RevealVariant }) {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-col items-start gap-2">
      <TvGame view={view}>
        <TvCouncil key={run} game={view} {...(variant ? { variant } : {})} />
      </TvGame>
      {view.politics?.council?.stage === 'reveal' && (
        <button type="button" className="min-h-8 text-sm font-semibold text-holo underline" onClick={() => setRun((r) => r + 1)} data-testid="replay">
          Replay the reveal
        </button>
      )}
    </div>
  );
}

const C35 = 'C35 · the Colony desk (phone)';
const PICK = 'C46 · the Governor’s law picker (phone)';
const VOTE = 'C46 · the vote on every phone';
const TV = 'C46 · the TV council panel';

const PAGES: Page[] = [
  { id: 'commission', group: C35, title: '1 · Commission: the catalogue', note: 'Lena governs. Tap a row for its confirm line, then Commission: the Park appears Collecting and the news line follows. The Hospital and Observatory rows are dimmed with RULE-22’s words.', render: phone(plain([HOSPITAL_STANDING, OBSERVATORY_DAMAGED]), GOVERNOR, { desk: 'colony', open: 'commission' }) },
  { id: 'commission-votes', group: C35, title: '1 · Commission while the votes are open', note: 'Every row dimmed: “Commission once the votes are over” (RULE-22 row 2).', render: phone(game({ col: colony([HOSPITAL_STANDING], 2_340, true), pol: politics({ laws: {} }) }), GOVERNOR, { desk: 'colony', open: 'commission' }) },
  { id: 'donate-b', group: C35, title: '2 · Donate, B: quick chips (WS8’s pick)', note: 'Kai’s phone. Credits chips, “the rest”, one chip per missing good he holds, “Other…” opens A’s steppers. The preview shows his plaque before and after; Give really donates.', render: phone(withSeat(plain([PARK_COLLECTING, HOSPITAL_STANDING]), KAI), KAI, { desk: 'colony', open: 'donate:park', donate: 'B' }) },
  { id: 'donate-a', group: C35, title: '2 · Donate, A: the steppers sheet', note: 'Credits up to min(your money, missing); one stepper per missing good up to min(your stock, missing).', render: phone(withSeat(plain([PARK_COLLECTING, HOSPITAL_STANDING]), KAI), KAI, { desk: 'colony', open: 'donate:park', donate: 'A' }) },
  { id: 'donate-refused', group: C35, title: '2 · Donation refused (RULE-23 row 6)', note: 'Tap “the rest (200)” and Give: Ossa’s 100 cr reached the Park first, so the server refuses with “The Park needs only 100 cr more” as the app’s toast; the chip now reads the rest (100).', render: phone(withSeat(plain([PARK_COLLECTING, HOSPITAL_STANDING]), KAI), KAI, { desk: 'colony', open: 'donate:park', donate: 'B', race: true }) },
  { id: 'site-bid', group: C35, title: '3 · Site bid: the colony’s top bid for the plot', note: 'The Governor, on a Collecting object that needs a plot and has none. Chips 100 · 200 · 300 · Other… · No bid. Set it: the row says “Bids up to 300 cr at the land auction”.', render: phone(plain([PARK_COLLECTING, HOSPITAL_STANDING]), GOVERNOR, { desk: 'colony', open: 'bid:park' }) },
  { id: 'site-bid-set', group: C35, title: '3 · Site bid, once set', note: 'The row’s line, with Change. Everyone else’s phone shows the same line, without the button.', render: phone(plain([{ ...PARK_COLLECTING, maxBid: 300 }, HOSPITAL_STANDING]), GOVERNOR, { desk: 'colony' }) },
  { id: 'repair', group: C35, title: '4 · Repair, affordable', note: '“Repair 250 cr” with the fund before and after. Tap it: the Observatory stands again.', render: phone(plain([OBSERVATORY_DAMAGED, HOSPITAL_STANDING]), GOVERNOR, { desk: 'colony' }) },
  { id: 'repair-short', group: C35, title: '4 · Repair, the fund is short', note: 'Disabled, with RULE-21’s words.', render: phone(plain([OBSERVATORY_DAMAGED, HOSPITAL_STANDING], 150), GOVERNOR, { desk: 'colony' }) },
  { id: 'closed', group: C35, title: '5 · A closed row', note: 'No button: “Reopens when the fund pays its upkeep”.', render: phone(plain([PARK_COLLECTING, HOSPITAL_CLOSED], 20), GOVERNOR, { desk: 'colony' }) },
  { id: 'picker-a-0', group: PICK, title: '7 · Picker A, one list (WS8’s pick), no laws yet', note: 'All four laws, each its meaning and its settings as chips. Pick one: the preview lists each player’s cost; Propose puts it to next month’s vote.', render: phone(game({ col: colony([PARK_COLLECTING]), pol: politics({ laws: {} }) }), GOVERNOR, { picker: 'A' }) },
  { id: 'picker-a-3', group: PICK, title: '7 · Picker A, three laws in force', note: 'Each in force marked “in force since month N”, with Repeal. Pick the Land tax: “This replaces:” asks which one goes (RULE-41 rows 11–12).', render: phone(game({ col: colony([PARK_COLLECTING]), pol: politics({ laws: THREE_LAWS }) }), GOVERNOR, { picker: 'A' }) },
  { id: 'picker-a-retry', group: PICK, title: '7 · Picker A, a law waiting to come back', note: 'The Pollution tax failed in month 3: dimmed, “Failed in month 3; can come back in month 6” (RULE-41 row 4).', render: phone(game({ col: colony([PARK_COLLECTING]), pol: politics({ laws: ONE_LAW, retry: { 'enact:pollutionTax': 3 } }) }), GOVERNOR, { picker: 'A' }) },
  { id: 'picker-b-0', group: PICK, title: '7 · Picker B, two steps, no laws yet', note: 'Pick a law, then its setting, then the same preview and Propose.', render: phone(game({ col: colony([PARK_COLLECTING]), pol: politics({ laws: {} }) }), GOVERNOR, { picker: 'B' }) },
  { id: 'picker-b-3', group: PICK, title: '7 · Picker B, three laws in force', note: 'The same replaces pick at its second step.', render: phone(game({ col: colony([PARK_COLLECTING]), pol: politics({ laws: THREE_LAWS, retry: { 'enact:landTax': 3 } }) }), GOVERNOR, { picker: 'B' }) },
  { id: 'pending', group: PICK, title: '7 · The pending proposal', note: 'Once proposed: the proposal, each player’s cost, Change (back to the picker, keeping the pick) and Withdraw (propose null).', render: phone(game({ col: colony([PARK_COLLECTING]), pol: pendingPol({}) }), GOVERNOR, { picker: 'A' }) },
  { id: 'agenda', group: VOTE, title: '8 · Another phone, while a proposal is pending', note: 'Kai’s “This month” carries “Next month’s vote: Lena proposes Land tax 10 cr a plot. For you: about 70 cr a month.” It opens the Council desk, which shows the laws in force and the same line.', render: phone(game({ seat: KAI, col: colony([PARK_COLLECTING]), pol: pendingPol({}) }), KAI) },
  { id: 'ballot-before', group: VOTE, title: '9 · The ballot, before you vote', note: 'Month 6 opens with it, on the hub’s stage as the election does. Yes or No, then Done (the ready bar). Who has voted, never how; “Your vote weighs 2”.', render: phone(ballotGame(KAI), KAI) },
  { id: 'ballot-after', group: VOTE, title: '9 · After you vote, before Done', note: 'Kai picked Yes: his mark joins “Voted”. Done is live.', render: phone(ballotGame(KAI, { voted: [KAI], lawBallot: true }), KAI) },
  { id: 'ballot-waiting', group: VOTE, title: '9 · Done: waiting for N', note: 'Kai is Done: Now and the ready bar say whom the vote still waits for. He can still change his vote.', render: phone(ballotGame(KAI, { voted: [KAI], done: [KAI], lawBallot: true }), KAI) },
  { id: 'ballot-host', group: VOTE, title: '9 · The host’s Continue', note: 'Lena (host and Governor, her ballot started at Yes) is Done; the bar offers Continue without Kai and Pip, with one confirm. Continue: the result shows, then the law takes effect.', render: phone(ballotGame(GOVERNOR, { done: [GOVERNOR] }), GOVERNOR) },
  { id: 'ballot-reveal', group: VOTE, title: '9 · The reveal on the phone', note: '“Passed 7 to 3 · Land tax 10 cr a plot is in force from now.” After the reveal’s 4 s the hub returns, the law in the Council desk’s strip.', render: phone(ballotGame(KAI, { stage: 'reveal', result: PASSED, done: ['s1', 's3', 's5'], voted: ['s3', 's5'] }), KAI) },
  { id: 'tv-ballot', group: TV, title: '10 · TV, the ballot', note: 'The proposal, each player’s “for you”, who has voted. The laws in force along the foot.', render: () => <TvPage view={tvBallot()} /> },
  { id: 'tv-reveal-a', group: TV, title: '10 · TV reveal A, the weighted bar (WS8’s pick): passed', note: 'Yes and no fill from each end, then PASSED stamps on. Totals only.', render: () => <TvPage view={tvReveal(PASSED)} variant="A" /> },
  { id: 'tv-reveal-a-failed', group: TV, title: '10 · TV reveal A: failed', note: '3 to 7; it can come back in month 9.', render: () => <TvPage view={tvReveal(FAILED)} variant="A" /> },
  { id: 'tv-reveal-a-tie', group: TV, title: '10 · TV reveal A: a tie', note: '“3 to 3 · the Governor’s vote decides”, and it passes.', render: () => <TvPage view={tvReveal(TIE)} variant="A" /> },
  { id: 'tv-reveal-b', group: TV, title: '10 · TV reveal B, the stamp and two big numbers: passed', note: 'The same result, as a stamp between YES and NO.', render: () => <TvPage view={tvReveal(PASSED)} variant="B" /> },
  { id: 'tv-reveal-b-failed', group: TV, title: '10 · TV reveal B: failed', note: '', render: () => <TvPage view={tvReveal(FAILED)} variant="B" /> },
  { id: 'tv-reveal-b-tie', group: TV, title: '10 · TV reveal B: a tie', note: '', render: () => <TvPage view={tvReveal(TIE)} variant="B" /> },
];

const DECISIONS = [
  'The Colony desk is C34’s card: each project’s buttons sit in its action slot under the row they act on; Commission heads the desk, for the Governor only.',
  'Every refusal and disabled state uses the engine’s own words (RULE-21/22/23/28, RULE-41): a dimmed catalogue row says why, a short fund says “The fund has F cr; the repair costs R cr”.',
  'A gift always shows what it does to you: “Your plaque: 70 → 170 cr · counts toward your vote weight”.',
  'The site bid is the Governor’s line under a plotless Collecting object; once set every phone reads “Bids up to 300 cr at the land auction”.',
  'The law picker replaces WS6’s placeholder in the Governor desk, under the sales tax; it always ends in RULE-45’s “For each player” preview before Propose.',
  'While a proposal is pending, every phone’s “This month” carries it and its cost to you; the Council desk carries the laws in force as chips.',
  'The ballot takes the hub’s stage as the election does: Yes/No, who voted (never how), your weight, and the ready bar is Done, with the host’s Continue.',
  'The TV council panel is TvElection’s frame: the ballot, then the reveal with totals only (RULE-42/47), the laws in force along its foot.',
];

const QUESTIONS: { q: string; a: [string, string]; b: [string, string]; pick: 'A' | 'B' }[] = [
  { q: 'Donate', a: ['donate-a', 'A · the steppers sheet'], b: ['donate-b', 'B · quick chips, “Other…” opens A'], pick: 'B' },
  { q: 'The law picker', a: ['picker-a-0', 'A · one list, settings as chips'], b: ['picker-b-0', 'B · two steps: law, then setting'], pick: 'A' },
  { q: 'The TV reveal', a: ['tv-reveal-a', 'A · the weighted bar, then the stamp'], b: ['tv-reveal-b', 'B · the stamp and two big numbers'], pick: 'A' },
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
          ← All WS8 desk screens
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
        <span className="label-caps">G-5 C35 · slice 2a C46 · WS8 mocks</span>
        <h1 className="font-display text-4xl font-semibold">The colony and council desks, and the TV’s law reveal</h1>
        <p className="font-semibold text-warn" data-testid="status">
          For review: the PM rules at 15:00, 5 Nov 2026.
        </p>
        <p className="max-w-3xl text-base text-ink-2">The real planning hub (Hub, HUB_SLOTS and WS7’s politics slots) on a phone held sideways, with a fake client: every button sends its real intent and the fixture answers with the engine’s rules and words.</p>
      </header>
      <section className="flex max-w-4xl flex-col gap-2 rounded-panel border border-holo-line bg-panel p-5" data-testid="decisions">
        <h2 className="label-caps">Design decisions</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {DECISIONS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
      <section className="flex max-w-4xl flex-col gap-2" data-testid="questions">
        <h2 className="label-caps">Three open questions · WS8’s pick marked</h2>
        {QUESTIONS.map(({ q, a, b, pick }) => (
          <div key={q} className="grid grid-cols-[10rem_1fr_1fr] items-stretch gap-2" data-testid={`question-${q}`}>
            <span className="self-center font-display text-lg font-semibold">{q}</span>
            {(
              [
                ['A', a],
                ['B', b],
              ] as const
            ).map(([k, [id, label]]) => (
              <a key={k} href={`#/${id}`} className={cx('flex items-center justify-between gap-2 rounded-panel border p-3 text-sm font-semibold', pick === k ? 'border-2 border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink')} data-testid={`option-${q}-${k}`}>
                {label}
                {pick === k && <span className="rounded-chip bg-holo px-1.5 font-mono text-[10px] font-bold text-on-holo">WS8’S PICK</span>}
              </a>
            ))}
          </div>
        ))}
      </section>
      <section className="flex max-w-4xl flex-col gap-1 rounded-panel border border-holo-line bg-panel p-5" data-testid="strike-link">
        <h2 className="label-caps">6 · Pay the strike: not redrawn</h2>
        <p className="text-sm">
          The approved colony-events mock, option A (the Now card): branch <code className="font-mono">ws8-colony-events-mock</code> at <code className="font-mono">3aaff0ac</code>, workspace <code className="font-mono">design/mocks/ws8-colony-events</code>, page{' '}
          <a href="http://localhost:5317/#/phone-gov-a" className="font-semibold text-holo underline" data-testid="strike-card">
            #/phone-gov-a
          </a>{' '}
          (run it as its README says; the link assumes port 5317).
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
