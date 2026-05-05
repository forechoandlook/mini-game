// 2D game math utilities — scalar ops, angles, interpolation

export const math = {
  clamp:      (v, lo, hi)        => v < lo ? lo : v > hi ? hi : v,
  lerp:       (a, b, t)          => a + (b - a) * t,
  lerpAngle:  (a, b, t)          => { const d = ((b-a+Math.PI*3) % (Math.PI*2)) - Math.PI; return a + d*t; },
  remap:      (v,a,b,c,d)        => c + (v-a)/(b-a) * (d-c),
  smoothstep: (a, b, t)          => { t = math.clamp((t-a)/(b-a),0,1); return t*t*(3-2*t); },
  wrap:       (v, lo, hi)        => { const r=hi-lo; return ((v-lo)%r+r)%r+lo; },
  sign:       v                  => v > 0 ? 1 : v < 0 ? -1 : 0,
  pingpong:   (t, len)           => { const n=t%(len*2); return n>len ? len*2-n : n; },

  dist:       (x1,y1,x2,y2)     => Math.sqrt((x2-x1)**2+(y2-y1)**2),
  dist2:      (x1,y1,x2,y2)     => (x2-x1)**2+(y2-y1)**2,
  angle:      (x1,y1,x2,y2)     => Math.atan2(y2-y1, x2-x1),
  dirX:       a                  => Math.cos(a),
  dirY:       a                  => Math.sin(a),

  toRad:      d                  => d * Math.PI / 180,
  toDeg:      r                  => r * 180 / Math.PI,

  // move `current` toward `target` by at most `step`
  moveToward: (current, target, step) => {
    const d = target - current;
    return Math.abs(d) <= step ? target : current + math.sign(d) * step;
  },

  // random helpers (non-seeded, use random.js for seeded)
  rand:       (lo=0, hi=1)       => lo + Math.random() * (hi - lo),
  randInt:    (lo, hi)           => lo + (Math.random() * (hi - lo + 1) | 0),

  // Frame-rate independent exponential velocity decay.
  // retain: fraction of speed kept per second (e.g. 0.3 → 30% speed after 1s).
  // Usage: ship.vx = math.expDecay(ship.vx, 0.3, dt)
  expDecay: (v, retain, dt) => v * Math.pow(retain, dt),

  // Wrap an object with { x, y, r? } around a w×h play area (arcade screen wrap).
  // Mutates obj.x / obj.y in place.
  wrapPos(obj, w, h) {
    const r = obj.r ?? 0;
    if (obj.x < -r)    obj.x += w + r * 2;
    if (obj.x > w + r) obj.x -= w + r * 2;
    if (obj.y < -r)    obj.y += h + r * 2;
    if (obj.y > h + r) obj.y -= h + r * 2;
  },

  // Invincibility / hit-flicker alpha. t counts down to 0.
  // Returns oscillating alpha in [0.2, 1.0]; 1 when t <= 0.
  flicker: (t, freq = 20) => t > 0 ? Math.sin(t * freq) * 0.4 + 0.6 : 1,

  // Rotate a 2D grid (array-of-arrays) 90° clockwise. Useful for Tetris pieces.
  rotateMatrix: grid => grid.map((row, r) => row.map((_, c) => grid[grid.length-1-c][r])),
};
