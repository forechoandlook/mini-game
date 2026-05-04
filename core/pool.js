// Object pool — pre-allocate N objects, recycle instead of new/GC
// Usage:
//   const bullets = pool(50, () => ({ x:0, y:0, vx:0, vy:0, active:false }));
//   const b = bullets.obtain();   // get one (returns null if exhausted)
//   b.active = false;             // "free" it — pool reclaims automatically
//   bullets.forEach(b => { ... }) // iterate only active objects

export function pool(capacity, factory, reset = null) {
  const _items = Array.from({ length: capacity }, factory);
  // mark all inactive
  for (const o of _items) o.active = false;

  const _reset = reset ?? (o => { for (const k in o) if (k !== 'active') o[k] = 0; });

  return {
    // grab a free slot; returns null if pool is full
    obtain() {
      for (const o of _items) {
        if (!o.active) {
          _reset(o);
          o.active = true;
          return o;
        }
      }
      console.warn('[pool] exhausted, capacity =', capacity);
      return null;
    },

    // release explicitly (also works to just set o.active = false)
    release(o) { o.active = false; },

    // iterate active objects; callback can set active=false to free mid-loop
    forEach(fn) {
      for (let i = 0; i < _items.length; i++) {
        if (_items[i].active) fn(_items[i], i);
      }
    },

    // update all active, release if fn returns false
    update(fn) {
      for (let i = 0; i < _items.length; i++) {
        if (_items[i].active && fn(_items[i]) === false) _items[i].active = false;
      }
    },

    get active() { let n = 0; for (const o of _items) if (o.active) n++; return n; },
    get capacity() { return capacity; },
    get all() { return _items; },
  };
}
