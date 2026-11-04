import { boxOf, DEV_STEER, GLINT, HALL, WOLVES } from '@mule/engine';
import type { FramePack, FrameWolf, MuleView } from '@mule/protocol';
import { cx, GlintSparkle, Mule, WolfGlyph, type LiveWalker, type WalkerMarks } from '@mule/ui';
import type { CSSProperties } from 'react';
import type { DrawnMoments } from './frames';
import type { Density } from './layout';
import type { ArcadeColonist, ArcadeSeat } from './seat';

/**
 * The moments' layers (arcade spec C11, C12), grafted from the approved mock's WolfLayer, GlintLayer and ScrambleLayer
 * (design/mocks/ws6-ux/src/screens/arcade/) onto the frames' moments and the view: the packs and their callouts, the
 * glint and the scramble, on the phone, the laptop and the TV.
 */

type FrameScramble = NonNullable<DrawnMoments['scramble']>;
type Glint = NonNullable<DrawnMoments['glint']>;

const seconds = (ticks: number) => (ticks * DEV_STEER.tickMs) / 1_000;
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** A tile everyone can find: column·row, from 1. */
export const plotLabel = (g: { x: number; y: number }) => `${g.x + 1}·${g.y + 1}`;

/** A layer the size of the space, moved by transform alone, as the live walkers are (C13). */
function Placed({ x, y, cols, rows, children, ...data }: { x: number; y: number; cols: number; rows: number; children: React.ReactNode } & Record<`data-${string}`, string | number | undefined>) {
  return (
    <div className="absolute inset-0" style={{ transform: `translate(${(x / cols) * 100}%, ${(y / rows) * 100}%)` }} {...data}>
      {children}
    </div>
  );
}

// --- Wolves -------------------------------------------------------------------------------------------------------

/**
 * Every pack on the map, its fight's ground, each wolf's crouch and where it will land, and every MULE that bolted, an
 * alarm over it: on every view of the map.
 */
export function WolvesOnMap({ drawn, colonists, cols, rows, cell }: { drawn: DrawnMoments | null; colonists: ArcadeColonist[]; cols: number; rows: number; cell: number }) {
  const packs = drawn?.packs ?? [];
  const size = Math.round(cell * 0.75);
  const ring = cell * (WOLVES.arenaTiles + 0.3) * 2;
  return (
    <div className="pointer-events-none absolute inset-0 z-[7]" data-testid="wolves-layer">
      {packs
        .filter((p) => p.stage === 'fight')
        .map((p) => (
          // The fight's ground: you dodge inside this ring.
          <Placed key={`arena-${p.who}`} x={p.centre.x} y={p.centre.y} cols={cols} rows={rows} data-testid={`arena-${p.who}`}>
            <span className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-warn/70" style={{ width: ring, height: ring }} />
          </Placed>
        ))}
      {packs.map((p) => p.wolves.map((w, i) => <OneWolf key={`${p.who}-${i}`} pack={p} w={w} i={i} c={colonists.find((k) => k.id === p.who)} size={size} cell={cell} cols={cols} rows={rows} />))}
      {(drawn?.loose ?? []).map((m) => {
        const owner = colonists.find((k) => k.id === m.who);
        return (
          owner && (
            <Placed key={`loose-${m.who}`} x={m.x} y={m.y} cols={cols} rows={rows} data-testid={`loose-${m.who}`} data-x={m.x.toFixed(3)} data-y={m.y.toFixed(3)}>
              <span className="absolute left-0 top-0 flex -translate-x-1/2 -translate-y-[80%] flex-col items-center">
                <span className="rounded-full bg-alert px-1 font-mono text-[10px] font-bold leading-4 text-white shadow-chip">!</span>
                <Mule size={Math.round(size * 1.35)} state="idle" good={m.good} owner={owner.slot} facing={m.facing} />
              </span>
            </Placed>
          )
        );
      })}
    </div>
  );
}

