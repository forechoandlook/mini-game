// Seeded PRNG — mulberry32. Deterministic replay & level gen.
// random.seed(n) resets the sequence; random.next() → float [0,1)

let _s = Math.random() * 0xffffffff >>> 0;

function _next() {
  _s |= 0;
  _s = _s + 0x6d2b79f5 | 0;
  let t = Math.imul(_s ^ _s >>> 15, 1 | _s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 0x100000000;
}

export const random = {
  seed(s)          { _s = (s >>> 0) || 1; },
  next()           { return _next(); },
  float(lo=0,hi=1) { return lo + _next() * (hi - lo); },
  int(lo, hi)      { return lo + (_next() * (hi - lo + 1) | 0); },   // inclusive
  pick(arr)        { return arr[_next() * arr.length | 0]; },
  shuffle(arr)     {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = _next() * (i + 1) | 0;
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  },
  chance(p)        { return _next() < p; },
};
