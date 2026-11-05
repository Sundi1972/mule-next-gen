/** The colony as every screen sees it: gauges, fund, prestige objects and plaques. Public, so one view serves all. */
import { colonyGauges, commissionRefusal, lastGauges, moodBand, PRESTIGE, type GameState, type PrestigeId } from '@mule/engine';
import type { ColonyCatalogueView, ColonyProjectView, ColonyView } from '@mule/protocol';

const IDS = Object.keys(PRESTIGE) as PrestigeId[];

/** The colony view; null when the game plays without politics. */
export function colonyView(state: GameState): ColonyView | null {
  const colony = state.colony;
  if (!colony) return null;
  const now = colonyGauges(state);
  const last = lastGauges(state);
  const ledger = [...state.history].reverse().find((r) => r.ledger)?.ledger ?? null;
  return {
    gauges: { wealth: now.wealth, environment: state.air, prestige: now.prestige, happiness: now.happiness, band: now.happiness === null ? null : moodBand(now.happiness) },
    lastGauges: last && { wealth: last.wealth, prestige: last.prestige, happiness: last.happiness },
    fund: state.treasury.money,
    ledger: ledger && structuredClone(ledger),
    projects: colony.projects.map((p): ColonyProjectView => {
      const row = PRESTIGE[p.id];
      return {
        id: p.id,
        name: row.name,
        stage: p.stage,
        cost: { credits: row.credits, goods: { ...row.goods } },
        funded: { credits: p.funded.credits, goods: { ...p.funded.goods } },
        buildMonths: row.buildMonths,
        monthsLeft: p.monthsLeft,
        plot: p.plot,
        prestige: row.prestige,
        upkeep: row.upkeep,
        repairCost: p.stage === 'damaged' ? row.repairCost : null,
        plaque: Object.entries(p.plaque)
          .map(([playerId, value]) => ({ playerId, value }))
          .sort((a, b) => b.value - a.value),
      };
    }),
    catalogue: IDS.map((id): ColonyCatalogueView => {
      const row = PRESTIGE[id];
      const why = commissionRefusal(state, id);
      return { id, name: row.name, credits: row.credits, goods: { ...row.goods }, buildMonths: row.buildMonths, needsPlot: row.needsPlot, prestige: row.prestige, upkeep: row.upkeep, commissionable: why === null, why };
    }),
    strike: colony.strike && colony.strike.month === state.month ? { good: colony.strike.good, cost: colony.strike.cost, paid: colony.strike.paid } : null,
    score: null,
  };
}

