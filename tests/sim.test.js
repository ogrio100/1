// 无头验收测试：用例编号对应《商业游戏设计总案 V1.8》与《学制与考试体系 V2.4》的验收表
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSim } = require('./load');

function fresh(seed) {
  const IB = loadSim();
  IB.newState('测试局长', '测试中心', seed == null ? 11 : seed);
  return IB;
}
function runUntil(IB, pred, max) {
  let n = max || 540;
  while (n-- > 0 && !pred()) IB.tick();
  return pred();
}
// 一名守规矩、不逃单、材料齐全的考生
function mk(IB, opt) {
  const c = IB._.newCitizen('office');
  Object.assign(c.tr, { greed: 15, principle: 85, courage: 40, discipline: 60, resilience: 70 });
  c.fin = 30; c.registered = true; c.docs.ok = true; c.firstDay = IB.S.day; c.patience = 80; c.stress = 10;
  if (opt && opt.strong) for (const co of IB.D.COURSES) { c.aptW[co.id] = 99; c.aptP[co.id] = 99; c.prep[co.id] = 100; }
  if (opt && opt.weak) for (const co of IB.D.COURSES) { c.aptW[co.id] = 5; c.aptP[co.id] = 5; c.prep[co.id] = 0; }
  return c;
}
function visit(IB, c, type) {
  assert.equal(c.agent, 0, '上一次到访尚未结束');
  c.plan = { type, day: IB.S.day };
  IB._.spawnCitizen(c);
  const day = IB.S.day;
  assert.ok(runUntil(IB, () => !c.agent || IB.S.day !== day), '到访未在当日结束');
  assert.equal(IB.S.day, day, '到访被闭馆打断');
}
function hire(IB, job) {
  const s = IB._.addStaff(IB._.makePerson(), job, false, IB.D.JOBS[job].wage);
  s.quality = 75;
  IB._.deploy(s);
  return s;
}
// 预约后等到考试日并考完（成绩封存，尚未查分）
function sitExam(IB, c) {
  assert.ok(c.booking, '没有预约');
  const d = c.booking.day;
  while (IB.S.day < d) IB.runDays(1);
  assert.ok(runUntil(IB, () => c.paper && !c.agent, 540), '未能完成考试');
}
// 走完“预约→考试→发布→查分”一轮，返回试卷
function examRound(IB, c) {
  if (!c.paper) {
    if (!c.booking) { c.plan = null; visit(IB, c, 'book'); }
    sitExam(IB, c);
  }
  const p = IB.PAPER(c.paper);
  assert.ok(runUntil(IB, () => p.pub > 0, 540 * 6), '成绩未发布');
  if (IB.S.minute > 900) IB.runDays(1);
  if (c.agent) assert.ok(runUntil(IB, () => !c.agent));
  if (!p.chk) { c.plan = null; visit(IB, c, 'check'); }
  assert.ok(p.chk > 0, '未完成查分');
  if (c.agent) runUntil(IB, () => !c.agent);
  return p;
}
function certify(IB, c, course) {
  let guard = 6;
  while (!c.rec[course].cert && guard-- > 0) examRound(IB, c);
  assert.ok(c.rec[course].cert, course + ' 未取得认证');
}
const invs = (c, cat) => c.inv.filter(v => v.cat === cat);

// ---------------- V1.8 最低验收 ----------------
test('V18-01 同一人同日两次到访只产生一次 8 的基础办理费', () => {
  const IB = fresh(), c = mk(IB);
  visit(IB, c, 'book');
  c.plan = null;
  visit(IB, c, 'book');
  const fees = invs(c, 'visit').filter(v => v.d === IB.S.day);
  assert.equal(fees.length, 1);
  assert.equal(fees[0].due, 8);
});

test('V18-02 考试当日成绩不向界面展示', () => {
  const IB = fresh(), c = mk(IB, { strong: true });
  visit(IB, c, 'book');
  sitExam(IB, c);
  const p = IB.PAPER(c.paper), view = IB.examView(c, 'C01');
  assert.equal(p.sub, IB.S.day);
  assert.equal(p.pub, 0, '考试当日不得发布');
  assert.equal(c.rec.C01.wScore, null);
  assert.ok(!JSON.stringify(view).includes(String(p.score) + ' 分'));
  assert.match(view.w.text, /封存|待批|待发布/);
});

test('V18-03 成绩次日发布但本人 5 日后才来：期间学籍不自动变化', () => {
  const IB = fresh(), c = mk(IB, { strong: true });
  visit(IB, c, 'book');
  sitExam(IB, c);
  const p = IB.PAPER(c.paper), d0 = IB.S.day;
  IB.runDays(1);
  assert.equal(p.pub, d0 + 1, '应在次营业日发布');
  c.plan = { type: 'check', day: p.pub + 5 }; p.planned = p.pub + 5;
  IB.S.arr = IB.S.arr.filter(x => x.cid !== c.id);
  while (IB.S.day < p.pub + 5) {
    assert.equal(c.rec.C01.w, 'sat');
    assert.equal(c.rec.C01.wScore, null);
    assert.match(IB.examView(c, 'C01').w.text, /本人未查询/);
    assert.equal(IB.nextExam(c).kind, 'w', '未查分前不得进入实操');
    IB.runDays(1);
  }
  assert.ok(runUntil(IB, () => p.chk > 0), '第 5 日应返访查分');
  assert.equal(p.chk, p.pub + 5);
  assert.equal(c.rec.C01.w, 'pass');
  assert.equal(c.rec.C01.wScore, p.score);
});

