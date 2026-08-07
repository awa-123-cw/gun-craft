// 把 boss-music.js 内联进 index.html（单一数据源，游戏保持单文件）。
// 用法：node sync-boss-music.js
const fs = require('fs');
const path = require('path');

const root = __dirname;
const htmlPath = path.join(root, 'index.html');
const enginePath = path.join(root, 'boss-music.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const engine = fs.readFileSync(enginePath, 'utf8').trim();

const START = '// ===== Boss 战 BGM（机械核心）：引擎内联自 boss-music.js =====\n';
const END = '\n  let bossMusic = null;';
const si = html.indexOf(START);
const ei = html.indexOf(END);
if (si < 0 || ei < 0 || ei <= si) {
  console.error('index.html 中未找到内联锚点，请检查标记注释是否被改动。');
  process.exit(1);
}

const next = html.slice(0, si + START.length) + engine + END + html.slice(ei + END.length);
fs.writeFileSync(htmlPath, next);
console.log('boss-music.js 已内联到 index.html（' + next.length + ' bytes）');
