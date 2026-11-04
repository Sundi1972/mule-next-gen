import type { PlayerView } from '@mule/protocol';
import { Button, cx, PlayerMark } from '@mule/ui';
import { useState } from 'react';
import { toSlot } from '../../game/derive';
import { useClient } from '../../net/react';
import { usePhoneGame } from '../game';
import { connectedIn, continueQuestion, hostMayContinue, press, readyFooter, stageWords, viewerFirst, type Press, type ReadyWords, type Seat } from './ready';

/** The ready count, where the clock used to be: planning has none. `label` is what it counts, such as the ballot's VOTED. */
export function ReadyCount({ players, tv = false, label = 'READY' }: { players: readonly PlayerView[]; tv?: boolean; label?: string | undefined }) {
  const ready = players.filter((p) => p.isAi || p.ready).length;
  return (
    <span
      className={cx('flex shrink-0 items-center gap-1.5 rounded-chip border border-holo-line bg-holo-soft font-mono font-bold text-holo', tv ? 'h-14 px-5 text-3xl' : 'h-8 px-1.5 text-sm @min-[1100px]/shell:h-11 @min-[1100px]/shell:px-4 @min-[1100px]/shell:text-2xl')}
      data-testid="ready-count"
    >
      {ready} / {players.length} {label}
    </span>
  );
}

/** The names still planning, each with its creature, and an away mark for a dropped phone. */
export function WaitingFor({ seats, me, tv = false, lead = 'Waiting for' }: { seats: readonly Seat[]; me: string | null; tv?: boolean; lead?: string }) {
  return (
    <span className={cx('flex flex-wrap items-center gap-x-2 gap-y-1', tv ? 'text-3xl' : 'text-sm @min-[1100px]/shell:text-lg')} data-testid="waiting-for">
      <span className="text-ink-2">{lead}</span>
      {viewerFirst(seats, me).map((s) => (
        <span key={s.id} className="flex items-center gap-1 font-semibold" data-testid={`waiting-${s.id}`}>
          <PlayerMark slot={toSlot(s.slot)} size={tv ? 30 : 14} glow={!s.away} />
          {s.id === me ? 'you' : s.name}
          {s.away && <span className={cx('rounded-chip border border-warn/60 font-mono font-bold text-warn', tv ? 'px-2 text-lg' : 'px-1 text-[10px] @min-[1100px]/shell:text-xs')}>AWAY</span>}
        </span>
      ))}
    </span>
  );
}

/**
 * The planning footer on every phone and laptop. Before you're ready: who is still planning, then I'm ready. Once
 * you are, as the server has it: who you're waiting for. The host, once ready and while anyone is still planning,
 * can continue without them, after one confirming tap. `words` default to planning's at the election's stage;
 * `canReady` false greys the ready button, such as a ballot with nothing picked. `names` false folds who is still
 * planning above the button while a desk asks first (E-11, the Governor's tax): the header's ready count says it in brief,
 * and a screen reader still reads them.
 */
export function ReadyBar({ words: given, canReady = true, names = true }: { words?: ReadyWords | undefined; canReady?: boolean | undefined; names?: boolean }) {
  const client = useClient();
  const { table, view, self } = usePhoneGame();
  const [confirm, setConfirm] = useState(false);
  const words = given ?? stageWords(view.politics?.election?.stage);
  const footer = readyFooter({ me: self.id, players: view.players, hostId: table.hostId, connected: connectedIn(table.seats), mayContinue: hostMayContinue(view), confirm });
  const on = (pressed: Press) => () => {
    const next = press(confirm, pressed);
    setConfirm(next.confirm);
    if (next.intent) client.intent(next.intent);
  };

  if (!footer.ready)
    return (
      <>
        {footer.waiting.length > 0 &&
          (names ? (
            <WaitingFor seats={footer.waiting} me={self.id} />
          ) : (
            // Folded from sight, the names stay for a screen reader.
            <span className="sr-only">
              <WaitingFor seats={footer.waiting} me={self.id} />
            </span>
          ))}
        <Button size="lg" className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={on('ready')} disabled={!canReady} data-testid="ready">
          {words.ready}
        </Button>
      </>
    );

  const others = footer.waiting;
  return (
    <>
      <span className="flex items-center gap-1.5 font-display text-base font-semibold text-holo @min-[1100px]/shell:text-xl" data-testid="you-are-ready">
        <svg aria-hidden viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
        {words.done}
      </span>
      {others.length > 0 ? <WaitingFor seats={others} me={self.id} lead={words.waiting} /> : <span className="text-sm text-ink-2">{words.all}</span>}
      {footer.host === 'continue' && (
        <Button size="md" variant="outline" className="w-full" onClick={on('continue')} data-testid="continue">
          Continue without {others.length === 1 ? others[0]!.name : 'them'}
        </Button>
      )}
      {footer.host === 'confirm' && (
        <div className="flex flex-col gap-2 rounded-panel border border-warn/60 bg-panel p-2.5 @min-[1100px]/shell:p-4" role="alertdialog" aria-label="Continue without them?" data-testid="continue-confirm">
          <p className="text-sm @min-[1100px]/shell:text-base">{continueQuestion(words, others)}</p>
          <div className="flex gap-2">
            <Button size="md" className="flex-1" onClick={on('continue-now')} data-testid="continue-now">
              Continue now
            </Button>
            <Button size="md" variant="ghost" className="flex-1" onClick={on('keep-waiting')} data-testid="keep-waiting">
              Keep waiting
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