test('V18-04 失败后重考仍按 35/25 标准价，无补考费单据', () => {
  const IB = fresh(), c = mk(IB, { weak: true });
  c.stress = 100;
  examRound(IB, c);
  assert.ok(['fail', 'booked'].includes(c.rec.C01.w));
  assert.equal(c.rec.C01.wFails, 1);
  if (!c.booking) { c.plan = null; c.tutorLeft = 0; visit(IB, c, 'book'); }
  const w = invs(c, 'written');
  assert.equal(w.length, 2);
  assert.ok(w.every(v => v.due === 35));
  assert.ok(c.inv.every(v => !/补考|附加|加价/.test(v.item)));
  // 实操同理
  const d = mk(IB, { strong: true });
  examRound(IB, d);
  for (const co of IB.D.COURSES) { d.aptP[co.id] = 5; d.prep[co.id] = 0; }
  d.stress = 100;
  examRound(IB, d);
  assert.equal(d.rec.C01.pFails, 1);
  assert.equal(d.rec.C01.w, 'pass');
  if (!d.booking) { d.plan = null; d.tutorLeft = 0; visit(IB, d, 'book'); }
  assert.deepEqual(invs(d, 'practical').map(v => v.due), [25, 25]);
});

test('V18-05 连续 3 天私教：每天一节 55，另计当日基础办理费 8', () => {
  const IB = fresh(), c = mk(IB);
  assert.ok(IB.buildRoom('tutoring', 4).ok);
  hire(IB, 'tutor');
  c.tutorLeft = 3;
  const days = [];
  for (let i = 0; i < 3; i++) {
    c.plan = null;
    visit(IB, c, 'tutor');
    days.push(IB.S.day);
    assert.equal(c.tutorLeft, 2 - i);
    IB.runDays(1);
    IB.S.arr = IB.S.arr.filter(x => x.cid !== c.id);
  }
  const t = invs(c, 'tutor');
  assert.deepEqual(t.map(v => v.due), [55, 55, 55]);
  assert.deepEqual(t.map(v => v.d), days);
  assert.ok(t.every(v => v.st === 'paid'));
  for (const d of days) assert.equal(invs(c, 'visit').filter(v => v.d === d).length, 1);
});

test('V18-06 / BK-02 年度换版在第 61 日而非第 13 日，旧库存转入旧版', () => {
  const IB = fresh();
  IB.runDays(12);
  assert.equal(IB.S.day, 13);
  assert.equal(IB.S.edition, 1);
  IB.runDays(47);
  assert.equal(IB.S.day, 60);
  assert.equal(IB.S.edition, 1);
  assert.ok(IB.buyStock('TC01', 10).ok);
  IB.runDays(1);
  assert.equal(IB.S.day, 61);
  assert.equal(IB.S.edition, 2);
  assert.equal(IB.S.stock.TC01, 0);
  assert.ok(IB.S.old.TC01 > 0);
  const cash = IB.S.cash, n = IB.S.old.TC01;
  assert.ok(IB.recycleOld('TC01').ok);
  assert.equal(IB.S.cash, cash + Math.floor(IB.D.BOOKS.TC01.cost * 0.2) * n);
});

test('V18-07 鼓励：同一人每日一次，全中心每日最多 3 次', () => {
  const IB = fresh(), cs = [mk(IB), mk(IB), mk(IB), mk(IB)];
  const p0 = cs[0].patience = 50;
  assert.ok(IB.encourage(cs[0].id, 'warm').ok);
  assert.equal(cs[0].patience, p0 + 11);
  assert.equal(IB.encourage(cs[0].id, 'listen').ok, false);
  assert.ok(IB.encourage(cs[1].id, 'persist').ok);
  assert.ok(IB.encourage(cs[2].id, 'listen').ok);
  assert.equal(IB.encourage(cs[3].id, 'warm').ok, false);
  assert.equal(IB.encourLeft(), 0);
  assert.equal(cs[0].inv.length, 0, '鼓励不收费');
  IB.runDays(1);
  assert.equal(IB.encourLeft(), 3);
  assert.ok(IB.encourage(cs[0].id, 'warm').ok);
});

test('V18-08 快进一个月逐日结算工资、维护、拨款与账单', () => {
  const IB = fresh();
  IB.runDays(5);
  assert.equal(IB.S.day, 6);
  for (let d = 1; d <= 5; d++) {
    const dd = IB.S.daily[d];
    assert.ok(dd.exp.wage < 0, '第' + d + '日应发工资');
    assert.ok(dd.exp.upkeep < 0, '第' + d + '日应付维护');
    assert.equal(dd.inc.grant, 1500);
    assert.ok(dd.vis > 0);
  }
  assert.equal(IB.S.cash, IB.D.START_CASH + IB.ledgerSum());
});

test('V18-09 / FIN-01 未缴离场后永不追缴', () => {
  const IB = fresh(), c = mk(IB);
  for (const s of IB.S.staff.slice()) if (s.job === 'inspector') IB._.removeStaff(s);
  c.visitN = 1;
  const a = IB._.invoice(c, '服务A', 'tutor', 25, 0, 'x'), b = IB._.invoice(c, '服务B', 'counsel', 15, 0, 'x');
  const cash = IB.S.cash;
  IB._.payInv(c, a, '收费室');
  IB._.gateCheck({ evade: true, bub: '' }, c);
  assert.equal(b.st, 'esc');
  let t = IB.totals(c);
  assert.deepEqual([t.due, t.paid, t.unpaid], [40, 25, 15]);
  assert.equal(IB.S.cash, cash + 25);
  // 之后正常到访、缴费、考试，都不会把 15 收回来
  visit(IB, c, 'book');
  IB.runDays(3);
  assert.equal(b.st, 'esc');
  assert.equal(b.paid, 0);
  t = IB.totals(c);
  assert.equal(t.unpaid, 15);
  assert.ok(t.due >= t.paid);
  assert.equal(IB.S.cash, IB.D.START_CASH + IB.ledgerSum());
});

