import type { MuleView, PoliticsView } from '@mule/protocol';
import { fmt } from '../../../game/derive';
import { usePhoneGame } from '../../game';
import { ColonyDesk } from '../desks';
import { Section, Who } from './parts';
import { change } from './words';

/** WS6's Colony desk, unchanged, and under it the colony's offices and tax while the table plays politics. */
export function ColonyWithFacts() {
  const { view } = usePhoneGame();
  return (
    <>
      <ColonyDesk />
      {view.politics && <ColonyFacts view={view} politics={view.politics} />}
    </>
  );
}

function ColonyFacts({ view, politics }: { view: MuleView; politics: PoliticsView }) {
  const { tax, governor, baron } = politics;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name;
  const baronVotes = politics.weights.find((w) => w.id === baron)?.parts.baron ?? 0;
  return (
    <Section title="Colony" testid="colony-facts">
      <ul className="flex flex-col gap-1 text-sm">
        <li data-testid="tax-readonly">
          Sales tax {tax.percent}%{governor && ` (set by ${name(governor)}, ${change(tax.percent - tax.start)})`} · colony fund {fmt(politics.fund)} cr
        </li>
        <li>
          From the fund each month: Governor {politics.pay.governor} cr, Sheriff {politics.pay.sheriff} cr
        </li>
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
