// Tilemap: parse Tiled JSON or inline grid, render, collision extraction
// Supports multiple layers, animated tiles, camera-culled rendering.
//
// Usage (inline):
//   const map = tilemap({ tileW:16, tileH:16, img })
//   map.loadGrid([ [1,1,1], [0,0,1], [0,0,1] ])
//   map.render(ctx, cam)
//   const solids = map.solidRects()  // → [{x,y,w,h}] for physics
//
// Usage (Tiled JSON):
//   const map = tilemap({ tileW:16, tileH:16, img })
//   map.loadTiled(json)
//   map.render(ctx, cam)

export function tilemap({ tileW = 16, tileH = 16, img = null, solidIds = null } = {}) {
  // solidIds: Set or null (null = all non-zero are solid)
  const _solid = solidIds instanceof Set ? solidIds : null;

  let _layers  = [];   // [{name, grid, opacity, visible}]
  let _mapW    = 0, _mapH = 0;
  let _animated = new Map();  // tileId → { frames:[{id,duration}], t:0, cur:0 }

  function _isSolid(id) {
    if (id === 0) return false;
    return _solid ? _solid.has(id) : true;
  }

  // draw one tile (id 1-based, row-major in spritesheet)
  function _drawTile(ctx, id, px, py) {
    if (!img || id === 0) return;
    const anim = _animated.get(id);
    const draw = anim ? anim.frames[anim.cur].id : id;
    const idx  = draw - 1;
    const cols = Math.floor(img.width / tileW);
    const sx   = (idx % cols) * tileW;
    const sy   = Math.floor(idx / cols) * tileH;
    ctx.drawImage(img, sx, sy, tileW, tileH, px, py, tileW, tileH);
  }

  const map = {
    tileW, tileH,
    get mapW() { return _mapW; },
    get mapH() { return _mapH; },
    get worldW() { return _mapW * tileW; },
    get worldH() { return _mapH * tileH; },

    // ── Load ──────────────────────────────────────────────────────────────────
    loadGrid(grid, { name = 'base', opacity = 1 } = {}) {
      _mapH = grid.length;
      _mapW = grid[0]?.length ?? 0;
      _layers.push({ name, grid, opacity, visible: true });
      return map;
    },

    loadTiled(json) {
      _mapW = json.width;
      _mapH = json.height;
      for (const layer of json.layers ?? []) {
        if (layer.type !== 'tilelayer') continue;
        // Tiled stores data as flat array, convert to 2D
        const grid = [];
        for (let r = 0; r < _mapH; r++) {
          grid.push(layer.data.slice(r * _mapW, (r + 1) * _mapW));
        }
        _layers.push({ name: layer.name, grid, opacity: layer.opacity ?? 1, visible: layer.visible !== false });
      }

      // parse animated tiles from tileset
      for (const ts of json.tilesets ?? []) {
        for (const td of ts.tiles ?? []) {
          if (!td.animation) continue;
          _animated.set(td.id + 1, {
            frames: td.animation.map(f => ({ id: f.tileid + 1, duration: f.duration / 1000 })),
            t: 0, cur: 0,
          });
        }
      }
      return map;
    },

    // ── Update (animate tiles) ────────────────────────────────────────────────
    update(dt) {
      for (const anim of _animated.values()) {
        anim.t += dt;
        const frame = anim.frames[anim.cur];
        if (anim.t >= frame.duration) {
          anim.t -= frame.duration;
          anim.cur = (anim.cur + 1) % anim.frames.length;
        }
      }
    },

    // ── Render (camera-culled) ────────────────────────────────────────────────
    render(ctx, cam = null) {
      // visible tile range
      let c0 = 0, c1 = _mapW, r0 = 0, r1 = _mapH;
      if (cam) {
        const vp = cam.viewport;
        c0 = Math.max(0, Math.floor(vp.x / tileW) - 1);
        c1 = Math.min(_mapW, Math.ceil((vp.x + vp.w) / tileW) + 1);
        r0 = Math.max(0, Math.floor(vp.y / tileH) - 1);
        r1 = Math.min(_mapH, Math.ceil((vp.y + vp.h) / tileH) + 1);
      }

      for (const layer of _layers) {
        if (!layer.visible) continue;
        const prevAlpha = ctx.globalAlpha;
        if (layer.opacity !== 1) ctx.globalAlpha = layer.opacity;

        for (let r = r0; r < r1; r++) {
          for (let c = c0; c < c1; c++) {
            const id = layer.grid[r]?.[c] ?? 0;
            if (id === 0) continue;
            _drawTile(ctx, id, c * tileW, r * tileH);
          }
        }
        ctx.globalAlpha = prevAlpha;
      }
    },

    // ── Physics helpers ───────────────────────────────────────────────────────
    // Return merged AABB rects for all solid tiles (greedy horizontal merge)
    solidRects(layerName = null) {
      const layer = layerName
        ? _layers.find(l => l.name === layerName)
        : _layers[0];
      if (!layer) return [];

      const rects = [];
      const visited = Array.from({ length: _mapH }, () => new Uint8Array(_mapW));

      for (let r = 0; r < _mapH; r++) {
        for (let c = 0; c < _mapW; c++) {
          if (visited[r][c] || !_isSolid(layer.grid[r]?.[c] ?? 0)) continue;
          // extend right
          let w = 1;
          while (c + w < _mapW && !visited[r][c+w] && _isSolid(layer.grid[r]?.[c+w] ?? 0)) w++;
          // extend down
          let h = 1;
          outer: while (r + h < _mapH) {
            for (let i = 0; i < w; i++) {
              if (visited[r+h][c+i] || !_isSolid(layer.grid[r+h]?.[c+i] ?? 0)) break outer;
            }
            h++;
          }
          for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) visited[r+dr][c+dc] = 1;
          rects.push({ x: c*tileW, y: r*tileH, w: w*tileW, h: h*tileH });
        }
      }
      return rects;
    },

    // tile id at world position
    tileAt(wx, wy, layerName = null) {
      const layer = layerName ? _layers.find(l => l.name === layerName) : _layers[0];
      if (!layer) return 0;
      const c = Math.floor(wx / tileW), r = Math.floor(wy / tileH);
      return layer.grid[r]?.[c] ?? 0;
    },

    setTile(c, r, id, layerName = null) {
      const layer = layerName ? _layers.find(l => l.name === layerName) : _layers[0];
      if (layer?.grid[r]) layer.grid[r][c] = id;
    },

    getLayer(name) { return _layers.find(l => l.name === name) ?? null; },
    layers: _layers,
  };

  return map;
}
