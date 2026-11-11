// ===== 模拟内核 3：员工与合同、巡查与红包、机构升级与上级审查、政策、营业日循环、存档、对外接口 =====
const TEMP_DAYS = [3, 5, 7, 10];
const PROOFS = [
  { name: '《真实到考人次证明》', job: 'proctor' },
  { name: '《报名费台账一致性证明》', job: 'cashier' },
  { name: '《阅卷留痕与签字证明》', job: 'grader' },
];
const fail = msg => ({ ok: false, msg });

// ---------- 员工 ----------
function staffSkill(s) { return s.temp ? (s.skills[D.JOBS[s.job].skill] || 50) : s.quality; }
function staffEff(s) {
  let e = 0.6 + staffSkill(s) / 200;
  if (s.sat < 35) e *= 0.7; else if (s.sat > 75) e *= 1.08;
  return e;
}
function freeStation(rm, except) {
  const n = (POSTS[rm.type] || []).length;
  for (let i = 0; i < n; i++) if (!S.staff.some(s => s !== except && s.room === rm.id && s.station === i)) return i;
  return -1;
}
function autoRoom(s) {
  const rt = D.JOBS[s.job].room;
  if (!rt) return false;
  for (const rm of roomsOf(rt)) {
    const i = freeStation(rm, s);
    if (i >= 0) { s.room = rm.id; s.station = i; s.rest = i % 2 ? 'B' : 'A'; return true; }
  }
  return false;
}
function addStaff(p, job, temp, wage) {
  const s = {
    id: nid(), name: p.name, job, temp: !!temp, wage: Math.round(wage), expect: temp ? p.expect : D.JOBS[job].wage, room: 0, station: 0, st: 'off', agent: 0,
    sat: 62, rest: 'A', busy: 0, work: 0, served: 0, examUntil: 0, duty: job === 'inspector' ? 'gate' : '', end: 0, start: S.day, back: 0, lowDays: 0,
    bonusDay: 0, renewDay: 0, cid: temp && p.id ? p.id : 0, tr: p.tr, skills: p.skills, hue: p.hue, species: p.species, age: p.age,
    quality: 60, mismatch: false, origin: '', rested: false, lounge: false, why: '', caught: 0, nextMove: 0, patrol: 0, bribes: 0,
  };
  S.staff.push(s); IDX.s.set(s.id, s);
  autoRoom(s);
  return s;
}
function inspectorPost(s) {
  const d = s.duty, gate = { x: 1.9, y: 8.4 };
  if (d === 'gate') return gate;
  let rms;
  if (d === 'exam') {
    const run = S.today.map(k => S.sessions[k]).filter(x => x && x.cids.length && (x.st === 'run' || (x.st === 'open' && (x.kind === 'w' ? D.W_SLOTS[x.slot] : D.P_SLOTS[x.slot]) - S.minute < 25)));
    rms = run.map(x => Rm(x.room)).filter(Boolean);
    if (!rms.length) rms = S.rooms.filter(r => r.type === 'written' || r.type === 'practical');
  } else if (d === 'integrity') rms = S.rooms.filter(r => r.type === 'review' || r.type === 'cashier' || r.type === 'reception' || r.type === 'bookstore' || r.type === 'lounge');
  else rms = S.rooms;
  if (!rms.length) return { x: 1.9, y: 10.6 };
  s.patrol = d === 'roam' ? ri(0, rms.length - 1) : (s.patrol + 1) % rms.length;
  return { r: rms[s.patrol % rms.length].id, lx: 5.5, ld: 1.1 };
}
function staffPost(s) {
  if (s.job === 'inspector') return inspectorPost(s);
  const rm = s.room && Rm(s.room);
  if (rm) { const p = POSTS[rm.type][s.station] || POSTS[rm.type][0] || [3, 3]; return { r: rm.id, lx: p[0], ld: p[1] }; }
  return { x: 0.7 + (s.id % 3) * 0.7, y: 1.5 + (s.id % 6) * 0.8 };
}
function deploy(s) {
  if (s.agent) return;
  const a = { id: nid(), k: 'stf', sid: s.id, x: 0, y: 0, px: 0, py: 0, path: [], place: OUTSIDE, bub: '' };
  S.agents.push(a); IDX.a.set(a.id, a);
  teleport(a, staffPost(s));
  s.agent = a.id; s.st = 'post'; s.nextMove = S.minute + 20;
}
function dropAgent(a) {
  const i = S.agents.indexOf(a);
  if (i >= 0) S.agents.splice(i, 1);
  IDX.a.delete(a.id);
}
function updStaffAgent(a) {
  const s = St(a.sid);
  if (!s) return dropAgent(a);
  if (a.path.length) {
    stepAgent(a);
    if (!a.path.length) {
      if (s.st === 'toRest') s.st = 'rest';
      else if (s.st === 'toPost') s.st = 'post';
      else if (s.st === 'away') { dropAgent(a); s.agent = 0; }
    }
    return;
  }
  a.px = a.x; a.py = a.y;
  const m = S.minute, w = D.REST[s.rest];
  a.bub = s.st === 'rest' ? '☕' : '';
  if (s.st === 'post') {
    if (w && !s.rested && m >= w[0] && m < w[1] - 10 && !s.busy && !(s.examUntil > m)) {
      const lg = roomsOf('lounge')[0], k = s.id % LOUNGE.length;
      s.st = 'toRest'; s.lounge = !!lg;
      setDest(a, lg ? { r: lg.id, lx: LOUNGE[k][0], ld: LOUNGE[k][1] } : { x: 0.7 + (s.id % 3) * 0.7, y: 13 + (s.id % 6) * 0.8 });
    } else if (s.job === 'inspector' && s.duty !== 'gate' && m >= s.nextMove) {
      s.nextMove = m + ri(18, 30);
      setDest(a, inspectorPost(s));
    }
  } else if (s.st === 'rest' && w && m >= w[1]) {
    s.rested = true; s.st = 'toPost';
    setDest(a, staffPost(s));
  }
}
function moveToPost(s) {
  const a = A(s.agent);
  if (!a || s.st === 'away' || s.st === 'rest' || s.st === 'toRest') return;
  s.st = s.job === 'inspector' ? 'post' : 'toPost';
  setDest(a, staffPost(s));
}
function assignStaff(sid, roomId) {
  const s = St(sid);
  if (!s) return fail('员工不存在');
  if (s.busy) return fail(s.name + ' 正在办理业务，请稍后调整');
  if (s.examUntil > S.minute) return fail(s.name + ' 正在监考，考试结束后才能调岗');
  if (!roomId) { s.room = 0; s.station = 0; moveToPost(s); return { ok: true }; }
  const rm = Rm(roomId);
  if (!rm || D.JOBS[s.job].room !== rm.type) return fail('岗位与房间不匹配');
  const i = freeStation(rm, s);
  if (i < 0) return fail(D.ROOMS[rm.type].short + ' 的岗位已满');
  s.room = rm.id; s.station = i;
  moveToPost(s);
  return { ok: true };
}
function setDuty(sid, duty) {
  const s = St(sid);
  if (!s || s.job !== 'inspector' || !D.DUTIES[duty]) return fail('只有巡查员可以分配巡查任务');
  s.duty = duty; s.nextMove = S.minute + 20;
  moveToPost(s);
  log('🛡 ' + s.name + ' 改任「' + D.DUTIES[duty].name + '」。', 'info');
  return { ok: true };
}
function setRest(sid, shift) {
  const s = St(sid);
  if (!s || (shift !== 'A' && shift !== 'B' && shift !== 'N')) return fail('无效的休息班次');
  s.rest = shift;
  return { ok: true };
}
function bonus(sid) {
  const s = St(sid);
  if (!s) return fail('员工不存在');
  if (s.bonusDay === S.day) return fail('今天已经发过奖金，同日重复发放不再有效');
  if (S.cash < D.COSTS.bonus) return fail('现金不足');
  cashMove('bonus', -D.COSTS.bonus, '奖金 ' + s.name);
  s.bonusDay = S.day; s.sat = clamp(s.sat + 12, 0, 100);
  FX.push('cash');
  return { ok: true, msg: s.name + ' 满意度 +12' };
}
function removeStaff(s) {
  const a = A(s.agent);
  if (a) dropAgent(a);
  if (s.busy) { const ca = A(s.busy); if (ca) ca.staff = 0; }
  const c = s.cid && C(s.cid);
  if (c) c.staff = 0;
  const i = S.staff.indexOf(s);
  if (i >= 0) S.staff.splice(i, 1);
  IDX.s.delete(s.id);
}
function dismiss(sid) {
  const s = St(sid);
  if (!s) return fail('员工不存在');
  if (s.examUntil > S.minute) return fail('监考进行中，不能解聘');
  if (s.st === 'away') return fail(s.name + ' 外出办事中');
  const c = s.cid && C(s.cid);
  if (c) beh(c, '合同终止', '中心提前终止「' + D.JOBS[s.job].name + '」临时合同（考籍与账单不受影响）');
  log('📄 ' + s.name + '（' + D.JOBS[s.job].name + '）' + (s.temp ? '临时合同已终止。' : '已退回人事编制署。'), 'info');
  removeStaff(s);
  return { ok: true };
}

