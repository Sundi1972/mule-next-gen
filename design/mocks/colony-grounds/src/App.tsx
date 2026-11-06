import { Button } from '@mule/ui';
import { useState } from 'react';
import { MONTH_12, type Month } from './fixture';
import { PhonePlanning, TvMonthEnd, TvPlanning, type Variant } from './screens';

/** The colony grounds (AM-16, option A): every screen on one page, the month and the variant picked at the top. */
export default function App() {
  const [month, setMonth] = useState<Month>(12);
  const [variant, setVariant] = useState<Variant>('A');
  const [governor, setGovernor] = useState(true);
  const objects = month === 1 ? [] : MONTH_12;
  // The month end shows the Stadium standing this month (it was building, 2 of 3, at planning).
  const monthEnd = month === 1 ? [] : MONTH_12.map((o) => (o.id === 'stadium' ? { ...o, stage: 'standing' as const, built: 3 } : o));
  return (
    <main className="flex min-h-screen flex-col gap-6 bg-void p-6 text-ink" data-testid="index">
      <header className="flex flex-col gap-2" data-testid="decisions">
        <h1 className="font-display text-2xl font-bold">Colony grounds · AM-16 option A: the colony's buildings off the players' plots (WS6 mock for WS7)</h1>
        <ul className="list-disc pl-5 text-sm leading-snug text-ink-2">
          <li>The grounds are their own small square, not the planet map: the town hall in the middle and 8 numbered slots round it (WS7's rules). No terrain, no owners' plots: only the colony.</li>
          <li>Each building is drawn with the map's own object mark (WS5's approved C33 stages: SITE, building months, standing, SHUT, HIT), so it reads the same as on a plot today.</li>
          <li>Every stage shows: waiting for funds and goods ("Waiting for 480 cr · 1 Alloy · 2 Electronics"), building ("Stands in 1 month"), standing, closed (upkeep missed), damaged (repair cost). A free slot is a faint dashed square.</li>
          <li>The Governor places: Commission on the Colony desk, then tap a free slot ("Place here"). Others read the grounds and give. The AI Governor takes the first free slot. In G-5 the slot changes nothing, so the phone says so.</li>
          <li>TV: the planning colony panel and the month end, where this month's change is ringed. Phone: the Colony desk.</li>
          <li><strong>The choice (variants)</strong> is how the grounds sit beside the planet map. <strong>A</strong>: a separate view, a Planet · Colony grounds switch on the phone, and the TV's colony panel is the grounds. <strong>B</strong>: the grounds ride the map's corner as a small inset, one picture; a tap on the phone opens them full size.</li>
          <li>DS-GAP: no town-hall glyph in @mule/ui; the hall is named in words.</li>
        </ul>
        <div className="flex flex-wrap items-center gap-2" data-testid="controls">
          <span className="label-caps">Month</span>
          {([1, 12] as const).map((m) => (
            <Button key={m} size="md" variant={m === month ? 'holo' : 'outline'} onClick={() => setMonth(m)} data-testid={`month-${m}`}>
              {m === 1 ? 'Month 1 · empty' : 'Month 12 · busy'}
            </Button>
          ))}
          <span className="label-caps ml-4">Variant</span>
          {(['A', 'B'] as const).map((v) => (
            <Button key={v} size="md" variant={v === variant ? 'holo' : 'outline'} onClick={() => setVariant(v)} data-testid={`variant-${v}`}>
              {v === 'A' ? 'A · its own view' : 'B · inset on the map'}
            </Button>
          ))}
          <span className="label-caps ml-4">Phone</span>
          <Button size="md" variant={governor ? 'holo' : 'outline'} onClick={() => setGovernor(true)} data-testid="as-governor">
            You are Governor
          </Button>
          <Button size="md" variant={!governor ? 'holo' : 'outline'} onClick={() => setGovernor(false)} data-testid="as-player">
            You are not
          </Button>
        </div>
        <nav className="flex gap-4 text-sm text-holo" data-testid="links">
          <a href="#tv-planning">TV · planning</a>
          <a href="#tv-month-end">TV · month end</a>
          <a href="#phone">Phone · Colony desk</a>
        </nav>
      </header>
      <h2 id="tv-planning" className="font-display text-xl font-semibold">TV · planning ({variant})</h2>
      <TvPlanning month={month} objects={objects} variant={variant} />
      <h2 id="tv-month-end" className="font-display text-xl font-semibold">TV · the month end (A and B alike)</h2>
      <TvMonthEnd month={month} objects={monthEnd} fresh={month === 1 ? null : 5} />
      <h2 id="phone" className="font-display text-xl font-semibold">Phone · the Colony desk, sideways ({variant}; {governor ? 'Governor: try Commission' : 'not Governor'})</h2>
      <PhonePlanning key={`${month}-${variant}-${governor}`} month={month} initial={objects} variant={variant} governor={governor} />
      <a href="#index" className="text-sm text-holo">↑ back to the top</a>
    </main>
  );
}
