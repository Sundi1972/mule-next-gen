import type { MuleView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { hostMayContinue, planningProper, readyNowIn, stageWords } from '../src/phone/hub/ready';

/**
 * The law ballot (slice 2a C40, RULE-40) is a vote like the election: the server counts a Ready as Done with it and
 * lets the host's Continue close it, so the phone must not read it as plain planning. Without this, a table with a
 * player away stalls in the ballot: the host is never offered Continue.
 */
type Stage = 'ballot' | 'reveal' | 'over';
const withCouncil = (stage: Stage | null, phase: MuleView['phase'] = 'planning') =>
  ({ phase, politics: { election: { stage: 'over' }, council: stage === null ? null : { stage } }, clockWaitsFor: undefined }) as unknown as Pick<
    MuleView,
    'phase' | 'politics' | 'clockWaitsFor'
  >;

describe('the law ballot on the phone: a vote, not planning proper (C40, RULE-40)', () => {
  it('B-AC-40-1: while the law ballot or its reveal is open, planning proper has not begun; once it is over, it has', () => {
    expect(planningProper(withCouncil('ballot')), 'the ballot holds planning').toBe(false);
    expect(planningProper(withCouncil('reveal')), 'the reveal holds planning').toBe(false);
    expect(planningProper(withCouncil('over')), 'over: planning proper').toBe(true);
    expect(planningProper(withCouncil(null)), 'no council: planning proper').toBe(true);
  });

  it("B-AC-40-2: the host may Continue the law ballot, as the server takes it; never its reveal (\"The result is being announced\")", () => {
    expect(hostMayContinue(withCouncil('ballot'))).toBe(true);
    expect(hostMayContinue(withCouncil('reveal'))).toBe(false);
    expect(hostMayContinue(withCouncil('over'))).toBe(true);
    expect(hostMayContinue(withCouncil('ballot', 'landGrant')), 'outside planning there is no ballot to continue').toBe(false);
  });

  it('B-AC-40-3: a Ready in the open ballot is Done with the vote, so Now does not say planning is waiting for Ready', () => {
    expect(readyNowIn(withCouncil('ballot'), true, [], false)).toBeNull();
    expect(readyNowIn(withCouncil('over'), true, [], false)).not.toBeNull();
  });

  it("B-AC-40-4: the host's confirm in the law ballot says what Continue does there: the absent don't vote, not that the land grant starts", () => {
    const q = stageWords('over', 'ballot').confirm('Kai', 1);
    expect(q).toContain("Kai doesn't vote");
    expect(q).not.toContain('land grant');
    expect(stageWords('over', 'over').confirm('Kai', 1), 'once the ballot is over, planning words').toContain('land grant');
    expect(stageWords('over', null).confirm('Kai', 1)).toContain('land grant');
  });
});
