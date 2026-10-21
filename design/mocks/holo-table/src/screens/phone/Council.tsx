import { Button, cx, Panel, PlayerMark, type Slot } from '@mule/ui';
import { useState } from 'react';
import { seat, SEATS } from '../../data';

type Role = 'governor' | 'sheriff' | 'citizen';
type Line = 'reserve' | 'security' | 'environment' | 'welfare' | 'projects';

const LINES: { id: Line; name: string; effect: (cr: number) => string }[] = [
  { id: 'reserve', name: 'Reserve', effect: (cr) => (cr ? `Store can import ${Math.floor(cr / 20)} units of a short good` : 'No emergency imports') },
  { id: 'security', name: 'Security', effect: (cr) => `${1 + Math.floor(cr / 100)} guarded plots, detection +${Math.floor(cr / 10)}%${cr >= 200 ? ', pirates blocked' : ''}` },
  { id: 'environment', name: 'Environment', effect: (cr) => (cr ? `Air −${Math.floor(cr / 25)}, cleans ${Math.floor(cr / 100)} plot${cr >= 200 ? 's' : ''}` : 'No cleanup squads') },
  { id: 'welfare', name: 'Welfare', effect: (cr) => (cr ? `${cr} cr to Jonas (last place)` : 'No help for last place') },
  { id: 'projects', name: 'Projects', effect: (cr) => `Saved toward the air purifier tower: ${420 + cr} of 700` },
];

const FUND = 1180;
const GOVERNOR: Slot = 0;
const SHERIFF: Slot = 2;
const BARON: Slot = 1;

/** Votes each seat carries this month, from land, reputation, titles and taxes paid. */
const WEIGHT: Record<Slot, number> = { 0: 2, 1: 3, 2: 1, 3: 2, 4: 1, 5: 2 };
const LEANS: Record<Slot, 'yes' | 'no' | null> = { 0: null, 1: 'yes', 2: 'yes', 3: 'no', 4: 'yes', 5: 'no' };