// ---------- 正式编制：向人事编制署申请，次营业日答复，可能不对口 ----------
const formalCount = () => S.staff.filter(s => !s.temp).length + S.apps.length;
function applyFormal(job) {
  const j = D.JOBS[job];
  if (!j || j.temp) return fail('该岗位只能签临时合同，人事编制署不予派员');
  if (formalCount() >= D.FORMAL_CAP[S.level]) return fail('正式编制已达本级上限 ' + D.FORMAL_CAP[S.level] + ' 人');
  S.apps.push({ id: nid(), job, day: S.day, cand: null });
  log('📨 已向人事编制署申请「' + j.name + '」编制，最早次营业日答复。', 'info');
  return { ok: true };
}
function replyApps() {
  for (const ap of S.apps) {
    if (ap.cand || ap.day >= S.day) continue;
    const p = makePerson(), mis = chance(0.3);
    ap.cand = { name: p.name, age: p.age, species: p.species, tr: p.tr, skills: p.skills, hue: p.hue, expect: p.expect,
      quality: mis ? ri(22, 45) : ri(55, 92), mismatch: mis, origin: p.job };
    log('📨 人事编制署答复：派出 ' + p.name + ' 任「' + D.JOBS[ap.job].name + '」' + (mis ? '（原岗位：' + p.job + '，不完全对口）' : '') + '，请在【员工排班】决定是否接收。', 'key');
  }
}
function acceptCandidate(appId) {
  const i = S.apps.findIndex(a => a.id === appId), ap = S.apps[i];
  if (!ap || !ap.cand) return fail('尚未收到答复');
  if (S.cash < D.COSTS.hire) return fail('现金不足，入职手续费 ' + D.COSTS.hire);
  S.apps.splice(i, 1);
  cashMove('hire', -D.COSTS.hire, '入职手续 ' + ap.cand.name);
  const s = addStaff(ap.cand, ap.job, false, D.JOBS[ap.job].wage);
  s.quality = ap.cand.quality; s.mismatch = ap.cand.mismatch; s.origin = ap.cand.origin;
  deploy(s);
  log('✅ ' + s.name + ' 入职「' + D.JOBS[s.job].name + '」' + (s.room ? '' : '，暂无对应房间岗位，待命中') + '。', 'good');
  return { ok: true, staff: s };
}
function declineCandidate(appId) {
  const i = S.apps.findIndex(a => a.id === appId);
  if (i < 0) return fail('申请不存在');
  S.apps.splice(i, 1);
  return { ok: true };
}

