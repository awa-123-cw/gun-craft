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
  assert.ok(game.camera.x > 900, '相机应跟随玩家（从 750 收敛到玩家附近）');
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
  game.input.mouse.down = true;
  game.update(1 / 60);
  assert.ok(game.world.player.recoil > 0.5, '重型后坐力应明显');
});

test('子弹带拖尾（记录上一帧位置）', () => {
  const { game } = makeGame();
  game.input.mouse.down = true;
  game.update(1 / 60);
  const b = game.world.bullets[0];
  assert.ok(b && b.px !== undefined && b.py !== undefined, '子弹应记录拖尾起点');
});

test('瞬身：空格+左键触发，冷却3秒，击杀重置', () => {
  const { game } = makeGame();
  game.setScreen('playing');
  game.input.keys.add('Space');
  game.input.mouse.down = true; // 边沿触发
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
  game.input.mouse.down = true;
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
  game.input.mouse.down = true;
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

test('部件库齐全：枪身5 弹药6 配件6', () => {
  const { Game } = makeGame();
  assert.strictEqual(Object.keys(Game.PARTS.body).length, 5);
  assert.strictEqual(Object.keys(Game.PARTS.ammo).length, 6);
  const modCount = Object.keys(Game.PARTS.mod).filter(id => id !== 'none_mod').length;
  assert.strictEqual(modCount, 6);
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

test('进入战斗房刷怪，清空后开门', () => {
  const { game } = makeGame();
  game.startMap(999);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  assert.ok(combat, '应存在战斗房');
  game.enterRoom(combat.x, combat.y);
  assert.ok(game.world.enemies.length > 0, '战斗房应刷怪');
  while (game.world.enemies.length) {
    for (const e of [...game.world.enemies]) game.killEnemy(e);
  }
  game.update(0.1); // 先消耗击杀 hit-stop
  game.update(1 / 60);
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
  assert.strictEqual(b.maxHp, 840, 'Boss 血量应为 840');
  game.startMap(777);
  const combat = game.world.map.rooms.find(r => r.type === 'combat');
  game.enterRoom(combat.x, combat.y);
  assert.ok(game.world.enemies.length >= 12, '普通战斗房至少 12 只怪（×3）');
});

test('部件掉落概率降低30%，金币概率提高且按强弱给量', () => {
  const { game } = makeGame();
  const orig = Math.random;
  try {
    Math.random = () => 0.025; // 原 3% 会掉部件，新 2.1% 不掉
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
  for (let i = 0; i < 120; i++) game.update(1 / 120);
  assert.ok(game.world.player.armor > armorAfter + 4, '护甲应随时间恢复');
});

test('锻造房 NPC 与强化/重组', () => {
  const { game, Game } = makeGame();
  game.startMap(999);
  const forge = game.world.map.rooms.find(r => r.type === 'forge');
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
  game.input.mouse.down = true;
  for (let i = 0; i < 7200; i++) game.update(1 / 120);
  assert.ok(game.world.time > 50, '世界时间应推进');
});