test('V18-10 读档后保留待查分成绩与人员合同进度', () => {
  const IB = fresh(), c = mk(IB, { strong: true });
  visit(IB, c, 'book');
  sitExam(IB, c);
  const p = IB.PAPER(c.paper), insp = IB.S.staff.find(s => s.temp);
  const json = IB.serialize(), IB2 = loadSim();
  IB2.load(json);
  const c2 = IB2.C(c.id), p2 = IB2.PAPER(c2.paper), insp2 = IB2.S.staff.find(s => s.temp);
  assert.equal(p2.score, p.score);
  assert.equal(p2.chk, 0);
  assert.equal(c2.rec.C01.wScore, null);
  assert.equal(insp2.end, insp.end);
  assert.equal(insp2.cid, insp.cid);
  IB2.runDays(1);
  assert.equal(p2.score, p.score, '读档后不得重掷成绩');
});

// ---------------- 预约与学籍 ----------------
test('PR-01 第 1 日建档预约，最早第 2 营业日开考', () => {
  const IB = fresh(), c = mk(IB);
  visit(IB, c, 'book');
  assert.ok(c.booking.day >= 2);
  assert.equal(IB.S.day, 1);
  assert.equal(IB.S.stats.seatings, 0);
});

test('PR-02 / PR-03 六席不超卖；同场只有一个科目', () => {
  const IB = fresh(), list = [];
  for (let i = 0; i < 7; i++) { const c = mk(IB); list.push(c); assert.ok(IB._.reserve(c, 'C01', 'w')); }
  const k0 = list[0].booking.key;
  assert.equal(list.filter(c => c.booking.key === k0).length, 6);
  assert.notEqual(list[6].booking.key, k0);
  const other = mk(IB);
  other.rec.C01.cert = true;
  IB._.reserve(other, 'C02', 'w');
  const ses = IB.S.sessions[other.booking.key];
  assert.equal(ses.course, 'C02');
  assert.ok(ses.cids.every(id => IB.C(id).booking.course === 'C02'));
  for (const k in IB.S.sessions) assert.ok(IB.S.sessions[k].cids.length <= (IB.S.sessions[k].kind === 'w' ? 6 : 2));
});

test('PR-04 笔试经本人查分合格后才能预约实操', () => {
  const IB = fresh(), c = mk(IB, { strong: true });
  visit(IB, c, 'book');
  assert.equal(c.booking.kind, 'w');
  assert.equal(IB.canEnroll(c, 'C01', 'p'), false);
  sitExam(IB, c);
  assert.equal(IB.canEnroll(c, 'C01', 'p'), false, '未公布不得预约实操');
  assert.equal(IB._.bookExam(c), false);
  const p = examRound(IB, c);
  assert.ok(p.chk);
  assert.equal(IB.canEnroll(c, 'C01', 'p') || (c.booking && c.booking.kind === 'p'), true);
});

test('PR-05 实操失败只补实操，已合格笔试保留', () => {
  const IB = fresh(), c = mk(IB, { strong: true });
  examRound(IB, c);
  assert.equal(c.rec.C01.w, 'pass');
  const ws = c.rec.C01.wScore;
  for (const co of IB.D.COURSES) { c.aptP[co.id] = 5; c.prep[co.id] = 0; }
  c.stress = 100;
  examRound(IB, c);
  assert.equal(c.rec.C01.pFails, 1);
  assert.equal(c.rec.C01.w, 'pass');
  assert.equal(c.rec.C01.wScore, ws);
  assert.deepEqual(IB.nextExam(c), { course: 'C01', kind: 'p' });
  assert.equal(invs(c, 'written').length, 1);
});

test('PR-06 先修图：C01→C02→中段三科任意顺序→C06→C07', () => {
  const IB = fresh(), c = mk(IB);
  IB.S.level = 3;
  assert.equal(IB.canEnroll(c, 'C02'), false);
  assert.equal(IB.canEnroll(c, 'C01'), true);
  c.rec.C01.cert = true;
  assert.equal(IB.canEnroll(c, 'C02'), true);
  assert.equal(IB.canEnroll(c, 'C03'), false);
  c.rec.C02.cert = true;
  const first = c.mid[0], last = c.mid[2];
  assert.equal(IB.canEnroll(c, first), true);
  assert.equal(IB.canEnroll(c, 'C06'), false);
  assert.ok(IB.reorderMid(c.id, last, -1));
  assert.ok(IB.reorderMid(c.id, last, -1));
  assert.equal(IB.canEnroll(c, last), true, '中段三科可任意调整顺序');
  for (const m of c.mid) c.rec[m].cert = true;
  assert.equal(IB.canEnroll(c, 'C07'), false);
  assert.equal(IB.canEnroll(c, 'C06'), true);
  c.rec.C06.cert = true;
  assert.equal(IB.canEnroll(c, 'C07'), true);
  // 机构等级不足不可报
  IB.S.level = 2;
  assert.equal(IB.canEnroll(c, 'C07'), false);
});

