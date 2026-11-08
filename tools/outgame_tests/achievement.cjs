// og-achievement: the 12 achievements, the view-only きろく window and its title/menu rows, the toast
// after saveGame, and that "はじめから" (a fresh save) wipes them along with everything else.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clone = v => JSON.parse(JSON.stringify(v));
// Every save field eventCheck/COUNTS read, for building a synthetic save without full gameplay.
const emptySave = () => ({ flags: {}, items: {}, summons: [], bosses: [], bonds: {}, words: [], challenge: { best: { stage: 0, bestCombo: 0 }, bestCheat: { stage: 0, bestCombo: 0 } }, mode: 'adult' });
// The exact key set snapshot() wrote before og-achievement; a change here means snapshot() moved.
const SNAPSHOT_KEYS = ['version', 'saveVersion', 'towns', 'started', 'chapter', 'map', 'x', 'y', 'dir', 'level', 'exp', 'hp', 'battery', 'money', 'items', 'summons', 'bosses', 'flags', 'weapons', 'bonds', 'met', 'words', 'proto', 'shop', 'cheats', 'challenge', 'gifts', 'aiName', 'mode'].sort();

module.exports = async function achievement({ runtime, result, assert, root }) {
  let raw = null;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'data', 'outgame.js'), 'utf8'), { RYW: { registerOutGame: t => { raw = clone(t); } } });
  const OG = r => r.RYW.OutGame;
  const toast = r => r.els.get('toast');

  // --- The table: a view-only row (no `challenge`, no `do:'start'`), its view, and 12 achievements ---
  {
    const row = raw.items.find(it => it.id === 'records');
    assert(row, 'a records row exists');
    assert.deepEqual(row, { id: 'records', do: 'view', view: 'records', label: ['実績 {earned}/{total}', 'じっせき {earned}/{total}'], in: ['title', 'menu'], when: { save: true } });
    assert(!raw.items.some(it => it.id === 'challenge' || it.do === 'start'), 'no challenge row, no do:start: the title window is view-only');
    assert.deepEqual(raw.views.records, { title: ['実績と記録', 'じっせきと きろく'], body: 'records', slot: 'records' });
    assert.equal(raw.achievements.length, 12, '12 achievements');
    const ids = raw.achievements.map(a => a.id);
    assert.equal(new Set(ids).size, 12, 'all 12 ids are distinct: ' + ids.join());
    // R408: every name reads as something already done (past tense), so a ★ row never looks like a goal still ahead.
    for (const a of raw.achievements) for (const n of a.name) assert(/(た|だ)$/.test(n), 'achievement name is past tense: ' + n);
    // R438: the zero row said 「ゼロと作った」 without what was made (and read like 「ゼロから作った」); it names the reconciliation instead.
    assert.deepEqual(raw.achievements.find(a => a.id === 'zero').name, ['ゼロと分かり合えた', 'ゼロと わかりあえた'], 'R438: the zero achievement names the reconciliation');
    assert(!raw.achievements.some(a => a.name.some(n => n.includes('作った') || n.includes('つくった'))), 'R438: no achievement says 作った without what');
    // R441: the bond3 row said 「守護霊が一緒に飛んだ」, which neither told what to do nor was true before a boss fight; it names its condition like bond5.
    assert.deepEqual(raw.achievements.find(a => a.id === 'bond3').name, ['きずなが♥3になった', 'きずなが ♥3に なった'], 'R446: bond3 says it is the bond heart, not the boss-fight life hearts');
    // R446: both bond rows share one form that names the bond heart, so neither reads as the boss-fight life hearts.
    for (const a of raw.achievements.filter(a => a.when.count === 'bondMax')) assert(a.name.every(n => new RegExp('^きずなが ?♥' + a.when.atLeast + 'に').test(n)), 'R441/R446: a bond row starts with きずなが♥' + a.when.atLeast + ': ' + a.name);
    assert(!raw.achievements.some(a => a.name.some(n => n.startsWith('ハート'))), 'R446: no achievement starts with a bare ハート');
  }
  result.push('og-achievement: the records row is view-only (no challenge row, no do:start) and ships 12 distinct achievements PASS');

  // --- Every `when` names a real boss/summon in GAME_DATA, and atLeast stays inside what the game can reach ---
  {
    const r = await runtime();
    r.tick();
    const D = r.g.GAME_DATA;
    const totalWords = Object.keys(r.RYW.words || {}).length;
    for (const a of raw.achievements) {
      if (a.when.boss) assert(D.enemies[a.when.boss]?.boss, a.id + ': ' + a.when.boss + ' is a boss in GAME_DATA');
      if (a.when.summon) assert(Object.hasOwn(D.summons, a.when.summon), a.id + ': ' + a.when.summon + ' is a summon in GAME_DATA');
      if (a.when.count === 'words') assert(a.when.atLeast <= totalWords, a.id + ': atLeast ' + a.when.atLeast + ' is at most the ' + totalWords + ' words the game has');
      if (a.when.count === 'bondMax') assert(a.when.atLeast <= 5, a.id + ': a bond tops out at 5');
    }
    assert.equal(totalWords, 65, 'sanity: the game still has 65 words (design_a.md 4.2)');
  }
  result.push('og-achievement: every boss/summon in `when` is real in GAME_DATA, and every atLeast stays inside what a save can reach PASS');

  // --- earned(): every row fires on a save that satisfies it, and none fire on an empty save ---
  {
    const r = await runtime();
    r.tick();
    const earned = OG(r)._sim.earned;
    assert.equal(earned(null).length, 0, 'no save: nothing earned');
    assert.equal(earned(emptySave()).length, 0, 'an empty save earns nothing');
    const satisfy = {
      ch1: s => s.bosses.push('bugking'), ch2: s => s.bosses.push('kateino'), ch3: s => s.bosses.push('hikaku'),
      jibun: s => s.bosses.push('jibun'), zero: s => s.summons.push('zero'),
      word10: s => { s.words = Array.from({ length: 10 }, (_, i) => 'w' + i); },
      word40: s => { s.words = Array.from({ length: 40 }, (_, i) => 'w' + i); },
      bond3: s => { s.bonds.mother = 3; }, bond5: s => { s.bonds.mother = 5; },
      stage5: s => { s.challenge.best.stage = 5; }, stage10: s => { s.challenge.best.stage = 10; },
      combo50: s => { s.challenge.best.bestCombo = 50; },
    };
    assert.equal(Object.keys(satisfy).length, 12, 'this test covers all 12 ids');
    for (const a of raw.achievements) {
      const save = emptySave();
      satisfy[a.id](save);
      const got = earned(save).map(x => x.id);
      assert(got.includes(a.id), a.id + ' is earned once its condition holds: ' + got.join());
    }
    // A condition one short of atLeast does not fire.
    const short = emptySave(); short.challenge.best.stage = 4;
    assert(!earned(short).some(a => a.id === 'stage5'), 'stage 4 does not earn stage5 (atLeast 5)');
  }
  result.push('og-achievement: every row is earned on a save that satisfies its `when`, none on an empty save, and atLeast is a hard floor PASS');

  // --- snapshot()'s key list has not moved, and an old save (no OutGame field of its own) still loads and counts right away ---
  {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    r.g.state.bosses.push('bugking');
    await r.g.save();
    const keys = Object.keys(JSON.parse(r.saved.get('ryoseiworld-rpg-v5'))).sort();
    assert.equal(keys.join(), SNAPSHOT_KEYS.join(), 'snapshot() still writes exactly these keys');

    // stage/combo both stay under their own atLeast so only ch1 (the boss) is earned; this isolates
    // "an old save is read as-is, with no migration of its own" from the unrelated count achievements.
    const old = { version: 5, saveVersion: 2, towns: [1], started: true, chapter: 1, map: 'town', x: 100, y: 100, dir: 0, level: 3, exp: 0, hp: 40, battery: 80, money: 50, items: {}, summons: ['nao'], bosses: ['bugking'], flags: { tutorial: true, cleared: true }, weapons: ['fuku'], bonds: {}, met: [], words: ['status', 'item'], proto: {}, shop: { debugmode: false }, cheats: {}, challenge: { best: { stage: 0, bestCombo: 0 }, bestCheat: { stage: 0, bestCombo: 0 } }, gifts: {}, aiName: 'ソラ', mode: 'adult' };
    const reloaded = await runtime({ saved: new Map([['ryoseiworld-rpg-v5', JSON.stringify(old)]]) });
    reloaded.tick();
    assert.equal(OG(reloaded)._sim.earned(old).map(a => a.id).sort().join(), ['ch1'].join(), 'an old save earns exactly what it already qualifies for, read as-is, with no migration');
    assert(reloaded.els.get('title-links').children[0]?.textContent.startsWith('実績 1/12'), '実績 1/12 shows on the title band for a save that already qualifies for one row');
  }
  result.push('og-achievement: snapshot() keeps its key list, and an old save earns its rows and shows the title band the moment it is read PASS');

  // --- Title → きろく, menu → きろく: both open the same view-only window, with the best record and the achievement list ---
  {
    const r = await runtime();
    r.tick();
    const band = () => r.els.get('title-links').children;
    assert.equal(band().length, 0, 'no save yet: no 記録 row on a brand-new title');
    r.g.debugStartChapter(1);
    r.g.state.bosses.push('bugking');
    r.g.state.words.push('status', 'item', 'iap');
    // Under atLeast 5 for stage5, so this block earns only ch1: the record text and the achievement list stay easy to count apart.
    r.g.state.challenge.best = { stage: 3, bestCombo: 4 };
    await r.g.save();
    toast(r).hidden = true; toast(r).textContent = ''; // the save toast is not what this block checks
    r.click('menu-btn');
    const labels = () => r.els.get('modal-buttons').children.map(b => b.textContent);
    const recordsLabel = labels().find(t => t.startsWith('実績 '));
    assert.equal(recordsLabel, '実績 1/12', 'the 実績 row in the menu counts what this save has earned so far: ' + labels().join('|'));
    r.button(recordsLabel);
    assert.equal(r.g.modal, 'og-records', 'the records window opens');
    const copy = r.els.get('modal-copy').textContent;
    assert(copy.includes('最高ステージ3') && copy.includes('最高コンボ4'), 'the best challenge record shows: ' + copy);
    assert(copy.includes('BUG KING を静めた'), 'the earned row names itself: ' + copy);
    assert(copy.includes('？？？'), 'an un-earned secret row still shows as ？？？: ' + copy);
    // R404: earned rows carry the filled ★, the rest the hollow ☆ and the word まだ, so the two are told apart without a legend.
    const rowLines = copy.split('\n').filter(l => /^[★☆] /.test(l));
    assert.equal(rowLines.length, 12, 'every achievement row starts with ★ or ☆: ' + JSON.stringify(copy));
    assert.equal(rowLines.filter(l => l.startsWith('★ ')).length, 1, 'only the one earned row is ★ (it matches 記録 1/12): ' + JSON.stringify(rowLines));
    // R419: adult mode says 未達成, so a past-tense name is never followed by まだ.
    assert(rowLines.filter(l => l.startsWith('☆ ')).every(l => l.endsWith('（未達成）')), 'every un-earned row says 未達成: ' + JSON.stringify(rowLines));
    assert(!copy.includes('（まだ）'), 'adult mode no longer pairs a done-form name with まだ: ' + JSON.stringify(rowLines));
    assert(rowLines.find(l => l.includes('BUG KING を静めた')).startsWith('★ '), 'the earned BUG KING row is the ★ one');
    // R421: earned rows are listed before every un-earned one.
    const firstHollow = rowLines.findIndex(l => l.startsWith('☆ '));
    assert(rowLines.slice(firstHollow).every(l => l.startsWith('☆ ')), 'R421: every ★ row comes before the first ☆ row: ' + JSON.stringify(rowLines));
    assert(!copy.includes('・ '), 'the old ・ mark is gone');
    assert(!copy.includes('ジブンと向き合った') && !copy.includes('ゼロと分かり合えた'), 'secret rows stay hidden until earned');
    assert.equal(copy.split('\n').filter(l => l.trim()).length - 2, 12, '12 achievement lines plus the two best-record lines: ' + JSON.stringify(copy));
    r.button('戻る');
    assert.equal(r.g.modal, 'menu', 'back returns to the menu, not the field');
  }
  result.push('og-achievement: きろく from the menu shows the best record and all 12 rows, secret ones as ？？？ until earned PASS');

  // --- The same records row also works from the title, before restore() has run, reading the loaded save ---
  {
    const old = { version: 5, saveVersion: 2, towns: [1], started: true, chapter: 1, map: 'town', x: 100, y: 100, dir: 0, level: 3, exp: 0, hp: 40, battery: 80, money: 50, items: {}, summons: ['nao'], bosses: ['bugking'], flags: { tutorial: true, cleared: true }, weapons: ['fuku'], bonds: {}, met: [], words: [], proto: {}, shop: { debugmode: false }, cheats: {}, challenge: { best: { stage: 0, bestCombo: 0 }, bestCheat: { stage: 0, bestCombo: 0 } }, gifts: {}, aiName: 'ソラ', mode: 'kids' };
    const r = await runtime({ saved: new Map([['ryoseiworld-rpg-v5', JSON.stringify(old)]]) });
    r.tick();
    assert.equal(r.g.screen, 'title', 'still on the title: restore() has not run');
    const band = () => r.els.get('title-links').children;
    assert.equal(band().length, 1, 'the きろく row shows on the title too');
    assert.equal(band()[0].textContent, 'じっせき 1/12', 'kids label (the save is a kids-mode one)');
    band()[0].click();
    assert.equal(r.g.modal, 'og-records', 'it opens from the title, no つづきから needed');
    const copy = r.els.get('modal-copy').textContent;
    assert(copy.includes('BUG KING を しずめた'), 'the earned row names itself in kids text: ' + copy);
    assert(copy.includes('ことばを 10こ あつめた（まだ）') && !copy.includes('未達成'), 'R419: kids rows keep the short まだ: ' + copy);
    assert(!copy.includes('最高ステージ'), 'no challenge has ever been played: no best-record line (recordsText returns empty)');
    r.button('もどる');
    assert.equal(r.g.screen, 'title', 'back returns to the title, unchanged');
  }
  result.push('og-achievement: きろく from the title (before つづきから) reads the loaded save, kids text by default, no best record when none was ever played PASS');

  // --- R421: an earned row late in the data (stage5) is listed right after the other earned rows, above every ☆ row ---
  {
    const old = { version: 5, saveVersion: 2, towns: [1], started: true, chapter: 1, map: 'town', x: 100, y: 100, dir: 0, level: 3, exp: 0, hp: 40, battery: 80, money: 50, items: {}, summons: ['nao'], bosses: ['bugking'], flags: { tutorial: true, cleared: true }, weapons: ['fuku'], bonds: {}, met: [], words: [], proto: {}, shop: { debugmode: false }, cheats: {}, challenge: { best: { stage: 5, bestCombo: 3 }, bestCheat: { stage: 0, bestCombo: 0 } }, gifts: {}, aiName: 'ソラ', mode: 'adult' };
    const r = await runtime({ saved: new Map([['ryoseiworld-rpg-v5', JSON.stringify(old)]]) });
    r.tick();
    r.els.get('title-links').children[0].click();
    assert.equal(r.g.modal, 'og-records', 'R421: the records window opens from the title');
    const rows = r.els.get('modal-copy').textContent.split('\n').filter(l => /^[★☆] /.test(l));
    assert.equal(rows.length, 12, 'R421: all 12 rows: ' + JSON.stringify(rows));
    assert.deepEqual(rows.slice(0, 2), ['★ BUG KING を静めた', '★ ステージ5に届いた'], 'R421: the two earned rows come first, in data order: ' + JSON.stringify(rows));
    assert(rows.slice(2).every(l => l.startsWith('☆ ')), 'R421: the rest are un-earned: ' + JSON.stringify(rows));
    assert.equal(rows[2], '☆ カテイノジジョウを静めた（未達成）', 'R421: un-earned rows keep their data order: ' + JSON.stringify(rows));
  }
  // R458: the boss rows that are not secret all use the same verb (1章 used 修理した while 2章・3章 used 静めた).
  {
    const boss = raw.achievements.filter(a => a.when && a.when.boss && !a.secret);
    assert(boss.length >= 3 && boss.every(a => a.name[0].endsWith('を静めた') && a.name[1].endsWith('を しずめた')), 'R458: boss rows share 静めた: ' + JSON.stringify(boss.map(a => a.name)));
  }
  result.push('og-achievement: R458 the boss rows all read 〜を静めた / 〜を しずめた PASS');
  result.push('og-achievement: R421 earned rows are listed first, so stage5 sits right under BUG KING above every ☆ row PASS');

  // --- The toast: #toast, after the save toast clears, never on title/ending/epilogue, and not replayed later ---
  {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    r.g.state.words.push('status', 'item', 'iap', 'wifi', 'hp', 'cast', 'jump', 'run', 'attack', 'save');
    await r.g.save();
    const saveText = toast(r).textContent;
    assert(!saveText.startsWith('実績'), 'right after save() the toast is the save message, not the achievement one: ' + saveText);
    r.tick(2700);
    assert(toast(r).textContent.startsWith('実績：言葉を10個集めた'), 'the achievement toast follows once the save toast would have cleared: ' + toast(r).textContent);
    r.tick(2700);
    assert(toast(r).hidden, 'the achievement toast clears on its own too');
  }
  result.push('og-achievement: the achievement toast uses #toast and waits for the save toast to clear before showing PASS');

  // R451: the label reads 実績：… with a full-width colon like 今のモード：おとな; kids mode reads じっせき：….
  {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    r.g.state.mode = 'kids';
    r.RYW.setMode('kids');
    r.g.state.words.push('status', 'item', 'iap', 'wifi', 'hp', 'cast', 'jump', 'run', 'attack', 'save');
    await r.g.save();
    r.tick(2700);
    const text = toast(r).textContent;
    assert(text.startsWith('じっせき：ことばを 10こ あつめた') && !text.includes(':'), 'R451: the kids achievement toast reads じっせき：…: ' + text);
  }
  result.push('R451: 実績のお知らせが「実績：」「じっせき：」と全角のコロンで出る PASS');

  // R401: a window open over the field (the challenge record, the menu) sat right under #toast and hid its heading,
  // so the achievement waits for the window to close.
  {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    r.tick(300);
    r.click('menu-btn');
    assert.equal(r.g.modal, 'menu', 'the menu window is open');
    r.g.state.words.push('status', 'item', 'iap', 'wifi', 'hp', 'cast', 'jump', 'run', 'attack', 'save');
    await r.g.save();
    r.tick(2700);
    r.tick(2700);
    assert(!(!toast(r).hidden && toast(r).textContent.startsWith('実績')), 'no achievement toast over the open window: ' + toast(r).textContent);
    r.button('戻る');
    assert.equal(r.g.modal, '', 'the menu window closed');
    r.tick(600);
    assert(!toast(r).hidden && toast(r).textContent.startsWith('実績：言葉を10個集めた'), 'the achievement shows once the window closes: ' + toast(r).textContent);
  }
  result.push('og-achievement: the achievement toast waits while a window is open, then shows PASS');

  // R405: an achievement earned during the challenge run was still showing when the result window opened, and covered
  // the heading 「チャレンジの記録」. A window that opens over a showing achievement takes it back until it closes.
  {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    r.tick(300);
    r.g.state.words.push('status', 'item', 'iap', 'wifi', 'hp', 'cast', 'jump', 'run', 'attack', 'save');
    await r.g.save();
    r.tick(2700);
    assert(!toast(r).hidden && toast(r).textContent.startsWith('実績：言葉を10個集めた'), 'the achievement is showing: ' + toast(r).textContent);
    r.click('menu-btn');
    assert.equal(r.g.modal, 'menu', 'a window opened while the achievement showed');
    assert(toast(r).hidden, 'the achievement no longer covers the window heading');
    r.tick(3000);
    assert(toast(r).hidden, 'it stays back while the window is open');
    r.button('戻る');
    r.tick(600);
    assert(!toast(r).hidden && toast(r).textContent.startsWith('実績：言葉を10個集めた'), 'it shows again once the window closes: ' + toast(r).textContent);
    r.tick(2700);
    assert(toast(r).hidden, 'and clears on its own');
  }
  result.push('og-achievement: a showing achievement steps back when a window opens and shows again after PASS');

  {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    r.g.state.bonds.mother = 3;
    r.g.state.bonds.sister = 5;
    await r.g.save();
    r.tick(2700);
    assert(toast(r).textContent.startsWith('実績：'), 'the first of two achievements earned together shows');
    const first = toast(r).textContent;
    r.tick(2700);
    assert(toast(r).textContent.startsWith('実績：') && toast(r).textContent !== first, 'the second follows staggered, not merged: ' + toast(r).textContent);
  }
  result.push('og-achievement: two achievements earned in the same save() toast one after another, not merged PASS');

  {
    const r = await runtime();
    r.tick();
    assert.equal(r.g.screen, 'title', 'still on the title');
    const before = toast(r).textContent;
    OG(r).onSaved(null, { ...emptySave(), bosses: ['bugking'] });
    r.tick(6000);
    assert.equal(toast(r).textContent, before, 'no toast on the title screen, even much later: the row still shows once the records window opens instead');
  }
  result.push('og-achievement: an achievement earned on the title screen never toasts PASS');

  {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    r.g.state.flags.cleared = true;
    r.g.debugEvent([{ chapterClear: true, copy: 'x' }]);
    assert.equal(r.g.screen, 'ending', 'on the ending screen (the chapter card)');
    const before = toast(r).textContent;
    OG(r).onSaved(null, { ...emptySave(), bosses: ['bugking'] });
    r.tick(6000);
    assert.equal(toast(r).textContent, before, 'no toast on the ending screen either');
  }
  result.push('og-achievement: an achievement earned on the ending screen never toasts, and is not replayed later PASS');

  // R402: a toast already showing on the field (the achievement, the save) stayed over THE END after the screen changed.
  {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    r.g.state.words.push('status', 'item', 'iap', 'wifi', 'hp', 'cast', 'jump', 'run', 'attack', 'save');
    await r.g.save();
    r.tick(2700);
    assert(!toast(r).hidden && toast(r).textContent.startsWith('実績'), 'the achievement toast is showing on the field: ' + toast(r).textContent);
    r.g.state.flags.cleared = true;
    r.g.debugEvent([{ chapterClear: true, copy: 'x' }]);
    assert.equal(r.g.screen, 'ending', 'on the ending screen');
    assert(toast(r).hidden, 'the toast from the field is cleared when the ending opens');
    r.tick(16);
    assert(toast(r).hidden, 'and stays cleared on the next frame');
  }
  result.push('og-achievement: a toast left from the field is cleared when the ending screen opens PASS');

  // --- はじめから wipes the achievements along with the rest of the save (confirm text already says so) ---
  {
    const r = await runtime();
    r.tick();
    r.g.debugStartChapter(1);
    r.g.state.bosses.push('bugking');
    await r.g.save();
    assert(OG(r)._sim.earned(r.g.state).length > 0, 'something is earned before はじめから');
    r.click('start-btn');
    const copy = r.els.get('modal-copy')?.textContent || r.els.get('modal-body')?.textContent || '';
    assert(/前の記録は消えます/.test(copy) || /まえの きろくは きえます/.test(copy), 'はじめから warns the old records will be erased: ' + copy);
  }
  result.push('og-achievement: はじめから warns that the old records are erased, matching that a fresh save earns nothing PASS');
};
