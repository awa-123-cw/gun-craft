const test = require('node:test');
const assert = require('node:assert');

// 引擎与曲谱数据从 boss-music.js 暴露到 globalThis
require('../boss-music.js');
const createBossMusic = globalThis.createBossMusic;
const BGM_DATA = globalThis.BGM_DATA;

// ---------- 可记录事件的伪 AudioContext ----------
function makeMockCtx() {
  const events = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    state: 'running',
    resume() {},
    createGain() {
      return {
        connect() {},
        gain: {
          value: 0.2,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {}
        }
      };
    },
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: {
          value: 440,
          setValueAtTime(v) { osc.f0 = v; },
          exponentialRampToValueAtTime() {},
          linearRampToValueAtTime() {}
        },
        connect() {},
        start(t) { events.push({ kind: 'osc', type: osc.type, f0: osc.f0, t }); },
        stop() {}
      };
      return osc;
    },
    createBuffer(len) {
      return { getChannelData: () => new Float32Array(len) };
    },
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start(t) { events.push({ kind: 'noise', t }); },
        stop() {}
      };
    },
    createFilter() {
      return {
        type: '',
        connect() {},
        frequency: { value: 1000, setValueAtTime() {}, linearRampToValueAtTime() {} }
      };
    }
  };
  return { ctx, events };
}

// ---------- 曲谱数据完整性 ----------
function norm(row) {
  return row.indexOf(' ') >= 0 ? row : row.split('').join(' ');
}

test('BGM 元数据：150BPM、16 小节、0.1s 步长', () => {
  assert.strictEqual(BGM_DATA.bpm, 150);
  assert.strictEqual(BGM_DATA.bars, 16);
  assert.ok(Math.abs(BGM_DATA.stepDur - 0.1) < 1e-9, '16 分音符应为 0.1s');
  assert.ok(Math.abs(BGM_DATA.barDur - 1.6) < 1e-9);
  assert.ok(Math.abs(BGM_DATA.loopDur - 25.6) < 1e-9);
  assert.strictEqual(BGM_DATA.introBars, 4);
});

test('每个音轨：行内 16 个合法 token，rowMap 指向有效行', () => {
  const simple = new Set(['R', '0', '1', 'X']);
  for (const [trackName, track] of Object.entries(BGM_DATA.tracks)) {
    assert.strictEqual(track.rowMap.length, BGM_DATA.bars, trackName + '.rowMap 应对应 16 小节');
    for (const row of track.rows) {
      const tokens = norm(row).split(' ');
      assert.strictEqual(tokens.length, 16, trackName + ' 每行应为 16 步');
      for (const tk of tokens) {
        if (simple.has(tk) || BGM_DATA.chords[tk]) continue;
        assert.match(tk, /^[A-G][0-9]$/, trackName + ' 非法 token: ' + tk);
      }
    }
    for (const bar of track.rowMap) {
      assert.ok(bar >= 0 && bar < track.rows.length, trackName + ' rowMap 越界: ' + bar);
    }
  }
});

test('引子音轨为 64 步（4 小节）', () => {
  for (const [name, row] of Object.entries(BGM_DATA.introTracks)) {
    assert.strictEqual(norm(row).split(' ').length, 64, name + ' 应为 64 步');
  }
});

test('三层强度分配符合设计', () => {
  assert.deepStrictEqual([...BGM_DATA.levels['1']].sort(), ['bass', 'hat', 'kick', 'riff', 'snare'].sort());
  assert.deepStrictEqual([...BGM_DATA.levels['2']].sort(), ['arp', 'stab'].sort());
  assert.deepStrictEqual([...BGM_DATA.levels['3']].sort(), ['lead', 'riser'].sort());
});

// ---------- 引擎 API 与空操作安全 ----------
test('null ctx 时返回安全的空操作 API', () => {
  const m = createBossMusic(null);
  assert.strictEqual(typeof m.start, 'function');
  assert.strictEqual(typeof m.update, 'function');
  assert.strictEqual(typeof m.setPhase, 'function');
  assert.strictEqual(typeof m.victory, 'function');
  assert.strictEqual(typeof m.stop, 'function');
  assert.strictEqual(typeof m.renderBlock, 'function');
  assert.doesNotThrow(() => {
    m.start();
    m.update();
    m.setPhase(3);
    m.victory();
    m.renderBlock(0, 10);
    m.stop();
  });
});

