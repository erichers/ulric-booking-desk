// Nested stays: plan data. Metres. Origin = house centre, +z = front, +x = right when facing the front.
// Layout deduced from the listing photos; the flagged guesses are in ASSUMPTIONS below.

// ---------------------------------------------------------------------------
// ASSUMPTIONS: the flagged guesses from spec.md. The owner may correct these;
// change them here and everything downstream (walls, rooms, roof, camera) follows.
// ---------------------------------------------------------------------------
export const ASSUMPTIONS = {
  // [GUESS] Studio wing: attached to the right end wall, from the back corner forward.
  // x0 = shared wall line, z0 = back wall line. width/depth are the wing's outside size.
  studio: { x0: 5.8, z0: -4.2, width: 3.8, depth: 6.4 },
  // [GUESS] Basement runs under the whole house. false = back half only (front becomes crawlspace).
  basementUnderWholeHouse: true,
  // [GUESS] Cottage sits behind the house on the same lot (centre of the building).
  cottageAt: { x: -5.4, z: -11.6 },
  // [GUESS] Bedroom A (queen + desk + louvered closet) faces the front; false swaps A and B.
  bedroomAFacesFront: true,
};

const ST = ASSUMPTIONS.studio;
// studio geometry below is written for the default wing; shift it to wherever ASSUMPTIONS puts it
const SDX = ST.x0 - 5.8, SDZ = ST.z0 - -4.2;
export const STUDIO = { x0: ST.x0, x1: ST.x0 + ST.width, z0: ST.z0, z1: ST.z0 + ST.depth };
export const COTTAGE_AT = ASSUMPTIONS.cottageAt;

export const LEVELS: any = {
  basement: { floor: -2.6, height: 2.3, cut: 1.1 },
  main: { floor: 0, height: 2.45, cut: 1.1 },
  cottage: { floor: -0.55, height: 2.5, cut: 1.1 },
};
export const GRADE = -0.75;

// Real colours (from the listing photos), with the Ulric palette for everything else.
export const EXTERIOR = {
  house: { siding: '#6d7e90', trim: '#f6f4ef', roof: '#66625e', door: '#b9844f' },
  cottage: { siding: '#f3f1ec', trim: '#2b2a28', roof: '#55524e', door: '#2b2a28' },
};

const shiftRect = ([x0, x1, z0, z1]: number[]) => [x0 + SDX, x1 + SDX, z0 + SDZ, z1 + SDZ];
const bedAFront = ASSUMPTIONS.bedroomAFacesFront;
const full = ASSUMPTIONS.basementUnderWholeHouse;

