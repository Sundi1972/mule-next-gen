import { useMemo, type ReactNode } from 'react';
import { LaptopFrame, useHash } from '../../harness';
import { IntentNotes, IntentNotesProvider } from '../../proposed/IntentNote';
import { GRANT_STATES, grantView, type GrantState } from './fixture';
import { GrantGame, GrantScreen } from './GrantScreen';
import { GRANT_NOTES } from './notes';

/** The product's short screen (`short:`, max-height 380 px): the frame says so itself, see GrantShell. */
const SHORT_PX = 380;

/**
 * A phone held sideways at its own size. The rail is the app's `--rail: clamp(232px, 31vw, 300px)`, read against the
 * frame (31cqw of the shell) as the phone itself would read it against its window: 232 px at 667, 261.6 px at 844.
 * (The harness's 844 frame keeps the 300 px rail the earlier mocks were approved at; a real 844 phone has 261.6.)
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

function Caption({ size, today }: { size: string; today: boolean }) {
  return (
    <span className="flex items-center gap-2 font-mono text-xs text-ink-3">
      {today && (
        <span className="rounded-chip border border-warn/60 px-1.5 font-bold text-warn" data-testid="today-label">
          TODAY
        </span>
      )}
      {size}
    </span>
  );
}

function Frames({ state }: { state: GrantState }) {
  const view = useMemo(() => grantView(state), [state]);
  const today = !!state.today;
  return (
    <IntentNotesProvider>
      <div className="flex flex-wrap items-start gap-6" data-state={state.id} data-testid="frames">
        {[
          { w: 844, h: 390 },
          { w: 667, h: 375 },
        ].map(({ w, h }) => (
          <div key={w} className="flex min-w-0 flex-col gap-1.5">
            <Caption size={`Phone sideways · ${w} × ${h}`} today={today} />
            <Phone w={w} h={h}>
              <GrantGame view={view}>
                <GrantScreen key={state.id} today={today} />
              </GrantGame>
            </Phone>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Caption size="Laptop · 1440 × 900 (scaled): from 1100 px the footer stays as it is today" today={today} />
          <LaptopFrame>
            <GrantGame view={view}>
              <GrantScreen key={state.id} today={today} marks={false} />
            </GrantGame>
          </LaptopFrame>
        </div>
        <IntentNotes
          className="w-[440px] max-w-full"
          title={today ? 'Today, for comparison' : 'Four changes, and why'}
          intro={
            today
              ? 'The footer as LandGrant.tsx draws it now. Open a compact state above to see the numbered changes; the notes say which intent each serves and why.'
              : 'One card per change; hover one and its number lights up on the phones. The laptop keeps today’s footer, so it carries no numbers.'
          }
          notes={Object.values(GRANT_NOTES)}
        />
      </div>
    </IntentNotesProvider>
  );
}

export function GrantPage() {
  const hash = useHash();
  const state = GRANT_STATES.find((s) => s.id === hash) ?? GRANT_STATES[1]!;
  return (
    <div className="min-h-full bg-table p-8 text-ink">
      <h1 className="font-display text-2xl font-semibold">For approval · Land grant · a compact footer</h1>
      <p className="mt-1 max-w-[900px] text-sm text-ink-2">
        On a phone the rail window that shows the lit plot was 20 px. The PM ruled option 1 on Heiko’s placement: CLAIM and Ready side by side, Waiting for on one line, all three kept, the shell header and the chat untouched. Month 5, Heiko holds this phone; Plains 4·1 is lit and his drone looked under it.
      </p>
      <nav className="mb-4 mt-3 flex flex-wrap gap-2" aria-label="States" data-testid="states">
        {GRANT_STATES.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`rounded-chip border px-2.5 py-1 text-sm ${s.id === state.id ? 'border-holo bg-holo-soft text-ink' : 'border-holo-faint text-holo hover:border-holo'}`}
            aria-current={s.id === state.id ? 'page' : undefined}
            data-testid={`tab-${s.id}`}
          >
            {i + 1}. {s.title}
          </a>
        ))}
      </nav>
      <div className="flex flex-col gap-6">
        <Frames key={state.id} state={state} />
      </div>
    </div>
  );
}
