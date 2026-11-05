import type { ColonyGaugesView, ColonyProjectView, ColonyView, PlayerView } from '@mule/protocol';
import type { PrestigeId } from '@mule/engine';
import { fmt } from './derive';

/** The colony screens' words: mood and stage labels, the score's verdict, and who gave what. */

export type ColonyScore = NonNullable<ColonyView['score']>;
export type MoodBand = NonNullable<ColonyGaugesView['band']>;
export type Stage = ColonyProjectView['stage'];

export const MOOD: Record<MoodBand, { label: string; tone: string; bar: string }> = {
  unrest: { label: 'Unrest', tone: 'text-alert', bar: 'bg-alert' },
  unhappy: { label: 'Unhappy', tone: 'text-alert', bar: 'bg-alert' },
  restless: { label: 'Restless', tone: 'text-warn', bar: 'bg-warn' },
  content: { label: 'Content', tone: 'text-ok', bar: 'bg-ok' },
  thriving: { label: 'Thriving', tone: 'text-ok', bar: 'bg-ok' },
};

/** The mood's label and tone; a colony with no mood yet reads "Happiness" in plain ink. */
export function moodOf(band: MoodBand | null): { label: string; tone: string } {
  return band === null ? { label: 'Happiness', tone: 'text-ink' } : MOOD[band];
}

export const PERK: Record<PrestigeId, string> = {
  park: 'Calms the colony in a riot',
  hospital: 'Softens an epidemic',
  observatory: 'Prestige only',
  stadium: 'Festivals come more often',
  spaceport: 'Prestige only',
};

export const STAGE: Record<Stage, { label: string; chip: string }> = {
  commissioned: { label: 'Collecting', chip: 'border-holo text-holo' },
  building: { label: 'Building', chip: 'border-warn text-warn' },
  standing: { label: 'Standing', chip: 'border-ok text-ok' },
  closed: { label: 'Closed', chip: 'border-alert text-alert' },
  damaged: { label: 'Damaged', chip: 'border-alert text-alert' },
};

// Placeholders until RULE-25 (C31, WS3) sets the score's scale.
export const SCORE_PROUD_FROM = 100;
export const SCORE_HELD_FROM = 50;

/** The colony's verdict on its score: one line the table can repeat. */
export function scoreVerdict(score: ColonyScore): { title: string; tone: string } {
  if (score.total >= SCORE_PROUD_FROM) return { title: 'A colony to be proud of', tone: 'text-ok' };
  if (score.total >= SCORE_HELD_FROM) return { title: 'A colony that held together', tone: 'text-ink' };
  return { title: 'A colony in ruins', tone: 'text-alert-ink' };
}

/** Objects that count toward prestige now. */
export const standingCount = (colony: ColonyView) => colony.projects.filter((p) => p.stage === 'standing').length;

/** What each part of the score was made of, for the line under the sum. */
export function scoreWords(colony: ColonyView, score: ColonyScore): string {
  const n = standingCount(colony);
  return `Wealth: everything the colony owns, ${fmt(colony.gauges.wealth)} cr · Environment: air ${colony.gauges.environment} · Prestige: ${n} standing object${n === 1 ? '' : 's'} · ${moodOf(colony.gauges.band).label}: × ${score.factor.toFixed(2)}`;
}

/** Every plaque a player is on, with what they gave to each. */
export function plaquesOf(colony: ColonyView, playerId: string): { project: ColonyProjectView; value: number }[] {
  return colony.projects.flatMap((p) => {
    const d = p.plaque.find((x) => x.playerId === playerId);
    return d ? [{ project: p, value: d.value }] : [];
  });
}

/** Each player with their plaques and their total given, largest first; ties keep seat order. */
export function plaqueBoard(colony: ColonyView, players: PlayerView[]) {
  return players
    .map((player) => {
      const plaques = plaquesOf(colony, player.id);
      return { player, plaques, given: plaques.reduce((a, b) => a + b.value, 0) };
    })
    .sort((a, b) => b.given - a.given);
}
