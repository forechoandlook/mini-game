# mini-game · 速查
轻量游戏框架，无构建，纯 ES Module。复用 mini-react signal 驱动响应式 HUD。

```js
import { createGame,loop, canvas, input, mouse, axis, assets, loadProgress, pool,
         time, timer, save, load, savedSignal,body, applyGravity, move, bounce, bouncePaddle, resolve,aabb, mtv, raycast,
         circleVsCircle, circleMtv, circleVsRect, circleRectMtv, moveCircle,capsuleVsCapsule, capsuleMtv, capsuleVsRect, capsuleRectMtv, moveCapsule,
         camera, tilemap, particles, spriteSheet,hud, menu, dialog,
         audio,renderer, camera3d, physics3d,box, sphere, plane, cylinder,v3, m4, quat, DEG,math, random, tweens, stateMachine } from './index.js';
```

---

## Core

- `loop.start(update, render)` — 固定步长（1/60s）update + 可变帧率 render；`render` 收到 alpha∈[0,1] 可做位置插值
- `loop.pause()` / `loop.resume()` / `loop.stop()` / `loop.fps` / `loop.frame`
- `canvas.init('#c', { width:480, height:270, pixelated:true })` — DPR 感知，自动处理高分屏；省略 width/height 则 fit 父容器；也可直接传入 HTMLCanvasElement
- `canvas.clear('#1a1a2e')` / `canvas.ctx` / `canvas.w` / `canvas.h`
- `input.init(canvas.el)` — 键盘自动挂 `window`（canvas 无需 tabindex），pointer 挂传入元素
- `input.pressed('left')` — 持续按住；`input.down('jump')` — 首帧按下；`input.up('action')` — 首帧释放；单字符 key 大小写不敏感
- `input.axisX()` / `input.axisY()` — 返回 -1 / 0 / 1
- `input.held(key, dt, { firstDelay:0.17, repeatDelay:0.05 })` — 持键自动重复（DAS）；首次按下立即触发，持续按住超过 firstDelay 后每隔 repeatDelay 触发一次；适用于 Tetris 横移、菜单快速滚动等
- `mouse.x.value` / `mouse.y.value` / `mouse.justDown.value` — signal，可在 effect 内响应
- `axis.x.value` / `axis.y.value` — flush 时更新的轴 signal
- 内置别名：`left/right/up/down/jump/action/pause`，各映射 WASD + 方向键 + 常用键
- `assets.add(key, url, type?)` — type: `'image'`（默认）/ `'audio'` / `'json'`；`await assets.load(onProgress)`
- `assets.get(key)` — 返回 HTMLImageElement / AudioBuffer / object
- `loadProgress.value` — signal 0..1，可直接绑进度条
- `pool(cap, factory, reset?)` — 预分配对象池，O(active) 遍历零 GC；`obtain()` 取槽，`active=false` 回收，`update(fn)` 遍历+自动回收（返回 false = 释放）；`reset` 默认空操作，obtain 后需自行设置所有状态字段；常量几何字段（r/w/h）写在 factory 里即可自动保留
- `time.scale` — 全局时间缩放（`< 1` 慢动作，`> 1` 加速）；loop 自动将 `dt * time.scale` 传给 update
- `time.rawDt` — loop 每 tick 写入的原始帧时间（未缩放）
- `timer.after(delay, fn)` — 延迟回调（秒）；`timer.every(interval, fn)` — 周期回调（fn 返回 false 取消）；`timer.update(dt)` 需在 update 内调用；`timer.clear()` 场景 exit 时清空
- `save(key, data)` / `load(key, def)` / `deleteSave(key)` — localStorage JSON 存档；`savedSignal(key, def)` — 写入即自动持久化的 signal，刷新不丢失
- `events.on(name, fn)` → 返回 unsubscribe fn；`events.once` / `events.off` / `events.emit(name, data)` / `events.clear(name?)` — 全局事件总线；场景 exit 时 clear 避免泄漏

---

## Utils

