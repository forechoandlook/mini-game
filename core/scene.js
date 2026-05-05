// Scene stack: push/pop for overlays (pause menus, dialogs)
// Each scene: { name, enter(data), update(dt), render(ctx, alpha), exit(), pause?(), resume?() }

import { signal } from '../../mini-react/src/core.js';

export const currentScene = signal(null);

// stack entries: { name, def } — store name directly so pop() doesn't need to search registry
const _stack = [];

function _top()    { return _stack[_stack.length - 1] ?? null; }
function _topDef() { return _top()?.def ?? null; }

export const scene = {
  _registry: new Map(),

  define(name, def) {
    scene._registry.set(name, def);
  },

  go(name, data) {
    while (_stack.length) _stack.pop()?.def?.exit?.(data);
    const def = scene._registry.get(name);
    if (!def) throw new Error(`[scene] unknown: ${name}`);
    _stack.push({ name, def });
    currentScene.value = name;
    def.enter?.(data);
  },

  push(name, data) {
    const def = scene._registry.get(name);
    if (!def) throw new Error(`[scene] unknown: ${name}`);
    _topDef()?.pause?.();
    _stack.push({ name, def });
    currentScene.value = name;
    def.enter?.(data);
  },

  pop(data) {
    _stack.pop()?.def?.exit?.(data);
    const entry = _top();
    currentScene.value = entry?.name ?? null;
    entry?.def?.resume?.();
  },

  update(dt)         { _topDef()?.update?.(dt); },
  render(ctx, alpha) { for (const { def } of _stack) def.render?.(ctx, alpha); },

  get current() { return _topDef(); },
  get depth()   { return _stack.length; },
};
