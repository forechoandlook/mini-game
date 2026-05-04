# mini-game · 速查
轻量游戏框架，无构建，纯 ES Module。基于 mini-react signal 实现响应式 HUD。

```js
import {
  // core
  loop, canvas, input, mouse, axis, keys, scene, currentScene,
  assets, loadProgress, pool,
  // 2d
  body, aabb, mtv, move, applyGravity, resolve, raycast,
  camera, tilemap, particles, spriteSheet, sprite,
  // ui
  hud, menu, dialog,
  // audio
  audio, masterVolume,
  // 3d
  renderer, camera3d, physics3d,
  box, sphere, plane, cylinder,
  v3, v4, m4, quat, DEG,
} from './index.js';
```

---

## Core

### loop
固定步长（1/60s）物理更新 + 可变帧率渲染，避免物理发散。
```js
loop.start(
  dt    => scene.update(dt),   // update: 固定 1/60s 调用
  alpha => scene.render(ctx)   // render: 每帧，alpha=0..1 插值用
)
loop.pause() / loop.resume() / loop.stop()
loop.fps    // 当前帧率（只读）
loop.frame  // 累计 update 次数
```

### canvas
DPR 感知，自动处理高分屏模糊问题。
```js
canvas.init('#c', { width:480, height:270, pixelated:true })
canvas.init('#c')                      // 自动 fit 父容器
canvas.resize(w, h)                    // 固定逻辑分辨率
canvas.fit()                           // 充满父元素
canvas.clear('#1a1a2e')               // 填色清屏
canvas.clear()                         // 透明清屏
canvas.ctx  // CanvasRenderingContext2D
canvas.w / canvas.h / canvas.el
```

### input
键盘挂在 `window`（canvas 无需 tabindex），鼠标/触摸挂在传入元素。
```js
input.init(canvas.el)                  // 初始化，键盘自动挂 window

// 命令式（在 update() 内用）
input.pressed('left')                  // 持续按住
input.down('jump')                     // 首帧按下（需在 flush 前读）
input.up('action')                     // 首帧释放
input.axisX()                          // -1 / 0 / 1
input.axisY()
input.flush()                          // update() 末尾必须调用

// 响应式（在 effect / HUD 内用）
axis.x.value / axis.y.value            // signal，flush 时更新
mouse.x.value / mouse.y.value          // 实时指针坐标 signal
mouse.down.value                       // 鼠标按住 signal
mouse.justDown.value                   // 首帧按下 signal（flush 后清零）
keys.left.value                        // 任意别名的 held signal，懒创建

// 内置别名
// left:  ArrowLeft / a / A
// right: ArrowRight / d / D
// up:    ArrowUp / w / W
// down:  ArrowDown / s / S
// jump:  Space / ArrowUp / w / W
// action:Enter / z / Z
// pause: Escape / p / P
```

### scene
场景栈：`go` 替换、`push` 叠加（暂停菜单）、`pop` 返回。
```js
scene.define('play', {
  enter(data) {},        // 切入时
  update(dt) {},         // 每固定步调用
  render(ctx, alpha) {}, // 每帧调用
  exit() {},             // 切出时
  pause() {},            // 被 push 压住时（可选）
  resume() {},           // 重新成为栈顶时（可选）
})
scene.go('play', data)   // 清空栈，进入新场景
scene.push('pause')      // 压栈（两个 render 都会被调用）
scene.pop()              // 弹出，回到下层

// 响应式
currentScene.value       // signal：当前场景名，可在 effect 内绑定 HUD
```
render 遍历整个栈，底层场景先画，叠加场景（暂停 overlay）画在上面。

### assets
```js
assets.add('player', 'img/player.png')           // image（默认）
assets.add('shot',   'audio/shot.wav', 'audio')
assets.add('map',    'data/level1.json', 'json')
await assets.load(progress => console.log(progress))  // 并行加载

assets.get('player')   // → HTMLImageElement / AudioBuffer / object
assets.play('shot', { volume:0.5, detune:100 })   // 直接播放已注册音频

// 响应式进度条
effect(() => bar.style.width = loadProgress.value * 100 + '%')
```

### pool
预分配数组，避免 GC 卡顿。子弹、粒子等高频创建对象必用。
```js
const bullets = pool(64, () => ({ x:0,y:0,vx:0,vy:0,active:false }))

const b = bullets.obtain()   // 拿一个空闲槽（pool 耗尽返回 null，静默丢弃）
b.active = false             // 回收（直接写 active）
bullets.release(b)           // 或显式回收

bullets.forEach(b => { /* 仅遍历 active */ })
bullets.update(b => {        // 返回 false → 自动回收
  b.x += b.vx * dt
  return b.x < 480
})
bullets.active    // 当前活跃数
bullets.capacity  // 池容量
```

