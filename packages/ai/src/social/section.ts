/** The land brief's social section: the other players, what the seat knows of each, the politics and what it heard. */
import { BRAIN, nextElectionMonth, PERCENT, type GameState, type Office, type Playbook, type PlayerId, type TaxPromise } from '@mule/engine';
import type { TableTalk } from '../decider.js';
import { tableTalkBlock } from '../llm/prompt.js';
import { GOOD_NAME } from '../strategist.js';
import type { Memory, Relation } from './memory.js';

const OFFICES: readonly Office[] = ['governor', 'sheriff'];
const OFFICE_NAME: Record<Office, string> = { governor: 'Governor', sheriff: 'Sheriff' };
export type Stance = Playbook['strategy']['stances'][PlayerId];
export const STANCES: readonly Stance[] = ['ally', 'neutral', 'rival', 'target'];

const pctOf = (share: number) => `${Math.round(share * PERCENT)}%`;
const nameOf = (view: GameState, id: string | null) => (id === null ? 'nobody' : (view.players.find((p) => p.id === id)?.name ?? 'nobody'));

function officeOf(view: GameState, id: string): Office | null {
  if (view.politics?.governor === id) return 'governor';
  if (view.politics?.sheriff === id) return 'sheriff';
  return null;
}

/** A player's public position: plots, worth as every phone shows it, and office. Never their goods. */
export function positionText(view: GameState, worth: Readonly<Record<PlayerId, number>>, id: string): string {
  const plots = view.tiles.filter((t) => t.owner === id).length;
  const office = officeOf(view, id);
  const parts = [`${plots} plots`, ...(id in worth ? [`worth ${worth[id]}`] : []), ...(office ? [OFFICE_NAME[office]] : [])];
  return `${nameOf(view, id)}: ${parts.join(', ')}.`;
}

export const promiseText = (p: TaxPromise | null | undefined): string =>
  !p ? 'no tax promise' : p.kind === 'cap' ? `promises to cap the sales tax at ${p.percent}%` : p.kind === 'lower' ? 'promises to lower the sales tax' : 'promises to hold the sales tax';

/** The offices, the tax, the next election and its candidates, at most `candidates` named per office. Public facts only. */
export function politicsLines(view: GameState, candidates = Infinity): string[] {
  const pol = view.politics;
  if (pol === null) return ['Politics is off in this game: no offices, no elections, no tax changes.'];
  const next = nextElectionMonth(view);
  const election = next === null ? 'No election is left this game.' : next === view.month + 1 ? `The next election is next month (month ${next}).` : `No election next month; the next is in month ${next}.`;
  const running = OFFICES.map((office) => {
    const ids = pol.candidates[office] ?? [];
    const label = OFFICE_NAME[office];
    if (ids.length === 0) return `Candidates for ${label}: none declared.`;
    const named = ids.slice(0, candidates).map((id) => (office === 'governor' ? `${nameOf(view, id)} (${promiseText(pol.promises[id])})` : nameOf(view, id)));
    const more = ids.length > named.length ? ` and ${ids.length - named.length} more` : '';
    return `Candidates for ${label}: ${named.join(', ')}${more}.`;
  });
  return [`Governor: ${nameOf(view, pol.governor)}. Sheriff: ${nameOf(view, pol.sheriff)}. Sales tax: ${pctOf(view.treasury.salesTax)}.`, election, ...running];
}

/** The seat's own last recorded stance and notes on one player, and the month of the playbook that holds them. */
export interface LastRead {
  month: number;
  stance: Stance | null;
  notes: readonly string[];
}

/** What the social section is built from, besides the game: the seat's memory and its own last reads, by player. */
export interface SocialInput {
  memory: Memory;
  reads: Readonly<Record<PlayerId, LastRead>>;
}

