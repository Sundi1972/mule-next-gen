import type { MuleIntent, MuleView, PlayerView, TableView } from '@mule/protocol';

export type Seat = Pick<PlayerView, 'id' | 'name' | 'isAi' | 'ready' | 'slot'> & { away: boolean };

export function stillPlanning(players: readonly PlayerView[], connected: (id: string) => boolean): Seat[] {
  throw new Error('NotImplemented: stillPlanning');
}

export function connectedIn(seats: TableView<MuleView>['seats']): (id: string) => boolean {
  throw new Error('NotImplemented: connectedIn');
}

export function namesOf(seats: readonly Seat[], me: string | null): string {
  throw new Error('NotImplemented: namesOf');
}

export function readyNow(others: readonly Seat[], isHost: boolean): { title: string; detail: string } {
  throw new Error('NotImplemented: readyNow');
}

export function planningProper(view: Pick<MuleView, 'phase' | 'politics'>): boolean {
  throw new Error('NotImplemented: planningProper');
}

export interface FooterIn {
  me: string;
  players: readonly PlayerView[];
  hostId: string | null;
  connected: (id: string) => boolean;
  planningProper: boolean;
  confirm: boolean;
}

export interface Footer {
  ready: boolean;
  waiting: Seat[];
  host: 'none' | 'continue' | 'confirm';
}

export function readyFooter(input: FooterIn): Footer {
  throw new Error('NotImplemented: readyFooter');
}

export type Press = 'ready' | 'continue' | 'continue-now' | 'keep-waiting';

export function press(confirm: boolean, pressed: Press): { confirm: boolean; intent: MuleIntent | null } {
  throw new Error('NotImplemented: press');
}
