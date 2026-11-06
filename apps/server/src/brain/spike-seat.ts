/**
 * SPIKE (ws2-spike-claude-code-seat, 6 Nov, not for merge): can a player's own Claude Code, on their own subscription,
 * play a seat for a whole game, with no API key? One 4-seat game: seat ai0's plans are written by Claude Code through
 * the seat bridge here (the same asks Playbooks makes for a Smart seat: the land write at game start and each upkeep,
 * carrying the development, and the auction's in the production show); the other three seats play Classic.
 *
 *   --mode mcp      the bridge serves /join, /wait (long poll) and /submit on 127.0.0.1:--port, for mcp-seat.mjs
 *   --mode per-call each ask spawns one `claude -p` that answers the brief as JSON on stdout
 *
 * A reply goes through writeReply and Playbooks as an API reply would: checked, validated, adopted, its line said.
 * The game waits up to --cap-ms for each reply (simulated time paused, as the trial pauses it), and every latency is
 * recorded, so the report can judge it against today's 30 s write deadline and the game's real slack.
 * Usage: tsx src/brain/spike-seat.ts --mode mcp|per-call [--seed 7] [--cap-ms 180000] [--port 4821] [--out file.jsonl]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { score, type GameState, type Playbook } from '@mule/engine';
import { playbookSource, playGameAsync, simSeats, writeReply, type AiSeat, type WriteComplete, type WriterPrompt } from '@mule/ai';
import { chatter, type Spoken } from './chat.js';
import { WRITE_CALLS } from './client.js';
import type { BrainService, PlaybookAsk, PlaybookWriter } from './index.js';
import { Playbooks } from './playbooks.js';

const SEATS = 4;
const SEAT = 'ai0';

interface Flags {
  mode: 'mcp' | 'per-call';
  seed: number;
  capMs: number;
  port: number;
  out: string;
  model: string;
}

function flags(argv: readonly string[]): Flags {
  const get = (name: string, fallback: string) => {
    const at = argv.indexOf(name);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1]! : fallback;
  };
  const mode = get('--mode', 'mcp');
  if (mode !== 'mcp' && mode !== 'per-call') throw new Error(`--mode mcp|per-call, not ${mode}`);
  return { mode, seed: Number(get('--seed', '7')), capMs: Number(get('--cap-ms', '180000')), port: Number(get('--port', '4821')), out: get('--out', 'spike-asks.jsonl'), model: get('--model', 'sonnet') };
}

/** One ask of the seat, as recorded. */
interface AskRecord {
  n: number;
  kind: string;
  month: number;
  phase: string;
  askedAtMs: number;
  answeredMs: number | null;
  /** Why the writer could not use the reply, or null. */
  cause: string | null;
  accepted: number;
  refused: number;
  line: string | null;
  promptChars: number;
}

/** An ask waiting for its answer. */
interface Pending {
  id: string;
  kind: string;
  month: number;
  phase: string;
  prompt: WriterPrompt;
  askedAt: number;
  answer: (text: string) => void;
  /** Set once writeReply has judged the answer. */
  judged: Promise<AskRecord>;
}

/** The seat bridge for --mode mcp: one seat, one ask at a time, long-polled. */
class Bridge {
  private pending: Pending | null = null;
  private delivered = false;
  private waiter: http.ServerResponse | null = null;
  private lastSystem: string | null = null;
  private over: object | null = null;
  joined: Promise<void>;
  private join!: () => void;
  readonly server: http.Server;

  constructor(port: number) {
    this.joined = new Promise((resolve) => (this.join = resolve));
    this.server = http.createServer((req, res) => void this.route(req, res));
    this.server.requestTimeout = 0;
    this.server.headersTimeout = 0;
    this.server.listen(port, '127.0.0.1');
  }

  ask(p: Pending): void {
    this.pending = p;
    this.delivered = false;
    this.flush();
  }

  cleared(id: string): void {
    if (this.pending?.id === id) this.pending = null;
  }

  finish(summary: object): void {
    this.over = summary;
    this.flush();
  }