// ---------- 临时合同：从考生池谈判签约 ----------
function offerChance(c, job, wage, days, swap) {
  let p = 0.45 + (wage - c.expect) / 50 + (c.fin - 50) / 180 + (days <= 5 ? 0.05 : -0.012 * (days - 5));
  if (swap) p += c.tr.principle < 55 ? 0.3 : -0.35;
  return clamp(p, 0.03, 0.97);
}
function offerTemp(cid, job, wage, days, swap) {
  const c = C(cid), j = D.JOBS[job];
  if (!c || !j || !j.temp) return fail('该岗位不是临时合同岗位');
  wage = Math.round(wage);
  if (TEMP_DAYS.indexOf(days) < 0 || !(wage >= 40 && wage <= 200)) return fail('合同条件无效');
  if (c.staff) return fail(c.name + ' 已在本中心任职');
  if (!c.firstDay) return fail('对方尚未到访过本中心');
  if (c.askDay === S.day) return fail('今天已经与 ' + c.name + ' 谈过一次，明日再议');
  if (j.room && !hasRoom(j.room)) return fail('需先建成' + D.ROOMS[j.room].name);
  c.askDay = S.day;
  const cur = curCourse(c);
  if (swap && (!cur || c.rec[cur].wEx || c.rec[cur].pEx)) swap = false;
  if (swap && c.tr.principle > 70) {
    addComp(-5); addTrust(-2);
    beh(c, '拒绝并举报', '拒绝以单项免考作为雇佣交换条件，并向上级举报');
    log('📣 ' + c.name + ' 拒绝了“免考换工”提议并向上级举报：合规 -5，信任 -2。', 'key');
    return { ok: true, accepted: false, msg: c.name + ' 拒绝并举报了这项提议。' };
  }
  if (!chance(offerChance(c, job, wage, days, swap))) {
    beh(c, '拒绝聘用', '婉拒「' + j.name + '」临时合同（日薪 ' + wage + '，' + days + ' 日；期望日薪约 ' + c.expect + '）');
    return { ok: true, accepted: false, msg: c.name + ' 婉拒了（期望日薪约 ' + c.expect + '）。' };
  }
  const s = addStaff(c, job, true, wage);
  c.staff = s.id;
  const now = !c.agent && !(c.plan && c.plan.day <= S.day) && S.minute < D.DAY_END - 60;
  s.end = now ? S.day + days - 1 : S.day + days;
  if (now) deploy(s);
  beh(c, '签约', '签订「' + j.name + '」临时合同：日薪 ' + wage + '，' + days + ' 个营业日（考籍保留；工资不抵扣个人账单）');
  if (swap) {
    grantExemption(c, cur, '雇佣交换', true);
    const rec = c.rec[cur];
    if (wDone(rec) && pDone(rec)) afterCert(c, cur, null);
    log('🤫 以「' + D.COURSE[cur].short + '」单项免考换取 ' + c.name + ' 签约。此为违规交换，已留档，上级抽查时风险很高。', 'ask');
  }
  log('🤝 ' + c.name + ' 签约「' + j.name + '」，日薪 ' + wage + '，至 ' + dateStr(s.end) + (now ? '，即刻到岗。' : '，下个营业日到岗。'), 'good');
  return { ok: true, accepted: true, staff: s, msg: c.name + ' 接受了合同。' };
}
function renew(sid, days) {
  const s = St(sid);
  if (!s || !s.temp || TEMP_DAYS.indexOf(days) < 0) return fail('无法续签');
  if (s.renewDay === S.day) return fail('今天已经谈过续签');
  s.renewDay = S.day;
  const p = s.sat >= 45 ? 0.92 : s.sat >= 30 ? 0.5 : 0.12;
  if (!chance(p)) { log('📄 ' + s.name + ' 拒绝续签（满意度 ' + s.sat + '）。', 'bad'); return { ok: true, accepted: false, msg: s.name + ' 拒绝续签。' }; }
  s.end = Math.max(s.end, S.day - 1) + days;
  const c = s.cid && C(s.cid);
  if (c) beh(c, '续签', '续签「' + D.JOBS[s.job].name + '」临时合同 ' + days + ' 日，至 ' + dateStr(s.end));
  return { ok: true, accepted: true, msg: s.name + ' 续签至 ' + dateStr(s.end) + '。' };
}

// ---------- 红包：真实动机 + 对象可能受诱惑 + 五格内无他人；证据隐藏直到被发现 ----------
function zoneOf(x, y) {
  if (x < HALL_W) return 0;
  const col = Math.floor((x - HALL_W) / LOT_W);
  for (let r = 0; r < ROWS.length; r++) {
    if (y >= ROWS[r].y && y <= ROWS[r].y + LOT_D) {
      const lot = r * LOT_COLS + col, rm = S.rooms.find(q => q.lot === lot);
      return rm ? rm.id : 0;
    }
  }
  return 0;
}
function bribeEligible(c, s, a) {
  if (!(c.docs.pending && c.docs.n >= 1 && c.tr.principle < 45 && c.tr.courage > 48 && c.fin < 75)) return { ok: false, why: '当事人没有真实动机' };
  if (!((s.tr.greed > 55 && s.tr.principle < 50) || (s.sat < 35 && s.tr.principle < 60))) return { ok: false, why: '接收对象不受诱惑' };
  for (const b of S.agents) {
    if (b === a || b.id === s.agent) continue;
    if (Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) <= 5) return { ok: false, why: '五格内有其他人' };
  }
  return { ok: true, why: '' };
}
function tryBribe(a, c, s) {
  if (!bribeEligible(c, s, a).ok || !chance(0.7)) return false;
  const amt = 40;
  S.bribes.push({ id: nid(), cid: c.id, sid: s.id, sname: s.name, d: S.day, amt, found: 0, by: '' });
  s.bribes++;
  beh(c, '红包', '趁四下无人向 ' + s.name + ' 塞了 ' + amt + ' 的红包，补件“顺利通过”', { hid: true });
  return true;
}
function revealBribe(b, by) {
  b.found = S.day; b.by = by;
  S.stats.bribesFound++;
  const c = C(b.cid), s = St(b.sid);
  if (c) for (const h of c.beh) if (h.hid && h.a === '红包' && h.d === b.d) h.hid = false;
  if (s) s.sat = clamp(s.sat - 15, 0, 100);
}
function integritySweep() {
  let p = 0, who = null;
  for (const s of S.staff) {
    if (s.job !== 'inspector' || s.st === 'off' || s.st === 'leave') continue;
    const q = s.duty === 'integrity' ? 0.25 + staffSkill(s) / 250 : s.duty === 'roam' ? 0.1 : 0;
    if (q > p) { p = q; who = s; }
  }
  if (!who) return;
  for (const b of S.bribes) {
    if (b.found || !chance(p)) continue;
    revealBribe(b, who.name);
    cashMove('confiscate', b.amt, '红包没收（' + b.sname + '）', b.cid);
    addComp(1); who.caught++;
    log('🧧 ' + who.name + ' 查实 ' + b.sname + ' 于' + dateStr(b.d) + '收受红包 ' + b.amt + '，已没收并计入罚没收入。', 'key');
  }
}

