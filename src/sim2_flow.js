// ===== 模拟内核 2：学籍、到访状态机、考试预约/开考/阅卷/发布、查分与复习抉择 =====
const courseOrder = c => ['C01', 'C02'].concat(c.mid, ['C06', 'C07']);
const wDone = rec => rec.w === 'pass' || !!rec.wEx;
const pDone = rec => rec.p === 'pass' || rec.p === 'equiv' || !!rec.pEx;
function curCourse(c) {
  for (const id of courseOrder(c)) if (!c.rec[id].cert) return id;
  return null;
}
function nextExam(c) {
  const id = curCourse(c);
  if (!id) return null;
  const r = c.rec[id];
  if (!wDone(r)) return { course: id, kind: 'w' };
  if (!pDone(r)) return { course: id, kind: 'p' };
  return null;
}
function canEnroll(c, course, kind) {
  const ne = nextExam(c);
  if (!ne || ne.course !== course) return false;
  if (kind && ne.kind !== kind) return false;
  return D.COURSE[course].level <= S.level;
}
const certCount = c => D.COURSES.reduce((n, co) => n + (c.rec[co.id].cert ? 1 : 0), 0);
function reorderMid(cid, course, dir) {
  const c = C(cid);
  if (!c) return false;
  const i = c.mid.indexOf(course), j = i + dir;
  if (i < 0 || j < 0 || j >= c.mid.length) return false;
  const free = id => { const r = c.rec[id]; return r.w === 'none' && r.p === 'none' && !r.cert && !r.wEx && !r.pEx; };
  if (!free(c.mid[i]) || !free(c.mid[j])) return false;
  const t = c.mid[i]; c.mid[i] = c.mid[j]; c.mid[j] = t;
  beh(c, '调整顺序', '局长调整中段三科报考顺序：' + c.mid.map(x => D.COURSE[x].short).join(' → '));
  return true;
}

// ---------- 成绩模型与“估计通过率” ----------
const EXAM_SD = 8;
function examMean(c, course, kind) {
  const co = D.COURSE[course];
  const apt = kind === 'w' ? c.aptW[course] : c.aptP[course];
  let m = 37 + 0.3 * apt + 0.34 * (c.prep[course] || 0) - 0.12 * c.stress - co.diff;
  if (kind === 'p') m += 4;
  if (kind === 'p' && c.species === 'alien' && co.alienPen && !S.policies.alienEquiv) m -= co.alienPen;
  return m + (c.examBonus || 0);
}
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
function estPass(c, course, kind) {
  const co = D.COURSE[course], line = kind === 'w' ? co.wLine : co.pLine;
  const p = 1 - phi((line - 0.5 - examMean(c, course, kind)) / EXAM_SD);
  return clamp(Math.round(p * 20) * 5, 5, 95);
}
function studyRate(c) { return clamp(Math.round(3 + c.tr.discipline / 22), 3, 8); }

// 面向界面的学籍视图：未经本人查分的成绩绝不出现在返回值中
function examView(c, course) {
  const rec = c.rec[course], co = D.COURSE[course];
  const one = kind => {
    const stt = rec[kind], ex = kind === 'w' ? rec.wEx : rec.pEx, score = kind === 'w' ? rec.wScore : rec.pScore;
    const paper = c.paper ? PAPER(c.paper) : null;
    const pend = paper && paper.course === course && paper.kind === kind ? paper : null;
    let text = '未报考', cls = '';
    if (ex) { text = '免考凭证（' + dateStr(ex.day) + ' · ' + ex.by + '签发）'; cls = 'ex'; }
    else if (stt === 'equiv') { text = '经验等效认定'; cls = 'ok'; }
    else if (stt === 'pass') { text = '实考合格 ' + score + ' 分'; cls = 'ok'; }
    else if (pend) { text = pend.pub ? '成绩已发布，本人未查询' : (pend.mk ? '已阅卷封存，待发布' : '封存 / 待批'); cls = 'seal'; }
    else if (stt === 'booked' && c.booking) { text = '已预约 ' + dateStr(c.booking.day) + ' ' + timeStr(c.booking.kind === 'w' ? D.W_SLOTS[c.booking.slot] : D.P_SLOTS[c.booking.slot]); cls = 'bk'; }
    else if (stt === 'fail') { text = '未通过（最近 ' + (score == null ? '—' : score) + ' 分）'; cls = 'bad'; }
    return { text, cls, fails: kind === 'w' ? rec.wFails : rec.pFails, line: kind === 'w' ? co.wLine : co.pLine, done: kind === 'w' ? wDone(rec) : pDone(rec) };
  };
  return { w: one('w'), p: one('p'), cert: rec.cert, certDay: rec.certDay };
}

