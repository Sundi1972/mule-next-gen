import { POLITICS } from '@mule/engine';
import type { IncidentView, MuleView, MyPoliticsView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodIcon, HoloMap, type MapTile } from '@mule/ui';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { mapTiles, plotName } from '../../../game/derive';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { MapFit, useWide } from '../../Shell';
import { useHub } from '../Hub';
import { OnlyYou } from '../OnlyYou';
import type { DeskSlot, HubSeat, PlotPickSlot, SubTabSlot, TabHubNav } from '../slots';
import { Who } from './parts';

/**
 * The Sheriff's desk (slice 4, S4-C15, P7 and P8), from the approved mock design/mocks/politics-p2 @ d6977e1a, variant B
 * folded (Heiko, 8 Nov): the case file. Guards are one row at the top; every sabotage the colony has seen is one case, a
 * 44 px row with its next step on a chip: Investigate while unsolved, Fine once revealed, nothing once cold. A tap opens
 * one case in place, scrolled just into view; a case acted on keeps its place and only its step changes. Closed and cold
 * cases fold under one line. The verdicts and the fines come from the server's next view, never from this phone.
 *
 * Guarding (P8, ruled by the PM 8 Nov): one map, the hub's. "Guard a plot" turns it to Guard under a "Guarding · back to
 * Sheriff" bar; a tap posts or lifts; Done sends the whole list. The marks are on the Sheriff's map only. Until WS6's
 * tabbed shell gives the hub desk-only tools, Guard rides on the hub's own door: the Sheriff's desk opened with the
 * focus 'guard' (useGuarding), the map tool Look's map showing GuardMap meanwhile (today.tsx).
 *
 * The tabbed hub (SB-4, against SB-1a's frozen slots): SHERIFF_SUB is the Sheriff sub-tab of the Governor / Council tab,
 * GUARD_PICK the Guard pick it hands to Overview's map. Both read the hub's navigation, SB-1a.2's frozen TabHubNav, from
 * PickNavProvider, which the tabbed hub supplies (it moves into the hub's own context when SB-2 grafts it); today's
 * SHERIFF_DESK and GuardMap stay for today's hub until the tabbed one replaces it.
 */

type Sheriff = NonNullable<MyPoliticsView['sheriff']>;
type View = Pick<MuleView, 'players' | 'tiles' | 'width'>;

const name = (view: Pick<MuleView, 'players'>, id: string | null) => view.players.find((p) => p.id === id)?.name ?? '';
const possessive = (n: string) => `${n}’s`;
/** The crop's word and a space; empty when the crop is unknown (good null, WS7's #746: only ever in an orderer's own list). */
const crop = (c: IncidentView) => (c.good ? `${GOOD_NAME[c.good].toLowerCase()} ` : '');
const shift = () => `${Math.round(POLITICS.sabotage.orders.rumour.shift * 100)}%`;

/** What happened, in words: "Power cut on Ossa’s smithore plot", "Rumour: food up 25%". */
export function caseTitle(view: View, c: IncidentView): string {
  if (c.kind === 'rumour') return `Rumour: ${crop(c)}${c.dir === 'down' ? 'down' : 'up'} ${shift()}`;
  return `Power cut on ${possessive(name(view, c.victim))} ${crop(c)}plot`;
}

/** A case in a folded row's few words: "Cut: Kai’s energy plot", "Rumour: food up". */
export function caseShort(view: View, c: IncidentView): string {
  if (c.kind === 'rumour') return `Rumour: ${crop(c)}${c.dir === 'down' ? 'down' : 'up'}`;
  return `Cut: ${possessive(name(view, c.victim))} ${crop(c)}plot`;
}

/** Which state a case is in, from the Sheriff's chair: what they can still do with it. */
export type CaseState = 'open' | 'cold' | 'fineable' | 'closed';
export function caseState(c: IncidentView, sheriff: Pick<Sheriff, 'fineable'>): CaseState {
  if (sheriff.fineable.includes(c.id)) return 'fineable';
  if (c.culprit !== null || c.fine) return 'closed';
  return c.investigated ? 'cold' : 'open';
}

