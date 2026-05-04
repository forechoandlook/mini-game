// 3D physics: AABB + Sphere rigid bodies, gravity, collision response.
// Bellard principle: one file, no classes, explicit data, no hidden allocations
// in the step() hot path.
//
// Shapes: 'box' (AABB, no rotation) | 'sphere'
// Body types: 'dynamic' | 'static' | 'kinematic' (moved by code, collides)
//
// Usage:
//   const world = physics3d()
//   const b = world.body({ shape:'box', hx:0.5,hy:0.5,hz:0.5, x:0,y:4,z:0 })
//   const floor = world.body({ shape:'box', hx:10,hy:0.1,hz:10, type:'static' })
//   world.step(dt)
//   world.raycast(origin, dir, maxLen)  // → { body, t, normal } | null

import { v3 } from './math.js';

const GRAVITY   = 20;    // m/s²  (feels snappier than real 9.8 in game-world scale)
const SLEEP_VEL = 0.01;  // bodies below this speed for sleepTime→ sleep
const SLEEP_T   = 0.5;

// ── Scratch vecs (zero alloc in hot path) ─────────────────────────────────────
const _sep  = v3.new();
const _rvel = v3.new();
const _n    = v3.new();
const _tmp  = v3.new();

// ── AABB helpers ──────────────────────────────────────────────────────────────
// b = body; box is pos ± half-extents
function _aabbOverlap(a, b) {
  return Math.abs(a.x - b.x) < a.hx + b.hx &&
         Math.abs(a.y - b.y) < a.hy + b.hy &&
         Math.abs(a.z - b.z) < a.hz + b.hz;
}

// Returns MTV (minimum translation vector) pushing A out of B.
// Writes into out[3]. Returns depth (>0 = overlap) or 0.
function _aabbMTV(a, b, out) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  const ox = a.hx + b.hx - Math.abs(dx);
  const oy = a.hy + b.hy - Math.abs(dy);
  const oz = a.hz + b.hz - Math.abs(dz);
  if (ox <= 0 || oy <= 0 || oz <= 0) return 0;
  if (ox < oy && ox < oz)      { out[0] = ox * Math.sign(dx); out[1]=0; out[2]=0; return ox; }
  else if (oy < ox && oy < oz) { out[0]=0; out[1] = oy * Math.sign(dy); out[2]=0; return oy; }
  else                         { out[0]=0; out[1]=0; out[2] = oz * Math.sign(dz); return oz; }
}

// ── Sphere helpers ────────────────────────────────────────────────────────────
function _sphereOverlap(a, b) {
  const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z;
  const rsum = a.r + b.r;
  return dx*dx + dy*dy + dz*dz < rsum*rsum;
}

function _sphereMTV(a, b, out) {
  const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z;
  const dist2 = dx*dx + dy*dy + dz*dz;
  const rsum  = a.r + b.r;
  if (dist2 >= rsum*rsum) return 0;
  const dist  = Math.sqrt(dist2) || 1e-6;
  const depth = rsum - dist;
  out[0] = dx/dist * depth;
  out[1] = dy/dist * depth;
  out[2] = dz/dist * depth;
  return depth;
}

// ── Box vs Sphere ──────────────────────────────────────────────────────────────
function _boxSphereMTV(box, sph, out) {
  // closest point on box AABB to sphere center
  const cx = Math.max(box.x - box.hx, Math.min(box.x + box.hx, sph.x));
  const cy = Math.max(box.y - box.hy, Math.min(box.y + box.hy, sph.y));
  const cz = Math.max(box.z - box.hz, Math.min(box.z + box.hz, sph.z));
  const dx = sph.x - cx, dy = sph.y - cy, dz = sph.z - cz;
  const dist2 = dx*dx + dy*dy + dz*dz;
  if (dist2 >= sph.r * sph.r) return 0;
  const dist  = Math.sqrt(dist2) || 1e-6;
  const depth = sph.r - dist;
  // MTV pushes sphere out of box
  out[0] = dx/dist * depth;
  out[1] = dy/dist * depth;
  out[2] = dz/dist * depth;
  return depth;
}

// ── Velocity response ─────────────────────────────────────────────────────────
// n = collision normal (pointing from b toward a), restitution ∈ [0,1]
function _resolveVelocity(a, b, nx, ny, nz) {
  const e = Math.min(a.restitution, b.restitution);
  // relative velocity along normal
  const rvn = (a.vx - b.vx)*nx + (a.vy - b.vy)*ny + (a.vz - b.vz)*nz;
  if (rvn >= 0) return;   // already separating

  const imA = a.type === 'dynamic' ? 1/a.mass : 0;
  const imB = b.type === 'dynamic' ? 1/b.mass : 0;
  const j   = -(1 + e) * rvn / (imA + imB + 1e-10);

  if (a.type === 'dynamic') { a.vx += j*imA*nx; a.vy += j*imA*ny; a.vz += j*imA*nz; }
  if (b.type === 'dynamic') { b.vx -= j*imB*nx; b.vy -= j*imB*ny; b.vz -= j*imB*nz; }
}

