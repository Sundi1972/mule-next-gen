import { AirGauge as UiAirGauge, airBandStyle } from '@mule/ui';
import { COLONY_AIR } from '../data';

export function airBand(level = COLONY_AIR) {
  return airBandStyle(level);
}

/** The colony's pollution gauge, at the prototype's made-up level. */
export function AirGauge({ level = COLONY_AIR, tv = false }: { level?: number; tv?: boolean }) {
  return <UiAirGauge level={level} tv={tv} />;
}
