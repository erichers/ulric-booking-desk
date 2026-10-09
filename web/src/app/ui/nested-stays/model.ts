// Nested stays 3D model: an architectural cutaway of the house, studio wing and cottage.
// three r170, WebGLRenderer, GTAO. Plan data (and the flagged guesses) live in plan.ts;
// procedural textures (textures.ts) show first; CC0 PBR maps, HDRI and glTF furniture (realism.ts) stream in after.
// Lazy-loaded by unit-stack.ts.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LEVELS, GRADE, ROOMS, WALLS, FURNITURE, COTTAGE_AT, STUDIO, EXTERIOR, ASSUMPTIONS } from './plan';
import { buildTextures, TEX_SIZE } from './textures';
import { createAssets, bind, EXTERIOR_SETS } from './realism';
import { runClash } from './clash';
import { boxGeo, rbox, worldUV, slopeUV, trisGeo, hipRoof, beam, buildWalls, buildTrim } from './geo';

const LIFT = 5.0;
const BACK = 2.2; // exploded floors also slide back a little so both levels read
const PITCH = 5 / 12;
const FULL_BSMT = ASSUMPTIONS.basementUnderWholeHouse;
// house shell (wall centre lines) and roof
const HOUSE = { x0: -5.8, x1: 5.8, z0: -4.2, z1: 4.2 };
const EAVE = 0.4;
const EY = LEVELS.main.height;
const ROOF = { x0: HOUSE.x0 - 0.1 - EAVE, x1: HOUSE.x1 + 0.1 + EAVE, z0: HOUSE.z0 - 0.1 - EAVE, z1: HOUSE.z1 + 0.1 + EAVE };
const RIDGE_Y = EY + ((ROOF.z1 - ROOF.z0) / 2) * PITCH;
const STUDIO_MID = { x: (STUDIO.x0 + STUDIO.x1) / 2, z: (STUDIO.z0 + STUDIO.z1) / 2 };
const COT = { hx: 3.65, hz: 1.85, t: 0.18 };

const FLOOR: any = {
  oak: { rough: 0.55 }, carpet: { rough: 0.95 }, concrete: { rough: 0.9 }, tile: { rough: 0.4 },
  deck: { rough: 0.8 }, stain: { rough: 0.22 }, lvp: { rough: 0.6 }, cork: { rough: 0.8 }, ptile: { rough: 0.3 },
};

// floor finish -> CC0 set. Carpet keeps its drawn pattern and takes the weave relief at the carpet tile.
const FLOOR_PBR: any = {
  oak: ['floor', { normal: 0.6 }], lvp: ['floor', { normal: 0.45, color: '#f1e6d4' }], cork: ['floor', { normal: 0.5, color: '#f0dcc0' }], tile: ['tile', { normal: 0.8 }], ptile: ['tile', { normal: 0.5, color: '#f3ece1' }], // ptile: large light porcelain (cottage photos)
  concrete: ['concrete', { normal: 0.6 }], stain: ['concrete', { normal: 0.35, color: '#f4b47c' }], deck: ['deck', { normal: 0.8 }],
  carpet: ['weave', { normal: 1.2, noMap: true, uvTile: 1.2 }],
};

const THEMES = {
  light: { lawn: '#c6dba8', lawnProc: '#ffffff', plinth: '#d3cabc', drive: '#dedad2', fence: '#e2d6c6', tree: '#dfe3d6', trunk: '#b9ab98', guide: '#1f1e1d', hemiG: '#d8d2c6', hemi: 0.45, key: 2.1, env: 0.9, cap: '#4a433c' },
  dark: { lawn: '#6d7d66', lawnProc: '#525d54', plinth: '#2a2f2b', drive: '#646a64', fence: '#646a63', tree: '#848a7f', trunk: '#5b5650', guide: '#f0eee6', hemiG: '#3a3833', hemi: 0.4, key: 2.2, env: 0.7, cap: '#2a2622' },
};

export type ViewMode = 'solid' | 'xray' | 'cutaway' | 'wire';
export type ControlMode = 'auto' | 'orbit' | 'walk';
export type MoveKey = 'forward' | 'back' | 'left' | 'right';

export interface NestedStays {
  pick(id: string | null): void;
  setTheme(dark: boolean, accent?: string): void;
  // solid, x-ray (shell see-through), cutaway (roofs off, walls cut), wireframe; picks highlight in every mode
  setViewMode(mode: ViewMode): void;
  // auto: fitted camera for the page; orbit: free orbit/pan/zoom; walk: first person at eye height
  setControl(mode: ControlMode): void;
  resetView(): void;
  // on-screen walk pad (touch); keyboard is handled inside
  setMove(key: MoveKey, on: boolean): void;
  // analog walk joystick (touch): x right, y forward, -1..1
  setJoy(x: number, y: number): void;
  state(): Record<string, unknown>;
  settle(frames?: number): void;
  stats(): Record<string, number | null>;
  dispose(): void;
}

