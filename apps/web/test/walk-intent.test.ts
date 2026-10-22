import type { MuleIntent } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { WalkIntent } from '../src/phone/useWalkIntent';

/** A walk intent over a client that records what the phone sends. */
function phone() {
  const sent: MuleIntent[] = [];
  const intent = new WalkIntent({ intent: (i) => void sent.push(i) });
  return { intent, sent };
}

describe("the phone's walk intents", () => {
  it("FM-FU1: Up held across the goods auction's switch to the next good, the next good's first press still walks", () => {
    const { intent, sent } = phone();
    intent.board('food');
    intent.walk('up');
    // The bell: Food's board goes, Energy's status screen comes up while Up is still held.
    intent.board(null);
    intent.board('energy');
    sent.length = 0;
    intent.walk('up');
    expect(sent).toEqual([{ type: 'walk', dir: 'up' }]);
  });

  it('FM-FU1: the next board coming up with no screen in between still lets the first press walk', () => {
    const { intent, sent } = phone();
    intent.board('food');
    intent.walk('up');
    intent.board('energy');
    sent.length = 0;
    intent.walk('up');
    expect(sent).toEqual([{ type: 'walk', dir: 'up' }]);
  });

  it('FM-FU1 (negative): off the board a press sends nothing, and letting go at the bell is not sent to the next board', () => {
    const { intent, sent } = phone();
    intent.walk('up');
    intent.board('food');
    intent.walk('up');
    intent.board(null);
    intent.walk('stop');
    intent.walk('down');
    expect(sent).toEqual([{ type: 'walk', dir: 'up' }]);
  });

  it('FM-FU1 (negative): on one board, only a change of direction is sent', () => {
    const { intent, sent } = phone();
    intent.board('food');
    for (const dir of ['up', 'up', 'stop', 'stop', 'down', 'down', 'stop'] as const) intent.walk(dir);
    intent.board('food');
    intent.walk('stop');
    expect(sent.map((i) => i.type === 'walk' && i.dir)).toEqual(['up', 'stop', 'down', 'stop']);
  });
});
