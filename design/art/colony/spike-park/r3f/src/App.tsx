import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, useGLTF } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { settings, type Mood } from './settings'

// Blender camera (60°, 0, 45°) at (20, -20, h) in Z-up becomes (20, h, 20) in glTF's Y-up:
// x stays east, Blender +y (north) becomes three -z.
const ISO_DIST = 20
const ISO_HEIGHT = ISO_DIST * Math.SQRT2 * Math.tan(Math.PI / 6)

// Per-mood lighting. Sun comes from the north-west: three (-x, +y, -z).
const MOODS = {
  day: {
    sun: new THREE.Vector3(-9, 13, -11),
    sunColor: '#fff0d8',
    sunIntensity: 2.3,
    env: 0.5,
    hemi: 0.0,
    lampEmissive: 0.0,
    lampLight: 0,
    bloom: 0.25,
    exposure: 1.0,
  },
  dusk: {
    sun: new THREE.Vector3(-14, 2.6, -8),
    sunColor: '#ff8a3d',
    sunIntensity: 2.4,
    env: 0.18,
    hemi: 0.35,
    lampEmissive: 14,
    lampLight: 9,
    bloom: 1.1,
    exposure: 1.0,
  },
} as const

declare global {
  interface Window {
    __perf: Record<string, unknown>
  }
}
window.__perf = { t0: performance.now() }

async function pickModel(): Promise<string> {
  if (settings.model) return '/' + settings.model
  const rt = await fetch('/park_rt.glb', { method: 'HEAD' }).catch(() => null)
  // Vite answers a missing file with index.html, so check the type, not just ok.
  const isGlb = rt?.ok && !(rt.headers.get('content-type') ?? '').includes('html')
  return isGlb ? '/park_rt.glb' : '/park.glb'
}

export function App() {
  const [url, setUrl] = useState<string | null>(null)
  const [mood, setMood] = useState<Mood>(settings.mood)
  const [orbit, setOrbit] = useState(settings.orbit)
  useEffect(() => {
    pickModel().then((u) => {
      window.__perf.model = u
      setUrl(u)
    })
  }, [])
  ;(window as unknown as { setMood: (m: Mood) => void }).setMood = setMood

  return (
    <>
      {url && (
        <Canvas
          orthographic
          shadows={settings.shadows ? 'soft' : false}
          dpr={[1, settings.dprMax]}
          camera={{ position: [ISO_DIST, ISO_HEIGHT, ISO_DIST], near: 0.1, far: 200, zoom: 50 }}
          gl={{
            antialias: !settings.post, // SMAA does it in post; MSAA there would double the cost
            alpha: true,
            powerPreference: 'high-performance',
            stencil: false,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x0b1220, settings.transparent ? 0 : 1)
            gl.info.autoReset = false // count every pass of the composer, not just the last
            const ctx = gl.getContext()
            const ext = ctx.getExtension('WEBGL_debug_renderer_info')
            window.__perf.glRenderer = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)
            window.__perf.glVendor = ext ? ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) : ctx.getParameter(ctx.VENDOR)
          }}
        >
          <CameraRig orbit={orbit} />
          <Lighting mood={mood} />
          <Suspense fallback={null}>
            <Park url={url} mood={mood} />
            <Perf />
          </Suspense>
          {settings.post && <Post mood={mood} />}
        </Canvas>
      )}
      {!settings.shot && <Hud mood={mood} setMood={setMood} orbit={orbit} setOrbit={setOrbit} />}
    </>
  )
}

function CameraRig({ orbit }: { orbit: boolean }) {
  const { camera, size } = useThree()
  const angle = useRef(Math.PI / 4)
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    // Fit `frame` metres across the wider axis at 4:3, as the Blender camera does.
    cam.zoom = Math.min(size.width / settings.frame, size.height / (settings.frame * 0.75))
    cam.updateProjectionMatrix()
  }, [camera, size])
  useFrame((_, dt) => {
    if (orbit) angle.current += dt * 0.12
    const r = ISO_DIST * Math.SQRT2
    camera.position.set(Math.sin(angle.current) * r, ISO_HEIGHT, Math.cos(angle.current) * r)
    camera.lookAt(0, 0, 0)
  })
  return null
}

