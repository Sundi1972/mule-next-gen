// Measurement only (m22): m19's A (needsPlot=false at runtime) with no import, under G0 / GD (project's missing goods
// in monthlyDemand) / GR (GD + storeForSale reserve, ship surplus after it, fund buys from it). Same 10 games:
// playGame(seed, simSeats(4,'trader',seed,null), {politics:true}), seeds 1..10. argv: <worktree> <out.json>.
const W = process.argv[2]!;
const variant = process.env.M22_VARIANT!;
const { playGame } = await import(`${W}/packages/ai/src/play.ts`);
const { simSeats } = await import(`${W}/packages/ai/src/lineup.ts`);
const E = (await import(`${W}/packages/engine/src/index.ts`)) as any;
const CFG = await import(`${W}/packages/engine/src/config.ts`);
const { PRESTIGE, stillNeeds } = E;
for (const row of Object.values(PRESTIGE) as any[]) row.needsPlot = false;
if (CFG.PRESTIGE !== PRESTIGE) throw new Error('config PRESTIGE is not the instance index.ts exports');
const log: any[] = ((globalThis as any).__m22log ??= []);
const games: any[] = [];
for (let seed = 1; seed <= 10; seed++) {
  log.length = 0;
  const track: Record<string, any> = {};
  const prices: any[] = [];
  const factories: number[][] = [];
  const seen = new Set<number>();
  const up = (s: any) => {
    if (seen.has(s.month)) return;
    seen.add(s.month);
    for (const p of s.colony.projects) {
      const t = (track[p.id] ??= { id: p.id, commissioned: p.since, paid: null, building: null });
      if (t.paid === null && p.funded.credits >= PRESTIGE[p.id].credits) t.paid = s.month;
      if (t.building === null && p.stage !== 'commissioned') t.building = s.month;
    }
    prices.push({ month: s.month, alloy: s.store.posted.alloy, electronics: s.store.posted.electronics, stockA: s.store.stock.alloy, stockE: s.store.stock.electronics });
    factories.push([s.tiles.filter((t: any) => t.outfit === 'alloy').length, s.tiles.filter((t: any) => t.outfit === 'electronics').length]);
  };
  const st = playGame(seed, simSeats(4, 'trader', seed, null), { politics: true, onPhase: (s: any) => { if (s.phase === 'upkeep') up(s); } }).state;
  if (st.phase === 'gameOver') up(st);
  const produced: any = { alloy: 0, electronics: 0 };
  for (const rep of st.history) for (const pl of Object.values(rep.produced ?? {}) as any[]) { produced.alloy += pl.alloy ?? 0; produced.electronics += pl.electronics ?? 0; }
  const projects = st.colony.projects.map((p: any) => ({ ...track[p.id], stage: p.stage, waitsFor: p.stage === 'commissioned' ? stillNeeds(p) : null }));
  games.push({ variant, seed, standing: st.colony.projects.filter((p: any) => p.stage === 'standing').length, projects, fundBuys: log.filter((e) => e.kind === 'fundBuy'), ship: log.filter((e) => e.kind === 'ship'), prices, produced, factoriesMax: [Math.max(...factories.map((f) => f[0])), Math.max(...factories.map((f) => f[1]))] });
}
console.log(`VARIANT ${variant}`);
for (const g of games) {
  console.log(`G${g.seed}: standing ${g.standing} | ${g.projects.map((p: any) => `${p.id} c${p.commissioned} paid ${p.paid ?? '-'} build ${p.building ?? '-'} ${p.stage}${p.waitsFor ? ' waits ' + JSON.stringify(p.waitsFor) : ''}`).join('; ')}`);
  if (g.fundBuys.length) console.log(`    fund bought: ${g.fundBuys.map((e: any) => `m${e.month} ${e.good} ${e.units}@${e.price}`).join('; ')}`);
  const sh = g.ship.filter((e: any) => e.good === 'alloy' || e.good === 'electronics' || e.projectNeed > 0);
  if (sh.length) console.log(`    ship took: ${sh.map((e: any) => `m${e.month} ${e.good} ${e.took} (stock ${e.before}->${e.after}, project needs ${e.projectNeed})${e.intoNeed ? ' INTO-NEED' : ''}`).join('; ')}`);
  console.log(`    produced alloy ${g.produced.alloy} electronics ${g.produced.electronics}; max factories alloy ${g.factoriesMax[0]} electronics ${g.factoriesMax[1]}; posted alloy ${Math.min(...g.prices.map((p: any) => p.alloy))}..${Math.max(...g.prices.map((p: any) => p.alloy))} electronics ${Math.min(...g.prices.map((p: any) => p.electronics))}..${Math.max(...g.prices.map((p: any) => p.electronics))}`);
}
const all = games.flatMap((g) => g.projects);
const waits = all.filter((p) => p.paid !== null && p.building !== null).map((p) => p.building - p.paid).sort((a, b) => a - b);
const stillWaiting = all.filter((p) => p.stage === 'commissioned');
const byGood: Record<string, number> = {};
for (const p of stillWaiting) for (const g of Object.keys(p.waitsFor.goods)) byGood[g] = (byGood[g] ?? 0) + 1;
console.log(`TOTAL standing ${games.reduce((a, g) => a + g.standing, 0)}; waits (paid->building) [${waits.join(',')}] median ${waits.length ? waits[Math.floor((waits.length - 1) / 2)] : '-'} max ${waits.at(-1) ?? '-'}; still commissioned ${stillWaiting.length} (credits paid ${stillWaiting.filter((p) => p.paid !== null).length}), waiting on ${JSON.stringify(byGood)}`);
const fb: Record<string, { units: number; min: number; max: number }> = {};
for (const e of games.flatMap((g) => g.fundBuys)) { const f = (fb[e.good] ??= { units: 0, min: Infinity, max: 0 }); f.units += e.units; f.min = Math.min(f.min, e.price); f.max = Math.max(f.max, e.price); }
console.log(`fund bought ${JSON.stringify(fb)}`);
console.log(`produced total alloy ${games.reduce((a, g) => a + g.produced.alloy, 0)} electronics ${games.reduce((a, g) => a + g.produced.electronics, 0)}; posted alloy ${Math.min(...games.flatMap((g) => g.prices.map((p: any) => p.alloy)))}..${Math.max(...games.flatMap((g) => g.prices.map((p: any) => p.alloy)))} electronics ${Math.min(...games.flatMap((g) => g.prices.map((p: any) => p.electronics)))}..${Math.max(...games.flatMap((g) => g.prices.map((p: any) => p.electronics)))}; ship into project need ${games.flatMap((g) => g.ship).filter((e: any) => e.intoNeed).length}`);
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[3]!, JSON.stringify(games, null, 0).replace(/},{"variant"/g, '},\n{"variant"'));
