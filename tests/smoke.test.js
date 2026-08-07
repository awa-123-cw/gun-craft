const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML_PATH = path.join(__dirname, '..', 'index.html');

function buildContext() {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 0 });
      if (k === 'canvas') return canvas;
      return typeof k === 'string' ? () => undefined : undefined;
    },
    set() { return true; }
  });
  const canvas = { width: 960, height: 540, style: {}, getContext: () => ctx };
  const audioCtx = {
    currentTime: 0, state: 'running', destination: {},
    createOscillator: () => ({ connect: noop, start: noop, stop: noop, type: 'sine', frequency: { setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop } }),
    createGain: () => ({ connect: noop, gain: { setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop } }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(16) }),
    createBufferSource: () => ({ connect: noop, start: noop, buffer: null }),
    createFilter: () => ({ connect: noop, frequency: { setValueAtTime: noop } }),
    resume: noop
  };
  const context = {
    console, Math, JSON, Date, Object, Array, Number, String, Boolean,
    performance: { now: () => Date.now() },
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    AudioContext: function () { return audioCtx; },
    setTimeout, clearTimeout,
    document: {
      body: { style: {} }, title: '',
      addEventListener: noop, removeEventListener: noop,
      createElement: () => canvas, getElementById: () => canvas,
      querySelector: () => null, querySelectorAll: () => []
    },
    devicePixelRatio: 1, innerWidth: 960, innerHeight: 540, navigator: {}
  };
  context.window = context;
  return context;
}

function loadGame(ctx) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const m = html.match(/<script id="game-script">([\s\S]*?)<\/script>/);
  assert.ok(m, 'index.html 必须包含 <script id="game-script">');
  vm.runInNewContext(m[1], ctx, { filename: 'index.html' });
  assert.ok(ctx.Game && typeof ctx.Game.createGame === 'function', 'Game.createGame 必须暴露');
  return ctx.Game;
}

function makeGame() {
  const ctx = buildContext();
  const Game = loadGame(ctx);
  const game = Game.createGame(ctx.document.getElementById('game'));
  return { ctx, Game, game };
}

module.exports = { buildContext, loadGame, makeGame };

test('游戏脚本可加载并创建实例', () => {
  const { game } = makeGame();
  assert.strictEqual(typeof game.update, 'function');
  assert.strictEqual(typeof game.render, 'function');
  assert.strictEqual(typeof game.start, 'function');
  assert.ok(game.world && game.world.player, 'world.player 必须存在');
});

test('WASD 移动玩家并限制在房间内', () => {
  const { game } = makeGame();
  game.input.keys.add('KeyD');
  game.update(1 / 60);
  assert.ok(game.world.player.x > 0, '按 D 应向右移动');
  game.input.keys.clear();
  game.world.player.x = -50;
  game.update(1 / 60);
  assert.ok(game.world.player.x >= 0, '玩家不能越过房间左边界');
});

test('固定时间步与相机跟随', () => {
  const { game } = makeGame();
  game.input.mouse.x = 480;
  game.input.mouse.y = 270; // 屏幕中心 → 目标=玩家
  game.world.player.x = 1000;
  game.world.player.y = 700;
  for (let i = 0; i < 60; i++) game.update(1 / 120); // 0.5s = 60 步
  assert.ok(game.camera.x > 900, '调大视角后相机应跟随玩家');
  assert.ok(Math.abs(game.world.time - 0.5) < 1e-9, '时间应推进 0.5s');
});

test('视角随准星偏移', () => {
  const { game } = makeGame();
  game.world.player.x = 1000;
  game.world.player.y = 550;
  game.input.mouse.x = 0;
  game.input.mouse.y = 270; // 屏幕左边缘
  for (let i = 0; i < 120; i++) game.update(1 / 120);
  assert.ok(game.camera.x < 1000, '准星偏左时相机应左移');
});

test('E 键交互：靠近宝箱按 E 打开面板且不闪关', () => {
  const { game } = makeGame();
  game.world.chest = { x: 750, y: 550, opened: false };
  game.input.pressedSet.add('KeyE');
  game.update(1 / 120);
  game.update(1 / 120); // 同一帧多次逻辑步不应立刻关闭
  assert.strictEqual(game.ui.panel, 'chest', 'E 应打开宝箱面板且保持打开');
});

test('进入房间会标记已访问（小地图数据）', () => {
  const { game } = makeGame();
  game.startMap(123);
  const room = game.world.map.rooms.find(r => r.x === game.world.mapInfo.roomPos.x && r.y === game.world.mapInfo.roomPos.y);
  assert.ok(room && room.visited, '当前房间应标记 visited');
});

test('B 键打开部件面板', () => {
  const { game } = makeGame();
  game.input.pressedSet.add('KeyB');
  game.update(1 / 120);
  assert.strictEqual(game.ui.panel, 'parts', 'B 应打开部件面板');
});

test('击中敌人产生击退，敌人攻击玩家产生击退', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('chaser', 200, 100, 1);
  game.world.enemies.push(e);
  game.damageEnemy(e, 10, 0, {});
  assert.ok(e.kbvx > 0, '敌人应被击退（向右）');
  game.world.player.hp = 100;
  game.damagePlayer(5, Math.PI);
  assert.ok(game.world.player.vx < -100, '玩家应被击退（向左）');
});

test('重型武器后坐力更强', () => {
  const { game } = makeGame();
  game.world.guns[0].parts.body = { id: 'heavy_body', slot: 'body', name: '重型枪身', rarity: 4, color: '#ff8f3d', affixes: [] };
  game.rebuildGun(0);
  game.input.mouseHard = true;
  game.update(1 / 60);
  assert.ok(game.world.player.recoil > 0.5, '重型后坐力应明显');
});

test('子弹带拖尾（记录上一帧位置）', () => {
  const { game } = makeGame();
  game.input.mouseHard = true;
  game.update(1 / 60);
  const b = game.world.bullets[0];
  assert.ok(b && b.px !== undefined && b.py !== undefined, '子弹应记录拖尾起点');
});

test('瞬身：空格+左键触发，冷却3秒，击杀重置', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  game.input.keys.add('Space');
  game.input.mouseHard = true; // 边沿触发
  game.update(1 / 120);
  assert.ok(game.world.dash.active, '应触发瞬身');
  assert.ok(game.world.dash.cd > 0, '瞬身后进入冷却');
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  e.hp = 1;
  game.world.enemies.push(e);
  game.damageEnemy(e, 5, 0, {});
  assert.strictEqual(game.world.dash.cd, 0, '击杀应立刻结束冷却');
});

test('按住射击生成子弹并消耗弹匣', () => {
  const { game } = makeGame();
  const before = game.world.bullets.length;
  game.input.mouseHard = true;
  game.update(1 / 60);
  assert.ok(game.world.bullets.length > before, '应生成子弹');
  assert.strictEqual(game.gun().mag, game.gun().stats.magSize - 1);
});

test('射速冷却与换弹', () => {
  const { game } = makeGame();
  const g = game.gun();
  g.mag = 0;
  g.reloading = false;
  game.input.keys.add('KeyR');
  game.update(1 / 60);
  assert.ok(g.reloading, 'R 触发换弹');
  for (let i = 0; i < 200; i++) game.update(1 / 120);
  assert.strictEqual(g.mag, g.stats.magSize, '换弹完成后弹匣满');
});

test('开火时产生枪口火光与弹壳反馈', () => {
  const { game } = makeGame();
  game.input.mouseHard = true;
  game.update(1 / 60);
  assert.ok(game.world.particles.some(p => p.kind === 'muzzle'), '应产生枪口火光粒子');
  assert.ok(game.world.casings.length > 0, '应产生弹壳');
  assert.ok(game.gun().stats.fireRate > 0);
});

test('子弹命中敌人造成伤害与受击反馈', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  game.world.enemies.push(e);
  const before = e.hp;
  game.damageEnemy(e, 10, 0);
  assert.ok(e.hp < before, '应扣血');
  assert.ok(e.flash > 0, '受击白闪');
  assert.ok(game.world.particles.some(p => p.kind === 'spark'), '命中火花');
  assert.ok(game.world.floaters.some(f => f.text === '10'), '伤害飘字');
});

