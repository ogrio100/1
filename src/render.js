// ===== Canvas 等距单层地图渲染 =====
const RENDER = (function () {
  const G = IB.geo, D = IB.D;
  const HW = 22, HH = 11, WALL = 24;
  const PAD = 46, TOP = 78;
  const OX = G.MAP.h * HW + PAD, OY = TOP;
  const LW = (G.MAP.w + G.MAP.h) * HW + PAD * 2, LH = (G.MAP.w + G.MAP.h) * HH + TOP + 40;
  let cv, ctx, dpr = 1, cw = 0, ch = 0;
  const view = { zoom: 1, px: 0, py: 0, s: 1, tx: 0, ty: 0 };
  const st = { sel: null, hover: null, hoverLot: -1, placing: '', t: 0 };

  const P = (x, y) => [OX + (x - y) * HW, OY + (x + y) * HH];
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 1) { r *= f; g *= f; b *= f; } else { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function poly(pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function floor(x0, y0, x1, y1, fill, stroke, lw) {
    poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], fill, stroke, lw);
  }
  function box(x0, y0, x1, y1, h, col, z) {
    z = z || 0;
    const b = P(x1, y0), c = P(x1, y1), d = P(x0, y1), a = P(x0, y0);
    const up = p => [p[0], p[1] - h - z], dn = p => [p[0], p[1] - z];
    poly([dn(d), dn(c), up(c), up(d)], shade(col, 0.82));
    poly([dn(c), dn(b), up(b), up(c)], shade(col, 0.68));
    poly([up(a), up(b), up(c), up(d)], col, 'rgba(255,255,255,.55)', 0.8);
  }
  function wallSeg(xa, ya, xb, yb, col, glass) {
    const a = P(xa, ya), b = P(xb, yb);
    poly([a, b, [b[0], b[1] - WALL], [a[0], a[1] - WALL]], col);
    if (glass) poly([[a[0], a[1] - 9], [b[0], b[1] - 9], [b[0], b[1] - WALL + 3], [a[0], a[1] - WALL + 3]], 'rgba(190,232,255,.55)');
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(a[0], a[1] - WALL); ctx.lineTo(b[0], b[1] - WALL); ctx.stroke();
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function plate(cx, cy, lines, opt) {
    opt = opt || {};
    ctx.font = (opt.bold ? '700 ' : '600 ') + (opt.size || 11) + 'px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
    let w = 0;
    for (const l of lines) w = Math.max(w, ctx.measureText(l.t).width);
    const lh = (opt.size || 11) + 4, h = lines.length * lh + 6;
    w += 14;
    rr(cx - w / 2, cy - h, w, h, 7);
    ctx.fillStyle = opt.bg || 'rgba(255,255,255,.92)'; ctx.fill();
    ctx.strokeStyle = opt.border || 'rgba(120,150,140,.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => { ctx.fillStyle = l.c || '#35524a'; ctx.fillText(l.t, cx, cy - h + 3 + lh * (i + 0.5)); });
  }

  // 家具：[lx, ld, 宽, 深, 高, 颜色]（房间局部坐标，ld 为距门墙的进深）
  const FURN = {
    reception: [[3, 3.15, 5.2, 0.5, 12, '#8fd3c1'], [3, 4.72, 5.4, 0.3, 20, '#d5ede6']],
    review: [[3, 3.15, 5.2, 0.5, 12, '#9cc7e6'], [1, 4.7, 1.3, 0.35, 22, '#c9b79c'], [5, 4.7, 1.3, 0.35, 22, '#c9b79c']],
    cashier: [[3, 3.15, 5.2, 0.5, 13, '#f2b866'], [3, 4.72, 2.2, 0.3, 18, '#e3cfa0']],
    report: [[3, 3.15, 5.2, 0.5, 12, '#7fcdbb'], [4.9, 4.65, 1.3, 0.4, 24, '#5aa9a0']],
    bookstore: [[4.9, 2.55, 1.5, 0.5, 11, '#f09a80'], [1.2, 2.55, 1.5, 0.5, 11, '#f09a80'], [1.2, 4.68, 1.8, 0.36, 24, '#c98f6b'], [3, 4.68, 1.4, 0.36, 24, '#d9a37e'], [4.8, 4.68, 1.8, 0.36, 24, '#c98f6b']],
    written: [[3, 3.95, 1.3, 0.36, 12, '#8aa5de']].concat(G.SEATS.map(s => [s[0], s[1] + 0.48, 0.95, 0.42, 8, '#ecdcb9'])),
    practical: [[1.6, 3.25, 1.7, 0.6, 10, '#b9d68a'], [4.4, 3.25, 1.7, 0.6, 10, '#b9d68a']],
    grading: [[1.6, 2.9, 1.7, 0.6, 10, '#b9a3dc'], [4.4, 2.9, 1.7, 0.6, 10, '#b9a3dc'], [3, 4.72, 2, 0.3, 20, '#d9cdea']],
    tutoring: [[1.6, 3.25, 1.1, 0.45, 9, '#f0d67a'], [4.4, 3.25, 1.1, 0.45, 9, '#f0d67a'], [3, 3.2, 0.14, 2.6, 17, '#eee2b0']],
    counsel: [[3.25, 3.4, 0.5, 0.9, 7, '#f7cfe0'], [1.3, 4.5, 1.6, 0.5, 9, '#f3bcd6'], [5.2, 4.5, 0.6, 0.6, 15, '#9bcf9a']],
    pod: [[2.6, 3.5, 1.9, 1.1, 9, '#8fe3e0'], [4.9, 3.35, 0.9, 0.5, 13, '#5fb9c4']],
    liaison: [[1.6, 2.9, 1.5, 0.5, 10, '#cdbf9a'], [4.4, 2.9, 1.5, 0.5, 10, '#cdbf9a'], [3, 4.72, 5, 0.3, 24, '#b8a880']],
    petition: [[3, 4.2, 1.8, 0.6, 16, '#c9a6e3'], [1.2, 4.5, 0.5, 0.5, 20, '#e7d4f5'], [4.8, 4.5, 0.5, 0.5, 20, '#e7d4f5']],
    lounge: [[3, 4.6, 4.6, 0.5, 9, '#e2c9a0'], [3, 3.0, 1.3, 0.7, 6, '#c9a57a'], [5.4, 0.6, 0.5, 0.5, 14, '#9bcf9a']],
  };

  function roomStatus(rm) {
    const S = IB.S, def = D.ROOMS[rm.type], lines = [{ t: def.short }];
    const stf = S.staff.filter(s => s.room === rm.id);
    if (def.job) {
      if (!stf.length) lines.push({ t: '⚠ 未排班', c: '#d9534f' });
      else if (!stf.some(s => s.st === 'post')) lines.push({ t: stf.some(s => s.st === 'rest' || s.st === 'toRest' || s.st === 'toPost') ? '☕ 休息中' : '⚠ 今日缺岗', c: '#d98a2b' });
    }
    if (rm.q.length) lines.push({ t: '排队 ' + rm.q.length, c: rm.q.length > 4 ? '#d9534f' : '#5b7a70' });
    if (rm.type === 'written' || rm.type === 'practical') {
      for (const k of S.today) {
        const ses = S.sessions[k];
        if (!ses || ses.room !== rm.id || !ses.cids.length || ses.st === 'done' || ses.st === 'cancel') continue;
        const t = ses.kind === 'w' ? D.W_SLOTS[ses.slot] : D.P_SLOTS[ses.slot];
        lines.push({ t: (ses.st === 'run' ? '考试中 ' : IB.timeStr(t) + ' ') + (ses.kind === 'w' ? D.COURSE[ses.course].short : '实操') + ' ' + ses.cids.length + '/' + (ses.kind === 'w' ? D.W_SEATS : D.P_STATIONS), c: ses.st === 'run' ? '#2f6fe0' : '#5b7a70' });
        break;
      }
    }
    if (rm.type === 'grading' && S.gq.length) lines.push({ t: '待批 ' + S.gq.length, c: S.gq.length > 12 ? '#d9534f' : '#5b7a70' });
    if (rm.type === 'petition' && S.petitions.length) lines.push({ t: '🙏 待裁决 ' + S.petitions.length, c: '#8a4fc2' });
    return lines;
  }

  function agentColor(a) {
    const S = IB.S;
    if (a.k === 'up') return { body: '#7b3fc4', head: '#f3d9bf', hat: '#4b217f', tag: '上级' };
    if (a.k === 'stf') {
      const s = IB.St(a.sid);
      if (!s) return { body: '#999', head: '#f3d9bf' };
      const j = D.JOBS[s.job];
      return { body: j.color, head: s.species === 'alien' ? 'hsl(' + s.hue + ',55%,72%)' : '#f6dcc0', hat: s.job === 'inspector' ? '#1d4fb0' : null, alien: s.species === 'alien', badge: true };
    }
    const c = IB.C(a.cid);
    if (!c) return { body: '#bbb', head: '#f3d9bf' };
    return { body: 'hsl(' + c.hue + ',48%,70%)', head: c.species === 'alien' ? 'hsl(' + ((c.hue + 120) % 360) + ',55%,74%)' : '#f6dcc0', hair: 'hsl(' + c.hue + ',30%,32%)', alien: c.species === 'alien' };
  }
  function drawAgent(a, x, y) {
    const p = P(x, y), col = agentColor(a), sx = p[0], sy = p[1];
    const selected = st.sel && st.sel === a.id, hov = st.hover === a.id;
    ctx.fillStyle = 'rgba(60,80,70,.22)';
    ctx.beginPath(); ctx.ellipse(sx, sy, 7, 3.4, 0, 0, 6.3); ctx.fill();
    if (selected || hov) { ctx.strokeStyle = selected ? '#ff7a4d' : '#3fae93'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, 10, 5, 0, 0, 6.3); ctx.stroke(); }
    const tall = a.k === 'up' ? 3 : 0, bob = a.path && a.path.length ? Math.sin(st.t * 12 + a.id) * 1.1 : 0;
    rr(sx - 5, sy - 14 - tall + bob, 10, 13 + tall, 4.5);
    ctx.fillStyle = col.body; ctx.fill();
    ctx.strokeStyle = 'rgba(40,60,55,.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    if (col.badge) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(sx - 1.5, sy - 10 + bob, 3, 3); }
    const hy = sy - 18 - tall + bob;
    ctx.fillStyle = col.head; ctx.beginPath(); ctx.arc(sx, hy, 4.6, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(40,60,55,.35)'; ctx.stroke();
    if (col.alien) {
      ctx.strokeStyle = col.head; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sx - 2, hy - 4); ctx.lineTo(sx - 4, hy - 9); ctx.moveTo(sx + 2, hy - 4); ctx.lineTo(sx + 4, hy - 9); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx - 4, hy - 9, 1.5, 0, 6.3); ctx.arc(sx + 4, hy - 9, 1.5, 0, 6.3); ctx.fill();
    } else if (col.hat) {
      ctx.fillStyle = col.hat; rr(sx - 5.5, hy - 6.5, 11, 4.2, 2); ctx.fill();
      ctx.fillRect(sx - 6.5, hy - 3, 13, 1.4);
    } else if (col.hair) {
      ctx.fillStyle = col.hair; ctx.beginPath(); ctx.arc(sx, hy - 0.8, 4.7, Math.PI, 0); ctx.fill();
    }
    if (a.k === 'up') { ctx.fillStyle = '#fff'; ctx.fillRect(sx + 4, sy - 12, 5, 7); ctx.strokeStyle = '#4b217f'; ctx.strokeRect(sx + 4, sy - 12, 5, 7); }
    if (a.bub) {
      ctx.font = '12px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#333';
      ctx.fillText(a.bub, sx, hy - 9);
    }
    if (col.tag || selected || hov) {
      const name = a.k === 'up' ? a.name : a.k === 'stf' ? (IB.St(a.sid) || {}).name : (IB.C(a.cid) || {}).name;
      if (name) plate(sx, hy - (a.bub ? 22 : 9), [{ t: name, c: a.k === 'up' ? '#5b2a9c' : '#35524a' }], { size: 10, bg: a.k === 'up' ? 'rgba(240,228,255,.95)' : 'rgba(255,255,255,.95)', border: a.k === 'up' ? '#a77be0' : null });
    }
  }

  function draw(alpha) {
    if (!ctx || !IB.S) return;
    const S = IB.S;
    st.t = performance.now() / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#fdf6e9'); bg.addColorStop(1, '#eaf5ef');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
    view.s = Math.min(cw / LW, ch / LH) * view.zoom;
    view.tx = (cw - LW * view.s) / 2 + view.px; view.ty = (ch - LH * view.s) / 2 + view.py;
    ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.tx, dpr * view.ty);

    // 地基与地面
    const W = G.MAP.w, H = G.MAP.h;
    poly([P(0, 0), P(W, 0), P(W, H), P(0, H)].map((p, i) => [p[0], p[1] + 9]), '#cfd9cf');
    floor(0, 0, W, H, '#f4efe2', '#cdbfa5', 1.2);
    floor(0, 0, G.HALL_W, H, '#fbf3df');
    for (const r of [5, 12]) floor(G.HALL_W, r, W, r + 2, '#f7eedb');
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(190,170,130,.6)'; ctx.lineWidth = 1;
    for (const y of [6, 13]) { const a = P(G.HALL_W, y), b = P(W, y); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.setLineDash([]);
    // 大门与离场线
    floor(0, 8.6, 1.2, 10.4, '#ffd9c7');
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#e2603e'; ctx.lineWidth = 1.6;
    { const a = P(1.2, 8.2), b = P(1.2, 10.8); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.setLineDash([]);
    floor(-1.4, 8.9, 0, 10.1, '#e8dcc4', '#cdbfa5', 1);

    const byLot = {};
    for (const rm of S.rooms) byLot[rm.lot] = rm;
    for (let lot = 0; lot < G.LOT_COUNT; lot++) {
      const g = G.lotGeom(lot), rm = byLot[lot];
      const x0 = g.x, y0 = g.y, x1 = g.x + G.LOT_W, y1 = g.y + G.LOT_D;
      if (rm) {
        const col = D.ROOMS[rm.type].color;
        floor(x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.06, shade(col, 1.45), shade(col, 0.8), 1.2);
        const dp = G.roomPos(rm, 3, 0);
        floor(dp.x - 0.5, dp.y - 0.28, dp.x + 0.5, dp.y + 0.28, shade(col, 0.9));
      } else {
        const hot = st.hoverLot === lot;
        ctx.setLineDash([6, 5]);
        floor(x0 + 0.25, y0 + 0.25, x1 - 0.25, y1 - 0.25, hot ? 'rgba(63,174,147,.22)' : (st.placing ? 'rgba(63,174,147,.10)' : 'rgba(255,255,255,.35)'), hot ? '#3fae93' : '#c9bfa8', hot ? 2 : 1.2);
        ctx.setLineDash([]);
        const c = P(x0 + 3, y0 + 2.5);
        ctx.font = '600 12px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = hot ? '#2f8f78' : '#b3a88f';
        ctx.fillText(st.placing ? '点击在此建造' : '＋ 空地', c[0], c[1]);
      }
    }

    // 需要按进深排序的物件：墙段、家具、人物
    const items = [];
    const add = (d, f) => items.push({ d, f });
    for (let y = 0; y < H; y++) {
      if (y >= 8.5 && y < 10.5) continue;
      add(y + 0.02, () => wallSeg(0, y + 1, 0, y, '#e9dfc8', true));
    }
    for (let x = 0; x < G.HALL_W; x++) add(x + 0.02, () => wallSeg(x, 0, x + 1, 0, '#e9dfc8', true));
    for (const rm of S.rooms) {
      const g = G.lotGeom(rm.lot), def = D.ROOMS[rm.type], col = shade(def.color, 0.93);
      const x0 = g.x, y0 = g.y;
      const segs = g.door === 'N' ? [[0, 1], [1, 2], [2, 2.5], [3.5, 4], [4, 5], [5, 6]] : [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]];
      for (const sg of segs) add(x0 + sg[0] + y0 + 0.01, () => wallSeg(x0 + sg[0], y0, x0 + sg[1], y0, col, true));
      for (let i = 0; i < G.LOT_D; i++) add(x0 + y0 + i + 0.01, () => wallSeg(x0, y0 + i + 1, x0, y0 + i, shade(def.color, 0.86), false));
      for (const f of FURN[rm.type] || []) {
        const c = G.roomPos(rm, f[0], f[1]);
        add(c.x + c.y + (f[3] + f[2]) * 0.2, () => box(c.x - f[2] / 2, c.y - f[3] / 2, c.x + f[2] / 2, c.y + f[3] / 2, f[4], f[5]));
      }
      if (rm.type === 'grading' && S.gq.length) {
        const c = G.roomPos(rm, 3, 2.9), n = Math.min(10, Math.ceil(S.gq.length / 2));
        add(c.x + c.y + 0.3, () => box(c.x - 0.3, c.y - 0.2, c.x + 0.3, c.y + 0.2, 2 + n * 2, '#ffffff'));
      }
    }
    for (const a of S.agents) {
      const x = a.px + (a.x - a.px) * alpha, y = a.py + (a.y - a.py) * alpha;
      a._sx = x; a._sy = y;
      add(x + y + 0.25, () => drawAgent(a, x, y));
    }
    items.sort((p, q) => p.d - q.d);
    for (const it of items) it.f();

    // 招牌与房间标签
    for (const rm of S.rooms) {
      const g = G.lotGeom(rm.lot), p = P(g.x + 3, g.y);
      plate(p[0], p[1] - WALL - 4, roomStatus(rm), { size: 10.5, border: shade(D.ROOMS[rm.type].color, 0.7) });
    }
    const sp = P(0, 0);
    plate(sp[0] + 8, sp[1] - WALL - 6, [{ t: S.center, c: '#fff' }, { t: D.LEVEL_NAMES[S.level].split(' · ')[0] + '资质 · 局长 ' + S.player, c: '#ffe9df' }], { size: 13, bold: true, bg: '#e9795d', border: '#c75f45' });
    const gp = P(-0.7, 9.5);
    plate(gp[0], gp[1] - 6, [{ t: '出入口' }], { size: 10 });
    const lp = P(1.25, 11.1);
    ctx.font = '600 9px sans-serif'; ctx.fillStyle = '#e2603e'; ctx.textAlign = 'center'; ctx.fillText('离场线', lp[0], lp[1] + 6);
  }

  function toWorld(mx, my) {
    const lx = (mx - view.tx) / view.s, ly = (my - view.ty) / view.s;
    const u = (lx - OX) / HW, v = (ly - OY) / HH;
    return { x: (u + v) / 2, y: (v - u) / 2, lx, ly };
  }
  function pick(mx, my) {
    const S = IB.S, w = toWorld(mx, my);
    let best = null, bd = 16;
    for (const a of S.agents) {
      const p = P(a._sx == null ? a.x : a._sx, a._sy == null ? a.y : a._sy);
      const d = Math.hypot(p[0] - w.lx, p[1] - 10 - w.ly);
      if (d < bd) { bd = d; best = a; }
    }
    if (best) return { agent: best };
    if (w.x >= G.HALL_W && w.x < G.MAP.w) {
      const col = Math.floor((w.x - G.HALL_W) / G.LOT_W);
      for (let r = 0; r < G.ROWS.length; r++) {
        if (w.y >= G.ROWS[r].y && w.y < G.ROWS[r].y + G.LOT_D) {
          const lot = r * G.LOT_COLS + col;
          return { lot, room: S.rooms.find(q => q.lot === lot) || null };
        }
      }
    }
    return {};
  }
  function resize() {
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = Math.max(50, r.width); ch = Math.max(50, r.height);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  }
  function init(canvas, cb) {
    cv = canvas; ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    let drag = null, moved = false;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, px: view.px, py: view.py }; moved = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
        if (moved) { view.px = drag.px + dx; view.py = drag.py + dy; cv.style.cursor = 'grabbing'; }
        return;
      }
      if (!IB.S) return;
      const [mx, my] = pos(e), hit = pick(mx, my);
      st.hover = hit.agent ? hit.agent.id : null;
      st.hoverLot = hit.agent || hit.lot == null || hit.room ? -1 : hit.lot;
      cv.style.cursor = hit.agent || hit.lot != null ? 'pointer' : 'grab';
    });
    cv.addEventListener('pointerup', e => {
      const was = moved;
      drag = null; moved = false; cv.style.cursor = 'grab';
      if (was || !IB.S) return;
      const [mx, my] = pos(e), hit = pick(mx, my);
      if (hit.agent) cb.onAgent(hit.agent);
      else if (hit.lot != null) cb.onLot(hit.lot, hit.room);
    });
    cv.addEventListener('pointerleave', () => { st.hover = null; st.hoverLot = -1; });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const [mx, my] = pos(e), z0 = view.zoom, z1 = Math.max(0.7, Math.min(3.2, z0 * (e.deltaY < 0 ? 1.12 : 0.89)));
      if (z1 === z0) return;
      // 以指针为中心缩放
      const w = toWorld(mx, my);
      view.zoom = z1;
      const s1 = Math.min(cw / LW, ch / LH) * z1;
      view.px = mx - w.lx * s1 - (cw - LW * s1) / 2;
      view.py = my - w.ly * s1 - (ch - LH * s1) / 2;
    }, { passive: false });
  }
  function zoomBy(f) { view.zoom = Math.max(0.7, Math.min(3.2, view.zoom * f)); }
  function resetView() { view.zoom = 1; view.px = 0; view.py = 0; }
  function focus(x, y) {
    const p = P(x, y), s = Math.min(cw / LW, ch / LH) * view.zoom;
    view.px = cw / 2 - p[0] * s - (cw - LW * s) / 2;
    view.py = ch / 2 - p[1] * s - (ch - LH * s) / 2;
  }
  return { init, draw, resize, zoomBy, resetView, focus, state: st, view };
})();
