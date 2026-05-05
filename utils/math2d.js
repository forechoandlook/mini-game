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
};
