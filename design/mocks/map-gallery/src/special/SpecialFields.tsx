import { useMemo, type ReactNode } from 'react';
import { cx, GOOD_NAME, GoodTag, TERRAIN_NAME, type Good } from '@mule/ui';
import { SEED, PLAYERS, crop, find, overviewTiles, realMap, stateCards, sweep, SWEEP_TERRAINS, type StateCard } from './fixtures';
import { SPECIAL_EFFECT, SPECIAL_KINDS, SPECIAL_NAME, specialEffect, TERRAIN_ODDS, type MapSpecial, type SpecialKind, type SpecialTile } from './kinds';
import { LandmarkSwatch, SpecialBadge, SpecialMap, type Density, type Variant } from './SpecialGlyph';

/**
 * Plot widths at true size. The phone's map fills what the guide rail leaves of a sideways phone
 * (844 wide, rail clamp(232px, 31vw, 300px)); the TV draws the land grant map 700 wide on its 1280 × 720 stage.
 */
const MAP_PX: Record<Density, number> = { phone: 540, tv: 700 };

const VARIANT_TITLE: Record<Variant, string> = { badge: 'A · Badge', landmark: 'B · Landmark' };
const VARIANT_LINE: Record<Variant, string> = {
  badge: "A hexagonal chip pinned on the plot's lower-right corner, above the plot's other chips.",
  landmark: 'The land itself is marked: a glow, a ring and a large symbol painted under the plot grid.',
};
const VARIANTS: Variant[] = ['badge', 'landmark'];
const DENSITIES: Density[] = ['phone', 'tv'];
const DENSITY_TITLE: Record<Density, string> = { phone: 'Phone', tv: 'TV' };

const DECISIONS: [string, string][] = [
  ['Goal', 'Notice a special field at a glance on both densities, tell the five apart, and learn what one does on the phone before claiming it.'],
  ['Colour', 'Each kind wears the colour of the good it pays (ruins Alloy grey, cavern Crystite, geyser Water, oasis Food, relic Energy gold). DS-GAP: no special-field tokens yet.'],
  ['Shape first', 'Five distinct silhouettes carry the kind; colour only helps, so the legend and the map read without it.'],
  ['Over anything', "Every mark has a mark-edge halo (PlayerMark's) and A sits on the map-chip fill, so it reads over every land and every player's glow."],
  ['Components', "HoloMap untouched, the glyph as an overlay (MapCard's pattern); SpecialIcon is drawn like GoodIcon; sizes per density inline, as HoloMap does."],
  ['A · placement', 'Lower-right, the corner free of PlayerMark and the flag, hung a quarter over the edge so it clips only the empty corner of a TV good chip.'],
  ['B · placement', "Under the plot grid. When a centre chip covers the plot, the symbol moves up into the ring's crown."],
  ['Phone line', 'One short sentence, "Geyser: +2 Water or Energy.", first under the plot name, then the terrain hint or the ground card.'],
  ['Gone', 'Ruins that paid and a cavern that caved in draw nothing: the plot is plain, and the phone shows no line.'],
  ['Accessibility', "Each glyph is named by its kind (PR-4 adds it to the plot's label); the legend pairs symbol, name and effect."],
  ['Recommended', "A. It reads in every state, worked TV plots included. B is louder across a room, but once a plot is worked HoloMap's TV good chip covers it."],
];