// ---------- 机构升级：第一次教学跑证，之后自动打包 ----------
function upgradeConds(target) {
  target = target || S.level + 1;
  const u = D.UPGRADE[target];
  if (!u) return { target, ok: false, max: true, items: [] };
  const it = (k, label, cur, need) => ({ k, label, cur, need, ok: cur >= need });
  const cnt = job => S.staff.filter(s => s.job === job && s.room).length;
  const items = [
    it('payers', '独立付费考生（人）', S.stats.payerCount, u.payers), it('fees', '考试报名费累计实收', S.stats.examFees, u.fees),
    it('seatings', '真实到场考试（人次）', S.stats.seatings, u.seatings), it('trust', '公众信任', Math.floor(S.trust), u.trust), it('comp', '机构合规', Math.floor(S.comp), u.comp),
    it('proctor', '笔试厅配备监考员', cnt('proctor'), 1), it('grader', '阅卷室配备阅卷员', cnt('grader'), 1),
  ];
  return { target, items, ok: items.every(i => i.ok), max: false };
}
function startUpgrade() {
  if (S.up.stage !== 'idle') return fail('已有升级申请在办理中');
  const cd = upgradeConds();
  if (cd.max) return fail('已是最高等级');
  if (!cd.ok) return fail('升级条件尚未全部满足');
  if (!hasRoom('liaison')) return fail('需先建成' + D.ROOMS.liaison.name);
  S.up.target = cd.target; S.up.proofs = [0, 0, 0]; S.up.last = '';
  S.up.stage = S.up.tut ? 'ready' : 'pack';
  log(S.up.tut ? '🗂 证照档案室已自动汇总升级材料，请派外联跑证员送交上级。' : '🗂 第一次申请升级：材料已装袋。请派一名在岗的外联跑证员（临时合同）送交上级。', 'key');
  return { ok: true };
}
function sendLiaison() {
  const st = S.up.stage;
  if (st !== 'pack' && st !== 'ready') return fail('当前没有待送交的材料');
  const s = S.staff.find(x => x.job === 'liaison' && x.st === 'post');
  if (!s) return fail('没有在岗的外联跑证员（只能签临时合同，可在公民档案的“雇佣评估”页签约）');
  let days = 1;
  if (st === 'ready' && S.up.tut) {
    days = clamp(3 - Math.round(staffSkill(s) / 40), 1, 3);
    if (S.staff.some(x => x.job === 'relations' && x.st !== 'off')) days = Math.max(1, days - 1);
  }
  S.up.stage = st === 'pack' ? 'trip1' : 'trip2';
  S.up.back = S.day + days; S.up.sid = s.id;
  s.st = 'away'; s.back = S.up.back; s.busy = 0;
  const a = A(s.agent);
  if (a) setDest(a, OUTSIDE);
  log('🚶 ' + s.name + ' 带着材料袋出发，预计 ' + dateStr(S.up.back) + ' 返回。', 'info');
  return { ok: true };
}
function stampProof(i) {
  if (S.up.stage !== 'rejected') return fail('当前不需要补充证明');
  const pf = PROOFS[i];
  if (!pf || S.up.proofs[i]) return fail('该证明已盖章');
  const s = S.staff.find(x => x.job === pf.job && x.room);
  if (!s) return fail('需要一名已排班的' + D.JOBS[pf.job].name + '签章');
  S.up.proofs[i] = S.day;
  log('🈴 ' + s.name + ' 在' + pf.name + '上签章。', 'info');
  FX.push('stamp');
  if (S.up.proofs.every(Boolean)) { S.up.stage = 'ready'; log('🗂 三份证明齐全。请再次派外联跑证员送交。', 'key'); }
  return { ok: true };
}
function upgradeReturn() {
  const up = S.up;
  if ((up.stage !== 'trip1' && up.stage !== 'trip2') || S.day < up.back) return;
  if (up.stage === 'trip1') {
    up.stage = 'rejected';
    log('📮 外联员带回《补充材料告知书》：材料一次性退回，需补三份盖章证明（真实到考、台账一致、阅卷留痕）。请到【审计与政策】逐项签章。', 'key');
  } else {
    up.stage = 'await'; up.visit = S.day + ri(0, 2);
    log('📮 升级材料已受理。上级复核员将在约 1—3 个营业日内到场复核（紫色制服，不是本中心巡查员）。', 'key');
  }
}
function spawnUpper(role) {
  const want = role === 'review' ? ['written', 'grading', 'cashier'] : ['review', 'cashier', 'written', 'grading'];
  const stops = [];
  for (const t of want) { const rm = roomsOf(t)[0]; if (rm) stops.push({ r: rm.id, lx: 3, ld: 1.4 }); }
  if (!stops.length) stops.push({ x: 1.5, y: 6 });
  const a = { id: nid(), k: 'up', role, name: '上级' + (role === 'review' ? '复核员' : '审查员') + ' ' + pick(D.SURNAMES) + '处长', x: OUTSIDE.x, y: OUTSIDE.y, px: OUTSIDE.x, py: OUTSIDE.y,
    path: [], place: OUTSIDE, stops, si: 0, st: 'walk', t: 0, done: false, bub: '📋' };
  S.agents.push(a); IDX.a.set(a.id, a);
  setDest(a, stops[0]);
  if (role === 'review') S.up.stage = 'visit';
  log('🟣 ' + a.name + ' 到场' + (role === 'review' ? '复核机构升级申请。' : '例行审查。'), 'key');
  FX.push('alert');
}
function concludeUpper(a) {
  if (a.done) return;
  a.done = true;
  if (a.role === 'review') concludeReview(); else runAudit();
}
function updUpper(a) {
  if (a.path.length) {
    stepAgent(a);
    if (!a.path.length) { if (a.st === 'leave') dropAgent(a); else { a.st = 'look'; a.t = 12; } }
    return;
  }
  a.px = a.x; a.py = a.y;
  if (a.st === 'look' && --a.t <= 0) {
    a.si++;
    if (a.si < a.stops.length) { a.st = 'walk'; setDest(a, a.stops[a.si]); }
    else { concludeUpper(a); a.st = 'leave'; a.bub = ''; setDest(a, OUTSIDE); }
  }
}
function concludeReview() {
  const up = S.up, cd = upgradeConds(up.target), why = [];
  for (const it of cd.items) if (!it.ok) why.push(it.label + ' ' + it.cur + '/' + it.need);
  const onDuty = job => S.staff.some(s => s.job === job && s.room && s.st !== 'off' && s.st !== 'leave');
  if (cd.ok && !onDuty('proctor')) why.push('复核当日监考员不在岗');
  if (cd.ok && !onDuty('grader')) why.push('复核当日阅卷员不在岗');
  up.stage = 'idle'; up.tut = true;
  if (!why.length && !cd.max) {
    S.level = up.target; up.last = '';
    log('🎉 上级复核通过：本中心升为' + D.LEVEL_NAMES[S.level] + '。新增可办理：' + D.COURSES.filter(c => c.level === S.level).map(c => c.short).join('、') + '；对应教材发行授权同步开放。', 'key');
    FX.push('levelup');
    for (const c of S.citizens) if (c.status === 'waitLevel' || (!c.plan && !c.agent)) autoPlan(c);
  } else {
    up.last = why.join('；');
    log('🟣 上级复核未通过：' + up.last + '。整改后可重新申请。', 'key');
  }
}
function revokeExemption(c, course, kind) {
  const rec = c.rec[course];
  if (kind === 'w') rec.wEx = null; else rec.pEx = null;
  if (rec.cert) { rec.cert = false; rec.certDay = 0; S.stats.certs--; }
  beh(c, '免考撤销', '上级认定「' + D.COURSE[course].short + '」' + (kind === 'w' ? '笔试' : '实操') + '免考依据不足，退回重考');
  if (!c.agent && !c.booking && !c.paper) { c.plan = null; c.study = null; autoPlan(c); }
}
function runAudit() {
  const f = [];
  let dc = 0, dt = 0, fine = 0;
  for (const c of S.citizens) {
    if (c.reported) continue;
    for (const co of D.COURSES) {
      const rec = c.rec[co.id];
      for (const kind of ['w', 'p']) {
        const ex = kind === 'w' ? rec.wEx : rec.pEx;
        if (!ex || ex.audited) continue;
        if (chance(ex.swap ? 0.7 : 0.3)) {
          revokeExemption(c, co.id, kind);
          if (ex.swap) { dc -= 8; fine += 200; f.push('查实以免考换取雇佣：' + c.name + '「' + co.short + '」免考撤销，罚款 200'); }
          else { dc -= 3; f.push(c.name + '「' + co.short + '」免考依据不足，撤销并退回重考'); }
        } else ex.audited = true;
      }
    }
  }
  for (const b of S.bribes) {
    if (b.found || !chance(0.5)) continue;
    revealBribe(b, '上级审查');
    dc -= 6; fine += 150;
    f.push('查实 ' + b.sname + ' 收受红包（本中心未自查发现），罚款 150');
  }
  if (S.volUsed) { dc -= 2; dt -= 1; f.push('存在以公益辅助劳动折抵人工成本 ' + S.volUsed + ' 日'); S.volUsed = 0; }
  if (S.cancelAud) { dc -= Math.min(3, S.cancelAud); f.push('因考务人员缺岗取消场次 ' + S.cancelAud + ' 场'); S.cancelAud = 0; }
  if (!f.length) { dc += 2; dt += 1; f.push('未发现问题'); }
  if (fine) cashMove('penalty', -fine, '上级审查罚款');
  addComp(dc); addTrust(dt);
  S.audits.push({ d: S.day, f, dc, dt, fine });
  if (S.audits.length > 30) S.audits.shift();
  log('🟣 上级例行审查结论：' + f.join('；') + '。合规 ' + (dc >= 0 ? '+' : '') + dc + (fine ? '，罚款 ' + fine : '') + '。', 'key');
}

