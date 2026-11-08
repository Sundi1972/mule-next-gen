import { Button, cx } from '@mule/ui';
import { createContext, useContext, useState } from 'react';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { CouncilBody } from '../../../../../../apps/web/src/phone/hub/politics/Council';
import { GovernorDesk } from '../../../../../../apps/web/src/phone/hub/politics/Governor';
import { LawsInForce } from '../../../../../../apps/web/src/phone/hub/politics/LawBallot';
import { forYouWords, proposalWords } from '../../../../../../apps/web/src/phone/hub/politics/LawPicker';
import { Who } from '../../../../../../apps/web/src/phone/hub/politics/parts';
import type { HubSeat } from '../../../../../../apps/web/src/phone/hub/slots';
import { CouncilBudget } from '../../copied/budget/CouncilBudget';
import { FrozenTax, GovernorBudget, type Variant } from '../../copied/budget/GovernorBudget';
import { OverruleBallot } from '../../copied/budget/OverruleBallot';
import { OverruleCall } from '../../copied/budget/OverruleCall';
import { PromisedElectionDay } from '../../copied/deals/ElectionDay';
import { PromisedCouncilBallot } from '../../copied/deals/LawBallot';
import { useDrawn, useHub } from '../Hub';
import { TabBadge } from '../parts';
import type { SubTabSlot } from '../slots';

/*
 * GRAFT TARGET: new apps/web/src/phone/hub/tabs/Politics.tsx. One tab, two names: "Governor" on the Governor's phone,
 * "Council" on every other; the same sub-tabs, Laws · Budget · Elections, plus Sheriff while a Sheriff holds office.
 * The Governor's sub-tabs are where the Governor acts (tax, budget, the law proposed); the Council's are where everyone
 * sees them, votes, and calls an overrule. A ballot, when open, sits first in its sub-tab and badges the tab.
 * From today's desks: GovernorDesk (Laws), CouncilDesk (Laws: laws in force and the pending law; Elections: running and
 * the offices), the budget mock's P12/P13 (Budget; the overrule call and ballot in Laws), the deals mock's ballots.
 */

const isGovernor = ({ view, self }: Pick<HubSeat, 'view' | 'self'>) => view.politics?.governor === self.id;
const lawBallotOpen = ({ view }: Pick<HubSeat, 'view'>) => view.politics?.council?.stage === 'ballot';
const overruleOpen = ({ view }: Pick<HubSeat, 'view'>) => view.politics?.overrule?.stage === 'ballot';
const electionOpen = ({ view }: Pick<HubSeat, 'view'>) => {
  const s = view.politics?.election?.stage;
  return s === 'announce' || s === 'ballot';
};

/** MOCK PLUMBING: which P3 budget variant the Budget sub-tab draws; the index and the sub-tab's switch set it. */
export const BudgetVariant = createContext<{ variant: Variant; set(v: Variant): void }>({ variant: 'a', set: () => {} });

function VoteBadge({ testid, inline = false }: { testid: string; inline?: boolean }) {
  return (
    <TabBadge tone="warn" label="A ballot is open: vote here" testid={testid} inline={inline}>
      VOTE
    </TabBadge>
  );
}

/** The tab's badge: a ballot open in any of its sub-tabs (the law, the overrule, the election). */
export function PoliticsBadge() {
  const { view } = usePhoneGame();
  const { tab } = useHub();
  if (tab === 'politics') return null;
  if (!(lawBallotOpen({ view }) || overruleOpen({ view }) || electionOpen({ view }))) return null;
  return <VoteBadge testid="politics-badge" />;
}

/** The tax as everyone but the Governor sees it, with the overrule call under it (P13, PM ruling 7 Nov: at the tax). */
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
      <OverruleCall />
    </section>
  );
}

/** Next month's vote while one is pending (copied from apps/web/src/phone/hub/politics/Council.tsx::PendingLaw, not exported). */
function PendingLaw() {
  const { view, self } = usePhoneGame();
  const politics = view.politics;
  const pending = politics?.proposal;
  const votesOpen = (!!politics?.council && politics.council.stage !== 'over') || (!!politics?.election && politics.election.stage !== 'over');
  if (!pending || votesOpen) return null;
  return (
    <div className="flex flex-col gap-0.5 rounded-panel border border-holo-line bg-panel p-2" data-testid="council-pending">
      <span className="label-caps text-[10px]!">Next month’s vote</span>
      <span className="text-xs">
        <Who view={view} id={pending.by} me={self.id} size={12} /> {pending.by === self.id ? 'propose' : 'proposes'} <strong>{proposalWords(pending.proposal)}</strong>
      </span>
      <span className="text-[11px] text-ink-2" data-testid="council-pending-for-you">
        For you: {forYouWords(pending.proposal, pending.impact[self.id], view.air.level)}.
      </span>
    </div>
  );
}

/** Laws: an open ballot first; then, for the Governor, the tax and the law to propose; for the Council, the tax and the call. */
function LawsSub() {
  const { view, self } = usePhoneGame();
  const gov = isGovernor({ view, self });
  const frozen = view.politics?.overrule?.target === 'tax' && view.politics.overrule.stage === 'called';
  return (
    <>
      {overruleOpen({ view }) && <OverruleBallot />}
      {lawBallotOpen({ view }) && <PromisedCouncilBallot />}
      {gov ? (
        // MOCK: while a call holds the tax, the real SalesTax row is hidden and FrozenTax drawn above it (as the budget mock did).
        <div className={cx('flex flex-col gap-2', frozen && '[&_[data-testid=gov-tax]]:hidden')} data-testid="governor-laws">
          {frozen && <FrozenTax />}
          <GovernorDesk />
        </div>
      ) : (
        <TaxLine />
      )}
      {view.politics && <LawsInForce laws={view.politics.laws ?? {}} />}
      {!gov && <PendingLaw />}
    </>
  );
}

