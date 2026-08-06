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
    createOscillator: () => ({ connect: noop, start: noop, stop: noop, type: 'sine', frequency: { setValueAtTime: noop } }),
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