// ---------- 预约 ----------
function findWritten(course, fromDay) {
  const halls = roomsOf('written');
  for (let d = fromDay; d < fromDay + 40; d++) for (let s = 0; s < D.W_SLOTS.length; s++) for (const rm of halls) {
    const key = 'w' + d + ':' + s + ':' + rm.id;
    let ses = S.sessions[key];
    if (ses && (ses.st !== 'open' || ses.course !== course || ses.cids.length >= D.W_SEATS)) continue;
    if (!ses) ses = S.sessions[key] = { key, kind: 'w', day: d, slot: s, room: rm.id, course, cids: [], att: [], st: 'open', t0: 0 };
    return ses;
  }
  return null;
}
function findPractical(fromDay) {
  const rooms = roomsOf('practical');
  for (let d = fromDay; d < fromDay + 40; d++) for (let s = 0; s < D.P_SLOTS.length; s++) for (const rm of rooms) {
    const key = 'p' + d + ':' + s + ':' + rm.id;
    let ses = S.sessions[key];
    if (ses && (ses.st !== 'open' || ses.cids.length >= D.P_STATIONS)) continue;
    if (!ses) ses = S.sessions[key] = { key, kind: 'p', day: d, slot: s, room: rm.id, course: '', cids: [], att: [], st: 'open', t0: 0 };
    return ses;
  }
  return null;
}
// 预约至少提前一个营业日；一个人同一时间只持有一个预约
function reserve(c, course, kind) {
  if (c.booking) return null;
  const ses = kind === 'w' ? findWritten(course, S.day + 1) : findPractical(S.day + 1);
  if (!ses) return null;
  ses.cids.push(c.id);
  c.booking = { kind, course, day: ses.day, slot: ses.slot, room: ses.room, key: ses.key };
  c.rec[course][kind] = 'booked';
  return c.booking;
}
function bookExam(c) {
  const ne = nextExam(c);
  if (!ne || c.booking || c.paper) return false;
  const co = D.COURSE[ne.course];
  if (co.level > S.level) { beh(c, '等待资质', '本中心尚无「' + co.short + '」考试授权，回家等待中心升级'); return false; }
  const bk = reserve(c, ne.course, ne.kind);
  if (!bk) {
    beh(c, '预约失败', '中心暂无可用的' + (ne.kind === 'w' ? '笔试厅' : '实操室') + '，未收费');
    log('⚠️ ' + c.name + ' 无法预约' + (ne.kind === 'w' ? '笔试：缺少笔试厅' : '实操：缺少实操室') + '。', 'bad');
    return false;
  }
  const rec = c.rec[ne.course], nth = (ne.kind === 'w' ? rec.wTries : rec.pTries) + 1;
  if (c.prepaid) c.prepaid = false;
  else invoice(c, co.short + '·' + (ne.kind === 'w' ? '笔试' : '实操') + '普通报名费（第' + nth + '次，统一标准价）', ne.kind === 'w' ? 'written' : 'practical', ne.kind === 'w' ? D.FEES.written : D.FEES.practical, D.COSTS.paper, 'cashier');
  beh(c, '预约', '预约「' + co.short + '」' + (ne.kind === 'w' ? '笔试' : '实操') + '：' + dateStr(bk.day) + ' ' + timeStr(ne.kind === 'w' ? D.W_SLOTS[bk.slot] : D.P_SLOTS[bk.slot]));
  return true;
}

// ---------- 到访收费 ----------
function visitFee(c, room) {
  if (c.feeDay === S.day) return null;
  c.feeDay = S.day;
  return invoice(c, '到访基础办理服务费', 'visit', D.FEES.visit, 0, room);
}
function consultFee(c) {
  if (c.consultDay === S.day) return null;
  c.consultDay = S.day;
  if (S.policies.freeConsult) { beh(c, '咨询', '缺件个性化指导（免费咨询试点，未收费）'); return null; }
  const v = invoice(c, '缺件个性化咨询服务', 'consult', D.FEES.consult, 0, 'review');
  beh(c, '咨询', '接受缺件个性化咨询，应缴 ' + D.FEES.consult, { inv: v.id });
  return v;
}
function isEvader(c) { return c.tr.greed > 55 && c.tr.principle < 48 && (c.fin > 55 || c.tr.courage > 62); }

// ---------- 到访生成 ----------
const STEP = {
  reg: { rt: 'reception', dur: 8 }, check: { rt: 'reception', dur: 6 }, review: { rt: 'review', dur: 10 }, cashier: { rt: 'cashier', dur: 5 },
  bookstore: { rt: 'bookstore', dur: 6, opt: 30 }, tutor: { rt: 'tutoring', dur: 45 }, counsel: { rt: 'counsel', dur: 30, opt: 60 },
  report: { rt: 'report', dur: 10 }, pod: { rt: 'pod', dur: 40 }, petition: { rt: 'petition' },
};
function stepsFor(c, type, a) {
  switch (type) {
    case 'register': return ['reg', 'review', 'cashier'];
    case 'docs': return ['review', 'cashier'];
    case 'examW': return ['examW'];
    case 'examP': return ['examP'];
    case 'check': return ['check'];
    case 'book': a.book = true; if (c.wantBook) { a.buy = c.wantBook; c.wantBook = null; return ['bookstore', 'cashier']; } return ['cashier'];
    default: return [type];
  }
}
function spawnCitizen(c) {
  const type = c.plan.type;
  const a = { id: nid(), k: 'cit', cid: c.id, x: OUTSIDE.x, y: OUTSIDE.y, px: OUTSIDE.x, py: OUTSIDE.y, path: [], place: OUTSIDE, st: 'idle', steps: [], si: -1,
    room: 0, staff: 0, wait: 0, tw: 0, svc: 0, evade: false, book: false, buy: null, type, bub: '', paid: false, gated: false };
  a.steps = stepsFor(c, type, a);
  a.evade = isEvader(c) && chance(0.6);
  c.plan = null; c.status = 'visit'; c.agent = a.id; c.visitN++; c.lastVisit = S.day; c.note = '';
  if (!c.firstDay) c.firstDay = S.day;
  if (c.paused) { c.paused = false; c.patience = Math.max(c.patience, 42); }
  S.stats.visits++; daily(S.day).vis++;
  S.agents.push(a); IDX.a.set(a.id, a);
  beh(c, '到访', '到访中心：' + D.VISIT_NAMES[type]);
  nextStep(a);
}
function pickRoom(type) {
  let best = null, bs = 1e9;
  for (const rm of S.rooms) {
    if (rm.type !== type) continue;
    const sc = rm.q.length - (S.staff.some(s => s.room === rm.id && present(s)) ? 0.5 : 0);
    if (sc < bs) { bs = sc; best = rm; }
  }
  return best;
}
function nextStep(a) {
  const c = C(a.cid);
  a.si++; a.svc = 0; a.wait = 0; a.staff = 0; a.bub = '';
  if (a.si >= a.steps.length) {
    if (openInvs(c).length && !a.evade && !a.paid) { a.paid = true; a.steps.push('cashier'); }
    else return leave(a);
  }
  const step = a.steps[a.si];
  if (step === 'examW' || step === 'examP') return goExam(a, c);
  const rm = pickRoom(STEP[step].rt);
  if (!rm) { onNoRoom(c, step); return nextStep(a); }
  a.room = rm.id; a.st = 'walk';
  setDest(a, { r: rm.id, lx: 3, ld: 0.5 });
}
function onNoRoom(c, step) {
  if (step === 'tutor') { c.tutorLeft = 0; beh(c, '私教取消', '中心没有私教室，改为居家免费复习'); c.study = { until: S.day + 2, rate: studyRate(c) }; }
  else if (step === 'report') beh(c, '上报未果', '中心尚未建成资格汇总与上报处');
  else if (step === 'pod') beh(c, '维护未果', '中心尚无修复舱');
}
function goExam(a, c) {
  const bk = c.booking, ses = bk && S.sessions[bk.key];
  if (!bk || bk.day !== S.day || !ses || ses.st === 'done' || ses.st === 'cancel' || !Rm(bk.room)) return nextStep(a);
  const i = ses.cids.indexOf(c.id), spot = bk.kind === 'w' ? SEATS[i] : STATIONS[i];
  a.room = bk.room; a.st = 'toSeat'; a.bub = '🪪';
  setDest(a, { r: bk.room, lx: spot[0], ld: spot[1] });
}
function requeue(rm) {
  rm.q.forEach((aid, k) => {
    const a = A(aid);
    if (a && a.st === 'q') setDest(a, qPlace(rm, k));
  });
}
function dropFromQueue(a) {
  const rm = Rm(a.room);
  if (!rm) return;
  const i = rm.q.indexOf(a.id);
  if (i >= 0) { rm.q.splice(i, 1); requeue(rm); }
}
function leave(a) {
  a.st = 'leave'; a.room = 0; a.bub = '';
  setDest(a, OUTSIDE);
}
function removeAgent(a) {
  if (a.staff) { const s = St(a.staff); if (s && s.busy === a.id) s.busy = 0; }
  dropFromQueue(a);
  const i = S.agents.indexOf(a);
  if (i >= 0) S.agents.splice(i, 1);
  IDX.a.delete(a.id);
}

