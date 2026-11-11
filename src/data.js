// 《永生办证中心》HTML 原型 V0.8 —— 静态数据（数值均为原型平衡样例，单位为虚构货币 C）
const D = {
  VERSION: '0.8',
  DAY_START: 510,            // 08:30
  DAY_END: 1050,             // 17:30
  YEAR_DAYS: 60,
  MONTH_DAYS: 5,
  W_SLOTS: [570, 870],       // 09:30 / 14:30
  W_DUR: 90,
  W_SEATS: 6,
  P_SLOTS: [600, 645, 825, 870, 915, 960],
  P_DUR: 30,
  P_STATIONS: 2,
  REST: { A: [720, 765], B: [765, 810] },
  START_CASH: 6000,
  FEES: { reg: 25, visit: 8, written: 35, practical: 25, consult: 18, tutor: 55, counsel: 15, report: 20, pod: 90, special: 280 },
  COSTS: { pod: 62, paper: 3, hire: 250, bonus: 60, cheatFine: 60 },
  GRANT: { base: 1500, high: 1750, low: 1200 },
  ENCOURAGE_PER_DAY: 3,
  FORMAL_CAP: [0, 10, 14, 18],
};

D.COURSES = [
  { id: 'C01', name: '《再生生命工程应用能力认证》', short: '再生生命工程', wLine: 60, pLine: 65, level: 1, diff: 0, alienPen: 0,
    prac: '复杂细胞重编程理论，最后按绿色按钮', prop: '绿色按钮', icon: '🟢',
    text: { name: '《再生生命工程·官方指定教程》', price: 66, cost: 27 }, guide: { price: 43, cost: 15 } },
  { id: 'C02', name: '《高自治智能系统伦理与协同认证》', short: '智能系统伦理', wLine: 65, pLine: 60, level: 1, diff: 1, alienPen: 0,
    prac: 'AI推演千亿次，考生勾选“已阅读并同意”', prop: '复选框', icon: '☑️',
    text: { name: '《智能伦理协同·官方指定教程》', price: 70, cost: 29 }, guide: { price: 45, cost: 16 } },
  { id: 'C03', name: '《深空航行与星际工程适任证书》', short: '深空工程适任', wLine: 65, pLine: 70, level: 2, diff: 2, alienPen: 10,
    prac: '学造火箭，最后拧三颗螺丝', prop: '三颗螺丝', icon: '🔩',
    text: { name: '《深空工程适任·官方指定教程》', price: 74, cost: 31 }, guide: { price: 47, cost: 17 } },
  { id: 'C04', name: '《跨世纪资源治理与持续贡献认证》', short: '跨世纪贡献', wLine: 60, pLine: 60, level: 2, diff: 1, alienPen: 0,
    prac: '三百年经济规划，给智能货架补三瓶水', prop: '三瓶水', icon: '🧴',
    text: { name: '《跨世纪资源治理·官方指定教程》', price: 78, cost: 33 }, guide: { price: 49, cost: 18 } },
  { id: 'C05', name: '《跨文明公共事务与礼制认证》', short: '跨文明礼制', wLine: 60, pLine: 60, level: 2, diff: 1, alienPen: 12,
    prac: '摆座签、称呼主任、无酒精模拟举杯', prop: '座签', icon: '🪧',
    text: { name: '《跨文明礼制·官方指定教程》', price: 82, cost: 35 }, guide: { price: 51, cost: 19 } },
  { id: 'C06', name: '《极端环境生命保障与安全处置资质》', short: '环境安全资质', wLine: 65, pLine: 60, level: 3, diff: 2, alienPen: 12,
    prac: '超新星灾难课程，最后戴安全帽', prop: '安全帽', icon: '⛑️',
    text: { name: '《环境安全处置·官方指定教程》', price: 86, cost: 37 }, guide: { price: 53, cost: 20 } },
  { id: 'C07', name: '《永续公共治理与行政程序认证》', short: '永续行政程序', wLine: 60, pLine: 65, level: 3, diff: 1, alienPen: 0,
    prac: '千年治理学，最后在方框里盖章', prop: '公章', icon: '🈴',
    text: { name: '《永续行政程序·官方指定教程》', price: 90, cost: 39 }, guide: { price: 55, cost: 21 } },
];
D.COURSE = {};
D.COURSES.forEach(c => { D.COURSE[c.id] = c; });
D.FINAL_LICENSE = '《无限期生命延续准入许可证书》';
D.LEVEL_NAMES = ['', '一级 · 地区基础资格受理中心', '二级 · 跨领域综合认证中心', '三级 · 高级生命准入认证中心'];
D.UPGRADE = {
  2: { payers: 6, fees: 160, seatings: 3, trust: 52, comp: 62 },
  3: { payers: 18, fees: 550, seatings: 10, trust: 58, comp: 68 },
};