- `math.clamp/lerp/remap/smoothstep/wrap/sign/pingpong` — 标量工具
- `math.dist/dist2/angle/dirX/dirY` — 2D 几何
- `math.moveToward(cur, target, step)` — 匀速逼近（敌人追踪、缓动移动）
- `math.lerpAngle(a,b,t)` — 角度插值（自动处理 ±π 跨界）
- `math.toRad/toDeg` / `math.rand/randInt` — 非 seeded 随机快捷
- `math.expDecay(v, retain, dt)` — 帧率无关指数衰减；retain 为每秒保留比例（0.3 = 1秒后剩30%速度）；用于太空飞船阻力、镜头缓动等
- `math.wrapPos(obj, w, h)` — 屏幕环绕，修改 obj.x/y；obj 含 r 字段时以半径为边距；用于 Asteroids 类游戏
- `math.flicker(t, freq=20)` — 无敌闪烁 alpha；t 从初始值倒计到 0，返回 [0.2, 1.0] 振荡值，t≤0 时返回 1
- `math.rotateMatrix(grid)` — 2D 数组顺时针旋转 90°；用于俄罗斯方块方块旋转
- `random.seed(n)` — 设置 mulberry32 PRNG 种子；`random.next/float/int/pick/shuffle/chance`
- `tweens.to(obj, props, duration, easing)` — 返回 `{ stop(), onDone(fn) }`；easing: `linear/easeIn/easeOut/easeInOut/easeOutCubic/easeOutBack/easeOutBounce/easeOutElastic`；`tweens.update(dt)` 需每帧调用；`tweens.clear()` 场景 exit 清空
- `assets.getImage(key)` / `assets.getAudio(key)` / `assets.getJSON(key)` — 类型化快捷
- `stateMachine(states, initial)` — 有限状态机；每个状态可含 `enter/update/exit/render`；`fsm.go(name)` 触发 exit→enter；`fsm.update(dt)` / `fsm.render(ctx)` 驱动当前状态；`fsm.state` / `fsm.is(name)` / `fsm.tryGo(name, cond)`
- `pathfinder(cols, rows)` — 网格 A\* 寻路；`pf.setWalkable(x,y,bool)` / `pf.loadGrid(grid2d)`；`pf.find(sx,sy,ex,ey)` → `[{x,y}]`；`pf.findSmooth(...)` 折线优化（视线裁剪）
- `rooms({ cols,rows,minRoom,maxRoom,splits,rng })` — BSP 地牢，返回 `{ rooms,corridors,grid }`
- `cellular({ cols,rows,fillRatio,iterations,rng })` — 细胞自动机洞穴，返回 `{ grid }`
- `drunkardWalk({ cols,rows,steps,rng })` — 醉汉游走隧道
- `noise1d(x, scale, seed)` / `noise2d(x,y, scale, seed)` — 平滑值噪声 0..1（地形高度 / 高度图）
- `scatter({ count,areaX,areaY,areaW,areaH,radius,avoid,rng })` — 避免重叠散布物品，返回 `[{x,y}]`

---

## 2D

- `body({ x,y,w,h, gravity:800, friction:0.85, restitution:0 })` — 2D AABB 刚体
- `applyGravity(b, dt)` — `vy += gravity * dt`
- `move(b, dt, obstacles)` — **平台游戏**移动：碰撞解算 + grounded 检测 + 落地摩擦；obstacles 元素 `{ x,y,w,h, oneWay? }`
- `bounce(b, dt, obstacles)` — **弹性碰撞**移动：纯物理弹射，restitution=1 时完美反弹；返回 `hits[]` 可用于触发音效；无 grounded/friction 等平台器行为
- `b.grounded` — 落地检测（仅 `move()` 更新）
- `aabb(a,b)` — boolean；`mtv(a,b)` — `{ dx,dy,nx,ny }` 最小分离向量；`raycast(ray, rects)` — `{ t,nx,ny,hit }`
- `circleVsCircle(a,b)` — boolean，圆 `{x,y,r}` 重叠检测
- `circleMtv(a,b)` — `{ nx,ny,pen }` 圆-圆最小分离向量
- `circleVsRect(c,r)` — boolean，圆 vs AABB `{x,y,w,h}`
- `circleRectMtv(c,r)` — `{ nx,ny,pen }` 圆-矩形最小分离向量（含圆心在矩形内的情形）
- `moveCircle(c, dt, obstacles)` — 圆体弹性移动，等价于 `bounce()` 但用圆形检测；返回 `hits[]`
- `bouncePaddle(ball, paddle, opts)` — **弧面挡板碰撞**：模拟弯曲挡板法线，打到边缘角度更斜；支持矩形球（aabb）和圆形球（自动检测 ball.r）
  - `direction: 'right'|'left'` — 竖向挡板（pong），角度随 y 位置变化
  - `direction: 'up'|'down'` — 横向挡板（breakout），角度随 x 位置变化
  - `spread` — 边缘最大偏转角（弧度，默认 ≈67°）；`speedGain` — 每次碰撞速度倍率；`maxSpeed` — 速度上限；`minNormal` — 法线方向最小速度（防止 breakout 打出近水平球）
  - 返回 `true` 表示发生碰撞，可直接用于触发音效：`if (bouncePaddle(...)) beep(440)`
