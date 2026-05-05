// Infinite Jump Game — dodge obstacles, collect coins
import { canvas, loop, input, audio, hud, stateMachine, body, applyGravity, move, aabb } from '../index.js';

const W = 400, H = 300;
const GROUND_Y = H - 40;
const PLAYER_W = 22, PLAYER_H = 28;
const JUMP_V = -520;
const GRAVITY = 1200;
const SPEED_INIT = 220;
const COIN_R = 7;
const GROUND_RECT = { x: -99999, y: GROUND_Y, w: 999999, h: 40 };

function beep(freq, dur = 0.05, vol = 0.25) {
  audio.tone(freq, { type: 'square', duration: dur, volume: vol });
}

export function start(canvasEl) {
  canvas.init(canvasEl, { width: W, height: H, pixelated: true });
  input.init(canvasEl);

  let player, obstacles, coins, score, best = 0, speed;
  let spawnTimer = 0, coinTimer = 0, distance = 0;
  let bgX = 0, deathFlash = 0;

  function resetGame() {
    player = body({ x: 60, y: GROUND_Y - PLAYER_H, w: PLAYER_W, h: PLAYER_H, gravity: GRAVITY, restitution: 0 });
    obstacles = []; coins = [];
    score = 0; speed = SPEED_INIT;
    spawnTimer = 1.2; coinTimer = 0.8; distance = 0;
  }

  function tapPressed() {
    return input.down('jump') || input.down('action') || input.mouse.justDown.value;
  }

  function tryJump() {
    if (player.grounded) { player.vy = JUMP_V; beep(660, 0.06); }
  }

  function renderBg(ctx) {
    ctx.fillStyle = '#16213e';
    const off = ((bgX * 0.5) % 200 + 200) % 200;
    for (let i = 0; i < 4; i++) {
      const bx = off + i * 200 - 200;
      ctx.beginPath(); ctx.moveTo(bx, GROUND_Y); ctx.lineTo(bx + 80, GROUND_Y - 80); ctx.lineTo(bx + 160, GROUND_Y);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#2d4a2d'; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#3d6a3d'; ctx.fillRect(0, GROUND_Y, W, 3);
  }

  function renderGame(ctx) {
    renderBg(ctx);
    for (const o of obstacles) {
      ctx.fillStyle = '#cc4444'; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#ff6666'; ctx.fillRect(o.x, o.y, o.w, 3);
    }
    for (const c of coins) {
      if (!c.alive) continue;
      ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.arc(c.x, c.y, COIN_R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffee88'; ctx.beginPath(); ctx.arc(c.x - 1, c.y - 1, COIN_R * 0.45, 0, Math.PI * 2); ctx.fill();
    }
    const px = player.x, py = player.y;
    ctx.fillStyle = player.grounded ? '#4488ff' : '#66aaff';
    ctx.fillRect(px, py, PLAYER_W, PLAYER_H);
    ctx.fillStyle = '#fff'; ctx.fillRect(px + 5, py + 5, 5, 5); ctx.fillRect(px + 13, py + 5, 5, 5);
    ctx.fillStyle = '#111'; ctx.fillRect(px + 6, py + 6, 3, 3);  ctx.fillRect(px + 14, py + 6, 3, 3);
    hud.score(ctx, score,    10,    22, { digits: 1, font: 'bold 14px monospace', color: '#fff' });
    hud.text(ctx, `best: ${best}`, W - 8, 22, { font: '11px monospace', color: '#555', align: 'right' });
  }

  const fsm = stateMachine({
    menu: {
      update()    { if (tapPressed()) fsm.go('play'); },
      render(ctx) {
        canvas.clear('#1a1a2e'); renderBg(ctx);
        hud.text(ctx, 'JUMP GAME',           W / 2, H / 2 - 32, { font: 'bold 24px monospace', color: '#fff',    align: 'center' });
        hud.text(ctx, 'SPACE / TAP to jump', W / 2, H / 2,      { font: '13px monospace',      color: '#aaa',    align: 'center' });
        if (best > 0) hud.text(ctx, `BEST: ${best}`, W / 2, H / 2 + 28, { font: '13px monospace', color: '#ffcc00', align: 'center' });
      },
    },

    play: {
      enter()    { resetGame(); },
      update(dt) {
        bgX -= speed * 0.3 * dt;
        if (tapPressed()) tryJump();

        applyGravity(player, dt);
        move(player, dt, [GROUND_RECT]);

        distance += speed * dt;
        speed = SPEED_INIT + distance * 0.04;
        score = Math.floor(distance / 10);

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          const h = Math.random() < 0.3 ? 55 : 32;
          obstacles.push({ x: W + 10, y: GROUND_Y - h, w: 22, h });
          spawnTimer = 0.8 + Math.random() * 0.8 - Math.min(0.3, distance / 5000);
        }
        for (const o of obstacles) o.x -= speed * dt;
        obstacles = obstacles.filter(o => o.x + o.w > -10);

        coinTimer -= dt;
        if (coinTimer <= 0) {
          coins.push({ x: W + 10, y: GROUND_Y - 40 - Math.random() * 60, r: COIN_R, alive: true });
          coinTimer = 0.6 + Math.random() * 0.5;
        }
        for (const c of coins) c.x -= speed * dt;
        coins = coins.filter(c => c.x > -20 && c.alive);

        for (const o of obstacles) {
          if (aabb(player, o)) {
            if (score > best) best = score;
            deathFlash = 0.35; beep(200, 0.3, 0.5); fsm.go('gameover'); return;
          }
        }
        for (const c of coins) {
          if (!c.alive) continue;
          const dx = player.x + player.w / 2 - c.x, dy = player.y + player.h / 2 - c.y;
          if (Math.hypot(dx, dy) < COIN_R + PLAYER_W / 2) { c.alive = false; score += 10; beep(880, 0.04, 0.2); }
        }
      },
      render(ctx) { renderGame(ctx); },
    },

    gameover: {
      update(dt) {
        bgX -= speed * 0.3 * dt;
        deathFlash -= dt;
        if (deathFlash <= 0 && tapPressed()) fsm.go('menu');
      },
      render(ctx) {
        renderGame(ctx);
        if (deathFlash > 0) {
          ctx.fillStyle = `rgba(255,80,80,${deathFlash * 2.5})`; ctx.fillRect(0, 0, W, H);
        } else {
          hud.fade(ctx, 0.6);
          hud.text(ctx, 'GAME OVER',                    W / 2, H / 2 - 22, { font: 'bold 20px monospace', color: '#ff4444', align: 'center' });
          hud.text(ctx, `Score: ${score}  Best: ${best}`, W / 2, H / 2 + 6,  { font: '13px monospace',      color: '#aaa',    align: 'center' });
          hud.text(ctx, 'SPACE to menu',                W / 2, H / 2 + 30, { font: '12px monospace',      color: '#888',    align: 'center' });
        }
      },
    },
  }, 'menu');

  loop.start(dt => { fsm.update(dt); input.flush(); }, () => {
    canvas.clear('#1a1a2e');
    fsm.render(canvas.ctx);
  });

  return () => { loop.stop(); canvas.clear('#0a0a0a'); };
}
