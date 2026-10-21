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
      footer={
        <Button size="lg" variant="outline" className="w-full" onClick={() => client.leave()}>
          Leave the table
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 rounded-panel border-2 border-holo bg-holo-soft p-5 text-center shadow-glow">
          <span className="label-caps">{winner?.player.id === self.id ? 'You win the colony!' : 'The colony goes to'}</span>
          {winner && <PlayerMark slot={winner.slot} size={56} />}
          <span className="font-display text-3xl font-semibold">{winner?.player.name}</span>
          <span data-num className="font-mono text-lg text-ink-2">
            {fmt(winner?.value ?? 0)} points
          </span>
        </div>
        <Panel title="Final scores" aside={`YOU ARE #${mine}`}>
          <ol className="flex flex-col gap-2" data-testid="scores">
            {ranking.map((r, i) => (
              <li key={r.player.id} className="flex items-center gap-3">
                <span data-num className="w-5 font-mono text-sm text-ink-3">
                  {i + 1}
                </span>
                <PlayerMark slot={r.slot} size={18} />
                <span className="flex-1 font-semibold">
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
        <NewsPanel news={view.news} />
      </div>
    </PhoneShell>
  );
}
