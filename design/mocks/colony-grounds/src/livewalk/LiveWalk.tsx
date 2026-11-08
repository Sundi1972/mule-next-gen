import { ColonyGrounds, GroundsOpener, type ColonyGroundsProps, type GroundsManifest, type Light, type OpenerState } from '@mule/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadGroundsManifest } from '../../../../../apps/web/src/components/Grounds';
import { COLONY } from '../tvbeat/TvBeat';

/**
 * The colonists live, as the game draws them: the real GroundsOpener (TV) and ColonyGrounds (phone), the shipped art and
 * manifest, the live layer's own clock. For Heiko's look at Astronaut A (8 Nov), embedded in spike.html.
 */
const STILL: OpenerState = { kind: 'still', ms: 3_000, baseline: true, playing: false, changes: [{ id: 'stadium', name: 'Stadium', from: 'building', to: 'standing', place: { x: 3, y: 2, w: 2, h: 2 } }] };
/** Down the path on the Hospital's far (west) side and back round: hidden by the hall and the Hospital most of the way. */
const BEHIND: [number, number][][] = [0, 1].map(() => [[-0.5, -1.5], [-0.5, 2.5]]);
/** Where the close-up centres on the 1280 × 720 TV canvas: the Hospital and the hall's west path. */
const FOCUS = [540, 500];
const happy = { ...COLONY, gauges: { ...COLONY.gauges, happiness: 90 } };

function Seg<T extends string>({ label, value, options, set }: { label: string; value: T; options: [T, string][]; set: (v: T) => void }) {
  return (
    <span className="seg" role="group" aria-label={label}>
      {options.map(([v, words]) => (
        <button key={v} aria-pressed={value === v} onClick={() => set(v)}>{words}</button>
      ))}
    </span>
  );
}

export function LiveWalk() {
  const [manifest, setManifest] = useState<GroundsManifest | null>(null);
  const [light, setLight] = useState<Light>('dusk');
  const [screen, setScreen] = useState<'tv' | 'phone'>('tv');
  const [kind, setKind] = useState<'astro' | 'today'>('astro');
  const [players, setPlayers] = useState<'4' | '2'>('4');
  const [behind, setBehind] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => void loadGroundsManifest().then(setManifest), []);
  // The TV's 1280 × 720 canvas scaled to the page's width, as the TV scales it to its screen.
  const [k, setK] = useState(() => Math.min(1, window.innerWidth / 1280));
  useEffect(() => {
    const fit = () => setK(Math.min(1, window.innerWidth / 1280));
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);
  // Today's colonist: the same manifest without the walker sheets, so the live layer draws its SVG figure.
  const shown = useMemo(() => (manifest && kind === 'today' ? { ...manifest, walker: undefined } : manifest), [manifest, kind]);
  const extra = { players: Number(players), routes: behind ? BEHIND : undefined };
  const Scene = useMemo(() => (props: Omit<ColonyGroundsProps, 'manifest'>) => <ColonyGrounds {...props} {...extra} light={light} manifest={shown} />, [light, shown, players, behind]);

  let stage: ReactNode;
  if (screen === 'tv') {
    stage = (
      <div className="tvbox" style={{ width: 1280 * k, height: 720 * k }}>
        <div className="tv" style={zoom ? { transform: `scale(${2 * k})`, transformOrigin: '0 0', left: k * (640 - 2 * FOCUS[0]), top: k * (360 - 2 * FOCUS[1]) } : { transform: `scale(${k})`, transformOrigin: '0 0' }}>
          <GroundsOpener opener={STILL} colony={happy} month={12} Scene={Scene} players={Number(players)} />
        </div>
      </div>
    );
  } else {
    stage = (
      <div className="phone" style={zoom ? { transform: 'scale(2)', transformOrigin: '45% 70%' } : undefined}>
        <ColonyGrounds colony={happy} size="phone" manifest={shown} light={light} {...extra} />
      </div>
    );
  }
  return (
    <main className="livewalk">
      <div className="controls">
        <Seg label="Colonist" value={kind} set={setKind} options={[['astro', 'Astronaut A'], ['today', "Today's colonist"]]} />
        <Seg label="Light" value={light} set={setLight} options={[['day', 'Day'], ['dusk', 'Dusk']]} />
        <Seg label="Screen" value={screen} set={setScreen} options={[['tv', 'TV'], ['phone', 'Phone']]} />
        <Seg label="Players" value={players} set={setPlayers} options={[['4', '4 players'], ['2', '2 players']]} />
        <span className="seg"><button aria-pressed={behind} onClick={() => setBehind(!behind)}>Behind a building</button></span>
        <span className="seg"><button aria-pressed={zoom} onClick={() => setZoom(!zoom)}>Close-up 2×</button></span>
      </div>
      <div className="frame">{stage}</div>
      <p className="note">
        {behind ? 'Two colonists walk down the path behind the hall and the Hospital: the buildings hide them, a faint outline shows where they are. ' : 'The colonists walk the paths round the hall. '}
        {players === '2' ? 'With two players seated, the colonists wear orange and blue, the rest the colony white or grey.' : 'Each wears a player colour; helmets and trims vary.'}
      </p>
    </main>
  );
}
