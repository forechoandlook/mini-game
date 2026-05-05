// Lightweight timer — after / every, updated by game loop dt (already time-scaled)
// Call timer.update(dt) inside scene update, or globally in loop.
// Call timer.clear() in scene exit to cancel all pending timers.

const _list = [];

function _add(entry) {
  _list.push(entry);
  return { cancel() { entry._dead = true; } };
}

export const timer = {
  // fn fires once after `delay` seconds
  after(delay, fn) {
    return _add({ type: 'after', rem: delay, fn, _dead: false });
  },

  // fn fires every `interval` seconds; return false from fn to cancel
  every(interval, fn) {
    return _add({ type: 'every', interval, rem: interval, fn, _dead: false });
  },

  update(dt) {
    for (let i = _list.length - 1; i >= 0; i--) {
      const e = _list[i];
      if (e._dead) { _list.splice(i, 1); continue; }
      e.rem -= dt;
      if (e.rem <= 0) {
        if (e.type === 'after') {
          e._dead = true;
          e.fn();
        } else {
          e.rem += e.interval;
          if (e.fn() === false) e._dead = true;
        }
      }
    }
  },

  clear() { _list.length = 0; },
  get count() { return _list.length; },
};