// ---------- 出口：离场前结算或逃单（成功离场后永不追缴） ----------
function gateInspector() {
  for (const s of S.staff) {
    if (s.job !== 'inspector' || s.duty !== 'gate' || s.st !== 'post') continue;
    const ag = A(s.agent);
    if (ag && !ag.off && ag.x < HALL_W + 0.5 && Math.abs(ag.y - MAP.gateY) < 4) return s;
  }
  return null;
}
function gateWhy() {
  const ins = S.staff.filter(s => s.job === 'inspector');
  if (!ins.length) return '本中心没有巡查员';
  const g = ins.filter(s => s.duty === 'gate');
  if (!g.length) return '巡查员未被指派大门稽核';
  if (g.some(s => s.st === 'rest' || s.st === 'toRest' || s.st === 'toPost')) return '守门巡查员休息中';
  if (g.some(s => s.st === 'leave' || s.st === 'away')) return '守门巡查员今日不在岗';
  return '守门巡查员未能及时发现';
}
function gateCheck(a, c) {
  a.gated = true;
  const opens = openInvs(c);
  if (!opens.length) return;
  const sum = opens.reduce((n, v) => n + v.due, 0);
  const s = gateInspector();
  if (s && chance(0.85)) {
    for (const v of opens) payInv(c, v, '大门稽核·离场前当场结清');
    S.stats.intercepted++; s.caught = (s.caught || 0) + 1;
    beh(c, '当场结清', '离场前被巡查员 ' + s.name + ' 在出口线内拦下，当场结清 ' + sum);
    log('🛡 ' + s.name + ' 在出口线内拦下 ' + c.name + '，当场结清 ' + sum + '（离场前结算，不是追缴）。', 'good');
    FX.push('cash');
    return;
  }
  const why = a.evade ? gateWhy() : '收费窗口无人，未能结清';
  for (const v of opens) markEscaped(c, v, why);
  a.bub = '💨';
  beh(c, '逃单离场', '未结清 ' + sum + ' 离场（' + why + '）；已跨过离场线，不追缴');
  log('💨 ' + c.name + ' 带着未缴 ' + sum + ' 离场（' + why + '）。该欠款只留档，不追缴。', 'bad');
  FX.push('alert');
}
function finalize(a, c) {
  if (a.tw > 60) addTrust(-0.4); else if (a.tw > 35) addTrust(-0.15); else if (a.tw < 10) addTrust(0.02);
  removeAgent(a);
  c.agent = 0;
  if (c.status === 'visit') c.status = 'home';
  autoPlan(c);
}

// ---------- 离馆后的下一步（兜底规划，幂等） ----------
function autoPlan(c) {
  if (c.plan || c.agent) return;
  if (c.status === 'waitLevel') c.status = 'home';
  c.note = '';
  if (!c.registered) { c.plan = { type: 'register', day: S.day + 1 }; return; }
  if (c.docs.pending) { c.plan = { type: 'docs', day: S.day + 2 }; return; }
  if (!c.docs.ok) { c.plan = { type: 'docs', day: S.day + 1 }; return; }
  if (c.booking) { c.plan = { type: c.booking.kind === 'w' ? 'examW' : 'examP', day: c.booking.day }; return; }
  if (c.paper) {
    const p = PAPER(c.paper);
    if (p && p.pub) c.plan = { type: 'check', day: Math.max(S.day + 1, p.planned) };
    else c.note = '等待阅卷与成绩发布';
    return;
  }
  if (c.tutorLeft > 0) { c.plan = { type: 'tutor', day: S.day + 1 }; return; }
  if (c.license) {
    if (c.slot === 'active') {
      if (staffed('pod')) c.plan = { type: 'pod', day: S.day + ri(6, 10) };
      else c.note = '名额已激活，等待中心开放修复舱';
    } else c.note = '公开候补生命维护名额';
    return;
  }
  if (c.reported) { c.note = '等待上级系统电子回执'; return; }
  const ne = nextExam(c);
  if (!ne) {
    if (hasRoom('report')) c.plan = { type: 'report', day: S.day + ri(1, 2) };
    else c.note = '七项认证齐全，等待中心建成资格汇总与上报处';
    return;
  }
  if (D.COURSE[ne.course].level > S.level) { c.status = 'waitLevel'; c.note = '等待中心课程资质（' + D.COURSE[ne.course].short + '）'; return; }
  if (ne.kind === 'p' && !hasRoom('practical')) { c.note = '等待中心建成实操室'; return; }
  c.plan = { type: 'book', day: Math.max(S.day + 1, c.study ? c.study.until : S.day + ri(1, 3)) };
}

