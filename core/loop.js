// Fixed-timestep game loop with variable rendering
// update runs at fixed STEP intervals; render gets interpolation alpha

import { time } from './time.js';

let STEP = 1000 / 60; // 16.67ms fixed physics step

let _update = null, _render = null;
let _rafId = null, _last = 0, _acc = 0;
let _running = false;

// exposed as signals so UI can bind to them
let _fps = 0, _frameCount = 0;
let _fpsTimer = 0, _fpsFrames = 0;

function tick(now) {
  if (!_running) return;
  _rafId = requestAnimationFrame(tick);

  const dt = Math.min(now - _last, 200); // clamp to avoid spiral of death
  _last = now;
  _acc += dt;

  while (_acc >= STEP) {
    time.rawDt = STEP / 1000;
    _update?.(time.rawDt * time.scale);
    _acc -= STEP;
    _frameCount++;
  }

  _render?.(_acc / STEP); // alpha: 0..1 interpolation for smooth render

  // fps counter
  _fpsFrames++;
  _fpsTimer += dt;
  if (_fpsTimer >= 1000) {
    _fps = _fpsFrames;
    _fpsFrames = 0;
    _fpsTimer -= 1000;
  }
}

export const loop = {
  start(update, render) {
    _update = update;
    _render = render;
    _running = true;
    _last = performance.now();
    _acc = 0;
    _rafId = requestAnimationFrame(tick);
  },

  stop() {
    _running = false;
    if (_rafId) cancelAnimationFrame(_rafId);
    _rafId = null;
  },

  pause() {
    _running = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  },

  resume() {
    if (_running) return;
    _running = true;
    _last = performance.now();
    _rafId = requestAnimationFrame(tick);
  },

  get fps() { return _fps; },
  get frame() { return _frameCount; },
  get running() { return _running; },

  setStep(ms) { STEP = ms; },
};
