// Measurement only (m25): tax-led funding with cheaper buildings. Scratch engine/ai: GD (commissioned projects' missing
// goods in monthlyDemand) and the AI Governor commissioning at credits x M25_F. At runtime: needsPlot=false, E-free,
// POLITICS.ai.taxTarget 10 for every persona, COLONY.grant.perMonth = M25_GRANT, COLONY.maxOpen = M25_MAXOPEN, and every
// PRESTIGE row's credits x c (rounded), goods ceil(units x c) (min 1), upkeep x c (rounded; M25_UPKEEP=0 keeps it).
// Same 10 games: playGame(seed, simSeats(4,'trader',seed,null), {politics:true}). argv: <worktree> <out.json>
const W = process.argv[2]!;
const env = process.env;
const lever = { grant: Number(env.M25_GRANT), maxOpen: Number(env.M25_MAXOPEN), f: Number(env.M25_F), c: Number(env.M25_C), upkeep: env.M25_UPKEEP !== '0' };
const { playGame } = await import(`${W}/packages/ai/src/play.ts`);
const { simSeats } = await import(`${W}/packages/ai/src/lineup.ts`);
const E = (await import(`${W}/packages/engine/src/index.ts`)) as any;
const CFG = (await import(`${W}/packages/engine/src/config.ts`)) as any;
const { PRESTIGE, COLONY, POLITICS, HAPPINESS, moodBand, PERCENT } = E;
if (CFG.PRESTIGE !== PRESTIGE || CFG.POLITICS !== POLITICS || CFG.COLONY !== COLONY) throw new Error('config instances differ');
const before = structuredClone(PRESTIGE);
for (const row of Object.values(PRESTIGE) as any[]) {
  row.needsPlot = false;
  delete row.goods.electronics;
  row.credits = Math.round(row.credits * lever.c);
  for (const g of Object.keys(row.goods)) row.goods[g] = Math.max(1, Math.ceil(row.goods[g] * lever.c));
  if (lever.upkeep) row.upkeep = Math.round(row.upkeep * lever.c);
}
for (const k of Object.keys(POLITICS.ai.taxTarget)) POLITICS.ai.taxTarget[k] = 10;
COLONY.grant.perMonth = lever.grant;
COLONY.maxOpen = lever.maxOpen;
const TAXES = ['salesTax', 'exportTax', 'landTax', 'pollutionTax', 'federationTax'];
const games: any[] = [];
for (let seed = 1; seed <= 10; seed++) {
  const months: any[] = [];
  const seen = new Set<number>();
  const up = (s: any) => {
    if (seen.has(s.month)) return;
    seen.add(s.month);
    const tax = Math.round(s.treasury.salesTax * PERCENT);
    months.push({ month: s.month, tax, moodCost: HAPPINESS.weights.tax * Math.max(0, tax - HAPPINESS.weights.taxFree), band: moodBand(s.colony.happiness) });
  };
  const st = playGame(seed, simSeats(4, 'trader', seed, null), { politics: true, onPhase: (s: any) => { if (s.phase === 'upkeep') up(s); } }).state;
  if (st.phase === 'gameOver') up(st);
  const inc: Record<string, number> = {};
  const out: Record<string, number> = {};
  for (const rep of st.history) {
    for (const [k, v] of Object.entries(rep.ledger?.in ?? {}) as [string, number][]) inc[k] = (inc[k] ?? 0) + v;
    for (const [k, v] of Object.entries(rep.ledger?.out ?? {}) as [string, number][]) out[k] = (out[k] ?? 0) + v;
  }
  const split = { tax: 0, grant: inc.grant ?? 0, donation: inc.donation ?? 0, other: 0 };
  for (const [k, v] of Object.entries(inc)) if (TAXES.includes(k)) split.tax += v; else if (k !== 'grant' && k !== 'donation') split.other += v;
  games.push({ seed, split, out, taxLargest: split.tax > Math.max(split.grant, split.donation, split.other), standing: st.colony.projects.filter((p: any) => p.stage === 'standing').length,
    closed: st.colony.projects.filter((p: any) => p.stage === 'closed').length, cash: st.players.reduce((a: number, p: any) => a + p.money, 0), fundEnd: st.treasury.money, moodCost: months.reduce((a, m) => a + m.moodCost, 0) / months.length, months });
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const bands: Record<string, number> = {};
for (const g of games) for (const m of g.months) bands[m.band] = (bands[m.band] ?? 0) + 1;
const r = (x: number) => Math.round(x);
console.log(`grant ${lever.grant} mo ${lever.maxOpen} f ${lever.f} c ${lever.c}${lever.upkeep ? '' : ' upkeep-unscaled'} | standing ${mean(games.map((g) => g.standing)).toFixed(1)} [${games.map((g) => g.standing).join(' ')}] closed ${games.reduce((a, g) => a + g.closed, 0)} | tax ${r(mean(games.map((g) => g.split.tax)))} grant ${r(mean(games.map((g) => g.split.grant)))} don ${r(mean(games.map((g) => g.split.donation)))} | tax largest ${games.filter((g) => g.taxLargest).length}/10 | cash ${r(mean(games.map((g) => g.cash)))} | fund end ${r(mean(games.map((g) => g.fundEnd)))} | upkeep paid ${r(mean(games.map((g) => g.out.upkeep ?? 0)))} | moodCost ${mean(games.map((g) => g.moodCost)).toFixed(1)} | bands ${JSON.stringify(bands)}`);
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[3]!, JSON.stringify({ lever, prestigeBefore: before, prestigeAfter: PRESTIGE, games }, null, 0));
