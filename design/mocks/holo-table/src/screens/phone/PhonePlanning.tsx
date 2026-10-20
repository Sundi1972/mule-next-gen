import { Button, cx, GoodTag, Panel, PlayerMark, Ticker, type Good, type Slot } from '@mule/ui';
import { useState } from 'react';
import { DEALS, MARKET, MY_STOCK, NEWS, seat, SEATS, TABLE_CHAT, WHISPERS } from '../../data';
import { useCountdown } from '../../proto';
import { PhoneShell } from './Shell';

type Tab = 'colony' | 'deals' | 'chat' | 'secret';
const TABS: { id: Tab; label: string; badge?: number }[] = [
  { id: 'colony', label: 'Colony' },
  { id: 'deals', label: 'Deals', badge: 2 },
  { id: 'chat', label: 'Chat', badge: 1 },
  { id: 'secret', label: 'Secret' },
];

export function PhonePlanning() {
  const seconds = useCountdown(45);
  const [tab, setTab] = useState<Tab>('colony');
  const [ready, setReady] = useState(false);

  return (
    <PhoneShell
      phase="Planning"
      seconds={seconds}
      footer={
        <Button size="lg" variant={ready ? 'outline' : 'holo'} className="w-full" onClick={() => setReady((r) => !r)}>
          {ready ? 'Ready · waiting for 3 others' : "I'm ready"}
        </Button>
      }
    >
      <div role="tablist" aria-label="Planning" className="mb-4 grid grid-cols-4 gap-1 rounded-control border border-holo-line bg-void p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx('relative h-10 rounded-[8px] text-sm font-semibold', tab === t.id ? 'bg-holo-soft text-holo' : 'text-ink-2')}
          >
            {t.label}
            {t.badge && <span className="absolute right-1 top-1 size-4 rounded-full bg-holo font-mono text-[10px] font-bold leading-4 text-on-holo">{t.badge}</span>}
          </button>
        ))}
      </div>
      {tab === 'colony' && <Colony />}
      {tab === 'deals' && <Deals />}
      {tab === 'chat' && <Chat />}
      {tab === 'secret' && <Secret />}
    </PhoneShell>
  );
}

