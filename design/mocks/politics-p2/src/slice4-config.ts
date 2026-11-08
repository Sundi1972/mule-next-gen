import { LAW_NAME, POLITICS } from '@mule/engine';

/**
 * MOCK PLUMBING, loaded before App (main.tsx): the slice-4 config the screens need, which trunk does not have yet.
 *  - The Sheriff as an elected office: POLITICS.offices gains 'sheriff' (WS7's branch still has ['governor']; the
 *    screen PR flips it), so the real election day draws its second column.
 *  - The sabotage ban as WS7's branch defines it (config.ts::POLITICS.laws.sabotageBan, settings ×2 and ×3).
 */
const offices = POLITICS.offices as string[];
if (!offices.includes('sheriff')) offices.push('sheriff');
(POLITICS.laws as Record<string, { settings: number[] }>).sabotageBan ??= { settings: [2, 3] };
(LAW_NAME as Record<string, string>).sabotageBan ??= 'Sabotage ban';
