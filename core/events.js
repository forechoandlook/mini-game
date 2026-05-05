// Lightweight event bus — decoupled messaging between systems
// Usage:
//   events.on('player:hit', ({ damage }) => hp -= damage)
//   events.once('level:start', init)
//   events.emit('player:hit', { damage: 10 })
//   events.off('player:hit', handler)
//   events.clear('player:hit')   // remove all listeners for one event
//   events.clear()               // remove everything (call on scene exit)

const _map = new Map();  // eventName → Set<handler>

function _get(name) {
  if (!_map.has(name)) _map.set(name, new Set());
  return _map.get(name);
}

export const events = {
  on(name, fn) {
    _get(name).add(fn);
    return () => events.off(name, fn);   // returns unsubscribe fn
  },

  once(name, fn) {
    const wrap = (data) => { fn(data); events.off(name, wrap); };
    _get(name).add(wrap);
    return () => events.off(name, wrap);
  },

  off(name, fn) {
    _map.get(name)?.delete(fn);
  },

  emit(name, data) {
    const set = _map.get(name);
    if (!set) return;
    for (const fn of set) fn(data);
  },

  clear(name) {
    if (name === undefined) _map.clear();
    else _map.delete(name);
  },

  // Returns true if anyone is listening (useful to skip expensive emit prep)
  has(name) { return (_map.get(name)?.size ?? 0) > 0; },
};
