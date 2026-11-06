/**
 * brain:gate, the free gate before a paid Smart-seat tournament (B fix 1, PM 6 Nov): the pair table with no model, the
 * Claude chairs running the whole Smart pipeline (Playbooks, the validator, adoption at each phase's start) with a
 * writer whose edits change nothing a seat plays. A plumbing that plays as the engine's own seats lands in WS1's control
 * band (BRAIN.tournament.control); one that does not hands the tournament a handicap no model can be blamed for.
 * Its brain is a stub with no client, so it can reach no key and calls nothing.
 *
 *   brain:gate play --seeds 1001,2001 --per-seed 30 --out <file.jsonl>   games for these seed blocks, a line each
 *   brain:gate report <file.jsonl>...                                    the control-band verdict over them all
 */
import fs from 'node:fs';
import { scoreParts, type GameState, type Playbook } from '@mule/engine';
import { playbookSource, playGameAsync, TopPickDecider, type AiSeat, type PlanEdit, type SeatSpec } from '@mule/ai';
import { Playbooks } from './playbooks.js';
import { tableSeats, trialGames } from './trial.js';
import { resultsOf, tournamentBar, type TrialGame } from './trial-report.js';
import type { BrainService, PlaybookWriter } from './index.js';

/** What the gate's writer sends: a lesson note no hand reads, and the development's ifSoldOut at its draft value. */
function noopEdits(kind: 'strategy' | 'playbook', development: Playbook | undefined): PlanEdit[] {
  const edits: PlanEdit[] = [{ path: '/lessons', to: ['gate'], reason: 'gate' }];
  if (kind === 'strategy' && development?.development) edits.push({ path: '/development/ifSoldOut', to: development.development.ifSoldOut, reason: 'gate' });
  return edits;
}

/** One game: its final scores, the Claude chairs, and how many playbooks were adopted as Claude's. */
async function playOne(seed: number, seating: 'even' | 'odd'): Promise<TrialGame> {
  const table = tableSeats({ seed, seating }, 2);
  const lastDevelopment = new Map<string, Playbook>();
  const writerFor = (seat: string): PlaybookWriter => ({
    write: async (kind) => ({ reply: { edits: noopEdits(kind, lastDevelopment.get(seat)), line: null }, refused: [] }),
  });
  const brain: BrainService = { deciderFor: () => null, writerFor: (seat) => writerFor(seat.id), chatter: () => () => {}, finish: () => {} };
  const chairs: string[] = [];
  const held: { pb: Playbooks | null; state: GameState | null; auctionAsked: number } = { pb: null, state: null, auctionAsked: -1 };
  const playbooks: TrialGame['playbooks'] = [];
  const played = await playGameAsync(seed, table.specs, {
    deciderFor: (seatId: string, _spec: SeatSpec, index: number) => {
      if (!table.claude.includes(index)) return null;
      chairs.push(seatId);
      return new TopPickDecider();
    },
    onSeats: (seats, state) => {
      const smart = seats.filter((s) => chairs.includes(s.id));
      for (const s of smart) {
        const draft = s.draft.bind(s);
        (s as AiSeat & { draft: AiSeat['draft'] }).draft = ((st: GameState, phase: Parameters<AiSeat['draft']>[1], month?: number) => {
          const pb = draft(st, phase, month);
          if (phase === 'development') lastDevelopment.set(s.id, pb);
          return pb;
        }) as AiSeat['draft'];
      }
      held.state = state;
      held.pb = new Playbooks({ brain, source: playbookSource(smart), seats: smart, record: (n) => n.phase === 'landGrant' && playbooks.push({ seat: n.seat, month: n.month, by: n.playbook.by }) });
      held.pb.ask(state, state.month);
    },
    // As brain:trial: planning's end is the land grant's start; an upkeep asks for next month's.
    onPhase: (state) => {
      if (state.phase === 'planning') held.pb?.takeEffect(state);
      if (state.phase === 'upkeep') held.pb?.ask(state, state.month + 1);
    },
    edits: (_seat: AiSeat, _draft: Playbook, state: GameState) => {
      if (state.phase === 'development' || state.phase === 'auction') held.pb?.takePhase(state, state.phase);
      return null;
    },
    between: async () => {
      const state = held.state;
      if (held.pb && state?.phase === 'production' && held.auctionAsked !== state.month) {
        held.auctionAsked = state.month;
        held.pb.askPhase(state, 'auction', []);
      }
      await held.pb?.settle();
    },
  });
  const scores = Object.fromEntries(played.state.players.map((p) => [p.id, scoreParts(played.state, p.id).total]));
  return {
    id: `gate-${seed}-${seating}`,
    end: played.state.phase === 'gameOver' ? 'over' : 'unfinished',
    months: played.state.month,
    smart: chairs,
    decisions: [],
    lines: {},
    modelLines: {},
    cutOff: [],
    countedUsd: 0,
    settledCalls: 0,
    playbooks,
    scores,
    chairs,
    seating,
  };
}

async function main(argv: readonly string[]): Promise<number> {
  const [mode, ...rest] = argv;
  if (mode === 'report') {
    const games = rest.flatMap((f) => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as TrialGame));
    const finished = games.filter((g) => g.end === 'over');
    const r = resultsOf(finished);
    const adopted = games.flatMap((g) => g.playbooks);
    const byLlm = adopted.filter((p) => p.by === 'llm').length;
    console.log(`brain:gate ${games.length} games, ${finished.length} finished`);
    console.log(`  Claude chairs won ${r.smartWins} (${((100 * r.smartWins) / r.games).toFixed(1)}%), mean rank ${r.smart.meanRank.toFixed(3)} against ${r.strategist.meanRank.toFixed(3)} (lead ${(r.strategist.meanRank - r.smart.meanRank).toFixed(3)})`);
    console.log(`  mean score ${Math.round(r.smart.meanScore)} against ${Math.round(r.strategist.meanScore)}; land playbooks adopted by llm ${byLlm} of ${adopted.length}`);
    const verdict = tournamentBar(r, true, games.length);
    console.log(`  control band: ${verdict}`);
    return verdict === 'pass' ? 0 : 1;
  }
  const flag = (name: string) => {
    const at = rest.indexOf(name);
    return at < 0 ? undefined : rest[at + 1];
  };
  const seeds = flag('--seeds')?.split(',').map(Number);
  const perSeed = Number(flag('--per-seed') ?? 30);
  const out = flag('--out');
  if (mode !== 'play' || !seeds?.every(Number.isInteger) || !Number.isInteger(perSeed) || !out) {
    console.error('Usage: brain:gate play --seeds S1,S2 --per-seed N --out file.jsonl | brain:gate report file.jsonl...');
    return 1;
  }
  // A report counts the lines it is given, so a rerun into the same file would be judged on the wrong n.
  if (fs.existsSync(out)) {
    console.error(`brain:gate: ${out} exists; give a new file.`);
    return 1;
  }
  const games = trialGames({ table: 'pair', seeds, seed: seeds[0]!, games: perSeed * 2 });
  const t0 = Date.now();
  for (const g of games) fs.appendFileSync(out, JSON.stringify(await playOne(g.seed, g.seating as 'even' | 'odd')) + '\n');
  console.error(`brain:gate ${games.length} games in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${out}`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
