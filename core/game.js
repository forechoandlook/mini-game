// createGame — canvas + input + loop.
//
// Manages canvas init, input, optional preload (with progress bar), and the
// game loop. State management is intentionally left to the caller — use a plain
// variable, a switch, or import stateMachine from utils/fsm.js as you prefer.
//
//   export function start(canvasEl) {
//     let state = 'menu';
//     return createGame(canvasEl, {
//       width: 480, height: 270, pixelated: true, bgColor: '#1a1a2e',
//       preload: () => assets.load(),
//       update(dt) { if (state === 'menu') { ... } },
//       render(ctx) { ... },
//     });
//   }
//
// With FSM (optional):
//   import { stateMachine } from '../utils/fsm.js';
//   const fsm = stateMachine({ play: { update, render }, ... }, 'play');
//   return createGame(canvasEl, { update: dt => fsm.update(dt), render: ctx => fsm.render(ctx) });

import { canvas }       from './canvas.js';
import { input }        from './input.js';
import { loop }         from './loop.js';
import { loadProgress } from './assets.js';

export function createGame(canvasEl, {
  width,
  height,
  pixelated = true,
  bgColor   = '#000',
  preload   = null,
  update,
  render,
} = {}) {
  canvas.init(canvasEl, { width, height, pixelated });
  input.init(canvasEl);

  function _startLoop() {
    loop.start(
      dt  => { update?.(dt); input.flush(); },
      ()  => { canvas.clear(bgColor); render?.(canvas.ctx); },
    );
  }

  if (preload) {
    let _raf;
    const _tick = () => {
      const p = loadProgress.value;
      const ctx = canvas.ctx, w = canvas.w, h = canvas.h;
      canvas.clear(bgColor);
      ctx.fillStyle = '#333';
      ctx.fillRect(w * 0.2, h / 2 - 5, w * 0.6, 10);
      ctx.fillStyle = '#fff';
      ctx.fillRect(w * 0.2, h / 2 - 5, w * 0.6 * p, 10);
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('LOADING', w / 2, h / 2 + 22);
      ctx.textAlign = 'left';
      _raf = requestAnimationFrame(_tick);
    };
    _raf = requestAnimationFrame(_tick);
    preload().then(() => { cancelAnimationFrame(_raf); _startLoop(); });
  } else {
    _startLoop();
  }

  return () => { loop.stop(); canvas.clear(bgColor); };
}
