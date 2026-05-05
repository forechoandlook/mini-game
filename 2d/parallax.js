// Parallax background — multiple layers scrolling at different speeds.
//
// Usage:
//   const bg = parallax([
//     { img: assets.get('sky'),   speedX: 0,    speedY: 0    }, // static sky
//     { img: assets.get('hills'), speedX: 0.2,  speedY: 0    }, // slow hills
//     { img: assets.get('trees'), speedX: 0.5,  speedY: 0    }, // faster trees
//   ]);
//   // in render, before cam.begin():
//   bg.render(ctx, cam);
//
// speedX/speedY: fraction of camera movement applied to this layer (0=fixed, 1=world-space).
// Each image tiles horizontally (and vertically if tileY:true).

export function parallax(layers = []) {
  return {
    render(ctx, cam) {
      const cx = cam.x - cam.viewport.w / 2;  // camera left edge in world space
      const cy = cam.y - cam.viewport.h / 2;

      for (const layer of layers) {
        const { img, speedX = 0.5, speedY = 0, tileY = false, alpha = 1 } = layer;
        if (!img) continue;

        const iw = img.width, ih = img.height;
        const ox = cx * speedX;
        const oy = cy * speedY;

        if (alpha !== 1) ctx.globalAlpha = alpha;

        if (tileY) {
          // tile both axes
          const startX = -((ox % iw) + iw) % iw;
          const startY = -((oy % ih) + ih) % ih;
          for (let y = startY; y < cam.viewport.h; y += ih)
            for (let x = startX; x < cam.viewport.w; x += iw)
              ctx.drawImage(img, x, y);
        } else {
          // tile horizontally only, anchor vertically
          const startX = -((ox % iw) + iw) % iw;
          const drawY  = layer.y ?? 0;
          for (let x = startX; x < cam.viewport.w; x += iw)
            ctx.drawImage(img, x, drawY);
        }

        if (alpha !== 1) ctx.globalAlpha = 1;
      }
    },
  };
}
