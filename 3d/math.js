// Minimal 3D math — flat Float32Array, no classes, no allocations in hot path.
// All ops write into a pre-allocated out parameter.
// Convention: column-major 4x4 matrices (matches WebGL).

// ── Vec3 ──────────────────────────────────────────────────────────────────────
export const v3 = {
  new(x=0,y=0,z=0)       { return new Float32Array([x,y,z]); },
  set(o,x,y,z)           { o[0]=x; o[1]=y; o[2]=z; return o; },
  copy(o,a)              { o[0]=a[0]; o[1]=a[1]; o[2]=a[2]; return o; },
  add(o,a,b)             { o[0]=a[0]+b[0]; o[1]=a[1]+b[1]; o[2]=a[2]+b[2]; return o; },
  sub(o,a,b)             { o[0]=a[0]-b[0]; o[1]=a[1]-b[1]; o[2]=a[2]-b[2]; return o; },
  scale(o,a,s)           { o[0]=a[0]*s; o[1]=a[1]*s; o[2]=a[2]*s; return o; },
  dot(a,b)               { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; },
  cross(o,a,b)           {
    const ax=a[0],ay=a[1],az=a[2], bx=b[0],by=b[1],bz=b[2];
    o[0]=ay*bz-az*by; o[1]=az*bx-ax*bz; o[2]=ax*by-ay*bx; return o;
  },
  len(a)                 { return Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]); },
  normalize(o,a)         {
    const l = Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);
    const il = l > 1e-10 ? 1/l : 0;
    o[0]=a[0]*il; o[1]=a[1]*il; o[2]=a[2]*il; return o;
  },
  lerp(o,a,b,t)          {
    o[0]=a[0]+(b[0]-a[0])*t; o[1]=a[1]+(b[1]-a[1])*t; o[2]=a[2]+(b[2]-a[2])*t; return o;
  },
  negate(o,a)            { o[0]=-a[0]; o[1]=-a[1]; o[2]=-a[2]; return o; },
};

// ── Vec4 ──────────────────────────────────────────────────────────────────────
export const v4 = {
  new(x=0,y=0,z=0,w=1)  { return new Float32Array([x,y,z,w]); },
  set(o,x,y,z,w)        { o[0]=x; o[1]=y; o[2]=z; o[3]=w; return o; },
};

