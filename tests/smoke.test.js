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
  game.world.player.x = 1000;
  game.world.player.y = 700;
  game.update(0.5); // 0.5s 应拆成 60 步
  assert.ok(game.camera.x > 900, '相机应跟随玩家（存在插值或直接吸附均可）');
  assert.strictEqual(game.world.time, 0.5);
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
  assert.strictEqual(game.gun().parts[part.slot].id, part.id, '部件应装备到对应槽');
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
  for (const e of [...game.world.enemies]) game.killEnemy(e);
  game.update(0.1); // 先消耗击杀 hit-stop
  game.update(1 / 60);
  assert.ok(game.world.room.cleared, '清怪后房间应标记 cleared');
  assert.ok(Object.values(game.world.room.doors).some(Boolean), '应有门');
});