function OneWolf({ pack, w, i, c, size, cell, cols, rows }: { pack: FramePack; w: FrameWolf; i: number; c: ArcadeColonist | undefined; size: number; cell: number; cols: number; rows: number }) {
  const facing = c && c.x < w.x ? 'left' : 'right';
  const hit = cell * WOLVES.biteTiles * 2;
  return (
    <>
      {w.state === 'tell' && w.target && (
        // The tell: where it will land, ringed in alert. Step off the ring to dodge.
        <Placed x={w.target.x} y={w.target.y} cols={cols} rows={rows} data-testid={`lunge-target-${pack.who}`}>
          <span className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-alert bg-alert/15" style={{ width: hit, height: hit }} />
        </Placed>
      )}
      <Placed x={w.x} y={w.y} cols={cols} rows={rows} data-testid={`wolf-${pack.who}-${i}`} data-state={w.state} data-x={w.x.toFixed(3)} data-y={w.y.toFixed(3)}>
        <span className="absolute left-0 top-0 -translate-x-1/2 -translate-y-[75%]">
          {w.state === 'open' && <span aria-hidden className="absolute inset-[-25%] rounded-full border-2 border-holo shadow-glow" />}
          <WolfGlyph size={size} state={w.state} facing={facing} />
        </span>
      </Placed>
    </>
  );
}

/** A wolf standing open within a strike's reach of its colonist: the button strikes now. */
const canStrike = (c: { x: number; y: number }, pack: FramePack | undefined) => !!pack && pack.wolves.some((w) => w.state === 'open' && Math.hypot(w.x - c.x, w.y - c.y) <= WOLVES.strikeTiles);

/**
 * What the wolves want of a colonist, at it: the choice (stick runs, button fights) with its countdown, then the chase,
 * then the fight's score; after a lost fight, the stun. On every view, so the TV shows it too; `mine` names the controls.
 */
export function WolfCallout({ c, drawn, density, mine, strike }: { c: ArcadeColonist; drawn: DrawnMoments | null; density: Density; mine: boolean; strike?: boolean }) {
  const text = density === 'tv' ? 'text-sm' : density === 'wide' ? 'text-base' : 'text-[11px]';
  // Near the map's top edge the callout hangs below the colonist, so the map never clips it.
  const place = c.y < 2 ? 'top-full mt-1' : 'bottom-full mb-1';
  const stun = drawn?.stunned.find((s) => s.who === c.id);
  if (stun && drawn && drawn.tick < stun.untilTick)
    return (
      <span className={cx('absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-chip bg-alert px-1.5 font-mono font-bold text-white shadow-chip', place, text)} data-testid={`stunned-${c.id}`}>
        ✶ STUNNED {Math.ceil(seconds(stun.untilTick - drawn.tick))}s
      </span>
    );
  const stage = c.encounter;
  if (!stage) return null;
  const pack = drawn?.packs.find((p) => p.who === c.id && p.stage === stage);
  const left = (total: number) => (pack && drawn ? Math.ceil(Math.max(0, total - seconds(drawn.tick - pack.sinceTick))) : null);
  if (stage === 'choose') {
    const s = left(WOLVES.chooseSeconds);
    return (
      <span
        className={cx('absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-panel border-2 border-alert bg-panel px-2 py-1 font-display font-bold leading-tight text-ink shadow-glow-alert', place, text)}
        data-testid={`wolf-choice-${c.id}`}
      >
        <span className="text-alert">WOLVES!</span>
        <span className="font-mono font-semibold">
          {mine ? 'stick: RUN · button: FIGHT' : 'run or fight?'}
          {s !== null && ` · ${s}s`}
        </span>
      </span>
    );
  }
  if (stage === 'chase')
    return (
      <span className={cx('absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-chip bg-warn px-1.5 font-mono font-bold text-void shadow-chip', place, text)} data-testid={`wolf-chase-${c.id}`}>
        RUN!
      </span>
    );
  // Your own button says what a press does now (the server's reach); for everyone else, what the wolves show.
  const open = mine && strike !== undefined ? strike : canStrike(c, pack);
  const s = left(WOLVES.fightSeconds);
  return (
    <span
      className={cx('absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-chip border px-1.5 font-mono font-bold shadow-chip', place, open ? 'border-holo bg-holo text-on-holo' : 'border-alert bg-panel text-ink', text)}
      data-testid={`fight-hud-${c.id}`}
      data-strikes={pack?.strikes}
      data-bites={pack?.bites}
    >
      <span>{open ? 'STRIKE!' : 'DODGE'}</span>
      {pack && (
        <>
          <span>
            ⚔ {pack.strikes}/{WOLVES.strikesToWin}
          </span>
          <span className={open ? '' : 'text-alert'}>
            bites {pack.bites}/{WOLVES.bitesToLose}
          </span>
        </>
      )}
      {s !== null && <span className="opacity-70">{s}s</span>}
    </span>
  );
}