function Colony() {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Your stock" aside="Depot 10 each">
        <div className="grid grid-cols-5 gap-2">
          {(Object.entries(MY_STOCK) as [Good, number][]).map(([good, n]) => (
            <div key={good} className="flex flex-col items-start gap-1">
              <GoodTag good={good} />
              <span data-num className="font-mono text-xl font-bold">{n}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-warn">You need 3 Food for upkeep. Food is short this month.</p>
      </Panel>
      <section className="flex flex-col gap-2">
        <h2 className="label-caps">Colony market</h2>
        <Ticker items={MARKET} className="[&>div]:p-2" />
      </section>
      <Panel title="News">
        <ul className="flex flex-col gap-2.5">
          {NEWS.map((n) => (
            <li key={n.text} className="flex gap-2.5 text-sm leading-snug">
              <span aria-hidden className={cx('mt-1.5 size-1.5 shrink-0 rounded-full', n.tone === 'alert' ? 'bg-alert' : n.tone === 'warn' ? 'bg-warn' : 'bg-holo')} />
              {n.text}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Deals() {
  return (
    <div className="flex flex-col gap-3">
      {DEALS.map((d) => (
        <Panel key={d.from} title={<span className="flex items-center gap-2 normal-case tracking-normal"><PlayerMark slot={d.from} size={12} />{seat(d.from).name} offers</span>} aside={d.when}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
            <div className="flex flex-col rounded-control bg-void px-2 py-2">
              <span className="label-caps">You get</span>
              <span className="font-display text-lg font-semibold">{d.give}</span>
            </div>
            <span aria-hidden className="font-mono text-holo">⇄</span>
            <div className="flex flex-col rounded-control bg-void px-2 py-2">
              <span className="label-caps">You give</span>
              <span className="font-display text-lg font-semibold">{d.get}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button size="md">Accept</Button>
            <Button size="md" variant="outline">Counter</Button>
            <Button size="md" variant="ghost">Decline</Button>
          </div>
        </Panel>
      ))}
      <Button variant="outline" className="w-full">Offer a deal…</Button>
    </div>
  );
}

const EMOTES = ['Deal?', 'Nice!', 'Traitor!', 'Ha!', 'Help!'];

function Chat() {
  const [to, setTo] = useState<Slot | 'table'>('table');
  const lines = to === 'table' ? TABLE_CHAT : WHISPERS;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setTo('table')} className={cx('h-9 shrink-0 rounded-full border px-3 text-sm font-semibold', to === 'table' ? 'border-holo bg-holo-soft text-holo' : 'border-holo-faint text-ink-2')}>
          Whole table
        </button>
        {SEATS.slice(1).map((s) => (
          <button key={s.slot} type="button" onClick={() => setTo(s.slot)} className={cx('flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold', to === s.slot ? 'border-holo bg-holo-soft text-holo' : 'border-holo-faint text-ink-2')}>
            <PlayerMark slot={s.slot} size={10} glow={false} />
            {s.name}
          </button>
        ))}
      </div>
      {to !== 'table' && <p className="font-mono text-xs text-ink-3">WHISPER · ONLY YOU AND {seat(to).name.toUpperCase()} SEE THIS</p>}
      <ul className="flex flex-col gap-3">
        {(to === 'table' || to === 1 ? lines : []).map((l) => (
          <li key={l.text} className="flex gap-2.5">
            <PlayerMark slot={l.from} size={14} />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-ink-2">
                {seat(l.from).name}
                {seat(l.from).ai && <span className="text-holo"> · AI</span>}
              </span>
              <span className="leading-snug">{l.text}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        {EMOTES.map((e) => (
          <button key={e} type="button" className="h-9 flex-1 rounded-chip border border-holo-faint bg-panel text-xs font-semibold text-ink-2 hover:text-ink">
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input placeholder={to === 'table' ? 'Say something to everyone' : `Whisper to ${seat(to).name}`} className="h-12 flex-1 rounded-control border border-holo-line bg-panel px-3 text-ink outline-none placeholder:text-ink-3 focus:border-holo" />
        <Button size="md" className="h-12">Send</Button>
      </div>
    </div>
  );
}

function Secret() {
  const [target, setTarget] = useState<Slot>(5);
  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-xs text-alert-ink">SECRET ORDERS · NOBODY SEES THESE UNTIL THEY HAPPEN</p>
      <Panel tone="alert" title="Sabotage" aside="Risk of being caught 25%">
        <span className="text-sm text-ink-2">Target</span>
        <div className="grid grid-cols-5 gap-1.5">
          {SEATS.slice(1).map((s) => (
            <button key={s.slot} type="button" aria-pressed={target === s.slot} onClick={() => setTarget(s.slot)} className={cx('flex h-12 flex-col items-center justify-center gap-0.5 rounded-control border text-[11px] font-semibold', target === s.slot ? 'border-alert bg-alert/15 text-ink' : 'border-alert/30 text-ink-2')}>
              <PlayerMark slot={s.slot} size={12} glow={false} />
              {s.name}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {[
            { name: 'Cut the power to one plot', cost: 150 },
            { name: 'Spoil their Food stock', cost: 200 },
            { name: 'Bribe the store clerk', cost: 250 },
          ].map((o, i) => (
            <label key={o.name} className="flex items-center gap-3 rounded-control border border-alert/30 px-3 py-2.5">
              <input type="radio" name="sabotage" defaultChecked={i === 0} className="accent-[var(--color-alert)]" />
              <span className="flex-1 text-sm">{o.name}</span>
              <span data-num className="font-mono text-sm font-bold">{o.cost} cr</span>
            </label>
          ))}
        </div>
        <Button variant="danger" size="md">Order sabotage on {seat(target).name}</Button>
      </Panel>
      <Panel title="Protect yourself">
        <label className="flex items-center gap-3">
          <input type="checkbox" className="size-5 accent-[var(--color-holo)]" />
          <span className="flex-1 text-sm">Guard your Energy plots this month</span>
          <span data-num className="font-mono text-sm font-bold">80 cr</span>
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" defaultChecked className="size-5 accent-[var(--color-holo)]" />
          <span className="flex-1 text-sm">Drought insurance for your Food</span>
          <span data-num className="font-mono text-sm font-bold">60 cr</span>
        </label>
      </Panel>
    </div>
  );
}