// ---------- 政策 ----------
function togglePolicy(key) {
  const p = D.POLICIES.find(x => x.key === key);
  if (!p) return fail('未知政策');
  if (S.policies[key]) { S.policies[key] = false; log('📜 停用政策「' + p.name + '」。', 'info'); return { ok: true, on: false }; }
  if (p.once && !S.bought[key]) {
    if (S.cash < p.once) return fail('现金不足，一次性投入 ' + p.once);
    cashMove('policy', -p.once, p.name + ' 一次性投入');
    S.bought[key] = S.day;
  }
  S.policies[key] = true;
  log('📜 启用政策「' + p.name + '」。' + p.satire, 'info');
  return { ok: true, on: true };
}

// ---------- 拆除 ----------
function demolishRoom(rid) {
  const rm = Rm(rid);
  if (!rm) return fail('房间不存在');
  if (rm.q.length || S.agents.some(a => (a.k === 'cit' && a.room === rid) || (a.place && a.place.r === rid && a.k !== 'stf'))) return fail('房间内还有人在办理业务');
  for (const k in S.sessions) { const ses = S.sessions[k]; if (ses.room === rid && ses.cids.length && ses.st !== 'done' && ses.st !== 'cancel') return fail('该房间还有已预约的考试场次'); }
  for (const k in S.sessions) if (S.sessions[k].room === rid) delete S.sessions[k];
  S.today = S.today.filter(k => S.sessions[k]);
  S.petitions = S.petitions.filter(p => { const c = C(p.cid), a = c && A(c.agent); return a && a.room !== rid; });
  S.rooms.splice(S.rooms.indexOf(rm), 1); IDX.r.delete(rid);
  const back = Math.round(D.ROOMS[rm.type].cost * 0.3);
  for (const s of S.staff) if (s.room === rid) { s.room = 0; s.station = 0; s.busy = 0; moveToPost(s); }
  for (const s of S.staff) { const a = A(s.agent); if (a && a.place && a.place.r === rid) teleport(a, staffPost(s)); }
  cashMove('build', back, '拆除 ' + D.ROOMS[rm.type].name + ' 残值');
  log('🧱 拆除「' + D.ROOMS[rm.type].name + '」，回收残值 ' + back + '。', 'info');
  return { ok: true };
}