// 书店 SKU：T+课程=官方指定教程；G+课程=当届考试教辅（五年永考·三年模拟）；DIFF=差异指南；ANN=年度精编
D.BOOKS = {};
D.COURSES.forEach(c => {
  D.BOOKS['T' + c.id] = { sku: 'T' + c.id, name: c.text.name, price: c.text.price, cost: c.text.cost, prep: 9, course: c.id, kind: '官方指定教程' };
  D.BOOKS['G' + c.id] = { sku: 'G' + c.id, name: '《五年永考·三年模拟（' + c.short + '）》', price: c.guide.price, cost: c.guide.cost, prep: 7, course: c.id, kind: '当届考试教辅' };
});
D.BOOKS.DIFF = { sku: 'DIFF', name: '《考纲差异与合规要点》', price: 26, cost: 9, prep: 3, course: '', kind: '差异指南' };
D.BOOKS.ANN = { sku: 'ANN', name: '《年度文明更新精编》', price: 36, cost: 14, prep: 2, course: '', kind: '年度指南（已激活者）' };

D.ROOMS = {
  reception: { name: '身份登记与查分处', short: '登记查分', cost: 900, upkeep: 20, job: 'receptionist', color: '#bfe8dc', multi: false, zone: 'A', desc: '首次建档、本人返访查分。' },
  review: { name: '材料审核室', short: '材料审核', cost: 900, upkeep: 18, job: 'reviewer', color: '#cfe6f5', multi: false, zone: 'A', desc: '核对材料；缺件者回家补件后返访。' },
  cashier: { name: '收费室', short: '收费室', cost: 1000, upkeep: 20, job: 'cashier', color: '#ffe2b8', multi: false, zone: 'A', desc: '结清应缴、办理考试预约。' },
  bookstore: { name: '资格教材发行中心', short: '永生考试书店', cost: 1400, upkeep: 24, job: 'clerk', color: '#ffd3c4', multi: false, zone: 'C', desc: '真实库存、采购、销售与换版。' },
  written: { name: '通用六席笔试厅', short: '笔试厅', cost: 1800, upkeep: 30, job: 'proctor', color: '#d9ecff', multi: true, zone: 'B', desc: '每日 09:30 / 14:30 两场，每场一科、最多六席。' },
  practical: { name: '双工位实操室', short: '实操室', cost: 1600, upkeep: 32, job: 'examiner', color: '#e3f3c9', multi: true, zone: 'B', desc: '两工位，道具按科目切换。' },
  grading: { name: '阅卷室', short: '阅卷室', cost: 1200, upkeep: 22, job: 'grader', color: '#ece2f8', multi: true, zone: 'B', desc: '人工批阅并签字，最早次营业日发布。' },
  tutoring: { name: '一对一私教短训室', short: '私教室', cost: 1300, upkeep: 22, job: 'tutor', color: '#fff0b8', multi: true, zone: 'C', desc: '自愿预约的每日一对一课程。' },
  counsel: { name: '心理辅导室', short: '心理辅导', cost: 900, upkeep: 16, job: 'counselor', color: '#fbe0ee', multi: false, zone: 'C', desc: '自愿、保密的压力支持。' },
  report: { name: '资格汇总与上报处', short: '汇总上报', cost: 1000, upkeep: 18, job: 'reporter', color: '#d6f0e8', multi: false, zone: 'D', desc: '七项认证齐全后汇总上报，由上级电子签发。' },
  pod: { name: '生命修复舱服务室', short: '修复舱', cost: 2600, upkeep: 40, job: 'medic', color: '#c9f2ef', multi: true, zone: 'D', desc: '仅服务已激活维护名额者。' },
  liaison: { name: '政务联络与证照档案室', short: '政务联络处', cost: 1100, upkeep: 18, job: 'liaison', color: '#e8e2d2', multi: false, zone: 'D', desc: '保管证照、外联跑证、关系维护（仅临时工）。' },
  petition: { name: '资格复议与心理祈愿室', short: '续考祈愿室', cost: 800, upkeep: 10, job: '', color: '#ecd9f6', multi: false, zone: 'C', desc: '连续落榜者向局长申诉。' },
  lounge: { name: '员工休息室', short: '休息室', cost: 700, upkeep: 10, job: '', color: '#f3ead9', multi: false, zone: 'D', desc: '员工错峰休息。' },
};
D.ROOM_ORDER = ['reception', 'review', 'cashier', 'bookstore', 'written', 'practical', 'grading', 'tutoring', 'counsel', 'petition', 'report', 'pod', 'liaison', 'lounge'];

