// Asteroids — vector graphics, pool, screen wrap
import { canvas, input, audio, hud, menu, createGame, savedSignal,
         pool, circleVsCircle, particles, math, tweens,
         draw, fx, body, stepRotation, applyAngularImpulse } from '../index.js';


const W = 480, H = 360;
const TAU = Math.PI * 2;

function beep(freq, dur = 0.05, vol = 0.2) {
  audio.tone(freq, { type: 'square', duration: dur, volume: vol });
}


// generate random asteroid polygon (8–12 points with slight noise)
function makeAsteroidAngles(n = 10) {
  return Array.from({ length: n }, (_, i) => {
    const base = (i / n) * TAU;
    return base + (Math.random() - 0.5) * (TAU / n) * 0.6;
  });
}

export function start(canvasEl) {
  return createGame(canvasEl, {
    width: W, height: H, pixelated: false, bgColor: '#06060e', // smooth for vectors
    initial: 'menu',
    states: (fsm) => {
  const best = savedSignal('asteroids_best', 0);

  let ship, bullets, asteroids, score, lives, level, invincible;
  let ps;

  // object pools
  const bulletPool   = pool(8,  () => ({ x:0, y:0, vx:0, vy:0, r:2, life:0, active:false }),
    o => { o.x = 0; o.y = 0; o.vx = 0; o.vy = 0; o.life = 0; });          // r stays 2
  // asteroids are body() instances — angle + angularVelocity come for free
  const asteroidPool = pool(30,
    () => body({ angularDamping: 1 }), // angularDamping=1: no spin decay in space
    o  => { o.x=0; o.y=0; o.vx=0; o.vy=0; o.r=0; o.angle=0; o.angularVelocity=0; o.angles=[]; o.tier=0; });

  function spawnAsteroid(x, y, tier, vx = 0, vy = 0) {
    const a = asteroidPool.obtain();
    if (!a) return;
    const speed = (Math.random() * 40 + 20) * (4 - tier);
    const dir   = Math.random() * TAU;
    a.x = x ?? Math.random() * W;
    a.y = y ?? Math.random() * H;
    a.vx = vx + Math.cos(dir) * speed;
    a.vy = vy + Math.sin(dir) * speed;
    a.r  = [0, 42, 26, 14][tier];
    a.angle           = Math.random() * TAU;
    a.angularVelocity = (Math.random() - 0.5) * 1.5;
    a.angles = makeAsteroidAngles(9 + Math.floor(Math.random() * 4));
    a.tier = tier;
  }

  function spawnWave(n) {
    for (let i = 0; i < n; i++) {
      // spawn away from ship center
      let x, y;
      do { x = Math.random() * W; y = Math.random() * H; }
      while (math.dist(x, y, ship.x, ship.y) < 120);
      spawnAsteroid(x, y, 1);
    }
  }

  function resetGame() {
    ship = { x: W/2, y: H/2, vx: 0, vy: 0, angle: -Math.PI/2,
             r: 14, thrust: false, shootTimer: 0 };
    score = 0; lives = 3; level = 1; invincible = 1.5;
    bulletPool.forEach(b => { b.active = false; });
    asteroidPool.forEach(a => { a.active = false; });
    ps = particles(300);
    spawnWave(3 + level);
    tweens.clear();
  }

  function explodeShip() {
    ps.burst({ x: ship.x, y: ship.y, count: 20, speed: 120, spread: Math.PI,
               lifetime: 1.2, colorStart: '#88ccff', colorEnd: '#000', gravity: 0 });
    beep(120, 0.4, 0.4);
    lives--;
    invincible = 2.5;
    ship.x = W/2; ship.y = H/2; ship.vx = 0; ship.vy = 0;
    if (lives <= 0) { tweens.clear(); fsm.go('gameover'); }
  }

  function drawShip(ctx, alpha = 1) {
    const { x, y, angle: a } = ship;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#88ccff'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a)*16,     y + Math.sin(a)*16);
    ctx.lineTo(x + Math.cos(a+2.4)*12, y + Math.sin(a+2.4)*12);
    ctx.lineTo(x + Math.cos(a+Math.PI)*6, y + Math.sin(a+Math.PI)*6);
    ctx.lineTo(x + Math.cos(a-2.4)*12, y + Math.sin(a-2.4)*12);
    ctx.closePath(); ctx.stroke();
    if (ship.thrust) {
      const fl = 12 + Math.random() * 8;
      ctx.strokeStyle = '#ff8844';
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a+2.7)*9, y + Math.sin(a+2.7)*9);
      ctx.lineTo(x + Math.cos(a+Math.PI)*fl, y + Math.sin(a+Math.PI)*fl);
      ctx.lineTo(x + Math.cos(a-2.7)*9, y + Math.sin(a-2.7)*9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderGame(ctx) {
    bulletPool.forEach(b => draw.circle(ctx, b.x, b.y, b.r, { color: '#ffee88' }));
    asteroidPool.forEach(a => draw.poly(ctx, a.x, a.y, a.angles, a.r, a.angle,
      { color: `hsl(${[0,40,60,80][a.tier-1]}, 60%, 70%)` }));

    // ship
    const shipAlpha = math.flicker(invincible);
    drawShip(ctx, shipAlpha);

    // particles
    ps.render(ctx);

    // HUD
    hud.score(ctx, score, 8, 22, { digits: 6, font: '13px monospace', color: '#fff', align: 'left' });
    hud.pips(ctx, W - 8 - lives * 18, 8, 12, 6, 3, lives, { color: '#88ccff', bg: '#222' });
    hud.text(ctx, `WAVE ${level}`, W/2, 18, { font: '10px monospace', color: '#555', align: 'center' });
  }

  // ── menus ─────────────────────────────────────────────────────────────────
  const mainMenu = menu({
    items: [{ label: 'START', action: () => fsm.go('play') }],
    x: W/2, y: H/2 + 20, itemW: 120, itemH: 26,
    font: '14px monospace', colorNormal: '#555', colorActive: '#fff',
  });

  // ── FSM ───────────────────────────────────────────────────────────────────
  return {
    menu: {
      update(dt)  { mainMenu.update(dt); },
      render(ctx) {
        canvas.clear('#06060e');
        hud.text(ctx, 'ASTEROIDS', W/2, H/2-70, { font: 'bold 28px monospace', color: '#88ccff', align: 'center' });
        if (best.value > 0)
          hud.text(ctx, `BEST  ${best.value}`, W/2, H/2-30, { font: '12px monospace', color: '#555', align: 'center' });
        mainMenu.render(ctx);
        hud.text(ctx, '← → turn   ↑ thrust   SPACE shoot', W/2, H-24, { font: '10px monospace', color: '#444', align: 'center' });
      },
    },

    play: {
      enter()    { resetGame(); },
      update(dt) {
        if (input.down('pause')) { fsm.go('pause'); return; }

        tweens.update(dt);

        // ship controls
        const turnSpeed = 2.8;
        if (input.pressed('left'))  ship.angle -= turnSpeed * dt;
        if (input.pressed('right')) ship.angle += turnSpeed * dt;

        ship.thrust = input.pressed('up');
        if (ship.thrust) {
          const thrust = 260;
          ship.vx += Math.cos(ship.angle) * thrust * dt;
          ship.vy += Math.sin(ship.angle) * thrust * dt;
        }
        // drag
        ship.vx = math.expDecay(ship.vx, 0.3, dt);
        ship.vy = math.expDecay(ship.vy, 0.3, dt);

        ship.x += ship.vx * dt; ship.y += ship.vy * dt;
        math.wrapPos(ship, W, H);

        // shoot
        ship.shootTimer -= dt;
        if ((input.pressed('jump') || input.pressed('action')) && ship.shootTimer <= 0) {
          const b = bulletPool.obtain();
          if (b) {
            const spd = 520;
            b.x = ship.x + Math.cos(ship.angle) * 18;
            b.y = ship.y + Math.sin(ship.angle) * 18;
            b.vx = ship.vx + Math.cos(ship.angle) * spd;
            b.vy = ship.vy + Math.sin(ship.angle) * spd;
            b.life = 1.2;
            beep(660, 0.05, 0.15);
          }
          ship.shootTimer = 0.18;
        }

        // move bullets
        bulletPool.update(b => {
          b.x += b.vx * dt; b.y += b.vy * dt;
          math.wrapPos(b, W, H); b.life -= dt;
          if (b.life <= 0) return false;
          // bullet vs asteroid
          let hit = false;
          asteroidPool.forEach(a => {
            if (hit) return;
            if (!circleVsCircle(b, a)) return;
            hit = true;
            ps.burst({ x: a.x, y: a.y, count: 8, speed: 60, spread: Math.PI,
                       lifetime: 0.6, colorStart: `hsl(${[0,40,60,80][a.tier-1]},60%,70%)`, colorEnd: '#000', gravity: 0 });
            const pts = [0, 100, 50, 20];
            score += pts[a.tier]; if (score > best.value) best.value = score;
            beep(220 + a.tier * 80, 0.08);
            if (a.tier < 3) {
              // child asteroids inherit parent's spin + bullet impact torque
              const torque = (Math.random() - 0.5) * 4;
              spawnAsteroid(a.x, a.y, a.tier + 1, a.vx + b.vx * 0.1, a.vy + b.vy * 0.1);
              spawnAsteroid(a.x, a.y, a.tier + 1, a.vx - b.vx * 0.1, a.vy - b.vy * 0.1);
              asteroidPool.forEach(child => {
                if (child.active && child.x === a.x && child.y === a.y)
                  applyAngularImpulse(child, torque);
              });
            }
            a.active = false; b.active = false;
          });
          if (hit) return false;
        });

        // move asteroids — stepRotation integrates angularVelocity → angle
        asteroidPool.update(a => {
          a.x += a.vx * dt; a.y += a.vy * dt;
          stepRotation(a, dt);
          math.wrapPos(a, W, H);
        });

        // ship vs asteroids
        invincible -= dt;
        if (invincible <= 0) {
          asteroidPool.forEach(a => {
            if (invincible < 0 && circleVsCircle(ship, a)) {
              explodeShip(); invincible = 99; // prevent multi-hit
            }
          });
          if (invincible > 2) invincible = 2.5; // restore normal invincibility after hit
        }

        // next wave
        if (asteroidPool.active === 0) {
          level++; spawnWave(3 + level);
          beep(440, 0.1, 0.2); beep(660, 0.1, 0.2);
        }

        ps.update(dt);
      },
      render(ctx) { canvas.clear('#06060e'); renderGame(ctx); },
    },

    pause: {
      update() { if (input.down('pause')) fsm.go('play'); },
      render(ctx) {
        canvas.clear('#06060e'); renderGame(ctx);
        hud.fade(ctx, 0.65);
        hud.text(ctx, 'PAUSED', W/2, H/2, { font: 'bold 20px monospace', color: '#fff', align: 'center' });
      },
    },

    gameover: {
      update() { if (input.down('action') || input.down('jump')) fsm.go('menu'); },
      render(ctx) {
        canvas.clear('#06060e'); renderGame(ctx);
        hud.fade(ctx, 0.75);
        hud.text(ctx, 'GAME OVER',     W/2, H/2-22, { font: 'bold 22px monospace', color: '#ff4444', align: 'center' });
        hud.text(ctx, `Score: ${score}`, W/2, H/2+6,  { font: '13px monospace', color: '#aaa', align: 'center' });
        hud.text(ctx, 'ENTER to menu',  W/2, H/2+30, { font: '11px monospace', color: '#888', align: 'center' });
      },
    },
  };
    },
  });
}
