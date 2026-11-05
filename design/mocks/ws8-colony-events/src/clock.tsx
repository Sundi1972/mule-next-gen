import { useEffect, useRef, useState } from 'react';

/** A clock in show seconds that plays, pauses, scrubs and restarts; it stops at `end`. The precedent's (ws8-events stage.tsx). */
export function useShowClock(end: number) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    last.current = null;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setT((v) => {
        const next = Math.min(end, v + dt * speed);
        if (next >= end) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);
  return {
    t,
    playing,
    speed,
    setSpeed,
    toggle: () => {
      if (t >= end) setT(0);
      setPlaying((p) => !p);
    },
    restart: () => {
      setT(0);
      setPlaying(true);
    },
    seek: (v: number) => {
      setT(v);
      setPlaying(false);
    },
  };
}
export type Clock = ReturnType<typeof useShowClock>;

/** The reviewer's controls: play, pause, scrub (with the moments that matter marked), speed, and reduced motion. */
export function Controls({ clock, end, reduced, setReduced, marks }: { clock: Clock; end: number; reduced: boolean; setReduced: (v: boolean) => void; marks: { at: number; label: string }[] }) {
  return (
    <div className="flex w-full max-w-[1280px] flex-wrap items-center gap-3 rounded-panel border border-holo-line bg-panel px-3 py-2" data-testid="controls">
      <button type="button" onClick={clock.toggle} className="w-20 rounded-control bg-holo px-3 py-1 font-display text-sm font-semibold text-on-holo" data-testid="play">
        {clock.playing ? 'Pause' : clock.t >= end ? 'Replay' : 'Play'}
      </button>
      <button type="button" onClick={clock.restart} className="rounded-control border border-holo-line px-3 py-1 text-sm" data-testid="restart">
        Restart
      </button>
      <div className="relative flex min-w-[320px] flex-1 flex-col">
        <input type="range" min={0} max={end} step={0.05} value={clock.t} onChange={(e) => clock.seek(Number(e.target.value))} className="w-full accent-[var(--color-holo)]" aria-label="Scrub the show" data-testid="scrub" />
        <div className="relative h-4 text-[10px] text-ink-3">
          {marks.map((m) => (
            <button type="button" key={m.label + m.at} onClick={() => clock.seek(m.at + 0.01)} className="absolute -translate-x-1/2 whitespace-nowrap hover:text-holo" style={{ left: `${(m.at / end) * 100}%` }} data-testid={`mark-${m.label}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <span data-num className="w-24 font-mono text-sm text-ink-2">
        {clock.t.toFixed(1)} / {end.toFixed(0)} s
      </span>
      <label className="flex items-center gap-1 text-sm text-ink-2">
        Speed
        <select value={clock.speed} onChange={(e) => clock.setSpeed(Number(e.target.value))} className="rounded-chip border border-holo-line bg-raised px-1 py-0.5 text-ink" data-testid="speed">
          {[0.25, 0.5, 1, 2].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-sm text-ink-2" data-testid="reduced-toggle">
        <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
        Reduced motion
      </label>
    </div>
  );
}
