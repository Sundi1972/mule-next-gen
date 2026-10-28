import type { MuleView, MyView, PlayerView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { connectedIn, namesOf, planningProper, press, readyFooter, readyNow, readyNowIn, readyRows, stillPlanning, type Press, type ReadyRow } from '../src/phone/hub/ready';
import { ReadyBar } from '../src/phone/hub/ReadyBar';

const person = (id: string, name: string, slot: number, ready = false): PlayerView => ({
  id,
  name,
  isAi: false,
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
const ai = (id: string, name: string, slot: number): PlayerView => ({ ...person(id, name, slot), isAi: true });

/** Seat order: Brix hosts; Kai is an AI, whose ready flag the server leaves false; Ossa's phone is locked. */
const BRIX = 's1';
const LENA = 's2';
const KAI = 's3';
const OSSA = 's4';
const table = (players: PlayerView[], hostId: string | null = BRIX, away: string[] = [OSSA]): TableView<MuleView> => ({
  code: 'ABCD',
  status: 'playing',
  hostId,
  boards: 1,
  seats: players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: !away.includes(p.id), color: p.slot })),
  game: null,
});
const players = ({ brix = false, lena = false, ossa = false } = {}): PlayerView[] => [person(BRIX, 'Brix', 0, brix), person(LENA, 'Lena', 1, lena), ai(KAI, 'Kai', 2), person(OSSA, 'Ossa', 3, ossa)];
const planning = (stage: 'nominate' | 'ballot' | 'reveal' | 'over' | null = null, phase: MuleView['phase'] = 'planning') =>
  ({ phase, politics: stage === null ? null : { election: { stage } } }) as unknown as Pick<MuleView, 'phase' | 'politics'>;

