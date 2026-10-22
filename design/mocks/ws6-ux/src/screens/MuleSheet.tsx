import type { Good } from '@mule/engine';
import { Creature, GOOD_NAME, MuleIcon, SLOT_COLOR, type Slot } from '@mule/ui';
import type { ReactNode } from 'react';
import { Mule, type MuleState } from '../proposed/Mule';

/**
 * The MULE's model sheet: every state, every good, both owner and store, at
 * the sizes the screens use (phone hall ~34 px, TV ~64 px, plot ~26 px) and
 * large, so the drawing can be judged.
 */

const GOODS: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine'];

function Cell({ label, children, testid }: { label: string; children: ReactNode; testid?: string }) {
  return (
    <figure className="flex flex-col items-center gap-2 rounded-panel border border-holo-line bg-panel p-4" data-testid={testid}>
      <div className="grid min-h-[120px] place-items-center">{children}</div>
      <figcaption className="text-center text-sm text-ink-2">{label}</figcaption>
    </figure>
  );
}

export function MuleSheet() {
  const lena = SLOT_COLOR[0 as Slot];
  const states: { s: MuleState; good: Good | null; owner?: string; label: string }[] = [
    { s: 'idle', good: null, label: 'In the corral: a store MULE, empty, no saddle cloth' },
    { s: 'walk', good: null, owner: lena, label: 'Bought: led out of the corral, empty, in Lena’s colour' },
    { s: 'walk', good: 'energy', owner: lena, label: 'Outfitted for Energy: the pod lights up' },
    { s: 'installed', good: 'energy', owner: lena, label: 'Installed: kneels on the plot, the pod pulses as it works' },
  ];
  return (
    <div className="flex flex-col gap-8" data-testid="mule-sheet">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="mule-states">
        {states.map((x) => (
          <Cell key={x.label} label={x.label} testid={`mule-${x.s}-${x.good ?? 'empty'}`}>
            <Mule size={200} state={x.s} good={x.good} {...(x.owner ? { owner: x.owner } : {})} />
          </Cell>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-caps">Outfitted for each good: the pod shows the good’s glyph and colour</h2>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-9" data-testid="mule-goods">
          {GOODS.map((g) => (
            <Cell key={g} label={GOOD_NAME[g]}>
              <Mule size={96} state="idle" good={g} owner={lena} />
            </Cell>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-caps">In everyone’s colours</h2>
        <div className="flex flex-wrap items-end gap-6 rounded-panel border border-holo-line bg-panel p-6" data-testid="mule-owners">
          {([0, 1, 2, 3, 4, 5] as Slot[]).map((s, i) => (
            <span key={s} className="flex items-end gap-1">
              <Creature species={(['zipwing', 'bramblet', 'gearling', 'mollox', 'glimmer', 'quibbit'] as const)[i]!} color={SLOT_COLOR[s]} size={44} />
              <Mule size={72} state="walk" good={GOODS[i]!} owner={SLOT_COLOR[s]} />
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-caps">At the sizes the screens use</h2>
        <div className="flex flex-wrap items-end gap-8 rounded-panel border border-holo-line bg-panel p-6" data-testid="mule-sizes">
          <span className="flex flex-col items-center gap-1">
            <Mule size={26} state="installed" good="food" owner={lena} />
            <span className="font-mono text-[10px] text-ink-3">26 PX · ON A PLOT</span>
          </span>
          <span className="flex flex-col items-center gap-1">
            <span className="flex items-end">
              <Creature species="zipwing" color={lena} size={26} />
              <Mule size={34} state="walk" good="water" owner={lena} />
            </span>
            <span className="font-mono text-[10px] text-ink-3">34 PX · LED IN THE PHONE’S HALL</span>
          </span>
          <span className="flex flex-col items-center gap-1">
            <span className="flex items-end">
              <Creature species="zipwing" color={lena} size={44} />
              <Mule size={64} state="walk" good="crystite" owner={lena} />
            </span>
            <span className="font-mono text-[10px] text-ink-3">64 PX · ON THE TV</span>
          </span>
          <span className="flex flex-col items-center gap-1">
            <span className="flex gap-0.5 text-ink">
              <MuleIcon size={18} />
              <MuleIcon size={18} />
            </span>
            <span className="font-mono text-[10px] text-ink-3">THE GLYPH STAYS FOR TEXT AND CHIPS</span>
          </span>
        </div>
      </section>
    </div>
  );
}
