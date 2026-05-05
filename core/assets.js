// Asset preloader: images, audio (Web Audio), JSON
// Audio buffers decoded once; playback via pool of AudioBufferSourceNode
// Usage:
//   assets.add('player', 'img/player.png')
//   assets.add('shot',   'audio/shot.wav', 'audio')
//   await assets.load()
//   const img = assets.get('player')
//   assets.play('shot')           // fire-and-forget sfx via pool
//   assets.play('bgm', { loop: true, volume: 0.5 })

import { signal } from '../../mini-react/src/core.js';
import { pool }   from './pool.js';

export const loadProgress = signal(0);    // 0..1 reactive
export const loadError    = signal(null);

const _manifest = [];
const _cache = new Map();             // key → Image | AudioBuffer | object
const _sfxPools = new Map();          // key → pool of { node, gain, active }

// Lazily created AudioContext (browsers require user gesture first is fine here
// because load() is typically called on a click/start screen)
let _actx = null;
function _getAudioContext() {
  if (!_actx) _actx = new AudioContext();
  return _actx;
}

// ── loaders ──────────────────────────────────────────────────────────────────
function _loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error(`[assets] img failed: ${url}`));
    img.src = url;
  });
}

async function _loadAudio(url) {
  const actx = _getAudioContext();
  const buf = await fetch(url).then(r => r.arrayBuffer());
  return actx.decodeAudioData(buf);   // → AudioBuffer
}

function _loadJSON(url) {
  return fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); });
}

const _loaders = { image: _loadImage, audio: _loadAudio, json: _loadJSON };

// ── public API ────────────────────────────────────────────────────────────────
export const assets = {
  // register before load()
  add(key, url, type = 'image', opts = {}) {
    _manifest.push({ key, url, type, opts });
    return assets;
  },

  async load(onProgress) {
    const total = _manifest.length;
    if (!total) { loadProgress.value = 1; return; }
    let done = 0;

    await Promise.all(_manifest.map(async ({ key, url, type, opts }) => {
      try {
        const loader = _loaders[type];
        if (!loader) throw new Error(`[assets] unknown type: ${type}`);
        _cache.set(key, await loader(url, opts));

        // pre-warm audio pool so first sfx play has zero allocation
        if (type === 'audio') {
          const capacity = opts.poolSize ?? 8;
          _sfxPools.set(key, pool(capacity, () => ({ active: false, src: null, gain: null })));
        }
      } catch (e) {
        loadError.value = e;
        console.error(e);
      }
      loadProgress.value = ++done / total;
      onProgress?.(done / total, key);
    }));
  },

  get(key) {
    if (!_cache.has(key)) console.warn(`[assets] missing key: ${key}`);
    return _cache.get(key) ?? null;
  },

  // fire-and-forget sfx; uses pool to avoid new AudioBufferSourceNode on every shot
  play(key, { loop = false, volume = 1, detune = 0 } = {}) {
    const actx   = _getAudioContext();
    const buffer = _cache.get(key);
    if (!buffer || !(buffer instanceof AudioBuffer)) {
      console.warn(`[assets] play: not an audio buffer: ${key}`);
      return null;
    }

    const p = _sfxPools.get(key);
    const slot = p?.obtain();   // null if pool exhausted → skip silently

    if (!slot) return null;     // pool exhausted, drop the sound (better than GC spike)

    const src  = actx.createBufferSource();
    const gain = actx.createGain();
    src.buffer       = buffer;
    src.loop         = loop;
    src.detune.value = detune;
    gain.gain.value  = volume;

    src.connect(gain).connect(actx.destination);

    src.onended = () => { slot.active = false; };  // auto-recycle

    slot.src  = src;
    slot.gain = gain;
    src.start();

    return {
      stop()   { try { src.stop(); } catch (_) {} slot.active = false; },
      volume(v){ gain.gain.value = v; },
    };
  },

  getImage(key) {
    const v = _cache.get(key);
    if (!(v instanceof HTMLImageElement)) console.warn(`[assets] not an image: ${key}`);
    return /** @type {HTMLImageElement} */ (v) ?? null;
  },

  getAudio(key) {
    const v = _cache.get(key);
    if (!(v instanceof AudioBuffer)) console.warn(`[assets] not an AudioBuffer: ${key}`);
    return /** @type {AudioBuffer} */ (v) ?? null;
  },

  getJSON(key) { return _cache.get(key) ?? null; },

  has(key)  { return _cache.has(key); },
  clear()   { _cache.clear(); _sfxPools.clear(); _manifest.length = 0; loadProgress.value = 0; loadError.value = null; },

  get audioContext() { return _getAudioContext(); },
};
