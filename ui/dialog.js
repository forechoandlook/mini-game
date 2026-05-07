// Typewriter dialog box — drawn on canvas, no DOM
// Usage:
//   const d = dialog({ w: 360, h: 60, x: 60, y: 200 })
//   d.show('Hello, world!', { speaker: 'Hero', onDone: () => {} })
//   d.update(dt)
//   d.render(ctx)
//   d.isOpen   → bool
//   d.isDone   → bool (all text revealed)
//   d.advance()  → skip to end or close

import { signal } from '../utils/signal.js';
import { input, mouse } from '../core/input.js';

export function dialog({
  x = 20, y = 0,           // position (y defaults to near bottom)
  w = 280, h = 56,
  canvasH = 270,            // used for default y
  cps     = 30,             // chars per second
  font    = '10px monospace',
  color   = '#eee',
  bg      = 'rgba(10,10,20,0.88)',
  border  = '#445',
  padding = 8,
  speakerFont = 'bold 10px monospace',
  speakerColor = '#7ec8e3',
  autoAdvance = false,
  autoDelay   = 1.5,        // seconds to wait before auto-close
} = {}) {
  if (!y) y = canvasH - h - 12;

  let _text    = '';
  let _speaker = '';
  let _revealed = 0;   // float chars revealed so far
  let _open    = false;
  let _done    = false;
  let _autoCd  = 0;
  let _onDone  = null;
  let _lines   = [];

  // split text into lines that fit box width
  function _wrap(text, ctx) {
    ctx.font = font;
    const maxW = w - padding * 2;
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // exposed as signal for reactive checks outside
  const isOpenSig = signal(false);

  const self = {
    get isOpen() { return _open; },
    get isDone() { return _done; },
    get isOpenSig() { return isOpenSig; },

    show(text, { speaker = '', onDone = null, ctx = null } = {}) {
      _text     = text;
      _speaker  = speaker;
      _revealed = 0;
      _done     = false;
      _open     = true;
      _autoCd   = autoDelay;
      _onDone   = onDone;
      // pre-wrap requires ctx — defer to first render if not available
      _lines    = ctx ? _wrap(text, ctx) : null;
      isOpenSig.value = true;
    },

    advance() {
      if (!_open) return;
      if (!_done) {
        // skip to end
        _revealed = _text.length;
        _done = true;
        _onDone?.();
      } else {
        self.close();
      }
    },

    close() {
      _open = false;
      isOpenSig.value = false;
    },

    update(dt) {
      if (!_open) return;

      if (!_done) {
        _revealed = Math.min(_text.length, _revealed + cps * dt);
        if (_revealed >= _text.length) {
          _done = true;
          _onDone?.();
        }
      } else if (autoAdvance) {
        _autoCd -= dt;
        if (_autoCd <= 0) self.close();
      }

      // confirm key to advance / close
      if (input.down('action') || input.down('jump') || mouse.justDown.value) {
        self.advance();
      }
    },

    render(ctx) {
      if (!_open) return;

      if (!_lines) _lines = _wrap(_text, ctx);

      // box
      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect?.(x, y, w, h, 4) ?? ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      // speaker name
      let textY = y + padding;
      if (_speaker) {
        ctx.fillStyle = speakerColor;
        ctx.font = speakerFont;
        ctx.textBaseline = 'top';
        ctx.fillText(_speaker, x + padding, textY);
        textY += 14;
      }

      // revealed text
      const visible = Math.floor(_revealed);
      let chars = 0;
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textBaseline = 'top';

      for (const line of _lines) {
        if (chars >= visible) break;
        const partial = line.slice(0, Math.max(0, visible - chars));
        ctx.fillText(partial, x + padding, textY);
        chars += line.length;
        textY += 13;
        if (textY > y + h - padding) break;
      }

      // blinking continue indicator when done
      if (_done && !autoAdvance) {
        const blink = Math.sin(Date.now() / 300) > 0;
        if (blink) {
          ctx.fillStyle = speakerColor;
          ctx.fillText('▼', x + w - padding - 8, y + h - padding - 10);
        }
      }

      ctx.textBaseline = 'alphabetic';
    },
  };

  return self;
}
