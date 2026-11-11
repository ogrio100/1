// ===== 模拟内核 1：状态、随机数、几何、账本、人物生成、房间与库存 =====
let S = null;
const FX = [];
const IDX = { c: new Map(), s: new Map(), a: new Map(), r: new Map(), p: new Map() };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function R() {
  let t = (S.seed = (S.seed + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const pick = arr => arr[Math.floor(R() * arr.length)];
const chance = p => R() < p;
const gauss = () => (R() + R() + R() + R() - 2) / 0.5774;
const nid = () => S.nextId++;
function wpick(items) {
  let tot = 0;
  for (const it of items) tot += it.w;
  let r = R() * tot;
  for (const it of items) { r -= it.w; if (r <= 0) return it; }
  return items[items.length - 1];
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"'`]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[ch]));
}
function cleanName(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

const C = id => IDX.c.get(id);
const St = id => IDX.s.get(id);
const A = id => IDX.a.get(id);
const Rm = id => IDX.r.get(id);
const PAPER = id => IDX.p.get(id);
function reindex() {
  for (const k in IDX) IDX[k].clear();
  S.citizens.forEach(c => IDX.c.set(c.id, c));
  S.staff.forEach(s => IDX.s.set(s.id, s));
  S.agents.forEach(a => IDX.a.set(a.id, a));
  S.rooms.forEach(r => IDX.r.set(r.id, r));
  S.papers.forEach(p => IDX.p.set(p.id, p));
}

// ---------- 年历 ----------
function dateOf(day) {
  return { y: Math.floor((day - 1) / D.YEAR_DAYS) + 1, m: Math.floor(((day - 1) % D.YEAR_DAYS) / D.MONTH_DAYS) + 1, d: ((day - 1) % D.MONTH_DAYS) + 1 };
}
function dateStr(day) { const t = dateOf(day); return '第' + t.y + '年' + t.m + '月' + t.d + '日'; }
function timeStr(min) { const h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }

// ---------- 日志与账本 ----------
function log(text, kind) {
  S.logSeq++;
  S.log.push({ n: S.logSeq, d: S.day, m: S.minute, t: text, k: kind || 'info' });
  if (S.log.length > 240) S.log.splice(0, S.log.length - 240);
  if (kind === 'ask' || kind === 'key') S.keySeq++;
}
function daily(day) {
  let dd = S.daily[day];
  if (!dd) dd = S.daily[day] = { inc: {}, exp: {}, due: 0, esc: 0, vis: 0 };
  return dd;
}
function cashMove(cat, amt, label, cid) {
  amt = Math.round(amt);
  if (!amt) return;
  S.cash += amt;
  S.ledger.push({ d: S.day, m: S.minute, c: cat, a: amt, l: label || '', cid: cid || 0 });
  const dd = daily(S.day), side = amt >= 0 ? dd.inc : dd.exp;
  side[cat] = (side[cat] || 0) + amt;
  S.tot[cat] = (S.tot[cat] || 0) + amt;
}
function dayNet(day) {
  const dd = S.daily[day];
  if (!dd) return 0;
  let n = 0;
  for (const k in dd.inc) n += dd.inc[k];
  for (const k in dd.exp) n += dd.exp[k];
  return n;
}
function addTrust(v) { S.trust = clamp(S.trust + v, 0, 100); }
function addComp(v) { S.comp = clamp(S.comp + v, 0, 100); }

// ---------- 单层地图几何 ----------
const LOT_W = 6, LOT_D = 5, HALL_W = 3, LOT_COLS = 6;
const ROWS = [{ y: 0, door: 'S', cy: 6 }, { y: 7, door: 'N', cy: 6 }, { y: 14, door: 'N', cy: 13 }];
const LOT_COUNT = LOT_COLS * ROWS.length;
const MAP = { w: HALL_W + LOT_COLS * LOT_W, h: 19, hallX: 1.5, gateY: 9.5 };
const OUTSIDE = { h: 1, x: -1.6, y: 9.5 };
const SPEED = 2.6;
function lotGeom(lot) {
  const row = Math.floor(lot / LOT_COLS), col = lot % LOT_COLS;
  return { row, col, x: HALL_W + col * LOT_W, y: ROWS[row].y, door: ROWS[row].door, cy: ROWS[row].cy };
}
function roomPos(rm, lx, ld) {
  const g = lotGeom(rm.lot);
  return { x: g.x + lx, y: g.door === 'S' ? g.y + LOT_D - ld : g.y + ld };
}
const doorXY = rm => roomPos(rm, 3, 0);
function corrXY(rm) { const g = lotGeom(rm.lot); return { x: g.x + 3, y: g.cy }; }
function placeXY(p) { return p.r ? roomPos(Rm(p.r), p.lx, p.ld) : { x: p.x, y: p.y }; }
function route(from, to) {
  const pts = [];
  if (from.r && to.r && from.r === to.r) { pts.push(placeXY(to)); return pts; }
  let cy = null;
  if (from.r) {
    const rm = Rm(from.r);
    if (rm) { const c = corrXY(rm); pts.push(doorXY(rm), c); cy = c.y; }
  } else if (from.x < 0) pts.push({ x: MAP.hallX, y: MAP.gateY });
  if (to.r) {
    const rm = Rm(to.r), c = corrXY(rm);
    if (cy === null) pts.push({ x: MAP.hallX, y: c.y });
    else if (cy !== c.y) pts.push({ x: MAP.hallX, y: cy }, { x: MAP.hallX, y: c.y });
    pts.push(c, doorXY(rm), placeXY(to));
  } else {
    if (cy !== null) pts.push({ x: MAP.hallX, y: cy });
    if (to.x < 0) pts.push({ x: MAP.hallX, y: MAP.gateY });
    pts.push({ x: to.x, y: to.y });
  }
  return pts;
}
function setDest(a, place) {
  a.path = route(a.place, place);
  a.place = place;
}
function stepAgent(a) {
  a.px = a.x; a.py = a.y;
  let rem = SPEED;
  while (rem > 0 && a.path.length) {
    const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, dist = Math.hypot(dx, dy);
    if (dist <= rem) { a.x = p.x; a.y = p.y; a.path.shift(); rem -= dist; }
    else { a.x += dx / dist * rem; a.y += dy / dist * rem; rem = 0; }
  }
}
function teleport(a, place) {
  const p = placeXY(place);
  a.x = a.px = p.x; a.y = a.py = p.y; a.path = []; a.place = place;
}

const POSTS = {
  reception: [[1.5, 3.9], [4.5, 3.9]], cashier: [[1.5, 3.9], [4.5, 3.9]], review: [[1.5, 3.9], [4.5, 3.9]], report: [[3, 3.9], [1.2, 3.9]],
  bookstore: [[4.9, 3.2], [1.2, 3.2]], written: [[3, 4.4], [5.3, 4.4]], practical: [[3, 4.3], [5.3, 4.3]], grading: [[1.6, 3.5], [4.4, 3.5]],
  tutoring: [[1.6, 3.8], [4.4, 3.8]], counsel: [[3.9, 3.4]], pod: [[4.9, 2.6]], liaison: [[1.6, 3.5], [4.4, 3.5]], petition: [], lounge: [],
};
const CUST = {
  reception: [[1.5, 2.4], [4.5, 2.4]], cashier: [[1.5, 2.4], [4.5, 2.4]], review: [[1.5, 2.4], [4.5, 2.4]], report: [[3, 2.4], [1.2, 2.4]],
  bookstore: [[4.9, 1.9], [1.2, 1.9]], tutoring: [[1.6, 2.7], [4.4, 2.7]], counsel: [[2.6, 3.4]], pod: [[2.6, 3.5]],
  petition: [[3, 2.6], [1.6, 2.6], [4.4, 2.6]],
};
const SEATS = [[1.2, 1.7], [3, 1.7], [4.8, 1.7], [1.2, 3.1], [3, 3.1], [4.8, 3.1]];
const STATIONS = [[1.6, 2.6], [4.4, 2.6]];
const LOUNGE = [[1, 3.8], [2, 3.8], [3, 3.8], [4, 3.8], [5, 3.8], [1.2, 2.2], [4.8, 2.2], [3, 2.2]];
const SERVICE_ROOMS = { reception: 1, cashier: 1, review: 1, report: 1, bookstore: 1, tutoring: 1, counsel: 1, pod: 1 };
function qPlace(rm, k) {
  return { r: rm.id, lx: 0.6 + (k % 6) * 0.95, ld: k < 6 ? 0.9 : 0.35 };
}

// ---------- 房间 ----------
const roomsOf = type => S.rooms.filter(r => r.type === type);
const hasRoom = type => S.rooms.some(r => r.type === type);
const staffIn = rm => S.staff.filter(s => s.room === rm.id);
const present = s => s.st === 'post';
function staffed(type) {
  return S.rooms.some(r => r.type === type && S.staff.some(s => s.room === r.id && s.st !== 'away' && s.st !== 'leave'));
}
function addRoom(type, lot) {
  const rm = { id: nid(), type, lot, q: [], built: S.day };
  S.rooms.push(rm); IDX.r.set(rm.id, rm);
  return rm;
}
function lotFree(lot) { return lot >= 0 && lot < LOT_COUNT && !S.rooms.some(r => r.lot === lot); }
function buildRoom(type, lot) {
  const def = D.ROOMS[type];
  if (!def) return { ok: false, msg: '未知房间类型' };
  if (!lotFree(lot)) return { ok: false, msg: '该地块已被占用' };
  if (!def.multi && hasRoom(type)) return { ok: false, msg: def.name + ' 只能建一间' };
  if (S.cash < def.cost) return { ok: false, msg: '现金不足，需要 ' + def.cost };
  cashMove('build', -def.cost, '建设 ' + def.name);
  const rm = addRoom(type, lot);
  log('🏗 建成「' + def.name + '」。' + (def.job ? '请在【员工排班】为其配备' + D.JOBS[def.job].name + '。' : ''), 'good');
  FX.push('build');
  return { ok: true, room: rm };
}

// ---------- 人物生成 ----------
const TRAITS = ['iq', 'eq', 'discipline', 'greed', 'courage', 'principle', 'resilience', 'social'];
const TRAIT_NAMES = { iq: '智力', eq: '情商', discipline: '自律', greed: '贪欲', courage: '胆量', principle: '原则性', resilience: '抗压', social: '社交' };
function makePerson(tplKey) {
  const tpl = tplKey ? D.TEMPLATES.find(t => t.key === tplKey) : wpick(D.TEMPLATES);
  const tr = {};
  for (const k of TRAITS) tr[k] = clamp(Math.round(52 + gauss() * 17 + ((tpl.bias && tpl.bias[k]) || 0)), 3, 98);
  const alien = !!tpl.alien;
  const fin = clamp(Math.round(45 + gauss() * 20 + (tpl.fin || 0)), 0, 100);
  const p = {
    name: alien ? pick(D.ALIEN_NAMES) : pick(D.SURNAMES) + pick(D.GIVEN),
    age: ri(tpl.age[0], tpl.age[1]), species: alien ? 'alien' : 'human', tpl: tpl.key, tplLabel: tpl.label,
    job: pick(tpl.jobs), bg: pick(tpl.bg), tr, fin,
    skills: {
      inspect: clamp(Math.round(tr.discipline * 0.45 + tr.courage * 0.3 + tr.principle * 0.25 + gauss() * 8), 5, 99),
      liaison: clamp(Math.round(tr.social * 0.5 + tr.discipline * 0.3 + tr.eq * 0.2 + gauss() * 8), 5, 99),
      relate: clamp(Math.round(tr.eq * 0.55 + tr.social * 0.45 + gauss() * 8), 5, 99),
    },
    hue: ri(0, 359),
  };
  p.expect = clamp(Math.round(70 + tr.iq * 0.15 + (100 - fin) * 0.25 + gauss() * 8), 55, 130);
  return p;
}
function newCitizen(tplKey) {
  const p = makePerson(tplKey), tpl = D.TEMPLATES.find(t => t.key === p.tpl);
  const c = Object.assign(p, {
    id: nid(), motive: pick(D.MOTIVES), aptW: {}, aptP: {}, prep: {}, rec: {}, mid: ['C03', 'C04', 'C05'],
    stress: clamp(Math.round(22 + gauss() * 10), 0, 100), patience: clamp(Math.round(62 + gauss() * 14 + (p.tr.resilience - 50) * 0.2), 20, 100),
    relation: 50, exp: [], status: 'home', plan: null, agent: 0, spawn: 0,
    registered: false, docs: { n: 0, pending: false, ok: false, name: '' }, booking: null, paper: 0, prepaid: false,
    study: null, tutorLeft: 0, strategy: '', examBonus: 0, books: {}, wantBook: null,
    reported: 0, license: false, licDay: 0, slot: 'none', slotDay: 0, pods: 0, annual: null,
    inv: [], beh: [], visitN: 0, firstDay: 0, lastVisit: 0, feeDay: 0, consultDay: 0, encDay: 0, lastCheck: 0, askDay: 0, staff: 0, note: '',
  });
  for (let i = c.mid.length - 1; i > 0; i--) { const j = ri(0, i); const t = c.mid[i]; c.mid[i] = c.mid[j]; c.mid[j] = t; }
  for (const co of D.COURSES) {
    const b = (tpl.apt && tpl.apt[co.id]) || 0;
    c.aptW[co.id] = clamp(Math.round(c.tr.iq * 0.7 + c.tr.discipline * 0.2 + 8 + b + gauss() * 7), 5, 99);
    c.aptP[co.id] = clamp(Math.round(c.tr.iq * 0.3 + c.tr.discipline * 0.3 + 26 + (tpl.hand || 0) + b * 0.6 + gauss() * 8), 5, 99);
    c.prep[co.id] = clamp(Math.round(24 + c.tr.discipline * 0.22 + gauss() * 7), 5, 60);
    c.rec[co.id] = { w: 'none', p: 'none', wScore: null, pScore: null, wFails: 0, pFails: 0, wTries: 0, pTries: 0, wEx: null, pEx: null, cert: false, certDay: 0, pet: false, hist: [] };
  }
  if (tpl.exp && chance(tpl.expP || 0)) c.exp = tpl.exp.slice();
  S.citizens.push(c); IDX.c.set(c.id, c);
  return c;
}
function beh(c, action, text, opt) {
  c.beh.push({ d: S.day, m: S.minute, a: action, t: text, hid: !!(opt && opt.hid), inv: (opt && opt.inv) || 0 });
}

// ---------- 个人账本 ----------
function invoice(c, item, cat, due, cost, room) {
  if (!(due > 0)) return null;
  const v = { id: nid(), d: S.day, m: S.minute, item, cat, due: Math.round(due), paid: 0, refund: 0, st: 'open', cost: cost || 0, room: room || '', vis: c.visitN, pd: 0, pm: 0, how: '', note: '' };
  c.inv.push(v);
  daily(S.day).due += v.due;
  return v;
}
function payInv(c, v, method) {
  if (!v || v.st !== 'open') return 0;
  v.st = 'paid'; v.paid = v.due; v.pd = S.day; v.pm = S.minute; v.how = method || '收费室';
  cashMove(v.cat, v.due, v.item, c.id);
  if (v.cat === 'written' || v.cat === 'practical') {
    S.stats.examFees += v.due;
    if (!S.stats.payers[c.id]) { S.stats.payers[c.id] = 1; S.stats.payerCount++; }
  }
  if (v.cat === 'consult') S.stats.consult += v.due;
  return v.due;
}
const openInvs = c => c.inv.filter(v => v.st === 'open');
function markEscaped(c, v, why) {
  if (v.st !== 'open') return;
  v.st = 'esc'; v.note = why || '';
  S.stats.escaped++; S.stats.escapedAmt += v.due; daily(S.day).esc += v.due;
}
function totals(c) {
  const t = { due: 0, paid: 0, refund: 0, net: 0, unpaid: 0, cost: 0, gross: 0, est: 0, byCat: {} };
  for (const v of c.inv) {
    t.due += v.due; t.paid += v.paid; t.refund += v.refund;
    if (v.st === 'esc' || v.st === 'open') t.unpaid += v.due - v.paid;
    if (v.st === 'paid' || v.st === 'esc') t.cost += v.cost;
    t.byCat[v.cat] = (t.byCat[v.cat] || 0) + v.paid;
  }
  t.net = t.paid - t.refund;
  t.gross = t.net - t.cost;
  const perVisit = S.stats.visits ? Math.round(S.stats.overhead / S.stats.visits) : 0;
  t.share = perVisit * c.visitN;
  t.est = t.gross - t.share;
  return t;
}

// ---------- 书店库存 ----------
function bookAllowed(sku) {
  const b = D.BOOKS[sku];
  return !!b && (!b.course || D.COURSE[b.course].level <= S.level);
}
function buyStock(sku, n) {
  const b = D.BOOKS[sku];
  n = Math.floor(n);
  if (!b || !(n > 0)) return { ok: false, msg: '无效的进货请求' };
  if (!hasRoom('bookstore')) return { ok: false, msg: '尚未建成书店' };
  if (!bookAllowed(sku)) return { ok: false, msg: '机构等级不足，未获该教材发行授权' };
  const cost = b.cost * n;
  if (S.cash < cost) return { ok: false, msg: '现金不足，需要 ' + cost };
  cashMove('stock', -cost, '进货 ' + b.name + ' ×' + n);
  S.stock[sku] = (S.stock[sku] || 0) + n;
  S.stockCost[sku] = (S.stockCost[sku] || 0) + cost;
  FX.push('cash');
  return { ok: true };
}
function recycleOld(sku) {
  const n = S.old[sku] || 0, b = D.BOOKS[sku];
  if (!n || !b) return { ok: false, msg: '没有可回收的旧版库存' };
  const back = Math.floor(b.cost * 0.2) * n;
  S.old[sku] = 0;
  cashMove('recycle', back, '回收旧版 ' + b.name + ' ×' + n);
  log('♻️ 回收旧版' + b.name + ' ' + n + ' 本，回款 ' + back + '。', 'info');
  return { ok: true, back };
}
