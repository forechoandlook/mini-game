// Super Mario prototype — sprite-based, no external assets
import { canvas, input, audio, hud, fx, draw, createGame,
         camera, tilemap, spriteSheet, body, applyGravity, move, aabb,
         math, savedSignal } from '../index.js';
import { MARIO, GOOMBA, COIN, TILES } from './mario-sprites.js';

const TILE = 16, W = 320, H = 200;
const LEVEL_W = 64, LEVEL_H = 14;
const GR = 12; // ground row index

// ── Tile IDs ─────────────────────────────────────────────────────────────────
const [AIR, GND, BRK, QST, QSD, PTP, PTB] = [0,1,2,3,4,5,6];
const SOLID_IDS = new Set([GND, BRK, QST, QSD, PTP, PTB]);

// ── Sprite sheets (created from MARIO/GOOMBA/COIN/TILES images) ──────────────
const marioSheet = spriteSheet(MARIO, 16, 16);
const marioAnims = {
  idle:  marioSheet.anim('idle',  [0],       4),
  run:   marioSheet.anim('run',   [1,2,1,0], 8),
  jump:  marioSheet.anim('jump',  [3],       4),
  die:   marioSheet.anim('die',   [4],       4).setLoop(false),
  skid:  marioSheet.anim('skid',  [5],       4),
};

const goombaSheet = spriteSheet(GOOMBA, 14, 14);
const goombaAnims = {
  walk: goombaSheet.anim('walk', [0,1], 5),
  dead: goombaSheet.anim('dead', [2],   4).setLoop(false),
};

const coinSheet   = spriteSheet(COIN,  8, 12);
const coinAnim    = coinSheet.anim('spin', [0,1,2,3], 8);

const tileSheet   = spriteSheet(TILES, 16, 16);

// ── Level builder ─────────────────────────────────────────────────────────────
function buildLevel() {
  const g = Array.from({length: LEVEL_H}, () => new Array(LEVEL_W).fill(AIR));
  const s = (c, r, id) => { if (r>=0&&r<LEVEL_H&&c>=0&&c<LEVEL_W) g[r][c]=id; };
  const row = (r, c0, c1, id) => { for (let c=c0;c<=c1;c++) s(c,r,id); };

  row(GR,   0, 10, GND); row(GR,   13, LEVEL_W-1, GND); // ground + pit
  row(GR+1, 0, 10, GND); row(GR+1, 13, LEVEL_W-1, GND);

  s(4,GR-3,QST); row(GR-3,7,8,BRK); s(9,GR-3,QST); row(GR-3,10,11,BRK);

  s(15,GR-2,PTP); s(16,GR-2,PTP); s(15,GR-1,PTB); s(16,GR-1,PTB);

  row(GR-3,20,21,BRK); s(22,GR-3,QST); row(GR-3,23,24,BRK);

  row(GR-4,27,31,GND); row(GR-3,27,31,QST);

  s(34,GR-3,PTP); s(35,GR-3,PTP); row(GR-2,34,35,PTB); row(GR-1,34,35,PTB);

  row(GR-3,38,39,BRK); s(40,GR-3,QST); s(41,GR-3,QST);

  for (let i=0;i<5;i++) for (let r=GR-1-i;r<=GR-1;r++) s(44+i,r,GND);
  for (let i=0;i<5;i++) for (let r=GR-5+i;r<=GR-1;r++) s(50+i,r,GND);

  for (let r=GR-9;r<=GR;r++) s(59,r,GND); // flagpole

  return g;
}

const ENEMY_SPAWNS = [
  {x:5,y:GR-1},{x:18,y:GR-1},{x:25,y:GR-1},
  {x:28,y:GR-5},{x:41,y:GR-1},{x:52,y:GR-1},
].map(({x,y}) => ({x:x*TILE, y:y*TILE-14}));

const COIN_SPAWNS = [
  [2,GR-2],[3,GR-2],[19,GR-4],[22,GR-4],[28,GR-5],[30,GR-5],[39,GR-4],[46,GR-2]
].map(([c,r]) => ({x:c*TILE+4, y:r*TILE, alive:true}));

