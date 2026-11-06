// Measurement only (m23): pace sweep on m22's GD (needsPlot=false at runtime; commissioned projects' missing goods in
// monthlyDemand, in the scratch engine). Levers from env: M23_MAXOPEN (COLONY.maxOpen), M23_F (AI Governor commissions
// when fund >= credits x f; read by the scratch vote.ts), M23_EFREE=1 (every PRESTIGE row's Electronics need removed),
// M23_GRANT (COLONY.grant.perMonth), M23_BUILD1=1 (every buildMonths 1), M23_NOGOODS=1 (no goods at all: an upper
// bound), M23_FUNDALL=1 (scratch colony.ts funds every commissioned project, not only the first). Same 10 games: playGame(seed, simSeats(4,'trader',seed,null), {politics:true}).
// argv: <worktree> <out.json>
const W = process.argv[2]!;
const env = process.env;
const lever = { maxOpen: Number(env.M23_MAXOPEN ?? 1), f: Number(env.M23_F ?? 1), efree: env.M23_EFREE === '1', grant: env.M23_GRANT ? Number(env.M23_GRANT) : null, build1: env.M23_BUILD1 === '1', noGoods: env.M23_NOGOODS === '1', fundAll: env.M23_FUNDALL === '1' };
const { playGame } = await import(`${W}/packages/ai/src/play.ts`);
const { simSeats } = await import(`${W}/packages/ai/src/lineup.ts`);
const E = (await import(`${W}/packages/engine/src/index.ts`)) as any;
const CFG = (await import(`${W}/packages/engine/src/config.ts`)) as any;
const { M23_F } = (await import(`${W}/packages/engine/src/m23.ts`)) as any;
const { PRESTIGE, COLONY, stillNeeds } = E;
if (CFG.PRESTIGE !== PRESTIGE || CFG.COLONY !== COLONY) throw new Error('config instances differ');
if (M23_F !== lever.f) throw new Error(`engine f ${M23_F} vs ${lever.f}`);
for (const row of Object.values(PRESTIGE) as any[]) { row.needsPlot = false; if (lever.efree) delete row.goods.electronics; if (lever.noGoods) row.goods = {}; if (lever.build1) row.buildMonths = 1; }
COLONY.maxOpen = lever.maxOpen;
if (lever.grant !== null) COLONY.grant.perMonth = lever.grant;
const label = `maxOpen ${lever.maxOpen} f ${lever.f}${lever.efree ? ' E-free' : ''}${lever.grant !== null ? ' grant ' + lever.grant : ''}${lever.build1 ? ' build1' : ''}${lever.noGoods ? ' no-goods' : ''}${lever.fundAll ? ' fund-all' : ''}`;
const games: any[] = [];
for (let seed = 1; seed <= 10; seed++) {
  const st = playGame(seed, simSeats(4, 'trader', seed, null), { politics: true }).state;
  const ps = st.colony.projects;
  const income: Record<string, number> = {};
  const out: Record<string, number> = {};
  for (const rep of st.history) {
    for (const [k, v] of Object.entries(rep.ledger?.in ?? {}) as [string, number][]) income[k] = (income[k] ?? 0) + v;
    for (const [k, v] of Object.entries(rep.ledger?.out ?? {}) as [string, number][]) out[k] = (out[k] ?? 0) + v;
  }
  games.push({ seed, standing: ps.filter((p: any) => p.stage === 'standing').length, building: ps.filter((p: any) => p.stage === 'building').length,
    projects: ps.map((p: any) => ({ id: p.id, since: p.since, stage: p.stage, needs: p.stage === 'commissioned' ? stillNeeds(p) : null })),
    firstCommission: ps.length ? Math.min(...ps.map((p: any) => p.since)) : null, fundEnd: st.treasury.money, income, out });
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fc = games.map((g) => g.firstCommission).filter((x) => x !== null).sort((a, b) => a - b);
const waiting: Record<string, number> = {};
for (const g of games) for (const p of g.projects) if (p.needs) { if (p.needs.credits > 0) waiting.credits = (waiting.credits ?? 0) + 1; for (const k of Object.keys(p.needs.goods)) waiting[k] = (waiting[k] ?? 0) + 1; }
const inc: Record<string, number> = {};
for (const g of games) for (const [k, v] of Object.entries(g.income) as [string, number][]) inc[k] = (inc[k] ?? 0) + v;
const outT: Record<string, number> = {};
for (const g of games) for (const [k, v] of Object.entries(g.out) as [string, number][]) outT[k] = (outT[k] ?? 0) + v;
console.log(`${label} | standing mean ${mean(games.map((g) => g.standing)).toFixed(1)} [${games.map((g) => g.standing).join(' ')}] building-at-end ${games.reduce((a, g) => a + g.building, 0)} | first commission median m${fc[Math.floor((fc.length - 1) / 2)] ?? '-'} (${fc.length} games) | fund end mean ${Math.round(mean(games.map((g) => g.fundEnd)))} | waiting ${JSON.stringify(waiting)} | income/game ${JSON.stringify(Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, Math.round(v / 10)])))} | out/game ${JSON.stringify(Object.fromEntries(Object.entries(outT).map(([k, v]) => [k, Math.round(v / 10)])))}`);
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[3]!, JSON.stringify({ lever, games }, null, 0));