test('击杀触发碎裂/hit-stop/击杀音', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  e.hp = 5;
  game.world.enemies.push(e);
  game.damageEnemy(e, 10, 0);
  assert.ok(!game.world.enemies.includes(e), '敌人应被移除');
  assert.ok(game.world.particles.some(p => p.kind === 'burst'), '击杀碎裂粒子');
  assert.ok(game.fx.hitStopMs > 0, 'hit-stop 生效');
});

test('红冲锋敌人状态机：接近后预备冲撞', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('chaser', 60, 100, 1);
  game.world.player.x = 100;
  game.world.player.y = 100;
  game.world.enemies.push(e);
  for (let i = 0; i < 60; i++) game.update(1 / 120);
  assert.ok(e.state === 'telegraph' || e.state === 'dash', '应进入预备或冲撞状态，实际=' + e.state);
});

test('橙射手敌人开火与玩家受伤', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('shooter', 380, 100, 1);
  game.world.player.x = 100;
  game.world.player.y = 100;
  game.world.player.hp = 100;
  game.world.enemies.push(e);
  for (let i = 0; i < 280; i++) game.update(1 / 120); // t≈2.33s，弹应仍在飞行
  assert.ok(game.world.bullets.some(b => !b.friendly), '橙敌人应射出敌弹');
  for (let i = 280; i < 420; i++) game.update(1 / 120);
  assert.ok(game.world.player.hp < 100, '玩家应被敌弹击中掉血');
});

test('部件库齐全：枪身15 弹药16 配件16 护甲15', () => {
  const { Game } = makeGame();
  assert.strictEqual(Object.keys(Game.PARTS.body).length, 15);
  assert.strictEqual(Object.keys(Game.PARTS.ammo).length, 16);
  const modCount = Object.keys(Game.PARTS.mod).filter(id => id !== 'none_mod').length;
  assert.strictEqual(modCount, 16);
  assert.strictEqual(Object.keys(Game.PARTS.armor).length, 15);
});

test('词条随稀有度增加且装备后影响数值', () => {
  const { Game, game } = makeGame();
  const aff = Game.partsEngine.rollAffixes(4);
  assert.ok(aff.length >= 2 && aff.length <= 3, '史诗部件至少 2 条词条');
  const part = Game.partsEngine.rollPart();
  game.equipPart(part);
  if (part.slot === 'armor') {
    assert.strictEqual(game.world.armor.id, part.id, '护甲应装备到护甲栏');
  } else {
    assert.strictEqual(game.gun().parts[part.slot].id, part.id, '部件应装备到对应槽');
  }
  assert.ok(game.gun().stats.damage > 0);
});

test('击杀掉落与商店购买', () => {
  const { Game, game } = makeGame();
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  e.hp = 1;
  e.scale = 3;
  game.world.enemies.push(e);
  game.damageEnemy(e, 10, 0, {});
  assert.ok(game.world.pickups.some(p => p.kind === 'part'), '精英必掉部件');
  game.world.shopOffers = [Game.partsEngine.rollPart()];
  game.world.shopPrices = [20];
  game.world.coins = 50;
  game.openPanel('shop');
  assert.ok(game.ui.items.length >= 1, '商店应展示商品');
  const offer = game.ui.items[0];
  game.uiClick(offer.x + 5, offer.y + 5);
  assert.strictEqual(game.world.coins, 30, '购买扣钱');
  assert.ok(game.world.inventory.length >= 1, '购买部件入背包');
});

test('地图生成连通：起点可 BFS 到 Boss', () => {
  const { Game } = makeGame();
  const map = Game.map.generate(12345);
  const visited = new Set();
  const q = [[map.start.x, map.start.y]];
  visited.add(map.start.x + ',' + map.start.y);
  while (q.length) {
    const [x, y] = q.shift();
    const room = map.rooms.find(r => r.x === x && r.y === y);
    for (const d of ['n', 'e', 's', 'w']) {
      if (!room.doors[d]) continue;
      const nx = x + (d === 'e' ? 1 : d === 'w' ? -1 : 0);
      const ny = y + (d === 's' ? 1 : d === 'n' ? -1 : 0);
      const k = nx + ',' + ny;
      if (!visited.has(k)) { visited.add(k); q.push([nx, ny]); }
    }
  }
  assert.ok(visited.has(map.boss.x + ',' + map.boss.y), 'Boss 房必须可达');
  assert.ok(map.rooms.length >= 5, '至少 5 个房间');
});

test('进入战斗房刷怪，全部波次清空后开门', () => {
  const { game } = makeGame();
  game.startMap(999);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  assert.ok(combat, '应存在战斗房');
  game.enterRoom(combat.x, combat.y);
  assert.ok(game.world.enemies.length > 0, '战斗房应刷怪');
  assert.ok(combat.waveTotal >= 1 && combat.waveTotal <= 3, '波次应为 1~3');
  let guard = 0;
  while (!game.world.room.cleared && guard++ < 30) {
    while (game.world.enemies.length) {
      for (const e of [...game.world.enemies]) game.killEnemy(e);
      game.update(0.1);
    }
    for (let i = 0; i < 40; i++) game.update(0.1); // 波次倒计时
  }
  assert.ok(game.world.room.cleared, '清怪后房间应标记 cleared');
  assert.ok(Object.values(game.world.room.doors).some(Boolean), '应有门');
});

test('分裂怪死亡生成两只小分裂怪', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('splitter', 100, 100, 1);
  e.hp = 1;
  game.world.enemies.push(e);
  game.damageEnemy(e, 5, 0, {});
  const kids = game.world.enemies.filter(x => x.kind === 'splitter_mini');
  assert.strictEqual(kids.length, 2, '应分裂出 2 只小分裂怪');
});

test('精英护盾：先破盾再扣血', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('elite', 100, 100, 1);
  game.world.enemies.push(e);
  const before = e.hp;
  game.damageEnemy(e, 10, 0, {});
  assert.strictEqual(e.hp, before, '有盾时不应扣血');
  assert.ok(e.shield < e.maxShield, '盾应减少');
  e.shield = 0;
  game.damageEnemy(e, 10, 0, {});
  assert.ok(e.hp < before, '破盾后扣血');
});

test('Boss 阶段随血量切换且死亡进入胜利结算', () => {
  const { game } = makeGame();
  game.world.maxLayers = 1; // 最终层 Boss 才胜利
  const b = game.spawnEnemy('boss', 750, 550, 1);
  game.world.enemies.push(b);
  game.damageEnemy(b, 1, 0, {});
  assert.strictEqual(b.phase, 1, '满血为阶段1');
  b.hp = b.maxHp * 0.5;
  game.update(1 / 60);
  assert.strictEqual(b.phase, 2, '血量 50% 应进入阶段2');
  b.hp = 1;
  game.damageEnemy(b, 5, 0, {});
  assert.strictEqual(game.state.screen, 'win', 'Boss 死亡应胜利');
});

test('第二层迷宫生成：更大网格且连通', () => {
  const { Game } = makeGame();
  const map = Game.map.generate(77, 2);
  assert.strictEqual(map.gridW, 4);
  assert.strictEqual(map.gridH, 4);
  assert.ok(map.rooms.length >= 9, '第二层房间应更多');
  const visited = new Set();
  const q = [[map.start.x, map.start.y]];
  visited.add(map.start.x + ',' + map.start.y);
  while (q.length) {
    const [x, y] = q.shift();
    const room = map.rooms.find(r => r.x === x && r.y === y);
    for (const d of ['n', 'e', 's', 'w']) {
      if (!room.doors[d]) continue;
      const nx = x + (d === 'e' ? 1 : d === 'w' ? -1 : 0);
      const ny = y + (d === 's' ? 1 : d === 'n' ? -1 : 0);
      const k = nx + ',' + ny;
      if (!visited.has(k)) { visited.add(k); q.push([nx, ny]); }
    }
  }
  assert.ok(visited.has(map.boss.x + ',' + map.boss.y), '第二层 Boss 必须可达');
});

test('装备新部件时旧部件自动卸下回背包', () => {
  const { game } = makeGame();
  const old = game.gun().parts.ammo;
  const newPart = { id: 'pierce_ammo', slot: 'ammo', name: '穿甲弹', rarity: 2, color: '#cfd8ff', affixes: [] };
  game.world.inventory.push(newPart);
  game.equipPart(newPart);
  assert.strictEqual(game.gun().parts.ammo.id, 'pierce_ammo', '新弹药应装上');
  assert.ok(game.world.inventory.includes(old), '旧弹药应卸下回背包');
});