/** One case's head, in the closed-or-cold list: the good's icon, what happened, the month, and how it came out. */
function CaseHead({ view, c, state }: { view: View; c: IncidentView; state: CaseState }) {
  return (
    <div className="flex min-w-0 items-start gap-2" data-testid={`case-head-${c.id}`}>
      {c.good && <GoodIcon good={c.good} size={16} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold leading-snug @min-[1100px]/shell:text-base" data-testid={`case-title-${c.id}`}>
          {caseTitle(view, c)}
        </span>
        <CaseMeta c={c} />
      </div>
      <CaseChip view={view} c={c} state={state} />
    </div>
  );
}

/** The case's state in a word or two, on the right of its head. */
function CaseChip({ view, c, state }: { view: View; c: IncidentView; state: CaseState }) {
  // A cold case wears no chip: it cannot be reopened (S4-RULE-7); its row says it went cold.
  if (state === 'cold') return null;
  const [words, tone] =
    state === 'open' ? ['Unsolved', 'border-holo-line text-ink-2'] : c.fine ? [`Fined ${c.fine.due} cr`, 'border-ok text-ok'] : [`${name(view, c.culprit)} did it`, 'border-alert text-alert'];
  return (
    <span className={cx('shrink-0 whitespace-nowrap rounded-chip border px-1.5 font-mono text-[10px] font-bold uppercase leading-4 @min-[1100px]/shell:text-xs', tone)} data-testid={`case-chip-${c.id}`}>
      {words}
    </span>
  );
}

/** How the culprit was found, for a revealed case. */
export function howFound(c: IncidentView): string {
  if (c.how === 'guard') return 'Your guard caught them.';
  if (c.how === 'caught') return 'Caught in the act.';
  if (c.how === 'investigation') return 'Your investigation found them.';
  return '';
}

/** A case's details under its folded row: when, where, whether it worked. */
function CaseMeta({ c, extra }: { c: IncidentView; extra?: string }) {
  return (
    <span className="text-[11px] text-ink-3 @min-[1100px]/shell:text-sm" data-testid={`case-meta-${c.id}`}>
      Month {c.month}
      {c.at && ` · plot ${plotName(c.at.x, c.at.y)}`}
      {c.worked ? ' · it worked' : ' · it failed'}
      {extra && ` · ${extra}`}
    </span>
  );
}

/**
 * Investigate: the button and, once the server answers, the verdict (Heiko, 7 Nov: half the time). `result` is the
 * culprit found, null for a cold trail, undefined while there is none; `asked` while the server has not answered.
 */
function Investigate({ view, c, left, result, asked, onInvestigate }: { view: View; c: IncidentView; left: number; result: string | null | undefined; asked: boolean; onInvestigate(): void }) {
  if (result !== undefined)
    return (
      <p className={cx('text-sm font-semibold', result ? 'text-alert' : 'text-ink-2')} role="status" data-testid={`investigate-result-${c.id}`}>
        {result ? `Solved: it was ${name(view, result)}.` : 'The trail went cold.'}
        {result && <span className="block text-xs font-normal text-ink-2">Everyone sees it now.</span>}
      </p>
    );
  return (
    <Button size="md" variant="outline" className="w-full" disabled={left === 0 || asked} onClick={onInvestigate} data-testid={`investigate-${c.id}`}>
      {asked ? 'Investigating…' : left === 0 ? 'No investigation left this month' : 'Investigate · 1 a month'}
    </Button>
  );
}

/** Fine a revealed culprit: the server's steps, times the ban's multiplier; the victim's share to them, the rest to the fund. */
function FineControl({ view, c, sheriff, asked, onFine }: { view: View; c: IncidentView; sheriff: Sheriff; asked: boolean; onFine(amount: number): void }) {
  const steps = sheriff.steps;
  const [i, setI] = useState(Math.min(1, steps.length - 1));
  const base = steps[i]!;
  const total = base * sheriff.multiplier;
  const toVictim = Math.round(total * POLITICS.sheriff.victimShare);
  const culprit = name(view, c.culprit);
  return (
    <div className="flex flex-col gap-1" data-testid={`fine-${c.id}`}>
      {/* One row where it fits (WS6's 357 px sub-tab), the button under the stepper where it does not. */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="flex shrink-0 items-center gap-1">
          <Button size="md" variant="outline" className="w-11 shrink-0 px-0" aria-label={`${steps[1]! - steps[0]!} less`} disabled={i === 0} onClick={() => setI(i - 1)} data-testid={`fine-down-${c.id}`}>
            −
          </Button>
          <span className="flex h-11 w-16 shrink-0 flex-col items-center justify-center">
            <span data-num className="font-mono text-xl font-bold leading-none" data-testid={`fine-value-${c.id}`}>
              {total}
            </span>
            {sheriff.multiplier > 1 && (
              <span className="font-mono text-[10px] text-ink-3" data-testid={`fine-multiplier-${c.id}`}>
                {base} × {sheriff.multiplier} ban
              </span>
            )}
          </span>
          <Button size="md" variant="outline" className="w-11 shrink-0 px-0" aria-label={`${steps[1]! - steps[0]!} more`} disabled={i === steps.length - 1} onClick={() => setI(i + 1)} data-testid={`fine-up-${c.id}`}>
            +
          </Button>
        </span>
        <Button size="md" variant="danger" className="min-w-36 flex-1 whitespace-nowrap px-2" disabled={asked} onClick={() => onFine(base)} data-testid={`fine-confirm-${c.id}`}>
          Fine {culprit} {total} cr
        </Button>
      </div>
      <span className="text-[11px] text-ink-3 @min-[1100px]/shell:text-sm" data-testid={`fine-split-${c.id}`}>
        {/* A rumour has no victim, so its whole fine stays in the fund (S4-RULE-8, sabotage.ts::levy). */}
        {c.victim ? `${toVictim} cr to ${name(view, c.victim)}, ${total - toVictim} cr to the colony fund.` : `All ${total} cr to the colony fund: a rumour has no victim.`}
        {` Not fined by the end of planning: the standard ${POLITICS.sheriff.fine.standard * sheriff.multiplier} cr.`}
      </span>
    </div>
  );
}

/** The fine levied: what everyone will see, from the server's case. */
function Fined({ view, c }: { view: View; c: IncidentView }) {
  return (
    <p className="text-sm font-semibold text-ok" role="status" data-testid={`fined-${c.id}`}>
      Fined {name(view, c.culprit)} {c.fine!.due} cr. Everyone sees it at the month end.
    </p>
  );
}

/** The shield a guarded plot wears, on the desk and on the Sheriff's map. */
export function GuardGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="text-holo">
      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
    </svg>
  );
}

