import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** A fixed-size design, scaled to fit its box: the big screen is drawn at 1280×720 and fills any TV. */
export function Scaled({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / width, el.clientHeight / height));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);
  return (
    <div ref={box} className="relative h-full w-full overflow-hidden">
      <div className="absolute left-1/2 top-1/2 origin-center" style={{ width, height, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
