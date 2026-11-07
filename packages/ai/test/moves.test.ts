import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { callOverrule, createGame, DEVELOPMENT, list, LOTS, openOverrule, orderGeoDrone, RuleError, setBudget, setSalesTax, tileIndex, unlist, voteOverrule, type GameState, type Outfit, type Tile } from '@mule/engine';
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

  it("T-AC-11: the AI's setBudget, callOverrule and voteOverrule moves reach politics.ts through applyAction, and a refused one returns false, writes nothing and carries S5-RULE-2, -6 and -7's words in MOVES' legalWhen", () => {
    // Month 2's planning with p0 governing and no election open.
    const governed = (politics = true): GameState => {
      const g = createGame({ seed: 7, players: IDS.map((id) => ({ id, name: id, isAi: true })), politics });
      g.month = 2;
      if (g.politics) g.politics = { ...g.politics, governor: 'p0', election: null };
      return g;
    };
    const s = governed();

    // The Governor's shares are stored as given.
    expect(applyAction(s, 'p0', { type: 'setBudget', shares: { projects: 80, welfare: 10, security: 0 } })).toBe(true);
    expect(s.politics!.budget).toMatchObject({ month: 2, setBy: 'p0', shares: { projects: 80, welfare: 10, security: 0 } });

    // A tax change, a call, the ballot, a vote and Done: each lands where the engine puts it.
    expect(applyAction(s, 'p0', { type: 'setTax', percent: 10 })).toBe(true);
    expect(applyAction(s, 'p1', { type: 'callOverrule', target: 'tax' })).toBe(true);
    expect(s.politics!.overrule).toMatchObject({ caller: 'p1', target: 'tax', stage: 'called' });
    expect(openOverrule(s)).toBe(true);
    expect(applyAction(s, 'p2', { type: 'voteOverrule', yes: true })).toBe(true);
    expect(s.politics!.overrule!.ballots).toMatchObject({ p1: true, p0: false, p2: true });
    expect(applyAction(s, 'p3', { type: 'done', done: true })).toBe(true);
    expect(s.politics!.overrule!.done).toContain('p3');

    // A call can be withdrawn by its caller.
    const t = governed();
    setSalesTax(t, 'p0', 10);
    expect(applyAction(t, 'p1', { type: 'callOverrule', target: 'tax' })).toBe(true);
    expect(applyAction(t, 'p1', { type: 'callOverrule', target: null })).toBe(true);
    expect(t.politics!.overrule).toBeNull();

    // A refused move returns false and writes nothing.
    const raised = governed();
    setSalesTax(raised, 'p0', 10);
    const called = structuredClone(raised);
    callOverrule(called, 'p1', 'tax');
    const engine = (g: GameState, who: string, action: AiAction): unknown => {
      switch (action.type) {
        case 'setBudget':
          return setBudget(g, who, action.shares);
        case 'callOverrule':
          return callOverrule(g, who, action.target);
        case 'voteOverrule':
          return voteOverrule(g, who, action.yes);
        default:
          throw new Error(`not a budget or overrule move: ${action.type}`);
      }
    };
    const refuse = (base: GameState, who: string, action: AiAction, mutate: (g: GameState) => void = () => {}): string => {
      const g = structuredClone(base);
      mutate(g);
      const before = JSON.stringify(g.politics);
      expect(applyAction(g, who, action), JSON.stringify(action)).toBe(false);
      expect(JSON.stringify(g.politics)).toBe(before);
      const h = structuredClone(base);
      mutate(h);
      return refusal(() => engine(h, who, action));
    };
    const budget = (projects: number, welfare: number, security = 0): AiAction => ({ type: 'setBudget', shares: { projects, welfare, security } });
    const thrown = [
      refuse(governed(false), 'p0', budget(80, 10)),
      refuse(governed(), 'p0', budget(80, 10), (g) => void (g.phase = 'development')),
      refuse(governed(), 'p1', budget(80, 10)),
      refuse(governed(), 'p0', budget(80, 10, 10)),
      refuse(governed(), 'p0', budget(80, 25)),
      refuse(governed(), 'p0', budget(95, 10)),
      refuse(governed(), 'p0', { type: 'callOverrule', target: 'tax' }),
      refuse(governed(), 'p1', { type: 'callOverrule', target: 'tax' }, (g) => void (g.politics = { ...g.politics!, governor: null })),
      refuse(raised, 'p1', { type: 'callOverrule', target: 'budget' }),
      refuse(raised, 'p1', { type: 'callOverrule', target: 'confidence' }),
      refuse(governed(), 'p1', { type: 'callOverrule', target: 'tax' }),
      refuse(called, 'p2', { type: 'callOverrule', target: 'tax' }),
      refuse(raised, 'p1', { type: 'callOverrule', target: null }),
      refuse(raised, 'p1', { type: 'callOverrule', target: 'tax' }, (g) => void (g.phase = 'development')),
      refuse(governed(), 'p1', { type: 'voteOverrule', yes: true }),
    ];
    const lines = [...described('setBudget').legalWhen(), ...described('callOverrule').legalWhen(), ...described('voteOverrule').legalWhen()];
    // The texts that carry a name or a number are matched on their fixed words; the rest verbatim.
    const matches = (line: string, words: string) =>
      line === words || new RegExp(`^${line.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[a-z]+\}/g, '.+')}$`).test(words);
    for (const words of thrown) expect(lines.some((line) => matches(line, words)), `legalWhen has no line for "${words}"`).toBe(true);
    // And the other way: every legalWhen line is a refusal the engine really sends.
    for (const line of lines) expect(thrown.some((words) => matches(line, words)), `nothing throws legalWhen's "${line}"`).toBe(true);
  });
});

const FLOOR_INPUT = 'the AI plays them through FloorInput (AiSeat.developSteer)';
/** A politics intent whose AiAction WS1 has not added yet: the server refuses it until its slice is built. */
const NOT_YET_AN_AI_MOVE = 'politics contract only; the AI move comes with its slice';

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
  list: { move: 'list' },
  unlist: { move: 'unlist' },
  run: { move: 'run' },
  vote: { move: 'vote' },
  setTax: { move: 'setTax' },
  commission: { move: 'commission' },
  payStrike: { move: 'payStrike' },
  propose: { move: 'propose' },
  voteLaw: { move: 'voteLaw' },
  donate: { move: 'donate' },
  repair: { move: 'repair' },
  continue: { excluded: 'host only' },
  steer: { excluded: FLOOR_INPUT },
  act: { excluded: FLOOR_INPUT },
  hurry: { excluded: 'a person asks to speed production up; an AI seat counts as yes (ws6-ux AM-19)' },
  // Politics slices 3-5: the contract commit adds the intents; WS1 adds each AiAction and turns its row into a move.
  offerDeal: { excluded: NOT_YET_AN_AI_MOVE },
  withdrawDeal: { excluded: NOT_YET_AN_AI_MOVE },
  answerDeal: { excluded: NOT_YET_AN_AI_MOVE },
  sabotage: { excluded: NOT_YET_AN_AI_MOVE },
  guard: { excluded: NOT_YET_AN_AI_MOVE },
  investigate: { excluded: NOT_YET_AN_AI_MOVE },
  fine: { excluded: NOT_YET_AN_AI_MOVE },
  setBudget: { move: 'setBudget' },
  callOverrule: { move: 'callOverrule' },
  voteOverrule: { move: 'voteOverrule' },
  openInquiry: { excluded: NOT_YET_AN_AI_MOVE },
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
