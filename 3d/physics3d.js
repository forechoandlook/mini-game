// 3D physics: AABB + Sphere rigid bodies, SoA storage for cache-friendly hot path.
//
// Internal layout: parallel TypedArrays (one slot per body index).
// External API: body handle objects with getters/setters into the arrays.
// Same API as before — existing code needs no changes.
//
// Shapes: 'box' (AABB, no rotation) | 'sphere'
// Types:  'dynamic' | 'static' | 'kinematic'

const GRAVITY   = 20;
const SLEEP_VEL = 0.01;
const SLEEP_T   = 0.5;

// type/shape enums
const T_DYNAMIC   = 0, T_STATIC = 1, T_KINEMATIC = 2;
const S_BOX       = 0, S_SPHERE = 1;
const TYPE_STR    = ['dynamic', 'static', 'kinematic'];
const SHAPE_STR   = ['box', 'sphere'];

// ── Module-level scratch (zero alloc in hot path) ─────────────────────────────
const _mtv = new Float32Array(3);
const _n   = new Float32Array(3);

// ── Collision helpers (operate on raw SoA arrays, indexed by slot i/j) ────────

function _aabbMTV_ii(px, py, pz, hx, hy, hz, ai, bi, out) {
  const dx = px[ai]-px[bi], dy = py[ai]-py[bi], dz = pz[ai]-pz[bi];
  const ox = hx[ai]+hx[bi]-Math.abs(dx);
  const oy = hy[ai]+hy[bi]-Math.abs(dy);
  const oz = hz[ai]+hz[bi]-Math.abs(dz);
  if (ox<=0||oy<=0||oz<=0) return 0;
  if (ox<oy&&ox<oz)      { out[0]=ox*Math.sign(dx); out[1]=0; out[2]=0; return ox; }
  else if (oy<ox&&oy<oz) { out[0]=0; out[1]=oy*Math.sign(dy); out[2]=0; return oy; }
  else                   { out[0]=0; out[1]=0; out[2]=oz*Math.sign(dz); return oz; }
}

function _sphereMTV_ii(px, py, pz, sr, ai, bi, out) {
  const dx=px[ai]-px[bi], dy=py[ai]-py[bi], dz=pz[ai]-pz[bi];
  const rsum = sr[ai]+sr[bi];
  const dist2 = dx*dx+dy*dy+dz*dz;
  if (dist2>=rsum*rsum) return 0;
  const dist = Math.sqrt(dist2)||1e-6;
  const depth = rsum-dist;
  out[0]=dx/dist*depth; out[1]=dy/dist*depth; out[2]=dz/dist*depth;
  return depth;
}

function _boxSphereMTV_ii(px, py, pz, hx, hy, hz, sr, boxi, sphi, out) {
  const cx = Math.max(px[boxi]-hx[boxi], Math.min(px[boxi]+hx[boxi], px[sphi]));
  const cy = Math.max(py[boxi]-hy[boxi], Math.min(py[boxi]+hy[boxi], py[sphi]));
  const cz = Math.max(pz[boxi]-hz[boxi], Math.min(pz[boxi]+hz[boxi], pz[sphi]));
  const dx=px[sphi]-cx, dy=py[sphi]-cy, dz=pz[sphi]-cz;
  const dist2=dx*dx+dy*dy+dz*dz;
  if (dist2>=sr[sphi]*sr[sphi]) return 0;
  const dist=Math.sqrt(dist2)||1e-6;
  const depth=sr[sphi]-dist;
  out[0]=dx/dist*depth; out[1]=dy/dist*depth; out[2]=dz/dist*depth;
  return depth;
}

