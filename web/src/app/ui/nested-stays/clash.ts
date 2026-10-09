// Interpenetration / placement QA for the 3D interiors (2026-10-08). Pure geometry on oriented boxes (OBBs):
//  - part vs part of different pieces: penetration > 2 mm fails (rugs under furniture are the allowed contact)
//  - part vs wall solids (openings cut out), vs floor (sinking) and vs ceiling
//  - every floor-standing piece rests on the floor (or on another piece) within 2 mm; nothing floats or sinks
//  - pieces sit inside their room; no piece in a door's clearance zone; the doors of a level stay connected by a
//    walkable path (0.5 m wide body) on a 5 cm grid
// Wall-hung pieces (TV, wall cabinets) skip the floor check.
import * as THREE from 'three';

export interface Part { item: number; kind: string; tag: string; level: string; c: THREE.Vector3; h: THREE.Vector3; rot: number }
interface Box { c: THREE.Vector3; h: THREE.Vector3; ax: THREE.Vector3[] }
const HANG = new Set(['tv', 'uppers', 'shelves', 'ceil', 'art', 'coffer', 'otr']); // wall-hung: no floor contact expected
const TOL = 0.002;

const obb = (c: THREE.Vector3, h: THREE.Vector3, rot: number): Box => {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return { c, h, ax: [new THREE.Vector3(cs, 0, -sn), new THREE.Vector3(0, 1, 0), new THREE.Vector3(sn, 0, cs)] };
};
// SAT penetration depth (min overlap over the 15 axes); <= 0 means separated
let lastN = new THREE.Vector3();
function pen(a: Box, b: Box): number {
  const axes: THREE.Vector3[] = [...a.ax, ...b.ax];
  for (const u of a.ax) for (const v of b.ax) { const c = new THREE.Vector3().crossVectors(u, v); if (c.lengthSq() > 1e-8) axes.push(c.normalize()); }
  const d = new THREE.Vector3().subVectors(b.c, a.c);
  let best = Infinity;
  for (const n of axes) {
    const ra = a.h.x * Math.abs(a.ax[0].dot(n)) + a.h.y * Math.abs(a.ax[1].dot(n)) + a.h.z * Math.abs(a.ax[2].dot(n));
    const rb = b.h.x * Math.abs(b.ax[0].dot(n)) + b.h.y * Math.abs(b.ax[1].dot(n)) + b.h.z * Math.abs(b.ax[2].dot(n));
    const o = ra + rb - Math.abs(d.dot(n));
    if (o <= 0) return o;
    if (o < best) { best = o; lastN = n.clone().multiplyScalar(Math.sign(d.dot(n)) || 1); }
  }
  return best;
}
const corners = (b: Box) => {
  const out: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    out.push(b.c.clone().addScaledVector(b.ax[0], sx * b.h.x).addScaledVector(b.ax[1], sy * b.h.y).addScaledVector(b.ax[2], sz * b.h.z));
  return out;
};

