import type { ColonyView, MuleView, NewsLine, OverruleView, TableView } from '@mule/protocol';
import type { TableClient } from '../../../../../apps/web/src/net/client';
import { creditsOf, FUND, tally, viewFor, type World } from '../fixture';
import { brokenIn, brokenWho, brokenWords } from './copied/deals-words';

/*
 * MOCK PLUMBING, not a design: the one file that reads the phone side's world. A change to the world's shape costs this
 * file only. What it builds is what the server would send the TV (role 'board'): the public view, no seat's own.
 */

/** The phone side's world. TODO(stub): mock-hub-tabs exports it as MockWorld from ../fixture; until then it is World. */
export type MockWorld = World;

export type TvFocus = 'planning' | 'deal-offered' | 'deal-broken' | 'budget-set' | 'overrule-called' | 'overrule-reveal' | 'guarding' | 'waiting' | 'month-end';

export interface TvScreen {
  table: TableView<MuleView>;
  game: MuleView;
  /** The public chat: the TV never sees a whisper. */
  chat: World['chat'];
}

/**
 * The TV's view of the world at this step of the month. Every screen but two is planning, drawn from the world as it
 * stands: a private card, a Sheriff's guard change nothing on it. Two steps are moments the world does not hold:
 *  - 'overrule-reveal': the ballot's result, tallied from the world's cast votes (the fixture's tally, S5-RULE-8);
 *  - 'month-end': the upkeep run on the world's budget (S5-RULE-3, as the budget mock's MONTH_END), phase 'upkeep'.
 */
export function tvScreen(world: MockWorld, focus: TvFocus): TvScreen {
  // The view is built for a seat; the TV keeps only what every seat sees, and no `me`.
  const { view, table } = viewFor('lena', world);
  let game: MuleView = { ...view, me: null, newsLines: newsLinesOf(view) };
  if (focus === 'overrule-reveal' && game.politics?.overrule) game = withReveal(game, world);
  if (focus === 'month-end') game = atMonthEnd(game);
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

/** The overrule's reveal: the stage the fixture never reaches on its own, the result tallied from the world's ballots. */
function withReveal(game: MuleView, world: MockWorld): MuleView {
  const o = game.politics!.overrule!;
  const { passed, yes, no } = tally(world);
  const overrule: OverruleView = { ...o, stage: 'reveal', voted: Object.keys(world.overruleBallots), result: { passed, yes, no }, clockMs: 0 };
  return { ...game, politics: { ...game.politics!, overrule } };
}

/**
 * The month's upkeep, on the world's budget (S5-RULE-3, the budget mock's MONTH_END): office pay and the standing
 * buildings' upkeep come off first; Welfare's share goes to welfareTo; Projects' share is a ceiling the commissioned
 * buildings take what they still need from, in commission order; the rest stays. All from config, the world and the view.
 */
function atMonthEnd(game: MuleView): MuleView {
  const colony = game.colony;
  const politics = game.politics;
  if (!colony || !politics?.budget) return { ...game, phase: 'upkeep' };
  const share = (line: 'projects' | 'welfare') => politics.budget!.lines.find((l) => l.line === line)?.share ?? 0;
  const officePay = (politics.pay.governor ?? 0) + (politics.pay.sheriff ?? 0);
  const upkeep = colony.projects.filter((p) => p.stage === 'standing').reduce((n, p) => n + p.upkeep, 0);
  const welfare = politics.budget.welfareTo ? creditsOf('welfare', share('welfare'), FUND) : 0;
  let left = creditsOf('projects', share('projects'), FUND);
  const projects = colony.projects.map((p) => {
    if (p.stage !== 'commissioned') return p;
    const take = Math.min(left, p.cost.credits - p.funded.credits);
    left -= take;
    return { ...p, funded: { ...p.funded, credits: p.funded.credits + take } };
  });
  const project = creditsOf('projects', share('projects'), FUND) - left;
  const balance = FUND - welfare - project;
  const next: ColonyView = {
    ...colony,
    fund: balance,
    projects,
    ledger: { month: game.month, in: {}, out: { officePay, upkeep, welfare, project } },
    welfare: welfare > 0 && politics.budget.welfareTo ? { month: game.month, to: politics.budget.welfareTo, paid: welfare } : null,
  };
  return { ...game, phase: 'upkeep', colony: next, politics: { ...politics, fund: balance } };
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
