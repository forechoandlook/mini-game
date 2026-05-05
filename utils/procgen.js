// Procedural level generation utilities
// All functions accept a seeded `rng` object ({ next() → 0..1 })
// so levels are deterministic. Pass `random` from random.js.
//
// Included:
//   rooms(cfg)          — BSP room partition (dungeon rooms + corridors)
//   cellular(cfg)       — cellular automata cave
//   noise1d / noise2d   — value noise (smooth random terrain)
//   drunkardWalk(cfg)   — random walk tunnel carving
//   scatter(cfg)        — place items avoiding overlap

// ── BSP Dungeon ───────────────────────────────────────────────────────────────
// Returns { rooms:[{x,y,w,h}], corridors:[{x,y,w,h}], grid:Uint8Array }
// grid[y*cols+x]: 0=wall, 1=floor
export function rooms({
  cols   = 40,
  rows   = 25,
  minRoom = 4,
  maxRoom = 10,
  splits  = 6,
  rng     = Math,   // rng.random or rng.next
} = {}) {
  const rand = rng.next ? rng.next.bind(rng) : rng.random.bind(rng);
  const grid = new Uint8Array(cols * rows);           // 0 = wall

  function ri(lo, hi) { return lo + (rand() * (hi - lo + 1)) | 0; }

  // BSP leaf
  class Leaf {
    constructor(x, y, w, h) { this.x=x; this.y=y; this.w=w; this.h=h; this.l=null; this.r=null; this.room=null; }
    split() {
      if (this.l) return false;
      const horiz = rand() > 0.5;
      const max   = (horiz ? this.h : this.w) - minRoom;
      if (max < minRoom) return false;
      const split = ri(minRoom, max);
      if (horiz) {
        this.l = new Leaf(this.x, this.y,        this.w, split);
        this.r = new Leaf(this.x, this.y + split, this.w, this.h - split);
      } else {
        this.l = new Leaf(this.x,        this.y, split,          this.h);
        this.r = new Leaf(this.x + split, this.y, this.w - split, this.h);
      }
      return true;
    }
    createRooms(rooms) {
      if (this.l) { this.l.createRooms(rooms); this.r.createRooms(rooms); return; }
      const rw = ri(minRoom, Math.min(maxRoom, this.w - 1));
      const rh = ri(minRoom, Math.min(maxRoom, this.h - 1));
      const rx = this.x + ri(0, this.w - rw - 1);
      const ry = this.y + ri(0, this.h - rh - 1);
      this.room = { x: rx, y: ry, w: rw, h: rh };
      rooms.push(this.room);
    }
    getRoom() {
      if (this.room) return this.room;
      const lr = this.l?.getRoom(), rr = this.r?.getRoom();
      return rand() > 0.5 ? (lr ?? rr) : (rr ?? lr);
    }
  }

  const root = new Leaf(1, 1, cols - 2, rows - 2);
  const queue = [root];
  for (let i = 0; i < splits; i++) {
    const leaf = queue[ri(0, queue.length - 1)];
    if (leaf.split()) { queue.push(leaf.l, leaf.r); }
  }

  const roomList = [];
  root.createRooms(roomList);

  // carve rooms
  for (const room of roomList) {
    for (let y = room.y; y < room.y + room.h; y++)
      for (let x = room.x; x < room.x + room.w; x++)
        grid[y * cols + x] = 1;
  }

  // carve corridors between sibling leaves
  const corridors = [];
  function carve(leaf) {
    if (!leaf.l) return;
    carve(leaf.l); carve(leaf.r);
    const a = leaf.l.getRoom(), b = leaf.r.getRoom();
    if (!a || !b) return;
    const ax = a.x + (a.w/2|0), ay = a.y + (a.h/2|0);
    const bx = b.x + (b.w/2|0), by = b.y + (b.h/2|0);
    // L-shaped corridor
    const mx = rand() > 0.5 ? ax : bx;
    const my = rand() > 0.5 ? ay : by;
    _hCorridor(grid, cols, ax, mx, ay, corridors);
    _vCorridor(grid, cols, ay, my, mx, corridors);
    _hCorridor(grid, cols, mx, bx, my, corridors);
    _vCorridor(grid, cols, my, by, bx, corridors);
  }
  carve(root);

  return { rooms: roomList, corridors, grid, cols, rows };
}

function _hCorridor(grid, cols, x1, x2, y, out) {
  const lo = Math.min(x1,x2), hi = Math.max(x1,x2);
  for (let x = lo; x <= hi; x++) grid[y*cols+x] = 1;
  out.push({ x: lo, y, w: hi-lo+1, h: 1 });
}
function _vCorridor(grid, cols, y1, y2, x, out) {
  const lo = Math.min(y1,y2), hi = Math.max(y1,y2);
  for (let y = lo; y <= hi; y++) grid[y*cols+x] = 1;
  out.push({ x, y: lo, w: 1, h: hi-lo+1 });
}