---

## 2D

### physics（2D AABB）
纯函数，无全局状态，可随意组合。
```js
const p = body({ x, y, w:12, h:14, friction:0.6, restitution:0 })

applyGravity(p, dt)           // vy += gravity * dt
move(p, dt, obstacles)        // 移动 + AABB 碰撞解算，设 p.grounded

// obstacles 元素格式：{ x, y, w, h, oneWay? }
// oneWay:true = 单向平台（只从上方碰撞）

aabb(a, b)                    // boolean 快速检测
mtv(a, b)                     // → { dx, dy, nx, ny } 最小分离向量
resolve(a, b)                 // 双动态体分离
raycast(ray, rects)           // → { t, nx, ny, hit } 最近交点

// MTV 法线约定：ny=-1 = MTV 把 a 向上推（a 在 b 上方）
// grounded 判断：m.ny === -1
```

### camera（2D）
```js
const cam = camera({ w:480, h:270, lerp:0.05,
                     bounds:{ x:0,y:0,w:1200,h:270 } })
cam.follow(player)            // target 需有 { x, y, w?, h? }
cam.update(dt)

cam.begin(ctx)                // ctx.save + translate（在此内画世界物体）
  // draw world objects
cam.end(ctx)                  // ctx.restore

cam.shake(duration, magnitude)           // 屏幕震动
cam.worldToScreen(wx, wy)               // → { x, y }
cam.screenToWorld(sx, sy)               // → { x, y }（鼠标世界坐标）
cam.viewport                            // → { x,y,w,h } 可见区域（用于裁剪）
cam.teleport(wx, wy)
cam.xSig / cam.ySig                     // 相机位置 signal（小地图用）
```

### sprite
```js
const sheet = spriteSheet(img, 16, 16)            // 每帧 16×16
const run   = sheet.anim('run', [0,1,2,3], 8)     // frames 数组，8fps

run.update(dt)
run.draw(ctx, x, y)
run.draw(ctx, x, y, { flipX:true, scale:2, alpha:0.8 })
run.reset() / run.setLoop(false)
run.done    // 非循环动画是否播完

sheet.drawFrame(ctx, frameIdx, x, y, opts)        // 直接画单帧
```

### tilemap
```js
// 内联 grid
const map = tilemap({ tileW:16, tileH:16, img })
map.loadGrid([[1,1,1],[0,0,1]], { name:'base' })

// Tiled JSON
map.loadTiled(json)           // 自动解析 layers + animated tiles

map.update(dt)                // 推进动画帧
map.render(ctx, cam)          // 相机裁剪渲染（传 null = 全量）

const solids = map.solidRects()   // 贪心合并 → [{x,y,w,h}] 给 move() 用
map.tileAt(wx, wy)                // 世界坐标 → tile id
map.setTile(col, row, id)
```

### particles
内部全用 `Float32Array`，对象池，零 GC。
```js
const ps = particles(512)     // 最大粒子数

ps.burst({ x, y, count:20,
  speed:80, speedVar:30,
  spread: Math.PI * 2,        // 全向扩散（锥形用更小值）
  angle: -Math.PI/2,          // 基础方向（可选）
  lifetime:0.6, lifetimeVar:0.2,
  size:5, sizeEnd:0,
  gravity:100,
  colorStart:[1,0.4,0.1,1],
  colorEnd:  [0.5,0.1,0,0],
})

const emitter = ps.emit({ x, y, rate:30, ...opts })  // 持续发射
emitter.stop()

ps.update(dt)
ps.render(ctx)        // 矩形粒子
ps.renderCircles(ctx) // 圆形粒子

// 内置预设
ps.presets.explosion(ps, x, y)
ps.presets.dust(ps, x, y)
ps.presets.sparkle(ps, x, y)
```

---

## UI

### hud（Canvas 绘制，屏幕空间）
在 `cam.end(ctx)` 之后调用，不受相机变换影响。
```js
hud.bar(ctx, x, y, w, h, value, max,
  { color:'#e53935', bg:'#111', border:'#333', radius:2 })

hud.pips(ctx, x, y, size, gap, total, filled,
  { color:'#e53935', bg:'#333' })            // 命数心形/圆点

hud.text(ctx, 'SCORE', x, y,
  { font:'12px monospace', color:'#fff',
    align:'right', shadow:{ color:'#000', ox:1, oy:1 } })

hud.score(ctx, value, x, y, { digits:6 })   // 零填充数字

hud.fade(ctx, alpha, { color:'#000', w, h }) // 场景淡入淡出
```

