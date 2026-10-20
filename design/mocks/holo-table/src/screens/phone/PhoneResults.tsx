import { Button, GoodTag, Panel, PlayerMark, type Good } from '@mule/ui';
import { ME, MONTH_END_SEATS, RANKING } from '../../data';
import { PhoneShell } from './Shell';

const LINES: { good: Good; made: number; used: number; spoiled: number; sold: number }[] = [
  { good: 'food', made: 4, used: 3, spoiled: 2, sold: 0 },
  { good: 'energy', made: 13, used: 4, spoiled: 1, sold: 6 },
  { good: 'water', made: 0, used: 2, spoiled: 0, sold: 0 },
  { good: 'crystite', made: 0, used: 0, spoiled: 0, sold: 0 },
];

export function PhoneResults() {
  const ranking = RANKING;
  const myMoney = MONTH_END_SEATS[ME]!.money;
  const myRank = ranking.findIndex((s) => s.slot === ME) + 1;
  return (
    <PhoneShell
      phase="Month 4 results"
      footer={
        <a href="#/phone/planning" className="flex h-14 items-center justify-center rounded-control bg-holo font-display text-lg font-semibold text-on-holo shadow-glow hover:bg-holo-strong">
          On to month 5
        </a>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between rounded-panel border border-holo-line bg-panel p-4">
          <div className="flex flex-col">
            <span className="label-caps">Your money</span>
            <span data-num className="font-mono text-3xl font-bold">{myMoney.toLocaleString('en')} cr</span>
            <span data-num className="font-mono text-sm text-ok">+186 this month</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="label-caps">Rank</span>
            <span data-num className="font-mono text-3xl font-bold text-holo">#{myRank}</span>
            <span className="text-sm text-ink-3">of 6</span>
          </div>
        </div>

        <Panel title="Your goods this month">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[11px] text-ink-3">
                <th className="pb-1 font-medium">GOOD</th>
                <th className="pb-1 text-right font-medium">MADE</th>
                <th className="pb-1 text-right font-medium">USED</th>
                <th className="pb-1 text-right font-medium">SPOILED</th>
                <th className="pb-1 text-right font-medium">SOLD</th>
              </tr>
            </thead>
            <tbody data-num className="font-mono">
              {LINES.map((l) => (
                <tr key={l.good} className="border-t border-holo-faint">
                  <td className="py-2"><GoodTag good={l.good} /></td>
                  <td className="py-2 text-right font-bold">+{l.made}</td>
                  <td className="py-2 text-right">−{l.used}</td>
                  <td className="py-2 text-right text-rise">{l.spoiled ? `−${l.spoiled}` : '0'}</td>
                  <td className="py-2 text-right">{l.sold}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-warn">2 Food spoiled. A cold store would have kept it.</p>
        </Panel>

        <Panel title="Only you know" aside="PRIVATE">
          <p className="leading-snug">
            Your survey of plot 9·3 found a <strong className="text-holo">rich Crystite vein</strong> under your Energy plant. Worth 3 per month as a Crystite mine.
          </p>
          <Button size="md" variant="outline">Plan a switch next month</Button>
        </Panel>

        <Panel title="Standings">
          <ol className="flex flex-col gap-2">
            {ranking.map((s, i) => (
              <li key={s.slot} className="flex items-center gap-3">
                <span data-num className="w-5 font-mono text-sm text-ink-3">{i + 1}</span>
                <PlayerMark slot={s.slot} size={14} />
                <span className="flex-1 font-semibold">{s.slot === ME ? 'You' : s.name}</span>
                <span data-num className="font-mono text-sm">{s.score.toLocaleString('en')}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </PhoneShell>
  );
}