D.JOBS = {
  receptionist: { name: '接待员', room: 'reception', wage: 78, color: '#3fae93' },
  reviewer: { name: '材料审核员', room: 'review', wage: 82, color: '#4a90c2' },
  cashier: { name: '收费员', room: 'cashier', wage: 80, color: '#e39a3b' },
  clerk: { name: '书店店员', room: 'bookstore', wage: 72, color: '#e9795d' },
  proctor: { name: '监考员', room: 'written', wage: 86, color: '#5b7fd1' },
  examiner: { name: '实操考评员', room: 'practical', wage: 88, color: '#7da53a' },
  grader: { name: '阅卷员', room: 'grading', wage: 90, color: '#8a6cc4' },
  reporter: { name: '上报专员', room: 'report', wage: 84, color: '#2f9e8a' },
  tutor: { name: '私教导师', room: 'tutoring', wage: 92, color: '#c9a227' },
  counselor: { name: '心理辅导师', room: 'counsel', wage: 90, color: '#d277a6' },
  medic: { name: '医护员', room: 'pod', wage: 96, color: '#34b3b3' },
  inspector: { name: '巡查员', room: '', wage: 98, temp: true, skill: 'inspect', color: '#2f6fe0' },
  liaison: { name: '外联跑证员', room: 'liaison', wage: 90, temp: true, skill: 'liaison', color: '#8d7a55' },
  relations: { name: '政务关系维护员', room: 'liaison', wage: 95, temp: true, skill: 'relate', color: '#a0683f' },
};
D.DUTIES = {
  gate: { name: '大门收费稽核', desc: '在出口线内拦下未结清者，当场结算；不追缴已离场欠款。' },
  exam: { name: '考场纪律巡查', desc: '巡视笔试厅/实操室，发现小抄与代答。' },
  integrity: { name: '员工廉洁巡查', desc: '巡视收费、审核窗口与休息室，查处真实发生的红包。' },
  roam: { name: '全馆机动巡查', desc: '全类别低强度覆盖，各专项发现率最低。' },
};

D.POLICIES = [
  { key: 'oldEd', name: '旧版教材互认', goal: '减少浪费、稳定考生预期', effect: '旧版库存可明示折价（6折）售出并正常计入备考；信任缓升', cost: '新版教材销量下降', satire: '出版部门来函：请解释本季度销售额下滑原因。' },
  { key: 'freeConsult', name: '免费咨询试点', goal: '降低补件负担', effect: '缺件个性化指导不再收 18；信任缓升', cost: '咨询收入归零', satire: '财务处新增《免费服务成本说明表》，需每日填报。' },
  { key: 'aiGrading', name: 'AI 辅助阅卷', goal: '减少阅卷积压', effect: '阅卷速度 ×1.8（仍需阅卷员在岗签字）', cost: '每营业日授权费 30', satire: 'AI 已判完全部试卷，状态：正确，但未生效——等待人工签字。' },
  { key: 'expRecog', name: '职业经验实操互认', goal: '已证明能力者不重复初级实操', effect: '有已验证对口资历的考生笔试合格后，实操按等效认定完成', cost: '实操报名收入与工位利用率下降', satire: '上级通知：请说明本月实操考核人次下降原因。' },
  { key: 'alienEquiv', name: '跨文明等效与物种适配', goal: '不因设备与礼制模板不适配而判失败', effect: '取消外星考生在深空/礼制/安全实操上的适配性扣分；信任缓升', cost: '一次性适配设备 600', satire: '公平试点成功，预算表仍只统计原式安全帽数量。', once: 600 },
  { key: 'eDocs', name: '电子材料互认', goal: '减少纸质材料往返', effect: '缺件概率减半', cost: '每营业日系统维护 10', satire: '新增要求：请提交《电子材料真实性证明》（纸质）。' },
];

