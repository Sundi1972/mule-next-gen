/**
 * Tier 3, local only: in no package.json script and not in CI. The Land Baron breaks a 2–2 Governor tie (RULE-3 row 5)
 * on real screens, so WS6 can render-gate that state: the TV's reveal (#tv-election) and both phones' result. No CI
 * value beyond the engine and server tests that already prove RULE-3 row 5 (B-AC-4).
 * Run with `pnpm --filter @mule/web build && pnpm --filter @mule/web exec tsx e2e/politics-tie.ts`; replay with `MULE_E2E_SEED=<seed>`.
 *
 * Two humans and no AI seat, so the tally is fixed: Ossa is made the Land Baron (+1 vote) and Lena is given one vote's
 * worth of tax paid (+1), so both weigh 2. Lena votes for Ossa and Ossa for Lena: 2–2, and the Baron's ballot names Lena.
 */
import { POLITICS, type GameState } from '@mule/engine';
import type { Page } from 'playwright';
import { check, held, launch, PHONE, startServer, TV } from './harness';
import { ELECTION_WAIT_MS, PRESS_MS } from './politics-steps';

const SEED = seedFrom(process.env.MULE_E2E_SEED);
// Full-length clocks: both phones end announce and the ballot themselves, so only the ceremony runs on its clocks.
const { server, base } = await startServer({ maxMonths: 1, seed: () => SEED });
const browser = await launch();
const errors: string[] = [];
try {
  const open = async (name: string, path = '/') => {
    const page = await (await browser.newContext(PHONE)).newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(`${base}${path}`);
    return page;
  };
  const lena = await open('Lena');
  await lena.getByPlaceholder('Heiko').fill('Lena');
  await lena.getByRole('button', { name: 'Start a new game' }).click();
  await lena.getByText("You're at the table").waitFor();
  const code = (await lena.getByTestId('room-code').textContent())?.trim() ?? '';
  const ossa = await open('Ossa', `/?room=${code}`);
  await ossa.getByPlaceholder('Heiko').fill('Ossa');
  await ossa.getByRole('button', { name: `Join game ${code}` }).click();
  await ossa.getByText("You're at the table").waitFor();
  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  await tv.goto(`${base}/table?room=${code}`);
  await tv.getByTestId('room-code').waitFor();
  await lena.getByRole('button', { name: 'Start game' }).click();
  const phones = [lena, ossa];
  await Promise.all(phones.map((p) => p.locator('[data-phase=planning]').getByTestId('agenda-election').waitFor({ timeout: 5_000 })));

  // The server's own truth, as in politics.ts.
  const room = () => {
    const r = server.registry.get(code);
    check(r, `room ${code} is on the server`);
    return r;
  };
  const state = () => (room() as unknown as { game: { state: GameState } }).game.state;
  const idOf = (name: string) => room().viewFor(null).seats.find((s) => s.name === name)!.id;
  const [lenaId, ossaId] = [idOf('Lena'), idOf('Ossa')];

  // Announce, with the clock held: the tie is set up through the server's state, then both run for Governor.
  await held(server, code, async () => {
    const s = state();
    // Politics is copied before every write (engine's edit()), so the setup copies it too.
    s.politics = { ...s.politics!, baron: ossaId };
    s.treasury.paid[lenaId] = POLITICS.weight.taxPerVote;
    room().broadcast();
    const weights = room().viewFor(null).game!.politics!.weights;
    const votesOf = (id: string) => weights.find((w) => w.id === id)?.votes;
    check(votesOf(lenaId) === 2 && votesOf(ossaId) === 2, `Lena and Ossa each weigh 2 votes, got ${JSON.stringify(weights)}`);
    await Promise.all(
      phones.map(async (p) => {
        await p.locator('[data-phase=planning]').getByTestId('agenda-election').click({ timeout: PRESS_MS });
        await p.getByTestId('run-governor').click({ timeout: PRESS_MS });
        await p.getByTestId('promise-hold').click({ timeout: PRESS_MS });
        await p.getByTestId('promise-run').click({ timeout: PRESS_MS });
        await p.getByTestId('running').filter({ hasText: 'You run for Governor' }).waitFor({ timeout: PRESS_MS });
      }),
    );
  });
  await Promise.all(phones.map((p) => p.getByTestId('ready').click({ timeout: PRESS_MS })));

  // The ballot: 2–2, and the Baron's (Ossa's) ballot names Lena.
  const voteFor = (p: Page, name: string) => p.locator('[data-phase=planning]').getByTestId('election').getByRole('radio', { name: new RegExp(`^${name}\\b`) }).check({ timeout: PRESS_MS * 2 });
  await Promise.all([voteFor(lena, 'Ossa'), voteFor(ossa, 'Lena')]);
  const ballots = () => state().politics!.election!.ballots;
  for (const deadline = Date.now() + PRESS_MS; ballots()[lenaId]?.governor !== ossaId || ballots()[ossaId]?.governor !== lenaId; ) {
    check(Date.now() < deadline, `the server holds Lena's ballot for Ossa and Ossa's for Lena, got ${JSON.stringify(ballots())}`);
    await new Promise((r) => setTimeout(r, 20));
  }
  // Picking is not Done (AM-21): both phones press Cast my vote, and the ballot closes.
  await Promise.all(phones.map((p) => p.getByTestId('ready').click({ timeout: PRESS_MS })));

  // The Governor's winner step, read with the clock held so it stands while every screen is read.
  await tv.getByTestId('tv-election').getByTestId('how-governor').waitFor({ timeout: ELECTION_WAIT_MS + PRESS_MS });
  await held(server, code, async () => {
    // The approved mock's words for a tie the Baron broke.
    const tieBroken = `A tie: Ossa, the Land Baron, broke it.`;
    const how = (await tv.getByTestId('how-governor').innerText()).trim();
    check(how === tieBroken, `B-AC-4: the TV says the Land Baron broke the tie, "${tieBroken}", got "${how}"`);
    const row = async (id: string) => {
      const el = tv.getByTestId(`result-governor-${id}`);
      return { votes: Number(await el.locator('[data-num]').innerText()), elected: (await el.innerText()).includes('ELECTED') };
    };
    const [l, o] = [await row(lenaId), await row(ossaId)];
    check(l.elected && l.votes === 2 && !o.elected && o.votes === 2, `B-AC-4: the TV elects Lena 2–2 over Ossa, got Lena ${JSON.stringify(l)}, Ossa ${JSON.stringify(o)}`);
    for (const [p, name] of [
      [lena, 'You'],
      [ossa, 'Lena'],
    ] as const) {
      const text = await p.getByTestId('phone-election-result').innerText({ timeout: PRESS_MS });
      const gov = /Governor\s*(.+?)\s*(\d+) votes · ([^.]+\.)/s.exec(text);
      check(gov && gov[1] === name && gov[2] === '2' && gov[3] === tieBroken, `B-AC-4: ${name === 'You' ? 'Lena' : 'Ossa'}'s phone names ${name} Governor with 2 votes, "${tieBroken}", as the TV does: "${text}"`);
    }
    const governor = state().politics!.election!.result!.governor!;
    check(governor.winner === lenaId && governor.how === 'baron', `B-AC-4: the server elects Lena by the Baron's ballot, got ${JSON.stringify(governor)}`);
    console.log(`✓ B-AC-4: 2–2, the Land Baron's ballot breaks the tie: Lena Governor with 2 votes and "${how}" on the TV and both phones; the server's how is "${governor.how}"`);
  });

  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e politics-tie: ok (room ${code}, seed ${SEED})`);
} catch (err) {
  console.error(`e2e politics-tie: FAILED (seed ${SEED})`);
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
// Rooms keep their phase timers running after the test, so the process ends here.
process.exit(0);

function seedFrom(value: string | undefined): number {
  if (value === undefined) return Math.floor(Math.random() * 2 ** 31);
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}
