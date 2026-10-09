// Procedural textures generated on a canvas at load: no downloads, no licences to track.
// Greyscale where possible so one texture serves several colours via material.color.
import * as THREE from 'three';

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, n: number) => void, { srgb = true } = {}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function noise(g: CanvasRenderingContext2D, n: number, base: string, amp: number, seed: number): void {
  const rr = rnd(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, n, n);
  const img = g.getImageData(0, 0, n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (rr() - 0.5) * amp;
    img.data[i] += d; img.data[i + 1] += d; img.data[i + 2] += d;
  }
  g.putImageData(img, 0, 0);
}

// world metres covered by one repeat of each texture
// metres per UV unit; equal to the CC0 tile sizes in realism.ts (SETS) so the PBR maps repeat once per unit
export const TEX_SIZE: any = { oak: 1.7, carpet: 1.2, concrete: 2, tile: 1.8, deck: 1.8, stain: 2, lvp: 1.7, cork: 1.7, lawn: 2, siding: 1.57, shingle: 4, brick: 1, plaster: 1.6, wood: 1, fabric: 0.27 };

export function buildTextures(): any {
  const r = rnd(7);
  const T: any = {};
  T.oak = canvasTex(512, (g: any, n: any) => {
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      let x = -r() * n;
      while (x < n) {
        const len = n * (0.45 + r() * 0.6);
        g.fillStyle = `hsl(32, 38%, ${78 + r() * 7}%)`;
        g.fillRect(x, (i * n) / rows, len, n / rows);
        for (let k = 0; k < 6; k++) {
          g.strokeStyle = `rgba(150,110,70,${0.05 + r() * 0.05})`;
          g.beginPath();
          const y = (i * n) / rows + r() * (n / rows);
          g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + 2, x + len * 0.6, y - 2, x + len, y); g.stroke();
        }
        g.fillStyle = 'rgba(120,90,60,0.25)';
        g.fillRect(x, (i * n) / rows, 1.5, n / rows);
        x += len;
      }
      g.fillStyle = 'rgba(120,90,60,0.22)';
      g.fillRect(0, (i * n) / rows, n, 1.5);
    }
  });
  // area rug: soft grey field, cream lattice, charcoal border (the living-room rug in the listing photos)
  // area rug (whole-rug image, one per rug): charcoal field with a cream medallion, quarter medallions in the corners,
  // scrolling vines and a banded border, worn a little, after the grey patterned rug in the living-room photos
  T.rug = canvasTex(1024, (g: any, n: any) => {
    noise(g, n, '#6c6b69', 14, 41);
    const rr = rnd(77), C = 'rgba(232,226,212,', D = 'rgba(42,43,47,';
    const rosette = (cx: number, cy: number, R: number, petals: number, a: number) => {
      for (let ring = 0; ring < 4; ring++) {
        const r = R * (1 - ring * 0.22);
        g.fillStyle = ring % 2 ? D + '0.85)' : C + (0.92 - ring * 0.08) + ')';
        g.beginPath();
        for (let k = 0; k <= petals * 16; k++) {
          const t = (k / (petals * 16)) * Math.PI * 2, rad = r * (0.78 + 0.22 * Math.abs(Math.cos((t * petals) / 2 + a)));
          const x = cx + Math.cos(t) * rad, y = cy + Math.sin(t) * rad * 0.82;
          k ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.fill();
      }
    };
    // vines
    g.lineCap = 'round';
    for (let k = 0; k < 520; k++) {
      let x = rr() * n, y = rr() * n, ang = rr() * 7;
      g.strokeStyle = C + (0.35 + rr() * 0.45) + ')'; g.lineWidth = n / 300 + rr() * n / 260;
      g.beginPath(); g.moveTo(x, y);
      for (let st = 0; st < 8; st++) { ang += (rr() - 0.5) * 1.4; x += Math.cos(ang) * n / 110; y += Math.sin(ang) * n / 110; g.lineTo(x, y); }
      g.stroke();
      g.fillStyle = C + '0.7)'; g.beginPath(); g.ellipse(x, y, n / 160, n / 260, ang, 0, 7); g.fill();
    }
    // medallions
    rosette(n / 2, n / 2, n * 0.13, 8, 0);
    rosette(n / 2, n / 2, n * 0.06, 6, 0.4);
    for (const [cx, cy] of [[0, 0], [n, 0], [0, n], [n, n]]) rosette(cx, cy, n * 0.11, 8, 0.2);
    // a dense field of small motifs, as in the photo's busy grey rug
    for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) if ((i + j) % 2 === 0 && Math.hypot(i - 4, j - 4) > 1.3) rosette((i * n) / 8, (j * n) / 8, n * 0.035, 5, i * 0.3);
    // border bands
    g.lineWidth = n / 26; g.strokeStyle = D + '0.95)'; g.strokeRect(n / 52, n / 52, n - n / 26, n - n / 26);
    g.lineWidth = n / 110; g.strokeStyle = C + '0.9)'; g.strokeRect(n / 20, n / 20, n - n / 10, n - n / 10);
    g.setLineDash([n / 60, n / 90]); g.lineWidth = n / 140; g.strokeRect(n / 54, n / 54, n - n / 27, n - n / 27); g.setLineDash([]);
    // wear: low-contrast mottling
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${rr() > 0.5 ? '255,250,240' : '20,20,24'},${rr() * 0.06})`; g.fillRect(rr() * n, rr() * n, n / 40, n / 90); }
  });
  T.carpet = canvasTex(256, (g: any, n: any) => noise(g, n, '#cfcac2', 22, 3));
  T.concrete = canvasTex(256, (g: any, n: any) => {
    noise(g, n, '#d9d6d0', 14, 5);
    const rr = rnd(9);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(120,115,105,${rr() * 0.05})`; g.beginPath(); g.arc(rr() * n, rr() * n, 6 + rr() * 30, 0, 7); g.fill(); }
  });
  T.tile = canvasTex(256, (g: any, n: any) => {
    g.fillStyle = '#ebe8e2'; g.fillRect(0, 0, n, n);
    g.strokeStyle = 'rgba(150,145,135,0.55)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(0, (i * n) / 4); g.lineTo(n, (i * n) / 4); g.stroke();
      g.beginPath(); g.moveTo((i * n) / 4, 0); g.lineTo((i * n) / 4, n); g.stroke();
    }
  });
  T.deck = canvasTex(256, (g: any, n: any) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `hsl(30, 16%, ${74 + r() * 6}%)`;
      g.fillRect(0, (i * n) / 8, n, n / 8 - 3);
      g.fillStyle = 'rgba(80,60,40,0.35)';
      g.fillRect(0, (i * n) / 8 + n / 8 - 3, n, 3);
    }
  });
  T.stain = canvasTex(256, (g: any, n: any) => {
    noise(g, n, '#dcd6cd', 14, 11);
    const rr = rnd(12);
    for (let k = 0; k < 50; k++) { g.fillStyle = `rgba(130,115,100,${rr() * 0.06})`; g.beginPath(); g.arc(rr() * n, rr() * n, 8 + rr() * 34, 0, 7); g.fill(); }
  });
  T.lvp = canvasTex(256, (g: any, n: any) => {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `hsl(36, 18%, ${86 + r() * 4}%)`;
      g.fillRect(0, (i * n) / 6, n, n / 6);
      g.fillStyle = 'rgba(120,110,95,0.18)';
      g.fillRect(0, (i * n) / 6, n, 1.5);
    }
  });
  T.cork = canvasTex(256, (g: any, n: any) => noise(g, n, '#d6b98f', 30, 21));
  T.lawn = canvasTex(512, (g: any, n: any) => noise(g, n, '#f2f1ea', 7, 31));
  // lap siding, 1 m tall tile: 6 courses (~165 mm exposure), soft shadow under each lap
  T.siding = canvasTex(256, (g: any, n: any) => {
    const courses = 6, h = n / courses;
    for (let i = 0; i < courses; i++) {
      const y = i * h;
      const grad = g.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.82, '#f1f1f1');
      grad.addColorStop(0.9, '#cfcfcf');
      grad.addColorStop(1, '#bdbdbd');
      g.fillStyle = grad;
      g.fillRect(0, y, n, h);
    }
  });
  // asphalt shingles, 1 m tile: 7 courses, staggered tabs, slight tone variation
  T.shingle = canvasTex(256, (g: any, n: any) => {
    const courses = 7, h = n / courses, tabs = 3;
    const rr = rnd(41);
    for (let i = 0; i < courses; i++) {
      const off = (i % 2) * (n / tabs / 2);
      for (let k = -1; k <= tabs; k++) {
        const l = 76 + rr() * 12;
        g.fillStyle = `rgb(${l * 2.4},${l * 2.4},${l * 2.4})`;
        g.fillRect(k * (n / tabs) + off, i * h, n / tabs - 2, h - 2);
      }
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(0, i * h + h - 3, n, 3);
    }
    const img = g.getImageData(0, 0, n, n);
    for (let i = 0; i < img.data.length; i += 4) { const d = (rr() - 0.5) * 16; img.data[i] += d; img.data[i + 1] += d; img.data[i + 2] += d; }
    g.putImageData(img, 0, 0);
  });
  // running-bond brick, 0.9 m tile: 12 courses
  T.brick = canvasTex(256, (g: any, n: any) => {
    const rows = 12, h = n / rows, per = 4;
    const rr = rnd(53);
    g.fillStyle = '#d9d2c8'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < rows; i++) {
      const off = (i % 2) * (n / per / 2);
      for (let k = -1; k <= per; k++) {
        const l = rr();
        g.fillStyle = `hsl(${12 + l * 10}, ${34 + l * 12}%, ${40 + l * 12}%)`;
        g.fillRect(k * (n / per) + off + 1.5, i * h + 1.5, n / per - 3, h - 3);
      }
    }
  });
  return T;
}