test('PR-07 / EXM-03 七项齐全才上报，且只上报收费一次；许可由上级签发', () => {
  const IB = fresh(), c = mk(IB), d = mk(IB);
  IB.S.level = 3;
  assert.ok(IB.buildRoom('report', 4).ok);
  hire(IB, 'reporter');
  for (const co of IB.D.COURSES) { c.rec[co.id].cert = true; if (co.id !== 'C07') d.rec[co.id].cert = true; }
  visit(IB, d, 'report');
  assert.equal(d.reported, 0, '缺一项不得上报');
  assert.equal(invs(d, 'report').length, 0);
  visit(IB, c, 'report');
  assert.equal(c.reported, IB.S.day);
  assert.equal(c.license, false, '本中心不制证');
  c.plan = null;
  visit(IB, c, 'report');
  assert.deepEqual(invs(c, 'report').map(v => v.due), [20]);
  IB.runDays(1);
  assert.equal(c.license, true);
  assert.equal(c.slot, 'wait', '签发不等于名额');
  assert.equal(d.license, false);
  assert.equal(IB.S.stats.licenses, 1);
});

test('PR-08 没有阅卷员不能凭空公布成绩；有人阅卷后最早次营业日发布', () => {
  const IB = fresh(), c = mk(IB, { strong: true });
  const grader = IB.S.staff.find(s => s.job === 'grader');
  IB._.removeStaff(grader);
  visit(IB, c, 'book');
  sitExam(IB, c);
  const p = IB.PAPER(c.paper);
  IB.runDays(3);
  assert.equal(p.mk, 0);
  assert.equal(p.pub, 0);
  assert.equal(c.rec.C01.w, 'sat');
  hire(IB, 'grader');
  assert.ok(runUntil(IB, () => p.pub > 0, 540 * 2));
  assert.ok(p.pub > p.sub);
  assert.ok(p.mk > 0);
});

// ---------------- 书店 ----------------
test('BK-01 进货扣现金加库存，售书加现金减库存，零库存不卖', () => {
  const IB = fresh(), c = mk(IB), d = mk(IB);
  IB.S.stock.GC01 = 0; IB.S.stockCost.GC01 = 0;
  let cash = IB.S.cash;
  assert.equal(IB._.sellBook(c, 'GC01', false), null);
  assert.equal(IB.S.cash, cash);
  assert.ok(IB.buyStock('GC01', 10).ok);
  assert.equal(IB.S.cash, cash - 10 * IB.D.BOOKS.GC01.cost);
  assert.equal(IB.S.stock.GC01, 10);
  cash = IB.S.cash;
  const prep = c.prep.C01, v = IB._.sellBook(c, 'GC01', false);
  assert.equal(v.due, IB.D.BOOKS.GC01.price);
  assert.equal(v.cost, IB.D.BOOKS.GC01.cost);
  assert.equal(IB.S.cash, cash + v.due);
  assert.equal(IB.S.stock.GC01, 9);
  assert.equal(c.prep.C01, prep + 7);
  assert.equal(IB.buyStock('TC03', 10).ok, false, '一级中心无权采购二级科目教材');
  assert.equal(IB._.sellBook(d, 'TC03', false), null);
});

test('BK-03 不买书也能报考并通过', () => {
  const IB = fresh(), c = mk(IB, { strong: true });
  certify(IB, c, 'C01');
  assert.equal(invs(c, 'book').filter(v => v.d <= c.rec.C01.certDay && /再生生命/.test(v.item) && v.pd < c.rec.C01.certDay).length, 0);
  assert.equal(c.rec.C01.cert, true);
});

test('BK-04 同一考生同科同版同一本书不重复售卖；旧版须政策互认并明示', () => {
  const IB = fresh(), c = mk(IB);
  assert.ok(IB._.sellBook(c, 'TC01', false));
  const n = IB.S.stock.TC01;
  assert.equal(IB._.sellBook(c, 'TC01', false), null);
  assert.equal(IB.S.stock.TC01, n);
  IB._.yearRollover();
  assert.equal(IB._.sellBook(c, 'TC01', false), null, '未启用旧版互认时旧库存不售');
  IB.togglePolicy('oldEd');
  const d = mk(IB), v = IB._.sellBook(d, 'TC01', false);
  assert.match(v.item, /第1版·旧版互认折价/);
  assert.equal(v.due, Math.round(IB.D.BOOKS.TC01.price * 0.6));
});

// ---------------- 账本 ----------------
test('FIN-02 出口巡查员在离场线内拦下：当场结清，不记为追缴', () => {
  const IB = fresh(1), insp = IB.S.staff.find(s => s.job === 'inspector');
  assert.equal(IB._.gateInspector(), insp);
  let hit = 0, miss = 0;
  for (let i = 0; i < 40; i++) {
    const c = mk(IB);
    c.visitN = 1;
    const v = IB._.invoice(c, '服务', 'counsel', 15, 0, 'x'), cash = IB.S.cash;
    IB._.gateCheck({ evade: true, bub: '' }, c);
    if (v.st === 'paid') { hit++; assert.equal(IB.S.cash, cash + 15); assert.match(v.how, /离场前/); assert.equal(IB.totals(c).unpaid, 0); }
    else { miss++; assert.equal(v.st, 'esc'); assert.equal(IB.S.cash, cash); }
  }
  assert.ok(hit > miss);
  assert.ok(!IB.S.log.some(l => /追回|追缴成功/.test(l.t)));
  // FIN-03：改派考场巡查后出口无人拦截
  IB.setDuty(insp.id, 'exam');
  assert.equal(IB._.gateInspector(), null);
});

test('FIN-04 一张发票只确认一次支付（含读档重试）', () => {
  const IB = fresh(), c = mk(IB);
  const v = IB._.invoice(c, '服务', 'counsel', 15, 0, 'x'), cash = IB.S.cash;
  assert.equal(IB._.payInv(c, v, 'a'), 15);
  assert.equal(IB._.payInv(c, v, 'a'), 0);
  assert.equal(IB.S.cash, cash + 15);
  const IB2 = loadSim();
  IB2.load(IB.serialize());
  const c2 = IB2.C(c.id);
  assert.equal(IB2._.payInv(c2, c2.inv[0], 'a'), 0);
  assert.equal(IB2.S.cash, cash + 15);
});

