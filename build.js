#!/usr/bin/env node
// 把 src/ 下的源码拼成一个可离线双击运行的 index.html（无任何外部依赖）
'use strict';
const fs = require('fs');
const path = require('path');
const { simSource } = require('./tests/load.js');

const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const js = [
  '"use strict";',
  'const IB = ' + simSource() + ';',
  src('render.js'),
  src('ui.js'),
].join('\n');
if (/<\/script/i.test(js)) throw new Error('源码中出现 </script，无法内联');

const html = src('index.tpl.html')
  .replace('/*__CSS__*/', () => src('style.css'))
  .replace('/*__JS__*/', () => js);
const out = path.join(__dirname, 'index.html');
fs.writeFileSync(out, html);
console.log('已生成 ' + path.relative(process.cwd(), out) + '（' + Math.round(html.length / 1024) + ' KB）');
