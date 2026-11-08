import { Button, cx } from '@mule/ui';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { mockTable, SEAT_LABEL, type MockTable, type Seat } from './fixture';
import { MEASURED } from './measured';
import { PhoneBody } from './PhoneBody';
import type { ShellVariant } from './proposed/Shell';
import { SHERIFF_BEATS, SHERIFF_STEPS, sheriffBeatOf } from './sheriff-path';
import { BEATS, beatOf, STEPS, type Beat } from './steps';
import { TV_NOTE, TvFor, type TvFocus } from './tv/TvFor';

/*
 * The guided prototype: one planning month, played through. A step list to jump, "Next" to go on, and the controls
 * Heiko asked for: whose phone ("Playing as"), where the tabs sit (left column A or bottom bar B), the phone's size,
 * and phone, TV or both. Every setting is in the URL, so a link shows exactly this.
 */

const Q = new URLSearchParams(location.search);
type Show = 'both' | 'phone' | 'tv';

/** The guided paths: the planning month (the landing page), and the Sheriff month (?path=sheriff, Heiko's add-on, 8 Nov). */
const PATHS = {
  planning: { title: 'One planning month, played through', steps: STEPS, beats: BEATS, beatOf, other: { href: '?path=sheriff', words: 'The Sheriff’s month →' } },
  sheriff: { title: 'The Sheriff’s month: a guard, a cut, a fine', steps: SHERIFF_STEPS, beats: SHERIFF_BEATS, beatOf: sheriffBeatOf, other: { href: '?', words: '← The planning month' } },
};
const PATH = PATHS[Q.get('path') === 'sheriff' ? 'sheriff' : 'planning'];
/** A focus mock-hub-tv has built carries a TV_NOTE line. */
const built = (f: string | undefined): f is TvFocus => !!f && f in TV_NOTE;

/** The two phones, held sideways: the device's screen, the only raw sizes in the mock. */
const PHONES: Record<string, [number, number]> = { '667': [667, 375], '844': [844, 390] };
const railOf = (w: number) => Math.min(300, Math.max(232, Math.round(w * 0.31)));
/** The TV is drawn at 1280 × 720 and shown at half size beside the phone. */
const TV_SCALE = 0.5;

function link(over: Record<string, string | null>): string {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(over)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  return `?${q.toString()}`;
}

/** A segmented control of links: each sets one URL parameter. */
function Choice({ label, param, value, options, testid }: { label: string; param: string; value: string; options: [string, ReactNode][]; testid: string }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label} data-testid={testid}>
      <span className="label-caps text-[10px]!">{label}</span>
      <span className="flex rounded-control border border-holo-line p-0.5">
        {options.map(([v, words]) => (
          <a
            key={v}
            href={link({ [param]: v })}
            aria-current={v === value ? 'true' : undefined}
            className={cx('flex h-8 items-center whitespace-nowrap rounded-control px-2.5 text-xs font-semibold', v === value ? 'bg-holo-soft text-holo' : 'text-ink-2 hover:text-ink')}
            data-testid={`${testid}-${v}`}
          >
            {words}
          </a>
        ))}
      </span>
    </div>
  );
}

function Phone({ store, beat, seat, variant, size }: { store: MockTable; beat: Beat; seat: Seat; variant: ShellVariant; size: string }) {
  const [w, h] = PHONES[size] ?? PHONES['667']!;
  return (
    <figure className="flex flex-col gap-1" data-testid="phone-pane">
      <figcaption className="flex gap-2 text-xs text-ink-2">
        <span className="label-caps text-[10px]!">{SEAT_LABEL[seat]}’s phone</span>
        <span className="font-mono">
          {w} × {h}
        </span>
      </figcaption>
      <div className="relative overflow-hidden rounded-panel border border-holo-line bg-void" style={{ width: w, height: h, ['--rail' as string]: `${railOf(w)}px` }} data-testid="phone-frame">
        <PhoneBody store={store} seat={seat} variant={variant} start={beat.start} budget={beat.budget} monthEnd={beat.monthEnd} />
      </div>
    </figure>
  );
}

function Tv({ store, beat }: { store: MockTable; beat: Beat }) {
  const world = useSyncExternalStore(store.subscribe, store.get);
  const focus = built(beat.tvWanted) ? beat.tvWanted : beat.tv;
  const pending = beat.tvWanted && !built(beat.tvWanted) ? beat.tvWanted : null;
  return (
    <figure className="flex flex-col gap-1" data-testid="tv-pane">
      <figcaption className="flex gap-2 text-xs text-ink-2">
        <span className="label-caps text-[10px]!">The TV</span>
        <span className="font-mono">1280 × 720 at ½ · {focus}</span>
        {pending && (
          <span className="text-warn" data-testid="tv-pending">
            “{pending}” is mock-hub-tv’s to build; the TV shows {beat.tv} meanwhile.
          </span>
        )}
      </figcaption>
      {/* The TV's screen at half size: the frame is the scaled box, the TV draws at its own size inside it. */}
      <div className="overflow-hidden rounded-panel border border-holo-line bg-void" style={{ width: 1280 * TV_SCALE, height: 720 * TV_SCALE }} data-testid="tv-frame">
        <div className="origin-top-left" style={{ width: 1280, height: 720, transform: `scale(${TV_SCALE})` }}>
          <TvFor world={world} focus={focus} />
        </div>
      </div>
    </figure>
  );
}

