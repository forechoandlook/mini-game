// fx — fullscreen canvas 2D effects (no WebGL required)
// All effects operate in screen space; call after cam.end() or in HUD layer.

import { canvas as _canvas } from '../core/canvas.js';

export const fx = {
  // Screen-color flash that fades out as t → 0.
  // t:    current countdown value (e.g. flashTimer)
  // maxT: the value t had when the flash started (controls max alpha)
  // Typical usage:
  //   flashTimer = 0.3;           // set on event
  //   flashTimer -= dt;           // decrement each frame
  //   fx.flash(ctx, flashTimer, 0.3, { color: '#fff' })
  flash(ctx, t, maxT, { color = '#fff', maxAlpha = 0.85 } = {}) {
    if (t <= 0) return;
    ctx.globalAlpha = Math.min(1, (t / maxT) * maxAlpha);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, _canvas.w, _canvas.h);
    ctx.globalAlpha = 1;
  },

  // Dark vignette: radial gradient from transparent center to dark edges.
  // strength: 0 = invisible, 1 = full black edges.
  vignette(ctx, { color = '#000', strength = 0.5 } = {}) {
    const w = _canvas.w, h = _canvas.h;
    const cx = w / 2, cy = h / 2;
    const r  = Math.sqrt(cx * cx + cy * cy);
    const g  = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },

  // CRT-style horizontal scanlines.
  // alpha:   line opacity (0.05–0.2 looks good)
  // spacing: pixels between dark lines (2 = every other row)
  scanlines(ctx, { alpha = 0.1, spacing = 2 } = {}) {
    const w = _canvas.w, h = _canvas.h;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = 0; y < h; y += spacing * 2) ctx.fillRect(0, y, w, spacing);
  },

  // Whole-screen color tint (e.g. red pulse for low health).
  tint(ctx, color, alpha = 0.2) {
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, _canvas.w, _canvas.h);
    ctx.globalAlpha = 1;
  },
};
