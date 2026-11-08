import { POLITICS } from '@mule/engine';
import type { MuleView, OverruleView } from '@mule/protocol';
import { Button, cx, PlayerMark } from '@mule/ui';
import { toSlot } from '../../../../../apps/web/src/game/derive';
import { useClient } from '../../../../../apps/web/src/net/react';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { Who } from '../../../../../apps/web/src/phone/hub/politics/parts';
import { listNames, namer } from '../../../../../apps/web/src/phone/hub/politics/words';
import type { Now } from '../../../../../apps/web/src/phone/Shell';
import type { HubSeat, ReadyBarWords, StageSlot } from '../../../../../apps/web/src/phone/hub/slots';
import type { ReadyWords } from '../../../../../apps/web/src/phone/hub/ready';
import { neededWords, overruleQuestion, verdictWords } from './words';

/*
 * P13 · the overrule ballot and its reveal (moments 3–4), in the council's ballot place: the hub's stage, as the law
 * ballot takes it (COUNCIL_STAGE). Its look is LawBallot.tsx's CouncilBallot and PhoneReveal, line for line.
 *
 * GRAFT TARGET: a new apps/web/src/phone/hub/politics/OverruleBallot.tsx (the spec's "or a new OverruleBallot.tsx
 * mounted there"); OVERRULE_STAGE, overruleNow and overruleReadyWords go in politics/slots.ts and HUB_SLOTS' stage,
 * nows and readyWords, after the council's (S5-RULE-7 "order": the overrule is the month's last vote).
 */

const ballotOpen = ({ view }: Pick<HubSeat, 'view'>) => {
  const stage = view.politics?.overrule?.stage;
  return stage === 'ballot' || stage === 'reveal';
};

/** The ballot's stage body: the question, start against now, Yes and No, what it needs, who has cast; then the reveal. */
export function OverruleBallot() {
  const { view, self, me } = usePhoneGame();
  const client = useClient();
  const o = view.politics!.overrule!;
  if (o.stage === 'reveal' && o.result) return <OverruleReveal view={view} o={o} result={o.result} />;
  const mine = me.politics?.overruleBallot ?? null;
  const weight = view.politics!.weights.find((w) => w.id === self.id)?.votes ?? POLITICS.weight.base;
  const q = overruleQuestion(o);
  const preset = self.id === o.caller ? 'Your ballot starts at Yes: you called it.' : self.id === view.politics!.governor ? 'Your ballot starts at No: it is your tax.' : null;
  return (
    <section className="flex flex-col gap-2 rounded-panel border-2 border-holo bg-panel p-3" data-testid="overrule-ballot">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps text-[10px]!">The overrule vote · month {view.month}</span>
        <span className="text-[11px] text-ink-2" data-testid="overrule-weight">
          Your vote weighs <strong className="text-ink">{weight}</strong>
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-xs">
          <Who view={view} id={o.caller} me={self.id} size={14} /> called it on the Governor’s tax
        </span>
        <span className="font-display text-xl font-semibold leading-tight" data-testid="overrule-question">
          {q.question}
        </span>
        <span className="font-mono text-sm font-bold" data-testid="overrule-start-now">
          {q.startNow}
        </span>
      </span>
      <span className="text-[11px] leading-snug text-ink-2" data-testid="overrule-means">
        Yes puts it back to {q.restore}% before anything is sold this month. No keeps {q.now}%.
      </span>
      <span className="grid grid-cols-2 gap-2">
        <Button size="md" variant={mine === true ? 'holo' : 'outline'} aria-pressed={mine === true} onClick={() => client.intent({ type: 'voteOverrule', yes: true })} data-testid="overrule-yes">
          Yes, undo it
        </Button>
        <Button size="md" variant={mine === false ? 'holo' : 'outline'} aria-pressed={mine === false} onClick={() => client.intent({ type: 'voteOverrule', yes: false })} data-testid="overrule-no">
          No, keep it
        </Button>
      </span>
      {preset && (
        <span className="text-[11px] text-ink-2" data-testid="overrule-preset">
          {preset}
        </span>
      )}
      <span className="text-sm font-semibold" data-testid="overrule-needed">
        It {neededWords(o)}: more than half of all votes, so a vote not cast counts against it.
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-2" data-testid="overrule-cast">
        Cast:
        {o.done.map((id) => {
          const p = view.players.find((q) => q.id === id);
          return p && <PlayerMark key={id} slot={toSlot(p.slot)} species={p.species} size={14} label={p.name} />;
        })}
        · {o.done.length} of {view.players.length}. Never shown: how.
      </span>
      {o.waitingFor.length > 0 && o.done.includes(self.id) && (
        <span className="text-[11px] text-ink-2" data-testid="overrule-waiting">
          Waiting for {o.waitingFor.length}: {listNames(o.waitingFor, self.id, namer(view))}. Change your vote until the last one is in.
        </span>
      )}
    </section>
  );
}