// ---------- 调度行为 ----------
// 以 0.1s 步进推进伪时钟，让提前调度窗口覆盖完整小节
function advanceBar(m, ctx, steps) {
  for (let k = 0; k <= steps; k++) {
    ctx.currentTime = m.loopStart() + k * BGM_DATA.stepDur + 0.001;
    m.update();
  }
}

test('start() 立即调度引子警报（≥8 个锯齿警报音）', () => {
  const { ctx, events } = makeMockCtx();
  const m = createBossMusic(ctx);
  m.start();
  assert.ok(events.length > 30, '引子应调度 30+ 事件，实际 ' + events.length);
  const klaxons = events.filter(e => e.kind === 'osc' && e.type === 'sawtooth' && e.f0 >= 400);
  assert.ok(klaxons.length >= 8, '引子应有警报音，实际 ' + klaxons.length);
  const tMax = Math.max(...events.map(e => e.t));
  assert.ok(tMax <= BGM_DATA.introDur + 0.2, '引子事件应在引子窗口内，实际最晚 ' + tMax);
});

test('主循环：阶段1 每小节 4 个 Kick、2 个军鼓', () => {
  const { ctx, events } = makeMockCtx();
  const m = createBossMusic(ctx);
  m.start();
  const loopStart = m.loopStart();
  advanceBar(m, ctx, 16);
  const kicks = events.filter(e =>
    e.kind === 'osc' && e.type === 'sine' && e.f0 >= 100 && e.f0 <= 200 &&
    e.t >= loopStart && e.t < loopStart + BGM_DATA.barDur);
  assert.strictEqual(kicks.length, 4, '阶段1 首小节应有 4 个 Kick，实际 ' + kicks.length);
  const snares = events.filter(e =>
    e.kind === 'noise' && e.t >= loopStart && e.t < loopStart + BGM_DATA.barDur);
  // 每小节噪声：军鼓 2 + 反拍闭镲 4 + Kick 瞬态 4 = 10
  assert.strictEqual(snares.length, 10, '阶段1 首小节噪声事件应为 10，实际 ' + snares.length);
});

test('阶段2 叠加琶音（三角波）与 Stab（锯齿 +6）', () => {
  const countSaws = (m, ctx, events) => {
    advanceBar(m, ctx, 16);
    return events.filter(e =>
      e.kind === 'osc' && e.type === 'sawtooth' &&
      e.t >= m.loopStart() && e.t < m.loopStart() + BGM_DATA.barDur).length;
  };
  const a = makeMockCtx();
  const ma = createBossMusic(a.ctx);
  ma.start();
  const p1 = countSaws(ma, a.ctx, a.events); // 贝斯16 + Riff 7 + 回声 12 = 35
  const b = makeMockCtx();
  const mb = createBossMusic(b.ctx);
  mb.start();
  mb.setPhase(2);
  const p2 = countSaws(mb, b.ctx, b.events);
  assert.strictEqual(p1, 35, '阶段1 首小节锯齿应为 35（贝斯16+Riff7+回声12），实际 ' + p1);
  assert.strictEqual(p2 - p1, 6, '阶段2 应新增 2 个三音 Stab（+6 锯齿），实际差值 ' + (p2 - p1));
  const arps = b.events.filter(e =>
    e.kind === 'osc' && e.type === 'triangle' &&
    e.t >= mb.loopStart() && e.t < mb.loopStart() + BGM_DATA.barDur);
  assert.strictEqual(arps.length, 16, '阶段2 首小节应有 16 个琶音音头，实际 ' + arps.length);
});