export function createNestedStays(stage: HTMLElement, opts: any = {}): NestedStays {
  const units = opts.units;
  const colors = Object.assign({ terracotta: '#d97757' }, opts.colors || {});
  const TEX = buildTextures();
  // phones and small screens: 1024 HDRI, 1024 shadow map, phone texture set, DPR cap 1.5 (RUBRIC v2.2 budgets)
  const phone = opts.phone ?? (typeof window !== 'undefined' && (window.innerWidth < 768 || (window.matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 768)));
  const Q = { dprCap: phone ? 1.5 : 2, shadow: phone ? 1024 : 2048, steps: 0 };
  let roomLightsReady = false;
  // realism asset state (set by the lazy loaders further down)
  const R = { env: false, exterior: false, interior: false, furniture: 0, started: false, errors: 0 };

  const ownCanvas = !opts.canvas;
  const canvas: HTMLCanvasElement = opts.canvas || document.createElement('canvas');
  if (ownCanvas) {
    canvas.className = 'ns-canvas';
    stage.appendChild(canvas);
  }
  const labelLayer = document.createElement('div');
  labelLayer.className = 'ns-labels';
  stage.appendChild(labelLayer);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // Khronos PBR Neutral: the one tone mapper in this app (RUBRIC v2.2)
  renderer.toneMappingExposure = 1.0; // 0.8 to 1.2
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // re-rendered only when something moves
  renderer.setClearColor(0x000000, 0);
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  // indoor probe: neutral RoomEnvironment PMREM. Lights Walk (inside, the sky HDRI would tint white walls and steel blue);
  // the CC0 sky HDRI lights every outside view once it arrives.
  const roomEnvTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  let skyEnvTex: THREE.Texture | null = null;
  scene.environment = roomEnvTex;
  pmrem.dispose();
  scene.environmentIntensity = 0.9; // 0.5 to 1.5; RoomEnvironment until the CC0 HDRI (PMREM) arrives

  const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 200);

  const hemi = new THREE.HemisphereLight(0xfffaf2, 0xd8d2c6, 0.45);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff3e6, 2.1);
  key.position.set(15, 27, 9);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(key.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  // soft fill from the back-left so faces turned away from the key (plinth sides, back walls) don't go muddy
  const fill = new THREE.DirectionalLight(0xf2f4ff, 0.55);
  fill.position.set(-12, 14, -16);
  scene.add(fill);

  // ---- materials ----
  const M: any = {};
  const std = (color: any, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
  const XH = EXTERIOR.house, XC = EXTERIOR.cottage;
  M.wall = std('#ffffff', { roughness: 0.92, vertexColors: true });
  M.wall.userData.roomTint = '#f6f2ea';
  M.wall.userData.pbr = ['plaster', { normal: 0.35, noMap: true }];
  M.wallConc = std('#ffffff', { roughness: 0.95, vertexColors: true });
  M.wallConc.userData.roomTint = '#e3dfd7';
  M.wallConc.userData.pbr = ['plaster', { normal: 0.5, noMap: true }];
  M.cap = std('#4a433c', { roughness: 0.9 });
  M.slab = std('#ece7de');
  M.found = std('#d9d4cb', { map: TEX.concrete, roughness: 0.95 });
  M.found.userData.pbr = ['concrete', { normal: 0.6, color: '#f4f2ec' }];
  M.glass = new THREE.MeshStandardMaterial({ color: '#a9bccb', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false });
  M.glass.userData.glass = true;
  M.sill = std('#fbfaf6', { roughness: 0.55 });
  M.trimIn = std('#fbfaf6', { roughness: 0.4 }); // satin painted trim
  M.sidingHouse = std(XH.siding, { map: TEX.siding, roughness: 0.75 });
  M.sidingHouse.userData.pbr = ['siding', { normal: 0.8, noMap: true }]; // painted siding: colour from the photos, relief + roughness from the scan
  M.sidingCot = std(XC.siding, { map: TEX.siding, roughness: 0.75 });
  M.sidingCot.userData.pbr = ['siding', { normal: 0.8, noMap: true }];
  M.trimHouse = std(XH.trim, { roughness: 0.5 });
  M.trimCot = std(XC.trim, { roughness: 0.5 });
  M.leafWood = std(XH.door, { roughness: 0.55 });
  M.leafWhite = std(XH.trim, { roughness: 0.5 });
  M.leafBlack = std(XC.door, { roughness: 0.5 });
  M.roof = std(XH.roof, { map: TEX.shingle, roughness: 0.95, side: THREE.DoubleSide });
  M.roof.userData.pbr = ['shingle', { normal: 1.2, noMap: true }];
  M.roofCot = std(XC.roof, { map: TEX.shingle, roughness: 0.95, side: THREE.DoubleSide });
  M.roofCot.userData.pbr = ['shingle', { normal: 1.2, noMap: true }];
  M.ridge = std(new THREE.Color(XH.roof).multiplyScalar(0.8), { roughness: 0.95 });
  M.ridgeCot = std(new THREE.Color(XC.roof).multiplyScalar(0.8), { roughness: 0.95 });
  M.brick = std('#ffffff', { map: TEX.brick, roughness: 0.95 });
  M.brick.userData.pbr = ['brick', { normal: 1 }];
  M.white = std('#fbf9f5', { roughness: 0.5 });
  M.wood = std('#cdb79f', { roughness: 0.6 });
  M.wood.userData.pbr = ['oakveneer', { normal: 0.4, color: '#f2e6d6' }];
  M.dark = std('#5a534c', { roughness: 0.6 });
  M.dark.userData.pbr = ['walnut', { normal: 0.5, color: '#c9bcb0' }];
  M.sofa = std('#5c5049', { roughness: 0.95 }); // chocolate sectional in the living-room photos
  M.accent = std('#6f7f95', { roughness: 0.9 });
  M.green = std('#90947f', { roughness: 0.9 });
  M.wine = std('#8c4a43', { roughness: 0.8 });
  M.sage = std('#9fae98', { roughness: 0.8 });
  M.steel = std('#d4d6d7', { roughness: 0.22, metalness: 1 }); // metal fixture: reflects the HDRI
  M.yellow = std('#e9c95f', { roughness: 0.35 });
  M.cabinet = std('#f6f3ec', { roughness: 0.6 });
  M.cabinet.userData.pbr = ['plaster', { normal: 0.08, noMap: true }];
  M.counterW = std('#f1efea', { roughness: 0.35 });
  // kitchen photos 06-08: yellow tile backsplash, butcher-block counter by the range, white enamel coil range
  M.splash = std('#f2cb4e', { roughness: 0.22 });
  M.splash.userData.pbr = ['tile', { normal: 0.8, color: '#f6d873' }];
  M.dome = std('#fffaf0', { roughness: 0.4, emissive: '#fff1d8', emissiveIntensity: 1.2 });
  M.toasterRed = std('#a8302a', { roughness: 0.35, metalness: 0.2 });
  M.glassDark = std('#151719', { roughness: 0.08, metalness: 0.3 });
  M.grey = std('#8d9093', { roughness: 0.5 });
  M.iron = std('#1d1d1f', { roughness: 0.45, metalness: 0.6 }); // thin black steel bed frame (bedroom photo 11)
  M.honey = std('#b98250', { roughness: 0.55 }); // honey wood platform bed (basement photos)
  M.honey.userData.pbr = ['oak', { normal: 0.4, color: '#e2b98c' }];
  M.pillowGrey = std('#8f99a8', { roughness: 0.9 }); // slate-blue shams (bedroom photos 14-16)
  M.floral = std('#ffffff', { roughness: 0.9 }); // white accent pillow with a red coral/floral print (bedroom photos)
  M.pillowPat = std('#ffffff', { roughness: 0.9 }); // cottage shams: grey with a white lattice print
  M.pillowBlue = std('#ffffff', { roughness: 0.9 }); // studio accent: white with a slate-blue leaf print
  {
    const mk = (draw: (g: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; draw(cv.getContext('2d')!); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
    let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const sprigs = (g: CanvasRenderingContext2D, bg: string, cols: string[]) => {
      g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 26; k++) {
        const cx = r() * 256, cy = r() * 256, n = 5 + ((r() * 5) | 0);
        g.strokeStyle = cols[k % cols.length]; g.lineWidth = 3 + r() * 3; g.lineCap = 'round';
        for (let j = 0; j < n; j++) { const a = r() * Math.PI * 2, l = 10 + r() * 26; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(a + 0.5) * l * 0.6, cy + Math.sin(a + 0.5) * l * 0.6, cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke(); }
      }
    };
    M.floral.map = mk((g) => sprigs(g, '#fbfaf7', ['#c8392f', '#e0574a', '#a92a24']));
    M.pillowBlue.map = mk((g) => sprigs(g, '#f6f7f8', ['#5f7f9c', '#86a2b8']));
    M.pillowPat.map = mk((g) => {
      g.fillStyle = '#9ea6b0'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#f2f3f5'; g.lineWidth = 4;
      for (let x = 0; x <= 256; x += 64) for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.ellipse(x, y, 22, 22, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(x + 32, y + 32, 9, 9, 0, 0, Math.PI * 2); g.stroke(); }
    });
  }
  M.fridge = std('#cfd2d4', { roughness: 0.3, metalness: 0.75 }); // brushed stainless reads lighter than a mirror
  M.splashW = std('#f3f3f0', { roughness: 0.2 }); // white subway tile (cottage galley)
  M.splashW.userData.pbr = ['tile', { normal: 0.8, color: '#f6f6f3' }];
  M.butcher = std('#d8b483', { roughness: 0.5 });
  M.butcher.userData.pbr = ['oak', { normal: 0.35, color: '#efd6b0' }];
  for (const k of ['sofa', 'accent', 'green', 'wine', 'sage']) M[k].userData.pbr = ['weave', { normal: 1, noMap: true }]; // tints matched to the photos
  M.linen = std('#ffffff', { roughness: 0.9 });
  M.linen.userData.pbr = ['cotton', { normal: 0.8, noMap: true }];
  M.throw = std('#e7ddd0', { roughness: 0.95 });
  M.throw.userData.pbr = ['linen', { normal: 0.9, noMap: true }];
  M.rug = std('#ffffff', { roughness: 1, map: TEX.rug });
  M.duvet = std('#e9e7e1', { roughness: 0.95 });
  M.duvet.userData.pbr = ['cotton', { normal: 1, noMap: true }];
  M.upholstery = std('#45423f', { roughness: 0.95 });
  M.upholstery.userData.pbr = ['weave', { normal: 1, noMap: true }];
  M.throwBlue = std('#7f9dc4', { roughness: 0.95 }); // studio: blue knit throw
  M.throwBlue.userData.pbr = ['linen', { normal: 1, noMap: true }];
  M.quilt = std('#b7bcc3', { roughness: 0.95 }); // cottage: grey-blue quilt
  for (const k of ['duvet', 'quilt', 'throw']) M[k].side = THREE.DoubleSide; // draped single-sheet bedding
  M.quilt.userData.pbr = ['cotton', { normal: 1.2, noMap: true }];
  {
    // grey matelasse quilt (cottage photos 09-11): stitched diamond lattice with small scroll medallions, tiling map
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#a8b2bf'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#7b8695'; g.lineWidth = 4;
    for (let i = -256; i <= 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke(); }
    g.strokeStyle = '#eef0f2'; g.lineWidth = 2;
    g.lineWidth = 3; for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128], [256, 0], [0, 256], [256, 256], [256, 128], [128, 256]]) { g.beginPath(); g.ellipse(x, y, 24, 16, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(x, y, 10, 7, 0, 0, Math.PI * 2); g.stroke(); }
    const tq = new THREE.CanvasTexture(cv); tq.colorSpace = THREE.SRGBColorSpace; tq.wrapS = tq.wrapT = THREE.RepeatWrapping;
    M.quilt.map = tq; M.quilt.color.set('#ffffff');
  }
  M.beam = std('#c7895a', { roughness: 0.6 }); // studio: stained wood ceiling beams
  M.beam.userData.pbr = ['oakveneer', { normal: 0.5, color: '#d79a66' }];
  M.ceramic = std('#efeae2', { roughness: 0.3 });
  M.shade = new THREE.MeshStandardMaterial({ color: '#f4e8d4', roughness: 0.9, emissive: new THREE.Color('#ffc98a'), emissiveIntensity: 0.5, side: THREE.DoubleSide });
  M.rug.userData.pbr = ['weave', { normal: 1.2, noMap: true, uvTile: 3 }];
  M.kraft = std('#d4bf9e', { roughness: 0.95 });
  M.black = std('#2c2a28', { roughness: 0.6 });
  M.navy = std('#1a2134', { roughness: 0.42 }); // navy leather recliner (living photos)
  M.cherry = std('#3d2a22', { roughness: 0.35 }); // cherry-stained coffee table
  M.brass = std('#c9a45c', { roughness: 0.3, metalness: 1 }); // fireplace screen doors
  M.rugred = std('#7a3f35', { roughness: 1 }); // hearth mat
  M.bookA = std('#3f5a7a', { roughness: 0.7 }); M.bookB = std('#e6dccb', { roughness: 0.8 }); M.bookC = std('#56684d', { roughness: 0.7 }); M.bookD = std('#2b2b2e', { roughness: 0.6 });
  M.lawn = std('#ffffff', { map: TEX.lawn, roughness: 1 });
  M.lawn.userData.pbr = ['grass', { normal: 0.8 }];
  M.plinthSide = std('#d3cabc', { roughness: 1 });
  M.drive = std('#dedad2', { roughness: 0.95 });
  M.drive.userData.pbr = ['concrete', { normal: 0.6 }];
  M.fence = std('#e2d6c6', { roughness: 0.9 });
  M.tree = std('#dfe3d6', { roughness: 0.95, flatShading: true });
  M.trunk = std('#b9ab98', { roughness: 0.95 });
  M.stair = std('#cfc8bd', { roughness: 0.9 });
  M.deck = std('#cdbfae', { map: TEX.deck, roughness: 0.8 });
  M.deck.userData.pbr = ['deck', { normal: 0.8, color: '#e2d8cc' }];
  const WALL_MAT: any = {
    core: M.wall, conc: M.wallConc, 'skin:house': M.sidingHouse, 'skin:cottage': M.sidingCot,
    'trim:house': M.trimHouse, 'trim:cottage': M.trimCot, 'trim:in': M.sill, glass: M.glass,
    'leaf:wood': M.leafWood, 'leaf:white': M.leafWhite, 'leaf:black': M.leafBlack,
  };
  const UV_OF: any = { 'skin:house': TEX_SIZE.siding, 'skin:cottage': TEX_SIZE.siding, core: TEX_SIZE.plaster, conc: TEX_SIZE.plaster };

  const norm = (geos: THREE.BufferGeometry[]): THREE.BufferGeometry[] => {
    const list = geos.map((g: any) => (g.index ? g.toNonIndexed() : g));
    const keys = Object.keys(list[0].attributes).filter((k: any) => list.every((g: any) => g.attributes[k]));
    for (const g of list) for (const k of Object.keys(g.attributes)) if (!keys.includes(k)) g.deleteAttribute(k);
    return list;
  };
  const occluders: any[] = [];
  // interior paint per room, read off the listing photos (sage living/dining, yellow kitchen, cream and pale green
  // bedrooms, white studio and cottage). Each wall face takes the colour of the room it faces (vertex colours).
  const PAINT: any = {
    living: '#c8d5bd', dining: '#c8d5bd', hall: '#d3dcc8', kitchen: '#f7d867', 'bed-a': '#f6e2a8', 'bed-b': '#e2e7d1',
    'bsmt-bed': '#efe8d6', 'bsmt-office': '#ece7dc', 'cottage-room': '#f1ebdf', 'studio-room': '#eef1f3', // studio photos read neutral-cool white
  };
  const tmpC = new THREE.Color();
  function tintByRoom(g: THREE.BufferGeometry, level: string, base: string) {
    const p = g.attributes['position'], n = g.attributes['normal'];
    const col = new Float32Array(p.count * 3);
    const rooms = ROOMS.filter((r: any) => r.level === level && !r.outdoor);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + n.getX(i) * 0.06, z = p.getZ(i) + n.getZ(i) * 0.06;
      // wall ends run past the room rect (into the corner / through the partition): let the rect reach 0.25 m along
      // the wall's own direction so the last vertices of a wall still take the room's paint (no white corner strips)
      const ex = Math.abs(n.getX(i)) > 0.5 ? 0 : 0.25, ez = Math.abs(n.getZ(i)) > 0.5 ? 0 : 0.25;
      const inR = (e1: number, e2: number) => rooms.find((r: any) => r.rects.some(([x0, x1, z0, z1]: any) => x > x0 - e1 && x < x1 + e1 && z > z0 - e2 && z < z1 + e2));
      const hit = Math.abs(n.getY(i)) < 0.5 ? inR(0, 0) || inR(ex, ez) : null;
      tmpC.set((hit && PAINT[hit.id]) || base);
      col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const meshOf = (geos: THREE.BufferGeometry[], mat: any, { occ = false, uv = 0, shadow = true, level = '' } = {}): any => {
    if (!geos || !geos.length) return null;
    const g = mergeGeometries(norm(geos), false);
    if (uv) worldUV(g, uv);
    if (mat.userData?.roomTint) tintByRoom(g, level, mat.userData.roomTint);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadow && !mat.userData?.glass;
    m.receiveShadow = true;
    if (occ) occluders.push(m);
    return m;
  };

  const root = new THREE.Group();
  scene.add(root);
  const lot = new THREE.Group();
  const bsmt = new THREE.Group();
  const main = new THREE.Group();
  const mainRoof = new THREE.Group();
  const cottage = new THREE.Group();
  const cottageRoof = new THREE.Group();
  const frontBlock = new THREE.Group();
  root.add(lot, bsmt, main, cottage);
  main.add(mainRoof);
  cottage.add(cottageRoof);
  cottage.position.set(COTTAGE_AT.x, 0, COTTAGE_AT.z);

  // materials that fade together when a level opens
  const fadeSets: any = { main: [], bsmt: [], cottage: [], fence: [] };
  const fadeCache = new Map<string, any>();
  const fadeMat = (key: any, mat: any) => {
    const id = `${key}|${mat.uuid}`;
    if (fadeCache.has(id)) return fadeCache.get(id);
    const m = mat.clone();
    m.userData = { ...mat.userData, base: mat.transparent ? mat.opacity : 1 };
    fadeSets[key].push(m);
    fadeCache.set(id, m);
    return m;
  };

  // ---- lot / plinth with basement pit ----
  let plinthSolid: any = null, plinthOpen: any = null;
  const LOT = { x0: Math.min(-10.4, COTTAGE_AT.x - COT.hx - 3.0), x1: Math.max(12.8, STUDIO.x1 + 3.2), z0: Math.min(-14.8, COTTAGE_AT.z - COT.hz - 4.8), z1: 7.8 };
  {
    const hx = HOUSE.x1 + 0.15, hz0 = HOUSE.z0 - 0.16, hz1 = FULL_BSMT ? HOUSE.z1 + 0.16 : 0.75;
    const { x0, x1, z0, z1 } = LOT, r = 1.0;
    // U-shaped plinth: the strip in front of the basement is a separate block that sinks
    // away when the basement opens, so the basement reads as a clean section.
    const sh = new THREE.Shape();
    sh.moveTo(x0 + r, z0); sh.lineTo(x1 - r, z0); sh.quadraticCurveTo(x1, z0, x1, z0 + r);
    sh.lineTo(x1, z1 - r); sh.quadraticCurveTo(x1, z1, x1 - r, z1);
    sh.lineTo(hx, z1); sh.lineTo(hx, hz0); sh.lineTo(-hx, hz0); sh.lineTo(-hx, z1);
    sh.lineTo(x0 + r, z1);
    sh.quadraticCurveTo(x0, z1, x0, z1 - r); sh.lineTo(x0, z0 + r); sh.quadraticCurveTo(x0, z0, x0 + r, z0);
    const depth = 2.4;
    const extrude = (shape: THREE.Shape) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
      g.rotateX(Math.PI / 2); // shape (x, y) -> world (x, z); extrusion goes down
      g.translate(0, GRADE, 0);
      const pos = g.attributes['position'], uv = g.attributes['uv'];
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 6, pos.getZ(i) / 6);
      return g;
    };
    const plinth = new THREE.Mesh(extrude(sh), [M.lawn, M.plinthSide]);
    plinth.receiveShadow = true;
    lot.add(plinth);
    occluders.push(plinth);
    // closed state: one solid plinth (hole only under the house), so the front lawn has no seam
    const solid = new THREE.Shape();
    solid.moveTo(x0 + r, z0); solid.lineTo(x1 - r, z0); solid.quadraticCurveTo(x1, z0, x1, z0 + r);
    solid.lineTo(x1, z1 - r); solid.quadraticCurveTo(x1, z1, x1 - r, z1);
    solid.lineTo(x0 + r, z1); solid.quadraticCurveTo(x0, z1, x0, z1 - r); solid.lineTo(x0, z0 + r); solid.quadraticCurveTo(x0, z0, x0 + r, z0);
    const hole = new THREE.Path();
    hole.moveTo(-hx, hz0); hole.lineTo(-hx, hz1); hole.lineTo(hx, hz1); hole.lineTo(hx, hz0); hole.lineTo(-hx, hz0);
    solid.holes.push(hole);
    plinthSolid = new THREE.Mesh(extrude(solid), [M.lawn, M.plinthSide]);
    plinthSolid.receiveShadow = true;
    lot.add(plinthSolid);
    occluders.push(plinthSolid);
    plinthOpen = plinth;
    const fb = new THREE.Shape();
    fb.moveTo(-hx, hz1); fb.lineTo(hx, hz1); fb.lineTo(hx, z1); fb.lineTo(-hx, z1); fb.lineTo(-hx, hz1);
    const fbm = new THREE.Mesh(extrude(fb), [M.lawn, M.plinthSide]);
    fbm.receiveShadow = true;
    frontBlock.add(fbm);
    occluders.push(fbm);
    // front walk from the front door to the lot edge
    frontBlock.add(meshOf([boxGeo(1.2, 0.04, z1 - (HOUSE.z1 + 1.3), -5.0, GRADE + 0.02, (z1 + HOUSE.z1 + 1.3) / 2)], M.drive, { shadow: false }));
    lot.add(frontBlock);
    // pit floor under the basement
    lot.add(new THREE.Mesh(boxGeo(2 * hx, 0.1, hz1 - hz0, 0, GRADE - depth + 0.05, (hz0 + hz1) / 2), M.plinthSide));
    // driveway in front of the studio, garden path toward the cottage
    const flat = [
      boxGeo(3.0, 0.04, z1 - STUDIO.z1 - 0.5, STUDIO_MID.x + 0.1, GRADE + 0.02, (z1 + STUDIO.z1 + 0.5) / 2),
      boxGeo(1.0, 0.04, 5.6, 0.0, GRADE + 0.02, HOUSE.z0 - 3.2),
      boxGeo(Math.abs(COTTAGE_AT.x + 4.0) + 1.0, 0.04, 1.0, (COTTAGE_AT.x + 4.0) / 2, GRADE + 0.02, HOUSE.z0 - 6.0),
    ];
    lot.add(meshOf(flat, M.drive, { shadow: false }));
    // fences: divider between the house yard and the studio yard, plus back/sides
    const slats: THREE.BufferGeometry[] = [];
    const fenceRun = (ax: any, az: any, bx: any, bz: any, h = 1.25) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 0.16);
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        slats.push(boxGeo(alongX ? 0.12 : 0.03, h, alongX ? 0.03 : 0.12, ax + (bx - ax) * f, GRADE + h / 2, az + (bz - az) * f));
      }
      slats.push(boxGeo(alongX ? len : 0.05, 0.06, alongX ? 0.05 : len, (ax + bx) / 2, GRADE + h - 0.15, (az + bz) / 2));
    };
    const fz = z0 + 0.6;
    fenceRun(1.2, HOUSE.z0 - 0.3, 1.2, fz);
    fenceRun(x0 + 0.6, fz, x1 - 0.6, fz);
    fenceRun(x0 + 0.6, HOUSE.z0 - 0.4, x0 + 0.6, fz);
    fenceRun(x1 - 0.6, STUDIO.z0 - 0.4, x1 - 0.6, fz);
    fenceRun(STUDIO.x1 + 0.2, STUDIO.z0 - 0.4, x1 - 0.6, STUDIO.z0 - 0.4);
    lot.add(meshOf(slats, fadeMat('fence', M.fence)));
    const trees: THREE.BufferGeometry[] = [], trunks: THREE.BufferGeometry[] = [];
    const tree = (x: any, z: any, s: any, h: any) => {
      trunks.push(boxGeo(0.22 * s, h, 0.22 * s, x, GRADE + h / 2, z));
      const c = new THREE.IcosahedronGeometry(1.6 * s, 1);
      c.scale(1, 1.15, 1);
      c.translate(x, GRADE + h + 1.2 * s, z);
      trees.push(c);
    };
    tree(x1 - 1.9, STUDIO.z0 - 4.2, 1.15, 2.4);
    tree(x0 + 1.9, HOUSE.z0 - 1.6, 0.95, 2.2);
    tree(x0 + 1.6, z1 - 1.5, 0.75, 1.4);
    tree(6.6, z0 + 1.9, 0.85, 2.0);
    lot.add(meshOf(trees, M.tree), meshOf(trunks, M.trunk));
  }

  // ---- rooms (floors) ----
  const roomMeshes: any[] = [];
  const levelGroup: any = { main, basement: bsmt, cottage };
  for (const room of ROOMS) {
    const lv = LEVELS[room.level];
    const spec = FLOOR[room.floor];
    const y = lv.floor + (room.outdoor ? -0.2 : 0);
    const geos = room.rects.map(([x0, x1, z0, z1]: any) => boxGeo(x1 - x0, 0.022, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2));
    const g = worldUV(mergeGeometries(norm(geos)), room.floor === 'ptile' ? TEX_SIZE['tile'] * 2 : TEX_SIZE[room.floor]);
    const mat = std('#ffffff', { map: TEX[room.floor] || TEX['tile'], roughness: spec.rough });
    mat.userData['pbr'] = FLOOR_PBR[room.floor];
    mat.emissive = new THREE.Color(colors.terracotta);
    mat.emissiveIntensity = 0;
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    levelGroup[room.level].add(mesh);
    roomMeshes.push({ room, mesh, mat, tint: 0 });
  }

  // ---- slabs, foundations, deck, steps ----
  {
    // main floor slab with the stair hole, inset so the siding skirt covers its edge
    const s = new THREE.Shape();
    const sx = HOUSE.x1 + 0.07, sz = HOUSE.z1 + 0.07;
    s.moveTo(-sx, -sz); s.lineTo(sx, -sz); s.lineTo(sx, sz); s.lineTo(-sx, sz); s.lineTo(-sx, -sz);
    const h = new THREE.Path();
    h.moveTo(0.66, -3.75); h.lineTo(1.74, -3.75); h.lineTo(1.74, -0.62); h.lineTo(0.66, -0.62); h.lineTo(0.66, -3.75);
    s.holes.push(h);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    const slab = new THREE.Mesh(g, M.slab);
    slab.castShadow = slab.receiveShadow = true;
    main.add(slab);
    occluders.push(slab);
    // studio: slab + foundation to grade, recessed under the siding skirt
    const S0 = STUDIO;
    main.add(meshOf([boxGeo(S0.x1 - S0.x0 + 0.06, 0.3, S0.z1 - S0.z0 + 0.14, (S0.x0 + S0.x1) / 2 + 0.03, -0.15, STUDIO_MID.z)], M.slab));
    main.add(meshOf([boxGeo(S0.x1 - S0.x0 + 0.06, -0.3 - GRADE, S0.z1 - S0.z0 + 0.14, (S0.x0 + S0.x1) / 2 + 0.03, (GRADE - 0.3) / 2, STUDIO_MID.z)], fadeMat('main', M.found), { uv: TEX_SIZE.concrete }));
    // deck behind the studio (from the deck room rect)
    const dr = ROOMS.find((r: any) => r.id === 'studio-deck').rects[0];
    const [dx0, dx1, dz0, dz1] = dr;
    main.add(meshOf([boxGeo(dx1 - dx0, 0.1, dz1 - dz0, (dx0 + dx1) / 2, -0.27, (dz0 + dz1) / 2)], M.wood));
    const posts: THREE.BufferGeometry[] = [];
    for (const x of [dx0 + 0.1, (dx0 + dx1) / 2, dx1 - 0.1]) posts.push(boxGeo(0.12, -GRADE - 0.3, 0.12, x, (GRADE - 0.3) / 2, dz0 + 0.1));
    for (const x of [dx0 + 0.1, dx1 - 0.1]) posts.push(boxGeo(0.12, -GRADE - 0.3, 0.12, x, (GRADE - 0.3) / 2, dz1 - 0.1));
    main.add(meshOf(posts, fadeMat('main', M.wood)));
    const dmx = (dx0 + dx1) / 2;
    main.add(meshOf([boxGeo(1.4, 0.18, 0.35, dmx, -0.42, dz0 - 0.18), boxGeo(1.4, 0.18, 0.35, dmx, -0.6, dz0 - 0.5)], fadeMat('main', M.wood)));
    // front steps (3 risers) at the front door
    const steps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) steps.push(boxGeo(1.5, 0.25 * (i + 1), 0.32, -5.0, GRADE + 0.125 * (i + 1), HOUSE.z1 + 0.1 + 0.32 * (3 - i) - 0.16));
    main.add(meshOf(steps, fadeMat('main', M.found), { uv: TEX_SIZE.concrete }));
    // studio entry step + pergola by the driveway
    const ex = S0.x0 + 0.85;
    main.add(meshOf([boxGeo(1.4, 0.35, 0.6, ex, GRADE + 0.175, S0.z1 + 0.4)], fadeMat('main', M.found), { uv: TEX_SIZE.concrete }));
    const perg = [boxGeo(0.1, 3.15, 0.1, ex - 0.65, GRADE + 1.575, S0.z1 + 1.05), boxGeo(0.1, 3.15, 0.1, ex + 0.7, GRADE + 1.575, S0.z1 + 1.05)];
    for (let i = 0; i < 6; i++) perg.push(boxGeo(0.06, 0.1, 1.3, ex - 0.73 + i * 0.29, 2.45, S0.z1 + 0.55));
    main.add(meshOf(perg, fadeMat('main', M.wood)));
    // basement slab
    const bz0 = HOUSE.z0 - 0.125, bz1 = FULL_BSMT ? HOUSE.z1 + 0.125 : 0.725;
    bsmt.add(meshOf([boxGeo(11.85, 0.15, bz1 - bz0, 0, LEVELS.basement.floor - 0.075, (bz0 + bz1) / 2)], M.slab));
    // cottage slab, recessed under the skirt
    const cf = LEVELS.cottage.floor;
    cottage.add(meshOf([boxGeo(2 * COT.hx + 0.12, cf - GRADE, 2 * COT.hz + 0.12, 0, (cf + GRADE) / 2, 0)], M.found, { uv: TEX_SIZE.concrete }));
    // cottage patio pad
    cottage.add(meshOf([boxGeo(2.0, 0.04, 4.6, COT.hx + 1.4, GRADE + 0.02, 0)], M.drive, { shadow: false }));
  }

  // ---- stairs (basement group; run from the main hall down toward the back) ----
  {
    const tr: THREE.BufferGeometry[] = [];
    const n = 13, rise = 2.6 / n, top = -0.6, bottom = -3.7, run = (top - bottom) / (n - 1);
    for (let i = 0; i < n - 1; i++) {
      const y = -rise * (i + 1);
      tr.push(boxGeo(1.08, 0.05, run + 0.02, 1.2, y, top - run * (i + 0.5)));
      tr.push(boxGeo(1.08, rise, 0.025, 1.2, y + rise / 2, top - run * i));
    }
    const len = Math.hypot(2.6, top - bottom);
    const ang = Math.atan2(2.6, top - bottom);
    for (const x of [0.67, 1.73]) {
      const g = new THREE.BoxGeometry(0.05, 0.28, len);
      g.rotateX(-ang);
      g.translate(x, -1.3, (top + bottom) / 2);
      tr.push(g);
    }
    bsmt.add(meshOf(tr, M.stair));
  }

  // ---- walls per level ----
  const studioWall = (w: any) => w.bld === 'studio';
  const outOf = (lvKey: any) => (wall: any) => {
    const [ax, az] = wall.a, [bx, bz] = wall.b;
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const c = lvKey === 'cottage' ? { x: 0, z: 0 } : studioWall(wall) ? STUDIO_MID : { x: 0, z: 0 };
    return alongX ? Math.sign(az - c.z) || 1 : Math.sign(ax - c.x) || 1;
  };
  // parts of the house shell covered by the studio wing get no siding
  const hiddenOf = (lvKey: any) => (wall: any) => {
    if (lvKey !== 'main' || wall.bld !== 'house') return [];
    const [ax, az] = wall.a, [bx, bz] = wall.b;
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    if (!alongX && Math.abs(ax - STUDIO.x0) < 0.05) return [[STUDIO.z0 - az - 0.12, STUDIO.z1 - az + 0.12]];
    return [];
  };
  const wallRefs: any = {};
  const addVertical = (P: any, C: any, key: any, x: any, z: any, w: any, d: any, y0: any, y1: any) => {
    if (y0 < C) (P.lo[key] ||= []).push(boxGeo(w, Math.min(y1, C) - y0, d, x, (y0 + Math.min(y1, C)) / 2, z));
    if (y1 > C) (P.hi[key] ||= []).push(boxGeo(w, y1 - Math.max(y0, C), d, x, (Math.max(y0, C) + y1) / 2, z));
  };
  const corner = (P: any, C: any, key: any, cx: any, cz: any, sx: any, sz: any, y0: any, y1: any) => addVertical(P, C, key, cx - sx * 0.05, cz - sz * 0.05, 0.125, 0.125, y0, y1);
  const SKIRT: any = { main: 0.32, basement: 0, cottage: LEVELS.cottage.floor - GRADE - 0.02 };
  const addWalls = (lvKey: any, group: any, fadeKey: any) => {
    const lv = LEVELS[lvKey];
    const C = lv.cut, H = lv.height;
    const P = buildWalls(WALLS[lvKey], H, C, { outOf: outOf(lvKey), hidden: hiddenOf(lvKey), skirt: SKIRT[lvKey] });
    // corner boards and downspouts
    const sk = -SKIRT[lvKey];
    if (lvKey === 'main') {
      const inStudio = (x: any, z: any) => x > STUDIO.x0 - 0.2 && x < STUDIO.x1 + 0.2 && z > STUDIO.z0 - 0.2 && z < STUDIO.z1 + 0.2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const cx = sx < 0 ? HOUSE.x0 - 0.1 : HOUSE.x1 + 0.1, cz = sz < 0 ? HOUSE.z0 - 0.1 : HOUSE.z1 + 0.1;
        if (!inStudio(cx, cz)) corner(P, C, 'trim:house', cx, cz, sx, sz, sk, H);
      }
      for (const sz of [-1, 1]) {
        const cz = sz < 0 ? STUDIO.z0 - 0.1 : STUDIO.z1 + 0.1;
        corner(P, C, 'trim:house', STUDIO.x1 + 0.1, cz, 1, sz, sk, H);
        if (cz < HOUSE.z0 - 0.2 || cz > HOUSE.z1 + 0.2) corner(P, C, 'trim:house', STUDIO.x0 - 0.1, cz, -1, sz, sk, H);
      }
    }
    if (lvKey === 'cottage') {
      const ox = COT.hx + COT.t / 2, oz = COT.hz + COT.t / 2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        corner(P, C, 'trim:cottage', sx * ox, sz * oz, sx, sz, sk, H);
        // downspouts just off the front/back corners
        addVertical(P, C, 'trim:cottage', sx * (ox - 0.25), sz * (oz + 0.06), 0.07, 0.07, sk, H + 0.1);
      }
    }
    const g = new THREE.Group();
    g.position.y = lv.floor;
    group.add(g);
    // painted baseboards and casings on the room faces (Walk reads them; from above they sit under the cut)
    const trimGeos = buildTrim(WALLS[lvKey], outOf(lvKey)).filter((tg) => { tg.computeBoundingBox(); return tg.boundingBox!.max.y <= C + 1e-3 || true; });
    const trimLo: THREE.BufferGeometry[] = [], trimHi: THREE.BufferGeometry[] = [];
    for (const tg of trimGeos) (tg.boundingBox!.max.y <= C + 1e-3 ? trimLo : trimHi).push(tg);
    const tLo = meshOf(trimLo, M.trimIn);
    if (tLo) g.add(tLo);
    const tHi = meshOf(trimHi, fadeMat(fadeKey, M.trimIn));
    if (tHi) g.add(tHi);
    const upper: THREE.Mesh[] = [];
    for (const [k, geos] of Object.entries(P.lo)) {
      const m = meshOf(geos, WALL_MAT[k], { occ: k !== 'glass', uv: UV_OF[k] || 0, level: lvKey });
      if (m) g.add(m);
    }
    for (const [k, geos] of Object.entries(P.hi)) {
      const m = meshOf(geos, fadeMat(fadeKey, WALL_MAT[k]), { occ: k !== 'glass', uv: UV_OF[k] || 0, level: lvKey });
      if (m) { g.add(m); upper.push(m); }
    }
    const capMat = M.cap.clone();
    capMat.transparent = true;
    capMat.opacity = 0;
    const caps = meshOf(P.caps, capMat, { shadow: false });
    g.add(caps);
    wallRefs[lvKey] = { upper, caps, capMat };
  };
  addWalls('main', main, 'main');
  addWalls('basement', bsmt, 'bsmt');
  addWalls('cottage', cottage, 'cottage');

  // ---- roofs ----
  const roofParts = (group: any, fadeKey: any, { roofGeo, lines }: any, mats: any) => {
    const r = new THREE.Mesh(slopeUV(roofGeo, TEX_SIZE.shingle), fadeMat(fadeKey, mats.roof));
    r.castShadow = r.receiveShadow = true;
    group.add(r);
    occluders.push(r);
    // ridge and hip caps sit just proud of the roof planes
    const caps = lines.map(([p, q]: any) => beam([p[0], p[1] + 0.035, p[2]], [q[0], q[1] + 0.035, q[2]], 0.2, 0.06));
    group.add(meshOf(caps, fadeMat(fadeKey, mats.ridge)));
  };
  // fascia + gutter around a rectangle of eaves at height y
  const eaveTrim = (x0: any, x1: any, z0: any, z1: any, y: any, sides = 'nsew') => {
    const out: THREE.BufferGeometry[] = [];
    const fh = 0.2;
    if (sides.includes('s')) out.push(boxGeo(x1 - x0 + 0.04, fh, 0.04, (x0 + x1) / 2, y - fh / 2 + 0.03, z1));
    if (sides.includes('n')) out.push(boxGeo(x1 - x0 + 0.04, fh, 0.04, (x0 + x1) / 2, y - fh / 2 + 0.03, z0));
    if (sides.includes('w')) out.push(boxGeo(0.04, fh, z1 - z0 + 0.04, x0, y - fh / 2 + 0.03, (z0 + z1) / 2));
    if (sides.includes('e')) out.push(boxGeo(0.04, fh, z1 - z0 + 0.04, x1, y - fh / 2 + 0.03, (z0 + z1) / 2));
    return out;
  };
  const gutters = (x0: any, x1: any, z0: any, z1: any, y: any) => [
    boxGeo(x1 - x0, 0.1, 0.1, (x0 + x1) / 2, y - 0.08, z1 + 0.07),
    boxGeo(x1 - x0, 0.1, 0.1, (x0 + x1) / 2, y - 0.08, z0 - 0.07),
  ];
  // soffit: flat underside from wall face to eave
  const soffit = (x0: any, x1: any, z0: any, z1: any, wx0: any, wx1: any, wz0: any, wz1: any, y: any) => [
    boxGeo(x1 - x0, 0.02, wz0 - z0, (x0 + x1) / 2, y, (z0 + wz0) / 2),
    boxGeo(x1 - x0, 0.02, z1 - wz1, (x0 + x1) / 2, y, (z1 + wz1) / 2),
    boxGeo(wx0 - x0, 0.02, wz1 - wz0, (x0 + wx0) / 2, y, (wz0 + wz1) / 2),
    boxGeo(x1 - wx1, 0.02, wz1 - wz0, (x1 + wx1) / 2, y, (wz0 + wz1) / 2),
  ];
  let houseEave: any = null;
  {
    // main hip roof
    const hr = hipRoof(ROOF.x0, ROOF.x1, ROOF.z0, ROOF.z1, EY, PITCH);
    roofParts(mainRoof, 'main', { roofGeo: hr.geo, lines: hr.lines }, { roof: M.roof, ridge: M.ridge });
    const trimF = fadeMat('main', M.trimHouse);
    // the house's right eave (fascia + soffit) hangs inside the studio, under its ceiling line: hidden in Walk
    // (it drew a jagged white ledge along the studio's party wall)
    houseEave = meshOf([
      ...eaveTrim(ROOF.x0, ROOF.x1, ROOF.z0, ROOF.z1, EY),
      ...gutters(ROOF.x0, ROOF.x1, ROOF.z0, ROOF.z1, EY),
      ...soffit(ROOF.x0, ROOF.x1, ROOF.z0, ROOF.z1, HOUSE.x0 - 0.1, HOUSE.x1 + 0.1, HOUSE.z0 - 0.1, HOUSE.z1 + 0.1, EY - 0.01),
    ], trimF, { occ: true });
    mainRoof.add(houseEave);
    // studio: lower gable, ridge along z, abutting the house wall
    const sp = 0.5;
    const gx0 = STUDIO.x0 + 0.1, gx1 = STUDIO.x1 + 0.1 + EAVE, gz0 = STUDIO.z0 - 0.1 - EAVE, gz1 = STUDIO.z1 + 0.1 + EAVE;
    const mid = (gx0 + gx1) / 2, ridge = EY + (mid - gx0) * sp;
    const gable = trisGeo([
      [[gx0, EY, gz1], [mid, ridge, gz1], [mid, ridge, gz0]], [[gx0, EY, gz1], [mid, ridge, gz0], [gx0, EY, gz0]],
      [[mid, ridge, gz1], [gx1, EY, gz1], [gx1, EY, gz0]], [[mid, ridge, gz1], [gx1, EY, gz0], [mid, ridge, gz0]],
    ]);
    roofParts(mainRoof, 'main', { roofGeo: gable, lines: [[[mid, ridge, gz0], [mid, ridge, gz1]]] }, { roof: M.roof, ridge: M.ridge });
    // gable end walls (siding) at the front and back studio faces
    const yAt = (x: any) => EY + Math.min(x - gx0, gx1 - x) * sp - 0.02;
    const wx0 = STUDIO.x0 + 0.1, wx1 = STUDIO.x1 + 0.1;
    const gsh = new THREE.Shape();
    gsh.moveTo(wx0, EY); gsh.lineTo(wx1, EY); gsh.lineTo(wx1, yAt(wx1)); gsh.lineTo(mid, ridge - 0.02); gsh.lineTo(wx0, yAt(wx0)); gsh.lineTo(wx0, EY);
    const gends = [STUDIO.z1 + 0.1, STUDIO.z0 - 0.1 + 0.2].map((z: any) => {
      const g = new THREE.ExtrudeGeometry(gsh, { depth: 0.2, bevelEnabled: false });
      g.translate(0, 0, z - 0.2);
      return g;
    });
    mainRoof.add(meshOf(gends, fadeMat('main', M.sidingHouse), { uv: TEX_SIZE.siding, occ: true }));
    // barge boards along the rakes + fascia/gutter on the right eave
    const rake: THREE.BufferGeometry[] = [];
    for (const z of [gz0, gz1]) {
      rake.push(beam([gx0, EY + 0.02, z], [mid, ridge + 0.02, z], 0.05, 0.2));
      rake.push(beam([mid, ridge + 0.02, z], [gx1, EY + 0.02, z], 0.05, 0.2));
    }
    rake.push(...eaveTrim(gx0, gx1, gz0, gz1, EY, 'e'), boxGeo(0.1, 0.1, gz1 - gz0, gx1 + 0.07, EY - 0.08, (gz0 + gz1) / 2));
    mainRoof.add(meshOf(rake, trimF));
    // chimney on the left end: brick, with a cap
    // chimney on the front wall, left of the entry (exterior photos 24-25), behind the living-room fireplace
    const chx = -2.42, chz = HOUSE.z1 + 0.45, chTop = RIDGE_Y + 0.7, C = LEVELS.main.cut;
    mainRoof.add(meshOf([boxGeo(1.1, chTop - C, 0.7, chx, (C + chTop) / 2, chz)], fadeMat('main', M.brick), { uv: TEX_SIZE.brick, occ: true }));
    mainRoof.add(meshOf([boxGeo(1.24, 0.1, 0.84, chx, chTop + 0.05, chz)], fadeMat('main', M.found)));
    main.add(meshOf([boxGeo(1.1, C - GRADE, 0.7, chx, (C + GRADE) / 2, chz)], M.brick, { uv: TEX_SIZE.brick, occ: true }));

    // cottage hip roof, black fascia + gutters
    const cy = LEVELS.cottage.floor + LEVELS.cottage.height;
    const cx0 = -COT.hx - 0.09 - 0.3, cx1 = -cx0, cz0 = -COT.hz - 0.09 - 0.3, cz1 = -cz0;
    const cr = hipRoof(cx0, cx1, cz0, cz1, cy, PITCH);
    roofParts(cottageRoof, 'cottage', { roofGeo: cr.geo, lines: cr.lines }, { roof: M.roofCot, ridge: M.ridgeCot });
    const ctrim = fadeMat('cottage', M.trimCot);
    cottageRoof.add(meshOf([
      ...eaveTrim(cx0, cx1, cz0, cz1, cy), ...gutters(cx0, cx1, cz0, cz1, cy),
      boxGeo(0.75, 0.04, 1.3, COT.hx + 0.45, LEVELS.cottage.floor + 2.4, 0.85), // awning over the entry
    ], ctrim, { occ: true }));
    cottageRoof.add(meshOf(soffit(cx0, cx1, cz0, cz1, -COT.hx - 0.09, COT.hx + 0.09, -COT.hz - 0.09, COT.hz + 0.09, cy - 0.01), fadeMat('cottage', M.sidingCot)));
  }

  // ---- furniture ----
  // world-metre UVs on furniture so fabric and wood maps sit at real scale (one tile per UV unit)
  const FURN_UV = new Map<any, number>([[M.brick, TEX_SIZE.brick], [M.wood, TEX_SIZE.wood], [M.dark, TEX_SIZE.wood], [M.cherry, TEX_SIZE.wood], [M.navy, TEX_SIZE.fabric],
    ...['sofa', 'accent', 'green', 'wine', 'sage', 'linen', 'throw', 'throwBlue', 'quilt', 'duvet', 'upholstery'].map((k) => [M[k], TEX_SIZE.fabric] as [any, number])]);
  const UP_Y = new THREE.Vector3(0, 1, 0);
  const GLB_SPOTS: any[] = [];
  M.night = M.dark.clone(); M.night.userData = { ...M.dark.userData };
  // procedural wall-art textures: an abstract red streak canvas and soft grey sketches / colour-grid prints
  const ART: any = {};
  const artMat = (k: string) => {
    if (ART[k]) return ART[k];
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 192;
    const g = cv.getContext('2d')!; let sd = k.length * 97;
    const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    if (k === 'streaks') {
      g.fillStyle = '#b3241d'; g.fillRect(0, 0, 256, 192);
      for (let i = 0; i < 260; i++) { g.fillStyle = ['#e0442f', '#7d1612', '#d8382a', '#c62f22', '#2a0c0a'][i % 5]; g.globalAlpha = 0.25 + r() * 0.5; g.fillRect(0, r() * 192, 256, 1 + r() * 4); }
    } else if (k === 'grid') {
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 256, 192);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { g.fillStyle = ['#d0574a', '#7f9fb5', '#e3b24f', '#86a07a', '#c97f9c'][(i + j * 2) % 5]; g.fillRect(40 + i * 46, 30 + j * 46, 34, 34); }
    } else {
      g.fillStyle = '#f2f1ee'; g.fillRect(0, 0, 256, 192); g.strokeStyle = '#6f7378';
      for (let i = 0; i < 90; i++) { g.globalAlpha = 0.2 + r() * 0.5; g.lineWidth = 0.5 + r() * 1.5; g.beginPath(); const x = 40 + r() * 176, y = 50 + r() * 90; g.moveTo(x, y); g.bezierCurveTo(x + r() * 40 - 20, y - r() * 30, x + r() * 40 - 20, y + r() * 30, x + r() * 50 - 25, y + r() * 20 - 10); g.stroke(); }
    }
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
    return (ART[k] = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8 }));
  };
  const STAND = M.night; // stand-in nightstands get their own material so their meshes can be hidden once the glTF lands
  FURN_UV.set(M.night, TEX_SIZE.wood);
  const standMeshes: any[] = [];
  // stand-in geometry per glTF key, merged per level group and material; hidden once that key's glTF is placed
  const standGeos = new Map<string, { key: string; group: any; mat: any; geos: THREE.BufferGeometry[] }>();
  const standAdd = (key: string, group: any, mat: any, g: THREE.BufferGeometry) => {
    const id = `${key}|${group.uuid}|${mat.uuid}`;
    if (!standGeos.has(id)) standGeos.set(id, { key, group, mat, geos: [] });
    standGeos.get(id)!.geos.push(g);
  };
  const CHAIR_TINT: any = { accent: '#5f6f93', green: '#9aa77f', wine: '#b0524a' };
  // shaker cabinet fronts on one face of a w x d box: doors ~0.5 m wide with a 3 mm reveal, a raised stile frame and a
  // steel bar pull, from y0 to y1 (piece-local). face: '+z' | '-z' | '+x' | '-x'.
  const fronts = (put: any, w: number, d: number, face: string, y0: number, y1: number, nDoors = 0) => {
    const alongX = face.endsWith('z'), span = alongX ? w : d, sgn = face[0] === '+' ? 1 : -1;
    const off = (alongX ? d : w) / 2 + 0.009, n = nDoors || Math.max(1, Math.round(span / 0.5)), dw = span / n, hh = y1 - y0;
    for (let i = 0; i < n; i++) {
      const c = -span / 2 + dw * (i + 0.5);
      const at = (g: THREE.BufferGeometry, t: number, yy: number, dz = 0) => {
        if (!alongX) g.rotateY(Math.PI / 2);
        put(M.cabinet, g, alongX ? c : sgn * (off + dz), yy, alongX ? sgn * (off + dz) : c);
        void t;
      };
      // shaker door: 4 mm reveal, flat centre panel, raised stiles and rails with softened edges (reads through GTAO)
      const dwi = dw - 0.008, hhi = hh - 0.008, fr = Math.min(0.07, dwi * 0.16), ym = y0 + hh / 2;
      at(rbox(dwi, hhi, 0.016, 0.004), 0, ym);
      for (const sx of [-1, 1]) {
        const st = rbox(fr, hhi, 0.012, 0.004);
        if (!alongX) st.rotateY(Math.PI / 2);
        const o = sx * (dwi / 2 - fr / 2);
        put(M.cabinet, st, alongX ? c + o : sgn * (off + 0.009), ym, alongX ? sgn * (off + 0.009) : c + o);
        at(rbox(dwi - 2 * fr, fr, 0.012, 0.004), 0, ym + sx * (hhi / 2 - fr / 2), 0.009);
      }
      const px = c + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), py = hh > 1 ? y0 + 1.0 : y0 + (y0 > 1 ? 0.1 : hh - 0.1);
      const pull = new THREE.CylinderGeometry(0.006, 0.006, 0.11, 8);
      if (!alongX) pull.rotateY(Math.PI / 2);
      put(M.steel, pull, alongX ? px : sgn * (off + 0.03), py, alongX ? sgn * (off + 0.03) : px);
    }
  };
  // ---- soft bedding (no flat slabs): a draped sheet over a w x d top, rounded over the edge (radius r), hanging hang m
  // on both sides and the foot (+z), puffed in the middle, with small wrinkles on top and vertical folds in the drop.
  const drapeGeo = (w: number, d: number, top: number, r: number, hang: number, puff = 0.035, seed = 1) => {
    const L = (Math.PI * r) / 2 + hang, W = w + 2 * L, D = d + L, nx = 56, nz = 52;
    const g = new THREE.PlaneGeometry(W, D, nx, nz).rotateX(-Math.PI / 2);
    const p = g.attributes["position"] as THREE.BufferAttribute;
    const bend = (s: number) => (s < (Math.PI * r) / 2 ? [r * Math.sin(s / r), r * (1 - Math.cos(s / r))] : [r, r + (s - (Math.PI * r) / 2)]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i) + L / 2; // z from -d/2 (head) to d/2 + L (foot drop)
      const sx = Math.max(Math.abs(x) - w / 2, 0), sz = Math.max(z - d / 2, 0);
      const [ox, dyx] = bend(sx), [oz, dyz] = bend(sz);
      const ux = Math.min(Math.abs(x), w / 2) / (w / 2), uz = (Math.min(z, d / 2) + d / 2) / d;
      let y = top - Math.min(dyx + dyz, r + hang);
      if (!sx && !sz) y += puff * (1 - ux ** 4) * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, uz) * 1.1))) ** 0.6
        + 0.009 * Math.sin(x * 11 + z * 3 + seed) * Math.sin(z * 7.3 + seed) + 0.004 * Math.sin(x * 23 - z * 17 + seed * 2)
        + 0.006 * Math.exp(-(((x * 0.8 + z * 0.6 - 0.3 * Math.sin(seed)) * 9) ** 2)); // one soft diagonal crease
      const fold = 0.007 * Math.sin((sx ? z : x) * 17 + seed) * Math.min(1, Math.max(sx, sz) / 0.12);
      p.setXYZ(i, Math.sign(x) * (Math.min(Math.abs(x), w / 2) + ox + (sx ? fold : 0)), y, Math.min(z, d / 2) + oz + (sz && !sx ? fold : 0));
    }
    g.computeVertexNormals();
    return g;
  };
  // plump pillow: a squared-off sphere that thins to a seam at the edges
  const pillowGeo = (w: number, h: number, d: number) => {
    const g = new THREE.SphereGeometry(1, 32, 20), p = g.attributes["position"] as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i);
      const ex = Math.sign(nx) * Math.abs(nx) ** 0.45, ez = Math.sign(nz) * Math.abs(nz) ** 0.45;
      const edge = Math.max(Math.abs(ex), Math.abs(ez));
      p.setXYZ(i, (ex * w) / 2, ((ny * h) / 2) * (1 - 0.82 * edge ** 6), (ez * d) / 2);
    }
    g.computeVertexNormals();
    return g;
  };
  const FLOOR_TOP = 0.011;
  const ITEMS: any[] = [];
  const PARTS: { item: number; kind: string; tag: string; level: string; c: THREE.Vector3; h: THREE.Vector3; rot: number }[] = [];
  const LAMPS: { group: any; p: THREE.Vector3 }[] = []; // lamp shade centres (level-group local) for the warm light pool
  const furnish = (list: any, group: any, floorY: any, level: string) => {
    const byMat = new Map<any, THREE.BufferGeometry[]>();
    const add = (mat: any, g: any) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat)!.push(g); };
    for (const f of list) {
      const [kind, x, fy, z, w, h, d, matKey, rot = 0, face = '', opt = {} as any] = f;
      // pieces stand ON the finished floor (room floor slabs are 22 mm boxes centred on the level line)
      const y = floorY + FLOOR_TOP + (fy || 0);
      const item = ITEMS.length; ITEMS.push({ id: item, kind, matKey, level, x, z, rot });
      const rr = kind !== 'table' ? rot : 0;
      // interpenetration QA: every part's box in the piece frame becomes an oriented box (Y rotation of the piece)
      const rec = (geo: THREE.BufferGeometry, tag = '') => {
        geo.computeBoundingBox(); const bb = geo.boundingBox!;
        const c = bb.getCenter(new THREE.Vector3()).applyAxisAngle(UP_Y, rr).add(new THREE.Vector3(x, y, z));
        PARTS.push({ item, kind, tag, level, c, h: bb.getSize(new THREE.Vector3()).multiplyScalar(0.5), rot: rr });
      };
      const T = (g: THREE.BufferGeometry) => { if (rot && kind !== 'table') g.rotateY(rot); g.translate(x, y, z); return g; };
      const put = (mat: any, geo: THREE.BufferGeometry, dx: number, dy: number, dz: number) => { geo.translate(dx, dy, dz); rec(geo, mat === M.rug || mat === M.rugred ? 'rug' : ''); add(mat, T(geo)); };
      const lamp = (dx: number, dy: number, dz: number) => { const v = new THREE.Vector3(dx, 0, dz).applyAxisAngle(UP_Y, kind !== 'table' ? rot : 0); LAMPS.push({ group, p: new THREE.Vector3(x + v.x, y + dy, z + v.z) }); };
      // a glTF furniture spot in this piece's frame: footprint size (m), optional height (m), extra yaw, stand-in geometry
      const spot = (key: string, dx: number, dz: number, size: number, height: number, yaw: number, stand: null | (() => THREE.BufferGeometry), dy = 0, smat: any = STAND, tint?: string) => {
        const r = kind !== 'table' ? rot : 0;
        const v = new THREE.Vector3(dx, 0, dz).applyAxisAngle(UP_Y, r);
        GLB_SPOTS.push({ key, group, x: x + v.x, y: y + dy, z: z + v.z, rot: r + yaw, size, height, tint });
        if (stand) { const g = stand(); g.translate(dx, 0, dz); rec(g, 'glb:' + key); standAdd(key, group, smat, T(g)); }
        else rec(new THREE.BoxGeometry(size * 0.8, height || 0.3, size * 0.8).translate(dx, dy + (height || 0.3) / 2, dz), 'glb:' + key);
      };
      switch (kind) {
        case 'box': {
          if (matKey === 'wood' && Math.abs(x + 3.6) < 0.01 && Math.abs(z - 2.4) < 0.01) {
            spot('coffee', 0, 0, Math.max(w, d), h, Math.PI / 2, () => rbox(w, h, d, 0.03).translate(0, h / 2, 0), 0, M.wood);
            break;
          }
          const mat = ({ wood: M.wood, dark: M.dark, sage: M.sage, closet: M.cabinet, wardrobe: M.wood, vanity: M.wood, kraft: M.kraft, 'kitchen-w': M.cabinet, steel: M.fridge } as any)[matKey] || M.white;
          put(mat, rbox(w, h, d, 0.03), 0, h / 2, 0);
          if (matKey === 'vanity') put(M.white, rbox(w + 0.02, 0.05, d + 0.02, 0.02), 0, h + 0.025, 0);
          if (matKey === 'kitchen-w') put(M.counterW, rbox(w + 0.03, 0.04, d + 0.03, 0.01), 0, h + 0.02, 0);
          if (matKey === 'steel') {
            // stainless bottom-freezer fridge (photo 06): one full-width door over a freezer drawer, a tall bar handle on
            // the hinge-opposite edge, a bar across the drawer; door side is local -z
            put(M.black, rbox(w - 0.01, 0.01, 0.012, 0.003), 0, h * 0.31, -d / 2 - 0.002);
            put(M.black, rbox(0.012, h * 0.98, 0.012, 0.003), -w / 2 + 0.004, h / 2, -d / 2 - 0.002);
            const hx = w / 2 - 0.07;
            put(M.steel, rbox(0.022, h * 0.42, 0.024, 0.008), hx, h * 0.58, -d / 2 - 0.05);
            for (const yy of [h * 0.37, h * 0.79]) put(M.steel, rbox(0.016, 0.016, 0.05, 0.005), hx, yy, -d / 2 - 0.025);
            put(M.steel, rbox(w * 0.62, 0.022, 0.024, 0.008), 0, h * 0.27, -d / 2 - 0.05);
            for (const xx of [-w * 0.29, w * 0.29]) put(M.steel, rbox(0.016, 0.016, 0.05, 0.005), xx, h * 0.27, -d / 2 - 0.025);
            put(M.white, rbox(0.21, 0.28, 0.003, 0.001), -0.06, h * 0.78, -d / 2 - 0.003);
          }
          break;
        }
        case 'bed': {
          // frame, mattress, duvet with side drops, folded throw, two sleeping pillows, upholstered headboard
          const frame = opt.frame || 'uph';
          if (frame === 'metal') {
            // thin black steel frame (bedroom photo 11): square-tube rails and legs, slat deck, a low two-rail headboard
            put(M.iron, rbox(w + 0.03, 0.02, d, 0.005), 0, 0.245, 0);
            for (const sx of [-1, 1]) put(M.iron, rbox(0.035, 0.05, d + 0.04, 0.006), sx * (w / 2 + 0.03), 0.245, 0);
            put(M.iron, rbox(w + 0.095, 0.05, 0.035, 0.006), 0, 0.245, d / 2 + 0.02);
            for (const sx of [-1, 1]) for (const ez of [-1, 1]) put(M.iron, rbox(0.035, 0.27, 0.035, 0.006), sx * (w / 2 + 0.03), 0.135, ez * (d / 2 + 0.02));
            for (const sx of [-1, 1]) put(M.iron, rbox(0.035, 1.0, 0.035, 0.006), sx * (w / 2 + 0.03), 0.5, -d / 2 - 0.02);
            for (const yy of [0.62, 0.96]) put(M.iron, rbox(w + 0.06, 0.035, 0.035, 0.006), 0, yy, -d / 2 - 0.02);
          } else if (frame === 'wood') {
            // low honey-wood platform (basement photos), no headboard
            put(M.honey, rbox(w + 0.12, 0.22, d + 0.08, 0.02), 0, 0.14, 0);
            put(M.dark, rbox(w - 0.1, 0.03, d - 0.1, 0.01), 0, 0.015, 0);
          } else if (frame === 'white') {
            // white painted frame with a slatted headboard (cottage photo 11)
            put(M.white, rbox(w + 0.08, 0.25, d + 0.04, 0.02), 0, 0.125, 0);
            for (const sx of [-1, 1]) put(M.white, rbox(0.07, 1.1, 0.07, 0.01), sx * (w / 2 + 0.04), 0.55, -d / 2 - 0.035);
            for (const yy of [0.62, 1.04]) put(M.white, rbox(w + 0.08, 0.08, 0.05, 0.01), 0, yy, -d / 2 - 0.035);
            for (let i = 1; i < 8; i++) put(M.white, rbox(0.05, 0.36, 0.025, 0.006), -w / 2 + (w * i) / 8, 0.83, -d / 2 - 0.035);
          } else put(M.dark, rbox(w + 0.06, 0.25, d + 0.04, 0.03), 0, 0.125, 0);
          put(M.linen, rbox(w, 0.22, d - 0.04, 0.05), 0, 0.36, 0);
          const cover = group === cottage ? M.quilt : M.duvet, studio = group === main && x > 7.5;
          // soft duvet draped over the mattress (top 0.47) down the sides and foot, a rolled turn-down at the head, a
          // plump sleeping pillows and one accent pillow (photos: white + red floral; cottage grey)
          const mTop = 0.47, sd = Math.round(x * 7 + z * 3);
          put(cover, drapeGeo(w + 0.02, d - 0.06, mTop + 0.012, 0.06, mTop - 0.06 - 0.2, 0.04, sd).translate(0, 0, 0.03), 0, 0, 0);
          put(cover, new THREE.CapsuleGeometry(0.04, w - 0.02, 4, 14).rotateZ(Math.PI / 2).scale(1, 0.62, 1.5), 0, mTop + 0.075, -d / 2 + 0.62);
          // studio photo 01: a slate-blue throw folded across the foot
          if (studio) put(M.throwBlue, drapeGeo(w + 0.04, 0.42, mTop + 0.05, 0.08, 0.12, 0.01, sd + 3).translate(0, 0, d / 2 - 0.205), 0, 0, 0);
          const pw = w / 2 - 0.05, sham = opt.pillow !== 'grey' ? M.linen : group === cottage ? M.pillowPat : M.pillowGrey;
          for (const sx of [-1, 1]) put(sham, pillowGeo(pw, 0.2, 0.44).rotateX(-0.55), sx * w / 4, mTop + 0.2, -d / 2 + 0.2);
          for (const sx of [-1, 1]) put(group === cottage ? M.pillowPat : M.linen, pillowGeo(pw - 0.03, 0.17, 0.42).rotateX(-0.25), sx * w / 4, mTop + 0.14, -d / 2 + 0.43);
          put(group === cottage ? M.pillowPat : group === main && x > 5.8 ? M.pillowBlue : M.floral, pillowGeo(0.56, 0.15, 0.36).rotateX(-1.3), 0, mTop + 0.2, -d / 2 + 0.6);
          if (frame === 'uph') {
            // channel-tufted upholstered headboard (bedroom photos 14-16): panel plus three soft vertical channels
            put(M.upholstery, rbox(w + 0.12, 1.0, 0.1, 0.04), 0, 0.62, -d / 2 - 0.03);
            for (let i = 0; i < 4; i++) put(M.upholstery, rbox((w + 0.04) / 4 - 0.02, 0.5, 0.03, 0.014), -w / 2 + (w + 0.04) * (i + 0.5) / 4 - 0.02, 0.84, -d / 2 + 0.03);
          }
          // (accent pillow drawn above; the chevron glTF pillows are no longer used on beds)
          // nightstands: CC0 glTF (Classic Nightstand 01) once loaded; a rounded box stands in until then. Lamps on top.
          for (const sx of opt.stands === 'r' ? [1] : opt.stands === 0 ? [] : [-1, 1]) {
            spot('nightstand', sx * (w / 2 + 0.32), -d / 2 + 0.22, 0.48, 0.58, 0, () => rbox(0.45, 0.55, 0.4, 0.02).translate(0, 0.275, 0));
            put(M.ceramic, new THREE.CylinderGeometry(0.055, 0.075, 0.28, 24), sx * (w / 2 + 0.32), 0.58 + 0.14, -d / 2 + 0.2);
            lamp(sx * (w / 2 + 0.32), 0.96, -d / 2 + 0.2);
            put(M.shade, new THREE.CylinderGeometry(0.12, 0.16, 0.22, 32, 1, true), sx * (w / 2 + 0.32), 0.58 + 0.28 + 0.1, -d / 2 + 0.2);
          }
          break;
        }
        case 'sofa-l':
          // sectional: platform, loose seat and back cushions, rolled arm, chaise; throw and pillows on top
          put(M.sofa, rbox(0.95, 0.28, 2.7, 0.05), 0, 0.14, 0);
          put(M.sofa, rbox(1.7, 0.28, 0.95, 0.05), -0.38, 0.14, 1.15);
          for (const cz of [-0.78, 0.1]) put(M.sofa, rbox(0.74, 0.17, 0.86, 0.075), -0.07, 0.365, cz);
          put(M.sofa, rbox(1.62, 0.17, 0.9, 0.075), -0.38, 0.365, 1.15);
          put(M.sofa, rbox(0.24, 0.44, 2.7, 0.08), 0.355, 0.5, 0);
          for (const cz of [-0.78, 0.1, 1.0]) put(M.sofa, rbox(0.2, 0.44, 0.86, 0.09).rotateZ(-0.12), 0.2, 0.66, cz);
          put(M.sofa, rbox(0.95, 0.56, 0.22, 0.09), 0, 0.28, -1.25);
          put(M.throw, rbox(0.7, 0.04, 0.9, 0.02), -0.6, 0.47, 1.15);
          spot('pillows', 0.12, -0.35, 0.95, 0, -Math.PI / 2, null, 0.45);
          break;
        case 'chair': {
          const mat = ({ accent: M.accent, green: M.green, wine: M.wine, white: M.white, dark: M.dark } as any)[matKey] || M.sofa;
          if (matKey === 'accent' || matKey === 'green' || matKey === 'wine') {
            // upholstered armchair: CC0 glTF (Modern Arm Chair 01) tinted to the photo; rounded stand-in until it loads
            spot('armchair', 0, 0, Math.max(w, d) + 0.05, h, Math.PI, () => {
              const parts = [rbox(w, 0.42, d, 0.06).translate(0, 0.21, 0), rbox(w, h - 0.1, 0.16, 0.05).translate(0, (h - 0.1) / 2, -d / 2 + 0.08)];
              return mergeGeometries(norm(parts));
            }, 0, mat, CHAIR_TINT[matKey]);
            break;
          }
          put(mat, rbox(w, 0.42, d, 0.06), 0, 0.21, 0);
          put(mat, rbox(w, h - 0.1, 0.16, 0.05), 0, (h - 0.1) / 2, -d / 2 + 0.08);
          put(mat, rbox(0.12, 0.62, d, 0.04), -w / 2 + 0.06, 0.31, 0);
          put(mat, rbox(0.12, 0.62, d, 0.04), w / 2 - 0.06, 0.31, 0);
          break;
        }
        // writing desk (piece-local: top along z, drawer apron facing -x) and a wooden cross-back desk chair
        case 'desk': {
          put(M.dark, rbox(w, 0.035, d, 0.01), 0, h - 0.0175, 0);
          put(M.dark, rbox(w - 0.06, 0.12, d - 0.08, 0.008), 0, h - 0.095, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(M.dark, rbox(0.045, h - 0.035, 0.045, 0.008), sx * (w / 2 - 0.04), (h - 0.035) / 2, sz * (d / 2 - 0.04));
          put(M.steel, new THREE.CylinderGeometry(0.008, 0.008, 0.1, 8).rotateX(Math.PI / 2), -w / 2 - 0.01, h - 0.095, 0);
          break;
        }
        case 'dchair': {
          put(M.dark, rbox(w, 0.04, d, 0.012), 0, 0.46, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(M.dark, rbox(0.035, sz > 0 ? 0.46 : 0.9, 0.035, 0.008), sx * (w / 2 - 0.03), sz > 0 ? 0.23 : 0.45, sz * (d / 2 - 0.03));
          put(M.dark, rbox(w - 0.04, 0.06, 0.025, 0.008), 0, 0.86, -d / 2 + 0.03);
          for (const r of [0.75, -0.75]) put(M.dark, rbox(0.03, 0.42, 0.02, 0.006).rotateZ(r), 0, 0.66, -d / 2 + 0.03);
          break;
        }
        // flat-screen TV on a wall bracket (screen faces -x in piece space)
        case 'tv':
          put(M.black, rbox(0.04, h, w, 0.008), 0, fy ? 0 : 1.55, 0);
          put(M.dark, rbox(0.03, 0.12, 0.12, 0.005), 0.035, fy ? 0 : 1.55, 0);
          break;
        case 'stool':
          for (const dz of [0, 0.48]) {
            put(M.wood, new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), 0, h, dz);
            put(M.dark, new THREE.CylinderGeometry(0.03, 0.05, h, 8), 0, h / 2, dz);
          }
          break;
        case 'rug':
          put(matKey === 'rugred' ? M.rugred : M.rug, rbox(w, 0.012, d, 0.005), 0, 0.006, 0);
          break;
        // lift-top coffee table: top, apron, tapered legs, lower shelf (piece-local, long side along x)
        case 'ctable': {
          put(M.cherry, rbox(w, 0.04, d, 0.012), 0, h - 0.02, 0);
          put(M.cherry, rbox(w - 0.08, 0.08, d - 0.08, 0.006), 0, h - 0.08, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(M.cherry, new THREE.CylinderGeometry(0.025, 0.017, h - 0.04, 10), sx * (w / 2 - 0.06), (h - 0.04) / 2, sz * (d / 2 - 0.06));
          put(M.cherry, rbox(w - 0.14, 0.025, d - 0.14, 0.006), 0, 0.12, 0);
          put(M.black, rbox(0.12, 0.03, 0.12, 0.012), 0.25, h + 0.015, 0.05);
          break;
        }
        // power recliner (front faces local +z): plinth, chunky padded seat, tall pillow back, rolled arms
        case 'recliner': {
          put(M.navy, rbox(w - 0.1, 0.18, d - 0.1, 0.03), 0, 0.09, 0);
          put(M.navy, rbox(w - 0.3, 0.2, d - 0.22, 0.09), 0, 0.33, 0.06);
          put(M.navy, rbox(w - 0.3, 0.3, 0.2, 0.1).rotateX(-0.18), 0, 0.62, -d / 2 + 0.16);
          put(M.navy, rbox(w - 0.32, 0.32, 0.22, 0.11).rotateX(-0.12), 0, 0.88, -d / 2 + 0.13);
          put(M.navy, rbox(w, 0.5, 0.26, 0.1), 0, 0.62, -d / 2 + 0.13);
          for (const sx of [-1, 1]) put(M.navy, rbox(0.17, 0.52, d - 0.06, 0.08), sx * (w / 2 - 0.085), 0.36, 0.02);
          for (const sx of [-1, 1]) put(M.navy, new THREE.CylinderGeometry(0.09, 0.09, d - 0.1, 16).rotateX(Math.PI / 2), sx * (w / 2 - 0.085), 0.6, 0.03);
          put(M.navy, rbox(w - 0.32, 0.08, 0.12, 0.04), 0, 0.27, d / 2 - 0.02);
          put(M.throw, rbox(0.34, 0.12, 0.22, 0.05).rotateX(-0.3), 0.08, 0.5, -d / 2 + 0.36);
          break;
        }
        // low open bookcase (front faces local +z) with rows of books and a lamp on top
        case 'bookcase': {
          const t = 0.022;
          for (const sx of [-1, 1]) put(M.dark, rbox(t, h, d, 0.004), sx * (w / 2 - t / 2), h / 2, 0);
          for (const yy of [0.04, h * 0.36, h * 0.68, h - t / 2]) put(M.dark, rbox(w, t, d, 0.004), 0, yy, 0);
          put(M.dark, rbox(w, h, 0.01, 0.002), 0, h / 2, -d / 2 + 0.005);
          const bm = [M.bookA, M.bookB, M.bookC, M.bookD, M.bookB, M.bookA];
          for (const [si, yy] of [0.05 + t / 2, h * 0.36 + t / 2].entries()) {
            let bx = -w / 2 + 0.03, k = si * 3;
            while (bx < w / 2 - 0.08) {
              const bw = 0.025 + ((k * 37) % 5) * 0.006, bh = 0.2 + ((k * 13) % 4) * 0.025;
              put(bm[k % bm.length], rbox(bw, bh, d - 0.08, 0.003), bx + bw / 2, yy + bh / 2, 0.02);
              bx += bw + 0.003; k++;
              if (k % 9 === 0) bx += 0.12;
            }
          }
          put(M.white, new THREE.CylinderGeometry(0.06, 0.08, 0.22, 20), -w / 4, h + 0.11, 0);
          put(M.shade, new THREE.CylinderGeometry(0.1, 0.14, 0.18, 24, 1, true), -w / 4, h + 0.3, 0);
          lamp(-w / 4, h + 0.3, 0);
          break;
        }
        // torchiere floor lamp: weighted base, slim pole, frosted uplight bowl
        case 'flamp':
          put(M.steel, new THREE.CylinderGeometry(0.13, 0.14, 0.03, 24), 0, 0.015, 0);
          put(M.steel, new THREE.CylinderGeometry(0.011, 0.011, h - 0.12, 8), 0, (h - 0.12) / 2 + 0.03, 0);
          put(M.shade, new THREE.CylinderGeometry(0.17, 0.05, 0.1, 24, 1, true), 0, h - 0.04, 0);
          lamp(0, h + 0.1, 0);
          break;
        // potted plant: CC0 glTF (Potted Plant 02/04 by size) with a rounded pot stand-in
        case 'plant':
          spot(h > 1 ? 'plantLarge' : 'plantSmall', 0, 0, Math.max(w, d), h, 0, () => new THREE.CylinderGeometry(w * 0.4, w * 0.32, 0.36, 16).translate(0, 0.18, 0), 0, M.white);
          break;
        case 'table': {
          put(M.wood, rbox(w, 0.05, d, 0.02), 0, 0.74, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(M.wood, rbox(0.06, 0.72, 0.06, 0.012), sx * (w / 2 - 0.08), 0.36, sz * (d / 2 - 0.08));
          const per = Math.floor(((rot || 6) - 2) / 2);
          for (let i = 0; i < per; i++) {
            const cz = -d / 2 + (d / (per + 1)) * (i + 1);
            put(M.wood, rbox(0.42, 0.05, 0.42, 0.02), -w / 2 - 0.2, 0.45, cz);
            put(M.wood, rbox(0.05, 0.5, 0.42, 0.02), -w / 2 - 0.4, 0.7, cz);
            put(M.wood, rbox(0.42, 0.05, 0.42, 0.02), w / 2 + 0.2, 0.45, cz);
            put(M.wood, rbox(0.05, 0.5, 0.42, 0.02), w / 2 + 0.4, 0.7, cz);
          }
          put(M.wood, rbox(0.42, 0.05, 0.42, 0.02), 0, 0.45, d / 2 + 0.2);
          put(M.wood, rbox(0.42, 0.05, 0.42, 0.02), 0, 0.45, -d / 2 - 0.2);
          break;
        }
        case 'counter': {
          const top = opt.top === 'butcher' ? M.butcher : matKey === 'kitchen' ? M.yellow : M.counterW;
          put(M.cabinet, rbox(w, h - 0.04, d, 0.015), 0, (h - 0.04) / 2, 0);
          if (opt.sink != null) {
            // top in two pieces around an undermount steel basin, with a gooseneck tap behind it
            const bw = 0.62, s0 = opt.sink, ax = face.endsWith('z');
            const span = ax ? w + 0.03 : d + 0.03, a0 = -span / 2, a1 = s0 - bw / 2, b0 = s0 + bw / 2, b1 = span / 2;
            for (const [u0, u1] of [[a0, a1], [b0, b1]]) {
              const L = u1 - u0, c = (u0 + u1) / 2;
              put(top, ax ? rbox(L, 0.04, d + 0.03, 0.01) : rbox(w + 0.03, 0.04, L, 0.01), ax ? c : 0, h - 0.02, ax ? 0 : c);
            }
            const dep = (ax ? d : w) - 0.12, sg = face[0] === '+' ? 1 : -1;
            if (ax) for (const e of [-1, 1]) put(top, rbox(bw, 0.04, 0.05, 0.01), s0, h - 0.02, e * (d / 2 - 0.01));
            put(M.steel, ax ? new THREE.BoxGeometry(bw - 0.04, 0.012, dep - 0.04) : new THREE.BoxGeometry(dep - 0.04, 0.012, bw - 0.04), ax ? s0 : 0, h - 0.2, 0);
            const tb = -sg * ((ax ? d : w) / 2 - 0.05);
            put(M.steel, new THREE.CylinderGeometry(0.014, 0.018, 0.3, 10), ax ? s0 : tb, h + 0.15, ax ? tb : s0);
            const arm = new THREE.CylinderGeometry(0.011, 0.011, 0.18, 8).rotateX(Math.PI / 2);
            if (!ax) arm.rotateY(Math.PI / 2);
            put(M.steel, arm, ax ? s0 : tb + sg * 0.08, h + 0.29, ax ? tb + sg * 0.08 : s0);
          } else put(top, rbox(w + 0.03, 0.04, d + 0.03, 0.017), 0, h - 0.02, 0);
          if (opt.cook) put(M.glassDark, rbox(0.6, 0.008, 0.5, 0.004), opt.cook === true ? 0 : opt.cook, h + 0.004, 0); // black glass cooktop
          if (opt.splash && face) {
            // backsplash on the wall behind the run (opposite the door fronts)
            const ax = face.endsWith('z'), sg = face[0] === '+' ? -1 : 1, off = (ax ? d : w) / 2 + 0.009;
            put(matKey === 'kitchen-w' ? M.splashW : M.splash, ax ? rbox(w + 0.03, 0.46, 0.012, 0.003) : rbox(0.012, 0.46, d + 0.03, 0.003), ax ? 0 : sg * off, h + 0.23, ax ? sg * off : 0);
          }
          if (face) fronts(put, w, d, face, 0.1, h - 0.06);
          if (w > 2 || d > 2) {
            const uw = w > d ? w : 0.36, ud = w > d ? 0.36 : d;
            if (matKey === 'kitchen' && z < -3.5) { put(M.cabinet, rbox(uw, 0.7, ud, 0.015), 0, 1.85, -d / 2 + 0.18); if (face) fronts((m: any, g: any, a: number, b: number, c: number) => put(m, g, a, b, c - d / 2 + 0.18), uw, ud, face, 1.5, 2.2); }
            if (matKey === 'kitchen-w') put(M.cabinet, rbox(uw, 0.7, ud, 0.015), 0, 1.85, d / 2 - 0.18);
          }
          break;
        }
        // wall cabinets (h = box height, fy = bottom) and full-height pantry, both with shaker doors and pulls
        case 'uppers':
        case 'pantry': {
          const y0 = kind === 'uppers' ? (opt.y0 ?? 1.48) : 0, y1 = kind === 'uppers' ? (opt.y0 ?? 1.48) + h : h;
          put(M.cabinet, rbox(w, y1 - y0, d, 0.012), 0, (y0 + y1) / 2, 0);
          if (kind === 'pantry') put(M.cabinet, rbox(w + 0.01, 0.06, d + 0.01, 0.01), 0, h - 0.03, 0);
          if (kind === 'pantry') { fronts(put, w, d, face, 0.1, 0.9, 2); fronts(put, w, d, face, 0.94, y1 - 0.08, 2); } // base doors + tall upper doors
          else fronts(put, w, d, face, y0 + 0.02, y1 - 0.02);
          break;
        }
        // rounded yellow laminate peninsula (photos 06 and 08): white base, slab top with a half-round end at local +z
        case 'peninsula': {
          const r = w / 2 + 0.04, L = d - r;
          put(M.cabinet, rbox(w, h - 0.04, L - 0.08, 0.015), 0, (h - 0.04) / 2, -d / 2 + (L - 0.08) / 2);
          fronts(put, w, L - 0.08, '-x', 0.1, h - 0.06);
          const sh = new THREE.Shape();
          sh.moveTo(-r, -d / 2 - 0.0); sh.lineTo(r, -d / 2); sh.lineTo(r, -d / 2 + L); sh.absarc(0, -d / 2 + L, r, 0, Math.PI, false); sh.lineTo(-r, -d / 2);
          const tg = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 40 });
          tg.rotateX(Math.PI / 2); // shape y -> +z (round end at +z), extrusion runs down from the top surface
          tg.computeVertexNormals();
          put(M.yellow, tg, 0, h, 0);
          break;
        }
        // spindle-back windsor chair (photo 08), front at local +z
        case 'windsor': {
          put(M.cherry, new THREE.CylinderGeometry(0.21, 0.2, 0.04, 28).scale(1, 1, 0.92), 0, 0.46, 0);
          for (const [lx, lz] of [[-0.15, -0.13], [0.15, -0.13], [-0.15, 0.14], [0.15, 0.14]])
            put(M.cherry, new THREE.CylinderGeometry(0.016, 0.02, 0.44, 8).rotateZ(-lx * 0.4).rotateX(lz * 0.4), lx * 1.04, 0.22, lz * 1.04);
          for (const sz of [-0.02, 0.02]) put(M.cherry, new THREE.CylinderGeometry(0.009, 0.009, 0.3, 6).rotateZ(Math.PI / 2), 0, 0.15, sz * 4);
          const bow = new THREE.TorusGeometry(0.19, 0.016, 8, 24, Math.PI).rotateY(0).translate(0, 0, 0);
          bow.scale(1, 1.35, 1);
          put(M.cherry, bow, 0, 0.72, -0.17);
          for (let i = -3; i <= 3; i++) put(M.cherry, new THREE.CylinderGeometry(0.007, 0.008, 0.42, 6), i * 0.05, 0.69, -0.17);
          break;
        }
        // countertop appliances (photo 06): microwave and toaster oven, front at local -z
        case 'appl': {
          if (matKey === 'red') {
            // red toaster oven: glass door with a chrome bar, three dials down the right, little feet
            put(M.toasterRed, rbox(w, h - 0.02, d, 0.02), 0, h / 2 + 0.01, 0);
            for (const fx of [-1, 1]) for (const fz of [-1, 1]) put(M.black, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), fx * (w / 2 - 0.04), 0.01, fz * (d / 2 - 0.04));
            put(M.glassDark, rbox(w * 0.66, h * 0.6, 0.006, 0.004), -w * 0.12, h * 0.5, -d / 2 - 0.002);
            put(M.steel, new THREE.CylinderGeometry(0.006, 0.006, w * 0.56, 8).rotateZ(Math.PI / 2), -w * 0.12, h * 0.86, -d / 2 - 0.025);
            for (let i = 0; i < 3; i++) put(M.black, new THREE.CylinderGeometry(0.016, 0.016, 0.014, 14).rotateX(Math.PI / 2), w / 2 - 0.06, h * (0.72 - i * 0.22), -d / 2 - 0.006);
          } else {
            // black microwave: dark glass door, control strip with a keypad on the right, recessed handle edge
            put(M.black, rbox(w, h, d, 0.015), 0, h / 2, 0);
            put(M.glassDark, rbox(w * 0.68, h * 0.74, 0.006, 0.004), -w * 0.13, h * 0.5, -d / 2 - 0.002);
            put(M.steel, rbox(0.012, h * 0.7, 0.012, 0.004), w * 0.24, h * 0.5, -d / 2 - 0.008);
            put(M.glassDark, rbox(w * 0.16, 0.03, 0.004, 0.002), w * 0.37, h * 0.82, -d / 2 - 0.002);
            for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) put(M.grey, rbox(0.018, 0.012, 0.004, 0.002), w * 0.32 + q * 0.026, h * (0.66 - r * 0.1), -d / 2 - 0.002);
          }
          break;
        }
        // two open white shelves on brackets with stacked plates and jars (photo 06, left wall end)
        case 'shelves': {
          for (const yy of [1.5, 1.85]) {
            put(M.cabinet, rbox(w, 0.025, d, 0.006), 0, yy, 0);
            for (let i = 0; i < 3; i++) put(i % 2 ? M.yellow : M.white, new THREE.CylinderGeometry(0.05, 0.045, 0.14, 14), -w / 2 + 0.1 + i * (w - 0.2) / 2, yy + 0.083, 0);
          }
          break;
        }
        // white enamel coil range (photo 07): oven door with window and bar, four coil burners with drip pans, back panel
        case 'range': {
          put(M.white, rbox(w, h - 0.01, d, 0.015), 0, (h - 0.01) / 2, 0);
          put(M.white, rbox(w - 0.01, 0.012, d - 0.01, 0.004), 0, h - 0.004, 0);
          for (const [bx, bz, r] of [[-0.17, 0.12, 0.1], [0.17, 0.14, 0.085], [-0.17, -0.12, 0.085], [0.17, -0.1, 0.1]]) {
            put(M.steel, new THREE.CylinderGeometry(r + 0.025, r + 0.02, 0.006, 24), bx, h + 0.004, bz);
            for (const rr of [r, r * 0.68, r * 0.36]) put(M.black, new THREE.TorusGeometry(rr, 0.007, 5, 28).rotateX(Math.PI / 2), bx, h + 0.012, bz);
          }
          put(M.white, rbox(w, 0.2, 0.07, 0.01), 0, h + 0.1, -d / 2 + 0.035);
          put(M.black, rbox(w - 0.06, 0.09, 0.006, 0.003), 0, h + 0.11, -d / 2 + 0.072);
          for (let i = 0; i < 5; i++) put(M.steel, new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12).rotateX(Math.PI / 2), -w / 2 + 0.09 + i * (w - 0.18) / 4, h + 0.11, -d / 2 + 0.08);
          put(M.black, rbox(w - 0.12, h * 0.45, 0.006, 0.01), 0, h * 0.42, d / 2 + 0.003);
          put(M.steel, new THREE.CylinderGeometry(0.012, 0.012, w - 0.16, 8).rotateZ(Math.PI / 2), 0, h * 0.7, d / 2 + 0.035);
          // round through-wall vent fan above the range (photo 07): chrome bezel, dark louvre rings, centre knob
          if (opt.vent) {
            const vy = 1.78, vz = -d / 2 + 0.006;
            put(M.steel, new THREE.CylinderGeometry(0.16, 0.16, 0.022, 32).rotateX(Math.PI / 2), w * 0.22, vy, vz);
            for (const rr of [0.12, 0.085, 0.05]) put(M.black, new THREE.TorusGeometry(rr, 0.008, 6, 32), w * 0.22, vy, vz + 0.013);
            put(M.steel, new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12).rotateX(Math.PI / 2), w * 0.22, vy, vz + 0.02);
          }
          break;
        }
        // framed wall art (procedural, not copies of the listing's pieces); fy = centre height, local +z faces the room
        case 'art': {
          const t = 0.03;
          if (matKey === 'canvas') put(artMat('streaks'), rbox(w, h, t, 0.004), 0, 0, 0);
          else if (matKey === 'mirror') {
            put(M.dark, rbox(w, h, t, 0.006), 0, 0, 0);
            put(M.steel, new THREE.BoxGeometry(w - 0.1, h - 0.1, 0.004), 0, 0, t / 2 + 0.001);
          } else {
            put(M.black, rbox(w, h, t, 0.003), 0, 0, 0);
            put(M.white, new THREE.BoxGeometry(w - 0.04, h - 0.04, 0.004), 0, 0, t / 2 + 0.001);
            const iw = (w - 0.04) * (matKey === 'grid' ? 0.6 : 0.72), ih = (h - 0.04) * (matKey === 'grid' ? 0.6 : 0.7);
            put(artMat(matKey === 'grid' ? 'grid' : 'sketch'), new THREE.PlaneGeometry(iw, ih), 0, 0, t / 2 + 0.004);
          }
          break;
        }
        // white coat tree with an oval mirror (bedroom photo 11)
        case 'cstand': {
          put(M.white, new THREE.CylinderGeometry(0.18, 0.2, 0.025, 28), 0, 0.0125, 0);
          put(M.white, new THREE.CylinderGeometry(0.014, 0.014, 1.6, 10), 0, 0.82, 0);
          for (let i = 0; i < 4; i++) put(M.white, new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6).rotateZ(0.9).rotateY((i * Math.PI) / 2), 0, 1.5, 0);
          put(M.white, new THREE.CylinderGeometry(0.16, 0.16, 0.012, 24), 0, 0.8, 0);
          break;
        }
        // coffered ceiling grid (cottage photos 09-11): white beams hung from the ceiling over a w x d rect; h = ceiling height
        case 'coffer': {
          const bd = 0.13, bw = 0.1, nx = Math.max(2, Math.round(w / 0.95)), nz = Math.max(2, Math.round(d / 0.95));
          for (let i = 0; i <= nx; i++) put(M.white, rbox(bw, bd, d, 0.01), -w / 2 + bw / 2 + ((w - bw) * i) / nx, h - bd / 2, 0);
          for (let k = 0; k <= nz; k++) put(M.white, rbox(w - 0.004, bd * 0.9, bw, 0.01), 0, h - bd * 0.45, -d / 2 + bw / 2 + ((d - bw) * k) / nz);
          break;
        }
        // over-the-range microwave (cottage photo 01): stainless body, dark glass door, handle bar; wall-hung, fy = bottom
        case 'otr': {
          put(M.fridge, rbox(w, h, d, 0.01), 0, h / 2, 0);
          put(M.glassDark, rbox(w * 0.7, h * 0.72, 0.006, 0.004), -w * 0.1, h * 0.5, d / 2 + 0.002);
          put(M.steel, rbox(w * 0.66, 0.02, 0.025, 0.006), -w * 0.1, h * 0.86, d / 2 + 0.03);
          break;
        }
        // flush-mount ceiling dome (photo 08); h = ceiling height above the floor finish
        case 'ceil':
          put(M.dome, new THREE.SphereGeometry(w / 2, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 1).rotateX(Math.PI), 0, h - 0.004, 0);
          put(M.white, new THREE.CylinderGeometry(w / 2 + 0.01, w / 2 + 0.01, 0.012, 24), 0, h - 0.006, 0);
          lamp(0, h - 0.3, 0);
          break;
        case 'tub':
          put(M.white, rbox(w, h, d, 0.06), 0, h / 2, 0);
          put(M.steel, new THREE.BoxGeometry(w - 0.16, 0.01, d - 0.16), 0, h - 0.01, 0);
          break;
        case 'toilet':
          put(M.white, rbox(0.42, 0.4, 0.55, 0.12), 0, 0.2, 0.05);
          put(M.white, rbox(0.42, 0.35, 0.18, 0.04), 0, 0.6, -0.22);
          break;
        case 'shower':
          if (matKey === 'curb') {
            put(M.white, new THREE.BoxGeometry(w, 0.03, d), 0, 0.015, 0);
            put(M.dark, new THREE.CylinderGeometry(0.012, 0.012, w, 6).rotateZ(Math.PI / 2), 0, 1.95, d / 2);
          } else {
            put(M.white, new THREE.BoxGeometry(w, 0.05, d), 0, 0.025, 0);
            put(M.glass, new THREE.BoxGeometry(0.015, 1.9, d), -w / 2, 0.95, 0);
          }
          break;
        case 'washer':
          put(M.white, rbox(w, h, d, 0.04), 0, h / 2, 0);
          put(M.steel, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24).rotateX(Math.PI / 2), 0, h * 0.5, d / 2 + 0.01);
          break;
        case 'cyl':
          put(M.white, new THREE.CylinderGeometry(w / 2, w / 2, h, 24), 0, h / 2, 0);
          break;
        case 'round': {
          put(matKey === 'glass' ? M.glass : M.white, new THREE.CylinderGeometry(w / 2, w / 2, 0.04, 28), 0, h, 0);
          put(M.dark, new THREE.CylinderGeometry(0.03, 0.05, h, 8), 0, h / 2, 0);
          break;
        }
        case 'fireplace':
          // painted wood surround (white) with a brick panel around the firebox, as in the photos
          put(M.white, rbox(0.22, 1.15, 1.6, 0.01), -0.01, 0.575, 0);
          put(M.brick, new THREE.BoxGeometry(0.03, 0.82, 1.12), 0.105, 0.47, 0);
          put(M.white, rbox(0.34, 0.08, 1.75, 0.02), 0.03, 1.2, 0);
          put(M.white, new THREE.BoxGeometry(0.3, 1.15, 0.12), 0.0, 0.575, -0.82);
          put(M.white, new THREE.BoxGeometry(0.3, 1.15, 0.12), 0.0, 0.575, 0.82);
          put(M.black, new THREE.BoxGeometry(0.05, 0.6, 0.75), 0.13, 0.4, 0);
          // brass-framed glass doors over the firebox
          put(M.brass, rbox(0.03, 0.64, 0.8, 0.008), 0.16, 0.42, 0);
          put(M.glass, new THREE.BoxGeometry(0.01, 0.56, 0.72), 0.18, 0.42, 0);
          put(M.brick, new THREE.BoxGeometry(0.6, 0.06, 1.6), 0.25, 0.03, 0);
          // wall-mounted flat screen above the mantel
          put(M.black, rbox(0.045, 0.66, 1.15, 0.008), 0.05, 1.82, 0);
          break;
        case 'fireplace-c':
          put(M.black, rbox(0.7, 1.05, 0.45, 0.02).rotateY(Math.PI / 4), 0, 0.525, 0);
          put(M.white, rbox(0.85, 0.05, 0.55, 0.01).rotateY(Math.PI / 4), 0, 1.08, 0);
          break;
        default:
          put(M.white, rbox(w || 0.5, h || 0.5, d || 0.5), 0, (h || 0.5) / 2, 0);
      }
    }
    for (const [mat, geos] of byMat) {
      const m = meshOf(geos, mat, { uv: FURN_UV.get(mat) || 0 });
      if (m) { m.userData.furn = true; group.add(m); }
    }
  };
  furnish(FURNITURE.main, main, LEVELS.main.floor, 'main');
  furnish(FURNITURE.basement, bsmt, LEVELS.basement.floor, 'basement');
  furnish(FURNITURE.cottage, cottage, LEVELS.cottage.floor, 'cottage');
  for (const sg of standGeos.values()) {
    const m = meshOf(sg.geos, sg.mat, { uv: FURN_UV.get(sg.mat) || 0 });
    if (m) { m.userData.furn = true; m.userData.standFor = sg.key; sg.group.add(m); standMeshes.push(m); }
  }

  // ---- exploded-view guides (dashed corner lines between the two levels) ----
  const guideMat = new THREE.LineDashedMaterial({ color: '#1f1e1d', dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0 });
  const guideGeo = new THREE.BufferGeometry();
  const guidePts = new Float32Array(4 * 2 * 3);
  guideGeo.setAttribute('position', new THREE.BufferAttribute(guidePts, 3));
  const guides = new THREE.LineSegments(guideGeo, guideMat);
  guides.frustumCulled = false;
  root.add(guides);
  const gc = [[HOUSE.x0 - 0.1, HOUSE.z0 - 0.1], [HOUSE.x1 + 0.1, HOUSE.z0 - 0.1], [HOUSE.x0 - 0.1, HOUSE.z1 + 0.1], [HOUSE.x1 + 0.1, HOUSE.z1 + 0.1]];
  function guideGeoUpdate(lift: any) {
    const f = lift / LIFT;
    gc.forEach(([x, z]: any, i: any) => guidePts.set([x, -0.35, z, x, lift - 0.35, z - BACK * f], i * 6));
    guideGeo.attributes['position'].needsUpdate = true;
    guideGeo.computeBoundingSphere();
    guides.computeLineDistances();
  }

  // ---- labels ----
  const labels: any[] = [];
  const mkLabel = (cls: any, html: any, group: any, at: any, data: any) => {
    const el = document.createElement('div');
    el.className = `ns-label ${cls}`;
    el.innerHTML = html;
    labelLayer.appendChild(el);
    const L = { el, group, at, local: new THREE.Vector3(), ...data };
    labels.push(L);
    return L;
  };
  const unitById = new Map<string, any>((units || []).map((u: any) => [u.id, u]));
  const nameOf = (id: any) => unitById.get(id)?.name ?? id;
  // anchors are functions of the state so the closed (roofs on) view gets sensible spots
  const UNIT_TAGS: any = {
    'four-bed': { group: main, at: () => (S.mainOpen > 0.5 ? [-0.4, 2.8, HOUSE.z0 - 0.1] : [-0.6, RIDGE_Y + 0.25, 0]), meta: 'whole house + studio' },
    'three-bed': { group: bsmt, at: () => [HOUSE.x0 - 0.15, GRADE + 0.05, FULL_BSMT ? HOUSE.z1 + 0.25 : 0.85], meta: 'main floor + basement' },
    'two-bed': { group: main, at: () => [HOUSE.x0 - 0.1, 1.55, HOUSE.z1 + 0.15], meta: 'main floor' },
    studio: { group: main, at: () => (S.mainOpen > 0.5 ? [STUDIO.x1 + 0.1, 1.6, STUDIO.z1 + 0.1] : [STUDIO.x1 + 0.2, 1.9, STUDIO.z1 + 0.2]), meta: 'own entrance, deck' },
    // open view looks from behind, so the tag moves to the near (back-right) corner
    cottage: { group: cottage, at: () => (S.cotOpen > 0.5 ? [COT.hx + 0.15, LEVELS.cottage.floor + 1.5, -COT.hz - 0.15] : [COT.hx + 0.1, LEVELS.cottage.floor + 1.6, COT.hz + 0.1]), meta: 'detached' },
  };
  for (const [id, t] of Object.entries(UNIT_TAGS) as [string, any][]) {
    mkLabel('unit', `<b>${nameOf(id)}</b><span>${t.meta}</span>`, t.group, t.at, { kind: 'unit', unit: id });
  }
  const PRIO: any = { 'bsmt-bed': 9, 'bed-a': 8, 'bed-b': 8, 'studio-room': 8, 'cottage-room': 8, kitchen: 6, living: 6, laundry: 7, bath: 4, 'studio-bath': 4, 'cottage-bath': 5, 'bsmt-office': 3, dining: 3, 'studio-deck': 3, storage: 1 };
  for (const room of ROOMS) {
    if (!room.label) continue;
    const r = [...room.rects].sort((a: any, b: any) => (b[1] - b[0]) * (b[3] - b[2]) - (a[1] - a[0]) * (a[3] - a[2]))[0];
    const lv = LEVELS[room.level];
    const at = [(r[0] + r[1]) / 2, lv.floor + 0.95, (r[2] + r[3]) / 2];
    if (room.id === 'bsmt-office') at[0] = -1.0;
    mkLabel('room', `${room.label}${room.sub ? ` <span>${room.sub}</span>` : ''}`, levelGroup[room.level], () => at, { kind: 'room', room, prio: PRIO[room.id] ?? 2 });
  }

  // ---- composer with GTAO (AO at half resolution) ----
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  // ceilings: only while walking (from above the cut-away and roofs show the rooms instead)
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#faf8f3', roughness: 0.92, side: THREE.DoubleSide }); // flat white ceiling paint
  ceilMat.userData['pbr'] = ['plaster', { normal: 0.25, noMap: true }];
  const ceilings: any[] = [];
  for (const room of ROOMS as any[]) {
    if (room.outdoor || room.level === 'basement') continue;
    const L = (LEVELS as any)[room.level];
    const g = room.level === 'cottage' ? cottage : main;
    for (const [ri, [x0, x1, z0, z1]] of (room.rects as any[]).entries()) {
      // studio: vaulted under its gable (ridge along z, 1:2 pitch), with white gable-end infills; the tie beams below
      // stay at the wall plate, as in the listing photos
      if (room.id === 'studio-room' && ri === 0) {
        const y0 = L.floor + L.height - 0.02, mx = (x0 + x1) / 2, rise = (mx - x0) * 0.5, e = 0.1;
        const v = (a: number[]) => new Float32Array(a);
        const pos: number[] = [];
        // two slopes (overrun the walls by e so no light leaks) + two gable triangles
        const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        quad([x0 - e, y0 - e * 0.5, z0 - e], [mx, y0 + rise, z0 - e], [mx, y0 + rise, z1 + e], [x0 - e, y0 - e * 0.5, z1 + e]);
        quad([mx, y0 + rise, z0 - e], [x1 + e, y0 - e * 0.5, z0 - e], [x1 + e, y0 - e * 0.5, z1 + e], [mx, y0 + rise, z1 + e]);
        for (const zz of [z0 + 0.061, z1 - 0.061]) pos.push(x0, y0 - 0.01, zz, mx, y0 + rise, zz, x1, y0 - 0.01, zz);
        const vg = new THREE.BufferGeometry();
        vg.setAttribute('position', new THREE.BufferAttribute(v(pos), 3));
        vg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
        vg.computeVertexNormals();
        const m = new THREE.Mesh(worldUV(vg, TEX_SIZE.plaster), ceilMat);
        m.visible = false; m.castShadow = m.receiveShadow = true;
        g.add(m); ceilings.push(m);
        continue;
      }
      // run the ceiling 0.1 m into the surrounding walls so no sun leaks through the wall/ceiling joint (the jagged
      // lit band under the studio ceiling was sun through that gap, aliased by the shadow map)
      const m = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(x1 - x0 + 0.2, z1 - z0 + 0.2), TEX_SIZE.plaster), ceilMat);
      m.rotation.x = Math.PI / 2;
      m.position.set((x0 + x1) / 2, L.floor + L.height - 0.02, (z0 + z1) / 2);
      m.visible = false;
      m.castShadow = true; m.receiveShadow = true; // in Walk the ceiling blocks the sun: daylight only comes in through the windows
      g.add(m);
      ceilings.push(m);
    }
    // studio: exposed wood ceiling beams across the short span, as in the listing photos
    if (room.id === 'studio-room') {
      const [x0, x1, z0, z1] = room.rects[0];
      const along = x1 - x0 > z1 - z0 ? 'x' : 'z', len = along === 'x' ? x1 - x0 : z1 - z0, span = along === 'x' ? z1 - z0 : x1 - x0;
      const geos: THREE.BufferGeometry[] = [];
      for (let t = 0.9; t < len - 0.5; t += 1.25) {
        const g2 = along === 'x' ? rbox(0.1, 0.14, span - 0.02, 0.012) : rbox(span - 0.02, 0.14, 0.1, 0.012);
        g2.translate(along === 'x' ? x0 + t : (x0 + x1) / 2, L.floor + L.height - 0.02 - 0.071, along === 'x' ? (z0 + z1) / 2 : z0 + t);
        geos.push(g2);
      }
      if (geos.length) {
        const m = new THREE.Mesh(worldUV(mergeGeometries(geos), TEX_SIZE.wood), M.beam);
        m.castShadow = m.receiveShadow = true; m.visible = false; m.userData['furn'] = true;
        g.add(m); ceilings.push(m);
      }
    }
  }

  // sheer white curtains (rod + two gathered panels, floor length) on the house and cottage windows, as in the
  // listing photos; Walk only, like the ceilings. The faint emissive stands in for daylight through the voile.
  {
    const sheer = new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 1, transparent: true, opacity: 0.78, side: THREE.DoubleSide, emissive: '#fff6ea', emissiveIntensity: 0.18, depthWrite: false });
    const rodMat = M.dark;
    const panel = (pw: number, ph: number) => {
      const gg = new THREE.PlaneGeometry(pw, ph, Math.max(8, Math.round(pw / 0.03)), 1);
      const pp = gg.attributes['position'];
      for (let i = 0; i < pp.count; i++) pp.setZ(i, 0.025 * Math.sin((pp.getX(i) / 0.11) * Math.PI * 2));
      gg.computeVertexNormals();
      return gg;
    };
    for (const lv of ['main', 'cottage']) {
      const L = (LEVELS as any)[lv], grp = lv === 'cottage' ? cottage : main;
      const rooms = (ROOMS as any[]).filter((r) => r.level === lv && !r.outdoor && r.unit !== 'studio');
      const inRoom = (x: number, z: number) => rooms.some((r) => r.rects.some(([x0, x1, z0, z1]: any) => x > x0 && x < x1 && z > z0 && z < z1));
      const cg: THREE.BufferGeometry[] = [], rg: THREE.BufferGeometry[] = [];
      for (const w of (WALLS as any)[lv]) for (const o of w.o || []) {
        if (o.kind !== 'window') continue;
        const dx = Math.sign(w.b[0] - w.a[0]), dz = Math.sign(w.b[1] - w.a[1]);
        const cx = w.a[0] + dx * o.at, cz = w.a[1] + dz * o.at;
        const nx = -dz, nz = dx; // one of the two wall normals
        const side = inRoom(cx + nx * 0.3, cz + nz * 0.3) ? 1 : inRoom(cx - nx * 0.3, cz - nz * 0.3) ? -1 : 0;
        if (!side) continue;
        const off = w.t / 2 + 0.09, top = L.floor + Math.min(L.height - 0.08, o.head + 0.14), ph = top - L.floor - 0.03;
        const yaw = Math.atan2(nx * side, nz * side);
        const span = o.w + 0.36, pw = span * 0.3;
        for (const sgn of [-1, 1]) {
          const gg = panel(pw, ph).rotateY(yaw);
          const along = sgn * (span / 2 - pw / 2);
          gg.translate(cx + dx * along + nx * side * off, L.floor + 0.03 + ph / 2, cz + dz * along + nz * side * off);
          cg.push(gg);
        }
        const rod = new THREE.CylinderGeometry(0.011, 0.011, span + 0.12, 8).rotateZ(Math.PI / 2).rotateY(Math.atan2(-dz, dx));
        rod.translate(cx + nx * side * (off + 0.01), top + 0.02, cz + nz * side * (off + 0.01));
        rg.push(rod);
      }
      for (const [geos, mat] of [[cg, sheer], [rg, rodMat]] as any[]) {
        if (!geos.length) continue;
        const m = new THREE.Mesh(mergeGeometries(geos.map((q: any) => (q.index ? q.toNonIndexed() : q)).map((q: any) => { q.deleteAttribute('uv'); return q; })), mat);
        m.visible = false; m.receiveShadow = true; m.castShadow = mat !== sheer;
        grp.add(m); ceilings.push(m);
      }
    }
  }

  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 1, 1);
  const gtaoSetSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w: any, h: any) => gtaoSetSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
  composer.addPass(gtao);
  composer.addPass(new OutputPass());

  // ---- state + animation ----
  const S: any = {
    picked: null, lift: 0, mainOpen: 0, cotOpen: 0,
    cam: { az: 0.5, el: 0.58, dist: 50, tx: 0, ty: 0, tz: -3 },
    camT: null, drag: 0, awakeUntil: 0, labelTick: 0,
    view: 'solid', ctl: 'auto', xr: 1, wire: false, fly: null,
  };
  const views: any = {
    none: { az: 0.5, el: 0.62 },
    house: { az: 0.52, el: 0.5 },
    studio: { az: 0.62, el: 0.66 },
    // from behind, slightly right (entry + patio side); the fences fade out of the way
    cottage: { az: 2.62, el: 0.72 },
  };
  // boxes the camera frames for each pick: [x0,x1,y0,y1,z0,z1] in world space at the end state
  const deck = ROOMS.find((r: any) => r.id === 'studio-deck').rects[0];
  // each entry is a list of boxes; the camera frames the union of their corners
  const mainX = [HOUSE.x0 - 0.5, STUDIO.x1 + 0.5];
  const backZ = Math.min(HOUSE.z0, deck[2]) - 0.3;
  const exploded = [
    [...mainX, LIFT - 0.3, LIFT + LEVELS.main.cut + 0.2, backZ - BACK, HOUSE.z1 + 0.5 - BACK],
    [HOUSE.x0 - 0.4, HOUSE.x1 + 0.4, LEVELS.basement.floor, GRADE + 0.4, HOUSE.z0 - 0.3, HOUSE.z1 + 0.5],
  ];
  const FIT: any = {
    // overview: the whole plinth (top and bottom edges), the ridge, and the cottage roof
    none: [
      [LOT.x0, LOT.x1, GRADE, GRADE, LOT.z0, LOT.z1],
      [LOT.x0, LOT.x1, GRADE - 1.2, GRADE - 1.2, LOT.z1, LOT.z1],
      [HOUSE.x0, HOUSE.x1, RIDGE_Y, RIDGE_Y, -1, 1],
      [COTTAGE_AT.x - 4, COTTAGE_AT.x + 4, LEVELS.cottage.floor + LEVELS.cottage.height + 1.6, LEVELS.cottage.floor + LEVELS.cottage.height + 1.6, COTTAGE_AT.z - 2, COTTAGE_AT.z + 2],
    ],
    'two-bed': [[...mainX, -0.3, LEVELS.main.cut + 0.6, backZ, HOUSE.z1 + 0.8]],
    'three-bed': exploded,
    'four-bed': exploded,
    studio: [[...mainX, -0.3, LEVELS.main.cut + 0.6, deck[2] - 0.8, HOUSE.z1 + 0.8]],
    cottage: [[COTTAGE_AT.x - COT.hx - 0.6, COTTAGE_AT.x + COT.hx + 2.6, GRADE, LEVELS.cottage.floor + 1.5, COTTAGE_AT.z - COT.hz - 0.4, COTTAGE_AT.z + COT.hz + 0.5]],
    // x-ray / wireframe keep the whole shell (roof on, basement in place)
    'house-shell': [[...mainX, LEVELS.basement.floor, RIDGE_Y + 0.2, backZ, HOUSE.z1 + 0.8]],
    'cottage-shell': [[COTTAGE_AT.x - COT.hx - 0.6, COTTAGE_AT.x + COT.hx + 2.6, GRADE, LEVELS.cottage.floor + LEVELS.cottage.height + 1.6, COTTAGE_AT.z - COT.hz - 0.4, COTTAGE_AT.z + COT.hz + 0.5]],
  };
  const fitCam = new THREE.PerspectiveCamera();
  const fitTmp = new THREE.Vector3();
  // controls overlaid on the stage (explore toolbar) mark themselves with data-ns-inset; the house is framed in the band they leave free
  // forFit: a picked unit leaves a strip above the model (56px phones, 48px desktop) so its tags can sit there, never on the model
  function band(forFit = false) {
    const H = stage.clientHeight || 1, sr = stage.getBoundingClientRect();
    let top = forFit && S.picked && S.ctl !== 'walk' ? (stage.clientWidth < 560 ? 56 : 48) : 0, bottom = 0;
    if (S.ctl !== 'auto') for (const el of stage.querySelectorAll('[data-ns-inset]') as any) {
      const r = el.getBoundingClientRect();
      if (r.height < 1) continue;
      if (el.dataset.nsInset === 'bottom') bottom = Math.max(bottom, sr.bottom - r.top + 32); // 16px clear gap + 16px slack for perspective
      else top = Math.max(top, r.bottom - sr.top + 16);
    }
    const yHi = 1 - (2 * top) / H, yLo = -1 + (2 * bottom) / H;
    return { c: (yHi + yLo) / 2, h: Math.max(0.2, (yHi - yLo) / 2) };
  }
  function fitCamera() {
    const boxes = S.fitBox; if (!boxes) return;
    const B = band(true);
    const T = S.camT;
    const pts: THREE.Vector3[] = [];
    for (const b of boxes) for (const x of [b[0], b[1]]) for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) pts.push(new THREE.Vector3(x, y, z));
    const bb = new THREE.Box3().setFromPoints(pts);
    T.tx = (bb.min.x + bb.max.x) / 2; T.ty = (bb.min.y + bb.max.y) / 2; T.tz = (bb.min.z + bb.max.z) / 2;
    fitCam.copy(camera);
    const mx = S.fitMargin.x, my = S.fitMargin.y;
    const place = (d: any) => {
      fitCam.position.set(T.tx + d * Math.cos(T.el) * Math.sin(T.az), T.ty + d * Math.sin(T.el), T.tz + d * Math.cos(T.el) * Math.cos(T.az));
      fitCam.lookAt(T.tx, T.ty, T.tz); fitCam.updateMatrixWorld(); fitCam.updateProjectionMatrix();
    };
    // fit distance, then re-centre the projected points (perspective skews them), and repeat
    for (let pass = 0; pass < 4; pass++) {
      let lo = 4, hi = pass < 3 ? 140 : T.dist;
      for (let i = 0; i < 22 && pass < 3; i++) {
        const d = (lo + hi) / 2;
        place(d);
        let fits = true, a0 = 9, a1 = -9, b0 = 9, b1 = -9;
        for (const p of pts) {
          fitTmp.copy(p).project(fitCam);
          if (fitTmp.z > 1) { fits = false; break; }
          a0 = Math.min(a0, fitTmp.x); a1 = Math.max(a1, fitTmp.x); b0 = Math.min(b0, fitTmp.y); b1 = Math.max(b1, fitTmp.y);
        }
        // compare spans (the target is re-centred into the free band after each pass)
        if (a1 - a0 > 2 * mx || b1 - b0 > 2 * my * B.h) fits = false;
        if (fits) hi = d; else lo = d;
      }
      T.dist = hi;
      place(hi);
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of pts) {
        fitTmp.copy(p).project(fitCam);
        x0 = Math.min(x0, fitTmp.x); x1 = Math.max(x1, fitTmp.x); y0 = Math.min(y0, fitTmp.y); y1 = Math.max(y1, fitTmp.y);
      }
      // phones: sit the model on the bottom margin so the plinth below it is cropped, not framed
      // last pass: phones sit the model on the bottom margin; the cottage view does the same so the
      // spare lawn goes above it (toward the house) instead of onto the plinth edge
      const bottom = pass < 3 ? null : S.picked === 'cottage' ? 0.9 : fitCam.aspect < 1.2 && S.picked ? my : null;
      const cx = (x0 + x1) / 2, cy = bottom !== null ? y0 - (B.c - bottom * B.h) : (y0 + y1) / 2 - B.c;
      const right = fitTmp.setFromMatrixColumn(fitCam.matrixWorld, 0).clone();
      const up = fitTmp.setFromMatrixColumn(fitCam.matrixWorld, 1).clone();
      const halfH = Math.tan(THREE.MathUtils.degToRad(fitCam.fov / 2)) * hi * 0.9;
      const halfW = halfH * fitCam.aspect;
      T.tx += right.x * cx * halfW + up.x * cy * halfH;
      T.ty += right.y * cx * halfW + up.y * cy * halfH;
      T.tz += right.z * cx * halfW + up.z * cy * halfH;
    }
  }
  const blockedOf = opts.blockedBy || (() => []);
  const unitsContaining = (roomUnit: any) => {
    const out = new Set([roomUnit]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const u of units || []) if (!out.has(u.id) && u.contains.some((c: any) => out.has(c))) { out.add(u.id); grew = true; }
    }
    return [...out];
  };
  const roomOwners = new Map(ROOMS.map((r: any) => [r.id, unitsContaining(r.unit)]));
  const targets = { lift: 0, mainOpen: 0, cotOpen: 0, xr: 1, rooms: new Map<string, number>(), tags: new Map<string, string>() };
  const seeThrough = () => S.view === 'xray' || S.view === 'wire';
  // the open/lift state follows the pick in solid and cutaway; x-ray and wireframe keep the shell whole
  function applyTargets() {
    const id = S.picked;
    const houseIds: (string | null)[] = ['two-bed', 'three-bed', 'four-bed'];
    const walk = S.ctl === 'walk';
    targets.lift = !walk && !seeThrough() && (id === 'three-bed' || id === 'four-bed') ? LIFT : 0;
    targets.mainOpen = S.view === 'cutaway' ? 1 : seeThrough() || walk ? 0 : houseIds.includes(id) || id === 'studio' ? 1 : 0;
    targets.cotOpen = S.view === 'cutaway' ? 1 : seeThrough() || walk ? 0 : id === 'cottage' ? 1 : 0;
    targets.xr = S.view === 'xray' ? 0.2 : 1;
  }
  const wake = (ms = 3500) => { S.awakeUntil = Math.max(S.awakeUntil, performance.now() + ms); };

  function pick(id: string | null): void {
    S.picked = id;
    const blocked = new Set(id ? blockedOf(id) : []);
    const pickedRooms = new Set<string>();
    if (id) for (const r of ROOMS) if (roomOwners.get(r.id)!.includes(id)) pickedRooms.add(r.id);
    for (const rm of roomMeshes) {
      const owners = roomOwners.get(rm.room.id)!;
      let v = 0;
      if (pickedRooms.has(rm.room.id)) v = 1;
      else if (id && owners.every((o: any) => blocked.has(o))) v = 0.4;
      targets.rooms.set(rm.room.id, v);
    }
    for (const L of labels) if (L.kind === 'unit') targets.tags.set(L.unit, L.unit === id ? 'picked' : blocked.has(L.unit) ? 'blocked' : 'free');
    S.pickedRooms = pickedRooms;
    S.blocked = blocked;
    applyTargets();
    aimFor(id);
    if (S.ctl === 'orbit') flyTo(poseOf(S.camT));
    if (S.ctl === 'walk') spawn(id);
    wake();
  }
  // camera goal for a pick (spherical angles + fitted distance/target in S.camT)
  function aimFor(id: string | null) {
    const v = !id ? views.none : id === 'cottage' ? views.cottage : id === 'studio' ? views.studio : views.house;
    S.camT = { ...v };
    const exploded = targets.lift > 0;
    if (id === 'three-bed' || id === 'four-bed') S.camT.el = exploded ? 0.6 : 0.62;
    if (id === 'two-bed') S.camT.el = 0.62;
    // cutaway reads as a plan: look down steeper so each room's floor (and its tag) shows over the cut walls
    if (S.view === 'cutaway') S.camT.el = Math.max(S.camT.el, 0.95);
    const shell = seeThrough() && id;
    S.fitBox = shell ? FIT[id === 'cottage' ? 'cottage-shell' : 'house-shell'] : FIT[id || 'none'];
    if (id && !shell && (id === 'three-bed' || id === 'four-bed') && !exploded) S.fitBox = FIT['house-shell'];
    // phones: leave a strip above the model for the tags, which never sit on the model itself
    const narrow = stage.clientWidth < 560;
    S.fitMargin = id === 'cottage' ? { x: 0.8, y: 0.74 } : narrow ? { x: 0.94, y: 0.9 } : { x: 0.96, y: 0.92 };
    fitCamera();
  }
  const poseOf = (T: any) => {
    const target = new THREE.Vector3(T.tx, T.ty, T.tz);
    const pos = new THREE.Vector3(T.tx + T.dist * Math.cos(T.el) * Math.sin(T.az), T.ty + T.dist * Math.sin(T.el), T.tz + T.dist * Math.cos(T.el) * Math.cos(T.az));
    return { pos, target };
  };

  const tc = new THREE.Color(colors.terracotta);
  const white = new THREE.Color('#ffffff');
  const damp = (a: any, b: any, k: any, dt: any) => a + (b - a) * (1 - Math.exp(-k * dt));
  function applyFade(key: any, open: any) {
    const op = (1 - open) * (key === 'fence' ? 1 : S.xr);
    for (const m of fadeSets[key]) {
      const base = m.userData.base ?? 1;
      m.opacity = base * op;
      m.transparent = base < 1 || op < 0.999;
      m.depthWrite = op > 0.6 && base === 1;
      m.visible = op > 0.01;
    }
  }
  // x-ray: walls, slabs, foundations and trim go see-through so the nested units show inside
  const shellMats = [M.wall, M.wallConc, M.sidingHouse, M.sidingCot, M.trimHouse, M.trimCot, M.leafWood, M.leafWhite, M.leafBlack, M.brick, M.slab, M.found, M.sill, M.stair];
  function applyShell() {
    const a = S.xr;
    for (const m of shellMats) { m.opacity = a; m.transparent = a < 0.999; m.depthWrite = a > 0.6; }
  }
  // wireframe: every mesh in the scene (the picked unit's floors still read by their terracotta lines)
  function applyWire(on: boolean) {
    const all = new Set<any>([...Object.values(M), ...fadeCache.values()]);
    scene.traverse((o: any) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) all.add(m); });
    for (const m of all) if (m && 'wireframe' in m && m !== maskFree && m !== maskBody && !idMats.includes(m)) m.wireframe = on;
    gtao.enabled = !on;
  }
  const camTarget = new THREE.Vector3();
  function step(dt: any) {
    const k = 5.5;
    S.lift = damp(S.lift, targets.lift, k * 0.8, dt);
    S.mainOpen = damp(S.mainOpen, targets.mainOpen, k, dt);
    S.cotOpen = damp(S.cotOpen, targets.cotOpen, k, dt);
    S.xr = damp(S.xr, targets.xr, k, dt);
    applyShell();
    main.position.y = S.lift;
    main.position.z = -BACK * (S.lift / LIFT);
    guides.visible = S.lift > 0.3;
    guideMat.opacity = Math.min(1, S.lift / LIFT) * 0.55;
    if (guides.visible) guideGeoUpdate(S.lift);
    mainRoof.position.y = S.mainOpen * 1.6;
    cottageRoof.position.y = S.cotOpen * 1.4;
    applyFade('main', S.mainOpen);
    applyFade('cottage', S.cotOpen);
    applyFade('fence', S.cotOpen);
    const bOpen = Math.min(1, S.lift / LIFT);
    applyFade('bsmt', bOpen);
    frontBlock.position.y = -bOpen * 2.42;
    frontBlock.visible = bOpen > 0.002 && bOpen < 0.98;
    plinthOpen.visible = bOpen > 0.002;
    plinthSolid.visible = !plinthOpen.visible;
    const capOn = (r: any, v: any) => { r.capMat.opacity = v; r.caps.visible = v > 0.02; };
    capOn(wallRefs.main, S.mainOpen); capOn(wallRefs.basement, bOpen); capOn(wallRefs.cottage, S.cotOpen);
    for (const m of [mainRoof, cottageRoof]) m.traverse((o: any) => { if (o.isMesh) o.castShadow = o.material.opacity > 0.5; });
    for (const rm of roomMeshes) {
      rm.tint = damp(rm.tint, targets.rooms.get(rm.room.id) || 0, k, dt);
      rm.mat.color.copy(rm.mat.userData.baseColor || white).lerp(tc, rm.tint * 0.62);
      rm.mat.emissiveIntensity = rm.tint * 0.22;
    }
    // walking in the studio: the house's hip roof (and its eave) overhangs into the studio's vault, so it is hidden
    // there; everywhere else it stays (cottage and yard views see the house roof through windows)
    const inStudio = S.ctl === 'walk' && W.feet.x > HOUSE.x1 + 0.05;
    mainRoof.visible = !inStudio;
    if (houseEave) houseEave.visible = S.ctl !== 'walk';
    if (S.ctl === 'walk') { walkStep(dt); return; }
    if (S.ctl === 'orbit') { orbitStep(dt); return; }
    const c = S.cam, T = S.camT;
    for (const kk of ['az', 'el', 'dist', 'tx', 'ty', 'tz']) c[kk] = damp(c[kk], T[kk], kk === 'dist' ? 3.2 : 3.8, dt);
    const az = c.az + S.drag;
    camTarget.set(c.tx, c.ty, c.tz);
    camera.position.set(
      camTarget.x + c.dist * Math.cos(c.el) * Math.sin(az),
      camTarget.y + c.dist * Math.sin(c.el),
      camTarget.z + c.dist * Math.cos(c.el) * Math.cos(az),
    );
    camera.lookAt(camTarget);
  }

  // ---- explore: orbit controls (orbit drag, pan right/shift-drag, wheel/pinch zoom) ----
  let controls: any = null;
  const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  // drop any orbit/pan/zoom momentum left by the last drag, so a fly (Reset, a pick) lands exactly on its pose
  function stopInertia() {
    const c: any = controls; if (!c) return;
    c._sphericalDelta?.set(0, 0, 0); c._panOffset?.set(0, 0, 0); c._scale = 1;
  }
  function flyTo(pose: any, secs = 0.9) {
    if (S.ctl !== 'orbit' || !controls) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) secs = 0.0001;
    stopInertia();
    S.fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pose.pos, t1: pose.target, k: 0, secs };
    controls.enabled = false;
    wake();
  }
  function orbitStep(dt: number) {
    if (S.fly) {
      const F = S.fly;
      F.k = Math.min(1, F.k + dt / F.secs);
      const e = ease(F.k);
      camera.position.lerpVectors(F.p0, F.p1, e);
      controls.target.lerpVectors(F.t0, F.t1, e);
      camera.lookAt(controls.target);
      if (F.k >= 1) { S.fly = null; stopInertia(); controls.enabled = true; controls.update(); }
      return;
    }
    controls.update(dt);
    // never under the ground (the basement pit is the lowest thing worth looking at)
    controls.target.y = Math.max(LEVELS.basement.floor, Math.min(RIDGE_Y + 4, controls.target.y));
    if (camera.position.y < GRADE + 0.35) { camera.position.y = GRADE + 0.35; camera.lookAt(controls.target); }
  }
  function enterOrbit() {
    if (!controls) {
      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.09;
      controls.minDistance = 2.5;
      controls.maxDistance = 90;
      controls.maxPolarAngle = Math.PI / 2 - 0.04;
      controls.screenSpacePanning = true;
      controls.zoomToCursor = true;
      controls.zoomSpeed = 0.9;
      controls.addEventListener('change', () => wake(250));
      controls.addEventListener('start', () => { S.touched = true; wake(1000); });
    }
    controls.enabled = true;
    S.touched = false;
    canvas.style.touchAction = 'none';
    controls.target.copy(camTarget);
    controls.update();
  }
  // hand the camera back to the fitted (auto) view without a jump
  function syncAutoFromCamera(target: THREE.Vector3) {
    const off = camera.position.clone().sub(target);
    const d = Math.max(0.01, off.length());
    S.cam = { az: Math.atan2(off.x, off.z), el: Math.asin(Math.max(-1, Math.min(1, off.y / d))), dist: d, tx: target.x, ty: target.y, tz: target.z };
    S.drag = 0;
  }

  // ---- walk mode: first person, 1.6 m eye height, WASD/arrows + mouse look ----
  const EYE = 1.6;
  const W: any = { feet: new THREE.Vector3(), eyeY: 0, yaw: 0, pitch: 0, keys: new Set<string>(), pad: new Set<string>(), joy: { x: 0, y: 0 }, run: false, floors: null, solids: null };
  const floorRay = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  function walkFloors() {
    if (W.floors) return W.floors;
    const list: any[] = [];
    const roofs = new Set<any>();
    mainRoof.traverse((o: any) => roofs.add(o)); cottageRoof.traverse((o: any) => roofs.add(o));
    root.traverse((o: any) => {
      if (!o.isMesh || roofs.has(o) || o.userData.furn) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m: any) => m.userData?.glass || m === M.tree || m === M.trunk || m.name === 'fence')) return;
      list.push(o);
    });
    W.floors = list;
    return list;
  }
  // highest walkable surface under (x, z), at most `reach` above the feet (steps and stair treads)
  function floorAt(x: number, z: number, feetY: number, reach = 0.55) {
    floorRay.set(new THREE.Vector3(x, feetY + reach, z), down);
    floorRay.far = 40;
    for (const h of floorRay.intersectObjects(walkFloors(), false)) {
      if (!h.face || !drawn(h.object)) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (n.y > 0.6) return h.point.y;
    }
    return null;
  }
  const lookTmp = new THREE.Euler(0, 0, 0, 'YXZ');
  function placeWalkCamera() {
    camera.position.set(W.feet.x, W.eyeY, W.feet.z);
    lookTmp.set(W.pitch, W.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(lookTmp);
  }
  function spawn(id: string | null) {
    const roomC = (rid: string) => { const r = ROOMS.find((q: any) => q.id === rid).rects[0]; return [(r[0] + r[1]) / 2, (r[2] + r[3]) / 2]; };
    let x = 0, z = 0, y = LEVELS.main.floor, yaw = 0;
    // no pick: start in the living room (walk always starts inside, on a real floor)
    [x, z] = roomC('living'); z += 0.8;
    if (id === 'two-bed') { [x, z] = roomC('living'); y = LEVELS.main.floor; z += 0.8; yaw = 0; }
    else if (id === 'four-bed') { x = 3.4; z = -0.1; y = LEVELS.main.floor; yaw = Math.PI / 2; }
    else if (id === 'three-bed') { x = 3.8; z = 0.25; y = LEVELS.basement.floor; yaw = 0; }
    else if (id === 'studio') { [x, z] = roomC('studio-room'); y = LEVELS.main.floor; z += 1.2; yaw = 0; }
    else if (id === 'cottage') { const [cx, cz] = roomC('cottage-room'); x = COTTAGE_AT.x + cx - 0.6; z = COTTAGE_AT.z + cz; y = LEVELS.cottage.floor; yaw = -Math.PI / 2; }
    W.feet.set(x, y, z); W.eyeY = y + EYE; W.yaw = yaw; W.pitch = -0.08;
    placeWalkCamera();
    wake(600);
  }
  // vertical surfaces you cannot walk through: walls, trim, doors' frames, fences, tree trunks (not furniture or glass)
  const wallRay = new THREE.Raycaster();
  const RADIUS = 0.28;
  const mdir = new THREE.Vector3(), morg = new THREE.Vector3();
  function solids() {
    if (W.solids) return W.solids;
    const list: any[] = [];
    const roofs = new Set<any>();
    mainRoof.traverse((o: any) => roofs.add(o)); cottageRoof.traverse((o: any) => roofs.add(o));
    root.traverse((o: any) => { if (o.isMesh && !roofs.has(o) && !o.userData.furn) list.push(o); });
    W.solids = list;
    return list;
  }
  function blocked(dx: number, dz: number) {
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return false;
    mdir.set(dx / d, 0, dz / d);
    // knee and chest height above the feet: low sills and window walls both stop you
    for (const h of [0.45, 1.25]) {
      morg.set(W.feet.x, W.feet.y + h, W.feet.z);
      wallRay.set(morg, mdir);
      wallRay.far = d + RADIUS;
      for (const hit of wallRay.intersectObjects(solids(), false)) {
        if (!hit.face || !drawn(hit.object)) continue;
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (Math.abs(n.y) < 0.5) return true;
      }
    }
    return false;
  }
  const keyMap: any = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  const walking = () => W.keys.size + W.pad.size > 0 || W.joy.x !== 0 || W.joy.y !== 0;
  const fwd = new THREE.Vector3(), side = new THREE.Vector3();
  function walkStep(dt: number) {
    updatePools();
    const held = new Set([...W.keys, ...W.pad]);
    const speed = (W.run ? 3.6 : 1.8) * dt;
    fwd.set(-Math.sin(W.yaw), 0, -Math.cos(W.yaw));
    side.set(Math.cos(W.yaw), 0, -Math.sin(W.yaw));
    let f = (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0) + W.joy.y;
    let s = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0) + W.joy.x;
    const mag = Math.hypot(f, s);
    if (mag > 1) { f /= mag; s /= mag; }
    const mx = fwd.x * f + side.x * s, mz = fwd.z * f + side.z * s;
    const len = Math.hypot(mx, mz);
    if (len > 0.02) {
      // walls stop you (slide along them); doors are openings in the wall, so they let you through
      let dx = mx * speed, dz = mz * speed;
      if (blocked(dx, dz)) {
        if (!blocked(dx, 0)) dz = 0;
        else if (!blocked(0, dz)) dx = 0;
        else dx = dz = 0;
      }
      const nx = W.feet.x + dx, nz = W.feet.z + dz;
      // stay on the lot: only step where there is ground (or a floor) under the next position
      const fy = (dx || dz) ? floorAt(nx, nz, W.feet.y) : null;
      if (fy !== null) { W.feet.x = nx; W.feet.z = nz; W.feet.y = fy; }
    } else {
      const fy = floorAt(W.feet.x, W.feet.z, W.feet.y);
      if (fy !== null) W.feet.y = fy;
    }
    W.eyeY = damp(W.eyeY, W.feet.y + EYE, 12, dt);
    placeWalkCamera();
    if (len > 0 || Math.abs(W.eyeY - (W.feet.y + EYE)) > 0.002) wake(200);
  }
  function look(dx: number, dy: number) {
    W.yaw -= dx * 0.0024;
    W.pitch = Math.max(-1.35, Math.min(1.35, W.pitch - dy * 0.0024));
    wake(200);
  }
  const onKey = (e: KeyboardEvent, on: boolean) => {
    if (S.ctl !== 'walk') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'Shift') W.run = on;
    const k = keyMap[e.code];
    if (!k) return;
    e.preventDefault();
    if (on) W.keys.add(k); else W.keys.delete(k);
    wake(300);
  };
  const keyDown = (e: KeyboardEvent) => onKey(e, true);
  const keyUp = (e: KeyboardEvent) => onKey(e, false);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  // a key released while the window is in the background never sends keyup: drop everything held
  const clearKeys = () => { W.keys.clear(); W.pad.clear(); W.joy.x = W.joy.y = 0; W.run = false; };
  const onVis = () => { if (document.hidden) clearKeys(); };
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', onVis);
  // pointer lock: losing it (Esc) leaves walk in one press; if the browser refuses it, drag-look takes over
  let lockedOnce = false, ownUnlock = false;
  const onLockChange = () => {
    if (document.pointerLockElement === canvas) { lockedOnce = true; return; }
    const lost = lockedOnce && !ownUnlock && S.ctl === 'walk';
    lockedOnce = false; ownUnlock = false;
    if (lost) { clearKeys(); if (opts.onWalkEnd) opts.onWalkEnd(); else setControl('orbit'); }
  };
  const onLockError = () => { W.noLock = true; };
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  const lockMove = (e: MouseEvent) => { if (S.ctl === 'walk' && document.pointerLockElement === canvas) look(e.movementX, e.movementY); };
  document.addEventListener('mousemove', lockMove);

  function setControl(mode: string) {
    if (mode === S.ctl) return;
    const prev = S.ctl;
    if (prev === 'walk') {
      if (document.pointerLockElement === canvas) { ownUnlock = true; document.exitPointerLock?.(); }
      clearKeys();
      camera.near = 0.5; camera.fov = camera.aspect < 1.2 ? 34 : 28; camera.updateProjectionMatrix();
    }
    S.ctl = mode;
    canvas.dataset['ctl'] = mode;
    if (roomLightsReady) applyEnv();
    for (const c of ceilings) c.visible = mode === 'walk';
    if (houseEave) houseEave.visible = mode !== 'walk';
    applyTargets();
    if (mode === 'walk') {
      if (controls) controls.enabled = false;
      S.fly = null;
      camera.near = 0.05; camera.fov = 70; camera.updateProjectionMatrix();
      W.floors = null; W.solids = null;
      spawn(S.picked);
    } else if (mode === 'orbit') {
      if (prev === 'walk') {
        // leave the walk where it stood, then glide out to the fitted view for the pick
        const ahead = new THREE.Vector3(0, 0, -4).applyQuaternion(camera.quaternion).add(camera.position);
        camTarget.copy(ahead);
      }
      enterOrbit();
      aimFor(S.picked);
      flyTo(poseOf(S.camT));
    } else {
      if (prev === 'walk') syncAutoFromCamera(new THREE.Vector3(0, 0, -4).applyQuaternion(camera.quaternion).add(camera.position));
      else if (controls) syncAutoFromCamera(controls.target);
      if (controls) controls.enabled = false;
      canvas.style.touchAction = ''; // back to the stylesheet (pan-y), so the page scrolls over the canvas
      S.fly = null;
      aimFor(S.picked);
    }
    wake(1500);
  }
  function resetView() {
    if (S.ctl === 'walk') { spawn(S.picked); return; }
    S.drag = 0;
    applyTargets();
    aimFor(S.picked);
    if (S.ctl === 'orbit') flyTo(poseOf(S.camT));
    wake();
  }
  function setViewMode(mode: string) {
    if (!['solid', 'xray', 'cutaway', 'wire'].includes(mode) || mode === S.view) return;
    S.view = mode;
    const wire = mode === 'wire';
    if (wire !== S.wire) { S.wire = wire; applyWire(wire); }
    applyTargets();
    if (S.ctl !== 'walk') { aimFor(S.picked); if (S.ctl === 'orbit') flyTo(poseOf(S.camT)); }
    wake();
  }

  // double-click (or double-tap) a building to focus that unit
  // raycasts only hit what is actually drawn: every ancestor visible, and not ghosted by X-ray or a fade
  // ghosted: glass, faded out, or see-through in X-ray
  const ghosted = (o: any) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    return mats.every((m: any) => !m || m.userData?.glass || (m.transparent && m.opacity < 0.5) || m.visible === false);
  };
  const drawn = (o: any) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return !ghosted(o); };
  const pickRay = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function unitAt(clientX: number, clientY: number): string | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    pickRay.setFromCamera(ndc, camera);
    const roomOf = new Map(roomMeshes.map((q: any) => [q.mesh, q.room]));
    for (const h of pickRay.intersectObject(root, true)) {
      const o: any = h.object;
      if (!o.isMesh || !drawn(o)) continue;
      const room: any = roomOf.get(o);
      if (room) return room.unit;
      let g: any = o;
      while (g && g !== root) {
        if (g === mainRoof) return 'four-bed';
        if (g === cottage) return 'cottage';
        if (g === bsmt) return 'three-bed';
        if (g === main) return h.point.x > STUDIO.x0 - 0.05 ? 'studio' : 'two-bed';
        if (g === lot) return null;
        g = g.parent;
      }
    }
    return null;
  }

  // label occlusion: throttled raycasts against walls, roofs, slabs and ground only
  const ray = new THREE.Raycaster();
  const wp = new THREE.Vector3(), dir = new THREE.Vector3();
  function updateOcclusion() {
    const solid = occluders.filter((o: any) => {
      return drawn(o);
    });
    for (const L of labels) {
      L.group.updateMatrixWorld();
      L.local.set(...L.at());
      wp.copy(L.local).applyMatrix4(L.group.matrixWorld);
      dir.copy(wp).sub(camera.position);
      const dist = dir.length();
      ray.set(camera.position, dir.normalize());
      ray.far = dist - 0.4;
      L.hidden = ray.intersectObjects(solid, false).length > 0;
    }
  }

  // ---- label layout ----
  // Pills never sit on the model: each one goes to the nearest spot that is empty background or open lawn
  // (a low-res silhouette mask of everything else), clear of the other pills and of the explore toolbar,
  // and a 1px leader runs back to its anchor. While the camera moves the pills fade out; they are laid out
  // again once it stops.
  const v3 = new THREE.Vector3();
  const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leaders.setAttribute('class', 'ns-leaders');
  leaders.setAttribute('aria-hidden', 'true');
  labelLayer.prepend(leaders);
  const MS = 0.25; // mask scale (mask px per CSS px)
  let maskRT: any = null;
  const maskFree = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const maskBody = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const freeMats = new Set<any>([M.lawn, M.drive]);
  // ---- R8 accent mask ----
  // The canvas is a photoreal scene (data-realism="photo"): its materials follow the listing photos, and the only UI
  // marks drawn INTO the scene are the terracotta room highlights (selection / hover tint on the floors). Pins, labels,
  // room tags, dimension pills and the Rotate hint are DOM overlays and are checked as normal UI; the guide lines are
  // ink. __accentMask() renders those highlights (occlusion kept) at CSS size: 1 = UI mark pixel, row-major, y down.
  canvas.dataset['realism'] = 'photo';
  const accentOn = new THREE.MeshBasicMaterial({ color: 0xffffff });
  let accRT: any = null;
  (canvas as any).__accentMask = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth)), h = Math.max(1, Math.round(canvas.clientHeight));
    if (!accRT || accRT.width !== w || accRT.height !== h) { accRT?.dispose(); accRT = new THREE.WebGLRenderTarget(w, h); }
    const marks = new Set(roomMeshes.filter((rm) => rm.tint > 0.02).map((rm) => rm.mesh));
    const saved: any[] = [], hid: any[] = [];
    scene.traverse((o: any) => {
      if (o.isLine || o.isLineSegments || o.isPoints || o.isSprite) { hid.push([o, o.visible]); o.visible = false; return; }
      if (!o.isMesh) return;
      saved.push([o, o.material]);
      // transparent / faded shells don't hide what's behind them on screen, so they don't occlude here either
      const mm = Array.isArray(o.material) ? o.material[0] : o.material;
      const see = mm && mm.transparent && mm.opacity < 0.5;
      o.material = marks.has(o) ? accentOn : see ? (hid.push([o, o.visible]), o.visible = false, maskFree) : maskFree;
    });
    const bg = scene.background, sm = renderer.shadowMap.enabled, tm = renderer.toneMapping, prevRT = renderer.getRenderTarget();
    scene.background = null; renderer.shadowMap.enabled = false; renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(accRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(0x000000, 0);
    scene.background = bg; renderer.shadowMap.enabled = sm; renderer.toneMapping = tm;
    for (const [o, m] of saved) o.material = m;
    for (const [o, v] of hid) o.visible = v;
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(accRT, 0, 0, w, h, px);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(h - 1 - y) * w + x] = px[(y * w + x) * 4] > 127 ? 1 : 0;
    return out;
  };

  function silhouette(w: number, h: number) {
    const mw = Math.max(8, Math.round(w * MS)), mh = Math.max(8, Math.round(h * MS));
    if (!maskRT || maskRT.width !== mw || maskRT.height !== mh) { maskRT?.dispose(); maskRT = new THREE.WebGLRenderTarget(mw, mh); }
    const saved: any[] = [], lines: any[] = [];
    scene.traverse((o: any) => {
      if (o.isLine || o.isLineSegments || o.isPoints) { lines.push([o, o.visible]); o.visible = false; return; }
      if (!o.isMesh) return;
      saved.push([o, o.material]);
      const sw = (m: any) => (freeMats.has(m) ? maskFree : maskBody);
      o.material = Array.isArray(o.material) ? o.material.map(sw) : sw(o.material);
    });
    const bg = scene.background, sm = renderer.shadowMap.enabled, tm = renderer.toneMapping;
    scene.background = null; renderer.shadowMap.enabled = false; renderer.toneMapping = THREE.NoToneMapping;
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(maskRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(0x000000, 0);
    scene.background = bg; renderer.shadowMap.enabled = sm; renderer.toneMapping = tm;
    for (const [o, m] of saved) o.material = m;
    for (const [o, v] of lines) o.visible = v;
    const px = new Uint8Array(mw * mh * 4);
    renderer.readRenderTargetPixels(maskRT, 0, 0, mw, mh, px);
    if ((globalThis as any).__nsMaskDebug) (globalThis as any).__nsMask = { mw, mh, px: Array.from(px.filter((_, i) => i % 4 === 0)) };
    // summed-area table, rows flipped to screen order (y down)
    const sat = new Uint32Array((mw + 1) * (mh + 1));
    for (let y = 0; y < mh; y++) {
      let row = 0;
      const src = (mh - 1 - y) * mw * 4;
      for (let x = 0; x < mw; x++) {
        row += px[src + x * 4] > 60 ? 1 : 0;
        sat[(y + 1) * (mw + 1) + x + 1] = sat[y * (mw + 1) + x + 1] + row;
      }
    }
    // body pixels inside a CSS-px rect (conservative: rounds outward)
    return (l: number, t: number, r: number, b: number) => {
      const x0 = Math.max(0, Math.floor(l * MS)), y0 = Math.max(0, Math.floor(t * MS));
      const x1 = Math.min(mw, Math.ceil(r * MS)), y1 = Math.min(mh, Math.ceil(b * MS));
      if (x1 <= x0 || y1 <= y0) return 0;
      const W1 = mw + 1;
      return sat[y1 * W1 + x1] - sat[y0 * W1 + x1] - sat[y1 * W1 + x0] + sat[y0 * W1 + x0];
    };
  }
  // Room tags sit on their own room's floor: one low-res render paints each wanted room's floor in its own
  // id (everything else, furniture and walls included, paints black and hides what is behind it), so a tag
  // fits only where its room's floor is actually visible.
  const RS = 0.5; // room mask scale
  let roomRT: any = null;
  const idMats: any[] = [];
  function roomMask(w: number, h: number, rms: any[]) {
    const mw = Math.max(8, Math.round(w * RS)), mh = Math.max(8, Math.round(h * RS));
    if (!roomRT || roomRT.width !== mw || roomRT.height !== mh) { roomRT?.dispose(); roomRT = new THREE.WebGLRenderTarget(mw, mh); }
    const ids = new Map<any, number>();
    rms.forEach((rm: any, i: number) => {
      ids.set(rm.mesh, i + 1);
      idMats[i] ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(((i + 1) * 20) / 255, 0, 0) });
    });
    const saved: any[] = [], hidden: any[] = [];
    scene.traverse((o: any) => {
      if (o.isLine || o.isLineSegments || o.isPoints) { if (o.visible) { hidden.push(o); o.visible = false; } return; }
      if (!o.isMesh) return;
      const id = ids.get(o);
      // rugs are flat floor too; glass and ghosted (X-ray, faded) parts hide nothing
      if (!id && o.visible && (ghosted(o) || o.material === M.rug)) { hidden.push(o); o.visible = false; return; }
      saved.push([o, o.material]);
      o.material = id ? idMats[id - 1] : maskFree;
    });
    const bg = scene.background, sm = renderer.shadowMap.enabled, tm = renderer.toneMapping;
    scene.background = null; renderer.shadowMap.enabled = false; renderer.toneMapping = THREE.NoToneMapping;
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(roomRT); renderer.setClearColor(0x000000, 1); renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(0x000000, 0);
    scene.background = bg; renderer.shadowMap.enabled = sm; renderer.toneMapping = tm;
    for (const [o, m] of saved) o.material = m;
    for (const o of hidden) o.visible = true;
    const px = new Uint8Array(mw * mh * 4);
    renderer.readRenderTargetPixels(roomRT, 0, 0, mw, mh, px);
    if ((globalThis as any).__nsMaskDebug) (globalThis as any).__nsRoomMask = { mw, mh, px: Array.from(px.filter((_, i) => i % 4 === 0)) };
    // one summed-area table per room (screen order, y down), plus the room's visible centroid
    const W1 = mw + 1;
    return rms.map((_: any, i: number) => {
      const sat = new Uint32Array(W1 * (mh + 1));
      let n = 0, sx = 0, sy = 0;
      for (let y = 0; y < mh; y++) {
        let row = 0;
        const src = (mh - 1 - y) * mw * 4;
        for (let x = 0; x < mw; x++) {
          const on = Math.round(px[src + x * 4] / 20) === i + 1 ? 1 : 0;
          row += on; if (on) { n++; sx += x; sy += y; }
          sat[(y + 1) * W1 + x + 1] = sat[y * W1 + x + 1] + row;
        }
      }
      // is the CSS-px rect entirely on this room's visible floor? (rounds outward, so it errs inside)
      const inside = (l: number, t: number, r: number, b: number) => {
        const x0 = Math.floor(l * RS), y0 = Math.floor(t * RS), x1 = Math.ceil(r * RS), y1 = Math.ceil(b * RS);
        if (x0 < 0 || y0 < 0 || x1 > mw || y1 > mh) return false;
        return sat[y1 * W1 + x1] - sat[y0 * W1 + x1] - sat[y1 * W1 + x0] + sat[y0 * W1 + x0] === (x1 - x0) * (y1 - y0);
      };
      // share of the CSS-px rect that is on this room's visible floor (furniture and partitions in front take the rest)
      const frac = (l: number, t: number, r: number, b: number) => {
        const x0 = Math.max(0, Math.round(l * RS)), y0 = Math.max(0, Math.round(t * RS)), x1 = Math.min(mw, Math.round(r * RS)), y1 = Math.min(mh, Math.round(b * RS));
        const area = Math.max(1, (x1 - x0) * (y1 - y0));
        if (x1 <= x0 || y1 <= y0) return 0;
        return (sat[y1 * W1 + x1] - sat[y0 * W1 + x1] - sat[y1 * W1 + x0] + sat[y0 * W1 + x0]) / area;
      };
      return { n, cx: n ? (sx / n + 0.5) / RS : 0, cy: n ? (sy / n + 0.5) / RS : 0, inside, frac };
    });
  }
  function wantedLabels(w: number, h: number) {
    const compact = w < 560;
    const items: any[] = [];
    for (const L of labels) {
      let want = L.kind === 'unit' || (S.picked && S.pickedRooms.has(L.room.id));
      // a picked unit names its bedrooms and laundry only; the chips and caption carry the rest
      if (L.kind === 'room') want = want && L.prio >= (compact ? 7 : 5);
      const inside = seeThrough();
      if (L.kind === 'room' && L.room.level === 'basement' && S.lift < LIFT * 0.7 && !inside) want = false;
      if (L.kind === 'room' && L.room.level === 'main' && S.mainOpen < 0.7 && !inside) want = false;
      if (L.kind === 'room' && L.room.level === 'cottage' && S.cotOpen < 0.7 && !inside) want = false;
      if (S.ctl === 'walk') want = false; // first person: the room is the subject, nothing is drawn over it
      if (L.hidden && L.kind === 'unit') want = false; // room tags are tested against their visible floor instead
      L.local.set(...L.at());
      L.group.updateMatrixWorld();
      v3.copy(L.local).applyMatrix4(L.group.matrixWorld).project(camera);
      L.el.dataset.state = L.kind === 'unit' ? targets.tags.get(L.unit) : 'room';
      items.push({ L, want: want && v3.z < 1 && Math.abs(v3.x) < 1 && Math.abs(v3.y) < 1, x: (v3.x * 0.5 + 0.5) * w, y: (-v3.y * 0.5 + 0.5) * h, occluded: !!L.hidden });
    }
    return { items, compact };
  }
  function hideLabels() {
    for (const L of labels) L.el.classList.remove('on');
    leaders.classList.remove('on');
  }
  function placeLabels() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const { items, compact } = wantedLabels(w, h);
    labelLayer.classList.toggle('compact', compact);
    leaders.setAttribute('viewBox', `0 0 ${w} ${h}`);
    leaders.setAttribute('width', String(w)); leaders.setAttribute('height', String(h));
    const shown = items.filter((it: any) => it.want);
    for (const it of items) it.L.el.classList.remove('short');
    S.labelLog = items.map((it: any) => ({ t: it.L.el.textContent, kind: it.L.kind, want: it.want, occluded: it.occluded, placed: false, x: Math.round(it.x), y: Math.round(it.y) }));
    for (const it of items) if (!it.want) it.L.el.classList.remove('on');
    if (!shown.length) { leaders.innerHTML = ''; return; }
    const body = silhouette(w, h);
    // keep clear of the stage edge and of any overlaid toolbar
    const B = band();
    const edge = 8, top = edge + ((1 - (B.c + B.h)) / 2) * h, bottomLimit = h - edge - ((B.c - B.h + 1) / 2) * h;
    const rank = (L: any) => (L.kind === 'unit' ? (L.unit === S.picked ? 100 : targets.tags.get(L.unit) === 'blocked' ? 60 : 50) : L.prio);
    shown.sort((a: any, b: any) => rank(b.L) - rank(a.L));
    const placed: any[] = [];
    const gap = compact ? 4 : 8, clear = compact ? 4 : 8;
    const angles: number[] = [];
    for (let i = 0; i < 24; i++) angles.push((i / 24) * Math.PI * 2);
    // prefer sideways, then up, then down
    angles.sort((a, b) => Math.abs(Math.sin(a)) - Math.abs(Math.sin(b)) || Math.sin(a) - Math.sin(b));
    const lines: string[] = [];
    const segs: number[][] = [];
    // does the segment cross the rect (shrunk by 1px)? Liang-Barsky clip
    const segHits = (x1: number, y1: number, x2: number, y2: number, q: any) => {
      const l = q.l + 1, t = q.t + 1, r = q.r - 1, b = q.b - 1, dx = x2 - x1, dy = y2 - y1;
      let u0 = 0, u1 = 1;
      for (const [p, v] of [[-dx, x1 - l], [dx, r - x1], [-dy, y1 - t], [dy, b - y1]]) {
        if (p === 0) { if (v < 0) return false; continue; }
        const u = v / p;
        if (p < 0) { if (u > u1) return false; if (u > u0) u0 = u; } else { if (u < u0) return false; if (u < u1) u1 = u; }
      }
      return u1 - u0 > 1e-3;
    };
    // room tags first: on their own room's visible flat floor (rugs count) and nowhere else, no leader;
    // a room too small on screen for its tag simply has none until the view zooms in
    const roomItems = shown.filter((it: any) => it.L.kind === 'room').sort((a: any, b: any) => b.L.prio - a.L.prio);
    if (roomItems.length) {
      const rms = roomItems.map((it: any) => roomMeshes.find((q: any) => q.room === it.L.room));
      const masks = roomMask(w, h, rms);
      const inset = 0;
      // the room's own outline on screen (its floor box, grown by half a partition): a tag may graze a partition
      // into the next room, but every corner stays inside this outline, so it never crosses an exterior wall
      const outline = (rm: any) => {
        const bx = new THREE.Box3().setFromObject(rm.mesh), g = 0.12;
        return [[bx.min.x - g, bx.min.z - g], [bx.max.x + g, bx.min.z - g], [bx.max.x + g, bx.max.z + g], [bx.min.x - g, bx.max.z + g]]
          .map(([x, z]) => { fitTmp.set(x, bx.max.y, z).project(camera); return [(fitTmp.x * 0.5 + 0.5) * w, (-fitTmp.y * 0.5 + 0.5) * h]; });
      };
      const inPoly = (q: number[][], x: number, y: number) => {
        let sgn = 0;
        for (let k = 0; k < q.length; k++) {
          const [ax, ay] = q[k], [bx, by] = q[(k + 1) % q.length];
          const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
          if (c !== 0) { if (sgn && Math.sign(c) !== sgn) return false; sgn = Math.sign(c); }
        }
        return true;
      };
      roomItems.forEach((it: any, i: number) => {
        const { L } = it, R = masks[i];
        const Q = outline(rms[i]);
        const fits = (l: number, t: number, r: number, b: number) => R.inside(l, t, r, b) ||
          (R.frac(l, t, r, b) >= 0.6 && R.frac((l + r) / 2 - 2, (t + b) / 2 - 2, (l + r) / 2 + 2, (t + b) / 2 + 2) > 0.99 &&
            inPoly(Q, l, t) && inPoly(Q, r, t) && inPoly(Q, r, b) && inPoly(Q, l, b));
        let best: any = null;
        if (R.n > 0) for (const short of [false, true]) {
          L.el.classList.toggle('short', short);
          const bw = L.el.offsetWidth || 80, bh = L.el.offsetHeight || 22;
          // spiral out from the centre of the room's visible floor
          for (let r = 0; r <= 160 && !best; r += 4) {
            const n = r === 0 ? 1 : Math.max(8, Math.round(r / 3));
            for (let k = 0; k < n && !best; k++) {
              const a = (k / n) * Math.PI * 2;
              const l = R.cx + Math.cos(a) * r - bw / 2, t = R.cy + Math.sin(a) * r - bh / 2, rr = l + bw, bb = t + bh;
              if (l < edge || rr > w - edge || t < top || bb > bottomLimit) continue;
              if (!fits(l - inset, t - inset, rr + inset, bb + inset)) continue;
              if (placed.some((p: any) => !(rr + gap < p.l || l - gap > p.r || bb + gap < p.t || t - gap > p.b))) continue;
              best = { l, t, r: rr, b: bb };
            }
          }
          if (best) break;
        }
        const lg = S.labelLog.find((q: any) => q.t === L.el.textContent);
        if (lg) { lg.floorPx = R.n; lg.cx = Math.round(R.cx); lg.cy = Math.round(R.cy); }
        if (!best) { L.el.classList.remove('on', 'short'); return; }
        if (lg) { lg.placed = true; lg.inRoom = true; }
        placed.push(best);
        L.el.style.transform = `translate(${best.l.toFixed(1)}px, ${best.t.toFixed(1)}px)`;
        L.el.classList.add('on');
      });
    }
    // tags stay near what they name: past this leader length the tag is left off (the chips still name every unit)
    const maxR = compact ? 150 : 260;
    for (const it of shown) {
      const { L } = it;
      if (L.kind === 'room') continue;
      const bw = L.el.offsetWidth || 80, bh = L.el.offsetHeight || 22;
      let best: any = null, bestCost = Infinity, rFirst = 0;
      // leader length over the model counts double, so tags prefer the side their room is on
      const overBody = (x1: number, y1: number, x2: number, y2: number) => {
        const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4)); let c = 0;
        for (let k = 1; k <= n; k++) { const x = x1 + ((x2 - x1) * k) / n, y = y1 + ((y2 - y1) * k) / n; if (body(x - 0.5, y - 0.5, x + 0.5, y + 0.5) > 0) c++; }
        return (c / n) * Math.hypot(x2 - x1, y2 - y1);
      };
      // unit tags (at most five) may reach further than room tags
      const reach = maxR * 1.6;
      for (let r = 12; r <= reach && (!best || r <= rFirst + 160); r += 8) {
        for (const a of angles) {
          const cx = it.x + Math.cos(a) * (r + bw / 2), cy = it.y + Math.sin(a) * (r + bh / 2);
          const l = cx - bw / 2, t = cy - bh / 2, rr = cx + bw / 2, bb = cy + bh / 2;
          if (l < edge || rr > w - edge || t < top || bb > bottomLimit) continue;
          if (body(l - clear, t - clear, rr + clear, bb + clear) > 0) continue;
          if (placed.some((p: any) => !(rr + gap < p.l || l - gap > p.r || bb + gap < p.t || t - gap > p.b))) continue;
          // a leader never runs under another tag, and a tag never sits on another tag's leader
          const ex = Math.max(l, Math.min(rr, it.x)), ey = Math.max(t, Math.min(bb, it.y)), cand = { l: l - 2, t: t - 2, r: rr + 2, b: bb + 2 };
          if (placed.some((p: any) => segHits(it.x, it.y, ex, ey, p))) continue;
          if (segs.some((g) => segHits(g[0], g[1], g[2], g[3], cand))) continue;
          const cost = Math.hypot(ex - it.x, ey - it.y) + 1.5 * overBody(it.x, it.y, ex, ey);
          if (cost < bestCost) { bestCost = cost; best = { l, t, r: rr, b: bb }; if (!rFirst) rFirst = r; }
        }
      }
      if (!best) { L.el.classList.remove('on'); continue; }
      const lg = S.labelLog.find((q: any) => q.t === L.el.textContent);
      if (lg) { lg.placed = true; lg.onBody = body(best.l, best.t, best.r, best.b); }
      placed.push(best);
      L.el.style.transform = `translate(${best.l.toFixed(1)}px, ${best.t.toFixed(1)}px)`;
      L.el.classList.add('on');
      // leader: anchor dot to the nearest point on the pill
      const ex = Math.max(best.l, Math.min(best.r, it.x)), ey = Math.max(best.t, Math.min(best.b, it.y));
      segs.push([it.x, it.y, ex, ey]);
      const hot = L.kind === 'unit' && L.unit === S.picked ? ' hot' : '';
      lines.push(`<line class="ns-leader${hot}" x1="${it.x.toFixed(1)}" y1="${it.y.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/><circle class="ns-anchor${hot}" cx="${it.x.toFixed(1)}" cy="${it.y.toFixed(1)}" r="2.5"/>`);
    }
    leaders.innerHTML = lines.join('');
    leaders.classList.add('on');
  }
  // pills are laid out only on a still frame; any camera, size or state change fades them until the next still frame
  let labelSig = '', needPlace = true;
  const sigNow = () => {
    const e = camera.matrixWorld.elements;
    return [e[12], e[13], e[14], e[8], e[9], e[10], camera.fov, stage.clientWidth, stage.clientHeight].map((v: number) => v.toFixed(3)).join(',') +
      `|${S.picked}|${S.view}|${S.ctl}|${S.lift.toFixed(2)}|${S.mainOpen.toFixed(2)}|${S.cotOpen.toFixed(2)}|${S.xr.toFixed(2)}`;
  };
  function labelsTick(still: boolean) {
    const sig = sigNow();
    if (sig !== labelSig) { labelSig = sig; needPlace = true; hideLabels(); return; }
    if (still && needPlace) { needPlace = false; updateOcclusion(); placeLabels(); }
  }

  // ---- theme ----
  function setTheme(dark: boolean, accent?: string): void {
    if (accent) tc.set(accent);
    const t = dark ? THEMES.dark : THEMES.light;
    M.lawn.color.set(R.exterior ? t.lawn : t.lawnProc); // the scanned grass albedo is brown-green: tint it once bound M.plinthSide.color.set(t.plinth); M.drive.color.set(t.drive);
    for (const m of [M.fence, ...fadeSets.fence]) m.color.set(t.fence); M.tree.color.set(t.tree); M.trunk.color.set(t.trunk);
    guideMat.color.set(t.guide);
    for (const r of Object.values(wallRefs) as any[]) r.capMat.color.set(t.cap);
    hemi.groundColor.set(t.hemiG); hemi.intensity = t.hemi; key.intensity = t.key; scene.environmentIntensity = t.env;
    S.dark = dark;
    if (typeof applyEnv === 'function' && roomLightsReady) applyEnv();
    S.dark = dark;
    wake(400);
  }
  if (opts.dark) setTheme(true);
  // warm the X-ray and wireframe variants with the model (shader programs, wireframe index buffers),
  // so the first switch to either mode does not stall
  {
    const warmRT = new THREE.WebGLRenderTarget(64, 64), prev = renderer.getRenderTarget();
    renderer.setRenderTarget(warmRT);
    try {
      renderer.compile(scene, camera);
      applyWire(true); renderer.render(scene, camera); applyWire(false);
      const xr = S.xr; S.xr = 0.2; applyShell(); renderer.render(scene, camera); S.xr = xr; applyShell();
      renderer.render(scene, camera);
    } finally { renderer.setRenderTarget(prev); warmRT.dispose(); }
  }

  // ---- realism (RUBRIC v2.2): warm interior lights, CC0 PBR maps, HDRI, glTF furniture ----
  // one warm point light (2900 K, #ffd3a0) in the largest room of each unit, below the ceiling, no shadows
  const roomLights: THREE.PointLight[] = [];
  {
    const best = new Map<string, any>();
    for (const room of ROOMS) {
      if (room.outdoor || !room.unit) continue;
      const area = room.rects.reduce((a: number, [x0, x1, z0, z1]: any) => a + (x1 - x0) * (z1 - z0), 0);
      if (!best.has(room.unit) || best.get(room.unit).area < area) best.set(room.unit, { room, area });
    }
    for (const { room } of best.values()) {
      if (phone && roomLights.length >= 2) break;
      const [x0, x1, z0, z1] = room.rects[0];
      const lv = LEVELS[room.level];
      const l = new THREE.PointLight('#ffd3a0', 1.6, 6.5, 2);
      l.position.set((x0 + x1) / 2, lv.floor + lv.height - 0.45, (z0 + z1) / 2);
      levelGroup[room.level].add(l);
      roomLights.push(l);
    }
  }
  // Walk light pools (fixed counts, so no shader recompiles): the nearest lamps get warm 2700 K point lights (light
  // pools with inverse-square falloff), the nearest windows get daylight RectAreaLights facing into the room (window
  // glow that falls off across the floor). Phones get neither. Reassigned as the walker moves.
  const lampPool: THREE.PointLight[] = [], winPool: THREE.RectAreaLight[] = [];
  const WINS: { group: any; c: THREE.Vector3; n: THREE.Vector3; w: number; h: number }[] = [];
  if (!phone) {
    RectAreaLightUniformsLib.init();
    for (let i = 0; i < 5; i++) { const l = new THREE.PointLight('#ffbd7a', 0, 3.4, 2); scene.add(l); lampPool.push(l); }
    for (let i = 0; i < 4; i++) { const l = new THREE.RectAreaLight('#f3f6ff', 0, 1, 1); scene.add(l); winPool.push(l); }
    for (const lv of Object.keys(WALLS)) {
      const L = (LEVELS as any)[lv], grp = levelGroup[lv];
      const rooms = (ROOMS as any[]).filter((r) => r.level === lv && !r.outdoor);
      const inRoom = (x: number, z: number) => rooms.some((r) => r.rects.some(([x0, x1, z0, z1]: any) => x > x0 && x < x1 && z > z0 && z < z1));
      for (const w of (WALLS as any)[lv]) for (const o of w.o || []) {
        if (o.kind !== 'window' && !(o.kind === 'door' && o.leaf === 'glass')) continue;
        const dx = Math.sign(w.b[0] - w.a[0]), dz = Math.sign(w.b[1] - w.a[1]);
        const cx = w.a[0] + dx * o.at, cz = w.a[1] + dz * o.at, nx = -dz, nz = dx;
        const side = inRoom(cx + nx * 0.3, cz + nz * 0.3) ? 1 : inRoom(cx - nx * 0.3, cz - nz * 0.3) ? -1 : 0;
        if (!side) continue;
        const off = w.t / 2 + 0.02;
        WINS.push({ group: grp, c: new THREE.Vector3(cx + nx * side * off, L.floor + (o.sill + o.head) / 2, cz + nz * side * off), n: new THREE.Vector3(nx * side, 0, nz * side), w: o.w, h: o.head - o.sill });
      }
    }
  }
  const poolAt = new THREE.Vector3(1e9, 0, 0), tmpW = new THREE.Vector3(), tmpN = new THREE.Vector3();
  function updatePools(force = false) {
    if (phone) return;
    const on = S.ctl === 'walk';
    if (!on) { for (const l of lampPool) l.intensity = 0; for (const l of winPool) l.intensity = 0; poolAt.set(1e9, 0, 0); return; }
    if (!force && poolAt.distanceTo(camera.position) < 0.6) return;
    poolAt.copy(camera.position);
    const lamps = LAMPS.map((q) => { const p = q.group.localToWorld(q.p.clone()); return { p, d: p.distanceTo(camera.position) }; }).sort((a, b) => a.d - b.d);
    lampPool.forEach((l, i) => { const q = lamps[i]; if (!q || q.d > 9) { l.intensity = 0; return; } l.position.copy(q.p); l.intensity = 2.4; });
    const wins = WINS.map((q) => { const c = q.group.localToWorld(q.c.clone()); return { q, c, d: c.distanceTo(camera.position) }; }).sort((a, b) => a.d - b.d);
    winPool.forEach((l, i) => {
      const it = wins[i]; if (!it || it.d > 10) { l.intensity = 0; return; }
      l.width = it.q.w; l.height = it.q.h; l.position.copy(it.c);
      tmpN.copy(it.q.n).transformDirection(it.q.group.matrixWorld);
      l.lookAt(tmpW.copy(it.c).add(tmpN)); l.intensity = 5.5;
    });
  }
  roomLightsReady = true;
  const assets = createAssets(renderer, { phone });
  // environment per camera mode: sky HDRI outside, indoor probe + brighter warm lamps in Walk
  function applyEnv() {
    const t = S.dark ? THEMES.dark : THEMES.light;
    const inside = S.ctl === 'walk';
    scene.environment = inside || !skyEnvTex ? roomEnvTex : skyEnvTex;
    // Walk: the CC0 sky is what the windows look out on (outside views keep the page behind the model)
    scene.background = inside && skyEnvTex ? skyEnvTex : null;
    scene.backgroundIntensity = 0.9;
    // Walk: less flat fill so the window glow and lamp pools carry the room (photo look: bright windows, warm falloff)
    scene.environmentIntensity = inside ? 0.6 : t.env;
    // warmer, brighter interior white balance toward the listing photos (wb.py: photo walls read b* 8-27, L* 69-81)
    hemi.intensity = inside ? 0.2 : t.hemi;
    hemi.color.set(inside ? '#ffe6c2' : '#fffaf2');
    renderer.toneMappingExposure = inside ? 1.12 : 1.0;
    for (const l of roomLights) l.intensity = inside ? 2.6 : 1.6;
    // window glass reads as bright daylight from inside, as in the listing photos (exposed for the room)
    M.glass.emissive.set(inside ? '#f6f8fb' : '#000000'); M.glass.emissiveIntensity = inside ? 1.1 : 0; M.glass.opacity = inside ? 0.82 : 0.42;
    updatePools(true);
  }
  const pbrMats = () => {
    const out = new Map<string, any[]>();
    const seen = new Set<any>();
    const take = (m: any) => { if (!m || seen.has(m) || !m.userData?.pbr) return; seen.add(m); const k = m.userData.pbr[0]; if (!out.has(k)) out.set(k, []); out.get(k)!.push(m); };
    for (const m of Object.values(M)) take(m);
    for (const m of fadeCache.values()) take(m);
    scene.traverse((o: any) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) take(m); });
    return out;
  };
  const bindSets = async (keys: string[]) => {
    const byKey = pbrMats();
    await Promise.all(keys.filter((k) => byKey.has(k)).map(async (k) => {
      const set = await assets.loadSet(k);
      if (!alive) return;
      for (const m of byKey.get(k)!) {
        const [, opt] = m.userData.pbr;
        bind(m, set, opt);
        if (opt.color) { m.color.set(opt.color); m.userData.baseColor = m.color.clone(); }
        if (!opt.noMap) m.bumpMap = null;
      }
    }));
  };
  const placeFurniture = async () => {
    const keys = [...new Set(GLB_SPOTS.map((sp) => sp.key))];
    const src: any = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await assets.loadModel(k).catch(() => null)])));
    if (!alive) return;
    for (const sp of GLB_SPOTS) {
      const o = src[sp.key];
      if (!o) continue;
      o.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const inner = o.clone(true);
      inner.position.set(-ctr.x, -box.min.y, -ctr.z);
      const outer = new THREE.Group();
      outer.add(inner);
      const k = sp.size / Math.max(size.x, size.z);
      outer.scale.set(k, sp.height ? sp.height / size.y : k, k);
      outer.rotation.y = sp.rot;
      outer.position.set(sp.x, sp.y + 0.012, sp.z); // floor top is at +11 mm: sit on it, no coplanar faces
      outer.traverse((m: any) => {
        if (!m.isMesh) return;
        m.castShadow = m.receiveShadow = true; m.userData.furn = true;
        if (sp.tint && /pillow|fabric|cushion/i.test(m.material?.name || '')) {
          // re-cover in the listing's colour: drop the baked albedo (a dark leather / chevron print would swallow the
          // tint) and keep the normal map for the weave and seams
          m.material = m.material.clone(); m.material.map = null; m.material.color.set(sp.tint); m.material.roughness = 0.92; m.material.metalness = 0; m.material.needsUpdate = true;
        }
      });
      sp.group.add(outer);
      R.furniture++;
    }
    for (const m of standMeshes) if (src[m.userData.standFor]) m.visible = false;
  };
  const refreshAfterLoad = () => { if (!alive) return; shadowSig = ''; wake(600); };
  // lazy: nothing here is fetched until the 3D view has drawn its first frame; exterior + sky first, interior after
  const startRealism = () => {
    if (R.started || !alive) return;
    R.started = true;
    assets.loadEnv().then((tex) => { if (!alive) return; skyEnvTex = tex; applyEnv(); R.env = true; refreshAfterLoad(); })
      .catch(() => { R.errors++; });
    bindSets(EXTERIOR_SETS).then(() => { R.exterior = true; setTheme(S.dark); refreshAfterLoad(); })
      .catch(() => { R.errors++; })
      .then(() => bindSets(['floor', 'plaster', 'tile', 'weave', 'cotton', 'linen', 'walnut', 'oakveneer']))
      .then(() => { R.interior = true; refreshAfterLoad(); })
      .catch(() => { R.errors++; })
      .then(() => placeFurniture())
      .then(refreshAfterLoad)
      .catch(() => { R.errors++; });
  };

  // adaptive quality: when rAF p95 over the last 2 s exceeds the budget (22.2 ms desktop, 33.3 ms phone),
  // step the pixel-ratio cap 2 -> 1.5 -> 1, then the shadow map 2048 -> 1024. Never below DPR 1.
  const frameDts: number[] = [];
  let lastAdapt = 0;
  const adapt = (now: number, dtMs: number) => {
    frameDts.push(now, dtMs);
    while (frameDts.length && frameDts[0] < now - 2000) frameDts.splice(0, 2);
    if (now - lastAdapt < 2000 || frameDts.length < 60) return;
    const d = frameDts.filter((_, i) => i % 2 === 1).sort((a, b) => a - b);
    const p95 = d[Math.floor(d.length * 0.95)];
    if (p95 <= (phone ? 33.3 : 22.2)) return;
    lastAdapt = now;
    if (Q.dprCap > 1) { Q.dprCap = Q.dprCap > 1.5 ? 1.5 : 1; Q.steps++; resize(); }
    else if (Q.shadow > 1024) { Q.shadow = 1024; Q.steps++; key.shadow.mapSize.set(1024, 1024); key.shadow.map?.dispose(); key.shadow.map = null as any; }
  };

  // ---- loop, resize, input ----
  const settled = () => {
    const c = S.cam, T = S.camT;
    if (Math.abs(S.lift - targets.lift) > 2e-3 || Math.abs(S.mainOpen - targets.mainOpen) > 1e-3 || Math.abs(S.cotOpen - targets.cotOpen) > 1e-3) return false;
    if (S.ctl === 'auto') for (const kk of ['az', 'el', 'dist', 'tx', 'ty', 'tz']) if (Math.abs(c[kk] - T[kk]) > (kk === 'dist' ? 4e-3 : 1e-3)) return false;
    if (Math.abs(S.xr - targets.xr) > 2e-3) return false;
    for (const rm of roomMeshes) if (Math.abs(rm.tint - (targets.rooms.get(rm.room.id) || 0)) > 2e-3) return false;
    return true;
  };
  // shadows only re-render when something that casts them moved (lift, opening, x-ray fade, view or camera mode,
  // newly loaded assets): an orbiting camera reuses the map, which keeps draw calls and frame time down
  let shadowSig = '';
  const renderFrame = () => {
    renderer.info.reset();
    const sig = `${S.lift.toFixed(3)}|${S.mainOpen.toFixed(3)}|${S.cotOpen.toFixed(3)}|${S.xr.toFixed(3)}|${S.view}|${S.ctl}|${R.furniture}|${Q.shadow}`;
    if (sig !== shadowSig) { shadowSig = sig; renderer.shadowMap.needsUpdate = true; }
    composer.render();
  };
  let sizedW = 0, sizedH = 0;
  const resize = () => {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    sizedW = w; sizedH = h;
    // full screen on a big display: cap the pixel count (inline sizes keep the full 2x)
    const dpr = Math.min(window.devicePixelRatio || 1, Q.dprCap, Math.max(1, Math.sqrt(4.2e6 / (w * h))));
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    if (S.ctl !== 'walk') camera.fov = w / h < 1.2 ? 34 : 28;
    camera.updateProjectionMatrix();
    if (S.fitBox && S.ctl === 'auto') fitCamera();
    // just went full screen and nobody has moved the camera yet: re-frame for the new shape
    if (S.ctl === 'orbit' && controls && !S.touched) {
      aimFor(S.picked);
      const p = poseOf(S.camT);
      if (S.fly) { S.fly.p1 = p.pos; S.fly.t1 = p.target; }
      else flyTo(p, 0.5);
    }
    wake(1500);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  // render on demand: only while something is moving (pick transition, drag, resize)
  let raf = 0, alive = true, last = performance.now(), dragging = false;
  const perf = { frames: 0, ms: 0 };
  const frame = (now: any) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    // entering / leaving full screen: catch the new size even if the observer lags a frame
    if (stage.clientWidth !== sizedW || stage.clientHeight !== sizedH) resize();
    // keep going until the transition has actually landed, so slow GPUs never freeze mid-move
    if (now > S.awakeUntil && !dragging && !S.fly && !(S.ctl === 'walk' && walking()) && settled()) { labelsTick(true); return; }
    const t0 = performance.now();
    step(dt);
    renderFrame();
    if (!R.started) setTimeout(startRealism, 0);
    if (dt < 0.25) adapt(now, dt * 1000);
    labelsTick(!dragging && !S.fly);
    perf.frames++; perf.ms += performance.now() - t0;
  };
  raf = requestAnimationFrame(frame);

  let lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', (e: any) => {
    if (S.ctl === 'orbit') return; // OrbitControls has it
    if (S.ctl === 'walk' && e.pointerType === 'mouse' && !W.noLock && canvas.requestPointerLock && document.pointerLockElement !== canvas) {
      try { const r: any = canvas.requestPointerLock(); r?.catch?.(() => { W.noLock = true; }); } catch { W.noLock = true; /* drag-look still works */ }
    }
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer lock owns the mouse */ }
  });
  canvas.addEventListener('pointermove', (e: any) => {
    if (!dragging) return;
    if (S.ctl === 'walk') { if (document.pointerLockElement !== canvas) look(e.clientX - lastX, e.clientY - lastY); }
    else if (S.ctl === 'auto') S.drag = Math.max(-1.2, Math.min(1.2, S.drag + (e.clientX - lastX) * 0.006));
    lastX = e.clientX; lastY = e.clientY;
  });
  const up = () => { if (dragging) { dragging = false; wake(800); } };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  const dbl = (e: MouseEvent) => {
    if (S.ctl === 'walk') return;
    const id = unitAt(e.clientX, e.clientY);
    if (!id) return;
    if (opts.onFocus) opts.onFocus(id); else pick(id);
  };
  canvas.addEventListener('dblclick', dbl);

  const api: NestedStays = {
    pick,
    setTheme,
    setViewMode,
    setControl,
    resetView,
    setMove(key: string, on: boolean) {
      if (on) W.pad.add(key); else W.pad.delete(key);
      wake(300);
    },
    // analog joystick on touch: x right, y forward, each -1..1
    setJoy(x: number, y: number) {
      W.joy.x = x; W.joy.y = y;
      wake(300);
    },
    state() {
      // projected bounds of the framed subject, in stage CSS px (for layout QA: nothing may cover it)
      let subject = null;
      if (S.fitBox && S.ctl !== 'walk') {
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
        camera.updateMatrixWorld();
        for (const b of S.fitBox) for (const x of [b[0], b[1]]) for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) {
          fitTmp.set(x, y, z).project(camera);
          x0 = Math.min(x0, fitTmp.x); x1 = Math.max(x1, fitTmp.x); y0 = Math.min(y0, fitTmp.y); y1 = Math.max(y1, fitTmp.y);
        }
        const W = stage.clientWidth, H = stage.clientHeight;
        subject = { x: Math.round(((x0 + 1) / 2) * W), y: Math.round(((1 - y1) / 2) * H), w: Math.round(((x1 - x0) / 2) * W), h: Math.round(((y1 - y0) / 2) * H) };
      }
      return { flying: !!S.fly, labels: S.labelLog, subject, view: S.view, ctl: S.ctl, picked: S.picked, lift: +S.lift.toFixed(3), mainOpen: +S.mainOpen.toFixed(3), xr: +S.xr.toFixed(3), cam: camera.position.toArray().map((v: number) => +v.toFixed(2)), eye: S.ctl === 'walk' ? +(camera.position.y - W.feet.y).toFixed(2) : null, feetY: S.ctl === 'walk' ? +W.feet.y.toFixed(2) : null };
    },
    // jump straight to the end state (reduced motion / screenshots)
    settle(frames = 1) {
      if (S.fly) S.fly.k = 1;
      for (let i = 0; i < 400; i++) step(0.05);
      for (let i = 0; i < frames; i++) renderFrame();
      labelSig = sigNow(); needPlace = false;
      updateOcclusion();
      placeLabels();
    },
    stats() {
      const i = renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, avgFrameMs: perf.frames ? +(perf.ms / perf.frames).toFixed(2) : null, frames: perf.frames, dpr: renderer.getPixelRatio(), dprCap: Q.dprCap, shadow: Q.shadow, adaptSteps: Q.steps, phone: phone ? 1 : 0, env: R.env ? 1 : 0, exterior: R.exterior ? 1 : 0, interior: R.interior ? 1 : 0, furniture: R.furniture, assetErrors: R.errors, toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, envIntensity: scene.environmentIntensity, lights: roomLights.length };
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      document.removeEventListener('mousemove', lockMove);
      canvas.removeEventListener('dblclick', dbl);
      if (document.pointerLockElement === canvas) { ownUnlock = true; document.exitPointerLock?.(); }
      controls?.dispose();
      scene.traverse((o: any) => { if (o.isMesh || o.isLine) o.geometry.dispose(); });
      for (const m of Object.values(M) as any[]) m.dispose?.();
      for (const m of fadeCache.values()) m.dispose();
      for (const r of roomMeshes) r.mat.dispose();
      ceilMat.dispose();
      roomEnvTex.dispose();
      assets.dispose();
      for (const t of Object.values(TEX) as any[]) t.dispose();
      composer.dispose?.();
      rt.dispose();
      renderer.dispose();
      maskRT?.dispose(); roomRT?.dispose(); maskFree.dispose(); maskBody.dispose(); for (const m of idMats) m.dispose();
      labelLayer.remove();
      if (ownCanvas) canvas.remove();
    },
  };
  // read-only view state for tests and debugging (camera mode, view mode, eye height while walking)
  Object.defineProperty(canvas, 'nsState', { value: () => api.state(), configurable: true });
  Object.defineProperty(canvas, 'nsStats', { value: () => api.stats(), configurable: true });
  // QA only (?qa=1): put the walk camera at a measured pose for photo/render side-by-sides (REALISM-QA.md)
  if (typeof location !== 'undefined' && /[?&]qa=1\b/.test(location.search)) {
    Object.defineProperty(canvas, 'nsQa', {
      configurable: true,
      value: {
        pose(x: number, level: string, z: number, yawDeg: number, pitchDeg: number, fov = 70, eye = EYE) {
          if (S.ctl !== 'walk') setControl('walk');
          for (let i = 0; i < 400; i++) step(0.05); // let lifts and openings land first
          const gp = new THREE.Vector3(); levelGroup[level].getWorldPosition(gp);
          const feetY = gp.y + LEVELS[level].floor;
          W.feet.set(x, feetY, z); mainRoof.visible = !(x > HOUSE.x1 + 0.05); W.eyeY = feetY + eye; W.yaw = (yawDeg * Math.PI) / 180; W.pitch = (pitchDeg * Math.PI) / 180;
          camera.fov = fov; camera.updateProjectionMatrix();
          placeWalkCamera(); camera.updateMatrixWorld(); updatePools(true); renderFrame(); wake(300);
        },
        orbit(azDeg: number) { S.drag = 0; S.cam.az = S.camT.az = (azDeg * Math.PI) / 180; for (let i = 0; i < 400; i++) step(0.05); renderFrame(); },
        render: () => renderFrame(),
        clash: () => runClash(PARTS as any, ITEMS, WALLS, [...ROOMS, { id: 'cottage-patio', level: 'cottage', rects: [[COT.hx + 0.4, COT.hx + 2.4, -2.3, 2.3]], outdoor: true, padTop: GRADE + 0.04 }] as any, LEVELS, FLOOR_TOP),
        dbg(what: string, on: boolean) {
          if (what === 'shadow') key.castShadow = on;
          if (what === 'ao') gtao.enabled = on;
          if (what === 'key') key.visible = on;
          if (what === 'fill') fill.visible = on;
          if (what === 'ceil') for (const c of ceilings) c.visible = on;
          if (what === 'hi') for (const r of Object.values(wallRefs) as any[]) for (const m of r.upper) m.visible = on;
          if (what === 'roof') { mainRoof.visible = on; cottageRoof.visible = on; }
          renderer.shadowMap.needsUpdate = true; renderFrame();
        },
        // positive control for the z-fight probe: a red quad 0.1mm over the ground (toggle)
        zcontrol(on: boolean) {
          let q = scene.getObjectByName('zcontrol');
          if (on && !q) {
            const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
            g.rotation.x = -Math.PI / 2; g.position.set(0, -0.0049, -3); g.name = 'zcontrol'; scene.add(g);
            const h = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x0000ff }));
            h.rotation.x = -Math.PI / 2; h.position.set(0, -0.005, -3); g.add(h); h.position.set(0, 0, -0.0001); h.rotation.set(0, 0, 0);
          } else if (!on && q) scene.remove(q);
          renderFrame();
        },
        cam(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
          if (S.ctl !== 'orbit') setControl('orbit');
          S.fly = null;
          for (let i = 0; i < 400; i++) step(0.05);
          camera.position.set(x, y, z);
          if (controls) { controls.target.set(tx, ty, tz); controls.update(); } else camera.lookAt(tx, ty, tz);
          camera.updateMatrixWorld(); renderFrame();
        },
        // z-fighting probe: render the same view with two near planes. Depth precision changes between them, so only
        // coplanar (z-fighting) surfaces change colour; returns the share of pixels that differ by more than 24/255.
        zfight(w = 480, h = 300) {
          const rtz = new THREE.WebGLRenderTarget(w, h, { samples: 0 });
          const a = new Uint8Array(w * h * 4), b = new Uint8Array(w * h * 4);
          const near = camera.near, prevRT = renderer.getRenderTarget();
          renderer.setRenderTarget(rtz);
          camera.near = near; camera.updateProjectionMatrix(); renderer.render(scene, camera); renderer.readRenderTargetPixels(rtz, 0, 0, w, h, a);
          camera.near = near * 0.6; camera.updateProjectionMatrix(); renderer.render(scene, camera); renderer.readRenderTargetPixels(rtz, 0, 0, w, h, b);
          camera.near = near; camera.updateProjectionMatrix(); renderer.setRenderTarget(prevRT); rtz.dispose();
          let diff = 0, lit = 0; const mask: number[] = [];
          for (let i = 0; i < w * h; i++) {
            if (a[i * 4 + 3] < 10 && b[i * 4 + 3] < 10) continue;
            lit++;
            const d = Math.max(Math.abs(a[i * 4] - b[i * 4]), Math.abs(a[i * 4 + 1] - b[i * 4 + 1]), Math.abs(a[i * 4 + 2] - b[i * 4 + 2]));
            if (d > 24) { diff++; if (mask.length < 4000) mask.push(i); }
          }
          return { share: lit ? +(diff / lit * 100).toFixed(3) : 0, px: diff, lit, sample: mask.slice(0, 50) };
        },
        walk() { setControl('walk'); for (let i = 0; i < 40; i++) step(0.05); renderFrame(); },
        ctl: (m: string) => setControl(m),
        breakdown() {
          let vis = 0, cast = 0, glb = 0, transparent = 0;
          scene.traverse((o: any) => {
            if (!o.isMesh && !o.isLine) return;
            let v = true; for (let q = o; q; q = q.parent) if (!q.visible) { v = false; break; }
            if (!v) return;
            vis++; if (o.castShadow) cast++; if (o.userData.furn && !o.geometry.attributes.uv2 && o.parent?.parent?.isGroup && !o.parent.isScene) glb++;
            if ((Array.isArray(o.material) ? o.material : [o.material]).some((m: any) => m.transparent)) transparent++;
          });
          renderer.info.reset(); renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); const one = renderer.info.render.calls;
          renderFrame(); const all = renderer.info.render.calls;
          renderFrame(); const steady = renderer.info.render.calls;
          return { vis, cast, transparent, mainPassCalls: one, frameCalls: all, steadyFrameCalls: steady };
        },
        rooms: () => ROOMS.map((r: any) => { const o = r.level === 'cottage' ? COTTAGE_AT : { x: 0, z: 0 }; return { id: r.id, unit: r.unit, level: r.level, floor: LEVELS[r.level].floor, rects: r.rects.map(([x0, x1, z0, z1]: any) => [x0 + o.x, x1 + o.x, z0 + o.z, z1 + o.z]) }; }),
        memory() {
          let tex = 0;
          const seen = new Set<any>();
          scene.traverse((o: any) => {
            if (!o.isMesh) return;
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap', 'emissiveMap']) {
              const t = m?.[k]; const img = t?.source?.data; if (!t || !img || seen.has(t.source)) continue; seen.add(t.source);
              const w = img.width || img.data?.width || 0, h = img.height || img.data?.height || 0;
              tex += w * h * 4 * 1.33;
            }
          });
          let geo = 0;
          scene.traverse((o: any) => { if ((o.isMesh || o.isLine) && o.geometry) for (const a of Object.values(o.geometry.attributes) as any[]) geo += a.array.byteLength; });
          return { texMB: +(tex / 1048576).toFixed(1), geoMB: +(geo / 1048576).toFixed(1), info: renderer.info.memory };
        },
      },
    });
  }
  return api;
}
