import type { MuleView } from '@mule/protocol';
import type { Locator, Page } from 'playwright';
import type { MuleGame } from '../../server/src/mule-game.js';
import { check, type GameStepContext } from './harness';

/**
 * C20's browser steps, at the month end in smoke: the month end holds with no clock until the phone taps "On to month
 * N" (B-AC-13), and the phone and the TV show the league table by Worth, the lead, each change since last month (none
 * in month 1), who went hungry and the air against last month, your own lines on your phone only (B-AC-12).
 */

const PRESS_MS = 2_000;
/** Longer than the month end's old clock at smoke's phase scale (8 s × 0.1), so a clock left on would have ended it. */
const HOLD_MS = 2_000;
/** How long a phone has to show the month end once the month's last good has closed. */
const MONTH_END_MS = 10_000;

/** What the TV showed at a month's end: each player's Worth and the air level, read off the screen. */
export interface MonthEndSeen {
  month: number;
  worth: Record<string, number>;
  air: number;
}

/** The view the server would send the board right now: the truth the screens are checked against. */
function board(ctx: GameStepContext): MuleView {
  const room = ctx.server.registry.get(ctx.code);
  check(room, `a room ${ctx.code} on the server`);
  return (room as unknown as { game: MuleGame }).game.viewFor(null);
}

/** A number as the screens print it: thousands separators, and a minus sign when negative. */
function readNumber(text: string | null, what: string): number {
  const shown = (text ?? '').trim();
  check(/^[−-]?[\d,]+$/.test(shown), `${what} is a number, got "${shown}"`);
  const n = Number(shown.replace(/[^\d]/g, ''));
  return /^[−-]/.test(shown) ? -n : n;
}

const text = async (where: Locator) => ((await where.textContent({ timeout: PRESS_MS })) ?? '').replace(/\s+/g, ' ').trim();
const fmt = (n: number) => Math.round(n).toLocaleString('en');
/** The change since last month as the table prints it. */
const changeWords = (change: number) => (change > 0 ? `↑ +${fmt(change)}` : change < 0 ? `↓ −${fmt(-change)}` : '± 0');

/** The league table's rows top to bottom, as player ids, and each player's Worth as that screen shows it. */
async function readLeague(screen: Locator): Promise<{ order: string[]; worth: Record<string, number> }> {
  const ids = await screen.locator('[data-testid^="league-row-"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-testid')!.slice('league-row-'.length)));
  const worth: Record<string, number> = {};
  for (const id of ids) worth[id] = readNumber(await screen.getByTestId(`worth-${id}`).textContent({ timeout: PRESS_MS }), `worth-${id}`);
  return { order: ids, worth };
}

/**
 * B-AC-13 in the browser: at the month end the phone and the TV show it with no clock and it is still up after
 * longer than its old clock; the TV's Worth and air are read for next month's change; then the phone, the only human
 * at this table, taps "On to month N" and planning opens. The AI seats never held it.
 */
export async function theMonthEndHoldsForThePhone(ctx: GameStepContext, month: number): Promise<{ seen: MonthEndSeen; line: string }> {
  const { phone, tv } = ctx;
  const started = Date.now();
  const end = phone.locator('[data-phase=upkeep]');
  const tvEnd = tv.getByTestId('tv-monthend');
  const onTo = end.getByTestId('ready');
  await onTo.waitFor({ timeout: MONTH_END_MS });
  await tvEnd.waitFor({ timeout: PRESS_MS });
  check((await text(onTo)) === `On to month ${month + 1}`, `B-AC-13: the phone's Ready at month ${month}'s end reads "On to month ${month + 1}", got "${await text(onTo)}"`);
  check(board(ctx).phaseEndsAt === null, `B-AC-13: month ${month}'s end has no clock on the server`);
  await phone.waitForTimeout(HOLD_MS);
  check((await end.count()) === 1 && (await tvEnd.count()) === 1, `B-AC-13: ${HOLD_MS} ms on, month ${month}'s end is still up on the phone and the TV`);

  const { worth } = await readLeague(tvEnd);
  const air = readNumber(await tvEnd.getByTestId('air-level').textContent(), "the TV's air level");
  await onTo.click({ timeout: PRESS_MS });
  await phone.locator('[data-phase=planning]').waitFor({ timeout: PRESS_MS });
  return { seen: { month, worth, air }, line: `month ${month}'s end held ${((Date.now() - started) / 1_000).toFixed(1)} s until the phone's tap` };
}

