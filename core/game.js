// createGame — canvas + input + stateMachine + loop, all in one call.
//
// Optional `preload` async function runs before the loop starts.
// While loading, a built-in progress bar is shown automatically.
//
//   export function start(canvasEl) {
//     return createGame(canvasEl, {
//       width: 480, height: 270, pixelated: true, bgColor: '#1a1a2e',
//       preload: async () => {
//         assets.add('tiles',  'img/tiles.png');
//         assets.add('player', 'img/mario.png');
//         assets.add('bgm',    'audio/theme.ogg', 'audio');
//         await assets.load();           // loadProgress.value updated automatically
//       },
//       initial: 'menu',
//       states: (fsm) => ({ ... }),
//     });
//   }

import { canvas }       from './canvas.js';
import { input }        from './input.js';
import { loop }         from './loop.js';
import { loadProgress } from './assets.js';
import { stateMachine } from '../utils/fsm.js';

export function createGame(canvasEl, {
  width,
  height,
  pixelated = true,
  bgColor   = '#000',
  preload   = null,
  states,
  initial,
} = {}) {
  canvas.init(canvasEl, { width, height, pixelated });
  input.init(canvasEl);

  let fsm;
  const fsmProxy = new Proxy({}, {
    get: (_, k) => (...args) => fsm[k](...args),
  });

  function _startLoop() {
    const resolved = typeof states === 'function' ? states(fsmProxy) : (states ?? {});
    fsm = stateMachine(resolved, initial);
    loop.start(
      dt => { fsm.update(dt); input.flush(); },
      ()  => { canvas.clear(bgColor); fsm.render(canvas.ctx); },
    );
  }

  if (preload) {
    // Render loading bar via rAF until preload resolves
    let _raf;
    const _tick = () => {
      const p = loadProgress.value;
      const ctx = canvas.ctx, w = canvas.w, h = canvas.h;
      canvas.clear(bgColor);
      // bar track
      ctx.fillStyle = '#333';
      ctx.fillRect(w * 0.2, h / 2 - 5, w * 0.6, 10);
      // bar fill
      ctx.fillStyle = '#fff';
      ctx.fillRect(w * 0.2, h / 2 - 5, w * 0.6 * p, 10);
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('LOADING', w / 2, h / 2 + 22);
      ctx.textAlign = 'left';
      _raf = requestAnimationFrame(_tick);
    };
    _raf = requestAnimationFrame(_tick);

    preload().then(() => {
      cancelAnimationFrame(_raf);
      _startLoop();
    });
  } else {
    _startLoop();
  }

  return () => { loop.stop(); canvas.clear(bgColor); };
}
