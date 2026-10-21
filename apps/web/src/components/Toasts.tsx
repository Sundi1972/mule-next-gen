import { useClient, useClientState } from '../net/react';

/** Errors from the server, such as a rule a player broke, as small toasts that fade. */
export function Toasts() {
  const client = useClient();
  const { toasts } = useClientState();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4" aria-live="assertive">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          role="alert"
          onClick={() => client.dismiss(t.id)}
          className="pointer-events-auto max-w-sm rounded-control border border-alert bg-alert-bg px-4 py-2.5 text-left text-sm font-semibold text-alert-ink shadow-glow-alert"
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

/** A thin bar while the connection is down. The seat is kept; the phone rejoins by itself. */
export function ConnectionBar() {
  const { status } = useClientState();
  if (status !== 'reconnecting' && status !== 'connecting') return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-warn px-4 py-1.5 text-center font-mono text-xs font-bold text-void">
      {status === 'connecting' ? 'CONNECTING…' : 'CONNECTION LOST · REJOINING…'}
    </div>
  );
}
