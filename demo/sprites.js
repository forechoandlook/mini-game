// Sprite Sheet Demo — spriteSheet() API with real PNG assets
// Assets:
//   characters.png  384×672   32×32/frame  (12 cols × 21 rows, RPG walk cycles)
//   coin.png        1024×128  128×128/frame (8 frames, spin cycle, CC0)
//   explosion.png   1024×1024 128×128/frame (8×8 grid = 64 frames, CC0)
import { createGame, assets, spriteSheet, input } from '../index.js';

const W = 480, H = 380;
const FW_CHAR = 32, FH_CHAR = 32;
const FW_COIN = 128, FH_COIN = 128;
const FW_EXP  = 128, FH_EXP  = 128;

function makeCharAnims(sheet, colOffset) {
  const c = colOffset;
  return {
    down:  sheet.anim('down',  [c,    c+1,  c+2 ], 6),
    left:  sheet.anim('left',  [c+12, c+13, c+14], 6),
    right: sheet.anim('right', [c+24, c+25, c+26], 6),
    up:    sheet.anim('up',    [c+36, c+37, c+38], 6),
  };
}

export function start(canvasEl) {
  assets.clear();
  assets.add('chars',     './assets/characters.png');
  assets.add('coin',      './assets/coin.png');
  assets.add('explosion', './assets/explosion.png');

  let charSheet, coinSheet, expSheet;
  let walkers, coins, explosions;

  return createGame(canvasEl, {
    width: W, height: H, pixelated: true, bgColor: '#1d2b53',
    preload: () => assets.load(),
    initial: 'play',
    states: () => ({
      play: {
        enter() {
          // ── characters ───────────────────────────────────────────────────
          charSheet = spriteSheet(assets.getImage('chars'), FW_CHAR, FH_CHAR);
          walkers = [0, 3, 6, 9].map((colOffset, i) => {
            const anims = makeCharAnims(charSheet, colOffset);
            const goRight = i % 2 === 0;
            return {
              x: goRight ? 20 : W - 20 - FW_CHAR * 3,
              y: 28 + i * 52,
              dx: (goRight ? 1 : -1) * (38 + i * 10),
              scale: 3,
              anims,
              anim: goRight ? anims.right : anims.left,
            };
          });

          // ── coins ─────────────────────────────────────────────────────────
          coinSheet = spriteSheet(assets.getImage('coin'), FW_COIN, FH_COIN);
          const coinFrames = [0, 1, 2, 3, 4, 5, 6, 7];
          coins = Array.from({ length: 6 }, (_, i) => ({
            x: 16 + i * 74,
            y: H - 68,
            anim: coinSheet.anim('spin', coinFrames, 10 + i),
            scale: 0.45,
          }));

          // ── explosions (triggered on Space / tap) ─────────────────────────
          expSheet = spriteSheet(assets.getImage('explosion'), FW_EXP, FH_EXP);
          explosions = [];
        },

        update(dt) {
          // walkers
          for (const w of walkers) {
            w.x += w.dx * dt;
            const fw = FW_CHAR * w.scale;
            if (w.x + fw > W - 8 && w.dx > 0) {
              w.dx = -Math.abs(w.dx);
              w.anim = w.anims.left; w.anim.reset();
            } else if (w.x < 8 && w.dx < 0) {
              w.dx = Math.abs(w.dx);
              w.anim = w.anims.right; w.anim.reset();
            }
            w.anim.update(dt);
          }

          // coins
          for (const c of coins) c.anim.update(dt);

          // explosions
          for (const e of explosions) e.anim.update(dt);
          // remove finished ones
          for (let i = explosions.length - 1; i >= 0; i--) {
            if (explosions[i].anim.done) explosions.splice(i, 1);
          }

          // spawn explosion on Space
          if (input.pressed('Space') || input.pressed('KeyZ')) {
            spawnExplosion(Math.random() * (W - 80) + 40, Math.random() * 200 + 30);
          }
        },

        render(ctx) {
          // section: walkers
          ctx.strokeStyle = '#3d5a80'; ctx.lineWidth = 1;
          for (const w of walkers) {
            ctx.beginPath();
            ctx.moveTo(0, w.y + FH_CHAR * w.scale + 1);
            ctx.lineTo(W, w.y + FH_CHAR * w.scale + 1);
            ctx.stroke();
            w.anim.draw(ctx, w.x, w.y, { scale: w.scale });
          }

          // section: coins
          ctx.fillStyle = '#0a0a1a';
          ctx.fillRect(0, H - 78, W, 78);
          ctx.fillStyle = '#ffffff44';
          ctx.font = '10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText('coin spin × 6 speeds   |   [Space] spawn explosion', 8, H - 64);
          for (const c of coins) {
            c.anim.draw(ctx, c.x, c.y, { scale: c.scale });
          }

          // explosions (drawn on top)
          for (const e of explosions) {
            e.anim.draw(ctx, e.x, e.y, { scale: e.scale });
          }

          // labels
          ctx.fillStyle = '#ffffff55';
          ctx.font = '10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText('characters.png  32×32  walk cycle', 8, 14);
        },
      },
    }),
  });

  function spawnExplosion(x, y) {
    const scale = 0.6 + Math.random() * 0.4;
    const anim = expSheet.anim('boom', Array.from({ length: 64 }, (_, i) => i), 20);
    anim.setLoop(false);
    explosions.push({ x: x - FW_EXP * scale / 2, y: y - FH_EXP * scale / 2, anim, scale });
  }
}