  /** Hands the pending ask, or the game's end, to a waiting /wait. */
  private flush(): void {
    if (!this.waiter) return;
    if (this.pending && !this.delivered) {
      const p = this.pending;
      this.delivered = true;
      // The system text (the rules and the manual of moves) is sent once; after that only if it changed.
      const system = p.prompt.system === this.lastSystem ? '(unchanged since your first turn)' : p.prompt.system;
      this.lastSystem = p.prompt.system;
      const paths = p.prompt.schema;
      this.reply(this.waiter, {
        ask_id: p.id,
        kind: p.kind,
        month: p.month,
        phase: p.phase,
        rules: system,
        brief: p.prompt.user,
        reply_schema: paths,
        how: 'Answer with submit_plan({ask_id, edits, line}). Only the paths in reply_schema; an empty edits list keeps your draft. Then call wait_for_my_turn again.',
      });
      this.waiter = null;
      return;
    }
    if (this.over) {
      this.reply(this.waiter, { over: true, ...this.over });
      this.waiter = null;
    }
  }

  private reply(res: http.ServerResponse, body: object): void {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await new Promise<string>((resolve) => {
      let s = '';
      req.on('data', (c) => (s += c));
      req.on('end', () => resolve(s));
    });
    if (req.url?.startsWith('/join')) {
      this.join();
      return this.reply(res, { joined: SEAT, note: 'You play this seat. Call wait_for_my_turn now.' });
    }
    if (req.url?.startsWith('/wait')) {
      // One waiter at a time: a second wait replaces the first, whose client has given up.
      this.waiter?.end(JSON.stringify({ superseded: true }));
      this.waiter = res;
      this.flush();
      return;
    }
    if (req.url?.startsWith('/submit')) {
      let parsed: { ask_id?: string; edits?: unknown; line?: unknown };
      try {
        parsed = JSON.parse(body) as typeof parsed;
      } catch {
        return this.reply(res, { error: 'not JSON' });
      }
      const p = this.pending;
      if (!p || p.id !== parsed.ask_id) return this.reply(res, { error: `no open ask ${String(parsed.ask_id)}; it may have timed out. Call wait_for_my_turn.` });
      this.pending = null;
      p.answer(JSON.stringify({ edits: parsed.edits ?? [], line: parsed.line ?? '' }));
      const judged = await p.judged;
      return this.reply(res, { accepted: judged.accepted, refused: judged.refused, cause: judged.cause, said: judged.line });
    }
    res.writeHead(404).end();
  }
}

/** --mode per-call: one `claude -p` per ask, its answer the JSON on stdout. No API key: the subscription's login. */
function perCall(prompt: WriterPrompt, model: string, cwd: string): Promise<string> {
  const ask = [
    prompt.system,
    '',
    prompt.user,
    '',
    'Answer with ONLY one JSON object, no prose, matching this schema:',
    JSON.stringify(prompt.schema),
  ].join('\n');
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--output-format', 'json', '--model', model, '--setting-sources', 'project', '--no-session-persistence'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.on('error', reject);
    child.on('close', () => {
      try {
        const result = (JSON.parse(out) as { result?: string }).result ?? '';
        const json = result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1);
        resolve(json);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    child.stdin.end(ask);
  });
}