/** The desk's head: the office, Only you, and what this month still allows. */
function DeskHead({ sheriff }: { sheriff: Sheriff }) {
  return (
    <div className="flex items-center justify-between gap-2" data-testid="sheriff-head">
      <span className="flex items-center gap-1.5">
        <span className="label-caps @min-[1100px]/shell:text-xs!">Sheriff</span>
        <OnlyYou />
      </span>
      <span className="font-mono text-[11px] text-ink-2 @min-[1100px]/shell:text-sm" data-testid="sheriff-left">
        {sheriff.investigationsLeft === 0 ? 'One investigation a month: used' : `${sheriff.investigationsLeft} investigation${sheriff.investigationsLeft === 1 ? '' : 's'} left`}
      </span>
    </div>
  );
}

/** Before the votes are counted the desk has nothing to do yet: say so, and why. */
function DeskWaits({ why }: { why: Exclude<Sheriff['canAct'], true> }) {
  const words = {
    votesOpen: 'Votes are open. Your guards, investigation and fines wait until they are counted, in case the colony elects someone else.',
    notPlanning: 'The Sheriff acts in planning. Your guards stand until the month ends.',
    off: 'Sabotage is off at this table.',
  }[why];
  return (
    <p className="rounded-panel border border-holo-line bg-panel p-2.5 text-sm text-ink-2" role="status" data-testid={`sheriff-waits-${why}`}>
      {words}
    </p>
  );
}

