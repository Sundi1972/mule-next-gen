import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../mock.css';
import '../../review-loop/select-client';
import { BEATS } from '../steps';
import { TV_NOTE, TvScreenView, type TvFocus } from './TvFor';
import { SHERIFF_BEATS } from '../sheriff-path';
import { tvScreen, type Seats } from './world';

/*
 * MOCK PLUMBING: the TV alone, for this builder's own checks (TV-FIT, page errors); the prototype itself is the phone
 * side's page. /src/tv/solo.html?beat=<id>: the guided path's own world for that beat, as the prototype hands it to the
 * TV, and its focus. Options, for measuring only:
 *   &seats=2|6  the table at another size (world.ts);
 *   &call=1     a seat has called the overrule (what the store does on the Call tap), opened as the
 *               'overrule-called' moment: the call's moment and, after TV_EVENT_HOLD_S, its folded line.
 */

const Q = new URLSearchParams(location.search);
/** The planning path's beats and the Sheriff month's (?path=sheriff on the guided page). */
const ALL = [...BEATS, ...SHERIFF_BEATS];

/** Every TvBody / FitHeight scale on the page, as data-fit says (the real TvFit's own readout), and a moment if one shows. */
function FitReadout() {
  const [fits, setFits] = useState('');
  useEffect(() => {
    const t = setInterval(() => {
      const tv = document.querySelector('[data-testid="tv"]');
      const fit = [...(tv?.querySelectorAll('[data-fit]') ?? [])].map((el) => el.getAttribute('data-fit')).join(' · ');
      setFits(`${fit}${tv?.querySelector('[data-testid="tv-moment"]') ? ' · moment' : ''}`);
    }, 300);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-sm" data-testid="solo-fit">
      TV-FIT {fits}
    </span>
  );
}

function Beat({ id }: { id: string }) {
  const beat = ALL.find((b) => b.id === id) ?? BEATS[0]!;
  const seats = (Number(Q.get('seats')) || 4) as Seats;
  const call = Q.get('call') === '1';
  const focus: TvFocus = call ? 'overrule-called' : ((beat.tvWanted ?? beat.tv) as TvFocus);
  const screen = useMemo(() => {
    const w = beat.world();
    if (!call) return tvScreen(w, { seats });
    // The caller: the beat's seat if it sits at this table size, else the first seat that is not the Governor.
    const { game } = tvScreen(w, { seats });
    const at = game.players.filter((p) => p.id !== game.politics?.governor);
    return tvScreen({ ...w, call: (at.find((p) => p.id === beat.seat) ?? at[0])?.id ?? beat.seat }, { seats });
  }, [beat, seats, call]);
  const opensOn = focus === 'deal-broken' ? 'break' : focus === 'overrule-called' ? 'call' : focus === 'investigation' ? 'investigation' : null;
  return (
    <div className="flex flex-col gap-2 bg-table text-ink">
      <div className="flex items-center gap-4 px-2">
        <a className="text-holo underline" href="?" data-testid="solo-back">
          All beats
        </a>
        <span className="font-mono text-sm">
          {beat.id} · {focus} · {seats} seats
        </span>
        <span className="text-sm">{TV_NOTE[focus]}</span>
        <FitReadout />
      </div>
      <TvScreenView screen={screen} focus={focus} opensOn={opensOn} />
    </div>
  );
}

function Solo() {
  const beat = Q.get('beat');
  if (beat) return <Beat id={beat} />;
  return (
    <ul className="flex flex-col gap-2 p-6 text-ink" data-testid="solo-index">
      {ALL.map((b) => (
        <li key={b.id}>
          <a className="text-holo underline" href={`?beat=${b.id}`} data-testid={`solo-beat-${b.id}`}>
            beat {b.id}
          </a>{' '}
          <span className="text-ink-2">
            {b.tvWanted ?? b.tv}: {TV_NOTE[(b.tvWanted ?? b.tv) as TvFocus]}
          </span>
        </li>
      ))}
    </ul>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Solo />
  </StrictMode>,
);
