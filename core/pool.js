// Object pool — pre-allocate N objects, O(1) obtain/release.
// Release via pool.release(o) OR by setting o.active = false directly.
//
// Usage:
//   const bullets = pool(50, () => ({ x:0, y:0, vx:0, vy:0 }));
//   const b = bullets.obtain();
//   b.active = false;          // release back to pool
//   bullets.forEach(b => {})   // iterate active objects

export function pool(capacity, factory, reset = null) {
  const _free = new Int32Array(capacity);
  let _freeTop = capacity;
  for (let i = 0; i < capacity; i++) _free[i] = i;

  const _reset = reset ?? (o => {
    for (const k in o) {
      if (k !== 'active' && k !== '_poolIdx') o[k] = 0;
    }
  });

  // 'active' is a defineProperty setter on each item so that
  // setting o.active = false from anywhere auto-returns the slot to the free-list
  const _items = Array.from({ length: capacity }, (_, i) => {
    const o = factory();
    let _active = false;
    Object.defineProperty(o, 'active', {
      get() { return _active; },
      set(v) {
        if (_active && !v) { _active = false; _free[_freeTop++] = i; }
        else _active = !!v;
      },
      enumerable: true,
      configurable: false,
    });
    o._poolIdx = i;
    return o;
  });

  return {
    obtain() {
      if (_freeTop === 0) {
        console.warn('[pool] exhausted, capacity =', capacity);
        return null;
      }
      const o = _items[_free[--_freeTop]];
      _reset(o);
      o.active = true;
      return o;
    },

    release(o) { o.active = false; },

    forEach(fn) {
      for (let i = 0; i < capacity; i++) {
        if (_items[i].active) fn(_items[i], i);
      }
    },

    update(fn) {
      for (let i = 0; i < capacity; i++) {
        const o = _items[i];
        if (o.active && fn(o) === false) o.active = false;
      }
    },

    get active()   { return capacity - _freeTop; },
    get capacity() { return capacity; },
    get all()      { return _items; },
  };
}
