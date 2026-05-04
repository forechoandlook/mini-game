// 2D camera: follow target, bounds clamp, screen shake, zoom
// Usage:
//   const cam = camera({ w: 480, h: 270 })
//   cam.follow(player)                    // set follow target {x,y,w?,h?}
//   cam.update(dt)
//   cam.begin(ctx)                        // ctx.save + translate
//     // draw world-space objects here
//   cam.end(ctx)                          // ctx.restore
//   cam.shake(0.4, 6)                     // duration(s), magnitude(px)
//   cam.worldToScreen(wx, wy)             // → {x, y}
//   cam.screenToWorld(sx, sy)             // → {x, y}

import { signal } from '../../mini-react/src/core.js';

export function camera({
  w,                    // viewport width (canvas logical width)
  h,                    // viewport height
  lerp      = 0.1,     // follow smoothing 0=instant 1=never
  bounds    = null,     // { x, y, w, h } world bounds to clamp within, or null
  zoom      = 1,
} = {}) {
  // current camera center in world space (reactive for minimap etc.)
  const pos = { x: w / 2, y: h / 2 };
  // signals so minimap/HUD can bind reactively
  const xSig = signal(pos.x);
  const ySig = signal(pos.y);

  let _target  = null;
  let _shakeT  = 0, _shakeMag = 0;
  let _shakeOx = 0, _shakeOy = 0;
  let _zoom    = zoom;

  function _clamp() {
    if (!bounds) return;
    const hw = (w / _zoom) / 2, hh = (h / _zoom) / 2;
    pos.x = Math.max(bounds.x + hw, Math.min(bounds.x + bounds.w - hw, pos.x));
    pos.y = Math.max(bounds.y + hh, Math.min(bounds.y + bounds.h - hh, pos.y));
  }

  const cam = {
    get x() { return pos.x; },
    get y() { return pos.y; },
    // reactive signals for HUD/minimap binding
    get xSig() { return xSig; },
    get ySig() { return ySig; },
    get zoom() { return _zoom; },
    set zoom(v) { _zoom = v; },

    follow(target) { _target = target; },

    update(dt) {
      if (_target) {
        const tx = (_target.x ?? 0) + (_target.w ?? 0) / 2;
        const ty = (_target.y ?? 0) + (_target.h ?? 0) / 2;
        const k = 1 - Math.pow(lerp, dt * 60);  // frame-rate independent lerp
        pos.x += (tx - pos.x) * k;
        pos.y += (ty - pos.y) * k;
      }
      _clamp();

      if (_shakeT > 0) {
        _shakeT -= dt;
        const mag = _shakeMag * (_shakeT > 0 ? _shakeT / (_shakeT + dt) : 0);
        _shakeOx = (Math.random() * 2 - 1) * mag;
        _shakeOy = (Math.random() * 2 - 1) * mag;
      } else {
        _shakeOx = _shakeOy = 0;
      }

      xSig.value = pos.x;
      ySig.value = pos.y;
    },

    begin(ctx) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      if (_zoom !== 1) ctx.scale(_zoom, _zoom);
      ctx.translate(
        -pos.x + _shakeOx,
        -pos.y + _shakeOy
      );
    },

    end(ctx) { ctx.restore(); },

    shake(duration = 0.3, magnitude = 5) {
      _shakeT   = duration;
      _shakeMag = magnitude;
    },

    worldToScreen(wx, wy) {
      return {
        x: (wx - pos.x) * _zoom + w / 2 + _shakeOx,
        y: (wy - pos.y) * _zoom + h / 2 + _shakeOy,
      };
    },

    screenToWorld(sx, sy) {
      return {
        x: (sx - w / 2) / _zoom + pos.x,
        y: (sy - h / 2) / _zoom + pos.y,
      };
    },

    // visible rect in world space (for frustum culling)
    get viewport() {
      const hw = (w / _zoom) / 2, hh = (h / _zoom) / 2;
      return { x: pos.x - hw, y: pos.y - hh, w: w / _zoom, h: h / _zoom };
    },

    setBounds(b) { bounds = b; _clamp(); },
    teleport(wx, wy) { pos.x = wx; pos.y = wy; _clamp(); },
  };

  return cam;
}
