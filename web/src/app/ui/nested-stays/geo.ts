// Geometry helpers: boxes, world-space UVs, hip roofs, beams, and the wall builder.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}
export function rbox(w: number, h: number, d: number, r = 0.04): THREE.BufferGeometry {
  const rad = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return new RoundedBoxGeometry(w, h, d, 3, Math.max(rad, 0.001)); // 3 segments per fillet (RUBRIC v2.2 "Rounded")
}
// planar world-space UVs (metres / size), axis picked per vertex normal
export function worldUV(g: THREE.BufferGeometry, size: number): THREE.BufferGeometry {
  const p = g.attributes['position'], n = g.attributes['normal'], uv = g.attributes['uv'];
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / size, p.getZ(i) / size);
    else if (ax >= az) uv.setXY(i, p.getZ(i) / size, p.getY(i) / size);
    else uv.setXY(i, p.getX(i) / size, p.getY(i) / size);
  }
  uv.needsUpdate = true;
  return g;
}
export function trisGeo(tris: number[][][]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const t of tris) for (const p of t) pos.push(...p);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}
// UVs that follow each roof plane: u along the eave, v up the slope
export function slopeUV(g: THREE.BufferGeometry, size: number): THREE.BufferGeometry {
  const p = g.attributes['position'], uv = g.attributes['uv'];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), t = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(q.subVectors(c, a)).normalize();
    t.crossVectors(up, n);
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.normalize();
    s.crossVectors(n, t).normalize();
    for (let k = 0; k < 3; k++) {
      q.fromBufferAttribute(p, i + k);
      uv.setXY(i + k, q.dot(t) / size, q.dot(s) / size);
    }
  }
  uv.needsUpdate = true;
  return g;
}
// equal-pitch hip roof, ridge along the long axis; returns geometry + ridge/hip lines
export function hipRoof(x0: number, x1: number, z0: number, z1: number, y: number, pitch: number): { geo: THREE.BufferGeometry; lines: number[][][]; ridgeY: number } {
  const W = (x1 - x0) / 2, Dd = (z1 - z0) / 2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongX = W >= Dd;
  const run = alongX ? Dd : W;
  const ry = y + run * pitch;
  const A = [x0, y, z0], B = [x1, y, z0], C = [x1, y, z1], Dp = [x0, y, z1];
  const R1 = alongX ? [x0 + run, ry, cz] : [cx, ry, z0 + run];
  const R2 = alongX ? [x1 - run, ry, cz] : [cx, ry, z1 - run];
  const tris = alongX
    ? [[Dp, C, R2], [Dp, R2, R1], [B, A, R1], [B, R1, R2], [A, Dp, R1], [C, B, R2]]
    : [[A, R1, B], [Dp, C, R2], [A, Dp, R2], [A, R2, R1], [B, R1, R2], [B, R2, C]];
  const lines = alongX
    ? [[R1, R2], [A, R1], [Dp, R1], [B, R2], [C, R2]]
    : [[R1, R2], [A, R1], [B, R1], [C, R2], [Dp, R2]];
  return { geo: trisGeo(tris), lines, ridgeY: ry };
}
// a box running from p to q (centre line), w wide, h tall
export function beam(p: number[], q: number[], w: number, h: number): THREE.BufferGeometry {
  const P = new THREE.Vector3(...p), Q = new THREE.Vector3(...q);
  const len = P.distanceTo(Q);
  const g = new THREE.BoxGeometry(w, h, len);
  const m = new THREE.Matrix4().lookAt(P, Q, new THREE.Vector3(0, 1, 0));
  g.applyMatrix4(m);
  g.translate((P.x + Q.x) / 2, (P.y + Q.y) / 2, (P.z + Q.z) / 2);
  return g;
}

/**
 * Build one level's walls, split at the cut height C into lower (always shown) and
 * upper (fades when the level opens). Exterior walls get a siding skin on the outer
 * face, trim casings around openings, sashes with panes, and door leaves.
 * opts.outOf(wall) -> +1/-1 outward side; opts.hidden(wall) -> [u0,u1] ranges where
 * the outer face is covered by another building (no siding there).
 * Returns { lo: {key: geos[]}, hi: {key: geos[]}, caps: geos[] }.
 */
