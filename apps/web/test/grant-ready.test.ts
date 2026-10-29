import type { PlayerView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { grantFooter, NAMES_SHOWN, waitingLine } from '../src/phone/grant-ready';

const person = (id: string, name: string, slot: number, ready = false, isAi = false): PlayerView => ({
  id,
  name,
  isAi,
  color: '',
  slot,
  species: 'mollox',
  money: 1000,
  worth: 0,
  plots: 0,
  ready,
  doneDeveloping: false,
  colonist: null,
  condition: null,
});

describe('Done with land on the phone', () => {
  it('names everyone else still claiming, an AI too, with a dropped phone marked away; the viewer reads ready once done', () => {
    const players = [person('s1', 'Brix', 0), person('s2', 'Kai', 1, false, true), person('s3', 'Ossa', 2), person('s4', 'Lena', 3, true)];
    const connected = (id: string) => id !== 's3';
    const before = grantFooter(players, 's1', connected);
    expect(before.ready).toBe(false);
    expect(before.waiting.map((s) => [s.name, s.away])).toEqual([
      ['Kai', false],
      ['Ossa', true],
    ]);
    const after = grantFooter(players.map((p) => (p.id === 's1' ? { ...p, ready: true } : p)), 's1', connected);
    expect(after.ready).toBe(true);
    expect(after.waiting.map((s) => s.name)).toEqual(['Kai', 'Ossa']);
  });
});

describe("the compact footer's waiting line", () => {
  const seat = (name: string) => ({ name });

  it('shows everyone when they fit, shorter names first, with no "+N"', () => {
    expect(NAMES_SHOWN).toBe(2);
    const line = waitingLine([seat('The Good Neighbour'), seat('Lena')]);
    expect(line.shown.map((s) => s.name)).toEqual(['Lena', 'The Good Neighbour']);
    expect(line.more).toBe(0);
  });

  it('shows the two shortest names and counts the rest as "+N"', () => {
    const line = waitingLine([seat('The Accountant'), seat('Brix'), seat('The Baron'), seat('Kai')]);
    expect(line.shown.map((s) => s.name)).toEqual(['Kai', 'Brix']);
    expect(line.more).toBe(2);
  });

  it('keeps the order of equally long names and leaves the seats it was given unsorted', () => {
    const seats = [seat('Ossa'), seat('Brix'), seat('Lena')];
    const line = waitingLine(seats);
    expect(line.shown.map((s) => s.name)).toEqual(['Ossa', 'Brix']);
    expect(line.more).toBe(1);
    expect(seats.map((s) => s.name)).toEqual(['Ossa', 'Brix', 'Lena']);
  });

  it('draws nothing to wait for when nobody is waiting', () => {
    expect(waitingLine([])).toEqual({ shown: [], more: 0 });
  });
});
