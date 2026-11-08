import { EVENT_SHOW, productionShowMs } from '@mule/engine';
import type { EventView, MuleView, NewsLine, PlayerView, TableView } from '@mule/protocol';
import type { TableClient } from '../../../../../apps/web/src/net/client';
import { aPlayer } from '../../../../../apps/web/test/fixtures/views';
import { boardViewFor, showEventsOf, type MockWorld } from '../fixture';
import { brokenIn, brokenWho, brokenWords } from './copied/deals-words';

/*
 * MOCK PLUMBING, not a design: the one file that reads the phone side's world. A change to the world's shape costs this
 * file only. The view is the fixture's boardViewFor: what the server sends the TV (role 'board'), no seat's own.
 */

export type { MockWorld };

export type TvFocus =
  | 'planning' | 'deal-offered' | 'deal-broken' | 'budget-set' | 'overrule-called' | 'overrule-reveal' | 'guarding' | 'waiting' | 'month-end'
  // The Sheriff month (?path=sheriff): production's catch, the fine, its month end; optional: an unseen cut, an investigation.
  | 'production-caught' | 'fine-set' | 'month-end-fine' | 'production-dark' | 'investigation';

/** An investigation's public result this planning (the fixture's world.investigation): which case, and whether solved. */
export type Investigation = { order: string; solved: boolean } | null;

export interface TvScreen {
  table: TableView<MuleView>;
  game: MuleView;
  investigation: Investigation;
  /** The public chat: the TV never sees a whisper. */
  chat: MockWorld['chat'];
}

/** For TV-FIT at other table sizes (the solo page): 2 seats, the world's 4, or 6. */
export type Seats = 2 | 4 | 6;

/**
 * The TV's view of the world. It draws the world as it stands, as the real TV draws the server's view: the step's focus
 * adds nothing the world does not hold (a private card, a Sheriff's guard change nothing on it; the reveal and the
 * month end are the world's own stages). `seats` is for measuring only: the world's own table is four.
 */
export function tvScreen(world: MockWorld, { seats = 4 }: { seats?: Seats } = {}): TvScreen {
  const { view, table } = boardViewFor(world);
  const named = [...brokenIn(view, view.month).map((c) => c.brokenBy ?? c.from), ...(view.politics?.sabotage?.incidents ?? []).flatMap((i) => (i.culprit ? [i.culprit] : []))];
  const keep = [view.politics?.governor, ...named].filter((id): id is string => !!id);
  const seated: MuleView = { ...view, players: seatsOf(view.players, seats, keep), newsLines: newsLinesOf(view) };
  // Production (the Sheriff path): the month's public sabotage events, as the server files them (showEventsOf, #p10's
  // shape: ShowEventView + `sabotage`). WS7's 'powerCut' key is not in trunk's EventKey yet: hence the cast, as WS8's.
  const game = world.stage === 'production' ? productionOf(seated, showEventsOf(world) as unknown as EventView[]) : seated;
  const investigation = world.investigation ?? null;
  return { table: { ...table, game }, game, chat: world.chat.filter((m) => !m.to), investigation };
}

/**
 * MEASURING ONLY. Two seats: the Governor and the one the screen is about (this month's breaker, else a named
 * saboteur), so the Governor's row and the moment's or the stamp's name stay (Ossa · AI and Brix on the planning path,
 * Lena and Brix on the Sheriff's). Who a line names but the table lacks reads as the news wrote it, or "someone". Six: the four, then a person and a computer seat, so the TV folds its AIs into one row (FOLD_AIS_FROM).
 */
function seatsOf(players: PlayerView[], seats: Seats, keep: string[]): PlayerView[] {
  if (seats === 2) {
    const two = [...new Set([...keep, ...players.map((p) => p.id)])].slice(0, 2);
    return players.filter((p) => two.includes(p.id));
  }
  if (seats === 4) return players;
  const at = (i: number) => players[i % players.length]!;
  return [
    ...players,
    aPlayer({ id: 'mira', name: 'Mira', slot: 4, species: 'glimmer', money: at(0).money, plots: at(0).plots, worth: at(2).worth, lastWorth: at(2).lastWorth, reputation: at(0).reputation }),
    aPlayer({ id: 'vex', name: 'Vex', slot: 5, species: 'quibbit', isAi: true, ready: true, money: at(1).money, plots: at(1).plots, worth: at(3).worth, lastWorth: at(3).lastWorth, reputation: at(1).reputation }),
  ];
}

/**
 * What the TV announces as a moment (TV_EVENT_HOLD_S), by a stable id: each card broken this month, an overrule call
 * while it is held for planning's end, and an investigation's result.
 */
export function eventsOf(game: MuleView, investigation: Investigation = null): string[] {
  const breaks = brokenIn(game, game.month).map((c) => `break:${c.id}`);
  const o = game.politics?.overrule;
  const call = o?.stage === 'called' ? [`call:${o.target}:${o.caller}`] : [];
  const found = investigation ? [`investigation:${investigation.order}`] : [];
  return [...breaks, ...call, ...found];
}

/** Whom a solved case names: the incident's culprit, public once solved. */
export function culpritOf(game: MuleView, order: string) {
  const id = game.politics?.sabotage?.incidents.find((i) => i.id === order)?.culprit;
  return id ? (game.players.find((p) => p.id === id) ?? null) : null;
}

/** The news's seats by id, for SeatWords: a line that is a broken card's public words names its seats (finding F-11's stand-in). */
function newsLinesOf(view: MuleView): NewsLine[] {
  const broken = view.politics?.brokenDeals ?? [];
  return view.news.map((text) => {
    const c = broken.find((b) => text.startsWith(brokenWords(view, b)));
    return { text, who: c ? brokenWho(c) : [] };
  });
}

/** The TV's client on this screen: role 'board', the public chat, nothing it can send. */
export function tvClient(screen: TvScreen): TableClient {
  const state = { status: 'open', role: 'board', code: screen.table.code, seatId: null, view: screen.table, chat: screen.chat, emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null };
  return {
    subscribe: () => () => {},
    getState: () => state,
    // The mock's server clock is the page's: production's show runs off phaseEndsAt against it (productionOf).
    serverNow: () => performance.now(),
    intent: () => {},
    chat: () => {},
    emote: () => {},
    dismiss: () => {},
    watch: () => {},
  } as unknown as TableClient;
}

/** This month's broken cards, the one rule the banner and the month end share. */
export const brokenThisMonth = (game: MuleView) => brokenIn(game, game.month);

/**
 * Production as the server would send it for these events: the phase, its show (the events, the intro, its length by
 * the engine's own timeline), and when it ends, from now on the mock's clock, so the show plays from the screen's start.
 * `lines` (the harvest) are the world's plots that make something: none in the fixture, whose plots have no MULEs.
 */
export function productionOf(game: MuleView, events: EventView[], lines: NonNullable<MuleView['production']>['lines'] = []): MuleView {
  const introMs = events.length > 0 ? EVENT_SHOW.introMs : 0;
  const eventsMs = events.length > 0 ? events.reduce((n, e) => n + e.playMs, introMs) : 0;
  const lengthMs = productionShowMs(new Set(lines.map((l) => l.good)).size, eventsMs);
  return { ...game, phase: 'production', phaseEndsAt: performance.now() + lengthMs, production: { lines, events, lengthMs, introMs, hurry: null } };
}
