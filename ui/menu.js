// Keyboard/mouse navigable canvas menu
// Usage:
//   const m = menu({
//     items: [
//       { label: 'Start',    action: () => scene.go('play') },
//       { label: 'Options',  action: () => scene.push('options') },
//       { label: 'Quit',     action: () => {} },
//     ],
//     x: 240, y: 120,   // center position
//     itemH: 24, gap: 6,
//   })
//   m.update(dt)        // handles keyboard nav + confirm
//   m.render(ctx)

import { input, mouse } from '../core/input.js';

export function menu({
  items = [],
  x = 0, y = 0,
  itemW = 160, itemH = 22, gap = 4,
  font        = '13px monospace',
  colorNormal = '#aaa',
  colorActive = '#fff',
  colorBg     = 'rgba(0,0,0,0)',
  colorActiveBg = 'rgba(255,255,255,0.1)',
  onCancel    = null,
} = {}) {
  let _idx = 0;
  let _cooldown = 0;    // prevent instant re-trigger

  const _totalH = items.length * itemH + (items.length - 1) * gap;
  const _startY = y - _totalH / 2;

  function _itemRect(i) {
    return { x: x - itemW / 2, y: _startY + i * (itemH + gap), w: itemW, h: itemH };
  }

  const self = {
    get index() { return _idx; },
    set index(v) { _idx = ((v % items.length) + items.length) % items.length; },

    update(dt) {
      _cooldown -= dt;
      if (_cooldown > 0) return;

      const prevIdx = _idx;

      // keyboard nav
      if (input.down('down'))  { _idx = (_idx + 1) % items.length; _cooldown = 0.12; }
      if (input.down('up'))    { _idx = (_idx - 1 + items.length) % items.length; _cooldown = 0.12; }
      if (input.down('action') || input.down('jump')) {
        items[_idx]?.action?.();
        _cooldown = 0.2;
        return;
      }
      if (input.down('pause') && onCancel) { onCancel(); return; }

      // mouse hover
      const mx = mouse.x.value, my = mouse.y.value;
      for (let i = 0; i < items.length; i++) {
        const r = _itemRect(i);
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          _idx = i;
          if (mouse.justDown.value) {
            items[_idx]?.action?.();
            _cooldown = 0.2;
          }
          break;
        }
      }
    },

    render(ctx) {
      for (let i = 0; i < items.length; i++) {
        const r = _itemRect(i);
        const active = i === _idx;

        if (colorBg !== 'rgba(0,0,0,0)') {
          ctx.fillStyle = colorBg;
          ctx.fillRect(r.x, r.y, r.w, r.h);
        }
        if (active && colorActiveBg !== 'rgba(0,0,0,0)') {
          ctx.fillStyle = colorActiveBg;
          ctx.fillRect(r.x, r.y, r.w, r.h);
        }

        ctx.fillStyle = active ? colorActive : colorNormal;
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(items[i].label, x, r.y + r.h / 2);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    },

    // replace items at runtime (e.g. dynamic options list)
    setItems(newItems) { items = newItems; _idx = 0; },
  };

  return self;
}
