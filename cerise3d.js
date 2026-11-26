// Cerise 3D — a tiny self-contained WebGL engine + a procedurally built model of Cerise.
// No libraries, works offline. Patterns are computed per pixel, so they stay sharp at any zoom.
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  // ---------- colors ----------
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const C = {
    skin: hex('#fbe4ea'), skinShade: hex('#f2c9d4'),
    pale: hex('#f7dbe3'), pale2: hex('#efc4d1'), crim: hex('#c8123f'), crim2: hex('#a00d33'),
    dark: hex('#25060f'), wine: hex('#5a0a22'), cream: hex('#f8eaee'), cream2: hex('#ead2da'),
    red: hex('#e0204e'), gem: hex('#ff2a55'), boot: hex('#2b0712'), petal: hex('#ffe3d6'), petalC: hex('#ff8fb0'), white: hex('#fff6f8')
  };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // ---------- mesh building ----------
  // material ids: 0 solid, 1 harlequin, 2 stripes, 3 face
  function Mesh() { return { p: [], n: [], u: [], c: [], s: [], i: [] }; }
  const groups = { 0: Mesh(), 1: Mesh(), 2: Mesh(), 3: Mesh() };
  function push(mat, m) {
    const g = groups[mat]; const off = g.p.length / 3;
    g.p.push(...m.p); g.u.push(...m.u); g.c.push(...m.c); g.s.push(...m.s);
    for (let k = 0; k < m.i.length; k++) g.i.push(m.i[k] + off);
    const n = computeNormals(m); g.n.push(...n);
  }
  function computeNormals(m) {
    const n = new Float32Array(m.p.length);
    for (let k = 0; k < m.i.length; k += 3) {
      const a = m.i[k] * 3, b = m.i[k + 1] * 3, c = m.i[k + 2] * 3;
      const ux = m.p[b] - m.p[a], uy = m.p[b + 1] - m.p[a + 1], uz = m.p[b + 2] - m.p[a + 2];
      const vx = m.p[c] - m.p[a], vy = m.p[c + 1] - m.p[a + 1], vz = m.p[c + 2] - m.p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const q of [a, b, c]) { n[q] += nx; n[q + 1] += ny; n[q + 2] += nz; }
    }
    for (let k = 0; k < n.length; k += 3) { const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1; n[k] /= l; n[k + 1] /= l; n[k + 2] /= l; }
    return Array.from(n);
  }
  function grid(rows, cols, f) { // f(i,j) -> {p:[x,y,z], u:[u,v], c:[r,g,b], s}
    const m = Mesh();
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) { const v = f(i, j); m.p.push(...v.p); m.u.push(...v.u); m.c.push(...v.c); m.s.push(v.s || 0); }
    const W = cols + 1;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * W + j, b = a + 1, c = a + W, d = c + 1; m.i.push(a, c, b, b, c, d); }
    return m;
  }
  // surface of revolution. prof: [[r,y],...] top -> bottom
  function lathe(prof, o = {}) {
    const seg = o.seg || 48, t0 = o.t0 || 0, t1 = o.t1 == null ? TAU : o.t1;
    const cx = o.cx || 0, cz = o.cz || 0, sx = o.sx || 1, sz = o.sz || 1;
    return grid(prof.length - 1, seg, (i, j) => {
      const th = t0 + (t1 - t0) * j / seg; let [r, y] = prof[i];
      const rf = o.ruffle ? o.ruffle(i, th, y) : 0; r *= 1 + rf;
      const yy = y + (o.wave ? o.wave(i, th) : 0);
      const x = cx + Math.sin(th) * r * sx, z = cz + Math.cos(th) * r * sz;
      return { p: [x, yy, z], u: [(th / TAU) * (o.ur || 1), y * (o.vr || 1)], c: o.color ? o.color(th, y, i) : C.white, s: o.sway ? o.sway(y, th) : 0 };
    });
  }
  function ellipsoid(c, r, o = {}) {
    const rows = o.rows || 18, seg = o.seg || 24;
    return grid(rows, seg, (i, j) => {
      const ph = Math.PI * i / rows, th = TAU * j / seg;
      let x = Math.sin(ph) * Math.sin(th) * r[0], y = Math.cos(ph) * r[1], z = Math.sin(ph) * Math.cos(th) * r[2];
      if (o.deform) [x, y, z] = o.deform(x, y, z);
      const P = o.rot ? rot(o.rot, [x, y, z]) : [x, y, z];
      const w = [c[0] + P[0], c[1] + P[1], c[2] + P[2]];
      return { p: w, u: o.uv ? o.uv(w, x, y, z) : [th / TAU * (o.ur || 1), ph / Math.PI * (o.vr || 1)], c: o.color ? o.color(w) : C.white, s: o.sway ? o.sway(w) : 0 };
    });
  }
  function rot(e, v) { // euler xyz
    let [x, y, z] = v; const [a, b, c] = e;
    let t = y * Math.cos(a) - z * Math.sin(a); z = y * Math.sin(a) + z * Math.cos(a); y = t;
    t = x * Math.cos(b) + z * Math.sin(b); z = -x * Math.sin(b) + z * Math.cos(b); x = t;
    t = x * Math.cos(c) - y * Math.sin(c); y = x * Math.sin(c) + y * Math.cos(c); x = t;
    return [x, y, z];
  }
  // tube along points with radius function
  function tube(pts, rad, o = {}) {
    const sides = o.sides || 7, n = pts.length;
    const T = [], N = [], B = [];
    for (let k = 0; k < n; k++) { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)]; T.push(norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]])); }
    let nn = norm(cross(T[0], Math.abs(T[0][1]) < .9 ? [0, 1, 0] : [1, 0, 0]));
    for (let k = 0; k < n; k++) { if (k) { const bb = cross(T[k - 1], T[k]); const l = Math.hypot(...bb); if (l > 1e-6) { const ax = bb.map(q => q / l); const ang = Math.acos(Math.max(-1, Math.min(1, dot(T[k - 1], T[k])))); nn = rotAxis(nn, ax, ang); } } N.push(nn); B.push(cross(T[k], nn)); }
    return grid(n - 1, sides, (i, j) => {
      const th = TAU * j / sides, r = rad(i / (n - 1)), fl = o.flat || 1;
      const off = [N[i][0] * Math.cos(th) * r + B[i][0] * Math.sin(th) * r * fl, N[i][1] * Math.cos(th) * r + B[i][1] * Math.sin(th) * r * fl, N[i][2] * Math.cos(th) * r + B[i][2] * Math.sin(th) * r * fl];
      const p = [pts[i][0] + off[0], pts[i][1] + off[1], pts[i][2] + off[2]];
      return { p, u: [j / sides * (o.ur || 1), i / (n - 1) * (o.vr || 1)], c: o.color ? o.color(i / (n - 1), p) : C.white, s: o.sway ? o.sway(p, i / (n - 1)) : 0 };
    });
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function rotAxis(v, k, a) { const c = Math.cos(a), s = Math.sin(a), d = dot(k, v), x = cross(k, v); return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]; }
  // seeded random so she's identical every time
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // ---------- the model ----------
  const HC = [0, 6.55, 0]; // head center
  const hairCol = (x, v = 0) => x < 0 ? mix(C.pale, C.pale2, v) : mix(C.crim, C.crim2, v);
  const hairSway = (p) => Math.max(0, Math.min(1, (6.45 - p[1]) / 3.2));
  function flower(c, s, face) { // 5 petals, facing direction given by euler 'face'
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5;
      push(0, transformInto(ellipsoid([0, 0, 0], [s * .38, s * .62, s * .14], { rows: 6, seg: 8, deform: (x, y, z) => rot([0, 0, a], [x, y + s * .55, z]), color: () => C.petal }), c, face));
    }
    push(0, transformInto(ellipsoid([0, 0, s * .05], [s * .22, s * .22, s * .12], { rows: 6, seg: 8, color: () => C.petalC }), c, face));
  }
  function transformInto(m, c, e) { for (let k = 0; k < m.p.length; k += 3) { const r = rot(e, [m.p[k], m.p[k + 1], m.p[k + 2]]); m.p[k] = r[0] + c[0]; m.p[k + 1] = r[1] + c[1]; m.p[k + 2] = r[2] + c[2]; } return m; }
  function bow(c, size, e, mat = 1, col = C.crim) {
    const loop = (side) => transformInto(ellipsoid([0, 0, 0], [size * .55, size * .36, size * .16], { rows: 10, seg: 14, deform: (x, y, z) => [x + side * size * .5, y + Math.abs(x) * .25 * (y > 0 ? 1 : -1), z - Math.abs(x) * .3], color: () => col, ur: 3, vr: 3 }), c, e);
    push(mat, loop(1)); push(mat, loop(-1));
    push(mat, transformInto(ellipsoid([0, 0, size * .05], [size * .2, size * .24, size * .18], { rows: 8, seg: 10, color: () => col }), c, e));
    for (const side of [-1, 1]) { // tails
      const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([side * (size * .12 + t * size * .35), -t * size * 1.1, Math.sin(t * 3) * size * .08]); }
      push(mat, transformInto(tube(pts, (t) => size * (.14 - t * .05), { sides: 6, flat: .25, color: () => col }), c, e));
    }
  }

  function build() {
    seed = 7;
    // --- head (anime: tapered chin) ---
    push(3, ellipsoid(HC, [0.4, 0.47, 0.41], {
      rows: 36, seg: 48,
      deform: (x, y, z) => { if (y < 0) { const t = Math.min(1, -y / 0.47); const k = 1 - 0.5 * Math.pow(t, 1.6); x *= k; z *= (1 - 0.25 * t); y *= 0.86; } return [x, y, z]; },
      uv: (w, x, y, z) => z > 0.05 ? [(w[0] + 0.36) / 0.72, (6.655 - w[1]) / 0.452] : [0.01, 0.01],
      color: () => C.skin
    }));
    // neck
    push(0, lathe([[0.1, 6.24], [0.095, 6.08], [0.12, 5.92]], { seg: 20, color: () => C.skinShade }));
    // --- hair: scalp cap ---
    push(0, ellipsoid([0, 6.62, -0.03], [0.445, 0.47, 0.455], { rows: 22, seg: 40, deform: (x, y, z) => { if (y < -0.05 && z > 0.12) { y = -0.05 + (y + .05) * .2; } return [x, Math.max(y, z > .1 ? -0.02 : -0.32), z]; }, color: (w) => hairCol(w[0], .15), sway: () => 0 }));
    // bangs: tapered strands over forehead
    for (let k = 0; k < 19; k++) {
      const t = k / 18, x0 = -0.36 + t * 0.72;
      const len = 0.26 + (k % 3 === 0 ? 0.12 : k % 3 === 1 ? 0.03 : 0.07) + (Math.abs(x0 - 0.02) < 0.06 ? 0.12 : 0) + Math.abs(x0) * 0.38; // longer at the sides, a few strands between the eyes
      const pts = []; for (let q = 0; q <= 10; q++) { const s = q / 10; const y = 7.02 - s * len - (1 - Math.cos(s * 1.2)) * 0.02; const zz = 0.2 + Math.sin(s * 1.5) * 0.24; pts.push([x0 * (0.8 + s * 0.25) + Math.sin(k * 1.7) * s * 0.05, y, zz * Math.cos(x0 * 1.5) + .03]); }
      push(0, tube(pts, (s) => 0.085 * Math.pow(1 - s, 1.3) + 0.003, { sides: 6, flat: 0.45, color: () => hairCol(x0 + 0.001, rnd() * .5), sway: () => 0.04 }));
    }
    // side locks framing the face (in front of shoulders)
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
      const pts = []; const x0 = side * (0.38 + k * .04), z0 = 0.16 - k * .08;
      for (let q = 0; q <= 40; q++) { const s = q / 40; const y = 6.75 - s * (1.75 - k * .2); const curl = s > .25 ? (s - .25) * 0.16 : 0; pts.push([x0 + side * (s * .32 + Math.sin(s * 22 + k) * curl), y, z0 + .15 * s + Math.cos(s * 22 + k) * curl]); }
      push(0, tube(pts, (s) => 0.075 * (1 - s * .7), { sides: 7, color: (s) => hairCol(side, rnd() * .5), sway: (p) => hairSway(p) }));
    }
    // hair volume: a wide wavy mass behind her (so the curls never look see-through)
    push(0, lathe([[0.44, 6.95], [0.5, 6.5], [0.62, 5.9], [0.8, 5.2], [0.98, 4.4], [1.1, 3.6], [1.08, 2.9], [0.98, 2.55]], {
      seg: 96, t0: 1.25, t1: TAU - 1.25, cz: -0.12, sz: 0.72,
      ruffle: (i, th, y) => i ? 0.07 * Math.sin(th * 20 + y * 5) * Math.min(1, i / 2) : 0,
      wave: (i, th) => i === 7 ? -0.35 * Math.abs(Math.sin(th * 7)) : 0,
      color: (th, y) => { const x = Math.sin(th); const v = .25 + .25 * Math.sin(th * 20 + y * 5); return x < 0 ? mix(C.pale, C.pale2, v) : mix(C.crim, C.crim2, v); },
      sway: (y) => Math.max(0, Math.min(1, (6.45 - y) / 3.2))
    }));
    // long voluminous curly back hair (to the knees)
    const N = 46;
    for (let k = 0; k < N; k++) {
      const a = -1.75 + 3.5 * (k / (N - 1)) + (rnd() - .5) * .08; // angle around back: 0 = straight back
      const sx = Math.sin(a), sz = -Math.cos(a);
      const start = [sx * 0.42, 6.75 - Math.abs(sx) * .25, sz * 0.42 - .02];
      const len = 3.7 - Math.abs(sx) * 0.9 + rnd() * .5;
      const spread = 0.55 + Math.abs(sx) * 0.45 + rnd() * .25;
      const pts = [], freq = 15 + rnd() * 8, ph = rnd() * TAU;
      for (let q = 0; q <= 70; q++) {
        const s = q / 70; const y = start[1] - s * len;
        const out = Math.min(1, s * 2.2); const rr = spread * Math.pow(out, .7);
        const cx = start[0] + sx * rr * 1.1 + sx * .05, cz = start[2] + sz * rr * .75 - .05 * s;
        const curl = s < .12 ? 0 : (0.05 + s * 0.11);
        // helix around the strand's downward path
        pts.push([cx + Math.cos(s * freq + ph) * curl, y, cz + Math.sin(s * freq + ph) * curl]);
      }
      const v = rnd();
      push(0, tube(pts, (s) => 0.11 * (1 - s * .5), { sides: 8, color: () => hairCol(sx < -0.02 ? -1 : sx > 0.02 ? 1 : (k % 2 ? 1 : -1), v * .6), sway: (p) => hairSway(p) }));
    }
    // --- headpiece: ruffled cream headband ---
    { const pts = []; for (let q = 0; q <= 40; q++) { const t = q / 40, a = -1.45 + t * 2.9; pts.push([Math.sin(a) * 0.47, 6.83 + Math.cos(a) * 0.2, Math.cos(a) * 0.3 - .02]); }
      push(0, tube(pts, (t) => 0.055 + 0.025 * (0.5 + 0.5 * Math.sin(t * 70)), { sides: 10, color: () => C.cream })); }
    // big harlequin bow on her right (viewer left) + tassels
    bow([-0.4, 7.0, -0.05], 0.42, [0.2, -0.9, 0.35], 1, C.crim);
    for (let k = 0; k < 2; k++) { const pts = []; for (let q = 0; q <= 12; q++) { const s = q / 12; pts.push([-0.5 - k * .06, 6.78 - s * .75, 0.08 + k * .04]); } push(0, tube(pts, (s) => s > .8 ? .05 : .018, { sides: 6, color: (s) => s > .8 ? C.crim : C.wine, sway: () => .4 })); }
    // flower hair clip on her left (viewer right)
    flower([0.33, 6.92, 0.3], 0.2, [-.5, .6, 0]);
    // flower earrings
    for (const side of [-1, 1]) flower([side * 0.43, 6.18, 0.05], 0.09, [0, side * 1.2, 0]);
    // --- choker + gem ---
    push(0, tube(Array.from({ length: 33 }, (_, q) => { const a = q / 32 * TAU; return [Math.sin(a) * .108, 6.11, Math.cos(a) * .108]; }), () => 0.036, { sides: 8, color: () => C.dark }));
    push(0, ellipsoid([0, 6.11, 0.15], [0.045, 0.045, 0.03], { rows: 8, seg: 10, color: () => C.gem }));
    // --- jabot / ruffled collar capelet ---
    push(0, lathe([[0.15, 6.0], [0.3, 5.82], [0.5, 5.6], [0.6, 5.45]], { seg: 96, sz: .85, ruffle: (i, th) => i >= 2 ? 0.13 * Math.sin(th * 14) * (i / 3) : 0, color: (th, y) => mix(C.cream, C.cream2, (6 - y) * 0.8) }));
    for (let k = 0; k < 3; k++) push(0, lathe([[0.04, 5.85 - k * .17], [0.17, 5.72 - k * .17], [0.22, 5.62 - k * .17]], { seg: 40, cz: 0.36 - k * .02, sz: .5, ruffle: (i, th) => i ? .2 * Math.sin(th * 9) : 0, color: () => C.cream }));
    // --- bodice (black corset) ---
    const bod = [[0.4, 5.72], [0.43, 5.5], [0.45, 5.3], [0.4, 5.05], [0.33, 4.8], [0.31, 4.6]];
    push(0, lathe(bod, { seg: 48, sz: .78, color: (th) => Math.abs(Math.sin(th * 4)) > .92 ? C.wine : C.dark }));
    for (let k = 0; k < 4; k++) push(0, ellipsoid([0, 5.3 - k * .2, 0.36 - k * .03 + (k === 0 ? .02 : 0)], [0.045, 0.045, 0.03], { rows: 8, seg: 10, color: () => C.red }));
    // waist bow
    push(1, lathe([[0.32, 4.68], [0.33, 4.58]], { seg: 40, sz: .8, color: () => C.crim, ur: 8, vr: 4 }));
    bow([0, 4.63, 0.3], 0.22, [0, 0, 0], 1, C.crim);
    // --- arms with puffy harlequin sleeves ---
    for (const side of [-1, 1]) {
      const sh = [side * 0.5, 5.62, -0.02];
      push(1, ellipsoid(sh, [0.27, 0.3, 0.27], { rows: 14, seg: 20, deform: (x, y, z) => [x * (1 + .12 * Math.sin(Math.atan2(z, x) * 8)), y, z], color: () => C.crim, ur: 6, vr: 4 }));
      push(1, ellipsoid([side * 0.6, 5.25, 0], [0.22, 0.24, 0.22], { rows: 12, seg: 18, color: () => C.crim, ur: 6, vr: 4 }));
      // forearm path: her right arm (viewer left) raised to chest like the art
      const pts = side < 0 ? [[-0.62, 5.15, 0.02], [-0.66, 4.9, 0.12], [-0.55, 4.95, 0.33], [-0.35, 5.25, 0.42], [-0.22, 5.5, 0.42]]
                           : [[0.64, 5.15, 0], [0.7, 4.8, 0.02], [0.72, 4.45, 0.08], [0.7, 4.15, 0.12]];
      push(0, tube(pts, (t) => 0.1 - t * 0.03, { sides: 10, color: () => C.dark }));
      const end = pts[pts.length - 1], prev = pts[pts.length - 2];
      const dir = norm([end[0] - prev[0], end[1] - prev[1], end[2] - prev[2]]);
      // cream frill cuff
      push(0, ellipsoid([end[0] - dir[0] * .02, end[1] - dir[1] * .02, end[2] - dir[2] * .02], [0.13, 0.08, 0.13], { rows: 8, seg: 20, deform: (x, y, z) => [x * (1 + .2 * Math.sin(Math.atan2(z, x) * 10)), y, z * (1 + .2 * Math.sin(Math.atan2(z, x) * 10))], color: () => C.cream }));
      // hand
      push(0, ellipsoid([end[0] + dir[0] * .1, end[1] + dir[1] * .1, end[2] + dir[2] * .1], [0.065, 0.1, 0.045], { rows: 10, seg: 12, color: () => C.skin }));
    }
    // --- skirt tiers (harlequin) with cream petticoat ruffles ---
    const tier = (mat, y0, y1, r0, r1, amp, freq, col, ur) => push(mat, lathe([[r0, y0], [(r0 + r1) / 2, (y0 + y1) / 2], [r1, y1]], { seg: 128, sz: .92, ruffle: (i, th) => (i / 2) * amp * Math.sin(th * freq), color: () => col, ur: ur || 24, vr: 3, sway: (y) => Math.max(0, (4.5 - y) * .25) }));
    tier(1, 4.62, 4.22, 0.33, 0.7, 0.06, 12, C.crim);
    tier(0, 4.3, 4.02, 0.55, 0.92, 0.07, 18, C.cream);
    tier(1, 4.2, 3.78, 0.66, 1.06, 0.08, 14, C.crim2);
    tier(0, 3.86, 3.6, 0.88, 1.14, 0.07, 22, C.cream);
    tier(1, 3.72, 3.42, 0.98, 1.2, 0.09, 16, C.crim);
    tier(0, 3.5, 3.33, 1.02, 1.2, 0.08, 26, C.white);
    // long jagged harlequin panels hanging at the sides/back
    for (let k = 0; k < 9; k++) {
      const c = 1.35 + k * (TAU - 2.7) / 8; // sides + back, front stays open
      const w = 0.3;
      push(1, lathe([[1.08, 3.85], [1.12, 3.35], [1.1, 2.85], [1.04, 2.35], [0.98, 2.0]], {
        seg: 10, t0: c - w, t1: c + w, sz: .92,
        ruffle: (i, th) => 0.08 * Math.sin((th - c) * 22 + i) * (i / 4 + .3),
        wave: (i, th) => i === 4 ? -0.3 * Math.abs(Math.sin((th - c) * 9)) : 0,
        color: () => k % 2 ? C.crim : C.crim2, ur: 40, vr: 3, sway: (y) => Math.max(0, (3.9 - y) * .45)
      }));
      // a dangling bead chain with a flower charm
      const a = c + .2, rr = 1.1;
      const pts = []; for (let q = 0; q <= 10; q++) { const s = q / 10; pts.push([Math.sin(a) * rr, 3.6 - s * 1.2, Math.cos(a) * rr * .92]); }
      push(0, tube(pts, () => 0.012, { sides: 4, color: () => C.petalC, sway: (p) => Math.max(0, (3.9 - p[1]) * .45) }));
      push(0, ellipsoid([Math.sin(a) * rr, 2.36, Math.cos(a) * rr * .92], [0.035, 0.07, 0.035], { rows: 6, seg: 8, color: () => C.red, sway: () => .55 }));
    }
    // --- legs ---
    for (const side of [-1, 1]) {
      const x = side * 0.19;
      const prof = [[0.2, 4.0], [0.19, 3.6], [0.155, 3.0], [0.115, 2.25], [0.12, 1.95], [0.1, 1.45], [0.08, 1.05]];
      push(side < 0 ? 2 : 1, lathe(prof, { seg: 40, cx: x, color: () => side < 0 ? C.crim : C.crim2, ur: side < 0 ? 1 : 6, vr: side < 0 ? 1 : 4 }));
      // thigh band + bow
      push(0, lathe([[0.215, 3.62], [0.215, 3.52]], { seg: 32, cx: x, color: () => C.crim }));
      bow([x + side * 0.08, 3.57, 0.16], 0.12, [0, side * .5, 0], 1, C.crim);
      // --- platform boots ---
      push(0, lathe([[0.12, 1.15], [0.15, 0.85], [0.17, 0.55], [0.19, 0.38]], { seg: 32, cx: x, cz: 0.03, color: () => C.boot }));
      push(0, lathe([[0.2, 0.4], [0.24, 0.33], [0.24, 0.05], [0.2, 0.0]], { seg: 32, cx: x, cz: 0.08, sz: 1.45, color: () => mix(C.boot, C.dark, .4) }));
      bow([x, 1.0, 0.15], 0.24, [0, 0, 0], 1, C.crim2);
      flower([x, 1.0, 0.24], 0.06, [0, 0, 0]);
      flower([x + side * .1, 0.55, 0.22], 0.05, [0, side * .6, 0]);
    }
    // --- ground shadow (drawn separately) ---
  }

  // ---------- renderer ----------
  const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec2 aU; attribute vec3 aC; attribute float aS;
