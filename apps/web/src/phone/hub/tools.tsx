import { DEVELOPMENT } from '@mule/engine';
import { Button, GOOD_NAME, HoloMap, TERRAIN_NAME, type MapTile } from '@mule/ui';
import { mapTiles, player, plotName, TERRAIN_ODDS, tileAt } from '../../game/derive';
import { SpecialLine } from '../../components/SpecialLine';
import { useClient } from '../../net/react';
import { usePhoneGame } from '../game';
import { GroundCard } from '../ground';
import { SellMap } from '../Sell';
import { MapFit, useWide } from '../Shell';
import { useToday } from './state';

/* Today's map tools: Look, the geo drone (planning's drone flow) and selling a plot (the Sell form's map). */

const free = (t: MapTile) => t.owner === null && t.terrain !== 'store';

/** Look: tap a plot to see what it is and whose. */
export function LookMap() {
  const { view, slot } = usePhoneGame();
  const { looked, setLooked } = useToday();
  const wide = useWide();
  const tap = (t: MapTile) => {
    if (t.terrain === 'store') return;
    setLooked(looked?.x === t.x && looked.y === t.y ? null : { x: t.x, y: t.y });
  };
  return (
    <MapFit width={view.width} height={view.height}>
      <HoloMap width={view.width} height={view.height} tiles={mapTiles(view)} onTile={tap} selected={looked} focusSlot={slot} density={wide ? 'tv' : 'phone'} />
    </MapFit>
  );
}

/** The plot looked at: where, what ground, whose, and what its MULE makes. */
export function LookPanel() {
  const { view, me } = usePhoneGame();
  const { looked, setLooked } = useToday();
  const tile = looked ? tileAt(view, looked.x, looked.y) : undefined;
  if (!tile) return null;
  const owner = player(view, tile.owner);
  return (
    <section className="flex flex-col gap-0.5 rounded-control border border-holo-line bg-panel p-2 @min-[1100px]/shell:p-3" data-testid="look-plot">
      <span className="label-caps flex justify-between gap-2">
        Plot {plotName(tile.x, tile.y)}
        <button type="button" className="font-mono text-[10px] text-ink-3 underline" onClick={() => setLooked(null)}>
          CLOSE
        </button>
      </span>
      <span className="font-display text-lg font-semibold leading-tight">
        {TERRAIN_NAME[tile.terrain]} <span className="font-mono text-xs text-holo">{tile.owner === me.id ? 'YOURS' : owner ? owner.name.toUpperCase() : 'FREE'}</span>
      </span>
      <SpecialLine special={tile.special} />
      {tile.outfit && <span className="text-xs text-ink-2">A MULE here makes {tile.outfit === 'greenBelt' ? 'a green belt' : GOOD_NAME[tile.outfit]}.</span>}
      {tile.ground ? (
        <GroundCard ground={tile.ground} />
      ) : (
        <span className="text-xs text-ink-2" data-testid="terrain-hint">
          {TERRAIN_ODDS[tile.terrain]}
        </span>
      )}
    </section>
  );
}

/** Whether the drone was sent this month, and the plots it was sent to or that are picked for it. */
function useDrone() {
  const { me } = usePhoneGame();
  const { picked, setPicked } = useToday();
  const ordered = me.droneOrder.length > 0;
  return { ordered, chosen: ordered ? me.droneOrder : picked, picked, setPicked };
}

/** Pick one or two free plots for the geo drone. Results arrive, only for you, when the land grant starts. */
export function DroneMap() {
  const { view } = usePhoneGame();
  const { ordered, chosen, setPicked } = useDrone();
  const wide = useWide();
  const tiles: MapTile[] = mapTiles(view).map((t) => (chosen.some((p) => p.x === t.x && p.y === t.y) ? { ...t, flag: 'survey' } : t));
  const toggle = (t: MapTile) => {
    if (ordered || !free(t)) return;
    setPicked((p) => (p.some((q) => q.x === t.x && q.y === t.y) ? p.filter((q) => q.x !== t.x || q.y !== t.y) : [...p, { x: t.x, y: t.y }].slice(-DEVELOPMENT.dronePlots)));
  };
  return (
    <MapFit width={view.width} height={view.height}>
      <HoloMap width={view.width} height={view.height} tiles={tiles} onTile={toggle} selected={chosen.at(-1) ?? null} density={wide ? 'tv' : 'phone'} />
    </MapFit>
  );
}

export function DroneRail() {
  const { view } = usePhoneGame();
  const { ordered, chosen } = useDrone();
  const last = chosen.at(-1);
  const lastTile = last ? tileAt(view, last.x, last.y) : undefined;
  return (
    <section className="flex flex-col gap-1.5" data-testid="drone">
      <p className="text-xs text-ink-2">
        {ordered
          ? 'Your drone is on its way. Only you will see what it finds, in time for the land grant.'
          : `Tap up to ${DEVELOPMENT.dronePlots} free plots. The drone reads their ground from orbit for ${DEVELOPMENT.droneFee} cr, before anyone claims them.`}
      </p>
      {lastTile && (
        <div className="flex flex-col gap-0.5 border-t border-holo-faint pt-2">
          <span className="label-caps flex justify-between">
            Plot {plotName(lastTile.x, lastTile.y)} <span className="text-holo">{ordered ? 'ON ITS WAY' : 'PICKED'}</span>
          </span>
          <span className="font-display text-lg font-semibold">{TERRAIN_NAME[lastTile.terrain]}</span>
          <SpecialLine special={lastTile.special} />
          <span className="text-xs text-ink-2" data-testid="terrain-hint">
            {TERRAIN_ODDS[lastTile.terrain]}
          </span>
        </div>
      )}
    </section>
  );
}

export function DroneAction() {
  const client = useClient();
  const { self } = usePhoneGame();
  const { ordered, picked } = useDrone();
  if (ordered) return null;
  return (
    <Button size="md" className="w-full px-2" disabled={picked.length === 0 || self.money < DEVELOPMENT.droneFee} onClick={() => client.intent({ type: 'drone', plots: picked })}>
      {picked.length === 0 ? 'Pick a free plot' : `Send the drone · ${DEVELOPMENT.droneFee} cr`}
    </Button>
  );
}

/** Sell a plot: tap one of yours, with every listed plot marked for sale; the Market desk holds the form. */
export function SellPlotMap() {
  const { sell } = useToday();
  const wide = useWide();
  return <SellMap sell={sell} density={wide ? 'tv' : 'phone'} />;
}

export function ListAction() {
  const { sell } = useToday();
  if (!sell.tile) return null;
  return (
    <Button size="md" className="w-full px-2" disabled={!!sell.blocked} onClick={sell.list} data-testid="list">
      {sell.blocked ?? `Put it up for auction · ≥${sell.minimum}`}
    </Button>
  );
}