// ── World ──────────────────────────────────────────────────────────────────────
export function physics3d({ gravity = GRAVITY, substeps = 2 } = {}) {
  const _bodies = [];

  // ── Narrowphase dispatch ────────────────────────────────────────────────────
  function _collide(a, b) {
    const mtv = _tmp;   // scratch
    let depth = 0;

    if (a.shape === 'box' && b.shape === 'box') {
      depth = _aabbMTV(a, b, mtv);
      if (!depth) return;
      v3.set(_n, mtv[0], mtv[1], mtv[2]);
      v3.normalize(_n, _n);

    } else if (a.shape === 'sphere' && b.shape === 'sphere') {
      depth = _sphereMTV(a, b, mtv);
      if (!depth) return;
      v3.set(_n, mtv[0], mtv[1], mtv[2]);
      v3.normalize(_n, _n);

    } else {
      // box vs sphere (or swap)
      const isBS = a.shape === 'box';
      const box_ = isBS ? a : b, sph_ = isBS ? b : a;
      depth = _boxSphereMTV(box_, sph_, mtv);
      if (!depth) return;
      // mtv pushes sphere; adjust sign for normal convention
      const sign = isBS ? 1 : -1;
      v3.set(_n, mtv[0]*sign, mtv[1]*sign, mtv[2]*sign);
      v3.normalize(_n, _n);
      // swap mtv direction if b is the sphere
      if (!isBS) { mtv[0]=-mtv[0]; mtv[1]=-mtv[1]; mtv[2]=-mtv[2]; }
    }

    // ── Position correction (split by inverse mass) ──────────────────────────
    const imA = a.type === 'dynamic' ? 1/a.mass : 0;
    const imB = b.type === 'dynamic' ? 1/b.mass : 0;
    const tot = imA + imB;
    if (tot < 1e-10) return;

    const slop = 0.001;   // penetration allowance before correction
    const corr = Math.max(0, depth - slop) / tot * 0.8;

    if (a.type === 'dynamic') {
      a.x += mtv[0]/depth * corr * imA;
      a.y += mtv[1]/depth * corr * imA;
      a.z += mtv[2]/depth * corr * imA;
    }
    if (b.type === 'dynamic') {
      b.x -= mtv[0]/depth * corr * imB;
      b.y -= mtv[1]/depth * corr * imB;
      b.z -= mtv[2]/depth * corr * imB;
    }

    // ── Velocity response ────────────────────────────────────────────────────
    _resolveVelocity(a, b, _n[0], _n[1], _n[2]);

    // ── Ground detection (cheap: MTV mostly upward) ──────────────────────────
    if (_n[1] > 0.7 && a.type === 'dynamic') a.grounded = true;
    if (_n[1] < -0.7 && b.type === 'dynamic') b.grounded = true;

    // wake sleeping bodies
    a._sleepT = 0; b._sleepT = 0;
  }

  // ── Broad phase: sweep-and-prune on X axis ──────────────────────────────────
  // For N < ~200 objects, simple sort + interval overlap is fast enough.
  function _broadPhase(pairs) {
    // sort by AABB min-X
    _bodies.sort((a, b) => (a.x - _halfExt(a)) - (b.x - _halfExt(b)));
    pairs.length = 0;
    for (let i = 0; i < _bodies.length; i++) {
      const a = _bodies[i];
      const aMax = a.x + _halfExt(a);
      for (let j = i+1; j < _bodies.length; j++) {
        const b = _bodies[j];
        if (b.x - _halfExt(b) > aMax) break;   // sorted → no further overlap
        if (a.type === 'static' && b.type === 'static') continue;
        if (a._sleeping && b._sleeping) continue;
        pairs.push(a, b);
      }
    }
  }
  function _halfExt(b) { return b.shape === 'sphere' ? b.r : b.hx; }

  const _pairs = [];

  // ── Public ──────────────────────────────────────────────────────────────────
  const world = {
    get bodies() { return _bodies; },

    // Create and register a body. Returns the body object (mutate freely).
    body({
      shape  = 'box',
      type   = 'dynamic',   // 'dynamic' | 'static' | 'kinematic'
      x=0, y=0, z=0,
      // box half-extents
      hx=0.5, hy=0.5, hz=0.5,
      // sphere radius
      r=0.5,
      mass        = 1,
      restitution = 0.3,
      friction    = 0.5,
      gravityScale = 1,
      // user data
      tag  = '',
      data = null,
    } = {}) {
      const b = {
        shape, type, x, y, z,
        hx, hy, hz, r,
        vx:0, vy:0, vz:0,
        mass, restitution, friction, gravityScale,
        grounded: false,
        _sleeping: false, _sleepT: 0,
        tag, data,
        // convenience AABB for external use
        get minX() { return this.shape==='sphere' ? this.x-this.r : this.x-this.hx; },
        get maxX() { return this.shape==='sphere' ? this.x+this.r : this.x+this.hx; },
        get minY() { return this.shape==='sphere' ? this.y-this.r : this.y-this.hy; },
        get maxY() { return this.shape==='sphere' ? this.y+this.r : this.y+this.hy; },
      };
      _bodies.push(b);
      return b;
    },

    remove(b) {
      const i = _bodies.indexOf(b);
      if (i !== -1) _bodies.splice(i, 1);
    },

    // ── Step ────────────────────────────────────────────────────────────────
    step(dt) {
      const h = dt / substeps;

      for (let sub = 0; sub < substeps; sub++) {
        // integrate velocity + position
        for (const b of _bodies) {
          if (b.type !== 'dynamic') continue;
          if (b._sleeping) continue;

          b.grounded = false;
          b.vy -= gravity * b.gravityScale * h;

          b.x += b.vx * h;
          b.y += b.vy * h;
          b.z += b.vz * h;

          // linear damping (air resistance)
          const damp = Math.pow(0.998, h * 60);
          b.vx *= damp; b.vz *= damp;

          // sleep check
          const v2 = b.vx*b.vx + b.vy*b.vy + b.vz*b.vz;
          if (v2 < SLEEP_VEL*SLEEP_VEL) {
            b._sleepT += h;
            if (b._sleepT > SLEEP_T) b._sleeping = true;
          } else {
            b._sleepT = 0;
            b._sleeping = false;
          }
        }

        // collision
        _broadPhase(_pairs);
        for (let i = 0; i < _pairs.length; i += 2) {
          _collide(_pairs[i], _pairs[i+1]);
        }

        // ground friction
        for (const b of _bodies) {
          if (b.type === 'dynamic' && b.grounded) {
            b.vx *= Math.pow(1 - b.friction, h * 60);
            b.vz *= Math.pow(1 - b.friction, h * 60);
          }
        }
      }
    },

    // ── Raycast ─────────────────────────────────────────────────────────────
    // origin: [x,y,z], dir: normalized [x,y,z]
    // Returns { body, t, nx, ny, nz } of nearest hit, or null.
    raycast(origin, dir, maxLen = 1000) {
      let best = null;
      const ox=origin[0], oy=origin[1], oz=origin[2];
      const dx=dir[0], dy=dir[1], dz=dir[2];

      for (const b of _bodies) {
        let t = Infinity, nx=0, ny=0, nz=0;

        if (b.shape === 'box') {
          // slab method
          const ix = dx!==0?1/dx:Infinity, iy = dy!==0?1/dy:Infinity, iz = dz!==0?1/dz:Infinity;
          const tx1=(b.x-b.hx-ox)*ix, tx2=(b.x+b.hx-ox)*ix;
          const ty1=(b.y-b.hy-oy)*iy, ty2=(b.y+b.hy-oy)*iy;
          const tz1=(b.z-b.hz-oz)*iz, tz2=(b.z+b.hz-oz)*iz;
          const tNx=Math.min(tx1,tx2), tXx=Math.max(tx1,tx2);
          const tNy=Math.min(ty1,ty2), tXy=Math.max(ty1,ty2);
          const tNz=Math.min(tz1,tz2), tXz=Math.max(tz1,tz2);
          const tN=Math.max(tNx,tNy,tNz), tX=Math.min(tXx,tXy,tXz);
          if (tN>tX || tX<0) continue;
          t = tN >= 0 ? tN : tX;
          if (t > maxLen) continue;
          // normal from which axis was last to enter
          if (tN === tNx) { nx = dx<0?1:-1; }
          else if (tN === tNy) { ny = dy<0?1:-1; }
          else                 { nz = dz<0?1:-1; }

        } else {
          // sphere
          const lcx=ox-b.x, lcy=oy-b.y, lcz=oz-b.z;
          const a2 = dx*dx+dy*dy+dz*dz;
          const bk = 2*(dx*lcx+dy*lcy+dz*lcz);
          const c  = lcx*lcx+lcy*lcy+lcz*lcz - b.r*b.r;
          const disc = bk*bk - 4*a2*c;
          if (disc < 0) continue;
          t = (-bk - Math.sqrt(disc)) / (2*a2);
          if (t < 0) t = (-bk + Math.sqrt(disc)) / (2*a2);
          if (t < 0 || t > maxLen) continue;
          nx=(ox+dx*t-b.x)/b.r; ny=(oy+dy*t-b.y)/b.r; nz=(oz+dz*t-b.z)/b.r;
        }

        if (!best || t < best.t) best = { body:b, t, nx, ny, nz };
      }
      return best;
    },

    // Apply impulse to body in world direction
    impulse(b, ix, iy, iz) {
      if (b.type !== 'dynamic') return;
      const im = 1/b.mass;
      b.vx += ix*im; b.vy += iy*im; b.vz += iz*im;
      b._sleeping = false; b._sleepT = 0;
    },

    // Teleport body (no velocity change)
    teleport(b, x, y, z) { b.x=x; b.y=y; b.z=z; b._sleeping=false; b._sleepT=0; },

    clear() { _bodies.length = 0; },
  };

  return world;
}