test('FIN-05 个人账本公式：净实收=实缴-退费，毛贡献=净实收-直接成本', () => {
  const IB = fresh(), c = mk(IB);
  IB._.sellBook(c, 'TC01', false);
  IB._.invoice(c, '未付服务', 'counsel', 15, 0, 'x');
  const t = IB.totals(c), b = IB.D.BOOKS.TC01;
  assert.equal(t.due, b.price + 15);
  assert.equal(t.paid, b.price);
  assert.equal(t.net, t.paid - t.refund);
  assert.equal(t.cost, b.cost);
  assert.equal(t.gross, t.net - t.cost);
  assert.equal(t.unpaid, 15);
});

// ---------------- 免考与祈愿 ----------------
test('EXM-01 笔试实考合格 + 实操免考 = 当前认证完成，但不能跳过其他六门', () => {
  const IB = fresh(), c = mk(IB, { strong: true });
  examRound(IB, c);
  assert.equal(c.rec.C01.w, 'pass');
  const ex = IB._.grantExemption(c, 'C01', '测试');
  assert.equal(ex.kind, 'p');
  IB._.afterCert(c, 'C01', null);
  assert.equal(c.rec.C01.cert, true);
  assert.equal(c.rec.C01.pScore, null, '免考不得伪装成分数');
  assert.match(IB.examView(c, 'C01').p.text, /免考凭证/);
  assert.equal(IB.certCount(c), 1);
  assert.deepEqual(IB.nextExam(c), { course: 'C02', kind: 'w' });
  assert.equal(c.license, false);
});

test('EXM-02 / EXM-04 只有笔试免考仍须实考实操；每门最多一张免考', () => {
  const IB = fresh(), c = mk(IB);
  const ex = IB._.grantExemption(c, 'C01', '测试');
  assert.equal(ex.kind, 'w');
  assert.equal(c.rec.C01.cert, false);
  assert.deepEqual(IB.nextExam(c), { course: 'C01', kind: 'p' });
  assert.equal(IB._.grantExemption(c, 'C01', '再来一张'), null);
  assert.equal(c.rec.C01.pEx, null);
  assert.equal(IB.S.stats.exemptions, 1);
});

test('祈愿室：四种裁决都只影响单项，特别申诉费不保证合格', () => {
  const IB = fresh(), c = mk(IB, { weak: true });
  assert.ok(IB.buildRoom('petition', 4).ok);
  c.rec.C01.wFails = 2; c.rec.C01.w = 'fail';
  visit0(IB, c);
  assert.equal(IB.S.petitions.length, 1);
  const comp = IB.S.comp;
  const r = IB.petitionDecide(c.id, 'exempt');
  assert.ok(r.ok);
  assert.ok(c.rec.C01.wEx);
  assert.equal(c.rec.C01.cert, false, '另一项仍须实考');
  assert.equal(IB.S.comp, comp - 4);
  assert.equal(IB.petitionDecide(c.id, 'exempt').ok, false);
  function visit0(IB, c) {
    c.plan = { type: 'petition', day: IB.S.day };
    IB._.spawnCitizen(c);
    assert.ok(runUntil(IB, () => IB.S.petitions.length > 0, 200));
  }
  const d = mk(IB, { weak: true });
  d.rec.C01.wFails = 2; d.rec.C01.w = 'fail';
  visit0(IB, d);
  assert.ok(IB.petitionDecide(d.id, 'fee').ok);
  assert.ok(runUntil(IB, () => !d.agent));
  assert.deepEqual(invs(d, 'special').map(v => [v.due, v.st]), [[280, 'paid']]);
  assert.equal(d.rec.C01.cert, false);
  assert.equal(d.rec.C01.wEx, null);
  assert.equal(d.examBonus, 5);
});

// ---------------- 咨询 ----------------
test('CON-01 同日咨询只收一次 18', () => {
  const IB = fresh(), c = mk(IB);
  assert.equal(IB._.consultFee(c).due, 18);
  assert.equal(IB._.consultFee(c), null);
  assert.equal(invs(c, 'consult').length, 1);
});

test('CON-02 补件返访的真实咨询收 18；缺件次数有上限', () => {
  const IB = fresh(), c = mk(IB);
  c.docs = { n: 2, pending: true, ok: false, name: '《本人仍为本人声明书》' };
  visit(IB, c, 'docs');
  assert.deepEqual(invs(c, 'consult').map(v => [v.due, v.st]), [[18, 'paid']]);
  assert.equal(c.docs.ok, true, '缺件最多两次，第三次必须办结');
  assert.ok(c.booking, '补件完成后可正常报考');
});

test('CON-03 免费咨询政策：不收 18，仍可正常报考', () => {
  const IB = fresh(), c = mk(IB);
  IB.togglePolicy('freeConsult');
  c.docs = { n: 2, pending: true, ok: false, name: 'x' };
  visit(IB, c, 'docs');
  assert.equal(invs(c, 'consult').length, 0);
  assert.ok(c.booking);
});

// ---------------- 机构升级与上级 ----------------
function meetUpgrade(IB) {
  const st = IB.S.stats;
  st.payerCount = 6; st.examFees = 200; st.seatings = 3;
  IB.S.trust = 60; IB.S.comp = 70;
}
function addLiaison(IB) {
  assert.ok(IB.buildRoom('liaison', 5).ok);
  const c = mk(IB), s = IB._.addStaff(c, 'liaison', true, 90);
  c.staff = s.id; s.end = IB.S.day + 30;
  c.plan = { type: 'book', day: 999 };
  IB._.deploy(s);
  return s;
}