test('拼装面板标记已装备部件（loadout）', () => {
  const { game } = makeGame();
  game.openPanel('parts');
  assert.strictEqual(game.ui.loadout.length, 4, '应展示四槽当前装备（含护甲）');
  assert.ok(game.ui.loadout.every(x => x.part && x.slot), '每槽包含部件信息');
});

test('同 ID 部件不允许重复装备（UI 拒绝）', () => {
  const { game } = makeGame();
  const dup = {
    id: game.gun().parts.ammo.id, slot: 'ammo',
    name: game.gun().parts.ammo.name, rarity: 0, color: '#ffd166', affixes: []
  };
  game.world.inventory.push(dup);
  game.openPanel('parts');
  const row = game.ui.items.find(r => r.part === dup);
  assert.ok(row && row.denied, '同 ID 行应标记拒绝');
  const before = game.gun().parts.ammo.id;
  game.uiClick(row.x + 5, row.y + 5);
  assert.strictEqual(game.gun().parts.ammo.id, before, '同 ID 装备应被拒绝');
  assert.ok(game.world.inventory.includes(dup), '部件不应被消耗');
});

test('拼装面板：部件列表与背包行对齐在面板内', () => {
  const { game } = makeGame();
  game.world.inventory.push({ id: 'pierce_ammo', slot: 'ammo', name: '穿甲弹', rarity: 2, color: '#cfd8ff', affixes: [] });
  game.openPanel('parts');
  const py = game.panelMetrics().py;
  for (const chip of game.ui.loadoutChips) {
    assert.ok(chip.y >= py + 60, '已装备部件列表应在面板内');
  }
  for (const row of game.ui.items) {
    assert.ok(row.y >= py + 120, '背包行应位于部件列表下方且不重叠');
  }
});

test('背包过多时可滚动且不越界', () => {
  const { game, Game } = makeGame();
  for (let i = 0; i < 12; i++) game.world.inventory.push(Game.partsEngine.rollPart());
  game.openPanel('parts');
  const m = game.panelMetrics();
  assert.ok(game.ui.maxScroll > 0, '12 件背包应可滚动');
  assert.ok(m.panelH <= 560, '面板高度不应超出屏幕');
  const firstTop0 = game.ui.items[0].y;
  assert.ok(firstTop0 >= m.py + 120, '初始第一行应在面板内');
  game.ui.scroll = game.ui.maxScroll;
  game.buildPanelRows();
  const last = game.ui.items[game.ui.items.length - 1];
  assert.ok(last.y + last.h <= m.py + m.panelH, '滚到底后最后一行不应越界');
  assert.ok(game.ui.items[0].y < firstTop0, '滚动后列表应上移');
});

test('Boss 血量翻倍且普通战斗房怪物量翻倍', () => {
  const { game } = makeGame();
  const b = game.spawnEnemy('boss', 750, 550, 1);
  assert.strictEqual(b.maxHp, 1344, 'Boss 血量应为 1344');
  game.startMap(777);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  const total = combat.waveCounts.reduce((a, c) => a + c, 0);
  assert.ok(total >= 12, '普通战斗房总怪物量至少 12（×3）');
  assert.ok(game.world.enemies.length > 0, '首波应有怪');
});

test('部件掉落概率降低30%，金币概率提高且按强弱给量', () => {
  const { game } = makeGame();
  const orig = Math.random;
  try {
    Math.random = () => 0.05; // 原 3% 会掉部件，新 2.1% 不掉；0.05 在护甲分支之后、金币分支之内
    const e = game.spawnEnemy('chaser', 100, 100, 1);
    e.hp = 1;
    e.scale = 1;
    game.world.enemies.push(e);
    game.damageEnemy(e, 5, 0, {});
    assert.ok(!game.world.pickups.some(p => p.kind === 'part'), '2.5% 不应再掉部件');
    const coins = game.world.pickups.filter(p => p.kind === 'coin');
    assert.ok(coins.length > 0, '应掉落金币');
    assert.ok(coins.every(c => c.value === 1), '普通怪金币应为 1');
  } finally {
    Math.random = orig;
  }
});

test('冲锋枪伤害降低50%且霰弹射程降低20%', () => {
  const { Game } = makeGame();
  assert.strictEqual(Game.PARTS.body.smg_body.base.damage, 4.5, '冲锋枪伤害 9→4.5');
  assert.strictEqual(Game.PARTS.body.shotgun_body.base.lifeMul, 0.8, '霰弹射程 -20%');
});

test('进入 Boss 房玩家不与 Boss 重叠', () => {
  const { game } = makeGame();
  game.startMap(555);
  game.enterRoom(game.world.map.boss.x, game.world.map.boss.y);
  const b = game.world.enemies[0];
  const d = Math.hypot(game.world.player.x - b.x, game.world.player.y - b.y);
  assert.ok(d > game.world.player.radius + b.radius, '玩家与 Boss 不应重叠');
});

test('击败 Boss 后出现传送门，按 E 进入下一层', () => {
  const { game } = makeGame();
  game.beginRun();
  const b = game.spawnEnemy('boss', 750, 390, 1);
  b.hp = 1;
  game.world.enemies.push(b);
  game.damageEnemy(b, 5, 0, {});
  game.update(0.1);
  game.update(0.2); // 消耗 hit-stop
  assert.ok(game.world.portal, '应出现传送门');
  assert.strictEqual(game.world.layer, 1, '未按 E 前不应进下一层');
  for (let i = 0; i < 40; i++) game.update(0.05); // 传送门生成动画
  assert.ok(game.world.portal.active, '传送门应激活');
  game.world.player.x = game.world.portal.x + 10;
  game.world.player.y = game.world.portal.y;
  game.input.pressedSet.add('KeyE');
  game.update(0.1);
  game.update(0.2);
  game.update(0.5);
  assert.strictEqual(game.world.layer, 2, '按 E 后应进入第二层');
  assert.strictEqual(game.state.screen, 'playing');
});

test('掉落物向四周飞溅且金币磁吸带拖尾', () => {
  const { game } = makeGame();
  game.spawnPickup('coin', 100, 100, 3);
  const k = game.world.pickups[0];
  assert.ok(Math.hypot(k.vx, k.vy) > 120, '掉落物应快速飞溅');
  game.spawnPickup('coin', game.world.player.x + 60, game.world.player.y, 3);
  for (let i = 0; i < 30; i++) game.update(1 / 120);
  assert.ok(game.world.particles.some(p => p.kind === 'spark'), '金币磁吸应有拖尾粒子');
});

test('金币吸取范围增加100%（200px 即可吸取）', () => {
  const { game } = makeGame();
  game.spawnPickup('coin', game.world.player.x + 200, game.world.player.y, 3);
  const k = game.world.pickups[0];
  k.vx = 0;
  k.vy = 0;
  const before = k.x;
  for (let i = 0; i < 30; i++) game.update(1 / 120);
  assert.ok(k.x < before - 10, '200px 距离应开始被吸取');
});

test('部件掉落在障碍物里会被推出', () => {
  const { game, Game } = makeGame();
  game.world.room.obstacles = [{ x: 700, y: 500, w: 100, h: 60 }];
  game.spawnPickup('part', 720, 520, Game.partsEngine.rollPart());
  const k = game.world.pickups[0];
  const inside = k.x + 6 > 700 && k.x - 6 < 800 && k.y + 6 > 500 && k.y - 6 < 560;
  assert.ok(!inside, '掉落物出生即应被推出障碍物');
  game.update(1 / 120);
  const inside2 = k.x + 6 > 700 && k.x - 6 < 800 && k.y + 6 > 500 && k.y - 6 < 560;
  assert.ok(!inside2, '移动后也不应卡在障碍物内');
});

test('重型武器伤害减少30%', () => {
  const { Game } = makeGame();
  assert.strictEqual(Game.PARTS.body.heavy_body.base.damage, 15.4, '重型 22→15.4');
});

test('怪物追击带侧向摆动而非直线', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  game.world.player.x = 600;
  game.world.player.y = 100;
  game.world.enemies.push(e);
  let maxDev = 0;
  for (let i = 0; i < 300; i++) {
    game.update(1 / 120);
    maxDev = Math.max(maxDev, Math.abs(e.y - 100));
  }
  assert.ok(maxDev > 5, '追击应有侧向摆动，maxDev=' + maxDev.toFixed(1));
});

