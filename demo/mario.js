// Super Mario prototype — procedural graphics, no external assets
import { canvas, input, audio, hud, fx, draw, createGame,
         camera, tilemap, body, applyGravity, move, aabb,
         stateMachine, math, savedSignal } from '../index.js';

const TILE = 16, W = 320, H = 200;
const LEVEL_W = 64, LEVEL_H = 14;
const GR = 12; // ground row (0-indexed)

// ── Tile IDs ─────────────────────────────────────────────────────────────────
const [AIR, GND, BRK, QST, QSD, PTP, PTB] = [0,1,2,3,4,5,6];
const SOLID_IDS = new Set([GND, BRK, QST, QSD, PTP, PTB]);

// ── Level builder ─────────────────────────────────────────────────────────────
function buildLevel() {
  const g = Array.from({length: LEVEL_H}, () => new Array(LEVEL_W).fill(AIR));
  const s = (c, r, id) => { if (r>=0&&r<LEVEL_H&&c>=0&&c<LEVEL_W) g[r][c]=id; };
  const row = (r, c0, c1, id) => { for (let c=c0;c<=c1;c++) s(c,r,id); };

  // ground with pit at col 11-12
  row(GR,   0, 10, GND); row(GR,   13, LEVEL_W-1, GND);
  row(GR+1, 0, 10, GND); row(GR+1, 13, LEVEL_W-1, GND);

  // section 1 — question blocks and bricks
  s(4,GR-3,QST); row(GR-3,7,8,BRK); s(9,GR-3,QST); row(GR-3,10,11,BRK);

  // pipe 1 (cols 15-16)
  s(15,GR-2,PTP); s(16,GR-2,PTP); s(15,GR-1,PTB); s(16,GR-1,PTB);

  // section 2
  row(GR-3,20,21,BRK); s(22,GR-3,QST); row(GR-3,23,24,BRK);

  // elevated platform + question blocks underneath
  row(GR-4,27,31,GND); row(GR-3,27,31,QST);

  // pipe 2 (cols 34-35)
  s(34,GR-3,PTP); s(35,GR-3,PTP); row(GR-2,34,35,PTB); row(GR-1,34,35,PTB);

  // section 3
  row(GR-3,38,39,BRK); s(40,GR-3,QST); s(41,GR-3,QST);

  // staircase up (cols 44-49)
  for (let i=0;i<5;i++) for (let r=GR-1-i;r<=GR-1;r++) s(44+i,r,GND);
  // staircase down (cols 50-55)
  for (let i=0;i<5;i++) for (let r=GR-5+i;r<=GR-1;r++) s(50+i,r,GND);

  // flagpole (col 59, full height)
  for (let r=GR-9;r<=GR;r++) s(59,r,GND);

  return g;
}

// spawn positions
const ENEMY_SPAWNS = [
  {x:5,y:GR-1},{x:18,y:GR-1},{x:25,y:GR-1},
  {x:28,y:GR-5},{x:41,y:GR-1},{x:52,y:GR-1},
].map(({x,y}) => ({x:x*TILE, y:y*TILE-14}));

const COIN_SPAWNS = [
  [2,GR-2],[3,GR-2],[19,GR-4],[22,GR-4],[28,GR-5],[30,GR-5],[39,GR-4],[46,GR-2]
].map(([c,r]) => ({x:c*TILE+4, y:r*TILE, alive:true}));

// ── Tile drawing ──────────────────────────────────────────────────────────────
function drawTile(ctx, id, x, y) {
  switch (id) {
    case GND:
      draw.rect(ctx, x, y, TILE, TILE, { color:'#7b5533' });
      draw.rect(ctx, x, y, TILE, 3,    { color:'#00a800' });
      break;
    case BRK:
      draw.rect(ctx, x, y, TILE, TILE, { color:'#c84c0c' });
      draw.line(ctx, x+1, y+5,  x+15, y+5,  { color:'#883008', lineWidth:1 });
      draw.line(ctx, x+1, y+11, x+15, y+11, { color:'#883008', lineWidth:1 });
      draw.line(ctx, x+8, y+1,  x+8,  y+5,  { color:'#883008', lineWidth:1 });
      draw.line(ctx, x+4, y+6,  x+4,  y+11, { color:'#883008', lineWidth:1 });
      draw.line(ctx, x+12,y+6,  x+12, y+11, { color:'#883008', lineWidth:1 });
      break;
    case QST:
      draw.rect(ctx, x, y, TILE, TILE, { color:'#e89800' });
      draw.rect(ctx, x,   y,   TILE, 1, { color:'#a06000' });
      draw.rect(ctx, x,   y+15,TILE, 1, { color:'#a06000' });
      draw.rect(ctx, x,   y,   1, TILE,  { color:'#a06000' });
      draw.rect(ctx, x+15,y,   1, TILE,  { color:'#a06000' });
      ctx.fillStyle='#fff'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
      ctx.fillText('?', x+8, y+13); ctx.textAlign='left';
      break;
    case QSD:
      draw.rect(ctx, x, y, TILE, TILE, { color:'#888' });
      break;
    case PTP:
      draw.rect(ctx, x-1, y+2, TILE+2, TILE-2, { color:'#00aa00' });
      draw.rect(ctx, x+1, y+6, TILE-2, TILE-6, { color:'#00cc00' });
      draw.line(ctx, x-1, y+2, x+TILE, y+2, { color:'#006600', lineWidth:2 });
      break;
    case PTB:
      draw.rect(ctx, x+2, y, TILE-4, TILE, { color:'#00aa00' });
      draw.rect(ctx, x+4, y, TILE-8, TILE, { color:'#00cc00' });
      break;
  }
}

