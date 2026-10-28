/** The screen a map is drawn on: CSS pixels either way round, and device pixels per CSS pixel. */
export interface DeviceScreen {
  width: number;
  height: number;
  dpr: number;
}

export function landscapePxPerTile(_map: { width: number; height: number }, _screen: DeviceScreen): number {
  throw new Error('NotImplemented: landscape-px-per-tile');
}
