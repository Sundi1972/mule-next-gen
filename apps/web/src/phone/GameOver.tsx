import { Button, cx } from '@mule/ui';
import { ColonyPanel, LeagueTable, PhoneVerdict, WinnerCard, YourWorth } from '../components/MonthEnd';
import { PHASE_NAME } from '../game/derive';
import { league, ordinal, winnerWords } from '../game/month-end';
import { useClient } from '../net/react';
import { usePhoneGame } from './game';
import { PhoneShell, type Now } from './Shell';

/**
 * The end of the game, in credits (C20, WS6's approved mock): your place and your Worth beside your own lines, the
 * colony's verdict, and the final standings by Worth in the rail. The big screen shows only totals, since goods are
 * private. With no TV at the table, the colony's report takes the verdict's place under both.
 */
export function GameOver() {
  const client = useClient();
  const { table, view, self } = usePhoneGame();
  const tv = table.boards > 0;
  const lg = league(view);
  const mine = lg.rows.find((r) => r.player.id === self.id)!;
  const won = mine.rank === 1 && lg.leader?.level.length === 1;
  const now: Now = {
    // One line in the rail: the card beside says the rest ("You finished 2nd of 4").
    title: won ? 'Game over: you win' : `Game over: ${ordinal(mine.rank)} of ${view.players.length}`,
    detail: `${winnerWords(view, lg)}.`,
  };
  const density = tv ? 'phone' : 'compact';
  return (
    <PhoneShell
      phase={PHASE_NAME.gameOver}
      now={now}
      foldNow
      rail={
        <div data-testid="scores">
          <LeagueTable view={view} density="compact" selfId={self.id} final />
        </div>
      }
      footer={
        <Button size="md" variant="outline" className="w-full" data-testid="leave" onClick={() => client.leave()}>
          Leave the table
        </Button>
      }
    >
      <div className={cx('relative flex min-h-0 flex-1 flex-col', tv ? 'h-full gap-2.5' : 'gap-1.5')} data-testid={tv ? 'phone-gameover' : 'phone-only-gameover'}>
        <div className={cx('grid min-h-0 grid-cols-[minmax(0,5fr)_minmax(0,6fr)]', tv ? 'flex-1 gap-2.5' : 'gap-1.5')}>
          <div className={cx('flex min-h-0 flex-col', tv ? 'gap-2.5' : 'gap-1.5')}>
            <WinnerCard view={view} density={density} selfId={self.id} />
            {tv && <PhoneVerdict view={view} />}
          </div>
          <YourWorth view={view} density={density} />
        </div>
        {!tv && (
          <div className="relative" data-testid="phone-only-colony">
            <ColonyPanel view={view} density="compact" verdict />
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