### menu（键盘 + 鼠标双驱动）
```js
const m = menu({
  items: [
    { label:'Start',  action: () => scene.go('play') },
    { label:'Quit',   action: () => {} },
  ],
  x: canvas.w/2, y: canvas.h/2,
  itemW:160, itemH:22, gap:4,
  font:'13px monospace',
  colorActive:'#fff', colorActiveBg:'rgba(255,255,255,0.1)',
  onCancel: () => scene.pop(),
})
m.update(dt)    // 方向键导航 + Enter/Z 确认 + 鼠标 hover/click
m.render(ctx)
m.index         // 当前选中项索引（可读写）
m.setItems([])  // 运行时替换选项
```

### dialog（逐字打印）
```js
const d = dialog({ x:20, canvasH:270, w:300, h:52, cps:30 })

d.show('Hello!', { speaker:'Hero', ctx })
d.show('Long text...', { onDone: () => scene.go('next') })
d.advance()     // 跳到末尾 / 关闭
d.update(dt)    // 处理输入（action/jump 键跳过）
d.render(ctx)

d.isOpen        // bool
d.isDone        // 文字是否全部显示
d.isOpenSig     // signal，可在 effect 内响应
```
update 内对话框开启时应先处理 dialog，再 `return` 跳过其他 input，避免穿透。

---

## Audio

Web Audio API 封装，首次 `play()` 自动创建 AudioContext（满足浏览器自动播放策略）。
```js
// 注册（通常在 assets.load 之后）
audio.sfx('shot',   audioBuffer)
audio.bgm('stage1', audioBuffer)

// 播放音效（pool 化，pool 耗尽静默丢弃，不卡顿）
audio.play('shot')
audio.play('shot', { volume:0.5, detune:100, rate:1.2, channel:'sfx' })

// BGM 淡入切换
audio.playBgm('stage1', { volume:0.6, fade:0.8 })
audio.stopBgm({ fade:0.5 })
audio.currentBgm   // 当前 bgm key

// 程序化音效（无需音频文件）
audio.tone(440, { type:'square', duration:0.08, volume:0.3 })  // 单频
audio.sweep(800, 100, { duration:0.12 })   // 频率扫描（激光/下落）
audio.noise({ duration:0.15, volume:0.4 }) // 白噪声（爆炸/碰撞）

// 音量分组
audio.masterVolume = 0.8
audio.channel('sfx').volume   = 0.6
audio.channel('music').volume = 0.4

// 响应式
masterVolume.value  // signal
```

---

## 3D

### renderer（WebGL2）
无场景图，显式 draw call，program/VAO 状态缓存避免冗余 GL 调用。
```js
const r = renderer(canvas)               // canvas 需是 <canvas> 元素

// 上传几何（一次性）
const geo = r.geometry(positions, normals, uvs, indices)
//   positions: Float32Array (xyz…)
//   indices:   Uint16Array（null → drawArrays）

// 上传纹理
const tex = r.texture(img, { wrap:'repeat', filter:'nearest' })

// 材质（Blinn-Phong 内置 shader）
const mat = r.material(null, { u_albedo:[1,0,0,1], u_tex:tex })

// 无光照 flat 材质
const mat = r.unlitMaterial([1,1,0,1])

// 自定义 shader
const prog = r.shader(vertGLSL, fragGLSL)
const mat  = r.material(prog, { u_albedo:[1,1,1,1] })

// 每帧
r.begin([0.05,0.05,0.1,1])              // clear
r.setCamera(cam.view, cam.proj)
r.setLight({ dir, color, ambient })     // vec3 arrays
r.draw(r.mesh(geo, mat), modelMatrix)   // modelMatrix: Float32Array[16]
r.end()
```

### camera3d
```js
const cam = camera3d({ fov:60*DEG, aspect:16/9, near:0.05, far:500,
                        mode:'fps' })    // 'fps' | 'orbit'
// FPS
cam.moveFPS({ moveX, moveZ, moveY, speed:5, dt })
cam.rotateFPS(mouseDX, mouseDY, sensitivity)

// Orbit
cam.orbit(dx, dy)
cam.zoom(delta)
cam.setOrbitTarget(x, y, z)

cam.view / cam.proj       // Float32Array[16]，直接传 r.setCamera
cam.pos                   // Float32Array[3]
cam.forward               // 视线方向 vec3

// 鼠标拾取射线
const ray = cam.rayFromScreen(ndcX, ndcY)  // ndcX/Y ∈ [-1,1]
// → { origin: vec3, dir: vec3 }
```

