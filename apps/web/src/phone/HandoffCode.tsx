import { Button, cx } from '@mule/ui';
import type { HandoffCode as Code } from '../net/client';
import { Qr } from '../components/Qr';

export type CodeState = 'waiting' | 'ready' | 'expired';

/** Waiting until the asked-for code arrives, then ready until its time is up. */
export function codeState(code: Code | null): CodeState {
  if (!code) return 'waiting';
  return code.expired ? 'expired' : 'ready';
}

/** The move-to-phone QR in its three states. Expired greys it out and offers a new code, so the dialog never shows an empty square. */
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
            <Qr text={url} size={120} label="QR code to move to your phone" className="p-2! @min-[1100px]/shell:hidden" />
            <span className="hidden @min-[1100px]/shell:block">
              <Qr text={url} size={220} label="QR code to move to your phone" className="p-3!" />
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
