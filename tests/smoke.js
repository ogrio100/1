// 快速体检：node tests/smoke.js [天数] [种子]
const { loadSim } = require('./load');
const IB = loadSim();
const days = +process.argv[2] || 30, seed = +process.argv[3] || 7;
IB.newState('测试局长', '测试中心', seed);
const t0 = Date.now();
for (let d = 0; d < days; d++) {
  IB.runDays(1);
  const S = IB.S, r = S.lastReport;
  if (d % Math.ceil(days / 30) === 0 || d === days - 1) {
    console.log(IB.dateStr(r.day), '现金', r.cash, '净', r.net, '到访', r.vis, '应缴', r.due, '逃单', r.esc,
      '| 公民', S.citizens.length, '认证', S.stats.certs, '到考', S.stats.seatings, '付费考生', S.stats.payerCount, '报名费', S.stats.examFees,
      '信任', S.trust.toFixed(1), '合规', S.comp.toFixed(1), '待批', S.gq.length);
  }
}
const S = IB.S;
console.log('耗时 ms', Date.now() - t0, '账本核对', S.cash, IB.ledgerSum() + IB.D.START_CASH);
console.log('统计', JSON.stringify(S.stats, (k, v) => (k === 'payers' ? undefined : v)));
console.log(S.log.slice(-25).map(l => IB.dateStr(l.d) + ' ' + IB.timeStr(l.m) + ' ' + l.t).join('\n'));
console.log('存档大小 KB', Math.round(IB.serialize().length / 1024));