// ---------- 每分钟推进一名到访公民 ----------
function updCitizen(a) {
  const c = C(a.cid);
  if (a.path.length) {
    stepAgent(a);
    if (a.st === 'leave' && !a.gated && a.x <= 1.2) gateCheck(a, c);
    if (!a.path.length) onArrive(a, c);
    return;
  }
  a.px = a.x; a.py = a.y;
  if (a.st === 'q') {
    a.wait++; a.tw++;
    if (a.tw > 20 && a.tw % 15 === 0) c.patience = clamp(c.patience - 1, 0, 100);
    a.bub = a.wait > 25 ? '⏳' : '';
    const opt = STEP[a.steps[a.si]].opt;
    if (opt && a.wait > opt) { dropFromQueue(a); beh(c, '放弃等候', '等待过久，放弃本次' + D.ROOMS[STEP[a.steps[a.si]].rt].short); nextStep(a); }
  } else if (a.st === 'svc') {
    const s = St(a.staff), step = a.steps[a.si];
    if (!s) { a.st = 'walk'; const rm = Rm(a.room); if (rm) { rm.q.unshift(a.id); a.st = 'q'; requeue(rm); } return; }
    a.svc += staffEff(s); s.work++;
    if (a.svc >= STEP[step].dur) { s.busy = 0; s.served++; finishService(a, c, step, s); }
  } else if (a.st === 'exam' && a.cheatAt === S.minute) resolveCheat(a, c);
}
function onArrive(a, c) {
  if (a.st === 'walk') {
    const rm = Rm(a.room), step = a.steps[a.si];
    if (!rm) return nextStep(a);
    if (step === 'petition') return startPetition(a, c, rm);
    rm.q.push(a.id); a.st = 'q'; requeue(rm);
  } else if (a.st === 'toSvc') { a.st = 'svc'; a.svc = 0; a.bub = '💬'; }
  else if (a.st === 'toSeat') { a.st = 'seat'; a.bub = ''; }
  else if (a.st === 'leave') finalize(a, c);
}
function updRoomService(rm) {
  if (!rm.q.length || !SERVICE_ROOMS[rm.type]) return;
  for (const s of S.staff) {
    if (s.room !== rm.id || !present(s) || s.busy) continue;
    if (D.JOBS[s.job].room !== rm.type) continue;
    const a = A(rm.q.shift());
    if (!a) { if (!rm.q.length) break; continue; }
    s.busy = a.id; a.staff = s.id; a.st = 'toSvc';
    const cp = CUST[rm.type][s.station] || CUST[rm.type][0];
    setDest(a, { r: rm.id, lx: cp[0], ld: cp[1] });
    requeue(rm);
    if (!rm.q.length) break;
  }
}