// ── Mat4 (column-major) ───────────────────────────────────────────────────────
export const m4 = {
  new()  { return new Float32Array(16); },
  identity(o) {
    o.fill(0);
    o[0]=o[5]=o[10]=o[15]=1;
    return o;
  },
  copy(o,a) { o.set(a); return o; },

  mul(o, a, b) {
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3];
    const a10=a[4],a11=a[5],a12=a[6],a13=a[7];
    const a20=a[8],a21=a[9],a22=a[10],a23=a[11];
    const a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    for (let i = 0; i < 4; i++) {
      const b0=b[i*4],b1=b[i*4+1],b2=b[i*4+2],b3=b[i*4+3];
      o[i*4]   = a00*b0 + a10*b1 + a20*b2 + a30*b3;
      o[i*4+1] = a01*b0 + a11*b1 + a21*b2 + a31*b3;
      o[i*4+2] = a02*b0 + a12*b1 + a22*b2 + a32*b3;
      o[i*4+3] = a03*b0 + a13*b1 + a23*b2 + a33*b3;
    }
    return o;
  },

  // transform vec3 (w=1, perspective divide)
  transformV3(o, m, v) {
    const x=v[0], y=v[1], z=v[2];
    const w = m[3]*x + m[7]*y + m[11]*z + m[15];
    const iw = w !== 0 ? 1/w : 0;
    o[0] = (m[0]*x + m[4]*y + m[8]*z  + m[12]) * iw;
    o[1] = (m[1]*x + m[5]*y + m[9]*z  + m[13]) * iw;
    o[2] = (m[2]*x + m[6]*y + m[10]*z + m[14]) * iw;
    return o;
  },

  // transform direction (w=0, no translation)
  transformDir(o, m, v) {
    const x=v[0], y=v[1], z=v[2];
    o[0] = m[0]*x + m[4]*y + m[8]*z;
    o[1] = m[1]*x + m[5]*y + m[9]*z;
    o[2] = m[2]*x + m[6]*y + m[10]*z;
    return o;
  },

  perspective(o, fovY, aspect, near, far) {
    const f  = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    o.fill(0);
    o[0]  = f / aspect;
    o[5]  = f;
    o[10] = (far + near) * nf;
    o[11] = -1;
    o[14] = 2 * far * near * nf;
    return o;
  },

  lookAt(o, eye, center, up) {
    const f = v3.new(), s = v3.new(), u = v3.new(), t = v3.new();
    v3.normalize(f, v3.sub(t, center, eye));   // forward
    v3.normalize(s, v3.cross(t, f, up));        // right
    v3.cross(u, s, f);                          // up (reorthogonalized)

    o[0]=s[0]; o[1]=u[0]; o[2]=-f[0]; o[3]=0;
    o[4]=s[1]; o[5]=u[1]; o[6]=-f[1]; o[7]=0;
    o[8]=s[2]; o[9]=u[2]; o[10]=-f[2]; o[11]=0;
    o[12]=-v3.dot(s,eye); o[13]=-v3.dot(u,eye); o[14]=v3.dot(f,eye); o[15]=1;
    return o;
  },

  translation(o, x, y, z) {
    m4.identity(o);
    o[12]=x; o[13]=y; o[14]=z;
    return o;
  },

  scale(o, x, y, z) {
    m4.identity(o);
    o[0]=x; o[5]=y; o[10]=z;
    return o;
  },

  rotX(o, a) {
    const c=Math.cos(a), s=Math.sin(a);
    m4.identity(o);
    o[5]=c; o[6]=s; o[9]=-s; o[10]=c;
    return o;
  },

  rotY(o, a) {
    const c=Math.cos(a), s=Math.sin(a);
    m4.identity(o);
    o[0]=c; o[2]=-s; o[8]=s; o[10]=c;
    return o;
  },

  rotZ(o, a) {
    const c=Math.cos(a), s=Math.sin(a);
    m4.identity(o);
    o[0]=c; o[1]=s; o[4]=-s; o[5]=c;
    return o;
  },

  invert(o, a) {
    // cofactor expansion — exact for affine matrices
    const m = a;
    const b00=m[0]*m[5]-m[1]*m[4], b01=m[0]*m[6]-m[2]*m[4];
    const b02=m[0]*m[7]-m[3]*m[4], b03=m[1]*m[6]-m[2]*m[5];
    const b04=m[1]*m[7]-m[3]*m[5], b05=m[2]*m[7]-m[3]*m[6];
    const b06=m[8]*m[13]-m[9]*m[12], b07=m[8]*m[14]-m[10]*m[12];
    const b08=m[8]*m[15]-m[11]*m[12], b09=m[9]*m[14]-m[10]*m[13];
    const b10=m[9]*m[15]-m[11]*m[13], b11=m[10]*m[15]-m[11]*m[14];
    const det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (Math.abs(det) < 1e-15) { m4.identity(o); return o; }
    const id = 1/det;
    o[0]=(m[5]*b11-m[6]*b10+m[7]*b09)*id;   o[1]=(m[2]*b10-m[1]*b11-m[3]*b09)*id;
    o[2]=(m[13]*b05-m[14]*b04+m[15]*b03)*id; o[3]=(m[10]*b04-m[9]*b05-m[11]*b03)*id;
    o[4]=(m[6]*b08-m[4]*b11-m[7]*b07)*id;   o[5]=(m[0]*b11-m[2]*b08+m[3]*b07)*id;
    o[6]=(m[14]*b02-m[12]*b05-m[15]*b01)*id; o[7]=(m[8]*b05-m[10]*b02+m[11]*b01)*id;
    o[8]=(m[4]*b10-m[5]*b08+m[7]*b06)*id;   o[9]=(m[1]*b08-m[0]*b10-m[3]*b06)*id;
    o[10]=(m[12]*b04-m[13]*b02+m[15]*b00)*id; o[11]=(m[9]*b02-m[8]*b04-m[11]*b00)*id;
    o[12]=(m[5]*b07-m[4]*b09-m[6]*b06)*id;  o[13]=(m[0]*b09-m[1]*b07+m[2]*b06)*id;
    o[14]=(m[13]*b01-m[12]*b03-m[14]*b00)*id; o[15]=(m[8]*b03-m[9]*b01+m[10]*b00)*id;
    return o;
  },

  transpose(o, a) {
    const t = (i,j) => a[j*4+i];
    for (let i=0;i<4;i++) for (let j=0;j<4;j++) o[i*4+j]=t(i,j);
    return o;
  },
};