// ── Game ──────────────────────────────────────────────────────────────────────
export function start(canvasEl) {
  const best = savedSignal('mario_best', 0);

  let map, grid, solids;
  let player, enemies, coins, score, lives;
  let animT = 0, dieTimer = 0, curAnim;

  function initMap() {
    grid = buildLevel();
    map  = tilemap({
      tileW: TILE, tileH: TILE, solidIds: SOLID_IDS,
      // use sprite sheet for tile rendering
      drawTile: (ctx, id, x, y) => tileSheet.drawFrame(ctx, id - 1, x, y),
    });
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
    player.dir = 1;
    curAnim = marioAnims.idle;
    enemies = ENEMY_SPAWNS.map(sp => {
      const e = body({ x:sp.x, y:sp.y, w:14, h:14, gravity:800, restitution:0 });
      e.vx=-40; e.dead=false; e.dieTimer=0;
      e.anim = Object.assign({}, goombaAnims.walk); // clone
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
      const cx = (i*160 - off%160 + 160) % 480 - 80;
      draw.rect(ctx, cx,    28, 56, 14, { color:'#fff', alpha:0.9 });
      draw.rect(ctx, cx+10, 16, 36, 16, { color:'#fff', alpha:0.9 });
    }
  }

  return createGame(canvasEl, {
    width: W, height: H, pixelated: true, bgColor: '#5c94fc',
    initial: 'menu',
    states: (fsm) => ({
      menu: {
        update() { if (input.down('jump')||input.down('action')) fsm.go('play'); },
        render(ctx) {
          draw.rect(ctx,0,0,W,H,{color:'#5c94fc'});
          // draw a mario on the title screen
          marioAnims.idle.draw(ctx, W/2-8, H/2-50, { scale:2 });
          hud.text(ctx,'SUPER MARIO',W/2,H/2-12,{font:'bold 18px monospace',color:'#fff',align:'center',shadow:'#000'});
          hud.text(ctx,'← → move   ↑/Z jump',W/2,H/2+10,{font:'10px monospace',color:'#ddf',align:'center'});
          if (best.value>0)
            hud.text(ctx,`BEST ${best.value}`,W/2,H/2+28,{font:'10px monospace',color:'#ff0',align:'center'});
          hud.text(ctx,'PRESS JUMP TO START',W/2,H/2+46,{font:'9px monospace',color:'#aaf',align:'center'});
        },
      },

      play: {
        enter() { resetGame(); },
        update(dt) {
          animT += dt;
          coinAnim.update(dt);
          if (input.down('pause')) { fsm.go('pause'); return; }

          const ax = input.axisX();
          if (ax) { player.vx = ax * 130; player.dir = ax; }
          else     { player.vx *= Math.pow(0.15, dt); }

          if (input.down('jump') && player.grounded) {
            player.vy = -360;
            audio.tone(660,{duration:0.1,type:'square',volume:0.2});
          }

          // choose animation
          if (!player.grounded)        curAnim = marioAnims.jump;
          else if (Math.abs(player.vx) > 5) {
            curAnim = (player.vx * player.dir < 0) ? marioAnims.skid : marioAnims.run;
          } else curAnim = marioAnims.idle;
          curAnim.update(dt);

          const headC = Math.floor((player.x+player.w/2)/TILE);
          const headR = Math.floor(player.y/TILE);
          const wasUp = player.vy < -50;
          applyGravity(player, dt);
          move(player, dt, solids);
          if (wasUp && player.vy === 0 && !player.grounded) hitBlock(headC, headR-1);

          player.x = math.clamp(player.x, 0, LEVEL_W*TILE-player.w);
          if (player.y > LEVEL_H*TILE+32) { fsm.go('dead'); return; }
          if (player.x > 58*TILE) {
            if (score>best.value) best.value=score;
            fsm.go('win'); return;
          }

          for (const e of enemies) {
            if (e.dead) { e.dieTimer-=dt; continue; }
            applyGravity(e, dt);
            move(e, dt, solids);
            if (e.vx===0||!e.grounded) e.vx=-e.vx||(-40);
            e.anim.update(dt);
            if (aabb(player,e)) {
              const stomp = player.vy>20 && player.y+player.h < e.y+e.h*0.6;
              if (stomp) {
                e.dead=true; e.dieTimer=0.5; e.anim=goombaAnims.dead;
                player.vy=-220; score+=100;
                audio.tone(440,{duration:0.06,volume:0.2});
              } else { fsm.go('dead'); return; }
            }
          }
          enemies = enemies.filter(e=>!e.dead||e.dieTimer>0);

          for (const c of coins) {
            if (!c.alive) continue;
            if (player.x<c.x+8&&player.x+player.w>c.x&&player.y<c.y+12&&player.y+player.h>c.y) {
              c.alive=false; score+=100;
              audio.tone(1320,{duration:0.06,volume:0.2});
            }
          }

          cam.update(dt);
        },
        render(ctx) {
          drawBg(ctx);
          cam.begin(ctx);
            map.render(ctx, cam); // uses drawTile callback → tileSheet sprites
            for (const c of coins) if (c.alive)
              coinAnim.draw(ctx, c.x, c.y);
            for (const e of enemies)
              e.anim.draw(ctx, e.x, e.y, { flipX: e.vx > 0 });
            curAnim.draw(ctx, player.x, player.y, { flipX: player.dir < 0 });
          cam.end(ctx);
          hud.score(ctx,score,  8, 12,{digits:6,font:'10px monospace',color:'#fff',align:'left'});
          hud.pips (ctx,W-8-lives*14,6,10,4,3,lives,{color:'#ff0',bg:'#333'});
        },
      },

      dead: {
        enter() {
          dieTimer=0; player.vy=-340; player.vx=0;
          cam.follow(null);
          marioAnims.die.reset();
          audio.tone(440,{duration:0.08,volume:0.2});
        },
        update(dt) {
          dieTimer+=dt;
          player.vy+=900*dt; player.y+=player.vy*dt;
          marioAnims.die.update(dt);
          if (dieTimer>2.2) { lives--; if(lives<=0) fsm.go('gameover'); else fsm.go('play'); }
        },
        render(ctx) {
          drawBg(ctx);
          cam.begin(ctx); map.render(ctx, cam); cam.end(ctx);
          const sp = cam.worldToScreen(player.x, player.y);
          marioAnims.die.draw(ctx, sp.x, sp.y, { angle: dieTimer * 10 });
          hud.score(ctx,score,8,12,{digits:6,font:'10px monospace',color:'#fff',align:'left'});
        },
      },

      pause: {
        update() { if(input.down('pause')) fsm.go('play'); },
        render(ctx) {
          drawBg(ctx);
          cam.begin(ctx); map.render(ctx,cam); cam.end(ctx);
          hud.fade(ctx,0.5);
          hud.text(ctx,'PAUSED',W/2,H/2,{font:'bold 16px monospace',color:'#fff',align:'center'});
          hud.text(ctx,'ESC resume',W/2,H/2+20,{font:'10px monospace',color:'#aaa',align:'center'});
        },
      },

      gameover: {
        enter() { audio.sweep(440,110,{duration:1.5,volume:0.3}); },
        update() { if(input.down('jump')||input.down('action')) fsm.go('menu'); },
        render(ctx) {
          draw.rect(ctx,0,0,W,H,{color:'#000'});
          hud.text(ctx,'GAME OVER',W/2,H/2-20,{font:'bold 18px monospace',color:'#f44',align:'center'});
          hud.text(ctx,`Score: ${score}`,W/2,H/2+6,{font:'11px monospace',color:'#aaa',align:'center'});
          hud.text(ctx,'PRESS JUMP',W/2,H/2+28,{font:'10px monospace',color:'#888',align:'center'});
        },
      },

      win: {
        enter()    { animT=0; audio.tone(1046,{duration:0.4,volume:0.3}); },
        update(dt) {
          animT+=dt;
          if(animT>2&&(input.down('jump')||input.down('action'))) fsm.go('menu');
        },
        render(ctx) {
          drawBg(ctx);
          cam.begin(ctx); map.render(ctx,cam); cam.end(ctx);
          hud.fade(ctx,0.4);
          hud.text(ctx,'YOU WIN!',W/2,H/2-20,{font:'bold 18px monospace',color:'#ff0',align:'center'});
          hud.text(ctx,`Score: ${score}`,W/2,H/2+4,{font:'11px monospace',color:'#fff',align:'center'});
          if(animT>1.5) hud.text(ctx,'PRESS JUMP',W/2,H/2+26,{font:'10px monospace',color:'#aaa',align:'center'});
        },
      },
    }),
  });
}