// ---------- 各窗口办结效果 ----------
function finishService(a, c, step, s) {
  switch (step) {
    case 'reg':
      visitFee(c, 'reception');
      invoice(c, '首次建档登记费', 'reg', D.FEES.reg, 0, 'reception');
      c.registered = true;
      beh(c, '建档', '完成身份登记与考试学籍建档');
      break;
    case 'review': doReview(a, c, s); break;
    case 'cashier': doCashier(a, c); break;
    case 'check': doCheck(a, c); break;
    case 'bookstore': doBookstore(a, c); break;
    case 'tutor': {
      visitFee(c, 'tutoring');
      const cur = curCourse(c), gain = Math.round(8 * staffEff(s));
      const v = invoice(c, '一对一私教（当日一节）', 'tutor', D.FEES.tutor, 0, 'tutoring');
      if (cur) c.prep[cur] = clamp(c.prep[cur] + gain, 0, 100);
      c.tutorLeft--; c.stress = clamp(c.stress - 2, 0, 100);
      beh(c, '私教', '完成一节一对一私教，准备度 +' + gain + '，剩余 ' + c.tutorLeft + ' 节', { inv: v.id });
      if (c.tutorLeft <= 0) { c.tutorLeft = 0; a.book = true; a.steps.push('cashier'); }
      break;
    }
    case 'counsel': {
      visitFee(c, 'counsel');
      const v = invoice(c, '心理辅导（自愿）', 'counsel', D.FEES.counsel, 0, 'counsel');
      c.stress = clamp(c.stress - 18, 0, 100); c.patience = clamp(c.patience + 8, 0, 100);
      beh(c, '心理辅导', '完成一次自愿心理辅导（内容保密）', { inv: v.id });
      break;
    }
    case 'report': {
      if (c.reported || nextExam(c) || certCount(c) < 7) break;
      visitFee(c, 'report');
      const v = invoice(c, '成绩核验与电子许可上报服务费', 'report', D.FEES.report, 0, 'report');
      c.reported = S.day;
      beh(c, '汇总上报', '七项认证汇总上报上级生命许可系统，等待电子回执', { inv: v.id });
      log('📤 ' + c.name + ' 七项认证齐全，已汇总上报。最终许可由上级电子签发，本中心不制证。', 'good');
      break;
    }
    case 'pod': {
      if (c.slot !== 'active') break;
      visitFee(c, 'pod');
      const v = invoice(c, '修复舱常规维护服务', 'pod', D.FEES.pod, D.COSTS.pod, 'pod');
      cashMove('podcost', -D.COSTS.pod, '修复舱耗材/能源/折旧', c.id);
      c.pods++;
      beh(c, '修复舱', '完成第 ' + c.pods + ' 次修复舱维护', { inv: v.id });
      FX.push('pod');
      if (!c.books['ANN@' + S.edition] && (S.stock.ANN || 0) > 0 && chance(0.3)) { a.buy = ['ANN']; a.steps.push('bookstore'); }
      break;
    }
  }
  nextStep(a);
}
function doReview(a, c, s) {
  visitFee(c, 'review');
  const ret = c.docs.pending;
  let miss = false, bribed = false;
  if (ret) { consultFee(c); bribed = tryBribe(a, c, s); }
  if (!bribed && c.docs.n < 2) {
    let p = ret ? 0.25 : 0.32;
    if (S.policies.eDocs) p *= 0.5;
    miss = chance(p);
  }
  if (miss) {
    c.docs.n++; c.docs.pending = true; c.docs.name = pick(D.DOCS);
    consultFee(c);
    a.book = false; a.steps.length = a.si + 1;
    c.plan = { type: 'docs', day: S.day + 2 };
    beh(c, '缺件', '材料审核发现缺少' + c.docs.name + '，需回家补件后返访（第 ' + c.docs.n + ' 次）');
  } else {
    c.docs.pending = false; c.docs.ok = true; a.book = true;
    if (a.steps.indexOf('cashier', a.si) < 0) a.steps.push('cashier');
    beh(c, '材料审核', ret ? '补件齐全，材料审核通过' : '材料齐全，一次通过审核');
  }
}
function doCashier(a, c) {
  visitFee(c, 'cashier');
  if (a.book) {
    a.book = false;
    const booked = bookExam(c);
    if (booked && a.type === 'register' && curCourse(c) === 'C01' && chance(0.3 + (100 - c.fin) * 0.003)) { a.buy = ['TC01']; a.steps.push('bookstore'); }
  }
  let sum = 0;
  for (const v of openInvs(c)) sum += payInv(c, v, '收费室');
  if (sum) { a.bub = '💰'; FX.push('cash'); }
  a.paid = true;
}
function sellBook(c, sku, evade) {
  const b = D.BOOKS[sku], cur = curCourse(c);
  if (!b || !bookAllowed(sku)) return null;
  const tag = sku + (b.course ? '' : ':' + (cur || '-'));
  if (c.books[tag + '@' + S.edition]) return null;
  let ed = S.edition, price = b.price, old = false, uc = b.cost;
  const hasNew = (S.stock[sku] || 0) > 0, hasOld = S.policies.oldEd && (S.old[sku] || 0) > 0 && !c.books[tag + '@' + S.oldEd];
  if (hasOld && (!hasNew || chance(0.6))) { old = true; ed = S.oldEd; price = Math.round(b.price * 0.6); }
  else if (!hasNew) { beh(c, '书店断货', b.name + ' 无库存，改用免费公开考纲'); return null; }
  if (old) S.old[sku]--;
  else { uc = Math.round(S.stockCost[sku] / S.stock[sku]); S.stockCost[sku] -= uc; S.stock[sku]--; }
  c.books[tag + '@' + ed] = S.day;
  const target = b.course || cur, gain = b.prep - (old ? 2 : 0);
  if (target) c.prep[target] = clamp(c.prep[target] + gain, 0, 100);
  const v = invoice(c, b.name + '（第' + ed + '版' + (old ? '·旧版互认折价' : '') + '）', 'book', price, uc, 'bookstore');
  S.stats.books++;
  if (!evade) payInv(c, v, '书店收银台');
  beh(c, '购书', '自愿购买' + b.name + ' 第' + ed + '版，准备度 +' + gain + (evade ? '（未在收银台付款）' : ''), { inv: v.id });
  return v;
}
function doBookstore(a, c) {
  let any = false;
  for (const sku of a.buy || []) if (sellBook(c, sku, a.evade)) any = true;
  a.buy = null;
  if (any) { visitFee(c, 'bookstore'); if (!a.evade) FX.push('cash'); }
}

