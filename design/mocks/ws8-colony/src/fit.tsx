import { cx } from '@mule/ui';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A copy of TableApp's FitHeight (apps/web/src/table/TableApp.tsx, not exported): its content at full size when it
 * fits, scaled down as a whole when it doesn't. The build reuses the real one; this keeps the mock honest about it.
 */
export function FitHeight({ className, children }: { className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      const b = box.current;
      const i = inner.current;
      if (!b || !i) return;
      const stretch = i.style.minHeight;
      i.style.minHeight = '0px';
      const natural = i.offsetHeight;
      i.style.minHeight = stretch;
      if (natural === 0) return;
      const next = Math.min(1, b.clientHeight / natural);
      setScale((s) => (Math.abs(s - next) < 0.005 ? s : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={cx('min-h-0 overflow-hidden', className)} data-fit={scale.toFixed(3)}>
      <div ref={inner} className="flex flex-col" style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: `${100 / scale}%`, minHeight: `${100 / scale}%` }}>
        {children}
      </div>
    </div>
  );
}
