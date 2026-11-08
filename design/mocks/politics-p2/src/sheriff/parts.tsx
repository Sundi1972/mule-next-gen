import { plotName } from '../../../../../apps/web/src/game/derive';
import type { IncidentView, MuleView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodIcon } from '@mule/ui';
import { useState } from 'react';
import { OnlyYou } from '../../../../../apps/web/src/phone/hub/OnlyYou';
import { Who } from '../../../../../apps/web/src/phone/hub/politics/parts';
import { STANDARD_FINE, type SheriffState } from '../fixture';

/**
 * The Sheriff's desk's pieces, shared by both variants: they differ in how the pieces are arranged, not in what each says.
 * Placement-neutral (PM, 8 Nov): the desk body only, for whichever tab WS6's shell gives it.
 */

type View = Pick<MuleView, 'players' | 'tiles' | 'width'>;

const name = (view: View, id: string | null) => view.players.find((p) => p.id === id)?.name ?? '';
const possessive = (n: string) => `${n}’s`;

/** What happened, in words: "Power cut on Ossa’s smithore plot", "Rumour: food up 25%". */
export function caseTitle(view: View, c: IncidentView): string {
  if (c.kind === 'rumour') return `Rumour: ${GOOD_NAME[c.good].toLowerCase()} ${c.dir === 'down' ? 'down' : 'up'} 25%`;
  return `Power cut on ${possessive(name(view, c.victim))} ${GOOD_NAME[c.good].toLowerCase()} plot`;
}

/** A case in a folded row's few words: "Cut: Kai’s energy plot", "Rumour: food up". */
export function caseShort(view: View, c: IncidentView): string {
  if (c.kind === 'rumour') return `Rumour: ${GOOD_NAME[c.good].toLowerCase()} ${c.dir === 'down' ? 'down' : 'up'}`;
  return `Cut: ${possessive(name(view, c.victim))} ${GOOD_NAME[c.good].toLowerCase()} plot`;
}

/** Which state a case is in, from the Sheriff's chair: what they can still do with it. */
export type CaseState = 'open' | 'cold' | 'fineable' | 'closed';
export function caseState(c: IncidentView, sheriff: SheriffState): CaseState {
  if (sheriff.fineable.includes(c.id)) return 'fineable';
  if (c.culprit !== null || c.fine) return 'closed';
  return c.investigated ? 'cold' : 'open';
}

/** One case's head: the good's icon, what happened, the month, and how it came out so far. */
export function CaseHead({ view, c, state, solved }: { view: View; c: IncidentView; state: CaseState; solved?: string | null }) {
  return (
    <div className="flex min-w-0 items-start gap-2" data-testid={`case-head-${c.id}`}>
      <GoodIcon good={c.good} size={16} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold leading-snug @min-[1100px]/shell:text-base" data-testid={`case-title-${c.id}`}>
          {caseTitle(view, c)}
        </span>
        <span className="text-[11px] text-ink-3 @min-[1100px]/shell:text-sm" data-testid={`case-meta-${c.id}`}>
          Month {c.month}
          {c.at && ` · plot ${plotName(c.at.x, c.at.y)}`}
          {c.worked ? ' · it worked' : ' · it failed'}
        </span>
      </div>
      <CaseChip view={view} c={c} state={state} solved={solved} />
    </div>
  );
}

