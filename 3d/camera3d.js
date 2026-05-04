// 3D camera: FPS-style (yaw/pitch) and orbit mode
// Outputs view + projection matrices for the renderer.
// No allocation in update() — all scratch space pre-allocated.

import { m4, v3, DEG } from './math.js';

export function camera3d({
  fov    = 60 * DEG,
  near   = 0.1,
  far    = 1000,
  aspect = 16 / 9,
  mode   = 'fps',      // 'fps' | 'orbit'
} = {}) {
  const pos    = v3.new(0, 1, 5);
  const target = v3.new(0, 0, 0);   // orbit: look-at target
  const up     = v3.new(0, 1, 0);

  // FPS: yaw (Y) and pitch (X) Euler angles in radians
  let _yaw   = 0;
  let _pitch = 0;
  let _orbitDist = 5;

  // pre-allocated matrices
  const _view = m4.new();
  const _proj = m4.new();
  const _fwd  = v3.new();
  const _right = v3.new();
  const _tmp   = v3.new();

  function _rebuildView() {
    if (mode === 'fps') {
      // from yaw+pitch → forward vector
      const cosPitch = Math.cos(_pitch);
      _fwd[0] = Math.sin(_yaw) * cosPitch;
      _fwd[1] = Math.sin(_pitch);
      _fwd[2] = -Math.cos(_yaw) * cosPitch;
      v3.add(_tmp, pos, _fwd);
      m4.lookAt(_view, pos, _tmp, up);
    } else {
      // orbit: pos derived from yaw/pitch/dist around target
      const cosPitch = Math.cos(_pitch);
      pos[0] = target[0] + Math.sin(_yaw) * cosPitch * _orbitDist;
      pos[1] = target[1] + Math.sin(_pitch) * _orbitDist;
      pos[2] = target[2] + Math.cos(_yaw) * cosPitch * _orbitDist;
      m4.lookAt(_view, pos, target, up);
    }
  }

  _rebuildView();
  m4.perspective(_proj, fov, aspect, near, far);

  const cam = {
    get view()   { return _view; },
    get proj()   { return _proj; },
    get pos()    { return pos; },
    get forward(){ return _fwd; },
    get yaw()    { return _yaw; }  ,
    get pitch()  { return _pitch; },

    // ── FPS movement ──────────────────────────────────────────────────────────
    // Call from update(dt) with input axis values
    moveFPS({ moveX = 0, moveZ = 0, moveY = 0, speed = 5, dt = 1/60 }) {
      // forward (ignore pitch for ground-plane movement)
      const flatFwd = v3.new(Math.sin(_yaw), 0, -Math.cos(_yaw));
      v3.cross(_right, flatFwd, up);
      v3.normalize(_right, _right);

      v3.scale(_tmp, flatFwd, -moveZ * speed * dt);
      v3.add(pos, pos, _tmp);
      v3.scale(_tmp, _right, moveX * speed * dt);
      v3.add(pos, pos, _tmp);
      pos[1] += moveY * speed * dt;

      _rebuildView();
    },

    // mouse delta → rotate
    rotateFPS(dx, dy, sensitivity = 0.002) {
      _yaw   += dx * sensitivity;
      _pitch -= dy * sensitivity;
      _pitch  = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, _pitch));
      _rebuildView();
    },

    // ── Orbit control ─────────────────────────────────────────────────────────
    orbit(dx, dy, sensitivity = 0.005) {
      _yaw   += dx * sensitivity;
      _pitch -= dy * sensitivity;
      _pitch  = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, _pitch));
      _rebuildView();
    },

    zoom(delta, factor = 0.1) {
      _orbitDist = Math.max(0.5, _orbitDist + delta * factor * _orbitDist);
      _rebuildView();
    },

    setOrbitTarget(x, y, z)  { target[0]=x; target[1]=y; target[2]=z; _rebuildView(); },
    setPos(x, y, z)          { pos[0]=x; pos[1]=y; pos[2]=z; _rebuildView(); },
    lookAt(x, y, z)          { v3.set(target,x,y,z); mode='orbit'; _rebuildView(); },

    setAspect(a) { m4.perspective(_proj, fov, a, near, far); },
    setFov(f)    { m4.perspective(_proj, f, aspect, near, far); },

    // world position from NDC (for mouse picking ray)
    rayFromScreen(ndcX, ndcY) {
      // unproject two points at z=-1 and z=1 in clip space
      const invVP = m4.new();
      const tmp   = m4.new();
      m4.mul(tmp, _proj, _view);
      m4.invert(invVP, tmp);

      const near4 = [ndcX, ndcY, -1, 1];
      const far4  = [ndcX, ndcY,  1, 1];

      function unproj(v) {
        const m = invVP;
        const x = m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3];
        const y = m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3];
        const z = m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3];
        const w = m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3];
        return v3.new(x/w, y/w, z/w);
      }

      const nPt = unproj(near4);
      const fPt = unproj(far4);
      const dir = v3.new();
      v3.normalize(dir, v3.sub(dir, fPt, nPt));
      return { origin: v3.copy(v3.new(), pos), dir };
    },
  };

  return cam;
}