- **Capsule** `{ x,y,r,h, vx,vy, friction,restitution }` — 胶囊体（底部圆心为原点，高度 h≥2r）；不卡墙角，推荐用于角色控制器
- `capsuleVsCapsule(a,b)` / `capsuleMtv(a,b)` — 胶囊-胶囊检测
- `capsuleVsRect(cap,r)` / `capsuleRectMtv(cap,r)` — 胶囊-矩形检测
- `moveCapsule(cap, dt, obstacles)` — 移动+碰撞解算，等价于 `move()` 但用胶囊形状
- `camera({ w,h, lerp:0.05, bounds, followX:true, followY:true, deadzone:{x,y} })` — 2D 跟随相机
  - `followX/followY` — 独立控制哪个轴跟随（Mario 常用 `followY:false` 固定纵轴）
  - `deadzone:{x,y}` — 目标在死区内移动时相机不动，离开后才追踪（Mario 横向死区感）
- `cam.follow(target)` / `cam.update(dt)` / `cam.shake(duration, mag)`
- `cam.begin(ctx)` … 画世界物体 … `cam.end(ctx)` — save/translate/restore 包裹
- `cam.screenToWorld(sx,sy)` / `cam.worldToScreen(wx,wy)` — 鼠标世界坐标转换
- `parallax(layers)` — 视差背景；每层 `{ img, speedX, speedY, y, alpha, tileY }`；`speedX=0` 固定天空，`speedX=0.5` 慢速山丘；在 `cam.begin()` 之前调用 `bg.render(ctx, cam)`
- `spriteSheet(img, fw, fh)` — 返回 sheet；`sheet.anim(name, frames, fps)` — 帧动画
- `anim.update(dt)` / `anim.draw(ctx, x, y, { flipX, scale, alpha })` / `anim.reset()` / `anim.done`
- `tilemap({ tileW, tileH, img })` — `map.loadGrid(grid)` 或 `map.loadTiled(json)`（支持 Tiled 导出）
- `map.update(dt)` / `map.render(ctx, cam)` — 相机裁剪渲染
- `map.solidRects(layerName?)` — 贪心合并 solid tile → `[{x,y,w,h}]`，直接传给 `move()`
- `map.objects(layerName)` — 读取 Tiled objectgroup 层，返回 `[{id,name,type,x,y,width,height,properties}]`；用于生成敌人、金币、出生点、传送门等
- `draw.rect(ctx, x,y,w,h, { color, alpha, angle, outline, lineWidth })` — 矩形，支持旋转
- `draw.circle(ctx, x,y,r, { color, alpha, outline, lineWidth })` — 圆形
- `draw.poly(ctx, x,y, angles[], r, rotation, { color, alpha, fill, lineWidth })` — 角度数组定义的多边形（小行星、星形）
- `draw.line(ctx, x1,y1,x2,y2, { color, alpha, lineWidth })` — 线段
- `draw.sprite(ctx, img, x,y, { angle, scaleX, scaleY, alpha, ox, oy, flipX, flipY })` — 带变换的贴图
- `fx.flash(ctx, t, maxT, { color, maxAlpha })` — 屏幕闪烁（死亡/受击）；t 是倒计时值，maxT 是初始值
- `fx.vignette(ctx, { color, strength })` — 暗角效果
- `fx.scanlines(ctx, { alpha, spacing })` — CRT 扫描线
- `fx.tint(ctx, color, alpha)` — 全屏色调叠加（低血量红色脉冲等）
- `body()` 现在含 `angle / angularVelocity / angularDamping` 字段；碰撞形状仍为 AABB/圆，旋转仅影响视觉和物理积分
- `stepRotation(b, dt)` — 积分角速度到角度，含阻尼；在 update 里与 `applyGravity` 并列调用
- `applyAngularImpulse(b, impulse)` — 施加角冲量（碰撞时使物体旋转加速）
- `particles(cap)` — `ps.burst({ x,y, count, speed, spread, lifetime, colorStart, colorEnd, gravity, ... })`
- `ps.emit({ x,y, rate, ... })` — 持续发射，返回 `{ stop() }`；`ps.update(dt)` / `ps.render(ctx)`
- `ps.presets.explosion(ps,x,y)` / `.dust` / `.sparkle` — 内置预设

