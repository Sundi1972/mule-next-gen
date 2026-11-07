import { cx } from '@mule/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { Hub } from '../../../../apps/web/src/phone/hub/Hub';
import { TodayState } from '../../../../apps/web/src/phone/hub/state';
import { Results } from '../../../../apps/web/src/phone/Results';
import { TableApp } from '../../../../apps/web/src/table/TableApp';
import { HUB_SLOTS } from '../../../../apps/web/src/phone/hub/today';
import { apply, boardClient, clientFor, gameFor, HOLDER, SCENES, SEATS, tableOf, viewFor, type Intent, type Scene, type SceneId, type Seat, type Shares } from './fixture';
import { Graft } from './Graft';
import { FundLines } from './proposed/FundLines';
import type { Variant } from './proposed/GovernorBudget';
import { TvBudgetLine, TvOverruleCall } from './proposed/TvBudgetLine';
import { TvOverrule } from './proposed/TvOverrule';
import { DraftSeed } from './seed';
import { frameSlots, OpenDesk } from './slots';

// --- What the index lists -----------------------------------------------------------------------------------------

/** The key decisions, one line each. */
const DECISIONS: [string, string][] = [
  ['P12', 'The budget sits in the Governor desk right under the tax, before the law picker: the tax fills the fund, the budget spends it.'],
  ['P12', 'Each line says what it pays at today’s fund and where it goes (“432 cr toward the Observatory”, “54 cr to Kai, last on Worth”: §3’s worked example, 540 cr spare). At Welfare 0% it says who it would go to.'],
  ['P12', 'Welfare’s + takes from what is kept, then from Projects; Projects’ + takes only from what is kept; − always gives back to the fund. So no sum can pass 100.'],
  ['P12', 'Commissioning moves under the Projects line, the real Commission unchanged; the Colony desk no longer shows it.'],
  ['P12', 'A call freezes the tax only (S5-RULE-2 in RC): the tax row turns read-only with who called it; the budget stays live.'],
  ['P13', 'Every other phone’s Council desk opens on the budget as set, each moved line as “0% → 10%” in holo; the default reads “as the game began”.'],
  ['P13', '“Call an overrule vote” sits at the tax line in the Colony desk’s fund card, only once the tax has moved this month (PM, 7 Nov).'],
  ['P13', 'While a call waits, one line under Now on every phone says who called it; a tap opens the fund card. It is the strike alert’s place: no new tab, no tool.'],
  ['P13', 'The ballot takes the hub’s stage like the law ballot, in its look: the question, “5% at the month’s start → 10% now”, Yes / No, “needs 5 of 9 votes”, Cast my vote in the ready bar.'],
  ['P13', 'Who has voted is done (who has cast), never the preset ballots: the caller’s Yes and the Governor’s No exist from the start (AM-5).'],
  ['P13', 'The ready bar: “Cast my vote” until you cast, then “Waiting for the overrule vote”; in the reveal, “Continue” (AM-5).'],
  ['P14', 'The TV’s planning header gains the budget line under the promise line. The call’s banner heads the side column, above who the table waits for: in the header it shrank the body to 0.763 (TV-FIT), in the side the news gives way and it stays at 0.896.'],
  ['P14', 'The overrule panel is TvCouncil’s frame. Its reveal bar is all the table’s votes with the mark at “needed”, not the half-way mark the law’s bar uses: the rules differ.'],
  ['P15', 'The month end’s colony panel gains one line, “Paid out this month”: office pay, upkeep, Welfare 54 → Kai, Buildings 432. Out only. TV-FIT, open finding: with the Observatory collecting, 0.701 as built and 0.663 with this line, under the 0.7 floor.'],
];

interface StateDef {
  id: string;
  label: string;
  scene: SceneId;
  seed?: Shares;
}
interface ScreenDef {
  id: string;
  title: string;
  graft: string;
  kind: 'phone' | 'tv' | 'monthEnd';
  desk?: string;
  seats: Seat[];
  states: StateDef[];
}

