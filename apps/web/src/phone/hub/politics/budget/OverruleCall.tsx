import { Button } from '@mule/ui';
import { useClient } from '../../../../net/react';
import { usePhoneGame } from '../../../game';
import type { HubSeat } from '../../slots';
import { neededWords, OVERRULE_REFUSAL } from './words';

/** The tax overrule call this month, in planning, or null. */
const pendingCall = ({ view }: Pick<HubSeat, 'view'>) => {
  const o = view.politics?.overrule;
  return view.phase === 'planning' && o?.target === 'tax' && o.stage === 'called' ? o : null;
};

/** At the tax line: the change this month, then Call, or the call as it stands. Nothing while the tax is as it began. */
export function OverruleCall() {
  const { view, self, me } = usePhoneGame();
  const client = useClient();
  const politics = view.politics;
  if (!politics || view.phase !== 'planning') return null;
  const { percent, start } = politics.tax;
  const o = pendingCall({ view });
  const can = me.politics?.canOverrule?.tax;
  // Nothing has moved: the line reads as today, with no button (S5-RULE-6 row 8c).
  if (percent === start && !o) return null;
  const caller = o && view.players.find((p) => p.id === o.caller);
  return (
    <span className="col-start-2 flex flex-col gap-1 pt-0.5" data-testid="overrule-call">
      <span className="text-[11px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm" data-testid="overrule-call-change">
        {percent > start ? 'Up' : 'Down'} from {start}% when the month began.
      </span>
      {o && o.caller === self.id ? (
        <span className="flex items-center gap-1.5 rounded-control border border-warn/60 bg-holo-soft p-1.5" data-testid="overrule-called-mine">
          <span className="min-w-0 flex-1 text-xs leading-snug @min-[1100px]/shell:text-sm">
            <strong className="font-semibold">You called it:</strong> the vote is held as planning ends. Your ballot starts at Yes.
          </span>
          <Button size="md" variant="outline" className="h-9! shrink-0 px-2.5 text-xs" onClick={() => client.intent({ type: 'callOverrule', target: null })} data-testid="overrule-withdraw">
            Withdraw
          </Button>
        </span>
      ) : o && caller ? (
        <span className="rounded-control border border-warn/60 bg-holo-soft p-1.5 text-xs leading-snug @min-[1100px]/shell:text-sm" data-testid="overrule-called-other">
          <strong className="font-semibold">{caller.name} called an overrule vote</strong> on it, held as planning ends. You vote then: undo it, or keep it.
        </span>
      ) : can === true ? (
        <span className="flex flex-col gap-0.5">
          <Button size="md" variant="outline" className="h-9! w-full text-sm" onClick={() => client.intent({ type: 'callOverrule', target: 'tax' })} data-testid="overrule-call-button">
            Call an overrule vote
          </Button>
          <span className="text-[11px] leading-snug text-ink-3 @min-[1100px]/shell:text-sm" data-testid="overrule-call-rule">
            One call a month, by anyone but the Governor. Everyone votes as planning ends; it {neededWords({ needed: politics.overrule?.needed ?? majority(politics.weights), total: total(politics.weights) })} to put back {start}%.
          </span>
        </span>
      ) : (
        typeof can === 'string' &&
        OVERRULE_REFUSAL[can] && (
          <span className="text-[11px] leading-snug text-ink-3 @min-[1100px]/shell:text-sm" data-testid="overrule-call-refused">
            {OVERRULE_REFUSAL[can]}
          </span>
        )
      )}
    </span>
  );
}

const total = (w: { votes: number }[]) => w.reduce((n, x) => n + x.votes, 0);
const majority = (w: { votes: number }[]) => Math.floor(total(w) / 2) + 1;

