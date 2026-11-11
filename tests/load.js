// 无头加载模拟内核：与 build.js 使用同一份源码拼接顺序
const fs = require('fs');
const path = require('path');

const SIM_FILES = ['data.js', 'sim1_core.js', 'sim2_flow.js', 'sim3_admin.js'];

function simSource() {
  const src = SIM_FILES.map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
  return '(function(){\n"use strict";\n' + src + '\nreturn API;\n})()';
}
function loadSim() {
  return (0, eval)(simSource());
}

module.exports = { loadSim, simSource, SIM_FILES };
