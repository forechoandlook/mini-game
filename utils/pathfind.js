// Grid-based A* pathfinding
// Usage:
//   const pf = pathfinder(mapW, mapH)
//   pf.setWalkable(x, y, false)       // mark obstacle
//   pf.loadGrid(grid2d)               // 0=walkable, 1=wall (matches tilemap format)
//   const path = pf.find(sx, sy, ex, ey)
//     → [{ x, y }, ...] tile coords from start to end, or [] if unreachable
//   pf.findSmooth(sx, sy, ex, ey)     // same but string-pulls to remove zig-zag

export function pathfinder(cols, rows) {
  const _walk = new Uint8Array(cols * rows).fill(1); // 1=walkable

  function idx(x, y) { return y * cols + x; }
  function valid(x, y) { return x >= 0 && y >= 0 && x < cols && y < rows; }

  // Binary min-heap for open set
  class Heap {
    constructor() { this.d = []; }
    push(n)  {
      this.d.push(n);
      let i = this.d.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.d[p].f <= this.d[i].f) break;
        [this.d[p], this.d[i]] = [this.d[i], this.d[p]]; i = p;
      }
    }
    pop() {
      const top = this.d[0], last = this.d.pop();
      if (this.d.length > 0) {
        this.d[0] = last;
        let i = 0;
        for (;;) {
          let s = i, l = 2*i+1, r = 2*i+2;
          if (l < this.d.length && this.d[l].f < this.d[s].f) s = l;
          if (r < this.d.length && this.d[r].f < this.d[s].f) s = r;
          if (s === i) break;
          [this.d[s], this.d[i]] = [this.d[i], this.d[s]]; i = s;
        }
      }
      return top;
    }
    get size() { return this.d.length; }
  }

  // 8-directional neighbors; diagonal only if both cardinals are clear
  const DIRS = [
    [ 1, 0,10],[-1, 0,10],[ 0, 1,10],[ 0,-1,10],
    [ 1, 1,14],[-1, 1,14],[ 1,-1,14],[-1,-1,14],
  ];

  function heuristic(ax, ay, bx, by) {
    const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
    return 10 * (dx + dy) + (14 - 20) * Math.min(dx, dy); // octile
  }

  const pf = {
    setWalkable(x, y, w) { if (valid(x, y)) _walk[idx(x, y)] = w ? 1 : 0; },

    loadGrid(grid) {
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
          _walk[idx(x, y)] = grid[y]?.[x] ? 0 : 1;
    },

    isWalkable(x, y) { return valid(x, y) && _walk[idx(x, y)] === 1; },

    find(sx, sy, ex, ey) {
      if (!valid(sx,sy) || !valid(ex,ey)) return [];
      if (!_walk[idx(ex,ey)]) return [];
      if (sx === ex && sy === ey) return [{ x: sx, y: sy }];

      const g   = new Int32Array(cols * rows).fill(-1);
      const par = new Int32Array(cols * rows).fill(-1);
      const open = new Heap();

      g[idx(sx, sy)] = 0;
      open.push({ x: sx, y: sy, f: heuristic(sx, sy, ex, ey) });

      while (open.size > 0) {
        const cur = open.pop();
        const { x, y } = cur;
        if (x === ex && y === ey) {
          // reconstruct
          const path = [];
          let ci = idx(x, y);
          while (ci !== -1) {
            path.push({ x: ci % cols, y: (ci / cols) | 0 });
            ci = par[ci];
          }
          path.reverse();
          return path;
        }

        for (const [dx, dy, cost] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (!valid(nx, ny) || !_walk[idx(nx, ny)]) continue;
          // diagonal: block if either cardinal neighbor is solid
          if (dx !== 0 && dy !== 0) {
            if (!_walk[idx(x + dx, y)] || !_walk[idx(x, y + dy)]) continue;
          }
          const ni = idx(nx, ny);
          const ng = g[idx(x, y)] + cost;
          if (g[ni] !== -1 && g[ni] <= ng) continue;
          g[ni] = ng;
          par[ni] = idx(x, y);
          open.push({ x: nx, y: ny, f: ng + heuristic(nx, ny, ex, ey) });
        }
      }
      return []; // unreachable
    },

    // String-pull (funnel lite): removes unnecessary zig-zag waypoints.
    findSmooth(sx, sy, ex, ey) {
      const path = pf.find(sx, sy, ex, ey);
      if (path.length <= 2) return path;
      const out = [path[0]];
      let i = 0;
      while (i < path.length - 1) {
        let j = path.length - 1;
        while (j > i + 1) {
          if (pf._los(path[i].x, path[i].y, path[j].x, path[j].y)) break;
          j--;
        }
        out.push(path[j]);
        i = j;
      }
      return out;
    },

    // Line-of-sight check (Bresenham)
    _los(ax, ay, bx, by) {
      let dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
      let x = ax, y = ay;
      const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
      let err = dx - dy;
      while (true) {
        if (!_walk[idx(x, y)]) return false;
        if (x === bx && y === by) return true;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 <  dx) { err += dx; y += sy; }
      }
    },

    get cols() { return cols; },
    get rows() { return rows; },
  };

  return pf;
}
