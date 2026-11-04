import { EVENT_SHOW } from '@mule/engine';
import type { EventView } from '@mule/protocol';
import { EventLivingMap, EventShow, EventSoloRail, EventTvLog, EventTvPhoneRail, eventSegments, type MapTile, type ShowEventView, type ShowMode, type ShowPlayer, type Slot } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

/**
 * Wave 2's stories (spec C5, the show spec's C12), at promise altitude: what the TV, a phone with a TV and a phone
 * alone show while a wave-2 event plays, rendered from events as the server sends them (monthEventView: off-map
 * events start at the store and say what they changed in `effects`; every wave-2 key plays as a headline, as
 * EVENT_SHOW weighs it). Each story is the approved gallery's (design/mocks/ws8-events), on its data-testids.
 */

const W = 9;
const H = 5;
const STORE = { x: 4, y: 2 };
const LENA = 's1';
const OSSA = 's2';
const BRIX = 's3';
const players: ShowPlayer[] = [
  { id: LENA, name: 'Lena', slot: 0 },
  { id: OSSA, name: 'Ossa', slot: 1 },
  { id: BRIX, name: 'Brix', slot: 2 },
];
/** Lena farms two plots, Ossa mines one and runs a plant; Brix owns no land. */
const OWNED: Record<string, [Slot, MapTile['good']]> = { '1,1': [0, 'food'], '2,1': [0, 'food'], '6,3': [1, 'smithore'], '7,3': [1, 'energy'] };
const tiles: MapTile[] = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  const own = OWNED[`${x},${y}`];
  if (x === STORE.x && y === STORE.y) return { x, y, terrain: 'store', owner: null };
  return own ? { x, y, terrain: 'plains', owner: own[0], good: own[1] } : { x, y, terrain: 'plains', owner: null };
});
const INTRO_MS = EVENT_SHOW.introMs;
const PLAY_MS = EVENT_SHOW.playMs.headline;

type Effect = NonNullable<EventView['effects']>[number];
/** A wave-2 event as the server sends it: at the store unless it hits a plot, a headline, its effects in fired order. */
function event(key: ShowEventView['key'], phase: ShowEventView['phase'], extra: Partial<ShowEventView> & { effects?: Effect[] } = {}): ShowEventView {
  return {
    key,
    kind: 'ledger',
    title: key,
    line: `${key} happens.`,
    sign: 'bad',
    scope: 'colony',
    origin: { ...STORE },
    hits: [],
    phase,
    weight: 'headline',
    playMs: PLAY_MS,
    ...extra,
  } as ShowEventView;
}

type Where = 'tv' | 'alone' | 'withTv';
interface Opts {
  reduced?: boolean;
  me?: string;
  map?: MapTile[];
}

/** One screen's markup at show second `t`: the TV's map and log, or a phone's map and rail (alone, or with a TV). */
function screen(events: ShowEventView[], t: number, where: Where, { reduced = false, me = LENA, map = tiles }: Opts = {}): string {
  const mode: ShowMode = where === 'alone' ? 'solo' : 'tv';
  const slot = players.find((p) => p.id === me)!.slot;
  const parts =
    where === 'tv'
      ? [createElement(EventLivingMap, { key: 'm', size: 'tv' }), createElement(EventTvLog, { key: 'l' })]
      : where === 'alone'
        ? [createElement(EventLivingMap, { key: 'm', size: 'phone', focusSlot: slot, onSkip: () => undefined }), createElement(EventSoloRail, { key: 'r', me })]
        : [createElement(EventLivingMap, { key: 'm', size: 'phone', focusSlot: slot, light: true }), createElement(EventTvPhoneRail, { key: 'r', me })];
  return renderToStaticMarkup(createElement(EventShow, { events, introMs: INTRO_MS, t, mode, reduced, width: W, height: H, tiles: map, players, children: parts }));
}

