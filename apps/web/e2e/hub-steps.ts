/**
 * B-AC-14 (C17, RULE-8): planning is the hub for the month. Run by smoke.ts in month-2 planning, right after
 * store-steps' makeHungry seated the human at 2 Food against a need of 5 (nine farms, which also burn Energy).
 * Quick by design: planning is about 4.5 s at the smoke's phase scale, and listedSale has used part of it.
 */
import { GOODS, monthNeeds, type GameState, type Good } from '@mule/engine';
import type { Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { check, PHONE } from './harness';
import { LAPTOP } from './shell-steps';

/** The human sits in seat 1. */
const SEAT = 's1';
/** makeHungry's Food: the seat holds 2. */
const HUNGRY_FOOD = 2;
/** RULE-8: these first, in this order; then the rest by need. */
const FIRST: Good[] = ['food', 'water', 'energy'];
/** Desks of an office the smoke's phone does not hold: nobody runs in month 1, so it is appointed Governor (lowest seat, equal money). */
const OFFICE_DESKS = ['sheriff'];
/** C17: what exists today, and nothing else, is drawn. */
const TODAYS_DESKS = ['colony', 'talk', 'council', 'market', 'governor'];
const TODAYS_TOOLS = ['look', 'drone', 'list'];
/** B-AC-12: the stage's content fills at least this share of the stage's height. */
const FILL = 0.8;

type Shown = {
  phase: string | null;
  onStage: { agenda: boolean; map: boolean; marketStrip: boolean };
  desks: string[];
  tools: string[];
  needs: { good: string; text: string }[];
  thisMonthInColony: boolean;
  nowFirst: boolean;
  nowTitle: string;
  nowDetail: string;
  /** Review-aid labels the mock carries and the game must not. */
  reviewLabels: string[];
  fill: number;
};

/**
 * B-AC-14: the hub shows "This month" and the colony map on the stage; the Colony desk's needs say SHORT or OK as
 * the engine's monthNeeds has them; a good with no need has no row; no office desk is drawn without the office.
 * With it, B-AC-12's planning part: `now` opens the rail at 844×390 and at 1440×900. Returns what it saw, to log.
 */
export async function planningIsTheHub(phone: Page, server: MuleServer, code: string, timeout = 2_000): Promise<string> {
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  const state = (room as unknown as { game: { state: GameState } }).game.state;
  check(state.phase === 'planning', `B-AC-14: the hub step runs in planning, not in ${state.phase}`);
  const me = state.players.find((p) => p.id === SEAT);
  check(me, `seat ${SEAT} in the game`);
  check(me.stock.food === HUNGRY_FOOD, `B-AC-14: makeHungry seated ${SEAT} at ${HUNGRY_FOOD} Food, got ${me.stock.food}`);
  const need = monthNeeds(state, SEAT);
  const have = { ...me.stock };

  const planning = phone.locator('[data-phase=planning]');
  await planning.getByTestId('desk-colony').click({ timeout });
  const verdict = (g: Good) => (have[g] >= need[g] ? 'OK' : `SHORT ${need[g] - have[g]}`);
  await planning.getByTestId('need-food').filter({ hasText: verdict('food') }).waitFor({ timeout });

  const narrow = await read(phone);
  checkHub(narrow, `${PHONE.viewport.width}×${PHONE.viewport.height}`);
  const expected = GOODS.filter((g) => need[g] > 0);
  const rows = narrow.needs.map((n) => n.good);
  check(JSON.stringify([...rows].sort()) === JSON.stringify([...expected].sort()), `B-AC-14: a row for each good she needs this month (${expected.join(', ')}), got ${rows.join(', ')}`);
  const firsts = rows.filter((g) => FIRST.includes(g as Good));
  check(JSON.stringify(rows.slice(0, firsts.length)) === JSON.stringify(FIRST.filter((g) => need[g] > 0)), `B-AC-14 (RULE-8): Food, Water and Energy lead the needs, got ${rows.join(', ')}`);
  for (const n of narrow.needs) {
    const g = n.good as Good;
    check(n.text.includes(verdict(g)), `B-AC-14: need-${g} says ${verdict(g)} (have ${have[g]}, need ${need[g]}), got "${n.text}"`);
    check(n.text.includes(`HAVE ${have[g]} · NEED ${need[g]}`), `B-AC-14: need-${g} shows have ${have[g]} against need ${need[g]}, got "${n.text}"`);
  }
  check(need.food - have.food === 3, `B-AC-14: the seeded shortfall is Food 2 of 5, got ${have.food} of ${need.food}`);
  check(need.smithore === 0 && !rows.includes('smithore'), `B-AC-14 (negative): with no mine or factory she needs no Smithore and has no row for it, got rows ${rows.join(', ')}`);
  check(narrow.nowTitle === 'Plan your month, then press Ready', `B-AC-14 (RULE-8): Now says "Plan your month, then press Ready", got "${narrow.nowTitle}"`);
  check(/land grant/.test(narrow.nowDetail) && /Food/.test(narrow.nowDetail), `B-AC-14 (RULE-8): Now names the land grant as next and the short Food, got "${narrow.nowDetail}"`);

  let wide: Shown;
  try {
    await phone.setViewportSize(LAPTOP);
    wide = await read(phone);
  } finally {
    await phone.setViewportSize(PHONE.viewport);
  }
  checkHub(wide, `${LAPTOP.width}×${LAPTOP.height}`);
  check(wide.onStage.marketStrip, `B-AC-14: at ${LAPTOP.width} px the store's prices sit under the map, on the stage`);
  return `desks ${narrow.desks.join(', ')}; needs ${narrow.needs.map((n) => `${n.good} ${verdict(n.good as Good)}`).join(', ')}; now first at 844 and 1440; stage filled ${(narrow.fill * 100).toFixed(0)}% / ${(wide.fill * 100).toFixed(0)}%`;
}

function checkHub(f: Shown, at: string): void {
  check(f.phase === 'planning', `B-AC-14: planning still shows at ${at}, got ${f.phase}`);
  check(f.onStage.agenda, `B-AC-14: at ${at} "This month" (agenda) is on the stage`);
  check(f.onStage.map, `B-AC-14: at ${at} the colony map (hub-map) is on the stage`);
  check(f.thisMonthInColony, `B-AC-14: at ${at} the Colony desk holds "This month you need"`);
  const offices = f.desks.filter((d) => OFFICE_DESKS.includes(d));
  check(offices.length === 0, `B-AC-14 (negative): a player without an office sees no office desk, got ${offices.join(', ')}`);
  check(JSON.stringify(f.desks) === JSON.stringify(TODAYS_DESKS), `B-AC-14: at ${at} the desks drawn are exactly ${TODAYS_DESKS.join(', ')}, got ${f.desks.join(', ')}`);
  check(JSON.stringify(f.tools) === JSON.stringify(TODAYS_TOOLS), `B-AC-14: at ${at} the map tools drawn are exactly ${TODAYS_TOOLS.join(', ')}, got ${f.tools.join(', ')}`);
  check(f.reviewLabels.length === 0, `C17: unbuilt slots are not drawn, and no SOON or slice label shows; got ${f.reviewLabels.join(' | ')}`);
  check(f.nowFirst, `B-AC-12: at ${at} planning's rail opens with Now`);
  check(f.fill >= FILL, `B-AC-12: at ${at} the hub fills ${(f.fill * 100).toFixed(0)}% of the stage's height, under ${FILL * 100}%`);
}

/** One read of the planning screen, after a paint, in one pass. */
async function read(phone: Page): Promise<Shown> {
  return phone.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const screen = document.querySelector('[data-phase]');
    const stage = screen?.querySelector('[data-testid=stage]');
    const guide = screen?.querySelector('[data-testid=guide]');
    const body = guide?.querySelector('header')?.nextElementSibling;
    const tabs = screen?.querySelector('[data-testid=desks]');
    const content = stage?.firstElementChild;
    const stageBox = stage?.getBoundingClientRect();
    const pad = stage ? parseFloat(getComputedStyle(stage).paddingTop) + parseFloat(getComputedStyle(stage).paddingBottom) : 0;
    const shell = screen?.querySelector('[data-testid=game-shell]') as HTMLElement | null;
    return {
      phase: screen?.getAttribute('data-phase') ?? null,
      onStage: {
        agenda: !!stage?.querySelector('[data-testid=agenda]'),
        map: !!stage?.querySelector('[data-testid=hub-map]'),
        marketStrip: !!stage?.querySelector('[data-testid=market-strip]') && (stage.querySelector('[data-testid=market-strip]') as HTMLElement).offsetParent !== null,
      },
      desks: [...(tabs?.querySelectorAll('[data-testid^="desk-"]') ?? [])].map((d) => d.getAttribute('data-testid')!.slice('desk-'.length)),
      tools: [...(screen?.querySelectorAll('[data-testid=map-tools] [data-testid^="tool-"]') ?? [])].map((t) => t.getAttribute('data-testid')!.slice('tool-'.length)),
      needs: [...(guide?.querySelectorAll('[data-testid^="need-"]') ?? [])].map((n) => ({ good: n.getAttribute('data-testid')!.slice('need-'.length), text: (n as HTMLElement).innerText })),
      thisMonthInColony: !!guide?.querySelector('[data-testid=desk-body-colony] [data-testid=this-month]'),
      nowFirst: !!body && body.firstElementChild === guide?.querySelector('[data-testid=now]'),
      nowTitle: guide?.querySelector('[data-testid=now-title]')?.textContent ?? '',
      nowDetail: (guide?.querySelector('[data-testid=now]') as HTMLElement | null)?.innerText ?? '',
      reviewLabels: (shell?.innerText ?? '').split('\n').filter((l) => /\bSOON\b|\bSLICE\b|\bWS7\b/.test(l)),
      fill: content && stageBox ? content.getBoundingClientRect().height / (stageBox.height - pad) : 0,
    };
  });
}
