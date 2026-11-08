import { Commission } from '../../../components/ColonyActions';
import { usePhoneGame } from '../../game';
import { useHub } from '../Hub';
import type { HubSeat } from '../slots';
import { CouncilBody, PendingLaw } from './Council';
import { ElectionDay } from './ElectionDay';
import { GovernorDesk } from './Governor';
import { CouncilBallot, LawsInForce } from './LawBallot';
import { Who } from './parts';

/* The bodies of the Governor / Council tab's sub-tabs (Laws, Budget, Elections), listed in POLITICS_TABS (./slots.ts). */

export const isGovernor = ({ view, self }: Pick<HubSeat, 'view' | 'self'>) => view.politics !== null && view.politics.governor === self.id;
export const lawBallotOpen = ({ view }: Pick<HubSeat, 'view'>) => view.politics?.council?.stage === 'ballot';
export const electionAsking = ({ view }: Pick<HubSeat, 'view'>) => {
  const stage = view.politics?.election?.stage;
  return stage === 'announce' || stage === 'ballot';
};

/** The tax as everyone but the Governor sees it. */
function TaxLine() {
  const { view, self } = usePhoneGame();
  const politics = view.politics!;
  return (
    <section className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5 rounded-panel border border-holo-line bg-panel p-2 text-xs" data-testid="council-tax">
      <span className="label-caps text-[10px]!">Tax</span>
      <span data-testid="fund-in">
        <strong className="font-mono">{politics.tax.percent}%</strong> on every sale
        {politics.governor && (
          <>
            ; <Who view={view} id={politics.governor} me={self.id} size={12} />, the Governor, sets it
          </>
        )}
      </span>
    </section>
  );
}

/** Laws: an open ballot first; then the Governor's desk, or the tax line; the laws in force; and, off the Governor's phone, the pending law. */
export function LawsSub() {
  const { view, self } = usePhoneGame();
  const gov = isGovernor({ view, self });
  return (
    <>
      {lawBallotOpen({ view }) && <CouncilBallot />}
      {gov ? <GovernorDesk /> : <TaxLine />}
      {view.politics && <LawsInForce laws={view.politics.laws ?? {}} />}
      {!gov && <PendingLaw />}
    </>
  );
}

/** Budget: the Governor's Commission. S5-PR-6 fills the rest (the budget steppers, CouncilBudget, FrozenTax, the overrule call and ballot). */
export function BudgetSub() {
  return <Commission />;
}

/** Elections: an open election's day, else running for office and who holds which. */
export function ElectionsSub() {
  const { view } = usePhoneGame();
  const { focus } = useHub();
  if (electionAsking({ view })) return <ElectionDay />;
  return <CouncilBody focus={focus} />;
}