/** The first segment's beats on this screen's clock. */
const segOf = (events: ShowEventView[], where: Where) => eventSegments({ events, introMs: INTRO_MS }, 0, where === 'alone' ? 'solo' : 'tv')[0]!;
/** Every frame of the first segment's play, every 0.1 s. */
function playFrames(events: ShowEventView[], where: Where, opts: Opts = {}): string[] {
  const seg = segOf(events, where);
  const n = Math.floor((seg.settleAt - seg.playAt) / 0.1);
  return Array.from({ length: n }, (_, i) => screen(events, seg.playAt + (i + 0.5) * 0.1, where, opts));
}
/** The screen once the first segment has settled: its result. */
const result = (events: ShowEventView[], where: Where, opts: Opts = {}) => {
  const seg = segOf(events, where);
  return screen(events, seg.endAt - 0.15, where, opts);
};
const has = (html: string, testid: string) => html.includes(`data-testid="${testid}`);
/** The markup inside the element carrying this data-testid, by balancing its tag. */
function inside(html: string, testid: string): string {
  const open = html.match(new RegExp(`<(\\w+)[^>]*data-testid="${testid}"[^>]*>`));
  if (!open) return '';
  const name = open[1]!;
  const from = open.index! + open[0].length;
  let depth = 1;
  const re = new RegExp(`<${name}[\\s>]|</${name}>`, 'g');
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/** The camera flown in: the map's own transform zooms. */
const zoomed = (html: string) => /<div[^>]*style="[^"]*transform:[^";]*scale\([^"]*"[^>]*data-testid="event-map"/.test(html);

// --- B1: the ledger stories --------------------------------------------------------------------------------------

const money = (on: string, delta: number): Effect => ({ on, what: 'money', delta });
const TAX = event('federationTax', 'planning', {
  title: 'Federation tax',
  line: "The Federation takes 10% of every player's cash for the colony fund.",
  effects: [money(LENA, -25), money(OSSA, -40), money(BRIX, -9)],
});
const GRANT = event('federationGrant', 'planning', { title: 'Federation grant', sign: 'good', line: 'The Federation pays the 2 poorest players 150 each.', effects: [money(BRIX, 150), money(LENA, 150)] });
const INHERITANCE = event('inheritance', 'planning', { title: 'Inheritance', sign: 'good', scope: 'personal', player: LENA, effects: [money(LENA, 233)] });
const PIRATES = event('pirateRaid', 'auction', {
  title: 'Pirate raid',
  line: "Pirates take all the Crystite, the store's and every player's.",
  effects: [
    { on: OSSA, what: 'crystite', delta: -6 },
    { on: LENA, what: 'crystite', delta: -3 },
    { on: 'store', what: 'crystite', delta: -8 },
  ],
});
const RATS = event('ratsInSilo', 'upkeep', { title: 'Rats in the silo', scope: 'personal', player: LENA, effects: [{ on: LENA, what: 'food', delta: -4 }] });
const ACCOUNTANT = event('crookedAccountant', 'upkeep', { title: 'Crooked accountant', line: 'A crooked accountant takes 10% of the cash.', scope: 'personal', player: OSSA, effects: [money(OSSA, -31)] });
const PACKAGE = event('packageFromHome', 'upkeep', { title: 'Package from home', sign: 'good', scope: 'personal', player: BRIX, effects: [{ on: BRIX, what: 'food', delta: 3 }] });