// Each room: id, level, unit (smallest unit that owns it), rects [x0,x1,z0,z1], floor finish, label.
export const ROOMS: any[] = [
  // main floor (2-bed)
  { id: 'living', level: 'main', unit: 'two-bed', rects: [[-5.8, -0.6, 0.4, 4.2]], floor: 'oak', label: 'Living', sub: 'fireplace' },
  { id: 'dining', level: 'main', unit: 'two-bed', rects: [[-5.8, -2.8, -4.2, 0.4]], floor: 'oak', label: 'Dining' },
  { id: 'kitchen', level: 'main', unit: 'two-bed', rects: [[-2.8, 0.6, -4.2, -0.6]], floor: 'cork', label: 'Kitchen', sub: 'retro yellow' },
  { id: 'hall', level: 'main', unit: 'two-bed', rects: [[-2.8, 4.0, -0.6, 0.4], [-0.6, 1.4, 0.4, 1.9]], floor: 'oak' },
  { id: 'bath', level: 'main', unit: 'two-bed', rects: [[-0.6, 1.4, 1.9, 4.2]], floor: 'tile', label: 'Bath', sub: 'tub' },
  { id: 'bed-a', level: 'main', unit: 'two-bed', rects: [[1.4, 5.8, 0.4, 4.2]], floor: 'oak', label: 'Bedroom', sub: bedAFront ? 'queen, desk' : 'queen' },
  { id: 'bed-b', level: 'main', unit: 'two-bed', rects: [[1.8, 5.8, -4.2, -0.6], [4.0, 5.8, -0.6, 0.4]], floor: 'oak', label: 'Bedroom', sub: bedAFront ? 'queen' : 'queen, desk' },
  // basement (the 3-bed adds these)
  { id: 'bsmt-bed', level: 'basement', unit: 'three-bed', rects: [[1.8, 5.8, -4.2, 0.6]], floor: 'carpet', label: 'Basement bedroom', sub: 'queen' },
  { id: 'bsmt-office', level: 'basement', unit: 'three-bed', rects: [[-2.8, 1.8, -4.2, 0.6]], floor: 'carpet', label: 'Office', sub: 'stairs' },
  { id: 'laundry', level: 'basement', unit: 'three-bed', rects: [[-5.8, -2.8, -4.2, 0.6]], floor: 'concrete', label: 'Laundry' },
  ...(full ? [{ id: 'storage', level: 'basement', unit: 'three-bed', rects: [[-5.8, 5.8, 0.6, 4.2]], floor: 'concrete', label: 'Storage' }] : []),
  // studio wing
  { id: 'studio-room', level: 'main', unit: 'studio', rects: [[5.8, 9.6, -4.2, 0.2], [5.8, 7.9, 0.2, 2.2]].map(shiftRect), floor: 'stain', label: 'Studio', sub: 'full bed' },
  { id: 'studio-bath', level: 'main', unit: 'studio', rects: [[7.9, 9.6, 0.2, 2.2]].map(shiftRect), floor: 'tile', label: 'Bath', sub: 'shower' },
  { id: 'studio-deck', level: 'main', unit: 'studio', rects: [[5.6, 10.2, -6.8, -4.2]].map(shiftRect), floor: 'deck', label: 'Deck', outdoor: true },
  // cottage (separate building, local origin at its centre)
  { id: 'cottage-room', level: 'cottage', unit: 'cottage', rects: [[-3.65, 0.0, -1.85, 1.85], [0.0, 3.65, -0.4, 1.85]], floor: 'ptile', label: 'Cottage', sub: 'full bed' },
  { id: 'cottage-bath', level: 'cottage', unit: 'cottage', rects: [[0.0, 2.2, -1.85, -0.4]], floor: 'tile', label: 'Bath', sub: 'roll-in' },
  { id: 'cottage-utility', level: 'cottage', unit: 'cottage', rects: [[2.2, 3.65, -1.85, -0.4]], floor: 'lvp' },
];

// Openings: { at: centre distance from wall start, w, sill, head, kind, leaf? }
// leaf (exterior doors): 'wood-lite' half-glass wood, 'white-lite', 'glass' full-lite. Double-hung windows get a meeting rail.
const D = (at: number, w = 0.9, leaf?: string) => ({ at, w, sill: 0, head: 2.1, kind: 'door', leaf });
const W = (at: number, w = 1.2, sill = 0.8, head = 2.05) => ({ at, w, sill, head, kind: 'window', hung: true });
const O = (at: number, w: number, head = 2.15) => ({ at, w, sill: 0, head, kind: 'open' });
const HI = (at: number, w = 0.9) => ({ at, w, sill: 1.55, head: 2.05, kind: 'window' });

const shiftWall = (w: any) => ({ ...w, a: [w.a[0] + SDX, w.a[1] + SDZ], b: [w.b[0] + SDX, w.b[1] + SDZ] });

