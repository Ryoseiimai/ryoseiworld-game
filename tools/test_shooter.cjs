#!/usr/bin/env node
// v5/js/shooter.js の画面なしの部分（ボスの仕掛けの数値・武器の効き・きずな0での撃破時間）を Node だけで確かめる。
// 使い方: node tools/test_shooter.cjs   （--verbose で時間の表を細かく出す）
'use strict';
const path = require('path');
const Shooter = require(path.join(__dirname, '..', 'v5', 'js', 'shooter.js'));
const sim = Shooter._sim;
const DT = 1 / 60;
const verbose = process.argv.includes('--verbose');
let failed = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; if (verbose) console.log('ok   ' + name); }
  else { failed++; console.log('FAIL ' + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
}
const IDLE = { ax: 0, ay: 0, dx: 0, dy: 0, skill: false, press: false, release: false };
function toPlay(w) { let n = 0; while (w.state === 'intro' && n++ < 1000) sim.step(w, DT, IDLE); return w; }
// Runs until the game clock moved by sec (hit-stop frames do not move the clock).
function run(w, sec, inp) { const end = w.t + sec - 1e-9; let guard = 0; while (w.t < end && guard++ < 1e6) sim.step(w, DT, typeof inp === 'function' ? inp(w) : (inp || IDLE)); }
function world(cfg) { return toPlay(sim.createWorld(Object.assign({ seed: 7 }, cfg))); }
function clearBullets(w) { w.eb = []; w.bugs = []; }

// ---- 1. 5体のボスと背景 ----
const B = sim.BOSSES;
check('5体のボスがいる', ['bugking', 'kateino', 'hikaku', 'jibun', 'zero'].every(id => B[id]));
check('背景が仕様どおり', B.bugking.bg === 'bg_town' && B.kateino.bg === 'bg_minamo' && B.hikaku.bg === 'bg_neon' && B.jibun.bg === 'bg_tower' && B.zero.bg === 'bg_tower');
check('HPの節目の一行が4つずつある', ['bugking', 'kateino', 'hikaku'].every(id => [75, 50, 25, 0].every(t => B[id].lines.bursts[t])));
check('カテイノジジョウの親の本音（rpg.html と同じ）', B.kateino.lines.bursts[60] === undefined && B.kateino.lines.bursts[0] === '…すごいじゃない');

(() => {
  const w = sim.createWorld({ boss: 'kateino', lines: { intro: 'テスト', bursts: { 50: 'まんなか' } } });
  check('lines で台詞を上書きできる（残りは元のまま）', w.lines.intro[1] === 'テスト' && w.lines.intro[0] === 'カテイノジジョウ' && w.lines.bursts[50] === 'まんなか' && w.lines.bursts[75] === B.kateino.lines.bursts[75]);
  const z = sim.createWorld({ boss: 'zero', lines: { voices: [{ name: 'A', text: 'a', spirit: 'nao' }, { name: 'B', text: 'b', spirit: 'spirit:3' }] } });
  check('ゼロの こえ を差し替えられる', z.m.voices.length === 2 && z.m.voices[1].spirit === 'spirit:3');
  check('知らないボスは BUG KING', sim.createWorld({ boss: 'nanika' }).bossId === 'bugking');
})();

// ---- 2. 武器8種 ----
check('武器は8種', sim.WEAPONS.length === 8);
const all = sim.normalizeWeapons('all');
check('weapons=all で8種すべて', sim.WEAPONS.every(wp => all[wp.id]));
check('別名が通る（pierce/heart/tame）', (() => { const n = sim.normalizeWeapons(['pierce', 'heart', 'tame']); return n.rainbow && n.letter && n.charge && n.fuku; })());
check('知らない武器名は無視', Object.keys(sim.normalizeWeapons(['nanika'])).join() === 'fuku');

function shotsIn(cfg, sec) {
  const w = world(Object.assign({ boss: 'jibun' }, cfg)); // jibun: shots pass through, nothing is consumed
  w.stats.shots = 0; run(w, sec); return w;
}
const base = shotsIn({}, 2), rapid = shotsIn({ weapons: ['rapid'] }, 2), twin = shotsIn({ weapons: ['twin'] }, 2);
check('フクの ひかりだま: 2秒で10発前後', base.stats.shots >= 9 && base.stats.shots <= 11, base.stats.shots);
check('れんしゃ: 間隔が短くなる（1.35倍以上）', rapid.stats.shots >= base.stats.shots * 1.35, [rapid.stats.shots, base.stats.shots]);
check('2ほうこう: 3方向（3倍）', twin.stats.shots === base.stats.shots * 3, [twin.stats.shots, base.stats.shots]);
check('2ほうこう: 上下ななめの弾がある', twin.shots.some(s => s.vy < -100) && twin.shots.some(s => s.vy > 100));
(() => {
  const w = world({ boss: 'bugking', weapons: ['letter'] }); clearBullets(w);
  let homing = 0, turned = false;
  run(w, 2, w => { const h = w.shots.filter(s => s.kind === 'heart' && s.homing); homing = Math.max(homing, h.length); if (h.some(s => s.age > 0.2 && Math.abs(s.vy) < 200)) turned = true; return IDLE; });
  check('ハートの てがみ: 追いかけるハートが出る', homing >= 1 && turned, { homing, turned });
})();
(() => {
  const w = world({ boss: 'bugking', weapons: ['charge'] }); clearBullets(w);
  sim.step(w, DT, { ...IDLE, skill: true, press: true });
  run(w, 1.0, { ...IDLE, skill: true });
  sim.step(w, DT, { ...IDLE, release: true });
  const tiger = w.shots.find(s => s.kind === 'tiger');
  check('フクの ためうち: 0.9秒ためると大きな虎の弾', !!tiger && tiger.dmg >= 20 && tiger.r >= 40, tiger);
  const w2 = world({ boss: 'bugking', weapons: ['charge'] }); clearBullets(w2);
  sim.step(w2, DT, { ...IDLE, skill: true, press: true });
  run(w2, 0.3, { ...IDLE, skill: true });
  sim.step(w2, DT, { ...IDLE, release: true });
  check('ためが足りないと虎は出ない', !w2.shots.some(s => s.kind === 'tiger'));
  // tiger hits BUG KING once for 30
  const w3 = world({ boss: 'bugking', weapons: ['charge'] }); clearBullets(w3);
  const only = o => w => { w.p.fireCd = 99; w.m.blockT = 99; return o; }; // only the tiger
  const hp0 = w3.b.hp;
  sim.step(w3, DT, only({ ...IDLE, skill: true, press: true })(w3));
  run(w3, 1.0, only({ ...IDLE, skill: true }));
  w3.p.y = w3.b.y;
  sim.step(w3, DT, only({ ...IDLE, release: true })(w3));
  run(w3, 1.2, only(IDLE));
  check('虎の弾は1回だけ大ダメージ', hp0 - w3.b.hp >= 23 && hp0 - w3.b.hp <= 25, hp0 - w3.b.hp);
  sim.step(w3, DT, { ...IDLE, skill: true, press: true }); run(w3, 1.0, only({ ...IDLE, skill: true }));
  check('撃ったあと4秒は ためられない（フクが やすむ）', w3.p.charge < 0.5, w3.p.charge);
  sim.step(w3, DT, only({ ...IDLE, release: true })(w3));
})();
(() => {
  // にじいろ: shots go through a block, normal shots stop there
  function blockTest(weapons) {
    const w = world({ boss: 'jibun', weapons }); clearBullets(w);
    w.p.x = 100; w.p.y = 400; w.m.ballT = 99; w.m.makeAt = 999;
    sim.addBullet(w, { kind: 'block', x: 260, y: 394, vx: 0, vy: 0, hw: 17, hh: 17, hp: 99 });
    w.p.fireCd = 0; w.shots = [];
    run(w, 0.5, w => { w.m.ballT = 99; w.b.y = 700; return IDLE; });
    return w.shots.filter(s => s.x > 300).length;
  }
  check('ふつうの弾は砂嵐のブロックで止まる', blockTest([]) === 0);
  check('にじいろ: 敵の弾をつらぬく', blockTest(['rainbow']) > 0);
})();
(() => {
  const w = world({ boss: 'bugking', weapons: ['barrier'] });
  const h0 = w.p.hearts;
  sim.hurt(w);
  check('おまもりバリア: 1回目はハートが減らない', w.p.hearts === h0 && !w.p.barrier.up);
  w.p.inv = 0; sim.hurt(w);
  check('バリアが無いと減る', w.p.hearts === h0 - 1);
  clearBullets(w); run(w, sim.BARRIER_BACK + 0.2, w => { clearBullets(w); w.p.inv = 5; return IDLE; });
  check('バリアは15秒で戻る', w.p.barrier.up);
})();
check('てづくり おにぎり: ハート+1', world({ weapons: ['onigiri'] }).p.maxHearts === 4 && world({ hearts: 5, weapons: ['onigiri'] }).p.maxHearts === 6);
check('ハートは最初3', world({}).p.hearts === 3);
(() => {
  const w = world({ boss: 'bugking' });
  sim.hurt(w); sim.hurt(w);
  check('当たると1秒無敵（続けて当たっても1つだけ減る）', w.p.hearts === 2);
  run(w, 1.05, w => { clearBullets(w); return IDLE; });
  sim.hurt(w);
  check('1秒たつとまた当たる', w.p.hearts === 1);
  w.p.inv = 0; sim.hurt(w);
  check('ハート0で負け', w.state === 'lose');
})();
(() => {
  const w = world({ boss: 'bugking', options: 3 });
  check('options=3 で3体', w.options.length === 3);
  check('おともは最大3体', sim.normalizeOptions(['nao', 'code', 'search', 'paint']).length === 3);
  check('spirit:5 の形が使える', sim.normalizeOptions(['spirit:5'])[0].frame.join() === '1,1');
  clearBullets(w); w.stats.shots = 0;
  run(w, 2, w => { clearBullets(w); return IDLE; });
  check('おともが撃つ', w.stats.shots >= 20, w.stats.shots);
})();

// ---- 3. ボスごとの仕掛け ----
(() => {
  const w = world({ boss: 'bugking' });
  w.b.hp = w.b.maxHp * 0.49;
  run(w, 10, w => { w.p.inv = 5; return IDLE; });
  check('BUG KING: HP半分から広がる弾', w.stats.enemyBullets > 0 && w.eb.some(e => e.kind === 'orb') || w.b.phase2, w.eb.map(e => e.kind));
  const w2 = world({ boss: 'bugking' }); w2.b.hp = w2.b.maxHp * 0.49;
  let sawBug = false;
  run(w2, 12, w => { w.p.inv = 5; if (w.bugs.length) sawBug = true; return IDLE; });
  check('BUG KING: HP半分から小さいバグ', sawBug);
  const w3 = world({ boss: 'bugking' });
  run(w3, 10, w => { w.p.inv = 5; return IDLE; });
  check('BUG KING: 砂嵐のブロックをねらって撃つ', w3.stats.enemyBullets >= 3 && !w3.b.phase2);
})();
(() => {
  const w = world({ boss: 'kateino' });
  check('カテイノジジョウ: ふだんはダメージ半分', sim.dmgMult(w) === 0.5);
  check('とくぎは みせる', sim.skillMode(w) === 'show');
  sim.step(w, DT, { ...IDLE, skill: true, press: true });
  sim.step(w, DT, { ...IDLE, release: true });
  check('みせる で ダメージ2倍', sim.dmgMult(w) === 2);
  run(w, 9.5, w => { w.p.inv = 5; return IDLE; });
  check('9.5秒後も2倍', sim.dmgMult(w) === 2);
  run(w, 0.7, w => { w.p.inv = 5; return IDLE; });
  check('10秒で元にもどる', sim.dmgMult(w) === 0.5);
  check('すぐには もう一度 みせられない', sim.skillMode(w) === 'wait');
  run(w, sim.SHOW_COOLDOWN + 0.2, w => { w.p.inv = 5; return IDLE; });
  check('しばらくすると また みせられる', sim.skillMode(w) === 'show');
  const w2 = world({ boss: 'kateino' });
  let maxWall = 0, minGap = 1e9, bubbles = 0;
  let pushed = true;
  run(w2, 16, w => { w.p.inv = 5; maxWall = Math.max(maxWall, w.m.wall); const g = sim.gap(w); minGap = Math.min(minGap, g.bottom - g.top); bubbles = Math.max(bubbles, w.eb.filter(e => e.kind === 'bubble').length); if (w.p.y < g.top + 47) pushed = false; return { ...IDLE, ay: -1 }; });
  check('上と下から壁がせまる', maxWall >= 120 && minGap <= 470, { maxWall, minGap });
  check('壁がせまると主人公が押される（壁の中に入らない）', pushed);
  check('吹き出しの弾が来る', bubbles >= 1);
  const w3 = world({ boss: 'kateino' });
  w3.b.hp = w3.b.maxHp * 0.74; w3.p.y = w3.b.y;
  run(w3, 1, w => { w.p.inv = 5; return IDLE; });
  check('HPの節目で親の本音の一行', w3.b.shown[75] && (w3.burst || w3.burstQ[0] || {}).text === B.kateino.lines.bursts[75] || w3.burstQ.some(b => b.text === B.kateino.lines.bursts[75]) || (w3.burst && w3.burst.text === B.kateino.lines.bursts[75]));
  // R35: 吹き出しは画面の左端で切れずに はじける。上の かべ の名前は、台詞やお知らせと重ならない。
  const w4 = world({ boss: 'kateino' }); clearBullets(w4);
  sim.addBullet(w4, { kind: 'bubble', x: 140, y: 400, y0: 400, vx: -140, vy: 0, hw: 101, hh: 26, hp: 3, text: 'テストの ことば', amp: 0, freq: 2, ph: 0 });
  let minLeft = 1e9;
  run(w4, 1, w => { w.p.inv = 5; w.p.y = sim.PLAY_B - 70; w.eb.forEach(e => { if (e.kind === 'bubble') minLeft = Math.min(minLeft, e.x - e.hw); }); return IDLE; });
  check('吹き出しは左端で はじけて消える（文字が切れない）', !w4.eb.some(e => e.text === 'テストの ことば') && minLeft >= 0, minLeft);
  const w5 = world({ boss: 'kateino' });
  let cut = 0, labelOver = 0, labelSeen = 0;
  run(w5, 40, w => {
    w.p.inv = 5;
    w.eb.forEach(e => { if (e.kind === 'bubble' && e.x - e.hw < 0) cut++; });
    const L = sim.wallLabels(w);
    if (L.top) labelSeen++;
    if (L.top && (w.burst || w.toast)) labelOver++;
    return IDLE;
  });
  check('40秒の間、左端で切れた吹き出しが無い', cut === 0, cut);
  check('上の かべ の名前は、台詞やお知らせが出ている間は出ない', labelOver === 0 && labelSeen > 0, { labelOver, labelSeen });
  const w6 = world({ boss: 'kateino' }); w6.m.wall = 125; w6.stateT = 10; w6.burst = null; w6.burstQ = []; w6.toast = null;
  const l1 = sim.wallLabels(w6); w6.toast = { text: 'テスト', t: w6.t, dur: 2 };
  const l2 = sim.wallLabels(w6);
  check('お知らせが出ると上の かべ の名前が消え、下は残る', l1.top && l1.bottom && !l2.top && l2.bottom, { l1, l2 });
  w6.stateT = 1;
  check('うごき方の説明が出ている間は下の かべ の名前が出ない', !sim.wallLabels(w6).bottom);
})();
(() => {
  const w = world({ boss: 'hikaku' });
  check('ヒカクマオウ: はじめは1倍', sim.dmgMult(w) === 1);
  for (let i = 0; i < 5; i++) { w.p.inv = 0; sim.addBullet(w, { kind: 'number', x: w.p.x, y: w.p.y, vx: 0, vy: 0, hw: 30, hh: 20, hp: 3, text: '1い' }); sim.step(w, DT, IDLE); }
  check('数字のブロックで弾が弱くなる（3段まで）', w.m.down === 3, w.m.down);
  check('3段で0.4倍', Math.abs(sim.dmgMult(w) - 0.4) < 1e-9);
  check('数字ではハートは減らない', w.p.hearts === 3);
  sim.spawnPickup(w, 'pace'); const pk = w.pickups[w.pickups.length - 1]; pk.x = w.p.x; pk.y0 = w.p.y;
  sim.step(w, DT, IDLE);
  check('「じぶんの ペース」で1段もどる', w.m.down === 2);
  check('フクロウなしでは冠も1倍', sim.dmgMult(w, true) === sim.dmgMult(w, false));
  const wo = world({ boss: 'hikaku', options: ['search'] });
  check('サーチフクロウがいると冠は2倍', wo.hasOwl && sim.dmgMult(wo, true) === 2 && sim.dmgMult(wo, false) === 1);
  const wp = world({ boss: 'hikaku' }); let paced = false;
  run(wp, 14, w => { w.p.inv = 5; if (w.pickups.some(p => p.kind === 'pace')) paced = true; return IDLE; });
  check('「じぶんの ペース」の光が出る', paced);
})();
(() => {
  const w = world({ boss: 'jibun', options: 2 }); w.m.ballT = 99; w.m.makeAt = 999;
  w.p.y = w.b.y; w.p.fireCd = 0;
  run(w, 1.5, w => { w.m.ballT = 99; return IDLE; });
  check('ジブン: 弾はすり抜ける', w.shots.some(s => s.ghost) && w.stats.hits === 0);
  for (let i = 0; i < 3; i++) sim.debugCollect(w);
  check('「つくる」を3つで勝ち', w.state === 'win' && w.m.made === 3);
  const w2 = world({ boss: 'jibun', options: 3 }); let blocked = 0;
  run(w2, 20, w => { w.p.inv = 5; blocked = w.events.filter(e => e === 'block').length; return IDLE; });
  check('守護霊が敵の弾を少し受け止める', w2.events.includes('block'));
  const w3 = world({ boss: 'jibun' }); let made = false;
  run(w3, 32, w => { w.p.inv = 5; if (w.pickups.some(p => p.kind === 'make')) made = true; return IDLE; });
  check('「つくる」の光が出る', made);
})();
(() => {
  const w = world({ boss: 'zero' });
  w.p.y = w.b.y; run(w, 2, w => { w.p.inv = 5; return IDLE; });
  check('ゼロ: 弾が効かない', w.b.hp === 0 && w.stats.hits === 0 && w.m.toldImmune);
  const n = w.m.voices.length;
  check('こえは6人', n === 6);
  for (let i = 0; i < n; i++) sim.debugCollect(w);
  check('全員つながると とくぎが みんなの こえ', w.m.ready && sim.skillMode(w) === 'voices' && w.m.connected.length === n);
  check('一言が流れる', w.tickers.length >= 1);
  sim.step(w, DT, { ...IDLE, skill: true, press: true });
  check('みんなの こえ で勝ち（ノイズが晴れる）', w.state === 'win');
  run(w, sim.winHold(w));
  check('最後まで進む', w.stateT >= 6);
})();

// ---- 3b. はじめて遊ぶ子どもが動き方を覚える間に負けない ----
(() => {
  const BOSSES5 = ['bugking', 'kateino', 'hikaku', 'jibun', 'zero'];
  BOSSES5.forEach(id => {
    const w = world({ boss: id });
    let firstHurt = null;
    run(w, 15, w => { if (firstHurt === null && w.stats.hurts > 0) firstHurt = w.playT; return IDLE; });
    check(`${id}: 何もしなくても 案内が出ている間（4.5秒）とその1秒あとまで当たらない`, firstHurt === null || firstHurt > 5.5, firstHurt);
    check(`${id}: 何もしなくても 15秒は負けない`, w.state === 'play', { state: w.state, hearts: w.p.hearts });
  });
  // after a hit, bullets close to the hero vanish and the next aimed shot waits
  const w = world({ boss: 'bugking' }); clearBullets(w);
  sim.addBullet(w, { kind: 'orb', x: w.p.x + 120, y: w.p.y, vx: 0, vy: 0, r: 9 });
  sim.addBullet(w, { kind: 'orb', x: w.p.x + 300, y: w.p.y, vx: 0, vy: 0, r: 9 });
  w.m.blockT = 0.1;
  sim.hurt(w); sim.step(w, DT, IDLE);
  const left = w.eb.filter(e => !e.dead);
  check('当たったあと 近くの弾は消え、遠くの弾は残る', left.length === 1 && left[0].x > w.p.x + 250, left.map(e => Math.round(e.x - w.p.x)));
  check('当たったあと 次のねらい撃ちは 点滅が終わるころまで来ない', w.m.blockT >= 1.2, w.m.blockT);
})();
(() => {
  // ためうち: a hit breaks the charge, holding the button starts it again after the short flinch
  const w = world({ boss: 'bugking', weapons: ['charge'] }); clearBullets(w);
  sim.step(w, DT, { ...IDLE, skill: true, press: true });
  run(w, 0.3, w => { clearBullets(w); return { ...IDLE, skill: true }; });
  sim.hurt(w);
  check('ためうち中に当たると ためが切れる', !w.p.charging && w.p.charge === 0);
  run(w, 0.7, w => { clearBullets(w); return { ...IDLE, skill: true }; });
  check('押したままなら またためはじめる', w.p.charging && w.p.charge > 0.1, { charging: w.p.charging, charge: w.p.charge });
})();
(() => {
  // guardians stay on screen even when the hero is at the left edge
  const w = world({ boss: 'jibun', options: 3 });
  let worst = 999;
  run(w, 3, w => { w.p.inv = 5; clearBullets(w); return { ...IDLE, ax: -1, ay: w.playT % 2 < 1 ? -1 : 1 }; });
  run(w, 2, w => { w.p.inv = 5; clearBullets(w); w.options.forEach(o => { worst = Math.min(worst, o.x); }); return { ...IDLE, ax: -1 }; });
  check('おともは 左はしでも 画面の中にいる', worst >= 30 - 1e-6 && w.p.x <= 45, { worst, px: w.p.x });
  const pos = w.options.map(o => [Math.round(o.x), Math.round(o.y)]);
  const apart = pos.every((a, i) => pos.every((b, j) => i === j || Math.hypot(a[0] - b[0], a[1] - b[1]) > 50));
  check('左はしでも おとも同士が重ならない', apart, pos);
})();
(() => {
  // lines that answer what the player just did come at once
  const w = world({ boss: 'kateino' });
  run(w, 0.3, w => { w.p.inv = 5; return IDLE; });
  check('はじめに ソラの ヒントが出ている', w.burst && w.burst.speaker === 'ソラ');
  sim.step(w, DT, { ...IDLE, skill: true, press: true }); sim.step(w, DT, { ...IDLE, release: true });
  run(w, 0.3, w => { w.p.inv = 5; return IDLE; });
  check('みせると すぐ「みせた！」が出る', w.burst && w.burst.text === B.kateino.lines.show[1], w.burst && w.burst.text);
  const w2 = world({ boss: 'kateino' });
  run(w2, 17, w => { w.p.inv = 5; return IDLE; });
  check('みせないでいると ソラが もう一度 教える', w2.burst && w2.burst.text === B.kateino.lines.hint2[1] || w2.burstQ.some(b => b.text === B.kateino.lines.hint2[1]), w2.burst && w2.burst.text);
  const j = world({ boss: 'jibun' });
  for (let i = 0; i < 3; i++) sim.debugCollect(j);
  run(j, 1, IDLE);
  const shown = [j.burst].concat(j.burstQ).filter(Boolean).map(b => b.text);
  check('ジブン: 勝ちの一行は 上の台詞には出さない（大きな字で1回だけ）', j.state === 'win' && !shown.includes(B.jibun.lines.win), shown);
})();

// ---- 4. 弾の量はハートが少ない時に少なめ ----
(() => {
  function count(h) { const w = world({ boss: 'bugking', god: true, seed: 3 }); w.b.hp = w.b.maxHp * 0.45; w.p.hearts = h; run(w, 60, w => { w.p.inv = 5; w.b.hp = Math.max(1, w.b.hp); return IDLE; }); return w.stats.enemyBullets; }
  const c3 = count(3), c1 = count(1);
  check('ハート1の弾は3のときの75%以下', c1 <= c3 * 0.75, { c3, c1 });
})();

// ---- 5. きずな0での撃破時間（ボットが遊ぶ） ----
// A careful player: every 0.1 s it scores 9 moves against where the bullets will be, then heads for the boss
// (or the light to pick up). It reacts no faster than a person tapping, so the hit count is a rough difficulty number.
function bot(memo, kid) {
  const SP = 340, R = 11, THINK = kid ? 0.22 : 0.1, LOOK = kid ? 7 : 12, JITTER = kid ? 150 : 60;
  function near(e, tt) {
    const ex = e.x + e.vx * tt;
    const ey = e.kind === 'bubble' ? e.y0 + Math.sin((e.age + tt) * e.freq + e.ph) * e.amp : e.y + e.vy * tt;
    return [ex, ey];
  }
  function gapTo(e, ex, ey, px, py) {
    if (e.r) return Math.hypot(ex - px, ey - py) - e.r;
    const nx = Math.max(ex - e.hw, Math.min(px, ex + e.hw)), ny = Math.max(ey - e.hh, Math.min(py, ey + e.hh));
    return Math.hypot(nx - px, ny - py);
  }
  return function (w) {
    const p = w.p, d = w.def, g = sim.gap(w);
    memo.aimT = (memo.aimT || 0) - DT;
    if (memo.aimT <= 0) { memo.aimT = 0.35; memo.aimY = w.b.y + d.bodyDY + (d.crown && w.hasOwl ? d.crown[1] - d.bodyDY : 0) + (memo.rng() - 0.5) * JITTER; }
    let gx = 170, gy = memo.aimY;
    const pk = w.pickups[0];
    if (pk && pk.x < 600) { gx = Math.min(300, Math.max(60, pk.x - 10)); gy = pk.y; }
    memo.thinkT = (memo.thinkT || 0) - DT;
    if (memo.thinkT <= 0) {
      memo.thinkT = THINK;
      let best = null, bestScore = Infinity;
      for (const ax of [-1, 0, 1]) for (const ay of [-1, 0, 1]) {
        let danger = 0;
        for (let k = 1; k <= LOOK; k++) {
          const tt = k * 0.05;
          const px = Math.max(44, Math.min(330, p.x + ax * SP * tt)), py = Math.max(g.top + 48, Math.min(g.bottom - 48, p.y + ay * SP * tt)) - 4;
          for (const e of w.eb) { const [ex, ey] = near(e, tt); const gp = gapTo(e, ex, ey, px, py) - R; if (gp < 10) danger += (10 - gp) / k; }
          for (const b of w.bugs) { const gp = Math.hypot(b.x - 118 * tt - px, b.y - py) - b.r - R; if (gp < 10) danger += (10 - gp) / k; }
        }
        const fx = Math.max(44, Math.min(330, p.x + ax * SP * 0.15)), fy = p.y + ay * SP * 0.15;
        const score = danger * 50 + Math.hypot(fx - gx, (fy - gy) * 1.5) * 0.05;
        if (score < bestScore) { bestScore = score; best = [ax, ay]; }
      }
      memo.move = best;
    }
    const mode = sim.skillMode(w);
    let press = false, release = false, skill = false;
    if (mode === 'show' || mode === 'voices') { press = true; release = true; }
    else if (w.weapons.charge) {
      memo.chargeT = (memo.chargeT || 0) + DT;
      if (memo.chargeT > 4) { skill = true; press = !memo.holding; memo.holding = true; if (memo.chargeT > 5.1) { skill = false; release = true; memo.holding = false; memo.chargeT = 0; } }
    }
    return { ax: memo.move[0], ay: memo.move[1], dx: 0, dy: 0, skill, press, release };
  };
}
function fight(boss, cfg, kid) {
  const w = sim.createWorld(Object.assign({ boss, seed: 11, god: true }, cfg || {}));
  const memo = { rng: (() => { let a = 99; return () => (a = (a * 16807) % 2147483647) / 2147483647; })() };
  const input = bot(memo, kid);
  let real = 0;
  let downSum = 0;
  while (w.state !== 'win' && real < 400) { sim.step(w, DT, w.state === 'play' ? input(w) : IDLE); real += DT; if (w.bossId === 'hikaku') downSum += w.m.down * DT; }
  return { boss, win: w.state === 'win', play: Math.round(w.playT), real: Math.round(real), hurts: w.stats.hurts, hitRate: w.stats.shots ? Math.round(w.stats.hits / w.stats.shots * 100) : 0, down: w.bossId === 'hikaku' ? Math.round(downSum / Math.max(1, real) * 100) / 100 : undefined };
}
const rows = ['bugking', 'kateino', 'hikaku', 'jibun', 'zero'].map(id => fight(id));
const fullRows = ['bugking', 'kateino', 'hikaku', 'jibun', 'zero'].map(id => fight(id, { weapons: 'all', options: 3 }));
// A less careful player (thinks every 0.22 s, looks less far ahead, aims loosely). Hearts never run out here,
// so the hit count shows how many hearts such a player would need.
const kidRows = ['bugking', 'kateino', 'hikaku', 'jibun', 'zero'].map(id => fight(id, {}, true));
console.log('ゆっくりめの人のボット（きずな0）: ' + kidRows.map(r => `${r.boss} ${r.real}秒(当たり${r.hurts}回)`).join(' / '));
kidRows.forEach(r => check(`ゆっくりめでも ${r.boss} は4分以内に終わる`, r.win && r.real <= 240, r));
console.log('きずな0（武器なし・おとも0）のボット: ' + rows.map(r => `${r.boss} ${r.real}秒(当たり${r.hurts}回)`).join(' / '));

console.log('武器ぜんぶ＋おとも3のボット: ' + fullRows.map(r => `${r.boss} ${r.real}秒(当たり${r.hurts}回)`).join(' / '));
rows.forEach(r => check(`きずな0で ${r.boss} に勝てる（2〜3分）`, r.win && r.real >= 120 && r.real <= 190, r));
fullRows.forEach((r, i) => check(`きずなを上げると ${r.boss} が楽になる`, r.win && (r.real <= rows[i].real || ['jibun', 'zero'].includes(r.boss)) && r.hurts <= rows[i].hurts + 3, [r, rows[i]]));
// The scripted bosses do not get faster with weapons, but the guardians take bullets for you (ジブン).
check('ジブン: おともがいると当たる回数が減る', fullRows[3].hurts <= rows[3].hurts, [fullRows[3].hurts, rows[3].hurts]);

if (verbose) console.log(JSON.stringify({ rows, fullRows, kidRows }));
console.log(`test_shooter: ${passed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
