// Web Audio engine: sfx pool, bgm, master/channel volume, procedural tones
// No external deps. AudioContext created on first play() (browser autoplay policy).
//
// Usage:
//   audio.sfx('shot',  buffer)           // register buffer
//   audio.bgm('stage1', buffer)          // register bgm buffer
//   audio.play('shot')                   // fire-and-forget sfx
//   audio.play('shot', { volume:0.5, detune:100, rate:1.2 })
//   audio.playBgm('stage1', { fade:1 })  // crossfade to new bgm
//   audio.stopBgm({ fade:0.5 })
//   audio.masterVolume = 0.8
//   audio.tone(440, { type:'square', duration:0.1, volume:0.3 })  // procedural beep
//
// Channels let you group volume (e.g. 'sfx', 'music', 'ui'):
//   audio.channel('sfx').volume = 0.6

let _ctx = null;
function _ac() {
  if (!_ctx) {
    _ctx = new AudioContext();
    // resume if suspended (mobile autoplay policy)
    if (_ctx.state === 'suspended') {
      const resume = () => { _ctx.resume(); document.removeEventListener('pointerdown', resume); };
      document.addEventListener('pointerdown', resume);
    }
  }
  return _ctx;
}

// ── Channel (gain node group) ─────────────────────────────────────────────────
class Channel {
  constructor(name, parent) {
    this.name = name;
    this._vol = 1;
    this._node = null;   // lazy: created when audio context exists
    this._parent = parent;
  }
  _gain() {
    if (!this._node) {
      this._node = _ac().createGain();
      this._node.gain.value = this._vol;
      this._node.connect(this._parent);
    }
    return this._node;
  }
  get volume() { return this._vol; }
  set volume(v) {
    this._vol = Math.max(0, Math.min(1, v));
    this._node?.gain.setTargetAtTime(this._vol, _ac().currentTime, 0.01);
  }
}

// ── SFX pool slot ─────────────────────────────────────────────────────────────
// Pre-allocate N source+gain pairs per registered sfx to avoid GC on rapid fire
const POOL_SIZE = 8;

// ── Main audio object ──────────────────────────────────────────────────────────
const _buffers  = new Map();   // key → AudioBuffer
const _sfxPool  = new Map();   // key → [{src,gain,active}]
const _channels = new Map();   // name → Channel
let   _masterGain = null;
let   _masterVol  = 1;

// bgm state
let _bgmNode  = null;
let _bgmGain  = null;
let _bgmKey   = null;

function _master() {
  if (!_masterGain) {
    _masterGain = _ac().createGain();
    _masterGain.gain.value = _masterVol;
    _masterGain.connect(_ac().destination);
  }
  return _masterGain;
}

function _ch(name = 'sfx') {
  if (!_channels.has(name)) _channels.set(name, new Channel(name, _master()));
  return _channels.get(name);
}

function _poolFor(key) {
  if (!_sfxPool.has(key)) {
    _sfxPool.set(key, Array.from({ length: POOL_SIZE }, () => ({ active: false, src: null, gain: null })));
  }
  return _sfxPool.get(key);
}

export const audio = {
  // ── Register ───────────────────────────────────────────────────────────────
  sfx(key, buffer) {
    _buffers.set(key, buffer);
    _poolFor(key);  // pre-warm pool
    return audio;
  },

  bgm(key, buffer) {
    _buffers.set('__bgm__' + key, buffer);
    return audio;
  },

  // register from assets.js AudioBuffer directly
  register(key, buffer, type = 'sfx') {
    return type === 'bgm' ? audio.bgm(key, buffer) : audio.sfx(key, buffer);
  },

  // ── Playback ───────────────────────────────────────────────────────────────
  play(key, { volume = 1, detune = 0, rate = 1, channel = 'sfx', loop = false } = {}) {
    const buf = _buffers.get(key);
    if (!buf) { console.warn('[audio] unknown sfx:', key); return null; }

    const ac   = _ac();
    const pool = _poolFor(key);
    const slot = pool.find(s => !s.active);
    if (!slot) return null;   // pool exhausted — drop sound, no GC spike

    const src  = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer              = buf;
    src.loop                = loop;
    src.detune.value        = detune;
    src.playbackRate.value  = rate;
    gain.gain.value         = volume;

    src.connect(gain);
    gain.connect(_ch(channel)._gain());
    src.start();

    slot.active = true;
    slot.src    = src;
    slot.gain   = gain;
    src.onended = () => { slot.active = false; };

    return {
      stop()    { try { src.stop(); } catch(_) {} slot.active = false; },
      setVolume(v) { gain.gain.setTargetAtTime(v, ac.currentTime, 0.02); },
    };
  },

  // ── BGM crossfade ──────────────────────────────────────────────────────────
  playBgm(key, { volume = 0.6, fade = 0.8, loop = true } = {}) {
    if (_bgmKey === key) return;
    const buf = _buffers.get('__bgm__' + key);
    if (!buf) { console.warn('[audio] unknown bgm:', key); return; }

    const ac = _ac();
    audio.stopBgm({ fade });

    const src  = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buf;
    src.loop   = loop;
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ac.currentTime + fade);
    src.connect(gain);
    gain.connect(_ch('music')._gain());
    src.start();

    _bgmNode = src;
    _bgmGain = gain;
    _bgmKey  = key;
  },

  stopBgm({ fade = 0.5 } = {}) {
    if (!_bgmNode) return;
    const ac = _ac();
    const g  = _bgmGain;
    const n  = _bgmNode;
    g.gain.setTargetAtTime(0, ac.currentTime, fade / 3);
    setTimeout(() => { try { n.stop(); } catch(_) {} }, (fade + 0.2) * 1000);
    _bgmNode = null; _bgmGain = null; _bgmKey = null;
  },

  // ── Procedural tone (beep/boop for retro sfx) ─────────────────────────────
  tone(freq = 440, { type = 'square', duration = 0.08, volume = 0.3,
                     attack = 0.005, release = 0.05, channel = 'sfx' } = {}) {
    const ac  = _ac();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type            = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ac.currentTime + attack);
    gain.gain.setValueAtTime(volume, ac.currentTime + duration - release);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + duration);
    osc.connect(gain);
    gain.connect(_ch(channel)._gain());
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration + 0.01);
  },

  // Frequency sweep (laser, coin, powerup)
  sweep(fromFreq, toFreq, { type = 'square', duration = 0.1, volume = 0.3, channel = 'sfx' } = {}) {
    const ac  = _ac();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(toFreq, ac.currentTime + duration);
    gain.gain.setValueAtTime(volume, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + duration);
    osc.connect(gain);
    gain.connect(_ch(channel)._gain());
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration + 0.01);
  },

  // Noise burst (explosion, hit)
  noise({ duration = 0.15, volume = 0.4, channel = 'sfx' } = {}) {
    const ac     = _ac();
    const rate   = ac.sampleRate;
    const frames = Math.ceil(rate * duration);
    const buf    = ac.createBuffer(1, frames, rate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const src  = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(volume, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + duration);
    src.connect(gain);
    gain.connect(_ch(channel)._gain());
    src.start();
  },

  // ── Volume control ─────────────────────────────────────────────────────────
  get masterVolume() { return _masterVol; },
  set masterVolume(v) {
    _masterVol = Math.max(0, Math.min(1, v));
    _masterGain?.gain.setTargetAtTime(_masterVol, _ac().currentTime, 0.02);
  },

  channel(name) { return _ch(name); },

  get currentBgm() { return _bgmKey; },
  get context()    { return _ac(); },
};