test('B 键在商店打开时关闭面板而非切换', () => {
  const { game } = makeGame();
  game.openPanel('shop');
  game.input.pressedSet.add('KeyB');
  game.update(1 / 120);
  assert.strictEqual(game.ui.panel, 'none', 'B 应关闭商店面板');
});

test('敌人之间有碰撞体积', () => {
  const { game } = makeGame();
  const a = game.spawnEnemy('chaser', 100, 100, 1);
  const b = game.spawnEnemy('chaser', 110, 100, 1);
  game.world.enemies.push(a, b);
  for (let i = 0; i < 10; i++) game.update(1 / 120);
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(d >= a.radius + b.radius - 1, '敌人不应重叠，距离=' + d.toFixed(1));
});

test('红冲锋冲刺撞到玩家会被弹开', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  e.state = 'dash';
  e.dashAngle = 0;
  e.stateT = 0.35;
  game.world.player.x = 140;
  game.world.player.y = 100;
  game.world.enemies.push(e);
  game.update(1 / 120);
  game.update(1 / 120);
  assert.ok(Math.abs(e.dashAngle - Math.PI) < 0.15, '冲刺撞到玩家应反向弹开，实际=' + e.dashAngle);
});

test('传送门跨房间保留', () => {
  const { game } = makeGame();
  game.beginRun();
  const b = game.spawnEnemy('boss', 750, 390, 1);
  b.hp = 1;
  game.world.enemies.push(b);
  game.damageEnemy(b, 5, 0, {});
  game.update(0.1);
  game.update(0.2);
  assert.ok(game.world.portal, '应出现传送门');
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  assert.ok(game.world.portal, '进入其他房间后传送门应保留');
});

test('初始房红色 NPC 对话与右键关闭', () => {
  const { game } = makeGame();
  game.startMap(123);
  assert.ok(game.world.startNpc, '初始房应有 NPC');
  game.world.player.x = game.world.startNpc.x + 20;
  game.world.player.y = game.world.startNpc.y;
  game.input.pressedSet.add('KeyE');
  game.update(1 / 120);
  assert.ok(game.ui.chat && game.ui.chat.lines[0].includes('感谢你游玩'), '应显示作者对话');
  game.closeChat();
  assert.strictEqual(game.ui.chat, null, '关闭后聊天框应消失');
});

test('护甲吸收伤害并随时间恢复', () => {
  const { game } = makeGame();
  game.equipPart({ id: 'standard_armor', slot: 'armor', name: '标准护甲', rarity: 1, color: '#35e0ff', affixes: [] });
  assert.strictEqual(game.world.player.maxArmor, 50, '标准护甲护甲值 50');
  game.world.player.hp = 100;
  game.damagePlayer(20, 0);
  assert.strictEqual(game.world.player.hp, 100, '护甲应完全吸收 20 伤害');
  assert.ok(game.world.player.armor < 50, '护甲应减少');
  for (let i = 0; i < 60; i++) game.update(1 / 120); // 等无敌帧结束
  game.damagePlayer(60, 0);
  assert.ok(game.world.player.hp < 100, '护甲耗尽后扣血');
  const armorAfter = game.world.player.armor;
  for (let i = 0; i < 360; i++) game.update(1 / 120); // 3s：新回复频率为 2.5s/次
  assert.ok(game.world.player.armor > armorAfter + 2, '护甲应随时间恢复');
});

test('锻造房 NPC 与强化/重组', () => {
  const { game, Game } = makeGame();
  let forge = null;
  for (let seed = 1; seed <= 50 && !forge; seed++) {
    game.startMap(seed);
    forge = game.world.map.rooms.find(r => r.type === 'forge');
  }
  assert.ok(forge, '应存在锻造房');
  game.enterRoom(forge.x, forge.y);
  assert.ok(game.world.forgeNpc, '锻造房应有 NPC');
  game.world.player.x = game.world.forgeNpc.x + 20;
  game.world.player.y = game.world.forgeNpc.y;
  game.input.pressedSet.add('KeyE');
  game.update(1 / 120);
  assert.ok(game.ui.chat && game.ui.chat.lines[0].includes('锻造师'), '首次应显示锻造师对话');
  game.closeChat();
  assert.strictEqual(game.ui.panel, 'forgeMenu', '关闭对话后应弹出强化/重组选项');
  const part = {
    id: 'pistol_body', slot: 'body', name: '标准枪身', rarity: 0, color: '#35e0ff',
    affixes: [{ stat: 'damage', label: '伤害', pct: 0.12, value: 0.12, enhanced: false, rerolls: 0 }]
  };
  game.world.inventory.push(part);
  game.openPanel('forgeMenu');
  const enhanceBtn = game.ui.items.find(r => r.action === 'enhanceMenu');
  game.uiClick(enhanceBtn.x + 5, enhanceBtn.y + 5);
  assert.strictEqual(game.ui.panel, 'forgeList', '应进入部件列表');
  const partRow = game.ui.items.find(r => r.part === part);
  game.uiClick(partRow.x + 5, partRow.y + 5);
  assert.strictEqual(game.ui.panel, 'forgeAffix', '应进入词条列表');
  game.world.coins = 100;
  const affRow = game.ui.items.find(r => r.affix === part.affixes[0]);
  game.uiClick(affRow.x + 5, affRow.y + 5);
  assert.ok(part.affixes[0].enhanced, '词条应被强化');
  assert.ok(part.affixes[0].value > 0.12, '强化后数值应提升');
  game.openPanel('forgeMenu');
  const rerollBtn = game.ui.items.find(r => r.action === 'rerollMenu');
  game.uiClick(rerollBtn.x + 5, rerollBtn.y + 5);
  const partRow2 = game.ui.items.find(r => r.part === part);
  game.uiClick(partRow2.x + 5, partRow2.y + 5);
  const affRow2 = game.ui.items.find(r => r.affix === part.affixes[0]);
  game.uiClick(affRow2.x + 5, affRow2.y + 5);
  assert.strictEqual(part.affixes[0].rerolls, 1, '重组次数应 +1');
});

test('护甲品质对应掉落率（护甲会按品质掉落）', () => {
  const { game } = makeGame();
  const orig = Math.random;
  try {
    Math.random = () => 0.03; // 命中护甲掉落分支
    const e = game.spawnEnemy('chaser', 100, 100, 1);
    e.hp = 1;
    game.world.enemies.push(e);
    game.damageEnemy(e, 5, 0, {});
    assert.ok(game.world.pickups.some(p => p.kind === 'part' && p.part.slot === 'armor'), '应掉落护甲部件');
  } finally {
    Math.random = orig;
  }
});

test('护甲回复改为低频少量', () => {
  const { game } = makeGame();
  game.equipPart({ id: 'standard_armor', slot: 'armor', name: '标准护甲', rarity: 1, color: '#35e0ff', affixes: [] });
  game.world.player.armor = 0;
  for (let i = 0; i < 60; i++) game.update(1 / 120); // 0.5s
  assert.strictEqual(game.world.player.armor, 0, '2.5s 间隔前不应恢复');
  for (let i = 0; i < 300; i++) game.update(1 / 120); // 累计 3s
  assert.ok(game.world.player.armor >= 4, '每次恢复约 5.4 点');
});

test('攻击初始房 NPC 触发战/不战选项', () => {
  const { game } = makeGame();
  game.startMap(123);
  const n = game.world.startNpc;
  game.world.bullets.push({ x: n.x + 10, y: n.y, vx: 0, vy: 0, damage: 5, friendly: true, life: 5, size: 3, trail: [] });
  game.update(1 / 120);
  assert.ok(game.ui.chat && game.ui.chat.buttons && game.ui.chat.buttons.length === 2, '应弹出战/不战选项');
  game.uiClick(game.ui.chat.buttons[1].x + 5, game.ui.chat.buttons[1].y + 5);
  assert.strictEqual(game.ui.chat, null, '不战应关闭聊天');
  assert.ok(!game.world.enemies.some(e => e.specialNpc), '不战不应生成战斗 NPC');
});

