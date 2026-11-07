import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * MOCK PLUMBING, not a design: the build drops it. A mock may not edit apps/, so to show a new piece inside a real
 * component (the TV's planning header, the month end's ColonyPanel, the Colony desk's fund card) the real component
 * renders as built and the piece is portalled in at the exact place the builder puts it: after the element `at`
 * selects, before the one `before` selects, or as its last child with `into`. Each use names its graft target.
 */
export function Graft({ at, before, into, className, children }: { at?: string; before?: string; into?: string; className?: string; children: ReactNode }) {
  const probe = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // The real component is the probe's previous sibling's subtree: search the nearest frame the mock drew it in.
    const scope = probe.current?.closest('[data-graft-scope]') ?? document.body;
    const where = (at ?? before ?? into)!;
    const anchor = scope.querySelector<HTMLElement>(where);
    if (!anchor) return;
    const el = document.createElement('div');
    if (className) el.className = className;
    el.dataset.graft = where;
    if (at) anchor.after(el);
    else if (before) anchor.before(el);
    else anchor.append(el);
    setHost(el);
    return () => {
      el.remove();
      setHost(null);
    };
  }, [at, before, into, className]);
  return (
    <>
      <span ref={probe} hidden />
      {host && createPortal(children, host)}
    </>
  );
}