function drawMap(ctx, grid, cam) {
  const vp = cam.viewport;
  const c0=Math.max(0,Math.floor(vp.x/TILE)), c1=Math.min(LEVEL_W,Math.ceil((vp.x+vp.w)/TILE)+1);
  const r0=Math.max(0,Math.floor(vp.y/TILE)), r1=Math.min(LEVEL_H,Math.ceil((vp.y+vp.h)/TILE)+1);
  for (let r=r0;r<r1;r++) for (let c=c0;c<c1;c++) drawTile(ctx, grid[r][c], c*TILE, r*TILE);
}

// ── Entity drawing ────────────────────────────────────────────────────────────
function drawPlayer(ctx, p, state, dir, t) {
  const {x,y} = p;
  ctx.save();
  if (dir < 0) { ctx.translate(x+p.w, 0); ctx.scale(-1,1); ctx.translate(-x,0); }
  const run = (state==='run') ? Math.floor(t*8)%2 : 0;
  // shoes
  draw.rect(ctx, x+1+run,   y+12, 6, 4, { color:'#3b1a00' });
  draw.rect(ctx, x+9-run,   y+12, 6, 4, { color:'#3b1a00' });
  // overalls
  draw.rect(ctx, x+2, y+7,  12, 6, { color:'#0044cc' });
  draw.rect(ctx, x+3, y+5,   3, 3, { color:'#0044cc' });
  draw.rect(ctx, x+10,y+5,   3, 3, { color:'#0044cc' });
  // arms
  draw.rect(ctx, x+0, y+6,   3, 5, { color:'#cc0000' });
  draw.rect(ctx, x+13,y+6,   3, 5, { color:'#cc0000' });
  // face
  draw.rect(ctx, x+3, y+3,  10, 5, { color:'#e8c07a' });
  // mustache
  draw.rect(ctx, x+3, y+6,   4, 2, { color:'#5c2d00' });
  draw.rect(ctx, x+9, y+6,   4, 2, { color:'#5c2d00' });
  // eye
  draw.rect(ctx, x+9, y+4,   2, 2, { color:'#000' });
  // hat
  draw.rect(ctx, x+2, y+1,  12, 3, { color:'#cc0000' });
  draw.rect(ctx, x+0, y+3,  16, 2, { color:'#cc0000' });
  ctx.restore();
}

function drawGoomba(ctx, e, t) {
  if (e.dead) { draw.rect(ctx, e.x+1, e.y+e.h-4, e.w-2, 4, { color:'#5c2e00' }); return; }
  const wk = Math.floor(t*6)%2;
  draw.rect(ctx, e.x+1+(wk?3:0), e.y+e.h-4, 5, 4, { color:'#3b1a00' });
  draw.rect(ctx, e.x+e.w-6+(wk?0:3), e.y+e.h-4, 5, 4, { color:'#3b1a00' });
  draw.rect(ctx, e.x+1, e.y+5, e.w-2, e.h-9, { color:'#8b4513' });
  draw.rect(ctx, e.x,   e.y,   e.w,   9,     { color:'#5c2e00' });
  draw.rect(ctx, e.x+2, e.y+2, 3, 3, { color:'#fff' });
  draw.rect(ctx, e.x+e.w-5, e.y+2, 3, 3, { color:'#fff' });
  draw.rect(ctx, e.x+3, e.y+3, 2, 2, { color:'#000' });
  draw.rect(ctx, e.x+e.w-5, e.y+3, 2, 2, { color:'#000' });
}

