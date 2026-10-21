import { Button, Creature, cx, PlayerMark, SLOT_COLOR, SPECIES, SPECIES_NAME, SPECIES_PERK, useSeatSpecies, type Slot, type Species } from '@mule/ui';
import { useState } from 'react';
import { ROOM_CODE, SEATS } from '../../data';

const SLOTS: Slot[] = [0, 1, 2, 3, 4, 5];

export function PhoneLobby() {
  const [name, setName] = useState('Heiko');
  const [slot, setSlot] = useState<Slot>(0);
  const [species, setSpecies] = useState<Species>(useSeatSpecies(0));
  const taken = new Set(SEATS.filter((s) => s.slot !== 0).map((s) => s.slot));

  return (
    <div className="flex h-full flex-col bg-table text-ink">
      <div className="flex items-center justify-between border-b border-holo-faint px-4 py-4">
        <span className="font-display text-lg font-bold">
          M.U.L.E. <span className="text-holo">Next Gen</span>
        </span>
        <span className="font-mono text-sm text-ink-2">
          ROOM <span className="font-bold tracking-[0.2em] text-ink">{ROOM_CODE}</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold">You're at the table</h1>
          <p className="text-ink-2">Pick a name, a species and a colour. Your creature is already on the big screen.</p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="label-caps">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            className="h-12 rounded-control border border-holo-line bg-panel px-3 text-lg text-ink outline-none focus:border-holo"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="label-caps mb-2">Your species</legend>
          <div className="grid grid-cols-3 gap-2">
            {SPECIES.map((sp) => (
              <button
                key={sp}
                type="button"
                aria-pressed={sp === species}
                onClick={() => setSpecies(sp)}
                className={cx(
                  'flex flex-col items-center gap-1 rounded-control border bg-panel pb-2 pt-3',
                  sp === species ? 'border-holo shadow-glow' : 'border-holo-faint',
                )}
              >
                <Creature species={sp} color={SLOT_COLOR[slot]} size={44} />
                <span className="text-sm font-semibold">{SPECIES_NAME[sp]}</span>
              </button>
            ))}
          </div>
          <p className="rounded-control bg-holo-soft px-3 py-2 text-sm text-ink">
            <strong>{SPECIES_NAME[species]}.</strong> {SPECIES_PERK[species]}
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="label-caps mb-2">Your colour</legend>
          <div className="grid grid-cols-6 gap-2">
            {SLOTS.map((s) => {
              const isTaken = taken.has(s) && s !== slot;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={isTaken}
                  aria-pressed={s === slot}
                  aria-label={`Colour ${s + 1}${isTaken ? ', taken' : ''}`}
                  onClick={() => setSlot(s)}
                  className={cx(
                    'flex h-12 items-center justify-center rounded-control border bg-panel disabled:opacity-25',
                    s === slot ? 'border-holo shadow-glow' : 'border-holo-faint',
                  )}
                >
                  <span className="size-6 rounded-full" style={{ background: SLOT_COLOR[s] }} />
                </button>
              );
            })}
          </div>
        </fieldset>

        <section className="flex flex-col gap-2">
          <h2 className="label-caps">At the table · 6 of 6</h2>
          <ul className="flex flex-col overflow-hidden rounded-panel border border-holo-line">
            {SEATS.map((s) => (
              <li key={s.slot} className="flex items-center gap-3 border-t border-holo-faint bg-panel px-3 py-2.5 first:border-t-0">
                <PlayerMark slot={s.slot === 0 ? slot : s.slot} species={s.slot === 0 ? species : undefined} size={22} />
                <span className="flex-1 font-semibold">
                  {s.slot === 0 ? `${name || 'You'} (you)` : s.name}
                  {s.persona && <span className="font-normal text-ink-3"> · {s.persona}</span>}
                </span>
                <span className={cx('rounded-chip px-2 py-0.5 font-mono text-[11px] font-bold', s.ai ? 'bg-holo-soft text-holo' : s.slot === 0 ? 'bg-warn/15 text-warn' : 'bg-ok/10 text-ok')}>
                  {s.ai ? `AI · ${s.ai.toUpperCase()}` : s.slot === 0 ? 'HOST' : 'READY'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex items-center gap-3 rounded-panel border border-ok/40 bg-ok/5 px-3 py-3">
          <span aria-hidden className="size-2.5 rounded-full bg-ok shadow-[0_0_10px_var(--color-ok)]" />
          <span className="text-sm">
            Big screen connected: <strong>Living room TV</strong>. Your phone is your private controller.
          </span>
        </div>
        <p className="font-mono text-xs text-ink-3">MEDIUM MAP · 12 MONTHS · SABOTAGE ON · AI LEVEL TRADER</p>
      </div>

      <div className="flex gap-3 border-t border-holo-faint bg-void/60 px-4 pb-6 pt-3">
        <Button variant="outline" className="flex-1">Settings</Button>
        <a href="#/phone/planning" className="inline-flex h-14 flex-[2] items-center justify-center rounded-control bg-holo font-display text-lg font-semibold text-on-holo shadow-glow hover:bg-holo-strong">
          Start game
        </a>
      </div>
    </div>
  );
}