describe('B1 (C5): the ledger stories play the gallery’s own, and say what they changed off the map', () => {
  it.each([
    { ev: TAX, marks: ['cruiser', 'tax-coin'] },
    { ev: GRANT, marks: ['cruiser', 'grant-pod'] },
    { ev: PIRATES, marks: ['pirate-ship', 'pirate-crate', 'pirate-hold'] },
  ])('$ev.key: the TV and a phone alone play its story on the map', ({ ev, marks }) => {
    for (const where of ['tv', 'alone'] as const) {
      const frames = playFrames([ev], where);
      for (const mark of marks) expect(frames.some((html) => has(html, mark)), `${ev.key} on ${where}: ${mark}`).toBe(true);
    }
    // With a TV in the room, the phone never plays the story: the light card does the rest.
    for (const html of playFrames([ev], 'withTv')) for (const mark of marks) expect(has(html, mark), `${ev.key} with a TV: no ${mark}`).toBe(false);
  });

  it('pirateRaid: the hold counts each holder’s Crystite down to 0 as its crates go aboard', () => {
    const frames = playFrames([PIRATES], 'tv');
    const holds = frames.filter((html) => has(html, 'pirate-hold')).map((html) => text(inside(html, 'pirate-hold')));
    expect(holds[0]).toMatch(/All the Crystite/);
    expect(holds[0]).toMatch(/Ossa 6/);
    expect(holds[0]).toMatch(/Store 8/);
    expect(holds.at(-1)).toMatch(/Ossa 0/);
    expect(holds.at(-1)).toMatch(/Lena 0/);
    expect(holds.at(-1)).toMatch(/Store 0/);
  });

  it('federationTax: the stamp names the share, and the colony fund takes what the players paid', () => {
    const frames = playFrames([TAX], 'tv').map(text);
    expect(frames.some((f) => f.includes('TAX 10%'))).toBe(true);
    expect(frames.some((f) => f.includes('Colony fund +74 cr'))).toBe(true);
  });

  it.each([TAX, GRANT, INHERITANCE, PIRATES, RATS, ACCOUNTANT, PACKAGE])('$key: its result is a card of what it changed, one chip per change', (ev) => {
    for (const where of ['tv', 'alone'] as const) {
      const card = inside(result([ev], where), 'effects-card');
      expect(card, `${ev.key} on ${where}: the effects card`).not.toBe('');
      for (const f of ev.effects!) expect(text(card)).toContain(chipText(f));
    }
  });

  it.each([
    { ev: TAX, me: LENA, headline: '−25 cr for you' },
    { ev: GRANT, me: BRIX, headline: '+150 cr for you' },
    { ev: INHERITANCE, me: LENA, headline: '+233 cr for you' },
    { ev: PIRATES, me: OSSA, headline: '−6 Crystite for you' },
    { ev: RATS, me: LENA, headline: '−4 Food for you' },
    { ev: ACCOUNTANT, me: OSSA, headline: '−31 cr for you' },
    { ev: PACKAGE, me: BRIX, headline: '+3 Food for you' },
  ])('$ev.key: the phone’s “you” line reads the effects aimed at you', ({ ev, me, headline }) => {
    for (const where of ['alone', 'withTv'] as const) {
      const you = text(inside(result([ev], where, { me }), 'phone-you'));
      expect(you, `${ev.key} on ${where}`).toContain(headline);
    }
  });

  it('a ledger event that missed you says where it went instead, and the store’s change shows as a chip', () => {
    const miss = result([PIRATES], 'withTv', { me: BRIX });
    expect(has(miss, 'phone-you')).toBe(false);
    expect(text(inside(miss, 'phone-miss'))).toContain('Not you');
    expect(text(inside(miss, 'phone-miss'))).toContain('Store −8');
  });

  it('the TV log says each change off the map, the store by name', () => {
    expect(text(inside(result([PIRATES], 'tv'), 'log'))).toContain('Ossa −6 Crystite · Lena −3 Crystite · Store −8 Crystite');
    expect(text(inside(result([TAX], 'tv'), 'log'))).toContain('−74 cr from 3 players');
    expect(text(inside(result([RATS], 'tv'), 'log'))).toContain('Lena −4 Food');
  });

  it('each ledger key has its own badge, not the placeholder disc', () => {
    for (const ev of [TAX, GRANT, INHERITANCE, PIRATES, RATS, ACCOUNTANT, PACKAGE]) {
      const seg = segOf([ev], 'tv');
      const html = screen([ev], seg.announceAt + 0.3, 'tv');
      expect(html, ev.key).toMatch(new RegExp(`data-glyph="${ev.key}"[^>]*>\\s*<(path|ellipse|rect)`));
    }
  });

  it('as bulletins, the personal ledger events tell their story on the roll call’s marks, with their figures', () => {
    const bulletins = [INHERITANCE, RATS, ACCOUNTANT, PACKAGE].map((e) => ({ ...e, weight: 'bulletin' as const, playMs: EVENT_SHOW.rollCallMs / 4 }));
    const frames = playFrames(bulletins, 'tv');
    for (const ev of bulletins) expect(frames.some((html) => has(html, `vignette-${ev.key}`)), ev.key).toBe(true);
    const roll = text(inside(frames.at(-1)!, 'roll-call'));
    expect(roll).toContain('+233 cr');
    expect(roll).toContain('−4 Food');
    expect(roll).toContain('−31 cr');
    expect(roll).toContain('+3 Food');
  });

  // Every 0.1 s of seven stories on two screens is about a thousand static renders, each drawn once and checked for
  // everything below. Alone that is under half a second; under `pnpm test`'s parallel run on a CI runner it has gone
  // past vitest's 5 s default (batch 13), so it gets its own budget rather than a coarser scrub that could miss a frame.
  it('HC-6: with reduced motion no ledger story moves the camera, and each still shows its result', { timeout: 30_000 }, () => {
    for (const ev of [TAX, GRANT, INHERITANCE, PIRATES, RATS, ACCOUNTANT, PACKAGE]) {
      for (const where of ['tv', 'alone'] as const) {
        const frames = playFrames([ev], where, { reduced: true });
        for (const html of frames) {
          expect(zoomed(html), `${ev.key} on ${where}`).toBe(false);
          // Nothing travels: no crate goes up the ramp, no coin flies, no pod drops.
          for (const moving of ['pirate-crate', 'tax-coin', 'grant-pod']) expect(has(html, moving), `${ev.key} on ${where}: no ${moving}`).toBe(false);
        }
        expect(inside(result([ev], where, { reduced: true }), 'effects-card'), `${ev.key} on ${where}`).not.toBe('');
        if (ev === PIRATES && where === 'tv') {
          // The pirates still land and their hold still reads 0: the result, without the flight.
          expect(frames.some((html) => has(html, 'pirate-ship'))).toBe(true);
          expect(text(inside(frames.find((html) => has(html, 'pirate-hold'))!, 'pirate-hold'))).toMatch(/Ossa 0/);
        }
      }
    }
  });

  it('in a segment of several events, a phone it missed shows every event’s change to the store and the colony', () => {
    // Two bulletins in one roll call: Lena's rats, then a raid on the store. Brix is in neither.
    const roll = [
      { ...RATS, weight: 'bulletin' as const, playMs: EVENT_SHOW.rollCallMs / 2 },
      { ...PIRATES, weight: 'bulletin' as const, playMs: EVENT_SHOW.rollCallMs / 2, effects: [{ on: 'store', what: 'crystite' as const, delta: -8 }] },
    ];
    // The line names it too; the chip is the change itself, so look for the chip.
    expect(inside(result(roll, 'withTv', { me: BRIX }), 'phone-miss'), 'the raid’s chip under the miss line').toMatch(/data-delta="-1"[^>]*><span[^>]*>▼<\/span>Store −8/);
  });

  it('a key this client does not know yet still plays, on the plain badge', () => {
    const unknown = event('festival' as ShowEventView['key'], 'planning', { title: 'Festival', sign: 'good' });
    const seg = segOf([unknown], 'tv');
    const html = screen([unknown], seg.announceAt + 0.3, 'tv');
    expect(html).toMatch(/data-glyph="festival"[^>]*>\s*<circle/);
    expect(() => playFrames([unknown], 'alone')).not.toThrow();
  });
});