const SCREENS: ScreenDef[] = [
  {
    id: 'p12', title: 'P12 · the Governor’s desk: the budget', graft: 'Governor.tsx (GovernorBudget, FrozenTax)', kind: 'phone', desk: 'governor', seats: ['governor'],
    states: [
      { id: 'default', label: 'As it stands: Projects 100', scene: 'default' },
      { id: 'editing', label: 'Editing, not yet Set', scene: 'default', seed: { projects: 80, welfare: 10 } },
      { id: 'set', label: 'Set: 80 · 10 · kept 10', scene: 'set' },
      { id: 'frozen', label: 'Tax frozen by Brix’s call', scene: 'called' },
    ],
  },
  {
    id: 'p13-council', title: 'P13 · the Council desk: the budget as set', graft: 'Council.tsx (CouncilBudget)', kind: 'phone', desk: 'council', seats: ['lena', 'sheriff', 'governor'],
    states: [
      { id: 'changed', label: 'Changed this month', scene: 'set' },
      { id: 'default', label: 'As the game began', scene: 'default' },
    ],
  },
  {
    id: 'p13-call', title: 'P13 · the call, at the tax line in the fund card', graft: 'Colony.tsx FundCard (OverruleCall), today.tsx underNow', kind: 'phone', desk: 'colony', seats: ['lena', 'sheriff', 'governor'],
    states: [
      { id: 'open', label: 'Tax raised: Call', scene: 'set' },
      { id: 'called', label: 'Called by Brix', scene: 'called' },
      { id: 'unchanged', label: 'Tax as it began: no button', scene: 'unchanged' },
    ],
  },
  {
    id: 'p13-ballot', title: 'P13 · the overrule ballot and its reveal', graft: 'new OverruleBallot.tsx, politics/slots.ts', kind: 'phone', seats: ['lena', 'sheriff', 'governor'],
    states: [
      { id: 'ballot', label: 'Ballot open', scene: 'ballot' },
      { id: 'cast', label: 'Lena and Ossa cast', scene: 'cast' },
      { id: 'passed', label: 'Reveal: overruled', scene: 'passed' },
      { id: 'stands', label: 'Reveal: it stands', scene: 'stands' },
    ],
  },
  {
    id: 'p14', title: 'P14 · the TV', graft: 'TvGovernorPromise.tsx (TvBudgetLine), TableApp.tsx planning side (TvOverruleCall), new TvOverrule.tsx', kind: 'tv', seats: [],
    states: [
      { id: 'budget', label: 'Planning: the budget line', scene: 'set' },
      { id: 'called', label: 'The call’s banner', scene: 'called' },
      { id: 'ballot', label: 'Overrule ballot', scene: 'ballot' },
      { id: 'cast', label: 'Ballot, 3 of 4 cast', scene: 'cast' },
      { id: 'passed', label: 'Reveal: overruled', scene: 'passed' },
      { id: 'stands', label: 'Reveal: it stands', scene: 'stands' },
    ],
  },
  {
    id: 'p15', title: 'P15 · the month end: the fund this month', graft: 'MonthEnd.tsx ColonyPanel (FundLines)', kind: 'monthEnd', seats: ['lena'],
    states: [{ id: 'paid', label: 'Welfare and buildings paid', scene: 'monthEnd' }],
  },
];

/** ?today draws every frame as built, with none of this mock's pieces, for comparison (and for the TV-FIT baseline). */
const TODAY = new URLSearchParams(location.search).has('today');