/** A bite a colonist carries, and pelts: small chips under it. */
export function WolfMarks({ c, density }: { c: ArcadeColonist; density: Density }) {
  if (!c.bitten && !c.pelts) return null;
  const text = density === 'tv' ? 'text-[11px]' : 'text-[9px]';
  // Hung below the name, out of the column's flow, so a chip never lifts the colonist off its spot.
  return (
    <span className="absolute left-1/2 top-full mt-0.5 flex -translate-x-1/2 gap-0.5">
      {c.bitten && (
        <span className={cx('rounded-chip bg-alert px-1 font-mono font-bold leading-tight text-white shadow-chip', text)} data-testid={`bitten-${c.id}`}>
          BITTEN
        </span>
      )}
      {c.pelts > 0 && (
        <span className={cx('rounded-chip bg-warn px-1 font-mono font-bold leading-tight text-void shadow-chip', text)} data-testid={`pelts-${c.id}`}>
          {c.pelts} PELTS
        </span>
      )}
    </span>
  );
}

// --- The glint ----------------------------------------------------------------------------------------------------

/** The glint's seconds left at the drawn tick. */
const glintLeft = (g: Glint, tick: number) => Math.max(0, seconds(g.untilTick - tick));

/** The glint on its tile, its ring emptying as its seconds run out: on every view of the map. */
export function GlintOnMap({ drawn, cols, rows, cell }: { drawn: DrawnMoments | null; cols: number; rows: number; cell: number }) {
  const g = drawn?.glint;
  if (!g) return null;
  const left = glintLeft(g, drawn.tick);
  const size = cell * 0.95;
  return (
    <div
      className="pointer-events-none absolute z-[6] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      style={{ left: pct(g.x + 0.5, cols), top: pct(g.y + 0.5, rows), width: size, height: size }}
      data-testid="glint"
      data-x={g.x}
      data-y={g.y}
      data-left={left.toFixed(2)}
    >
      <GlintSparkle size={size} share={left / GLINT.showSeconds} />
    </div>
  );
}

/** On the TV: a line from each colonist racing for the glint to it. */
export function GlintSightlines({ drawn, colonists, cols, rows }: { drawn: DrawnMoments | null; colonists: ArcadeColonist[]; cols: number; rows: number }) {
  const g = drawn?.glint;
  if (!g) return null;
  const racing = colonists.filter((c) => c.space === 'map' && !c.done && drawn.racers.includes(c.id));
  return (
    <svg className="pointer-events-none absolute inset-0 z-[6] h-full w-full" viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none" aria-hidden data-testid="glint-sightlines">
      {racing.map((c) => (
        <line key={c.id} x1={c.x} y1={c.y} x2={g.x + 0.5} y2={g.y + 0.5} stroke="var(--color-g-crystite)" strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" opacity={0.85} data-who={c.id} />
      ))}
    </svg>
  );
}