/** The result on the phone, as on the TV: the stamp, the totals and what happens now (S5-RULE-8 "public"). */
function OverruleReveal({ view, o, result: r }: { view: MuleView; o: OverruleView; result: NonNullable<OverruleView['result']> }) {
  const v = verdictWords(o, r);
  return (
    <section className={cx('flex flex-col items-start gap-2 rounded-panel border-2 bg-panel p-3', r.passed ? 'border-ok' : 'border-alert')} data-testid="overrule-reveal" data-passed={r.passed}>
      <span className="label-caps text-[10px]!">The overrule vote · month {view.month}</span>
      <span className="text-sm">{overruleQuestion(o).question}</span>
      <span className={cx('rounded-control border-2 px-3 font-display text-3xl font-bold uppercase tracking-wider', r.passed ? 'border-ok text-ok' : 'border-alert text-alert')} data-testid="overrule-stamp">
        {v.stamp}
      </span>
      <span className="text-sm font-semibold" data-testid="overrule-verdict">
        {v.line}
      </span>
      <span className="text-[11px] text-ink-2">Totals only: nobody sees how anyone voted. Then the land grant.</span>
    </section>
  );
}

/** The rail beside the ballot: the tax's month in numbers and the rule, so a voter sees what Yes and No mean. */
export function OverruleRail() {
  const { view } = usePhoneGame();
  const o = view.politics!.overrule!;
  const q = overruleQuestion(o);
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-2" data-testid="overrule-rail">
      <span className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5 text-xs">
        <span className="label-caps text-[10px]!">Began</span>
        <span data-num className="font-mono font-bold" data-testid="overrule-rail-start">
          {q.restore}% sales tax
        </span>
        <span className="label-caps text-[10px]!">Now</span>
        <span data-num className="font-mono font-bold" data-testid="overrule-rail-now">
          {q.now}% sales tax
        </span>
      </span>
      <span className="text-[11px] text-ink-2">
        An overrule passes on more than half of all the table’s votes, by vote weight: {o.needed} of {o.total}. One a month. It takes effect once the result is shown.
      </span>
    </div>
  );
}

export const OVERRULE_STAGE: StageSlot = { id: 'overrule-ballot', show: ballotOpen, phase: () => 'Overrule vote', Body: OverruleBallot, Rail: OverruleRail };

const STILL = 'Still waiting for';
/** AM-5's Ready words: open and not cast, "Cast my vote" (as the election's ballot); cast, "Waiting for the overrule vote". */
const OVERRULE_WORDS: ReadyWords = {
  ready: 'Cast my vote',
  done: 'Waiting for the overrule vote',
  waiting: STILL,
  all: 'Everyone has cast. The result is shown.',
  confirm: () => 'Close the vote now? Votes not cast count against undoing it, and the result is shown.',
};
/** The reveal's: Continue, then who the land grant waits for. */
const REVEAL_WORDS: ReadyWords = {
  ready: 'Continue',
  done: 'Waiting for the others',
  waiting: STILL,
  all: 'Everyone is on. The land grant starts.',
  confirm: () => 'Go on to the land grant now?',
};

/** The ready bar in the overrule ballot and its reveal: Cast my vote, live once this seat has a Yes or No (the caller's and Governor's start set); then Continue. */
export function overruleReadyWords({ view, me }: HubSeat): ReadyBarWords | null {
  const stage = view.politics?.overrule?.stage;
  if (stage === 'reveal') return { ...REVEAL_WORDS, label: 'READY', canReady: true };
  if (stage !== 'ballot') return null;
  return { ...OVERRULE_WORDS, label: 'VOTED', canReady: (me.politics?.overruleBallot ?? null) !== null };
}

/** Now through the ballot and its reveal. */
export function overruleNow({ view, self }: HubSeat): Now | null {
  const o = view.politics?.overrule;
  if (!o || (o.stage !== 'ballot' && o.stage !== 'reveal')) return null;
  if (o.stage === 'reveal') return { step: 2, of: 2, title: 'The result', detail: 'On the TV and every phone at once.' };
  const left = o.waitingFor.filter((id) => id !== self.id);
  if (o.done.includes(self.id))
    return {
      step: 1,
      of: 2,
      title: left.length ? `You voted. Waiting for ${left.length}: ${listNames(left, null, namer(view))}` : 'Everyone has voted',
      detail: 'Change your vote until the last one is in, or until the host closes the vote for someone who is away.',
    };
  return { step: 1, of: 2, title: 'Undo the Governor’s tax?', detail: 'Yes or No, then Cast my vote. Nobody sees how you voted. No clock: it closes once everyone has cast.' };
}