/** Guards in one row (B folded): the count, each guarded plot by owner, and the way to the map. */
function GuardRow({ view, sheriff, onMap }: { view: View; sheriff: Sheriff; onMap(): void }) {
  const posted = sheriff.guards.map((i) => view.tiles[i]).filter((t) => t !== undefined);
  const free = sheriff.max - posted.length;
  return (
    <div className="flex items-center gap-1.5" data-testid="guard-line">
      <GuardGlyph size={14} />
      <span className="shrink-0 text-sm" data-testid="guard-count">
        <strong className="font-mono font-bold">{posted.length}</strong>/{sheriff.max}
      </span>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-1" data-testid="guard-plots" aria-label="Guarded plots">
        {posted.map((t) => (
          <li key={`${t.x},${t.y}`} className="flex items-center gap-1 rounded-chip border border-holo-line bg-panel px-1 text-[11px]" data-testid={`guard-plot-${t.x}-${t.y}`}>
            {t.owner && <Who view={view} id={t.owner} size={12} />}
            <span className="font-mono text-ink-3">{plotName(t.x, t.y)}</span>
          </li>
        ))}
      </ul>
      <Button size="md" variant={free > 0 ? 'holo' : 'outline'} className="shrink-0 px-3" onClick={onMap} data-testid="guard-open-map">
        {free > 0 ? 'Guard a plot' : 'Move guards'}
      </Button>
    </div>
  );
}

/** A folded case's next step, in its row: what the Sheriff can do with it, or how it came out. */
function StepChip({ view, c, state, result, fined }: { view: View; c: IncidentView; state: CaseState; result: string | null | undefined; fined: boolean }) {
  if (result === null || (state === 'cold' && !fined)) return null;
  const [words, tone] = fined
    ? ['Fined', 'border-ok text-ok']
    : state === 'fineable'
      ? [`Fine ${name(view, c.culprit)}`, 'border-alert bg-alert-bg text-alert-ink']
      : state === 'open'
        ? ['Investigate', 'border-holo text-holo']
        : ['Closed', 'border-holo-line text-ink-3'];
  return (
    <span className={cx('shrink-0 whitespace-nowrap rounded-chip border px-1.5 text-[11px] font-semibold leading-5', tone)} data-testid={`step-chip-${c.id}`}>
      {words}
    </span>
  );
}

/** The id of the newest toast on the phone, -1 for none: a refusal from the server arrives as one. */
function useNewestToast(): number {
  const client = useClient();
  const newest = () => client.getState().toasts.at(-1)?.id ?? -1;
  return useSyncExternalStore(client.subscribe, newest, newest);
}

/**
 * What this phone asked of a case this month, the newest toast then, and whether a refusal has come since: a toast newer
 * than the ask ends the wait for good, though the toast itself is dismissed a few seconds later.
 */
type Asked = Record<string, { kind: 'investigate' | 'fine'; toast: number; refused: boolean }>;

const ORDER: Record<CaseState, number> = { fineable: 0, open: 1, cold: 2, closed: 3 };

/** The Sheriff's desk, on the sitting Sheriff's phone, in today's hub: Guard mode is the desk opened with focus 'guard'. */
export function SheriffDesk() {
  const nav = useHub();
  const guard = () => {
    nav.pickTool('look');
    nav.openDesk('sheriff', GUARD_FOCUS);
  };
  return <DeskBody onGuard={guard} />;
}