export function Prototype() {
  const beat = PATH.beatOf(Q.get('beat'));
  const BEATS = PATH.beats;
  const STEPS = PATH.steps;
  const as = Q.get('as') as Seat | null;
  const seat: Seat = as && as in SEAT_LABEL ? as : beat.seat;
  const variant: ShellVariant = Q.get('tabs') === 'bottom' ? 'b' : 'a';
  const size = Q.get('w') === '844' ? '844' : '667';
  const show: Show = Q.get('show') === 'phone' ? 'phone' : Q.get('show') === 'tv' ? 'tv' : 'both';
  // One table per beat, shared by the phone and the TV: a tap on the phone moves the TV as the server would.
  const store = useMemo(() => mockTable(beat.world()), [beat]);
  const i = BEATS.indexOf(beat);
  const next = BEATS[i + 1];
  const prev = BEATS[i - 1];
  const m667 = MEASURED[0]!;
  return (
    <main className="flex min-h-dvh flex-col gap-4 bg-table p-5 text-ink" data-testid="prototype" data-beat={beat.id}>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col">
          <h1 className="flex items-baseline gap-3 font-display text-xl font-semibold">
            {PATH.title}
            <a className="font-sans text-sm font-semibold text-holo underline" href={PATH.other.href} data-testid="other-path">
              {PATH.other.words}
            </a>
          </h1>
          <p className="text-xs text-ink-2" data-testid="height-line">
            Landscape only, so height is the scarce side: a bottom tab bar spends 44 of 375 px. The map at 667: today {m667.today.w}×{m667.today.h} · left column {m667.a.w}×{m667.a.h} · bottom bar {m667.b.w}×{m667.b.h}.{' '}
            <a className="text-holo underline" href="?notes=1" data-testid="notes-link">
              Design notes
            </a>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="controls">
          <Choice label="Playing as" param="as" value={seat} options={[['brix', 'Brix · Governor'], ['lena', 'Lena'], ['kai', 'Kai · Sheriff']]} testid="as" />
          <Choice label="Tabs" param="tabs" value={variant === 'b' ? 'bottom' : 'left'} options={[['left', 'A · left column'], ['bottom', 'B · bottom bar']]} testid="tabs" />
          <Choice label="Phone" param="w" value={size} options={[['667', '667'], ['844', '844']]} testid="size" />
          <Choice label="Show" param="show" value={show} options={[['both', 'Phone + TV'], ['phone', 'Phone'], ['tv', 'TV']]} testid="show" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-5">
        <nav aria-label="Steps" className="flex w-60 shrink-0 flex-col gap-2" data-testid="steps">
          {STEPS.map((s) => (
            <section key={s.n} className="flex flex-col gap-0.5" data-testid={`step-${s.n}`}>
              <span className={cx('text-xs font-semibold', beat.step === s.n ? 'text-holo' : 'text-ink-2')}>
                {s.n}. {s.title}
              </span>
              {BEATS.filter((b) => b.step === s.n).map((b) => (
                <a
                  key={b.id}
                  href={link({ beat: b.id, as: null })}
                  aria-current={b.id === beat.id ? 'step' : undefined}
                  className={cx('flex min-h-7 items-center rounded-control px-2 text-xs', b.id === beat.id ? 'bg-holo-soft font-semibold text-ink ring-1 ring-holo' : 'text-ink-2 hover:text-ink')}
                  data-testid={`beat-${b.id}`}
                >
                  {b.label}
                </a>
              ))}
            </section>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start gap-3 rounded-panel border border-holo-line bg-panel p-3" data-testid="beat-line">
            <span className="font-mono text-sm text-holo">
              {beat.step}.{BEATS.filter((b) => b.step === beat.step).indexOf(beat) + 1}
            </span>
            <p className="min-w-0 flex-1 text-sm">{beat.line}</p>
            {prev && (
              <Button size="md" variant="ghost" onClick={() => location.assign(link({ beat: prev.id, as: null }))} data-testid="prev">
                Back
              </Button>
            )}
            {next && (
              <Button size="md" onClick={() => location.assign(link({ beat: next.id, as: null }))} data-testid="next">
                Next step
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-5">
            {show !== 'tv' && <Phone key={`${beat.id}-${seat}-${variant}-${size}`} store={store} beat={beat} seat={seat} variant={variant} size={size} />}
            {show !== 'phone' && <Tv store={store} beat={beat} />}
          </div>
        </div>
      </div>
    </main>
  );
}