test('选择战斗后 NPC 变巨型 Boss，击败直接通关，战中死亡重开', () => {
  const { game } = makeGame();
  game.startMap(123);
  const n = game.world.startNpc;
  game.world.bullets.push({ x: n.x + 10, y: n.y, vx: 0, vy: 0, damage: 5, friendly: true, life: 5, size: 3, trail: [] });
  game.update(1 / 120);
  game.uiClick(game.ui.chat.buttons[0].x + 5, game.ui.chat.buttons[0].y + 5);
  const boss = game.world.enemies.find(e => e.specialNpc);
  assert.ok(boss, '应生成战斗 NPC');
  assert.strictEqual(boss.maxHp, 13440, '血量应为 Boss 的 1000%（Boss +60% 后）');
  assert.ok(boss.scale >= 3, '体型应为 300%');
  boss.hp = 1;
  game.damageEnemy(boss, 5, 0, {});
  assert.strictEqual(game.state.screen, 'win', '击败战斗 NPC 应直接通关');
  // 战中死亡重开
  game.restart();
  game.world.fightNpc = true;
  game.world.player.hp = 10;
  game.damagePlayer(100, 0);
  assert.strictEqual(game.state.screen, 'start', '战中死亡应重新开始');
});

test('障碍物阻挡子弹与角色', () => {
  const { game } = makeGame();
  game.world.room.obstacles = [{ x: 700, y: 500, w: 100, h: 60 }];
  game.world.bullets.push({ x: 690, y: 530, vx: 1000, vy: 0, damage: 1, friendly: true, life: 5, size: 3, trail: [] });
  game.update(1 / 120);
  assert.ok(!game.world.bullets.some(b => Math.abs(b.x - 690) < 1 && Math.abs(b.y - 530) < 1), '子弹应被障碍物阻挡');
  game.world.player.x = 690;
  game.world.player.y = 530;
  game.update(1 / 120);
  const r = game.world.room.obstacles[0];
  const inside = game.world.player.x + game.world.player.radius > r.x &&
    game.world.player.x - game.world.player.radius < r.x + r.w &&
    game.world.player.y + game.world.player.radius > r.y &&
    game.world.player.y - game.world.player.radius < r.y + r.h;
  assert.ok(!inside, '玩家不能穿过障碍物');
});

test('金币房：进入生成金币堆且数量在 1~击杀数之间', () => {
  const { game } = makeGame();
  game.world.stats.kills = 5;
  game.startMap(999);
  const coinRoom = game.world.map.rooms.find(r => r.type === 'coin');
  assert.ok(coinRoom, '应存在金币房');
  game.enterRoom(coinRoom.x, coinRoom.y);
  assert.ok(game.world.coinPile && game.world.coinPile.amount >= 1 && game.world.coinPile.amount <= 5,
    '金币数量应在 1~击杀数之间');
  const before = game.world.coins;
  game.input.pressedSet.add('KeyE');
  game.update(1 / 120);
  game.update(1 / 120);
  assert.ok(game.world.coins > before, '按 E 应收集金币堆');
});

test('宝箱界面部件行位于面板内', () => {
  const { game, Game } = makeGame();
  game.world.chestPart = Game.partsEngine.rollPart();
  game.openPanel('chest');
  const m = game.panelMetrics();
  for (const row of game.ui.items) {
    assert.ok(row.y >= m.py && row.y + row.h <= m.py + m.panelH, '宝箱部件行应在面板内');
  }
});

test('屏幕状态机与重新开始', () => {
  const { game } = makeGame();
  assert.strictEqual(game.state.screen, 'start');
  game.setScreen('playing');
  assert.strictEqual(game.state.screen, 'playing');
  game.setScreen('dead');
  game.restart();
  assert.strictEqual(game.state.screen, 'start');
  assert.ok(game.world.player.hp === game.world.player.maxHp, '重开后满血');
});

test('HUD 数据完整', () => {
  const { game } = makeGame();
  const h = game.hudData();
  for (const k of ['hp', 'ammo', 'magSize', 'coins', 'kills', 'screen']) {
    assert.ok(k in h, 'hudData 应包含 ' + k);
  }
});

test('全局约束回归：部件数/粒子池/打击感标志', () => {
  const { Game, game } = makeGame();
  assert.ok(Object.keys(Game.PARTS.body).length >= 5);
  assert.ok(Object.keys(Game.PARTS.ammo).length >= 6);
  const modCount = Object.keys(Game.PARTS.mod).filter(id => id !== 'none_mod').length;
  assert.ok(modCount >= 6);
  assert.strictEqual(game.fx.poolLimit, 1500, '粒子池上限 1500');
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  e.hp = 1;
  game.world.enemies.push(e);
  game.damageEnemy(e, 5, 0, {});
  assert.ok(game.fx.hitStopMs > 0, '击杀应触发 hit-stop');
  const before = game.fx.hitStopMs;
  game.damageEnemy(e, 5, 0, {}); // 已死亡敌人不应叠加
  assert.strictEqual(game.fx.hitStopMs, before, '同一帧不叠加 hit-stop');
});

test('长跑稳定性：模拟 60 秒战斗不报错', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  game.input.mouseHard = true;
  for (let i = 0; i < 7200; i++) game.update(1 / 120);
  assert.ok(game.world.time > 50, '世界时间应推进');
});

test('锻造房出现概率约80%', () => {
  const { Game } = makeGame();
  let count = 0;
  const total = 40;
  for (let s = 1; s <= total; s++) {
    if (Game.map.generate(s, 1).rooms.some(r => r.type === 'forge')) count++;
  }
  assert.ok(count >= total * 0.5 && count <= total * 0.95, '锻造房应约 80% 出现，实际 ' + count + '/' + total);
});

test('波次系统：清空后 3 秒倒计时生成下一波', () => {
  const { game } = makeGame();
  game.startMap(999);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  if (combat.waveTotal === 1) return; // 单波房间无需测倒计时
  while (game.world.enemies.length) {
    for (const e of [...game.world.enemies]) game.killEnemy(e);
    game.update(0.1);
  }
  game.update(0.1);
  assert.strictEqual(combat.waveState, 'countdown', '应进入倒计时');
  assert.ok(combat.waveSpawns.length > 0, '应显示下一波位置');
  assert.ok(!game.world.room.cleared, '倒计时期间不算清房');
  for (let i = 0; i < 35; i++) game.update(0.1);
  assert.strictEqual(combat.waveState, 'active', '倒计时后应生成下一波');
  assert.ok(combat.waveIndex >= 2, '波次应推进');
  assert.ok(game.world.enemies.length > 0, '下一波敌人应出现');
});

test('进入敌人房间 1.5 秒警觉期敌人不行动', () => {
  const { game } = makeGame();
  game.startMap(999);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  game.world.enemies.length = 0;
  const e = game.spawnEnemy('chaser', 300, 300, 1);
  game.world.enemies.push(e);
  const sx = e.x, sy = e.y;
  for (let i = 0; i < 144; i++) game.update(1 / 120); // 1.2s
  assert.ok(Math.hypot(e.x - sx, e.y - sy) < 1, '警觉期内敌人不应移动');
  for (let i = 0; i < 120; i++) game.update(1 / 120); // 再 1s
  assert.ok(Math.hypot(e.x - sx, e.y - sy) > 1, '警觉结束后敌人应行动');
});

test('第二层毒 Boss：血量 ×3、毒圈持续伤害', () => {
  const { game } = makeGame();
  game.startMap(999, 2);
  game.enterRoom(game.world.map.boss.x, game.world.map.boss.y);
  const boss = game.world.enemies.find(e => e.kind === 'boss');
  assert.ok(boss && boss.poison, '第二层 Boss 应为毒系');
  assert.ok(boss.maxHp >= 3000, '毒 Boss 血量应约为 3 倍（3125）');
  game.world.player.hp = 100;
  game.world.player.armor = 0;
  game.world.poisonZones.push({ x: game.world.player.x, y: game.world.player.y, r: 60, life: 2, maxLife: 2, dps: 20 });
  for (let i = 0; i < 60; i++) game.update(1 / 120); // 0.5s
  assert.ok(game.world.player.hp < 100, '毒圈应造成持续伤害');
});

test('背包上限 10：满包不拾取，红色小叉丢弃', () => {
  const { game, Game } = makeGame();
  for (let i = 0; i < 10; i++) game.world.inventory.push(Game.partsEngine.rollPart());
  const part = Game.partsEngine.rollPart();
  game.spawnPickup('part', game.world.player.x + 20, game.world.player.y, part);
  const k = game.world.pickups[0];
  k.vx = 0;
  k.vy = 0;
  for (let i = 0; i < 30; i++) game.update(1 / 120);
  assert.ok(game.world.pickups.some(p => p === k), '满包时部件不应被拾取');
  assert.strictEqual(game.world.inventory.length, 10, '容量保持 10');
  game.world.pickups.length = 0; // 清掉地上的原掉落，便于验证丢弃不产生新掉落
  game.openPanel('parts');
  const row = game.ui.items[0];
  game.uiClick(row.discardX, row.discardY);
  assert.strictEqual(game.world.inventory.length, 9, '丢弃后容量减少');
  assert.ok(!game.world.pickups.some(p => p.kind === 'part'), '丢弃不产生掉落物');
});

