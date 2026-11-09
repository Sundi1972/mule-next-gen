import { POLITICS } from '@mule/engine';
import type { MuleView, OverruleView } from '@mule/protocol';
import { Button, cx, PlayerMark } from '@mule/ui';
import { toSlot } from '../../../../game/derive';
import { useClient } from '../../../../net/react';
import { usePhoneGame } from '../../../game';
import { Who } from '../parts';
import { listNames, namer } from '../words';
import { neededWords, overruleQuestion, verdictWords } from './words';

/* The overrule ballot and its reveal, in the law ballot's look (CouncilBallot and PhoneReveal). Stage, ready bar and Now words are in ../slots.ts. */

export const ballotOpen = ({ view }: { view: MuleView }) => {
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
