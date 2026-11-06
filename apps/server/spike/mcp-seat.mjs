#!/usr/bin/env node
/**
 * SPIKE (ws2-spike-claude-code-seat, not for merge): an MCP server over stdio that lets a player's own Claude Code
 * play one seat of a running game. It holds no game: each tool is forwarded to the game's seat bridge on localhost
 * (MULE_SEAT_URL), so the long poll lives in wait_for_my_turn. No dependencies: MCP over stdio is newline-delimited
 * JSON-RPC 2.0, and this answers initialize, tools/list, tools/call and ping.
 */
import readline from 'node:readline';

const BRIDGE = process.env.MULE_SEAT_URL ?? 'http://127.0.0.1:4821';
const PROTOCOL = '2025-06-18';

const TOOLS = [
  {
    name: 'join',
    description: 'Attach to one seat of a running M.U.L.E. game. Call once, first.',
    inputSchema: {
      type: 'object',
      properties: { gameCode: { type: 'string' }, seat: { type: 'string', description: 'The seat id, e.g. ai0' } },
      required: ['gameCode', 'seat'],
      additionalProperties: false,
    },
  },
  {
    name: 'wait_for_my_turn',
    description:
      "Blocks until the game wants your seat's plan, then returns the brief: what you see, your draft plan, and the edits you may make, with an ask_id. " +
      'Returns {"over": true, ...} when the game has ended. Call it again after every submit_plan.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'submit_plan',
    description:
      "Answers the ask with your edits to the draft and one short line said at the table in your persona's voice. " +
      'Each edit is {path, to, reason}; use only the paths the brief offers. An empty edits list keeps the draft.',
    inputSchema: {
      type: 'object',
      properties: {
        ask_id: { type: 'string' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: { path: { type: 'string' }, to: {}, reason: { type: 'string' } },
            required: ['path', 'to', 'reason'],
            additionalProperties: false,
          },
        },
        line: { type: 'string' },
      },
      required: ['ask_id', 'edits', 'line'],
      additionalProperties: false,
    },
  },
];

/** The kick-off prompt: /mcp__muleseat__play <code> <seat> loads the persona, the rules and the loop, and starts it. */
const PROMPTS = [
  {
    name: 'play',
    description: 'Play one seat of a running M.U.L.E. game until it ends.',
    arguments: [
      { name: 'code', description: 'The game code', required: true },
      { name: 'seat', description: 'Your seat id, e.g. ai0', required: true },
    ],
  },
];

/** The bridge's text at `path`, or `fallback` when it cannot be reached. */
async function bridgeText(path, fallback) {
  try {
    const res = await fetch(`${BRIDGE}${path}`, { signal: AbortSignal.timeout(5_000) });
    return await res.text();
  } catch {
    return fallback;
  }
}

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const result = (id, value) => send({ jsonrpc: '2.0', id, result: value });
const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });

/** One tool call, forwarded to the bridge. The wait has no timeout of its own: the game decides when it returns. */
async function call(name, args) {
  if (name === 'join') return post('/join', args);
  if (name === 'wait_for_my_turn') {
    const res = await fetch(`${BRIDGE}/wait`, { signal: AbortSignal.timeout(24 * 60 * 60 * 1_000) });
    return res.text();
  }
  if (name === 'submit_plan') return post('/submit', args);
  throw new Error(`unknown tool ${name}`);
}

async function post(path, body) {
  const res = await fetch(`${BRIDGE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return res.text();
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  // A notification has no id and gets no answer.
  if (id === undefined) return;
  if (method === 'initialize') {
    // The server's instructions, which Claude Code places in its system prompt: the loop and the how-to-play digest.
    bridgeText('/instructions', 'You play one seat of a M.U.L.E. game: join, then wait_for_my_turn and submit_plan until the game is over.').then((instructions) =>
      result(id, { protocolVersion: params?.protocolVersion ?? PROTOCOL, capabilities: { tools: {}, prompts: {} }, serverInfo: { name: 'mule-seat', version: '0.0.1-spike' }, instructions }),
    );
    return;
  }
  if (method === 'prompts/list') return result(id, { prompts: PROMPTS });
  if (method === 'prompts/get') {
    const { code, seat } = params?.arguments ?? {};
    bridgeText('/kickoff', '').then((kickoff) =>
      result(id, {
        description: 'Play your seat',
        messages: [{ role: 'user', content: { type: 'text', text: `${kickoff}\n\nGame code: ${code ?? 'SPIKE'}. Your seat: ${seat ?? 'ai0'}.` } }],
      }),
    );
    return;
  }
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools: TOOLS });
  if (method === 'tools/call') {
    call(params?.name, params?.arguments).then(
      (out) => result(id, text(out)),
      (err) => result(id, { ...text(`error: ${err instanceof Error ? err.message : String(err)}`), isError: true }),
    );
    return;
  }
  error(id, -32601, `method not found: ${method}`);
});