export function buildWalls(walls: any[], H: number, C: number, opts: any): { lo: Record<string, THREE.BufferGeometry[]>; hi: Record<string, THREE.BufferGeometry[]>; caps: THREE.BufferGeometry[] } {
  const lo: Record<string, THREE.BufferGeometry[]> = {}, hi: Record<string, THREE.BufferGeometry[]> = {}, caps: THREE.BufferGeometry[] = [];
  const push = (b: Record<string, THREE.BufferGeometry[]>, k: string, g: THREE.BufferGeometry) => (b[k] || (b[k] = [])).push(g);
  const SKIN = 0.035;
  for (const wall of walls) {
    const [ax, az] = wall.a, [bx, bz] = wall.b;
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const L = alongX ? bx - ax : bz - az;
    const t = wall.t;
    const ext = t / 2;
    // basement walls are bare concrete: no siding, plain trim
    const exterior = !!wall.bld && wall.bld !== 'basement';
    const coreKey = wall.bld === 'basement' ? 'conc' : 'core';
    const out = exterior ? opts.outOf(wall) : 0;
    const pal = wall.bld === 'cottage' ? 'cottage' : 'house';
    const trimKey = exterior ? `trim:${pal}` : 'trim:in';
    const skinKey = exterior ? `skin:${pal}` : '';
    const hidden = exterior ? opts.hidden(wall) : [];
    // pieces overlap their neighbours by 1 mm: no T-junction cracks (the dotted seams seen in Walk)
    const place = (u0: any, u1: any, v0: any, v1: any, thick: any, off = 0) => {
      const len = u1 - u0 + 0.002, h = v1 - v0 + 0.002, mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
      return alongX ? boxGeo(len, h, thick, ax + mu, mv, az + off) : boxGeo(thick, h, len, ax + off, mv, az + mu);
    };
    // add a box, splitting it at the cut height
    const add = (key: any, u0: any, u1: any, v0: any, v1: any, thick: any, off = 0, cap = false) => {
      if (u1 - u0 < 0.004 || v1 - v0 < 0.004) return;
      if (v0 < C) {
        push(lo, key, place(u0, u1, v0, Math.min(v1, C), thick, off));
        if (cap && v1 >= C - 1e-6) caps.push(place(u0, u1, C, C + 0.012, t + 0.008, 0));
      }
      if (v1 > C) push(hi, key, place(u0, u1, Math.max(v0, C), v1, thick, off));
    };
    // split [u0,u1] against hidden ranges -> [[u0,u1,isHidden]]
    const cutHidden = (u0: any, u1: any) => {
      let segs: [number, number, boolean][] = [[u0, u1, false]];
      for (const [h0, h1] of hidden) {
        const next: [number, number, boolean][] = [];
        for (const [s0, s1, hid] of segs) {
          if (hid || h1 <= s0 || h0 >= s1) { next.push([s0, s1, hid]); continue; }
          if (h0 > s0) next.push([s0, h0, false]);
          next.push([Math.max(s0, h0), Math.min(s1, h1), true]);
          if (h1 < s1) next.push([h1, s1, false]);
        }
        segs = next;
      }
      return segs;
    };
    const solid = (u0: any, u1: any, v0: any, v1: any) => {
      if (!exterior) { add(coreKey, u0, u1, v0, v1, t, 0, true); return; }
      add('core', u0, u1, v0, v1, t - SKIN, -out * SKIN / 2, true);
      for (const [s0, s1, hid] of cutHidden(u0, u1)) add(hid ? 'core' : skinKey, s0, s1, v0, v1, SKIN, out * (t / 2 - SKIN / 2));
    };
    const ops: any[] = [...wall.o].sort((p: any, q: any) => p.at - q.at);
    let u = -ext;
    for (const o of ops) {
      const u0 = o.at - o.w / 2, u1 = o.at + o.w / 2;
      if (u0 > u) solid(u, u0, 0, H);
      if (o.sill > 0) solid(u0, u1, 0, o.sill);
      if (o.head < H) solid(u0, u1, o.head, H);
      u = u1;
      const fw = 0.05; // sash / frame bar width
      if (o.kind === 'window') {
        // glass, sash frame, mullions for wide windows, meeting rail for double-hung
        add('glass', u0, u1, o.sill, o.head, 0.02);
        add(trimKey, u0, u0 + fw, o.sill, o.head, 0.07);
        add(trimKey, u1 - fw, u1, o.sill, o.head, 0.07);
        add(trimKey, u0, u1, o.sill, o.sill + fw, 0.07);
        add(trimKey, u0, u1, o.head - fw, o.head, 0.07);
        const panes = o.w > 1.5 ? Math.round(o.w / 0.75) : 1;
        for (let i = 1; i < panes; i++) { const m = u0 + (o.w * i) / panes; add(trimKey, m - 0.03, m + 0.03, o.sill, o.head, 0.07); }
        if (o.hung && o.head - o.sill > 0.8) { const m = (o.sill + o.head) / 2; add(trimKey, u0, u1, m - 0.025, m + 0.025, 0.07); }
        if (exterior) {
          // outside casing + sill nose
          const f = out * (t / 2 + 0.012);
          add(trimKey, u0 - 0.09, u0, o.sill - 0.02, o.head + 0.1, 0.025, f);
          add(trimKey, u1, u1 + 0.09, o.sill - 0.02, o.head + 0.1, 0.025, f);
          add(trimKey, u0 - 0.09, u1 + 0.09, o.head, o.head + 0.1, 0.025, f);
          add(trimKey, u0 - 0.12, u1 + 0.12, o.sill - 0.05, o.sill, 0.07, out * (t / 2 + 0.02));
        } else {
          add('trim:in', u0 - 0.06, u1 + 0.06, o.sill - 0.03, o.sill, t + 0.06);
        }
        if (exterior) add('trim:in', u0 - 0.05, u1 + 0.05, o.sill - 0.03, o.sill, 0.08, -out * (t / 2));
      } else if (o.kind === 'door') {
        if (exterior) {
          const f = out * (t / 2 + 0.012);
          add(trimKey, u0 - 0.09, u0, 0, o.head + 0.1, 0.025, f);
          add(trimKey, u1, u1 + 0.09, 0, o.head + 0.1, 0.025, f);
          add(trimKey, u0 - 0.09, u1 + 0.09, o.head, o.head + 0.1, 0.025, f);
          // closed leaf set back toward the inside face
          const lf = -out * (t / 2 - 0.04);
          const leaf = o.leaf || 'wood-lite';
          if (leaf === 'glass') {
            const k = `leaf:${opts.glassLeaf || 'black'}`;
            add(k, u0 + 0.02, u0 + 0.1, 0, o.head - 0.02, 0.05, lf);
            add(k, u1 - 0.1, u1 - 0.02, 0, o.head - 0.02, 0.05, lf);
            add(k, u0 + 0.02, u1 - 0.02, 0, 0.2, 0.05, lf);
            add(k, u0 + 0.02, u1 - 0.02, o.head - 0.12, o.head - 0.02, 0.05, lf);
            add('glass', u0 + 0.1, u1 - 0.1, 0.2, o.head - 0.12, 0.02, lf);
          } else {
            const k = leaf === 'white-lite' ? 'leaf:white' : 'leaf:wood';
            add(k, u0 + 0.02, u1 - 0.02, 0, o.head - 0.02, 0.045, lf);
            add('glass', u0 + 0.14, u1 - 0.14, o.head * 0.5, o.head - 0.18, 0.055, lf);
          }
        }
        // interior casing (both faces)
        add('trim:in', u0 - 0.06, u0, 0, o.head + 0.06, t + 0.025);
        add('trim:in', u1, u1 + 0.06, 0, o.head + 0.06, t + 0.025);
        add('trim:in', u0 - 0.06, u1 + 0.06, o.head, o.head + 0.06, t + 0.025);
      } else if (o.kind === 'open' && o.sill === 0) {
        add('trim:in', u0 - 0.05, u0, 0, o.head + 0.05, t + 0.02);
        add('trim:in', u1, u1 + 0.05, 0, o.head + 0.05, t + 0.02);
        add('trim:in', u0 - 0.05, u1 + 0.05, o.head, o.head + 0.05, t + 0.02);
      }
    }
    if (u < L + ext) solid(u, L + ext, 0, H);
    // siding skirt over the floor structure below the main floor (opts.skirt metres)
    if (exterior && opts.skirt) {
      for (const [s0, s1, hid] of cutHidden(-ext, L + ext)) if (!hid) push(lo, skinKey, place(s0, s1, -opts.skirt, 0, SKIN, out * (t / 2 - SKIN / 2)));
      // water table trim board at the bottom of the siding
      for (const [s0, s1, hid] of cutHidden(-ext, L + ext)) if (!hid) push(lo, trimKey, place(s0, s1, -opts.skirt - 0.02, -opts.skirt + 0.12, 0.03, out * (t / 2 + 0.01)));
    }
  }
  return { lo, hi, caps };
}