// ---------- 营业日循环 ----------
function yearRollover() {
  S.oldEd = S.edition; S.edition++;
  let n = 0;
  for (const sku in S.stock) { n += S.stock[sku]; S.old[sku] = (S.old[sku] || 0) + S.stock[sku]; S.stock[sku] = 0; S.stockCost[sku] = 0; }
  log('📚 新学年：第 ' + S.edition + ' 版考纲与教辅发布，' + n + ' 本现行库存转入旧版库存（可回收，或启用“旧版教材互认”折价销售）。' + pick(D.EDITION_JOKES), 'key');
  FX.push('bell');
}
function licensing() {
  for (const c of S.citizens) {
    if (!c.reported) continue;
    if (!c.license) {
      if (S.day <= c.reported) continue;
      c.license = true; c.licDay = S.day; c.slot = 'wait'; c.slotDay = S.day + ri(3, 8);
      S.stats.licenses++; addTrust(1);
      beh(c, '电子许可', '上级系统电子签发' + D.FINAL_LICENSE + '（非本中心制证）；进入生命维护名额公开候补');
      log('🏅 上级系统为 ' + c.name + ' 电子签发' + D.FINAL_LICENSE + '。签发不等于名额，现进入公开候补。', 'key');
    } else if (c.slot === 'wait' && S.day >= c.slotDay) {
      c.slot = 'active'; c.annual = { due: S.day + D.YEAR_DAYS, n: 0 };
      beh(c, '名额激活', '公开候补轮到，生命维护名额激活，可预约修复舱');
      if (!c.agent) { c.plan = null; autoPlan(c); }
    } else if (c.slot === 'active' && c.annual && S.day >= c.annual.due) {
      c.annual.due += D.YEAR_DAYS; c.annual.n++;
      beh(c, '年度确认', '完成年度 6 学分、守规小测与使用授权确认（原型自动模拟）');
    }
  }
}
function planArrivals() {
  S.arr = [];
  let n = S.day === 1 ? 5 : clamp(Math.round(1.0 + S.trust / 50 + S.level * 0.4 + gauss() * 0.8), 0, 5);
  const active = S.citizens.reduce((k, c) => k + (c.license ? 0 : 1), 0);
  if (active > 50 + S.level * 20) n = Math.min(n, 1);
  for (let i = 0; i < n; i++) newCitizen().plan = { type: 'register', day: S.day };
  for (const c of S.citizens) {
    if (c.agent || !c.plan || c.plan.day > S.day) continue;
    let t = c.plan.type;
    if ((t === 'examW' || t === 'examP') && (!c.booking || c.booking.day !== S.day)) {
      c.plan = null; autoPlan(c);
      if (!c.plan || c.plan.day > S.day || c.plan.type === 'examW' || c.plan.type === 'examP') continue;
      t = c.plan.type;
    }
    const m = t === 'examW' ? D.W_SLOTS[c.booking.slot] - ri(22, 32) : t === 'examP' ? D.P_SLOTS[c.booking.slot] - ri(22, 32) : ri(D.DAY_START + 3, D.DAY_END - 170);
    S.arr.push({ cid: c.id, m: Math.max(m, D.DAY_START + 1) });
  }
  S.arr.sort((a, b) => a.m - b.m || a.cid - b.cid);
}
function startDay() {
  S.minute = D.DAY_START;
  S.agents = []; IDX.a.clear();
  S.upQ = [];
  if (S.day > 1 && (S.day - 1) % D.YEAR_DAYS === 0) yearRollover();
  const g = S.trust >= 70 ? D.GRANT.high : S.trust < 40 ? D.GRANT.low : D.GRANT.base;
  cashMove('grant', g, '政府服务定额拨款');
  S.today = Object.keys(S.sessions).filter(k => S.sessions[k].day === S.day).sort();
  publishDue();
  replyApps();
  upgradeReturn();
  if (S.up.stage === 'await' && S.day >= S.up.visit) S.upQ.push({ m: ri(600, 680), role: 'review' });
  if (S.day >= S.nextAudit) { S.upQ.push({ m: ri(700, 800), role: 'audit' }); S.nextAudit = S.day + ri(5, 9); }
  else if (S.nextAudit === S.day + 1 && chance(0.6)) log('📞 风闻：上级例行审查可能就在这一两天。', 'info');
  licensing();
  planArrivals();
  const coming = {};
  for (const x of S.arr) coming[x.cid] = 1;
  for (const s of S.staff) {
    s.work = 0; s.served = 0; s.busy = 0; s.examUntil = 0; s.rested = false; s.lounge = false; s.why = ''; s.agent = 0;
    if (s.st === 'away') { if (S.day < s.back) continue; s.back = 0; }
    s.st = 'off';
    if (s.cid && coming[s.cid]) {
      s.st = 'leave'; s.why = '请假办理本人考务';
      log('🗓 ' + s.name + '（' + D.JOBS[s.job].name + '）今日请假办理本人考务，岗位空缺。', 'info');
      continue;
    }
    if (!s.temp && s.sat < 35 && chance(0.15)) {
      s.st = 'leave'; s.why = '请假（满意度过低）';
      log('🗓 ' + s.name + '（' + D.JOBS[s.job].name + '）今日请假，窗口可能无人。', 'bad');
      continue;
    }
    deploy(s);
    if (s.temp && s.end === S.day) log('📄 ' + s.name + '（' + D.JOBS[s.job].name + '）的临时合同今日到期，可在【员工排班】续签。', 'ask');
  }
  S.bcast = ri(D.DAY_START + 30, D.DAY_END - 60);
}
function closeVisits() {
  for (const a of S.agents.slice()) {
    if (a.k === 'up') { concludeUpper(a); continue; }
    if (a.k !== 'cit') continue;
    const c = C(a.cid);
    if (a.st === 'petition') {
      const i = S.petitions.findIndex(p => p.cid === c.id);
      if (i >= 0) { const pt = S.petitions[i]; S.petitions.splice(i, 1); beh(c, '祈愿', '闭馆前未获答复，恢复正常备考'); afterFail(c, pt.course, pt.kind, null, false); }
    }
    const opens = openInvs(c);
    if (opens.length) {
      if (!a.evade && staffed('cashier')) { for (const v of opens) payInv(c, v, '闭馆前结清'); }
      else gateCheck(a, c);
    }
    c.agent = 0; c.status = 'home';
  }
  S.petitions = [];
}
function endDay() {
  closeVisits();
  for (const key of S.today) { const ses = S.sessions[key]; if (ses && ses.st === 'run') endSession(ses); }
  S.agents = []; IDX.a.clear();
  // 居家复习、情绪恢复、兜底规划
  for (const c of S.citizens) {
    if (c.study && S.day < c.study.until) { const cur = curCourse(c); if (cur) c.prep[cur] = clamp(c.prep[cur] + c.study.rate, 0, 100); }
    if (c.patience < 70) c.patience = clamp(c.patience + 2, 0, 100);
    if (c.stress > 12) c.stress--;
    if (!c.plan) autoPlan(c);
  }
  // 工资、维护、政策成本
  let wages = 0;
  for (const s of S.staff) {
    if (s.st === 'off' || (s.temp && s.st === 'leave')) continue;
    wages += s.wage;
  }
  if (S.volunteer > 0 && wages > 0) { const save = Math.min(35, wages); wages -= save; S.volunteer--; S.volUsed++; S.stats.volSaved += save; }
  if (wages) cashMove('wage', -wages, '员工工资');
  let upkeep = 0;
  for (const r of S.rooms) upkeep += D.ROOMS[r.type].upkeep;
  if (upkeep) cashMove('upkeep', -upkeep, '房间维护');
  if (S.policies.aiGrading) cashMove('policy', -30, 'AI 辅助阅卷授权费');
  if (S.policies.eDocs) cashMove('policy', -10, '电子材料系统维护');
  S.stats.overhead += wages + upkeep;
  integritySweep();
  // 满意度、怠工投诉、临时工流失与合同到期
  const lounge = hasRoom('lounge');
  for (const s of S.staff.slice()) {
    if (s.st !== 'off' && s.st !== 'leave') {
      let t = 55 + (s.wage - s.expect) * 0.7;
      if (s.st === 'away') t += 3;
      else if (s.rest === 'N' || !s.rested) t -= 14; else if (lounge && s.lounge) t += 6;
      if (s.work > 380) t -= 8;
      if (s.bonusDay === S.day) t += 14;
      s.sat = clamp(Math.round(s.sat + (t - s.sat) * 0.35), 0, 100);
    }
    if (!s.temp) {
      if (s.sat < 25 && chance(0.2)) { addTrust(-1); log('😠 ' + s.name + '（' + D.JOBS[s.job].name + '）长期不满，窗口态度引发投诉：信任 -1。', 'bad'); }
      continue;
    }
    s.lowDays = s.sat < 20 ? s.lowDays + 1 : 0;
    const c = s.cid && C(s.cid);
    if (s.lowDays >= 2 && s.st !== 'away') {
      if (c) beh(c, '离职', '因长期不满主动解除「' + D.JOBS[s.job].name + '」临时合同');
      log('🚪 ' + s.name + '（' + D.JOBS[s.job].name + '）满意度过低，主动离职。', 'key');
      removeStaff(s);
    } else if (S.day >= s.end && s.st !== 'away') {
      if (c) beh(c, '合同期满', '「' + D.JOBS[s.job].name + '」临时合同期满');
      log('📄 ' + s.name + '（' + D.JOBS[s.job].name + '）临时合同期满离岗。', 'key');
      removeStaff(s);
    }
  }
  // 信任与合规的缓慢变化
  const dd = daily(S.day);
  if (dd.esc > 0) addComp(-0.3); else if (S.comp < 70) addComp(0.2);
  let soft = 0;
  for (const k of ['oldEd', 'freeConsult', 'alienEquiv', 'expRecog', 'eDocs']) if (S.policies[k]) soft += 0.15;
  if (soft && S.trust < 85) addTrust(soft);
  if (S.staff.some(s => s.job === 'relations') && S.comp < 78) addComp(0.3);
  if (S.cash < 0) { addTrust(-0.5); log('💸 现金为负：供应商与员工开始议论，信任下降。请削减开支或等待拨款。', 'bad'); }
  // 清理旧数据（个人发票与行为履历永久保留）
  for (const k in S.sessions) if (S.sessions[k].day < S.day - 2) delete S.sessions[k];
  if (S.papers.length > 400) { S.papers = S.papers.filter(p => !p.chk || p.chk > S.day - 10); IDX.p.clear(); S.papers.forEach(p => IDX.p.set(p.id, p)); }
  let cut = 0;
  while (cut < S.ledger.length && S.ledger[cut].d < S.day - 30) { S.ledgerBase += S.ledger[cut].a; cut++; }
  if (cut) S.ledger.splice(0, cut);
  let inc = 0, exp = 0;
  for (const k in dd.inc) inc += dd.inc[k];
  for (const k in dd.exp) exp += dd.exp[k];
  S.lastReport = { day: S.day, inc, exp, net: inc + exp, due: dd.due, esc: dd.esc, vis: dd.vis, cash: S.cash };
  S.day++;
}
function tick() {
  S.minute++;
  const m = S.minute;
  while (S.arr.length && S.arr[0].m <= m) {
    const c = C(S.arr.shift().cid);
    if (c && c.plan && !c.agent) spawnCitizen(c);
  }
  for (let i = S.upQ.length - 1; i >= 0; i--) if (S.upQ[i].m <= m) { spawnUpper(S.upQ[i].role); S.upQ.splice(i, 1); }
  for (const a of S.agents.slice()) {
    if (!IDX.a.has(a.id)) continue;
    if (a.k === 'cit') updCitizen(a); else if (a.k === 'stf') updStaffAgent(a); else updUpper(a);
  }
  for (const rm of S.rooms) updRoomService(rm);
  updExams();
  updGrading();
  if (m === S.bcast) log('📢 ' + pick(D.BROADCASTS), 'cast');
  if (m >= D.DAY_END) { endDay(); startDay(); FX.push('day'); return true; }
  return false;
}
function runDays(n) {
  const target = S.day + n;
  let guard = n * 600 + 10;
  while (S.day < target && guard-- > 0) tick();
}
function runToKey(maxDays) {
  const k0 = S.keySeq, target = S.day + (maxDays || 5);
  let guard = (maxDays || 5) * 600 + 10;
  while (S.day < target && S.keySeq === k0 && guard-- > 0) tick();
  return S.keySeq !== k0;
}
function keyEvents() {
  const ev = [];
  const add = (d, t) => { if (d >= S.day) ev.push({ d, t }); };
  const bySes = {};
  for (const k in S.sessions) {
    const ses = S.sessions[k];
    if (ses.day < S.day || !ses.cids.length || ses.st === 'done' || ses.st === 'cancel') continue;
    const t = ses.kind === 'w' ? timeStr(D.W_SLOTS[ses.slot]) + ' ' + D.COURSE[ses.course].short + '笔试 ' + ses.cids.length + '/' + D.W_SEATS : timeStr(D.P_SLOTS[ses.slot]) + ' 实操 ' + ses.cids.length + '/' + D.P_STATIONS;
    (bySes[ses.day] = bySes[ses.day] || []).push(t);
  }
  for (const d in bySes) add(+d, '考试：' + bySes[d].sort().join('，'));
  for (const s of S.staff) if (s.temp) add(s.end, s.name + '（' + D.JOBS[s.job].name + '）合同到期');
  for (const ap of S.apps) if (!ap.cand) add(ap.day + 1, '人事编制署答复「' + D.JOBS[ap.job].name + '」申请');
  if (S.up.stage === 'trip1' || S.up.stage === 'trip2') add(S.up.back, '外联跑证员返回');
  if (S.up.stage === 'await') add(S.up.visit, '上级复核员最早到场日');
  add(Math.ceil(S.day / D.YEAR_DAYS) * D.YEAR_DAYS + 1, '新学年：考纲与教辅换版');
  let pend = 0;
  for (const p of S.papers) if (p.pub && !p.chk) pend++;
  ev.sort((a, b) => a.d - b.d);
  return { list: ev.slice(0, 12), unchecked: pend, grading: S.gq.length };
}