test('障碍物随扫描动画逐渐显现', () => {
  const { game } = makeGame();
  game.startMap(999);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  assert.strictEqual(game.world.room.obstacleReveal, 0, '初始未显现');
  for (let i = 0; i < 120; i++) game.update(1 / 120); // 1s
  assert.ok(game.world.room.obstacleReveal > 0, '扫描进度推进');
});

test('进入房间时出现在门那一侧', () => {
  const { game } = makeGame();
  game.startMap(999);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y, 'e'); // 从左往右穿过东门 → 应出现在东门（右侧）
  assert.ok(game.world.player.x < 300, '从东门进入应靠左（门的这一侧）');
  game.enterRoom(combat.x, combat.y, 'n');
  assert.ok(game.world.player.y > 900, '从北门进入应靠下（门的这一侧）');
});

test('清房后背包未满时掉落物飞向玩家；满时部件不飞', () => {
  const { game, Game } = makeGame();
  game.setScreen('playing');
  game.world.room.cleared = true;
  game.world.inventory.length = 0;
  const part = { id: 'pistol_body', slot: 'body', name: '标准枪身', rarity: 0, color: '#35e0ff', affixes: [] };
  game.spawnPickup('part', game.world.player.x + 400, game.world.player.y, part);
  const k = game.world.pickups[0];
  k.vx = 0;
  k.vy = 0;
  const before = k.x;
  for (let i = 0; i < 60; i++) game.update(1 / 120);
  assert.ok(k.x < before - 30, '清房且背包未满时部件应飞向玩家');
  // 满包
  game.world.pickups.length = 0;
  for (let i = 0; i < 10; i++) game.world.inventory.push(Game.partsEngine.rollPart());
  game.spawnPickup('part', game.world.player.x + 400, game.world.player.y, part);
  const k2 = game.world.pickups[0];
  k2.vx = 0;
  k2.vy = 0;
  const before2 = k2.x;
  for (let i = 0; i < 60; i++) game.update(1 / 120);
  assert.ok(Math.abs(k2.x - before2) < 15, '清房但背包满时部件不应飞向玩家');
});

test('敌人房间击败后显示"成功击败"大字', () => {
  const { game } = makeGame();
  game.startMap(999);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  let guard = 0;
  while (!game.world.room.cleared && guard++ < 30) {
    while (game.world.enemies.length) {
      for (const e of [...game.world.enemies]) game.killEnemy(e);
      game.update(0.1);
    }
    for (let i = 0; i < 40; i++) game.update(0.1);
  }
  assert.strictEqual(game.world.banner.text, '成功击败', '清房后应显示成功击败横幅');
});

test('传送门只出现在 Boss 房', () => {
  const { game } = makeGame();
  game.beginRun();
  game.enterRoom(game.world.map.boss.x, game.world.map.boss.y);
  const boss = game.world.enemies[0];
  boss.hp = 1;
  game.damageEnemy(boss, 5, 0, {});
  game.update(0.1);
  game.update(0.2);
  assert.ok(game.world.portal, 'Boss 房应出现传送门');
  assert.ok(game.portalVisible(), '在 Boss 房应可见');
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  assert.ok(!game.portalVisible(), '在其他房间不应可见');
  game.enterRoom(game.world.map.boss.x, game.world.map.boss.y);
  assert.ok(game.portalVisible(), '回到 Boss 房应恢复可见');
});

test('手机端：开始界面点击任意处开始', () => {
  const { game } = makeGame();
  assert.strictEqual(game.state.screen, 'start');
  game.handleTouchPoint(10, 10);
  assert.strictEqual(game.state.screen, 'playing', '手机端点击应开始游戏');
});

test('窄屏启用触摸 UI 且触摸按钮可点击', () => {
  const { game } = makeGame();
  game.debugSetView(700, 500);
  assert.ok(game.isTouchUI(), '窄屏应启用触摸 UI');
  game.setScreen('playing');
  const btns = game.touchButtons();
  const dashBtn = btns.find(b => b.id === 'dash');
  const interactBtn = btns.find(b => b.id === 'interact');
  assert.ok(interactBtn.x <= 700, '按钮应在屏内');
  assert.ok(dashBtn.x > 350, '瞬身按钮应移到右侧');
  game.handleClick(dashBtn.x, dashBtn.y);
  assert.ok(game.input.dashTap, '点击瞬身按钮应触发瞬身');
  game.world.chest = { x: 750, y: 550, opened: false };
  game.handleClick(interactBtn.x, interactBtn.y);
  game.update(1 / 120);
  assert.strictEqual(game.ui.panel, 'chest', '点击交互按钮应打开宝箱');
});

test('手机端辅助自动瞄准吸附最近敌人', () => {
  const { game } = makeGame();
  game.debugSetView(700, 500);
  game.setScreen('playing');
  game.input.touch.firing = true;
  game.input.touch.aimId = 99;
  game.input.touch.aimPos = { x: 1000, y: 300 }; // 大致向右
  game.gun().mag = 0; // 只测瞄准，避免把目标打死
  game.world.player.x = 750;
  game.world.player.y = 550;
  const e = game.spawnEnemy('shooter', 900, 600, 1);
  game.world.enemies.push(e);
  for (let i = 0; i < 60; i++) game.update(1 / 120); // 平滑转动 0.5s 后收敛
  assert.ok(Math.abs(game.world.player.aimAngle - 0.32) < 0.2, '应平滑吸附到最近敌人，实际=' + game.world.player.aimAngle);
});

test('背包满时"背包已满"提示只弹一次', () => {
  const { game, Game } = makeGame();
  game.setScreen('playing');
  for (let i = 0; i < 10; i++) game.world.inventory.push(Game.partsEngine.rollPart());
  const part = { id: 'pistol_body', slot: 'body', name: '标准枪身', rarity: 0, color: '#35e0ff', affixes: [] };
  game.spawnPickup('part', game.world.player.x + 18, game.world.player.y, part);
  const k = game.world.pickups[0];
  k.vx = 0;
  k.vy = 0;
  for (let i = 0; i < 60; i++) game.update(1 / 120);
  const count = game.world.floaters.filter(f => f.text === '背包已满').length;
  assert.strictEqual(count, 1, '满包提示应只弹一次，实际 ' + count + ' 次');
});

test('作者 Boss 朝向跟随玩家', () => {
  const { game } = makeGame();
  game.startMap(123);
  const n = game.world.startNpc;
  game.world.bullets.push({ x: n.x + 10, y: n.y, vx: 0, vy: 0, damage: 5, friendly: true, life: 5, size: 3, trail: [] });
  game.update(1 / 120);
  game.handleClick(game.ui.chat.buttons[0].x + 5, game.ui.chat.buttons[0].y + 5);
  const boss = game.world.enemies.find(e => e.specialNpc);
  game.world.player.x = boss.x;
  game.world.player.y = boss.y + 200;
  for (let i = 0; i < 30; i++) game.update(1 / 120);
  assert.ok(Math.abs(boss.facing - Math.PI / 2) < 0.3, 'Boss 应朝向下方的玩家，实际=' + boss.facing);
});

test('手机端面板打开时点击背包按钮可关闭', () => {
  const { game } = makeGame();
  game.debugSetView(700, 500);
  game.openPanel('parts');
  assert.strictEqual(game.ui.panel, 'parts');
  const btn = game.touchButtons().find(b => b.id === 'panel');
  game.handleTouchPoint(btn.x, btn.y, 1);
  assert.strictEqual(game.ui.panel, 'none', '点击背包按钮应关闭面板');
});

