// Snake — with difficulty selection
import { canvas, loop, input, audio, hud, menu, stateMachine } from '../index.js';

const W = 320, H = 320;
const CELL = 16;
const COLS = W / CELL, ROWS = H / CELL;

const DIFFICULTIES = [
  { label: 'EASY',   interval: 0.18 },
  { label: 'NORMAL', interval: 0.12 },
  { label: 'HARD',   interval: 0.07 },
];

function beep(freq, dur = 0.06, vol = 0.3) {
  audio.tone(freq, { type: 'square', duration: dur, volume: vol });
}

export function start(canvasEl) {
  canvas.init(canvasEl, { width: W, height: H, pixelated: true });
  input.init(canvasEl);

  let snake, dir, nextDir, food, score, best = 0;
  let moveTimer, moveInterval, diffIdx = 1;
  let flashTimer = 0;

  const mainMenu = menu({
    items: [{ label: 'PLAY', action: () => fsm.go('diffSelect') }],
    x: W / 2, y: H / 2 + 20, itemW: 100, itemH: 24,
    font: '15px monospace', colorNormal: '#555', colorActive: '#fff',
  });

  const diffMenu = menu({
    items: DIFFICULTIES.map((d, i) => ({
      label: d.label,
      action: () => { diffIdx = i; fsm.go('play'); },
    })),
    x: W / 2, y: 170, itemW: 120, itemH: 26, gap: 4,
    font: '15px monospace', colorNormal: '#555', colorActive: '#fff',
    onCancel: () => fsm.go('menu'),
  });

  function placeFood() {
    const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
    let fx, fy;
    do { fx = Math.floor(Math.random() * COLS); fy = Math.floor(Math.random() * ROWS); }
    while (occupied.has(`${fx},${fy}`));
    food = { x: fx, y: fy };
  }

  function resetGame() {
    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
    snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    dir = { x: 1, y: 0 }; nextDir = { x: 1, y: 0 };
    score = 0;
    moveInterval = DIFFICULTIES[diffIdx].interval;
    moveTimer = moveInterval;
    placeFood();
  }

  function renderGrid(ctx) {
    ctx.strokeStyle = '#151b22'; ctx.lineWidth = 0.5;
    for (let x = 0; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke(); }
    for (let y = 0; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke(); }
  }

  function renderGame(ctx) {
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4);
    snake.forEach((seg, i) => {
      ctx.fillStyle = `rgb(40,${Math.round(180 - i / snake.length * 60)},40)`;
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
    });
    ctx.fillStyle = '#88ff88';
    ctx.fillRect(snake[0].x * CELL + 2, snake[0].y * CELL + 2, CELL - 4, CELL - 4);
    hud.text(ctx, `${score}`,                  6,     14, { font: '12px monospace', color: '#aaa' });
    hud.text(ctx, DIFFICULTIES[diffIdx].label, W - 6, 14, { font: '12px monospace', color: '#444', align: 'right' });
  }

  const fsm = stateMachine({
    menu: {
      enter()     { diffMenu.index = diffIdx; },
      update(dt)  { mainMenu.update(dt); },
      render(ctx) {
        renderGrid(ctx);
        hud.text(ctx, 'SNAKE', W / 2, 96, { font: 'bold 24px monospace', color: '#fff', align: 'center' });
        if (best > 0) hud.text(ctx, `BEST: ${best}`, W / 2, 122, { font: '12px monospace', color: '#ffcc00', align: 'center' });
        mainMenu.render(ctx);
      },
    },

    diffSelect: {
      update(dt)  { diffMenu.update(dt); },
      render(ctx) {
        renderGrid(ctx);
        hud.text(ctx, 'SELECT DIFFICULTY', W / 2, 96, { font: 'bold 16px monospace', color: '#fff', align: 'center' });
        diffMenu.render(ctx);
        hud.text(ctx, 'ESC to back', W / 2, 258, { font: '11px monospace', color: '#444', align: 'center' });
      },
    },

    play: {
      enter()    { resetGame(); },
      update(dt) {
        if (input.down('left')  && dir.x === 0) nextDir = { x: -1, y:  0 };
        if (input.down('right') && dir.x === 0) nextDir = { x:  1, y:  0 };
        if (input.down('up')    && dir.y === 0) nextDir = { x:  0, y: -1 };
        if (input.down('down')  && dir.y === 0) nextDir = { x:  0, y:  1 };
        if (input.down('pause')) { fsm.go('menu'); return; }

        moveTimer -= dt;
        if (moveTimer > 0) return;
        moveTimer = moveInterval;
        dir = nextDir;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
            snake.some(s => s.x === head.x && s.y === head.y)) {
          if (score > best) best = score;
          flashTimer = 0.3; beep(180, 0.3, 0.5);
          fsm.go('gameover'); return;
        }

        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score++; beep(880, 0.05, 0.25); placeFood();
          if (diffIdx === 2) moveInterval = Math.max(0.04, moveInterval - 0.002);
          if (diffIdx === 1) moveInterval = Math.max(0.07, moveInterval - 0.001);
        } else {
          snake.pop();
        }
      },
      render(ctx) { renderGrid(ctx); renderGame(ctx); },
    },

    gameover: {
      update(dt) {
        flashTimer -= dt;
        if (flashTimer <= 0 && (input.down('action') || input.down('jump'))) fsm.go('menu');
      },
      render(ctx) {
        renderGrid(ctx); renderGame(ctx);
        if (flashTimer > 0) {
          ctx.fillStyle = `rgba(255,80,80,${flashTimer * 2})`; ctx.fillRect(0, 0, W, H);
        } else {
          hud.fade(ctx, 0.6);
          hud.text(ctx, 'GAME OVER',                    W / 2, H / 2 - 26, { font: 'bold 20px monospace', color: '#fff', align: 'center' });
          hud.text(ctx, `Score: ${score}  Best: ${best}`, W / 2, H / 2 + 2,  { font: '13px monospace',      color: '#aaa', align: 'center' });
          hud.text(ctx, 'ENTER to menu',                W / 2, H / 2 + 26, { font: '12px monospace',      color: '#888', align: 'center' });
        }
      },
    },
  }, 'menu');

  loop.start(dt => { fsm.update(dt); input.flush(); }, () => {
    canvas.clear('#0d1117');
    fsm.render(canvas.ctx);
  });

  return () => { loop.stop(); canvas.clear('#0a0a0a'); };
}
