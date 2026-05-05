// localStorage save/load + reactive savedSignal
// save(key, data) — JSON serialize, persist
// load(key, def)  — JSON parse, return def on miss/error
// savedSignal(key, def) — signal that auto-saves on write

import { signal } from '../../mini-react/src/core.js';

const PREFIX = 'mg_';

export function save(key, data) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(data)); } catch (_) {}
}

export function load(key, def = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw !== null ? JSON.parse(raw) : def;
  } catch (_) { return def; }
}

export function deleteSave(key) {
  localStorage.removeItem(PREFIX + key);
}

// Returns a signal whose value is persisted on every write.
// Usage: const coins = savedSignal('coins', 0)
//        coins.value += 10   // auto-saved
export function savedSignal(key, def = null) {
  const sig = signal(load(key, def));
  const raw = Object.getOwnPropertyDescriptor(sig, 'value') ??
              Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sig), 'value');
  const origSet = raw.set.bind(sig);
  Object.defineProperty(sig, 'value', {
    get: raw.get.bind(sig),
    set(v) { origSet(v); save(key, v); },
    configurable: true,
  });
  return sig;
}