// Walls: a -> b (axis aligned), t thickness, bld = building for exterior walls (outward side + colours).
export const WALLS: any = {
  main: [
    // exterior
    // front: the entry door sits just right of the fireplace / chimney (listing photos: interior 04, exterior 24-25)
    { a: [-5.8, 4.2], b: [5.8, 4.2], t: 0.2, bld: 'house', o: [D(4.7, 0.9, 'wood-lite'), W(6.2, 0.8, 1.1, 1.9), W(9.4, 1.4)] },
    { a: [-5.8, -4.2], b: [5.8, -4.2], t: 0.2, bld: 'house', o: [W(1.5, 1.4), W(5.45, 1.0, 1.05), W(9.6, 1.4)] },
    { a: [-5.8, -4.2], b: [-5.8, 4.2], t: 0.2, bld: 'house', o: [W(2.2, 1.2), W(6.45, 1.35, 0.62, 2.05)] },
    // right end wall: shared with the studio where they touch; the window sits on the exposed front part
    { a: [5.8, -4.2], b: [5.8, 4.2], t: 0.2, bld: 'house', o: [W(7.05, 1.0)] },
    // interior
    { a: [-2.8, -4.2], b: [-2.8, -0.6], t: 0.12, o: [D(1.75, 0.8)] },
    { a: [-5.8, 0.4], b: [-0.6, 0.4], t: 0.12, o: [D(0.62, 0.85), O(4.75, 0.8)] },
    { a: [-2.8, -0.6], b: [0.6, -0.6], t: 0.12, o: [D(3.0, 0.8)] },
    { a: [0.6, -4.2], b: [0.6, -0.6], t: 0.12, o: [] },
    { a: [1.8, -4.2], b: [1.8, -0.6], t: 0.12, o: [] },
    { a: [1.8, -0.6], b: [5.8, -0.6], t: 0.12, o: [D(0.5, 0.8)] },
    { a: [4.0, -0.6], b: [4.0, 0.4], t: 0.12, o: [] },
    { a: [-0.6, 0.4], b: [-0.6, 4.2], t: 0.12, o: [] },
    { a: [1.4, 0.4], b: [1.4, 4.2], t: 0.12, o: [] },
    { a: [-0.6, 1.9], b: [1.4, 1.9], t: 0.12, o: [D(0.95, 0.75)] },
    { a: [1.4, 0.4], b: [5.8, 0.4], t: 0.12, o: [D(1.2, 0.8)] },
    // studio wing (shares the right wall with the house; no internal door)
    ...[
      { a: [9.6, -4.2], b: [9.6, 2.2], t: 0.2, bld: 'studio', o: [] },
      { a: [5.8, 2.2], b: [9.6, 2.2], t: 0.2, bld: 'studio', o: [D(0.85, 0.9, 'wood-lite')] },
      // triple double-hung window beside the bed head (studio photos 01 and 06), deck door at the west end
      { a: [5.8, -4.2], b: [9.6, -4.2], t: 0.2, bld: 'studio', o: [D(0.9, 0.9, 'white-lite'), W(2.15, 0.56, 0.8, 2.05), W(2.75, 0.56, 0.8, 2.05), W(3.35, 0.56, 0.8, 2.05)] },
      { a: [7.9, 0.2], b: [7.9, 2.2], t: 0.12, o: [] },
      { a: [7.9, 0.2], b: [9.6, 0.2], t: 0.12, o: [D(0.85, 0.75)] },
    ].map(shiftWall),
  ],
  basement: [
    full
      ? { a: [-5.8, 4.2], b: [5.8, 4.2], t: 0.25, bld: 'basement', o: [HI(2.5), HI(9.0)] }
      : { a: [-5.8, 0.6], b: [5.8, 0.6], t: 0.25, bld: 'basement', o: [O(1.5, 1.2), D(4.7, 0.9)] },
    { a: [-5.8, -4.2], b: [5.8, -4.2], t: 0.25, bld: 'basement', o: [HI(1.5), HI(8.4, 0.7), HI(10.0, 0.9)] },
    { a: [-5.8, -4.2], b: [-5.8, full ? 4.2 : 0.6], t: 0.25, bld: 'basement', o: [] },
    { a: [5.8, -4.2], b: [5.8, full ? 4.2 : 0.6], t: 0.25, bld: 'basement', o: [] },
    { a: [1.8, -4.2], b: [1.8, 0.6], t: 0.12, o: [D(0.55, 0.8)] },
    { a: [-2.8, -4.2], b: [-2.8, 0.6], t: 0.12, o: [D(1.6, 0.9)] },
    ...(full ? [{ a: [-5.8, 0.6], b: [5.8, 0.6], t: 0.12, o: [O(1.5, 1.2), D(4.7, 0.9)] }] : []),
  ],
  cottage: [
    { a: [-3.65, -1.85], b: [3.65, -1.85], t: 0.18, bld: 'cottage', o: [W(1.0, 1.0), W(5.9, 0.6, 1.2, 1.9)] },
    { a: [-3.65, 1.85], b: [3.65, 1.85], t: 0.18, bld: 'cottage', o: [W(1.3, 1.6, 0.7), W(4.6, 0.9, 1.0)] },
    { a: [-3.65, -1.85], b: [-3.65, 1.85], t: 0.18, bld: 'cottage', o: [W(1.85, 1.1)] },
    { a: [3.65, -1.85], b: [3.65, 1.85], t: 0.18, bld: 'cottage', o: [W(0.95, 0.7), { at: 2.7, w: 0.95, sill: 0, head: 2.15, kind: 'door', leaf: 'glass' }] },
    { a: [0.0, -1.85], b: [0.0, -0.4], t: 0.12, o: [D(0.95, 0.8)] },
    { a: [0.0, -0.4], b: [3.65, -0.4], t: 0.12, o: [] },
    { a: [2.2, -1.85], b: [2.2, -0.4], t: 0.12, o: [] },
    // half wall with a walkway and a pass-through between the sleep zone and the galley
    { a: [0.0, -0.4], b: [0.0, 1.85], t: 0.12, o: [O(0.5, 0.7), { at: 1.9, w: 0.5, sill: 1.0, head: 1.9, kind: 'open' }] },
  ],
};

