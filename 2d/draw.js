// draw — canvas 2D primitive helpers
// All functions take ctx as first arg and an opts object last.
// They restore globalAlpha when done so callers don't need save/restore for alpha alone.

const TAU = Math.PI * 2;

function _alpha(ctx, a, fn) {
  if (a !== 1) ctx.globalAlpha = a;
  fn();
  if (a !== 1) ctx.globalAlpha = 1;
}

export const draw = {
  // Filled or stroked rectangle, with optional rotation around its center.
  rect(ctx, x, y, w, h, {
    color = '#fff', alpha = 1, angle = 0,
    outline = false, lineWidth = 1,
  } = {}) {
    _alpha(ctx, alpha, () => {
      if (angle) {
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(angle);
        if (outline) { ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.strokeRect(-w / 2, -h / 2, w, h); }
        else          { ctx.fillStyle = color;   ctx.fillRect(-w / 2, -h / 2, w, h); }
        ctx.restore();
      } else {
        if (outline) { ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.strokeRect(x, y, w, h); }
        else          { ctx.fillStyle = color;   ctx.fillRect(x, y, w, h); }
      }
    });
  },

  // Filled or stroked circle.
  circle(ctx, x, y, r, {
    color = '#fff', alpha = 1,
    outline = false, lineWidth = 1,
  } = {}) {
    _alpha(ctx, alpha, () => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      if (outline) { ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke(); }
      else          { ctx.fillStyle = color;   ctx.fill(); }
    });
  },

  // Polygon defined by an array of angles (radians) at radius r around (x, y).
  // rotation adds to all angles. Useful for asteroids, stars, custom shapes.
  poly(ctx, x, y, angles, r, rotation = 0, {
    color = '#fff', alpha = 1,
    fill = false, lineWidth = 1.5,
  } = {}) {
    _alpha(ctx, alpha, () => {
      ctx.beginPath();
      for (let i = 0; i < angles.length; i++) {
        const a = angles[i] + rotation;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (fill) { ctx.fillStyle = color; ctx.fill(); }
      else       { ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke(); }
    });
  },

  // Line segment.
  line(ctx, x1, y1, x2, y2, { color = '#fff', alpha = 1, lineWidth = 1 } = {}) {
    _alpha(ctx, alpha, () => {
      ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
  },

  // Sprite (HTMLImageElement) at (x, y) with transform.
  // ox/oy: origin offset in pixels, default = image center.
  // flipX/flipY: mirror horizontally/vertically.
  sprite(ctx, img, x, y, {
    angle = 0, scaleX = 1, scaleY = 1, alpha = 1,
    ox, oy, flipX = false, flipY = false,
  } = {}) {
    const iw = img.width, ih = img.height;
    const pivotX = ox ?? iw / 2;
    const pivotY = oy ?? ih / 2;
    _alpha(ctx, alpha, () => {
      ctx.save();
      ctx.translate(x, y);
      if (angle)                   ctx.rotate(angle);
      if (scaleX !== 1 || scaleY !== 1 || flipX || flipY)
        ctx.scale(scaleX * (flipX ? -1 : 1), scaleY * (flipY ? -1 : 1));
      ctx.drawImage(img, -pivotX, -pivotY, iw, ih);
      ctx.restore();
    });
  },
};