function Lighting({ mood }: { mood: Mood }) {
  const m = MOODS[mood]
  const sun = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    scene.environmentIntensity = m.env
  }, [scene, m.env])
  return (
    <>
      <Environment files="/sky_2k.hdr" />
      <hemisphereLight args={['#5b6fa8', '#2a2018', m.hemi]} />
      <directionalLight
        ref={sun}
        position={m.sun}
        color={m.sunColor}
        intensity={m.sunIntensity}
        castShadow={settings.shadows}
        shadow-mapSize={[settings.shadowMap, settings.shadowMap]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        // The tile is 12 m; its diagonal plus a 7 m tree's throw fits in ±10 m.
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      />
      <GroundShadow />
    </>
  )
}

// A soft drop shadow under the slab so the tile sits on the TV's background like a game piece.
function GroundShadow() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const r = g.createRadialGradient(64, 64, 20, 64, 64, 64)
    r.addColorStop(0, 'rgba(0,0,0,0.55)')
    r.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  }, [])
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0.4, -0.62, 0.4]} renderOrder={-1}>
      <planeGeometry args={[19, 19]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

type Lamp = { mats: THREE.MeshStandardMaterial[]; pos: THREE.Vector3[]; added: boolean; root: THREE.Object3D }

function Park({ url, mood }: { url: string; mood: Mood }) {
  const { scene } = useGLTF(url)
  const m = MOODS[mood]

  const lamps = useMemo<Lamp>(() => {
    const mats = new Set<THREE.MeshStandardMaterial>()
    const pos: THREE.Vector3[] = []
    let tris = 0
    scene.updateMatrixWorld(true)
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const g = mesh.geometry
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3
      for (const mat of ([] as THREE.Material[]).concat(mesh.material)) {
        const s = mat as THREE.MeshStandardMaterial
        // Blended foliage sorts badly and casts square shadows; a cutout fixes both.
        if (s.transparent && s.map && !/pond|water/i.test(s.name)) {
          s.transparent = false
          s.alphaTest = 0.5
          s.depthWrite = true
        }
        if (s.alphaTest > 0) s.side = THREE.DoubleSide
        if (settings.lawnNoise && !s.map && /lawn|grass/i.test(s.name)) addLawnNoise(s)
        const e = s.emissive
        if (e && e.r + e.g + e.b > 0.05) {
          mats.add(s)
          const c = new THREE.Vector3()
          new THREE.Box3().setFromObject(mesh).getCenter(c)
          pos.push(c)
        }
      }
    })
    window.__perf.modelTris = tris
    return { mats: [...mats], pos: dedupe(pos), added: false, root: settings.merge ? mergeStatic(scene) : scene }
  }, [scene])

  useEffect(() => {
    for (const mat of lamps.mats) mat.emissiveIntensity = Math.max(m.lampEmissive, mood === 'day' ? 0.4 : 0)
  }, [lamps, m.lampEmissive, mood])

  // park.glb (the older export) has no lamps; draw the spec's four so dusk can be judged on it.
  const fallback = lamps.pos.length === 0
  window.__perf.lampsFromModel = !fallback
  const lampPos = fallback ? SPEC_LAMPS.map(([x, y]) => new THREE.Vector3(x, 0.1 + 2.4, -y)) : lamps.pos

  return (
    <>
      <primitive object={lamps.root} />
      {fallback && SPEC_LAMPS.map(([x, y], i) => <LampPost key={i} x={x} z={-y} glow={m.lampEmissive} />)}
      {settings.lampLights &&
        m.lampLight > 0 &&
        lampPos.map((p, i) => (
          <pointLight key={i} position={[p.x, p.y - 0.15, p.z]} color="#ffb070" intensity={m.lampLight} distance={7} decay={2} />
        ))}
    </>
  )
}

const SPEC_LAMPS: [number, number][] = [
  [1.3, 1.3],
  [-1.3, 1.3],
  [1.3, -1.3],
  [-1.3, -1.3],
]

function LampPost({ x, z, glow }: { x: number; z: number; glow: number }) {
  return (
    <group position={[x, 0.1, z]}>
      <mesh castShadow position-y={1.15}>
        <cylinderGeometry args={[0.035, 0.05, 2.3, 8]} />
        <meshStandardMaterial color="#1d2024" roughness={0.5} metalness={0.7} />
      </mesh>
      <mesh position-y={2.4}>
        <sphereGeometry args={[0.14, 16, 12]} />
        <meshStandardMaterial color="#f4e6c8" emissive="#ffb35c" emissiveIntensity={Math.max(glow, 0.4)} roughness={0.3} />
      </mesh>
    </group>
  )
}

