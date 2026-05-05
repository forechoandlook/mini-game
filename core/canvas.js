// Canvas setup: DPR-aware, auto-resize, fullscreen, 2D context helpers

let _canvas = null, _ctx = null;
let _w = 0, _h = 0, _dpr = 1;
let _pixelated = true;
let _fitMode = false;

export const canvas = {
  init(target, { width, height, pixelated = true } = {}) {
    if (typeof target === 'string') target = document.querySelector(target);
    _canvas = target instanceof HTMLCanvasElement
      ? target
      : (() => { const c = document.createElement('canvas'); target.appendChild(c); return c; })();

    _pixelated = pixelated;
    if (pixelated) _canvas.style.imageRendering = 'pixelated';

    // context must exist before resize so setTransform works on first call
    _ctx = _canvas.getContext('2d');
    if (pixelated) _ctx.imageSmoothingEnabled = false;

    if (width && height) {
      _fitMode = false;
      canvas.resize(width, height);
    } else {
      _fitMode = true;
      canvas.fit();
      window.addEventListener('resize', () => { if (_fitMode) canvas.fit(); });
    }

    document.addEventListener('fullscreenchange', _onFullscreenChange);

    return canvas;
  },

  // fixed logical size — safe to call multiple times (setTransform resets scale each time)
  resize(w, h) {
    _dpr = window.devicePixelRatio || 1;
    _canvas.width  = Math.round(w * _dpr);
    _canvas.height = Math.round(h * _dpr);
    _canvas.style.width  = w + 'px';
    _canvas.style.height = h + 'px';
    _w = w; _h = h;
    _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
    if (_pixelated) _ctx.imageSmoothingEnabled = false;
  },

  // fill parent element (or window)
  fit() {
    const parent = _canvas.parentElement;
    const w = parent?.clientWidth  || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    canvas.resize(w, h);
  },

  // toggle fullscreen; fixed-size games get CSS-scaled, fit games get resized
  fullscreen() {
    if (!document.fullscreenElement) {
      _canvas.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  },

  clear(color = null) {
    if (color) { _ctx.fillStyle = color; _ctx.fillRect(0, 0, _w, _h); }
    else _ctx.clearRect(0, 0, _w, _h);
  },

  get ctx() { return _ctx; },
  get w()   { return _w; },
  get h()   { return _h; },
  get el()  { return _canvas; },
  get dpr() { return _dpr; },
};

function _onFullscreenChange() {
  if (_fitMode) {
    canvas.fit();
    return;
  }
  // fixed-size: scale CSS to fill screen while keeping logical dimensions
  if (document.fullscreenElement === _canvas) {
    const s = Math.min(screen.width / _w, screen.height / _h);
    _canvas.style.width  = Math.round(_w * s) + 'px';
    _canvas.style.height = Math.round(_h * s) + 'px';
  } else {
    _canvas.style.width  = _w + 'px';
    _canvas.style.height = _h + 'px';
  }
}
