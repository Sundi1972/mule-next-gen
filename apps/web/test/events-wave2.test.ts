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

  it('HC-6: with reduced motion no ledger story moves the camera, and each still shows its result', () => {
    for (const ev of [TAX, GRANT, INHERITANCE, PIRATES, RATS, ACCOUNTANT, PACKAGE]) {
      for (const where of ['tv', 'alone'] as const) {
        for (const html of playFrames([ev], where, { reduced: true })) expect(zoomed(html), `${ev.key} on ${where}`).toBe(false);
        expect(inside(result([ev], where, { reduced: true }), 'effects-card'), `${ev.key} on ${where}`).not.toBe('');
      }
    }
    // The pirates still land and their hold still reads 0: the result, without the flight.
    const frames = playFrames([PIRATES], 'tv', { reduced: true });
    expect(frames.some((html) => has(html, 'pirate-ship'))).toBe(true);
    expect(text(inside(frames.find((html) => has(html, 'pirate-hold'))!, 'pirate-hold'))).toMatch(/Ossa 0/);
  });
});

/** An effect's chip, as the gallery's EffectChip words it: a held good by its number, money in credits. */
function chipText(f: Effect): string {
  const n = `${f.delta < 0 ? '−' : '+'}${Math.abs(f.delta)}`;
  if (f.what === 'money') return `${n} cr`;
  return f.on === 'store' ? `Store ${n}` : n;
}