### physics3d（AABB + Sphere）
```js
const world = physics3d({ gravity:20, substeps:3 })

// 创建刚体
const b = world.body({
  shape:'box',             // 'box' | 'sphere'
  type:'dynamic',          // 'dynamic' | 'static' | 'kinematic'
  x:0, y:4, z:0,
  hx:0.5, hy:0.5, hz:0.5, // box 半尺寸
  r:0.5,                   // sphere 半径
  mass:1, restitution:0.3, friction:0.5,
  gravityScale:1,
  tag:'enemy', data:{}     // 用户自定义
})

world.step(dt)             // 物理步进（内含 substeps 子步，避免穿透）
world.impulse(b, fx,fy,fz) // 施加冲量（自动唤醒休眠体）
world.teleport(b, x, y, z)
world.remove(b)

// 射线检测
const hit = world.raycast(origin, dir, maxLen)
// → { body, t, nx, ny, nz } 最近交点 + 法线，null = 未命中

// 体属性（每帧读）
b.x / b.y / b.z           // 当前位置
b.vx / b.vy / b.vz        // 速度
b.grounded                 // 是否站在地面（box body）
b._sleeping                // 是否休眠
```
休眠机制：速度低于阈值持续 0.5s 后自动休眠，跳过积分和碰撞，大量静止物体几乎零开销。  
碰撞对支持：box-box、sphere-sphere、box-sphere。  
Broad phase：X 轴扫描剪枝（sort + interval），N<200 足够。

### 程序化几何
```js
box(w, h, d)               // → { positions, normals, uvs, indices }
sphere(radius, segW, segH)
plane(w, d, tilesW, tilesD)
cylinder(r, h, segs, caps)

// 直接传给 renderer
const geo = r.geometry(...Object.values(box(1,1,1)))
```

### math（零分配）
所有运算写入预分配的 `out` 参数，热路径无 GC。
```js
// Vec3
const a = v3.new(1, 0, 0)
v3.add(out, a, b) / v3.sub / v3.scale / v3.dot / v3.cross
v3.normalize(out, a) / v3.len(a) / v3.lerp(out, a, b, t)

// Mat4（列主序，与 WebGL 一致）
const M = m4.new()
m4.identity(M)
m4.mul(out, a, b)
m4.perspective(out, fovY, aspect, near, far)
m4.lookAt(out, eye, center, up)
m4.translation(out, x, y, z)
m4.scale(out, x, y, z)
m4.rotX(out, angle) / m4.rotY / m4.rotZ
m4.invert(out, M) / m4.transpose(out, M)
m4.transformV3(out, M, v)   // 点变换（含透视除法）
m4.transformDir(out, M, v)  // 方向变换（w=0）

// Quaternion
const q = quat.new()
quat.fromAxisAngle(q, axis, angle)
quat.mul(out, a, b)
quat.slerp(out, a, b, t)
quat.toMat4(out, q)
quat.normalize(out, q)

DEG   // Math.PI / 180（角度转弧度）
RAD   // 180 / Math.PI
```

---

## 典型游戏主循环

```js
import { loop, canvas, input, scene, currentScene } from './index.js';
import { effect } from '../mini-react/src/core.js';

canvas.init('#c', { width:480, height:270, pixelated:true });
input.init(canvas.el);

scene.define('play', {
  enter() {},
  update(dt) {
    // 1. 物理 / 逻辑
    // 2. input.flush() ← 必须最后调用
  },
  render(ctx) {
    canvas.clear('#1a1a2e');
    cam.begin(ctx);
      // 世界物体
    cam.end(ctx);
    // HUD（屏幕空间）
    hud.bar(ctx, 8, 8, 80, 8, hp, 5);
  },
});

// 响应式 HUD 文字
effect(() => { document.title = `scene: ${currentScene.value}`; });

scene.go('play');
loop.start(dt => scene.update(dt), alpha => scene.render(ctx));
```

## 文件结构
```
mini-game/
  core/   loop · canvas · input · scene · assets · pool
  2d/     sprite · physics · camera · tilemap · particles
  ui/     hud · menu · dialog
  audio/  audio
  3d/     math · renderer · camera3d · physics3d · geo
  index.js          ← re-export all
  demo/
    index.html      ← 2D 平台跳跃演示
    demo3d.html     ← 3D 物理演示
```
