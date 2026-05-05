// Finite State Machine
// Usage:
//   const fsm = stateMachine({
//     idle:  { enter() {}, update(dt) {}, exit() {} },
//     run:   { update(dt) { if (...) fsm.go('jump'); } },
//     jump:  { enter() { vy = JUMP_V; } },
//   }, 'idle');
//
//   fsm.update(dt)   // call each frame
//   fsm.go('run')    // transition (calls exit on current, enter on next)
//   fsm.state        // current state name (signal-like .value not needed; read directly)
//   fsm.is('idle')   // boolean

export function stateMachine(states, initial) {
  let _cur  = null;
  let _name = null;

  const fsm = {
    get state() { return _name; },
    is(name)    { return _name === name; },

    go(name, data) {
      if (!states[name]) { console.warn(`[fsm] unknown state: ${name}`); return; }
      _cur?.exit?.(name);
      const prev = _name;
      _name = name;
      _cur  = states[name];
      _cur.enter?.(prev, data);
    },

    update(dt) { _cur?.update?.(dt); },

    // Transition only if condition is true; returns true if transition happened.
    tryGo(name, condition) {
      if (!condition) return false;
      fsm.go(name);
      return true;
    },
  };

  fsm.go(initial);
  return fsm;
}
