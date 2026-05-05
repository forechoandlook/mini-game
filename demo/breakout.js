// Breakout / 打砖块
import { canvas, loop, input, audio, hud, menu, stateMachine } from '../index.js';

const W = 400, H = 480;
const PADDLE_W = 70, PADDLE_H = 10, PADDLE_Y = H - 40;
const BALL_R = 7;
const BALL_SPEED = 300;
const COLS = 10, ROWS = 5;
const BRICK_W = 34, BRICK_H = 14;
const BRICK_OFF_X = 13, BRICK_OFF_Y = 50;
const BRICK_GAP = 2;
const ROW_COLORS = ['#ff4444', '#ff8844', '#ffcc44', '#88dd44', '#44aaff'];

function beep(freq, dur = 0.06, vol = 0.3) {
  audio.tone(freq, { type: 'square', duration: dur, volume: vol });
}

export function start(canvasEl) {
  canvas.init(canvasEl, { width: W, height: H, pixelated: true });
  input.init(canvasEl);

  let paddle, ball, bricks, score, lives, best = 0;

  function makeBricks() {
    const list = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        list.push({ x: BRICK_OFF_X + c * (BRICK_W + BRICK_GAP), y: BRICK_OFF_Y + r * (BRICK_H + BRICK_GAP),
                    w: BRICK_W, h: BRICK_H, alive: true, row: r });
    return list;
  }

  function resetGame() {
    paddle = { x: W / 2 - PADDLE_W / 2, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H };
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    ball = { x: W / 2, y: PADDLE_Y - 20, vx: BALL_SPEED * Math.cos(angle), vy: BALL_SPEED * Math.sin(angle), r: BALL_R };
    bricks = makeBricks();
    score = 0; lives = 3;
  }

  function rectVsBall(b, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(b.x, rx + rw)), ny = Math.max(ry, Math.min(b.y, ry + rh));
    return (b.x - nx) ** 2 + (b.y - ny) ** 2 <= b.r * b.r;
  }
  function resolveVsBall(b, rx, ry, rw, rh) {
    const oL = b.x + b.r - rx, oR = rx + rw - (b.x - b.r);
    const oT = b.y + b.r - ry, oB = ry + rh - (b.y - b.r);
    if (Math.min(oL, oR) < Math.min(oT, oB))
      b.vx = oL < oR ? -Math.abs(b.vx) : Math.abs(b.vx);
    else
      b.vy = oT < oB ? -Math.abs(b.vy) : Math.abs(b.vy);
  }

  const actionMenu = menu({
    items: [{ label: 'START', action: () => { resetGame(); fsm.go('play'); } }],
    x: W / 2, y: H / 2 + 60, itemW: 120, itemH: 24,
    font: '15px monospace', colorNormal: '#555', colorActive: '#fff',
  });

  function renderGame(ctx) {
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = ROW_COLORS[b.row]; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(b.x, b.y, b.w, 3);
    }
    ctx.fillStyle = '#8888ff';
    ctx.beginPath(); ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 4); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    hud.text(ctx, `Score: ${score}`, 8, H - 10, { font: '12px monospace', color: '#aaa' });
    hud.pips(ctx, W - 8 - lives * 14, H - 16, 10, 4, 3, lives, { color: '#ff4444', bg: '#333' });
  }

  const fsm = stateMachine({
    menu: {
      update(dt)  { actionMenu.update(dt); },
      render(ctx) {
        hud.text(ctx, 'BREAKOUT', W / 2, 155, { font: 'bold 26px monospace', color: '#fff', align: 'center' });
        hud.text(ctx, 'Move mouse to control paddle', W / 2, 183, { font: '12px monospace', color: '#555', align: 'center' });
        if (best > 0) hud.text(ctx, `BEST: ${best}`, W / 2, 210, { font: '12px monospace', color: '#ffcc00', align: 'center' });
        actionMenu.render(ctx);
      },
    },

    play: {
      enter()    { resetGame(); },
      update(dt) {
        if (input.down('pause')) { fsm.go('pause'); return; }

        paddle.x = input.mouse.x.value - PADDLE_W / 2;
        if (input.pressed('left'))  paddle.x -= 380 * dt;
        if (input.pressed('right')) paddle.x += 380 * dt;
        paddle.x = Math.max(0, Math.min(W - PADDLE_W, paddle.x));

        ball.x += ball.vx * dt; ball.y += ball.vy * dt;

        if (ball.x - BALL_R < 0)  { ball.x = BALL_R;   ball.vx =  Math.abs(ball.vx); beep(440); }
        if (ball.x + BALL_R > W)  { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); beep(440); }
        if (ball.y - BALL_R < 0)  { ball.y = BALL_R;   ball.vy =  Math.abs(ball.vy); beep(440); }

        if (rectVsBall(ball, paddle.x, paddle.y, paddle.w, paddle.h) && ball.vy > 0) {
          const rel = (ball.x - (paddle.x + PADDLE_W / 2)) / (PADDLE_W / 2);
          const angle = rel * 1.1 - Math.PI / 2;
          const speed = Math.hypot(ball.vx, ball.vy);
          ball.vx = speed * Math.cos(angle); ball.vy = speed * Math.sin(angle);
          if (ball.vy > -50) ball.vy = -50;
          beep(330, 0.05);
        }

        for (const b of bricks) {
          if (!b.alive || !rectVsBall(ball, b.x, b.y, b.w, b.h)) continue;
          b.alive = false; resolveVsBall(ball, b.x, b.y, b.w, b.h);
          score += (ROWS - b.row) * 10; beep(550 + b.row * 80, 0.06); break;
        }

        if (ball.y - BALL_R > H) {
          lives--; beep(220, 0.2, 0.5);
          if (lives <= 0) {
            if (score > best) best = score;
            actionMenu.setItems([{ label: 'RETRY', action: () => { resetGame(); fsm.go('play'); } }]);
            fsm.go('gameover');
          } else {
            ball.x = W / 2; ball.y = PADDLE_Y - 20;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
            ball.vx = BALL_SPEED * Math.cos(a); ball.vy = BALL_SPEED * Math.sin(a);
          }
        }

        if (bricks.every(b => !b.alive)) {
          if (score > best) best = score;
          actionMenu.setItems([{ label: 'NEXT', action: () => { resetGame(); fsm.go('play'); } }]);
          beep(880, 0.1, 0.3); fsm.go('win');
        }
      },
      render(ctx) { renderGame(ctx); },
    },

    pause: {
      update() { if (input.down('pause')) fsm.go('play'); },
      render(ctx) {
        renderGame(ctx);
        hud.fade(ctx, 0.5);
        hud.text(ctx, 'PAUSED', W / 2, H / 2, { font: '18px monospace', color: '#fff', align: 'center' });
      },
    },

    gameover: {
      update(dt)  { actionMenu.update(dt); },
      render(ctx) {
        renderGame(ctx);
        hud.fade(ctx, 0.65);
        hud.text(ctx, 'GAME OVER', W / 2, H / 2 - 28, { font: 'bold 22px monospace', color: '#ff4444', align: 'center' });
        hud.text(ctx, `Score: ${score}   Best: ${best}`, W / 2, H / 2 + 4, { font: '13px monospace', color: '#aaa', align: 'center' });
        actionMenu.render(ctx);
      },
    },

    win: {
      update(dt)  { actionMenu.update(dt); },
      render(ctx) {
        renderGame(ctx);
        hud.fade(ctx, 0.65);
        hud.text(ctx, 'YOU WIN!', W / 2, H / 2 - 28, { font: 'bold 22px monospace', color: '#ffcc00', align: 'center' });
        hud.text(ctx, `Score: ${score}   Best: ${best}`, W / 2, H / 2 + 4, { font: '13px monospace', color: '#aaa', align: 'center' });
        actionMenu.render(ctx);
      },
    },
  }, 'menu');

  loop.start(dt => { fsm.update(dt); input.flush(); }, () => {
    canvas.clear('#0a0a14');
    fsm.render(canvas.ctx);
  });

  return () => { loop.stop(); canvas.clear('#0a0a0a'); };
}