// ── Quaternion ────────────────────────────────────────────────────────────────
export const quat = {
  new()           { return new Float32Array([0,0,0,1]); },
  identity(q)     { q[0]=q[1]=q[2]=0; q[3]=1; return q; },
  fromAxisAngle(q, axis, a) {
    const s = Math.sin(a/2);
    q[0]=axis[0]*s; q[1]=axis[1]*s; q[2]=axis[2]*s; q[3]=Math.cos(a/2);
    return q;
  },
  mul(o, a, b) {
    const ax=a[0],ay=a[1],az=a[2],aw=a[3];
    const bx=b[0],by=b[1],bz=b[2],bw=b[3];
    o[0]=ax*bw+aw*bx+ay*bz-az*by;
    o[1]=ay*bw+aw*by+az*bx-ax*bz;
    o[2]=az*bw+aw*bz+ax*by-ay*bx;
    o[3]=aw*bw-ax*bx-ay*by-az*bz;
    return o;
  },
  toMat4(o, q) {
    const x=q[0],y=q[1],z=q[2],w=q[3];
    const x2=x+x, y2=y+y, z2=z+z;
    const xx=x*x2, xy=x*y2, xz=x*z2;
    const yy=y*y2, yz=y*z2, zz=z*z2;
    const wx=w*x2, wy=w*y2, wz=w*z2;
    o[0]=1-(yy+zz); o[1]=xy+wz;     o[2]=xz-wy;     o[3]=0;
    o[4]=xy-wz;     o[5]=1-(xx+zz); o[6]=yz+wx;     o[7]=0;
    o[8]=xz+wy;     o[9]=yz-wx;     o[10]=1-(xx+yy); o[11]=0;
    o[12]=0;        o[13]=0;         o[14]=0;          o[15]=1;
    return o;
  },
  slerp(o, a, b, t) {
    let dot = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];
    // take short path
    const bx = dot<0 ? -b[0] : b[0], by = dot<0 ? -b[1] : b[1];
    const bz = dot<0 ? -b[2] : b[2], bw = dot<0 ? -b[3] : b[3];
    dot = Math.abs(dot);
    let s0, s1;
    if (dot > 0.9995) { s0 = 1-t; s1 = t; }
    else { const a2=Math.acos(dot), si=1/Math.sin(a2); s0=Math.sin((1-t)*a2)*si; s1=Math.sin(t*a2)*si; }
    o[0]=s0*a[0]+s1*bx; o[1]=s0*a[1]+s1*by; o[2]=s0*a[2]+s1*bz; o[3]=s0*a[3]+s1*bw;
    return o;
  },
  normalize(o, q) {
    const l = Math.sqrt(q[0]*q[0]+q[1]*q[1]+q[2]*q[2]+q[3]*q[3]);
    const il = l > 1e-10 ? 1/l : 0;
    o[0]=q[0]*il; o[1]=q[1]*il; o[2]=q[2]*il; o[3]=q[3]*il; return o;
  },
};

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
