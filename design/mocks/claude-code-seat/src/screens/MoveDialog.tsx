import { Button, cx, Timer } from '@mule/ui';
import { useId } from 'react';
import { joinUrl, Qr } from '../../../../../apps/web/src/components/Qr';
import { HANDOFF_CODE, ROOM } from '../fixture';
import { useCountdown } from '../harness';
import { Chip, CopyInvite, CopyLine, SetupLink } from '../parts';

/*
 * GRAFT TARGET: MoveDialog in apps/web/src/phone/Shell.tsx, whose body today is MoveToPhone. The phone half below is
 * MoveToPhone's, unchanged; the Claude half is new.
 */

export type MoveTo = 'phone' | 'claude';
/** The hand-over code: counting down from 10 minutes, in its last seconds, run out, or used (Claude joined). */
export type ClaudeCode = 'fresh' | 'last' | 'expired' | 'joined';

const START: Record<ClaudeCode, number> = { fresh: 600, last: 14, expired: 0, joined: 0 };

export function MoveDialog({ to, onTo, code, onRenew, onClose }: { to: MoveTo; onTo: (t: MoveTo) => void; code: ClaudeCode; onRenew: () => void; onClose: () => void }) {
  const titleId = useId();
  if (to === 'claude' && code === 'joined') return <LetGo />;
  return (
    <div className="absolute inset-0 z-40 @container/shell">
      <div className="grid h-full place-items-center bg-void/70 p-4" role="dialog" aria-modal aria-labelledby={titleId} data-testid="move-dialog">
        <div className="flex w-full max-w-[720px] flex-col gap-3 rounded-sheet border-2 border-holo bg-panel p-4 shadow-glow">
          <header className="flex items-center gap-3">
            <h2 id={titleId} className="font-display text-xl font-semibold">
              Move my seat
            </h2>
            <MoveChoice to={to} onTo={onTo} />
          </header>
          {to === 'phone' ? <ToPhone /> : <ToClaude code={code} onRenew={onRenew} />}
          <Button size="md" variant="outline" autoFocus onClick={onClose} data-testid="handoff-done">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

/** DS-GAP: no segmented choice in @mule/ui; the pressed look is the lobby's species picker's. */
function MoveChoice({ to, onTo }: { to: MoveTo; onTo: (t: MoveTo) => void }) {
  const options: { id: MoveTo; title: string }[] = [
    { id: 'phone', title: 'To another phone' },
    { id: 'claude', title: 'Hand my seat to Claude' },
  ];
  return (
    <div className="ml-auto flex gap-1.5" role="group" aria-label="Where the seat goes" data-testid="move-choice">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === to}
          onClick={() => onTo(o.id)}
          className={cx('min-h-8 rounded-control border px-2.5 text-sm font-semibold', o.id === to ? 'border-2 border-holo bg-holo-soft text-ink shadow-glow' : 'border-holo-line text-ink-2 hover:border-holo')}
          data-testid={`move-${o.id}`}
        >
          {o.title}
        </button>
      ))}
    </div>
  );
}

function ToPhone() {
  return (
    <div className="flex items-center gap-4" data-testid="to-phone">
      <span className="shrink-0" data-testid="handoff-qr" data-state="ready">
        <Qr text={joinUrl(ROOM, 'h-7Q4K')} size={120} label="QR code to move to your phone" className="p-2!" />
      </span>
      <p className="text-sm text-ink-2">
        Scan this with your phone. It becomes <strong className="text-ink">you, Lena</strong>, mid-game, with your money, goods and plots. This screen then steps aside. The code works once, for
        2 minutes; the game doesn't pause.
      </p>
    </div>
  );
}

function ToClaude({ code, onRenew }: { code: ClaudeCode; onRenew: () => void }) {
  const left = useCountdown(START[code]);
  const expired = left === 0;
  return (
    <div className="grid grid-cols-2 gap-4" data-testid="to-claude" data-state={expired ? 'expired' : 'ready'}>
      <div className="flex flex-col gap-2">
        {expired ? (
          <div className="flex flex-col items-start gap-2 rounded-panel border border-holo-line bg-raised p-3" role="status" data-testid="claude-code-expired">
            <span className="font-mono text-base font-bold tracking-[0.08em] text-ink-3 line-through">{HANDOFF_CODE}</span>
            <span className="text-sm font-semibold">This code has expired.</span>
            <Button size="md" onClick={onRenew} data-testid="claude-code-renew">
              New code
            </Button>
          </div>
        ) : (
          <>
            <CopyLine label="Seat code" text={HANDOFF_CODE} testid="claude-code" big />
            <span className="flex items-center gap-2 text-sm text-ink-2" data-testid="claude-code-timer">
              Works for <Timer seconds={left} />
            </span>
          </>
        )}
        <p className="text-sm text-ink" data-testid="let-go-note">
          Your phone is let go once Claude joins.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-2">Paste the invite into a new chat with MULE on. You keep your money, goods and plots; the game doesn't pause.</p>
        {!expired && <CopyInvite code={HANDOFF_CODE} testid="claude-invite" />}
        <SetupLink testid="claude-setup-link" />
      </div>
    </div>
  );
}

/** Once Claude has joined with the code, this phone has let go of the seat. */
function LetGo() {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-table px-8 text-center text-ink" data-testid="let-go">
      <Chip word="CLAUDE · CONNECTED" className="px-2! py-0.5 text-sm!" />
      <h2 className="font-display text-2xl font-semibold">Claude plays your seat now</h2>
      <p className="max-w-[520px] text-ink-2">Lena's money, goods and plots went with it. This phone has stepped aside.</p>
    </div>
  );
}
