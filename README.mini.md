# mini-game · 速查
轻量游戏框架，无构建，纯 ES Module。复用 mini-react signal 驱动响应式 HUD。

```js
import { loop, canvas, input, mouse, axis, scene, currentScene,
         assets, loadProgress, pool,
         time, timer, save, load, savedSignal,
         body, move, applyGravity, aabb, mtv, raycast,
         camera, tilemap, particles, spriteSheet,
         hud, menu, dialog,
         audio,
         renderer, camera3d, physics3d,
         box, sphere, plane, cylinder,
         v3, m4, quat, DEG,
         math, random, tweens } from './index.js';
```

---

## Core

- `loop.start(update, render)` — 固定步长（1/60s）update + 可变帧率 render；`render` 收到 alpha∈[0,1] 可做位置插值
- `loop.pause()` / `loop.resume()` / `loop.stop()` / `loop.fps` / `loop.frame`
- `canvas.init('#c', { width:480, height:270, pixelated:true })` — DPR 感知，自动处理高分屏；省略 width/height 则 fit 父容器
- `canvas.clear('#1a1a2e')` / `canvas.ctx` / `canvas.w` / `canvas.h`
- `input.init(canvas.el)` — 键盘自动挂 `window`（canvas 无需 tabindex），pointer 挂传入元素
- `input.pressed('left')` — 持续按住；`input.down('jump')` — 首帧按下；`input.up('action')` — 首帧释放
- `input.axisX()` / `input.axisY()` — 返回 -1 / 0 / 1；**update 末尾必须调用 `input.flush()`**
- `mouse.x.value` / `mouse.y.value` / `mouse.justDown.value` — signal，可在 effect 内响应
- `axis.x.value` / `axis.y.value` — flush 时更新的轴 signal
- 内置别名：`left/right/up/down/jump/action/pause`，各映射 WASD + 方向键 + 常用键
- `scene.define(name, { enter, update, exit, render, pause?, resume? })` — 注册场景
- `scene.go(name, data)` — 清空栈切换；`scene.push(name)` — 叠加（overlay）；`scene.pop()` — 返回下层
- render 遍历整个栈，底层先画；overlay 自然叠在上面
- `currentScene.value` — signal，场景名变化时触发 effect
- `assets.add(key, url, type?)` — type: `'image'`（默认）/ `'audio'` / `'json'`；`await assets.load(onProgress)`
- `assets.get(key)` — 返回 HTMLImageElement / AudioBuffer / object
- `loadProgress.value` — signal 0..1，可直接绑进度条
- `pool(cap, factory, reset?)` — 预分配对象池，零 GC；`obtain()` 取槽，`active=false` 回收，`update(fn)` 遍历+自动回收（返回 false = 释放）
- `time.scale` — 全局时间缩放（`< 1` 慢动作，`> 1` 加速）；loop 自动将 `dt * time.scale` 传给 update
- `time.rawDt` — loop 每 tick 写入的原始帧时间（未缩放），用于需要挂钟时间的场景（如将 `time.scale` 自身 tween 回 1）
- `timer.after(delay, fn)` — 延迟回调（秒）；`timer.every(interval, fn)` — 周期回调（fn 返回 false 取消）；`timer.update(dt)` 需在 update 内调用；`timer.clear()` 场景 exit 时清空
- `save(key, data)` / `load(key, def)` / `deleteSave(key)` — localStorage JSON 存档；`savedSignal(key, def)` — 写入即自动持久化的 signal

---

## Utils

- `math.clamp/lerp/remap/smoothstep/wrap/sign/pingpong` — 标量工具
- `math.dist/dist2/angle/dirX/dirY` — 2D 几何
- `math.moveToward(cur, target, step)` — 匀速逼近（敌人追踪、缓动移动）
- `math.lerpAngle(a,b,t)` — 角度插值（自动处理 ±π 跨界）
- `math.toRad/toDeg` / `math.rand/randInt` — 非 seeded 随机快捷
- `random.seed(n)` — 设置 mulberry32 PRNG 种子；`random.next/float/int/pick/shuffle/chance`
- `tweens.to(obj, props, duration, easing)` — 返回 `{ stop(), onDone(fn) }`；easing: `linear/easeIn/easeOut/easeInOut/easeOutCubic/easeOutBack/easeOutBounce/easeOutElastic`；`tweens.update(dt)` 需每帧调用；`tweens.clear()` 场景 exit 清空
- `assets.getImage(key)` / `assets.getAudio(key)` / `assets.getJSON(key)` — 类型化快捷

---

## 2D

