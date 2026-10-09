// Photoreal assets for the nested-stays model (RUBRIC v2.2 "3D realism"): CC0 PBR maps (KTX2/Basis), a CC0 HDRI
// (Poly Haven Kloofendal 48d Partly Cloudy, pure sky) through PMREM, and CC0 glTF furniture (Draco + KTX2).
// All fetched lazily from <base>/3d/ after the 3D view starts. Credits: public/3d/CREDITS.md and the Sources panel.
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Real-world size of one texture tile in metres (u, v). Model UVs are world metres / tile (worldUV in geo.ts),
// so a texture repeats once per tile. floor: 9 planks per 1.7 m = 189 mm boards. tile: 6 x 3 per 1.8 x 0.9 m = 300 mm.
// siding: 14 courses per 1.57 m = 112 mm. shingle: 26 courses per 4 m. brick: 215 x 65 mm units on a 1 m tile.
export const SETS: Record<string, { tile: [number, number] }> = {
  floor: { tile: [1.7, 1.7] }, plaster: { tile: [1.6, 1.6] }, weave: { tile: [0.27, 0.28] }, cotton: { tile: [0.26, 0.26] },
  linen: { tile: [0.27, 0.27] }, leather: { tile: [0.4, 0.4] }, walnut: { tile: [1.0, 1.0] }, oakveneer: { tile: [1.0, 1.0] },
  tile: { tile: [1.8, 0.9] }, siding: { tile: [1.57, 1.57] }, shingle: { tile: [4.0, 4.0] }, brick: { tile: [1.0, 1.0] },
  concrete: { tile: [2.0, 2.0] }, grass: { tile: [2.0, 2.0] }, paver: { tile: [2.0, 2.0] }, asphalt: { tile: [2.0, 2.0] },
  deck: { tile: [1.8, 1.8] },
};
export const EXTERIOR_SETS = ['siding', 'shingle', 'brick', 'concrete', 'grass', 'deck'];

export const MODELS: Record<string, { file: string }> = {
  armchair: { file: 'modern_arm_chair_01.glb' },
  ottoman: { file: 'Ottoman_01.glb' },
  coffee: { file: 'WoodenTable_01.glb' },
  pillows: { file: 'throw_pillows_01.glb' },
  plantSmall: { file: 'potted_plant_04.glb' },
  plantLarge: { file: 'potted_plant_02.glb' },
  nightstand: { file: 'ClassicNightstand_01.glb' },
};

export interface PbrSet { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; tile: [number, number] }

export function assetBase(): string {
  return new URL('3d/', typeof document !== 'undefined' ? document.baseURI : '/').href;
}

export function createAssets(renderer: THREE.WebGLRenderer, { phone = false } = {}) {
  const base = assetBase();
  const ktx2 = new KTX2Loader().setTranscoderPath(base + 'basis/').detectSupport(renderer);
  const draco = new DRACOLoader().setDecoderPath(base + 'draco/');
  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setDRACOLoader(draco);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const texs = new Map<string, Promise<THREE.Texture>>();
  const loadTex = (name: string, srgb: boolean) => {
    if (!texs.has(name)) texs.set(name, ktx2.loadAsync(base + 'tex/' + (phone ? 'phone/' : '') + name + '.ktx2').then((t: THREE.Texture) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
      return t;
    }));
    return texs.get(name)!;
  };
  const sets = new Map<string, Promise<PbrSet>>();
  const loadSet = (key: string) => {
    if (!sets.has(key)) sets.set(key, Promise.all([loadTex(key + '_c', true), loadTex(key + '_n', false), loadTex(key + '_r', false)])
      .then(([map, normalMap, roughnessMap]) => ({ map, normalMap, roughnessMap, tile: SETS[key].tile })));
    return sets.get(key)!;
  };
  const models = new Map<string, Promise<THREE.Object3D>>();
  const loadModel = (key: string) => {
    if (!models.has(key)) models.set(key, gltf.loadAsync(base + 'models/' + (phone ? 'phone/' : '') + MODELS[key].file).then((g: any) => g.scene));
    return models.get(key)!;
  };
  // HDRI: 2048x1024 desktop (sky-2k.hdr, 5.4 MB), 1024x512 phone (sky.hdr, 1.4 MB): RUBRIC v2.2 budgets 6 / 1.5 MB.
  let envP: Promise<THREE.Texture> | null = null, envRT: THREE.WebGLRenderTarget | null = null;
  const loadEnv = () => envP || (envP = new RGBELoader().loadAsync(base + (phone ? 'sky.hdr' : 'sky-2k.hdr')).then((hdr: THREE.DataTexture) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    envRT = pm.fromEquirectangular(hdr);
    pm.dispose(); hdr.dispose();
    return envRT.texture;
  }));
  return {
    loadSet, loadModel, loadEnv,
    dispose() {
      ktx2.dispose(); draco.dispose();
      for (const p of texs.values()) p.then((t) => t.dispose()).catch(() => {});
      envRT?.dispose();
    },
  };
}

// Bind a loaded set to a material. UVs are already world metres / tile, so repeat stays 1 (tile v gets its aspect).
// opt.noMap keeps the material colour (fabric tints matched to the photos) and takes relief + roughness only.
export function bind(mat: any, set: PbrSet, opt: { normal?: number; noMap?: boolean; uvTile?: number } = {}) {
  const u = opt.uvTile ? opt.uvTile / set.tile[0] : 1, v = opt.uvTile ? opt.uvTile / set.tile[1] : set.tile[0] / set.tile[1];
  const use = (t: THREE.Texture) => { const c = t.clone(); c.repeat.set(u, v); c.needsUpdate = true; return c; };
  if (!opt.noMap) { mat.map = use(set.map); }
  mat.normalMap = use(set.normalMap);
  const n = opt.normal ?? 1;
  mat.normalScale.set(n, n);
  mat.roughnessMap = use(set.roughnessMap);
  mat.needsUpdate = true;
}