const href = (params: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined)).toString()}`;

// --- Frames ---------------------------------------------------------------------------------------------------------

type Send = (from: string, intent: Intent) => void;

/** A phone (or the laptop) at its real size, drawing the real hub with this mock's slots, or the real month end. */
function Phone({ seat, scene, w, h, variant = 'a', desk, seed, send, label }: { seat: Seat; scene: Scene; w: number; h: number; variant?: Variant; desk?: string | undefined; seed?: Shares | undefined; send: Send; label?: string }) {
  const { view, me, self, slot } = viewFor(seat, scene);
  const table = tableOf(view, 0);
  const client = useMemo(() => clientFor(seat, send), [seat, send]);
  const slots = useMemo(() => (TODAY ? HUB_SLOTS : frameSlots(variant)), [variant]);
  return (
    <figure className="flex flex-col gap-1" data-testid={`phone-${w}${label ? `-${label}` : ''}`}>
      <figcaption className="label-caps text-[10px]! text-ink-2">
        {label && <strong className="mr-2 text-holo">{label}</strong>}
        {w} × {h} · {self.name}’s {w >= 1100 ? 'laptop' : 'phone'}
      </figcaption>
      {/* The device's screen, not a design value: the two phones and the laptop every screen is drawn for. */}
      <div className="overflow-hidden rounded-panel border border-holo-line bg-void" style={{ width: w, height: h }} data-graft-scope data-frame={`${w}x${h}`}>
        <ClientProvider client={client}>
          <PhoneGameProvider value={{ table, view, me, self, slot }}>
            <OpenDesk.Provider value={desk ?? null}>
              <DraftSeed.Provider value={seed ?? null}>
                {scene.moment === 'monthEnd' ? (
                  <>
                    <Results />
                    {!TODAY && <Graft into='[data-testid="colony-panel"] > div' className="col-span-3">
                      <FundLines view={view} density="compact" />
                    </Graft>}
                  </>
                ) : (
                  <TodayState>
                    <Hub slots={slots} />
                  </TodayState>
                )}
              </DraftSeed.Provider>
            </OpenDesk.Provider>
          </PhoneGameProvider>
        </ClientProvider>
      </div>
    </figure>
  );
}

/** The TV at 1280 × 720: the real TableApp, with this mock's pieces grafted in; the overrule panel is new, so drawn alone. */
function Tv({ scene }: { scene: Scene }) {
  const client = useMemo(() => boardClient(scene), [scene]);
  const game = gameFor(scene, null);
  const overrule = scene.moment === 'ballot' || scene.moment === 'reveal';
  return (
    <figure className="flex flex-col gap-1" data-testid="tv-1280">
      <figcaption className="label-caps text-[10px]! text-ink-2">1280 × 720 · the TV</figcaption>
      {/* MOCK: TableApp's root is h-dvh (the TV's whole window); in this frame it is the frame's height, so Scaled draws 1:1. */}
      <div className="overflow-hidden rounded-panel border border-holo-line [&>div]:h-full!" style={{ width: 1280, height: 720 }} data-graft-scope data-frame="tv">
        <ClientProvider client={client}>
          {overrule ? (
            <TvOverrule game={game} />
          ) : (
            <>
              <TableApp room="MULE" />
              {TODAY ? null : scene.moment === 'monthEnd' ? (
                <Graft at='[data-testid="colony-fund"]' className="col-span-2">
                  <FundLines view={game} density="tv" />
                </Graft>
              ) : (
                <>
                  <Graft at='[data-testid="tv-governor-promise"]'>
                    <TvBudgetLine game={game} />
                  </Graft>
                  <Graft before='[data-testid="tv-waiting"]' className="shrink-0">
                    <TvOverruleCall game={game} />
                  </Graft>
                </>
              )}
            </>
          )}
        </ClientProvider>
      </div>
    </figure>
  );
}

// --- Pages ----------------------------------------------------------------------------------------------------------

function Section({ title, id, children }: { title: ReactNode; id?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" id={id}>
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Chip({ to, on, children, testid }: { to: string; on: boolean; children: ReactNode; testid: string }) {
  return (
    <a href={to} aria-current={on ? 'page' : undefined} data-testid={testid} className={cx('flex h-11 items-center rounded-control border px-4 text-sm font-semibold', on ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2 hover:border-holo')}>
      {children}
    </a>
  );
}

function useScene(initial: Scene): [Scene, Send, (s: Scene) => void] {
  const [scene, setScene] = useState(initial);
  const send = useMemo<Send>(() => (from, intent) => setScene((s) => apply(s, from, intent)), []);
  return [scene, send, setScene];
}

function Index() {
  const p12 = SCREENS[0]!;
  const [at, setAt] = useState(p12.states[1]!.id);
  const state = p12.states.find((s) => s.id === at)!;
  const [scene, send, setScene] = useScene(SCENES[state.scene]);
  const pick = (s: StateDef) => {
    setAt(s.id);
    setScene(SCENES[s.scene]);
  };
  return (
    <main className="flex min-h-dvh flex-col gap-8 bg-table p-6 text-ink" data-testid="index">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">Politics RC · P3, the Governor’s budget and the overrule vote</h1>
        <p className="max-w-4xl text-sm text-ink-2">
          Slice 5’s RC moments 1–5 in the approved frame (P0, option A): the real planning hub, desks, TV and month end, with the new pieces drawn in. Month 5: Ossa governs and raised the tax from 5% to 10%;
          Brix calls an overrule vote; it is held as planning ends. Everything is clickable: Call, Withdraw, the budget’s steppers and bar, Yes / No and Cast change the table as the server would.
        </p>
      </header>
      <Section title="Key decisions" id="decisions">
        <ul className="flex max-w-5xl flex-col gap-1 text-sm" data-testid="decisions">
          {DECISIONS.map(([piece, line], i) => (
            <li key={i} className="flex gap-3" data-testid={`decision-${i}`}>
              <span className="w-10 shrink-0 font-mono text-holo">{piece}</span>
              <span className="text-ink-2">{line}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="P12, the hardest screen: two variants side by side, at the small phone" id="variants">
        <div role="radiogroup" aria-label="P12 state" className="flex flex-wrap gap-2">
          {p12.states.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={at === s.id} onClick={() => pick(s)} data-testid={`variants-state-${s.id}`}
              className={cx('h-11 rounded-control border px-4 text-sm font-semibold', at === s.id ? 'border-holo bg-holo-soft' : 'border-holo-line text-ink-2')}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex flex-col gap-2">
            <Phone key={`a-${at}`} seat="governor" scene={scene} w={667} h={375} variant="a" desk="governor" seed={state.seed} send={send} label="A · steppers" />
            <p className="max-w-[667px] text-sm text-ink-2" data-testid="variant-a-note">
              <strong className="text-ink">A, a stepper per line.</strong> The tax row’s own − n + under it, one per line; each line says what it pays. Thumb-sized, exact, readable in one pass. Recommended.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Phone key={`b-${at}`} seat="governor" scene={scene} w={667} h={375} variant="b" desk="governor" seed={state.seed} send={send} label="B · split bar" />
            <p className="max-w-[667px] text-sm text-ink-2" data-testid="variant-b-note">
              <strong className="text-ink">B, one split bar.</strong> The whole spare as one bar, a handle at each boundary; drag or use the arrow keys. Shows the proportion at a glance, but a 5% step is about 13 px at 667, and Projects → kept takes two moves.
            </p>
          </div>
        </div>
      </Section>
      <Section title="Every screen and state" id="screens">
        <table className="max-w-6xl text-left text-sm" data-testid="screens">
          <tbody>
            {SCREENS.map((s) => (
              <tr key={s.id} className="border-t border-holo-line align-top" data-testid={`screen-row-${s.id}`}>
                <td className="py-2 pr-3 font-semibold">
                  <a className="text-holo underline-offset-2 hover:underline" href={href({ screen: s.id })} data-testid={`screen-link-${s.id}`}>
                    {s.title}
                  </a>
                </td>
                <td className="py-2 pr-3 font-mono text-xs text-ink-3">{s.graft}</td>
                <td className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                  {s.states.map((st) => (
                    <a key={st.id} className="text-ink-2 underline-offset-2 hover:text-holo hover:underline" href={href({ screen: s.id, state: st.id })} data-testid={`state-link-${s.id}-${st.id}`}>
                      {st.label}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </main>
  );
}

function ScreenPage({ screen, stateId, seatId, variant }: { screen: ScreenDef; stateId: string | null; seatId: string | null; variant: Variant }) {
  const state = screen.states.find((s) => s.id === stateId) ?? screen.states[0]!;
  const seat = (screen.seats.find((s) => s === seatId) ?? screen.seats[0] ?? 'lena') as Seat;
  const [scene, send] = useScene(SCENES[state.scene]);
  const key = `${state.id}-${seat}-${variant}`;
  const at = (over: Record<string, string | undefined>) => href({ screen: screen.id, state: state.id, seat: screen.seats.length > 1 ? seat : undefined, variant: screen.id === 'p12' ? variant : undefined, ...over });
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-table p-6 text-ink" data-testid={`screen-${screen.id}`} data-state={state.id} data-seat={seat}>
      <header className="flex flex-col gap-2">
        <a href="?" className="text-sm font-semibold text-holo" data-testid="back-to-index">
          ← Index
        </a>
        <h1 className="font-display text-2xl font-semibold">{screen.title}</h1>
        <p className="font-mono text-xs text-ink-3">GRAFT TARGET: {screen.graft}</p>
      </header>
      <div className="flex flex-col gap-3">
        <div role="navigation" aria-label="State" className="flex flex-wrap gap-2">
          {screen.states.map((s) => (
            <Chip key={s.id} to={at({ state: s.id })} on={s.id === state.id} testid={`state-${s.id}`}>
              {s.label}
            </Chip>
          ))}
        </div>
        {screen.seats.length > 1 && (
          <div role="navigation" aria-label="Whose phone" className="flex flex-wrap gap-2">
            {SEATS.filter(([s]) => screen.seats.includes(s)).map(([s, label]) => (
              <Chip key={s} to={at({ seat: s })} on={s === seat} testid={`seat-${s}`}>
                {label}
              </Chip>
            ))}
          </div>
        )}
        {screen.id === 'p12' && (
          <div role="navigation" aria-label="Variant" className="flex flex-wrap gap-2">
            <Chip to={at({ variant: 'a' })} on={variant === 'a'} testid="variant-a">
              A · steppers
            </Chip>
            <Chip to={at({ variant: 'b' })} on={variant === 'b'} testid="variant-b">
              B · split bar
            </Chip>
          </div>
        )}
      </div>
      {screen.kind === 'tv' ? (
        <Tv key={key} scene={scene} />
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-6">
            <Phone key={`${key}-844`} seat={seat} scene={scene} w={844} h={390} variant={variant} desk={screen.desk} seed={state.seed} send={send} />
            <Phone key={`${key}-667`} seat={seat} scene={scene} w={667} h={375} variant={variant} desk={screen.desk} seed={state.seed} send={send} />
          </div>
          {screen.kind === 'monthEnd' ? (
            <Tv key={`${key}-tv`} scene={scene} />
          ) : (
            <Phone key={`${key}-1280`} seat={seat} scene={scene} w={1280} h={760} variant={variant} desk={screen.desk} seed={state.seed} send={send} />
          )}
        </>
      )}
      <p className="text-xs text-ink-3" data-testid="who-holds">
        {screen.kind === 'tv' ? 'The TV is public: no ballot reaches it.' : `${HOLDER[seat]}’s phone. Each phone sees only its own ballot.`}
      </p>
    </main>
  );
}

export default function App() {
  const q = new URLSearchParams(location.search);
  const screen = SCREENS.find((s) => s.id === q.get('screen'));
  if (!screen) return <Index />;
  return <ScreenPage screen={screen} stateId={q.get('state')} seatId={q.get('seat')} variant={q.get('variant') === 'b' ? 'b' : 'a'} />;
}