/** The arrow at a colonist's shoulder that points at the glint: everyone turns to look. */
export function GlintTurn({ drawn, c, size }: { drawn: DrawnMoments | null; c: LiveWalker & { done?: boolean }; size: number }) {
  const g = drawn?.glint;
  if (!g || c.done) return null;
  const deg = (Math.atan2(g.y + 0.5 - c.y, g.x + 0.5 - c.x) * 180) / Math.PI;
  return (
    <span aria-hidden className="absolute left-1/2 top-1/2 z-10" style={{ transform: `translate(-50%, -50%) rotate(${deg}deg) translateX(${size * 0.75}px)` }} data-testid={`glint-turn-${c.id}`}>
      <svg viewBox="0 0 10 10" width={Math.max(8, size * 0.35)} height={Math.max(8, size * 0.35)}>
        <path d="M1 1 L9 5 L1 9 Z" fill="var(--color-g-crystite)" stroke="var(--color-void)" strokeWidth={0.8} />
      </svg>
    </span>
  );
}

/** Inside the store you cannot see the map: a strip says a glint is lit outside, where and for how long. */
export function GlintStrip({ drawn, store }: { drawn: DrawnMoments | null; store: { x: number } }) {
  const g = drawn?.glint;
  if (!g) return null;
  const door = g.x < store.x + 0.5 ? 'left' : 'right';
  return (
    <span className="pointer-events-none absolute inset-x-2 top-2 z-20 truncate rounded-chip border border-g-crystite bg-panel/95 px-2 py-0.5 text-center font-mono text-xs font-bold text-ink shadow-chip" data-testid="glint-strip">
      GLINT outside at {plotLabel(g)} · the {door} door · {Math.ceil(glintLeft(g, drawn.tick))} s
    </span>
  );
}

// --- The scramble -------------------------------------------------------------------------------------------------

const mules = (n: number) => `${n} MULE${n === 1 ? '' : 's'}`;
const running = (s: FrameScramble | null | undefined): s is FrameScramble => !!s && !s.over;

/** The call, in the words of the scramble's beat. */
export const scrambleCall = (n: number) => `${mules(n)} left! Race to the corral`;

/** Who still races for the corral: those who needed a MULE when it began, with none on the lead and still developing. */
export function stillNeeding(s: FrameScramble | null | undefined, colonists: ArcadeColonist[]): string[] {
  if (!running(s)) return [];
  return s.needers.filter((id) => {
    const c = colonists.find((k) => k.id === id);
    return !!c && !s.got.includes(id) && !c.lead && !c.done;
  });
}

/** The corral during the scramble, on every view of the hall: it pulses and says how many are left. */
export function ScrambleCorral({ scramble, left }: { scramble: FrameScramble | null | undefined; left: number }) {
  if (!running(scramble)) return null;
  const r = boxOf('corral');
  return (
    <span
      className="pointer-events-none absolute z-[6] rounded-panel border-[3px] border-alert shadow-glow-alert animate-[store-beckon_1s_ease-in-out_infinite]"
      style={{ left: pct(r.x0, HALL.w), top: pct(r.y0, HALL.h), width: pct(r.x1 - r.x0, HALL.w), height: pct(r.y1 - r.y0, HALL.h) }}
      data-testid="scramble-corral"
      data-left={left}
    >
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-alert px-2 font-mono text-xs font-bold leading-5 text-white shadow-chip">{left} LEFT</span>
    </span>
  );
}

