// Canvas HUD: health bar, score, stamina bar, icon badge
// Drawn in screen-space (after cam.end), not affected by camera transform.
// Usage:
//   hud.bar(ctx, x, y, w, h, value, max, { color, bg, border })
//   hud.text(ctx, str, x, y, { font, color, align, shadow })
//   hud.icon(ctx, img, x, y, { size, label })
//   hud.score(ctx, value, x, y, { digits, color })

const DEFAULTS = {
  bar: {
    color: '#4caf50', bg: '#1a1a1a', border: '#333',
    radius: 2, borderWidth: 1,
  },
  text: {
    font: '12px monospace', color: '#fff', align: 'left',
    shadow: null,  // e.g. { color: '#000', blur: 2, ox: 1, oy: 1 }
  },
};

export const hud = {
  // Filled bar (health, stamina, xp…)
  bar(ctx, x, y, w, h, value, max, opts = {}) {
    const { color, bg, border, radius, borderWidth } = { ...DEFAULTS.bar, ...opts };
    const fill = Math.max(0, Math.min(1, value / max));

    // background
    ctx.fillStyle = bg;
    _roundRect(ctx, x, y, w, h, radius);
    ctx.fill();

    // fill
    if (fill > 0) {
      ctx.fillStyle = color;
      _roundRect(ctx, x, y, Math.round(w * fill), h, radius);
      ctx.fill();
    }

    // border
    if (borderWidth > 0) {
      ctx.strokeStyle = border;
      ctx.lineWidth = borderWidth;
      _roundRect(ctx, x, y, w, h, radius);
      ctx.stroke();
    }
  },

  // Segmented bar (e.g. lives as pips)
  pips(ctx, x, y, size, gap, count, filled, { color = '#e53935', bg = '#333' } = {}) {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = i < filled ? color : bg;
      ctx.beginPath();
      ctx.arc(x + i * (size + gap) + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // Text with optional drop shadow
  text(ctx, str, x, y, opts = {}) {
    const { font, color, align, shadow } = { ...DEFAULTS.text, ...opts };
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = opts.baseline ?? 'top';
    if (shadow) {
      ctx.fillStyle = shadow.color ?? '#000';
      ctx.shadowBlur = shadow.blur ?? 0;
      ctx.fillText(str, x + (shadow.ox ?? 1), y + (shadow.oy ?? 1));
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  },

  // Zero-padded score number
  score(ctx, value, x, y, { digits = 6, color = '#fff', font = '14px monospace' } = {}) {
    const str = String(Math.floor(value)).padStart(digits, '0');
    hud.text(ctx, str, x, y, { font, color, align: 'right' });
  },

  // Sprite icon + optional label beneath
  icon(ctx, img, x, y, { size = 20, label = null, labelColor = '#ccc' } = {}) {
    ctx.drawImage(img, x, y, size, size);
    if (label) hud.text(ctx, label, x + size / 2, y + size + 2, { color: labelColor, align: 'center' });
  },

  // Fade-in/out overlay (for scene transitions)
  fade(ctx, alpha, { color = '#000', w, h } = {}) {
    if (alpha <= 0) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w ?? ctx.canvas.width, h ?? ctx.canvas.height);
    ctx.globalAlpha = 1;
  },
};

function _roundRect(ctx, x, y, w, h, r) {
  if (r === 0) { ctx.rect(x, y, w, h); return; }
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
