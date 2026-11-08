import { cx, EventLivingMap, EventShow, EventTvLog, eventSegments, SeatSpeciesProvider, type ShowEventView, type Slot } from '@mule/ui';
import { useEffect, useMemo, useState } from 'react';
import { mapTiles, seatSpecies } from '../../../../../apps/web/src/game/derive';
import { OnlyYou } from '../../../../../apps/web/src/phone/hub/OnlyYou';
import { viewFor } from '../fixture';
import { SCENARIOS, type Scenario, type SabotageEvent } from './events';
import { SabotageFx } from './SabotageFx';

const INTRO_MS = 1200;

/** The TV's production show at 1280 × 720, scaled to fit the page: the real map and log, P10's proposed layer over the map. */
function TvShow({ event, t }: { event: SabotageEvent; t: number }) {
  const { view } = viewFor('lena');
  const tiles = useMemo(() => mapTiles(view), [view]);
  const players = view.players.map((p) => ({ id: p.id, name: p.name, slot: p.slot as Slot, species: p.species }));
  return (
    // The TV's frame, not a design value: 1280 × 720 at 0.6.
    <div className="overflow-hidden rounded-panel border border-holo-line" style={{ width: 768, height: 432 }} data-testid="p10-tv">
      <div className="origin-top-left bg-table px-10 py-6 text-ink" style={{ width: 1280, height: 720, transform: 'scale(0.6)' }}>
        <SeatSpeciesProvider value={seatSpecies(view)}>
          <EventShow events={[event as unknown as ShowEventView]} introMs={INTRO_MS} t={t} mode="tv" width={view.width} height={view.height} tiles={tiles} players={players}>
            <div className="flex h-full gap-6">
              <div className="w-[820px] shrink-0 self-start">
                <EventLivingMap size="tv" className="w-full" over={<SabotageFx players={players} />} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3" data-testid="p10-rail">
                <EventTvLog />
              </div>
            </div>
          </EventShow>
        </SeatSpeciesProvider>
      </div>
    </div>
  );
}

/** What each phone says once the event has played: only the people it concerns, each their own line. */
const PHONE_LINES: Record<Scenario, { who: string; line: string; tone: 'alert' | 'ok' | 'ink' }[]> = {
  cutWorked: [
    { who: 'Lena (ordered it)', line: 'Your crew cut the power to Ossa’s smithore plot. Nobody saw. 120 cr at the month end.', tone: 'ok' },
    { who: 'Ossa (the victim)', line: 'Your smithore plot went dark: sabotage. It makes nothing this month.', tone: 'alert' },
    { who: 'Brix (Sheriff)', line: 'A new case: a power cut on Ossa’s smithore plot. Investigate it in planning.', tone: 'ink' },
  ],
  cutGuarded: [
    { who: 'Lena (ordered it)', line: 'Caught by a guard at Ossa’s plot. −10 reputation; the Sheriff can fine you.', tone: 'alert' },
    { who: 'Ossa (the victim)', line: 'A guard caught Lena at your smithore plot. The power stayed on.', tone: 'ok' },
    { who: 'Brix (Sheriff)', line: 'Your guard caught Lena at Ossa’s plot. Fine Lena in planning.', tone: 'ok' },
  ],
  cutSeen: [
    { who: 'Lena (ordered it)', line: 'The cut worked, but you were seen. −10 reputation; the Sheriff can fine you.', tone: 'alert' },
    { who: 'Ossa (the victim)', line: 'Your smithore plot went dark. Lena was seen doing it.', tone: 'alert' },
    { who: 'Brix (Sheriff)', line: 'Lena was seen cutting Ossa’s power. Fine Lena in planning.', tone: 'ink' },
  ],
  rumourWorked: [
    { who: 'Lena (ordered it)', line: 'Your rumour took: Food opens 25% higher at the auction. Nobody saw.', tone: 'ok' },
    { who: 'Brix (Sheriff)', line: 'A new case: a rumour on Food. Investigate it in planning.', tone: 'ink' },
  ],
  rumourSeen: [
    { who: 'Lena (ordered it)', line: 'Your rumour was seen and did not take. −10 reputation; the Sheriff can fine you.', tone: 'alert' },
    { who: 'Brix (Sheriff)', line: 'Lena was seen starting a rumour on Food. Fine Lena in planning; it all goes to the fund.', tone: 'ink' },
  ],
};