// A flat-colour lawn reads as plastic; world-space noise breaks it up for a few ALU per pixel.
function addLawnNoise(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLawnPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLawnPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLawnPos;
float lnHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lnNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lnHash(i), lnHash(i + vec2(1, 0)), f.x), mix(lnHash(i + vec2(0, 1)), lnHash(i + vec2(1, 1)), f.x), f.y);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 p = vLawnPos.xz;
  float n = 0.55 * lnNoise(p * 0.45) + 0.3 * lnNoise(p * 1.7) + 0.15 * lnNoise(p * 9.0);
  diffuseColor.rgb *= mix(vec3(0.78, 0.86, 0.72), vec3(1.12, 1.08, 0.95), n);
}`,
      )
  }
  mat.needsUpdate = true
}

// The park is static: one draw per material instead of one per node (743 -> ~40 calls with shadows).
function mergeStatic(scene: THREE.Object3D) {
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>()
  scene.updateMatrixWorld(true)
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || Array.isArray(mesh.material)) return
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    const key = mesh.material.uuid + '|' + Object.keys(g.attributes).sort().join(',') + '|' + (g.index ? 'i' : 'n')
    const e = groups.get(key) ?? { mat: mesh.material, geos: [] }
    e.geos.push(g)
    groups.set(key, e)
  })
  const root = new THREE.Group()
  for (const { mat, geos } of groups.values()) {
    const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0]
    if (!merged) continue
    const m = new THREE.Mesh(merged, mat)
    m.castShadow = m.receiveShadow = true
    root.add(m)
  }
  window.__perf.mergedMeshes = root.children.length
  return root
}

function dedupe(ps: THREE.Vector3[]) {
  const out: THREE.Vector3[] = []
  for (const p of ps) if (!out.some((q) => q.distanceTo(p) < 0.3)) out.push(p)
  return out
}

const TONE = { aces: ToneMappingMode.ACES_FILMIC, agx: ToneMappingMode.AGX, neutral: ToneMappingMode.NEUTRAL }

function Post({ mood }: { mood: Mood }) {
  const m = MOODS[mood]
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <>{settings.ssao && <N8AO halfRes aoRadius={1.0} distanceFalloff={0.6} intensity={2.2} quality="medium" />}</>
      <>{settings.bloom && <Bloom mipmapBlur luminanceThreshold={2.5} luminanceSmoothing={0.2} intensity={m.bloom} radius={0.65} />}</>
      <ToneMapping mode={TONE[settings.toneMap]} />
      <>{settings.smaa && <SMAA />}</>
    </EffectComposer>
  )
}

// Reads the previous frame's totals, then resets, so composer passes are counted too.
function Perf() {
  const gl = useThree((s) => s.gl)
  const frames = useRef(0)
  useFrame(() => {
    frames.current++
    if (frames.current === 2) window.__perf.firstFrameMs = performance.now()
    window.__perf.calls = gl.info.render.calls
    window.__perf.triangles = gl.info.render.triangles
    window.__perf.programs = gl.info.programs?.length
    window.__perf.textures = gl.info.memory.textures
    window.__perf.geometries = gl.info.memory.geometries
    window.__perf.frames = frames.current
    window.__perf.pixelRatio = gl.getPixelRatio()
    gl.info.reset()
  }, -1)
  return null
}

function Hud(p: { mood: Mood; setMood: (m: Mood) => void; orbit: boolean; setOrbit: (o: boolean) => void }) {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let n = 0
    let t = performance.now()
    let raf = 0
    const tick = () => {
      n++
      const now = performance.now()
      if (now - t > 1000) {
        setFps(Math.round((n * 1000) / (now - t)))
        n = 0
        t = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  const btn = (on: boolean): React.CSSProperties => ({
    font: '600 14px system-ui',
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid #ffffff30',
    background: on ? '#f2c46b' : '#ffffff14',
    color: on ? '#1b1405' : '#e8ecf4',
    cursor: 'pointer',
  })
  return (
    <div style={{ position: 'fixed', left: 16, top: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button style={btn(p.mood === 'day')} onClick={() => p.setMood('day')}>Day</button>
      <button style={btn(p.mood === 'dusk')} onClick={() => p.setMood('dusk')}>Dusk</button>
      <button style={btn(p.orbit)} onClick={() => p.setOrbit(!p.orbit)}>Orbit</button>
      <span style={{ color: '#9aa6bd', font: '12px ui-monospace, monospace' }}>{fps} fps</span>
    </div>
  )
}