test('OFF-01 付费达标但无人真实到考：升级被拒并指出原因', () => {
  const IB = fresh();
  meetUpgrade(IB);
  IB.S.stats.seatings = 0;
  const cd = IB.upgradeConds();
  assert.equal(cd.ok, false);
  assert.equal(cd.items.find(i => i.k === 'seatings').ok, false);
  assert.match(cd.items.find(i => i.k === 'seatings').label, /真实到场考试/);
  assert.equal(IB.startUpgrade().ok, false);
  assert.equal(IB.S.level, 1);
});

test('OFF-02 首次升级教学：跑证→告知书→三证明→再跑证→上级到场复核后才升级', () => {
  const IB = fresh();
  meetUpgrade(IB);
  assert.equal(IB.startUpgrade().ok, false, '需要政务联络处');
  addLiaison(IB);
  assert.ok(IB.startUpgrade().ok);
  assert.equal(IB.S.level, 1, '申请不立即升级');
  assert.equal(IB.S.up.stage, 'pack');
  assert.ok(IB.sendLiaison().ok);
  IB.runDays(1);
  assert.equal(IB.S.up.stage, 'rejected', '教学关固定一次性退回');
  assert.equal(IB.sendLiaison().ok, false);
  for (let i = 0; i < 3; i++) assert.ok(IB.stampProof(i).ok);
  assert.equal(IB.S.up.stage, 'ready');
  assert.ok(IB.sendLiaison().ok);
  assert.equal(IB.bookAllowed('TC03'), false);
  let guard = 6;
  meetUpgrade(IB);
  while (IB.S.up.stage !== 'idle' && guard-- > 0) { IB.runToKey(1); meetUpgrade(IB); }
  assert.equal(IB.S.level, 2);
  assert.ok(IB.S.log.some(l => /上级复核员/.test(l.t)));
  assert.equal(IB.bookAllowed('TC03'), true, '教材授权随等级同步开放');
  assert.equal(IB.bookAllowed('TC06'), false);
  // 之后的升级不再重复教学
  IB.S.stats.payerCount = 18; IB.S.stats.examFees = 600; IB.S.stats.seatings = 12;
  assert.ok(IB.startUpgrade().ok);
  assert.equal(IB.S.up.stage, 'ready');
});

test('OFF-03 申请后信任下降：到场复核重新核验，不通过并给出原因', () => {
  const IB = fresh();
  meetUpgrade(IB);
  addLiaison(IB);
  IB.S.up.tut = true;
  assert.ok(IB.startUpgrade().ok);
  assert.ok(IB.sendLiaison().ok);
  let guard = 2000 * 6;
  while (IB.S.up.stage !== 'idle' && guard-- > 0) { IB.S.trust = 30; IB.tick(); }
  assert.equal(IB.S.up.stage, 'idle');
  assert.equal(IB.S.level, 1);
  assert.match(IB.S.up.last, /公众信任/);
});

test('上级例行审查：免考留档会被抽查，可撤销并退回重考', () => {
  const IB = fresh(3), c = mk(IB);
  c.rec.C01.w = 'pass'; c.rec.C01.wScore = 70;
  const ex = IB._.grantExemption(c, 'C01', '雇佣交换', true);
  IB._.afterCert(c, 'C01', null);
  assert.equal(c.rec.C01.cert, true);
  let n = 0;
  while (c.rec.C01.pEx && !ex.audited && n++ < 30) IB._.runAudit();
  if (!c.rec.C01.pEx) {
    assert.equal(c.rec.C01.cert, false);
    assert.deepEqual(IB.nextExam(c), { course: 'C01', kind: 'p' });
    assert.ok(IB.S.audits.some(a => a.fine >= 200));
  } else assert.equal(ex.audited, true);
  assert.equal(IB.S.cash, IB.D.START_CASH + IB.ledgerSum());
});

