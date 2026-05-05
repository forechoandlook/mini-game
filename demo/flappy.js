// Flappy Bird
import { canvas, loop, input, audio, hud, stateMachine } from '../index.js';

const W = 320, H = 480;
const GRAVITY = 1400;
const JUMP_VY = -440;
const PIPE_W = 52, PIPE_GAP = 130, PIPE_SPEED = 140;
const BIRD_R = 10;
const SPAWN_INTERVAL = 1.6;

function beep(freq, dur = 0.05, vol = 0.3) {
  audio.tone(freq, { type: 'square', duration: dur, volume: vol });
}

export function start(canvasEl) {
  canvas.init(canvasEl, { width: W, height: H, pixelated: true });
  input.init(canvasEl);

  let bird = {}, pipes = [], score = 0, best = 0;
  let spawnTimer = 0, flashTimer = 0;

  function resetGame() {
    bird = { x: 80, y: H / 2, vy: 0 };
    pipes = []; score = 0;
    spawnTimer = SPAWN_INTERVAL * 0.6;
    flashTimer = 0;
  }

  function tryJump() {
    bird.vy = JUMP_VY;
    beep(660, 0.06);
  }

  function tapPressed() {
    return input.down('jump') || input.down('action') || input.mouse.justDown.value;
  }

  function spawnPipe() {
    const topH = 60 + Math.random() * (H - 120 - PIPE_GAP);
    pipes.push({ x: W + 10, topH, scored: false });
  }

  function renderBg(ctx) {
    ctx.fillStyle = '#1a2a4a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3a6b2a'; ctx.fillRect(0, H - 24, W, 24);
    ctx.fillStyle = '#2a4a1a'; ctx.fillRect(0, H - 24, W, 4);
  }

  function renderPipes(ctx) {
    for (const p of pipes) {
      ctx.fillStyle = '#3a8a3a'; ctx.fillRect(p.x, 0, PIPE_W, p.topH);
      ctx.fillStyle = '#4aaa4a'; ctx.fillRect(p.x - 3, p.topH - 14, PIPE_W + 6, 14);
      const btmY = p.topH + PIPE_GAP;
      ctx.fillStyle = '#3a8a3a'; ctx.fillRect(p.x, btmY, PIPE_W, H - btmY);
      ctx.fillStyle = '#4aaa4a'; ctx.fillRect(p.x - 3, btmY, PIPE_W + 6, 14);
    }
  }

  function renderBird(ctx, dead = false) {
    const { x: bx, y: by, vy } = bird;
    ctx.fillStyle = dead ? '#ff4444' : '#ffcc00';
    ctx.beginPath(); ctx.arc(bx, by, BIRD_R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dead ? '#cc2222' : '#ffaa00';
    const wAngle = Math.min(Math.PI / 3, Math.max(-Math.PI / 3, vy / 800));
    ctx.beginPath(); ctx.ellipse(bx - 4, by + 4, 8, 4, wAngle, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx + 4, by - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(bx + 5, by - 3, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  const fsm = stateMachine({
    menu: {
      update() { if (tapPressed()) fsm.go('play'); },
      render(ctx) {
        renderBg(ctx);
        hud.text(ctx, 'FLAPPY BIRD',         W / 2, 155, { font: 'bold 26px monospace', color: '#fff',    align: 'center' });
        hud.text(ctx, 'TAP / SPACE to jump', W / 2, 195, { font: '13px monospace',      color: '#aaa',    align: 'center' });
        if (best > 0) hud.text(ctx, `BEST: ${best}`, W / 2, 232, { font: '13px monospace', color: '#ffcc00', align: 'center' });
      },
    },

    play: {
      enter()    { resetGame(); },
      update(dt) {
        if (tapPressed()) tryJump();

        bird.vy += GRAVITY * dt;
        bird.y  += bird.vy * dt;
        if (bird.y - BIRD_R < 0) { bird.y = BIRD_R; bird.vy = 0; }

        if (bird.y + BIRD_R >= H) {
          bird.y = H - BIRD_R;
          if (score > best) best = score;
          flashTimer = 0.3; beep(180, 0.25, 0.5); fsm.go('dead'); return;
        }

        spawnTimer -= dt;
        if (spawnTimer <= 0) { spawnPipe(); spawnTimer = SPAWN_INTERVAL; }

        for (const p of pipes) {
          p.x -= PIPE_SPEED * dt;
          if (!p.scored && p.x + PIPE_W < bird.x) { p.scored = true; score++; beep(880, 0.04, 0.2); }
          if (bird.x + BIRD_R > p.x && bird.x - BIRD_R < p.x + PIPE_W &&
              (bird.y - BIRD_R < p.topH || bird.y + BIRD_R > p.topH + PIPE_GAP)) {
            if (score > best) best = score;
            flashTimer = 0.3; beep(180, 0.25, 0.5); fsm.go('dead'); return;
          }
        }
        pipes = pipes.filter(p => p.x + PIPE_W > -10);
      },
      render(ctx) {
        renderBg(ctx); renderPipes(ctx); renderBird(ctx);
        hud.score(ctx, score, W / 2, 48, { digits: 1, font: 'bold 28px monospace', color: '#fff', align: 'center' });
      },
    },

    dead: {
      update(dt) {
        flashTimer -= dt;
        if (flashTimer <= 0 && tapPressed()) fsm.go('play');
      },
      render(ctx) {
        renderBg(ctx); renderPipes(ctx);
        renderBird(ctx, flashTimer <= 0.15);
        hud.score(ctx, score, W / 2, 48, { digits: 1, font: 'bold 28px monospace', color: '#fff', align: 'center' });
        if (flashTimer > 0) {
          ctx.fillStyle = `rgba(255,255,255,${flashTimer * 2})`; ctx.fillRect(0, 0, W, H);
        } else {
          hud.fade(ctx, 0.55);
          hud.text(ctx, 'GAME OVER',                    W / 2, H / 2 - 32, { font: 'bold 22px monospace', color: '#fff', align: 'center' });
          hud.text(ctx, `Score: ${score}  Best: ${best}`, W / 2, H / 2 + 2,  { font: '14px monospace',      color: '#aaa', align: 'center' });
          hud.text(ctx, 'TAP to restart',               W / 2, H / 2 + 28, { font: '13px monospace',      color: '#888', align: 'center' });
        }
      },
    },
  }, 'menu');

  loop.start(dt => { fsm.update(dt); input.flush(); }, () => {
    canvas.clear('#1a2a4a');
    fsm.render(canvas.ctx);
  });

  return () => { loop.stop(); canvas.clear('#0a0a0a'); };
}
