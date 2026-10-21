import { Button, cx } from '@mule/ui';
import { useEffect, useState } from 'react';
import { Qr } from '../../../../../apps/web/src/components/Qr';

/**
 * The hand-off QR and its three states (WS4's gap, 2026-10-22), for the lobby's dialog and the in-game one alike:
 * waiting for the code (a few ms), the code, and the code expired (it lives 2 minutes). Expired greys the QR out,
 * says so, and offers a new code, so an open dialog never shows an empty square.
 * GRAFT TARGET: WS4's hand-off dialog (apps/web/src/phone/Lobby.tsx and the in-game dialog).
 * Testids: handoff-qr (data-state = waiting | ready | expired), handoff-renew.
 */

export type CodeState = 'waiting' | 'ready' | 'expired';

/** The mock's code: "New code" waits briefly, then shows a fresh one. */
export function useHandoffCode(start: CodeState) {
  const [state, setState] = useState(start);
  useEffect(() => {
    if (state !== 'waiting' || start === 'waiting') return;
    const id = setTimeout(() => setState('ready'), 400);
    return () => clearTimeout(id);
  }, [state, start]);
  return { state, renew: () => setState('waiting') };
}

export function HandoffCode({ url, state, onRenew }: { url: string; state: CodeState; onRenew: () => void }) {
  return (
    <span className="relative inline-grid shrink-0" data-testid="handoff-qr" data-state={state}>
      {state === 'waiting' ? (
        <span className="grid size-[120px] place-items-center rounded-panel border border-holo-line bg-panel-2 @min-[1100px]/shell:size-[220px]" role="status">
          <span className="animate-pulse font-mono text-xs text-ink-3 @min-[1100px]/shell:text-sm">Making a code…</span>
        </span>
      ) : (
        <>
          <span className={cx(state === 'expired' && 'opacity-20 grayscale')} aria-hidden={state === 'expired'}>
            <Qr text={url} size={120} className="p-2! @min-[1100px]/shell:hidden" />
            <span className="hidden @min-[1100px]/shell:block">
              <Qr text={url} size={220} className="p-3!" />
            </span>
          </span>
          {state === 'expired' && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-panel bg-panel/85 p-1 text-center @min-[1100px]/shell:gap-3" role="status">
              <span className="text-xs font-semibold text-ink @min-[1100px]/shell:text-lg">This code has expired.</span>
              <Button size="md" variant="holo" onClick={onRenew} data-testid="handoff-renew">
                New code
              </Button>
            </span>
          )}
        </>
      )}
    </span>
  );
}
