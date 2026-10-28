import { MAP, RAW_GOODS, RULE_TITLES, type RawGood, type RuleId } from '@mule/engine';
import { cx, GOOD_NAME, GoodIcon } from '@mule/ui';
import { AGGREGATE_SEEDS, floorOf, type Players, type Tally } from './gallery';
import { num, pct, Section } from './ui';
import { useAggregate } from './useAggregate';

const RULES = Object.keys(RULE_TITLES) as RuleId[];

/** Today's generator against the new one over the first AGGREGATE_SEEDS seeds of this size, from the checker's reports. */
export function AggregatePanel({ players }: { players: Players }) {
  const { aggregate, done } = useAggregate(players);
  const { current, new: next } = aggregate;
  const running = done < AGGREGATE_SEEDS;
  return (
    <Section
      title={`Seeds 1 to ${AGGREGATE_SEEDS}, ${players} players`}
      aside={running ? `checking… ${done} of ${AGGREGATE_SEEDS}` : `${AGGREGATE_SEEDS} seeds checked`}
    >
      {running && (
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-raised">
          <div className="h-full bg-holo transition-[width]" style={{ width: `${(done / AGGREGATE_SEEDS) * 100}%` }} />
        </div>
      )}
      <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[auto_auto_1fr]">
        <div className="space-y-3">
          <Compare label="Maps breaking any rule" tallies={[current, next]} count={(t) => t.failing} flagAny />
          <Compare label={`Maps with a scarce good (aim about ${pct(MAP.scarceChance)})`} tallies={[current, next]} count={(t) => t.scarce} />
        </div>

        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Average good plots per player</h3>
          <table className="text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="pr-4 font-medium">Good</th>
                <th className="pr-4 font-medium">Current</th>
                <th className="pr-4 font-medium">New</th>
                <th className="font-medium">Floor</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {RAW_GOODS.map((g) => {
                const floor = floorOf(g);
                return (
                  <tr key={g}>
                    <td className="py-0.5 pr-4 font-sans">
                      <span className="inline-flex items-center gap-1.5">
                        <GoodIcon good={g} size={14} />
                        {GOOD_NAME[g]}
                      </span>
                    </td>
                    <td className={cx('pr-4', below(current, g, floor) && 'text-alert')}>{average(current, g)}</td>
                    <td className={cx('pr-4', below(next, g, floor) && 'text-alert')}>{average(next, g)}</td>
                    <td className="text-ink-3">{floor ?? 'rings'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Maps breaking each rule</h3>
          <table className="w-full max-w-[480px] text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="pr-4 font-medium">Rule</th>
                <th className="pr-4 text-right font-medium">Current</th>
                <th className="text-right font-medium">New</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((r) => (
                <tr key={r}>
                  <td className="py-0.5 pr-4">
                    <span className="font-mono text-ink-3">{r}</span> {RULE_TITLES[r]}
                  </td>
                  <td className={cx('pr-4 text-right font-mono', (current.byRule[r] ?? 0) > 0 && 'text-alert')}>{current.byRule[r] ?? 0}</td>
                  <td className={cx('text-right font-mono', (next.byRule[r] ?? 0) > 0 && 'text-alert')}>{next.byRule[r] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function average(tally: Tally, good: RawGood): string {
  return tally.maps === 0 ? '–' : num(tally.perPlayerSum[good] / tally.maps);
}

function below(tally: Tally, good: RawGood, floor: number | undefined): boolean {
  return tally.maps > 0 && floor !== undefined && tally.perPlayerSum[good] / tally.maps < floor;
}

function Compare({ label, tallies, count, flagAny = false }: { label: string; tallies: [Tally, Tally]; count(t: Tally): number; flagAny?: boolean }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-0.5 flex gap-6 font-mono text-lg">
        {tallies.map((t, i) => (
          <span key={i}>
            <span className="mr-1.5 font-sans text-xs text-ink-3">{i === 0 ? 'Current' : 'New'}</span>
            <span className={cx(flagAny && count(t) > 0 && 'text-alert')}>{t.maps === 0 ? '–' : `${count(t)} of ${t.maps} (${pct(count(t) / t.maps)})`}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
