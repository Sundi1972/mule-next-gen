/**
 * WS5 colony-health measurement: the same 10 seed-1 games as `pnpm sim -- --games 10 --seed 1` (seeds 1..10, 4
 * strategist seats at trader, rotating personas, walking on, politics on).
 *   pnpm --filter @mule/ai exec tsx <this file> <label> <base|health|healthE> <forceAir|-> <out.json>
 */
import { writeFileSync } from 'node:fs';
import { HEALTH, UPKEEP, moodBand, playerEventChance, type GameState } from '../../packages/engine/src/index.ts';
import { simSeats } from '../../packages/ai/src/lineup.ts';
import { playGameAsync } from '../../packages/ai/src/play.ts';

const [label = '?', mode = 'base', air = '-', out = '/dev/null'] = process.argv.slice(2);
HEALTH.mode = mode as typeof HEALTH.mode;
HEALTH.forceAir = air === '-' ? null : Number(air);
// Extra args KEY=VAL set HEALTH numbers (e.g. crewSickFrom=1 turns sick crews off).
for (const kv of process.argv.slice(6)) { const [k, v] = kv.split('='); (HEALTH as Record<string, unknown>)[k!] = Number(v); }

async function main() {
  const games: unknown[] = [];
  for (let seed = 1; seed <= 10; seed++) {
    const specs = simSeats(4, 'trader', seed, null, null);
    const rows = new Map<number, Record<string, unknown>>();
    const row = (m: number) => {
      let r = rows.get(m);
      if (!r) rows.set(m, (r = { month: m }));
      return r;
    };
    const played = await playGameAsync(seed, specs, {
      politics: true,
      walking: true,
      onPhase: (s: GameState) => {
        const r = row(s.month);
        if (s.phase === 'development') {
          r.playerSick = s.players.filter((p) => p.sick).length;
          r.hungrySeats = s.players.filter((p) => p.hungry).length;
          r.sickChance = s.players.map((p) => playerEventChance(s, 'sickness', 'development', p.id));
        }
        if (s.phase === 'auction') {
          // Works standing after this month's development, by seat.
          const works = (g: string) => Object.fromEntries(s.players.map((p) => [p.id, s.tiles.filter((t) => t.owner === p.id && t.outfit === g).length]));
          r.eWorks = works('electronics');
          r.mWorks = works('medicine');
          r.aWorks = works('alloy');
          r.reMines = works('rareEarth');
          r.crewCured = s.players.filter((p) => p.crewCured).length;
          r.crewSickSeats = s.players.filter((p) => (p.crewSick ?? 0) > 0).length;
          r.posted = { medicine: s.store.posted.medicine, electronics: s.store.posted.electronics, food: s.store.posted.food };
          r.playerMedicine = s.players.reduce((n, p) => n + p.stock.medicine, 0);
        }
        if (s.phase === 'upkeep') {
          r.health = s.health ? { ...s.health } : null;
          r.happiness = s.colony?.happiness ?? null;
          r.band = s.colony ? moodBand(s.colony.happiness) : null;
          r.colonists = s.colonists;
          r.storeMedicine = s.store.stock.medicine;
        }
      },
    });
    for (const h of played.state.history) {
      const r = rows.get(h.month);
      if (!r) continue;
      r.shortages = [...h.shortages];
      const sum = (g: 'medicine' | 'electronics' | 'food') => Object.values(h.produced).reduce((n, x) => n + x[g], 0);
      r.madeMedicine = sum('medicine');
      r.madeElectronics = sum('electronics');
      r.madeFood = sum('food');
      r.madeRareEarth = Object.values(h.produced).reduce((n, x) => n + x.rareEarth, 0);
      r.madeAlloy = Object.values(h.produced).reduce((n, x) => n + x.alloy, 0);
      r.eLines = h.lines.filter((l) => l.good === 'electronics').length;
      r.eRan = h.lines.filter((l) => l.good === 'electronics' && l.made > 0).length;
      r.sickLines = h.lines.filter((l) => l.parts.some((x) => x.why === 'sick')).length;
      r.sickLost = h.lines.reduce((n, l) => n + l.parts.filter((x) => x.why === 'sick').reduce((m, x) => m + x.delta, 0), 0);
    }
    // The last month's upkeep ends the game before onPhase sees it: take it from the final state.
    const last = row(played.state.month);
    if (!last.health && played.state.health) {
      last.health = { ...played.state.health };
      last.happiness = played.state.colony?.happiness ?? null;
      last.band = played.state.colony ? moodBand(played.state.colony.happiness) : null;
    }
    games.push({ seed, colonistsEnd: played.state.colonists, months: played.state.history.length, rows: [...rows.values()].sort((a, b) => (a.month as number) - (b.month as number)) });
    process.stderr.write(`${label} seed ${seed}: ${played.state.history.length} months, colonists ${played.state.colonists}, h ${played.state.health?.h.toFixed(3)}\n`);
  }
  writeFileSync(out, JSON.stringify({ label, mode, air, games }, null, 1));
  void UPKEEP;
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