// ---------- 开局、改名、存档 ----------
function newState(player, center, seed) {
  S = {
    v: D.VERSION, seed: (seed == null ? (Date.now() % 2147483647) : seed) | 0, nextId: 1,
    player: cleanName(player, 24) || '无名局长', center: cleanName(center, 28) || '永生办证中心',
    day: 1, minute: D.DAY_START, cash: D.START_CASH, trust: 55, comp: 65, level: 1, edition: 1, oldEd: 0,
    rooms: [], staff: [], citizens: [], agents: [], papers: [], gq: [], sessions: {}, today: [], arr: [], upQ: [], petitions: [],
    stock: {}, stockCost: {}, old: {}, policies: {}, bought: {}, ledger: [], ledgerBase: 0, daily: {}, tot: {}, log: [], logSeq: 0, keySeq: 0,
    stats: { visits: 0, overhead: 0, examFees: 0, payers: {}, payerCount: 0, consult: 0, escaped: 0, escapedAmt: 0, intercepted: 0, seatings: 0, certs: 0, books: 0,
      exemptions: 0, equiv: 0, cancelled: 0, fines: 0, cheatsCaught: 0, licenses: 0, bribesFound: 0, volSaved: 0 },
    encour: { day: 0, n: 0 }, volunteer: 0, volUsed: 0, cancelAud: 0, apps: [], bribes: [], audits: [], nextAudit: 0, bcast: 0,
    up: { stage: 'idle', target: 0, proofs: [0, 0, 0], back: 0, visit: 0, sid: 0, tut: false, last: '' }, lastReport: null,
  };
  reindex();
  S.nextAudit = ri(6, 9);
  const init = [['reception', 0], ['review', 1], ['cashier', 2], ['bookstore', 3], ['written', 6], ['practical', 7], ['grading', 8], ['lounge', 9]];
  for (const [t, lot] of init) addRoom(t, lot);
  for (const job of ['receptionist', 'reviewer', 'cashier', 'clerk', 'proctor', 'examiner', 'grader']) {
    const p = makePerson(), s = addStaff(p, job, false, D.JOBS[job].wage);
    s.quality = ri(58, 82); s.origin = p.job;
  }
  const g = newCitizen('office');
  g.skills.inspect = Math.max(g.skills.inspect, 62); g.tr.principle = Math.max(g.tr.principle, 55);
  g.firstDay = 1; g.plan = { type: 'register', day: 4 };
  const gs = addStaff(g, 'inspector', true, D.JOBS.inspector.wage);
  gs.end = 10; g.staff = gs.id;
  beh(g, '签约', '开局即签订「巡查员」临时合同：日薪 ' + gs.wage + '，至 ' + dateStr(gs.end) + '（本人也是考生，办理考务时会请假）');
  for (const [sku, n] of [['TC01', 10], ['TC02', 6], ['GC01', 8], ['GC02', 6]]) { S.stock[sku] = n; S.stockCost[sku] = n * D.BOOKS[sku].cost; }
  log('🏛 ' + S.center + ' 开门营业。局长：' + S.player + '。初始为一级资质，可办理「再生生命工程」「智能系统伦理」两项认证。', 'key');
  startDay();
  return S;
}
function rename(player, center) {
  const p = cleanName(player, 24), c = cleanName(center, 28);
  if (p) S.player = p;
  if (c) S.center = c;
  return { ok: true };
}
function serialize() { return JSON.stringify({ app: 'immortality-bureau', v: D.VERSION, S }); }
function load(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  if (!o || o.app !== 'immortality-bureau' || !o.S || !Array.isArray(o.S.citizens) || !Array.isArray(o.S.rooms)) throw new Error('不是有效的《永生办证中心》存档');
  if (o.v !== D.VERSION) throw new Error('存档版本 V' + o.v + ' 与当前 V' + D.VERSION + ' 不兼容');
  S = o.S;
  S.player = cleanName(S.player, 24) || '无名局长'; S.center = cleanName(S.center, 28) || '永生办证中心';
  reindex();
  FX.length = 0;
  return true;
}
function ledgerSum() { let n = S.ledgerBase; for (const e of S.ledger) n += e.a; return n; }

