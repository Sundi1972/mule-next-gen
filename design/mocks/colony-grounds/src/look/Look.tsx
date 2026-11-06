import { Button, cx } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { MONTH_12 } from '../fixture';
import { Scene } from '../Scene';
import { richness } from '../screens';
import { Living } from './Living';

/**
 * WS10's look page for Heiko: how good the colony grounds can look, and what it costs. The pictures are the spike's
 * outputs (design/art/colony/spike-park, published here by publish-look.sh); this page only arranges them.
 */
type Light = 'day' | 'dusk';
type Way = 'a' | 'b' | 'c';
const img = (name: string) => `/look/${name}.webp`;

const WAYS: Record<Way, { title: string; how: string; look: string; phone: string; effort: string }> = {
  a: {
    title: 'A · Painted like the world map',
    how: 'The map’s own painter: noise, a height field and one light, no art files. Painted once in the background and kept.',
    look: 'Sits with the map like one hand drew both. Ground, paths, water and hedges are strong; trees are rounded “cauliflower” crowns and benches are boxes, because nothing with air under it can be drawn this way.',
    phone: 'One picture. 4 s to paint on a fast Mac, 7–25 s on a phone, once, in the background.',
    effort: '25–40 h per building (all 5 stages) after 16–24 h once to teach the painter boxes and facades. Stays stylised.',
  },
  b: {
    title: 'B · Real-time 3D (react-three-fiber)',
    how: 'The Blender model running live in the browser: real lights, soft shadows, glow, ambient occlusion.',
    look: 'The best dusk of the three: lamp glow, pools of light, long shadows. By day a little flatter than C. The camera can move, and light and stages change for free.',
    phone: '60 fps on this Mac; estimated 20–30 fps on a 2022 mid-range phone with everything on, about 30 with lighter settings. 0.5 MB code plus 5–8 MB per building to download.',
    effort: 'The same Blender model as C, plus ½ day per building to slim it for phones; stages mostly free (clip plane, lights, smoke particles) after 1½ days once for the site and scaffold kits. About 3–4 days per building.',
  },
  c: {
    title: 'C · Pre-rendered in Blender (offline, path-traced)',
    how: 'The same model, rendered offline the way films and Unreal’s path tracer render, and placed as a picture.',
    look: 'The most real of the three: grass, gravel, water with a stone edge, soft sun shadows. Reads as a believable miniature diorama.',
    phone: 'Just pictures: 50–65 kB each at the size a place has on the TV (measured, WebP). Any phone and any TV stick shows them perfectly. The live layer below adds the motion.',
    effort: '30–45 h for the first building with all 5 stages, 25–35 h for each after; about 35 s of rendering per picture. No paid assets: CC0 parts and materials, modelled by script.',
  },
};

function Section({ id, title, children, lead }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-3" data-testid={`section-${id}`}>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {lead && <div className="max-w-5xl text-base leading-snug text-ink-2">{lead}</div>}
      {children}
    </section>
  );
}

function LightToggle({ light, set }: { light: Light; set: (l: Light) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="label-caps">Light</span>
      {(['day', 'dusk'] as const).map((l) => (
        <Button key={l} size="md" variant={l === light ? 'holo' : 'outline'} onClick={() => set(l)} data-testid={`light-${l}`}>
          {l === 'day' ? 'Day' : 'Dusk'}
        </Button>
      ))}
    </div>
  );
}

