import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createGame, DEVELOPMENT, list, LOTS, orderGeoDrone, RuleError, tileIndex, unlist, type GameState, type Outfit, type Tile } from '@mule/engine';
import { MOVES, type AiAction, type MoveCost, type MoveDescriptor } from '../src/actions.js';
import { applyAction } from '../src/play.js';
import type { MuleIntent } from '@mule/protocol';

const IDS = ['p0', 'p1', 'p2', 'p3'];
const planning = (): GameState => createGame({ seed: 7, players: IDS.map((id) => ({ id, name: id, isAi: true })) });
const freePlots = (state: GameState) => state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
const storeTile = (state: GameState) => state.tiles.find((t) => t.terrain === 'store')!;

/** Gives `id` the next `n` free plots. */
function own(state: GameState, id: string, n: number): Tile[] {
  const plots = freePlots(state).slice(0, n);
  for (const t of plots) t.owner = id;
  return plots;
}

/** The RuleError text `act` throws. */
function refusal(act: () => unknown): string {
  try {
    act();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'no refusal';
}

/** Each case's refusal, in the engine's check order; a text two checks share counts once. */
const refusals = (cases: (() => unknown)[]) => [...new Set(cases.map(refusal))];

const described = (type: AiAction['type']): MoveDescriptor => {
  expect(MOVES[type], `MOVES.${type}`).toBeDefined();
  return MOVES[type];
};

describe('the AI move list (C9)', () => {
  it("T-AC-11: every AiAction has one MOVES entry with command, phases, does, legalWhen, cost and args; list's legalWhen lines match lots.ts's RuleError texts", () => {
    const plotAsk = (t: { x: number; y: number }, kind: 'plot' | 'mule' = 'plot') => ({ item: { kind, x: t.x, y: t.y }, minimum: 10, unsold: 'store' as const });
    const listThrown = refusals([
      () => {
        const s = planning();
        s.phase = 'development';
        return list(s, 'p0', plotAsk(own(s, 'p0', 1)[0]!));
      },
      () => {
        const s = planning();
        return list(s, 'p0', { ...plotAsk(own(s, 'p0', 1)[0]!), item: { kind: 'boat' as 'plot', x: 0, y: 0 } });
      },
      () => {
        const s = planning();
        return list(s, 'p0', plotAsk(storeTile(s)));
      },
      () => {
        const s = planning();
        return list(s, 'p0', plotAsk(freePlots(s)[0]!));
      },
      () => {
        const s = planning();
        return list(s, 'p0', plotAsk(own(s, 'p0', 1)[0]!, 'mule'));
      },
      () => {
        const s = planning();
        const [t] = own(s, 'p0', 1);
        list(s, 'p0', plotAsk(t!));
        return list(s, 'p0', plotAsk(t!));
      },
      () => {
        const s = planning();
        const plots = own(s, 'p0', LOTS.perPlayer + 1);
        for (const t of plots.slice(0, LOTS.perPlayer)) list(s, 'p0', plotAsk(t));
        return list(s, 'p0', plotAsk(plots.at(-1)!));
      },
      () => {
        const s = planning();
        const others = IDS.slice(1);
        expect(others.length * LOTS.perPlayer, 'the others can fill the auction').toBeGreaterThanOrEqual(LOTS.maxLotsPerMonth);
        for (let i = 0; i < LOTS.maxLotsPerMonth; i++) list(s, others[i % others.length]!, plotAsk(own(s, others[i % others.length]!, 1)[0]!));
        return list(s, 'p0', plotAsk(own(s, 'p0', 1)[0]!));
      },
      () => {
        const s = planning();
        return list(s, 'p0', { ...plotAsk(own(s, 'p0', 1)[0]!), minimum: 0 });
      },
      () => {
        const s = planning();
        return list(s, 'p0', { ...plotAsk(own(s, 'p0', 1)[0]!), unsold: 'sell' as 'store' });
      },
    ]);
    expect(described('list').legalWhen()).toEqual(listThrown);

    const unlistThrown = refusals([
      () => {
        const s = planning();
        s.phase = 'development';
        return unlist(s, 'p0', 'plot-0-0');
      },
      () => unlist(planning(), 'p0', 'plot-0-0'),
      () => {
        const s = planning();
        const theirs = list(s, 'p1', plotAsk(own(s, 'p1', 1)[0]!));
        return unlist(s, 'p0', theirs.id);
      },
    ]);
    expect(described('unlist').legalWhen()).toEqual(unlistThrown);

    const droneThrown = refusals([
      () => {
        const s = planning();
        s.phase = 'development';
        return orderGeoDrone(s, 'p0', freePlots(s).slice(0, 1));
      },
      () => {
        const s = planning();
        orderGeoDrone(s, 'p0', freePlots(s).slice(0, 1));
        return orderGeoDrone(s, 'p0', freePlots(s).slice(0, 1));
      },
      () => orderGeoDrone(planning(), 'p0', []),
      () => {
        const s = planning();
        return orderGeoDrone(s, 'p0', freePlots(s).slice(0, DEVELOPMENT.dronePlots + 1));
      },
      () => {
        const s = planning();
        return orderGeoDrone(s, 'p0', [storeTile(s)]);
      },
      () => {
        const s = planning();
        return orderGeoDrone(s, 'p0', own(s, 'p1', 1));
      },
      () => {
        const s = planning();
        s.players[0]!.money = DEVELOPMENT.droneFee - 1;
        return orderGeoDrone(s, 'p0', freePlots(s).slice(0, 1));
      },
    ]);
    expect(described('drone').legalWhen().map((line) => line.replace('{phase}', 'development'))).toEqual(droneThrown);

    // Every entry is whole, and the config values its texts read are filled in.
    const broken = /undefined|NaN|\[object/;
    for (const [type, d] of Object.entries(MOVES)) {
      expect(d.type, type).toBe(type);
      expect(d.command, type).toMatch(/^[a-z][A-Za-z]+$/);
      expect(d.phases.length, type).toBeGreaterThan(0);
      expect(d.does(), type).toMatch(/^[A-Z].+\.$/);
      expect(d.does(), type).not.toMatch(broken);
      const lines = d.legalWhen();
      expect(new Set(lines).size, type).toBe(lines.length);
      for (const line of lines) expect(line, type).not.toMatch(broken);
      for (const words of Object.values(d.args)) expect(words, type).toMatch(/\S/);
    }
  });

  it('T-AC-11: cost(state, me) is what the engine takes when the move plays, for every move that has a cost', () => {
    const development = () => {
      const s = planning();
      s.phase = 'development';
      return s;
    };
    const money = (s: GameState) => s.players[0]!.money;
    /** Per move with a cost: a state where it is legal, the move, and what it took there. */
    const takes: Partial<Record<AiAction['type'], (cost: (s: GameState) => MoveCost) => [MoveCost, MoveCost]>> = {
      drone: (cost) => {
        const s = planning();
        const want = cost(s);
        const before = money(s);
        expect(applyAction(s, 'p0', { type: 'drone', plots: freePlots(s).slice(0, 1) })).toBe(true);
        return [want, { money: before - money(s) }];
      },
      buyMule: (cost) => {
        const s = development();
        const want = cost(s);
        const before = money(s);
        expect(applyAction(s, 'p0', { type: 'buyMule' })).toBe(true);
        return [want, { money: before - money(s) }];
      },
      outfit: (cost) => {
        const want = cost(development()).moneyByOutfit ?? {};
        const took: Partial<Record<Outfit, number>> = {};
        for (const outfit of Object.keys(want) as Outfit[]) {
          const s = development();
          applyAction(s, 'p0', { type: 'buyMule' });
          const before = money(s);
          expect(applyAction(s, 'p0', { type: 'outfit', outfit }), outfit).toBe(true);
          took[outfit] = before - money(s);
        }
        expect(Object.keys(took).length).toBeGreaterThan(1);
        return [{ moneyByOutfit: want }, { moneyByOutfit: took }];
      },
      analyse: (cost) => {
        const s = development();
        const want = cost(s);
        const clock = { left: 100 };
        const t = freePlots(s)[0]!;
        expect(applyAction(s, 'p0', { type: 'analyse', x: t.x, y: t.y }, clock)).toBe(true);
        return [want, { seconds: 100 - clock.left }];
      },
      filter: (cost) => {
        const s = development();
        const [t] = own(s, 'p0', 1);
        s.players[0]!.stock.alloy = DEVELOPMENT.filterAlloy;
        const want = cost(s);
        expect(applyAction(s, 'p0', { type: 'filter', x: t!.x, y: t!.y })).toBe(true);
        return [want, { alloy: DEVELOPMENT.filterAlloy - s.players[0]!.stock.alloy }];
      },
    };
    const costed = Object.values(MOVES).filter((d) => d.cost !== null);
    expect(costed.map((d) => d.type).sort()).toEqual(Object.keys(takes).sort());
    for (const d of costed) {
      const [want, took] = takes[d.type]!((s) => d.cost!(s, 'p0'));
      expect(want, d.type).toEqual(took);
    }
  });

  it('T-AC-11: applyAction plays drone, list and unlist with the engine, and a refused one changes nothing', () => {
    const s = planning();
    const [mine] = own(s, 'p0', 1);
    const free = freePlots(s)[0]!;
    const ask = { type: 'list', item: { kind: 'plot', x: mine!.x, y: mine!.y }, minimum: 25, unsold: 'keep' } as const;

    expect(applyAction(s, 'p0', ask)).toBe(true);
    expect(s.listings.map((l) => [l.id, l.seller, l.minimum, l.unsold])).toEqual([[`plot-${mine!.x}-${mine!.y}`, 'p0', 25, 'keep']]);
    expect(applyAction(s, 'p0', { ...ask, item: { kind: 'plot', x: free.x, y: free.y } })).toBe(false);
    expect(s.listings).toHaveLength(1);

    expect(applyAction(s, 'p1', { type: 'unlist', id: s.listings[0]!.id })).toBe(false);
    expect(s.listings).toHaveLength(1);
    expect(applyAction(s, 'p0', { type: 'unlist', id: s.listings[0]!.id })).toBe(true);
    expect(s.listings).toEqual([]);

    const before = s.players[0]!.money;
    expect(applyAction(s, 'p0', { type: 'drone', plots: [{ x: free.x, y: free.y }] })).toBe(true);
    expect(s.players[0]!.droneOrder).toEqual([tileIndex(s.width, free.x, free.y)]);
    expect(applyAction(s, 'p0', { type: 'drone', plots: [{ x: free.x, y: free.y }] })).toBe(false);
    expect(s.players[0]!.money).toBe(before - DEVELOPMENT.droneFee);
  });
});

const FLOOR_INPUT = 'the AI plays them through FloorInput (AiSeat.developSteer)';

/** Every phone command, and the AI move that plays it or why none does (AM-2, AM-4). */
const COVERAGE = {
  ready: { move: 'done' },
  drone: { move: 'drone' },
  claim: { move: 'claim' },
  buyMule: { move: 'buyMule' },
  outfit: { move: 'outfit' },
  install: { move: 'install' },
  analyse: { move: 'analyse' },
  filter: { move: 'filter' },
  pub: { move: 'pub' },
  declare: { move: 'declare' },
  walk: { move: 'walk' },
  walkStep: { move: 'walk' },
  lineTrade: { move: 'lineTrade' },
  list: { move: 'list' },
  unlist: { move: 'unlist' },
  run: { move: 'run' },
  vote: { move: 'vote' },
  setTax: { move: 'setTax' },
  continue: { excluded: 'host only' },
  steer: { excluded: FLOOR_INPUT },
  act: { excluded: FLOOR_INPUT },
} satisfies Record<MuleIntent['type'], { move: AiAction['type'] } | { excluded: string }>;

/** MuleIntent's command names, read from the protocol's source: the compiler's view is gone by the time a test runs. */
function protocolCommands(): string[] {
  const file = createRequire(import.meta.url).resolve('@mule/protocol');
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const alias = source.statements.find((s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === 'MuleIntent');
  if (!alias || !ts.isUnionTypeNode(alias.type)) throw new Error(`no MuleIntent union in ${file}`);
  return alias.type.types.map((member) => {
    const type = ts.isTypeLiteralNode(member)
      ? member.members.find((m): m is ts.PropertySignature => ts.isPropertySignature(m) && m.name.getText(source) === 'type')?.type
      : undefined;
    if (!type || !ts.isLiteralTypeNode(type) || !ts.isStringLiteral(type.literal)) throw new Error(`can't read a command name from \`${member.getText(source)}\``);
    return type.literal.text;
  });
}

describe('every phone command has an AI move (C11)', () => {
  it('B-AC-9: every MuleIntent command has an AI move or a reviewed exclusion', () => {
    const commands = protocolCommands();
    const unlisted = commands.filter((c) => !(c in COVERAGE));
    expect(unlisted, 'a MuleIntent command with neither an AI move nor an exclusion').toEqual([]);
    expect(Object.keys(COVERAGE).sort(), 'the table names only protocol commands').toEqual([...commands].sort());

    const rows: Record<string, { move?: AiAction['type']; excluded?: string }> = COVERAGE;
    for (const [command, row] of Object.entries(rows)) {
      if (!row.move) continue;
      // walkStep is played by the walk move, whose own command is walk: the descriptor's command maps back to the same move.
      const d = MOVES[row.move];
      expect(d, `${command} → ${row.move}`).toBeDefined();
      expect(rows[d.command]?.move, `${command} → ${row.move}, whose command is ${d.command}`).toBe(row.move);
    }
    for (const d of Object.values(MOVES)) expect(rows[d.command]?.move, `MOVES.${d.type}.command ${d.command}`).toBe(d.type);
  });
});