/** Budget: the Governor sets it (P12, both variants until Heiko picks); everyone else sees it as set (P13). */
function BudgetSub() {
  const { view, self } = usePhoneGame();
  const { variant, set } = useContext(BudgetVariant);
  if (!isGovernor({ view, self })) return <CouncilBudget />;
  return (
    <>
      {/* MOCK: Heiko's pick between the budget mock's two variants; the build keeps the one he picks and drops the switch. */}
      <div role="radiogroup" aria-label="Budget variant (mock)" className="flex items-center gap-1 rounded-control border border-dashed border-holo-line p-1 text-[10px]" data-testid="budget-variant">
        <span className="label-caps px-1 text-[10px]!">Pick</span>
        {(['a', 'b'] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={variant === v} onClick={() => set(v)} className={cx('h-8 flex-1 rounded-control border font-semibold', variant === v ? 'border-holo bg-holo-soft text-holo' : 'border-transparent text-ink-2')} data-testid={`budget-variant-${v}`}>
            {v === 'a' ? 'A · steppers' : 'B · split bar'}
          </button>
        ))}
      </div>
      <GovernorBudget variant={variant} />
    </>
  );
}

/** Elections: an open ballot (with "You promised"), else running for office and who holds which. */
function ElectionsSub() {
  const { view } = usePhoneGame();
  const { focus } = useHub();
  if (electionOpen({ view })) return <PromisedElectionDay />;
  return <CouncilBody focus={focus} />;
}

/** Sheriff: WS8 draws this desk. The stub shows where it sits and the one hand-off this mock owns: Guard a plot. */
function SheriffSub() {
  const { view, self } = usePhoneGame();
  const { startPick } = useHub();
  const sheriff = view.politics?.sheriff;
  if (!sheriff) return null;
  if (sheriff !== self.id)
    return (
      <div className="flex flex-col gap-1 rounded-panel border-2 border-dashed border-holo-line bg-holo-soft p-2.5" data-testid="slot-sheriff-public">
        <span className="label-caps text-[10px]! text-holo">P7 · WS8 · Sheriff</span>
        <span className="text-xs">
          <Who view={view} id={sheriff} me={self.id} size={12} /> is the Sheriff. What the Sheriff does in public (cases, fines) is WS8’s to draw here.
        </span>
      </div>
    );
  return (
    <div className="flex flex-col gap-2 rounded-panel border-2 border-dashed border-holo-line bg-holo-soft p-2.5" data-testid="slot-sheriff">
      <span className="label-caps text-[10px]! text-holo">P7–P8 · WS8 · the Sheriff’s desk</span>
      <span className="text-xs text-ink-2">Investigate one case a month, fine a revealed culprit: WS8 draws it. The guard is a pick on Overview’s one map:</span>
      <Button size="md" variant="outline" onClick={() => startPick('guard')} data-testid="sheriff-guard">
        Guard a plot…
      </Button>
    </div>
  );
}

export const POLITICS_TABS: SubTabSlot[] = [
  { id: 'laws', label: () => 'Laws', Body: LawsSub, first: (s) => lawBallotOpen(s) || overruleOpen(s), Badge: () => <SubBadge on={(s) => lawBallotOpen(s) || overruleOpen(s)} id="laws" /> },
  { id: 'budget', label: () => 'Budget', Body: BudgetSub },
  { id: 'elections', label: () => 'Elections', Body: ElectionsSub, first: electionOpen, Badge: () => <SubBadge on={electionOpen} id="elections" /> },
  { id: 'sheriff', label: () => 'Sheriff', Body: SheriffSub, show: ({ view }) => !!view.politics?.sheriff },
];

function SubBadge({ on, id }: { on(s: Pick<HubSeat, 'view'>): boolean; id: string }) {
  const { view } = usePhoneGame();
  return on({ view }) ? <VoteBadge testid={`sub-badge-${id}`} inline /> : null;
}

/** The Governor / Council tab: its sub-tabs in a row, the open one's body under them, scrolling on its own. DS-GAP: no Tabs component. */
export function PoliticsTab() {
  const { subs, seat } = useDrawn();
  const nav = useHub();
  const sub = subs.find((s) => s.id === nav.sub) ?? subs[0]!;
  const Body = sub.Body;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid={`politics-${isGovernor(seat) ? 'governor' : 'council'}`}>
      <div role="tablist" aria-label={isGovernor(seat) ? 'Governor' : 'Council'} className="flex shrink-0 gap-1" data-testid="sub-tabs">
        {subs.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === sub.id}
            onClick={() => nav.open({ tab: 'politics', sub: s.id })}
            className={cx('flex h-9 min-w-0 flex-1 items-center justify-center rounded-control border px-1 text-xs font-semibold', s.id === sub.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2 hover:text-ink')}
            data-testid={`sub-${s.id}`}
          >
            <span className="truncate">{s.label(seat)}</span>
            {s.Badge && <s.Badge />}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto *:shrink-0" data-testid={`sub-body-${sub.id}`}>
        <Body />
      </div>
    </div>
  );
}

/** MOCK: a provider the page wraps each phone in, so its Budget sub-tab can switch variant in place. */
export function BudgetVariantProvider({ initial, children }: { initial: Variant; children: React.ReactNode }) {
  const [variant, set] = useState<Variant>(initial);
  return <BudgetVariant.Provider value={{ variant, set }}>{children}</BudgetVariant.Provider>;
}
