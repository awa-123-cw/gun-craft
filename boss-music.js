/*!
 * 机械核心 (Mechanical Core) — 《枪械工艺》Boss 战 BGM
 * Dark synthwave / industrial · 150 BPM · A 小调 · 16 小节无缝循环
 * 全部音色由 WebAudio 振荡器/噪声实时合成，无任何音频素材。
 * 曲谱数据在 BGM_DATA（合法 JSON），引擎为纯函数工厂 createBossMusic(ctx, opts)。
 */
(function (global) {
  'use strict';

  const BGM_DATA = {
    "bpm": 150,
    "bars": 16,
    "stepDur": 0.1,
    "barDur": 1.6,
    "loopDur": 25.6,
    "introBars": 4,
    "introDur": 6.4,
    "levels": {
      "1": ["kick", "snare", "hat", "bass", "riff"],
      "2": ["arp", "stab"],
      "3": ["lead", "riser"]
    },
    "chords": {
      "A": ["A3", "C4", "E4"],
      "F": ["F3", "A3", "C4"],
      "C": ["C4", "E4", "G4"],
      "G": ["G3", "B3", "D4"]
    },
    "tracks": {
      "kick": {
        "rows": ["1000100010001000", "1000100010001001"],
        "rowMap": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]
      },
      "snare": {
        "rows": ["0000100000001000"],
        "rowMap": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      },
      "hat": {
        "rows": ["0010001000100010", "1010101010101010"],
        "rowMap": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
        "phaseRows": { "3": 1 }
      },
      "bass": {
        "rows": [
          "A1 A1 A1 A2 A1 A1 A1 A1 A1 A1 A1 A2 A1 A1 A1 A2",
          "F1 F1 F1 F2 F1 F1 F1 F1 F1 F1 F1 F2 F1 F1 F1 F2",
          "C2 C2 C2 C3 C2 C2 C2 C2 C2 C2 C2 C3 C2 C2 C2 C3",
          "G1 G1 G1 G2 G1 G1 G1 G1 G1 G1 G1 G2 G1 G1 G1 G2"
        ],
        "rowMap": [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]
      },
      "riff": {
        "rows": [
          "A3 R C4 R B3 R C4 R A3 R G3 R A3 R R R",
          "F3 R A3 R G3 R A3 R F3 R E3 R F3 R R R",
          "C4 R E4 R D4 R E4 R C4 R B3 R C4 R R R",
          "G3 R B3 R A3 R B3 R G3 R F3 R G3 R R R",
          "A4 R G4 R E4 R C4 R E4 R C4 R A3 R R R",
          "F4 R E4 R C4 R A3 R C4 R A3 R F3 R R R",
          "C5 R B4 R G4 R E4 R G4 R E4 R C4 R R R",
          "G4 R F4 R D4 R B3 R D4 R B3 R G3 R R R",
          "A3 R C4 R B3 R C4 R A3 R G3 R A3 R R R",
          "F3 R A3 R G3 R A3 R F3 R E3 R F3 R R R",
          "C4 R E4 R D4 R E4 R C4 R B3 R C4 R R R",
          "G3 R B3 R A3 R B3 R G3 R F3 R G3 R R R",
          "A3 R C4 R E4 R A4 R C5 R A4 R E4 R A4 R",
          "F3 R A3 R C4 R F4 R A4 R F4 R C4 R A4 R",
          "C4 R E4 R G4 R C5 R E5 R C5 R G4 R E5 R",
          "G4 R B4 R D5 R G5 R R R R R R R R R"
        ],
        "rowMap": [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 8, 9, 10, 11]
      },
      "arp": {
        "rows": [
          "A3 C4 E4 A4 C5 A4 E4 C4 A3 C4 E4 A4 C5 A4 E4 C4",
          "F3 A3 C4 F4 A4 F4 C4 A3 F3 A3 C4 F4 A4 F4 C4 A3",
          "C4 E4 G4 C5 E5 C5 G4 E4 C4 E4 G4 C5 E5 C5 G4 E4",
          "G3 B3 D4 G4 B4 G4 D4 B3 G3 B3 D4 G4 B4 G4 D4 B3"
        ],
        "rowMap": [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]
      },
      "stab": {
        "rows": [
          "R R R R R R A R R R R R R R A R",
          "R R R R R R F R R R R R R R F R",
          "R R R R R R C R R R R R R R C R",
          "R R R R R R G R R R R R R R G R"
        ],
        "rowMap": [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]
      },
      "lead": {
        "rows": [
          "A4 R C5 R B4 R C5 R A4 R G4 R A4 R R R",
          "F4 R A4 R G4 R A4 R F4 R E4 R F4 R R R",
          "E4 R G4 R F4 R G4 R E4 R D4 R E4 R R R",
          "E4 R D4 R B3 R E4 R D4 R B3 R G3 R R R",
          "A4 R E5 R C5 R A4 R C5 R B4 R A4 R R R",
          "F4 R C5 R A4 R F4 R A4 R G4 R F4 R R R",
          "G4 R E5 R C5 R G4 R C5 R B4 R G4 R R R",
          "B4 R D5 R G4 R B4 R D5 R B4 R G4 R R R",
          "A4 R C5 R B4 R C5 R A4 R G4 R A4 R R R",
          "F4 R A4 R G4 R A4 R F4 R E4 R F4 R R R",
          "E4 R G4 R F4 R G4 R E4 R D4 R E4 R R R",
          "E4 R D4 R B3 R E4 R D4 R B3 R G3 R R R",
          "A4 R C5 R E5 R A5 R R R R R R R R R",
          "A5 R F5 R C5 R A4 R C5 R A4 R F4 R R R",
          "C5 R E5 R G5 R C6 R R R R R R R R R",
          "B5 R D5 R G4 R B4 R G4 R R R R R R R"
        ],
        "rowMap": [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 8, 9, 10, 11]
      },
      "riser": {
        "rows": [
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R R R R R",
          "R R R R R R R R R R R R X X X X"
        ],
        "rowMap": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
      }
    },
    "introTracks": {
      "kick": "0000000000000000000000000000000010001000100010001000100010001000",
      "snare": "0000000000000000000000000000000000001000000010000000100000001000",
      "hat": "0000000000000000000000000000000000100010001000101010101010101010",
      "klaxon": "A4 R R R E4 R R R A4 R R R E4 R R R A4 R R R E4 R R R A4 R R R E4 R R R R R A4 R R R E4 R R R A4 R R R E4 R A4 R E4 R A4 R E4 R A4 R E4 R A4 R E4 R"
    },
    "introRiserAtEnd": true,
    "surpriseIntroBars": 4,
    "surpriseRiserAtEnd": true,
    "surpriseIntroTracks": {
      "kick": "1000000000000000100000000000000010000000100000001000100010001000",
      "snare": "0000000000000000000000000000000000000000000000000000100000001000",
      "hat": "0000000000000000000000000000000000100010001000101010101010101010",
      "boing": "C5 R R R E5 R R R G5 R R R E5 R R R C5 R E5 R G5 R C6 R R R R R R R R R R R R R R R R R R R R R R R R R R R R R",
      "scratch": "R R R R R R R R R R R R R R R R R R R R R R R R R R R R X R R R R R R R R R R R R R R R R R R R R R R R R R R R R R",
      "boom": "R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R 1 R R R"
    },
    "room": {
      "tempo": 128,
      "bars": 8,
      "stepDur": 0.1171875,
      "barDur": 1.875,
      "loopDur": 15.0,
      "levels": {
        "1": ["kick", "snare", "hat", "bass", "arp", "lead"]
      },
      "tracks": {
        "kick": {
          "rows": ["1000000010000000"],
          "rowMap": [0, 0, 0, 0, 0, 0, 0, 0]
        },
        "snare": {
          "rows": ["0000100000001000"],
          "rowMap": [0, 0, 0, 0, 0, 0, 0, 0]
        },
        "hat": {
          "rows": ["0010001000100010"],
          "rowMap": [0, 0, 0, 0, 0, 0, 0, 0]
        },
        "bass": {
          "rows": [
            "A1 R A1 R A1 R A1 R A1 R A1 R A1 R A2 R",
            "F1 R F1 R F1 R F1 R F1 R F1 R F1 R F2 R",
            "C2 R C2 R C2 R C2 R C2 R C2 R C2 R C3 R",
            "G1 R G1 R G1 R G1 R G1 R G1 R G1 R G2 R"
          ],
          "rowMap": [0, 1, 2, 3, 0, 1, 2, 3]
        },
        "arp": {
          "rows": [
            "A3 R C4 R E4 R C4 R A3 R C4 R E4 R C4 R",
            "F3 R A3 R C4 R A3 R F3 R A3 R C4 R A3 R",
            "C4 R E4 R G4 R E4 R C4 R E4 R G4 R E4 R",
            "G3 R B3 R D4 R B3 R G3 R B3 R D4 R B3 R"
          ],
          "rowMap": [0, 1, 2, 3, 0, 1, 2, 3]
        },
        "lead": {
          "rows": [
            "E4 R R R R R R R C4 R R R R R R R",
            "F4 R R R R R R R A3 R R R R R R R",
            "G4 R R R R R R R E4 R R R R R R R",
            "B3 R R R R R R R D4 R R R R R R R",
            "A4 R R R R R R R E4 R R R R R R R",
            "F4 R R R R R R R C4 R R R R R R R",
            "E4 R R R R R R R G4 R R R R R R R",
            "D4 R R R R R R R B3 R R R R R R R"
          ],
          "rowMap": [0, 1, 2, 3, 4, 5, 6, 7]
        }
      }
    },
    "victory": [
      { "s": 0, "t": "boom" },
      { "s": 0, "t": "chord", "v": "A", "d": 8 },
      { "s": 4, "t": "note", "v": "C5", "d": 3 },
      { "s": 7, "t": "note", "v": "E5", "d": 3 },
      { "s": 10, "t": "chord", "v": "A", "d": 8, "o": 1 },
      { "s": 14, "t": "note", "v": "A5", "d": 6 }
    ]
  };

  // ---------- 音名 → 频率 ----------
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freqOf(name) {
    const m = /^([A-G])(\d)$/.exec(name);
    if (!m) return 0;
    const midi = (parseInt(m[2], 10) + 1) * 12 + SEMI[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ---------- 引擎 ----------
  function createBossMusic(ctx, opts) {
    opts = opts || {};
    const ahead = Math.max(0.05, opts.scheduleAhead || 0.15);
    const masterGain = opts.masterGain || 0.22;
    const out = opts.output || (ctx ? ctx.destination : null);
    const D = BGM_DATA;
    // 曲目：boss（默认）| surprise（彩蛋 Boss：惊奇引子 + Boss 主循环）| room（敌人房间）
    const SONGS = {
      boss: {
        bars: D.bars, stepDur: D.stepDur, barDur: D.barDur, loopDur: D.loopDur,
        introBars: D.introBars, introDur: D.introDur,
        levels: D.levels, tracks: D.tracks,
        introTracks: D.introTracks, introRiserAtEnd: D.introRiserAtEnd,
        introTrackList: ['kick', 'snare', 'hat', 'klaxon']
      },
      surprise: {
        bars: D.bars, stepDur: D.stepDur, barDur: D.barDur, loopDur: D.loopDur,
        introBars: D.surpriseIntroBars, introDur: D.surpriseIntroBars * D.stepDur * 16,
        levels: D.levels, tracks: D.tracks,
        introTracks: D.surpriseIntroTracks, introRiserAtEnd: D.surpriseRiserAtEnd,
        introTrackList: ['kick', 'snare', 'hat', 'boing', 'scratch', 'boom']
      },
      room: {
        bars: D.room.bars, stepDur: D.room.stepDur, barDur: D.room.barDur, loopDur: D.room.loopDur,
        introBars: 0, introDur: 0,
        levels: D.room.levels, tracks: D.room.tracks,
        introTracks: null, introRiserAtEnd: false,
        introTrackList: []
      }
    };

    let state = 'idle';   // idle | intro | loop | stopped
    let phase = 1;
    let songKey = 'boss';
    let song = SONGS.boss;
    let startTime = 0;    // 引子开始时刻
    let loopStart = 0;    // 当前循环周期起始时刻
    let sAbs = 0;         // 循环内已调度步数
    let scheduledThrough = 0; // 循环内已调度到的时间点（绝对时间）
    let master = null;

    // 行数据可能是紧凑串（鼓点 1000100010001000）或空格分隔（音符行），统一展开
    const norm = row => (row.indexOf(' ') >= 0 ? row : row.split('').join(' '));
    const cache = {};
    function prepare(key) {
      if (cache[key]) return cache[key];
      const s = SONGS[key];
      const tracks = {};
      for (const k of Object.keys(s.tracks)) {
        const tr = s.tracks[k];
        tracks[k] = {
          rowMap: tr.rowMap,
          phaseRows: tr.phaseRows || null,
          rows: tr.rows.map(norm)
        };
      }
      const intro = {};
      if (s.introTracks) {
        for (const k of Object.keys(s.introTracks)) intro[k] = norm(s.introTracks[k]);
      }
      cache[key] = { tracks, intro };
      return cache[key];
    }

    if (ctx && out) {
      try {
        master = ctx.createGain();
        master.gain.value = masterGain;
        master.connect(out);
      } catch (e) { master = null; }
    }
    const canPlay = !!master;

    function activeTracks() {
      const lv = song.levels;
      const set = new Set(lv['1']);
      if (phase >= 2 && lv['2']) for (const t of lv['2']) set.add(t);
      if (phase >= 3 && lv['3']) for (const t of lv['3']) set.add(t);
      return set;
    }

    // ---------- 合成小工具（兼容无 createBiquadFilter 的测试环境） ----------
    function setFreq(node, v, t) {
      if (node.frequency && node.frequency.setValueAtTime) node.frequency.setValueAtTime(v, t);
    }
    function rampFreq(node, v, t) {
      const f = node.frequency;
      if (!f) return;
      if (f.exponentialRampToValueAtTime) f.exponentialRampToValueAtTime(Math.max(1, v), t);
      else if (f.linearRampToValueAtTime) f.linearRampToValueAtTime(v, t);
      else if (f.setValueAtTime) f.setValueAtTime(v, t);
    }
    function rampGain(g, v, t) {
      if (g.gain.exponentialRampToValueAtTime) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), t);
      else if (g.gain.linearRampToValueAtTime) g.gain.linearRampToValueAtTime(v, t);
      else if (g.gain.setValueAtTime) g.gain.setValueAtTime(v, t);
    }
    function lowpass(t, cutoff) {
      const make = ctx.createFilter || ctx.createBiquadFilter;
      if (!make) return null;
      const f = make.call(ctx);
      f.type = 'lowpass';
      if (f.frequency && f.frequency.setValueAtTime) f.frequency.setValueAtTime(cutoff, t);
      return f;
    }

    function noteF(f0, t, dur, type, vol, cutoff) {
      if (!canPlay) return;
      const a = ctx.createOscillator();
      const g = ctx.createGain();
      a.type = type || 'sawtooth';
      setFreq(a, f0, t);
      g.gain.setValueAtTime(0.0001, t);
      rampGain(g, vol, t + 0.006);
      rampGain(g, 0.0001, t + dur);
      let node = a;
      if (cutoff) {
        const f = lowpass(t, cutoff);
        if (f) { a.connect(f); node = f; }
      }
      node.connect(g);
      g.connect(master);
      a.start(t);
      if (a.stop) a.stop(t + dur + 0.05);
    }

    function noteEcho(f0, t, dur, type, vol, cutoff, echoes) {
      noteF(f0, t, dur, type, vol, cutoff);
      (echoes || []).forEach(ed => {
        noteF(f0, t + ed.delay, dur, type, vol * ed.vol, cutoff * 0.7);
      });
    }

    function noiseAt(t, dur, vol, ftype, cutoff, cutoffEnd) {
      if (!canPlay) return;
      const sr = ctx.sampleRate || 44100;
      const len = Math.max(1, Math.floor(sr * dur));
      const buf = ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      rampGain(g, vol, t + 0.005);
      rampGain(g, 0.0001, t + dur);
      let node = src;
      if (cutoff && (ctx.createFilter || ctx.createBiquadFilter)) {
        const make = ctx.createFilter || ctx.createBiquadFilter;
        const f = make.call(ctx);
        f.type = ftype || 'lowpass';
        if (f.frequency && f.frequency.setValueAtTime) {
          f.frequency.setValueAtTime(cutoff, t);
          if (cutoffEnd && f.frequency.linearRampToValueAtTime) {
            f.frequency.linearRampToValueAtTime(cutoffEnd, t + dur);
          }
        }
        src.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(master);
      src.start(t);
      if (src.stop) src.stop(t + dur + 0.05);
    }

    // ---------- 乐器 ----------
    function kick(t) {
      if (!canPlay) return;
      const a = ctx.createOscillator();
      const g = ctx.createGain();
      a.type = 'sine';
      setFreq(a, 150, t);
      rampFreq(a, 44, t + 0.1);
      g.gain.setValueAtTime(0.0001, t);
      rampGain(g, 1.0, t + 0.004);
      rampGain(g, 0.0001, t + 0.12);
      a.connect(g);
      g.connect(master);
      a.start(t);
      if (a.stop) a.stop(t + 0.16);
      noiseAt(t, 0.03, 0.25, 'highpass', 4000);
    }
    function snare(t) {
      noiseAt(t, 0.1, 0.5, 'bandpass', 1900);
      noteF(220, t, 0.07, 'sine', 0.25, 0);
    }
    function hat(t) {
      noiseAt(t, 0.035, 0.2, 'highpass', 7500);
    }
    function bassNote(t, f0, accent) {
      noteF(f0, t, 0.085, 'sawtooth', accent ? 0.55 : 0.45, 700);
    }
    function riffNote(t, f0) {
      noteEcho(f0, t, 0.11, 'sawtooth', 0.3, 2200, [
        { delay: 0.3, vol: 0.4 },
        { delay: 0.6, vol: 0.16 }
      ]);
    }
    function arpNote(t, f0) {
      noteF(f0, t, 0.085, 'triangle', 0.3, 3500);
    }
    function stab(t, f0s) {
      for (const f0 of f0s) noteF(f0, t, 0.14, 'sawtooth', 0.2, 1500);
    }
    function leadNote(t, f0) {
      noteF(f0 * 1.006, t, 0.16, 'sawtooth', 0.2, 3200);
      noteF(f0 * 0.994, t, 0.16, 'sawtooth', 0.2, 3200);
      noteF(f0 * 1.006, t + 0.35, 0.14, 'sawtooth', 0.1, 2400);
      noteF(f0 * 0.994, t + 0.35, 0.14, 'sawtooth', 0.1, 2400);
    }
    function riser(t, dur) {
      if (!canPlay) return;
      noiseAt(t, dur, 0.35, 'bandpass', 350, 6000);
      const a = ctx.createOscillator();
      const g = ctx.createGain();
      a.type = 'sawtooth';
      setFreq(a, 160, t);
      rampFreq(a, 1400, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      rampGain(g, 0.15, t + 0.02);
      rampGain(g, 0.0001, t + dur);
      a.connect(g);
      g.connect(master);
      a.start(t);
      if (a.stop) a.stop(t + dur + 0.05);
    }
    function klaxon(t, f0) {
      noteF(f0 * 1.02, t, 0.24, 'sawtooth', 0.4, 1400);
      noteF(f0 * 0.98, t, 0.24, 'sawtooth', 0.4, 1400);
    }
    function boing(t, f0) {
      if (!canPlay) return;
      const a = ctx.createOscillator();
      const g = ctx.createGain();
      a.type = 'square';
      setFreq(a, f0, t);
      rampFreq(a, f0 * 1.5, t + 0.16); // 上滑音 "boing"
      g.gain.setValueAtTime(0.0001, t);
      rampGain(g, 0.3, t + 0.01);
      rampGain(g, 0.0001, t + 0.2);
      a.connect(g);
      g.connect(master);
      a.start(t);
      if (a.stop) a.stop(t + 0.24);
    }
    function scratch(t) {
      noiseAt(t, 0.12, 0.3, 'bandpass', 900, 2600);
      noiseAt(t + 0.08, 0.08, 0.2, 'bandpass', 2200, 800);
    }
    function boom(t) {
      if (!canPlay) return;
      const a = ctx.createOscillator();
      const g = ctx.createGain();
      a.type = 'sine';
      setFreq(a, 100, t);
      rampFreq(a, 30, t + 0.5);
      g.gain.setValueAtTime(0.0001, t);
      rampGain(g, 0.9, t + 0.01);
      rampGain(g, 0.0001, t + 0.6);
      a.connect(g);
      g.connect(master);
      a.start(t);
      if (a.stop) a.stop(t + 0.65);
      noiseAt(t, 0.4, 0.4, 'lowpass', 300);
    }

    // ---------- 步进调度 ----------
    const BASS_BASE = new Set(['A1', 'F1', 'C2', 'G1']);
    function scheduleStep(t, token, trackName) {
      if (token === 'R' || token === '0') return;
      if (trackName === 'kick') { kick(t); return; }
      if (trackName === 'snare') { snare(t); return; }
      if (trackName === 'hat') { hat(t); return; }
      if (trackName === 'riser') { if (token === 'X') riser(t, 0.35); return; }
      if (trackName === 'klaxon') { klaxon(t, freqOf(token)); return; }
      if (trackName === 'boing') { boing(t, freqOf(token)); return; }
      if (trackName === 'scratch') { if (token === 'X') scratch(t); return; }
      if (trackName === 'boom') { if (token === '1') boom(t); return; }
      if (trackName === 'bass') {
        bassNote(t, freqOf(token), !BASS_BASE.has(token));
        return;
      }
      if (trackName === 'riff') { riffNote(t, freqOf(token)); return; }
      if (trackName === 'arp') { arpNote(t, freqOf(token)); return; }
      if (trackName === 'stab') {
        if (D.chords[token]) stab(t, D.chords[token].map(freqOf));
        return;
      }
      if (trackName === 'lead') { leadNote(t, freqOf(token)); return; }
    }

    function scheduleLoopRange(fromTime, toTime) {
      if (!canPlay) return;
      const prep = prepare(songKey);
      const active = [...activeTracks()];
      const steps = song.bars * 16;
      while (sAbs < steps) {
        const t = loopStart + sAbs * song.stepDur;
        if (t >= toTime) break;
        if (t >= fromTime - 1e-6) {
          const bar = Math.floor(sAbs / 16);
          const st = sAbs % 16;
          for (const trackName of active) {
            const tr = prep.tracks[trackName];
            let rowIdx = tr.rowMap[bar];
            if (tr.phaseRows && tr.phaseRows[String(phase)] !== undefined) {
              rowIdx = tr.phaseRows[String(phase)];
            }
            scheduleStep(t, tr.rows[rowIdx].split(' ')[st], trackName);
          }
        }
        sAbs++;
      }
      if (sAbs >= steps) {
        sAbs = 0;
        loopStart += song.loopDur;
        scheduledThrough = loopStart;
      }
    }

    function scheduleIntro() {
      const prep = prepare(songKey);
      for (const trackName of song.introTrackList) {
        const tokens = prep.intro[trackName].split(' ');
        for (let s = 0; s < tokens.length; s++) {
          scheduleStep(startTime + s * song.stepDur, tokens[s], trackName);
        }
      }
      if (song.introRiserAtEnd) riser(startTime + song.introDur - 0.5, 0.5);
    }

    // ---------- 公开 API ----------
    function start(mode) {
      if (state === 'intro' || state === 'loop') return;
      if (!ctx || !canPlay) return;
      if (ctx.resume) { try { ctx.resume(); } catch (e) {} }
      songKey = SONGS[mode] ? mode : 'boss';
      song = SONGS[songKey];
      phase = 1;
      startTime = ctx.currentTime + 0.05;
      loopStart = startTime + song.introDur;
      sAbs = 0;
      scheduledThrough = loopStart;
      if (song.introBars > 0) {
        state = 'intro';
        scheduleIntro();
      } else {
        state = 'loop';
      }
    }

    function update() {
      if (!ctx || !canPlay || state === 'idle' || state === 'stopped') return;
      const now = ctx.currentTime;
      if (state === 'intro') {
        if (now < loopStart - 1e-4) return; // 引子已一次性调度完
        state = 'loop';
      }
      const from = Math.max(loopStart, scheduledThrough);
      scheduleLoopRange(from, now + ahead);
      scheduledThrough = Math.max(scheduledThrough, now + ahead);
    }

    function setPhase(n, at) {
      const next = Math.max(1, Math.min(3, n | 0));
      if (next > phase) {
        phase = next;
        if (song.levels['2'] || song.levels['3']) {
          const t = (at !== undefined && at !== null) ? at : (ctx ? ctx.currentTime + 0.02 : 0);
          riser(t, 0.6);
        }
      } else {
        phase = next;
      }
    }

    function victory(at) {
      const t0 = (at !== undefined && at !== null) ? at : (ctx ? ctx.currentTime + 0.02 : 0);
      state = 'stopped';
      if (!canPlay) return;
      for (const ev of D.victory) {
        const t = t0 + ev.s * song.stepDur;
        if (ev.t === 'boom') {
          boom(t);
        } else if (ev.t === 'chord') {
          const oct = ev.o || 0;
          for (const name of D.chords[ev.v]) {
            noteF(freqOf(name) * Math.pow(2, oct), t, (ev.d || 8) * song.stepDur, 'sawtooth', 0.2, 2600);
          }
        } else if (ev.t === 'note') {
          noteF(freqOf(ev.v), t, (ev.d || 3) * song.stepDur, 'triangle', 0.3, 5000);
        }
      }
    }

    function stop() {
      state = 'stopped';
    }

    function renderBlock(from, to) {
      scheduleLoopRange(from, to);
    }

    return {
      start, update, setPhase, victory, stop, renderBlock,
      loopStart: () => loopStart,
      getPhase: () => phase,
      getState: () => state,
      getSong: () => songKey
    };
  }

  global.createBossMusic = createBossMusic;
  global.BGM_DATA = BGM_DATA;
})(typeof window !== 'undefined' ? window : globalThis);
