import { POLITICS } from '@mule/engine';
import type { MuleView, PoliticsView } from '@mule/protocol';
import { fmt } from '../../../game/derive';
import { usePhoneGame } from '../../game';
import { ColonyDesk } from '../desks';
import { Section, Who } from './parts';
import { OFFICE_NAME } from './words';

/** WS6's Colony desk, unchanged; while the table plays politics, the colony fund before it and the colony's facts after it. */
export function ColonyWithFacts() {
  const { view } = usePhoneGame();
  if (!view.politics) return <ColonyDesk />;
  return (
    <>
      <FundCard view={view} politics={view.politics} />
      <ColonyDesk />
      <ColonyFacts view={view} politics={view.politics} />
    </>
  );
}

/** How much is in the colony fund, what fills it and what it pays out each month. */
function FundCard({ view, politics }: { view: MuleView; politics: PoliticsView }) {
  const { fund, tax, governor, pay } = politics;
  return (
    <section className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-4" data-testid="fund-card">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps shrink-0 text-[10px]! @min-[1100px]/shell:text-xs!">Colony fund</span>
        <span data-num className="shrink-0 whitespace-nowrap font-mono text-lg font-bold @min-[1100px]/shell:text-2xl" data-testid="fund-total">
          {fmt(fund)} cr
        </span>
      </span>
      <span className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5 text-xs @min-[1100px]/shell:text-sm">
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">In</span>
        <span data-testid="fund-in">
          the {tax.percent}% sales tax on every sale
          {governor && (
            <>
              ; <Who view={view} id={governor} size={12} />, the Governor, sets it
            </>
          )}
        </span>
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Out</span>
        <span data-testid="fund-out">{POLITICS.offices.map((office) => `${OFFICE_NAME[office]} ${pay[office]} cr a month`).join(', ')}</span>
      </span>
    </section>
  );
}

function ColonyFacts({ view, politics }: { view: MuleView; politics: PoliticsView }) {
  const { baron } = politics;
  const baronVotes = politics.weights.find((w) => w.id === baron)?.parts.baron ?? 0;
  return (
    <Section title="Colony" testid="colony-facts">
      <ul className="flex flex-col gap-1 text-sm">
        {baron && (
          <li data-testid="land-baron">
            Land Baron <Who view={view} id={baron} /> · {view.players.find((p) => p.id === baron)?.plots ?? 0} plots: +{baronVotes} vote, breaks a tied election. Whoever owns the most plots, checked every planning phase.
          </li>
        )}
        <li>
          Air {view.air.level} · {view.air.band}
        </li>
      </ul>
    </Section>
  );
}