test('阶段3 叠加主旋律（+16 锯齿）且踩镲翻倍（+8 噪声）', () => {
  const inBar = (ev, type, m) => ev.filter(e =>
    e.kind === type && e.t >= m.loopStart() && e.t < m.loopStart() + BGM_DATA.barDur).length;
  const a = makeMockCtx();
  const ma = createBossMusic(a.ctx);
  ma.start();
  ma.setPhase(2);
  advanceBar(ma, a.ctx, 16);
  const p2Saws = a.events.filter(e =>
    e.kind === 'osc' && e.type === 'sawtooth' &&
    e.t >= ma.loopStart() && e.t < ma.loopStart() + BGM_DATA.barDur).length;
  const p2Noise = inBar(a.events, 'noise', ma);

  const b = makeMockCtx();
  const mb = createBossMusic(b.ctx);
  mb.start();
  mb.setPhase(3);
  advanceBar(mb, b.ctx, 16);
  const p3Saws = b.events.filter(e =>
    e.kind === 'osc' && e.type === 'sawtooth' &&
    e.t >= mb.loopStart() && e.t < mb.loopStart() + BGM_DATA.barDur).length;
  const p3Noise = inBar(b.events, 'noise', mb);
  assert.ok(p3Saws - p2Saws >= 16, '阶段3 应新增 8 音 × 2 振荡器主旋律（至少 +16 锯齿，回声另计），实际差值 ' + (p3Saws - p2Saws));
  assert.strictEqual(p3Noise - p2Noise, 4, '阶段3 踩镲应由 4 个翻倍为 8 个（+4 噪声），实际差值 ' + (p3Noise - p2Noise));
});

test('setPhase 限制在 1~3 且上升时调度指定时间的过渡上挑', () => {
  const { ctx, events } = makeMockCtx();
  const m = createBossMusic(ctx);
  m.setPhase(0);
  assert.strictEqual(m.getPhase(), 1);
  m.setPhase(2, 12.5);
  assert.ok(events.some(e => e.t === 12.5 && e.kind === 'noise'), '上升过渡应调度在指定时间');
  m.setPhase(9);
  assert.strictEqual(m.getPhase(), 3);
  m.setPhase(1);
  assert.strictEqual(m.getPhase(), 1, '下降阶段直接切换');
});

test('victory() 播放收束音后不再调度', () => {
  const { ctx, events } = makeMockCtx();
  const m = createBossMusic(ctx);
  m.start();
  const end = m.loopStart() + 100;
  m.victory(end);
  assert.ok(events.some(e => e.kind === 'osc' && e.type === 'sine' && e.f0 < 120), '应有低音 Boom');
  assert.ok(events.some(e => e.kind === 'osc' && e.t >= end && e.f0 >= 400), '胜利收束音应落在指定时间之后');
  const before = events.length;
  ctx.currentTime = end + 10;
  m.update();
  assert.strictEqual(events.length, before, 'victory 后不应再调度');
});

test('stop() 停止后续调度', () => {
  const { ctx, events } = makeMockCtx();
  const m = createBossMusic(ctx);
  m.start();
  m.stop();
  const before = events.length;
  ctx.currentTime = 100;
  m.update();
  assert.strictEqual(events.length, before);
});

test('renderBlock 一次性调度整段循环（68 Kick / 32 军鼓）', () => {
  const { ctx, events } = makeMockCtx();
  const m = createBossMusic(ctx);
  m.start();
  const from = m.loopStart();
  m.renderBlock(from, from + BGM_DATA.loopDur);
  const inRange = events.filter(e => e.t >= from && e.t < from + BGM_DATA.loopDur);
  assert.ok(inRange.length > 500, '一个循环应调度 500+ 事件，实际 ' + inRange.length);
  const kicks = inRange.filter(e => e.kind === 'osc' && e.type === 'sine' && e.f0 >= 100 && e.f0 <= 200);
  assert.strictEqual(kicks.length, 68, '12 小节 × 4 + 4 小节 × 5 = 68 Kick，实际 ' + kicks.length);
  const snares = inRange.filter(e => e.kind === 'noise' && e.t >= from && e.t < from + BGM_DATA.loopDur);
  assert.strictEqual(snares.length, 32 + 68 + 80, '军鼓 32 + Kick 瞬态 68 + 踩镲 80（12×4 + 4×8）');
});
