// AABB physics: gravity, collision response, one-way platforms
// Intentionally minimal — no engine object, just pure functions + a Body factory
// Usage:
//   const b = body({ x, y, w, h, mass })
//   body.applyGravity(b, dt)
//   body.move(b, dt, tiles)          // move + resolve vs tilemap collision
//   const hit = aabb(a, b)           // boolean overlap test
//   const info = sweep(a, bList)     // nearest hit with MTV

const GRAVITY = 800;  // px/s²  (override per-body with body.gravity)

// ── AABB helpers ─────────────────────────────────────────────────────────────
export function aabb(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

// Minimum translation vector to separate a from b (a is the mover)
// Returns { dx, dy, nx, ny } or null if no overlap
export function mtv(a, b) {
  const ox = (a.x + a.w / 2) - (b.x + b.w / 2);
  const oy = (a.y + a.h / 2) - (b.y + b.h / 2);
  const ex = (a.w + b.w) / 2 - Math.abs(ox);
  const ey = (a.h + b.h) / 2 - Math.abs(oy);
  if (ex <= 0 || ey <= 0) return null;

  if (ex < ey) {
    return { dx: ex * Math.sign(ox), dy: 0, nx: Math.sign(ox), ny: 0 };
  } else {
    return { dx: 0, dy: ey * Math.sign(oy), nx: 0, ny: Math.sign(oy) };
  }
}

// ── Body factory ─────────────────────────────────────────────────────────────
export function body({
  x = 0, y = 0, w = 16, h = 16,
  vx = 0, vy = 0,
  gravity = GRAVITY,
  friction = 0.85,    // horizontal damping when grounded
  restitution = 0,    // bounciness 0..1
  isStatic = false,
} = {}) {
  return {
    x, y, w, h,
    vx, vy,
    gravity,
    friction,
    restitution,
    isStatic,
    grounded: false,
    // convenience rect for aabb/mtv calls
    get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; },
  };
}

// ── Step functions ────────────────────────────────────────────────────────────

export function applyGravity(b, dt) {
  if (b.isStatic) return;
  b.vy += b.gravity * dt;
}

// Move body by velocity, then resolve against an array of static rect obstacles.
// obstacles: [{ x, y, w, h, oneWay? }]
// oneWay = true: only collide from above (platforms)
export function move(b, dt, obstacles = []) {
  if (b.isStatic) return;
  b.grounded = false;

  b.x += b.vx * dt;
  b.y += b.vy * dt;

  for (const obs of obstacles) {
    const m = mtv(b, obs);
    if (!m) continue;

    // one-way platform: only block when falling onto top
    // ny === -1 means MTV pushes body upward (body is above obstacle center)
    if (obs.oneWay) {
      if (m.ny !== -1) continue;   // not coming from above
      if (b.vy < 0)    continue;   // moving upward, pass through
    }

    b.x += m.dx;
    b.y += m.dy;

    if (m.nx !== 0) { b.vx = -b.vx * b.restitution; }
    if (m.ny !== 0) {
      const bounce = -b.vy * b.restitution;
      b.vy = Math.abs(bounce) < 1 ? 0 : bounce;
      if (m.ny === -1) {          // landed on top of obstacle (pushed upward)
        b.grounded = true;
        b.vx *= b.friction;
      }
    }
  }
}

// Resolve two dynamic bodies against each other (simple push-apart)
export function resolve(a, b) {
  if (a.isStatic && b.isStatic) return;
  const m = mtv(a, b);
  if (!m) return;

  if (a.isStatic) {
    b.x -= m.dx; b.y -= m.dy;
  } else if (b.isStatic) {
    a.x += m.dx; a.y += m.dy;
  } else {
    a.x += m.dx / 2; a.y += m.dy / 2;
    b.x -= m.dx / 2; b.y -= m.dy / 2;
  }
}

// Raycast against list of rects; returns nearest { t, nx, ny, hit } or null
// ray: { x, y, dx, dy, len }
export function raycast(ray, rects) {
  let best = null;
  const { x, y, dx, dy, len = Infinity } = ray;

  for (const r of rects) {
    const invDx = dx === 0 ? Infinity : 1 / dx;
    const invDy = dy === 0 ? Infinity : 1 / dy;

    const tx1 = (r.x - x) * invDx, tx2 = (r.x + r.w - x) * invDx;
    const ty1 = (r.y - y) * invDy, ty2 = (r.y + r.h - y) * invDy;

    const tNear = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
    const tFar  = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));

    if (tFar < 0 || tNear > tFar || tNear > len) continue;

    const t = tNear < 0 ? tFar : tNear;
    if (!best || t < best.t) {
      const nx = (tNear === tx1 || tNear === tx2) ? (tx1 < tx2 ? -1 : 1) : 0;
      const ny = (tNear === ty1 || tNear === ty2) ? (ty1 < ty2 ? -1 : 1) : 0;
      best = { t, nx, ny, hit: r };
    }
  }
  return best;
}