// ── Game ──────────────────────────────────────────────────────────────────────
export function start(canvasEl) {
  const best = savedSignal('mario_best', 0);

  let map, grid, solids;
  let player, enemies, coins, score, lives, animT, dieTimer;

  function initMap() {
    grid = buildLevel();
    map  = tilemap({ tileW: TILE, tileH: TILE, solidIds: SOLID_IDS });
    map.loadGrid(grid);
    solids = map.solidRects();
  }

  function hitBlock(c, r) {
    const id = grid[r]?.[c];
    if (id === QST) {
      grid[r][c] = QSD; map.setTile(c, r, QSD);
      score += 200;
      audio.tone(880, { duration:0.1, volume:0.25 });
    } else if (id === BRK) {
      grid[r][c] = AIR; map.setTile(c, r, AIR);
      solids = map.solidRects();
      score += 50;
      audio.tone(220, { type:'sawtooth', duration:0.08, volume:0.2 });
    }
  }

  function resetGame() {
    initMap();
    player = body({ x:TILE, y:(GR-1)*TILE-16, w:14, h:16, gravity:800, restitution:0 });
    player.dir = 1; player.animT = 0;
    enemies = ENEMY_SPAWNS.map(sp => {
      const e = body({ x:sp.x, y:sp.y, w:14, h:14, gravity:800, restitution:0 });
      e.vx=-40; e.dead=false; e.dieTimer=0; e.animT=0;
      return e;
    });
    coins  = COIN_SPAWNS.map(c => ({...c}));
    score  = 0; lives = 3; animT = 0; dieTimer = 0;
    cam.teleport(W/2, H/2);
    cam.follow(player);
  }

  const cam = camera({
    w: W, h: H, lerp: 0.08,
    bounds:   { x:0, y:0, w:LEVEL_W*TILE, h:LEVEL_H*TILE },
    followX:  true, followY: false,
    deadzone: { x:60, y:0 },
  });

  function drawBg(ctx) {
    draw.rect(ctx, 0, 0, W, H, { color:'#5c94fc' });
    const off = (cam.x * 0.15) % 160;
    for (let i=-1;i<4;i++) {
      const cx = (i*160 - off % 160 + 160) % 480 - 80;
      draw.rect(ctx, cx,    28, 56, 14, { color:'#fff', alpha:0.9 });
      draw.rect(ctx, cx+10, 16, 36, 16, { color:'#fff', alpha:0.9 });
    }
  }

  return createGame(canvasEl, {
    width: W, height: H, pixelated: true, bgColor: '#5c94fc',
    initial: 'menu',
    states: (fsm) => ({
      menu: {
        update() { if (input.down('jump') || input.down('action')) fsm.go('play'); },
        render(ctx) {
          draw.rect(ctx, 0, 0, W, H, { color:'#5c94fc' });
          hud.text(ctx,'SUPER MARIO',W/2,H/2-40,{font:'bold 20px monospace',color:'#fff',align:'center'});
          hud.text(ctx,'← → move   ↑/Z jump',W/2,H/2-10,{font:'10px monospace',color:'#ddf',align:'center'});
          if (best.value > 0)
            hud.text(ctx,`BEST  ${best.value}`,W/2,H/2+15,{font:'10px monospace',color:'#ff0',align:'center'});
          hud.text(ctx,'PRESS JUMP TO START',W/2,H/2+38,{font:'9px monospace',color:'#aaf',align:'center'});
        },
      },

      play: {
        enter() { resetGame(); },
        update(dt) {
          animT += dt;
          if (input.down('pause')) { fsm.go('pause'); return; }

          const ax = input.axisX();
          if (ax) { player.vx = ax * 130; player.dir = ax; }
          else     { player.vx *= Math.pow(0.15, dt); }

          if (input.down('jump') && player.grounded) {
            player.vy = -360;
            audio.tone(660,{duration:0.1,type:'square',volume:0.2});
          }

          const headC = Math.floor((player.x + player.w/2)/TILE);
          const headR = Math.floor(player.y/TILE);
          const wasUp = player.vy < -50;
          applyGravity(player, dt);
          move(player, dt, solids);

          // head-bump block detection
          if (wasUp && player.vy === 0 && !player.grounded) hitBlock(headC, headR - 1);

          player.x = math.clamp(player.x, 0, LEVEL_W*TILE - player.w);
          if (player.y > LEVEL_H*TILE + 32) { fsm.go('dead'); return; }
          if (player.x > 58*TILE) {
            if (score > best.value) best.value = score;
            fsm.go('win'); return;
          }

          // enemies
          for (const e of enemies) {
            if (e.dead) { e.dieTimer -= dt; continue; }
            applyGravity(e, dt);
            move(e, dt, solids);
            e.animT += dt;
            if (e.vx === 0 || !e.grounded) e.vx = -e.vx || -40;

            if (aabb(player, e)) {
              const stomp = player.vy > 20 && player.y + player.h < e.y + e.h * 0.6;
              if (stomp) {
                e.dead = true; e.dieTimer = 0.4;
                player.vy = -220; score += 100;
                audio.tone(440,{duration:0.06,volume:0.2});
              } else { fsm.go('dead'); return; }
            }
          }
          enemies = enemies.filter(e => !e.dead || e.dieTimer > 0);

          // coins
          for (const c of coins) {
            if (!c.alive) continue;
            if (player.x < c.x+8 && player.x+player.w > c.x &&
                player.y < c.y+10 && player.y+player.h > c.y) {
              c.alive = false; score += 100;
              audio.tone(1320,{duration:0.06,volume:0.2});
            }
          }

          cam.update(dt);
        },
        render(ctx) {
          drawBg(ctx);
          cam.begin(ctx);
            drawMap(ctx, grid, cam);
            for (const c of coins) if (c.alive) {
              const sq = Math.abs(Math.sin(animT*2+c.x*0.1));
              draw.rect(ctx, c.x+2, c.y, Math.max(2,8*sq), 10, {color:'#ffcc00'});
            }
            for (const e of enemies) drawGoomba(ctx, e, e.animT);
            const pst = Math.abs(player.vx)>5 ? 'run' : (player.grounded ? 'idle' : 'jump');
            drawPlayer(ctx, player, pst, player.dir, animT);
          cam.end(ctx);
          hud.score(ctx, score, 8,  12, {digits:6, font:'10px monospace', color:'#fff', align:'left'});
          hud.pips (ctx, W-8-lives*14, 6, 10, 4, 3, lives, {color:'#ff0', bg:'#333'});
        },
      },

      dead: {
        enter()    { dieTimer=0; player.vy=-340; player.vx=0; cam.follow(null); },
        update(dt) {
          dieTimer += dt;
          player.vy += 900*dt; player.y += player.vy*dt;
          if (dieTimer > 2.2) { lives--; if (lives<=0) fsm.go('gameover'); else fsm.go('play'); }
        },
        render(ctx) {
          drawBg(ctx);
          cam.begin(ctx); drawMap(ctx, grid, cam); cam.end(ctx);
          // draw player in screen coords (dead spin)
          const sx = cam.worldToScreen(player.x, player.y);
          ctx.save();
          ctx.translate(sx.x + player.w/2, sx.y + player.h/2);
          ctx.rotate(dieTimer * 12);
          draw.rect(ctx, -7, -8, 14, 16, {color:'#cc0000'});
          ctx.restore();
          hud.score(ctx, score, 8, 12, {digits:6, font:'10px monospace', color:'#fff', align:'left'});
        },
      },

      pause: {
        update() { if (input.down('pause')) fsm.go('play'); },
        render(ctx) {
          drawBg(ctx);
          cam.begin(ctx); drawMap(ctx, grid, cam); cam.end(ctx);
          hud.fade(ctx, 0.5);
          hud.text(ctx,'PAUSED',W/2,H/2,{font:'bold 16px monospace',color:'#fff',align:'center'});
          hud.text(ctx,'ESC resume',W/2,H/2+20,{font:'10px monospace',color:'#aaa',align:'center'});
        },
      },

      gameover: {
        enter()  { audio.tone(180, {duration:1.5, type:'square', volume:0.3}); },
        update() { if (input.down('jump')||input.down('action')) fsm.go('menu'); },
        render(ctx) {
          draw.rect(ctx,0,0,W,H,{color:'#000'});
          hud.text(ctx,'GAME OVER',W/2,H/2-20,{font:'bold 18px monospace',color:'#f44',align:'center'});
          hud.text(ctx,`Score: ${score}`,W/2,H/2+6,{font:'11px monospace',color:'#aaa',align:'center'});
          hud.text(ctx,'PRESS JUMP',W/2,H/2+28,{font:'10px monospace',color:'#888',align:'center'});
        },
      },

      win: {
        enter()    { animT=0; audio.tone(1046,{duration:0.3,volume:0.3}); },
        update(dt) {
          animT += dt;
          if (animT > 2 && (input.down('jump')||input.down('action'))) fsm.go('menu');
        },
        render(ctx) {
          drawBg(ctx);
          cam.begin(ctx); drawMap(ctx, grid, cam); cam.end(ctx);
          hud.fade(ctx, 0.4);
          hud.text(ctx,'YOU WIN!',W/2,H/2-20,{font:'bold 18px monospace',color:'#ff0',align:'center'});
          hud.text(ctx,`Score: ${score}`,W/2,H/2+4,{font:'11px monospace',color:'#fff',align:'center'});
          if (animT>1.5) hud.text(ctx,'PRESS JUMP',W/2,H/2+26,{font:'10px monospace',color:'#aaa',align:'center'});
        },
      },
    }),
  });
}