// ---------------- 命名 ----------------
test('NAME-01 昵称与中心名：长度截断、XSS 转义、可改名', () => {
  const IB = loadSim();
  IB.newState('<img src=x onerror=alert(1)>', '"><script>alert(2)</script>' + '很'.repeat(40), 5);
  assert.ok(IB.S.player.length <= 24);
  assert.ok(IB.S.center.length <= 28);
  const h = IB.esc(IB.S.player) + IB.esc(IB.S.center);
  assert.ok(!/[<>"]/.test(h));
  assert.match(IB.esc('<b>&"\''), /^&lt;b&gt;&amp;&quot;&#39;$/);
  IB.rename('新局长', '新中心');
  assert.equal(IB.S.player, '新局长');
  IB.newState('', '', 5);
  assert.equal(IB.S.player, '无名局长');
  assert.ok(IB.S.log[0].t.includes(IB.S.center));
});

// ---------------- 员工 ----------------
test('STF-01 巡查/外联/关系岗只能是临时合同，期满离岗', () => {
  const IB = fresh();
  for (const job of ['inspector', 'liaison', 'relations']) assert.equal(IB.applyFormal(job).ok, false);
  const c = mk(IB);
  c.expect = 60;
  let r = IB.offerTemp(c.id, 'cashier', 100, 5, false);
  assert.equal(r.ok, false);
  r = IB.offerTemp(c.id, 'inspector', 200, 3, false);
  assert.ok(r.ok);
  if (!r.accepted) return;
  const s = r.staff;
  assert.equal(s.temp, true);
  assert.equal(c.staff, s.id);
  assert.equal(s.end, IB.S.day + 2);
  const rec = JSON.stringify(c.rec);
  IB.runDays(1);
  assert.equal(JSON.stringify(c.rec), rec, 'EDU-HIRE-01 签约不改变学籍');
  IB.runDays(2);
  assert.equal(IB.St(s.id), undefined, '合同期满离岗');
  assert.equal(c.staff, 0);
  assert.equal(c.inv.length, 0, '上班不收到访费，工资不抵扣个人账单');
});

test('STF-01b 正式编制：次营业日答复，接收后入职，上限受等级约束', () => {
  const IB = fresh();
  assert.ok(IB.applyFormal('cashier').ok);
  assert.equal(IB.S.apps[0].cand, null);
  IB.runDays(1);
  const ap = IB.S.apps[0];
  assert.ok(ap.cand, '次营业日答复');
  const cash = IB.S.cash, r = IB.acceptCandidate(ap.id);
  assert.ok(r.ok);
  assert.equal(IB.S.cash, cash - 250);
  assert.equal(r.staff.temp, false);
  assert.equal(IB.Rm(r.staff.room).type, 'cashier');
  IB.applyFormal('grader'); IB.applyFormal('grader');
  assert.equal(IB.applyFormal('grader').ok, false, '一级编制上限 10');
});

test('STF-02 正式员工满意度为 0 也不离职', () => {
  const IB = fresh(), s = IB.S.staff.find(x => x.job === 'cashier');
  for (let i = 0; i < 8; i++) { s.sat = 0; IB.runDays(1); }
  assert.ok(IB.St(s.id));
  assert.ok(IB.staffEff({ ...s, sat: 10 }) < IB.staffEff({ ...s, sat: 60 }), '低满意度怠工');
});

test('STF-03 临时工连续两日满意度低于 20 会离职，岗位空缺', () => {
  const IB = fresh(), s = IB.S.staff.find(x => x.temp);
  s.wage = 40; s.sat = 5; s.end = 99;
  IB.runDays(2);
  assert.equal(IB.St(s.id), undefined);
  assert.equal(IB._.gateInspector(), null);
  assert.ok(IB.S.log.some(l => /主动离职/.test(l.t)));
});

test('STF-04 轮班休息真实离岗；奖金同日只生效一次', () => {
  const IB = fresh(), s = IB.S.staff.find(x => x.job === 'cashier');
  const cash = IB.S.cash, sat = s.sat;
  assert.ok(IB.bonus(s.id).ok);
  assert.equal(IB.bonus(s.id).ok, false);
  assert.equal(IB.S.cash, cash - 60);
  assert.equal(s.sat, sat + 12);
  let rested = false;
  runUntil(IB, () => { if (s.st === 'rest') rested = true; return IB.S.minute >= 800; }, 400);
  assert.ok(rested, '员工应在休息时段离岗');
  assert.equal(s.st, 'post');
});

test('EDU-BRB-01 无动机或五格内有人时不会凭空生成红包', () => {
  const IB = fresh(), c = mk(IB), s = IB.S.staff.find(x => x.job === 'reviewer');
  const a = { id: -1, x: 30, y: 17 };
  IB.S.agents.length = 0;
  c.docs.pending = true; c.docs.n = 1;
  assert.equal(IB.bribeEligible(c, s, a).ok, false, '守规矩的人没有动机');
  Object.assign(c.tr, { principle: 20, courage: 80 });
  s.tr.greed = 20; s.tr.principle = 80; s.sat = 60;
  assert.equal(IB.bribeEligible(c, s, a).ok, false, '对象不受诱惑');
  s.tr.greed = 80; s.tr.principle = 20;
  assert.equal(IB.bribeEligible(c, s, a).ok, true);
  IB.S.agents.push({ id: -2, x: 34, y: 14 });
  assert.equal(IB.bribeEligible(c, s, a).why, '五格内有其他人');
  IB.S.agents.pop();
  IB.S.agents.push({ id: -3, x: 36.5, y: 17 });
  assert.equal(IB.bribeEligible(c, s, a).ok, true, '六格外不算目击');
});

test('EDU-HIRE-02 免考换工只给单项，且高原则者会拒绝并举报', () => {
  const IB = fresh(), c = mk(IB);
  c.tr.principle = 30; c.expect = 60; c.fin = 90;
  const r = IB.offerTemp(c.id, 'inspector', 200, 3, true);
  if (r.accepted) {
    assert.ok(c.rec.C01.wEx && c.rec.C01.wEx.swap);
    assert.equal(c.rec.C01.pEx, null);
    assert.equal(c.rec.C01.cert, false);
    assert.equal(IB.certCount(c), 0);
  }
  const d = mk(IB), comp = IB.S.comp;
  d.tr.principle = 90;
  const r2 = IB.offerTemp(d.id, 'inspector', 200, 3, true);
  assert.equal(r2.accepted, false);
  assert.equal(IB.S.comp, comp - 5);
  assert.equal(d.rec.C01.wEx, null);
});

// ---------------- 取消场次 ----------------
test('中心原因取消场次：免费顺延，不重复收报名费', () => {
  const IB = fresh(), c = mk(IB, { strong: true });
  visit(IB, c, 'book');
  const day = c.booking.day;
  for (const s of IB.S.staff.slice()) if (s.job === 'proctor') IB._.removeStaff(s);
  while (IB.S.day < day) IB.runDays(1);
  assert.ok(runUntil(IB, () => IB.S.stats.cancelled > 0, 540));
  assert.ok((c.booking && c.booking.day > day) || c.prepaid, '应自动顺延或保留已缴报名费');
  assert.equal(invs(c, 'written').length, 1);
  hire(IB, 'proctor');
  if (!c.booking) {
    runUntil(IB, () => !c.agent);
    c.plan = null;
    visit(IB, c, 'book');
    assert.equal(c.prepaid, false);
  }
  sitExam(IB, c);
  assert.equal(invs(c, 'written').length, 1, '顺延后不再收第二次报名费');
});

// ---------------- 存档 ----------------
test('SAVE-01 存档→读档→继续模拟：状态一致且确定', () => {
  const IB = fresh(21);
  IB.togglePolicy('freeConsult');
  IB.runDays(6);
  for (let i = 0; i < 137; i++) IB.tick();
  const json = IB.serialize();
  const IB2 = loadSim();
  IB2.load(json);
  assert.equal(IB2.S.player, '测试局长');
  assert.equal(IB2.S.policies.freeConsult, true);
  assert.equal(IB2.serialize(), json);
  IB.runDays(4); IB2.runDays(4);
  assert.equal(IB2.serialize(), IB.serialize());
  assert.throws(() => IB2.load('{"app":"x"}'));
  assert.throws(() => IB2.load(JSON.stringify({ app: 'immortality-bureau', v: '0.7', S: { citizens: [], rooms: [] } })), /不兼容/);
});

// ---------------- 长跑 ----------------
function invariants(IB) {
  const S = IB.S;
  assert.equal(S.cash, IB.D.START_CASH + IB.ledgerSum(), '现金必须等于期初加账本合计');
  for (const k in S.sessions) { const ses = S.sessions[k]; assert.ok(ses.cids.length <= (ses.kind === 'w' ? 6 : 2), '场次超卖'); }
  for (const c of S.citizens) {
    const t = IB.totals(c);
    assert.ok(t.due >= t.paid, '应缴不得小于实缴');
    assert.equal(t.due - t.paid, t.unpaid + c.inv.filter(v => v.st === 'paid').reduce((n, v) => n + v.due - v.paid, 0));
    const perDay = {};
    for (const v of c.inv) {
      assert.ok(!/补考/.test(v.item));
      if (v.cat === 'visit') { perDay[v.d] = (perDay[v.d] || 0) + 1; assert.equal(v.due, 8); }
      if (v.cat === 'written') assert.equal(v.due, 35);
      if (v.cat === 'practical') assert.equal(v.due, 25);
    }
    for (const d in perDay) assert.equal(perDay[d], 1, c.name + ' 第' + d + '日基础办理费重复');
    assert.ok(invs(c, 'report').length <= 1);
    for (const co of IB.D.COURSES) {
      const r = c.rec[co.id];
      assert.ok(!(r.wEx && r.pEx), '每门最多一张免考');
      if (r.cert) assert.ok((r.w === 'pass' || r.wEx) && (r.p === 'pass' || r.p === 'equiv' || r.pEx));
      if (co.level > S.level) assert.ok(r.w === 'none' && r.p === 'none', '超出机构等级的科目不得开考');
    }
    if (c.license) assert.equal(IB.certCount(c), 7);
    // 非终止状态必须有下一步或明确的等待原因
    if (!c.agent) assert.ok(c.plan || c.note || c.booking, c.name + ' 处于无计划、无说明的软锁状态');
    if (c.plan) assert.ok(c.plan.day >= S.day, c.name + ' 的计划已过期');
  }
}

test('FLOW-01 连续运行 25 营业日（3 个种子）：无软锁、无重复发证、账实相符', () => {
  for (const seed of [1, 2, 3]) {
    const IB = fresh(seed);
    for (let d = 0; d < 25; d++) { IB.runDays(1); invariants(IB); }
    assert.ok(IB.S.stats.certs > 0);
    assert.ok(IB.S.stats.seatings > 20);
  }
});

test('FLOW-02 全流程：三级中心 + 全部房间，跑满两年出现电子许可与修复舱服务', () => {
  const IB = fresh(9), S = IB.S;
  S.level = 3;
  IB._.cashMove('grant', 54000, '测试注资');
  const plan = [['written', 10], ['written', 11], ['practical', 12], ['practical', 13], ['grading', 14], ['tutoring', 4], ['counsel', 5], ['petition', 15], ['report', 16], ['pod', 17]];
  for (const [t, lot] of plan) assert.ok(IB.buildRoom(t, lot).ok, t);
  for (const job of ['proctor', 'proctor', 'examiner', 'examiner', 'grader', 'tutor', 'counselor', 'reporter', 'medic', 'cashier', 'receptionist']) hire(IB, job);
  for (const co of IB.D.COURSES) { IB.buyStock('T' + co.id, 30); IB.buyStock('G' + co.id, 30); }
  IB.togglePolicy('expRecog');
  for (let d = 0; d < 120; d++) {
    const d0 = S.day;
    while (S.day === d0) {
      IB.tick();
      while (S.petitions.length) IB.petitionDecide(S.petitions[0].cid, ['exempt', 'ignore', 'fee', 'volunteer'][d % 4]);
    }
    for (const s of S.staff) if (s.temp && s.end - S.day < 2) s.end += 10;
    if (d % 10 === 0) invariants(IB);
  }
  invariants(IB);
  assert.ok(S.stats.licenses > 0, '应有人走完七证并获得上级电子许可');
  assert.ok(S.citizens.some(c => c.pods > 0), '应有已激活者使用修复舱');
  assert.ok(S.citizens.every(c => !c.pods || (c.license && c.slot === 'active')));
  assert.ok(S.edition >= 2);
  assert.ok(S.stats.exemptions > 0);
});
