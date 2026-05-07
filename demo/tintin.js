import { createGame, input } from '../index.js';

const W = 480, H = 320;

export function start(canvasEl) {
  let score = 0, lives = 3, hearts = [], particles = [], gameOver = false;
  let paddleX = W / 2, spawnTimer = 0, spawnInterval = 1.2, level = 1, t = 0;

  function spawnHeart() {
    hearts.push({
      x: 30 + Math.random() * (W - 60),
      y: -20,
      speed: 60 + Math.random() * 40 + level * 8,
      wobble: Math.random() * Math.PI * 2,
      size: 14 + Math.random() * 8,
    });
  }

  function drawHeart(ctx, x, y, size, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ff69b4';
    ctx.shadowColor = '#ff9fd4';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.3);
    ctx.bezierCurveTo(x, y, x - size * 0.5, y, x - size * 0.5, y + size * 0.3);
    ctx.bezierCurveTo(x - size * 0.5, y + size * 0.65, x, y + size * 0.9, x, y + size);
    ctx.bezierCurveTo(x, y + size * 0.9, x + size * 0.5, y + size * 0.65, x + size * 0.5, y + size * 0.3);
    ctx.bezierCurveTo(x + size * 0.5, y, x, y, x, y + size * 0.3);
    ctx.fill();
    ctx.restore();
  }

  const stop = createGame(canvasEl, {
    width: W, height: H, pixelated: false, bgColor: '#0a0005',

    update(dt) {
      if (gameOver) return;
      t += dt;

      // paddle movement
      const speed = 320;
      if (input.key('ArrowLeft') || input.key('a')) paddleX -= speed * dt;
      if (input.key('ArrowRight') || input.key('d')) paddleX += speed * dt;
      paddleX = Math.max(40, Math.min(W - 40, paddleX));

      // spawn
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnHeart();
        spawnTimer = spawnInterval * (0.7 + Math.random() * 0.6);
        spawnInterval = Math.max(0.4, spawnInterval - 0.015);
      }

      level = 1 + Math.floor(score / 10);

      // update hearts
      hearts = hearts.filter(h => {
        h.y += h.speed * dt;
        h.x += Math.sin(h.wobble + t * 2) * 0.5;
        const py = H - 18, halfW = 36;
        if (h.y + h.size > py - 8 && h.y < py + 8 && Math.abs(h.x - paddleX) < halfW + h.size * 0.4) {
          score++;
          // burst particles
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            particles.push({ x: h.x, y: h.y, vx: Math.cos(ang) * 60, vy: Math.sin(ang) * 60, life: 0.5 });
          }
          return false;
        }
        if (h.y > H + 10) { lives--; return false; }
        return true;
      });

      particles = particles.filter(p => {
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        return p.life > 0;
      });

      if (lives <= 0) gameOver = true;
    },

    render(ctx) {
      // title
      ctx.fillStyle = '#ff69b4';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✨ TINTIN\'S GAME ✨', W / 2, 18);

      // HUD
      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`SCORE: ${score}`, 10, 18);
      ctx.textAlign = 'right';
      ctx.fillText('❤️'.repeat(lives), W - 8, 18);

      // level ribbon
      ctx.textAlign = 'center';
      ctx.fillStyle = '#444';
      ctx.font = '10px monospace';
      ctx.fillText(`LV ${level}`, W / 2, H - 4);

      // falling hearts
      hearts.forEach(h => drawHeart(ctx, h.x - h.size * 0.5, h.y - h.size * 0.5, h.size));

      // particles
      particles.forEach(p => {
        const alpha = p.life / 0.5;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff9fd4';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // paddle
      const py = H - 18;
      ctx.save();
      ctx.fillStyle = '#ff69b4';
      ctx.shadowColor = '#ff69b4';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(paddleX - 36, py - 6, 72, 12, 6);
      ctx.fill();
      ctx.restore();

      // game over
      if (gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff69b4';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER 💔', W / 2, H / 2 - 16);
        ctx.fillStyle = '#fff';
        ctx.font = '13px monospace';
        ctx.fillText(`SCORE: ${score}`, W / 2, H / 2 + 10);
        ctx.fillStyle = '#888';
        ctx.font = '11px monospace';
        ctx.fillText('← BACK to play again', W / 2, H / 2 + 32);
      }
    },
  });

  return stop;
}