// --- B2: the map and colony stories ------------------------------------------------------------------------------

/** The map as the view sends it after the events: the struck and robbed plots stand empty, the crater is there. */
const after = (changes: Record<string, Partial<MapTile>>): MapTile[] =>
  tiles.map((tile) => {
    const c = changes[`${tile.x},${tile.y}`];
    if (!c) return tile;
    const { good: _good, ...rest } = tile;
    return { ...rest, ...c };
  });
const THEFT = event('muleTheft', 'development', {
  title: 'MULE theft',
  scope: 'personal',
  player: OSSA,
  origin: { x: 6, y: 3 },
  hits: [{ x: 6, y: 3, order: 0, delta: 0, becomes: 'idle', muleLost: true, good: 'smithore' }],
});
const ROBBED = after({ '6,3': {} });
const METEOR = event('meteorStrike', 'production', {
  title: 'Meteor strike',
  scope: 'local',
  player: OSSA,
  origin: { x: 7, y: 3 },
  hits: [{ x: 7, y: 3, order: 0, delta: 0, becomes: 'crater', muleLost: true, good: 'energy' }],
});
const CRATERED = after({ '7,3': { special: { kind: 'meteorCrater' } } });
const COLD = event('coldSnap', 'production', { title: 'Cold snap', line: 'A cold snap: every plot needs 2 times its Energy this month.', effects: [{ on: 'colony', what: 'energyNeed', delta: 100 }] });
const sickBy = (player: string, name: string): ShowEventView =>
  ({ key: 'sickness', kind: 'sickness', title: 'Sickness', line: `${name} fell sick: the epidemic.`, sign: 'bad', scope: 'personal', origin: { ...STORE }, player, hits: [], phase: 'development', weight: 'bulletin', playMs: EVENT_SHOW.rollCallMs / 2 }) as ShowEventView;
