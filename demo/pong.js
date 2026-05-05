// Pong — player vs AI (or 2P with keys W/S + Up/Down)
import { canvas, loop, input, audio, hud, menu, stateMachine } from '../index.js';

const W = 480, H = 320;
const PADDLE_W = 10, PADDLE_H = 60;
const BALL_SIZE = 10;
const PADDLE_SPEED = 240;
const BALL_SPEED_INIT = 220;
const WIN_SCORE = 7;

function beep(freq, dur = 0.06, vol = 0.3) {
  audio.tone(freq, { type: 'square', duration: dur, volume: vol });
}

export function start(canvasEl) {
  canvas.init(canvasEl, { width: W, height: H, pixelated: true });
  input.init(canvasEl);

  let score = [0, 0], winner = 0, twoPlayer = false;
  let ball = {}, p1 = {}, p2 = {};

  function resetBall(dir = 1) {
    const angle = Math.random() * 0.8 - 0.4;
    ball = {
      x: W / 2 - BALL_SIZE / 2, y: H / 2 - BALL_SIZE / 2,
      vx: BALL_SPEED_INIT * dir * Math.cos(angle),
      vy: BALL_SPEED_INIT * Math.sin(angle),
    };
  }

  function resetGame() {
    score = [0, 0];
    p1 = { x: 16,              y: H / 2 - PADDLE_H / 2, w: PADDLE_W, h: PADDLE_H };
    p2 = { x: W - 16 - PADDLE_W, y: H / 2 - PADDLE_H / 2, w: PADDLE_W, h: PADDLE_H };
    resetBall(Math.random() < 0.5 ? 1 : -1);
  }

  const mainMenu = menu({
    items: [
      { label: '1 PLAYER',  action: () => { twoPlayer = false; fsm.go('play'); } },
      { label: '2 PLAYERS', action: () => { twoPlayer = true;  fsm.go('play'); } },
    ],
    x: W / 2, y: H / 2 + 20, itemW: 140, itemH: 24, gap: 8,
    font: '14px monospace', colorNormal: '#555', colorActive: '#fff',
  });

  const gameoverMenu = menu({
    items: [{ label: 'MENU', action: () => fsm.go('menu') }],
    x: W / 2, y: H / 2 + 50, itemW: 100, itemH: 22,
    font: '13px monospace', colorNormal: '#555', colorActive: '#fff',
  });

  function updateBall() {
    ball.x += ball.vx / 60;
    ball.y += ball.vy / 60;

    if (ball.y <= 0)             { ball.y = 0;            ball.vy =  Math.abs(ball.vy); beep(660); }
    if (ball.y + BALL_SIZE >= H) { ball.y = H - BALL_SIZE; ball.vy = -Math.abs(ball.vy); beep(660); }

    function hitPaddle(paddle, isLeft) {
      if (ball.x < paddle.x + paddle.w && ball.x + BALL_SIZE > paddle.x &&
          ball.y < paddle.y + paddle.h && ball.y + BALL_SIZE > paddle.y) {
        const rel   = (ball.y + BALL_SIZE / 2 - (paddle.y + PADDLE_H / 2)) / (PADDLE_H / 2);
        const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.05, 600);
        ball.vx = (isLeft ? 1 : -1) * speed * Math.cos(rel * 1.1);
        ball.vy = speed * Math.sin(rel * 1.1);
        ball.x  = isLeft ? paddle.x + paddle.w : paddle.x - BALL_SIZE;
        beep(440);
      }
    }
    hitPaddle(p1, true);
    hitPaddle(p2, false);

    if (ball.x + BALL_SIZE < 0) {
      score[1]++; beep(220, 0.15, 0.4);
      if (score[1] >= WIN_SCORE) { winner = 2; fsm.go('gameover'); } else resetBall(1);
    }
    if (ball.x > W) {
      score[0]++; beep(220, 0.15, 0.4);
      if (score[0] >= WIN_SCORE) { winner = 1; fsm.go('gameover'); } else resetBall(-1);
    }
  }

  function renderGame(ctx) {
    ctx.fillStyle = '#222';
    for (let y = 0; y < H; y += 16) ctx.fillRect(W / 2 - 1, y, 2, 10);
    ctx.fillStyle = '#fff';
    ctx.fillRect(p1.x, p1.y, p1.w, p1.h);
    ctx.fillRect(p2.x, p2.y, p2.w, p2.h);
    ctx.fillRect(ball.x, ball.y, BALL_SIZE, BALL_SIZE);
    hud.score(ctx, score[0], W / 2 - 60, 48, { digits: 1, font: 'bold 32px monospace', color: '#555', align: 'center' });
    hud.score(ctx, score[1], W / 2 + 60, 48, { digits: 1, font: 'bold 32px monospace', color: '#555', align: 'center' });
  }

  const fsm = stateMachine({
    menu: {
      update(dt)  { mainMenu.update(dt); },
      render(ctx) {
        hud.text(ctx, 'PONG',           W / 2,  80, { font: 'bold 28px monospace', color: '#fff', align: 'center' });
        hud.text(ctx, 'P1: W/S   P2: ↑/↓', W / 2, 110, { font: '11px monospace', color: '#444', align: 'center' });
        mainMenu.render(ctx);
      },
    },

    play: {
      enter() { resetGame(); },
      update(dt) {
        if (input.down('pause')) { fsm.go('pause'); return; }

        if (input.pressed('w')) p1.y -= PADDLE_SPEED * dt;
        if (input.pressed('s')) p1.y += PADDLE_SPEED * dt;
        p1.y = Math.max(0, Math.min(H - PADDLE_H, p1.y));

        if (twoPlayer) {
          if (input.pressed('ArrowUp'))   p2.y -= PADDLE_SPEED * dt;
          if (input.pressed('ArrowDown')) p2.y += PADDLE_SPEED * dt;
        } else {
          const diff = (ball.y + BALL_SIZE / 2) - (p2.y + PADDLE_H / 2);
          p2.y += Math.sign(diff) * Math.min(Math.abs(diff), PADDLE_SPEED * 0.85 * dt);
        }
        p2.y = Math.max(0, Math.min(H - PADDLE_H, p2.y));

        updateBall();
      },
      render(ctx) { renderGame(ctx); },
    },

    pause: {
      update() {
        if (input.down('pause')) fsm.go('play');
      },
      render(ctx) {
        renderGame(ctx);
        hud.fade(ctx, 0.5);
        hud.text(ctx, 'PAUSED',     W / 2, H / 2,      { font: '18px monospace', color: '#fff', align: 'center' });
        hud.text(ctx, 'ESC resume', W / 2, H / 2 + 24, { font: '11px monospace', color: '#888', align: 'center' });
      },
    },

    gameover: {
      update(dt) { gameoverMenu.update(dt); },
      render(ctx) {
        renderGame(ctx);
        hud.fade(ctx, 0.6);
        hud.text(ctx, `PLAYER ${winner} WINS!`,   W / 2, H / 2 - 20, { font: 'bold 22px monospace', color: '#fff', align: 'center' });
        hud.text(ctx, `${score[0]}  :  ${score[1]}`, W / 2, H / 2 + 12, { font: '14px monospace', color: '#888', align: 'center' });
        gameoverMenu.render(ctx);
      },
    },
  }, 'menu');

  loop.start(dt => { fsm.update(dt); input.flush(); }, () => {
    canvas.clear('#0a0a0a');
    fsm.render(canvas.ctx);
  });

  return () => { loop.stop(); canvas.clear('#0a0a0a'); };
}