/** The case's state in a word or two, on the right of its head. */
function CaseChip({ view, c, state, solved }: { view: View; c: IncidentView; state: CaseState; solved?: string | null }) {
  const culprit = solved ?? c.culprit;
  // A cold case wears no chip: it cannot be reopened (S4-RULE-7, WS7's tip, 8 Nov); its row says it went cold.
  if (solved === null || state === 'cold') return null;
  const [words, tone] =
    state === 'open' && !solved ? ['Unsolved', 'border-holo-line text-ink-2']
    : c.fine ? [`Fined ${c.fine.due} cr`, 'border-ok text-ok']
    : [`${name(view, culprit)} did it`, 'border-alert text-alert'];
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

/** Investigate: the button and, once the server answers, the verdict (Heiko, 7 Nov: half the time). */
export function Investigate({ view, c, left, result, onInvestigate }: { view: View; c: IncidentView; left: number; result: string | null | undefined; onInvestigate(): void }) {
  if (result !== undefined)
    return (
      <p className={cx('text-sm font-semibold', result ? 'text-alert' : 'text-ink-2')} role="status" data-testid={`investigate-result-${c.id}`}>
        {result ? `Solved: it was ${name(view, result)}.` : 'The trail went cold.'}
        {result && <span className="block text-xs font-normal text-ink-2">Everyone sees it now.</span>}
      </p>
    );
  return (
    <Button size="md" variant="outline" className="w-full" disabled={left === 0} onClick={onInvestigate} data-testid={`investigate-${c.id}`}>
      {left === 0 ? 'No investigation left this month' : 'Investigate · 1 a month'}
    </Button>
  );
}

/** Fine a revealed culprit: 50 to 300 in steps of 50, times the ban's multiplier; half to the victim, half to the fund. */
export function FineControl({ view, c, sheriff, onFine }: { view: View; c: IncidentView; sheriff: SheriffState; onFine(amount: number): void }) {
  const steps = sheriff.steps;
  const [i, setI] = useState(Math.min(1, steps.length - 1));
  const base = steps[i]!;
  const total = base * sheriff.multiplier;
  const culprit = name(view, c.culprit);
  return (
    <div className="flex flex-col gap-1" data-testid={`fine-${c.id}`}>
      {/* One row where it fits (WS6's 357 px sub-tab), the button under the stepper where it does not. */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="flex shrink-0 items-center gap-1">
          <Button size="md" variant="outline" className="w-11 shrink-0 px-0" aria-label="50 less" disabled={i === 0} onClick={() => setI(i - 1)} data-testid={`fine-down-${c.id}`}>
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
          <Button size="md" variant="outline" className="w-11 shrink-0 px-0" aria-label="50 more" disabled={i === steps.length - 1} onClick={() => setI(i + 1)} data-testid={`fine-up-${c.id}`}>
            +
          </Button>
        </span>
        <Button size="md" variant="danger" className="min-w-36 flex-1 whitespace-nowrap px-2" onClick={() => onFine(base)} data-testid={`fine-confirm-${c.id}`}>
          Fine {culprit} {total} cr
        </Button>
      </div>
      <span className="text-[11px] text-ink-3 @min-[1100px]/shell:text-sm" data-testid={`fine-split-${c.id}`}>
        {c.victim ? `${total / 2} cr to ${name(view, c.victim)}, ${total / 2} cr to the colony fund.` : `All ${total} cr to the colony fund: a rumour has no victim.`}
        {` Not fined by the end of planning: the standard ${STANDARD_FINE * sheriff.multiplier} cr.`}
        {/* WS7 confirmed 8 Nov: a rumour has no victim, so its whole fine stays in the fund (S4-RULE-8, sabotage.ts::levy). */}
      </span>
    </div>
  );
}

/** The fine sent: what everyone will see. */
export function Fined({ view, c, amount, multiplier }: { view: View; c: IncidentView; amount: number; multiplier: number }) {
  return (
    <p className="text-sm font-semibold text-ok" role="status" data-testid={`fined-${c.id}`}>
      Fined {name(view, c.culprit)} {amount * multiplier} cr. Everyone sees it at the month end.
    </p>
  );
}

/** Guards: how many are posted of how many, each guarded plot by owner, and the way to the map. */
export function GuardLine({ view, sheriff, onMap, compact = false }: { view: View; sheriff: SheriffState; onMap(): void; compact?: boolean }) {
  const posted = sheriff.guards.map((i) => view.tiles[i]!);
  const free = sheriff.max - posted.length;
  return (
    <div className="flex flex-col gap-1.5" data-testid="guard-line">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm @min-[1100px]/shell:text-base" data-testid="guard-count">
          <strong className="font-mono font-bold">{posted.length}</strong> of {sheriff.max} guards posted
          {!compact && <span className="text-ink-3"> · hidden until they catch someone</span>}
        </span>
      </div>
      {posted.length > 0 && (
        <ul className="flex flex-wrap gap-1" data-testid="guard-plots">
          {posted.map((t) => (
            <li key={`${t.x},${t.y}`} className="flex items-center gap-1 rounded-chip border border-holo-line bg-panel px-1.5 py-0.5 text-xs" data-testid={`guard-plot-${t.x}-${t.y}`}>
              <GuardGlyph />
              {t.owner && <Who view={view} id={t.owner} size={12} />}
              <span className="font-mono text-ink-3">{plotName(t.x, t.y)}</span>
            </li>
          ))}
        </ul>
      )}
      <Button size="md" variant={free > 0 ? 'holo' : 'outline'} className="w-full" onClick={onMap} data-testid="guard-open-map">
        {free > 0 ? `Post ${free === 1 ? 'a guard' : `${free} guards`} on the map` : 'Move guards on the map'}
      </Button>
    </div>
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
export function DeskHead({ sheriff }: { sheriff: SheriffState }) {
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
export function DeskWaits({ why }: { why: Exclude<SheriffState['canAct'], true> }) {
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

/**
 * Guards in one row (B, folded, 8 Nov): the count, each guarded plot, and the way to the map. Replaces B's 117 px guard
 * box in WS6's 309 px Sheriff sub-tab at 667 (measured).
 */
export function GuardRow({ view, sheriff, onMap }: { view: View; sheriff: SheriffState; onMap(): void }) {
  const posted = sheriff.guards.map((i) => view.tiles[i]!);
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
export function StepChip({ view, c, state, result, fined }: { view: View; c: IncidentView; state: CaseState; result: string | null | undefined; fined: number | undefined }) {
  if (result === null || (state === 'cold' && fined === undefined)) return null;
  const [words, tone] =
    fined !== undefined ? ['Fined', 'border-ok text-ok']
    : state === 'fineable' ? [`Fine ${name(view, c.culprit)}`, 'border-alert bg-alert-bg text-alert-ink']
    : state === 'open' ? ['Investigate', 'border-holo text-holo']
    : ['Closed', 'border-holo-line text-ink-3'];
  return (
    <span className={cx('shrink-0 whitespace-nowrap rounded-chip border px-1.5 text-[11px] font-semibold leading-5', tone)} data-testid={`step-chip-${c.id}`}>
      {words}
    </span>
  );
}

/** A case's details under its folded row: when, where, whether it worked. */
export function CaseMeta({ c, extra }: { c: IncidentView; extra?: string }) {
  return (
    <span className="text-[11px] text-ink-3 @min-[1100px]/shell:text-sm" data-testid={`case-meta-${c.id}`}>
      Month {c.month}
      {c.at && ` · plot ${plotName(c.at.x, c.at.y)}`}
      {c.worked ? ' · it worked' : ' · it failed'}
      {extra && ` · ${extra}`}
    </span>
  );
}