/** The month end's news line, everyone's: "Sabotage" and "someone" or a name, never more. */
const MONTH_END: Record<Scenario, string> = {
  cutWorked: 'Sabotage: someone cut the power to Ossa’s smithore plot.',
  cutGuarded: 'Sabotage: Lena was caught by a guard at Ossa’s plot. The power stayed on.',
  cutSeen: 'Sabotage: Lena cut the power to Ossa’s smithore plot, and was seen.',
  rumourWorked: 'Sabotage: a rumour moved Food’s opening price 25% up.',
  rumourSeen: 'Sabotage: Lena was caught starting a rumour on Food.',
};

export function P10Page() {
  const [id, setId] = useState<Scenario>('cutGuarded');
  const event = SCENARIOS.find((s) => s.id === id)!.event;
  const end = useMemo(() => eventSegments({ events: [event as unknown as ShowEventView], introMs: INTRO_MS }).at(-1)!.endAt + 0.5, [event]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => setT(0), [id]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setT((x) => {
        const n = x + (now - last) / 1000;
        if (n >= end) setPlaying(false);
        return Math.min(n, end);
      });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, end]);
  return (
    <div className="flex flex-col gap-4" data-testid="p10">
      <p className="max-w-3xl text-sm text-ink-2">
        Production’s show on the TV, the real living map and log, with P10’s proposed sabotage layer over the map (PROPOSED,
        DS-GAP). Pick what happened; press Play or drag the clock. Below: the line each phone gets, and the month end’s.
      </p>
      <div role="radiogroup" aria-label="What happened" className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={id === s.id} onClick={() => setId(s.id)} data-testid={`p10-${s.id}`}
            className={cx('h-11 rounded-control border px-4 text-sm font-semibold', id === s.id ? 'border-holo bg-holo-soft' : 'border-holo-line text-ink-2')}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => (t >= end ? (setT(0), setPlaying(true)) : setPlaying((p) => !p))} className="h-11 rounded-control border border-holo bg-holo-soft px-4 text-sm font-semibold" data-testid="p10-play">
          {playing ? 'Pause' : t >= end ? 'Replay' : 'Play'}
        </button>
        <input type="range" min={0} max={end} step={0.05} value={t} onChange={(e) => (setPlaying(false), setT(Number(e.target.value)))} className="w-[600px]" aria-label="Show clock" data-testid="p10-clock" />
        <span className="font-mono text-sm text-ink-2">{t.toFixed(1)} s</span>
      </div>
      <TvShow key={id} event={event} t={t} />
      <section className="flex flex-col gap-2" data-testid="p10-phones">
        <h2 className="font-display text-lg font-semibold">Each phone, after the show</h2>
        <ul className="flex flex-wrap gap-3">
          {PHONE_LINES[id].map((l) => (
            <li key={l.who} className="flex w-[300px] flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2.5" data-testid="p10-phone-line">
              <span className="flex items-center justify-between">
                <span className="label-caps text-[10px]!">{l.who}</span>
                <OnlyYou />
              </span>
              <span className={cx('text-sm', l.tone === 'alert' ? 'text-alert' : l.tone === 'ok' ? 'text-ok' : 'text-ink')}>{l.line}</span>
            </li>
          ))}
        </ul>
        <h2 className="font-display text-lg font-semibold">The month end, everyone’s</h2>
        <p className="max-w-xl rounded-panel border border-holo-line bg-panel p-2.5 text-sm" data-testid="p10-month-end">{MONTH_END[id]}</p>
      </section>
    </div>
  );
}
