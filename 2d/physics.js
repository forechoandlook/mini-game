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

// ── Circle collision ──────────────────────────────────────────────────────────
// Circles are described as { x, y, r } (center + radius).
// These are pure query functions — they don't mutate anything.

// Boolean overlap test between two circles.
export function circleVsCircle(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const rr = a.r + b.r;
  return dx*dx + dy*dy < rr*rr;
}

// MTV for two overlapping circles.
// Returns { nx, ny, pen } (push a in nx/ny direction by pen to separate) or null.
export function circleMtv(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  const d2 = dx*dx + dy*dy;
  const rr = a.r + b.r;
  if (d2 >= rr*rr) return null;
  const d = Math.sqrt(d2) || 0.001;
  return { nx: dx/d, ny: dy/d, pen: rr - d };
}

// Boolean overlap test: circle vs AABB rect { x, y, w, h }.
export function circleVsRect(c, r) {
  const nx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const ny = Math.max(r.y, Math.min(c.y, r.y + r.h));
  const dx = c.x - nx, dy = c.y - ny;
  return dx*dx + dy*dy < c.r*c.r;
}

// MTV for circle vs AABB rect.
// Returns { nx, ny, pen } (push circle by pen in nx/ny direction) or null.
export function circleRectMtv(c, r) {
  const nx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const ny = Math.max(r.y, Math.min(c.y, r.y + r.h));
  const dx = c.x - nx, dy = c.y - ny;
  const d2 = dx*dx + dy*dy;
  if (d2 >= c.r*c.r) return null;
  // circle center inside rect → find smallest exit
  if (d2 === 0) {
    const ox = c.x - (r.x + r.w/2), oy = c.y - (r.y + r.h/2);
    const ex = r.w/2 + c.r - Math.abs(ox), ey = r.h/2 + c.r - Math.abs(oy);
    return ex < ey
      ? { nx: Math.sign(ox), ny: 0, pen: ex }
      : { nx: 0, ny: Math.sign(oy), pen: ey };
  }
  const d = Math.sqrt(d2);
  return { nx: dx/d, ny: dy/d, pen: c.r - d };
}

// ── Capsule collision ─────────────────────────────────────────────────────────
// Capsule: two circles of radius r connected by a line segment.
// Described as { x, y, r, h } where (x,y) is the bottom-center,
// h is the full height (must be >= 2r). The segment runs from
// (x, y - r) to (x, y - h + r), i.e. top and bottom sphere centers.
//
// This is the recommended shape for character controllers:
// slides along walls and floors without catching on corners.

// Returns the closest point on segment (ax,ay)→(bx,by) to point (px,py).
function _closestPtOnSeg(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2));
  return { x: ax + t*dx, y: ay + t*dy };
}

function _capEnds(cap) {
  return {
    ax: cap.x, ay: cap.y - cap.r,
    bx: cap.x, by: cap.y - cap.h + cap.r,
  };
}

// Boolean overlap: capsule vs capsule.
export function capsuleVsCapsule(a, b) {
  const ea = _capEnds(a), eb = _capEnds(b);
  // closest points between the two segments
  const pa = _closestPtOnSeg(ea.ax, ea.ay, ea.bx, ea.by, eb.ax, eb.ay);
  const pb = _closestPtOnSeg(eb.ax, eb.ay, eb.bx, eb.by, pa.x, pa.y);
  const pa2 = _closestPtOnSeg(ea.ax, ea.ay, ea.bx, ea.by, pb.x, pb.y);
  const dx = pa2.x - pb.x, dy = pa2.y - pb.y;
  const rr = a.r + b.r;
  return dx*dx + dy*dy < rr*rr;
}

// MTV: capsule vs capsule → { nx, ny, pen } or null.
export function capsuleMtv(a, b) {
  const ea = _capEnds(a), eb = _capEnds(b);
  const pa = _closestPtOnSeg(ea.ax, ea.ay, ea.bx, ea.by, eb.ax, eb.ay);
  const pb = _closestPtOnSeg(eb.ax, eb.ay, eb.bx, eb.by, pa.x, pa.y);
  const pa2 = _closestPtOnSeg(ea.ax, ea.ay, ea.bx, ea.by, pb.x, pb.y);
  const dx = pa2.x - pb.x, dy = pa2.y - pb.y;
  const d2 = dx*dx + dy*dy;
  const rr = a.r + b.r;
  if (d2 >= rr*rr) return null;
  const d = Math.sqrt(d2) || 0.001;
  return { nx: dx/d, ny: dy/d, pen: rr - d };
}

// Boolean overlap: capsule vs AABB rect.
export function capsuleVsRect(cap, r) {
  const e = _capEnds(cap);
  // expand rect by cap.r (Minkowski sum), then check segment vs expanded rect
  const rx = r.x - cap.r, ry = r.y - cap.r;
  const rw = r.w + cap.r*2, rh = r.h + cap.r*2;
  // closest point on segment to rect center
  const cx = r.x + r.w/2, cy = r.y + r.h/2;
  const pt = _closestPtOnSeg(e.ax, e.ay, e.bx, e.by, cx, cy);
  return circleVsRect({ x: pt.x, y: pt.y, r: cap.r }, r);
}

// MTV: capsule vs AABB rect → { nx, ny, pen } or null.
export function capsuleRectMtv(cap, r) {
  const e = _capEnds(cap);
  // find closest point on capsule segment to rect, then treat as circle
  const cx = r.x + r.w/2, cy = r.y + r.h/2;
  const pt = _closestPtOnSeg(e.ax, e.ay, e.bx, e.by, cx, cy);
  return circleRectMtv({ x: pt.x, y: pt.y, r: cap.r }, r);
}

// Move a capsule character against a list of static rects.
// Mutates cap.x, cap.y; returns { grounded }.
// Mirrors move() but uses capsule shape so no corner-catching.
export function moveCapsule(cap, dt, obstacles = []) {
  cap.x += cap.vx * dt;
  cap.y += cap.vy * dt;
  let grounded = false;
  for (const obs of obstacles) {
    const m = capsuleRectMtv(cap, obs);
    if (!m) continue;
    if (obs.oneWay) {
      if (m.ny >= 0) continue;
      if (cap.vy < 0) continue;
    }
    cap.x += m.nx * m.pen;
    cap.y += m.ny * m.pen;
    if (m.nx !== 0) { cap.vx = -cap.vx * (cap.restitution ?? 0); }
    if (m.ny !== 0) {
      const bounce = -cap.vy * (cap.restitution ?? 0);
      cap.vy = Math.abs(bounce) < 1 ? 0 : bounce;
      if (m.ny < 0) { grounded = true; cap.vx *= (cap.friction ?? 0.85); }
    }
  }
  cap.grounded = grounded;
  return { grounded };
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
