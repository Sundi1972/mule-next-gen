/**
 * The colony as the screens read it (G-5 C34): WS7's §3 draft of ColonyView (ws7-g5-spec a0678be1), with WS8's
 * proposed additions marked PROPOSAL. Wave 1's design gate freezes it. Every number below is a fixture, not a balance
 * value: the objects are WS1's placeholders (C21's table) and the score's terms are fixtures until RULE-25 (C31, WS3).
 */

export type MoodBand = 'thriving' | 'content' | 'restless' | 'unhappy' | 'unrest';
export type PrestigeId = 'park' | 'hospital' | 'observatory' | 'stadium' | 'spaceport';
export type Stage = 'commissioned' | 'building' | 'standing' | 'closed' | 'damaged';
export type ProjectGood = 'alloy' | 'electronics' | 'crystite';
type Goods = Partial<Record<ProjectGood, number>>;

export interface ProjectView {
  id: PrestigeId;
  name: string;
  stage: Stage;
  cost: { credits: number; goods: Goods };
  funded: { credits: number; goods: Goods };
  /** Building only. */
  monthsLeft: number | null;
  /** Tile index, for objects that need one. */
  plot: number | null;
  prestige: number;
  upkeep: number;
  /** Damaged only. */
  repairCost: number | null;
  /** Donors, largest first. */
  plaque: { playerId: string; credits: number; goods: number }[];
  /** PROPOSAL (WS8): the build length, for the build pips and "stands at month N"; the catalogue has it, the project not. */
  buildMonths: number;
}

export interface CatalogueEntry {
  id: PrestigeId;
  name: string;
  credits: number;
  goods: Goods;
  buildMonths: number;
  needsPlot: boolean;
  prestige: number;
  upkeep: number;
  commissionable: boolean;
  why: string | null;
}

export interface ColonyView {
  gauges: { wealth: number; environment: number; prestige: number; happiness: number; band: MoodBand };
  /** PROPOSAL (WS8): last month's gauges, for the TV's "↑ 6 since last month"; null in month 1. */
  lastGauges: { wealth: number; prestige: number; happiness: number } | null;
  fund: number;
  ledger: { month: number; in: Record<string, number>; out: Record<string, number> } | null;
  projects: ProjectView[];
  catalogue: CatalogueEntry[];
  score: { wealth: number; environment: number; prestige: number; factor: number; total: number } | null;
}

export type ColonyScore = NonNullable<ColonyView['score']>;

/** Each object's look and its one-line perk, as the screens word it. Perk words are WS8's until C26 lands. */
export const OBJECT: Record<PrestigeId, { name: string; perk: string }> = {
  park: { name: 'Park', perk: 'Calms the colony in a riot' },
  hospital: { name: 'Hospital', perk: 'Softens an epidemic' },
  observatory: { name: 'Observatory', perk: 'Prestige only' },
  stadium: { name: 'Stadium', perk: 'Festivals come more often' },
  spaceport: { name: 'Spaceport upgrade', perk: 'Prestige only' },
};

/** C23's five bands at WS7's placeholder ranges. */
export const MOOD: Record<MoodBand, { label: string; tone: string; bar: string; from: number }> = {
  unrest: { label: 'Unrest', tone: 'text-alert', bar: 'bg-alert', from: 0 },
  unhappy: { label: 'Unhappy', tone: 'text-alert', bar: 'bg-alert', from: 20 },
  restless: { label: 'Restless', tone: 'text-warn', bar: 'bg-warn', from: 40 },
  content: { label: 'Content', tone: 'text-ok', bar: 'bg-ok', from: 60 },
  thriving: { label: 'Thriving', tone: 'text-ok', bar: 'bg-ok', from: 80 },
};

export const GOOD_ORDER: ProjectGood[] = ['alloy', 'electronics', 'crystite'];

/** C21's placeholder table: credits, build months, plot, prestige; upkeep 5% of the cost. */
const TABLE: Record<PrestigeId, { credits: number; goods: Goods; buildMonths: number; needsPlot: boolean; prestige: number }> = {
  park: { credits: 600, goods: { alloy: 2 }, buildMonths: 1, needsPlot: true, prestige: 2 },
  hospital: { credits: 900, goods: { alloy: 2, electronics: 1 }, buildMonths: 2, needsPlot: false, prestige: 3 },
  observatory: { credits: 1_000, goods: { electronics: 2, crystite: 1 }, buildMonths: 2, needsPlot: false, prestige: 3 },
  stadium: { credits: 1_400, goods: { alloy: 4, electronics: 2 }, buildMonths: 3, needsPlot: true, prestige: 4 },
  spaceport: { credits: 2_000, goods: { alloy: 4, electronics: 3, crystite: 2 }, buildMonths: 3, needsPlot: true, prestige: 5 },
};

function project(id: PrestigeId, stage: Stage, over: Partial<ProjectView> = {}): ProjectView {
  const t = TABLE[id];
  const done = stage !== 'commissioned';
  return {
    id,
    name: OBJECT[id].name,
    stage,
    cost: { credits: t.credits, goods: t.goods },
    funded: done ? { credits: t.credits, goods: t.goods } : { credits: 0, goods: {} },
    monthsLeft: stage === 'building' ? t.buildMonths : null,
    plot: t.needsPlot ? 41 : null,
    prestige: t.prestige,
    upkeep: Math.round(t.credits * 0.05),
    repairCost: stage === 'damaged' ? Math.round(t.credits * 0.25) : null,
    plaque: [],
    buildMonths: t.buildMonths,
    ...over,
  };
}