uniform mat4 uPV; uniform float uT; uniform float uOut; uniform float uRot;
varying vec3 vN; varying vec2 vU; varying vec3 vC; varying vec3 vW;
vec3 anim(vec3 p){
  // breathing (torso), hair + skirt sway, gentle head motion
  float br = smoothstep(4.6,5.0,p.y)*(1.-smoothstep(5.8,6.05,p.y))*step(aS,.01);
  p.xz *= 1. + .012*sin(uT*1.6)*br;
  float sw = aS;
  p.x += sin(uT*1.25 + p.y*1.4)*.06*sw*sw + sin(uT*2.1 + p.y*3.)*.015*sw;
  p.z += cos(uT*1.05 + p.y*1.1)*.04*sw*sw;
  float head = smoothstep(5.95,6.3,p.y);
  p.x += sin(uT*.6)*.015*head; p.y += sin(uT*1.6)*.006;
  return p;}
void main(){
  vec3 p = anim(aP);
  vec3 n = aN;
  float c = cos(uRot), s = sin(uRot);
  p = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); n = vec3(c*n.x + s*n.z, n.y, -s*n.x + c*n.z);
  p += n*uOut;
  vN = n; vU = aU; vC = aC; vW = p;
  gl_Position = uPV*vec4(p,1.);
}`;
  const FS = `
