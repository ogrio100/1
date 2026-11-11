// ===== 界面：开局命名、顶栏、四页签、个人档案、建造、祈愿、音效字幕、存档 =====
const UI = (function () {
  const D = IB.D, $ = id => document.getElementById(id);
  const h = s => IB.esc(String(s == null ? '' : s));
  const money = n => (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const TICKS_PER_SEC = 2.25; // 1× 速度：一个营业日（540 分钟）约 4 分钟
  const LS_KEY = 'immortality-bureau-save-v08', LS_OPT = 'immortality-bureau-opt';
  const TABS = [['staff', '员工排班'], ['cit', '公民与个案'], ['course', '课程与书店'], ['audit', '审计与政策']];
  const CIT_TABS = [['info', '概况'], ['exam', '考试学籍'], ['bill', '消费账单'], ['beh', '行为履历'], ['hire', '雇佣评估']];
  const ui = {
    started: false, tab: 'staff', speed: 1, paused: false, acc: 0, last: 0, nextRefresh: 0, down: false,
    modal: null, citTab: 'info', q: '', filter: 'all', hl: 0, confirm: '',
    offer: { job: 'inspector', wage: 98, days: 5, swap: false }, applyJob: 'receptionist', renewDays: {},
    sound: true, autosave: true, petPause: true, logSeq: -1, pets: 0, subUntil: 0, hasSave: false,
  };
  try { Object.assign(ui, JSON.parse(localStorage.getItem(LS_OPT) || '{}')); } catch (e) { /* 浏览器禁用存储时使用默认设置 */ }
  const saveOpt = () => { try { localStorage.setItem(LS_OPT, JSON.stringify({ sound: ui.sound, autosave: ui.autosave, petPause: ui.petPause })); } catch (e) { /* 同上 */ } };

  // ---------- 小工具 ----------
  function toast(msg, bad) {
    if (!msg) return;
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = msg;
    $('toast').appendChild(el);
    setTimeout(() => el.remove(), bad ? 4200 : 3000);
  }
  const res = r => { if (r && r.msg) toast(r.msg, r.ok === false); else if (r && r.ok === false) toast('操作未成功', true); return r && r.ok !== false; };
  const bar = (v, cls) => '<span class="bar ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, Math.round(v))) + '%"></i></span>';
  const btn = (act, label, attrs, cls, dis, title) => '<button class="btn ' + (cls || '') + '" data-act="' + act + '" ' + (attrs || '') + (dis ? ' disabled' : '') + (title ? ' title="' + h(title) + '"' : '') + '>' + label + '</button>';
  const opt = (v, label, cur) => '<option value="' + h(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + h(label) + '</option>';
  const face = p => p.species === 'alien' ? '👽' : (p.age >= 62 ? '🧓' : '🧑');
  function roomLabel(rm) {
    const def = D.ROOMS[rm.type];
    if (!def.multi) return def.short;
    const same = IB.S.rooms.filter(r => r.type === rm.type);
    return def.short + (same.length > 1 ? ' ' + (same.indexOf(rm) + 1) + ' 号' : '');
  }
  const kindName = k => k === 'w' ? '笔试' : '实操';

  // ---------- 音效 ----------
  let actx = null;
  const SND = { build: [220, 330], cash: [880, 1320], alert: [440, 330, 440], pass: [660, 880, 1100], fail: [300, 220], ask: [520, 660, 520], pod: [400, 600, 800], bell: [990, 990],
    paper: [700], click: [600], stamp: [160], levelup: [523, 659, 784, 1047], day: [392, 523] };
  const sndAt = {};
  function beep(name) {
    const seq = SND[name];
    if (!ui.sound || !seq) return;
    const now = performance.now();
    if (now - (sndAt[name] || 0) < 260) return;
    sndAt[name] = now;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      let t = actx.currentTime;
      for (const f of seq) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = name === 'stamp' ? 'square' : 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.045, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        o.connect(g); g.connect(actx.destination);
        o.start(t); o.stop(t + 0.14);
        t += 0.09;
      }
    } catch (e) { /* 无音频设备时静默 */ }
  }
  function drainFX(silent) {
    const fx = IB.FX;
    if (!silent) { const seen = {}; for (const n of fx) if (!seen[n]) { seen[n] = 1; beep(n); } }
    fx.length = 0;
  }

  // ---------- 存档：优先 IndexedDB（容量大），退回 localStorage ----------
  const DB = {
    open() {
      return new Promise((ok, no) => {
        if (!window.indexedDB) return no(new Error('无 IndexedDB'));
        const r = indexedDB.open('immortality-bureau', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('saves');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => no(r.error);
      });
    },
    async put(k, v) {
      const db = await this.open();
      return new Promise((ok, no) => {
        const tx = db.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(v, k);
        tx.oncomplete = () => { db.close(); ok(); };
        tx.onerror = tx.onabort = () => { db.close(); no(tx.error); };
      });
    },
    async get(k) {
      const db = await this.open();
      return new Promise((ok, no) => {
        const rq = db.transaction('saves').objectStore('saves').get(k);
        rq.onsuccess = () => { db.close(); ok(rq.result); };
        rq.onerror = () => { db.close(); no(rq.error); };
      });
    },
  };
  async function saveGame(silent) {
    const json = IB.serialize();
    let where = '';
    try { await DB.put('slot1', json); where = '浏览器本地数据库'; } catch (e) {
      try { localStorage.setItem(LS_KEY, json); where = '浏览器本地存储'; } catch (e2) {
        if (!silent || !ui.warnedSave) toast('浏览器存储不可用或空间不足（存档约 ' + Math.round(json.length / 1024) + ' KB）。请用菜单里的“导出 JSON”保存进度。', true);
        ui.warnedSave = true;
        return false;
      }
    }
    ui.hasSave = true;
    if (!silent) toast('已存档到' + where + '（' + Math.round(json.length / 1024) + ' KB）');
    return true;
  }
  async function readSave() {
    try { const v = await DB.get('slot1'); if (v) return v; } catch (e) { /* 退回 localStorage */ }
    try { return localStorage.getItem(LS_KEY); } catch (e) { return null; }
  }
  function applyLoaded(json) {
    try { IB.load(json); } catch (e) { toast('读档失败：' + e.message, true); return false; }
    ui.modal = null; ui.logSeq = -1; ui.acc = 0; ui.pets = IB.S.petitions.length; ui.paused = true;
    enter();
    toast('已读档：' + IB.dateStr(IB.S.day) + '（已暂停，点击速度按钮继续）');
    return true;
  }
  function exportJSON() {
    const blob = new Blob([IB.serialize()], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'immortality-bureau-day' + IB.S.day + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- 开局 ----------
  function renderStart(err) {
    $('start').innerHTML = '<div class="startbox">' +
      '<h1>永生办证中心</h1><div class="en">IMMORTALITY BUREAU · HTML 原型 V' + h(D.VERSION) + '</div>' +
      '<div class="mut">技术已经实现永生。你是一家地方办证中心的局长：公民想合法按下那个“自动修复”按钮，得先在你这里考完七项认证。</div>' +
      '<label for="in-player">局长昵称（最多 24 字）</label><input type="text" id="in-player" maxlength="24" placeholder="例如：老周" autocomplete="off">' +
      '<label for="in-center">办证中心名称（最多 28 字）</label><input type="text" id="in-center" maxlength="28" placeholder="例如：东郊永生办证中心" autocomplete="off">' +
      '<div class="err">' + h(err || '') + '</div>' +
      '<div class="go">' + btn('start', '开始营业', '', 'pri') + (ui.hasSave ? btn('continue', '继续上次存档') : '') + btn('import', '导入 JSON 存档') + '</div>' +
      '<ul><li>一个营业日 08:30—17:30，1× 速度约 4 分钟；一年 12 个月、每月 5 个营业日。</li>' +
      '<li>公民按 登记 → 审核 → 缴费预约 → 笔试/实操 → 阅卷 → 次日后本人返访查分 的真实流程行动。</li>' +
      '<li>点击地图上的人物看档案，点击空地建造，点击房间看详情；右侧四个页签管理全局。</li>' +
      '<li>本原型全部离线运行，不联网，不收集任何数据。</li></ul></div>';
  }
  function startNew() {
    const p = IB.cleanName($('in-player').value, 24), c = IB.cleanName($('in-center').value, 28);
    if (!p) return renderStart('请填写局长昵称。');
    IB.newState(p, c || (p + '的永生办证中心').slice(0, 28));
    ui.logSeq = -1; ui.acc = 0; ui.pets = 0; ui.paused = false; ui.speed = 1; ui.modal = { t: 'help', first: true };
    enter();
  }
  function enter() {
    ui.started = true;
    $('start').hidden = true; $('app').hidden = false;
    IB.FX.length = 0;
    RENDER.resize(); RENDER.resetView();
    renderTop(); refresh(true);
  }

  // ---------- 顶栏 ----------
  function renderTop() {
    $('top').innerHTML = '<div class="brand" data-act="rename" title="点击修改昵称与中心名称"><span id="t-center"></span><small id="t-level"></small></div>' +
      '<div class="stat"><b id="t-date"></b><span id="t-time"></span></div>' +
      '<div class="stat"><b id="t-cash"></b><span id="t-net"></span></div>' +
      '<div class="stat" title="公众信任：影响到访意愿"><b id="t-trust"></b><span>公众信任</span></div>' +
      '<div class="stat" title="机构合规：影响上级态度与升级"><b id="t-comp"></b><span>机构合规</span></div>' +
      '<div class="stat"><b id="t-vis"></b><span>今日到访 / 在场</span></div>' +
      '<div class="grow"></div>' +
      '<div class="seg" id="speed">' + [[0, '⏸ 暂停'], [1, '1×'], [2, '2×'], [4, '4×']].map(s => '<button data-act="speed" data-v="' + s[0] + '">' + s[1] + '</button>').join('') + '</div>' +
      '<div class="seg"><button data-act="skip" data-v="day" title="快进到下一个营业日开门">下一营业日</button><button data-act="skip" data-v="month" title="快进 5 个营业日">快进一月</button><button data-act="skip" data-v="key" title="快进到下一条需要关注的事件（最多 5 日）">到关键事件</button></div>' +
      btn('menu', '☰ 菜单');
  }
  function updTop() {
    const S = IB.S, net = IB.dayNet(S.day);
    $('t-center').textContent = S.center;
    $('t-level').textContent = D.LEVEL_NAMES[S.level] + ' · 局长 ' + S.player;
    $('t-date').textContent = IB.dateStr(S.day);
    $('t-time').textContent = IB.timeStr(S.minute) + (ui.paused ? ' · 已暂停' : '');
    $('t-cash').textContent = '现金 ' + money(S.cash);
    $('t-net').innerHTML = '今日净额 <span class="' + (net >= 0 ? 'up' : 'down') + '">' + (net >= 0 ? '+' : '') + money(net) + '</span>';
    $('t-trust').textContent = S.trust.toFixed(1);
    $('t-comp').textContent = S.comp.toFixed(1);
    const dd = S.daily[S.day];
    $('t-vis').textContent = (dd ? dd.vis : 0) + ' / ' + S.agents.filter(a => a.k === 'cit').length;
    for (const b of $('speed').children) b.classList.toggle('on', ui.paused ? b.dataset.v === '0' : +b.dataset.v === ui.speed);
  }

  // ---------- 地图浮层：待办、祈愿、图例、字幕、事件记录 ----------
  function alerts() {
    const S = IB.S, out = [];
    if (S.petitions.length) out.push({ c: 'ask', tab: 'cit', t: '🙏 ' + S.petitions.length + ' 位公民在祈愿室等候你的裁决' });
    const ready = S.apps.filter(a => a.cand).length;
    if (ready) out.push({ c: 'good', tab: 'staff', t: '📨 人事编制署已派员 ' + ready + ' 人，等待接收' });
    for (const rm of S.rooms) {
      const def = D.ROOMS[rm.type];
      if (def.job && !S.staff.some(s => s.room === rm.id)) out.push({ c: 'bad', tab: 'staff', t: '⚠ ' + roomLabel(rm) + ' 没有排班' + D.JOBS[def.job].name });
    }
    if (!S.staff.some(s => s.job === 'inspector')) out.push({ c: 'bad', tab: 'staff', t: '🛡 没有巡查员：未缴费者离场无人拦截' });
    const up = S.up;
    if (up.stage === 'pack' || up.stage === 'ready') out.push({ c: '', tab: 'audit', t: '🗂 升级材料待派外联跑证员送交' });
    else if (up.stage === 'rejected') out.push({ c: '', tab: 'audit', t: '🈴 升级材料被退回：需补三份盖章证明' });
    else if (up.stage === 'idle' && IB.upgradeConds().ok) out.push({ c: 'good', tab: 'audit', t: '⬆ 已满足升级条件，可申请' + D.LEVEL_NAMES[S.level + 1].split(' · ')[0] });
    for (const s of S.staff) if (s.temp && s.end <= S.day) out.push({ c: '', tab: 'staff', t: '📄 ' + s.name + '（' + D.JOBS[s.job].name + '）合同今日到期' });
    if (S.rooms.some(r => r.type === 'bookstore')) {
      const none = Object.keys(D.BOOKS).filter(k => D.BOOKS[k].course && IB.bookAllowed(k) && !(S.stock[k] > 0)).length;
      if (none) out.push({ c: '', tab: 'course', t: '📚 书店有 ' + none + ' 种已授权教材缺货' });
    }
    if (S.gq.length > 14) out.push({ c: '', tab: 'staff', t: '📝 阅卷积压 ' + S.gq.length + ' 份' });
    return out;
  }
  function renderOverlays() {
    const S = IB.S;
    $('alerts').innerHTML = alerts().slice(0, 7).map(a => '<div class="alert ' + a.c + '" data-act="tab" data-v="' + a.tab + '">' + h(a.t) + '</div>').join('');
    $('petcard').innerHTML = S.petitions.slice(0, 2).map(petHTML).join('') + (S.petitions.length > 2 ? '<div class="alert ask" data-act="tab" data-v="cit">还有 ' + (S.petitions.length - 2) + ' 位在等候…</div>' : '');
    $('legend').innerHTML = '<span><i style="background:#e7b8a5"></i>公民</span><span><i style="background:#3fae93"></i>本中心员工</span><span><i style="background:#2f6fe0"></i>本中心巡查员</span><span><i style="background:#7b3fc4"></i>上级人员</span><span>拖动平移 · 滚轮缩放 · 点击查看</span>';
    if (S.logSeq !== ui.logSeq) {
      const prev = ui.logSeq;
      ui.logSeq = S.logSeq;
      $('logbox').innerHTML = S.log.slice(-70).reverse().map(l => '<div class="lg k-' + l.k + '"><time>' + IB.dateStr(l.d).replace(/^第\d+年/, '') + ' ' + IB.timeStr(l.m) + '</time>' + h(l.t) + '</div>').join('');
      $('logbox').scrollTop = 0;
      const cast = S.log.filter(l => l.n > prev && l.k === 'cast').pop();
      if (cast && prev >= 0) { $('subtitle').textContent = cast.t; $('subtitle').classList.add('on'); ui.subUntil = performance.now() + 7000; }
    }
    if (ui.subUntil && performance.now() > ui.subUntil) { $('subtitle').classList.remove('on'); ui.subUntil = 0; }
  }
  function petHTML(p) {
    const c = IB.C(p.cid);
    if (!c) return '';
    const rec = c.rec[p.course], fails = p.kind === 'w' ? rec.wFails : rec.pFails, id = 'data-id="' + c.id + '"';
    return '<div class="pet"><h4>🙏 续考祈愿：' + h(c.name) + '</h4>' +
      '<div class="sm">「' + h(D.COURSE[p.course].short) + '」' + kindName(p.kind) + '已连续未通过 ' + fails + ' 次 · ' + h(c.tplLabel) + '</div>' +
      '<q>“尊敬的 ' + h(IB.S.player) + ' 局长，恳请您考虑我还未考出来的生命。”</q>' +
      '<div class="row">' +
      btn('pet', '签发单项免考', id + ' data-v="exempt"', 'sm warn', false, '该科' + kindName(p.kind) + '按免考认定，另一项仍须实考；合规 -4，留档待上级抽查') +
      btn('pet', '公益辅助劳动 3 日', id + ' data-v="volunteer"', 'sm', false, '安排轻量辅助工作折抵人工成本；信任 -3、合规 -3') +
      btn('pet', '特别申诉服务费 ' + D.FEES.special, id + ' data-v="fee"', 'sm', false, '只提供心理稳定加成，不保证合格、不能买分') +
      btn('pet', '婉拒，请继续备考', id + ' data-v="ignore"', 'sm', false, '不做任何特殊处理') +
      btn('cit', '档案', id, 'sm') + '</div></div>';
  }

  // ---------- 页签 1：员工排班 ----------
  function staffState(s) {
    const S = IB.S;
    if (s.st === 'off') return ['下个营业日到岗', ''];
    if (s.st === 'leave') return [s.why || '请假', 'r'];
    if (s.st === 'away') return ['外出跑证（' + IB.dateStr(s.back) + ' 返回）', 'y'];
    if (s.st === 'rest' || s.st === 'toRest') return ['错峰休息中', 'y'];
    if (s.st === 'toPost') return ['返岗途中', 'y'];
    if (s.examUntil > S.minute) return ['监考中', 'b'];
    if (s.busy) return ['办理业务中', 'g'];
    if (s.job !== 'inspector' && D.JOBS[s.job].room && !s.room) return ['待命（未排班）', 'r'];
    return ['在岗', 'g'];
  }
  function staffCard(s) {
    const S = IB.S, j = D.JOBS[s.job], st = staffState(s), id = 'data-id="' + s.id + '"';
    let ctl = '';
    if (s.job === 'inspector') {
      ctl += '任务 <select data-chg="duty" ' + id + '>' + Object.keys(D.DUTIES).map(k => opt(k, D.DUTIES[k].name, s.duty)).join('') + '</select>';
    } else if (j.room) {
      const rms = S.rooms.filter(r => r.type === j.room);
      ctl += '岗位 <select data-chg="assign" ' + id + '>' + opt('', rms.length ? '待命（不排班）' : '暂无' + D.ROOMS[j.room].short, s.room || '') + rms.map(r => opt(r.id, roomLabel(r), s.room)).join('') + '</select>';
    }
    ctl += ' 休息 <select data-chg="rest" ' + id + '>' + opt('A', '12:00 班', s.rest) + opt('B', '12:45 班', s.rest) + opt('N', '不休息', s.rest) + '</select>';
    let ops = btn('bonus', '奖金 ' + D.COSTS.bonus, id, 'sm', s.bonusDay === S.day, '满意度 +12，每人每日一次');
    if (s.temp) {
      const rd = ui.renewDays[s.id] || 5;
      ops += ' <select data-chg="renewDays" ' + id + '>' + IB.TEMP_DAYS.map(d => opt(d, '续 ' + d + ' 日', rd)).join('') + '</select>' + btn('renew', '续签', id, 'sm', s.renewDay === S.day);
      if (s.cid) ops += btn('cit', '个人档案', 'data-id="' + s.cid + '"', 'sm');
    }
    ops += btn('dismiss', ui.confirm === 'dismiss' + s.id ? '确认' + (s.temp ? '解约' : '退回') + '？' : (s.temp ? '解约' : '退回编制署'), id, 'sm warn');
    const duty = s.job === 'inspector' ? '<div class="sm mut">' + h(D.DUTIES[s.duty].desc) + (s.caught ? ' 已查处 ' + s.caught + ' 起。' : '') + '</div>' : '';
    return '<div class="card' + (ui.hl === s.id ? ' hl' : '') + '" id="stf' + s.id + '">' +
      '<div class="row sp"><div class="row"><span class="sw" style="background:' + j.color + '"></span><b>' + h(s.name) + '</b><span class="mut">' + face(s) + ' ' + j.name + '</span>' +
      '<span class="tag ' + (s.temp ? 'y' : 'b') + '">' + (s.temp ? '临时合同 · 至 ' + IB.dateStr(s.end).replace(/^第\d+年/, '') : '正式编制') + '</span>' + (s.mismatch ? '<span class="tag r" title="原岗位：' + h(s.origin) + '">不对口</span>' : '') + '</div>' +
      '<span class="tag ' + st[1] + '">' + h(st[0]) + '</span></div>' +
      '<div class="row sm" style="margin:4px 0">能力 <b>' + Math.round(IB.staffSkill(s)) + '</b> · 效率 ×' + IB.staffEff(s).toFixed(2) + ' · 满意度 ' + bar(s.sat, s.sat < 35 ? 'r' : s.sat < 55 ? 'y' : '') + ' ' + Math.round(s.sat) +
      ' · 日薪 ' + s.wage + (s.temp ? '（期望 ' + s.expect + '）' : '') + ' · 今日经办 ' + s.served + '</div>' + duty +
      '<div class="row sm">' + ctl + '<span class="grow"></span>' + ops + '</div></div>';
  }
  function tabStaff() {
    const S = IB.S, cap = D.FORMAL_CAP[S.level];
    const formal = S.staff.filter(s => !s.temp), temp = S.staff.filter(s => s.temp);
    let o = '<h3>人事编制署 <small>正式编制 ' + IB.formalCount() + ' / ' + cap + '（含在途申请）· 次营业日答复 · 派来的人可能不对口</small></h3>';
    o += '<div class="card"><div class="row"><select data-chg="applyJob">' + Object.keys(D.JOBS).filter(k => !D.JOBS[k].temp).map(k => opt(k, D.JOBS[k].name + '（日薪 ' + D.JOBS[k].wage + '）' + (S.rooms.some(r => r.type === D.JOBS[k].room) ? '' : ' · 暂无房间'), ui.applyJob)).join('') + '</select>' +
      btn('apply', '提交用人申请', '', 'pri', IB.formalCount() >= cap) + '<span class="sm mut">接收时收入职手续费 ' + D.COSTS.hire + '</span></div>';
    for (const ap of S.apps) {
      const id = 'data-id="' + ap.id + '"';
      if (!ap.cand) o += '<div class="row sm mut" style="margin-top:5px">📨 「' + D.JOBS[ap.job].name + '」申请已于 ' + IB.dateStr(ap.day) + ' 提交，等待答复… ' + btn('decline', '撤回', id, 'sm') + '</div>';
      else o += '<div class="row sm" style="margin-top:5px">📨 <b>' + h(ap.cand.name) + '</b> ' + face(ap.cand) + ' ' + ap.cand.age + ' 岁 → ' + D.JOBS[ap.job].name + ' · 能力 <b>' + ap.cand.quality + '</b>' +
        (ap.cand.mismatch ? ' <span class="tag r">不对口：原' + h(ap.cand.origin) + '</span>' : ' <span class="tag g">对口</span>') + '<span class="grow"></span>' + btn('accept', '接收', id, 'sm pri') + btn('decline', '退回', id, 'sm') + '</div>';
    }
    o += '</div>';
    o += '<h3>临时合同 <small>巡查员、外联跑证员、政务关系维护员只能从来访公民中签约</small></h3>';
    if (!temp.length) o += '<div class="hint">目前没有临时工。打开任意公民档案的“雇佣评估”页即可谈合同；对方也是考生，办理本人考务当天会请假。</div>';
    o += temp.map(staffCard).join('');
    const leads = talent();
    if (leads) o += '<div class="card"><div class="b sm">人才线索（来访公民中能力靠前者，点击查看）</div>' + leads + '</div>';
    o += '<h3>正式员工 <small>' + formal.length + ' 人 · 不会主动离职</small></h3>' + formal.map(staffCard).join('');
    return o;
  }
  function talent() {
    const S = IB.S, pool = S.citizens.filter(c => c.firstDay && !c.staff);
    if (!pool.length) return '';
    let o = '';
    for (const job of ['inspector', 'liaison', 'relations']) {
      const sk = D.JOBS[job].skill, top = pool.slice().sort((a, b) => b.skills[sk] - a.skills[sk]).slice(0, 3);
      o += '<div class="row sm" style="margin-top:3px"><span class="mut" style="width:104px">' + D.JOBS[job].name + '</span>' +
        top.map(c => '<button class="btn sm" data-act="cit" data-id="' + c.id + '" data-v="hire" data-k="' + job + '">' + h(c.name) + ' ' + c.skills[sk] + '</button>').join('') + '</div>';
    }
    return o;
  }

  // ---------- 页签 2：公民与个案 ----------
  function agentState(a) {
    const rm = a.room && IB.Rm(a.room), rn = rm ? D.ROOMS[rm.type].short : '大厅';
    switch (a.st) {
      case 'q': return '在' + rn + '排队';
      case 'toSvc': case 'svc': return '在' + rn + '办理';
      case 'toSeat': case 'seat': return '在' + rn + '候考';
      case 'exam': return '在' + rn + '考试中';
      case 'petition': return '在祈愿室等候裁决';
      case 'leave': return '正在离场';
      default: return '在馆内走动';
    }
  }
  function citStatus(c) {
    const S = IB.S, a = c.agent && IB.A(c.agent);
    if (a) return ['在场 · ' + agentState(a), 'g'];
    if (c.staff) { const s = IB.St(c.staff); if (s) return ['本中心' + D.JOBS[s.job].name + '（临时合同）', 'b']; }
    if (c.license) return c.slot === 'active' ? ['名额已激活 · 定期修复舱维护', 'p'] : ['已获电子许可 · 名额候补中', 'p'];
    if (c.status === 'waitLevel') return ['等待本中心取得更高资质', 'y'];
    if (c.paper) { const p = IB.PAPER(c.paper); if (p) return [p.pub ? '成绩已发布，待本人返访查分' : '试卷封存待批', 'y']; }
    if (c.booking) return ['已预约 ' + IB.dateStr(c.booking.day).replace(/^第\d+年/, '') + ' ' + kindName(c.booking.kind), ''];
    if (c.paused) return ['暂时休学', 'r'];
    if (c.plan) return ['在家 · ' + (c.plan.day <= S.day ? '今日' : IB.dateStr(c.plan.day).replace(/^第\d+年/, '')) + '来办「' + (D.VISIT_NAMES[c.plan.type] || '业务') + '」', ''];
    return [c.note || '在家', ''];
  }
  function citRows() {
    const S = IB.S, q = ui.q.trim();
    const pet = {};
    for (const p of S.petitions) pet[p.cid] = 1;
    let list = S.citizens.filter(c => c.firstDay);
    if (q) list = list.filter(c => c.name.indexOf(q) >= 0 || c.tplLabel.indexOf(q) >= 0 || c.job.indexOf(q) >= 0);
    if (ui.filter === 'on') list = list.filter(c => c.agent);
    else if (ui.filter === 'owe') list = list.filter(c => c.inv.some(v => v.st === 'esc' || v.st === 'open'));
    else if (ui.filter === 'lic') list = list.filter(c => c.license);
    else if (ui.filter === 'alien') list = list.filter(c => c.species === 'alien');
    else if (ui.filter === 'stuck') list = list.filter(c => !c.license && D.COURSES.some(co => c.rec[co.id].wFails + c.rec[co.id].pFails >= 2 && !c.rec[co.id].cert));
    const rank = c => (pet[c.id] ? 0 : c.agent ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b) || b.lastVisit - a.lastVisit || a.id - b.id);
    const total = list.length;
    list = list.slice(0, 80);
    let o = '<table><tr><th>公民</th><th>状态</th><th class="n">认证</th><th>当前目标</th><th class="n">欠缴</th></tr>';
    for (const c of list) {
      const st = citStatus(c), ne = IB.nextExam(c), t = IB.totals(c);
      o += '<tr class="click" data-act="cit" data-id="' + c.id + '"><td>' + face(c) + ' <b>' + h(c.name) + '</b>' + (pet[c.id] ? ' <span class="tag p">祈愿</span>' : '') + '<div class="sm mut">' + h(c.tplLabel) + '</div></td>' +
        '<td><span class="tag ' + st[1] + '" style="white-space:normal">' + h(st[0]) + '</span></td><td class="n">' + IB.certCount(c) + '/7</td>' +
        '<td class="sm">' + (ne ? h(D.COURSE[ne.course].short) + ' ' + kindName(ne.kind) : (c.license ? '已获许可' : '待汇总上报')) + '</td>' +
        '<td class="n ' + (t.unpaid ? 'bad' : 'mut') + '">' + (t.unpaid ? money(t.unpaid) : '—') + '</td></tr>';
    }
    o += '</table>';
    if (!total) o += '<div class="hint">没有符合条件的公民。</div>';
    else if (total > list.length) o += '<div class="sm mut">共 ' + total + ' 人，仅显示前 ' + list.length + ' 人，可用搜索缩小范围。</div>';
    return o;
  }
  function tabCit() {
    const S = IB.S, known = S.citizens.filter(c => c.firstDay);
    let o = '';
    if (S.petitions.length) o += '<h3>待裁决的续考祈愿 <small>当日闭馆前不处理视为婉拒</small></h3>' + S.petitions.map(petHTML).join('');
    o += '<h3>局长互动 <small>今日剩余 ' + IB.encourLeft() + ' / ' + D.ENCOURAGE_PER_DAY + ' 次 · 每人每日 1 次 · 在个人档案“概况”页使用</small></h3>';
    o += '<h3>公民名册 <small>已到访 ' + known.length + ' 人 · 持证 ' + S.stats.certs + ' 项 · 电子许可 ' + S.stats.licenses + ' 人</small></h3>';
    o += '<div class="row" style="margin-bottom:6px"><input type="search" id="citq" data-inp="q" placeholder="搜索姓名 / 人群 / 职业" value="' + h(ui.q) + '" style="flex:1">' +
      '<select data-chg="filter">' + [['all', '全部'], ['on', '当前在场'], ['stuck', '多次未通过'], ['owe', '有欠缴/逃单'], ['alien', '外星公民'], ['lic', '已获电子许可']].map(f => opt(f[0], f[1], ui.filter)).join('') + '</select></div>';
    o += '<div id="citlist">' + citRows() + '</div>';
    return o;
  }

  // ---------- 页签 3：课程与书店 ----------
  function tabCourse() {
    const S = IB.S, ke = IB.keyEvents();
    let o = '<h3>七项认证学制 <small>每项须笔试、实操双合格；合格成绩在考纲周期内有效</small></h3>';
    o += '<div class="hint">顺序：再生生命工程 → 智能系统伦理 → 中段三科（深空/贡献/礼制，顺序可调）→ 环境安全资质 → 永续行政程序 → 汇总上报 → 上级系统电子签发' + h(D.FINAL_LICENSE) + '。</div>';
    o += '<table><tr><th>认证</th><th>受理</th><th class="n">合格线 笔/实</th><th>实操内容</th><th class="n">在读</th><th class="n">已发证</th></tr>';
    for (const co of D.COURSES) {
      let cur = 0, cert = 0;
      for (const c of S.citizens) { if (c.rec[co.id].cert) cert++; else if (c.firstDay && !c.license && IB.curCourse(c) === co.id) cur++; }
      o += '<tr><td title="' + h(co.name) + '">' + co.icon + ' <b>' + h(co.short) + '</b></td><td>' + (co.level <= S.level ? '<span class="tag g">已开放</span>' : '<span class="tag r">需' + D.LEVEL_NAMES[co.level].split(' · ')[0] + '</span>') + '</td>' +
        '<td class="n">' + co.wLine + ' / ' + co.pLine + '</td><td class="sm mut">' + h(co.prac) + '</td><td class="n">' + cur + '</td><td class="n">' + cert + '</td></tr>';
    }
    o += '</table>';
    const F = D.FEES;
    o += '<h3>收费公示 <small>统一标准价，补考不加价；离场未缴不追缴</small></h3><div class="card sm">建档 ' + F.reg + ' · 每日到访基础办理费 ' + F.visit + '（同日一次）· 笔试报名 ' + F.written + ' · 实操报名 ' + F.practical +
      ' · 缺件咨询 ' + F.consult + ' · 私教一节 ' + F.tutor + ' · 心理辅导 ' + F.counsel + ' · 上报核验 ' + F.report + ' · 修复舱维护 ' + F.pod + '</div>';
    o += '<h3>考务与日程 <small>笔试 09:30 / 14:30 每场一科六席；实操两工位；须提前至少一个营业日预约</small></h3>';
    o += '<div class="card sm"><div>待批试卷 <b>' + ke.grading + '</b> 份 · 已发布但本人尚未返访查分 <b>' + ke.unchecked + '</b> 份</div>' +
      (ke.list.length ? ke.list.map(e => '<div><span class="tag">' + (e.d === S.day ? '今日' : IB.dateStr(e.d).replace(/^第\d+年/, '')) + '</span> ' + h(e.t) + '</div>').join('') : '<div class="mut">暂无已预约的场次。</div>') + '</div>';
    o += '<h3>永生考试书店 <small>当前考纲第 ' + S.edition + ' 版 · 新学年换版后旧版停售</small></h3>';
    if (!S.rooms.some(r => r.type === 'bookstore')) o += '<div class="hint">尚未建成书店。</div>';
    else {
      o += '<table><tr><th>书目</th><th class="n">售价</th><th class="n">进价</th><th class="n">库存</th><th class="n">旧版</th><th></th></tr>';
      for (const sku of Object.keys(D.BOOKS)) {
        const b = D.BOOKS[sku], ok = IB.bookAllowed(sku), old = S.old[sku] || 0, a = 'data-id="' + sku + '"';
        o += '<tr><td>' + h(b.name) + '<div class="sm mut">' + h(b.kind) + ' · 备考 +' + b.prep + '</div></td><td class="n">' + b.price + '</td><td class="n">' + b.cost + '</td>' +
          '<td class="n ' + (ok && !(S.stock[sku] > 0) ? 'bad b' : '') + '">' + (S.stock[sku] || 0) + '</td><td class="n mut">' + (old || '—') + '</td><td class="n">' +
          (ok ? btn('buy', '+5', a + ' data-v="5"', 'sm') + ' ' + btn('buy', '+10', a + ' data-v="10"', 'sm') : '<span class="tag r">未获发行授权</span>') +
          (old ? ' ' + btn('recycle', '回收', a, 'sm', false, '按进价两折回收全部旧版') : '') + '</td></tr>';
      }
      o += '</table><div class="sm mut">官方数字考纲常年免费公开；公民可只靠免费考纲居家复习。' + (S.policies.oldEd ? '已启用“旧版教材互认”：旧版按 6 折明示出售。' : '旧版库存只能回收，除非启用“旧版教材互认”政策。') + '</div>';
    }
    return o;
  }

  // ---------- 页签 4：审计与政策 ----------
  function upgradeHTML() {
    const S = IB.S, up = S.up, cd = IB.upgradeConds();
    let o = '<h3>机构等级 <small>' + D.LEVEL_NAMES[S.level] + '</small></h3><div class="card">';
    if (cd.max) o += '<div class="ok b">已是最高等级，七项认证全部可办理。</div>';
    else {
      o += '<div class="b sm">升为「' + D.LEVEL_NAMES[cd.target] + '」的条件（均为真实经营数据）</div><div class="grid2 sm" style="margin:5px 0">' +
        cd.items.map(i => '<div>' + (i.ok ? '<span class="ok">✔</span>' : '<span class="bad">✘</span>') + ' ' + h(i.label) + ' <b>' + money(i.cur) + '</b> / ' + money(i.need) + '</div>').join('') + '</div>';
      const hasL = S.rooms.some(r => r.type === 'liaison');
      if (up.stage === 'idle') {
        o += '<div class="row">' + btn('upStart', '申请升级', '', 'pri', !cd.ok) + (hasL ? '' : '<span class="sm bad">需先建成政务联络与证照档案室，并签约一名外联跑证员</span>') + '</div>';
        if (up.last) o += '<div class="sm bad">上次复核未通过：' + h(up.last) + '</div>';
      } else if (up.stage === 'pack' || up.stage === 'ready') {
        o += '<div class="row"><span>🗂 材料已装袋，等待送交上级。</span>' + btn('upSend', '派外联跑证员送交', '', 'pri') + '</div>';
      } else if (up.stage === 'trip1' || up.stage === 'trip2') {
        o += '<div>🚶 外联跑证员在路上，预计 ' + IB.dateStr(up.back) + ' 返回。</div>';
      } else if (up.stage === 'rejected') {
        o += '<div class="b">📮 材料被一次性退回，需补三份盖章证明：</div>' + IB.PROOFS.map((p, i) => '<div class="row sm" style="margin-top:4px">' + (up.proofs[i] ? '<span class="ok">✔ 已签章</span>' : btn('stamp', '签章', 'data-v="' + i + '"', 'sm pri')) +
          ' ' + h(p.name) + ' <span class="mut">（需已排班的' + D.JOBS[p.job].name + '）</span></div>').join('');
      } else if (up.stage === 'await') o += '<div>📮 材料已受理，上级复核员最早 ' + IB.dateStr(up.visit) + ' 到场（紫色制服）。请保证监考员、阅卷员当日在岗。</div>';
      else if (up.stage === 'visit') o += '<div class="pur b">🟣 上级复核员正在现场复核。</div>';
      if (!up.tut) o += '<div class="sat">第一次升级需要完整跑一遍：送交 → 退回 → 补三份证明 → 再送交 → 现场复核。之后档案室会自动汇总。</div>';
    }
    return o + '</div>';
  }
  function tabAudit() {
    const S = IB.S, st = S.stats;
    let o = upgradeHTML();
    // 财务
    const dd = S.daily[S.day] || { inc: {}, exp: {}, due: 0, esc: 0, vis: 0 };
    const side = (m, sign) => Object.keys(m).sort((a, b) => Math.abs(m[b]) - Math.abs(m[a])).map(k => '<div class="row sp sm"><span>' + h(D.CATS[k] || k) + '</span><b>' + (sign > 0 ? '+' : '-') + money(Math.abs(m[k])) + '</b></div>').join('') || '<div class="sm mut">暂无</div>';
    o += '<h3>今日账目 <small>全部来自真实发生的流水；现金 = 期初 + 流水合计</small></h3><div class="card"><div class="grid2"><div><div class="b ok sm">收入</div>' + side(dd.inc, 1) + '</div><div><div class="b bad sm">支出（工资、维护于闭馆结算）</div>' + side(dd.exp, -1) + '</div></div>' +
      '<div class="sm mut" style="margin-top:5px">今日开具应缴 ' + money(dd.due) + ' · 离场未缴（逃单）' + money(dd.esc) + '</div></div>';
    let rows = '';
    for (let d = S.day - 1; d >= Math.max(1, S.day - 6); d--) {
      const x = S.daily[d];
      if (!x) continue;
      let inc = 0, exp = 0;
      for (const k in x.inc) inc += x.inc[k];
      for (const k in x.exp) exp += x.exp[k];
      rows += '<tr><td>' + IB.dateStr(d) + '</td><td class="n">' + x.vis + '</td><td class="n ok">+' + money(inc) + '</td><td class="n bad">-' + money(Math.abs(exp)) + '</td><td class="n b">' + money(inc + exp) + '</td><td class="n">' + money(x.esc) + '</td></tr>';
    }
    if (rows) o += '<table><tr><th>营业日</th><th class="n">到访</th><th class="n">收入</th><th class="n">支出</th><th class="n">净额</th><th class="n">逃单</th></tr>' + rows + '</table>';
    const tot = Object.keys(S.tot).sort((a, b) => S.tot[b] - S.tot[a]);
    o += '<div class="card sm" style="margin-top:7px"><div class="b">开业以来累计</div>' + tot.map(k => '<span class="tag ' + (S.tot[k] >= 0 ? 'g' : 'r') + '" style="margin:2px 3px 0 0">' + h(D.CATS[k] || k) + ' ' + (S.tot[k] >= 0 ? '+' : '-') + money(Math.abs(S.tot[k])) + '</span>').join('') + '</div>';
    // 稽核
    const gw = IB.gateWhy(), gateOk = gw === '守门巡查员未能及时发现';
    o += '<h3>收费稽核与纪律</h3><div class="card sm"><div>大门现状：' + (gateOk ? '<span class="ok b">有巡查员值守</span>（能拦下大部分未缴费者，当场结清）' : '<span class="bad b">' + h(gw) + '</span>，未缴费者可直接离场') + '</div>' +
      '<div>累计逃单 <b>' + st.escaped + '</b> 笔 / ' + money(st.escapedAmt) + '（不追缴）· 门口拦截结清 <b>' + st.intercepted + '</b> 人次 · 查处作弊 <b>' + st.cheatsCaught + '</b> 起 · 查实红包 <b>' + st.bribesFound + '</b> 起</div>' +
      '<div>真实到考 <b>' + st.seatings + '</b> 人次 · 独立付费考生 <b>' + st.payerCount + '</b> 人 · 报名费实收 <b>' + money(st.examFees) + '</b> · 因缺岗取消场次 <b>' + st.cancelled + '</b> 场</div>' +
      '<div>局长签发免考 <b>' + st.exemptions + '</b> 份' + (S.volunteer ? ' · 公益辅助劳动剩余 ' + S.volunteer + ' 日' : '') + '</div></div>';
    o += '<h3>上级例行审查 <small>不定期到场（紫色制服），抽查免考、红包、缺岗</small></h3>';
    if (!S.audits.length) o += '<div class="hint">尚未接受过审查。</div>';
    else o += S.audits.slice(-5).reverse().map(a => '<div class="card sm"><div class="row sp"><b>' + IB.dateStr(a.d) + '</b><span>合规 ' + (a.dc >= 0 ? '+' : '') + a.dc + (a.dt ? ' · 信任 ' + (a.dt > 0 ? '+' : '') + a.dt : '') + (a.fine ? ' · <span class="bad">罚款 ' + a.fine + '</span>' : '') + '</span></div>' + a.f.map(x => '<div>· ' + h(x) + '</div>').join('') + '</div>').join('');
    o += '<h3>政策 <small>每项都有真实目标、真实效果与真实代价</small></h3>';
    for (const p of D.POLICIES) {
      const on = !!S.policies[p.key];
      o += '<div class="card"><div class="row sp"><b>' + h(p.name) + '</b>' + btn('policy', on ? '已启用 · 点击停用' : '启用', 'data-id="' + p.key + '"', 'sm ' + (on ? 'pri' : '')) + '</div>' +
        '<div class="sm"><span class="mut">目标</span> ' + h(p.goal) + '　<span class="mut">效果</span> ' + h(p.effect) + '　<span class="mut">代价</span> ' + h(p.cost) + '</div><div class="sat">' + h(p.satire) + '</div></div>';
    }
    return o;
  }

  // ---------- 个人档案（五页） ----------
  function citModal(c) {
    const st = citStatus(c);
    let body = '';
    if (ui.citTab === 'info') body = citInfo(c);
    else if (ui.citTab === 'exam') body = citExam(c);
    else if (ui.citTab === 'bill') body = citBill(c);
    else if (ui.citTab === 'beh') body = citBeh(c);
    else body = citHire(c);
    const a = c.agent && IB.A(c.agent);
    return '<div class="dlg wide"><header><div class="avatar" style="background:hsl(' + c.hue + ',55%,82%)">' + face(c) + '</div><h2>' + h(c.name) + '<small>' + c.age + ' 岁 · ' + h(c.tplLabel) + ' · ' + h(c.job) + '</small>' +
      '<div class="sm"><span class="tag ' + st[1] + '">' + h(st[0]) + '</span> <span class="tag">认证 ' + IB.certCount(c) + '/7</span>' + (c.license ? ' <span class="tag p">电子许可</span>' : '') + '</div></h2>' +
      (a ? btn('locate', '在地图上定位', 'data-id="' + a.id + '"', 'sm') : '') + '<button class="x" data-act="close">×</button></header>' +
      '<div class="dtabs">' + CIT_TABS.map(t => '<button data-act="citTab" data-v="' + t[0] + '" class="' + (ui.citTab === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div><div class="body">' + body + '</div></div>';
  }
  function citInfo(c) {
    const S = IB.S, left = IB.encourLeft(), used = c.encDay === S.day;
    let o = '<div class="hint">' + h(c.bg) + ' 来办证的原因：' + h(c.motive) + '。</div>';
    o += '<div class="grid2"><div><div class="b sm">性格</div>' + Object.keys(IB.TRAIT_NAMES).map(k => '<div class="row sm"><span style="width:52px" class="mut">' + IB.TRAIT_NAMES[k] + '</span>' + bar(c.tr[k], 'w') + ' ' + c.tr[k] + '</div>').join('') + '</div>' +
      '<div><div class="b sm">当前状态</div>' +
      '<div class="row sm"><span style="width:64px" class="mut">压力</span>' + bar(c.stress, 'w ' + (c.stress > 60 ? 'r' : 'y')) + ' ' + Math.round(c.stress) + '</div>' +
      '<div class="row sm"><span style="width:64px" class="mut">耐心</span>' + bar(c.patience, 'w') + ' ' + Math.round(c.patience) + '</div>' +
      '<div class="row sm"><span style="width:64px" class="mut">与局长关系</span>' + bar(c.relation, 'w') + ' ' + Math.round(c.relation) + '</div>' +
      '<div class="row sm"><span style="width:64px" class="mut">经济压力</span>' + bar(c.fin, 'w ' + (c.fin > 70 ? 'r' : 'y')) + ' ' + c.fin + '</div>' +
      '<dl class="kv sm" style="margin-top:6px"><dt>物种</dt><dd>' + (c.species === 'alien' ? '外星文明公民' : '地球人类') + '</dd><dt>首次到访</dt><dd>' + (c.firstDay ? IB.dateStr(c.firstDay) : '尚未到访') + '</dd><dt>到访次数</dt><dd>' + c.visitN + '</dd>' +
      (c.exp.length ? '<dt>对口资历</dt><dd>' + c.exp.map(x => h(D.COURSE[x].short)).join('、') + '（已验证的从业经验）</dd>' : '') +
      (c.strategy ? '<dt>最近抉择</dt><dd>' + h(c.strategy) + '</dd>' : '') + (c.note ? '<dt>备注</dt><dd>' + h(c.note) + '</dd>' : '') + '</dl></div></div>';
    o += '<h3>局长互动 <small>不收费、不改成绩 · 今日全中心剩余 ' + left + ' 次' + (used ? ' · 今天已与其谈过' : '') + '</small></h3><div class="row">' +
      Object.keys(IB.ENC).map(k => { const e = IB.ENC[k]; return btn('enc', e.name, 'data-id="' + c.id + '" data-v="' + k + '"', '', !left || used, '耐心 +' + e.pat + '，压力 ' + e.stress + (e.prep ? '，准备度 +' + e.prep : '') + (e.trust ? '，公众信任 +' + e.trust : '')); }).join('') + '</div>';
    return o;
  }
  function citExam(c) {
    const S = IB.S, order = IB.courseOrder(c), ne = IB.nextExam(c);
    let o = '';
    if (c.license) o += '<div class="hint">🏅 ' + IB.dateStr(c.licDay) + ' 由上级系统电子签发' + h(D.FINAL_LICENSE) + '（非本中心制证）。' + (c.slot === 'active' ? '生命维护名额已激活，已完成修复舱维护 ' + c.pods + ' 次' + (c.annual ? '；年度文明更新确认 ' + c.annual.n + ' 次，下次 ' + IB.dateStr(c.annual.due) : '') + '。' : '签发不等于名额，现处于公开候补。') + '</div>';
    else if (ne) {
      const co = D.COURSE[ne.course];
      o += '<div class="card"><div class="b">当前目标：' + co.icon + ' ' + h(co.short) + ' · ' + kindName(ne.kind) + '</div>' +
        '<div class="row sm" style="margin-top:4px">准备度 ' + bar(c.prep[ne.course], 'w') + ' ' + Math.round(c.prep[ne.course]) + '</div>' +
        '<div class="sm">估计通过率（仅为估计，实际成绩有波动）：笔试 <b>约 ' + IB.estPass(c, ne.course, 'w') + '%</b> · 实操 <b>约 ' + IB.estPass(c, ne.course, 'p') + '%</b></div>' +
        (co.level > S.level ? '<div class="sm bad">本中心尚未取得受理该认证的资质，对方只能等待。</div>' : '') +
        (c.species === 'alien' && co.alienPen && !S.policies.alienEquiv ? '<div class="sm warnc">实操设备与礼制模板不适配该物种，存在适配性扣分（可用“跨文明等效与物种适配”政策消除）。</div>' : '') + '</div>';
    } else o += '<div class="hint">七项认证已齐，等待到汇总上报处办理上报。</div>';
    o += '<table><tr><th></th><th>认证</th><th>笔试</th><th>实操</th><th>证书</th><th></th></tr>';
    order.forEach((id, i) => {
      const co = D.COURSE[id], v = IB.examView(c, id), mi = c.mid.indexOf(id);
      const cell = x => '<span class="' + (x.cls === 'ok' ? 'ok' : x.cls === 'bad' ? 'bad' : x.cls === 'ex' ? 'pur' : x.cls === 'seal' ? 'warnc' : '') + '">' + h(x.text) + '</span>' + (x.fails ? '<div class="sm mut">累计未通过 ' + x.fails + ' 次 · 合格线 ' + x.line + '</div>' : '<div class="sm mut">合格线 ' + x.line + '</div>');
      o += '<tr><td class="mut">' + (i + 1) + '</td><td title="' + h(co.name) + '">' + co.icon + ' <b>' + h(co.short) + '</b>' + (co.level > S.level ? '<div><span class="tag r">本中心未获授权</span></div>' : '') + '</td><td>' + cell(v.w) + '</td><td>' + cell(v.p) + '</td>' +
        '<td>' + (v.cert ? '<span class="tag g">已发证</span><div class="sm mut">' + IB.dateStr(v.certDay) + '</div>' : '<span class="mut">—</span>') + '</td>' +
        '<td class="n">' + (mi >= 0 ? btn('mid', '▲', 'data-id="' + c.id + '" data-k="' + id + '" data-v="-1"', 'sm', mi === 0, '提前') + btn('mid', '▼', 'data-id="' + c.id + '" data-k="' + id + '" data-v="1"', 'sm', mi === c.mid.length - 1, '延后') : '') + '</td></tr>';
    });
    o += '</table><div class="sm mut">未经本人返访查分的成绩不会显示。中段三科在尚未报考前可由局长调整顺序。免考凭证每门最多一张，且只能免笔试或实操其中一项。</div>';
    const books = Object.keys(c.books);
    o += '<h3>已购教材</h3>' + (books.length ? '<div class="sm">' + books.map(k => { const p = k.split('@'); return '<span class="tag" style="margin:0 4px 4px 0">' + h((D.BOOKS[p[0]] || {}).name || p[0]) + ' · 第 ' + h(p[1]) + ' 版</span>'; }).join('') + '</div>' : '<div class="sm mut">没有购买任何教材（免费公开考纲同样可以备考）。</div>');
    return o;
  }
  function citBill(c) {
    const t = IB.totals(c);
    let o = '<div class="grid2"><div class="card"><dl class="kv sm"><dt>累计应缴</dt><dd class="b">' + money(t.due) + '</dd><dt>累计实收</dt><dd class="b ok">' + money(t.paid) + '</dd><dt>未缴 / 逃单</dt><dd class="b ' + (t.unpaid ? 'bad' : '') + '">' + money(t.unpaid) + '</dd></dl></div>' +
      '<div class="card"><dl class="kv sm"><dt>直接成本</dt><dd>' + money(t.cost) + '</dd><dt>直接毛利</dt><dd>' + money(t.gross) + '</dd><dt>分摊后估算贡献</dt><dd class="b">' + money(t.est) + '<span class="mut">（估算：按到访次数分摊人工与维护 ' + money(t.share) + '）</span></dd></dl></div></div>';
    if (!c.inv.length) return o + '<div class="hint">尚无任何收费记录。</div>';
    o += '<table><tr><th>开具</th><th>项目</th><th class="n">应缴</th><th class="n">实收</th><th>状态</th></tr>';
    for (const v of c.inv.slice().reverse()) {
      const s = v.st === 'paid' ? '<span class="tag g">已缴' + (v.how && v.how !== '收费室' ? ' · ' + h(v.how) : '') + '</span>' : v.st === 'esc' ? '<span class="tag r" title="' + h(v.note || '') + '">离场未缴（不追缴）</span>' : '<span class="tag y">待缴</span>';
      o += '<tr><td class="sm mut">' + IB.dateStr(v.d) + ' ' + IB.timeStr(v.m) + '</td><td>' + h(v.item) + (v.st === 'esc' && v.note ? '<div class="sm mut">' + h(v.note) + '</div>' : '') + '</td><td class="n">' + money(v.due) + '</td><td class="n">' + money(v.paid) + '</td><td>' + s + '</td></tr>';
    }
    return o + '</table><div class="sm mut">补考按统一标准价再次报名，不加价。临时工工资不抵扣个人账单。</div>';
  }
  function citBeh(c) {
    const list = c.beh.filter(b => !b.hid).slice().reverse();
    if (!list.length) return '<div class="hint">尚无行为记录。</div>';
    return '<table>' + list.map(b => '<tr><td class="sm mut" style="width:118px">' + IB.dateStr(b.d) + ' ' + IB.timeStr(b.m) + '</td><td style="width:86px"><span class="tag">' + h(b.a) + '</span></td><td>' + h(b.t) + '</td></tr>').join('') + '</table>' +
      '<div class="sm mut">未被发现的违规行为不会出现在履历中，查实后才会补记。</div>';
  }
  function citHire(c) {
    const S = IB.S, f = ui.offer;
    let o = '<div class="grid2"><div><div class="b sm">可评估能力</div>' + [['inspect', '巡查稽核'], ['liaison', '外联跑证'], ['relate', '关系维护']].map(k => '<div class="row sm"><span style="width:64px" class="mut">' + k[1] + '</span>' + bar(c.skills[k[0]], 'w') + ' ' + c.skills[k[0]] + '</div>').join('') + '</div>' +
      '<div><dl class="kv sm"><dt>期望日薪</dt><dd>约 ' + c.expect + '</dd><dt>原则性</dt><dd>' + c.tr.principle + (c.tr.principle > 70 ? '（很难接受违规交换）' : '') + '</dd><dt>经济压力</dt><dd>' + c.fin + '</dd></dl></div></div>';
    const s = c.staff && IB.St(c.staff);
    if (s) return o + '<div class="card"><b>现任本中心「' + D.JOBS[s.job].name + '」</b>（临时合同）· 日薪 ' + s.wage + ' · 至 ' + IB.dateStr(s.end) + ' · 满意度 ' + Math.round(s.sat) + '<div class="row" style="margin-top:6px">' + btn('gotoStaff', '到员工排班查看', 'data-id="' + s.id + '"', 'sm') + '</div></div>' +
      '<div class="sm mut">临时工仍保留考籍，办理本人考务当天会请假。</div>';
    if (!c.firstDay) return o + '<div class="hint">对方尚未到访过本中心，无法谈合同。</div>';
    const cur = IB.curCourse(c), canSwap = cur && !c.rec[cur].wEx && !c.rec[cur].pEx;
    const p = IB.offerChance(c, f.job, f.wage, f.days, f.swap && canSwap), will = p >= 0.7 ? '较高' : p >= 0.4 ? '一般' : '较低';
    o += '<h3>临时合同邀约 <small>每人每日只能谈一次</small></h3><div class="card"><div class="row">岗位 <select data-chg="offerJob">' + ['inspector', 'liaison', 'relations'].map(k => opt(k, D.JOBS[k].name, f.job)).join('') + '</select>' +
      ' 日薪 <input type="number" data-chg="offerWage" min="40" max="200" step="2" value="' + f.wage + '" style="width:70px">' +
      ' 期限 <select data-chg="offerDays">' + IB.TEMP_DAYS.map(d => opt(d, d + ' 个营业日', f.days)).join('') + '</select></div>' +
      '<label class="row sm" style="margin-top:6px"><input type="checkbox" data-chg="offerSwap"' + (f.swap && canSwap ? ' checked' : '') + (canSwap ? '' : ' disabled') + '> 以当前科目的单项免考作为交换条件 <span class="bad">（违规：会留档，上级抽查查实将撤销并罚款；原则性高者会拒绝并举报）</span></label>' +
      '<div class="row sp" style="margin-top:6px"><span class="sm">接受意愿估计：<b>' + will + '</b><span class="mut">（估计）</span>' + (D.JOBS[f.job].room && !S.rooms.some(r => r.type === D.JOBS[f.job].room) ? ' · <span class="bad">需先建成' + D.ROOMS[D.JOBS[f.job].room].short + '</span>' : '') + '</span>' +
      btn('offer', c.askDay === S.day ? '今日已谈过' : '发出邀约', 'data-id="' + c.id + '"', 'pri', c.askDay === S.day) + '</div></div>' +
      '<div class="sm mut">巡查员可分配大门收费稽核、考场纪律、员工廉洁、全馆机动四种任务；外联跑证员负责机构升级送件；政务关系维护员可缩短跑证天数。</div>';
    return o;
  }

  // ---------- 房间、建造及其他弹窗 ----------
  function roomModal(rm) {
    const S = IB.S, def = D.ROOMS[rm.type];
    const stf = S.staff.filter(s => s.room === rm.id);
    let o = '<div class="hint">' + h(def.desc) + ' 每营业日维护费 ' + def.upkeep + '，建于 ' + IB.dateStr(rm.built) + '。</div>';
    if (def.job) o += '<h3>排班 <small>岗位：' + D.JOBS[def.job].name + '</small></h3>' + (stf.length ? stf.map(s => { const st = staffState(s); return '<div class="row sm"><span class="sw" style="background:' + D.JOBS[s.job].color + '"></span><b>' + h(s.name) + '</b><span class="tag ' + st[1] + '">' + h(st[0]) + '</span>' + btn('gotoStaff', '排班', 'data-id="' + s.id + '"', 'sm') + '</div>'; }).join('') : '<div class="bad sm">没有排班人员，该房间无法提供服务。' + btn('tab', '去排班', 'data-v="staff"', 'sm') + '</div>');
    if (rm.q.length) o += '<h3>排队 <small>' + rm.q.length + ' 人</small></h3><div class="row">' + rm.q.slice(0, 12).map(aid => { const a = IB.A(aid), c = a && IB.C(a.cid); return c ? '<button class="btn sm" data-act="cit" data-id="' + c.id + '">' + h(c.name) + '</button>' : ''; }).join('') + '</div>';
    if (rm.type === 'written' || rm.type === 'practical') {
      const ses = Object.keys(S.sessions).map(k => S.sessions[k]).filter(x => x.room === rm.id && x.cids.length && x.st !== 'done' && x.st !== 'cancel').sort((a, b) => a.day - b.day || a.slot - b.slot);
      o += '<h3>已预约场次</h3>' + (ses.length ? ses.slice(0, 10).map(x => '<div class="card sm"><b>' + (x.day === S.day ? '今日' : IB.dateStr(x.day)) + ' ' + IB.timeStr(x.kind === 'w' ? D.W_SLOTS[x.slot] : D.P_SLOTS[x.slot]) + '</b> ' +
        (x.kind === 'w' ? h(D.COURSE[x.course].short) + ' 笔试' : '实操考核') + ' ' + (x.st === 'run' ? '<span class="tag b">进行中</span>' : '') + '<div class="row" style="margin-top:3px">' + x.cids.map(cid => { const c = IB.C(cid); return c ? '<button class="btn sm" data-act="cit" data-id="' + c.id + '">' + h(c.name) + '</button>' : ''; }).join('') + '</div></div>').join('') : '<div class="sm mut">暂无预约。</div>');
    }
    if (rm.type === 'grading') o += '<h3>阅卷</h3><div class="sm">待批 <b>' + S.gq.length + '</b> 份。成绩最早在考试次营业日发布，本人返访查分后才生效。' + (S.policies.aiGrading ? ' AI 辅助阅卷已启用（仍需阅卷员在岗签字）。' : '') + '</div>';
    if (rm.type === 'bookstore') o += '<div class="row">' + btn('tab', '管理库存与进货', 'data-v="course"', 'sm') + '</div>';
    if (rm.type === 'liaison') o += '<div class="row">' + btn('tab', '查看机构升级进度', 'data-v="audit"', 'sm') + '</div>';
    if (rm.type === 'petition') o += '<div class="sm">' + (S.petitions.length ? '有 ' + S.petitions.length + ' 位公民在等候裁决。' : '连续落榜的公民会来这里向局长申诉。') + '</div>';
    const back = Math.round(def.cost * 0.3);
    o += '<h3>拆除</h3><div class="row">' + btn('demolish', ui.confirm === 'demo' + rm.id ? '确认拆除？' : '拆除房间（返还 ' + back + '）', 'data-id="' + rm.id + '"', 'sm warn') + '<span class="sm mut">房间内有人办理或有已预约场次时无法拆除。</span></div>';
    return '<div class="dlg"><header><span class="sw" style="background:' + def.color + ';width:20px;height:20px;border:1px solid var(--line)"></span><h2>' + h(def.name) + '<small>' + h(roomLabel(rm)) + '</small></h2><button class="x" data-act="close">×</button></header><div class="body">' + o + '</div></div>';
  }
  function buildModal(lot) {
    const S = IB.S;
    let o = '<div class="buildgrid">';
    for (const t of D.ROOM_ORDER) {
      const def = D.ROOMS[t], has = S.rooms.some(r => r.type === t);
      const why = !def.multi && has ? '已建成（只能建一间）' : S.cash < def.cost ? '现金不足' : '';
      o += '<div class="card' + (why ? ' dis' : '') + '" ' + (why ? '' : 'data-act="build" data-id="' + lot + '" data-v="' + t + '"') + '><div class="row sp"><b><span class="sw" style="background:' + def.color + ';border:1px solid var(--line)"></span> ' + h(def.name) + '</b><span class="b">' + money(def.cost) + '</span></div>' +
        '<div class="sm mut">' + h(def.desc) + '</div><div class="sm">维护 ' + def.upkeep + '/日' + (def.job ? ' · 需' + D.JOBS[def.job].name + (D.JOBS[def.job].temp ? '（临时合同）' : '') : ' · 无需排班') + (why ? ' · <span class="bad">' + why + '</span>' : '') + '</div></div>';
    }
    return '<div class="dlg wide"><header><h2>在空地上建造<small>现金 ' + money(S.cash) + ' · 单层平面，共 ' + IB.geo.LOT_COUNT + ' 块地</small></h2><button class="x" data-act="close">×</button></header><div class="body">' + o + '</div></div></div>';
  }
  function menuModal() {
    const chk = (k, label) => '<label class="row"><input type="checkbox" data-chg="opt" data-k="' + k + '"' + (ui[k] ? ' checked' : '') + '> ' + label + '</label>';
    return '<div class="dlg"><header><h2>菜单</h2><button class="x" data-act="close">×</button></header><div class="body">' +
      '<h3>存档</h3><div class="row">' + btn('save', '💾 存档') + btn('load', '📂 读取存档') + btn('export', '⬇ 导出 JSON') + btn('import', '⬆ 导入 JSON') + '</div>' +
      '<div class="sm mut" style="margin-top:4px">存档保存在本机浏览器内；长期游玩后存档会达到数 MB，建议定期导出 JSON 备份。</div>' +
      '<h3>设置</h3>' + chk('sound', '音效') + chk('autosave', '每个营业日开门时自动存档') + chk('petPause', '有公民祈愿时自动暂停') +
      '<h3>其他</h3><div class="row">' + btn('rename', '修改昵称与中心名称') + btn('help', '玩法说明') + btn('restart', ui.confirm === 'restart' ? '确认放弃当前进度？' : '重新开局', '', 'warn') + '</div></div></div>';
  }
  function renameModal() {
    const S = IB.S;
    return '<div class="dlg"><header><h2>修改名称</h2><button class="x" data-act="close">×</button></header><div class="body">' +
      '<div class="row" style="margin-bottom:8px"><span style="width:90px">局长昵称</span><input type="text" id="rn-player" maxlength="24" value="' + h(S.player) + '" style="flex:1"></div>' +
      '<div class="row" style="margin-bottom:10px"><span style="width:90px">中心名称</span><input type="text" id="rn-center" maxlength="28" value="' + h(S.center) + '" style="flex:1"></div>' +
      '<div class="row">' + btn('renameOk', '保存', '', 'pri') + '<span class="sm mut">改名后招牌、公告与后续记录同步更新；已写入履历的旧记录保持原样。</span></div></div></div>';
  }
  function helpModal(first) {
    const S = IB.S;
    return '<div class="dlg wide"><header><h2>' + (first ? '欢迎上任，' + h(S.player) + ' 局长' : '玩法说明') + '<small>' + h(S.center) + '</small></h2><button class="x" data-act="close">×</button></header><div class="body">' +
      '<div class="hint">技术上，公民只需要按下那个绿色的“自动修复”按钮。但在按下之前，他们得先考完七项认证、交齐材料、等上级电子签发、再排队等名额。你负责让这一切“合规地”运转。</div>' +
      '<div class="grid2"><div><h3>公民怎么行动</h3><div class="sm">登记建档 → 材料审核（可能缺件，回家补件再来）→ 收费室缴费并预约 → 按预约日到考 → 试卷封存、阅卷员批阅 → 最早次营业日发布 → <b>本人再来一趟查分</b> → 合格进入下一项，不合格自己决定买教辅、请私教、回家复习或直接再约。</div>' +
      '<h3>钱从哪里来</h3><div class="sm">每日定额拨款，加上真实发生的登记、到访、报名、咨询、教材等收费。补考不加价。没缴费就走出离场线的，账就挂在那里，不追缴——除非大门有巡查员拦下。</div></div>' +
      '<div><h3>你能做什么</h3><div class="sm">· 点击<b>空地</b>建房，点击<b>房间</b>看排班与场次，点击<b>人物</b>看五页档案。<br>· <b>员工排班</b>：向人事编制署申请正式员工（次日答复，可能不对口）；巡查员、外联跑证员只能从来访公民里签临时合同。<br>· <b>公民与个案</b>：处理续考祈愿，每天可鼓励 3 人次。<br>· <b>课程与书店</b>：进货、换版、看考试日程。<br>· <b>审计与政策</b>：看账、申请机构升级、开关政策。</div>' +
      '<h3>开局提示</h3><div class="sm">一级中心只能受理前两项认证。攒够真实到考与报名数据后，建政务联络处、签一名外联跑证员，去申请升级。开局那位巡查员的合同第 10 个营业日到期，记得续签。</div></div></div>' +
      '<div class="row" style="margin-top:12px">' + btn('close', first ? '开门营业' : '知道了', '', 'pri') + '</div></div></div>';
  }
  function renderModal() {
    const m = ui.modal, el = $('modal');
    if (!m) { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; } return; }
    let html = '';
    if (m.t === 'cit') { const c = IB.C(m.id); if (c) html = citModal(c); }
    else if (m.t === 'room') { const rm = IB.Rm(m.id); if (rm) html = roomModal(rm); }
    else if (m.t === 'build') html = IB.lotFree(m.lot) ? buildModal(m.lot) : '';
    else if (m.t === 'menu') html = menuModal();
    else if (m.t === 'rename') html = renameModal();
    else if (m.t === 'help') html = helpModal(m.first);
    if (!html) { ui.modal = null; el.hidden = true; el.innerHTML = ''; return; }
    const body = el.querySelector('.body'), top = body ? body.scrollTop : 0, same = el.dataset.key === m.t + ':' + (m.id || m.lot || '') + ':' + (m.t === 'cit' ? ui.citTab : '');
    el.innerHTML = html; el.hidden = false;
    el.dataset.key = m.t + ':' + (m.id || m.lot || '') + ':' + (m.t === 'cit' ? ui.citTab : '');
    const nb = el.querySelector('.body');
    if (nb && same) nb.scrollTop = top;
  }

  // ---------- 刷新 ----------
  const editing = box => { const a = document.activeElement; return a && box.contains(a) && (a.tagName === 'SELECT' || a.tagName === 'INPUT'); };
  function renderPanel() {
    const S = IB.S;
    const dots = { staff: S.apps.filter(a => a.cand).length, cit: S.petitions.length, course: 0, audit: (S.up.stage === 'pack' || S.up.stage === 'ready' || S.up.stage === 'rejected') ? 1 : 0 };
    $('tabs').innerHTML = TABS.map(t => '<button data-act="tab" data-v="' + t[0] + '" class="' + (ui.tab === t[0] ? 'on' : '') + '">' + t[1] + (dots[t[0]] ? '<span class="dot">' + dots[t[0]] + '</span>' : '') + '</button>').join('');
    $('tabbody').innerHTML = ui.tab === 'staff' ? tabStaff() : ui.tab === 'cit' ? tabCit() : ui.tab === 'course' ? tabCourse() : tabAudit();
  }
  function refresh(force) {
    if (!ui.started) return;
    updTop();
    renderOverlays();
    if (force || !(ui.down || editing($('panel')))) renderPanel();
    if (force || !(ui.down || editing($('modal')))) renderModal();
    ui.nextRefresh = performance.now() + 450;
  }

  // ---------- 时间推进 ----------
  function onNewDay(quiet) {
    const r = IB.S.lastReport;
    if (r && !quiet) toast(IB.dateStr(r.day) + ' 结算：收入 ' + money(r.inc) + '，支出 ' + money(Math.abs(r.exp)) + '，净额 ' + (r.net >= 0 ? '+' : '') + money(r.net) + '，到访 ' + r.vis + ' 人次');
    if (ui.autosave) saveGame(true);
  }
  function checkPetition() {
    const n = IB.S.petitions.length;
    const more = n > ui.pets;
    ui.pets = n;
    if (more && ui.petPause && !ui.paused) { ui.paused = true; toast('有公民在祈愿室等候裁决，已自动暂停'); }
    return more;
  }
  function skip(mode) {
    const S0 = IB.S, target = S0.day + (mode === 'day' ? 1 : 5), k0 = S0.keySeq;
    let guard = 5 * 600 + 20, days = 0, why = '';
    while (IB.S.day < target && guard-- > 0) {
      if (IB.tick()) days++;
      if (IB.S.petitions.length > ui.pets) { why = '有公民祈愿，快进已停下'; break; }
      ui.pets = IB.S.petitions.length;
      if (mode === 'key' && IB.S.keySeq !== k0) { why = '出现需要关注的事件'; break; }
    }
    drainFX(true);
    ui.acc = 0;
    if (days) onNewDay(true);
    if (why) { ui.paused = true; ui.pets = IB.S.petitions.length; toast(why + '（已暂停）'); beep('ask'); }
    else toast('已快进到 ' + IB.dateStr(IB.S.day) + ' ' + IB.timeStr(IB.S.minute));
    refresh(true);
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!ui.started) return;
    const dt = Math.min(0.25, (ts - ui.last) / 1000 || 0);
    ui.last = ts;
    let ticked = false;
    if (!ui.paused) {
      ui.acc += dt * TICKS_PER_SEC * ui.speed;
      let n = 0;
      while (ui.acc >= 1 && n < 12) {
        ui.acc -= 1; n++; ticked = true;
        if (IB.tick()) onNewDay(false);
        if (checkPetition()) { ui.acc = 0; break; }
      }
      if (ui.acc > 1) ui.acc = 1;
    }
    if (ticked) drainFX(false);
    RENDER.draw(ui.paused ? 1 : Math.min(1, ui.acc));
    if (ticked || ts > ui.nextRefresh) { if (ts > ui.nextRefresh) refresh(false); else updTop(); }
  }

  // ---------- 交互 ----------
  const ACT = {
    start: startNew,
    async continue() { const j = await readSave(); if (j) applyLoaded(j); else renderStart('没有找到存档。'); },
    import() { $('importfile').value = ''; $('importfile').click(); },
    speed(d) { const v = +d.v; if (!v) ui.paused = !ui.paused; else { ui.speed = v; ui.paused = false; } beep('click'); },
    skip(d) { skip(d.v); },
    tab(d) { ui.tab = d.v; ui.modal = null; ui.confirm = ''; $('tabbody').scrollTop = 0; },
    menu() { ui.modal = { t: 'menu' }; },
    help() { ui.modal = { t: 'help' }; },
    rename() { ui.modal = { t: 'rename' }; },
    renameOk() { IB.rename($('rn-player').value, $('rn-center').value); ui.modal = null; toast('名称已更新'); },
    close() { ui.modal = null; ui.confirm = ''; },
    zoom(d) { const f = +d.a; if (f) RENDER.zoomBy(f); else RENDER.resetView(); },
    cit(d) { ui.modal = { t: 'cit', id: +d.id }; ui.citTab = d.v || ui.citTab; if (d.k) { ui.offer.job = d.k; ui.offer.wage = D.JOBS[d.k].wage; } const c = IB.C(+d.id); if (c && c.agent) RENDER.state.sel = c.agent; },
    citTab(d) { ui.citTab = d.v; },
    locate(d) { const a = IB.A(+d.id); if (a) { RENDER.state.sel = a.id; RENDER.focus(a.x, a.y); ui.modal = null; } },
    pet(d) { res(IB.petitionDecide(+d.id, d.v)); ui.pets = IB.S.petitions.length; beep('stamp'); },
    enc(d) { res(IB.encourage(+d.id, d.v)); },
    mid(d) { if (!IB.reorderMid(+d.id, d.k, +d.v)) toast('只能调整尚未报考的中段科目', true); },
    offer(d) { const f = ui.offer; const r = IB.offerTemp(+d.id, f.job, f.wage, f.days, f.swap); res(r); if (r.accepted) { beep('pass'); f.swap = false; } },
    gotoStaff(d) { ui.tab = 'staff'; ui.hl = +d.id; ui.modal = null; setTimeout(() => { const el = $('stf' + d.id); if (el) el.scrollIntoView({ block: 'center' }); }, 30); },
    apply() { res(IB.applyFormal(ui.applyJob)) && toast('申请已提交，最早次营业日答复'); },
    accept(d) { const r = IB.acceptCandidate(+d.id); if (res(r) && r.staff) { ui.hl = r.staff.id; toast(r.staff.name + ' 已入职'); } },
    decline(d) { res(IB.declineCandidate(+d.id)); },
    bonus(d) { res(IB.bonus(+d.id)); },
    renew(d) { res(IB.renew(+d.id, ui.renewDays[d.id] || 5)); },
    dismiss(d) { const k = 'dismiss' + d.id; if (ui.confirm !== k) { ui.confirm = k; return; } ui.confirm = ''; res(IB.dismiss(+d.id)); },
    buy(d) { res(IB.buyStock(d.id, +d.v)); },
    recycle(d) { const r = IB.recycleOld(d.id); if (res(r)) toast('已回收，回款 ' + r.back); },
    policy(d) { res(IB.togglePolicy(d.id)); beep('stamp'); },
    upStart() { res(IB.startUpgrade()); },
    upSend() { res(IB.sendLiaison()); },
    stamp(d) { res(IB.stampProof(+d.v)); },
    build(d) { const r = IB.buildRoom(d.v, +d.id); if (res(r)) { ui.modal = { t: 'room', id: r.room.id }; toast('已建成 ' + D.ROOMS[d.v].name); } },
    demolish(d) { const k = 'demo' + d.id; if (ui.confirm !== k) { ui.confirm = k; return; } ui.confirm = ''; const r = IB.demolishRoom(+d.id); if (res(r)) { ui.modal = null; toast('已拆除'); } },
    save() { saveGame(false); },
    async load() { const j = await readSave(); if (j) applyLoaded(j); else toast('没有找到存档', true); },
    export: exportJSON,
    restart() { if (ui.confirm !== 'restart') { ui.confirm = 'restart'; return; } ui.confirm = ''; ui.started = false; ui.modal = null; renderModal(); $('app').hidden = true; $('start').hidden = false; renderStart(); },
  };
  const CHG = {
    duty(v, d) { res(IB.setDuty(+d.id, v)); },
    assign(v, d) { res(IB.assignStaff(+d.id, v ? +v : 0)); },
    rest(v, d) { res(IB.setRest(+d.id, v)); },
    renewDays(v, d) { ui.renewDays[d.id] = +v; },
    applyJob(v) { ui.applyJob = v; },
    filter(v) { ui.filter = v; },
    offerJob(v) { ui.offer.job = v; ui.offer.wage = D.JOBS[v].wage; },
    offerWage(v) { ui.offer.wage = Math.max(40, Math.min(200, Math.round(+v) || 40)); },
    offerDays(v) { ui.offer.days = +v; },
    offerSwap(v, d, el) { ui.offer.swap = el.checked; },
    opt(v, d, el) { ui[d.k] = el.checked; saveOpt(); },
  };
  function boot() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) {
        if (e.target.id === 'modal') { ui.modal = null; ui.confirm = ''; refresh(true); }
        return;
      }
      const f = ACT[el.dataset.act];
      if (!f) return;
      const r = f(el.dataset, el);
      if (!ui.started) return;
      if (r && r.then) r.then(() => refresh(true)); else refresh(true);
    });
    document.addEventListener('change', e => {
      const el = e.target;
      if (el.id === 'importfile') {
        const file = el.files && el.files[0];
        if (!file) return;
        const rd = new FileReader();
        rd.onload = () => { if (!applyLoaded(String(rd.result)) && !ui.started) renderStart('导入失败：文件不是有效的存档。'); };
        rd.readAsText(file);
        return;
      }
      const f = el.dataset && CHG[el.dataset.chg];
      if (!f) return;
      f(el.value, el.dataset, el);
      el.blur();
      refresh(true);
    });
    document.addEventListener('input', e => {
      if (e.target.dataset && e.target.dataset.inp === 'q') { ui.q = e.target.value; const l = $('citlist'); if (l) l.innerHTML = citRows(); }
    });
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        if (e.key === 'Enter' && (e.target.id === 'in-player' || e.target.id === 'in-center')) startNew();
        return;
      }
      if (!ui.started) return;
      if (e.key === 'Escape' && ui.modal) { ui.modal = null; ui.confirm = ''; refresh(true); }
      else if (e.key === ' ') { e.preventDefault(); ui.paused = !ui.paused; refresh(false); }
      else if (e.key === '1' || e.key === '2' || e.key === '4') { ui.speed = +e.key; ui.paused = false; refresh(false); }
    });
    document.addEventListener('pointerdown', e => { if (e.target.closest('#panel, #modal')) ui.down = true; });
    document.addEventListener('pointerup', () => { ui.down = false; });
    document.addEventListener('pointercancel', () => { ui.down = false; });
    window.addEventListener('beforeunload', e => { if (ui.started) { e.preventDefault(); e.returnValue = ''; } });
    RENDER.init($('map'), {
      onAgent(a) {
        RENDER.state.sel = a.id;
        if (a.k === 'cit') { ui.modal = { t: 'cit', id: a.cid }; }
        else if (a.k === 'stf') { const s = IB.St(a.sid); if (s) ACT.gotoStaff({ id: s.id }); }
        else toast(a.name + (a.role === 'review' ? '：正在复核机构升级申请' : '：正在例行审查，结论会写入审计页'));
        refresh(true);
      },
      onLot(lot, rm) { ui.confirm = ''; ui.modal = rm ? { t: 'room', id: rm.id } : { t: 'build', lot }; refresh(true); },
    });
    if (window.ResizeObserver) new ResizeObserver(() => RENDER.resize()).observe($('mapwrap'));
    renderStart();
    readSave().then(j => { if (j && !ui.started) { ui.hasSave = true; const p = $('in-player').value, c = $('in-center').value; renderStart(); $('in-player').value = p; $('in-center').value = c; } });
    requestAnimationFrame(frame);
  }
  boot();
  return { ui, refresh, toast };
})();
