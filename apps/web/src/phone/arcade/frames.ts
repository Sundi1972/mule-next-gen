import type { DEV_STEER } from '@mule/engine';
import type { DevFrame } from '@mule/protocol';

/** Everyone else's colonists from the frames (RULE-10). Not built yet: its tests first. */

export interface FrameLog {
  frames: { frame: DevFrame; recvMs: number }[];
}

export type Drawn = DevFrame['colonists'][number];

const notYet = (): never => {
  throw new Error('the frame log: not built yet');
};

export const startFrameLog = (): FrameLog => notYet();
export const pushFrame = (_log: FrameLog, _frame: DevFrame, _recvMs: number): FrameLog => notYet();
export const othersAt = (_log: FrameLog, _nowMs: number, _cfg: Pick<typeof DEV_STEER, 'interpolateMs'>): Map<string, Drawn> => notYet();