/** Brix held a Medicine and is cured; Lena and Ossa fall sick, and the server sends each a sickness bulletin. */
const EPIDEMIC = event('epidemic', 'development', { title: 'Epidemic', effects: [{ on: BRIX, what: 'medicine', delta: -1 }] });
const EPIDEMIC_PHASE = [EPIDEMIC, sickBy(LENA, 'Lena'), sickBy(OSSA, 'Ossa')];
const IMMIGRATION = event('immigrationWave', 'planning', { title: 'Immigration wave', sign: 'good', effects: [{ on: 'colony', what: 'colonists', delta: 12 }] });
const FIRE = event('storeFire', 'auction', {
  title: 'Store fire',
  effects: [
    { on: 'store', what: 'food', delta: -14 },
    { on: 'store', what: 'water', delta: -9 },
    { on: 'store', what: 'energy', delta: -12 },
    { on: 'store', what: 'smithore', delta: -10 },
    { on: 'store', what: 'mules', delta: -8 },
  ],
});
const glyphOn = (html: string, x: number, y: number) => has(html, `special-glyph-${x}-${y}`);
/** The jolt's shake: the map moved in cqw. */
const shaken = (html: string) => /<div[^>]*style="[^"]*transform:[^"]*cqw[^"]*"[^>]*data-testid="event-map"/.test(html);

