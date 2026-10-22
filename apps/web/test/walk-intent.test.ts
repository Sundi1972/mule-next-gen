import type { MuleIntent } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { stepDir, WalkIntent } from '../src/phone/useWalkIntent';

/** A walk intent over a client that records what the phone sends. */
function phone() {
  const sent: MuleIntent[] = [];
  const intent = new WalkIntent({ intent: (i) => void sent.push(i) });
  return { intent, sent, dirs: () => sent.map((i) => i.type === 'walk' && i.dir) };
}

const MODAL = { aria: '[aria-modal="true"]', native: 'dialog[open]' } as const;

/** The page the key handlers look at, with this kind of modal open in it (or none), matched the way a selector list is. */
const page = (open: keyof typeof MODAL | null) => ({
  querySelector: (selectors: string) => (open && selectors.split(',').map((s) => s.trim()).includes(MODAL[open]) ? {} : null),
});

const key = (k: string) => ({ key: k });

describe("the phone's walk intents", () => {
  it("FM-FU1: Up held across the goods auction's switch to the next good, the next good's first press still walks", () => {
    const { intent, dirs } = phone();
    intent.board(true, 'food');
    intent.walk('up');
    // The bell: Energy's status screen comes up, off the board, while Up is still held.
    intent.board(false, 'energy');
    intent.board(true, 'energy');
    intent.walk('up');
    expect(dirs()).toEqual(['up', 'up']);
  });

  it('FM-FU1: the next round coming up with no screen in between still lets the first press walk', () => {
    const { intent, dirs } = phone();
    intent.board(true, 'food');
    intent.walk('up');
    intent.board(true, 'energy');
    intent.walk('up');
    expect(dirs()).toEqual(['up', 'up']);
  });

  it('FM-FU1 (negative): off the board nothing is sent, and the held direction is dropped', () => {
    const { intent, dirs } = phone();
    intent.walk('up');
    intent.board(true, 'food');
    intent.walk('up');
    // A Hold let go after the bell must not reach the server as a stop.
    intent.board(false, 'food');
    intent.walk('stop');
    intent.walk('down');
    intent.board(true, 'food');
    intent.walk('up');
    expect(dirs()).toEqual(['up', 'up']);
  });

  it('FM-FU1 (negative): on one round, only a change of direction is sent, and a re-render keeps the held one', () => {
    const { intent, dirs } = phone();
    intent.board(true, 'food');
    for (const dir of ['up', 'up', 'stop', 'stop', 'down', 'down', 'stop', 'up'] as const) intent.walk(dir);
    intent.board(true, 'food');
    intent.walk('up');
    expect(dirs()).toEqual(['up', 'stop', 'down', 'stop', 'up']);
  });

  it("FM-FU1: the board's steps map to their directions", () => {
    expect([stepDir(1), stepDir(-1), stepDir(0)]).toEqual(['up', 'down', 'stop']);
  });

  it('FM-modal-keys: with an aria-modal dialog open, ArrowUp sends no walk intent', () => {
    const { intent, dirs } = phone();
    intent.board(true, 'food');
    intent.keys(page('aria')).down(key('ArrowUp'));
    expect(dirs()).toEqual([]);
  });

  it('FM-modal-keys: with a native dialog open by showModal, ArrowDown sends no walk intent', () => {
    const { intent, dirs } = phone();
    intent.board(true, 'food');
    intent.keys(page('native')).down(key('ArrowDown'));
    expect(dirs()).toEqual([]);
  });

  it('FM-modal-keys (negative): with no dialog open, the arrows walk and letting go stops; other keys do nothing', () => {
    const { intent, dirs } = phone();
    intent.board(true, 'food');
    const { down, up } = intent.keys(page(null));
    down(key('a'));
    down(key('ArrowUp'));
    up(key('ArrowUp'));
    down(key('ArrowDown'));
    up(key('a'));
    expect(dirs(), 'letting go of another key leaves the held arrow walking').toEqual(['up', 'stop', 'down']);
    up(key('ArrowDown'));
    expect(dirs()).toEqual(['up', 'stop', 'down', 'stop']);
  });

  it('FM-modal-keys (negative): Up held as a dialog opens still stops when it is let go', () => {
    const { intent, dirs } = phone();
    intent.board(true, 'food');
    intent.keys(page(null)).down(key('ArrowUp'));
    // The dialog is open now; the key's own repeat must not walk, and letting go must not leave the walker walking.
    const inDialog = intent.keys(page('aria'));
    inDialog.down(key('ArrowUp'));
    inDialog.up(key('ArrowUp'));
    expect(dirs()).toEqual(['up', 'stop']);
  });
});