async function main(): Promise<void> {
  const f = flags(process.argv.slice(2));
  const started = Date.now();
  const records: AskRecord[] = [];
  const lines: Spoken[] = [];
  const log = (r: AskRecord) => fs.appendFileSync(f.out, `${JSON.stringify(r)}\n`);
  const bridge = f.mode === 'mcp' ? new Bridge(f.port) : null;
  const cwd = process.env.SPIKE_CWD ?? process.cwd();
  let n = 0;
  let state: GameState | null = null;

  const writer: PlaybookWriter = {
    async write(kind, ask: PlaybookAsk) {
      const id = `ask-${++n}`;
      const s = state!;
      const record: AskRecord = { n, kind, month: s.month, phase: s.phase, askedAtMs: Date.now() - started, answeredMs: null, cause: null, accepted: 0, refused: 0, line: null, promptChars: 0 };
      let judgedDone!: (r: AskRecord) => void;
      const judged = new Promise<AskRecord>((resolve) => (judgedDone = resolve));
      const port: WriteComplete = (prompt) =>
        new Promise((resolve, reject) => {
          record.promptChars = prompt.system.length + prompt.user.length;
          const askedAt = Date.now();
          const timer = setTimeout(() => {
            bridge?.cleared(id);
            reject(new Error('cap'));
          }, f.capMs);
          const answer = (text: string) => {
            clearTimeout(timer);
            record.answeredMs = Date.now() - askedAt;
            resolve({ text, stopReason: 'end_turn' });
          };
          if (bridge) bridge.ask({ id, kind, month: s.month, phase: s.phase, prompt, askedAt, answer, judged });
          else perCall(prompt, f.model, cwd).then(answer, (err: unknown) => (clearTimeout(timer), reject(err instanceof Error ? err : new Error(String(err)))));
        });
      // The spike's own wait: --cap-ms, not the write's 30 s, so each latency is measured whole.
      const written = await writeReply(port, { ...ask, waitMs: f.capMs });
      record.cause = written.reply.cause ?? null;
      record.accepted = written.reply.edits.length;
      record.refused = written.refused.length;
      record.line = written.reply.line;
      records.push(record);
      log(record);
      judgedDone(record);
      return written;
    },
  };
  const brain: BrainService = {
    deciderFor: () => null,
    writerFor: (seat) => (seat.id === SEAT ? writer : null),
    chatter: (seat, say) => chatter(seat.id, say, 'smart'),
    finish: () => {},
  };

  if (bridge) {
    console.log(`bridge on http://127.0.0.1:${f.port}: waiting for Claude Code to join seat ${SEAT}`);
    await bridge.joined;
    console.log('joined');
  }

  const held: { playbooks: Playbooks | null; auctionAsked: number } = { playbooks: null, auctionAsked: -1 };
  const adopted: { phase: string; by: Playbook['by'] }[] = [];
  const specs = simSeats(SEATS, 'trader', f.seed);
  const played = await playGameAsync(f.seed, specs, {
    deciderFor: () => null,
    onSeats: (seats, s) => {
      state = s;
      const mine = seats.filter((x: AiSeat) => x.id === SEAT);
      const say = chatter(SEAT, () => {}, 'smart');
      held.playbooks = new Playbooks({
        brain,
        source: playbookSource(mine),
        seats: mine,
        record: (note) => adopted.push({ phase: note.phase, by: note.playbook.by }),
        speak: (_seat, said) => {
          lines.push({ ...said, by: 'llm' });
          say({ ...said, by: 'llm' });
        },
      });
      held.playbooks.ask(s, s.month);
    },
    onPhase: (s) => {
      state = s;
      if (s.phase === 'planning') held.playbooks?.takeEffect(s);
      if (s.phase === 'upkeep') held.playbooks?.ask(s, s.month + 1);
    },
    edits: (_seat, _draft, s) => {
      if (s.phase === 'development' || s.phase === 'auction') held.playbooks?.takePhase(s, s.phase);
      return null;
    },
    between: async () => {
      const s = state;
      if (held.playbooks && s?.phase === 'production' && held.auctionAsked !== s.month) {
        held.auctionAsked = s.month;
        held.playbooks.askPhase(s, 'auction', []);
      }
      await held.playbooks?.settle();
    },
  });

  const end = played.state;
  const scores = end.players.map((p) => ({ id: p.id, score: score(end, p.id) })).sort((a, b) => b.score - a.score);
  const rank = 1 + scores.filter((x) => x.score > scores.find((y) => y.id === SEAT)!.score).length;
  const answered = records.filter((r) => r.answeredMs !== null).map((r) => r.answeredMs!).sort((a, b) => a - b);
  const pct = (q: number) => (answered.length === 0 ? null : answered[Math.min(answered.length - 1, Math.floor(q * answered.length))]);
  const summary = {
    mode: f.mode,
    seed: f.seed,
    finished: end.phase === 'gameOver',
    months: end.month,
    wallMs: Date.now() - started,
    asks: records.length,
    answered: answered.length,
    unusable: records.filter((r) => r.cause !== null).length,
    inTime30s: answered.filter((ms) => ms <= WRITE_CALLS.strategy.timeoutMs).length,
    inTime60s: answered.filter((ms) => ms <= 60_000).length,
    p50Ms: pct(0.5),
    p90Ms: pct(0.9),
    maxMs: answered.at(-1) ?? null,
    adoptedByLlm: adopted.filter((a) => a.by === 'llm').length,
    tookEffect: adopted.length,
    linesSaid: lines.length,
    rank,
    scores,
  };
  fs.appendFileSync(f.out, `${JSON.stringify({ summary })}\n`);
  console.log(JSON.stringify(summary, null, 2));
  bridge?.finish({ rank, scores });
  // Give the waiting wait_for_my_turn its game-over answer before closing.
  await new Promise((resolve) => setTimeout(resolve, 30_000));
  bridge?.server.close();
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