- `body({ x,y,w,h, friction:0.6, restitution:0, type:'dynamic' })` — 2D AABB 刚体
- `applyGravity(b, dt)` — `vy += gravity * dt`
- `move(b, dt, obstacles)` — 移动 + 碰撞解算；obstacles 元素 `{ x,y,w,h, oneWay? }`；oneWay=true 单向平台
- `b.grounded` — 落地检测（MTV ny=-1 时为 true，即 MTV 向上推）
- `aabb(a,b)` — boolean；`mtv(a,b)` — `{ dx,dy,nx,ny }` 最小分离向量；`raycast(ray, rects)` — `{ t,nx,ny,hit }`
- `circleVsCircle(a,b)` — boolean，圆 `{x,y,r}` 重叠检测
- `circleMtv(a,b)` — `{ nx,ny,pen }` 圆-圆最小分离向量
- `circleVsRect(c,r)` — boolean，圆 vs AABB `{x,y,w,h}`
- `circleRectMtv(c,r)` — `{ nx,ny,pen }` 圆-矩形最小分离向量（含圆心在矩形内的情形）
- `camera({ w,h, lerp:0.05, bounds:{x,y,w,h} })` — 2D 跟随相机
- `cam.follow(target)` / `cam.update(dt)` / `cam.shake(duration, mag)`
- `cam.begin(ctx)` … 画世界物体 … `cam.end(ctx)` — save/translate/restore 包裹
- `cam.screenToWorld(sx,sy)` / `cam.worldToScreen(wx,wy)` — 鼠标世界坐标转换
- `spriteSheet(img, fw, fh)` — 返回 sheet；`sheet.anim(name, frames, fps)` — 帧动画
- `anim.update(dt)` / `anim.draw(ctx, x, y, { flipX, scale, alpha })` / `anim.reset()` / `anim.done`
- `tilemap({ tileW, tileH, img })` — `map.loadGrid(grid)` 或 `map.loadTiled(json)`（支持 Tiled 导出）
- `map.update(dt)` / `map.render(ctx, cam)` — 相机裁剪渲染
- `map.solidRects()` — 贪心合并 solid tile → `[{x,y,w,h}]`，直接传给 `move()`
- `particles(cap)` — `ps.burst({ x,y, count, speed, spread, lifetime, colorStart, colorEnd, gravity, ... })`
- `ps.emit({ x,y, rate, ... })` — 持续发射，返回 `{ stop() }`；`ps.update(dt)` / `ps.render(ctx)`
- `ps.presets.explosion(ps,x,y)` / `.dust` / `.sparkle` — 内置预设

---

## UI（Canvas 绘制，屏幕空间，在 cam.end 后调用）

- `hud.bar(ctx, x,y,w,h, value,max, { color,bg,border,radius })` — 血条/进度条
- `hud.pips(ctx, x,y, size,gap, total,filled, { color,bg })` — 命数圆点
- `hud.text(ctx, str, x,y, { font,color,align,shadow })` — 带阴影文字
- `hud.score(ctx, value, x,y, { digits:6 })` — 零填充数字
- `hud.fade(ctx, alpha, { color,w,h })` — 场景淡入淡出遮罩
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

**典型主循环**
```js
canvas.init('#c', { width:480, height:270, pixelated:true });
input.init(canvas.el);

scene.define('play', {
  enter() {
    random.seed(Date.now());          // 每局随机种子
    timer.clear();                    // 清理上一局残留 timer
    tweens.clear();
    time.scale = 1;
  },
  update(dt) {
    // dt 已经乘以 time.scale，物理/动画自动慢放
    tweens.update(dt);                // tween 驱动
    timer.update(dt);                 // 延迟/周期回调

    applyGravity(player, dt);
    player.vx = input.axisX() * SPEED;
    if (input.down('jump') && player.grounded) {
      player.vy = JUMP_V;
      // 跳跃 bullet-time：0.4x 慢放 → 1s 内恢复正常
      time.scale = 0.4;
      tweens.to(time, { scale: 1 }, 1.0, 'easeIn');
    }
    move(player, dt, platforms);
    cam.update(dt);

    // 定时触发事件，无需手写计数器
    // timer.after(3, () => spawnEnemy());
    // timer.every(0.5, () => emitParticle());

    input.flush();   // ← 必须最后
  },
  render(ctx) {
    canvas.clear('#1a1a2e');
    cam.begin(ctx);
      // draw sprites, tiles...
    cam.end(ctx);
    hud.bar(ctx, 8, 8, 80, 8, hp, maxHp);
  },
  exit() {
    timer.clear();   // 离开场景时清理
    tweens.clear();
  },
});

effect(() => { statusEl.textContent = currentScene.value; });
scene.go('play');
loop.start(dt => scene.update(dt), () => scene.render(ctx));
```