// ── Cellular Automata Cave ────────────────────────────────────────────────────
// Returns { grid:Uint8Array, cols, rows }
// grid: 0=wall, 1=cave floor
export function cellular({
  cols       = 60,
  rows       = 40,
  fillRatio  = 0.45,   // initial wall density
  iterations = 5,
  birthLimit = 4,      // alive neighbors needed to stay alive
  deathLimit = 3,
  rng        = Math,
} = {}) {
  const rand = rng.next ? rng.next.bind(rng) : rng.random.bind(rng);
  let grid = new Uint8Array(cols * rows);

  // seed
  for (let i = 0; i < grid.length; i++)
    grid[i] = rand() < fillRatio ? 0 : 1;

  // border always wall
  for (let x = 0; x < cols; x++) { grid[x]=0; grid[(rows-1)*cols+x]=0; }
  for (let y = 0; y < rows; y++) { grid[y*cols]=0; grid[y*cols+cols-1]=0; }

  function neighbors(g, x, y) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx===0 && dy===0) continue;
        const nx=x+dx, ny=y+dy;
        if (nx<0||ny<0||nx>=cols||ny>=rows) n++;  // out-of-bounds = wall
        else if (g[ny*cols+nx]===0) n++;
      }
    return n;
  }

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const n = neighbors(grid, x, y);
        next[y*cols+x] = grid[y*cols+x] === 0
          ? (n <= deathLimit ? 1 : 0)   // dead wall → born if fewer neighbors
          : (n >= birthLimit ? 0 : 1);  // alive floor → dies if too many wall neighbors
      }
    grid = next;
  }

  return { grid, cols, rows };
}

// ── Value Noise ───────────────────────────────────────────────────────────────
// Returns smooth random values in 0..1.
// noise1d(x, scale, rng) — 1D (terrain height)
// noise2d(x, y, scale, rng) — 2D (height map, texture)
function _hash(n, rng) {
  // deterministic from seed: use mulberry32 step on n
  let s = (n * 2654435761) >>> 0;
  s = Math.imul(s ^ s >>> 15, 1 | s);
  s = (s + Math.imul(s ^ s >>> 7, 61 | s)) ^ s;
  return ((s ^ s >>> 14) >>> 0) / 0x100000000;
}

function _smoothstep(t) { return t*t*(3-2*t); }

export function noise1d(x, scale = 1, seed = 0) {
  const xi = Math.floor(x / scale);
  const xf = (x / scale) - xi;
  const a = _hash(xi + seed * 1000, null);
  const b = _hash(xi + 1 + seed * 1000, null);
  return a + (b - a) * _smoothstep(xf);
}

export function noise2d(x, y, scale = 1, seed = 0) {
  const xi = Math.floor(x / scale), yi = Math.floor(y / scale);
  const xf = (x / scale) - xi,      yf = (y / scale) - yi;
  const s = seed * 999983;
  const a = _hash(xi +     yi    *cols + s, null);
  const b = _hash(xi + 1 + yi    *cols + s, null);
  const c = _hash(xi +    (yi+1) *cols + s, null);
  const d = _hash(xi + 1 +(yi+1) *cols + s, null);
  const ab = a + (b-a)*_smoothstep(xf);
  const cd = c + (d-c)*_smoothstep(xf);
  return ab + (cd-ab)*_smoothstep(yf);
}

// avoid leaking BSP's `cols` into noise2d — use a large prime instead
const cols = 100003;

// ── Drunkard Walk ─────────────────────────────────────────────────────────────
// Carves a cave by random walking. Returns { grid, cols, rows }.
export function drunkardWalk({
  cols   = 40,
  rows   = 25,
  steps  = 800,
  rng    = Math,
} = {}) {
  const rand = rng.next ? rng.next.bind(rng) : rng.random.bind(rng);
  const grid = new Uint8Array(cols * rows);
  let x = (cols/2)|0, y = (rows/2)|0;
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let i = 0; i < steps; i++) {
    grid[y*cols+x] = 1;
    const [dx,dy] = DIRS[(rand()*4)|0];
    x = Math.max(1, Math.min(cols-2, x+dx));
    y = Math.max(1, Math.min(rows-2, y+dy));
  }
  return { grid, cols, rows };
}

// ── Scatter ───────────────────────────────────────────────────────────────────
// Place `count` items in world space, avoiding overlap with each other and
// with a list of existing rects.
// Returns [{ x, y }]
export function scatter({
  count   = 10,
  areaX   = 0,
  areaY   = 0,
  areaW   = 480,
  areaH   = 270,
  radius  = 16,    // minimum distance between items
  avoid   = [],    // [{ x,y,w,h }] forbidden rects
  rng     = Math,
  maxTries = 30,
} = {}) {
  const rand = rng.next ? rng.next.bind(rng) : rng.random.bind(rng);
  const placed = [];
  const r2 = radius * radius;

  for (let i = 0; i < count; i++) {
    for (let t = 0; t < maxTries; t++) {
      const cx = areaX + rand() * areaW;
      const cy = areaY + rand() * areaH;
      let ok = true;
      for (const p of placed) {
        if ((cx-p.x)**2 + (cy-p.y)**2 < r2) { ok=false; break; }
      }
      if (ok) for (const r of avoid) {
        if (cx >= r.x && cx <= r.x+r.w && cy >= r.y && cy <= r.y+r.h) { ok=false; break; }
      }
      if (ok) { placed.push({ x:cx, y:cy }); break; }
    }
  }
  return placed;
}
