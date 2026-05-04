// mini-game — public API

// core
export { loop }                              from './core/loop.js';
export { canvas }                            from './core/canvas.js';
export { input, mouse, axis, keys }          from './core/input.js';
export { scene, currentScene }               from './core/scene.js';
export { assets, loadProgress, loadError }   from './core/assets.js';
export { pool }                              from './core/pool.js';

// 2d
export { spriteSheet, sprite }               from './2d/sprite.js';
export { body, aabb, mtv, move, applyGravity, resolve, raycast } from './2d/physics.js';
export { camera }                            from './2d/camera.js';
export { tilemap }                           from './2d/tilemap.js';
export { particles }                         from './2d/particles.js';

// ui
export { hud }                               from './ui/hud.js';
export { menu }                              from './ui/menu.js';
export { dialog }                            from './ui/dialog.js';

// audio
export { audio, masterVolume }               from './audio/audio.js';

// 3d
export { renderer }                          from './3d/renderer.js';
export { camera3d }                          from './3d/camera3d.js';
export { box, sphere, plane, cylinder }      from './3d/geo.js';
export { v3, v4, m4, quat, DEG, RAD }        from './3d/math.js';
export { physics3d }                         from './3d/physics3d.js';
