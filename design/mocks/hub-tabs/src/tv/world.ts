import type { MuleView, NewsLine, TableView } from '@mule/protocol';
import type { TableClient } from '../../../../../apps/web/src/net/client';
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

/**
 * The TV's view of the world. It draws the world as it stands, as the real TV draws the server's view: the step's focus
 * adds nothing the world does not hold (a private card, a Sheriff's guard change nothing on it; the reveal and the
 * month end are the world's own stages).
 */
export function tvScreen(world: MockWorld): TvScreen {
  const { view, table } = boardViewFor(world);
  const game: MuleView = { ...view, newsLines: newsLinesOf(view) };
  return { table: { ...table, game }, game, chat: world.chat.filter((m) => !m.to) };
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
