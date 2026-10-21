import { Button, Panel, PlayerMark } from '@mule/ui';
import { fmt, PHASE_NAME, standings } from '../game/derive';
import { useClient } from '../net/react';
import { usePhoneGame } from './game';
import { NewsPanel } from './parts';
import { PhoneShell } from './Shell';

/** The end: final scores, best first. */
export function GameOver() {
  const client = useClient();
  const { view, self } = usePhoneGame();
  const ranking = standings(view);
  const winner = ranking[0];
  const mine = ranking.findIndex((r) => r.player.id === self.id) + 1;
  return (
    <PhoneShell
      phase={PHASE_NAME.gameOver}
      rail={<NewsPanel news={view.news} />}
      footer={
        <Button size="lg" variant="outline" className="w-full" onClick={() => client.leave()}>
          Leave the table
        </Button>
      }
    >
      <div className="grid grid-cols-2 items-start gap-2.5">
        <div className="flex flex-col items-center gap-2 rounded-panel border-2 border-holo bg-holo-soft p-4 text-center shadow-glow">
          <span className="label-caps">{winner?.player.id === self.id ? 'You win the colony!' : 'The colony goes to'}</span>
          {winner && <PlayerMark slot={winner.slot} size={48} />}
          <span className="font-display text-2xl font-semibold">{winner?.player.name}</span>
          <span data-num className="font-mono text-base text-ink-2">
            {fmt(winner?.value ?? 0)} points
          </span>
        </div>
        <Panel title="Final scores" aside={`YOU ARE #${mine}`} className="p-3">
          <ol className="flex flex-col gap-2" data-testid="scores">
            {ranking.map((r, i) => (
              <li key={r.player.id} className="flex items-center gap-2.5">
                <span data-num className="w-4 font-mono text-sm text-ink-3">
                  {i + 1}
                </span>
                <PlayerMark slot={r.slot} size={16} />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {r.player.name}
                  {r.player.id === self.id && ' (you)'}
                </span>
                <span data-num className="font-mono font-bold">
                  {fmt(r.value)}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </PhoneShell>
  );
}
