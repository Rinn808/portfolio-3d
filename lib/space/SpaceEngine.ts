import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { PlanetType, Station } from "../data/portfolio";
import * as S from "./shaders";

/* =========================================================================
 * SpaceEngine: vũ trụ portfolio viết bằng Three.js thuần.
 * React chỉ gắn engine vào 1 thẻ <div> và nghe sự kiện (select, hover, stats).
 *
 *  - Thiên hà xoắn ốc ~100k hạt, quay vi sai ngay trên GPU (vertex shader)
 *  - Mặt trời plasma sinh bằng nhiễu + quầng sáng nhiều lớp
 *  - 7 hành tinh = 7 trạm, đúng thứ tự thật: Sao Thuỷ, Sao Kim, Trái Đất (CV, ảnh NASA + Mặt Trăng),
 *    Sao Hoả, Sao Mộc, Sao Thổ, Sao Hải Vương
 *  - Vành đai tiểu hành tinh giữa Sao Hoả và Sao Mộc (InstancedMesh → 1 draw call)
 *  - Hậu kỳ: Bloom + tone mapping ACES, chất lượng tự hạ khi FPS thấp
 * ========================================================================= */

export type Quality = "low" | "medium" | "high";
export type QualityMode = Quality | "auto";

export interface EngineStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  dpr: number;
  quality: Quality;
  mode: QualityMode;
  focusId: string | null;
  camera: [number, number, number];
  flying: boolean;
}

type Events = {
  select: string;
  hover: string | null;
  stats: EngineStats;
  arrived: string;
};
type Listener<T> = (payload: T) => void;

const SUN_R = 7;
const GALAXY_CENTER = new THREE.Vector3(-320, -18, -380);
const GALAXY_R = 520;
const BELT_R = 51;
const OVERVIEW_POS = new THREE.Vector3(0, 78, 165);
const INTRO_POS = new THREE.Vector3(-320, 760, 260);
const ASSET = "/space/";

const AXIAL_TILT: Record<PlanetType, number> = {
  mercury: 0.01, venus: 0.05, earth: 0.41, mars: 0.44, jupiter: 0.05, saturn: 0.1, neptune: 0.49,
};
const GAS_GIANT = new Set<PlanetType>(["jupiter", "saturn", "neptune"]);