// Furniture: [kind, x, y, z, w, h, d, material, rotY or chair count]. Level-local coords.
const swapZ = (f: any[]) => (bedAFront ? f : [f[0], f[1], f[2], -f[3], ...f.slice(4)]);
const shiftF = (f: any[]) => [f[0], f[1] + SDX, f[2], f[3] + SDZ, ...f.slice(4)];
export const FURNITURE: any = {
  main: [
    // living (photos 01-05): fireplace + TV on the front wall beside the entry, chocolate sectional on the back wall
    // with its chaise toward the entry, lift-top cherry coffee table, grey medallion rug, window with sheers on the
    // end wall between a low bookcase and a navy recliner, torchiere floor lamp, plants
    ['fireplace', -2.42, 0, 3.949, 0, 0, 0, 'brick', Math.PI / 2],
    ['rug', -2.35, 0, 3.55, 1.4, 0.01, 0.55, 'rugred'],
    ['sofa-l', -3.15, 0, 0.961, 0, 0, 0, 'sofa', Math.PI / 2],
    ['rug', -3.25, 0, 2.3, 3.3, 0.01, 2.3, 'rug'],
    ['ctable', -3.15, 0, 2.15, 1.2, 0.46, 0.62, 'cherry'],
    ['recliner', -4.95, 0, 1.75, 0.92, 1.02, 0.95, 'navy', Math.PI / 2 + 0.35],
    ['bookcase', -5.52, 0, 3.45, 0.82, 1.02, 0.34, 'dark', Math.PI / 2],
    ['flamp', -5.5, 0, 2.3, 0.3, 1.8, 0.3, 'steel'],
    ['plant', -5.45, 0, 2.82, 0.42, 0.9, 0.42, 'plant'],
    ['plant', -3.6, 0, 3.88, 0.5, 1.1, 0.5, 'plant'],
    // dining
    ['table', -4.55, 0, -1.9, 1.0, 0.76, 1.7, 'wood', 6],
    ['box', -5.45, 0, -3.3, 0.45, 1.1, 1.0, 'sage'],
    // kitchen (photos 06-08): fridge beside the dining doorway, pantry, butcher block + coil range + sink run under the
    // back window, a short run with uppers and open shelves on the hall wall, and the rounded yellow peninsula
    ['box', -2.38, 0, -1.7, 0.72, 1.8, 0.72, 'steel', -Math.PI / 2],
    ['pantry', -2.435, 0, -3.15, 0.6, 2.15, 0.58, 'kitchen', 0, '+x'],
    ['counter', -2.37, 0, -3.775, 0.7, 0.92, 0.62, 'kitchen', 0, '+z', { top: 'butcher', splash: 1 }],
    ['uppers', -2.37, 0, -3.93, 0.74, 0.72, 0.34, 'kitchen', 0, '+z'],
    ['range', -1.62, 0, -3.775, 0.76, 0.94, 0.64, 'range', 0, '', { vent: 1 }],
    ['uppers', -2.57, 0, -1.7, 0.34, 0.45, 0.72, 'kitchen', 0, '+x', { y0: 1.92 }],
    ['counter', -0.35, 0, -3.775, 1.74, 0.92, 0.62, 'kitchen', 0, '+z', { sink: 0, splash: 1 }],
    ['counter', -1.635, 0, -0.985, 2.17, 0.92, 0.62, 'kitchen', 0, '-z', { splash: 1 }],
    ['uppers', -1.895, 0, -0.84, 1.69, 0.72, 0.34, 'kitchen', 0, '-z'],
    ['appl', -1.55, 0.92, -1.0, 0.5, 0.28, 0.36, 'black'],
    ['appl', -1.0, 0.92, -1.02, 0.42, 0.24, 0.32, 'red'],
    ['shelves', -0.78, 0, -0.79, 0.5, 0.4, 0.25, 'kitchen'],
    ['peninsula', -0.95, 0, -1.945, 0.62, 0.92, 1.2, 'kitchen', Math.PI],
    ['ceil', -1.1, 0, -2.4, 0.36, 2.439, 0.36, 'white'],
    ['windsor', -0.3, 0, -1.75, 0.44, 0.98, 0.44, 'wood', -Math.PI / 2],
    ['windsor', -0.3, 0, -2.3, 0.44, 0.98, 0.44, 'wood', -Math.PI / 2],
    // bath
    ['tub', 0.4, 0, 3.739, 1.55, 0.55, 0.72, 'white'],
    ['box', -0.27, 0, 2.6, 0.5, 0.85, 0.9, 'vanity'],
    ['toilet', 1.029, 0, 2.45, 0, 0, 0, 'white', -Math.PI / 2],
    // bedroom A (front by default): queen, desk, closet
    ['bed', 4.569, 0, 2.7, 1.6, 0.6, 2.1, 'queen', -Math.PI / 2, '', { frame: 'metal', stands: 'r' }],
    ['rug', 4.0, 0, 2.7, 2.6, 0.01, 2.3, 'rug'],
    ['cstand', 5.35, 0, 1.45, 0.4, 1.7, 0.4, 'white'],
    ['art', 1.475, 1.55, 3.2, 1.0, 0.65, 0.03, 'canvas', Math.PI / 2],
    swapZ(['art', 2.25, 1.55, 4.085, 0.55, 0.4, 0.03, 'sketch', Math.PI]),
    swapZ(['box', 2.249, 0, 3.799, 1.3, 0.76, 0.6, 'wood']),
    ['box', 1.75, 0, 1.6, 0.55, 1.9, 1.6, 'closet'],
    // bedroom B: queen, dresser, louvered closet strip
    ['bed', 4.569, 0, -2.4, 1.6, 0.6, 2.1, 'queen', -Math.PI / 2, '', { pillow: 'grey' }],
    ['art', 5.685, 1.62, -2.4, 0.7, 0.55, 0.03, 'sketch', -Math.PI / 2],
    ['art', 5.685, 1.62, -3.25, 0.32, 0.38, 0.03, 'grid', -Math.PI / 2],
    ['art', 5.685, 1.62, -1.55, 0.32, 0.38, 0.03, 'grid', -Math.PI / 2],
    swapZ(['box', 2.361, 0, -3.85, 1.0, 0.9, 0.5, 'wood']),
    ['box', 4.88, 0, 0.065, 1.6, 2.0, 0.55, 'closet'],
    // studio: full bed on the shared wall, console, wardrobe, desk, chair, shower, vanity
    ...[
      ['bed', 8.42, 0, -2.8, 1.4, 0.55, 2.0, 'full', -Math.PI / 2],
      ['box', 7.564, 0, 1, 0.55, 2.0, 1.2, 'wardrobe'],
      ['desk', 6.18, 0, -1.0, 0.55, 0.76, 1.1, 'dark', Math.PI],
      ['dchair', 6.62, 0, -1.0, 0.44, 0.9, 0.44, 'dark', -Math.PI / 2],
      ['tv', 5.96, 0, -1.0, 1.0, 0.58, 0.04, 'black', Math.PI],
      ['chair', 6.4, 0, -2.4, 0.7, 0.8, 0.7, 'green', Math.PI / 2 + 0.4],
      ['plant', 7.3, 0, -3.8, 0.42, 0.9, 0.42, 'plant'],
      ['shower', 9.07, 0, 1.674, 0.85, 2.0, 0.85, 'glass'],
      ['box', 8.271, 0, 1.839, 0.6, 0.85, 0.5, 'vanity'],
      // deck
      ['chair', 6.6, -0.2, -5.6, 0.7, 0.85, 0.75, 'white', 0.3],
      ['chair', 7.6, -0.2, -5.8, 0.7, 0.85, 0.75, 'white', -0.2],
      ['round', 8.9, -0.2, -5.6, 0.8, 0.72, 0.8, 'white'],
    ].map(shiftF),
  ],
  basement: [
    ['bed', 4.05, 0, -2.944, 1.6, 0.55, 2.1, 'queen', 0, '', { frame: 'wood' }],
    ['box', 2.05, 0, -1.6, 0.35, 1.9, 1.6, 'wood'],
    ['box', 5.474, 0, -1.1, 0.4, 0.45, 1.6, 'wood'],
    ['box', 2.6, 0, 0.239, 1.2, 0.76, 0.6, 'wood'],
    ['box', -0.4, 0, -3.774, 1.3, 0.76, 0.6, 'dark'],
    ['chair', -0.4, 0, -3.19, 0.55, 0.85, 0.55, 'dark', 3.14],
    ['washer', -4.95, 0, -3.734, 0.68, 0.9, 0.68, 'white'],
    ['washer', -4.2, 0, -3.734, 0.68, 0.9, 0.68, 'white'],
    ['cyl', -3.3, 0, -3.8, 0.55, 1.5, 0.55, 'white'],
    ...(full ? [
      ['box', -4.5, 0, 2.6, 0.9, 0.6, 0.6, 'kraft'],
      ['box', -3.4, 0, 3.3, 0.7, 0.45, 0.5, 'kraft'],
      ['box', 3.5, 0, 3.2, 1.6, 1.0, 0.7, 'kraft'],
    ] : []),
  ],
  cottage: [
    ['bed', -2.479, 0, 0, 1.4, 0.55, 2.0, 'full', Math.PI / 2, '', { frame: 'white', pillow: 'grey' }],
    ['coffer', -1.81, 0, 0, 3.5, 2.489, 3.52, 'white'],
    ['ceil', -1.81, 0, 0, 0.36, 2.36, 0.36, 'white'],
    ['fireplace-c', -1.3, 0, 1.26, 0, 0, 0, 'black'],
    ['chair', -1.28, 0, -1.2, 0.8, 1.0, 0.8, 'wine', -0.25],
    // galley (photo 01): sink + cooktop run on the bath-side wall, fridge by the glass door, uppers and a microwave over the range
    ['counter', 1.315, 0, -0.015, 1.03, 0.92, 0.62, 'kitchen-w', 0, '+z', { sink: 0, splash: 1 }],
    ['counter', 2.38, 0, -0.015, 1.04, 0.92, 0.62, 'kitchen-w', 0, '+z', { cook: true, splash: 1 }],
    ['uppers', 1.315, 0, -0.165, 1.03, 0.72, 0.34, 'kitchen', 0, '+z'],
    ['otr', 2.38, 1.5, -0.145, 0.76, 0.42, 0.38, 'steel'],
    ['uppers', 2.38, 0, -0.165, 1.04, 0.36, 0.34, 'kitchen', 0, '+z', { y0: 1.96 }],
    ['box', 2.55, 0, 1.421, 0.7, 1.75, 0.68, 'steel'],
    ['uppers', 2.55, 0, 1.59, 0.7, 0.45, 0.34, 'kitchen', 0, '-z', { y0: 1.9 }],
    ['shower', 1.5, 0, -1.209, 1.1, 2.0, 1.1, 'curb'],
    ['toilet', 0.38, 0, -1.52, 0, 0, 0, 'white', Math.PI / 2],
    ['box', 2.9, 0, -1.469, 1.1, 0.9, 0.55, 'kitchen-w'],
    // patio by the entry: two benches and a round glass table
    ['box', 5.3, -0.171, -1.4, 0.5, 0.45, 1.8, 'wood'],
    ['box', 5.3, -0.171, 1.4, 0.5, 0.45, 1.8, 'wood'],
    ['round', 5.0, -0.171, 0.0, 0.9, 0.45, 0.9, 'glass'],
  ],
};