test('属性重组后词条强度为原值的 80%~150%', () => {
  const { game } = makeGame();
  const part = {
    id: 'pistol_body', slot: 'body', name: '标准枪身', rarity: 0, color: '#35e0ff',
    affixes: [{ stat: 'damage', label: '伤害', pct: 0.12, value: 0.12, enhanced: false, rerolls: 0 }]
  };
  const old = part.affixes[0].value;
  game.world.inventory.push(part);
  game.openPanel('forgeMenu');
  const rerollBtn = game.ui.items.find(r => r.action === 'rerollMenu');
  game.uiClick(rerollBtn.x + 5, rerollBtn.y + 5);
  const partRow = game.ui.items.find(r => r.part === part);
  game.uiClick(partRow.x + 5, partRow.y + 5);
  const affRow = game.ui.items.find(r => r.affix === part.affixes[0]);
  game.uiClick(affRow.x + 5, affRow.y + 5);
  const v = part.affixes[0].value;
  assert.ok(v >= old * 0.8 * 0.99 && v <= old * 1.5 * 1.01,
    '强度应在 80%~150% 之间，实际倍率=' + (v / old).toFixed(2));
});

test('手机端竖屏时锁定为横屏提示', () => {
  const { game } = makeGame();
  game.debugSetView(400, 800, true); // 模拟真实触摸设备竖屏
  game.setScreen('playing');
  const t0 = game.world.time;
  game.update(1 / 60);
  assert.strictEqual(game.world.time, t0, '竖屏应锁定不推进');
});

test('子弹耗尽自动换弹', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  const g = game.gun();
  g.mag = 0;
  g.reloading = false;
  game.update(1 / 120);
  assert.ok(g.reloading, '弹匣为 0 应自动换弹');
  for (let i = 0; i < 200; i++) game.update(1 / 120);
  assert.strictEqual(g.mag, g.stats.magSize, '自动换弹完成后弹匣满');
});

test('敌人朝向指示标跟随面向方向', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  game.world.player.x = 300;
  game.world.player.y = 100;
  game.world.enemies.push(e);
  for (let i = 0; i < 10; i++) game.update(1 / 120);
  assert.ok(Math.abs(e.facing) < 0.1, '敌人应面向玩家（右侧），实际=' + e.facing);
  game.world.player.x = 100;
  game.world.player.y = 400;
  for (let i = 0; i < 10; i++) game.update(1 / 120);
  assert.ok(e.facing > Math.PI / 2 - 0.2 && e.facing < Math.PI / 2 + 0.2, '敌人应面向玩家（下方）');
});

test('触摸按钮：交互/换弹/切枪通过 tapQueue 生效', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  game.world.chest = { x: 750, y: 550, opened: false };
  game.input.tapQueue.add('interact');
  game.update(1 / 120);
  assert.strictEqual(game.ui.panel, 'chest', '触摸交互按钮应打开宝箱');
  game.closePanel();
  const g0 = game.world.activeGun;
  game.input.tapQueue.add('switchR');
  game.update(1 / 120);
  assert.notStrictEqual(game.world.activeGun, g0, '触摸切枪应生效');
  const g = game.gun();
  g.mag = 0;
  g.reloading = false;
  game.input.tapQueue.add('reload');
  game.update(1 / 120);
  assert.ok(g.reloading, '触摸换弹应生效');
});

test('手柄：摇杆移动/扳机开火', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  game.input.gp = {
    lx: 1, ly: 0, ax: 1, ay: 0, fire: true,
    dash: false, interact: false, reload: false, panel: false,
    pause: false, switchR: false, switchL: false
  };
  const before = game.world.player.x;
  game.update(1 / 60);
  assert.ok(game.world.player.x > before, '摇杆应移动玩家');
  assert.ok(game.world.bullets.length > 0, '扳机应开火');
});

test('触摸瞬身按钮触发滑步', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  game.input.dashTap = true;
  game.update(1 / 120);
  assert.ok(game.world.dash.active, '触摸瞬身应触发');
});

test('战/不战选项可通过点击路由触发', () => {
  const { game } = makeGame();
  game.startMap(123);
  const n = game.world.startNpc;
  game.world.bullets.push({ x: n.x + 10, y: n.y, vx: 0, vy: 0, damage: 5, friendly: true, life: 5, size: 3, trail: [] });
  game.update(1 / 120);
  const btn = game.ui.chat.buttons[0];
  game.handleClick(btn.x + 5, btn.y + 5); // 模拟真实鼠标点击路由
  assert.ok(game.world.enemies.some(e => e.specialNpc), '点击"战"应生成战斗 NPC');
});

test('松开左键后不再开火，且可再次瞬身', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  game.input.mouseHard = true;
  game.update(1 / 60);
  const fired = game.world.bullets.length;
  assert.ok(fired > 0, '按下应开火');
  game.input.mouseHard = false;
  for (let i = 0; i < 60; i++) game.update(1 / 120); // 0.5s
  assert.strictEqual(game.world.bullets.length, fired, '松开后不应再生成子弹');
  game.input.mouseHard = true;
  game.input.keys.add('Space');
  game.update(1 / 120);
  assert.ok(game.world.dash.active, '松开后再按应可瞬身');
});

test('敌人房间播放房间 BGM，离开后停止', () => {
  const { game } = makeGame();
  game.startMap(999);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  let st = game.musicStatus();
  assert.strictEqual(st.song, 'room', '战斗房应播放房间 BGM');
  assert.strictEqual(st.state, 'loop');
  const other = game.world.map.rooms.find(r => !['start', 'combat', 'elite', 'boss'].includes(r.type));
  assert.ok(other, '地图应有非战斗房间');
  game.enterRoom(other.x, other.y);
  st = game.musicStatus();
  assert.ok(!st.song, '离开敌人房间应停止音乐');
  assert.strictEqual(st.state, 'stopped');
});

test('彩蛋 Boss 播放彩蛋 BGM，未击败离开房间后停止', () => {
  const { game } = makeGame();
  game.startMap(123);
  const n = game.world.startNpc;
  game.world.bullets.push({ x: n.x + 10, y: n.y, vx: 0, vy: 0, damage: 5, friendly: true, life: 5, size: 3, trail: [] });
  game.update(1 / 120);
  game.handleClick(game.ui.chat.buttons[0].x + 5, game.ui.chat.buttons[0].y + 5);
  let st = game.musicStatus();
  assert.strictEqual(st.song, 'surprise', '彩蛋 Boss 应播放彩蛋 BGM');
  // 未击败直接离开房间
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  st = game.musicStatus();
  assert.strictEqual(st.song, 'room', '离开后应切换为房间 BGM，而不是继续播彩蛋 Boss 音乐');
});

test('正常 Boss 房进入播放 Boss BGM', () => {
  const { game } = makeGame();
  game.startMap(555);
  game.enterRoom(game.world.map.boss.x, game.world.map.boss.y);
  const st = game.musicStatus();
  assert.strictEqual(st.song, 'boss');
  assert.ok(st.state === 'intro' || st.state === 'loop', 'Boss 音乐应处于引子或循环状态');
});

test('Boss 击败爆金币雨：40~100 枚分批飞溅且 1 秒后吸附', () => {
  const { game } = makeGame();
  game.beginRun();
  game.enterRoom(game.world.map.boss.x, game.world.map.boss.y);
  const boss = game.world.enemies[0];
  boss.hp = 1;
  game.damageEnemy(boss, 5, 0, {});
  assert.ok(game.world.coinRain && game.world.coinRain.pending >= 40 && game.world.coinRain.pending <= 100,
    '应爆出 40~100 金币，实际=' + (game.world.coinRain && game.world.coinRain.pending));
  game.update(0.1); // 消耗 hit-stop
  game.update(0.1);
  game.update(0.1); // 触发第一批金币雨
  const coins = game.world.pickups.filter(p => p.kind === 'coin');
  const rainCoins = coins.filter(c => c.magnetDelay > 0);
  assert.ok(rainCoins.length > 0, '应分批飞出金币');
  assert.ok(rainCoins.every(c => c.magnetDelay > 0), '刚飞出时不应立即吸附');
  assert.ok(Math.hypot(rainCoins[0].vx, rainCoins[0].vy) > 250, '飞溅速度应比正常高 50%');
  const px = game.world.player.x, py = game.world.player.y;
  const minBefore = Math.min(...game.world.pickups.filter(p => p.kind === 'coin').map(p => Math.hypot(p.x - px, p.y - py)));
  for (let i = 0; i < 240; i++) game.update(1 / 120); // 2s（含 1s 延迟后吸附）
  const minAfter = Math.min(...game.world.pickups.filter(p => p.kind === 'coin').map(p => Math.hypot(p.x - px, p.y - py)));
  assert.ok(minAfter < minBefore - 15, '1 秒后金币应自动飞向玩家');
});