const QUALITY: Record<Quality, { dpr: number; bloom: number; msaa: number }> = {
  low: { dpr: 1, bloom: 0.5, msaa: 0 },
  medium: { dpr: 1.5, bloom: 0.5, msaa: 4 },
  high: { dpr: 2, bloom: 1, msaa: 4 },
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function glowTexture(inner = "rgba(255,255,255,1)") {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.2, "rgba(255,255,255,0.35)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.08)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface PlanetObj {
  data: Station;
  orbitPivot: THREE.Group; // quay quanh mặt trời
  body: THREE.Group; // vị trí hành tinh (con của orbitPivot)
  spin: THREE.Object3D; // tự quay quanh trục
  hit: THREE.Mesh; // mesh dùng để click
  radius: number;
  angle: number;
  spinSpeed: number;
  speed: number;
  orbitLine: THREE.LineLoop;
  label: CSS2DObject;
  extra?: (dt: number, t: number) => void;
}

export class SpaceEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private loader = new THREE.TextureLoader();

  private planets: PlanetObj[] = [];
  private timeUniforms: { value: number }[] = [];
  private galaxy?: THREE.Points;
  private belt?: THREE.InstancedMesh;
  private sun!: THREE.Mesh;
  private pixelRatioUniforms: { value: number }[] = [];

  private listeners: Partial<Record<keyof Events, Set<Listener<never>>>> = {};
  private timer = new THREE.Timer();
  private running = false;
  private t = 0;
  private fps = 60;
  private fpsFrames = 0;
  private fpsTime = 0;
  private lowFpsStreak = 0;
  private quality: Quality;
  private mode: QualityMode = "auto";
  private orbitSpeed = 1;

  // Camera bay: nội suy từ (fromPos, fromTarget) tới đích trong `flyDur` giây
  private flying = false;
  private flyT = 0;
  private flyDur = 2;
  private fromPos = new THREE.Vector3();
  private fromTarget = new THREE.Vector3();
  private toPos = new THREE.Vector3();
  private toTarget = new THREE.Vector3();
  private focus: PlanetObj | null = null;
  private introDone = false;
  private hoverId: string | null = null;

  private _v = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private _prevFocusPos = new THREE.Vector3();
  private _ray = new THREE.Raycaster();
  private _ndc = new THREE.Vector2();
  private disposers: (() => void)[] = [];

  constructor(container: HTMLElement, stations: Station[], opts: { quality?: QualityMode } = {}) {
    this.container = container;
    this.mode = opts.quality ?? "auto";
    this.quality = this.mode === "auto" ? this.guessQuality() : this.mode;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.setAttribute("data-testid", "world-canvas");
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    Object.assign(this.labelRenderer.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    this.labelRenderer.domElement.className = "label-layer";
    container.appendChild(this.labelRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    this.camera.position.copy(INTRO_POS);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 420;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.8;
    this.controls.target.copy(GALAXY_CENTER);
    this.controls.enabled = false;

    // Hậu kỳ: Render → Bloom → Output (tone mapping + sRGB)
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: QUALITY[this.quality].msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.scene.add(new THREE.AmbientLight("#8090c0", 0.06));

    const lowEnd = this.quality === "low";
    this.buildSky(lowEnd);
    this.buildGalaxy(lowEnd ? 35000 : this.quality === "medium" ? 80000 : 120000);
    this.buildSun();
    stations.forEach((s, i) => this.buildPlanet(s, i));
    this.buildBelt(lowEnd ? 900 : 2200);

    this.applyQuality(this.quality);
    this.bindEvents();
    this.resize();
    this.start();
  }

  /* ----------------------------- Public API ----------------------------- */

  on<K extends keyof Events>(event: K, cb: Listener<Events[K]>) {
    const set = (this.listeners[event] ??= new Set()) as unknown as Set<Listener<Events[K]>>;
    set.add(cb);
    return () => set.delete(cb);
  }

  /** Mở màn: bay từ ngoài thiên hà vào hệ mặt trời */
  startJourney() {
    if (this.introDone) return;
    this.introDone = true;
    this.flyTo(OVERVIEW_POS, new THREE.Vector3(0, 0, 0), 5.5);
  }

  /** Bay tới 1 hành tinh và bám theo nó trên quỹ đạo */
  focusOn(id: string) {
    const p = this.planets.find((pl) => pl.data.id === id);
    if (!p) return false;
    this.introDone = true;
    this.focus = p;
    p.body.getWorldPosition(this._v);
    this._prevFocusPos.copy(this._v);
    // Đặt camera ở phía được mặt trời chiếu (thấy rõ mặt sáng), hơi chếch lên và sang bên
    const out = this._v2.copy(this._v).normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const ringed = p.data.planet.type === "saturn";
    const dist = p.radius * (ringed ? 5.2 : 4.2);
    const pos = this._v.clone().addScaledVector(out, -dist * 0.55).addScaledVector(side, dist * 0.75).add(new THREE.Vector3(0, dist * 0.35, 0));
    // Dịch tâm nhìn sang PHẢI hành tinh → hành tinh nằm ở nửa trái màn hình, không bị panel che.
    // Màn dọc (điện thoại, panel ở dưới) → dịch tâm nhìn xuống để hành tinh nằm nửa trên.
    const dir = this._v.clone().sub(pos).normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const portrait = this.camera.aspect < 1;
    const shift = p.radius * (ringed ? 2.4 : 1.7);
    const target = portrait
      ? this._v.clone().add(new THREE.Vector3(0, -shift * 0.9, 0))
      : this._v.clone().addScaledVector(right, shift);
    this.flyTo(pos, target, 2.2);
    this.orbitSpeed = 0.12; // hành tinh chậm lại khi đang xem
    this.updateLabels();
    return true;
  }

  overview() {
    this.focus = null;
    this.orbitSpeed = 1;
    this.flyTo(OVERVIEW_POS, new THREE.Vector3(0, 0, 0), 2.2);
    this.updateLabels();
  }

  setQuality(mode: QualityMode) {
    this.mode = mode;
    this.lowFpsStreak = 0;
    this.applyQuality(mode === "auto" ? this.guessQuality() : mode);
  }

  getState(): EngineStats {
    const info = this.renderer.info.render;
    return {
      fps: Math.round(this.fps),
      drawCalls: info.calls,
      triangles: info.triangles,
      dpr: this.renderer.getPixelRatio(),
      quality: this.quality,
      mode: this.mode,
      focusId: this.focus?.data.id ?? null,
      camera: this.camera.position.toArray().map((v) => Math.round(v)) as [number, number, number],
      flying: this.flying,
    };
  }

  listStations() {
    return this.planets.map((p) => ({ id: p.data.id, title: p.data.title, planet: p.data.planet.type }));
  }

  dispose() {
    this.stop();
    this.disposers.forEach((d) => d());
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((mat) => {
        Object.values(mat).forEach((v) => v instanceof THREE.Texture && v.dispose());
        const u = (mat as THREE.ShaderMaterial).uniforms;
        if (u) Object.values(u).forEach((x) => x.value instanceof THREE.Texture && x.value.dispose());
        mat.dispose();
      });
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }

  /* ------------------------------ Builders ------------------------------ */

  private time() {
    const u = { value: 0 };
    this.timeUniforms.push(u);
    return u;
  }

  private buildSky(lowEnd: boolean) {
    // Tinh vân làm nền
    const nebula = new THREE.Mesh(
      new THREE.SphereGeometry(2400, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: S.NEBULA_VERT, fragmentShader: S.NEBULA_FRAG, side: THREE.BackSide, depthWrite: false }),
    );
    this.scene.add(nebula);

    // Sao xa: nhiệt độ màu từ xanh trắng → vàng cam như sao thật
    const rand = mulberry32(11);
    const N = lowEnd ? 3500 : 7000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const polar = new Float32Array(N * 3);
    const tints = [new THREE.Color("#a9c4ff"), new THREE.Color("#ffffff"), new THREE.Color("#fff1d6"), new THREE.Color("#ffd2a1")];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = 1300 + rand() * 800;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * r, u * r, Math.sin(th) * s * r], i * 3);
      c.copy(tints[Math.floor(rand() * tints.length)]).multiplyScalar(0.6 + rand() * 0.9);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = rand() < 0.03 ? 4 + rand() * 4 : 1 + rand() * 2.2;
      polar.set([0, rand() * 10, 0], i * 3);
    }
    this.scene.add(this.makePoints(pos, col, size, polar, { scale: 3.2, spin: 0, hole: 0 }));
  }

  private makePoints(
    pos: Float32Array, col: Float32Array, size: Float32Array, polar: Float32Array,
    o: { scale: number; spin: number; hole: number },
  ) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aPolar", new THREE.BufferAttribute(polar, 3));
    const pr = { value: 1 };
    this.pixelRatioUniforms.push(pr);
    const mat = new THREE.ShaderMaterial({
      vertexShader: S.POINTS_VERT,
      fragmentShader: S.POINTS_FRAG,
      uniforms: {
        uTime: this.time(), uPixelRatio: pr, uScale: { value: o.scale },
        uSpin: { value: o.spin }, uHoleR: { value: o.hole },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  /** Thiên hà xoắn ốc 4 nhánh + lõi phình. Hệ mặt trời nằm ở rìa 1 nhánh, y như vị trí thật của Mặt Trời */
  private buildGalaxy(N: number) {
    const rand = mulberry32(2024);
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const polar = new Float32Array(N * 3);
    const core = new THREE.Color("#ffe2b0");
    const arm = new THREE.Color("#8fb4ff");
    const pink = new THREE.Color("#ff7fc8");
    const c = new THREE.Color();
    const ARMS = 4;
    const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
    for (let i = 0; i < N; i++) {
      const bulge = i < N * 0.18;
      let r: number, ang: number, y: number;
      if (bulge) {
        r = Math.abs(gauss()) * GALAXY_R * 0.22;
        ang = rand() * Math.PI * 2;
        y = gauss() * GALAXY_R * 0.06 * (1 - r / (GALAXY_R * 0.25));
      } else {
        r = Math.pow(rand(), 0.8) * GALAXY_R;
        const a = Math.floor(rand() * ARMS) * ((Math.PI * 2) / ARMS);
        const scatter = gauss() * (0.25 + 0.35 * (1 - r / GALAXY_R));
        ang = a + r * 0.0105 + scatter;
        y = gauss() * GALAXY_R * 0.018;
      }
      pos.set([Math.cos(ang) * r, y, Math.sin(ang) * r], i * 3);
      polar.set([r, ang, y], i * 3);
      const t = Math.min(r / (GALAXY_R * 0.55), 1);
      c.copy(core).lerp(arm, t);
      if (!bulge && rand() < 0.06) c.copy(pink); // vùng hình thành sao màu hồng
      c.multiplyScalar(bulge ? 1.6 : 0.55 + rand() * 0.8);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = bulge ? 2 + rand() * 3 : 1.2 + rand() * 2.6;
    }
    const pts = this.makePoints(pos, col, size, polar, { scale: 2.2, spin: 0.0025, hole: 70 });
    pts.position.copy(GALAXY_CENTER);
    pts.rotation.z = 0.04;
    this.galaxy = pts;
    this.scene.add(pts);

    // Quầng sáng lõi thiên hà
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: "#ffcf9a", transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.position.copy(GALAXY_CENTER);
    glow.scale.setScalar(GALAXY_R * 0.9);
    this.scene.add(glow);
  }

  private buildSun() {
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_R, 96, 64),
      new THREE.ShaderMaterial({ vertexShader: S.PLANET_VERT, fragmentShader: S.SUN_FRAG, uniforms: { uTime: this.time() } }),
    );
    this.scene.add(this.sun);

    // Quầng sáng (corona) nhiều lớp
    const tex = glowTexture();
    for (const [scale, color, op] of [[SUN_R * 4.5, "#ffb35c", 0.85], [SUN_R * 10, "#ff7a2e", 0.25], [SUN_R * 20, "#ff6a8a", 0.06]] as const) {
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.scale.setScalar(scale);
      this.scene.add(g);
    }

    // Đèn chính: mặt trời chiếu sáng các vật có material chuẩn (mặt trăng, tiểu hành tinh, mây)
    const light = new THREE.PointLight("#fff4e6", 3.2, 0, 0);
    this.scene.add(light);

  }

  private planetMaterial(s: Station) {
    const u = { uTime: this.time() };
    const v3 = (h: string) => new THREE.Vector3().setFromColor(new THREE.Color(h));
    const gas = (c1: string, c2: string, c3: string, c4: string, bands: number, storm = 0, stormC = "#9e3820") =>
      new THREE.ShaderMaterial({
        vertexShader: S.PLANET_VERT, fragmentShader: S.GAS_FRAG,
        uniforms: {
          ...u, uC1: { value: v3(c1) }, uC2: { value: v3(c2) }, uC3: { value: v3(c3) }, uC4: { value: v3(c4) },
          uBands: { value: bands }, uStorm: { value: storm }, uStormC: { value: v3(stormC) },
        },
      });
    switch (s.planet.type) {
      case "mercury": {
        // Sao Thuỷ dùng lại ảnh Mặt Trăng, nhuộm nâu xám: cũng là đá đầy miệng hố
        const t = this.loader.load(ASSET + "moon_1024.jpg");
        t.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({ map: t, color: "#c9b5a2", roughness: 1, metalness: 0, bumpMap: t, bumpScale: 1.5 });
      }
      case "venus":
        return gas("#f1d9a6", "#d8b47a", "#fff0cf", "#b99766", 5);
      case "mars":
        return new THREE.ShaderMaterial({ vertexShader: S.PLANET_VERT, fragmentShader: S.MARS_FRAG, uniforms: u });
      case "jupiter":
        return gas("#e8d6b8", "#b9805a", "#f4eadb", "#6f5a50", 22, 1);
      case "saturn":
        return gas("#f0dcae", "#cfae74", "#fff3d6", "#a08a66", 14);
      case "neptune":
        return gas("#4f7fe0", "#2c4fb0", "#8fb4ff", "#1b2f7a", 9, 1, "#14205a");
      case "earth": {
        const tex = (f: string) => {
          const t = this.loader.load(ASSET + f);
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          return t;
        };
        const spec = this.loader.load(ASSET + "earth_specular_2048.jpg");
        return new THREE.ShaderMaterial({
          vertexShader: S.EARTH_VERT, fragmentShader: S.EARTH_FRAG,
          uniforms: { ...u, uDay: { value: tex("earth_atmos_2048.jpg") }, uNight: { value: tex("earth_lights_2048.png") }, uSpec: { value: spec } },
        });
      }
    }
  }

  private atmosphere(radius: number, color: string, strength: number, scale = 1.06) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(radius * scale, 64, 48),
      new THREE.ShaderMaterial({
        vertexShader: S.ATMO_VERT, fragmentShader: S.ATMO_FRAG,
        uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uSunlit: { value: 1 } },
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    return m;
  }

  private buildPlanet(s: Station, index: number) {
    const { radius, orbit, start, type } = s.planet;
    const orbitPivot = new THREE.Group();
    const body = new THREE.Group();
    body.position.set(orbit, 0, 0);
    orbitPivot.add(body);
    orbitPivot.rotation.y = start;
    // Quỹ đạo hơi nghiêng 1 chút cho tự nhiên
    const tilt = new THREE.Group();
    tilt.rotation.x = (index % 2 ? 1 : -1) * 0.025 * (index + 1) * 0.4;
    tilt.add(orbitPivot);
    this.scene.add(tilt);

    const spin = new THREE.Group();
    spin.rotation.z = AXIAL_TILT[type]; // độ nghiêng trục
    body.add(spin);

    const mat = this.planetMaterial(s);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
    spin.add(sphere);
    let extra: PlanetObj["extra"];

    if (type === "earth") {
      const clouds = this.loader.load(ASSET + "earth_clouds_1024.png");
      clouds.colorSpace = THREE.SRGBColorSpace;
      const cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.012, 96, 64),
        new THREE.MeshStandardMaterial({ map: clouds, transparent: true, depthWrite: false, roughness: 1, opacity: 0.9 }),
      );
      spin.add(cloudMesh);
      body.add(this.atmosphere(radius, "#4f8fff", 1.5, 1.06));
      // Mặt Trăng quay quanh Trái Đất (ảnh thật, ánh sáng mặt trời chuẩn)
      const moonTex = this.loader.load(ASSET + "moon_1024.jpg");
      moonTex.colorSpace = THREE.SRGBColorSpace;
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.27, 48, 32),
        new THREE.MeshStandardMaterial({ map: moonTex, roughness: 1, metalness: 0, bumpMap: moonTex, bumpScale: 1.5 }),
      );
      moon.position.set(radius * 2.7, 0, 0);
      const moonPivot = new THREE.Group();
      moonPivot.rotation.x = 0.09;
      moonPivot.add(moon);
      body.add(moonPivot);
      extra = (dt) => {
        cloudMesh.rotation.y += dt * 0.012;
        moonPivot.rotation.y += dt * 0.35;
      };
    } else if (type === "venus") {
      body.add(this.atmosphere(radius, "#ffd59a", 1.1, 1.07));
    } else if (type === "mars") {
      body.add(this.atmosphere(radius, "#ff8a5a", 0.7, 1.04));
    } else if (type === "jupiter") {
      body.add(this.atmosphere(radius, "#ffcf9e", 0.6, 1.05));
    } else if (type === "neptune") {
      body.add(this.atmosphere(radius, "#5c8dff", 1.4, 1.07));
    } else if (type === "saturn") {
      body.add(this.atmosphere(radius, "#ffe2a6", 0.5, 1.05));
      const inner = radius * 1.35, outer = radius * 2.5;
      const ringMat = new THREE.ShaderMaterial({
        vertexShader: S.RING_VERT, fragmentShader: S.RING_FRAG,
        uniforms: {
          uInner: { value: inner }, uOuter: { value: outer }, uColor: { value: new THREE.Color("#e9d3a6") },
          uPlanetPos: { value: new THREE.Vector3() }, uPlanetR: { value: radius },
        },
        transparent: true, side: THREE.DoubleSide, depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160, 1), ringMat);
      ring.rotation.x = -Math.PI / 2 + 0.42;
      body.add(ring);
      extra = () => body.getWorldPosition(ringMat.uniforms.uPlanetPos.value);
    }

    // Quỹ đạo: vòng tròn mờ, sáng lên khi hover / chọn
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * orbit, 0, Math.sin(a) * orbit));
    }
    const orbitLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    tilt.add(orbitLine);

    // Nhãn HTML (CSS2D): chữ luôn sắc nét, bấm được
    const el = document.createElement("button");
    el.className = "planet-label";
    el.style.setProperty("--c", s.color);
    el.innerHTML = `<i></i><span>${s.title}</span>`;
    el.dataset.testid = `label-${s.id}`;
    el.addEventListener("click", () => this.emit("select", s.id));
    el.addEventListener("pointerenter", () => this.setHover(s.id));
    el.addEventListener("pointerleave", () => this.setHover(null));
    const label = new CSS2DObject(el);
    label.position.set(0, radius * 1.45 + 0.6, 0);
    body.add(label);

    // Hitbox to hơn hành tinh 1 chút → dễ bấm cả hành tinh nhỏ
    const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(radius * 1.3, 2.5), 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.id = s.id;
    body.add(hit);

    this.planets.push({
      data: s, orbitPivot, body, spin: sphere, hit, radius, angle: start,
      spinSpeed: GAS_GIANT.has(type) ? 0.18 : type === "venus" ? 0.03 : 0.08, // khí khổng lồ quay nhanh, Sao Kim rất chậm
      speed: 0.9 / Math.pow(orbit, 1.2), // định luật Kepler (gần đúng): xa hơn → chậm hơn
      orbitLine, label, extra,
    });
  }

  /** Vành đai tiểu hành tinh giữa quỹ đạo Sao Hoả và Sao Mộc */
  private buildBelt(N: number) {
    const rand = mulberry32(5);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    // làm méo đá cho tự nhiên
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const k = 0.75 + rand() * 0.5;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: "#8d8378", roughness: 1, flatShading: true }), N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = rand() * Math.PI * 2;
      const r = BELT_R + (rand() + rand() - 1) * 3.2;
      v.set(Math.cos(a) * r, (rand() - 0.5) * 1.4, Math.sin(a) * r);
      q.setFromEuler(e.set(rand() * 6, rand() * 6, rand() * 6));
      const k = rand() < 0.02 ? 0.35 + rand() * 0.3 : 0.06 + rand() * 0.16;
      s.set(k * (0.7 + rand() * 0.6), k * (0.7 + rand() * 0.6), k);
      mesh.setMatrixAt(i, m.compose(v, q, s));
      mesh.setColorAt(i, c.setHSL(0.07, 0.15 + rand() * 0.15, 0.35 + rand() * 0.25));
    }
    this.belt = mesh;
    this.scene.add(mesh);
  }

  /* ------------------------------- Quality ------------------------------ */

  private guessQuality(): Quality {
    const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const cores = navigator.hardwareConcurrency ?? 4;
    if (mobile || cores <= 4) return "low";
    if (cores >= 8) return "high";
    return "medium";
  }

  private applyQuality(q: Quality) {
    this.quality = q;
    const cfg = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.dpr));
    const rt1 = this.composer.renderTarget1, rt2 = this.composer.renderTarget2;
    if (rt1.samples !== cfg.msaa) {
      rt1.samples = rt2.samples = cfg.msaa;
      rt1.dispose();
      rt2.dispose();
    }
    this.resize();
  }

  private autoTune() {
    if (this.mode !== "auto") return;
    this.lowFpsStreak = this.fps < 40 ? this.lowFpsStreak + 1 : 0;
    if (this.lowFpsStreak >= 4 && this.quality !== "low") {
      this.lowFpsStreak = 0;
      this.applyQuality(this.quality === "high" ? "medium" : "low");
    }
  }

  /* ------------------------------- Events ------------------------------- */

  private bindEvents() {
    const cv = this.renderer.domElement;
    let downX = 0, downY = 0;
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
    const pick = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect();
      this._ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this._ray.setFromCamera(this._ndc, this.camera);
      const hit = this._ray.intersectObjects(this.planets.map((p) => p.hit), false)[0];
      return (hit?.object.userData.id as string | undefined) ?? null;
    };
    const onUp = (e: PointerEvent) => {
      if (!this.introDone || Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const id = pick(e);
      if (id) this.emit("select", id);
    };
    let lastMove = 0;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastMove < 50 || e.buttons) return; // giới hạn 20 lần/giây, bỏ qua khi đang kéo
      lastMove = now;
      this.setHover(this.introDone ? pick(e) : null);
    };
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointermove", onMove);
    // Người dùng tự kéo/zoom → huỷ đường bay tự động
    const onStart = () => { this.flying = false; };
    this.controls.addEventListener("start", onStart);
    const onVis = () => (document.hidden ? this.stop() : this.start());
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.container);
    this.disposers.push(() => {
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointermove", onMove);
      this.controls.removeEventListener("start", onStart);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
    });
  }

  private setHover(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.renderer.domElement.style.cursor = id ? "pointer" : "";
    this.updateLabels();
    this.emit("hover", id);
  }

  private updateLabels() {
    for (const p of this.planets) {
      const active = p.data.id === this.hoverId || p === this.focus;
      p.label.element.classList.toggle("active", active);
      p.label.element.classList.toggle("dim", !!this.focus && p !== this.focus);
      p.label.element.classList.toggle("focused", p === this.focus);
      (p.orbitLine.material as THREE.LineBasicMaterial).opacity = active ? 0.6 : this.focus ? 0.06 : 0.16;
    }
  }

  private emit<K extends keyof Events>(event: K, payload: Events[K]) {
    this.listeners[event]?.forEach((cb) => (cb as unknown as Listener<Events[K]>)(payload));
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const b = QUALITY[this.quality].bloom;
    this.bloom.resolution.set(w * b, h * b);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 68 : 50; // màn dọc (điện thoại) → góc nhìn rộng hơn
    this.camera.updateProjectionMatrix();
    this.pixelRatioUniforms.forEach((u) => (u.value = this.renderer.getPixelRatio()));
  }

  /* ------------------------------- Camera ------------------------------- */

  private flyTo(pos: THREE.Vector3, target: THREE.Vector3, dur: number) {
    this.fromPos.copy(this.camera.position);
    this.fromTarget.copy(this.controls.target);
    this.toPos.copy(pos);
    this.toTarget.copy(target);
    this.flyDur = dur;
    this.flyT = 0;
    this.flying = true;
    this.controls.enabled = false;
  }

  private updateCamera(dt: number) {
    // Đang bám theo 1 hành tinh: cộng thêm quãng hành tinh vừa di chuyển cho cả camera và tâm nhìn
    if (this.focus) {
      this.focus.body.getWorldPosition(this._v);
      this._v2.copy(this._v).sub(this._prevFocusPos);
      this._prevFocusPos.copy(this._v);
      this.toPos.add(this._v2);
      this.toTarget.add(this._v2);
      if (!this.flying) {
        this.camera.position.add(this._v2);
        this.controls.target.add(this._v2);
      }
    }
    if (this.flying) {
      this.flyT = Math.min(this.flyT + dt / this.flyDur, 1);
      const k = easeInOut(this.flyT);
      // Bay theo đường cong: nâng camera lên giữa chặng → cảm giác "lướt" qua không gian
      this.camera.position.lerpVectors(this.fromPos, this.toPos, k);
      this.camera.position.y += Math.sin(k * Math.PI) * this.fromPos.distanceTo(this.toPos) * 0.12;
      this.controls.target.lerpVectors(this.fromTarget, this.toTarget, easeInOut(Math.min(this.flyT * 1.25, 1)));
      if (this.flyT >= 1) {
        this.flying = false;
        this.controls.enabled = true;
        if (this.focus) this.emit("arrived", this.focus.data.id);
      }
      this.camera.lookAt(this.controls.target);
    } else if (!this.introDone) {
      // Màn chờ: camera chậm rãi lượn quanh thiên hà
      const a = this.t * 0.03;
      this.camera.position.set(GALAXY_CENTER.x + Math.sin(a) * 640, 620 + Math.sin(this.t * 0.2) * 20, GALAXY_CENTER.z + Math.cos(a) * 640);
      this.camera.lookAt(GALAXY_CENTER);
    } else {
      this.controls.update();
    }
  }

  /* ------------------------------- Loop --------------------------------- */

  private start() {
    if (this.running) return;
    this.running = true;
    this.timer.reset();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.t += dt;
    this.renderer.info.reset();
    for (const u of this.timeUniforms) u.value = this.t;

    this.sun.rotation.y += dt * 0.02;
    for (const p of this.planets) {
      p.angle += p.speed * dt * this.orbitSpeed;
      p.orbitPivot.rotation.y = p.angle;
      p.spin.rotation.y += dt * p.spinSpeed;
      p.extra?.(dt, this.t);
    }
    if (this.belt) this.belt.rotation.y += dt * 0.006 * this.orbitSpeed;

    this.updateCamera(dt);
    this.composer.render(dt);
    this.labelRenderer.render(this.scene, this.camera);

    // FPS đo bằng thời gian thật (dt đã bị chặn 0.05s nên không dùng được để đo)
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsTime >= 500) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = now;
      this.autoTune();
      this.emit("stats", this.getState());
    }
  }
}