precision highp float;
varying vec3 vN; varying vec2 vU; varying vec3 vC; varying vec3 vW;
uniform int uMat; uniform sampler2D uFace; uniform vec3 uEye; uniform float uLine; uniform vec3 uLineC;
float aa(float d, float w){ return smoothstep(-w, w, d); }
void main(){
  if(uLine > .5){ gl_FragColor = vec4(uLineC,1.); return; }
  vec3 base = vC;
  if(uMat == 1){ // harlequin diamonds, computed per pixel (sharp at any zoom)
    vec2 q = vU*vec2(1.,1.);
    vec2 f = abs(fract(q)-.5);
    float d = (f.x+f.y) - .5; float w = fwidthApprox(q);
    base = mix(vC, vec3(.13,.02,.06), aa(d, w));
  } else if(uMat == 2){ // vertical stripes
    float st = abs(fract(vU.x*14.)-.5) - .25; float w = .02;
    base = mix(vC, vec3(1.,.95,.97), aa(st, w));
  } else if(uMat == 3){
    base = texture2D(uFace, vU).rgb;
  }
  vec3 V = normalize(uEye - vW); vec3 N = normalize(vN); if(dot(N,V) < 0.) N = -N; vec3 L = normalize(vec3(.45,.75,.65));
  float d = dot(N,L);
  float tone = d > .35 ? 1. : d > -.1 ? .82 : .66;          // cel shading bands
  if(uMat == 3) tone = mix(1., tone, .35);                    // anime faces stay bright
  float rim = pow(1. - max(dot(N,V),0.), 3.)*.35;
  vec3 col = base*tone + rim*vec3(1.,.55,.7)*(.6+.4*base);
  float spec = pow(max(dot(reflect(-L,N),V),0.), 40.) * .12;
  float e = abs(dot(N,V));
  col *= mix(.55, 1., smoothstep(.02, .22, e));            // soft ink edges
  gl_FragColor = vec4(col + spec, 1.);
}`;
  // fwidth needs an extension on WebGL1; approximate with a fixed edge width
  const FS_FINAL = FS.replace('float w = fwidthApprox(q);', 'float w = 0.035;');

  function mat4mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]); }
  function lookAt(e, c, u) { const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(u, z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); }

  function mount(canvas, opts = {}) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) return null;
    const ext = gl.getExtension('OES_element_index_uint');
    for (const k in groups) groups[k] = Mesh();
    build();
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(x)); return x; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS_FINAL)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(pr)); return null; }
    gl.useProgram(pr);
    const A = (n) => gl.getAttribLocation(pr, n), U = (n) => gl.getUniformLocation(pr, n);
    const loc = { aP: A('aP'), aN: A('aN'), aU: A('aU'), aC: A('aC'), aS: A('aS') };
    const uni = { uPV: U('uPV'), uT: U('uT'), uOut: U('uOut'), uRot: U('uRot'), uMat: U('uMat'), uFace: U('uFace'), uEye: U('uEye'), uLine: U('uLine'), uLineC: U('uLineC') };
    const bufs = [];
    for (const k of [0, 1, 2, 3]) {
      const g = groups[k]; if (!g.i.length) continue;
      const mk = (arr, T = Float32Array, tgt = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(tgt, b); gl.bufferData(tgt, new T(arr), gl.STATIC_DRAW); return b; };
      const big = g.p.length / 3 > 65535;
      bufs.push({ mat: k, p: mk(g.p), n: mk(g.n), u: mk(g.u), c: mk(g.c), s: mk(g.s), i: mk(g.i, big ? Uint32Array : Uint16Array, gl.ELEMENT_ARRAY_BUFFER), count: g.i.length, type: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT });
    }
    // face texture from her art
    const faceCv = document.createElement('canvas'); faceCv.width = 512; faceCv.height = 320;
    const faceCvClosed = document.createElement('canvas'); faceCvClosed.width = 512; faceCvClosed.height = 320;
    const faceTex = gl.createTexture(), faceTexClosed = gl.createTexture();
    function upload(tex, cv) { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    function paintFace(img) {
      for (const [cv, closed] of [[faceCv, false], [faceCvClosed, true]]) {
        const x = cv.getContext('2d'); const W = cv.width, H = cv.height;
        const sk = 'rgb(' + C.skin.map(v => Math.round(v * 255)).join(',') + ')';
        x.fillStyle = sk; x.fillRect(0, 0, W, H);
        if (img) {
          const t = document.createElement('canvas'); t.width = W; t.height = H; const tx = t.getContext('2d');
          // tile coords (x 86..226, y 112..198) in the 4x art = (344..904, 448..792)
          const sx = img.naturalWidth / 1180, sy = img.naturalHeight / 976;
          tx.drawImage(img, 344 * sx, 448 * sy, 560 * sx, 344 * sy, 0, 0, W, H);
          const gb = tx.createLinearGradient(0, H * .72, 0, H * .9); gb.addColorStop(0, 'rgba(0,0,0,1)'); gb.addColorStop(1, 'rgba(0,0,0,0)'); tx.globalCompositeOperation = 'destination-in'; tx.fillStyle = gb; tx.fillRect(0, 0, W, H); tx.globalCompositeOperation = 'source-over';
          const g = tx.createRadialGradient(W * .5, H * .5, H * .25, W * .5, H * .52, W * .55);
          g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.62, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          tx.globalCompositeOperation = 'destination-in'; tx.fillStyle = g; tx.fillRect(0, 0, W, H);
          x.drawImage(t, 0, 0);
          if (closed) { // eyelids for blinking (eye centers from the art)
            for (const [ex, ey, rx, ry] of [[(116.5 - 86) / 140, (135 - 112) / 86, 22.5 / 140, 11 / 86], [(196 - 86) / 140, (134 - 112) / 86, 20.5 / 140, 11 / 86]]) {
              x.fillStyle = 'rgb(238,200,212)'; x.beginPath(); x.ellipse(ex * W, ey * H, rx * W * 1.05, ry * H * 1.15, 0, 0, TAU); x.fill();
              x.strokeStyle = '#3a0e1c'; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath();
              x.moveTo((ex - rx) * W, ey * H + 2); x.quadraticCurveTo(ex * W, ey * H + ry * H * .9, (ex + rx) * W, ey * H + 2); x.stroke();
            }
          }
        }
      }
      upload(faceTex, faceCv); upload(faceTexClosed, faceCvClosed);
    }
    paintFace(null);
    if (opts.faceSrc) { const im = new Image(); im.onload = () => paintFace(im); im.src = opts.faceSrc; }
    // camera + interaction
    const st = { yaw: 0, pitch: 0.06, dist: 14, target: [0, 3.75, 0], dragging: false, lastTouch: 0, vx: 0 };
    const pointers = new Map(); let pinch0 = 0, dist0 = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); st.dragging = true; st.lastTouch = performance.now(); if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = st.dist; } });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return; const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1) { const dx = e.clientX - prev[0], dy = e.clientY - prev[1]; st.yaw += dx * 0.012; st.vx = dx * 0.012; st.pitch = Math.max(-0.35, Math.min(0.6, st.pitch + dy * 0.004)); }
      else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); st.dist = Math.max(3.2, Math.min(19, dist0 * pinch0 / d)); }
      st.lastTouch = performance.now();
    });
    const up = (e) => { pointers.delete(e.pointerId); if (!pointers.size) st.dragging = false; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); st.dist = Math.max(3.2, Math.min(19, st.dist * (1 + e.deltaY * 0.001))); }, { passive: false });
    let lastTap = 0; canvas.addEventListener('pointerup', () => { const n = performance.now(); if (n - lastTap < 300) { st.yaw = 0; st.pitch = .06; st.dist = 14; } lastTap = n; });
    // zooming in moves the focus up towards her face
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    let running = true, blinkUntil = 0, nextBlink = performance.now() + 2500;
    function frame(now) {
      if (!running) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (w && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!st.dragging) { st.yaw += st.vx; st.vx *= 0.94; if (now - st.lastTouch > 5000) st.yaw += (Math.sin(now / 4000) * 0.45 - st.yaw) * 0.01; }
      const zoomT = Math.max(0, Math.min(1, (14 - st.dist) / 10));
      const tgt = [0, 3.75 + zoomT * 2.7, 0];
      const eye = [0, tgt[1] + Math.sin(st.pitch) * st.dist, Math.cos(st.pitch) * st.dist];
      const PV = mat4mul(persp(0.52, canvas.width / canvas.height, 0.1, 60), lookAt(eye, tgt, [0, 1, 0]));
      gl.uniformMatrix4fv(uni.uPV, false, PV); gl.uniform1f(uni.uT, now / 1000); gl.uniform1f(uni.uRot, st.yaw);
      // rotate the eye into model space for rim lighting
      const c = Math.cos(st.yaw), s = Math.sin(st.yaw); gl.uniform3f(uni.uEye, eye[0], eye[1], eye[2]);
      if (now > nextBlink) { blinkUntil = now + 130; nextBlink = now + 2200 + Math.random() * 4000; }
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, now < blinkUntil ? faceTexClosed : faceTex); gl.uniform1i(uni.uFace, 0);
      for (const pass of [1]) { // shaded pass (edges are drawn in the shader)
                gl.uniform1f(uni.uLine, pass === 0 ? 1 : 0); gl.uniform1f(uni.uOut, pass === 0 ? 0.0035 + st.dist * 0.00035 : 0); gl.uniform3f(uni.uLineC, .1, .02, .05);
        for (const b of bufs) {
          if (pass === 0 && b.mat === 3) { /* head outline too */ }
          gl.uniform1i(uni.uMat, b.mat);
          for (const [k, size] of [['p', 3], ['n', 3], ['u', 2], ['c', 3], ['s', 1]]) { const l = loc['a' + k.toUpperCase()] ?? loc['a' + k]; gl.bindBuffer(gl.ARRAY_BUFFER, b[k]); const L = { p: loc.aP, n: loc.aN, u: loc.aU, c: loc.aC, s: loc.aS }[k]; gl.enableVertexAttribArray(L); gl.vertexAttribPointer(L, size, gl.FLOAT, false, 0, 0); }
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.i);
          gl.drawElements(gl.TRIANGLES, b.count, b.type, 0);
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const vcount = Object.values(groups).reduce((a, g) => a + g.p.length / 3, 0);
    return { stop() { running = false; }, start() { if (!running) { running = true; requestAnimationFrame(frame); } }, state: st, vertices: vcount, uint: !!ext };
  }
  window.Cerise3D = { mount };
})();
