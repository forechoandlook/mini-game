// Tetris
import { canvas, input, audio, hud, menu, createGame, stateMachine, savedSignal, math } from '../index.js';

const COLS = 10, ROWS = 20, CELL = 24;
const W = COLS * CELL + 120, H = ROWS * CELL;
const SX = COLS * CELL + 8;

const COLORS = ['','#00e5ff','#ffd600','#aa00ff','#00c853','#ff1744','#2979ff','#ff6d00'];
const SHAPES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
  [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
  [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
  [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
];
const LINE_PTS = [0, 100, 300, 500, 800];

function beep(freq, dur = 0.05, vol = 0.2) {
  audio.tone(freq, { type: 'square', duration: dur, volume: vol });
}

export function start(canvasEl) {
  const best = savedSignal('tetris_best', 0);
  let board, piece, px, py, shape, nextType;
  let score, lines, level, dropT, dropI;
  let flashT, flashRows;

  const rng = () => 1 + Math.floor(Math.random() * 7);

  function emptyBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  }

  function valid(sh, x, y) {
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        if (!sh[r][c]) continue;
        const cx = x + c, cy = y + r;
        if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
        if (cy >= 0 && board[cy][cx]) return false;
      }
    return true;
  }

  function spawn(type) {
    piece = type; shape = SHAPES[type];
    px = Math.floor((COLS - 4) / 2); py = 0;
    if (!valid(shape, px, py)) fsm.go('gameover');
  }

  function tryRotate() {
    const r = math.rotateMatrix(shape);
    for (const dx of [0, -1, 1, -2, 2]) {
      if (valid(r, px + dx, py)) { shape = r; px += dx; beep(440, 0.04); return; }
    }
  }

  function lock() {
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        if (shape[r][c] && py + r >= 0) board[py + r][px + c] = piece;

    const full = [];
    for (let r = 0; r < ROWS; r++)
      if (board[r].every(v => v)) full.push(r);

    if (full.length) { flashRows = full; flashT = 0.12; beep(880, 0.1, 0.3); }
    else             { beep(200, 0.06); nextPiece(); }
  }

  function applyClears() {
    const n = flashRows.length;
    for (const r of [...flashRows].sort((a, b) => b - a)) board.splice(r, 1);
    while (board.length < ROWS) board.unshift(new Array(COLS).fill(0));
    lines += n; level = 1 + Math.floor(lines / 10);
    dropI = Math.max(0.05, 0.8 - (level - 1) * 0.07);
    score += LINE_PTS[n] * level;
    if (score > best.value) best.value = score;
    flashRows = null; nextPiece();
  }

  function nextPiece() { spawn(nextType); nextType = rng(); }

  function hardDrop() {
    let d = 0;
    while (valid(shape, px, py + 1)) { py++; d++; }
    score += d * 2; lock(); beep(330, 0.04);
  }

  function ghostY() {
    let g = py;
    while (valid(shape, px, g + 1)) g++;
    return g;
  }

  function resetGame() {
    board = emptyBoard(); score = 0; lines = 0; level = 1;
    dropT = 0; dropI = 0.8; flashT = 0; flashRows = null;
    nextType = rng(); spawn(rng());
  }

  function drawCell(ctx, x, y, color, a = 1) {
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, 3);
    ctx.globalAlpha = 1;
  }

  function drawShape(ctx, sh, ox, oy, color, a = 1, cellSize = CELL) {
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        if (sh[r][c]) {
          const cs = cellSize;
          ctx.globalAlpha = a;
          ctx.fillStyle = color;
          ctx.fillRect(ox + c * cs + 1, oy + r * cs + 1, cs - 2, cs - 2);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(ox + c * cs + 1, oy + r * cs + 1, cs - 2, 3);
          ctx.globalAlpha = 1;
        }
  }

  function renderGame(ctx) {
    ctx.fillStyle = '#08080f'; ctx.fillRect(0, 0, COLS * CELL, H);
    ctx.strokeStyle = '#12121e'; ctx.lineWidth = 0.5;
    for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(c*CELL,0); ctx.lineTo(c*CELL,H); ctx.stroke(); }
    for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(0,r*CELL); ctx.lineTo(COLS*CELL,r*CELL); ctx.stroke(); }

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (board[r][c]) drawCell(ctx, c, r, COLORS[board[r][c]]);

    if (!flashRows) {
      const gy = ghostY();
      if (gy !== py) drawShape(ctx, shape, px*CELL, gy*CELL, COLORS[piece], 0.18);
      drawShape(ctx, shape, px*CELL, py*CELL, COLORS[piece]);
    }
    if (flashRows && flashT > 0) {
      const a = (flashT / 0.12) * 0.8;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      for (const r of flashRows) ctx.fillRect(0, r*CELL, COLS*CELL, CELL);
    }

    ctx.fillStyle = '#0c0c18'; ctx.fillRect(COLS*CELL, 0, 120, H);
    hud.text(ctx, 'NEXT', SX, 10, { font: '10px monospace', color: '#666' });
    drawShape(ctx, SHAPES[nextType], SX + 4, 22, COLORS[nextType], 1, 16);

    const R = W - 4;
    hud.text(ctx,  'SCORE', SX, 102, { font: '10px monospace', color: '#666' });
    hud.score(ctx, score,   R, 118,  { digits: 7, font: '11px monospace', color: '#fff' });
    hud.text(ctx,  'LINES', SX, 140, { font: '10px monospace', color: '#666' });
    hud.score(ctx, lines,   R, 156,  { digits: 4, font: '11px monospace', color: '#fff' });
    hud.text(ctx,  'LEVEL', SX, 178, { font: '10px monospace', color: '#666' });
    hud.score(ctx, level,   R, 194,  { digits: 2, font: '11px monospace', color: '#aaa' });
    if (best.value > 0) {
      hud.text(ctx,  'BEST',     SX, 222, { font: '10px monospace', color: '#444' });
      hud.score(ctx, best.value, R,  238, { digits: 7, font: '11px monospace', color: '#555' });
    }
    const tips = ['←→ move','↑  rotate','↓  soft','SPC hard','ESC pause'];
    tips.forEach((t, i) => hud.text(ctx, t, SX, H - 90 + i * 18, { font: '9px monospace', color: '#333' }));
  }

  let fsm;

  const mainMenu = menu({
    items: [{ label: 'START', action: () => fsm.go('play') }],
    x: W / 2, y: H / 2 + 20, itemW: 120, itemH: 26,
    font: '14px monospace', colorNormal: '#555', colorActive: '#fff',
  });

  fsm = stateMachine({
    menu: {
      update(dt)  { mainMenu.update(dt); },
      render(ctx) {
        canvas.clear('#0c0c18');
        hud.text(ctx, 'TETRIS', W/2, H/2-70, { font: 'bold 36px monospace', color: '#00e5ff', align: 'center' });
        if (best.value > 0)
          hud.text(ctx, `BEST  ${best.value}`, W/2, H/2-24, { font: '12px monospace', color: '#555', align: 'center' });
        mainMenu.render(ctx);
      },
    },
    play: {
      enter()    { resetGame(); },
      update(dt) {
        if (input.down('pause')) { fsm.go('pause'); return; }
        if (flashRows) { flashT -= dt; if (flashT <= 0) applyClears(); return; }

        if (input.held('left',  dt) && valid(shape, px - 1, py)) { px--; beep(300, 0.03); }
        if (input.held('right', dt) && valid(shape, px + 1, py)) { px++; beep(300, 0.03); }
        if (input.down('up') || input.down('action')) tryRotate();
        if (input.down(' ')) { hardDrop(); return; }

        const soft = input.pressed('down');
        dropT += dt;
        if (dropT >= (soft ? Math.min(0.05, dropI) : dropI)) {
          dropT = 0;
          if (valid(shape, px, py + 1)) { py++; if (soft) score++; }
          else lock();
        }
      },
      render(ctx) { canvas.clear('#08080f'); renderGame(ctx); },
    },
    pause: {
      update() { if (input.down('pause')) fsm.go('play'); },
      render(ctx) {
        canvas.clear('#08080f'); renderGame(ctx);
        hud.fade(ctx, 0.7);
        hud.text(ctx, 'PAUSED',        COLS*CELL/2, H/2 - 14, { font: 'bold 20px monospace', color: '#fff',  align: 'center' });
        hud.text(ctx, 'ESC to resume', COLS*CELL/2, H/2 + 14, { font: '11px monospace',      color: '#888', align: 'center' });
      },
    },
    gameover: {
      update() { if (input.down('action') || input.down(' ')) fsm.go('menu'); },
      render(ctx) {
        canvas.clear('#08080f'); renderGame(ctx);
        hud.fade(ctx, 0.75);
        hud.text(ctx, 'GAME OVER',     COLS*CELL/2, H/2 - 22, { font: 'bold 20px monospace', color: '#ff1744', align: 'center' });
        hud.text(ctx, `Score: ${score}`, COLS*CELL/2, H/2 + 6,  { font: '13px monospace', color: '#aaa', align: 'center' });
        hud.text(ctx, 'ENTER to menu', COLS*CELL/2, H/2 + 30, { font: '11px monospace', color: '#888', align: 'center' });
      },
    },
  }, 'menu');

  return createGame(canvasEl, {
    width: W, height: H, pixelated: true, bgColor: '#0c0c18',
    update: dt  => fsm.update(dt),
    render: ctx => fsm.render(ctx),
  });
}