/**
 * B-AC-12 at a month end, read off the phone and the TV against the server's view: both rank by Worth with the lead
 * line; each change cell is this Worth less the one the TV showed at `last` month's end, or with no `last` (month 1)
 * says there is no last month; the TV names who went hungry, says whether the colonists were fed, and gives the air
 * against last month or says there is none yet; the phone's own lines add up to its Worth, and no other screen
 * carries them. The change formula itself is proven at the server (T-AC-15) and in markup (month-end.test.ts).
 */
export async function theLeagueTableAtTheMonthEnd(ctx: GameStepContext, last?: MonthEndSeen, self = 's1'): Promise<string> {
  const { phone, tv } = ctx;
  const started = Date.now();
  const end = phone.locator('[data-phase=upkeep]');
  const tvEnd = tv.getByTestId('tv-monthend');
  await end.getByTestId('league').waitFor({ timeout: MONTH_END_MS });
  await tvEnd.waitFor({ timeout: PRESS_MS });
  const truth = board(ctx);
  const month = truth.month;
  check(last ? month === last.month + 1 : month === 1, `B-AC-12: this is the month after ${last ? `month ${last.month}` : 'none (month 1)'}, got month ${month}`);
  const byWorth = [...truth.players].sort((a, b) => b.worth - a.worth);
  const name = (id: string) => truth.players.find((p) => p.id === id)!.name;

  for (const [screen, where] of [
    ['phone', end],
    ['TV', tvEnd],
  ] as const) {
    const league = await readLeague(where);
    check(league.order.length === truth.players.length, `B-AC-12: the ${screen}'s table lists all ${truth.players.length} players, got ${league.order.length}`);
    for (let i = 1; i < league.order.length; i++) {
      check(league.worth[league.order[i - 1]!]! >= league.worth[league.order[i]!]!, `B-AC-12: the ${screen}'s table runs by Worth: ${league.order.join(' > ')}`);
    }
    for (const p of truth.players) check(league.worth[p.id] === p.worth, `B-AC-12: the ${screen} shows ${p.name}'s Worth ${league.worth[p.id]}, the server's is ${p.worth}`);
    const top = byWorth[0]!;
    const second = byWorth[1]!;
    const lead = top.worth === second.worth ? null : `${top.id === self && screen === 'phone' ? 'You' : top.name} ${top.id === self && screen === 'phone' ? 'lead' : 'leads'} by ${fmt(top.worth - second.worth)} cr`;
    const said = await text(where.getByTestId('leader-line'));
    check(lead === null ? said.endsWith('are level') : said === lead, `B-AC-12: the ${screen}'s lead line reads "${said}", want "${lead ?? '… are level'}"`);
    for (const p of truth.players) {
      const shown = await text(where.getByTestId(`change-${p.id}`));
      if (!last) {
        check(p.lastWorth === null && shown === '—', `B-AC-12: in month 1 the ${screen}'s change for ${p.name} says there is no last month, got "${shown}" (lastWorth ${p.lastWorth})`);
        continue;
      }
      // Against what the TV showed at last month's end, not the server's record: the number shown then.
      const change = p.worth - last.worth[p.id]!;
      check(shown === changeWords(change), `B-AC-12: the ${screen}'s change for ${p.name} reads "${shown}", want ${changeWords(change)} (${p.worth} now, ${last.worth[p.id]} shown at month ${last.month}'s end)`);
    }
  }

  // The colony, on the TV: who went hungry by the month's condition, the colonists, and the air against last month's.
  const hungry = truth.players.filter((p) => p.condition && p.condition.foodShare < 1);
  for (const p of truth.players) {
    const line = tvEnd.getByTestId(`hungry-${p.id}`);
    const c = p.condition;
    if (!c || c.foodShare >= 1) {
      check((await line.count()) === 0, `B-AC-12: the TV does not name ${p.name} as hungry`);
      continue;
    }
    const want = `${p.name} went hungry: ate ${Math.round(c.foodShare * c.foodNeed)} of ${c.foodNeed} Food`;
    check((await text(line)) === want, `B-AC-12: the TV's hunger line for ${p.name} reads "${await text(line)}", want "${want}"`);
  }
  check((await tvEnd.getByTestId('nobody-hungry').count()) === (hungry.length === 0 ? 1 : 0), `B-AC-12: the TV says nobody went hungry exactly when nobody did (${hungry.length} hungry)`);
  const colonists = await text(tvEnd.getByTestId('colonists'));
  check(colonists.startsWith(truth.colonistsFed ? 'Colonists fed' : 'Colonists went short'), `B-AC-12: the TV's colonists line reads "${colonists}", the server's colonistsFed is ${truth.colonistsFed}`);
  const air = truth.air.level;
  check(readNumber(await tvEnd.getByTestId('air-level').textContent(), "the TV's air") === air, `B-AC-12: the TV's air is the server's ${air}`);
  const trend = await text(tvEnd.getByTestId('air-trend'));
  if (!last) {
    check(truth.lastAir === null && trend === 'The first month: nothing to compare yet', `B-AC-12: in month 1 the TV's air trend says there is no last month, got "${trend}"`);
  } else {
    const way = air > last.air ? '↓ worse than' : air < last.air ? '↑ better than' : '± same as';
    check(trend.startsWith(`${way} month ${last.month} (${last.air}`), `B-AC-12: the TV's air trend reads "${trend}", want "${way} month ${last.month} (${last.air}…"`);
  }

  // Your own lines: on your phone, adding up to the Worth in both tables; on no other screen.
  const lines = await end.locator('[data-testid^="worth-cr-"]').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
  const sum = lines.filter((l) => l.trim() !== '—').reduce((s, l) => s + readNumber(l, 'one of your lines'), 0);
  const mine = truth.players.find((p) => p.id === self)!;
  check(sum === mine.worth, `B-AC-12: the phone's own lines ${lines.join(' + ')} add up to ${sum}, its Worth is ${mine.worth}`);
  check(readNumber(await end.getByTestId('worth-total-cr').textContent(), 'your Worth') === mine.worth, 'B-AC-12: the phone gives its own Worth under its lines');
  const onTv = await tv.locator('[data-testid="your-worth"], [data-testid^="worth-line-"], [data-testid^="worth-cr-"]').count();
  check(onTv === 0, `B-AC-12: the TV carries nobody's lines (HC-4), found ${onTv}`);
  const cashLeader = [...truth.players].sort((a, b) => b.money - a.money)[0]!;
  return `month ${month}: ${byWorth.map((p) => `${p.name} ${p.worth}`).join(', ')}; ${name(byWorth[0]!.id)} leads${cashLeader.id === byWorth[0]!.id ? ', also on cash' : `, ${cashLeader.name} on cash`}; hungry ${hungry.map((p) => p.name).join(', ') || 'nobody'}; ${colonists}; air ${last ? `${last.air} → ` : ''}${air}; read in ${((Date.now() - started) / 1_000).toFixed(1)} s`;
}

/** B-AC-12 at game over: the winner line and the final Worth in credits on both screens, never points. */
export async function gameOverIsInCredits(phone: Page, tv: Page): Promise<string> {
  const line = await text(tv.getByTestId('tv-winner').getByTestId('winner-line'));
  check(/^(.+ wins with a Worth of [\d,]+ cr|.+ share the colony, each with a Worth of [\d,]+ cr)$/.test(line), `B-AC-12: the TV's winner line is in credits, got "${line}"`);
  check(/^Worth [\d,]+ cr$/.test(await text(phone.getByTestId('winner-worth'))), 'B-AC-12: the phone gives your final Worth in credits');
  for (const [screen, page] of [
    ['phone', phone],
    ['TV', tv],
  ] as const) {
    const body = await page.locator('[data-phase=gameOver]').innerText({ timeout: PRESS_MS });
    check(!/\bpoints?\b/i.test(body), `B-AC-12: the ${screen}'s game over never says points`);
  }
  return line;
}
