// Measurement only (m24): tax-led colony funding. Base: GD + AI commissions at 25% of credits (scratch engine/ai), and
// at runtime E-free, needsPlot=false, COLONY.maxOpen 2, COLONY.grant.perMonth 450. Variant M24_VAR: T0 as is; T1
// POLITICS.ai.taxTarget 10 for every persona; T2 (needs M24_T2=1 for the scratch vote.ts); T3 TAX.salesTax 0.08;
// COMBO = T2 + T3. Same 10 games: playGame(seed, simSeats(4,'trader',seed,null), {politics:true}). argv: <wt> <out.json>
const W = process.argv[2]!;
const V = process.env.M24_VAR!;
const { playGame } = await import(`${W}/packages/ai/src/play.ts`);
const { simSeats } = await import(`${W}/packages/ai/src/lineup.ts`);
const E = (await import(`${W}/packages/engine/src/index.ts`)) as any;
const CFG = (await import(`${W}/packages/engine/src/config.ts`)) as any;
const { M24_T2 } = (await import(`${W}/packages/engine/src/m24.ts`)) as any;
const { PRESTIGE, COLONY, POLITICS, TAX, HAPPINESS, moodBand, PERCENT } = E;
if (CFG.PRESTIGE !== PRESTIGE || CFG.POLITICS !== POLITICS || CFG.TAX !== TAX) throw new Error('config instances differ');
if (M24_T2 !== (V === 'T2' || V === 'COMBO' || V.includes('T2'))) throw new Error('M24_T2 env does not match the variant');
for (const row of Object.values(PRESTIGE) as any[]) { row.needsPlot = false; delete row.goods.electronics; }
COLONY.maxOpen = Number(process.env.M24_MAXOPEN ?? 2); // M24_MAXOPEN: m24 addendum
COLONY.grant.perMonth = Number(process.env.M24_GRANT ?? 450); // M24_GRANT: probe only
if (V === 'T1') for (const k of Object.keys(POLITICS.ai.taxTarget)) POLITICS.ai.taxTarget[k] = Math.min(10, POLITICS.tax.max);
if (V === 'T3' || V === 'COMBO') TAX.salesTax = 0.08;
// Extra probes: M24_TARGET (every persona's taxTarget), M24_START (start rate in percent).
if (process.env.M24_TARGET) for (const k of Object.keys(POLITICS.ai.taxTarget)) POLITICS.ai.taxTarget[k] = Number(process.env.M24_TARGET);
if (process.env.M24_START) TAX.salesTax = Number(process.env.M24_START) / 100;
const TAXES = ['salesTax', 'exportTax', 'landTax', 'pollutionTax', 'federationTax'];
const games: any[] = [];
for (let seed = 1; seed <= 10; seed++) {
  const months: any[] = [];
  const seen = new Set<number>();
  const up = (s: any) => {
    if (seen.has(s.month)) return;
    seen.add(s.month);
    const tax = Math.round(s.treasury.salesTax * PERCENT);
    months.push({ month: s.month, tax, moodCost: HAPPINESS.weights.tax * Math.max(0, tax - HAPPINESS.weights.taxFree), band: moodBand(s.colony.happiness), happiness: s.colony.happiness, governor: s.politics?.governor ?? null });
  };
  const st = playGame(seed, simSeats(4, 'trader', seed, null), { politics: true, onPhase: (s: any) => { if (s.phase === 'upkeep') up(s); } }).state;
  if (st.phase === 'gameOver') up(st);
  const inc: Record<string, number> = {};
  for (const rep of st.history) for (const [k, v] of Object.entries(rep.ledger?.in ?? {}) as [string, number][]) inc[k] = (inc[k] ?? 0) + v;
  const split = { tax: 0, grant: inc.grant ?? 0, donation: inc.donation ?? 0, other: 0 };
  for (const [k, v] of Object.entries(inc)) if (TAXES.includes(k)) split.tax += v; else if (k !== 'grant' && k !== 'donation') split.other += v;
  games.push({ seed, income: inc, split, taxBeatsGrant: split.tax > split.grant, taxLargest: split.tax > Math.max(split.grant, split.donation, split.other),
    standing: st.colony.projects.filter((p: any) => p.stage === 'standing').length, cash: st.players.reduce((a: number, p: any) => a + p.money, 0),
    moodCostMean: months.reduce((a, m) => a + m.moodCost, 0) / months.length, taxRange: [Math.min(...months.map((m) => m.tax)), Math.max(...months.map((m) => m.tax))], months });
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`VARIANT ${V} target ${JSON.stringify(POLITICS.ai.taxTarget)} start ${TAX.salesTax} grant ${COLONY.grant.perMonth} maxOpen ${COLONY.maxOpen}`);
for (const g of games) console.log(`G${g.seed}: tax ${g.split.tax} grant ${g.split.grant} don ${g.split.donation} other ${g.split.other} | tax>grant ${g.taxBeatsGrant} largest ${g.taxLargest} | standing ${g.standing} | cash ${g.cash} | moodCost ${g.moodCostMean.toFixed(2)} | tax ${g.taxRange[0]}..${g.taxRange[1]}% | sales ${g.income.salesTax ?? 0}`);
const bands: Record<string, number> = {};
for (const g of games) for (const m of g.months) bands[m.band] = (bands[m.band] ?? 0) + 1;
console.log(`MEAN tax ${Math.round(mean(games.map((g) => g.split.tax)))} grant ${Math.round(mean(games.map((g) => g.split.grant)))} don ${Math.round(mean(games.map((g) => g.split.donation)))} other ${Math.round(mean(games.map((g) => g.split.other)))} | tax>grant ${games.filter((g) => g.taxBeatsGrant).length}/10 largest ${games.filter((g) => g.taxLargest).length}/10 | standing ${mean(games.map((g) => g.standing)).toFixed(1)} [${games.map((g) => g.standing).join(' ')}] | cash ${Math.round(mean(games.map((g) => g.cash)))} | moodCost ${mean(games.map((g) => g.moodCostMean)).toFixed(2)} | bands ${JSON.stringify(bands)}`);
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[3]!, JSON.stringify({ variant: V, games }, null, 0));