describe('B2 (C5): the map and colony stories play the gallery’s own, and change the map as they land', () => {
  it.each([
    { ev: THEFT, map: ROBBED, marks: ['theft-thief', 'theft-mule'] },
    { ev: METEOR, map: CRATERED, marks: ['meteor-streak', 'crater-7-3'] },
    { ev: COLD, map: tiles, marks: ['front-coldSnap'] },
    { ev: EPIDEMIC, map: tiles, marks: ['epidemic-haze', `epidemic-sick-${LENA}`, `epidemic-sick-${OSSA}`, `epidemic-shield-${BRIX}`] },
    { ev: IMMIGRATION, map: tiles, marks: ['migration-shuttle', 'migration-colonist'] },
    { ev: FIRE, map: tiles, marks: ['store-flames', 'store-storage'] },
  ])('$ev.key: the TV and a phone alone play its story; a phone with a TV does not', ({ ev, map, marks }) => {
    const events = ev === EPIDEMIC ? EPIDEMIC_PHASE : [ev];
    for (const where of ['tv', 'alone'] as const) {
      const frames = playFrames(events, where, { map });
      for (const mark of marks) expect(frames.some((html) => has(html, mark)), `${ev.key} on ${where}: ${mark}`).toBe(true);
    }
    for (const html of playFrames(events, 'withTv', { map })) for (const mark of marks) expect(has(html, mark), `${ev.key} with a TV: no ${mark}`).toBe(false);
  });

  it('muleTheft: the plot’s chip says TAKEN once the thief has gone, on every screen', () => {
    for (const where of ['tv', 'alone', 'withTv'] as const) {
      const html = result([THEFT], where, { map: ROBBED, me: OSSA });
      expect(text(inside(html, 'mark-6-3')), where).toContain('TAKEN');
    }
    const seg = segOf([THEFT], 'tv');
    expect(has(screen([THEFT], seg.playAt + 0.2, 'tv', { map: ROBBED }), 'mark-6-3'), 'not before it lands').toBe(false);
  });

  it.each([
    { events: [THEFT], map: ROBBED, x: 6, y: 3 },
    { events: [METEOR], map: CRATERED, x: 7, y: 3 },
  ])('$events.0.key: the plot keeps its MULE until the hit lands, then stands empty, on every screen that draws the map', ({ events, map, x, y }) => {
    const seg = segOf(events, 'tv');
    for (const where of ['tv', 'alone'] as const) {
      expect(has(screen(events, seg.announceAt + 0.1, where, { map }), `installed-${x}-${y}`), `${where}: its MULE while announced`).toBe(true);
      expect(has(result(events, where, { map }), `installed-${x}-${y}`), `${where}: gone once it lands`).toBe(false);
    }
  });

  it('meteorStrike: the crater appears on the map as the meteor lands, not before, and the plot’s chip says LOST', () => {
    const seg = segOf([METEOR], 'tv');
    expect(glyphOn(screen([METEOR], seg.playAt + 0.2, 'tv', { map: CRATERED }), 7, 3), 'no crater before impact').toBe(false);
    expect(glyphOn(screen([METEOR], seg.announceAt + 0.1, 'tv', { map: CRATERED }), 7, 3), 'no crater while announced').toBe(false);
    const landed = result([METEOR], 'tv', { map: CRATERED });
    expect(glyphOn(landed, 7, 3), 'the crater after impact').toBe(true);
    expect(text(inside(landed, 'mark-7-3'))).toContain('LOST');
    // The ground jolts as it lands.
    expect(playFrames([METEOR], 'tv', { map: CRATERED }).some(shaken)).toBe(true);
  });

  it('meteorStrike on a special plot: the map keeps its old badge until impact, then shows the crater (#282 review)', () => {
    const onCavern = { ...METEOR, hits: [{ ...METEOR.hits[0]!, was: 'crystalCavern' as const }] };
    const seg = segOf([onCavern], 'tv');
    const kindAt = (html: string) => /data-testid="special-glyph-7-3" data-kind="([a-zA-Z]+)"/.exec(html)?.[1];
    expect(kindAt(screen([onCavern], seg.announceAt + 0.1, 'tv', { map: CRATERED })), 'the cavern while announced').toBe('crystalCavern');
    expect(kindAt(result([onCavern], 'tv', { map: CRATERED })), 'the crater once it lands').toBe('meteorCrater');
  });

  it('meteorStrike with reduced motion: the drawn crater comes with the map’s crater badge, not a second after it (lane review)', () => {
    for (const html of playFrames([METEOR], 'tv', { map: CRATERED, reduced: true })) {
      expect(has(html, 'crater-7-3'), 'the drawn crater exactly when the badge shows').toBe(glyphOn(html, 7, 3));
    }
  });

  it('epidemic: the sick tag lands on each colonist it sickens as the epidemic lands, not on the one it cured', () => {
    const frames = playFrames([EPIDEMIC], 'tv');
    expect(frames.some((html) => inside(html, `colonist-${LENA}`).includes('data-testid="sick-tag"'))).toBe(true);
    expect(frames.some((html) => inside(html, `colonist-${BRIX}`).includes('data-testid="sick-tag"'))).toBe(false);
  });

  it('storeFire: the store’s storage burns shelf by shelf down to 0, the corral too', () => {
    const shelves = playFrames([FIRE], 'tv')
      .filter((html) => has(html, 'store-storage'))
      .map((html) => text(inside(html, 'store-storage')));
    expect(shelves[0]).toMatch(/Store storage/);
    expect(shelves[0]).toMatch(/\b14\b/);
    expect(shelves[0]).toMatch(/\b8\b/);
    expect(shelves.at(-1)!.replace('Store storage', '')).not.toMatch(/\b[1-9]\d*\b/);
  });

  it('immigrationWave and storeFire: their result is a card of what changed, the colony’s and the store’s', () => {
    expect(text(inside(result([IMMIGRATION], 'tv'), 'effects-card'))).toContain('Colonists +12');
    const fire = text(inside(result([FIRE], 'tv'), 'effects-card'));
    for (const chip of ['Store −14', 'Store −9', 'Store −12', 'Store −10', '−8 MULEs']) expect(fire).toContain(chip);
  });

  it.each([
    { events: [THEFT], map: ROBBED, me: OSSA, headline: 'Your MULE was taken' },
    { events: [METEOR], map: CRATERED, me: OSSA, headline: 'Your MULE was destroyed' },
    { events: EPIDEMIC_PHASE, map: tiles, me: LENA, headline: 'You’re sick, 2 turns' },
    { events: EPIDEMIC_PHASE, map: tiles, me: BRIX, headline: '−1 Medicine for you' },
  ])('$events.0.key: the phone tells $me what it did to them', ({ events, map, me, headline }) => {
    for (const where of ['alone', 'withTv'] as const) expect(text(inside(result(events, where, { map, me }), 'phone-you')), where).toContain(headline);
  });

  it.each([
    { events: [COLD], line: 'For everyone: every plot needs twice its Energy this month.', chip: 'Energy need +100%' },
    { events: [IMMIGRATION], line: 'For everyone: more colonists, for good.', chip: 'Colonists +12' },
    { events: [FIRE], line: 'For everyone: the store lost everything it held', chip: '−8 MULEs' },
  ])('$events.0.key: the colony’s news reads the same on every phone, with its change', ({ events, line, chip }) => {
    for (const me of [LENA, BRIX]) {
      const miss = text(inside(result(events, 'withTv', { me }), 'phone-miss'));
      expect(miss).toContain(line);
      expect(miss).toContain(chip);
    }
  });

  it('the TV log says what each did', () => {
    expect(text(inside(result([THEFT], 'tv', { map: ROBBED }), 'log'))).toContain('Ossa’s Smithore mine stands idle');
    expect(text(inside(result([METEOR], 'tv', { map: CRATERED }), 'log'))).toContain('Ossa’s Energy plant lost its MULE · a crater');
    expect(text(inside(result([COLD], 'tv'), 'log'))).toContain('Energy need +100%');
  });

  // Every 0.1 s of six stories on two screens, each frame drawn once: its own budget, as B1's HC-6 has, for the same reason.
  it('HC-6: with reduced motion no camera, no jolt, nothing travels, and each still shows its result', { timeout: 30_000 }, () => {
    const cases = [
      { events: [THEFT], map: ROBBED, kept: 'mark-6-3' },
      { events: [METEOR], map: CRATERED, kept: 'crater-7-3' },
      { events: [COLD], map: tiles, kept: 'log|phone-miss' },
      { events: EPIDEMIC_PHASE, map: tiles, kept: `epidemic-sick-${LENA}` },
      { events: [IMMIGRATION], map: tiles, kept: 'effects-card' },
      { events: [FIRE], map: tiles, kept: 'effects-card' },
    ];
    for (const { events, map, kept } of cases) {
      for (const where of ['tv', 'alone'] as const) {
        const frames = playFrames(events, where, { map, reduced: true });
        const key = events[0]!.key;
        for (const html of frames) {
          expect(zoomed(html), `${key} on ${where}: no camera`).toBe(false);
          expect(shaken(html), `${key} on ${where}: no jolt`).toBe(false);
          for (const moving of ['meteor-streak', 'front-coldSnap', 'theft-thief', 'theft-mule', 'pirate-crate']) expect(has(html, moving), `${key} on ${where}: no ${moving}`).toBe(false);
        }
        const settled = [...frames, result(events, where, { map, reduced: true })];
        expect(settled.some((html) => kept.split('|').some((k) => has(html, k))), `${key} on ${where}: ${kept}`).toBe(true);
      }
    }
    expect(glyphOn(result([METEOR], 'tv', { map: CRATERED, reduced: true }), 7, 3)).toBe(true);
  });
});

/** An effect's chip, as the gallery's EffectChip words it: a held good by its number, money in credits. */
function chipText(f: Effect): string {
  const n = `${f.delta < 0 ? '−' : '+'}${Math.abs(f.delta)}`;
  if (f.what === 'money') return `${n} cr`;
  return f.on === 'store' ? `Store ${n}` : n;
}
