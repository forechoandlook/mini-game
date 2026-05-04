// Scene stack: push/pop for overlays (pause menus, dialogs)
// Each scene: { name, enter(data), update(dt), render(ctx, alpha), exit() }
// Uses mini-react signals for reactive currentScene name

import { signal } from '../../mini-react/src/core.js';

export const currentScene = signal(null); // reactive: bind to HUD etc.

const _stack = [];

function _top() { return _stack[_stack.length - 1] ?? null; }

export const scene = {
  // register a scene definition
  _registry: new Map(),

  define(name, def) {
    scene._registry.set(name, def);
  },

  // replace entire stack (transition to new scene)
  go(name, data) {
    while (_stack.length) {
      const s = _stack.pop();
      s.exit?.();
    }
    const def = scene._registry.get(name);
    if (!def) throw new Error(`[scene] unknown: ${name}`);
    _stack.push(def);
    currentScene.value = name;
    def.enter?.(data);
  },

  // push on top (overlay: pause screen, dialog)
  push(name, data) {
    const def = scene._registry.get(name);
    if (!def) throw new Error(`[scene] unknown: ${name}`);
    _top()?.pause?.();
    _stack.push(def);
    currentScene.value = name;
    def.enter?.(data);
  },

  // return to scene below
  pop(data) {
    const s = _stack.pop();
    s?.exit?.(data);
    const top = _top();
    if (top) {
      currentScene.value = scene._registry
        ? [...scene._registry.entries()].find(([, v]) => v === top)?.[0] ?? null
        : null;
      top.resume?.();
    } else {
      currentScene.value = null;
    }
  },

  // called by loop each fixed step
  update(dt) { _top()?.update?.(dt); },

  // called by loop each render frame
  render(ctx, alpha) {
    // render bottom-up so overlays draw on top
    for (const s of _stack) s.render?.(ctx, alpha);
  },

  get current() { return _top(); },
  get depth() { return _stack.length; },
};