/** The council on the phone: who holds which office, the budget, the tax and this month's law vote. */
export function Council() {
  const [role, setRole] = useState<Role>('governor');
  const [tax, setTax] = useState(5);
  const [budget, setBudget] = useState<Record<Line, number>>({ reserve: 100, security: 200, environment: 200, welfare: 0, projects: 100 });
  const [vote, setVote] = useState<'yes' | 'no' | null>(null);
  const spent = Object.values(budget).reduce((a, b) => a + b, 0);
  const income = 180 + tax * 40;
  const available = 640 + (tax - 5) * 40;

  const ballots = SEATS.map((s) => ({ slot: s.slot, w: WEIGHT[s.slot], v: s.slot === 0 ? vote : LEANS[s.slot] }));
  const yes = ballots.filter((b) => b.v === 'yes').reduce((a, b) => a + b.w, 0);
  const no = ballots.filter((b) => b.v === 'no').reduce((a, b) => a + b.w, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-1 rounded-control border border-holo-faint bg-raised p-1 text-xs">
        {(['governor', 'sheriff', 'citizen'] as const).map((r) => (
          <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)} className={cx('h-8 rounded-[6px] font-semibold', role === r ? 'bg-panel text-ink shadow-chip' : 'text-ink-3')}>
            {r === 'governor' ? 'As Governor' : r === 'sheriff' ? 'As Sheriff' : 'As citizen'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { title: 'Governor', slot: GOVERNOR, note: 'Term 2 of 4' },
          { title: 'Sheriff', slot: SHERIFF, note: 'Term 2 of 4' },
          { title: 'Land Baron', slot: BARON, note: 'Most plots' },
        ].map((o) => (
          <div key={o.title} className="flex flex-col items-center gap-1 rounded-control border border-holo-faint bg-panel px-2 py-2.5">
            <PlayerMark slot={o.slot} size={30} />
            <span className="label-caps">{o.title}</span>
            <span className="text-sm font-semibold">{seat(o.slot).name}</span>
            <span className="text-[11px] text-ink-3">{o.note}</span>
          </div>
        ))}
      </div>
      <p className="-mt-2 text-center text-xs text-ink-3">Next election in month 7</p>

      {role === 'sheriff' ? (
        <SheriffTools guards={1 + Math.floor(budget.security / 100)} />
      ) : (
        <Panel title="Colony budget" aside={`Fund ${FUND.toLocaleString('en-US')} cr`}>
          <div className="flex items-center justify-between rounded-control bg-raised px-3 py-2">
            <span className="flex flex-col">
              <span className="text-sm font-semibold">Sales tax</span>
              <span className="text-xs text-ink-3">Brings in about {income} cr a month</span>
            </span>
            <span className="flex items-center gap-2">
              {role === 'governor' && (
                <Button size="md" variant="outline" className="w-10" aria-label="Lower tax" disabled={tax <= 0} onClick={() => setTax((t) => Math.max(0, t - 5))}>−</Button>
              )}
              <span data-num className="w-12 text-center font-mono text-xl font-bold">{tax}%</span>
              {role === 'governor' && (
                <Button size="md" variant="outline" className="w-10" aria-label="Raise tax" disabled={tax >= 10} onClick={() => setTax((t) => Math.min(10, t + 5))}>+</Button>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {LINES.map((l) => (
              <label key={l.id} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{l.name}</span>
                  <span data-num className="font-mono text-sm font-bold">{budget[l.id]} cr</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={400}
                  step={50}
                  value={budget[l.id]}
                  disabled={role !== 'governor'}
                  onChange={(e) => setBudget((b) => ({ ...b, [l.id]: Number(e.target.value) }))}
                  className="accent-[var(--color-holo)] disabled:opacity-60"
                />
                <span className={cx('text-xs', l.id === 'environment' ? 'text-ok' : 'text-ink-2')}>{l.effect(budget[l.id])}</span>
              </label>
            ))}
          </div>
          <div className={cx('flex justify-between rounded-control px-3 py-2 font-mono text-sm', spent > available ? 'bg-alert/10 text-alert' : 'bg-raised text-ink-2')}>
            <span>Spending this month</span>
            <span data-num className="font-bold">
              {spent} / {available} cr
            </span>
          </div>
          {spent > available && <p className="text-xs text-alert">Over budget: every line would be cut by the same share.</p>}
          {role === 'governor' ? (
            <p className="text-xs text-ink-3">No vote needed. Anyone can call an overrule vote; a majority undoes your changes.</p>
          ) : (
            <Button size="md" variant="outline">Call an overrule vote</Button>
          )}
        </Panel>
      )}

      <Panel title="This month's law" aside="Proposed by Heiko">
        <span className="font-display text-xl font-semibold">Pollution tax · 20 cr per air point</span>
        <span className="text-sm text-ink-2">
          Polluters pay for the air they foul, into the colony fund. You would pay <strong className="text-ink">0 cr</strong>; Brix about <strong className="text-ink">120 cr</strong> a month.
        </span>
        <div className="grid grid-cols-2 gap-2">
          <Button size="md" variant={vote === 'yes' ? 'holo' : 'outline'} onClick={() => setVote('yes')}>Yes</Button>
          <Button size="md" variant={vote === 'no' ? 'danger' : 'outline'} onClick={() => setVote('no')}>No</Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-raised">
            <span className="bg-ok" style={{ width: `${(yes / 11) * 100}%` }} />
            <span className="ml-auto bg-alert" style={{ width: `${(no / 11) * 100}%` }} />
          </div>
          <div className="flex justify-between font-mono text-xs">
            <span className="text-ok">YES {yes}</span>
            <span className="text-ink-3">11 votes · 6 to pass</span>
            <span className="text-alert">NO {no}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs">
            {ballots.map((b) => (
              <span key={b.slot} className="flex items-center gap-1">
                <PlayerMark slot={b.slot} size={16} glow={false} />
                <span className="text-ink-2">{b.w}</span>
                <span className={cx('font-semibold', b.v === 'yes' ? 'text-ok' : b.v === 'no' ? 'text-alert' : 'text-ink-3')}>{b.v ?? '…'}</span>
              </span>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** What only the Sheriff sees: guards to place, a case to investigate and a player to inspect. */
function SheriffTools({ guards }: { guards: number }) {
  const [guarded, setGuarded] = useState<string[]>(['Mia · Food 8·6']);
  const [inspect, setInspect] = useState<Slot | null>(3);
  return (
    <>
      <Panel title="Guards" aside={`${guarded.length} of ${guards}`}>
        <span className="text-sm text-ink-2">Security pays for {guards} guarded plots. Sabotage there fails and the saboteur is revealed. Guards stay hidden.</span>
        <div className="flex flex-wrap gap-2">
          {['Mia · Food 8·6', 'Brix · Smelter 14·4', 'Ossa · Energy 11·5', 'Heiko · Energy 9·4'].map((p) => {
            const on = guarded.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                disabled={!on && guarded.length >= guards}
                onClick={() => setGuarded((g) => (on ? g.filter((x) => x !== p) : [...g, p]))}
                className={cx('rounded-chip border px-2.5 py-1 text-sm disabled:opacity-40', on ? 'border-holo bg-holo-soft font-semibold' : 'border-holo-faint')}
              >
                {p}
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel title="Investigate" aside="1 a month">
        <span className="text-sm">Lena's Smithore mine was sabotaged in month 3. Investigating reveals the culprit to everyone, and you can fine them 50 to 300 cr.</span>
        <Button size="md">Investigate the sabotage</Button>
      </Panel>
      <Panel title="Inspect a player" aside="Laws in force">
        <span className="text-sm text-ink-2">Checks hoarding limits, green zones and the emission cap, and collects land and pollution tax from them this term.</span>
        <div className="grid grid-cols-6 gap-1">
          {SEATS.filter((s) => s.slot !== SHERIFF).map((s) => (
            <button key={s.slot} type="button" aria-pressed={inspect === s.slot} onClick={() => setInspect(s.slot)} className={cx('flex flex-col items-center rounded-control border py-1.5', inspect === s.slot ? 'border-holo bg-holo-soft' : 'border-holo-faint')}>
              <PlayerMark slot={s.slot} size={22} glow={false} />
              <span className="text-[10px]">{s.name}</span>
            </button>
          ))}
        </div>
        <Button size="md" variant="outline" className="text-sm">Open an inquiry into the Governor · once a term</Button>
      </Panel>
    </>
  );
}