/** The TV's lines from everyone still racing for a MULE: to the store on the map, to the corral in the hall. */
export function ScrambleLines({ drawn, colonists, view, space }: { drawn: DrawnMoments | null; colonists: ArcadeColonist[]; view: Pick<MuleView, 'width' | 'height' | 'tiles'>; space: 'map' | 'hall' }) {
  const ids = stillNeeding(drawn?.scramble, colonists);
  if (ids.length === 0) return null;
  const W = space === 'map' ? view.width : HALL.w;
  const H = space === 'map' ? view.height : HALL.h;
  const store = view.tiles.find((t) => t.terrain === 'store')!;
  const r = boxOf('corral');
  const to = space === 'map' ? { x: store.x + 0.5, y: store.y + 0.5 } : { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  return (
    <svg className="pointer-events-none absolute inset-0 z-[6] h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden data-testid={`scramble-lines-${space}`}>
      {colonists
        .filter((c) => ids.includes(c.id) && c.space === space)
        .map((c) => (
          <line key={c.id} x1={c.x} y1={c.y} x2={to.x} y2={to.y} stroke="var(--color-alert)" strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" opacity={0.85} data-who={c.id} />
        ))}
    </svg>
  );
}

/** Your screen's scramble line: the call while it runs, then how it ended for you; null when it says nothing to you. */
export function scrambleWords(seat: ArcadeSeat, s: FrameScramble): { text: string; tone: 'alert' | 'ok' | 'warn' } | null {
  const id = seat.me.id;
  const n = seat.view.storeMules;
  const mine = s.got.includes(id);
  if (!s.over) {
    if (mine) return { text: `You got one! ${n} left for the others`, tone: 'ok' };
    if (s.needers.includes(id) && !seat.me.carriedMule && !seat.self.doneDeveloping) return { text: scrambleCall(n), tone: 'alert' };
    return { text: `${mules(n)} left: the others race for them`, tone: 'warn' };
  }
  if (mine) return { text: 'You got one in the scramble', tone: 'ok' };
  // Run out of time with MULEs still in the corral, the one left out can still buy one: the scramble's own words.
  if (s.leftOut.includes(id) && n > 0) return { text: `The scramble is over: ${mules(n)} left`, tone: 'warn' };
  // Left out is no MULE this turn, nothing worse: the pub pays for the time left.
  if (s.leftOut.includes(id)) return { text: `The corral is empty: no MULE for you this turn. The pub pays +${seat.pay} cr now, less the longer you wait.`, tone: 'warn' };
  if (s.over === 'empty') return { text: 'The corral is empty', tone: 'warn' };
  return null;
}

/** The banner: `at` places it in a box of its own; otherwise along the stage's bottom edge. `faded` while you walk under it. */
export function ScrambleBanner({ seat, scramble, at, faded = false }: { seat: ArcadeSeat; scramble: FrameScramble | null | undefined; at?: CSSProperties; faded?: boolean }) {
  const said = scramble ? scrambleWords(seat, scramble) : null;
  if (!said) return null;
  return (
    <span
      className={cx(
        'pointer-events-none z-20 rounded-chip border-2 bg-panel/95 px-2 py-1 text-center font-display text-sm font-bold leading-tight shadow-chip transition-opacity duration-200',
        at ? 'relative' : 'absolute inset-x-2 bottom-2',
        faded && 'opacity-25',
        said.tone === 'alert' ? 'border-alert text-alert' : said.tone === 'ok' ? 'border-ok text-ok' : 'border-warn text-warn',
      )}
      data-testid="scramble-banner"
      data-tone={said.tone}
      data-faded={faded || undefined}
      style={at}
    >
      {said.text}
    </span>
  );
}

// --- Every walker's marks -----------------------------------------------------------------------------------------

/** What each colonist carries with it on a map: the wolves' callout, its bite and pelts, and on the TV its turn to the glint. */
export function walkerMarks({ drawn, colonists, density, own, names, size, strike }: { drawn: DrawnMoments | null; colonists: ArcadeColonist[]; density: Density; own: string | null; names: boolean; size: number; strike?: boolean }) {
  return (w: LiveWalker): WalkerMarks | null => {
    const c = colonists.find((k) => k.id === w.id);
    if (!c) return null;
    return {
      above: <WolfCallout c={c} drawn={drawn} density={density} mine={c.id === own} {...(c.id === own && strike !== undefined ? { strike } : {})} />,
      shoulder: names ? <GlintTurn drawn={drawn} c={c} size={size} /> : null,
      below: <WolfMarks c={c} density={density} />,
    };
  };
}

/** The colonists as a space draws them: a MULE that bolted runs loose, drawn by the wolves' layer, not on its lead. */
export function offTheLead<C extends ArcadeColonist>(colonists: C[], drawn: DrawnMoments | null): C[] {
  const bolted = drawn?.bolted ?? [];
  return bolted.length === 0 ? colonists : colonists.map((c) => (bolted.includes(c.id) ? { ...c, lead: null } : c));
}

// --- The TV's lines -----------------------------------------------------------------------------------------------

export interface TvLine {
  key: string;
  text: string;
  tone: 'alert' | 'ok' | 'warn' | 'glint';
}

/**
 * The TV's lines along the map, most pressing first: the scramble's call while it runs, the glint while lit, one line
 * per colonist meeting wolves now (its stage from the frames), then the frames' newest beats not already said by those.
 */
export function tvLines({ drawn, colonists, beats, mulesLeft }: { drawn: DrawnMoments | null; colonists: ArcadeColonist[]; beats: readonly string[]; mulesLeft: number }): TvLine[] {
  const meeting = colonists.filter((c) => c.encounter);
  return withBeats([
    ...(drawn && running(drawn.scramble) ? [{ key: 'scramble', text: scrambleCall(mulesLeft), tone: 'alert' as const }] : []),
    ...(drawn?.glint ? [{ key: 'glint', text: `A Crystite glint at ${plotLabel(drawn.glint)}! First there wins · ${Math.ceil(glintLeft(drawn.glint, drawn.tick))} s`, tone: 'glint' as const }] : []),
    ...meeting.map((c) => {
      const k = drawn?.packs.find((p) => p.who === c.id);
      const text =
        c.encounter === 'choose'
          ? `Wolves! ${c.name}: run or fight?`
          : c.encounter === 'chase'
            ? `${c.name} runs from the wolves!`
            : `${c.name} fights the wolves${k && k.stage === 'fight' ? ` · ${k.strikes}/${WOLVES.strikesToWin} strikes · ${k.bites}/${WOLVES.bitesToLose} bites` : ''}`;
      return { key: `live-${c.id}`, text, tone: c.encounter === 'fight' ? ('warn' as const) : ('alert' as const) };
    }),
  ], beats);
}

/** The lines, then the frames' three newest beats that none of them already says (a live line starts with its beat). */
function withBeats(lines: TvLine[], beats: readonly string[]): TvLine[] {
  const fresh = beats.filter((b) => !lines.some((l) => l.text.startsWith(b)));
  return [...lines, ...fresh.slice(-3).map((b) => ({ key: `beat-${b}`, text: b, tone: 'warn' as const }))];
}

/** One TV line's height and the gap between two, in px: text-xl in its padded, bordered panel. */
export const TV_LINE = { h: 44, gap: 6, inset: 12 } as const;

/**
 * Where the TV's lines go on a map `mapW` wide, and how many fit there clear of the store: along the map's foot below
 * the store's row, or, with the store too low for one line, along its top above it.
 */
export function tvLinesPlace(view: Pick<MuleView, 'width' | 'height' | 'tiles'>, mapW: number): { edge: 'bottom' | 'top'; most: number } {
  const cell = mapW / view.width;
  const store = view.tiles.find((t) => t.terrain === 'store')!;
  const fit = (px: number) => Math.max(0, Math.floor((px - TV_LINE.inset + TV_LINE.gap) / (TV_LINE.h + TV_LINE.gap)));
  const below = fit((view.height - store.y - 1) * cell);
  return below >= 1 ? { edge: 'bottom', most: below } : { edge: 'top', most: fit(store.y * cell) };
}
