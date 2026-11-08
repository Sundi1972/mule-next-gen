import type { MuleView, NewsLine, PlayerView, TableView } from '@mule/protocol';
import type { TableClient } from '../../../../../apps/web/src/net/client';
import { aPlayer } from '../../../../../apps/web/test/fixtures/views';
import { boardViewFor, type MockWorld } from '../fixture';
import { brokenIn, brokenWho, brokenWords } from './copied/deals-words';

/*
 * MOCK PLUMBING, not a design: the one file that reads the phone side's world. A change to the world's shape costs this
 * file only. The view is the fixture's boardViewFor: what the server sends the TV (role 'board'), no seat's own.
 */

export type { MockWorld };

export type TvFocus = 'planning' | 'deal-offered' | 'deal-broken' | 'budget-set' | 'overrule-called' | 'overrule-reveal' | 'guarding' | 'waiting' | 'month-end';

export interface TvScreen {
  table: TableView<MuleView>;
  game: MuleView;
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
  const game: MuleView = { ...view, players: seatsOf(view.players, seats), newsLines: newsLinesOf(view) };
  return { table: { ...table, game }, game, chat: world.chat.filter((m) => !m.to) };
}

/**
 * MEASURING ONLY. Two seats: Lena and Brix, so the Governor's row stays (who a line names but the table lacks reads as
 * the news wrote it). Six: the four, then a person and a computer seat, so the TV folds its AIs into one row (FOLD_AIS_FROM).
 */
function seatsOf(players: PlayerView[], seats: Seats): PlayerView[] {
  if (seats === 2) return players.filter((p) => p.id === 'lena' || p.id === 'brix');
  if (seats === 4) return players;
  const at = (i: number) => players[i % players.length]!;
  return [
    ...players,
    aPlayer({ id: 'mira', name: 'Mira', slot: 4, species: 'glimmer', money: at(0).money, plots: at(0).plots, worth: at(2).worth, lastWorth: at(2).lastWorth, reputation: at(0).reputation }),
    aPlayer({ id: 'vex', name: 'Vex', slot: 5, species: 'quibbit', isAi: true, ready: true, money: at(1).money, plots: at(1).plots, worth: at(3).worth, lastWorth: at(3).lastWorth, reputation: at(1).reputation }),
  ];
}

/**
 * What the TV announces as a moment (TV_EVENT_HOLD_S), by a stable id: each card broken this month, and an overrule
 * call while it is held for planning's end.
 */
export function eventsOf(game: MuleView): string[] {
  const breaks = brokenIn(game, game.month).map((c) => `break:${c.id}`);
  const o = game.politics?.overrule;
  return o?.stage === 'called' ? [...breaks, `call:${o.target}:${o.caller}`] : breaks;
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
    serverNow: () => 0,
    intent: () => {},
    chat: () => {},
    emote: () => {},
    dismiss: () => {},
    watch: () => {},
  } as unknown as TableClient;
}

/** This month's broken cards, the one rule the banner and the month end share. */
export const brokenThisMonth = (game: MuleView) => brokenIn(game, game.month);