// Interior trim (baseboards 90 mm, door and window casings 70 mm) on the room faces of each wall.
// Exterior walls get trim on the inside face only. Trim stands 1 mm off the wall face (no coplanar faces).
export function buildTrim(walls: any[], outOf: (w: any) => number): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = [];
  const BASE_H = 0.09, BASE_T = 0.014, CAS_W = 0.07, CAS_T = 0.016;
  for (const wall of walls) {
    if (wall.bld === 'studio-deck') continue;
    const [ax, az] = wall.a, [bx, bz] = wall.b;
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const L = alongX ? bx - ax : bz - az;
    const t = wall.t;
    const exterior = !!wall.bld && wall.bld !== 'basement';
    const sides = exterior ? [-(outOf(wall) || 1)] : [1, -1];
    const box = (u0: number, u1: number, v0: number, v1: number, thick: number, off: number) => {
      const len = Math.abs(u1 - u0), h = v1 - v0, mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
      if (len < 0.01 || h < 0.005) return;
      geos.push(alongX ? boxGeo(len, h, thick, ax + mu, mv, az + off) : boxGeo(thick, h, len, ax + off, mv, az + mu));
    };
    const ops = (wall.o || []).map((o: any) => ({ ...o, u0: o.at - o.w / 2, u1: o.at + o.w / 2 }));
    for (const s of sides) {
      const offB = s * (t / 2 + BASE_T / 2 + 0.001), offC = s * (t / 2 + CAS_T / 2 + 0.001);
      // baseboard: the wall length minus floor-level openings and their casings
      const cuts = ops.filter((o: any) => o.sill === 0).map((o: any) => [o.u0 - CAS_W, o.u1 + CAS_W]).sort((p: any, q: any) => p[0] - q[0]);
      let u = Math.min(0, L), end = Math.max(0, L);
      for (const [c0, c1] of cuts) { box(u, Math.max(u, c0), 0, BASE_H, BASE_T, offB); u = Math.max(u, c1); }
      box(u, end, 0, BASE_H, BASE_T, offB);
      // casings
      for (const o of ops) {
        const v0 = o.sill > 0 ? o.sill - 0.07 : 0, top = o.head + CAS_W;
        box(o.u0 - CAS_W, o.u0, v0, top, CAS_T, offC);
        box(o.u1, o.u1 + CAS_W, v0, top, CAS_T, offC);
        box(o.u0 - CAS_W, o.u1 + CAS_W, o.head, top, CAS_T, offC);
        if (o.sill > 0) box(o.u0 - CAS_W, o.u1 + CAS_W, o.sill - 0.07, o.sill - 0.01, CAS_T, offC); // apron under the stool
      }
    }
  }
  return geos;
}
