// Space Invaders
import { canvas, input, audio, hud, menu, createGame, stateMachine, savedSignal,
         pool, aabb, particles, timer } from '../index.js';

const W = 400, H = 480;
const PLAYER_W = 28, PLAYER_H = 16, PLAYER_Y = H - 48;
const PLAYER_SPEED = 220;
const BULLET_W = 3, BULLET_H = 10;
const ENEMY_COLS = 11, ENEMY_ROWS = 5;
const ENEMY_W = 24, ENEMY_H = 16;
const ENEMY_GAP_X = 16, ENEMY_GAP_Y = 14;
const ENEMY_DROP = 18;

const ROW_COLORS = ['#ff4466','#ff4466','#ff8844','#ff8844','#ffcc44'];
const ROW_PTS    = [30, 30, 20, 20, 10];

function beep(freq, dur = 0.05, vol = 0.25) {
  audio.tone(freq, { type: 'square', duration: dur, volume: vol });
}

export function start(canvasEl) {
  const best = savedSignal('invaders_best', 0);

  let player, enemies, score, lives, wave;
  let moveDir, moveTimer, moveInterval, dropPending;
  let ps;

  const playerBullets = pool(3,  () => ({ x:0, y:0, w:BULLET_W, h:BULLET_H, active:false }), o => { o.x = 0; o.y = 0; });
  const enemyBullets  = pool(8,  () => ({ x:0, y:0, w:3, h:8,      active:false }), o => { o.x = 0; o.y = 0; });

  function resetWave(w) {
    wave = w;
    const startX = (W - ENEMY_COLS * (ENEMY_W + ENEMY_GAP_X)) / 2;
    const startY = 60 + wave * 10;
    enemies = [];
    for (let r = 0; r < ENEMY_ROWS; r++)
      for (let c = 0; c < ENEMY_COLS; c++)
        enemies.push({ x: startX + c * (ENEMY_W + ENEMY_GAP_X),
                       y: startY + r * (ENEMY_H + ENEMY_GAP_Y),
                       w: ENEMY_W, h: ENEMY_H, row: r, alive: true });
    moveDir = 1;
    moveInterval = Math.max(0.06, 0.5 - wave * 0.05);
    moveTimer = 0; dropPending = false;
    playerBullets.forEach(b => { b.active = false; });
    enemyBullets.forEach(b => { b.active = false; });
    timer.clear();
    timer.every(Math.max(0.6, 1.8 - wave * 0.15), () => {
      const cols = [...new Set(enemies.filter(e => e.alive).map(e => e.x))];
      if (!cols.length) return;
      const col = cols[Math.floor(Math.random() * cols.length)];
      const shooter = [...enemies].reverse().find(e => e.alive && e.x === col);
      if (!shooter) return;
      const b = enemyBullets.obtain();
      if (b) { b.x = shooter.x + ENEMY_W/2 - 1; b.y = shooter.y + ENEMY_H; }
    });
  }

  function resetGame() {
    player = { x: W/2 - PLAYER_W/2, y: PLAYER_Y, w: PLAYER_W, h: PLAYER_H };
    score = 0; lives = 3;
    ps = particles(200);
    resetWave(1);
  }

  function explode(x, y, color) {
    ps.burst({ x, y, count: 12, speed: 80, spread: Math.PI,
               lifetime: 0.5, colorStart: color, colorEnd: '#000', gravity: 60 });
  }

  function activeEnemies() { return enemies.filter(e => e.alive); }

  function drawPlayer(ctx) {
    ctx.fillStyle = '#44ff88';
    ctx.fillRect(player.x + 10, player.y, 8, 6);
    ctx.fillRect(player.x,      player.y + 6, PLAYER_W, 8);
    ctx.fillRect(player.x + 4,  player.y + 12, PLAYER_W - 8, 4);
    ctx.fillRect(player.x + 12, player.y - 4, 4, 6);
  }

  function drawEnemy(ctx, e) {
    const color = ROW_COLORS[e.row];
    ctx.fillStyle = color;
    ctx.fillRect(e.x + 4,  e.y,      ENEMY_W - 8, 6);
    ctx.fillRect(e.x,      e.y + 6,  ENEMY_W,     6);
    ctx.fillRect(e.x + 2,  e.y + 12, ENEMY_W - 4, 4);
    ctx.fillRect(e.x + 2,  e.y - 2,  3, 3);
    ctx.fillRect(e.x + ENEMY_W - 5, e.y - 2, 3, 3);
    ctx.fillStyle = '#000';
    ctx.fillRect(e.x + 6,  e.y + 4, 3, 4);
    ctx.fillRect(e.x + ENEMY_W - 9, e.y + 4, 3, 4);
  }

  function renderGame(ctx) {
    drawPlayer(ctx);
    playerBullets.forEach(b => { ctx.fillStyle = '#88ffcc'; ctx.fillRect(b.x, b.y, b.w, b.h); });
    for (const e of enemies) if (e.alive) drawEnemy(ctx, e);
    enemyBullets.forEach(b => { ctx.fillStyle = '#ff4444'; ctx.fillRect(b.x, b.y, b.w, b.h); });
    ps.render(ctx);
    hud.text(ctx,  'SCORE', 8, 10, { font: '10px monospace', color: '#888' });
    hud.score(ctx, score,   8, 26, { digits: 6, font: '13px monospace', color: '#fff', align: 'left' });
    hud.pips(ctx, W - 8 - lives * 18, 10, 12, 6, 3, lives, { color: '#44ff88', bg: '#222' });
    hud.text(ctx, `WAVE ${wave}`, W/2, 18, { font: '10px monospace', color: '#555', align: 'center' });
    if (best.value > 0)
      hud.text(ctx, `BEST ${best.value}`, W - 8, 26, { font: '10px monospace', color: '#444', align: 'right' });
  }

  let fsm;

  const mainMenu = menu({
    items: [{ label: 'START', action: () => fsm.go('play') }],
    x: W/2, y: H/2 + 20, itemW: 120, itemH: 26,
    font: '14px monospace', colorNormal: '#555', colorActive: '#fff',
  });

  fsm = stateMachine({
    menu: {
      update(dt)  { mainMenu.update(dt); },
      render(ctx) {
        canvas.clear('#06060e');
        hud.text(ctx, 'SPACE INVADERS', W/2, H/2-80, { font: 'bold 22px monospace', color: '#44ff88', align: 'center' });
        if (best.value > 0)
          hud.text(ctx, `BEST  ${best.value}`, W/2, H/2-40, { font: '12px monospace', color: '#555', align: 'center' });
        mainMenu.render(ctx);
        hud.text(ctx, '← → move   SPACE shoot', W/2, H-24, { font: '10px monospace', color: '#444', align: 'center' });
      },
    },
    play: {
      enter()    { resetGame(); },
      update(dt) {
        if (input.down('pause')) { fsm.go('pause'); return; }
        if (input.pressed('left'))  player.x -= PLAYER_SPEED * dt;
        if (input.pressed('right')) player.x += PLAYER_SPEED * dt;
        player.x = Math.max(0, Math.min(W - PLAYER_W, player.x));

        if (input.down('jump') || input.down('action')) {
          if (playerBullets.active < 2) {
            const b = playerBullets.obtain();
            if (b) { b.x = player.x + PLAYER_W/2 - BULLET_W/2; b.y = player.y - BULLET_H; }
            beep(880, 0.06, 0.2);
          }
        }

        playerBullets.update(b => {
          b.y -= 380 * dt;
          if (b.y + b.h < 0) return false;
          for (const e of enemies) {
            if (!e.alive || !aabb(b, e)) continue;
            e.alive = false; b.active = false;
            explode(e.x + ENEMY_W/2, e.y + ENEMY_H/2, ROW_COLORS[e.row]);
            score += ROW_PTS[e.row]; if (score > best.value) best.value = score;
            beep(550, 0.07);
            return false;
          }
        });

        timer.update(dt);
        enemyBullets.update(b => {
          b.y += 200 * dt;
          if (b.y > H) return false;
          if (aabb(b, player)) {
            b.active = false; lives--;
            explode(player.x + PLAYER_W/2, player.y, '#44ff88');
            beep(180, 0.3, 0.4);
            if (lives <= 0) { fsm.go('gameover'); return false; }
            return false;
          }
        });

        ps.update(dt);

        const alive = activeEnemies();
        if (!alive.length) { resetWave(wave + 1); return; }

        moveTimer += dt;
        const speed = moveInterval * (alive.length / (ENEMY_COLS * ENEMY_ROWS));
        if (moveTimer >= Math.max(0.06, speed)) {
          moveTimer = 0;
          if (dropPending) {
            for (const e of alive) e.y += ENEMY_DROP;
            moveDir *= -1; dropPending = false;
            beep(110, 0.08, 0.3);
          } else {
            for (const e of alive) e.x += 6 * moveDir;
            const minX = Math.min(...alive.map(e => e.x));
            const maxX = Math.max(...alive.map(e => e.x + e.w));
            if (minX <= 0 || maxX >= W) dropPending = true;
            beep(moveDir > 0 ? 150 : 130, 0.04, 0.15);
          }
          if (alive.some(e => e.y + e.h >= PLAYER_Y)) { fsm.go('gameover'); return; }
        }
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
      enter()  { timer.clear(); if (score > best.value) best.value = score; },
      update() { if (input.down('action') || input.down('jump')) fsm.go('menu'); },
      render(ctx) {
        canvas.clear('#06060e'); renderGame(ctx);
        hud.fade(ctx, 0.75);
        hud.text(ctx, 'GAME OVER',     W/2, H/2-22, { font: 'bold 22px monospace', color: '#ff4444', align: 'center' });
        hud.text(ctx, `Score: ${score}`, W/2, H/2+6,  { font: '13px monadata', color: '#aaa', align: 'center' });
        hud.text(ctx, 'ENTER to menu',  W/2, H/2+30, { font: '11px monospace', color: '#888', align: 'center' });
      },
    },
  }, 'menu');

  return createGame(canvasEl, {
    width: W, height: H, pixelated: true, bgColor: '#06060e',
    update: dt  => fsm.update(dt),
    render: ctx => fsm.render(ctx),
  });
}