---

## UI（Canvas 绘制，屏幕空间，在 cam.end 后调用）

- `joystick({ x,y,r, floating, deadzone, opacity })` — 虚拟摇杆；`joy.init(canvas.el)` 绑定；`joy.render(ctx)` 在 HUD 层调用；`joy.axisX/axisY` 连续值 -1..1；`joy.x8()/y8()` 四方向 snap；`floating:true` 在触点处弹出
- `hud.bar(ctx, x,y,w,h, value,max, { color,bg,border,radius })` — 血条/进度条
- `hud.pips(ctx, x,y, size,gap, total,filled, { color,bg })` — 命数圆点
- `hud.text(ctx, str, x,y, { font,color,align,shadow })` — 带阴影文字
- `hud.score(ctx, value, x,y, { digits:6, align:'right' })` — 零填充数字
- `hud.fade(ctx, alpha, { color,w,h })` — 全屏遮罩（场景淡入淡出、死亡黑屏）；尺寸默认取 canvas 逻辑尺寸
- `menu({ items:[{label,action}], x,y, itemW,itemH, colorActive,onCancel })` — 键盘+鼠标导航菜单
- `m.update(dt)` / `m.render(ctx)` / `m.index` / `m.setItems([])`
- `dialog({ x,y,w,h, canvasH, cps:30 })` — 逐字打印对话框
- `d.show(text, { speaker, onDone, ctx })` / `d.advance()` / `d.update(dt)` / `d.render(ctx)`
- `d.isOpen` / `d.isDone` / `d.isOpenSig` — 对话框开启时先处理 dialog 再 return，避免输入穿透

---

## Audio

- `audio.play(key, { volume, detune, rate, channel })` — sfx pool 化播放，pool 耗尽静默丢弃不卡顿
- `audio.playBgm(key, { volume:0.6, fade:0.8 })` — 淡入切换；`audio.stopBgm({ fade })`
- `audio.tone(freq, { type, duration, volume })` — 程序化单频音（无需音频文件）
- `audio.sweep(fromFreq, toFreq, { duration })` — 频率扫描（激光/下落音效）
- `audio.noise({ duration, volume })` — 白噪声（爆炸/碰撞）
- `audio.sfx(key, buffer)` / `audio.bgm(key, buffer)` — 手动注册 AudioBuffer
- `audio.masterVolume = 0.8` / `audio.channel('sfx').volume = 0.6` — 分组音量控制

---

## 3D

