import { useEffect } from 'react';
import { Commission } from '../../../components/ColonyActions';
import { usePhoneGame } from '../../game';
import { useHub } from '../Hub';
import type { HubSeat } from '../slots';
import { GovernorBudget } from './budget/GovernorBudget';
import { CouncilBudget } from './budget/CouncilBudget';
import { OverruleBallot } from './budget/OverruleBallot';
import { OverruleCall } from './budget/OverruleCall';
import { CouncilBody, PendingLaw } from './Council';
import { ElectionDay, ElectionDayRail } from './ElectionDay';
import { GovernorDesk } from './Governor';
import { CouncilBallot, LawsInForce } from './LawBallot';
import { Who } from './parts';

/* The bodies of the Governor / Council tab's sub-tabs (Laws, Budget, Elections), listed in POLITICS_TABS (./slots.ts). */

export const isGovernor = ({ view, self }: Pick<HubSeat, 'view' | 'self'>) => view.politics !== null && view.politics.governor === self.id;
export const lawVoting = ({ view }: Pick<HubSeat, 'view'>) => view.politics?.council?.stage === 'ballot';
export const overruleVoting = ({ view }: Pick<HubSeat, 'view'>) => view.politics?.overrule?.stage === 'ballot';
export const electionVoting = ({ view }: Pick<HubSeat, 'view'>) => {
  const stage = view.politics?.election?.stage;
  return stage === 'announce' || stage === 'ballot';
};

/** The tax as everyone but the Governor sees it, with the overrule call under it. */
function TaxLine() {
  const { view, self } = usePhoneGame();
  const politics = view.politics!;
  return (
    <section className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5 rounded-panel border border-holo-line bg-panel p-2 text-xs" data-testid="council-tax">
      <span className="label-caps text-[10px]!">Tax</span>
      <span data-testid="council-tax-in">
        <strong className="font-mono">{politics.tax.percent}%</strong> on every sale
        {politics.governor && (
          <>
            ; <Who view={view} id={politics.governor} me={self.id} size={12} />, the Governor, sets it
          </>
        )}
      </span>
      <OverruleCall />
    </section>
  );
}

/** Laws: an open overrule ballot, then the law ballot; then, for the Governor, the tax (frozen while a call stands, in the desk) and the law to propose; for the Council, the tax and the call. */
export function LawsSub() {
  const { view, self } = usePhoneGame();
  const gov = isGovernor({ view, self });
  return (
    <>
      {overruleVoting({ view }) && <OverruleBallot />}
      {lawVoting({ view }) && <CouncilBallot />}
      {gov ? <GovernorDesk /> : <TaxLine />}
      {view.politics && <LawsInForce laws={view.politics.laws ?? {}} />}
      {!gov && <PendingLaw />}
    </>
  );
}

/** Budget: the Governor sets it, with the Commission under Projects; everyone else sees it as set. */
export function BudgetSub() {
  const { view, self } = usePhoneGame();
  if (!isGovernor({ view, self })) return <CouncilBudget />;
  // A view without a budget (an older server) keeps the Commission on its own.
  return view.politics?.budget ? <GovernorBudget /> : <Commission />;
}

/** Elections: an open election's day, else running for office and who holds which. */
export function ElectionsSub() {
  const { view } = usePhoneGame();
  const { focus, takeFocus } = useHub();
  // As CouncilDesk does: a door pressed again asks again only once the focus is taken.
  useEffect(() => {
    if (focus !== null) takeFocus();
  }, [focus]);
  // The Rail's run block rides along: month 1's announce is the time to run (AM-21), and the card alone has no way to.
  if (electionVoting({ view }))
    return (
      <>
        <ElectionDay />
        <ElectionDayRail />
      </>
    );
  return <CouncilBody focus={focus} />;
}