function catalogue(fund: number, taken: PrestigeId[]): CatalogueEntry[] {
  return (Object.keys(TABLE) as PrestigeId[]).map((id) => {
    const t = TABLE[id];
    const why = taken.includes(id) ? 'Already built' : t.needsPlot && id === 'spaceport' ? 'No free plot: the colony bids at the land auction' : null;
    return { id, name: OBJECT[id].name, credits: t.credits, goods: t.goods, buildMonths: t.buildMonths, needsPlot: t.needsPlot, prestige: t.prestige, upkeep: Math.round(t.credits * 0.05), commissionable: why === null, why };
  });
}

const PARK = project('park', 'standing', { plaque: [{ playerId: 's2', credits: 150, goods: 2 }, { playerId: 's3', credits: 50, goods: 0 }] });
const HOSPITAL = project('hospital', 'building', { monthsLeft: 1, plaque: [{ playerId: 's1', credits: 200, goods: 1 }] });
const STADIUM = project('stadium', 'commissioned', {
  funded: { credits: 860, goods: { alloy: 4, electronics: 1 } },
  plaque: [{ playerId: 's2', credits: 300, goods: 1 }, { playerId: 's4', credits: 120, goods: 0 }, { playerId: 's3', credits: 40, goods: 0 }],
});

/** Month 7's month end: one standing, one building, one collecting. */
export const MIDGAME: ColonyView = {
  gauges: { wealth: 26_400, environment: 34, prestige: 2, happiness: 64, band: 'content' },
  lastGauges: { wealth: 24_900, prestige: 2, happiness: 58 },
  fund: 2_340,
  ledger: { month: 7, in: { salesTax: 210, landTax: 140, exportTax: 60, grant: 150, donations: 460 }, out: { offices: 120, upkeep: 30, projects: 680 } },
  projects: [STADIUM, HOSPITAL, PARK],
  catalogue: catalogue(2_340, ['park', 'hospital', 'stadium']),
  score: null,
};

/** The fund ran dry and the park closed; a riot damaged the hospital. Both count 0 (HC-23, HC-24). */
export const TROUBLE: ColonyView = {
  gauges: { wealth: 19_800, environment: 52, prestige: 0, happiness: 31, band: 'unhappy' },
  lastGauges: { wealth: 21_000, prestige: 5, happiness: 44 },
  fund: 0,
  ledger: { month: 9, in: { salesTax: 90 }, out: { offices: 120 } },
  projects: [project('hospital', 'damaged', { plaque: HOSPITAL.plaque }), project('park', 'closed', { plaque: PARK.plaque })],
  catalogue: catalogue(0, ['park', 'hospital']),
  score: null,
};

/** Month 1: nothing commissioned yet. */
export const EMPTY: ColonyView = {
  gauges: { wealth: 18_000, environment: 12, prestige: 0, happiness: 60, band: 'content' },
  lastGauges: null,
  fund: 0,
  ledger: null,
  projects: [],
  catalogue: catalogue(0, []),
  score: null,
};

/** Game over: four objects stand, a festival's +2 on top (HC-23), the colony is Content. */
export const FINAL: ColonyView = {
  gauges: { wealth: 31_200, environment: 38, prestige: 14, happiness: 71, band: 'content' },
  lastGauges: { wealth: 30_100, prestige: 14, happiness: 68 },
  fund: 3_120,
  ledger: { month: 12, in: { salesTax: 240, landTax: 160, grant: 150 }, out: { offices: 120, upkeep: 195 } },
  projects: [
    project('stadium', 'standing', { plaque: [{ playerId: 's1', credits: 400, goods: 2 }, ...STADIUM.plaque] }),
    project('observatory', 'standing', { plaque: [{ playerId: 's4', credits: 250, goods: 1 }] }),
    project('hospital', 'standing', { plaque: HOSPITAL.plaque }),
    PARK,
  ],
  catalogue: catalogue(3_120, ['park', 'hospital', 'observatory', 'stadium']),
  score: { wealth: 62, environment: 31, prestige: 14, factor: 1.08, total: 116 },
};

/** Game over for a colony run badly: Unrest pulls the score down. */
export const FINAL_UNREST: ColonyView = {
  gauges: { wealth: 15_100, environment: 71, prestige: 2, happiness: 14, band: 'unrest' },
  lastGauges: { wealth: 15_900, prestige: 5, happiness: 22 },
  fund: 140,
  ledger: { month: 12, in: { salesTax: 60 }, out: { offices: 120 } },
  projects: [project('hospital', 'damaged', { plaque: HOSPITAL.plaque }), PARK],
  catalogue: catalogue(140, ['park', 'hospital']),
  score: { wealth: 30, environment: 12, prestige: 2, factor: 0.82, total: 36 },
};

/** Game over with the air in Collapse: the colony failed (colonyVerdict), whatever its score. */
export const FINAL_FAILED: ColonyView = {
  ...FINAL_UNREST,
  gauges: { ...FINAL_UNREST.gauges, environment: 86 },
  score: { wealth: 30, environment: 3, prestige: 2, factor: 0.82, total: 29 },
};

/** Every plaque a player is on, across the projects: shown beside their standing, not added to it (WS7's RULE-25 lean). */
export function plaquesOf(colony: ColonyView, playerId: string): { project: ProjectView; credits: number; goods: number }[] {
  return colony.projects.flatMap((p) => {
    const d = p.plaque.find((x) => x.playerId === playerId);
    return d ? [{ project: p, credits: d.credits, goods: d.goods }] : [];
  });
}

/** Objects that count toward prestige now (HC-23). */
export const standingCount = (c: ColonyView) => c.projects.filter((p) => p.stage === 'standing').length;