D.DOCS = ['《现存生命状态佐证函》', '《无效证明有效性复核页》', '《跨物种姓名字段映射附表》', '《本人仍为本人声明书》', '《未来贡献意向预登记回执》', '《证明材料格式一致性说明》'];

D.SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾萧田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split('');
D.GIVEN = ['小明', '望生', '顺达', '淑芬', '建国', '美兰', '志远', '晓雯', '德福', '桂英', '一鸣', '思齐', '国栋', '秀珍', '嘉怡', '子轩', '永年', '长庚', '延龄', '松柏', '念慈', '守拙', '知行', '可欣', '立冬', '春来', '佩瑶', '怀仁', '景行', '若愚', '安澜', '静好', '乐天', '问渠', '有为', '慕白', '清和', '书恒', '明哲', '海宁', '雨桐', '云舒', '启明', '天佑', '鹤年', '万里', '如松', '惠敏', '少华', '宝根'];
D.ALIEN_NAMES = ['索罗·恩', '伊缇尔', '洛珈', '阿克-7·维', '苏尔玛', '提欧·岚', '珂珞丝', '努·阿莱', '祖恩三号体', '帕拉·希', '维瑟琳', '厄尔多', '塔-乌·米', '西格玛·荧', '诺瓦黎', '卡隆·西', '缇娅·沃', '多伦集体·乙', '艾瑟·昆', '莫比·渊'];

D.TEMPLATES = [
  { key: 'office', w: 24, label: '普通上班族', age: [26, 48], jobs: ['行政专员', '会计', '客服主管', '物流调度'], bias: { discipline: 8 }, apt: { C07: 8, C04: 6 }, hand: 0, fin: 0,
    bg: ['白天上班，晚上背考纲，周末排队。', '想在孩子成年前把手续办完。'] },
  { key: 'elder', w: 18, label: '退休长者', age: [62, 88], jobs: ['退休教师', '退休钳工', '退休护士', '退休司机'], bias: { resilience: 6, iq: -4, principle: 8 }, apt: { C01: 4, C07: 4 }, hand: -8, fin: 5,
    bg: ['会写火箭喷嘴公式，但手不够稳。', '照顾了一辈子家人，贡献证明却开不出来。'] },
  { key: 'engineer', w: 12, label: '工程技术人员', age: [28, 55], jobs: ['设备维修工程师', '结构工程师', '电气技师'], bias: { iq: 8 }, apt: { C03: 12, C06: 8 }, hand: 14, fin: -5, exp: ['C03'], expP: 0.4,
    bg: ['修了二十年设备，第一次被要求先宣读开工话术。', '觉得三颗螺丝不是问题，记录表才是。'] },
  { key: 'student', w: 12, label: '应届青年', age: [19, 25], jobs: ['应届毕业生', '实习生', '外卖骑手'], bias: { iq: 4, discipline: -6, courage: 6 }, apt: { C02: 6 }, hand: 2, fin: 15,
    bg: ['刚考完一轮学历证书，发现永生还得再考七门。', '钱不多，时间多。'] },
  { key: 'care', w: 10, label: '照护与服务从业者', age: [30, 58], jobs: ['护工', '社区护士', '家政员'], bias: { eq: 12, social: 6 }, apt: { C01: 10, C05: 6 }, hand: 4, fin: 8,
    bg: ['真的会用修复舱，但缺少学分。', '下班后才有时间来窗口。'] },
  { key: 'free', w: 8, label: '自由职业者', age: [24, 50], jobs: ['自由撰稿人', '小店店主', '网约车司机'], bias: { courage: 8, principle: -8, greed: 8 }, apt: { C04: 6 }, hand: 0, fin: 12,
    bg: ['收入不稳定，对每一笔收费都很敏感。', '相信办法总比手续多。'] },
  { key: 'a_eng', w: 6, alien: true, label: '远航文明技术公民', age: [120, 320], jobs: ['星际推进系统总工程师', '曲率引擎装调师'], bias: { iq: 16 }, apt: { C03: 25, C06: 10 }, hand: 10, fin: -10, exp: ['C03'], expP: 1,
    bg: ['设计过十二型跨恒星引擎，不认识地球标准扳手。', '无法证明资历符合“三颗螺丝操作标准”的记录格式。'] },
  { key: 'a_dip', w: 5, alien: true, label: '银河公约外交人员', age: [90, 260], jobs: ['星际公约谈判代表', '多文明调停官'], bias: { eq: 20, social: 14 }, apt: { C05: 25, C02: 8 }, hand: 0, fin: -10, exp: ['C05'], expP: 1,
    bg: ['调停过星系冲突，却要先学会正确称呼主任。', '翻译机器人坚持宣读“双方友好合作取得圆满成功”。'] },
  { key: 'a_sil', w: 5, alien: true, label: '硅基维护专家', age: [200, 900], jobs: ['生命级能量屏障维护师'], bias: { discipline: 14, resilience: 10 }, apt: { C06: 22, C01: 10 }, hand: 6, fin: -5, exp: ['C06'], expP: 1,
    bg: ['拥有硬质头甲，仍被要求扣好安全帽带。', '证件照尺寸只支持人类头型。'] },
];
D.MOTIVES = ['想在退休前取得维护资格', '家人已经考完，不想掉队', '单位要求员工具备长期适任证明', '担心政策再变，先考为敬', '听说名额越来越少', '只是想合法地按下那个自动修复按钮'];

