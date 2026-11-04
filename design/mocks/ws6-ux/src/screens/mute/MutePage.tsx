import type { ReactNode } from 'react';
import { Board, Game, LaptopFrame, TvFrame, useHash } from '../../harness';
import { IntentNotes, IntentNotesProvider } from '../../proposed/IntentNote';
import { HOST_ID, ME_ID, MUTE_STATES, MUTE_VIEW, type MuteState } from './fixture';
import { MutePhone, MuteTv } from './MuteScreen';
import { MUTE_NOTES } from './notes';
import { MuteProvider } from './parts';

/** The product's short screen (`short:`, max-height 380 px): the frame says so itself, as on grant.html. */
const SHORT_PX = 380;

/**
 * A phone held sideways at its own size, as grant.html draws it: the rail is the app's `--rail: clamp(232px, 31vw,
 * 300px)` read against the frame, 232 px at 667 and 261.6 px at 844.
 */
function Phone({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div
        className="overflow-hidden rounded-sheet border border-holo-line shadow-map [--rail:clamp(232px,31cqw,300px)]"
        style={{ width: w, height: h }}
        data-testid="phone-frame"
        data-phone={w}
        {...(h <= SHORT_PX ? { 'data-short': '' } : {})}
      >
        {children}
      </div>
    </div>
  );
}

function Caption({ children, alt }: { children: ReactNode; alt?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-mono text-xs text-ink-3">
      {alt && (
        <span className="rounded-chip border border-warn/60 px-1.5 font-bold text-warn" data-testid="alt-label">
          ALTERNATIVE, FOR HEIKO
        </span>
      )}
      {children}
    </span>
  );
}

const HeikosPhone = ({ children }: { children: ReactNode }) => (
  <Game view={MUTE_VIEW} seat={ME_ID} hostId={HOST_ID}>
    {children}
  </Game>
);

function Frames({ state }: { state: MuteState }) {
  const alt = !!state.tvHides;
  return (
    <MuteProvider state={state}>
      <IntentNotesProvider>
        <div className="flex flex-col gap-6" data-state={state.id} data-testid="frames">
          <div className="flex flex-wrap items-start gap-6">
            {[
              { w: 844, h: 390 },
              { w: 667, h: 375 },
            ].map(({ w, h }) => (
              <div key={w} className="flex min-w-0 flex-col gap-1.5">
                <Caption>Heiko’s phone, sideways · {w} × {h}</Caption>
                <Phone w={w} h={h}>
                  <HeikosPhone>
                    <MutePhone />
                  </HeikosPhone>
                </Phone>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Caption alt={alt}>
                The TV, same moment · 1280 × 720 (scaled) ·{' '}
                {alt ? 'the host’s mute hides The Baron here too' : 'default: unchanged by any phone’s mute'}
              </Caption>
              <TvFrame>
                <Board view={MUTE_VIEW}>
                  <MuteTv />
                </Board>
              </TvFrame>
            </div>
            <IntentNotes
              className="w-[440px] max-w-full"
              title="Six changes, and why"
              intro="One card per change; hover one and its number lights up on the frames. Every switch on this page is live: tap The Baron’s seat, or Mute in its channel, and every frame follows."
              notes={Object.values(MUTE_NOTES)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Caption>Heiko on a laptop · 1440 × 900 (scaled): the same switch on the same seat</Caption>
            <LaptopFrame>
              <HeikosPhone>
                <MutePhone />
              </HeikosPhone>
            </LaptopFrame>
          </div>
        </div>
      </IntentNotesProvider>
    </MuteProvider>
  );
}

export function MutePage() {
  const hash = useHash();
  const state = MUTE_STATES.find((s) => s.id === hash) ?? MUTE_STATES[0]!;
  return (
    <div className="min-h-full bg-table p-8 text-ink">
      <h1 className="font-display text-2xl font-semibold">For approval · Mute an AI on your phone</h1>
      <p className="mt-1 max-w-[900px] text-sm text-ink-2">
        Spec B (AI table talk), HC-B2, approved by Heiko: on your phone, one tap mutes or unmutes an AI seat, in any phase, for the rest of the game. Muted, it stops whispering to you, its
        unprompted public lines leave your phone and it offers you no cards. Its play, the TV and everyone else’s phone stay as they are. Month 5, planning; Heiko holds this phone and hosts the
        table; The Baron and Kai are AIs, Brix is human.
      </p>
      <nav className="mb-4 mt-3 flex flex-wrap gap-2" aria-label="States" data-testid="states">
        {MUTE_STATES.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`rounded-chip border px-2.5 py-1 text-sm ${s.id === state.id ? 'border-holo bg-holo-soft text-ink' : s.tvHides ? 'border-warn/60 text-warn hover:border-warn' : 'border-holo-faint text-holo hover:border-holo'}`}
            aria-current={s.id === state.id ? 'page' : undefined}
            data-testid={`tab-${s.id}`}
          >
            {i + 1}. {s.title}
          </a>
        ))}
      </nav>
      <Frames key={state.id} state={state} />
    </div>
  );
}