test('电脑端竖窄窗口不显示横屏锁定', () => {
  const { game } = makeGame();
  game.debugSetView(400, 800, false); // 非触摸设备
  assert.ok(game.isTouchUI(), '窄屏仍有紧凑 UI');
  game.setScreen('playing');
  const t0 = game.world.time;
  game.update(1 / 60);
  assert.ok(game.world.time > t0, '非触摸设备竖屏不应锁定');
});

test('清房后播放胜利音效', () => {
  const { game } = makeGame();
  game.startMap(999);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  for (let guard = 0; guard < 12 && !game.world.room.cleared; guard++) {
    for (const e of [...game.world.enemies]) game.damageEnemy(e, 99999, 0);
    for (let i = 0; i < 400; i++) game.update(1 / 120); // 覆盖 3s 波次倒计时
  }
  assert.strictEqual(game.world.room.cleared, true, '房间应最终清空');
  assert.ok(game.audioDebug().includes('victory'), '清房应播放胜利音效，实际最近音效: ' + game.audioDebug().slice(-6).join(','));
  const st = game.musicStatus();
  assert.strictEqual(st.state, 'stopped', '清房后应停止战斗音乐');
  assert.ok(!st.song, '清房后不应有进行中的曲目');
});

test('新机制：三连发枪身一次触发3颗子弹', () => {
  const { game, Game } = makeGame();
  game.world.guns[0].parts.body = { id: 'burst3_body', slot: 'body', name: '三点火枪身', rarity: 1, color: '#7ef29a', affixes: [] };
  game.rebuildGun(0);
  game.input.mouseHard = true;
  game.update(1 / 60);
  assert.strictEqual(game.world.bullets.length, 3, '三连发应一次射3颗');
});
test('新机制：跳弹在墙边反弹不消失', () => {
  const { game } = makeGame();
  game.world.bullets.push({ x: 8, y: 100, px: 8, py: 100, vx: -500, vy: 0, damage: 1, friendly: true, life: 5, size: 3, bounce: 1, fireZone: false, kind: 'standard' });
  game.update(1 / 120);
  assert.ok(game.world.bullets.some(b => b.vx > 0), '撞墙后应反弹向右');
});
test('新机制：破盾弹对护盾伤害翻倍', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('elite', 100, 100, 1);
  game.world.enemies.push(e);
  game.damageEnemy(e, 10, 0, { shieldDmg: 2 });
  assert.strictEqual(e.shield, e.maxShield - 20, '护盾应扣 20');
});
test('新机制：骤冻弹定身敌人', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  game.world.player.x = 200; game.world.player.y = 100;
  game.world.enemies.push(e);
  game.damageEnemy(e, 5, 0, { frozenT: 0.4 });
  assert.ok(e.freezeT > 0, '应被冻结');
  const sx = e.x;
  for (let i = 0; i < 30; i++) game.update(1 / 120);
  assert.ok(Math.abs(e.x - sx) < 1, '冻结期间不应移动');
});
test('新机制：燃烧弹命中生成火焰区域', () => {
  const { game } = makeGame();
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  game.world.enemies.push(e);
  game.damageEnemy(e, 5, 0, {});
  game.world.bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, damage: 1, friendly: true, life: 0, size: 3, fireZone: true, kind: 'standard' });
  game.update(1 / 120);
  assert.ok(game.world.poisonZones.some(z => z.flame), '应生成火焰区域');
});
test('新机制：弹药回收击杀返还子弹', () => {
  const { game } = makeGame();
  const orig = Math.random;
  try {
    Math.random = () => 0.01;
    game.world.guns[0].parts.mod = { id: 'ammo_refund_mod', slot: 'mod', name: '弹药回收', rarity: 1, color: '#7ef29a', affixes: [] };
    game.rebuildGun(0);
    const g = game.gun();
    g.mag = 5;
    const e = game.spawnEnemy('chaser', 100, 100, 1);
    e.hp = 1;
    game.world.enemies.push(e);
    game.damageEnemy(e, 5, 0, {});
    assert.strictEqual(g.mag, 6, '击杀应返还1发');
  } finally { Math.random = orig; }
});
test('新机制：虚空甲概率闪避', () => {
  const { game } = makeGame();
  const orig = Math.random;
  try {
    Math.random = () => 0.01;
    game.equipPart({ id: 'void_armor', slot: 'armor', name: '虚空甲', rarity: 3, color: '#b06cff', affixes: [] });
    game.world.player.hp = 100;
    game.world.player.armor = 0;
    game.damagePlayer(50, 0);
    assert.strictEqual(game.world.player.hp, 100, '应闪避掉伤害');
  } finally { Math.random = orig; }
});
test('新机制：迅捷甲缩短瞬身冷却', () => {
  const { game } = makeGame();
  game.equipPart({ id: 'swift_armor', slot: 'armor', name: '迅捷甲', rarity: 1, color: '#7ef29a', affixes: [] });
  game.setScreen('playing');
  game.input.dashTap = true;
  game.update(1 / 120);
  assert.ok(Math.abs(game.world.dash.cd - 2.25) < 0.01, '瞬身冷却应为 2.25s');
});
test('新机制：吸能甲击杀提升护甲上限', () => {
  const { game } = makeGame();
  game.equipPart({ id: 'absorb_armor', slot: 'armor', name: '吸能甲', rarity: 2, color: '#4dc9ff', affixes: [] });
  const before = game.world.player.maxArmor;
  const e = game.spawnEnemy('chaser', 100, 100, 1);
  e.hp = 1;
  game.world.enemies.push(e);
  game.damageEnemy(e, 5, 0, {});
  assert.strictEqual(game.world.player.maxArmor, before + 1, '击杀后护甲上限应+1');
});

test('开箱房物品固定：重复按 E 物品一致', () => {
  const { game } = makeGame();
  game.startMap(999);
  const tr = game.world.map.rooms.find(r => r.type === 'treasure');
  game.enterRoom(tr.x, tr.y);
  game.input.pressedSet.add('KeyE');
  game.update(1 / 120);
  const first = game.world.chestPart.id;
  game.closePanel();
  game.input.pressedSet.add('KeyE');
  game.update(1 / 120);
  assert.strictEqual(game.world.chestPart.id, first, '重复开箱物品应一致');
});

test('敌人元素攻击：射手子弹施加减速', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  game.world.player.hp = 100;
  game.world.player.armor = 0;
  game.world.bullets.push({ x: 750, y: 550, px: 750, py: 550, vx: 0, vy: 0, damage: 5, friendly: false, life: 5, size: 4, kind: 'enemy', el: { slow: 2, pct: 0.25 } });
  game.update(1 / 120);
  assert.ok(game.world.player.slowT > 0, '应被减速');
});
test('敌人元素攻击：分裂虫毒液施加中毒', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  game.world.player.hp = 100;
  game.world.player.armor = 0;
  game.world.bullets.push({ x: 750, y: 550, px: 750, py: 550, vx: 0, vy: 0, damage: 5, friendly: false, life: 5, size: 4, kind: 'enemy', el: { poison: 3, dps: 3 } });
  game.update(1 / 120);
  assert.ok(game.world.player.poisonT > 0, '应中毒');
  const hp = game.world.player.hp;
  for (let i = 0; i < 60; i++) game.update(1 / 120); // 0.5s DoT
  assert.ok(game.world.player.hp < hp, '中毒应持续掉血');
});

test('障碍物可被击飞与击碎', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  game.world.room.obstacles = [{ x: 700, y: 500, w: 100, h: 60, hp: 200, kvx: 0, kvy: 0, rot: 0, vr: 0, delay: 0 }];
  game.world.bullets.push({ x: 700, y: 520, px: 700, py: 520, vx: 0, vy: 0, damage: 10, friendly: true, life: 5, size: 3, bounce: 0, fireZone: false, kind: 'standard' });
  game.update(1 / 120);
  const o = game.world.room.obstacles[0];
  assert.ok(o.hp < 200, '低伤害应造成伤害');
  assert.ok(o.kvx !== 0 || o.kvy !== 0, '低伤害应击飞障碍物');
  o.hp = 0;
  game.world.bullets.push({ x: 700, y: 520, px: 700, py: 520, vx: 0, vy: 0, damage: 10, friendly: true, life: 5, size: 3, bounce: 0, fireZone: false, kind: 'standard' });
  game.update(1 / 120);
  assert.ok(game.world.room.obstacles.length > 1, '累计伤害应分裂成多块');
});
