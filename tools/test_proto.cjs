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
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
