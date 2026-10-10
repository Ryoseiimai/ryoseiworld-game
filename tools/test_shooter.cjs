#!/usr/bin/env node
// v5/js/shooter.js の画面なしの部分（ボスの仕掛けの数値・武器の効き・きずな0での撃破時間）を Node だけで確かめる。
// 使い方: node tools/test_shooter.cjs   （--verbose で時間の表を細かく出す）
'use strict';
const path = require('path');
const shooterPath = path.join(__dirname, '..', 'v5', 'js', 'shooter.js');
const legacyShooter = require(shooterPath);
require(path.join(__dirname, '..', 'v5', 'data', 'words.js'));
delete require.cache[require.resolve(shooterPath)];
const Shooter = require(shooterPath);
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

// R42 keeps every combat number; only names and brief visual explanations change.
check('words.jsなしでも旧名で動く', legacyShooter._sim.WEAPONS[0].name === 'フクの ひかりだま' && legacyShooter._sim.createWorld({}).p.hearts === 3);
check('新しい武器名8種', sim.WEAPONS.map(w => w.name).join('|') === ['フク・ショット','クールダウン チップ','ベクトル チップ','あたりはんてい チップ','if バリア','ライフ+1 おにぎり','ホーミング レター','フクの チャージショット'].join('|'));
check('クールダウンの実値を表示', Shooter.cooldownText() === sim.FIRE_INTERVAL.toFixed(2) + '→' + sim.RAPID_INTERVAL.toFixed(2) + ' びょう' && sim.WEAPONS[1].desc.includes(Shooter.cooldownText()));
(() => {
  const w = world({boss:'jibun',weapons:['twin','barrier']});
  w.p.fireCd = 0; sim.step(w, DT, IDLE); const first = w.vectorHint;
  check('初めて撃つとベクトルの矢印を0.5秒', !!first && Math.abs(first.until - w.t - .5) < 1e-9);
  const until = first.until; run(w,1); check('連射しても矢印の時間は延長しない', w.vectorHint.until === until && w.t > until);
  sim.hurt(w); check('if バリアの説明は0.6秒', Math.abs(w.ifUntil - w.t - .6) < 1e-9 && w.p.hearts === 3);
})();

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

