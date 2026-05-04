// Procedural geometry generators → {positions, normals, uvs, indices}
// All return Float32Array/Uint16Array ready for renderer.geometry()

function _pack(verts, faces) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const [p, n, t] of verts) { pos.push(...p); nor.push(...n); uv.push(...t); }
  for (const f of faces) idx.push(...f);
  return {
    positions: new Float32Array(pos),
    normals:   new Float32Array(nor),
    uvs:       new Float32Array(uv),
    indices:   new Uint16Array(idx),
  };
}

// ── Box ───────────────────────────────────────────────────────────────────────
export function box(w = 1, h = 1, d = 1) {
  const hw=w/2, hh=h/2, hd=d/2;
  const faces6 = [
    // +X
    { n:[1,0,0],  verts:[[hw,-hh,-hd],[hw,hh,-hd],[hw,hh,hd],[hw,-hh,hd] ],
      uv:[[0,0],[1,0],[1,1],[0,1]] },
    // -X
    { n:[-1,0,0], verts:[[-hw,-hh,hd],[-hw,hh,hd],[-hw,hh,-hd],[-hw,-hh,-hd]],
      uv:[[0,0],[1,0],[1,1],[0,1]] },
    // +Y
    { n:[0,1,0],  verts:[[-hw,hh,-hd],[hw,hh,-hd],[hw,hh,hd],[-hw,hh,hd] ],
      uv:[[0,0],[1,0],[1,1],[0,1]] },
    // -Y
    { n:[0,-1,0], verts:[[-hw,-hh,hd],[hw,-hh,hd],[hw,-hh,-hd],[-hw,-hh,-hd]],
      uv:[[0,0],[1,0],[1,1],[0,1]] },
    // +Z
    { n:[0,0,1],  verts:[[-hw,-hh,hd],[hw,-hh,hd],[hw,hh,hd],[-hw,hh,hd] ],
      uv:[[0,0],[1,0],[1,1],[0,1]] },
    // -Z
    { n:[0,0,-1], verts:[[hw,-hh,-hd],[-hw,-hh,-hd],[-hw,hh,-hd],[hw,hh,-hd]],
      uv:[[0,0],[1,0],[1,1],[0,1]] },
  ];

  const pos=[], nor=[], uv=[], idx=[];
  let base = 0;
  for (const f of faces6) {
    for (let i = 0; i < 4; i++) {
      pos.push(...f.verts[i]);
      nor.push(...f.n);
      uv.push(...f.uv[i]);
    }
    idx.push(base,base+1,base+2, base,base+2,base+3);
    base += 4;
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor),
           uvs: new Float32Array(uv), indices: new Uint16Array(idx) };
}

// ── Sphere ────────────────────────────────────────────────────────────────────
export function sphere(radius = 1, segW = 16, segH = 12) {
  const pos=[], nor=[], uv=[], idx=[];
  for (let r = 0; r <= segH; r++) {
    const phi = r / segH * Math.PI;
    for (let c = 0; c <= segW; c++) {
      const theta = c / segW * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      pos.push(x*radius, y*radius, z*radius);
      nor.push(x, y, z);
      uv.push(c/segW, r/segH);
    }
  }
  for (let r = 0; r < segH; r++) {
    for (let c = 0; c < segW; c++) {
      const a = r*(segW+1)+c, b=a+1, c2=a+(segW+1), d=c2+1;
      idx.push(a,b,c2, b,d,c2);
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor),
           uvs: new Float32Array(uv), indices: new Uint16Array(idx) };
}

// ── Plane (XZ) ───────────────────────────────────────────────────────────────
export function plane(w = 1, d = 1, tilesW = 1, tilesD = 1) {
  const pos=[], nor=[], uv=[], idx=[];
  for (let r = 0; r <= tilesD; r++) {
    for (let c = 0; c <= tilesW; c++) {
      const x = (c/tilesW - 0.5) * w;
      const z = (r/tilesD - 0.5) * d;
      pos.push(x, 0, z);
      nor.push(0, 1, 0);
      uv.push(c, r);
    }
  }
  for (let r = 0; r < tilesD; r++) {
    for (let c = 0; c < tilesW; c++) {
      const a = r*(tilesW+1)+c;
      idx.push(a, a+tilesW+1, a+1, a+1, a+tilesW+1, a+tilesW+2);
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor),
           uvs: new Float32Array(uv), indices: new Uint16Array(idx) };
}

// ── Cylinder ─────────────────────────────────────────────────────────────────
export function cylinder(r = 0.5, h = 1, segs = 16, caps = true) {
  const pos=[], nor=[], uv=[], idx=[];
  const hh = h/2;
  // sides
  for (let i = 0; i <= segs; i++) {
    const a = i/segs * Math.PI*2;
    const x = Math.cos(a), z = Math.sin(a);
    pos.push(x*r, -hh, z*r);  nor.push(x,0,z);  uv.push(i/segs, 0);
    pos.push(x*r,  hh, z*r);  nor.push(x,0,z);  uv.push(i/segs, 1);
  }
  for (let i = 0; i < segs; i++) {
    const b = i*2;
    idx.push(b,b+1,b+2, b+1,b+3,b+2);
  }
  if (caps) {
    // bottom cap
    const bBase = pos.length/3;
    pos.push(0,-hh,0); nor.push(0,-1,0); uv.push(0.5,0.5);
    for (let i = 0; i <= segs; i++) {
      const a = i/segs*Math.PI*2;
      pos.push(Math.cos(a)*r,-hh,Math.sin(a)*r); nor.push(0,-1,0); uv.push(0.5+Math.cos(a)*0.5, 0.5+Math.sin(a)*0.5);
    }
    for (let i = 0; i < segs; i++) idx.push(bBase, bBase+i+2, bBase+i+1);
    // top cap
    const tBase = pos.length/3;
    pos.push(0,hh,0); nor.push(0,1,0); uv.push(0.5,0.5);
    for (let i = 0; i <= segs; i++) {
      const a = i/segs*Math.PI*2;
      pos.push(Math.cos(a)*r,hh,Math.sin(a)*r); nor.push(0,1,0); uv.push(0.5+Math.cos(a)*0.5, 0.5+Math.sin(a)*0.5);
    }
    for (let i = 0; i < segs; i++) idx.push(tBase, tBase+i+1, tBase+i+2);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor),
           uvs: new Float32Array(uv), indices: new Uint16Array(idx) };
}
