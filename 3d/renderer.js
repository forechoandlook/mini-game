// Minimal WebGL2 renderer — enough for a 3D mini-game.
// No scene graph. Raw draw calls, but with a thin state cache to avoid redundant
// GL calls (the single biggest perf killer in WebGL).
//
// Design: Bellard-style — one file, every concept explicit, no magic.
// Pipeline: geometry → vertex shader → rasterize → fragment shader → framebuffer
//
// Usage:
//   const r = renderer(canvas)
//   const geo = r.geometry(positions, normals, uvs, indices)
//   const mat = r.material(r.shader(vertSrc, fragSrc), { albedo:[1,0,0,1] })
//   const mesh = r.mesh(geo, mat)
//   r.begin()
//   r.setCamera(viewMat, projMat)
//   r.draw(mesh, modelMat)
//   r.end()

import { m4, v3 } from './math.js';

// ── Built-in shader sources ───────────────────────────────────────────────────
const VERT_DEFAULT = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;
uniform mat4 u_mvp;
uniform mat4 u_model;
out vec3 v_normal;
out vec2 v_uv;
out vec3 v_worldPos;
void main() {
  vec4 worldPos = u_model * vec4(a_pos, 1.0);
  v_worldPos = worldPos.xyz;
  v_normal   = mat3(u_model) * a_normal;
  v_uv       = a_uv;
  gl_Position = u_mvp * vec4(a_pos, 1.0);
}`;

const FRAG_DEFAULT = `#version 300 es
precision mediump float;
in vec3 v_normal;
in vec2 v_uv;
in vec3 v_worldPos;
uniform vec4  u_albedo;
uniform vec3  u_lightDir;   // normalized, world space
uniform vec3  u_lightColor;
uniform vec3  u_ambient;
uniform sampler2D u_tex;
uniform float u_useTex;
out vec4 fragColor;
void main() {
  vec3 N    = normalize(v_normal);
  float NdL = max(0.0, dot(N, normalize(u_lightDir)));
  vec4  base = u_useTex > 0.5 ? texture(u_tex, v_uv) * u_albedo : u_albedo;
  vec3  color = base.rgb * (u_ambient + u_lightColor * NdL);
  fragColor = vec4(color, base.a);
}`;

// Unlit flat color (for debug, HUD geometry)
const FRAG_UNLIT = `#version 300 es
precision mediump float;
uniform vec4 u_albedo;
out vec4 fragColor;
void main() { fragColor = u_albedo; }`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function _compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error('[renderer] shader: ' + gl.getShaderInfoLog(sh));
  return sh;
}

function _linkProgram(gl, vert, frag) {
  const prog = gl.createProgram();
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error('[renderer] link: ' + gl.getProgramInfoLog(prog));
  return prog;
}

function _uniformLoc(gl, prog, name) {
  return gl.getUniformLocation(prog, name);
}

// ── Renderer factory ──────────────────────────────────────────────────────────
export function renderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) throw new Error('[renderer] WebGL2 not supported');

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // state cache — avoid redundant GL calls
  let _prog = null, _vao = null;

  // scratch matrices
  const _mvp   = m4.new(), _tmp = m4.new();
  let   _view  = m4.new(), _proj = m4.new();
  let   _lightDir   = v3.new(0.5, 1, 0.7);
  let   _lightColor = v3.new(1, 1, 1);
  let   _ambient    = v3.new(0.15, 0.15, 0.2);
  v3.normalize(_lightDir, _lightDir);

  // ── Built-in programs ───────────────────────────────────────────────────────
  function _makeProgram(vSrc, fSrc) {
    const v = _compileShader(gl, gl.VERTEX_SHADER, vSrc);
    const f = _compileShader(gl, gl.FRAGMENT_SHADER, fSrc);
    const p = _linkProgram(gl, v, f);
    gl.deleteShader(v); gl.deleteShader(f);
    // cache uniform locations
    const locs = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      locs[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { prog: p, locs };
  }

  const _defaultProg = _makeProgram(VERT_DEFAULT, FRAG_DEFAULT);
  const _unlitProg   = _makeProgram(VERT_DEFAULT, FRAG_UNLIT);

  // ── Public API ──────────────────────────────────────────────────────────────
  const r = {
    gl,

    // compile custom shader pair → program handle
    shader(vertSrc, fragSrc) { return _makeProgram(vertSrc, fragSrc); },

    // upload geometry → VAO handle
    // positions: Float32Array (xyz,xyz…)
    // normals:   Float32Array or null
    // uvs:       Float32Array or null
    // indices:   Uint16Array  or null (if null → drawArrays)
    geometry(positions, normals = null, uvs = null, indices = null) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      function _buf(data, loc, size) {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        return b;
      }

      _buf(positions, 0, 3);
      if (normals) _buf(normals, 1, 3);
      else { gl.disableVertexAttribArray(1); }
      if (uvs) _buf(uvs, 2, 2);
      else { gl.disableVertexAttribArray(2); }

      let ibo = null, indexCount = 0, vertCount = positions.length / 3;
      if (indices) {
        ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        indexCount = indices.length;
      }

      gl.bindVertexArray(null);

      return { vao, ibo, indexCount, vertCount, _update(data) {
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.bindVertexArray(null);
      }};
    },

    // upload texture → GL texture handle
    texture(img, { wrap = 'repeat', filter = 'nearest' } = {}) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      const wrapMode = wrap === 'clamp' ? gl.CLAMP_TO_EDGE : gl.REPEAT;
      const filterMode = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filterMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filterMode);
      gl.generateMipmap(gl.TEXTURE_2D);
      return tex;
    },

    // material: program + uniform values
    material(prog = null, uniforms = {}) {
      return { prog: prog ?? _defaultProg, uniforms: { ...uniforms } };
    },

    unlitMaterial(color = [1,1,1,1]) {
      return { prog: _unlitProg, uniforms: { u_albedo: color } };
    },

    // mesh: geometry + material
    mesh(geo, mat) { return { geo, mat }; },

    // ── Frame ─────────────────────────────────────────────────────────────────
    begin(clearColor = [0.05, 0.05, 0.1, 1]) {
      const w = canvas.width, h = canvas.height;
      gl.viewport(0, 0, w, h);
      gl.clearColor(...clearColor);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      _prog = null; _vao = null;
    },

    setCamera(viewMat, projMat) {
      m4.copy(_view, viewMat);
      m4.copy(_proj, projMat);
    },

    setLight({ dir, color, ambient } = {}) {
      if (dir)     v3.normalize(_lightDir, dir);
      if (color)   v3.copy(_lightColor, color);
      if (ambient) v3.copy(_ambient, ambient);
    },

    draw(mesh, modelMat) {
      const { geo, mat } = mesh;
      const p = mat.prog;

      // bind program (cached)
      if (_prog !== p.prog) {
        gl.useProgram(p.prog);
        _prog = p.prog;
      }

      // bind VAO (cached)
      if (_vao !== geo.vao) {
        gl.bindVertexArray(geo.vao);
        _vao = geo.vao;
      }

      // compute MVP
      m4.mul(_tmp, _view, modelMat);
      m4.mul(_mvp, _proj, _tmp);

      const L = p.locs;
      if (L.u_mvp)    gl.uniformMatrix4fv(L.u_mvp, false, _mvp);
      if (L.u_model)  gl.uniformMatrix4fv(L.u_model, false, modelMat);
      if (L.u_lightDir)   gl.uniform3fv(L.u_lightDir, _lightDir);
      if (L.u_lightColor) gl.uniform3fv(L.u_lightColor, _lightColor);
      if (L.u_ambient)    gl.uniform3fv(L.u_ambient, _ambient);

      // per-material uniforms
      const u = mat.uniforms;
      if (L.u_albedo) gl.uniform4fv(L.u_albedo, u.u_albedo ?? [1,1,1,1]);
      if (L.u_useTex) {
        if (u.u_tex) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, u.u_tex);
          gl.uniform1i(L.u_tex, 0);
          gl.uniform1f(L.u_useTex, 1);
        } else {
          gl.uniform1f(L.u_useTex, 0);
        }
      }

      if (geo.ibo) {
        gl.drawElements(gl.TRIANGLES, geo.indexCount, gl.UNSIGNED_SHORT, 0);
      } else {
        gl.drawArrays(gl.TRIANGLES, 0, geo.vertCount);
      }
    },

    end() { /* future: blit post-process */ },

    get width()  { return canvas.width; },
    get height() { return canvas.height; },
  };

  return r;
}
