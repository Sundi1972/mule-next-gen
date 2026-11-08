import { baseWorld, CAUGHT_MOVE, FINE_STEPS_CFG, resolveOrders, STANDARD_FINE_CFG, tileIndex, VICTIM_SHARE, type MockWorld, type SabOrder } from './fixture';
import type { Beat } from './steps';

/*
 * The Sheriff month (Heiko's add-on via the PM, 8 Nov; ?path=sheriff): the same table as the planning path, one
 * sabotage played through. Kai is the Sheriff (D15) and guards Brix's Food plot; Lena orders a power cut on it in
 * secret; production catches Lena at the guarded plot; next planning Kai fines Lena; at that month's end half the fine
 * goes to Brix. Step 4 plays the other side: an unguarded cut that works, then Kai's investigation. Every number is
 * the config's (POLITICS.sabotage, POLITICS.sheriff, reputation.moves.caught), every line WS8's #p6 / #p10 or the
 * spec's (sheriff-words.ts).
 */

/** Brix's Food plot (OUTFITS), the one Lena cuts. */
export const BRIX_FOOD = { x: 9, y: 2 };
const AT = tileIndex(BRIX_FOOD.x, BRIX_FOOD.y);
/** Kai fines the standard (POLITICS.sheriff.fine.standard); Brix gets victimShare of it. */
const FINE = STANDARD_FINE_CFG;
const TO_VICTIM = Math.floor(FINE * VICTIM_SHARE);
const STEP_WORDS = `${FINE_STEPS_CFG[0]} to ${FINE_STEPS_CFG.at(-1)} in ${FINE_STEPS_CFG[1]! - FINE_STEPS_CFG[0]!}s`;

/** The order as the sabotage intent files it (fixture.ts's id: month, the seat's first letters, the kind). */
const order = (month: number, over: Partial<SabOrder> = {}): SabOrder => ({
  id: `sab-${month}lexp`, month, by: 'lena', target: { kind: 'powerCut', tile: AT }, outcome: 'pending', worked: false, guarded: false, seen: false, investigated: false, solved: false, fine: null, ...over,
});

/** Month 5's planning on the Sheriff path: plots carry their MULEs, no order yet, no guard posted. */
const month5 = (over: Partial<MockWorld> = {}) =>
  baseWorld({ outfitted: true, sabotage: { orders: [] }, guards: [], cards: [], news: ['The export ship calls in month 6.'], ...over });
const guarded = (over: Partial<MockWorld> = {}) => month5({ guards: [AT], ...over });
const ordered = () => guarded({ sabotage: { orders: [order(5)] } });
/** Production: the guard catches Lena (S4-RULE-3 row 2); Lena's reputation moves by reputation.moves.caught. */
const caught = () => resolveOrders(ordered(), { worked: true, seen: false });
const monthEnd5 = () => ({ ...caught(), stage: 'monthEnd' as const });
/** Month 6's planning: the caught case is open to fine; the guards of month 5 are gone. */
const month6 = (over: Partial<MockWorld> = {}): MockWorld => ({ ...caught(), month: 6, stage: 'planning', guards: [], ready: [], ...over });
const fined = (): MockWorld => {
  const w = month6();
  const orders = w.sabotage!.orders.map((o) => ({ ...o, fine: { due: FINE, paid: 0, toVictim: TO_VICTIM, by: 'sheriff' as const }, finedMonth: 6 }));
  return { ...w, sabotage: { orders } };
};
const monthEnd6 = (): MockWorld => {
  const w = fined();
  return { ...w, stage: 'monthEnd', sabotage: { orders: w.sabotage!.orders.map((o) => ({ ...o, fine: o.fine && { ...o.fine, paid: o.fine.due } })) } };
};

/** Step 4: month 7, nobody guards Brix's plot; the cut works and nobody sees. */
const month7 = () => ({ ...monthEnd6(), month: 7, stage: 'planning' as const, guards: [] as number[] });
const darkOrdered = () => ({ ...month7(), sabotage: { orders: [...monthEnd6().sabotage!.orders, order(7)] } });
const dark = () => resolveOrders(darkOrdered(), { worked: true, seen: false });
/** Month 8's planning: one unsolved case for Kai to investigate; the seeded draw is `solved`. */
const month8 = (solved: boolean) => ({ ...dark(), month: 8, stage: 'planning' as const, guards: [] as number[], ready: [], verdicts: { 'sab-7lexp': solved } });

export const SHERIFF_STEPS: { n: number; title: string }[] = [
  { n: 1, title: 'Planning: a guard, a secret order' },
  { n: 2, title: 'Production: caught' },
  { n: 3, title: 'Next planning: the fine' },
  { n: 4, title: 'Unguarded: the trail' },
];