- `renderer(canvas)` — WebGL2；program/VAO 状态缓存避免冗余 GL 调用
- `r.geometry(positions, normals, uvs, indices)` — 上传 Float32Array/Uint16Array，返回 geo
- `r.texture(img, { wrap, filter })` / `r.material(prog, { u_albedo, u_tex })` / `r.unlitMaterial(color)`
- `r.begin(clearColor)` / `r.setCamera(view, proj)` / `r.setLight({ dir,color,ambient })` / `r.draw(mesh, modelMat)` / `r.end()`
- `camera3d({ fov, aspect, near, far, mode:'fps'|'orbit' })`
- `cam.moveFPS({ moveX,moveZ,moveY, speed,dt })` / `cam.rotateFPS(dx,dy,sensitivity)` — FPS 视角
- `cam.orbit(dx,dy)` / `cam.zoom(delta)` / `cam.setOrbitTarget(x,y,z)` — 轨道视角
- `cam.view` / `cam.proj` — Float32Array[16]，直接传 `r.setCamera`
- `cam.rayFromScreen(ndcX, ndcY)` — 鼠标拾取射线，返回 `{ origin, dir }`
- `physics3d({ gravity:20, substeps:3 })` — 3D 物理世界
- `world.body({ shape:'box'|'sphere', type:'dynamic'|'static'|'kinematic', x,y,z, hx,hy,hz, r, mass,restitution,friction })` — 创建刚体
- `world.step(dt)` — 物理步进；`world.impulse(b,fx,fy,fz)` — 施加冲量；`world.teleport(b,x,y,z)`
- `world.raycast(origin, dir, maxLen)` — 返回 `{ body, t, nx,ny,nz }` 最近交点，null=未命中
- `b.grounded` / `b._sleeping` — 低速持续 0.5s 自动休眠，跳过积分和碰撞
- 碰撞对：box-box / sphere-sphere / box-sphere；broad phase：X 轴扫描剪枝
- `box(w,h,d)` / `sphere(r,segW,segH)` / `plane(w,d,tilesW,tilesD)` / `cylinder(r,h,segs)` — 程序化几何，`Object.values()` 展开传给 `r.geometry`
- `v3.new/add/sub/scale/dot/cross/normalize/lerp` — 写入预分配 out，热路径零 GC
- `m4.new/identity/mul/perspective/lookAt/translation/scale/rotX/rotY/rotZ/invert/transformV3`
- `quat.fromAxisAngle/mul/slerp/toMat4/normalize` / `DEG = Math.PI/180`

---

**典型游戏入口（createGame 统一初始化）**
```js
import { createGame, input, hud, audio, savedSignal,
         body, applyGravity, move, tweens, timer } from './index.js';

const W = 480, H = 270;

export function start(canvasEl) {
  const best = savedSignal('game_best', 0);
  const player = body({ x:60, y:200, w:16, h:24, gravity:800 });

  return createGame(canvasEl, {
    width: W, height: H, pixelated: true, bgColor: '#1a1a2e',
    initial: 'menu',
    states: (fsm) => ({
      menu: {
        update()    { if (input.down('jump')) fsm.go('play'); },
        render(ctx) { hud.text(ctx, 'PRESS JUMP', W/2, H/2, { align:'center' }); },
      },
      play: {
        enter()    { player.x = 60; player.vy = 0; },
        update(dt) {
          tweens.update(dt);
          timer.update(dt);
          applyGravity(player, dt);
          player.vx = input.axisX() * 160;
          if (input.down('jump') && player.grounded) player.vy = -520;
          move(player, dt, platforms);
        },
        render(ctx) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(player.x, player.y, player.w, player.h);
        },
        exit() { timer.clear(); tweens.clear(); },
      },
    }),
  });
}
```

- `createGame(el, { width, height, pixelated, bgColor, preload, states, initial })` — 一行完成 canvas+input 初始化、loop 启动、input.flush 调用，返回 stop 函数供切换游戏用
- `preload: async () => { assets.add(...); await assets.load(); }` — 加载阶段，期间自动显示进度条，完成后才启动 loop 和 states
- `states` 为工厂函数 `(fsm) => statesObject`，避免 `fsm.go()` 前向引用问题；也可传普通对象（状态间无需互相跳转时）

**弹球类游戏（pong / breakout）**
```js
const ball  = body({ x:240, y:135, w:8, h:8, gravity:0, restitution:1 });
const WALLS = [{ x:-10, y:-10, w:10, h:300 }, { x:480, y:-10, w:10, h:300 }];

// 墙壁：纯弹性碰撞，hits[] 用于触发音效
const hits = bounce(ball, dt, WALLS);
if (hits.length) beep(660);

// 挡板：弯曲法线弹射，方向 'right'|'left'|'up'|'down'
if (bouncePaddle(ball, paddle, { direction:'right', spread:1.1, speedGain:1.05, maxSpeed:600 }))
  beep(440);

// 圆形球（breakout）同样支持
if (bouncePaddle(circleBall, paddle, { direction:'up', spread:1.1, minNormal:50 }))
  beep(330);
```
