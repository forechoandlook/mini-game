// Particle system: object-pool based, zero GC during gameplay
// Supports: burst, continuous emitter, gravity, fade, spin, color lerp
//
// Usage:
//   const ps = particles(512)               // max 512 particles
//   ps.burst({ x, y, count:20, ... })       // one-shot explosion
//   ps.emit({ x, y, rate:30, ... })         // start continuous emitter → returns handle
//   ps.update(dt)
//   ps.render(ctx)

export function particles(capacity = 256) {
  // flat typed arrays for cache efficiency
  const px   = new Float32Array(capacity);  // position x
  const py   = new Float32Array(capacity);  // position y
  const vx   = new Float32Array(capacity);  // velocity x
  const vy   = new Float32Array(capacity);  // velocity y
  const life = new Float32Array(capacity);  // remaining life (seconds)
  const maxL = new Float32Array(capacity);  // max life
  const rot  = new Float32Array(capacity);  // rotation (radians)
  const spin = new Float32Array(capacity);  // rotation speed
  const sz   = new Float32Array(capacity);  // size
  const szE  = new Float32Array(capacity);  // end size
  // color: r0g0b0a0 → r1g1b1a1 (bytes, packed as floats 0..1)
  const r0 = new Float32Array(capacity), g0 = new Float32Array(capacity);
  const b0 = new Float32Array(capacity), a0 = new Float32Array(capacity);
  const r1 = new Float32Array(capacity), g1 = new Float32Array(capacity);
  const b1 = new Float32Array(capacity), a1 = new Float32Array(capacity);
  const grav = new Float32Array(capacity); // per-particle gravity
  const active = new Uint8Array(capacity);

  let _count = 0;  // high-water mark for iteration

  function _spawn(opts) {
    // find free slot
    let i = -1;
    for (let j = 0; j < capacity; j++) {
      if (!active[j]) { i = j; break; }
    }
    if (i === -1) return;  // pool full
    if (i >= _count) _count = i + 1;

    const {
      x = 0, y = 0,
      angle    = Math.random() * Math.PI * 2,
      speed    = 60,
      speedVar = 30,
      lifetime = 0.8,
      lifetimeVar = 0.3,
      size     = 4,
      sizeEnd  = 0,
      sizeVar  = 1,
      gravity  = 0,
      spin: spinVal = 0,
      spinVar  = 0,
      colorStart = [1, 1, 1, 1],
      colorEnd   = [1, 1, 1, 0],
    } = opts;

    const spd = speed + (Math.random() - 0.5) * 2 * speedVar;
    const ang = angle + (opts.spread ?? Math.PI) * (Math.random() - 0.5);
    const lt  = Math.max(0.05, lifetime + (Math.random() - 0.5) * 2 * lifetimeVar);

    px[i] = x + (opts.xVar ?? 0) * (Math.random() - 0.5) * 2;
    py[i] = y + (opts.yVar ?? 0) * (Math.random() - 0.5) * 2;
    vx[i] = Math.cos(ang) * spd;
    vy[i] = Math.sin(ang) * spd;
    life[i] = lt; maxL[i] = lt;
    rot[i]  = Math.random() * Math.PI * 2;
    spin[i] = spinVal + (Math.random() - 0.5) * 2 * spinVar;
    sz[i]   = Math.max(0.5, size + (Math.random() - 0.5) * 2 * sizeVar);
    szE[i]  = sizeEnd;
    grav[i] = gravity;
    r0[i] = colorStart[0]; g0[i] = colorStart[1]; b0[i] = colorStart[2]; a0[i] = colorStart[3] ?? 1;
    r1[i] = colorEnd[0];   g1[i] = colorEnd[1];   b1[i] = colorEnd[2];   a1[i] = colorEnd[3] ?? 0;
    active[i] = 1;
  }

  // running emitters
  const _emitters = [];

  const ps = {
    // one-shot burst
    burst(opts) {
      const count = opts.count ?? 10;
      for (let i = 0; i < count; i++) _spawn(opts);
    },

    // continuous emitter; returns handle with .stop()
    emit(opts) {
      let _acc = 0, _running = true;
      const rate = opts.rate ?? 20;   // particles/sec
      const handle = {
        opts,
        update(dt) {
          if (!_running) return false;
          _acc += dt * rate;
          while (_acc >= 1) { _spawn(opts); _acc--; }
          return true;  // still running
        },
        stop() { _running = false; },
      };
      _emitters.push(handle);
      return handle;
    },

    update(dt) {
      // update continuous emitters
      for (let i = _emitters.length - 1; i >= 0; i--) {
        if (!_emitters[i].update(dt)) _emitters.splice(i, 1);
      }

      // update particles
      for (let i = 0; i < _count; i++) {
        if (!active[i]) continue;
        life[i] -= dt;
        if (life[i] <= 0) { active[i] = 0; continue; }
        vx[i] += 0;
        vy[i] += grav[i] * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        rot[i] += spin[i] * dt;
      }

      // compact high-water mark
      while (_count > 0 && !active[_count - 1]) _count--;
    },

    render(ctx) {
      for (let i = 0; i < _count; i++) {
        if (!active[i]) continue;
        const t  = 1 - life[i] / maxL[i];   // 0=birth, 1=death
        const r  = r0[i] + (r1[i] - r0[i]) * t;
        const g  = g0[i] + (g1[i] - g0[i]) * t;
        const b  = b0[i] + (b1[i] - b0[i]) * t;
        const a  = a0[i] + (a1[i] - a0[i]) * t;
        const s  = sz[i]  + (szE[i] - sz[i]) * t;
        if (a <= 0 || s <= 0) continue;

        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.fillStyle   = `rgb(${(r*255)|0},${(g*255)|0},${(b*255)|0})`;

        if (rot[i] !== 0) {
          ctx.save();
          ctx.translate(px[i], py[i]);
          ctx.rotate(rot[i]);
          ctx.fillRect(-s/2, -s/2, s, s);
          ctx.restore();
        } else {
          ctx.fillRect(px[i] - s/2, py[i] - s/2, s, s);
        }
      }
      ctx.globalAlpha = 1;
    },

    // render as circles instead of squares
    renderCircles(ctx) {
      ctx.beginPath();
      for (let i = 0; i < _count; i++) {
        if (!active[i]) continue;
        const t = 1 - life[i] / maxL[i];
        const a = a0[i] + (a1[i] - a0[i]) * t;
        const s = sz[i] + (szE[i] - sz[i]) * t;
        if (a <= 0 || s <= 0) continue;
        const r = r0[i] + (r1[i] - r0[i]) * t;
        const g = g0[i] + (g1[i] - g0[i]) * t;
        const b = b0[i] + (b1[i] - b0[i]) * t;
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.fillStyle   = `rgb(${(r*255)|0},${(g*255)|0},${(b*255)|0})`;
        ctx.beginPath();
        ctx.arc(px[i], py[i], s/2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    get activeCount() {
      let n = 0;
      for (let i = 0; i < _count; i++) if (active[i]) n++;
      return n;
    },
    get capacity() { return capacity; },

    // preset bursts
    presets: {
      explosion(ps, x, y, { color = [1, 0.4, 0.1] } = {}) {
        ps.burst({ x, y, count: 24, speed: 120, speedVar: 60, spread: Math.PI * 2,
          lifetime: 0.6, lifetimeVar: 0.3, size: 5, sizeEnd: 0, gravity: 80,
          colorStart: [...color, 1], colorEnd: [color[0]*0.5, color[1]*0.2, 0, 0] });
        ps.burst({ x, y, count: 8, speed: 40, speedVar: 20, spread: Math.PI * 2,
          lifetime: 1.0, lifetimeVar: 0.4, size: 8, sizeEnd: 0, gravity: 40,
          colorStart: [1, 0.9, 0.5, 0.9], colorEnd: [0.4, 0.2, 0.1, 0] });
      },
      dust(ps, x, y) {
        ps.burst({ x, y, count: 6, speed: 20, speedVar: 10, spread: Math.PI,
          angle: -Math.PI / 2, lifetime: 0.4, size: 3, sizeEnd: 0, gravity: -20,
          colorStart: [0.7, 0.7, 0.6, 0.6], colorEnd: [0.7, 0.7, 0.6, 0] });
      },
      sparkle(ps, x, y) {
        ps.burst({ x, y, count: 12, speed: 80, speedVar: 40, spread: Math.PI * 2,
          lifetime: 0.5, size: 3, sizeEnd: 0, spin: 5, spinVar: 3,
          colorStart: [1, 1, 0.4, 1], colorEnd: [1, 0.6, 0.1, 0] });
      },
    },
  };

  return ps;
}
