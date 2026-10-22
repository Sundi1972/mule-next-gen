import type { PoliticsView } from '@mule/protocol';
import { Button } from '@mule/ui';
import { useState } from 'react';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { Section } from './parts';
import { change } from './words';

/** The Governor's desk: the sales tax, within the bounds the server gives for this month. */
export function GovernorDesk() {
  const { view } = usePhoneGame();
  if (!view.politics) return null;
  return <SalesTax tax={view.politics.tax} />;
}

function SalesTax({ tax: { percent, start, low, high } }: { tax: PoliticsView['tax'] }) {
  const client = useClient();
  const [tax, setTax] = useState(percent);
  return (
    <Section title="Sales tax" testid="gov-tax">
      <div className="flex items-center gap-2">
        <Button size="md" variant="outline" aria-label="One point lower" disabled={tax <= low} onClick={() => setTax((x) => Math.max(low, x - 1))} data-testid="tax-down">
          −
        </Button>
        <span data-num className="flex-1 text-center font-mono text-3xl font-bold @min-[1100px]/shell:text-4xl" data-testid="tax-value">
          {tax}%
        </span>
        <Button size="md" variant="outline" aria-label="One point higher" disabled={tax >= high} onClick={() => setTax((x) => Math.min(high, x + 1))} data-testid="tax-up">
          +
        </Button>
      </div>
      <span className="text-xs text-ink-2 @min-[1100px]/shell:text-sm">
        Last month {start}%. This month {low}–{high}%.
      </span>
      <Button size="md" onClick={() => client.intent({ type: 'setTax', percent: tax })} data-testid="tax-confirm">
        Set the tax at {tax}%
      </Button>
      <span className="text-xs text-ink-3">
        Everyone sees “Sales tax {tax}% (set by you, {change(tax - start)})”. You can change it until planning ends.
      </span>
    </Section>
  );
}