export function runClash(parts: Part[], items: any[], WALLS: any, ROOMS: any[], LEVELS: any, floorTop: number) {
  const hits: any[] = [];
  const name = (i: number) => { const it = items[i]; return `${it.kind}:${it.matKey}@${it.level}(${it.x},${it.z})`; };
  const boxes = parts.map((p) => ({ p, b: obb(p.c, p.h, p.rot) }));
  // walls -> solid boxes (level-local), openings removed; plus door / opening clearance zones
  const walls: { lv: string; b: Box; w: any }[] = [], doors: { lv: string; b: Box; w: any; o: any; inPts: THREE.Vector3[] }[] = [];
  for (const lv of Object.keys(WALLS)) {
    const L = LEVELS[lv];
    for (const w of WALLS[lv]) {
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (len < 1e-3) continue;
      const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len, rot = Math.atan2(-uz, ux);
      const at = (u: number, v0: number, v1: number, u1: number) => walls.push({ lv, w, b: obb(new THREE.Vector3(w.a[0] + ux * (u + u1) / 2, L.floor + (v0 + v1) / 2, w.a[1] + uz * (u + u1) / 2), new THREE.Vector3((u1 - u) / 2, (v1 - v0) / 2, w.t / 2), rot) });
      const os = [...(w.o || [])].sort((p: any, q: any) => p.at - q.at);
      let u = 0;
      for (const o of os) {
        const o0 = o.at - o.w / 2, o1 = o.at + o.w / 2;
        if (o0 > u) at(u, 0, L.height, o0);
        if (o.sill > 0) at(o0, 0, o.sill, o1);
        if (o.head < L.height) at(o0, o.head, L.height, o1);
        u = o1;
        // passages only: doors and floor-level openings (a pass-through with a counter-height sill is not walked through)
        if (o.kind === 'door' || (o.kind === 'open' && !(o.sill > 0.3))) {
          const cx = w.a[0] + ux * o.at, cz = w.a[1] + uz * o.at;
          // 0.6 m deep clearance each side of the wall, door width, floor to head
          const b = obb(new THREE.Vector3(cx, L.floor + floorTop + 0.05 + (o.head - 0.1) / 2, cz), new THREE.Vector3(o.w / 2 - 0.02, (o.head - 0.1) / 2, w.t / 2 + 0.6), rot);
          const nx = -uz, nz = ux;
          doors.push({ lv, b, w, o, inPts: [1, -1].map((sd) => new THREE.Vector3(cx + nx * sd * (w.t / 2 + 0.45), L.floor, cz + nz * sd * (w.t / 2 + 0.45))) });
        }
      }
      if (u < len) at(u, 0, L.height, len);
    }
  }
  // 1. part vs part (different pieces)
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    if (A.p.item === B.p.item || A.p.level !== B.p.level) continue;
    if (A.p.c.distanceTo(B.p.c) > A.p.h.length() + B.p.h.length()) continue;
    const rugPair = A.p.tag === 'rug' || B.p.tag === 'rug';
    const d = pen(A.b, B.b);
    if (rugPair) {
      // allowed contact: a piece standing on the floor over a rug (feet press into the pile). Two rugs may overlap.
      if (A.p.tag === 'rug' && B.p.tag === 'rug') continue;
      const other = A.p.tag === 'rug' ? B : A;
      if (other.p.c.y - other.p.h.y <= floorTop + LEVELS[other.p.level].floor + TOL + 0.03) continue;
    }
    if (d > TOL) hits.push({ type: 'parts', item: A.p.item, item2: B.p.item, push: [+(-lastN.x * d).toFixed(3), +(-lastN.y * d).toFixed(3), +(-lastN.z * d).toFixed(3)], depth: +d.toFixed(4), a: name(A.p.item) + ' ' + A.p.tag, b: name(B.p.item) + ' ' + B.p.tag, at: A.p.c.toArray().map((v) => +v.toFixed(2)) });
  }
  // 2. part vs walls
  for (const A of boxes) for (const W of walls) {
    if (W.lv !== A.p.level) continue;
    if (A.p.c.distanceTo(W.b.c) > A.p.h.length() + W.b.h.length()) continue;
    const d = pen(A.b, W.b);
    if (d > TOL) hits.push({ type: 'wall', item: A.p.item, depth: +d.toFixed(4), push: [+(-lastN.x * (d + 0.001)).toFixed(3), +(-lastN.y * (d + 0.001)).toFixed(3), +(-lastN.z * (d + 0.001)).toFixed(3)], a: name(A.p.item) + ' ' + A.p.tag, b: `wall ${W.w.a}->${W.w.b}`, at: A.p.c.toArray().map((v) => +v.toFixed(2)) });
  }
  // 3. floor / ceiling / rest + room containment + door zones
  const byItem = new Map<number, typeof boxes>();
  for (const B of boxes) { if (!byItem.has(B.p.item)) byItem.set(B.p.item, []); byItem.get(B.p.item)!.push(B); }
  for (const [it, bs] of byItem) {
    const I = items[it], L = LEVELS[I.level];
    const cs = bs.flatMap((B) => corners(B.b));
    const minY = Math.min(...cs.map((v) => v.y)), maxY = Math.max(...cs.map((v) => v.y));
    const room = ROOMS.find((r: any) => r.level === I.level && r.rects.some(([x0, x1, z0, z1]: any) => I.x > x0 && I.x < x1 && I.z > z0 && I.z < z1));
    const fl = room?.padTop != null ? room.padTop : L.floor + floorTop + (room?.outdoor ? -0.2 : 0);
    if (!HANG.has(I.kind)) {
      if (minY < fl - TOL) hits.push({ type: 'floor-sink', depth: +(fl - minY).toFixed(4), a: name(it) });
      else if (minY > fl + TOL) {
        // resting on another piece?
        const on = boxes.some((B) => B.p.item !== it && B.p.level === I.level && Math.abs(B.p.c.y + B.p.h.y - minY) <= TOL);
        if (!on) hits.push({ type: 'float', depth: +(minY - fl).toFixed(4), a: name(it) });
      }
    }
    if (!room) { hits.push({ type: 'room', a: name(it), b: 'centre not in any room' }); continue; }
    if (!room.outdoor && !['ceil', 'coffer'].includes(I.kind) && maxY > L.floor + L.height - 0.02 + TOL && room.id !== 'studio-room') hits.push({ type: 'ceiling', depth: +(maxY - (L.floor + L.height - 0.02)).toFixed(4), a: name(it) });
    for (const v of cs) {
      const inside = room.rects.some(([x0, x1, z0, z1]: any) => v.x >= x0 - TOL && v.x <= x1 + TOL && v.z >= z0 - TOL && v.z <= z1 + TOL);
      if (!inside) { hits.push({ type: 'room', a: name(it), b: `corner (${v.x.toFixed(2)},${v.z.toFixed(2)}) outside ${room.id}` }); break; }
    }
  }
  for (const D of doors) for (const A of boxes) {
    if (A.p.level !== D.lv || A.p.tag === 'rug' || HANG.has(A.p.kind)) continue;
    if (A.p.c.distanceTo(D.b.c) > A.p.h.length() + D.b.h.length()) continue;
    const d = pen(A.b, D.b);
    if (d > TOL) hits.push({ type: 'door', item: A.p.item, push: [+(-lastN.x * d).toFixed(3), 0, +(-lastN.z * d).toFixed(3)], depth: +d.toFixed(4), a: name(A.p.item) + ' ' + A.p.tag, b: `door at ${D.o.at} on ${D.w.a}->${D.w.b}` });
  }
  // 4. walk paths: grid occupancy per level (parts reaching below 1.2 m, walls below the door head), body radius 0.25 m
  const paths: any[] = [];
  for (const lv of Object.keys(WALLS)) {
    const L = LEVELS[lv], rooms = ROOMS.filter((r: any) => r.level === lv && !r.outdoor);
    if (!rooms.length) continue;
    const xs = rooms.flatMap((r: any) => r.rects.flatMap((q: number[]) => [q[0], q[1]])), zs = rooms.flatMap((r: any) => r.rects.flatMap((q: number[]) => [q[2], q[3]]));
    const G = 0.05, X0 = Math.min(...xs) - 1, Z0 = Math.min(...zs) - 1, NX = Math.ceil((Math.max(...xs) + 1 - X0) / G), NZ = Math.ceil((Math.max(...zs) + 1 - Z0) / G);
    const occ = new Uint8Array(NX * NZ);
    const inRoom = (x: number, z: number) => rooms.some((r: any) => r.rects.some(([x0, x1, z0, z1]: any) => x > x0 && x < x1 && z > z0 && z < z1));
    const obstN: { b: Box; n: string }[] = [...boxes.filter((B) => B.p.level === lv && B.p.tag !== 'rug' && B.p.c.y - B.p.h.y < L.floor + 1.2 && B.p.c.y + B.p.h.y > L.floor + 0.06).map((B) => ({ b: B.b, n: name(B.p.item) + ' ' + B.p.tag })), ...walls.filter((W) => W.lv === lv && W.b.c.y - W.b.h.y < L.floor + 1.2).map((W) => ({ b: W.b, n: 'wall' }))];
    const obst: Box[] = obstN.map((o) => o.b);
    const near = (q: THREE.Vector3) => obstN.filter(({ b }) => { const dx = q.x - b.c.x, dz = q.z - b.c.z; const lx = Math.abs(dx * b.ax[0].x + dz * b.ax[0].z) - b.h.x, lz = Math.abs(dx * b.ax[2].x + dz * b.ax[2].z) - b.h.z; return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) < R; }).map((o) => o.n).join(', ');
    const R = 0.25;
    for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) {
      const x = X0 + (i + 0.5) * G, z = Z0 + (k + 0.5) * G;
      if (!inRoom(x, z)) { // door openings sit on wall lines (outside the rects): keep them walkable
        if (!doors.some((D) => D.lv === lv && Math.abs(new THREE.Vector3(x - D.b.c.x, 0, z - D.b.c.z).dot(D.b.ax[0])) < D.b.h.x && Math.abs(new THREE.Vector3(x - D.b.c.x, 0, z - D.b.c.z).dot(D.b.ax[2])) < D.w.t / 2 + 0.05)) { occ[i * NZ + k] = 1; continue; }
      }
      for (const b of obst) {
        const dx = x - b.c.x, dz = z - b.c.z;
        const lx = Math.abs(dx * b.ax[0].x + dz * b.ax[0].z) - b.h.x, lz = Math.abs(dx * b.ax[2].x + dz * b.ax[2].z) - b.h.z;
        if (Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) < R) { occ[i * NZ + k] = 1; break; }
      }
    }
    const pts = doors.filter((D) => D.lv === lv).flatMap((D) => D.inPts.filter((q) => inRoom(q.x, q.z)).map((q) => ({ q, D })));
    const cell = (q: THREE.Vector3) => Math.round((q.x - X0) / G - 0.5) * NZ + Math.round((q.z - Z0) / G - 0.5);
    const comp = new Int32Array(NX * NZ).fill(-1); let nc = 0;
    for (const { q } of pts) {
      const s0 = cell(q); if (occ[s0] || comp[s0] >= 0) continue;
      const st = [s0]; comp[s0] = nc;
      while (st.length) { const c = st.pop()!; const i = (c / NZ) | 0, k = c % NZ;
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= NX || kk >= NZ) continue; const n = ii * NZ + kk; if (!occ[n] && comp[n] < 0) { comp[n] = nc; st.push(n); } } }
      nc++;
    }
    const sizes = new Map<number, number>(); for (const { q } of pts) { const c = comp[cell(q)]; sizes.set(c, (sizes.get(c) || 0) + 1); }
    // a walkable component is fine when it reaches an exterior door (separate units such as the studio have their own entry)
    // ... or when it is the level's main component (the basement is entered by the stairs)
    const ext = new Set(pts.filter(({ D }) => D.w.bld).map(({ q }) => comp[cell(q)]).filter((c) => c >= 0));
    const big = [...sizes.entries()].filter(([c]) => c >= 0).sort((a, b) => b[1] - a[1])[0]?.[0]; if (big != null) ext.add(big);
    for (const { q, D } of pts) { const c = comp[cell(q)]; if (c < 0 || !ext.has(c)) hits.push({ type: 'path', a: `door at ${D.o.at} on ${D.w.a}->${D.w.b} (${lv})`, b: c < 0 ? 'approach blocked by ' + near(q) : 'cut off from the rest of the level', at: [+q.x.toFixed(2), +q.z.toFixed(2)] }); }
    paths.push({ lv, doorsChecked: pts.length, components: nc });
  }
  const byType: any = {}; for (const h of hits) byType[h.type] = (byType[h.type] || 0) + 1;
  return { parts: parts.length, items: items.length, walls: walls.length, doors: doors.length, hits: hits.length, byType, paths, list: hits };
}
