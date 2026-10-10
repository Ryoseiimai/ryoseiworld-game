#!/usr/bin/env node
// No browser or packages: exercise the same physics/controller used by the page.
'use strict';
const assert = require('node:assert/strict');
const Proto = require('../v5/js/proto.js');
const sim = Proto._sim;
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok ' + name); }
  catch (e) { failed++; console.error('FAIL ' + name + '\n' + e.stack); }
}
const defaults = { v: 1, jump: 6, sprite: 0, title: 'ja', deployed: false };
for (const dt of [1 / 144, 1 / 60, 1 / 30, 1 / 10]) {
  test('3/6/9 の1周の結果、dt=' + dt, () => {
    assert.deepEqual(sim.runCycle({ jump: 3 }, dt), { cleared: false, hitBug: true, hitCeiling: false });
    assert.deepEqual(sim.runCycle({ jump: 6 }, dt), { cleared: true, hitBug: false, hitCeiling: false });
    assert.equal(sim.runCycle({ jump: 9 }, dt).hitCeiling, true);
  });
}
test('ジャンプの高さは表示速度によらない', () => {
  const heights = [1 / 144, 1 / 60, 1 / 10].map(dt => {
    const w = sim.createWorld(sim.normalize({ jump: 6 }));
    assert.equal(sim.jump(w), true);
    assert.equal(sim.jump(w), false, '空中で連続ジャンプしない');
    for (let i = 0; i < Math.ceil(1 / dt); i++) sim.step(w, dt);
    return w.maxHeight;
  });
  assert.ok(heights.every(h => Math.abs(h - 88.2) < 0.02), heights.join(','));
});
test('8秒で4つよける。押さないと当たる', () => {
  const w = sim.createWorld(sim.normalize());
  sim.step(w, 7.9, true); assert.equal(w.over, false);
  sim.step(w, 0.1, true); assert.equal(w.cleared, true); assert.equal(w.avoided, 4);
  const idle = sim.createWorld(sim.normalize());
  sim.step(idle, 8, false); assert.equal(idle.hitBug, true); assert.equal(idle.cleared, false);
});
test('低いジャンプは最適なタイミングでもバグの高さに届かない', () => {
  const w = sim.createWorld(sim.normalize({ jump: 3 })); sim.jump(w); sim.step(w, 0.5);
  assert.ok(w.maxHeight < 34);
});
test('天井で止まり、落ちて0.5秒で周の最初に戻る', () => {
  const s = sim.createSession({ state: { jump: 9 } }); sim.jump(s.world);
  while (!s.world.hitCeiling) s.advance(1 / 240);
  const old = s.world, y = old.y;
  s.advance(0.2); assert.equal(s.world, old); assert.ok(old.y > y);
  s.advance(0.3); assert.notEqual(s.world, old); assert.ok(s.world.t < 0.02);
});
test('バグに当たって0.5秒後に再開する', () => {
  const s = sim.createSession({});
  while (!s.world.hitBug) s.advance(1 / 240);
  const old = s.world;
  s.advance(0.45); assert.equal(s.world, old);
  s.advance(0.05); assert.notEqual(s.world, old); assert.equal(s.world.avoided, 0);
});
test('数字の変更とアンドゥは履歴を1つずつ戻す', () => {
  const learned = [], s = sim.createSession({ learn: id => learned.push(id) });
  assert.deepEqual(learned, ['prototype', 'hensuu']);
  s.setJump(3); s.setJump(9); s.setJump(9); s.setJump(100);
  s.undo(); assert.equal(s.state.jump, 3);
  s.undo(); assert.equal(s.state.jump, 6);
  s.undo(); assert.equal(s.state.jump, 6);
  assert.deepEqual(learned, ['prototype', 'hensuu', 'undo']);
  s.setJump(3); sim.jump(s.world); s.advance(0.2); assert.ok(s.world.maxHeight < 23);
});
test('未指定のstateを補い、入力を変更しない', () => {
  const input = Object.freeze({ jump: 3, sprite: 2, title: 'en' });
  const s = sim.createSession({ state: input }); s.setJump(9);
  assert.equal(input.jump, 3); assert.equal(s.state.v, 1); assert.equal(s.state.deployed, false);
  assert.deepEqual(sim.normalize({ jump: NaN, title: 'bad', sprite: -1, v: null }), defaults);
});
test('できた・もどるはどの数でも正しいstateを1度だけ返す', () => {
  for (const mode of ['lesson', 'play']) for (const jump of [3, 6, 9]) {
    const results = [], state = { v: 4, jump, sprite: 2, title: 'en', deployed: true };
    const s = sim.createSession({ mode, state, onDone: x => results.push(x) });
    s.finish(); s.finish(); s.advance(10);
    assert.deepEqual(results, [state]); assert.deepEqual(s.handle.state, state);
  }
});
test('closeは通知せず、終了後の編集も無効', () => {
  let calls = 0;
  const s = sim.createSession({ onDone: () => calls++ });
  s.handle.close(); s.finish(); s.setJump(9); s.undo(); s.advance(5);
  assert.equal(calls, 0); assert.deepEqual(s.state, defaults); assert.equal(s.elapsed, 0);
  const h = Proto.open({ state: { jump: 3 } }); assert.equal(h.state.jump, 3); h.close();
});
test('プレイテストは自動で跳び、2秒で1回終了。pause中は進まない', () => {
  let result = null, calls = 0;
  const s = sim.createSession({ mode: 'playtest', onDone: x => { result = x; calls++; } });
  s.paused = true; s.advance(3); assert.equal(s.elapsed, 0);
  s.paused = false; s.advance(1.99); assert.equal(calls, 0);
  assert.ok(s.world.jumps > 0); assert.equal(s.world.avoided, 1);
  s.advance(0.01); s.advance(5); assert.equal(calls, 1); assert.deepEqual(result, defaults);
});
test('6で成功するとほめる。1分は周を再開しても累積する', () => {
  const s = sim.createSession({});
  for (let i = 0; i < 480; i++) s.advance(1 / 60, true);
  assert.ok(s.praise > 2); assert.equal(s.world.t, 0);
  s.restart(); assert.ok(s.elapsed > 7.99);
  for (let i = 0; i < 3200; i++) s.advance(1 / 60, true);
  assert.ok(s.elapsed >= 60);
});
test('後続モードも同じ入口とstateを返す', () => {
  for (const mode of ['sprite', 'text', 'deploy']) {
    let result; const h = Proto.open({ mode, onDone: s => { result = s; } });
    assert.deepEqual(result, defaults); assert.deepEqual(h.state, defaults);
  }
});
for (const value of [3, 6, 9]) {
  test('lesson のじっこうは今の値 ' + value + ' で自動1周し、手動に戻る', () => {
    const s = sim.createSession({ mode: 'lesson', state: { jump: value } });
    s.run(); const run = s.world;
    assert.equal(s.running, true);
    for (let i = 0; i < 600 && s.running; i++) s.advance(1 / 60);
    assert.equal(s.running, false); assert.equal(run.over, true);
    assert.equal(run.hitBug, value === 3); assert.equal(run.hitCeiling, value === 9);
    assert.equal(run.cleared, value === 6); assert.equal(s.praise > 0, value === 6);
    assert.equal(s.closed, false); assert.notEqual(s.world, run);
    assert.equal(sim.jump(s.world), true, '自動終了後に手でジャンプできる');
    s.restart(); const manual = s.world;
    s.advance(1.5); assert.equal(manual.jumps, 0); assert.equal(manual.hitBug, true);
  });
}
test('自動じっこう中の数字変更とアンドゥは自動を止める', () => {
  const s = sim.createSession({}); s.run(); s.advance(0.5); s.setJump(3);
  assert.equal(s.running, false); assert.equal(s.world.t, 0);
  s.run(); s.undo(); assert.equal(s.running, false); assert.equal(s.state.jump, 6);
});