// ---- R48/R49: a single clock, judgement, cheats and challenge ----
(() => {
  const w = world({boss:'bugking'}), t = sim.beatInfo(w);
  // No AudioContext exists in this test process: the fallback clock is live.
  w.shots = []; w.p.fireCd = 99; clearBullets(w);
  for (let i=0;i<24;i++) sim.step(w, DT, IDLE);
  check('音なしでもBPM150の1拍は0.4秒', Math.abs(w.beat.phase-t.phase-1)<1e-8 && Math.abs(w.beat.time-t.time-.4)<1e-8);
  const frozen = sim.beatInfo(w); w.paused=true;
  for (let i=0;i<60;i++) sim.step(w,DT,IDLE);
  check('一時停止で曲と判定の時計が止まる', JSON.stringify(frozen)===JSON.stringify(sim.beatInfo(w)));
  w.paused=false; w.hitstop=.1; sim.step(w,.05,IDLE);
  check('ヒットストップでも曲の拍はずれない', Math.abs(w.beat.phase-frozen.phase-.125)<1e-8);
  [0.74,0.49,0.24].forEach((hp,i)=>{
    w.b.hp=w.b.maxHp*hp; sim.step(w,DT,IDLE);
    check('HP節目でBPM+8: '+hp,w.beat.bpm===150+8*(i+1));
  });
  check('BPM表示は1秒',Math.abs(w.beat.tempoUntil-w.beat.time-1)<.02);
  const before=w.beat.phase; for(let i=0;i<60;i++)sim.step(w,DT,IDLE);
  check('加速後の時計はBPM174',Math.abs(w.beat.phase-before-174/60)<1e-8);
  check('同じ節目では二度加速しない',w.beat.bpm===174);
})();
for (const boss of Object.keys(B)) {
  const w=world({boss,god:true}); let seen=0, off=0;
  w.p.fireCd=999; w.p.inv=999;
  for(let i=0;i<1800;i++) {
    sim.step(w,DT,IDLE);
    for(const e of w.eb) if(!e.checked) { e.checked=true; seen++; if(Math.abs(e.bornBeat-Math.round(e.bornBeat))>w.beat.bpm/60*DT+.00001)off++; }
  }
  check(boss+': 攻撃が拍にそろう',seen>0&&off===0,{seen,off});
}
for(const offset of [-161,-81,-79,79,81,161]) {
  const w=world({boss:'bugking'}), j=sim.pressBeat(w,offset);
  const want=Math.abs(offset)<=80?'perfect':Math.abs(offset)<=160?'good':'miss';
  check(offset+'msの判定',j===want,j);
  check(offset+'msの威力',want==='miss'?w.shots.length===0:w.shots.at(-1).dmg===(want==='perfect'?4:2));
  check('同じ拍の連打では判定もコンボも増えない '+offset,sim.pressBeat(w,offset)===null&&w.beat.combo===(want==='miss'?0:1));
}
(() => {
  const learned=[], old=globalThis.RYW.learnQuiet; globalThis.RYW.learnQuiet=id=>learned.push(id);
  const w=world({boss:'bugking'}); w.p.inv=999;
  for(let i=0;i<8;i++){w.beat.phase=10+i;sim.pressBeat(w,0);}
  check('8コンボで4拍フィーバー',w.beat.combo===8&&w.beat.feverUntil-w.beat.phase===4);
  w.shots=[];w.p.fireCd=0;sim.step(w,DT,IDLE);
  check('フィーバーの自動弾は2倍で虹色',w.shots.some(s=>!s.beatShot&&s.dmg===2&&s.fever));
  w.beat.phase=w.beat.feverUntil;w.shots=[];w.p.fireCd=0;sim.step(w,DT,IDLE);
  check('4拍後は通常の自動弾',w.shots.some(s=>s.dmg===1&&!s.fever));
  sim.pressBeat(w,161);check('ミスでコンボ0・最高は残る',w.beat.combo===0&&w.beat.bestCombo===8);
  sim.setCombo(w,4);w.p.inv=0;sim.hurt(w);check('被弾でコンボ0',w.beat.combo===0);
  w.b.hp=w.b.maxHp*.2;sim.step(w,DT,IDLE);
  check('戦闘中の言葉は各1回だけquietで記録',learned.join(',')==='timing,combo,bpm',learned);
  globalThis.RYW.learnQuiet=old;
})();
(() => {
  const normal=world({}), slow=world({options:{cheats:{timescale:true}}});
  [normal,slow].forEach(w=>{w.hitstop=0;w.p.fireCd=999;w.p.inv=999;w.shots=[];sim.addBullet(w,{x:400,y:300,vx:-100,vy:0,r:9});});
  const phase=slow.beat.phase, time=slow.beat.time;
  for(let i=0;i<60;i++){sim.step(normal,DT,IDLE);sim.step(slow,DT,IDLE);}
  check('タイムスケールは弾を0.7倍',Math.abs(normal.eb[0].x-300)<1e-6&&Math.abs(slow.eb[0].x-330)<1e-6);
  check('タイムスケールは拍と判定の時計も0.7倍',Math.abs(slow.beat.time-time-.7)<1e-8&&Math.abs(slow.beat.phase-phase-1.75)<1e-8);
  const god=world({cheats:{godmode:true}});sim.hurt(god);
  check('ゴッドモードでライフは減らない',god.p.hearts===3&&god.stats.hurts===1);
  const wide=world({cheats:{widejudge:true}});
  check('はんていワイドで159msもパーフェクト',sim.pressBeat(wide,159)==='perfect');
  const wide2=world({boss:'jibun',cheats:{widejudge:true}});
  check('はんていワイドのグッド幅',sim.pressBeat(wide2,200)==='good');
  const boxes=world({cheats:{showhitbox:true}});sim.addBullet(boxes,{x:300,y:200,r:9,vx:0,vy:0});
  const rects=sim.hitboxes(boxes);
  check('見える当たり判定は主人公と弾の実際の大きさ',rects.length===2&&rects[0].width===22&&rects[0].y===boxes.p.y-15&&rects[1].width===18);
  check('4つのチートが結果に残る',[slow,god,wide,boxes].every(w=>sim.result(w).cheated)&&!sim.result(normal).cheated);
  const opts=['search'];opts.proto={jump:9};opts.cheats={widejudge:true};const legacy=world({options:opts});
  check('守護霊配列＋proto＋cheatsが共存',legacy.hasOwl&&legacy.settings.proto.jump===9&&legacy.cheats.widejudge);
})();
(() => {
  const w=world({mode:'challenge'});check('チャレンジの開始はBPM100・ライフ3',w.stage===1&&w.beat.bpm===100&&w.p.hearts===3);
  const hp=w.b.maxHp;w.p.hearts=1;sim.setCombo(w,12);sim.win(w);
  check('次のステージで姿・HP・BPM・ライフが変わる',w.stage===2&&w.bossId==='kateino'&&w.b.maxHp>hp&&w.beat.bpm===106&&w.p.hearts===2);
  check('ステージを越えてコンボとスコアを保持',w.beat.bestCombo===12&&w.score===1000);
  [4,5,6,10,20,100].forEach(n=>{
    sim.setStage(w,n); check('stage '+n+' のテンポと姿',w.beat.bpm===Math.min(220,100+6*(n-1))&&w.bossId===Object.keys(B)[(n-1)%5]&&!w.def.immune&&!w.def.through);
  });
  [1,10,20].forEach(n=>{
    const c=world({mode:'challenge',startStage:n,god:true});c.p.fireCd=999;c.p.inv=999;let seen=[];
    for(let i=0;i<900;i++){sim.step(c,DT,IDLE);for(const e of c.eb)if(!e.checked){e.checked=true;seen.push(e.bornBeat);}}
    const sub=n>=20?4:n>=10?2:1, tolerance=c.beat.bpm/60*DT+.0001;
    check('stage '+n+' の'+sub+'分割攻撃',seen.length>0&&seen.every(p=>Math.abs(p-Math.round(p*sub)/sub)<=tolerance)&& (sub===1||seen.some(p=>Math.abs(p-Math.round(p))>.15)),seen.slice(0,8));
  });
  w.god=false;w.p.inv=0;sim.debugSetHearts(w,1);sim.hurt(w);
  const r=sim.result(w);check('チャレンジはライフ0で終了結果',w.state==='lose'&&r.stage===100&&r.bestCombo===12&&r.score===1000&&!r.cheated);
})();
(() => {
  const Proto=require('../v5/js/proto.js');let mini=null;
  const w=world({boss:'kateino',options:{proto:{v:1,jump:9}}});
  w.openPlaytest=done=>{mini=Proto._sim.createSession({mode:'playtest',state:w.settings.proto,onDone:done});};
  sim.step(w,DT,{...IDLE,press:true,skill:true});const frozen=sim.beatInfo(w), play=w.playT;
  check('とくぎで保存したプロトタイプを開く',mini&&mini.state.jump===9&&w.playtest.phase==='game'&&sim.dmgMult(w)===.5);
  for(let i=0;i<119;i++){sim.step(w,DT,IDLE);mini.advance(DT);}
  check('2秒間はボス戦とビートが停止',w.playT===play&&w.beat.phase===frozen.phase&&w.playtest.phase==='game');
  mini.advance(DT);check('2秒のあと「……たのしい」の段階',w.playtest.phase==='reaction'&&sim.dmgMult(w)===.5);
  w.paused=true;sim.step(w,2,IDLE);check('感想の一行も一時停止に従う',w.playtest.left===1);w.paused=false;
  for(let i=0;i<61;i++)sim.step(w,DT,IDLE);
  check('感想のあと、元のひびと10秒2倍',!w.playtest&&sim.dmgMult(w)===2&&Math.abs(w.m.crackUntil-w.playT-10)<.02);
  const fallback=world({boss:'kateino'});sim.step(fallback,DT,{...IDLE,press:true});
  check('Protoが無い時は元のみせる',sim.dmgMult(fallback)===2&&!fallback.playtest);
})();

