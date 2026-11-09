/**
 * Steps shared by the e2e scripts on a table that plays politics. Scripts import these; only scripts run.
 */
import { ceremonyBeats, GAME, POLITICS, type ElectionResult, type GameState, type Outfit } from '@mule/engine';
import { errors as playwrightErrors, type Locator, type Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { check } from './harness';

/** How long a press may take to land. */
export const PRESS_MS = 2_000;

/** The most votes a voter can carry in month 1, from POLITICS.weight; its election comes before any land is owned. */
const { base, repVotes, baronVotes, taxCap } = POLITICS.weight;
const MONTH_1_MAX_WEIGHT = base + repVotes + baronVotes + taxCap;

/**
 * The longest month 1's election runs, in game ms, when every phone is Ready as each stage opens: an AI seat's
 * longest pause in announce and again in the ballot, then the longest ceremony a full table can have: every seat
 * running for every office, every voter at a weight no month 1 voter reaches, and every office tied.
 */
export const ELECTION_WAIT_MS = (() => {
  const seats = Array.from({ length: GAME.maxPlayers }, (_, i) => `s${i}`);
  // One voter per seat, each at that weight, split evenly: every block the office can show, and a tie.
  const race = { winner: seats[0]!, how: 'lot' as const, tallies: seats.map((id) => ({ id, votes: MONTH_1_MAX_WEIGHT })) };
  const result: ElectionResult = Object.fromEntries(POLITICS.offices.map((office) => [office, race]));
  return 2 * POLITICS.ai.actMs[1] + ceremonyBeats(seats, result).total;
})();

/**
 * Month 1's "I'm ready" on a table that plays politics: presses Ready to vote in announce, abstains and presses Cast
 * my vote in the ballot, then I'm ready once the ceremony is over, until the phone leaves planning. Used by smoke.ts
 * and zoom.ts, whose phones only want to get to the land grant.
 */
export async function readyThroughTheElection(phone: Page, timeout: number): Promise<void> {
  const left = phone.locator('[data-phase]:not([data-phase=planning])');
  await pressUntil(phone, left, async () => (await left.count()) > 0, timeout);
}

/**
 * Month 1's election, pressed through as readyThroughTheElection does, stopping once planning proper shows its desks:
 * for a script that does something in planning (at the Talk desk, say) before it is ready.
 */
export async function voteThroughTheElection(phone: Page, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  const desks = phone.locator('[data-phase=planning] [data-testid=tabs]');
  // The tabs are drawn through the whole election now (SB-3): it is over once the ready bar stops asking for a vote.
  // Stop pressing once the reveal starts: I'm ready during it would end planning as the ceremony does.
  const reveal = phone.locator('[data-testid=phone-reveal-tv], [data-testid=phone-reveal-solo]');
  await pressUntil(phone, reveal, async () => (await reveal.count()) > 0 || ((await desks.count()) > 0 && !(await asksForTheVote(phone))), timeout);
  await desks.waitFor({ timeout: Math.max(1, deadline - Date.now()) });
  // The steps after the election read Overview's map and tools: back to Overview from the Elections sub-tab.
  await phone.getByTestId('tab-overview').click({ timeout: PRESS_MS });
}

/**
 * Whether the ready bar holds a button that still asks for a vote: Ready to vote, or Cast my vote. Once the player has
 * pressed, the bar swaps the button for its done words (you-are-ready), so this is false and openElections leaves the
 * phone where it is.
 */
async function asksForTheVote(phone: Page): Promise<boolean> {
  const words = await phone.getByTestId('ready').first().textContent({ timeout: 200 }).catch(() => '');
  return /Ready to vote|Cast my vote/.test(words ?? '');
}

/** The announce and the ballot are the Elections sub-tab's (SB-3): opens it, unless it is open or the stage holds the screen. */
async function openElections(phone: Page): Promise<void> {
  if ((await phone.locator('[data-phase=planning] [data-testid=tabs]').count()) === 0) return;
  // Only while the ready bar still asks for the vote: once the election is over the phone stays where it is.
  if (!(await asksForTheVote(phone))) return;
  try {
    // Already on Elections (the result stays up after the ballot closes)? Stay: the check below still has to run.
    if ((await phone.getByTestId('sub-elections').getAttribute('aria-selected', { timeout: 200 }).catch(() => null)) !== 'true') {
      await phone.getByTestId('tab-politics').click({ timeout: PRESS_MS });
      await phone.getByTestId('sub-elections').click({ timeout: PRESS_MS });
    }
    // "Cast my vote" with no election ballot on screen is a vote of another kind (a tax overrule a computer seat called is
    // held as planning ends): it is Laws', where answering No lets the bar's Cast go live.
    if ((await phone.getByTestId('ballot-card').count()) === 0 && /Cast my vote/.test((await phone.getByTestId('ready').first().textContent({ timeout: 200 }).catch(() => '')) ?? '')) {
      await phone.getByTestId('sub-laws').click({ timeout: PRESS_MS });
      const no = phone.getByTestId('overrule-no');
      if ((await no.count()) > 0) {
        await no.click({ timeout: PRESS_MS });
        console.log('election steps: answered a held tax overrule with No so the ready bar goes live');
      }
    }
  } catch (err) {
    if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
  }
}

/** Presses through the election until `over` shows. */
async function pressUntil(phone: Page, over: Locator, isOver: () => Promise<boolean>, timeout: number): Promise<void> {
  const ready = phone.locator('[data-phase=planning] [data-testid=ready]:not([disabled])');
  // Cast my vote waits for a pick on every ballot paper.
  const abstain = phone.locator('[data-testid=ballot-card] [data-testid$="-abstain"] input:not(:checked)');
  const deadline = Date.now() + timeout;
  for (;;) {
    await openElections(phone);
    await ready.or(abstain).or(over).first().waitFor({ timeout: Math.max(1, deadline - Date.now()) });
    await openElections(phone);
    if (await isOver()) return;
    try {
      for (const box of await abstain.all()) await box.check({ timeout: PRESS_MS });
      await ready.click({ timeout: PRESS_MS });
      // Done keeps the button enabled for the next stage; Ready after the election disables it.
      await ready.waitFor({ state: 'hidden', timeout: PRESS_MS / 4 });
    } catch (err) {
      if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    }
  }
}

/**
 * Month 1's development with walking on: each phone's first MULE goes on its first plot through the server, as
 * installing leaves it. Month 1's clock waits for every first MULE, so this lets it start and run out the turn. For a
 * test whose promise is not the errand: walking the errand is store-steps.ts's B-AC-1, at the speed steering needs.
 */
export function firstMulesThroughTheServer(server: MuleServer, code: string, mules: readonly { seat: string; outfit: Outfit }[]): void {
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  const state = (room as unknown as { game: { state: GameState } }).game.state;
  check(state.phase === 'development', `first MULEs go in during development, not in ${state.phase}`);
  for (const { seat, outfit } of mules) {
    const plot = state.tiles.find((t) => t.owner === seat && t.terrain !== 'store' && t.outfit === null);
    check(plot, `${seat} owns an empty plot in month 1's development`);
    plot.outfit = outfit;
    state.players.find((p) => p.id === seat)!.installedThisTurn = true;
  }
  // Changed behind the game's back: the room's broadcast is the one way every screen sees it.
  (room as unknown as { broadcast(): void }).broadcast();
}