// ---------- 查分：本人到窗口那一刻才知悉成绩并改变学籍 ----------
function doCheck(a, c) {
  const p = c.paper ? PAPER(c.paper) : null;
  visitFee(c, 'reception');
  if (!p || !p.pub) { beh(c, '查分', '成绩尚未发布，改日再来'); return; }
  p.chk = S.day; c.paper = 0; c.lastCheck = S.day;
  const co = D.COURSE[p.course], rec = c.rec[p.course], isW = p.kind === 'w', line = isW ? co.wLine : co.pLine;
  const pass = !p.viol && p.score >= line, kname = isW ? '笔试' : '实操';
  if (isW) { rec.wScore = p.score; rec.wTries++; } else { rec.pScore = p.score; rec.pTries++; }
  rec.hist.push({ k: p.kind, s: p.score, d: p.sub, c: S.day, ok: pass, viol: p.viol });
  if (pass) {
    rec[p.kind] = 'pass';
    c.stress = clamp(c.stress - 6, 0, 100); c.patience = clamp(c.patience + 6, 0, 100);
    beh(c, '查分', '「' + co.short + '」' + kname + ' ' + p.score + ' 分，合格（合格线 ' + line + '；' + dateStr(p.sub) + '考试，' + dateStr(p.pub) + '发布）');
    FX.push('pass');
    if (isW && !pDone(rec) && S.policies.expRecog && c.exp.indexOf(p.course) >= 0) {
      rec.p = 'equiv'; S.stats.equiv++;
      beh(c, '等效认定', '已验证的对口职业资历获实操等效认定，免于重复初级实操');
    }
    if (wDone(rec) && pDone(rec)) afterCert(c, p.course, a);
    else { a.book = true; a.steps.push('cashier'); }
  } else {
    rec[p.kind] = 'fail';
    if (isW) rec.wFails++; else rec.pFails++;
    c.stress = clamp(c.stress + 6 + Math.round((100 - c.tr.resilience) / 12), 0, 100);
    c.patience = clamp(c.patience - 8 - Math.round((100 - c.tr.resilience) / 14), 0, 100);
    beh(c, '查分', '「' + co.short + '」' + kname + (p.viol ? ' 因违纪成绩无效' : ' ' + p.score + ' 分，未通过（合格线 ' + line + '）'));
    FX.push('fail');
    afterFail(c, p.course, p.kind, a, true);
  }
}
// 取得一项完整认证之后（a 可为空：不在馆内时由免考认定触发）
function afterCert(c, course, a) {
  const rec = c.rec[course], co = D.COURSE[course];
  if (rec.cert) return;
  rec.cert = true; rec.certDay = S.day;
  S.stats.certs++; addTrust(0.06);
  c.stress = clamp(c.stress - 12, 0, 100); c.patience = clamp(c.patience + 12, 0, 100);
  c.study = null; c.strategy = '';
  beh(c, '取得认证', '取得' + co.name + '（' + certCount(c) + '/7）');
  log('📜 ' + c.name + ' 取得' + co.name + '（' + certCount(c) + '/7）。', 'good');
  const ne = nextExam(c);
  if (!ne) { if (a && hasRoom('report')) a.steps.push('report'); return; }
  if (D.COURSE[ne.course].level > S.level) { beh(c, '等待资质', '下一科「' + D.COURSE[ne.course].short + '」超出本中心等级授权，回家等待'); return; }
  if (a && chance(0.25 + (100 - c.fin) * 0.004 + c.tr.discipline * 0.002)) { a.buy = ['T' + ne.course]; a.steps.push('bookstore'); }
  c.study = { until: S.day + ri(2, 5), rate: studyRate(c) };
  c.plan = { type: 'book', day: c.study.until };
}
// 未通过后的自主抉择：教辅 / 私教 / 居家免费复习 / 直接重约（统一标准价）
function afterFail(c, course, kind, a, allowPetition) {
  const rec = c.rec[course], fails = kind === 'w' ? rec.wFails : rec.pFails;
  if (allowPetition && fails >= 2 && hasRoom('petition') && !rec.wEx && !rec.pEx && !rec.pet && chance(0.5)) {
    rec.pet = true; c.plan = { type: 'petition', day: S.day + 1 }; c.strategy = '向局长祈愿';
    beh(c, '复习抉择', '连续 ' + fails + ' 次未通过，决定明日到祈愿室向局长申诉');
    return;
  }
  if (c.patience < 12) {
    c.paused = true; c.strategy = '暂时休学'; c.plan = { type: 'book', day: S.day + ri(8, 14) };
    beh(c, '休学', '耐心耗尽，暂时离开一段时间（之后会回来，不会永久消失）');
    return;
  }
  if (c.stress > 70 && staffed('counsel') && chance(0.5)) {
    c.plan = { type: 'counsel', day: S.day + 1 }; c.strategy = '先做心理辅导';
    beh(c, '复习抉择', '压力过高，自愿预约明日心理辅导');
    return;
  }
  const sku = 'G' + course, opts = [];
  const canGuide = a && staffed('bookstore') && bookAllowed(sku) && !c.books[sku + '@' + S.edition] && ((S.stock[sku] || 0) > 0 || (S.policies.oldEd && (S.old[sku] || 0) > 0));
  if (canGuide) opts.push({ k: 'guide', w: 18 + (100 - c.fin) * 0.3 + c.tr.discipline * 0.1 });
  if (staffed('tutoring')) opts.push({ k: 'tutor', w: 8 + (100 - c.fin) * 0.25 + fails * 6 });
  opts.push({ k: 'home', w: 18 + c.fin * 0.3 + c.tr.discipline * 0.15 });
  if (a) opts.push({ k: 'rebook', w: 10 + c.tr.courage * 0.2 + (100 - c.patience) * 0.1 });
  const ch = wpick(opts).k;
  if (ch === 'guide') {
    a.buy = [sku]; a.steps.push('bookstore');
    c.study = { until: S.day + ri(2, 4), rate: studyRate(c) }; c.plan = { type: 'book', day: c.study.until }; c.strategy = '购买当届教辅后居家复习';
  } else if (ch === 'tutor') {
    c.tutorLeft = ri(2, 4); c.plan = { type: 'tutor', day: S.day + 1 }; c.strategy = '连续 ' + c.tutorLeft + ' 日一对一私教';
  } else if (ch === 'home') {
    c.study = { until: S.day + ri(2, 4), rate: studyRate(c) }; c.plan = { type: 'book', day: c.study.until }; c.strategy = '免费居家复习公开考纲';
  } else {
    a.book = true; a.steps.push('cashier'); c.strategy = '直接预约下一场（统一标准价）';
  }
  beh(c, '复习抉择', '选择：' + c.strategy);
}

// ---------- 祈愿室 ----------
function startPetition(a, c, rm) {
  const ne = nextExam(c);
  if (!ne) return nextStep(a);
  const k = S.petitions.length % CUST.petition.length;
  a.st = 'petition'; a.bub = '🙏';
  setDest(a, { r: rm.id, lx: CUST.petition[k][0], ld: CUST.petition[k][1] });
  c.examBonus = Math.max(c.examBonus, 3);
  S.petitions.push({ cid: c.id, course: ne.course, kind: ne.kind, day: S.day });
  beh(c, '祈愿', '在祈愿室向 ' + S.player + ' 局长申诉「' + D.COURSE[ne.course].short + '」' + (ne.kind === 'w' ? '笔试' : '实操'));
  log('🙏 ' + c.name + '：“尊敬的 ' + S.player + ' 局长，恳请您考虑我还未考出来的生命。”（公民与个案页可处理）', 'ask');
  FX.push('ask');
}
function grantExemption(c, course, why, swap) {
  const rec = c.rec[course];
  if (rec.cert || rec.wEx || rec.pEx) return null;
  const kind = wDone(rec) ? 'p' : 'w';
  const ex = { day: S.day, by: S.player, why, kind, audited: false, swap: !!swap };
  if (kind === 'w') rec.wEx = ex; else rec.pEx = ex;
  S.stats.exemptions++;
  beh(c, '免考认定', '获「' + D.COURSE[course].short + '」' + (kind === 'w' ? '笔试' : '实操') + '《单项免考认定书》（另一项仍须实际通过；不等于考试合格分）', { hid: !!swap });
  return ex;
}
function petitionDecide(cid, choice) {
  const i = S.petitions.findIndex(p => p.cid === cid);
  if (i < 0) return { ok: false, msg: '该祈愿已处理' };
  const pt = S.petitions[i], c = C(cid), a = A(c.agent), co = D.COURSE[pt.course];
  S.petitions.splice(i, 1);
  if (!a) return { ok: false, msg: '当事人已离场' };
  let msg = '';
  if (choice === 'exempt') {
    const ex = grantExemption(c, pt.course, '祈愿室特批');
    if (!ex) { msg = '该科已有免考凭证，每门最多一张。'; afterFail(c, pt.course, pt.kind, a, false); }
    else {
      addComp(-4);
      msg = '已签发「' + co.short + '」' + (ex.kind === 'w' ? '笔试' : '实操') + '单项免考认定书，合规 -4，留档待上级抽查。';
      log('🖋 ' + S.player + ' 局长特批 ' + c.name + ' 「' + co.short + '」' + (ex.kind === 'w' ? '笔试' : '实操') + '免考。其余科目与另一项仍须实考。', 'ask');
      const rec = c.rec[pt.course];
      if (wDone(rec) && pDone(rec)) afterCert(c, pt.course, a);
      else { a.book = true; a.steps.push('cashier'); }
    }
  } else if (choice === 'volunteer') {
    S.volunteer += 3; addTrust(-3); addComp(-3);
    beh(c, '公益辅助劳动', '被安排 3 个营业日轻量辅助工作（不得担任监考/阅卷）');
    msg = '已安排公益辅助劳动 3 日（每日最多节省工资 35），信任 -3、合规 -3。';
    afterFail(c, pt.course, pt.kind, a, false);
  } else if (choice === 'fee') {
    if (c.fin > 75) {
      beh(c, '祈愿', '无力承担特别申诉服务费，婉拒');
      msg = c.name + ' 无力承担 280，婉拒了。';
      afterFail(c, pt.course, pt.kind, a, false);
    } else {
      const v = invoice(c, '特别申诉服务费', 'special', D.FEES.special, 0, 'petition');
      c.examBonus = 5; a.evade = false; a.book = true; a.steps.push('cashier');
      beh(c, '特别申诉', '缴纳特别申诉服务费，下次考试心理稳定 +5（不保证合格）', { inv: v.id });
      msg = '已开具特别申诉服务费 280（不保证合格，不能买分）。';
    }
  } else {
    beh(c, '祈愿', '局长暂不受理，恢复正常备考');
    msg = '暂不受理。';
    afterFail(c, pt.course, pt.kind, a, false);
  }
  nextStep(a);
  return { ok: true, msg };
}

