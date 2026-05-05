// Virtual joystick — touch-friendly analog stick rendered on canvas
// Usage:
//   const joy = joystick({ x:80, y:180, r:40 })   // fixed position
//   const joy = joystick({ r:40, floating:true })   // appears where finger touches
//   joy.update()          // call each frame (reads touch/mouse state)
//   joy.render(ctx)
//   joy.axisX, joy.axisY  // -1..1 continuous
//   joy.x8(), joy.y8()    // snapped to -1/0/1 (matches input.axisX())

export function joystick({
  x       = 80,
  y       = 180,
  r       = 40,         // outer ring radius
  deadzone = 0.15,
  floating = false,     // reposition to first touch point
  opacity  = 0.55,
  colorRing = '#fff',
  colorKnob = '#fff',
} = {}) {
  let _baseX = x, _baseY = y;
  let _knobX = x, _knobY = y;
  let _active = false;
  let _pointerId = -1;
  let _axisX = 0, _axisY = 0;

  // find the canvas element to attach listeners (set during update if not yet)
  let _el = null;
  const _touches = new Map();   // pointerId → {x,y}

  function _attach(el) {
    if (_el === el) return;
    _el = el;
    el.addEventListener('pointerdown',  _onDown,  { passive: false });
    el.addEventListener('pointermove',  _onMove,  { passive: false });
    el.addEventListener('pointerup',    _onUp);
    el.addEventListener('pointercancel',_onUp);
  }

  function _clientToCanvas(e) {
    const r = _el.getBoundingClientRect();
    // logical coords = CSS coords (canvas is set to its logical size via style)
    const scaleX = _el.width  / _el.getBoundingClientRect().width  / (window.devicePixelRatio || 1);
    const scaleY = _el.height / _el.getBoundingClientRect().height / (window.devicePixelRatio || 1);
    return {
      x: (e.clientX - r.left),
      y: (e.clientY - r.top),
    };
  }

  function _onDown(e) {
    const pos = _clientToCanvas(e);
    if (_active) return;                 // only one touch drives the stick
    // floating: always accept; fixed: only if inside outer ring*2
    const dx = pos.x - _baseX, dy = pos.y - _baseY;
    if (!floating && dx*dx + dy*dy > (r*2.5)**2) return;
    e.preventDefault();
    _pointerId = e.pointerId;
    _active = true;
    if (floating) { _baseX = pos.x; _baseY = pos.y; _knobX = pos.x; _knobY = pos.y; }
    _touches.set(e.pointerId, pos);
    _update(pos);
  }

  function _onMove(e) {
    if (e.pointerId !== _pointerId) return;
    e.preventDefault();
    const pos = _clientToCanvas(e);
    _touches.set(e.pointerId, pos);
    _update(pos);
  }

  function _onUp(e) {
    if (e.pointerId !== _pointerId) return;
    _touches.delete(e.pointerId);
    _active = false;
    _pointerId = -1;
    _axisX = 0; _axisY = 0;
    _knobX = _baseX; _knobY = _baseY;
    if (floating) { _baseX = x; _baseY = y; _knobX = x; _knobY = y; }
  }

  function _update(pos) {
    let dx = pos.x - _baseX, dy = pos.y - _baseY;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d > r) { dx = dx/d*r; dy = dy/d*r; }
    _knobX = _baseX + dx;
    _knobY = _baseY + dy;
    let ax = dx / r, ay = dy / r;
    const len = Math.sqrt(ax*ax + ay*ay);
    if (len < deadzone) { ax = 0; ay = 0; }
    _axisX = ax; _axisY = ay;
  }

  return {
    // call once with the canvas element (or pass el to constructor)
    init(el) { _attach(el); return this; },

    // no-op: events are driven by pointer listeners; kept for API symmetry
    update() {},

    render(ctx) {
      if (!_active && floating) return;
      ctx.save();
      ctx.globalAlpha = _active ? opacity : opacity * 0.5;

      // outer ring
      ctx.strokeStyle = colorRing;
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.arc(_baseX, _baseY, r, 0, Math.PI*2); ctx.stroke();

      // knob
      ctx.fillStyle   = colorKnob;
      ctx.globalAlpha = _active ? opacity + 0.2 : opacity * 0.4;
      ctx.beginPath(); ctx.arc(_knobX, _knobY, r * 0.42, 0, Math.PI*2); ctx.fill();

      ctx.restore();
    },

    get axisX()  { return _axisX; },
    get axisY()  { return _axisY; },
    get active() { return _active; },

    // snapped -1/0/1
    x8() { return _axisX >  0.4 ? 1 : _axisX < -0.4 ? -1 : 0; },
    y8() { return _axisY >  0.4 ? 1 : _axisY < -0.4 ? -1 : 0; },
  };
}