/** The desk's body for the Sheriff: the waits before the votes are counted, else the case file; `onGuard` opens Guard mode. */
function DeskBody({ onGuard }: { onGuard(): void }) {
  const { view, me } = usePhoneGame();
  const sheriff = me.politics?.sheriff;
  if (!sheriff) return null;
  if (sheriff.canAct !== true)
    return (
      <>
        <DeskHead sheriff={sheriff} />
        <DeskWaits why={sheriff.canAct} />
      </>
    );
  return <CaseFile view={view} sheriff={sheriff} incidents={view.politics?.sabotage?.incidents ?? []} onGuard={onGuard} />;
}

function CaseFile({ view, sheriff, incidents, onGuard }: { view: MuleView; sheriff: Sheriff; incidents: IncidentView[]; onGuard(): void }) {
  const client = useClient();
  const newestToast = useNewestToast();
  const [asked, setAsked] = useState<Asked>({});
  const [history, setHistory] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Where each live case first stood: a case acted on keeps its place, so it does not jump from under the thumb.
  const places = useRef<string[]>([]);
  const ask = (id: string, kind: Asked[string]['kind']) => setAsked((a) => ({ ...a, [id]: { kind, toast: newestToast, refused: false } }));
  // Latch a refusal: once a newer toast is seen, the wait is over even after the toast is gone.
  useEffect(() => {
    setAsked((a) => {
      const late = Object.entries(a).filter(([, e]) => !e.refused && newestToast > e.toast);
      return late.length === 0 ? a : { ...a, ...Object.fromEntries(late.map(([id, e]) => [id, { ...e, refused: true }])) };
    });
  }, [newestToast]);
  const touched = (id: string) => id in asked;
  const cases = incidents.map((c) => {
    const state = caseState(c, sheriff);
    const a = asked[c.id];
    // The verdict is the server's: the culprit its investigation named, or the trail gone cold.
    const result = a?.kind === 'investigate' ? (c.culprit !== null && c.how === 'investigation' ? c.culprit : c.investigated && c.culprit === null ? null : undefined) : undefined;
    const fined = a?.kind === 'fine' && c.fine !== null;
    const waiting = a !== undefined && result === undefined && !fined && !a.refused && newestToast <= a.toast;
    return { c, state, result, fined, waiting };
  });
  const live = cases.filter((k) => k.state === 'open' || k.state === 'fineable' || touched(k.c.id));
  const past = cases.filter((k) => !live.includes(k));
  const fresh = [...live].sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.c.month - a.c.month).map((k) => k.c.id);
  const kept = places.current.filter((id) => fresh.includes(id));
  places.current = [...kept, ...fresh.filter((id) => !kept.includes(id))];
  live.sort((a, b) => places.current.indexOf(a.c.id) - places.current.indexOf(b.c.id));
  return (
    <div className="flex flex-col gap-2" data-testid="sheriff-desk-b">
      <DeskHead sheriff={sheriff} />
      <div data-testid="b-guard">
        <GuardRow view={view} sheriff={sheriff} onMap={onGuard} />
      </div>
      <section className="flex flex-col gap-1" data-testid="b-cases">
        <h3 className="label-caps flex items-center gap-1.5 @min-[1100px]/shell:text-xs!">Cases</h3>
        {live.length === 0 && (
          <p className="text-xs text-ink-3" data-testid="b-no-cases">
            No open case: nothing to investigate or fine.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {live.map(({ c, state, result, fined, waiting }) => {
            const open = openId === c.id;
            return (
              <li key={c.id} className={cx('flex flex-col rounded-panel border bg-panel', state === 'fineable' ? 'border-alert' : 'border-holo-line')} data-testid={`b-case-${c.id}`}>
                <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : c.id)} className="flex min-h-11 items-center gap-2 px-2 text-left" data-testid={`b-case-row-${c.id}`}>
                  {c.good && <GoodIcon good={c.good} size={16} />}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{caseShort(view, c)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-3">M{c.month}</span>
                  <StepChip view={view} c={c} state={state} result={result} fined={fined} />
                </button>
                {open && (
                  <div ref={(el) => el?.scrollIntoView?.({ block: 'nearest' })} className="flex flex-col gap-1.5 border-t border-holo-faint p-2" data-testid={`b-case-body-${c.id}`}>
                    <CaseMeta c={c} extra={state === 'fineable' && result === undefined ? howFound(c) : undefined} />
                    {result !== undefined && <Investigate view={view} c={c} left={0} result={result} asked={false} onInvestigate={() => {}} />}
                    {state === 'open' && result === undefined && (
                      <Investigate
                        view={view}
                        c={c}
                        left={sheriff.investigationsLeft}
                        result={undefined}
                        asked={waiting}
                        onInvestigate={() => {
                          client.intent({ type: 'investigate', order: c.id });
                          ask(c.id, 'investigate');
                        }}
                      />
                    )}
                    {state === 'fineable' && (
                      <FineControl
                        view={view}
                        c={c}
                        sheriff={sheriff}
                        asked={waiting}
                        onFine={(amount) => {
                          client.intent({ type: 'fine', order: c.id, amount });
                          ask(c.id, 'fine');
                        }}
                      />
                    )}
                    {fined && <Fined view={view} c={c} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {past.length > 0 && (
          <>
            <button type="button" onClick={() => setHistory((h) => !h)} aria-expanded={history} className="flex min-h-11 items-center gap-1 text-xs font-semibold text-holo" data-testid="b-history-toggle">
              {history ? 'Hide' : 'Show'} {past.length} closed or cold
            </button>
            {history && (
              <ul className="flex flex-col gap-1.5" data-testid="b-history">
                {past.map(({ c, state }) => (
                  <li key={c.id} className="rounded-panel border border-holo-faint p-2 opacity-80" data-testid={`b-past-${c.id}`}>
                    <CaseHead view={view} c={c} state={state} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** The Sheriff's desk's focus while its guards are being picked on the map. */
const GUARD_FOCUS = 'guard';

/** Whether the hub's map is in Guard mode: the Sheriff's desk open to pick its guards. */
export function useGuarding(): boolean {
  const nav = useHub();
  const { me } = usePhoneGame();
  return !!me.politics?.sheriff && nav.desk === SHERIFF_DESK.id && nav.focus === GUARD_FOCUS;
}

/** Guard mode in today's hub: Done sends the list and takes the desk's focus, so Look's map comes back. */
export function GuardMap() {
  const client = useClient();
  const nav = useHub();
  return (
    <GuardPicker
      onDone={(tiles) => {
        client.intent({ type: 'guard', tiles });
        nav.takeFocus();
      }}
    />
  );
}

/**
 * The hub's one map in Guard mode, under its bar: a tap on any player's plot posts or lifts a guard, marked with the
 * shield on this map only. Done hands over the whole list (intent `guard {tiles}`), for the caller to send and go back.
 */
function GuardPicker({ onDone }: { onDone(tiles: number[]): void }) {
  const { view, me } = usePhoneGame();
  const wide = useWide();
  const sheriff = me.politics!.sheriff!;
  const [guards, setGuards] = useState(sheriff.guards);
  const [hint, setHint] = useState<string | null>(null);
  const tiles: MapTile[] = mapTiles(view).map((t) => (guards.includes(t.y * view.width + t.x) ? { ...t, flag: 'guard' } : t));
  const tap = (t: MapTile) => {
    const i = t.y * view.width + t.x;
    setHint(null);
    if (guards.includes(i)) return setGuards(guards.filter((g) => g !== i));
    if (view.tiles[i]?.owner == null) return setHint('Guards stand on players’ plots.');
    if (guards.length >= sheriff.max) return setHint(`All ${sheriff.max} guards are out. Tap a guarded plot to lift one.`);
    setGuards([...guards, i]);
  };
  const done = () => onDone(guards);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5" data-testid="guard-map">
      <div className="flex items-center gap-2 rounded-control border border-holo bg-holo-soft px-2 py-1" data-testid="guard-bar">
        <GuardGlyph size={14} />
        <span className="flex-1 text-sm font-semibold" data-testid="guard-bar-words">
          Guarding · <span data-num className="font-mono">{guards.length}</span> of {sheriff.max}
        </span>
        <OnlyYou />
        <Button size="md" variant="holo" className="shrink-0 px-3" onClick={done} data-testid="guard-back">
          Done · back to Sheriff
        </Button>
      </div>
      <MapFit width={view.width} height={view.height}>
        <HoloMap width={view.width} height={view.height} tiles={tiles} onTile={tap} density={wide ? 'tv' : 'phone'} />
      </MapFit>
      <p className="min-h-4 text-[11px] text-ink-2" role="status" data-testid="guard-hint">
        {hint ?? 'Tap a plot to post a guard there this month. A power cut on a guarded plot fails, and the saboteur is caught.'}
      </p>
      <GuardedList view={view} guards={guards} />
    </div>
  );
}

/** The plots guarded so far in Guard mode, by owner. */
function GuardedList({ view, guards }: { view: MuleView; guards: number[] }) {
  if (guards.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" data-testid="guard-map-list">
      {guards.map((i) => {
        const t = view.tiles[i];
        if (!t) return null;
        return (
          <li key={i} className="flex items-center gap-1 rounded-chip border border-holo-line bg-panel px-1.5 py-0.5 text-xs">
            <GuardGlyph />
            {t.owner && <Who view={view} id={t.owner} size={12} />}
            <span className="font-mono text-ink-3">{plotName(t.x, t.y)}</span>
          </li>
        );
      })}
    </ul>
  );
}

const isSheriff = ({ me }: HubSeat) => !!me.politics?.sheriff;

/** The Sheriff's desk in the hub: the holder's alone, and first in line, like the Governor's. */
export const SHERIFF_DESK: DeskSlot = {
  id: 'sheriff',
  label: 'Sheriff',
  icon: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z',
  locked: true,
  Body: SheriffDesk,
  show: isSheriff,
  first: isSheriff,
};

const PickNavContext = createContext<TabHubNav | null>(null);

/** Hands the tabbed hub's navigation (SB-1a.2's TabHubNav) to the Sheriff sub-tab and the Guard pick. */
export function PickNavProvider({ value, children }: { value: TabHubNav; children?: ReactNode }) {
  return <PickNavContext.Provider value={value}>{children}</PickNavContext.Provider>;
}

function usePickNav(): TabHubNav {
  const nav = useContext(PickNavContext);
  if (!nav) throw new Error('Not inside the tabbed hub');
  return nav;
}

/** The Sheriff sub-tab's body: the folded case file; "Guard a plot" hands Overview's map the Guard pick. */
function SheriffSub() {
  const nav = usePickNav();
  return <DeskBody onGuard={() => nav.startPick(GUARD_PICK.id)} />;
}

/** The Guard pick's map, with its own bar: Done sends the list, ends the pick and opens the way back to the Sheriff sub-tab. */
function GuardPickMap() {
  const { me } = usePhoneGame();
  const client = useClient();
  const nav = usePickNav();
  if (!me.politics?.sheriff) return null;
  return (
    <GuardPicker
      onDone={(tiles) => {
        client.intent({ type: 'guard', tiles });
        nav.endPick();
        const { label: _label, ...door } = GUARD_PICK.back;
        nav.open(door);
      }}
    />
  );
}

/** The Sheriff sub-tab of the Governor / Council tab: the holder's alone (SB-4). */
export const SHERIFF_SUB: SubTabSlot = { id: 'sheriff', label: () => 'Sheriff', Body: SheriffSub, show: isSheriff };

/** The Sheriff's Guard (P8, PM ruling 8 Nov): a pick the Sheriff sub-tab hands to Overview's one map, drawing its own bar. */
export const GUARD_PICK: PlotPickSlot = {
  id: 'guard',
  label: 'Guarding',
  hint: () => 'Tap a plot to guard it',
  back: { tab: 'politics', sub: SHERIFF_SUB.id, label: 'Sheriff' },
  ownBar: true,
  Map: GuardPickMap,
  show: isSheriff,
};