// Tempo changes should raise the challenge difficulty, not shorten its target beat count.
for(const stage of [1,10,20,30]) for(const rhythm of [false,true]) {
  const w=world({mode:'challenge',startStage:stage}), t=w.beat.time, bpm=w.beat.bpm;let frames=0;
  while(w.stage===stage&&frames++<10000) {
    w.p.inv=999;w.p.x=240;w.p.y=w.b.y+w.def.bodyDY;
    const beat=rhythm&&Math.round(w.beat.phase)>w.beat.lastPress&&Math.abs(w.beat.phase-Math.round(w.beat.phase))<.03;
    sim.step(w,DT,{...IDLE,beat});
  }
  const beats=(w.beat.time-t)*bpm/60;
  check('challenge '+stage+': '+(rhythm?'ビートなら約24拍':'自動なら約60拍'),w.stage===stage+1&&beats>(rhythm?19:54)&&beats<(rhythm?29:66),beats);
}

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
  while (w.state !== 'win' && real < 400) { const inp=w.state === 'play' ? input(w) : {...IDLE}; if(cfg&&cfg.beatBot&&w.state==='play'&&Math.round(w.beat.phase)>w.beat.lastPress&&Math.abs(w.beat.phase-Math.round(w.beat.phase))*60/w.beat.bpm<.02)inp.beat=true; sim.step(w, DT, inp); real += DT; if (w.bossId === 'hikaku') downSum += w.m.down * DT; }
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