/** A picture that may not be rendered yet: says so instead of showing a broken image. */
function Picture({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <div className={cx('grid place-items-center text-ink-3', className)}>rendering… ({src})</div>;
  return <img src={src} alt={alt} className={className} onError={() => setMissing(true)} />;
}

const STAGES = ['Site: stakes and the outline', 'Building: scaffold and crane', 'Standing', 'Closed: dark, faded', 'Damaged: broken, smoking'];

export function Look() {
  const [light, setLight] = useState<Light>('dusk');
  const [inScene, setInScene] = useState<Way | 'svg'>('c');
  const rich = richness(MONTH_12, { fund: 640, wealth: 3120, prestige: 9, mood: 72, air: 22, prestigeUp: 4 });
  return (
    <main className="flex min-h-screen flex-col gap-10 bg-void p-8 text-ink" data-testid="look">
      <header className="flex flex-col gap-3">
        <span className="label-caps">WS10 · Visual design · 6 Nov · for Heiko</span>
        <h1 className="font-display text-4xl font-bold">The colony grounds: how good can it look?</h1>
        <div className="flex items-center justify-between gap-4" id="colony">
          <p className="text-base text-ink-2">
            <strong className="text-ink">A whole colony, month 12:</strong> the town hall, the Park, Hospital, Observatory, Stadium and Spaceport,
            three places free to grow into. Pre-rendered in Blender (C). Buildings other than the Park are quick script-built models
            made today: they show the look, not final designs. The whole picture is 120–140 kB.
          </p>
          <LightToggle light={light} set={setLight} />
        </div>
        <div className="overflow-hidden rounded-panel border border-holo-line bg-[#070b12]" data-testid="section-colony">
          <Picture src={img(`colony-${light}`)} alt={`The colony's first ring at ${light}`} className="mx-auto aspect-video max-h-[78vh]" />
        </div>
        <div className="max-w-5xl rounded-panel border border-holo bg-panel p-4 text-lg leading-snug" data-testid="answer">
          <p>
            <strong>Yes, it can look like a real place.</strong> Model each building once in Blender from free (CC0) parts and
            materials, and show it as a <strong>pre-rendered picture (C)</strong> with a <strong>live layer</strong> on top: lamps that
            come on as the colony gets richer, colonists who come out when the mood is good, smoke, rain, and dusk falling at the
            month end. That works on every phone and TV. The same models turn into <strong>live 3D (B)</strong> for the TV later,
            so nothing is thrown away. Keep the world map’s painter (A) for the ground between the buildings.
          </p>
          <p className="mt-2 text-base text-ink-2">
            Effort: about <strong>30–45 hours for the first building</strong> with all five stages, <strong>25–35 for each after</strong>;
            the first ring (hall plus five) is roughly 5–7 agent-days. No paid assets needed. Buying a professional asset pack
            would raise the quality further; that would be your spend.
          </p>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm text-holo">
                    <a href="#stages">One building, every stage</a>
          <a href="#three-ways">The Park three ways</a>
          <a href="#in-grounds">In today’s grounds</a>
          <a href="#numbers">The numbers</a>
          <a href="#alive">Making it come alive</a>
          <a href="#decide">What you decide</a>
        </nav>
      </header>


      <Section id="stages" title="One building, every stage: the Hospital" lead="Each stage in the game is a different picture of the same model. Closed and damaged are mostly the standing model with lights and materials changed; the scaffold is a kit built once and reused for every building.">
        <div className="overflow-hidden rounded-panel border border-holo-line bg-[#070b12]">
          <Picture src={img('hospital-stages')} alt="The Hospital in its five stages" className="aspect-[4/1] w-full" />
        </div>
        <div className="grid grid-cols-5 text-center text-sm text-ink-2">
          {STAGES.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </Section>

      <Section id="three-ways" title="The same Park, three ways" lead="One Park design, built three ways and seen from the grounds’ own camera. The world map’s style is on the left; the two on the right come from one Blender model.">
        <LightToggle light={light} set={setLight} />
        <div className="grid grid-cols-3 gap-4">
          {(['a', 'b', 'c'] as const).map((w) => (
            <figure key={w} className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-3" data-testid={`way-${w}`}>
              <div className="overflow-hidden rounded-control bg-[#0b1220]">
                <Picture src={img(`${w}-${light}`)} alt={`${WAYS[w].title}, ${light}`} className="aspect-[4/3] w-full" />
              </div>
              <figcaption className="flex flex-col gap-1 text-sm leading-snug">
                <strong className="font-display text-lg">{WAYS[w].title}</strong>
                <span className="text-ink-2">{WAYS[w].how}</span>
                <span><span className="label-caps">Look </span>{WAYS[w].look}</span>
                <span><span className="label-caps">Phone </span>{WAYS[w].phone}</span>
                <span><span className="label-caps">Effort </span>{WAYS[w].effort}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section id="in-grounds" title="In today’s grounds, at TV size" lead="The current grounds mock with the Park swapped for each picture. Only the Park changes; the other buildings are still today’s drawings, which shows why every building has to move to the same look together.">
        <div className="flex items-center gap-2">
          <span className="label-caps">Park</span>
          {(['svg', 'a', 'b', 'c'] as const).map((w) => (
            <Button key={w} size="md" variant={w === inScene ? 'holo' : 'outline'} onClick={() => setInScene(w)} data-testid={`in-${w}`}>
              {w === 'svg' ? 'Today' : w.toUpperCase()}
            </Button>
          ))}
          <LightToggle light={light} set={setLight} />
        </div>
        <div className="mx-auto w-full max-w-[1280px] rounded-panel border border-holo-line bg-panel p-4">
          <Scene objects={MONTH_12} rich={rich} look="diorama" words art={inScene === 'svg' ? {} : { park: img(`${inScene}-${light}-800`) }} />
        </div>
      </Section>

      <Section id="numbers" title="The numbers">
        <table className="max-w-6xl text-left text-sm" data-testid="numbers">
          <thead className="label-caps">
            <tr>
              <th className="py-2 pr-6"></th>
              <th className="pr-6">A · painted like the map</th>
              <th className="pr-6">B · real-time 3D</th>
              <th>C · pre-rendered</th>
            </tr>
          </thead>
          <tbody className="align-top text-ink-2 [&_td]:py-2 [&_td]:pr-6 [&_th]:py-2 [&_th]:pr-6 [&_th]:text-ink">
            <tr><th>Looks</th><td>Like the map; stylised</td><td>Best at dusk; camera can move</td><td>Most real; fixed angle</td></tr>
            <tr><th>Phone</th><td>A picture; 7–25 s to paint once</td><td>20–30 fps est.; 0.5 MB code + 5–8 MB a building</td><td>A picture, 50–65 kB at TV size</td></tr>
            <tr><th>Weak TV stick</th><td>Fine</td><td>At risk: needs a measured device</td><td>Fine</td></tr>
            <tr><th>Per building, 5 stages</th><td>25–40 h (+16–24 h once)</td><td>3–4 days (+1½ days once for kits)</td><td>30–45 h first, 25–35 h after</td></tr>
            <tr><th>Day, dusk, lights, smoke</th><td>Repaint</td><td>Free, live</td><td>Re-render, or the live layer</td></tr>
            <tr><th>Paid spend</th><td>None</td><td>None (CC0)</td><td>None (CC0)</td></tr>
          </tbody>
        </table>
        <p className="max-w-5xl text-sm text-ink-2">
          <strong>Unreal-quality, offline:</strong> C already is the offline path. Blender’s Cycles is a path tracer, the same kind of
          renderer as Unreal’s offline one, so the pictures are limited by the models, not the renderer. The next step up in
          quality is better-made models (hand-modelled buildings, or a bought kit), not a different engine. Unreal pays off only for
          long animated sequences, like a cinematic month-end film, and adds a large tool to the project.
        </p>
      </Section>

      <Section
        id="alive"
        title="Making it come alive (works with every option)"
        lead="Pictures stay still; the page moves what changes, live and cheap on a phone. Try the controls: dusk, lamps by wealth, colonists by mood, rain, and the month-end move. All of this is plain page drawing over the Blender Park."
      >
        <div className="mx-auto w-full max-w-[1100px]">
          <Living day={img('c-day')} dusk={img('c-dusk')} />
        </div>
        <ul className="grid max-w-6xl grid-cols-2 gap-3 text-sm text-ink-2" data-testid="alive-list">
          {[
            ['Lights come on as wealth rises', 'Windows and lamps light up as the colony gets richer; a poor colony stays dim at dusk. Rendered once lit and once unlit, then blended.', '1–2 days', 'Yes: the clearest “how rich are we” signal'],
            ['Colonists by mood', 'Little people on the paths: many when happy, few when unhappy, none on strike.', '1–2 days', 'Yes'],
            ['The month-end moment', 'Dusk falls, the camera leans in on what was built this month, its lights come on, then back out.', '1 day', 'Yes: the moment the table cheers'],
            ['Weather and seasons', 'Rain, snow, dust storms from the planet’s events; autumn trees later. Weather is cheap; seasons need extra renders.', 'Weather 1 day; seasons 1 day + renders', 'Weather yes; seasons later'],
            ['Smoke and damage', 'Smoke over a damaged building, sparks over a building site, drawn live over the picture.', '½ day', 'Yes'],
            ['A strong illustrated style instead', 'If you prefer a drawn look over a photographed one, A already shows it: the map’s hand, extended to buildings. Cheaper to keep consistent, less “wow”.', 'Like A', 'Fallback if C’s look is not for you'],
          ].map(([t, d, e, r]) => (
            <li key={t} className="rounded-panel border border-holo-line bg-panel p-3">
              <strong className="text-ink">{t}</strong>
              <p>{d}</p>
              <p className="mt-1"><span className="label-caps">Effort </span>{e} · <span className="label-caps">Recommend </span>{r}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="decide" title="What you decide">
        <ol className="max-w-5xl list-decimal space-y-2 pl-6 text-base leading-snug">
          <li>
            <strong>The direction:</strong> C with the live layer now and B for the TV later <em>(recommended)</em>; or B everywhere now (best look,
            phone and TV-stick risk); or A everywhere (one style with the map, cheapest to keep consistent, less real).
          </li>
          <li><strong>Art spend:</strong> stay free (CC0 parts, script-modelled buildings) <em>(recommended for now)</em>, or budget a professional asset pack later.</li>
          <li>After you pick: WS10 writes the art direction and the full asset list (every building × stage, the parks, the hall), then the build plan with the screen lanes.</li>
        </ol>
      </Section>
    </main>
  );
}