const API = {
  D, FX, get S() { return S; },
  newState, serialize, load, rename, tick, runDays, runToKey, keyEvents, ledgerSum,
  buildRoom, demolishRoom, lotFree, assignStaff, setDuty, setRest, bonus, dismiss, applyFormal, acceptCandidate, declineCandidate,
  offerTemp, offerChance, renew, buyStock, recycleOld, bookAllowed, togglePolicy, encourage, encourLeft, petitionDecide, reorderMid,
  startUpgrade, sendLiaison, stampProof, upgradeConds,
  totals, examView, estPass, curCourse, nextExam, certCount, canEnroll, courseOrder, dayNet, dateStr, dateOf, timeStr, esc, cleanName,
  staffEff, staffSkill, gateWhy, zoneOf, bribeEligible, formalCount,
  geo: { LOT_W, LOT_D, HALL_W, LOT_COLS, LOT_COUNT, ROWS, MAP, OUTSIDE, POSTS, CUST, SEATS, STATIONS, LOUNGE, lotGeom, roomPos },
  TRAIT_NAMES, ENC, PROOFS, TEMP_DAYS,
  C, St, A, Rm, PAPER,
  _: { newCitizen, makePerson, spawnCitizen, invoice, payInv, openInvs, markEscaped, visitFee, consultFee, cashMove, bookExam, reserve, sellBook, autoPlan, afterFail, afterCert,
    grantExemption, publish, publishDue, makePaper, gateCheck, gateInspector, tryBribe, addStaff, deploy, removeStaff, startDay, endDay, runAudit, concludeReview, spawnUpper,
    yearRollover, licensing, examMean, findWritten, cancelSession, doCheck, staffed, hasRoom, roomsOf, addRoom, R, ri, chance, integritySweep, revokeExemption },
};