const rhythmRows=['bugking','kateino','hikaku'].map(id=>fight(id,{beatBot:true}));
console.log('ビートを押すボット: '+rhythmRows.map(r=>r.boss+' '+r.real+'秒').join(' / '));
rhythmRows.forEach((r,i)=>check(r.boss+': ビートで押すと自動だけより早い',r.win&&r.real<rows[i].real*.8,[r,rows[i]]));

// Exercise the public browser adapter without launching a browser or adding a dependency.
// AudioContext and RAF have separate clocks so an accidental return to frame-time music fails.
async function browserAdapterChecks() {
  const fs=require('node:fs'),vm=require('node:vm');
  const drawn=[], tones=[], frames=new Map();let fid=0, now=0;
  function events(o){o.events={};o.addEventListener=(k,f)=>(o.events[k]||(o.events[k]=[])).push(f);o.removeEventListener=(k,f)=>o.events[k]=(o.events[k]||[]).filter(x=>x!==f);o.fire=(k,extra={})=>{const e={type:k,target:o,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...extra};for(const f of o.events[k]||[])f(e);};return o;}
  function canvasContext(){const c={font:'24px sans-serif',measureText(t){return{width:[...String(t)].reduce((a,ch)=>a+(ch.charCodeAt(0)<128?.58:1),0)*(parseFloat(this.font.match(/([\d.]+)px/)?.[1])||24)};},fillText(t,x,y){drawn.push({text:t,x,y,font:this.font});},createLinearGradient(){return{addColorStop(){}};},createRadialGradient(){return{addColorStop(){}};},createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};}};return new Proxy(c,{get:(t,k)=>k in t?t[k]:()=>{}});}
  class El {
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.className='';this.hidden=false;this.attrs={};events(this);}
    appendChild(c){c.parentNode=this;this.children.push(c);return c;}
    removeChild(c){this.children=this.children.filter(x=>x!==c);c.parentNode=null;}
    remove(){if(this.parentNode)this.parentNode.removeChild(this);}
    replaceChildren(...kids){this.children=[];kids.forEach(c=>this.appendChild(c));}
    setAttribute(k,v){this.attrs[k]=v;if(k==='class')this.className=v;}
    getAttribute(k){return this.attrs[k];}
    focus(){doc.activeElement=this;}
    setPointerCapture(){}
    getContext(){return this.ctx||(this.ctx=canvasContext());}
    getBoundingClientRect(){return{left:0,top:0,right:540,bottom:960,width:540,height:960};}
    matches(s){if(s==='button[data-choice]')return this.tagName==='BUTTON'&&this.attrs['data-choice'];return s[0]==='.'?this.className.split(' ').includes(s.slice(1)):this.tagName===s.toUpperCase();}
    closest(s){return this.matches(s)?this:this.parentNode?.closest(s);}
    querySelectorAll(s){const parts=s.split(' ');const all=[];const walk=n=>{for(const c of n.children){if(c.matches(parts.at(-1))&&(parts.length===1||c.parentNode?.closest(parts[0])))all.push(c);walk(c);}};walk(this);return all;}
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
    set innerHTML(html){this.children=[];const stack=[this];for(const m of html.matchAll(/<([^>]+)>/g)){const token=m[1];if(token[0]==='/'){stack.pop();continue;}const el=new El(token.split(/\s/)[0]);for(const a of token.matchAll(/([\w-]+)="([^"]*)"/g))el.setAttribute(a[1],a[2]);el.hidden=/\bhidden\b/.test(token);stack.at(-1).appendChild(el);stack.push(el);}}
  }
  const doc=events({hidden:false,currentScript:{src:'https://test.invalid/v5/js/shooter.js'},createElement:t=>new El(t)});
  doc.body=new El('body');doc.head=new El('head');doc.querySelector=s=>doc.body.querySelector(s);
  class Audio {
    constructor(){this.currentTime=0;this.state='running';this.sampleRate=1000;Audio.instances.push(this);}
    resume(){this.state='running';return Promise.resolve();} suspend(){this.state='suspended';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
    createGain(){return{gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
    createBuffer(){return{getChannelData:()=>new Float32Array(500)};}
    createOscillator(){const n={frequency:{setValueAtTime(f){n.freq=f;},exponentialRampToValueAtTime(){}},connect(){},start(at){tones.push({at,freq:n.freq,type:n.type});},stop(){},disconnect(){}};return n;}
    createBufferSource(){return{connect(){},start(){},stop(){}};}
    createBiquadFilter(){return{frequency:{value:0},connect(){}};}
  }
  Audio.instances=[];
  const win=events({document:doc,console,URL,location:{href:'https://test.invalid/v5/'},innerWidth:540,innerHeight:960,devicePixelRatio:1,
    performance:{now:()=>now},AudioContext:Audio,requestAnimationFrame:f=>{frames.set(++fid,f);return fid;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:()=>0,fetch:async()=>({ok:false}),Image:class{set src(v){queueMicrotask(()=>this.onerror?.());}}});
  win.window=win;const ctx=vm.createContext(win);
  for(const f of ['v5/data/words.js','v5/js/proto.js','v5/js/shooter.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx);
  const R=win.RYW;let audioOn=false,paused=[] ,resumed=[],changed=[];
  const platform={isAudioEnabled:()=>audioOn,onPause:f=>paused.push(f),onResume:f=>resumed.push(f),onAudioChange:f=>changed.push(f)};
  async function ready(){for(let i=0;i<40;i++)await Promise.resolve();}
  function tick(ms,ams=ms){now+=ms;Audio.instances.forEach(a=>{if(a.state==='running')a.currentTime+=ams/1000;});const queue=[...frames.values()];frames.clear();for(const f of queue)f(now);}
  async function advance(sec){for(let i=0;i<Math.ceil(sec*60);i++){tick(1000/60);await ready();}}
  const learned=[],cards=[];R.learnQuiet=id=>learned.push(id);R.prepareBossWords=ids=>{cards.push(ids.slice());return [];};
  let ended=null,won=null;
  let handle=R.Shooter.start({boss:'bugking',platform,options:{cheats:{timescale:true}},onWin:r=>won=r});await ready();await advance(4);
  check('公開入口はbeat/notesを最初の2語にする',cards[0].slice(0,2).join(',')==='beat,notes');
  const before=win.__shooter.debugBeat();await advance(1);const after=win.__shooter.debugBeat();
  check('公開入口は音オフでもビートが進む',Math.abs(after.time-before.time-.7)<.001);
  paused.forEach(f=>f());const hold=win.__shooter.debugBeat();win.fire('keydown',{code:'KeyZ'});doc.querySelector('.rs-beat').fire('pointerdown');await advance(1);
  check('公開入口のpauseは入力と時計を止める',win.__shooter.debugBeat().time===hold.time&&win.__shooter.debugBeat().combo===0);
  resumed.forEach(f=>f());await advance(.1);check('pause中のビートが復帰後に発射されない',win.__shooter.debugBeat().combo===0);
  audioOn=true;changed.forEach(f=>f(true));win.fire('keydown',{code:'ArrowUp'});tick(1000/60);win.fire('keyup',{code:'ArrowUp'});
  const at=win.__shooter.debugBeat();for(let i=0;i<30;i++)tick(1000/60,1000/30);
  check('音ありではRAFではなくAudioContextの時刻が進む',Math.abs(win.__shooter.debugBeat().time-at.time-.7)<.001);
  const p0=win.__shooter.player;doc.querySelector('.rs-beat').fire('pointerdown',{pointerId:1});tick(1000/60);
  check('ビートボタンでは主人公が移動しない',JSON.stringify(win.__shooter.player)===JSON.stringify(p0));
  const startTone=tones.length;await advance(2);const bass=tones.slice(startTone).filter(t=>t.type==='triangle'&&t.freq<300);
  check('musicTickはタイムスケール込みの半拍間隔',bass.length>=5&&bass.slice(1).every((t,i)=>Math.abs(t.at-bass[i].at-30/150/.7)<.025),bass.map(t=>t.at));
  win.__shooter.debugSetBossHp(280);await advance(.1);const fastStart=tones.length;await advance(2);const fast=tones.slice(fastStart).filter(t=>t.type==='triangle'&&t.freq<300);
  check('BPMが上がると曲の間隔も縮む',win.__shooter.debugBeat().bpm===158&&fast.length>=5&&fast.slice(1).every((t,i)=>Math.abs(t.at-fast[i].at-30/158/.7)<.025));
  win.__shooter.debugWin();await advance(7);check('onWinにcheatedが入る',won&&won.cheated===true&&handle.state==='closed');
  handle=R.Shooter.start({boss:'kateino',platform,options:{proto:{jump:9}}});await ready();await advance(3);
  win.fire('keydown',{code:'KeyX'});tick(1000/60);win.fire('keyup',{code:'KeyX'});await ready();
  const mini=doc.querySelector('.ryw-proto');const bt=win.__shooter.debugBeat();
  check('公開プレイテストは保存の状態・前面・下帯上のrectを使う',mini&&mini.style.zIndex==='2147483001'&&mini.style.clipPath.includes('356px')&&win.__proto.debugState().jump===9);
  await advance(1);check('実際のProto表示中にボス時計が止まる',win.__shooter.debugBeat().time===bt.time&&!win.__proto.debugState().closed);
  paused.forEach(f=>f());const miniTime=win.__proto.debugState().elapsed;await advance(1);
  check('ホストpauseはProtoにも届く',win.__proto.debugState().elapsed===miniTime);resumed.forEach(f=>f());
  await advance(1.2);check('2秒でProtoを閉じて感想を表示',!doc.querySelector('.ryw-proto')&&drawn.some(d=>d.text==='……たのしい')&&win.__shooter.crack===0);
  await advance(1);check('感想のあと10秒の効果が始まる',win.__shooter.crack>9);
  handle.stop();
  for(const n of [1,2,3,4,5,10,20]){
    drawn.length=0;handle=R.Shooter.start({mode:'challenge',startStage:n,platform,onEnd:r=>ended=r});await ready();await advance(3);
    check('stage '+n+' は通常戦の誤説明を描かない',!drawn.some(d=>/ダメージ はんぶん|つながり|たまは とどかない|こうげきが きかない/.test(d.text)));
    check('stage '+n+' は不要なとくぎを隠す',doc.querySelector('.rs-skill').hidden);
    if(n===20){win.__shooter.debugCombo(12);win.__shooter.debugSetHearts(0);await advance(1.2);check('onEndは到達stage/コンボ/score/cheatedを返す',ended&&ended.stage===20&&ended.bestCombo===12&&typeof ended.score==='number'&&ended.cheated===false);}
    handle.stop();
  }
  handle=R.Shooter.start({boss:'kateino',platform});await ready();await advance(3);win.fire('keydown',{code:'KeyX'});tick(1000/60);handle.stop();
  check('stopは開いているProtoも閉じる',!doc.querySelector('.ryw-proto'));
}

browserAdapterChecks().then(()=>{
  if (verbose) console.log(JSON.stringify({ rows, fullRows, kidRows }));
  console.log(`test_shooter: ${passed} ok, ${failed} failed`);
  process.exitCode=failed?1:0;
}).catch(e=>{console.error(e);process.exitCode=1;});