export const SHERIFF_BEATS: Beat[] = [
  {
    id: 's1-guard', step: 1, label: 'Kai posts a guard', seat: 'kai', world: () => month5(), start: { tab: 'politics', sub: 'sheriff' }, tv: 'guarding',
    line: 'Kai is the Sheriff. Council › Sheriff is WS8’s case file; its guard line opens the map. Tap “Post a guard”, then Brix’s Food plot (the glowing MULE at the top, right of the river), then Done.',
  },
  {
    id: 's1-guarded', step: 1, label: 'Guarding Brix’s Food plot', seat: 'kai', world: () => guarded(), start: { tab: 'overview', pick: 'guard' }, tv: 'guarding',
    line: 'Overview in Guard mode: Brix’s Food plot wears the guard flag, on Kai’s map only. Nobody else knows which plots are guarded; the TV shows nothing.',
  },
  {
    id: 's1-look', step: 1, label: 'Lena looks at the plot', seat: 'lena', world: () => guarded(), start: { tab: 'overview', tool: 'look', look: BRIX_FOOD }, tv: 'planning',
    line: 'Lena’s Look on Brix’s Food plot. Under the plot card: “Sabotage this plot · Only you” (the build’s S4-C14 from WS8’s #p6). Tap it: what it costs, how often it works, how often it is seen. Order in secret.',
  },
  {
    id: 's1-ordered', step: 1, label: 'Ordered in secret', seat: 'lena', world: () => ordered(), start: { tab: 'overview', tool: 'look', look: BRIX_FOOD }, tv: 'planning',
    line: 'The order waits on the plot card: the crew cuts the power when production starts, paid at the month end; withdraw it until planning ends. Nobody else sees it, not even the Sheriff.',
  },
  {
    id: 's2-caught', step: 2, label: 'Caught at the guarded plot', seat: 'lena', world: () => caught(), tv: 'planning', tvWanted: 'production-caught',
    line: 'Production. The TV plays WS8’s #p10: the guard’s shield, then “Caught!” with Lena. The power stays on. Switch “Playing as”: Lena, Brix and Kai each get their own line.',
  },
  {
    id: 's2-month-end', step: 2, label: 'Month 5 ends', seat: 'lena', world: () => monthEnd5(), tv: 'month-end',
    line: `Month 5’s end: everyone reads that Lena was caught at Brix’s plot; Lena alone sees the crew she paid. Lena’s reputation chip is ${-CAUGHT_MOVE} down.`,
  },
  {
    id: 's3-case', step: 3, label: 'Kai fines Lena', seat: 'kai', world: () => month6(), start: { tab: 'politics', sub: 'sheriff' }, tv: 'planning',
    line: `Month 6. Kai’s case file: Lena’s case says “Fine Lena”. Open it, step the fine (${STEP_WORDS}; unfined by the end of planning, the standard ${FINE}), and Fine.`,
  },
  {
    id: 's3-fined', step: 3, label: 'Fined', seat: 'lena', world: () => fined(), start: { tab: 'overview', tool: 'list' }, tv: 'planning', tvWanted: 'fine-set',
    line: `Lena’s Sell › her orders: everyone knows, fined ${FINE}. On the TV the fine is the news’s first line.`,
  },
  {
    id: 's3-month-end', step: 3, label: 'Month 6 ends: half to Brix', seat: 'brix', world: () => monthEnd6(), tv: 'month-end', tvWanted: 'month-end-fine',
    line: `Month 6’s end on Brix’s phone: “Lena was fined ${FINE} for sabotage; half to Brix”, and Brix’s own restitution, +${TO_VICTIM}. Switch to Lena: the fine she paid.`,
  },
  {
    id: 's4-dark', step: 4, label: 'Unguarded: the power goes out', seat: 'brix', world: () => dark(), tv: 'planning', tvWanted: 'production-dark',
    line: 'Month 7: nobody guards Brix’s plot. The cut works and nobody sees: the plot goes dark, “someone” did it. Brix’s and Kai’s phones each get a line; Lena’s says nobody saw.',
  },
  {
    id: 's4-investigate', step: 4, label: 'Kai investigates', seat: 'kai', world: () => month8(true), start: { tab: 'politics', sub: 'sheriff' }, tv: 'planning',
    line: 'Month 8. An unsolved case: Investigate (one a month). This table’s draw solves it; the next beat shows a cold trail.',
  },
  {
    id: 's4-solved', step: 4, label: 'Solved: it was Lena', seat: 'kai', world: () => ({ ...month8(true), investigation: { order: 'sab-7lexp', solved: true }, sabotage: { orders: month8(true).sabotage!.orders.map((o) => (o.id === 'sab-7lexp' ? { ...o, investigated: true, solved: true } : o)) }, rep: { ...month8(true).rep, lena: (month8(true).rep.lena ?? 50) + CAUGHT_MOVE } }), start: { tab: 'politics', sub: 'sheriff' }, tv: 'planning', tvWanted: 'investigation',
    line: 'Solved by the Sheriff: it was Lena. The TV says it as a moment; the case is Kai’s to fine.',
  },
  {
    id: 's4-cold', step: 4, label: 'The trail went cold', seat: 'kai', world: () => ({ ...month8(false), investigation: { order: 'sab-7lexp', solved: false }, sabotage: { orders: month8(false).sabotage!.orders.map((o) => (o.id === 'sab-7lexp' ? { ...o, investigated: true } : o)) } }), start: { tab: 'politics', sub: 'sheriff' }, tv: 'planning', tvWanted: 'investigation',
    line: 'The other draw: the trail went cold. A cold case cannot be reopened and wears no chip; the desk says the month’s investigation is used.',
  },
];

export const sheriffBeatOf = (id: string | null): Beat => SHERIFF_BEATS.find((b) => b.id === id) ?? SHERIFF_BEATS[0]!;