// ---------- 开考、交卷 ----------
function examStaff(rm) { return S.staff.filter(s => s.room === rm.id && present(s) && D.JOBS[s.job].room === rm.type); }
function admit(ses) {
  for (const cid of ses.cids) {
    if (ses.att.indexOf(cid) >= 0) continue;
    const c = C(cid), a = c && A(c.agent);
    if (!a || a.st !== 'seat' || a.room !== ses.room) continue;
    ses.att.push(cid);
    a.st = 'exam'; a.bub = ses.kind === 'w' ? '📝' : D.COURSE[c.booking.course].icon;
    visitFee(c, ses.kind === 'w' ? 'written' : 'practical');
    S.stats.seatings++;
    const course = c.booking.course, rec = c.rec[course];
    rec[ses.kind] = 'sat';
    a.cheatAt = 0;
    if (ses.kind === 'w' && rec.wFails >= 1 && c.tr.principle < 42 && c.tr.courage > 52 && chance(0.3)) a.cheatAt = ses.t0 + ri(15, 70);
    beh(c, '到考', '入场参加「' + D.COURSE[course].short + '」' + (ses.kind === 'w' ? '笔试' : '实操（' + D.COURSE[course].prac + '）'));
  }
}
function resolveCheat(a, c) {
  const rm = Rm(a.room);
  let p = 0;
  for (const s of S.staff) {
    if (s.job !== 'inspector' || s.st !== 'post') continue;
    const ag = A(s.agent), here = ag && zoneOf(ag.x, ag.y) === rm.id;
    if (s.duty === 'exam') p = Math.max(p, here ? 0.8 : 0.3);
    else if (s.duty === 'roam' && here) p = Math.max(p, 0.4);
  }
  if (chance(p)) {
    a.viol = true; a.bub = '🚫';
    cashMove('fine', D.COSTS.cheatFine, '作弊罚款（罚没）', c.id);
    S.stats.fines += D.COSTS.cheatFine; S.stats.cheatsCaught++; addComp(0.5);
    beh(c, '作弊被查', '考场内使用小抄被巡查员查获，罚款 ' + D.COSTS.cheatFine + '，本场成绩记为违纪无效');
    log('🚫 巡查员在考场查获 ' + c.name + ' 的小抄，罚款 ' + D.COSTS.cheatFine + ' 计入罚没收入。', 'good');
    FX.push('alert');
  } else {
    a.cheated = true;
    beh(c, '作弊', '考场内偷看小抄，未被发现', { hid: true });
  }
}
function makePaper(c, a, kind) {
  const course = c.booking.course;
  let score = Math.round(examMean(c, course, kind) + gauss() * EXAM_SD + (a && a.cheated ? 9 : 0));
  score = clamp(score, 0, 100);
  const p = { id: nid(), cid: c.id, course, kind, sub: S.day, score, viol: !!(a && a.viol), mk: 0, prog: 0, pub: 0, planned: 0, chk: 0 };
  S.papers.push(p); IDX.p.set(p.id, p); S.gq.push(p.id);
  c.paper = p.id; c.booking = null; c.examBonus = 0; c.study = null;
  beh(c, '交卷', (kind === 'w' ? '笔试交卷' : '实操记录提交') + '，成绩封存送阅卷室，最早次营业日发布');
}
function endSession(ses) {
  ses.st = 'done';
  for (const cid of ses.cids) {
    const c = C(cid);
    if (!c) continue;
    const a = A(c.agent);
    if (ses.att.indexOf(cid) >= 0) { makePaper(c, a, ses.kind); if (a) nextStep(a); }
    else if (c.booking && c.booking.key === ses.key) {
      c.rec[c.booking.course][ses.kind] = 'none'; c.booking = null;
      beh(c, '缺考', '未在规定时间入场，本场预约作废');
      if (a && (a.st === 'seat' || a.st === 'toSeat')) nextStep(a);
    }
  }
  for (const s of S.staff) if (s.room === ses.room) s.examUntil = 0;
  FX.push('paper');
}
function cancelSession(ses, why) {
  ses.st = 'cancel';
  S.stats.cancelled++; S.cancelAud++; addTrust(-1);
  const rname = ses.kind === 'w' ? '笔试' : '实操';
  log('⚠️ ' + timeStr(ses.kind === 'w' ? D.W_SLOTS[ses.slot] : D.P_SLOTS[ses.slot]) + ' ' + rname + '场次取消：' + why + '。已为考生免费顺延，不重复收报名费。', 'bad');
  for (const cid of ses.cids) {
    const c = C(cid);
    if (!c || !c.booking || c.booking.key !== ses.key) continue;
    const course = c.booking.course;
    c.booking = null; c.rec[course][ses.kind] = 'none';
    const bk = reserve(c, course, ses.kind);
    if (bk) { c.plan = { type: ses.kind === 'w' ? 'examW' : 'examP', day: bk.day }; beh(c, '场次顺延', '中心原因（' + why + '）取消，免费顺延至 ' + dateStr(bk.day)); }
    else { c.prepaid = true; c.plan = { type: 'book', day: S.day + 1 }; beh(c, '场次取消', '中心原因取消，已缴报名费保留'); }
    const a = A(c.agent);
    if (a && (a.st === 'seat' || a.st === 'toSeat')) nextStep(a);
  }
  FX.push('alert');
}
function updExams() {
  const m = S.minute;
  for (const key of S.today) {
    const ses = S.sessions[key];
    if (!ses || ses.st === 'done' || ses.st === 'cancel' || !ses.cids.length) continue;
    const isW = ses.kind === 'w', t0 = isW ? D.W_SLOTS[ses.slot] : D.P_SLOTS[ses.slot], dur = isW ? D.W_DUR : D.P_DUR;
    const rm = Rm(ses.room);
    if (ses.st === 'open') {
      if (m < t0) continue;
      const st = rm ? examStaff(rm) : [];
      if (st.length) {
        ses.st = 'run'; ses.t0 = m;
        for (const s of st) s.examUntil = m + dur;
        if (isW) { log('🔔 ' + timeStr(m) + ' 「' + D.COURSE[ses.course].short + '」笔试开考，预约 ' + ses.cids.length + ' 人。', 'info'); FX.push('bell'); }
      } else if (m >= t0 + (isW ? 20 : 15)) { cancelSession(ses, isW ? '笔试厅无监考员在岗' : '实操室无考评员在岗'); continue; }
    }
    if (ses.st === 'run') {
      if (m <= ses.t0 + (isW ? 15 : 10)) admit(ses);
      if (m >= ses.t0 + dur) endSession(ses);
    }
  }
}

