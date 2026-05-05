// Object pool — pre-allocate N objects, O(1) obtain/release, O(active) iteration.
// Release via pool.release(o) OR by setting o.active = false directly.
//
// Usage:
//   const bullets = pool(50, () => ({ x:0, y:0, vx:0, vy:0 }));
//   const b = bullets.obtain();
//   b.active = false;          // release back to pool
//   bullets.forEach(b => {})   // iterate active objects only

export function pool(capacity, factory, reset = null) {
  const _free = new Int32Array(capacity);
  let _freeTop = capacity;
  for (let i = 0; i < capacity; i++) _free[i] = i;

  // Default: no-op. Caller either provides a reset fn or sets all fields after obtain().
  // Zeroing all fields by default breaks pools whose objects have constant geometry
  // (r, w, h) that must survive across reuse cycles.
  const _reset = reset ?? (() => {});

  // Active list for O(active) iteration; swap-remove keeps it packed.
  const _activeItems = [];

  const _items = Array.from({ length: capacity }, (_, i) => {
    const o = factory();
    let _active = false;
    Object.defineProperty(o, 'active', {
      get() { return _active; },
      set(v) {
        if (_active && !v) {
          _active = false;
          _free[_freeTop++] = i;
          // swap-remove: move last item into this slot
          const ai = o._activeIdx;
          const last = _activeItems[_activeItems.length - 1];
          if (last !== o) {
            _activeItems[ai] = last;
            last._activeIdx = ai;
          }
          _activeItems.pop();
          o._activeIdx = -1;
        } else if (!_active && v) {
          _active = true;
          o._activeIdx = _activeItems.length;
          _activeItems.push(o);
        }
      },
      enumerable: true,
      configurable: false,
    });
    o._poolIdx = i;
    o._activeIdx = -1;
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

    // Iterate backwards so swap-remove during fn(o) is safe.
    forEach(fn) {
      for (let i = _activeItems.length - 1; i >= 0; i--) {
        const o = _activeItems[i];
        if (o?.active) fn(o, o._poolIdx);
      }
    },

    update(fn) {
      for (let i = _activeItems.length - 1; i >= 0; i--) {
        const o = _activeItems[i];
        if (o?.active && fn(o) === false) o.active = false;
      }
    },

    get active()   { return _activeItems.length; },
    get capacity() { return capacity; },
    get all()      { return _items; },
  };
}