export function SpecialFields({ header }: { header: ReactNode }) {
  const map = useMemo(realMap, []);
  const overview = useMemo(() => overviewTiles(map), [map]);
  return (
    <div className="min-h-screen bg-table text-ink" data-testid="special-view">
      {header}
      <main className="space-y-6 px-6 py-6">
        <Decisions />
        <Block id="on-the-map" title="On the map" aside={`seed ${SEED}, ${PLAYERS} players: all five kinds · true size`}>
          <p className="mb-4 max-w-3xl text-sm text-ink-2">
            The second month: P2 works the geyser, P4 owns the oasis, the relic, cavern and ruins are still free. The phone shows the player's own
            analysis; the TV is the public table, so it hides ground.
          </p>
          {DENSITIES.map((density) => (
            <div key={density} className="mb-6 last:mb-0">
              <h3 className="mb-2 font-display text-base font-semibold">{DENSITY_TITLE[density]}</h3>
              <div className="flex flex-wrap gap-6">
                {VARIANTS.map((variant) => (
                  <figure key={variant} style={{ width: MAP_PX[density] }} data-testid={`overview-${variant}-${density}`}>
                    <figcaption className="mb-1.5 text-sm font-semibold">{VARIANT_TITLE[variant]}</figcaption>
                    <SpecialMap variant={variant} width={map.width} height={map.height} tiles={overview} density={density} hideGround={density === 'tv'} className="w-full" />
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </Block>

        <Block id="legend" title="Legend">
          <div className="grid gap-6 lg:grid-cols-2">
            {VARIANTS.map((v) => (
              <Legend key={v} variant={v} />
            ))}
          </div>
        </Block>

        <Block id="states" title="States" aside="seed 93, plots x 14–18, y 4–8 · true size">
          {VARIANTS.map((variant) => (
            <div key={variant} className="mb-6 last:mb-0">
              <h3 className="mb-2 font-display text-base font-semibold">{VARIANT_TITLE[variant]}</h3>
              {DENSITIES.map((density) => (
                <StateRow key={density} variant={variant} density={density} cards={stateCards(map, density)} />
              ))}
            </div>
          ))}
        </Block>

        <Block id="terrains" title="Every terrain" aside="legibility check: each kind on every dry terrain · true size">
          <p className="mb-3 max-w-3xl text-sm text-ink-2">
            Columns: {SWEEP_TERRAINS.map((t) => TERRAIN_NAME[t]).join(', ')}. Rows: {SPECIAL_KINDS.map((k) => SPECIAL_NAME[k]).join(', ')}. The generator puts each kind
            only on some of these; this tests the art, not the rules.
          </p>
          <Sweep />
        </Block>

        <Block id="phone" title="On the phone" aside="the plot card in the guide rail, as LandGrant and Develop show it">
          {VARIANTS.map((variant) => (
            <div key={variant} className="mb-6 last:mb-0">
              <h3 className="mb-2 font-display text-base font-semibold">{VARIANT_TITLE[variant]}</h3>
              <PhoneCards variant={variant} />
            </div>
          ))}
        </Block>
      </main>
    </div>
  );
}

function Block({ id, title, aside, children }: { id: string; title: string; aside?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-panel border border-holo-line bg-panel p-4" data-testid={`special-${id}`}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label-caps">{title}</h2>
        {aside && <span className="font-mono text-xs text-ink-2">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

const SECTIONS: [string, string][] = [
  ['on-the-map', 'On the map'],
  ['legend', 'Legend'],
  ['states', 'States'],
  ['terrains', 'Every terrain'],
  ['phone', 'On the phone'],
];

function Decisions() {
  return (
    <section className="rounded-panel border border-holo-line bg-panel p-4" data-testid="special-decisions">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="label-caps">Special fields · two glyph variants for review</h2>
        <nav aria-label="Sections" className="flex flex-wrap gap-2 text-sm">
          {SECTIONS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })} className="rounded-control border border-holo-line px-2.5 py-1 hover:border-holo">
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        {VARIANTS.map((v) => (
          <div key={v} className="rounded-control bg-raised px-3 py-2" data-testid={`variant-${v}`}>
            <p className="font-display font-semibold">{VARIANT_TITLE[v]}</p>
            <p className="text-sm text-ink-2">{VARIANT_LINE[v]}</p>
          </div>
        ))}
      </div>
      <dl className="grid gap-x-6 gap-y-1.5 text-sm lg:grid-cols-2">
        {DECISIONS.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-28 shrink-0 font-semibold">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Mark({ variant, special, size }: { variant: Variant; special: MapSpecial; size: 'small' | 'large' }) {
  if (variant === 'badge') return <SpecialBadge special={special} density={size === 'large' ? 'tv' : 'phone'} />;
  return <LandmarkSwatch kind={special.kind} size={size === 'large' ? 44 : 26} />;
}

function Legend({ variant }: { variant: Variant }) {
  return (
    <div data-testid={`special-legend-${variant}`}>
      <h3 className="mb-2 font-display text-base font-semibold">{VARIANT_TITLE[variant]}</h3>
      <ul className="flex flex-col gap-2">
        {SPECIAL_KINDS.map((kind) => (
          <li key={kind} className="flex items-center gap-3 rounded-control bg-raised px-3 py-2" data-testid={`special-legend-${variant}-${kind}`}>
            <span className="flex w-11 justify-center">
              <Mark variant={variant} special={{ kind }} size="large" />
            </span>
            <span className="flex flex-col">
              <span className="font-display font-semibold">{SPECIAL_NAME[kind]}</span>
              <span className="text-sm text-ink-2">{SPECIAL_EFFECT[kind][0]!.toUpperCase() + SPECIAL_EFFECT[kind].slice(1)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StateRow({ variant, density, cards }: { variant: Variant; density: Density; cards: StateCard[] }) {
  const plot = MAP_PX[density] / 19;
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-1.5 text-xs text-ink-3">{DENSITY_TITLE[density]}</p>
      <div className="flex flex-wrap gap-4">
        {cards.map((c) => (
          <figure key={c.id} style={{ width: plot * c.crop.width }} data-testid={`state-${variant}-${density}-${c.id}`}>
            <SpecialMap
              variant={variant}
              width={c.crop.width}
              height={c.crop.height}
              tiles={c.crop.tiles}
              density={density}
              selected={c.selected ?? null}
              cursor={c.cursor ?? null}
              hideGround={!!c.hideGround}
              className="w-full"
            />
            <figcaption className="mt-1.5">
              <span className="block text-sm font-semibold">{c.title}</span>
              <span className="block text-xs text-ink-3">{c.note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function Sweep() {
  const s = useMemo(sweep, []);
  return (
    <div className="flex flex-col gap-5">
      {VARIANTS.map((variant) => (
        <div key={variant}>
          <h3 className="mb-2 font-display text-base font-semibold">{VARIANT_TITLE[variant]}</h3>
          <div className="flex flex-wrap items-start gap-6">
            {DENSITIES.map((density) => (
              <figure key={density} style={{ width: (MAP_PX[density] / 19) * s.width }} data-testid={`sweep-${variant}-${density}`}>
                <SpecialMap variant={variant} width={s.width} height={s.height} tiles={s.tiles} density={density} className="w-full" />
                <figcaption className="mt-1 text-xs text-ink-3">{DENSITY_TITLE[density]}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The plot's special line, first under the plot name. PR-4 puts it in LandGrant, Develop, Planning's drone rail and the auction's LotCard. */
function SpecialLine({ variant, special }: { variant: Variant; special: MapSpecial }) {
  return (
    <p className="flex items-center gap-2 rounded-control bg-raised px-2.5 py-1.5 text-sm text-ink" data-testid="special-line" data-kind={special.kind}>
      <Mark variant={variant} special={special} size="small" />
      <span>
        <strong className="font-semibold">{SPECIAL_NAME[special.kind]}:</strong> {specialEffect(special)}
      </span>
    </p>
  );
}

const plotName = (x: number, y: number) => `${x + 1}·${y + 1}`;

/** The guide rail's width on a sideways phone, at its widest. */
const RAIL = 'w-[300px]';

function PhoneCards({ variant }: { variant: Variant }) {
  const map = useMemo(realMap, []);
  const tiles = useMemo(() => crop(map, 0, 0, map.width, map.height).tiles, [map]);
  const plot = (kind: SpecialKind): SpecialTile => {
    const t = find(map, kind);
    return tiles.find((p) => p.x === t.x && p.y === t.y)!;
  };
  const cavern = find(map, 'crystalCavern');
  return (
    <div className="flex flex-wrap gap-4">
      {SPECIAL_KINDS.map((kind) => {
        const t = plot(kind);
        return (
          <RailCard key={kind} testid={`plot-card-${variant}-${kind}`} caption={`Land grant · ${SPECIAL_NAME[kind]}`}>
            <span className="label-caps">Lit now</span>
            <span className="font-display text-xl font-semibold leading-tight">
              {TERRAIN_NAME[t.terrain]} <span className="font-mono text-base text-ink-3">{plotName(t.x, t.y)}</span>
            </span>
            <SpecialLine variant={variant} special={t.special!} />
            <span className="text-sm text-ink-2" data-testid="terrain-hint">
              {TERRAIN_ODDS[t.terrain]}
            </span>
          </RailCard>
        );
      })}
      <RailCard testid={`plot-card-${variant}-develop`} caption="Develop · the cavern, yours and analysed">
        <header className="flex items-baseline justify-between gap-2">
          <span className="font-display text-lg font-semibold leading-tight">
            {TERRAIN_NAME[cavern.terrain]} <span className="font-mono text-sm font-normal text-ink-3">{plotName(cavern.x, cavern.y)}</span>
          </span>
          <span className="font-mono text-xs text-holo">YOURS</span>
        </header>
        <SpecialLine variant={variant} special={{ kind: 'crystalCavern' }} />
        <GroundCardCopy ground={cavern.ground} />
      </RailCard>
      <RailCard testid={`plot-card-${variant}-gone`} caption="Gone · the cavern after it caved in">
        <span className="label-caps">Lit now</span>
        <span className="font-display text-xl font-semibold leading-tight">
          {TERRAIN_NAME[cavern.terrain]} <span className="font-mono text-base text-ink-3">{plotName(cavern.x, cavern.y)}</span>
        </span>
        <span className="text-sm text-ink-2" data-testid="terrain-hint">
          {TERRAIN_ODDS[cavern.terrain]}
        </span>
      </RailCard>
    </div>
  );
}

function RailCard({ testid, caption, children }: { testid: string; caption: string; children: ReactNode }) {
  return (
    <figure className={RAIL} data-testid={testid}>
      <div className="flex flex-col gap-1.5 rounded-panel border border-holo-faint bg-void/40 p-3">{children}</div>
      <figcaption className="mt-1 text-xs text-ink-3">{caption}</figcaption>
    </figure>
  );
}

const RAW: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];

/** A copy of apps/web/src/phone/ground.tsx GroundCard's look (the mock cannot import the app). */
function GroundCardCopy({ ground }: { ground: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-control bg-raised px-2.5 py-2" data-testid="ground">
      <span className="label-caps col-span-2 flex justify-between">
        Underground <span className="text-holo">Only you</span>
      </span>
      {RAW.map((g) => {
        const raw = ground[g] ?? 0;
        const n = Math.max(0, Math.min(4, g === 'food' || g === 'water' || g === 'energy' ? raw + 1 : raw));
        return (
          <span key={g} className={cx('flex items-center gap-1.5', n === 0 && 'opacity-50')} title={GOOD_NAME[g]}>
            <GoodTag good={g} className="flex-1 text-[11px]" />
            <span className="flex gap-0.5" aria-label={`${GOOD_NAME[g]} ${n} of 4`}>
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className="size-2 rounded-full" style={{ background: i <= n ? `var(--color-g-${g})` : 'var(--color-holo-line)' }} />
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
}
