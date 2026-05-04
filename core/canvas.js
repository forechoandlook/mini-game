// Canvas setup: DPR-aware, auto-resize, 2D context helpers

let _canvas = null, _ctx = null;
let _w = 0, _h = 0;

export const canvas = {
  // attach to existing <canvas> or create one and append to container
  init(target, { width, height, pixelated = true } = {}) {
    if (typeof target === 'string') target = document.querySelector(target);
    _canvas = target instanceof HTMLCanvasElement
      ? target
      : (() => { const c = document.createElement('canvas'); target.appendChild(c); return c; })();

    if (pixelated) {
      _canvas.style.imageRendering = 'pixelated';
    }

    if (width && height) {
      canvas.resize(width, height, false);
    } else {
      canvas.fit();
    }

    _ctx = _canvas.getContext('2d');
    if (pixelated) {
      _ctx.imageSmoothingEnabled = false;
    }

    return canvas;
  },

  // fixed logical size (e.g. 320×240 pixel-art game)
  resize(w, h, dpr = true) {
    const scale = dpr ? (window.devicePixelRatio || 1) : 1;
    _canvas.width = w * scale;
    _canvas.height = h * scale;
    _canvas.style.width = w + 'px';
    _canvas.style.height = h + 'px';
    _w = w; _h = h;
    if (_ctx && scale !== 1) _ctx.scale(scale, scale);
  },

  // fill parent element
  fit() {
    const parent = _canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    canvas.resize(w, h);
  },

  clear(color = null) {
    if (color) { _ctx.fillStyle = color; _ctx.fillRect(0, 0, _w, _h); }
    else _ctx.clearRect(0, 0, _w, _h);
  },

  get ctx() { return _ctx; },
  get w() { return _w; },
  get h() { return _h; },
  get el() { return _canvas; },
};