// ---------- 阅卷与发布 ----------
function sampleCheckDelay(atStart) {
  const r = R();
  let d = r < 0.45 ? 0 : r < 0.62 ? 1 : r < 0.75 ? 2 : r < 0.87 ? ri(3, 4) : r < 0.95 ? ri(5, 7) : ri(8, 12);
  if (!atStart && d < 1) d = 1;
  return d;
}
function publish(p, atStart) {
  if (p.pub) return;
  p.pub = S.day;
  p.planned = S.day + sampleCheckDelay(atStart);
  const c = C(p.cid);
  if (c && !c.agent && !c.plan) c.plan = { type: 'check', day: p.planned };
}
function updGrading() {
  if (!S.gq.length) return;
  let cap = 0;
  for (const s of S.staff) {
    if (s.job !== 'grader' || !present(s) || !s.room) continue;
    cap += staffEff(s); s.work++;
  }
  if (S.policies.aiGrading) cap *= 1.8;
  while (cap > 0 && S.gq.length) {
    const p = PAPER(S.gq[0]);
    if (!p) { S.gq.shift(); continue; }
    const need = p.kind === 'w' ? 22 : 10, take = Math.min(cap, need - p.prog);
    p.prog += take; cap -= take;
    if (p.prog >= need - 1e-9) {
      p.mk = S.day; S.gq.shift();
      if (S.day > p.sub) publish(p, false);
    }
  }
}
function publishDue() {
  let n = 0;
  for (const p of S.papers) if (p.mk && !p.pub && p.sub < S.day) { publish(p, true); n++; }
  if (n) log('📢 今日发布 ' + n + ' 份成绩（后台可查；须本人返访查分后才知悉并生效）。', 'info');
}

// ---------- 局长互动：每日全中心 3 次、每人每日 1 次 ----------
const ENC = {
  warm: { name: '温和鼓励', pat: 11, stress: -8, prep: 0, trust: 0 },
  persist: { name: '鼓励坚持', pat: 5, stress: -4, prep: 2, trust: 0 },
  listen: { name: '倾听诉求', pat: 9, stress: -6, prep: 0, trust: 1 },
};
function encourLeft() { return S.encour.day === S.day ? Math.max(0, D.ENCOURAGE_PER_DAY - S.encour.n) : D.ENCOURAGE_PER_DAY; }
function encourage(cid, kind) {
  const c = C(cid), e = ENC[kind];
  if (!c || !e) return { ok: false, msg: '无效操作' };
  if (S.encour.day !== S.day) S.encour = { day: S.day, n: 0 };
  if (S.encour.n >= D.ENCOURAGE_PER_DAY) return { ok: false, msg: '今日局长互动额度（3 次）已用完' };
  if (c.encDay === S.day) return { ok: false, msg: '今天已经与 ' + c.name + ' 谈过了' };
  S.encour.n++; c.encDay = S.day;
  c.patience = clamp(c.patience + e.pat, 0, 100); c.stress = clamp(c.stress + e.stress, 0, 100);
  c.relation = clamp(c.relation + 6, 0, 100);
  const cur = curCourse(c);
  if (e.prep && cur) c.prep[cur] = clamp(c.prep[cur] + e.prep, 0, 100);
  if (e.trust) addTrust(e.trust);
  beh(c, '局长互动', S.player + ' 局长' + e.name + '：耐心 +' + e.pat + '，压力 ' + e.stress + (e.prep ? '，准备度 +' + e.prep : '') + '（不收费，不改变已阅卷成绩）');
  FX.push('click');
  return { ok: true, msg: e.name + '已记录到行为履历' };
}