// Mount the actual UI with a small DOM/canvas recorder: no browser or library needed.
function page(cfg = {}, hidden = false) {
  const vm = require('node:vm'), fs = require('node:fs');
  let texts = [], arcs = [], raf = null, now = 0;
  const ctx = {
    setTransform() { texts = []; arcs = []; }, fillRect() {}, beginPath() {}, fill() {}, stroke() {},
    arc(x, y, radius) { arcs.push({ x, y, radius }); },
    fillText(text, x, y) { texts.push({ text, x, y, size: Number(this.font.match(/(\d+)px/)[1]) }); },
    measureText(text) { return { width: Array.from(text).length * 24 }; }
  };
  function element(tagName) {
    return {
      tagName: tagName.toUpperCase(), style: {}, children: [], listeners: {}, isConnected: true,
      appendChild(el) { this.children.push(el); el.parentNode = this; },
      setAttribute() {}, getContext() { return ctx; }, focus() {}, remove() {},
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); },
      emit(type, props = {}) {
        const e = { type, target: this, stopPropagation() {}, stopImmediatePropagation() {}, preventDefault() {}, ...props };
        for (const fn of this.listeners[type] || []) fn(e);
      }
    };
  }
  const document = Object.assign(element('document'), { hidden, body: element('body'), createElement: element });
  const window = Object.assign(element('window'), {
    innerWidth: 540, innerHeight: 960,
    requestAnimationFrame(fn) { raf = fn; return 1; }, cancelAnimationFrame() { raf = null; }
  });
  vm.runInNewContext(fs.readFileSync(require.resolve('../v5/js/proto.js'), 'utf8'), { window, document });
  window.RYW.Proto.open(cfg);
  const stage = document.body.children[0].children[0];
  return {
    window, document, stage, texts: () => texts, arcs: () => arcs,
    frame(dt = 1 / 60) { now += dt * 1000; const fn = raf; raf = null; if (fn) fn(now); },
    click(label) {
      const b = stage.children.find(el => el.textContent === label);
      assert.ok(b, label); stage.emit('pointerdown'); b.emit('click');
    }
  };
}
test('じっこうボタンから自動成功し、ほめる文字と天井ラベルが重ならない', () => {
  const p = page({ mode: 'lesson', aiName: 'ソラ' });
  p.click('▶ じっこう'); assert.ok(p.texts().some(t => t.text === 'じっこう ちゅう' && t.y >= 420));
  p.frame();
  for (let i = 0; i < 480; i++) p.frame();
  const praise = p.texts().find(t => t.text === 'ちょうど いい！');
  const ceiling = p.texts().find(t => t.text === 'てんじょう');
  assert.ok(praise); assert.ok(p.texts().some(t => t.text === 'ソラ:'));
  assert.ok(Math.abs(praise.y - ceiling.y) >= Math.max(praise.size, ceiling.size));
  assert.ok(p.texts().every(t => t.size >= 24));
  assert.ok(p.texts().some(t => t.text === 'おすと ジャンプ'));
  assert.equal(p.window.__proto.debugJump(), true);
});
test('プレイテストの手は自動ジャンプと同時に沈む', () => {
  const p = page({ mode: 'playtest' });
  const palmY = () => p.arcs().find(a => a.radius === 26).y;
  const resting = palmY(); p.frame();
  for (let i = 0; i < 90 && p.window.__proto.debugState().y === 358; i++) p.frame();
  assert.ok(p.window.__proto.debugState().y < 358);
  assert.ok(palmY() > resting);
  for (let i = 0; i < 16; i++) p.frame();
  assert.equal(palmY(), resting);
});
for (const input of ['pointerdown', 'keydown']) {
  test('初期hiddenがtrueでも最初の ' + input + ' で再開し、後の非表示では止まる', () => {
    const p = page({}, true); p.frame(); p.frame();
    assert.equal(p.window.__proto.debugState().cycleTime, 0);
    if (input === 'pointerdown') p.stage.emit(input);
    else p.window.emit(input, { code: 'Space', repeat: false });
    assert.ok(!p.texts().some(t => t.text === 'ひとやすみ'));
    if (input === 'pointerdown') assert.equal(p.window.__proto.debugJump(), true);
    p.frame(); p.frame(); assert.ok(p.window.__proto.debugState().y < 358);
    p.document.emit('visibilitychange'); const paused = p.window.__proto.debugState().cycleTime;
    p.frame(); p.frame(); assert.equal(p.window.__proto.debugState().cycleTime, paused);
    p.document.hidden = false; p.document.emit('visibilitychange'); p.frame(); p.frame();
    assert.ok(p.window.__proto.debugState().cycleTime > paused);
  });
}
test('入力で初期hiddenを見直してもplatformのpauseを解除しない', () => {
  let pause, resume;
  const p = page({ platform: { onPause(fn) { pause = fn; }, onResume(fn) { resume = fn; } } }, true);
  pause(); p.stage.emit('pointerdown'); p.window.emit('keydown', { code: 'Space' });
  assert.equal(p.window.__proto.debugJump(), false);
  p.frame(); p.frame(); assert.equal(p.window.__proto.debugState().cycleTime, 0);
  resume(); assert.equal(p.window.__proto.debugJump(), true);
});
function clickNth(p, label, n) {
  const matches = p.stage.children.filter(el => el.textContent === label);
  assert.ok(matches[n], label + '#' + n);
  p.stage.emit('pointerdown'); matches[n].emit('click');
}
test('スプライト: えを えらぶと バージョンが あがって おわる', () => {
  let result = null;
  const p = page({ mode: 'sprite', state: { v: 1 }, onDone: s => { result = s; } });
  p.frame();
  clickNth(p, 'これにする', 1);
  assert.ok(p.texts().some(t => t.text === 'この えに なった！'));
  assert.ok(p.texts().some(t => t.text === 'はじめて つくった ゲーム v2 に なった！'));
  assert.equal(result, null);
  p.click('できた');
  assert.equal(result.v, 2); assert.equal(result.sprite, 2);
});
test('ほんやく: タイトルを えいごに できて バージョンが あがる', () => {
  let result = null;
  const p = page({ mode: 'text', state: { v: 2 }, onDone: s => { result = s; } });
  p.frame();
  p.click('えいごに する');
  assert.ok(p.texts().some(t => t.text === 'My First Game'));
  p.click('できた');
  assert.equal(result.v, 3); assert.equal(result.title, 'en');
});
test('デプロイ: おくる→3つの かんそう→バージョンが あがる', () => {
  let result = null;
  const p = page({ mode: 'deploy', state: { v: 3 }, onDone: s => { result = s; } });
  p.frame();
  p.click('さくひんだな へ おくる');
  assert.ok(p.texts().some(t => t.text === 'おくって いる……'));
  p.frame(0); p.frame(1); // クリックの pointerdown が last をリセットするので1回挟む。0.9秒を超えると感想が始まる
  assert.ok(p.texts().some(t => t.text === 'まちの こども'));
  for (let i = 0; i < 2; i++) p.click('つぎへ');
  assert.ok(p.texts().some(t => t.text === 'ハッカーの おねえさん'));
  p.click('つぎへ');
  assert.ok(p.texts().some(t => t.text === 'はじめて つくった ゲーム v4 に なった！'));
  p.click('できた');
  assert.equal(result.v, 4); assert.equal(result.deployed, true);
});
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
