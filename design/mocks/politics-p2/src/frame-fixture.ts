import { GOODS, type Terrain } from '@mule/engine';
import type { MuleView, MyView, PlayerView, PoliticsView, TableView, TileView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import type { TableClient } from '../../../../apps/web/src/net/client';
import { aMuleView, aPlayer } from '../../../../apps/web/test/fixtures/views';

/**
 * The politics RC's shared frame (P0): month 5 planning at a four-seat table, politics on, Lena holding this phone.
 * Fixture data only. The map and owners are the plot-info mock's month-5 table (design/mocks/plot-info/src/plots.ts).
 */
export const W = 15;
export const H = 9;
const ROWS = [
  'mmhppfrrpsdddtt',
  'mhppffrrppsddti',
  'hppplfrrppcsdti',
  'pppllprrpphhdii',
  'ppfpppSrrpphhmm',
  'fppvpprrpppdmmm',
  'ffppprrpplpdhmm',
  'sfpppprpplldhhm',
  'ssfpprrppplddhh',
];
const T: Record<string, Terrain> = {
  m: 'mountains', h: 'hills', p: 'plains', f: 'forest', r: 'river', s: 'swamp', d: 'desert', t: 'tundra', i: 'ice',
  l: 'lake', c: 'crater', v: 'volcanic', S: 'store',
};
const OWNED: Record<string, string> = {
  '6,2': 'lena', '7,2': 'lena', '7,3': 'lena', '6,5': 'lena', '5,5': 'lena', '4,3': 'lena', '5,6': 'lena',
  '12,4': 'ossa', '13,4': 'ossa', '12,5': 'ossa', '10,2': 'ossa', '1,4': 'ossa', '2,6': 'ossa', '11,1': 'ossa',
  '9,2': 'brix', '10,3': 'brix', '11,3': 'brix', '3,2': 'brix', '4,5': 'brix', '3,5': 'brix', '8,6': 'brix',
  '9,7': 'kai', '10,7': 'kai', '3,6': 'kai', '6,7': 'kai', '13,1': 'kai',
};
const TILES: TileView[] = ROWS.flatMap((row, y) =>
  [...row].map((c, x): TileView => {
    const terrain = T[c]!;
    return { x, y, terrain, peaks: terrain === 'mountains' ? 1 + ((x + y) % 3) : 0, owner: OWNED[`${x},${y}`] ?? null, outfit: null, pollution: 0, filter: false } as TileView;
  }),
);

export const PLAYERS: PlayerView[] = [
  aPlayer({ id: 'lena', name: 'Lena', slot: 0, species: 'zipwing', money: 640, plots: 7, worth: 4210 }),
  aPlayer({ id: 'ossa', name: 'Ossa', slot: 1, species: 'bramblet', isAi: true, ready: true, money: 910, plots: 7, worth: 5120 }),
  aPlayer({ id: 'brix', name: 'Brix', slot: 2, species: 'gearling', money: 380, plots: 7, worth: 3880 }),
  aPlayer({ id: 'kai', name: 'Kai', slot: 3, species: 'mollox', isAi: true, ready: true, money: 215, plots: 5, worth: 2950 }),
];

const NONE = Object.fromEntries(GOODS.map((g) => [g, 0])) as MyView['stock'];

/** Politics on: Ossa governs, Brix is Sheriff (P7's desk shows to Brix), Lena holds no office. */
function politics(governor: string, sheriff: string | null): PoliticsView {
  return {
    governor, sheriff, term: [4, 7], next: 8, baron: 'ossa',
    tax: { percent: 8, start: 8, low: 0, high: 20 }, fund: 640, pay: { governor: 40, sheriff: 30 },
    weights: PLAYERS.map((p) => ({ id: p.id, votes: 3, parts: [] as never })),
    candidates: {}, promises: {}, promise: null, promiseFrom: 8, election: null, proposal: null, council: null, laws: {}, retry: {},
  };
}

/** Who holds this phone, and which office they hold, picks the desks the frame draws. */
export type Seat = 'lena' | 'governor' | 'sheriff';
const HOLDER: Record<Seat, string> = { lena: 'lena', governor: 'ossa', sheriff: 'brix' };

export function viewFor(seat: Seat): { view: MuleView; me: MyView; self: PlayerView; table: TableView<MuleView>; slot: Slot } {
  const id = HOLDER[seat];
  const me = { id, monthNeeds: NONE, stock: { ...NONE, food: 4, energy: 3 }, droneOrder: [], analysed: [], droneFound: [] } as unknown as MyView;
  const view = aMuleView({
    players: PLAYERS, me, politics: politics('ossa', 'brix'),
    month: 5, phase: 'planning', width: W, height: H, tiles: TILES,
  });
  const self = PLAYERS.find((p) => p.id === id)!;
  const table = { code: 'MULE', status: 'playing', hostId: 'lena', boards: 1, seats: [], game: view } as unknown as TableView<MuleView>;
  return { view, me, self, table, slot: self.slot as Slot };
}

/** Nothing said, a still clock: enough for the whole hub to render; every intent is dropped. */
export function clientFor(seat: Seat): TableClient {
  const state = { status: 'open', role: 'player', code: 'MULE', seatId: HOLDER[seat], view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  return { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, intent: () => {} } as unknown as TableClient;
}
