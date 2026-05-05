// Global time scale — multiply dt before physics/animation
// set time.scale < 1 for bullet-time, > 1 for fast-forward
//
// time.rawDt is written by loop each tick (unscaled seconds per fixed step).
// Use it when you need wall-clock time regardless of time.scale,
// e.g. to tween time.scale itself back to 1.
export const time = {
  scale:  1,
  rawDt:  0,   // set by loop; read-only from game code
};
