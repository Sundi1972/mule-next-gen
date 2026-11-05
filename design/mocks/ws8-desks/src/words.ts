import { POLITICS, type LawId, type LawProposal } from '@mule/engine';
import type { PoliticsView } from '@mule/protocol';
import { AIR, FACTS, PLAYERS } from './fixture';

/*
 * GRAFT: apps/web/src/phone/hub/politics/words.ts (WS7) — the law words every screen shares. LAW_NAME is the
 * engine's (politics.ts); the meanings and units are new copy.
 */

export const LAW_IDS = Object.keys(POLITICS.laws) as LawId[];
export const LAW_NAME: Record<LawId, string> = { exportTax: 'Export tax', landTax: 'Land tax', pollutionTax: 'Pollution tax', emissionCap: 'Emission cap' };

/** One setting, with its unit: "10 cr a plot", "20%", "air 50". */
export function settingWords(law: LawId, s: number): string {
  switch (law) {
    case 'exportTax':
      return `${s}%`;
    case 'landTax':
      return `${s} cr a plot`;
    case 'pollutionTax':
      return `${s} cr per air point`;
    case 'emissionCap':
      return `air ${s}`;
  }
}

/** The chip's short label: the number and the least of its unit. */
export const chipWords = (law: LawId, s: number) => (law === 'exportTax' ? `${s}%` : law === 'emissionCap' ? `air ${s}` : `${s} cr`);

/** What the law does, in plain words, at no particular setting. */
export const LAW_MEANING: Record<LawId, string> = {
  exportTax: 'A share of every unit a player sells to the export ship goes to the colony fund.',
  landTax: 'Every player pays for each plot they own, at each month end, into the fund.',
  pollutionTax: 'Each player pays for the air their plots fouled that month, at its end.',
  emissionCap: 'No new Rare earth mine or smelter while the air is above the cap.',
};

/** "Land tax 10 cr a plot", "Repeal the Export tax". */
export function proposalWords(p: LawProposal): string {
  if (p.kind === 'repeal') return `Repeal the ${LAW_NAME[p.law]}`;
  return `${LAW_NAME[p.law]} ${settingWords(p.law, p.setting)}${p.replaces ? `, in place of the ${LAW_NAME[p.replaces]}` : ''}`;
}

/** A law in force on its chip: "Land tax 10 cr · since month 3". */
export const inForceWords = (law: LawId, l: { setting: number; since: number }) => `${LAW_NAME[law]} ${chipWords(law, l.setting)} · since month ${l.since}`;

export interface Impact {
  cost: number;
  capped?: { blocksNow: boolean; plots: number };
}

/** RULE-45, from the fixture's public facts, as the engine's lawImpact computes it. A repeal saves the law in force's cost. */
export function impactOf(p: LawProposal, laws: NonNullable<PoliticsView['laws']>): Record<string, Impact> {
  const enact = (law: LawId, s: number, id: string): Impact => {
    const f = FACTS[id]!;
    switch (law) {
      case 'landTax':
        return { cost: s * (PLAYERS.find((q) => q.id === id)?.plots ?? 0) };
      case 'pollutionTax':
        return { cost: Math.round(s * f.pollutionBy) };
      case 'exportTax':
        return { cost: Math.round((s * f.shipWorth) / 100) };
      case 'emissionCap': {
        const blocksNow = AIR > s;
        return { cost: blocksNow ? f.cappedPlots * 60 : 0, capped: { blocksNow, plots: f.cappedPlots } };
      }
    }
  };
  return Object.fromEntries(
    PLAYERS.map(({ id }) => {
      if (p.kind === 'enact') return [id, enact(p.law, p.setting, id)];
      const inForce = laws[p.law];
      const i = inForce ? enact(p.law, inForce.setting, id) : { cost: 0 };
      return [id, { ...i, cost: -i.cost }];
    }),
  );
}

/** "For you: …" — what a proposal would cost or save this player a month, in words. */
export function forYouWords(p: LawProposal, i: Impact | undefined): string {
  if (!i) return 'nothing';
  if (p.law === 'emissionCap' && i.capped) {
    const { blocksNow, plots } = i.capped;
    if (p.kind === 'repeal') return plots === 0 ? 'nothing of yours is capped' : `your ${plots} capped plot${plots === 1 ? '' : 's'} could be outfitted again`;
    if (plots === 0) return 'it stops none of your plots';
    return blocksNow ? `it stops new mines on your ${plots} plot${plots === 1 ? '' : 's'} now (air ${AIR})` : `it stops nothing now (air ${AIR}); your ${plots} plot${plots === 1 ? '' : 's'} later`;
  }
  if (i.cost === 0) return 'nothing';
  const per = p.law === 'exportTax' ? ', if you sell to the ship' : ' a month';
  return i.cost > 0 ? `about ${i.cost} cr${per}` : `you save about ${-i.cost} cr${per}`;
}

/** The short figure in the preview list: "−70 cr", "+40 cr", "stops 2 plots", "·". */
export function costChip(p: LawProposal, i: Impact | undefined): { text: string; tone: 'cost' | 'save' | 'none' } {
  if (!i) return { text: '·', tone: 'none' };
  if (p.law === 'emissionCap' && i.capped) {
    if (i.capped.plots === 0) return { text: 'none of theirs', tone: 'none' };
    return { text: `${p.kind === 'repeal' ? 'frees' : 'stops'} ${i.capped.plots} plot${i.capped.plots === 1 ? '' : 's'}${i.capped.blocksNow ? ' now' : ' later'}`, tone: p.kind === 'repeal' ? 'save' : i.capped.blocksNow ? 'cost' : 'none' };
  }
  if (i.cost === 0) return { text: 'nothing', tone: 'none' };
  return i.cost > 0 ? { text: `${i.cost} cr a month`, tone: 'cost' } : { text: `saves ${-i.cost} cr`, tone: 'save' };
}

/** RULE-41 row 4, the engine's words, for a law waiting to come back. */
export function retryWords(failedIn: number): string {
  return `That proposal failed in month ${failedIn}; it can come back in month ${failedIn + POLITICS.council.retryMonths + 1}`;
}

/** The dimmed row's own short line: "Failed in month 3; can come back in month 6". */
export function retryShort(failedIn: number): string {
  return `Failed in month ${failedIn}; can come back in month ${failedIn + POLITICS.council.retryMonths + 1}`;
}

/** RULE-41 row 12, as the engine words it (politics.ts says `${maxInForce} laws are in force…`; the spec spells "Three"). */
export const REPLACES_WORDS = `${POLITICS.council.maxInForce} laws are in force: pick the one this replaces`;