D.BROADCASTS = [
  '广播：本中心严禁任何形式的私下收款，违规收入一律由中心统一收取。',
  '广播：考试诚信是永生的第一课。',
  '广播：请已合格公民耐心等待上级系统电子回执，回执不代表名额。',
  '广播：官方数字考纲常年免费公开，购买教材纯属自愿。',
  '广播：热烈欢迎各星系高级人才。为体现公平，请先完成地球居民接待礼仪标准化培训。',
  '广播：每次真实业务到访收取基础办理费 8，同日只收一次，收费标准已在大厅公示。',
  '广播：成绩已发布不等于本人已知悉，请携带本人前来查分。',
  '广播：AI 已核实全部条件，状态为“正确，但未生效”，请等待人工盖章。',
  '广播：永久资格有效；本年度使用授权待确认。',
  '广播：让无限的生命，拥有可核验的价值。',
];
D.EDITION_JOKES = [
  '《五年永考·三年模拟》新增“本版无新增考点”共 80 页，采购委员会仍按页数结算。',
  '《深空工程》新版将“顺时针”改为“沿钟表指针方向”，教材页数增加 80 页。',
  '《考纲差异与合规要点》指出：两版只有一个标点变化。',
  '出版委员会为免费的 AI 错题分析设立“AI 教辅合规备案课”。',
];

D.CATS = {
  reg: '建档登记', visit: '到访基础办理费', written: '笔试报名费', practical: '实操报名费', consult: '缺件个性化咨询', tutor: '一对一私教',
  counsel: '心理辅导', report: '档案核验上报', pod: '修复舱服务', book: '书店销售', special: '特别申诉服务费',
  grant: '政府服务定额拨款', fine: '作弊罚款（罚没）', confiscate: '红包没收（罚没）',
  wage: '员工工资', upkeep: '房间维护', stock: '教材采购', build: '房间建设', hire: '招聘费', bonus: '员工奖金', podcost: '修复舱耗材能源',
  policy: '政策运行成本', penalty: '上级整改/罚款', recycle: '旧书回收', refund: '退费',
};
D.PERSONAL_CATS = ['reg', 'visit', 'written', 'practical', 'consult', 'tutor', 'counsel', 'report', 'pod', 'book', 'special'];
D.VISIT_NAMES = {
  register: '首次登记建档', docs: '补件返访', examW: '参加笔试', examP: '参加实操', check: '返访查分', book: '预约考试',
  tutor: '一对一私教', counsel: '心理辅导', petition: '续考祈愿', report: '资格汇总上报', pod: '修复舱维护',
};