/** Each counted fact between the seat and one player, newest first, in the brief's words. */
function relationFacts(r: Relation): string[] {
  const dated = [
    ...r.trades.map((t) => ({ month: t.month, text: `${t.seller === 'me' ? 'bought' : 'sold you'} ${t.qty} ${GOOD_NAME[t.good]} at ${t.price}${t.seller === 'me' ? ' from you' : ''} in month ${t.month}` })),
    ...r.sales.map((s) => ({ month: s.month, text: `${s.seller === 'me' ? 'bought' : 'sold you'} ${s.item === 'plot' ? `plot ${s.plot}` : `the MULE on plot ${s.plot}`} for ${s.price}${s.seller === 'me' ? ' from you' : ''} in month ${s.month}` })),
    ...r.tookWanted.map((w) => ({ month: w.month, text: `took plot ${w.plot}, one you wanted, in month ${w.month}` })),
  ];
  // Newest first; a stable sort keeps one month's facts in the order the record has them.
  const facts = dated.sort((a, b) => b.month - a.month).map((d) => d.text);
  const p = r.pacts;
  if (p.active > 0) facts.push(`${p.active} pact${p.active === 1 ? '' : 's'} with you in force`);
  if (p.kept > 0) facts.push(`kept ${p.kept} pact${p.kept === 1 ? '' : 's'} with you`);
  if (p.brokenByThem > 0) facts.push(`broke ${p.brokenByThem} pact${p.brokenByThem === 1 ? '' : 's'} with you`);
  if (p.brokenByMe > 0) facts.push(`you broke ${p.brokenByMe} pact${p.brokenByMe === 1 ? '' : 's'} with them`);
  if (r.running) facts.push(`runs for ${OFFICE_NAME[r.running.office]}${r.running.office === 'governor' ? ` and ${promiseText(r.running.promise)}` : ''}`);
  return facts;
}

function knownLine(name: string, r: Relation | undefined): string {
  const facts = r ? relationFacts(r) : [];
  if (facts.length === 0) return `  What you know of ${name}: nothing between you yet.`;
  const cap = BRAIN.social.factsPerPlayer;
  const more = facts.length > cap ? `; and ${facts.length - cap} more` : '';
  return `  What you know of ${name}: ${facts.slice(0, cap).join('; ')}${more}.`;
}

function readLine(name: string, read: LastRead | undefined): string {
  if (!read) return `  Your read of ${name}: none recorded yet.`;
  const notes = read.notes.slice(0, BRAIN.social.readsPerPlayer).map((n) => `"${n}"`);
  return `  Your read of ${name} (month ${read.month}): stance ${read.stance ?? 'not set'}${notes.length > 0 ? `; ${notes.join('; ')}` : ''}.`;
}

/** The heard lines as the table-talk block quotes them, a whisper to the seat marked as one. */
const heardTalk = (talk: readonly TableTalk[]): TableTalk[] =>
  talk.slice(-BRAIN.social.heardLines).map((t) => (t.to === 'me' ? { from: `${t.from} (whispered to you)`, text: t.text } : t));

/** What the reply may set for each player, and the messages it may send. */
function askLines(): string[] {
  const { messagesPerMonth, whispersPerPlayerMonth } = BRAIN.social;
  return [
    `Decide where you stand with each player and why, what you want from each and how you win them, and up to ${messagesPerMonth} messages to send now.`,
    `- /strategy/stances/<id>: ${STANCES.join(', ')}, for a player by their id.`,
    `- /rivalReads/<id>: your notes on that player, at most ${BRAIN.social.readsPerPlayer}: where you stand and what you want from them. Nothing plays from a note.`,
    `- messages: at most ${messagesPerMonth}, at most ${whispersPerPlayerMonth} to one player; each to a player's id or "table", with its purpose, its text and its facts.`,
    `Each message's text is at most ${BRAIN.maxLineChars} characters, in your character's voice and family-friendly. You may bluff about your own intentions, never about a game fact or rule. List every game fact a message states in its facts (a price, a plot's owner, a player's Worth, your own holding, or a rule by its action), and write no other number than a fact's, a month, a plot or a count you intend: a message that fails is not sent.`,
  ];
}

/**
 * The social section for the seat `me`, from its observation `view`, every seat's Worth, what it heard and its memory.
 * Public facts and what was said to the seat only. Deterministic for its inputs.
 */
export function socialSection(view: GameState, me: PlayerId, worth: Readonly<Record<PlayerId, number>>, talk: readonly TableTalk[], social: SocialInput): string[] {
  const others = view.players.filter((p) => p.id !== me);
  const players = others.flatMap((p) => [
    `- ${positionText(view, worth, p.id).replace(`${p.name}:`, `${p.name} (id ${p.id}):`)} Reputation ${p.reputation}.`,
    knownLine(p.name, social.memory[p.id]),
    readLine(p.name, social.reads[p.id]),
  ]);
  return [
    'Social.',
    'The other players:',
    ...players,
    '',
    'Politics:',
    ...politicsLines(view, BRAIN.social.candidatesPerOffice),
    '',
    'The last lines you heard, to you or the table:',
    tableTalkBlock(heardTalk(talk)),
    '',
    ...askLines(),
  ];
}
