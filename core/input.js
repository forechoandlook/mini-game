// Unified input: keyboard + mouse/touch → signal-based frame snapshot
// Every bindable state is a signal so UI/HUD can reactively read it.

import { signal } from '../../mini-react/src/core.js';

// ── key aliases ──────────────────────────────────────────────────────────────
const ALIASES = {
  left:   ['ArrowLeft',  'a', 'A'],
  right:  ['ArrowRight', 'd', 'D'],
  up:     ['ArrowUp',    'w', 'W'],
  down:   ['ArrowDown',  's', 'S'],
  jump:   ['Space', ' ', 'ArrowUp', 'w', 'W'],
  action: ['Enter', 'z', 'Z'],
  pause:  ['Escape', 'p', 'P'],
};

// ── raw sets (updated by DOM events, not frame-snapshotted) ──────────────────
const _held    = new Set();   // currently held keys
const _heldTimers = new Map(); // key → { t, phase } for held() DAS
const _jdown   = new Set();   // keys pressed this frame
const _jup     = new Set();   // keys released this frame

// ── signals (reactive, read from anywhere) ───────────────────────────────────
// Keyboard: signal per alias + raw key map
export const keys = new Proxy({}, {
  get(_, name) {
    // lazily create a signal per key/alias name
    if (!_keySigs.has(name)) _keySigs.set(name, signal(false));
    return _keySigs.get(name);
  }
});
const _keySigs = new Map();

// Pointer (mouse + touch unified)
export const mouse = {
  x:        signal(0),
  y:        signal(0),
  down:      signal(false),
  justDown:  signal(false),
  justUp:    signal(false),
};

// Axis signals (computed each flush)
export const axis = {
  x: signal(0),   // -1 / 0 / 1
  y: signal(0),
};

// ── helpers ───────────────────────────────────────────────────────────────────
function _resolve(key) {
  if (ALIASES[key]) return ALIASES[key];
  if (key.length === 1) return [key.toLowerCase(), key.toUpperCase()];
  return [key];
}
function _anyIn(set, keys) { return keys.some(k => set.has(k)); }

function _updateKeySig(name) {
  const s = _keySigs.get(name);
  if (!s) return;
  // held state for known aliases, justDown/justUp encoded as positive/negative
  // We expose pressed() / down() / up() for imperative use; signals for reactive use.
  // Signal value: true = currently held (aliases resolved)
  s.value = _anyIn(_held, _resolve(name));
}

// ── init ──────────────────────────────────────────────────────────────────────
export const input = {
  init(el = window) {
    const pointerEl = el instanceof HTMLElement ? el : document.documentElement;
    // keyboard always on window so canvas doesn't need tabindex
    const keyEl = window;

    keyEl.addEventListener('keydown', e => {
      if (e.repeat) return;
      _held.add(e.key);
      _jdown.add(e.key);
    });
    keyEl.addEventListener('keyup', e => {
      _held.delete(e.key);
      _jup.add(e.key);
    });

    // mouse
    pointerEl.addEventListener('mousemove', e => {
      const r = pointerEl.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      mouse.x.value = e.clientX - r.left;
      mouse.y.value = e.clientY - r.top;
    });
    pointerEl.addEventListener('mousedown', () => {
      mouse.down.value = true;
      mouse.justDown.value = true;
    });
    pointerEl.addEventListener('mouseup', () => {
      mouse.down.value = false;
      mouse.justUp.value = true;
    });

    // touch → pointer
    pointerEl.addEventListener('touchmove', e => {
      const t = e.touches[0];
      const r = pointerEl.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      mouse.x.value = t.clientX - r.left;
      mouse.y.value = t.clientY - r.top;
      e.preventDefault();
    }, { passive: false });
    pointerEl.addEventListener('touchstart', e => {
      const t = e.touches[0];
      const r = pointerEl.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      mouse.x.value = t.clientX - r.left;
      mouse.y.value = t.clientY - r.top;
      mouse.down.value = true;
      mouse.justDown.value = true;
      e.preventDefault();
    }, { passive: false });
    pointerEl.addEventListener('touchend', () => {
      mouse.down.value = false;
      mouse.justUp.value = true;
    });

    return input;
  },

  // ── imperative API (use inside update()) ──────────────────────────────────
  pressed(key) { return _anyIn(_held,  _resolve(key)); },
  down(key)    { return _anyIn(_jdown, _resolve(key)); },
  up(key)      { return _anyIn(_jup,   _resolve(key)); },

  // Delayed auto-shift: fires on first press, then again after firstDelay,
  // then repeatedly every repeatDelay. Mirrors keyboard typematic behaviour.
  // Usage: if (input.held('left', dt)) moveLeft();
  held(key, dt, { firstDelay = 0.17, repeatDelay = 0.05 } = {}) {
    if (!input.pressed(key)) { _heldTimers.delete(key); return false; }
    if (input.down(key)) { _heldTimers.set(key, { t: 0, phase: 0 }); return true; }
    const s = _heldTimers.get(key) ?? { t: 0, phase: 0 };
    if (!_heldTimers.has(key)) _heldTimers.set(key, s);
    s.t += dt;
    const threshold = s.phase === 0 ? firstDelay : repeatDelay;
    if (s.t >= threshold) { s.t -= threshold; s.phase = 1; return true; }
    return false;
  },

  axisX() { return (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0); },
  axisY() { return (input.pressed('down')  ? 1 : 0) - (input.pressed('up')   ? 1 : 0); },

  // call at END of update() to advance frame snapshot
  flush() {
    _jdown.clear();
    _jup.clear();
    mouse.justDown.value = false;
    mouse.justUp.value  = false;

    // refresh all watched key signals
    for (const name of _keySigs.keys()) _updateKeySig(name);

    // axis signals
    axis.x.value = input.axisX();
    axis.y.value = input.axisY();
  },

  mouse,
  axis,
  keys,
};
