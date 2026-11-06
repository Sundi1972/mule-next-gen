// Everything the measurement script toggles comes in through the URL, so one build serves every run.
const q = new URLSearchParams(location.search)
const flag = (k: string, d: boolean) => (q.has(k) ? q.get(k) !== '0' : d)
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d)

export type Mood = 'day' | 'dusk'

export const settings = {
  model: q.get('model') ?? '', // empty: prefer park_rt.glb, fall back to park.glb
  mood: (q.get('mood') === 'dusk' ? 'dusk' : 'day') as Mood,
  shot: flag('shot', false), // hide the UI for screenshots
  transparent: flag('transparent', false), // N8AO paints the cleared area; transparency only holds with ssao=0,
  ssao: flag('ssao', true),
  bloom: flag('bloom', true),
  smaa: flag('smaa', true),
  shadows: flag('shadows', true),
  shadowMap: num('shadowMap', 2048),
  lampLights: flag('lampLights', true), // real point lights under the globes at dusk
  lawnNoise: flag('lawnNoise', true), // only touches flat-colour lawn materials
  merge: flag('merge', true), // bake the static park into one mesh per material
  post: flag('post', true), // the whole composer; off = plain renderer with ACES
  dprMax: num('dpr', 2),
  orbit: flag('orbit', false),
  // Metres of ground across the view width; 21 matches the Blender camera's ortho_scale.
  frame: num('frame', 21),
  toneMap: (q.get('tm') ?? 'aces') as 'aces' | 'agx' | 'neutral',
}