// ── World factory ──────────────────────────────────────────────────────────────
export function physics3d({ gravity = GRAVITY, substeps = 2, capacity = 512 } = {}) {

  // ── SoA typed arrays (one entry per slot index) ───────────────────────────
  const px = new Float32Array(capacity), py = new Float32Array(capacity), pz = new Float32Array(capacity);
  const vx = new Float32Array(capacity), vy = new Float32Array(capacity), vz = new Float32Array(capacity);
  const hx = new Float32Array(capacity), hy = new Float32Array(capacity), hz = new Float32Array(capacity);
  const sr = new Float32Array(capacity);   // sphere radius
  const ms = new Float32Array(capacity);   // mass
  const rs = new Float32Array(capacity);   // restitution
  const fr = new Float32Array(capacity);   // friction
  const gs = new Float32Array(capacity);   // gravityScale
  const st = new Float32Array(capacity);   // sleepTimer

  // Uint8 flags — tightest possible representation
  const fType    = new Uint8Array(capacity); // T_DYNAMIC / T_STATIC / T_KINEMATIC
  const fShape   = new Uint8Array(capacity); // S_BOX / S_SPHERE
  const fSleep   = new Uint8Array(capacity); // 0/1
  const fGround  = new Uint8Array(capacity); // 0/1
  const fActive  = new Uint8Array(capacity); // 0/1

  // slot management: sequential alloc + free-list for recycle
  let _hwm = 0;  // high-water mark (next fresh slot)
  const _freeSlots = new Int32Array(capacity);
  let _freeTop = 0;

  // handle list for world.bodies iteration (only active handles)
  const _activeHandles = [];

  // broad-phase sort buffer (indices of active slots)
  const _sortBuf = new Int32Array(capacity);
  // collision pair buffer (flat: [i0,j0, i1,j1, ...])
  const _pairs = new Int32Array(capacity * 8);
  let _pairCount = 0;

  // ── Slot alloc/free ────────────────────────────────────────────────────────
  function _alloc() {
    if (_freeTop > 0) return _freeSlots[--_freeTop];
    if (_hwm >= capacity) throw new Error('[physics3d] capacity exceeded: ' + capacity);
    return _hwm++;
  }

  // ── Handle factory — one object per slot, reused across the body's lifetime ─
  function _makeHandle(i) {
    return {
      // position
      get x()  { return px[i]; }, set x(v)  { px[i]=v; },
      get y()  { return py[i]; }, set y(v)  { py[i]=v; },
      get z()  { return pz[i]; }, set z(v)  { pz[i]=v; },
      // velocity
      get vx() { return vx[i]; }, set vx(v) { vx[i]=v; },
      get vy() { return vy[i]; }, set vy(v) { vy[i]=v; },
      get vz() { return vz[i]; }, set vz(v) { vz[i]=v; },
      // box half-extents
      get hx() { return hx[i]; }, set hx(v) { hx[i]=v; },
      get hy() { return hy[i]; }, set hy(v) { hy[i]=v; },
      get hz() { return hz[i]; }, set hz(v) { hz[i]=v; },
      // sphere radius
      get r()  { return sr[i]; }, set r(v)  { sr[i]=v; },
      // physical properties
      get mass()         { return ms[i]; }, set mass(v)         { ms[i]=v; },
      get restitution()  { return rs[i]; }, set restitution(v)  { rs[i]=v; },
      get friction()     { return fr[i]; }, set friction(v)     { fr[i]=v; },
      get gravityScale() { return gs[i]; }, set gravityScale(v) { gs[i]=v; },
      // flags (read-only from outside)
      get type()     { return TYPE_STR[fType[i]]; },
      get shape()    { return SHAPE_STR[fShape[i]]; },
      get _sleeping(){ return fSleep[i]===1; },
      get grounded() { return fGround[i]===1; },
      // AABB bounds (convenience for external queries)
      get minX() { return fShape[i]===S_SPHERE ? px[i]-sr[i] : px[i]-hx[i]; },
      get maxX() { return fShape[i]===S_SPHERE ? px[i]+sr[i] : px[i]+hx[i]; },
      get minY() { return fShape[i]===S_SPHERE ? py[i]-sr[i] : py[i]-hy[i]; },
      get maxY() { return fShape[i]===S_SPHERE ? py[i]+sr[i] : py[i]+hy[i]; },
      _i: i,   // slot index (internal use)
      tag: '',
      data: null,
    };
  }

  // ── Narrow-phase collision (operates on slot indices) ─────────────────────
  function _collide(ai, bi) {
    const shA = fShape[ai], shB = fShape[bi];
    let depth = 0;

    if (shA===S_BOX && shB===S_BOX) {
      depth = _aabbMTV_ii(px,py,pz,hx,hy,hz, ai,bi, _mtv);
      if (!depth) return;

    } else if (shA===S_SPHERE && shB===S_SPHERE) {
      depth = _sphereMTV_ii(px,py,pz,sr, ai,bi, _mtv);
      if (!depth) return;

    } else {
      // box vs sphere — normalise so boxi < sphi in shape terms
      const isBS = shA===S_BOX;
      const boxi = isBS ? ai : bi, sphi = isBS ? bi : ai;
      depth = _boxSphereMTV_ii(px,py,pz,hx,hy,hz,sr, boxi,sphi, _mtv);
      if (!depth) return;
      if (!isBS) { _mtv[0]=-_mtv[0]; _mtv[1]=-_mtv[1]; _mtv[2]=-_mtv[2]; }
    }

    // normalise mtv → collision normal
    const il = 1 / (depth || 1e-6);
    _n[0]=_mtv[0]*il; _n[1]=_mtv[1]*il; _n[2]=_mtv[2]*il;

    const tA = fType[ai], tB = fType[bi];
    const imA = tA===T_DYNAMIC ? 1/ms[ai] : 0;
    const imB = tB===T_DYNAMIC ? 1/ms[bi] : 0;
    const tot = imA+imB;
    if (tot < 1e-10) return;

    // position correction (Baumgarte)
    const corr = Math.max(0, depth-0.001) / tot * 0.8;
    if (tA===T_DYNAMIC) { px[ai]+=_mtv[0]*imA*corr/depth; py[ai]+=_mtv[1]*imA*corr/depth; pz[ai]+=_mtv[2]*imA*corr/depth; }
    if (tB===T_DYNAMIC) { px[bi]-=_mtv[0]*imB*corr/depth; py[bi]-=_mtv[1]*imB*corr/depth; pz[bi]-=_mtv[2]*imB*corr/depth; }

    // velocity response (impulse)
    const e   = Math.min(rs[ai], rs[bi]);
    const rvn = (vx[ai]-vx[bi])*_n[0] + (vy[ai]-vy[bi])*_n[1] + (vz[ai]-vz[bi])*_n[2];
    if (rvn < 0) {
      const j = -(1+e)*rvn / (tot+1e-10);
      if (tA===T_DYNAMIC) { vx[ai]+=j*imA*_n[0]; vy[ai]+=j*imA*_n[1]; vz[ai]+=j*imA*_n[2]; }
      if (tB===T_DYNAMIC) { vx[bi]-=j*imB*_n[0]; vy[bi]-=j*imB*_n[1]; vz[bi]-=j*imB*_n[2]; }
    }

    // ground detection
    if (_n[1] > 0.7  && tA===T_DYNAMIC) fGround[ai]=1;
    if (_n[1] < -0.7 && tB===T_DYNAMIC) fGround[bi]=1;

    // wake on collision
    st[ai]=0; st[bi]=0;
  }

  // ── Broad phase: sort active indices by minX, sweep for pairs ─────────────
  function _broadPhase() {
    // collect active slots into sort buffer
    let n = 0;
    for (let i = 0; i < _hwm; i++) {
      if (fActive[i]) _sortBuf[n++] = i;
    }

    // sort index buffer by minX (insertion sort — nearly-sorted each frame)
    for (let k = 1; k < n; k++) {
      const idx = _sortBuf[k];
      const key = fShape[idx]===S_SPHERE ? px[idx]-sr[idx] : px[idx]-hx[idx];
      let m = k-1;
      while (m >= 0) {
        const mi = _sortBuf[m];
        if ((fShape[mi]===S_SPHERE ? px[mi]-sr[mi] : px[mi]-hx[mi]) <= key) break;
        _sortBuf[m+1] = _sortBuf[m];
        m--;
      }
      _sortBuf[m+1] = idx;
    }

    // sweep for overlapping X intervals
    _pairCount = 0;
    for (let a = 0; a < n; a++) {
      const ai = _sortBuf[a];
      const aMaxX = fShape[ai]===S_SPHERE ? px[ai]+sr[ai] : px[ai]+hx[ai];
      for (let b = a+1; b < n; b++) {
        const bi = _sortBuf[b];
        const bMinX = fShape[bi]===S_SPHERE ? px[bi]-sr[bi] : px[bi]-hx[bi];
        if (bMinX > aMaxX) break;
        if (fType[ai]===T_STATIC && fType[bi]===T_STATIC) continue;
        if (fSleep[ai] && fSleep[bi]) continue;
        if (_pairCount+2 > _pairs.length) break; // safety
        _pairs[_pairCount++] = ai;
        _pairs[_pairCount++] = bi;
      }
    }
  }

  // ── World public API ───────────────────────────────────────────────────────
  const world = {

    get bodies() { return _activeHandles; },

    body({
      shape        = 'box',
      type         = 'dynamic',
      x=0, y=0, z=0,
      hx: ihx=0.5, hy: ihy=0.5, hz: ihz=0.5,
      r=0.5,
      mass        = 1,
      restitution = 0.3,
      friction    = 0.5,
      gravityScale = 1,
      tag  = '',
      data = null,
    } = {}) {
      const i = _alloc();
      fActive[i] = 1;
      fType[i]   = TYPE_STR.indexOf(type) < 0 ? T_DYNAMIC : TYPE_STR.indexOf(type);
      fShape[i]  = shape === 'sphere' ? S_SPHERE : S_BOX;
      fSleep[i]  = 0;
      fGround[i] = 0;
      px[i]=x; py[i]=y; pz[i]=z;
      vx[i]=0; vy[i]=0; vz[i]=0;
      hx[i]=ihx; hy[i]=ihy; hz[i]=ihz;
      sr[i]=r;
      ms[i]=mass; rs[i]=restitution; fr[i]=friction; gs[i]=gravityScale;
      st[i]=0;

      const h = _makeHandle(i);
      h.tag  = tag;
      h.data = data;
      _activeHandles.push(h);
      return h;
    },

    remove(handle) {
      const i = handle._i;
      if (!fActive[i]) return;
      fActive[i] = 0;
      _freeSlots[_freeTop++] = i;
      const idx = _activeHandles.indexOf(handle);
      if (idx !== -1) _activeHandles.splice(idx, 1);
    },

    step(dt) {
      const h    = dt / substeps;
      const airDamp = Math.pow(0.998, h * 60);

      for (let sub = 0; sub < substeps; sub++) {

        // ── Integrate ─────────────────────────────────────────────────────────
        for (let i = 0; i < _hwm; i++) {
          if (!fActive[i] || fType[i] !== T_DYNAMIC || fSleep[i]) continue;

          fGround[i] = 0;
          vy[i] -= gravity * gs[i] * h;
          px[i] += vx[i] * h;
          py[i] += vy[i] * h;
          pz[i] += vz[i] * h;
          vx[i] *= airDamp;
          vz[i] *= airDamp;

          const v2 = vx[i]*vx[i] + vy[i]*vy[i] + vz[i]*vz[i];
          if (v2 < SLEEP_VEL*SLEEP_VEL) {
            st[i] += h;
            if (st[i] > SLEEP_T) fSleep[i] = 1;
          } else {
            st[i] = 0;
            fSleep[i] = 0;
          }
        }

        // ── Collision ─────────────────────────────────────────────────────────
        _broadPhase();
        for (let k = 0; k < _pairCount; k += 2) {
          _collide(_pairs[k], _pairs[k+1]);
        }

        // ── Ground friction ───────────────────────────────────────────────────
        for (let i = 0; i < _hwm; i++) {
          if (fActive[i] && fType[i]===T_DYNAMIC && fGround[i]) {
            const f = Math.pow(1-fr[i], h*60);
            vx[i] *= f; vz[i] *= f;
          }
        }
      }
    },

    raycast(origin, dir, maxLen = 1000) {
      let best = null;
      const ox=origin[0], oy=origin[1], oz=origin[2];
      const dx=dir[0], dy=dir[1], dz=dir[2];

      for (let i = 0; i < _hwm; i++) {
        if (!fActive[i]) continue;
        let t=Infinity, nx=0, ny=0, nz=0;

        if (fShape[i]===S_BOX) {
          const ix=dx?1/dx:Infinity, iy=dy?1/dy:Infinity, iz=dz?1/dz:Infinity;
          const tx1=(px[i]-hx[i]-ox)*ix, tx2=(px[i]+hx[i]-ox)*ix;
          const ty1=(py[i]-hy[i]-oy)*iy, ty2=(py[i]+hy[i]-oy)*iy;
          const tz1=(pz[i]-hz[i]-oz)*iz, tz2=(pz[i]+hz[i]-oz)*iz;
          const tNx=Math.min(tx1,tx2), tXx=Math.max(tx1,tx2);
          const tNy=Math.min(ty1,ty2), tXy=Math.max(ty1,ty2);
          const tNz=Math.min(tz1,tz2), tXz=Math.max(tz1,tz2);
          const tN=Math.max(tNx,tNy,tNz), tX=Math.min(tXx,tXy,tXz);
          if (tN>tX||tX<0) continue;
          t=tN>=0?tN:tX;
          if (t>maxLen) continue;
          if (tN===tNx)      { nx=dx<0?1:-1; }
          else if (tN===tNy) { ny=dy<0?1:-1; }
          else               { nz=dz<0?1:-1; }
        } else {
          const lcx=ox-px[i], lcy=oy-py[i], lcz=oz-pz[i];
          const a2=dx*dx+dy*dy+dz*dz;
          const bk=2*(dx*lcx+dy*lcy+dz*lcz);
          const c=lcx*lcx+lcy*lcy+lcz*lcz-sr[i]*sr[i];
          const disc=bk*bk-4*a2*c;
          if (disc<0) continue;
          t=(-bk-Math.sqrt(disc))/(2*a2);
          if (t<0) t=(-bk+Math.sqrt(disc))/(2*a2);
          if (t<0||t>maxLen) continue;
          nx=(ox+dx*t-px[i])/sr[i]; ny=(oy+dy*t-py[i])/sr[i]; nz=(oz+dz*t-pz[i])/sr[i];
        }

        if (!best||t<best.t) best={body:_activeHandles.find(h=>h._i===i), t, nx, ny, nz};
      }
      return best;
    },

    impulse(handle, ix, iy, iz) {
      const i = handle._i;
      if (!fActive[i] || fType[i]!==T_DYNAMIC) return;
      const im = 1/ms[i];
      vx[i]+=ix*im; vy[i]+=iy*im; vz[i]+=iz*im;
      fSleep[i]=0; st[i]=0;
    },

    teleport(handle, x, y, z) {
      const i = handle._i;
      px[i]=x; py[i]=y; pz[i]=z;
      fSleep[i]=0; st[i]=0;
    },

    clear() {
      for (let i = 0; i < _hwm; i++) fActive[i]=0;
      _hwm=0; _freeTop=0;
      _activeHandles.length=0;
    },
  };

  return world;
}
