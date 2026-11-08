import type { MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { ClientProvider } from '../../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../../apps/web/src/phone/game';
import { ElectionDay, ElectionDayRail } from '../../../../../apps/web/src/phone/hub/politics/ElectionDay';
import { TodayState } from '../../../../../apps/web/src/phone/hub/state';
import { clientFor, viewFor } from '../fixture';

/**
 * P9: election day with the Sheriff, as built: the real ElectionDay draws one column per office in POLITICS.offices,
 * so the Sheriff's row is the config flip (slice4-config.ts) plus the Offices card's Sheriff line (proposed below).
 * P11: the sabotage ban, the fifth law: its words in the Governor's law list and on the council ballot (proposed).
 */

type Stage = 'announce' | 'ballot';

function withElection(view: MuleView, stage: Stage): MuleView {
  const p = view.politics!;
  return {
    ...view,
    month: 4,
    politics: {
      ...p,
      candidates: { governor: ['ossa', 'brix'], sheriff: ['kai', 'lena'] },
      election: {
        stage, ceremony: null, promises: {}, voted: [], done: [], waitingFor: ['lena', 'brix'], result: {},
        candidates: stage === 'ballot' ? { governor: ['ossa', 'brix'], sheriff: ['kai', 'lena'] } : {},
      },
    },
  };
}

function Phone({ stage }: { stage: Stage }) {
  const base = viewFor('lena');
  const view = withElection(base.view, stage);
  const me = { ...base.me, politics: { ...base.me.politics!, canRun: { governor: true as const, sheriff: true as const }, ballot: {} } };
  return (
    <ClientProvider client={clientFor('lena')}>
      <PhoneGameProvider value={{ ...base, view: { ...view, me }, me }}>
        <TodayState>
          {/* The phone held sideways, 667 × 375: a device's screen, not a design value. */}
          <div className="@container/shell flex flex-col gap-2 overflow-y-auto rounded-panel border border-holo-line bg-void p-2.5 text-ink" style={{ width: 667, height: 375 }} data-testid={`p9-${stage}`}>
            <ElectionDay />
            <ElectionDayRail />
          </div>
        </TodayState>
      </PhoneGameProvider>
    </ClientProvider>
  );
}

/** PROPOSED: the Offices card ("What the Governor does", parts.tsx::OfficesCard) with the Sheriff's line. */
function OfficesCardWithSheriff() {
  return (
    <section className="flex max-w-md flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2" data-testid="p9-offices-card">
      <span className="label-caps text-[10px]!">What the offices do</span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs leading-snug">
        <dt className="font-semibold">Governor</dt>
        <dd>Sets the sales tax each month; the tax fills the colony fund. Paid 50 cr a month.</dd>
        <dt className="font-semibold">Sheriff</dt>
        <dd data-testid="p9-job-sheriff">Posts 2 secret guards a month, investigates one sabotage, and fines the culprits. Paid 30 cr a month.</dd>
      </dl>
      <span className="text-[11px] text-ink-2">Nobody holds both. A term lasts until the next election and adds to your final score.</span>
    </section>
  );
}

/** PROPOSED (P11): the ban's row as the law list draws a law, and its ballot line. */
function BanRows() {
  const [setting, setSetting] = useState(2);
  return (
    <div className="flex max-w-md flex-col gap-2" data-testid="p11">
      <div className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2" data-testid="p11-law-row">
        <span className="text-sm font-semibold">Sabotage ban</span>
        <span className="text-xs text-ink-2" data-testid="p11-meaning">A caught saboteur’s fine and reputation loss are multiplied: ×2 or ×3.</span>
        <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Setting">
          {[2, 3].map((s) => (
            <button key={s} type="button" role="radio" aria-checked={setting === s} onClick={() => setSetting(s)} data-testid={`p11-setting-${s}`}
              className={cx('min-h-11 rounded-control border text-sm font-semibold', setting === s ? 'border-holo bg-holo-soft' : 'border-holo-line text-ink-2')}>
              ×{s}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-ink-3" data-testid="p11-effect">
          At ×{setting}: a fine of 100 becomes {100 * setting} cr; caught costs −{10 * setting} reputation (−{30 * setting} under a pact).
        </span>
      </div>
      <div className="rounded-panel border border-holo-line bg-panel p-2 text-sm" data-testid="p11-ballot-line">
        <span className="label-caps text-[10px]!">The council votes on</span>
        <p className="font-semibold">Sabotage ban ×{setting}</p>
        <p className="text-xs text-ink-2">Chip in the laws in force: “Sabotage ban ×{setting}”.</p>
      </div>
    </div>
  );
}

const BUILD_EDITS = [
  'engine config.ts: POLITICS.offices gains \'sheriff\' (the screen PR flips it, WS7’s branch notes this).',
  'hub/politics/LawPicker.tsx (WS7): settingWords and chipWords: case \'sabotageBan\' → `×${s}`; LAW_MEANING.sabotageBan as above.',
  'engine politics.ts LAW_NAME: sabotageBan: \'Sabotage ban\' (WS7’s branch).',
  'hub/politics/parts.tsx OfficesCard (WS7): “What the offices do”, with the Sheriff’s line.',
];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function P9P11Page() {
  return (
    <div className="flex flex-col gap-6" data-testid="p9p11">
      <Block title="P9 · election day, the Sheriff beside the Governor (the real ElectionDay)">
        <div className="flex flex-wrap items-start gap-4">
          <Phone stage="announce" />
          <Phone stage="ballot" />
        </div>
        <OfficesCardWithSheriff />
      </Block>
      <Block title="P11 · the sabotage ban, the fifth law (proposed words)">
        <BanRows />
      </Block>
      <Block title="What the build edits">
        <ul className="flex max-w-3xl list-disc flex-col gap-0.5 pl-5 text-sm" data-testid="p9p11-edits">
          {BUILD_EDITS.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </Block>
    </div>
  );
}
