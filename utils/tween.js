// Value tweening — zero dependencies, works with any plain object
// tweens.to(obj, { x:100, alpha:0 }, 0.5, 'easeOutQuad')
//   → returns { stop(), onDone(fn) }
// Call tweens.update(dt) each frame (receives time-scaled dt from loop).
// Call tweens.clear() on scene exit.

const E = {
  linear:    t => t,
  easeIn:    t => t * t,
  easeOut:   t => t * (2 - t),
  easeInOut: t => t < .5 ? 2*t*t : -1+(4-2*t)*t,
  easeInCubic:  t => t*t*t,
  easeOutCubic: t => (--t)*t*t+1,
  easeInOutCubic: t => t<.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
  easeOutBack:  t => { const c=1.70158; return 1+(c+1)*(t-1)**3+c*(t-1)**2; },
  easeOutBounce: t => {
    if (t < 1/2.75) return 7.5625*t*t;
    if (t < 2/2.75) return 7.5625*(t-=1.5/2.75)*t+0.75;
    if (t < 2.5/2.75) return 7.5625*(t-=2.25/2.75)*t+0.9375;
    return 7.5625*(t-=2.625/2.75)*t+0.984375;
  },
  easeOutElastic: t => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2,-10*t)*Math.sin((t*10-0.75)*(2*Math.PI)/3)+1;
  },
};

const _active = [];

export const tweens = {
  to(target, props, duration, easing = 'easeOutQuad') {
    const ease = E[easing] ?? E.easeOut;
    const from = {};
    for (const k in props) from[k] = target[k];
    const entry = { target, props, from, duration, elapsed: 0, ease, _done: false, _cb: null };
    _active.push(entry);
    return {
      stop()       { entry._done = true; },
      onDone(fn)   { entry._cb = fn; return this; },
    };
  },

  update(dt) {
    for (let i = _active.length - 1; i >= 0; i--) {
      const e = _active[i];
      if (e._done) { _active.splice(i, 1); continue; }
      e.elapsed = Math.min(e.elapsed + dt, e.duration);
      const t = e.ease(e.elapsed / e.duration);
      for (const k in e.props) {
        e.target[k] = e.from[k] + (e.props[k] - e.from[k]) * t;
      }
      if (e.elapsed >= e.duration) {
        e._done = true;
        e._cb?.();
      }
    }
  },

  clear()           { _active.length = 0; },
  get count()       { return _active.length; },
  get easings()     { return E; },
};
