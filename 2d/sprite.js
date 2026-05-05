// Sprite & SpriteSheet animation
// Usage:
//   const sheet = spriteSheet(img, 16, 16)           // each frame 16×16
//   const anim  = sheet.anim('run', [0,1,2,3], 8)    // 4 frames @ 8fps
//   anim.update(dt)
//   anim.draw(ctx, x, y)
//   anim.draw(ctx, x, y, { flipX: true, scale: 2 })

export function spriteSheet(img, fw, fh) {
  const cols = Math.floor(img.width  / fw);
  const rows = Math.floor(img.height / fh);

  // draw a single frame at (x, y) — top-left anchor by default.
  // angle rotates around the frame center; flipX/flipY mirror before rotation.
  function drawFrame(ctx, frame, x, y, {
    flipX = false, flipY = false,
    scale = 1, alpha = 1, angle = 0,
  } = {}) {
    const col = frame % cols;
    const row = Math.floor(frame / cols);
    const dw = fw * scale, dh = fh * scale;

    ctx.save();
    if (alpha !== 1) ctx.globalAlpha = alpha;

    if (angle || flipX || flipY) {
      ctx.translate(Math.round(x + dw / 2), Math.round(y + dh / 2));
      if (angle) ctx.rotate(angle);
      if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.drawImage(img, col * fw, row * fh, fw, fh, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.drawImage(img, col * fw, row * fh, fw, fh, Math.round(x), Math.round(y), dw, dh);
    }
    ctx.restore();
  }

  return {
    fw, fh, cols, rows, img,

    drawFrame,

    // create a named animation
    anim(name, frames, fps = 12) {
      let _t = 0, _frame = 0, _loop = true, _done = false, _opts = {};

      const self = {
        name,
        update(dt) {
          if (_done && !_loop) return;
          _t += dt;
          const spf = 1 / fps;
          while (_t >= spf) {
            _t -= spf;
            _frame++;
            if (_frame >= frames.length) {
              if (_loop) { _frame = 0; }
              else       { _frame = frames.length - 1; _done = true; }
            }
          }
        },

        draw(ctx, x, y, opts = {}) {
          drawFrame(ctx, frames[_frame], x, y, { ..._opts, ...opts });
        },

        reset()       { _t = 0; _frame = 0; _done = false; return self; },
        setLoop(v)    { _loop = v; return self; },
        setOpts(o)    { _opts = o; return self; },
        get done()    { return _done; },
        get frameIdx(){ return _frame; },
      };

      return self;
    },
  };
}

// Simple static sprite (no sheet)
export function sprite(img, { ox = 0, oy = 0 } = {}) {
  return {
    draw(ctx, x, y, { flipX = false, flipY = false, scale = 1, alpha = 1, angle = 0 } = {}) {
      const dw = img.width * scale, dh = img.height * scale;
      ctx.save();
      if (alpha !== 1) ctx.globalAlpha = alpha;
      if (angle || flipX || flipY) {
        ctx.translate(Math.round(x - ox + dw/2), Math.round(y - oy + dh/2));
        if (angle) ctx.rotate(angle);
        if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        ctx.drawImage(img, -dw/2, -dh/2, dw, dh);
      } else {
        ctx.drawImage(img, Math.round(x - ox), Math.round(y - oy), dw, dh);
      }
      ctx.restore();
    },
    img, ox, oy,
  };
}