describe('planning without a clock: who is still planning, and the host', () => {
  it('T-AC-13: every person not Ready is waited for, in seat order, a dropped one marked AWAY, never an AI; the names read "A", "A and B", "A, B and C", the viewer first as "you"', () => {
    const all = players({ brix: true });
    const waiting = stillPlanning(all, connectedIn(table(all).seats));
    expect(waiting.map((s) => [s.name, s.away])).toEqual([
      ['Lena', false],
      ['Ossa', true],
    ]);
    expect(stillPlanning(players({ brix: true, lena: true, ossa: true }), () => false), 'only the AI is left, and an AI is never waited for').toEqual([]);

    const seat = (id: string, name: string) => ({ id, name, isAi: false, ready: false, slot: 0, away: false });
    const [a, b, c] = [seat('a', 'Ada'), seat('b', 'Ben'), seat('c', 'Cy')];
    const rows: [Parameters<typeof namesOf>[0], string | null, string][] = [
      [[], null, ''],
      [[a], null, 'Ada'],
      [[a, b], null, 'Ada and Ben'],
      [[a, b, c], null, 'Ada, Ben and Cy'],
      [[a, b, c], 'b', 'you, Ada and Cy'],
      [[c], 'c', 'you'],
    ];
    for (const [seats, me, names] of rows) expect(namesOf(seats, me), `${seats.map((s) => s.name).join('+')} seen by ${me}`).toBe(names);

    const others = waiting;
    expect(readyNow(others, true).title).toBe("You're ready. Waiting for Lena and Ossa");
    expect(readyNow(others, true).detail).toContain('As the host, you can continue without them.');
    expect(readyNow(others, true).detail).toContain('Ossa is away.');
    expect(readyNow(others, false).title).toBe("You're ready. Waiting for Lena and Ossa");
    expect(readyNow(others, false).detail, 'a player who is not the host is not offered to continue').not.toContain('As the host');
    expect(readyNow([], true).title).toBe('Everyone is ready');
    expect(readyNowIn(planning(), true, others, true)?.title, 'a Ready player in planning proper is told who the table waits for').toBe("You're ready. Waiting for Lena and Ossa");
    expect(readyNowIn(planning('over'), true, others, false)?.title, 'after the election too').toBe("You're ready. Waiting for Lena and Ossa");
    for (const stage of ['nominate', 'ballot', 'reveal'] as const)
      expect(readyNowIn(planning(stage), true, others, true), `during the ${stage}, Ready is Done for the stage and the election's Now stays`).toBeNull();
    expect(readyNowIn(planning(), false, others, true), 'before Ready the screen keeps its own Now').toBeNull();
  });

  it("T-AC-13: the TV's ready list keeps a row for every person, Ready, planning or away, in seat order; from five seats the AIs fold into one row", () => {
    const line = (r: ReadyRow) => (r.kind === 'ais' ? `AIs: ${r.seats.map((s) => s.name).join(', ')}` : `${r.seat.name}${r.seat.ready ? ' ready' : ''}${r.seat.away ? ' away' : ''}`);
    const six = [person(BRIX, 'Brix', 0, true), ai('a1', 'The Accountant', 1), person(LENA, 'Lena', 2), ai('a2', 'The Baron', 3), person(OSSA, 'Ossa', 4), ai('a3', 'The Grudge', 5)];
    expect(readyRows(six, connectedIn(table(six).seats)).map(line)).toEqual(['Brix ready', 'Lena', 'Ossa away', 'AIs: The Accountant, The Baron, The Grudge']);
    expect(readyRows(players({ brix: true }), connectedIn(table(players()).seats)).map(line), 'four seats: every seat keeps its own row').toEqual(['Brix ready', 'Lena', 'Kai', 'Ossa away']);
    expect(readyRows(six.filter((p) => !p.isAi).concat(person('s5', 'Ada', 5), person('s6', 'Ben', 6)), () => true).map(line), 'five people and no AI: nothing folds').toEqual(['Brix ready', 'Lena', 'Ossa', 'Ada', 'Ben']);
  });

  it('T-AC-13: Continue is offered only to table.hostId, once Ready, in planning proper, while someone else is still planning; never to anyone else, nor during the election', () => {
    type Row = { why: string; me: string; ready: { brix?: boolean; lena?: boolean; ossa?: boolean }; hostId?: string | null; stage?: Parameters<typeof planning>[0]; confirm?: boolean; host: 'none' | 'continue' | 'confirm' };
    const rows: Row[] = [
      { why: 'the host, Ready, in planning proper, two still planning', me: BRIX, ready: { brix: true }, host: 'continue' },
      { why: 'the host after one tap on Continue', me: BRIX, ready: { brix: true }, confirm: true, host: 'confirm' },
      { why: 'the host, Ready, after the election', me: BRIX, ready: { brix: true }, stage: 'over', host: 'continue' },
      { why: 'only the dropped Ossa is left: she is still waited for', me: BRIX, ready: { brix: true, lena: true }, host: 'continue' },
      { why: 'the host before pressing Ready', me: BRIX, ready: {}, host: 'none' },
      { why: 'a player who is not the host', me: LENA, ready: { brix: true, lena: true }, host: 'none' },
      { why: 'a player who is not the host, with the confirm asked for', me: LENA, ready: { lena: true }, confirm: true, host: 'none' },
      { why: 'the host during the nomination', me: BRIX, ready: { brix: true }, stage: 'nominate', host: 'none' },
      { why: 'the host during the ballot', me: BRIX, ready: { brix: true }, stage: 'ballot', host: 'none' },
      { why: 'the host during the reveal', me: BRIX, ready: { brix: true }, stage: 'reveal', host: 'none' },
      { why: 'every person Ready, the AI left: nobody to continue without', me: BRIX, ready: { brix: true, lena: true, ossa: true }, host: 'none' },
      { why: 'a room with no host', me: BRIX, ready: { brix: true }, hostId: null, host: 'none' },
    ];
    for (const row of rows) {
      const all = players(row.ready);
      const t = table(all, row.hostId === undefined ? BRIX : row.hostId);
      const footer = readyFooter({ me: row.me, players: all, hostId: t.hostId, connected: connectedIn(t.seats), planningProper: planningProper(planning(row.stage ?? null)), confirm: row.confirm ?? false });
      expect(footer.host, row.why).toBe(row.host);
    }

    const before = readyFooter({ me: LENA, players: players({ brix: true }), hostId: BRIX, connected: connectedIn(table(players()).seats), planningProper: true, confirm: false });
    expect(before.ready).toBe(false);
    expect(namesOf(before.waiting, LENA), 'before Ready the line names the viewer first, as "you"').toBe('you and Ossa');
    const after = readyFooter({ me: LENA, players: players({ brix: true, lena: true }), hostId: BRIX, connected: connectedIn(table(players()).seats), planningProper: true, confirm: false });
    expect(after.ready).toBe(true);
    expect(after.waiting.map((s) => [s.name, s.away]), 'once Ready the line names the others; the dropped Ossa still, as away').toEqual([['Ossa', true]]);
    expect(planningProper(planning(null, 'landGrant')), 'Continue ends planning only').toBe(false);
  });

  it('T-AC-13: Ready → Continue → Continue now sends ready, nothing (the confirm opens), then continue; Keep waiting sends nothing and closes the confirm', () => {
    const run = (presses: Press[]) => {
      let confirm = false;
      const intents: (string | null)[] = [];
      for (const p of presses) {
        const next = press(confirm, p);
        confirm = next.confirm;
        intents.push(next.intent?.type ?? null);
      }
      return { confirm, intents };
    };
    expect(run(['ready', 'continue', 'continue-now']).intents).toEqual(['ready', null, 'continue']);
    expect(run(['ready', 'continue'])).toEqual({ confirm: true, intents: ['ready', null] });
    expect(run(['ready', 'continue', 'keep-waiting'])).toEqual({ confirm: false, intents: ['ready', null, null] });

    const host = (confirm: boolean) => readyFooter({ me: BRIX, players: players({ brix: true }), hostId: BRIX, connected: () => true, planningProper: true, confirm }).host;
    expect(host(run(['ready', 'continue']).confirm), 'one tap on Continue opens the confirm').toBe('confirm');
    expect(host(run(['ready', 'continue', 'keep-waiting']).confirm), 'Keep waiting puts Continue back').toBe('continue');
  });

  it("T-AC-13: the host's planning footer draws Continue without the one still planning; a player who is not the host gets none; before Ready the line names the viewer first, as \"you\"", () => {
    const all = players({ brix: true, lena: true });
    const t = table(all, BRIX, []);
    const footer = (seat: string, seated = all) => {
      const view = { phase: 'planning', politics: null, players: seated, month: 2, maxMonths: 12 } as unknown as MuleView;
      const self = seated.find((p) => p.id === seat)!;
      const client = { intent: () => {} } as unknown as TableClient;
      const game = createElement(PhoneGameProvider, { value: { table: t, view, me: {} as MyView, self, slot: self.slot as Slot }, children: createElement(ReadyBar) });
      return renderToStaticMarkup(createElement(ClientProvider, { client, children: game }));
    };
    const brix = footer(BRIX).replaceAll('<!-- -->', '');
    expect(brix).toContain('data-testid="you-are-ready"');
    expect(brix).toMatch(/data-testid="continue"[^>]*>Continue without Ossa</);
    expect(brix).toContain(`data-testid="waiting-${OSSA}"`);
    const lena = footer(LENA);
    expect(lena).toContain('data-testid="you-are-ready"');
    expect(lena).toContain(`data-testid="waiting-${OSSA}"`);
    expect(lena).not.toContain('data-testid="continue"');

    const ossa = footer(OSSA, players()).replaceAll('<!-- -->', '');
    expect(ossa).toContain('data-testid="ready"');
    const at = (id: string) => ossa.indexOf(`data-testid="waiting-${id}"`);
    expect(at(OSSA), 'Ossa, last in seat order, is named first on her own phone').toBeGreaterThan(-1);
    expect(at(OSSA)).toBeLessThan(at(BRIX));
    expect(at(BRIX)).toBeLessThan(at(LENA));
    expect(ossa.slice(at(OSSA), at(BRIX))).toMatch(/>you<\/span>/);
  });
});
